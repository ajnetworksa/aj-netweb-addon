"""AJ Audio telemetry: Music Assistant + AJ wall panels at this site (part of the agent's telemetry).

Read-only. Sources:
* Supervisor add-on list -> Music Assistant add-on state / version.
* Music Assistant JSON-RPC (POST <ma>/api, Bearer long-lived token from the add-on options):
  server info, providers (AriaCast receiver, Snapcast / AJ Snap), players/all -> AJ panels
  (player id contains "ajpanel").
* Each AJ panel: GET http://<panel-ip>:8766/api/info (no login needed).

The control plane turns this into alerts (control/app/audio.py). Names, addresses and models of panels
are only sent while the owner allows installer management; otherwise panels are reported by an
anonymous id, which is enough for counts and alerts.

Standard library only.
"""
from __future__ import annotations

import hashlib
import json
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor

STATE_FILE = "/data/ajn/audio_state.json"
MA_PORT = 8095
PANEL_PORT = 8766
# Add-on containers reach host-network add-ons (Music Assistant runs with host networking) on the
# hassio bridge gateway.
HOST_GATEWAY = "172.30.32.1"
MA_TIMEOUT = 8
PANEL_TIMEOUT = 4
# LAN-only calls: never through an HTTP proxy from the environment
_OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))
DROP_WINDOW_S = 900          # sync drops are reported as the max over the last 15 min (no alert flapping)

# fields copied from a panel's /api/info (everything else is ignored)
PANEL_FIELDS = ("version", "model", "android", "sync_connected", "sync_restarts", "sync_drops_5min",
                "server_ok", "registered", "status", "crashed", "update_available", "silent_update",
                "silent_via", "auto_update", "auto_update_state", "repair_ready", "resample",
                "zigbee_bridge", "zigbee_rx", "zigbee_tx", "uptime_s")
PRIVATE_FIELDS = ("model", "android")   # with the name/ip: only with the owner's consent


class MAError(Exception):
    pass


# ------------------------------------------------------------------ small helpers
def _http_json(url: str, body: dict | None = None, token: str = "", timeout: float = MA_TIMEOUT):
    headers = {"Accept": "application/json"}
    if body is not None:
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, method="POST" if body is not None else "GET", headers=headers,
                                 data=json.dumps(body).encode() if body is not None else None)
    with _OPENER.open(req, timeout=timeout) as r:
        return json.loads(r.read() or b"null")


def _short(v, n: int = 120):
    return v[:n] if isinstance(v, str) else v


def _num(v):
    return v if isinstance(v, (int, float)) and not isinstance(v, bool) else None


def anon_id(player_id: str) -> str:
    return "p-" + hashlib.sha1(player_id.encode()).hexdigest()[:10]


def _load_state() -> dict:
    try:
        with open(STATE_FILE) as f:
            d = json.load(f)
            return d if isinstance(d, dict) else {}
    except (OSError, ValueError):
        return {}


def _save_state(d: dict) -> None:
    try:
        with open(STATE_FILE, "w") as f:
            json.dump(d, f)
    except OSError:
        pass


# ------------------------------------------------------------------ Music Assistant
class MA:
    def __init__(self, base: str, token: str):
        self.base, self.token, self._n = base.rstrip("/"), token, 0

    def info(self) -> dict:
        d = _http_json(f"{self.base}/info", timeout=MA_TIMEOUT)
        return d if isinstance(d, dict) else {}

    def cmd(self, command: str, **args):
        self._n += 1
        try:
            d = _http_json(f"{self.base}/api", {"message_id": str(self._n), "command": command, "args": args},
                           self.token)
        except urllib.error.HTTPError as e:
            raise MAError(f"{command}: HTTP {e.code}") from None
        if isinstance(d, dict):
            if d.get("error_code") or d.get("error"):
                raise MAError(f"{command}: {d.get('details') or d.get('error') or d.get('error_code')}")
            if "result" in d and "message_id" in d:
                return d["result"]
        return d


def find_ma_addon(addons: list) -> dict:
    for a in addons or []:
        slug, name = str(a.get("slug", "")).lower(), str(a.get("name", "")).lower()
        if "music_assistant" in slug or "music-assistant" in slug or "music assistant" in name:
            return a
    return {}


def _candidates(opts: dict, host_ips: list) -> list:
    url = str(opts.get("music_assistant_url") or "").strip()
    if url:
        return [url if "://" in url else f"http://{url}"]
    return [f"http://{HOST_GATEWAY}:{MA_PORT}"] + [f"http://{ip}:{MA_PORT}" for ip in host_ips if ip]


def _providers(ma: MA) -> list:
    for c in ("providers", "config/providers"):
        try:
            r = ma.cmd(c)
            if isinstance(r, list):
                return [p for p in r if isinstance(p, dict)]
        except (MAError, OSError, ValueError):
            continue
    return []


def _provider_state(provs: list, *domains: str) -> dict:
    hit = [p for p in provs if str(p.get("domain", "")).lower() in domains]
    if not hit:
        return {"present": False}
    p = hit[0]
    ok = p.get("available")
    if ok is None:
        ok = p.get("enabled", True)
    return {"present": True, "domain": p.get("domain"), "available": bool(ok)}


def _player_ip(p: dict) -> str:
    di = p.get("device_info") or {}
    ip = di.get("ip_address")
    ids = di.get("identifiers")
    if not ip and isinstance(ids, dict):
        ip = ids.get("ip_address") or ids.get("IP_ADDRESS")
    if not ip and isinstance(ids, list):             # [["ip_address", "1.2.3.4"], ...]
        for it in ids:
            if isinstance(it, (list, tuple)) and len(it) == 2 and str(it[0]).lower() == "ip_address":
                ip = it[1]
    return str(ip or "")


def _panel_info(ip: str) -> dict | None:
    if not ip:
        return None
    try:
        d = _http_json(f"http://{ip}:{PANEL_PORT}/api/info", timeout=PANEL_TIMEOUT)
        return d if isinstance(d, dict) else None
    except (OSError, ValueError, urllib.error.URLError):
        return None


# ------------------------------------------------------------------ main entry
def collect(opts: dict, addons: list, host_ips: list, allowed: bool, log=print, now: float | None = None) -> dict:
    """Returns the telemetry["audio"] block, or {} when this site has no Music Assistant at all."""
    now = time.time() if now is None else now
    addon = find_ma_addon(addons)
    token = str(opts.get("music_assistant_token") or "").strip()
    if not addon and not opts.get("music_assistant_url"):
        return {}

    out: dict = {"collected_at": int(now)}
    ma_out: dict = {"addon": {k: addon.get(k) for k in ("slug", "name", "state", "version", "version_latest",
                                                         "update_available") if k in addon} if addon else None,
                    "up": False, "token": "set" if token else "missing"}
    out["ma"] = ma_out

    ma = None
    for base in _candidates(opts, host_ips):
        try:
            info = MA(base, token).info()
            ma = MA(base, token)
            ma_out.update(up=True, version=_short(info.get("server_version") or info.get("version")),
                          url=base if allowed else None)
            break
        except (OSError, ValueError, urllib.error.URLError) as e:
            ma_out["error"] = _short(str(e), 160)
    if ma is None:
        return out
    ma_out.pop("error", None)
    if not token:
        return out

    try:
        players = ma.cmd("players/all")
    except MAError as e:
        ma_out["token"] = "rejected" if ("401" in str(e) or "403" in str(e)) else "error"
        ma_out["error"] = _short(str(e), 160)
        return out
    except (OSError, ValueError) as e:
        ma_out["error"] = _short(str(e), 160)
        return out
    ma_out["token"] = "ok"
    provs = _providers(ma)
    ma_out["aria"] = _provider_state(provs, "ariacast_receiver")
    ma_out["snapcast"] = _provider_state(provs, "snapcast", "ajsnap")
    ma_out["providers_known"] = bool(provs)

    panels_ma = [p for p in (players if isinstance(players, list) else [])
                 if isinstance(p, dict) and "ajpanel" in str(p.get("player_id", "")).lower()]
    ips = [_player_ip(p) for p in panels_ma]
    with ThreadPoolExecutor(max_workers=8) as ex:
        infos = list(ex.map(_panel_info, ips))

    st = _load_state()
    off_since: dict = st.get("offline_since") or {}
    drops_hist: dict = st.get("drops") or {}
    new_off, new_drops, panels = {}, {}, []
    for p, ip, info in zip(panels_ma, ips, infos):
        pid = str(p.get("player_id"))
        available = bool(p.get("available"))
        reachable = info is not None
        offline = not (available and reachable)
        if offline:
            new_off[pid] = off_since.get(pid, now)
        rec = {"id": anon_id(pid), "available": available, "reachable": reachable,
               "offline_s": int(now - new_off[pid]) if offline else 0}
        if allowed:
            rec.update(player_id=pid, ip=ip, name=_short(p.get("display_name") or p.get("name")
                                                         or (info or {}).get("name") or pid, 80))
        for k in PANEL_FIELDS:
            if info and k in info and (allowed or k not in PRIVATE_FIELDS):
                v = info[k]
                rec[k] = _short(v) if not isinstance(v, (dict, list)) else None
        if info and isinstance(info.get("crashed"), str):        # last crash text -> flag + short reason
            rec["crashed"], rec["crash_info"] = bool(info["crashed"].strip()), info["crashed"][:200]
        hist = [h for h in drops_hist.get(pid, []) if now - h[0] < DROP_WINDOW_S]
        d5 = _num((info or {}).get("sync_drops_5min"))
        if d5 is not None:
            hist.append([now, d5])
        new_drops[pid] = hist
        rec["sync_drops_recent"] = max((h[1] for h in hist), default=0)
        panels.append(rec)
    _save_state({"offline_since": new_off, "drops": new_drops})
    out["panels"] = panels
    return out
