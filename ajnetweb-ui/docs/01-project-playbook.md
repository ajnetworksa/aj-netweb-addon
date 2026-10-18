# 1. Project playbook — from site survey to handover

The step-by-step process for every AJ Netweb installation. Follow it in order; most "ugly
dashboard" problems come from skipping steps 2–4, not from the dashboard itself.

---

## Step 0 — Before you go to site

- [ ] Get the floor plan and a room list from the client (names they actually use: "Majlis",
      "Mama's room", not "Room 3").
- [ ] Agree the **language** (English / Arabic) and **who uses what**: owner, family, staff, guests.
- [ ] Note the devices per room: lights (dimmable or not), AC, curtains, cameras, intercom, gates, sensors.
- [ ] Decide the **wall panels**: which rooms, which tablet model, portrait or landscape.
- [ ] Ask for 1 good photo per main room (or take them on site, see Step 4).

## Step 1 — Home Assistant base

1. Install Home Assistant OS, run onboarding, set **location, time zone, units, language**.
2. Settings → System → General: set the **home name** (shown in the dashboard header).
3. Update Home Assistant to the latest release (the UI kit needs **2024.11+**).
4. Add the AJ Netweb add-on repository (Settings → Add-ons → Add-on store → ⋮ → Repositories):
   `https://github.com/ajnetworksa/aj-netweb-addon`
5. Install: **Dashboard Suite** (always), plus Intercom / CCTV / Room & Guest Pass / Remote Access /
   Alexa Bridge as the project needs.
6. Add to `configuration.yaml` once, then restart:

   ```yaml
   frontend:
     themes: !include_dir_merge_named themes
   ```

## Step 2 — Floors and Areas (the most important step)

The dashboard is built **from Areas**. Good areas = good dashboard.

1. Settings → Areas, labels & zones → **Floors**: create Ground Floor, First Floor, Roof, Outdoor…
   Set the **level** number (0, 1, 2…) so they sort correctly.
2. **Areas**: one per real room, using the client's names. Assign each area to its floor.
3. Give each area an **icon** (optional — a sensible one is guessed from the name).
4. Do **not** create areas for technical spaces you don't want on the dashboard (or hide them in
   the Studio later).

## Step 3 — Devices and naming

1. Pair/integrate every device. Assign **every device to its area** (device page → ✏️ → Area).
   Entities follow their device's area automatically.
2. **Name devices short and in the room's language**. The dashboard strips the room name, so
   "Majlis Chandelier" shows as **Chandelier** inside the Majlis and as **Majlis Chandelier** on Home.
   Keep names under **32 characters** (Matter/Alexa limit).
3. **Hide noise**: configuration entities (child lock, LED mode, calibration…) are filtered out
   automatically when the integration marks them as *config/diagnostic*. Anything else that should
   never appear: entity settings → **Visible: off**, or exclude it in the Studio.
4. **Gates and door strikes** exposed as switches: include `gate`, `strike` or `door relay` in the
   entity id or name, so they are recognised as *Access* (tap-twice confirmation).
5. **Light switches** (relays that drive lights): put `light`, `lamp`, `spot`, `led`, `chandelier`…
   in the name, so they appear with lights. Real sockets: set *Show as → Outlet*.
6. Create **scenes** for the moments the client cares about (Welcome, Cinema, Goodnight, Guests…)
   and assign each scene to an area — room scenes show in that room, house scenes on Home.

## Step 4 — Room photos (what makes it look premium)

1. Take a **landscape** photo of each main room in good light (no people, lights on, curtains open).
2. Crop to roughly **16:10**, ~1200 px wide, under 300 KB (any phone editor or squoosh.app).
3. Settings → Areas → open the area → ✏️ → **Picture** → upload.

Rooms without a photo get a soft gradient matched to the room type — fine for corridors, stores, etc.

## Step 5 — Design in the Studio

Open **Dashboard Studio** from the sidebar:

| Tab | What to do |
|---|---|
| Overview | All checks must be green. Fix anything red first. |
| Design | Title, URL (`villa-home`), language, theme, which views, room tap (sheet/page), header image |
| Rooms & Devices | Untick rooms/devices the client must not see; ★ pin the 4–8 things used daily |
| Support Info | Your company, phone, email — shown on the admin-only Installer page |
| Deploy | **Deploy** → open Home and Wall Panel to check |

The dashboard updates itself when devices change. **Deploy again only after changing Studio settings.**

## Step 6 — Users and access

1. Settings → People: one user per family member. Only the owner (and you, during the project)
   are **administrators**.
2. Staff / guests: non-admin users. Use **Room & Guest Pass Studio** to limit which room pages they
   see, and guest passes (QR) for visitors.
3. The Installer page is visible to admins only.

## Step 7 — Phones

1. Install the **Home Assistant Companion app**, log in with each person's user.
2. App settings → **Default dashboard**: choose the AJ Netweb dashboard.
3. Allow notifications (intercom doorbell calls arrive as notifications).

## Step 8 — Wall panels

See [05 — Wall panels](05-wall-panels.md). Short version: Companion app or Fully Kiosk Browser,
open `/<url>/tablet`, screen always on, auto-start on boot.

## Step 9 — Test checklist (do it with the client)

- [ ] Every room opens and shows the right devices; no technical entities visible.
- [ ] Lights: tap toggles, drag dims. Curtains: tap open/close, drag sets position.
- [ ] AC: + / − changes the target, tap switches on/off.
- [ ] Gate/lock: first tap shows "Tap again to confirm", second tap opens.
- [ ] Scenes run. "All lights off" asks for confirmation.
- [ ] Cameras show pictures; tap opens live video.
- [ ] Arabic users see Arabic (if used).
- [ ] Phone (Companion app) and every wall panel tested.
- [ ] Doorbell press → notification on phones → unlock from the notification works.

## Step 10 — Handover

- [ ] Create a full backup (Settings → System → Backups) and store a copy off-site.
- [ ] Studio → Deploy & Backups: confirm a dashboard backup exists.
- [ ] Remote Access add-on activated (if sold) so you can support the client.
- [ ] Give the client: admin login (owner), how to add a scene, your support contact (it is also on
      the Installer page).
- [ ] Remove your own admin user or downgrade it, per your support contract.

## Later: adding devices

1. Pair the device, put it in the right **area**, give it a good **name**.
2. That's it — it appears on the dashboard on the next page load. Pin it in the Studio if it should
   be on Home.
