// custom:ajnetweb-weather-card - current weather + daily forecast with temperature range bars.
//   entity: weather.forecast_home    days: 5
// The forecast comes from the weather.get_forecasts action (weather entities no longer carry it as an
// attribute); refreshed every 30 minutes and whenever the weather entity changes.
import { AjnBase, bindGestures, esc, formatState } from "../core/base.js";
import { WEATHER_ICONS } from "./header.js";

const REFRESH_MS = 30 * 60 * 1000;

export class AjnetwebWeatherCard extends AjnBase {
  static getStubConfig(hass) {
    return { entity: Object.keys(hass.states).find((e) => e.startsWith("weather.")) || "weather.forecast_home" };
  }

  validate(config) {
    if (!config.entity) throw new Error("ajnetweb-weather-card: 'entity' is required");
  }

  watched() {
    return [this._config.entity];
  }

  connectedCallback() {
    this._timer = setInterval(() => this._load(true), REFRESH_MS);
  }

  disconnectedCallback() {
    clearInterval(this._timer);
  }

  async _load(force) {
    const st = this.st(this._config.entity);
    if (!st || !this._hass.callWS) return;
    const stamp = st.last_updated || st.last_changed || "";
    if (!force && this._stamp === stamp && this._forecast) return;
    this._stamp = stamp;
    try {
      const res = await this._hass.callWS({
        type: "call_service", domain: "weather", service: "get_forecasts",
        service_data: { type: "daily" }, target: { entity_id: this._config.entity }, return_response: true,
      });
      const data = (res && (res.response || res)) || {};
      this._forecast = ((data[this._config.entity] || {}).forecast || []).slice(0, this._config.days || 5);
    } catch (e) {
      this._forecast = this._forecast || [];
    }
    this.render();
  }

  css() {
    return `
      .wrap { padding: 14px 16px; display: grid; gap: 10px; }
      .now { display: flex; align-items: center; gap: 12px; }
      .now ha-icon { --mdc-icon-size: 40px; color: var(--_accent); }
      .t { font-size: 30px; font-weight: 300; letter-spacing: -.03em; line-height: 1; color: var(--_text); font-variant-numeric: tabular-nums; }
      .c { font-size: 13px; color: var(--_text2); }
      .hl { margin-inline-start: auto; text-align: end; font-size: 12px; color: var(--_text2); }
      .hl b { color: var(--_text); font-size: 14px; }
      .days { display: grid; gap: 7px; }
      .d { display: grid; grid-template-columns: 42px 22px 30px 1fr 30px; align-items: center; gap: 8px; font-size: 13px;
           color: var(--_text); font-variant-numeric: tabular-nums; }
      .d .n { color: var(--_text2); font-weight: 600; }
      .d ha-icon { --mdc-icon-size: 18px; color: var(--_text2); }
      .d .lo { color: var(--_text2); text-align: end; }
      .bar { position: relative; height: 6px; border-radius: 3px; background: var(--_muted); }
      .bar i { position: absolute; top: 0; bottom: 0; border-radius: 3px;
               background: linear-gradient(90deg, #5ac8fa, #ffd60a 60%, #ff9f0a); }
      .empty { font-size: 13px; color: var(--_text2); }
    `;
  }

  render() {
    const st = this.st(this._config.entity);
    if (!st) {
      this.html(`<ha-card><div class="wrap empty">${esc(this.t("offline"))}</div></ha-card>`);
      return;
    }
    if (this._forecast === undefined) this._load(false);
    else if (this._stamp !== (st.last_updated || st.last_changed || "")) this._load(false);
    const unit = st.attributes.temperature_unit || "°";
    const fc = this._forecast || [];
    const lows = fc.map((d) => d.templow).filter((v) => v != null);
    const highs = fc.map((d) => d.temperature).filter((v) => v != null);
    const min = Math.min(...lows, ...highs);
    const max = Math.max(...highs, ...lows);
    const pos = (v) => (max > min ? ((v - min) / (max - min)) * 100 : 50);
    const lang = this.lang();
    const day = (iso, i) => {
      if (i === 0) return this.t("today");
      try { return new Date(iso).toLocaleDateString(lang, { weekday: "short" }); } catch (e) { return ""; }
    };
    const r = (v) => (v == null ? "–" : `${Math.round(v)}°`);
    const today = fc[0] || {};
    this.html(`
      <ha-card class="tap" tabindex="0" role="button">
        <div class="wrap">
          <div class="now">
            <ha-icon icon="${WEATHER_ICONS[st.state] || "mdi:weather-partly-cloudy"}"></ha-icon>
            <div><div class="t">${st.attributes.temperature != null ? esc(Math.round(st.attributes.temperature)) + esc(unit) : "--"}</div>
              <div class="c">${esc(formatState(this._hass, st))}</div></div>
            ${today.temperature != null ? `<div class="hl"><b>${r(today.temperature)}</b> / ${r(today.templow)}</div>` : ""}
          </div>
          ${fc.length ? `<div class="days">${fc.map((d, i) => {
            const lo = d.templow != null ? d.templow : d.temperature;
            const hi = d.temperature != null ? d.temperature : lo;
            return `<div class="d"><span class="n">${esc(day(d.datetime, i))}</span>
              <ha-icon icon="${WEATHER_ICONS[d.condition] || "mdi:weather-partly-cloudy"}"></ha-icon>
              <span class="lo">${r(d.templow)}</span>
              <span class="bar"><i style="inset-inline-start:${pos(lo)}%;width:${Math.max(4, pos(hi) - pos(lo))}%"></i></span>
              <span>${r(d.temperature)}</span></div>`;
          }).join("")}</div>` : ""}
        </div>
      </ha-card>`);
    bindGestures(this.shadowRoot.querySelector("ha-card"), { onTap: () => this.moreInfo(this._config.entity) });
  }

  getCardSize() {
    return 4;
  }

  getGridOptions() {
    return { columns: 12, min_columns: 6, rows: "auto" };
  }
}
