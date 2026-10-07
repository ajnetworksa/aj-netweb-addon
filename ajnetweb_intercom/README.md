# AJ Netweb Intercom & Door Station Studio for Home Assistant

Professional all-in-one Video Intercom & Door Station Controller for Hikvision and Dahua VTO hardware. Real-time doorbell ring chimes, instant door release relays, and visitor snapshot capture for Home Assistant.

![Door Station](https://raw.githubusercontent.com/ajnetworksa/aj-netweb-addon/main/ajnetweb_intercom/icon.png)

## Features

- **Dual-Brand Compatibility**: Seamless integration with Hikvision Villa & Modular Video Intercoms (ISAPI) and Dahua / Amcrest VTO Door Stations (CGI/RPC).
- **Instant Door & Gate Release**: Dual-relay control for Door 1 (Main Gate / Vehicle Lock) and Door 2 (Pedestrian Gate) with momentary unlock pulse.
- **Real-Time Doorbell Chime**: Background event listener triggers an audible Ding-Dong chime in the browser and displays a high-visibility incoming call alert banner with Answer, Decline, and Quick Unlock options.
- **Automated Visitor Snapshot Capture**: Automatically captures and archives a crisp photo whenever a visitor presses the doorbell.
- **Home Assistant Automations Ready**:
  - Unlocks door via HTTP GET/POST: `http://<ha-ip>:8097/api/unlock?door=1`.
  - Dispatches native HA events `ajnetweb_doorbell_ring` and `ajnetweb_door_unlocked` for smart home automations (smart speaker announcements, mobile phone notifications, light flashes).
- **Customizable Cyber Themes**: 5 curated themes, custom hex accent color picker, and pure OLED black mode.

## Configuration

In Home Assistant, navigate to **Settings** → **Add-ons** → **AJ Netweb Intercom & Door Station Studio** → **Configuration**:

```yaml
brand: auto                  # auto | hikvision | dahua
host: 192.168.1.60          # IP address of your Door Station
http_port: 80               # HTTP port
rtsp_port: 554              # RTSP port
username: admin             # Door station username
password: YourSecretPassword
door_1_name: Main Gate      # Relay 1 label
door_2_name: Pedestrian Door # Relay 2 label
auto_snapshot_on_ring: true # Auto snapshot when bell rings
ha_notify_on_ring: true     # Dispatch HA automation event
```

Settings can also be modified directly within the Ingress Web UI!
