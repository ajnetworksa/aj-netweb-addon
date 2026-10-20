// custom:ajnetweb-appliance-card - washing machine, dryer, dishwasher or 3D printer at a glance:
// a progress ring around the appliance, what it is doing, time left and when it will be ready.
//   entity: sensor.washer_status | binary_sensor.* | switch.* | timer.*   what the appliance is doing
//   kind: washer | dryer | dishwasher | printer      default: guessed from the name / icon
//   progress: sensor.washer_progress     optional, 0-100 %
//   remaining: sensor.washer_remaining   optional, minutes left, or a timestamp (finish time)
//   power: sensor.washer_power           optional, W; with no status entity, running = above `threshold` (5 W)
//   name / icon: optional
// Tap = more info of the status entity, hold = more info of the power sensor.
import { AjnBase, OFFLINE, bindGestures, esc, formatState } from "../core/base.js";
import { COLORS } from "../core/styles.js";

const KINDS = {
  washer: { icon: "mdi:washing-machine", color: "blue", spin: true },
  dryer: { icon: "mdi:tumble-dryer", color: "orange", spin: true },
  dishwasher: { icon: "mdi:dishwasher", color: "teal", spin: false },
  printer: { icon: "mdi:printer-3d-nozzle", color: "purple", spin: false },
};
const RUNNING = ["on", "run", "running", "active", "washing", "wash", "main_wash", "rinse", "rinsing", "spin", "spinning",
  "drying", "dry", "printing", "heating", "cooling", "busy", "in_use", "prewash", "pre_wash", "soak", "steam"];
// states that only repeat what the card already says; anything else (Rinse, Spin, Prewash, ...) is shown next to it
const GENERIC = ["on", "run", "running", "active", "washing", "wash", "drying", "dry", "printing", "busy", "in_use"];
const PAUSED = ["paused", "pause", "suspended"];
const DONE = ["finished", "finish", "complete", "completed", "done", "end", "ready_to_unload", "program_ended"];

export function applianceKind(text) {
  const t = String(text || "").toLowerCase();
  if (/print|nozzle|bambu|prusa|octo|klipper/.test(t)) return "printer";
  if (/dish/.test(t)) return "dishwasher";
  if (/dry|tumble/.test(t)) return "dryer";
  return "washer";
}

/** Minutes until an ISO timestamp, or null. */
const minsUntil = (iso) => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? Math.max(0, Math.round((t - Date.now()) / 60000)) : null;
};
const hms = (s) => {
  const p = String(s || "").split(":").map(Number);
  return p.length === 3 && p.every(Number.isFinite) ? p[0] * 60 + p[1] + p[2] / 60 : null;
};

export class AjnetwebApplianceCard extends AjnBase {
  static getStubConfig(hass) {
    const ids = Object.keys((hass && hass.states) || {});
    return { entity: ids.find((e) => /wash|dryer|print/.test(e) && !e.startsWith("automation.")) || "sensor.washer_status" };
  }

  validate(config) {
    if (!config.entity && !config.power) throw new Error("ajnetweb-appliance-card: 'entity' (or 'power') is required");
  }

  watched() {
    const c = this._config;
    return [c.entity, c.progress, c.remaining, c.power];
  }

  connectedCallback() {
    // time left counts down without a state change
    this._timer = setInterval(() => this._hass && this._config && this.render(), 30000);
  }

  disconnectedCallback() {
    clearInterval(this._timer);
  }

  _kind() {
    const c = this._config;
    if (KINDS[c.kind]) return c.kind;
    const st = this.st(c.entity) || this.st(c.power);
    return applianceKind(`${c.name || ""} ${(st && st.attributes.friendly_name) || ""} ${(st && st.attributes.icon) || ""} ${c.entity || ""}`);
  }

  /** { phase: running | paused | done | idle | offline, label } */
  _phase() {
    const c = this._config;
    const st = this.st(c.entity);
    const watts = this.num(c.power);
    const byPower = () => (watts != null && watts > (Number(c.threshold) || 5) ? "running" : "idle");
    if (!c.entity) return { phase: watts == null ? "offline" : byPower(), label: "" };
    if (!st || OFFLINE.includes(st.state)) return { phase: "offline", label: this.t("offline") };
    const s = String(st.state).toLowerCase().replace(/[\s-]+/g, "_");
    const label = formatState(this._hass, st);
    if (st.entity_id.startsWith("timer.")) return { phase: s === "active" ? "running" : s === "paused" ? "paused" : "idle", label: "" };
    if (DONE.includes(s)) return { phase: "done", label: "" };
    if (PAUSED.includes(s)) return { phase: "paused", label: "" };
    if (RUNNING.includes(s)) return { phase: "running", label: GENERIC.includes(s) ? "" : label };
    if (["off", "idle", "standby", "ready", "inactive"].includes(s)) {
      // some integrations stay "on"/"idle" for the whole program: trust the power draw when there is one
      return { phase: watts != null ? byPower() : "idle", label: "" };
    }
    return { phase: watts != null ? byPower() : "running", label }; // a program step we don't know: show it as running
  }

  _left() {
    const c = this._config;
    const rem = this.st(c.remaining);
    if (rem && !OFFLINE.includes(rem.state)) {
      if (rem.attributes.device_class === "timestamp" || /T\d\d:/.test(rem.state)) return minsUntil(rem.state);
      const v = parseFloat(rem.state);
      if (Number.isFinite(v)) {
        const u = String(rem.attributes.unit_of_measurement || "min").toLowerCase();
        return Math.round(u.startsWith("h") ? v * 60 : u.startsWith("s") ? v / 60 : v);
      }
      const m = hms(rem.state);
      if (m != null) return Math.round(m);
    }
    const st = this.st(c.entity);
    if (st && st.entity_id.startsWith("timer.")) {
      if (st.state === "active" && st.attributes.finishes_at) return minsUntil(st.attributes.finishes_at);
      const m = hms(st.attributes.remaining);
      if (m != null) return Math.round(m);
    }
    return null;
  }

  _progress(left) {
    const c = this._config;
    const p = this.num(c.progress);
    if (p != null) return Math.max(0, Math.min(100, p));
    const st = this.st(c.entity);
    if (st && st.entity_id.startsWith("timer.") && left != null) {
      const total = hms(st.attributes.duration);
      if (total) return Math.max(0, Math.min(100, 100 - (left / total) * 100));
    }
    return null;
  }

  _dur(min) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return h ? `${h} ${this.t("hours_short")}${m ? ` ${m} ${this.t("minutes_short")}` : ""}` : `${m} ${this.t("minutes_short")}`;
  }

  _clock(min) {
    const d = new Date(Date.now() + min * 60000);
    try {
      const h12 = this._hass.locale && this._hass.locale.time_format === "12";
      return d.toLocaleTimeString(this.lang(), { hour: "numeric", minute: "2-digit", ...(this._hass.locale && this._hass.locale.time_format ? { hour12: h12 } : {}) });
    } catch (e) {
      return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
    }
  }

  css() {
    return `
      .wrap { height: 100%; box-sizing: border-box; padding: 14px; display: flex; align-items: center; gap: 14px; }
      .ring { position: relative; flex: none; width: 64px; height: 64px; }
      .ring > svg { position: absolute; inset: 0; transform: rotate(-90deg); }
      .ring circle { fill: none; stroke-width: 5; }
      .ring .track { stroke: var(--_muted); }
      .ring .bar { stroke: rgb(var(--c)); stroke-linecap: round; transition: stroke-dashoffset .6s var(--_ease); }
      .tile { position: absolute; inset: 9px; border-radius: 50%; display: grid; place-items: center;
              background: rgba(var(--c), .16); color: rgb(var(--c)); }
      .tile ha-icon { --mdc-icon-size: 26px; }
      .idle .tile, .offline .tile { background: var(--_muted); color: var(--_text2); }
      .running.spin .tile ha-icon { animation: wobble 1.6s ease-in-out infinite; }
      .running:not(.spin) .tile { animation: pulse 2s ease-in-out infinite; }
      @keyframes wobble { 0%, 100% { transform: rotate(-8deg); } 50% { transform: rotate(8deg); } }
      @keyframes pulse { 50% { box-shadow: 0 0 0 6px rgba(var(--c), .12); } }
      .done .tile { background: rgb(var(--c)); color: #fff; }
      .body { min-width: 0; flex: 1; }
      .name { font-size: 15px; font-weight: 650; color: var(--_text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .what { font-size: 13px; color: var(--_text2); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .what b { color: rgb(var(--c)); font-weight: 600; }
      .idle .what b, .offline .what b { color: var(--_text2); font-weight: 500; }
      .left { flex: none; text-align: end; }
      .big { font-size: 22px; font-weight: 700; color: var(--_text); line-height: 1.1; font-variant-numeric: tabular-nums; }
      .small { font-size: 12px; color: var(--_text2); margin-top: 2px; white-space: nowrap; }
      @container (max-width: 250px) { .left { display: none; } }
    `;
  }

  render() {
    const c = this._config;
    const kind = this._kind();
    const k = KINDS[kind];
    const { phase, label } = this._phase();
    const live = phase === "running" || phase === "paused";
    const left = live ? this._left() : null;
    const pct = phase === "done" ? 100 : live ? this._progress(left) : null;
    const st = this.st(c.entity) || this.st(c.power);
    const name = c.name || (st && st.attributes.friendly_name) || this.t(`appl_${kind}`);
    const head = { running: this.t(`appl_run_${kind}`), paused: this.t("paused"), done: this.t("appl_done"),
      idle: this.t("appl_idle"), offline: this.t("offline") }[phase];
    const sub = [label && label.toLowerCase() !== head.toLowerCase() ? label : "",
      live && pct != null ? `${Math.round(pct)}%` : ""].filter(Boolean).join(" · ");
    const R = 29.5;
    const C = 2 * Math.PI * R;
    const off = C * (1 - (pct == null ? (live ? 0.08 : 0) : pct / 100));
    this.html(`
      <ha-card class="tap ${phase} ${k.spin ? "spin" : ""}" style="--c:${COLORS[phase === "done" ? "green" : k.color]}" tabindex="0" role="button"
        aria-label="${esc(name)}: ${esc(head)}"><div class="wrap">
        <div class="ring">
          <svg viewBox="0 0 64 64"><circle class="track" cx="32" cy="32" r="${R}"/>
            <circle class="bar" cx="32" cy="32" r="${R}" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"/></svg>
          <div class="tile"><ha-icon icon="${esc(c.icon || (phase === "done" ? "mdi:check-bold" : k.icon))}"></ha-icon></div>
        </div>
        <div class="body"><div class="name">${esc(name)}</div>
          <div class="what"><b>${esc(head)}</b>${sub ? ` · ${esc(sub)}` : ""}</div></div>
        ${left != null ? `<div class="left"><div class="big">${esc(this._dur(left))}</div>
          <div class="small">${esc(this.t("appl_ready_at", null, { time: this._clock(left) }))}</div></div>` : ""}
      </div></ha-card>`);
    bindGestures(this.shadowRoot.querySelector("ha-card"), {
      onTap: () => this.moreInfo(c.entity || c.power),
      onHold: () => this.moreInfo(c.power || c.progress || c.entity),
    });
  }

  getCardSize() {
    return 1;
  }

  getGridOptions() {
    return { columns: 12, min_columns: 6, rows: "auto" };
  }
}
