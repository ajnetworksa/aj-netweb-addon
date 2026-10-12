# AJ Netweb Dashboard Suite

Automated room-aware Lovelace dashboard generator featuring Apple HomeKit Frosted Glass (iOS 18) and 5 curated aesthetics for Home Assistant. Built natively with modern Sections architecture, dual **📱 Mobile Mode** and **📟 Tab Mode (Wall Panel)**, zero-HACS dependencies, and instant WebSocket deployment.

![Dashboard Suite](https://raw.githubusercontent.com/ajnetworksa/aj-netweb-addon/main/ajnetweb_dashboard/icon.png)

## Features

- **Dual Experience (Mobile & Tablet)**:
  - **📱 Mobile Mode (`/home`)**: Optimized 2-column vertical flow with quick status pills, 1-tap toggles, and compact room cards.
  - **📟 Tab Mode (`/tablet`)**: 4-column horizontal grid designed for wall-mounted touch displays (Hikvision DS-KH9510, Android smart kiosks, iPads) with master controls (Gate Unlock, Master All Lights Off) and live CCTV/intercom matrix.
- **Auto-Discovery & Auto Device Support**: Dynamically scans Home Assistant registries to organize lights (with brightness/color sliders), climates (thermostat dials), shades, locks, CCTV/doorbell cameras, and safety sensors.
- **Zero-Restart WebSocket Deployment**: Dynamically registers dashboard routes directly via Home Assistant's WebSocket API, eliminating 404 errors completely with 0 core restarts.
- **Apple Frosted Glass & Curated Aesthetics**: Translucent blur, subtle glows, and 18px rounded pill tiles modeled after iOS 18 HomeKit.
- **Bundled Card Suite**: `ajnetweb-card-suite.js` pre-installed directly without requiring HACS.
- **GCC Automation Blueprints**: Bundles luxury automation blueprints for prayer time media mute, AC protection, and booster pump watchdogs.
