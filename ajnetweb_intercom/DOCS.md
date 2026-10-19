# Home Assistant Add-on: AJ Netweb Intercom & Door Station Studio

## Quick Start Guide

1. **Install Add-on**:
   - Add this repository to your Home Assistant Add-on Store: `https://github.com/ajnetworksa/aj-netweb-addon`
   - Select **AJ Netweb Intercom & Door Station Studio** and click **Install**.

2. **Configure Door Station**:
   - Under the add-on **Configuration** tab (or in the Ingress Web UI **Settings** tab):
     - **host**: Enter your Door Station's LAN IP address (e.g. `192.168.1.60`).
     - **username** & **password**: Enter your admin credentials.
     - **brand**: Choose `auto`, `hikvision`, or `dahua`.
     - Customize door labels (**door_1_name** and **door_2_name**).
     - Start the add-on.

3. **Door Release & Chime**:
   - Open **Door Station** from the Home Assistant sidebar.
   - Click **UNLOCK** to trigger your electric gate or door strike.
   - When a visitor presses the doorbell, your browser will chime, show an incoming call banner, and save a photo in the Visitor Gallery.

---

## View Mode vs. Editor Mode (Kiosk & Wall Panel Safety)

To ensure household members, guests, or wall-mount touch panels cannot accidentally alter device configurations, delete stations, or modify access passes, the interface features a dual-mode engine:

### 🔒 View Mode (Default / Operator / Kiosk)
- **Visible Elements**:
  - Live Video Stream & Fast Snapshot monitor.
  - Momentary Door & Gate Release buttons (Main Gate & Pedestrian Door).
  - High-resolution Visitor Snapshot Gallery.
  - Inter-room display communication.
  - Multi-station switcher pills (view feeds across multiple door stations).
- **Hidden / Restricted Elements**:
  - SADP & ONVIF Network Scanner tab.
  - Access Passes & QR Code / PIN provisioning tab.
  - Hardware Settings, Device Adoption, Manual Station Add/Edit/Delete buttons.
  - RFID reader enrollment triggers.

### ✏️ Editor Mode (Administrator)
- Clicking the **Mode Toggle** in the top header switches instantly to **Editor Mode**.
- Unlocks full access to:
  - Network discovery and one-click station adoption.
  - Adding, editing, and deleting door stations and indoor touch displays.
  - Issuing temporary or permanent MinMoe QR codes and keypad PIN passes.
  - Hardware RFID learning mode and outdoor reader activation.
  - Mobile push notification engine settings.

Mode preferences are persisted in your browser's local storage.

---

## Two-Way Audio Architecture & Future-Proofing Analysis

### The Challenge of In-Browser Two-Way Audio
Commercial video doorbells from **Hikvision** (DS-KV8113, DS-KD8003, MinMoe access terminals) and **Dahua** (VTO2202, VTO2111) do not accept simple browser HTTP POST audio streams or standard browser WebRTC connections directly over plain HTTP.

Their speaker and microphone interfaces operate via:
1. **RTSP Backchannel (RFC 3984 / RFC 7798)**: Audio streamed from client to camera over RTP backchannel (`#backchannel=1`) encoded in **G.711u (PCMU)**, **G.711a (PCMA)**, or **G.722**.
2. **Hikvision ISAPI TwoWayAudio channel**: `/ISAPI/System/TwoWayAudio/channels/1/openDataChannel`, which requires persistent multipart chunked streaming with proprietary Hikvision audio headers and G.711 transcoding.
3. **Hikvision Private SDK**: Native C binary protocol over port 8000 (`NET_DVR_StartVoiceCom_MR_V30`).

### Architectural Comparison

| Feature | **AJ Netweb Intercom Studio** | **Advanced Camera Card (go2rtc)** | **hikvision-doorbell (MQTT)** |
| :--- | :--- | :--- | :--- |
| **Primary Focus** | Access control, RFID provisioning, door relays, mobile push, multi-device management | Real-time video/audio streaming engine & WebRTC player | Event bridge to Home Assistant via MQTT |
| **Two-Way Audio** | Inter-display WebRTC & audio listen | Real-time WebRTC microphone to camera RTSP backchannel | SIP PBX or Asterisk bridge required |
| **Audio Latency** | Sub-250ms (Display to Display) | **Sub-150ms** (Browser to Camera Speaker) | Variable depending on SIP setup |
| **Door Relays (1 & 2)**| Native 1-click momentary pulse | Requires HA service call scripts | Relies on MQTT switch topics |
| **RFID / Card Learning** | **Built-in outdoor reader hardware punch learning** | Not available | Not available |
| **QR / PIN Pass Issuer** | **Direct MinMoe ISAPI memory push** | Not available | Not available |
| **Device Discovery** | **Embedded SADP & ONVIF scanner** | Manual RTSP URL configuration | Manual IP entry |
| **Cloud-Free Push** | **Dynamic iOS & Android Companion App Push** | Standard HA automation needed | Standard HA automation needed |

### Recommended Future-Proof Architecture: The Perfect Pair
For the ultimate smart home intercom experience, the industry-standard architecture is:
1. **AJ Netweb Intercom Studio**: Acts as the centralized hardware manager, handling ISAPI access control, electric strike releases, visitor snapshots, zero-cloud mobile alerts, and RFID card enrollment.
2. **Advanced Camera Card (`go2rtc`)**: Handles the live video stream and WebRTC two-way audio talkback. Because `go2rtc` specializes in media transcoding, it bridges browser audio (Opus) directly into Hikvision/Dahua RTSP backchannels (`rtsp://admin:pass@IP:554/Streaming/Channels/101#backchannel=1`).

#### Recommended `go2rtc.yaml` Configuration for Hikvision Door Station:
```yaml
streams:
  front_doorbell:
    - rtsp://admin:YourPassword@192.168.1.60:554/Streaming/Channels/101#backchannel=1
    - ffmpeg:front_doorbell#audio=opus
```

#### Advanced Camera Card Lovelace Configuration:
```yaml
type: custom:advanced-camera-card
cameras:
  - camera_entity: camera.door_station
    live_provider: go2rtc
    go2rtc:
      stream: front_doorbell
    menu:
      buttons:
        microphone:
          mode: momentary
```

---

## Outdoor RFID Reader Learning Mode (Hardware Punch)

When issuing access passes for keycards, fobs, or stickers without visible printed serial numbers:
1. Switch the add-on to **Editor Mode**.
2. Open the **Access Passes & QR** tab.
3. Scroll to **Outdoor Reader Hardware Learning Mode**.
4. Click **🎴 Activate Outdoor Reader (Punch Card to Enroll)**.
5. Walk up to the outdoor door station and swipe your card against the reader.
6. The door station beeps, captures the Mifare 13.56MHz or EM 125kHz UID, and sends it directly to the add-on via ISAPI.
7. The captured card number is automatically inserted into the guest pass creation form!

---

## Dynamic Mobile Push Notifications (Hik-Connect / DMSS Engine)

The add-on features an automated, zero-maintenance notification system modeled after commercial apps like **Hik-Connect** and **Dahua DMSS**:

### Key Advantages:
- **No Hardcoded Device Entity IDs**: Dynamically discovers every active iOS & Android mobile companion app registered in Home Assistant in real time.
- **Rich Actionable Lock-Screen Buttons**:
  - `🔓 Unlock Main Gate`: Instantly opens relay 1 right from your lock screen.
  - `🔓 Unlock Pedestrian Door`: Instantly opens relay 2.
  - `📹 View Live Camera`: Deep-links directly to the Door Station video feed.
- **Live Visitor Photo Attached**: High-resolution snapshot preview is mirrored to Home Assistant's local web server (`/local/ajnetweb_intercom/latest_ring.jpg`) and attached directly to the push notification.
- **Critical Audio Chime**: Bypasses silent switches and Do Not Disturb on iOS and Android so you never miss a visitor.
- **Zero YAML Automations Required**: A built-in Home Assistant WebSocket listener intercepts lock-screen action button taps (`mobile_app_notification_action`) and fires the door relay automatically.

---

## Home Assistant Automations & REST Integration (Optional)

### 1. Trigger Door Unlock via HTTP GET
```yaml
rest_command:
  unlock_main_gate:
    url: "http://127.0.0.1:8097/api/unlock?door=1"
    method: GET

  unlock_pedestrian_door:
    url: "http://127.0.0.1:8097/api/unlock?door=2"
    method: GET
```

### 2. Doorbell popup on the dashboard (AJ Netweb Dashboard Suite 3.6.0+)
- On a ring, `sensor.ajnetweb_doorbell` turns `ringing` for 60 seconds. Every screen with the AJ Netweb
  dashboard open shows a full-screen popup: the live door camera and **Open** buttons (tap twice).
- Each door gets a helper, `input_button.ajnetweb_open_door_1` / `_2`. Pressing it opens the door, so you can
  also put it on any dashboard, give it to Alexa, or use it in automations ("open the gate when the car
  arrives"). Anyone with a Home Assistant login can press it, just like the lock-screen button.
- The camera shown is the add-on option `doorbell_camera_entity`, else the first door-like camera.
- Who sees the popup: Dashboard Studio → Design → Kiosk & menu → *Doorbell popup*.

### 3. Native Event Bus Hooks
- `ajnetweb_doorbell_ring`: Dispatched on doorbell button press (ideal for smart speaker chimes or flashing smart lights).
- `ajnetweb_door_unlocked`: Dispatched on electric strike release with door ID, label, and trigger source.

## Licence

This add-on works only on a Home Assistant activated by AJ Netweb. Normally there is nothing to do here:
when **AJ Netweb Remote Access** is activated on this Home Assistant, it licenses every AJ Netweb add-on
automatically. Sites without Remote Access: open the add-on (or Dashboard Studio → Licence), copy the
**Install ID**, send it to AJ Netweb and paste the licence key you receive. Without either, the add-on runs
for 14 days, then shows the activation screen only.
