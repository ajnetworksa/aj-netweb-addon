#!/usr/bin/env python3
"""
server.py — Alexa Matter Bridge Status UI
Lightweight Python HTTP server (no external deps beyond stdlib).
Serves the status page and proxies HA API calls for entity management.
"""

import argparse
import json
import os
import subprocess
import urllib.request
import urllib.error
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from datetime import datetime, timezone

# ──────────────────────────────────────────────────────────────
# Config (injected via CLI args from run.sh)
# ──────────────────────────────────────────────────────────────
CONFIG = {}

UI_DIR = Path(__file__).parent


def ha_request(method: str, path: str, body=None) -> dict:
    """Make a request to the HA REST API."""
    url = f"http://{CONFIG['ha_host']}:{CONFIG['ha_port']}/api{path}"
    headers = {
        "Authorization": f"Bearer {CONFIG['ha_token']}",
        "Content-Type": "application/json",
    }
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return {"error": str(e), "code": e.code}
    except Exception as e:
        return {"error": str(e)}


def get_bridge_status() -> dict:
    """Check if Matterbridge process is alive and return status."""
    try:
        result = subprocess.run(
            ["pgrep", "-f", "matterbridge"],
            capture_output=True, text=True
        )
        running = result.returncode == 0
    except Exception:
        running = False

    backup_exists = Path(CONFIG["data_dir"], "commissioning_backup.tar.gz").exists()
    backup_meta_path = Path(CONFIG["data_dir"], "commissioning_backup.json")
    backup_time = None
    if backup_meta_path.exists():
        try:
            meta = json.loads(backup_meta_path.read_text())
            backup_time = meta.get("created_at")
        except Exception:
            pass

    return {
        "bridge_running": running,
        "backup_exists": backup_exists,
        "last_backup": backup_time,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "matter_port": CONFIG.get("matter_port", 5540),
        "expose_label": CONFIG.get("expose_label", "alexa"),
    }


def get_exposed_entities() -> list:
    """Get all HA entities that have the expose label."""
    states = ha_request("GET", "/states")
    if isinstance(states, dict) and "error" in states:
        return []

    label = CONFIG["expose_label"]
    exposed = []
    for entity in states:
        labels = entity.get("attributes", {}).get("labels", [])
        if label in labels:
            exposed.append({
                "entity_id": entity["entity_id"],
                "state": entity["state"],
                "name": entity.get("attributes", {}).get("friendly_name", entity["entity_id"]),
                "domain": entity["entity_id"].split(".")[0],
            })
    return sorted(exposed, key=lambda e: e["entity_id"])


class AlexaBridgeHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass  # Suppress access logs (HA add-on logs via bashio)

    def send_json(self, data, status=200):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", len(body))
        self.end_headers()
        self.wfile.write(body)

    def send_html(self, html: str, status=200):
        body = html.encode()
        self.send_response(status)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", len(body))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/" or self.path == "/index.html":
            html_path = UI_DIR / "index.html"
            self.send_html(html_path.read_text())

        elif self.path == "/api/status":
            self.send_json({
                "bridge": get_bridge_status(),
                "exposed_entities": get_exposed_entities(),
            })

        elif self.path == "/api/backup":
            # Trigger a manual backup
            result = subprocess.run(
                ["/usr/bin/backup-commissioning.sh"],
                capture_output=True, text=True
            )
            self.send_json({
                "success": result.returncode == 0,
                "output": result.stdout + result.stderr
            })

        else:
            self.send_json({"error": "Not found"}, 404)

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length)) if length else {}

        if self.path == "/api/entity/expose":
            entity_id = body.get("entity_id")
            label = CONFIG["expose_label"]
            if not entity_id:
                self.send_json({"error": "entity_id required"}, 400)
                return
            result = subprocess.run(
                ["/usr/bin/entity-manager.sh", "add", entity_id],
                capture_output=True, text=True
            )
            self.send_json({"success": result.returncode == 0, "output": result.stdout})

        elif self.path == "/api/entity/hide":
            entity_id = body.get("entity_id")
            if not entity_id:
                self.send_json({"error": "entity_id required"}, 400)
                return
            result = subprocess.run(
                ["/usr/bin/entity-manager.sh", "remove", entity_id],
                capture_output=True, text=True
            )
            self.send_json({"success": result.returncode == 0, "output": result.stdout})

        else:
            self.send_json({"error": "Not found"}, 404)


def main():
    parser = argparse.ArgumentParser(description="Alexa Matter Bridge UI")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8098)
    parser.add_argument("--ha-host", default="homeassistant")
    parser.add_argument("--ha-port", type=int, default=8123)
    parser.add_argument("--ha-token", required=True)
    parser.add_argument("--expose-label", default="alexa")
    parser.add_argument("--data-dir", default="/data")
    args = parser.parse_args()

    CONFIG.update({
        "ha_host": args.ha_host,
        "ha_port": args.ha_port,
        "ha_token": args.ha_token,
        "expose_label": args.expose_label,
        "data_dir": args.data_dir,
    })

    server = HTTPServer((args.host, args.port), AlexaBridgeHandler)
    print(f"[UI] Alexa Bridge status UI listening on {args.host}:{args.port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
