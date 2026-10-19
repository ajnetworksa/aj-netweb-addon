// custom:ajnetweb-doorbell-card - invisible watcher; when someone rings, a full-screen popup with the
// door camera and "Open" buttons appears on every screen that has the dashboard open (wall panels too).
//   entity: sensor.ajnetweb_doorbell   (published by the Intercom add-on, see ajnetweb_intercom/doorbell.py)
//   camera: camera.gate                optional: overrides the camera the add-on suggests
//   sound: true                        short chime when the popup opens
// The sensor says "ringing" for about a minute after a ring; its attributes carry the doors (with the
// input_button helper that opens each one), the snapshot and the camera. "Open" presses that helper,
// which any HA user may do; the add-on then opens the door. The strategy adds this card to every view
// for the people the kiosk rule `doorbell` allows (default: everyone).
import { AjnBase, esc, haptic } from "../core/base.js";
import { translate, langOf } from "../core/i18n.js";
import { TOKENS, COLORS } from "../core/styles.js";
import { THEME_VARS } from "./sheet.js";

const SEEN = "ajn-doorbell-seen";

export class AjnetwebDoorbellCard extends AjnBase {
  static getStubConfig() {
    return { entity: "sensor.ajnetweb_doorbell" };
  }

  _entity() {
    return this._config.entity || "sensor.ajnetweb_doorbell";
  }

  watched() {
    return [this._entity()];
  }

  render() {
    this.style.display = "none";
    this.shadowRoot.innerHTML = "";
    const st = this.st(this._entity());
    const popup = document.querySelector("ajnetweb-doorbell-popup");
    if (!st || st.state !== "ringing") {
      if (popup) popup.close();
      return;
    }
    const rang = st.attributes.rang_at || st.last_changed;
    const age = (Date.now() - Date.parse(rang)) / 1000;
    if (!(age < (Number(st.attributes.show_seconds) || 60))) return;
    let seen = null;
    try { seen = sessionStorage.getItem(SEEN); } catch (e) { seen = null; }
    if (seen === rang) {   // already shown (or dismissed) on this screen; just keep it fresh
      if (popup) popup.update(this._hass);
      return;
    }
    try { sessionStorage.setItem(SEEN, rang); } catch (e) { /* private mode */ }
    if (popup) popup.remove();
    const el = document.createElement("ajnetweb-doorbell-popup");
    document.body.appendChild(el);
    el.open(this, this._hass, this._config, rang);
  }

  getCardSize() {
    return 0;
  }

  getGridOptions() {
    return { columns: "full", rows: "auto" };
  }
}

class AjnetwebDoorbellPopup extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  open(origin, hass, config, rang) {
    this._origin = origin;
    this._hass = hass;
    this._config = config;
    this._rang = rang;
    this._armed = null;
    this._opened = {};
    const cs = getComputedStyle(origin);
    THEME_VARS.forEach((v) => { const val = cs.getPropertyValue(v); if (val) this.style.setProperty(v, val.trim()); });
    this._render();
    requestAnimationFrame(() => this.classList.add("show"));
    this._onKey = (e) => { if (e.key === "Escape") this.close(); };
    window.addEventListener("keydown", this._onKey);
    // wall tablets: wake the screen (Fully Kiosk Browser), buzz phones, play a short chime
    try { if (window.fully && window.fully.turnScreenOn) window.fully.turnScreenOn(); } catch (e) { /* not Fully */ }
    haptic("heavy");
    if (config.sound !== false) chime();
    this._timer = setInterval(() => this._refreshPicture(), 1000);
  }

  update(hass) {
    this._hass = hass;
  }

  close() {
    clearInterval(this._timer);
    window.removeEventListener("keydown", this._onKey);
    this.classList.remove("show");
    setTimeout(() => this.remove(), 260);
  }

  _t(key, vars) {
    return translate(langOf(this._hass, this._config.language), key, undefined, vars);
  }

  _state() {
    return this._hass.states[this._config.entity || "sensor.ajnetweb_doorbell"];
  }

  _camera() {
    const a = (this._state() || {}).attributes || {};
    const id = this._config.camera || a.camera;
    return id && this._hass.states[id] ? id : null;
  }

  // live MJPEG from HA's camera proxy (works for every camera, same signed token as the snapshot);
  // falls back to the snapshot the add-on saved at the ring
  _liveUrl() {
    const cam = this._camera();
    const pic = cam && this._hass.states[cam].attributes.entity_picture;
    if (!pic || pic.startsWith("data:")) return null;
    return pic.replace("/api/camera_proxy/", "/api/camera_proxy_stream/");
  }

  _snapshotUrl() {
    const a = (this._state() || {}).attributes || {};
    const cam = this._camera();
    const pic = cam && this._hass.states[cam].attributes.entity_picture;
    if (pic) return `${pic}${pic.includes("?") ? "&" : "?"}t=${Date.now()}`;
    return a.snapshot || null;
  }

  _refreshPicture() {
    const st = this._state();
    if (!st || st.state !== "ringing") return this.close();
    const img = this.shadowRoot.querySelector("img.snap");
    if (img && this._live === false) {
      const url = this._snapshotUrl();
      if (url) img.src = url;
    }
  }

  _render() {
    const a = (this._state() || {}).attributes || {};
    const doors = Array.isArray(a.doors) ? a.doors.filter((d) => d && d.button && this._hass.states[d.button]) : [];
    const where = (doors[0] && doors[0].name) || a.station || this._t("door_station");
    const lang = langOf(this._hass, this._config.language);
    this.dir = lang === "ar" ? "rtl" : "ltr";
    const live = this._liveUrl();
    this._live = !!live;
    const first = live || this._snapshotUrl();
    let time = "";
    try { time = new Date(this._rang).toLocaleTimeString(langOf(this._hass, this._config.language), { hour: "numeric", minute: "2-digit" }); } catch (e) { time = ""; }
    this.shadowRoot.innerHTML = `
      <style>
        ${TOKENS}
        :host { position: fixed; inset: 0; z-index: 9; display: grid; place-items: center; padding: 16px; box-sizing: border-box; }
        .scrim { position: absolute; inset: 0; background: rgba(0,0,0,.72); opacity: 0; transition: opacity .25s var(--_ease);
                 -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px); }
        :host(.show) .scrim { opacity: 1; }
        .box { position: relative; width: min(760px, 100%); max-height: 100%; overflow: auto; border-radius: 28px;
               background: var(--ajn-sheet-bg, var(--primary-background-color, #111)); color: var(--_text);
               box-shadow: 0 20px 60px rgba(0,0,0,.5); transform: translateY(16px) scale(.98); opacity: 0;
               transition: transform .3s var(--_ease), opacity .25s var(--_ease); }
        :host(.show) .box { transform: none; opacity: 1; }
        .head { display: flex; align-items: center; gap: 14px; padding: 18px 20px 14px; }
        .bell { width: 48px; height: 48px; border-radius: 50%; display: grid; place-items: center; flex: none;
                background: rgba(${COLORS.green}, .18); color: rgb(${COLORS.green}); animation: ring 1.2s ease-in-out infinite; }
        .bell ha-icon { --mdc-icon-size: 26px; }
        @keyframes ring { 0%, 100% { box-shadow: 0 0 0 0 rgba(${COLORS.green}, .45); } 60% { box-shadow: 0 0 0 14px rgba(${COLORS.green}, 0); } }
        h2 { margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -.01em; }
        .sub { font-size: 13px; color: var(--_text2); margin-top: 2px; }
        .x { margin-inline-start: auto; width: 44px; height: 44px; border-radius: 50%; border: none; background: var(--_muted);
             color: var(--_text); display: grid; place-items: center; cursor: pointer; padding: 0; flex: none; }
        .pic { position: relative; margin: 0 14px; aspect-ratio: 16 / 9; border-radius: 20px; overflow: hidden;
               background: linear-gradient(145deg, #1d2a44, #0f141d); display: grid; place-items: center; }
        .pic img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0; transition: opacity .2s; }
        .pic img.ok { opacity: 1; }
        .pic .none { color: rgba(255,255,255,.6); display: grid; gap: 6px; place-items: center; font-size: 13px; }
        .pic .none ha-icon { --mdc-icon-size: 40px; }
        .live { position: absolute; top: 12px; inset-inline-start: 12px; display: inline-flex; align-items: center; gap: 6px;
                padding: 4px 10px; border-radius: 999px; background: rgba(0,0,0,.55); color: #fff; font-size: 12px; font-weight: 700; }
        .live i { width: 8px; height: 8px; border-radius: 50%; background: rgb(${COLORS.red}); }
        .acts { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; padding: 14px; }
        .btn { display: inline-flex; align-items: center; justify-content: center; gap: 10px; min-height: 64px; border-radius: 18px;
               border: none; font: inherit; font-size: 17px; font-weight: 700; cursor: pointer; padding: 0 18px; }
        .btn ha-icon { --mdc-icon-size: 24px; }
        .open { background: rgb(${COLORS.green}); color: #fff; box-shadow: 0 8px 22px rgba(${COLORS.green}, .35); }
        .open.armed { background: rgb(${COLORS.orange}); box-shadow: 0 8px 22px rgba(${COLORS.orange}, .35); }
        .open.done { background: var(--_muted); color: var(--_text); box-shadow: none; }
        .dismiss { background: var(--_muted); color: var(--_text); }
        .note { padding: 0 20px 16px; font-size: 13px; color: var(--_text2); }
      </style>
      <div class="scrim"></div>
      <div class="box" role="alertdialog" aria-modal="true" aria-label="${esc(this._t("someone_at", { door: where }))}">
        <div class="head">
          <div class="bell"><ha-icon icon="mdi:doorbell-video"></ha-icon></div>
          <div><h2>${esc(this._t("someone_at", { door: where }))}</h2><div class="sub">${esc(time)}</div></div>
          <button class="x" aria-label="${esc(this._t("close"))}"><ha-icon icon="mdi:close"></ha-icon></button>
        </div>
        <div class="pic">
          <div class="none"><ha-icon icon="mdi:cctv-off"></ha-icon>${esc(this._t("no_picture"))}</div>
          ${first ? `<img class="${live ? "stream" : "snap"}" src="${esc(first)}" alt="">` : ""}
          ${live ? `<span class="live"><i></i>${esc(this._t("live"))}</span>` : ""}
        </div>
        <div class="acts">
          ${doors.map((d, i) => `<button class="btn open" data-i="${i}"><ha-icon icon="mdi:door-open"></ha-icon><span>${esc(this._t("open_door", { door: d.name }))}</span></button>`).join("")}
          <button class="btn dismiss"><ha-icon icon="mdi:bell-off-outline"></ha-icon>${esc(this._t("dismiss"))}</button>
        </div>
        ${doors.length ? "" : `<div class="note">${esc(this._t("doorbell_no_open"))}</div>`}
      </div>`;
    const sr = this.shadowRoot;
    // a stream that can't play (camera asleep, proxy error) becomes a refreshing snapshot
    // the picture fades in once it loads; a stream that can't play (camera asleep, proxy error) becomes a
    // snapshot refreshed every second, and while nothing loads the "No picture" placeholder stays visible
    const img = sr.querySelector(".pic img");
    if (img) {
      img.onload = () => img.classList.add("ok");
      img.onerror = () => {
        img.classList.remove("ok");
        if (this._live) { this._live = false; img.className = "snap"; sr.querySelector(".live")?.remove(); }
      };
    }
    sr.querySelector(".x").addEventListener("click", () => this.close());
    sr.querySelector(".dismiss").addEventListener("click", () => this.close());
    sr.querySelector(".scrim").addEventListener("click", () => this.close());
    sr.querySelectorAll(".open").forEach((b) => b.addEventListener("click", () => this._openDoor(b, doors[+b.dataset.i])));
  }

  // tap once to arm ("Tap again to open"), again within 4 s to open - no gate opens by a brush of the hand
  async _openDoor(btn, door) {
    if (!door || this._opened[door.button]) return;
    const label = btn.querySelector("span");
    if (this._armed !== door.button) {
      this._armed = door.button;
      haptic("light");
      btn.classList.add("armed");
      label.textContent = this._t("tap_again_open");
      clearTimeout(this._armTimer);
      this._armTimer = setTimeout(() => {
        this._armed = null;
        btn.classList.remove("armed");
        label.textContent = this._t("open_door", { door: door.name });
      }, 4000);
      return;
    }
    clearTimeout(this._armTimer);
    this._armed = null;
    haptic("heavy");
    try {
      await this._hass.callService("input_button", "press", { entity_id: door.button });
      this._opened[door.button] = true;
      btn.classList.remove("armed");
      btn.classList.add("done");
      btn.querySelector("ha-icon").setAttribute("icon", "mdi:check");
      label.textContent = this._t("door_opening", { door: door.name });
      setTimeout(() => this.close(), 4000);
    } catch (e) {
      btn.classList.remove("armed");
      label.textContent = this._t("failed");
    }
  }
}

function chime() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [[880, 0], [660, 0.28]].forEach(([f, at]) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      o.type = "sine";
      g.gain.setValueAtTime(0.0001, ctx.currentTime + at);
      g.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.6);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + at);
      o.stop(ctx.currentTime + at + 0.65);
    });
    setTimeout(() => ctx.close(), 1500);
  } catch (e) { /* browsers may block sound until the screen was touched once */ }
}

if (!customElements.get("ajnetweb-doorbell-popup")) customElements.define("ajnetweb-doorbell-popup", AjnetwebDoorbellPopup);
