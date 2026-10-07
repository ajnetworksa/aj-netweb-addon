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

## Dynamic Mobile Push Notifications (Hik-Connect / DMSS Engine)

The add-on features an automated, zero-maintenance notification system modeled after commercial apps like **Hik-Connect** and **Dahua DMSS**:

### Why It's Better Than Standard Home Assistant Automations:
- **No Hardcoded Device Entity IDs**: Traditional HA scripts break whenever a user deletes/reinstalls the app or buys a new phone because the `notify.mobile_app_*` entity name changes.
- **Automatic Device Discovery**: When someone presses the doorbell, the add-on dynamically discovers every active iOS & Android mobile companion app registered in Home Assistant in real time.
- **Rich Actionable Lock-Screen Buttons**:
  - `🔓 Unlock Main Gate`: Instantly opens relay 1 right from your lock screen.
  - `🔓 Unlock Pedestrian Door`: Instantly opens relay 2.
  - `📹 View Live Camera`: Deep-links directly to the Door Station video feed.
- **Live Visitor Photo Attached**: High-resolution snapshot preview is mirrored to Home Assistant's local web server (`/local/ajnetweb_intercom/latest_ring.jpg`) and attached directly to the push notification.
- **Critical Audio Chime**: Bypasses silent switches and Do Not Disturb on iOS and Android so you never miss a visitor.
- **Zero YAML Automations Required**: A built-in Home Assistant WebSocket listener intercepts lock-screen action button taps (`mobile_app_notification_action`) and fires the door relay automatically.

---

## Home Assistant Automations & REST Integration (Optional)

If you wish to trigger the door release from third-party scripts, Lovelace buttons, or Siri Shortcuts:

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

### 2. Native Event Bus Hooks
The add-on fires events into Home Assistant Core on every action:
- `ajnetweb_doorbell_ring`: Dispatched on doorbell button press (ideal for smart speaker chimes or flashing smart lights).
- `ajnetweb_door_unlocked`: Dispatched on electric strike release with door ID, label, and trigger source.

