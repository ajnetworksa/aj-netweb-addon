"""Prayer & Adhan playback: a plain player in repeat/loop mode must not play the adhan again."""

import pytest

URL = "http://ha:8123/local/ajnetweb_adhan/adhan.mp3"


@pytest.fixture
def player(load_addon_module, monkeypatch):
    monkeypatch.setenv("SUPERVISOR_TOKEN", "test")
    p = load_addon_module("ajnetweb_adhan", "player")
    monkeypatch.setattr(p, "duration_of", lambda path, default=180.0: 0.0)
    monkeypatch.setattr(p, "FINISH_GRACE", 0.0)
    return p


def fake_ha(p, monkeypatch, states):
    calls = []

    def call_service(domain, service, data, timeout=20):
        calls.append((service, data))
        st = states.get(data.get("entity_id"))
        if service == "play_media":
            st["state"] = "playing"
            st["attributes"].update(media_content_id=data["media_content_id"], media_position=0)
        if service == "repeat_set":
            st["attributes"]["repeat"] = data["repeat"]
        if service in ("media_stop", "media_pause"):
            st["state"] = "idle"

    monkeypatch.setattr(p.ha, "states", lambda: states)
    monkeypatch.setattr(p.ha, "call_service", call_service)
    return calls


def test_dlna_player_in_loop_mode_is_stopped_and_repeat_restored(player, monkeypatch):
    sf = player.FEATURE_PLAY_MEDIA | player.FEATURE_VOLUME_SET | player.FEATURE_REPEAT_SET | player.FEATURE_STOP
    states = {"media_player.panel": {"state": "idle", "attributes": {
        "supported_features": sf, "repeat": "all", "volume_level": 0.3}}}
    calls = fake_ha(player, monkeypatch, states)
    res = player.play(URL, "/x/adhan.mp3", ["media_player.panel"], 0.5, [])
    assert res == {"media_player.panel": "play_media"}
    names = [c[0] for c in calls]
    assert names.index("repeat_set") < names.index("play_media") < names.index("media_stop")
    assert calls[names.index("repeat_set")][1]["repeat"] == "off"
    assert states["media_player.panel"]["attributes"]["repeat"] == "all"       # restored afterwards
    assert states["media_player.panel"]["state"] == "idle"


def test_announce_and_music_assistant_players_are_left_to_finish_themselves(player, monkeypatch):
    states = {
        "media_player.sonos": {"state": "idle", "attributes": {"supported_features": player.FEATURE_ANNOUNCE
                                                                | player.FEATURE_PLAY_MEDIA, "repeat": "all"}},
        "media_player.ma": {"state": "idle", "attributes": {"mass_player_type": "player", "supported_features": 0}},
    }
    calls = fake_ha(player, monkeypatch, states)
    player.play(URL, "/x/adhan.mp3", list(states), 0.5, [])
    assert not [c for c in calls if c[0] in ("repeat_set", "media_stop", "media_pause")]


def test_player_playing_something_else_is_not_stopped(player, monkeypatch):
    sf = player.FEATURE_PLAY_MEDIA | player.FEATURE_STOP
    states = {"media_player.tv": {"state": "idle", "attributes": {"supported_features": sf}}}
    calls = fake_ha(player, monkeypatch, states)
    real = player.ha.call_service

    def family_starts_music(domain, service, data, timeout=20):
        real(domain, service, data)
        if service == "play_media":
            states["media_player.tv"]["attributes"]["media_content_id"] = "spotify:track:1"

    monkeypatch.setattr(player.ha, "call_service", family_starts_music)
    player.play(URL, "/x/adhan.mp3", ["media_player.tv"], 0.5, [])
    assert "media_stop" not in [c[0] for c in calls]


def test_helper_watcher_ignores_restore_after_ha_restart(load_addon_module, monkeypatch):
    monkeypatch.setenv("SUPERVISOR_TOKEN", "test")
    ha = load_addon_module("ajnetweb_adhan", "ha")
    import json

    ev = lambda old, new: json.dumps({"type": "event", "event": {"data": {  # noqa: E731
        "entity_id": "input_button.x", "old_state": old and {"state": old}, "new_state": {"state": new}}}})
    msgs = iter([json.dumps({"type": "auth_required"}), json.dumps({"type": "auth_ok"}),
                 ev(None, "2026-11-24T10:00:00"),                      # restored at HA start
                 ev("unavailable", "2026-11-24T10:00:00"),             # back from unavailable
                 ev("2026-11-24T10:00:00", "2026-11-24T10:00:00"),     # attribute-only change
                 ev("2026-11-24T10:00:00", "2026-11-24T11:00:00")])    # real press

    class WS:
        def recv(self):
            try:
                return next(msgs)
            except StopIteration:
                raise SystemExit from None

        def send(self, *_):
            pass

        def settimeout(self, *_):
            pass

    monkeypatch.setattr(ha.websocket, "create_connection", lambda *a, **k: WS())
    got = []
    threads = []
    monkeypatch.setattr(ha.threading, "Thread", lambda target, **k: threads.append(target) or type(
        "T", (), {"start": lambda self: None})())
    ha.watch_states(lambda: {"input_button.x"}, lambda eid, st: got.append(st["state"]))
    with pytest.raises(SystemExit):
        threads[0]()
    assert got == ["2026-11-24T11:00:00"]


def test_dlna_url_reported_decoded_still_counts_as_ours(player):
    url = "http://ha:8123/local/ajnetweb_adhan/Adhan%20Makkah.mp3"
    st = {"state": "playing", "attributes": {"media_content_id": "http://192.168.8.5:8123/local/ajnetweb_adhan/adhan makkah.mp3?x=1"}}
    assert player._still_ours(st, url)
    st["attributes"]["media_content_id"] = "http://radio/stream.mp3"
    assert not player._still_ours(st, url)
