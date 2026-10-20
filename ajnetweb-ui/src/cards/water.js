// custom:ajnetweb-water-card - water tanks, the booster pump and garden watering in one card.
//   tanks: [sensor.roof_tank_level, { entity: sensor.ground_tank, name: Ground tank, capacity: 5000 }]
//          level sensors in % (capacity in litres adds "≈ 3,200 L")
//   pump: switch.booster_pump        optional
//   zones: [valve.front_lawn, switch.drip_line]   watering zones (valves or switches)
//   minutes: 10                      "Run 10 min" length (needs script.ajnetweb_water_run, made by Studio Deploy)
//   low: 20                          tank level shown red below this %
// The strategy fills tanks, pump and zones from the names of the entities when they are not given.
import { AjnBase, OFFLINE, bindGestures, esc, entityName } from "../core/base.js";
import { COLORS } from "../core/styles.js";

export const RUN_SCRIPT = "script.ajnetweb_water_run";

const TANK = /(^|[^a-z])(tank|cistern|reservoir)|خزان/i;
const PUMP = /(^|[^a-z])pump|مضخ/i;
const ZONE = /(^|[^a-z])(irrigat\w*|sprinkler\w*|drip|garden|lawn|zone|watering)|ري |الري|رشاش|تنقيط|حديقة/i;
const NOT_ZONE = /(^|[^a-z])(main|shut_?off|leak|supply|gas)|رئيسي|غاز/i;

const label = (hass, id) => `${id} ${entityName(hass, id)}`.replace(/[._]/g, " ");

/** Tanks, pump and watering zones found by name: { tanks: [], pump, zones: [] }. */
export function waterEntities(hass) {
  const out = { tanks: [], pump: null, zones: [] };
  Object.keys((hass && hass.states) || {}).sort().forEach((id) => {
    const st = hass.states[id];
    const a = st.attributes || {};
    const domain = id.split(".")[0];
    const text = label(hass, id);
    if (domain === "sensor" && a.unit_of_measurement === "%" && TANK.test(text) && !/battery/i.test(text)) out.tanks.push(id);
    else if (domain === "switch" && PUMP.test(text) && !out.pump) out.pump = id;
    else if ((domain === "valve" || domain === "switch") && ZONE.test(text) && !NOT_ZONE.test(text) && a.device_class !== "gas") out.zones.push(id);
  });
  return out;
}

const isOn = (st) => !!st && (st.state === "on" || st.state === "open" || st.state === "opening");

export class AjnetwebWaterCard extends AjnBase {
  static getStubConfig(hass) {
    const w = waterEntities(hass);
    return { tanks: w.tanks.slice(0, 2), ...(w.pump ? { pump: w.pump } : {}), zones: w.zones.slice(0, 4) };
  }

  tanks() {
    return (this._config.tanks || []).map((t) => (typeof t === "string" ? { entity: t } : t)).filter((t) => t && t.entity);
  }

  watched() {
    return [...this.tanks().map((t) => t.entity), this._config.pump, ...(this._config.zones || []), RUN_SCRIPT].filter(Boolean);
  }

  css() {
    return `
      .wrap { padding: 14px 16px; display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; }
      h3 { margin: 0; font-size: 12px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--_text2);
           display: flex; align-items: center; gap: 6px; }
      h3 ha-icon { --mdc-icon-size: 16px; }
      .tanks { display: flex; gap: 14px; flex-wrap: wrap; }
      .tank { display: flex; align-items: center; gap: 10px; cursor: pointer; min-width: 120px; flex: 1; }
      .gauge { position: relative; width: 34px; height: 58px; border-radius: 10px; overflow: hidden; flex: none;
               background: rgba(var(--rgb-primary-text-color, 128, 128, 128), .12); }
      .gauge i { position: absolute; inset-inline: 0; bottom: 0; background: rgb(var(--c)); opacity: .85; transition: height .4s var(--_ease); }
      .tv b { display: block; font-size: 24px; font-weight: 300; letter-spacing: -.02em; color: var(--_text); font-variant-numeric: tabular-nums; }
      .tv span { font-size: 12px; color: var(--_text2); }
      .tv .low { color: rgb(${COLORS.red}); font-weight: 600; }
      .pump { display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 999px; background: var(--_muted);
              font-size: 12px; color: var(--_text2); cursor: pointer; justify-self: start; }
      .pump ha-icon { --mdc-icon-size: 15px; color: rgb(var(--c)); }
      .pump b { color: var(--_text); }
      .zones { display: grid; grid-template-columns: minmax(0, 1fr); gap: 6px; }
      .zone { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 12px; background: var(--_muted); }
      .zone ha-icon { --mdc-icon-size: 20px; color: var(--_text2); }
      .zone.on ha-icon { color: rgb(${COLORS.blue}); }
      .zt { flex: 1; min-width: 0; cursor: pointer; }
      .zt b { display: block; font-size: 14px; font-weight: 600; color: var(--_text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .zt span { font-size: 12px; color: var(--_text2); }
      .zone button { border: none; border-radius: 999px; padding: 7px 12px; font: inherit; font-size: 12px; font-weight: 600; cursor: pointer;
                     background: var(--_grad); color: #fff; white-space: nowrap; }
      .zone.on button { background: rgba(${COLORS.red}, .14); color: rgb(${COLORS.red}); }
      .zone button[disabled] { opacity: .4; cursor: default; }
      .empty { font-size: 13px; color: var(--_text2); }
    `;
  }

  ago(st) {
    const mins = Math.round((Date.now() - new Date(st.last_changed).getTime()) / 60000);
    const rtf = new Intl.RelativeTimeFormat(this.lang(), { numeric: "auto" });
    if (mins < 60) return rtf.format(-Math.max(0, mins), "minute");
    if (mins < 48 * 60) return rtf.format(-Math.round(mins / 60), "hour");
    return rtf.format(-Math.round(mins / 1440), "day");
  }

  render() {
    const cfg = this._config;
    const low = Number(cfg.low) || 20;
    const minutes = Math.max(1, Math.min(120, Number(cfg.minutes) || 10));
    const lang = this.lang();
    const timer = !!this.st(RUN_SCRIPT);
    const tanks = this.tanks().map((t) => {
      const v = this.num(t.entity);
      const pct = v == null ? null : Math.max(0, Math.min(100, v));
      const c = pct == null ? COLORS.grey : pct < low ? COLORS.red : pct < low * 2 ? COLORS.amber : COLORS.blue;
      const litres = pct != null && Number(t.capacity) > 0 ? Math.round((Number(t.capacity) * pct) / 100) : null;
      return `<div class="tank" data-more="${esc(t.entity)}" style="--c:${c}">
        <div class="gauge"><i style="height:${pct == null ? 0 : pct}%"></i></div>
        <div class="tv"><b>${pct == null ? "–" : `${Math.round(pct)}%`}</b>
          <span>${esc(t.name || entityName(this._hass, t.entity))}</span>
          ${litres != null ? `<span> · ≈ ${esc(litres.toLocaleString(lang))} L</span>` : ""}
          ${pct != null && pct < low ? `<div><span class="low">${esc(this.t("water_low"))}</span></div>` : ""}</div></div>`;
    }).join("");
    const pst = this.st(cfg.pump);
    const pump = pst ? `<div class="pump" data-more="${esc(cfg.pump)}" style="--c:${isOn(pst) ? COLORS.blue : COLORS.grey}">
        <ha-icon icon="mdi:pump"></ha-icon>${esc(entityName(this._hass, cfg.pump))} <b>${esc(this.t(isOn(pst) ? "running" : "off"))}</b></div>` : "";
    const zones = (cfg.zones || []).map((id) => {
      const st = this.st(id);
      if (!st) return "";
      const on = isOn(st);
      const off = OFFLINE.includes(st.state);
      const sub = off ? this.t("offline") : on ? this.t("watering") : `${this.t("last_watered")} ${this.ago(st)}`;
      const btn = on ? this.t("stop") : timer ? this.t("run_for", null, { n: minutes }) : this.t("start");
      return `<div class="zone ${on ? "on" : ""}"><ha-icon icon="${on ? "mdi:sprinkler-variant" : "mdi:sprinkler"}"></ha-icon>
        <div class="zt" data-more="${esc(id)}"><b>${esc(entityName(this._hass, id))}</b><span>${esc(sub)}</span></div>
        <button data-zone="${esc(id)}" ${off ? "disabled" : ""}>${esc(btn)}</button></div>`;
    }).join("");
    const body = tanks || pump || zones ? `${tanks ? `<div class="tanks">${tanks}</div>` : ""}${pump}${zones ? `<div class="zones">${zones}</div>` : ""}`
      : `<div class="empty">${esc(this.t("water_setup"))}</div>`;
    this.html(`<ha-card><div class="wrap">
      <h3><ha-icon icon="mdi:water"></ha-icon>${esc(cfg.title || this.t("water"))}</h3>${body}</div></ha-card>`);
    this.shadowRoot.querySelectorAll("[data-more]").forEach((el) => bindGestures(el, { onTap: () => this.moreInfo(el.dataset.more) }));
    this.shadowRoot.querySelectorAll("[data-zone]").forEach((b) => b.addEventListener("click", () => this.toggleZone(b.dataset.zone, minutes)));
  }

  toggleZone(id, minutes) {
    const st = this.st(id);
    const valve = id.startsWith("valve.");
    if (isOn(st)) return this.call(valve ? "valve.close_valve" : "switch.turn_off", id);
    if (this.st(RUN_SCRIPT)) return this.call("script.turn_on", RUN_SCRIPT, { variables: { zone: id, minutes } });
    return this.call(valve ? "valve.open_valve" : "switch.turn_on", id);
  }

  getCardSize() {
    return 3;
  }

  getGridOptions() {
    return { columns: 12, min_columns: 6, rows: "auto" };
  }
}
