#!/usr/bin/env python3
"""
AJ Netweb Prayer & Adhan - scheduler + ingress studio.

* Prayer times come from Home Assistant's native Islamic Prayer Times integration.
* At each prayer the adhan plays on the chosen speakers (player.py); TVs can be paused.
* Publishes sensor.ajnetweb_next_prayer (times, countdown target, Hijri date) and creates
  helper entities so anyone in the family can control it from the dashboard:
    input_boolean.aj_netweb_adhan            master on/off
    input_boolean.aj_netweb_adhan_mute_next  skip only the next adhan
    input_button.aj_netweb_adhan_play_now      play the adhan now (test)
    input_button.aj_netweb_adhan_stop       stop playback
    input_boolean.aj_netweb_precool         AC pre-cooling before prayers on/off (precool.py)
"""

import json
import logging
import os
import re
import threading
import time
import urllib.parse
from datetime import datetime, timedelta, timezone
from http.server import HTTPServer, SimpleHTTPRequestHandler
from socketserver import ThreadingMixIn

import ha
import player
import prayer
import precool

import ajn_license

LICENSE = ajn_license.License("adhan", "AJ Netweb Prayer & Adhan")

logging.basicConfig(level=logging.INFO, format="[%(asctime)s] %(levelname)s [%(name)s]: %(message)s")
log = logging.getLogger("adhan.server")

PORT = int(os.environ.get("INGRESS_PORT", 8093))
WWW = os.path.join(os.path.dirname(os.path.abspath(__file__)), "www")
SETTINGS_FILE = "/data/settings.json"
HISTORY_FILE = "/data/history.json"
AUDIO_DIR = os.path.join(ha.resolve_config_dir(), "www", "ajnetweb_adhan")
AUDIO_EXT = (".mp3", ".m4a", ".aac", ".ogg", ".wav")
MAX_UPLOAD = 20 * 1024 * 1024
ALLOWED_CLIENTS = {"172.30.32.2", "127.0.0.1", "::1"}
SENSOR = "sensor.ajnetweb_next_prayer"

HELPERS = {
    "master": ("input_boolean", "aj_netweb_adhan", "AJ Netweb Adhan", "mdi:mosque"),
    "mute_next": ("input_boolean", "aj_netweb_adhan_mute_next", "AJ Netweb Adhan mute next", "mdi:volume-off"),
    "play": ("input_button", "aj_netweb_adhan_play_now", "AJ Netweb Adhan play now", "mdi:play-circle"),
    "stop": ("input_button", "aj_netweb_adhan_stop", "AJ Netweb Adhan stop", "mdi:stop-circle"),
    "precool": ("input_boolean", "aj_netweb_precool", "AJ Netweb AC pre-cooling", "mdi:snowflake-thermometer"),
}

DEFAULTS = {
    "enabled": True,
    "language": "ar",
    "speakers": [],
    "pause_players": [],
    "volume": 0.45,
    "default_file": "",
    "fajr_file": "",
    "dua_file": "",
    "prayers": {p: {"enabled": True, "offset": 0, "volume": None} for p in prayer.PRAYERS},
    "only_when_home": False,
    "reminder_minutes": 0,
    "notify_at_adhan": False,
    "suhoor_minutes": 0,
    "hijri_adjust": 0,
    "resume_delay": 3,
    "precool": precool.DEFAULTS,
}

_settings_lock = threading.Lock()
STATE = {"sensors": {}, "times": {}, "fired": set(), "helpers": {}, "last": None, "playing": False}


# ------------------------------------------------------------------ settings & history
def merge(base, extra):
    out = json.loads(json.dumps(base))
    for k, v in (extra or {}).items():
        out[k] = merge(out[k], v) if isinstance(v, dict) and isinstance(out.get(k), dict) else v
    return out


def load_settings() -> dict:
    try:
        with open(SETTINGS_FILE) as f:
            return merge(DEFAULTS, json.load(f))
    except (OSError, ValueError):
        return merge(DEFAULTS, {})


def save_settings(changes: dict) -> dict:
    with _settings_lock:
        s = merge(load_settings(), changes)
        for key in ("speakers", "pause_players"):
            if key in changes:
                s[key] = [e for e in changes[key] if isinstance(e, str) and e.startswith("media_player.")]
        if "precool" in changes:
            s["precool"] = precool.sanitize(s["precool"])
        tmp = SETTINGS_FILE + ".tmp"
        with open(tmp, "w") as f:
            json.dump(s, f, indent=2, ensure_ascii=False)
        os.replace(tmp, SETTINGS_FILE)
        return s


def add_history(entry: dict):
    try:
        hist = json.load(open(HISTORY_FILE))
    except (OSError, ValueError):
        hist = []
    hist.insert(0, entry)
    with open(HISTORY_FILE, "w") as f:
        json.dump(hist[:60], f, ensure_ascii=False)


# ------------------------------------------------------------------ helpers (HA entities)
def ensure_helpers():
    """Create the dashboard control helpers once (input_boolean / input_button via WS)."""
    try:
        with ha.WS() as ws:
            for key, (domain, object_id, name, icon) in HELPERS.items():
                existing = ws.call(f"{domain}/list") or []
                item = next((i for i in existing if i.get("id") == object_id or i.get("name") == name), None)
                if not item:
                    item = ws.call(f"{domain}/create", name=name, icon=icon,
                                   **({"initial": key in ("master", "precool")} if domain == "input_boolean" else {}))
                STATE["helpers"][key] = f"{domain}.{item.get('id', object_id)}"
        log.info("Helpers: %s", STATE["helpers"])
    except Exception as e:
        log.warning("Could not create helper entities: %s", e)


def helper_on(key: str, all_states: dict, default=True) -> bool:
    eid = STATE["helpers"].get(key)
    st = all_states.get(eid) if eid else None
    return default if not st else st.get("state") == "on"


# ------------------------------------------------------------------ adhan
def audio_url(fname: str) -> str:
    return f"{ha.ha_base_url()}/local/ajnetweb_adhan/{urllib.parse.quote(fname)}"


def file_for(key: str, s: dict) -> str:
    if key == "fajr" and s.get("fajr_file"):
        return s["fajr_file"]
    return s.get("default_file") or ""


def notify_phones(title: str, message: str):
    """Push to every Companion app (notify.mobile_app_*)."""
    try:
        services = ha.rest("GET", "/core/api/services") or []
        targets = [n for d in services if d.get("domain") == "notify"
                   for n in (d.get("services") or {}) if n.startswith("mobile_app_")]
        for t in targets:
            ha.call_service("notify", t, {"title": title, "message": message,
                                           "data": {"tag": "ajnetweb_prayer", "notification_icon": "mdi:mosque"}})
    except ha.HAError as e:
        log.warning("notify failed: %s", e)


def run_adhan(key: str, manual: bool = False):
    if not LICENSE.allowed():
        log.warning("Adhan not played: %s", LICENSE.status()["message"])
        return
    s = load_settings()
    lang = s.get("language", "ar")
    name = prayer.NAMES.get(lang, prayer.NAMES["en"]).get(key, key)
    fname = file_for(key, s)
    path = os.path.join(AUDIO_DIR, fname) if fname else ""
    entry = {"prayer": key, "at": datetime.now(timezone.utc).isoformat(), "manual": manual}
    if not fname or not os.path.exists(path):
        entry["result"] = "no audio file - upload one in the Audio tab"
        add_history(entry)
        log.warning("Adhan %s skipped: no audio file", key)
        return entry
    targets = s.get("speakers") or []
    if not targets:
        entry["result"] = "no speakers selected"
        add_history(entry)
        return entry
    p = s["prayers"].get(key, {})
    vol = p.get("volume") if p.get("volume") is not None else s.get("volume", 0.45)
    STATE["playing"] = True
    publish()
    try:
        if s.get("notify_at_adhan") and not manual:
            notify_phones(f"🕌 {name}", "حان الآن موعد الأذان" if lang == "ar" else f"It is time for {name} prayer")
        res = player.play(audio_url(fname), path, targets, float(vol), s.get("pause_players") or [],
                          resume_after=float(s.get("resume_delay", 3)))
        dua = s.get("dua_file")
        if dua and os.path.exists(os.path.join(AUDIO_DIR, dua)) and not player._stop.is_set():
            player.play(audio_url(dua), os.path.join(AUDIO_DIR, dua), targets, float(vol), [])
        entry["result"] = res
        ha.fire_event("ajnetweb_adhan_played", {"prayer": key, "manual": manual, "speakers": targets})
    finally:
        STATE["playing"] = False
        STATE["last"] = entry
        add_history(entry)
        publish()
    return entry


def run_precool(rule: dict, key: str, manual: bool = False):
    """Start the ACs of one pre-cooling rule (see precool.py for when an AC is left alone)."""
    s = load_settings()
    all_states = ha.states()
    pc = s.get("precool") or {}
    season = precool.season(pc, datetime.now().month)
    entry = {"kind": "precool", "rule": rule.get("name"), "prayer": key,
             "at": datetime.now(timezone.utc).isoformat(), "manual": manual}
    temp = precool.target_temp(rule, season)
    if temp is None:
        entry["result"] = f"rests in {season}"
        add_history(entry)
        return entry
    result = {}
    for eid in rule.get("climates") or []:
        data, why = precool.plan(rule, temp, all_states.get(eid))
        if data:
            try:
                ha.call_service("climate", "set_temperature", {"entity_id": eid, **data})
            except ha.HAError as e:
                why = f"failed: {e}"
        result[eid] = why
    entry["result"] = result
    add_history(entry)
    ha.fire_event("ajnetweb_precool_started", {"rule": rule.get("id"), "prayer": key, "manual": manual,
                                                "result": result})
    log.info("Pre-cooling %s before %s: %s", rule.get("name"), key, result)
    return entry


def tick():
    """Every few seconds: refresh times, fire due adhans / reminders."""
    if not LICENSE.allowed():
        return
    s = load_settings()
    all_states = ha.states()
    if not STATE["sensors"] or any(e not in all_states for e in STATE["sensors"].values()):
        STATE["sensors"] = prayer.find_sensors()
    STATE["times"] = prayer.today_times(STATE["sensors"], all_states)
    now = datetime.now(timezone.utc)
    hij = prayer.hijri(adjust_days=int(s.get("hijri_adjust") or 0))
    lang = s.get("language", "ar")

    def due(key: str, when: datetime) -> bool:
        tag = f"{key}@{when.isoformat()}"
        if tag in STATE["fired"] or not (when <= now < when + timedelta(seconds=90)):
            return False
        STATE["fired"].add(tag)
        return True

    enabled = s.get("enabled", True) and helper_on("master", all_states)
    someone_home = any(st.get("state") == "home" for e, st in all_states.items() if e.startswith("person."))
    for key in prayer.PRAYERS:
        t = STATE["times"].get(key)
        cfg = s["prayers"].get(key, {})
        if not t or not cfg.get("enabled", True):
            continue
        at = t + timedelta(minutes=int(cfg.get("offset") or 0))
        name = prayer.NAMES.get(lang, prayer.NAMES["en"]).get(key, key)
        rem = int(s.get("reminder_minutes") or 0)
        if rem and enabled and due(f"reminder-{key}", at - timedelta(minutes=rem)):
            notify_phones(f"🕌 {name}", (f"الأذان بعد {rem} دقيقة" if lang == "ar" else f"Adhan in {rem} minutes"))
        if key == "fajr" and hij.get("ramadan") and int(s.get("suhoor_minutes") or 0) and enabled:
            sm = int(s["suhoor_minutes"])
            if due("suhoor", at - timedelta(minutes=sm)):
                notify_phones("🌙 السحور" if lang == "ar" else "🌙 Suhoor",
                              f"الفجر بعد {sm} دقيقة" if lang == "ar" else f"Fajr in {sm} minutes")
        if due(key, at):
            if not enabled:
                add_history({"prayer": key, "at": now.isoformat(), "result": "skipped (switched off)"})
            elif helper_on("mute_next", all_states, default=False):
                add_history({"prayer": key, "at": now.isoformat(), "result": "skipped (mute next)"})
                ha.call_service("input_boolean", "turn_off", {"entity_id": STATE["helpers"]["mute_next"]})
            elif s.get("only_when_home") and not someone_home:
                add_history({"prayer": key, "at": now.isoformat(), "result": "skipped (nobody home)"})
            else:
                threading.Thread(target=run_adhan, args=(key,), daemon=True).start()
    pc = s.get("precool") or {}
    if pc.get("rules") and helper_on("precool", all_states):
        season = precool.season(pc, datetime.now().month)
        for rule, key, at in precool.starts(pc, STATE["times"]):
            if not due(f"precool-{rule['id']}-{key}", at):
                continue
            why = precool.skip_reason(rule, season, bool(hij.get("ramadan")), someone_home)
            if why:
                add_history({"kind": "precool", "rule": rule["name"], "prayer": key, "at": now.isoformat(),
                             "result": f"skipped ({why})"})
            else:
                threading.Thread(target=run_precool, args=(rule, key), daemon=True).start()
    # forget old tags
    STATE["fired"] = {t for t in STATE["fired"] if t.split("@")[1] > (now - timedelta(days=2)).isoformat()}
    publish(hij)


def publish(hij: dict = None):
    s = load_settings()
    hij = hij if hij is not None else prayer.hijri(adjust_days=int(s.get("hijri_adjust") or 0))
    key, when = prayer.next_prayer(STATE["times"])
    attrs = {
        "friendly_name": "Next prayer", "icon": "mdi:mosque",
        "next_prayer": key, "next_time": when.isoformat() if when else None,
        "times": {k: v.isoformat() for k, v in STATE["times"].items()},
        "names": prayer.NAMES.get(s.get("language", "ar"), prayer.NAMES["en"]),
        "hijri": hij, "ramadan": bool(hij.get("ramadan")), "playing": STATE["playing"],
        "enabled": s.get("enabled", True), "helpers": STATE["helpers"],
        "last_adhan": STATE["last"]["at"] if STATE["last"] else None,
    }
    try:
        ha.set_state(SENSOR, key or "none", attrs)
    except ha.HAError as e:
        log.debug("publish: %s", e)


def scheduler():
    while True:
        try:
            tick()
        except Exception as e:
            log.warning("tick: %s", e)
        time.sleep(5)


def on_helper_change(eid: str, new_state: dict):
    if eid == STATE["helpers"].get("play") and not STATE["playing"]:
        key, _ = prayer.next_prayer(STATE["times"])
        threading.Thread(target=run_adhan, args=(key or "dhuhr", True), daemon=True).start()
    elif eid == STATE["helpers"].get("stop"):
        player.stop()


# ------------------------------------------------------------------ HTTP
class Server(ThreadingMixIn, HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=WWW, **k)

    def log_message(self, *a):
        pass

    def _ok(self):
        if self.client_address[0] in ALLOWED_CLIENTS:
            return True
        self.send_error(403)
        return False

    def _path(self):
        p = urllib.parse.urlparse(self.path).path
        return p[p.rfind("/api/"):] if "/api/" in p else p

    def _json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False, default=str).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _guard(self, fn):
        try:
            self._json(fn())
        except Exception as e:
            log.exception("request failed")
            self._json({"ok": False, "error": str(e)}, 500)

    def do_HEAD(self):
        if self._ok() and not ajn_license.handle(self, LICENSE):
            super().do_HEAD()

    def do_GET(self):
        if not self._ok():
            return
        if ajn_license.handle(self, LICENSE):
            return
        p = self._path()
        if p == "/api/status":
            return self._guard(self._status)
        if p == "/api/speakers":
            return self._guard(lambda: {"ok": True, "speakers": player.speakers(ha.states())})
        if p == "/api/climates":
            return self._guard(self._climates)
        if p == "/api/history":
            return self._guard(lambda: {"ok": True, "history": json.load(open(HISTORY_FILE)) if os.path.exists(HISTORY_FILE) else []})
        if p.startswith("/api/"):
            return self._json({"ok": False, "error": "not found"}, 404)
        super().do_GET()

    def _status(self):
        s = load_settings()
        key, when = prayer.next_prayer(STATE["times"])
        entry = prayer.integration_entry()
        files = sorted(f for f in os.listdir(AUDIO_DIR) if f.lower().endswith(AUDIO_EXT)) if os.path.isdir(AUDIO_DIR) else []
        return {
            "ok": True, "settings": s, "times": {k: v.isoformat() for k, v in STATE["times"].items()},
            "next": {"prayer": key, "time": when.isoformat() if when else None},
            "hijri": prayer.hijri(adjust_days=int(s.get("hijri_adjust") or 0)),
            "integration": {"installed": bool(entry), "method": ((entry or {}).get("options") or {}).get("calculation_method"),
                            "sensors": STATE["sensors"]},
            "methods": prayer.METHODS, "files": files, "helpers": STATE["helpers"], "playing": STATE["playing"],
            "names": prayer.NAMES,
        }

    def _climates(self):
        out = []
        for eid, st in sorted(ha.states().items()):
            if eid.startswith("climate."):
                a = st.get("attributes") or {}
                out.append({"entity_id": eid, "name": a.get("friendly_name") or eid, "state": st.get("state"),
                            "hvac_modes": a.get("hvac_modes") or [], "temperature": a.get("temperature"),
                            "current_temperature": a.get("current_temperature")})
        s = load_settings()
        return {"ok": True, "climates": out, "season": precool.season(s["precool"], datetime.now().month)}

    def do_POST(self):
        if not self._ok():
            return
        if ajn_license.handle(self, LICENSE):
            return
        p = self._path()
        length = int(self.headers.get("Content-Length") or 0)
        if p == "/api/upload":
            return self._guard(lambda: self._upload(length))
        body = json.loads(self.rfile.read(length) or b"{}") if length else {}
        if p == "/api/settings":
            return self._guard(lambda: {"ok": True, "settings": save_settings(body)})
        if p == "/api/test":
            key = body.get("prayer") or "dhuhr"
            threading.Thread(target=run_adhan, args=(key, True), daemon=True).start()
            return self._json({"ok": True})
        if p == "/api/precool/test":
            rule = next((r for r in load_settings()["precool"]["rules"] if r["id"] == body.get("id")), None)
            if not rule:
                return self._json({"ok": False, "error": "unknown rule"}, 404)
            return self._guard(lambda: {"ok": True, "entry": run_precool(rule, (rule["prayers"] or ["maghrib"])[0], True)})
        if p == "/api/stop":
            player.stop()
            return self._json({"ok": True})
        if p == "/api/setup":
            return self._guard(lambda: prayer.setup_integration(body.get("method") or "makkah", body.get("school") or "shafi"))
        if p == "/api/delete":
            def delete():
                name = os.path.basename(body.get("file") or "")
                path = os.path.join(AUDIO_DIR, name)
                if name and os.path.isfile(path):
                    os.remove(path)
                return {"ok": True}
            return self._guard(delete)
        self._json({"ok": False, "error": "not found"}, 404)

    def _upload(self, length: int):
        if length <= 0 or length > MAX_UPLOAD:
            return {"ok": False, "error": "File must be between 1 byte and 20 MB"}
        raw = urllib.parse.unquote(self.headers.get("X-Filename") or "adhan.mp3")
        name = re.sub(r"[^A-Za-z0-9._\-]+", "_", os.path.basename(raw)).strip("._") or "adhan.mp3"
        if not name.lower().endswith(AUDIO_EXT):
            return {"ok": False, "error": "Use mp3, m4a, aac, ogg or wav"}
        os.makedirs(AUDIO_DIR, exist_ok=True)
        data = self.rfile.read(length)
        with open(os.path.join(AUDIO_DIR, name), "wb") as f:
            f.write(data)
        os.chmod(os.path.join(AUDIO_DIR, name), 0o644)
        return {"ok": True, "file": name, "seconds": round(player.duration_of(os.path.join(AUDIO_DIR, name)))}


def main():
    os.makedirs(AUDIO_DIR, exist_ok=True)
    ensure_helpers()
    ha.watch_states(lambda: {STATE["helpers"].get("play"), STATE["helpers"].get("stop")}, on_helper_change)
    threading.Thread(target=scheduler, daemon=True, name="scheduler").start()
    log.info("Prayer & Adhan studio on :%s, audio in %s", PORT, AUDIO_DIR)
    Server(("0.0.0.0", PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
