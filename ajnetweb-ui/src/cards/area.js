// custom:ajnetweb-area-card - room card with photo (or room-type gradient), live status and a
// lights toggle. Tap opens the room sheet (default) or navigates (tap_action: navigate).
//
// Config:
//   area: living_room            # HA area id; name, picture and devices are read from HA
//   name / icon / picture        # optional overrides
//   entities: { lights: [...], climates: [...], ... }   # optional; auto-detected from the area
//   temperature / humidity       # optional sensor ids
//   tap_action: popup | navigate ; navigation_path: /dashboard/room-living-room
//   size: normal | large
import { AjnBase, OFFLINE, bindGestures, cssUrl, esc, haptic } from "../core/base.js";
import { COLORS, roomGradient } from "../core/styles.js";
import { buildModel, roomEntities } from "../core/model.js";
import { openRoomSheet } from "./sheet.js";

const LEGACY_KEYS = ["lights", "climates", "covers", "media", "openings", "motion", "safety"];

export class AjnetwebAreaCard extends AjnBase {
  static getStubConfig(hass) {
    const first = Object.values(hass.areas || {})[0];
    return { area: first ? first.area_id : "living_room" };
  }

  validate(config) {
    if (!config.area && !config.name) throw new Error("ajnetweb-area-card: 'area' is required");
  }

  setConfig(config) {
    this._resolved = null;
    super.setConfig(config);
  }

  // Entities come from the config (strategy / installer) or are discovered from the area
  _room() {
    if (this._resolved) return this._resolved;
    const c = this._config;
    const area = (this._hass.areas || {})[c.area] || {};
    let entities = c.entities;
    if (!entities && LEGACY_KEYS.some((k) => Array.isArray(c[k]))) {
      entities = {};
      LEGACY_KEYS.forEach((k) => { if (c[k] && c[k].length) entities[k] = c[k]; });
    }
    let temperature = c.temperature;
    let humidity = c.humidity;
    if (!entities) {
      const model = buildModel(this._hass, { exclude_entities: c.exclude_entities });
      const room = model.rooms.find((r) => r.id === c.area);
      entities = room ? roomEntities(room) : {};
    }
    if (!temperature && entities.temperature) temperature = entities.temperature[0];
    if (!humidity && entities.humidity) humidity = entities.humidity[0];
    this._resolved = {
      id: c.area || "room",
      name: c.name || area.name || c.area,
      icon: c.icon || area.icon || "mdi:floor-plan",
      picture: c.picture === false ? null : c.picture || area.picture || null,
      entities, temperature, humidity, language: c.language,
    };
    return this._resolved;
  }

  watched() {
    if (!this._hass) return [];
    const r = this._room();
    return [r.temperature, r.humidity, ...Object.values(r.entities).flat()].filter(Boolean);
  }

  set hass(hass) {
    super.hass = hass;
    if (this._sheet && this._sheet.isConnected) this._sheet.hass = hass;
  }

  get hass() {
    return this._hass;
  }

  _count(group, test) {
    return (this._room().entities[group] || []).map((id) => this.st(id))
      .filter((s) => s && !OFFLINE.includes(s.state) && test(s)).length;
  }

  _open() {
    const c = this._config;
    haptic("light");
    if (c.tap_action === "navigate" && c.navigation_path) return this.navigate(c.navigation_path);
    this._sheet = openRoomSheet(this._room(), this, this._hass);
  }

  _toggleLights(e) {
    e.stopPropagation();
    const ids = (this._room().entities.lights || []).filter((id) => this.st(id));
    if (!ids.length) return;
    haptic("light");
    const on = ids.filter((id) => this.st(id).state === "on");
    this.call(on.length ? "homeassistant.turn_off" : "homeassistant.turn_on", on.length ? on : ids);
  }

  css() {
    return `
      ha-card { position: relative; border: none; color: #fff; min-height: var(--ajn-room-height, 150px);
                transition: transform .18s var(--_ease), box-shadow .3s var(--_ease); isolation: isolate; }
      ha-card.large { min-height: 210px; }
      ha-card:active { transform: scale(.98); }
      .bg { position: absolute; inset: 0; z-index: -2; background-size: cover; background-position: center;
            transition: transform .6s var(--_ease), filter .4s; }
      ha-card:hover .bg { transform: scale(1.03); }
      .shade { position: absolute; inset: 0; z-index: -1;
               background: linear-gradient(180deg, rgba(0,0,0,.05) 0%, rgba(0,0,0,.18) 45%, rgba(0,0,0,.66) 100%); }
      ha-card.dim .bg { filter: saturate(.75) brightness(.8); }
      ha-card.lit { box-shadow: 0 10px 30px rgba(${COLORS.amber}, .25); }
      .wrap { position: relative; height: 100%; box-sizing: border-box; padding: 14px; display: flex;
              flex-direction: column; justify-content: space-between; gap: 12px; min-height: inherit; }
      .top { display: flex; justify-content: space-between; align-items: flex-start; }
      .glass { width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center; border: none; padding: 0;
               background: rgba(255,255,255,.2); color: #fff; -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px); }
      button.glass { cursor: pointer; }
      button.glass.on { background: rgb(${COLORS.amber}); color: #1d1300; box-shadow: 0 0 18px rgba(${COLORS.amber}, .6); }
      .name { font-size: 18px; font-weight: 700; letter-spacing: -.02em; line-height: 1.2; text-shadow: 0 1px 8px rgba(0,0,0,.3); }
      .sub { font-size: 13px; opacity: .88; margin-top: 2px; font-variant-numeric: tabular-nums;
             white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .pills { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
      .pill { display: inline-flex; align-items: center; gap: 4px; height: 24px; padding: 0 9px 0 7px; border-radius: 999px;
              font-size: 12px; font-weight: 600; background: rgba(0,0,0,.32); -webkit-backdrop-filter: blur(10px);
              backdrop-filter: blur(10px); }
      .pill ha-icon { --mdc-icon-size: 15px; color: rgb(var(--c)); }
    `;
  }

  render() {
    const r = this._room();
    const lightsOn = this._count("lights", (s) => s.state === "on");
    const acOn = this._count("climates", (s) => s.state !== "off");
    const open = this._count("openings", (s) => s.state === "on");
    const motion = this._count("motion", (s) => s.state === "on");
    const alerts = this._count("safety", (s) => s.state === "on");
    const playing = this._count("media", (s) => s.state === "playing");
    const t = this.num(r.temperature);
    const h = this.num(r.humidity);
    const tUnit = (this.st(r.temperature) || { attributes: {} }).attributes.unit_of_measurement || "°";
    const climate = (r.entities.climates || []).map((id) => this.st(id)).find((s) => s && s.state !== "off" && !OFFLINE.includes(s.state));

    const sub = [];
    if (t !== null) sub.push(`${Math.round(t * 10) / 10}${tUnit}`);
    if (h !== null) sub.push(`${Math.round(h)}%`);
    if (lightsOn) sub.push(`${lightsOn} ${this.t("lights_on", lightsOn)}`);

    const pills = [];
    if (alerts) pills.push(["mdi:alert", COLORS.red, alerts]);
    if (open) pills.push(["mdi:door-open", COLORS.orange, open]);
    if (acOn) pills.push(["mdi:snowflake", COLORS.blue, climate && climate.attributes.temperature != null ? `${climate.attributes.temperature}°` : acOn]);
    if (motion) pills.push(["mdi:motion-sensor", COLORS.teal, ""]);
    if (playing) pills.push(["mdi:music", COLORS.purple, ""]);

    const bg = r.picture ? `background-image:${cssUrl(r.picture)}` : `background:${roomGradient(`${r.name} ${r.icon}`)}`;
    const hasLights = (r.entities.lights || []).length > 0;

    this.html(`
      <ha-card class="tap ${lightsOn ? "lit" : "dim"} ${this._config.size === "large" ? "large" : ""}" tabindex="0" role="button" aria-label="${esc(r.name)}">
        <div class="bg" style='${bg}'></div><div class="shade"></div>
        <div class="wrap">
          <div class="top">
            <div class="glass"><ha-icon icon="${esc(r.icon)}"></ha-icon></div>
            ${hasLights ? `<button class="glass ${lightsOn ? "on" : ""}" aria-label="${esc(this.t("lights"))}">
              <ha-icon icon="${lightsOn ? "mdi:lightbulb-on" : "mdi:lightbulb-outline"}"></ha-icon></button>` : ""}
          </div>
          <div>
            <div class="name">${esc(r.name)}</div>
            <div class="sub">${sub.join(" · ") || "&nbsp;"}</div>
            ${pills.length ? `<div class="pills">${pills.map(([i, c, v]) =>
              `<span class="pill" style="--c:${c}"><ha-icon icon="${i}"></ha-icon>${esc(v)}</span>`).join("")}</div>` : ""}
          </div>
        </div>
      </ha-card>`);

    const card = this.shadowRoot.querySelector("ha-card");
    const btn = this.shadowRoot.querySelector("button.glass");
    if (btn) {
      btn.addEventListener("pointerdown", (e) => e.stopPropagation());
      btn.addEventListener("pointerup", (e) => e.stopPropagation());
      btn.addEventListener("click", (e) => this._toggleLights(e));
    }
    bindGestures(card, { onTap: () => this._open(), onHold: this._config.navigation_path ? () => this.navigate(this._config.navigation_path) : null });
  }

  getCardSize() {
    return 3;
  }

  getGridOptions() {
    return { columns: 6, min_columns: 4, rows: "auto" };
  }
}
