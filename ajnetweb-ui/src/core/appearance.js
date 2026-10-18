// Personal appearance: each person picks their own theme, colour gradient and wallpaper.
// Stored per HA user with the frontend's own user-data store (frontend/get_user_data,
// frontend/set_user_data), so it follows the person to every phone and tablet they log in on.
//   { theme: "<HA theme name>" | undefined, palette: "<key>" | undefined, wallpaper: true | false }
// The strategy reads it when the dashboard is built (theme + wallpaper); the cards read it
// live (accent + gradient), so a colour change shows at once.

export const USER_DATA_KEY = "ajnetweb_appearance";

// accent = solid colour for icons/text; colors = gradient stops for buttons, bars and wallpaper
export const PALETTES = {
  ocean: { en: "Ocean", ar: "المحيط", accent: "#3b9cff", colors: ["#3b9cff", "#6c63ff"] },
  aurora: { en: "Aurora", ar: "الشفق", accent: "#34d399", colors: ["#34d399", "#3b82f6", "#a855f7"] },
  sunset: { en: "Sunset", ar: "الغروب", accent: "#ff8a5c", colors: ["#ffb35c", "#ff6b6b", "#d9487a"] },
  desert: { en: "Desert gold", ar: "ذهبي صحراوي", accent: "#d9a35b", colors: ["#f1cf8f", "#d9a35b", "#a8642c"] },
  emerald: { en: "Emerald", ar: "زمردي", accent: "#16c79a", colors: ["#3ee0b0", "#16c79a", "#0e8f8f"] },
  royal: { en: "Royal", ar: "ملكي", accent: "#9b6bff", colors: ["#9b6bff", "#d65db1"] },
  rose: { en: "Rose", ar: "وردي", accent: "#ff6b9a", colors: ["#ff9a9e", "#ff6b9a", "#c86dd7"] },
  arctic: { en: "Arctic", ar: "قطبي", accent: "#4fc3f7", colors: ["#a1f0ff", "#4fc3f7", "#5c7cfa"] },
  coral: { en: "Coral", ar: "مرجاني", accent: "#ff7a59", colors: ["#ff9966", "#ff5e62"] },
  graphite: { en: "Graphite", ar: "غرافيت", accent: "#9aa3b5", colors: ["#c3c9d5", "#7d8597"] },
};

const hexRgb = (h) => {
  const v = parseInt(h.slice(1), 16);
  return `${(v >> 16) & 255}, ${(v >> 8) & 255}, ${v & 255}`;
};

export function paletteGradient(p, angle = 135) {
  const c = p.colors.length > 1 ? p.colors : [p.colors[0], p.colors[0]];
  return `linear-gradient(${angle}deg, ${c.map((x, i) => `${x} ${Math.round((i / (c.length - 1)) * 100)}%`).join(", ")})`;
}

/** View background (CSS string, accepted by HA's view `background` option) for a palette. */
export function paletteWallpaper(p, dark) {
  const [a, b, c] = [p.colors[0], p.colors[1] || p.colors[0], p.colors[2] || p.colors[0]];
  const alpha = dark ? 0.42 : 0.38;
  const base = dark ? "#0a0c13" : "#f3f4f8";
  return `radial-gradient(900px 700px at 0% 0%, rgba(${hexRgb(a)}, ${alpha}) 0%, transparent 60%), `
    + `radial-gradient(800px 650px at 100% 15%, rgba(${hexRgb(b)}, ${alpha}) 0%, transparent 60%), `
    + `radial-gradient(900px 700px at 50% 110%, rgba(${hexRgb(c)}, ${alpha}) 0%, transparent 60%), ${base} fixed`;
}

// ------------------------------------------------------------------ per-user storage
let _cache = { user: null, value: null, promise: null };

export async function loadAppearance(hass) {
  const user = hass && hass.user && hass.user.id;
  if (!user || typeof hass.callWS !== "function") return {};
  if (_cache.user === user && _cache.value) return _cache.value;
  if (_cache.user === user && _cache.promise) return _cache.promise;
  _cache = { user, value: null, promise: null };
  _cache.promise = hass.callWS({ type: "frontend/get_user_data", key: USER_DATA_KEY })
    .then((r) => (r && r.value && typeof r.value === "object" ? r.value : {}))
    .catch(() => ({}))
    .then((v) => {
      if (_cache.user === user) _cache.value = v;
      window.dispatchEvent(new CustomEvent("ajn-appearance", { detail: v }));
      return v;
    });
  return _cache.promise;
}

export function currentAppearance() {
  return _cache.value || {};
}

export async function saveAppearance(hass, value) {
  const clean = {};
  if (value.theme) clean.theme = value.theme;
  if (value.palette && PALETTES[value.palette]) clean.palette = value.palette;
  if (typeof value.wallpaper === "boolean") clean.wallpaper = value.wallpaper; // explicit off beats the dashboard default
  await hass.callWS({ type: "frontend/set_user_data", key: USER_DATA_KEY, value: clean });
  _cache = { user: hass.user && hass.user.id, value: clean, promise: null };
  window.dispatchEvent(new CustomEvent("ajn-appearance", { detail: clean }));
  return clean;
}

/**
 * Palette to use: the person's own choice, else the dashboard default (`palette` strategy option,
 * passed to cards as config.palette), else none (the theme's own accent).
 */
export function activePalette(fallbackKey) {
  const key = currentAppearance().palette || fallbackKey;
  return key && PALETTES[key] ? PALETTES[key] : null;
}

/** Set (or clear) the palette variables on a card's host element. Inline host vars win over the view theme. */
export function applyPalette(el, fallbackKey) {
  const p = activePalette(fallbackKey);
  const vars = {
    "--ajn-accent": p && p.accent,
    "--ajn-gradient": p && paletteGradient(p),
    "--ajn-glow": p && `rgba(${hexRgb(p.accent)}, 0.32)`,
    "--ajn-accent-rgb": p && hexRgb(p.accent),
  };
  Object.entries(vars).forEach(([k, v]) => (v ? el.style.setProperty(k, v) : el.style.removeProperty(k)));
}
