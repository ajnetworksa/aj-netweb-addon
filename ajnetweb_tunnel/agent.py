#!/usr/bin/env python3
"""AJ Netweb management agent (runs inside the add-on next to frpc).

* Telemetry: system identity (instance id, HA uuid, machine id, MACs), versions and available updates,
  add-ons, host uptime/disk, health, backups and device availability -> AJ Netweb every 5 minutes.
* Remote maintenance: long-polls AJ Netweb over mTLS for installer commands and executes ONLY the
  allow-listed Supervisor API calls below — never arbitrary API paths or shell commands — and only
  while the owner has "Allow installer management" switched on.
* Local status: writes status.json / oplog.json for the add-on's own page (sidebar panel).

Standard library only.
"""
from __future__ import annotations

import json
import os
import queue
import ssl
import subprocess
import threading
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

import features as F

DATA = "/data/ajn"
WWW = "/tmp/ajn-www"
OPLOG = f"{DATA}/oplog.jsonl"
PENDING_SELF_UPDATE = f"{DATA}/pending_self_update.json"
SERVER = os.environ.get("AJN_SERVER_RESOLVED") or os.environ.get("AJN_SERVER", "")
AGENT_VERSION = os.environ.get("AJN_AGENT_VERSION", "1.2.2")
SUP_TOKEN = os.environ.get("SUPERVISOR_TOKEN", "")
STARTED = time.time()


def get_addon_version() -> str:
    global AGENT_VERSION
    try:
        info = supervisor("GET", "/addons/self/info")
        if info and info.get("version"):
            AGENT_VERSION = str(info["version"])
            return AGENT_VERSION
    except Exception:
        pass
    v = os.environ.get("AJN_AGENT_VERSION")
    if v and v not in ("0", ""):
        AGENT_VERSION = v
    else:
        AGENT_VERSION = "1.2.2"
    return AGENT_VERSION

LABELS = {
    "refresh": "Refresh status", "reconnect": "Reconnect tunnel", "check_config": "Check configuration",
    "restart_core": "Restart Home Assistant", "update_core": "Update Home Assistant",
    "update_supervisor": "Update Supervisor", "update_os": "Update Home Assistant OS",
    "update_addon": "Update add-on", "update_all_addons": "Update all add-ons", "restart_addon": "Restart add-on",
    "backup_full": "Create full backup", "core_logs": "Fetch Home Assistant log", "reboot_host": "Reboot device",
    "update_agent": "Update AJ Netweb app", "diagnostics": "Network diagnostics",
    "apply_template": "Apply configuration template", "backup_upload": "Cloud backup now",
    "backup_restore": "Restore cloud backup", "temp_access": "Temporary technician login",
    "revoke_temp_access": "Remove temporary logins", "consent_off": "Installer access turned off by owner",
}
# harmless or protective actions that work even with management off
ALWAYS_ALLOWED = {"refresh", "reconnect", "revoke_temp_access", "consent_off"}
SERVER_CONN = F.ServerConn(SERVER)
_inventory_cache: dict = {"at": 0.0, "devices": []}
_last_diag: dict = {}

_state_lock = threading.Lock()
_last_telemetry: dict = {}
_last_result: dict = {"ok": None, "at": None, "error": None}
_current_latency_ms: float | None = None
_last_latency_check: float = 0.0


def measure_latency() -> float | None:
    global _current_latency_ms, _last_latency_check
    st = state()
    lat = safe(lambda: F.hub_latency(st), None)
    if lat is not None:
        _current_latency_ms = lat
        _last_latency_check = time.time()
    return _current_latency_ms


def log(msg: str) -> None:
    print(f"[{datetime.now().strftime('%H:%M:%S')}] AGENT: {msg}", flush=True)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def options() -> dict:
    try:
        with open("/data/options.json") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


CONSENT_OFF = f"{DATA}/consent_off"


def management_allowed() -> bool:
    # The Supervisor only rewrites /data/options.json when the app restarts, so an owner's "turn off" from the
    # portal is also recorded locally and wins until options.json is rewritten (i.e. the next start).
    try:
        if os.path.getmtime("/data/options.json") <= os.path.getmtime(CONSENT_OFF):
            return False
    except OSError:
        pass
    return bool(options().get("allow_installer_management", False))


def state() -> dict:
    try:
        with open(f"{DATA}/state.json") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


# ------------------------------------------------------------------ HTTP helpers
class APIError(Exception):
    pass


def supervisor(method: str, path: str, body: dict | None = None, timeout: int = 30, raw: bool = False,
               accept: str = "application/json"):
    req = urllib.request.Request(f"http://supervisor{path}", method=method,
                                 data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Authorization": f"Bearer {SUP_TOKEN}", "Accept": accept,
                                          "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            payload = r.read()
    except urllib.error.HTTPError as e:
        try:
            msg = json.loads(e.read()).get("message") or str(e)
        except ValueError:
            msg = str(e)
        raise APIError(f"{path}: {msg}") from None
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        raise APIError(f"{path}: {e}") from None
    if raw:
        return payload.decode(errors="replace")
    data = json.loads(payload or b"{}")
    if isinstance(data, dict) and data.get("result") == "error":
        raise APIError(f"{path}: {data.get('message')}")
    return data.get("data", data) if isinstance(data, dict) else data


def _get_server_url(path: str) -> str:
    s = SERVER
    if not s.startswith("http://") and not s.startswith("https://"):
        s = f"https://{s}"
    return f"{s.rstrip('/')}{path}"


def _get_ssl_context() -> ssl.SSLContext:
    ctx = ssl.create_default_context()
    s = SERVER
    if "://" in s:
        s = s.split("://", 1)[1]
    host = s.split("/")[0].split(":")[0]
    import re
    if re.match(r"^\d+\.\d+\.\d+\.\d+$", host) or host in ("localhost", "127.0.0.1"):
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
    if os.path.exists(f"{DATA}/client.crt") and os.path.exists(f"{DATA}/client.key"):
        ctx.load_cert_chain(f"{DATA}/client.crt", f"{DATA}/client.key")   # re-read: survives renewals
    return ctx


def server(method: str, path: str, body: dict | None = None, timeout: int = 30) -> dict:
    ctx = _get_ssl_context()
    req = urllib.request.Request(_get_server_url(path), method=method,
                                 data=json.dumps(body, default=str).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout, context=ctx) as r:
        return json.loads(r.read() or b"{}")


def safe(fn, default=None):
    try:
        return fn()
    except Exception as e:  # noqa: BLE001
        log(f"telemetry: {e}")
        return default


def pick(d: dict | None, *keys) -> dict:
    d = d or {}
    return {k: d.get(k) for k in keys if k in d}


# ------------------------------------------------------------------ telemetry
def collect() -> dict:
    allowed = management_allowed()
    info = safe(lambda: supervisor("GET", "/info"), {})
    core = safe(lambda: supervisor("GET", "/core/info"), {})
    sup = safe(lambda: supervisor("GET", "/supervisor/info"), {})
    os_info = safe(lambda: supervisor("GET", "/os/info"), {})
    host = safe(lambda: supervisor("GET", "/host/info"), {})
    net = safe(lambda: supervisor("GET", "/network/info"), {})
    addons = safe(lambda: supervisor("GET", "/addons"), {})
    stats = safe(lambda: supervisor("GET", "/core/stats"), {})
    resol = safe(lambda: supervisor("GET", "/resolution/info"), {})
    backups = safe(lambda: supervisor("GET", "/backups"), {})
    ha_cfg = safe(lambda: supervisor("GET", "/core/api/config"), {})
    states = safe(lambda: supervisor("GET", "/core/api/states", timeout=60), [])
    devices = []
    if allowed:  # device inventory (names, models, serials) only with the owner's consent; refreshed every 30 min
        if time.time() - _inventory_cache["at"] > 1800:
            inv = safe(lambda: F.device_inventory(SUP_TOKEN, states if isinstance(states, list) else []), None)
            if inv is not None:
                _inventory_cache.update(at=time.time(), devices=inv)
        devices = _inventory_cache["devices"]

    bl = (backups or {}).get("backups") or []
    last = max(bl, key=lambda b: b.get("date") or "", default=None)
    ents = states if isinstance(states, list) else []
    unavailable = [e for e in ents if e.get("state") in ("unavailable",)]
    cams = [e for e in ents if str(e.get("entity_id", "")).startswith("camera.")]
    domains: dict[str, int] = {}
    for e in ents:
        dom = str(e.get("entity_id", "")).split(".", 1)[0]
        domains[dom] = domains.get(dom, 0) + 1

    def name(e):
        return (e.get("attributes") or {}).get("friendly_name") or e.get("entity_id")

    entities = {"total": len(ents), "unavailable": len(unavailable), "cameras": len(cams),
                "cameras_unavailable": sum(1 for c in cams if c.get("state") == "unavailable"),
                "domains": dict(sorted(domains.items(), key=lambda kv: -kv[1])[:20])}
    if allowed:  # device names are only shared when the owner allows installer management
        entities["cameras_list"] = [{"entity_id": c["entity_id"], "name": name(c), "state": c.get("state")}
                                    for c in cams[:60]]
        entities["unavailable_list"] = [{"entity_id": e["entity_id"], "name": name(e)} for e in unavailable[:40]]

    res = {
        "collected_at": now_iso(),
        "agent": {"version": get_addon_version(), "management_allowed": allowed, "uptime": int(time.time() - STARTED),
                  "instance_uid": state().get("instance_uid"), "hub_latency_ms": measure_latency() or _current_latency_ms,
                  "temp_logins": len(F._load_temp())},
        "info": pick(info, "supervisor", "homeassistant", "hassos", "docker", "hostname", "operating_system",
                     "machine", "machine_id", "arch", "state", "supported", "channel", "timezone"),
        "core": pick(core, "version", "version_latest", "update_available", "machine", "ip_address", "arch",
                     "boot", "watchdog", "backups_exclude_database"),
        "supervisor": pick(sup, "version", "version_latest", "update_available", "channel", "healthy",
                           "supported", "diagnostics"),
        "os": pick(os_info, "version", "version_latest", "update_available", "board", "boot"),
        "host": pick(host, "hostname", "operating_system", "kernel", "chassis", "virtualization", "deployment",
                     "boot_timestamp", "startup_time", "disk_total", "disk_used", "disk_free", "disk_life_time",
                     "timezone"),
        "network": {"interfaces": [
            {"interface": i.get("interface"), "type": i.get("type"), "mac": i.get("mac"),
             "primary": i.get("primary"), "connected": i.get("connected"),
             "ipv4": {"address": ((i.get("ipv4") or {}).get("address") or [])[:2]}}
            for i in (net or {}).get("interfaces") or []]},
        "addons": [pick(a, "name", "slug", "version", "version_latest", "update_available", "state", "repository")
                   for a in (addons or {}).get("addons") or []],
        "core_stats": pick(stats, "cpu_percent", "memory_percent", "memory_usage", "memory_limit"),
        "resolution": {"unhealthy": (resol or {}).get("unhealthy") or [],
                       "unsupported": (resol or {}).get("unsupported") or [],
                       "issues": [i.get("type") for i in (resol or {}).get("issues") or []][:20]},
        "backups": {"count": len(bl), "last_date": last.get("date") if last else None,
                    "last_name": last.get("name") if last else None, "last_size": last.get("size") if last else None},
        "ha_config": pick(ha_cfg, "location_name", "time_zone", "country", "version", "external_url",
                          "internal_url", "state", *(("latitude", "longitude") if allowed else ()))
        | {"components": len((ha_cfg or {}).get("components") or [])},
        "entities": entities,
        "devices": devices,
        "diagnostics": _last_diag if allowed else {},
    }
    try:
        sys_snap = {
            "ha_uuid": os.environ.get("AJN_INSTALL_ID"),
            "machine_id": (info or {}).get("machine_id"),
            "hostname": (info or {}).get("hostname"),
            "board": (os_info or {}).get("board") or (info or {}).get("machine"),
            "interfaces": (net or {}).get("interfaces") or [],
            "core": (core or {}).get("version"),
            "supervisor": (sup or {}).get("version"),
            "os": (os_info or {}).get("version"),
        }
        with open(f"{DATA}/last_system.json", "w") as f:
            json.dump(sys_snap, f)
    except OSError:
        pass
    return res


def send_telemetry() -> None:
    global _last_telemetry
    t = collect()
    with _state_lock:
        _last_telemetry = t
    try:
        server("POST", "/api/v1/agent/telemetry", t, timeout=30)
        _last_result.update(ok=True, at=now_iso(), error=None)
    except Exception as e:  # noqa: BLE001
        _last_result.update(ok=False, at=now_iso(), error=str(e)[:200])
        log(f"telemetry upload failed: {e}")


# ------------------------------------------------------------------ operations log (visible to the owner)
def oplog(entry: dict) -> None:
    entry = {"ts": now_iso(), **entry}
    try:
        lines = []
        if os.path.exists(OPLOG):
            with open(OPLOG) as f:
                lines = f.readlines()[-299:]
        lines.append(json.dumps(entry) + "\n")
        with open(OPLOG, "w") as f:
            f.writelines(lines)
        os.chmod(OPLOG, 0o600)
    except OSError:
        pass


def read_oplog() -> list:
    try:
        with open(OPLOG) as f:
            return [json.loads(x) for x in f.readlines()[-100:]][::-1]
    except (OSError, ValueError):
        return []


# ------------------------------------------------------------------ commands
def self_slug() -> str:
    return supervisor("GET", "/addons/self/info").get("slug", "")


def report(cid: int, status: str, message: str = "", output: str = "") -> None:
    for attempt in range(5):
        try:
            server("POST", f"/api/v1/agent/commands/{cid}/result",
                   {"status": status, "message": message[:500], "output": output[-190_000:]}, timeout=30)
            return
        except Exception as e:  # noqa: BLE001
            log(f"result upload failed ({attempt + 1}/5): {e}")
            time.sleep(10)


def execute(cmd: dict) -> tuple[str, str, str]:
    """Returns (status, message, output). Only the allow-listed operations below exist."""
    kind, args, timeout = cmd["kind"], cmd.get("args") or {}, int(cmd.get("timeout") or 300)
    if kind not in LABELS:
        return "rejected", f"unknown command '{kind}'", ""
    if kind not in ALWAYS_ALLOWED and not management_allowed():
        return "rejected", "Installer management is switched off by the owner of this Home Assistant", ""

    if kind == "refresh":
        send_telemetry()
        return "ok", "status refreshed", ""
    if kind == "consent_off":
        opts = options()
        opts["allow_installer_management"] = False
        supervisor("POST", "/addons/self/options", {"options": opts}, timeout=30)
        with open(CONSENT_OFF, "w") as f:
            f.write(now_iso())
        _last_diag.clear()
        _inventory_cache.update(at=0.0, devices=[])
        return "ok", "installer management switched off at the owner's request (portal)", ""
    if kind == "revoke_temp_access":
        removed = F.temp_access_cleanup(SUP_TOKEN, force_all=True)
        return "ok", f"removed {len(removed)} temporary login(s)", "\n".join(removed)
    if kind == "temp_access":
        return F.temp_access_create(SUP_TOKEN, int(args.get("minutes") or 60), args.get("admin") == "true",
                                    state().get("public_url", ""))
    if kind == "diagnostics":
        diag = F.diagnostics(supervisor, SERVER_CONN, state(), SUP_TOKEN, True)
        _last_diag.clear()
        _last_diag.update(diag)
        return "ok", (f"hub {_last_diag.get('hub_tcp_ms')} ms, down {_last_diag.get('download_mbps')} Mbit/s, "
                      f"up {_last_diag.get('upload_mbps')} Mbit/s"), json.dumps(_last_diag, indent=2)
    if kind == "apply_template":
        tpl = server("GET", f"/api/v1/agent/templates/{int(args['template_id'])}", timeout=60)
        return F.apply_template(supervisor, tpl)
    if kind == "backup_upload":
        pw = server("GET", "/api/v1/agent/backup-key", timeout=30)["password"]
        return F.backup_upload(supervisor, SERVER_CONN, SUP_TOKEN, pw, supervisor("GET", "/core/info").get("version", ""))
    if kind == "backup_restore":
        pw = server("GET", "/api/v1/agent/backup-key", timeout=30)["password"]
        return F.backup_restore(supervisor, SERVER_CONN, SUP_TOKEN, pw, str(int(args["backup_id"])), self_slug())
    if kind == "reconnect":
        subprocess.run(["pkill", "-x", "frpc"], check=False)
        return "ok", "tunnel restarting", ""
    if kind == "check_config":
        supervisor("POST", "/core/check", {}, timeout=timeout)
        return "ok", "configuration is valid", ""
    if kind == "restart_core":
        supervisor("POST", "/core/restart", {}, timeout=timeout)
        return "ok", "Home Assistant restarted", ""
    if kind == "update_core":
        return F.safe_update_core(supervisor, args, timeout)
    if kind == "update_supervisor":
        supervisor("POST", "/supervisor/update", {}, timeout=timeout)
        return "ok", "Supervisor update started", ""
    if kind == "update_os":
        if args.get("backup", "true") != "false":
            F.pre_backup(supervisor, f"OS {supervisor('GET', '/os/info').get('version')}")
        body = {"version": args["version"]} if args.get("version") else {}
        supervisor("POST", "/os/update", body, timeout=timeout)
        return "ok", "OS update installed; the device reboots to apply it", ""
    if kind in ("update_addon", "restart_addon"):
        slug = str(args.get("slug", ""))
        if not slug:
            return "error", "no add-on slug", ""
        if slug == self_slug():
            return "rejected", "use 'Update AJ Netweb app' / 'Reconnect tunnel' for this add-on", ""
        verb = "update" if kind == "update_addon" else "restart"
        body = {"backup": args.get("backup", "true") != "false"} if verb == "update" else {}
        supervisor("POST", f"/addons/{slug}/{verb}", body, timeout=timeout)
        return "ok", f"{slug}: {verb} done", ""
    if kind == "update_all_addons":
        me = self_slug()
        done, failed = [], []
        for a in supervisor("GET", "/addons").get("addons", []):
            if a.get("update_available") and a.get("slug") != me:
                try:
                    supervisor("POST", f"/addons/{a['slug']}/update",
                               {"backup": args.get("backup", "true") != "false"}, timeout=1800)
                    done.append(f"{a['name']} -> {a.get('version_latest')}")
                except APIError as e:
                    failed.append(f"{a['name']}: {e}")
        status = "error" if failed else "ok"
        return status, f"{len(done)} updated, {len(failed)} failed", "\n".join(done + failed)
    if kind == "backup_full":
        nm = args.get("name") or f"AJ Netweb {datetime.now().strftime('%Y-%m-%d %H:%M')}"
        res = supervisor("POST", "/backups/new/full", {"name": nm}, timeout=timeout)
        return "ok", f"backup '{nm}' created ({res.get('slug', '?')})", ""
    if kind == "core_logs":
        lines = min(max(int(args.get("lines") or 300), 10), 2000)
        text = supervisor("GET", f"/core/logs?lines={lines}", raw=True, accept="text/plain", timeout=timeout)
        return "ok", f"last {lines} lines", text
    if kind == "reboot_host":
        report(cmd["id"], "ok", "reboot requested")
        oplog({"kind": kind, "label": LABELS[kind], "by": cmd.get("created_by"), "status": "ok",
               "message": "device is rebooting"})
        supervisor("POST", "/host/reboot", {}, timeout=timeout)
        return "", "", ""  # already reported
    if kind == "update_agent":
        me = self_slug()
        addons_list = supervisor("GET", "/addons").get("addons", [])
        my_addon = next((a for a in addons_list if a.get("slug") == me), None)
        if my_addon and not my_addon.get("update_available"):
            return "ok", f"already on the latest version ({AGENT_VERSION})", ""

        with open(PENDING_SELF_UPDATE, "w") as f:
            json.dump({"id": cmd["id"], "from": AGENT_VERSION, "by": cmd.get("created_by")}, f)
        try:
            supervisor("POST", f"/addons/{me}/update", {}, timeout=timeout)
        except APIError as e:
            err = str(e).lower()
            if "no update available" in err:
                return "ok", f"already on the latest version ({AGENT_VERSION})", ""
            if "can't update itself" in err or "cannot update itself" in err:
                try:
                    supervisor("POST", "/core/api/services/update/install",
                               {"entity_id": f"update.{me}_update"}, timeout=timeout)
                    return "ok", "update triggered via Home Assistant Core", ""
                except Exception:
                    latest = (my_addon or {}).get("version_latest") or "latest"
                    return "ok", f"update available ({latest}) - click Update in Home Assistant Settings -> Add-ons", ""
            raise
        finally:
            if os.path.exists(PENDING_SELF_UPDATE):
                os.unlink(PENDING_SELF_UPDATE)   # still alive => the update did not replace us
        return "ok", f"already on the latest version ({AGENT_VERSION})", ""
    return "rejected", "not implemented", ""


def worker(q: "queue.Queue[dict]") -> None:
    while True:
        cmd = q.get()
        label = LABELS.get(cmd.get("kind"), cmd.get("kind"))
        log(f"installer action: {label} (requested by {cmd.get('created_by')})")
        if cmd.get("kind") not in ("refresh", "reconnect", "core_logs", "consent_off", "revoke_temp_access"):
            report(cmd["id"], "running", "started")
        try:
            status, msg, out = execute(cmd)
        except APIError as e:
            status, msg, out = "error", str(e)[:400], ""
        except Exception as e:  # noqa: BLE001
            status, msg, out = "error", f"agent error: {e}"[:400], ""
        if status:
            report(cmd["id"], status, msg, out)
            oplog({"kind": cmd.get("kind"), "label": label, "by": cmd.get("created_by"), "status": status,
                   "message": msg})
            log(f"installer action: {label} -> {status}{': ' + msg if msg else ''}")
            if cmd.get("kind") not in ("refresh", "core_logs") and status == "ok":
                threading.Thread(target=lambda: (time.sleep(20), send_telemetry()), daemon=True).start()


def poll_commands(q: "queue.Queue[dict]", fast: "queue.Queue[dict]") -> None:
    backoff = 5
    while True:
        try:
            res = server("GET", "/api/v1/agent/commands?wait=25", timeout=45)
            for c in res.get("commands", []):
                # protective / harmless actions (owner turned access off, remove temp logins, refresh) never
                # wait behind a long backup or restore
                (fast if c.get("kind") in ALWAYS_ALLOWED else q).put(c)
            backoff = 5
        except urllib.error.HTTPError as e:
            if e.code in (401, 402, 403):
                time.sleep(60)
            else:
                time.sleep(backoff)
                backoff = min(backoff * 2, 120)
        except Exception:  # noqa: BLE001
            time.sleep(backoff)
            backoff = min(backoff * 2, 120)


def finish_pending_self_update() -> None:
    if not os.path.exists(PENDING_SELF_UPDATE):
        return
    try:
        with open(PENDING_SELF_UPDATE) as f:
            p = json.load(f)
        os.unlink(PENDING_SELF_UPDATE)
    except (OSError, ValueError):
        return
    ok = p.get("from") != AGENT_VERSION
    msg = f"updated {p.get('from')} -> {AGENT_VERSION}" if ok else "restarted without a new version"
    report(p["id"], "ok" if ok else "error", msg)
    oplog({"kind": "update_agent", "label": LABELS["update_agent"], "by": p.get("by"),
           "status": "ok" if ok else "error", "message": msg})


# ------------------------------------------------------------------ auto-updater
def auto_update_loop() -> None:
    time.sleep(120)  # grace period after startup
    while True:
        try:
            if options().get("auto_update", False):
                slug = self_slug()
                if slug:
                    info = safe(lambda: supervisor("GET", f"/addons/{slug}/info"), {})
                    if info and info.get("update_available"):
                        cur_v = info.get("version")
                        latest_v = info.get("version_latest")
                        log(f"auto-update: new version detected ({cur_v} -> {latest_v}). Initiating automated update...")
                        try:
                            me = slug.replace("-", "_")
                            supervisor("POST", "/core/api/services/update/install",
                                       {"entity_id": f"update.{me}_update"}, timeout=300)
                            oplog({"kind": "update_agent", "label": "Auto-update add-on", "by": "auto-updater",
                                   "status": "ok", "message": f"Update triggered: {cur_v} -> {latest_v}"})
                        except Exception as ex:
                            log(f"auto-update failed: {ex}")
        except Exception as e:
            log(f"auto-update check error: {e}")
        time.sleep(21600)  # check every 6 hours


# ------------------------------------------------------------------ local status page
def write_status() -> None:
    st = state()
    hb = {}
    try:
        with open(f"{DATA}/last_heartbeat.json") as f:
            hb = json.load(f)
    except (OSError, ValueError):
        pass
    tunnel_up = subprocess.run(["pgrep", "-x", "frpc"], capture_output=True).returncode == 0
    with _state_lock:
        t = _last_telemetry
    sys_cached = {}
    try:
        if os.path.exists(f"{DATA}/last_system.json"):
            with open(f"{DATA}/last_system.json") as f:
                sys_cached = json.load(f)
    except Exception:
        pass

    global _last_latency_check, _current_latency_ms
    if _current_latency_ms is None or (time.time() - _last_latency_check > 30):
        measure_latency()

    out = {
        "generated_at": now_iso(), "agent_version": get_addon_version(),
        "instance_uid": st.get("instance_uid"), "site_name": st.get("site_name"),
        "public_url": st.get("public_url"), "subdomain": st.get("subdomain"),
        "cert_not_after": st.get("cert_not_after"), "tunnel_up": tunnel_up,
        "subscription": hb.get("status", "active"), "subscription_message": hb.get("message"),
        "paid_until": hb.get("paid_until"), "last_heartbeat": hb.get("_at"),
        "management_allowed": management_allowed(),
        "hub_latency_ms": _current_latency_ms,
        "telemetry_sent": _last_result,
        "system": {
            "ha_uuid": os.environ.get("AJN_INSTALL_ID") or sys_cached.get("ha_uuid"),
            "machine_id": (t.get("info") or {}).get("machine_id") or sys_cached.get("machine_id"),
            "hostname": (t.get("info") or {}).get("hostname") or sys_cached.get("hostname"),
            "board": (t.get("os") or {}).get("board") or (t.get("info") or {}).get("machine") or sys_cached.get("board"),
            "interfaces": (t.get("network") or {}).get("interfaces") or sys_cached.get("interfaces") or [],
            "core": (t.get("core") or {}).get("version") or sys_cached.get("core"),
            "supervisor": (t.get("supervisor") or {}).get("version") or sys_cached.get("supervisor"),
            "os": (t.get("os") or {}).get("version") or sys_cached.get("os"),
        },
        "oplog": read_oplog(),
        "temp_logins": [{"username": u["username"], "expires": u["expires"]} for u in F._load_temp()],
    }

    for target_dir in [WWW, "/usr/share/ajn/www"]:
        try:
            os.makedirs(target_dir, exist_ok=True)
            os.chmod(target_dir, 0o755)
            tmp = f"{target_dir}/status.json.tmp"
            with open(tmp, "w") as f:
                json.dump(out, f)
            os.chmod(tmp, 0o666)
            os.replace(tmp, f"{target_dir}/status.json")
            os.chmod(f"{target_dir}/status.json", 0o666)
        except OSError:
            pass


def main() -> None:
    # 1. Immediately write status on startup so ingress page loads with complete fields
    try:
        write_status()
    except Exception as e:
        log(f"initial status write: {e}")

    q: "queue.Queue[dict]" = queue.Queue()
    fast: "queue.Queue[dict]" = queue.Queue()
    threading.Thread(target=worker, args=(q,), daemon=True).start()
    threading.Thread(target=worker, args=(fast,), daemon=True).start()
    threading.Thread(target=poll_commands, args=(q, fast), daemon=True).start()
    threading.Thread(target=auto_update_loop, daemon=True).start()
    finish_pending_self_update()
    next_tel = next_cleanup = 0.0
    while True:
        if time.time() >= next_tel:
            send_telemetry()
            next_tel = time.time() + (300 if _last_result.get("ok") else 60)
        try:
            write_status()
        except OSError as e:
            log(f"status page: {e}")
        if time.time() >= next_cleanup:
            next_cleanup = time.time() + 60
            try:
                # expired logins go; with installer management switched off, every temporary login goes
                off = not management_allowed()
                for u in F.temp_access_cleanup(SUP_TOKEN, force_all=off):
                    why = "installer management is off" if off else "expired"
                    oplog({"kind": "temp_access", "label": "Temporary technician login removed", "by": "system",
                           "status": "ok", "message": f"{u} removed ({why})"})
                    log(f"temporary login {u} removed ({why})")
            except Exception as e:  # noqa: BLE001
                log(f"temp login cleanup: {e}")
        time.sleep(10)


if __name__ == "__main__":
    main()
