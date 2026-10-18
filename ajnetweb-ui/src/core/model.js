// Builds a "house model" (floors -> rooms -> device groups) from the registries that the
// frontend already has in `hass` (entities, devices, areas, floors). Same rules as the
// add-on's Python discovery, so the strategy works with or without the add-on.

export const GROUPS = [
  "access", "lights", "climates", "fans", "covers", "media", "cameras", "switches",
  "vacuums", "alarms", "valves", "scenes", "scripts", "temperature", "humidity", "air",
  "power", "openings", "motion", "safety", "batteries",
];
export const CONTROL_GROUPS = ["access", "lights", "climates", "fans", "covers", "media",
  "cameras", "switches", "vacuums", "alarms", "valves"];

const ACCESS_WORDS = ["gate", "door_relay", "door relay", "strike", "barrier", "door_lock", "door lock",
  "unlock", "doorbell_door", "turnstile"];
const LIGHT_WORDS = ["light", "lamp", "spot", "led", "chandelier", "sconce", "bulb", "downlight",
  "strip", "pendant", "lighting"];
const NOISE = ["backlight", "motor_reversal", "calibration", "permit_join", "learn_ir", "ir_code",
  "child_lock", "countdown", "power_on_behavior", "indicator", "switch_mode", "switch_type",
  "isapi_request", "bridge_state", "identify", "do_not_disturb", "led_enable", "firmware", "restart",
  "reboot", "ping", "rssi", "linkquality", "last_seen", "uptime", "_ip_address", "wifi_signal"];
const SENSOR_CLASSES = {
  temperature: "temperature", humidity: "humidity", carbon_dioxide: "air", pm25: "air", pm10: "air",
  aqi: "air", volatile_organic_compounds: "air", volatile_organic_compounds_parts: "air",
  power: "power", energy: "power", battery: "batteries",
};
const BINARY_CLASSES = {
  door: "openings", window: "openings", garage_door: "openings", opening: "openings",
  motion: "motion", occupancy: "motion", presence: "motion",
  smoke: "safety", gas: "safety", carbon_monoxide: "safety", moisture: "safety", safety: "safety",
  tamper: "safety",
};
const ROOM_ICONS = [
  [/living|salon|lounge|family/, "mdi:sofa"], [/master|bed|suite/, "mdi:bed-king"],
  [/kid|child|nursery/, "mdi:teddy-bear"], [/kitchen|pantry/, "mdi:stove"],
  [/dining/, "mdi:silverware-fork-knife"], [/bath|wc|toilet|shower|powder/, "mdi:shower"],
  [/majlis|guest|diwan/, "mdi:account-group"], [/garden|yard|lawn|outdoor/, "mdi:flower"],
  [/pool/, "mdi:pool"], [/corridor|hall|lobby|stair/, "mdi:stairs"],
  [/entrance|entry|foyer|gate/, "mdi:door"], [/office|study|library/, "mdi:desk"],
  [/garage|parking|car/, "mdi:garage"], [/balcony|terrace|roof|patio/, "mdi:balcony"],
  [/laundry|utility/, "mdi:washing-machine"], [/maid|staff|driver/, "mdi:account-tie"],
  [/cinema|theater|theatre/, "mdi:theater"], [/gym|fitness/, "mdi:dumbbell"],
  [/server|rack|network|technical/, "mdi:server-network"],
];

export function roomIcon(name) {
  const n = (name || "").toLowerCase();
  const hit = ROOM_ICONS.find(([re]) => re.test(n));
  return hit ? hit[1] : "mdi:floor-plan";
}

export function slug(text) {
  return String(text || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "room";
}

function isNoise(id, name) {
  const low = `${id} ${name}`.toLowerCase();
  return /0x[0-9a-f]{8,}/.test(low) || NOISE.some((p) => low.includes(p));
}

export function classify(id, name, attrs) {
  const domain = id.split(".")[0];
  const dc = attrs.device_class;
  const low = `${id} ${name}`.toLowerCase();
  switch (domain) {
    case "light": return "lights";
    case "lock": return "access";
    case "cover":
      return dc === "gate" || dc === "garage" || low.includes("gate") || low.includes("garage") ? "access" : "covers";
    case "switch":
    case "button":
      if (ACCESS_WORDS.some((w) => low.includes(w))) return "access";
      if (domain === "button") return null;
      if (dc !== "outlet" && LIGHT_WORDS.some((w) => low.includes(w))) return "lights";
      return "switches";
    case "climate": case "water_heater": case "humidifier": return "climates";
    case "fan": return "fans";
    case "media_player": return "media";
    case "camera": return "cameras";
    case "vacuum": case "lawn_mower": return "vacuums";
    case "alarm_control_panel": return "alarms";
    case "valve": return "valves";
    case "scene": return "scenes";
    case "script": return "scripts";
    case "sensor": return SENSOR_CLASSES[dc] || null;
    case "binary_sensor": return BINARY_CLASSES[dc] || null;
    default: return null;
  }
}

/** Strip the room name from entity names inside that room ("Majlis AC" -> "AC"). */
/** "bullet_cam" / "dome-cam2" (names nobody typed) -> "Bullet cam" / "Dome cam2". Real names stay. */
export function niceName(name) {
  const n = String(name || "");
  if (!/^[a-z0-9]+([_-][a-z0-9]+)+$/.test(n)) return n;
  const words = n.replace(/[_-]+/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function shortName(name, room) {
  if (!name || !room) return name;
  if (name.toLowerCase().startsWith(room.toLowerCase())) {
    const rest = name.slice(room.length).replace(/^[\s\-_:·]+/, "");
    if (rest) return rest[0].toUpperCase() + rest.slice(1);
  }
  return name;
}

/**
 * @param {object} hass
 * @param {object} opts { exclude_entities, hidden_areas, include_unassigned }
 */
export function buildModel(hass, opts = {}) {
  const exclude = new Set(opts.exclude_entities || []);
  const hiddenAreas = new Set(opts.hidden_areas || []);
  const areas = hass.areas || {};
  const floors = hass.floors || {};
  const devices = hass.devices || {};
  const registry = hass.entities || {};

  const rooms = {};
  const mkRoom = (id, name, extra = {}) => {
    const r = { id, name, icon: extra.icon || roomIcon(name), picture: extra.picture || null,
                floor_id: extra.floor_id || null };
    GROUPS.forEach((g) => (r[g] = []));
    return r;
  };
  Object.values(areas).forEach((a) => {
    if (hiddenAreas.has(a.area_id)) return;
    rooms[a.area_id] = mkRoom(a.area_id, a.name, { icon: a.icon, picture: a.picture, floor_id: a.floor_id });
  });
  rooms.unassigned = mkRoom("unassigned", "General", { icon: "mdi:home-outline" });

  const house = { weather: [], persons: [], updates: [], batteries: [] };

  Object.entries(hass.states).forEach(([id, st]) => {
    const domain = id.split(".")[0];
    const reg = registry[id] || {};
    const attrs = st.attributes || {};
    if (domain === "weather") return house.weather.push(id);
    if (domain === "person") return house.persons.push(id);
    if (domain === "update") return house.updates.push(id);
    if (reg.hidden) return;
    if (reg.entity_category && !(domain === "sensor" && attrs.device_class === "battery")) return;
    const name = niceName(attrs.friendly_name || reg.name || id);
    if (exclude.has(id) || isNoise(id, name)) return;
    const group = classify(id, name, attrs);
    if (!group) return;

    let areaId = reg.area_id || (reg.device_id && devices[reg.device_id] && devices[reg.device_id].area_id);
    if (!areaId || !rooms[areaId]) {
      if (areaId && hiddenAreas.has(areaId)) return;
      areaId = "unassigned";
    }
    const room = rooms[areaId];
    room[group].push({
      entity_id: id, domain, group, area_id: areaId,
      name: shortName(name, room.name), full_name: name,
    });
    if (group === "batteries") house.batteries.push(id);
  });

  const floorList = Object.values(floors)
    .sort((a, b) => (a.level ?? 99) - (b.level ?? 99) || String(a.name).localeCompare(b.name))
    .map((f) => ({ id: f.floor_id, name: f.name, level: f.level, icon: f.icon || floorIcon(f.level) }));
  const floorOrder = Object.fromEntries(floorList.map((f, i) => [f.id, i]));

  const list = Object.values(rooms).map((r) => {
    GROUPS.forEach((g) => r[g].sort((a, b) => a.name.localeCompare(b.name)));
    r.controls = CONTROL_GROUPS.reduce((n, g) => n + r[g].length, 0);
    r.total = r.controls + r.scenes.length + ["temperature", "humidity", "openings", "motion", "safety"]
      .reduce((n, g) => n + r[g].length, 0);
    return r;
  }).filter((r) => r.total > 0 && (r.id !== "unassigned" || opts.include_unassigned !== false));

  list.sort((a, b) => (a.id === "unassigned") - (b.id === "unassigned")
    || (floorOrder[a.floor_id] ?? 999) - (floorOrder[b.floor_id] ?? 999)
    || a.name.localeCompare(b.name));

  return {
    floors: floorList.filter((f) => list.some((r) => r.floor_id === f.id)),
    rooms: list,
    house,
  };
}

function floorIcon(level) {
  if (Number.isInteger(level) && level >= 0 && level <= 3) return `mdi:home-floor-${level}`;
  if (level === -1) return "mdi:home-floor-negative-1";
  return "mdi:home-floor-a";
}

/** All entity ids of a group across rooms. */
export function idsOf(rooms, group) {
  return rooms.flatMap((r) => r[group].map((e) => e.entity_id));
}

/** Entity ids per group for one room (used in card configs). */
export function roomEntities(room) {
  const out = {};
  GROUPS.forEach((g) => { if (room[g].length) out[g] = room[g].map((e) => e.entity_id); });
  return out;
}
