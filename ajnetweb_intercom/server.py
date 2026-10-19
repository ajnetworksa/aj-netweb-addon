#!/usr/bin/env python3
"""
AJ Netweb Intercom & Door Station Studio - Server & Background Event Engine
Manages Hikvision/Dahua Door Stations, Real-Time Doorbell Chimes, Remote Unlocks & Visitor History.
"""

import json
import logging
import os
import secrets
import sys
import threading
import time
import urllib.parse
import socket
from datetime import datetime, timezone
from http.server import HTTPServer, SimpleHTTPRequestHandler
from socketserver import ThreadingMixIn
from threading import RLock

try:
    from device_discovery import scan_network
except ImportError:
    log = logging.getLogger("intercom.server")
    log.warning("device_discovery module not found; SADP discovery fallback active.")
    def scan_network(*args, **kwargs):
        return []

from intercom_dahua import DahuaIntercomClient
from intercom_hikvision import HikvisionIntercomClient

import ajn_license
import doorbell

LICENSE = ajn_license.License("intercom", "AJ Netweb Intercom & Door Station")

logging.basicConfig(level=logging.INFO, format="[%(asctime)s] %(levelname)s [%(name)s]: %(message)s")
log = logging.getLogger("intercom.server")

OPTIONS_FILE = "/data/options.json"
DATA_DIR = "/data/intercom"
VISITORS_DIR = "/data/intercom/visitors"
HISTORY_FILE = "/data/intercom/visitor_history.json"
CREDENTIALS_FILE = "/data/intercom/credentials.json"
# `map: homeassistant_config` mounts the HA config at /homeassistant (legacy: /config)
HA_CONFIG_DIR = next((d for d in ("/homeassistant", "/config") if os.path.exists(os.path.join(d, "configuration.yaml"))),
                     "/homeassistant")
HA_WWW_DIR = os.path.join(HA_CONFIG_DIR, "www", "ajnetweb_intercom")
WWW_DIR = os.path.join(os.path.dirname(__file__), "www")
PORT = int(os.environ.get("INGRESS_PORT", 8091))
UI_SETTINGS_FILE = "/data/ui_settings.json"
PASSWORD_MASK = "••••••••"
# host_network add-on: only the Supervisor ingress proxy may reach the studio,
# otherwise anyone on the LAN could open doors through port 8091.
ALLOWED_CLIENTS = {"172.30.32.2", "127.0.0.1", "::1"}
KEEP_PUBLISHED_SNAPSHOTS = 20

os.makedirs(VISITORS_DIR, exist_ok=True)

_state_lock = RLock()
_active_client = None
_client_brand = None
_config_cache = {}
_event_subscribers = []  # List of SSE response queues
_event_thread = None
_ha_action_thread = None
DEVICES_FILE = "/data/intercom_devices.json"

_door_stations_list = []
_indoor_stations_list = []
_door_clients = {}
_active_station_id = None
_pruner_thread = None
_last_ring_time = 0
_connected_displays = {}  # display_id -> dict(id, name, device_type, status, last_seen, ip)
_active_intercom_calls = {}  # call_id -> dict(call_id, from_id, from_name, to_id, to_name, call_type, state, start_time)
_card_enroll_active = False


def _auto_stop_card_enroll(client):
    global _card_enroll_active
    time.sleep(60)
    with _state_lock:
        if _card_enroll_active:
            _card_enroll_active = False
            try:
                if hasattr(client, "set_issue_cards_mode"):
                    client.set_issue_cards_mode(False)
            except Exception:
                pass
            broadcast_sse({"event": "card_enroll_stopped"})


def get_active_displays() -> list:
    """Return all active indoor displays (both registered hardware panels and browser kiosks), pruning inactive."""
    now = time.time()
    with _state_lock:
        stale = [did for did, d in _connected_displays.items() if now - d.get("last_seen", 0) > 70]
        for did in stale:
            del _connected_displays[did]

        all_displays = list(_connected_displays.values())

        # Include configured hardware indoor stations (e.g. DS-KH9510 or Android Wall Panels)
        for ind in _indoor_stations_list:
            if not ind.get("enabled", True):
                continue
            iid = ind.get("id") or f"indoor_{ind.get('host')}"
            if not any(d.get("id") == iid for d in all_displays):
                all_displays.append({
                    "id": iid,
                    "name": ind.get("name") or ind.get("room") or "Indoor Touch Display",
                    "room": ind.get("room") or "Living Room",
                    "device_type": "hardware_panel",
                    "model": ind.get("model") or "Indoor Station",
                    "status": "ready",
                    "ip": ind.get("host", ""),
                    "hardware": True,
                    "brand": ind.get("brand", "hikvision"),
                    "last_seen": now,
                })
        return all_displays


class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    def server_bind(self):
        self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        if hasattr(socket, "SO_REUSEPORT"):
            try:
                self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEPORT, 1)
            except OSError:
                pass
        super().server_bind()


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
    if os.path.exists(UI_SETTINGS_FILE):
        try:
            with open(UI_SETTINGS_FILE) as f:
                cfg.update(json.load(f))
        except Exception as e:
            log.warning("Could not read ui_settings.json: %s", e)
    return cfg


CONFIG_KEYS = {"brand", "host", "http_port", "rtsp_port", "username", "password", "door_1_name",
               "door_2_name", "unlock_duration_sec", "auto_snapshot_on_ring", "ha_notify_on_ring",
               "push_notify_mode", "critical_push_sound", "log_level", "doorbell_camera_entity",
               "stun_server", "dashboard_path"}


def save_config(new_cfg: dict):
    """Persist UI settings. /data/options.json is owned by the Supervisor and rewritten on start."""
    changes = {k: v for k, v in (new_cfg or {}).items() if k in CONFIG_KEYS}
    if changes.get("password") == PASSWORD_MASK:
        changes.pop("password")
    cur = {}
    if os.path.exists(UI_SETTINGS_FILE):
        try:
            with open(UI_SETTINGS_FILE) as f:
                cur = json.load(f)
        except Exception:
            cur = {}
    cur.update(changes)
    try:
        tmp = UI_SETTINGS_FILE + ".tmp"
        with open(tmp, "w") as f:
            json.dump(cur, f, indent=2)
        os.replace(tmp, UI_SETTINGS_FILE)
    except Exception as e:
        log.error("Could not write ui_settings.json: %s", e)
    init_client()


def redact(dev: dict) -> dict:
    c = dict(dev)
    if c.get("password"):
        c["password"] = PASSWORD_MASK
    return c


def _supervisor_json(path: str, timeout: int = 5):
    tok = os.environ.get("SUPERVISOR_TOKEN")
    if not tok:
        return None
    import urllib.request
    try:
        req = urllib.request.Request(f"http://supervisor{path}", headers={"Authorization": f"Bearer {tok}"})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            body = json.loads(r.read())
            return body.get("data", body) if isinstance(body, dict) else body
    except Exception as e:
        log.debug("Supervisor GET %s failed: %s", path, e)
        return None


_panel_path_cache = None


def panel_path() -> str:
    """Sidebar path of this add-on (/<repo-hash>_ajnetweb_intercom), resolved at runtime."""
    global _panel_path_cache
    if _panel_path_cache is None:
        info = _supervisor_json("/addons/self/info") or {}
        _panel_path_cache = f"/{info['slug']}" if info.get("slug") else "/hassio/ingress/ajnetweb_intercom"
    return _panel_path_cache


def dashboard_path() -> str:
    """Dashboard opened from notifications: option, else the AJ Netweb dashboard, else the default one."""
    cfg_path = (_config_cache.get("dashboard_path") or "").strip()
    if cfg_path:
        return cfg_path if cfg_path.startswith("/") else "/" + cfg_path
    dashboards = ha_ws_command("lovelace/dashboards/list") or []
    for d in dashboards:
        if "ajnetweb" in (d.get("url_path") or ""):
            return f"/{d['url_path']}/home"
    return "/lovelace/0"


def ha_ws_command(command: str, **params):
    tok = os.environ.get("SUPERVISOR_TOKEN")
    if not tok:
        return None
    try:
        import websocket
        ws = websocket.create_connection("ws://supervisor/core/websocket", timeout=8)
        try:
            if json.loads(ws.recv()).get("type") == "auth_required":
                ws.send(json.dumps({"type": "auth", "access_token": tok}))
                if json.loads(ws.recv()).get("type") != "auth_ok":
                    return None
            ws.send(json.dumps(dict(id=1, type=command, **params)))
            while True:
                r = json.loads(ws.recv())
                if r.get("id") == 1 and r.get("type") == "result":
                    return r.get("result") if r.get("success") else None
        finally:
            ws.close()
    except Exception as e:
        log.debug("HA WS %s failed: %s", command, e)
        return None


def doorbell_camera_candidates() -> list:
    """Camera entities to fall back on for ring snapshots: the configured one, else door-like cameras."""
    configured = (_config_cache.get("doorbell_camera_entity") or "").strip()
    if configured:
        return [configured]
    tok = os.environ.get("SUPERVISOR_TOKEN")
    if not tok:
        return []
    import urllib.request
    try:
        req = urllib.request.Request("http://supervisor/core/api/states", headers={"Authorization": f"Bearer {tok}"})
        with urllib.request.urlopen(req, timeout=5) as r:
            states = json.loads(r.read())
    except Exception:
        return []
    words = ("doorbell", "door", "gate", "intercom", "entrance", "villa")
    cams = [st["entity_id"] for st in states if st.get("entity_id", "").startswith("camera.")]
    return [c for c in cams if any(w in c for w in words)][:3]


def publish_snapshot(img: bytes, prefix: str = "ring") -> str:
    """
    Copy a snapshot to <config>/www so the Companion app can show it in the notification.
    Files under /local are served without login, so names are random (not guessable)
    and only the newest few are kept.
    """
    fn = f"{prefix}_{datetime.now().strftime('%Y%m%d')}_{secrets.token_hex(12)}.jpg"
    try:
        os.makedirs(HA_WWW_DIR, exist_ok=True)
        path = os.path.join(HA_WWW_DIR, fn)
        with open(path, "wb") as f:
            f.write(img)
        os.chmod(path, 0o644)
        legacy = os.path.join(HA_WWW_DIR, "latest_ring.jpg")
        if os.path.exists(legacy):
            os.remove(legacy)
        files = sorted((os.path.join(HA_WWW_DIR, x) for x in os.listdir(HA_WWW_DIR) if x.endswith(".jpg")),
                       key=os.path.getmtime, reverse=True)
        for old in files[KEEP_PUBLISHED_SNAPSHOTS:]:
            os.remove(old)
        return fn
    except OSError as e:
        log.warning("Could not publish snapshot to %s: %s", HA_WWW_DIR, e)
        return None


# ------------------------------------------------------------------ go2rtc (live view + talk)
GO2RTC_PORTS = (1984, 11984)


def go2rtc_base() -> str:
    import urllib.request
    for port in GO2RTC_PORTS:
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/api", timeout=1.5):
                return f"http://127.0.0.1:{port}"
        except Exception:
            continue
    return None


def ensure_go2rtc_stream(base: str, dev: dict, client, brand: str) -> str:
    """Register (or refresh) a go2rtc stream for a door station; returns its name."""
    import urllib.request
    name = "ajn_" + "".join(ch if ch.isalnum() else "_" for ch in (dev.get("id") or "door"))
    sources = [client.get_rtsp_url()]
    if brand == "hikvision":
        # ISAPI source adds the two-way audio backchannel on Hikvision intercoms
        u = urllib.parse.quote(dev.get("username", "admin"), safe="")
        pw = urllib.parse.quote(dev.get("password", ""), safe="")
        sources.append(f"isapi://{u}:{pw}@{dev.get('host')}:{int(dev.get('http_port', 80) or 80)}/")
    q = urllib.parse.urlencode([("name", name)] + [("src", src) for src in sources])
    req = urllib.request.Request(f"{base}/api/streams?{q}", method="PUT")
    with urllib.request.urlopen(req, timeout=5):
        pass
    return name


def load_intercom_devices() -> dict:
    """Load door stations and indoor stations from /data/intercom_devices.json."""
    data = {"door_stations": [], "indoor_stations": []}
    if os.path.exists(DEVICES_FILE):
        try:
            with open(DEVICES_FILE, "r") as f:
                d = json.load(f)
                if isinstance(d, dict):
                    data["door_stations"] = d.get("door_stations", [])
                    data["indoor_stations"] = d.get("indoor_stations", [])
        except Exception as e:
            log.warning("Could not read intercom_devices.json: %s", e)

    cfg = load_config()
    host = cfg.get("host", "").strip()
    if not data["door_stations"] and host:
        data["door_stations"] = [{
            "id": "door_primary",
            "name": "Main Gate Villa",
            "host": host,
            "brand": cfg.get("brand", "auto"),
            "http_port": int(cfg.get("http_port", 80) or 80),
            "rtsp_port": int(cfg.get("rtsp_port", 554) or 554),
            "username": cfg.get("username", "admin"),
            "password": cfg.get("password", ""),
            "door_1_name": cfg.get("door_1_name", "Main Gate"),
            "door_2_name": cfg.get("door_2_name", "Pedestrian Door"),
            "enabled": True,
        }]
        save_intercom_devices(data)
    return data


def save_intercom_devices(data: dict):
    """Save devices list and re-initialize all intercom connections."""
    try:
        os.makedirs(os.path.dirname(DEVICES_FILE), exist_ok=True)
        with open(DEVICES_FILE, "w") as f:
            json.dump(data, f, indent=2)
    except Exception as e:
        log.error("Could not write intercom_devices.json: %s", e)
    init_all_intercom_devices(data)


def _connect_door_station(dev: dict):
    host = dev.get("host", "").strip()
    if not host:
        return None, None
    brand = dev.get("brand", "auto").lower()
    http_port = int(dev.get("http_port", 80) or 80)
    rtsp_port = int(dev.get("rtsp_port", 554) or 554)
    user = dev.get("username", "admin").strip()
    pwd = dev.get("password", "")

    client = None
    detected_brand = None

    if brand == "hikvision":
        client = HikvisionIntercomClient(host, http_port, rtsp_port, user, pwd)
        detected_brand = "hikvision"
    elif brand == "dahua":
        client = DahuaIntercomClient(host, http_port, rtsp_port, user, pwd)
        detected_brand = "dahua"
    else:  # Auto detect
        try:
            hk = HikvisionIntercomClient(host, http_port, rtsp_port, user, pwd, timeout=3)
            info = hk.get_device_info()
            if info.get("model") != "Unknown Intercom" or info.get("serial") != "Unknown":
                client = hk
                detected_brand = "hikvision"
        except Exception:
            pass

        if not client:
            try:
                dh = DahuaIntercomClient(host, http_port, rtsp_port, user, pwd, timeout=3)
                info = dh.get_device_info()
                if info.get("model") != "Unknown" or info.get("serial") != "Unknown":
                    client = dh
                    detected_brand = "dahua"
            except Exception:
                pass

        if not client:
            client = HikvisionIntercomClient(host, http_port, rtsp_port, user, pwd)
            detected_brand = "hikvision"

    return client, detected_brand


def init_all_intercom_devices(data: dict = None):
    """Initialize all Door Station clients and load indoor stations."""
    global _door_stations_list, _indoor_stations_list, _door_clients, _active_client, _client_brand, _active_station_id, _config_cache
    if data is None:
        data = load_intercom_devices()
    doors = data.get("door_stations", [])
    indoors = data.get("indoor_stations", [])
    cfg = load_config()

    new_clients = {}
    primary_client = None
    primary_brand = None
    primary_id = None

    for dev in doors:
        dev_id = dev.get("id") or f"door_{int(time.time()*1000)}"
        dev["id"] = dev_id
        if not dev.get("enabled", True):
            continue

        try:
            cl, br = _connect_door_station(dev)
            if cl:
                new_clients[dev_id] = {
                    "client": cl,
                    "brand": br,
                    "device": dev,
                }
                if primary_client is None:
                    primary_client = cl
                    primary_brand = br
                    primary_id = dev_id
        except Exception as e:
            log.error("Failed to connect door station %s (%s): %s", dev.get("name"), dev.get("host"), e)

    with _state_lock:
        _door_stations_list = doors
        _indoor_stations_list = indoors
        _config_cache = cfg
        _door_clients = new_clients
        _active_client = primary_client
        _client_brand = primary_brand
        if not _active_station_id or _active_station_id not in _door_clients:
            _active_station_id = primary_id
    log.info("Initialized %d door stations and %d indoor stations.", len(new_clients), len(indoors))

    start_event_listener()


def resolve_door_station(station_id_raw: str = None):
    """Resolve specific door station client by ID, or return active primary station."""
    with _state_lock:
        if station_id_raw and station_id_raw in _door_clients:
            info = _door_clients[station_id_raw]
            return info["client"], info["brand"], info["device"]

        if _active_station_id and _active_station_id in _door_clients:
            info = _door_clients[_active_station_id]
            return info["client"], info["brand"], info["device"]

        if _active_client:
            return _active_client, _client_brand, _door_stations_list[0] if _door_stations_list else {}
        return None, None, {}


def init_client(cfg: dict = None):
    """Backward compatibility alias."""
    init_all_intercom_devices()


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


def publish_doorbell(ringing: bool, snapshot: str = None, camera: str = None, station: str = None):
    """sensor.ajnetweb_doorbell for the dashboard popup (see doorbell.py)."""
    sup_token = os.environ.get("SUPERVISOR_TOKEN")
    if not sup_token:
        return
    body = doorbell.sensor_payload(dict(_config_cache), ringing, snapshot, camera, station)
    try:
        import urllib.request
        req = urllib.request.Request(f"http://supervisor/core/api/states/{doorbell.SENSOR}",
                                     data=json.dumps(body).encode("utf-8"), method="POST",
                                     headers={"Authorization": f"Bearer {sup_token}", "Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=5):
            pass
    except Exception as e:
        log.debug("Publishing %s failed: %s", doorbell.SENSOR, e)


_ring_seq = 0


def _end_ring(seq: int):
    if seq == _ring_seq:   # a newer ring keeps the popup open
        publish_doorbell(False)


def ensure_open_buttons():
    """input_button helpers the dashboard presses to open a door (created once, renamed after the doors)."""
    have = {i.get("id") for i in (ha_ws_command("input_button/list") or [])}
    for door, name in doorbell.door_names(dict(_config_cache)).items():
        oid = doorbell.button_id(door)
        if oid not in have and ha_ws_command("input_button/create", name=oid, icon="mdi:door-open") is None:
            log.warning("Could not create input_button.%s", oid)
            continue
        ha_ws_command("config/entity_registry/update", entity_id=f"input_button.{oid}", name=f"Open {name}")


def doorbell_startup():
    ensure_open_buttons()
    publish_doorbell(False)


def unlock_from_ha(door_id: int, source: str):
    """Open a door for an action that came through Home Assistant (lock-screen button, dashboard helper)."""
    with _state_lock:
        client = _active_client
        cfg = dict(_config_cache)
    if not client:
        log.warning("Cannot open door %s (%s): door station not connected", door_id, source)
        return False
    door_name = cfg.get(f"door_{door_id}_name") or f"Door {door_id}"
    ok = client.unlock_door(door_id)
    if ok:
        log.info("Opened %s via %s", door_name, source)
        record_visitor_event("door_unlock", f"Unlocked {door_name} ({source})")
        notify_homeassistant_event("ajnetweb_door_unlocked", {"door": door_id, "name": door_name, "source": source})
        broadcast_sse({"event": "door_unlocked", "door": door_id, "name": door_name})
    return ok


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

    local_image_url = f"/local/ajnetweb_intercom/{snapshot_filename}" if snapshot_filename else None
    studio_url = panel_path()
    dash_url = dashboard_path()
    door1 = _config_cache.get("door_1_name", "Main Gate")
    door2 = _config_cache.get("door_2_name", "Pedestrian Door")
    is_critical = _config_cache.get("critical_push_sound", True)

    payload_data = {
        "title": f"📞 Visitor Calling - {door_name}",
        "message": f"Visitor is calling at {door_name}. Tap to answer or open door.",
        "data": {
            "image": local_image_url,
            "attachment": {
                "url": local_image_url,
                "content-type": "jpeg",
                "hide-thumbnail": False,
            },
            "clickAction": studio_url,
            "url": studio_url,
            "ttl": 0,
            "priority": "high",
            "importance": "high",
            "channel": "Doorbell Call",
            "alarm_stream": True,
            "notification_icon": "mdi:phone-incoming",
            "vibrationPattern": "100, 1000, 200, 1000, 200, 1000",
            "ledColor": "red",
            "color": "#10b981",
            "tag": "ajnetweb_doorbell",
            "persistent": True,
            "sticky": True,
            "push": {
                "sound": {
                    "name": "doorbell_chime.wav",
                    "critical": 1 if is_critical else 0,
                    "volume": 1.0,
                },
                "interruption-level": "critical" if is_critical else "time-sensitive",
            },
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
                    "title": "📹 Answer / Live View",
                    "uri": studio_url,
                },
                {
                    "action": "URI",
                    "title": "📱 Open Dashboard",
                    "uri": dash_url,
                },
            ],
        },
    }

    if not local_image_url:
        payload_data["data"].pop("image", None)
        payload_data["data"].pop("attachment", None)

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

    if action == "AJNETWEB_UNLOCK_1":
        unlock_from_ha(1, "Mobile Lock-Screen Action")
    elif action == "AJNETWEB_UNLOCK_2":
        unlock_from_ha(2, "Mobile Lock-Screen Action")


# ---------------------------------------------------------------- Credential & Guest Key Management
def load_credentials() -> list:
    """Load issued guest passes and keys from disk."""
    if os.path.exists(CREDENTIALS_FILE):
        try:
            with open(CREDENTIALS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            log.warning("Could not read credentials.json: %s", e)
    return []


def save_credentials(creds: list):
    """Save credentials to disk."""
    try:
        os.makedirs(os.path.dirname(CREDENTIALS_FILE), exist_ok=True)
        with open(CREDENTIALS_FILE, "w", encoding="utf-8") as f:
            json.dump(creds, f, indent=2)
    except Exception as e:
        log.error("Could not write credentials.json: %s", e)


def prune_expired_credentials():
    """
    Auto-pruning daemon:
    Finds credentials whose valid_to date has passed, removes them from the
    terminal hardware via ISAPI (DS-K1T502, DS-K1T671, DS-K1T673, etc.),
    and updates their status to 'expired' so terminal slots stay free.
    """
    creds = load_credentials()
    now_iso = datetime.now().strftime("%Y-%m-%dT%H:%M:%S")
    updated = False

    with _state_lock:
        client = _active_client
        brand = _client_brand

    for c in creds:
        if c.get("status") == "active" and c.get("valid_to") and c["valid_to"] < now_iso:
            log.info("Pass for %s expired at %s. Deleting from terminal...", c.get("name"), c.get("valid_to"))
            if client and brand == "hikvision" and hasattr(client, "delete_guest_credential"):
                try:
                    client.delete_guest_credential(c.get("employee_no"), c.get("card_no"))
                except Exception as e:
                    log.warning("Terminal delete error for %s: %s", c.get("name"), e)
            c["status"] = "expired"
            updated = True

    if updated:
        save_credentials(creds)
        broadcast_sse({"event": "credential_updated"})


def credential_pruner_worker():
    """Background loop pruning expired passes every 60 seconds."""
    while True:
        try:
            prune_expired_credentials()
        except Exception as e:
            log.debug("Pruner tick exception: %s", e)
        time.sleep(60)


def start_credential_pruner():
    """Launch background credential pruner thread."""
    global _pruner_thread
    if _pruner_thread is None or not _pruner_thread.is_alive():
        _pruner_thread = threading.Thread(target=credential_pruner_worker, daemon=True, name="cred-pruner")
        _pruner_thread.start()


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
                        # "Open" on the dashboard doorbell popup / tile = input_button.press on our helpers
                        ws.send(json.dumps({
                            "id": 3,
                            "type": "subscribe_events",
                            "event_type": "call_service",
                        }))
                    elif mtype == "event":
                        event = msg.get("event", {})
                        ev_data = event.get("data", {})
                        if not LICENSE.allowed():
                            return
                        if event.get("event_type") == "call_service":
                            for door in doorbell.pressed_doors(ev_data):
                                threading.Thread(target=unlock_from_ha, args=(door, "dashboard"), daemon=True).start()
                            return
                        handle_mobile_notification_action(ev_data.get("action"), ev_data)
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
    global _last_ring_time, _ring_seq
    if not LICENSE.allowed():
        return
    ev = event_info.get("event")
    log.info("Received Door Station Event: %s", event_info)

    snapshot_filename = None
    history_fn = None
    if ev == "ring":
        now = time.time()
        # Debounce multiple ring triggers within 4 seconds
        if now - _last_ring_time < 4:
            return
        _last_ring_time = now

        # Grab and persist snapshot if enabled
        if _config_cache.get("auto_snapshot_on_ring", True):
            snap = None
            if _active_client:
                try:
                    snap = _active_client.get_snapshot()
                except Exception as e:
                    log.warning("Active client snapshot failed: %s", e)

            # Fallback: Home Assistant camera (option doorbell_camera_entity, else door-like cameras)
            sup_token = os.environ.get("SUPERVISOR_TOKEN")
            if not snap and sup_token:
                import urllib.request
                for cam_id in doorbell_camera_candidates():
                    try:
                        req = urllib.request.Request(
                            f"http://supervisor/core/api/camera_proxy/{cam_id}",
                            headers={"Authorization": f"Bearer {sup_token}"}
                        )
                        with urllib.request.urlopen(req, timeout=4) as r:
                            data = r.read()
                            if data and len(data) > 1000:
                                snap = data
                                log.info("Captured snapshot from Home Assistant entity %s (%d bytes)", cam_id, len(data))
                                break
                    except Exception:
                        continue

            if snap:
                try:
                    fn = f"ring_{datetime.now().strftime('%Y%m%d_%H%M%S')}.jpg"
                    fp = os.path.join(VISITORS_DIR, fn)
                    with open(fp, "wb") as f:
                        f.write(snap)
                    history_fn = fn
                    event_info["snapshot_url"] = f"api/visitors/image/{fn}"

                    published = publish_snapshot(snap, "ring")
                    if published:
                        snapshot_filename = published
                except Exception as e:
                    log.error("Failed to persist visitor snapshot: %s", e)

        record_visitor_event("doorbell_ring", "Doorbell button pressed", history_fn)
        notify_homeassistant_event("ajnetweb_doorbell_ring", event_info)
        # dashboard popup on wall panels and phones (sensor.ajnetweb_doorbell), closes by itself
        _ring_seq += 1
        cams = doorbell_camera_candidates()
        publish_doorbell(True, snapshot_filename, cams[0] if cams else None, event_info.get("station"))
        threading.Timer(doorbell.RING_SHOW_SEC, _end_ring, args=(_ring_seq,)).start()

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
    elif ev == "card_swiped":
        c_no = event_info.get("card_no", "Unknown")
        record_visitor_event("card_swipe", f"RFID Card swiped on door reader: {c_no}")
        notify_homeassistant_event("ajnetweb_card_swiped", event_info)

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
        time.sleep(3)


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
            return raw_path[raw_path.rfind("/api/"):]
        return raw_path

    def _send_json(self, data: dict, status: int = 200):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        self.end_headers()
        self.wfile.write(body)

    def _send_image(self, data: bytes, mime: str = "image/jpeg"):
        self.send_response(200)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(data)))
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

    def _allowed(self) -> bool:
        if self.client_address[0] in ALLOWED_CLIENTS:
            return True
        self.send_error(403, "Open the Door Station studio from the Home Assistant sidebar")
        return False

    def log_message(self, fmt, *args):
        log.debug("%s - %s", self.client_address[0], fmt % args)

    def do_HEAD(self):
        if self._allowed() and not ajn_license.handle(self, LICENSE):
            super().do_HEAD()

    def do_GET(self):
        if not self._allowed():
            return
        if ajn_license.handle(self, LICENSE):
            return
        parsed = urllib.parse.urlparse(self.path)
        path = self._normalize_path()
        query = urllib.parse.parse_qs(parsed.query)

        # ---------------------------------------------------------------- WebRTC Proxy & ICE
        if path == "/api/webrtc/ice":
            ice_servers = [{"urls": ["stun:stun.l.google.com:19302"]}]
            extra = (_config_cache.get("stun_server") or "").strip()
            if extra:
                ice_servers.append({"urls": [extra if extra.startswith(("stun:", "turn:")) else f"stun:{extra}"]})
            self._send_json({"ok": True, "iceServers": ice_servers})
            return

        # ---------------------------------------------------------------- Device Discovery (SADP & ONVIF)
        if path in ("/api/discover", "/api/discover/scan"):
            force = query.get("refresh", ["0"])[0] == "1"
            try:
                devs = scan_network(timeout_sec=2.5, force_refresh=force)
                self._send_json({"ok": True, "devices": devs, "count": len(devs)})
            except Exception as e:
                log.error("Network discovery error: %s", e)
                self._send_json({"ok": False, "error": str(e), "devices": []}, status=500)
            return

        # ---------------------------------------------------------------- Status & Multi-Device
        if path == "/api/status":
            with _state_lock:
                doors = list(_door_stations_list)
                indoors = list(_indoor_stations_list)
                act_id = _active_station_id
                cfg = dict(_config_cache)

            client, brand, active_dev = resolve_door_station(act_id)

            configured = bool(doors or indoors or client)
            if not configured:
                self._send_json({
                    "configured": False,
                    "door_stations_count": 0,
                    "indoor_stations_count": 0,
                    "brand": cfg.get("brand", "auto"),
                    "host": cfg.get("host", ""),
                    "message": "No intercom stations configured. Open SADP Scanner to discover and adopt devices.",
                })
                return

            info = {}
            call_st = {"status": "idle"}
            if client:
                try:
                    info = client.get_device_info()
                    call_st = client.get_call_status()
                except Exception:
                    pass

            self._send_json({
                "configured": True,
                "door_stations_count": len(doors),
                "indoor_stations_count": len(indoors),
                "active_station_id": act_id,
                "active_station_name": active_dev.get("name", "Door Station"),
                "brand": brand or "auto",
                "host": active_dev.get("host", cfg.get("host", "")),
                "http_port": active_dev.get("http_port", 80),
                "rtsp_port": active_dev.get("rtsp_port", 554),
                "door_1_name": active_dev.get("door_1_name", "Main Gate"),
                "door_2_name": active_dev.get("door_2_name", "Pedestrian Door"),
                "device_info": info,
                "call_status": call_st.get("status", "idle"),
                "door_stations": [
                    {
                        "id": d.get("id"),
                        "name": d.get("name", "Door Station"),
                        "host": d.get("host"),
                        "brand": d.get("brand"),
                        "online": d.get("id") in _door_clients,
                        "door_1_name": d.get("door_1_name", "Door 1"),
                        "door_2_name": d.get("door_2_name", "Door 2"),
                    }
                    for d in doors
                ],
                "indoor_stations": indoors,
            })
            return

        if path == "/api/devices":
            with _state_lock:
                safe_doors = []
                for d in _door_stations_list:
                    c = dict(d)
                    c["has_password"] = bool(c.get("password"))
                    if "password" in c:
                        c["password"] = "••••••••" if c["password"] else ""
                    c["online"] = c.get("id") in _door_clients
                    safe_doors.append(c)

                safe_indoors = []
                for ind in _indoor_stations_list:
                    c = dict(ind)
                    c["has_password"] = bool(c.get("password"))
                    if "password" in c:
                        c["password"] = "••••••••" if c["password"] else ""
                    c["online"] = True
                    safe_indoors.append(c)

            self._send_json({
                "ok": True,
                "door_stations": safe_doors,
                "indoor_stations": safe_indoors,
                "active_station_id": _active_station_id,
            })
            return

        # ---------------------------------------------------------------- Snapshot & MJPEG
        if path == "/api/snapshot":
            st_id = query.get("station_id", [None])[0]
            client, brand, dev = resolve_door_station(st_id)
            if client:
                try:
                    img = client.get_snapshot()
                    if img:
                        self._send_image(img, "image/jpeg")
                        return
                except Exception as e:
                    log.debug("Snapshot failed for station %s: %s", st_id, e)

            self._send_image(self._placeholder_jpeg(), "image/svg+xml")
            return

        if path == "/api/mjpeg":
            st_id = query.get("station_id", [None])[0]
            client, brand, dev = resolve_door_station(st_id)
            if not client:
                self.send_error(503, "Door Station not connected")
                return

            self.send_response(200)
            self.send_header("Content-Type", "multipart/x-mixed-replace; boundary=frame")
            self.send_header("Cache-Control", "no-cache, private, no-store, must-revalidate")
            self.send_header("Pragma", "no-cache")
            self.send_header("Expires", "0")
            self.send_header("X-Accel-Buffering", "no")
            self.end_headers()

            ph = self._placeholder_jpeg()
            try:
                while True:
                    img = client.get_snapshot()
                    if not img:
                        img = ph
                    self.wfile.write(b"--frame\r\n")
                    self.wfile.write(b"Content-Type: image/jpeg\r\n")
                    self.wfile.write(f"Content-Length: {len(img)}\r\n\r\n".encode("ascii"))
                    self.wfile.write(img)
                    self.wfile.write(b"\r\n")
                    self.wfile.flush()
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

        if path == "/api/credentials":
            with _state_lock:
                brand = _client_brand
                connected = bool(_active_client)
            self._send_json({
                "credentials": load_credentials(),
                "brand": brand,
                "connected": connected,
            })
            return

        if path == "/api/credentials/card/enroll/status":
            with _state_lock:
                client = _active_client
                active = _card_enroll_active
            isapi_active = False
            if client and hasattr(client, "get_issue_cards_mode"):
                try:
                    isapi_active = client.get_issue_cards_mode()
                except Exception:
                    pass
            self._send_json({"ok": True, "active": active or isapi_active})
            return

        if path == "/api/intercom/displays":
            with _state_lock:
                active_calls = list(_active_intercom_calls.values())
            self._send_json({
                "ok": True,
                "displays": get_active_displays(),
                "active_calls": active_calls,
            })
            return


        super().do_GET()

    def do_POST(self):
        if not self._allowed():
            return
        if ajn_license.handle(self, LICENSE):
            return
        parsed = urllib.parse.urlparse(self.path)
        path = self._normalize_path()
        query = urllib.parse.parse_qs(parsed.query)

        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length).decode("utf-8") if length > 0 else "{}"

        # ---------------------------------------------------------------- WebRTC Proxy (go2rtc bridge)
        if path == "/api/webrtc":
            st_id = query.get("station_id", [None])[0]
            client, brand, dev = resolve_door_station(st_id)
            base = go2rtc_base()
            if not client or not base:
                self._send_json({"ok": False, "error": "Live view needs a connected door station and go2rtc "
                                 "(built into Home Assistant 2024.11+, or the go2rtc add-on)."}, status=503)
                return
            try:
                stream = ensure_go2rtc_stream(base, dev, client, brand)
                go2rtc_url = f"{base}/api/webrtc?src={urllib.parse.quote(stream)}"
                sdp_bytes = body.encode("utf-8")
                req = urllib.request.Request(go2rtc_url, data=sdp_bytes)
                req.add_header("Content-Type", "application/sdp")
                with urllib.request.urlopen(req, timeout=10) as resp:
                    ans = resp.read()
                    self.send_response(200)
                    self.send_header("Content-Type", "application/sdp")
                    self.end_headers()
                    self.wfile.write(ans)
            except Exception as e:
                log.error("go2rtc WebRTC bridge error: %s", e)
                self._send_json({"ok": False, "error": f"go2rtc WebRTC bridge error: {e}"}, status=500)
            return

        try:
            payload = json.loads(body)
        except ValueError:
            payload = {}

        if path == "/api/unlock":
            door_id = int(payload.get("door", 1))
            st_id = payload.get("station_id")
            client, brand, dev = resolve_door_station(st_id)

            if not client:
                self._send_json({"ok": False, "error": "Door station not connected"}, status=503)
                return

            ok = client.unlock_door(door_id)
            door_name = dev.get(f"door_{door_id}_name", f"Door {door_id}")
            st_name = dev.get("name", "Door Station")
            if ok:
                record_visitor_event("door_unlock", f"Unlocked {door_name} ({st_name})")
                notify_homeassistant_event("ajnetweb_door_unlocked", {"door": door_id, "name": door_name, "station": st_name})
                broadcast_sse({"event": "door_unlocked", "door": door_id, "name": door_name, "station_id": dev.get("id")})
            self._send_json({"ok": ok, "door": door_id, "name": door_name, "station": st_name})
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
                        test_snap_fn = publish_snapshot(img, "test")
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

        if path == "/api/credentials/create":
            import random
            from datetime import timedelta
            name = (payload.get("name") or "Guest").strip()
            door = int(payload.get("door", 1))
            pin = (payload.get("pin") or "").strip()
            card_no = (payload.get("card_no") or "").strip()
            duration_hrs = float(payload.get("duration_hours", 4.0))

            if not pin:
                pin = f"{random.randint(100000, 999999)}"
            if not card_no:
                card_no = f"88{random.randint(100000, 999999)}"

            emp_no = f"g{int(time.time()) % 1000000:06d}"

            now = datetime.now()
            v_from = (payload.get("valid_from") or now.strftime("%Y-%m-%dT%H:%M:%S"))[:19]
            v_to = (payload.get("valid_to") or (now + timedelta(hours=duration_hrs)).strftime("%Y-%m-%dT%H:%M:%S"))[:19]

            with _state_lock:
                client = _active_client
                brand = _client_brand
                cfg = dict(_config_cache)

            synced = False
            sync_detail = "Offline / Local Pass"
            if client and brand == "hikvision" and hasattr(client, "create_guest_credential"):
                res = client.create_guest_credential(
                    employee_no=emp_no,
                    name=name,
                    card_no=card_no,
                    pin=pin,
                    valid_from=v_from,
                    valid_to=v_to,
                    door_no=door,
                )
                synced = res.get("ok", False)
                sync_detail = f"ISAPI: User {res.get('user_msg', 'OK')} / Card {res.get('card_msg', 'OK')}"
            elif client and brand == "dahua":
                synced = True
                sync_detail = "Dahua local pass profile"

            cred_item = {
                "id": f"cred_{int(time.time())}_{random.randint(100, 999)}",
                "employee_no": emp_no,
                "name": name,
                "door": door,
                "door_name": cfg.get(f"door_{door}_name", f"Door {door}"),
                "pin": pin,
                "card_no": card_no,
                "qr_token": card_no,
                "valid_from": v_from,
                "valid_to": v_to,
                "status": "active",
                "created_at": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "synced_to_terminal": synced,
                "sync_detail": sync_detail,
            }

            creds = load_credentials()
            creds.insert(0, cred_item)
            save_credentials(creds)
            broadcast_sse({"event": "credential_updated", "item": cred_item})

            self._send_json({"ok": True, "credential": cred_item})
            return

        if path == "/api/credentials/revoke":
            cred_id = payload.get("id")
            emp_no = payload.get("employee_no")

            with _state_lock:
                client = _active_client
                brand = _client_brand

            creds = load_credentials()
            target = None
            for c in creds:
                if (cred_id and c.get("id") == cred_id) or (emp_no and c.get("employee_no") == emp_no):
                    target = c
                    break

            if not target:
                self._send_json({"ok": False, "error": "Credential not found"}, status=404)
                return

            if client and brand == "hikvision" and hasattr(client, "delete_guest_credential"):
                try:
                    client.delete_guest_credential(target.get("employee_no"), target.get("card_no"))
                except Exception as e:
                    log.warning("Revoke delete failed: %s", e)

            target["status"] = "revoked"
            target["revoked_at"] = datetime.now().strftime("%Y-%m-%dT%H:%M:%SZ")
            save_credentials(creds)
            broadcast_sse({"event": "credential_updated", "item": target})

            self._send_json({"ok": True, "message": f"Credential for {target.get('name')} revoked."})
            return

        # ---------------------------------------------------------------- Display Registration & Heartbeat
        if path == "/api/intercom/displays/register":
            did = str(payload.get("display_id") or payload.get("id") or "").strip()
            name = (payload.get("room_name") or payload.get("name") or "Display").strip()
            dtype = (payload.get("device_type") or payload.get("type") or "tablet").strip()
            status = (payload.get("status") or "available").strip()  # available | busy | dnd
            if not did:
                self._send_json({"ok": False, "error": "display_id is required"}, status=400)
                return

            client_ip = self.client_address[0] if self.client_address else "127.0.0.1"
            item = {
                "id": did,
                "name": name,
                "device_type": dtype,
                "status": status,
                "last_seen": time.time(),
                "ip": client_ip,
            }
            with _state_lock:
                _connected_displays[did] = item
            broadcast_sse({"event": "intercom_display_updated", "display": item, "displays": get_active_displays()})
            self._send_json({"ok": True, "display": item})
            return

        # ---------------------------------------------------------------- Inter-Display WebRTC / Audio Calling
        if path == "/api/intercom/call":
            call_id = payload.get("call_id") or f"call_{int(time.time()*1000)}"
            from_id = payload.get("from_id")
            from_name = payload.get("from_name", "Unknown Room")
            to_id = payload.get("to_id")
            to_name = payload.get("to_name", "Target Room")
            call_type = payload.get("call_type", "audio")
            sdp_offer = payload.get("sdp_offer")

            call_record = {
                "call_id": call_id,
                "from_id": from_id,
                "from_name": from_name,
                "to_id": to_id,
                "to_name": to_name,
                "call_type": call_type,
                "state": "ringing",
                "start_time": time.time(),
            }
            with _state_lock:
                _active_intercom_calls[call_id] = call_record

            broadcast_sse({
                "event": "intercom_incoming_call",
                "call_id": call_id,
                "from_id": from_id,
                "from_name": from_name,
                "to_id": to_id,
                "to_name": to_name,
                "call_type": call_type,
                "sdp_offer": sdp_offer,
            })
            notify_homeassistant_event("ajnetweb_room_call_ring", {
                "call_id": call_id,
                "from_name": from_name,
                "to_name": to_name,
            })
            self._send_json({"ok": True, "call_id": call_id, "status": "ringing"})
            return

        if path == "/api/intercom/answer":
            call_id = payload.get("call_id")
            sdp_answer = payload.get("sdp_answer")
            with _state_lock:
                if call_id in _active_intercom_calls:
                    _active_intercom_calls[call_id]["state"] = "connected"

            broadcast_sse({
                "event": "intercom_call_answered",
                "call_id": call_id,
                "from_id": payload.get("from_id"),
                "to_id": payload.get("to_id"),
                "sdp_answer": sdp_answer,
            })
            self._send_json({"ok": True, "call_id": call_id, "status": "connected"})
            return

        if path == "/api/intercom/ice":
            call_id = payload.get("call_id")
            candidate = payload.get("candidate")
            broadcast_sse({
                "event": "intercom_ice_candidate",
                "call_id": call_id,
                "from_id": payload.get("from_id"),
                "to_id": payload.get("to_id"),
                "candidate": candidate,
            })
            self._send_json({"ok": True})
            return

        if path == "/api/intercom/hangup":
            call_id = payload.get("call_id")
            reason = payload.get("reason", "user_hangup")
            with _state_lock:
                if call_id in _active_intercom_calls:
                    del _active_intercom_calls[call_id]

            broadcast_sse({
                "event": "intercom_call_ended",
                "call_id": call_id,
                "reason": reason,
            })
            self._send_json({"ok": True, "call_id": call_id, "status": "ended"})
            return

        # ---------------------------------------------------------------- Villa All-Call / PA Broadcast
        if path == "/api/intercom/broadcast":
            from_name = payload.get("from_name", "Intercom")
            message = (payload.get("message") or "").strip()
            audio_base64 = payload.get("audio_data")

            broadcast_sse({
                "event": "intercom_broadcast",
                "from_name": from_name,
                "message": message,
                "audio_data": audio_base64,
                "timestamp": datetime.now().strftime("%H:%M:%S"),
            })
            record_visitor_event("villa_broadcast", f"All-Call from {from_name}: {message or 'Voice Message'}")
            notify_homeassistant_event("ajnetweb_villa_broadcast", {
                "from_name": from_name,
                "message": message,
            })
            self._send_json({"ok": True, "message": "Broadcast sent to all displays."})
            return

        # ---------------------------------------------------------------- Hardware Station SIP / ISAPI Bridge
        if path == "/api/intercom/hardware_call":
            target = str(payload.get("target", "101")).strip()
            with _state_lock:
                client = _active_client
                brand = _client_brand

            ok = False
            if client and brand == "hikvision" and hasattr(client, "call_signal"):
                ok = client.call_signal("request")

            # Broadcast incoming call to all wall displays & tablets
            broadcast_sse({
                "event": "incoming_call",
                "call_id": f"hw_call_{int(time.time()*1000)}",
                "from_id": "door_station",
                "from_name": "Outdoor Door Station",
                "to_id": target,
                "to_name": f"Station {target}",
                "call_type": "audio",
            })
            self._send_json({
                "ok": True,
                "target": target,
                "hardware_dial": ok,
                "message": f"Calling indoor station {target}...",
            })
            return

        # ---------------------------------------------------------------- Hardware Card & Biometric Enrollment
        if path == "/api/credentials/card/enroll/start":
            global _card_enroll_active
            with _state_lock:
                client = _active_client
                brand = _client_brand
            if not client:
                self._send_json({"ok": False, "error": "Door Station not connected"}, status=503)
                return

            ok = False
            if brand == "hikvision" and hasattr(client, "set_issue_cards_mode"):
                ok = client.set_issue_cards_mode(True)
            else:
                ok = True

            with _state_lock:
                _card_enroll_active = True

            threading.Thread(target=_auto_stop_card_enroll, args=(client,), daemon=True).start()
            broadcast_sse({"event": "card_enroll_started", "duration_sec": 60})
            self._send_json({
                "ok": True,
                "hardware_activated": ok,
                "duration_sec": 60,
                "message": "Outdoor station card reader activated in ENROLLMENT MODE! Please punch/swipe card on outdoor station now.",
            })
            return

        if path == "/api/credentials/card/enroll/stop":
            with _state_lock:
                client = _active_client
                brand = _client_brand
                _card_enroll_active = False

            if client and brand == "hikvision" and hasattr(client, "set_issue_cards_mode"):
                client.set_issue_cards_mode(False)

            broadcast_sse({"event": "card_enroll_stopped"})
            self._send_json({"ok": True, "message": "Card enrollment mode stopped."})
            return

        if path == "/api/credentials/biometric/enroll":
            bio_type = payload.get("type", "face")  # face | fingerprint
            with _state_lock:
                client = _active_client
                brand = _client_brand
            self._send_json({
                "ok": True,
                "type": bio_type,
                "supported": False if brand == "hikvision" and not hasattr(client, "capture_face") else True,
                "message": f"Biometric {bio_type} enrollment requested. For villa door stations (DS-KV8113), please use the outdoor RFID Card Punch button or PIN keypad.",
            })
            return

        if path == "/api/intercom/station/active":
            st_id = payload.get("station_id", "").strip()
            global _active_station_id
            with _state_lock:
                if st_id in _door_clients or any(d.get("id") == st_id for d in _door_stations_list):
                    _active_station_id = st_id
            self._send_json({"ok": True, "active_station_id": _active_station_id})
            return

        if path == "/api/devices":
            cat = payload.get("category", "door_station")  # door_station | indoor_station
            dev_id = payload.get("id") or f"{cat}_{int(time.time()*1000)}"
            host = payload.get("host", "").strip()
            if not host:
                self._send_json({"ok": False, "error": "Device host IP is required"}, status=400)
                return

            data = load_intercom_devices()
            target_list = data["door_stations"] if cat == "door_station" else data["indoor_stations"]
            existing = next((d for d in target_list if d.get("id") == dev_id or d.get("host") == host), None)

            pwd = payload.get("password", "")
            if existing and pwd == "••••••••":
                pwd = existing.get("password", "")

            updated = {
                "id": existing["id"] if existing else dev_id,
                "name": payload.get("name") or (f"Station {host}"),
                "host": host,
                "brand": payload.get("brand", "auto").lower(),
                "http_port": int(payload.get("http_port", 80) or 80),
                "rtsp_port": int(payload.get("rtsp_port", 554) or 554),
                "username": payload.get("username", "admin").strip(),
                "password": pwd,
                "enabled": payload.get("enabled", True),
            }
            if cat == "door_station":
                updated["door_1_name"] = payload.get("door_1_name", "Main Gate")
                updated["door_2_name"] = payload.get("door_2_name", "Pedestrian Door")
            else:
                updated["room"] = payload.get("room", "Living Room")
                updated["model"] = payload.get("model", "Indoor Touch Display")

            if existing:
                if cat == "door_station":
                    data["door_stations"] = [updated if d.get("id") == existing["id"] else d for d in data["door_stations"]]
                else:
                    data["indoor_stations"] = [updated if d.get("id") == existing["id"] else d for d in data["indoor_stations"]]
            else:
                target_list.append(updated)

            save_intercom_devices(data)
            self._send_json({"ok": True, "message": f"Saved {cat} {updated['name']}", "device": redact(updated)})
            return

        if path == "/api/devices/delete":
            dev_id = payload.get("id", "").strip()
            cat = payload.get("category", "door_station")
            data = load_intercom_devices()
            if cat == "indoor_station":
                data["indoor_stations"] = [d for d in data["indoor_stations"] if d.get("id") != dev_id]
            else:
                data["door_stations"] = [d for d in data["door_stations"] if d.get("id") != dev_id]
            save_intercom_devices(data)
            self._send_json({"ok": True, "message": f"Device {dev_id} removed"})
            return

        if path in ("/api/discover", "/api/discover/scan"):
            try:
                devs = scan_network(timeout_sec=2.5, force_refresh=True)
                self._send_json({"ok": True, "devices": devs, "count": len(devs)})
            except Exception as e:
                log.error("Network discovery error: %s", e)
                self._send_json({"ok": False, "error": str(e), "devices": []}, status=500)
            return

        if path == "/api/discover/adopt":
            batch_list = payload.get("devices")
            default_user = payload.get("default_username", "admin").strip()
            default_pwd = payload.get("default_password", "")

            data = load_intercom_devices()
            adopted_count = 0

            if isinstance(batch_list, list) and batch_list:
                for item in batch_list:
                    ip = item.get("ip", "").strip()
                    if not ip:
                        continue
                    brand = item.get("brand", "auto").lower()
                    model = item.get("model", "")
                    cat = item.get("category", "")
                    h_port = int(item.get("http_port", 80) or 80)
                    r_port = int(item.get("rtsp_port", 554) or 554)
                    u_name = (item.get("username") or default_user).strip()
                    p_word = item.get("password") if item.get("password") is not None else default_pwd

                    is_indoor = cat == "indoor_station" or "KH" in model.upper() or "DISPLAY" in model.upper() or "PANEL" in model.upper()

                    if is_indoor:
                        existing = next((d for d in data["indoor_stations"] if d.get("host") == ip), None)
                        entry = {
                            "id": existing["id"] if existing else f"indoor_{int(time.time()*1000)}_{adopted_count}",
                            "name": f"{brand.capitalize()} {model}" if model else f"Indoor Display ({ip})",
                            "room": item.get("room") or "Living Room",
                            "model": model or "Indoor Touch Display",
                            "host": ip,
                            "brand": brand,
                            "http_port": h_port,
                            "rtsp_port": r_port,
                            "username": u_name,
                            "password": p_word,
                            "enabled": True,
                        }
                        if existing:
                            data["indoor_stations"] = [entry if d.get("host") == ip else d for d in data["indoor_stations"]]
                        else:
                            data["indoor_stations"].append(entry)
                    else:
                        existing = next((d for d in data["door_stations"] if d.get("host") == ip), None)
                        entry = {
                            "id": existing["id"] if existing else f"door_{int(time.time()*1000)}_{adopted_count}",
                            "name": f"{brand.capitalize()} {model}" if model else f"Door Station ({ip})",
                            "host": ip,
                            "brand": brand,
                            "http_port": h_port,
                            "rtsp_port": r_port,
                            "username": u_name,
                            "password": p_word,
                            "door_1_name": item.get("door_1_name", "Main Gate"),
                            "door_2_name": item.get("door_2_name", "Pedestrian Door"),
                            "enabled": True,
                        }
                        if existing:
                            data["door_stations"] = [entry if d.get("host") == ip else d for d in data["door_stations"]]
                        else:
                            data["door_stations"].append(entry)
                    adopted_count += 1
            else:
                ip = payload.get("ip", "").strip()
                if not ip:
                    self._send_json({"ok": False, "error": "Device IP address is required"}, status=400)
                    return
                brand = payload.get("brand", "auto").lower()
                model = payload.get("model", "")
                cat = payload.get("category", "")
                h_port = int(payload.get("http_port", 80) or 80)
                r_port = int(payload.get("rtsp_port", 554) or 554)
                u_name = payload.get("username", "admin").strip()
                p_word = payload.get("password", "")

                is_indoor = cat == "indoor_station" or "KH" in model.upper() or "DISPLAY" in model.upper() or "PANEL" in model.upper()
                if is_indoor:
                    existing = next((d for d in data["indoor_stations"] if d.get("host") == ip), None)
                    entry = {
                        "id": existing["id"] if existing else f"indoor_{int(time.time()*1000)}",
                        "name": f"{brand.capitalize()} {model}" if model else f"Indoor Display ({ip})",
                        "room": payload.get("room", "Living Room"),
                        "model": model or "Indoor Touch Display",
                        "host": ip,
                        "brand": brand,
                        "http_port": h_port,
                        "rtsp_port": r_port,
                        "username": u_name,
                        "password": p_word,
                        "enabled": True,
                    }
                    if existing:
                        data["indoor_stations"] = [entry if d.get("host") == ip else d for d in data["indoor_stations"]]
                    else:
                        data["indoor_stations"].append(entry)
                else:
                    existing = next((d for d in data["door_stations"] if d.get("host") == ip), None)
                    entry = {
                        "id": existing["id"] if existing else f"door_{int(time.time()*1000)}",
                        "name": f"{brand.capitalize()} {model}" if model else f"Door Station ({ip})",
                        "host": ip,
                        "brand": brand,
                        "http_port": h_port,
                        "rtsp_port": r_port,
                        "username": u_name,
                        "password": p_word,
                        "door_1_name": payload.get("door_1_name", "Main Gate"),
                        "door_2_name": payload.get("door_2_name", "Pedestrian Door"),
                        "enabled": True,
                    }
                    if existing:
                        data["door_stations"] = [entry if d.get("host") == ip else d for d in data["door_stations"]]
                    else:
                        data["door_stations"].append(entry)
                adopted_count = 1

            save_intercom_devices(data)
            self._send_json({
                "ok": True,
                "count": adopted_count,
                "door_stations": len(data["door_stations"]),
                "indoor_stations": len(data["indoor_stations"]),
                "message": f"Successfully adopted {adopted_count} device(s) into Intercom Studio!",
            })
            return

        self._send_json({"ok": False, "error": f"Endpoint '{path}' not found"}, status=404)



def main():
    log.info("Starting AJ Netweb Intercom & Door Station Server on configured port %s...", PORT)
    init_client()
    start_ha_action_listener()
    start_credential_pruner()
    threading.Thread(target=doorbell_startup, daemon=True, name="doorbell-setup").start()

    # Ingress always connects to this exact port, so falling back to another port would only
    # hide the problem. Fail loudly instead (another host-network add-on is using it).
    server = ThreadedHTTPServer(("0.0.0.0", PORT), IntercomRequestHandler)
    log.info("Intercom HTTP Server listening on port %s", PORT)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        log.info("Shutting down Intercom server...")
        server.server_close()


if __name__ == "__main__":
    main()
