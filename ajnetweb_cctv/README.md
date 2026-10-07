# AJ Netweb CCTV & NVR Studio for Home Assistant

Professional all-in-one Hikvision & Dahua CCTV Camera Viewer, Multi-channel Grid, Full PTZ Controller, and NVR Playback Timeline for Home Assistant.

![CCTV Studio](https://raw.githubusercontent.com/ajnetworksa/aj-netweb-addon/main/ajnetweb_cctv/icon.png)

## Features

- **Multi-Brand Compatibility**: Seamless native integration with both Hikvision (ISAPI) and Dahua / Amcrest / Lorex (HTTP CGI & RPC) NVRs and DVRs.
- **Auto-Detection**: Automatically discovers NVR model, active IP camera channels, PTZ capabilities, and stream configurations.
- **Live Multi-Camera Wall**: Quad (2x2), 3x3 grid, and 4x4 wall views with instant low-latency video streaming.
- **Complete PTZ Joystick**: 8-way directional D-pad, mouse drag-to-steer, optical zoom, manual focus, speed control slider, and 16 hardware preset memory buttons.
- **NVR Historical Recordings Browser**: Search NVR storage by channel and date, interact with a 24-hour colored timeline (continuous vs motion detection), and scrub footage.
- **Zero Port Forwarding**: Uses Home Assistant Ingress for 100% secure local and remote access without exposing camera ports to the open internet.

## Configuration

In Home Assistant, navigate to **Settings** → **Add-ons** → **AJ Netweb CCTV & NVR Studio** → **Configuration**:

```yaml
nvr_brand: auto          # auto | hikvision | dahua
host: 192.168.1.100      # IP address of your NVR / DVR
http_port: 80            # HTTP API port (usually 80 or 8000)
rtsp_port: 554           # RTSP streaming port (usually 554)
username: admin          # NVR username
password: YourSecretPassword
stream_quality: sub      # sub (recommended for multi-view) | main
```

Settings can also be modified directly within the Ingress Web UI!
