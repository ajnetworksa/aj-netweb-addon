#!/usr/bin/env python3
"""
AJ Netweb Dashboard Suite - Ingress web server & API.
"""

import json
import logging
import os
import urllib.parse
from http.server import HTTPServer, SimpleHTTPRequestHandler
from socketserver import ThreadingMixIn

from dashboard_engine import ADDON_VERSION, DashboardEngine

import ajn_license

LICENSE = ajn_license.License("dashboard", "AJ Netweb Dashboard Suite")

logging.basicConfig(level=logging.INFO, format="[%(asctime)s] %(levelname)s [%(name)s]: %(message)s")
log = logging.getLogger("dashboard.server")

WWW_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "www")
PORT = int(os.environ.get("INGRESS_PORT", 8099))
# Only the Supervisor ingress proxy may talk to us (the port is not published).
ALLOWED_CLIENTS = {"172.30.32.2", "127.0.0.1", "::1"}

engine = DashboardEngine(supervisor_token=os.environ.get("SUPERVISOR_TOKEN", ""))


class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


class DashboardRequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WWW_DIR, **kwargs)

    def log_message(self, fmt, *args):
        log.debug("%s - %s", self.client_address[0], fmt % args)

    def _allowed(self) -> bool:
        if os.environ.get("DASHBOARD_DEV") == "1" or self.client_address[0] in ALLOWED_CLIENTS:
            return True
        self._send_json({"ok": False, "error": "Forbidden"}, 403)
        return False

    def _path(self) -> str:
        raw = urllib.parse.urlparse(self.path).path
        return raw[raw.rfind("/api/"):] if "/api/" in raw else raw

    def _query(self):
        return {k: v[0] for k, v in urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query).items()}

    def _send_json(self, data, status: int = 200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def end_headers(self):
        if not self.path.startswith("/api/") and "/api/" not in self.path:
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def _guard(self, fn, *args):
        try:
            return fn(*args)
        except Exception as e:  # never let a request kill the thread silently
            log.exception("Request failed")
            self._send_json({"ok": False, "error": str(e)}, 500)

    # ------------------------------------------------------------------ GET
    def do_GET(self):
        if not self._allowed():
            return
        if ajn_license.handle(self, LICENSE):
            return
        path = self._path()
        routes = {
            "/api/status": lambda: {"ready": True, "version": ADDON_VERSION,
                                    "supervisor_connected": engine.client.connected},
            "/api/health": engine.health,
            "/api/project": lambda: {"ok": True, "project": engine.load_project()},
            "/api/themes": lambda: {"ok": True, "themes": engine.themes()},
            "/api/blueprints": lambda: {"ok": True, "blueprints": engine.list_blueprints()},
            "/api/backups": lambda: {"ok": True, "backups": engine.list_backups()},
            "/api/discovery": self._discovery,
            "/api/preview": lambda: {"ok": True, "config": engine.generate()},
        }
        if path in routes:
            self._guard(lambda: self._send_json(routes[path]()))
            return
        if path.startswith("/api/"):
            self._send_json({"ok": False, "error": f"Endpoint '{path}' not found"}, 404)
            return
        super().do_GET()

    def do_HEAD(self):
        if self._allowed() and not ajn_license.handle(self, LICENSE):
            super().do_HEAD()

    def _discovery(self):
        project = engine.load_project()
        model = engine.discover_raw()
        excluded = set(project.get("excluded_entities") or [])
        for area in model["areas"]:
            for value in area.values():
                if isinstance(value, list):
                    for e in value:
                        if isinstance(e, dict) and "entity_id" in e:
                            e["excluded"] = e["entity_id"] in excluded
        return {"ok": not model.get("errors"), "layout": model, "error": "; ".join(model.get("errors") or [])}

    # ------------------------------------------------------------------ POST
    def do_POST(self):
        if not self._allowed():
            return
        if ajn_license.handle(self, LICENSE):
            return
        path = self._path()
        length = int(self.headers.get("Content-Length") or 0)
        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8") or "{}") if length else {}
        except ValueError:
            self._send_json({"ok": False, "error": "Invalid JSON"}, 400)
            return

        def respond(res):
            self._send_json(res, 200 if res.get("ok") else 500)

        if path == "/api/project":
            self._guard(lambda: self._send_json({"ok": True, "project": engine.save_project(payload)}))
        elif path == "/api/deploy":
            self._guard(lambda: respond(engine.deploy(payload.get("project"))))
        elif path == "/api/preview":
            self._guard(lambda: self._send_json({"ok": True, "config": engine.generate(
                engine.save_project(payload["project"]) if payload.get("project") else None)}))
        elif path == "/api/blueprints/install":
            self._guard(lambda: respond(engine.install_bundled_blueprints()))
        elif path == "/api/install_resources":
            self._guard(lambda: respond(engine.install_card_suite()))
        elif path == "/api/themes/install":
            self._guard(lambda: respond(engine.install_themes()))
        elif path == "/api/backups/restore":
            self._guard(lambda: respond(engine.restore_backup(payload.get("file"))))
        else:
            self._send_json({"ok": False, "error": f"Endpoint '{path}' not found"}, 404)


def main():
    ajn_license.start_publisher(LICENSE)
    log.info("AJ Netweb Dashboard Suite %s listening on ingress port %s", ADDON_VERSION, PORT)
    log.info("Home Assistant config folder: %s", engine.config_dir)
    # Keep the card suite file current after add-on updates so existing dashboards get fixes
    if os.environ.get("AUTO_REGISTER_RESOURCES", "true") != "false":
        res = engine.install_card_suite()
        if not res.get("ok"):
            log.warning("Card suite not registered: %s", res.get("error"))
    server = ThreadedHTTPServer(("0.0.0.0", PORT), DashboardRequestHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.server_close()


if __name__ == "__main__":
    main()
