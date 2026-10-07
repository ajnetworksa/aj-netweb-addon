/**
 * AJ Netweb Intercom & Door Station Studio - Frontend Controller
 * Real-Time Doorbell Chime, Electric Strike Relays, SSE Event Stream, and Visitor Gallery
 */

(function () {
  "use strict";

  const state = {
    configured: false,
    brand: "auto",
    door1Name: "Main Gate",
    door2Name: "Pedestrian Door",
    soundEnabled: true,
    activeTab: "live",
    callTimeout: null,
    clockTimer: null,
    eventSource: null,
    // Theme
    theme: localStorage.getItem("ajn_intercom_theme") || "cyan",
    customColor: localStorage.getItem("ajn_intercom_custom_color") || "#00e5ff",
    oledMode: localStorage.getItem("ajn_intercom_oled") === "true",
  };

  const el = {
    intercomBrandBadge: document.getElementById("intercomBrandBadge"),
    intercomSubTitle: document.getElementById("intercomSubTitle"),
    navBtns: document.querySelectorAll(".nav-btn"),
    viewPanels: document.querySelectorAll(".view-panel"),
    quickThemeSelect: document.getElementById("quickThemeSelect"),
    headerColorPicker: document.getElementById("headerColorPicker"),
    colorPickerWrapper: document.getElementById("colorPickerWrapper"),
    btnSoundToggle: document.getElementById("btnSoundToggle"),
    // Call Banner
    callBanner: document.getElementById("callBanner"),
    btnQuickUnlock: document.getElementById("btnQuickUnlock"),
    btnAnswerCall: document.getElementById("btnAnswerCall"),
    btnDeclineCall: document.getElementById("btnDeclineCall"),
    // Live Feed & Controls
    doorLiveImage: document.getElementById("doorLiveImage"),
    feedDoorName: document.getElementById("feedDoorName"),
    doorLockBadge: document.getElementById("doorLockBadge"),
    callStatusBadge: document.getElementById("callStatusBadge"),
    osdClock: document.getElementById("osdClock"),
    labelDoor1: document.getElementById("labelDoor1"),
    labelDoor2: document.getElementById("labelDoor2"),
    btnUnlockDoor1: document.getElementById("btnUnlockDoor1"),
    btnUnlockDoor2: document.getElementById("btnUnlockDoor2"),
    miniActivityList: document.getElementById("miniActivityList"),
    // Visitors Gallery
    visitorsGrid: document.getElementById("visitorsGrid"),
    imageModal: document.getElementById("imageModal"),
    modalImg: document.getElementById("modalImg"),
    modalCaption: document.getElementById("modalCaption"),
    modalCloseBtn: document.getElementById("modalCloseBtn"),
    // Settings
    settingsForm: document.getElementById("settingsForm"),
    cfgBrand: document.getElementById("cfgBrand"),
    cfgHost: document.getElementById("cfgHost"),
    cfgHttpPort: document.getElementById("cfgHttpPort"),
    cfgRtspPort: document.getElementById("cfgRtspPort"),
    cfgUsername: document.getElementById("cfgUsername"),
    cfgPassword: document.getElementById("cfgPassword"),
    cfgDoor1: document.getElementById("cfgDoor1"),
    cfgDoor2: document.getElementById("cfgDoor2"),
    btnTestConn: document.getElementById("btnTestConn"),
    settingsFeedback: document.getElementById("settingsFeedback"),
    settingsCustomColor: document.getElementById("settingsCustomColor"),
    settingsOledToggle: document.getElementById("settingsOledToggle"),
    themeChips: document.querySelectorAll(".theme-chip"),
  };

  // ------------------------------------------------------------------ Web Audio Ding-Dong Chime
  function playDoorbellChime() {
    if (!state.soundEnabled) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();

      // Ding (Higher Note)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(659.25, ctx.currentTime); // E5
      gain1.gain.setValueAtTime(0.6, ctx.currentTime);
      gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(ctx.currentTime);
      osc1.stop(ctx.currentTime + 1.2);

      // Dong (Lower Note)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(523.25, ctx.currentTime + 0.45); // C5
      gain2.gain.setValueAtTime(0.6, ctx.currentTime + 0.45);
      gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 2.0);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(ctx.currentTime + 0.45);
      osc2.stop(ctx.currentTime + 2.0);
    } catch (e) {
      console.warn("Audio chime failed:", e);
    }
  }

  // ------------------------------------------------------------------ Initialization
  async function init() {
    applyTheme(state.theme, state.customColor, state.oledMode);
    setupNavigation();
    setupDoorControls();
    setupSettings();
    startClock();

    await checkStatus();
    await loadVisitors();
    initEventStream();
  }

  // ------------------------------------------------------------------ Theme Engine
  function applyTheme(themeName, customHex, isOled) {
    state.theme = themeName;
    state.customColor = customHex || state.customColor;
    state.oledMode = isOled;

    localStorage.setItem("ajn_intercom_theme", themeName);
    localStorage.setItem("ajn_intercom_custom_color", state.customColor);
    localStorage.setItem("ajn_intercom_oled", isOled ? "true" : "false");

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

    el.themeChips.forEach((chip) => {
      chip.classList.toggle("active", chip.dataset.themeVal === themeName);
    });
  }

  function hexToRgba(hex, alpha) {
    const c = hex.replace("#", "");
    const r = parseInt(c.substring(0, 2), 16) || 0;
    const g = parseInt(c.substring(2, 4), 16) || 0;
    const b = parseInt(c.substring(4, 6), 16) || 0;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  // ------------------------------------------------------------------ Clock
  function startClock() {
    const update = () => {
      const now = new Date();
      const str = `${now.toLocaleDateString("en-GB")} ${now.toLocaleTimeString("en-GB")}`;
      if (el.osdClock) el.osdClock.textContent = str;
    };
    update();
    state.clockTimer = setInterval(update, 1000);
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

    el.btnSoundToggle.addEventListener("click", () => {
      state.soundEnabled = !state.soundEnabled;
      el.btnSoundToggle.style.opacity = state.soundEnabled ? "1" : "0.4";
    });

    // Image Modal Close
    el.modalCloseBtn.addEventListener("click", () => {
      el.imageModal.style.display = "none";
    });
    el.imageModal.addEventListener("click", (e) => {
      if (e.target === el.imageModal) el.imageModal.style.display = "none";
    });
  }

  function switchTab(tab) {
    state.activeTab = tab;
    el.navBtns.forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    el.viewPanels.forEach((p) => {
      p.classList.toggle("active", p.id === `view${capitalize(tab)}`);
    });

    if (tab === "visitors") {
      loadVisitors();
    } else if (tab === "settings") {
      loadSettings();
    }
  }

  function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  // ------------------------------------------------------------------ Status
  async function checkStatus() {
    try {
      const res = await fetch("api/status");
      const data = await res.json();
      state.configured = data.configured;
      state.brand = data.brand || "auto";

      if (!data.configured) {
        el.intercomBrandBadge.textContent = "Not Configured";
        el.intercomBrandBadge.className = "badge warning";
        el.intercomSubTitle.textContent = "Please configure Door Station IP in Settings";
        switchTab("settings");
        return;
      }

      state.door1Name = data.door_1_name || "Main Gate";
      state.door2Name = data.door_2_name || "Pedestrian Door";
      if (el.labelDoor1) el.labelDoor1.textContent = state.door1Name;
      if (el.labelDoor2) el.labelDoor2.textContent = state.door2Name;
      if (el.btnQuickUnlock) el.btnQuickUnlock.innerHTML = `🔓 Unlock ${state.door1Name}`;

      const brandTitle = data.brand === "hikvision" ? "Hikvision ISAPI" : "Dahua VTO";
      el.intercomBrandBadge.textContent = brandTitle;
      el.intercomBrandBadge.className = "badge success";

      const devName = data.device_info?.device_name || data.device_info?.model || "Door Station";
      el.intercomSubTitle.textContent = `${devName} · ${data.host || ""} · Online`;

      updateCallStatus(data.call_status);
    } catch (e) {
      el.intercomBrandBadge.textContent = "Offline";
      el.intercomBrandBadge.className = "badge danger";
    }
  }

  function updateCallStatus(status) {
    if (status === "ring") {
      triggerRingUI();
    } else if (status === "onCall") {
      el.callStatusBadge.textContent = "In Call";
      el.callStatusBadge.className = "badge warning";
      hideRingBanner();
    } else {
      el.callStatusBadge.textContent = "Standby";
      el.callStatusBadge.className = "badge neutral";
      hideRingBanner();
    }
  }

  // ------------------------------------------------------------------ Door Controls & Call Banner
  function setupDoorControls() {
    el.btnUnlockDoor1.addEventListener("click", () => triggerUnlock(1, el.btnUnlockDoor1));
    el.btnUnlockDoor2.addEventListener("click", () => triggerUnlock(2, el.btnUnlockDoor2));
    el.btnQuickUnlock.addEventListener("click", () => {
      triggerUnlock(1, el.btnQuickUnlock);
      hideRingBanner();
    });

    el.btnAnswerCall.addEventListener("click", () => {
      sendCallAction("answer");
      hideRingBanner();
    });

    el.btnDeclineCall.addEventListener("click", () => {
      sendCallAction("reject");
      hideRingBanner();
    });
  }

  async function triggerUnlock(doorId, btnElement) {
    if (btnElement) btnElement.classList.add("pulsing");
    el.doorLockBadge.textContent = "Unlocked";
    el.doorLockBadge.className = "badge danger";

    try {
      const res = await fetch("api/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ door: doorId }),
      });
      const data = await res.json();
      if (data.ok) {
        addActivityItem("unlock", `Unlocked ${data.name || `Door ${doorId}`}`);
      }
    } catch (e) {
      console.error("Unlock failed:", e);
    } finally {
      setTimeout(() => {
        if (btnElement) btnElement.classList.remove("pulsing");
        el.doorLockBadge.textContent = "Locked";
        el.doorLockBadge.className = "badge success";
      }, 3500);
    }
  }

  async function sendCallAction(action) {
    try {
      await fetch("api/call/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: action }),
      });
    } catch (e) {
      console.error("Call action error:", e);
    }
  }

  function triggerRingUI() {
    el.callBanner.classList.add("ringing");
    el.callStatusBadge.textContent = "Ringing!";
    el.callStatusBadge.className = "badge danger";
    playDoorbellChime();

    if (state.callTimeout) clearTimeout(state.callTimeout);
    state.callTimeout = setTimeout(() => {
      hideRingBanner();
    }, 30000);
  }

  function hideRingBanner() {
    el.callBanner.classList.remove("ringing");
    if (state.callTimeout) clearTimeout(state.callTimeout);
  }

  function addActivityItem(type, text) {
    const timeStr = new Date().toLocaleTimeString("en-GB");
    const div = document.createElement("div");
    div.className = `activity-item ${type}`;
    div.innerHTML = `
      <span>${text}</span>
      <span style="color:var(--text-muted); font-size:0.75rem;">${timeStr}</span>
    `;

    const empty = el.miniActivityList.querySelector(".empty-hint");
    if (empty) empty.remove();

    el.miniActivityList.prepend(div);
  }

  // ------------------------------------------------------------------ Server-Sent Events (SSE)
  function initEventStream() {
    if (state.eventSource) state.eventSource.close();

    try {
      state.eventSource = new EventSource("api/events");
      state.eventSource.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          handleLiveEvent(data);
        } catch (err) {
          // Heartbeat ping
        }
      };

      state.eventSource.onerror = () => {
        // Auto-reconnect managed by browser EventSource
      };
    } catch (err) {
      console.error("SSE connection failed:", err);
    }
  }

  function handleLiveEvent(ev) {
    if (ev.event === "ring") {
      triggerRingUI();
      addActivityItem("ring", "Doorbell button pressed");
      loadVisitors();
    } else if (ev.event === "door_unlocked") {
      el.doorLockBadge.textContent = "Unlocked";
      el.doorLockBadge.className = "badge danger";
      setTimeout(() => {
        el.doorLockBadge.textContent = "Locked";
        el.doorLockBadge.className = "badge success";
      }, 3500);
      addActivityItem("unlock", `Door Opened: ${ev.name || "Main Gate"}`);
    } else if (ev.event === "call_ended") {
      hideRingBanner();
      el.callStatusBadge.textContent = "Standby";
      el.callStatusBadge.className = "badge neutral";
    }
  }

  // ------------------------------------------------------------------ Visitor Gallery
  async function loadVisitors() {
    try {
      const res = await fetch("api/visitors");
      const list = await res.json();
      renderVisitors(list);
    } catch (e) {
      console.error("Failed to load visitors:", e);
    }
  }

  function renderVisitors(list) {
    if (!Array.isArray(list) || !list.length) {
      el.visitorsGrid.innerHTML = `
        <div class="empty-state">
          <p>No visitor snapshots recorded yet. When a visitor presses the doorbell, photos will appear here.</p>
        </div>`;
      return;
    }

    el.visitorsGrid.innerHTML = list
      .map((item) => {
        const d = new Date(item.timestamp);
        const dateStr = d.toLocaleDateString("en-GB");
        const timeStr = d.toLocaleTimeString("en-GB");
        const imgSrc = item.snapshot ? `api/visitors/image/${item.snapshot}` : "api/snapshot";

        return `
        <div class="visitor-card" data-img="${imgSrc}" data-caption="${item.details || "Doorbell Ring"} (${dateStr} ${timeStr})">
          <div class="visitor-thumb">
            <img src="${imgSrc}" alt="Visitor Snapshot" loading="lazy">
          </div>
          <div class="visitor-meta">
            <div class="visitor-time">${timeStr} · ${dateStr}</div>
            <div class="visitor-type">${item.details || "Doorbell Chime Event"}</div>
          </div>
        </div>
      `;
      })
      .join("");

    el.visitorsGrid.querySelectorAll(".visitor-card").forEach((card) => {
      card.addEventListener("click", () => {
        el.modalImg.src = card.dataset.img;
        el.modalCaption.textContent = card.dataset.caption;
        el.imageModal.style.display = "flex";
      });
    });
  }

  // ------------------------------------------------------------------ Settings
  async function loadSettings() {
    try {
      const res = await fetch("api/config");
      const cfg = await res.json();
      if (el.cfgBrand) el.cfgBrand.value = cfg.brand || "auto";
      if (el.cfgHost) el.cfgHost.value = cfg.host || "";
      if (el.cfgHttpPort) el.cfgHttpPort.value = cfg.http_port || 80;
      if (el.cfgRtspPort) el.cfgRtspPort.value = cfg.rtsp_port || 554;
      if (el.cfgUsername) el.cfgUsername.value = cfg.username || "admin";
      if (el.cfgDoor1) el.cfgDoor1.value = cfg.door_1_name || "Main Gate";
      if (el.cfgDoor2) el.cfgDoor2.value = cfg.door_2_name || "Pedestrian Door";
    } catch (e) {
      console.error("Failed to load settings:", e);
    }
  }

  function setupSettings() {
    el.themeChips.forEach((chip) => {
      chip.addEventListener("click", () => {
        applyTheme(chip.dataset.themeVal, state.customColor, state.oledMode);
      });
    });

    el.settingsCustomColor.addEventListener("input", (e) => {
      applyTheme("custom", e.target.value, state.oledMode);
    });

    el.settingsOledToggle.addEventListener("change", (e) => {
      applyTheme(state.theme, state.customColor, e.target.value === "true");
    });

    el.settingsForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const payload = {
        brand: el.cfgBrand.value,
        host: el.cfgHost.value.trim(),
        http_port: parseInt(el.cfgHttpPort.value, 10),
        rtsp_port: parseInt(el.cfgRtspPort.value, 10),
        username: el.cfgUsername.value.trim(),
        door_1_name: el.cfgDoor1.value.trim(),
        door_2_name: el.cfgDoor2.value.trim(),
      };
      if (el.cfgPassword.value) {
        payload.password = el.cfgPassword.value;
      }

      el.settingsFeedback.innerHTML = '<span style="color:var(--accent);">Saving & connecting...</span>';
      try {
        const res = await fetch("api/config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (data.ok) {
          el.settingsFeedback.innerHTML =
            '<span style="color:var(--success);">✓ Connected and saved successfully!</span>';
          await checkStatus();
          setTimeout(() => switchTab("live"), 1200);
        } else {
          el.settingsFeedback.innerHTML = `<span style="color:var(--danger);">${data.error || "Save failed"}</span>`;
        }
      } catch (err) {
        el.settingsFeedback.innerHTML = `<span style="color:var(--danger);">${err.message}</span>`;
      }
    });

    el.btnTestConn.addEventListener("click", async () => {
      el.settingsFeedback.innerHTML =
        '<span style="color:var(--accent);">Probing Door Station at ' + el.cfgHost.value + "...</span>";
      try {
        const res = await fetch("api/status");
        const d = await res.json();
        if (d.configured) {
          el.settingsFeedback.innerHTML = `<span style="color:var(--success);">✓ Door Station Online! Brand: ${d.brand}, Model: ${d.device_info?.model || "VTO"}</span>`;
        } else {
          el.settingsFeedback.innerHTML = `<span style="color:var(--warning);">Response: ${d.message || "Ready"}</span>`;
        }
      } catch (err) {
        el.settingsFeedback.innerHTML = `<span style="color:var(--danger);">Connection failed: ${err.message}</span>`;
      }
    });
  }

  // Start on load
  window.addEventListener("DOMContentLoaded", init);
})();
