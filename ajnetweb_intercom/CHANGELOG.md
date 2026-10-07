# Changelog - AJ Netweb Intercom & Door Station Studio

## 1.0.1
- **Dynamic Hik-Connect / DMSS Mobile Push Notification Engine**:
  - Automatically discovers all active iOS & Android mobile companion apps registered in Home Assistant on the fly via Supervisor API.
  - Zero hardcoded entities: when customers delete/reinstall apps or buy new phones/tablets, notifications work immediately without modifying any YAML scripts or automations.
  - Actionable rich push payload: includes high-resolution visitor photo attachment, critical sound (bypasses silent/Do Not Disturb), and instant lock-screen action buttons (`🔓 Unlock Main Gate`, `🔓 Unlock Pedestrian Door`, `📹 View Camera`).
- **Native Lock-Screen Action Interceptor**:
  - Built-in Home Assistant WebSocket listener subscribes to `mobile_app_notification_action`.
  - Tapping "🔓 Unlock" on any phone lock screen triggers the door strike relay immediately without writing custom HA automations.
- **Snapshot Mirroring to Home Assistant Web Server**:
  - Automatically mirrors visitor snapshots to `/config/www/ajnetweb_intercom/latest_ring.jpg` and `/local/` for fast, authenticated remote rendering on iOS and Android.
- **Web Push & Browser Notifications**:
  - Desktop and mobile PWA browser notifications with 1-click permission toggle in header and settings.
- **Settings UI Upgrades**:
  - Real-time mobile device discovery inspector with active status chips.
  - 1-click "Send Test Ring & Push to All Devices" button for fast installer verification.

## 1.0.0
- Initial release of AJ Netweb Intercom & Door Station Studio for Home Assistant.
- Dual-brand native integration for Hikvision Video Intercom (ISAPI) and Dahua / Amcrest VTO Door Stations (CGI/RPC).
- Real-time persistent event monitoring stream for Doorbell Ring, Door Open/Close, and Tamper Alarms.
- Live synthesized Ding-Dong doorbell chime in browser using HTML5 Web Audio API.
- Instant electric strike remote door release (Relay 1 / Main Gate and Relay 2 / Pedestrian Door).
- Automated visitor photo capture on doorbell ring with gallery view and click-to-enlarge modal.
- REST API for Home Assistant automations (`/api/unlock?door=1`).
- Future-proof event dispatch to Home Assistant event bus (`ajnetweb_doorbell_ring`, `ajnetweb_door_unlocked`).
- Full Ingress UI with Cyber Cyan, Emerald Night, Tactical Amber, Crimson Alert, Titanium Slate, and custom color picker themes.
