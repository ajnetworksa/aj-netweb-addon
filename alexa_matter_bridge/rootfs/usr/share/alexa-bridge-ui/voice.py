"""
Voice commands: the AJ Netweb items worth saying to Alexa, grouped, with the sentence to say.

Matter has no alarm panel, mode list or "play adhan" device type, so these reach Alexa as on/off switches
(scripts, scenes, input_boolean, input_button) and thermostats (ACs). The helpers made by the add-ons have
long technical names; when one is exposed from here and nobody renamed it in HA yet, it gets a short name
Alexa can hear ("Adhan", "Mute next adhan").
"""

import re

# Domains this section needs. An old default "excluded" list blocked them although only labelled entities
# are exposed anyway.
VOICE_DOMAINS = ("script", "scene", "input_boolean", "input_button")
OLD_DEFAULT_BLACKLIST = ["automation", "scene", "script", "group", "device_tracker", "person", "zone", "timer",
                         "input_boolean", "input_number", "input_select", "input_text", "input_datetime", "counter"]

# Fixed helpers of the AJ Netweb add-ons: entity_id -> (group, short name, sentence)
HELPERS = {
    "input_boolean.aj_netweb_adhan": ("adhan", "Adhan", "Alexa, turn off Adhan"),
    "input_boolean.aj_netweb_adhan_mute_next": ("adhan", "Mute next adhan", "Alexa, turn on Mute next adhan"),
    "input_button.aj_netweb_adhan_play_now": ("adhan", "Play adhan", "Alexa, turn on Play adhan"),
    "input_button.aj_netweb_adhan_stop": ("adhan", "Stop adhan", "Alexa, turn on Stop adhan"),
    "input_boolean.aj_netweb_precool": ("ac", "AC pre-cooling", "Alexa, turn off AC pre-cooling"),
}

GROUPS = [
    ("modes", "House modes", "One switch per mode. Turning it on switches the house to that mode."),
    ("scenes", "Scenes", "Every scene, including those saved from the Dashboard Studio."),
    ("ac", "Air conditioning", "ACs become thermostats: on, off, cool, and the temperature."),
    ("adhan", "Prayer & Adhan", "From the Prayer & Adhan add-on."),
    ("alarm", "Alarm", "Arming only. Disarming by voice is never offered."),
]

MODE_SCRIPT = re.compile(r"^script\.ajnetweb_mode_[a-z0-9_]+$")
ALARM_SCRIPT = re.compile(r"^script\.ajnetweb_alarm_arm_[a-z0-9_]+$")


def effective_blacklist(configured):
    """Domains to block. The untouched old default no longer blocks the voice domains."""
    domains = [str(p).rstrip(".") for p in (configured or [])]
    if sorted(domains) == sorted(OLD_DEFAULT_BLACKLIST):
        return [d for d in domains if d not in VOICE_DOMAINS]
    return domains


def item(entity_id, state):
    """(group, short name or None, sentence) for one entity, or None when it isn't a voice item."""
    name = ((state or {}).get("attributes") or {}).get("friendly_name") or entity_id
    if entity_id in HELPERS:
        group, short, say = HELPERS[entity_id]
        return group, short, say
    if MODE_SCRIPT.match(entity_id):
        return "modes", None, f"Alexa, turn on {name}"
    if ALARM_SCRIPT.match(entity_id):
        return "alarm", None, f"Alexa, turn on {name}"
    domain = entity_id.split(".", 1)[0]
    if domain == "scene":
        return "scenes", None, f"Alexa, turn on {name}"
    if domain == "climate":
        return "ac", None, f"Alexa, set {name} to 22 degrees"
    return None


def voice_items(states, registry, label_id, blacklist):
    """The voice section: [{key, title, desc, items: [...]}] for groups that have something."""
    reg = {r["entity_id"]: r for r in registry}
    out = {k: [] for k, _, _ in GROUPS}
    for eid, st in states.items():
        it = item(eid, st)
        r = reg.get(eid)
        if not it or not r or r.get("disabled_by"):
            continue
        group, short, say = it
        current = (st.get("attributes") or {}).get("friendly_name") or eid
        out[group].append({
            "entity_id": eid,
            "name": short if short and not r.get("name") else current,
            "say": say,
            "exposed": label_id in (r.get("labels") or []),
            "rename_to": short if short and not r.get("name") and short != current else None,
            "blocked": eid.split(".", 1)[0] in blacklist,
        })
    return [{"key": k, "title": t, "desc": d, "items": sorted(out[k], key=lambda i: i["name"].lower())}
            for k, t, d in GROUPS if out[k]]


def rename_for(entity_id, reg_entry):
    """Short name to give a helper when it is exposed, or None (already renamed, or not one of ours)."""
    if entity_id in HELPERS and reg_entry and not reg_entry.get("name"):
        return HELPERS[entity_id][1]
    return None
