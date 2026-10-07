/**
 * AJ Netweb CCTV & NVR Studio - Advanced Client Controller
 * Live Camera Wall, Digital Zoom & Pan, Virtual Joystick, Color Theme Engine, and NVR Playback Timeline
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
    streamMode: "mjpeg", // mjpeg | snapshot_fast | snapshot_slow
    ptzChannel: 1,
    ptzSpeed: 5,
    presetMode: "goto", // goto | set
    recordings: [],
    refreshTimer: null,
    clockTimer: null,
    // Theme
    theme: localStorage.getItem("ajn_cctv_theme") || "cyan",
    customColor: localStorage.getItem("ajn_cctv_custom_color") || "#00e5ff",
    oledMode: localStorage.getItem("ajn_cctv_oled") === "true",
    // Digital Zoom maps per channel: { [cid]: { scale: 1, x: 0, y: 0 } }
    zoomState: {},
  };

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
  };

  // ------------------------------------------------------------------ Initialization
  async function init() {
    applyTheme(state.theme, state.customColor, state.oledMode);
    setupNavigation();
    setupGridControls();
    setupPtzControls();
    setupPlaybackControls();
    setupSettings();
    setupKeyboardShortcuts();
    startClock();

    // Default playback date to today
    const today = new Date().toISOString().split("T")[0];
    if (el.pbDateInput) el.pbDateInput.value = today;

    // Render presets 1 to 16
    renderPresetChips();

    // Fetch initial status and channels
    await checkStatus();
    await loadChannels();
    startStreamLoop();
  }

  // ------------------------------------------------------------------ Theme Engine
  function applyTheme(themeName, customHex, isOled) {
    state.theme = themeName;
    state.customColor = customHex || state.customColor;
    state.oledMode = isOled;

    localStorage.setItem("ajn_cctv_theme", themeName);
    localStorage.setItem("ajn_cctv_custom_color", state.customColor);
    localStorage.setItem("ajn_cctv_oled", isOled ? "true" : "false");

    document.documentElement.setAttribute("data-theme", themeName);
    document.documentElement.setAttribute("data-oled", isOled ? "true" : "false");

    if (themeName === "custom" && customHex) {
      document.documentElement.style.setProperty("--accent", customHex);
      document.documentElement.style.setProperty("--accent-hover", adjustBrightness(customHex, -15));
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

  function adjustBrightness(hex, percent) {
    const num = parseInt(hex.replace("#", ""), 16);
    const amt = Math.round(2.55 * percent);
    const R = (num >> 16) + amt;
    const G = ((num >> 8) & 0x00ff) + amt;
    const B = (num & 0x0000ff) + amt;
    return (
      "#" +
      (
        0x1000000 +
        (R < 255 ? (R < 1 ? 0 : R) : 255) * 0x10000 +
        (G < 255 ? (G < 1 ? 0 : G) : 255) * 0x100 +
        (B < 255 ? (B < 1 ? 0 : B) : 255)
      )
        .toString(16)
        .slice(1)
    );
  }

  // ------------------------------------------------------------------ Live Clock
  function startClock() {
    const updateTime = () => {
      const now = new Date();
      const timeStr = now.toLocaleTimeString("en-GB");
      const dateStr = now.toLocaleDateString("en-GB");
      const fullStr = `${dateStr} ${timeStr}`;

      if (el.ptzOsdClock) el.ptzOsdClock.textContent = fullStr;
      document.querySelectorAll(".tile-osd-clock").forEach((span) => {
        span.textContent = fullStr;
      });
    };
    updateTime();
    state.clockTimer = setInterval(updateTime, 1000);
  }

  // ------------------------------------------------------------------ Navigation
  function setupNavigation() {
    el.navBtns.forEach((btn) => {
      btn.addEventListener("click", () => switchTab(btn.dataset.tab));
    });

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
    }
  }

  function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  // ------------------------------------------------------------------ Status & Channels
  async function checkStatus() {
    try {
      const res = await fetch("api/status");
      const data = await res.json();
      state.configured = data.configured;
      state.brand = data.brand || "auto";

      if (!data.configured) {
        el.nvrBrandBadge.textContent = "Not Configured";
        el.nvrBrandBadge.className = "badge warning";
        el.nvrSubTitle.textContent = "Please configure your NVR IP & credentials in Settings";
        switchTab("settings");
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

  async function loadChannels() {
    try {
      const res = await fetch("api/channels");
      const list = await res.json();
      if (Array.isArray(list) && list.length > 0) {
        state.channels = list;
        renderGrid();
        populateChannelDropdowns();
      } else if (!state.configured) {
        el.cameraGrid.innerHTML = `
          <div class="empty-state">
            <p>NVR is not configured yet. Open the <b>Settings</b> tab to connect your NVR.</p>
          </div>`;
      }
    } catch (e) {
      console.error("Failed to load channels:", e);
    }
  }

  function populateChannelDropdowns() {
    const opts = state.channels.map((c) => `<option value="${c.id}">${c.name} (CH ${c.id})</option>`).join("");
    if (el.ptzChannelSelect) {
      el.ptzChannelSelect.innerHTML = opts;
      el.ptzChannelSelect.value = state.ptzChannel;
    }
    if (el.pbChannelSelect) {
      el.pbChannelSelect.innerHTML = opts;
      el.pbChannelSelect.value = state.channels[0]?.id || 1;
    }
  }

  // ------------------------------------------------------------------ Grid View
  function setupGridControls() {
    el.gridBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const cols = parseInt(btn.dataset.cols, 10);
        state.gridCols = cols;
        el.gridBtns.forEach((b) => b.classList.toggle("active", b === btn));
        el.cameraGrid.className = `camera-grid cols-${cols}`;
      });
    });

    el.streamModeSelect.addEventListener("change", (e) => {
      state.streamMode = e.target.value;
      restartStreamLoop();
    });
  }

  function renderGrid() {
    if (!state.channels.length) return;
    el.cameraGrid.innerHTML = state.channels
      .map(
        (ch) => `
      <div class="camera-tile" data-id="${ch.id}">
        <div class="tile-header">
          <div class="tile-title">
            <span class="rec-dot" title="Live Recording"></span>
            <span>${ch.name}</span>
          </div>
          <div class="tile-actions">
            <button class="icon-btn btn-snapshot" data-id="${ch.id}" title="Save Instant Screenshot">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"></path>
              </svg>
            </button>
            <button class="icon-btn btn-focus-ptz" data-id="${ch.id}" title="Control PTZ Joystick">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <path d="M12 2v4M12 18v4M2 12h4M18 12h4"></path>
              </svg>
            </button>
            <button class="icon-btn btn-fullscreen" data-id="${ch.id}" title="Toggle Fullscreen">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>
              </svg>
            </button>
          </div>
        </div>
        <div class="tile-feed" data-id="${ch.id}">
          <div class="feed-osd">
            <span>CH ${ch.id} · ${ch.name.toUpperCase()}</span>
            <span class="tile-osd-clock">--:--:--</span>
          </div>
          <div class="zoom-hud" id="zoomHud_${ch.id}">1.0x</div>
          <img id="gridImg_${ch.id}" src="${getImageSrc(ch.id)}" alt="${ch.name}" loading="lazy">
        </div>
      </div>
    `,
      )
      .join("");

    // Bindings
    el.cameraGrid.querySelectorAll(".tile-feed").forEach((feed) => {
      const cid = parseInt(feed.dataset.id, 10);
      setupDigitalZoom(feed, document.getElementById(`gridImg_${cid}`), document.getElementById(`zoomHud_${cid}`), cid);

      feed.addEventListener("dblclick", () => {
        state.ptzChannel = cid;
        if (el.ptzChannelSelect) el.ptzChannelSelect.value = cid;
        switchTab("ptz");
      });
    });

    el.cameraGrid.querySelectorAll(".btn-snapshot").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const cid = parseInt(btn.dataset.id, 10);
        downloadSnapshot(cid);
      });
    });

    el.cameraGrid.querySelectorAll(".btn-focus-ptz").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const cid = parseInt(btn.dataset.id, 10);
        state.ptzChannel = cid;
        if (el.ptzChannelSelect) el.ptzChannelSelect.value = cid;
        switchTab("ptz");
      });
    });

    el.cameraGrid.querySelectorAll(".btn-fullscreen").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const cid = parseInt(btn.dataset.id, 10);
        const tile = el.cameraGrid.querySelector(`.camera-tile[data-id="${cid}"]`);
        if (tile && tile.requestFullscreen) {
          tile.requestFullscreen();
        }
      });
    });
  }

  function downloadSnapshot(cid) {
    const link = document.createElement("a");
    link.href = `api/snapshot/${cid}?download=1&_t=${Date.now()}`;
    link.download = `Camera_${cid}_${Date.now()}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // ------------------------------------------------------------------ Digital Zoom & Pan Engine
  function setupDigitalZoom(container, imgElement, hudElement, idKey) {
    if (!state.zoomState[idKey]) {
      state.zoomState[idKey] = { scale: 1, x: 0, y: 0 };
    }
    const z = state.zoomState[idKey];
    let isPanning = false;
    let startX = 0;
    let startY = 0;

    const applyTransform = () => {
      imgElement.style.transform = `scale(${z.scale}) translate(${z.x / z.scale}px, ${z.y / z.scale}px)`;
      if (hudElement) {
        if (z.scale > 1.05) {
          hudElement.style.display = "block";
          hudElement.textContent = `${z.scale.toFixed(1)}x ZOOM (Double-click to reset)`;
        } else {
          hudElement.style.display = "none";
        }
      }
    };

    container.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.25 : 0.25;
        z.scale = Math.max(1, Math.min(z.scale + delta, 5));
        if (z.scale === 1) {
          z.x = 0;
          z.y = 0;
        }
        applyTransform();
      },
      { passive: false },
    );

    container.addEventListener("mousedown", (e) => {
      if (z.scale > 1.05) {
        isPanning = true;
        startX = e.clientX - z.x;
        startY = e.clientY - z.y;
      }
    });

    window.addEventListener("mousemove", (e) => {
      if (isPanning) {
        z.x = e.clientX - startX;
        z.y = e.clientY - startY;
        applyTransform();
      }
    });

    window.addEventListener("mouseup", () => {
      isPanning = false;
    });

    // Double-click to reset zoom
    container.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      z.scale = 1;
      z.x = 0;
      z.y = 0;
      applyTransform();
    });
  }

  function getImageSrc(chId) {
    if (state.streamMode === "mjpeg") {
      return `api/mjpeg/${chId}`;
    }
    return `api/snapshot/${chId}?_t=${Date.now()}`;
  }

  function startStreamLoop() {
    if (state.streamMode === "mjpeg") return;

    const interval = state.streamMode === "snapshot_fast" ? 1000 : 3000;
    state.refreshTimer = setInterval(() => {
      if (state.activeTab === "grid") {
        state.channels.forEach((ch) => {
          const img = document.getElementById(`gridImg_${ch.id}`);
          if (img) img.src = `api/snapshot/${ch.id}?_t=${Date.now()}`;
        });
      } else if (state.activeTab === "ptz") {
        updatePtzLiveFeed();
      }
    }, interval);
  }

  function restartStreamLoop() {
    if (state.refreshTimer) clearInterval(state.refreshTimer);
    if (state.streamMode === "mjpeg") {
      state.channels.forEach((ch) => {
        const img = document.getElementById(`gridImg_${ch.id}`);
        if (img) img.src = `api/mjpeg/${ch.id}`;
      });
      updatePtzLiveFeed();
    } else {
      startStreamLoop();
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

    const bindPtzButton = (button, code) => {
      const start = (e) => {
        e.preventDefault();
        button.classList.add("pressed");
        triggerPtz(code, "start");
      };
      const stop = (e) => {
        e.preventDefault();
        button.classList.remove("pressed");
        triggerPtz(code, "stop");
      };

      button.addEventListener("mousedown", start);
      button.addEventListener("mouseup", stop);
      button.addEventListener("mouseleave", stop);
      button.addEventListener("touchstart", start, { passive: false });
      button.addEventListener("touchend", stop, { passive: false });
      button.addEventListener("touchcancel", stop, { passive: false });
    };

    el.dpadBtns.forEach((btn) => {
      const code = btn.dataset.code;
      if (code === "Stop") {
        btn.addEventListener("click", () => triggerPtz("Stop", "stop"));
      } else {
        bindPtzButton(btn, code);
      }
    });

    el.actionBtns.forEach((btn) => {
      bindPtzButton(btn, btn.dataset.code);
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

    el.ptzFullscreenBtn.addEventListener("click", () => {
      const container = document.querySelector(".ptz-feed-container");
      if (container && container.requestFullscreen) {
        container.requestFullscreen();
      }
    });

    el.ptzSnapshotBtn.addEventListener("click", () => {
      downloadSnapshot(state.ptzChannel);
    });

    // Digital Zoom on PTZ Viewport
    setupDigitalZoom(el.ptzViewport, el.ptzLiveImage, el.ptzZoomHud, "ptz");

    // Drag-to-steer overlay
    setupViewportDrag();
  }

  function updatePtzLiveFeed() {
    if (!el.ptzLiveImage) return;
    const curChannel = state.channels.find((c) => c.id === state.ptzChannel);
    if (el.ptzOsdTitle) {
      el.ptzOsdTitle.textContent = `CH ${state.ptzChannel} · ${(curChannel?.name || "CAMERA").toUpperCase()}`;
    }

    if (state.streamMode === "mjpeg") {
      el.ptzLiveImage.src = `api/mjpeg/${state.ptzChannel}`;
    } else {
      el.ptzLiveImage.src = `api/snapshot/${state.ptzChannel}?_t=${Date.now()}`;
    }
  }

  async function triggerPtz(code, action) {
    try {
      await fetch("api/ptz/control", {
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
          const res = await fetch("api/ptz/preset", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              channel: state.ptzChannel,
              preset: preset,
              action: action,
            }),
          });
          const d = await res.json();
          if (d.ok) {
            chip.style.borderColor = "var(--success)";
            setTimeout(() => (chip.style.borderColor = ""), 1500);
          }
        } catch (e) {
          console.error("Preset command failed:", e);
        }
      });
    });
  }

  function setupViewportDrag() {
    let startX = 0;
    let startY = 0;
    let dragging = false;

    const onStart = (x, y) => {
      // Only drag if not digitally zoomed in
      if ((state.zoomState["ptz"]?.scale || 1) > 1.05) return;
      startX = x;
      startY = y;
      dragging = true;
    };

    const onMove = (x, y) => {
      if (!dragging) return;
      const dx = x - startX;
      const dy = y - startY;
      const threshold = 35;

      if (Math.abs(dx) > threshold || Math.abs(dy) > threshold) {
        let code = "";
        if (Math.abs(dx) > Math.abs(dy)) {
          code = dx > 0 ? "Right" : "Left";
        } else {
          code = dy > 0 ? "Down" : "Up";
        }
        triggerPtz(code, "start");
        startX = x;
        startY = y;
      }
    };

    const onEnd = () => {
      if (dragging) {
        dragging = false;
        triggerPtz("Stop", "stop");
      }
    };

    el.ptzOverlay.addEventListener("mousedown", (e) => onStart(e.clientX, e.clientY));
    window.addEventListener("mousemove", (e) => onMove(e.clientX, e.clientY));
    window.addEventListener("mouseup", onEnd);

    el.ptzOverlay.addEventListener("touchstart", (e) => {
      if (e.touches.length > 0) onStart(e.touches[0].clientX, e.touches[0].clientY);
    });
    window.addEventListener("touchmove", (e) => {
      if (e.touches.length > 0) onMove(e.touches[0].clientX, e.touches[0].clientY);
    });
    window.addEventListener("touchend", onEnd);
  }

  // ------------------------------------------------------------------ Keyboard Shortcuts
  function setupKeyboardShortcuts() {
    window.addEventListener("keydown", (e) => {
      // Ignore if typing inside input/select
      if (["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)) return;

      if (state.activeTab === "ptz") {
        let code = null;
        if (e.key === "ArrowUp") code = "Up";
        else if (e.key === "ArrowDown") code = "Down";
        else if (e.key === "ArrowLeft") code = "Left";
        else if (e.key === "ArrowRight") code = "Right";
        else if (e.key === "+" || e.key === "=") code = "ZoomIn";
        else if (e.key === "-") code = "ZoomOut";
        else if (e.key === " ") code = "Stop";

        if (code) {
          e.preventDefault();
          if (code === "Stop") {
            triggerPtz("Stop", "stop");
          } else {
            triggerPtz(code, "start");
          }
        }
      }
    });

    window.addEventListener("keyup", (e) => {
      if (state.activeTab === "ptz") {
        if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "+", "=", "-"].includes(e.key)) {
          triggerPtz("Stop", "stop");
        }
      }
    });
  }

  // ------------------------------------------------------------------ Playback
  function setupPlaybackControls() {
    el.pbSearchBtn.addEventListener("click", searchRecordings);

    el.timelineTrack.addEventListener("mousemove", (e) => {
      const rect = el.timelineTrack.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      updateNeedle(pct);
    });

    el.timelineTrack.addEventListener("click", (e) => {
      const rect = el.timelineTrack.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      jumpToTimelinePct(pct);
    });
  }

  function updateNeedle(pct) {
    el.timelineNeedle.style.left = `${pct * 100}%`;
    const totalSec = Math.round(pct * 86400);
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
      const res = await fetch(`api/recordings/search?channel=${ch}&date=${date}`);
      const data = await res.json();
      state.recordings = data.results || [];
      renderTimeline(state.recordings);
      renderClipsList(state.recordings);
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
    if (!clips.length) {
      el.timelineSegments.innerHTML = "";
      return;
    }
    let html = "";
    clips.forEach((c) => {
      const sSec = parseTimeToSec(c.start);
      const eSec = parseTimeToSec(c.end);
      const sPct = (sSec / 86400) * 100;
      const widthPct = Math.max(0.4, ((eSec - sSec) / 86400) * 100);
      const cls = c.type === "motion" ? "motion" : "continuous";
      html += `<div class="timeline-block ${cls}" style="left: ${sPct}%; width: ${widthPct}%;" title="${c.start} - ${c.end}"></div>`;
    });
    el.timelineSegments.innerHTML = html;
  }

  function renderClipsList(clips) {
    el.clipsCount.textContent = clips.length;
    if (!clips.length) {
      el.clipsList.innerHTML = '<div class="empty-clips">No recorded footage found for this date.</div>';
      return;
    }

    el.clipsList.innerHTML = clips
      .map(
        (c, idx) => `
      <div class="clip-card" data-idx="${idx}">
        <div class="clip-time">
          <span>${formatTimeRange(c.start, c.end)}</span>
          <span class="badge ${c.type === "motion" ? "danger" : "success"}">${c.type}</span>
        </div>
        <div class="clip-meta">
          <span>Duration: ${getDurationStr(c.start, c.end)}</span>
        </div>
      </div>
    `,
      )
      .join("");

    el.clipsList.querySelectorAll(".clip-card").forEach((card) => {
      card.addEventListener("click", () => {
        const idx = parseInt(card.dataset.idx, 10);
        const clip = state.recordings[idx];
        playClip(clip);
      });
    });
  }

  function formatTimeRange(st, et) {
    const s = st.split("T")[1]?.replace("Z", "") || st.split(" ")[1] || st;
    const e = et.split("T")[1]?.replace("Z", "") || et.split(" ")[1] || et;
    return `${s} → ${e}`;
  }

  function getDurationStr(st, et) {
    const diff = Math.max(0, parseTimeToSec(et) - parseTimeToSec(st));
    const m = Math.floor(diff / 60);
    const s = diff % 60;
    return `${m}m ${s}s`;
  }

  function playClip(clip) {
    if (!clip) return;
    el.pbPlayerPlaceholder.style.display = "none";
    el.pbVideo.style.display = "block";
    if (clip.playback_uri) {
      el.pbVideo.src = clip.playback_uri;
    } else {
      el.pbVideo.src = `api/stream/playback?channel=${clip.channel}&start=${encodeURIComponent(clip.start)}`;
    }
    el.pbVideo.play().catch(() => {});
  }

  function jumpToTimelinePct(pct) {
    updateNeedle(pct);
    const targetSec = Math.round(pct * 86400);
    const found = state.recordings.find((c) => {
      const s = parseTimeToSec(c.start);
      const e = parseTimeToSec(c.end);
      return targetSec >= s && targetSec <= e;
    });
    if (found) {
      playClip(found);
    }
  }

  // ------------------------------------------------------------------ Settings
  async function loadSettings() {
    try {
      const res = await fetch("api/config");
      const cfg = await res.json();
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

      el.settingsFeedback.innerHTML = '<span style="color:var(--accent);">Connecting & saving...</span>';
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
          await loadChannels();
          setTimeout(() => switchTab("grid"), 1200);
        } else {
          el.settingsFeedback.innerHTML = `<span style="color:var(--danger);">${data.error || "Save failed"}</span>`;
        }
      } catch (err) {
        el.settingsFeedback.innerHTML = `<span style="color:var(--danger);">${err.message}</span>`;
      }
    });

    el.btnTestConn.addEventListener("click", async () => {
      el.settingsFeedback.innerHTML =
        '<span style="color:var(--accent);">Probing NVR at ' + el.cfgHost.value + "...</span>";
      try {
        const res = await fetch("api/status");
        const d = await res.json();
        if (d.configured) {
          el.settingsFeedback.innerHTML = `<span style="color:var(--success);">✓ NVR Online! Brand: ${d.brand}, Channels: ${d.channels_count}</span>`;
        } else {
          el.settingsFeedback.innerHTML = `<span style="color:var(--warning);">NVR responded: ${d.message || "Ready"}</span>`;
        }
      } catch (err) {
        el.settingsFeedback.innerHTML = `<span style="color:var(--danger);">Connection failed: ${err.message}</span>`;
      }
    });
  }

  // Start on load
  window.addEventListener("DOMContentLoaded", init);
})();
