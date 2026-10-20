"""Dashboard Suite alarm pack: panel choice, own alarm package, sensor and alert automations, Alexa arming."""
import pytest


@pytest.fixture
def al(load_addon_module):
    return load_addon_module("ajnetweb_dashboard", "alarm")


def ent(eid, group, name=None):
    return {"entity_id": eid, "group": group, "name": name or eid, "full_name": name or eid}


MODEL = {"areas": [{"id": "hall",
                    "openings": [ent("binary_sensor.front_door", "openings", "Front door")],
                    "motion": [ent("binary_sensor.hall_motion", "motion", "Hall motion")],
                    "lights": [ent("light.hall", "lights")], "alarms": []}]}
STATES = [{"entity_id": "siren.roof", "attributes": {}}, {"entity_id": "switch.outdoor_siren", "attributes": {}},
          {"entity_id": "switch.tv", "attributes": {"friendly_name": "TV"}}]
SERVICES = [{"domain": "notify", "services": {"mobile_app_mukto_iphone": {}, "persistent_notification": {}}}]


def test_clean(al):
    c = al.merge_defaults({"code": "12a", "exit_delay": 9999, "source": "x", "panel": "light.x",
                           "sensors": {"binary_sensor.a": ["away", "bogus"], "light.b": ["away"]}})
    assert c["code"] == "" and c["exit_delay"] == 300 and c["source"] == "auto" and c["panel"] == ""
    assert c["sensors"] == {"binary_sensor.a": ["away"]}
    assert al.merge_defaults({"code": "1234"})["code"] == "1234"


def test_own_when_no_panel(al):
    cfg = al.merge_defaults({"enabled": True, "code": "4321"})
    p = al.plan(cfg, MODEL, STATES, SERVICES)
    assert p["own"] and p["panel"] == al.OWN_ENTITY
    pkg = p["package"]["alarm_control_panel"][0]
    assert pkg["platform"] == "manual" and pkg["code"] == "4321" and pkg["armed_away"]["arming_time"] == 60
    sens = p["automations"][al.SENSORS_AUTOMATION]
    assert sens["triggers"][0]["entity_id"] == ["binary_sensor.front_door", "binary_sensor.hall_motion"]
    choose = sens["actions"][0]["choose"]
    assert len(choose) == 3 and "hall_motion" in choose[0]["conditions"][1]["value_template"]
    assert "hall_motion" not in choose[1]["conditions"][1]["value_template"]   # night: doors only
    assert p["sirens"] == ["siren.roof", "switch.outdoor_siren"] and p["phones"] == ["notify.mobile_app_mukto_iphone"]
    alerts = p["automations"][al.ALERTS_AUTOMATION]["actions"][0]["choose"]
    on = [s["action"] for s in alerts[0]["sequence"]]
    assert on == ["siren.turn_on", "switch.turn_on", "notify.mobile_app_mukto_iphone"]
    assert sorted(p["scripts"]) == ["ajnetweb_alarm_arm_away", "ajnetweb_alarm_arm_home", "ajnetweb_alarm_arm_night"]
    assert not any("disarm" in str(s) for s in p["scripts"].values())


def test_existing_panel(al):
    model = {"areas": [dict(MODEL["areas"][0], alarms=[ent("alarm_control_panel.ajax", "alarms")])]}
    states = STATES + [{"entity_id": "alarm_control_panel.ajax", "attributes": {"supported_features": 3}}]
    p = al.plan(al.merge_defaults({"enabled": True, "sirens": [], "notify": []}), model, states, SERVICES)
    assert not p["own"] and p["panel"] == "alarm_control_panel.ajax" and p["package"] is None
    assert al.SENSORS_AUTOMATION not in p["automations"]
    assert sorted(p["scripts"]) == ["ajnetweb_alarm_arm_away", "ajnetweb_alarm_arm_home"]   # no night bit
    assert p["sirens"] == [] and p["phones"] == []
    states[-1]["attributes"]["code_arm_required"] = True
    assert al.plan(al.merge_defaults({"enabled": True}), model, states, SERVICES)["scripts"] == {}
    own = al.plan(al.merge_defaults({"enabled": True, "source": "own"}), model, states, SERVICES)
    assert own["own"]


def test_sensor_modes_override(al):
    cfg = al.merge_defaults({"sensors": {"binary_sensor.hall_motion": []}})
    rows = {r["entity_id"]: r["modes"] for r in al.sensors(cfg, MODEL)}
    assert rows == {"binary_sensor.front_door": ["away", "night", "home"], "binary_sensor.hall_motion": []}
    sens = al.sensors_automation(cfg, MODEL)
    assert sens["triggers"][0]["entity_id"] == ["binary_sensor.front_door"]


class Fake:
    def __init__(self):
        self.posts = []

    def rest_get(self, path, default=None):
        return SERVICES if path.endswith("/services") else STATES

    def rest(self, method, path, body=None):
        self.posts.append((method, path))
        return 200, {"result": "ok"}

    def find_addon_panel(self, slug):
        return None

    def session(self):
        return self

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def call(self, cmd, **kw):
        return [] if cmd.endswith("/list") else {"label_id": "alexa"}

    def try_call(self, cmd, default=None, **kw):
        return {"entity_id": kw.get("entity_id"), "labels": []}


def test_apply_own(al, tmp_path, load_addon_module):
    load_addon_module("ajnetweb_dashboard", "house_modes")
    (tmp_path / "configuration.yaml").write_text("homeassistant:\n  packages: !include_dir_named packages\n")
    c = Fake()
    res = al.apply(c, al.merge_defaults({"enabled": True}), MODEL, str(tmp_path))
    text = (tmp_path / "packages" / "ajnetweb_alarm.yaml").read_text()
    assert "platform: manual" in text and "AJ Netweb Alarm" in text
    assert res["own"] and any(s["step"] == "Restart Home Assistant" for s in res["steps"])
    paths = [p for _, p in c.posts]
    assert "/core/api/config/automation/config/ajnetweb_alarm_sensors" in paths
    assert "/core/api/config/script/config/ajnetweb_alarm_arm_away" in paths
    assert al.packages_enabled(str(tmp_path)) and not al.packages_enabled(str(tmp_path / "nope"))
