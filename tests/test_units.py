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


def test_doorbell_sensor_and_open_buttons(load_addon_module):
    doorbell = load_addon_module("ajnetweb_intercom", "doorbell")
    cfg = {"door_1_name": "Main Gate", "door_2_name": ""}
    idle = doorbell.sensor_payload(cfg, False)
    assert idle["state"] == "idle" and "rang_at" not in idle["attributes"]
    assert [d["button"] for d in idle["attributes"]["doors"]] == ["input_button.ajnetweb_open_door_1"]
    ring = doorbell.sensor_payload(dict(cfg, door_2_name="Pedestrian"), True, "ring_x.jpg", "camera.gate")
    assert ring["state"] == "ringing"
    assert ring["attributes"]["snapshot"] == "/local/ajnetweb_intercom/ring_x.jpg"
    assert ring["attributes"]["camera"] == "camera.gate"
    assert len(ring["attributes"]["doors"]) == 2


def test_doorbell_press_maps_only_our_helpers(load_addon_module):
    doorbell = load_addon_module("ajnetweb_intercom", "doorbell")
    press = {"domain": "input_button", "service": "press",
             "service_data": {"entity_id": ["input_button.ajnetweb_open_door_2", "input_button.other"]}}
    assert doorbell.pressed_doors(press) == [2]
    assert doorbell.pressed_doors(dict(press, service_data={"entity_id": "input_button.ajnetweb_open_door_1"})) == [1]
    assert doorbell.pressed_doors(dict(press, domain="light")) == []
    assert doorbell.pressed_doors({}) == []


def test_energy_tariff_option_reaches_the_strategy(load_addon_module, monkeypatch):
    engine_mod = load_addon_module("ajnetweb_dashboard", "dashboard_engine")
    engine = engine_mod.DashboardEngine.__new__(engine_mod.DashboardEngine)
    monkeypatch.setattr(engine, "_context", lambda: {}, raising=False)
    monkeypatch.setattr(engine, "_music_assistant_entry", lambda: None, raising=False)
    project = dict(engine_mod.DEFAULT_PROJECT)

    def option(value):
        return engine.generate({**project, "energy_tariff": value})["strategy"].get("energy_tariff")

    assert option("auto") is None          # the card decides from HA's country
    assert option("dewa") == "dewa"
    assert option("none") == "none"
    assert option("<script>") is None


def test_notifications_off_reaches_the_strategy(load_addon_module, monkeypatch):
    engine_mod = load_addon_module("ajnetweb_dashboard", "dashboard_engine")
    engine = engine_mod.DashboardEngine.__new__(engine_mod.DashboardEngine)
    monkeypatch.setattr(engine, "_context", lambda: {}, raising=False)
    monkeypatch.setattr(engine, "_music_assistant_entry", lambda: None, raising=False)
    project = dict(engine_mod.DEFAULT_PROJECT)
    assert "notifications" not in engine.generate(project)["strategy"]
    assert engine.generate({**project, "notifications": False})["strategy"]["notifications"] is False
