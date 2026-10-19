# 5. Wall panels and tablets

The generated dashboard has a **Wall Panel** page at `/<dashboard-url>/tablet`: big clock, live
cameras first, scenes, access and rooms. Phones use `/<dashboard-url>/home`.

## Option A — Home Assistant Companion app (simplest)

1. Install the Companion app, log in with a dedicated **non-admin** user per panel
   (e.g. `panel-majlis`) — this keeps admin menus away from guests.
2. App settings → **Default dashboard** → the AJ Netweb dashboard; then open the Wall Panel page and
   long-press nothing — just leave it there (the app reopens the last page).
3. Android app settings → **Keep screen on** (Companion app: Settings → Companion app → *Keep screen
   on* while charging), and in Android: Settings → Display → screen timeout → longest.
4. Optional: Android *Screen pinning* to lock the tablet to the app.

## Option B — Fully Kiosk Browser (Android, most professional)

1. Install Fully Kiosk Browser (PLUS licence recommended per panel).
2. Start URL: `http://<ha-ip>:8123/<dashboard-url>/tablet` (log in once with the panel user).
3. Settings:
   - Web content: *Autoplay videos* on (live cameras).
   - Device management: *Keep screen on*, *Launch on boot*, *Unlock screen*.
   - Kiosk mode: on (PIN for installers).
   - Motion detection (camera): turn the screen on when someone approaches; screensaver/dim after 2 min.
   - Remote admin: on, so you can reload the page from your office.
   - Advanced web settings: *Enable JavaScript interface* on, so the doorbell popup can wake the screen.
   - Web content: *Autoplay audio* on, so the doorbell chime plays.
4. Optional: integrate Fully Kiosk in HA (built-in integration) to control brightness/screen from automations.

## Kiosk lock: hide HA's header and sidebar, keep a ⋯ menu

When a tablet is locked in a kiosk, HA's header (with its ⋮ menu and *Edit dashboard*) and the sidebar
should disappear, but people still need a few things. The bottom bar has a **⋯ More** button for this,
and **you decide per person what is inside it**:

| Menu item | Default | What it does |
|---|---|---|
| Other pages | Everyone | Pages that don't fit in the bar (Wall Panel, Cameras, Music, Installer…) |
| My theme & colour | Everyone | The personal Appearance picker ([04](04-themes-branding.md)) |
| My profile | Everyone | HA profile page: language, dark mode, … |
| Reload | Everyone | Reloads the page (after a change, or if the tablet looks stuck) |
| Home Assistant settings | Admins only | `/config` |
| Dashboard Studio | Admins only | Opens the Studio add-on |
| Exit kiosk mode | Admins only | Reloads with `?disable_km` (shown only while kiosk mode is on for that user) |

Each item and the header/sidebar hiding take a **rule**: *Everyone*, *Admins only*, *Everyone except
admins*, *Nobody*, or *Specific people*. Specific people means HA **user names**, the display name and not the
login, e.g. `Mama, panel-majlis`; case doesn't matter.

**Set it up (Studio → Design → Kiosk & menu):**
1. Install **kiosk-mode** from HACS (Frontend). It is the one community plugin we use. Our dashboard
   writes its `kiosk_mode:` config for you, so you never edit it by hand.
2. *Hide Home Assistant header* and *Hide Home Assistant sidebar*: usually **Everyone except admins**, or
   **Specific people** with the panel users only (`panel-majlis, panel-kitchen`). Then family phones keep
   the normal header.
3. Choose who sees each menu item.
4. **Deploy**, then reload the tablet.

How it works:
- The dashboard is generated in each user's browser, so the rules are resolved for that user and
  the menu only contains what they may see.
- People who may not exit kiosk mode get `ignore_disable_km`, so typing `?disable_km` in the URL doesn't
  work for them either.
- To get out on a locked tablet as installer: log in with an admin user, or use Fully Kiosk's
  PIN / remote admin.
- Without kiosk-mode installed, the hide options do nothing, but the ⋯ menu still works. Use Fully
  Kiosk's *Fullscreen mode* to hide the browser bars.

YAML (strategy options, Level 3):

```yaml
kiosk:
  hide_header: [panel-majlis, panel-kitchen]   # or: non_admins | all | admins | none
  hide_sidebar: non_admins
  menu:
    pages: all
    appearance: [Mama, Sara, non_admins]       # lists can mix names with admins / non_admins
    profile: all
    reload: all
    settings: admins
    studio: admins
    exit_kiosk: admins
menu: true            # false = no ⋯ button
```

Other ways to hide the sidebar for one user: Profile → *Always hide the sidebar*.

## Doorbell popup

With Intercom & Door Station Studio 1.7.0+, a ring shows a full-screen popup on every panel: live door
camera and **Open** buttons (tap twice). Nothing to set up on the panel. To keep it off a tablet (e.g. the
children's room), use a separate HA user for that tablet and Studio → Design → Kiosk & menu →
*Doorbell popup* → *Specific people* / *Everyone except*.

## Hardware notes

| Device | Notes |
|---|---|
| Android tablets (Samsung Tab A/S, Lenovo) | Use Fully Kiosk or Companion app; keep Android WebView updated (Play Store) |
| iPad | Companion app + *Guided Access* (Settings → Accessibility) to lock the app |
| Hikvision DS-KH9510 / Android indoor stations | Install Fully Kiosk/Companion if the station allows APKs; old WebViews work (the kit targets Chrome 90+) |
| Amazon Fire tablets | Work with Fully Kiosk; slower — prefer the OLED or Bento theme (no blur) |

## Performance tips for slow panels

- Use **AJ Netweb OLED** or **Bento** (no backdrop blur) — blur is the heaviest effect.
- Studio → Design → turn off *Live video on Wall Panel* (snapshot tiles instead of streams).
- Limit cameras on the panel to 2–4.
