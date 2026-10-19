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
//   personal: true (each person may pick theme / colour / wallpaper, palette button in the header)
//   palette: <key> (default colour gradient, see core/appearance.js), wallpaper: false (palette as background)
//   appearance_themes: [theme names] (limit what people can pick)
//   menu: false (no ⋯ "More" button in the navigation bar), studio_path: <Dashboard Studio panel path>
//   layout: { home: { order: [band ids], hidden: [band ids] }, panel: {...} }   bands: top modes scenes access
//           favorites rooms climate insights cameras custom          (Studio "Layout" tab, drag and drop)
//   top_cards: [weather, prayer, media]   room_order: [area ids]   cameras: [ids]   home_cameras: 4
//   insights: [calendar, energy, temperature]   cards of the "Today at home" band (Home / Wall Panel)
//   calendars: [calendar ids] (default: all)   energy: false   energy_power: sensor.house_power (live power)
//   custom_dashboard: <url path> "My cards" - a normal dashboard edited with HA's visual editor; its first
//           view is merged into Home / Wall Panel ("custom" band), its other views become extra pages
//   room_access: { <user id or name>: { areas: [area ids], home: area id } }   rooms a non-admin user (or a
//           wall tablet's user) may see and control; home = the room the device belongs to (shown first).
//           The Room & Guest Pass add-on publishes the same as sensor.ajnetweb_room_access (it wins).
//   house_modes: { entity, names: { away: "Out" }, icons: {...}, confirm: [away, night] } | false   house modes
//           chip row ("modes" band). Default: shown when input_select.ajnetweb_house_mode exists (the Dashboard
//           Suite creates it with Studio → House modes). Room-scoped users never get it.
//   kiosk: { hide_header, hide_sidebar,             rules -> kiosk_mode for the kiosk-mode plugin
//            menu: { pages, appearance, profile, reload, settings, studio, exit_kiosk } }  rules per item
//     rule = all | admins | non_admins | none | [user names / ids]   (see core/access.js)
import { buildModel, idsOf, roomEntities, slug } from "../core/model.js";
import { translate, langOf } from "../core/i18n.js";
import { hasPrayerTimes } from "../cards/prayer.js";
import { musicPlayers } from "../cards/music.js";
import { PALETTES, loadAppearance, paletteWallpaper } from "../core/appearance.js";
import { allowed } from "../core/access.js";
import { licenseState } from "../core/license.js";
import { energySources } from "../cards/energy.js";
import { MODE_ENTITY } from "../cards/modes.js";

const ALARM_BITS = [[1, "armed_home"], [2, "armed_away"], [4, "armed_night"], [32, "armed_vacation"], [16, "armed_custom_bypass"]];

export async function generateDashboard(config, hass) {
  const cfg = config || {};
  const lic = licenseState(hass);
  if (!lic.ok) {
    // one page that says so (the cards render the notice) instead of the whole dashboard
    return { title: cfg.title || "Home", views: [{ title: "AJ Netweb", path: "home", type: "sections", max_columns: 1,
      sections: [{ type: "grid", cards: [{ type: "custom:ajnetweb-actions-card", actions: [], grid_options: { columns: 12 } }] }] }] };
  }
  const lang = langOf(hass, cfg.language);
  const t = (k, n, v) => translate(lang, k, n, v);
  const on = (k) => (cfg.views || {})[k] !== false;
  const base = "/" + (window.location.pathname.split("/")[1] || "lovelace");
  const path = (p) => `${base}/${p}`;
  // room-scoped users (family members, staff, a room's wall tablet): only their rooms are built at all
  const scope = roomAccess(cfg, hass);
  const hiddenAreas = [...(cfg.hidden_areas || []),
    ...(scope ? Object.keys(hass.areas || {}).filter((a) => !scope.areas.includes(a)) : [])];
  const model = buildModel(hass, { exclude_entities: cfg.exclude_entities, hidden_areas: hiddenAreas,
                                   ...(scope ? { include_unassigned: false } : {}) });
  // room order from the Studio (drag and drop); rooms not in the list keep their place after it
  const roomOrder = [...(scope && scope.home ? [scope.home] : []), ...(Array.isArray(cfg.room_order) ? cfg.room_order : [])];
  const rank = (r, i) => { const k = roomOrder.indexOf(r.id); return k >= 0 ? k : 1000 + i; };
  const rooms = roomOrder.length
    ? model.rooms.map((r, i) => [r, rank(r, i)]).sort((a, b) => a[1] - b[1]).map(([r]) => r) : model.rooms;
  // "My cards": a normal HA dashboard edited with HA's own visual editor; its first view is merged into
  // Home / Wall Panel, its other views become extra pages here (see docs/02 "My cards")
  let custom = null;
  if (cfg.custom_dashboard && typeof hass.callWS === "function") {
    try { custom = await hass.callWS({ type: "lovelace/config", url_path: cfg.custom_dashboard }); } catch (e) { custom = null; }
  }
  // HA's Energy dashboard settings decide whether there is anything for the energy card to show
  let energy = null;
  if (cfg.energy !== false && typeof hass.callWS === "function") {
    try {
      const src = energySources(await hass.callWS({ type: "energy/get_prefs" }));
      if (src.from.length || src.solar.length) energy = src;
    } catch (e) { energy = null; }
  }
  const all = (g) => rooms.flatMap((r) => r[g]);
  const ids = (g, domain) => all(g).filter((e) => !domain || e.domain === domain).map((e) => e.entity_id);
  const roomPath = (r) => path(`room-${slug(r.id)}`);
  const withLang = (c) => (cfg.language ? Object.assign(c, { language: cfg.language }) : c);

  // personal appearance (per HA user): theme and wallpaper are part of the generated views
  const personal = cfg.personal !== false;
  const me = personal ? await loadAppearance(hass) : {};
  const themeNames = Object.keys((hass.themes && hass.themes.themes) || {});
  const myTheme = me.theme && themeNames.includes(me.theme) &&
    (!cfg.appearance_themes || cfg.appearance_themes.includes(me.theme)) ? me.theme : null;
  const theme = myTheme || cfg.theme;
  const wallPalette = PALETTES[(personal && me.palette) || cfg.palette] || PALETTES.ocean;
  const wallOn = personal && me.wallpaper !== undefined ? me.wallpaper : cfg.wallpaper;
  const background = wallOn && wallPalette ? paletteWallpaper(wallPalette, !!(hass.themes && hass.themes.darkMode)) : null;

  // kiosk tablets: who gets HA's header/sidebar hidden, and who sees which ⋯ menu item.
  // generate() runs in each user's own browser, so rules are resolved for this user right here.
  const kiosk = cfg.kiosk || {};
  const rules = kiosk.menu || {};
  const hideHeader = kiosk.hide_header !== undefined && allowed(kiosk.hide_header, hass, "none");
  const hideSidebar = kiosk.hide_sidebar !== undefined && allowed(kiosk.hide_sidebar, hass, "none");
  const kioskOn = hideHeader || hideSidebar;
  const menuOn = cfg.menu !== false && cfg.navbar !== false;
  const canAppearance = personal && allowed(rules.appearance, hass, "all");

  const showPrayer = cfg.prayer !== false && hasPrayerTimes(hass);
  // a room-scoped user only gets the speakers of their rooms
  const roomMedia = scope ? new Set(model.rooms.flatMap((r) => r.media.map((e) => e.entity_id))) : null;
  const players = (cfg.music === false ? [] : (cfg.music_players || musicPlayers(hass))).filter((id) => !roomMedia || roomMedia.has(id));
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
    : { type: "custom:ajnetweb-camera-card", entity: e.entity_id, name: e.name, grid_options: { columns: 6 },
        // the gate / garage / lock of the same area right on the picture
        // (only on the first camera of each area, so several cameras of one area don't repeat them)
        ...(() => {
          const first = all("cameras").find((c) => c.area_id === e.area_id);
          if (e.area_id === "unassigned" || !first || first.entity_id !== e.entity_id) return {};
          const ctl = all("access").filter((a) => a.area_id === e.area_id).slice(0, 2).map((a) => a.entity_id);
          return ctl.length ? { controls: ctl } : {};
        })() });
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
  const alarm = (scope ? null : cfg.alarm) || ids("alarms")[0];   // room-scoped users only get an alarm in their rooms
  const modes = (() => {
    if (scope || cfg.house_modes === false) return null;
    const m = typeof cfg.house_modes === "object" && cfg.house_modes ? cfg.house_modes : {};
    const entity = m.entity || MODE_ENTITY;
    if (!hass.states[entity]) return null;
    return { entity, ...(m.names ? { names: m.names } : {}), ...(m.icons ? { icons: m.icons } : {}),
             ...(Array.isArray(m.confirm) ? { confirm: m.confirm } : {}) };
  })();

  const header = (variant, extra = {}) => {
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
      // with the ⋯ menu the picker lives there; the header button is for dashboards without the bar
      ...(canAppearance && !menuOn ? { appearance: true } : {}), ...(cfg.wallpaper ? { wallpaper: true } : {}),
      ...(cfg.appearance_themes ? { appearance_themes: cfg.appearance_themes } : {}),
      ...Object.fromEntries(Object.entries(extra).filter(([, v]) => v !== undefined)),
    });
  };

  // ---------------------------------------------------------------- Home / Wall Panel layout
  // Every band is one full-width section, so sections of different heights never sit side by side
  // (HA's sections grid aligns rows to the tallest section - that left big holes). Inside a band, cards
  // are sized in whole view columns (12 units = 1 column), so they wrap cleanly on any screen: 4 per row
  // on a large screen, 3 on a laptop, 2 on a tablet, 1 on a phone.
  const band = (cards) => ({ type: "grid", column_span: 4, cards: cards.filter(Boolean) });
  const onlyWide = { visibility: [{ condition: "screen", media_query: "(min-width: 768px)" }] };
  const onlyNarrow = { visibility: [{ condition: "screen", media_query: "(max-width: 767px)" }] };

  // all rooms in one block: floor tabs + an even grid of room tiles with quick buttons (Flux UI style)
  const roomsBand = () => {
    const floors = Object.fromEntries(model.floors.map((f) => [f.id, f]));
    const groups = new Map();
    rooms.forEach((r) => {
      if (r.id === "unassigned" && !["lights", "climates", "covers", "media", "switches"].some((g) => r[g].length)) return;
      const key = floors[r.floor_id] ? r.floor_id : "_none";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r);
    });
    const order = [...model.floors.map((f) => f.id).filter((id) => groups.has(id)), ...(groups.has("_none") ? ["_none"] : [])];
    if (!order.length) return null;
    const style = cfg.room_style === "photo" ? "photo" : "tile";
    return band([heading(t("rooms"), "mdi:floor-plan"), withLang({
      type: "custom:ajnetweb-rooms-card", style, grid_options: { columns: "full" },
      groups: order.map((key) => ({ name: floors[key] ? floors[key].name : t("rooms"), icon: floors[key] ? floors[key].icon : "mdi:floor-plan",
                                    rooms: groups.get(key).map((r) => { const c = areaCard(r); delete c.type; delete c.grid_options; return c; }) })),
    })]);
  };

  // "Right now": what needs attention (open doors, alerts, timers, lights/AC on, low batteries, offline)
  const statusCard = (extra = {}) => withLang({
    type: "custom:ajnetweb-status-card",
    openings: ids("openings"), safety: ids("safety"), lights: ids("lights"), climates: ids("climates"), media: ids("media"),
    batteries: model.house.batteries || [],
    ...(hass.user && hass.user.is_admin ? { devices: ["lights", "climates", "covers", "access", "switches", "fans"].flatMap((g) => ids(g)) } : {}),
    navigation: { security: path("security"), lights: path("lights"), climate: path("climate"), media: path("media"),
                  ...(hass.user && hass.user.is_admin ? { installer: path("installer") } : {}) },
    ...extra,
  });
  // temperature history: one line per room (Climate page, "Today at home"), or one room's line
  const tempRooms = rooms.filter((r) => r.temperature.length && r.id !== "unassigned");
  const tempGraph = (list, extra = {}) => (list.length ? withLang({ type: "custom:ajnetweb-graph-card",
    entities: list.slice(0, 8).map((r) => ({ entity: r.temperature[0].entity_id, name: r.name })), hours: 24,
    grid_options: { columns: 12 }, ...extra }) : null);
  const roomGraph = (r, extra = {}) => (r.temperature[0] ? withLang({ type: "custom:ajnetweb-graph-card",
    entity: r.temperature[0].entity_id, title: t("temperature"), hours: 24, grid_options: { columns: 12 }, ...extra }) : null);
  const calendars = Array.isArray(cfg.calendars) ? cfg.calendars.filter((id) => hass.states[id])
    : Object.keys(hass.states).filter((id) => id.startsWith("calendar."));
  const powerSensor = cfg.energy_power || (energy && energy.rate.find((id) => hass.states[id])) || ids("power").find((id) => {
    const a = hass.states[id].attributes;
    return a.device_class === "power" && /grid|main|total|house|home|consumption|import/.test(id);
  });
  const insightCards = () => {
    const pick = Array.isArray(cfg.insights) ? cfg.insights : ["calendar", "energy", "temperature"];
    const make = {
      calendar: () => (calendars.length ? withLang({ type: "custom:ajnetweb-calendar-card", entities: calendars, days: 7, max: 5 }) : null),
      energy: () => (energy || cfg.energy_entities ? withLang({ type: "custom:ajnetweb-energy-card",
        ...(powerSensor ? { power: powerSensor } : {}), ...(cfg.energy_entities ? { entities: cfg.energy_entities } : {}) }) : null),
      temperature: () => tempGraph(tempRooms),
    };
    return pick.map((k) => make[k] && make[k]()).filter(Boolean).map((c) => { delete c.grid_options; return c; });
  };

  // music while something plays, "Right now" otherwise (Flux UI's media-aware layout)
  const playingCond = players.length ? [{ condition: "or", conditions: players.map((id) => ({ condition: "state", entity: id, state: "playing" })) }] : null;

  // ---------------------------------------------------------------- views
  const views = [];
  // Studio "Layout": order of the Home / Wall Panel bands, and which are hidden. Bands added in later
  // versions appear at their default place unless hidden, so saved layouts never lose new features.
  const BANDS = {
    home: ["top", "modes", "scenes", "access", "favorites", "rooms", "climate", "insights", "cameras", "custom"],
    panel: ["top", "modes", "cameras", "rooms", "scenes", "access", "favorites", "climate", "insights", "custom"],
  };
  const layoutOf = (panel) => {
    const key = panel ? "panel" : "home";
    const conf = (cfg.layout || {})[key] || {};
    const order = (conf.order || []).filter((b) => BANDS[key].includes(b));
    const hidden = new Set(conf.hidden || []);
    const out = [...order];
    BANDS[key].forEach((b, i) => {   // a band the saved layout doesn't know yet goes after its default neighbour
      if (out.includes(b)) return;
      const prev = BANDS[key].slice(0, i).reverse().find((p) => out.includes(p));
      out.splice(prev ? out.indexOf(prev) + 1 : 0, 0, b);
    });
    return out.filter((b) => !hidden.has(b));
  };
  const TOP = ["weather", "prayer", "media"];
  const topCards = Array.isArray(cfg.top_cards) ? cfg.top_cards.filter((c) => TOP.includes(c)) : TOP;
  const customBands = () => {
    const v = custom && Array.isArray(custom.views) ? custom.views[0] : null;
    if (!v) return [];
    if (Array.isArray(v.sections)) return v.sections.filter((sec) => (sec.cards || []).length);
    return Array.isArray(v.cards) && v.cards.length ? [band(v.cards.map((c) => Object.assign({ grid_options: { columns: 12 } }, c)))] : [];
  };

  const homeSections = (panel) => {
    const built = {};
    // top: compact header, then one row of equal cards - weather, prayer, music / "Right now". A native
    // horizontal-stack keeps them in one row with equal widths and heights at any screen width; phones
    // get the cards stacked instead (weather is in the header there).
    const media = (variant) => {
      const status = statusCard();
      delete status.grid_options;
      if (!playingCond) return [status];
      const music = musicCard({ variant, search: false });
      delete music.grid_options;
      return [{ type: "conditional", conditions: playingCond, card: music },
              { type: "conditional", conditions: [{ condition: "not", conditions: playingCond }], card: status }];
    };
    const topBuilders = {
      weather: () => (weather ? [{ type: "custom:ajnetweb-weather-card", entity: weather }] : []),
      prayer: () => (showPrayer ? [withLang({ type: "custom:ajnetweb-prayer-card", variant: panel ? "panel" : "default" })] : []),
      media: () => media("full"),
    };
    const wideRow = topCards.flatMap((k) => topBuilders[k]()).map((c) => { delete c.grid_options; return c; });
    built.top = band([
      header(panel ? "panel" : "default", { weather_wide: weather && topCards.includes("weather") ? false : undefined }),
      wideRow.length ? { type: "horizontal-stack", cards: wideRow, grid_options: { columns: "full" }, ...onlyWide } : null,
      showPrayer && topCards.includes("prayer") ? withLang({ type: "custom:ajnetweb-prayer-card", variant: "compact", grid_options: { columns: "full" }, ...onlyNarrow }) : null,
      players.length && topCards.includes("media") ? musicCard({ variant: "compact", grid_options: { columns: "full" }, ...onlyNarrow }) : null,
      topCards.includes("media") ? statusCard({ grid_options: { columns: "full" }, ...onlyNarrow }) : null,
    ]);
    // house modes: Home / Away / Night / Guests - whole-house, so not for room-scoped users
    built.modes = modes ? band([withLang({ type: "custom:ajnetweb-modes-card", ...modes, grid_options: { columns: "full" } })]) : null;
    // scenes + house-wide buttons (all lights off, AC off, shades, add-on shortcuts)
    const scenes = all("scenes");
    const sceneCards = [];
    if (scenes.length) {
      sceneCards.push(heading(t("scenes"), "mdi:palette"),
        actions(scenes.slice(0, 12).map((e) => ({ name: e.full_name, icon: (hass.states[e.entity_id].attributes.icon) || "mdi:palette",
                                                    action: "scene.turn_on", target: { entity_id: e.entity_id } })), "chips"));
    }
    const acts = actions([...(cfg.shortcuts || []), lightsOff(), acOff(), ...shades()], "chips");
    if (acts) sceneCards.push(...(scenes.length ? [] : [heading(t("quick_actions"), "mdi:gesture-tap-button")]), acts);
    built.scenes = sceneCards.length ? band(sceneCards) : null;
    const access = all("access");
    built.access = access.length ? band([heading(t("access"), "mdi:shield-key", path("security")),
      ...access.slice(0, 8).map((e) => device(e, { name: e.full_name }))]) : null;
    const favIds = cfg.favorites || [];
    const pool = new Map(rooms.flatMap((r) => Object.values(r).filter(Array.isArray).flat()).filter((e) => e && e.entity_id).map((e) => [e.entity_id, e]));
    const favs = favIds.map((id) => pool.get(id)).filter(Boolean);   // in the order chosen in the Studio
    built.favorites = favs.length ? band([heading(t("favorites"), "mdi:star"), ...favs.slice(0, 16).map((e) => device(e, { name: e.full_name }))]) : null;
    // cameras: wide screens get balanced rows of large pictures (4 -> 4, 5 -> 3+2, 6 -> 3+3, 7 -> 4+3,
    // 8 -> 4+4); phones two per row. Wall Panel: live video if enabled.
    const camPick = Array.isArray(cfg.cameras) && cfg.cameras.length
      ? cfg.cameras.map((id) => all("cameras").find((c) => c.entity_id === id)).filter(Boolean) : all("cameras");
    const camList = camPick.slice(0, panel ? 8 : (Number(cfg.home_cameras) || 4));
    const live = panel && cfg.panel_live_cameras !== false;
    const camRows = [];
    const perRow = camList.length <= 4 ? 4 : Math.ceil(camList.length / Math.ceil(camList.length / 4));
    for (let i = 0; i < camList.length; i += perRow) camRows.push(camList.slice(i, i + perRow));
    built.cameras = camList.length ? band([heading(t("cameras"), "mdi:cctv", path("cameras")),
      ...camRows.map((row) => ({ type: "horizontal-stack", grid_options: { columns: "full" }, ...onlyWide,
        cards: row.map((c) => { const x = camera(c, live); delete x.grid_options; return x; }) })),
      ...camList.map((c) => Object.assign(camera(c, false), { grid_options: { columns: 6 } }, onlyNarrow))]) : null;
    const climates = all("climates");
    built.climate = climates.length ? band([heading(t("climate"), "mdi:thermostat", path("climate")),
      ...climates.slice(0, 8).map((e) => device(e, { name: e.full_name, layout: "wide" }))]) : null;
    built.rooms = roomsBand();
    // a room's own tablet: that room's controls right under the header
    const homeRoom = scope && scope.home && rooms.find((r) => r.id === scope.home);
    if (homeRoom) {
      const ctl = ["lights", "climates", "covers", "fans", "media", "switches", "access"].flatMap((g) => homeRoom[g]);
      const sc = homeRoom.scenes.concat(homeRoom.scripts);
      built.top = [...[].concat(built.top || []), band([heading(homeRoom.name, homeRoom.icon, roomPath(homeRoom), "title"),
        sc.length ? actions(sc.map((e) => ({ name: e.name, icon: (hass.states[e.entity_id].attributes.icon) || "mdi:palette",
          action: `${e.domain}.turn_on`, target: { entity_id: e.entity_id } })), "chips") : null,
        roomGraph(homeRoom, { grid_options: { columns: 24 } }),
        ...ctl.map((e) => device(e, { layout: e.domain === "climate" ? "wide" : undefined }))])];
    }
    // "Today at home": agenda, energy and room temperatures side by side (stacked on phones)
    const ins = insightCards();
    built.insights = ins.length ? band([heading(t("insights"), "mdi:home-analytics"),
      { type: "horizontal-stack", cards: ins, grid_options: { columns: "full" }, ...onlyWide },
      ...insightCards().map((c) => Object.assign(c, { grid_options: { columns: "full" } }, onlyNarrow))]) : null;
    built.custom = customBands();
    return layoutOf(panel).flatMap((k) => built[k] || []).filter(Boolean);
  };
  const view = (title, p, icon, sections, extra = {}) => Object.assign({
    title, path: p, icon, type: "sections", max_columns: extra.max_columns || 4, dense_section_placement: true,
    sections, ...(theme ? { theme } : {}), ...(background ? { background } : {}),
  }, extra, { max_columns: extra.max_columns || 4 });

  const perRoom = (groups, layout) => rooms.map((r) => {
    const ents = groups.flatMap((g) => r[g]);
    if (!ents.length) return null;
    return section([heading(r.name, r.icon, roomPath(r)), ...ents.map((e) => device(e, { layout: layout || (e.domain === "climate" ? "wide" : undefined) }))]);
  }).filter(Boolean);

  views.push(view(t("home"), "home", "mdi:home", homeSections(false)));
  // further views of "My cards" become pages of this dashboard (after the generated ones, before rooms)
  const myPages = (custom && Array.isArray(custom.views) ? custom.views.slice(1) : []).map((v, i) =>
    Object.assign({}, v, { path: `my-${slug(v.path || v.title || String(i + 1))}`, ...(theme ? { theme } : {}), ...(background ? { background } : {}) }));
  if (on("panel")) views.push(view(t("panel"), "tablet", "mdi:tablet-dashboard", homeSections(true)));
  if (on("lights") && all("lights").length) {
    views.push(view(t("lights"), "lights", "mdi:lightbulb-group",
      [section([actions([lightsOff()])], 4), ...perRoom(["lights"])].filter((s) => s.cards[0])));
  }
  if (on("climate") && (all("climates").length || all("temperature").length)) {
    // every room's temperature over 24 h on top, then the ACs, then each room's sensors with its own graph
    const sensorRooms = rooms.map((r) => {
      const ents = ["temperature", "humidity", "air"].flatMap((g) => r[g]);
      if (!ents.length) return null;
      const rest = ents.filter((e) => !r.temperature[0] || e.entity_id !== r.temperature[0].entity_id);   // the graph shows it
      return section([heading(r.name, r.icon, roomPath(r)), roomGraph(r), ...rest.map((e) => device(e))].filter(Boolean));
    }).filter(Boolean);
    views.push(view(t("climate"), "climate", "mdi:thermostat",
      [section([actions([acOff()]), tempRooms.length > 1 ? tempGraph(tempRooms, { title: t("temperature") }) : null].filter(Boolean), 4),
       ...perRoom(["climates", "fans"]), ...sensorRooms].filter((s) => s.cards.length)));
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
  views.push(...myPages);
  rooms.forEach((r) => views.push(roomView(r, { t, view, section, heading, device, camera, actions, path, roomGraph })));

  // floating navigation bar on the main views
  if (cfg.navbar !== false) {
    const main = views.filter((v) => !v.subview);
    const inBar = main.filter((v) => v.path !== "tablet" && v.path !== "installer").slice(0, menuOn ? 4 : 5);
    const items = inBar.map((v) => ({ icon: v.icon, label: v.title, path: path(v.path) }));
    const menu = menuOn ? moreMenu(main.filter((v) => !inBar.includes(v))) : null;
    // On large screens HA's own view tabs are already at the top; the floating bar is for phones,
    // tablets and kiosk panels (HA header hidden), where it stays on at every width.
    main.forEach((v) => v.sections.push(section([withLang({ type: "custom:ajnetweb-nav-card", items,
      ...(menu ? { menu } : {}), ...(hideHeader ? {} : { hide_wide: true }), grid_options: { columns: "full" } })], 4)));
  }
  // dashboard-wide default colour for every AJ Netweb card (a person's own choice still wins)
  if (cfg.palette && PALETTES[cfg.palette]) {
    views.forEach((v) => v.sections.forEach((sec) => sec.cards.forEach((c) => {
      if (String(c.type).startsWith("custom:ajnetweb-")) c.palette = cfg.palette;
    })));
  }
  const out = { title: cfg.title || hass.config.location_name || "Home", views };
  // read by the kiosk-mode plugin (HACS) from the generated dashboard; ignored when it isn't installed
  if (kiosk.hide_header !== undefined || kiosk.hide_sidebar !== undefined) {
    out.kiosk_mode = { hide_header: hideHeader, hide_sidebar: hideSidebar };
    // people who may not exit kiosk mode can't do it by adding ?disable_km to the URL either
    if (kioskOn && !allowed(rules.exit_kiosk, hass, "admins")) out.kiosk_mode.ignore_disable_km = true;
  }
  return out;

  function moreMenu(extraViews) {
    const items = [];
    const add = (group, rule, fallback, item) => { if (allowed(rule, hass, fallback)) items.push({ group: t(group), ...item }); };
    extraViews.forEach((v) => add("pages", rules.pages, "all", { icon: v.icon, label: v.title, path: path(v.path) }));
    if (canAppearance) items.push({ group: t("for_me"), icon: "mdi:palette", label: t("appearance"), action: "appearance" });
    add("for_me", rules.profile, "all", { icon: "mdi:account-circle", label: t("my_profile"), path: "/profile" });
    add("system", rules.reload, "all", { icon: "mdi:refresh", label: t("reload"), action: "reload" });
    add("system", rules.settings, "admins", { icon: "mdi:cog", label: t("ha_settings"), path: "/config" });
    if (cfg.studio_path) add("system", rules.studio, "admins", { icon: "mdi:view-dashboard-edit", label: t("studio"), path: cfg.studio_path });
    if (cfg.custom_dashboard) add("system", rules.studio, "admins", { icon: "mdi:card-plus-outline", label: t("edit_my_cards"),
                                                                      path: `/${cfg.custom_dashboard}/0?edit=1` });
    if (kioskOn) add("system", rules.exit_kiosk, "admins", { icon: "mdi:fullscreen-exit", label: t("exit_kiosk"), action: "exit_kiosk" });
    if (!items.length) return null;
    return { label: t("menu"), items,
      appearance: { ...(cfg.palette ? { palette: cfg.palette } : {}), ...(cfg.wallpaper ? { wallpaper: true } : {}),
        ...(cfg.appearance_themes ? { themes: cfg.appearance_themes } : {}) } };
  }
}

/** This user's room rules, or null (admins and unrestricted users see the whole home). */
function roomAccess(cfg, hass) {
  const u = hass.user || {};
  if (u.is_admin) return null;
  const sensor = hass.states["sensor.ajnetweb_room_access"];
  const users = Object.assign({}, cfg.room_access || {}, (sensor && sensor.attributes.users) || {});
  const rule = users[u.id] || users[u.name] || Object.entries(users).find(([k]) => String(k).toLowerCase() === String(u.name || "").toLowerCase())?.[1];
  if (!rule) return null;
  const known = (a) => !hass.areas || hass.areas[a];
  const areas = (Array.isArray(rule.areas) ? rule.areas : []).filter(known);
  const home = rule.home && known(rule.home) ? rule.home : null;
  if (home && !areas.includes(home)) areas.unshift(home);
  return areas.length ? { areas, home } : null;
}

function roomView(r, { t, view, section, heading, device, camera, actions, roomGraph }) {
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
  add(t("sensors"), "mdi:gauge", [roomGraph(r), ...[...r.temperature.slice(1), ...r.humidity, ...r.air, ...r.power, ...r.openings, ...r.motion, ...r.safety]
    .map((e) => device(e))].filter(Boolean));
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
  // new devices (e.g. just added in Tuya / Smart Life) show up by themselves; without a room they land in
  // "General" - list them here so the installer can give them a room
  const loose = (model.rooms.find((r) => r.id === "unassigned") || { controls: 0 });
  const looseIds = ["lights", "climates", "covers", "access", "switches", "fans", "media", "cameras", "vacuums", "valves"]
    .flatMap((g) => (loose[g] || []).map((e) => e.entity_id));
  if (looseIds.length) {
    secs.push(section([heading(t("new_devices"), "mdi:map-marker-question"),
      { type: "markdown", content: t("new_devices_hint"), grid_options: { columns: 12 } },
      { type: "entities", entities: looseIds.slice(0, 30), grid_options: { columns: 12 } }]));
  }

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
