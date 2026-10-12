# AJ Netweb CCTV & NVR Studio for Home Assistant

Professional all-in-one Hikvision & Dahua CCTV Camera Viewer, Multi-channel Grid Wall, Full PTZ Controller, and NVR Playback Timeline for Home Assistant.

![CCTV Studio](https://raw.githubusercontent.com/ajnetworksa/aj-netweb-addon/main/ajnetweb_cctv/icon.png)

## Features

- **Multi-Brand Compatibility**: Seamless native integration with both Hikvision (ISAPI) and Dahua / Amcrest / Lorex (HTTP CGI & RPC) NVRs and DVRs.
- **Accurate Channel Capacity Detection**: Automatically recognizes 4-channel NVRs (e.g. `DS-7604NXI`), 8-channel NVRs, 16-channel NVRs, standalone IP cameras (1-channel), and indoor touch displays without dummy channel overflow.
- **Multi-Device Surveillance Studio**: Connect and manage multiple NVRs, standalone IP cameras, and door stations in a unified camera matrix.
- **Live Multi-Camera Wall**: 1×1 Single View, 2×2 Quad View, 3×3 Grid, and All Cameras View with adaptive Fast Live double-buffered streaming.
- **Complete PTZ Joystick**: 8-way directional D-pad, optical zoom, manual focus, speed control slider, and 16 hardware preset memory buttons.
- **NVR Historical Recordings Browser**: Search NVR storage by channel and date, interact with a 24-hour colored timeline (continuous vs motion detection), and scrub footage directly through Ingress.
- **Zero Port Forwarding**: Uses Home Assistant Ingress for 100% secure local and remote access without exposing camera ports to the open internet.

## Configuration

In Home Assistant, navigate to **Settings** → **Add-ons** → **AJ Netweb CCTV & NVR Studio** → **Configuration**:

```yaml
nvr_brand: auto          # auto | hikvision | dahua
host: 192.168.1.100      # IP address of your NVR / DVR
http_port: 80            # HTTP API port (usually 80)
rtsp_port: 554           # RTSP streaming port (usually 554)
username: admin          # NVR username
password: YourSecretPassword
stream_quality: sub      # sub (recommended for multi-view) | main
```

Settings can also be modified directly within the Ingress Web UI!
