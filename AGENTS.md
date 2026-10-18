# Instructions for AI assistants (Claude, Codex, Cursor, Copilot, …)

Read this whole file before you change anything. It applies to every AI that works in this repository.
If you are changing **a client's dashboard** (not this code), read [`docs/ai-guide.md`](docs/ai-guide.md) instead.

## What this repository is

The AJ Netweb Home Assistant platform, sold to GCC villa clients. **Proprietary** (see `LICENSE`).

| Folder | What it is |
|---|---|
| `ajnetweb-ui/` | UI kit: our cards + the dashboard **strategy** (vanilla Web Components, one bundled JS file) |
| `ajnetweb_dashboard/` | Dashboard Suite add-on: Studio (installer web UI), Python engine, themes, bundled copy of the UI kit |
| `ajnetweb_adhan/`, `ajnetweb_cctv/`, `ajnetweb_intercom/`, `ajnetweb_sharing/`, `ajnetweb_tunnel/` | Other add-ons (Prayer & Adhan, CCTV, Intercom, Room & Guest Pass, Remote Access) |
| `licensing/`, `tools/license/` | Licence checks and the owner's licence tool |
| `docs/` | Project record, product plan, this AI guide |
| `ajnetweb-ui/docs/01–06` | Team playbook, customisation levels, cards reference, themes, wall panels, developer guide |

How the dashboard works: the Studio stores **options** in `/data/project.json` and deploys them as
`strategy: { type: custom:ajnetweb, ...options }`. The strategy (`ajnetweb-ui/src/strategy/dashboard.js`)
builds every view **in the browser** from HA's areas, floors and devices, separately for each user.
Nothing in the generated dashboard is stored; it is rebuilt on every load.

## Golden rules

1. **Never hand-write the generated dashboard.** Change the strategy, a card, or a Studio option. Client
   specials go into *My cards* (a normal HA dashboard that is merged in, see `docs/ai-guide.md`).
2. **Update-proof:** only the public `hass` object and DOM events. No HA frontend imports, no `hui-*`
   elements, no card-mod, no copied HACS cards. The full list is in `ajnetweb-ui/docs/06-developer-guide.md`
   → *Stability rules*.
3. **Backwards compatible:** every new option is optional with a default; never rename a card tag or
   remove an option; saved Studio projects (`project.json`) from older versions must keep working.
4. **Layout rule:** Home and Wall Panel are made of **full-width bands** (`column_span: 4`). Never put
   sections of different heights side by side (HA aligns rows to the tallest one → empty holes). Inside a
   band, size cards in whole columns (`grid_options.columns` 12 / 24 / `full`); for an equal row use a
   `horizontal-stack` with `onlyWide` plus a stacked copy with `onlyNarrow`.
5. **Two languages:** every visible string goes into `src/core/i18n.js` in **English and Arabic** (or the
   card's own `STR` table). Layouts must work right-to-left (use `inset-inline-*`, `margin-inline-*`).
6. **Touch first:** phones, wall tablets and the Companion app. Use `bindGestures()` for anything tappable.
   Test at 390 px (phone), 1024–1366 px (tablet) and 1920 px.
7. **Themes:** colours come from the `--_*` tokens in `src/core/styles.js` (which fall back to HA theme
   variables). No hard-coded colours except the semantic `COLORS`.
8. **Security:** never commit or print private keys, CA keys, tokens, `licences.csv` or client data.
   `.gitignore` blocks `*.pem` / `*.key`; keep it that way. Licensing must stay disabled until the owner
   commits their own public key. Never weaken licence checks, ingress-only access, or input validation.
9. **Admin vs. user:** the strategy runs as the logged-in user. Only use WebSocket calls a normal user may
   make (e.g. `lovelace/config` read, `history/*`, `recorder/statistics_during_period`,
   `energy/get_prefs`); wrap admin-only calls in `try/catch` and degrade gracefully.
10. **No model or AI names** in commits, code comments or docs.

## Workflow

```bash
cd ajnetweb-ui
npm install
npm run preview        # http://localhost:5173  real strategy + cards against dev/sample-house.json
                       # ?view=home|tablet|climate|room-<area>  &lang=ar  &mode=light  &theme=<key>
                       # &house=sample-villa  &options=<strategy JSON>  &admin=0&user=Mama
npm run build          # writes dist/ajnetweb-ui.js and copies it to ajnetweb_dashboard/www/ajnetweb-card-suite.js
```
- The preview fakes `hass` in `dev/preview.js` (WebSocket replies, calendars, history, energy). When a card
  calls a new API, add a mock there so the preview keeps working.
- Python: `python3 -m py_compile ajnetweb_dashboard/*.py`. Studio JS: `node --check ajnetweb_dashboard/www/app.js`.
- Studio test locally: `INGRESS_PORT=8775 DASHBOARD_DEV=1 ADDON_DATA_DIR=/tmp/x AUTO_REGISTER_RESOURCES=false python3 ajnetweb_dashboard/server.py`.
- Look at the result (screenshots at phone and tablet width, English and Arabic) before you say it works.

## Where to change what

| Task | Files |
|---|---|
| New card | `ajnetweb-ui/src/cards/<name>.js` (extend `AjnBase`), register in `src/index.js`, document in `ajnetweb-ui/docs/03-cards-reference.md` |
| Generated layout (what appears where) | `src/strategy/dashboard.js` (`homeSections`, `BANDS`, `roomView`, views) |
| New Home / Wall Panel band | `BANDS` in `dashboard.js` **and** `LAYOUT_BANDS` in `ajnetweb_dashboard/dashboard_engine.py` **and** `BANDS` / `DEFAULT_ORDER` in `ajnetweb_dashboard/www/app.js` |
| New strategy option | header comment of `dashboard.js`, `DEFAULT_PROJECT` + `generate()` in `dashboard_engine.py`, Studio UI (`www/index.html` + `www/app.js`), `docs/02-customization-levels.md` |
| Device classification (what counts as a light, gate, …) | `src/core/model.js` (keep in sync with the add-on's Python discovery) |
| Themes | `ajnetweb_dashboard/themes.py`, `ajnetweb-ui/docs/04-themes-branding.md` |
| Studio backend endpoints | `ajnetweb_dashboard/server.py` → `dashboard_engine.py` (validate every input) |

## Release checklist (every change that ships)

1. Bump the version in `ajnetweb-ui/package.json` (+ `package-lock.json`), `ajnetweb_dashboard/config.json`,
   `ADDON_VERSION` in `dashboard_engine.py` and the `?v=` in `ajnetweb-ui/README.md` (other add-ons: their
   own `config.json`).
2. `npm run build` and commit **both** bundles (`dist/ajnetweb-ui.js`, `www/ajnetweb-card-suite.js`).
3. `CHANGELOG.md` of each changed add-on, and a section at the top of `docs/project-record.md`
   (Asked for / Done / Decisions / Open; update the version table).
4. Docs: the playbook (`01`), options (`02`), cards (`03`) when they change.
5. Remove `__pycache__`; never commit `node_modules`, `/data`, keys or client files.

## Don'ts

- Don't edit `dist/` or `www/ajnetweb-card-suite.js` by hand (they are build output).
- Don't add dependencies to the bundle without a strong reason (it loads on every phone).
- Don't add a card that only works with a HACS card installed.
- Don't change the licence system, Remote Access agent or certificates unless explicitly asked.
- Don't delete user data paths: `/data/project.json`, `/config/www/ajnetweb/`, `/config/.ajnetweb/`.
