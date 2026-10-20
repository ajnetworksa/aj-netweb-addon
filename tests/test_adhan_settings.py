"""Prayer & Adhan settings: per-prayer speakers, iqamah, Jumu'ah and Quran after Fajr."""

from datetime import datetime, timezone

import pytest


@pytest.fixture
def server(load_addon_module, monkeypatch, tmp_path):
    monkeypatch.setenv("SUPERVISOR_TOKEN", "test")
    srv = load_addon_module("ajnetweb_adhan", "server")
    monkeypatch.setattr(srv, "SETTINGS_FILE", str(tmp_path / "settings.json"))
    return srv


def test_old_settings_get_the_new_defaults(server, tmp_path):
    (tmp_path / "settings.json").write_text('{"prayers": {"fajr": {"enabled": false, "offset": 2}}}')
    s = server.load_settings()
    assert s["prayers"]["fajr"] == {"enabled": False, "offset": 2, "volume": None, "speakers": [], "iqamah": 0}
    assert s["jumuah"]["adhan"] is True and s["quran_after_fajr"]["enabled"] is False


def test_save_cleans_speakers_iqamah_url_and_time(server):
    s = server.save_settings({
        "prayers": {"fajr": {"speakers": ["media_player.majlis", "light.x", 3], "iqamah": 500}},
        "quran_after_fajr": {"url": "javascript:alert(1)", "speakers": ["switch.x"]},
        "jumuah": {"kahf_time": "25:99"},
    })
    assert s["prayers"]["fajr"]["speakers"] == ["media_player.majlis"]
    assert s["prayers"]["fajr"]["iqamah"] == 60
    assert s["quran_after_fajr"]["url"] == "" and s["quran_after_fajr"]["speakers"] == []
    assert s["jumuah"]["kahf_time"] == "09:00"
    s = server.save_settings({"quran_after_fajr": {"url": " https://example.com/quran.mp3 "}})
    assert s["quran_after_fajr"]["url"] == "https://example.com/quran.mp3"


def test_speakers_for_falls_back_to_the_default_speakers(server):
    s = server.save_settings({"speakers": ["media_player.all"], "prayers": {"fajr": {"speakers": ["media_player.majlis"]}}})
    assert server.speakers_for("fajr", s) == ["media_player.majlis"]
    assert server.speakers_for("isha", s) == ["media_player.all"]


def test_dhuhr_is_called_jumuah_on_friday(server):
    # 09:00 UTC is the same weekday in every GCC time zone
    friday = datetime(2026, 10, 23, 9, 0, tzinfo=timezone.utc)
    thursday = datetime(2026, 10, 22, 9, 0, tzinfo=timezone.utc)
    assert server.prayer_name("dhuhr", "en", friday) == "Jumu'ah"
    assert server.prayer_name("dhuhr", "ar", friday) == "الجمعة"
    assert server.prayer_name("dhuhr", "en", thursday) == "Dhuhr"
    assert server.prayer_name("asr", "en", friday) == "Asr"
