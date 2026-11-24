# Alexa Matter Bridge (AJ Netweb)

Local Alexa control for Home Assistant through Matter, powered by
[Matterbridge](https://github.com/Luligu/matterbridge) and
[matterbridge-hass](https://github.com/Luligu/matterbridge-hass). No cloud skill, no Nabu Casa.

## Install
Settings → Add-ons → Add-on store → ⋮ → Repositories → add `https://github.com/ajnetworksa/alexa_bridge`,
then install **Alexa Matter Bridge** and start it.

## Use
1. Open **Alexa Bridge** in the sidebar.
2. Switch on the devices Alexa should see (or press **Expose recommended**), then **Restart bridge**.
3. Alexa app → Devices → + → Add Device → Other → Matter → scan the QR code shown on the page.

Requirements: a Matter-capable Echo, phone and Home Assistant on the same network, IPv6 not disabled on the Home Assistant host (Matter needs it).

## Voice commands
The **Voice commands** section lists what AJ Netweb adds for voice, with the sentence to say:
house modes (*Alexa, turn on Away mode*), scenes, ACs (*Alexa, set Majlis AC to 22 degrees*), AC pre-cooling and
the adhan (*Alexa, turn on Mute next adhan*). Matter has no alarm panel or mode list, so modes, scenes and
helpers reach Alexa as switches you turn on. After exposing, press **Restart bridge**; Alexa finds the new
devices by itself (or say *Alexa, discover devices*). In the Alexa app you can put them in routines, e.g.
*"Alexa, good night"* → turn on Night mode.

## How it works
- "Exposed" means the entity has the Home Assistant label set in `auto_expose_label` (default `alexa`).
  You can also label whole devices in HA; the plugin picks those up too.
- The bridge connects to Home Assistant through the Supervisor, so no long-lived token is needed.
- The pairing is backed up to `/share/alexa_bridge/` every 6 hours and restored automatically after a re-install.
- Advanced options (split entities, name postfix…) can be edited in the Matterbridge UI on port 8283 and are kept
  across restarts. Set a password there (Settings → Matterbridge → password), because that UI is reachable on the LAN.

## Options
| Option | Default | Meaning |
|---|---|---|
| `matter_port` | 5540 | Matter port |
| `log_level` | info | Matterbridge log level |
| `auto_expose_label` | alexa | HA label that marks devices for Alexa |
| `backup_commissioning` | true | Back up pairing every 6 h |
| `excluded_entity_prefixes` | automation., group., … | Domains never exposed, even if labelled. Keep `script.`, `scene.`, `input_boolean.` and `input_button.` out of it for voice commands. |
