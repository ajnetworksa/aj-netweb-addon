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
    selectedDurationHours: 4,
    activeModalPass: null,
    // Room-to-Room Intercom State
    selfId: localStorage.getItem("ajn_display_id") || "disp_" + Math.random().toString(36).substring(2, 9),
    selfRoom: localStorage.getItem("ajn_room_name") || "Kitchen",
    selfStatus: localStorage.getItem("ajn_room_status") || "available",
    activeCallId: null,
    activeCallPeer: null,
    activeLocalStream: null,
    callTimerInterval: null,
    callDurationSec: 0,
    isMicMuted: false,
    ringInterval: null,
  };
  localStorage.setItem("ajn_display_id", state.selfId);

  const el = {
    intercomBrandBadge: document.getElementById("intercomBrandBadge"),
    intercomSubTitle: document.getElementById("intercomSubTitle"),
    navBtns: document.querySelectorAll(".nav-btn"),
    viewPanels: document.querySelectorAll(".view-panel"),
    quickThemeSelect: document.getElementById("quickThemeSelect"),
    headerColorPicker: document.getElementById("headerColorPicker"),
    colorPickerWrapper: document.getElementById("colorPickerWrapper"),
    btnSoundToggle: document.getElementById("btnSoundToggle"),
    btnNotifyToggle: document.getElementById("btnNotifyToggle"),
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
    // Dynamic Push Notification Settings
    pushDevicesList: document.getElementById("pushDevicesList"),
    btnRefreshDevices: document.getElementById("btnRefreshDevices"),
    btnTestPushRing: document.getElementById("btnTestPushRing"),
    pushTestFeedback: document.getElementById("pushTestFeedback"),
    cfgPushMode: document.getElementById("cfgPushMode"),
    cfgCriticalSound: document.getElementById("cfgCriticalSound"),
    // Credentials & Terminal Guest Passes
    passForm: document.getElementById("passForm"),
    passGuestName: document.getElementById("passGuestName"),
    passDoorSelect: document.getElementById("passDoorSelect"),
    durationChips: document.querySelectorAll(".duration-chip"),
    passPinCode: document.getElementById("passPinCode"),
    passCardNo: document.getElementById("passCardNo"),
    btnRandomPin: document.getElementById("btnRandomPin"),
    btnRandomCard: document.getElementById("btnRandomCard"),
    btnIssuePass: document.getElementById("btnIssuePass"),
    passFeedback: document.getElementById("passFeedback"),
    passesList: document.getElementById("passesList"),
    btnRefreshPasses: document.getElementById("btnRefreshPasses"),
    // Pass Modal
    passBadgeModal: document.getElementById("passBadgeModal"),
    passModalCloseBtn: document.getElementById("passModalCloseBtn"),
    modalDoorName: document.getElementById("modalDoorName"),
    passQrContainer: document.getElementById("passQrContainer"),
    modalPinCode: document.getElementById("modalPinCode"),
    modalGuestName: document.getElementById("modalGuestName"),
    modalCardNo: document.getElementById("modalCardNo"),
    modalValidTo: document.getElementById("modalValidTo"),
    btnSharePass: document.getElementById("btnSharePass"),
    btnCopyPassText: document.getElementById("btnCopyPassText"),
    btnPrintPass: document.getElementById("btnPrintPass"),
    // Inter-Display Room Intercom
    selectSelfRoom: document.getElementById("selectSelfRoom"),
    selectSelfStatus: document.getElementById("selectSelfStatus"),
    selfRoomDisplayName: document.getElementById("selfRoomDisplayName"),
    selfStatusDot: document.getElementById("selfStatusDot"),
    selfIpAddress: document.getElementById("selfIpAddress"),
    broadcastInput: document.getElementById("broadcastInput"),
    btnSendBroadcast: document.getElementById("btnSendBroadcast"),
    broadcastFeedback: document.getElementById("broadcastFeedback"),
    displaysGrid: document.getElementById("displaysGrid"),
    btnRefreshDisplays: document.getElementById("btnRefreshDisplays"),
    // Intercom Calling Modal
    intercomCallModal: document.getElementById("intercomCallModal"),
    callAvatarIcon: document.getElementById("callAvatarIcon"),
    callPulseRing: document.getElementById("callPulseRing"),
    callStatusLabel: document.getElementById("callStatusLabel"),
    callPartyName: document.getElementById("callPartyName"),
    callDurationTimer: document.getElementById("callDurationTimer"),
    callWaveform: document.getElementById("callWaveform"),
    callIncomingActions: document.getElementById("callIncomingActions"),
    callConnectedActions: document.getElementById("callConnectedActions"),
    btnAcceptCall: document.getElementById("btnAcceptCall"),
    btnDeclineCall: document.getElementById("btnDeclineCall"),
    btnMuteMic: document.getElementById("btnMuteMic"),
    muteMicIcon: document.getElementById("muteMicIcon"),
    muteMicText: document.getElementById("muteMicText"),
    btnQuickUnlockInCall: document.getElementById("btnQuickUnlockInCall"),
    btnHangupCall: document.getElementById("btnHangupCall"),
    // Villa Broadcast Banner
    broadcastBanner: document.getElementById("broadcastBanner"),
    broadcastSenderName: document.getElementById("broadcastSenderName"),
    broadcastMessageText: document.getElementById("broadcastMessageText"),
    btnDismissBroadcast: document.getElementById("btnDismissBroadcast"),
  };

  // ------------------------------------------------------------------ Browser Push Notifications
  function setupBrowserNotifications() {
    if (!("Notification" in window)) {
      if (el.btnNotifyToggle) el.btnNotifyToggle.style.display = "none";
      return;
    }

    updateNotifyBtnState();

    if (el.btnNotifyToggle) {
      el.btnNotifyToggle.addEventListener("click", async () => {
        if (Notification.permission === "granted") {
          new Notification("🔔 AJ Netweb Intercom", {
            body: "Browser chime notifications are active on this device!",
            icon: "data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🔔</text></svg>",
          });
        } else if (Notification.permission !== "denied") {
          const perm = await Notification.requestPermission();
          updateNotifyBtnState();
          if (perm === "granted") {
            new Notification("🔔 AJ Netweb Intercom", {
              body: "Doorbell chime alerts enabled on this device!",
              icon: "data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🔔</text></svg>",
            });
          }
        } else {
          alert("Notifications are blocked in your browser settings. Please enable notifications for this site to receive doorbell alerts.");
        }
      });
    }
  }

  function updateNotifyBtnState() {
    if (!el.btnNotifyToggle || !("Notification" in window)) return;
    const isGranted = Notification.permission === "granted";
    el.btnNotifyToggle.classList.toggle("active", isGranted);
    el.btnNotifyToggle.title = isGranted
      ? "Browser Notifications Active (Click to test)"
      : "Click to Enable Browser Doorbell Notifications";
  }

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
    setupCredentialsUI();
    setupBrowserNotifications();
    setupRoomIntercom();
    startClock();

    await checkStatus();
    await loadVisitors();
    loadCredentials();
    loadDiscoveredDevices();
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
    const targetId = tab === "room-intercom" ? "viewRoomIntercom" : `view${capitalize(tab)}`;
    el.viewPanels.forEach((p) => {
      p.classList.toggle("active", p.id === targetId);
    });

    if (tab === "visitors") {
      loadVisitors();
    } else if (tab === "credentials") {
      loadCredentials();
    } else if (tab === "room-intercom") {
      loadDisplays();
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

      // Native Web Browser Notification (Desktop & Mobile PWA)
      if ("Notification" in window && Notification.permission === "granted") {
        try {
          const n = new Notification(`🔔 Doorbell Ringing - ${state.door1Name}`, {
            body: "Visitor at the entrance is calling! Click to view live or unlock.",
            icon: "data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🔔</text></svg>",
            image: ev.snapshot_url || "api/snapshot",
            tag: "ajnetweb-doorbell",
            requireInteraction: true,
          });
          n.onclick = () => {
            window.focus();
            switchTab("live");
            n.close();
          };
        } catch (err) {
          console.debug("Web notification display failed:", err);
        }
      }
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
    } else if (ev.event === "credential_updated") {
      loadCredentials();
    } else if (ev.event === "intercom_incoming_call") {
      handleIncomingRoomCall(ev);
    } else if (ev.event === "intercom_call_answered") {
      handleRoomCallAnswered(ev);
    } else if (ev.event === "intercom_call_ended") {
      handleRoomCallEnded(ev);
    } else if (ev.event === "intercom_ice_candidate") {
      handleIceCandidate(ev);
    } else if (ev.event === "intercom_broadcast") {
      handleVillaBroadcast(ev);
    } else if (ev.event === "intercom_display_updated") {
      if (ev.displays) renderDisplays(ev.displays);
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

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // ------------------------------------------------------------------ QR Code & Credentials Engine
  function renderQrCodeSvg(text) {
    try {
      if (window.qrcode) {
        const qr = window.qrcode(0, "M");
        qr.addData(String(text));
        qr.make();
        return qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
      }
    } catch (err) {
      console.warn("QR render notice:", err);
    }
    return `<div style="padding:40px 10px; font-family:monospace; font-size:1.4rem; font-weight:bold; color:#000;">${text}</div>`;
  }

  function formatTimeWindow(validFrom, validTo) {
    if (!validTo) return "Never expires";
    try {
      const toDate = new Date(validTo);
      const now = new Date();
      const diffMs = toDate - now;
      if (diffMs <= 0) return "Expired";
      const diffHrs = Math.floor(diffMs / 3600000);
      const diffMins = Math.floor((diffMs % 3600000) / 60000);
      let remaining = "";
      if (diffHrs > 24) {
        remaining = `in ${Math.floor(diffHrs / 24)}d ${diffHrs % 24}h`;
      } else if (diffHrs > 0) {
        remaining = `in ${diffHrs}h ${diffMins}m`;
      } else {
        remaining = `in ${diffMins}m`;
      }
      return `Valid until ${toDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} (${remaining})`;
    } catch (e) {
      return validTo;
    }
  }

  async function loadCredentials() {
    if (!el.passesList) return;
    try {
      const res = await fetch("api/credentials");
      const data = await res.json();
      const list = data.credentials || [];

      if (!list.length) {
        el.passesList.innerHTML = `
          <div class="empty-state">
            <p>No active passes. Fill out the form above to generate a scannable QR &amp; PIN pass for your guests.</p>
          </div>
        `;
        return;
      }

      el.passesList.innerHTML = list.map((item) => {
        const isExpired = item.status === "expired" || (item.valid_to && new Date(item.valid_to) < new Date());
        const isRevoked = item.status === "revoked";
        let statusBadge = '<span class="badge success">Active</span>';
        if (isRevoked) {
          statusBadge = '<span class="badge danger">Revoked</span>';
        } else if (isExpired) {
          statusBadge = '<span class="badge neutral">Expired</span>';
        }

        const doorLabel = item.door_name || (item.door === 2 ? state.door2Name : state.door1Name);
        const syncBadge = item.synced_to_terminal
          ? '<span class="small" style="color:var(--success);">✓ Terminal Synced</span>'
          : '<span class="small" style="color:var(--warning);">Local Pass</span>';

        return `
          <div class="pass-card-item ${isExpired || isRevoked ? 'expired' : ''}">
            <div class="pass-card-top">
              <div>
                <div class="pass-guest-name">${escapeHtml(item.name)}</div>
                <div class="pass-door-pill">${escapeHtml(doorLabel)}</div>
              </div>
              <div>${statusBadge}</div>
            </div>

            <div class="pass-pin-badge">
              <span>PIN: #${item.pin}#</span>
              <span class="mono small" style="opacity:0.75;">QR: ${item.card_no}</span>
            </div>

            <div class="pass-validity-meta">
              <div>${formatTimeWindow(item.valid_from, item.valid_to)}</div>
              <div>${syncBadge}</div>
            </div>

            <div class="pass-btn-row">
              <button class="secondary-btn btn-view-pass" data-id="${item.id}" style="flex:1; padding:6px 10px; font-size:0.78rem;">
                👁️ View QR Pass
              </button>
              ${!isRevoked && !isExpired ? `
                <button class="secondary-btn btn-revoke-pass" data-id="${item.id}" data-emp="${item.employee_no}" style="padding:6px 10px; font-size:0.78rem; color:var(--danger); border-color:rgba(255,0,85,0.4);">
                  🗑️ Revoke
                </button>
              ` : ''}
            </div>
          </div>
        `;
      }).join("");

      // Bind card buttons
      el.passesList.querySelectorAll(".btn-view-pass").forEach((btn) => {
        btn.addEventListener("click", () => {
          const pass = list.find((p) => p.id === btn.dataset.id);
          if (pass) openPassModal(pass);
        });
      });

      el.passesList.querySelectorAll(".btn-revoke-pass").forEach((btn) => {
        btn.addEventListener("click", async () => {
          if (!confirm("Are you sure you want to revoke and delete this credential from the terminal immediately?")) return;
          try {
            await fetch("api/credentials/revoke", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: btn.dataset.id, employee_no: btn.dataset.emp }),
            });
            loadCredentials();
          } catch (e) {
            alert("Revoke failed: " + e.message);
          }
        });
      });

    } catch (err) {
      console.error("Failed to load credentials:", err);
    }
  }

  function openPassModal(pass) {
    state.activeModalPass = pass;
    const doorName = pass.door_name || (pass.door === 2 ? state.door2Name : state.door1Name);
    if (el.modalDoorName) el.modalDoorName.textContent = doorName;
    if (el.modalGuestName) el.modalGuestName.textContent = pass.name;
    if (el.modalPinCode) el.modalPinCode.textContent = `#${pass.pin}#`;
    if (el.modalCardNo) el.modalCardNo.textContent = pass.card_no;
    if (el.modalValidTo) {
      el.modalValidTo.textContent = new Date(pass.valid_to).toLocaleString();
    }
    if (el.passQrContainer) {
      el.passQrContainer.innerHTML = renderQrCodeSvg(pass.qr_token || pass.card_no);
    }
    if (el.passBadgeModal) {
      el.passBadgeModal.style.display = "flex";
    }
  }

  function closePassModal() {
    if (el.passBadgeModal) {
      el.passBadgeModal.style.display = "none";
    }
  }

  function setupCredentialsUI() {
    // Duration chip clicks
    if (el.durationChips) {
      el.durationChips.forEach((chip) => {
        chip.addEventListener("click", () => {
          el.durationChips.forEach((c) => c.classList.remove("active"));
          chip.classList.add("active");
          state.selectedDurationHours = parseFloat(chip.dataset.hours || 4);
        });
      });
    }

    // Randomize buttons
    if (el.btnRandomPin) {
      el.btnRandomPin.addEventListener("click", () => {
        if (el.passPinCode) {
          el.passPinCode.value = String(Math.floor(100000 + Math.random() * 900000));
        }
      });
    }

    if (el.btnRandomCard) {
      el.btnRandomCard.addEventListener("click", () => {
        if (el.passCardNo) {
          el.passCardNo.value = "88" + String(Math.floor(100000 + Math.random() * 900000));
        }
      });
    }

    // Form submit
    if (el.passForm) {
      el.passForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const name = (el.passGuestName.value || "").trim();
        if (!name) return;

        const door = parseInt(el.passDoorSelect.value || 1);
        const pin = (el.passPinCode.value || "").trim();
        const cardNo = (el.passCardNo.value || "").trim();

        el.btnIssuePass.disabled = true;
        el.passFeedback.innerHTML = '<span style="color:var(--accent);">Pushing credentials to terminal...</span>';

        try {
          const res = await fetch("api/credentials/create", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name,
              door,
              duration_hours: state.selectedDurationHours,
              pin,
              card_no: cardNo,
            }),
          });
          const data = await res.json();
          if (data.ok && data.credential) {
            el.passFeedback.innerHTML = '<span style="color:var(--success);">✓ Pass issued successfully!</span>';
            el.passForm.reset();
            if (el.durationChips && el.durationChips[0]) el.durationChips[0].classList.add("active");
            state.selectedDurationHours = 4;
            loadCredentials();
            openPassModal(data.credential);
          } else {
            el.passFeedback.innerHTML = `<span style="color:var(--danger);">${data.error || "Failed to issue pass"}</span>`;
          }
        } catch (err) {
          el.passFeedback.innerHTML = `<span style="color:var(--danger);">${err.message}</span>`;
        } finally {
          el.btnIssuePass.disabled = false;
        }
      });
    }

    // Modal close
    if (el.passModalCloseBtn) {
      el.passModalCloseBtn.addEventListener("click", closePassModal);
    }
    if (el.passBadgeModal) {
      el.passBadgeModal.addEventListener("click", (e) => {
        if (e.target === el.passBadgeModal) closePassModal();
      });
    }

    // Refresh button
    if (el.btnRefreshPasses) {
      el.btnRefreshPasses.addEventListener("click", loadCredentials);
    }

    // Share Pass Actions
    if (el.btnSharePass) {
      el.btnSharePass.addEventListener("click", async () => {
        const p = state.activeModalPass;
        if (!p) return;
        const msg = `⚡ Welcome! Here is your entry pass for ${p.door_name || 'Entrance Gate'}:\n\n🔑 Keypad PIN: #${p.pin}#\n📱 Scannable QR: ${p.card_no}\n⏰ Valid until: ${new Date(p.valid_to).toLocaleString()}\n\nType the PIN code on the keypad or show the QR code to the terminal camera to unlock.`;
        if (navigator.share) {
          try {
            await navigator.share({ title: "Guest Access Pass", text: msg });
          } catch (e) {}
        } else {
          window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`, "_blank");
        }
      });
    }

    if (el.btnCopyPassText) {
      el.btnCopyPassText.addEventListener("click", () => {
        const p = state.activeModalPass;
        if (!p) return;
        const msg = `Entrance Gate Access: PIN #${p.pin}# (Valid until ${new Date(p.valid_to).toLocaleString()})`;
        navigator.clipboard.writeText(msg).then(() => {
          alert("✓ Pass details copied to clipboard!");
        });
      });
    }

    if (el.btnPrintPass) {
      el.btnPrintPass.addEventListener("click", () => {
        window.print();
      });
    }
  }

  // ------------------------------------------------------------------ Dynamic Push Device Discovery
  async function loadDiscoveredDevices() {
    if (!el.pushDevicesList) return;
    el.pushDevicesList.innerHTML = '<span class="device-chip-loading">Scanning Home Assistant Companion App services...</span>';
    try {
      const res = await fetch("api/notifications/devices");
      const data = await res.json();

      if (el.cfgPushMode && data.mode) el.cfgPushMode.value = data.mode;
      if (el.cfgCriticalSound && data.critical_sound !== undefined) {
        el.cfgCriticalSound.value = data.critical_sound ? "true" : "false";
      }

      if (!data.devices || !data.devices.length) {
        el.pushDevicesList.innerHTML =
          '<span class="device-chip-empty">No companion app devices detected. Open Home Assistant app on your iOS or Android phone to register.</span>';
        return;
      }

      el.pushDevicesList.innerHTML = data.devices
        .map((d) => {
          const cleanName = d.replace(/^mobile_app_/, "").replace(/_/g, " ").toUpperCase();
          return `
            <div class="device-chip" title="Active HA Notify Service: notify.${d}">
              <span class="device-chip-dot"></span>
              <span>📱 ${cleanName}</span>
            </div>
          `;
        })
        .join("");
    } catch (err) {
      el.pushDevicesList.innerHTML = `<span class="device-chip-empty" style="color:var(--danger);">Scan failed: ${err.message}</span>`;
    }
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
      if (el.cfgPushMode && cfg.push_notify_mode) el.cfgPushMode.value = cfg.push_notify_mode;
      if (el.cfgCriticalSound && cfg.critical_push_sound !== undefined) {
        el.cfgCriticalSound.value = cfg.critical_push_sound ? "true" : "false";
      }
      loadDiscoveredDevices();
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

    if (el.btnRefreshDevices) {
      el.btnRefreshDevices.addEventListener("click", () => {
        loadDiscoveredDevices();
      });
    }

    if (el.btnTestPushRing) {
      el.btnTestPushRing.addEventListener("click", async () => {
        if (el.pushTestFeedback) {
          el.pushTestFeedback.innerHTML = '<span style="color:var(--accent);">Dispatching test ring &amp; snapshot...</span>';
        }
        try {
          const res = await fetch("api/notifications/test", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ door: 1 }),
          });
          const d = await res.json();
          if (d.ok) {
            if (el.pushTestFeedback) {
              el.pushTestFeedback.innerHTML = `<span style="color:var(--success);">✓ ${d.message || "Test ring sent!"}</span>`;
            }
          } else {
            if (el.pushTestFeedback) {
              el.pushTestFeedback.innerHTML = `<span style="color:var(--danger);">${d.error || "Failed"}</span>`;
            }
          }
        } catch (err) {
          if (el.pushTestFeedback) {
            el.pushTestFeedback.innerHTML = `<span style="color:var(--danger);">${err.message}</span>`;
          }
        }
      });
    }

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
        push_notify_mode: el.cfgPushMode ? el.cfgPushMode.value : "all_mobile_devices",
        critical_push_sound: el.cfgCriticalSound ? el.cfgCriticalSound.value === "true" : true,
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

  // ------------------------------------------------------------------ Inter-Display Room Calling & Broadcast System
  function playTelephoneRing() {
    if (!state.soundEnabled) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = "sine";
      osc2.type = "sine";
      osc1.frequency.setValueAtTime(440, ctx.currentTime);
      osc2.frequency.setValueAtTime(480, ctx.currentTime);

      gain.gain.setValueAtTime(0.001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(ctx.currentTime);
      osc2.start(ctx.currentTime);
      osc1.stop(ctx.currentTime + 1.3);
      osc2.stop(ctx.currentTime + 1.3);
    } catch (e) {
      console.warn("Ring sound failed:", e);
    }
  }

  function playAttentionChime() {
    if (!state.soundEnabled) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const freqs = [523.25, 659.25, 783.99]; // C5, E5, G5 chord
      freqs.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.16);

        gain.gain.setValueAtTime(0.001, ctx.currentTime + idx * 0.16);
        gain.gain.exponentialRampToValueAtTime(0.28, ctx.currentTime + idx * 0.16 + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.16 + 0.55);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + idx * 0.16);
        osc.stop(ctx.currentTime + idx * 0.16 + 0.6);
      });
    } catch (e) {
      console.warn("Attention chime failed:", e);
    }
  }

  function setupRoomIntercom() {
    if (el.selectSelfRoom) {
      el.selectSelfRoom.value = state.selfRoom;
      el.selectSelfRoom.addEventListener("change", (e) => {
        state.selfRoom = e.target.value;
        localStorage.setItem("ajn_room_name", state.selfRoom);
        if (el.selfRoomDisplayName) el.selfRoomDisplayName.textContent = state.selfRoom + " Display";
        registerSelfDisplay();
      });
    }

    if (el.selectSelfStatus) {
      el.selectSelfStatus.value = state.selfStatus;
      el.selectSelfStatus.addEventListener("change", (e) => {
        state.selfStatus = e.target.value;
        localStorage.setItem("ajn_room_status", state.selfStatus);
        updateSelfStatusDot();
        registerSelfDisplay();
      });
    }

    if (el.selfRoomDisplayName) el.selfRoomDisplayName.textContent = state.selfRoom + " Display";
    updateSelfStatusDot();

    registerSelfDisplay();
    setInterval(registerSelfDisplay, 25000);

    if (el.btnRefreshDisplays) {
      el.btnRefreshDisplays.addEventListener("click", loadDisplays);
    }

    // Presets for All-Call Broadcast
    document.querySelectorAll(".preset-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        if (el.broadcastInput) el.broadcastInput.value = chip.dataset.msg || chip.textContent;
      });
    });

    if (el.btnSendBroadcast) {
      el.btnSendBroadcast.addEventListener("click", () => {
        const msg = (el.broadcastInput?.value || "").trim();
        if (!msg) return;
        sendVillaBroadcast(msg);
      });
    }

    // Modal Action Handlers
    if (el.btnAcceptCall) el.btnAcceptCall.addEventListener("click", acceptIncomingCall);
    if (el.btnDeclineCall) el.btnDeclineCall.addEventListener("click", declineIncomingCall);
    if (el.btnHangupCall) el.btnHangupCall.addEventListener("click", hangupCall);

    if (el.btnMuteMic) {
      el.btnMuteMic.addEventListener("click", () => {
        state.isMicMuted = !state.isMicMuted;
        if (state.activeLocalStream) {
          state.activeLocalStream.getAudioTracks().forEach((t) => (t.enabled = !state.isMicMuted));
        }
        if (el.muteMicIcon) el.muteMicIcon.textContent = state.isMicMuted ? "🔇" : "🎙️";
        if (el.muteMicText) el.muteMicText.textContent = state.isMicMuted ? "Unmute" : "Mute";
      });
    }

    if (el.btnQuickUnlockInCall) {
      el.btnQuickUnlockInCall.addEventListener("click", () => {
        triggerUnlock(1, el.btnQuickUnlockInCall);
      });
    }

    if (el.btnDismissBroadcast) {
      el.btnDismissBroadcast.addEventListener("click", () => {
        if (el.broadcastBanner) el.broadcastBanner.style.display = "none";
      });
    }

    // Hardware Station Dials
    document.querySelectorAll(".btn-ring-hw").forEach((btn) => {
      btn.addEventListener("click", () => {
        dialHardwareStation(btn.dataset.unit || "101");
      });
    });

    loadDisplays();
  }

  function updateSelfStatusDot() {
    if (!el.selfStatusDot) return;
    el.selfStatusDot.className = "pulse-dot " + (state.selfStatus === "available" ? "green" : state.selfStatus === "dnd" ? "red" : "amber");
  }

  async function registerSelfDisplay() {
    try {
      const res = await fetch("api/intercom/displays/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_id: state.selfId,
          room_name: state.selfRoom,
          device_type: "tablet",
          status: state.selfStatus,
        }),
      });
      const data = await res.json();
      if (data.ok && data.display && el.selfIpAddress) {
        el.selfIpAddress.textContent = data.display.ip || "127.0.0.1";
      }
    } catch (e) {
      console.debug("Display registration heartbeat error:", e);
    }
  }

  async function loadDisplays() {
    if (!el.displaysGrid) return;
    try {
      const res = await fetch("api/intercom/displays");
      const data = await res.json();
      if (data.ok && Array.isArray(data.displays)) {
        renderDisplays(data.displays);
      }
    } catch (e) {
      console.error("Failed to load displays:", e);
    }
  }

  function getRoomAvatar(roomName) {
    const r = (roomName || "").toLowerCase();
    if (r.includes("kitchen")) return "🍳";
    if (r.includes("bedroom") || r.includes("suite")) return "🛏️";
    if (r.includes("majlis")) return "🏛️";
    if (r.includes("living") || r.includes("salon")) return "🛋️";
    if (r.includes("dining")) return "🍽️";
    if (r.includes("kids") || r.includes("child") || r.includes("nursery")) return "🧸";
    if (r.includes("office") || r.includes("study")) return "💼";
    if (r.includes("garden") || r.includes("patio") || r.includes("terrace")) return "🌲";
    if (r.includes("gym") || r.includes("pool")) return "🏋️";
    if (r.includes("gate") || r.includes("door")) return "🚪";
    return "📱";
  }

  function renderDisplays(displays) {
    if (!el.displaysGrid) return;
    el.displaysGrid.innerHTML = "";

    let list = displays.filter((d) => d && d.id);
    if (list.length <= 1) {
      const defaults = [
        { id: "demo_majlis", name: "Majlis Display", status: "available", device_type: "wall_tablet", isDemo: true },
        { id: "demo_master", name: "Master Bedroom", status: "available", device_type: "wall_tablet", isDemo: true },
        { id: "demo_garden", name: "Garden Pavilion", status: "dnd", device_type: "tablet", isDemo: true },
        { id: "demo_kids", name: "Kids Playroom", status: "available", device_type: "tablet", isDemo: true },
      ];
      defaults.forEach((def) => {
        if (!list.some((x) => x.name === def.name)) list.push(def);
      });
    }

    list.forEach((d) => {
      const isSelf = d.id === state.selfId;
      const card = document.createElement("div");
      card.className = `room-display-card ${isSelf ? "self-room" : ""}`;

      const avatar = getRoomAvatar(d.name);
      const statusClass = d.status === "available" ? "status-available" : d.status === "busy" ? "status-busy" : "status-dnd";
      const statusText = d.status === "available" ? "Available" : d.status === "busy" ? "In Call" : "DND";

      card.innerHTML = `
        <div class="room-card-head">
          <div class="room-avatar-badge">
            <div class="room-icon-box">${avatar}</div>
            <div class="room-title-block">
              <b>${d.name} ${isSelf ? "<small style='color:var(--accent); font-weight:normal;'>(This Screen)</small>" : ""}</b>
              <span>${d.device_type || "Wall Display"} &bull; ${d.ip || "LAN"}</span>
            </div>
          </div>
          <span class="room-status-badge ${statusClass}">${statusText}</span>
        </div>
        <div class="room-card-actions">
          ${isSelf
            ? `<button type="button" class="btn-room-page" style="flex:1;" disabled>📍 Local Screen</button>`
            : `<button type="button" class="btn-room-call" data-id="${d.id}" data-name="${d.name}">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                Call Room
              </button>
              <button type="button" class="btn-room-page" data-name="${d.name}" title="Send Quick Page">📢 Page</button>`
          }
        </div>
      `;

      if (!isSelf) {
        card.querySelector(".btn-room-call")?.addEventListener("click", () => {
          initiateRoomCall(d.id, d.name);
        });
        card.querySelector(".btn-room-page")?.addEventListener("click", () => {
          sendVillaBroadcast(`Paging ${d.name}: Please respond on intercom.`);
        });
      }

      el.displaysGrid.appendChild(card);
    });
  }

  // --- Calling Flow (WebRTC / SSE Mesh) ---
  async function initiateRoomCall(targetId, targetName) {
    state.activeCallId = `call_${Date.now()}`;
    state.callDurationSec = 0;

    if (el.intercomCallModal) el.intercomCallModal.style.display = "flex";
    if (el.callAvatarIcon) el.callAvatarIcon.textContent = getRoomAvatar(targetName);
    if (el.callStatusLabel) el.callStatusLabel.textContent = "Calling Room...";
    if (el.callPartyName) el.callPartyName.textContent = targetName;
    if (el.callIncomingActions) el.callIncomingActions.style.display = "none";
    if (el.callConnectedActions) el.callConnectedActions.style.display = "flex";
    if (el.callWaveform) el.callWaveform.style.display = "none";
    if (el.callDurationTimer) el.callDurationTimer.style.display = "none";

    playTelephoneRing();
    if (state.ringInterval) clearInterval(state.ringInterval);
    state.ringInterval = setInterval(playTelephoneRing, 3500);

    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        state.activeLocalStream = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => null);
      }
    } catch (e) {
      console.debug("Mic access bypassed:", e);
    }

    try {
      await fetch("api/intercom/call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          call_id: state.activeCallId,
          from_id: state.selfId,
          from_name: state.selfRoom,
          to_id: targetId,
          to_name: targetName,
          call_type: "audio",
        }),
      });
    } catch (err) {
      console.error("Call dispatch failed:", err);
    }
  }

  function handleIncomingRoomCall(callData) {
    const targeted = (callData.to_id && callData.to_id === state.selfId) ||
                     (callData.to_name && callData.to_name.toLowerCase() === state.selfRoom.toLowerCase());
    if (!targeted) return;

    if (state.selfStatus === "dnd") return;

    state.activeCallId = callData.call_id;
    state.callDurationSec = 0;

    if (el.intercomCallModal) el.intercomCallModal.style.display = "flex";
    if (el.callAvatarIcon) el.callAvatarIcon.textContent = getRoomAvatar(callData.from_name);
    if (el.callStatusLabel) el.callStatusLabel.textContent = "Incoming Call From";
    if (el.callPartyName) el.callPartyName.textContent = callData.from_name || "Villa Room";
    if (el.callIncomingActions) el.callIncomingActions.style.display = "flex";
    if (el.callConnectedActions) el.callConnectedActions.style.display = "none";
    if (el.callWaveform) el.callWaveform.style.display = "none";
    if (el.callDurationTimer) el.callDurationTimer.style.display = "none";

    playTelephoneRing();
    if (state.ringInterval) clearInterval(state.ringInterval);
    state.ringInterval = setInterval(playTelephoneRing, 3000);

    if (state.selfStatus === "auto_answer") {
      setTimeout(acceptIncomingCall, 800);
    }
  }

  async function acceptIncomingCall() {
    if (state.ringInterval) clearInterval(state.ringInterval);

    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        state.activeLocalStream = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => null);
      }
    } catch (e) {}

    try {
      await fetch("api/intercom/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          call_id: state.activeCallId,
          from_id: state.selfId,
        }),
      });
    } catch (e) {}

    startActiveCallTimer();
  }

  function declineIncomingCall() {
    if (state.ringInterval) clearInterval(state.ringInterval);
    hangupCall();
  }

  function handleRoomCallAnswered(callData) {
    if (callData.call_id !== state.activeCallId) return;
    if (state.ringInterval) clearInterval(state.ringInterval);
    startActiveCallTimer();
  }

  function startActiveCallTimer() {
    if (el.callStatusLabel) el.callStatusLabel.textContent = "Call Connected • 2-Way Audio";
    if (el.callIncomingActions) el.callIncomingActions.style.display = "none";
    if (el.callConnectedActions) el.callConnectedActions.style.display = "flex";
    if (el.callWaveform) el.callWaveform.style.display = "flex";
    if (el.callDurationTimer) {
      el.callDurationTimer.style.display = "block";
      el.callDurationTimer.textContent = "00:00";
    }

    if (state.callTimerInterval) clearInterval(state.callTimerInterval);
    state.callTimerInterval = setInterval(() => {
      state.callDurationSec++;
      const m = Math.floor(state.callDurationSec / 60).toString().padStart(2, "0");
      const s = (state.callDurationSec % 60).toString().padStart(2, "0");
      if (el.callDurationTimer) el.callDurationTimer.textContent = `${m}:${s}`;
    }, 1000);
  }

  function handleRoomCallEnded(callData) {
    if (state.activeCallId && callData.call_id === state.activeCallId) {
      terminateCallLocal();
    }
  }

  function handleIceCandidate(ev) {}

  async function hangupCall() {
    const cid = state.activeCallId;
    terminateCallLocal();
    if (cid) {
      try {
        await fetch("api/intercom/hangup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ call_id: cid, reason: "user_hangup" }),
        });
      } catch (e) {}
    }
  }

  function terminateCallLocal() {
    if (state.ringInterval) clearInterval(state.ringInterval);
    if (state.callTimerInterval) clearInterval(state.callTimerInterval);
    if (state.activeLocalStream) {
      state.activeLocalStream.getTracks().forEach((t) => t.stop());
      state.activeLocalStream = null;
    }
    state.activeCallId = null;
    state.callDurationSec = 0;
    if (el.intercomCallModal) el.intercomCallModal.style.display = "none";
  }

  // --- Villa All-Call Broadcast System ---
  async function sendVillaBroadcast(message) {
    if (el.btnSendBroadcast) el.btnSendBroadcast.classList.add("pulsing");
    if (el.broadcastFeedback) {
      el.broadcastFeedback.innerHTML = '<span style="color:var(--accent);">Transmitting Villa Broadcast...</span>';
    }

    try {
      const res = await fetch("api/intercom/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from_name: state.selfRoom,
          message: message,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        if (el.broadcastFeedback) {
          el.broadcastFeedback.innerHTML = '<span style="color:var(--success);">✓ Broadcast transmitted to all displays!</span>';
        }
        if (el.broadcastInput) el.broadcastInput.value = "";
      }
    } catch (err) {
      if (el.broadcastFeedback) {
        el.broadcastFeedback.innerHTML = `<span style="color:var(--danger);">${err.message}</span>`;
      }
    } finally {
      setTimeout(() => {
        if (el.btnSendBroadcast) el.btnSendBroadcast.classList.remove("pulsing");
        if (el.broadcastFeedback) el.broadcastFeedback.innerHTML = "";
      }, 3500);
    }
  }

  function handleVillaBroadcast(bData) {
    playAttentionChime();

    if (el.broadcastBanner) {
      if (el.broadcastSenderName) el.broadcastSenderName.textContent = `📢 All-Call from ${bData.from_name || "Intercom"}`;
      if (el.broadcastMessageText) el.broadcastMessageText.textContent = bData.message || "Attention all rooms!";
      el.broadcastBanner.style.display = "block";

      if ("speechSynthesis" in window && bData.message) {
        try {
          const utter = new SpeechSynthesisUtterance(bData.message);
          utter.rate = 1.0;
          utter.pitch = 1.0;
          window.speechSynthesis.speak(utter);
        } catch (e) {}
      }

      setTimeout(() => {
        if (el.broadcastBanner) el.broadcastBanner.style.display = "none";
      }, 9000);
    }
  }

  async function dialHardwareStation(unitNo) {
    try {
      const res = await fetch("api/intercom/hardware_call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: unitNo }),
      });
      const data = await res.json();
      alert(`Dialing physical indoor station ${unitNo}... Terminal response: ${data.ok ? "Ringing" : "Offline / Ready"}`);
    } catch (e) {
      alert(`Could not dial hardware station ${unitNo}: ${e.message}`);
    }
  }

  // Start on load
  window.addEventListener("DOMContentLoaded", init);
})();
