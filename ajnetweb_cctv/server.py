#!/usr/bin/env python3
"""
AJ Netweb CCTV & NVR Studio - Main Web & Streaming Server (High Performance)
Provides Home Assistant Ingress UI, Multi-Threaded Live Camera Wall, PTZ Control, and NVR Playback.
"""

import json
import logging
import os
import sys
import time
import urllib.parse
from datetime import datetime, timezone
from http.server import HTTPServer, SimpleHTTPRequestHandler
from socketserver import ThreadingMixIn
from threading import Lock

try:
    from device_discovery import scan_network
except ImportError:
    log = logging.getLogger("cctv.server")
    log.warning("device_discovery module not found; SADP discovery fallback active.")
    def scan_network(*args, **kwargs):
        return []

from nvr_dahua import DahuaClient
from nvr_hikvision import HikvisionClient


logging.basicConfig(level=logging.INFO, format="[%(asctime)s] %(levelname)s [%(name)s]: %(message)s")
log = logging.getLogger("cctv.server")

OPTIONS_FILE = "/data/options.json"
WWW_DIR = os.path.join(os.path.dirname(__file__), "www")
PORT = int(os.environ.get("INGRESS_PORT", 8098))

DEVICES_FILE = "/data/devices.json"

_state_lock = Lock()
_devices_list = []
_device_clients = {}
_channel_map = {}
_active_client = None
_client_brand = None
_config_cache = {}


class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    """Multi-threaded HTTP server allowing parallel low-latency MJPEG camera streams."""
    daemon_threads = True
    allow_reuse_address = True


def load_config() -> dict:
    """Load settings from environment and /data/options.json."""
    cfg = {
        "nvr_brand": os.environ.get("NVR_BRAND", "auto"),
        "host": os.environ.get("NVR_HOST", ""),
        "http_port": int(os.environ.get("NVR_HTTP_PORT", 80) or 80),
        "rtsp_port": int(os.environ.get("NVR_RTSP_PORT", 554) or 554),
        "username": os.environ.get("NVR_USERNAME", "admin"),
        "password": os.environ.get("NVR_PASSWORD", ""),
        "stream_quality": os.environ.get("STREAM_QUALITY", "sub"),
        "refresh_interval_sec": int(os.environ.get("REFRESH_INTERVAL", 2) or 2),
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
    """Save updated options to /data/options.json."""
    cur = load_config()
    cur.update(new_cfg)
    try:
        os.makedirs(os.path.dirname(OPTIONS_FILE), exist_ok=True)
        with open(OPTIONS_FILE, "w") as f:
            json.dump(cur, f, indent=2)
    except Exception as e:
        log.error("Could not write options.json: %s", e)
    init_client(cur)


def load_devices() -> list:
    """Load surveillance devices list from /data/devices.json; fallback to options.json."""
    devs = []
    if os.path.exists(DEVICES_FILE):
        try:
            with open(DEVICES_FILE, "r") as f:
                data = json.load(f)
                if isinstance(data, list):
                    devs = data
        except Exception as e:
            log.warning("Could not read devices.json: %s", e)

    # If no devices configured, seed from options.json if host is present
    cfg = load_config()
    host = cfg.get("host", "").strip()
    if not devs and host:
        devs = [{
            "id": "dev_primary",
            "name": "Primary Surveillance Unit",
            "host": host,
            "brand": cfg.get("nvr_brand", "auto"),
            "device_type": "nvr",
            "http_port": int(cfg.get("http_port", 80) or 80),
            "rtsp_port": int(cfg.get("rtsp_port", 554) or 554),
            "username": cfg.get("username", "admin"),
            "password": cfg.get("password", ""),
            "enabled": True,
        }]
        save_devices(devs)
    return devs


def save_devices(devs: list):
    """Save devices list and re-initialize all device clients."""
    try:
        os.makedirs(os.path.dirname(DEVICES_FILE), exist_ok=True)
        with open(DEVICES_FILE, "w") as f:
            json.dump(devs, f, indent=2)
    except Exception as e:
        log.error("Could not write devices.json: %s", e)
    init_all_devices(devs)


def _connect_single_device(dev: dict):
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
        client = HikvisionClient(host, http_port, rtsp_port, user, pwd)
        detected_brand = "hikvision"
    elif brand == "dahua":
        client = DahuaClient(host, http_port, rtsp_port, user, pwd)
        detected_brand = "dahua"
    else:  # auto detect
        try:
            hk = HikvisionClient(host, http_port, rtsp_port, user, pwd, timeout=3)
            info = hk.get_device_info()
            if info.get("model") != "Unknown" or info.get("serial") != "Unknown":
                client = hk
                detected_brand = "hikvision"
        except Exception:
            pass

        if not client:
            try:
                dh = DahuaClient(host, http_port, rtsp_port, user, pwd, timeout=3)
                info = dh.get_device_info()
                if info.get("model") != "Unknown" or info.get("serial") != "Unknown":
                    client = dh
                    detected_brand = "dahua"
            except Exception:
                pass

        if not client:
            client = HikvisionClient(host, http_port, rtsp_port, user, pwd)
            detected_brand = "hikvision"

    return client, detected_brand


def init_all_devices(devs: list = None):
    """Initialize clients for all configured surveillance devices and build global channel map."""
    global _devices_list, _device_clients, _channel_map, _active_client, _client_brand
    with _state_lock:
        if devs is None:
            devs = load_devices()
        _devices_list = devs

        new_clients = {}
        new_channel_map = {}
        primary_client = None
        primary_brand = None
        global_cid_counter = 1

        for dev in devs:
            dev_id = dev.get("id") or f"dev_{int(time.time()*1000)}"
            dev["id"] = dev_id
            if not dev.get("enabled", True):
                continue

            try:
                client, detected_brand = _connect_single_device(dev)
                if not client:
                    continue

                if primary_client is None:
                    primary_client = client
                    primary_brand = detected_brand

                channels = []
                try:
                    channels = client.get_channels()
                except Exception as e:
                    log.warning("Could not query channels for %s (%s): %s", dev.get("name"), dev.get("host"), e)
                    channels = [{
                        "id": 1,
                        "name": dev.get("name") or "Main Camera",
                        "online": True,
                        "ptz_support": True,
                        "rtsp_main": f"rtsp://{dev.get('host')}:{dev.get('rtsp_port', 554)}/h264/ch1/main/av_stream",
                        "rtsp_sub": f"rtsp://{dev.get('host')}:{dev.get('rtsp_port', 554)}/h264/ch1/sub/av_stream",
                    }]

                new_clients[dev_id] = {
                    "client": client,
                    "brand": detected_brand,
                    "device": dev,
                    "channels": channels,
                }

                for ch in channels:
                    orig_cid = ch.get("id", 1)
                    g_cid = global_cid_counter
                    global_cid_counter += 1

                    mapping = {
                        "global_id": g_cid,
                        "unique_id": f"{dev_id}_{orig_cid}",
                        "client": client,
                        "brand": detected_brand,
                        "dev_cid": orig_cid,
                        "device_id": dev_id,
                        "device_name": dev.get("name", "Camera"),
                        "device_ip": dev.get("host", ""),
                        "channel_name": ch.get("name", f"Camera {orig_cid}"),
                        "online": ch.get("online", True),
                        "ptz_support": ch.get("ptz_support", False),
                        "rtsp_main": ch.get("rtsp_main", ""),
                        "rtsp_sub": ch.get("rtsp_sub", ""),
                    }

                    new_channel_map[str(g_cid)] = mapping
                    new_channel_map[f"{dev_id}_{orig_cid}"] = mapping
                    if dev == devs[0]:
                        new_channel_map[str(orig_cid)] = mapping

            except Exception as e:
                log.error("Failed to connect device %s (%s): %s", dev.get("name"), dev.get("host"), e)

        _device_clients = new_clients
        _channel_map = new_channel_map
        _active_client = primary_client
        _client_brand = primary_brand
        log.info("Initialized %d surveillance devices with %d total camera channels.", len(new_clients), len(new_channel_map) // 2 or len(new_channel_map))


def resolve_channel(cid_raw):
    """Resolve channel ID (int or str) to (client, dev_cid, brand, info)."""
    with _state_lock:
        cid_str = str(cid_raw).strip()
        if cid_str in _channel_map:
            m = _channel_map[cid_str]
            return m["client"], m["dev_cid"], m["brand"], m

        # Fallback to active primary client
        if _active_client:
            try:
                num = int(cid_raw)
            except (ValueError, TypeError):
                num = 1
            return _active_client, num, _client_brand, {}
        return None, 1, None, {}


def init_client(cfg: dict = None):
    """Initialize or update NVR client based on config (backward-compatibility alias)."""
    global _config_cache
    with _state_lock:
        if cfg is None:
            cfg = load_config()
        _config_cache = cfg
    init_all_devices()


class CCTVRequestHandler(SimpleHTTPRequestHandler):
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
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        self.end_headers()
        self.wfile.write(body)

    def _send_image(self, data: bytes, mime: str = "image/jpeg", filename: str = None):
        self.send_response(200)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Access-Control-Allow-Origin", "*")
        if filename:
            self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
        else:
            self.send_header("Cache-Control", "public, max-age=1")
        self.end_headers()
        self.wfile.write(data)

    def _placeholder_jpeg(self, label: str = "Camera") -> bytes:
        """Fallback SVG to return if camera snapshot is not available."""
        svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
  <rect width="640" height="360" fill="#080c14" />
  <circle cx="320" cy="160" r="50" fill="#111827" stroke="#1f2937" stroke-width="4"/>
  <circle cx="320" cy="160" r="24" fill="#0284c7" opacity="0.3"/>
  <circle cx="320" cy="160" r="10" fill="#38bdf8"/>
  <text x="320" y="240" font-family="-apple-system, sans-serif" font-size="18" fill="#94a3b8" text-anchor="middle" font-weight="600">{label}</text>
  <text x="320" y="265" font-family="-apple-system, sans-serif" font-size="12" fill="#475569" text-anchor="middle">Awaiting NVR stream...</text>
</svg>"""
        return svg.encode("utf-8")

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = self._normalize_path()
        query = urllib.parse.parse_qs(parsed.query)

        # ---------------------------------------------------------------- API Endpoints
        if path == "/api/discover":
            force = query.get("refresh", ["0"])[0] == "1"
            try:
                devs = scan_network(timeout_sec=2.5, force_refresh=force)
                self._send_json({"ok": True, "devices": devs, "count": len(devs)})
            except Exception as e:
                log.error("Network discovery error: %s", e)
                self._send_json({"ok": False, "error": str(e), "devices": []}, status=500)
            return

        if path == "/api/status":
            with _state_lock:
                devs = list(_devices_list)
                active_cl = _active_client
                brand = _client_brand
                cfg = dict(_config_cache)
                unique_channels = {m["unique_id"] for m in _channel_map.values()}

            if not devs and not active_cl:
                self._send_json({
                    "configured": False,
                    "devices_count": 0,
                    "channels_count": 0,
                    "brand": cfg.get("nvr_brand", "auto"),
                    "host": cfg.get("host", ""),
                    "message": "No surveillance devices configured. Use the SADP Scanner to discover and adopt devices.",
                })
                return

            self._send_json({
                "configured": True,
                "devices_count": len(devs),
                "channels_count": len(unique_channels),
                "brand": brand or "auto",
                "host": devs[0].get("host") if devs else cfg.get("host", ""),
                "http_port": devs[0].get("http_port", 80) if devs else 80,
                "rtsp_port": devs[0].get("rtsp_port", 554) if devs else 554,
                "stream_quality": cfg.get("stream_quality", "sub"),
                "devices": [
                    {
                        "id": d.get("id"),
                        "name": d.get("name", "Camera"),
                        "host": d.get("host"),
                        "brand": d.get("brand"),
                        "device_type": d.get("device_type", "camera"),
                        "online": d.get("id") in _device_clients,
                    }
                    for d in devs
                ],
            })
            return

        if path == "/api/devices":
            with _state_lock:
                safe_devs = []
                for d in _devices_list:
                    c = dict(d)
                    c["has_password"] = bool(c.get("password"))
                    if "password" in c:
                        c["password"] = "••••••••" if c["password"] else ""
                    dev_id = c.get("id")
                    client_info = _device_clients.get(dev_id)
                    c["online"] = client_info is not None
                    c["brand_detected"] = client_info.get("brand") if client_info else c.get("brand")
                    c["channels_count"] = len(client_info.get("channels", [])) if client_info else 0
                    safe_devs.append(c)
            self._send_json({"ok": True, "devices": safe_devs, "count": len(safe_devs)})
            return

        if path == "/api/channels":
            with _state_lock:
                seen = set()
                out = []
                for k, m in _channel_map.items():
                    uid = m["unique_id"]
                    if uid not in seen:
                        seen.add(uid)
                        dev_name = m["device_name"]
                        ch_name = m["channel_name"]
                        display_name = f"{dev_name} · {ch_name}" if len(_devices_list) > 1 else ch_name
                        out.append({
                            "id": m["global_id"],
                            "unique_id": uid,
                            "name": display_name,
                            "device_id": m["device_id"],
                            "device_name": dev_name,
                            "device_ip": m["device_ip"],
                            "channel_number": m["dev_cid"],
                            "online": m["online"],
                            "ptz_support": m["ptz_support"],
                            "rtsp_main": m["rtsp_main"],
                            "rtsp_sub": m["rtsp_sub"],
                        })
                out.sort(key=lambda x: x["id"])
            self._send_json(out)
            return

        if path.startswith("/api/snapshot/"):
            cid_raw = path.split("/")[-1]
            client, dev_cid, brand, info = resolve_channel(cid_raw)
            is_download = query.get("download", ["0"])[0] == "1"
            filename = f"Camera_{cid_raw}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.jpg" if is_download else None

            if client:
                try:
                    img = client.get_snapshot(dev_cid)
                    if img:
                        self._send_image(img, "image/jpeg", filename=filename)
                        return
                except Exception as e:
                    log.debug("Snapshot fetch failed (%s): %s", cid_raw, e)

            # Fallback placeholder
            label = info.get("channel_name", f"Camera {cid_raw}") if info else f"Camera {cid_raw}"
            ph = self._placeholder_jpeg(label)
            self._send_image(ph, "image/svg+xml", filename=filename)
            return

        if path.startswith("/api/mjpeg/"):
            cid_raw = path.split("/")[-1]
            client, dev_cid, brand, info = resolve_channel(cid_raw)
            if not client:
                self.send_error(503, f"Camera channel {cid_raw} not connected")
                return

            self.send_response(200)
            self.send_header("Content-Type", "multipart/x-mixed-replace; boundary=frame")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Cache-Control", "no-cache, private")
            self.end_headers()

            label = info.get("channel_name", f"Camera {cid_raw}") if info else f"Camera {cid_raw}"
            ph = self._placeholder_jpeg(label)
            try:
                while True:
                    img = client.get_snapshot(dev_cid)
                    if not img:
                        img = ph
                    self.wfile.write(b"--frame\r\n")
                    self.wfile.write(b"Content-Type: image/jpeg\r\n\r\n")
                    self.wfile.write(img)
                    self.wfile.write(b"\r\n")
                    time.sleep(0.35)  # Smooth ~3 FPS
            except (BrokenPipeError, ConnectionResetError, OSError):
                pass
            return

        if path == "/api/recordings/search":
            cid_raw = query.get("channel", ["1"])[0]
            dt = query.get("date", [time.strftime("%Y-%m-%d")])[0]
            client, dev_cid, brand, info = resolve_channel(cid_raw)
            if not client:
                self._send_json({"results": []})
                return
            try:
                results = client.search_recordings(dev_cid, dt)
                self._send_json({"ok": True, "channel": cid_raw, "date": dt, "results": results})
            except Exception as e:
                log.error("Recordings search failed for %s: %s", cid_raw, e)
                self._send_json({"ok": False, "error": str(e), "results": []}, status=500)
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

        # Fallback to standard static file server
        super().do_GET()

    def do_POST(self):
        path = self._normalize_path()

        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length).decode("utf-8") if length > 0 else "{}"
        try:
            payload = json.loads(body)
        except ValueError:
            payload = {}

        if path == "/api/config":
            save_config(payload)
            self._send_json({"ok": True, "message": "Configuration updated successfully"})
            return

        if path == "/api/devices":
            # Add or update single device
            dev_id = payload.get("id") or f"dev_{int(time.time()*1000)}"
            host = payload.get("host", "").strip()
            if not host:
                self._send_json({"ok": False, "error": "Device host IP is required"}, status=400)
                return

            devs = load_devices()
            existing = next((d for d in devs if d.get("id") == dev_id or d.get("host") == host), None)

            pwd = payload.get("password", "")
            if existing and pwd == "••••••••":
                pwd = existing.get("password", "")

            updated_dev = {
                "id": existing["id"] if existing else dev_id,
                "name": payload.get("name") or (f"Surveillance Unit ({host})"),
                "host": host,
                "brand": payload.get("brand", "auto").lower(),
                "device_type": payload.get("device_type", "camera"),
                "http_port": int(payload.get("http_port", 80) or 80),
                "rtsp_port": int(payload.get("rtsp_port", 554) or 554),
                "username": payload.get("username", "admin").strip(),
                "password": pwd,
                "enabled": payload.get("enabled", True),
            }

            if existing:
                devs = [updated_dev if d.get("id") == existing["id"] else d for d in devs]
            else:
                devs.append(updated_dev)

            save_devices(devs)
            self._send_json({"ok": True, "message": f"Saved device {updated_dev['name']}", "device": updated_dev})
            return

        if path == "/api/devices/delete":
            dev_id = payload.get("id", "").strip()
            if not dev_id:
                self._send_json({"ok": False, "error": "Device ID is required"}, status=400)
                return

            devs = [d for d in load_devices() if d.get("id") != dev_id]
            save_devices(devs)
            self._send_json({"ok": True, "message": f"Device {dev_id} removed", "remaining": len(devs)})
            return

        if path == "/api/ptz/control":
            cid_raw = payload.get("channel", 1)
            code = payload.get("code", "")
            action = payload.get("action", "start")  # start | stop | continuous
            speed = int(payload.get("speed", 5))

            client, dev_cid, brand, info = resolve_channel(cid_raw)
            if not client:
                self._send_json({"ok": False, "error": f"Camera channel {cid_raw} not connected"}, status=503)
                return

            success = False
            try:
                if brand == "hikvision":
                    if action == "stop":
                        success = client.ptz_stop(dev_cid)
                    else:
                        pan, tilt, zoom = 0, 0, 0
                        sp_scaled = max(10, min(speed * 10, 100))
                        if code == "Up":
                            tilt = sp_scaled
                        elif code == "Down":
                            tilt = -sp_scaled
                        elif code == "Left":
                            pan = -sp_scaled
                        elif code == "Right":
                            pan = sp_scaled
                        elif code == "LeftUp":
                            pan, tilt = -sp_scaled, sp_scaled
                        elif code == "RightUp":
                            pan, tilt = sp_scaled, sp_scaled
                        elif code == "LeftDown":
                            pan, tilt = -sp_scaled, -sp_scaled
                        elif code == "RightDown":
                            pan, tilt = sp_scaled, -sp_scaled
                        elif code == "ZoomIn":
                            zoom = sp_scaled
                        elif code == "ZoomOut":
                            zoom = -sp_scaled
                        success = client.ptz_continuous(dev_cid, pan, tilt, zoom)
                else:  # Dahua
                    if action == "stop":
                        success = client.ptz_stop(dev_cid, code)
                    else:
                        success = client.ptz_start(dev_cid, code, speed)

                self._send_json({"ok": success, "channel": cid_raw, "code": code, "action": action})
            except Exception as e:
                log.error("PTZ execution failed: %s", e)
                self._send_json({"ok": False, "error": str(e)}, status=500)
            return

        if path == "/api/ptz/preset":
            cid_raw = payload.get("channel", 1)
            preset_id = int(payload.get("preset", 1))
            action = payload.get("action", "goto")  # goto | set

            client, dev_cid, brand, info = resolve_channel(cid_raw)
            if not client:
                self._send_json({"ok": False, "error": f"Camera channel {cid_raw} not connected"}, status=503)
                return

            try:
                ok = client.ptz_preset(dev_cid, preset_id, action)
                self._send_json({"ok": ok, "channel": cid_raw, "preset": preset_id, "action": action})
            except Exception as e:
                log.error("PTZ preset failed: %s", e)
                self._send_json({"ok": False, "error": str(e)}, status=500)
            return

        if path == "/api/discover/adopt":
            # Supports both Batch Adoption (devices: [...]) and Single Adoption (ip: "...")
            batch_list = payload.get("devices")
            default_user = payload.get("default_username", "admin").strip()
            default_pwd = payload.get("default_password", "")

            devs = load_devices()
            adopted_count = 0

            if isinstance(batch_list, list) and batch_list:
                for item in batch_list:
                    ip = item.get("ip", "").strip()
                    if not ip:
                        continue
                    brand = item.get("brand", "auto").lower()
                    model = item.get("model", "")
                    cat = item.get("category", "camera")
                    name = item.get("name") or (f"{brand.capitalize()} {model}" if model else f"Device {ip}")
                    h_port = int(item.get("http_port", 80) or 80)
                    r_port = int(item.get("rtsp_port", 554) or 554)
                    u_name = (item.get("username") or default_user).strip()
                    p_word = item.get("password") if item.get("password") is not None else default_pwd

                    existing = next((d for d in devs if d.get("host") == ip), None)
                    new_entry = {
                        "id": existing["id"] if existing else f"dev_{int(time.time()*1000)}_{adopted_count}",
                        "name": name,
                        "host": ip,
                        "brand": brand,
                        "device_type": "nvr" if cat == "nvr" else "camera",
                        "http_port": h_port,
                        "rtsp_port": r_port,
                        "username": u_name,
                        "password": p_word,
                        "enabled": True,
                    }
                    if existing:
                        devs = [new_entry if d.get("host") == ip else d for d in devs]
                    else:
                        devs.append(new_entry)
                    adopted_count += 1
            else:
                # Single device adopt
                ip = payload.get("ip", "").strip()
                if not ip:
                    self._send_json({"ok": False, "error": "Device IP address is required"}, status=400)
                    return
                brand = payload.get("brand", "auto").lower()
                model = payload.get("model", "")
                cat = payload.get("category", "camera")
                name = payload.get("name") or (f"{brand.capitalize()} {model}" if model else f"Device {ip}")
                h_port = int(payload.get("http_port", 80) or 80)
                r_port = int(payload.get("rtsp_port", 554) or 554)
                u_name = payload.get("username", "admin").strip()
                p_word = payload.get("password", "")

                existing = next((d for d in devs if d.get("host") == ip), None)
                new_entry = {
                    "id": existing["id"] if existing else f"dev_{int(time.time()*1000)}",
                    "name": name,
                    "host": ip,
                    "brand": brand,
                    "device_type": "nvr" if cat == "nvr" else "camera",
                    "http_port": h_port,
                    "rtsp_port": r_port,
                    "username": u_name,
                    "password": p_word,
                    "enabled": True,
                }
                if existing:
                    devs = [new_entry if d.get("host") == ip else d for d in devs]
                else:
                    devs.append(new_entry)
                adopted_count = 1

            save_devices(devs)
            self._send_json({
                "ok": True,
                "count": adopted_count,
                "total_devices": len(devs),
                "message": f"Successfully adopted {adopted_count} device(s) into CCTV Studio!",
                "devices": devs,
            })
            return

        self._send_json({"ok": False, "error": f"Endpoint '{path}' not found"}, status=404)


def main():
    log.info("Starting AJ Netweb CCTV & NVR Studio Threaded HTTP Server on port %s...", PORT)
    init_client()
    server = ThreadedHTTPServer(("0.0.0.0", PORT), CCTVRequestHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        log.info("Shutting down CCTV server...")
        server.server_close()


if __name__ == "__main__":
    main()
