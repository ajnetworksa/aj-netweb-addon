// Preview: runs the real strategy + cards against dev/sample-house.json with a fake `hass`.
// Native HA cards (thermostat, media-control, ...) are drawn as grey placeholders.
import "./icons.js";
import "../src/index.js";

const params = new URLSearchParams(location.search);
const q = (k, d) => params.get(k) || d;
const data = await (await fetch(q("house", "sample-house") + ".json")).json();
const themes = await (await fetch("themes.json")).json();
const modeQ = q("mode", "dark");
// HA-style theme registry (name -> {modes}) so the strategy and the appearance picker see real themes
const registry = Object.fromEntries(Object.values(themes).map((t) => {
  const { __name, ...modes } = t;
  return [__name, { modes }];
}));
function applyTheme(key) {
  const theme = themes[key] || Object.values(themes)[0];
  const { __name, ...modes } = theme;
  const mode = modes[modeQ] || Object.values(modes)[0];
  const dark = !("light" in modes) || modeQ === "dark";
  document.getElementById("theme").textContent = ":root{" + Object.entries(mode).map(([k, v]) => `--${k}:${v};`).join("")
    + `--rgb-primary-text-color:${dark ? "238,241,246" : "21,24,35"}}`;
}
applyTheme(q("theme", "apple_frosted_glass"));
// per-user data (frontend/get_user_data) kept in localStorage; ?me={"palette":"sunset",...} sets it for screenshots
const userData = (() => {
  try { return JSON.parse(q("me", "") || localStorage.getItem("ajn-preview-me") || "{}"); } catch (e) { return {}; }
})();

// extra sample data for the graph / agenda / energy cards
[["majlis", 23.1], ["master_bedroom", 21.6], ["kids_room", 22.4]].filter(([a]) => data.areas[a]).forEach(([area, v]) => {
  const id = `sensor.${area}_temperature`;
  data.states[id] = { entity_id: id, state: String(v), attributes: { friendly_name: `${data.areas[area].name} Temperature`, device_class: "temperature", unit_of_measurement: "°C" } };
  data.entities[id] = { entity_id: id, area_id: area, entity_category: null, labels: [] };
});
data.states["sensor.house_power"] = { entity_id: "sensor.house_power", state: "3420", attributes: { friendly_name: "House power", device_class: "power", unit_of_measurement: "W" } };
// house modes helper (the Dashboard Suite creates it with Studio → House modes); ?modes=0 hides it
if (q("modes", "1") !== "0") data.states["input_select.ajnetweb_house_mode"] = { entity_id: "input_select.ajnetweb_house_mode", state: "home",
  attributes: { friendly_name: "House mode", options: ["home", "away", "night", "guests"], icon: "mdi:home-switch" } };
// water: tanks, booster pump, watering zones and the Studio's watering timer script; ?water=0 hides them
if (q("water", "1") !== "0") {
  const ago = (h) => new Date(Date.now() - h * 3600000).toISOString();
  const add = (id, state, attributes, area, h = 1) => {
    data.states[id] = { entity_id: id, state, last_changed: ago(h), attributes };
    if (area) data.entities[id] = { entity_id: id, area_id: area, entity_category: null, labels: [] };
  };
  add("sensor.roof_tank_level", "64", { friendly_name: "Roof tank", unit_of_measurement: "%" }, "entrance");
  add("sensor.ground_tank_level", "17", { friendly_name: "Ground tank", unit_of_measurement: "%" }, "entrance");
  add("switch.booster_pump", "on", { friendly_name: "Booster pump" }, "entrance");
  add("valve.front_lawn", "closed", { friendly_name: "Front lawn", device_class: "water" }, "entrance", 5);
  add("switch.drip_line_palms", "on", { friendly_name: "Drip line palms" }, "entrance", 0.2);
  add("valve.backyard_sprinklers", "closed", { friendly_name: "Backyard sprinklers", device_class: "water" }, "entrance", 30);
  add("script.ajnetweb_water_run", "off", { friendly_name: "AJ Netweb - Water a zone" });
}
data.states["calendar.family"] = { entity_id: "calendar.family", state: "off", last_changed: "x", attributes: { friendly_name: "Family" } };
data.states["calendar.school"] = { entity_id: "calendar.school", state: "off", last_changed: "x", attributes: { friendly_name: "School" } };
const day0 = new Date(); day0.setHours(0, 0, 0, 0);
const at = (d, h, m = 0) => new Date(day0.getTime() + d * 86400000 + (h * 60 + m) * 60000).toISOString();
const wave = (id, base, amp, phase) => [...Array(97)].map((_, i) => ({ s: String(base + amp * Math.sin(i / 15 + phase) + (i % 7) * 0.05),
  lu: (Date.now() - (96 - i) * 15 * 60000) / 1000 }));

// speakers that can be grouped (Music Assistant / Sonos style)
Object.values(data.states).filter((st) => st.entity_id.startsWith("media_player.") && st.attributes.device_class !== "tv")
  .forEach((st) => { st.attributes.supported_features = (st.attributes.supported_features || 0) | 524288; st.attributes.group_members = [st.entity_id]; });

// ?ring=1 : the doorbell is ringing (Intercom add-on sensor)
if (q("ring", "")) data.states["sensor.ajnetweb_doorbell"] = { entity_id: "sensor.ajnetweb_doorbell", state: "ringing", last_changed: new Date().toISOString(),
  attributes: { friendly_name: "Doorbell", rang_at: new Date().toISOString(), show_seconds: 60, camera: Object.keys(data.states).find((k) => k.startsWith("camera.")),
    doors: [{ door: 1, name: "Main Gate", button: "input_button.ajnetweb_open_door_1" }, { door: 2, name: "Pedestrian Door", button: "input_button.ajnetweb_open_door_2" }] } };
["1", "2"].forEach((n) => (data.states[`input_button.ajnetweb_open_door_${n}`] = { entity_id: `input_button.ajnetweb_open_door_${n}`, state: "unknown", attributes: { friendly_name: `Open door ${n}` } }));

const lang = q("lang", "en");
const userObj = { id: "u1", is_admin: q("admin", "1") === "1", name: q("user", "Owner") };
const hass = {
  ...data, language: lang, user: userObj,  // ?user=Mama&admin=0
  locale: { language: lang, time_format: "12" },
  config: { location_name: "Villa Al Noor", unit_system: { temperature: "°C" } },
  themes: { themes: registry, darkMode: modeQ === "dark" },
  callWS: async (msg) => {
    if (msg.type === "frontend/get_user_data") return { value: userData };
    if (msg.type === "auth/current_user") return { ...userObj };
    if (msg.type === "frontend/get_themes") return { themes: registry, default_theme: "default", default_dark_theme: null };
    if (msg.type === "history/history_during_period") return Object.fromEntries(msg.entity_ids.map((id, i) =>
      [id, wave(id, parseFloat((hass.states[id] || {}).state) || 22, 1.4 + i * 0.3, i)]));
    if (msg.type === "logbook/get_events") {   // a few things that "happened" for the notifications bell
      const ago = (min) => Date.now() / 1000 - min * 60;
      const ids = msg.entity_ids || [];
      return [[ids.find((i) => i.startsWith("alarm_control_panel.")), "armed_away", 30], [ids.find((i) => i.startsWith("alarm_control_panel.")), "disarmed", 400],
        [ids.find((i) => i.startsWith("binary_sensor.")), "on", 95], [ids.find((i) => i.startsWith("binary_sensor.")), "off", 90],
        ["sensor.ajnetweb_doorbell", "ringing", 12], [ids.find((i) => i.startsWith("binary_sensor.")), "on", 60 * 26]]
        .filter(([id]) => id && ids.includes(id)).map(([entity_id, state, min]) => ({ entity_id, state, when: ago(min) }));
    }
    if (msg.type === "energy/get_prefs") return { energy_sources: [
      { type: "grid", flow_from: [{ stat_energy_from: "sensor.grid_import", stat_cost: "sensor.grid_cost" }], flow_to: [{ stat_energy_to: "sensor.grid_export" }] },
      { type: "solar", stat_energy_from: "sensor.solar_energy" }],
      device_consumption: [{ stat_consumption: "sensor.majlis_ac_energy" }, { stat_consumption: "sensor.fridge_energy" }] };
    if (msg.type === "recorder/statistics_during_period") {
      const base = { "sensor.grid_import": 28, "sensor.grid_cost": 5.2, "sensor.grid_export": 3, "sensor.solar_energy": 14,
        "sensor.majlis_ac_energy": 17, "sensor.fridge_energy": 2 };
      // ?cost=0: no cost sensor, so the card estimates the bill from the tariff
      if (params.get("cost") === "0") base["sensor.grid_cost"] = 0;
      if (msg.period === "month") return Object.fromEntries(msg.statistic_ids.map((id) => [id, [{
        start: Date.parse(msg.start_time), change: base[id] * (new Date().getDate() - 0.5) }]]));
      return Object.fromEntries(msg.statistic_ids.map((id) => [id, [...Array(7)].map((_, d) => ({
        start: Date.parse(msg.start_time) + d * 86400000, change: base[id] * (d === 6 ? 0.55 : 0.8 + ((d * 37) % 5) / 10) }))]));
    }
    if (msg.type === "lovelace/config") return { views: [   // a sample "My cards" dashboard
      { title: "On Home", sections: [{ type: "grid", column_span: 4, cards: [{ type: "heading", heading: "Pool & garden" },
        { type: "custom:ajnetweb-device-card", entity: "light.living_room_ceiling", name: "Pool lights", grid_options: { columns: 6 } },
        { type: "custom:ajnetweb-device-card", entity: "switch.main_gate", name: "Sprinklers", grid_options: { columns: 6 } }] }] },
      { title: "Garden", path: "garden", sections: [{ type: "grid", cards: [{ type: "heading", heading: "Garden" }] }] }] };
    if (msg.type === "call_service" && msg.service === "get_forecasts") {
      const conds = ["sunny", "partlycloudy", "sunny", "cloudy", "sunny", "windy"];
      return { response: { [msg.target.entity_id]: { forecast: conds.map((c, i) => ({
        datetime: new Date(Date.now() + i * 86400000).toISOString(), condition: c,
        temperature: 38 + (i % 3) - (i === 3 ? 4 : 0), templow: 27 + (i % 2) })) } } };
    }
    if (msg.type === "frontend/set_user_data") {
      try { localStorage.setItem("ajn-preview-me", JSON.stringify(msg.value)); } catch (e) { /* private mode */ }
      params.delete("me");
      return null;
    }
    if (msg.type === "config_entries/get") return [{ entry_id: "ma1", state: "loaded" }];
    if (msg.type === "call_service" && msg.domain === "music_assistant") {
      console.log("music_assistant", msg.service, msg.service_data);
      const img = (h) => `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Crect width='100' height='100' fill='hsl(${h},55%25,45%25)'/%3E%3C/svg%3E`;
      const items = (type, names) => names.map((name, i) => ({ media_type: type, uri: `ytmusic://${type}/${i}`, name, image: img(i * 50 + type.length * 20), artists: [{ name: "Various" }] }));
      if (msg.service === "get_library") return { response: { items: items(msg.service_data.media_type, msg.service_data.media_type === "radio" ? ["Quran Radio", "Mix FM"] : ["Evening Oud", "Road Trip", "Kids Songs"]) } };
      if (msg.service === "search") return { response: { tracks: items("track", ["Result one", "Result two", "Result three"]), playlists: items("playlist", ["Best of " + msg.service_data.name]) } };
    }
    return [{ id: "u1", is_owner: true, group_ids: ["system-admin"] }];
  },
  callApi: async (method, url) => (url.startsWith("calendars/calendar.family") ? [
    { summary: "Family lunch at grandma's", start: { dateTime: at(0, 13, 30) }, end: { dateTime: at(0, 15) }, location: "Al Olaya" },
    { summary: "Pool service", start: { dateTime: at(1, 9) }, end: { dateTime: at(1, 10) } },
    { summary: "Eid holiday", start: { date: at(3, 0).slice(0, 10) }, end: { date: at(4, 0).slice(0, 10) } }]
    : url.startsWith("calendars/calendar.school") ? [{ summary: "Parents' evening", start: { dateTime: at(1, 18) }, end: { dateTime: at(1, 19, 30) }, location: "School" }] : []),
  callService: async (domain, service, d) => {
    console.log("callService", domain, service, d);
    // simulate HA: flip states so the preview reacts
    if (domain === "media_player" && (service === "join" || service === "unjoin")) {
      const S = { ...hass.states };
      const set = (id, members) => { S[id] = { ...S[id], attributes: { ...S[id].attributes, group_members: members } }; };
      if (service === "join") { const lead = d.entity_id[0]; const m = [...new Set([...(S[lead].attributes.group_members || [lead]), ...d.group_members])];
        m.forEach((id) => set(id, m)); }
      else d.entity_id.forEach((id) => { Object.keys(S).filter((k) => (S[k].attributes.group_members || []).includes(id) && k !== id)
        .forEach((k) => set(k, S[k].attributes.group_members.filter((x) => x !== id))); set(id, [id]); });
      hass.states = S;
      document.querySelectorAll("*").forEach((el) => { if (el.setConfig && el._hass) el.hass = { ...hass }; });
      return;
    }
    // watering timer script: open the zone the card asked for
    if (domain === "script" && d.variables && d.variables.zone) d = { entity_id: d.variables.zone };
    if (domain === "script" && d.entity_id) service = String(d.entity_id).startsWith("valve.") ? "open_valve" : "turn_on";
    [].concat(d.entity_id || []).forEach((id) => {
      const st = hass.states[id];
      if (!st) return;
      const ns = { ...st, attributes: { ...st.attributes } };
      if (service === "toggle") ns.state = st.state === "on" ? "off" : "on";
      if (service === "turn_on") ns.state = "on";
      if (service === "open_valve") ns.state = "open";
      if (service === "close_valve") ns.state = "closed";
      if (service === "turn_off") ns.state = "off";
      if (service === "select_option") ns.state = d.option;
      if (d.brightness_pct != null) { ns.state = "on"; ns.attributes.brightness = Math.round(d.brightness_pct * 2.55); }
      if (d.temperature != null) ns.attributes.temperature = d.temperature;
      hass.states = { ...hass.states, [id]: ns };
    });
    document.querySelectorAll("*").forEach((el) => { if (el.setConfig && el._hass) el.hass = { ...hass }; });
  },
  formatEntityState: (s) => ({ on: "On", off: "Off", cool: "Cool", heat: "Heat", locked: "Locked", unlocked: "Unlocked",
    playing: "Playing", open: "Open", closed: "Closed", disarmed: "Disarmed", sunny: "Sunny", home: "Home", idle: "Idle" }[s.state] || s.state),
  formatEntityAttributeValue: (s, a) => ({ cooling: "Cooling", heating: "Heating", off: "Off", idle: "Idle" }[s.attributes[a]] || s.attributes[a]),
};

const viewPath = q("view", "home");
history.replaceState(null, "", `/villa-home/${viewPath}${location.search}`);
let options = {};
try { options = JSON.parse(q("options", "{}")); } catch (e) { console.warn("bad options JSON"); }
// ?late=1 : build before the user and the theme list have arrived, like HA does on a cold start
const cfg = await customElements.get("ll-strategy-dashboard-ajnetweb").generate(options,
  q("late", "") ? { ...hass, user: null, themes: { themes: {}, darkMode: modeQ === "dark" } } : hass);
window.dashboardConfig = cfg; // inspect in the browser console

const nav = document.getElementById("views");
nav.innerHTML = cfg.views.map((v) => `<option value="${v.path}" ${v.path === viewPath ? "selected" : ""}>${v.title}</option>`).join("");
nav.onchange = () => { params.set("view", nav.value); location.search = params.toString(); };

const v = cfg.views.find((x) => x.path === viewPath) || cfg.views[0];
// the view's theme (dashboard or personal) and wallpaper, like HA applies them
const viewThemeKey = Object.keys(themes).find((k) => themes[k].__name === v.theme);
if (viewThemeKey && !params.get("theme")) applyTheme(viewThemeKey);
if (v.background) document.body.style.background = v.background;
// Same column rules as HA's sections view (hui-sections-view.ts): min 320 px, max 500 px per column,
// 32 px gaps (8 px under 600 px), capped by max_columns; each section has a 12 x column_span grid.
const narrow = innerWidth <= 600;
const gap = narrow ? 8 : 32;
const fit = Math.max(1, Math.floor((innerWidth - 2 * gap + gap) / (320 + gap)));
const cols = Math.min(v.max_columns || 4, fit);
const view = document.getElementById("view");
view.style.setProperty("--cols", cols);
view.style.setProperty("--gap", gap + "px");
view.style.maxWidth = `${cols * 500 + (cols - 1) * gap}px`;
for (const s of v.sections) {
  const sec = document.createElement("div");
  sec.className = "sec";
  const span = Math.min(s.column_span || 1, cols);
  sec.style.gridColumn = `span ${span}`;
  sec.style.gridRow = `span ${s.row_span || 1}`;
  sec.style.setProperty("--gc", 12 * span);
  view.appendChild(sec);
  for (const c of s.cards) {
    // card visibility (HA "screen" conditions)
    if ((c.visibility || []).some((v) => v.condition === "screen" && !matchMedia(v.media_query).matches)) continue;
    const go = c.grid_options || {};
    const span = go.columns === "full" || c.type === "heading" ? "full" : (go.columns || 12);
    let el;
    if (c.type.startsWith("custom:")) { el = document.createElement(c.type.slice(7)); el.setConfig(c); el.hass = hass; }
    else if (c.type === "horizontal-stack") {
      // like HA's hui-horizontal-stack-card: one row, equal widths, equal heights
      el = document.createElement("div"); el.style.cssText = "display:flex;gap:8px;align-items:stretch;min-width:0";
      const ok = (cond) => cond.condition === "or" ? cond.conditions.some(ok) : cond.condition === "not" ? !cond.conditions.some(ok)
        : (hass.states[cond.entity] || {}).state === cond.state;
      c.cards.forEach((cc) => {
        if (cc.type === "conditional") { if (!cc.conditions.every(ok)) return; cc = cc.card; }
        let x;
        if (cc.type.startsWith("custom:")) { x = document.createElement(cc.type.slice(7)); x.setConfig(cc); x.hass = hass; }
        else { x = document.createElement("div"); x.className = "ph"; x.textContent = `native ${cc.type}: ${cc.entity || ""}`; }
        x.style.cssText = "flex:1 1 0;min-width:0"; el.appendChild(x);
      });
    }
    else if (c.type === "heading") { el = document.createElement("div"); el.className = "heading"; el.innerHTML = `<ha-icon icon="${c.icon || ""}"></ha-icon>${c.heading}`; }
    else { el = document.createElement("div"); el.className = "ph"; el.textContent = `native ${c.type}: ${c.entity || c.name || ""}`; }
    if (span === "full") el.style.gridColumn = "1 / -1";
    else el.style.gridColumn = `span min(${span}, ${12 * Math.min(s.column_span || 1, cols)})`;
    sec.appendChild(el);
  }
}
