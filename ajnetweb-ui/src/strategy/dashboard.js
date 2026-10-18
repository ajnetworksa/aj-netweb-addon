// Dashboard strategy:  strategy: { type: custom:ajnetweb, ...options }
// Generates the whole dashboard in the browser from HA's areas/floors/devices, so new
// devices appear automatically - no redeploy. Works in any HA with only this file loaded.
//
// Options (all optional):
//   title, language (en|ar), theme (HA theme name applied to every view), header_image
//   exclude_entities: [], hidden_areas: [], favorites: [], weather, alarm
//   views: { panel, lights, climate, security, cameras, media, installer }   (true/false)
//   navbar: true, room_tap: popup|navigate, panel_live_cameras: true, cameras_live: false
//   shortcuts: [{ name, icon, navigation_path }]   e.g. intercom / CCTV add-on panels
//   branding: { company, phone, email, website, notes }, admins: [user ids]
//   prayer: true (prayer card when prayer times exist), music: true, music_players: [...],
//   music_assistant_entry: <config entry id> (enables search/favourites for non-admin users)
import { buildModel, idsOf, roomEntities, slug } from "../core/model.js";
import { translate, langOf } from "../core/i18n.js";
import { hasPrayerTimes } from "../cards/prayer.js";
import { musicPlayers } from "../cards/music.js";

const ALARM_BITS = [[1, "armed_home"], [2, "armed_away"], [4, "armed_night"], [32, "armed_vacation"], [16, "armed_custom_bypass"]];

export async function generateDashboard(config, hass) {
  const cfg = config || {};
  const lang = langOf(hass, cfg.language);
  const t = (k, n, v) => translate(lang, k, n, v);
  const on = (k) => (cfg.views || {})[k] !== false;
  const base = "/" + (window.location.pathname.split("/")[1] || "lovelace");
  const path = (p) => `${base}/${p}`;
  const model = buildModel(hass, { exclude_entities: cfg.exclude_entities, hidden_areas: cfg.hidden_areas });
  const rooms = model.rooms;
  const all = (g) => rooms.flatMap((r) => r[g]);
  const ids = (g, domain) => all(g).filter((e) => !domain || e.domain === domain).map((e) => e.entity_id);
  const roomPath = (r) => path(`room-${slug(r.id)}`);
  const withLang = (c) => (cfg.language ? Object.assign(c, { language: cfg.language }) : c);

  const showPrayer = cfg.prayer !== false && hasPrayerTimes(hass);
  const players = cfg.music === false ? [] : (cfg.music_players || musicPlayers(hass));
  const musicCard = (extra) => withLang({
    type: "custom:ajnetweb-music-card", entities: players,
    ...(cfg.music_assistant_entry ? { music_assistant_entry: cfg.music_assistant_entry } : {}),
    grid_options: { columns: 12 }, ...extra,
  });

  // ---------------------------------------------------------------- card factories
  const heading = (text, icon, nav, style = "subtitle") => {
    const c = { type: "heading", heading: text, heading_style: style };
    if (icon) c.icon = icon;
    if (nav) c.tap_action = { action: "navigate", navigation_path: nav };
    return c;
  };
  const section = (cards, span) => (span ? { type: "grid", column_span: span, cards } : { type: "grid", cards });
  const device = (e, opts = {}) => withLang({
    type: "custom:ajnetweb-device-card", entity: e.entity_id, name: opts.name || e.name,
    ...(opts.layout ? { layout: opts.layout } : {}), ...(e.group === "access" ? { access: true } : {}),
    grid_options: { columns: opts.layout === "wide" || e.domain === "climate" ? 12 : 6 },
  });
  const camera = (e, live) => (live
    ? { type: "picture-entity", entity: e.entity_id, name: e.name, camera_view: "live", show_state: false,
        grid_options: { columns: 6 } }
    : { type: "custom:ajnetweb-camera-card", entity: e.entity_id, name: e.name, grid_options: { columns: 6 } });
  const actions = (items, style) => {
    const list = items.filter(Boolean);
    return list.length ? withLang({ type: "custom:ajnetweb-actions-card", actions: list, ...(style ? { style } : {}),
                                    grid_options: { columns: 12 } }) : null;
  };
  const areaCard = (r) => withLang({
    type: "custom:ajnetweb-area-card", area: r.id, name: r.name, icon: r.icon,
    ...(r.picture ? { picture: r.picture } : {}),
    entities: roomEntities(r),
    ...(r.temperature[0] ? { temperature: r.temperature[0].entity_id } : {}),
    ...(r.humidity[0] ? { humidity: r.humidity[0].entity_id } : {}),
    tap_action: cfg.room_tap === "navigate" ? "navigate" : "popup",
    navigation_path: roomPath(r),
    grid_options: { columns: 6 },
  });

  // ---------------------------------------------------------------- shared pieces
  const lightsOff = () => {
    const l = ids("lights");
    return l.length ? { name: t("all_lights_off"), icon: "mdi:lightbulb-group-off", action: "homeassistant.turn_off",
                        target: { entity_id: l }, confirm: true } : null;
  };
  const acOff = () => {
    const c = ids("climates", "climate");
    return c.length ? { name: t("all_ac_off"), icon: "mdi:air-conditioner", action: "climate.turn_off",
                        target: { entity_id: c }, confirm: true } : null;
  };
  const shades = () => {
    const c = ids("covers");
    return c.length ? [
      { name: t("open_shades"), icon: "mdi:curtains", action: "cover.open_cover", target: { entity_id: c } },
      { name: t("close_shades"), icon: "mdi:curtains-closed", action: "cover.close_cover", target: { entity_id: c } },
    ] : [];
  };
  const weather = cfg.weather || (model.house.weather.includes("weather.forecast_home") ? "weather.forecast_home" : model.house.weather[0]);
  const alarm = cfg.alarm || ids("alarms")[0];

  const header = (variant) => {
    const chips = [];
    if (ids("lights").length) chips.push({ icon: "mdi:lightbulb-on", entities: ids("lights"), active: ["on"],
      label: "lights_on", navigation_path: path("lights"), color: "amber" });
    if (ids("climates").length) chips.push({ icon: "mdi:snowflake", entities: ids("climates"), inactive: ["off"],
      label: "ac_running", navigation_path: path("climate"), color: "blue" });
    if (ids("openings").length) chips.push({ icon: "mdi:door-open", entities: ids("openings"), active: ["on"],
      label: "open", ok_label: "all_closed", ok_icon: "mdi:shield-home", navigation_path: path("security"), color: "orange" });
    if (ids("safety").length) chips.push({ icon: "mdi:alert", entities: ids("safety"), active: ["on"],
      label: "alerts", navigation_path: path("security"), color: "red" });
    if (ids("media").length) chips.push({ icon: "mdi:play-circle", entities: ids("media"), active: ["playing"],
      label: "playing", navigation_path: path("media"), color: "purple" });
    return withLang({
      type: "custom:ajnetweb-header-card", title: cfg.title || hass.config.location_name || "",
      variant, chips, grid_options: { columns: "full" },
      ...(weather ? { weather } : {}), ...(alarm ? { alarm, alarm_navigation_path: path("security") } : {}),
      ...(model.house.persons.length ? { persons: model.house.persons.slice(0, 6) } : {}),
      ...(cfg.header_image ? { image: cfg.header_image } : {}),
    });
  };

  const roomSections = () => {
    const floors = Object.fromEntries(model.floors.map((f) => [f.id, f]));
    const groups = new Map();
    rooms.forEach((r) => {
      if (r.id === "unassigned" && !["lights", "climates", "covers", "media", "switches"].some((g) => r[g].length)) return;
      const key = floors[r.floor_id] ? r.floor_id : "_none";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r);
    });
    const order = [...model.floors.map((f) => f.id).filter((id) => groups.has(id)), ...(groups.has("_none") ? ["_none"] : [])];
    return order.map((key) => {
      const list = groups.get(key);
      const f = floors[key];
      return section([heading(f ? f.name : t("rooms"), f ? f.icon : "mdi:floor-plan"), ...list.map(areaCard)],
                     list.length > 2 ? 2 : undefined);
    });
  };

  // ---------------------------------------------------------------- views
  const views = [];
  const homeSections = (panel) => {
    const top = [header(panel ? "panel" : "default")];
    if (showPrayer) top.push(withLang({ type: "custom:ajnetweb-prayer-card", variant: panel ? "panel" : "default",
                                        grid_options: { columns: 12 } }));
    const out = [section(top, 4)];
    const quick = [];
    const scenes = all("scenes");
    if (scenes.length) {
      quick.push(heading(t("scenes"), "mdi:palette"),
        actions(scenes.slice(0, 12).map((e) => ({ name: e.full_name, icon: (hass.states[e.entity_id].attributes.icon) || "mdi:palette",
                                                    action: "scene.turn_on", target: { entity_id: e.entity_id } })), "chips"));
    }
    const access = all("access");
    if (access.length) quick.push(heading(t("access"), "mdi:shield-key", path("security")),
      ...access.slice(0, 6).map((e) => device(e, { name: e.full_name })));
    const favIds = new Set(cfg.favorites || []);
    const favs = rooms.flatMap((r) => Object.values(r).filter(Array.isArray).flat()).filter((e) => e && favIds.has(e.entity_id));
    if (favs.length) quick.push(heading(t("favorites"), "mdi:star"), ...favs.slice(0, 12).map((e) => device(e, { name: e.full_name })));
    const acts = actions([...(cfg.shortcuts || []), lightsOff(), acOff(), ...shades()]);
    if (acts) quick.push(acts);
    const cams = all("cameras");
    if (panel && cams.length) {
      out.push(section([heading(t("cameras"), "mdi:cctv", path("cameras")),
        ...cams.slice(0, 4).map((c) => camera(c, cfg.panel_live_cameras !== false))], 2));
    }
    if (quick.length) out.splice(panel ? out.length : 1, 0, section(quick));
    if (players.length) {
      out.push(section([heading(t("music"), "mdi:music", path("media")),
        musicCard({ variant: panel ? "full" : "compact", search: panel })]));
    }
    out.push(...roomSections());
    const climates = all("climates");
    if (climates.length) {
      out.push(section([heading(t("climate"), "mdi:thermostat", path("climate")),
        ...climates.slice(0, 6).map((e) => device(e, { name: e.full_name, layout: "wide" }))]));
    }
    if (!panel && cams.length) {
      out.push(section([heading(t("cameras"), "mdi:cctv", path("cameras")), ...cams.slice(0, 4).map((c) => camera(c, false))]));
    }
    return out;
  };
  const view = (title, p, icon, sections, extra = {}) => Object.assign({
    title, path: p, icon, type: "sections", max_columns: extra.max_columns || 4, dense_section_placement: true,
    sections, ...(cfg.theme ? { theme: cfg.theme } : {}),
  }, extra, { max_columns: extra.max_columns || 4 });

  const perRoom = (groups, layout) => rooms.map((r) => {
    const ents = groups.flatMap((g) => r[g]);
    if (!ents.length) return null;
    return section([heading(r.name, r.icon, roomPath(r)), ...ents.map((e) => device(e, { layout: layout || (e.domain === "climate" ? "wide" : undefined) }))]);
  }).filter(Boolean);

  views.push(view(t("home"), "home", "mdi:home", homeSections(false)));
  if (on("panel")) views.push(view(t("panel"), "tablet", "mdi:tablet-dashboard", homeSections(true)));
  if (on("lights") && all("lights").length) {
    views.push(view(t("lights"), "lights", "mdi:lightbulb-group",
      [section([actions([lightsOff()])], 4), ...perRoom(["lights"])].filter((s) => s.cards[0])));
  }
  if (on("climate") && (all("climates").length || all("temperature").length)) {
    views.push(view(t("climate"), "climate", "mdi:thermostat",
      [section([actions([acOff()])].filter(Boolean), 4), ...perRoom(["climates", "fans"]),
       ...perRoom(["temperature", "humidity", "air"])].filter((s) => s.cards.length)));
  }
  if (on("security") && ["access", "alarms", "openings", "motion", "safety"].some((g) => all(g).length)) {
    const sec = [];
    all("alarms").forEach((e) => {
      const sf = (hass.states[e.entity_id].attributes.supported_features) || 0;
      sec.push(section([heading(t("alarm"), "mdi:shield-home"), {
        type: "tile", entity: e.entity_id, name: e.full_name, grid_options: { columns: 12 }, features_position: "bottom",
        features: [{ type: "alarm-modes", modes: [...ALARM_BITS.filter(([b]) => sf & b).map(([, m]) => m), "disarmed"] }],
      }]));
    });
    if (all("access").length) sec.push(section([heading(t("access"), "mdi:shield-key"), ...all("access").map((e) => device(e, { name: e.full_name }))]));
    if (ids("openings").length) {
      sec.push(section([{ type: "entity-filter", entities: ids("openings"), show_empty: false,
        conditions: [{ condition: "state", state: "on" }], card: { type: "entities", title: t("open_now") },
        grid_options: { columns: 12 } }]));
    }
    [["openings", "mdi:door"], ["motion", "mdi:motion-sensor"], ["safety", "mdi:smoke-detector"]].forEach(([g, icon]) => {
      if (all(g).length) sec.push(section([heading(t(g), icon), ...all(g).map((e) => device(e, { name: e.full_name }))]));
    });
    views.push(view(t("security"), "security", "mdi:shield-home", sec));
  }
  if (on("cameras") && all("cameras").length) {
    views.push(view(t("cameras"), "cameras", "mdi:cctv", [section(all("cameras").map((c) => camera(c, !!cfg.cameras_live)), 4)]));
  }
  if (on("media") && (players.length || all("media").length)) {
    // Music page: full player (search, favourites, rooms) + every speaker grouped by room
    const secs = [];
    if (players.length) secs.push(section([musicCard({ variant: "full" })], 2));
    rooms.filter((r) => r.media.length).forEach((r) => secs.push(section([heading(r.name, r.icon, roomPath(r)),
      ...r.media.map((e) => withLang({ type: "custom:ajnetweb-music-card", entities: [e.entity_id], variant: "compact",
                                       grid_options: { columns: 12 } }))])));
    views.push(view(t("music"), "media", "mdi:music", secs));
  }
  if (on("installer") && hass.user && hass.user.is_admin) views.push(await installerView(cfg, hass, t, model, view, section, heading));

  // room pages (opened from room cards with a long-press, or with room_tap: navigate)
  rooms.forEach((r) => views.push(roomView(r, { t, view, section, heading, device, camera, actions, path })));

  // floating navigation bar on the main views
  if (cfg.navbar !== false) {
    const items = views.filter((v) => !v.subview && v.path !== "tablet" && v.path !== "installer").slice(0, 5).map((v) => ({ icon: v.icon, label: v.title, path: path(v.path) }));
    views.filter((v) => !v.subview).forEach((v) => v.sections.push(
      section([{ type: "custom:ajnetweb-nav-card", items, grid_options: { columns: "full" } }], 4)));
  }
  return { title: cfg.title || hass.config.location_name || "Home", views };
}

function roomView(r, { t, view, section, heading, device, camera, actions }) {
  const secs = [];
  const add = (title, icon, cards, span) => { if (cards.length) secs.push(section([heading(title, icon), ...cards], span)); };
  const lights = r.lights.map((e) => e.entity_id);
  secs.push(section([
    { type: "custom:ajnetweb-area-card", area: r.id, name: r.name, icon: r.icon, size: "large",
      ...(r.picture ? { picture: r.picture } : {}), entities: roomEntities(r),
      ...(r.temperature[0] ? { temperature: r.temperature[0].entity_id } : {}),
      ...(r.humidity[0] ? { humidity: r.humidity[0].entity_id } : {}),
      grid_options: { columns: 12 } },
    actions([lights.length ? { name: t("all_lights_off"), icon: "mdi:lightbulb-group-off", action: "homeassistant.turn_off",
                               target: { entity_id: lights } } : null,
             ...r.scenes.concat(r.scripts).map((e) => ({ name: e.name, icon: "mdi:palette",
                                                        action: `${e.domain}.turn_on`, target: { entity_id: e.entity_id } }))], "chips"),
  ].filter(Boolean), 4));
  add(t("access"), "mdi:shield-key", r.access.map((e) => device(e)));
  add(t("lights"), "mdi:lightbulb-group", r.lights.map((e) => device(e)));
  add(t("climate"), "mdi:thermostat", [
    ...r.climates.filter((e) => e.domain === "climate").map((e) => ({ type: "thermostat", entity: e.entity_id, name: e.name,
      grid_options: { columns: 12 } })),
    ...r.climates.filter((e) => e.domain !== "climate").map((e) => device(e, { layout: "wide" })),
    ...r.fans.map((e) => device(e)),
  ]);
  add(t("covers"), "mdi:curtains", r.covers.map((e) => device(e)));
  add(t("media"), "mdi:speaker", r.media.map((e) => ({ type: "custom:ajnetweb-music-card", entities: [e.entity_id],
    variant: "full", search: true, grid_options: { columns: 12 } })));
  add(t("cameras"), "mdi:cctv", r.cameras.map((e) => camera(e, false)));
  add(t("switches"), "mdi:power-socket-uk", [...r.switches, ...r.vacuums, ...r.valves].map((e) => device(e)));
  add(t("sensors"), "mdi:gauge", [...r.temperature, ...r.humidity, ...r.air, ...r.power, ...r.openings, ...r.motion, ...r.safety]
    .map((e) => device(e)));
  return view(r.name, `room-${slug(r.id)}`, r.icon, secs, { subview: true, max_columns: 3,
    back_path: `/${window.location.pathname.split("/")[1] || "lovelace"}/home` });
}

async function installerView(cfg, hass, t, model, view, section, heading) {
  const b = cfg.branding || {};
  const lines = [`## ${b.company || "AJ Netweb"}`];
  if (b.phone) lines.push(`**Phone:** ${b.phone}`);
  if (b.email) lines.push(`**Email:** ${b.email}`);
  if (b.website) lines.push(`**Web:** ${b.website}`);
  if (b.notes) lines.push("", b.notes);
  lines.push("", "---", "Home Assistant **{{ state_attr('update.home_assistant_core_update', 'installed_version') or 'n/a' }}**"
    + " · {{ states | count }} entities · {{ states | selectattr('state', 'eq', 'unavailable') | list | count }} unavailable");
  const secs = [section([heading(t("support"), "mdi:face-agent"),
    { type: "markdown", content: lines.join("\n\n"), grid_options: { columns: 12 } }])];
  const controls = model.rooms.flatMap((r) => ["lights", "climates", "covers", "access", "switches", "fans", "media", "cameras"]
    .flatMap((g) => r[g].map((e) => e.entity_id)));
  const filter = (title, icon, entities, conditions) => entities.length && secs.push(section([heading(title, icon),
    { type: "entity-filter", entities, show_empty: true, conditions, card: { type: "entities" }, grid_options: { columns: 12 } }]));
  filter(t("unavailable"), "mdi:lan-disconnect", controls, [{ condition: "state", state: ["unavailable", "unknown"] }]);
  filter(t("low_battery"), "mdi:battery-alert", model.house.batteries, [{ condition: "numeric_state", below: 25 }]);
  filter(t("updates"), "mdi:update", model.house.updates, [{ condition: "state", state: "on" }]);

  let admins = cfg.admins;
  if (!admins || !admins.length) {
    try {
      const users = await hass.callWS({ type: "config/auth/list" });
      admins = users.filter((u) => !u.system_generated && (u.is_owner || (u.group_ids || []).includes("system-admin"))).map((u) => u.id);
    } catch (e) {
      admins = [hass.user.id];
    }
  }
  return view(t("installer"), "installer", "mdi:account-hard-hat", secs,
    { max_columns: 3, visible: admins.map((user) => ({ user })) });
}
