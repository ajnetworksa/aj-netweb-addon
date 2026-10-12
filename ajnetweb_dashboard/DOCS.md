# AJ Netweb Dashboard Suite

Professional, automated room-aware Lovelace dashboard generator for Home Assistant featuring Apple HomeKit Frosted Glass (iOS 18) and 5 curated aesthetics. Built natively with modern Sections architecture, dual **📱 Mobile Mode** and **📟 Tab Mode (Wall Panel)**, zero-HACS dependencies, and instant WebSocket deployment.

---

## Dual Experience: Mobile Mode vs. Tablet Wall Panel Mode

The generated dashboard includes two purpose-built, responsive primary experiences that share the same luxury Apple Frosted Glass design:

### 📱 1. Mobile Mode (`path: "home"`)
- **Designed For**: iPhone & Android Home Assistant Companion App.
- **Layout Architecture**: 2-column compact Sections flow optimized for vertical swiping.
- **Glance Header**: Live status pills displaying active lights count, smoke/safety alarms, air conditioning status, security cameras, video doorbell status, and server latency.
- **Room Sections**: Clean 1-tap toggle tiles, brightness sliders, climate thermostat dials, and window blind open/close sliders.

### 📟 2. Tab Mode / Wall Panel Console (`path: "tablet"`)
- **Designed For**: Wall-mounted touch screens (Hikvision `DS-KH9510`, Android smart kiosks, iPads, Galaxy Tabs).
- **Layout Architecture**: 4-column ultra-wide horizontal matrix with large touch targets (min 48px) for effortless wall interaction.
- **Master Command Bar**:
  - `⚡ Quick Gate Unlock`: Instant 1-tap trigger for electric gate / door strikes.
  - `💡 Master All Lights Off`: Turns off all villa lights upon leaving or bedtime.
  - `Villa Console Banner`: Live time, date, and security status.
- **Surveillance & Intercom Matrix**: Live CCTV camera feeds and doorbell snapshots side-by-side with immediate gate unlock buttons.
- **Room Grid**: High-contrast touch tiles with embedded sliders for every room.

---

## Zero-Restart Dynamic WebSocket Deployment (No More 404s!)

Previously, modifying Home Assistant Lovelace storage files on disk required restarting Home Assistant Core for the web server router to recognize the new URL route. 

**AJ Netweb Dashboard Suite v1.3.1 eliminates this entirely**:
- Interacts with Home Assistant Core via authenticated **WebSocket APIs** (`lovelace/dashboards/create`, `lovelace/dashboards/update`, and `lovelace/config/save`).
- Dynamically registers the `/{url_path}` route directly into Home Assistant's running `aiohttp` web server router in memory.
- Clicking **🚀 Open Dashboard** immediately navigates to your live dashboard with **HTTP 200 OK** in less than 2 seconds — **zero core restarts required!**

---

## Auto-Device Discovery & Classification

The engine dynamically inspects Home Assistant's Area, Device, and Entity Registries and automatically populates:
- **💡 Lighting**: Tiles with brightness sliders and color temperature dials.
- **❄️ Climate / HVAC**: Native thermostat cards with temperature targets, fan modes, and HVAC presets (Cool, Heat, Eco).
- **🪟 Curtains & Shades**: Vertical/horizontal slider controls with open, close, and stop.
- **🔒 Locks & Gates**: Secure release tiles with momentary strike actions.
- **📹 CCTV & Cameras**: Live snapshot and real-time streaming tiles for all NVR channels and door stations.
- **🎵 Media Players**: Audio playback controls and volume sliders.
- **🛡️ Sensors & Safety**: Smoke detectors, motion sensors, temperature/humidity sensors, and tank level watchdogs.

---

## How to Deploy in 3 Clicks

1. Open **Dashboard Suite** from the Home Assistant sidebar.
2. Select your desired theme (e.g. **Apple Frosted Glass**).
3. Review your rooms and click **🚀 Deploy Dashboard to Home Assistant**.
4. Click **🚀 Open Dashboard** to launch your new mobile and tablet wall panel interface!
