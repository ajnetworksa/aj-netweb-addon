#!/usr/bin/env python3
"""
Alexa Matter Bridge - status & device manager (served through HA ingress).

* Talks to Home Assistant only through the Supervisor proxy with SUPERVISOR_TOKEN.
* "Expose to Alexa" = the HA label configured in the add-on options. The
  matterbridge-hass plugin filters on that label (filterByLabel).
* Reads pairing codes from the Matterbridge log file.
"""

import argparse
import json
import os
import re
import subprocess
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from socketserver import ThreadingMixIn

import websocket

import voice

UI_DIR = Path(__file__).parent
TOKEN = os.environ.get("SUPERVISOR_TOKEN", "")
MB_DIR = Path(os.environ.get("MB_DIR", "/data/.matterbridge"))
LOG_FILE = MB_DIR / "matterbridge.log"
BACKUP_META = Path("/share/alexa_bridge/commissioning_backup.json")
ALLOWED_CLIENTS = {"172.30.32.2", "127.0.0.1", "::1"}
ANSI = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")

# Domains matterbridge-hass can bridge, and what Alexa does with them
SUPPORTED = {
    "light": "Light", "switch": "Switch", "fan": "Fan", "cover": "Shade / curtain",
    "climate": "Thermostat", "lock": "Lock", "valve": "Valve", "vacuum": "Vacuum",
    "scene": "Scene", "script": "Script", "input_boolean": "Switch", "media_player": "Media",
    "sensor": "Sensor", "binary_sensor": "Sensor", "button": "Button", "input_button": "Button",
    "select": "Select", "input_select": "Select", "remote": "Remote", "automation": "Automation",
    "event": "Event",
}
SENSOR_CLASSES = {"temperature", "humidity", "illuminance", "pressure", "pm25", "pm10",
                  "carbon_dioxide", "volatile_organic_compounds", "aqi"}
BINARY_CLASSES = {"door", "window", "opening", "garage_door", "motion", "occupancy", "presence",
                  "smoke", "carbon_monoxide", "moisture", "contact"}
SUGGESTED = {"light", "switch", "fan", "cover", "climate", "scene", "lock"}

STATE = {"label": "alexa", "restart_needed": False, "blacklist": []}
_lock = threading.Lock()


# ------------------------------------------------------------------ HA access
class HA:
    def __enter__(self):
        self.ws = websocket.create_connection("ws://supervisor/core/websocket", timeout=15)
        self._id = 0
        msg = json.loads(self.ws.recv())
        if msg.get("type") == "auth_required":
            self.ws.send(json.dumps({"type": "auth", "access_token": TOKEN}))
            msg = json.loads(self.ws.recv())
        if msg.get("type") != "auth_ok":
            raise RuntimeError("Home Assistant authentication failed")
        return self

    def __exit__(self, *a):
        try:
            self.ws.close()
        except Exception:
            pass

    def call(self, type_, **params):
        self._id += 1
        self.ws.send(json.dumps(dict(id=self._id, type=type_, **params)))
        while True:
            r = json.loads(self.ws.recv())
            if r.get("id") == self._id and r.get("type") == "result":
                if not r.get("success"):
                    raise RuntimeError((r.get("error") or {}).get("message", "request failed"))
                return r.get("result")


def supervisor(method, path, body=None, timeout=15):
    req = urllib.request.Request(f"http://supervisor{path}", method=method,
                                 data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        raw = r.read()
        return json.loads(raw) if raw else {}


def ensure_label(ha) -> str:
    """Return the label_id for the configured label name, creating it if missing."""
    name = STATE["label"]
    for lab in ha.call("config/label_registry/list"):
        if lab.get("name", "").lower() == name.lower():
            return lab["label_id"]
    created = ha.call("config/label_registry/create", name=name, icon="mdi:amazon-alexa", color="cyan")
    return created["label_id"]


def is_candidate(eid, reg, state):
    domain = eid.split(".", 1)[0]
    if domain not in SUPPORTED or domain in STATE["blacklist"]:
        return False
    if reg.get("disabled_by") or reg.get("hidden_by") or reg.get("entity_category"):
        return False
    dc = (state.get("attributes") or {}).get("device_class")
    if domain == "sensor" and dc not in SENSOR_CLASSES:
        return False
    if domain == "binary_sensor" and dc not in BINARY_CLASSES:
        return False
    return True


def list_entities():
    states = {s["entity_id"]: s for s in supervisor("GET", "/core/api/states")}
    with HA() as ha:
        label_id = ensure_label(ha)
        entities = ha.call("config/entity_registry/list")
        devices = {d["id"]: d for d in ha.call("config/device_registry/list")}
        areas = {a["area_id"]: a["name"] for a in ha.call("config/area_registry/list")}
    out = []
    for reg in entities:
        eid = reg["entity_id"]
        st = states.get(eid)
        if not st or not is_candidate(eid, reg, st):
            continue
        dev = devices.get(reg.get("device_id")) or {}
        area_id = reg.get("area_id") or dev.get("area_id")
        via_device = label_id in (dev.get("labels") or [])
        out.append({
            "entity_id": eid,
            "name": (st.get("attributes") or {}).get("friendly_name") or eid,
            "domain": eid.split(".", 1)[0],
            "kind": SUPPORTED[eid.split(".", 1)[0]],
            "area": areas.get(area_id, ""),
            "state": st.get("state"),
            "exposed": label_id in (reg.get("labels") or []) or via_device,
            "via_device": via_device,
            "suggested": eid.split(".", 1)[0] in SUGGESTED,
            "name_too_long": len((st.get("attributes") or {}).get("friendly_name") or "") > 32,
        })
    out.sort(key=lambda e: (e["area"] or "~", e["name"].lower()))
    return out


def voice_section():
    states = {s["entity_id"]: s for s in supervisor("GET", "/core/api/states")}
    with HA() as ha:
        label_id = ensure_label(ha)
        registry = ha.call("config/entity_registry/list")
    return {"ok": True, "groups": voice.voice_items(states, registry, label_id, STATE["blacklist"]),
            "blocked_domains": [d for d in voice.VOICE_DOMAINS if d in STATE["blacklist"]]}


def set_exposed(entity_ids, exposed: bool, rename: bool = False):
    changed = 0
    with HA() as ha:
        label_id = ensure_label(ha)
        current = {e["entity_id"]: e for e in ha.call("config/entity_registry/list")}
        for eid in entity_ids:
            reg = current.get(eid)
            if not reg:
                continue
            labels = set(reg.get("labels") or [])
            new = (labels | {label_id}) if exposed else (labels - {label_id})
            update = {"labels": sorted(new)} if new != labels else {}
            short = voice.rename_for(eid, reg) if rename and exposed else None
            if short:
                update["name"] = short   # a name Alexa can hear; only when nobody renamed it in HA yet
            if update:
                ha.call("config/entity_registry/update", entity_id=eid, **update)
                changed += 1
    if changed:
        STATE["restart_needed"] = True
    return changed


# ------------------------------------------------------------------ bridge status
def read_log_tail(max_bytes=400_000) -> str:
    try:
        with open(LOG_FILE, "rb") as f:
            f.seek(0, os.SEEK_END)
            size = f.tell()
            f.seek(max(0, size - max_bytes))
            return ANSI.sub("", f.read().decode("utf-8", "replace"))
    except OSError:
        return ""


def pairing_info():
    log = read_log_tail()
    qr = re.findall(r"qrcode\.html\?data=(MT:[A-Z0-9.\-]+)", log)
    manual = re.findall(r"Manual pairing code\s+(\d[\d\-]+)", log)
    commissioned = None
    for line in reversed(log.splitlines()):
        low = line.lower()
        if "decommissioned" in low:
            commissioned = False
            break
        if "is already commissioned" in low or "commissioning completed" in low or "commissioned successfully" in low:
            commissioned = True
            break
        if "not commissioned" in low or "qr code url" in low:
            commissioned = False
            break
    return {"qr": qr[-1] if qr else None, "manual": manual[-1] if manual else None,
            "commissioned": commissioned}


def bridge_running():
    try:
        return subprocess.run(["pgrep", "-f", "matterbridge -bridge"], capture_output=True).returncode == 0
    except OSError:
        return False


def versions():
    out = {}
    try:
        root = subprocess.run(["npm", "root", "-g"], capture_output=True, text=True).stdout.strip()
        for pkg in ("matterbridge", "matterbridge-hass"):
            out[pkg] = json.loads(Path(root, pkg, "package.json").read_text()).get("version")
    except Exception:
        pass
    return out


_VERSIONS = None


def status():
    global _VERSIONS
    if _VERSIONS is None:
        _VERSIONS = versions()
    backup = None
    try:
        backup = json.loads(BACKUP_META.read_text())
    except (OSError, ValueError):
        pass
    return {
        "bridge_running": bridge_running(),
        "pairing": pairing_info(),
        "label": STATE["label"],
        "restart_needed": STATE["restart_needed"],
        "backup": backup,
        "versions": _VERSIONS,
        "frontend_port": 8283,
    }


# ------------------------------------------------------------------ HTTP
class Server(ThreadingMixIn, HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def _allowed(self):
        if self.client_address[0] in ALLOWED_CLIENTS:
            return True
        self._json({"error": "Forbidden"}, 403)
        return False

    def _path(self):
        p = self.path.split("?", 1)[0]
        return p[p.rfind("/api/"):] if "/api/" in p else p

    def _json(self, data, status=200):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _file(self, name, ctype):
        body = (UI_DIR / name).read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(body)

    def _run(self, fn):
        try:
            self._json(fn())
        except urllib.error.HTTPError as e:
            self._json({"ok": False, "error": f"Supervisor HTTP {e.code}"}, 502)
        except Exception as e:
            self._json({"ok": False, "error": str(e)}, 500)

    def do_GET(self):
        if not self._allowed():
            return
        p = self._path()
        if p == "/" or p.endswith("/index.html") or p.endswith("/"):
            return self._file("index.html", "text/html; charset=utf-8")
        if p.endswith("/qrcode.js"):
            return self._file("qrcode.js", "application/javascript")
        if p == "/api/status":
            return self._run(status)
        if p == "/api/entities":
            return self._run(lambda: {"ok": True, "entities": list_entities()})
        if p == "/api/voice":
            return self._run(voice_section)
        if p == "/api/log":
            return self._run(lambda: {"ok": True, "log": "\n".join(read_log_tail(120_000).splitlines()[-300:])})
        self._json({"error": "Not found"}, 404)

    def do_POST(self):
        if not self._allowed():
            return
        length = int(self.headers.get("Content-Length") or 0)
        try:
            body = json.loads(self.rfile.read(length) or b"{}") if length else {}
        except ValueError:
            return self._json({"ok": False, "error": "Invalid JSON"}, 400)
        p = self._path()
        if p == "/api/expose":
            ids = [i for i in body.get("entity_ids", []) if isinstance(i, str)]
            return self._run(lambda: {"ok": True, "changed": set_exposed(ids, bool(body.get("exposed", True)))})
        if p == "/api/voice/expose":
            ids = [i for i in body.get("entity_ids", []) if isinstance(i, str)][:200]
            return self._run(lambda: {"ok": True, "changed": set_exposed(ids, bool(body.get("exposed", True)), rename=True)})
        if p == "/api/restart":
            def restart():
                with _lock:
                    STATE["restart_needed"] = False
                # Restarting the add-on reloads the plugin; Alexa keeps the pairing.
                threading.Timer(0.5, lambda: supervisor("POST", "/addons/self/restart")).start()
                return {"ok": True}
            return self._run(restart)
        if p == "/api/backup":
            def backup():
                r = subprocess.run(["/usr/bin/backup-commissioning.sh"], capture_output=True, text=True)
                return {"ok": r.returncode == 0, "output": (r.stdout + r.stderr).strip()}
            return self._run(backup)
        if p == "/api/restore":
            def restore():
                r = subprocess.run(["/usr/bin/restore-commissioning.sh", "--force"], capture_output=True, text=True)
                if r.returncode == 0:
                    threading.Timer(0.5, lambda: supervisor("POST", "/addons/self/restart")).start()
                return {"ok": r.returncode == 0, "output": (r.stdout + r.stderr).strip()}
            return self._run(restore)
        self._json({"error": "Not found"}, 404)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8285)
    ap.add_argument("--label", default="alexa")
    args = ap.parse_args()
    STATE["label"] = args.label or "alexa"
    try:
        opts = json.loads(Path("/data/options.json").read_text())
        STATE["blacklist"] = voice.effective_blacklist(opts.get("excluded_entity_prefixes", []))
    except (OSError, ValueError):
        pass
    def prepare_label():
        # Create the label early so the plugin's filter finds it on first start
        for _ in range(20):
            try:
                with HA() as ha:
                    ensure_label(ha)
                return
            except Exception as e:
                print(f"[ui] waiting for Home Assistant: {e}", flush=True)
                time.sleep(6)
    threading.Thread(target=prepare_label, daemon=True).start()
    print(f"[ui] Alexa Bridge UI on :{args.port} (ingress only)", flush=True)
    Server(("0.0.0.0", args.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
