# 3. Cards reference — ours and the native ones we use

Every card below works in **any** dashboard once `ajnetweb-ui.js` is loaded as a resource, not only
in the generated one. Add them with Edit dashboard → Add card → search "AJ Netweb", or in YAML.

Common to all our cards: `language: en | ar` (optional, default = the user's HA language).

---

## AJ Netweb cards

### `custom:ajnetweb-device-card` — premium tile for any entity

```yaml
type: custom:ajnetweb-device-card
entity: light.majlis_chandelier
name: Chandelier          # optional, default = HA name
icon: mdi:chandelier      # optional, default = by device type and state
layout: square            # square (default) | wide
access: false             # true = gate/door relay: tap twice, switch.turn_on (momentary)
confirm: false            # true = tap twice before acting (any device)
tap_action: toggle        # toggle (default behaviour) | more-info
```

Behaviour by device type:

| Domain | Tap | Drag sideways | Hold |
|---|---|---|---|
| light | toggle | brightness | details |
| switch / input_boolean | toggle (`access: true` → pulse on) | — | details |
| fan | toggle | speed % | details |
| cover | open / close | position % | details |
| climate | on / off; − / + on wide tiles | — | details |
| lock | tap twice → lock / unlock | — | details |
| scene / script | run | — | details |
| button | press | — | details |
| media_player | play / pause (shows title) | — | details |
| vacuum / valve | start-dock / open-close | — | details |
| sensor / binary_sensor | details | — | details |

Climate tiles are **wide** by default (12 columns); everything else is half width.

### `custom:ajnetweb-area-card` — room card

```yaml
type: custom:ajnetweb-area-card
area: majlis                 # HA area id (Settings → Areas → the id in the URL)
name: Majlis                 # optional overrides
icon: mdi:account-group
picture: /local/majlis.jpg   # default = area picture; false = gradient
size: normal                 # normal | large
tap_action: popup            # popup (room sheet) | navigate
navigation_path: /villa-home/room-majlis   # used by navigate and by long-press
temperature: sensor.majlis_temperature     # optional, auto-detected
humidity: sensor.majlis_humidity           # optional, auto-detected
entities:                    # optional — default: everything in the area, grouped automatically
  lights: [light.majlis_chandelier, switch.majlis_spot_lights]
  climates: [climate.majlis_ac]
  scenes: [scene.majlis_guests]
```

Groups used in `entities` (and in the room sheet, in this order): `access, lights, climates, fans,
covers, media, switches, vacuums, valves, cameras, temperature, humidity, air, power, openings,
motion, safety, scenes, scripts`.

The **room sheet** opened by the card shows scenes as chips at the top, then each group; it has an
all-lights button, closes with ✕, backdrop tap, swipe down (phone) or the back button.

### `custom:ajnetweb-camera-card`

```yaml
type: custom:ajnetweb-camera-card
entity: camera.driveway
name: Driveway
refresh: 8                   # seconds between snapshots (min 2); paused when the app is in background
```
Tap opens HA's camera dialog with live video.

### `custom:ajnetweb-header-card`

```yaml
type: custom:ajnetweb-header-card
title: Villa Al Noor
variant: default             # default | panel (big clock for wall tablets)
image: /local/villa.jpg      # optional hero background
weather: weather.forecast_home
alarm: alarm_control_panel.house
alarm_navigation_path: /villa-home/security
persons: [person.ahmed, person.sara]
chips:
  - icon: mdi:lightbulb-on
    entities: [light.a, light.b]
    active: ["on"]           # counts entities in these states …
    label: lights_on         # translation key (see src/core/i18n.js) or your own text
    color: amber             # amber blue orange red green purple teal indigo pink grey
    navigation_path: /villa-home/lights
  - icon: mdi:door-open
    entities: [binary_sensor.front_door]
    active: ["on"]
    label: open
    ok_label: all_closed     # shown (green) when the count is 0
    ok_icon: mdi:shield-home
  - icon: mdi:snowflake
    entities: [climate.majlis_ac]
    inactive: ["off"]        # … or entities NOT in these states
    label: ac_running
    color: blue
```

### `custom:ajnetweb-actions-card`

```yaml
type: custom:ajnetweb-actions-card
style: buttons               # buttons (grid) | chips (one scrolling row, good for scenes)
actions:
  - name: All lights off
    icon: mdi:lightbulb-group-off
    action: homeassistant.turn_off
    target: { entity_id: [light.a, light.b] }
    confirm: true            # tap twice
  - name: Cinema
    icon: mdi:movie-open
    action: scene.turn_on
    target: { entity_id: scene.cinema }
  - name: Open gate
    icon: mdi:gate-open
    action: switch.turn_on
    target: { entity_id: switch.main_gate_relay }
    confirm: true
  - name: Door station
    icon: mdi:doorbell-video
    navigation_path: /abc_ajnetweb_intercom   # navigation instead of an action
  - name: Pool 30 min
    icon: mdi:pool
    action: script.turn_on
    target: { entity_id: script.pool_pump }
    data: { variables: { minutes: 30 } }
```

### `custom:ajnetweb-prayer-card` — prayer times

```yaml
type: custom:ajnetweb-prayer-card
entity: sensor.ajnetweb_next_prayer   # default; created by the Prayer & Adhan add-on
variant: default                      # default | compact (no times row) | panel (larger)
show_controls: true                   # adhan on/off, mute next, play now (needs the add-on)
```
Shows the next prayer with a live countdown, today's five times (next one highlighted, past ones
dimmed) and the Hijri date. **Without the add-on** it reads Home Assistant's own *Islamic Prayer
Times* sensors directly — times only, no adhan controls or Hijri date.

### `custom:ajnetweb-music-card` — music player

```yaml
type: custom:ajnetweb-music-card
entities:                             # default: all Music Assistant players, else all speakers (no TVs)
  - media_player.majlis_speakers
  - media_player.kitchen_speaker
entity: media_player.majlis_speakers  # start with this one (default: whichever is playing)
variant: full                         # full | compact (one row: art, title, play/pause, next)
search: true                          # search box (Music Assistant players only)
favorites: true                       # favourite playlists / radio / albums (Music Assistant)
music_assistant_entry: 01J...         # optional: config entry id (needed for non-admin users;
                                      # the Studio fills it in automatically)
```
Full variant: artwork, title/artist, live progress, shuffle / previous / play-pause / next / repeat,
drag-to-set volume and mute, room chips to switch speakers, **Move music here** (Music Assistant
`transfer_queue`), search across every provider you added to Music Assistant (YouTube Music,
Spotify, Apple Music, Tidal, Deezer, SoundCloud, TuneIn, radio…) and favourites. Tapping a result
plays it on the selected speaker. Plain media players (Cast, Sonos, AirPlay, Spotify Connect) get
all playback controls; search needs Music Assistant.

### `custom:ajnetweb-appearance-card` — personal theme & colour

```yaml
type: custom:ajnetweb-appearance-card
palette: desert          # optional: default colour ("Theme colour" falls back to it)
wallpaper: false         # optional: default for the wallpaper switch
themes: [...]            # optional: theme names people may pick (default: all, AJ Netweb first)
```
Each person picks a theme, one of 10 colour gradients and a gradient wallpaper. The choice is saved for
**their HA user** and follows them to every device. The generated dashboard opens it from the palette
button in the header (`appearance: true` on the header card). Details: [04](04-themes-branding.md).

Every AJ Netweb card also accepts `palette: <key>` to force a colour gradient on that card.

### `custom:ajnetweb-nav-card` — floating navigation bar

```yaml
type: custom:ajnetweb-nav-card
items:
  - { icon: mdi:home, label: Home, path: /villa-home/home }
  - { icon: mdi:lightbulb-group, label: Lights, path: /villa-home/lights }
  - { icon: mdi:cctv, label: Cameras, path: /villa-home/cameras }
```
Put it in the **last section** (full width). It reserves space so content isn't hidden behind it.
Max ~5 items on phones.

### Legacy (v1 dashboards): `custom:ajnetweb-room-card`, `custom:ajnetweb-quick-scenes`
Kept only so old dashboards don't break. Don't use in new work.

---

## Native Home Assistant cards used by the generator

These are maintained by Home Assistant and migrate automatically — prefer them over community cards.

| Card | Where we use it | Notes |
|---|---|---|
| `heading` | Section titles (tap → page) | `heading_style: title | subtitle`, `badges` |
| `tile` + features | Alarm panel (`alarm-modes`) | Features: `light-brightness`, `cover-position`, `target-temperature`, `climate-hvac-modes`, `fan-speed`, `lock-commands`, `alarm-modes`, `vacuum-commands` |
| `thermostat` | Room pages (full AC control) | Add `features: [{type: climate-hvac-modes, hvac_modes: [...]}]` |
| `picture-entity` | Live cameras on the Wall Panel | `camera_view: live` |
| `media-control` | Hand-edited dashboards | Replaced by `ajnetweb-music-card` in generated pages |
| `entity-filter` | "Open right now", Installer page lists | `conditions:` like conditional cards |
| `markdown` | Installer support info | Supports templates `{{ states(...) }}` |

Layout building blocks: **Sections view** (`type: sections`, `max_columns`, `dense_section_placement`),
sections with `column_span`, and `grid_options: {columns: 1–12 | full}` on each card. Phones show 1
column, portrait tablets 2, landscape 3–4.

Actions everywhere use the modern format:
```yaml
tap_action:
  action: perform-action
  perform_action: switch.turn_on
  target: { entity_id: switch.main_gate_relay }
  confirmation: { text: "Open the main gate?" }
```

---

## Community cards — what exists and our policy

We researched the popular "premium" dashboards before building the kit. They mostly combine these:

| Card / tool | What it does | Our equivalent | Use it? |
|---|---|---|---|
| Mushroom | Clean minimal tiles & chips | `ajnetweb-device-card`, header chips | Not needed |
| Bubble Card | Pop-ups, bottom nav bar, sliders | Room sheet, `ajnetweb-nav-card`, drag-to-dim tiles | Not needed |
| button-card | Fully templated buttons | `ajnetweb-device-card` / actions card | Only on level-4 sites |
| card-mod | CSS injection into any card | Theme variables `--ajn-*` | **Avoid** (breaks on HA updates) |
| kiosk-mode | Hides HA header/sidebar | Companion app / Fully Kiosk settings ([05](05-wall-panels.md)) | Optional on wall panels |
| layout-card | Masonry/grid layouts | Sections view | Not needed |
| mini-graph-card / ApexCharts | Graphs | Native `history-graph`, `statistics-graph` | ApexCharts OK for energy pages |
| auto-entities | Dynamic lists | Strategy + `entity-filter` | Not needed |
| browser_mod | Pop-ups per browser, kiosk control | Room sheet | Avoid unless really needed |
| Mushroom / Dwains strategies | Auto-generated dashboards | `custom:ajnetweb` strategy | Not needed |

**Policy:** a community card may be used on a site only if (1) nothing native or ours does it,
(2) it is installed through HACS (so it updates), (3) it is noted in the project file. Never fork a
card into our kit — if we need the feature for every client, we build it in the kit
([06](06-developer-guide.md)).
