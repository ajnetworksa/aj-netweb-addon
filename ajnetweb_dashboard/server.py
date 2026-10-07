#!/usr/bin/env python3
"""
AJ Netweb Dashboard Suite - Ingress Web Server & API Bridge
"""

import json
import logging
import os
import sys
import urllib.parse
from http.server import HTTPServer, SimpleHTTPRequestHandler
from socketserver import ThreadingMixIn

from dashboard_engine import DashboardEngine

logging.basicConfig(level=logging.INFO, format="[%(asctime)s] %(levelname)s [%(name)s]: %(message)s")
log = logging.getLogger("dashboard.server")

WWW_DIR = os.path.join(os.path.dirname(__file__), "www")
PORT = int(os.environ.get("INGRESS_PORT", 8099))
SUPERVISOR_TOKEN = os.environ.get("SUPERVISOR_TOKEN", "")

engine = DashboardEngine(supervisor_token=SUPERVISOR_TOKEN)


class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


class DashboardRequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WWW_DIR, **kwargs)

    def _normalize_path(self) -> str:
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

    def do_GET(self):
        path = self._normalize_path()
        parsed = urllib.parse.urlparse(self.path)
        query = urllib.parse.parse_qs(parsed.query)

        if path == "/api/status":
            self._send_json({
                "ready": True,
                "version": "1.0.0",
                "supervisor_connected": bool(SUPERVISOR_TOKEN),
            })
            return

        if path == "/api/discovery":
            try:
                layout = engine.discover_house_layout()
                self._send_json({"ok": True, "layout": layout})
            except Exception as e:
                log.error("Discovery error: %s", e)
                self._send_json({"ok": False, "error": str(e)}, status=500)
            return

        if path == "/api/preview":
            theme_key = query.get("theme", ["cyber_luxury"])[0]
            title = query.get("title", ["Smart Residence"])[0]
            try:
                layout = engine.discover_house_layout()
                preview_cfg = engine.generate_dashboard(theme_key, title, layout["areas"])
                self._send_json({"ok": True, "theme": theme_key, "config": preview_cfg})
            except Exception as e:
                self._send_json({"ok": False, "error": str(e)}, status=500)
            return

        if path == "/api/blueprints":
            blueprints = engine.list_blueprints()
            self._send_json({"ok": True, "blueprints": blueprints})
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

        if path == "/api/blueprints/install":
            res = engine.install_bundled_blueprints()
            self._send_json(res, status=200 if res.get("ok") else 500)
            return

        if path == "/api/deploy":
            theme = payload.get("theme", "cyber_luxury")
            dashboard_url = payload.get("dashboard_url", "ajnetweb")
            title = payload.get("title", "AJ Netweb Smart Home")
            selected_areas = payload.get("selected_areas")

            res = engine.deploy_to_homeassistant(
                theme_key=theme,
                dashboard_url=dashboard_url,
                title=title,
                selected_areas=selected_areas,
            )
            self._send_json(res, status=200 if res.get("ok") else 500)
            return

        if path == "/api/install_resources":
            ok = engine.install_bundled_resources()
            self._send_json({"ok": ok, "message": "Resources installed to /config/www/ajnetweb/"})
            return

        self.send_error(404, "Endpoint not found")


def main():
    log.info("Starting AJ Netweb Dashboard Suite Server on Ingress port %s...", PORT)
    # Auto-copy resources on startup
    engine.install_bundled_resources()

    server = ThreadedHTTPServer(("0.0.0.0", PORT), DashboardRequestHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        log.info("Shutting down Dashboard server...")
        server.server_close()


if __name__ == "__main__":
    main()
