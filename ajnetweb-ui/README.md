# AJ Netweb UI

Premium cards and a self-building dashboard for Home Assistant. One JavaScript file, no HACS
dependencies, no card-mod. Used by the AJ Netweb Dashboard Suite add-on, and usable on its own in
any Home Assistant project.

## Documentation (team playbook)

| # | Guide | For |
|---|---|---|
| 1 | [Project playbook](docs/01-project-playbook.md) — site survey → HA setup → areas, names, photos → deploy → test → handover | Every installer |
| 2 | [Customisation levels](docs/02-customization-levels.md) — what to change where (HA, Studio, YAML, take control, code) | Every installer |
| 3 | [Cards reference](docs/03-cards-reference.md) — every AJ Netweb card + native cards we use + community cards policy | Installers, developers |
| 4 | [Themes & branding](docs/04-themes-branding.md) — built-in themes, `--ajn-*` variables, client brand theme | Installers |
| 5 | [Wall panels](docs/05-wall-panels.md) — Companion app / Fully Kiosk, hardware, performance | Installers |
| 6 | [Developer guide](docs/06-developer-guide.md) — architecture, preview tool, recipes, release process, troubleshooting | Developers |

## What's inside

| Element | What it is |
|---|---|
| `strategy: custom:ajnetweb` | Whole dashboard generated live from your Areas, Floors and devices |
| `custom:ajnetweb-device-card` | Premium tile for any entity: tap, drag to dim/position, hold for details |
| `custom:ajnetweb-area-card` | Room card with area photo, live status, lights toggle; opens a room sheet |
| `custom:ajnetweb-camera-card` | Camera tile with refreshing snapshot; tap for live video |
| `custom:ajnetweb-header-card` | Greeting, clock, weather, alarm, people and status chips |
| `custom:ajnetweb-actions-card` | Big buttons or scene chips with tap-again confirmation |
| `custom:ajnetweb-prayer-card` | Next prayer countdown, times, Hijri date, adhan controls |
| `custom:ajnetweb-music-card` | Music player: Music Assistant search, favourites, rooms, volume |
| `custom:ajnetweb-rooms-card` | All rooms with floor tabs; room tiles with quick buttons |
| `custom:ajnetweb-status-card` | "Right now": open doors, alerts, timers, lights/AC on, low batteries |
| `custom:ajnetweb-weather-card` | Current weather and a 5-day forecast with temperature bars |
| `custom:ajnetweb-appearance-card` | Each person picks their own theme, colour gradient and wallpaper |
| `custom:ajnetweb-nav-card` | Floating glass navigation bar |

## Use it in any project

1. Copy `dist/ajnetweb-ui.js` to `/config/www/ajnetweb-ui.js`.
2. Settings → Dashboards → ⋮ → Resources → add `/local/ajnetweb-ui.js?v=3.9.0` as **JavaScript module**.
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
npm run preview   # http://localhost:5173 — real cards + strategy on a fake villa, live reload
npm run build     # writes dist/ajnetweb-ui.js and copies it into ajnetweb_dashboard/www/
npm run watch
```

Details: [docs/06-developer-guide.md](docs/06-developer-guide.md).

Source layout: `src/core` (base class, gestures, model, i18n, tokens), `src/cards` (one file per
card), `src/strategy` (dashboard generator + options editor). Rules that keep it stable across HA
releases: only the public `hass` object and the `hass-more-info` / `location-changed` /
`hass-notification` events; no imports from the HA frontend; no card-mod.
