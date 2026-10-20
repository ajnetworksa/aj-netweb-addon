from contextlib import contextmanager


class FakeSession:
    def __init__(self, flows):
        self.flows = flows

    def try_call(self, command, default=None, **params):
        return self.flows if command == "config_entries/flow/progress" else default


class FakeClient:
    def __init__(self, addons=(), store=(), entries=(), states=(), flows=()):
        self.addons = list(addons)
        self.store = list(store)
        self.entries = list(entries)
        self.states = list(states)
        self.flows = list(flows)
        self.calls = []

    def rest_get(self, path, default=None):
        return {"/addons": {"addons": self.addons}, "/store/addons": {"addons": self.store},
                "/core/api/config/config_entries/entry": self.entries, "/core/api/states": self.states}.get(path, default)

    def rest(self, method, path, body=None):
        self.calls.append((method, path))
        if path.endswith("/install"):
            self.addons.append({"slug": path.split("/")[3], "state": "stopped"})
        if path.startswith("/core/api/config/config_entries/flow/"):
            return 200, {"type": "create_entry"}
        return 200, {"result": "ok"}

    @contextmanager
    def session(self):
        yield FakeSession(self.flows)


def test_status_walks_the_steps(load_addon_module):
    music = load_addon_module("ajnetweb_dashboard", "music_setup")
    empty = music.status(FakeClient())
    assert [s.get("action") for s in empty["steps"]] == ["install", None, None]
    assert not empty["ready"] and empty["providers"]

    client = FakeClient(
        addons=[{"slug": "d5369777_music_assistant", "state": "started", "version": "2.10.7"}],
        flows=[{"handler": "music_assistant", "flow_id": "f1"}])
    st = music.status(client)
    assert st["music_assistant"]["panel"] == "/d5369777_music_assistant"
    assert [s["ok"] for s in st["steps"]] == [True, False, False]
    assert st["steps"][1]["action"] == "connect"

    ready = music.status(FakeClient(
        addons=[{"slug": "d5369777_music_assistant", "state": "started"}],
        entries=[{"domain": "music_assistant", "state": "loaded"}],
        states=[{"entity_id": "media_player.majlis", "attributes": {"mass_player_type": "player"}},
                {"entity_id": "media_player.tv", "attributes": {}}]))
    assert ready["ready"] and ready["players"] == ["media_player.majlis"]


def test_beta_build_counts_as_installed(load_addon_module):
    music = load_addon_module("ajnetweb_dashboard", "music_setup")
    st = music.status(FakeClient(addons=[{"slug": "d5369777_music_assistant_beta", "state": "started"}]))
    assert st["steps"][0]["ok"]
    # the token helper is not Music Assistant
    st = music.status(FakeClient(addons=[{"slug": "d5369777_ytm_po_token_generator", "state": "started"}]))
    assert not st["music_assistant"]["installed"] and st["po_token"]["running"]


def test_install_installs_then_starts(load_addon_module):
    music = load_addon_module("ajnetweb_dashboard", "music_setup")
    client = FakeClient(store=[{"slug": "d5369777_music_assistant"}, {"slug": "d5369777_music_assistant_beta"}])
    assert music.install(client, "music_assistant") == {"ok": True, "slug": "d5369777_music_assistant"}
    assert client.calls == [("POST", "/store/addons/d5369777_music_assistant/install"),
                            ("POST", "/addons/d5369777_music_assistant/start")]
    running = FakeClient(addons=[{"slug": "x_music_assistant", "state": "started"}])
    assert music.install(running, "music_assistant")["ok"] and running.calls == []
    assert not music.install(FakeClient(), "anything")["ok"]


def test_connect_confirms_discovery(load_addon_module):
    music = load_addon_module("ajnetweb_dashboard", "music_setup")
    assert not music.connect(FakeClient())["ok"]
    client = FakeClient(flows=[{"handler": "other", "flow_id": "a"}, {"handler": "music_assistant", "flow_id": "f9"}])
    assert music.connect(client)["ok"]
    assert client.calls == [("POST", "/core/api/config/config_entries/flow/f9")]
