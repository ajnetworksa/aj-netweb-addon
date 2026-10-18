// custom:ajnetweb-prayer-card - today's prayer times, next prayer countdown and Hijri date.
//   entity: sensor.ajnetweb_next_prayer   (from the AJ Netweb Prayer & Adhan add-on; default)
// Without the add-on it reads Home Assistant's Islamic Prayer Times sensors directly
// (found through the entity registry), so it also works in plain HA installs.
//   variant: default | compact | panel ; show_controls: true
import { AjnBase, bindGestures, esc, haptic } from "../core/base.js";
import { COLORS } from "../core/styles.js";

const ORDER = ["fajr", "dhuhr", "asr", "maghrib", "isha"];
const ICONS = { fajr: "mdi:weather-sunset-up", dhuhr: "mdi:weather-sunny", asr: "mdi:weather-partly-cloudy",
                maghrib: "mdi:weather-sunset-down", isha: "mdi:weather-night" };

export function nativePrayerSensors(hass) {
  const out = {};
  Object.values(hass.entities || {}).forEach((e) => {
    if (e.platform === "islamic_prayer_times" && ORDER.concat("sunrise").includes(e.translation_key)) out[e.translation_key] = e.entity_id;
  });
  return out;
}

export function hasPrayerTimes(hass) {
  return !!hass.states["sensor.ajnetweb_next_prayer"] || Object.keys(nativePrayerSensors(hass)).length > 0;
}

export class AjnetwebPrayerCard extends AjnBase {
  static getStubConfig() {
    return {};
  }

  setConfig(config) {
    super.setConfig(config || {});
  }

  _entity() {
    return this._config.entity || "sensor.ajnetweb_next_prayer";
  }

  _data() {
    const add = this.st(this._entity());
    if (add && add.attributes.times) {
      const a = add.attributes;
      return { times: a.times, hijri: a.hijri || {}, helpers: a.helpers || {}, playing: a.playing, source: "addon" };
    }
    const sensors = nativePrayerSensors(this._hass);
    const times = {};
    Object.entries(sensors).forEach(([k, id]) => {
      const s = this.st(id);
      if (s && !["unknown", "unavailable"].includes(s.state)) times[k] = s.state;
    });
    return { times, hijri: {}, helpers: {}, playing: false, source: "native" };
  }

  watched() {
    const d = this._hass ? this._data() : { helpers: {} };
    return [this._entity(), ...Object.values(nativePrayerSensors(this._hass || {})), ...Object.values(d.helpers)];
  }

  connectedCallback() {
    this._timer = setInterval(() => this.render(), 30000);
  }

  disconnectedCallback() {
    clearInterval(this._timer);
  }

  _time(iso) {
    const loc = (this._hass && this._hass.locale) || {};
    const opts = { hour: "numeric", minute: "2-digit" };
    if (loc.time_format === "12") opts.hour12 = true;
    if (loc.time_format === "24") opts.hour12 = false;
    try { return new Date(iso).toLocaleTimeString(loc.language || undefined, opts); } catch (e) { return iso; }
  }

  _next(times) {
    const now = Date.now();
    const up = ORDER.filter((k) => times[k] && new Date(times[k]).getTime() > now)
      .sort((a, b) => new Date(times[a]) - new Date(times[b]));
    return up[0] || null;
  }

  _countdown(iso) {
    const ms = new Date(iso).getTime() - Date.now();
    if (ms <= 0) return "";
    const h = Math.floor(ms / 3600000);
    const m = Math.max(1, Math.round((ms % 3600000) / 60000));
    return `${this.t("in_time")} ${h ? `${h} ${this.t("hours_short")} ` : ""}${m} ${this.t("minutes_short")}`;
  }

  css() {
    return `
      .wrap { padding: 16px; display: grid; gap: 14px; }
      .top { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
      .lead { display: flex; align-items: center; gap: 12px; }
      .badge { width: 46px; height: 46px; border-radius: 14px; display: grid; place-items: center; flex: none;
               background: rgba(${COLORS.green}, .16); color: rgb(${COLORS.green}); }
      .badge ha-icon { --mdc-icon-size: 26px; }
      .label { font-size: 12px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--_text2); }
      .next { font-size: 22px; font-weight: 700; letter-spacing: -.01em; color: var(--_text); font-variant-numeric: tabular-nums; }
      .count { font-size: 13px; color: rgb(${COLORS.green}); font-weight: 600; }
      .hijri { font-size: 13px; color: var(--_text2); text-align: end; }
      .row { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 6px; }
      .p { border-radius: 14px; padding: 10px 4px; text-align: center; background: var(--_muted); }
      .p ha-icon { --mdc-icon-size: 18px; color: var(--_text2); }
      .p .n { font-size: 12px; color: var(--_text2); margin-top: 2px; }
      .p .tm { font-size: 14px; font-weight: 600; color: var(--_text); font-variant-numeric: tabular-nums; }
      .p.past { opacity: .5; }
      .p.now { background: var(--_surface-on); }
      .p.now .n, .p.now .tm { color: var(--_text-on); }
      .p.now ha-icon { color: rgb(${COLORS.green}); }
      .ctrls { display: flex; gap: 8px; flex-wrap: wrap; }
      .c { display: inline-flex; align-items: center; gap: 6px; height: 36px; padding: 0 14px 0 10px; border-radius: 999px;
           border: 1px solid var(--_border); background: transparent; color: var(--_text); font: inherit; font-size: 13px;
           font-weight: 600; cursor: pointer; }
      .c ha-icon { --mdc-icon-size: 18px; color: var(--_text2); }
      .c.on { background: rgba(${COLORS.green}, .16); border-color: rgba(${COLORS.green}, .35); }
      .c.on ha-icon { color: rgb(${COLORS.green}); }
      .c.warn { background: rgba(${COLORS.orange}, .16); border-color: rgba(${COLORS.orange}, .35); }
      .empty { padding: 18px; color: var(--_text2); font-size: 14px; }
      .compact .row { display: none; }
      .panel .next { font-size: 30px; }
      @container (max-width: 380px) { .p .n { font-size: 11px; } .p .tm { font-size: 13px; } .row { gap: 4px; } }
    `;
  }

  render() {
    const d = this._data();
    const c = this._config;
    if (!Object.keys(d.times).length) {
      this.html(`<ha-card><div class="empty">${esc(this.t("prayer_times"))}: Islamic Prayer Times is not set up.</div></ha-card>`);
      return;
    }
    const next = this._next(d.times);
    const lang = this.lang();
    const hijri = lang === "ar" ? d.hijri.formatted_ar : d.hijri.formatted_en;
    const h = d.helpers || {};
    const master = h.master && this.st(h.master);
    const mute = h.mute_next && this.st(h.mute_next);
    const controls = c.show_controls !== false && (master || h.play);
    const now = Date.now();
    this.html(`
      <ha-card class="${esc(c.variant || "default")}">
        <div class="wrap">
          <div class="top">
            <div class="lead">
              <div class="badge"><ha-icon icon="mdi:mosque"></ha-icon></div>
              <div>
                <div class="label">${esc(d.playing ? this.t("adhan_playing") : this.t("next_prayer"))}</div>
                <div class="next">${next ? `${esc(this.t(next))} · ${esc(this._time(d.times[next]))}` : "—"}</div>
                ${next ? `<div class="count">${esc(this._countdown(d.times[next]))}</div>` : ""}
              </div>
            </div>
            ${hijri ? `<div class="hijri">${esc(hijri)}</div>` : ""}
          </div>
          <div class="row">${ORDER.filter((k) => d.times[k]).map((k) => {
            const past = new Date(d.times[k]).getTime() <= now;
            const cls = k === next ? "now" : past ? "past" : "";
            return `<div class="p ${cls}"><ha-icon icon="${ICONS[k]}"></ha-icon><div class="n">${esc(this.t(k))}</div>
              <div class="tm">${esc(this._time(d.times[k]))}</div></div>`;
          }).join("")}</div>
          ${controls ? `<div class="ctrls">
            ${master ? `<button class="c ${master.state === "on" ? "on" : ""}" data-toggle="${esc(h.master)}">
              <ha-icon icon="${master.state === "on" ? "mdi:bell-ring" : "mdi:bell-off"}"></ha-icon>${esc(this.t(master.state === "on" ? "adhan_on" : "adhan_off"))}</button>` : ""}
            ${mute ? `<button class="c ${mute.state === "on" ? "warn" : ""}" data-toggle="${esc(h.mute_next)}">
              <ha-icon icon="mdi:volume-off"></ha-icon>${esc(this.t("mute_next"))}</button>` : ""}
            ${h.play && this.st(h.play) ? `<button class="c" data-press="${esc(d.playing ? h.stop : h.play)}">
              <ha-icon icon="${d.playing ? "mdi:stop" : "mdi:play"}"></ha-icon>${esc(d.playing ? "Stop" : this.t("play_adhan"))}</button>` : ""}
          </div>` : ""}
        </div>
      </ha-card>`);
    this.shadowRoot.querySelectorAll("[data-toggle]").forEach((b) => bindGestures(b, {
      onTap: () => { haptic("light"); this.call("input_boolean.toggle", [b.dataset.toggle]); } }));
    this.shadowRoot.querySelectorAll("[data-press]").forEach((b) => bindGestures(b, {
      onTap: () => { haptic("light"); this.call("input_button.press", [b.dataset.press]); } }));
  }

  getCardSize() {
    return 3;
  }

  getGridOptions() {
    return { columns: 12, min_columns: 6, rows: "auto" };
  }
}
