#!/usr/bin/env python3
"""
AJ Netweb Dashboard - Music setup (Studio "Music" tab).

Music Assistant is the music system: its add-on plays to the speakers, its integration gives Home
Assistant the players our cards use. The Studio checks each step and does the ones it can for the
installer:

  1. Music Assistant add-on installed and running      -> Install / Start (Supervisor store API)
  2. Music Assistant connected to Home Assistant      -> Connect (finishes HA's own discovery prompt)
  3. Speakers found (media players from Music Assistant)
  4. Music services: added by the client inside Music Assistant with their own account (Spotify,
     YouTube Music, ...). That needs their login, so it is a guide (PROVIDERS), never automated.
  5. YouTube Music only: the "YT Music PO Token Generator" add-on    -> Install / Start

Only public APIs: the Supervisor add-on and store endpoints (this add-on has hassio_role manager), the
config entry / flow REST API HA's own UI uses, and states.
"""

import logging
import re
from typing import Any, Dict, List, Optional

log = logging.getLogger("dashboard.music")

# add-ons of the Music Assistant repository, matched by slug suffix (installed slugs start with the repo hash)
ADDONS = {
    "music_assistant": re.compile(r"(^|_)music_assistant$"),
    "ytm_po_token_generator": re.compile(r"(^|_)ytm_po_token_generator$"),
}
# beta / nightly builds count as installed Music Assistant too
MA_ANY = re.compile(r"(^|_)music_assistant(_beta|_nightly|_dev)?$")
MA_REPOSITORY = "https://github.com/music-assistant/home-assistant-addon"

# What the installer tells the client. account: what they need; how: what to do in Music Assistant
# (Settings -> Music sources -> Add). Checked against music-assistant.io (October 2026).
PROVIDERS: List[Dict[str, str]] = [
    {"key": "spotify", "name": "Spotify", "account": "Premium (Individual, Duo or Family). Free accounts do not play.",
     "how": "Sign in with Spotify on the screen. Then open the Spotify app once on the same Wi-Fi and approve "
            "Music Assistant. Accounts made since late 2024 may need the official 'Spotify Soloist' option. "
            "Also add the 'Spotify Connect' plugin: every speaker then shows in the Spotify app's device list.",
     "level": "easy"},
    {"key": "apple_music", "name": "Apple Music", "account": "Paid subscription.",
     "how": "Authenticate with Apple Music (open Music Assistant on http://<HA IP>:8095 for this step). "
            "The login lasts 180 days, then sign in again.",
     "level": "easy"},
    {"key": "tidal", "name": "Tidal", "account": "Paid subscription.",
     "how": "Press Add, open the link and approve the code on link.tidal.com. Best sound quality (up to hi-res).",
     "level": "easy"},
    {"key": "youtube_music", "name": "YouTube Music", "account": "YouTube Music Premium (or YouTube Premium). Free accounts do not play.",
     "how": "Needs the 'YT Music PO Token Generator' add-on running (install it here) and a login cookie copied "
            "from the browser (incognito window, developer tools). Cookies expire: when music stops with "
            "'401 Unauthorized', copy a new one. Works, but needs the most care.",
     "level": "advanced"},
    {"key": "deezer", "name": "Deezer", "account": "Premium, HiFi or Family.",
     "how": "Copy the 'arl' cookie from deezer.com (browser developer tools) into Music Assistant.",
     "level": "advanced"},
    {"key": "soundcloud", "name": "SoundCloud", "account": "Free account works.",
     "how": "Add SoundCloud and sign in.", "level": "easy"},
    {"key": "radio", "name": "Radio (Radio Browser, TuneIn)", "account": "No account. Free.",
     "how": "Add Radio Browser: thousands of stations, including Quran radio and local GCC stations. "
            "Add favourites so they show on the dashboard.",
     "level": "easy"},
    {"key": "local", "name": "Own music (files, Plex, Jellyfin)", "account": "No streaming account.",
     "how": "Put files in the Home Assistant 'media' share and add 'Local files', or connect Plex / Jellyfin.",
     "level": "easy"},
]


def _addons(client) -> List[Dict[str, Any]]:
    data = client.rest_get("/addons", {}) or {}
    return data.get("addons", []) if isinstance(data, dict) else []


def _find(addons: List[Dict[str, Any]], pattern) -> Optional[Dict[str, Any]]:
    hits = [a for a in addons if pattern.search(a.get("slug", ""))]
    # the stable build first when several are installed
    hits.sort(key=lambda a: (0 if ADDONS["music_assistant"].search(a.get("slug", "")) else 1, a.get("slug", "")))
    return hits[0] if hits else None


def _addon_state(a: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not a:
        return {"installed": False}
    return {"installed": True, "slug": a.get("slug"), "version": a.get("version"),
            "running": a.get("state") == "started", "state": a.get("state"),
            "panel": f"/{a.get('slug')}"}


def _discovered_flow(client) -> Optional[str]:
    """HA's 'Discovered: Music Assistant' prompt (the add-on announces itself), if waiting."""
    try:
        with client.session() as s:
            flows = s.try_call("config_entries/flow/progress", []) or []
    except Exception as e:
        log.debug("flow progress: %s", e)
        return None
    for f in flows:
        if f.get("handler") == "music_assistant":
            return f.get("flow_id")
    return None


def status(client) -> Dict[str, Any]:
    addons = _addons(client)
    ma = _addon_state(_find(addons, MA_ANY))
    po = _addon_state(_find(addons, ADDONS["ytm_po_token_generator"]))
    entries = client.rest_get("/core/api/config/config_entries/entry", []) or []
    ma_entries = [e for e in entries if isinstance(e, dict) and e.get("domain") == "music_assistant"]
    loaded = [e for e in ma_entries if e.get("state") == "loaded"]
    states = client.rest_get("/core/api/states", []) or []
    players = [s.get("entity_id") for s in states if isinstance(s, dict)
               and str(s.get("entity_id", "")).startswith("media_player.")
               and "mass_player_type" in (s.get("attributes") or {})]
    flow = None if loaded else _discovered_flow(client)
    steps = [
        {"key": "addon", "ok": ma["installed"] and ma.get("running", False),
         "label": "Music Assistant add-on", "action": None if ma.get("running") else ("start" if ma["installed"] else "install"),
         "detail": (f"Version {ma.get('version')}, running" if ma.get("running") else f"Installed, {ma.get('state')}")
                   if ma["installed"] else "Not installed"},
        {"key": "integration", "ok": bool(loaded), "label": "Connected to Home Assistant",
         "action": "connect" if not loaded and flow else None,
         "detail": "Connected" if loaded else ("Home Assistant found it: press Connect" if flow else
                   ("Set up failed: check Settings -> Devices & services" if ma_entries else
                    "Waiting for the add-on (it announces itself after it starts)"))},
        {"key": "players", "ok": bool(players), "label": "Speakers",
         "detail": f"{len(players)} Music Assistant speaker(s)" if players else
                   "No speakers yet: in Music Assistant add the speaker types (Sonos, Cast, AirPlay, DLNA, HA players)"},
    ]
    return {"ok": True, "music_assistant": ma, "po_token": po, "steps": steps, "players": players,
            "providers": PROVIDERS, "ready": all(s["ok"] for s in steps)}


def _store_slug(client, key: str) -> Optional[str]:
    data = client.rest_get("/store/addons", {}) or {}
    items = data.get("addons", []) if isinstance(data, dict) else []
    hits = [a.get("slug", "") for a in items if ADDONS[key].search(a.get("slug", ""))]
    return hits[0] if hits else None


def install(client, key: str) -> Dict[str, Any]:
    """Install (if needed) and start one of the Music Assistant repository's add-ons."""
    if key not in ADDONS:
        return {"ok": False, "error": "Unknown add-on"}
    found = _find(_addons(client), MA_ANY if key == "music_assistant" else ADDONS[key])
    slug = found.get("slug") if found else None
    if not slug:
        slug = _store_slug(client, key)
        if not slug:
            # the repository is in the store by default; add it if this system removed it
            client.rest("POST", "/store/repositories", {"repository": MA_REPOSITORY})
            client.rest("POST", "/store/reload")
            slug = _store_slug(client, key)
        if not slug:
            return {"ok": False, "error": "Music Assistant was not found in the add-on store. "
                                          "Add it from Settings -> Add-ons -> Add-on store."}
        code, body = client.rest("POST", f"/store/addons/{slug}/install")
        if code != 200:
            return {"ok": False, "error": f"Install failed (HTTP {code}): {_msg(body)}"}
    if not found or found.get("state") != "started":
        code, body = client.rest("POST", f"/addons/{slug}/start")
        if code != 200:
            return {"ok": False, "error": f"Installed, but it did not start (HTTP {code}): {_msg(body)}"}
    return {"ok": True, "slug": slug}


def connect(client) -> Dict[str, Any]:
    """Confirm HA's discovery prompt for Music Assistant (same as pressing Configure -> Submit)."""
    flow = _discovered_flow(client)
    if not flow:
        return {"ok": False, "error": "Home Assistant has not found Music Assistant yet. Start the add-on and try again."}
    code, body = client.rest("POST", f"/core/api/config/config_entries/flow/{flow}", {})
    if code != 200:
        return {"ok": False, "error": f"Could not connect (HTTP {code}): {_msg(body)}"}
    if isinstance(body, dict) and body.get("type") not in ("create_entry", "abort"):
        return {"ok": False, "error": "Home Assistant asks for more details: finish it in Settings -> Devices & services."}
    return {"ok": True}


def _msg(body: Any) -> str:
    if isinstance(body, dict):
        return str(body.get("message") or body.get("error") or body)[:200]
    return str(body)[:200]
