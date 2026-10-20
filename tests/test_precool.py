"""AC pre-cooling before prayers (ajnetweb_adhan/precool.py)."""

from datetime import datetime, timedelta, timezone

import pytest


@pytest.fixture
def precool(load_addon_module):
    return load_addon_module("ajnetweb_adhan", "precool")


def rule(precool, **kw):
    base = {"id": "majlis", "name": "Majlis", "prayers": ["maghrib"], "minutes": 30,
            "climates": ["climate.majlis"], "summer_temp": 22}
    return precool.sanitize_rule({**base, **kw})


def ac(state="off", temperature=None, modes=("off", "cool", "heat", "fan_only"), **attrs):
    return {"state": state, "attributes": {"hvac_modes": list(modes), "temperature": temperature,
                                           "min_temp": 16, "max_temp": 30, **attrs}}


def test_sanitize_bounds_and_cleans(precool):
    cfg = precool.sanitize({"summer_months": [5, "6", 13, "x"], "rules": [
        {"id": "A b!", "prayers": ["maghrib", "sunrise"], "minutes": 999, "climates": ["climate.x", "light.y", "climate.X; rm"],
         "summer_temp": 5, "winter_temp": "", "hvac_mode": "boost"},
        {"id": "ab"},  # duplicate id after cleaning is dropped
        "not a rule",
    ]})
    assert cfg["summer_months"] == [5, 6]
    assert len(cfg["rules"]) == 1
    r = cfg["rules"][0]
    assert r["id"] == "ab" and r["prayers"] == ["maghrib"] and r["minutes"] == 180
    assert r["climates"] == ["climate.x"] and r["summer_temp"] == 16 and r["winter_temp"] is None
    assert r["hvac_mode"] == "cool"


def test_starts_before_the_prayer(precool):
    maghrib = datetime(2026, 7, 1, 15, 30, tzinfo=timezone.utc)
    cfg = precool.sanitize({"rules": [{"id": "m", "prayers": ["maghrib", "isha"], "climates": ["climate.a"], "minutes": 45}]})
    out = precool.starts(cfg, {"maghrib": maghrib})
    assert [(r["id"], p, at) for r, p, at in out] == [("m", "maghrib", maghrib - timedelta(minutes=45))]
    assert precool.starts({**cfg, "enabled": False}, {"maghrib": maghrib}) == []
    no_ac = precool.sanitize({"rules": [{"id": "m", "prayers": ["maghrib"]}]})
    assert precool.starts(no_ac, {"maghrib": maghrib}) == []


def test_seasons_and_skips(precool):
    cfg = precool.sanitize({})
    assert precool.season(cfg, 7) == "summer" and precool.season(cfg, 1) == "winter"
    r = rule(precool)
    assert precool.skip_reason(r, "winter", False, True) == "rests in winter"
    assert precool.skip_reason(rule(precool, winter_temp=24), "winter", False, True) is None
    assert precool.skip_reason(rule(precool, ramadan_only=True), "summer", False, True) == "only in Ramadan"
    assert precool.skip_reason(rule(precool, only_when_home=True), "summer", False, False) == "nobody home"
    assert precool.skip_reason(r, "summer", False, False) is None


def test_plan_turns_on_an_ac_that_is_off(precool):
    data, why = precool.plan(rule(precool), 22, ac())
    assert data == {"hvac_mode": "cool", "temperature": 22}


def test_plan_respects_the_familys_settings(precool):
    r = rule(precool)
    assert precool.plan(r, 22, ac("cool", 20))[0] is None          # already cooler
    assert precool.plan(r, 22, ac("cool", 25))[0] == {"hvac_mode": "cool", "temperature": 22}
    assert precool.plan(r, 22, ac("fan_only", 25))[0] is None      # running in another mode
    assert precool.plan(r, 22, ac(modes=("off", "heat")))[0] is None  # can't cool
    assert precool.plan(r, 22, {"state": "unavailable"})[0] is None
    assert precool.plan(r, 22, None)[0] is None


def test_plan_clamps_to_the_ac_range(precool):
    data, _ = precool.plan(rule(precool), 16, ac(min_temp=18))
    assert data["temperature"] == 18
