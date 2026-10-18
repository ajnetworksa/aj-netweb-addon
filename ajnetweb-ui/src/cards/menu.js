// "More" menu opened by the ⋯ button of the navigation bar. Made for kiosk tablets, where HA's
// header (with its own ⋮ menu) and the sidebar are hidden. The strategy decides which items each
// user gets (see core/access.js); this sheet only shows them.
//   items: [{ icon, label, path }                    navigate (pages, /profile, /config, add-on panels)
//           { icon, label, action: "appearance" }    personal theme / colour picker
//           { icon, label, action: "reload" }
//           { icon, label, action: "exit_kiosk" }]   reload with ?disable_km (kiosk-mode plugin)
import { bindGestures, esc, haptic, navigate } from "../core/base.js";
import { TOKENS } from "../core/styles.js";
import { THEME_VARS } from "./sheet.js";
import { openAppearance } from "./appearance.js";

class AjnetwebMenuSheet extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  open(origin, hass, menu, title) {
    const cs = getComputedStyle(origin);
    THEME_VARS.forEach((v) => {
      const val = cs.getPropertyValue(v);
      if (val) this.style.setProperty(v, val.trim());
    });
    const groups = [];
    (menu.items || []).forEach((it) => {
      const g = it.group || "";
      let grp = groups.find((x) => x.name === g);
      if (!grp) groups.push((grp = { name: g, items: [] }));
      grp.items.push(it);
    });
    this.setAttribute("dir", menu.language === "ar" ? "rtl" : "ltr");
    this.shadowRoot.innerHTML = `<style>${TOKENS}
      :host { position: fixed; inset: 0; z-index: 7; display: block; }
      .scrim { position: absolute; inset: 0; background: rgba(0,0,0,.42); opacity: 0; transition: opacity .25s var(--_ease);
               -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); }
      :host(.show) .scrim { opacity: 1; }
      .panel { position: absolute; left: 50%; bottom: calc(84px + env(safe-area-inset-bottom)); width: min(420px, calc(100vw - 24px));
               max-height: 70vh; overflow-y: auto; border-radius: 26px; padding: 8px;
               background: var(--ajn-sheet-bg, var(--primary-background-color, #111)); color: var(--_text);
               box-shadow: inset 0 1px 0 var(--ajn-highlight, transparent), 0 18px 50px rgba(0,0,0,.4);
               transform: translate(-50%, 12px) scale(.98); opacity: 0; transform-origin: bottom center;
               transition: transform .25s var(--_ease), opacity .2s var(--_ease); box-sizing: border-box; }
      :host(.show) .panel { transform: translate(-50%, 0); opacity: 1; }
      h3 { margin: 10px 14px 4px; font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--_text2); }
      .it { display: flex; align-items: center; gap: 14px; padding: 12px 14px; border-radius: 16px; cursor: pointer; font-size: 15px; font-weight: 500; }
      .it:hover, .it:focus-visible { background: var(--_muted); }
      .it .ic { width: 36px; height: 36px; border-radius: 12px; display: grid; place-items: center; background: var(--_muted); flex: none; }
      .it .ic ha-icon { --mdc-icon-size: 20px; color: var(--_accent); }
      .it.accent .ic { background: var(--_grad); }
      .it.accent .ic ha-icon { color: #fff; }
      .it .chev { margin-inline-start: auto; color: var(--_text2); --mdc-icon-size: 18px; }
      :host([dir=rtl]) .it .chev { transform: scaleX(-1); }
      .who { padding: 10px 14px 6px; font-size: 12px; color: var(--_text2); }
    </style>
    <div class="scrim"></div>
    <div class="panel" role="menu" aria-label="${esc(title || "Menu")}">
      ${groups.map((g) => `${g.name ? `<h3>${esc(g.name)}</h3>` : ""}${g.items.map((it, i) => `
        <div class="it tap ${it.action === "appearance" ? "accent" : ""}" role="menuitem" tabindex="0" data-i="${(menu.items || []).indexOf(it)}">
          <span class="ic"><ha-icon icon="${esc(it.icon || "mdi:circle-small")}"></ha-icon></span>${esc(it.label)}
          <ha-icon class="chev" icon="mdi:chevron-right"></ha-icon></div>`).join("")}`).join("")}
      ${hass && hass.user ? `<div class="who">${esc(hass.user.name || "")}</div>` : ""}
    </div>`;
    this.shadowRoot.querySelectorAll("[data-i]").forEach((el) => {
      bindGestures(el, { onTap: () => this._run((menu.items || [])[+el.dataset.i], origin, hass, menu) });
    });
    const scrim = this.shadowRoot.querySelector(".scrim");
    let down = false;
    scrim.addEventListener("pointerdown", () => { down = true; });
    scrim.addEventListener("pointerup", () => { if (down) this.close(); down = false; });
    this._onKey = (e) => { if (e.key === "Escape") this.close(); };
    window.addEventListener("keydown", this._onKey);
    requestAnimationFrame(() => this.classList.add("show"));
    const first = this.shadowRoot.querySelector("[data-i]");
    if (first) first.focus({ preventScroll: true });
  }

  _run(it, origin, hass, menu) {
    if (!it) return;
    haptic("light");
    this.close();
    if (it.action === "appearance") {
      openAppearance(origin, hass, Object.assign({}, menu.appearance || {}, menu.language ? { language: menu.language } : {}));
    } else if (it.action === "reload") {
      window.location.reload();
    } else if (it.action === "exit_kiosk") {
      window.location.href = `${location.pathname}?disable_km`;
    } else if (it.path) {
      navigate(it.path);
    }
  }

  close() {
    window.removeEventListener("keydown", this._onKey);
    this.classList.remove("show");
    setTimeout(() => this.remove(), 250);
  }
}

if (!customElements.get("ajnetweb-menu-sheet")) customElements.define("ajnetweb-menu-sheet", AjnetwebMenuSheet);

export function openMenu(origin, hass, menu, title) {
  document.querySelectorAll("ajnetweb-menu-sheet").forEach((s) => s.remove());
  const sheet = document.createElement("ajnetweb-menu-sheet");
  document.body.appendChild(sheet);
  sheet.open(origin, hass, menu, title);
  return sheet;
}
