// Room sheet: a bottom sheet (phones) / centred panel (tablets) with every device of a room.
// It is appended to <body>, so events that HA must handle (more-info, notifications) are
// re-dispatched from the card that opened it, which lives inside HA's DOM tree.
import { esc, fire, haptic, callService } from "../core/base.js";
import { translate, langOf } from "../core/i18n.js";
import { TOKENS, roomGradient } from "../core/styles.js";

const SECTIONS = [
  ["access", "access", "mdi:shield-key", "square"],
  ["lights", "lights", "mdi:lightbulb-group", "square"],
  ["climates", "climate", "mdi:thermostat", "wide"],
  ["fans", "fans", "mdi:fan", "square"],
  ["covers", "covers", "mdi:curtains", "square"],
  ["media", "media", "mdi:speaker", "wide"],
  ["switches", "switches", "mdi:power-socket-uk", "square"],
  ["vacuums", "switches", "mdi:robot-vacuum", "square"],
  ["valves", "switches", "mdi:valve", "square"],
  ["cameras", "cameras", "mdi:cctv", "camera"],
  ["sensors", "sensors", "mdi:gauge", "square"],
];
const THEME_VARS = [
  "--primary-color", "--accent-color", "--primary-background-color", "--secondary-background-color",
  "--primary-text-color", "--secondary-text-color", "--rgb-primary-text-color", "--divider-color",
  "--card-background-color", "--ha-card-background", "--ha-card-border-color", "--ha-card-border-radius",
  "--ha-card-box-shadow", "--state-icon-color", "--ajn-accent", "--ajn-surface", "--ajn-surface-on",
  "--ajn-text-on", "--ajn-border", "--ajn-radius", "--ajn-glass-blur", "--ajn-shadow", "--ajn-glow",
  "--ajn-sheet-bg", "--ajn-font", "--ajn-tile-height",
];
const SENSOR_GROUPS = ["temperature", "humidity", "air", "power", "openings", "motion", "safety"];

class AjnetwebRoomSheet extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._cards = [];
  }

  open(room, origin, hass) {
    this._openedAt = Date.now();
    this._room = room;
    this._origin = origin;
    this._hass = hass;
    this._inheritTheme(origin);
    this._render();
    requestAnimationFrame(() => this.classList.add("show"));
    this._pushed = false;
    try {
      window.history.pushState({ ajnSheet: true }, "", `${location.pathname}${location.search}#ajn-${room.id}`);
      this._pushed = true;
    } catch (e) { /* ignore */ }
    this._hash = `#ajn-${room.id}`;
    // Only a real "back" (our hash gone) closes the sheet; WebViews can fire stray popstate events
    this._onPop = () => { if (location.hash !== this._hash) this.close(true); };
    window.addEventListener("popstate", this._onPop);
    this._onKey = (e) => { if (e.key === "Escape") this.close(); };
    window.addEventListener("keydown", this._onKey);
    document.documentElement.style.overflow = "hidden";
  }

  // A view-level theme only applies inside the view; copy its variables onto the sheet
  _inheritTheme(origin) {
    const cs = getComputedStyle(origin);
    THEME_VARS.forEach((v) => {
      const val = cs.getPropertyValue(v);
      if (val) this.style.setProperty(v, val.trim());
    });
  }

  close(fromHistory = false) {
    window.removeEventListener("popstate", this._onPop);
    window.removeEventListener("keydown", this._onKey);
    document.documentElement.style.overflow = "";
    if (this._pushed && !fromHistory) {
      this._pushed = false;
      window.history.back();
    }
    this.classList.remove("show");
    setTimeout(() => this.remove(), 280);
  }

  set hass(hass) {
    this._hass = hass;
    this._cards.forEach((c) => (c.hass = hass));
    this._renderMeta();
  }

  _t(key, n) {
    return translate(langOf(this._hass, this._room && this._room.language), key, n);
  }

  _renderMeta() {
    const meta = this.shadowRoot.querySelector(".meta");
    if (!meta || !this._hass) return;
    const r = this._room;
    const vals = [];
    const t = r.temperature && this._hass.states[r.temperature];
    const h = r.humidity && this._hass.states[r.humidity];
    if (t && !isNaN(parseFloat(t.state))) vals.push(`${Math.round(parseFloat(t.state) * 10) / 10}${t.attributes.unit_of_measurement || "°"}`);
    if (h && !isNaN(parseFloat(h.state))) vals.push(`${Math.round(parseFloat(h.state))}%`);
    const lights = (r.entities.lights || []).filter((id) => this._hass.states[id] && this._hass.states[id].state === "on").length;
    if (lights) vals.push(`${lights} ${this._t("lights_on", lights)}`);
    meta.textContent = vals.join(" · ");
    const btn = this.shadowRoot.querySelector(".alloff");
    if (btn) btn.classList.toggle("on", lights > 0);
  }

  _render() {
    const r = this._room;
    const ents = r.entities;
    const groups = SECTIONS.map(([key, label, icon, layout]) => {
      let ids = key === "sensors" ? SENSOR_GROUPS.flatMap((g) => ents[g] || []) : ents[key] || [];
      return { key, label, icon, layout, ids };
    }).filter((g) => g.ids.length);
    const scenes = [...(ents.scenes || []), ...(ents.scripts || [])];
    const bg = r.picture ? `url("${r.picture}") center/cover` : roomGradient(`${r.name} ${r.icon}`);

    this.shadowRoot.innerHTML = `
      <style>
        ${TOKENS}
        :host { position: fixed; inset: 0; z-index: 7; display: block; pointer-events: none; }
        .scrim { position: absolute; inset: 0; background: rgba(0,0,0,.42); opacity: 0; transition: opacity .28s var(--_ease);
                 -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); pointer-events: auto; }
        :host(.show) .scrim { opacity: 1; }
        .panel { position: absolute; left: 0; right: 0; bottom: 0; max-height: 90vh; display: flex; flex-direction: column;
                 background: var(--ajn-sheet-bg, var(--primary-background-color, #111)); color: var(--_text);
                 border-radius: 28px 28px 0 0; transform: translateY(100%); transition: transform .32s var(--_ease);
                 box-shadow: 0 -10px 40px rgba(0,0,0,.35); pointer-events: auto; overflow: hidden;
                 padding-bottom: env(safe-area-inset-bottom); }
        :host(.show) .panel { transform: none; }
        @media (min-width: 768px) {
          .panel { left: 50%; right: auto; bottom: auto; top: 50%; width: min(820px, 92vw); max-height: 86vh;
                   border-radius: 28px; transform: translate(-50%, -46%) scale(.97); opacity: 0;
                   transition: transform .3s var(--_ease), opacity .25s var(--_ease); }
          :host(.show) .panel { transform: translate(-50%, -50%); opacity: 1; }
          .handle { display: none; }
        }
        .hero { position: relative; padding: 14px 18px 18px; background: ${bg}; color: #fff; flex: none; touch-action: none; }
        .hero::after { content: ""; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0,0,0,.15), rgba(0,0,0,.55)); }
        .hero > * { position: relative; z-index: 1; }
        .handle { width: 40px; height: 5px; border-radius: 3px; background: rgba(255,255,255,.6); margin: 0 auto 10px; }
        .row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
        h2 { margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -.02em; }
        .meta { font-size: 14px; opacity: .85; margin-top: 2px; min-height: 18px; }
        .icbtn { width: 40px; height: 40px; border-radius: 50%; border: none; display: grid; place-items: center;
                 background: rgba(255,255,255,.18); color: #fff; cursor: pointer; padding: 0;
                 -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px); }
        .icbtn.on { background: rgb(255,176,32); color: #1d1300; }
        .actions { display: flex; gap: 8px; }
        .content { overflow-y: auto; padding: 8px 14px 22px; -webkit-overflow-scrolling: touch; }
        .sec { margin-top: 14px; }
        .sec h3 { display: flex; align-items: center; gap: 6px; margin: 0 4px 8px; font-size: 13px; font-weight: 600;
                  color: var(--_text2); text-transform: uppercase; letter-spacing: .06em; }
        .sec h3 ha-icon { --mdc-icon-size: 16px; }
        .grid { display: grid; gap: 10px; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); }
        .grid.wide, .grid.camera { grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); }
        .chips { display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none; padding: 2px 2px 4px; }
        .chips::-webkit-scrollbar { display: none; }
        .chip { flex: none; display: inline-flex; align-items: center; gap: 8px; padding: 10px 16px; border-radius: 999px;
                border: 1px solid var(--_border); background: var(--_surface); color: var(--_text); font: inherit;
                font-size: 14px; font-weight: 600; cursor: pointer; }
        .chip ha-icon { --mdc-icon-size: 18px; color: var(--_accent); }
        .chip:active { transform: scale(.97); }
        .empty { padding: 30px 10px; text-align: center; color: var(--_text2); }
      </style>
      <div class="scrim"></div>
      <div class="panel" role="dialog" aria-modal="true" aria-label="${esc(r.name)}">
        <div class="hero">
          <div class="handle"></div>
          <div class="row">
            <div><h2>${esc(r.name)}</h2><div class="meta"></div></div>
            <div class="actions">
              ${(ents.lights || []).length ? `<button class="icbtn alloff" title="${esc(this._t("all_lights_off"))}"><ha-icon icon="mdi:lightbulb-group"></ha-icon></button>` : ""}
              <button class="icbtn close" aria-label="Close"><ha-icon icon="mdi:close"></ha-icon></button>
            </div>
          </div>
        </div>
        <div class="content">
          ${scenes.length ? `<div class="sec"><div class="chips">${scenes.map((id) => {
            const st = this._hass.states[id];
            const nm = (st && st.attributes.friendly_name) || id;
            return `<button class="chip" data-scene="${esc(id)}"><ha-icon icon="${esc((st && st.attributes.icon) || (id.startsWith("script.") ? "mdi:script-text-play" : "mdi:palette"))}"></ha-icon>${esc(shorten(nm, r.name))}</button>`;
          }).join("")}</div></div>` : ""}
          ${groups.map((g) => `<div class="sec"><h3><ha-icon icon="${g.icon}"></ha-icon>${esc(this._t(g.label))}</h3>
            <div class="grid ${g.layout}" data-group="${g.key}"></div></div>`).join("")}
          ${!groups.length && !scenes.length ? `<div class="empty">${esc(this._t("nothing_here"))}</div>` : ""}
        </div>
      </div>`;

    this._cards = [];
    groups.forEach((g) => {
      const host = this.shadowRoot.querySelector(`[data-group="${g.key}"]`);
      g.ids.forEach((id) => {
        const el = document.createElement(g.layout === "camera" ? "ajnetweb-camera-card" : "ajnetweb-device-card");
        const st = this._hass.states[id];
        const cfg = { entity: id, name: st ? shorten(st.attributes.friendly_name || id, r.name) : id };
        if (g.layout === "wide") cfg.layout = "wide";
        if (g.key === "access") cfg.access = true;
        if (r.language) cfg.language = r.language;
        el.setConfig(cfg);
        el.hass = this._hass;
        host.appendChild(el);
        this._cards.push(el);
      });
    });
    this._renderMeta();

    const sr = this.shadowRoot;
    // Close on the backdrop only when the whole tap happened there, and never right after opening
    const scrim = sr.querySelector(".scrim");
    let downOnScrim = false;
    scrim.addEventListener("pointerdown", () => { downOnScrim = Date.now() - this._openedAt > 400; });
    scrim.addEventListener("click", () => {
      if (downOnScrim && Date.now() - this._openedAt > 400) this.close();
      downOnScrim = false;
    });
    sr.querySelector(".close").addEventListener("click", () => this.close());
    const off = sr.querySelector(".alloff");
    if (off) off.addEventListener("click", () => {
      haptic("light");
      const on = (ents.lights || []).filter((id) => this._hass.states[id] && this._hass.states[id].state === "on");
      callService(this._hass, on.length ? "homeassistant.turn_off" : "homeassistant.turn_on", on.length ? on : ents.lights);
    });
    sr.querySelectorAll("[data-scene]").forEach((b) => b.addEventListener("click", () => {
      haptic("light");
      const id = b.dataset.scene;
      callService(this._hass, `${id.split(".")[0]}.turn_on`, [id]);
    }));
    // Events HA must see are re-sent from the card that opened the sheet
    sr.addEventListener("hass-more-info", (e) => {
      e.stopPropagation();
      const entityId = e.detail && e.detail.entityId;
      this.close();
      setTimeout(() => fire(this._origin, "hass-more-info", { entityId }), 300);
    });
    sr.addEventListener("hass-notification", (e) => { e.stopPropagation(); fire(this._origin, "hass-notification", e.detail); });
    // swipe down on the photo header closes on phones
    const hero = sr.querySelector(".hero");
    const panel = sr.querySelector(".panel");
    let y0 = null;
    hero.addEventListener("pointerdown", (e) => { if (window.innerWidth < 768) { y0 = e.clientY; hero.setPointerCapture(e.pointerId); } });
    hero.addEventListener("pointermove", (e) => {
      if (y0 == null) return;
      const dy = Math.max(0, e.clientY - y0);
      panel.style.transition = "none";
      panel.style.transform = `translateY(${dy}px)`;
    });
    const up = (e) => {
      if (y0 == null) return;
      const dy = e.clientY - y0;
      y0 = null;
      panel.style.transition = "";
      panel.style.transform = "";
      if (dy > 110) this.close();
    };
    hero.addEventListener("pointerup", up);
    hero.addEventListener("pointercancel", up);
  }
}

function shorten(name, room) {
  if (name && room && name.toLowerCase().startsWith(room.toLowerCase())) {
    const rest = name.slice(room.length).replace(/^[\s\-_:·]+/, "");
    if (rest) return rest[0].toUpperCase() + rest.slice(1);
  }
  return name;
}

if (!customElements.get("ajnetweb-room-sheet")) customElements.define("ajnetweb-room-sheet", AjnetwebRoomSheet);

export function openRoomSheet(room, origin, hass) {
  document.querySelectorAll("ajnetweb-room-sheet").forEach((s) => s.remove());
  const sheet = document.createElement("ajnetweb-room-sheet");
  document.body.appendChild(sheet);
  sheet.open(room, origin, hass);
  return sheet;
}
