from datetime import datetime, timedelta, timezone

import yaml


def test_next_prayer_picks_the_soonest_upcoming(load_addon_module):
    prayer = load_addon_module("ajnetweb_adhan", "prayer")
    now = datetime(2026, 1, 1, 12, 0, tzinfo=timezone.utc)
    times = {
        "fajr": now - timedelta(hours=7),
        "sunrise": now + timedelta(minutes=5),  # not a prayer
        "asr": now + timedelta(hours=3),
        "dhuhr": now + timedelta(minutes=30),
    }
    assert prayer.next_prayer(times, now) == ("dhuhr", times["dhuhr"])
    assert prayer.next_prayer({"fajr": now - timedelta(hours=1)}, now) == (None, None)


def test_today_times_skips_unavailable_sensors(load_addon_module):
    prayer = load_addon_module("ajnetweb_adhan", "prayer")
    states = {
        "sensor.fajr": {"state": "2026-01-01T02:30:00Z"},
        "sensor.dhuhr": {"state": "unavailable"},
        "sensor.asr": {"state": "not a time"},
    }
    sensors = {"fajr": "sensor.fajr", "dhuhr": "sensor.dhuhr", "asr": "sensor.asr", "isha": "sensor.missing"}
    assert prayer.today_times(sensors, states) == {"fajr": datetime(2026, 1, 1, 2, 30, tzinfo=timezone.utc)}


def test_themes_yaml_round_trips(load_addon_module):
    themes = load_addon_module("ajnetweb_dashboard", "themes")
    doc = yaml.safe_load(themes.render_themes_yaml())
    assert set(doc) == {spec["name"] for spec in themes.THEMES.values()}
    for entry in themes.theme_catalog():
        assert entry["modes"] and entry["preview"]


def test_themes_include_status(load_addon_module, tmp_path):
    themes = load_addon_module("ajnetweb_dashboard", "themes")
    assert themes.themes_include_status(str(tmp_path))["ok"] is None
    cfg = tmp_path / "configuration.yaml"
    cfg.write_text("frontend:\n  themes: !include_dir_merge_named themes\n")
    assert themes.themes_include_status(str(tmp_path))["ok"] is True
    cfg.write_text("default_config:\n")
    assert themes.themes_include_status(str(tmp_path))["ok"] is False
