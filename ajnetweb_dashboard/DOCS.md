# AJ Netweb Dashboard Suite

Professional, automated room-aware Lovelace dashboard generator for Home Assistant with 5 curated aesthetics. Built natively with modern Sections architecture and bundled with the self-contained `ajnetweb-card-suite.js` (zero HACS dependencies).

---

## The Dashboard Challenge & Solution

Setting up dashboards in Home Assistant is traditionally time-consuming and fragile:
- Every residence has different rooms, lights, thermostats, shades, and cameras.
- Third-party HACS plugins (Bubble Card, Mushroom Card, etc.) frequently break on monthly Home Assistant core updates, leaving customers with broken wall tablets.

**AJ Netweb Dashboard Suite solves this completely**:
1. **Automated Room & Device Discovery**: Automatically queries the Home Assistant Area Registry, Device Registry, and Entity Registry. Detects which device belongs to which room and classifies them into Lights, ACs, Curtains, Media, Locks, and Cameras.
2. **5 Curated Aesthetics**:
   - **Cyber Luxury Glassmorphism**: Translucent frosted cards, neon cyan/violet glowing borders, obsidian base.
   - **Minimalist Scandinavian**: Clean typography, warm paper tones, generous breathing room, serene atmosphere.
   - **Modern Bento Grid (iOS)**: Apple Home inspired 2x2 rounded bento tiles with dynamic color tinting.
   - **Pure OLED Stealth**: True pitch black `#000000` background, battery-saving, zero burn-in on wall tablets.
   - **Boutique Hotel Hub**: Hospitality concierge layout with prominent greeting, quick scenes, and suite selector.
3. **Native Sections + Self-Contained Card Suite**: Uses Home Assistant's official modern Sections view layout and Tile cards with features. Custom hero components are bundled in `ajnetweb-card-suite.js` managed directly in this repository — zero external HACS developer dependencies.
4. **1-Click Instant Deployment**: Generates and writes the dashboard directly to Home Assistant storage and registers it in the sidebar. Ready in 5 seconds.

---

## How to Use

1. Open **Dashboard Suite** from the Home Assistant sidebar.
2. Review the **Discovered Rooms** and entity count breakdown (Lights, ACs, Shades, Cameras).
3. Select your desired **Aesthetic Theme** (Cyber Luxury, Minimalist Scandinavian, Modern Bento, OLED Stealth, or Boutique Hotel).
4. Customize the **Title** and **URL Path** (e.g., `ajnetweb`).
5. Click **🚀 Deploy Dashboard to Home Assistant**.
6. Click the instant link to view and pin your new dashboard!
