# Home Assistant Add-on: AJ Netweb Room & Guest Pass Studio

## Overview

Home Assistant lacks a granular native Role-Based Access Control (RBAC) system for restricting access to specific rooms or areas. Previously, installers and homeowners had to:
1. Search for internal 32-character User UUIDs buried deep inside Home Assistant.
2. Manually write conditional YAML code (`visible: - user: <uuid>`) for every single dashboard view and card.
3. Edit YAML files every time a new family member, guest, or cleaner needed access.

**AJ Netweb Room & Guest Pass Studio** completely solves this problem with a visual, zero-YAML access management suite.

---

## Key Features

### 1. Instant Guest Passes & QR Codes (Zero App, Zero Account)
- **1-Click Room Selection**: Choose one or multiple rooms to share (e.g. Living Room, Guest Bedroom, Balcony).
- **Time-Limited Expiration**: Set automatic expiration (3 Hours, 24 Hours, 3 Days, 1 Week, or Permanent).
- **Instant QR Code & WhatsApp Link**: Guests scan the QR code with their iPhone or Android camera—no Home Assistant app download or user account creation needed.
- **Mobile Guest Web App**: Opens a clean mobile controller showing ONLY their authorized room devices (Lights, AC temperature, Curtains, Switches).
- **Printable Welcome Cards**: 1-click printable room pass card for nightstands, refrigerators, or Airbnb rentals.

### 2. Visual User Room Permission Matrix (For Companion App Users)
- Visual grid of all registered Home Assistant users (family members, kids, maids) vs Home Assistant Areas.
- Check / uncheck room boxes on the screen with your mouse or finger.
- **⚡ 1-Click Sync to HA Dashboards**: Automatically updates Lovelace view visibility rules using Home Assistant's internal API. Zero manual YAML editing!

### 3. Scoped Security Engine & Audit Log
- Cryptographically signed bearer tokens strictly isolate commands.
- If a guest attempts to control a lock or light outside their assigned room, the request is immediately blocked with `HTTP 403 Forbidden`.
- Real-time audit log records every action taken by guests and family members.

---

## Quick Start

1. Open **Room Access** from the Home Assistant sidebar.
2. To share rooms with a guest:
   - Click **Create New Room Pass**.
   - Select the room(s) and expiration duration.
   - Click **Generate Pass & QR Code**.
   - Show the QR code to your guest or click **Send via WhatsApp**.
3. To manage family member permissions:
   - Go to the **User Room Matrix** tab.
   - Check or uncheck rooms for each user.
   - Click **Save Permissions** and **⚡ 1-Click Sync to HA Dashboards**.
