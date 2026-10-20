#!/usr/bin/env python3
"""
AJ Netweb Dashboard - watering timer for the water card.

"Run 10 min" on the water card calls script.ajnetweb_water_run with the zone and the minutes. The script opens
the valve (or turns the switch on), waits, and closes it again, inside Home Assistant, so watering stops on time
even when nobody has the dashboard open. Deploy creates it when watering zones exist (same names the card's
waterEntities() in ajnetweb-ui/src/cards/water.js looks for).
"""

import logging
import re
from typing import Any, Dict, List

log = logging.getLogger("dashboard.water")

SCRIPT_ID = "ajnetweb_water_run"
MAX_MINUTES = 120

ZONE = re.compile(r"(^|[^a-z])(irrigat\w*|sprinkler\w*|drip|garden|lawn|zone|watering)|ري |الري|رشاش|تنقيط|حديقة", re.I)
NOT_ZONE = re.compile(r"(^|[^a-z])(main|shut_?off|leak|supply|gas)|رئيسي|غاز", re.I)


def zones(states: List[Dict[str, Any]]) -> List[str]:
    out = []
    for st in states:
        eid = st.get("entity_id", "") if isinstance(st, dict) else ""
        if eid.split(".")[0] not in ("valve", "switch"):
            continue
        attrs = st.get("attributes") or {}
        text = f"{eid} {attrs.get('friendly_name', '')}".replace(".", " ").replace("_", " ")
        if ZONE.search(text) and not NOT_ZONE.search(text) and attrs.get("device_class") != "gas":
            out.append(eid)
    return sorted(out)


def script_config() -> Dict[str, Any]:
    minutes = f"{{{{ [[minutes | int(10), 1] | max, {MAX_MINUTES}] | min }}}}"
    is_valve = "{{ zone.startswith('valve.') }}"
    return {
        "alias": "AJ Netweb - Water a zone",
        "description": "Used by the water card: opens a watering valve or switch, waits, and closes it again.",
        "icon": "mdi:sprinkler-variant",
        "mode": "parallel",
        "max": 20,
        "fields": {
            "zone": {"name": "Zone", "required": True, "selector": {"entity": {"domain": ["valve", "switch"]}}},
            "minutes": {"name": "Minutes", "default": 10,
                        "selector": {"number": {"min": 1, "max": MAX_MINUTES, "unit_of_measurement": "min"}}},
        },
        "sequence": [
            {"if": [{"condition": "template", "value_template": is_valve}],
             "then": [{"action": "valve.open_valve", "target": {"entity_id": "{{ zone }}"}}],
             "else": [{"action": "switch.turn_on", "target": {"entity_id": "{{ zone }}"}}]},
            {"delay": {"minutes": minutes}},
            {"if": [{"condition": "template", "value_template": is_valve}],
             "then": [{"action": "valve.close_valve", "target": {"entity_id": "{{ zone }}"}}],
             "else": [{"action": "switch.turn_off", "target": {"entity_id": "{{ zone }}"}}]},
        ],
    }


def ensure_script(client) -> Dict[str, Any]:
    """Deploy step: create or update the watering script when the house has watering zones."""
    found = zones(client.rest_get("/core/api/states", []) or [])
    if not found:
        return {}
    status, body = client.rest("POST", f"/core/api/config/script/config/{SCRIPT_ID}", script_config())
    if status != 200:
        log.warning("Watering script: HTTP %s %s", status, body)
        return {"step": "Watering timer", "ok": False, "detail": f"HTTP {status} {body}"}
    return {"step": "Watering timer", "ok": True, "detail": f"script.{SCRIPT_ID} for {len(found)} zones"}
