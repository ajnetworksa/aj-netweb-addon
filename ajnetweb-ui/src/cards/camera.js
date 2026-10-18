// custom:ajnetweb-camera-card - clean camera tile. Shows the camera's signed snapshot URL
// (entity_picture) refreshed every few seconds; tap opens HA's live stream dialog.
//   controls: [entity ids]  gate / garage / lock buttons on the picture (tap twice to act), e.g. the
//                           access devices of the same area - open the gate while watching the camera
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
    return [this._config.entity, ...(this._config.controls || [])];
  }

  _act(id) {
    const st = this.st(id);
    if (!st) return;
    const d = id.split(".")[0];
    if (d === "lock") return this.call(st.state === "locked" ? "lock.unlock" : "lock.lock", [id]);
    if (d === "cover") return this.call("cover.toggle", [id]);
    if (d === "button" || d === "input_button") return this.call(`${d}.press`, [id]);
    return this.call(`${d}.turn_on`, [id]);   // gate / door strike relays pulse on
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
      .ctl { position: absolute; top: 10px; inset-inline-end: 10px; display: flex; gap: 6px; z-index: 1; }
      .cb { display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 12px 0 9px; border-radius: 999px; border: none;
            font: inherit; font-size: 12px; font-weight: 600; color: #fff; background: rgba(0,0,0,.45); cursor: pointer;
            -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px); }
      .cb ha-icon { --mdc-icon-size: 16px; }
      .cb.armed { background: rgb(${COLORS.orange}); }
      .cb.on { background: rgba(${COLORS.green}, .85); }
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
        ${(c.controls || []).length ? `<div class="ctl">${c.controls.map((id) => this.st(id)).filter(Boolean).slice(0, 2).map((s) => {
          const d = s.entity_id.split(".")[0];
          const on = ["open", "opening", "unlocked", "on"].includes(s.state);
          const icon = d === "lock" ? (s.state === "locked" ? "mdi:lock" : "mdi:lock-open-variant") : d === "cover" ? (on ? "mdi:garage-open" : "mdi:garage") : "mdi:gate";
          let nm = niceName(s.attributes.friendly_name || s.entity_id);
          if (nm.toLowerCase().startsWith(name.toLowerCase() + " ")) nm = nm.slice(name.length + 1);
          return `<button class="cb ${on ? "on" : ""}" data-ctl="${esc(s.entity_id)}"><ha-icon icon="${icon}"></ha-icon>${esc(nm)}</button>`;
        }).join("")}</div>` : ""}
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
    this.shadowRoot.querySelectorAll(".cb").forEach((b) => {
      b.addEventListener("pointerdown", (e) => e.stopPropagation());
      b.addEventListener("pointerup", (e) => e.stopPropagation());
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        // tap twice within 3 s: gates and doors must never open from a stray touch
        if (!b.classList.contains("armed")) {
          b.classList.add("armed");
          b.dataset.label = b.lastChild.textContent;
          b.lastChild.textContent = this.t("confirm");
          clearTimeout(this._armT);
          this._armT = setTimeout(() => { b.classList.remove("armed"); b.lastChild.textContent = b.dataset.label; }, 3000);
          return;
        }
        clearTimeout(this._armT);
        b.classList.remove("armed");
        b.lastChild.textContent = b.dataset.label;
        this._act(b.dataset.ctl);
      });
    });
  }

  getCardSize() {
    return 3;
  }

  getGridOptions() {
    return { columns: 12, min_columns: 6, rows: "auto" };
  }
}
