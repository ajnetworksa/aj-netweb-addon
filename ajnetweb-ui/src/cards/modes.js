// custom:ajnetweb-modes-card - house modes (Home / Away / Night / Guests) as one row of chips.
//   entity: input_select.ajnetweb_house_mode (its options are the modes; the add-on creates it)
//   names: { away: "Out" }   icons: { away: "mdi:airplane" }   confirm: [away, night] (tap again)
// Tapping a mode selects it; the add-on's "AJ Netweb - House modes" automation then runs that mode's
// actions, so the dashboard, Alexa and automations all do the same thing. Hold = more info.
import { AjnBase, bindGestures, esc, haptic, OFFLINE } from "../core/base.js";
import { COLORS } from "../core/styles.js";

export const MODE_ENTITY = "input_select.ajnetweb_house_mode";
const ICONS = { home: "mdi:home", away: "mdi:home-export-outline", night: "mdi:weather-night", guests: "mdi:account-group" };
const TINT = { home: "green", away: "orange", night: "indigo", guests: "teal" };

export class AjnetwebModesCard extends AjnBase {
  static getStubConfig(hass) {
    return { entity: hass && hass.states[MODE_ENTITY] ? MODE_ENTITY
      : Object.keys((hass && hass.states) || {}).find((id) => id.startsWith("input_select.")) || MODE_ENTITY };
  }

  validate(config) {
    if (!config.entity) throw new Error("ajnetweb-modes-card: 'entity' (an input_select) is required");
  }

  watched() {
    return [this._config.entity];
  }

  _label(key) {
    const names = this._config.names || {};
    if (names[key]) return names[key];
    const t = this.t(`mode_${key}`);
    return t === `mode_${key}` ? key : t;
  }

  async _pick(btn, key) {
    const st = this.st(this._config.entity);
    if (!st || st.state === key) return;
    if ((this._config.confirm || []).includes(key) && btn.dataset.armed !== "1") {
      haptic("light");
      btn.dataset.armed = "1";
      btn.classList.add("armed");
      btn.querySelector(".lbl").textContent = this.t("confirm");
      clearTimeout(btn._t);
      btn._t = setTimeout(() => this._disarm(btn, key), 3500);
      return;
    }
    this._disarm(btn, key);
    haptic("medium");
    btn.classList.add("busy");
    try {
      await this.call("input_select.select_option", [this._config.entity], { option: key });
    } catch (e) { /* notified by call() */ } finally {
      btn.classList.remove("busy");
    }
  }

  _disarm(btn, key) {
    clearTimeout(btn._t);
    btn.dataset.armed = "";
    btn.classList.remove("armed");
    btn.querySelector(".lbl").textContent = this._label(key);
  }

  css() {
    return `
      ha-card { background: transparent; border: none; box-shadow: none; -webkit-backdrop-filter: none; backdrop-filter: none; }
      .row { display: flex; gap: 10px; padding: 2px; overflow-x: auto; scrollbar-width: none; }
      .row::-webkit-scrollbar { display: none; }
      button { flex: 1 0 auto; min-width: 110px; min-height: 52px; padding: 0 18px 0 14px; border-radius: 999px;
               display: inline-flex; align-items: center; justify-content: center; gap: 9px;
               font: inherit; font-size: 15px; font-weight: 600; color: var(--_text); cursor: pointer; white-space: nowrap;
               background: var(--_surface); border: 1px solid var(--_border); box-shadow: var(--_shadow);
               -webkit-backdrop-filter: blur(var(--_blur)); backdrop-filter: blur(var(--_blur));
               transition: transform .15s var(--_ease), background .25s, color .25s; -webkit-tap-highlight-color: transparent; }
      button:active { transform: scale(.96); }
      button ha-icon { --mdc-icon-size: 22px; color: rgb(var(--c)); }
      button.on { background: rgba(var(--c), .22); border-color: rgba(var(--c), .6); }
      button.on .lbl::after { content: ""; display: inline-block; width: 7px; height: 7px; border-radius: 50%;
                              background: rgb(var(--c)); margin-inline-start: 8px; vertical-align: middle; }
      button.armed { background: rgba(${COLORS.orange}, .2); border-color: rgba(${COLORS.orange}, .55); }
      button.busy { opacity: .6; pointer-events: none; }
      .off { padding: 14px; color: var(--_text2); }
    `;
  }

  render() {
    const st = this.st(this._config.entity);
    if (!st) {
      this.html(`<ha-card><div class="off">${esc(this._config.entity)}: ${esc(this.t("offline"))}</div></ha-card>`);
      return;
    }
    const opts = st.attributes.options || [];
    const icons = this._config.icons || {};
    const offline = OFFLINE.includes(st.state);
    this.html(`<ha-card><div class="row" role="radiogroup" aria-label="${esc(this.t("house_mode"))}">${opts.map((k, i) => `
      <button class="tap ${st.state === k ? "on" : ""}" data-i="${i}" role="radio" aria-checked="${st.state === k}"
        ${offline ? "disabled" : ""} style="--c:${COLORS[TINT[k]] || COLORS.blue}">
        <ha-icon icon="${esc(icons[k] || ICONS[k] || "mdi:home-switch")}"></ha-icon><span class="lbl">${esc(this._label(k))}</span></button>`).join("")}
      </div></ha-card>`);
    this.shadowRoot.querySelectorAll("button").forEach((btn) => bindGestures(btn, {
      onTap: () => this._pick(btn, opts[+btn.dataset.i]),
      onHold: () => this.moreInfo(this._config.entity),
    }));
  }

  getCardSize() {
    return 1;
  }

  getGridOptions() {
    return { columns: "full", rows: "auto" };
  }
}
