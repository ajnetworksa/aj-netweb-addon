/**
 * AJ Netweb Card Suite
 *
 * Self-contained Lovelace cards maintained by AJ Netweb. No HACS, no Lit, no
 * imports from HA frontend internals - only the public `hass` object
 * (states, callService, locale, formatEntityState) and the long-standing
 * `hass-more-info` / `location-changed` / `hass-notification` events. That is
 * what keeps these cards working across Home Assistant releases.
 *
 * Cards:
 *   custom:ajnetweb-header-card   greeting, clock, weather, alarm and live status chips
 *   custom:ajnetweb-area-card     room summary with lights toggle and status indicators
 *   custom:ajnetweb-actions-card  touch-friendly action buttons with tap-again confirmation
 *   custom:ajnetweb-room-card     legacy hero card (kept for dashboards made by v1.x)
 *   custom:ajnetweb-quick-scenes  legacy scene buttons (kept for dashboards made by v1.x)
 *
 * Styling follows the active HA theme. AJ Netweb themes add `--ajn-*` variables
 * (glass blur, accent glow); without them the cards fall back to HA defaults.
 */
(function () {
  "use strict";

  const VERSION = "2.0.0";

  // ------------------------------------------------------------------ i18n
  const I18N = {
    en: {
      morning: "Good morning", afternoon: "Good afternoon", evening: "Good evening", night: "Good night",
      lights_on: ["light on", "lights on"], ac_running: ["AC running", "ACs running"],
      open: ["open", "open"], alerts: ["alert", "alerts"], playing: ["playing", "playing"],
      all_closed: "All closed", confirm: "Tap again to confirm", done: "Done", failed: "Action failed",
      off: "Off", motion: "Motion", home: "Home", away: "Away",
    },
    ar: {
      morning: "صباح الخير", afternoon: "مساء الخير", evening: "مساء الخير", night: "تصبح على خير",
      lights_on: ["إضاءة تعمل", "إضاءة تعمل"], ac_running: ["مكيف يعمل", "مكيفات تعمل"],
      open: ["مفتوح", "مفتوحة"], alerts: ["تنبيه", "تنبيهات"], playing: ["قيد التشغيل", "قيد التشغيل"],
      all_closed: "الكل مغلق", confirm: "اضغط مرة أخرى للتأكيد", done: "تم", failed: "فشل التنفيذ",
      off: "إيقاف", motion: "حركة", home: "في المنزل", away: "خارج المنزل",
    },
  };

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

  const COLORS = {
    amber: "255, 179, 0", blue: "33, 150, 243", orange: "255, 120, 40", red: "244, 67, 54",
    green: "46, 175, 90", purple: "156, 39, 176", teal: "0, 150, 136",
  };

  const OFFLINE = ["unavailable", "unknown"];

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // ------------------------------------------------------------------ shared base
  class AjnBase extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      this._snapshot = null;
    }

    setConfig(config) {
      if (!config || typeof config !== "object") throw new Error("Invalid configuration");
      this.validate(config);
      this._config = config;
      this._snapshot = null;
      if (this._hass) this._update(true);
    }

    validate() {}

    set hass(hass) {
      this._hass = hass;
      this._update(false);
    }

    get hass() {
      return this._hass;
    }

    /** Entity ids whose changes should trigger a re-render. */
    watched() {
      return [];
    }

    _update(force) {
      if (!this._config || !this._hass) return;
      const states = this._hass.states;
      const lang = this.lang();
      const snap = [lang, ...this.watched().map((id) => states[id])];
      if (!force && this._snapshot && snap.length === this._snapshot.length &&
          snap.every((v, i) => v === this._snapshot[i])) return;
      this._snapshot = snap;
      this.render();
    }

    lang() {
      const l = (this._hass && ((this._hass.locale && this._hass.locale.language) || this._hass.language)) || "en";
      return l.split("-")[0];
    }

    t(key, n) {
      const dict = I18N[this.lang()] || I18N.en;
      const v = dict[key] !== undefined ? dict[key] : I18N.en[key];
      if (Array.isArray(v)) return n === 1 ? v[0] : v[1];
      return v !== undefined ? v : key;
    }

    st(id) {
      return id && this._hass ? this._hass.states[id] : undefined;
    }

    formatState(stateObj) {
      if (!stateObj) return "";
      try {
        if (typeof this._hass.formatEntityState === "function") return this._hass.formatEntityState(stateObj);
      } catch (e) { /* fall through */ }
      return stateObj.state;
    }

    num(id) {
      const s = this.st(id);
      if (!s || OFFLINE.includes(s.state)) return null;
      const v = parseFloat(s.state);
      return Number.isFinite(v) ? v : null;
    }

    fire(type, detail) {
      this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
    }

    moreInfo(entityId) {
      if (entityId) this.fire("hass-more-info", { entityId });
    }

    navigate(path) {
      if (!path) return;
      window.history.pushState(null, "", path);
      window.dispatchEvent(new CustomEvent("location-changed", { detail: { replace: false } }));
    }

    notify(message) {
      this.fire("hass-notification", { message });
    }

    async call(service, entityIds, data) {
      const [domain, srv] = service.split(".");
      const payload = Object.assign({}, data || {});
      if (entityIds && entityIds.length) payload.entity_id = entityIds;
      return this._hass.callService(domain, srv, payload);
    }

    getCardSize() {
      return 2;
    }

    static baseStyle() {
      return `
        :host { display: block; }
        ha-card {
          height: 100%;
          box-sizing: border-box;
          overflow: hidden;
          background: var(--ajn-surface, var(--ha-card-background, var(--card-background-color, #fff)));
          -webkit-backdrop-filter: blur(var(--ajn-glass-blur, 0px)) saturate(1.3);
          backdrop-filter: blur(var(--ajn-glass-blur, 0px)) saturate(1.3);
          container-type: inline-size;
        }
        .tap { cursor: pointer; -webkit-tap-highlight-color: transparent; user-select: none; }
        .tap:focus-visible { outline: 2px solid var(--ajn-accent, var(--primary-color)); outline-offset: 2px; }
        ha-icon { --mdc-icon-size: 20px; display: inline-flex; }
        .muted { color: var(--secondary-text-color); }
      `;
    }
  }

  // ------------------------------------------------------------------ header card
  class AjnetwebHeaderCard extends AjnBase {
    static getStubConfig() {
      return { title: "Home", chips: [] };
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

    _timeFormat() {
      const loc = (this._hass && this._hass.locale) || {};
      const opts = { hour: "numeric", minute: "2-digit" };
      if (loc.time_format === "12") opts.hour12 = true;
      if (loc.time_format === "24") opts.hour12 = false;
      return opts;
    }

    _tick() {
      if (!this.shadowRoot) return;
      const lang = (this._hass && this._hass.locale && this._hass.locale.language) || undefined;
      const now = new Date();
      const time = this.shadowRoot.querySelector(".time");
      const date = this.shadowRoot.querySelector(".date");
      const greet = this.shadowRoot.querySelector(".greet");
      try {
        if (time) time.textContent = now.toLocaleTimeString(lang, this._timeFormat());
        if (date) date.textContent = now.toLocaleDateString(lang, { weekday: "long", day: "numeric", month: "long" });
      } catch (e) {
        if (time) time.textContent = now.toLocaleTimeString();
        if (date) date.textContent = now.toLocaleDateString();
      }
      if (greet) greet.textContent = this._greeting();
    }

    _chips() {
      const out = [];
      (this._config.chips || []).forEach((chip) => {
        const ents = (chip.entities || []).map((id) => this.st(id)).filter(Boolean);
        const count = ents.filter((s) => {
          if (OFFLINE.includes(s.state)) return false;
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
      const alarm = this.st(this._config.alarm);
      if (alarm) {
        const triggered = alarm.state === "triggered";
        out.unshift({ icon: ALARM_ICONS[alarm.state] || "mdi:shield", text: this.formatState(alarm),
                      color: triggered ? "red" : alarm.state === "disarmed" ? "orange" : "green",
                      nav: this._config.alarm_navigation_path, entity: alarm.entity_id, active: true });
      }
      return out;
    }

    render() {
      const c = this._config;
      const w = this.st(c.weather);
      const panel = c.variant === "panel";
      let weatherHtml = "";
      if (w) {
        const temp = w.attributes.temperature;
        const unit = w.attributes.temperature_unit || (this._hass.config && this._hass.config.unit_system &&
                     this._hass.config.unit_system.temperature) || "°";
        weatherHtml = `
          <div class="weather tap" data-entity="${esc(w.entity_id)}" tabindex="0" role="button">
            <ha-icon icon="${WEATHER_ICONS[w.state] || "mdi:weather-partly-cloudy"}"></ha-icon>
            <div>
              <div class="wtemp">${temp != null ? esc(Math.round(temp)) + esc(unit) : "--"}</div>
              <div class="muted wcond">${esc(this.formatState(w))}</div>
            </div>
          </div>`;
      }
      const persons = (c.persons || []).map((id) => this.st(id)).filter(Boolean).map((p) => {
        const home = p.state === "home";
        const pic = p.attributes.entity_picture;
        const initials = (p.attributes.friendly_name || p.entity_id).split(" ").map((x) => x[0]).join("").slice(0, 2);
        return `<div class="person tap ${home ? "home" : ""}" data-entity="${esc(p.entity_id)}"
                     title="${esc(p.attributes.friendly_name)} · ${home ? this.t("home") : esc(this.formatState(p))}">
                  ${pic ? `<img src="${esc(pic)}" alt="">` : `<span>${esc(initials)}</span>`}
                </div>`;
      }).join("");
      const chips = this._chips().map((ch) => `
        <div class="chip tap ${ch.active ? "on" : ""}" tabindex="0" role="button"
             style="--chip-rgb:${COLORS[ch.color] || COLORS.blue}"
             ${ch.nav ? `data-nav="${esc(ch.nav)}"` : ""} ${ch.entity ? `data-entity="${esc(ch.entity)}"` : ""}>
          <ha-icon icon="${esc(ch.icon)}"></ha-icon><span>${esc(ch.text)}</span>
        </div>`).join("");

      this.shadowRoot.innerHTML = `
        <style>
          ${AjnBase.baseStyle()}
          .wrap { padding: 18px 20px; display: grid; gap: 14px; }
          .top { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
          .eyebrow { font-size: 12px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase;
                     color: var(--ajn-accent, var(--primary-color)); }
          .greet { font-size: 15px; color: var(--secondary-text-color); margin-top: 2px; }
          .time { font-size: ${panel ? "64px" : "40px"}; font-weight: 300; line-height: 1.05;
                  letter-spacing: -.02em; color: var(--primary-text-color); font-variant-numeric: tabular-nums; }
          .date { font-size: 14px; color: var(--secondary-text-color); }
          .weather { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-radius: 16px;
                     background: rgba(var(--rgb-primary-text-color, 128,128,128), .06); }
          .weather ha-icon { --mdc-icon-size: ${panel ? "44px" : "32px"}; color: var(--ajn-accent, var(--primary-color)); }
          .wtemp { font-size: ${panel ? "28px" : "20px"}; font-weight: 600; color: var(--primary-text-color); }
          .wcond { font-size: 12px; }
          .row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
          .chip { display: inline-flex; align-items: center; gap: 6px; padding: 7px 12px; border-radius: 999px;
                  font-size: 13px; font-weight: 500; color: var(--primary-text-color);
                  background: rgba(var(--chip-rgb), .14); border: 1px solid rgba(var(--chip-rgb), .28);
                  min-height: 34px; box-sizing: border-box; }
          .chip ha-icon { --mdc-icon-size: 18px; color: rgb(var(--chip-rgb)); }
          .persons { display: flex; gap: 6px; margin-inline-start: auto; }
          .person { width: 34px; height: 34px; border-radius: 50%; overflow: hidden; display: grid; place-items: center;
                    background: var(--secondary-background-color); font-size: 12px; font-weight: 600;
                    color: var(--secondary-text-color); box-shadow: 0 0 0 2px var(--divider-color); filter: grayscale(.8); opacity: .7; }
          .person.home { box-shadow: 0 0 0 2px rgb(${COLORS.green}); filter: none; opacity: 1; }
          .person img { width: 100%; height: 100%; object-fit: cover; }
          @container (max-width: 420px) {
            .time { font-size: ${panel ? "48px" : "34px"}; }
            .wrap { padding: 16px; }
          }
        </style>
        <ha-card>
          <div class="wrap">
            <div class="top">
              <div>
                ${c.title ? `<div class="eyebrow">${esc(c.title)}</div>` : ""}
                <div class="greet"></div>
                <div class="time"></div>
                <div class="date"></div>
              </div>
              ${weatherHtml}
            </div>
            ${chips || persons ? `<div class="row">${chips}${persons ? `<div class="persons">${persons}</div>` : ""}</div>` : ""}
          </div>
        </ha-card>`;
      this._tick();
      this.shadowRoot.querySelectorAll("[data-nav],[data-entity]").forEach((el) => {
        const go = () => (el.dataset.nav ? this.navigate(el.dataset.nav) : this.moreInfo(el.dataset.entity));
        el.addEventListener("click", go);
        el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
      });
    }

    getCardSize() {
      return 3;
    }

    getGridOptions() {
      return { columns: "full", min_columns: 6 };
    }
  }

  // ------------------------------------------------------------------ area card
  class AjnetwebAreaCard extends AjnBase {
    static getStubConfig() {
      return { area: "living_room", name: "Living Room", lights: [] };
    }

    validate(config) {
      if (!config.name && !config.area) throw new Error("ajnetweb-area-card: 'name' or 'area' is required");
    }

    watched() {
      const c = this._config;
      return [c.temperature, c.humidity, ...["lights", "climates", "covers", "media", "openings", "motion", "safety"]
        .flatMap((k) => c[k] || [])].filter(Boolean);
    }

    _countOn(key, test) {
      return (this._config[key] || []).map((id) => this.st(id))
        .filter((s) => s && !OFFLINE.includes(s.state) && test(s)).length;
    }

    async _toggleLights(ev) {
      ev.stopPropagation();
      const ids = (this._config.lights || []).filter((id) => this.st(id));
      if (!ids.length) return;
      const anyOn = ids.some((id) => this.st(id).state === "on");
      try {
        await this.call(anyOn ? "homeassistant.turn_off" : "homeassistant.turn_on", ids);
      } catch (e) {
        this.notify(`${this.t("failed")}: ${e.message || e}`);
      }
    }

    render() {
      const c = this._config;
      const lightsOn = this._countOn("lights", (s) => s.state === "on");
      const acOn = this._countOn("climates", (s) => s.state !== "off");
      const open = this._countOn("openings", (s) => s.state === "on");
      const motion = this._countOn("motion", (s) => s.state === "on");
      const alerts = this._countOn("safety", (s) => s.state === "on");
      const playing = this._countOn("media", (s) => s.state === "playing");
      const t = this.num(c.temperature);
      const h = this.num(c.humidity);
      const tUnit = (this.st(c.temperature) || { attributes: {} }).attributes.unit_of_measurement || "°";

      const climateTarget = (c.climates || []).map((id) => this.st(id))
        .find((s) => s && s.state !== "off" && !OFFLINE.includes(s.state));
      const target = climateTarget && climateTarget.attributes.temperature;

      const meta = [];
      if (t !== null) meta.push(`${Math.round(t * 10) / 10}${esc(tUnit)}`);
      if (h !== null) meta.push(`${Math.round(h)}%`);

      const ind = [];
      if (alerts) ind.push(["mdi:alert", "red", alerts]);
      if (open) ind.push(["mdi:door-open", "orange", open]);
      if (acOn) ind.push(["mdi:snowflake", "blue", target != null ? `${target}°` : acOn]);
      if (motion) ind.push(["mdi:motion-sensor", "teal", ""]);
      if (playing) ind.push(["mdi:music", "purple", ""]);

      const hasLights = (c.lights || []).length > 0;
      const active = lightsOn > 0;

      this.shadowRoot.innerHTML = `
        <style>
          ${AjnBase.baseStyle()}
          ha-card { transition: background .3s ease, box-shadow .3s ease; }
          ha-card.active { box-shadow: 0 0 0 1px rgba(${COLORS.amber}, .35), 0 8px 28px var(--ajn-glow, rgba(${COLORS.amber}, .18)); }
          .wrap { padding: 14px; display: grid; gap: 10px; min-height: 104px; box-sizing: border-box; height: 100%;
                  grid-template-rows: auto 1fr auto; }
          .top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
          .icon { width: 40px; height: 40px; border-radius: 14px; display: grid; place-items: center; flex: none;
                  background: rgba(var(--rgb-primary-text-color, 128,128,128), .08); color: var(--secondary-text-color);
                  transition: all .3s ease; }
          .active .icon { background: rgba(${COLORS.amber}, .2); color: rgb(${COLORS.amber}); }
          .icon ha-icon { --mdc-icon-size: 22px; }
          .toggle { width: 40px; height: 40px; border-radius: 50%; border: none; display: grid; place-items: center;
                    background: rgba(var(--rgb-primary-text-color, 128,128,128), .08); color: var(--secondary-text-color);
                    cursor: pointer; padding: 0; }
          .toggle.on { background: rgb(${COLORS.amber}); color: #1d1600; }
          .toggle ha-icon { --mdc-icon-size: 20px; }
          .name { font-size: 15px; font-weight: 600; color: var(--primary-text-color); line-height: 1.25;
                  overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
          .sub { font-size: 13px; color: var(--secondary-text-color); margin-top: 2px; white-space: nowrap; }
          .ind { display: flex; gap: 6px; flex-wrap: wrap; min-height: 24px; }
          .pill { display: inline-flex; align-items: center; gap: 3px; padding: 2px 8px 2px 6px; border-radius: 999px;
                  font-size: 12px; font-weight: 600; background: rgba(var(--c), .15); color: rgb(var(--c)); }
          .pill ha-icon { --mdc-icon-size: 15px; }
        </style>
        <ha-card class="${active ? "active" : ""}">
          <div class="wrap tap" tabindex="0" role="button" aria-label="${esc(c.name)}">
            <div class="top">
              <div class="icon"><ha-icon icon="${esc(c.icon || "mdi:floor-plan")}"></ha-icon></div>
              ${hasLights ? `<button class="toggle ${active ? "on" : ""}" aria-label="lights">
                <ha-icon icon="${active ? "mdi:lightbulb-on" : "mdi:lightbulb-outline"}"></ha-icon></button>` : ""}
            </div>
            <div>
              <div class="name">${esc(c.name || c.area)}</div>
              <div class="sub">${[meta.join(" · "), lightsOn ? `${lightsOn} ${this.t("lights_on", lightsOn)}` : ""]
                .filter(Boolean).join(" · ") || "&nbsp;"}</div>
            </div>
            <div class="ind">${ind.map(([icon, color, val]) =>
              `<span class="pill" style="--c:${COLORS[color]}"><ha-icon icon="${icon}"></ha-icon>${esc(val)}</span>`).join("")}</div>
          </div>
        </ha-card>`;

      const wrap = this.shadowRoot.querySelector(".wrap");
      const open_ = () => this.navigate(c.navigation_path);
      wrap.addEventListener("click", open_);
      wrap.addEventListener("keydown", (e) => { if (e.key === "Enter") open_(); });
      const btn = this.shadowRoot.querySelector(".toggle");
      if (btn) btn.addEventListener("click", (e) => this._toggleLights(e));
    }

    getCardSize() {
      return 2;
    }

    getGridOptions() {
      return { columns: 6, min_columns: 4, rows: "auto" };
    }
  }

  // ------------------------------------------------------------------ actions card
  class AjnetwebActionsCard extends AjnBase {
    static getStubConfig() {
      return { actions: [{ name: "All lights off", icon: "mdi:lightbulb-group-off", action: "light.turn_off",
                           target: { entity_id: "all" } }] };
    }

    validate(config) {
      if (!Array.isArray(config.actions)) throw new Error("ajnetweb-actions-card: 'actions' list is required");
    }

    async _run(btn, a) {
      if (a.navigation_path) return this.navigate(a.navigation_path);
      if (a.confirm && btn.dataset.armed !== "1") {
        btn.dataset.armed = "1";
        btn.classList.add("armed");
        btn.querySelector(".lbl").textContent = this.t("confirm");
        clearTimeout(btn._t);
        btn._t = setTimeout(() => this._disarm(btn, a), 3500);
        return;
      }
      this._disarm(btn, a);
      btn.classList.add("busy");
      try {
        const ids = a.target && a.target.entity_id;
        await this.call(a.action, Array.isArray(ids) ? ids : ids ? [ids] : [], a.data);
        btn.classList.add("ok");
        setTimeout(() => btn.classList.remove("ok"), 1200);
      } catch (e) {
        this.notify(`${this.t("failed")}: ${e.message || e}`);
      } finally {
        btn.classList.remove("busy");
      }
    }

    _disarm(btn, a) {
      clearTimeout(btn._t);
      btn.dataset.armed = "";
      btn.classList.remove("armed");
      btn.querySelector(".lbl").textContent = a.name;
    }

    render() {
      const acts = this._config.actions || [];
      this.shadowRoot.innerHTML = `
        <style>
          ${AjnBase.baseStyle()}
          ha-card { background: transparent; border: none; box-shadow: none; -webkit-backdrop-filter: none; backdrop-filter: none; }
          .row { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); padding: 2px; }
          button { min-width: 0; min-height: 52px; display: inline-flex; align-items: center;
                   justify-content: center; gap: 8px; padding: 0 16px; border-radius: var(--ajn-radius, 16px);
                   font: inherit; font-size: 14px; font-weight: 600; color: var(--primary-text-color); cursor: pointer;
                   background: var(--ajn-surface, var(--ha-card-background, var(--card-background-color)));
                   border: 1px solid var(--ajn-border, var(--divider-color));
                   -webkit-backdrop-filter: blur(var(--ajn-glass-blur, 0px)); backdrop-filter: blur(var(--ajn-glass-blur, 0px));
                   transition: transform .12s ease, background .2s ease; -webkit-tap-highlight-color: transparent; }
          button:active { transform: scale(.97); }
          button ha-icon { color: var(--ajn-accent, var(--primary-color)); }
          button.armed { background: rgba(${COLORS.orange}, .18); border-color: rgba(${COLORS.orange}, .5); }
          button.busy { opacity: .6; pointer-events: none; }
          button.ok ha-icon { color: rgb(${COLORS.green}); }
        </style>
        <ha-card><div class="row">${acts.map((a, i) => `
          <button data-i="${i}"><ha-icon icon="${esc(a.icon || "mdi:gesture-tap")}"></ha-icon>
            <span class="lbl">${esc(a.name)}</span></button>`).join("")}</div></ha-card>`;
      this.shadowRoot.querySelectorAll("button").forEach((btn) => {
        btn.addEventListener("click", () => this._run(btn, acts[+btn.dataset.i]));
      });
    }

    getCardSize() {
      return 1;
    }

    getGridOptions() {
      return { columns: 12, min_columns: 6, rows: "auto" };
    }
  }

  // ------------------------------------------------------------------ legacy cards (v1.x dashboards)
  class AjnetwebRoomCard extends AjnBase {
    render() {
      const c = this._config;
      this.shadowRoot.innerHTML = `
        <style>${AjnBase.baseStyle()} .w{padding:20px} .e{font-size:12px;font-weight:700;letter-spacing:.12em;
          text-transform:uppercase;color:var(--ajn-accent,var(--primary-color))} h1{margin:4px 0 0;font-size:24px;
          color:var(--primary-text-color)} .s{margin-top:4px}</style>
        <ha-card><div class="w"><div class="e">${esc(c.badge_text || "")}</div>
          <h1>${esc(c.title || "Smart Residence")}</h1><div class="s muted">${esc(c.subtitle || "")}</div></div></ha-card>`;
    }
  }

  class AjnetwebQuickScenes extends AjnetwebActionsCard {
    validate() {}

    setConfig(config) {
      const scenes = (config && config.scenes) || [];
      super.setConfig({ actions: scenes.map((s) => ({ name: s.name, icon: s.icon, action: "scene.turn_on",
                                                      target: { entity_id: s.action } })) });
    }
  }

  // ------------------------------------------------------------------ registration
  const CARDS = [
    ["ajnetweb-header-card", AjnetwebHeaderCard, "AJ Netweb Header", "Greeting, clock, weather, alarm and live status chips."],
    ["ajnetweb-area-card", AjnetwebAreaCard, "AJ Netweb Room", "Room summary with lights toggle and live indicators."],
    ["ajnetweb-actions-card", AjnetwebActionsCard, "AJ Netweb Actions", "Large touch buttons with tap-again confirmation."],
    ["ajnetweb-room-card", AjnetwebRoomCard, "AJ Netweb Hero (legacy)", "Kept for dashboards created by v1."],
    ["ajnetweb-quick-scenes", AjnetwebQuickScenes, "AJ Netweb Scenes (legacy)", "Kept for dashboards created by v1."],
  ];
  window.customCards = window.customCards || [];
  CARDS.forEach(([tag, cls, name, description]) => {
    if (!customElements.get(tag)) customElements.define(tag, cls);
    if (!window.customCards.some((c) => c.type === tag)) {
      window.customCards.push({ type: tag, name, description, preview: false,
                                documentationURL: "https://github.com/ajnetworksa/aj-netweb-addon" });
    }
  });

  console.info(`%c AJ NETWEB CARDS %c ${VERSION} `,
    "background:#2f7dd1;color:#fff;font-weight:700;border-radius:3px 0 0 3px",
    "background:#151823;color:#fff;border-radius:0 3px 3px 0");
})();
