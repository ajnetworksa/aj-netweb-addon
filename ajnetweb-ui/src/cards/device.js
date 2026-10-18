// custom:ajnetweb-device-card - one premium tile for any entity.
//   tap: toggle / run (scenes, scripts, buttons) / more-info (sensors)
//   drag sideways: brightness (lights), position (covers), speed (fans)
//   long-press: more-info dialog
//   access devices (locks, gate relays): tap twice to confirm
import { AjnBase, OFFLINE, bindGestures, esc, formatState, haptic } from "../core/base.js";
import { COLORS } from "../core/styles.js";

const TOGGLE_DOMAINS = ["light", "switch", "fan", "input_boolean", "humidifier", "siren"];

function iconFor(st, reg) {
  if (reg && reg.icon) return reg.icon;
  const a = st.attributes;
  if (a.icon) return a.icon;
  const d = st.entity_id.split(".")[0];
  if (reg && reg.access && d === "switch") return /gate|barrier/.test(st.entity_id + (a.friendly_name || "").toLowerCase()) ? "mdi:gate" : "mdi:door-closed-lock";
  const on = !["off", "closed", "locked", "idle", "standby", "unavailable", "unknown", "docked"].includes(st.state);
  const dc = a.device_class;
  switch (d) {
    case "light": return on ? "mdi:lightbulb-on" : "mdi:lightbulb-outline";
    case "switch":
      if (dc === "outlet") return on ? "mdi:power-socket-uk" : "mdi:power-socket-uk";
      return on ? "mdi:toggle-switch-variant" : "mdi:toggle-switch-variant-off";
    case "fan": return on ? "mdi:fan" : "mdi:fan-off";
    case "cover":
      if (dc === "garage") return on ? "mdi:garage-open-variant" : "mdi:garage-variant";
      if (dc === "gate") return on ? "mdi:gate-open" : "mdi:gate";
      if (dc === "curtain") return on ? "mdi:curtains" : "mdi:curtains-closed";
      return on ? "mdi:window-shutter-open" : "mdi:window-shutter";
    case "climate":
      if (a.hvac_action === "cooling" || st.state === "cool") return "mdi:snowflake";
      if (a.hvac_action === "heating" || st.state === "heat") return "mdi:fire";
      if (st.state === "fan_only") return "mdi:fan";
      if (st.state === "dry") return "mdi:water-percent";
      return "mdi:thermostat";
    case "lock": return st.state === "locked" ? "mdi:lock" : "mdi:lock-open-variant";
    case "media_player":
      if (dc === "tv") return "mdi:television";
      return st.state === "playing" ? "mdi:speaker-play" : "mdi:speaker";
    case "scene": return "mdi:palette";
    case "script": return "mdi:script-text-play";
    case "button": return "mdi:gesture-tap-button";
    case "camera": return "mdi:cctv";
    case "vacuum": return "mdi:robot-vacuum";
    case "valve": return on ? "mdi:valve-open" : "mdi:valve-closed";
    case "alarm_control_panel": return st.state === "disarmed" ? "mdi:shield-off-outline" : "mdi:shield-lock";
    case "sensor":
      return { temperature: "mdi:thermometer", humidity: "mdi:water-percent", power: "mdi:flash",
               energy: "mdi:lightning-bolt", battery: "mdi:battery", carbon_dioxide: "mdi:molecule-co2",
               pm25: "mdi:blur", illuminance: "mdi:brightness-5" }[dc] || "mdi:gauge";
    case "binary_sensor":
      return { door: on ? "mdi:door-open" : "mdi:door-closed", window: on ? "mdi:window-open" : "mdi:window-closed",
               garage_door: on ? "mdi:garage-open" : "mdi:garage", motion: on ? "mdi:motion-sensor" : "mdi:motion-sensor-off",
               occupancy: on ? "mdi:home-account" : "mdi:home-outline", smoke: on ? "mdi:smoke-detector-alert" : "mdi:smoke-detector",
               moisture: on ? "mdi:water-alert" : "mdi:water-off", gas: on ? "mdi:gas-cylinder" : "mdi:gas-cylinder" }[dc]
        || (on ? "mdi:checkbox-marked-circle" : "mdi:checkbox-blank-circle-outline");
    default: return "mdi:circle-outline";
  }
}

function isActive(st) {
  const d = st.entity_id.split(".")[0];
  const s = st.state;
  if (OFFLINE.includes(s)) return false;
  if (d === "lock") return s !== "locked";
  if (d === "cover") return s !== "closed";
  if (d === "climate") return s !== "off";
  if (d === "media_player") return s === "playing" || s === "on" || s === "paused";
  if (d === "alarm_control_panel") return s !== "disarmed";
  if (d === "vacuum") return s === "cleaning";
  if (d === "sensor" || d === "scene" || d === "script" || d === "button" || d === "camera") return false;
  return s === "on" || s === "open" || s === "home";
}

function colorFor(st) {
  const d = st.entity_id.split(".")[0];
  const a = st.attributes;
  if (d === "light" && Array.isArray(a.rgb_color)) return a.rgb_color.join(", ");
  if (d === "light") return COLORS.amber;
  if (d === "climate") return a.hvac_action === "heating" || st.state === "heat" ? COLORS.orange : COLORS.blue;
  if (d === "fan") return COLORS.teal;
  if (d === "cover") return COLORS.indigo;
  if (d === "lock") return st.state === "locked" ? COLORS.green : COLORS.red;
  if (d === "media_player") return COLORS.purple;
  if (d === "alarm_control_panel") return st.state === "triggered" ? COLORS.red : COLORS.green;
  if (d === "binary_sensor") {
    const dc = a.device_class;
    if (["smoke", "gas", "moisture", "carbon_monoxide", "safety"].includes(dc)) return COLORS.red;
    return COLORS.orange;
  }
  return COLORS.amber;
}

export class AjnetwebDeviceCard extends AjnBase {
  static getStubConfig(hass) {
    const id = Object.keys(hass.states).find((e) => e.startsWith("light.")) || "sun.sun";
    return { entity: id };
  }

  validate(config) {
    if (!config.entity) throw new Error("ajnetweb-device-card: 'entity' is required");
  }

  watched() {
    return [this._config.entity];
  }

  _domain() {
    return this._config.entity.split(".")[0];
  }

  _dragKind(st) {
    const d = this._domain();
    const modes = st.attributes.supported_color_modes || [];
    if (d === "light" && modes.some((m) => m !== "onoff")) return "brightness";
    if (d === "cover" && st.attributes.current_position !== undefined) return "position";
    if (d === "fan" && st.attributes.percentage !== undefined) return "percentage";
    return null;
  }

  _level(st) {
    const a = st.attributes;
    const kind = this._dragKind(st);
    if (kind === "brightness") return st.state === "on" ? Math.round(((a.brightness || 0) / 255) * 100) : 0;
    if (kind === "position") return a.current_position || 0;
    if (kind === "percentage") return st.state === "on" ? a.percentage || 0 : 0;
    return null;
  }

  _stateText(st) {
    const d = this._domain();
    const a = st.attributes;
    if (OFFLINE.includes(st.state)) return this.t("offline");
    const level = this._level(st);
    if (d === "climate") {
      const action = a.hvac_action && typeof this._hass.formatEntityAttributeValue === "function"
        ? this._hass.formatEntityAttributeValue(st, "hvac_action") : formatState(this._hass, st);
      const target = a.temperature != null ? ` · ${a.temperature}°` : "";
      const cur = a.current_temperature != null ? `${a.current_temperature}° → ` : "";
      return st.state === "off" ? `${formatState(this._hass, st)}${a.current_temperature != null ? ` · ${a.current_temperature}°` : ""}`
        : `${action}${target ? ` · ${cur}${a.temperature}°` : ""}`;
    }
    if (d === "media_player" && st.state === "playing" && a.media_title) {
      return a.media_artist ? `${a.media_title} · ${a.media_artist}` : a.media_title;
    }
    if (level !== null && level > 0 && (d === "light" || d === "fan" || (d === "cover" && level < 100))) {
      return `${formatState(this._hass, st)} · ${level}%`;
    }
    return formatState(this._hass, st);
  }

  async _tap() {
    const st = this.st(this._config.entity);
    if (!st || OFFLINE.includes(st.state)) return this.moreInfo(this._config.entity);
    const c = this._config;
    const d = this._domain();
    const id = c.entity;
    const needsConfirm = c.confirm || d === "lock" || c.access;
    if (c.tap_action === "more-info") return this.moreInfo(id);
    if (needsConfirm && !this._armed) {
      this._armed = true;
      haptic("light");
      this.render();
      clearTimeout(this._armTimer);
      this._armTimer = setTimeout(() => { this._armed = false; this.render(); }, 3500);
      return;
    }
    this._armed = false;
    clearTimeout(this._armTimer);
    haptic("light");
    this._pulse();
    if (d === "lock") return this.call(st.state === "locked" ? "lock.unlock" : "lock.lock", [id]);
    if (d === "scene" || d === "script") return this.call(`${d}.turn_on`, [id]);
    if (d === "button" || d === "input_button") return this.call(`${d}.press`, [id]);
    if (c.access && d === "switch") return this.call("switch.turn_on", [id]); // momentary gate relay
    if (d === "cover") {
      const closing = ["open", "opening"].includes(st.state);
      return this.call(closing ? "cover.close_cover" : "cover.open_cover", [id]);
    }
    if (d === "media_player") return this.call("media_player.media_play_pause", [id]);
    if (d === "climate") return this.call(st.state === "off" ? "climate.turn_on" : "climate.turn_off", [id]);
    if (d === "vacuum") return this.call(st.state === "cleaning" ? "vacuum.return_to_base" : "vacuum.start", [id]);
    if (d === "valve") return this.call(st.state === "open" ? "valve.close_valve" : "valve.open_valve", [id]);
    if (TOGGLE_DOMAINS.includes(d)) return this.call("homeassistant.toggle", [id]);
    return this.moreInfo(id);
  }

  _pulse() {
    const card = this.shadowRoot.querySelector("ha-card");
    if (!card) return;
    card.classList.remove("pulse");
    void card.offsetWidth;
    card.classList.add("pulse");
  }

  async _setLevel(v) {
    const st = this.st(this._config.entity);
    const kind = this._dragKind(st);
    const id = this._config.entity;
    const val = Math.round(v);
    if (kind === "brightness") {
      return val <= 1 ? this.call("light.turn_off", [id]) : this.call("light.turn_on", [id], { brightness_pct: val });
    }
    if (kind === "position") return this.call("cover.set_cover_position", [id], { position: val });
    if (kind === "percentage") {
      return val <= 1 ? this.call("fan.turn_off", [id]) : this.call("fan.set_percentage", [id], { percentage: val });
    }
  }

  async _stepTemp(delta) {
    const st = this.st(this._config.entity);
    const a = st.attributes;
    const step = a.target_temp_step || (this._hass.config.unit_system.temperature === "°F" ? 1 : 0.5);
    const cur = Number(a.temperature != null ? a.temperature : a.current_temperature || 22);
    const next = Math.max(a.min_temp ?? 7, Math.min(a.max_temp ?? 35, Math.round((cur + delta * step) * 10) / 10));
    haptic("light");
    this.call("climate.set_temperature", [this._config.entity], { temperature: next });
  }

  css() {
    return `
      ha-card { position: relative; transition: background .35s var(--_ease), transform .18s var(--_ease), box-shadow .35s var(--_ease); }
      ha-card:active { transform: scale(.975); }
      ha-card.pulse { animation: pulse .45s var(--_ease); }
      @keyframes pulse { 40% { transform: scale(.96); } 100% { transform: scale(1); } }
      ha-card.on { background: var(--_surface-on); border-color: transparent;
                   box-shadow: 0 8px 26px rgba(var(--c), .22), var(--_shadow); }
      ha-card.on .name { color: var(--_text-on); }
      ha-card.on .state { color: var(--_text-on); opacity: .62; }
      ha-card.offline { opacity: .55; }
      ha-card.armed { box-shadow: 0 0 0 2px rgb(${COLORS.orange}) inset; }
      .fill { position: absolute; inset: 0; width: var(--level, 0%); background: rgba(var(--c), .16);
              transition: width .25s var(--_ease); pointer-events: none; }
      ha-card.dragging .fill { transition: none; }
      .body { position: relative; height: 100%; box-sizing: border-box; padding: 14px; display: grid;
              grid-template-rows: auto 1fr auto; gap: 8px; min-height: var(--ajn-tile-height, 116px); }
      .top { display: flex; justify-content: space-between; align-items: flex-start; gap: 6px; }
      .icon { width: 42px; height: 42px; border-radius: 50%; display: grid; place-items: center; flex: none;
              background: var(--_muted); color: var(--_text2); transition: all .35s var(--_ease); }
      .on .icon { background: rgba(var(--c), .2); color: rgb(var(--c)); }
      .badge { font-size: 13px; font-weight: 600; color: var(--_text2); font-variant-numeric: tabular-nums; padding-top: 2px; }
      .on .badge { color: rgb(var(--c)); }
      .name { font-size: 15px; font-weight: 600; line-height: 1.22; color: var(--_text); letter-spacing: -.01em;
              display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
      .state { font-size: 13px; color: var(--_text2); margin-top: 2px; white-space: nowrap; overflow: hidden;
               text-overflow: ellipsis; font-variant-numeric: tabular-nums; }
      .wide .body { grid-template-rows: none; grid-template-columns: auto 1fr auto; align-items: center;
                    min-height: 72px; padding: 12px 14px; gap: 12px; }
      .controls { display: flex; gap: 6px; align-items: center; }
      .ctl { width: 40px; height: 40px; border-radius: 50%; border: none; background: var(--_muted); color: inherit;
             display: grid; place-items: center; cursor: pointer; font: inherit; padding: 0; }
      .on .ctl { background: rgba(var(--c), .16); color: var(--_text-on); }
      .ctl ha-icon { --mdc-icon-size: 20px; }
      @container (max-width: 360px) { .ctl { width: 34px; height: 34px; } .target { min-width: 40px !important; font-size: 18px !important; } .wide .body { gap: 8px; padding: 10px 12px; } .controls { gap: 3px; } }
      .target { min-width: 52px; text-align: center; font-size: 20px; font-weight: 600; font-variant-numeric: tabular-nums; }
      .on .target { color: var(--_text-on); }
      .confirm { position: absolute; inset: auto 10px 10px 10px; padding: 6px 8px; border-radius: 10px; font-size: 12px;
                 font-weight: 600; text-align: center; background: rgb(${COLORS.orange}); color: #1a1000; }
    `;
  }

  render() {
    if (this._dragging) return; // keep the gesture alive; redraw when the drag ends
    const c = this._config;
    const st = this.st(c.entity);
    if (!st) {
      this.html(`<ha-card><div class="body"><div class="name">${esc(c.name || c.entity)}</div>
        <div class="state">${esc(this.t("offline"))}</div></div></ha-card>`);
      return;
    }
    const reg = Object.assign({}, this._hass.entities && this._hass.entities[c.entity], { access: c.access });
    if (reg.icon === undefined) delete reg.icon;
    const active = isActive(st);
    const offline = OFFLINE.includes(st.state);
    const level = this._dragLevel != null ? this._dragLevel : this._level(st);
    const wide = c.layout === "wide" || this._domain() === "climate" && c.layout !== "square";
    const d = this._domain();
    let badge = "";
    if (level !== null && active && d !== "cover") badge = `${level}%`;
    else if (d === "climate" && st.attributes.current_temperature != null && !wide) badge = `${st.attributes.current_temperature}°`;

    const name = c.name || st.attributes.friendly_name || c.entity;
    const stateText = d === "sensor" ? formatState(this._hass, st) : this._stateText(st);
    const controls = d === "climate" && wide && !offline && st.state !== "off" ? `
      <div class="controls">
        <button class="ctl" data-step="-1" aria-label="-"><ha-icon icon="mdi:minus"></ha-icon></button>
        <div class="target">${st.attributes.temperature != null ? esc(st.attributes.temperature) + "°" : "--"}</div>
        <button class="ctl" data-step="1" aria-label="+"><ha-icon icon="mdi:plus"></ha-icon></button>
      </div>` : badge ? `<div class="badge">${esc(badge)}</div>` : "";

    this.html(`
      <ha-card class="tap ${active ? "on" : ""} ${offline ? "offline" : ""} ${this._armed ? "armed" : ""} ${wide ? "wide" : ""}"
               style="--c:${colorFor(st)};--level:${level != null && (active || this._dragLevel != null) ? level : 0}%"
               tabindex="0" role="button" aria-label="${esc(name)}">
        ${this._dragKind(st) ? `<div class="fill"></div>` : ""}
        <div class="body">
          ${wide ? `<div class="icon"><ha-icon icon="${esc(c.icon || iconFor(st, reg))}"></ha-icon></div>
                    <div><div class="name">${esc(name)}</div><div class="state">${esc(stateText)}</div></div>
                    ${controls}`
                 : `<div class="top"><div class="icon"><ha-icon icon="${esc(c.icon || iconFor(st, reg))}"></ha-icon></div>${controls}</div>
                    <div></div>
                    <div><div class="name">${esc(name)}</div><div class="state">${esc(stateText)}</div></div>`}
        </div>
        ${this._armed ? `<div class="confirm">${esc(this.t("confirm"))}</div>` : ""}
      </ha-card>`);

    const card = this.shadowRoot.querySelector("ha-card");
    this.shadowRoot.querySelectorAll("[data-step]").forEach((b) => {
      b.addEventListener("pointerdown", (e) => e.stopPropagation());
      b.addEventListener("click", (e) => { e.stopPropagation(); this._stepTemp(Number(b.dataset.step)); });
    });
    const dragKind = this._dragKind(st);
    bindGestures(card, {
      onTap: (e) => { if (!e.target.closest || !e.target.closest(".ctl")) this._tap(); },
      onHold: () => this.moreInfo(c.entity),
      onDrag: dragKind && !offline ? (v) => {
        this._dragging = true;
        this._dragLevel = Math.round(v);
        card.classList.add("dragging", "on");
        card.style.setProperty("--level", `${this._dragLevel}%`);
        const b = this.shadowRoot.querySelector(".badge");
        if (b) b.textContent = `${this._dragLevel}%`;
        const s = this.shadowRoot.querySelector(".state");
        if (s) s.textContent = `${this._dragLevel}%`;
      } : null,
      onDragEnd: dragKind && !offline ? (v) => {
        this._dragging = false;
        this._dragLevel = Math.round(v);
        haptic("light");
        this._setLevel(v).finally(() => {
          // hold the dragged value until HA reports the new state, then follow HA again
          setTimeout(() => { this._dragLevel = null; this.render(); }, 1500);
        });
      } : null,
    });
  }

  getCardSize() {
    return 2;
  }

  getGridOptions() {
    const wide = this._config && (this._config.layout === "wide" || (this._config.entity || "").startsWith("climate."));
    return wide ? { columns: 12, min_columns: 6, rows: "auto" } : { columns: 6, min_columns: 3, rows: "auto" };
  }
}

export { iconFor, isActive };
