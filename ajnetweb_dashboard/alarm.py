#!/usr/bin/env python3
"""
AJ Netweb Dashboard - alarm pack (Studio "Alarm" tab).

Works with the alarm panel a villa already has in Home Assistant (Ajax, Hikvision AX, Paradox, ...) or, when
there is none, creates our own from the door, window and motion sensors:

* Own alarm: HA's built-in `manual` alarm panel (exit / entry delay, optional code), written as a YAML
  package (`packages/ajnetweb_alarm.yaml`), plus the automation "AJ Netweb - Alarm sensors" that triggers it
  when a sensor chosen for the armed mode opens.
* Either source: the automation "AJ Netweb - Alarm alerts" (sirens on, a critical push to the chosen phones,
  optionally every light on; sirens off when the alarm stops) and one script per arm mode
  (`script.ajnetweb_alarm_arm_<mode>`) labelled for the Alexa Matter Bridge. Disarming is never a script, so
  nobody can disarm the house by voice.
"""

import copy
import logging
import os
import re
from typing import Any, Dict, List, Optional

try:
    import yaml
except ImportError:  # pragma: no cover - installed in the image
    yaml = None

log = logging.getLogger("dashboard.alarm")

OWN_ENTITY = "alarm_control_panel.aj_netweb_alarm"
PACKAGE_FILE = os.path.join("packages", "ajnetweb_alarm.yaml")
SENSORS_AUTOMATION = "ajnetweb_alarm_sensors"
ALERTS_AUTOMATION = "ajnetweb_alarm_alerts"
SCRIPT_PREFIX = "ajnetweb_alarm_arm_"
ARM_MODES = ("away", "night", "home")
MODE_BITS = {"home": 1, "away": 2, "night": 4}          # AlarmControlPanelEntityFeature
SIREN_WORDS = re.compile(r"siren|صفار|سارين|انذار|إنذار", re.I)
MANAGED = "Managed by Dashboard Studio (Alarm tab) - changes here are overwritten."

DEFAULTS = {
    "enabled": False,
    "source": "auto",        # auto (existing panel if there is one, else our own) | own | panel
    "panel": "",             # the existing panel to use (source panel / auto)
    "code": "",              # own alarm: disarm code (4-8 digits), empty = no code
    "exit_delay": 60,        # own alarm: seconds to leave after arming Away
    "entry_delay": 30,       # own alarm: seconds to disarm after coming in
    "siren_minutes": 3,
    "sensors": {},           # {entity_id: ["away", "night", "home"]}; sensors not listed use the defaults
    "sirens": None,          # None = every siren found
    "notify": None,          # None = every phone with the Companion app
    "lights_on": False,      # every light on while the alarm sounds
    "alexa": True,           # arming scripts for Alexa
}


def merge_defaults(cfg: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    out = copy.deepcopy(DEFAULTS)
    if not isinstance(cfg, dict):
        return out
    for key in DEFAULTS:
        if key in cfg:
            out[key] = copy.deepcopy(cfg[key])
    return clean(out)


def clean(cfg: Dict[str, Any]) -> Dict[str, Any]:
    def num(key, lo, hi):
        try:
            return int(min(hi, max(lo, float(cfg.get(key, DEFAULTS[key])))))
        except (TypeError, ValueError):
            return DEFAULTS[key]

    code = str(cfg.get("code") or "").strip()
    sensors = {}
    for eid, modes in (cfg.get("sensors") or {}).items() if isinstance(cfg.get("sensors"), dict) else []:
        if isinstance(eid, str) and eid.startswith("binary_sensor.") and isinstance(modes, list):
            sensors[eid] = [m for m in ARM_MODES if m in modes]
    lists = {k: [e for e in cfg[k] if isinstance(e, str)] if isinstance(cfg.get(k), list) else None
             for k in ("sirens", "notify")}
    return {
        "enabled": bool(cfg.get("enabled")),
        "source": cfg.get("source") if cfg.get("source") in ("auto", "own", "panel") else "auto",
        "panel": cfg.get("panel") if str(cfg.get("panel") or "").startswith("alarm_control_panel.") else "",
        "code": code if re.fullmatch(r"\d{4,8}", code) else "",
        "exit_delay": num("exit_delay", 0, 300), "entry_delay": num("entry_delay", 0, 300),
        "siren_minutes": num("siren_minutes", 1, 30),
        "sensors": sensors, **lists,
        "lights_on": bool(cfg.get("lights_on")), "alexa": cfg.get("alexa", True) is not False,
    }


def _ents(model: Dict[str, Any], group: str) -> List[Dict[str, Any]]:
    return [e for r in model.get("areas") or [] for e in r.get(group, [])]


def default_modes(ent: Dict[str, Any]) -> List[str]:
    """Doors and windows guard every arm mode; motion only Away (people move around at night)."""
    return list(ARM_MODES) if ent.get("group") == "openings" else ["away"]


def sensors(cfg: Dict[str, Any], model: Dict[str, Any]) -> List[Dict[str, Any]]:
    out = []
    for e in _ents(model, "openings") + _ents(model, "motion"):
        if not e["entity_id"].startswith("binary_sensor."):
            continue
        modes = cfg["sensors"].get(e["entity_id"], default_modes(e))
        out.append({"entity_id": e["entity_id"], "name": e.get("full_name") or e.get("name") or e["entity_id"],
                    "kind": e.get("group"), "modes": modes})
    return out


def sirens_found(states: List[Dict[str, Any]]) -> List[str]:
    out = []
    for st in states:
        eid = st.get("entity_id", "")
        name = (st.get("attributes") or {}).get("friendly_name") or ""
        if eid.startswith("siren.") or (eid.startswith("switch.") and SIREN_WORDS.search(f"{eid} {name}")):
            out.append(eid)
    return sorted(out)


def phones_found(services: List[Dict[str, Any]]) -> List[str]:
    notify = next((d for d in services if d.get("domain") == "notify"), {})
    return sorted(f"notify.{s}" for s in (notify.get("services") or {}) if s.startswith("mobile_app_"))


def panels_found(model: Dict[str, Any]) -> List[str]:
    return [e["entity_id"] for e in _ents(model, "alarms")
            if e["entity_id"].startswith("alarm_control_panel.") and e["entity_id"] != OWN_ENTITY]


def choose_panel(cfg: Dict[str, Any], panels: List[str]) -> Dict[str, Any]:
    """{"own": bool, "panel": entity id or None}."""
    if cfg["source"] == "own" or (cfg["source"] == "auto" and not panels):
        return {"own": True, "panel": OWN_ENTITY}
    panel = cfg["panel"] if cfg["panel"] in panels else (panels[0] if panels else None)
    return {"own": False, "panel": panel}


def package(cfg: Dict[str, Any]) -> Dict[str, Any]:
    """HA's manual alarm panel. Exit delay on Away only; entry delay in every armed mode."""
    panel = {
        "platform": "manual", "name": "AJ Netweb Alarm", "unique_id": "ajnetweb_alarm",
        "code_arm_required": False, "arming_time": 0, "delay_time": cfg["entry_delay"],
        "trigger_time": cfg["siren_minutes"] * 60, "disarm_after_trigger": False,
        "armed_away": {"arming_time": cfg["exit_delay"]},
        "disarmed": {"trigger_time": 0},
    }
    if cfg["code"]:
        panel["code"] = cfg["code"]
    return {"alarm_control_panel": [panel]}


def sensors_automation(cfg: Dict[str, Any], model: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    rows = sensors(cfg, model)
    if not any(r["modes"] for r in rows):
        return None
    choose = []
    for mode in ARM_MODES:
        ids = [r["entity_id"] for r in rows if mode in r["modes"]]
        if ids:
            choose.append({"conditions": [
                {"condition": "state", "entity_id": OWN_ENTITY, "state": f"armed_{mode}"},
                {"condition": "template", "value_template": "{{ trigger.entity_id in " + repr(ids) + " }}"}],
                "sequence": [{"action": "alarm_control_panel.alarm_trigger", "target": {"entity_id": OWN_ENTITY}}]})
    return {
        "id": SENSORS_AUTOMATION, "alias": "AJ Netweb - Alarm sensors", "description": MANAGED, "mode": "queued",
        "triggers": [{"trigger": "state", "entity_id": sorted({r["entity_id"] for r in rows if r["modes"]}),
                      "to": "on"}],
        "conditions": [], "actions": [{"choose": choose}],
    }


def alerts_automation(cfg: Dict[str, Any], panel: str, sirens: List[str], phones: List[str],
                      lights: List[str]) -> Dict[str, Any]:
    def turn(on):
        steps = []
        for domain in ("siren", "switch"):
            ids = [s for s in sirens if s.startswith(f"{domain}.")]
            if ids:
                steps.append({"action": f"{domain}.turn_{'on' if on else 'off'}", "target": {"entity_id": ids},
                              "continue_on_error": True})
        return steps

    message = "{{ state_attr(trigger.entity_id, 'friendly_name') }} went off at {{ now().strftime('%H:%M') }}."
    alarm = turn(True) + [{
        "action": phone, "continue_on_error": True,
        "data": {"title": "🚨 Alarm", "message": message,
                 "data": {"push": {"sound": {"name": "default", "critical": 1, "volume": 1.0}},   # iPhone
                          "ttl": 0, "priority": "high", "channel": "alarm_stream"}},             # Android
    } for phone in phones]
    if cfg["lights_on"] and lights:
        alarm.append({"action": "homeassistant.turn_on", "target": {"entity_id": lights}, "continue_on_error": True})
    return {
        "id": ALERTS_AUTOMATION, "alias": "AJ Netweb - Alarm alerts", "description": MANAGED, "mode": "restart",
        "triggers": [{"trigger": "state", "entity_id": panel, "to": "triggered", "id": "on"},
                     {"trigger": "state", "entity_id": panel, "from": "triggered", "id": "off"}],
        "conditions": [],
        "actions": [{"choose": [
            {"conditions": [{"condition": "trigger", "id": "on"}], "sequence": alarm},
            {"conditions": [{"condition": "trigger", "id": "off"}], "sequence": turn(False) or [{"stop": "no sirens"}]},
        ]}],
    }


def arm_scripts(panel: str, modes: List[str]) -> Dict[str, Dict[str, Any]]:
    names = {"away": "Alarm away", "night": "Alarm night", "home": "Alarm home"}
    return {f"{SCRIPT_PREFIX}{m}": {
        "alias": names[m], "icon": "mdi:shield-lock", "mode": "single", "description": MANAGED,
        "sequence": [{"action": f"alarm_control_panel.alarm_arm_{m}", "target": {"entity_id": panel}}],
    } for m in modes}


def panel_modes(own: bool, state: Optional[Dict[str, Any]]) -> List[str]:
    """Arm modes Alexa may use: all for our own alarm; for a panel, those it supports without a code."""
    if own:
        return list(ARM_MODES)
    attrs = (state or {}).get("attributes") or {}
    if attrs.get("code_arm_required"):
        return []
    feats = int(attrs.get("supported_features") or 0)
    return [m for m in ARM_MODES if feats & MODE_BITS[m]]


def plan(cfg: Dict[str, Any], model: Dict[str, Any], states: List[Dict[str, Any]],
         services: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Everything Apply writes, as data."""
    found = {"panels": panels_found(model), "sirens": sirens_found(states), "phones": phones_found(services)}
    pick = choose_panel(cfg, found["panels"])
    sirens = [s for s in (cfg["sirens"] if cfg["sirens"] is not None else found["sirens"]) if s in found["sirens"]]
    phones = [p for p in (cfg["notify"] if cfg["notify"] is not None else found["phones"]) if p in found["phones"]]
    lights = [e["entity_id"] for e in _ents(model, "lights")]
    by_id = {s.get("entity_id"): s for s in states}
    out = {**pick, "found": found, "sirens": sirens, "phones": phones, "package": None, "automations": {},
           "scripts": {}}
    if not pick["panel"]:
        return out
    if pick["own"]:
        out["package"] = package(cfg)
        sens = sensors_automation(cfg, model)
        if sens:
            out["automations"][SENSORS_AUTOMATION] = sens
    out["automations"][ALERTS_AUTOMATION] = alerts_automation(cfg, pick["panel"], sirens, phones, lights)
    if cfg["alexa"]:
        out["scripts"] = arm_scripts(pick["panel"], panel_modes(pick["own"], by_id.get(pick["panel"])))
    return out


def packages_enabled(config_dir: str) -> bool:
    try:
        with open(os.path.join(config_dir, "configuration.yaml"), encoding="utf-8") as f:
            text = f.read()
    except OSError:
        return False
    return bool(re.search(r"^\s*packages\s*:\s*!include_dir_(merge_)?named\s+packages\s*$", text, re.M))


def apply(client, cfg: Dict[str, Any], model: Dict[str, Any], config_dir: str) -> Dict[str, Any]:
    states = client.rest_get("/core/api/states", []) or []
    services = client.rest_get("/core/api/services", []) or []
    p = plan(cfg, model, states, services)
    steps = []

    def add(step, ok, detail=""):
        steps.append({"step": step, "ok": ok, "detail": detail})

    if not p["panel"]:
        return {"ok": False, "error": "No alarm panel found. Choose \"Our own alarm\".", "steps": []}
    if p["own"]:
        if yaml is None:
            return {"ok": False, "error": "YAML support missing in this build", "steps": []}
        path = os.path.join(config_dir, PACKAGE_FILE)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            f.write(f"# AJ Netweb alarm. {MANAGED}\n")
            yaml.safe_dump(p["package"], f, sort_keys=False, allow_unicode=True)
        add("Alarm panel file", True, PACKAGE_FILE)
        if not packages_enabled(config_dir):
            add("Packages in configuration.yaml", False,
                "Add under homeassistant: →  packages: !include_dir_named packages  then restart Home Assistant")
        if not any(s.get("entity_id") == OWN_ENTITY for s in states):
            add("Restart Home Assistant", None, f"once, to create {OWN_ENTITY}")
    else:
        add("Alarm panel", True, p["panel"])
    for aid, conf in p["automations"].items():
        status, body = client.rest("POST", f"/core/api/config/automation/config/{aid}", conf)
        add(conf["alias"], status == 200, f"automation.{aid}" if status == 200 else f"HTTP {status} {body}")
    if not p["sirens"]:
        add("Sirens", None, "none found - phones only")
    if not p["phones"]:
        add("Phones", None, "no phone with the Home Assistant app found")
    errors = []
    for sid, conf in p["scripts"].items():
        status, body = client.rest("POST", f"/core/api/config/script/config/{sid}", conf)
        if status != 200:
            errors.append(f"{sid}: HTTP {status} {body}")
    for st in states:   # arm modes that are no longer offered
        sid = str(st.get("entity_id", "")).split(".", 1)[-1]
        if st.get("entity_id", "").startswith(f"script.{SCRIPT_PREFIX}") and sid not in p["scripts"]:
            client.rest("DELETE", f"/core/api/config/script/config/{sid}")
    if p["scripts"]:
        add("Arming for Alexa", not errors, "; ".join(errors) or ", ".join(f"script.{s}" for s in p["scripts"]))
        import house_modes   # same label the house mode scripts get
        steps.append(house_modes.label_for_alexa(client, [f"script.{s}" for s in p["scripts"]]))
    elif cfg["alexa"]:
        add("Arming for Alexa", None, "the panel needs a code to arm, so Alexa can't arm it")
    return {"ok": all(s["ok"] is not False for s in steps), "steps": steps, "panel": p["panel"], "own": p["own"]}
