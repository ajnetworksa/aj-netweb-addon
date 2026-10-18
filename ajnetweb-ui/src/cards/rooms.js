// custom:ajnetweb-rooms-card - all rooms in one block: floor tabs on top, an even grid of room cards below.
//   groups: [{ name, icon, rooms: [<area-card config>, ...] }]   (the strategy builds one group per floor)
//   style: tile | photo     room card style (see area.js)
//   min_width: 170          smallest room card width in px (the grid fits as many per row as possible)
// The chosen tab is remembered per browser. With one group the tabs are hidden.
import { AjnBase, bindGestures, esc, haptic } from "../core/base.js";

const STORE = "ajn-rooms-tab";

export class AjnetwebRoomsCard extends AjnBase {
  static getStubConfig(hass) {
    return { groups: [{ name: "Rooms", rooms: Object.keys(hass.areas || {}).slice(0, 4).map((area) => ({ area })) }] };
  }

  validate(config) {
    if (!Array.isArray(config.groups)) throw new Error("ajnetweb-rooms-card: 'groups' is required");
  }

  setConfig(config) {
    this._cards = null;
    super.setConfig(config);
  }

  set hass(hass) {
    super.hass = hass;
    (this._cards || []).forEach((c) => (c.hass = hass));
  }

  get hass() {
    return this._hass;
  }

  // re-render only when the language changes; the room cards update themselves
  watched() {
    return [];
  }

  _tab() {
    const groups = this._config.groups;
    let key = null;
    try { key = localStorage.getItem(`${STORE}:${location.pathname}`); } catch (e) { key = null; }
    const i = groups.findIndex((g) => g.name === key);
    return i >= 0 ? i : 0;
  }

  css() {
    return `
      ha-card { background: none; border: none; box-shadow: none; -webkit-backdrop-filter: none; backdrop-filter: none; overflow: visible; }
      .tabs { display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none; padding: 2px 2px 10px; }
      .tabs::-webkit-scrollbar { display: none; }
      .tab { flex: none; display: inline-flex; align-items: center; gap: 7px; height: 36px; padding: 0 14px 0 11px; border-radius: 999px;
             border: 1px solid var(--_border); background: var(--_surface); color: var(--_text); font: inherit; font-size: 13px;
             font-weight: 600; cursor: pointer; -webkit-backdrop-filter: blur(var(--_blur)); backdrop-filter: blur(var(--_blur)); }
      .tab ha-icon { --mdc-icon-size: 17px; color: var(--_text2); }
      .tab .n { font-size: 11px; color: var(--_text2); font-weight: 700; }
      .tab.sel { background: var(--_grad); color: #fff; border-color: transparent; box-shadow: 0 4px 14px var(--ajn-glow, rgba(0,0,0,.15)); }
      .tab.sel ha-icon, .tab.sel .n { color: #fff; }
      .grid { display: grid; gap: 8px; grid-template-columns: repeat(auto-fill, minmax(min(${Number(this._config.min_width) || 170}px, 100%), 1fr)); }
      @container (max-width: 420px) { .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    `;
  }

  render() {
    const groups = this._config.groups;
    const sel = Math.min(this._tab(), groups.length - 1);
    const group = groups[sel] || { rooms: [] };
    this.html(`
      <ha-card>
        ${groups.length > 1 ? `<div class="tabs" role="tablist">${groups.map((g, i) => `
          <button class="tab ${i === sel ? "sel" : ""}" role="tab" aria-selected="${i === sel}" data-i="${i}">
            ${g.icon ? `<ha-icon icon="${esc(g.icon)}"></ha-icon>` : ""}${esc(g.name)}<span class="n">${(g.rooms || []).length}</span></button>`).join("")}</div>` : ""}
        <div class="grid"></div>
      </ha-card>`);
    const grid = this.shadowRoot.querySelector(".grid");
    this._cards = (group.rooms || []).map((cfg) => {
      const el = document.createElement("ajnetweb-area-card");
      el.setConfig(Object.assign({ style: this._config.style || "tile" }, cfg, this._config.language ? { language: this._config.language } : {}));
      el.hass = this._hass;
      grid.appendChild(el);
      return el;
    });
    this.shadowRoot.querySelectorAll(".tab").forEach((b) => bindGestures(b, { onTap: () => {
      haptic("light");
      try { localStorage.setItem(`${STORE}:${location.pathname}`, groups[+b.dataset.i].name); } catch (e) { /* private mode */ }
      this.render();
    } }));
  }

  getCardSize() {
    return 6;
  }

  getGridOptions() {
    return { columns: "full", rows: "auto" };
  }
}
