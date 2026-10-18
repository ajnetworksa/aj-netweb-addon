# Changelog - AJ Netweb CCTV & NVR Studio

## 1.3.0
- **AJ Netweb licence:** this add-on now needs an AJ Netweb licence key for this Home Assistant
  (one key activates every AJ Netweb add-on, see `licensing/README.md`). Existing installations keep
  working for 14 days after updating; the add-on page shows the Install ID and an Activate box.
  Developer builds without a public key are not affected.
- The add-on now maps the Home Assistant config folder (needed to read the Install ID).

## 1.2.0
- **Security:** the studio runs on the host network, so port 8098 was open to the whole LAN with full NVR
  control and no login. It now only answers Home Assistant ingress.
- **Security:** device passwords are no longer returned by the save and adopt endpoints.
- Fixed: saving settings in the UI could replace the real password with the `••••••••` placeholder.
- Fixed: UI settings were written to `/data/options.json`, which the Supervisor rewrites on every start
  (changes were lost). They are now kept in `/data/ui_settings.json`.
- Faster: re-connecting devices no longer freezes the UI, and viewers of the same camera share one NVR
  snapshot request (less load on the NVR with several wall panels open).

## 1.0.0
- Initial release of AJ Netweb CCTV & NVR Studio.
- Dual-brand native support: Hikvision (ISAPI) and Dahua / Amcrest (CGI / RPC).
- Auto-detection engine for NVR model, channels, and capabilities.
- Live Multi-Camera Grid Wall with 1x1, 2x2, 3x3, and 4x4 responsive layouts.
- Low-latency live video streaming via native MJPEG and high-speed snapshots.
- Full virtual PTZ controller:
  - 8-directional D-Pad virtual joystick.
  - Optical Zoom In/Out, Focus Near/Far.
  - Variable PTZ speed slider (1 to 8).
  - 16 hardware preset positions with one-click jump and save.
  - Direct viewport touch/mouse drag-to-steer.
- NVR Historical Recordings Studio:
  - Date picker and channel filtering.
  - Interactive 24-hour visual timeline bar with colored continuous vs motion event blocks.
  - Time scrubber needle with exact timestamp hover.
  - Recording clip catalog with duration and playback launcher.
- Integrated Home Assistant Ingress web interface with dark mode.
