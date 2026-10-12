/**
 * AJ Netweb CCTV & NVR Studio - Advanced Client Controller
 * Live Camera Wall, Digital Zoom & Pan, Virtual Joystick, Color Theme Engine,
 * NVR Playback Timeline, and Automated Hikvision SADP & ONVIF Device Scanner.
 */

(function () {
  "use strict";

  // Application State
  const state = {
    configured: false,
    brand: "auto",
    channels: [],
    activeTab: "grid",
    gridCols: 2,
    streamMode: localStorage.getItem("ajn_cctv_stream_mode") || "mjpeg", // mjpeg | snapshot_fast | snapshot_slow
    ptzChannel: 1,
    ptzSpeed: 5,
    presetMode: "goto", // goto | set
    recordings: [],
    refreshTimer: null,
    clockTimer: null,
    // Discovery state
    discoveredDevices: [],
    filterCategory: "all",
    searchQuery: "",
    selectedAdoptingDevice: null,
    selectedDeviceIps: new Set(),
    batchAdopting: false,
    configuredDevices: [],
    activeLiveFilterDevice: "all",
    // Theme
    theme: localStorage.getItem("ajn_cctv_theme") || "cyan",
    customColor: localStorage.getItem("ajn_cctv_custom_color") || "#00e5ff",
    oledMode: localStorage.getItem("ajn_cctv_oled") === "true",
    // Digital Zoom maps per channel: { [cid]: { scale: 1, x: 0, y: 0 } }
    zoomState: {},
  };

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

  // DOM Elements
  const el = {
    nvrBrandBadge: document.getElementById("nvrBrandBadge"),
    nvrSubTitle: document.getElementById("nvrSubTitle"),
    navBtns: document.querySelectorAll(".nav-btn"),
    viewPanels: document.querySelectorAll(".view-panel"),
    gridPicker: document.getElementById("gridPicker"),
    gridBtns: document.querySelectorAll(".grid-btn"),
    streamModeSelect: document.getElementById("streamModeSelect"),
    quickThemeSelect: document.getElementById("quickThemeSelect"),
    headerColorPicker: document.getElementById("headerColorPicker"),
    colorPickerWrapper: document.getElementById("colorPickerWrapper"),
    cameraGrid: document.getElementById("cameraGrid"),
    liveWallFilterBar: document.getElementById("liveWallFilterBar"),
    liveWallDevicePills: document.getElementById("liveWallDevicePills"),
    // PTZ elements
    ptzChannelSelect: document.getElementById("ptzChannelSelect"),
    ptzLiveImage: document.getElementById("ptzLiveImage"),
    ptzViewport: document.getElementById("ptzViewport"),
    ptzOverlay: document.getElementById("ptzOverlay"),
    ptzSpeed: document.getElementById("ptzSpeed"),
    speedValue: document.getElementById("speedValue"),
    dpadBtns: document.querySelectorAll(".dpad-btn"),
    actionBtns: document.querySelectorAll(".action-btn"),
    presetModeGoto: document.getElementById("presetModeGoto"),
    presetModeSet: document.getElementById("presetModeSet"),
    presetChips: document.getElementById("presetChips"),
    ptzFullscreenBtn: document.getElementById("ptzFullscreenBtn"),
    ptzSnapshotBtn: document.getElementById("ptzSnapshotBtn"),
    ptzOsdTitle: document.getElementById("ptzOsdTitle"),
    ptzOsdClock: document.getElementById("ptzOsdClock"),
    ptzZoomHud: document.getElementById("ptzZoomHud"),
    // Playback elements
    pbChannelSelect: document.getElementById("pbChannelSelect"),
    pbDateInput: document.getElementById("pbDateInput"),
    pbSearchBtn: document.getElementById("pbSearchBtn"),
    timelineTrack: document.getElementById("timelineTrack"),
    timelineSegments: document.getElementById("timelineSegments"),
    timelineNeedle: document.getElementById("timelineNeedle"),
    needleTooltip: document.getElementById("needleTooltip"),
    clipsCount: document.getElementById("clipsCount"),
    clipsList: document.getElementById("clipsList"),
    pbVideo: document.getElementById("pbVideo"),
    pbPlayerPlaceholder: document.getElementById("pbPlayerPlaceholder"),
    // Settings elements
    settingsForm: document.getElementById("settingsForm"),
    cfgBrand: document.getElementById("cfgBrand"),
    cfgHost: document.getElementById("cfgHost"),
    cfgHttpPort: document.getElementById("cfgHttpPort"),
    cfgRtspPort: document.getElementById("cfgRtspPort"),
    cfgUsername: document.getElementById("cfgUsername"),
    cfgPassword: document.getElementById("cfgPassword"),
    cfgStreamQuality: document.getElementById("cfgStreamQuality"),
    btnTestConn: document.getElementById("btnTestConn"),
    settingsFeedback: document.getElementById("settingsFeedback"),
    settingsCustomColor: document.getElementById("settingsCustomColor"),
    settingsOledToggle: document.getElementById("settingsOledToggle"),
    themeChips: document.querySelectorAll(".theme-chip"),
    configuredDevicesList: document.getElementById("configuredDevicesList"),
    btnAddManualDevice: document.getElementById("btnAddManualDevice"),
    manualDeviceModal: document.getElementById("manualDeviceModal"),
    manualDeviceForm: document.getElementById("manualDeviceForm"),
    btnManualDeviceModalClose: document.getElementById("btnManualDeviceModalClose"),
    btnManualDeviceCancel: document.getElementById("btnManualDeviceCancel"),
    manualDevFeedback: document.getElementById("manualDevFeedback"),
    manualDevId: document.getElementById("manualDevId"),
    manualDevName: document.getElementById("manualDevName"),
    manualDevHost: document.getElementById("manualDevHost"),
    manualDevBrand: document.getElementById("manualDevBrand"),
    manualDevType: document.getElementById("manualDevType"),
    manualDevHttpPort: document.getElementById("manualDevHttpPort"),
    manualDevRtspPort: document.getElementById("manualDevRtspPort"),
    manualDevUsername: document.getElementById("manualDevUsername"),
    manualDevPassword: document.getElementById("manualDevPassword"),
    // Discovery elements
    btnRefreshScan: document.getElementById("btnRefreshScan"),
    btnQuickScan: document.getElementById("btnQuickScan"),
    btnSelectAllDiscover: document.getElementById("btnSelectAllDiscover"),
    btnBatchAdopt: document.getElementById("btnBatchAdopt"),
    batchCountNum: document.getElementById("batchCountNum"),
    discoverFilterPills: document.getElementById("discoverFilterPills"),
    discoverSearchInput: document.getElementById("discoverSearchInput"),
    discoverDeviceList: document.getElementById("discoverDeviceList"),
    badgeCountAll: document.getElementById("badgeCountAll"),
    badgeCountNvr: document.getElementById("badgeCountNvr"),
    badgeCountCam: document.getElementById("badgeCountCam"),
    badgeCountDoor: document.getElementById("badgeCountDoor"),
    badgeCountIndoor: document.getElementById("badgeCountIndoor"),
    // Adoption Modal elements
    adoptModal: document.getElementById("adoptModal"),
    adoptModalTitle: document.getElementById("adoptModalTitle"),
    adoptSummary: document.getElementById("adoptSummary"),
    adoptUsername: document.getElementById("adoptUsername"),
    adoptPassword: document.getElementById("adoptPassword"),
    btnAdoptModalClose: document.getElementById("btnAdoptModalClose"),
    btnAdoptCancel: document.getElementById("btnAdoptCancel"),
    adoptForm: document.getElementById("adoptForm"),
    adoptFeedback: document.getElementById("adoptFeedback"),
  };

  // ------------------------------------------------------------------ Initialization
  async function init() {
    applyTheme(state.theme, state.customColor, state.oledMode);
    setupNavigation();
    setupGridControls();
    setupPtzControls();
    setupPlaybackControls();
    setupDiscoveryControls();
    setupSettings();
    setupKeyboardShortcuts();
    startClock();

    // Default playback date to today
    if (el.pbDateInput) {
      el.pbDateInput.value = new Date().toISOString().split("T")[0];
    }

    await checkStatus();
    if (state.configured) {
      await loadChannels();
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

  // ------------------------------------------------------------------ Theme Engine
  function applyTheme(themeName, customHex, oled) {
    state.theme = themeName;
    state.customColor = customHex;
    state.oledMode = oled;

    localStorage.setItem("ajn_cctv_theme", themeName);
    localStorage.setItem("ajn_cctv_custom_color", customHex);
    localStorage.setItem("ajn_cctv_oled", String(oled));

    if (el.quickThemeSelect) el.quickThemeSelect.value = themeName;
    if (el.headerColorPicker) el.headerColorPicker.value = customHex;
    if (el.settingsCustomColor) el.settingsCustomColor.value = customHex;
    if (el.colorPickerWrapper) {
      el.colorPickerWrapper.style.display = themeName === "custom" ? "inline-flex" : "none";
    }
    if (el.settingsOledToggle) el.settingsOledToggle.value = String(oled);

    if (el.themeChips) {
      el.themeChips.forEach((c) => {
        c.classList.toggle("active", c.dataset.themeVal === themeName);
      });
    }

    const themes = {
      cyan: { accent: "#00e5ff", glow: "rgba(0, 229, 255, 0.4)", subtle: "rgba(0, 229, 255, 0.12)" },
      emerald: { accent: "#00ff88", glow: "rgba(0, 255, 136, 0.4)", subtle: "rgba(0, 255, 136, 0.12)" },
      amber: { accent: "#ffb703", glow: "rgba(255, 183, 3, 0.4)", subtle: "rgba(255, 183, 3, 0.12)" },
      crimson: { accent: "#ff0055", glow: "rgba(255, 0, 85, 0.4)", subtle: "rgba(255, 0, 85, 0.12)" },
      titanium: { accent: "#94a3b8", glow: "rgba(148, 163, 184, 0.4)", subtle: "rgba(148, 163, 184, 0.12)" },
      custom: {
        accent: customHex,
        glow: hexToRgba(customHex, 0.4),
        subtle: hexToRgba(customHex, 0.12),
      },
    };

    const sel = themes[themeName] || themes.cyan;
    const r = document.documentElement;
    r.style.setProperty("--accent", sel.accent);
    r.style.setProperty("--accent-glow", sel.glow);
    r.style.setProperty("--accent-subtle", sel.subtle);

    if (oled) {
      r.style.setProperty("--bg-space", "#000000");
      r.style.setProperty("--bg-panel", "#050505");
      r.style.setProperty("--bg-card", "#0a0a0a");
    } else {
      r.style.setProperty("--bg-space", "#070a12");
      r.style.setProperty("--bg-panel", "#0d1322");
      r.style.setProperty("--bg-card", "#111a30");
    }
  }

  function hexToRgba(hex, alpha) {
    let c = hex.replace("#", "");
    if (c.length === 3) c = c.split("").map((x) => x + x).join("");
    const num = parseInt(c, 16);
    return `rgba(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}, ${alpha})`;
  }

  // ------------------------------------------------------------------ Navigation & Tabs
  function setupNavigation() {
    el.navBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const tab = btn.dataset.tab;
        switchTab(tab);
      });
    });

    if (el.streamModeSelect) {
      el.streamModeSelect.value = state.streamMode;
      el.streamModeSelect.addEventListener("change", (e) => {
        state.streamMode = e.target.value;
        try {
          localStorage.setItem("ajn_cctv_stream_mode", state.streamMode);
        } catch (_) {}
        if (state.activeTab === "grid") {
          renderGrid();
        } else if (state.activeTab === "ptz") {
          updatePtzLiveFeed();
        }
      });
    }

    el.quickThemeSelect.addEventListener("change", (e) => {
      const t = e.target.value;
      applyTheme(t, state.customColor, state.oledMode);
    });

    el.headerColorPicker.addEventListener("input", (e) => {
      applyTheme("custom", e.target.value, state.oledMode);
    });
  }

  function switchTab(tab) {
    state.activeTab = tab;
    el.navBtns.forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    el.viewPanels.forEach((p) => {
      p.classList.toggle("active", p.id === `view${capitalize(tab)}`);
    });

    if (tab === "ptz") {
      updatePtzLiveFeed();
    } else if (tab === "settings") {
      loadSettings();
    } else if (tab === "discover") {
      if (!state.discoveredDevices.length) {
        runDeviceDiscovery(false);
      }
    }
  }

  function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  // ------------------------------------------------------------------ Status & Channels
  async function checkStatus() {
    try {
      const res = await safeFetchJson("api/status");
      if (!res.ok || !res.data) {
        el.nvrBrandBadge.textContent = "Offline / Error";
        el.nvrBrandBadge.className = "badge danger";
        return;
      }
      const data = res.data;
      state.configured = Boolean(data.configured);
      state.brand = data.brand || "auto";

      if (!data.configured) {
        el.nvrBrandBadge.textContent = "Not Connected";
        el.nvrBrandBadge.className = "badge warning";
        el.nvrSubTitle.textContent = "Use SADP Scanner or enter IP & credentials in Settings";
        renderEmptyGridState();
        return;
      }

      const brandName =
        data.brand === "hikvision" ? "Hikvision ISAPI" : data.brand === "dahua" ? "Dahua CGI" : "Auto-Detected";
      el.nvrBrandBadge.textContent = brandName;
      el.nvrBrandBadge.className = "badge success";

      const devName = data.device_info?.device_name || data.device_info?.model || "NVR System";
      el.nvrSubTitle.textContent = `${devName} · ${data.host || ""} · ${data.channels_count || 0} Channels`;
    } catch (e) {
      el.nvrBrandBadge.textContent = "Offline / Error";
      el.nvrBrandBadge.className = "badge danger";
    }
  }

  function renderEmptyGridState() {
    el.cameraGrid.innerHTML = `
      <div class="empty-state">
        <div style="font-size:3rem; margin-bottom:12px;">📹</div>
        <h3 style="font-size:1.2rem; color:var(--text-primary); margin-bottom:8px;">No Surveillance NVR or Camera Connected</h3>
        <p style="max-width:540px; margin:0 auto 18px; color:var(--text-secondary);">
          Run the automated SADP &amp; ONVIF network scanner to detect all Hikvision NVRs, AcuSense cameras, and Dahua streams on your local network.
        </p>
        <button id="btnEmptyStateScan" class="primary-btn pulse-glow" style="display:inline-flex; align-items:center; gap:8px; padding:10px 22px;">
          <span class="pulse-radar-dot"></span>
          <span>Scan Local Network (SADP &amp; ONVIF)</span>
        </button>
      </div>`;

    const btn = document.getElementById("btnEmptyStateScan");
    if (btn) {
      btn.addEventListener("click", () => {
        switchTab("discover");
        runDeviceDiscovery(true);
      });
    }
  }

  async function loadChannels() {
    try {
      const res = await safeFetchJson("api/channels");
      const list = res.data;
      if (Array.isArray(list) && list.length > 0) {
        state.channels = list;

        // Build live wall device filter pills if multiple devices exist
        const devMap = new Map();
        list.forEach((c) => {
          const devId = c.device_id || "primary";
          const devName = c.device_name || "Camera Unit";
          if (!devMap.has(devId)) {
            devMap.set(devId, { id: devId, name: devName, count: 0 });
          }
          devMap.get(devId).count++;
        });

        if (devMap.size > 1 && el.liveWallFilterBar && el.liveWallDevicePills) {
          el.liveWallFilterBar.style.display = "flex";
          let pillsHtml = `<button class="filter-pill ${state.activeLiveFilterDevice === 'all' ? 'active' : ''}" data-device-filter="all">All Cameras (${list.length})</button>`;
          devMap.forEach((d) => {
            pillsHtml += `<button class="filter-pill ${state.activeLiveFilterDevice === d.id ? 'active' : ''}" data-device-filter="${d.id}">${escapeHtml(d.name)} (${d.count})</button>`;
          });
          el.liveWallDevicePills.innerHTML = pillsHtml;
          el.liveWallDevicePills.querySelectorAll(".filter-pill").forEach((btn) => {
            btn.addEventListener("click", () => {
              state.activeLiveFilterDevice = btn.dataset.deviceFilter;
              el.liveWallDevicePills.querySelectorAll(".filter-pill").forEach((b) => b.classList.remove("active"));
              btn.classList.add("active");
              renderGrid();
            });
          });
        } else if (el.liveWallFilterBar) {
          el.liveWallFilterBar.style.display = "none";
        }

        renderGrid();
        populateChannelDropdowns();
      } else if (!state.configured) {
        renderEmptyGridState();
      }
    } catch (e) {
      console.error("Failed to load channels:", e);
    }
  }

  function populateChannelDropdowns() {
    const opts = state.channels.map((c) => `<option value="${c.id}">${escapeHtml(c.name)} (CH ${c.id})</option>`).join("");
    if (el.ptzChannelSelect) {
      el.ptzChannelSelect.innerHTML = opts;
    }
    if (el.pbChannelSelect) {
      el.pbChannelSelect.innerHTML = opts;
    }
  }

  // ------------------------------------------------------------------ Live Grid Wall
  function setupGridControls() {
    el.gridBtns.forEach((b) => {
      b.addEventListener("click", () => {
        el.gridBtns.forEach((btn) => btn.classList.remove("active"));
        b.classList.add("active");
        state.gridCols = parseInt(b.dataset.cols, 10);
        el.cameraGrid.className = `camera-grid cols-${state.gridCols}`;
      });
    });
  }

  function renderGrid() {
    if (!state.channels.length) {
      if (!state.configured) {
        renderEmptyGridState();
      }
      return;
    }

    let displayChannels = state.channels;
    if (state.activeLiveFilterDevice !== "all") {
      displayChannels = displayChannels.filter((c) => (c.device_id || "primary") === state.activeLiveFilterDevice);
    }

    el.cameraGrid.className = `camera-grid cols-${state.gridCols}`;
    el.cameraGrid.innerHTML = displayChannels
      .map((c) => {
        // Always seed with an immediate snapshot so the tile displays video immediately without delay
        const initialSrc = `api/snapshot/${c.id}?_t=${Date.now()}`;
        return `
        <div class="camera-tile" data-id="${c.id}" id="camTile_${c.id}">
          <div class="tile-header">
            <div class="tile-name-group">
              <span class="pulse-dot"></span>
              <span class="tile-name">${escapeHtml(c.name)}</span>
            </div>
            <div class="tile-actions">
              <button class="icon-btn btn-snap" title="Download Screenshot" data-id="${c.id}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"></path>
                </svg>
              </button>
              <button class="icon-btn btn-ptz" title="Control PTZ" data-id="${c.id}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"></circle>
                  <path d="m10 8 4 4-4 4"></path>
                </svg>
              </button>
              <button class="icon-btn btn-full" title="Maximize Camera" data-id="${c.id}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>
                </svg>
              </button>
            </div>
          </div>
          <div class="tile-viewport">
            <div class="tile-osd">
              <span>CH ${c.id}</span>
              <span class="live-clock">--:--:--</span>
            </div>
            <img class="tile-image" src="${initialSrc}" alt="${escapeHtml(c.name)}">
          </div>
        </div>
      `;
      })
      .join("");

    bindGridEvents();
    setupRefreshTimer();

    // If stream mode is mjpeg, transition image sources after initial snapshot renders
    if (state.streamMode === "mjpeg") {
      setTimeout(() => {
        el.cameraGrid.querySelectorAll(".camera-tile").forEach((tile) => {
          const cid = tile.dataset.id;
          const img = tile.querySelector(".tile-image");
          if (img && cid) {
            img.src = `api/mjpeg/${cid}`;
          }
        });
      }, 400);
    }
  }

  function bindGridEvents() {
    el.cameraGrid.querySelectorAll(".tile-image").forEach((img) => {
      img.onerror = () => {
        const tile = img.closest(".camera-tile");
        const cid = tile ? tile.dataset.id : null;
        if (cid) {
          setTimeout(() => {
            img.src = `api/snapshot/${cid}?_t=${Date.now()}`;
          }, 1000);
        }
      };
    });

    el.cameraGrid.querySelectorAll(".btn-snap").forEach((b) => {
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        const cid = b.dataset.id;
        window.open(`api/snapshot/${cid}?download=1`, "_blank");
      });
    });

    el.cameraGrid.querySelectorAll(".btn-ptz").forEach((b) => {
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        const cid = parseInt(b.dataset.id, 10);
        state.ptzChannel = cid;
        if (el.ptzChannelSelect) el.ptzChannelSelect.value = cid;
        switchTab("ptz");
      });
    });

    el.cameraGrid.querySelectorAll(".btn-full").forEach((b) => {
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        const tile = document.getElementById(`camTile_${b.dataset.id}`);
        if (tile) {
          if (!document.fullscreenElement) {
            tile.requestFullscreen?.().catch(() => {});
          } else {
            document.exitFullscreen?.().catch(() => {});
          }
        }
      });
    });

    // Double-click tile to toggle 1x1 single camera focus
    el.cameraGrid.querySelectorAll(".camera-tile").forEach((tile) => {
      tile.addEventListener("dblclick", () => {
        if (state.gridCols === 1) {
          state.gridCols = 2;
        } else {
          state.gridCols = 1;
        }
        el.cameraGrid.className = `camera-grid cols-${state.gridCols}`;
        el.gridBtns.forEach((b) => {
          b.classList.toggle("active", parseInt(b.dataset.cols, 10) === state.gridCols);
        });
      });
    });
  }

  function setupRefreshTimer() {
    if (state.refreshTimer) {
      clearInterval(state.refreshTimer);
      state.refreshTimer = null;
    }
    if (state.streamMode.startsWith("snapshot_")) {
      const interval = state.streamMode === "snapshot_fast" ? 1200 : 3000;
      state.refreshTimer = setInterval(() => {
        if (state.activeTab === "grid") {
          el.cameraGrid.querySelectorAll(".camera-tile").forEach((tile) => {
            const cid = tile.dataset.id;
            const img = tile.querySelector(".tile-image");
            if (img && cid) {
              const next = new Image();
              next.onload = () => {
                img.src = next.src;
              };
              next.src = `api/snapshot/${cid}?_t=${Date.now()}`;
            }
          });
        }
      }, interval);
    }
  }

  // ------------------------------------------------------------------ PTZ Controls
  function setupPtzControls() {
    el.ptzChannelSelect.addEventListener("change", (e) => {
      state.ptzChannel = parseInt(e.target.value, 10);
      updatePtzLiveFeed();
    });

    el.ptzSpeed.addEventListener("input", (e) => {
      state.ptzSpeed = parseInt(e.target.value, 10);
      el.speedValue.textContent = state.ptzSpeed;
    });

    el.dpadBtns.forEach((btn) => {
      const code = btn.dataset.code;
      btn.addEventListener("mousedown", () => triggerPtz(code, "start"));
      btn.addEventListener("mouseup", () => triggerPtz(code, "stop"));
      btn.addEventListener("mouseleave", () => triggerPtz(code, "stop"));
      btn.addEventListener("touchstart", (e) => {
        e.preventDefault();
        triggerPtz(code, "start");
      });
      btn.addEventListener("touchend", () => triggerPtz(code, "stop"));
    });

    el.actionBtns.forEach((btn) => {
      const code = btn.dataset.code;
      btn.addEventListener("mousedown", () => triggerPtz(code, "start"));
      btn.addEventListener("mouseup", () => triggerPtz(code, "stop"));
      btn.addEventListener("mouseleave", () => triggerPtz(code, "stop"));
      btn.addEventListener("touchstart", (e) => {
        e.preventDefault();
        triggerPtz(code, "start");
      });
      btn.addEventListener("touchend", () => triggerPtz(code, "stop"));
    });

    el.presetModeGoto.addEventListener("click", () => {
      state.presetMode = "goto";
      el.presetModeGoto.classList.add("active");
      el.presetModeSet.classList.remove("active");
    });

    el.presetModeSet.addEventListener("click", () => {
      state.presetMode = "set";
      el.presetModeSet.classList.add("active");
      el.presetModeGoto.classList.remove("active");
    });

    renderPresetChips();

    el.ptzSnapshotBtn.addEventListener("click", () => {
      window.open(`api/snapshot/${state.ptzChannel}?download=1`, "_blank");
    });

    el.ptzFullscreenBtn.addEventListener("click", () => {
      if (!document.fullscreenElement) {
        el.ptzViewport.requestFullscreen?.().catch(() => {});
      } else {
        document.exitFullscreen?.().catch(() => {});
      }
    });

    setupDigitalZoomAndPan();
  }

  function updatePtzLiveFeed() {
    const curChannel = state.channels.find((c) => c.id === state.ptzChannel);
    if (el.ptzOsdTitle) {
      el.ptzOsdTitle.textContent = `CH ${state.ptzChannel} · ${(curChannel?.name || "CAMERA").toUpperCase()}`;
    }

    el.ptzLiveImage.src = `api/snapshot/${state.ptzChannel}?_t=${Date.now()}`;
    if (state.streamMode === "mjpeg") {
      setTimeout(() => {
        el.ptzLiveImage.src = `api/mjpeg/${state.ptzChannel}`;
      }, 300);
    }
  }

  async function triggerPtz(code, action) {
    try {
      await safeFetchJson("api/ptz/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: state.ptzChannel,
          code: code,
          action: action,
          speed: state.ptzSpeed,
        }),
      });
    } catch (e) {
      console.error("PTZ command failed:", e);
    }
  }

  function renderPresetChips() {
    let html = "";
    for (let i = 1; i <= 16; i++) {
      html += `<button class="preset-chip" data-preset="${i}">P${i}</button>`;
    }
    el.presetChips.innerHTML = html;

    el.presetChips.querySelectorAll(".preset-chip").forEach((chip) => {
      chip.addEventListener("click", async () => {
        const preset = parseInt(chip.dataset.preset, 10);
        const action = state.presetMode;
        try {
          const res = await safeFetchJson("api/ptz/preset", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              channel: state.ptzChannel,
              preset: preset,
              action: action,
            }),
          });
          if (res.ok && res.data && res.data.ok) {
            chip.style.borderColor = "var(--success)";
            setTimeout(() => (chip.style.borderColor = ""), 1500);
          }
        } catch (e) {
          console.error("Preset command failed:", e);
        }
      });
    });
  }

  function setupDigitalZoomAndPan() {
    let isDragging = false;
    let startX = 0;
    let startY = 0;

    const vp = el.ptzViewport;
    const img = el.ptzLiveImage;

    vp.addEventListener("wheel", (e) => {
      e.preventDefault();
      const z = state.zoomState[state.ptzChannel] || { scale: 1, x: 0, y: 0 };
      const delta = e.deltaY < 0 ? 0.25 : -0.25;
      z.scale = Math.max(1, Math.min(6, z.scale + delta));
      if (z.scale === 1) {
        z.x = 0;
        z.y = 0;
      }
      state.zoomState[state.ptzChannel] = z;
      applyTransform(z);
    });

    vp.addEventListener("mousedown", (e) => {
      const z = state.zoomState[state.ptzChannel];
      if (z && z.scale > 1) {
        isDragging = true;
        startX = e.clientX - z.x;
        startY = e.clientY - z.y;
        vp.style.cursor = "grabbing";
      }
    });

    window.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      const z = state.zoomState[state.ptzChannel];
      if (z) {
        z.x = e.clientX - startX;
        z.y = e.clientY - startY;
        applyTransform(z);
      }
    });

    window.addEventListener("mouseup", () => {
      if (isDragging) {
        isDragging = false;
        vp.style.cursor = "default";
      }
    });

    function applyTransform(z) {
      img.style.transform = `scale(${z.scale}) translate(${z.x / z.scale}px, ${z.y / z.scale}px)`;
      if (el.ptzZoomHud) {
        el.ptzZoomHud.textContent = `${z.scale.toFixed(1)}x`;
        el.ptzZoomHud.style.opacity = z.scale > 1 ? "1" : "0.5";
      }
    }
  }

  // ------------------------------------------------------------------ Playback Controls
  function setupPlaybackControls() {
    el.pbSearchBtn.addEventListener("click", searchRecordings);
    setupTimelineScrubber();
  }

  function setupTimelineScrubber() {
    let isScrubbing = false;

    el.timelineTrack.addEventListener("mousedown", (e) => {
      isScrubbing = true;
      scrubTo(e);
    });

    window.addEventListener("mousemove", (e) => {
      if (isScrubbing) scrubTo(e);
    });

    window.addEventListener("mouseup", () => {
      if (isScrubbing) isScrubbing = false;
    });
  }

  function scrubTo(e) {
    const rect = el.timelineTrack.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const pct = x / rect.width;
    el.timelineNeedle.style.left = `${pct * 100}%`;

    const totalSec = Math.floor(pct * 86400);
    const hrs = String(Math.floor(totalSec / 3600)).padStart(2, "0");
    const mins = String(Math.floor((totalSec % 3600) / 60)).padStart(2, "0");
    const secs = String(totalSec % 60).padStart(2, "0");
    el.needleTooltip.textContent = `${hrs}:${mins}:${secs}`;
  }

  async function searchRecordings() {
    const ch = el.pbChannelSelect.value;
    const date = el.pbDateInput.value;
    if (!date) return;

    el.clipsList.innerHTML = '<div class="spinner"></div>';
    try {
      const res = await safeFetchJson(`api/recordings/search?channel=${ch}&date=${date}`);
      if (res.ok && res.data) {
        state.recordings = res.data.results || [];
        renderTimeline(state.recordings);
        renderClipsList(state.recordings);
      } else {
        el.clipsList.innerHTML = `<div class="empty-clips">No recordings found: ${res.error || "Empty"}</div>`;
      }
    } catch (e) {
      el.clipsList.innerHTML = `<div class="empty-clips">Error searching recordings: ${e.message}</div>`;
    }
  }

  function parseTimeToSec(tStr) {
    const match = tStr.match(/(\d{2}):(\d{2}):(\d{2})/);
    if (match) {
      return parseInt(match[1], 10) * 3600 + parseInt(match[2], 10) * 60 + parseInt(match[3], 10);
    }
    return 0;
  }

  function renderTimeline(clips) {
    el.timelineSegments.innerHTML = clips
      .map((c) => {
        const sSec = parseTimeToSec(c.start_time);
        const eSec = parseTimeToSec(c.end_time);
        const leftPct = (sSec / 86400) * 100;
        const widthPct = Math.max(0.2, ((eSec - sSec) / 86400) * 100);
        return `<div class="timeline-segment ${c.type}" style="left:${leftPct}%; width:${widthPct}%;" title="${c.start_time} - ${c.end_time}"></div>`;
      })
      .join("");
  }

  function renderClipsList(clips) {
    el.clipsCount.textContent = clips.length;
    if (!clips.length) {
      el.clipsList.innerHTML = '<div class="empty-clips">No clips recorded for this date.</div>';
      return;
    }

    el.clipsList.innerHTML = clips
      .map(
        (c, idx) => `
      <div class="clip-item" data-idx="${idx}">
        <div class="clip-head">
          <span class="clip-badge ${c.type}">${c.type.toUpperCase()}</span>
          <span class="clip-duration">${c.duration_sec || 0}s</span>
        </div>
        <div class="clip-time">${c.start_time} — ${c.end_time}</div>
      </div>
    `
      )
      .join("");

    el.clipsList.querySelectorAll(".clip-item").forEach((item) => {
      item.addEventListener("click", () => {
        const idx = parseInt(item.dataset.idx, 10);
        const clip = clips[idx];
        playClip(clip);
      });
    });
  }

  function playClip(clip) {
    if (clip.playback_uri) {
      el.pbPlayerPlaceholder.style.display = "none";
      el.pbVideo.style.display = "block";
      el.pbVideo.src = clip.playback_uri;
      el.pbVideo.play().catch(() => {});
    } else {
      alert(`Clip ${clip.start_time} selected. RTSP direct stream requires HLS/WebRTC proxy.`);
    }
  }

  // ------------------------------------------------------------------ SADP & ONVIF Device Scanner
  function setupDiscoveryControls() {
    if (el.btnRefreshScan) {
      el.btnRefreshScan.addEventListener("click", () => runDeviceDiscovery(true));
    }
    if (el.btnQuickScan) {
      el.btnQuickScan.addEventListener("click", () => {
        switchTab("discover");
        runDeviceDiscovery(true);
      });
    }

    if (el.btnSelectAllDiscover) {
      el.btnSelectAllDiscover.addEventListener("click", () => {
        const devs = getFilteredDiscoveredDevices();
        if (!devs.length) return;
        const allSelected = devs.every((d) => state.selectedDeviceIps.has(d.ip));
        if (allSelected) {
          devs.forEach((d) => state.selectedDeviceIps.delete(d.ip));
        } else {
          devs.forEach((d) => state.selectedDeviceIps.add(d.ip));
        }
        renderDiscoveredDevices();
      });
    }

    if (el.btnBatchAdopt) {
      el.btnBatchAdopt.addEventListener("click", () => {
        openBatchAdoptModal();
      });
    }

    // Filter pills
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

    // Search input
    if (el.discoverSearchInput) {
      el.discoverSearchInput.addEventListener("input", (e) => {
        state.searchQuery = e.target.value.trim().toLowerCase();
        renderDiscoveredDevices();
      });
    }

    // Adoption Modal close & submit
    if (el.btnAdoptModalClose) {
      el.btnAdoptModalClose.addEventListener("click", closeAdoptModal);
    }
    if (el.btnAdoptCancel) {
      el.btnAdoptCancel.addEventListener("click", closeAdoptModal);
    }
    if (el.adoptModal) {
      el.adoptModal.addEventListener("click", (e) => {
        if (e.target === el.adoptModal) closeAdoptModal();
      });
    }
    if (el.adoptForm) {
      el.adoptForm.addEventListener("submit", handleAdoptSubmit);
    }
  }

  function getFilteredDiscoveredDevices() {
    const devs = state.discoveredDevices || [];
    let filtered = devs;
    if (state.filterCategory !== "all") {
      filtered = filtered.filter((d) => {
        if (state.filterCategory === "camera") {
          return d.category === "camera" || d.category === "ptz";
        }
        return d.category === state.filterCategory;
      });
    }

    if (state.searchQuery) {
      filtered = filtered.filter((d) => {
        const q = state.searchQuery;
        return (
          (d.ip && d.ip.toLowerCase().includes(q)) ||
          (d.model && d.model.toLowerCase().includes(q)) ||
          (d.brand && d.brand.toLowerCase().includes(q)) ||
          (d.mac && d.mac.toLowerCase().includes(q)) ||
          (d.category_label && d.category_label.toLowerCase().includes(q))
        );
      });
    }
    return filtered;
  }

  function updateBatchAdoptUi() {
    const count = state.selectedDeviceIps.size;
    if (el.batchCountNum) el.batchCountNum.textContent = count;
    if (el.btnBatchAdopt) {
      el.btnBatchAdopt.style.display = count > 0 ? "inline-flex" : "none";
    }

    const filtered = getFilteredDiscoveredDevices();
    if (el.btnSelectAllDiscover) {
      el.btnSelectAllDiscover.style.display = filtered.length > 0 ? "inline-flex" : "none";
      const allSelected = filtered.length > 0 && filtered.every((d) => state.selectedDeviceIps.has(d.ip));
      el.btnSelectAllDiscover.innerHTML = `<span>${allSelected ? "Deselect All" : "Select All"}</span>`;
    }
  }

  async function runDeviceDiscovery(force = false) {
    if (!el.discoverDeviceList) return;

    el.discoverDeviceList.innerHTML = `
      <div class="scanning-placeholder">
        <div class="radar-scan-anim">
          <div class="radar-circle circle-1"></div>
          <div class="radar-circle circle-2"></div>
          <div class="radar-circle circle-3"></div>
          <div class="radar-sweep"></div>
        </div>
        <p style="color:var(--accent); font-weight:600;">Broadcasting Hikvision SADP &amp; ONVIF Probes...</p>
        <p style="font-size:0.82rem; color:var(--text-secondary); margin-top:4px;">Scanning local subnet (239.255.255.250:37020 &amp; 3702)...</p>
      </div>`;

    if (el.btnRefreshScan) el.btnRefreshScan.disabled = true;

    try {
      const res = await safeFetchJson(`api/discover?refresh=${force ? "1" : "0"}`);
      if (res.ok && res.data && Array.isArray(res.data.devices)) {
        state.discoveredDevices = res.data.devices;
        renderDiscoveredDevices();
      } else {
        el.discoverDeviceList.innerHTML = `
          <div class="empty-state">
            <p style="color:var(--danger);">Discovery failed: ${res.error || "Unknown response"}</p>
          </div>`;
      }
    } catch (err) {
      el.discoverDeviceList.innerHTML = `
        <div class="empty-state">
          <p style="color:var(--danger);">Error scanning network: ${err.message}</p>
        </div>`;
    } finally {
      if (el.btnRefreshScan) el.btnRefreshScan.disabled = false;
    }
  }

  function renderDiscoveredDevices() {
    if (!el.discoverDeviceList) return;

    const devs = state.discoveredDevices || [];

    // Update pill count badges
    const counts = {
      all: devs.length,
      nvr: devs.filter((d) => d.category === "nvr").length,
      camera: devs.filter((d) => d.category === "camera" || d.category === "ptz").length,
      door_station: devs.filter((d) => d.category === "door_station").length,
      indoor_station: devs.filter((d) => d.category === "indoor_station").length,
    };

    if (el.badgeCountAll) el.badgeCountAll.textContent = counts.all;
    if (el.badgeCountNvr) el.badgeCountNvr.textContent = counts.nvr;
    if (el.badgeCountCam) el.badgeCountCam.textContent = counts.camera;
    if (el.badgeCountDoor) el.badgeCountDoor.textContent = counts.door_station;
    if (el.badgeCountIndoor) el.badgeCountIndoor.textContent = counts.indoor_station;

    const filtered = getFilteredDiscoveredDevices();
    updateBatchAdoptUi();

    if (!filtered.length) {
      el.discoverDeviceList.innerHTML = `
        <div class="empty-state">
          <div style="font-size:2.5rem; margin-bottom:10px;">🔍</div>
          <p>No devices matching filter criteria.</p>
        </div>`;
      return;
    }

    el.discoverDeviceList.innerHTML = filtered
      .map((dev) => {
        const catIcons = {
          door_station: "🚪",
          indoor_station: "📺",
          nvr: "📼",
          camera: "📷",
          ptz: "🎥",
        };
        const icon = catIcons[dev.category] || "📹";
        const brandPillClass =
          dev.brand === "Hikvision"
            ? "badge cyber"
            : dev.brand === "Dahua"
            ? "badge warning"
            : "badge neutral";

        const isSelected = state.selectedDeviceIps.has(dev.ip);

        return `
          <div class="device-card ${isSelected ? 'selected' : ''}" data-ip="${escapeHtml(dev.ip)}">
            <div class="device-card-header">
              <div style="display:flex; align-items:center;">
                <label class="device-select-cb-wrap" title="Select device for batch adopt">
                  <input type="checkbox" class="device-select-cb" data-ip="${escapeHtml(dev.ip)}" ${isSelected ? 'checked' : ''} />
                </label>
                <div class="device-icon-type">
                  <div class="device-cat-icon">${icon}</div>
                  <div class="device-title-block">
                    <b>${escapeHtml(dev.model || "Unknown Model")}</b>
                    <span>${escapeHtml(dev.category_label || "Network Device")}</span>
                  </div>
                </div>
              </div>
              <div class="device-badge-group">
                <span class="${brandPillClass}">${escapeHtml(dev.brand)}</span>
                <span class="badge ${dev.activated ? 'success' : 'warning'}">${dev.activated ? '● Activated' : '○ Inactive'}</span>
              </div>
            </div>

            <div class="device-details-table">
              <div class="detail-item">
                <span>IP Address</span>
                <b>${escapeHtml(dev.ip)}:${dev.http_port || 80}</b>
              </div>
              <div class="detail-item">
                <span>MAC Address</span>
                <b>${escapeHtml(dev.mac || "N/A")}</b>
              </div>
              <div class="detail-item">
                <span>RTSP / SDK</span>
                <b>${dev.rtsp_port || 554} / ${dev.sdk_port || 8000}</b>
              </div>
              <div class="detail-item">
                <span>Protocol</span>
                <b style="color:var(--accent);">${escapeHtml(dev.protocol || "SADP")}</b>
              </div>
            </div>

            <div class="device-card-actions">
              <button class="primary-btn btn-adopt-device" data-ip="${escapeHtml(dev.ip)}">
                ⚡ Adopt Device
              </button>
              <a href="http://${escapeHtml(dev.ip)}:${dev.http_port || 80}" target="_blank" class="secondary-btn" title="Open Device Web GUI">
                🌐 Web GUI
              </a>
            </div>
          </div>
        `;
      })
      .join("");

    // Bind selection checkboxes
    el.discoverDeviceList.querySelectorAll(".device-select-cb").forEach((cb) => {
      cb.addEventListener("change", (e) => {
        const ip = cb.dataset.ip;
        if (cb.checked) {
          state.selectedDeviceIps.add(ip);
        } else {
          state.selectedDeviceIps.delete(ip);
        }
        const card = cb.closest(".device-card");
        if (card) card.classList.toggle("selected", cb.checked);
        updateBatchAdoptUi();
      });
    });

    // Bind Adopt buttons
    el.discoverDeviceList.querySelectorAll(".btn-adopt-device").forEach((btn) => {
      btn.addEventListener("click", () => {
        const ip = btn.dataset.ip;
        const dev = state.discoveredDevices.find((d) => d.ip === ip);
        if (dev) {
          openAdoptModal(dev);
        }
      });
    });
  }

  function openAdoptModal(dev) {
    state.batchAdopting = false;
    state.selectedAdoptingDevice = dev;
    if (el.adoptModalTitle) {
      el.adoptModalTitle.textContent = `Adopt ${dev.model} (${dev.ip})`;
    }
    if (el.adoptSummary) {
      el.adoptSummary.innerHTML = `
        <div style="font-weight:700; color:var(--accent); margin-bottom:4px;">${escapeHtml(dev.brand)} ${escapeHtml(dev.model)}</div>
        <div style="font-size:0.8rem; color:var(--text-secondary);">
          IP: <b>${escapeHtml(dev.ip)}</b> · HTTP: <b>${dev.http_port || 80}</b> · RTSP: <b>${dev.rtsp_port || 554}</b> · Category: <b>${escapeHtml(dev.category_label)}</b>
        </div>
      `;
    }
    const btnSubmit = document.getElementById("btnAdoptSubmit");
    if (btnSubmit) btnSubmit.textContent = "Adopt & Connect Stream";
    if (el.adoptUsername) el.adoptUsername.value = "admin";
    if (el.adoptPassword) el.adoptPassword.value = "";
    if (el.adoptFeedback) el.adoptFeedback.textContent = "";
    if (el.adoptModal) el.adoptModal.style.display = "flex";
  }

  function openBatchAdoptModal() {
    state.batchAdopting = true;
    state.selectedAdoptingDevice = null;
    const selectedList = state.discoveredDevices.filter((d) => state.selectedDeviceIps.has(d.ip));
    if (!selectedList.length) return;

    if (el.adoptModalTitle) {
      el.adoptModalTitle.textContent = `Adopt ${selectedList.length} Selected Surveillance Units`;
    }

    if (el.adoptSummary) {
      el.adoptSummary.innerHTML = `
        <div style="font-weight:700; color:var(--accent); margin-bottom:8px;">Adopting ${selectedList.length} Devices in Parallel:</div>
        <div style="max-height:140px; overflow-y:auto; display:grid; gap:4px; font-size:0.8rem;">
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
          Enter the common credentials for these devices below. All selected streams will be aggregated into the Live Wall.
        </div>
      `;
    }

    const btnSubmit = document.getElementById("btnAdoptSubmit");
    if (btnSubmit) btnSubmit.textContent = `Adopt All ${selectedList.length} Devices`;
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
    el.adoptFeedback.innerHTML = '<span style="color:var(--accent);">Configuring surveillance units and connecting streams...</span>';

    let payload = {};
    if (state.batchAdopting) {
      const selectedList = state.discoveredDevices.filter((d) => state.selectedDeviceIps.has(d.ip));
      payload = {
        devices: selectedList.map((d) => ({
          ip: d.ip,
          brand: (d.brand || "auto").toLowerCase(),
          model: d.model || "",
          category: d.category || "camera",
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
        category: dev.category || "camera",
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
      el.adoptFeedback.innerHTML = '<span style="color:var(--success);">✓ Devices adopted successfully! Syncing Live Wall...</span>';
      setTimeout(async () => {
        closeAdoptModal();
        await checkStatus();
        await loadChannels();
        await loadConfiguredDevices();
        switchTab("grid");
      }, 900);
    } else {
      el.adoptFeedback.innerHTML = `<span style="color:var(--danger);">${res.error || (res.data && res.data.error) || "Adoption failed"}</span>`;
    }

    if (btnSubmit) {
      btnSubmit.disabled = false;
      btnSubmit.textContent = "Adopt & Connect Stream";
    }
  }

  // ------------------------------------------------------------------ Settings & Devices Manager
  async function loadConfiguredDevices() {
    if (!el.configuredDevicesList) return;
    try {
      const res = await safeFetchJson("api/devices");
      if (res.ok && res.data && Array.isArray(res.data.devices)) {
        state.configuredDevices = res.data.devices;
        renderConfiguredDevices();
      }
    } catch (e) {
      console.error("Failed to load devices list:", e);
    }
  }

  function renderConfiguredDevices() {
    if (!el.configuredDevicesList) return;
    const devs = state.configuredDevices || [];
    if (!devs.length) {
      el.configuredDevicesList.innerHTML = `
        <div class="empty-hint">
          No hardware units configured yet. Use the <b>SADP Scanner</b> above or click <b>"+ Add Device Manually"</b>.
        </div>`;
      return;
    }

    el.configuredDevicesList.innerHTML = devs
      .map((d) => {
        const isNvr = d.device_type === "nvr";
        const icon = isNvr ? "📼" : "📷";
        const brandPillClass =
          d.brand === "hikvision" ? "badge cyber" : d.brand === "dahua" ? "badge warning" : "badge neutral";
        return `
          <div class="configured-device-item" data-id="${escapeHtml(d.id)}">
            <div class="dev-item-info">
              <div class="dev-item-icon">${icon}</div>
              <div class="dev-item-details">
                <b>${escapeHtml(d.name || "Surveillance Unit")}</b>
                <span>${escapeHtml(d.host)}:${d.http_port || 80} · RTSP ${d.rtsp_port || 554} · ${d.channels_count || 1} Channel(s)</span>
              </div>
            </div>
            <div class="dev-item-actions">
              <span class="${brandPillClass}">${escapeHtml((d.brand || "auto").toUpperCase())}</span>
              <span class="badge ${d.online ? 'success' : 'danger'}">${d.online ? '● Online' : '○ Offline'}</span>
              <button class="secondary-btn btn-edit-device" data-id="${escapeHtml(d.id)}" style="padding:4px 8px; font-size:0.75rem;">Edit</button>
              <button class="secondary-btn btn-delete-device" data-id="${escapeHtml(d.id)}" style="padding:4px 8px; font-size:0.75rem; color:var(--danger);">Delete</button>
            </div>
          </div>
        `;
      })
      .join("");

    el.configuredDevicesList.querySelectorAll(".btn-edit-device").forEach((btn) => {
      btn.addEventListener("click", () => {
        const devId = btn.dataset.id;
        const dev = state.configuredDevices.find((d) => d.id === devId);
        if (dev) openManualDeviceModal(dev);
      });
    });

    el.configuredDevicesList.querySelectorAll(".btn-delete-device").forEach((btn) => {
      btn.addEventListener("click", () => {
        const devId = btn.dataset.id;
        handleDeleteDevice(devId);
      });
    });
  }

  function openManualDeviceModal(dev = null) {
    if (el.manualDeviceForm) el.manualDeviceForm.reset();
    if (el.manualDevFeedback) el.manualDevFeedback.textContent = "";

    if (dev) {
      if (el.manualDeviceModalTitle) el.manualDeviceModalTitle.textContent = `Edit Device: ${dev.name || dev.host}`;
      if (el.manualDevId) el.manualDevId.value = dev.id || "";
      if (el.manualDevName) el.manualDevName.value = dev.name || "";
      if (el.manualDevHost) el.manualDevHost.value = dev.host || "";
      if (el.manualDevBrand) el.manualDevBrand.value = dev.brand || "auto";
      if (el.manualDevType) el.manualDevType.value = dev.device_type || "camera";
      if (el.manualDevHttpPort) el.manualDevHttpPort.value = dev.http_port || 80;
      if (el.manualDevRtspPort) el.manualDevRtspPort.value = dev.rtsp_port || 554;
      if (el.manualDevUsername) el.manualDevUsername.value = dev.username || "admin";
      if (el.manualDevPassword) el.manualDevPassword.value = dev.has_password ? "••••••••" : "";
    } else {
      if (el.manualDeviceModalTitle) el.manualDeviceModalTitle.textContent = "Add Surveillance Device";
      if (el.manualDevId) el.manualDevId.value = "";
      if (el.manualDevHttpPort) el.manualDevHttpPort.value = 80;
      if (el.manualDevRtspPort) el.manualDevRtspPort.value = 554;
      if (el.manualDevUsername) el.manualDevUsername.value = "admin";
    }

    if (el.manualDeviceModal) el.manualDeviceModal.style.display = "flex";
  }

  function closeManualDeviceModal() {
    if (el.manualDeviceModal) el.manualDeviceModal.style.display = "none";
  }

  async function handleManualDeviceSubmit(e) {
    e.preventDefault();
    const payload = {
      id: el.manualDevId.value.trim() || undefined,
      name: el.manualDevName.value.trim(),
      host: el.manualDevHost.value.trim(),
      brand: el.manualDevBrand.value,
      device_type: el.manualDevType.value,
      http_port: parseInt(el.manualDevHttpPort.value, 10) || 80,
      rtsp_port: parseInt(el.manualDevRtspPort.value, 10) || 554,
      username: el.manualDevUsername.value.trim() || "admin",
      password: el.manualDevPassword.value,
    };

    if (el.manualDevFeedback) {
      el.manualDevFeedback.innerHTML = '<span style="color:var(--accent);">Validating and connecting device...</span>';
    }

    const res = await safeFetchJson("api/devices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok && res.data && res.data.ok) {
      if (el.manualDevFeedback) {
        el.manualDevFeedback.innerHTML = '<span style="color:var(--success);">✓ Device saved successfully!</span>';
      }
      setTimeout(async () => {
        closeManualDeviceModal();
        await loadConfiguredDevices();
        await checkStatus();
        await loadChannels();
      }, 700);
    } else {
      if (el.manualDevFeedback) {
        el.manualDevFeedback.innerHTML = `<span style="color:var(--danger);">${res.error || "Failed to save device"}</span>`;
      }
    }
  }

  async function handleDeleteDevice(devId) {
    if (!confirm("Are you sure you want to remove this surveillance device from CCTV Studio?")) return;
    const res = await safeFetchJson("api/devices/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: devId }),
    });
    if (res.ok && res.data && res.data.ok) {
      await loadConfiguredDevices();
      await checkStatus();
      await loadChannels();
    } else {
      alert(`Could not remove device: ${res.error || "Unknown error"}`);
    }
  }

  async function loadSettings() {
    await loadConfiguredDevices();
    try {
      const res = await safeFetchJson("api/config");
      if (!res.ok || !res.data) return;
      const cfg = res.data;
      if (el.cfgBrand) el.cfgBrand.value = cfg.nvr_brand || "auto";
      if (el.cfgHost) el.cfgHost.value = cfg.host || "";
      if (el.cfgHttpPort) el.cfgHttpPort.value = cfg.http_port || 80;
      if (el.cfgRtspPort) el.cfgRtspPort.value = cfg.rtsp_port || 554;
      if (el.cfgUsername) el.cfgUsername.value = cfg.username || "admin";
      if (el.cfgStreamQuality) el.cfgStreamQuality.value = cfg.stream_quality || "sub";
    } catch (e) {
      console.error("Failed to load settings:", e);
    }
  }

  function setupSettings() {
    if (el.btnAddManualDevice) {
      el.btnAddManualDevice.addEventListener("click", () => openManualDeviceModal());
    }
    if (el.btnManualDeviceModalClose) {
      el.btnManualDeviceModalClose.addEventListener("click", closeManualDeviceModal);
    }
    if (el.btnManualDeviceCancel) {
      el.btnManualDeviceCancel.addEventListener("click", closeManualDeviceModal);
    }
    if (el.manualDeviceModal) {
      el.manualDeviceModal.addEventListener("click", (e) => {
        if (e.target === el.manualDeviceModal) closeManualDeviceModal();
      });
    }
    if (el.manualDeviceForm) {
      el.manualDeviceForm.addEventListener("submit", handleManualDeviceSubmit);
    }

    el.themeChips.forEach((chip) => {
      chip.addEventListener("click", () => {
        const t = chip.dataset.themeVal;
        applyTheme(t, state.customColor, state.oledMode);
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
        nvr_brand: el.cfgBrand.value,
        host: el.cfgHost.value.trim(),
        http_port: parseInt(el.cfgHttpPort.value, 10),
        rtsp_port: parseInt(el.cfgRtspPort.value, 10),
        username: el.cfgUsername.value.trim(),
        stream_quality: el.cfgStreamQuality.value,
      };
      if (el.cfgPassword.value) {
        payload.password = el.cfgPassword.value;
      }

      el.settingsFeedback.innerHTML = '<span style="color:var(--accent);">Connecting &amp; saving...</span>';
      try {
        const res = await safeFetchJson("api/config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok && res.data && res.data.ok) {
          el.settingsFeedback.innerHTML =
            '<span style="color:var(--success);">✓ Connected and saved successfully!</span>';
          await checkStatus();
          await loadChannels();
          await loadConfiguredDevices();
          setTimeout(() => switchTab("grid"), 1200);
        } else {
          el.settingsFeedback.innerHTML = `<span style="color:var(--danger);">${res.error || (res.data && res.data.error) || "Save failed"}</span>`;
        }
      } catch (err) {
        el.settingsFeedback.innerHTML = `<span style="color:var(--danger);">${err.message}</span>`;
      }
    });

    el.btnTestConn.addEventListener("click", async () => {
      el.settingsFeedback.innerHTML =
        '<span style="color:var(--accent);">Probing NVR at ' + el.cfgHost.value + "...</span>";
      try {
        const res = await safeFetchJson("api/status");
        if (res.ok && res.data && res.data.configured) {
          const d = res.data;
          el.settingsFeedback.innerHTML = `<span style="color:var(--success);">✓ Surveillance Online! ${d.devices_count || 1} Device(s), ${d.channels_count} Channel(s)</span>`;
        } else {
          el.settingsFeedback.innerHTML = `<span style="color:var(--warning);">Surveillance status: ${res.error || (res.data && res.data.message) || "Not connected"}</span>`;
        }
      } catch (err) {
        el.settingsFeedback.innerHTML = `<span style="color:var(--danger);">Connection failed: ${err.message}</span>`;
      }
    });
  }

  // ------------------------------------------------------------------ Keyboard Shortcuts
  function setupKeyboardShortcuts() {
    window.addEventListener("keydown", (e) => {
      if (["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)) return;

      if (e.key === "1") switchTab("grid");
      if (e.key === "2") switchTab("ptz");
      if (e.key === "3") switchTab("playback");
      if (e.key === "4") switchTab("discover");
      if (e.key === "5") switchTab("settings");

      // PTZ arrow keys
      if (state.activeTab === "ptz") {
        if (e.key === "ArrowUp") triggerPtz("Up", "start");
        if (e.key === "ArrowDown") triggerPtz("Down", "start");
        if (e.key === "ArrowLeft") triggerPtz("Left", "start");
        if (e.key === "ArrowRight") triggerPtz("Right", "start");
        if (e.key === "+" || e.key === "=") triggerPtz("ZoomIn", "start");
        if (e.key === "-" || e.key === "_") triggerPtz("ZoomOut", "start");
      }
    });

    window.addEventListener("keyup", (e) => {
      if (["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)) return;
      if (state.activeTab === "ptz") {
        if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "+", "=", "-", "_"].includes(e.key)) {
          triggerPtz("Stop", "stop");
        }
      }
    });
  }

  // ------------------------------------------------------------------ Clock
  function startClock() {
    updateClock();
    state.clockTimer = setInterval(updateClock, 1000);
  }

  function updateClock() {
    const now = new Date();
    const str = now.toTimeString().split(" ")[0];
    if (el.ptzOsdClock) el.ptzOsdClock.textContent = str;
    document.querySelectorAll(".live-clock").forEach((c) => (c.textContent = str));
  }

  // Start on load
  window.addEventListener("DOMContentLoaded", init);
})();
