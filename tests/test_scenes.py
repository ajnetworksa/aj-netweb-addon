"""Dashboard Suite "Save as scene": what is stored per domain, and the save flow against a fake HA."""
import pytest


@pytest.fixture
def sc(load_addon_module):
    m = load_addon_module("ajnetweb_dashboard", "scenes")
    m.time.sleep = lambda s: None
    return m


def st(eid, state, **attrs):
    return {"entity_id": eid, "state": state, "attributes": attrs}


STATES = [
    st("light.ceiling", "on", brightness=153, color_mode="color_temp", color_temp_kelvin=3000, friendly_name="Ceiling"),
    st("light.strip", "on", brightness=255, color_mode="hs", hs_color=[30, 80]),
    st("light.lamp", "off", color_mode=None),
    st("cover.curtain", "open", current_position=40, friendly_name="Curtain"),
    st("climate.ac", "cool", temperature=23, fan_mode="auto", current_temperature=27),
    st("media_player.tv", "off", volume_level=0.3),
    st("light.broken", "unavailable"),
]
MODEL = {"areas": [{"id": "majlis", "lights": [{"entity_id": "light.ceiling", "name": "Ceiling"}, {"entity_id": "light.strip"},
                                               {"entity_id": "light.lamp"}, {"entity_id": "light.broken"}],
                    "covers": [{"entity_id": "cover.curtain"}], "climates": [{"entity_id": "climate.ac"}],
                    "media": [{"entity_id": "media_player.tv"}], "access": [{"entity_id": "cover.gate"}]}]}


def test_entity_state(sc):
    s = {x["entity_id"]: sc.entity_state(x) for x in STATES}
    assert s["light.ceiling"] == {"state": "on", "brightness": 153, "color_temp_kelvin": 3000}
    assert s["light.strip"] == {"state": "on", "brightness": 255, "hs_color": [30, 80]}
    assert s["light.lamp"] == {"state": "off"}
    assert s["cover.curtain"] == {"state": "open", "current_position": 40}
    assert s["climate.ac"] == {"state": "cool", "temperature": 23, "fan_mode": "auto"}
    assert s["media_player.tv"] == {"state": "off"}
    assert s["light.broken"] is None


def test_summary_and_id(sc):
    assert sc.summary(STATES[0]) == "on 60%"
    assert sc.summary(STATES[3]) == "open 40%"
    assert sc.summary(STATES[4]) == "cool 23°"
    assert sc.scene_id("majlis", "Evening Guests!") == "ajnetweb_majlis_evening_guests"


def test_room_entities_skip_gates(sc):
    ids = [e["entity_id"] for e in sc.room_entities(MODEL, "majlis")]
    assert "cover.gate" not in ids and "climate.ac" in ids
    assert sc.room_entities(MODEL, "nope") == []


class Fake:
    def __init__(self, status=200):
        self.posted, self.status, self.updated = None, status, []

    def rest_get(self, path, default=None):
        return STATES

    def rest(self, method, path, body=None):
        self.posted = (method, path, body)
        return self.status, {"result": "ok"}

    def session(self):
        return self

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def try_call(self, cmd, default=None, **kw):
        return [{"entity_id": "scene.evening", "platform": "homeassistant", "unique_id": "ajnetweb_majlis_evening", "area_id": None}]

    def call(self, cmd, **kw):
        self.updated.append((cmd, kw))


def test_save(sc):
    c = Fake()
    res = sc.save(c, MODEL, "majlis", "Evening", ["light.ceiling", "cover.curtain", "light.broken", "cover.gate", "light.other"])
    assert res["ok"] and res["entity_id"] == "scene.evening" and res["count"] == 2 and res["skipped"] == ["light.broken"]
    method, path, body = c.posted
    assert path == "/core/api/config/scene/config/ajnetweb_majlis_evening"
    assert body["id"] == "ajnetweb_majlis_evening" and set(body["entities"]) == {"light.ceiling", "cover.curtain"}
    assert c.updated == [("config/entity_registry/update", {"entity_id": "scene.evening", "area_id": "majlis"})]


def test_save_errors(sc):
    assert sc.save(Fake(), MODEL, "majlis", "X", ["cover.gate"])["ok"] is False
    assert sc.save(Fake(), MODEL, "majlis", "X", ["light.broken"])["ok"] is False
    res = sc.save(Fake(status=400), MODEL, "majlis", "X", ["light.ceiling"])
    assert res["ok"] is False and "scenes.yaml" in res["error"]
