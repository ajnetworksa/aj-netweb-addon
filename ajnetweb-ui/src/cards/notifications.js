// custom:ajnetweb-notifications-card - what happened at home: doorbell rings, alarm changes, water leaks,
// smoke and gas, gates and doors opened. Newest first, grouped by day; tap an entry for its details.
//   doorbell: sensor.ajnetweb_doorbell   alarms: [alarm_control_panel.*]
//   safety: [binary_sensor.*]            openings: [binary_sensor.*]      (the strategy fills these)
//   hours: 48   max: 60
// Reads HA's logbook (logbook/get_events), which every user may read. The header's bell shows how many
// entries are new since this person last opened the list (remembered in this browser).
import { AjnBase, bindGestures, esc } from "../core/base.js";
import { COLORS } from "../core/styles.js";

const STR = {
  en: { title: "Notifications", empty: "Nothing happened in the last {h} hours", rang: "Doorbell rang",
        leak: "Water detected", smoke: "Smoke detected", gas: "Gas detected", alert: "Alert", opened: "Opened",
        triggered: "Alarm triggered", armed: "Alarm armed", disarmed: "Alarm disarmed", today: "Today", yesterday: "Yesterday" },
  ar: { title: "الإشعارات", empty: "لم يحدث شيء خلال آخر {h} ساعة", rang: "رنّ جرس الباب",
        leak: "تسرب مياه", smoke: "دخان", gas: "غاز", alert: "تنبيه", opened: "فُتح",
        triggered: "انطلق الإنذار", armed: "تم تفعيل الإنذار", disarmed: "تم إيقاف الإنذار", today: "اليوم", yesterday: "أمس" },
};

const SEEN_KEY = "ajn-notif-seen";

/** Every entity a notifications config looks at. */
export function notifEntities(c) {
  return [c.doorbell, ...(c.alarms || []), ...(c.safety || []), ...(c.openings || [])].filter(Boolean);
}

/** Logbook rows -> entries we show: { when (ms), entity_id, kind, state }. */
export function toEntries(rows, c) {
  const alarms = new Set(c.alarms || []), safety = new Set(c.safety || []), openings = new Set(c.openings || []);
  const out = [];
  (rows || []).forEach((r) => {
    const id = r.entity_id;
    const when = typeof r.when === "number" ? r.when * 1000 : Date.parse(r.when);
    if (!id || !Number.isFinite(when)) return;
    let kind = null;
    if (id === c.doorbell && r.state === "ringing") kind = "doorbell";
    else if (alarms.has(id) && (r.state === "triggered" || r.state === "disarmed" || String(r.state).startsWith("armed_"))) kind = "alarm";
    else if (safety.has(id) && r.state === "on") kind = "safety";
    else if (openings.has(id) && r.state === "on") kind = "opening";
    if (kind) out.push({ when, entity_id: id, kind, state: r.state });
  });
  return out.sort((a, b) => b.when - a.when);
}

export async function fetchEntries(hass, c) {
  const ids = notifEntities(c);
  if (!ids.length || !hass.callWS) return [];
  const start = new Date(Date.now() - (Number(c.hours) || 48) * 3600000);
  const rows = await hass.callWS({ type: "logbook/get_events", start_time: start.toISOString(),
    end_time: new Date().toISOString(), entity_ids: ids });
  return toEntries(rows, c).slice(0, Number(c.max) || 60);
}

function seenKey(hass) {
  return `${SEEN_KEY}-${(hass.user && hass.user.id) || "me"}`;
}

export function lastSeen(hass) {
  try { return Number(localStorage.getItem(seenKey(hass))) || 0; } catch (e) { return 0; }
}

export function markSeen(hass) {
  try { localStorage.setItem(seenKey(hass), String(Date.now())); } catch (e) { /* private mode */ }
  window.dispatchEvent(new CustomEvent("ajn-notifications-seen"));
}

export class AjnetwebNotificationsCard extends AjnBase {
  static getStubConfig() {
    return {};
  }

  setConfig(config) {
    this._entries = undefined;
    super.setConfig(config);
  }

  watched() {
    return notifEntities(this._config);
  }

  async _load() {
    if (this._loading) return;
    this._loading = true;
    try {
      this._entries = await fetchEntries(this._hass, this._config);
    } catch (e) {
      this._entries = [];
    }
    this._loading = false;
    this._loadedAt = Date.now();
    this._seenBefore = lastSeen(this._hass);
    markSeen(this._hass);
    this.render();
  }

  s(key) {
    return (STR[this.lang()] || STR.en)[key] || STR.en[key] || key;
  }

  _text(e) {
    const st = this.st(e.entity_id);
    const name = (st && st.attributes.friendly_name) || e.entity_id;
    const dc = st && st.attributes.device_class;
    if (e.kind === "doorbell") return [this.s("rang"), ""];
    if (e.kind === "alarm") return [this.s(e.state === "triggered" ? "triggered" : e.state === "disarmed" ? "disarmed" : "armed"), name];
    if (e.kind === "safety") return [this.s(dc === "moisture" ? "leak" : dc === "smoke" ? "smoke" : dc === "gas" ? "gas" : "alert"), name];
    return [this.s("opened"), name];
  }

  css() {
    return `
      .wrap { padding: 18px; display: grid; gap: 14px; }
      h2 { margin: 0; font-size: 20px; font-weight: 700; color: var(--_text); padding-inline-end: 48px; }
      .day { font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--_text2); margin: 6px 0 -4px; }
      .list { display: grid; gap: 8px; }
      .it { display: grid; grid-template-columns: 38px 1fr auto; gap: 12px; align-items: center; padding: 10px 12px;
            border-radius: 14px; background: var(--_muted); cursor: pointer; }
      .it.new { box-shadow: inset 3px 0 0 rgb(var(--c)); }
      :host([dir=rtl]) .it.new { box-shadow: inset -3px 0 0 rgb(var(--c)); }
      .ic { width: 38px; height: 38px; border-radius: 12px; display: grid; place-items: center; background: rgba(var(--c), .16); color: rgb(var(--c)); }
      .ic ha-icon { --mdc-icon-size: 20px; }
      .tx b { display: block; font-size: 14px; font-weight: 600; color: var(--_text); }
      .tx span { font-size: 12px; color: var(--_text2); }
      .tm { font-size: 12px; color: var(--_text2); font-variant-numeric: tabular-nums; }
      .empty { font-size: 14px; color: var(--_text2); padding: 18px 0; text-align: center; }
    `;
  }

  render() {
    if (this._entries === undefined) { this._entries = null; this._load(); }
    else if (this._loadedAt && Date.now() - this._loadedAt > 5000) this._load();   // something changed while open
    const lang = this.lang();
    this.setAttribute("dir", lang === "ar" ? "rtl" : "ltr");
    const style = { doorbell: ["mdi:doorbell-video", COLORS.blue], alarm: ["mdi:shield-alert", COLORS.red],
                    safety: ["mdi:alert", COLORS.red], opening: ["mdi:door-open", COLORS.orange] };
    let body = "";
    if (this._entries === null) body = `<div class="empty">…</div>`;
    else if (!this._entries.length) body = `<div class="empty">${esc(this.s("empty").replace("{h}", Number(this._config.hours) || 48))}</div>`;
    else {
      const today = new Date().toDateString();
      const yest = new Date(Date.now() - 86400000).toDateString();
      let lastDay = "";
      body = this._entries.map((e) => {
        const d = new Date(e.when);
        const day = d.toDateString();
        const head = day !== lastDay ? `<div class="day">${esc(day === today ? this.s("today") : day === yest ? this.s("yesterday")
          : d.toLocaleDateString(lang, { weekday: "long", day: "numeric", month: "short" }))}</div>` : "";
        lastDay = day;
        const [icon, c] = style[e.kind];
        const [title, sub] = this._text(e);
        const alarmIcon = e.kind === "alarm" && e.state !== "triggered" ? (e.state === "disarmed" ? "mdi:shield-off-outline" : "mdi:shield-lock") : icon;
        return `${head}<div class="it tap ${e.when > this._seenBefore ? "new" : ""}" style="--c:${e.kind === "alarm" && e.state !== "triggered" ? COLORS.green : c}"
          data-entity="${esc(e.entity_id)}" role="button" tabindex="0">
          <div class="ic"><ha-icon icon="${alarmIcon}"></ha-icon></div>
          <div class="tx"><b>${esc(title)}</b>${sub ? `<span>${esc(sub)}</span>` : ""}</div>
          <div class="tm">${esc(d.toLocaleTimeString(lang, { hour: "numeric", minute: "2-digit" }))}</div></div>`;
      }).join("");
      body = `<div class="list">${body}</div>`;
    }
    this.html(`<ha-card><div class="wrap"><h2>${esc(this._config.title || this.s("title"))}</h2>${body}</div></ha-card>`);
    this.shadowRoot.querySelectorAll("[data-entity]").forEach((el) => bindGestures(el, { onTap: () => this.moreInfo(el.dataset.entity) }));
  }

  getCardSize() {
    return 6;
  }
}
