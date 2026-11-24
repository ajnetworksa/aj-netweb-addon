# Changelog

## 1.2.1
- **Moved** into the AJ Netweb add-on repository (`ajnetworksa/aj-netweb-addon`); it had its own repository
  (`ajnetworksa/alexa_bridge`). Sites that installed it from the old repository: back up the Matter commissioning on
  the add-on page, add the AJ Netweb repository, install this one, restore.
- **Fixed: clash with Music Assistant.** The add-on runs on the host network and its page used port 8095 – Music
  Assistant's own port – so one of the two could not start. The page now uses 8285 (opened through the sidebar as
  before). Matterbridge's web UI stays on 8283, Matter on 5540.

## 1.2.0
**New**
- **Voice commands** section on the add-on page: house modes, scenes, ACs, AC pre-cooling and the adhan
  controls, each with the sentence to say ("Alexa, turn on Away mode", "Alexa, set Majlis AC to 22 degrees").
  One switch per item, or **Expose all**.
- The Prayer & Adhan helpers get short names Alexa can hear when they are exposed from there ("Adhan",
  "Mute next adhan", "Play adhan", "Stop adhan", "AC pre-cooling"), unless someone already renamed them in HA.
- Alarm arming scripts (`script.ajnetweb_alarm_arm_*`) appear as their own group when they exist. Disarming by
  voice is never offered.

**Fixes**
- The default *excluded* list blocked scripts, scenes and input helpers, so house modes and scenes could never
  reach Alexa even when labelled. They are no longer in the default. An installed add-on still on the old
  default list is treated as the new one; a list the installer changed is kept as it is, and the page says when
  it blocks voice commands.

## 1.1.0
**Fixes**
- The plugin config was written to `/data/matterbridge/AlexaBridge/`, which Matterbridge never reads, with
  option names the plugin doesn't know (`exposeLabel`, `excludedPrefixes`, `deviceTypes`). The plugin started with
  no token and no filter. It is now written to `/data/.matterbridge/matterbridge-hass.config.json` with the real keys
  (`filterByLabel`, `entityBlackList`).
- Connect through the Supervisor proxy (`ws://supervisor/core/websocket`) with the add-on token. The hostname
  `homeassistant` doesn't resolve for host-network add-ons, and the add-on token isn't valid on port 8123.
- Expose / hide never worked: `entity-manager.sh` used an unset variable (crashed under `set -u`) and a REST endpoint
  that doesn't exist. Labels are now set through the entity registry WebSocket API.
- The exposed-devices list was always empty (labels aren't state attributes).
- The page used absolute `/api/...` URLs, which fail behind ingress.
- The backup archived the unused config folder instead of the Matter pairing. It now saves `matterstorage` +
  `storage` to `/share/alexa_bridge/`, which survives uninstalling the add-on.
- The status UI was reachable by anyone on the LAN on port 8098 without login. It now answers ingress only.

**Changes**
- Status UI moved to port 8095 (8098 is used by AJ Netweb CCTV Studio on the host network).
- Pinned stable releases: Matterbridge 3.10.14 + matterbridge-hass 1.5.0 (was a dev build), installed globally so
  there is a single copy of the Matterbridge core (removes the need for the platform brand-check patch).
- Compatibility patch is applied at build time and fails the build if upstream code changes.
- Removed avahi/dbus (matter.js has its own mDNS) and `build.yaml` restored with pinned base images.

**New**
- QR code and manual pairing code shown in the add-on page, pairing status.
- Device picker with search, room grouping, "expose recommended", warnings for names over 32 characters.
- One-click restart, backup now, restore, and log viewer.
