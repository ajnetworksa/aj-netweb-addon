// custom:ajnetweb-energy-card - electricity at a glance: used today, the last 7 days, solar, cost, power now,
// the AC share and this month's bill estimate.
//   power: sensor.house_power    optional live power (W or kW)
//   days: 7
//   entities: [sensor.main_meter_energy]   only without HA's Energy dashboard: meters to add up
//   tariff: auto | sec | dewa | none | { tiers: [[6000, 0.18], [null, 0.3]], per_kwh: 0, vat: 0.15, currency: SAR }
//           auto = SEC in Saudi Arabia (HA country SA), otherwise none. A cost sensor in HA's Energy settings wins.
//   ac: [sensor.majlis_ac_energy]  AC meters; default: Energy "individual devices" whose name looks like an AC
// Normally reads the sources from HA's own Energy dashboard settings (energy/get_prefs) and the daily
// totals from long-term statistics (recorder/statistics_during_period), so it matches HA's Energy page.
// Tap opens HA's Energy page.
import { AjnBase, bindGestures, esc } from "../core/base.js";
import { COLORS } from "../core/styles.js";

const REFRESH_MS = 15 * 60 * 1000;

// Residential tariffs for the bill estimate: monthly kWh tiers ([up to kWh, rate]; null = no limit), an extra
// per-kWh charge (DEWA fuel surcharge) and VAT. Meter and other fixed fees are not included.
export const TARIFFS = {
  sec: { name: "SEC", currency: "SAR", tiers: [[6000, 0.18], [null, 0.30]], per_kwh: 0, vat: 0.15 },
  dewa: { name: "DEWA", currency: "AED", tiers: [[2000, 0.23], [4000, 0.28], [6000, 0.32], [null, 0.38]], per_kwh: 0.065, vat: 0.05 },
};

/** The tariff a card config asks for, or null. */
export function pickTariff(option, hass) {
  if (option && typeof option === "object" && Array.isArray(option.tiers)) return { name: "", per_kwh: 0, vat: 0, ...option };
  const key = option == null || option === "auto" ? (((hass && hass.config) || {}).country === "SA" ? "sec" : null) : option;
  return TARIFFS[key] || null;
}

/** Cost of one month's kWh under a tiered tariff, VAT included. */
export function monthCost(kwh, t) {
  let left = Math.max(0, kwh), prev = 0, cost = 0;
  for (const [upto, rate] of t.tiers) {
    const band = upto == null ? left : Math.min(left, upto - prev);
    cost += band * rate;
    left -= band;
    prev = upto;
    if (left <= 0 || upto == null) break;
  }
  return (cost + Math.max(0, kwh) * (t.per_kwh || 0)) * (1 + (t.vat || 0));
}

const AC_WORDS = /(^|[^a-z])(ac|a\/c|aircon|air_?condition\w*|hvac|split|chiller|cooling|مكيف|تكييف)([^a-z]|$)/i;

/** Statistic ids from HA's Energy dashboard settings: { from: [], to: [], solar: [], cost: [], rate: [] }. */
export function energySources(prefs) {
  const out = { from: [], to: [], solar: [], cost: [], rate: [], ac: [] };
  ((prefs && prefs.energy_sources) || []).forEach((s) => {
    if (s.type === "grid") {
      (s.flow_from || []).forEach((f) => { if (f.stat_energy_from) out.from.push(f.stat_energy_from); if (f.stat_cost) out.cost.push(f.stat_cost); });
      (s.flow_to || []).forEach((f) => f.stat_energy_to && out.to.push(f.stat_energy_to));
      if (s.stat_energy_from) out.from.push(s.stat_energy_from);   // newer single-meter layout
      if (s.stat_energy_to) out.to.push(s.stat_energy_to);
      if (s.stat_cost) out.cost.push(s.stat_cost);
      if (s.stat_rate) out.rate.push(s.stat_rate);
      if (s.power_config && s.power_config.stat_rate) out.rate.push(s.power_config.stat_rate);
    }
    if (s.type === "solar" && s.stat_energy_from) out.solar.push(s.stat_energy_from);
  });
  ((prefs && prefs.device_consumption) || []).forEach((d) => {
    if (d.stat_consumption && AC_WORDS.test(`${d.stat_consumption} ${d.name || ""}`.replace(/[._]/g, " "))) out.ac.push(d.stat_consumption);
  });
  return out;
}

export class AjnetwebEnergyCard extends AjnBase {
  static getStubConfig() {
    return {};
  }

  setConfig(config) {
    this._stats = undefined;
    super.setConfig(config);
  }

  watched() {
    return this._config.power ? [this._config.power] : [];
  }

  connectedCallback() {
    this._timer = setInterval(() => this._load(), REFRESH_MS);
  }

  disconnectedCallback() {
    clearInterval(this._timer);
  }

  async _load() {
    if (!this._hass || !this._hass.callWS || this._loading) return;
    this._loading = true;
    try {
      let src = { from: [...(this._config.entities || [])], to: [], solar: [], cost: [], rate: [], ac: [] };
      if (!src.from.length) {
        src = energySources(await this._hass.callWS({ type: "energy/get_prefs" }).catch(() => null));
      }
      if (Array.isArray(this._config.ac)) src.ac = this._config.ac.filter((id) => typeof id === "string");
      const ids = [...new Set([...src.from, ...src.to, ...src.solar, ...src.cost, ...src.ac])];
      const days = Number(this._config.days) || 7;
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      start.setDate(start.getDate() - (days - 1));
      const res = ids.length ? await this._hass.callWS({
        type: "recorder/statistics_during_period", start_time: start.toISOString(), statistic_ids: ids,
        period: "day", types: ["change"], units: { energy: "kWh" },
      }) : {};
      const keys = [...Array(days)].map((_, i) => new Date(start.getTime() + i * 86400000).toDateString());
      const sum = (list) => keys.map((k) => list.reduce((n, id) => n + ((res[id] || [])
        .filter((p) => new Date(typeof p.start === "number" ? p.start : Date.parse(p.start)).toDateString() === k)
        .reduce((m, p) => m + (Number(p.change) || 0), 0)), 0));
      const from = sum(src.from);
      const to = sum(src.to);
      const solar = sum(src.solar);
      // this month so far (grid import is what the bill counts)
      const monthStart = new Date();
      monthStart.setHours(0, 0, 0, 0);
      monthStart.setDate(1);
      const mIds = [...new Set([...src.from, ...src.cost])];
      const mRes = mIds.length ? await this._hass.callWS({
        type: "recorder/statistics_during_period", start_time: monthStart.toISOString(), statistic_ids: mIds,
        period: "month", types: ["change"], units: { energy: "kWh" },
      }).catch(() => ({})) : {};
      const mSum = (list) => list.reduce((n, id) => n + (mRes[id] || []).reduce((m, p) => m + (Number(p.change) || 0), 0), 0);
      this._stats = {
        keys, solarOn: src.solar.length > 0, exportOn: src.to.length > 0, costOn: src.cost.length > 0,
        used: keys.map((_, i) => Math.max(0, from[i] + solar[i] - to[i])), solar, to, cost: sum(src.cost),
        acOn: src.ac.length > 0, ac: sum(src.ac),
        month: { kwh: mSum(src.from), cost: src.cost.length ? mSum(src.cost) : null, start: monthStart },
        empty: !ids.length,
      };
    } catch (e) {
      this._stats = { empty: true };
    }
    this._loading = false;
    this.render();
  }

  css() {
    return `
      .wrap { padding: 14px 16px; display: grid; gap: 10px; }
      h3 { margin: 0; font-size: 12px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--_text2);
           display: flex; align-items: center; gap: 6px; }
      h3 ha-icon { --mdc-icon-size: 16px; }
      .main { display: flex; align-items: flex-end; gap: 14px; }
      .big { font-size: 30px; font-weight: 300; letter-spacing: -.03em; line-height: 1; color: var(--_text); font-variant-numeric: tabular-nums; }
      .big small { font-size: 13px; color: var(--_text2); margin-inline-start: 4px; letter-spacing: 0; }
      .cmp { font-size: 12px; color: var(--_text2); }
      .pw { margin-inline-start: auto; text-align: end; font-size: 12px; color: var(--_text2); }
      .pw b { display: block; font-size: 16px; color: var(--_text); font-variant-numeric: tabular-nums; }
      .bars { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 6px; align-items: end; height: 70px; }
      .bar { display: flex; flex-direction: column; justify-content: flex-end; align-items: center; gap: 4px; height: 100%; }
      .bar i { width: 100%; max-width: 26px; border-radius: 6px 6px 3px 3px; background: rgba(var(--rgb-primary-text-color, 128, 128, 128), .16); }
      .bar.today i { background: var(--_grad); }
      .bar span { font-size: 10px; color: var(--_text2); }
      .chips { display: flex; flex-wrap: wrap; gap: 8px; }
      .chip { display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 999px; background: var(--_muted);
              font-size: 12px; color: var(--_text2); }
      .chip ha-icon { --mdc-icon-size: 15px; color: rgb(var(--c)); }
      .chip b { color: var(--_text); font-variant-numeric: tabular-nums; }
      .empty { font-size: 13px; color: var(--_text2); padding: 10px 0; }
      .month { display: flex; flex-wrap: wrap; gap: 4px 14px; align-items: baseline; padding-top: 8px; border-top: 1px solid var(--_border, rgba(127,127,127,.18));
               font-size: 12px; color: var(--_text2); }
      .month b { color: var(--_text); font-size: 15px; font-weight: 600; font-variant-numeric: tabular-nums; }
    `;
  }

  render() {
    if (this._stats === undefined) { this._stats = null; this._load(); }
    const s = this._stats;
    const lang = this.lang();
    const n = (v, d = 1) => (Number(v) || 0).toLocaleString(lang, { maximumFractionDigits: d, minimumFractionDigits: d });
    const pst = this.st(this._config.power);
    let power = "";
    if (pst && Number.isFinite(parseFloat(pst.state))) {
      const unit = pst.attributes.unit_of_measurement || "W";
      const w = parseFloat(pst.state) * (unit === "kW" ? 1000 : 1);
      power = w >= 1000 ? `${n(w / 1000, 2)} kW` : `${Math.round(w)} W`;
    }
    let body;
    if (s === null) body = `<div class="empty">…</div>`;
    else if (s.empty) body = `<div class="empty">${esc(this.t("energy_setup"))}</div>`;
    else {
      const last = s.used.length - 1;
      const today = s.used[last];
      const yest = last > 0 ? s.used[last - 1] : null;
      const peak = Math.max(...s.used, 0.1);
      const currency = (this._hass.config && this._hass.config.currency) || "";
      const acPct = s.acOn && s.used[last] > 0 ? Math.min(100, Math.round((s.ac[last] / s.used[last]) * 100)) : null;
      // bill: HA's own cost sensor if there is one, otherwise the tariff estimate; projected from the days so far
      const tariff = pickTariff(this._config.tariff, this._hass);
      const now = new Date();
      const daysIn = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const elapsed = Math.max(1, (now - s.month.start) / 86400000);
      let bill = null;
      if (s.month.cost != null && s.month.cost > 0) {
        bill = { sofar: s.month.cost, projected: (s.month.cost / elapsed) * daysIn, cur: currency };
      } else if (tariff && s.month.kwh > 0) {
        bill = { sofar: monthCost(s.month.kwh, tariff), projected: monthCost((s.month.kwh / elapsed) * daysIn, tariff),
                 cur: tariff.currency || currency, estimate: tariff.name };
      }
      const money = (v, cur) => `${n(v, 0)} ${cur}`;
      body = `
        <div class="main">
          <div><div class="big">${esc(n(today))}<small>kWh</small></div>
            <div class="cmp">${esc(this.t("today"))}${yest != null ? ` · ${esc(this.t("yesterday"))} ${esc(n(yest))} kWh` : ""}</div></div>
          ${power ? `<div class="pw">${esc(this.t("power_now"))}<b>${esc(power)}</b></div>` : ""}
        </div>
        <div class="bars">${s.used.map((v, i) => `<div class="bar ${i === last ? "today" : ""}" title="${esc(n(v))} kWh">
          <i style="height:${Math.max(3, Math.round((v / peak) * 54))}px"></i>
          <span>${esc(new Date(s.keys[i]).toLocaleDateString(lang, { weekday: "narrow" }))}</span></div>`).join("")}</div>
        ${s.solarOn || s.exportOn || s.costOn || acPct != null ? `<div class="chips">
          ${s.solarOn ? `<span class="chip" style="--c:${COLORS.amber}"><ha-icon icon="mdi:solar-power"></ha-icon>${esc(this.t("solar"))} <b>${esc(n(s.solar[last]))} kWh</b></span>` : ""}
          ${s.exportOn ? `<span class="chip" style="--c:${COLORS.green}"><ha-icon icon="mdi:transmission-tower-export"></ha-icon>${esc(this.t("exported"))} <b>${esc(n(s.to[last]))} kWh</b></span>` : ""}
          ${s.costOn ? `<span class="chip" style="--c:${COLORS.teal}"><ha-icon icon="mdi:cash"></ha-icon>${esc(this.t("cost_today"))} <b>${esc(n(s.cost[last], 2))} ${esc(currency)}</b></span>` : ""}
          ${acPct != null ? `<span class="chip" style="--c:${COLORS.blue}"><ha-icon icon="mdi:snowflake"></ha-icon>${esc(this.t("ac_share"))}
            <b>${esc(acPct)}%</b> · ${esc(n(s.ac[last]))} kWh</span>` : ""}
        </div>` : ""}
        ${s.month.kwh > 0 ? `<div class="month"><span>${esc(this.t("this_month"))} <b>${esc(n(s.month.kwh, 0))} kWh</b></span>
          ${bill ? `<span>${esc(this.t(bill.estimate ? "bill_estimate" : "bill_so_far"))} <b>${esc(money(bill.sofar, bill.cur))}</b></span>
          <span>${esc(this.t("bill_projected"))} <b>${esc(money(bill.projected, bill.cur))}</b></span>` : ""}</div>` : ""}`;
    }
    this.html(`
      <ha-card class="tap" tabindex="0" role="button">
        <div class="wrap">
          <h3><ha-icon icon="mdi:lightning-bolt"></ha-icon>${esc(this._config.title || this.t("energy"))}</h3>
          ${body}
        </div>
      </ha-card>`);
    bindGestures(this.shadowRoot.querySelector("ha-card"), { onTap: () => this.navigate("/energy") });
  }

  getCardSize() {
    return 4;
  }

  getGridOptions() {
    return { columns: 12, min_columns: 6, rows: "auto" };
  }
}
