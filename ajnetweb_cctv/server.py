#!/usr/bin/env python3
"""
AJ Netweb CCTV & NVR Studio - Main Web & Streaming Server
Provides Home Assistant Ingress UI, Live Camera Wall, PTZ Control, and NVR Playback.
"""

import json
import logging
import os
import sys
import time
import urllib.parse
from http.server import HTTPServer, SimpleHTTPRequestHandler
from threading import Lock

from nvr_dahua import DahuaClient
from nvr_hikvision import HikvisionClient

logging.basicConfig(level=logging.INFO, format="[%(asctime)s] %(levelname)s [%(name)s]: %(message)s")
log = logging.getLogger("cctv.server")

OPTIONS_FILE = "/data/options.json"
WWW_DIR = os.path.join(os.path.dirname(__file__), "www")
PORT = int(os.environ.get("INGRESS_PORT", 8098))

_state_lock = Lock()
_active_client = None
_client_brand = None
_config_cache = {}


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


def init_client(cfg: dict = None):
    """Initialize or update NVR client based on config."""
    global _active_client, _client_brand, _config_cache
    with _state_lock:
        if cfg is None:
            cfg = load_config()
        _config_cache = cfg

        host = cfg.get("host", "").strip()
        if not host:
            _active_client = None
            _client_brand = None
            log.info("No NVR host configured yet.")
            return

        brand = cfg.get("nvr_brand", "auto").lower()
        http_port = int(cfg.get("http_port", 80) or 80)
        rtsp_port = int(cfg.get("rtsp_port", 554) or 554)
        user = cfg.get("username", "admin").strip()
        pwd = cfg.get("password", "")

        log.info("Connecting to NVR at %s:%s (brand preference: %s)...", host, http_port, brand)

        client = None
        detected_brand = None

        if brand == "hikvision":
            client = HikvisionClient(host, http_port, rtsp_port, user, pwd)
            detected_brand = "hikvision"
        elif brand == "dahua":
            client = DahuaClient(host, http_port, rtsp_port, user, pwd)
            detected_brand = "dahua"
        else:  # auto detect
            # Try Hikvision first
            try:
                hk = HikvisionClient(host, http_port, rtsp_port, user, pwd, timeout=3)
                info = hk.get_device_info()
                if info.get("model") != "Unknown" or info.get("serial") != "Unknown":
                    client = hk
                    detected_brand = "hikvision"
                    log.info("Auto-detected Hikvision NVR: %s", info.get("model"))
            except Exception:
                pass

            # Try Dahua if Hikvision didn't respond
            if not client:
                try:
                    dh = DahuaClient(host, http_port, rtsp_port, user, pwd, timeout=3)
                    info = dh.get_device_info()
                    if info.get("model") != "Unknown" or info.get("serial") != "Unknown":
                        client = dh
                        detected_brand = "dahua"
                        log.info("Auto-detected Dahua NVR: %s", info.get("model"))
                except Exception:
                    pass

            # If neither answered cleanly, default to Hikvision client
            if not client:
                log.info("Auto-detection undetermined; defaulting to Hikvision ISAPI client.")
                client = HikvisionClient(host, http_port, rtsp_port, user, pwd)
                detected_brand = "hikvision"

        _active_client = client
        _client_brand = detected_brand


class CCTVRequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WWW_DIR, **kwargs)

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

    def _placeholder_jpeg(self, label: str = "Camera") -> bytes:
        """Fallback SVG to return if camera snapshot is not available."""
        svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
  <rect width="640" height="360" fill="#0d1117" />
  <circle cx="320" cy="160" r="50" fill="#161b22" stroke="#30363d" stroke-width="4"/>
  <circle cx="320" cy="160" r="24" fill="#0366d6" opacity="0.3"/>
  <circle cx="320" cy="160" r="10" fill="#58a6ff"/>
  <text x="320" y="240" font-family="-apple-system, sans-serif" font-size="18" fill="#8b949e" text-anchor="middle" font-weight="600">{label}</text>
  <text x="320" y="265" font-family="-apple-system, sans-serif" font-size="12" fill="#484f58" text-anchor="middle">Awaiting NVR stream...</text>
</svg>"""
        return svg.encode("utf-8")

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)

        # ---------------------------------------------------------------- API Endpoints
        if path == "/api/status":
            with _state_lock:
                client = _active_client
                brand = _client_brand
                cfg = _config_cache

            if not client:
                self._send_json({
                    "configured": False,
                    "brand": cfg.get("nvr_brand", "auto"),
                    "host": cfg.get("host", ""),
                    "message": "NVR not configured. Please enter your NVR IP and credentials.",
                })
                return

            try:
                info = client.get_device_info()
                channels = client.get_channels()
                self._send_json({
                    "configured": True,
                    "brand": brand,
                    "host": cfg.get("host"),
                    "http_port": cfg.get("http_port"),
                    "rtsp_port": cfg.get("rtsp_port"),
                    "stream_quality": cfg.get("stream_quality", "sub"),
                    "device_info": info,
                    "channels_count": len(channels),
                })
            except Exception as e:
                self._send_json({"configured": True, "error": str(e), "brand": brand})
            return

        if path == "/api/channels":
            with _state_lock:
                client = _active_client
            if not client:
                self._send_json([])
                return
            try:
                channels = client.get_channels()
                self._send_json(channels)
            except Exception as e:
                log.error("Failed to get channels: %s", e)
                self._send_json([], status=500)
            return

        if path.startswith("/api/snapshot/"):
            try:
                cid = int(path.split("/")[-1])
            except ValueError:
                self.send_error(400, "Invalid channel ID")
                return

            with _state_lock:
                client = _active_client
            if client:
                try:
                    img = client.get_snapshot(cid)
                    if img:
                        self._send_image(img, "image/jpeg")
                        return
                except Exception as e:
                    log.debug("Snapshot fetch failed (ch %s): %s", cid, e)

            # Fallback placeholder
            ph = self._placeholder_jpeg(f"Camera {cid}")
            self._send_image(ph, "image/svg+xml")
            return

        if path.startswith("/api/mjpeg/"):
            try:
                cid = int(path.split("/")[-1])
            except ValueError:
                self.send_error(400, "Invalid channel ID")
                return

            with _state_lock:
                client = _active_client
            if not client:
                self.send_error(503, "NVR not connected")
                return

            # MJPEG stream: send multipart/x-mixed-replace
            self.send_response(200)
            self.send_header("Content-Type", "multipart/x-mixed-replace; boundary=frame")
            self.send_header("Cache-Control", "no-cache, private")
            self.end_headers()

            try:
                while True:
                    img = client.get_snapshot(cid)
                    if not img:
                        img = self._placeholder_jpeg(f"Camera {cid}")
                    self.wfile.write(b"--frame\r\n")
                    self.wfile.write(b"Content-Type: image/jpeg\r\n\r\n")
                    self.wfile.write(img)
                    self.wfile.write(b"\r\n")
                    time.sleep(0.35)  # ~3 FPS smooth stream
            except (BrokenPipeError, ConnectionResetError):
                pass
            return

        if path == "/api/recordings/search":
            cid = int(query.get("channel", [1])[0])
            dt = query.get("date", [time.strftime("%Y-%m-%d")])[0]
            with _state_lock:
                client = _active_client
            if not client:
                self._send_json({"results": []})
                return
            try:
                results = client.search_recordings(cid, dt)
                self._send_json({"ok": True, "channel": cid, "date": dt, "results": results})
            except Exception as e:
                log.error("Recordings search failed: %s", e)
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
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length).decode("utf-8") if length > 0 else "{}"
        try:
            payload = json.loads(body)
        except ValueError:
            payload = {}

        if path == "/api/config":
            # Update configuration
            save_config(payload)
            self._send_json({"ok": True, "message": "Configuration updated successfully"})
            return

        if path == "/api/ptz/control":
            cid = int(payload.get("channel", 1))
            code = payload.get("code", "")
            action = payload.get("action", "start")  # start | stop | continuous
            speed = int(payload.get("speed", 5))

            with _state_lock:
                client = _active_client
                brand = _client_brand

            if not client:
                self._send_json({"ok": False, "error": "NVR not connected"}, status=503)
                return

            success = False
            try:
                if brand == "hikvision":
                    if action == "stop":
                        success = client.ptz_stop(cid)
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
                        success = client.ptz_continuous(cid, pan, tilt, zoom)
                else:  # Dahua
                    if action == "stop":
                        success = client.ptz_stop(cid, code)
                    else:
                        success = client.ptz_start(cid, code, speed)

                self._send_json({"ok": success, "channel": cid, "code": code, "action": action})
            except Exception as e:
                log.error("PTZ execution failed: %s", e)
                self._send_json({"ok": False, "error": str(e)}, status=500)
            return

        if path == "/api/ptz/preset":
            cid = int(payload.get("channel", 1))
            preset_id = int(payload.get("preset", 1))
            action = payload.get("action", "goto")  # goto | set

            with _state_lock:
                client = _active_client

            if not client:
                self._send_json({"ok": False, "error": "NVR not connected"}, status=503)
                return

            try:
                ok = client.ptz_preset(cid, preset_id, action)
                self._send_json({"ok": ok, "channel": cid, "preset": preset_id, "action": action})
            except Exception as e:
                log.error("PTZ preset failed: %s", e)
                self._send_json({"ok": False, "error": str(e)}, status=500)
            return

        self.send_error(404, "Endpoint not found")


def main():
    log.info("Starting AJ Netweb CCTV & NVR Studio HTTP Server on port %s...", PORT)
    init_client()
    server = HTTPServer(("0.0.0.0", PORT), CCTVRequestHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        log.info("Shutting down CCTV server...")
        server.server_close()


if __name__ == "__main__":
    main()
