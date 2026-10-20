"""Dashboard Suite water card: which entities are watering zones, the timer script and the insights default."""
import pytest


@pytest.fixture
def water(load_addon_module):
    return load_addon_module("ajnetweb_dashboard", "water")


def st(eid, name="", **attrs):
    return {"entity_id": eid, "state": "off", "attributes": {"friendly_name": name, **attrs}}


STATES = [
    st("valve.front_lawn", "Front lawn"), st("switch.drip_line", "Drip line"), st("switch.relay_3", "ري الحديقة"),
    st("valve.main_water", "Main water shutoff", device_class="water"), st("valve.kitchen_gas", "Gas", device_class="gas"),
    st("switch.booster_pump", "Booster pump"), st("light.garden_lights", "Garden lights"), st("switch.tv", "TV"),
]


def test_zones(water):
    assert water.zones(STATES) == ["switch.drip_line", "switch.relay_3", "valve.front_lawn"]


def test_script_config(water):
    conf = water.script_config()
    assert conf["mode"] == "parallel"
    seq = conf["sequence"]
    assert seq[0]["then"][0]["action"] == "valve.open_valve" and seq[0]["else"][0]["action"] == "switch.turn_on"
    assert "120" in seq[1]["delay"]["minutes"]
    assert seq[2]["then"][0]["action"] == "valve.close_valve"


class Fake:
    def __init__(self, states, status=200):
        self.states, self.status, self.posted = states, status, None

    def rest_get(self, path, default=None):
        return self.states

    def rest(self, method, path, body=None):
        self.posted = path
        return self.status, "x"


def test_ensure_script(water):
    c = Fake(STATES)
    assert water.ensure_script(c)["ok"] and c.posted.endswith("/ajnetweb_water_run")
    c = Fake([st("switch.tv", "TV")])
    assert water.ensure_script(c) == {} and c.posted is None
    assert water.ensure_script(Fake(STATES, 500))["ok"] is False
