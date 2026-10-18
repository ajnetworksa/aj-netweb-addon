# Changelog - AJ Netweb Dashboard Suite

## 3.4.0 - edit the dashboard without YAML
- **New Studio tab: Layout**, with a live preview (phone or tablet width) and an **Apply** button.
  - Drag the Home and Wall Panel blocks into any order, or untick one to hide it.
  - Pick the top-row cards (weather, prayer, music).
  - Rooms: drag the order, ✏️ rename, 📷 upload a photo (resized in the browser, saved to
    `/config/www/ajnetweb/rooms/` and set as the HA area picture), tiles or photo cards.
  - Cameras: which ones, in what order, how many on Home.
- **My cards**: one click creates a normal HA dashboard (`ajnetweb-cards`) edited with HA's visual editor.
  - Its first page is merged into Home and the Wall Panel as the *My cards* block.
  - Its other pages become extra pages in the bottom bar.
  - Admins get **Edit my cards** in the ⋯ menu.
- Room tiles show the room photo when the area has one.
- **Temperature graphs per room** (`custom:ajnetweb-graph-card`): 24 h history with min/max and the live value;
  drag across to read past values.
  - Climate page: all rooms in one graph on top, then one graph per room.
  - Room pages and the room sheet show that room's graph.
- **New "Today at home" block** on Home and the Wall Panel (movable in Layout):
  - **Agenda** (`custom:ajnetweb-calendar-card`): next events from HA calendars, by day.
  - **Energy** (`custom:ajnetweb-energy-card`): used today vs yesterday, 7-day bars, solar, export, cost and
    live power, read from HA's Energy settings.
  - **Room temperatures**: every room in one graph.
  - Each card only shows when there is data for it; pick them in Studio → Layout.
- **Music: play in more rooms.** *Also play in* links speakers and amp zones so the same music plays
  everywhere in sync (*Everywhere*, *Ungroup*; `media_player.join`).
- **Room-scoped users and room tablets:** with Room & Guest Pass Studio 1.3.0 (or the `room_access`
  option) a non-admin user's dashboard holds only their rooms; a room tablet opens on its own room.
- Installer page: **Devices without a room** (new devices, e.g. just added in Tuya, that still need a room).
- Blocks added in a new version now appear next to their default neighbour in saved layouts.
- New strategy options: `layout`, `top_cards`, `room_order`, `cameras`, `home_cameras`, `custom_dashboard`,
  `insights`, `calendars`, `energy`, `energy_power`, `room_access`; music card `grouping`.
- `AGENTS.md` / `CLAUDE.md` and `docs/ai-guide.md`: rules for AI assistants changing the code or a
  client's dashboard.

## 3.3.1 - AC pre-cooling
- **New blueprint: AC Pre-Cooling on Arrival** (`ac_precool_on_arrival.yaml`). When someone enters an approach
  zone around the house (e.g. a 5 km "Near home" zone) on the way home, the chosen AC units start cooling.
  - Only units that are off and in a room warmer than the start temperature (default 26 °C) are switched on,
    to the cooling temperature (default 23 °C). AC the family already set is left alone.
  - By default it only runs when nobody is home yet.
  - If nobody arrives within the give-up time (default 40 min, e.g. they only drove past), the units it
    started are switched off again.
  - Install with Studio → Blueprints → Install, then Settings → Automations → Blueprints.

## 3.3.0 - organised Home and Wall Panel layout
- **Home and Wall Panel are now built from full-width bands**, so there are no more big empty areas.
  - Before, a short Cameras section could sit next to a tall Access section; Home Assistant's sections
    grid aligns rows to the tallest section, which left a hole.
  - Cards inside a band are sized in whole view columns, so they reflow cleanly: 4 per row on large
    screens, 3 on a laptop, 2 on a tablet, 1-2 on a phone.
  - Band order: compact header → weather · prayer · music in one row → scenes, quick actions, access,
    favourites → rooms per floor → climate → cameras. On the Wall Panel the cameras come right after the
    top band.
- **Compact header:**
  - Wide screens show one line: time and date | status chips | people and weather. Phones show the time,
    date and weather, with the chips below.
  - The giant clock and the empty middle are gone. People avatars are always round, at most 4 plus "+N".
- **New weather card** (`custom:ajnetweb-weather-card`): current conditions plus a 5-day forecast with
  temperature range bars (`weather.get_forecasts`).
- **Cameras:** large pictures in balanced rows (4 → one row, 5 → 3 + 2, 8 → 4 + 4), two per row on phones.
  - A clean "No picture" or "Offline" placeholder replaces the broken grey tile.
  - Raw names are tidied ("bullet_cam" → "Bullet cam").
- The floating navigation bar hides on screens 1200 px and wider, where Home Assistant's own tabs are already
  at the top. Kiosk panels with the header hidden keep it at every width.
- Raw entity names like `dome_cam` are shown as "Dome cam" everywhere.
- **Ideas from Flux UI** (ElementZoom, MIT), rebuilt as our own self-generating cards with no extra HACS cards:
  - **Room tiles with quick buttons** (`style: tile`): name, temperature and humidity, a big room icon that
    lights up, and a column of buttons for lights, AC (with set temperature), shades and fan. Rooms are
    controlled from Home without opening them.
  - **Rooms card with floor tabs** (`custom:ajnetweb-rooms-card`): all rooms in one even grid. The chosen
    floor is remembered per device.
  - **"Right now" card** (`custom:ajnetweb-status-card`): only what needs attention - open doors and windows,
    alarms, running timers (washer, sprinklers) with time left, lights and AC on, low batteries, and offline
    devices for admins. "All good" when there is nothing.
  - **Media-aware top row:** the music player takes its place while something plays; "Right now" otherwise.
  - **Camera controls:** the gate, garage or lock of the same area appears on that area's first camera (tap
    twice to act).
- New strategy option `room_style: tile | photo` (default `tile`; `photo` keeps the photo room cards).

## 3.2.1
- Licence page: only asks for something when something is needed. With licensing not switched on, or when
  licensed through AJ Netweb Remote Access, it just shows the status (no licence key box or Activate button).

## 3.2.0 - themes, personal appearance, kiosk menu, licensing
- **AJ Netweb licence:** the add-ons and the dashboard now need this Home Assistant to be licensed by
  AJ Netweb, normally through **AJ Netweb Remote Access** (automatic, nothing to enter) or with an offline
  licence key. New *Licence* tab shows the source, the Install ID and an Activate box. The add-on publishes `sensor.ajnetweb_license`, and the dashboard cards verify the signed licence
  in the browser. Existing sites keep working for 14 days after updating. Developer builds without a
  public key are not affected. See `licensing/README.md`.
- **Five new themes:**
  - **Liquid Glass**: Apple iOS 26 style, very clear glass, bright edge highlight, vivid colour field. Light and dark.
  - **Native Blur**: Home Assistant's own colours with soft frosted cards.
  - **Aurora Gradient**: northern-lights mesh behind dark glass.
  - **Desert Dusk**: Gulf sunset gradient. Light and dark.
  - **Material You**: Material 3 tonal surfaces, no blur, fast on cheap tablets.
- **Personal appearance:** a palette button in the header lets each person choose their own theme,
  one of 10 colour gradients and a gradient wallpaper. The choice is saved per Home Assistant user
  (`frontend/set_user_data`), so it follows them to every phone and tablet. Admin rights are not needed.
  The colour changes at once; a new theme or wallpaper reloads the page once.
- New card `custom:ajnetweb-appearance-card` (the same picker, to place anywhere).
- Studio → Design: default colour gradient for everyone, *Each person can choose theme & colour*
  (on by default) and *Colour gradient as wallpaper*. New strategy options `personal`, `palette`,
  `wallpaper`, `appearance_themes`.
- Gradient accents on the music player (play button, progress, volume), the header title, the nav bar
  and the current prayer.
- Fixed for every theme: dialogs, menus and pickers now use an opaque surface
  (`card-background-color`, `ha-dialog-surface-background`), so glass themes no longer make HA's
  more-info dialogs see-through.
- New theme variables: `ajn-gradient`, `ajn-glass-saturate`, `ajn-highlight`.
- **Kiosk & ⋯ menu** for locked wall tablets:
  - A ⋯ *More* button ends the bottom bar. It holds pages that don't fit, *My theme & colour*, *My profile*,
    *Reload*, *Home Assistant settings*, *Dashboard Studio* and *Exit kiosk mode*.
  - Each item has a rule: everyone / admins / non-admins / nobody / specific people.
  - The same rules can hide HA's header and sidebar. The dashboard writes the `kiosk_mode` config for the
    kiosk-mode plugin per user, and sets `ignore_disable_km` for people who may not exit.
  - Set it in Studio → Design → *Kiosk & menu* or with the `kiosk` / `menu` strategy options.
  - With the menu on, the appearance picker moves from the header into it.

## 3.1.0 - music and prayer times
- **New music card** (`custom:ajnetweb-music-card`): built on Music Assistant, the official Home Assistant
  music server. Search YouTube Music, Spotify, Apple Music, Tidal, Deezer, SoundCloud and radio from the
  dashboard, play favourites, pick a speaker by room, move music between rooms, drag to set the volume.
  Plain speakers (Cast, Sonos, AirPlay, Spotify Connect) get full playback controls.
- The *Media* page is now **Music**: a large player plus a compact player per room. Room pages and Home
  (compact) and the Wall Panel (full) show the music card when there are speakers.
- **New prayer card** (`custom:ajnetweb-prayer-card`): next prayer with a countdown, today's times and
  the Hijri date. It works with the new **Prayer & Adhan** add-on (adhan on/off, mute next, play now) or
  with HA's built-in Islamic Prayer Times integration alone. It sits under the header on Home and the
  Wall Panel.
- Studio: *Prayer times card* switch in Design; the Music Assistant config entry is passed to the
  dashboard automatically, so non-admin users can search too.
- The `adhan_smart_mute` blueprint is now marked legacy. Use the Prayer & Adhan add-on instead.

## 3.0.1
- Fixed: in the Companion app (and other touch browsers) the room sheet opened and closed immediately.
  Taps fire on finger-up, and the phone's follow-up synthetic click landed on the new backdrop and closed
  it. Cards now swallow that ghost click, the backdrop only closes on a full tap that started on it, and
  stray `popstate` events from WebViews are ignored.

## 3.0.0 - premium UI kit
- **New AJ Netweb UI kit** (`ajnetweb-ui/`, bundled as the card suite):
  - Apple Home-style device tiles: tap to toggle, drag across to dim / set shade position / fan speed,
    hold for details, light colour glow, tap-again confirmation for locks and gates, AC +/- on the tile.
  - Room cards with the HA area photo (or a room-type gradient) and live status; tapping opens a room
    sheet (bottom sheet on phones, centred panel on tablets) with every device, scenes and an all-off button.
    Back button and swipe-down close it.
  - Camera tiles with refreshing snapshots, floating glass navigation bar, refreshed header and buttons.
- **The dashboard is now a strategy** (`strategy: custom:ajnetweb`): Home Assistant builds it live from
  areas/floors/devices, so new devices appear without redeploying. The Studio only stores options.
  The same file works in any HA project without the add-on (see `ajnetweb-ui/README.md`), and appears
  under *Community dashboards* on HA 2026.5+.
- New Studio options: room tap behaviour (sheet or page), header image, navigation bar, language now
  follows each user's HA language by default.
- Themes gain `ajn-surface-on`, `ajn-text-on`, `ajn-sheet-bg`, `ajn-nav-bg` for the premium tiles.
- The Python layout generator was removed (one source of truth: the UI kit).

## 2.0.1
- Home and Wall Panel get "Door station" and "CCTV" shortcut buttons when the AJ Netweb Intercom / CCTV
  add-ons are installed (paths detected automatically).
- Room pages (`room-<area>`) are recognised by Room & Guest Pass Studio's visibility sync.

## 2.0.0
Complete rebuild of the generator and studio.

**Fixes**
- Files were written to `/config`, which this add-on does not mount (`homeassistant_config` mounts at
  `/homeassistant`). The card suite, themes and blueprints never reached Home Assistant. Both paths
  are now detected.
- The default URL `ajnetweb` was rejected by Home Assistant (dashboard URLs must contain a hyphen),
  which caused the 404s. URLs are now normalised (`ajnetweb` -> `ajnetweb-home`).
- Removed direct writes to `.storage/lovelace*` files, which HA overwrites and which could create
  duplicate dashboard entries.
- The theme selection had no effect (every option produced the same layout). Each theme is now a
  real HA theme applied to every view.
- Removed hardcoded entities (`weather.home`, intercom panel slug, fixed "Living Room" names).
- The Frosted Glass theme depended on card-mod (HACS). It now uses native variables only.

**New**
- One responsive layout for phone, tablet and wall panel (Sections view), plus a Wall Panel view.
- Room cards with live indicators and one-tap lights toggle, grouped by Floor; a sub-page per room.
- Lights, Climate, Security, Cameras, Media and admin-only Installer views.
- Installer project: hide rooms/devices, favourites, support details, language (English/Arabic).
- Noise filtering uses HA's `entity_category` / hidden / disabled flags.
- Card suite registered through the resources API with a versioned URL; v1 cards kept for compatibility.
- Automatic backups before every deploy, with restore.
- Health checks: HA version, config mount, themes include, resource registration.
- Ingress server only accepts requests from the Supervisor proxy.

**Upgrade note:** the dashboard now lives at `/ajnetweb-home` by default. An old `/ajnetweb`
dashboard (if one exists) is left untouched; delete it in Settings → Dashboards once you've switched.

## 1.3.2
- **Overhauled Dual-Mode Architecture (📱 Mobile Mode & 📟 Wall Console)**:
  - **Zero Entity Clutter**: Automatically prunes unconfigured firmware noise, raw IEEE hex switches (`0xa4c1...`), internal configuration options, backlight modes, motor reversals, and calibration flags.
  - **Auto Device Support**: Strictly populates only real controllable devices present in the residence. Door relays mapped directly to access control / gate strikes.
  - **📱 Mobile Mode (`path: "home"`)**: Optimized 2-column stream for smartphones with glance weather/residence bar, 1-tap gate unlock strip (Main Gate, Pedestrian Gate, Garage Door), live doorbell preview, living room AC thermostat, and real lighting sliders.
  - **📟 Wall Console Mode (`path: "tablet"`)**: Wide 4-column console for wall touch panels & tablets (Hikvision DS-KH9510, Android kiosks, iPads) with 4-channel live surveillance quad matrix, master command buttons, and room hubs.
  - **Apple Frosted Glass Styling**: Seamless frosted glass blur, 18px rounded tiles, glowing borders, and high touch target reachability.
  - **Resolved 404 Routing on Deploy**: Fixed client routing and added direct launch buttons for Mobile Mode, Wall Console, and Main URL.

## 1.1.0
- **GCC Luxury Villa Super-Features (Turnkey Blueprints Suite)**:
  - Bundled 3 production-grade Home Assistant automation blueprints installed directly into `/config/blueprints/automation/ajnetweb/`:
    1. **Umm Al-Qura Adhan & Smart Media Mute (`adhan_smart_mute.yaml`)**: Automatically pauses TVs, Apple TVs, and living room soundbars at prayer times, broadcasts gentle Adhan chimes across wall displays and in-ceiling speakers, and restores previous media state after prayer.
    2. **Balcony Door & Patio AC Energy Protector (`balcony_ac_protector.yaml`)**: Prevents desert heat ingress and saves up to 35% in cooling power by turning off AC when patio doors remain open >120s, alerting wall screens, and restoring cooling upon door closure.
    3. **Villa Water Tank & Booster Pump Watchdog (`water_tank_watchdog.yaml`)**: Monitors roof/ground tank levels (<20% urgent alert) and auto-cuts booster pump power if continuously running >45m to prevent pump dry-run burnout and catastrophic pipe flooding.
- **1-Click Blueprint Synchronization**: Auto-installs on container startup and provides instant synchronization from the Dashboard Suite Ingress UI.

## 1.0.0
- Initial release of AJ Netweb Dashboard Suite.
- **Automated Room & Device Discovery Engine**: Automatically reads Home Assistant Area Registry, Device Registry, and Entity Registry to map devices to rooms.
- **5 Curated Aesthetic Presets**:
  - Cyber Luxury Glassmorphism
  - Minimalist Scandinavian
  - Modern Bento Grid (Apple Home / iOS)
  - Pure OLED Stealth (Pitch Black #000000)
  - Boutique Hotel Hub (Hospitality Concierge)
- **Zero-HACS Card Suite (`ajnetweb-card-suite.js`)**: Bundled self-contained Web Components (`<ajnetweb-room-card>`, `<ajnetweb-quick-scenes>`) registered directly into `/config/www/ajnetweb/`.
- **Native Sections & Tile Layouts**: Full compatibility with Home Assistant modern Sections layout with brightness sliders, HVAC mode toggles, and cover controls.
- **1-Click Deployment**: Writes dashboard configuration directly to Home Assistant storage and sidebar registry.
