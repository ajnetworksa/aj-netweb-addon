# Changelog - AJ Netweb Intercom & Door Station Studio

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
