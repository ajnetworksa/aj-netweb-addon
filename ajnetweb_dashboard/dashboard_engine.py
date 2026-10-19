#!/usr/bin/env python3
"""
AJ Netweb Dashboard Engine

Orchestrates discovery -> layout -> deployment. Everything that touches Home
Assistant goes through its public WebSocket API (lovelace/dashboards/*,
lovelace/config/*, lovelace/resources/*) so HA validates and owns the data.

Installer choices live in /data/project.json (persists across add-on updates),
so a dashboard can be regenerated at any time after devices are added without
losing customisations. Before every deploy the previous dashboard config is
backed up to /share/ajnetweb/dashboard_backups/.
"""

import copy
import json
import logging
import os
import re
import shutil
import time
from typing import Any, Dict, List, Optional

import house_modes
from discovery import Discovery
from ha_client import HAClient, HAError, version_tuple
from themes import install_themes, theme_catalog, theme_name, themes_include_status

MIN_HA_VERSION = "2024.11"

log = logging.getLogger("dashboard.engine")

ADDON_VERSION = os.environ.get("ADDON_VERSION", "3.15.0")
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
LOCAL_CARD_SUITE = os.path.join(BASE_DIR, "www", "ajnetweb-card-suite.js")
LOCAL_BLUEPRINTS_DIR = os.path.join(BASE_DIR, "blueprints")
DATA_DIR = os.environ.get("ADDON_DATA_DIR", "/data")
PROJECT_FILE = os.path.join(DATA_DIR, "project.json")
BACKUP_DIR = "/share/ajnetweb/dashboard_backups"
MAX_BACKUPS = 30
RESOURCE_BASE = "/local/ajnetweb/ajnetweb-card-suite.js"

DEFAULT_PROJECT = {
    "schema": 1,
    "title": "Smart Home",
    "url_path": "ajnetweb-home",
    "theme": "apple_frosted_glass",
    "language": "",
    "branding": {"company": "AJ Netweb", "phone": "", "email": "", "website": "", "notes": ""},
    "views": {"panel": True, "lights": True, "climate": True, "security": True,
              "cameras": True, "media": True, "installer": True, "prayer": True},
    "areas": {},
    "excluded_entities": [],
    "favorites": [],
    "weather_entity": None,
    "panel_live_cameras": True,
    "cameras_view_live": False,
    "show_in_sidebar": True,
    "require_admin": False,
    "room_tap": "popup",
    "header_image": "",
    "navbar": True,
    "personal": True,
    "palette": "",
    "wallpaper": False,
    "menu": True,
    "layout": {},              # {"home": {"order": [...], "hidden": [...]}, "panel": {...}}  (Studio "Layout" tab)
    "top_cards": ["weather", "prayer", "media"],
    "insights": ["calendar", "energy", "temperature"],   # "Today at home" band
    "room_order": [],
    "room_style": "tile",
    "cameras": [],             # chosen cameras in order (empty = all)
    "home_cameras": 4,
    "custom_dashboard": "",    # "My cards" dashboard url_path once created
    "house_modes": house_modes.DEFAULTS,   # Home / Away / Night / Guests (Studio "House modes" tab)
    "kiosk": {"hide_header": "none", "hide_sidebar": "none",
              "menu": {"pages": "all", "appearance": "all", "profile": "all", "reload": "all",
                       "settings": "admins", "studio": "admins", "exit_kiosk": "admins"},
              "doorbell": "all"},
}


LAYOUT_BANDS = ("top", "modes", "scenes", "access", "favorites", "rooms", "climate", "insights", "cameras", "custom")
INSIGHTS = ("calendar", "energy", "temperature")


def _clean_layout(layout) -> Optional[Dict[str, Any]]:
    """Keep only known band ids; drop empty parts so the strategy uses its defaults."""
    if not isinstance(layout, dict):
        return None
    out = {}
    for page in ("home", "panel"):
        conf = layout.get(page) if isinstance(layout.get(page), dict) else {}
        order = [b for b in (conf.get("order") or []) if b in LAYOUT_BANDS]
        hidden = [b for b in (conf.get("hidden") or []) if b in LAYOUT_BANDS]
        if order or hidden:
            out[page] = {k: v for k, v in (("order", order), ("hidden", hidden)) if v}
    return out or None


KIOSK_MENU_ITEMS = ("pages", "appearance", "profile", "reload", "settings", "studio", "exit_kiosk")
KIOSK_WORDS = ("all", "admins", "non_admins", "none")


def _kiosk_rule(rule):
    """Studio stores all | admins | non_admins | none | [names]; anything else is dropped."""
    if isinstance(rule, str) and rule in KIOSK_WORDS:
        return rule
    if isinstance(rule, list):
        names = [str(n).strip() for n in rule if str(n).strip()]
        return names or None
    return None


def _kiosk_options(kiosk) -> Optional[Dict[str, Any]]:
    if not isinstance(kiosk, dict):
        return None
    out = {}
    for key in ("hide_header", "hide_sidebar"):
        rule = _kiosk_rule(kiosk.get(key))
        if rule is not None and rule != "none":
            out[key] = rule
    rule = _kiosk_rule(kiosk.get("doorbell"))   # doorbell popup: default everyone
    if rule is not None and rule != "all":
        out["doorbell"] = rule
    menu = {k: r for k, r in ((k, _kiosk_rule((kiosk.get("menu") or {}).get(k))) for k in KIOSK_MENU_ITEMS)
            if r is not None}
    if menu:
        out["menu"] = menu
    return out or None


def normalize_url_path(raw: str) -> str:
    """HA requires dashboard url_path to be lowercase, slug-like and contain a hyphen."""
    url = re.sub(r"[^a-z0-9\-]", "-", (raw or "").strip().lower().replace("_", "-"))
    url = re.sub(r"-{2,}", "-", url).strip("-") or "ajnetweb-home"
    if "-" not in url:
        url = f"{url}-home"
    return url


def _merge(base: Dict, extra: Dict) -> Dict:
    out = copy.deepcopy(base)
    for k, v in (extra or {}).items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _merge(out[k], v)
        else:
            out[k] = v
    return out


class DashboardEngine:
    def __init__(self, supervisor_token: Optional[str] = None):
        self.client = HAClient(supervisor_token)
        self.discovery = Discovery(self.client)

    @property
    def config_dir(self) -> str:
        return self.client.config_dir

    # ------------------------------------------------------------------ project store
    def load_project(self) -> Dict[str, Any]:
        seed = dict(DEFAULT_PROJECT)
        seed["title"] = os.environ.get("DASHBOARD_TITLE") or seed["title"]
        seed["theme"] = os.environ.get("DEFAULT_THEME") or seed["theme"]
        seed["url_path"] = normalize_url_path(os.environ.get("DASHBOARD_URL") or seed["url_path"])
        try:
            with open(PROJECT_FILE, "r", encoding="utf-8") as f:
                return _merge(seed, json.load(f))
        except FileNotFoundError:
            return seed
        except (OSError, ValueError) as e:
            log.warning("project.json unreadable (%s) - using defaults", e)
            return seed

    def save_project(self, changes: Dict[str, Any]) -> Dict[str, Any]:
        project = _merge(self.load_project(), changes or {})
        project["url_path"] = normalize_url_path(project.get("url_path"))
        # lists are replaced, not merged
        for key in ("excluded_entities", "favorites", "room_order", "cameras", "top_cards", "insights"):
            if key in (changes or {}):
                project[key] = list(dict.fromkeys(changes[key] or []))
        os.makedirs(DATA_DIR, exist_ok=True)
        tmp = PROJECT_FILE + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(project, f, indent=2, ensure_ascii=False)
        os.replace(tmp, PROJECT_FILE)
        return project

    # ------------------------------------------------------------------ discovery & generation
    def discover(self, project: Dict[str, Any] = None) -> Dict[str, Any]:
        project = project or self.load_project()
        return self.discovery.run(excluded=project.get("excluded_entities"))

    def discover_raw(self) -> Dict[str, Any]:
        """Discovery without installer exclusions - used by the studio entity picker."""
        return self.discovery.run(excluded=[])

    def _context(self) -> Dict[str, Any]:
        ctx = {"studio_path": self.client.find_addon_panel("ajnetweb_dashboard"),
               "intercom_path": self.client.find_addon_panel("ajnetweb_intercom"),
               "cctv_path": self.client.find_addon_panel("ajnetweb_cctv"),
               "admin_user_ids": []}
        try:
            with self.client.session() as s:
                users = s.try_call("config/auth/list", []) or []
            ctx["admin_user_ids"] = [u["id"] for u in users
                                     if not u.get("system_generated") and u.get("is_active", True)
                                     and (u.get("is_owner") or "system-admin" in (u.get("group_ids") or []))]
        except Exception as e:
            log.debug("Could not list users: %s", e)
        return ctx

    def _music_assistant_entry(self) -> Optional[str]:
        """Music Assistant config entry id, so non-admin users can search/browse too."""
        entries = self.client.rest_get("/core/api/config/config_entries/entry", []) or []
        ma = [e for e in entries if e.get("domain") == "music_assistant"]
        loaded = [e for e in ma if e.get("state") == "loaded"] or ma
        return loaded[0]["entry_id"] if loaded else None

    def generate(self, project: Dict[str, Any] = None, model: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        The dashboard is a *strategy*: Home Assistant runs the AJ Netweb UI kit in the browser and
        builds every view from the current areas/devices. We only store the installer's options,
        so new devices show up without redeploying and the same kit works in any project.
        """
        project = project or self.load_project()
        ctx = self._context()
        hidden = [a for a, v in (project.get("areas") or {}).items() if v and v.get("included") is False]
        shortcuts = []
        if ctx.get("intercom_path"):
            shortcuts.append({"name": "Door station", "icon": "mdi:doorbell-video", "navigation_path": ctx["intercom_path"]})
        if ctx.get("cctv_path"):
            shortcuts.append({"name": "CCTV", "icon": "mdi:cctv", "navigation_path": ctx["cctv_path"]})
        options = {
            "type": "custom:ajnetweb",
            "title": project.get("title") or "Home",
            "theme": theme_name(project.get("theme", "apple_frosted_glass")),
            "language": project.get("language") or None,
            "room_tap": project.get("room_tap") or "popup",
            "header_image": project.get("header_image") or None,
            "exclude_entities": project.get("excluded_entities") or [],
            "hidden_areas": hidden,
            "favorites": project.get("favorites") or [],
            "weather": project.get("weather_entity") or None,
            "views": {k: v for k, v in (project.get("views") or {}).items() if v is False and k != "prayer"},
            "prayer": False if (project.get("views") or {}).get("prayer") is False else None,
            "music_assistant_entry": self._music_assistant_entry(),
            "navbar": project.get("navbar", True),
            "personal": False if project.get("personal") is False else None,
            "palette": project.get("palette") or None,
            "wallpaper": True if project.get("wallpaper") else None,
            "menu": False if project.get("menu") is False else None,
            "layout": _clean_layout(project.get("layout")),
            "top_cards": project.get("top_cards") if isinstance(project.get("top_cards"), list)
                         and project.get("top_cards") != ["weather", "prayer", "media"] else None,
            "insights": [k for k in project["insights"] if k in INSIGHTS]
                        if isinstance(project.get("insights"), list) and project.get("insights") != list(INSIGHTS) else None,
            "room_order": [a for a in (project.get("room_order") or []) if isinstance(a, str)] or None,
            "room_style": "photo" if project.get("room_style") == "photo" else None,
            "cameras": [c for c in (project.get("cameras") or []) if isinstance(c, str) and c.startswith("camera.")] or None,
            "home_cameras": int(project["home_cameras"]) if str(project.get("home_cameras", "")).isdigit()
                            and int(project["home_cameras"]) != 4 else None,
            "custom_dashboard": project.get("custom_dashboard") or None,
            "kiosk": _kiosk_options(project.get("kiosk")),
            # off is stored as false, otherwise the strategy would still show a helper it finds
            "house_modes": house_modes.strategy_option(house_modes.merge_defaults(project.get("house_modes"))) or False,
            "studio_path": ctx.get("studio_path") or None,
            "panel_live_cameras": project.get("panel_live_cameras", True),
            "cameras_live": project.get("cameras_view_live") or None,
            "shortcuts": shortcuts,
            "branding": project.get("branding") or {},
            "admins": ctx.get("admin_user_ids") or [],
        }
        # an empty top row / "Today at home" choice is a choice (show none), not "use the default"
        options = {k: v for k, v in options.items()
                   if v not in (None, [], {}, "") or (k in ("top_cards", "insights") and v == [])}
        return {"strategy": options}

    # ------------------------------------------------------------------ health
    def health(self) -> Dict[str, Any]:
        version = self.client.core_version() if self.client.connected else ""
        checks = []

        def add(key, ok, label, detail=""):
            checks.append({"key": key, "ok": ok, "label": label, "detail": detail})

        add("supervisor", self.client.connected, "Supervisor API", "" if self.client.connected
            else "SUPERVISOR_TOKEN missing")
        if version:
            ok = version_tuple(version) >= version_tuple(MIN_HA_VERSION)
            add("version", ok, f"Home Assistant {version}",
                "" if ok else f"Update Home Assistant to {MIN_HA_VERSION} or newer")
        cfg_ok = os.path.exists(os.path.join(self.config_dir, "configuration.yaml"))
        add("config_dir", cfg_ok, f"Config folder ({self.config_dir})",
            "" if cfg_ok else "Home Assistant config folder is not mounted")
        th = themes_include_status(self.config_dir)
        add("themes", th["ok"], "Themes folder loaded", th["detail"])
        res = self.resource_status()
        add("resource", res.get("ok"), "Card suite resource", res.get("detail", ""))
        return {"version": ADDON_VERSION, "ha_version": version, "min_ha_version": MIN_HA_VERSION,
                "checks": checks, "config_dir": self.config_dir}

    # ------------------------------------------------------------------ card suite resource
    def resource_status(self) -> Dict[str, Any]:
        try:
            with self.client.session() as s:
                items = s.call("lovelace/resources")
        except Exception as e:
            return {"ok": None, "detail": f"Could not read resources ({e})"}
        mine = [i for i in items if (i.get("url") or "").split("?")[0] == RESOURCE_BASE]
        if not mine:
            return {"ok": False, "detail": "Not registered yet - deploy will register it"}
        current = f"{RESOURCE_BASE}?v={ADDON_VERSION}"
        if mine[0].get("url") != current:
            return {"ok": None, "detail": "Registered with an older version - deploy will update it"}
        return {"ok": True, "detail": current}

    def install_card_suite(self) -> Dict[str, Any]:
        """Copy the card suite into <config>/www and register it with a versioned URL."""
        www = os.path.join(self.config_dir, "www", "ajnetweb")
        try:
            os.makedirs(www, exist_ok=True)
            shutil.copy2(LOCAL_CARD_SUITE, os.path.join(www, "ajnetweb-card-suite.js"))
        except OSError as e:
            return {"ok": False, "error": f"Could not copy card suite: {e}"}

        url = f"{RESOURCE_BASE}?v={ADDON_VERSION}"
        try:
            with self.client.session() as s:
                items = s.call("lovelace/resources")
                mine = [i for i in items if (i.get("url") or "").split("?")[0] == RESOURCE_BASE]
                if not mine:
                    s.call("lovelace/resources/create", res_type="module", url=url)
                else:
                    if mine[0].get("url") != url:
                        s.call("lovelace/resources/update", resource_id=mine[0]["id"], res_type="module", url=url)
                    for dup in mine[1:]:
                        s.call("lovelace/resources/delete", resource_id=dup["id"])
            return {"ok": True, "url": url}
        except HAError as e:
            # YAML-mode resources: HA rejects WS edits. Tell the installer exactly what to add.
            return {"ok": False, "error": f"{e}. If resources are managed in YAML add: "
                                          f"url: {url} (type: module)"}
        except Exception as e:
            return {"ok": False, "error": f"Resource registration failed: {e}"}

    def install_themes(self) -> Dict[str, Any]:
        res = install_themes(self.config_dir)
        if res.get("ok"):
            try:
                with self.client.session() as s:
                    s.try_call("call_service", domain="frontend", service="reload_themes", service_data={})
            except Exception:
                pass
        return res

    # ------------------------------------------------------------------ backups
    def _backup_existing(self, s, url_path: str) -> Optional[str]:
        try:
            current = s.call("lovelace/config", url_path=url_path, force=True)
        except HAError:
            return None  # dashboard empty / new
        if not current:
            return None
        try:
            os.makedirs(BACKUP_DIR, exist_ok=True)
            name = f"{url_path}-{time.strftime('%Y%m%d-%H%M%S')}.json"
            with open(os.path.join(BACKUP_DIR, name), "w", encoding="utf-8") as f:
                json.dump({"url_path": url_path, "saved_at": time.time(), "config": current}, f,
                          ensure_ascii=False)
            self._prune_backups()
            return name
        except OSError as e:
            log.warning("Backup failed: %s", e)
            return None

    def _prune_backups(self):
        files = sorted(self.list_backups(), key=lambda b: b["saved_at"], reverse=True)
        for b in files[MAX_BACKUPS:]:
            try:
                os.remove(os.path.join(BACKUP_DIR, b["file"]))
            except OSError:
                pass

    def list_backups(self) -> List[Dict[str, Any]]:
        out = []
        if not os.path.isdir(BACKUP_DIR):
            return out
        for fname in os.listdir(BACKUP_DIR):
            if not fname.endswith(".json"):
                continue
            path = os.path.join(BACKUP_DIR, fname)
            out.append({"file": fname, "saved_at": os.path.getmtime(path),
                        "url_path": fname.rsplit("-", 2)[0], "size": os.path.getsize(path)})
        return sorted(out, key=lambda b: b["saved_at"], reverse=True)

    def restore_backup(self, fname: str) -> Dict[str, Any]:
        if not re.fullmatch(r"[a-z0-9\-]+-\d{8}-\d{6}\.json", fname or ""):
            return {"ok": False, "error": "Invalid backup name"}
        try:
            with open(os.path.join(BACKUP_DIR, fname), "r", encoding="utf-8") as f:
                data = json.load(f)
            with self.client.session() as s:
                self._backup_existing(s, data["url_path"])
                s.call("lovelace/config/save", url_path=data["url_path"], config=data["config"])
            return {"ok": True, "url_path": data["url_path"]}
        except (OSError, ValueError, KeyError, HAError) as e:
            return {"ok": False, "error": str(e)}

    # ------------------------------------------------------------------ deploy
    def deploy(self, overrides: Dict[str, Any] = None) -> Dict[str, Any]:
        project = self.save_project(overrides) if overrides else self.load_project()
        url_path = project["url_path"]
        steps = []

        res = self.install_card_suite()
        steps.append({"step": "Card suite", "ok": res.get("ok"), "detail": res.get("url") or res.get("error")})
        th = self.install_themes()
        steps.append({"step": "Themes", "ok": th.get("ok"), "detail": th.get("path") or th.get("error")})
        bp = self.install_bundled_blueprints()
        steps.append({"step": "Blueprints", "ok": bp.get("ok"), "detail": f"{len(bp.get('installed', []))} installed"})

        modes = house_modes.merge_defaults(project.get("house_modes"))
        if modes["enabled"]:
            hm = self.apply_house_modes(project)
            steps.extend(hm.get("steps", []))

        config = self.generate(project)
        views = [{"title": "Home", "path": "home"}, {"title": "Wall Panel", "path": "tablet"}]
        views = [v for v in views if v["path"] == "home" or (project.get("views") or {}).get("panel", True)]

        try:
            with self.client.session() as s:
                dashboards = s.call("lovelace/dashboards/list") or []
                existing = next((d for d in dashboards if d.get("url_path") == url_path), None)
                meta = {"title": project["title"], "icon": "mdi:home-assistant",
                        "require_admin": bool(project.get("require_admin")),
                        "show_in_sidebar": bool(project.get("show_in_sidebar", True))}
                if existing:
                    s.call("lovelace/dashboards/update", dashboard_id=existing["id"], **meta)
                else:
                    s.call("lovelace/dashboards/create", url_path=url_path, mode="storage", **meta)
                steps.append({"step": "Dashboard registered", "ok": True, "detail": f"/{url_path}"})
                backup = self._backup_existing(s, url_path)
                if backup:
                    steps.append({"step": "Previous version backed up", "ok": True, "detail": backup})
                s.call("lovelace/config/save", url_path=url_path, config=config)
                steps.append({"step": "Dashboard saved", "ok": True,
                              "detail": "live layout (AJ Netweb UI strategy) - updates itself when devices change"})
        except Exception as e:
            log.error("Deploy failed: %s", e)
            return {"ok": False, "error": str(e), "steps": steps}

        return {"ok": True, "url_path": url_path, "title": project["title"], "theme": project["theme"],
                "views": views,
                "steps": steps}

    # ------------------------------------------------------------------ house modes
    def apply_house_modes(self, project: Dict[str, Any] = None) -> Dict[str, Any]:
        project = project or self.load_project()
        cfg = house_modes.merge_defaults(project.get("house_modes"))
        if not cfg["enabled"]:
            return {"ok": False, "error": "Turn house modes on first", "steps": []}
        model = self.discover(project)
        if model.get("errors"):
            return {"ok": False, "error": "; ".join(model["errors"]), "steps": []}
        return house_modes.apply(self.client, cfg, model)

    def house_modes_info(self) -> Dict[str, Any]:
        """Studio tab: what Apply would do, the helper's current state and the Alexa bridge."""
        project = self.load_project()
        cfg = house_modes.merge_defaults(project.get("house_modes"))
        plan = house_modes.plan(cfg, self.discover(project))
        st = self.client.rest_get(f"/core/api/states/{house_modes.HELPER_ENTITY}", None)
        return {"ok": True, "config": cfg, "targets": {k: len(v) for k, v in plan["targets"].items()},
                "current": st.get("state") if isinstance(st, dict) else None,
                "alexa": house_modes.alexa_label(self.client) if self.client.connected else {"installed": False}}

    # ------------------------------------------------------------------ rooms: rename / photo (no HA settings needed)
    def room_update(self, area_id: str, name: str = None, photo: str = None) -> Dict[str, Any]:
        if not re.fullmatch(r"[a-z0-9_]{1,64}", area_id or ""):
            return {"ok": False, "error": "invalid room"}
        fields = {}
        if name is not None:
            name = str(name).strip()
            if not 1 <= len(name) <= 60:
                return {"ok": False, "error": "Room name must be 1-60 characters"}
            fields["name"] = name
        if photo:
            import base64
            try:
                data = base64.b64decode(photo.split(",", 1)[-1], validate=False)
            except ValueError:
                return {"ok": False, "error": "invalid image"}
            if len(data) > 8 * 1024 * 1024 or not data.startswith(b"\xff\xd8"):
                return {"ok": False, "error": "Photo must be a JPEG under 8 MB"}
            folder = os.path.join(self.config_dir, "www", "ajnetweb", "rooms")
            os.makedirs(folder, exist_ok=True)
            with open(os.path.join(folder, f"{area_id}.jpg"), "wb") as f:
                f.write(data)
            fields["picture"] = f"/local/ajnetweb/rooms/{area_id}.jpg?v={int(time.time())}"
        if not fields:
            return {"ok": False, "error": "nothing to change"}
        try:
            with self.client.session() as s:
                s.call("config/area_registry/update", area_id=area_id, **fields)
        except Exception as e:
            log.error("Room update failed: %s", e)
            return {"ok": False, "error": str(e)}
        return {"ok": True, **fields}

    # ------------------------------------------------------------------ "My cards"
    MY_CARDS_URL = "ajnetweb-cards"

    def my_cards(self) -> Dict[str, Any]:
        """
        Create (once) a normal HA dashboard that the installer edits with HA's own visual editor. Its first
        view is merged into Home / Wall Panel, its other views become extra pages of the AJ Netweb dashboard.
        Hidden from the sidebar, readable by every user (the strategy reads it for each person).
        """
        url = self.MY_CARDS_URL
        try:
            with self.client.session() as s:
                dashboards = s.call("lovelace/dashboards/list") or []
                if not any(d.get("url_path") == url for d in dashboards):
                    s.call("lovelace/dashboards/create", url_path=url, mode="storage", title="AJ Netweb - My cards",
                           icon="mdi:card-plus-outline", require_admin=False, show_in_sidebar=False)
                try:
                    current = s.call("lovelace/config", url_path=url, force=True)
                except Exception:  # noqa: BLE001 - a new dashboard has no config yet
                    current = None
                if not current or not current.get("views"):
                    s.call("lovelace/config/save", url_path=url, config={"views": [
                        {"title": "On Home", "path": "home", "type": "sections", "max_columns": 4, "sections": [
                            {"type": "grid", "column_span": 4, "cards": [
                                {"type": "heading", "heading": "My cards"},
                                {"type": "markdown", "content":
                                    "Cards on this page appear on the AJ Netweb **Home** and **Wall Panel** "
                                    "(Studio → Layout decides where). Add more pages here with **+** - they "
                                    "become extra pages of the AJ Netweb dashboard. Delete this note when done."}]}]}]})
        except Exception as e:
            log.error("My cards dashboard: %s", e)
            return {"ok": False, "error": str(e)}
        project = self.save_project({"custom_dashboard": url})
        return {"ok": True, "url_path": url, "edit_url": f"/{url}/home?edit=1", "project": project}

    # ------------------------------------------------------------------ blueprints
    def install_bundled_blueprints(self) -> Dict[str, Any]:
        target = os.path.join(self.config_dir, "blueprints", "automation", "ajnetweb")
        installed = []
        try:
            os.makedirs(target, exist_ok=True)
            for fname in sorted(os.listdir(LOCAL_BLUEPRINTS_DIR)):
                if fname.endswith((".yaml", ".yml")):
                    shutil.copy2(os.path.join(LOCAL_BLUEPRINTS_DIR, fname), os.path.join(target, fname))
                    installed.append(fname)
            return {"ok": True, "installed": installed}
        except OSError as e:
            log.error("Failed to install blueprints: %s", e)
            return {"ok": False, "error": str(e), "installed": installed}

    def list_blueprints(self) -> List[Dict[str, Any]]:
        target = os.path.join(self.config_dir, "blueprints", "automation", "ajnetweb")
        meta = {
            "ac_precool_on_arrival.yaml": ("AC Pre-Cooling on Arrival", "Starts the AC when someone is on the way home, so the villa is cool when they arrive."),
            "adhan_smart_mute.yaml": ("Adhan & Smart Media Mute (legacy)", "Simple media pause at prayer times. For adhan playback use the Prayer & Adhan add-on."),
            "balcony_ac_protector.yaml": ("Balcony Door AC Protector", "Turns the AC off when a balcony door stays open."),
            "water_tank_watchdog.yaml": ("Water Tank & Pump Watchdog", "Low-tank alerts and pump dry-run protection."),
        }
        out = []
        for fname in sorted(os.listdir(LOCAL_BLUEPRINTS_DIR)):
            if fname.endswith((".yaml", ".yml")):
                name, desc = meta.get(fname, (fname.rsplit(".", 1)[0].replace("_", " ").title(), ""))
                out.append({"filename": fname, "name": name, "description": desc,
                            "installed": os.path.exists(os.path.join(target, fname))})
        return out

    @staticmethod
    def themes() -> List[Dict[str, Any]]:
        return theme_catalog()
