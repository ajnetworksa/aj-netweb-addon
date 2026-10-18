# Changelog - AJ Netweb Intercom & Door Station Studio

## 1.6.1
- Licence page: only asks for something when something is needed. With licensing not switched on, or when
  licensed through AJ Netweb Remote Access, it just shows the status (no licence key box or Activate button).

## 1.6.0
- **AJ Netweb licence:** this add-on now needs this Home Assistant to be licensed by AJ Netweb, normally
  through **AJ Netweb Remote Access** (no key to enter), or with an offline licence key (see `licensing/README.md`). Existing installations keep
  working for 14 days after updating; the add-on page shows the Install ID and an Activate box.
  Developer builds without a public key are not affected.

## 1.5.0
- **Security:** port 8091 (host network) was open to the LAN, so anyone on Wi-Fi could unlock doors.
  The studio now only answers Home Assistant ingress.
- **Privacy:** visitor photos for notifications were published under `/local` (no login needed) with
  guessable names (`latest_ring.jpg`). They now get random names and only the latest 20 are kept.
- Fixed: notification links pointed to one specific installation (`/67bcea52_ajnetweb_intercom`) and to
  `/ajnetweb`. The add-on path and the AJ Netweb dashboard are now detected automatically
  (or set `dashboard_path`).
- Fixed: snapshot fallback used camera ids from one site (`camera.192_168_8_2`). New option
  `doorbell_camera_entity`, otherwise door/gate cameras are detected automatically.
- Fixed: the WebRTC config contained an installer's LAN STUN server (`192.168.8.214`). New optional
  `stun_server` option instead.
- Fixed: live audio/talk asked go2rtc for a stream (`doorbell_live`) that was never created. The door
  station is now registered with go2rtc automatically (RTSP + ISAPI two-way audio on Hikvision), and both
  the built-in go2rtc and the go2rtc add-on are supported.
- Fixed: snapshots were written to the unmounted `/config/www`.
- Same settings fixes as CCTV (password placeholder, `ui_settings.json`), passwords redacted in responses.
- The server no longer silently moves to another port when 8091 is busy (ingress can't follow it).

## 1.4.4
- **Native Two-Way WebRTC Audio & Microphone Backchannel**:
  - Integrated zero-latency WebRTC live audio monitoring and bidirectional microphone backchannel directly into the addon UI.
  - "Listen to Audio": connects directly to local `go2rtc` engine via RTCPeerConnection, streaming outdoor door station microphone to browser/phone speakers.
  - "Talk to Door": captures browser microphone, packages Opus audio track, and bridges into Hikvision RTSP backchannel (`#backchannel=1`), broadcasting user voice out of the outdoor station speaker.
  - Built-in WebRTC proxy endpoint `/api/webrtc` in `server.py` routing directly to local `go2rtc` instance (`127.0.0.1:1984`) for seamless traversal across Ingress and local networks.

## 1.4.3
- **Calling-Style Mobile Push Notifications**:
  - Doorbell rings deliver continuous alarm stream audio (`alarm_stream: True`, `importance: "high"`, `priority: "high"`) waking Android and iOS screens with incoming call ringback.
  - Custom vibration pattern, persistent/sticky banner, red LED notification alert, and iOS critical chime (`doorbell_chime.wav`).
  - Corrected Ingress external link deep-action: tapping "Answer / Live View" now points directly to valid ingress path `/67bcea52_ajnetweb_intercom` and adds "Open Dashboard" shortcut (`/ajnetweb`).
  - High-reliability visitor snapshot engine: falls back to Home Assistant camera proxy (`/core/api/camera_proxy/camera.192_168_8_2`) if camera ISAPI client is busy, mirroring to both `/config/www` and `/homeassistant/www` with `0o644` permissions.
- **Kiosk View Mode vs Administrator Editor Mode**:
  - Operator/View mode hides credential provisioning, hardware learning, and device editing to prevent accidental alterations on wall tablets.
  - Dedicated "Outdoor Reader Hardware Learning Mode" moved cleanly into Credentials & Passes tab away from live view stream.

## 1.4.2
- **Room-to-Room Inter-Display Calling & Villa Broadcast System**:
  - **Direct Room-to-Room Calling (1-to-1)**: Call from one wall display/tablet to another (e.g. Master Bedroom to Kitchen or Majlis to Living Room) with full-screen calling dialog, telephone warble chime, and two-way audio.
  - **Villa All-Call Public Address (PA Broadcast)**: Broadcast audio chimes and voice announcements to all connected wall displays simultaneously ("Dinner is ready", "Guests in Majlis", "School bus has arrived") with automated Text-to-Speech playback.
  - **Indoor Display Directory & Auto-Discovery**: Real-time room directory listing active displays with online pulse badges, room identity assignment, and status controls (`Available`, `Do Not Disturb`, `Auto-Answer`).
  - **Physical Indoor Station Bridge (Hikvision DS-KH & Dahua VTH)**: Dial and ring physical wall-mounted indoor intercom monitors installed throughout the property via ISAPI/CGI.
  - **Full-Screen Calling Overlay**: Interactive modal with telephone ringback audio, animated audio waveforms, live call duration timer, mic mute toggle, and in-call gate unlock shortcut.

## 1.1.0
- **Direct Terminal ISAPI Credential & Guest Key Provisioning**:
  - Direct local ISAPI provisioning for Hikvision MinMoe and Access Control Terminals (`DS-K1T502DBWX-CQR`, `DS-K1T671TMFW`, `DS-K1T673TDGX`, `DS-K1T321MFWX`, `DS-K1T342DWX`).
  - **Eliminates Hik-Partner Pro & Web GUI Logins**: Installers and homeowners can issue guest credentials directly from the add-on interface without opening Hik-Partner Pro or logging into terminal IP addresses.
  - **Optical QR Code Generation**: Generates scannable QR tokens that are immediately verified by terminal cameras/scanners to unlock doors.
  - **Keypad PIN Management**: Provisions 4- to 8-digit temporary PIN codes directly to terminal hardware for entry on physical keypads and touchscreens via `#PIN#`.
  - **Interactive Guest Pass Modal**: Digital guest pass badge with real-time SVG QR code, large PIN badge, 1-click WhatsApp/SMS sharing, clipboard copy, and printable card.
  - **Automated Background Pruning Daemon**: Automatically deletes expired user and card credentials from the physical terminal memory every 60 seconds, keeping terminal storage clean.

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
