// custom:ajnetweb-status-card - "Right now": only what needs attention at this moment.
//   openings / safety / lights / climates / media / batteries / devices: [entity ids]  (the strategy fills them)
//   timers: true (default) - running HA timers (washer, sprinklers, ...) with time left
//   navigation: { security, lights, climate, media, installer }   where a row leads to
// Rows appear and disappear with the home's state. With nothing to report it says so.
import { AjnBase, OFFLINE, bindGestures, esc } from "../core/base.js";
import { COLORS } from "../core/styles.js";

const STR = {
  en: { title: "Right now", all_good: "All good", all_good_sub: "Everything is closed and running normally",
        open: "Open", alert: "Alert", lights: ["light on", "lights on"], ac: ["AC running", "ACs running"],
        playing: "Playing", battery: ["low battery", "low batteries"], offline: ["device offline", "devices offline"],
        left: "left", more: "more" },
  ar: { title: "الآن", all_good: "كل شيء على ما يرام", all_good_sub: "كل شيء مغلق ويعمل بشكل طبيعي",
        open: "مفتوح", alert: "تنبيه", lights: ["إضاءة تعمل", "إضاءة تعمل"], ac: ["مكيف يعمل", "مكيفات تعمل"],
        playing: "قيد التشغيل", battery: ["بطارية منخفضة", "بطاريات منخفضة"], offline: ["جهاز غير متصل", "أجهزة غير متصلة"],
        left: "متبقي", more: "أخرى" },
};

const names = (sts, max = 2, more = "more") => {
  const n = sts.map((s) => s.attributes.friendly_name || s.entity_id);
  return n.length > max ? `${n.slice(0, max).join(", ")} +${n.length - max} ${more}` : n.join(", ");
};

export class AjnetwebStatusCard extends AjnBase {
  static getStubConfig() {
    return {};
  }

  watched() {
    const c = this._config;
    const ids = ["openings", "safety", "lights", "climates", "media", "batteries", "devices"].flatMap((k) => c[k] || []);
    if (c.timers !== false && this._hass) ids.push(...Object.keys(this._hass.states).filter((id) => id.startsWith("timer.")));
    return ids;
  }

  connectedCallback() {
    this._clock = setInterval(() => { if (this._hasTimers) this.render(); }, 30000);
  }

  disconnectedCallback() {
    clearInterval(this._clock);
  }

  _s(key, n) {
    const d = STR[this.lang()] || STR.en;
    const v = d[key] != null ? d[key] : STR.en[key];
    return Array.isArray(v) ? v[n === 1 ? 0 : 1] : v;
  }

  _rows() {
    const c = this._config;
    const nav = c.navigation || {};
    const sts = (k) => (c[k] || []).map((id) => this.st(id)).filter(Boolean);
    const rows = [];
    const alerts = sts("safety").filter((s) => s.state === "on");
    if (alerts.length) rows.push({ icon: "mdi:alert", color: COLORS.red, title: `${this._s("alert")}: ${names(alerts, 2, this._s("more"))}`, nav: nav.security, entity: alerts[0].entity_id });
    const open = sts("openings").filter((s) => s.state === "on");
    if (open.length) rows.push({ icon: "mdi:door-open", color: COLORS.orange, title: `${this._s("open")}: ${names(open, 2, this._s("more"))}`, nav: nav.security, entity: open.length === 1 ? open[0].entity_id : null });
    // running timers (washer, sprinklers, ...): soonest first
    this._hasTimers = false;
    if (c.timers !== false) {
      Object.values(this._hass.states).filter((s) => s.entity_id.startsWith("timer.") && s.state === "active")
        .map((s) => ({ s, left: s.attributes.finishes_at ? (new Date(s.attributes.finishes_at) - Date.now()) / 60000 : null }))
        .sort((a, b) => (a.left ?? 1e9) - (b.left ?? 1e9)).slice(0, 3)
        .forEach(({ s, left }) => {
          this._hasTimers = true;
          rows.push({ icon: s.attributes.icon || "mdi:timer-outline", color: COLORS.teal, title: s.attributes.friendly_name || s.entity_id,
                      sub: left != null ? `${Math.max(0, Math.ceil(left))} min ${this._s("left")}` : "", entity: s.entity_id });
        });
    }
    const lights = sts("lights").filter((s) => s.state === "on");
    if (lights.length) rows.push({ icon: "mdi:lightbulb-on", color: COLORS.amber, title: `${lights.length} ${this._s("lights", lights.length)}`, sub: names(lights, 3, this._s("more")), nav: nav.lights });
    const acs = sts("climates").filter((s) => !OFFLINE.includes(s.state) && s.state !== "off");
    if (acs.length) rows.push({ icon: "mdi:snowflake", color: COLORS.blue, title: `${acs.length} ${this._s("ac", acs.length)}`, sub: names(acs, 3, this._s("more")), nav: nav.climate });
    const playing = sts("media").filter((s) => s.state === "playing");
    if (playing.length) rows.push({ icon: "mdi:music", color: COLORS.purple, title: `${this._s("playing")}: ${names(playing, 2, this._s("more"))}`,
                                    sub: playing[0].attributes.media_title || "", nav: nav.media });
    const low = sts("batteries").filter((s) => { const v = parseFloat(s.state); return Number.isFinite(v) && v <= 20; });
    if (low.length) rows.push({ icon: "mdi:battery-alert", color: COLORS.orange, title: `${low.length} ${this._s("battery", low.length)}`, sub: names(low, 3, this._s("more")), nav: nav.installer });
    const off = sts("devices").filter((s) => s.state === "unavailable");
    if (off.length) rows.push({ icon: "mdi:lan-disconnect", color: COLORS.grey, title: `${off.length} ${this._s("offline", off.length)}`, sub: names(off, 3, this._s("more")), nav: nav.installer });
    return rows;
  }

  css() {
    return `
      .wrap { padding: 14px 16px; display: grid; gap: 4px; }
      h3 { margin: 0 0 6px; font-size: 12px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--_text2); }
      .r { display: grid; grid-template-columns: 34px minmax(0, 1fr); gap: 10px; align-items: center; padding: 6px 4px; border-radius: 12px; }
      .r.tap:hover { background: var(--_muted); }
      .i { width: 34px; height: 34px; border-radius: 11px; display: grid; place-items: center; background: rgba(var(--c), .15); color: rgb(var(--c)); }
      .i ha-icon { --mdc-icon-size: 19px; }
      .t { font-size: 14px; font-weight: 600; color: var(--_text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .s { font-size: 12px; color: var(--_text2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .good { display: grid; place-items: center; text-align: center; gap: 6px; padding: 18px 8px; }
      .good ha-icon { --mdc-icon-size: 40px; color: rgb(${COLORS.green}); }
      .good b { font-size: 16px; color: var(--_text); } .good span { font-size: 12px; color: var(--_text2); }
    `;
  }

  render() {
    const rows = this._rows();
    const max = Number(this._config.max_rows) || 6;
    this.html(`
      <ha-card>
        <div class="wrap">
          <h3>${esc(this._s("title"))}</h3>
          ${rows.length ? rows.slice(0, max).map((r, i) => `
            <div class="r ${r.nav || r.entity ? "tap" : ""}" data-i="${i}" style="--c:${r.color}" ${r.nav || r.entity ? 'tabindex="0" role="button"' : ""}>
              <div class="i"><ha-icon icon="${esc(r.icon)}"></ha-icon></div>
              <div style="min-width:0"><div class="t">${esc(r.title)}</div>${r.sub ? `<div class="s">${esc(r.sub)}</div>` : ""}</div>
            </div>`).join("")
          : `<div class="good"><ha-icon icon="mdi:shield-check"></ha-icon><b>${esc(this._s("all_good"))}</b><span>${esc(this._s("all_good_sub"))}</span></div>`}
        </div>
      </ha-card>`);
    this.shadowRoot.querySelectorAll(".r.tap").forEach((el) => {
      const r = rows[+el.dataset.i];
      bindGestures(el, { onTap: () => (r.entity && !r.nav ? this.moreInfo(r.entity) : r.nav ? this.navigate(r.nav) : this.moreInfo(r.entity)) });
    });
  }

  getCardSize() {
    return 4;
  }

  getGridOptions() {
    return { columns: 12, rows: "auto" };
  }
}
