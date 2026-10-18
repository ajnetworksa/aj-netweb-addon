// Cards used by dashboards generated with Dashboard Suite v1.x. Kept so old dashboards keep working.
import { AjnBase, esc } from "../core/base.js";
import { AjnetwebActionsCard } from "./actions.js";

export class AjnetwebRoomCard extends AjnBase {
  render() {
    const c = this._config;
    this.html(`<style>.w{padding:20px}.e{font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;
      color:var(--_accent)}h1{margin:4px 0 0;font-size:24px;color:var(--_text)}.s{margin-top:4px}</style>
      <ha-card><div class="w"><div class="e">${esc(c.badge_text || "")}</div>
      <h1>${esc(c.title || "Smart Residence")}</h1><div class="s muted">${esc(c.subtitle || "")}</div></div></ha-card>`);
  }
}

export class AjnetwebQuickScenes extends AjnetwebActionsCard {
  validate() {}

  setConfig(config) {
    const scenes = (config && config.scenes) || [];
    super.setConfig({ actions: scenes.map((s) => ({ name: s.name, icon: s.icon, action: "scene.turn_on",
                                                    target: { entity_id: s.action } })) });
  }
}
