# Alexa Matter Bridge — Add-on Documentation

## What This Does

This add-on bridges your Home Assistant entities to Amazon Alexa using the **Matter** protocol — entirely over your local network.

- **No Nabu Casa subscription** required
- **No Amazon cloud auth tokens** that expire and break your setup
- **Device control stays on your LAN** — works even during internet outages
- **One-time pairing** — pair once, it stays paired

### How It Works

```
Alexa App (voice) → Amazon Cloud (voice only) → Echo Device
Echo Device → [YOUR LAN] → Matter Bridge (this add-on) → Home Assistant
```

The voice processing goes through Amazon's servers. The actual **device commands** travel over your local network via the Matter protocol — no cloud hop.

---

## Requirements

### Hardware
- A **Matter-compatible Echo device** (at least one):
  - Echo (4th gen or later)
  - Echo Show 8/10 (2nd gen or later)  
  - Echo Show 15
  - Echo Hub
  - Echo Studio (2nd gen)
  - Echo Dot (5th gen or later)
  
  **Check:** Alexa App → Devices → Echo & Alexa → [device] → Settings → look for "Matter"

### Network
- HA and Echo devices on the **same subnet** (or mDNS bridged between VLANs)
- Port `5540` (UDP + TCP) reachable from Echo devices to HA IP
- mDNS/multicast enabled (most home routers: already on)

---

## Configuration

| Option | Default | Description |
|--------|---------|-------------|
| `matter_port` | `5540` | Matter commissioning port (standard, rarely change) |
| `log_level` | `info` | Log verbosity: `debug`, `info`, `warn`, `error` |
| `auto_expose_label` | `alexa` | HA label name that marks entities for Alexa |
| `backup_commissioning` | `true` | Auto-backup pairing data every 6 hours |
| `excluded_entity_prefixes` | see below | Entity domain prefixes to never expose |

### Excluded by Default
`automation.`, `scene.`, `script.`, `group.`, `device_tracker.`, `person.`, `zone.`, `timer.`, `input_boolean.`, `input_number.`, `input_select.`, `input_text.`, `input_datetime.`, `counter.`

---

## First Setup

### Step 1 — Expose entities
Go to **Home Assistant → Settings → Entities**, find an entity (light, switch, etc.) and add the label **`alexa`** to it.

Alternatively, use the add-on's **Web UI** (click "Open Web UI" in the add-on page) to see which entities are currently exposed.

### Step 2 — Pair with Alexa (one time only)
1. In the add-on Web UI, click **"Open Matterbridge UI"**
2. Find the **Pairing Code** (6-digit or QR code)
3. Open the **Alexa App** → Devices → `+` → Add Device → Matter → "Yes, it has a code"
4. Enter or scan the code

That's it. Alexa now discovers all labeled entities.

### Step 3 — Test local control
Disconnect your internet (turn off your router's WAN port). Say "Alexa, turn on [device]". It should still work — proving local Matter control is active.

---

## Commissioning Backup

The add-on automatically backs up commissioning data (the cryptographic pairing keys) every 6 hours to `/data/commissioning_backup.tar.gz`.

If you reinstall Home Assistant:
1. Restore the backup file to the same path before starting the add-on
2. The add-on restores it automatically on startup
3. Alexa reconnects within ~30 seconds — **no re-pairing needed**

You can also trigger a manual backup from the Web UI.

---

## Supported Entity Types

| Type | Alexa Sees |
|------|-----------|
| `light` | Light (with dimming, color if available) |
| `switch` | Smart Plug / Switch |
| `binary_sensor` | Contact Sensor, Motion Sensor |
| `sensor` | Temperature, Humidity sensors |
| `cover` | Blinds, Garage Door |
| `climate` | Thermostat |
| `fan` | Fan |
| `lock` | Smart Lock |
| `media_player` | ❌ Not supported via Matter |
| `camera` | ❌ Not supported via Matter |

---

## Device Limit

Alexa supports up to ~100 devices per Matter bridge. If you have more, contact support — multiple bridge instances can be configured.

---

## Troubleshooting

### Alexa can't discover devices
- Check that port 5540 is not blocked by your router/firewall
- Ensure Echo and HA are on the same subnet
- Re-open the Alexa App → Devices → Discover Devices

### Entities not appearing
- Verify the entity has the `alexa` label in HA
- Check add-on logs for WebSocket connection errors
- Make sure the entity domain is not in the excluded list

### Re-pairing after HA reinstall
- If no backup: re-pair from scratch using the Alexa app (new pairing code)
- If backup exists: restore backup file and restart the add-on

---

## Support

Built by **AJ Network Solutions** for reliable, local smart home control.
