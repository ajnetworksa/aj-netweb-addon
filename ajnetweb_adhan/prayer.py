#!/usr/bin/env python3
"""Prayer times from Home Assistant's native Islamic Prayer Times integration + Hijri date."""

import logging
from datetime import date, datetime, timedelta, timezone
from typing import Dict, Optional

import ha

try:
    from hijridate import Gregorian
except ImportError:  # pragma: no cover - installed in the image
    Gregorian = None

log = logging.getLogger("adhan.prayer")

PRAYERS = ["fajr", "dhuhr", "asr", "maghrib", "isha"]
ALL_KEYS = ["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha", "midnight"]
DOMAIN = "islamic_prayer_times"

NAMES = {
    "en": {"fajr": "Fajr", "sunrise": "Sunrise", "dhuhr": "Dhuhr", "asr": "Asr", "maghrib": "Maghrib",
           "isha": "Isha", "midnight": "Midnight"},
    "ar": {"fajr": "الفجر", "sunrise": "الشروق", "dhuhr": "الظهر", "asr": "العصر", "maghrib": "المغرب",
           "isha": "العشاء", "midnight": "منتصف الليل"},
}
HIJRI_MONTHS = {
    "en": ["Muharram", "Safar", "Rabi al-Awwal", "Rabi al-Thani", "Jumada al-Ula", "Jumada al-Akhirah",
           "Rajab", "Shaban", "Ramadan", "Shawwal", "Dhu al-Qadah", "Dhu al-Hijjah"],
    "ar": ["محرم", "صفر", "ربيع الأول", "ربيع الآخر", "جمادى الأولى", "جمادى الآخرة", "رجب", "شعبان",
           "رمضان", "شوال", "ذو القعدة", "ذو الحجة"],
}

# Calculation methods offered by the HA integration (keys from its const.py)
METHODS = [
    ("makkah", "Umm Al-Qura, Makkah"), ("gulf", "Gulf region"), ("kuwait", "Kuwait"), ("qatar", "Qatar"),
    ("dubai", "Dubai"), ("egypt", "Egyptian General Authority"), ("karachi", "University of Islamic Sciences, Karachi"),
    ("mwl", "Muslim World League"), ("isna", "Islamic Society of North America"), ("jafari", "Shia Ithna-Ansari"),
    ("tehran", "Institute of Geophysics, Tehran"), ("turkey", "Diyanet, Turkey"), ("jordan", "Jordan"),
    ("moonsighting", "Moonsighting Committee"), ("singapore", "Singapore"), ("jakim", "JAKIM Malaysia"),
    ("kemenag", "Kemenag Indonesia"), ("france", "France"), ("russia", "Russia"), ("tunisia", "Tunisia"),
    ("algeria", "Algeria"), ("morocco", "Morocco"), ("portugal", "Portugal"),
]


def find_sensors() -> Dict[str, str]:
    """Map prayer key -> sensor entity id, found through the entity registry (names may differ)."""
    out = {}
    try:
        with ha.WS() as ws:
            for e in ws.call("config/entity_registry/list"):
                if e.get("platform") == DOMAIN and e.get("translation_key") in ALL_KEYS and not e.get("disabled_by"):
                    out[e["translation_key"]] = e["entity_id"]
    except Exception as ex:
        log.warning("Could not read the entity registry: %s", ex)
    return out


def today_times(sensor_map: Dict[str, str], all_states: dict) -> Dict[str, datetime]:
    times = {}
    for key, eid in sensor_map.items():
        st = all_states.get(eid)
        if not st or st.get("state") in (None, "unknown", "unavailable"):
            continue
        try:
            times[key] = datetime.fromisoformat(st["state"].replace("Z", "+00:00")).astimezone(timezone.utc)
        except ValueError:
            continue
    return times


def next_prayer(times: Dict[str, datetime], now: Optional[datetime] = None):
    now = now or datetime.now(timezone.utc)
    upcoming = sorted((t, k) for k, t in times.items() if k in PRAYERS and t > now)
    return (upcoming[0][1], upcoming[0][0]) if upcoming else (None, None)


def hijri(d: date = None, adjust_days: int = 0) -> dict:
    """Hijri date (Umm Al-Qura calendar). adjust_days shifts it for local moon sighting."""
    d = (d or date.today()) + timedelta(days=adjust_days)
    if Gregorian is None:
        return {}
    try:
        h = Gregorian.fromdate(d).to_hijri()
    except (ValueError, OverflowError) as e:
        log.debug("hijri conversion failed: %s", e)
        return {}
    return {
        "day": h.day, "month": h.month, "year": h.year,
        "month_en": HIJRI_MONTHS["en"][h.month - 1], "month_ar": HIJRI_MONTHS["ar"][h.month - 1],
        "formatted_en": f"{h.day} {HIJRI_MONTHS['en'][h.month - 1]} {h.year} AH",
        "formatted_ar": f"{h.day} {HIJRI_MONTHS['ar'][h.month - 1]} {h.year} هـ",
        "ramadan": h.month == 9,
    }


def integration_entry() -> Optional[dict]:
    try:
        entries = ha.rest("GET", "/core/api/config/config_entries/entry") or []
    except ha.HAError as e:
        log.warning("config entries: %s", e)
        return None
    return next((e for e in entries if e.get("domain") == DOMAIN), None)


def setup_integration(method: str = "makkah", school: str = "shafi") -> dict:
    """
    Add Home Assistant's Islamic Prayer Times integration (at the home location) if missing,
    then set the calculation method - the same steps an installer would click through.
    """
    entry = integration_entry()
    if not entry:
        cfg = ha.rest("GET", "/core/api/config") or {}
        flow = ha.rest("POST", "/core/api/config/config_entries/flow", {"handler": DOMAIN})
        if flow.get("type") == "form":
            flow = ha.rest("POST", f"/core/api/config/config_entries/flow/{flow['flow_id']}",
                           {"location": {"latitude": cfg.get("latitude"), "longitude": cfg.get("longitude")}})
        if flow.get("type") != "create_entry":
            return {"ok": False, "error": f"Setup did not finish: {flow.get('reason') or flow.get('type')}"}
        entry = integration_entry()
    if not entry:
        return {"ok": False, "error": "Integration not found after setup"}
    opt = ha.rest("POST", "/core/api/config/config_entries/options/flow", {"handler": entry["entry_id"]})
    if opt.get("type") == "form":
        opt = ha.rest("POST", f"/core/api/config/config_entries/options/flow/{opt['flow_id']}",
                      {"calculation_method": method, "school": school})
    return {"ok": opt.get("type") == "create_entry", "entry_id": entry["entry_id"], "method": method}
