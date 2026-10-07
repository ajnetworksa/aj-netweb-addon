#!/usr/bin/env python3
"""
AJ Netweb Dashboard Engine
Room & Device Auto-Discovery, Entity Categorizer, and 5 Curated Theme Generators.
Generates native-first Lovelace dashboards with bundled ajnetweb-card-suite.js (Zero HACS dependencies).
"""

import json
import logging
import os
import re
import shutil
import time
from typing import Dict, List, Any, Optional

try:
    import requests
except ImportError:
    requests = None

log = logging.getLogger("dashboard.engine")

CONFIG_DIR = "/config"
STORAGE_DIR = "/config/.storage"
HA_WWW_DIR = "/config/www/ajnetweb"
LOCAL_CARD_SUITE = os.path.join(os.path.dirname(__file__), "www", "ajnetweb-card-suite.js")


class DashboardEngine:
    def __init__(self, supervisor_token: Optional[str] = None):
        self.token = supervisor_token or os.environ.get("SUPERVISOR_TOKEN", "")
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json",
        }
        self.sup_url = "http://supervisor"

    def _call_ws(self, command: str, extra_params: dict = None) -> Any:
        """Call Home Assistant WebSocket API to query registries."""
        if not self.token:
            return None
        try:
            import websocket
            ws = websocket.create_connection("ws://supervisor/core/websocket", timeout=8)
            # 1. Auth required
            raw = ws.recv()
            init_msg = json.loads(raw)
            if init_msg.get("type") == "auth_required":
                ws.send(json.dumps({"type": "auth", "access_token": self.token}))
                auth_resp = json.loads(ws.recv())
                if auth_resp.get("type") != "auth_ok":
                    ws.close()
                    return None

            msg = {"id": 1, "type": command}
            if extra_params:
                msg.update(extra_params)
            ws.send(json.dumps(msg))
            resp = json.loads(ws.recv())
            ws.close()
            if resp.get("success"):
                return resp.get("result")
        except Exception as e:
            log.debug("WebSocket query failed (%s): %s", command, e)
        return None

    def _get_rest(self, endpoint: str) -> Any:
        """Call Home Assistant Core REST API."""
        if not self.token or not requests:
            return None
        try:
            r = requests.get(f"{self.sup_url}/core/api{endpoint}", headers=self.headers, timeout=8)
            if r.status_code == 200:
                return r.json()
        except Exception as e:
            log.debug("REST query failed (%s): %s", endpoint, e)
        return None

    def discover_house_layout(self) -> Dict[str, Any]:
        """
        Discovers all Areas (Rooms), Devices, and Entities in Home Assistant.
        Categorizes entities by room and device class.
        """
        log.info("Running House & Room Auto-Discovery...")

        # 1. Fetch registries via WebSocket
        areas_raw = self._call_ws("config/area_registry/list") or []
        devices_raw = self._call_ws("config/device_registry/list") or []
        entities_raw = self._call_ws("config/entity_registry/list") or []
        states_raw = self._get_rest("/states") or []

        states_map = {s["entity_id"]: s for s in states_raw if isinstance(s, dict)}

        # Build Device ID -> Area ID map
        dev_to_area = {}
        for dev in devices_raw:
            dev_id = dev.get("id")
            area_id = dev.get("area_id")
            if dev_id and area_id:
                dev_to_area[dev_id] = area_id

        # Build Entity ID -> Area ID map
        ent_to_area = {}
        for ent in entities_raw:
            ent_id = ent.get("entity_id")
            # Direct area assigned to entity
            area_id = ent.get("area_id")
            # If not directly set, inherit from parent device
            if not area_id and ent.get("device_id"):
                area_id = dev_to_area.get(ent.get("device_id"))
            if ent_id and area_id:
                ent_to_area[ent_id] = area_id

        # Initialize Areas dictionary
        areas_dict: Dict[str, Dict[str, Any]] = {}
        for a in areas_raw:
            a_id = a.get("area_id")
            if a_id:
                areas_dict[a_id] = {
                    "id": a_id,
                    "name": a.get("name") or a_id.replace("_", " ").title(),
                    "icon": a.get("icon") or self._guess_room_icon(a.get("name") or a_id),
                    "picture": a.get("picture"),
                    "lights": [],
                    "climates": [],
                    "covers": [],
                    "media": [],
                    "locks": [],
                    "cameras": [],
                    "sensors": [],
                    "binary_sensors": [],
                    "switches": [],
                    "total_devices": 0,
                }

        # Fallback Area for unassigned entities
        areas_dict["unassigned"] = {
            "id": "unassigned",
            "name": "General & Other",
            "icon": "mdi:home-variant-outline",
            "picture": None,
            "lights": [],
            "climates": [],
            "covers": [],
            "media": [],
            "locks": [],
            "cameras": [],
            "sensors": [],
            "binary_sensors": [],
            "switches": [],
            "total_devices": 0,
        }

        # Categorize all active states
        for ent_id, st in states_map.items():
            if not isinstance(st, dict):
                continue
            attrs = st.get("attributes") or {}
            domain = ent_id.split(".")[0]
            name = attrs.get("friendly_name") or ent_id

            # Find matching area
            area_id = ent_to_area.get(ent_id)
            if not area_id:
                # Heuristic guess from name (e.g. "Living Room Chandelier" -> "living_room")
                guessed_area = self._guess_area_from_name(name, list(areas_dict.keys()))
                area_id = guessed_area or "unassigned"

            if area_id not in areas_dict:
                areas_dict[area_id] = {
                    "id": area_id,
                    "name": area_id.replace("_", " ").title(),
                    "icon": self._guess_room_icon(area_id),
                    "picture": None,
                    "lights": [], "climates": [], "covers": [], "media": [],
                    "locks": [], "cameras": [], "sensors": [], "binary_sensors": [],
                    "switches": [], "total_devices": 0,
                }

            area = areas_dict[area_id]
            entity_entry = {
                "entity_id": ent_id,
                "name": name,
                "domain": domain,
                "state": st.get("state"),
                "device_class": attrs.get("device_class"),
                "unit": attrs.get("unit_of_measurement"),
                "icon": attrs.get("icon"),
            }

            if domain == "light":
                area["lights"].append(entity_entry)
            elif domain == "climate":
                area["climates"].append(entity_entry)
            elif domain == "cover":
                area["covers"].append(entity_entry)
            elif domain == "media_player":
                area["media"].append(entity_entry)
            elif domain == "lock":
                area["locks"].append(entity_entry)
            elif domain == "camera":
                area["cameras"].append(entity_entry)
            elif domain == "sensor" and attrs.get("device_class") in ("temperature", "humidity", "power", "energy", "illuminance", "battery"):
                area["sensors"].append(entity_entry)
            elif domain == "binary_sensor" and attrs.get("device_class") in ("motion", "occupancy", "door", "window", "garage_door", "smoke", "gas"):
                area["binary_sensors"].append(entity_entry)
            elif domain == "switch":
                # If name suggests lighting, treat as light
                if any(w in name.lower() for w in ("light", "lamp", "spot", "led", "chandelier", "sconce")):
                    area["lights"].append(entity_entry)
                else:
                    area["switches"].append(entity_entry)

        # Count total devices per area
        for a in areas_dict.values():
            a["total_devices"] = (len(a["lights"]) + len(a["climates"]) + len(a["covers"])
                                  + len(a["media"]) + len(a["locks"]) + len(a["cameras"]))

        # Filter out empty areas
        active_areas = [a for a in areas_dict.values() if a["total_devices"] > 0 or a["id"] != "unassigned"]
        # Sort areas logically (Entrance, Living Room, Bedrooms, Kitchen, Majlis, Garden)
        active_areas.sort(key=lambda x: (x["id"] == "unassigned", -x["total_devices"]))

        total_lights = sum(len(a["lights"]) for a in active_areas)
        total_climates = sum(len(a["climates"]) for a in active_areas)
        total_covers = sum(len(a["covers"]) for a in active_areas)
        total_cameras = sum(len(a["cameras"]) for a in active_areas)
        total_locks = sum(len(a["locks"]) for a in active_areas)

        summary = {
            "areas_count": len(active_areas),
            "lights_count": total_lights,
            "climates_count": total_climates,
            "covers_count": total_covers,
            "cameras_count": total_cameras,
            "locks_count": total_locks,
            "areas": active_areas,
        }

        log.info("Auto-Discovery complete: found %s rooms, %s lights, %s ACs, %s cameras.",
                 len(active_areas), total_lights, total_climates, total_cameras)
        return summary

    def _guess_room_icon(self, name: str) -> str:
        name_lower = name.lower()
        if "living" in name_lower or "salon" in name_lower:
            return "mdi:sofa"
        if "bed" in name_lower:
            return "mdi:bed"
        if "kitchen" in name_lower:
            return "mdi:silverware-fork-knife"
        if "bath" in name_lower or "wc" in name_lower or "toilet" in name_lower:
            return "mdi:shower"
        if "majlis" in name_lower or "guest" in name_lower:
            return "mdi:account-group"
        if "garden" in name_lower or "yard" in name_lower or "patio" in name_lower:
            return "mdi:flower"
        if "corridor" in name_lower or "hall" in name_lower:
            return "mdi:transit-connection-variant"
        if "entrance" in name_lower or "entry" in name_lower or "gate" in name_lower:
            return "mdi:door"
        if "office" in name_lower or "study" in name_lower:
            return "mdi:desk"
        if "garage" in name_lower or "parking" in name_lower:
            return "mdi:garage"
        if "balcony" in name_lower or "terrace" in name_lower:
            return "mdi:balcony"
        return "mdi:door"

    def _guess_area_from_name(self, friendly_name: str, area_ids: List[str]) -> Optional[str]:
        fn_clean = friendly_name.lower().replace(" ", "_")
        for aid in area_ids:
            if aid != "unassigned" and (aid in fn_clean or fn_clean in aid):
                return aid
        return None

    # ------------------------------------------------------------------ Theme Generator Engine
    def generate_dashboard(self, theme_key: str, title: str, areas: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Generates a complete, native-first Lovelace Dashboard structure for the specified theme.
        Supported themes:
        1. 'cyber_luxury' (Cyber Glassmorphism)
        2. 'scandinavian_minimal' (Minimalist Scandinavian)
        3. 'modern_bento' (Modern Bento Grid / Apple Home)
        4. 'oled_stealth' (Pure OLED Stealth)
        5. 'hotel_suite' (Boutique Hotel Hub)
        """
        theme_generators = {
            "cyber_luxury": self._gen_cyber_luxury,
            "scandinavian_minimal": self._gen_scandinavian_minimal,
            "modern_bento": self._gen_modern_bento,
            "oled_stealth": self._gen_oled_stealth,
            "hotel_suite": self._gen_hotel_suite,
        }

        gen = theme_generators.get(theme_key, self._gen_cyber_luxury)
        return gen(title, areas)

    def _gen_cyber_luxury(self, title: str, areas: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Cyber Luxury Glassmorphism Theme (Dark obsidian, cyan glow, neon cards)."""
        views = []

        # 1. Main Residence Hub (Sections View)
        sections = []

        # Header Section: Welcome, Quick Scenes & Weather Badges
        sections.append({
            "type": "grid",
            "cards": [
                {
                    "type": "custom:ajnetweb-room-card",
                    "title": title or "Cyber Residence",
                    "subtitle": "⚡ High-Performance Automation Hub",
                    "badge_text": "All Systems Normal",
                    "preset": "cyber",
                },
                {
                    "type": "custom:ajnetweb-quick-scenes",
                    "preset": "cyber",
                    "scenes": [
                        {"name": "Welcome Home", "icon": "mdi:home", "action": "scene.welcome_home"},
                        {"name": "Cinema Movie", "icon": "mdi:filmstrip", "action": "scene.cinema"},
                        {"name": "Relax Ambient", "icon": "mdi:weather-night", "action": "scene.relax"},
                        {"name": "All Off / Sleep", "icon": "mdi:power", "action": "scene.goodnight"},
                    ],
                },
            ],
        })

        # Room Sections
        for a in areas:
            if a["total_devices"] == 0:
                continue
            room_cards = []
            # Room Title Tile
            room_cards.append({
                "type": "heading",
                "heading": a["name"],
                "icon": a["icon"],
                "badges": [
                    {"type": "entity", "entity": a["climates"][0]["entity_id"]} if a["climates"] else None,
                ],
            })
            room_cards = [c for c in room_cards if c]

            # Lights (Native Tile with Brightness slider feature)
            for lt in a["lights"]:
                room_cards.append({
                    "type": "tile",
                    "entity": lt["entity_id"],
                    "name": lt["name"],
                    "icon": "mdi:lightbulb",
                    "color": "cyan",
                    "features": [
                        {"type": "light-brightness"},
                    ],
                })

            # Climates (Native Tile + HVAC modes)
            for cl in a["climates"]:
                room_cards.append({
                    "type": "tile",
                    "entity": cl["entity_id"],
                    "name": cl["name"],
                    "color": "cyan",
                    "features": [
                        {"type": "climate-hvac-modes", "hvac_modes": ["cool", "fan_only", "off"]},
                    ],
                })

            # Covers
            for cv in a["covers"]:
                room_cards.append({
                    "type": "tile",
                    "entity": cv["entity_id"],
                    "name": cv["name"],
                    "color": "cyan",
                    "features": [
                        {"type": "cover-open-close"},
                    ],
                })

            # Media
            for md in a["media"]:
                room_cards.append({
                    "type": "media-control",
                    "entity": md["entity_id"],
                })

            # Cameras
            for cm in a["cameras"]:
                room_cards.append({
                    "type": "picture-entity",
                    "entity": cm["entity_id"],
                    "camera_view": "live",
                    "show_state": True,
                })

            # Locks
            for lk in a["locks"]:
                room_cards.append({
                    "type": "tile",
                    "entity": lk["entity_id"],
                    "name": lk["name"],
                    "color": "purple",
                })

            sections.append({
                "type": "grid",
                "cards": room_cards,
            })

        views.append({
            "title": "Home",
            "path": "home",
            "icon": "mdi:home-lightning-bolt",
            "type": "sections",
            "max_columns": 3,
            "sections": sections,
        })

        return {
            "title": title or "AJ Netweb Cyber Luxury",
            "views": views,
        }

    def _gen_scandinavian_minimal(self, title: str, areas: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Minimalist Scandinavian Theme (Ample whitespace, clean typography, neutral tones)."""
        sections = []

        sections.append({
            "type": "grid",
            "cards": [
                {
                    "type": "custom:ajnetweb-room-card",
                    "title": title or "Residence",
                    "subtitle": "Warm Scandinavian Minimal",
                    "badge_text": "Balanced Climate",
                    "preset": "minimal",
                },
            ],
        })

        for a in areas:
            if a["total_devices"] == 0:
                continue
            cards = [{
                "type": "heading",
                "heading": a["name"],
                "icon": a["icon"],
            }]
            for lt in a["lights"]:
                cards.append({"type": "tile", "entity": lt["entity_id"], "name": lt["name"], "color": "amber"})
            for cl in a["climates"]:
                cards.append({"type": "tile", "entity": cl["entity_id"], "name": cl["name"], "color": "amber"})
            for cv in a["covers"]:
                cards.append({"type": "tile", "entity": cv["entity_id"], "name": cv["name"]})

            sections.append({"type": "grid", "cards": cards})

        return {
            "title": title or "AJ Netweb Scandinavian",
            "views": [{
                "title": "Overview",
                "path": "home",
                "icon": "mdi:feather",
                "type": "sections",
                "sections": sections,
            }],
        }

    def _gen_modern_bento(self, title: str, areas: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Modern Bento Grid (Apple Home / iOS dynamic status cards)."""
        sections = []

        sections.append({
            "type": "grid",
            "cards": [
                {
                    "type": "custom:ajnetweb-room-card",
                    "title": title or "My Home",
                    "subtitle": "Apple Home Bento Layout",
                    "badge_text": "All Rooms Active",
                    "preset": "bento",
                },
                {
                    "type": "custom:ajnetweb-quick-scenes",
                    "preset": "bento",
                    "scenes": [
                        {"name": "Morning", "icon": "mdi:weather-sunny", "action": "scene.morning"},
                        {"name": "Day", "icon": "mdi:sun-wireless", "action": "scene.day"},
                        {"name": "Night", "icon": "mdi:moon-waning-crescent", "action": "scene.night"},
                    ],
                },
            ],
        })

        for a in areas:
            if a["total_devices"] == 0:
                continue
            cards = [{
                "type": "heading",
                "heading": a["name"],
                "icon": a["icon"],
            }]
            for lt in a["lights"]:
                cards.append({
                    "type": "tile",
                    "entity": lt["entity_id"],
                    "name": lt["name"],
                    "color": "amber",
                    "features": [{"type": "light-brightness"}],
                })
            for cl in a["climates"]:
                cards.append({
                    "type": "tile",
                    "entity": cl["entity_id"],
                    "name": cl["name"],
                    "color": "blue",
                    "features": [{"type": "climate-hvac-modes", "hvac_modes": ["cool", "heat", "off"]}],
                })
            for cv in a["covers"]:
                cards.append({"type": "tile", "entity": cv["entity_id"], "name": cv["name"]})

            sections.append({"type": "grid", "cards": cards})

        return {
            "title": title or "AJ Netweb Modern Bento",
            "views": [{
                "title": "Bento Home",
                "path": "home",
                "icon": "mdi:view-grid",
                "type": "sections",
                "sections": sections,
            }],
        }

    def _gen_oled_stealth(self, title: str, areas: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Pure OLED Stealth Theme (Pitch black #000000 background, zero burn-in, crisp vibrant accents)."""
        sections = []

        sections.append({
            "type": "grid",
            "cards": [
                {
                    "type": "custom:ajnetweb-room-card",
                    "title": title or "OLED Wall Terminal",
                    "subtitle": "Ultra-Low Power OLED Interface",
                    "badge_text": "Battery Optimized",
                    "preset": "oled",
                },
            ],
        })

        for a in areas:
            if a["total_devices"] == 0:
                continue
            cards = [{
                "type": "heading",
                "heading": a["name"],
                "icon": a["icon"],
            }]
            for lt in a["lights"]:
                cards.append({"type": "tile", "entity": lt["entity_id"], "name": lt["name"], "color": "green"})
            for cl in a["climates"]:
                cards.append({"type": "tile", "entity": cl["entity_id"], "name": cl["name"], "color": "cyan"})
            for lk in a["locks"]:
                cards.append({"type": "tile", "entity": lk["entity_id"], "name": lk["name"], "color": "red"})

            sections.append({"type": "grid", "cards": cards})

        return {
            "title": title or "AJ Netweb OLED Stealth",
            "views": [{
                "title": "Stealth Console",
                "path": "home",
                "icon": "mdi:power-sleep",
                "type": "sections",
                "sections": sections,
            }],
        }

    def _gen_hotel_suite(self, title: str, areas: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Boutique Hotel Hub Theme (Hospitality concierge, prominent suite scenes, room tabs)."""
        views = []

        # Suite Overview
        overview_sections = [
            {
                "type": "grid",
                "cards": [
                    {
                        "type": "custom:ajnetweb-room-card",
                        "title": title or "Presidential Suite",
                        "subtitle": "AJ Netweb Hospitality Suite Hub",
                        "badge_text": "Concierge Active",
                        "preset": "hotel",
                    },
                    {
                        "type": "custom:ajnetweb-quick-scenes",
                        "preset": "hotel",
                        "scenes": [
                            {"name": "Welcome / Check-In", "icon": "mdi:key-wireless", "action": "scene.welcome"},
                            {"name": "Do Not Disturb", "icon": "mdi:bell-cancel", "action": "scene.dnd"},
                            {"name": "Make Up Room", "icon": "mdi:broom", "action": "scene.clean"},
                            {"name": "Master Night", "icon": "mdi:sleep", "action": "scene.night"},
                        ],
                    },
                ],
            }
        ]

        for a in areas:
            if a["total_devices"] == 0:
                continue
            room_cards = [{
                "type": "heading",
                "heading": a["name"],
                "icon": a["icon"],
            }]
            for lt in a["lights"][:4]:
                room_cards.append({"type": "tile", "entity": lt["entity_id"], "name": lt["name"], "color": "amber"})
            for cl in a["climates"][:2]:
                room_cards.append({"type": "tile", "entity": cl["entity_id"], "name": cl["name"], "color": "cyan"})

            overview_sections.append({"type": "grid", "cards": room_cards})

        views.append({
            "title": "Suite Hub",
            "path": "suite",
            "icon": "mdi:hotel",
            "type": "sections",
            "sections": overview_sections,
        })

        return {
            "title": title or "AJ Netweb Boutique Hotel",
            "views": views,
        }

    # ------------------------------------------------------------------ Deployment Engine
    def install_bundled_resources(self) -> bool:
        """
        Copies ajnetweb-card-suite.js into /config/www/ajnetweb/
        and registers the resource in Home Assistant.
        Zero HACS dependency!
        """
        try:
            os.makedirs(HA_WWW_DIR, exist_ok=True)
            target_js = os.path.join(HA_WWW_DIR, "ajnetweb-card-suite.js")
            if os.path.exists(LOCAL_CARD_SUITE):
                shutil.copy2(LOCAL_CARD_SUITE, target_js)
                log.info("Copied ajnetweb-card-suite.js to %s", target_js)

            # Register in lovelace_resources if available
            res_file = os.path.join(STORAGE_DIR, "lovelace_resources")
            url = "/local/ajnetweb/ajnetweb-card-suite.js"
            if os.path.exists(res_file):
                try:
                    with open(res_file, "r") as f:
                        res_data = json.load(f)
                    items = res_data.get("data", {}).get("items", [])
                    if not any(i.get("url") == url for i in items):
                        items.append({"id": f"ajnetweb_card_{int(time.time())}", "type": "module", "url": url})
                        res_data["data"]["items"] = items
                        with open(res_file, "w") as f:
                            json.dump(res_data, f, indent=2)
                        log.info("Registered %s in lovelace_resources", url)
                except Exception as e:
                    log.warning("Could not patch lovelace_resources: %s", e)
            return True
        except Exception as e:
            log.error("Failed to install card suite resource: %s", e)
            return False

    def deploy_to_homeassistant(self, theme_key: str, dashboard_url: str,
                                title: str, selected_areas: List[str] = None) -> Dict[str, Any]:
        """
        1-Click deployment:
        1. Generates the selected theme config.
        2. Installs bundled ajnetweb-card-suite.js.
        3. Registers the dashboard in Home Assistant storage or default view.
        """
        # Ensure card suite is installed
        self.install_bundled_resources()

        # Discover layout
        layout = self.discover_house_layout()
        all_areas = layout["areas"]
        if selected_areas:
            active_areas = [a for a in all_areas if a["id"] in selected_areas]
        else:
            active_areas = all_areas

        dashboard_cfg = self.generate_dashboard(theme_key, title, active_areas)

        clean_url = re.sub(r"[^a-zA-Z0-9_\-]", "", dashboard_url.strip().lower()) or "ajnetweb"

        # Write Lovelace configuration directly to .storage/lovelace.{url}
        storage_file = os.path.join(STORAGE_DIR, f"lovelace.{clean_url}")
        storage_payload = {
            "version": 1,
            "minor_version": 1,
            "key": f"lovelace.{clean_url}",
            "data": {
                "config": dashboard_cfg,
            },
        }

        try:
            os.makedirs(STORAGE_DIR, exist_ok=True)
            with open(storage_file, "w", encoding="utf-8") as f:
                json.dump(storage_payload, f, indent=2)
            log.info("Successfully wrote dashboard configuration to %s", storage_file)
        except Exception as e:
            log.error("Failed to write to %s: %s", storage_file, e)
            return {"ok": False, "error": str(e)}

        # Register dashboard entry in .storage/lovelace_dashboards
        dash_index_file = os.path.join(STORAGE_DIR, "lovelace_dashboards")
        try:
            if os.path.exists(dash_index_file):
                with open(dash_index_file, "r") as f:
                    dash_data = json.load(f)
            else:
                dash_data = {"version": 1, "minor_version": 1, "key": "lovelace_dashboards", "data": {"items": []}}

            items = dash_data.get("data", {}).get("items", [])
            # Update or append
            found = False
            for itm in items:
                if itm.get("url_path") == clean_url:
                    itm["title"] = title
                    itm["mode"] = "storage"
                    itm["icon"] = "mdi:view-dashboard-variant"
                    found = True
                    break
            if not found:
                items.append({
                    "id": f"dash_{clean_url}_{int(time.time())}",
                    "url_path": clean_url,
                    "title": title,
                    "icon": "mdi:view-dashboard-variant",
                    "mode": "storage",
                    "show_in_sidebar": True,
                    "require_admin": False,
                })
            dash_data["data"]["items"] = items

            with open(dash_index_file, "w", encoding="utf-8") as f:
                json.dump(dash_data, f, indent=2)
            log.info("Registered dashboard '%s' in lovelace_dashboards", clean_url)
        except Exception as e:
            log.warning("Could not update lovelace_dashboards registry: %s", e)

        return {
            "ok": True,
            "url_path": clean_url,
            "title": title,
            "theme": theme_key,
            "dashboard_url": f"/{clean_url}",
            "message": f"Dashboard '{title}' deployed successfully at /{clean_url}!",
        }
