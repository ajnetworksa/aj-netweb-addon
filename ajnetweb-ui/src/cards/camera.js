// custom:ajnetweb-camera-card - clean camera tile. Shows the camera's signed snapshot URL
// (entity_picture) refreshed every few seconds; tap opens HA's live stream dialog.
import { AjnBase, OFFLINE, bindGestures, esc } from "../core/base.js";
import { niceName } from "../core/model.js";
import { COLORS } from "../core/styles.js";

export class AjnetwebCameraCard extends AjnBase {
  static getStubConfig(hass) {
    return { entity: Object.keys(hass.states).find((e) => e.startsWith("camera.")) || "camera.front_door" };
  }

  validate(config) {
    if (!config.entity) throw new Error("ajnetweb-camera-card: 'entity' is required");
  }

  watched() {
    return [this._config.entity];
  }

  connectedCallback() {
    const every = Math.max(2, Number(this._config && this._config.refresh) || 8) * 1000;
    this._timer = setInterval(() => this._refresh(), every);
    this._visible = !document.hidden;
    this._vis = () => (this._visible = !document.hidden);
    document.addEventListener("visibilitychange", this._vis);
  }

  disconnectedCallback() {
    clearInterval(this._timer);
    document.removeEventListener("visibilitychange", this._vis);
  }

  _url() {
    const st = this.st(this._config.entity);
    const pic = st && st.attributes.entity_picture;
    if (!pic) return null;
    if (pic.startsWith("data:")) return pic;
    return `${pic}${pic.includes("?") ? "&" : "?"}t=${Math.floor(Date.now() / 2000)}`;
  }

  _refresh() {
    if (!this._visible) return;
    const img = this.shadowRoot && this.shadowRoot.querySelector("img.next");
    const url = this._url();
    if (!img || !url) return;
    img.onload = () => {
      const cur = this.shadowRoot.querySelector("img.cur");
      if (cur) cur.src = img.src;
      const card = this.shadowRoot.querySelector("ha-card");
      if (card) card.classList.remove("broken");
    };
    img.src = url;
  }

  css() {
    return `
      ha-card { position: relative; aspect-ratio: 16 / 9; background: #0b0d12; border: none; }
      img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
      img.next { opacity: 0; pointer-events: none; }
      .shade { position: absolute; inset: auto 0 0 0; height: 55%; background: linear-gradient(180deg, transparent, rgba(0,0,0,.6)); }
      .label { position: absolute; left: 12px; bottom: 10px; right: 12px; display: flex; align-items: center; gap: 8px;
               color: #fff; font-size: 14px; font-weight: 600; text-shadow: 0 1px 6px rgba(0,0,0,.4); }
      .dot { width: 8px; height: 8px; border-radius: 50%; background: rgb(${COLORS.red}); box-shadow: 0 0 8px rgb(${COLORS.red});
             animation: blink 2s infinite; }
      .offline .dot { background: rgb(${COLORS.grey}); box-shadow: none; animation: none; }
      @keyframes blink { 50% { opacity: .35; } }
      .empty { position: absolute; inset: 0; display: grid; place-items: center; align-content: center; gap: 6px;
               color: rgba(255,255,255,.55); font-size: 12px; font-weight: 600;
               background: radial-gradient(120% 90% at 50% 0%, #1d2532 0%, #0b0d12 70%); }
      .empty ha-icon { --mdc-icon-size: 34px; }
      ha-card.broken img { display: none; }
      ha-card:not(.broken) .empty.fallback { display: none; }
      .state { margin-inline-start: auto; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 999px;
               background: rgba(0,0,0,.45); letter-spacing: .02em; }
    `;
  }

  render() {
    const c = this._config;
    const st = this.st(c.entity);
    const offline = !st || OFFLINE.includes(st.state);
    const url = this._url();
    const name = c.name || niceName((st && st.attributes.friendly_name) || c.entity.split(".")[1]);
    const noPic = `<div class="empty ${url ? "fallback" : ""}"><ha-icon icon="mdi:cctv-off"></ha-icon>${esc(offline ? this.t("offline") : this.t("no_picture"))}</div>`;
    this.html(`
      <ha-card class="tap ${offline ? "offline" : ""}" tabindex="0" role="button" aria-label="${esc(name)}">
        ${url ? `<img class="cur" src="${esc(url)}" alt=""><img class="next" alt="">` : ""}${noPic}
        <div class="shade"></div>
        <div class="label"><span class="dot"></span>${esc(name)}${offline ? `<span class="state">${esc(this.t("offline"))}</span>` : ""}</div>
      </ha-card>`);
    const card = this.shadowRoot.querySelector("ha-card");
    // snapshot can't be loaded (camera asleep, stream-only, proxy error): show a clean placeholder, keep retrying
    const cur = this.shadowRoot.querySelector("img.cur");
    if (cur) {
      cur.onerror = () => card.classList.add("broken");
      cur.onload = () => card.classList.remove("broken");
    }
    bindGestures(card, { onTap: () => this.moreInfo(c.entity) });
  }

  getCardSize() {
    return 3;
  }

  getGridOptions() {
    return { columns: 12, min_columns: 6, rows: "auto" };
  }
}
