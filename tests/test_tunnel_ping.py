"""Remote Access: the status-page ping must use the address the tunnel really dials."""

import socket

import pytest


@pytest.fixture
def features(load_addon_module):
    return load_addon_module("ajnetweb_tunnel", "features")


def _listener():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    s.listen(5)
    return s, s.getsockname()[1]


def _closed_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


def test_tunnel_target_prefers_frpc_toml(features, tmp_path):
    (tmp_path / "frpc.toml").write_text('serverAddr = "192.168.8.20"\nserverPort = 7000\nuser = "x"\n\n'
                                        '[[proxies]]\nserverAddr = "nope"\n')
    st = {"tunnel": {"server_addr": "hub.example.com", "server_port": 7000}}
    assert features.tunnel_target(st, str(tmp_path)) == ("192.168.8.20", 7000)
    assert features.tunnel_target(st, str(tmp_path / "missing")) == ("hub.example.com", 7000)
    assert features.tunnel_target({}, str(tmp_path / "missing")) is None


def test_ping_uses_tunnel_path_then_api_host(features, monkeypatch):
    srv, port = _listener()
    try:
        monkeypatch.setattr(features, "tunnel_target", lambda st: ("127.0.0.1", port))
        assert features.hub_latency({}) is not None
        # public name not reachable from inside (e.g. LAN hub): falls back to the API host and says why once
        notes = []
        monkeypatch.setattr(features, "tunnel_target", lambda st: ("127.0.0.1", _closed_port()))
        assert features.hub_latency({}, ("127.0.0.1", port), notes.append) is not None
        assert notes == []
        dead = ("127.0.0.1", _closed_port())
        monkeypatch.setattr(features, "tunnel_target", lambda st: dead)
        assert features.hub_latency({}, None, notes.append) is None
        assert features.hub_latency({}, None, notes.append) is None
        assert len(notes) == 1 and "not reachable" in notes[0]
        monkeypatch.setattr(features, "tunnel_target", lambda st: None)
        assert features.hub_latency({}, ("", 443), notes.append) is None
    finally:
        srv.close()
