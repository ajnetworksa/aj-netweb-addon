// UI strings. Add a language by adding a key; missing strings fall back to English.
export const STRINGS = {
  en: {
    morning: "Good morning", afternoon: "Good afternoon", evening: "Good evening", night: "Good night",
    lights_on: ["light on", "lights on"], ac_running: ["AC running", "ACs running"],
    open: ["open", "open"], alerts: ["alert", "alerts"], playing: ["playing", "playing"],
    all_closed: "All closed", confirm: "Tap again to confirm", failed: "Action failed",
    on: "On", off: "Off", offline: "Offline", open_state: "Open", closed: "Closed",
    locked: "Locked", unlocked: "Unlocked", playing_state: "Playing", paused: "Paused", idle: "Idle",
    home: "Home", lights: "Lights", climate: "Climate", security: "Security", cameras: "Cameras",
    media: "Media", panel: "Wall Panel", installer: "Installer", rooms: "Rooms", scenes: "Scenes",
    favorites: "Favorites", access: "Access", covers: "Shades", switches: "Devices", fans: "Fans",
    sensors: "Sensors", openings: "Doors & Windows", motion: "Motion", safety: "Safety", alarm: "Alarm",
    all_lights_off: "All lights off", all_ac_off: "All AC off", close_shades: "Close shades",
    open_shades: "Open shades", lights_off_q: "Turn off every light?", ac_off_q: "Turn off every AC?",
    unlock_q: "Open {name}?", unavailable: "Offline devices", low_battery: "Low batteries",
    updates: "Updates available", support: "Support", open_now: "Open right now",
    door_station: "Door station", cctv: "CCTV", menu: "More", target: "Set to",
    nothing_here: "No devices in this room yet.",
  },
  ar: {
    morning: "صباح الخير", afternoon: "مساء الخير", evening: "مساء الخير", night: "تصبح على خير",
    lights_on: ["إضاءة تعمل", "إضاءة تعمل"], ac_running: ["مكيف يعمل", "مكيفات تعمل"],
    open: ["مفتوح", "مفتوحة"], alerts: ["تنبيه", "تنبيهات"], playing: ["قيد التشغيل", "قيد التشغيل"],
    all_closed: "الكل مغلق", confirm: "اضغط مرة أخرى للتأكيد", failed: "فشل التنفيذ",
    on: "تشغيل", off: "إيقاف", offline: "غير متصل", open_state: "مفتوح", closed: "مغلق",
    locked: "مقفل", unlocked: "مفتوح القفل", playing_state: "قيد التشغيل", paused: "متوقف مؤقتاً", idle: "خامل",
    home: "الرئيسية", lights: "الإضاءة", climate: "التكييف", security: "الأمان", cameras: "الكاميرات",
    media: "الوسائط", panel: "لوحة الحائط", installer: "الفني", rooms: "الغرف", scenes: "المشاهد",
    favorites: "المفضلة", access: "الدخول", covers: "الستائر", switches: "الأجهزة", fans: "المراوح",
    sensors: "الحساسات", openings: "الأبواب والنوافذ", motion: "الحركة", safety: "السلامة", alarm: "الإنذار",
    all_lights_off: "إطفاء كل الإضاءة", all_ac_off: "إيقاف كل المكيفات", close_shades: "إغلاق الستائر",
    open_shades: "فتح الستائر", lights_off_q: "إطفاء جميع الإضاءة؟", ac_off_q: "إيقاف جميع المكيفات؟",
    unlock_q: "فتح {name}؟", unavailable: "أجهزة غير متصلة", low_battery: "بطاريات منخفضة",
    updates: "تحديثات متاحة", support: "الدعم الفني", open_now: "مفتوح الآن",
    door_station: "الإنتركم", cctv: "الكاميرات", menu: "المزيد", target: "الضبط",
    nothing_here: "لا توجد أجهزة في هذه الغرفة بعد.",
  },
};

export function langOf(hass, override) {
  const l = override || (hass && ((hass.locale && hass.locale.language) || hass.language)) || "en";
  return String(l).split("-")[0];
}

export function translate(lang, key, n, vars) {
  const dict = STRINGS[lang] || STRINGS.en;
  let v = dict[key] !== undefined ? dict[key] : STRINGS.en[key];
  if (Array.isArray(v)) v = n === 1 ? v[0] : v[1];
  if (v === undefined) return key;
  if (vars) Object.entries(vars).forEach(([k, val]) => (v = v.replace(`{${k}}`, val)));
  return v;
}
