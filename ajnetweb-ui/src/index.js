// AJ Netweb UI - premium cards + dashboard strategy for Home Assistant.
// Load this one file as a dashboard resource (type: module) in any Home Assistant.
import { AjnetwebDeviceCard } from "./cards/device.js";
import { AjnetwebAreaCard } from "./cards/area.js";
import { AjnetwebCameraCard } from "./cards/camera.js";
import { AjnetwebHeaderCard } from "./cards/header.js";
import { AjnetwebActionsCard } from "./cards/actions.js";
import { AjnetwebNavCard } from "./cards/nav.js";
import { AjnetwebPrayerCard } from "./cards/prayer.js";
import { AjnetwebMusicCard } from "./cards/music.js";
import { AjnetwebAppearanceCard } from "./cards/appearance.js";
import { AjnetwebWeatherCard } from "./cards/weather.js";
import { AjnetwebRoomsCard } from "./cards/rooms.js";
import { AjnetwebStatusCard } from "./cards/status.js";
import { AjnetwebGraphCard } from "./cards/graph.js";
import { AjnetwebCalendarCard } from "./cards/calendar.js";
import { AjnetwebEnergyCard } from "./cards/energy.js";
import { AjnetwebModesCard } from "./cards/modes.js";
import { AjnetwebDoorbellCard } from "./cards/doorbell.js";
import { AjnetwebApplianceCard } from "./cards/appliance.js";
import { AjnetwebRoomCard, AjnetwebQuickScenes } from "./cards/legacy.js";
import { generateDashboard, shouldRegenerate } from "./strategy/dashboard.js";
import { AjnetwebStrategyEditor } from "./strategy/editor.js";
import "./cards/sheet.js";

const VERSION = __VERSION__; // replaced at build time
const DOCS = "https://github.com/ajnetworksa/aj-netweb-addon/tree/main/ajnetweb-ui";

const CARDS = [
  ["ajnetweb-device-card", AjnetwebDeviceCard, "AJ Netweb Device", "Premium tile for any device: tap, drag to dim, hold for details."],
  ["ajnetweb-area-card", AjnetwebAreaCard, "AJ Netweb Room", "Room photo card with live status; opens a sheet with the room's devices."],
  ["ajnetweb-camera-card", AjnetwebCameraCard, "AJ Netweb Camera", "Clean camera tile; tap for the live stream."],
  ["ajnetweb-header-card", AjnetwebHeaderCard, "AJ Netweb Header", "Greeting, clock, weather, alarm and live status chips."],
  ["ajnetweb-actions-card", AjnetwebActionsCard, "AJ Netweb Actions", "Large buttons or scene chips with tap-again confirmation."],
  ["ajnetweb-prayer-card", AjnetwebPrayerCard, "AJ Netweb Prayer Times", "Next prayer countdown, today's times, Hijri date and adhan controls."],
  ["ajnetweb-music-card", AjnetwebMusicCard, "AJ Netweb Music", "Music player with Music Assistant search, favourites and room switching."],
  ["ajnetweb-rooms-card", AjnetwebRoomsCard, "AJ Netweb Rooms", "All rooms with floor tabs; room tiles with quick buttons for lights, AC and shades."],
  ["ajnetweb-status-card", AjnetwebStatusCard, "AJ Netweb Right now", "Only what needs attention: open doors, alerts, timers, lights and AC on, low batteries."],
  ["ajnetweb-graph-card", AjnetwebGraphCard, "AJ Netweb Graph", "Temperature (or any sensor) history as smooth lines; one room or all rooms."],
  ["ajnetweb-calendar-card", AjnetwebCalendarCard, "AJ Netweb Agenda", "Next events from your calendars, by day."],
  ["ajnetweb-energy-card", AjnetwebEnergyCard, "AJ Netweb Energy", "Electricity used today, last 7 days, solar, cost and power now."],
  ["ajnetweb-modes-card", AjnetwebModesCard, "AJ Netweb House modes", "Home / Away / Night / Guests in one row; each mode runs its own actions."],
  ["ajnetweb-doorbell-card", AjnetwebDoorbellCard, "AJ Netweb Doorbell popup", "Invisible: shows a full-screen camera + Open door popup when the doorbell rings."],
  ["ajnetweb-appliance-card", AjnetwebApplianceCard, "AJ Netweb Appliance", "Washing machine, dryer, dishwasher or 3D printer: progress ring, time left and when it is ready."],
  ["ajnetweb-weather-card", AjnetwebWeatherCard, "AJ Netweb Weather", "Current weather and a 5-day forecast with temperature bars."],
  ["ajnetweb-appearance-card", AjnetwebAppearanceCard, "AJ Netweb Appearance", "Lets each person choose their own theme, colour gradient and wallpaper."],
  ["ajnetweb-nav-card", AjnetwebNavCard, "AJ Netweb Navigation", "Floating glass navigation bar."],
  ["ajnetweb-room-card", AjnetwebRoomCard, "AJ Netweb Hero (legacy)", "Kept for dashboards created by v1."],
  ["ajnetweb-quick-scenes", AjnetwebQuickScenes, "AJ Netweb Scenes (legacy)", "Kept for dashboards created by v1."],
];

window.customCards = window.customCards || [];
CARDS.forEach(([tag, cls, name, description]) => {
  if (!customElements.get(tag)) customElements.define(tag, cls);
  if (!window.customCards.some((c) => c.type === tag)) {
    window.customCards.push({ type: tag, name, description, preview: !tag.includes("nav") && !tag.includes("doorbell"), documentationURL: DOCS });
  }
});

class AjnetwebDashboardStrategy extends HTMLElement {
  static getCreateSuggestions(hass) {
    return { title: (hass && hass.config && hass.config.location_name) || "Home", icon: "mdi:home-assistant" };
  }

  static getConfigElement() {
    return document.createElement("ajnetweb-strategy-editor");
  }

  static async generate(config, hass) {
    return generateDashboard(config, hass);
  }

  static shouldRegenerate(config, oldHass, newHass) {
    return shouldRegenerate(config, oldHass, newHass);
  }
}

if (!customElements.get("ajnetweb-strategy-editor")) customElements.define("ajnetweb-strategy-editor", AjnetwebStrategyEditor);
if (!customElements.get("ll-strategy-dashboard-ajnetweb")) customElements.define("ll-strategy-dashboard-ajnetweb", AjnetwebDashboardStrategy);

// HA 2026.5+: shows "AJ Netweb Home" under Community dashboards in the New dashboard dialog
window.customStrategies = window.customStrategies || [];
if (!window.customStrategies.some((s) => s.type === "ajnetweb")) {
  window.customStrategies.push({
    type: "ajnetweb", strategyType: "dashboard", name: "AJ Netweb Home",
    description: "Premium room-based dashboard for phones, tablets and wall panels, generated from your areas.",
    documentationURL: DOCS,
  });
}

console.info(`%c AJ NETWEB UI %c ${VERSION} `,
  "background:#2f7dd1;color:#fff;font-weight:700;border-radius:3px 0 0 3px",
  "background:#151823;color:#fff;border-radius:0 3px 3px 0");
