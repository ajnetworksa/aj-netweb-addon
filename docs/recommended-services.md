# Recommended services alongside AJ Netweb

Install official or widely-used add-ons and integrations wherever they exist. Build our own only
for what doesn't exist yet, or what the GCC market needs (adhan, Arabic, villa intercom/CCTV studios).
Everything below works with the AJ Netweb dashboard without extra configuration.

| Need | Install | Type | Why / notes |
|---|---|---|---|
| Music (YouTube Music, Spotify, Apple Music, Tidal, radio) | **Music Assistant** | Official add-on + integration | Our music card uses it for search, favourites and moving music between rooms |
| Prayer times | **Islamic Prayer Times** | Core integration | Set up in one click by Prayer & Adhan |
| Adhan on speakers | **AJ Netweb Prayer & Adhan** | Our add-on | Pauses TVs, per-prayer volume, Fajr adhan, reminders |
| Zigbee devices | **Zigbee2MQTT** + **Mosquitto broker**, or core **ZHA** | Add-ons / core | Z2M for the widest device support; ZHA for small sites |
| Matter / Thread | **Matter Server** + **OpenThread Border Router** | Official add-ons | Needed for Matter devices; Alexa Bridge exposes HA *to* Alexa |
| Alexa voice | **AJ Netweb Alexa Bridge** | Our add-on (other repo) | Local Matter bridge, no Nabu Casa needed |
| Local Arabic voice (offline) | **Whisper** + **Piper** + **openWakeWord**, or HA Cloud | Official add-ons | Arabic speech-to-text quality is still improving; test with the family first |
| Cameras / NVR | **AJ Netweb CCTV Studio**; **go2rtc** (built into HA) | Our add-on + core | Add **Frigate** only when AI detection (people, cars) is sold |
| Door stations | **AJ Netweb Intercom** | Our add-on | Hikvision / Dahua |
| Energy and AC cost | Core **Energy** dashboard + a CT clamp meter (Shelly EM / Pro 3EM) | Core | Base for the planned energy card |
| Backups off-site | **Google Drive Backup** or HA's own cloud backup locations | Community / core | Until our managed backup service (product plan P0-6) is ready |
| Remote access | **AJ Netweb Remote Access** (or Nabu Casa) | Our add-on | Installer support and client access |
| Editing config on site | **Studio Code Server** or **File editor** | Official add-ons | Uninstall after the project if the client doesn't need it |
| Wall panels | **Fully Kiosk Browser** integration, Companion app | Core integration | Screen on/off by motion, brightness; see [05 — Wall panels](../ajnetweb-ui/docs/05-wall-panels.md) |

**Avoid** on client sites:
- **card-mod** and themes that need it: they break on HA frontend updates.
- **browser_mod**: per-browser pop-ups and kiosk control, often broken after updates. Our room sheet
  and Appearance sheet cover the common uses.
- Unmaintained HACS cards (no release in 12 months).

When you add a new service to a project, note it in the client's project file and in the handover list.
