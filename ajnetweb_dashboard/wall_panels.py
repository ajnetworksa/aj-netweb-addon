#!/usr/bin/env python3
"""
AJ Netweb Dashboard - wall panel setup (Studio "Wall panels" tab).

Two ways to get a tablet onto the Wall Panel page quickly:

* QR codes the installer scans with the tablet: one opens the page in a browser / Fully Kiosk, one opens it in
  the Home Assistant Companion app (homeassistant://navigate/...).
* "Apply wall panel profile" for tablets already added through HA's Fully Kiosk Browser integration: sets the
  start URL, loads the page, turns on motion detection, dims the screen after a while (Fully's screensaver
  with low brightness) and keeps the screen from switching off. Only the integration's public actions and
  entities are used (fully_kiosk.set_config / load_url, switch.turn_on, number.set_value).
"""

import io
import logging
import re
from typing import Any, Dict, List, Optional, Tuple

try:
    import segno
except ImportError:  # pragma: no cover - installed in the image
    segno = None

log = logging.getLogger("dashboard.panels")

DOMAIN = "fully_kiosk"
PANEL_VIEW = "tablet"

# entity id endings of the Fully Kiosk integration's entities we use
ENTITY_SUFFIXES = {
    "motion": ("switch", "_motion_detection"),
    "screensaver_timer": ("number", "_screensaver_timer"),
    "screensaver_brightness": ("number", "_screensaver_brightness"),
    "screen_off_timer": ("number", "_screen_off_timer"),
}

DEFAULT_PROFILE = {
    "motion": True,            # wake the screen when someone walks up
    "dim_after": 120,          # seconds without touch or motion before the screen dims (0 = never)
    "dim_brightness": 10,      # brightness while dimmed (0-255)
    "keep_on": True,           # never switch the screen fully off
}


def clean_profile(p: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    p = p if isinstance(p, dict) else {}

    def num(key, lo, hi):
        try:
            return int(min(hi, max(lo, float(p.get(key, DEFAULT_PROFILE[key])))))
        except (TypeError, ValueError):
            return DEFAULT_PROFILE[key]

    return {"motion": bool(p.get("motion", DEFAULT_PROFILE["motion"])), "dim_after": num("dim_after", 0, 3600),
            "dim_brightness": num("dim_brightness", 0, 255), "keep_on": bool(p.get("keep_on", DEFAULT_PROFILE["keep_on"]))}


def panel_path(url_path: str) -> str:
    return f"/{url_path.strip('/')}/{PANEL_VIEW}"


def panel_urls(base_url: str, url_path: str) -> Dict[str, str]:
    """Browser URL (needs HA's address as the tablet sees it) and the Companion app deep link."""
    path = panel_path(url_path)
    base = (base_url or "").strip().rstrip("/")
    return {"browser": f"{base}{path}" if re.match(r"https?://", base) else "",
            "app": f"homeassistant://navigate{path}"}


def qr_svg(text: str) -> str:
    if not segno:
        raise RuntimeError("QR codes are not available in this build")
    out = io.BytesIO()
    segno.make(text, error="m").save(out, kind="svg", scale=6, border=2, dark="#000", light="#fff", xmldecl=False)
    return out.getvalue().decode("utf-8")


def find_tablets(entries: List[dict], devices: List[dict], entities: List[dict]) -> List[Dict[str, Any]]:
    """Fully Kiosk tablets from the config entry, device and entity registries."""
    entry_ids = {e.get("entry_id") for e in entries if e.get("domain") == DOMAIN}
    out = []
    for d in devices:
        if not entry_ids.intersection(d.get("config_entries") or []):
            continue
        mine = [e["entity_id"] for e in entities if e.get("device_id") == d.get("id") and not e.get("disabled_by")]
        found = {}
        for key, (domain, suffix) in ENTITY_SUFFIXES.items():
            found[key] = next((eid for eid in mine if eid.startswith(f"{domain}.") and eid.endswith(suffix)), None)
        out.append({"device_id": d["id"], "name": d.get("name_by_user") or d.get("name") or d["id"],
                    "model": d.get("model") or "", "entities": found})
    return sorted(out, key=lambda t: t["name"].lower())


def profile_calls(tablet: Dict[str, Any], url: str, profile: Dict[str, Any]) -> List[Tuple[str, str, dict]]:
    """The service calls that turn one tablet into a wall panel."""
    p = clean_profile(profile)
    ent = tablet.get("entities") or {}
    calls = []
    if url:
        calls.append((DOMAIN, "set_config", {"device_id": tablet["device_id"], "key": "startURL", "value": url}))
        calls.append((DOMAIN, "load_url", {"device_id": tablet["device_id"], "url": url}))
    if ent.get("motion"):
        calls.append(("switch", "turn_on" if p["motion"] else "turn_off", {"entity_id": ent["motion"]}))
    if ent.get("screensaver_timer"):
        calls.append(("number", "set_value", {"entity_id": ent["screensaver_timer"], "value": p["dim_after"]}))
    if ent.get("screensaver_brightness") and p["dim_after"]:
        calls.append(("number", "set_value", {"entity_id": ent["screensaver_brightness"], "value": p["dim_brightness"]}))
    if ent.get("screen_off_timer") and p["keep_on"]:
        calls.append(("number", "set_value", {"entity_id": ent["screen_off_timer"], "value": 0}))
    return calls


def list_tablets(client) -> List[Dict[str, Any]]:
    with client.session() as s:
        entries = s.try_call("config_entries/get", [], domain=DOMAIN) or []
        if not entries:
            return []
        devices = s.try_call("config/device_registry/list", []) or []
        entities = s.try_call("config/entity_registry/list", []) or []
    return find_tablets(entries, devices, entities)


def apply(client, device_id: str, url: str, profile: Dict[str, Any]) -> Dict[str, Any]:
    tablet = next((t for t in list_tablets(client) if t["device_id"] == device_id), None)
    if not tablet:
        return {"ok": False, "error": "Tablet not found in the Fully Kiosk Browser integration"}
    if url and not re.match(r"https?://", url):
        return {"ok": False, "error": "The page address must start with http:// or https://"}
    steps = []
    with client.session() as s:
        for domain, service, data in profile_calls(tablet, url, profile):
            try:
                s.call("call_service", domain=domain, service=service, service_data=data)
                steps.append({"step": f"{domain}.{service}", "ok": True, "detail": data.get("key") or data.get("entity_id") or ""})
            except Exception as e:  # noqa: BLE001
                log.warning("%s.%s on %s: %s", domain, service, tablet["name"], e)
                steps.append({"step": f"{domain}.{service}", "ok": False, "detail": str(e)})
    return {"ok": all(st["ok"] for st in steps), "tablet": tablet["name"], "steps": steps}
