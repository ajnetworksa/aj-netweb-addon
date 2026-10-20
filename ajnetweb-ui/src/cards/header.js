// custom:ajnetweb-header-card - greeting, clock, weather, alarm, people and live status chips.
//   chips: [{ icon, entities, active | inactive, label, ok_label, ok_icon, color, navigation_path }]
//   variant: default | panel (large clock for wall tablets)
//   image: optional background image URL for a hero header
//   appearance: true -> palette button that opens the personal appearance picker
//   notifications: { doorbell, alarms, safety, openings } -> bell with a count of new events; opens the list
//   (palette / appearance_themes are passed on to it)
import { AjnBase, bindGestures, cssUrl, esc, formatState } from "../core/base.js";
import { openAppearance, openCardSheet } from "./appearance.js";
import { fetchEntries, lastSeen, notifEntities } from "./notifications.js";
import { COLORS } from "../core/styles.js";

export const WEATHER_ICONS = {
  "clear-night": "mdi:weather-night", cloudy: "mdi:weather-cloudy", exceptional: "mdi:alert-circle-outline",
  fog: "mdi:weather-fog", hail: "mdi:weather-hail", lightning: "mdi:weather-lightning",
  "lightning-rainy": "mdi:weather-lightning-rainy", partlycloudy: "mdi:weather-partly-cloudy",
  pouring: "mdi:weather-pouring", rainy: "mdi:weather-rainy", snowy: "mdi:weather-snowy",
  "snowy-rainy": "mdi:weather-snowy-rainy", sunny: "mdi:weather-sunny", windy: "mdi:weather-windy",
  "windy-variant": "mdi:weather-windy-variant",
};
const ALARM_ICONS = {
  disarmed: "mdi:shield-off-outline", armed_home: "mdi:shield-home", armed_away: "mdi:shield-lock",
  armed_night: "mdi:shield-moon", armed_vacation: "mdi:shield-airplane", armed_custom_bypass: "mdi:shield-star",
  pending: "mdi:shield-sync", arming: "mdi:shield-sync", triggered: "mdi:bell-ring",
};
const OFF = ["unavailable", "unknown"];

export class AjnetwebHeaderCard extends AjnBase {
  static getStubConfig() {
    return { title: "Home" };
  }

  watched() {
    const c = this._config;
    const ids = [c.weather, c.alarm, ...(c.persons || [])];
    (c.chips || []).forEach((chip) => ids.push(...(chip.entities || [])));
    if (c.notifications) ids.push(...notifEntities(c.notifications));
    return ids.filter(Boolean);
  }

  connectedCallback() {
    this._timer = setInterval(() => this._tick(), 15000);
    this._onSeen = () => { this._unseen = 0; this._badge(); };
    window.addEventListener("ajn-notifications-seen", this._onSeen);
  }

  disconnectedCallback() {
    clearInterval(this._timer);
    window.removeEventListener("ajn-notifications-seen", this._onSeen);
  }

  /** Count the events since this person last opened the list (at most every few seconds). */
  async _countNew() {
    const n = this._config.notifications;
    if (!n || this._counting || Date.now() - (this._countedAt || 0) < 3000) return;
    this._counting = true;
    try {
      const seen = lastSeen(this._hass);
      this._unseen = (await fetchEntries(this._hass, n)).filter((e) => e.when > seen).length;
    } catch (e) {
      this._unseen = 0;
    }
    this._counting = false;
    this._countedAt = Date.now();
    this._badge();
  }

  _badge() {
    const b = this.shadowRoot && this.shadowRoot.querySelector(".badge");
    if (!b) return;
    b.textContent = this._unseen > 9 ? "9+" : String(this._unseen || "");
    b.hidden = !this._unseen;
  }

  _greeting() {
    const h = new Date().getHours();
    if (h < 5) return this.t("night");
    if (h < 12) return this.t("morning");
    if (h < 18) return this.t("afternoon");
    return this.t("evening");
  }

  _tick() {
    if (!this.shadowRoot || !this._hass) return;
    const loc = this._hass.locale || {};
    const lang = loc.language || undefined;
    const opts = { hour: "numeric", minute: "2-digit" };
    if (loc.time_format === "12") opts.hour12 = true;
    if (loc.time_format === "24") opts.hour12 = false;
    const now = new Date();
    const set = (sel, txt) => { const el = this.shadowRoot.querySelector(sel); if (el) el.textContent = txt; };
    try {
      set(".time", now.toLocaleTimeString(lang, opts));
      set(".date", now.toLocaleDateString(lang, { weekday: "long", day: "numeric", month: "short" }));
    } catch (e) {
      set(".time", now.toLocaleTimeString());
      set(".date", now.toLocaleDateString());
    }
    set(".greet", this._greeting());
  }

  _chips() {
    const out = [];
    const alarm = this.st(this._config.alarm);
    if (alarm) {
      out.push({ icon: ALARM_ICONS[alarm.state] || "mdi:shield", text: formatState(this._hass, alarm),
                 color: alarm.state === "triggered" ? "red" : alarm.state === "disarmed" ? "orange" : "green",
                 nav: this._config.alarm_navigation_path, entity: alarm.entity_id, active: true });
    }
    (this._config.chips || []).forEach((chip) => {
      const count = (chip.entities || []).map((id) => this.st(id)).filter((s) => {
        if (!s || OFF.includes(s.state)) return false;
        if (chip.active) return chip.active.includes(s.state);
        if (chip.inactive) return !chip.inactive.includes(s.state);
        return s.state === "on";
      }).length;
      if (count > 0) {
        out.push({ icon: chip.icon, text: `${count} ${this.t(chip.label, count)}`, color: chip.color,
                   nav: chip.navigation_path, active: true });
      } else if (chip.ok_label) {
        out.push({ icon: chip.ok_icon || chip.icon, text: this.t(chip.ok_label), color: "green",
                   nav: chip.navigation_path, active: false });
      }
    });
    return out;
  }

  css() {
    const panel = this._config.variant === "panel";
    return `
      ha-card { position: relative; border: none; background: transparent; box-shadow: none;
                -webkit-backdrop-filter: none; backdrop-filter: none; }
      ha-card.hero { background: var(--_hero) center/cover; color: #fff; border-radius: var(--_radius); }
      ha-card.hero::before { content: ""; position: absolute; inset: 0; border-radius: inherit;
                             background: linear-gradient(90deg, rgba(0,0,0,.55), rgba(0,0,0,.1)); }
      /* phone: clock + side on top, chips below. Wide: one tidy row - clock | chips | people + weather */
      .wrap { position: relative; display: grid; gap: 12px 18px; padding: 4px 2px;
              grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: "clock side" "chips chips"; align-items: center; }
      .hero .wrap { padding: 20px 22px; }
      .clock { grid-area: clock; min-width: 0; }
      .side { grid-area: side; display: flex; align-items: center; gap: 10px; justify-self: end; }
      .row { grid-area: chips; display: flex; gap: 8px; align-items: center; overflow-x: auto; scrollbar-width: none; padding: 2px; min-width: 0; }
      .row::-webkit-scrollbar { display: none; }
      @container (min-width: 880px) {
        .wrap { grid-template-columns: auto minmax(0, 1fr) auto; grid-template-areas: "clock chips side"; }
        .row { flex-wrap: wrap; overflow: visible; justify-content: flex-start; padding-inline-start: 18px;
               border-inline-start: 1px solid var(--_border); min-height: 48px; }
        .hero .row { border-color: rgba(255,255,255,.25); }
      }
      .eyebrow { font-size: 11px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: var(--_accent); }
      .hero .eyebrow { color: #fff; opacity: .85; }
      .line { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
      .time { font-size: ${panel ? "56px" : "40px"}; font-weight: 250; line-height: 1; letter-spacing: -.04em; white-space: nowrap;
              color: var(--_text); font-variant-numeric: tabular-nums; margin: 2px 0; }
      .hero .time { color: #fff; }
      .meta { display: grid; gap: 1px; }
      .date { font-size: 14px; font-weight: 600; color: var(--_text); }
      .greet { font-size: 13px; color: var(--_text2); }
      .hero .greet, .hero .date { color: rgba(255,255,255,.88); }
      .weather { display: flex; align-items: center; gap: 10px; height: 48px; padding: 0 14px 0 10px; border-radius: 16px;
                 background: var(--_surface); border: 1px solid var(--_border); color: var(--_text);
                 -webkit-backdrop-filter: blur(var(--_blur)); backdrop-filter: blur(var(--_blur)); }
      .hero .weather { background: rgba(255,255,255,.16); border-color: rgba(255,255,255,.2); color: #fff; }
      .weather ha-icon { --mdc-icon-size: 28px; color: var(--_accent); }
      .hero .weather ha-icon { color: #fff; }
      .wtemp { font-size: 18px; font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1.1; }
      .wcond { font-size: 11px; color: var(--_text2); white-space: nowrap; }
      .hero .wcond { color: rgba(255,255,255,.8); }
      .chip { flex: none; display: inline-flex; align-items: center; gap: 7px; height: 36px; padding: 0 13px 0 10px;
              border-radius: 999px; font-size: 13px; font-weight: 600; color: var(--_text); white-space: nowrap;
              background: var(--_surface); border: 1px solid var(--_border);
              -webkit-backdrop-filter: blur(var(--_blur)); backdrop-filter: blur(var(--_blur)); }
      .chip ha-icon { --mdc-icon-size: 18px; color: rgb(var(--chip-rgb)); }
      .chip.on { background: rgba(var(--chip-rgb), .14); border-color: rgba(var(--chip-rgb), .32); }
      .persons { display: flex; padding-inline-start: 6px; }
      .person { width: 34px; height: 34px; border-radius: 50%; overflow: hidden; display: grid; place-items: center; flex: none;
                margin-inline-start: -6px; box-sizing: border-box; border: 2px solid var(--_border);
                background: var(--_surface-on); color: var(--_text-on); font-size: 11px; font-weight: 700;
                filter: grayscale(1); opacity: .55; }
      .person.home { filter: none; opacity: 1; border-color: rgb(${COLORS.green}); }
      .person img { width: 100%; height: 100%; object-fit: cover; }
      .more { margin-inline-start: -6px; width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center;
              background: var(--_muted); color: var(--_text2); font-size: 11px; font-weight: 700; border: 2px solid var(--_border); box-sizing: border-box; }
      .me { flex: none; width: 38px; height: 38px; border-radius: 50%; display: grid; place-items: center;
            background: var(--_grad); color: #fff; box-shadow: inset 0 1px 0 rgba(255,255,255,.35), 0 4px 14px var(--ajn-glow, rgba(0,0,0,.2)); }
      .me ha-icon { --mdc-icon-size: 20px; }
      .bell { position: relative; background: var(--_muted); color: var(--_text); box-shadow: none; }
      .badge { position: absolute; top: -4px; inset-inline-end: -4px; min-width: 18px; height: 18px; padding: 0 5px; box-sizing: border-box;
               border-radius: 9px; background: rgb(${COLORS.red}); color: #fff; font-size: 11px; font-weight: 700; line-height: 18px; text-align: center; }
      @container (min-width: 880px) { .nowx .weather { display: none; } }
      .row .persons { display: none; margin-inline-start: auto; }
      @container (max-width: 560px) { .side .persons { display: none; } .row .persons { display: flex; } }
      @container (max-width: 420px) { .time { font-size: ${panel ? "46px" : "36px"}; } .wcond { display: none; } }
    `;
  }

  render() {
    const c = this._config;
    const w = this.st(c.weather);
    let weather = "";
    if (w) {
      const temp = w.attributes.temperature;
      const unit = w.attributes.temperature_unit || "°";
      weather = `<div class="weather tap" data-entity="${esc(w.entity_id)}" tabindex="0" role="button">
        <ha-icon icon="${WEATHER_ICONS[w.state] || "mdi:weather-partly-cloudy"}"></ha-icon>
        <div><div class="wtemp">${temp != null ? esc(Math.round(temp)) + esc(unit) : "--"}</div>
        <div class="wcond">${esc(formatState(this._hass, w))}</div></div></div>`;
    }
    const all = (c.persons || []).map((id) => this.st(id)).filter(Boolean)
      .sort((a, b) => (b.state === "home") - (a.state === "home"));
    const persons = all.slice(0, 4).map((p) => {
      const pic = p.attributes.entity_picture;
      const initials = String(p.attributes.friendly_name || p.entity_id).split(/\s+/).map((x) => x[0]).join("").slice(0, 2).toUpperCase();
      return `<div class="person tap ${p.state === "home" ? "home" : ""}" data-entity="${esc(p.entity_id)}"
        title="${esc(p.attributes.friendly_name)} · ${esc(formatState(this._hass, p))}">
        ${pic ? `<img src="${esc(pic)}" alt="">` : esc(initials)}</div>`;
    }).join("") + (all.length > 4 ? `<div class="more">+${all.length - 4}</div>` : "");
    const chips = this._chips().map((ch) => `
      <div class="chip tap ${ch.active ? "on" : ""}" tabindex="0" role="button" style="--chip-rgb:${COLORS[ch.color] || COLORS.blue}"
           ${ch.nav ? `data-nav="${esc(ch.nav)}"` : ""} ${ch.entity ? `data-entity="${esc(ch.entity)}"` : ""}>
        <ha-icon icon="${esc(ch.icon)}"></ha-icon>${esc(ch.text)}</div>`).join("");
    const bell = c.notifications
      ? `<div class="me bell tap" data-bell tabindex="0" role="button" aria-label="${esc(this.t("notifications"))}" title="${esc(this.t("notifications"))}">
          <ha-icon icon="mdi:bell-outline"></ha-icon><span class="badge" hidden></span></div>` : "";
    const meBtn = c.appearance
      ? `<div class="me tap" data-appearance tabindex="0" role="button" aria-label="${esc(this.t("appearance"))}" title="${esc(this.t("appearance"))}"><ha-icon icon="mdi:palette"></ha-icon></div>` : "";

    this.html(`
      <ha-card class="${c.image ? "hero" : ""}" ${c.image ? `style="--_hero:${esc(cssUrl(c.image))}"` : ""}>
        <div class="wrap ${c.weather_wide === false ? "nowx" : ""}">
          <div class="clock">
            ${c.title ? `<div class="eyebrow">${esc(c.title)}</div>` : ""}
            <div class="line"><div class="time"></div><div class="meta"><div class="date"></div><div class="greet"></div></div></div>
          </div>
          ${chips || persons ? `<div class="row">${chips}${persons ? `<div class="persons">${persons}</div>` : ""}</div>` : ""}
          <div class="side">${persons ? `<div class="persons">${persons}</div>` : ""}${weather}${bell}${meBtn}</div>
        </div>
      </ha-card>`);
    this._tick();
    this._badge();
    if (c.notifications) {
      // count again only when one of the watched sensors changed, not on every light switch
      const snap = notifEntities(c.notifications).map((id) => this._hass.states[id]);
      if (!this._nsnap || snap.some((v, i) => v !== this._nsnap[i])) {
        this._nsnap = snap;
        this._countedAt = 0;
        setTimeout(() => this._countNew(), 1500);   // the logbook needs a moment to record it
      }
      bindGestures(this.shadowRoot.querySelector("[data-bell]"), { onTap: () => openCardSheet(this, this._hass,
        "ajnetweb-notifications-card", { ...c.notifications, ...(c.language ? { language: c.language } : {}) }) });
    }
    const me = this.shadowRoot.querySelector("[data-appearance]");
    if (me) {
      bindGestures(me, { onTap: () => openAppearance(this, this._hass,
        { palette: c.palette, wallpaper: c.wallpaper, themes: c.appearance_themes, ...(c.language ? { language: c.language } : {}) }) });
    }
    this.shadowRoot.querySelectorAll("[data-nav],[data-entity]").forEach((el) => {
      bindGestures(el, { onTap: () => (el.dataset.nav ? this.navigate(el.dataset.nav) : this.moreInfo(el.dataset.entity)) });
    });
  }

  getCardSize() {
    return 3;
  }

  getGridOptions() {
    return { columns: "full", min_columns: 6, rows: "auto" };
  }
}
