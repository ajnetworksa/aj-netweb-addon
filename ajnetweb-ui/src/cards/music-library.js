// custom:ajnetweb-music-library-card - Music Assistant's own app (library, playlists, radio, queue,
// settings) inside the dashboard, painted in the person's own appearance (theme, colour, light/dark).
//
//   addon: <add-on slug>   # optional; default: the Music Assistant add-on found in the sidebar
//   height: 720            # optional, px; default fills most of the screen
//
// How: the Music Assistant add-on opens through Home Assistant ingress, which is the same web address as
// the dashboard. The card asks the Supervisor for the add-on's ingress address and a session (the same two
// calls HA's own sidebar makes; both are allowed for normal users because Music Assistant sets
// `panel_admin: false`), shows the app in a frame and adds a small stylesheet to it that sets Music
// Assistant's colour variables (Vuetify `--v-theme-*` and its Tailwind tokens) to ours. Nothing in Music
// Assistant is changed or stored; it opens unchanged from the HA sidebar.
// Music Assistant run outside Home Assistant (Docker on another machine) is another web address: the
// browser does not let a page restyle it, so the card says so instead of showing it unthemed.
import { AjnBase, bindGestures, esc, haptic } from "../core/base.js";

const STR = {
  en: {
    title: "Music library", full: "Full screen", exit: "Close full screen", loading: "Opening Music Assistant…",
    missing: "Music Assistant is not installed. The installer adds it in Dashboard Suite → Music.",
    stopped: "Music Assistant is not running. The installer can start it in Dashboard Suite → Music.",
    failed: "Music Assistant could not be opened.", retry: "Try again",
  },
  ar: {
    title: "مكتبة الموسيقى", full: "ملء الشاشة", exit: "إغلاق ملء الشاشة", loading: "جارٍ فتح Music Assistant…",
    missing: "لم يتم تثبيت Music Assistant. يضيفه الفني من Dashboard Suite ← الموسيقى.",
    stopped: "Music Assistant متوقف. يمكن للفني تشغيله من Dashboard Suite ← الموسيقى.",
    failed: "تعذّر فتح Music Assistant.", retry: "إعادة المحاولة",
  },
};

const SLUG = /(^|_)music_assistant(_beta|_nightly|_dev)?$/;

/** Sidebar slug of the Music Assistant add-on, from hass.panels (public; lists only what this user may open). */
export function musicAssistantAddon(hass) {
  const panels = Object.values((hass && hass.panels) || {});
  const slugs = panels.map((p) => (p && p.config && (p.config.addon || p.config.ingress)) || "").filter((s) => SLUG.test(s));
  return slugs.find((s) => /_music_assistant$/.test(s)) || slugs[0] || null;
}

// ------------------------------------------------------------------ colours
let _canvas;
/** Any CSS colour (rgba(), color-mix(), color(srgb …)) -> [r, g, b, a] in 0-255 / 0-1. */
function rgba(css) {
  try {
    _canvas = _canvas || Object.assign(document.createElement("canvas"), { width: 1, height: 1 });
    const ctx = _canvas.getContext("2d", { willReadFrequently: true });
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "#000";
    ctx.fillStyle = css;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    return [r, g, b, a / 255];
  } catch (e) {
    return null;
  }
}
const over = (top, under) => top.slice(0, 3).map((v, i) => Math.round(v * top[3] + under[i] * (1 - top[3])));
const mix = (a, b, t) => a.map((v, i) => Math.round(v * (1 - t) + b[i] * t));
const lum = ([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
const hex = (c) => `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
const trip = (c) => c.join(",");

/**
 * Stylesheet that repaints Music Assistant in the given colours (opaque [r,g,b] each).
 * Music Assistant styles with Vuetify (`--v-theme-<name>` as "r,g,b" on .v-theme--light/.v-theme--dark)
 * and Tailwind tokens on :root / .dark; both are set, for both of its modes, so its own light/dark
 * choice can't undo ours.
 */
export function musicAssistantCss({ bg, surface, text, text2, accent, border }) {
  const dark = lum(bg) < 0.5;
  const onAccent = lum(accent) > 0.6 ? [17, 17, 17] : [255, 255, 255];
  const raised = mix(surface, text, dark ? 0.07 : 0.05);
  const hover = mix(surface, text, dark ? 0.12 : 0.09);
  const v = {
    background: bg, "on-background": text, surface, "on-surface": text, "surface-bright": raised,
    "surface-light": raised, "surface-variant": raised, "on-surface-variant": text2,
    primary: accent, "on-primary": onAccent, "primary-darken-1": mix(accent, [0, 0, 0], 0.15),
    secondary: accent, "on-secondary": onAccent, fg: text, panel: surface, overlay: bg, default: dark ? [0, 0, 0] : [255, 255, 255],
  };
  const tw = {
    background: bg, foreground: text, card: surface, "card-foreground": text, popover: surface, "popover-foreground": text,
    primary: accent, "primary-foreground": onAccent, secondary: raised, "secondary-foreground": text,
    muted: raised, "muted-foreground": text2, accent: hover, "accent-foreground": text, border, input: border, ring: accent,
    "chart-1": accent, sidebar: surface, "sidebar-foreground": text, "sidebar-primary": accent,
    "sidebar-primary-foreground": onAccent, "sidebar-accent": hover, "sidebar-accent-foreground": text, "sidebar-border": border,
  };
  const vt = Object.entries(v).map(([k, c]) => `--v-theme-${k}:${trip(c)} !important;`).join("")
    + `--v-border-color:${trip(text)} !important;`;
  const tt = Object.entries(tw).map(([k, c]) => `--${k}:${hex(c)} !important;`).join("");
  return `html:root,html.dark,html:root.dark{color-scheme:${dark ? "dark" : "light"};${tt}}`
    + `html .v-theme--light,html .v-theme--dark{${vt}}`
    + `html,body{background:${hex(bg)} !important;}`;
}

export class AjnetwebMusicLibraryCard extends AjnBase {
  static getStubConfig() {
    return {};
  }

  setConfig(config) {
    super.setConfig(config || {});
  }

  s(key) {
    return (STR[this.lang()] || STR.en)[key] || STR.en[key];
  }

  set hass(hass) {
    const sig = hass && hass.themes ? `${hass.themes.darkMode}|${hass.themes.theme}` : "";
    super.hass = hass;
    if (this._sig !== undefined && sig !== this._sig) this._paintSoon();
    this._sig = sig;
  }

  get hass() {
    return this._hass;
  }

  connectedCallback() {
    this._onLook = () => this._paintSoon();
    window.addEventListener("ajn-appearance", this._onLook);
    if (this._hass && this._config && this._slug && !this._keep) this._keepAlive();
  }

  disconnectedCallback() {
    window.removeEventListener("ajn-appearance", this._onLook);
    clearInterval(this._keep);
    this._keep = null;
  }

  css() {
    return `
      ha-card { position: relative; }
      .bar { display: flex; align-items: center; gap: 10px; padding: 10px 12px 10px 16px; }
      .bar .t { flex: 1; font-size: 15px; font-weight: 700; color: var(--_text); }
      .bar ha-icon.lead { color: var(--_accent); }
      .b { width: 38px; height: 38px; border-radius: 50%; border: none; background: var(--_muted); color: var(--_text);
           display: grid; place-items: center; cursor: pointer; padding: 0; }
      .frame { position: relative; height: var(--ajn-ml-height, min(78vh, 900px)); min-height: 420px; border-top: 1px solid var(--_border); }
      iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; background: transparent; opacity: 0; transition: opacity .25s; }
      iframe.ready { opacity: 1; }
      .msg { position: absolute; inset: 0; display: grid; place-content: center; gap: 12px; text-align: center; padding: 24px;
             color: var(--_text2); font-size: 14px; line-height: 1.5; }
      .msg[hidden] { display: none; }
      .msg button { justify-self: center; height: 38px; padding: 0 18px; border-radius: 999px; border: none; font: inherit;
                    font-weight: 600; background: var(--_grad); color: #fff; cursor: pointer; }
      .info { padding: 16px; display: flex; gap: 12px; align-items: center; color: var(--_text2); font-size: 14px; line-height: 1.5; }
      .info ha-icon { color: var(--_accent); flex: none; }
      :host(:fullscreen) ha-card { border-radius: 0; border: 0; display: flex !important; flex-direction: column; background: var(--primary-background-color, #111); }
      :host(:fullscreen) .frame { flex: 1; height: auto; }
      :host(.full) ha-card { position: fixed; inset: 0; z-index: 9; border-radius: 0; border: 0; display: flex !important; flex-direction: column;
                             background: var(--primary-background-color, #111); -webkit-backdrop-filter: none; backdrop-filter: none; }
      :host(.full) .bar { padding-top: max(10px, env(safe-area-inset-top)); }
      :host(.full) .frame { flex: 1; height: auto; }
      @media (max-width: 600px) { .frame { height: var(--ajn-ml-height, calc(100vh - 190px)); } }
    `;
  }

  render() {
    const slug = (this._config && this._config.addon) || musicAssistantAddon(this._hass);
    if (!slug) {
      this._slug = null;
      this.html(`<ha-card><div class="info"><ha-icon icon="mdi:music-box-multiple-outline"></ha-icon><span>${esc(this.s("missing"))}</span></div></ha-card>`);
      return;
    }
    // built once: re-rendering would reload Music Assistant (only the language changes it)
    if (slug === this._slug && this._lang === this.lang() && this.shadowRoot.querySelector("iframe")) return;
    this._slug = slug;
    this._lang = this.lang();
    const h = Number(this._config.height);
    if (h > 200) this.style.setProperty("--ajn-ml-height", `${h}px`);
    else this.style.removeProperty("--ajn-ml-height");
    this.html(`<ha-card dir="${this._lang === "ar" ? "rtl" : "ltr"}">
      <div class="bar"><ha-icon class="lead" icon="mdi:music-box-multiple"></ha-icon><div class="t">${esc(this.s("title"))}</div>
        <button class="b" data-full title="${esc(this.s("full"))}" aria-label="${esc(this.s("full"))}"><ha-icon icon="mdi:fullscreen"></ha-icon></button></div>
      <div class="frame"><iframe title="Music Assistant" allow="autoplay; fullscreen; clipboard-write"></iframe>
        <div class="msg" data-msg>${esc(this.s("loading"))}</div></div></ha-card>`);
    const full = this.shadowRoot.querySelector("[data-full]");
    bindGestures(full, { onTap: () => this._toggleFull() });
    if (!this._fsBound) {
      this._fsBound = true;
      this.addEventListener("fullscreenchange", () => this._fullIcon(document.fullscreenElement === this));
    }
    this._open();
  }

  _toggleFull() {
    haptic("light");
    // real full screen where the browser allows it (Android, desktop, iPad); a covering layer otherwise (iPhone)
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else if (this.classList.contains("full")) this._setFull(false);
    else if (this.requestFullscreen && document.fullscreenEnabled) this.requestFullscreen().catch(() => this._setFull(true));
    else this._setFull(true);
  }

  _setFull(on) {
    this.classList.toggle("full", on);
    this._fullIcon(on);
  }

  _fullIcon(on) {
    const b = this.shadowRoot.querySelector("[data-full]");
    if (!b) return;
    b.innerHTML = `<ha-icon icon="${on ? "mdi:fullscreen-exit" : "mdi:fullscreen"}"></ha-icon>`;
    b.title = this.s(on ? "exit" : "full");
    b.setAttribute("aria-label", b.title);
  }

  _message(key) {
    const m = this.shadowRoot.querySelector("[data-msg]");
    if (!m) return;
    m.hidden = !key;
    if (!key) return;
    m.innerHTML = `<span>${esc(this.s(key))}</span>${key === "loading" ? "" : `<button data-retry>${esc(this.s("retry"))}</button>`}`;
    const r = m.querySelector("[data-retry]");
    if (r) bindGestures(r, { onTap: () => { this._message("loading"); this._open(); } });
  }

  async _sup(endpoint, method, data) {
    return this._hass.callWS({ type: "supervisor/api", endpoint, method: method || "get", ...(data ? { data } : {}) });
  }

  async _session() {
    const r = await this._sup("/ingress/session", "post");
    this._ingress = r && r.session;
    if (!this._ingress) throw new Error("no session");
    document.cookie = `ingress_session=${this._ingress};path=/api/hassio_ingress/;SameSite=Strict${location.protocol === "https:" ? ";Secure" : ""}`;
  }

  _keepAlive() {
    clearInterval(this._keep);
    // HA keeps an ingress session alive by validating it every minute; a lapsed one gets replaced
    this._keep = setInterval(async () => {
      try {
        await this._sup("/ingress/validate_session", "post", { session: this._ingress });
      } catch (e) {
        try { await this._session(); } catch (e2) { /* next round */ }
      }
    }, 60000);
  }

  async _open() {
    const frame = this.shadowRoot.querySelector("iframe");
    if (!frame) return;
    try {
      const info = await this._sup(`/addons/${this._slug}/info`);
      if (!info || !info.ingress_url) throw new Error("no ingress");
      if (info.state && info.state !== "started") { this._message("stopped"); return; }
      await this._session();
      this._keepAlive();
      frame.onload = () => {
        this._paint();
        frame.classList.add("ready");
        this._message(null);
        // the app replaces its <head> styles while it starts; keep ours last
        try {
          const doc = frame.contentDocument;
          new MutationObserver(() => {
            const mine = doc.getElementById("ajn-ma-look");
            if (mine && mine !== doc.head.lastElementChild) doc.head.appendChild(mine);
          }).observe(doc.head, { childList: true });
        } catch (e) { /* not reachable: shown as it is */ }
      };
      frame.src = info.ingress_url;
    } catch (e) {
      this._message("failed");
    }
  }

  _paintSoon() {
    clearTimeout(this._paintTimer);
    // the dashboard repaints the card's own variables first
    this._paintTimer = setTimeout(() => this._paint(), 60);
  }

  _colours() {
    const cs = getComputedStyle(this);
    const card = this.shadowRoot.querySelector("ha-card");
    const read = (name, fb) => (cs.getPropertyValue(name) || "").trim() || fb;
    const probe = (prop, value) => {
      const el = document.createElement("i");
      el.style.cssText = `position:absolute;visibility:hidden;${prop}:${value}`;
      (card || this.shadowRoot).appendChild(el);
      const out = getComputedStyle(el)[prop === "color" ? "color" : "backgroundColor"];
      el.remove();
      return out;
    };
    const bgRaw = rgba(probe("background-color", `var(--primary-background-color, ${read("--primary-background-color", "#111")})`)) || [17, 17, 17, 1];
    const bg = over(bgRaw, lum(bgRaw) < 0.5 ? [0, 0, 0] : [255, 255, 255]);
    const surfRaw = rgba(probe("background-color", "var(--_surface)")) || [...bg, 1];
    return {
      bg,
      surface: over(surfRaw, bg),
      text: over(rgba(probe("color", "var(--_text)")) || [255, 255, 255, 1], bg),
      text2: over(rgba(probe("color", "var(--_text2)")) || [160, 160, 160, 1], bg),
      accent: over(rgba(probe("color", "var(--_accent)")) || [59, 156, 255, 1], bg),
      border: over(rgba(probe("color", "var(--_border)")) || [80, 80, 80, 0.3], over(surfRaw, bg)),
    };
  }

  _paint() {
    const frame = this.shadowRoot && this.shadowRoot.querySelector("iframe");
    let doc;
    try { doc = frame && frame.contentDocument; } catch (e) { doc = null; }
    if (!doc || !doc.head) return;
    let style = doc.getElementById("ajn-ma-look");
    if (!style) {
      style = doc.createElement("style");
      style.id = "ajn-ma-look";
    }
    style.textContent = musicAssistantCss(this._colours());
    doc.head.appendChild(style);
  }

  getCardSize() {
    return 12;
  }

  getGridOptions() {
    return { columns: "full", rows: "auto" };
  }
}
