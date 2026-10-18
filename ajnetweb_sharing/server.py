#!/usr/bin/env python3
"""
AJ Netweb Room & Guest Pass Studio - Server Engine
Visual User Permission Matrix, Zero-App Guest QR Codes, and Automated Lovelace Visibility Sync.
"""

import json
import logging
import os
import secrets
import sys
import threading
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from http.server import HTTPServer, SimpleHTTPRequestHandler
from socketserver import ThreadingMixIn
from threading import Lock

import ajn_license

LICENSE = ajn_license.License("sharing", "AJ Netweb Room & Guest Pass Studio")

logging.basicConfig(level=logging.INFO, format="[%(asctime)s] %(levelname)s [%(name)s]: %(message)s")
log = logging.getLogger("sharing.server")

OPTIONS_FILE = "/data/options.json"
DATA_DIR = "/data/sharing"
PASSES_FILE = "/data/sharing/guest_passes.json"
USER_PERMS_FILE = "/data/sharing/user_permissions.json"
AUDIT_LOG_FILE = "/data/sharing/access_audit.json"
WWW_DIR = os.path.join(os.path.dirname(__file__), "www")
PORT = int(os.environ.get("INGRESS_PORT", 8096))
# Guests have no Home Assistant account, so the guest portal is served on its own
# port (mapped in config.json). Only guest.html and the token-checked guest API live there.
GUEST_PORT = int(os.environ.get("GUEST_PORT", 8097))
# The admin studio answers the Supervisor ingress proxy only.
ALLOWED_CLIENTS = {"172.30.32.2", "127.0.0.1", "::1"}

# Services a guest may call, per domain. Anything else is rejected.
GUEST_SERVICES = {
    "light": {"turn_on", "turn_off", "toggle"},
    "switch": {"turn_on", "turn_off", "toggle"},
    "fan": {"turn_on", "turn_off", "toggle", "set_percentage"},
    "climate": {"set_temperature", "set_hvac_mode", "set_fan_mode", "turn_on", "turn_off"},
    "cover": {"open_cover", "close_cover", "stop_cover", "set_cover_position"},
    "media_player": {"media_play_pause", "media_play", "media_pause", "volume_set", "volume_up",
                     "volume_down", "turn_on", "turn_off"},
    "scene": {"turn_on"},
    "lock": {"lock", "unlock"},
}
PIN_MAX_FAILS = 5
PIN_LOCK_SECONDS = 900
_pin_fails = {}  # token -> (count, locked_until)

os.makedirs(DATA_DIR, exist_ok=True)

_lock = threading.RLock()  # re-entrant: guest control updates passes while holding it
_cache_lock = Lock()
_ha_cache = {
    "areas": [],
    "devices": [],
    "entities": [],
    "states": {},
    "users": [],
    "last_fetched": 0,
}


class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


# ------------------------------------------------------------------ Configuration
def load_config() -> dict:
    cfg = {
        "default_pass_hours": int(os.environ.get("DEFAULT_PASS_HOURS", 24) or 24),
        "allow_guest_climate": os.environ.get("ALLOW_GUEST_CLIMATE", "true").lower() == "true",
        "allow_guest_lights": os.environ.get("ALLOW_GUEST_LIGHTS", "true").lower() == "true",
        "allow_guest_covers": os.environ.get("ALLOW_GUEST_COVERS", "true").lower() == "true",
        "allow_guest_locks": os.environ.get("ALLOW_GUEST_LOCKS", "false").lower() == "true",
        "auto_prune_expired": os.environ.get("AUTO_PRUNE", "true").lower() == "true",
        "guest_base_url": os.environ.get("GUEST_BASE_URL", ""),
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
    cur = load_config()
    cur.update(new_cfg)
    try:
        with open(OPTIONS_FILE, "w") as f:
            json.dump(cur, f, indent=2)
    except Exception as e:
        log.error("Could not write options.json: %s", e)


# ------------------------------------------------------------------ Data Persistence
def load_passes() -> list:
    with _lock:
        if os.path.exists(PASSES_FILE):
            try:
                with open(PASSES_FILE) as f:
                    return json.load(f)
            except Exception:
                pass
        return []


def save_passes(passes: list):
    with _lock:
        try:
            with open(PASSES_FILE, "w") as f:
                json.dump(passes, f, indent=2)
        except Exception as e:
            log.error("Could not save passes: %s", e)


def load_user_permissions() -> dict:
    with _lock:
        if os.path.exists(USER_PERMS_FILE):
            try:
                with open(USER_PERMS_FILE) as f:
                    return json.load(f)
            except Exception:
                pass
        return {}


def save_user_permissions(perms: dict):
    with _lock:
        try:
            with open(USER_PERMS_FILE, "w") as f:
                json.dump(perms, f, indent=2)
        except Exception as e:
            log.error("Could not save user permissions: %s", e)


def log_audit_action(actor: str, action: str, entity_id: str = "", area: str = "", details: str = ""):
    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "actor": actor,
        "action": action,
        "entity_id": entity_id,
        "area": area,
        "details": details,
    }
    with _lock:
        history = []
        if os.path.exists(AUDIT_LOG_FILE):
            try:
                with open(AUDIT_LOG_FILE) as f:
                    history = json.load(f)
            except Exception:
                pass
        history.insert(0, entry)
        history = history[:300]  # Retain last 300 actions
        try:
            with open(AUDIT_LOG_FILE, "w") as f:
                json.dump(history, f, indent=2)
        except Exception as e:
            log.error("Audit log error: %s", e)


# ------------------------------------------------------------------ Home Assistant API Bridge
def ha_rest_call(endpoint: str, method: str = "GET", data: dict = None) -> any:
    """Call Home Assistant Core REST API using SUPERVISOR_TOKEN."""
    sup_token = os.environ.get("SUPERVISOR_TOKEN")
    if not sup_token:
        return None

    url = f"http://supervisor/core/api/{endpoint.lstrip('/')}"
    headers = {
        "Authorization": f"Bearer {sup_token}",
        "Content-Type": "application/json",
    }
    body = json.dumps(data).encode("utf-8") if data is not None else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=7) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw) if raw else None
    except Exception as e:
        log.debug("HA REST call %s failed: %s", endpoint, e)
        return None


def ha_ws_call(msg_type: str, **kwargs) -> any:
    """Execute single query via Home Assistant Core WebSocket API."""
    sup_token = os.environ.get("SUPERVISOR_TOKEN")
    if not sup_token:
        return None

    try:
        import websocket
        ws = websocket.create_connection("ws://supervisor/core/websocket", timeout=5)
        # 1. Auth required
        auth_req = json.loads(ws.recv())
        if auth_req.get("type") != "auth_required":
            ws.close()
            return None

        # 2. Authenticate
        ws.send(json.dumps({"type": "auth", "access_token": sup_token}))
        auth_resp = json.loads(ws.recv())
        if auth_resp.get("type") != "auth_ok":
            ws.close()
            return None

        # 3. Send query
        payload = {"id": 1, "type": msg_type}
        payload.update(kwargs)
        ws.send(json.dumps(payload))

        # 4. Receive result
        result = json.loads(ws.recv())
        ws.close()
        if result.get("success"):
            return result.get("result")
        else:
            log.debug("HA WS %s returned error: %s", msg_type, result.get("error"))
            return None
    except Exception as e:
        log.debug("HA WS query %s failed: %s", msg_type, e)
        return None


def refresh_ha_metadata(force: bool = False):
    """Fetch areas, devices, entities, users, and states with 30s cache."""
    global _ha_cache
    now = time.time()
    with _cache_lock:
        if not force and now - _ha_cache["last_fetched"] < 30:
            return

        # 1. Fetch Areas
        areas = ha_ws_call("config/area_registry/list") or []

        # 2. Fetch Devices
        devices = ha_ws_call("config/device_registry/list") or []

        # 3. Fetch Entities
        entities = ha_ws_call("config/entity_registry/list") or []

        # 4. Fetch Users (skip Supervisor / content users that HA creates itself)
        users = [u for u in (ha_ws_call("config/auth/list") or []) if not u.get("system_generated")]
        for u in users:
            u["is_admin"] = bool(u.get("is_owner")) or "system-admin" in (u.get("group_ids") or [])

        # 5. Fetch States via REST
        states_list = ha_rest_call("states") or []
        states_dict = {s["entity_id"]: s for s in states_list}

        # Build area-to-devices map
        device_area_map = {}
        for dev in devices:
            if dev.get("id") and dev.get("area_id"):
                device_area_map[dev["id"]] = dev["area_id"]

        # Build entity-to-area map
        entity_area_map = {}
        for ent in entities:
            ent_id = ent.get("entity_id")
            if not ent_id:
                continue
            # Direct area assigned to entity
            if ent.get("area_id"):
                entity_area_map[ent_id] = ent["area_id"]
            # Fallback to device's area
            elif ent.get("device_id") and ent["device_id"] in device_area_map:
                entity_area_map[ent_id] = device_area_map[ent["device_id"]]

        _ha_cache = {
            "areas": areas,
            "devices": devices,
            "entities": entities,
            "entity_area_map": entity_area_map,
            "users": users,
            "states": states_dict,
            "last_fetched": now,
        }
        log.debug("Refreshed HA metadata: %d areas, %d entities, %d users.", len(areas), len(entities), len(users))


def get_area_entities(area_id: str, allowed_domains: list = None) -> list:
    """Retrieve all entity states belonging to a specific area/room."""
    refresh_ha_metadata()
    with _cache_lock:
        e_map = _ha_cache.get("entity_area_map", {})
        states = _ha_cache.get("states", {})

    result = []
    for ent_id, a_id in e_map.items():
        if a_id == area_id:
            domain = ent_id.split(".")[0]
            if allowed_domains and domain not in allowed_domains:
                continue
            st = states.get(ent_id)
            if st:
                result.append({
                    "entity_id": ent_id,
                    "domain": domain,
                    "name": st.get("attributes", {}).get("friendly_name", ent_id),
                    "state": st.get("state"),
                    "attributes": st.get("attributes", {}),
                })
    # Sort nicely: climate first, then light, cover, switch
    order = {"climate": 0, "light": 1, "cover": 2, "switch": 3, "media_player": 4, "sensor": 5}
    result.sort(key=lambda x: (order.get(x["domain"], 9), x["name"]))
    return result


def execute_ha_service(domain: str, service: str, service_data: dict) -> bool:
    """Call a service in Home Assistant Core."""
    res = ha_rest_call(f"services/{domain}/{service}", method="POST", data=service_data)
    return res is not None


def guest_domains_allowed(cfg: dict = None) -> set:
    """Domains guests may ever control, capped by the add-on options."""
    cfg = cfg or load_config()
    allowed = {"switch", "fan", "media_player", "scene"}
    if cfg.get("allow_guest_lights", True):
        allowed.add("light")
    if cfg.get("allow_guest_climate", True):
        allowed.add("climate")
    if cfg.get("allow_guest_covers", True):
        allowed.add("cover")
    if cfg.get("allow_guest_locks", False):
        allowed.add("lock")
    return allowed


def guest_base_url() -> str:
    """Base URL guests open. Option first, else the host's LAN IP + guest port."""
    base = (load_config().get("guest_base_url") or "").strip().rstrip("/")
    if base:
        return base
    info = supervisor_get("/network/info") or {}
    for iface in info.get("interfaces", []):
        if iface.get("primary") and (iface.get("ipv4") or {}).get("address"):
            ip = iface["ipv4"]["address"][0].split("/")[0]
            return f"http://{ip}:{GUEST_PORT}"
    return ""


def supervisor_get(path: str):
    tok = os.environ.get("SUPERVISOR_TOKEN")
    if not tok:
        return None
    try:
        req = urllib.request.Request(f"http://supervisor{path}", headers={"Authorization": f"Bearer {tok}"})
        with urllib.request.urlopen(req, timeout=5) as r:
            return json.loads(r.read()).get("data")
    except Exception as e:
        log.debug("Supervisor GET %s failed: %s", path, e)
        return None


def guest_url_for(p: dict) -> str:
    base = guest_base_url()
    return f"{base}/guest.html?token={urllib.parse.quote(p.get('token', ''))}" if base else ""


# ------------------------------------------------------------------ Guest Pass Logic
def prune_expired_passes():
    """Remove passes that have passed their expiration timestamp."""
    passes = load_passes()
    now_iso = datetime.now(timezone.utc).isoformat()
    updated = []
    for p in passes:
        if p.get("expires_at") and p["expires_at"] < now_iso:
            p["expired"] = True
        updated.append(p)
    save_passes(updated)


def find_pass_by_token(token: str, pin: str = None) -> dict:
    if not token:
        return {"valid": False, "error": "Invalid or expired guest pass token."}
    prune_expired_passes()
    passes = load_passes()
    for p in passes:
        if secrets.compare_digest(str(p.get("token", "")), str(token)):
            if p.get("pin"):
                count, until = _pin_fails.get(token, (0, 0))
                if until > time.time():
                    return {"valid": False, "error": "Too many wrong PIN attempts. Try again in 15 minutes."}
                if not pin:
                    return {"valid": False, "pin_required": True, "error": "Enter the PIN from your host."}
                if not secrets.compare_digest(str(p["pin"]), str(pin)):
                    count += 1
                    _pin_fails[token] = (0, time.time() + PIN_LOCK_SECONDS) if count >= PIN_MAX_FAILS else (count, 0)
                    return {"valid": False, "pin_required": True, "error": "Wrong PIN."}
                _pin_fails.pop(token, None)
            if p.get("revoked"):
                return {"valid": False, "error": "This room pass was revoked by the homeowner."}
            if p.get("expires_at"):
                now_iso = datetime.now(timezone.utc).isoformat()
                if p["expires_at"] < now_iso:
                    return {"valid": False, "error": "This room pass has expired."}
            return {"valid": True, "pass": p}
    return {"valid": False, "error": "Invalid or expired guest pass token."}


# ------------------------------------------------------------------ Dashboard visibility sync
def _slug(text: str) -> str:
    out = "".join(ch if ch.isalnum() else "-" for ch in (text or "").lower()).strip("-")
    while "--" in out:
        out = out.replace("--", "-")
    return out


def _view_area(view: dict, areas: dict):
    """Match a view to an area by exact path/title (room-<area> is what Dashboard Suite generates)."""
    path = (view.get("path") or "").lower()
    title = (view.get("title") or "").strip().lower()
    for area_id, name in areas.items():
        slugs = {area_id.lower(), area_id.lower().replace("_", "-"), _slug(area_id), _slug(name)}
        if path in slugs or path in {f"room-{x}" for x in slugs} or title == (name or "").strip().lower():
            return area_id
    return None


def sync_dashboard_visibility() -> dict:
    """
    Restrict room views to the users allowed in the permission matrix.
    Admins always keep every view, and views of rooms nobody is restricted to are left alone.
    Every changed dashboard is backed up to /share/ajnetweb/sharing_backups first.
    """
    perms = load_user_permissions()
    refresh_ha_metadata(force=True)
    with _cache_lock:
        areas = {a["area_id"]: a.get("name", "") for a in _ha_cache.get("areas", [])}
        users = list(_ha_cache.get("users", []))
    admin_ids = [u["id"] for u in users if not u.get("system_generated")
                 and (u.get("is_owner") or "system-admin" in (u.get("group_ids") or []))]

    dashboards = [None] + [d.get("url_path") for d in (ha_ws_call("lovelace/dashboards/list") or [])
                           if d.get("mode") == "storage"]
    changed_views, changed_dashboards, errors = 0, 0, []
    for url_path in dashboards:
        args = {"url_path": url_path} if url_path else {}
        cfg = ha_ws_call("lovelace/config", **args)
        if not cfg or "views" not in cfg:
            continue
        original = json.dumps(cfg, sort_keys=True)
        for view in cfg["views"]:
            area_id = _view_area(view, areas)
            if not area_id:
                continue
            allowed = [uid for uid, d in perms.items() if area_id in (d.get("allowed_areas") or [])]
            if not allowed:
                continue
            view["visible"] = [{"user": uid} for uid in dict.fromkeys(admin_ids + allowed)]
            changed_views += 1
        if json.dumps(cfg, sort_keys=True) == original:
            continue
        try:
            bdir = "/share/ajnetweb/sharing_backups"
            os.makedirs(bdir, exist_ok=True)
            with open(os.path.join(bdir, f"{url_path or 'default'}-{time.strftime('%Y%m%d-%H%M%S')}.json"), "w") as f:
                json.dump(json.loads(original), f)
        except OSError as e:
            log.warning("Backup before visibility sync failed: %s", e)
        if ha_ws_call("lovelace/config/save", config=cfg, **args) is None and \
                ha_ws_call("lovelace/config", **args) != cfg:
            errors.append(url_path or "default")
        else:
            changed_dashboards += 1

    log_audit_action("Admin", "sync_dashboards",
                     details=f"Synced visibility on {changed_views} views in {changed_dashboards} dashboards")
    if errors:
        return {"ok": False, "error": f"Could not save: {', '.join(errors)}", "updated_views": changed_views}
    return {"ok": True, "updated_views": changed_views, "updated_dashboards": changed_dashboards,
            "message": f"Visibility synced on {changed_views} room view(s). Admins keep access to everything."}


# ------------------------------------------------------------------ HTTP Handler
class SharingRequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WWW_DIR, **kwargs)

    def _normalize_path(self) -> str:
        raw_path = urllib.parse.urlparse(self.path).path
        if "/api/" in raw_path:
            return raw_path[raw_path.rfind("/api/"):]
        return raw_path

    def _send_json(self, data: any, status: int = 200):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        self.end_headers()
        self.wfile.write(body)

    guest_only = False

    def _allowed(self) -> bool:
        if self.guest_only or self.client_address[0] in ALLOWED_CLIENTS:
            return True
        self._send_json({"ok": False, "error": "Forbidden"}, status=403)
        return False

    def _guest_path_ok(self, path: str) -> bool:
        """On the guest port only the guest page and guest API are reachable."""
        if not self.guest_only:
            return True
        if path in ("/", "/guest.html", "/api/guest/portal", "/api/guest/control"):
            return True
        self.send_error(404, "Not found")
        return False

    def do_HEAD(self):
        if (self._allowed() and not ajn_license.handle(self, LICENSE, endpoints=not self.guest_only)
                and self._guest_path_ok(self._normalize_path())):
            super().do_HEAD()

    def do_GET(self):
        if not self._allowed():
            return
        if ajn_license.handle(self, LICENSE, endpoints=not self.guest_only):
            return
        if self.guest_only and self._normalize_path() == "/":
            self.path = "/guest.html" + (("?" + urllib.parse.urlparse(self.path).query) if "?" in self.path else "")
        if not self._guest_path_ok(self._normalize_path()):
            return
        parsed = urllib.parse.urlparse(self.path)
        path = self._normalize_path()
        query = urllib.parse.parse_qs(parsed.query)

        # ---------------------------------------------------------------- Admin: Areas & Users
        if path == "/api/metadata":
            refresh_ha_metadata(force=True)
            with _cache_lock:
                areas = _ha_cache.get("areas", [])
                users = _ha_cache.get("users", [])
                e_map = _ha_cache.get("entity_area_map", {})

            # Count entities per area
            area_counts = {}
            for ent_id, a_id in e_map.items():
                area_counts[a_id] = area_counts.get(a_id, 0) + 1

            enriched_areas = []
            for a in areas:
                enriched_areas.append({
                    "id": a.get("area_id"),
                    "name": a.get("name"),
                    "picture": a.get("picture"),
                    "entity_count": area_counts.get(a.get("area_id"), 0),
                })
            enriched_areas.sort(key=lambda x: x["name"].lower())

            enriched_users = []
            for u in users:
                enriched_users.append({
                    "id": u.get("id"),
                    "name": u.get("name") or u.get("username"),
                    "username": u.get("username"),
                    "is_admin": u.get("is_admin", False),
                    "is_owner": u.get("is_owner", False),
                })
            enriched_users.sort(key=lambda x: x["name"].lower())

            self._send_json({
                "areas": enriched_areas,
                "users": enriched_users,
                "config": load_config(),
            })
            return

        # ---------------------------------------------------------------- Admin: Guest Passes List
        if path == "/api/passes":
            prune_expired_passes()
            passes = load_passes()
            base = guest_base_url()
            for p in passes:
                p["guest_url"] = f"{base}/guest.html?token={urllib.parse.quote(p.get('token', ''))}" if base else ""
            self._send_json(passes)
            return

        # ---------------------------------------------------------------- Admin: User Permission Matrix
        if path == "/api/matrix":
            refresh_ha_metadata()
            with _cache_lock:
                users = _ha_cache.get("users", [])
                areas = _ha_cache.get("areas", [])

            saved_perms = load_user_permissions()
            matrix = []
            for u in users:
                u_id = u.get("id")
                u_name = u.get("name") or u.get("username")
                assigned = saved_perms.get(u_id, {}).get("allowed_areas", [])
                matrix.append({
                    "user_id": u_id,
                    "name": u_name,
                    "username": u.get("username"),
                    "is_admin": u.get("is_admin", False),
                    "allowed_areas": assigned,
                })

            self._send_json({
                "users": matrix,
                "areas": [{"id": a.get("area_id"), "name": a.get("name")} for a in areas],
            })
            return

        # ---------------------------------------------------------------- Admin: Audit Logs
        if path == "/api/audit":
            history = []
            if os.path.exists(AUDIT_LOG_FILE):
                try:
                    with open(AUDIT_LOG_FILE) as f:
                        history = json.load(f)
                except Exception:
                    pass
            self._send_json(history)
            return

        # ---------------------------------------------------------------- Guest Portal (Scoped Access)
        if path == "/api/guest/portal":
            token = query.get("token", [""])[0]
            val = find_pass_by_token(token, query.get("pin", [""])[0])
            if not val["valid"]:
                self._send_json({"ok": False, "error": val["error"], "pin_required": val.get("pin_required", False)},
                                status=403)
                return

            p = val["pass"]
            refresh_ha_metadata()
            with _cache_lock:
                all_areas = {a["area_id"]: a["name"] for a in _ha_cache.get("areas", [])}

            allowed_areas = p.get("areas", [])
            allowed_domains = [d for d in p.get("allowed_domains", ["light", "climate", "cover", "switch"])
                               if d in guest_domains_allowed()]

            portal_data = []
            for a_id in allowed_areas:
                area_name = all_areas.get(a_id, a_id.replace("_", " ").title())
                entities = get_area_entities(a_id, allowed_domains)
                portal_data.append({
                    "area_id": a_id,
                    "name": area_name,
                    "entities": entities,
                })

            self._send_json({
                "ok": True,
                "pass_name": p.get("name"),
                "guest_name": p.get("guest_name"),
                "expires_at": p.get("expires_at"),
                "rooms": portal_data,
            })
            return

        super().do_GET()

    def do_POST(self):
        if not self._allowed():
            return
        if ajn_license.handle(self, LICENSE, endpoints=not self.guest_only):
            return
        path = self._normalize_path()
        if not self._guest_path_ok(path):
            return
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length).decode("utf-8") if length > 0 else "{}"
        try:
            payload = json.loads(body)
        except ValueError:
            payload = {}

        # ---------------------------------------------------------------- Admin: Create Guest Pass
        if path == "/api/passes/create":
            name = payload.get("name", "Guest Pass").strip()
            guest_name = payload.get("guest_name", "").strip()
            areas = payload.get("areas", [])
            duration_hours = payload.get("duration_hours")
            caps = guest_domains_allowed()
            allowed_domains = [d for d in payload.get("allowed_domains", ["light", "climate", "cover", "switch"])
                               if d in caps]
            pin = str(payload.get("pin") or "").strip()

            if not areas:
                self._send_json({"ok": False, "error": "Select at least one room to share."}, status=400)
                return

            token = secrets.token_urlsafe(32)
            now = datetime.now(timezone.utc)
            expires_at = None
            if duration_hours and int(duration_hours) > 0:
                from datetime import timedelta
                exp_dt = now + timedelta(hours=int(duration_hours))
                expires_at = exp_dt.isoformat()

            new_pass = {
                "id": f"pass_{int(time.time()*1000)}",
                "token": token,
                "name": name,
                "guest_name": guest_name,
                "areas": areas,
                "allowed_domains": allowed_domains,
                "created_at": now.isoformat(),
                "expires_at": expires_at,
                "duration_hours": duration_hours,
                "pin": pin if pin else None,
                "revoked": False,
                "use_count": 0,
                "last_used": None,
            }

            passes = load_passes()
            passes.insert(0, new_pass)
            save_passes(passes)

            log_audit_action("Admin", "create_pass", details=f"Created pass '{name}' for areas {areas}")
            self._send_json({"ok": True, "pass": dict(new_pass, guest_url=guest_url_for(new_pass))})
            return

        # ---------------------------------------------------------------- Admin: Revoke / Delete Pass
        if path == "/api/passes/revoke":
            pass_id = payload.get("id")
            passes = load_passes()
            found = False
            for p in passes:
                if p["id"] == pass_id:
                    p["revoked"] = True
                    found = True
                    log_audit_action("Admin", "revoke_pass", details=f"Revoked pass '{p.get('name')}'")
                    break
            save_passes(passes)
            self._send_json({"ok": found})
            return

        if path == "/api/passes/delete":
            pass_id = payload.get("id")
            passes = load_passes()
            passes = [p for p in passes if p["id"] != pass_id]
            save_passes(passes)
            log_audit_action("Admin", "delete_pass", details=f"Deleted pass ID {pass_id}")
            self._send_json({"ok": True})
            return

        # ---------------------------------------------------------------- Admin: Save Visual Permission Matrix
        if path == "/api/matrix/save":
            matrix = payload.get("matrix", {})  # { user_id: ["area_1", "area_2"] }
            perms = load_user_permissions()
            now_iso = datetime.now(timezone.utc).isoformat()
            for u_id, areas in matrix.items():
                if u_id not in perms:
                    perms[u_id] = {}
                perms[u_id]["allowed_areas"] = areas
                perms[u_id]["last_updated"] = now_iso
            save_user_permissions(perms)
            log_audit_action("Admin", "update_matrix", details=f"Updated room permissions for {len(matrix)} users")
            self._send_json({"ok": True, "message": "Permissions saved."})
            return

        # ---------------------------------------------------------------- Admin: 1-Click Lovelace Dashboard Sync
        if path == "/api/matrix/sync_dashboards":
            res = sync_dashboard_visibility()
            self._send_json(res, status=200 if res.get("ok") else 500)
            return

        # ---------------------------------------------------------------- Guest Control (Scoped Execution)
        if path == "/api/guest/control":
            token = payload.get("token")
            val = find_pass_by_token(token, payload.get("pin"))
            if not val["valid"]:
                self._send_json({"ok": False, "error": val["error"]}, status=403)
                return

            p = val["pass"]
            entity_id = str(payload.get("entity_id") or "")
            if "." not in entity_id:
                self._send_json({"ok": False, "error": "entity_id required"}, status=400)
                return
            # The domain always comes from the entity itself, never from the request
            domain = entity_id.split(".")[0]
            service = str(payload.get("service") or "")
            service_data = payload.get("service_data") if isinstance(payload.get("service_data"), dict) else {}
            service_data = {k: v for k, v in service_data.items() if k not in ("entity_id", "device_id", "area_id")}
            service_data["entity_id"] = entity_id

            if service not in GUEST_SERVICES.get(domain, set()):
                log_audit_action(f"Guest: {p.get('name')}", "rejected_control", entity_id=entity_id,
                                 details=f"Service {domain}.{service} not allowed")
                self._send_json({"ok": False, "error": "This action is not available on a guest pass."}, status=403)
                return

            # 1. Check domain authorization (pass scope, capped by add-on options)
            allowed_domains = [d for d in p.get("allowed_domains", ["light", "climate", "cover", "switch"])
                               if d in guest_domains_allowed()]
            if domain not in allowed_domains:
                log_audit_action(f"Guest: {p.get('name')}", "rejected_control", entity_id=entity_id, details=f"Domain {domain} not allowed")
                self._send_json({"ok": False, "error": f"Device category '{domain}' is not permitted by your room pass."}, status=403)
                return

            # 2. Strict Room Authorization Check
            refresh_ha_metadata()
            with _cache_lock:
                e_map = _ha_cache.get("entity_area_map", {})
                all_areas = {a["area_id"]: a["name"] for a in _ha_cache.get("areas", [])}

            assigned_area = e_map.get(entity_id)
            if not assigned_area or assigned_area not in p.get("areas", []):
                log_audit_action(f"Guest: {p.get('name')}", "security_violation", entity_id=entity_id, details=f"Attempted to control device outside authorized room! Assigned: {assigned_area}")
                self._send_json({"ok": False, "error": "Security Alert: You are not authorized to control devices outside your designated room."}, status=403)
                return

            # 3. Execute Service
            ok = execute_ha_service(domain, service, service_data)
            area_name = all_areas.get(assigned_area, assigned_area)

            # Update pass use count and last_used
            with _lock:
                passes = load_passes()
                for pass_item in passes:
                    if pass_item["token"] == token:
                        pass_item["use_count"] = pass_item.get("use_count", 0) + 1
                        pass_item["last_used"] = datetime.now(timezone.utc).isoformat()
                        break
                save_passes(passes)

            log_audit_action(f"Guest: {p.get('guest_name') or p.get('name')}", f"{domain}.{service}", entity_id=entity_id, area=area_name, details=f"Executed {service} on {entity_id}")
            self._send_json({"ok": ok, "entity_id": entity_id, "service": service})
            return

        self.send_error(404, "Endpoint not found")


class GuestRequestHandler(SharingRequestHandler):
    guest_only = True


def main():
    log.info("Starting AJ Netweb Room & Guest Pass Studio on port %s (guest portal on %s)...", PORT, GUEST_PORT)
    guest = ThreadedHTTPServer(("0.0.0.0", GUEST_PORT), GuestRequestHandler)
    threading.Thread(target=guest.serve_forever, daemon=True, name="guest-portal").start()
    server = ThreadedHTTPServer(("0.0.0.0", PORT), SharingRequestHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        log.info("Shutting down Room Sharing server...")
        server.server_close()


if __name__ == "__main__":
    main()
