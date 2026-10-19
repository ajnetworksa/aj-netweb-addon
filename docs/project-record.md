# AJ Netweb platform — project record

A running record of every release. For each: what changed, why, the decisions behind it, and what
is still open. Add a section with every pull request. Newest first.

Repositories:
- `ajnetworksa/aj-netweb-addon`: add-ons, the UI kit and the docs (this repo)
- `ajnetworksa/alexa_bridge`: Alexa Matter Bridge add-on

Versions at the time of writing:

| Product | Version |
|---|---|
| Dashboard Suite + UI kit | 3.13.0 |
| Prayer & Adhan | 1.2.0 |
| Intercom & Door Station | 1.8.0 |
| CCTV & NVR Studio | 1.4.0 |
| Room & Guest Pass Studio | 1.4.0 |
| Remote Access | 1.3.0 |
| Alexa Matter Bridge | 1.2.0 (`alexa_bridge` PR #5, stacked on #4 = 1.1.0) |

---

## Alarm pack (Dashboard Suite 3.13.0) and voice through Alexa (Alexa bridge 1.2.0)

**Asked for:** items 8 and 12 of the upgrade list: an alarm pack with Alexa arming, and voice control through
Alexa instead of a local Arabic voice assistant.

**Done:**
- `ajnetweb_dashboard/alarm.py` + Studio tab *Alarm*: existing panel or our own (HA `manual` platform as a YAML
  package), sensors per arm mode, alerts automation (sirens, critical push, lights), arming scripts
  `script.ajnetweb_alarm_arm_<mode>` labelled for Alexa. Endpoints `GET /api/alarm`, `POST /api/alarm/apply`;
  project key `alarm`; strategy option `alarm` when a source is chosen. Tests in `tests/test_alarm.py`.
- `alexa_bridge` 1.2.0: *Voice commands* section (house modes, scenes, ACs, pre-cooling, adhan, alarm arming)
  with the sentence to say; the untouched old default excluded list no longer blocks scripts and scenes.

**Decisions:**
- *"Both" sources* (Mukto's card defaulted to the recommended option): villas with a panel keep it; others get ours.
- *HA's manual alarm in a package*, not a template helper: documented, stable, supports code and delays.
- *No disarm by voice or script*, ever. Arming scripts only for modes the panel arms without a code.
- *Matter has no alarm, mode-select or "play" device for Alexa*, so modes, scenes, arming and adhan controls
  reach Alexa as switches.

**Open:** house modes still arm the first alarm found; when a villa has two panels, pick it in House modes.

## Water card (Dashboard Suite 3.12.0)

**Asked for:** item 11 of the upgrade list: water tank and irrigation card (the watchdog blueprint already
existed, the dashboard showed nothing).

**Done:**
- `cards/water.js`: tanks (level gauge, litres when a capacity is set), booster pump, watering zones with last
  watered and Run / Stop; `waterEntities()` finds them by name. New `water` insight (default on) and strategy
  option `water`.
- `ajnetweb_dashboard/water.py`: the timed watering script (open, wait, close; parallel, 1-120 min), created
  by Deploy when zones exist. Tests in `tests/test_water.py`; preview mocks (`?water=0` hides them).

**Decisions:**
- *Timer inside HA, not in the browser:* a closed tablet or phone must never leave a valve open.
- *Found by name*, like the AC share: HA has no device class for tank level or irrigation.
- *Main shut-off, leak and gas valves are never zones.*
- *The old insights default still means "all"*, so existing projects get the new card when it applies.

**Open:** schedules (watering days and times) are left to HA automations or the irrigation controller's app.

## Studio: photo framing, save as scene, finger drag (Dashboard Suite 3.11.0)

**Asked for:** item 10 of the upgrade list: Studio upgrades (photo upload and crop, scene capture, drag to
reorder rooms).

**Done:**
- Photo upload and mouse drag already existed. Added a crop dialog (4:3, drag + zoom, 400-1600 px JPEG) and
  pointer-event drag on the ⋮⋮ grip for touch screens in every sortable list.
- `ajnetweb_dashboard/scenes.py`: what a scene stores per domain (light brightness and colour, cover position,
  climate mode and setpoint, fan speed, speaker volume), save through `/api/config/scene/config/<id>` (the
  scene editor's API), then put the new entity in the room's area. Endpoints `GET /api/room/now?area=` and
  `POST /api/room/scene`. Tests in `tests/test_scenes.py`.

**Decisions:**
- *Real HA scenes in scenes.yaml*, not our own store: they work from automations, Alexa and HA's scene editor.
- *Scene ids `ajnetweb_<area>_<name>`*: saving the same name in the same room again updates it.
- *Speakers and switches are unticked by default*; unavailable devices can't be ticked.
- *Gates and garage doors are never offered* (they are in the access group, not covers).

**Open:** nothing.

## Wall panel setup (Dashboard Suite 3.10.0)

**Asked for:** item 9 of the upgrade list: set up a wall tablet by QR code instead of typing URLs.

**Done:**
- `ajnetweb_dashboard/wall_panels.py`: Wall Panel URLs (browser and `homeassistant://navigate/...`), QR codes
  as SVG (segno, installed in the image), Fully Kiosk tablets from the registries, and the profile calls
  (`fully_kiosk.set_config` startURL, `fully_kiosk.load_url`, motion switch, screensaver timer and
  brightness, screen-off timer 0).
- Studio tab *Wall panels*; endpoints `GET /api/wall_panels?base=` and `POST /api/wall_panels/apply`;
  project key `wall_panel_profile`. Tests in `tests/test_wall_panels.py`.

**Decisions:**
- *HA's Fully Kiosk integration, not Fully's own provisioning QR*: its actions are public and update-proof,
  and the installer sees each step's result. Fully's settings-file keys are not documented well enough.
- *QR codes are made in the add-on*, not in the browser bundle, so nothing is added to the card suite.
- *The address defaults to HA's internal URL* (then external); the installer can override it per scan.

**Open:** confirm on a real tablet that `startURL` is the key Fully accepts through `set_config`.

## Notifications in the header (Dashboard Suite 3.9.0)

**Asked for:** item 7 of the upgrade list: a notification centre in the dashboard (doorbell, alarm, water
leak, gate left open) with history.

**Done:**
- `cards/notifications.js`: logbook-based list (doorbell rings, alarm changes, safety on, doors/gates opened),
  grouped by day, new entries marked; `custom:ajnetweb-notifications-card`.
- Header bell with a count of new entries; opens the list in the shared sheet (`openCardSheet` in
  `cards/appearance.js`, which now also passes more-info on). Strategy fills the entities; `notifications: false`.
- Preview: `logbook/get_events` mock.

**Decisions:**
- *HA's logbook, not our own store:* every user may read it, it covers time the dashboard was closed, and
  nothing new is stored on the device.
- *"New" per person per browser* (localStorage): no admin-only API is needed.
- *Windows left out* of openings: too noisy; doors, gates and garages only.
- *The "Right now" card stays* for what is wrong at this moment; the bell is for what happened.

**Open:** "gate left open for N minutes" as its own entry (needs a duration rule).

## Electricity bill estimate and AC share (Dashboard Suite 3.8.0)

**Asked for:** item 6 of the upgrade list: an energy card for SEC/DEWA bills with the AC share.

**Done:**
- Energy card: kWh this month, bill so far and projected month end (cost sensor if HA has one, otherwise a
  tiered tariff estimate), and the AC share of today's use from AC meters.
- Tariffs `sec` and `dewa` (`TARIFFS` in `cards/energy.js`), `auto` = SEC when HA's country is SA; own tiers in YAML.
- Strategy option `energy_tariff`, Studio select, preview `?cost=0` to see the estimate.

**Decisions:**
- *HA's cost sensor wins* over our estimate: it can carry the client's exact tariff.
- *No auto tariff in the UAE*: Dubai, Abu Dhabi and Sharjah have different utilities; the installer picks.
- *Estimates exclude meter and fixed fees* (they depend on the breaker size); the label says "est.".

**Open:** check the tariff figures against a current SEC and DEWA bill; ADDC/SEWA presets if needed.

## One look for every add-on (Dashboard Suite 3.7.0, Prayer 1.2.0, Intercom 1.8.0, CCTV 1.4.0, Room Access 1.4.0)

**Asked for:** "once the user chooses the appearance it should affect the other add-ons also, like door or
CCTV, so it will look one system".

**Done:**
- New `ajnetweb-ui/src/look/addon-look.js`, built to `ajnetweb_*/www/ajnetweb-look.js` (CI checks the copies).
  Inside HA (ingress, same origin) it reads the person's `ajnetweb_appearance`, the dashboard's strategy
  options and the theme list from the HA window, and sets each page's own CSS variables on `<body>`
  (a per-page map in `data-vars`), plus the wallpaper.
- The Studios' own colour pickers are hidden while it applies, with a note (English / Arabic).
- A few fixed dark shades in CCTV / Intercom / Room Access fixed for light themes.

**Decisions:**
- Reading the HA window (`home-assistant` element's `hass`) is the only way an add-on page can know who
  is logged in; it is wrapped so a page outside HA, or a future HA change, just keeps the add-on's own look.
- Remote Access left out (its page ships with the agent; not changed without being asked).
- The guest page of Room Access is not themed (guests are not HA users).

**Open:** the CCTV / Intercom video areas stay black on light themes (on purpose, for video).

---

## Personal appearance fix (Dashboard Suite 3.6.1)

**Asked for:** "if I try to change the appearance it doesn't work".

**Done:**
- The strategy now completes `hass` before building: if `hass.user` or the theme list is not there yet
  (HA builds strategy dashboards before they arrive), it fetches them with `auth/current_user` and
  `frontend/get_themes`. Before, the person's theme and wallpaper were dropped and room-scoped users
  could get the whole house on a cold start.
- The strategy has `shouldRegenerate`: rebuild when the registries, the user, the theme list or dark
  mode change (newer HA asks the strategy; older HA ignores it, the fetch above covers it).
- Preview: `?late=1` builds the dashboard without user and themes, like a cold start.

**Decisions:** fetch instead of waiting, so it works on every HA version.

**Open:** none.

---

## Doorbell popup on the wall panels (Dashboard Suite 3.6.0, Intercom 1.7.0)

**Asked for:** "doorbell popups on the wall panels".

**Done:**
- Intercom 1.7.0 publishes `sensor.ajnetweb_doorbell` (ringing for 60 s, doors / snapshot / camera) and
  creates `input_button.ajnetweb_open_door_N` helpers; a press (any source) opens that door.
- UI kit: `custom:ajnetweb-doorbell-card` watcher on every page → full-screen popup with live camera,
  tap-twice Open buttons, Dismiss, auto-close, chime, Fully Kiosk screen wake, Arabic RTL.
- Kiosk rule `doorbell` (who gets the popup) in the Studio; tests for the sensor payload and press mapping.

**Decisions:**
- *A sensor, not an event:* HA lets only admins subscribe to custom events; every user can read states.
- *input_button helpers to open:* any user may press a helper, the add-on (admin token) sees the
  `call_service` event. No add-on port is exposed to the browser, and the same helper works for Alexa,
  tiles and automations.
- *Live view with `camera_proxy_stream`* (HA's own signed MJPEG stream) instead of WebRTC: works for every
  camera and every browser, no extra component. Two-way talk stays in the Intercom page.

**Open:** test on a real Hikvision/Dahua station: ring → popup latency, MJPEG load on cheap tablets,
sound autoplay in the Companion app.

## PR #10 + #11 — House modes (Dashboard Suite 3.5.0)

**Asked for:** house modes (home, away, night) in the installer dashboard, wired through the Alexa bridge
(product plan item 8).

**Done:**
- Studio → **House modes**: Home / Away / Night / Guests with per-mode lights, AC, shades, music & TV, alarm
  and a scene to run; a list of lights no mode turns off; Alexa on/off. Saved in `project.json` (`house_modes`).
- Apply (and Deploy) writes `input_select.ajnetweb_house_mode`, `script.ajnetweb_mode_<mode>` and
  `automation.ajnetweb_house_modes` through HA's own APIs (input_select collection, script/automation config
  API, label and entity registries). Scripts of modes switched off are removed.
- `custom:ajnetweb-modes-card` and a new `modes` band (Home and Wall Panel, after the header).
- Tests: `tests/test_house_modes.py` (runs with the automatic checks).

**Decisions:**
- *The helper is the single source of truth, one automation does the work.* The dashboard, Alexa (via the
  scripts) and any automation only change the mode; the automation applies it. Nothing depends on the
  add-on running.
- *Scripts for Alexa*, not the input_select: Matterbridge exposes an input_select as a Matter mode-select,
  which Alexa can't drive; scripts become on/off switches ("turn on Away mode").
- *Entity lists from discovery at Apply time*, so gates and garage doors (the `access` group) are never closed
  by a mode and the Studio's excluded devices and hidden rooms are respected. Cost: Apply again after
  adding devices.
- *Not on restart:* the automation ignores the change from `unavailable` when HA starts, so a restart never
  re-arms the alarm or switches lights off.
- *Never disarm by default:* a mode that disarms can be triggered by voice without Alexa's PIN.

**Open:**
- Not tested on a real HA yet (tested with a fake HA, the preview and the Studio locally).
- Ramadan mode and adhan zones per mode (product plan item 8 mentions both).
- Alarm panels that need a code to arm: the mode can't arm them (no code is stored).
- `alexa_bridge`: `setup-matterbridge.sh` writes the plugin config to `/data/matterbridge/AlexaBridge/` with
  keys matterbridge-hass doesn't know (`exposeLabel`, `excludedPrefixes`); Matterbridge reads
  `/data/.matterbridge/matterbridge-hass.config.json` (`filterByLabel`, `entityBlackList`). So the label
  filter only works where it was set in the Matterbridge UI. The bridge UI's label list and expose buttons use
  REST endpoints HA doesn't have. Needs its own fix.

---

## PR #7 — Edit the dashboard without YAML (Dashboard Suite 3.4.0)

**Asked for:** "something still feels missing, and the dashboard feels YAML-based if it needs editing".

**Done:**
- Studio → **Layout** tab: drag-and-drop block order and visibility for Home and Wall Panel, top-row cards,
  room order, rename and photo upload, room style, camera choice and order, live preview + Apply.
- **My cards**: a native HA dashboard (`ajnetweb-cards`) edited with HA's visual editor. Its first page is
  merged into Home/Wall Panel, its other pages become extra pages; *Edit my cards* in the ⋯ menu for admins.
- Room tiles show the area photo.
- Follow-up ("do all, add temperature graphs per room, and instructions for other AI"):
  - Graph card (room temperature history) on the Climate page, room pages and the room sheet.
  - *Today at home* band: agenda, energy, all-room temperatures.
  - `AGENTS.md` (read by Codex, Cursor and others), `CLAUDE.md` (imports it), and `docs/ai-guide.md`
    (decision ladder for changing a client dashboard: HA settings → Studio → My cards, never take control).
- Follow-up ("merge 2 or more amps; each room's device only controls its room unless given permission;
  will new devices like Tuya show by themselves?"):
  - Music card *Also play in*: link / unlink speakers and amp zones, *Everywhere*, *Ungroup*.
  - Room & Guest Pass Studio 1.3.0 publishes the matrix (`sensor.ajnetweb_room_access`) with a new
    *Device room* per user; the strategy builds restricted users' dashboards from their rooms only and
    puts a room tablet's own room first.
  - New devices: already automatic (the strategy reads the registries on every load); added an Installer
    list of devices without a room and a playbook section.

**Decisions:**
- *HA's own visual editor for custom cards*, instead of building our own card editor. Every HA and HACS
  card works, it's familiar to installers, and it is stored in HA (backed up with HA).
- *Merge, don't replace:* the generated dashboard keeps following the house; the custom cards are read
  with `lovelace/config` (no admin needed to read) each time the dashboard is built.
- *Room names and photos go to the HA area registry*, so every other card and app sees the same names.
- *Graphs drawn by us (SVG)*, not HA's history-graph or ApexCharts: one look in every theme, no HACS
  dependency, works for non-admin users (history API).
- *Energy from HA's Energy settings and statistics*, so the numbers match HA's own Energy page.
- *Room access through a published sensor*, not by editing dashboards: the strategy dashboard has no stored
  views to edit, the rules apply live, and any number of users works. Honest limit: HA has no per-entity
  permissions for logged-in users, so this is "only what you see"; where it must be enforced, room passes
  (server-side 403) are the tool.
- *Publishing continues when the add-on is unlicensed*: the sensor only ever restricts, so stopping it
  would widen access.
- *Grouping with `media_player.join`*, HA's standard action, so it works for MA, Sonos and others alike.
- *AI rules in `AGENTS.md`*, the file most AI tools read; `CLAUDE.md` only imports it, so there is one copy.

**Open:** test on a real HA that non-admin users see the merged cards; photo upload from the Companion
app on iOS; energy card with a real Energy setup (single-meter grid layout of newer HA versions).

## AC pre-cooling — Dashboard Suite 3.3.1 (October 2026)

**Asked for:** an AC pre-cooling feature that starts cooling before occupants arrive.

**Done:**
- New bundled blueprint `ajnetweb_dashboard/blueprints/ac_precool_on_arrival.yaml`, listed in the Studio's
  Blueprints section and installed with the others.
- Trigger: a chosen person enters an approach zone while coming from away. Cools only units that are off and
  in a warm room; switches them off again if nobody gets home within the give-up time.

**Decisions:**
- Built as a blueprint, like the balcony AC protector, so installers set it up per villa in HA's own UI
  with no new add-on options or dashboard changes.
- Approach zone instead of the Proximity integration: it works with only the Companion app and a zone,
  and the radius directly sets how early cooling starts (about 1 km per minute of driving).
- The arrival check ignores leaving home (Home usually sits inside the approach zone).

**Open:**
- Schedule-based pre-cooling (e.g. before school pick-up) and a dashboard button/card for it.

## PR #6 — Organised layout, Flux-style rooms, Right now card (Dashboard Suite 3.3.0)

See `ajnetweb_dashboard/CHANGELOG.md` 3.3.0.

## PR #5 — Themes, personal appearance, kiosk menu, licensing, add-on updates (October 2026)

**Asked for:** better themes (native blur, liquid glass, popular market styles), gradient colours, colours
each person can change from their profile, updates to the add-ons where needed, and documentation and
records of everything.

**Done:**
- Five new themes in `ajnetweb_dashboard/themes.py`: Liquid Glass (light/dark), Native Blur (light/dark),
  Aurora (dark), Desert Dusk (light/dark), Material You (light/dark). 11 themes in total.
- **Personal appearance** (`ajnetweb-ui/src/core/appearance.js`, `cards/appearance.js`):
  - Each person picks a theme, one of 10 colour gradients and a gradient wallpaper from a palette button
    in the header.
  - Saved per HA user with `frontend/set_user_data` (key `ajnetweb_appearance`).
  - The strategy applies the person's theme and wallpaper when it builds the views; the cards apply the
    colour live.
- Studio → Design: default palette, personal on/off, wallpaper. The strategy editor has the same options.
- All themes: dialogs and menus are now opaque (`card-background-color`, `ha-dialog-surface-background`)
  even when cards are glass.
- Gradient accents: music play button, progress and volume, header title, nav bar, current prayer.
- Remote Access 1.2.5: frp client 0.71.0 → 0.71.1 (upstream patch; checksum check unchanged).
- Add-on check:
  - Every add-on is on the latest HA base image (3.24).
  - Alexa Bridge is pinned to the latest stable Matterbridge 3.10.14 and matterbridge-hass 1.5.0, so no
    change was needed.
- **Kiosk & ⋯ menu** (follow-up request: "I will lock it with kiosk"):
  - A ⋯ *More* button in the bottom bar holds the pages that don't fit, the appearance picker, profile,
    reload, HA settings, Studio and exit kiosk.
  - Each item, plus hiding HA's header and sidebar, has a per-user rule (everyone, admins, non-admins,
    nobody or named people), set in Studio → Design → *Kiosk & menu*.
  - The strategy writes `kiosk_mode` for the kiosk-mode plugin. kiosk-mode reads the generated dashboard
    config (`lovelace.config`); I checked its source.
- **Proprietary licensing** (request: "only I should be able to make those work"):
  - Offline Ed25519-signed licence keys, bound to the HA Install ID (`core.uuid`), with products and an
    optional expiry.
  - One key activates every AJ Netweb add-on on that HA (stored in `/config/.ajnetweb/license.key`).
  - Each add-on checks it (`ajn_license.py`). When locked, its pages show the activation screen, its API
    answers 402 and background work stops (adhan, doorbell events). Existing sites get a 14-day grace
    period after updating.
  - The Dashboard add-on publishes `sensor.ajnetweb_license`; the UI kit verifies the signed key in the
    browser (noble-ed25519) and caches the last valid one per browser.
  - Owner tool `tools/license/ajn-license.py`: keygen, issue (with a licences.csv register), inspect, sync.
  - Proprietary `LICENSE` file. The owner guide is `licensing/README.md`.
  - Not enforced until the owner creates the key pair and commits `licensing/public_key.txt`.
  - CCTV now maps the config folder (to read the Install ID).
  - Versions: Adhan 1.1.0, CCTV 1.3.0, Intercom 1.6.0, Sharing 1.2.0.
- **Remote Access = licence authority** (follow-up: "all apps should ask Remote Access; no separate key per app"):
  - Remote Access 1.3.0 signs a "green signal" every 10 minutes (`/config/.ajnetweb/remote_access.json`,
    valid 72 h) with its device key, attaching the client certificate issued by the AJ Netweb CA.
  - The other add-ons verify the chain to the pinned root CA (`licensing/root_ca.pem`), CN = Install ID,
    the signature, status and expiry.
  - It follows the subscription (suspended → lock, certificate revoked → signal withdrawn) and tolerates
    30 days offline.
  - The offline licence keys stay as a fallback. A heartbeat `entitlement` (AJN1) is stored for the
    browser check.
  - Works with the current server unchanged.
- **Remote Access closed-source build:**
  - `AJN_COMPILE=true` compiles the agent with Nuitka 4.2.2 (no docstrings or asserts, no `.py` in
    the image).
  - The workflow `.github/workflows/remote-access-image.yml` publishes compiled images to GHCR.
  - The steps to switch the add-on to images and move the source to a private repo are in
    `docs/remote-access-closed-source.md`.
  - Compilation was verified locally. The full image build runs in Actions, because the sandbox can't
    pull the HA base image.
- Docs: `04-themes-branding.md` rewritten (themes, market comparison, personal appearance, variables, the
  glass rule), options in `02`, card in `03`, playbook checks, `recommended-services.md`, this record.

**Decisions:**
- *Per-person storage = HA's own user-data store*, not an add-on database. It works without our
  add-on, needs no admin rights and follows the user to every device. HA's own profile theme is per browser
  only, which is why we didn't rely on it.
- *Wallpaper through the view `background` option* (a CSS string; checked in the HA frontend source,
  `hui-view-background.ts`), not card-mod.
- *No card-mod and no copied community theme.* We matched the popular looks (iOS/Liquid Glass, Graphite,
  Material, mesh gradients) with our own variables.

- *Kiosk rules resolved in the strategy*, not in the cards. The dashboard is generated per user, so a
  user's generated config only contains what they may see.

- *Offline signed licences instead of an online licence server* for the add-ons: villas often have weak
  internet, and nothing can be "switched off" by an outage. Revocation works through expiry dates.
  Remote Access keeps its online activation.
- *No "hidden secret key" in the code.* A secret inside client software can be extracted. The protection
  rests on the per-device key that never leaves the device, the CA key on the server, and short-lived
  signals bound to the Install ID.
- *Licensing ships disabled* (no public key or root CA in the repo) so that merging can't lock any site by accident.
  The owner enables it by committing their own public key. The private key never touches the repo or
  this session.

**Open / to verify on real hardware:**
- Licensing: generate the real key pair and commit the public key; test activation on a real HA;
  add the same check to Alexa Bridge (other repo); consider a private repo plus pre-built images.
- kiosk-mode with a strategy dashboard on a real HA (expected to work: kiosk-mode reads the generated
  config). Exiting kiosk as installer: log in as admin, or use the Fully Kiosk PIN.
- Blur cost on cheap Android tablets with Liquid Glass and Aurora (Material, Bento and OLED are the fallbacks).
- The wallpaper follows the device light/dark mode only after a reload.

## PR #4 — Music, prayer times, Prayer & Adhan add-on, product plan

**Asked for:** a native music player (YouTube, Spotify), an adhan app integrated in the dashboard, and a
professional plan.

**Done:**
- `custom:ajnetweb-music-card` built on **Music Assistant**:
  - Search across every provider added to Music Assistant, plus favourites and room chips.
  - Move music between rooms (`transfer_queue`) and drag to set the volume.
  - The *Media* page became **Music**.
- `custom:ajnetweb-prayer-card`: next prayer, countdown, times, Hijri date and adhan controls. Without the
  add-on it reads the native Islamic Prayer Times sensors.
- New add-on **Prayer & Adhan** 1.0.0 (`ajnetweb_adhan/`):
  - One-click Islamic Prayer Times setup.
  - Plays the adhan on chosen speakers: Music Assistant announcement, announce-capable speakers, or plain
    `play_media`.
  - Pauses TVs, restores volumes, separate Fajr adhan and dua.
  - Per-prayer offsets and volumes, phone reminders, Ramadan suhoor reminder, Hijri date.
  - Helpers for the dashboard, an event, and history.
- `docs/product-plan.md`: positioning, packages, backlog, roadmap, definition of done.

**Decisions:** Music Assistant instead of our own music server, because it handles provider changes.
We ship no adhan audio (copyright); the client uploads it. The old `adhan_smart_mute` blueprint is marked legacy.

**Caveats:** YouTube Music in Music Assistant is beta. Spotify needs Premium.

## PR #3 — Touch fix and team documentation (v3.0.1)

- Fixed: in the Companion app the room sheet opened and closed at once. The phone's synthetic "ghost click"
  hit the new backdrop. Fixed by swallowing that one click, closing only on a full backdrop tap, and
  ignoring stray `popstate` events.
- Team playbook `ajnetweb-ui/docs/01–06`: project steps, the five customisation levels, cards reference,
  themes, wall panels, developer guide.
- `npm run preview`: runs the real strategy and cards against a sample house, for screenshots and design work.

## PR #2 — Premium UI kit and dashboard strategy (v3.0.0)

- New UI kit (`ajnetweb-ui/`): vanilla Web Components, no Lit, no card-mod, public HA APIs only.
  - Device tiles: tap, drag to dim, hold for details.
  - Room cards with photos, and a room sheet.
  - Camera tiles, header, actions and a floating nav bar.
- The dashboard became a **strategy** (`strategy: custom:ajnetweb`): HA builds it live from
  areas/floors/devices, so new devices appear without a redeploy. The Studio only stores options.
- Decision: our own kit instead of forking HACS cards (Mushroom, Bubble, button-card). It stays upgradable,
  and there is one source for every client.

## PR #1 — Security and reliability fixes across add-ons

- **CCTV 1.2.0 and Intercom 1.5.0:**
  - Host-network ports were open on the LAN without login. They now answer ingress only.
  - Passwords are redacted in responses, and settings are kept in `ui_settings.json`.
  - Intercom: visitor photos get random names, and paths and cameras are detected instead of hard-coded
    per site. go2rtc is registered automatically.
- **Sharing 1.1.0:**
  - Guest links work: dedicated port 8097.
  - Deadlock fixed.
  - The guest PIN is enforced with a lockout.
  - Services are allow-listed.
  - Dashboard sync matches rooms exactly and takes a backup first.
- **Remote Access 1.2.4:** the diagnostic console had a shell injection (`uptime; …`). Commands now run
  without a shell, with per-command rules.
- **Alexa Bridge 1.1.0** (other repo):
  - Config written where Matterbridge reads it.
  - Connects through the Supervisor proxy.
  - Expose/hide works through entity labels.
  - QR pairing, backup/restore.
  - Status UI moved to port 8095.

## Before PR #1 (history)

- October 2026: Dashboard 2.0 (responsive generator and installer studio).
- Intercom 1.0–1.4: calling, unlock, WebRTC talk.
- CCTV 1.0–1.1: NVR wall, PTZ, playback.
- Sharing 1.0: room matrix, QR passes.
- Remote Access 1.2.x: frp tunnel, telemetry.
- Dashboard 1.x: blueprints, 5 themes.

---

## How to keep this record

For every PR, add a section at the top with: **Asked for**, **Done**, **Decisions**, **Open**.
Update the version table. Keep each add-on's `CHANGELOG.md` for the details; this file is the overview
for the team and for clients' project files.
