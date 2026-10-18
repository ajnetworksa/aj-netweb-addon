// custom:ajnetweb-header-card - greeting, clock, weather, alarm, people and live status chips.
//   chips: [{ icon, entities, active | inactive, label, ok_label, ok_icon, color, navigation_path }]
//   variant: default | panel (large clock for wall tablets)
//   image: optional background image URL for a hero header
//   appearance: true -> palette button that opens the personal appearance picker
//   (palette / appearance_themes are passed on to it)
import { AjnBase, bindGestures, cssUrl, esc, formatState } from "../core/base.js";
import { openAppearance } from "./appearance.js";
import { COLORS } from "../core/styles.js";

const WEATHER_ICONS = {
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
    return ids.filter(Boolean);
  }

  connectedCallback() {
    this._timer = setInterval(() => this._tick(), 15000);
  }

  disconnectedCallback() {
    clearInterval(this._timer);
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
      set(".date", now.toLocaleDateString(lang, { weekday: "long", day: "numeric", month: "long" }));
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
      ha-card.hero::before { content: ""; position: absolute; inset: 0; background: linear-gradient(90deg, rgba(0,0,0,.55), rgba(0,0,0,.1)); }
      .wrap { position: relative; padding: ${panel ? "8px 6px 4px" : "4px 4px 2px"}; display: grid; gap: 14px; }
      .hero .wrap { padding: 22px; }
      .top { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
      .eyebrow { font-size: 12px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: var(--_accent); }
      .hero .eyebrow { color: #fff; opacity: .85; }
      .greet { font-size: 15px; color: var(--_text2); margin-top: 2px; }
      .hero .greet, .hero .date { color: rgba(255,255,255,.85); }
      .time { font-size: ${panel ? "84px" : "52px"}; font-weight: 200; line-height: 1; letter-spacing: -.04em;
              color: var(--_text); font-variant-numeric: tabular-nums; margin: 4px 0 2px; }
      .hero .time { color: #fff; }
      .date { font-size: 15px; color: var(--_text2); }
      .weather { display: flex; align-items: center; gap: 12px; padding: 10px 14px; border-radius: 18px;
                 background: var(--_surface); border: 1px solid var(--_border);
                 -webkit-backdrop-filter: blur(var(--_blur)); backdrop-filter: blur(var(--_blur)); }
      .hero .weather { background: rgba(255,255,255,.16); border-color: rgba(255,255,255,.2); color: #fff; }
      .weather ha-icon { --mdc-icon-size: ${panel ? "46px" : "34px"}; color: var(--_accent); }
      .hero .weather ha-icon { color: #fff; }
      .wtemp { font-size: ${panel ? "30px" : "22px"}; font-weight: 600; color: inherit; font-variant-numeric: tabular-nums; }
      .wcond { font-size: 12px; color: var(--_text2); }
      .hero .wcond { color: rgba(255,255,255,.8); }
      .row { display: flex; gap: 8px; align-items: center; overflow-x: auto; scrollbar-width: none; padding: 2px; }
      .row::-webkit-scrollbar { display: none; }
      .chip { flex: none; display: inline-flex; align-items: center; gap: 7px; height: 38px; padding: 0 14px 0 11px;
              border-radius: 999px; font-size: 14px; font-weight: 600; color: var(--_text); white-space: nowrap;
              background: var(--_surface); border: 1px solid var(--_border);
              -webkit-backdrop-filter: blur(var(--_blur)); backdrop-filter: blur(var(--_blur)); }
      .chip ha-icon { --mdc-icon-size: 19px; color: rgb(var(--chip-rgb)); }
      .chip.on { background: rgba(var(--chip-rgb), .16); border-color: rgba(var(--chip-rgb), .32); }
      .persons { display: flex; margin-inline-start: auto; padding-inline-start: 8px; }
      .person { width: 36px; height: 36px; border-radius: 50%; overflow: hidden; display: grid; place-items: center;
                margin-inline-start: -8px; border: 2px solid var(--primary-background-color, #000);
                background: var(--secondary-background-color, #333); font-size: 12px; font-weight: 700;
                color: var(--_text2); filter: grayscale(1); opacity: .6; }
      .person.home { filter: none; opacity: 1; box-shadow: 0 0 0 2px rgb(${COLORS.green}); }
      .person img { width: 100%; height: 100%; object-fit: cover; }
      .me { flex: none; width: 38px; height: 38px; border-radius: 50%; display: grid; place-items: center; margin-inline-start: auto;
            background: var(--_grad); color: #fff; box-shadow: inset 0 1px 0 rgba(255,255,255,.35), 0 4px 14px var(--ajn-glow, rgba(0,0,0,.2)); }
      .persons + .me { margin-inline-start: 6px; }
      .me ha-icon { --mdc-icon-size: 20px; }
      .eyebrow { background: var(--_grad); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
      .hero .eyebrow { -webkit-text-fill-color: #fff; }
      @container (max-width: 440px) { .time { font-size: ${panel ? "60px" : "44px"}; } }
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
    const persons = (c.persons || []).map((id) => this.st(id)).filter(Boolean).map((p) => {
      const pic = p.attributes.entity_picture;
      const initials = String(p.attributes.friendly_name || p.entity_id).split(" ").map((x) => x[0]).join("").slice(0, 2);
      return `<div class="person tap ${p.state === "home" ? "home" : ""}" data-entity="${esc(p.entity_id)}"
        title="${esc(p.attributes.friendly_name)} · ${esc(formatState(this._hass, p))}">
        ${pic ? `<img src="${esc(pic)}" alt="">` : esc(initials)}</div>`;
    }).join("");
    const chips = this._chips().map((ch) => `
      <div class="chip tap ${ch.active ? "on" : ""}" tabindex="0" role="button" style="--chip-rgb:${COLORS[ch.color] || COLORS.blue}"
           ${ch.nav ? `data-nav="${esc(ch.nav)}"` : ""} ${ch.entity ? `data-entity="${esc(ch.entity)}"` : ""}>
        <ha-icon icon="${esc(ch.icon)}"></ha-icon>${esc(ch.text)}</div>`).join("");

    this.html(`
      <ha-card class="${c.image ? "hero" : ""}" ${c.image ? `style="--_hero:${esc(cssUrl(c.image))}"` : ""}>
        <div class="wrap">
          <div class="top">
            <div>
              ${c.title ? `<div class="eyebrow">${esc(c.title)}</div>` : ""}
              <div class="greet"></div><div class="time"></div><div class="date"></div>
            </div>
            ${weather}
          </div>
          ${chips || persons || c.appearance ? `<div class="row">${chips}${persons ? `<div class="persons">${persons}</div>` : ""}${c.appearance
            ? `<div class="me tap" data-appearance tabindex="0" role="button" aria-label="${esc(this.t("appearance"))}" title="${esc(this.t("appearance"))}"><ha-icon icon="mdi:palette"></ha-icon></div>` : ""}</div>` : ""}
        </div>
      </ha-card>`);
    this._tick();
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
