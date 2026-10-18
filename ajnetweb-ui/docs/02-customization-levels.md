# 2. Customising the dashboard — the five levels

Always use the **lowest level that does the job**. Each level up gives more freedom but more
maintenance. Levels 1–3 keep the dashboard self-updating; level 4 freezes it; level 5 is code.

| Level | Where | Who | Self-updating? | Survives updates? |
|---|---|---|---|---|
| 1 | Home Assistant settings (areas, names, photos, visibility) | Installer | ✅ | ✅ |
| 2 | Dashboard Studio (add-on) | Installer | ✅ | ✅ |
| 3 | Strategy options (YAML) — projects without the add-on | Installer | ✅ | ✅ |
| 4 | "Take control" + hand-edited dashboard | Senior installer | ❌ frozen | ✅ (native + our cards) |
| 5 | UI kit source code | Developer | ✅ | You maintain it |

---

## Level 1 — Home Assistant settings

| You want | Do this |
|---|---|
| Change a room name, order or floor | Settings → Areas (rooms sort by floor level, then name) |
| Room photo | Area → ✏️ → Picture |
| Room icon | Area → ✏️ → Icon |
| Rename a device on the dashboard | Rename the entity/device in HA |
| Device in the wrong room | Device page → Area |
| Hide a device everywhere | Entity settings → Visible: off |
| Make a switch count as a light | Name contains light/lamp/spot/led/chandelier… |
| Make a switch count as a gate | Entity id or name contains gate/strike/door relay/barrier |
| Custom icon on a tile | Entity settings → Icon |
| New scene on Home / in a room | Create the scene; assign an area to show it in that room |

## Level 2 — Dashboard Studio

All options live in the add-on (`/data/project.json`) and are re-applied on every deploy:

- **Design**: title, URL path, language (or follow each user), weather entity, theme, views on/off,
  room tap (sheet or page), header image, bottom navigation bar, live camera options, default colour
  gradient, personal appearance on/off, gradient wallpaper.
- **Rooms & Devices**: hide rooms, exclude devices, ★ favourites (shown on Home).
- **Support Info**: company/phone/email/notes on the admin-only Installer page.
- **Deploy & Backups**: deploy, see the generated options (*Show config*), restore older versions.

## Level 3 — Strategy options (any project, no add-on needed)

Dashboard → ⋮ → **Edit dashboard** → ⋮ → **Raw configuration editor**:

```yaml
strategy:
  type: custom:ajnetweb
  title: Villa Al Noor
  theme: AJ Netweb Frosted Glass      # any installed HA theme name
  language: ar                        # en | ar  (omit = each user's HA language)
  room_tap: popup                     # popup = room sheet | navigate = room page
  header_image: /local/villa.jpg      # optional hero image behind the clock
  exclude_entities:                   # never shown anywhere
    - switch.pump_child_lock
  hidden_areas: [technical_room]      # area ids not shown
  favorites:                          # pinned on Home (in this order of rooms)
    - light.majlis_chandelier
    - cover.living_room_curtain
  weather: weather.forecast_home
  alarm: alarm_control_panel.house
  views:                              # turn whole pages off
    panel: true
    lights: true
    climate: true
    security: true
    cameras: true
    media: false
    installer: true
  navbar: true                        # floating bottom navigation bar
  prayer: true                        # prayer card under the header (when prayer times exist)
  music: true                         # music card on Home + Music page
  music_players: []                   # limit which speakers the music card offers
  music_assistant_entry: 01J...       # lets non-admin users search Music Assistant (Studio sets it)
  personal: true                      # palette button: each person picks theme / colour / wallpaper
  palette: desert                     # default colour gradient (ocean aurora sunset desert emerald
                                      #   royal rose arctic coral graphite)
  wallpaper: false                    # true = default palette as page background
  appearance_themes: [AJ Netweb Liquid Glass, AJ Netweb Desert Dusk]   # optional: limit choices
  menu: true                          # ⋯ More button at the end of the bottom bar
  kiosk:                              # wall tablets - see 05-wall-panels.md
    hide_header: non_admins           # all | admins | non_admins | none | [user names]
    hide_sidebar: non_admins
    menu: { settings: admins, studio: admins, exit_kiosk: admins, appearance: all, pages: all,
            profile: all, reload: all }
  panel_live_cameras: true            # live video on the Wall Panel page
  cameras_live: false                 # live video on the Cameras page (more bandwidth)
  shortcuts:                          # extra buttons on Home (e.g. add-on panels, other dashboards)
    - name: Door station
      icon: mdi:doorbell-video
      navigation_path: /abc123_ajnetweb_intercom
  branding:
    company: AJ Netweb
    phone: "+966 5x xxx xxxx"
    email: support@ajnetweb.example
    website: https://ajnetweb.example
    notes: "Service visits every 6 months."
  admins: []                          # user ids that see the Installer page (default: all admins)
```

The same options can be set with the visual editor: Dashboard → ⋮ → Edit dashboard → ✏️.

## Level 4 — Take control (hand-edited dashboard)

Use only when a client needs something the generator can't do (a custom page, special layout).

1. Dashboard → ⋮ → **Edit dashboard** → ⋮ → **Take control** → keep the existing content.
2. You now have a normal dashboard containing our cards + native cards. Edit freely in the UI.
3. **Trade-off:** new devices no longer appear automatically, and Studio deploys would overwrite it
   (a backup is taken first). Note in the project file that this site is hand-edited.

Tips for hand-editing:
- Keep using **Sections** views and our cards for the same look ([03 — Cards](03-cards-reference.md)).
- Add a custom page next to the generated one instead of editing everything: create a **second
  dashboard** (normal, not strategy) for the special page and link to it from the strategy with
  `shortcuts:` — the main dashboard stays self-updating.

## Level 5 — Change the UI kit itself

For changes every project should get (new card, new device type, new language, layout change).
See [06 — Developer guide](06-developer-guide.md). Rule: change the kit, release a version, update
the add-on on sites — never patch the JS file on one client's server.

---

## Common requests and the right level

| Client asks | Level | How |
|---|---|---|
| "Show the pool pump on Home" | 2 | ★ in Studio |
| "Hide the store room" | 2 | Untick the room in Studio |
| "Use our villa photo at the top" | 2 | Header image (upload to `/config/www/`, use `/local/...`) |
| "Make it gold" | 2 / 5 | Desert Dusk / Hospitality theme + *Desert gold* palette, or a brand theme ([04](04-themes-branding.md)) |
| "Like the new iPhone" | 2 | Liquid Glass theme |
| "My daughter wants pink" | — | She taps the palette button → Rose (only her account changes) |
| "Nobody may change the look" | 2 | Studio → Design → untick *Each person can choose theme & colour* |
| "Lock the majlis tablet, but Mama can change colours" | 2 | Studio → Kiosk & menu: hide header for `panel-majlis`, *My theme & colour* → Specific people `Mama` |
| "Arabic for my mother, English for me" | 2 | Language: follow each user |
| "Staff must not see the master bedroom" | — | Room & Guest Pass Studio → permission matrix → Sync |
| "One page with only the garden irrigation" | 4 | Second dashboard, linked via `shortcuts` |
| "A new button type for all clients" | 5 | New card in the kit |
