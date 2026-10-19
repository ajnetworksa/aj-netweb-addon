// AJ Netweb look for the add-on pages (Dashboard Studio, CCTV, Door Station, Room Access, Prayer & Adhan).
// The pages open inside Home Assistant (ingress), so they can read the logged-in person's dashboard
// appearance (theme, colour, wallpaper) and paint themselves the same way: one system, one look.
//
// Built into ajnetweb_*/www/ajnetweb-look.js by `npm run build` (do not edit those copies). Each page
// loads it with a map from its own CSS variables to the shared colours:
//   <script src="ajnetweb-look.js" data-vars='{"--bg":"bg","--card":"surface","--accent":"accent"}'></script>
// Colours: bg, surface, surface2, hover, text, text2, muted, border, accent, accent_hover, accent_glow, accent_soft
// Elements marked data-ajn-look-hide (a page's own colour picker) are hidden while the shared look applies,
// and an element marked data-ajn-look-note gets a line saying where to change it.
// Opened outside Home Assistant (a new tab, a wall panel kiosk URL) the page keeps its own look.
import { PALETTES, USER_DATA_KEY, paletteWallpaper } from "../core/appearance.js";

const NOTE = {
  en: "Colours follow your dashboard appearance. Change them on the dashboard: ⋯ → Appearance.",
  ar: "الألوان تتبع مظهر لوحة التحكم الخاص بك. غيّرها من لوحة التحكم: ⋯ ← المظهر.",
};
// HA's own variables, read from the HA window when no theme is chosen anywhere
const HA_VARS = ["primary-background-color", "secondary-background-color", "card-background-color", "ha-card-background",
  "primary-text-color", "secondary-text-color", "divider-color", "primary-color", "accent-color", "lovelace-background"];

const script = document.currentScript;
let map = {};
try { map = JSON.parse((script && script.dataset.vars) || "{}"); } catch (e) { map = {}; }

function haWindow() {
  try {
    if (window.parent === window) return null;
    const root = window.parent.document.querySelector("home-assistant");
    return root && root.hass && typeof root.hass.callWS === "function" ? { hass: root.hass, doc: window.parent.document } : null;
  } catch (e) {
    return null; // another origin: not inside Home Assistant
  }
}

// the dashboard's own defaults (theme, palette, wallpaper) from its strategy config
let dashboardCache = null;
async function dashboardDefaults(hass) {
  if (dashboardCache) return dashboardCache;
  const isOurs = (c) => c && c.strategy && c.strategy.type === "custom:ajnetweb";
  const read = async (url_path) => { try { return await hass.callWS({ type: "lovelace/config", url_path }); } catch (e) { return null; } };
  let found = await read("ajnetweb-home");
  if (!isOurs(found)) {
    found = null;
    let boards = [];
    try { boards = await hass.callWS({ type: "lovelace/dashboards/list" }); } catch (e) { boards = []; }
    for (const b of boards || []) {
      if (b.mode && b.mode !== "storage") continue;
      const c = await read(b.url_path);
      if (isOurs(c)) { found = c; break; }
    }
  }
  dashboardCache = found ? found.strategy : {};
  return dashboardCache;
}

function themeVars(hass, name) {
  const def = name && hass.themes && hass.themes.themes && hass.themes.themes[name];
  if (!def) return null;
  const { modes, ...base } = def;
  const mode = modes && (hass.themes.darkMode ? modes.dark || modes.light : modes.light || modes.dark);
  return Object.assign({}, base, mode || {});
}

function luminance(color) {
  const probe = document.createElement("i");
  probe.style.color = color;
  document.body.appendChild(probe);
  const m = getComputedStyle(probe).color.match(/[\d.]+/g) || [255, 255, 255];
  probe.remove();
  return (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255;
}

async function apply() {
  const ha = haWindow();
  if (!ha || !document.body) return;
  const { hass } = ha;
  let me = {};
  try {
    const r = await hass.callWS({ type: "frontend/get_user_data", key: USER_DATA_KEY });
    me = (r && r.value && typeof r.value === "object" && r.value) || {};
  } catch (e) { me = {}; }
  const dash = await dashboardDefaults(hass);
  const personal = dash.personal !== false;
  const allowedTheme = (n) => !dash.appearance_themes || dash.appearance_themes.includes(n);
  const themeName = (personal && me.theme && allowedTheme(me.theme) && themeVars(hass, me.theme) ? me.theme : null) || dash.theme;
  const palette = PALETTES[(personal && me.palette) || dash.palette] || null;
  const wallOn = personal && typeof me.wallpaper === "boolean" ? me.wallpaper : !!dash.wallpaper;

  // HA's variables for that theme, or what HA itself is showing right now
  let vars = themeVars(hass, themeName);
  if (!vars) {
    const cs = getComputedStyle(ha.doc.documentElement);
    vars = Object.fromEntries(HA_VARS.map((k) => [k, cs.getPropertyValue(`--${k}`).trim()]).filter(([, v]) => v));
  }
  const body = document.body;
  const set = (k, v) => (v ? body.style.setProperty(k, v) : body.style.removeProperty(k));
  // the theme's own variables go on <body>, so var() references inside the theme resolve
  Object.entries(vars).forEach(([k, v]) => typeof v === "string" && set(`--${k}`, v));

  const accent = palette ? palette.accent : "var(--ajn-accent, var(--primary-color, #2f7dd1))";
  const surface = "var(--card-background-color, var(--ha-card-background, var(--primary-background-color)))";
  const colours = {
    bg: "var(--primary-background-color)",
    surface,
    surface2: `color-mix(in srgb, ${surface} 93%, var(--primary-text-color))`,
    hover: `color-mix(in srgb, ${surface} 87%, var(--primary-text-color))`,
    text: "var(--primary-text-color)",
    text2: "var(--secondary-text-color)",
    muted: "color-mix(in srgb, var(--secondary-text-color) 75%, transparent)",
    border: "var(--divider-color, rgba(127, 127, 127, 0.25))",
    accent,
    accent_hover: `color-mix(in srgb, ${accent} 85%, #000)`,
    accent_glow: `color-mix(in srgb, ${accent} 35%, transparent)`,
    accent_soft: `color-mix(in srgb, ${accent} 13%, transparent)`,
  };
  Object.entries(map).forEach(([cssVar, key]) => colours[key] && set(cssVar, colours[key]));

  const dark = luminance(getComputedStyle(body).getPropertyValue("--primary-background-color").trim() || "#fff") < 0.5;
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
  set("background", wallOn ? paletteWallpaper(palette || PALETTES.ocean, dark)
    : "var(--lovelace-background, var(--primary-background-color))");
  set("color", "var(--primary-text-color)");
  body.style.backgroundAttachment = "fixed";
  document.documentElement.classList.add("ajn-look");

  let css = document.getElementById("ajn-look-css");
  if (!css) {
    css = document.createElement("style");
    css.id = "ajn-look-css";
    document.head.appendChild(css);
  }
  css.textContent = "html.ajn-look [data-ajn-look-hide] { display: none !important; }"
    + ".ajn-look-note { margin: 4px 0 14px; padding: 10px 14px; border-radius: 10px; font-size: 13px; line-height: 1.5;"
    + " color: var(--primary-text-color); background: color-mix(in srgb, " + accent + " 14%, transparent);"
    + " border-inline-start: 3px solid " + accent + "; }";
  const lang = String((hass.locale && hass.locale.language) || hass.language || "en").startsWith("ar") ? "ar" : "en";
  document.querySelectorAll("[data-ajn-look-note]").forEach((el) => {
    el.textContent = NOTE[lang];
    el.dir = lang === "ar" ? "rtl" : "ltr";
    el.hidden = false;
  });
}

const run = () => apply().catch(() => { /* keep the page's own look */ });
if (document.body) run();
else document.addEventListener("DOMContentLoaded", run);
// coming back to the page (after changing the appearance on the dashboard) picks up the new look
document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && run());
