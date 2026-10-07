# Changelog - AJ Netweb Dashboard Suite

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
