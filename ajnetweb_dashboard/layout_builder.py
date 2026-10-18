#!/usr/bin/env python3
"""
AJ Netweb Dashboard - Layout builder.

Turns the discovery model + installer project settings into a Lovelace config.

Design rules (keep these when extending):
  * Native cards first (tile, heading, thermostat, picture-entity, media-control,
    entity-filter, markdown). They are maintained by the HA team and migrate
    automatically between releases.
  * Our own cards (custom:ajnetweb-*) are plain Web Components that only use the
    public `hass` object, so they don't break when HA changes internals.
  * Sections views + grid_options everywhere: HA reflows them to 1 column on
    phones, 2 on portrait tablets and 3-4 on landscape tablets/wall panels.
  * Every action uses `perform-action` (HA 2024.8+) and access control always
    asks for confirmation.
"""

from typing import Any, Dict, List, Optional

from themes import theme_name

MIN_HA_VERSION = "2024.11"

STRINGS = {
    "en": {
        "home": "Home", "lights": "Lights", "climate": "Climate", "security": "Security",
        "cameras": "Cameras", "media": "Media", "panel": "Wall Panel", "installer": "Installer",
        "access": "Access", "favorites": "Favorites", "scenes": "Scenes", "rooms": "Rooms",
        "covers": "Shades & Curtains", "switches": "Switches & Outlets", "fans": "Fans",
        "sensors": "Sensors", "openings": "Doors & Windows", "motion": "Motion & Presence",
        "safety": "Safety", "alarm": "Alarm", "appliances": "Appliances", "energy": "Power",
        "all_lights_off": "All lights off", "all_ac_off": "All AC off", "close_shades": "Close shades",
        "open_shades": "Open shades", "unlock_q": "Open {name}?", "toggle_q": "Toggle {name}?",
        "unavailable": "Offline devices", "low_battery": "Low batteries", "updates": "Updates available",
        "open_now": "Open right now", "support": "Support", "system": "System health",
        "ac_off_q": "Turn off every AC in the house?", "lights_off_q": "Turn off every light in the house?",
        "door_station": "Door station", "cctv": "CCTV",
    },
    "ar": {
        "home": "الرئيسية", "lights": "الإضاءة", "climate": "التكييف", "security": "الأمان",
        "cameras": "الكاميرات", "media": "الوسائط", "panel": "لوحة الحائط", "installer": "الفني",
        "access": "الدخول", "favorites": "المفضلة", "scenes": "المشاهد", "rooms": "الغرف",
        "covers": "الستائر", "switches": "المفاتيح والمقابس", "fans": "المراوح",
        "sensors": "الحساسات", "openings": "الأبواب والنوافذ", "motion": "الحركة والتواجد",
        "safety": "السلامة", "alarm": "الإنذار", "appliances": "الأجهزة", "energy": "الطاقة",
        "all_lights_off": "إطفاء كل الإضاءة", "all_ac_off": "إيقاف كل المكيفات", "close_shades": "إغلاق الستائر",
        "open_shades": "فتح الستائر", "unlock_q": "فتح {name}؟", "toggle_q": "تبديل {name}؟",
        "unavailable": "أجهزة غير متصلة", "low_battery": "بطاريات منخفضة", "updates": "تحديثات متاحة",
        "open_now": "مفتوح الآن", "support": "الدعم الفني", "system": "حالة النظام",
        "ac_off_q": "إيقاف جميع المكيفات في المنزل؟", "lights_off_q": "إطفاء جميع الإضاءة في المنزل؟",
        "door_station": "الإنتركم", "cctv": "الكاميرات",
    },
}

ALARM_FEATURES = [(1, "armed_home"), (2, "armed_away"), (4, "armed_night"),
                  (32, "armed_vacation"), (16, "armed_custom_bypass")]


def _slug(s: str) -> str:
    out = "".join(ch if ch.isalnum() else "-" for ch in (s or "").lower()).strip("-")
    while "--" in out:
        out = out.replace("--", "-")
    return out or "room"


class LayoutBuilder:
    def __init__(self, model: Dict[str, Any], project: Dict[str, Any], url_path: str,
                 context: Optional[Dict[str, Any]] = None):
        self.model = model
        self.project = project
        self.url = url_path.strip("/")
        self.ctx = context or {}
        self.t = STRINGS.get(project.get("language", "en"), STRINGS["en"])
        self.theme = theme_name(project.get("theme", "apple_frosted_glass"))
        views_cfg = project.get("views") or {}
        self.views_on = lambda key: views_cfg.get(key, True)

        area_cfg = project.get("areas") or {}
        self.rooms = [a for a in model.get("areas", []) if (area_cfg.get(a["id"]) or {}).get("included", True)]
        self.floors = model.get("floors", [])
        self.house = model.get("house", {})

    # ------------------------------------------------------------------ helpers
    def path(self, view: str) -> str:
        return f"/{self.url}/{view}"

    def room_path(self, room) -> str:
        return self.path(f"room-{_slug(room['id'])}")

    def all(self, group: str) -> List[Dict[str, Any]]:
        out = []
        for r in self.rooms:
            out.extend(r.get(group, []))
        return out

    def ids(self, group: str, domain: str = None) -> List[str]:
        return [e["entity_id"] for e in self.all(group) if not domain or e["domain"] == domain]

    @staticmethod
    def heading(text, icon=None, style="subtitle", nav=None, badges=None):
        card = {"type": "heading", "heading": text, "heading_style": style}
        if icon:
            card["icon"] = icon
        if nav:
            card["tap_action"] = {"action": "navigate", "navigation_path": nav}
        if badges:
            card["badges"] = [{"type": "entity", "entity": b, "show_state": True, "show_icon": True}
                              for b in badges]
        return card

    @staticmethod
    def section(cards, span: int = None):
        sec = {"type": "grid", "cards": cards}
        if span:
            sec["column_span"] = span
        return sec

    def features(self, e: Dict[str, Any], full: bool = False) -> List[Dict[str, Any]]:
        d = e["domain"]
        if d == "light" and e.get("dimmable"):
            feats = [{"type": "light-brightness"}]
            if full and e.get("color_temp"):
                feats.append({"type": "light-color-temp"})
            return feats
        if d == "cover":
            return [{"type": "cover-position" if e.get("position") else "cover-open-close"}]
        if d == "climate":
            feats = [{"type": "target-temperature"}]
            modes = [m for m in e.get("hvac_modes", []) if m]
            if full and modes:
                feats.append({"type": "climate-hvac-modes", "style": "icons", "hvac_modes": modes})
            return feats
        if d == "fan":
            return [{"type": "fan-speed"}]
        if d == "alarm_control_panel":
            sf = e.get("supported_features") or 0
            modes = [m for bit, m in ALARM_FEATURES if sf & bit] + ["disarmed"]
            return [{"type": "alarm-modes", "modes": modes}]
        if d == "vacuum":
            return [{"type": "vacuum-commands", "commands": ["start_pause", "return_home"]}]
        return []

    def tile(self, e: Dict[str, Any], cols: int = 6, full: bool = False, name: str = None,
             features: bool = True) -> Dict[str, Any]:
        card = {"type": "tile", "entity": e["entity_id"], "name": name or e["name"],
                "grid_options": {"columns": cols}}
        if features:
            feats = self.features(e, full)
            if feats:
                card["features"] = feats
                # HA 2025.x places features inline on wide tiles; keep layout predictable
                card["features_position"] = "bottom"
        if e["domain"] in ("scene", "script"):
            card["tap_action"] = {"action": "perform-action", "perform_action": f"{e['domain']}.turn_on",
                                  "target": {"entity_id": e["entity_id"]}}
            card["icon_tap_action"] = card["tap_action"]
        return card

    def access_tile(self, e: Dict[str, Any], cols: int = 6, name: str = None) -> Dict[str, Any]:
        label = name or e["name"]
        d = e["domain"]
        eid = e["entity_id"]
        confirm = {"text": self.t["unlock_q"].format(name=label)}
        if d == "lock":
            action = {"action": "toggle", "confirmation": {"text": self.t["toggle_q"].format(name=label)}}
            feats = [{"type": "lock-commands"}]
        elif d == "cover":
            action = {"action": "more-info"}
            feats = [{"type": "cover-open-close"}]
        elif d == "button":
            action = {"action": "perform-action", "perform_action": "button.press",
                      "target": {"entity_id": eid}, "confirmation": confirm}
            feats = []
        else:  # momentary relay exposed as switch
            action = {"action": "perform-action", "perform_action": "switch.turn_on",
                      "target": {"entity_id": eid}, "confirmation": confirm}
            feats = []
        card = {"type": "tile", "entity": eid, "name": label, "grid_options": {"columns": cols},
                "tap_action": action, "icon_tap_action": action, "hold_action": {"action": "more-info"}}
        if d in ("switch", "button"):
            card["icon"] = "mdi:gate-open" if "gate" in eid or "gate" in label.lower() else "mdi:door-open"
            card["color"] = "green"
        if feats:
            card["features"] = feats
            card["features_position"] = "bottom"
        return card

    def camera(self, e: Dict[str, Any], live: bool, cols: int = 6) -> Dict[str, Any]:
        return {"type": "picture-entity", "entity": e["entity_id"], "name": e["name"],
                "camera_view": "live" if live else "auto", "show_state": False, "show_name": True,
                "grid_options": {"columns": cols}}

    def actions(self, items: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        items = [i for i in items if i]
        if not items:
            return None
        return {"type": "custom:ajnetweb-actions-card", "actions": items, "grid_options": {"columns": 12}}

    def lights_off_action(self):
        light_ids = self.ids("lights", "light")
        switch_ids = self.ids("lights", "switch")
        if not light_ids and not switch_ids:
            return None
        return {"name": self.t["all_lights_off"], "icon": "mdi:lightbulb-group-off",
                "action": "homeassistant.turn_off", "target": {"entity_id": light_ids + switch_ids},
                "confirm": self.t["lights_off_q"]}

    def ac_off_action(self):
        ids = self.ids("climates", "climate")
        if not ids:
            return None
        return {"name": self.t["all_ac_off"], "icon": "mdi:air-conditioner",
                "action": "climate.turn_off", "target": {"entity_id": ids}, "confirm": self.t["ac_off_q"]}

    def shades_actions(self):
        ids = self.ids("covers")
        if not ids:
            return []
        return [
            {"name": self.t["open_shades"], "icon": "mdi:curtains", "action": "cover.open_cover",
             "target": {"entity_id": ids}},
            {"name": self.t["close_shades"], "icon": "mdi:curtains-closed", "action": "cover.close_cover",
             "target": {"entity_id": ids}},
        ]

    def addon_actions(self):
        """Shortcuts to the AJ Netweb Door Station / CCTV studios when those add-ons are installed."""
        out = []
        if self.ctx.get("intercom_path"):
            out.append({"name": self.t["door_station"], "icon": "mdi:doorbell-video",
                        "navigation_path": self.ctx["intercom_path"]})
        if self.ctx.get("cctv_path"):
            out.append({"name": self.t["cctv"], "icon": "mdi:cctv", "navigation_path": self.ctx["cctv_path"]})
        return out

    def weather(self) -> Optional[str]:
        w = self.project.get("weather_entity")
        if w:
            return w
        ws = self.house.get("weather") or []
        return "weather.forecast_home" if "weather.forecast_home" in ws else (ws[0] if ws else None)

    def header_card(self, variant: str = "default") -> Dict[str, Any]:
        lights = self.ids("lights")
        chips = []
        if lights:
            chips.append({"icon": "mdi:lightbulb-on", "entities": lights, "active": ["on"],
                          "label": "lights_on", "navigation_path": self.path("lights"), "color": "amber"})
        climates = self.ids("climates")
        if climates:
            chips.append({"icon": "mdi:air-conditioner", "entities": climates, "inactive": ["off"],
                          "label": "ac_running", "navigation_path": self.path("climate"), "color": "blue"})
        openings = self.ids("openings")
        if openings:
            chips.append({"icon": "mdi:door-open", "entities": openings, "active": ["on"],
                          "label": "open", "navigation_path": self.path("security"), "color": "orange",
                          "ok_label": "all_closed", "ok_icon": "mdi:shield-home"})
        safety = self.ids("safety")
        if safety:
            chips.append({"icon": "mdi:alert", "entities": safety, "active": ["on"],
                          "label": "alerts", "navigation_path": self.path("security"), "color": "red"})
        media = self.ids("media")
        if media:
            chips.append({"icon": "mdi:play-circle", "entities": media, "active": ["playing"],
                          "label": "playing", "navigation_path": self.path("media"), "color": "purple"})
        card = {
            "type": "custom:ajnetweb-header-card",
            "title": self.project.get("title") or "",
            "variant": variant,
            "chips": chips,
            "grid_options": {"columns": "full"},
        }
        if self.weather():
            card["weather"] = self.weather()
        alarms = self.ids("alarms")
        if alarms:
            card["alarm"] = alarms[0]
            card["alarm_navigation_path"] = self.path("security")
        if self.house.get("persons"):
            card["persons"] = self.house["persons"][:6]
        return card

    def area_card(self, room: Dict[str, Any]) -> Dict[str, Any]:
        def ids(g):
            return [e["entity_id"] for e in room.get(g, [])]
        card = {
            "type": "custom:ajnetweb-area-card",
            "area": room["id"],
            "name": room["name"],
            "icon": room["icon"],
            "navigation_path": self.room_path(room),
            "lights": ids("lights"),
            "climates": ids("climates"),
            "covers": ids("covers"),
            "media": ids("media"),
            "openings": ids("openings"),
            "motion": ids("motion"),
            "safety": ids("safety"),
            "grid_options": {"columns": 6},
        }
        if room.get("temperature"):
            card["temperature"] = room["temperature"][0]["entity_id"]
        if room.get("humidity"):
            card["humidity"] = room["humidity"][0]["entity_id"]
        return card

    # ------------------------------------------------------------------ views
    def build(self) -> Dict[str, Any]:
        views = [self.view_home()]
        if self.views_on("panel"):
            views.append(self.view_panel())
        if self.views_on("lights") and self.all("lights"):
            views.append(self.view_lights())
        if self.views_on("climate") and (self.all("climates") or self.all("temperature")):
            views.append(self.view_climate())
        if self.views_on("security") and any(self.all(g) for g in ("access", "alarms", "openings", "motion", "safety")):
            views.append(self.view_security())
        if self.views_on("cameras") and self.all("cameras"):
            views.append(self.view_cameras())
        if self.views_on("media") and self.all("media"):
            views.append(self.view_media())
        if self.views_on("installer"):
            views.append(self.view_installer())
        for room in self.rooms:
            views.append(self.view_room(room))
        for v in views:
            v["theme"] = self.theme
        return {"title": self.project.get("title") or "Smart Home", "views": views}

    def _view(self, title, path, icon, sections, max_columns=4, badges=None, **extra):
        v = {"title": title, "path": path, "icon": icon, "type": "sections",
             "max_columns": max_columns, "dense_section_placement": True, "sections": sections}
        if badges:
            v["badges"] = badges
        v.update(extra)
        return v

    def _home_sections(self, panel: bool) -> List[Dict[str, Any]]:
        t = self.t
        sections = [self.section([self.header_card("panel" if panel else "default")], span=4)]

        # Access + favourites + quick actions
        quick = []
        access = self.all("access")
        if access:
            quick.append(self.heading(t["access"], "mdi:shield-key", nav=self.path("security")))
            quick += [self.access_tile(e, cols=6, name=self._with_room(e)) for e in access[:6]]
        favs = [e for e in self._lookup(self.project.get("favorites") or [])]
        if favs:
            quick.append(self.heading(t["favorites"], "mdi:star"))
            quick += [self.tile(e, cols=6, name=self._with_room(e)) for e in favs[:12]]
        acts = self.actions(self.addon_actions() + [self.lights_off_action(), self.ac_off_action()]
                            + self.shades_actions())
        if acts:
            quick.append(acts)
        scenes = self.all("scenes")
        if scenes:
            quick.append(self.heading(t["scenes"], "mdi:palette"))
            quick += [self.tile(e, cols=6, features=False, name=self._with_room(e)) for e in scenes[:8]]
        if quick:
            sections.append(self.section(quick, span=2 if panel else None))

        # Live cameras get prime space on the wall panel
        cams = self.all("cameras")
        if cams and panel:
            cards = [self.heading(t["cameras"], "mdi:cctv", nav=self.path("cameras"))]
            cards += [self.camera(c, live=self.project.get("panel_live_cameras", True)) for c in cams[:4]]
            sections.append(self.section(cards, span=2))

        # Rooms, grouped by floor when the installer configured floors
        floors = {f["id"]: f for f in self.floors}
        by_floor: Dict[Optional[str], List] = {}
        for r in self.rooms:
            if r["id"] == "unassigned" and not any(r.get(g) for g in ("lights", "climates", "covers", "media", "switches")):
                continue
            by_floor.setdefault(r.get("floor_id") if r.get("floor_id") in floors else None, []).append(r)
        order = [f["id"] for f in self.floors if f["id"] in by_floor] + ([None] if None in by_floor else [])
        for fid in order:
            rooms = by_floor[fid]
            title = floors[fid]["name"] if fid else t["rooms"]
            icon = floors[fid]["icon"] if fid else "mdi:floor-plan"
            cards = [self.heading(title, icon)] + [self.area_card(r) for r in rooms]
            sections.append(self.section(cards, span=2 if len(rooms) > 4 else None))

        climates = self.all("climates")
        if climates:
            cards = [self.heading(t["climate"], "mdi:thermostat", nav=self.path("climate"))]
            cards += [self.tile(e, cols=6, name=self._with_room(e)) for e in climates[:6]]
            sections.append(self.section(cards))

        if cams and not panel:
            cards = [self.heading(t["cameras"], "mdi:cctv", nav=self.path("cameras"))]
            cards += [self.camera(c, live=False) for c in cams[:4]]
            sections.append(self.section(cards))
        return sections

    def _badges(self):
        badges = []
        w = self.weather()
        if w:
            badges.append({"type": "entity", "entity": w, "show_name": False, "show_state": True, "show_icon": True})
        for p in (self.house.get("persons") or [])[:4]:
            badges.append({"type": "entity", "entity": p, "show_name": True, "show_state": False,
                           "show_icon": True, "show_entity_picture": True})
        return badges

    def view_home(self):
        # path "home" kept for links created by older releases
        return self._view(self.t["home"], "home", "mdi:home", self._home_sections(panel=False))

    def view_panel(self):
        return self._view(self.t["panel"], "tablet", "mdi:tablet-dashboard", self._home_sections(panel=True))

    def _per_room(self, groups: List[str], full: bool = False, cols: int = 6) -> List[Dict[str, Any]]:
        sections = []
        for r in self.rooms:
            ents = [e for g in groups for e in r.get(g, [])]
            if not ents:
                continue
            cards = [self.heading(r["name"], r["icon"], nav=self.room_path(r))]
            cards += [self.tile(e, cols=cols, full=full) for e in ents]
            sections.append(self.section(cards))
        return sections

    def view_lights(self):
        sections = []
        acts = self.actions([self.lights_off_action()])
        if acts:
            sections.append(self.section([acts], span=4))
        sections += self._per_room(["lights"])
        return self._view(self.t["lights"], "lights", "mdi:lightbulb-group", sections)

    def view_climate(self):
        sections = []
        acts = self.actions([self.ac_off_action()])
        if acts:
            sections.append(self.section([acts], span=4))
        sections += self._per_room(["climates", "fans"], full=True, cols=12)
        sensors = self._per_room(["temperature", "humidity", "air"], cols=6)
        for s in sensors:
            s["cards"][0]["heading_style"] = "subtitle"
        if sensors:
            sections.append(self.section([self.heading(self.t["sensors"], "mdi:thermometer", style="title")], span=4))
            sections += sensors
        return self._view(self.t["climate"], "climate", "mdi:thermostat", sections)

    def view_security(self):
        t = self.t
        sections = []
        alarms = self.all("alarms")
        if alarms:
            sections.append(self.section([self.heading(t["alarm"], "mdi:shield-home")]
                                         + [self.tile(e, cols=12, name=self._with_room(e)) for e in alarms]))
        access = self.all("access")
        if access:
            sections.append(self.section([self.heading(t["access"], "mdi:shield-key")]
                                         + [self.access_tile(e, cols=6, name=self._with_room(e)) for e in access]))
        openings = self.ids("openings")
        if openings:
            sections.append(self.section([
                {"type": "entity-filter", "entities": openings, "show_empty": False,
                 "conditions": [{"condition": "state", "state": "on"}],
                 "card": {"type": "entities", "title": t["open_now"]}, "grid_options": {"columns": 12}},
            ]))
        for g, title, icon in (("openings", t["openings"], "mdi:door"), ("motion", t["motion"], "mdi:motion-sensor"),
                               ("safety", t["safety"], "mdi:smoke-detector")):
            ents = self.all(g)
            if ents:
                sections.append(self.section([self.heading(title, icon)]
                                             + [self.tile(e, cols=6, name=self._with_room(e)) for e in ents]))
        cams = self.all("cameras")
        if cams:
            sections.append(self.section([self.heading(t["cameras"], "mdi:cctv", nav=self.path("cameras"))]
                                         + [self.camera(c, live=False) for c in cams[:4]], span=2))
        return self._view(t["security"], "security", "mdi:shield-home", sections)

    def view_cameras(self):
        live = self.project.get("cameras_view_live", False)
        cams = self.all("cameras")
        cards = [self.camera(c, live=live, cols=6) for c in cams]
        sections = [self.section(cards, span=4)]
        return self._view(self.t["cameras"], "cameras", "mdi:cctv", sections)

    def view_media(self):
        sections = []
        for r in self.rooms:
            if not r.get("media"):
                continue
            cards = [self.heading(r["name"], r["icon"], nav=self.room_path(r))]
            cards += [{"type": "media-control", "entity": e["entity_id"], "grid_options": {"columns": 12}}
                      for e in r["media"]]
            sections.append(self.section(cards))
        return self._view(self.t["media"], "media", "mdi:speaker-multiple", sections)

    def view_room(self, room):
        t = self.t
        sections = []
        badges = [e["entity_id"] for e in (room.get("temperature", [])[:1] + room.get("humidity", [])[:1])]
        head = [self.heading(room["name"], room["icon"], style="title", badges=badges)]

        def add(title, icon, cards, span=None):
            if cards:
                sections.append(self.section([self.heading(title, icon)] + cards, span))

        sections.append(self.section(head, span=4))
        add(t["access"], "mdi:shield-key", [self.access_tile(e) for e in room["access"]])
        add(t["lights"], "mdi:lightbulb-group", [self.tile(e, full=True) for e in room["lights"]])
        add(t["climate"], "mdi:thermostat",
            [{"type": "thermostat", "entity": e["entity_id"], "name": e["name"], "grid_options": {"columns": 12},
              "features": [f for f in self.features(e, full=True) if f["type"] != "target-temperature"]}
             if e["domain"] == "climate" else self.tile(e, cols=12) for e in room["climates"]]
            + [self.tile(e, cols=12) for e in room["fans"]])
        add(t["covers"], "mdi:curtains", [self.tile(e) for e in room["covers"]])
        add(t["media"], "mdi:speaker",
            [{"type": "media-control", "entity": e["entity_id"], "grid_options": {"columns": 12}}
             for e in room["media"]])
        add(t["cameras"], "mdi:cctv", [self.camera(e, live=False, cols=12) for e in room["cameras"]])
        add(t["scenes"], "mdi:palette", [self.tile(e, features=False) for e in room["scenes"] + room["scripts"]])
        add(t["appliances"], "mdi:power-socket",
            [self.tile(e) for e in room["switches"] + room["vacuums"] + room["valves"] + room["alarms"]])
        add(t["sensors"], "mdi:gauge",
            [self.tile(e, cols=6)
             for e in room["temperature"] + room["humidity"] + room["air"] + room["power"]])
        add(t["security"], "mdi:shield-home",
            [self.tile(e) for e in room["openings"] + room["motion"] + room["safety"]])

        return self._view(room["name"], f"room-{_slug(room['id'])}", room["icon"], sections,
                          max_columns=3, subview=True, back_path=self.path("home"))

    def view_installer(self):
        t = self.t
        b = self.project.get("branding") or {}
        lines = [f"## {b.get('company') or 'AJ Netweb'}"]
        if b.get("phone"):
            lines.append(f"**Phone:** {b['phone']}")
        if b.get("email"):
            lines.append(f"**Email:** {b['email']}")
        if b.get("website"):
            lines.append(f"**Web:** {b['website']}")
        if b.get("notes"):
            lines.append("")
            lines.append(b["notes"])
        lines += ["", "---",
                  "Home Assistant **{{ state_attr('update.home_assistant_core_update', 'installed_version') "
                  "or 'n/a' }}** · {{ states | count }} entities · "
                  "{{ states | selectattr('state', 'eq', 'unavailable') | list | count }} unavailable"]
        sections = [self.section([self.heading(t["support"], "mdi:face-agent"),
                                  {"type": "markdown", "content": "\n\n".join(lines),
                                   "grid_options": {"columns": 12}}])]
        if self.ctx.get("studio_path"):
            sections[0]["cards"].append({
                "type": "button", "name": "Dashboard Studio", "icon": "mdi:view-dashboard-edit",
                "show_state": False, "grid_options": {"columns": 6, "rows": 2},
                "tap_action": {"action": "navigate", "navigation_path": self.ctx["studio_path"]},
            })
        controls = [e for g in ("lights", "climates", "covers", "access", "switches", "fans", "media", "cameras")
                    for e in self.ids(g)]
        if controls:
            sections.append(self.section([
                self.heading(t["unavailable"], "mdi:lan-disconnect"),
                {"type": "entity-filter", "entities": controls, "show_empty": True,
                 "conditions": [{"condition": "state", "state": ["unavailable", "unknown"]}],
                 "card": {"type": "entities"}, "grid_options": {"columns": 12}},
            ]))
        if self.house.get("batteries"):
            sections.append(self.section([
                self.heading(t["low_battery"], "mdi:battery-alert"),
                {"type": "entity-filter", "entities": self.house["batteries"], "show_empty": True,
                 "conditions": [{"condition": "numeric_state", "below": 25}],
                 "card": {"type": "entities"}, "grid_options": {"columns": 12}},
            ]))
        if self.house.get("updates"):
            sections.append(self.section([
                self.heading(t["updates"], "mdi:update"),
                {"type": "entity-filter", "entities": self.house["updates"], "show_empty": True,
                 "conditions": [{"condition": "state", "state": "on"}],
                 "card": {"type": "entities"}, "grid_options": {"columns": 12}},
            ]))
        view = self._view(t["installer"], "installer", "mdi:account-hard-hat", sections, max_columns=3)
        admins = self.ctx.get("admin_user_ids") or []
        if admins:
            view["visible"] = [{"user": uid} for uid in admins]
        return view

    # ------------------------------------------------------------------ misc
    def _lookup(self, entity_ids: List[str]) -> List[Dict[str, Any]]:
        index = {}
        for r in self.rooms:
            for g, ents in r.items():
                if isinstance(ents, list):
                    for e in ents:
                        if isinstance(e, dict) and "entity_id" in e:
                            index[e["entity_id"]] = e
        return [index[i] for i in entity_ids if i in index]

    @staticmethod
    def _with_room(e):
        """Name for lists that mix rooms: the full HA name ('Majlis AC' rather than 'AC')."""
        return e.get("full_name") or e["name"]
