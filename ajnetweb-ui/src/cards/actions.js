// custom:ajnetweb-actions-card - large touch buttons for whole-house actions and shortcuts.
//   actions: [{ name, icon, action: "light.turn_off", target: { entity_id }, data, confirm, navigation_path }]
//   style: buttons (default) | chips (horizontal scroll, e.g. scenes)
import { AjnBase, esc, haptic } from "../core/base.js";
import { COLORS } from "../core/styles.js";

export class AjnetwebActionsCard extends AjnBase {
  static getStubConfig() {
    return { actions: [{ name: "All lights off", icon: "mdi:lightbulb-group-off", action: "light.turn_off",
                         target: { entity_id: "all" } }] };
  }

  validate(config) {
    if (!Array.isArray(config.actions)) throw new Error("ajnetweb-actions-card: 'actions' list is required");
  }

  async _run(btn, a) {
    haptic("light");
    if (a.navigation_path) return this.navigate(a.navigation_path);
    if (a.confirm && btn.dataset.armed !== "1") {
      btn.dataset.armed = "1";
      btn.classList.add("armed");
      btn.querySelector(".lbl").textContent = this.t("confirm");
      clearTimeout(btn._t);
      btn._t = setTimeout(() => this._disarm(btn, a), 3500);
      return;
    }
    this._disarm(btn, a);
    btn.classList.add("busy");
    try {
      const ids = a.target && a.target.entity_id;
      await this.call(a.action, Array.isArray(ids) ? ids : ids ? [ids] : [], a.data);
      btn.classList.add("ok");
      setTimeout(() => btn.classList.remove("ok"), 1200);
    } catch (e) { /* notified by call() */ } finally {
      btn.classList.remove("busy");
    }
  }

  _disarm(btn, a) {
    clearTimeout(btn._t);
    btn.dataset.armed = "";
    btn.classList.remove("armed");
    btn.querySelector(".lbl").textContent = a.name;
  }

  css() {
    const chips = this._config.style === "chips";
    return `
      ha-card { background: transparent; border: none; box-shadow: none; -webkit-backdrop-filter: none; backdrop-filter: none; }
      .row { ${chips ? "display: flex; overflow-x: auto; scrollbar-width: none;" : "display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));"}
             gap: 10px; padding: 2px; }
      .row::-webkit-scrollbar { display: none; }
      button { ${chips ? "flex: none; border-radius: 999px; min-height: 44px; padding: 0 18px 0 14px;" : "min-height: 56px; border-radius: var(--_radius); padding: 0 16px;"}
               display: inline-flex; align-items: center; justify-content: center; gap: 9px; min-width: 0;
               font: inherit; font-size: 14px; font-weight: 600; color: var(--_text); cursor: pointer; white-space: nowrap;
               background: var(--_surface); border: 1px solid var(--_border); box-shadow: var(--_shadow);
               -webkit-backdrop-filter: blur(var(--_blur)); backdrop-filter: blur(var(--_blur));
               transition: transform .15s var(--_ease), background .2s; -webkit-tap-highlight-color: transparent; }
      button:active { transform: scale(.96); }
      button ha-icon { color: var(--_accent); --mdc-icon-size: 20px; }
      button.armed { background: rgba(${COLORS.orange}, .2); border-color: rgba(${COLORS.orange}, .55); }
      button.busy { opacity: .6; pointer-events: none; }
      button.ok ha-icon { color: rgb(${COLORS.green}); }
    `;
  }

  render() {
    const acts = this._config.actions || [];
    this.html(`<ha-card><div class="row">${acts.map((a, i) => `
      <button data-i="${i}"><ha-icon icon="${esc(a.icon || "mdi:gesture-tap")}"></ha-icon>
        <span class="lbl">${esc(a.name)}</span></button>`).join("")}</div></ha-card>`);
    this.shadowRoot.querySelectorAll("button").forEach((btn) =>
      btn.addEventListener("click", () => this._run(btn, acts[+btn.dataset.i])));
  }

  getCardSize() {
    return 1;
  }

  getGridOptions() {
    return { columns: 12, min_columns: 6, rows: "auto" };
  }
}
