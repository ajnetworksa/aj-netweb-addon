#!/usr/bin/env python3
"""
AJ Netweb Intercom & Door Station Studio - Server & Background Event Engine
Manages Hikvision/Dahua Door Stations, Real-Time Doorbell Chimes, Remote Unlocks & Visitor History.
"""

import json
import logging
import os
import sys
import threading
import time
import urllib.parse
from datetime import datetime, timezone
from http.server import HTTPServer, SimpleHTTPRequestHandler
from socketserver import ThreadingMixIn
from threading import Lock

from intercom_dahua import DahuaIntercomClient
from intercom_hikvision import HikvisionIntercomClient

logging.basicConfig(level=logging.INFO, format="[%(asctime)s] %(levelname)s [%(name)s]: %(message)s")
log = logging.getLogger("intercom.server")

OPTIONS_FILE = "/data/options.json"
DATA_DIR = "/data/intercom"
VISITORS_DIR = "/data/intercom/visitors"
HISTORY_FILE = "/data/intercom/visitor_history.json"
HA_WWW_DIR = "/config/www/ajnetweb_intercom"
WWW_DIR = os.path.join(os.path.dirname(__file__), "www")
PORT = int(os.environ.get("INGRESS_PORT", 8097))

os.makedirs(VISITORS_DIR, exist_ok=True)
try:
    if os.path.exists("/config/www"):
        os.makedirs(HA_WWW_DIR, exist_ok=True)
except Exception as _e:
    pass

_state_lock = Lock()
_active_client = None
_client_brand = None
_config_cache = {}
_event_subscribers = []  # List of SSE response queues
_event_thread = None
_ha_action_thread = None
_last_ring_time = 0


class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def load_config() -> dict:
    """Load settings from environment and /data/options.json."""
    cfg = {
        "brand": os.environ.get("INTERCOM_BRAND", "auto"),
        "host": os.environ.get("INTERCOM_HOST", ""),
        "http_port": int(os.environ.get("INTERCOM_HTTP_PORT", 80) or 80),
        "rtsp_port": int(os.environ.get("INTERCOM_RTSP_PORT", 554) or 554),
        "username": os.environ.get("INTERCOM_USERNAME", "admin"),
        "password": os.environ.get("INTERCOM_PASSWORD", ""),
        "door_1_name": os.environ.get("DOOR_1_NAME", "Main Gate"),
        "door_2_name": os.environ.get("DOOR_2_NAME", "Pedestrian Door"),
        "unlock_duration_sec": int(os.environ.get("UNLOCK_DURATION", 3) or 3),
        "auto_snapshot_on_ring": os.environ.get("AUTO_SNAPSHOT", "true").lower() == "true",
        "ha_notify_on_ring": os.environ.get("HA_NOTIFY", "true").lower() == "true",
        "push_notify_mode": os.environ.get("PUSH_NOTIFY_MODE", "all_mobile_devices"),
        "critical_push_sound": os.environ.get("CRITICAL_PUSH_SOUND", "true").lower() == "true",
        "log_level": os.environ.get("LOG_LEVEL", "info"),
    }
    if os.path.exists(OPTIONS_FILE):
        try:
            with open(OPTIONS_FILE) as f:
                opts = json.load(f)
                for k, v in opts.items():
                    if v is not None and v != "":
                        cfg[k] = v
        except Exception as e:
            log.warning("Could not read options.json: %s", e)
    return cfg


def save_config(new_cfg: dict):
    """Save options and re-initialize client."""
    cur = load_config()
    cur.update(new_cfg)
    try:
        os.makedirs(os.path.dirname(OPTIONS_FILE), exist_ok=True)
        with open(OPTIONS_FILE, "w") as f:
            json.dump(cur, f, indent=2)
    except Exception as e:
        log.error("Could not write options.json: %s", e)
    init_client(cur)


def init_client(cfg: dict = None):
    """Initialize or update Door Station client and start background listener."""
    global _active_client, _client_brand, _config_cache
    with _state_lock:
        if cfg is None:
            cfg = load_config()
        _config_cache = cfg

        host = cfg.get("host", "").strip()
        if not host:
            _active_client = None
            _client_brand = None
            log.info("No Door Station host configured yet.")
            return

        brand = cfg.get("brand", "auto").lower()
        http_port = int(cfg.get("http_port", 80) or 80)
        rtsp_port = int(cfg.get("rtsp_port", 554) or 554)
        user = cfg.get("username", "admin").strip()
        pwd = cfg.get("password", "")

        log.info("Connecting to Door Station at %s:%s (brand preference: %s)...", host, http_port, brand)

        client = None
        detected_brand = None

        if brand == "hikvision":
            client = HikvisionIntercomClient(host, http_port, rtsp_port, user, pwd)
            detected_brand = "hikvision"
        elif brand == "dahua":
            client = DahuaIntercomClient(host, http_port, rtsp_port, user, pwd)
            detected_brand = "dahua"
        else:  # Auto-detection
            try:
                hk = HikvisionIntercomClient(host, http_port, rtsp_port, user, pwd, timeout=3)
                info = hk.get_device_info()
                if info.get("model") != "Unknown Intercom" or info.get("serial") != "Unknown":
                    client = hk
                    detected_brand = "hikvision"
                    log.info("Auto-detected Hikvision Door Station: %s", info.get("model"))
            except Exception:
                pass

            if not client:
                try:
                    dh = DahuaIntercomClient(host, http_port, rtsp_port, user, pwd, timeout=3)
                    info = dh.get_device_info()
                    if info.get("model") != "Unknown" or info.get("serial") != "Unknown":
                        client = dh
                        detected_brand = "dahua"
                        log.info("Auto-detected Dahua VTO Door Station: %s", info.get("model"))
                except Exception:
                    pass

            if not client:
                log.info("Auto-detection undetermined; defaulting to Hikvision ISAPI client.")
                client = HikvisionIntercomClient(host, http_port, rtsp_port, user, pwd)
                detected_brand = "hikvision"

        _active_client = client
        _client_brand = detected_brand

    # Restart background event monitoring thread
    start_event_listener()


# ------------------------------------------------------------------ Background Event Listener
def broadcast_sse(event_data: dict):
    """Push event payload to all connected SSE browser clients."""
    with _state_lock:
        subs = list(_event_subscribers)

    msg = f"data: {json.dumps(event_data)}\n\n".encode("utf-8")
    dead = []
    for q in subs:
        try:
            q.put_nowait(msg)
        except Exception:
            dead.append(q)

    if dead:
        with _state_lock:
            for d in dead:
                if d in _event_subscribers:
                    _event_subscribers.remove(d)


def record_visitor_event(event_type: str, details: str = "", snapshot_file: str = None):
    """Save event into JSON history file."""
    entry = {
        "id": f"ev_{int(time.time()*1000)}",
        "type": event_type,
        "details": details,
        "snapshot": snapshot_file,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    try:
        history = []
        if os.path.exists(HISTORY_FILE):
            with open(HISTORY_FILE) as f:
                history = json.load(f)
        history.insert(0, entry)
        history = history[:200]  # Retain last 200 events
        with open(HISTORY_FILE, "w") as f:
            json.dump(history, f, indent=2)
    except Exception as e:
        log.error("Could not write visitor history: %s", e)


def notify_homeassistant_event(event_name: str, data: dict):
    """Fire event into Home Assistant Core via Supervisor API if token available."""
    sup_token = os.environ.get("SUPERVISOR_TOKEN")
    if not sup_token:
        return
    try:
        import urllib.request
        req = urllib.request.Request(
            f"http://supervisor/core/api/events/{event_name}",
            data=json.dumps(data).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {sup_token}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=5) as r:
            pass
    except Exception as e:
        log.debug("HA event trigger failed: %s", e)


def get_active_mobile_app_notifiers() -> list:
    """
    Dynamically discover all active Companion App notification services in Home Assistant.
    Avoids hardcoding entity IDs so that when customers delete/reinstall apps or get
    new phones/tablets, doorbell chimes ring automatically without editing any YAML scripts.
    """
    sup_token = os.environ.get("SUPERVISOR_TOKEN")
    if not sup_token:
        return []

    services_url = "http://supervisor/core/api/services"
    headers = {
        "Authorization": f"Bearer {sup_token}",
        "Content-Type": "application/json",
    }
    discovered = []
    try:
        import urllib.request
        req = urllib.request.Request(services_url, headers=headers)
        with urllib.request.urlopen(req, timeout=4) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            for domain_item in data:
                if domain_item.get("domain") == "notify":
                    srv_dict = domain_item.get("services", {})
                    for srv_name in srv_dict.keys():
                        if srv_name.startswith("mobile_app_"):
                            discovered.append(srv_name)
    except Exception as e:
        log.warning("Dynamic mobile app service discovery failed: %s", e)

    return discovered


def dispatch_dynamic_doorbell_push(door_id: int = 1, door_name: str = "Main Gate", snapshot_filename: str = None) -> list:
    """
    Broadcast high-priority critical doorbell push notifications to ALL dynamically
    discovered mobile devices currently registered in Home Assistant (Hik-Connect / DMSS style).
    Includes live visitor photo, critical sound, and instant lock-screen action buttons.
    """
    sup_token = os.environ.get("SUPERVISOR_TOKEN")
    if not sup_token:
        log.warning("Cannot send push notifications: SUPERVISOR_TOKEN not available")
        return []

    notifiers = get_active_mobile_app_notifiers()
    log.info("Dynamically discovered %d active mobile app notify services: %s", len(notifiers), notifiers)

    local_image_url = f"/local/ajnetweb_intercom/{snapshot_filename}" if snapshot_filename else "/local/ajnetweb_intercom/latest_ring.jpg"
    door1 = _config_cache.get("door_1_name", "Main Gate")
    door2 = _config_cache.get("door_2_name", "Pedestrian Door")
    is_critical = _config_cache.get("critical_push_sound", True)

    payload_data = {
        "title": f"🔔 Doorbell Ringing - {door_name}",
        "message": f"Visitor at {door_name} is calling... Tap to open or view.",
        "data": {
            "image": local_image_url,
            "attachment": {
                "url": local_image_url,
                "content-type": "jpeg",
                "hide-thumbnail": False,
            },
            "clickAction": "/ajnetweb_intercom",
            "url": "/ajnetweb_intercom",
            "ttl": 0,
            "priority": "high",
            "push": {
                "sound": {
                    "name": "default",
                    "critical": 1 if is_critical else 0,
                    "volume": 1.0,
                },
                "interruption-level": "critical" if is_critical else "time-sensitive",
            },
            "channel": "Doorbell",
            "importance": "high",
            "actions": [
                {
                    "action": "AJNETWEB_UNLOCK_1",
                    "title": f"🔓 Unlock {door1}",
                    "destructive": False,
                },
                {
                    "action": "AJNETWEB_UNLOCK_2",
                    "title": f"🔓 Unlock {door2}",
                    "destructive": False,
                },
                {
                    "action": "URI",
                    "title": "📹 View Live Camera",
                    "uri": "/ajnetweb_intercom",
                },
            ],
        },
    }

    import urllib.request
    successful_targets = []
    targets = notifiers if notifiers else ["notify"]
    for srv in targets:
        try:
            url = f"http://supervisor/core/api/services/notify/{srv}"
            req = urllib.request.Request(
                url,
                data=json.dumps(payload_data).encode("utf-8"),
                headers={
                    "Authorization": f"Bearer {sup_token}",
                    "Content-Type": "application/json",
                },
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=5) as resp:
                if resp.status in (200, 201):
                    successful_targets.append(srv)
                    log.info("Dispatched dynamic doorbell push to notify.%s (HTTP %s)", srv, resp.status)
        except Exception as e:
            log.error("Failed to push doorbell notification to notify.%s: %s", srv, e)

    return successful_targets


def handle_mobile_notification_action(action: str, ev_data: dict):
    """Handle lock-screen action button taps (e.g. AJNETWEB_UNLOCK_1) from iOS/Android."""
    if not action:
        return

    device_name = ev_data.get("device_id") or ev_data.get("source_device_id") or "Mobile Device"
    log.info("Received Lock-Screen Action from %s: %s", device_name, action)

    with _state_lock:
        client = _active_client
        cfg = dict(_config_cache)

    if not client:
        log.warning("Cannot execute lock screen action %s: Door station client not connected", action)
        return

    if action == "AJNETWEB_UNLOCK_1":
        door_name = cfg.get("door_1_name", "Main Gate")
        ok = client.unlock_door(1)
        if ok:
            log.info("Successfully unlocked %s via Mobile Lock-Screen Action", door_name)
            record_visitor_event("door_unlock", f"Unlocked {door_name} (Mobile Lock-Screen Action)")
            notify_homeassistant_event("ajnetweb_door_unlocked", {"door": 1, "name": door_name, "source": "mobile_action"})
            broadcast_sse({"event": "door_unlocked", "door": 1, "name": door_name})
    elif action == "AJNETWEB_UNLOCK_2":
        door_name = cfg.get("door_2_name", "Pedestrian Door")
        ok = client.unlock_door(2)
        if ok:
            log.info("Successfully unlocked %s via Mobile Lock-Screen Action", door_name)
            record_visitor_event("door_unlock", f"Unlocked {door_name} (Mobile Lock-Screen Action)")
            notify_homeassistant_event("ajnetweb_door_unlocked", {"door": 2, "name": door_name, "source": "mobile_action"})
            broadcast_sse({"event": "door_unlocked", "door": 2, "name": door_name})


def ha_action_listener_worker():
    """
    Background daemon listening for Home Assistant mobile_app_notification_action events.
    When a user taps '🔓 Unlock Main Gate' directly on their phone lock screen,
    this worker intercepts the action and immediately triggers the door relay strike.
    Zero customer or installer YAML automations required!
    """
    sup_token = os.environ.get("SUPERVISOR_TOKEN")
    if not sup_token:
        log.info("Supervisor token not available; mobile action listener disabled.")
        return

    while True:
        try:
            import websocket

            def on_message(ws, raw_msg):
                try:
                    msg = json.loads(raw_msg)
                    mtype = msg.get("type")
                    if mtype == "auth_required":
                        ws.send(json.dumps({"type": "auth", "access_token": sup_token}))
                    elif mtype == "auth_ok":
                        log.info("Connected to Home Assistant WebSocket for dynamic lock-screen push actions.")
                        ws.send(json.dumps({
                            "id": 1,
                            "type": "subscribe_events",
                            "event_type": "mobile_app_notification_action",
                        }))
                        ws.send(json.dumps({
                            "id": 2,
                            "type": "subscribe_events",
                            "event_type": "html5_notification.clicked",
                        }))
                    elif mtype == "event":
                        ev_data = msg.get("event", {}).get("data", {})
                        action = ev_data.get("action")
                        handle_mobile_notification_action(action, ev_data)
                except Exception as err:
                    log.error("Error processing HA WebSocket event: %s", err)

            def on_error(ws, error):
                log.debug("HA WebSocket listener info: %s", error)

            def on_close(ws, close_status_code, close_msg):
                log.info("HA WebSocket closed (%s), reconnecting in 5s...", close_status_code)

            ws = websocket.WebSocketApp(
                "ws://supervisor/core/websocket",
                on_message=on_message,
                on_error=on_error,
                on_close=on_close,
            )
            ws.run_forever(ping_interval=20, ping_timeout=10)
        except ImportError:
            log.warning("websocket module not available; lock-screen action listener standing by.")
            time.sleep(30)
        except Exception as e:
            log.warning("HA WebSocket worker encountered error: %s. Reconnecting in 5s...", e)
            time.sleep(5)


def start_ha_action_listener():
    """Launch the background HA action listener thread."""
    global _ha_action_thread
    if _ha_action_thread is None or not _ha_action_thread.is_alive():
        _ha_action_thread = threading.Thread(target=ha_action_listener_worker, daemon=True, name="ha-action-events")
        _ha_action_thread.start()


def on_door_event(event_info: dict):
    """Callback triggered whenever an event is received from Door Station."""
    global _last_ring_time
    ev = event_info.get("event")
    log.info("Received Door Station Event: %s", event_info)

    snapshot_filename = None
    if ev == "ring":
        now = time.time()
        # Debounce multiple ring triggers within 4 seconds
        if now - _last_ring_time < 4:
            return
        _last_ring_time = now

        # Grab and persist snapshot if enabled
        if _config_cache.get("auto_snapshot_on_ring", True) and _active_client:
            try:
                snap = _active_client.get_snapshot()
                if snap:
                    fn = f"ring_{datetime.now().strftime('%Y%m%d_%H%M%S')}.jpg"
                    fp = os.path.join(VISITORS_DIR, fn)
                    with open(fp, "wb") as f:
                        f.write(snap)
                    snapshot_filename = fn
                    event_info["snapshot_url"] = f"api/visitors/image/{fn}"

                    # Mirror snapshot to HA /config/www/ajnetweb_intercom so Companion App loads image
                    try:
                        if os.path.exists("/config/www"):
                            os.makedirs(HA_WWW_DIR, exist_ok=True)
                            with open(os.path.join(HA_WWW_DIR, "latest_ring.jpg"), "wb") as f:
                                f.write(snap)
                            with open(os.path.join(HA_WWW_DIR, fn), "wb") as f:
                                f.write(snap)
                    except Exception as err:
                        log.debug("Could not mirror snapshot to HA www: %s", err)
            except Exception as e:
                log.error("Failed to capture visitor snapshot: %s", e)

        record_visitor_event("doorbell_ring", "Doorbell button pressed", snapshot_filename)
        notify_homeassistant_event("ajnetweb_doorbell_ring", event_info)

        # Dynamic Hik-Connect / DMSS Push Notification Broadcast
        if _config_cache.get("push_notify_mode", "all_mobile_devices") == "all_mobile_devices":
            door_name = _config_cache.get("door_1_name", "Main Gate")
            threading.Thread(
                target=dispatch_dynamic_doorbell_push,
                args=(1, door_name, snapshot_filename),
                daemon=True,
                name="doorbell-push-broadcast",
            ).start()

    elif ev == "door_unlocked":
        record_visitor_event("door_unlock", event_info.get("details", "Door opened"))
        notify_homeassistant_event("ajnetweb_door_unlocked", event_info)

    # Broadcast to all live Ingress web views
    broadcast_sse(event_info)


def event_monitor_worker():
    """Background loop maintaining connection to door station alert stream."""
    while True:
        with _state_lock:
            client = _active_client
            brand = _client_brand

        if not client:
            time.sleep(5)
            continue

        try:
            if brand == "hikvision" and hasattr(client, "listen_alert_stream"):
                client.listen_alert_stream(on_door_event)
            elif brand == "dahua" and hasattr(client, "listen_event_manager"):
                client.listen_event_manager(on_door_event)
            else:
                time.sleep(5)
        except Exception as e:
            log.warning("Event stream worker error: %s. Reconnecting in 5s...", e)
            time.sleep(5)


def start_event_listener():
    """Launch the background monitoring thread."""
    global _event_thread
    if _event_thread is None or not _event_thread.is_alive():
        _event_thread = threading.Thread(target=event_monitor_worker, daemon=True, name="intercom-events")
        _event_thread.start()


# ------------------------------------------------------------------ HTTP Handler
class IntercomRequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WWW_DIR, **kwargs)

    def _normalize_path(self) -> str:
        """Strip Home Assistant Ingress base path if present."""
        raw_path = urllib.parse.urlparse(self.path).path
        if "/api/" in raw_path:
            return raw_path[raw_path.find("/api/"):]
        return raw_path

    def _send_json(self, data: dict, status: int = 200):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        self.end_headers()
        self.wfile.write(body)

    def _send_image(self, data: bytes, mime: str = "image/jpeg"):
        self.send_response(200)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "public, max-age=1")
        self.end_headers()
        self.wfile.write(data)

    def _placeholder_jpeg(self) -> bytes:
        svg = """<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
  <rect width="640" height="360" fill="#070a12" />
  <circle cx="320" cy="150" r="50" fill="#0f172a" stroke="#1e293b" stroke-width="4"/>
  <circle cx="320" cy="150" r="20" fill="#38bdf8" opacity="0.3"/>
  <circle cx="320" cy="150" r="8" fill="#38bdf8"/>
  <text x="320" y="240" font-family="-apple-system, sans-serif" font-size="18" fill="#94a3b8" text-anchor="middle" font-weight="600">Door Station Camera</text>
  <text x="320" y="265" font-family="-apple-system, sans-serif" font-size="12" fill="#475569" text-anchor="middle">Connecting to video feed...</text>
</svg>"""
        return svg.encode("utf-8")

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = self._normalize_path()
        query = urllib.parse.parse_qs(parsed.query)

        # ---------------------------------------------------------------- Status
        if path == "/api/status":
            with _state_lock:
                client = _active_client
                brand = _client_brand
                cfg = _config_cache

            if not client:
                self._send_json({
                    "configured": False,
                    "brand": cfg.get("brand", "auto"),
                    "host": cfg.get("host", ""),
                    "message": "Door station not configured. Open Settings to connect.",
                })
                return

            try:
                info = client.get_device_info()
                call_st = client.get_call_status()
                self._send_json({
                    "configured": True,
                    "brand": brand,
                    "host": cfg.get("host"),
                    "http_port": cfg.get("http_port"),
                    "rtsp_port": cfg.get("rtsp_port"),
                    "door_1_name": cfg.get("door_1_name", "Main Gate"),
                    "door_2_name": cfg.get("door_2_name", "Pedestrian Door"),
                    "device_info": info,
                    "call_status": call_st.get("status", "idle"),
                })
            except Exception as e:
                self._send_json({"configured": True, "error": str(e), "brand": brand})
            return

        # ---------------------------------------------------------------- Snapshot & MJPEG
        if path == "/api/snapshot":
            with _state_lock:
                client = _active_client
            if client:
                try:
                    img = client.get_snapshot()
                    if img:
                        self._send_image(img, "image/jpeg")
                        return
                except Exception as e:
                    log.debug("Snapshot failed: %s", e)

            self._send_image(self._placeholder_jpeg(), "image/svg+xml")
            return

        if path == "/api/mjpeg":
            with _state_lock:
                client = _active_client
            if not client:
                self.send_error(503, "Door Station not connected")
                return

            self.send_response(200)
            self.send_header("Content-Type", "multipart/x-mixed-replace; boundary=frame")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Cache-Control", "no-cache, private")
            self.end_headers()

            try:
                while True:
                    img = client.get_snapshot()
                    if not img:
                        img = self._placeholder_jpeg()
                    self.wfile.write(b"--frame\r\n")
                    self.wfile.write(b"Content-Type: image/jpeg\r\n\r\n")
                    self.wfile.write(img)
                    self.wfile.write(b"\r\n")
                    time.sleep(0.35)
            except (BrokenPipeError, ConnectionResetError, OSError):
                pass
            return

        # ---------------------------------------------------------------- Unlock via GET (For easy HA automations/Siri)
        if path == "/api/unlock":
            door_id = int(query.get("door", [1])[0])
            with _state_lock:
                client = _active_client
                cfg = _config_cache

            if not client:
                self._send_json({"ok": False, "error": "Door station not connected"}, status=503)
                return

            ok = client.unlock_door(door_id)
            door_name = cfg.get(f"door_{door_id}_name", f"Door {door_id}")
            if ok:
                record_visitor_event("door_unlock", f"Unlocked {door_name} (Remote)")
                notify_homeassistant_event("ajnetweb_door_unlocked", {"door": door_id, "name": door_name})
                broadcast_sse({"event": "door_unlocked", "door": door_id, "name": door_name})
            self._send_json({"ok": ok, "door": door_id, "name": door_name})
            return

        # ---------------------------------------------------------------- Server-Sent Events (SSE)
        if path == "/api/events":
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Connection", "keep-alive")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()

            import queue
            q = queue.Queue(maxsize=20)
            with _state_lock:
                _event_subscribers.append(q)

            # Send initial ping
            self.wfile.write(b": connected\n\n")
            self.wfile.flush()

            try:
                while True:
                    try:
                        msg = q.get(timeout=25)
                        self.wfile.write(msg)
                        self.wfile.flush()
                    except queue.Empty:
                        # Keep-alive heartbeat comment
                        self.wfile.write(b": ping\n\n")
                        self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError, OSError):
                pass
            finally:
                with _state_lock:
                    if q in _event_subscribers:
                        _event_subscribers.remove(q)
            return

        # ---------------------------------------------------------------- Visitor History & Gallery
        if path == "/api/visitors":
            history = []
            if os.path.exists(HISTORY_FILE):
                try:
                    with open(HISTORY_FILE) as f:
                        history = json.load(f)
                except Exception:
                    pass
            self._send_json(history)
            return

        if path.startswith("/api/visitors/image/"):
            fn = path.split("/")[-1]
            fp = os.path.join(VISITORS_DIR, fn)
            if os.path.exists(fp) and fn.endswith(".jpg"):
                with open(fp, "rb") as f:
                    self._send_image(f.read(), "image/jpeg")
                return
            self.send_error(404, "Image not found")
            return

        if path == "/api/notifications/devices":
            devs = get_active_mobile_app_notifiers()
            with _state_lock:
                cfg = dict(_config_cache)
            self._send_json({
                "mode": cfg.get("push_notify_mode", "all_mobile_devices"),
                "critical_sound": cfg.get("critical_push_sound", True),
                "count": len(devs),
                "devices": devs,
            })
            return

        if path == "/api/config":
            with _state_lock:
                cfg = dict(_config_cache)
            if "password" in cfg and cfg["password"]:
                cfg["password_set"] = True
                cfg["password"] = "••••••••"
            else:
                cfg["password_set"] = False
            self._send_json(cfg)
            return

        super().do_GET()

    def do_POST(self):
        path = self._normalize_path()

        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length).decode("utf-8") if length > 0 else "{}"
        try:
            payload = json.loads(body)
        except ValueError:
            payload = {}

        if path == "/api/unlock":
            door_id = int(payload.get("door", 1))
            with _state_lock:
                client = _active_client
                cfg = _config_cache

            if not client:
                self._send_json({"ok": False, "error": "Door station not connected"}, status=503)
                return

            ok = client.unlock_door(door_id)
            door_name = cfg.get(f"door_{door_id}_name", f"Door {door_id}")
            if ok:
                record_visitor_event("door_unlock", f"Unlocked {door_name} (Remote)")
                notify_homeassistant_event("ajnetweb_door_unlocked", {"door": door_id, "name": door_name})
                broadcast_sse({"event": "door_unlocked", "door": door_id, "name": door_name})
            self._send_json({"ok": ok, "door": door_id, "name": door_name})
            return

        if path == "/api/notifications/test":
            door_id = int(payload.get("door", 1))
            with _state_lock:
                cfg = dict(_config_cache)
                client = _active_client
            door_name = cfg.get(f"door_{door_id}_name", f"Door {door_id}")

            test_snap_fn = None
            if client:
                try:
                    img = client.get_snapshot()
                    if img:
                        test_snap_fn = f"test_{datetime.now().strftime('%Y%m%d_%H%M%S')}.jpg"
                        fp = os.path.join(VISITORS_DIR, test_snap_fn)
                        with open(fp, "wb") as f:
                            f.write(img)
                        try:
                            if os.path.exists("/config/www"):
                                os.makedirs(HA_WWW_DIR, exist_ok=True)
                                with open(os.path.join(HA_WWW_DIR, "latest_ring.jpg"), "wb") as f:
                                    f.write(img)
                                with open(os.path.join(HA_WWW_DIR, test_snap_fn), "wb") as f:
                                    f.write(img)
                        except Exception:
                            pass
                except Exception as e:
                    log.debug("Test snapshot failed: %s", e)

            notified = dispatch_dynamic_doorbell_push(door_id, door_name, test_snap_fn)
            self._send_json({
                "ok": True,
                "count": len(notified),
                "notified_devices": notified,
                "message": f"Test ring notification sent to {len(notified)} active device(s).",
            })
            return

        if path == "/api/call/action":
            action = payload.get("action", "hangUp")  # answer | reject | hangUp
            with _state_lock:
                client = _active_client
                brand = _client_brand

            if not client:
                self._send_json({"ok": False, "error": "Door station not connected"}, status=503)
                return

            ok = False
            if brand == "hikvision" and hasattr(client, "call_signal"):
                ok = client.call_signal(action)
            elif brand == "dahua" and hasattr(client, "hang_up"):
                ok = client.hang_up()

            self._send_json({"ok": ok, "action": action})
            return

        if path == "/api/config":
            save_config(payload)
            self._send_json({"ok": True, "message": "Door Station configuration updated"})
            return

        self.send_error(404, "Endpoint not found")


def main():
    log.info("Starting AJ Netweb Intercom & Door Station Server on port %s...", PORT)
    init_client()
    start_ha_action_listener()
    server = ThreadedHTTPServer(("0.0.0.0", PORT), IntercomRequestHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        log.info("Shutting down Intercom server...")
        server.server_close()


if __name__ == "__main__":
    main()
