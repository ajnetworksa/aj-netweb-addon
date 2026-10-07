/**
 * AJ Netweb Dashboard Suite - Frontend Studio Controller
 */

(function () {
  "use strict";

  const state = {
    selectedTheme: "cyber_luxury",
    discoveredAreas: [],
    selectedAreaIds: new Set(),
  };

  const el = {
    kpiRooms: document.getElementById("kpiRooms"),
    kpiLights: document.getElementById("kpiLights"),
    kpiClimates: document.getElementById("kpiClimates"),
    kpiCovers: document.getElementById("kpiCovers"),
    kpiCameras: document.getElementById("kpiCameras"),
    btnRescan: document.getElementById("btnRescan"),
    themeCards: document.querySelectorAll(".theme-card"),
    roomsGrid: document.getElementById("roomsGrid"),
    btnSelectAll: document.getElementById("btnSelectAll"),
    btnDeselectAll: document.getElementById("btnDeselectAll"),
    deployForm: document.getElementById("deployForm"),
    cfgTitle: document.getElementById("cfgTitle"),
    cfgUrl: document.getElementById("cfgUrl"),
    btnPreview: document.getElementById("btnPreview"),
    btnDeploy: document.getElementById("btnDeploy"),
    deployFeedback: document.getElementById("deployFeedback"),
    previewModal: document.getElementById("previewModal"),
    modalCloseBtn: document.getElementById("modalCloseBtn"),
    previewCode: document.getElementById("previewCode"),
  };

  async function loadDiscovery() {
    el.roomsGrid.innerHTML = '<div class="loading-state">Scanning Home Assistant room &amp; entity registries...</div>';
    try {
      const res = await fetch("api/discovery");
      const data = await res.json();
      if (!data.ok || !data.layout) {
        el.roomsGrid.innerHTML = `<div class="loading-state" style="color:var(--danger);">Discovery failed: ${data.error || "Unknown error"}</div>`;
        return;
      }

      const l = data.layout;
      el.kpiRooms.textContent = l.areas_count;
      el.kpiLights.textContent = l.lights_count;
      el.kpiClimates.textContent = l.climates_count;
      el.kpiCovers.textContent = l.covers_count;
      el.kpiCameras.textContent = (l.cameras_count || 0) + (l.locks_count || 0);

      state.discoveredAreas = l.areas || [];
      state.selectedAreaIds = new Set(state.discoveredAreas.map((a) => a.id));

      renderRooms();
    } catch (err) {
      el.roomsGrid.innerHTML = `<div class="loading-state" style="color:var(--danger);">Error connecting to Discovery API: ${err.message}</div>`;
    }
  }

  function renderRooms() {
    if (!state.discoveredAreas.length) {
      el.roomsGrid.innerHTML = '<div class="loading-state">No rooms detected. Please configure Areas in Home Assistant Settings.</div>';
      return;
    }

    el.roomsGrid.innerHTML = state.discoveredAreas
      .map((a) => {
        const isChecked = state.selectedAreaIds.has(a.id);
        const counts = [];
        if (a.lights.length) counts.push(`💡 ${a.lights.length} Lights`);
        if (a.climates.length) counts.push(`❄️ ${a.climates.length} AC`);
        if (a.covers.length) counts.push(`🪟 ${a.covers.length} Shades`);
        if (a.cameras.length) counts.push(`📹 ${a.cameras.length} Cam`);
        if (a.locks.length) counts.push(`🔒 ${a.locks.length} Lock`);
        if (a.media.length) counts.push(`🎵 ${a.media.length} Audio`);

        return `
          <div class="room-card-item ${isChecked ? 'selected' : ''}" data-id="${a.id}">
            <input type="checkbox" class="room-checkbox" ${isChecked ? 'checked' : ''} />
            <div class="room-info">
              <div class="room-name">${escapeHtml(a.name)}</div>
              <div class="room-counts">
                ${counts.map((c) => `<span class="count-chip">${c}</span>`).join("") || '<span class="count-chip">Empty Room</span>'}
              </div>
            </div>
          </div>
        `;
      })
      .join("");

    // Bind checkboxes
    el.roomsGrid.querySelectorAll(".room-card-item").forEach((card) => {
      const id = card.dataset.id;
      const cb = card.querySelector(".room-checkbox");

      card.addEventListener("click", (e) => {
        if (e.target !== cb) {
          cb.checked = !cb.checked;
        }
        if (cb.checked) {
          state.selectedAreaIds.add(id);
          card.classList.add("selected");
        } else {
          state.selectedAreaIds.delete(id);
          card.classList.remove("selected");
        }
      });
    });
  }

  function setupThemeSelector() {
    el.themeCards.forEach((card) => {
      card.addEventListener("click", () => {
        el.themeCards.forEach((c) => c.classList.remove("active"));
        card.classList.add("active");
        state.selectedTheme = card.dataset.theme;

        // Auto-update title if default
        if (el.cfgTitle.value.startsWith("AJ Netweb")) {
          const names = {
            cyber_luxury: "AJ Netweb Cyber Luxury",
            scandinavian_minimal: "AJ Netweb Scandinavian",
            modern_bento: "AJ Netweb Modern Bento",
            oled_stealth: "AJ Netweb OLED Stealth",
            hotel_suite: "AJ Netweb Boutique Hotel",
          };
          el.cfgTitle.value = names[state.selectedTheme] || "AJ Netweb Smart Home";
        }
      });
    });

    if (el.btnSelectAll) {
      el.btnSelectAll.addEventListener("click", () => {
        state.selectedAreaIds = new Set(state.discoveredAreas.map((a) => a.id));
        renderRooms();
      });
    }

    if (el.btnDeselectAll) {
      el.btnDeselectAll.addEventListener("click", () => {
        state.selectedAreaIds.clear();
        renderRooms();
      });
    }

    if (el.btnRescan) {
      el.btnRescan.addEventListener("click", loadDiscovery);
    }
  }

  function setupPreviewAndDeploy() {
    // Preview
    if (el.btnPreview) {
      el.btnPreview.addEventListener("click", async () => {
        const theme = state.selectedTheme;
        const title = el.cfgTitle.value || "AJ Netweb Dashboard";
        try {
          const res = await fetch(`api/preview?theme=${encodeURIComponent(theme)}&title=${encodeURIComponent(title)}`);
          const data = await res.json();
          if (data.ok) {
            el.previewCode.textContent = JSON.stringify(data.config, null, 2);
            el.previewModal.style.display = "flex";
          } else {
            alert("Preview generation failed: " + data.error);
          }
        } catch (e) {
          alert("Preview failed: " + e.message);
        }
      });
    }

    if (el.modalCloseBtn) {
      el.modalCloseBtn.addEventListener("click", () => {
        el.previewModal.style.display = "none";
      });
    }
    if (el.previewModal) {
      el.previewModal.addEventListener("click", (e) => {
        if (e.target === el.previewModal) el.previewModal.style.display = "none";
      });
    }

    // Deploy
    if (el.deployForm) {
      el.deployForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const title = el.cfgTitle.value.trim();
        const url = el.cfgUrl.value.trim().toLowerCase();
        const theme = state.selectedTheme;
        const areas = Array.from(state.selectedAreaIds);

        el.btnDeploy.disabled = true;
        el.deployFeedback.className = "deploy-feedback show";
        el.deployFeedback.innerHTML = '<span style="color:var(--accent);">⚡ Deploying dashboard to Home Assistant &amp; bundling card suite...</span>';

        try {
          const res = await fetch("api/deploy", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              theme,
              title,
              dashboard_url: url,
              selected_areas: areas,
            }),
          });
          const data = await res.json();
          if (data.ok) {
            el.deployFeedback.className = "deploy-feedback show success";
            el.deployFeedback.innerHTML = `
              <div style="font-weight:700; margin-bottom:6px;">✓ Dashboard deployed successfully!</div>
              <div style="font-size:0.85rem; margin-bottom:12px;">The dashboard has been written directly to Home Assistant storage and registered in your sidebar.</div>
              <a href="/${data.url_path}" target="_blank" class="primary-btn" style="display:inline-block; text-decoration:none; padding:8px 16px;">
                🚀 Open Dashboard in Home Assistant (/${data.url_path})
              </a>
            `;
          } else {
            el.deployFeedback.className = "deploy-feedback show error";
            el.deployFeedback.innerHTML = `✕ Deployment failed: ${data.error || "Unknown error"}`;
          }
        } catch (err) {
          el.deployFeedback.className = "deploy-feedback show error";
          el.deployFeedback.innerHTML = `✕ Error: ${err.message}`;
        } finally {
          el.btnDeploy.disabled = false;
        }
      });
    }
  }

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function setupBlueprints() {
    const btnSync = document.getElementById("btnInstallBlueprints");
    const feedback = document.getElementById("blueprintFeedback");
    if (!btnSync) return;

    btnSync.addEventListener("click", async () => {
      btnSync.disabled = true;
      btnSync.textContent = "⏳ Installing...";
      if (feedback) {
        feedback.className = "deploy-feedback";
        feedback.textContent = "";
      }
      try {
        const res = await fetch("/api/blueprints/install", { method: "POST" });
        const data = await res.json();
        if (data.ok) {
          if (feedback) {
            feedback.className = "deploy-feedback show success";
            feedback.innerHTML = `✓ 3 GCC Luxury Villa Blueprints synchronized into Home Assistant (<code>/config/blueprints/automation/ajnetweb/</code>). Available now in HA Settings → Automations → Blueprints!`;
          }
        } else {
          if (feedback) {
            feedback.className = "deploy-feedback show error";
            feedback.textContent = `✕ Failed to install blueprints: ${data.error || "Unknown error"}`;
          }
        }
      } catch (err) {
        if (feedback) {
          feedback.className = "deploy-feedback show error";
          feedback.textContent = `✕ Network error: ${err.message}`;
        }
      } finally {
        btnSync.disabled = false;
        btnSync.textContent = "📥 Sync All Blueprints to HA";
      }
    });
  }

  function init() {
    setupThemeSelector();
    setupPreviewAndDeploy();
    setupBlueprints();
    loadDiscovery();
  }

  window.addEventListener("DOMContentLoaded", init);
})();

