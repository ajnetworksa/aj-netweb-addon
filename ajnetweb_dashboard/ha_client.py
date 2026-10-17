#!/usr/bin/env python3
"""
AJ Netweb Dashboard - Home Assistant client.

Only public, documented Home Assistant interfaces are used here (Supervisor REST
proxy + Core WebSocket API), so the add-on keeps working across HA releases.
We never write into /config/.storage directly: HA owns those files and will
overwrite or reject anything we put there while it is running.
"""

import json
import logging
import os
from typing import Any, Optional

try:
    import requests
except ImportError:  # pragma: no cover - always present in the container
    requests = None

try:
    import websocket
except ImportError:  # pragma: no cover
    websocket = None

log = logging.getLogger("dashboard.ha")

SUPERVISOR_URL = "http://supervisor"
CORE_WS_URL = "ws://supervisor/core/websocket"


def resolve_ha_config_dir() -> str:
    """
    `map: homeassistant_config` mounts the HA config at /homeassistant.
    The legacy `map: config` mounted it at /config. Support both.
    """
    for candidate in ("/homeassistant", "/config"):
        if os.path.exists(os.path.join(candidate, "configuration.yaml")):
            return candidate
    return "/homeassistant" if os.path.isdir("/homeassistant") else "/config"


class HAError(Exception):
    pass


class HASession:
    """One authenticated WebSocket connection, reused for several commands."""

    def __init__(self, token: str, timeout: int = 15):
        self.token = token
        self.timeout = timeout
        self.ws = None
        self._id = 0

    def __enter__(self):
        if not self.token:
            raise HAError("SUPERVISOR_TOKEN missing - is homeassistant_api enabled?")
        if websocket is None:
            raise HAError("websocket-client is not installed")
        self.ws = websocket.create_connection(CORE_WS_URL, timeout=self.timeout)
        msg = json.loads(self.ws.recv())
        if msg.get("type") == "auth_required":
            self.ws.send(json.dumps({"type": "auth", "access_token": self.token}))
            msg = json.loads(self.ws.recv())
        if msg.get("type") != "auth_ok":
            self.close()
            raise HAError(f"WebSocket auth failed: {msg.get('message', msg.get('type'))}")
        return self

    def __exit__(self, *exc):
        self.close()

    def close(self):
        if self.ws is not None:
            try:
                self.ws.close()
            except Exception:
                pass
            self.ws = None

    def call(self, command: str, **params) -> Any:
        """Send a command and wait for its result. Raises HAError on failure."""
        self._id += 1
        msg_id = self._id
        payload = {"id": msg_id, "type": command}
        payload.update(params)
        self.ws.send(json.dumps(payload))
        while True:
            resp = json.loads(self.ws.recv())
            if resp.get("id") != msg_id or resp.get("type") != "result":
                continue  # events / pongs for other ids
            if resp.get("success"):
                return resp.get("result")
            err = resp.get("error") or {}
            raise HAError(f"{command}: {err.get('code', 'error')} - {err.get('message', 'unknown')}")

    def try_call(self, command: str, default: Any = None, **params) -> Any:
        try:
            return self.call(command, **params)
        except HAError as e:
            log.debug("%s", e)
            return default


class HAClient:
    def __init__(self, token: Optional[str] = None):
        self.token = token or os.environ.get("SUPERVISOR_TOKEN", "")
        self.config_dir = resolve_ha_config_dir()

    @property
    def connected(self) -> bool:
        return bool(self.token)

    def session(self) -> HASession:
        return HASession(self.token)

    def _headers(self):
        return {"Authorization": f"Bearer {self.token}", "Content-Type": "application/json"}

    def rest_get(self, path: str, default: Any = None) -> Any:
        """GET against the Supervisor (`/addons`, `/core/api/states`, ...)."""
        if not self.token or requests is None:
            return default
        try:
            r = requests.get(f"{SUPERVISOR_URL}{path}", headers=self._headers(), timeout=10)
            if r.status_code == 200:
                body = r.json()
                # Supervisor endpoints wrap results in {"result": "ok", "data": ...}
                if isinstance(body, dict) and body.get("result") == "ok" and "data" in body:
                    return body["data"]
                return body
            log.debug("GET %s -> HTTP %s", path, r.status_code)
        except Exception as e:
            log.debug("GET %s failed: %s", path, e)
        return default

    def core_version(self) -> str:
        cfg = self.rest_get("/core/api/config", {}) or {}
        return cfg.get("version", "")

    def find_addon_panel(self, slug_suffix: str) -> Optional[str]:
        """Return the sidebar path (/<repo-hash>_<slug>) of an installed add-on."""
        data = self.rest_get("/addons", {}) or {}
        for addon in data.get("addons", []):
            slug = addon.get("slug", "")
            if slug == slug_suffix or slug.endswith("_" + slug_suffix):
                return f"/{slug}"
        return None


def version_tuple(v: str):
    parts = []
    for p in (v or "0").split(".")[:2]:
        digits = "".join(ch for ch in p if ch.isdigit())
        parts.append(int(digits or 0))
    while len(parts) < 2:
        parts.append(0)
    return tuple(parts)
