// custom:ajnetweb-calendar-card - the family agenda: next events from one or more calendars, by day.
//   entities: [calendar.family, calendar.school]   days: 7   max: 6 (events shown)
// Events come from HA's calendar API (GET /api/calendars/<id>), reloaded every 15 minutes and whenever
// a calendar's state changes (an event starts or ends). Each calendar gets its own colour dot.
import { AjnBase, bindGestures, esc } from "../core/base.js";
import { COLORS } from "../core/styles.js";

const DOTS = ["blue", "orange", "green", "purple", "pink", "teal"];
const REFRESH_MS = 15 * 60 * 1000;

export class AjnetwebCalendarCard extends AjnBase {
  static getStubConfig(hass) {
    return { entities: Object.keys(hass.states).filter((e) => e.startsWith("calendar.")).slice(0, 3) };
  }

  validate(config) {
    if (!Array.isArray(config.entities) || !config.entities.length) throw new Error("ajnetweb-calendar-card: 'entities' is required");
  }

  setConfig(config) {
    this._events = undefined;
    super.setConfig(config);
  }

  watched() {
    return this._config.entities;
  }

  connectedCallback() {
    this._timer = setInterval(() => this._load(), REFRESH_MS);
  }

  disconnectedCallback() {
    clearInterval(this._timer);
  }

  async _load() {
    if (!this._hass || typeof this._hass.callApi !== "function" || this._loading) return;
    this._loading = true;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start.getTime() + (Number(this._config.days) || 7) * 86400000);
    const q = `start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`;
    const lists = await Promise.all(this._config.entities.map((id, i) =>
      this._hass.callApi("GET", `calendars/${id}?${q}`)
        .then((evs) => (evs || []).map((e) => ({ ...e, cal: id, dot: COLORS[DOTS[i % DOTS.length]] })))
        .catch(() => [])));
    const when = (x) => (x && (x.dateTime || x.date)) || x;
    this._events = lists.flat().map((e) => {
      const allDay = !!(e.start && e.start.date && !e.start.dateTime);
      // all-day dates are local dates ("2026-10-20"), not UTC midnight
      const s = allDay ? new Date(`${e.start.date}T00:00:00`) : new Date(when(e.start));
      const f = allDay ? new Date(`${e.end.date}T00:00:00`) : new Date(when(e.end));
      return { ...e, allDay, s, f };
    }).filter((e) => !isNaN(e.s) && e.f > new Date()).sort((a, b) => a.s - b.s);
    this._loadedFor = this._snapshotKey();
    this._loading = false;
    this.render();
  }

  _snapshotKey() {
    return this._config.entities.map((id) => { const s = this.st(id); return s ? s.last_changed : ""; }).join("|");
  }

  css() {
    return `
      .wrap { padding: 14px 16px; display: grid; gap: 10px; }
      h3 { margin: 0; font-size: 12px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--_text2);
           display: flex; align-items: center; gap: 6px; }
      h3 ha-icon { --mdc-icon-size: 16px; }
      .day { display: grid; gap: 6px; }
      .dn { font-size: 12px; font-weight: 700; color: var(--_text2); }
      .dn.today { color: var(--_accent); }
      .ev { display: grid; grid-template-columns: 4px minmax(0, 1fr) auto; gap: 10px; align-items: center; padding: 8px 10px;
            border-radius: 12px; background: var(--_muted); }
      .ev i { align-self: stretch; border-radius: 2px; background: rgb(var(--c)); }
      .ev .t { font-size: 14px; font-weight: 600; color: var(--_text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .ev .s { font-size: 12px; color: var(--_text2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .ev .h { font-size: 12px; color: var(--_text2); font-variant-numeric: tabular-nums; text-align: end; white-space: nowrap; }
      .ev.now { background: rgba(var(--c), .16); }
      .ev.now .h { color: rgb(var(--c)); font-weight: 700; }
      .empty { display: grid; place-items: center; gap: 6px; padding: 14px 0; font-size: 13px; color: var(--_text2); text-align: center; }
      .empty ha-icon { --mdc-icon-size: 32px; color: var(--_accent); opacity: .7; }
      .more { font-size: 12px; color: var(--_text2); }
    `;
  }

  render() {
    if (this._events === undefined || (this._loadedFor !== undefined && this._loadedFor !== this._snapshotKey())) {
      if (this._events === undefined) this._events = null;
      this._load();
    }
    const lang = this.lang();
    const evs = this._events || [];
    const max = Number(this._config.max) || 6;
    const shown = evs.slice(0, max);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const dayKey = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); };
    const days = new Map();
    // an event that started earlier and is still running shows under today
    shown.forEach((e) => { const k = Math.max(dayKey(e.s), today.getTime()); if (!days.has(k)) days.set(k, []); days.get(k).push(e); });
    const dayName = (k) => {
      const diff = Math.round((k - today.getTime()) / 86400000);
      if (diff === 0) return this.t("today");
      if (diff === 1) return this.t("tomorrow");
      return new Date(k).toLocaleDateString(lang, { weekday: "long", day: "numeric", month: "short" });
    };
    const time = (d) => d.toLocaleTimeString(lang, { hour: "numeric", minute: "2-digit" });
    const now = new Date();
    this.html(`
      <ha-card>
        <div class="wrap">
          <h3><ha-icon icon="mdi:calendar-month"></ha-icon>${esc(this._config.title || this.t("agenda"))}</h3>
          ${this._events === null ? `<div class="empty">…</div>` : shown.length ? [...days.entries()].map(([k, list]) => `
            <div class="day"><div class="dn ${k === today.getTime() ? "today" : ""}">${esc(dayName(k))}</div>
              ${list.map((e) => {
                const running = e.s <= now && e.f > now;
                return `<div class="ev tap ${running ? "now" : ""}" style="--c:${e.dot}" data-cal="${esc(e.cal)}" tabindex="0" role="button">
                  <i></i><div style="min-width:0"><div class="t">${esc(e.summary || "")}</div>${e.location ? `<div class="s">${esc(e.location)}</div>` : ""}</div>
                  <div class="h">${esc(e.allDay ? this.t("all_day") : running ? this.t("now") : time(e.s))}</div></div>`;
              }).join("")}</div>`).join("")
            + (evs.length > shown.length ? `<div class="more">+${evs.length - shown.length} ${esc(this.t("more_events"))}</div>` : "")
          : `<div class="empty"><ha-icon icon="mdi:calendar-check"></ha-icon>${esc(this.t("nothing_planned"))}</div>`}
        </div>
      </ha-card>`);
    this.shadowRoot.querySelectorAll(".ev").forEach((el) => bindGestures(el, { onTap: () => this.moreInfo(el.dataset.cal) }));
  }

  getCardSize() {
    return 4;
  }

  getGridOptions() {
    return { columns: 12, min_columns: 6, rows: "auto" };
  }
}
