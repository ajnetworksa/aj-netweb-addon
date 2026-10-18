// Preview: runs the real strategy + cards against dev/sample-house.json with a fake `hass`.
// Native HA cards (thermostat, media-control, ...) are drawn as grey placeholders.
import "./icons.js";
import "../src/index.js";

const params = new URLSearchParams(location.search);
const q = (k, d) => params.get(k) || d;
const data = await (await fetch("sample-house.json")).json();
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

const lang = q("lang", "en");
const hass = {
  ...data, language: lang, user: { id: "u1", is_admin: q("admin", "1") === "1", name: q("user", "Owner") },  // ?user=Mama&admin=0
  locale: { language: lang, time_format: "12" },
  config: { location_name: "Villa Al Noor", unit_system: { temperature: "°C" } },
  themes: { themes: registry, darkMode: modeQ === "dark" },
  callWS: async (msg) => {
    if (msg.type === "frontend/get_user_data") return { value: userData };
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
  callService: async (domain, service, d) => {
    console.log("callService", domain, service, d);
    // simulate HA: flip states so the preview reacts
    (d.entity_id || []).forEach((id) => {
      const st = hass.states[id];
      if (!st) return;
      const ns = { ...st, attributes: { ...st.attributes } };
      if (service === "toggle") ns.state = st.state === "on" ? "off" : "on";
      if (service === "turn_on") ns.state = "on";
      if (service === "turn_off") ns.state = "off";
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
const cfg = await customElements.get("ll-strategy-dashboard-ajnetweb").generate(options, hass);
window.dashboardConfig = cfg; // inspect in the browser console

const nav = document.getElementById("views");
nav.innerHTML = cfg.views.map((v) => `<option value="${v.path}" ${v.path === viewPath ? "selected" : ""}>${v.title}</option>`).join("");
nav.onchange = () => { params.set("view", nav.value); location.search = params.toString(); };

const v = cfg.views.find((x) => x.path === viewPath) || cfg.views[0];
// the view's theme (dashboard or personal) and wallpaper, like HA applies them
const viewThemeKey = Object.keys(themes).find((k) => themes[k].__name === v.theme);
if (viewThemeKey && !params.get("theme")) applyTheme(viewThemeKey);
if (v.background) document.body.style.background = v.background;
const cols = Math.min(v.max_columns || 4, innerWidth < 600 ? 1 : innerWidth < 1000 ? 2 : innerWidth < 1400 ? 3 : 4);
const view = document.getElementById("view");
view.style.setProperty("--cols", cols);
for (const s of v.sections) {
  const sec = document.createElement("div");
  sec.className = "sec";
  sec.style.gridColumn = `span ${Math.min(s.column_span || 1, cols)}`;
  view.appendChild(sec);
  for (const c of s.cards) {
    const span = c.grid_options && c.grid_options.columns === "full" ? 12 : (c.grid_options && c.grid_options.columns) || 12;
    let el;
    if (c.type.startsWith("custom:")) { el = document.createElement(c.type.slice(7)); el.setConfig(c); el.hass = hass; }
    else if (c.type === "heading") { el = document.createElement("div"); el.className = "heading"; el.innerHTML = `<ha-icon icon="${c.icon || ""}"></ha-icon>${c.heading}`; }
    else { el = document.createElement("div"); el.className = "ph"; el.textContent = `native ${c.type}: ${c.entity || c.name || ""}`; }
    el.style.setProperty("--c", span);
    sec.appendChild(el);
  }
}
