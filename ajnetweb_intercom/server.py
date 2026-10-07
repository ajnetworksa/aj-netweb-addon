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
WWW_DIR = os.path.join(os.path.dirname(__file__), "www")
PORT = int(os.environ.get("INGRESS_PORT", 8097))

os.makedirs(VISITORS_DIR, exist_ok=True)

_state_lock = Lock()
_active_client = None
_client_brand = None
_config_cache = {}
_event_subscribers = []  # List of SSE response queues
_event_thread = None
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
            except Exception as e:
                log.error("Failed to capture visitor snapshot: %s", e)

        record_visitor_event("doorbell_ring", "Doorbell button pressed", snapshot_filename)
        notify_homeassistant_event("ajnetweb_doorbell_ring", event_info)

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
    server = ThreadedHTTPServer(("0.0.0.0", PORT), IntercomRequestHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        log.info("Shutting down Intercom server...")
        server.server_close()


if __name__ == "__main__":
    main()
