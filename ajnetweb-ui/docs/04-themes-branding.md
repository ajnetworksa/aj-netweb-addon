# 4. Themes, colours and branding

There are three layers. Each one overrides the one before it:

1. **Theme**: background, glass, cards and text. It is set for the whole dashboard (Studio → Design)
   or chosen by each person.
2. **Colour gradient (palette)**: accent colour plus gradient for buttons, bars, the header title, the nav bar
   and the current prayer. There is a default for everyone, and each person can choose their own.
3. **Wallpaper**: optionally, the colour gradient is used as the page background.

Everything uses standard Home Assistant theme variables plus our own `ajn-*` variables. We never use
card-mod, so HA updates don't break the look.

---

## Built-in themes (installed by Dashboard Suite)

The Studio writes them to `/config/themes/ajnetweb/ajnetweb.yaml` on every deploy. **Don't edit that file**,
because it is overwritten each time. The source is `ajnetweb_dashboard/themes.py`.

| Theme name (in HA) | Modes | Style | Best for |
|---|---|---|---|
| AJ Netweb Liquid Glass | light + dark | Apple iOS 26 "Liquid Glass": very clear glass, bright edge highlight, vivid colour field | Premium / Signature villas, iPads |
| AJ Netweb Frosted Glass | light + dark | iOS frosted glass over a soft gradient (default) | Phones and tablets, every package |
| AJ Netweb Native Blur | light + dark | Home Assistant's own colours, soft frosted cards | Sites where users also use stock HA pages |
| AJ Netweb Aurora | dark | Northern-lights mesh gradient (green, teal, violet) behind dark glass | Wall panels, cinema rooms |
| AJ Netweb Desert Dusk | light + dark | Gulf sunset gradient (sand, rose, violet) with warm glass | GCC villas, majlis |
| AJ Netweb Material | light + dark | Google Material 3: tonal surfaces, 28 px corners, **no blur** | Cheap Android tablets (fastest) |
| AJ Netweb Bento | light + dark | Solid Apple Home tiles | High contrast, older users |
| AJ Netweb Nordic | light + dark | Warm neutrals, flat | Calm homes, best readability |
| AJ Netweb Cyber Luxury | dark | Obsidian + cyan | Showrooms |
| AJ Netweb OLED | dark | True black | Always-on wall panels (lowest glare/power) |
| AJ Netweb Hospitality | dark + light | Walnut and brass | Hotels, serviced apartments |

Themes with two modes follow the device's light/dark setting.

### Which theme? Quick guide

- **The client wants "like iPhone"**: Liquid Glass (newest look) or Frosted Glass.
- **Cheap or old tablet that feels slow**: Material, Bento or OLED. These have no blur, and blur is the most
  expensive effect on weak GPUs.
- **Wall panel on all day**: OLED or Aurora at low brightness.
- **Elderly users**: Nordic or Bento (solid cards, strongest contrast).

### What is popular in the market and how we cover it

We looked at the most-used community themes and dashboards. Most of them need card-mod; ours don't.

| Popular style / theme | What people like | Our equivalent |
|---|---|---|
| iOS / Apple Home themes, Frosted Glass themes | Translucent cards, blur, soft gradients | Frosted Glass, Liquid Glass |
| "Liquid Glass" community theme and tile cards (iOS 26 look) | Clear glass with a light edge | Liquid Glass (`ajn-highlight`, high saturation) |
| Graphite, Noctis, Mushroom | Clean dark UI, native fonts | Native Blur, Bento |
| Catppuccin, Nord | Pastel / Nordic palettes | Nordic + palettes (Rose, Arctic, Graphite) |
| Material You (Google) | Tonal colours, big radius | Material |
| Caule theme packs | Many colour variants | 10 palettes × any theme, chosen per person |
| Aurora / mesh-gradient wallpapers | Colourful background behind glass | Aurora, Desert Dusk, and per-person wallpaper |

---

## Personal appearance (each person chooses)

On by default. A round **palette button** appears in the header, after the people avatars. Tapping it
opens the *Appearance* sheet:

- **Theme**: any installed theme. AJ Netweb themes are listed first, and *Dashboard default* is
  the theme set in the Studio.
- **Colour**: 10 gradients (Ocean, Aurora, Sunset, Desert gold, Emerald, Royal, Rose, Arctic, Coral,
  Graphite), or *Theme colour*.
- **Use my colour as wallpaper**: the gradient becomes the page background.
- **Reset**: back to the dashboard defaults.

How it works:
- The choice is saved **per Home Assistant user** on the HA server, with HA's own user-data store
  (`frontend/set_user_data`, key `ajnetweb_appearance`). Mama's phone and Mama's tablet look the same,
  and nobody else is affected. No admin rights are needed.
- A colour change shows at once. A theme or wallpaper change reloads the page once, because these
  are part of the generated dashboard.
- The wallpaper uses the light or dark version that matches the device mode when the page loads. After
  switching the phone between light and dark, it updates on the next reload.
- Room sheets and pop-ups take the same colours.

Installer controls (Studio → Design, or strategy options):

| Option | Default | Effect |
|---|---|---|
| `personal` | `true` | `false` hides the palette button; everyone sees the dashboard theme |
| `palette` | — | Default colour gradient for everyone (a person's own choice still wins) |
| `wallpaper` | `false` | Use the default palette as the wallpaper for everyone |
| `appearance_themes` | all | List of theme names people may pick, e.g. only the client's brand themes |
| `theme` | Frosted Glass | Dashboard default theme. Leave it empty to use each person's **HA profile** theme |

> **HA profile vs our picker.** HA's own profile page (avatar → *Theme*) sets a theme **per browser**.
> A dashboard theme overrides it inside the dashboard. Our picker is **per person** on every device,
> and also offers colours and wallpaper. For a dashboard that follows the HA profile instead, set
> `personal: false` and leave the theme empty.

The same picker is available as a card for any dashboard:

```yaml
type: custom:ajnetweb-appearance-card
palette: desert                 # optional default
themes: [AJ Netweb Liquid Glass, AJ Netweb Desert Dusk, Villa Al Noor]   # optional limit
```

---

## How a theme reaches the cards

1. Standard HA variables style native cards: `primary-color`, `ha-card-background`,
   `ha-card-border-radius`, `primary-text-color`, `lovelace-background`…
2. AJ Netweb variables refine our cards. They are all optional; without them the cards follow HA defaults.

| Variable | Controls |
|---|---|
| `ajn-accent` | Accent colour (icons, active nav item, focus ring) |
| `ajn-gradient` | Gradient for buttons, progress bars, header title (`linear-gradient(...)`) |
| `ajn-surface` | Tile/card background of **our** cards (can be clearer than `ha-card-background`) |
| `ajn-surface-on` | Tile background when **on** (the "lit" Apple Home look) |
| `ajn-text-on` | Text colour on lit tiles |
| `ajn-border` | Card borders |
| `ajn-radius` | Corner radius of tiles and buttons |
| `ajn-glass-blur` | Backdrop blur (e.g. `18px`; `0px` = solid) |
| `ajn-glass-saturate` | Colour boost behind glass (`1.4` normal, `1.9` Liquid Glass) |
| `ajn-highlight` | Edge highlight colour (Liquid Glass rim light) |
| `ajn-shadow` | Card shadow (Liquid Glass uses `inset 0 1px 0 …` for the rim) |
| `ajn-glow` | Soft glow colour for lit rooms and the play button |
| `ajn-sheet-bg` | Room sheet / appearance sheet background |
| `ajn-nav-bg` | Navigation bar glass colour (the bar text is white, so keep it darkish) |
| `ajn-tile-height` | Minimum tile height (default `116px`; wall panels: `130px`) |
| `ajn-room-height` | Minimum room card height (default `150px`) |
| `ajn-font` | Font family |

**Glass rule (important):** keep `card-background-color` and `ha-dialog-surface-background`
**opaque**. Only `ha-card-background` / `ajn-surface` may be translucent. Otherwise HA dialogs
(more-info, menus, date pickers) become see-through and text is unreadable. This is the most common
problem with community glass themes. `themes.py` does it automatically through the `solid` value.

## Making a client brand theme

Create `/config/themes/<client>.yaml`. Any file name works except our `ajnetweb/` folder.

```yaml
Villa Al Noor:
  modes:
    dark:
      primary-color: "#C9A227"
      lovelace-background: "linear-gradient(170deg, #14110d 0%, #0b0a08 100%) fixed"
      primary-background-color: "#0b0a08"
      card-background-color: "#1d1913"          # opaque - dialogs
      ha-dialog-surface-background: "#1d1913"
      ha-card-background: "rgba(40, 33, 24, 0.72)"
      ha-card-border-color: "rgba(201, 162, 39, 0.22)"
      ha-card-border-radius: "22px"
      primary-text-color: "#f6efe4"
      secondary-text-color: "#b3a48e"
      ajn-accent: "#C9A227"
      ajn-gradient: "linear-gradient(135deg, #f1cf8f 0%, #C9A227 50%, #8a6a17 100%)"
      ajn-surface: "rgba(40, 33, 24, 0.55)"
      ajn-surface-on: "rgba(255, 246, 228, 0.95)"
      ajn-text-on: "#1b1408"
      ajn-glass-blur: "16px"
      ajn-highlight: "rgba(255, 230, 180, 0.2)"
      ajn-radius: "22px"
      ajn-font: "'Tajawal', -apple-system, sans-serif"
    light:
      primary-color: "#9a7a17"
      lovelace-background: "#f6f1e9"
      card-background-color: "#ffffff"
      ha-card-background: "rgba(255,255,255,0.6)"
      ajn-accent: "#9a7a17"
      ajn-surface-on: "#ffffff"
```

Then go to Developer tools → Actions → `frontend.reload_themes`, and set **theme: Villa Al Noor** in the
strategy options (Level 3, or the raw config). The theme also appears in everyone's Appearance picker.
To make it a standard AJ Netweb theme, add it to `themes.py`. Use `_mode(...)` and pass `solid=`,
`surface=`, `gradient=`, `highlight=` as needed, then check it with
[`npm run preview`](06-developer-guide.md):

```
npm run preview
http://localhost:5173/?mode=dark&me={"theme":"AJ Netweb Liquid Glass","palette":"sunset","wallpaper":true}
```

(`me=` simulates one person's saved appearance; `theme=<key>&mode=light|dark` previews a theme directly.)

**Fonts:** web fonts must work offline on wall panels. Put the font files in
`/config/www/fonts/`, add a CSS resource with `@font-face`, then use `ajn-font`.

## Branding checklist

- [ ] Title = client's home name (Settings → General, or Studio title)
- [ ] Theme chosen with the client on a real phone **and** the wall panel (try Liquid Glass and Desert Dusk)
- [ ] Default colour gradient chosen; decide whether family members may personalise (`personal`)
- [ ] Wall panels: theme without heavy blur if the tablet is slow (Material / Bento / OLED)
- [ ] Room photos uploaded ([01, step 4](01-project-playbook.md))
- [ ] Optional header image: `/local/<client>/header.jpg`, ~1600×600, dark enough for white text
- [ ] Support Info filled (shown on the Installer page)
- [ ] At handover, show each person the palette button
