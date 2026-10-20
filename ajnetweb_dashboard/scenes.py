#!/usr/bin/env python3
"""
AJ Netweb Dashboard - "Save as scene" in the Studio.

The installer sets a room the way the client likes it (lights dimmed, curtains half open, AC at 23) and saves
that as a normal Home Assistant scene in scenes.yaml, through the same config API HA's own scene editor uses.
The scene is put in the room's area so it shows on the room page and in the room's scene buttons.
"""

import logging
import re
import time
from typing import Any, Dict, List, Optional

log = logging.getLogger("dashboard.scenes")

ID_PREFIX = "ajnetweb_"
GROUPS = ("lights", "covers", "climates", "fans", "media", "switches")   # what a scene can sensibly hold

# attributes HA's reproduce-state uses per domain (the rest is read-only information)
KEEP = {
    "cover": ("current_position", "current_tilt_position"),
    "climate": ("temperature", "target_temp_high", "target_temp_low", "fan_mode", "swing_mode", "preset_mode", "humidity"),
    "fan": ("percentage", "preset_mode", "oscillating", "direction"),
    "media_player": ("volume_level", "is_volume_muted", "source"),
    "water_heater": ("temperature", "operation_mode"),
}


def scene_id(area_id: str, name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "_", (name or "").lower()).strip("_")[:40] or str(int(time.time()))
    return f"{ID_PREFIX}{area_id}_{slug}"[:80]


def entity_state(st: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """The part of a state object a scene stores, or None when the entity can't be captured right now."""
    state = st.get("state")
    if state in (None, "unavailable", "unknown"):
        return None
    domain = st.get("entity_id", "").split(".")[0]
    attrs = st.get("attributes") or {}
    out = {"state": state}
    if domain == "light" and state == "on":
        if attrs.get("brightness") is not None:
            out["brightness"] = attrs["brightness"]
        mode = attrs.get("color_mode")
        if mode == "color_temp" and attrs.get("color_temp_kelvin"):
            out["color_temp_kelvin"] = attrs["color_temp_kelvin"]
        elif mode in ("hs", "xy", "rgb", "rgbw", "rgbww") and attrs.get("hs_color"):
            out["hs_color"] = attrs["hs_color"]
    for key in KEEP.get(domain, ()):
        if attrs.get(key) is not None and not (domain == "media_player" and state == "off"):
            out[key] = attrs[key]
    return out


def summary(st: Dict[str, Any]) -> str:
    """Short text for the Studio list: 'on 60%', 'open 40%', 'cool 23°'."""
    s = entity_state(st)
    if not s:
        return "unavailable"
    if "brightness" in s:
        return f"on {round(s['brightness'] / 2.55)}%"
    if "current_position" in s:
        return f"{s['state']} {s['current_position']}%"
    if "temperature" in s and s["state"] != "off":
        return f"{s['state']} {s['temperature']}°"
    return s["state"]


def build(name: str, icon: str, states: List[Dict[str, Any]]) -> Dict[str, Any]:
    entities = {}
    for st in states:
        s = entity_state(st)
        if s:
            entities[st["entity_id"]] = s
    conf = {"name": name, "entities": entities}
    if icon:
        conf["icon"] = icon
    return conf


def room_entities(model: Dict[str, Any], area_id: str) -> List[Dict[str, Any]]:
    area = next((a for a in model.get("areas", []) if a.get("id") == area_id), None)
    if not area:
        return []
    return [{"entity_id": e["entity_id"], "name": e.get("name") or e["entity_id"], "group": g}
            for g in GROUPS for e in area.get(g) or [] if isinstance(e, dict) and e.get("entity_id")]


def _states(client) -> Dict[str, Dict[str, Any]]:
    return {s["entity_id"]: s for s in (client.rest_get("/core/api/states", []) or [])
            if isinstance(s, dict) and s.get("entity_id")}


def room_now(client, model: Dict[str, Any], area_id: str) -> List[Dict[str, Any]]:
    states = _states(client)
    return [dict(e, now=summary(states[e["entity_id"]]) if e["entity_id"] in states else "unavailable")
            for e in room_entities(model, area_id)]


def save(client, model: Dict[str, Any], area_id: str, name: str, entity_ids: List[str], icon: str = "") -> Dict[str, Any]:
    allowed = {e["entity_id"] for e in room_entities(model, area_id)}
    chosen = [e for e in dict.fromkeys(entity_ids or []) if e in allowed]
    if not chosen:
        return {"ok": False, "error": "Pick at least one device of this room"}
    states = _states(client)
    conf = build(name, icon, [states[e] for e in chosen if e in states])
    if not conf["entities"]:
        return {"ok": False, "error": "None of the chosen devices is available right now"}
    sid = scene_id(area_id, name)
    conf["id"] = sid
    status, body = client.rest("POST", f"/core/api/config/scene/config/{sid}", conf)
    if status != 200:
        hint = " Is `scene: !include scenes.yaml` in configuration.yaml?" if status in (400, 404) else ""
        return {"ok": False, "error": f"Home Assistant refused the scene (HTTP {status} {body}).{hint}"}
    entity_id = _put_in_area(client, sid, area_id)
    return {"ok": True, "scene": sid, "entity_id": entity_id, "count": len(conf["entities"]),
            "skipped": [e for e in chosen if e not in conf["entities"]]}


def _put_in_area(client, sid: str, area_id: str) -> Optional[str]:
    """HA reloads scenes after the save; give the new entity the room's area so the dashboard puts it there."""
    for _ in range(10):
        try:
            with client.session() as s:
                reg = s.try_call("config/entity_registry/list", []) or []
                ent = next((e for e in reg if e.get("platform") == "homeassistant" and e.get("unique_id") == sid), None)
                if ent:
                    if ent.get("area_id") != area_id:
                        s.call("config/entity_registry/update", entity_id=ent["entity_id"], area_id=area_id)
                    return ent["entity_id"]
        except Exception as e:  # noqa: BLE001
            log.warning("Scene %s area: %s", sid, e)
            return None
        time.sleep(0.5)
    return None
