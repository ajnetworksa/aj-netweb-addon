// custom:ajnetweb-appearance-card - each person picks their own theme, colour gradient and wallpaper.
//   themes: [theme names]   optional - limit the choice (default: AJ Netweb themes first, then the rest)
//   palette: <key>           dashboard default colour (what "Theme colour" falls back to)
//   wallpaper: true|false    dashboard default for the wallpaper switch
// Choices are saved per HA user (see core/appearance.js). The colour repaints live; a new theme or
// wallpaper rebuilds the dashboard, so the page reloads once.
import { AjnBase, bindGestures, esc } from "../core/base.js";
import { PALETTES, currentAppearance, loadAppearance, paletteGradient, saveAppearance } from "../core/appearance.js";
import { TOKENS } from "../core/styles.js";
import { THEME_VARS } from "./sheet.js";

const PREFIX = "AJ Netweb ";

function themeMode(def, dark) {
  if (!def) return {};
  if (def.modes) return def.modes[dark ? "dark" : "light"] || Object.values(def.modes)[0] || {};
  return def;
}

export class AjnetwebAppearanceCard extends AjnBase {
  static getStubConfig() {
    return {};
  }

  connectedCallback() {
    if (this._hass) loadAppearance(this._hass).then(() => this._update(true));
  }

  watched() {
    return [];
  }

  _themes() {
    const all = Object.keys((this._hass.themes && this._hass.themes.themes) || {});
    const allowed = this._config.themes;
    const list = allowed ? all.filter((t) => allowed.includes(t)) : all;
    return list.sort((a, b) => (b.startsWith(PREFIX) - a.startsWith(PREFIX)) || a.localeCompare(b));
  }

  css() {
    return `
      .wrap { padding: 18px; display: grid; gap: 18px; }
      .title { padding-inline-end: 48px; }
      h2 { margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -.01em; color: var(--_text); }
      .sub { font-size: 13px; color: var(--_text2); margin-top: 2px; }
      h3 { margin: 0 0 10px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: var(--_text2); }
      .themes { display: grid; gap: 10px; grid-template-columns: repeat(auto-fill, minmax(108px, 1fr)); }
      .th { position: relative; border-radius: 16px; overflow: hidden; aspect-ratio: 4 / 3; cursor: pointer;
            border: 2px solid transparent; background: var(--_muted); }
      .th .bg { position: absolute; inset: 0; background-size: cover; }
      .th .mini { position: absolute; left: 10px; right: 10px; top: 10px; height: 34%; border-radius: 9px;
                  border: 1px solid rgba(255,255,255,.25); -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); }
      .th .dot { position: absolute; left: 16px; top: 18px; width: 12px; height: 12px; border-radius: 50%; }
      .th .nm { position: absolute; left: 0; right: 0; bottom: 0; padding: 6px 8px; font-size: 12px; font-weight: 600;
                color: #fff; background: linear-gradient(180deg, transparent, rgba(0,0,0,.6)); white-space: nowrap;
                overflow: hidden; text-overflow: ellipsis; }
      .th.def .nm { color: var(--_text); background: none; }
      .th.def { display: grid; place-items: center; }
      .th.def ha-icon { --mdc-icon-size: 26px; color: var(--_text2); margin-bottom: 18px; }
      .sel { border-color: var(--_accent); box-shadow: 0 0 0 3px rgba(var(--ajn-accent-rgb, 64, 156, 255), .25); }
      .pals { display: flex; flex-wrap: wrap; gap: 12px; }
      .pal { display: grid; justify-items: center; gap: 6px; width: 64px; cursor: pointer; font-size: 11px; color: var(--_text2);
             text-align: center; }
      .pal .sw { width: 46px; height: 46px; border-radius: 50%; border: 3px solid transparent; box-sizing: border-box;
                 box-shadow: inset 0 1px 0 rgba(255,255,255,.35), 0 4px 12px rgba(0,0,0,.18); }
      .pal.sel { color: var(--_text); font-weight: 600; box-shadow: none; }
      .pal.sel .sw { border-color: var(--_text); }
      .pal .none { background: conic-gradient(from 180deg, var(--_accent), var(--_muted), var(--_accent)); display: grid; place-items: center; }
      .row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 14px;
             border-radius: 14px; background: var(--_muted); cursor: pointer; color: var(--_text); font-size: 14px; font-weight: 500; }
      .sw2 { width: 46px; height: 28px; border-radius: 14px; background: rgba(var(--rgb-primary-text-color, 128,128,128), .25);
             position: relative; transition: background .2s; flex: none; }
      .sw2::after { content: ""; position: absolute; top: 3px; inset-inline-start: 3px; width: 22px; height: 22px; border-radius: 50%;
                    background: #fff; transition: transform .2s var(--_ease); box-shadow: 0 1px 3px rgba(0,0,0,.3); }
      .sw2.on { background: var(--_grad); }
      .sw2.on::after { transform: translateX(18px); }
      .foot { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
      .btn { border: 1px solid var(--_border); background: transparent; color: var(--_text); font: inherit; font-size: 13px;
             font-weight: 600; padding: 9px 16px; border-radius: 999px; cursor: pointer; }
      .busy { font-size: 13px; color: var(--_text2); }
      :host([dir=rtl]) .sw2.on::after { transform: translateX(-18px); }
    `;
  }

  render() {
    const ap = currentAppearance();
    const wall = typeof ap.wallpaper === "boolean" ? ap.wallpaper : !!this._config.wallpaper;
    const dark = !!(this._hass.themes && this._hass.themes.darkMode);
    const defs = (this._hass.themes && this._hass.themes.themes) || {};
    const themes = this._themes().map((name) => {
      const m = themeMode(defs[name], dark);
      const bg = m["lovelace-background"] || m["primary-background-color"] || "#222";
      return `<div class="th tap ${ap.theme === name ? "sel" : ""}" data-theme="${esc(name)}" role="button" tabindex="0">
        <div class="bg" style="background:${esc(bg.replace(/\s+fixed\s*$/, ""))}"></div>
        <div class="mini" style="background:${esc(m["ajn-surface"] || m["ha-card-background"] || "rgba(255,255,255,.2)")}"></div>
        <div class="dot" style="background:${esc(m["ajn-gradient"] || m["ajn-accent"] || m["primary-color"] || "#2f7dd1")}"></div>
        <div class="nm">${esc(name.startsWith(PREFIX) ? name.slice(PREFIX.length) : name)}</div></div>`;
    }).join("");
    const pals = Object.entries(PALETTES).map(([k, p]) => `
      <div class="pal tap ${ap.palette === k ? "sel" : ""}" data-pal="${k}" role="button" tabindex="0">
        <div class="sw" style="background:${paletteGradient(p)}"></div>${esc(p[this.lang()] || p.en)}</div>`).join("");
    this.setAttribute("dir", this.lang() === "ar" ? "rtl" : "ltr");
    this.html(`
      <ha-card>
        <div class="wrap">
          <div class="title"><h2>${esc(this.t("appearance"))}</h2><div class="sub">${esc(this.t("only_you"))}</div></div>
          ${themes ? `<div><h3>${esc(this.t("theme"))}</h3><div class="themes">
            <div class="th def tap ${!ap.theme ? "sel" : ""}" data-theme="" role="button" tabindex="0">
              <ha-icon icon="mdi:palette-outline"></ha-icon><div class="nm">${esc(this.t("dashboard_default"))}</div></div>
            ${themes}</div></div>` : ""}
          <div><h3>${esc(this.t("colour"))}</h3><div class="pals">
            <div class="pal tap ${!ap.palette ? "sel" : ""}" data-pal="" role="button" tabindex="0">
              <div class="sw none"></div>${esc(this.t("theme_colour"))}</div>
            ${pals}</div></div>
          <div class="row tap" data-wall role="switch" aria-checked="${wall ? "true" : "false"}" tabindex="0">
            <span>${esc(this.t("wallpaper"))}</span><span class="sw2 ${wall ? "on" : ""}"></span></div>
          <div class="foot"><span class="busy"></span>
            <button class="btn" data-reset>${esc(this.t("reset"))}</button></div>
        </div>
      </ha-card>`);
    const q = (s) => this.shadowRoot.querySelectorAll(s);
    q("[data-theme]").forEach((el) => bindGestures(el, { onTap: () => this._save({ theme: el.dataset.theme }) }));
    q("[data-pal]").forEach((el) => bindGestures(el, { onTap: () => this._save({ palette: el.dataset.pal }) }));
    q("[data-wall]").forEach((el) => bindGestures(el, { onTap: () => this._save({ wallpaper: !wall }) }));
    q("[data-reset]").forEach((el) => el.addEventListener("click", () => this._save({ theme: "", palette: "", wallpaper: undefined })));
  }

  async _save(change) {
    const before = currentAppearance();
    const next = Object.assign({}, before, change);
    const wallOf = (a) => (typeof a.wallpaper === "boolean" ? a.wallpaper : !!this._config.wallpaper);
    const rebuild = (next.theme || "") !== (before.theme || "") || wallOf(next) !== wallOf(before)
      || (wallOf(next) && (next.palette || "") !== (before.palette || ""));
    try {
      await saveAppearance(this._hass, next);
    } catch (e) {
      this.notify(`${this.t("failed")}: ${(e && e.message) || e}`);
      return;
    }
    this._update(true);
    if (rebuild) {
      const busy = this.shadowRoot.querySelector(".busy");
      if (busy) busy.textContent = this.t("applying");
      // theme and wallpaper are part of the generated dashboard - rebuild it
      setTimeout(() => window.location.reload(), 350);
    }
  }

  getCardSize() {
    return 6;
  }

  getGridOptions() {
    return { columns: 12, rows: "auto" };
  }
}

// ------------------------------------------------------------------ pop-up used by the header button
class AjnetwebAppearanceSheet extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  open(origin, hass, config) {
    const cs = getComputedStyle(origin);
    THEME_VARS.forEach((v) => {
      const val = cs.getPropertyValue(v);
      if (val) this.style.setProperty(v, val.trim());
    });
    this.shadowRoot.innerHTML = `<style>${TOKENS}
      :host { position: fixed; inset: 0; z-index: 7; display: block; }
      .scrim { position: absolute; inset: 0; background: rgba(0,0,0,.42); opacity: 0; transition: opacity .25s var(--_ease);
               -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); }
      :host(.show) .scrim { opacity: 1; }
      .panel { position: absolute; left: 0; right: 0; bottom: 0; max-height: 88vh; overflow-y: auto; border-radius: 28px 28px 0 0;
               background: var(--ajn-sheet-bg, var(--primary-background-color, #111)); transform: translateY(100%);
               transition: transform .3s var(--_ease); padding-bottom: env(safe-area-inset-bottom); }
      :host(.show) .panel { transform: none; }
      @media (min-width: 768px) {
        .panel { left: 50%; right: auto; top: 50%; bottom: auto; width: min(620px, 92vw); border-radius: 28px;
                 transform: translate(-50%, -46%); opacity: 0; transition: transform .3s var(--_ease), opacity .25s; }
        :host(.show) .panel { transform: translate(-50%, -50%); opacity: 1; }
      }
      .x { position: absolute; top: 14px; inset-inline-end: 14px; z-index: 2; width: 36px; height: 36px; border-radius: 50%;
           border: none; background: var(--_muted); color: var(--_text); display: grid; place-items: center; cursor: pointer; }
      ajnetweb-appearance-card { --ha-card-background: transparent; --ajn-surface: transparent; --ajn-glass-blur: 0px; }
    </style>
    <div class="scrim"></div>
    <div class="panel" role="dialog" aria-modal="true"><button class="x" aria-label="Close"><ha-icon icon="mdi:close"></ha-icon></button></div>`;
    const card = document.createElement("ajnetweb-appearance-card");
    card.setConfig(config || {});
    card.hass = hass;
    this.shadowRoot.querySelector(".panel").setAttribute("dir", card.lang() === "ar" ? "rtl" : "ltr");
    // re-dispatch HA events (notifications) from the opener, which is inside HA's tree
    card.addEventListener("hass-notification", (e) => { e.stopPropagation(); origin.dispatchEvent(new CustomEvent(e.type, { detail: e.detail, bubbles: true, composed: true })); });
    this.shadowRoot.querySelector(".panel").appendChild(card);
    const scrim = this.shadowRoot.querySelector(".scrim");
    let downOnScrim = false;
    scrim.addEventListener("pointerdown", () => { downOnScrim = true; });
    scrim.addEventListener("pointerup", () => { if (downOnScrim) this.close(); downOnScrim = false; });
    this.shadowRoot.querySelector(".x").addEventListener("click", () => this.close());
    this._onKey = (e) => { if (e.key === "Escape") this.close(); };
    window.addEventListener("keydown", this._onKey);
    requestAnimationFrame(() => this.classList.add("show"));
  }

  close() {
    window.removeEventListener("keydown", this._onKey);
    this.classList.remove("show");
    setTimeout(() => this.remove(), 280);
  }
}

if (!customElements.get("ajnetweb-appearance-sheet")) customElements.define("ajnetweb-appearance-sheet", AjnetwebAppearanceSheet);

export function openAppearance(origin, hass, config) {
  document.querySelectorAll("ajnetweb-appearance-sheet").forEach((s) => s.remove());
  const sheet = document.createElement("ajnetweb-appearance-sheet");
  document.body.appendChild(sheet);
  sheet.open(origin, hass, config);
  return sheet;
}
