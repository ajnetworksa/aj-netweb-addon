# Changing a client's dashboard — guide for AI assistants

For any AI (or new team member) asked to add or change something on an AJ Netweb dashboard at a
client site. To change the **code** of the platform, read [`../AGENTS.md`](../AGENTS.md) instead.

## First, understand what you are looking at

- The dashboard (e.g. `/villa-home`) is a **strategy dashboard**: its stored config is only
  `strategy: { type: custom:ajnetweb, ...options }`. Every page is generated live in the browser from
  Home Assistant's **areas, floors, devices and entity names**, separately for each user.
- The options come from the **Dashboard Studio** add-on (sidebar → *Dashboard Studio*), saved in the
  add-on's `/data/project.json`. **Deploy** in the Studio writes them to the dashboard.
- Custom cards live in a separate normal dashboard, **My cards** (`/ajnetweb-cards`). Its first page is
  merged into Home and the Wall Panel; its other pages become extra pages of the main dashboard.

So there are exactly three safe places to make a change. Pick the first one that can do it.

## The decision ladder (use the first rung that works)

| # | Where | Use it for | How |
|---|---|---|---|
| 1 | **Home Assistant itself** | Room names and photos, which room a device is in, floors, device / entity names, icons, hiding an entity, new scenes | Settings → Areas / Devices / Entities, or WebSocket `config/area_registry/update`, `config/entity_registry/update`. The dashboard follows by itself — **no deploy needed** |
| 2 | **Dashboard Studio** | Order of the Home / Wall Panel blocks, hidden blocks, top-row cards, *Today at home* cards, room order, room style, cameras, favourites, hidden rooms / devices, theme, language, pages on/off, kiosk menu rules, support info | The Studio UI (Layout, Design, Rooms & Devices tabs) → **Apply / Deploy**. All options: `ajnetweb-ui/docs/02-customization-levels.md` |
| 3 | **My cards** dashboard | Anything special for this client: irrigation, pool, energy graphs, a gate button with a PIN, a page for the garden, any HA or HACS card | Studio → Layout → *Open My cards editor* (or `/ajnetweb-cards/home?edit=1`), then HA's visual editor. Or save it with WebSocket (below) |

**Never** do any of these:
- ❌ "Take control" of the main dashboard, or save a hand-written config over it (`lovelace/config/save`
  on the main dashboard). It stops updating with the house and the next Studio deploy overwrites it anyway.
- ❌ Edit `/config/www/ajnetweb/*.js`, the add-on files, or the theme YAML files the Studio writes —
  they are replaced on every update.
- ❌ Install card-mod or style the dashboard with it; don't change themes by hand (use the Studio).
- ❌ Change licence files under `/config/.ajnetweb/`, Remote Access settings, users or passwords unless
  the installer explicitly asked for exactly that.
- ❌ Rename or delete areas, devices or entities that automations use, without listing what depends on
  them first (Settings → the entity → *Related*).

## Recipes

**"Rename the majlis to Diwan" / "use this photo for the kitchen"** → rung 1.
Settings → Areas → the area → ✏️, or Studio → Layout → Rooms → ✏️ / 📷 (resizes and uploads for you).

**"The pool pump should be on Home"** → rung 2. Studio → Rooms & Devices → ★ the device → Deploy.

**"A light shows in the wrong room"** → rung 1. Set the device's (or entity's) area.

**"Hide the store room" / "hide the boiler switch"** → rung 2 (untick in Rooms & Devices), or rung 1
(hide the entity).

**"Rooms first, then scenes" / "no cameras on Home"** → rung 2. Studio → Layout → drag / untick → Apply.

**"Show the family calendar / energy / room temperatures"** → rung 2. Studio → Layout → *Today at home*.
Energy needs HA's Energy dashboard set up first (Settings → Dashboards → Energy).

**"Add a sprinkler card and a pool-temperature graph to Home"** → rung 3. Add them to the **first page**
of My cards. Use our cards so it matches the look:

```yaml
# a band on Home: section of the first My cards page (sections view)
type: grid
column_span: 4            # full width - always use 4 for sections on the first page
cards:
  - type: heading
    heading: Pool & garden
  - type: custom:ajnetweb-device-card
    entity: switch.sprinklers
    grid_options: { columns: 12 }
  - type: custom:ajnetweb-graph-card
    entity: sensor.pool_temperature
    title: Pool
    grid_options: { columns: 24 }
```

**"A separate Garden page"** → rung 3. Add a second page (view) to My cards. It appears in the bottom
bar / ⋯ menu of the main dashboard after a reload.

### Saving My cards from code (WebSocket, admin token)

```json
{"type": "lovelace/config", "url_path": "ajnetweb-cards"}
```
Read it first, change only what you were asked, then save the **whole** config back:
```json
{"type": "lovelace/config/save", "url_path": "ajnetweb-cards", "config": { "views": [ ... ] }}
```
If the dashboard doesn't exist yet, create it from the Studio (Layout → *Create My cards*), not by hand —
the Studio also links it to the main dashboard.

## Rules for any card you add

- **Layout:** on the first My cards page every section is full width (`column_span: 4`). Inside it, size
  cards in steps of 12 (`grid_options.columns`: 12 = one column, 24 = two, `full`). Never leave a short
  section next to a tall one.
- **Prefer our cards** (`custom:ajnetweb-*`, see `ajnetweb-ui/docs/03-cards-reference.md`), then native
  HA cards (tile, heading, thermostat, history-graph, entities). Use a HACS card only if the installer
  agreed — it has to be installed and kept updated on that site.
- **Names:** short, as the family says them ("Majlis AC", not "climate.majlis_ac_2"). Arabic sites: write
  the Arabic name in HA (area / entity), the cards pick it up.
- **Safety:** gates, doors and locks must keep a confirmation (our device card does it with
  `access: true`). Don't put alarm disarm or garage open on a page visible to children or guests.
- **Permissions:** which rooms a person or wall tablet gets is set in **Room & Guest Pass Studio → User
  Room Matrix** (and *Device room*), never by hiding cards by hand. My cards are visible to everyone who
  opens the dashboard: use a section's or card's `visibility: [{ condition: user, users: [<user id>] }]`
  for owner-only things.

## Before you say "done"

1. Open the main dashboard on a **phone width** and a **tablet width** (Studio → Layout → preview), in
   both languages if the site uses Arabic.
2. Check Home, Wall Panel and the page you changed: no empty holes, no "Custom element doesn't exist",
   no entity showing "unavailable" that wasn't before.
3. Tell the installer exactly what you changed and where (HA setting, Studio option, or My cards card),
   so it can be undone.
