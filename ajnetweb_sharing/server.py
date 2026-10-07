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

logging.basicConfig(level=logging.INFO, format="[%(asctime)s] %(levelname)s [%(name)s]: %(message)s")
log = logging.getLogger("sharing.server")

OPTIONS_FILE = "/data/options.json"
DATA_DIR = "/data/sharing"
PASSES_FILE = "/data/sharing/guest_passes.json"
USER_PERMS_FILE = "/data/sharing/user_permissions.json"
AUDIT_LOG_FILE = "/data/sharing/access_audit.json"
WWW_DIR = os.path.join(os.path.dirname(__file__), "www")
PORT = int(os.environ.get("INGRESS_PORT", 8096))

os.makedirs(DATA_DIR, exist_ok=True)

_lock = Lock()
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

        # 4. Fetch Users
        users = ha_ws_call("config/auth/list") or []

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


def find_pass_by_token(token: str) -> dict:
    prune_expired_passes()
    passes = load_passes()
    for p in passes:
        if p.get("token") == token:
            if p.get("revoked"):
                return {"valid": False, "error": "This room pass was revoked by the homeowner."}
            if p.get("expires_at"):
                now_iso = datetime.now(timezone.utc).isoformat()
                if p["expires_at"] < now_iso:
                    return {"valid": False, "error": "This room pass has expired."}
            return {"valid": True, "pass": p}
    return {"valid": False, "error": "Invalid or expired guest pass token."}


# ------------------------------------------------------------------ HTTP Handler
class SharingRequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WWW_DIR, **kwargs)

    def _normalize_path(self) -> str:
        raw_path = urllib.parse.urlparse(self.path).path
        if "/api/" in raw_path:
            return raw_path[raw_path.find("/api/"):]
        return raw_path

    def _send_json(self, data: any, status: int = 200):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()

    def do_GET(self):
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
            val = find_pass_by_token(token)
            if not val["valid"]:
                self._send_json({"ok": False, "error": val["error"]}, status=403)
                return

            p = val["pass"]
            refresh_ha_metadata()
            with _cache_lock:
                all_areas = {a["area_id"]: a["name"] for a in _ha_cache.get("areas", [])}

            allowed_areas = p.get("areas", [])
            allowed_domains = p.get("allowed_domains", ["light", "climate", "cover", "switch"])

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
        path = self._normalize_path()
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
            allowed_domains = payload.get("allowed_domains", ["light", "climate", "cover", "switch"])
            pin = payload.get("pin", "").strip()

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
            self._send_json({"ok": True, "pass": new_pass})
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
            # Syncs visible user IDs to Lovelace views automatically!
            perms = load_user_permissions()
            refresh_ha_metadata(force=True)

            # Get current Lovelace config
            ll_cfg = ha_ws_call("lovelace/config")
            if not ll_cfg or "views" not in ll_cfg:
                self._send_json({
                    "ok": False,
                    "error": "Could not read Lovelace dashboard configuration via Home Assistant WebSocket.",
                }, status=500)
                return

            views = ll_cfg.get("views", [])
            updated_count = 0

            # Match view path or title to area_id
            for view in views:
                v_path = view.get("path", "").lower()
                v_title = view.get("title", "").lower()

                # Find which users are allowed for this view
                allowed_users = []
                for u_id, u_data in perms.items():
                    user_areas = [a.lower() for a in u_data.get("allowed_areas", [])]
                    for a in user_areas:
                        if a in v_path or a in v_title or a.replace("_", "-") in v_path:
                            allowed_users.append(u_id)
                            break

                if allowed_users:
                    # Update visible key
                    view["visible"] = [{"user": uid} for uid in allowed_users]
                    updated_count += 1

            # Save Lovelace config back
            res = ha_ws_call("lovelace/config/save", config=ll_cfg)
            log_audit_action("Admin", "sync_dashboards", details=f"Synced visibility rules across {updated_count} views")
            self._send_json({
                "ok": True,
                "updated_views": updated_count,
                "message": f"Successfully synced visibility rules for {updated_count} dashboard view(s)!",
            })
            return

        # ---------------------------------------------------------------- Guest Control (Scoped Execution)
        if path == "/api/guest/control":
            token = payload.get("token")
            val = find_pass_by_token(token)
            if not val["valid"]:
                self._send_json({"ok": False, "error": val["error"]}, status=403)
                return

            p = val["pass"]
            entity_id = payload.get("entity_id")
            domain = payload.get("domain") or entity_id.split(".")[0]
            service = payload.get("service")
            service_data = payload.get("service_data", {})
            service_data["entity_id"] = entity_id

            # 1. Check domain authorization
            allowed_domains = p.get("allowed_domains", ["light", "climate", "cover", "switch"])
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


def main():
    log.info("Starting AJ Netweb Room & Guest Pass Studio on port %s...", PORT)
    server = ThreadedHTTPServer(("0.0.0.0", PORT), SharingRequestHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        log.info("Shutting down Room Sharing server...")
        server.server_close()


if __name__ == "__main__":
    main()
