"""
Doorbell on the dashboard: what the intercom publishes to Home Assistant so every wall panel and phone
can show a ring, and how a tap on "Open" comes back.

- sensor.ajnetweb_doorbell: state "ringing" for RING_SHOW_SEC after a ring, then "idle". Every logged-in
  user can read states (custom events can only be subscribed to by admins), so the dashboard watches this.
- input_button.ajnetweb_open_door_<n>: one helper per door. Any user may press a helper; the add-on sees
  the press (call_service event) and opens that door. Works from the popup, a tile, Alexa or automations.
"""
from datetime import datetime, timezone

SENSOR = "sensor.ajnetweb_doorbell"
RING_SHOW_SEC = 60
DOORS = (1, 2)


def button_id(door: int) -> str:
    """Object id of the open-door helper (input_button.<id>)."""
    return f"ajnetweb_open_door_{door}"


def door_names(cfg: dict) -> dict:
    """{door number: name} for the doors this site uses (door 2 only when it has a name)."""
    out = {1: (cfg.get("door_1_name") or "Main Gate").strip() or "Main Gate"}
    if (cfg.get("door_2_name") or "").strip():
        out[2] = cfg["door_2_name"].strip()
    return out


def sensor_payload(cfg: dict, ringing: bool, snapshot: str = None, camera: str = None,
                   station: str = None, now: datetime = None) -> dict:
    """Body for POST /api/states/sensor.ajnetweb_doorbell."""
    now = now or datetime.now(timezone.utc)
    attrs = {
        "friendly_name": "Doorbell",
        "icon": "mdi:doorbell-video" if ringing else "mdi:doorbell",
        "doors": [{"door": n, "name": name, "button": f"input_button.{button_id(n)}"}
                  for n, name in door_names(cfg).items()],
        "show_seconds": RING_SHOW_SEC,
    }
    if ringing:
        attrs["rang_at"] = now.isoformat()
        if snapshot:
            attrs["snapshot"] = f"/local/ajnetweb_intercom/{snapshot}"
        if camera:
            attrs["camera"] = camera
        if station:
            attrs["station"] = station
    return {"state": "ringing" if ringing else "idle", "attributes": attrs}


def pressed_doors(event_data: dict) -> list:
    """Doors to open for a call_service event (input_button.press on our helpers), else []."""
    if (event_data or {}).get("domain") != "input_button" or event_data.get("service") != "press":
        return []
    ids = (event_data.get("service_data") or {}).get("entity_id") or []
    if isinstance(ids, str):
        ids = [ids]
    return [n for n in DOORS if f"input_button.{button_id(n)}" in ids]
