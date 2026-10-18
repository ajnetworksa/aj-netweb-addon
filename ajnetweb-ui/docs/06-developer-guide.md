# 6. Developer guide — changing the UI kit

## Architecture in one picture

```
Home Assistant frontend (browser / Companion app)
 └─ loads resource /local/ajnetweb/ajnetweb-card-suite.js?v=<version>   (= dist/ajnetweb-ui.js)
     ├─ ll-strategy-dashboard-ajnetweb   ← dashboard config: { strategy: { type: custom:ajnetweb, ...options } }
     │    └─ generate(options, hass) → views/sections/cards, built from hass.areas/floors/devices/entities
     └─ custom cards (device, area, camera, header, actions, nav) + room sheet

Dashboard Suite add-on (Python)
 ├─ copies the JS into /config/www/ajnetweb/ and registers it (versioned URL)
 ├─ writes themes to /config/themes/ajnetweb/ajnetweb.yaml
 └─ saves the strategy options from the Studio into the dashboard (with backup)
```

## Source layout (`ajnetweb-ui/`)

| Path | Contents |
|---|---|
| `src/index.js` | Registers cards, strategy, editor; card picker + Community dashboards metadata |
| `src/core/base.js` | `AjnBase` class (config, hass, render-on-change), gestures (tap/hold/drag, ghost-click guard), service helper |
| `src/core/model.js` | House model: classify entities into groups, rooms, floors (same rules as `discovery.py`) |
| `src/core/i18n.js` | Strings (en, ar). Add a language here |
| `src/core/styles.js` | Design tokens (`--ajn-*` fallbacks), colours, room gradients |
| `src/cards/*.js` | One file per card; `sheet.js` = room sheet |
| `src/strategy/dashboard.js` | The generator: which views/sections/cards are produced |
| `src/strategy/editor.js` | Visual options editor |
| `dev/` | Preview tool with a fake villa (`sample-house.json`) |
| `build.mjs` | Bundles to `dist/ajnetweb-ui.js` and copies into the add-on |

## Setup

```bash
cd ajnetweb-ui
npm install
npm run preview      # http://localhost:5173 — live reload, real cards + strategy on a fake house
npm run build        # production bundle → dist/ and ajnetweb_dashboard/www/ajnetweb-card-suite.js
```

Preview URL parameters: `theme` (theme key from `themes.py`), `mode` (dark|light), `lang` (en|ar),
`view` (home, tablet, lights, climate, security, cameras, room-<area>…), `options` (strategy options
as JSON, e.g. `options={"room_tap":"navigate"}`). Use the browser's device toolbar for phone/tablet
sizes. `window.dashboardConfig` in the console shows the generated config.

To preview a **real site**: open the client's dashboard in Chrome on your PC, press F12 → Console, run

```js
const h = document.querySelector("home-assistant").hass;
copy(JSON.stringify({ states: h.states, entities: h.entities, devices: h.devices, areas: h.areas, floors: h.floors }));
```

and paste the clipboard into `dev/sample-house.json` (don't commit client data — keep it local).

## Stability rules (do not break these)

1. Use only the public `hass` object: `states`, `entities`, `devices`, `areas`, `floors`, `user`,
   `locale`, `config`, `callService`, `callWS`, `formatEntityState`, `formatEntityAttributeValue`.
2. Talk to HA only with DOM events: `hass-more-info`, `location-changed`, `hass-notification`.
3. No imports from the HA frontend, no Lit from HA, no `customElements.get("hui-…")`, no card-mod.
4. Guard optional APIs (`typeof hass.formatEntityState === "function"`).
5. Every new option must be optional with a sensible default (old configs keep working).
6. Never rename a card tag or remove an option — deprecate it and keep it working.
7. Touch first: use `bindGestures()` for anything tappable (it handles mouse, touch, pen, ghost clicks).

## Recipes

### Add an option to a card
1. Read it from `this._config` in the card (`src/cards/<card>.js`) with a default.
2. Document it in [03 — Cards](03-cards-reference.md).
3. If the generator should set it, add it in `src/strategy/dashboard.js`.

### Add a new card
```js
// src/cards/energy.js
import { AjnBase, esc } from "../core/base.js";

export class AjnetwebEnergyCard extends AjnBase {
  validate(config) { if (!config.entity) throw new Error("entity is required"); }
  watched() { return [this._config.entity]; }        // re-render only when these change
  css() { return `.v { font-size: 28px; font-weight: 600; }`; }
  render() {
    const st = this.st(this._config.entity);
    this.html(`<ha-card><div class="v">${esc(st ? st.state : "--")}</div></ha-card>`);
  }
  getGridOptions() { return { columns: 6, rows: "auto" }; }
}
```
Then register it in `src/index.js` (add to `CARDS`), preview, build.

### Support a new device type
1. `src/core/model.js` → `classify()`: map the domain/device_class to a group (or a new group,
   added to `GROUPS`).
2. `src/cards/device.js` → `iconFor`, `isActive`, `colorFor`, `_tap` for its behaviour.
3. `src/cards/sheet.js` → `SECTIONS` if it needs its own section in the room sheet.
4. Mirror the classification in `ajnetweb_dashboard/discovery.py` (Studio lists).

### Add a language
Copy the `en` block in `src/core/i18n.js`, translate, add the language to the Studio select
(`ajnetweb_dashboard/www/index.html`) and the strategy editor (`src/strategy/editor.js`). RTL
works automatically (layout uses logical properties).

### Change the generated layout
Edit `src/strategy/dashboard.js` (`homeSections`, `roomView`, view builders). Check phone (390 px),
portrait tablet (820 px) and landscape panel (1280 px) in the preview.

## Release process

1. Bump the version in **both** `ajnetweb-ui/package.json` and `ajnetweb_dashboard/config.json`
   (the add-on version is used in the resource URL `?v=`, which forces phones to reload).
2. `npm run build` — commit `dist/ajnetweb-ui.js` **and** `ajnetweb_dashboard/www/ajnetweb-card-suite.js`.
3. Add a `CHANGELOG.md` entry in `ajnetweb_dashboard/`.
4. Test in the preview (phone + tablet + Arabic), then on a test HA with the Companion app.
5. Push / merge; update the add-on on client sites (or let Remote Access do it).
6. If a site shows old behaviour, clear the app cache: **iPhone/iPad** Companion app → Settings →
   Companion App → Debugging → *Reset frontend cache*; **Android** Settings → Apps → Home Assistant →
   Storage → *Clear cache*; browsers: hard refresh (Ctrl+Shift+R).

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| "Custom element doesn't exist: ajnetweb-…" | Resource not loaded: Studio Overview check, or refresh the app once |
| Dashboard shows "Unknown strategy" | Same — resource missing or old version cached |
| Old look after an update | Version not bumped (`?v=` unchanged) or app cache → clear it (see Release step 6) |
| Pop-up closes immediately on phones | Fixed in 3.0.1 (ghost click). Update the add-on, clear the app cache |
| A device is missing | Not in an area, hidden, `entity_category` config/diagnostic, excluded in Studio, or unsupported domain |
| Wrong room for a device | Fix the device's area in HA |
| Switch shows as "Devices" not "Lights" | Rename with light/lamp/spot/led… or set *Show as* |
| Theme not applied | `frontend: themes:` include missing in configuration.yaml, then reload themes |
| Cameras black | Camera entity unavailable, or the browser blocks mixed http/https images |

## Layout rules for the generated Home and Wall Panel

Home Assistant's sections view aligns each row of sections to the tallest one, so sections of different
heights side by side leave holes. Each section's card grid is `12 × column_span` columns. The strategy
therefore:

1. Builds Home and Wall Panel from **full-width bands** (`column_span: 4`), one band per topic.
2. Sizes cards in a band in **whole view columns** (`columns: 12` = one column, `6` = half). They then wrap
   cleanly at any width: 4 / 3 / 2 / 1 columns depending on the screen.
3. Puts things that must share one row with equal heights (weather · prayer · music, camera rows) in a native
   `horizontal-stack`, shown only on screens ≥ 768 px (`visibility: screen`). Phones get the stacked
   versions.

`npm run preview` uses the same column rules as HA (min 320 px, max 500 px per column, 32 px gaps), so what
you see there matches the real dashboard. `?house=sample-villa` loads a test villa with more cameras and
people.

