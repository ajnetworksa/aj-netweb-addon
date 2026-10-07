/**
 * AJ Netweb Room & Guest Pass Studio - Frontend Controller
 * Zero-YAML Room Sharing, Instant Guest QR Codes, and Automated Dashboard Sync.
 */

(function () {
  "use strict";

  const state = {
    activeTab: "passes",
    areas: [],
    users: [],
    passes: [],
    matrix: [],
    activePassForView: null,
    // Theming
    theme: localStorage.getItem("ajn_sharing_theme") || "cyan",
    customColor: localStorage.getItem("ajn_sharing_custom_color") || "#00e5ff",
    oledMode: localStorage.getItem("ajn_sharing_oled") === "true",
  };

  const el = {
    navBtns: document.querySelectorAll(".nav-btn"),
    viewPanels: document.querySelectorAll(".view-panel"),
    quickThemeSelect: document.getElementById("quickThemeSelect"),
    headerColorPicker: document.getElementById("headerColorPicker"),
    colorPickerWrapper: document.getElementById("colorPickerWrapper"),
    // Stats
    statActivePasses: document.getElementById("statActivePasses"),
    statTotalRooms: document.getElementById("statTotalRooms"),
    statGuestActions: document.getElementById("statGuestActions"),
    // Passes Tab
    btnOpenCreatePass: document.getElementById("btnOpenCreatePass"),
    passesList: document.getElementById("passesList"),
    // Create Pass Modal
    modalCreatePass: document.getElementById("modalCreatePass"),
    btnCloseCreatePass: document.getElementById("btnCloseCreatePass"),
    btnCancelCreatePass: document.getElementById("btnCancelCreatePass"),
    formCreatePass: document.getElementById("formCreatePass"),
    passName: document.getElementById("passName"),
    passGuestName: document.getElementById("passGuestName"),
    createPassRoomsGrid: document.getElementById("createPassRoomsGrid"),
    btnSelectAllRooms: document.getElementById("btnSelectAllRooms"),
    durationPresets: document.querySelectorAll(".preset-btn"),
    passDurationHours: document.getElementById("passDurationHours"),
    chkPassLights: document.getElementById("chkPassLights"),
    chkPassClimate: document.getElementById("chkPassClimate"),
    chkPassCovers: document.getElementById("chkPassCovers"),
    chkPassSwitches: document.getElementById("chkPassSwitches"),
    chkPassLocks: document.getElementById("chkPassLocks"),
    // View Pass Modal
    modalViewPass: document.getElementById("modalViewPass"),
    btnCloseViewPass: document.getElementById("btnCloseViewPass"),
    viewPassTitle: document.getElementById("viewPassTitle"),
    qrCodeContainer: document.getElementById("qrCodeContainer"),
    viewPassMeta: document.getElementById("viewPassMeta"),
    passShareUrl: document.getElementById("passShareUrl"),
    btnCopyPassUrl: document.getElementById("btnCopyPassUrl"),
    btnWhatsAppShare: document.getElementById("btnWhatsAppShare"),
    btnPrintCard: document.getElementById("btnPrintCard"),
    btnTestPortal: document.getElementById("btnTestPortal"),
    // Matrix Tab
    matrixTable: document.getElementById("matrixTable"),
    matrixHeaderRow: document.getElementById("matrixHeaderRow"),
    matrixBody: document.getElementById("matrixBody"),
    btnSaveMatrix: document.getElementById("btnSaveMatrix"),
    btnSyncDashboards: document.getElementById("btnSyncDashboards"),
    matrixFeedback: document.getElementById("matrixFeedback"),
    // Audit Tab
    auditTableBody: document.getElementById("auditTableBody"),
    // Settings Tab
    settingsCustomColor: document.getElementById("settingsCustomColor"),
    settingsOledToggle: document.getElementById("settingsOledToggle"),
  };

  // ------------------------------------------------------------------ Initialization
  async function init() {
    applyTheme(state.theme, state.customColor, state.oledMode);
    setupNavigation();
    setupModals();
    setupPresets();

    await loadMetadata();
    await loadPasses();
  }

  // ------------------------------------------------------------------ Theme Engine
  function applyTheme(themeName, customHex, isOled) {
    state.theme = themeName;
    state.customColor = customHex || state.customColor;
    state.oledMode = isOled;

    localStorage.setItem("ajn_sharing_theme", themeName);
    localStorage.setItem("ajn_sharing_custom_color", state.customColor);
    localStorage.setItem("ajn_sharing_oled", isOled ? "true" : "false");

    document.documentElement.setAttribute("data-theme", themeName);
    document.documentElement.setAttribute("data-oled", isOled ? "true" : "false");

    if (themeName === "custom" && customHex) {
      document.documentElement.style.setProperty("--accent", customHex);
      document.documentElement.style.setProperty("--accent-hover", customHex);
      document.documentElement.style.setProperty("--accent-glow", hexToRgba(customHex, 0.4));
      document.documentElement.style.setProperty("--accent-subtle", hexToRgba(customHex, 0.12));
    } else {
      document.documentElement.style.removeProperty("--accent");
      document.documentElement.style.removeProperty("--accent-hover");
      document.documentElement.style.removeProperty("--accent-glow");
      document.documentElement.style.removeProperty("--accent-subtle");
    }

    if (el.quickThemeSelect) el.quickThemeSelect.value = themeName;
    if (el.colorPickerWrapper) {
      el.colorPickerWrapper.style.display = themeName === "custom" ? "inline-block" : "none";
    }
    if (el.headerColorPicker) el.headerColorPicker.value = state.customColor;
    if (el.settingsCustomColor) el.settingsCustomColor.value = state.customColor;
    if (el.settingsOledToggle) el.settingsOledToggle.value = isOled ? "true" : "false";
  }

  function hexToRgba(hex, alpha) {
    const c = hex.replace("#", "");
    const r = parseInt(c.substring(0, 2), 16) || 0;
    const g = parseInt(c.substring(2, 4), 16) || 0;
    const b = parseInt(c.substring(4, 6), 16) || 0;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  // ------------------------------------------------------------------ Navigation
  function setupNavigation() {
    el.navBtns.forEach((btn) => {
      btn.addEventListener("click", () => switchTab(btn.dataset.tab));
    });

    el.quickThemeSelect.addEventListener("change", (e) => {
      applyTheme(e.target.value, state.customColor, state.oledMode);
    });

    el.headerColorPicker.addEventListener("input", (e) => {
      applyTheme("custom", e.target.value, state.oledMode);
    });

    if (el.settingsCustomColor) {
      el.settingsCustomColor.addEventListener("input", (e) => {
        applyTheme("custom", e.target.value, state.oledMode);
      });
    }

    if (el.settingsOledToggle) {
      el.settingsOledToggle.addEventListener("change", (e) => {
        applyTheme(state.theme, state.customColor, e.target.value === "true");
      });
    }
  }

  function switchTab(tab) {
    state.activeTab = tab;
    el.navBtns.forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    el.viewPanels.forEach((p) => {
      p.classList.toggle("active", p.id === `view${capitalize(tab)}`);
    });

    if (tab === "passes") {
      loadPasses();
    } else if (tab === "matrix") {
      loadMatrix();
    } else if (tab === "audit") {
      loadAudit();
    }
  }

  function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  // ------------------------------------------------------------------ Metadata
  async function loadMetadata() {
    try {
      const res = await fetch("api/metadata");
      const data = await res.json();
      state.areas = data.areas || [];
      state.users = data.users || [];

      if (el.statTotalRooms) el.statTotalRooms.textContent = state.areas.length;
      renderCreatePassRooms();
    } catch (e) {
      console.error("Failed to load HA metadata:", e);
    }
  }

  function renderCreatePassRooms() {
    if (!state.areas.length) {
      el.createPassRoomsGrid.innerHTML = `<div class="empty-hint">No Home Assistant areas found. Create areas in Settings &gt; Areas first.</div>`;
      return;
    }
    el.createPassRoomsGrid.innerHTML = state.areas
      .map(
        (a) => `
      <label class="room-selection-item">
        <input type="checkbox" name="passArea" value="${a.id}">
        <span>${a.name} <small style="color:var(--text-muted);">(${a.entity_count} devices)</small></span>
      </label>
    `
      )
      .join("");
  }

  // ------------------------------------------------------------------ Guest Passes
  async function loadPasses() {
    try {
      const res = await fetch("api/passes");
      const list = await res.json();
      state.passes = Array.isArray(list) ? list : [];

      const activeCount = state.passes.filter((p) => !p.revoked && !p.expired).length;
      const totalActions = state.passes.reduce((acc, p) => acc + (p.use_count || 0), 0);
      if (el.statActivePasses) el.statActivePasses.textContent = activeCount;
      if (el.statGuestActions) el.statGuestActions.textContent = totalActions;

      renderPassesGrid();
    } catch (e) {
      console.error("Failed to load passes:", e);
    }
  }

  function renderPassesGrid() {
    if (!state.passes.length) {
      el.passesList.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <p>No room passes created yet. Click "+ Create New Room Pass" to generate an instant guest QR code.</p>
        </div>`;
      return;
    }

    const areaMap = {};
    state.areas.forEach((a) => {
      areaMap[a.id] = a.name;
    });

    el.passesList.innerHTML = state.passes
      .map((p) => {
        const isExpired = p.revoked || p.expired;
        const roomChips = (p.areas || [])
          .map((aId) => `<span class="room-chip">📍 ${areaMap[aId] || aId}</span>`)
          .join("");

        let countdownStr = "Permanent";
        let countdownClass = "permanent";
        if (p.expires_at) {
          const exp = new Date(p.expires_at);
          const diffMs = exp - new Date();
          if (diffMs <= 0 || p.expired) {
            countdownStr = "Expired";
            countdownClass = "danger";
          } else {
            const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
            const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
            countdownStr = `⏳ ${diffHours}h ${diffMins}m remaining`;
            countdownClass = "warning";
          }
        }
        if (p.revoked) {
          countdownStr = "Revoked";
          countdownClass = "danger";
        }

        return `
        <div class="pass-card ${isExpired ? "expired" : ""}">
          <div>
            <div class="pass-card-header">
              <div>
                <div class="pass-title">${p.name}</div>
                ${p.guest_name ? `<div class="pass-guest">Guest: ${p.guest_name}</div>` : ""}
              </div>
              <span class="badge ${p.revoked ? "danger" : p.expired ? "danger" : "success"}">
                ${p.revoked ? "Revoked" : p.expired ? "Expired" : "Active"}
              </span>
            </div>

            <div class="pass-rooms-chips">${roomChips}</div>
          </div>

          <div>
            <div class="pass-footer-meta">
              <span class="pass-countdown ${countdownClass}">${countdownStr}</span>
              <span>Used: ${p.use_count || 0} times</span>
            </div>

            <div class="pass-card-actions">
              <button class="primary-btn btn-sm btn-view-pass" data-id="${p.id}">📱 QR &amp; Link</button>
              ${
                !isExpired
                  ? `<button class="secondary-btn btn-sm btn-revoke-pass" data-id="${p.id}" style="color:var(--danger); border-color:rgba(239,68,68,0.3);">Revoke</button>`
                  : ""
              }
              <button class="secondary-btn btn-sm btn-delete-pass" data-id="${p.id}">Delete</button>
            </div>
          </div>
        </div>
      `;
      })
      .join("");

    // Bind pass action buttons
    el.passesList.querySelectorAll(".btn-view-pass").forEach((btn) => {
      btn.addEventListener("click", () => {
        const passObj = state.passes.find((p) => p.id === btn.dataset.id);
        if (passObj) openViewPassModal(passObj);
      });
    });

    el.passesList.querySelectorAll(".btn-revoke-pass").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("Revoke this pass immediately? The guest will lose room access.")) return;
        await fetch("api/passes/revoke", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: btn.dataset.id }),
        });
        loadPasses();
      });
    });

    el.passesList.querySelectorAll(".btn-delete-pass").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("Permanently delete this pass?")) return;
        await fetch("api/passes/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: btn.dataset.id }),
        });
        loadPasses();
      });
    });
  }

  // ------------------------------------------------------------------ Modals & Pass Creation
  function setupModals() {
    el.btnOpenCreatePass.addEventListener("click", () => {
      renderCreatePassRooms();
      el.modalCreatePass.style.display = "flex";
    });

    el.btnCloseCreatePass.addEventListener("click", () => (el.modalCreatePass.style.display = "none"));
    el.btnCancelCreatePass.addEventListener("click", () => (el.modalCreatePass.style.display = "none"));
    el.btnCloseViewPass.addEventListener("click", () => (el.modalViewPass.style.display = "none"));

    el.btnSelectAllRooms.addEventListener("click", () => {
      const cbs = el.createPassRoomsGrid.querySelectorAll("input[type='checkbox']");
      const anyUnchecked = Array.from(cbs).some((cb) => !cb.checked);
      cbs.forEach((cb) => (cb.checked = anyUnchecked));
      el.btnSelectAllRooms.textContent = anyUnchecked ? "Clear All" : "Select All";
    });

    // Form submission
    el.formCreatePass.addEventListener("submit", async (e) => {
      e.preventDefault();
      const selectedRooms = Array.from(
        el.createPassRoomsGrid.querySelectorAll("input[name='passArea']:checked")
      ).map((cb) => cb.value);

      if (!selectedRooms.length) {
        alert("Please select at least one room to share.");
        return;
      }

      const allowedDomains = [];
      if (el.chkPassLights.checked) allowedDomains.push("light");
      if (el.chkPassClimate.checked) allowedDomains.push("climate");
      if (el.chkPassCovers.checked) allowedDomains.push("cover");
      if (el.chkPassSwitches.checked) allowedDomains.push("switch");
      if (el.chkPassLocks.checked) allowedDomains.push("lock");

      const payload = {
        name: el.passName.value.trim(),
        guest_name: el.passGuestName.value.trim(),
        areas: selectedRooms,
        duration_hours: parseInt(el.passDurationHours.value, 10),
        allowed_domains: allowedDomains,
      };

      try {
        const res = await fetch("api/passes/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (data.ok) {
          el.modalCreatePass.style.display = "none";
          el.formCreatePass.reset();
          await loadPasses();
          openViewPassModal(data.pass);
        } else {
          alert(data.error || "Failed to create pass.");
        }
      } catch (err) {
        alert("Error: " + err.message);
      }
    });

    // Copy link
    el.btnCopyPassUrl.addEventListener("click", () => {
      el.passShareUrl.select();
      navigator.clipboard.writeText(el.passShareUrl.value);
      el.btnCopyPassUrl.textContent = "Copied!";
      setTimeout(() => {
        el.btnCopyPassUrl.textContent = "Copy Link";
      }, 2000);
    });

    // WhatsApp Share
    el.btnWhatsAppShare.addEventListener("click", () => {
      if (!state.activePassForView) return;
      const pass = state.activePassForView;
      const url = el.passShareUrl.value;
      const text = `Hi ${pass.guest_name || "there"}! Here is your smart room access pass for ${pass.name}: ${url}`;
      window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, "_blank");
    });

    // Test in new tab
    el.btnTestPortal.addEventListener("click", () => {
      if (el.passShareUrl.value) {
        window.open(el.passShareUrl.value, "_blank");
      }
    });

    // Print welcome card
    el.btnPrintCard.addEventListener("click", () => {
      printGuestWelcomeCard(state.activePassForView);
    });
  }

  function setupPresets() {
    el.durationPresets.forEach((btn) => {
      btn.addEventListener("click", () => {
        el.durationPresets.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        el.passDurationHours.value = btn.dataset.hours;
      });
    });
  }

  function openViewPassModal(pass) {
    state.activePassForView = pass;
    el.viewPassTitle.textContent = pass.name;

    // Build standalone guest URL
    let basePath = window.location.pathname;
    if (basePath.endsWith("/index.html")) basePath = basePath.replace("/index.html", "");
    basePath = basePath.replace(/\/$/, "");
    const guestUrl = `${window.location.origin}${basePath}/guest.html?token=${encodeURIComponent(pass.token)}`;
    el.passShareUrl.value = guestUrl;

    // Render QR Code
    new QRCodeSVG(el.qrCodeContainer, {
      text: guestUrl,
      width: 220,
      height: 220,
    });

    const areaMap = {};
    state.areas.forEach((a) => (areaMap[a.id] = a.name));
    const roomNames = (pass.areas || []).map((id) => areaMap[id] || id).join(", ");

    el.viewPassMeta.innerHTML = `
      <div><strong>Authorized Rooms:</strong> ${roomNames}</div>
      <div style="margin-top:4px;"><strong>Expiration:</strong> ${
        pass.expires_at ? new Date(pass.expires_at).toLocaleString("en-GB") : "Permanent"
      }</div>
    `;

    el.modalViewPass.style.display = "flex";
  }

  function printGuestWelcomeCard(pass) {
    const areaMap = {};
    state.areas.forEach((a) => (areaMap[a.id] = a.name));
    const roomNames = (pass.areas || []).map((id) => areaMap[id] || id).join(", ");
    const guestUrl = el.passShareUrl.value;

    const printWin = window.open("", "_blank");
    printWin.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Welcome Guest - Smart Room Pass</title>
        <style>
          body { font-family: -apple-system, sans-serif; text-align: center; padding: 40px; }
          .card { max-width: 440px; margin: 0 auto; border: 2px dashed #000; border-radius: 16px; padding: 30px; }
          h1 { margin-bottom: 6px; font-size: 1.5rem; }
          p { color: #555; font-size: 0.95rem; margin-bottom: 20px; }
          .qr { margin: 20px 0; }
          .meta { font-size: 0.85rem; color: #333; margin-top: 14px; line-height: 1.5; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>Welcome to Your Smart Room</h1>
          <p>Scan this QR code with your phone camera to control your room lights, AC, and curtains. No app required!</p>
          <div class="qr"><img src="https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(
            guestUrl
          )}" width="240" height="240"></div>
          <div class="meta">
            <strong>Room(s):</strong> ${roomNames}<br>
            <strong>Pass:</strong> ${pass.name} (${pass.guest_name || "Guest"})
          </div>
        </div>
        <script>window.onload = function() { window.print(); }<\/script>
      </body>
      </html>
    `);
    printWin.document.close();
  }

  // ------------------------------------------------------------------ Visual User Room Matrix
  async function loadMatrix() {
    try {
      const res = await fetch("api/matrix");
      const data = await res.json();
      state.matrix = data.users || [];
      const areas = data.areas || state.areas;

      // Render Table Header
      let headerHtml = `<th class="user-col">User / Person</th>`;
      areas.forEach((a) => {
        headerHtml += `<th>${a.name}</th>`;
      });
      el.matrixHeaderRow.innerHTML = headerHtml;

      // Render Table Rows
      if (!state.matrix.length) {
        el.matrixBody.innerHTML = `<tr><td colspan="${areas.length + 1}" class="loading-td">No Home Assistant users found.</td></tr>`;
        return;
      }

      el.matrixBody.innerHTML = state.matrix
        .map((u) => {
          let row = `
          <tr data-user-id="${u.user_id}">
            <td class="user-col">
              <div>${u.name} ${u.is_admin ? '<span class="badge" style="background:#1e293b; color:#94a3b8; font-size:0.68rem;">Admin</span>' : ""}</div>
              <small style="color:var(--text-muted);">@${u.username || "user"}</small>
            </td>
        `;

          areas.forEach((a) => {
            const isChecked = u.is_admin || (u.allowed_areas || []).includes(a.id);
            row += `
            <td style="text-align:center;">
              <input type="checkbox" class="cell-checkbox" data-user="${u.user_id}" data-area="${a.id}" ${isChecked ? "checked" : ""}>
            </td>
          `;
          });

          row += `</tr>`;
          return row;
        })
        .join("");
    } catch (e) {
      console.error("Failed to load user matrix:", e);
    }
  }

  // Save Matrix
  if (el.btnSaveMatrix) {
    el.btnSaveMatrix.addEventListener("click", async () => {
      const matrixMap = {};
      el.matrixBody.querySelectorAll("tr[data-user-id]").forEach((row) => {
        const uId = row.dataset.userId;
        const checkedAreas = Array.from(row.querySelectorAll("input.cell-checkbox:checked")).map(
          (cb) => cb.dataset.area
        );
        matrixMap[uId] = checkedAreas;
      });

      el.matrixFeedback.innerHTML = '<span style="color:var(--accent);">Saving matrix permissions...</span>';
      try {
        const res = await fetch("api/matrix/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ matrix: matrixMap }),
        });
        const d = await res.json();
        if (d.ok) {
          el.matrixFeedback.innerHTML = '<span style="color:var(--success);">✓ Permissions saved successfully!</span>';
          setTimeout(() => {
            el.matrixFeedback.innerHTML = "";
          }, 3000);
        } else {
          el.matrixFeedback.innerHTML = `<span style="color:var(--danger);">${d.error || "Failed"}</span>`;
        }
      } catch (err) {
        el.matrixFeedback.innerHTML = `<span style="color:var(--danger);">${err.message}</span>`;
      }
    });
  }

  // 1-Click Sync to Lovelace Dashboards
  if (el.btnSyncDashboards) {
    el.btnSyncDashboards.addEventListener("click", async () => {
      // First save current matrix
      el.btnSaveMatrix.click();

      el.matrixFeedback.innerHTML =
        '<span style="color:var(--accent);">⚡ Synchronizing Lovelace view visibility rules...</span>';
      try {
        const res = await fetch("api/matrix/sync_dashboards", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        const d = await res.json();
        if (d.ok) {
          el.matrixFeedback.innerHTML = `<span style="color:var(--success);">✓ ${d.message}</span>`;
        } else {
          el.matrixFeedback.innerHTML = `<span style="color:var(--danger);">${d.error || "Sync failed"}</span>`;
        }
      } catch (err) {
        el.matrixFeedback.innerHTML = `<span style="color:var(--danger);">${err.message}</span>`;
      }
    });
  }

  // ------------------------------------------------------------------ Audit Log
  async function loadAudit() {
    try {
      const res = await fetch("api/audit");
      const list = await res.json();
      if (!Array.isArray(list) || !list.length) {
        el.auditTableBody.innerHTML = `<tr><td colspan="6" class="empty-hint">No audit events recorded yet.</td></tr>`;
        return;
      }

      el.auditTableBody.innerHTML = list
        .map((item) => {
          const d = new Date(item.timestamp);
          const timeStr = `${d.toLocaleDateString("en-GB")} ${d.toLocaleTimeString("en-GB")}`;
          return `
          <tr>
            <td style="color:var(--text-muted); font-size:0.78rem;">${timeStr}</td>
            <td><strong>${item.actor || "Guest"}</strong></td>
            <td><code>${item.action || "control"}</code></td>
            <td style="font-family:var(--font-mono); font-size:0.8rem;">${item.entity_id || "—"}</td>
            <td><span class="room-chip">📍 ${item.area || "—"}</span></td>
            <td style="color:var(--text-secondary);">${item.details || ""}</td>
          </tr>
        `;
        })
        .join("");
    } catch (e) {
      console.error("Failed to load audit logs:", e);
    }
  }

  window.addEventListener("DOMContentLoaded", init);
})();
