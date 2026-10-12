# AJ Netweb Intercom & Door Station Studio for Home Assistant

Professional all-in-one Video Intercom, Door Station, and Access Terminal Studio for Hikvision and Dahua VTO hardware. Real-time doorbell ring chimes, instant dual-relay electric gate release, hardware RFID card punch learning, MinMoe QR & PIN provisioning, and dynamic companion mobile push alerts for Home Assistant.

![Door Station](https://raw.githubusercontent.com/ajnetworksa/aj-netweb-addon/main/ajnetweb_intercom/icon.png)

## Features

- **Dual-Brand Compatibility**: Seamless integration with Hikvision Villa & Modular Video Intercoms (ISAPI) and Dahua / Amcrest VTO Door Stations (CGI/RPC).
- **🔒 View Mode vs ✏️ Editor Mode**: Kiosk and wall-panel safety toggle. View Mode restricts guests/family to live feed, snapshots, and gate unlock, preventing accidental device configuration changes or deletion.
- **🎴 Outdoor RFID Hardware Learning Mode**: Tap to activate outdoor reader learning mode; swipe any physical Mifare or EM card/key fob on the outdoor station to capture its number automatically.
- **🎫 MinMoe Guest Passes (QR & PIN)**: Directly provisions temporary or permanent PINs and QR tokens onto Hikvision MinMoe terminals (DS-K1T502, DS-K1T671, DS-K1T342) without Hik-Partner Pro or terminal web logins.
- **⚡ Dual Door & Gate Release**: Momentary electric strike pulse for Door 1 (Main Gate) and Door 2 (Pedestrian Door).
- **📱 Dynamic Mobile Push Notifications**: Zero-YAML notifications modeled after Hik-Connect and DMSS. Discovers all active mobile companion apps, sends critical alerts, and attaches live visitor photos with lock-screen unlock buttons.
- **🔍 Embedded SADP & ONVIF Scanner**: Auto-discovers IP intercoms, indoor stations, and NVRs on your local network.
- **🎙️ Future-Proof Two-Way Audio Integration**: Native inter-display calling + full architectural support for pairing with `go2rtc` and `Advanced Camera Card` for sub-second RTSP backchannel talkback.
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
push_notify_mode: all_mobile_devices
critical_push_sound: true
```

All settings can also be modified directly within the Ingress Web UI!
