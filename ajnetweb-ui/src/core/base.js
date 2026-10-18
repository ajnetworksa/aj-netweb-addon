// Base class for all AJ Netweb cards.
// Only public frontend surface is used: the `hass` object (states, callService, locale,
// formatEntityState, entities/devices/areas) and the long-standing DOM events
// `hass-more-info`, `location-changed` and `hass-notification`.
import { langOf, translate } from "./i18n.js";
import { TOKENS } from "./styles.js";
import { applyPalette, loadAppearance } from "./appearance.js";
import { licenseNotice, licenseState } from "./license.js";

// Live cards, so a personal colour change repaints them all at once
const LIVE = new Set();
window.addEventListener("ajn-appearance", () => {
  LIVE.forEach((card) => card._config && applyPalette(card, card._config.palette));
  // cards of rebuilt views are gone for good; keep the set small
  if (LIVE.size > 400) LIVE.forEach((card) => !card.isConnected && LIVE.delete(card));
});

export const OFFLINE = ["unavailable", "unknown"];

export const esc = (s) =>
  String(s == null ? "" : s).replace(/[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** Safe value for CSS url(): quotes/parentheses in image URLs would break the style. */
export const cssUrl = (u) => `url("${String(u || "").replace(/["'()\\\s]/g, (c) => encodeURIComponent(c))}")`;

export function haptic(kind = "light") {
  // Companion app listens for this event; browsers fall back to the Vibration API
  window.dispatchEvent(new CustomEvent("haptic", { detail: kind }));
  try { if (navigator.vibrate) navigator.vibrate(kind === "heavy" ? 20 : 8); } catch (e) { /* not supported */ }
}

export function fire(node, type, detail) {
  node.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
}

export function navigate(path, replace = false) {
  if (!path) return;
  if (replace) window.history.replaceState(null, "", path);
  else window.history.pushState(null, "", path);
  window.dispatchEvent(new CustomEvent("location-changed", { detail: { replace } }));
}

export async function callService(hass, service, entityIds, data) {
  const [domain, srv] = service.split(".");
  const payload = Object.assign({}, data || {});
  const ids = Array.isArray(entityIds) ? entityIds : entityIds ? [entityIds] : [];
  if (ids.length) payload.entity_id = ids;
  return hass.callService(domain, srv, payload);
}

export function formatState(hass, stateObj) {
  if (!stateObj) return "";
  try {
    if (typeof hass.formatEntityState === "function") return hass.formatEntityState(stateObj);
  } catch (e) { /* older HA */ }
  return stateObj.state;
}

export function entityName(hass, id) {
  const s = hass && hass.states[id];
  return (s && s.attributes.friendly_name) || id;
}

/**
 * Touch browsers (Companion app, mobile Safari/Chrome) send a synthetic "click" ~0-300 ms after
 * the finger lifts, at the same spot. Our taps fire on pointerup, so if the tap opened something
 * (the room sheet), that late click would land on the new layer and close it again.
 * Swallow the one click that follows a touch tap.
 */
export function swallowGhostClick(pointerType) {
  if (pointerType === "mouse") return;
  const kill = (e) => { e.stopPropagation(); e.preventDefault(); cleanup(); };
  const cleanup = () => { window.removeEventListener("click", kill, true); clearTimeout(timer); };
  const timer = setTimeout(cleanup, 600);
  window.addEventListener("click", kill, true);
}

/**
 * Pointer gestures: tap, long-press (hold) and horizontal drag (0-100 %).
 * Works with mouse, touch and pen; a drag never fires a tap.
 */
export function bindGestures(el, { onTap, onHold, onDrag, onDragEnd, holdMs = 450, dragThreshold = 10 }) {
  let start = null;
  let holdTimer = null;
  let dragging = false;
  let held = false;

  const pct = (x) => {
    const r = el.getBoundingClientRect();
    const rtl = getComputedStyle(el).direction === "rtl";
    const v = ((x - r.left) / r.width) * 100;
    return Math.max(0, Math.min(100, rtl ? 100 - v : v));
  };

  el.addEventListener("pointerdown", (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    start = { x: e.clientX, y: e.clientY };
    dragging = false;
    held = false;
    if (onHold) {
      holdTimer = setTimeout(() => {
        held = true;
        haptic("heavy");
        onHold(e);
      }, holdMs);
    }
  });
  el.addEventListener("pointermove", (e) => {
    if (!start || held) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (!dragging && onDrag && Math.abs(dx) > dragThreshold && Math.abs(dx) > Math.abs(dy) * 1.2) {
      dragging = true;
      clearTimeout(holdTimer);
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    } else if (!dragging && (Math.abs(dx) > dragThreshold || Math.abs(dy) > dragThreshold)) {
      clearTimeout(holdTimer); // scrolling, not a hold
    }
    if (dragging) {
      e.preventDefault();
      onDrag(pct(e.clientX));
    }
  });
  const end = (e, cancelled) => {
    clearTimeout(holdTimer);
    if (!start) return;
    if (dragging) {
      if (onDragEnd) onDragEnd(pct(e.clientX));
    } else if (!held && !cancelled && onTap) {
      const moved = Math.abs(e.clientX - start.x) > dragThreshold || Math.abs(e.clientY - start.y) > dragThreshold;
      if (!moved) {
        swallowGhostClick(e.pointerType);
        onTap(e);
      }
    }
    start = null;
    dragging = false;
  };
  el.addEventListener("pointerup", (e) => end(e, false));
  el.addEventListener("pointercancel", (e) => end(e, true));
  el.addEventListener("contextmenu", (e) => { if (onHold) e.preventDefault(); });
  el.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && onTap) { e.preventDefault(); onTap(e); }
  });
  // drags must not scroll the page sideways
  if (onDrag) el.style.touchAction = "pan-y";
}

export class AjnBase extends HTMLElement {
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
    applyPalette(this, config.palette);
    if (this._hass) this._update(true);
  }

  validate() {}

  set hass(hass) {
    if (!this._hass) {
      LIVE.add(this);
      loadAppearance(hass); // cached per user; repaints via the ajn-appearance event
    }
    this._hass = hass;
    this._update(false);
  }

  get hass() {
    return this._hass;
  }

  /** Entity ids whose state changes should re-render the card. */
  watched() {
    return [];
  }

  _update(force) {
    if (!this._config || !this._hass) return;
    const states = this._hass.states;
    const snap = [this.lang(), states["sensor.ajnetweb_license"], ...this.watched().map((id) => states[id])];
    if (!force && this._snapshot && snap.length === this._snapshot.length &&
        snap.every((v, i) => v === this._snapshot[i])) return;
    this._snapshot = snap;
    const lic = licenseState(this._hass);
    if (!lic.ok) {
      this.html(licenseNotice(lic));
      return;
    }
    this.render();
  }

  lang() {
    return langOf(this._hass, this._config && this._config.language);
  }

  t(key, n, vars) {
    return translate(this.lang(), key, n, vars);
  }

  st(id) {
    return id && this._hass ? this._hass.states[id] : undefined;
  }

  num(id) {
    const s = this.st(id);
    if (!s || OFFLINE.includes(s.state)) return null;
    const v = parseFloat(s.state);
    return Number.isFinite(v) ? v : null;
  }

  moreInfo(entityId) {
    if (entityId) fire(this, "hass-more-info", { entityId });
  }

  navigate(path) {
    navigate(path);
  }

  notify(message) {
    fire(this, "hass-notification", { message });
  }

  async call(service, entityIds, data) {
    try {
      return await callService(this._hass, service, entityIds, data);
    } catch (e) {
      this.notify(`${this.t("failed")}: ${(e && e.message) || e}`);
      throw e;
    }
  }

  css() {
    return "";
  }

  html(body) {
    this.shadowRoot.innerHTML = `<style>${TOKENS}${this.css()}</style>${body}`;
  }

  getCardSize() {
    return 2;
  }
}
