"""Voice commands section of the bridge page: grouping, sentences, renames and the old blacklist default."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "alexa_matter_bridge/rootfs/usr/share/alexa-bridge-ui"))
import voice  # noqa: E402


def st(eid, name):
    return {"entity_id": eid, "state": "off", "attributes": {"friendly_name": name}}


STATES = {s["entity_id"]: s for s in [
    st("script.ajnetweb_mode_away", "Away mode"), st("scene.ajnetweb_majlis_evening", "Evening"),
    st("climate.majlis_ac", "Majlis AC"), st("input_boolean.aj_netweb_adhan", "AJ Netweb Adhan"),
    st("input_button.aj_netweb_adhan_play_now", "AJ Netweb Adhan play now"), st("light.ceiling", "Ceiling"),
    st("script.other", "Other script"), st("input_boolean.aj_netweb_precool", "Pre-cool"),
]}
REG = [{"entity_id": e, "labels": ["alexa"] if e == "climate.majlis_ac" else []} for e in STATES]
REG[-1]["name"] = "Pre-cool"   # renamed by the installer: keep it


def test_blacklist():
    old = [d + "." for d in voice.OLD_DEFAULT_BLACKLIST]
    eff = voice.effective_blacklist(old)
    assert "script" not in eff and "scene" not in eff and "automation" in eff
    assert voice.effective_blacklist(["automation.", "script."]) == ["automation", "script"]


def test_voice_items():
    groups = {g["key"]: g for g in voice.voice_items(STATES, REG, "alexa", ["automation"])}
    assert list(groups) == ["modes", "scenes", "ac", "adhan"]
    assert groups["modes"]["items"][0]["say"] == "Alexa, turn on Away mode"
    ac = {i["entity_id"]: i for i in groups["ac"]["items"]}
    assert ac["climate.majlis_ac"]["exposed"] and ac["climate.majlis_ac"]["say"].endswith("to 22 degrees")
    assert ac["input_boolean.aj_netweb_precool"]["rename_to"] is None and ac["input_boolean.aj_netweb_precool"]["name"] == "Pre-cool"
    adhan = {i["entity_id"]: i for i in groups["adhan"]["items"]}
    assert adhan["input_boolean.aj_netweb_adhan"]["rename_to"] == "Adhan"
    assert "light.ceiling" not in str(groups) and "script.other" not in str(groups)


def test_blocked_flag():
    groups = voice.voice_items(STATES, REG, "alexa", ["script"])
    assert all(i["blocked"] for g in groups if g["key"] == "modes" for i in g["items"])


def test_rename_for():
    assert voice.rename_for("input_button.aj_netweb_adhan_stop", {"name": None}) == "Stop adhan"
    assert voice.rename_for("input_button.aj_netweb_adhan_stop", {"name": "Stop"}) is None
    assert voice.rename_for("light.ceiling", {}) is None
