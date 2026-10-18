// custom:ajnetweb-nav-card - floating glass navigation bar (bottom of the screen).
//   items: [{ icon, label, path }]
// The active item follows the current URL. The card keeps an empty spacer in the layout so
// the last cards are never hidden behind the bar.
import { AjnBase, bindGestures, esc, haptic } from "../core/base.js";

export class AjnetwebNavCard extends AjnBase {
  static getStubConfig() {
    return { items: [{ icon: "mdi:home", label: "Home", path: "/lovelace/0" }] };
  }

  validate(config) {
    if (!Array.isArray(config.items)) throw new Error("ajnetweb-nav-card: 'items' list is required");
  }

  connectedCallback() {
    this._loc = () => this.render();
    window.addEventListener("location-changed", this._loc);
    window.addEventListener("popstate", this._loc);
  }

  disconnectedCallback() {
    window.removeEventListener("location-changed", this._loc);
    window.removeEventListener("popstate", this._loc);
  }

  css() {
    return `
      :host { display: block; }
      .spacer { height: 84px; }
      nav { position: fixed; z-index: 4; left: 50%; transform: translateX(-50%);
            bottom: calc(12px + env(safe-area-inset-bottom)); display: flex; gap: 2px; padding: 6px;
            border-radius: 26px; max-width: calc(100vw - 24px); overflow-x: auto; scrollbar-width: none;
            background: var(--ajn-nav-bg, rgba(28, 30, 38, .72)); border: 1px solid rgba(255,255,255,.1);
            box-shadow: 0 10px 30px rgba(0,0,0,.35);
            -webkit-backdrop-filter: blur(20px) saturate(1.6); backdrop-filter: blur(20px) saturate(1.6); }
      nav::-webkit-scrollbar { display: none; }
      a { flex: none; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
          min-width: 62px; height: 52px; padding: 0 8px; border-radius: 20px; color: rgba(255,255,255,.62);
          font-size: 11px; font-weight: 600; text-decoration: none; transition: background .2s, color .2s; }
      a ha-icon { --mdc-icon-size: 22px; }
      a.active { color: #fff; background: rgba(255,255,255,.14); }
      a.active ha-icon { color: var(--_accent); }
      @media (min-width: 900px) { a { flex-direction: row; gap: 8px; font-size: 13px; padding: 0 16px; min-width: 0; } }
    `;
  }

  render() {
    const items = this._config.items || [];
    const here = location.pathname;
    let active = items.findIndex((i) => i.path === here);
    if (active < 0) active = items.findIndex((i) => here.startsWith(i.path) && i.path.split("/").length > 2);
    this.html(`<div class="spacer"></div><nav>${items.map((it, i) => `
      <a href="${esc(it.path)}" data-path="${esc(it.path)}" class="tap ${i === active ? "active" : ""}">
        <ha-icon icon="${esc(it.icon)}"></ha-icon><span>${esc(it.label)}</span></a>`).join("")}</nav>`);
    this.shadowRoot.querySelectorAll("a").forEach((a) => {
      a.addEventListener("click", (e) => e.preventDefault());
      bindGestures(a, { onTap: () => { haptic("light"); this.navigate(a.dataset.path); } });
    });
  }

  getCardSize() {
    return 1;
  }

  getGridOptions() {
    return { columns: "full", rows: "auto" };
  }
}
