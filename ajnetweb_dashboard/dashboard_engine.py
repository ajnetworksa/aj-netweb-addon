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
HA_BLUEPRINTS_DIR = "/config/blueprints/automation/ajnetweb"
LOCAL_BLUEPRINTS_DIR = os.path.join(os.path.dirname(__file__), "blueprints")


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

    def _is_noise_entity(self, ent_id: str, name: str) -> bool:
        low_id = ent_id.lower()
        low_name = name.lower()

        # Raw IEEE / Zigbee hex addresses (e.g. 0xa4c13888e56665a6)
        if re.search(r"0x[0-9a-fA-F]{8,}", ent_id):
            return True
        if re.search(r"^0x[0-9a-fA-F]+", name.strip()):
            return True

        # Internal configuration switches, calibration, and firmware options
        noise_patterns = [
            "backlight_mode", "motor_reversal", "calibration", "permit_join",
            "learn_ir_code", "ir_code_to_send", "child_lock", "countdown",
            "power_on_behavior", "indicator_mode", "switch_mode", "switch_type",
            "isapi_request", "bridge_state", "update_available", "identify",
            "temperature_calibration", "humidity_calibration"
        ]
        if any(p in low_id or p in low_name for p in noise_patterns):
            return True

        return False

    def discover_house_layout(self) -> Dict[str, Any]:
        """
        Discovers all Areas (Rooms), Devices, and Entities in Home Assistant.
        Categorizes entities by room and device class with noise suppression.
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
            area_id = ent.get("area_id")
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

        # Categorize all active states with noise suppression
        for ent_id, st in states_map.items():
            if not isinstance(st, dict):
                continue
            attrs = st.get("attributes") or {}
            domain = ent_id.split(".")[0]
            name = attrs.get("friendly_name") or ent_id

            # Filter out technical firmware entities and raw hex noise
            if self._is_noise_entity(ent_id, name):
                continue

            # Find matching area
            area_id = ent_to_area.get(ent_id)
            if not area_id:
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
                # 1. Door / Gate Relays belong to access control / locks
                if any(w in ent_id.lower() or w in name.lower() for w in ("door_relay", "gate", "door_lock", "doorbell_door")):
                    area["locks"].append(entity_entry)
                # 2. Lighting switches
                elif any(w in name.lower() for w in ("light", "lamp", "spot", "led", "chandelier", "sconce", "bulb")):
                    area["lights"].append(entity_entry)
                else:
                    area["switches"].append(entity_entry)

        # Count total devices per area
        for a in areas_dict.values():
            a["total_devices"] = (len(a["lights"]) + len(a["climates"]) + len(a["covers"])
                                  + len(a["media"]) + len(a["locks"]) + len(a["cameras"]) + len(a["switches"]))

        # Exclude empty rooms completely! Only active rooms with real devices
        active_areas = [a for a in areas_dict.values() if a["total_devices"] > 0]
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
    def ensure_frosted_glass_theme(self) -> bool:
        """
        Installs authentic Apple-grade Frosted Glass theme into /config/themes/
        so that Lovelace cards render with translucent blur, saturation boost, and 18px rounded tiles.
        """
        theme_dirs = ["/config/themes/Frosted Glass", "/homeassistant/themes/Frosted Glass"]
        target_dir = "/config/themes/Frosted Glass"
        for d in theme_dirs:
            if os.path.exists(os.path.join(d, "Frosted Glass.yaml")):
                return True
            if os.path.exists(os.path.dirname(d)):
                target_dir = d

        theme_content = """# Frosted Glass Theme for Home Assistant (AJ Netweb Edition)
Frosted Glass:
  modes:
    light:
      card-mod-theme: "Frosted Glass Light"
      primary-color: "#5B8AA8"
      primary-background-color: "#F5F5FA"
      card-background-color: "rgba(255, 255, 255, 0.75)"
      secondary-background-color: "rgba(240, 240, 248, 0.85)"
      text-primary-color: "rgba(19, 21, 54, 0.98)"
      app-header-backdrop-filter: "blur(6px) saturate(1.2)"
      app-header-background-color: "rgba(234, 235, 238, 0.2)"
      sidebar-background-color: "rgba(254, 244, 242, 0.7)"
      card-mod-card: |
        ha-card {
          background: rgba(255, 255, 255, 0.75) !important;
          backdrop-filter: blur(12px) saturate(1.2) !important;
          -webkit-backdrop-filter: blur(12px) saturate(1.2) !important;
          border-radius: 18px !important;
          border: 1px solid rgba(255, 255, 255, 0.4) !important;
          box-shadow: 0 12px 20px rgba(0, 0, 0, 0.08) !important;
        }

    dark:
      card-mod-theme: "Frosted Glass Dark"
      primary-color: "#5B8AA8"
      primary-background-color: "#121316"
      card-background-color: "rgba(28, 29, 33, 0.80)"
      secondary-background-color: "rgba(22, 23, 30, 0.90)"
      text-primary-color: "rgba(234, 235, 238, 0.98)"
      app-header-backdrop-filter: "blur(8px) saturate(1.2)"
      app-header-background-color: "rgba(20, 20, 25, 0.3)"
      sidebar-background-color: "rgba(20, 20, 25, 0.7)"
      card-mod-card: |
        ha-card {
          background: rgba(28, 29, 33, 0.80) !important;
          backdrop-filter: blur(14px) saturate(1.2) !important;
          -webkit-backdrop-filter: blur(14px) saturate(1.2) !important;
          border-radius: 18px !important;
          border: 1px solid rgba(255, 255, 255, 0.08) !important;
          box-shadow: 0 12px 24px rgba(0, 0, 0, 0.35) !important;
        }
"""
        try:
            os.makedirs(target_dir, exist_ok=True)
            theme_file = os.path.join(target_dir, "Frosted Glass.yaml")
            with open(theme_file, "w", encoding="utf-8") as f:
                f.write(theme_content)
            log.info("Installed Frosted Glass theme to %s", theme_file)
            self.reload_themes()
            return True
        except Exception as e:
            log.warning("Could not write Frosted Glass theme: %s", e)
            return False

    def reload_themes(self):
        """Call Home Assistant service to reload themes immediately."""
        try:
            self._call_ws("call_service", {"domain": "frontend", "service": "reload_themes", "service_data": {}})
        except Exception:
            pass

    def generate_dashboard(self, theme_key: str, title: str, areas: List[Dict[str, Any]], url_path: str = "ajnetweb") -> Dict[str, Any]:
        """
        Generates a complete, native-first Lovelace Dashboard structure for the specified theme.
        Supported themes:
        1. 'apple_frosted_glass' (Flagship Apple HomeKit iOS 18 Frosted Glass)
        2. 'cyber_luxury' (Cyber Glassmorphism)
        3. 'scandinavian_minimal' (Minimalist Scandinavian)
        4. 'modern_bento' (Modern Bento Grid / Apple Home)
        5. 'oled_stealth' (Pure OLED Stealth)
        6. 'hotel_suite' (Boutique Hotel Hub)
        """
        theme_generators = {
            "apple_frosted_glass": self._gen_apple_frosted_glass,
            "cyber_luxury": self._gen_cyber_luxury,
            "scandinavian_minimal": self._gen_scandinavian_minimal,
            "modern_bento": self._gen_modern_bento,
            "oled_stealth": self._gen_oled_stealth,
            "hotel_suite": self._gen_hotel_suite,
        }

        # All themes generate the dedicated 2-mode (Mobile & Tablet) architecture with zero clutter
        return self._gen_apple_frosted_glass(title, areas, url_path)

    def _gen_apple_frosted_glass(self, title: str, areas: List[Dict[str, Any]], url_path: str = "ajnetweb") -> Dict[str, Any]:
        """
        Flagship Apple HomeKit Frosted Glass Theme (iOS 18 Glassmorphism).
        Strict 2-Mode Architecture:
        1. 📱 Mobile Mode (path: "home") - Streamlined vertical 2-column layout for phones.
        2. 📟 Tab Mode (path: "tablet") - Wide 4-column master console for wall touch panels & tablets.
        Both modes share the identical Apple Frosted Glass translucent aesthetic and zero technical clutter.
        """
        self.ensure_frosted_glass_theme()
        views = []
        clean_url = url_path.replace("_", "-").strip("/") or "ajnetweb"

        # Collect global entities across all active areas
        all_lights = []
        all_climates = []
        all_cameras = []
        all_covers = []
        all_locks = []
        all_sensors = []
        all_binary_sensors = []
        all_switches = []

        for a in areas:
            all_lights.extend(a.get("lights", []))
            all_climates.extend(a.get("climates", []))
            all_cameras.extend(a.get("cameras", []))
            all_covers.extend(a.get("covers", []))
            all_locks.extend(a.get("locks", []))
            all_sensors.extend(a.get("sensors", []))
            all_binary_sensors.extend(a.get("binary_sensors", []))
            all_switches.extend(a.get("switches", []))

        # Best candidate entities for quick glance
        light_ent = next((l["entity_id"] for l in all_lights if "all" in l["entity_id"] or "count" in l["entity_id"]), None)
        if not light_ent and all_lights:
            light_ent = all_lights[0]["entity_id"]

        climate_ent = all_climates[0]["entity_id"] if all_climates else None

        # Doorbell Camera vs Other Cameras
        doorbell_cam = next((c["entity_id"] for c in all_cameras if any(k in c["entity_id"].lower() or k in c["name"].lower() for k in ("doorbell", "door_bell", "192_168_8_2", "entry", "gate"))), None)
        if not doorbell_cam and all_cameras:
            doorbell_cam = all_cameras[0]["entity_id"]

        other_cams = [c for c in all_cameras if c["entity_id"] != doorbell_cam]

        # Gate Relays & Locks
        main_gate = next((lk["entity_id"] for lk in all_locks if "relay" in lk["entity_id"] and not lk["entity_id"].endswith("_1")), None)
        if not main_gate and all_locks:
            main_gate = all_locks[0]["entity_id"]

        ped_gate = next((lk["entity_id"] for lk in all_locks if lk["entity_id"] != main_gate), None)

        # Garage Door
        garage_cover = next((cv["entity_id"] for cv in all_covers if "garage" in cv["entity_id"].lower() or "garage" in cv["name"].lower()), None)
        if not garage_cover and all_covers:
            garage_cover = all_covers[0]["entity_id"]

        weather_ent = "weather.home"

        # =====================================================================
        # 1. 📱 MOBILE MODE VIEW (path: "home")
        # =====================================================================
        mobile_sections = []

        # SECTION 0: Residence Status & Navigation Banner
        status_cards = [
            {
                "type": "heading",
                "heading": title or "Apple Smart Home",
                "heading_style": "title",
                "icon": "mdi:home-apple",
            },
            {
                "type": "tile",
                "grid_options": {"columns": 12, "rows": 1},
                "entity": weather_ent,
                "name": "Residence Status • Tap for Wall Console",
                "icon": "mdi:weather-partly-cloudy",
                "color": "light-blue",
                "tap_action": {"action": "navigate", "navigation_path": f"/{clean_url}/tablet"},
            }
        ]
        mobile_sections.append({"type": "grid", "cards": status_cards})

        # SECTION 1: 1-Tap Quick Access Strip (Gates & Garage)
        access_cards = [
            {
                "type": "heading",
                "heading": "⚡ Quick Access & Gates",
                "heading_style": "subtitle",
                "icon": "mdi:shield-key",
            }
        ]
        if main_gate:
            access_cards.append({
                "type": "tile",
                "grid_options": {"columns": 6, "rows": 1},
                "entity": main_gate,
                "name": "Main Gate",
                "icon": "mdi:door-open",
                "color": "green",
                "tap_action": {"action": "call-service", "service": "switch.turn_on", "target": {"entity_id": main_gate}},
            })
        if ped_gate:
            access_cards.append({
                "type": "tile",
                "grid_options": {"columns": 6, "rows": 1},
                "entity": ped_gate,
                "name": "Pedestrian Gate",
                "icon": "mdi:door",
                "color": "teal",
                "tap_action": {"action": "call-service", "service": "switch.turn_on", "target": {"entity_id": ped_gate}},
            })
        if garage_cover:
            access_cards.append({
                "type": "tile",
                "grid_options": {"columns": 12, "rows": 1},
                "entity": garage_cover,
                "name": "Garage Door",
                "icon": "mdi:garage-open-variant",
                "color": "indigo",
                "features": [{"type": "cover-open-close"}],
            })
        mobile_sections.append({"type": "grid", "cards": access_cards})

        # SECTION 2: Video Doorbell Live Preview
        if doorbell_cam:
            doorbell_cards = [
                {
                    "type": "heading",
                    "heading": "📹 Video Doorbell Live",
                    "heading_style": "subtitle",
                    "icon": "mdi:doorbell-video",
                },
                {
                    "type": "picture-entity",
                    "entity": doorbell_cam,
                    "name": "Entrance Live Feed",
                    "camera_view": "live",
                    "show_state": True,
                    "tap_action": {"action": "navigate", "navigation_path": "/67bcea52_ajnetweb_intercom"},
                }
            ]
            mobile_sections.append({"type": "grid", "cards": doorbell_cards})

        # SECTION 3: Living Room AC & Climate
        if climate_ent:
            climate_cards = [
                {
                    "type": "heading",
                    "heading": "❄️ Climate & AC Comfort",
                    "heading_style": "subtitle",
                    "icon": "mdi:air-conditioner",
                },
                {
                    "type": "thermostat",
                    "entity": climate_ent,
                    "name": "Living Room AC",
                    "grid_options": {"columns": 12, "rows": 4},
                    "features": [
                        {"type": "climate-hvac-modes", "style": "icons", "hvac_modes": ["off", "cool", "heat", "fan_only"]},
                        {"type": "climate-fan-modes", "style": "dropdown", "fan_modes": ["high", "medium", "low", "auto"]},
                    ],
                }
            ]
            mobile_sections.append({"type": "grid", "cards": climate_cards})

        # SECTION 4: Real Lighting & Ambience
        if all_lights:
            light_cards = [
                {
                    "type": "heading",
                    "heading": "💡 Lighting & Ambience",
                    "heading_style": "subtitle",
                    "icon": "mdi:ceiling-light-multiple",
                }
            ]
            for lt in all_lights[:8]:
                feats = [{"type": "light-brightness"}] if lt.get("domain") == "light" else []
                light_cards.append({
                    "type": "tile",
                    "grid_options": {"columns": 6, "rows": 1},
                    "entity": lt["entity_id"],
                    "name": lt["name"],
                    "color": "amber",
                    "features": feats,
                })
            mobile_sections.append({"type": "grid", "cards": light_cards})

        # SECTION 5: Additional CCTV Cameras
        if other_cams:
            other_cam_cards = [
                {
                    "type": "heading",
                    "heading": "📹 CCTV Surveillance Matrix",
                    "heading_style": "subtitle",
                    "icon": "mdi:cctv",
                }
            ]
            for cam in other_cams[:4]:
                other_cam_cards.append({
                    "type": "picture-entity",
                    "entity": cam["entity_id"],
                    "name": cam["name"],
                    "camera_view": "live",
                    "show_state": True,
                    "grid_options": {"columns": 6, "rows": 2},
                })
            mobile_sections.append({"type": "grid", "cards": other_cam_cards})

        mobile_badges = [
            {"type": "entity", "entity": weather_ent, "show_name": False, "show_state": True},
        ]
        if climate_ent:
            mobile_badges.append({"type": "entity", "entity": climate_ent, "icon": "mdi:air-conditioner", "color": "light-blue", "show_name": False, "show_state": True})
        if main_gate:
            mobile_badges.append({"type": "entity", "entity": main_gate, "icon": "mdi:door-open", "color": "green", "show_name": False, "show_state": True})

        views.append({
            "title": "Mobile",
            "path": "home",
            "icon": "mdi:cellphone",
            "type": "sections",
            "max_columns": 2,
            "theme": "Frosted Glass",
            "badges": mobile_badges,
            "sections": mobile_sections,
        })

        # =====================================================================
        # 2. 📟 TAB MODE / WALL PANEL CONSOLE (path: "tablet")
        # =====================================================================
        tablet_sections = []

        # SECTION 0: Master Command Header Bar
        tab_header_cards = [
            {
                "type": "heading",
                "heading": f"{title or 'AJ Netweb'} • Wall Console",
                "heading_style": "title",
                "icon": "mdi:tablet-dashboard",
            }
        ]
        if main_gate:
            tab_header_cards.append({
                "type": "tile",
                "grid_options": {"columns": 4, "rows": 1},
                "entity": main_gate,
                "name": "⚡ Unlock Main Gate",
                "icon": "mdi:door-open",
                "color": "green",
                "tap_action": {"action": "call-service", "service": "switch.turn_on", "target": {"entity_id": main_gate}},
            })
        if ped_gate:
            tab_header_cards.append({
                "type": "tile",
                "grid_options": {"columns": 4, "rows": 1},
                "entity": ped_gate,
                "name": "⚡ Pedestrian Gate",
                "icon": "mdi:door",
                "color": "teal",
                "tap_action": {"action": "call-service", "service": "switch.turn_on", "target": {"entity_id": ped_gate}},
            })
        if light_ent:
            tab_header_cards.append({
                "type": "tile",
                "grid_options": {"columns": 4, "rows": 1},
                "entity": light_ent,
                "name": "💡 All Lights Off",
                "icon": "mdi:lightbulb-group-off",
                "color": "amber",
                "tap_action": {"action": "call-service", "service": "light.turn_off", "target": {"entity_id": "all"}},
            })
        tablet_sections.append({"type": "grid", "cards": tab_header_cards})

        # SECTION 1: Live Surveillance Matrix (Quad 2x2 Grid)
        if all_cameras:
            cctv_matrix_cards = [
                {
                    "type": "heading",
                    "heading": "Live Surveillance Wall",
                    "icon": "mdi:cctv",
                    "heading_style": "subtitle",
                }
            ]
            for cam in all_cameras[:4]:
                cctv_matrix_cards.append({
                    "type": "picture-entity",
                    "entity": cam["entity_id"],
                    "name": cam["name"],
                    "camera_view": "live",
                    "show_state": True,
                    "grid_options": {"columns": 6, "rows": 3},
                })
            tablet_sections.append({"type": "grid", "cards": cctv_matrix_cards})

        # SECTION 2: Living Room Hub (AC + Living Room Lights)
        if climate_ent or all_lights:
            lr_cards = [
                {
                    "type": "heading",
                    "heading": "Living Room Hub",
                    "icon": "mdi:sofa",
                    "heading_style": "subtitle",
                }
            ]
            if climate_ent:
                lr_cards.append({
                    "type": "thermostat",
                    "entity": climate_ent,
                    "name": "Living Room AC",
                    "grid_options": {"columns": 12, "rows": 4},
                    "features": [
                        {"type": "climate-hvac-modes", "style": "icons", "hvac_modes": ["off", "cool", "heat"]},
                        {"type": "climate-fan-modes", "style": "dropdown", "fan_modes": ["high", "medium", "low", "auto"]},
                    ],
                })
            for lt in [l for l in all_lights if "living" in l["name"].lower() or "ground" in l["entity_id"].lower()][:4]:
                lr_cards.append({
                    "type": "tile",
                    "grid_options": {"columns": 6, "rows": 1},
                    "entity": lt["entity_id"],
                    "name": lt["name"],
                    "color": "amber",
                })
            tablet_sections.append({"type": "grid", "cards": lr_cards})

        # SECTION 3: Bedroom & Roof Lighting Hub
        bed_lights = [l for l in all_lights if "bed" in l["name"].lower() or "roof" in l["name"].lower() or "2gang" in l["entity_id"].lower()]
        if not bed_lights:
            bed_lights = all_lights[4:8]
        if bed_lights:
            bed_cards = [
                {
                    "type": "heading",
                    "heading": "Bedrooms & Lighting Zones",
                    "icon": "mdi:bed",
                    "heading_style": "subtitle",
                }
            ]
            for lt in bed_lights:
                bed_cards.append({
                    "type": "tile",
                    "grid_options": {"columns": 6, "rows": 1},
                    "entity": lt["entity_id"],
                    "name": lt["name"],
                    "color": "amber",
                })
            tablet_sections.append({"type": "grid", "cards": bed_cards})

        # SECTION 4: Garage & Perimeter Access
        if garage_cover or main_gate:
            sec_cards = [
                {
                    "type": "heading",
                    "heading": "Perimeter & Garage",
                    "icon": "mdi:garage",
                    "heading_style": "subtitle",
                }
            ]
            if garage_cover:
                sec_cards.append({
                    "type": "tile",
                    "grid_options": {"columns": 6, "rows": 1},
                    "entity": garage_cover,
                    "name": "Garage Door",
                    "icon": "mdi:garage",
                    "features": [{"type": "cover-open-close"}],
                })
            tablet_sections.append({"type": "grid", "cards": sec_cards})

        tab_badges = [
            {"type": "entity", "entity": weather_ent, "show_name": False, "show_state": True},
        ]
        if climate_ent:
            tab_badges.append({"type": "entity", "entity": climate_ent, "icon": "mdi:air-conditioner", "color": "light-blue", "show_name": False, "show_state": True})

        views.append({
            "title": "Wall Console",
            "path": "tablet",
            "icon": "mdi:tablet-dashboard",
            "type": "sections",
            "max_columns": 4,
            "theme": "Frosted Glass",
            "badges": tab_badges,
            "sections": tablet_sections,
        })

        return {
            "title": title or "Apple Smart Home",
            "views": views,
        }

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
            # Also auto-install GCC luxury blueprints
            self.install_bundled_blueprints()
            return True
        except Exception as e:
            log.error("Failed to install card suite resource: %s", e)
            return False

    def install_bundled_blueprints(self) -> Dict[str, Any]:
        """
        Auto-installs GCC luxury automation blueprints into Home Assistant:
        1. adhan_smart_mute.yaml
        2. balcony_ac_protector.yaml
        3. water_tank_watchdog.yaml
        """
        installed = []
        try:
            os.makedirs(HA_BLUEPRINTS_DIR, exist_ok=True)
            if os.path.exists(LOCAL_BLUEPRINTS_DIR):
                for fname in os.listdir(LOCAL_BLUEPRINTS_DIR):
                    if fname.endswith(".yaml") or fname.endswith(".yml"):
                        src = os.path.join(LOCAL_BLUEPRINTS_DIR, fname)
                        dst = os.path.join(HA_BLUEPRINTS_DIR, fname)
                        shutil.copy2(src, dst)
                        installed.append(fname)
                        log.info("Installed GCC blueprint %s to %s", fname, dst)
            return {"ok": True, "installed": installed}
        except Exception as e:
            log.error("Failed to install blueprints: %s", e)
            return {"ok": False, "error": str(e), "installed": installed}

    def list_blueprints(self) -> List[Dict[str, Any]]:
        """List status of all available GCC blueprints."""
        return [
            {
                "id": "adhan_smart_mute",
                "filename": "adhan_smart_mute.yaml",
                "name": "Umm Al-Qura Adhan & Smart Media Mute",
                "description": "Automatically mutes TVs, soundbars, and Apple TVs during prayer times and plays Adhan chime.",
                "category": "Islamic Villa Automation",
                "installed": os.path.exists(os.path.join(HA_BLUEPRINTS_DIR, "adhan_smart_mute.yaml")),
            },
            {
                "id": "balcony_ac_protector",
                "filename": "balcony_ac_protector.yaml",
                "name": "Balcony Door & Patio AC Energy Protector",
                "description": "Switches off AC if patio/balcony door remains open >120s to conserve energy and prevent heat ingress.",
                "category": "Climate Eco Preservation",
                "installed": os.path.exists(os.path.join(HA_BLUEPRINTS_DIR, "balcony_ac_protector.yaml")),
            },
            {
                "id": "water_tank_watchdog",
                "filename": "water_tank_watchdog.yaml",
                "name": "Villa Water Tank & Booster Pump Watchdog",
                "description": "Monitors roof/ground water tank levels (<20% alert) and shuts off pump if running >45m continuously.",
                "category": "Facility Protection",
                "installed": os.path.exists(os.path.join(HA_BLUEPRINTS_DIR, "water_tank_watchdog.yaml")),
            },
        ]


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
        url_path = clean_url.replace("_", "-")
        storage_slug = clean_url.replace("-", "_")

        dashboard_cfg = self.generate_dashboard(theme_key, title, active_areas, url_path=url_path)

        # Register directly in Home Assistant running memory via WebSocket API for 0-restart instant routing
        dash_icon = "mdi:apple" if "apple" in theme_key else "mdi:view-dashboard-variant"
        try:
            existing_dashboards = self._call_ws("lovelace/dashboards/list") or []
            existing = next((d for d in existing_dashboards if d.get("url_path") == url_path), None)
            if not existing:
                create_res = self._call_ws("lovelace/dashboards/create", {
                    "url_path": url_path,
                    "title": title,
                    "icon": dash_icon,
                    "require_admin": False,
                    "show_in_sidebar": True,
                    "mode": "storage",
                })
                log.info("WebSocket lovelace/dashboards/create result: %s", create_res)
            else:
                update_res = self._call_ws("lovelace/dashboards/update", {
                    "dashboard_id": existing.get("id"),
                    "title": title,
                    "icon": dash_icon,
                    "require_admin": False,
                    "show_in_sidebar": True,
                })
                log.info("WebSocket lovelace/dashboards/update result: %s", update_res)

            save_res = self._call_ws("lovelace/config/save", {
                "url_path": url_path,
                "config": dashboard_cfg,
            })
            log.info("WebSocket lovelace/config/save result: %s", save_res)
        except Exception as ws_err:
            log.warning("WebSocket Lovelace dynamic registration error: %s (falling back to disk)", ws_err)

        # Write Lovelace configuration directly to .storage/lovelace.{storage_slug}
        storage_file = os.path.join(STORAGE_DIR, f"lovelace.{storage_slug}")
        storage_payload = {
            "version": 1,
            "minor_version": 1,
            "key": f"lovelace.{storage_slug}",
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
        dash_icon = "mdi:apple" if "apple" in theme_key else "mdi:view-dashboard-variant"
        try:
            if os.path.exists(dash_index_file):
                with open(dash_index_file, "r", encoding="utf-8") as f:
                    dash_data = json.load(f)
            else:
                dash_data = {"version": 1, "minor_version": 1, "key": "lovelace_dashboards", "data": {"items": []}}

            items = dash_data.get("data", {}).get("items", [])
            # Update or append
            found = False
            for itm in items:
                if itm.get("url_path") == url_path or itm.get("id") == storage_slug:
                    itm["url_path"] = url_path
                    itm["title"] = title
                    itm["mode"] = "storage"
                    itm["icon"] = dash_icon
                    itm["show_in_sidebar"] = True
                    found = True
                    break
            if not found:
                items.append({
                    "id": storage_slug,
                    "url_path": url_path,
                    "title": title,
                    "icon": dash_icon,
                    "mode": "storage",
                    "show_in_sidebar": True,
                    "require_admin": False,
                })
            dash_data["data"]["items"] = items

            with open(dash_index_file, "w", encoding="utf-8") as f:
                json.dump(dash_data, f, indent=2)
            log.info("Registered dashboard '%s' in lovelace_dashboards", url_path)
        except Exception as e:
            log.warning("Could not update lovelace_dashboards registry: %s", e)

        self.reload_themes()

        return {
            "ok": True,
            "url_path": url_path,
            "storage_slug": storage_slug,
            "title": title,
            "theme": theme_key,
            "dashboard_url": f"/{url_path}",
            "message": f"Dashboard '{title}' deployed successfully at /{url_path}!",
        }
