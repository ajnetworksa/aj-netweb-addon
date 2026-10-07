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

## Home Assistant Automations Integration

### 1. Trigger Door Unlock from HA Dashboard or Script
Use Home Assistant's REST command or Shell command:
```yaml
rest_command:
  unlock_front_gate:
    url: "http://127.0.0.1:8097/api/unlock?door=1"
    method: GET
```

### 2. Automate on Doorbell Ring Event
Create an automation triggered by the native event:
```yaml
alias: "Doorbell Ring Notification"
trigger:
  - platform: event
    event_type: ajnetweb_doorbell_ring
action:
  - service: notify.notify
    data:
      title: "Doorbell Ringing!"
      message: "Someone is at the front door."
```
