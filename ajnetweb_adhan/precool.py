#!/usr/bin/env python3
"""AC pre-cooling before prayers: "cool the majlis 30 minutes before Maghrib".

Each rule names prayers, how many minutes before them to start, the climate entities and a target temperature
for summer (and optionally winter; no winter temperature = the rule rests in winter). The family's own choices
win: an AC that is already cooler, or running in another mode (fan, dry), is left alone.
"""

import re
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple

PRAYERS = ["fajr", "dhuhr", "asr", "maghrib", "isha"]
HVAC_MODES = ("cool", "heat", "heat_cool", "auto")
DEFAULT_SUMMER_MONTHS = [4, 5, 6, 7, 8, 9, 10]

DEFAULTS = {"enabled": True, "summer_months": DEFAULT_SUMMER_MONTHS, "rules": []}


def _num(v, lo, hi, default):
    try:
        v = float(v)
    except (TypeError, ValueError):
        return default
    return min(hi, max(lo, v))


def sanitize_rule(r: dict, index: int = 0) -> Optional[dict]:
    """Bound and clean one rule from the studio; None when it can't be used at all."""
    if not isinstance(r, dict):
        return None
    climates = [c for c in r.get("climates") or [] if isinstance(c, str) and re.fullmatch(r"climate\.[a-z0-9_]+", c)]
    prayers = [p for p in r.get("prayers") or [] if p in PRAYERS]
    rid = re.sub(r"[^a-z0-9_]", "", str(r.get("id") or "").lower())[:32] or f"rule{index + 1}"
    winter = r.get("winter_temp")
    return {
        "id": rid,
        "name": str(r.get("name") or "").strip()[:60] or f"Pre-cool {index + 1}",
        "enabled": bool(r.get("enabled", True)),
        "prayers": prayers,
        "minutes": int(_num(r.get("minutes"), 0, 180, 30)),
        "climates": climates[:20],
        "hvac_mode": r.get("hvac_mode") if r.get("hvac_mode") in HVAC_MODES else "cool",
        "summer_temp": _num(r.get("summer_temp"), 16, 30, 22),
        "winter_temp": None if winter in (None, "") else _num(winter, 16, 30, 24),
        "only_when_home": bool(r.get("only_when_home", False)),
        "ramadan_only": bool(r.get("ramadan_only", False)),
    }


def sanitize(cfg: dict) -> dict:
    cfg = cfg if isinstance(cfg, dict) else {}
    months = sorted({int(m) for m in cfg.get("summer_months", DEFAULT_SUMMER_MONTHS)
                     if str(m).isdigit() and 1 <= int(m) <= 12})
    rules, seen = [], set()
    for i, r in enumerate(cfg.get("rules") or []):
        r = sanitize_rule(r, i)
        if r and r["id"] not in seen:
            seen.add(r["id"])
            rules.append(r)
    return {"enabled": bool(cfg.get("enabled", True)), "summer_months": months, "rules": rules[:30]}


def season(cfg: dict, month: int) -> str:
    return "summer" if month in (cfg.get("summer_months") or []) else "winter"


def target_temp(rule: dict, season_name: str) -> Optional[float]:
    return rule["summer_temp"] if season_name == "summer" else rule.get("winter_temp")


def starts(cfg: dict, times: Dict[str, datetime]) -> List[Tuple[dict, str, datetime]]:
    """(rule, prayer, start time) for every enabled rule and prayer that has a time today."""
    out = []
    if not cfg.get("enabled", True):
        return out
    for rule in cfg.get("rules") or []:
        if not rule.get("enabled") or not rule.get("climates"):
            continue
        for p in rule.get("prayers") or []:
            if times.get(p):
                out.append((rule, p, times[p] - timedelta(minutes=rule.get("minutes", 30))))
    return out


def skip_reason(rule: dict, season_name: str, ramadan: bool, someone_home: bool) -> Optional[str]:
    if rule.get("ramadan_only") and not ramadan:
        return "only in Ramadan"
    if target_temp(rule, season_name) is None:
        return f"rests in {season_name}"
    if rule.get("only_when_home") and not someone_home:
        return "nobody home"
    return None


def plan(rule: dict, temp: float, st: Optional[dict]) -> Tuple[Optional[dict], str]:
    """The climate.set_temperature data for one AC, or None and why it is left alone."""
    if not st or st.get("state") in (None, "unavailable", "unknown"):
        return None, "unavailable"
    attrs = st.get("attributes") or {}
    mode = rule.get("hvac_mode", "cool")
    modes = attrs.get("hvac_modes") or []
    if modes and mode not in modes:
        return None, f"has no {mode} mode"
    lo, hi = attrs.get("min_temp"), attrs.get("max_temp")
    if isinstance(lo, (int, float)):
        temp = max(temp, lo)
    if isinstance(hi, (int, float)):
        temp = min(temp, hi)
    state = st.get("state")
    current = attrs.get("temperature")
    if state not in ("off", mode):
        return None, f"left as is (running in {state})"
    if state == mode and isinstance(current, (int, float)):
        if mode == "cool" and current <= temp:
            return None, f"already set to {current:g}°"
        if mode == "heat" and current >= temp:
            return None, f"already set to {current:g}°"
        if mode not in ("cool", "heat") and current == temp:
            return None, f"already set to {current:g}°"
    return {"hvac_mode": mode, "temperature": temp}, f"{mode} {temp:g}°"
