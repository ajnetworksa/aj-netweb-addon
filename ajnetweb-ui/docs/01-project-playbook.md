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

## Step 3b — Music and prayer times (GCC standard)

1. **Music:** install **Music Assistant** (Settings → Add-ons → Music Assistant, then the Music
   Assistant integration). In Music Assistant add the client's services — YouTube Music, Spotify,
   Apple Music, Tidal, radio — and their speakers (Sonos, Cast, AirPlay/HomePod, DLNA, HA players).
   Give each speaker the right **area** in HA. The dashboard's music card picks them up automatically.
2. **Prayer & Adhan:** install **AJ Netweb Prayer & Adhan** → Setup → *Umm Al-Qura* (or the
   client's method) → upload the adhan audio the client chose (and a Fajr adhan) → tick speakers →
   tick TVs to pause → **Test adhan** with the family present. Agree offsets with the local mosque.

## Step 4 — Room photos (what makes it look premium)

1. Take a **landscape** photo of each main room in good light (no people, lights on, curtains open).
2. Crop to roughly **16:10**, ~1200 px wide, under 300 KB (any phone editor or squoosh.app).
3. Studio → **Layout** → Rooms → 📷 next to the room → pick the photo (it is resized for you).
   Or: Settings → Areas → open the area → ✏️ → **Picture** → upload.

Rooms without a photo get a soft gradient matched to the room type — fine for corridors, stores, etc.

## Step 5 — Design in the Studio

Open **Dashboard Studio** from the sidebar:

| Tab | What to do |
|---|---|
| Overview | All checks must be green. Fix anything red first. |
| Design | Title, URL (`villa-home`), language, theme, which views, room tap (sheet/page), header image |
| Layout | Drag blocks into the order the client wants, top-row cards, room order and names, cameras. **Apply** and check the preview on phone and tablet width |
| My cards (in Layout) | Anything special (irrigation, energy graph, gate buttons): add it with HA's visual editor — no YAML |
| Rooms & Devices | Untick rooms/devices the client must not see; ★ pin the 4–8 things used daily |
| House modes | Turn on, decide with the client what Away and Night do, tick the lights that must stay on, **Apply to Home Assistant** |
| Support Info | Your company, phone, email — shown on the admin-only Installer page |
| Deploy | **Deploy** → open Home and Wall Panel to check |

The dashboard updates itself when devices change. **Deploy again only after changing Studio settings.**

## Step 6 — Users and access

1. Settings → People: one user per family member. Only the owner (and you, during the project)
   are **administrators**.
2. Staff / children: non-admin users. **Room & Guest Pass Studio → User Room Matrix**: tick the rooms
   each one may see and control, **Save**. Their dashboard then contains only those rooms (lights, AC,
   shades, speakers, cameras, scenes of other rooms are simply not there). No ticks = the whole home.
3. **Room devices (wall tablets, a room's own panel):** give each tablet its own HA user (e.g.
   `panel-majlis`, non-admin), pick its **Device room** in the matrix and tick any extra rooms it may
   control. It opens on its room's controls and can't see the rest. Lock it with kiosk mode (05).
4. Visitors: guest passes (QR) — no account, and the server itself refuses anything outside their rooms.
5. The Installer page is visible to admins only.

> **How strict is it?** For family, staff and room tablets the dashboard only *contains* their rooms, and
> non-admin users can't open HA's settings, so in practice they can only control their rooms. Home
> Assistant itself has no per-device permissions for logged-in users, though: someone who knows the HA
> API could still call other devices with that user's login. Where that matters (rented rooms, a hotel,
> staff quarters), use a **permanent room pass** on that tablet instead of an HA login — passes are
> enforced by the add-on's server (HTTP 403 for anything outside the room).

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
- [ ] House modes: Away asks to confirm, then lights/AC/shades/alarm do what was agreed; Home and Night too.
      With Alexa: "Alexa, turn on Night mode" switches the chip on the dashboard.
- [ ] Cameras show pictures; tap opens live video.
- [ ] Arabic users see Arabic (if used).
- [ ] Appearance (⋯ More → *My theme & colour*): pick a colour and theme on one phone, check that person's tablet.
- [ ] Kiosk tablets: header/sidebar hidden for the panel user, ⋯ menu shows only the allowed items,
      admin can still exit kiosk mode.
- [ ] Phone (Companion app) and every wall panel tested.
- [ ] Doorbell press → notification on phones → unlock from the notification works.
- [ ] Music: search a song, play it in two rooms, move it between rooms, volume by drag.
- [ ] Adhan: test plays on every chosen speaker, TVs pause and resume, music resumes after.

## Step 10 — Handover

- [ ] Create a full backup (Settings → System → Backups) and store a copy off-site.
- [ ] Studio → Deploy & Backups: confirm a dashboard backup exists.
- [ ] Remote Access add-on activated (if sold) so you can support the client.
- [ ] Give the client: admin login (owner), how to add a scene, your support contact (it is also on
      the Installer page).
- [ ] Show every family member the ⋯ More menu (own theme, colour, wallpaper, profile).
- [ ] Remove your own admin user or downgrade it, per your support contract.

## Later: adding devices

New devices appear on the dashboard by themselves — no deploy (Tuya / Smart Life, Zigbee, Matter, …):
1. Add the device in its app / integration (Tuya cloud devices arrive in HA within a minute; otherwise
   Settings → Devices & services → Tuya → ⋮ → *Reload*).
2. Give it a **room** (area) when HA asks, or later in Settings → Devices. Without a room it shows under
   *General* and in the Installer page's **Devices without a room** list.
3. Name it the way the family says it ("Majlis spot lights"). Reload the dashboard: it's in the room
   tile, the room sheet, the Lights / Climate pages and *Right now*.
Only Studio choices (favourites, order, hidden devices) need a deploy.

1. Pair the device, put it in the right **area**, give it a good **name**.
2. That's it — it appears on the dashboard on the next page load. Pin it in the Studio if it should
   be on Home.
