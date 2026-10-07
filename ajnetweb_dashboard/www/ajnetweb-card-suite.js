/**
 * AJ Netweb Card Suite - Self-Contained Lovelace Custom Web Components
 * Zero HACS or external repository dependencies. Maintained directly by AJ Netweb.
 * Components:
 *   - <ajnetweb-room-card>: Cyber / Bento / Minimal / OLED / Hotel Room Hero Card
 *   - <ajnetweb-quick-scenes>: Touch-optimized Scene Buttons Carousel
 *   - <ajnetweb-climate-tile>: Interactive Thermostat Tile
 */

(function () {
  "use strict";

  // ------------------------------------------------------------------ 1. Room Hero Card
  class AjnetwebRoomCard extends HTMLElement {
    setConfig(config) {
      this._config = config || {};
      this.render();
    }

    set hass(hass) {
      this._hass = hass;
    }

    render() {
      const cfg = this._config;
      const title = cfg.title || "Smart Residence";
      const subtitle = cfg.subtitle || "All Systems Operational";
      const badgeText = cfg.badge_text || "Active";
      const preset = cfg.preset || "cyber";

      let bgStyle = "background: rgba(15, 23, 42, 0.7); backdrop-filter: blur(16px); border: 1px solid rgba(0, 229, 255, 0.25);";
      let accentColor = "#00e5ff";
      let glowColor = "rgba(0, 229, 255, 0.4)";

      if (preset === "minimal") {
        bgStyle = "background: #1e293b; border: 1px solid rgba(255, 255, 255, 0.1);";
        accentColor = "#f59e0b";
        glowColor = "transparent";
      } else if (preset === "bento") {
        bgStyle = "background: #18181b; border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 24px;";
        accentColor = "#38bdf8";
        glowColor = "rgba(56, 189, 248, 0.3)";
      } else if (preset === "oled") {
        bgStyle = "background: #000000; border: 1px solid #10b981; border-radius: 14px;";
        accentColor = "#10b981";
        glowColor = "rgba(16, 185, 129, 0.3)";
      } else if (preset === "hotel") {
        bgStyle = "background: linear-gradient(135deg, #1c1917 0%, #0c0a09 100%); border: 1px solid #d97706; border-radius: 18px;";
        accentColor = "#fbbf24";
        glowColor = "rgba(251, 191, 36, 0.2)";
      }

      this.innerHTML = `
        <ha-card style="overflow: hidden; padding: 20px; border-radius: 20px; ${bgStyle} box-shadow: 0 8px 32px rgba(0,0,0,0.5);">
          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div>
              <div style="font-size: 0.75rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.15em; color: ${accentColor}; margin-bottom: 4px;">
                AJ NETWEB DASHBOARD SUITE
              </div>
              <h1 style="margin: 0; font-size: 1.6rem; font-weight: 800; color: #f8fafc; letter-spacing: -0.02em;">
                ${title}
              </h1>
              <div style="margin-top: 4px; font-size: 0.85rem; color: #94a3b8;">
                ${subtitle}
              </div>
            </div>
            <div style="display: flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 20px; background: rgba(0,0,0,0.4); border: 1px solid ${accentColor}; font-size: 0.72rem; font-weight: 700; color: ${accentColor}; box-shadow: 0 0 12px ${glowColor};">
              <span style="width: 7px; height: 7px; border-radius: 50%; background: ${accentColor}; display: inline-block;"></span>
              ${badgeText}
            </div>
          </div>
        </ha-card>
      `;
    }

    getCardSize() {
      return 2;
    }
  }

  // ------------------------------------------------------------------ 2. Quick Scenes Carousel
  class AjnetwebQuickScenes extends HTMLElement {
    setConfig(config) {
      this._config = config || {};
      this.render();
    }

    set hass(hass) {
      this._hass = hass;
    }

    render() {
      const cfg = this._config;
      const scenes = cfg.scenes || [
        { name: "Welcome", icon: "mdi:home", action: "scene.welcome" },
        { name: "Cinema", icon: "mdi:filmstrip", action: "scene.cinema" },
        { name: "Night", icon: "mdi:weather-night", action: "scene.night" },
      ];

      const itemsHtml = scenes.map((s, idx) => `
        <button class="scene-btn" data-action="${s.action}" style="
          flex: 1; min-width: 90px; padding: 12px 10px; background: rgba(30, 41, 59, 0.7);
          border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 14px; color: #f8fafc;
          display: flex; flex-direction: column; align-items: center; gap: 6px; cursor: pointer;
          transition: all 0.2s ease;
        ">
          <ha-icon icon="${s.icon || 'mdi:play'}" style="color: #38bdf8;"></ha-icon>
          <span style="font-size: 0.75rem; font-weight: 600;">${s.name}</span>
        </button>
      `).join("");

      this.innerHTML = `
        <ha-card style="padding: 14px; background: transparent; border: none; box-shadow: none;">
          <div style="display: flex; gap: 10px; overflow-x: auto; padding-bottom: 4px;">
            ${itemsHtml}
          </div>
        </ha-card>
      `;

      this.querySelectorAll(".scene-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const act = btn.dataset.action;
          if (this._hass && act) {
            btn.style.transform = "scale(0.94)";
            setTimeout(() => (btn.style.transform = "none"), 150);
            this._hass.callService("homeassistant", "turn_on", { entity_id: act });
          }
        });
      });
    }

    getCardSize() {
      return 1;
    }
  }

  // Register Custom Elements
  if (!customElements.get("ajnetweb-room-card")) {
    customElements.define("ajnetweb-room-card", AjnetwebRoomCard);
  }
  if (!customElements.get("ajnetweb-quick-scenes")) {
    customElements.define("ajnetweb-quick-scenes", AjnetwebQuickScenes);
  }

  // Register in Lovelace Card Picker Window
  window.customCards = window.customCards || [];
  window.customCards.push(
    {
      type: "ajnetweb-room-card",
      name: "AJ Netweb Room Hero Card",
      description: "Header card with dynamic status badge for Cyber, Bento, Minimal, and OLED themes.",
    },
    {
      type: "ajnetweb-quick-scenes",
      name: "AJ Netweb Quick Scenes Carousel",
      description: "One-touch tactile scene buttons carousel.",
    }
  );

  console.info("%c AJ NETWEB CARD SUITE %c v1.0.0 Loaded (Zero HACS Dependencies) ",
               "background: #00e5ff; color: #000; font-weight: bold; border-radius: 3px 0 0 3px;",
               "background: #0f172a; color: #fff; font-weight: bold; border-radius: 0 3px 3px 0;");
})();
