#!/usr/bin/env python3
"""
Adhan playback on Home Assistant speakers, using the most native method each one supports:

1. Music Assistant players -> music_assistant.play_announcement
   (MA pauses whatever is playing, plays the adhan at the announce volume, then resumes).
2. Players with the "announce" feature (Sonos, Cast, ...) -> media_player.play_media(announce=true)
   (the integration ducks/resumes the current music itself).
3. Anything else -> repeat off, set volume, play_media, wait for the length of the file, stop the player
   (so a player in repeat/loop mode does not start the adhan again), restore repeat and volume.

TVs/players listed in "pause during adhan" are paused first and resumed afterwards.
"""

import logging
import os
import threading
import time
import urllib.parse
from datetime import datetime, timezone
from typing import Dict, List

import ha

try:
    import mutagen
except ImportError:  # pragma: no cover
    mutagen = None

log = logging.getLogger("adhan.player")

FEATURE_VOLUME_SET = 4
FEATURE_PLAY_MEDIA = 512
FEATURE_STOP = 4096
FEATURE_REPEAT_SET = 262144
FEATURE_ANNOUNCE = 1048576
FINISH_GRACE = 15.0   # extra seconds a plain player may need to finish the file before it is stopped
_lock = threading.Lock()
_stop = threading.Event()


def duration_of(path: str, default: float = 180.0) -> float:
    try:
        if mutagen is not None:
            f = mutagen.File(path)
            if f is not None and f.info and f.info.length:
                return float(f.info.length)
    except Exception as e:
        log.debug("duration of %s: %s", path, e)
    return default


def speakers(all_states: dict) -> List[dict]:
    """Media players that can play a URL, with their capabilities (for the UI)."""
    out = []
    for eid, st in all_states.items():
        if not eid.startswith("media_player."):
            continue
        a = st.get("attributes") or {}
        sf = a.get("supported_features") or 0
        out.append({
            "entity_id": eid, "name": a.get("friendly_name") or eid, "state": st.get("state"),
            "music_assistant": "mass_player_type" in a,
            "announce": bool(sf & FEATURE_ANNOUNCE), "can_play": bool(sf & FEATURE_PLAY_MEDIA),
            "device_class": a.get("device_class"),
        })
    return sorted(out, key=lambda s: s["name"].lower())


def stop():
    _stop.set()


def play(url: str, path: str, targets: List[str], volume: float, pause: List[str],
         resume_after: float = 2.0) -> Dict[str, str]:
    """Play one audio file on all targets in parallel. Returns per-entity method/result."""
    with _lock:
        _stop.clear()
        all_states = ha.states()
        length = duration_of(path)
        results: Dict[str, str] = {}

        paused = []
        for eid in pause:
            st = all_states.get(eid)
            if st and st.get("state") == "playing" and eid not in targets:
                try:
                    ha.call_service("media_player", "media_pause", {"entity_id": eid})
                    paused.append(eid)
                except ha.HAError as e:
                    log.warning("pause %s: %s", eid, e)

        restore_volume = {}
        restore_repeat = {}
        for eid in targets:
            st = all_states.get(eid)
            if not st or st.get("state") in ("unavailable", "unknown"):
                results[eid] = "offline"
                continue
            a = st.get("attributes") or {}
            sf = a.get("supported_features") or 0
            try:
                if "mass_player_type" in a:
                    ha.call_service("music_assistant", "play_announcement", {
                        "entity_id": eid, "url": url, "use_pre_announce": False,
                        "announce_volume": int(round(volume * 100))})
                    results[eid] = "music_assistant"
                    continue
                if sf & FEATURE_VOLUME_SET and a.get("volume_level") is not None:
                    restore_volume[eid] = a["volume_level"]
                if sf & FEATURE_VOLUME_SET:
                    ha.call_service("media_player", "volume_set", {"entity_id": eid, "volume_level": volume})
                data = {"entity_id": eid, "media_content_id": url, "media_content_type": "music"}
                if sf & FEATURE_ANNOUNCE:
                    data["announce"] = True
                elif sf & FEATURE_REPEAT_SET and a.get("repeat") not in (None, "off"):
                    # a player left in repeat mode would play the adhan again and again
                    was = a["repeat"]
                    try:
                        ha.call_service("media_player", "repeat_set", {"entity_id": eid, "repeat": "off"})
                        restore_repeat[eid] = was
                    except ha.HAError as e:
                        log.warning("repeat off %s: %s", eid, e)
                ha.call_service("media_player", "play_media", data)
                results[eid] = "announce" if sf & FEATURE_ANNOUNCE else "play_media"
            except ha.HAError as e:
                results[eid] = f"error: {e}"
                log.error("adhan on %s failed: %s", eid, e)

        # wait for the adhan to finish (or a stop request), then restore
        _stop.wait(length + 1.5)
        if _stop.is_set():
            for eid, method in results.items():
                if method in ("announce", "play_media", "music_assistant"):
                    try:
                        ha.call_service("media_player", "media_stop", {"entity_id": eid})
                    except ha.HAError:
                        pass
        else:
            # announce / Music Assistant end and resume by themselves; a plain player is stopped here once the
            # file is over, otherwise repeat/loop mode (many DLNA renderers default to it) starts it again
            finish_plain([e for e, m in results.items() if m == "play_media"], url, length)
        for eid, rep in restore_repeat.items():
            try:
                ha.call_service("media_player", "repeat_set", {"entity_id": eid, "repeat": rep})
            except ha.HAError as e:
                log.warning("restore repeat %s: %s", eid, e)
        for eid, vol in restore_volume.items():
            try:
                ha.call_service("media_player", "volume_set", {"entity_id": eid, "volume_level": vol})
            except ha.HAError as e:
                log.warning("restore volume %s: %s", eid, e)
        if paused:
            time.sleep(resume_after)
            for eid in paused:
                try:
                    ha.call_service("media_player", "media_play", {"entity_id": eid})
                except ha.HAError as e:
                    log.warning("resume %s: %s", eid, e)
        log.info("Played %s (%.0fs) on %s; paused %s", os.path.basename(path), length, results, paused)
        return results


def _still_ours(st: dict, url: str) -> bool:
    """The player is still busy with our file (not something the family started meanwhile)."""
    if not st or st.get("state") not in ("playing", "paused", "buffering", "on"):
        return False
    cid = (st.get("attributes") or {}).get("media_content_id")
    if not cid:
        return True
    # DLNA renderers often report the URL decoded, re-encoded or with a query string -> compare file names
    def name(u):
        return os.path.basename(urllib.parse.unquote(urllib.parse.urlsplit(str(u)).path)).lower()
    return cid == url or name(cid) == name(url)


def _near_end(st: dict, length: float) -> bool:
    a = st.get("attributes") or {}
    pos, upd = a.get("media_position"), a.get("media_position_updated_at")
    if not isinstance(pos, (int, float)):
        return True                        # no position reported: the file's length has passed, stop now
    if st.get("state") == "playing" and upd:
        try:
            pos += (datetime.now(timezone.utc) - datetime.fromisoformat(str(upd).replace("Z", "+00:00"))).total_seconds()
        except ValueError:
            pass
    dur = a.get("media_duration") if isinstance(a.get("media_duration"), (int, float)) else length
    # a position far below the end right after the file's length means it started over (loop) -> stop
    return pos >= dur - 1.0 or pos < min(10.0, dur / 2)


def finish_plain(eids: List[str], url: str, length: float) -> None:
    """Stop plain players once our file is over (give a slow-starting player up to FINISH_GRACE s more)."""
    pending = list(eids)
    deadline = time.time() + FINISH_GRACE
    while pending:
        all_states = ha.states()
        for eid in list(pending):
            st = all_states.get(eid)
            if not _still_ours(st, url):
                pending.remove(eid)        # finished by itself, or someone is playing something else now
            elif _near_end(st, length) or time.time() >= deadline:
                try:
                    if ((st.get("attributes") or {}).get("supported_features") or 0) & FEATURE_STOP:
                        ha.call_service("media_player", "media_stop", {"entity_id": eid})
                    else:
                        ha.call_service("media_player", "media_pause", {"entity_id": eid})
                    log.info("stopped %s after the adhan (repeat/loop safety)", eid)
                except ha.HAError as e:
                    log.warning("stop %s after adhan: %s", eid, e)
                pending.remove(eid)
        if pending:
            if _stop.wait(1.0):
                return


def play_media(url: str, targets: List[str], volume: float) -> Dict[str, str]:
    """Start normal playback (not an announcement) and return; used for long recitations and streams."""
    all_states = ha.states()
    results: Dict[str, str] = {}
    for eid in targets:
        st = all_states.get(eid)
        if not st or st.get("state") in ("unavailable", "unknown"):
            results[eid] = "offline"
            continue
        sf = (st.get("attributes") or {}).get("supported_features") or 0
        try:
            if sf & FEATURE_VOLUME_SET:
                ha.call_service("media_player", "volume_set", {"entity_id": eid, "volume_level": volume})
            ha.call_service("media_player", "play_media",
                            {"entity_id": eid, "media_content_id": url, "media_content_type": "music"})
            results[eid] = "playing"
        except ha.HAError as e:
            results[eid] = f"error: {e}"
            log.error("play on %s failed: %s", eid, e)
    return results
