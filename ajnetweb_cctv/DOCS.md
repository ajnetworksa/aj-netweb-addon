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
   - You will see all your cameras connected to the NVR appear on the live grid wall.

## PTZ Controls
- Click on any camera with PTZ support or navigate to the **PTZ Control** tab.
- Use the virtual 8-direction D-pad to pan and tilt.
- Adjust the speed slider to control movement velocity.
- Use the **Zoom In (+)** and **Zoom Out (-)** buttons for optical magnification.
- Select **Go To** to jump to saved presets 1 through 16, or select **Save Position** to store your camera's current angle.

## Playback & Recordings
- Navigate to the **NVR Playback** tab.
- Choose a camera channel and pick a date.
- Click **Search Recordings** to pull the timeline directly from your NVR storage.
- The 24-hour bar shows green blocks for continuous recording and red blocks for motion/event detection.
- Click anywhere on the timeline or select a clip from the list to begin video playback.
