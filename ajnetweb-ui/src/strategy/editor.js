// Graphical options editor shown in Dashboard settings for strategy dashboards.
// Plain inputs (no HA-internal form elements), so it keeps working across HA releases.
import { esc } from "../core/base.js";
import { PALETTES } from "../core/appearance.js";

const VIEW_KEYS = [["panel", "Wall panel"], ["lights", "Lights"], ["climate", "Climate"], ["security", "Security"],
                   ["cameras", "Cameras"], ["media", "Media"], ["installer", "Installer (admins)"]];

export class AjnetwebStrategyEditor extends HTMLElement {
  setConfig(config) {
    this._config = Object.assign({}, config);
    this._render();
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (first) this._render();
  }

  _emit() {
    this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: this._config }, bubbles: true, composed: true }));
  }

  _set(key, value) {
    const c = Object.assign({}, this._config);
    if (value === "" || value === undefined) delete c[key];
    else c[key] = value;
    this._config = c;
    this._emit();
  }

  _render() {
    if (!this._config) return;
    const c = this._config;
    const themes = Object.keys((this._hass && this._hass.themes && this._hass.themes.themes) || {}).sort();
    const views = c.views || {};
    this.innerHTML = `
      <style>
        .ajn-ed { display: grid; gap: 14px; padding: 4px 0; font-family: inherit; }
        .ajn-ed label { display: grid; gap: 4px; font-size: 13px; font-weight: 500; color: var(--primary-text-color); }
        .ajn-ed input[type=text], .ajn-ed select { font: inherit; padding: 10px 12px; border-radius: 8px;
          border: 1px solid var(--divider-color); background: var(--card-background-color); color: var(--primary-text-color); }
        .ajn-ed .checks { display: flex; flex-wrap: wrap; gap: 8px 18px; }
        .ajn-ed .checks label { display: flex; align-items: center; gap: 6px; font-weight: 400; }
        .ajn-ed h4 { margin: 6px 0 0; font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: var(--secondary-text-color); }
      </style>
      <div class="ajn-ed">
        <label>Title<input type="text" data-k="title" value="${esc(c.title || "")}"></label>
        <label>Theme
          <select data-k="theme"><option value="">Use the user's theme</option>
            ${themes.map((t) => `<option ${t === c.theme ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></label>
        <label>Language
          <select data-k="language"><option value="">Follow Home Assistant</option>
            <option value="en" ${c.language === "en" ? "selected" : ""}>English</option>
            <option value="ar" ${c.language === "ar" ? "selected" : ""}>العربية</option></select></label>
        <label>Tapping a room
          <select data-k="room_tap"><option value="popup">Opens a sheet with its devices</option>
            <option value="navigate" ${c.room_tap === "navigate" ? "selected" : ""}>Opens the room page</option></select></label>
        <label>Header image URL (optional)<input type="text" data-k="header_image" value="${esc(c.header_image || "")}"></label>
        <label>Colour gradient
          <select data-k="palette"><option value="">Theme colour</option>
            ${Object.entries(PALETTES).map(([k, p]) => `<option value="${k}" ${k === c.palette ? "selected" : ""}>${esc(p.en)}</option>`).join("")}</select></label>
        <h4>Views</h4>
        <div class="checks">
          ${VIEW_KEYS.map(([k, l]) => `<label><input type="checkbox" data-view="${k}" ${views[k] === false ? "" : "checked"}>${l}</label>`).join("")}
          <label><input type="checkbox" data-k="navbar" ${c.navbar === false ? "" : "checked"}>Bottom navigation bar</label>
          <label><input type="checkbox" data-k="personal" ${c.personal === false ? "" : "checked"}>Each person can choose theme &amp; colour</label>
          <label><input type="checkbox" data-k="wallpaper" data-default-off ${c.wallpaper ? "checked" : ""}>Colour as wallpaper</label>
        </div>
      </div>`;
    this.querySelectorAll("[data-k]").forEach((el) => {
      el.addEventListener("change", () => {
        if (el.type === "checkbox" && "defaultOff" in el.dataset) this._set(el.dataset.k, el.checked ? true : undefined);
        else if (el.type === "checkbox") this._set(el.dataset.k, el.checked ? undefined : false);
        else this._set(el.dataset.k, el.value.trim());
      });
    });
    this.querySelectorAll("[data-view]").forEach((el) => el.addEventListener("change", () => {
      const v = Object.assign({}, this._config.views || {});
      if (el.checked) delete v[el.dataset.view];
      else v[el.dataset.view] = false;
      this._set("views", Object.keys(v).length ? v : undefined);
    }));
  }
}
