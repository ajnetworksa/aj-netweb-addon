# Changelog - AJ Netweb Dashboard Suite

## 2.0.0
Complete rebuild of the generator and studio.

**Fixes**
- Files were written to `/config`, which this add-on does not mount (`homeassistant_config` mounts at
  `/homeassistant`). The card suite, themes and blueprints never reached Home Assistant. Both paths
  are now detected.
- The default URL `ajnetweb` was rejected by Home Assistant (dashboard URLs must contain a hyphen),
  which caused the 404s. URLs are now normalised (`ajnetweb` -> `ajnetweb-home`).
- Removed direct writes to `.storage/lovelace*` files, which HA overwrites and which could create
  duplicate dashboard entries.
- The theme selection had no effect (every option produced the same layout). Each theme is now a
  real HA theme applied to every view.
- Removed hardcoded entities (`weather.home`, intercom panel slug, fixed "Living Room" names).
- The Frosted Glass theme depended on card-mod (HACS). It now uses native variables only.

**New**
- One responsive layout for phone, tablet and wall panel (Sections view), plus a Wall Panel view.
- Room cards with live indicators and one-tap lights toggle, grouped by Floor; a sub-page per room.
- Lights, Climate, Security, Cameras, Media and admin-only Installer views.
- Installer project: hide rooms/devices, favourites, support details, language (English/Arabic).
- Noise filtering uses HA's `entity_category` / hidden / disabled flags.
- Card suite registered through the resources API with a versioned URL; v1 cards kept for compatibility.
- Automatic backups before every deploy, with restore.
- Health checks: HA version, config mount, themes include, resource registration.
- Ingress server only accepts requests from the Supervisor proxy.

**Upgrade note:** the dashboard now lives at `/ajnetweb-home` by default. An old `/ajnetweb`
dashboard (if one exists) is left untouched; delete it in Settings → Dashboards once you've switched.

## 1.3.2
- **Overhauled Dual-Mode Architecture (📱 Mobile Mode & 📟 Wall Console)**:
  - **Zero Entity Clutter**: Automatically prunes unconfigured firmware noise, raw IEEE hex switches (`0xa4c1...`), internal configuration options, backlight modes, motor reversals, and calibration flags.
  - **Auto Device Support**: Strictly populates only real controllable devices present in the residence. Door relays mapped directly to access control / gate strikes.
  - **📱 Mobile Mode (`path: "home"`)**: Optimized 2-column stream for smartphones with glance weather/residence bar, 1-tap gate unlock strip (Main Gate, Pedestrian Gate, Garage Door), live doorbell preview, living room AC thermostat, and real lighting sliders.
  - **📟 Wall Console Mode (`path: "tablet"`)**: Wide 4-column console for wall touch panels & tablets (Hikvision DS-KH9510, Android kiosks, iPads) with 4-channel live surveillance quad matrix, master command buttons, and room hubs.
  - **Apple Frosted Glass Styling**: Seamless frosted glass blur, 18px rounded tiles, glowing borders, and high touch target reachability.
  - **Resolved 404 Routing on Deploy**: Fixed client routing and added direct launch buttons for Mobile Mode, Wall Console, and Main URL.

## 1.1.0
- **GCC Luxury Villa Super-Features (Turnkey Blueprints Suite)**:
  - Bundled 3 production-grade Home Assistant automation blueprints installed directly into `/config/blueprints/automation/ajnetweb/`:
    1. **Umm Al-Qura Adhan & Smart Media Mute (`adhan_smart_mute.yaml`)**: Automatically pauses TVs, Apple TVs, and living room soundbars at prayer times, broadcasts gentle Adhan chimes across wall displays and in-ceiling speakers, and restores previous media state after prayer.
    2. **Balcony Door & Patio AC Energy Protector (`balcony_ac_protector.yaml`)**: Prevents desert heat ingress and saves up to 35% in cooling power by turning off AC when patio doors remain open >120s, alerting wall screens, and restoring cooling upon door closure.
    3. **Villa Water Tank & Booster Pump Watchdog (`water_tank_watchdog.yaml`)**: Monitors roof/ground tank levels (<20% urgent alert) and auto-cuts booster pump power if continuously running >45m to prevent pump dry-run burnout and catastrophic pipe flooding.
- **1-Click Blueprint Synchronization**: Auto-installs on container startup and provides instant synchronization from the Dashboard Suite Ingress UI.

## 1.0.0
- Initial release of AJ Netweb Dashboard Suite.
- **Automated Room & Device Discovery Engine**: Automatically reads Home Assistant Area Registry, Device Registry, and Entity Registry to map devices to rooms.
- **5 Curated Aesthetic Presets**:
  - Cyber Luxury Glassmorphism
  - Minimalist Scandinavian
  - Modern Bento Grid (Apple Home / iOS)
  - Pure OLED Stealth (Pitch Black #000000)
  - Boutique Hotel Hub (Hospitality Concierge)
- **Zero-HACS Card Suite (`ajnetweb-card-suite.js`)**: Bundled self-contained Web Components (`<ajnetweb-room-card>`, `<ajnetweb-quick-scenes>`) registered directly into `/config/www/ajnetweb/`.
- **Native Sections & Tile Layouts**: Full compatibility with Home Assistant modern Sections layout with brightness sliders, HVAC mode toggles, and cover controls.
- **1-Click Deployment**: Writes dashboard configuration directly to Home Assistant storage and sidebar registry.
