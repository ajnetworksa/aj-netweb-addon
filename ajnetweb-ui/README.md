# AJ Netweb UI

Premium cards and a self-building dashboard for Home Assistant. One JavaScript file, no HACS
dependencies, no card-mod. Used by the AJ Netweb Dashboard Suite add-on, and usable on its own in
any Home Assistant project.

## What's inside

| Element | What it is |
|---|---|
| `strategy: custom:ajnetweb` | Whole dashboard generated live from your Areas, Floors and devices |
| `custom:ajnetweb-device-card` | Premium tile for any entity: tap, drag to dim/position, hold for details |
| `custom:ajnetweb-area-card` | Room card with area photo, live status, lights toggle; opens a room sheet |
| `custom:ajnetweb-camera-card` | Camera tile with refreshing snapshot; tap for live video |
| `custom:ajnetweb-header-card` | Greeting, clock, weather, alarm, people and status chips |
| `custom:ajnetweb-actions-card` | Big buttons or scene chips with tap-again confirmation |
| `custom:ajnetweb-nav-card` | Floating glass navigation bar |

## Use it in any project

1. Copy `dist/ajnetweb-ui.js` to `/config/www/ajnetweb-ui.js`.
2. Settings → Dashboards → ⋮ → Resources → add `/local/ajnetweb-ui.js?v=3.0.0` as **JavaScript module**.
3. Create the dashboard:
   - HA 2026.5+: Settings → Dashboards → **Add dashboard** → *Community dashboards* → **AJ Netweb Home**.
   - Older: add a blank dashboard, open the raw configuration editor and paste
     ```yaml
     strategy:
       type: custom:ajnetweb
     ```
4. Give each Area a picture (Settings → Areas) for photo room cards. Done.

Bump `?v=` whenever you replace the file so phones and tablets reload it.

### Strategy options

```yaml
strategy:
  type: custom:ajnetweb
  title: Villa Al Noor
  theme: AJ Netweb Frosted Glass   # any HA theme name
  language: ar                     # en | ar; default follows each user's HA language
  room_tap: popup                  # popup (room sheet) | navigate (room page)
  header_image: /local/villa.jpg
  exclude_entities: [switch.pump_child_lock]
  hidden_areas: [technical_room]
  favorites: [light.majlis_chandelier, scene.welcome]
  weather: weather.forecast_home
  views: { media: false }          # panel, lights, climate, security, cameras, media, installer
  navbar: true
  panel_live_cameras: true
  cameras_live: false
  shortcuts:
    - { name: Door station, icon: mdi:doorbell-video, navigation_path: /abc_ajnetweb_intercom }
  branding: { company: AJ Netweb, phone: "+966 ...", email: support@example.com }
```

The dashboard has Home, Wall Panel (`/tablet`), Lights, Climate, Security, Cameras, Media, an
admin-only Installer page and one page per room. Want to hand-edit? Use HA's **Take control** in
the dashboard menu to turn the generated layout into a normal editable dashboard.

### Single cards

```yaml
type: custom:ajnetweb-device-card
entity: light.majlis_chandelier      # layout: wide | square, access: true (gate relays), confirm: true
```
```yaml
type: custom:ajnetweb-area-card
area: majlis                         # devices are detected from the area
```

## Theme variables

Cards follow the active HA theme. Optional refinements: `ajn-accent`, `ajn-surface`,
`ajn-surface-on` (tile colour when on), `ajn-text-on`, `ajn-border`, `ajn-radius`, `ajn-glass-blur`,
`ajn-shadow`, `ajn-sheet-bg`, `ajn-nav-bg`, `ajn-tile-height`, `ajn-room-height`, `ajn-font`.

## Develop

```bash
npm install
npm run build     # writes dist/ajnetweb-ui.js and copies it into ajnetweb_dashboard/www/
npm run watch
```

Source layout: `src/core` (base class, gestures, model, i18n, tokens), `src/cards` (one file per
card), `src/strategy` (dashboard generator + options editor). Rules that keep it stable across HA
releases: only the public `hass` object and the `hass-more-info` / `location-changed` /
`hass-notification` events; no imports from the HA frontend; no card-mod.
