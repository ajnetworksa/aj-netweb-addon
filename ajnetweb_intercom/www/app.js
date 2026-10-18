/**
 * AJ Netweb Intercom & Door Station Studio - Frontend Controller
 * Real-Time Doorbell Chime, Electric Strike Relays, SSE Event Stream, and Visitor Gallery
 */

(function () {
  "use strict";

  /**
   * Safe fetch helper that guarantees graceful JSON parsing and never crashes on plain-text/HTML errors.
   */
  async function safeFetchJson(url, options = {}) {
    try {
      const res = await fetch(url, options);
      const text = await res.text();
      let data = null;
      try {
        data = text ? JSON.parse(text) : {};
      } catch (parseErr) {
        return {
          ok: false,
          status: res.status,
          error: `HTTP ${res.status}: ${text.slice(0, 150) || "Invalid server response"}`,
          data: null,
        };
      }
      if (!res.ok) {
        return {
          ok: false,
          status: res.status,
          error: (data && (data.error || data.message)) || `Server returned HTTP ${res.status}`,
          data,
        };
      }
      return { ok: true, status: res.status, data };
    } catch (netErr) {
      return {
        ok: false,
        status: 0,
        error: `Network error: ${netErr.message}`,
        data: null,
      };
    }
  }

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
    // Discovery State
    discoveredDevices: [],
    selectedDeviceIps: new Set(),
    batchAdopting: false,
    filterCategory: "all",
    searchQuery: "",
    selectedAdoptingDevice: null,
    // Multi-Device Stations
    doorStations: [],
    indoorStations: [],
    activeDoorStationId: null,
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
    // Live Feed & Two-Way Audio State
    streamMode: "fast", // "fast" (adaptive snapshot double-buffer) or "mjpeg"
    fastLiveTimer: null,
    isListening: false,
    isTalking: false,
    talkMediaStream: null,
    // Outdoor Card Enrollment State
    cardEnrollCountdown: null,
    cardEnrollSecondsLeft: 60,
    lastDetectedCard: null,
    // UI Mode (View / Kiosk Mode vs Editor Mode)
    isEditorMode: localStorage.getItem("ajn_intercom_mode") === "edit",
  };
  localStorage.setItem("ajn_display_id", state.selfId);

  const el = {
    intercomBrandBadge: document.getElementById("intercomBrandBadge"),
    intercomSubTitle: document.getElementById("intercomSubTitle"),
    navBtns: document.querySelectorAll(".nav-btn"),
    viewPanels: document.querySelectorAll(".view-panel"),
    btnModeToggle: document.getElementById("btnModeToggle"),
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
    // Live Station Switcher
    stationSwitcherBar: document.getElementById("stationSwitcherBar"),
    stationSwitcherPills: document.getElementById("stationSwitcherPills"),
    // SADP & ONVIF Discovery Elements
    btnRefreshScan: document.getElementById("btnRefreshScan"),
    btnQuickScan: document.getElementById("btnQuickScan"),
    btnSelectAllDiscover: document.getElementById("btnSelectAllDiscover"),
    btnBatchAdopt: document.getElementById("btnBatchAdopt"),
    batchCountNum: document.getElementById("batchCountNum"),
    discoverFilterPills: document.getElementById("discoverFilterPills"),
    discoverSearchInput: document.getElementById("discoverSearchInput"),
    discoverDeviceList: document.getElementById("discoverDeviceList"),
    badgeCountAll: document.getElementById("badgeCountAll"),
    badgeCountDoor: document.getElementById("badgeCountDoor"),
    badgeCountIndoor: document.getElementById("badgeCountIndoor"),
    badgeCountNvr: document.getElementById("badgeCountNvr"),
    badgeCountCam: document.getElementById("badgeCountCam"),
    // Adoption Modal Elements
    adoptModal: document.getElementById("adoptModal"),
    adoptModalTitle: document.getElementById("adoptModalTitle"),
    adoptSummary: document.getElementById("adoptSummary"),
    adoptUsername: document.getElementById("adoptUsername"),
    adoptPassword: document.getElementById("adoptPassword"),
    btnAdoptModalClose: document.getElementById("btnAdoptModalClose"),
    btnAdoptCancel: document.getElementById("btnAdoptCancel"),
    adoptForm: document.getElementById("adoptForm"),
    adoptFeedback: document.getElementById("adoptFeedback"),
    // Settings Managed Stations
    btnAddManualDoorStation: document.getElementById("btnAddManualDoorStation"),
    btnAddManualIndoorStation: document.getElementById("btnAddManualIndoorStation"),
    configuredDoorStationsList: document.getElementById("configuredDoorStationsList"),
    configuredIndoorStationsList: document.getElementById("configuredIndoorStationsList"),
    // Manual Station Modal
    manualStationModal: document.getElementById("manualStationModal"),
    manualStationModalTitle: document.getElementById("manualStationModalTitle"),
    manualStationModalBadge: document.getElementById("manualStationModalBadge"),
    btnManualStationModalClose: document.getElementById("btnManualStationModalClose"),
    manualStationForm: document.getElementById("manualStationForm"),
    manualStationCategory: document.getElementById("manualStationCategory"),
    manualStationId: document.getElementById("manualStationId"),
    manualStationName: document.getElementById("manualStationName"),
    manualStationHost: document.getElementById("manualStationHost"),
    manualStationBrand: document.getElementById("manualStationBrand"),
    manualStationRoomRow: document.getElementById("manualStationRoomRow"),
    manualStationRoom: document.getElementById("manualStationRoom"),
    manualStationModelRow: document.getElementById("manualStationModelRow"),
    manualStationModel: document.getElementById("manualStationModel"),
    manualStationHttpPort: document.getElementById("manualStationHttpPort"),
    manualStationRtspPort: document.getElementById("manualStationRtspPort"),
    manualStationUsername: document.getElementById("manualStationUsername"),
    manualStationPassword: document.getElementById("manualStationPassword"),
    manualStationDoorsRow: document.getElementById("manualStationDoorsRow"),
    manualStationDoor1: document.getElementById("manualStationDoor1"),
    manualStationDoor2: document.getElementById("manualStationDoor2"),
    btnManualStationCancel: document.getElementById("btnManualStationCancel"),
    manualStationFeedback: document.getElementById("manualStationFeedback"),
    // Video Header Stream Controls
    btnToggleStreamMode: document.getElementById("btnToggleStreamMode"),
    btnRefreshFeed: document.getElementById("btnRefreshFeed"),
    btnCopyRtsp: document.getElementById("btnCopyRtsp"),
    osdModeBadge: document.getElementById("osdModeBadge"),
    // Two-Way Audio & Live Action Bar
    btnLiveListen: document.getElementById("btnLiveListen"),
    liveListenText: document.getElementById("liveListenText"),
    btnLiveTalk: document.getElementById("btnLiveTalk"),
    liveTalkText: document.getElementById("liveTalkText"),
    btnCallIndoorTop: document.getElementById("btnCallIndoorTop"),
    btnPunchCardTop: document.getElementById("btnPunchCardTop"),
    // Pass Form & Hardware Card Enrollment
    btnPunchCardForForm: document.getElementById("btnPunchCardForForm"),
    btnStartCardEnroll: document.getElementById("btnStartCardEnroll"),
    btnEnrollFace: document.getElementById("btnEnrollFace"),
    btnEnrollFingerprint: document.getElementById("btnEnrollFingerprint"),
    hardwareReaderStatus: document.getElementById("hardwareReaderStatus"),
    // Outdoor Card Enrollment Modal
    cardEnrollModal: document.getElementById("cardEnrollModal"),
    btnCardEnrollClose: document.getElementById("btnCardEnrollClose"),
    enrollStatusTitle: document.getElementById("enrollStatusTitle"),
    enrollStatusDesc: document.getElementById("enrollStatusDesc"),
    enrollCountdownBar: document.getElementById("enrollCountdownBar"),
    enrollDetectedBox: document.getElementById("enrollDetectedBox"),
    detectedCardNo: document.getElementById("detectedCardNo"),
    btnUseDetectedCard: document.getElementById("btnUseDetectedCard"),
    btnStopEnroll: document.getElementById("btnStopEnroll"),
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
    applyUiMode(state.isEditorMode);
    setupDoorControls();
    setupDiscoveryUI();
    setupManagedStationsUI();
    setupSettings();
    setupCredentialsUI();
    setupBrowserNotifications();
    setupRoomIntercom();
    startClock();

    await loadConfiguredStations();
    await checkStatus();
    startFastLiveLoop();
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

  // ------------------------------------------------------------------ View vs Editor Mode Engine
  function applyUiMode(isEdit) {
    state.isEditorMode = isEdit;
    localStorage.setItem("ajn_intercom_mode", isEdit ? "edit" : "view");
    if (isEdit) {
      document.body.classList.remove("mode-view");
      document.body.classList.add("mode-edit");
      if (el.btnModeToggle) {
        el.btnModeToggle.innerHTML = `<span class="mode-icon">✏️</span><span class="mode-text">Editor Mode</span>`;
        el.btnModeToggle.title = "Currently in Editor Mode. Click to lock into View Mode (Kiosk/Operator)";
      }
    } else {
      document.body.classList.remove("mode-edit");
      document.body.classList.add("mode-view");
      if (el.btnModeToggle) {
        el.btnModeToggle.innerHTML = `<span class="mode-icon">🔒</span><span class="mode-text">View Mode</span>`;
        el.btnModeToggle.title = "Currently in View Mode. Click to enable Editor Mode (Admin)";
      }
      if (["credentials", "discover", "settings"].includes(state.activeTab)) {
        switchTab("live");
      }
    }
  }

  // ------------------------------------------------------------------ Navigation
  function setupNavigation() {
    el.navBtns.forEach((btn) => {
      btn.addEventListener("click", () => switchTab(btn.dataset.tab));
    });

    if (el.btnModeToggle) {
      el.btnModeToggle.addEventListener("click", () => {
        applyUiMode(!state.isEditorMode);
      });
    }

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
    if (!state.isEditorMode && ["credentials", "discover", "settings"].includes(tab)) {
      tab = "live";
    }
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
    } else if (tab === "discover") {
      if (!state.discoveredDevices.length) startDeviceDiscovery();
    } else if (tab === "settings") {
      loadSettings();
      loadConfiguredStations();
    }
  }

  function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  // ------------------------------------------------------------------ Status
  async function checkStatus() {
    try {
      const res = await safeFetchJson("api/status");
      const data = res.data || {};
      const hasDoorStations = Array.isArray(state.doorStations) && state.doorStations.length > 0;
      state.configured = Boolean(data.configured || hasDoorStations);
      state.brand = data.brand || "auto";

      if (!state.configured) {
        el.intercomBrandBadge.textContent = "Not Configured";
        el.intercomBrandBadge.className = "badge warning";
        el.intercomSubTitle.textContent = "Please configure Door Station in Settings or SADP Scanner";
        if (state.isEditorMode) {
          switchTab("settings");
        }
        return;
      }

      state.door1Name = data.door_1_name || "Main Gate";
      state.door2Name = data.door_2_name || "Pedestrian Door";
      if (el.labelDoor1) el.labelDoor1.textContent = state.door1Name;
      if (el.labelDoor2) el.labelDoor2.textContent = state.door2Name;
      if (el.btnQuickUnlock) el.btnQuickUnlock.innerHTML = `🔓 Unlock ${state.door1Name}`;

      const brandTitle = data.brand === "hikvision" ? "Hikvision ISAPI" : data.brand === "dahua" ? "Dahua VTO" : "Intercom Online";
      el.intercomBrandBadge.textContent = brandTitle;
      el.intercomBrandBadge.className = "badge success";

      const devName = data.device_info?.device_name || data.device_info?.model || (hasDoorStations ? state.doorStations[0].name : "Door Station");
      el.intercomSubTitle.textContent = `${devName} · ${data.host || (hasDoorStations ? state.doorStations[0].host : "")} · Online`;

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

    // Stream Header Controls
    if (el.btnToggleStreamMode) {
      el.btnToggleStreamMode.addEventListener("click", toggleStreamMode);
    }
    if (el.btnRefreshFeed) {
      el.btnRefreshFeed.addEventListener("click", refreshFeed);
    }
    if (el.btnCopyRtsp) {
      el.btnCopyRtsp.addEventListener("click", copyRtspUrl);
    }

    // Two-Way Audio & Live Intercom Action Bar
    if (el.btnLiveListen) {
      el.btnLiveListen.addEventListener("click", toggleLiveListen);
    }
    if (el.btnLiveTalk) {
      el.btnLiveTalk.addEventListener("click", toggleLiveTalk);
    }
    if (el.btnCallIndoorTop) {
      el.btnCallIndoorTop.addEventListener("click", () => dialHardwareStation(1));
    }
    if (el.btnPunchCardTop) {
      el.btnPunchCardTop.addEventListener("click", startCardEnrollment);
    }
  }

  // ------------------------------------------------------------------ Adaptive Fast Live Stream
  function startFastLiveLoop() {
    stopFastLiveLoop();
    if (state.streamMode !== "fast") return;

    let isFetching = false;
    const fetchNext = () => {
      if (state.streamMode !== "fast") return;
      if (isFetching) return;
      isFetching = true;

      const stationId = state.activeDoorStationId || "";
      const url = `api/snapshot?station_id=${encodeURIComponent(stationId)}&_t=${Date.now()}`;
      const img = new Image();
      img.onload = () => {
        isFetching = false;
        if (el.doorLiveImage && state.streamMode === "fast") {
          el.doorLiveImage.src = img.src;
        }
        if (state.streamMode === "fast") {
          state.fastLiveTimer = setTimeout(fetchNext, 350);
        }
      };
      img.onerror = () => {
        isFetching = false;
        if (state.streamMode === "fast") {
          state.fastLiveTimer = setTimeout(fetchNext, 1500);
        }
      };
      img.src = url;
    };

    fetchNext();
  }

  function stopFastLiveLoop() {
    if (state.fastLiveTimer) {
      clearTimeout(state.fastLiveTimer);
      state.fastLiveTimer = null;
    }
  }

  function toggleStreamMode() {
    if (state.streamMode === "fast") {
      state.streamMode = "mjpeg";
      stopFastLiveLoop();
      const stationId = state.activeDoorStationId || "";
      if (el.doorLiveImage) {
        el.doorLiveImage.src = `api/mjpeg?station_id=${encodeURIComponent(stationId)}&_t=${Date.now()}`;
      }
      if (el.btnToggleStreamMode) {
        el.btnToggleStreamMode.textContent = "🎥 MJPEG Stream";
        el.btnToggleStreamMode.classList.add("active");
      }
      if (el.osdModeBadge) el.osdModeBadge.textContent = "🎥 MJPEG";
    } else {
      state.streamMode = "fast";
      if (el.btnToggleStreamMode) {
        el.btnToggleStreamMode.textContent = "⚡ Fast Live";
        el.btnToggleStreamMode.classList.remove("active");
      }
      if (el.osdModeBadge) el.osdModeBadge.textContent = "⚡ LIVE";
      startFastLiveLoop();
    }
  }

  function refreshFeed() {
    if (el.btnRefreshFeed) el.btnRefreshFeed.classList.add("pulsing");
    const stationId = state.activeDoorStationId || "";
    if (state.streamMode === "fast") {
      startFastLiveLoop();
    } else if (el.doorLiveImage) {
      el.doorLiveImage.src = `api/mjpeg?station_id=${encodeURIComponent(stationId)}&_t=${Date.now()}`;
    }
    setTimeout(() => {
      if (el.btnRefreshFeed) el.btnRefreshFeed.classList.remove("pulsing");
    }, 1000);
  }

  function copyRtspUrl() {
    let rtspUrl = "";
    const active = state.doorStations.find((d) => d.id === state.activeDoorStationId) || state.doorStations[0];
    if (active) {
      const u = active.username || "admin";
      const p = active.password || "Aj@13579";
      const h = active.host || "192.168.8.2";
      const port = active.rtsp_port || 554;
      rtspUrl = `rtsp://${u}:${p}@${h}:${port}/Streaming/Channels/101`;
    } else {
      rtspUrl = "rtsp://admin:Aj@13579@192.168.8.2:554/Streaming/Channels/101";
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(rtspUrl).then(() => {
        if (el.btnCopyRtsp) {
          const orig = el.btnCopyRtsp.textContent;
          el.btnCopyRtsp.textContent = "Copied! ✓";
          setTimeout(() => (el.btnCopyRtsp.textContent = orig), 2000);
        }
      });
    } else {
      prompt("RTSP Video Stream URL:", rtspUrl);
    }
  }

  // ------------------------------------------------------------------ Built-in WebRTC Audio & Two-Way Talk (go2rtc Bridge)
  let webrtcAudioPeer = null;
  let audioOutputEl = null;

  async function startWebRtcAudio(enableMicrophone = false) {
    stopWebRtcAudio();

    if (!audioOutputEl) {
      audioOutputEl = document.createElement("audio");
      audioOutputEl.autoplay = true;
      audioOutputEl.playsInline = true;
      document.body.appendChild(audioOutputEl);
    }

    let iceServers = [
      { urls: ["stun:stun.l.google.com:19302", "stun:192.168.8.214:3478"] }
    ];
    try {
      const iceRes = await fetch("api/webrtc/ice");
      if (iceRes.ok) {
        const iceData = await iceRes.json();
        if (iceData && iceData.iceServers) iceServers = iceData.iceServers;
      }
    } catch (_) {}

    const pc = new RTCPeerConnection({ iceServers });
    webrtcAudioPeer = pc;

    // Receive audio from the door station
    pc.addTransceiver("audio", { direction: enableMicrophone ? "sendrecv" : "recvonly" });

    pc.ontrack = (ev) => {
      if (ev.track.kind === "audio" && audioOutputEl) {
        audioOutputEl.srcObject = new MediaStream([ev.track]);
        audioOutputEl.play().catch((err) => console.warn("Audio autoplay blocked by browser policy:", err));
      }
    };

    if (enableMicrophone) {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Microphone access is not supported by your browser or requires HTTPS.");
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      state.talkMediaStream = stream;
      const micTrack = stream.getAudioTracks()[0];
      if (micTrack) {
        pc.addTransceiver(micTrack, { direction: "sendonly" });
      }
    }

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    // Allow ICE candidates to populate (trickle ICE or batch)
    await new Promise((resolve) => {
      if (pc.iceGatheringState === "complete") {
        resolve();
      } else {
        const checkState = () => {
          if (pc.iceGatheringState === "complete") {
            pc.removeEventListener("icegatheringstatechange", checkState);
            resolve();
          }
        };
        pc.addEventListener("icegatheringstatechange", checkState);
        setTimeout(resolve, 800);
      }
    });

    const activeStation = state.doorStations.find((d) => d.id === state.activeDoorStationId);
    // The server registers the door station with go2rtc and returns the answer SDP
    const stationParam = activeStation ? `?station_id=${encodeURIComponent(activeStation.id)}` : "";

    const res = await fetch(`api/webrtc${stationParam}`, {
      method: "POST",
      headers: { "Content-Type": "application/sdp" },
      body: pc.localDescription.sdp,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`WebRTC negotiation error (${res.status}): ${errText}`);
    }

    const answerSdp = await res.text();
    await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
  }

  function stopWebRtcAudio() {
    if (state.talkMediaStream) {
      state.talkMediaStream.getTracks().forEach((t) => t.stop());
      state.talkMediaStream = null;
    }
    if (webrtcAudioPeer) {
      try { webrtcAudioPeer.close(); } catch (_) {}
      webrtcAudioPeer = null;
    }
    if (audioOutputEl) {
      audioOutputEl.srcObject = null;
    }
  }

  async function toggleLiveListen() {
    if (state.isListening) {
      stopWebRtcAudio();
      state.isListening = false;
      if (el.btnLiveListen) el.btnLiveListen.classList.remove("active");
      if (el.liveListenText) el.liveListenText.textContent = "Listen to Audio";
      addActivityItem("audio", "Audio monitoring stopped.");
    } else {
      try {
        if (el.liveListenText) el.liveListenText.textContent = "Connecting Audio...";
        await startWebRtcAudio(false);
        state.isListening = true;
        if (el.btnLiveListen) el.btnLiveListen.classList.add("active");
        if (el.liveListenText) el.liveListenText.textContent = "Listening Active (Mute)";
        addActivityItem("audio", "Audio monitoring connected: Streaming outdoor station microphone.");
      } catch (err) {
        console.error("Live listen failed:", err);
        state.isListening = false;
        if (el.btnLiveListen) el.btnLiveListen.classList.remove("active");
        if (el.liveListenText) el.liveListenText.textContent = "Listen to Audio";
        alert(`Could not start audio stream: ${err.message}`);
      }
    }
  }

  async function toggleLiveTalk() {
    if (state.isTalking) {
      stopWebRtcAudio();
      state.isTalking = false;
      if (el.btnLiveTalk) {
        el.btnLiveTalk.classList.remove("pulsing");
        el.btnLiveTalk.classList.remove("danger");
        el.btnLiveTalk.classList.add("primary");
      }
      if (el.liveTalkText) el.liveTalkText.textContent = "Talk to Door";
      addActivityItem("audio", "Two-Way Audio broadcast ended.");
    } else {
      try {
        if (el.liveTalkText) el.liveTalkText.textContent = "Connecting Mic...";
        await startWebRtcAudio(true);
        state.isTalking = true;
        if (el.btnLiveTalk) {
          el.btnLiveTalk.classList.add("pulsing");
          el.btnLiveTalk.classList.remove("primary");
          el.btnLiveTalk.classList.add("danger");
        }
        if (el.liveTalkText) el.liveTalkText.textContent = "Talking... (Click to Stop)";
        addActivityItem("audio", "Microphone active: Streaming voice backchannel to door station speaker.");
      } catch (err) {
        console.warn("Could not capture microphone:", err);
        state.isTalking = false;
        if (el.btnLiveTalk) {
          el.btnLiveTalk.classList.remove("pulsing");
          el.btnLiveTalk.classList.remove("danger");
          el.btnLiveTalk.classList.add("primary");
        }
        if (el.liveTalkText) el.liveTalkText.textContent = "Talk to Door";
        alert(`Could not start two-way talk: ${err.message}. Please check microphone permission.`);
      }
    }
  }

  async function triggerUnlock(doorId, btnElement) {
    if (btnElement) btnElement.classList.add("pulsing");
    el.doorLockBadge.textContent = "Unlocked";
    el.doorLockBadge.className = "badge danger";

    try {
      const res = await safeFetchJson("api/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          door: doorId,
          station_id: state.activeDoorStationId || undefined,
        }),
      });
      const data = res.data;
      if (res.ok && data && data.ok) {
        addActivityItem("unlock", `Unlocked ${data.name || `Door ${doorId}`} (${data.station || "Intercom"})`);
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
    } else if (ev.event === "card_swiped") {
      const cardNo = ev.card_no || ev.cardNumber || "";
      state.lastDetectedCard = cardNo;
      addActivityItem("card", `Card Swiped on Outdoor Station: ${cardNo}`);

      if (el.enrollDetectedBox && cardNo) {
        el.enrollDetectedBox.style.display = "block";
        if (el.detectedCardNo) el.detectedCardNo.textContent = cardNo;
        if (el.enrollStatusTitle) el.enrollStatusTitle.textContent = "🎉 Card Successfully Read!";
        if (el.enrollStatusDesc) el.enrollStatusDesc.textContent = `Card #${cardNo} detected by outdoor station! Click 'Use This Card' below to populate it into the guest pass form.`;
      }

      if (el.passCardNo) {
        el.passCardNo.value = cardNo;
      }
      if (state.soundEnabled) {
        playAttentionChime();
      }
    } else if (ev.event === "card_enroll_started") {
      if (el.hardwareReaderStatus) {
        el.hardwareReaderStatus.textContent = "Outdoor RFID Reader Learning Mode Active (60s)... Swipe Now!";
      }
    } else if (ev.event === "card_enroll_stopped") {
      if (el.hardwareReaderStatus) {
        el.hardwareReaderStatus.textContent = "Outdoor RFID Reader Ready • DS-KV8113 Mifare 13.56MHz Active";
      }
    } else if (ev.event === "incoming_call") {
      addActivityItem("ring", `Hardware Call to Indoor Monitor (${ev.target || "Indoor Unit"})`);
      if (el.callStatusBadge) {
        el.callStatusBadge.textContent = "Calling Indoor Unit";
        el.callStatusBadge.className = "badge warning";
        setTimeout(() => {
          el.callStatusBadge.textContent = "Standby";
          el.callStatusBadge.className = "badge neutral";
        }, 8000);
      }
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
      const res = await safeFetchJson("api/visitors");
      const list = res.ok && Array.isArray(res.data) ? res.data : [];
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
      const res = await safeFetchJson("api/credentials");
      const list = (res.ok && res.data && res.data.credentials) || [];

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
          const res = await safeFetchJson("api/credentials/create", {
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
          const data = res.data || {};
          if (res.ok && data.ok && data.credential) {
            el.passFeedback.innerHTML = '<span style="color:var(--success);">✓ Pass issued successfully!</span>';
            el.passForm.reset();
            if (el.durationChips && el.durationChips[0]) el.durationChips[0].classList.add("active");
            state.selectedDurationHours = 4;
            loadCredentials();
            openPassModal(data.credential);
          } else {
            el.passFeedback.innerHTML = `<span style="color:var(--danger);">${data.error || res.error || "Failed to issue pass"}</span>`;
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

    // Outdoor Reader Punch & Enrollment
    if (el.btnPunchCardForForm) {
      el.btnPunchCardForForm.addEventListener("click", startCardEnrollment);
    }
    if (el.btnStartCardEnroll) {
      el.btnStartCardEnroll.addEventListener("click", startCardEnrollment);
    }
    if (el.btnEnrollFace) {
      el.btnEnrollFace.addEventListener("click", () => {
        alert("👤 Face Recognition Enrollment:\n\nFor Hikvision MinMoe terminals (DS-K1T series), biometric face templates are captured in front of the terminal dual-lens camera.\n\nOn the villa door station DS-KV8113, RFID Mifare Card punching and Keypad PIN codes are natively supported.");
      });
    }
    if (el.btnEnrollFingerprint) {
      el.btnEnrollFingerprint.addEventListener("click", () => {
        alert("👆 Fingerprint Enrollment:\n\nFor biometric terminals equipped with a fingerprint sensor, place your finger 3 times on the sensor.\n\nOn the villa door station DS-KV8113, RFID Mifare Card punching and Keypad PIN codes are natively supported.");
      });
    }
    if (el.btnCardEnrollClose) {
      el.btnCardEnrollClose.addEventListener("click", () => stopCardEnrollment(true));
    }
    if (el.btnStopEnroll) {
      el.btnStopEnroll.addEventListener("click", () => stopCardEnrollment(true));
    }
    if (el.cardEnrollModal) {
      el.cardEnrollModal.addEventListener("click", (e) => {
        if (e.target === el.cardEnrollModal) stopCardEnrollment(true);
      });
    }
    if (el.btnUseDetectedCard) {
      el.btnUseDetectedCard.addEventListener("click", () => {
        if (state.lastDetectedCard && el.passCardNo) {
          el.passCardNo.value = state.lastDetectedCard;
        }
        stopCardEnrollment(true);
        switchTab("credentials");
        if (el.passGuestName) el.passGuestName.focus();
      });
    }
  }

  // ------------------------------------------------------------------ Outdoor Card & Biometric Enrollment
  async function startCardEnrollment() {
    if (el.cardEnrollModal) el.cardEnrollModal.style.display = "flex";
    if (el.enrollDetectedBox) el.enrollDetectedBox.style.display = "none";
    if (el.enrollStatusTitle) el.enrollStatusTitle.textContent = "Reader Activated • Please Swipe Card!";
    if (el.enrollStatusDesc) el.enrollStatusDesc.textContent = "Walk to your outdoor door station (DS-KV8113) and punch/swipe your physical RFID card, key fob, or NFC tag on the card reader now.";
    if (el.enrollCountdownBar) el.enrollCountdownBar.style.width = "100%";

    state.cardEnrollSecondsLeft = 60;
    if (state.cardEnrollCountdown) clearInterval(state.cardEnrollCountdown);

    state.cardEnrollCountdown = setInterval(() => {
      state.cardEnrollSecondsLeft--;
      const pct = Math.max(0, (state.cardEnrollSecondsLeft / 60) * 100);
      if (el.enrollCountdownBar) el.enrollCountdownBar.style.width = `${pct}%`;
      if (state.cardEnrollSecondsLeft <= 0) {
        stopCardEnrollment(false);
      }
    }, 1000);

    try {
      const res = await safeFetchJson("api/credentials/card/enroll/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ station_id: state.activeDoorStationId || undefined }),
      });
      if (res.ok) {
        addActivityItem("card", "Outdoor station card reader set to enrollment mode (60s).");
      }
    } catch (e) {
      console.error("Start card enrollment error:", e);
    }
  }

  async function stopCardEnrollment(notifyServer = true) {
    if (state.cardEnrollCountdown) {
      clearInterval(state.cardEnrollCountdown);
      state.cardEnrollCountdown = null;
    }
    if (el.cardEnrollModal) el.cardEnrollModal.style.display = "none";

    if (notifyServer) {
      try {
        await safeFetchJson("api/credentials/card/enroll/stop", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ station_id: state.activeDoorStationId || undefined }),
        });
      } catch (e) {}
    }
  }

  // ------------------------------------------------------------------ Dynamic Push Device Discovery
  async function loadDiscoveredDevices() {
    if (!el.pushDevicesList) return;
    el.pushDevicesList.innerHTML = '<span class="device-chip-loading">Scanning Home Assistant Companion App services...</span>';
    try {
      const res = await safeFetchJson("api/notifications/devices");
      const data = res.data || {};

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
      const res = await safeFetchJson("api/config");
      const cfg = res.data || {};
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
          const res = await safeFetchJson("api/notifications/test", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ door: 1 }),
          });
          const d = res.data || {};
          if (res.ok && d.ok) {
            if (el.pushTestFeedback) {
              el.pushTestFeedback.innerHTML = `<span style="color:var(--success);">✓ ${d.message || "Test ring sent!"}</span>`;
            }
          } else {
            if (el.pushTestFeedback) {
              el.pushTestFeedback.innerHTML = `<span style="color:var(--danger);">${d.error || res.error || "Failed"}</span>`;
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
        const res = await safeFetchJson("api/config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = res.data || {};
        if (res.ok && data.ok) {
          el.settingsFeedback.innerHTML =
            '<span style="color:var(--success);">✓ Connected and saved successfully!</span>';
          await checkStatus();
          setTimeout(() => switchTab("live"), 1200);
        } else {
          el.settingsFeedback.innerHTML = `<span style="color:var(--danger);">${data.error || res.error || "Save failed"}</span>`;
        }
      } catch (err) {
        el.settingsFeedback.innerHTML = `<span style="color:var(--danger);">${err.message}</span>`;
      }
    });

    el.btnTestConn.addEventListener("click", async () => {
      el.settingsFeedback.innerHTML =
        '<span style="color:var(--accent);">Probing Door Station at ' + el.cfgHost.value + "...</span>";
      try {
        const res = await safeFetchJson("api/status");
        const d = res.data || {};
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

  // ------------------------------------------------------------------ SADP & ONVIF Device Scanner
  function setupDiscoveryUI() {
    if (el.btnRefreshScan) {
      el.btnRefreshScan.addEventListener("click", startDeviceDiscovery);
    }
    if (el.btnQuickScan) {
      el.btnQuickScan.addEventListener("click", () => {
        switchTab("discover");
        startDeviceDiscovery();
      });
    }

    if (el.discoverFilterPills) {
      el.discoverFilterPills.querySelectorAll(".filter-pill").forEach((pill) => {
        pill.addEventListener("click", () => {
          el.discoverFilterPills.querySelectorAll(".filter-pill").forEach((p) => p.classList.remove("active"));
          pill.classList.add("active");
          state.filterCategory = pill.dataset.filter || "all";
          renderDiscoveredDevices();
        });
      });
    }

    if (el.discoverSearchInput) {
      el.discoverSearchInput.addEventListener("input", (e) => {
        state.searchQuery = e.target.value.toLowerCase().trim();
        renderDiscoveredDevices();
      });
    }

    if (el.btnSelectAllDiscover) {
      el.btnSelectAllDiscover.addEventListener("click", () => {
        const filtered = getFilteredDiscoveredDevices();
        const allSelected = filtered.length > 0 && filtered.every((d) => state.selectedDeviceIps.has(d.ip));
        if (allSelected) {
          filtered.forEach((d) => state.selectedDeviceIps.delete(d.ip));
        } else {
          filtered.forEach((d) => state.selectedDeviceIps.add(d.ip));
        }
        updateBatchAdoptUi();
        renderDiscoveredDevices();
      });
    }

    if (el.btnBatchAdopt) {
      el.btnBatchAdopt.addEventListener("click", () => {
        openBatchAdoptModal();
      });
    }

    if (el.btnAdoptModalClose) el.btnAdoptModalClose.addEventListener("click", closeAdoptModal);
    if (el.btnAdoptCancel) el.btnAdoptCancel.addEventListener("click", closeAdoptModal);
    if (el.adoptForm) el.adoptForm.addEventListener("submit", handleAdoptSubmit);
  }

  function getFilteredDiscoveredDevices() {
    let list = state.discoveredDevices || [];
    if (state.filterCategory !== "all") {
      list = list.filter((d) => d.category === state.filterCategory);
    }
    if (state.searchQuery) {
      const q = state.searchQuery;
      list = list.filter(
        (d) =>
          (d.ip && d.ip.toLowerCase().includes(q)) ||
          (d.mac && d.mac.toLowerCase().includes(q)) ||
          (d.brand && d.brand.toLowerCase().includes(q)) ||
          (d.model && d.model.toLowerCase().includes(q)) ||
          (d.category && d.category.toLowerCase().includes(q))
      );
    }
    return list;
  }

  async function startDeviceDiscovery() {
    if (el.discoverDeviceList) {
      el.discoverDeviceList.innerHTML = `
        <div class="scanning-placeholder">
          <div class="radar-scan-anim">
            <div class="radar-circle circle-1"></div>
            <div class="radar-circle circle-2"></div>
            <div class="radar-circle circle-3"></div>
            <div class="radar-sweep"></div>
          </div>
          <p>Scanning local subnet for Hikvision &amp; ONVIF Intercom units...</p>
        </div>
      `;
    }

    if (el.btnRefreshScan) {
      el.btnRefreshScan.classList.add("pulsing");
      el.btnRefreshScan.disabled = true;
    }

    try {
      const res = await safeFetchJson("api/discover/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timeout: 3.5 }),
      });

      if (res.ok && res.data && Array.isArray(res.data.devices)) {
        state.discoveredDevices = res.data.devices;
        updateDiscoveryCounts(res.data.devices);
        renderDiscoveredDevices();
      } else {
        if (el.discoverDeviceList) {
          el.discoverDeviceList.innerHTML = `
            <div class="scanning-placeholder">
              <p style="color:var(--danger);">Scan failed: ${res.error || "No response"}</p>
            </div>
          `;
        }
      }
    } catch (e) {
      if (el.discoverDeviceList) {
        el.discoverDeviceList.innerHTML = `
          <div class="scanning-placeholder">
            <p style="color:var(--danger);">Scan error: ${e.message}</p>
          </div>
        `;
      }
    } finally {
      if (el.btnRefreshScan) {
        el.btnRefreshScan.classList.remove("pulsing");
        el.btnRefreshScan.disabled = false;
      }
    }
  }

  function updateDiscoveryCounts(devices) {
    if (el.badgeCountAll) el.badgeCountAll.textContent = devices.length;
    if (el.badgeCountDoor)
      el.badgeCountDoor.textContent = devices.filter((d) => d.category === "door_station").length;
    if (el.badgeCountIndoor)
      el.badgeCountIndoor.textContent = devices.filter((d) => d.category === "indoor_station").length;
    if (el.badgeCountNvr)
      el.badgeCountNvr.textContent = devices.filter((d) => d.category === "nvr").length;
    if (el.badgeCountCam)
      el.badgeCountCam.textContent = devices.filter((d) => d.category === "camera").length;

    if (el.btnSelectAllDiscover) {
      el.btnSelectAllDiscover.style.display = devices.length ? "inline-block" : "none";
    }
  }

  function renderDiscoveredDevices() {
    if (!el.discoverDeviceList) return;
    const filtered = getFilteredDiscoveredDevices();

    if (!filtered.length) {
      el.discoverDeviceList.innerHTML = `
        <div class="scanning-placeholder">
          <p>No devices matching filter criteria.</p>
        </div>
      `;
      updateBatchAdoptUi();
      return;
    }

    el.discoverDeviceList.innerHTML = filtered
      .map((d) => {
        const isSelected = state.selectedDeviceIps.has(d.ip);
        const isDoor = d.category === "door_station";
        const isIndoor = d.category === "indoor_station";
        const isNvr = d.category === "nvr";
        const icon = isDoor ? "🚪" : isIndoor ? "📟" : isNvr ? "📼" : "📷";
        const catLabel = isDoor
          ? "Door Station"
          : isIndoor
          ? "Indoor Display"
          : isNvr
          ? "NVR System"
          : "IP Camera";

        const brandPillClass =
          d.brand === "Hikvision"
            ? "badge cyber"
            : d.brand === "Dahua"
            ? "badge warning"
            : "badge neutral";

        return `
          <div class="device-card ${isSelected ? "selected" : ""}" data-ip="${escapeHtml(d.ip)}">
            <div class="device-card-header">
              <div class="device-icon-type">
                <div class="device-select-cb-wrap">
                  <input type="checkbox" class="device-select-cb" data-ip="${escapeHtml(d.ip)}" ${isSelected ? "checked" : ""} />
                </div>
                <div class="device-cat-icon">${icon}</div>
                <div class="device-title-block">
                  <b>${escapeHtml(d.model || d.brand)}</b>
                  <span>${escapeHtml(catLabel)}</span>
                </div>
              </div>
              <div class="device-badge-group">
                <span class="${brandPillClass}">${escapeHtml(d.brand)}</span>
                <span class="badge ${d.activated !== false ? "success" : "warning"}">
                  ${d.activated !== false ? "Active" : "Inactive"}
                </span>
              </div>
            </div>

            <div class="device-details-table">
              <div class="detail-item">
                <span>IP Address</span>
                <b>${escapeHtml(d.ip)}</b>
              </div>
              <div class="detail-item">
                <span>MAC Address</span>
                <b>${escapeHtml(d.mac || "—")}</b>
              </div>
              <div class="detail-item">
                <span>Ports</span>
                <b>HTTP ${d.http_port || 80} / RTSP ${d.rtsp_port || 554}</b>
              </div>
              <div class="detail-item">
                <span>Firmware / Protocol</span>
                <b>${escapeHtml(d.firmware || d.protocol || "SADP")}</b>
              </div>
            </div>

            <div class="device-card-actions">
              <button class="primary-btn btn-adopt-card" data-ip="${escapeHtml(d.ip)}">
                ⚡ 1-Click Adopt
              </button>
            </div>
          </div>
        `;
      })
      .join("");

    // Bind card checkboxes and selection
    el.discoverDeviceList.querySelectorAll(".device-select-cb").forEach((cb) => {
      cb.addEventListener("click", (e) => {
        e.stopPropagation();
        const ip = cb.dataset.ip;
        if (cb.checked) {
          state.selectedDeviceIps.add(ip);
        } else {
          state.selectedDeviceIps.delete(ip);
        }
        const card = el.discoverDeviceList.querySelector(`.device-card[data-ip="${ip}"]`);
        if (card) card.classList.toggle("selected", cb.checked);
        updateBatchAdoptUi();
      });
    });

    el.discoverDeviceList.querySelectorAll(".device-card").forEach((card) => {
      card.addEventListener("click", (e) => {
        if (e.target.closest("button") || e.target.closest("input") || e.target.closest("a")) return;
        const ip = card.dataset.ip;
        const cb = card.querySelector(".device-select-cb");
        if (cb) {
          cb.checked = !cb.checked;
          if (cb.checked) {
            state.selectedDeviceIps.add(ip);
          } else {
            state.selectedDeviceIps.delete(ip);
          }
          card.classList.toggle("selected", cb.checked);
          updateBatchAdoptUi();
        }
      });
    });

    el.discoverDeviceList.querySelectorAll(".btn-adopt-card").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const ip = btn.dataset.ip;
        const dev = state.discoveredDevices.find((d) => d.ip === ip);
        if (dev) openAdoptModal(dev);
      });
    });

    updateBatchAdoptUi();
  }

  function updateBatchAdoptUi() {
    const count = state.selectedDeviceIps.size;
    if (el.batchCountNum) el.batchCountNum.textContent = count;
    if (el.btnBatchAdopt) {
      el.btnBatchAdopt.style.display = count > 0 ? "inline-block" : "none";
    }
  }

  function openAdoptModal(dev) {
    state.selectedAdoptingDevice = dev;
    state.batchAdopting = false;

    if (el.adoptModalTitle) el.adoptModalTitle.textContent = `Adopt ${dev.brand} ${dev.model || dev.ip}`;
    if (el.adoptSummary) {
      el.adoptSummary.innerHTML = `
        <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
          <span><b>Device:</b> ${escapeHtml(dev.brand)} ${escapeHtml(dev.model || "Intercom Unit")}</span>
          <span style="color:var(--accent); font-weight:700;">${escapeHtml(dev.ip)}</span>
        </div>
        <div style="font-size:0.78rem; color:var(--text-secondary);">
          Category: <b>${escapeHtml((dev.category || "intercom").replace("_", " ").toUpperCase())}</b> &bull; MAC: ${escapeHtml(dev.mac || "—")}
        </div>
      `;
    }

    const btnSubmit = document.getElementById("btnAdoptSubmit");
    if (btnSubmit) btnSubmit.textContent = "Adopt & Connect";
    if (el.adoptUsername) el.adoptUsername.value = "admin";
    if (el.adoptPassword) el.adoptPassword.value = "";
    if (el.adoptFeedback) el.adoptFeedback.textContent = "";
    if (el.adoptModal) el.adoptModal.style.display = "flex";
  }

  function openBatchAdoptModal() {
    const selectedList = state.discoveredDevices.filter((d) => state.selectedDeviceIps.has(d.ip));
    if (!selectedList.length) return;

    state.batchAdopting = true;
    state.selectedAdoptingDevice = null;

    if (el.adoptModalTitle) {
      el.adoptModalTitle.textContent = `Batch Adopt (${selectedList.length} Intercom Units)`;
    }
    if (el.adoptSummary) {
      el.adoptSummary.innerHTML = `
        <div style="margin-bottom:8px; font-weight:700; color:var(--accent);">
          Adopting ${selectedList.length} Intercom Devices simultaneously:
        </div>
        <div style="max-height:120px; overflow-y:auto; display:flex; flex-direction:column; gap:4px; font-size:0.78rem;">
          ${selectedList
            .map(
              (d) => `
            <div style="display:flex; justify-content:space-between; padding:3px 6px; background:rgba(255,255,255,0.05); border-radius:4px;">
              <span><b>${escapeHtml(d.model || d.ip)}</b> (${escapeHtml(d.brand)})</span>
              <span style="color:var(--text-secondary);">${escapeHtml(d.ip)}</span>
            </div>`
            )
            .join("")}
        </div>
        <div style="margin-top:8px; font-size:0.75rem; color:var(--text-muted);">
          Enter the common login credentials. Hardware door stations &amp; touch screens will be automatically registered!
        </div>
      `;
    }

    const btnSubmit = document.getElementById("btnAdoptSubmit");
    if (btnSubmit) btnSubmit.textContent = `Adopt All ${selectedList.length} Stations`;
    if (el.adoptUsername) el.adoptUsername.value = "admin";
    if (el.adoptPassword) el.adoptPassword.value = "";
    if (el.adoptFeedback) el.adoptFeedback.textContent = "";
    if (el.adoptModal) el.adoptModal.style.display = "flex";
  }

  function closeAdoptModal() {
    if (el.adoptModal) el.adoptModal.style.display = "none";
    state.selectedAdoptingDevice = null;
    state.batchAdopting = false;
  }

  async function handleAdoptSubmit(e) {
    e.preventDefault();
    const username = el.adoptUsername.value.trim();
    const password = el.adoptPassword.value;
    const btnSubmit = document.getElementById("btnAdoptSubmit");

    if (btnSubmit) {
      btnSubmit.disabled = true;
      btnSubmit.textContent = "Connecting...";
    }
    el.adoptFeedback.innerHTML = '<span style="color:var(--accent);">Configuring intercom station and establishing links...</span>';

    let payload = {};
    if (state.batchAdopting) {
      const selectedList = state.discoveredDevices.filter((d) => state.selectedDeviceIps.has(d.ip));
      payload = {
        devices: selectedList.map((d) => ({
          ip: d.ip,
          brand: (d.brand || "auto").toLowerCase(),
          model: d.model || "",
          category: d.category || "door_station",
          http_port: d.http_port || 80,
          rtsp_port: d.rtsp_port || 554,
          name: `${d.brand} ${d.model || d.ip}`,
        })),
        default_username: username,
        default_password: password,
      };
    } else {
      const dev = state.selectedAdoptingDevice;
      if (!dev) return;
      payload = {
        ip: dev.ip,
        brand: (dev.brand || "auto").toLowerCase(),
        model: dev.model || "",
        category: dev.category || "door_station",
        http_port: dev.http_port || 80,
        rtsp_port: dev.rtsp_port || 554,
        username: username,
        password: password,
        name: `${dev.brand} ${dev.model || dev.ip}`,
      };
    }

    const res = await safeFetchJson("api/discover/adopt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok && res.data && res.data.ok) {
      state.selectedDeviceIps.clear();
      el.adoptFeedback.innerHTML = '<span style="color:var(--success);">✓ Intercom device(s) adopted! Reloading stations...</span>';
      setTimeout(async () => {
        closeAdoptModal();
        await loadConfiguredStations();
        await checkStatus();
        switchTab("live");
      }, 900);
    } else {
      el.adoptFeedback.innerHTML = `<span style="color:var(--danger);">${res.error || (res.data && res.data.error) || "Adoption failed"}</span>`;
    }

    if (btnSubmit) {
      btnSubmit.disabled = false;
      btnSubmit.textContent = "Adopt & Connect";
    }
  }

  // ------------------------------------------------------------------ Multi-Station Management & Door Switcher
  function setupManagedStationsUI() {
    if (el.btnAddManualDoorStation) {
      el.btnAddManualDoorStation.addEventListener("click", () => openManualStationModal("door_station"));
    }
    if (el.btnAddManualIndoorStation) {
      el.btnAddManualIndoorStation.addEventListener("click", () => openManualStationModal("indoor_station"));
    }
    if (el.btnManualStationModalClose) {
      el.btnManualStationModalClose.addEventListener("click", closeManualStationModal);
    }
    if (el.btnManualStationCancel) {
      el.btnManualStationCancel.addEventListener("click", closeManualStationModal);
    }
    if (el.manualStationForm) {
      el.manualStationForm.addEventListener("submit", handleManualStationSubmit);
    }
  }

  async function loadConfiguredStations() {
    try {
      const res = await safeFetchJson("api/devices");
      if (res.ok && res.data) {
        state.doorStations = Array.isArray(res.data.door_stations) ? res.data.door_stations : [];
        state.indoorStations = Array.isArray(res.data.indoor_stations) ? res.data.indoor_stations : [];

        if (state.doorStations.length > 0 && !state.activeDoorStationId) {
          state.activeDoorStationId = state.doorStations[0].id;
        }

        renderStationSwitcher();
        renderConfiguredDoorStations();
        renderConfiguredIndoorStations();
      }
    } catch (e) {
      console.error("Failed to load intercom devices:", e);
    }
  }

  function renderStationSwitcher() {
    if (!el.stationSwitcherBar || !el.stationSwitcherPills) return;
    const doors = state.doorStations || [];

    if (doors.length <= 1) {
      el.stationSwitcherBar.style.display = "none";
      return;
    }

    el.stationSwitcherBar.style.display = "flex";
    el.stationSwitcherPills.innerHTML = doors
      .map((st) => {
        const isActive = st.id === state.activeDoorStationId;
        return `
          <button class="filter-pill ${isActive ? "active" : ""}" data-id="${escapeHtml(st.id)}">
            <span>🚪 ${escapeHtml(st.name || st.host)}</span>
            <span class="pill-badge">${escapeHtml(st.host)}</span>
          </button>
        `;
      })
      .join("");

    el.stationSwitcherPills.querySelectorAll(".filter-pill").forEach((pill) => {
      pill.addEventListener("click", () => {
        const sid = pill.dataset.id;
        switchDoorStation(sid);
      });
    });
  }

  async function switchDoorStation(stationId) {
    const station = state.doorStations.find((d) => d.id === stationId);
    if (!station) return;

    state.activeDoorStationId = stationId;
    renderStationSwitcher();

    // Update active on server
    safeFetchJson("api/intercom/station/active", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ station_id: stationId }),
    }).catch(() => {});

    // Update Live image feed
    if (el.doorLiveImage) {
      if (state.streamMode === "fast") {
        startFastLiveLoop();
      } else {
        el.doorLiveImage.src = `api/mjpeg?station_id=${encodeURIComponent(stationId)}&_t=${Date.now()}`;
      }
    }

    // Update UI labels
    if (el.feedDoorName) el.feedDoorName.textContent = (station.name || "DOOR STATION").toUpperCase();
    if (el.labelDoor1) el.labelDoor1.textContent = station.door_1_name || "Main Gate";
    if (el.labelDoor2) el.labelDoor2.textContent = station.door_2_name || "Pedestrian Door";
    if (el.btnQuickUnlock) el.btnQuickUnlock.innerHTML = `🔓 Unlock ${station.door_1_name || "Main Gate"}`;
    if (el.intercomSubTitle) el.intercomSubTitle.textContent = `${station.name} · ${station.host} · Online`;
  }

  function renderConfiguredDoorStations() {
    if (!el.configuredDoorStationsList) return;
    const list = state.doorStations || [];

    if (!list.length) {
      el.configuredDoorStationsList.innerHTML = `
        <div class="empty-hint">
          No door stations configured yet. Use the <b>SADP Scanner</b> above or click <b>"+ Add Door Station Manually"</b>.
        </div>`;
      return;
    }

    el.configuredDoorStationsList.innerHTML = list
      .map((d) => {
        const brandPillClass =
          d.brand === "hikvision" ? "badge cyber" : d.brand === "dahua" ? "badge warning" : "badge neutral";
        return `
          <div class="configured-device-item" data-id="${escapeHtml(d.id)}">
            <div class="dev-item-info">
              <div class="dev-item-icon">🚪</div>
              <div class="dev-item-details">
                <b>${escapeHtml(d.name || "Door Station")}</b>
                <span>${escapeHtml(d.host)}:${d.http_port || 80} &bull; Relay 1: ${escapeHtml(d.door_1_name || "Door 1")} &bull; Relay 2: ${escapeHtml(d.door_2_name || "Door 2")}</span>
              </div>
            </div>
            <div class="dev-item-actions">
              <span class="${brandPillClass}">${escapeHtml((d.brand || "auto").toUpperCase())}</span>
              <span class="badge ${d.online !== false ? "success" : "danger"}">${d.online !== false ? "● Online" : "○ Offline"}</span>
              <button class="secondary-btn btn-edit-door-station admin-only" data-id="${escapeHtml(d.id)}" style="padding:4px 8px; font-size:0.75rem;">Edit</button>
              <button class="secondary-btn btn-delete-door-station admin-only" data-id="${escapeHtml(d.id)}" style="padding:4px 8px; font-size:0.75rem; color:var(--danger);">Delete</button>
            </div>
          </div>
        `;
      })
      .join("");

    el.configuredDoorStationsList.querySelectorAll(".btn-edit-door-station").forEach((btn) => {
      btn.addEventListener("click", () => {
        const st = state.doorStations.find((d) => d.id === btn.dataset.id);
        if (st) openManualStationModal("door_station", st);
      });
    });

    el.configuredDoorStationsList.querySelectorAll(".btn-delete-door-station").forEach((btn) => {
      btn.addEventListener("click", () => {
        handleDeleteStation(btn.dataset.id, "door_station");
      });
    });
  }

  function renderConfiguredIndoorStations() {
    if (!el.configuredIndoorStationsList) return;
    const list = state.indoorStations || [];

    if (!list.length) {
      el.configuredIndoorStationsList.innerHTML = `
        <div class="empty-hint">
          No indoor displays configured yet. Add physical wall panels (Hikvision DS-KH9510, Android smart screens) or adopt via SADP Scanner.
        </div>`;
      return;
    }

    el.configuredIndoorStationsList.innerHTML = list
      .map((d) => {
        const brandPillClass =
          d.brand === "hikvision" ? "badge cyber" : d.brand === "dahua" ? "badge warning" : "badge neutral";
        return `
          <div class="configured-device-item" data-id="${escapeHtml(d.id)}">
            <div class="dev-item-info">
              <div class="dev-item-icon">📟</div>
              <div class="dev-item-details">
                <b>${escapeHtml(d.name || "Indoor Touch Display")}</b>
                <span>${escapeHtml(d.host)}:${d.http_port || 80} &bull; Room: <b>${escapeHtml(d.room || "Villa")}</b> &bull; Model: ${escapeHtml(d.model || "Touch Screen")}</span>
              </div>
            </div>
            <div class="dev-item-actions">
              <span class="${brandPillClass}">${escapeHtml((d.brand || "auto").toUpperCase())}</span>
              <span class="badge success">● Connected</span>
              <button class="secondary-btn btn-edit-indoor-station admin-only" data-id="${escapeHtml(d.id)}" style="padding:4px 8px; font-size:0.75rem;">Edit</button>
              <button class="secondary-btn btn-delete-indoor-station admin-only" data-id="${escapeHtml(d.id)}" style="padding:4px 8px; font-size:0.75rem; color:var(--danger);">Delete</button>
            </div>
          </div>
        `;
      })
      .join("");

    el.configuredIndoorStationsList.querySelectorAll(".btn-edit-indoor-station").forEach((btn) => {
      btn.addEventListener("click", () => {
        const st = state.indoorStations.find((d) => d.id === btn.dataset.id);
        if (st) openManualStationModal("indoor_station", st);
      });
    });

    el.configuredIndoorStationsList.querySelectorAll(".btn-delete-indoor-station").forEach((btn) => {
      btn.addEventListener("click", () => {
        handleDeleteStation(btn.dataset.id, "indoor_station");
      });
    });
  }

  function openManualStationModal(category = "door_station", station = null) {
    if (el.manualStationForm) el.manualStationForm.reset();
    if (el.manualStationFeedback) el.manualStationFeedback.textContent = "";

    const isDoor = category === "door_station";
    if (el.manualStationCategory) el.manualStationCategory.value = category;
    if (el.manualStationModalBadge) {
      el.manualStationModalBadge.textContent = isDoor ? "🚪 Door Station" : "📟 Indoor Display";
    }
    if (el.manualStationDoorsRow) el.manualStationDoorsRow.style.display = isDoor ? "grid" : "none";
    if (el.manualStationRoomRow) el.manualStationRoomRow.style.display = isDoor ? "none" : "block";
    if (el.manualStationModelRow) el.manualStationModelRow.style.display = isDoor ? "none" : "block";

    if (station) {
      if (el.manualStationModalTitle)
        el.manualStationModalTitle.textContent = `Edit Station: ${station.name || station.host}`;
      if (el.manualStationId) el.manualStationId.value = station.id || "";
      if (el.manualStationName) el.manualStationName.value = station.name || "";
      if (el.manualStationHost) el.manualStationHost.value = station.host || "";
      if (el.manualStationBrand) el.manualStationBrand.value = station.brand || "auto";
      if (el.manualStationHttpPort) el.manualStationHttpPort.value = station.http_port || 80;
      if (el.manualStationRtspPort) el.manualStationRtspPort.value = station.rtsp_port || 554;
      if (el.manualStationUsername) el.manualStationUsername.value = station.username || "admin";
      if (el.manualStationPassword) el.manualStationPassword.value = station.has_password ? "••••••••" : "";

      if (isDoor) {
        if (el.manualStationDoor1) el.manualStationDoor1.value = station.door_1_name || "Main Gate";
        if (el.manualStationDoor2) el.manualStationDoor2.value = station.door_2_name || "Pedestrian Door";
      } else {
        if (el.manualStationRoom) el.manualStationRoom.value = station.room || "Living Room";
        if (el.manualStationModel) el.manualStationModel.value = station.model || "DS-KH9510";
      }
    } else {
      if (el.manualStationModalTitle)
        el.manualStationModalTitle.textContent = isDoor ? "Add Door Station" : "Add Indoor Touch Screen";
      if (el.manualStationId) el.manualStationId.value = "";
      if (el.manualStationHttpPort) el.manualStationHttpPort.value = 80;
      if (el.manualStationRtspPort) el.manualStationRtspPort.value = 554;
      if (el.manualStationUsername) el.manualStationUsername.value = "admin";
      if (isDoor) {
        if (el.manualStationDoor1) el.manualStationDoor1.value = "Main Gate";
        if (el.manualStationDoor2) el.manualStationDoor2.value = "Pedestrian Door";
      } else {
        if (el.manualStationRoom) el.manualStationRoom.value = "Living Room";
        if (el.manualStationModel) el.manualStationModel.value = "DS-KH9510";
      }
    }

    if (el.manualStationModal) el.manualStationModal.style.display = "flex";
  }

  function closeManualStationModal() {
    if (el.manualStationModal) el.manualStationModal.style.display = "none";
  }

  async function handleManualStationSubmit(e) {
    e.preventDefault();
    const cat = el.manualStationCategory.value || "door_station";
    const payload = {
      category: cat,
      id: el.manualStationId.value.trim() || undefined,
      name: el.manualStationName.value.trim(),
      host: el.manualStationHost.value.trim(),
      brand: el.manualStationBrand.value,
      http_port: parseInt(el.manualStationHttpPort.value, 10) || 80,
      rtsp_port: parseInt(el.manualStationRtspPort.value, 10) || 554,
      username: el.manualStationUsername.value.trim() || "admin",
      password: el.manualStationPassword.value,
    };

    if (cat === "door_station") {
      payload.door_1_name = el.manualStationDoor1.value.trim();
      payload.door_2_name = el.manualStationDoor2.value.trim();
    } else {
      payload.room = el.manualStationRoom.value.trim();
      payload.model = el.manualStationModel.value.trim();
    }

    if (el.manualStationFeedback) {
      el.manualStationFeedback.innerHTML = '<span style="color:var(--accent);">Validating and saving station...</span>';
    }

    const res = await safeFetchJson("api/devices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok && res.data && res.data.ok) {
      if (el.manualStationFeedback) {
        el.manualStationFeedback.innerHTML = '<span style="color:var(--success);">✓ Station saved successfully!</span>';
      }
      setTimeout(async () => {
        closeManualStationModal();
        await loadConfiguredStations();
        await checkStatus();
      }, 700);
    } else {
      if (el.manualStationFeedback) {
        el.manualStationFeedback.innerHTML = `<span style="color:var(--danger);">${res.error || "Failed to save station"}</span>`;
      }
    }
  }

  async function handleDeleteStation(stationId, category) {
    const isDoor = category === "door_station";
    if (!confirm(`Are you sure you want to remove this ${isDoor ? "door station" : "indoor display"}?`)) return;

    const res = await safeFetchJson("api/devices/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: stationId, category: category }),
    });

    if (res.ok && res.data && res.data.ok) {
      await loadConfiguredStations();
      await checkStatus();
    } else {
      alert(`Could not remove station: ${res.error || "Unknown error"}`);
    }
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
      const res = await safeFetchJson("api/intercom/displays/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_id: state.selfId,
          room_name: state.selfRoom,
          device_type: "tablet",
          status: state.selfStatus,
        }),
      });
      const data = res.data || {};
      if (res.ok && data.ok && data.display && el.selfIpAddress) {
        el.selfIpAddress.textContent = data.display.ip || "127.0.0.1";
      }
    } catch (e) {
      console.debug("Display registration heartbeat error:", e);
    }
  }

  async function loadDisplays() {
    if (!el.displaysGrid) return;
    try {
      const res = await safeFetchJson("api/intercom/displays");
      const data = res.data || {};
      if (res.ok && data.ok && Array.isArray(data.displays)) {
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

      const isHw = Boolean(d.is_hardware || d.device_type === "indoor_panel");
      const actionButtons = isSelf
        ? `<button type="button" class="btn-room-page" style="flex:1;" disabled>📍 Local Screen</button>`
        : isHw
        ? `<button type="button" class="primary-btn btn-room-call" data-hw-unit="${escapeHtml(d.unit_number || '101')}" data-name="${escapeHtml(d.name)}">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
            Ring Panel
          </button>
          <button type="button" class="btn-room-page" data-name="${escapeHtml(d.name)}" title="Send Quick Page">📢 Page</button>`
        : `<button type="button" class="btn-room-call" data-id="${d.id}" data-name="${escapeHtml(d.name)}">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
            Call Room
          </button>
          <button type="button" class="btn-room-page" data-name="${escapeHtml(d.name)}" title="Send Quick Page">📢 Page</button>`;

      card.innerHTML = `
        <div class="room-card-head">
          <div class="room-avatar-badge">
            <div class="room-icon-box">${avatar}</div>
            <div class="room-title-block">
              <b>${escapeHtml(d.name)} ${isSelf ? "<small style='color:var(--accent); font-weight:normal;'>(This Screen)</small>" : ""}</b>
              <span>${escapeHtml(d.device_type === "indoor_panel" ? (d.model || "Wall Panel") : (d.device_type || "Wall Display"))} &bull; ${escapeHtml(d.ip || "LAN")}</span>
            </div>
          </div>
          <span class="room-status-badge ${statusClass}">${statusText}</span>
        </div>
        <div class="room-card-actions">
          ${actionButtons}
        </div>
      `;

      if (!isSelf) {
        if (isHw) {
          card.querySelector(".btn-room-call")?.addEventListener("click", () => {
            dialHardwareStation(d.unit_number || "101");
          });
        } else {
          card.querySelector(".btn-room-call")?.addEventListener("click", () => {
            initiateRoomCall(d.id, d.name);
          });
        }
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
      const res = await safeFetchJson("api/intercom/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from_name: state.selfRoom,
          message: message,
        }),
      });
      const data = res.data || {};
      if (res.ok && data.ok) {
        if (el.broadcastFeedback) {
          el.broadcastFeedback.innerHTML = '<span style="color:var(--success);">✓ Broadcast transmitted to all displays!</span>';
        }
        if (el.broadcastInput) el.broadcastInput.value = "";
      } else {
        if (el.broadcastFeedback) {
          el.broadcastFeedback.innerHTML = `<span style="color:var(--danger);">${data.error || res.error || "Failed"}</span>`;
        }
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
      const res = await safeFetchJson("api/intercom/hardware_call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: unitNo }),
      });
      const data = res.data || {};
      alert(`Dialing physical indoor station ${unitNo}... Terminal response: ${res.ok && data.ok ? "Ringing" : "Offline / Ready"}`);
    } catch (e) {
      alert(`Could not dial hardware station ${unitNo}: ${e.message}`);
    }
  }

  // Start on load
  window.addEventListener("DOMContentLoaded", init);
})();
