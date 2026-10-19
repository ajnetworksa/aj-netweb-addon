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
controls: [switch.main_gate_relay, cover.garage_door]   # optional buttons on the picture (tap twice)
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
grouping: true                        # "Also play in": link speakers / amp zones (default on)
```
**Play in more rooms:** under the speaker chips, *Also play in* lists the other speakers that can be
grouped. Tap one to link it (🔗), tap again to unlink; **Everywhere** links all, **Ungroup** splits the
group. The same music then plays in sync in every linked room, and play/pause/next act on the whole group
(`media_player.join` / `unjoin`; the first speaker leads). Works with every player that supports grouping:
Music Assistant players (AirPlay, Chromecast, Sonos, Snapcast, DLNA, squeezelite amps…), Sonos, and others.
Music Assistant syncs players of the **same type** together; to mix types (e.g. an AirPlay amp with a Cast
speaker), create a *Sync group* / *Universal group* player once in Music Assistant — it then shows up as
one more speaker. Multi-zone amplifiers appear as one player per zone, so each zone can be linked.
Full variant: artwork, title/artist, live progress, shuffle / previous / play-pause / next / repeat,
drag-to-set volume and mute, room chips to switch speakers, **Move music here** (Music Assistant
`transfer_queue`), search across every provider you added to Music Assistant (YouTube Music,
Spotify, Apple Music, Tidal, Deezer, SoundCloud, TuneIn, radio…) and favourites. Tapping a result
plays it on the selected speaker. Plain media players (Cast, Sonos, AirPlay, Spotify Connect) get
all playback controls; search needs Music Assistant.

### `custom:ajnetweb-rooms-card` — all rooms with floor tabs

```yaml
type: custom:ajnetweb-rooms-card
style: tile                     # tile (quick buttons) | photo
min_width: 170                  # smallest room card width (px)
groups:
  - name: Ground Floor
    icon: mdi:home-floor-0
    rooms:
      - { area: majlis }
      - { area: living_room, name: Living }
  - name: First Floor
    rooms: [{ area: master_bedroom }]
```
Each room is an `ajnetweb-area-card`, so every area-card option works inside `rooms`. With `style: tile`
the card shows the room icon (lit when lights are on) and up to 4 quick buttons: lights on/off, AC on/off
(with set temperature), shades open/close and fan. The selected floor tab is remembered per device.

### `custom:ajnetweb-status-card` — "Right now"

```yaml
type: custom:ajnetweb-status-card
openings: [binary_sensor.front_door, binary_sensor.kitchen_window]
safety: [binary_sensor.kitchen_smoke]
lights: [light.majlis_chandelier, light.kitchen]
climates: [climate.majlis_ac]
media: [media_player.majlis_speakers]
batteries: [sensor.front_door_lock_battery]      # shown at 20 % or less
devices: [light.x, switch.y]                     # shown when unavailable (admins)
timers: true                                     # running HA timers with time left
navigation: { security: /villa/security, lights: /villa/lights }
```
Only rows that need attention are shown; with nothing to report it shows "All good". The generated
dashboard fills all of this automatically.

### `custom:ajnetweb-weather-card` — current weather + forecast

```yaml
type: custom:ajnetweb-weather-card
entity: weather.forecast_home
days: 5                  # forecast days (default 5)
```
Current temperature and condition, today's high/low, and one row per day with a temperature-range bar
(blue → yellow → orange, scaled to the week). Uses the `weather.get_forecasts` action, refreshed every
30 minutes. Tap opens HA's weather details.

### `custom:ajnetweb-graph-card` — temperature graph (one room or all rooms)

```yaml
type: custom:ajnetweb-graph-card
entity: sensor.majlis_temperature      # one line with a soft fill, min / max and the live value
# or several lines with a legend:
entities:
  - entity: sensor.majlis_temperature
    name: Majlis
  - sensor.master_bedroom_temperature
hours: 24                # history window (default 24)
title: Temperature       # optional
compact: false           # true = small chart without axis (used in the room sheet)
```
Works for any number sensor (humidity, CO₂, power). History from `history/history_during_period`,
reloaded every 10 minutes; the last point follows the live state. Drag across the chart to read past
values. The generated dashboard puts one per room on the Climate page, the room page and the room sheet,
and all rooms together in *Today at home*.

### `custom:ajnetweb-calendar-card` — agenda

```yaml
type: custom:ajnetweb-calendar-card
entities: [calendar.family, calendar.school]
days: 7                  # look ahead (default 7)
max: 6                   # events shown (default 6)
```
Next events grouped by day (Today / Tomorrow / weekday), a colour per calendar, running events
highlighted. Any HA calendar works (Google, CalDAV, Local calendar). Tap opens the calendar.

### `custom:ajnetweb-energy-card` — energy today

```yaml
type: custom:ajnetweb-energy-card
power: sensor.house_power        # optional: live power (W / kW)
days: 7
entities: [sensor.main_meter]    # only if HA's Energy dashboard is NOT set up: meters to add up
```
Reads HA's Energy settings (grid import/export, solar, cost) and the daily totals from long-term
statistics, so it matches HA's Energy page: kWh used today vs yesterday, 7-day bars, solar, exported
and cost today. Tap opens HA's Energy page. **Set up Settings → Dashboards → Energy first.**

### `custom:ajnetweb-modes-card` — house modes

```yaml
type: custom:ajnetweb-modes-card
entity: input_select.ajnetweb_house_mode   # its options are the modes (home, away, night, guests)
names: { night: Sleep }                    # optional: own names instead of the translated ones
icons: { away: mdi:airplane }              # optional
confirm: [away, night]                     # optional: these ask "Tap again to confirm"
```
One row of chips; the current mode is highlighted. A tap selects the mode
(`input_select.select_option`); the *AJ Netweb - House modes* automation that Studio → **House modes**
creates then runs that mode's actions, so the dashboard, Alexa and your automations behave the same.
Hold opens the helper's details. Works with any `input_select`: unknown options are shown as they are.

### `custom:ajnetweb-person-card` — who is home

```yaml
type: custom:ajnetweb-person-card
entity: person.ahmed
size: small                  # optional: small (default, half width) or big (full width, tinted, info chips)
battery: sensor.ahmed_phone_battery_level   # optional: found by itself from the person's phone tracker; false hides it
sensors: [sensor.ahmed_travel_time]         # optional, big only: extra chips (travel time, steps, ...)
name: Baba                   # optional
picture: /local/ahmed.jpg    # optional: else the person's own photo, else initials
```
Photo (or initials) with a ring in the presence colour: green at home, orange away, teal in a named zone
(the zone's name is shown). Under the name: where and for how long ("Home · for 2 h 5 min"). The phone
battery chip turns red at 20 % and shows a bolt while charging (`…_battery_state`). Tap opens HA's person
dialog with the map; tapping a chip opens that sensor.

### `custom:ajnetweb-appearance-card` — personal theme & colour

```yaml
type: custom:ajnetweb-appearance-card
palette: desert          # optional: default colour ("Theme colour" falls back to it)
wallpaper: false         # optional: default for the wallpaper switch
themes: [...]            # optional: theme names people may pick (default: all, AJ Netweb first)
```
Each person picks a theme, one of 10 colour gradients and a gradient wallpaper. The choice is saved for
**their HA user** and follows them to every device. The generated dashboard opens it from
**⋯ More → My theme & colour** in the bottom bar, or from a palette button in the header when the bar is
off (`appearance: true` on the header card). Details: [04](04-themes-branding.md).

Every AJ Netweb card also accepts `palette: <key>` to force a colour gradient on that card.

### `custom:ajnetweb-doorbell-card` — doorbell popup (invisible)

```yaml
type: custom:ajnetweb-doorbell-card
entity: sensor.ajnetweb_doorbell   # default; published by the Intercom add-on 1.7.0+
camera: camera.gate                # optional: override the camera the add-on suggests
sound: true                        # short chime
```
Shows nothing until the sensor turns `ringing`; then a full-screen popup opens over the page with the
live camera (`camera_proxy_stream`, falling back to snapshots), **Open <door>** buttons (tap once to arm,
again to press `input_button.ajnetweb_open_door_N`) and *Dismiss*. Each ring opens it once per screen;
it closes when the sensor goes back to `idle`. The generated dashboard adds it to every page for the
people allowed by the kiosk rule `doorbell` (default everyone).

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

Optional ⋯ **More** button (the generated dashboard fills it per user, see [05](05-wall-panels.md)):
```yaml
menu:
  label: More
  appearance: { palette: desert }        # options for the Appearance picker
  items:
    - { group: Pages, icon: mdi:tablet-dashboard, label: Wall Panel, path: /villa-home/tablet }
    - { group: For me, icon: mdi:palette, label: Appearance, action: appearance }
    - { group: System, icon: mdi:refresh, label: Reload, action: reload }
    - { group: System, icon: mdi:cog, label: Settings, path: /config }
    - { group: System, icon: mdi:fullscreen-exit, label: Exit kiosk, action: exit_kiosk }
```

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
| kiosk-mode | Hides HA header/sidebar | Our strategy writes its config per user + ⋯ menu ([05](05-wall-panels.md)) | **Yes, for kiosk tablets** (HACS) |
| layout-card | Masonry/grid layouts | Sections view | Not needed |
| mini-graph-card / ApexCharts | Graphs | Native `history-graph`, `statistics-graph` | ApexCharts OK for energy pages |
| auto-entities | Dynamic lists | Strategy + `entity-filter` | Not needed |
| browser_mod | Pop-ups per browser, kiosk control | Room sheet | Avoid unless really needed |
| Mushroom / Dwains strategies | Auto-generated dashboards | `custom:ajnetweb` strategy | Not needed |

**Policy:** a community card may be used on a site only if (1) nothing native or ours does it,
(2) it is installed through HACS (so it updates), (3) it is noted in the project file. Never fork a
card into our kit — if we need the feature for every client, we build it in the kit
([06](06-developer-guide.md)).
