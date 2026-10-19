#!/usr/bin/env python3
"""
AJ Netweb Dashboard - House modes (Home / Away / Night / Guests).

The Studio keeps what each mode does in /data/project.json ("house_modes"). "Apply" turns that into
normal Home Assistant objects, so modes keep working without this add-on and can be used from any
automation:

  input_select.ajnetweb_house_mode     the current mode (one option per enabled mode)
  script.ajnetweb_mode_<mode>          "Away mode" etc. - one tap / voice command per mode. Alexa sees
                                       scripts as on/off switches ("Alexa, turn on Away mode").
  automation.ajnetweb_house_modes      runs the chosen actions whenever the mode changes, whoever changed it

Only public APIs: the input_select collection over WebSocket, the script/automation config REST API
that HA's own editors use, and the label / entity registries.
"""

import copy
import logging
import re
import time
from typing import Any, Dict, List, Optional

log = logging.getLogger("dashboard.modes")

HELPER_ID = "ajnetweb_house_mode"
HELPER_ENTITY = f"input_select.{HELPER_ID}"
SCRIPT_PREFIX = "ajnetweb_mode_"
AUTOMATION_ID = "ajnetweb_house_modes"

# key -> (English name, icon)
MODES = {
    "home": ("Home", "mdi:home"),
    "away": ("Away", "mdi:home-export-outline"),
    "night": ("Night", "mdi:weather-night"),
    "guests": ("Guests", "mdi:account-group"),
}

CHOICES = {
    "lights": ("keep", "off"),
    "climate": ("keep", "off"),
    "covers": ("keep", "close", "open"),
    "media": ("keep", "pause"),
    "alarm": ("keep", "disarm", "arm_home", "arm_away", "arm_night"),
}

DEFAULT_MODES = {
    "home": {"on": True, "lights": "keep", "climate": "keep", "covers": "keep", "media": "keep", "alarm": "keep"},
    "away": {"on": True, "lights": "off", "climate": "off", "covers": "close", "media": "pause", "alarm": "arm_away"},
    "night": {"on": True, "lights": "off", "climate": "keep", "covers": "close", "media": "pause", "alarm": "arm_night"},
    "guests": {"on": False, "lights": "keep", "climate": "keep", "covers": "keep", "media": "keep", "alarm": "keep"},
}

DEFAULTS = {
    "enabled": False,
    "alexa": True,          # label the mode scripts for the Alexa Matter Bridge
    "keep_on": [],          # lights no mode ever turns off (night lights, aquarium)
    "modes": DEFAULT_MODES,
}

ENTITY_RE = re.compile(r"^[a-z_]+\.[a-z0-9_]+$")


def clean(cfg: Any) -> Dict[str, Any]:
    """The project's house_modes section with every value checked; unknown keys are dropped."""
    cfg = cfg if isinstance(cfg, dict) else {}
    modes_in = cfg.get("modes") if isinstance(cfg.get("modes"), dict) else {}
    modes = {}
    for key, default in DEFAULT_MODES.items():
        src = modes_in.get(key) if isinstance(modes_in.get(key), dict) else {}
        m = {"on": bool(src.get("on", default["on"]))}
        for field, allowed in CHOICES.items():
            v = src.get(field, default[field])
            m[field] = v if v in allowed else default[field]
        name = str(src.get("name") or "").strip()[:40]
        if name:
            m["name"] = name
        scene = str(src.get("scene") or "").strip()
        if scene and ENTITY_RE.match(scene) and scene.split(".")[0] in ("scene", "script"):
            m["scene"] = scene
        modes[key] = m
    if not any(m["on"] for m in modes.values()):
        modes["home"]["on"] = True
    keep = [e for e in (cfg.get("keep_on") or []) if isinstance(e, str) and ENTITY_RE.match(e)]
    return {"enabled": bool(cfg.get("enabled", False)), "alexa": bool(cfg.get("alexa", True)),
            "keep_on": list(dict.fromkeys(keep)), "modes": modes}


def enabled_modes(cfg: Dict[str, Any]) -> List[str]:
    return [k for k in MODES if cfg["modes"][k]["on"]]


def mode_name(cfg: Dict[str, Any], key: str) -> str:
    return cfg["modes"][key].get("name") or MODES[key][0]


def confirm_modes(cfg: Dict[str, Any]) -> List[str]:
    """Modes that switch things off or touch the alarm ask "tap again" on the dashboard."""
    out = []
    for key in enabled_modes(cfg):
        m = cfg["modes"][key]
        if m["alarm"] != "keep" or "off" in (m["lights"], m["climate"]):
            out.append(key)
    return out


def _targets(model: Dict[str, Any], keep_on: List[str]) -> Dict[str, List[str]]:
    """Entity lists from discovery (the same rooms and exclusions the dashboard uses)."""
    rooms = model.get("areas") or []

    def ids(group, domains=None):
        return [e["entity_id"] for r in rooms for e in r.get(group, [])
                if domains is None or e.get("domain") in domains]

    keep = set(keep_on)
    return {
        "lights": [e for e in ids("lights", ("light", "switch")) if e not in keep],
        "climate": ids("climates", ("climate",)),
        "covers": ids("covers", ("cover",)),          # shades only - gates and garage doors are "access"
        "media": ids("media", ("media_player",)),
        "alarm": ids("alarms", ("alarm_control_panel",))[:1],
    }


def _step(action: str, entities: List[str], data: Dict[str, Any] = None) -> Dict[str, Any]:
    step = {"action": action, "target": {"entity_id": entities}, "continue_on_error": True}
    if data:
        step["data"] = data
    return step


def mode_actions(m: Dict[str, Any], targets: Dict[str, List[str]]) -> List[Dict[str, Any]]:
    seq = []
    if m["lights"] == "off" and targets["lights"]:
        seq.append(_step("homeassistant.turn_off", targets["lights"]))
    if m["climate"] == "off" and targets["climate"]:
        seq.append(_step("climate.turn_off", targets["climate"]))
    if m["covers"] in ("close", "open") and targets["covers"]:
        seq.append(_step(f"cover.{m['covers']}_cover", targets["covers"]))
    if m["media"] == "pause" and targets["media"]:
        seq.append(_step("media_player.media_pause", targets["media"]))
    if m["alarm"] != "keep" and targets["alarm"]:
        seq.append(_step(f"alarm_control_panel.alarm_{m['alarm']}", targets["alarm"]))
    if m.get("scene"):
        seq.append(_step(f"{m['scene'].split('.')[0]}.turn_on", [m["scene"]]))
    return seq


def plan(cfg: Dict[str, Any], model: Dict[str, Any]) -> Dict[str, Any]:
    """Everything Apply writes to Home Assistant, as plain data (no I/O - easy to check)."""
    keys = enabled_modes(cfg)
    targets = _targets(model, cfg["keep_on"])
    scripts = {
        f"{SCRIPT_PREFIX}{k}": {
            "alias": f"{mode_name(cfg, k)} mode", "icon": MODES[k][1], "mode": "single",
            "description": "AJ Netweb house mode. Managed by Dashboard Studio - changes here are overwritten.",
            "sequence": [{"action": "input_select.select_option", "target": {"entity_id": HELPER_ENTITY},
                          "data": {"option": k}}],
        } for k in keys
    }
    automation = {
        "id": AUTOMATION_ID,
        "alias": "AJ Netweb - House modes",
        "description": "Runs the actions of each house mode when the mode changes (dashboard, Alexa, automations). "
                       "Managed by Dashboard Studio → House modes - changes here are overwritten.",
        "mode": "restart",
        "triggers": [{"trigger": "state", "entity_id": HELPER_ENTITY, "to": k, "id": k} for k in keys],
        # not when HA starts and restores the last mode - only a real change re-arms or switches off
        "conditions": [{"condition": "template", "value_template":
                        "{{ trigger.from_state is not none and trigger.from_state.state not in ['unavailable', 'unknown'] }}"}],
        "actions": [{"choose": [{"conditions": [{"condition": "trigger", "id": k}],
                                 "sequence": mode_actions(cfg["modes"][k], targets)}
                                for k in keys if mode_actions(cfg["modes"][k], targets)]}],
    }
    if not automation["actions"][0]["choose"]:
        automation["actions"] = []
    return {"helper": {"name": "House mode", "options": keys, "icon": "mdi:home-switch"},
            "scripts": scripts, "automation": automation, "targets": targets}


def strategy_option(cfg: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """What the dashboard needs: which helper, custom names, and which modes ask to confirm."""
    if not cfg["enabled"]:
        return None
    out = {"entity": HELPER_ENTITY}
    names = {k: cfg["modes"][k]["name"] for k in enabled_modes(cfg) if cfg["modes"][k].get("name")}
    if names:
        out["names"] = names
    confirm = confirm_modes(cfg)
    if confirm:
        out["confirm"] = confirm
    return out


# ---------------------------------------------------------------------- apply to Home Assistant
def apply(client, cfg: Dict[str, Any], model: Dict[str, Any]) -> Dict[str, Any]:
    """Create / update the helper, scripts and automation. Returns {"ok", "steps"}."""
    if not cfg["enabled"]:
        return {"ok": True, "steps": [{"step": "House modes", "ok": None, "detail": "off"}]}
    p = plan(cfg, model)
    steps = []

    def add(step, ok, detail=""):
        steps.append({"step": step, "ok": ok, "detail": detail})

    try:
        with client.session() as s:
            helpers = s.call("input_select/list") or []
            mine = next((h for h in helpers if h.get("id") == HELPER_ID), None)
            if not mine:
                # the id comes from the name, so create with the id as name, then give it its real name
                s.call("input_select/create", name=HELPER_ID, options=p["helper"]["options"], icon=p["helper"]["icon"])
            s.call("input_select/update", input_select_id=HELPER_ID, **p["helper"])
            add("House mode helper", True, f"{HELPER_ENTITY}: {', '.join(p['helper']['options'])}")
    except Exception as e:  # noqa: BLE001 - websocket raises plain exceptions too
        log.error("House mode helper: %s", e)
        add("House mode helper", False, str(e))
        return {"ok": False, "steps": steps, "error": str(e)}

    errors = []
    for sid, conf in p["scripts"].items():
        status, body = client.rest("POST", f"/core/api/config/script/config/{sid}", conf)
        if status != 200:
            errors.append(f"{sid}: HTTP {status} {body}")
    # scripts of modes that were switched off
    existing = [e for e in (client.rest_get("/core/api/states", []) or [])
                if isinstance(e, dict) and str(e.get("entity_id", "")).startswith(f"script.{SCRIPT_PREFIX}")]
    for st in existing:
        sid = st["entity_id"].split(".", 1)[1]
        if sid not in p["scripts"] and sid[len(SCRIPT_PREFIX):] in MODES:
            client.rest("DELETE", f"/core/api/config/script/config/{sid}")
    add("Mode scripts", not errors, "; ".join(errors) or ", ".join(f"script.{sid}" for sid in p["scripts"]))
    if errors and len(errors) == len(p["scripts"]):
        add("Mode scripts", False, "Is `script: !include scripts.yaml` in configuration.yaml?")

    status, body = client.rest("POST", f"/core/api/config/automation/config/{AUTOMATION_ID}", p["automation"])
    add("Mode automation", status == 200, f"automation.{AUTOMATION_ID}" if status == 200 else f"HTTP {status} {body}")

    if cfg["alexa"] and p["scripts"]:
        steps.append(label_for_alexa(client, [f"script.{sid}" for sid in p["scripts"]]))
    return {"ok": all(st["ok"] is not False for st in steps), "steps": steps}


def alexa_label(client) -> Dict[str, Any]:
    """The label the Alexa Matter Bridge add-on exposes (its auto_expose_label option), if installed."""
    panel = client.find_addon_panel("alexa_matter_bridge")
    if not panel:
        return {"installed": False, "label": "alexa"}
    info = client.rest_get(f"/addons{panel}/info", {}) or {}
    label = str(((info.get("options") or {}).get("auto_expose_label")) or "alexa").strip() or "alexa"
    return {"installed": True, "label": label, "slug": panel.lstrip("/")}


def label_for_alexa(client, entity_ids: List[str]) -> Dict[str, Any]:
    bridge = alexa_label(client)
    name = bridge["label"]
    try:
        with client.session() as s:
            labels = s.call("config/label_registry/list") or []
            lab = next((l for l in labels if (l.get("name") or "").lower() == name.lower()), None)
            if not lab:
                lab = s.call("config/label_registry/create", name=name, icon="mdi:amazon-alexa")
            done = []
            for eid in entity_ids:
                entry = None
                for _ in range(3):   # a just-created script reaches the entity registry a moment later
                    entry = s.try_call("config/entity_registry/get", None, entity_id=eid)
                    if entry:
                        break
                    time.sleep(1)
                if not entry:
                    continue
                current = list(entry.get("labels") or [])
                if lab["label_id"] not in current:
                    s.call("config/entity_registry/update", entity_id=eid, labels=current + [lab["label_id"]])
                done.append(eid)
    except Exception as e:  # noqa: BLE001
        log.warning("Alexa label: %s", e)
        return {"step": "Alexa", "ok": False, "detail": str(e)}
    where = "Alexa Matter Bridge" if bridge["installed"] else "Alexa Matter Bridge (not installed yet)"
    return {"step": "Alexa", "ok": len(done) == len(entity_ids),
            "detail": f"label '{name}' on {len(done)}/{len(entity_ids)} mode scripts - {where}. "
                      "Say \"Alexa, turn on Away mode\" after Alexa finds the new devices."}


def merge_defaults(project_cfg: Any) -> Dict[str, Any]:
    """Saved section on top of the defaults (older projects have none)."""
    out = copy.deepcopy(DEFAULTS)
    if isinstance(project_cfg, dict):
        for k, v in project_cfg.items():
            if k == "modes" and isinstance(v, dict):
                for mk, mv in v.items():
                    if mk in out["modes"] and isinstance(mv, dict):
                        out["modes"][mk].update(mv)
            else:
                out[k] = v
    return clean(out)
