# AJ Netweb Dashboard Suite

## Requirements

- Home Assistant **2024.11 or newer** (Sections view, heading card, `grid_options`, `perform-action`).
- Lovelace resources in **storage mode** (the default). If you manage resources in YAML, add
  `/local/ajnetweb/ajnetweb-card-suite.js?v=<version>` as a `module` yourself.
- Themes folder loaded in `configuration.yaml`:

  ```yaml
  frontend:
    themes: !include_dir_merge_named themes
  ```

The **Overview** tab checks all of this and tells you what to fix.

## Installer workflow

1. **Prepare Home Assistant** – create *Floors* and *Areas* (Settings → Areas, labels & zones) and
   assign every device to an area. This is what the generator reads; good area data = good dashboard.
2. **Design** – title, URL (must contain a hyphen, e.g. `villa-home`), language, theme and views.
3. **Rooms & Devices** – untick rooms or devices the client should not see; ★ pins a device to Home.
4. **Support Info** – your company contact, shown on the *Installer* view (visible to admins only).
5. **Deploy** – then open the links shown. On wall tablets use `/<url>/tablet`.

Settings are stored in the add-on (`/data/project.json`), so after adding devices just press
**Deploy** again. The add-on options (`dashboard_url`, `dashboard_title`, `default_theme`) are only
used as defaults for the very first project.

## What gets generated

| View | Path | Purpose |
|------|------|---------|
| Home | `home` | Header (clock, weather, alarm, live status chips), access & gates, favourites, quick actions, scenes, rooms by floor, climate, cameras |
| Wall Panel | `tablet` | Same as Home with large clock and live cameras – for wall-mounted tablets |
| Lights / Climate / Security / Cameras / Media | | Whole-house views, grouped by room. Skipped when there are no matching devices |
| Installer | `installer` | Admin-only: support details, offline devices, low batteries, available updates |
| Room pages | `room-<area>` | One sub-page per room, opened from the room cards |

Gate relays, door strikes and locks always ask for confirmation before acting.

## Live dashboard (strategy)

Since 3.0 the deployed dashboard only contains `strategy: {type: custom:ajnetweb, ...options}`.
Home Assistant runs the bundled AJ Netweb UI kit, which builds every view from the current areas,
floors and devices each time the dashboard opens. Add a device to an area and it appears - no
redeploy. Use HA's **Take control** if a client needs a hand-edited copy.

The UI kit also works without this add-on in any project: see `ajnetweb-ui/README.md`.

## Stability rules (why it won't break on HA updates)

- Only documented WebSocket APIs are used (`lovelace/dashboards/*`, `lovelace/config/*`,
  `lovelace/resources/*`). Nothing is written into `.storage` directly.
- Native cards are preferred. HA migrates their config automatically between releases.
- The bundled cards (`custom:ajnetweb-header-card`, `-area-card`, `-actions-card`) are plain Web
  Components: no Lit, no imports from HA internals, only `hass.states`, `hass.callService` and the
  standard `hass-more-info` / `location-changed` events.
- Themes use native theme variables only (no card-mod).
- The card suite is loaded with a versioned URL (`?v=<version>`), so browsers and the Companion
  app pick up new versions after an add-on update without clearing caches.

## Backups

Before each deploy (and each restore) the current layout is saved to
`/share/ajnetweb/dashboard_backups/` (last 30 kept). Restore from **Deploy & Backups**.

## Editing by hand

Manual edits made in the HA dashboard editor are overwritten by the next deploy (a backup is
taken first). For one-off client changes, either make them in the Studio, or take the dashboard
over manually and stop deploying to it.
