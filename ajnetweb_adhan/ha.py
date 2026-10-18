#!/usr/bin/env python3
"""Small Home Assistant client: Supervisor REST proxy + Core WebSocket (public APIs only)."""

import json
import logging
import os
import threading
import time
from typing import Any, Callable, Optional

import requests
import websocket

log = logging.getLogger("adhan.ha")
TOKEN = os.environ.get("SUPERVISOR_TOKEN", "")
SUP = "http://supervisor"


class HAError(Exception):
    pass


def _headers():
    return {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}


def rest(method: str, path: str, body: Any = None, timeout: int = 15) -> Any:
    """Call the Supervisor (path like /core/api/states or /network/info)."""
    r = requests.request(method, f"{SUP}{path}", headers=_headers(),
                         data=json.dumps(body) if body is not None else None, timeout=timeout)
    if r.status_code >= 400:
        raise HAError(f"{method} {path} -> HTTP {r.status_code}: {r.text[:200]}")
    if not r.content:
        return None
    data = r.json()
    if isinstance(data, dict) and data.get("result") == "ok" and "data" in data:
        return data["data"]
    return data


def states() -> dict:
    return {s["entity_id"]: s for s in rest("GET", "/core/api/states") or []}


def call_service(domain: str, service: str, data: dict, timeout: int = 20) -> Any:
    return rest("POST", f"/core/api/services/{domain}/{service}", data, timeout=timeout)


def set_state(entity_id: str, state: str, attributes: dict):
    rest("POST", f"/core/api/states/{entity_id}", {"state": state, "attributes": attributes})


def fire_event(event: str, data: dict):
    try:
        rest("POST", f"/core/api/events/{event}", data)
    except HAError as e:
        log.debug("event %s failed: %s", event, e)


class WS:
    """One authenticated WebSocket connection for a batch of commands."""

    def __enter__(self):
        self.ws = websocket.create_connection("ws://supervisor/core/websocket", timeout=15)
        self.i = 0
        msg = json.loads(self.ws.recv())
        if msg.get("type") == "auth_required":
            self.ws.send(json.dumps({"type": "auth", "access_token": TOKEN}))
            msg = json.loads(self.ws.recv())
        if msg.get("type") != "auth_ok":
            raise HAError("WebSocket auth failed")
        return self

    def __exit__(self, *a):
        try:
            self.ws.close()
        except Exception:
            pass

    def call(self, type_: str, **params) -> Any:
        self.i += 1
        self.ws.send(json.dumps(dict(id=self.i, type=type_, **params)))
        while True:
            r = json.loads(self.ws.recv())
            if r.get("id") == self.i and r.get("type") == "result":
                if not r.get("success"):
                    raise HAError(f"{type_}: {(r.get('error') or {}).get('message')}")
                return r.get("result")


def watch_states(entity_ids: Callable[[], set], on_change: Callable[[str, dict], None]):
    """Background thread: call on_change(entity_id, new_state) for the watched entities."""

    def run():
        while True:
            try:
                ws = websocket.create_connection("ws://supervisor/core/websocket", timeout=60)
                json.loads(ws.recv())
                ws.send(json.dumps({"type": "auth", "access_token": TOKEN}))
                if json.loads(ws.recv()).get("type") != "auth_ok":
                    raise HAError("auth failed")
                ws.send(json.dumps({"id": 1, "type": "subscribe_events", "event_type": "state_changed"}))
                ws.settimeout(90)
                while True:
                    try:
                        msg = json.loads(ws.recv())
                    except websocket.WebSocketTimeoutException:
                        ws.ping()
                        continue
                    if msg.get("type") != "event":
                        continue
                    data = msg["event"]["data"]
                    eid = data.get("entity_id")
                    if eid in entity_ids() and data.get("new_state"):
                        on_change(eid, data["new_state"])
            except Exception as e:
                log.info("state watcher reconnecting: %s", e)
                time.sleep(5)

    threading.Thread(target=run, daemon=True, name="ha-watch").start()


def ha_base_url() -> str:
    """URL speakers use to fetch audio from Home Assistant (/local files)."""
    core = rest("GET", "/core/info") or {}
    port = core.get("port", 8123)
    scheme = "https" if core.get("ssl") else "http"
    cfg = rest("GET", "/core/api/config") or {}
    if cfg.get("internal_url"):
        return cfg["internal_url"].rstrip("/")
    net = rest("GET", "/network/info") or {}
    for iface in net.get("interfaces", []):
        if iface.get("primary") and (iface.get("ipv4") or {}).get("address"):
            ip = iface["ipv4"]["address"][0].split("/")[0]
            return f"{scheme}://{ip}:{port}"
    return f"{scheme}://homeassistant.local:{port}"


def resolve_config_dir() -> str:
    for d in ("/homeassistant", "/config"):
        if os.path.exists(os.path.join(d, "configuration.yaml")):
            return d
    return "/homeassistant"
