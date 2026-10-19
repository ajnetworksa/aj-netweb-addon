// custom:ajnetweb-person-card - who is home. One person: photo (or initials) with a presence ring,
// where they are and for how long, and their phone battery.
//   entity: person.ahmed
//   size: small (default) | big     big adds a tinted panel and info chips
//   battery: sensor.ahmed_phone_battery_level | false   default: found from the person's tracker
//   sensors: [entity ids]           big only: extra chips (travel time, steps, ...), tap = more info
//   name / picture: override the person's name / photo
// Tap = more info (HA's person dialog with the map).
import { AjnBase, OFFLINE, bindGestures, cssUrl, esc, formatState } from "../core/base.js";
import { COLORS } from "../core/styles.js";

const BATTERY_SUFFIXES = ["_battery_level", "_battery"];

export class AjnetwebPersonCard extends AjnBase {
  static getStubConfig(hass) {
    return { entity: Object.keys((hass && hass.states) || {}).find((e) => e.startsWith("person.")) || "person.me" };
  }

  validate(config) {
    if (!config.entity) throw new Error("ajnetweb-person-card: 'entity' (a person) is required");
  }

  /** Phone battery: the configured sensor, or <tracker>_battery_level of the person's current tracker. */
  _battery() {
    const c = this._config;
    if (c.battery === false) return null;
    if (c.battery) return c.battery;
    const p = this.st(c.entity);
    const src = p && p.attributes.source;
    if (!src || !src.includes(".")) return null;
    const base = src.split(".")[1];
    return BATTERY_SUFFIXES.map((s) => `sensor.${base}${s}`).find((id) => this.st(id)) || null;
  }

  watched() {
    const bat = this._battery();
    return [this._config.entity, bat, bat && bat.replace(/_level$/, "_state"), ...(this._config.sensors || [])];
  }

  connectedCallback() {
    // "for 2 h" ticks on without a state change
    this._timer = setInterval(() => this._hass && this._config && this.render(), 60000);
  }

  disconnectedCallback() {
    clearInterval(this._timer);
  }

  _presence(st) {
    if (!st || OFFLINE.includes(st.state)) return { key: "unknown", color: COLORS.grey, label: this.t("offline"), icon: "mdi:help" };
    if (st.state === "home") return { key: "home", color: COLORS.green, label: this.t("at_home"), icon: "mdi:home" };
    if (st.state === "not_home") return { key: "away", color: COLORS.orange, label: this.t("away"), icon: "mdi:map-marker-outline" };
    // a zone: the state is the zone's name
    return { key: "zone", color: COLORS.teal, label: formatState(this._hass, st), icon: "mdi:map-marker" };
  }

  _since(st) {
    const t = st && Date.parse(st.last_changed);
    if (!t) return "";
    const min = Math.max(0, Math.floor((Date.now() - t) / 60000));
    if (min < 1) return this.t("just_now");
    const d = Math.floor(min / 1440);
    const h = Math.floor((min % 1440) / 60);
    const m = min % 60;
    const dur = d ? `${d} ${this.t("days_short")}${h ? ` ${h} ${this.t("hours_short")}` : ""}`
      : h ? `${h} ${this.t("hours_short")}${m ? ` ${m} ${this.t("minutes_short")}` : ""}` : `${m} ${this.t("minutes_short")}`;
    return this.t("for_time", null, { time: dur });
  }

  _batteryChip() {
    const id = this._battery();
    const v = this.num(id);
    if (v == null) return "";
    const st = this.st(id.replace(/_level$/, "_state"));
    const charging = st && ["charging", "full"].includes(String(st.state).toLowerCase());
    const step = Math.max(10, Math.min(90, Math.round(v / 10) * 10));
    const icon = charging ? `mdi:battery-charging-${step}` : v >= 95 ? "mdi:battery" : v < 5 ? "mdi:battery-outline" : `mdi:battery-${step}`;
    const low = !charging && v <= 20;
    return `<div class="chip bat tap ${low ? "low" : ""}" data-entity="${esc(id)}" tabindex="0" role="button">
      <ha-icon icon="${icon}"></ha-icon>${esc(Math.round(v))}%</div>`;
  }

  css() {
    return `
      .wrap { height: 100%; box-sizing: border-box; padding: 12px; display: flex; flex-direction: column; justify-content: center; gap: 12px; }
      .top { display: flex; align-items: center; gap: 12px; min-width: 0; }
      .av { position: relative; flex: none; width: 48px; height: 48px; border-radius: 50%; display: grid; place-items: center;
            background: var(--_grad); color: #fff; font-weight: 700; font-size: 17px; letter-spacing: .02em;
            background-size: cover; background-position: center;
            box-shadow: 0 0 0 2.5px var(--_surface), 0 0 0 5px rgb(var(--c)); margin: 5px; }
      .av.pic { color: transparent; }
      .away .av { filter: grayscale(.55); }
      .badge { position: absolute; inset-inline-end: -6px; bottom: -6px; width: 22px; height: 22px; border-radius: 50%;
               display: grid; place-items: center; background: rgb(var(--c)); color: #fff; box-shadow: 0 0 0 2.5px var(--_surface); }
      .badge ha-icon { --mdc-icon-size: 13px; }
      .who { min-width: 0; flex: 1; }
      .name { font-size: 15px; font-weight: 650; color: var(--_text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .where { font-size: 13px; color: var(--_text2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px; }
      .where b { color: rgb(var(--c)); font-weight: 600; }
      .chips { display: flex; flex-wrap: wrap; gap: 6px; }
      .top .chips { flex: none; }
      .chip { display: inline-flex; align-items: center; gap: 4px; height: 28px; padding: 0 10px 0 7px; border-radius: 999px;
              font-size: 12px; font-weight: 600; color: var(--_text); background: var(--_muted); white-space: nowrap; }
      .chip ha-icon { --mdc-icon-size: 16px; color: var(--_text2); }
      .chip.low, .chip.low ha-icon { color: rgb(${COLORS.red}); }
      /* big */
      .big .wrap { padding: 16px; }
      ha-card.big { background:
        radial-gradient(130% 120% at 0% 0%, rgba(var(--c), .20) 0%, rgba(var(--c), 0) 60%), var(--_surface); }
      .big .av { width: 64px; height: 64px; font-size: 22px; }
      .big .name { font-size: 18px; }
      .big .where { font-size: 14px; }
      .big .chip { height: 32px; font-size: 13px; padding: 0 12px 0 9px; }
      .big .chip ha-icon { --mdc-icon-size: 18px; }
    `;
  }

  render() {
    const c = this._config;
    const st = this.st(c.entity);
    const p = this._presence(st);
    const name = c.name || (st && st.attributes.friendly_name) || c.entity.split(".")[1];
    const pic = c.picture || (st && st.attributes.entity_picture);
    const initials = String(name).split(/\s+/).filter(Boolean).map((x) => x[0]).join("").slice(0, 2).toUpperCase();
    const big = c.size === "big";
    const since = this._since(st);
    const bat = this._batteryChip();
    const extra = big ? (c.sensors || []).map((id) => this.st(id)).filter(Boolean).map((s) => `
      <div class="chip tap" data-entity="${esc(s.entity_id)}" tabindex="0" role="button" title="${esc(s.attributes.friendly_name)}">
        <ha-icon icon="${esc(s.attributes.icon || "mdi:information-outline")}"></ha-icon>${esc(formatState(this._hass, s))}</div>`).join("") : "";
    this.html(`
      <ha-card class="tap ${big ? "big" : ""} ${p.key}" style="--c:${p.color}" tabindex="0" role="button"
        aria-label="${esc(name)}: ${esc(p.label)}"><div class="wrap">
        <div class="top">
          <div class="av ${pic ? "pic" : ""}" ${pic ? `style="background-image:${esc(cssUrl(pic))}"` : ""}>${esc(initials)}
            <span class="badge"><ha-icon icon="${p.icon}"></ha-icon></span></div>
          <div class="who"><div class="name">${esc(name)}</div>
            <div class="where"><b>${esc(p.label)}</b>${since ? ` · ${esc(since)}` : ""}</div></div>
          ${!big && bat ? `<div class="chips">${bat}</div>` : ""}
        </div>
        ${big && (bat || extra) ? `<div class="chips">${bat}${extra}</div>` : ""}
      </div></ha-card>`);
    const card = this.shadowRoot.querySelector("ha-card");
    bindGestures(card, { onTap: () => this.moreInfo(c.entity), onHold: () => this.moreInfo(c.entity) });
    this.shadowRoot.querySelectorAll(".chip[data-entity]").forEach((el) => {
      // a chip opens its own sensor, not the person
      ["pointerdown", "keydown"].forEach((t) => el.addEventListener(t, (e) => e.stopPropagation()));
      bindGestures(el, { onTap: () => this.moreInfo(el.dataset.entity) });
    });
  }

  getCardSize() {
    return this._config && this._config.size === "big" ? 2 : 1;
  }

  getGridOptions() {
    return this._config && this._config.size === "big"
      ? { columns: 12, min_columns: 6, rows: "auto" } : { columns: 6, min_columns: 6, rows: "auto" };
  }
}
