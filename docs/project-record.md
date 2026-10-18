# AJ Netweb platform — project record

A running record of every release. For each: what changed, why, the decisions behind it, and what
is still open. Add a section with every pull request. Newest first.

Repositories:
- `ajnetworksa/aj-netweb-addon`: add-ons, the UI kit and the docs (this repo)
- `ajnetworksa/alexa_bridge`: Alexa Matter Bridge add-on

Versions at the time of writing:

| Product | Version |
|---|---|
| Dashboard Suite + UI kit | 3.2.0 |
| Prayer & Adhan | 1.1.0 |
| Intercom & Door Station | 1.6.0 |
| CCTV & NVR Studio | 1.3.0 |
| Room & Guest Pass Studio | 1.2.0 |
| Remote Access | 1.3.0 |
| Alexa Matter Bridge | 1.1.0 (branch `ccr-ae46138d-oshmey` in `alexa_bridge`, no PR yet) |

---

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
