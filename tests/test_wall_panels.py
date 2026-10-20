"""Dashboard Suite wall panels: QR addresses, Fully Kiosk tablet discovery and the profile service calls."""
import pytest


@pytest.fixture
def wp(load_addon_module):
    return load_addon_module("ajnetweb_dashboard", "wall_panels")


ENTRIES = [{"entry_id": "fk1", "domain": "fully_kiosk"}, {"entry_id": "z", "domain": "zha"}]
DEVICES = [{"id": "dev1", "name": "Lenovo M10", "name_by_user": "Majlis tablet", "model": "TB-X606F", "config_entries": ["fk1"]},
           {"id": "dev2", "name": "Bulb", "config_entries": ["z"]}]
ENTITIES = [{"entity_id": "switch.majlis_tablet_motion_detection", "device_id": "dev1"},
            {"entity_id": "number.majlis_tablet_screensaver_timer", "device_id": "dev1"},
            {"entity_id": "number.majlis_tablet_screensaver_brightness", "device_id": "dev1"},
            {"entity_id": "number.majlis_tablet_screen_off_timer", "device_id": "dev1", "disabled_by": "integration"},
            {"entity_id": "light.bulb", "device_id": "dev2"}]


def test_urls(wp):
    assert wp.panel_urls("http://192.168.1.10:8123/", "villa-home") == {
        "browser": "http://192.168.1.10:8123/villa-home/tablet", "app": "homeassistant://navigate/villa-home/tablet"}
    assert wp.panel_urls("javascript:alert(1)", "villa-home")["browser"] == ""


def test_qr_svg(wp):
    svg = wp.qr_svg("http://192.168.1.10:8123/villa-home/tablet")
    assert svg.startswith("<svg") and "</svg>" in svg


def test_clean_profile(wp):
    assert wp.clean_profile(None) == wp.DEFAULT_PROFILE
    p = wp.clean_profile({"dim_after": "99999", "dim_brightness": -5, "motion": 0, "keep_on": "yes"})
    assert p == {"motion": False, "dim_after": 3600, "dim_brightness": 0, "keep_on": True}
    assert wp.clean_profile({"dim_after": "soon"})["dim_after"] == 120


def test_find_tablets(wp):
    tabs = wp.find_tablets(ENTRIES, DEVICES, ENTITIES)
    assert [t["name"] for t in tabs] == ["Majlis tablet"]
    ent = tabs[0]["entities"]
    assert ent["motion"] == "switch.majlis_tablet_motion_detection"
    assert ent["screen_off_timer"] is None   # disabled entity is skipped


def test_profile_calls(wp):
    tab = wp.find_tablets(ENTRIES, DEVICES, ENTITIES)[0]
    calls = wp.profile_calls(tab, "http://ha:8123/villa-home/tablet", {"dim_after": 60, "dim_brightness": 5})
    assert calls[0] == ("fully_kiosk", "set_config", {"device_id": "dev1", "key": "startURL", "value": "http://ha:8123/villa-home/tablet"})
    assert calls[1][:2] == ("fully_kiosk", "load_url")
    assert ("switch", "turn_on", {"entity_id": "switch.majlis_tablet_motion_detection"}) in calls
    assert ("number", "set_value", {"entity_id": "number.majlis_tablet_screensaver_timer", "value": 60}) in calls
    assert ("number", "set_value", {"entity_id": "number.majlis_tablet_screensaver_brightness", "value": 5}) in calls
    # no dimming: brightness untouched; no URL: no start page calls
    calls = wp.profile_calls(tab, "", {"dim_after": 0})
    assert all(c[0] != "fully_kiosk" for c in calls)
    assert not any("brightness" in c[2].get("entity_id", "") for c in calls)


class FakeSession:
    def __init__(self, fail=None):
        self.calls, self.fail = [], fail

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def try_call(self, cmd, default=None, **kw):
        return {"config_entries/get": ENTRIES, "config/device_registry/list": DEVICES,
                "config/entity_registry/list": ENTITIES}.get(cmd, default)

    def call(self, cmd, **kw):
        if self.fail and kw.get("service") == self.fail:
            raise RuntimeError("boom")
        self.calls.append(kw)


class FakeClient:
    def __init__(self, fail=None):
        self.s = FakeSession(fail)

    def session(self):
        return self.s


def test_apply(wp):
    c = FakeClient()
    res = wp.apply(c, "dev1", "http://ha:8123/villa-home/tablet", {})
    assert res["ok"] and res["tablet"] == "Majlis tablet"
    assert c.s.calls[0]["service"] == "set_config"
    assert wp.apply(FakeClient(), "nope", "", {})["ok"] is False
    assert wp.apply(FakeClient(), "dev1", "ftp://x", {})["ok"] is False
    res = wp.apply(FakeClient(fail="load_url"), "dev1", "http://ha/x/tablet", {})
    assert res["ok"] is False and any(not s["ok"] for s in res["steps"])
