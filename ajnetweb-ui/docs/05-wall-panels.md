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
4. Optional: integrate Fully Kiosk in HA (built-in integration) to control brightness/screen from automations.

## Hiding Home Assistant's header and sidebar

The generated pages already look full-screen on phones. On panels you may want to hide the top bar:
- Per user: Profile → *Always hide the sidebar*.
- Kiosk-style full screen: Fully Kiosk "Fullscreen mode", or the community **kiosk-mode** card via
  HACS (optional, see the policy in [03](03-cards-reference.md)).

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
