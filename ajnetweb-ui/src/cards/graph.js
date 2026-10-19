// custom:ajnetweb-graph-card - history of one or more numbers (room temperatures) as smooth lines.
//   entity: sensor.majlis_temperature            one line with a soft area fill
//   entities: [sensor.a, { entity, name, color }]  several lines (e.g. every room), legend with live values
//   hours: 24   title   compact: false (small chart without axis labels, for the room sheet)
// History comes from history/history_during_period (no admin needed), reloaded every 10 minutes;
// the newest point follows the live state in between. Drag across the chart to read past values.
import { AjnBase, bindGestures, esc } from "../core/base.js";
import { COLORS } from "../core/styles.js";

const SERIES = ["orange", "blue", "teal", "purple", "green", "pink", "amber", "indigo"];
const REFRESH_MS = 10 * 60 * 1000;
const W = 300;

export class AjnetwebGraphCard extends AjnBase {
  static getStubConfig(hass) {
    const id = Object.keys(hass.states).find((e) => e.startsWith("sensor.") && hass.states[e].attributes.device_class === "temperature");
    return { entity: id || "sensor.temperature" };
  }

  validate(config) {
    if (!config.entity && !(Array.isArray(config.entities) && config.entities.length)) {
      throw new Error("ajnetweb-graph-card: 'entity' or 'entities' is required");
    }
  }

  setConfig(config) {
    this._data = null;
    super.setConfig(config);
  }

  _series() {
    const list = this._config.entities || [this._config.entity];
    return list.map((e, i) => (typeof e === "string" ? { entity: e } : e))
      .map((e, i) => ({ ...e, color: COLORS[e.color] || e.color || COLORS[SERIES[i % SERIES.length]] }));
  }

  watched() {
    return this._series().map((s) => s.entity);
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
    const hours = Number(this._config.hours) || 24;
    const start = new Date(Date.now() - hours * 3600000);
    try {
      const res = await this._hass.callWS({
        type: "history/history_during_period", start_time: start.toISOString(), end_time: new Date().toISOString(),
        entity_ids: this.watched(), minimal_response: true, no_attributes: true, significant_changes_only: false,
      });
      this._data = Object.fromEntries(this.watched().map((id) => [id, ((res || {})[id] || []).map((p) => ({
        t: p.lu != null ? p.lu * 1000 : Date.parse(p.last_updated || p.last_changed),
        v: parseFloat(p.s != null ? p.s : p.state),
      })).filter((p) => Number.isFinite(p.v) && Number.isFinite(p.t))]));
    } catch (e) {
      this._data = this._data || {};
    }
    this._from = start.getTime();
    this._loading = false;
    this.render();
  }

  // even points (one per bucket, averaged) from the raw state changes; the live state closes the line
  _points(id) {
    const raw = (this._data && this._data[id]) || [];
    const now = Date.now();
    const from = this._from || now - (Number(this._config.hours) || 24) * 3600000;
    const n = this._config.compact ? 36 : 72;
    const step = (now - from) / n;
    const out = [];
    let i = 0;
    let last = raw.length ? raw[0].v : null;
    for (let b = 0; b < n; b++) {
      const end = from + (b + 1) * step;
      let sum = 0;
      let cnt = 0;
      while (i < raw.length && raw[i].t < end) { sum += raw[i].v; cnt++; last = raw[i].v; i++; }
      const v = cnt ? sum / cnt : last;
      if (v != null) out.push({ t: end, v });
    }
    // the live state is the newest value (replaces the last bucket, which ends now)
    const live = this.num(id);
    if (live != null) { if (out.length) out[out.length - 1] = { t: now, v: live }; else out.push({ t: now, v: live }); }
    return out;
  }

  css() {
    return `
      .wrap { padding: 14px 16px 10px; display: grid; gap: 8px; }
      :host([compact]) .wrap { padding: 10px 12px 8px; }
      .top { display: flex; align-items: baseline; gap: 10px; min-height: 22px; }
      h3 { margin: 0; font-size: 12px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--_text2); }
      .now { margin-inline-start: auto; font-size: 22px; font-weight: 300; color: var(--_text); font-variant-numeric: tabular-nums; }
      .now small { font-size: 12px; color: var(--_text2); margin-inline-start: 6px; }
      .legend { display: flex; flex-wrap: wrap; gap: 6px 12px; font-size: 12px; color: var(--_text2); }
      .legend span { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
      .legend i { width: 8px; height: 8px; border-radius: 50%; background: rgb(var(--c)); }
      .legend b { color: var(--_text); font-weight: 600; font-variant-numeric: tabular-nums; }
      .chart { position: relative; touch-action: pan-y; }
      svg { display: block; width: 100%; height: ${this._config.compact ? 64 : 120}px; overflow: visible; }
      .axis { display: flex; justify-content: space-between; font-size: 11px; color: var(--_text2); margin-top: 2px; }
      .range { font-size: 11px; color: var(--_text2); }
      .cursor { position: absolute; top: 0; bottom: 0; width: 1px; background: var(--_text2); opacity: .5; display: none; pointer-events: none; }
      .empty { font-size: 13px; color: var(--_text2); padding: 18px 0; text-align: center; }
    `;
  }

  render() {
    if (this._data === null) { this._data = undefined; this._load(); }
    if (this._config.compact) this.setAttribute("compact", ""); else this.removeAttribute("compact");
    const series = this._series().map((s) => {
      const st = this.st(s.entity);
      return { ...s, st, name: s.name || (st && st.attributes.friendly_name) || s.entity, pts: this._points(s.entity),
               unit: (st && st.attributes.unit_of_measurement) || "" };
    });
    const all = series.flatMap((s) => s.pts.map((p) => p.v));
    const fmt = (v) => (v == null || !Number.isFinite(v) ? "–" : (Math.round(v * 10) / 10).toLocaleString(this.lang()));
    const one = series.length === 1 ? series[0] : null;
    let body;
    if (all.length < 2) {
      body = `<div class="empty">${esc(this._data === undefined ? "…" : this.t("no_history"))}</div>`;
    } else {
      const min = Math.min(...all);
      const max = Math.max(...all);
      const pad = Math.max(0.5, (max - min) * 0.15);
      const lo = min - pad;
      const hi = max + pad;
      const H = this._config.compact ? 64 : 120;
      const from = this._from || series[0].pts[0].t;
      const to = Date.now();
      const x = (t) => ((t - from) / (to - from)) * W;
      const y = (v) => H - ((v - lo) / (hi - lo)) * H;
      const line = (pts) => pts.map((p, i) => {
        if (!i) return `M${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`;
        const a = pts[i - 1];
        const mx = ((x(a.t) + x(p.t)) / 2).toFixed(1);
        return `C${mx},${y(a.v).toFixed(1)} ${mx},${y(p.v).toFixed(1)} ${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`;
      }).join("");
      const hours = Number(this._config.hours) || 24;
      const ticks = [0, 1, 2, 3, 4].map((k) => new Date(from + ((to - from) * k) / 4));
      const lbl = (d, k) => (k === 4 ? this.t("now") : d.toLocaleTimeString(this.lang(), hours > 48
        ? { weekday: "short" } : { hour: "numeric" }));
      body = `
        <div class="chart">
          <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
            <defs>${series.map((s, i) => `<linearGradient id="g${i}" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="rgb(${s.color})" stop-opacity=".32"/><stop offset="1" stop-color="rgb(${s.color})" stop-opacity="0"/></linearGradient>`).join("")}</defs>
            ${one && one.pts.length > 1 ? `<path d="${line(one.pts)}L${x(one.pts[one.pts.length - 1].t).toFixed(1)},${H}L${x(one.pts[0].t).toFixed(1)},${H}Z" fill="url(#g0)"/>` : ""}
            ${series.map((s) => (s.pts.length > 1 ? `<path d="${line(s.pts)}" fill="none" stroke="rgb(${s.color})" stroke-width="${one ? 2.4 : 2}"
              vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round"/>` : "")).join("")}
          </svg>
          <div class="cursor"></div>
        </div>
        ${this._config.compact ? "" : `<div class="axis">${ticks.map((d, k) => `<span>${esc(lbl(d, k))}</span>`).join("")}</div>`}`;
      this._geom = { from, to, series };
    }
    const title = this._config.title != null ? this._config.title : (one ? "" : this.t("temperature"));
    this.html(`
      <ha-card>
        <div class="wrap">
          <div class="top">
            ${title ? `<h3>${esc(title)}</h3>` : ""}
            ${one ? `<span class="range">${all.length ? `↓ ${esc(fmt(Math.min(...all)))} · ↑ ${esc(fmt(Math.max(...all)))}` : ""}</span>
                     <span class="now" data-now>${esc(fmt(this.num(one.entity)))}${esc(one.unit)}</span>` : ""}
          </div>
          ${body}
          ${one ? "" : `<div class="legend">${series.map((s, i) => `<span style="--c:${s.color}" data-i="${i}"><i></i>${esc(s.name)} <b>${esc(fmt(this.num(s.entity)))}${esc(s.unit)}</b></span>`).join("")}</div>`}
        </div>
      </ha-card>`);
    const chart = this.shadowRoot.querySelector(".chart");
    if (chart) this._bindScrub(chart, fmt);
    if (one) bindGestures(this.shadowRoot.querySelector("ha-card"), { onTap: () => this.moreInfo(one.entity) });
    else this.shadowRoot.querySelectorAll(".legend span").forEach((el) => bindGestures(el, { onTap: () => this.moreInfo(series[+el.dataset.i].entity) }));
  }

  // drag / hover across the chart: show the values at that time instead of the live ones
  _bindScrub(chart, fmt) {
    const cursor = chart.querySelector(".cursor");
    const show = (e) => {
      const g = this._geom;
      if (!g) return;
      const r = chart.getBoundingClientRect();
      const f = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      const t = g.from + f * (g.to - g.from);
      cursor.style.display = "block";
      cursor.style.left = `${f * 100}%`;
      const at = (pts) => pts.reduce((best, p) => (Math.abs(p.t - t) < Math.abs(best.t - t) ? p : best), pts[0]);
      const time = new Date(t).toLocaleTimeString(this.lang(), { hour: "numeric", minute: "2-digit" });
      const now = this.shadowRoot.querySelector("[data-now]");
      if (now && g.series[0].pts.length) now.innerHTML = `${esc(fmt(at(g.series[0].pts).v))}${esc(g.series[0].unit)}<small>${esc(time)}</small>`;
      this.shadowRoot.querySelectorAll(".legend b").forEach((b, i) => {
        const s = g.series[i];
        if (s && s.pts.length) b.textContent = `${fmt(at(s.pts).v)}${s.unit}`;
      });
    };
    const hide = () => { cursor.style.display = "none"; this.render(); };
    chart.addEventListener("pointermove", show);
    chart.addEventListener("pointerdown", show);
    chart.addEventListener("pointerleave", hide);
    chart.addEventListener("pointerup", (e) => { if (e.pointerType !== "mouse") hide(); });
  }

  getCardSize() {
    return this._config && this._config.compact ? 2 : 3;
  }

  getGridOptions() {
    return { columns: 12, min_columns: 6, rows: "auto" };
  }
}
