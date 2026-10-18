# Home Assistant Add-on: AJ Netweb CCTV & NVR Studio

## How to Use

1. **Install Add-on**:
   - Add this repository to your Home Assistant Add-on Store: `https://github.com/ajnetworksa/aj-netweb-addon`
   - Select **AJ Netweb CCTV & NVR Studio** and click **Install**.

2. **Configure NVR Connection**:
   - In the add-on **Configuration** tab (or in the Ingress Web UI **Settings** tab):
     - Set **host** to your NVR's LAN IP address (e.g., `192.168.1.50`).
     - Set **username** and **password** for your NVR administrator or operator account.
     - Choose **nvr_brand** (`auto`, `hikvision`, or `dahua`).
     - Click **Save** and start the add-on.

3. **Open the Web UI**:
   - Click **Open Web UI** or access **CCTV Studio** from the Home Assistant sidebar.
   - You will see all camera channels connected to the NVR appear on the live grid wall.

---

## Channel Detection & Device Hierarchy

The add-on accurately identifies the physical channel capacity of your hardware:
- **4-Channel NVRs (e.g., DS-7604NXI-K1/4P, NVR4104HS)**: Exactly 4 channels (IDs 1, 2, 3, 4).
- **8-Channel NVRs (e.g., DS-7608NXI, NVR4108HS)**: Exactly 8 channels (IDs 1 through 8).
- **16-Channel NVRs (e.g., DS-7616NXI, NVR4216HS)**: Exactly 16 channels.
- **Standalone IP Cameras & Video Doorbells (e.g., DH-IPC-HDW1639T, DS-KV8113)**: Exactly 1 channel.
- **Indoor Touch Displays (e.g., DS-KH9510)**: Identified as display units (0 CCTV channels) so they do not pollute your camera matrix with dummy channels.

---

## Live Monitoring Wall

- **Multi-Layout Grid**: Toggle instantly between **1×1 Single View**, **2×2 Quad View**, **3×3 Matrix**, and **All Cameras View**.
- **Adaptive Stream Modes**:
  - **⚡ Fast Live Snapshot**: Double-buffered, ultra-low latency snapshot feed that works flawlessly through Home Assistant Ingress without dropping connections.
  - **Continuous MJPEG**: Full-frame smooth motion streaming.
- **Direct RTSP URL Export**: 1-click button on every tile to copy the authenticated RTSP stream URL for Home Assistant Lovelace or go2rtc integration.

---

## PTZ Controls

- Click on any camera with PTZ support or navigate to the **PTZ Control** tab.
- Use the virtual 8-direction D-pad to pan and tilt.
- Adjust the speed slider to control movement velocity.
- Use the **Zoom In (+)** and **Zoom Out (-)** buttons for optical magnification.
- Select **Go To** to jump to saved presets 1 through 16, or select **Save Position** to store your camera's current angle.

---

## NVR Playback & Recording Timeline

- Navigate to the **NVR Playback** tab.
- Choose a camera channel and pick a date.
- Click **Search Recordings** to pull the timeline directly from your NVR hard drive via ISAPI/CGI.
- The 24-hour bar shows green blocks for continuous recording and red blocks for motion/event detection.
- Click anywhere on the timeline or select a clip from the list to begin video playback.

## Licence

This add-on works only on a Home Assistant activated by AJ Netweb. Normally there is nothing to do here:
when **AJ Netweb Remote Access** is activated on this Home Assistant, it licenses every AJ Netweb add-on
automatically. Sites without Remote Access: open the add-on (or Dashboard Studio → Licence), copy the
**Install ID**, send it to AJ Netweb and paste the licence key you receive. Without either, the add-on runs
for 14 days, then shows the activation screen only.
