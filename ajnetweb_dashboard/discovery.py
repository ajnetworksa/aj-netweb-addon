#!/usr/bin/env python3
"""
AJ Netweb Dashboard - House discovery.

Reads the floor, area, device and entity registries plus live states and turns
them into a clean, installer-friendly model: floors -> rooms -> device groups.

Noise filtering relies first on what HA itself knows (entity_category,
hidden_by, disabled_by) and only then on name heuristics, so new integrations
are handled correctly without code changes.
"""

import logging
import re
from typing import Any, Dict, List, Optional

from ha_client import HAClient, HAError

log = logging.getLogger("dashboard.discovery")

# Device groups shown in the dashboard, in display order.
GROUPS = [
    "access", "lights", "climates", "fans", "covers", "media", "cameras",
    "switches", "vacuums", "alarms", "valves", "scenes", "scripts",
    "temperature", "humidity", "air", "power", "openings", "motion", "safety",
    "batteries", "other_sensors",
]
CONTROL_GROUPS = ["access", "lights", "climates", "fans", "covers", "media",
                  "cameras", "switches", "vacuums", "alarms", "valves"]

ACCESS_WORDS = ("gate", "door_relay", "door relay", "strike", "barrier",
                "door_lock", "door lock", "unlock", "doorbell_door", "turnstile")
LIGHT_WORDS = ("light", "lamp", "spot", "led", "chandelier", "sconce", "bulb",
               "downlight", "strip", "pendant", "lighting")

NOISE_PATTERNS = (
    "backlight", "motor_reversal", "calibration", "permit_join", "learn_ir",
    "ir_code", "child_lock", "countdown", "power_on_behavior", "indicator",
    "switch_mode", "switch_type", "isapi_request", "bridge_state", "identify",
    "do_not_disturb", "led_enable", "firmware", "restart", "reboot", "ping",
    "rssi", "linkquality", "last_seen", "uptime", "_ip_address", "wifi_signal",
)

SENSOR_CLASSES = {
    "temperature": "temperature",
    "humidity": "humidity",
    "carbon_dioxide": "air", "pm25": "air", "pm10": "air", "aqi": "air",
    "volatile_organic_compounds": "air", "volatile_organic_compounds_parts": "air",
    "power": "power", "energy": "power",
    "battery": "batteries",
    "illuminance": "other_sensors", "moisture": "other_sensors",
}
BINARY_CLASSES = {
    "door": "openings", "window": "openings", "garage_door": "openings",
    "opening": "openings",
    "motion": "motion", "occupancy": "motion", "presence": "motion",
    "smoke": "safety", "gas": "safety", "carbon_monoxide": "safety",
    "moisture": "safety", "safety": "safety", "tamper": "safety",
}

ROOM_ICONS = [
    (("living", "salon", "lounge", "family"), "mdi:sofa"),
    (("master", "bed", "suite"), "mdi:bed-king"),
    (("kid", "child", "nursery"), "mdi:teddy-bear"),
    (("kitchen", "pantry"), "mdi:stove"),
    (("dining",), "mdi:silverware-fork-knife"),
    (("bath", "wc", "toilet", "shower", "powder"), "mdi:shower"),
    (("majlis", "guest", "diwan"), "mdi:account-group"),
    (("garden", "yard", "lawn", "outdoor"), "mdi:flower"),
    (("pool",), "mdi:pool"),
    (("corridor", "hall", "lobby", "stair"), "mdi:stairs"),
    (("entrance", "entry", "foyer", "gate"), "mdi:door"),
    (("office", "study", "library"), "mdi:desk"),
    (("garage", "parking", "car"), "mdi:garage"),
    (("balcony", "terrace", "roof", "patio"), "mdi:balcony"),
    (("laundry", "utility"), "mdi:washing-machine"),
    (("maid", "staff", "driver"), "mdi:account-tie"),
    (("cinema", "theater", "theatre", "media"), "mdi:theater"),
    (("gym", "fitness"), "mdi:dumbbell"),
    (("server", "rack", "network", "technical"), "mdi:server-network"),
]


def guess_room_icon(name: str) -> str:
    low = (name or "").lower()
    for words, icon in ROOM_ICONS:
        if any(w in low for w in words):
            return icon
    return "mdi:floor-plan"


def is_noise(entity_id: str, name: str) -> bool:
    low = f"{entity_id} {name}".lower()
    if re.search(r"0x[0-9a-f]{8,}", low):
        return True
    return any(p in low for p in NOISE_PATTERNS)


def short_name(name: str, area_name: str) -> str:
    """'Living Room Ceiling Light' in area 'Living Room' -> 'Ceiling Light'."""
    if not name or not area_name:
        return name
    if name.lower().startswith(area_name.lower()):
        rest = name[len(area_name):].strip(" -_:·")
        if rest:
            return rest[0].upper() + rest[1:]
    return name


def classify(entity_id: str, name: str, attrs: Dict[str, Any]) -> Optional[str]:
    domain = entity_id.split(".", 1)[0]
    dc = attrs.get("device_class")
    low = f"{entity_id} {name}".lower()

    if domain == "light":
        return "lights"
    if domain == "lock":
        return "access"
    if domain == "cover":
        if dc in ("gate", "garage") or "gate" in low or "garage" in low:
            return "access"
        return "covers"
    if domain in ("switch", "button"):
        if any(w in low for w in ACCESS_WORDS):
            return "access"
        if domain == "button":
            return None  # buttons are mostly maintenance actions
        if dc != "outlet" and any(w in low for w in LIGHT_WORDS):
            return "lights"
        return "switches"
    if domain == "input_boolean":
        return None
    if domain in ("climate", "water_heater", "humidifier"):
        return "climates"
    if domain == "fan":
        return "fans"
    if domain == "media_player":
        return "media"
    if domain == "camera":
        return "cameras"
    if domain == "vacuum" or domain == "lawn_mower":
        return "vacuums"
    if domain == "alarm_control_panel":
        return "alarms"
    if domain == "valve":
        return "valves"
    if domain == "scene":
        return "scenes"
    if domain == "script":
        return "scripts"
    if domain == "sensor":
        return SENSOR_CLASSES.get(dc)
    if domain == "binary_sensor":
        return BINARY_CLASSES.get(dc)
    return None


def _empty_room(area_id: str, name: str, icon: str = None, floor_id: str = None, picture: str = None):
    room = {"id": area_id, "name": name, "icon": icon or guess_room_icon(name),
            "floor_id": floor_id, "picture": picture}
    for g in GROUPS:
        room[g] = []
    return room


class Discovery:
    def __init__(self, client: HAClient):
        self.client = client

    def run(self, excluded: List[str] = None) -> Dict[str, Any]:
        excluded = set(excluded or [])
        floors_raw, areas_raw, devices_raw, entities_raw = [], [], [], []
        errors = []
        try:
            with self.client.session() as s:
                floors_raw = s.try_call("config/floor_registry/list", []) or []
                areas_raw = s.try_call("config/area_registry/list", []) or []
                devices_raw = s.try_call("config/device_registry/list", []) or []
                entities_raw = s.try_call("config/entity_registry/list", []) or []
        except (HAError, OSError, Exception) as e:  # websocket raises plain exceptions
            errors.append(f"Registry access failed: {e}")
            log.warning("Registry access failed: %s", e)

        states = self.client.rest_get("/core/api/states", []) or []
        states_map = {s["entity_id"]: s for s in states if isinstance(s, dict) and "entity_id" in s}

        dev_area = {d["id"]: d.get("area_id") for d in devices_raw if d.get("id")}
        dev_name = {d["id"]: (d.get("name_by_user") or d.get("name") or "") for d in devices_raw if d.get("id")}
        registry = {e["entity_id"]: e for e in entities_raw if e.get("entity_id")}

        def floor_icon(f):
            if f.get("icon"):
                return f["icon"]
            lvl = f.get("level")
            if isinstance(lvl, int) and 0 <= lvl <= 3:
                return f"mdi:home-floor-{lvl}"
            if lvl == -1:
                return "mdi:home-floor-negative-1"
            return "mdi:home-floor-a"

        floors = sorted(
            [{"id": f.get("floor_id"), "name": f.get("name"), "level": f.get("level"), "icon": floor_icon(f)}
             for f in floors_raw if f.get("floor_id")],
            key=lambda f: (f["level"] is None, f["level"] or 0, (f["name"] or "").lower()),
        )
        floor_ids = {f["id"] for f in floors}

        rooms: Dict[str, Dict[str, Any]] = {}
        for a in areas_raw:
            aid = a.get("area_id")
            if not aid:
                continue
            name = a.get("name") or aid.replace("_", " ").title()
            fid = a.get("floor_id") if a.get("floor_id") in floor_ids else None
            rooms[aid] = _empty_room(aid, name, a.get("icon"), fid, a.get("picture"))
        rooms["unassigned"] = _empty_room("unassigned", "General", "mdi:home-outline")

        house = {g: [] for g in ("weather", "persons", "updates", "batteries", "all")}

        for eid, st in states_map.items():
            attrs = st.get("attributes") or {}
            domain = eid.split(".", 1)[0]
            reg = registry.get(eid, {})

            # HA's own metadata is the reliable noise filter
            if reg.get("entity_category") in ("config", "diagnostic"):
                if domain == "sensor" and attrs.get("device_class") == "battery":
                    pass  # battery is diagnostic but installers need it
                else:
                    continue
            if reg.get("hidden_by") or reg.get("disabled_by"):
                continue

            name = attrs.get("friendly_name") or reg.get("name") or reg.get("original_name") or eid
            if domain == "weather":
                house["weather"].append(eid)
                continue
            if domain == "person":
                house["persons"].append(eid)
                continue
            if domain == "update":
                house["updates"].append(eid)
                continue

            if eid in excluded or is_noise(eid, name):
                continue
            group = classify(eid, name, attrs)
            if not group:
                continue

            area_id = reg.get("area_id") or dev_area.get(reg.get("device_id"))
            if area_id not in rooms:
                area_id = "unassigned"
            room = rooms[area_id]

            entry = {
                "entity_id": eid,
                "name": short_name(name, room["name"]),
                "full_name": name,
                "domain": domain,
                "device_class": attrs.get("device_class"),
                "device": dev_name.get(reg.get("device_id"), ""),
                "area_id": area_id,
                "group": group,
                "state": st.get("state"),
                "unit": attrs.get("unit_of_measurement"),
            }
            if domain == "climate":
                entry["hvac_modes"] = attrs.get("hvac_modes") or []
                entry["fan_modes"] = attrs.get("fan_modes") or []
                entry["preset_modes"] = attrs.get("preset_modes") or []
            if domain == "light":
                entry["dimmable"] = any(m != "onoff" for m in (attrs.get("supported_color_modes") or ["brightness"]))
                entry["color_temp"] = "color_temp" in (attrs.get("supported_color_modes") or [])
            if domain == "cover":
                entry["position"] = "current_position" in attrs
            if domain == "alarm_control_panel":
                entry["supported_features"] = attrs.get("supported_features", 0)
            room[group].append(entry)
            house["all"].append(eid)
            if group == "batteries":
                house["batteries"].append(eid)

        for room in rooms.values():
            for g in GROUPS:
                room[g].sort(key=lambda e: e["name"].lower())
            room["controls"] = sum(len(room[g]) for g in CONTROL_GROUPS)
            room["total"] = room["controls"] + len(room["scenes"]) + sum(
                len(room[g]) for g in ("temperature", "humidity", "openings", "motion", "safety"))

        active = [r for r in rooms.values() if r["total"] > 0]
        floor_order = {f["id"]: i for i, f in enumerate(floors)}
        active.sort(key=lambda r: (r["id"] == "unassigned", floor_order.get(r["floor_id"], 999), r["name"].lower()))

        def count(group):
            return sum(len(r[group]) for r in active)

        return {
            "floors": [f for f in floors if any(r["floor_id"] == f["id"] for r in active)],
            "areas": active,
            "house": house,
            "errors": errors,
            "summary": {
                "areas_count": len(active),
                "lights_count": count("lights"),
                "climates_count": count("climates"),
                "covers_count": count("covers"),
                "cameras_count": count("cameras"),
                "access_count": count("access"),
                "media_count": count("media"),
                "sensors_count": sum(count(g) for g in ("temperature", "humidity", "air", "openings", "motion", "safety")),
                "entities_count": len(house["all"]),
            },
        }
