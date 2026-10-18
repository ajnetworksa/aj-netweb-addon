# 4. Themes and branding

## Built-in themes (installed by Dashboard Suite)

Written to `/config/themes/ajnetweb/ajnetweb.yaml` on every deploy — **don't edit that file**, it is
overwritten. Source: `ajnetweb_dashboard/themes.py`.

| Theme name (in HA) | Modes | Best for |
|---|---|---|
| AJ Netweb Frosted Glass | light + dark | Default, phones and tablets |
| AJ Netweb Cyber Luxury | dark | Showrooms, cinemas |
| AJ Netweb Nordic | light + dark | Calm homes, elderly users (high readability) |
| AJ Netweb Bento | light + dark | Apple-Home look, solid tiles |
| AJ Netweb OLED | dark | Always-on wall panels (lowest glare/power) |
| AJ Netweb Hospitality | dark + light | Hotels, serviced apartments, majlis panels |

Two-mode themes follow the device's light/dark setting.

## How a theme reaches the cards

1. Standard HA variables style native cards: `primary-color`, `ha-card-background`,
   `ha-card-border-radius`, `primary-text-color`, `lovelace-background`…
2. AJ Netweb variables refine our cards (all optional — without them the cards follow HA defaults):

| Variable | Controls |
|---|---|
| `ajn-accent` | Accent colour (icons, active nav item, eyebrow title) |
| `ajn-surface` | Tile/card background when off |
| `ajn-surface-on` | Tile background when **on** (the "lit" Apple-Home look) |
| `ajn-text-on` | Text colour on lit tiles |
| `ajn-border` | Card borders |
| `ajn-radius` | Corner radius of tiles and buttons |
| `ajn-glass-blur` | Backdrop blur (e.g. `18px`; `0px` = solid) |
| `ajn-shadow` | Card shadow |
| `ajn-glow` | Soft glow colour for lit rooms |
| `ajn-sheet-bg` | Room sheet background |
| `ajn-nav-bg` | Navigation bar glass colour |
| `ajn-tile-height` | Minimum tile height (default `116px`; wall panels: `130px`) |
| `ajn-room-height` | Minimum room card height (default `150px`) |
| `ajn-font` | Font family |

## Making a client brand theme

Create `/config/themes/<client>.yaml` (any file name except our `ajnetweb/` folder):

```yaml
Villa Al Noor:
  modes:
    dark:
      primary-color: "#C9A227"
      lovelace-background: "linear-gradient(170deg, #14110d 0%, #0b0a08 100%) fixed"
      primary-background-color: "#0b0a08"
      ha-card-background: "rgba(40, 33, 24, 0.72)"
      ha-card-border-color: "rgba(201, 162, 39, 0.22)"
      ha-card-border-radius: "22px"
      primary-text-color: "#f6efe4"
      secondary-text-color: "#b3a48e"
      ajn-accent: "#C9A227"
      ajn-surface: "rgba(40, 33, 24, 0.72)"
      ajn-surface-on: "rgba(255, 246, 228, 0.95)"
      ajn-text-on: "#1b1408"
      ajn-glass-blur: "12px"
      ajn-radius: "22px"
      ajn-font: "'Tajawal', -apple-system, sans-serif"
    light:
      primary-color: "#9a7a17"
      lovelace-background: "#f6f1e9"
      ha-card-background: "rgba(255,255,255,0.6)"
      ajn-accent: "#9a7a17"
      ajn-surface-on: "#ffffff"
```

Then Developer tools → Actions → `frontend.reload_themes`, and set **theme: Villa Al Noor** in the
strategy options (Studio level-3, or raw config). Test with [`npm run preview`](06-developer-guide.md)
first by adding the theme to `themes.py` if it should become a standard AJ Netweb theme.

**Fonts:** web fonts must be available offline on wall panels. Put the font files in
`/config/www/fonts/`, add a CSS resource with `@font-face`, then use `ajn-font`.

## Branding checklist

- [ ] Title = client's home name (Settings → General, or Studio title)
- [ ] Theme chosen with the client on a real phone **and** the wall panel
- [ ] Room photos uploaded ([01, step 4](01-project-playbook.md))
- [ ] Optional header image: `/local/<client>/header.jpg`, ~1600×600, dark enough for white text
- [ ] Support Info filled (shown on the Installer page)
