/**
 * AJ Netweb Dashboard Studio - installer UI controller.
 * All API paths are relative so the page works behind Home Assistant ingress.
 */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const VIEW_LABELS = {
    panel: "Wall Panel (tablets)", lights: "Lights", climate: "Climate", security: "Security",
    cameras: "Cameras", media: "Music", installer: "Installer (admins only)", prayer: "Prayer times card",
  };
  const GROUP_LABELS = {
    access: "Access & gates", lights: "Lights", climates: "Climate", fans: "Fans", covers: "Shades",
    media: "Media", cameras: "Cameras", switches: "Switches", vacuums: "Vacuums", alarms: "Alarm",
    valves: "Valves", scenes: "Scenes", scripts: "Scripts", temperature: "Temperature", humidity: "Humidity",
    air: "Air quality", power: "Power", openings: "Doors & windows", motion: "Motion", safety: "Safety",
    batteries: "Batteries", other_sensors: "Other sensors",
  };
  const CHIP_GROUPS = [["lights", "💡"], ["climates", "❄️"], ["covers", "🪟"], ["access", "🔐"],
                       ["cameras", "📹"], ["media", "🎵"]];

  const state = { project: null, layout: null, themes: [], openRooms: new Set(), saveTimer: null };

  // ------------------------------------------------------------------ api
  async function api(path, body) {
    const opts = body === undefined ? {} : {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    };
    try {
      const res = await fetch(path, opts);
      const text = await res.text();
      let data;
      try { data = text ? JSON.parse(text) : {}; } catch (e) {
        return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 160)}` };
      }
      if (!res.ok && data.ok === undefined) data.ok = false;
      return data;
    } catch (e) {
      return { ok: false, error: `Network error: ${e.message}` };
    }
  }

  function toast(msg) {
    const t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(t._h);
    t._h = setTimeout(() => t.classList.remove("show"), 2800);
  }

  // ------------------------------------------------------------------ project persistence
  function saveSoon() {
    $("saveState").textContent = "Saving…";
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(saveNow, 500);
  }

  async function saveNow() {
    clearTimeout(state.saveTimer);
    const res = await api("api/project", state.project);
    if (res.ok) {
      state.project = res.project;
      if ($("fUrl") !== document.activeElement) $("fUrl").value = state.project.url_path;
      $("saveState").textContent = "All changes saved";
    } else {
      $("saveState").textContent = "Save failed";
      toast(res.error || "Save failed");
    }
  }

  function bind(id, getter, setter, evt) {
    const el = $(id);
    setter(el);
    el.addEventListener(evt || "input", () => { getter(el); saveSoon(); });
  }

  // ------------------------------------------------------------------ overview
  async function loadHealth() {
    const h = await api("api/health");
    $("addonVersion").textContent = h.version ? `v${h.version}` : "";
    const list = $("checks");
    if (!h.checks) {
      list.innerHTML = `<li><span class="dot bad">!</span><div>${esc(h.error || "Health check failed")}</div></li>`;
      return;
    }
    list.innerHTML = h.checks.map((c) => {
      const cls = c.ok === true ? "ok" : c.ok === false ? "bad" : "warn";
      const sym = c.ok === true ? "✓" : c.ok === false ? "✕" : "!";
      return `<li><span class="dot ${cls}">${sym}</span><div><b>${esc(c.label)}</b>
        ${c.detail && c.ok !== true ? `<pre>${esc(c.detail)}</pre>` : ""}</div></li>`;
    }).join("");
  }

  function renderKpis() {
    const s = (state.layout && state.layout.summary) || {};
    const items = [["Rooms", s.areas_count], ["Lights", s.lights_count], ["Climate", s.climates_count],
                   ["Shades", s.covers_count], ["Access", s.access_count], ["Cameras", s.cameras_count],
                   ["Sensors", s.sensors_count]];
    $("kpis").innerHTML = items.map(([l, v]) => `<div class="kpi"><b>${v == null ? "—" : v}</b><span>${l}</span></div>`).join("");
  }

  // ------------------------------------------------------------------ design
  function renderDesign() {
    const p = state.project;
    bind("fTitle", (el) => (p.title = el.value), (el) => (el.value = p.title || ""));
    bind("fUrl", (el) => (p.url_path = el.value), (el) => (el.value = p.url_path || ""));
    $("fUrl").addEventListener("blur", saveNow);
    bind("fLanguage", (el) => (p.language = el.value), (el) => (el.value = p.language || ""), "change");
    bind("fSidebar", (el) => (p.show_in_sidebar = el.checked), (el) => (el.checked = p.show_in_sidebar !== false), "change");
    bind("fAdmin", (el) => (p.require_admin = el.checked), (el) => (el.checked = !!p.require_admin), "change");
    bind("fPanelLive", (el) => (p.panel_live_cameras = el.checked), (el) => (el.checked = p.panel_live_cameras !== false), "change");
    bind("fRoomTap", (el) => (p.room_tap = el.value), (el) => (el.value = p.room_tap || "popup"), "change");
    bind("fTariff", (el) => (p.energy_tariff = el.value), (el) => (el.value = p.energy_tariff || "auto"), "change");
    bind("fHeaderImage", (el) => (p.header_image = el.value.trim()), (el) => (el.value = p.header_image || ""));
    bind("fNavbar", (el) => (p.navbar = el.checked), (el) => (el.checked = p.navbar !== false), "change");
    bind("fPalette", (el) => (p.palette = el.value), (el) => (el.value = p.palette || ""), "change");
    bind("fPersonal", (el) => (p.personal = el.checked), (el) => (el.checked = p.personal !== false), "change");
    bind("fWallpaper", (el) => (p.wallpaper = el.checked), (el) => (el.checked = !!p.wallpaper), "change");
    bind("fMenu", (el) => (p.menu = el.checked), (el) => (el.checked = p.menu !== false), "change");
    bind("fNotifications", (el) => (p.notifications = el.checked), (el) => (el.checked = p.notifications !== false), "change");
    renderKiosk();
    bind("fCamsLive", (el) => (p.cameras_view_live = el.checked), (el) => (el.checked = !!p.cameras_view_live), "change");

    const vt = $("viewToggles");
    vt.innerHTML = Object.entries(VIEW_LABELS).map(([k, l]) =>
      `<label class="switch"><input type="checkbox" data-view="${k}" ${(p.views || {})[k] !== false ? "checked" : ""}><span></span>${esc(l)}</label>`
    ).join("");
    vt.querySelectorAll("input").forEach((cb) => cb.addEventListener("change", () => {
      p.views = Object.assign({}, p.views, { [cb.dataset.view]: cb.checked });
      saveSoon();
    }));
    renderThemes();
  }

  // ------------------------------------------------------------------ kiosk & ⋯ menu
  const KIOSK_ROWS = [
    ["hide_header", "Hide Home Assistant header (kiosk-mode)", "none"],
    ["hide_sidebar", "Hide Home Assistant sidebar (kiosk-mode)", "none"],
    ["menu.pages", "Menu: other pages (Wall Panel, Installer…)", "all"],
    ["menu.appearance", "Menu: my theme & colour", "all"],
    ["menu.profile", "Menu: my profile (language, dark mode)", "all"],
    ["menu.reload", "Menu: reload", "all"],
    ["menu.settings", "Menu: Home Assistant settings", "admins"],
    ["menu.studio", "Menu: Dashboard Studio", "admins"],
    ["menu.exit_kiosk", "Menu: exit kiosk mode", "admins"],
    ["doorbell", "Doorbell popup (camera + open door, needs the Intercom add-on)", "all"],
  ];
  const WHO = [["all", "Everyone"], ["admins", "Admins only"], ["non_admins", "Everyone except admins"],
               ["none", "Nobody"], ["people", "Specific people…"]];

  function renderKiosk() {
    const p = state.project;
    p.kiosk = p.kiosk || {};
    const get = (path) => path.split(".").reduce((o, k) => (o || {})[k], p.kiosk);
    const set = (path, v) => {
      const keys = path.split(".");
      let o = p.kiosk;
      keys.slice(0, -1).forEach((k) => { o[k] = o[k] || {}; o = o[k]; });
      o[keys[keys.length - 1]] = v;
    };
    const box = $("kioskRules");
    box.innerHTML = KIOSK_ROWS.map(([key, label, dflt]) => {
      const v = get(key) == null ? dflt : get(key);
      const people = Array.isArray(v);
      return `<div class="krow" data-k="${key}"><span>${esc(label)}</span>
        <select>${WHO.map(([w, l]) => `<option value="${w}" ${(people ? "people" : v) === w ? "selected" : ""}>${l}</option>`).join("")}</select>
        <input type="text" placeholder="Mama, Ahmed, panel-majlis" value="${people ? esc(v.join(", ")) : ""}" ${people ? "" : "hidden"}></div>`;
    }).join("");
    box.querySelectorAll(".krow").forEach((row) => {
      const sel = row.querySelector("select");
      const inp = row.querySelector("input");
      const apply = () => {
        inp.hidden = sel.value !== "people";
        set(row.dataset.k, sel.value === "people"
          ? inp.value.split(",").map((x) => x.trim()).filter(Boolean) : sel.value);
        saveSoon();
      };
      sel.addEventListener("change", () => { apply(); if (!inp.hidden) inp.focus(); });
      inp.addEventListener("input", apply);
    });
  }

  function renderThemes() {
    const p = state.project;
    $("themeGrid").innerHTML = state.themes.map((t) => {
      const sw = Object.entries(t.preview).map(([mode, c]) => `
        <div class="swatch" style="background:${esc(c.bg)}" title="${esc(mode)}">
          <i style="background:${esc(c.card)};border-color:${esc(c.border)}"></i>
          <i style="background:${esc(c.card)};border-color:${esc(c.border)}"></i>
          <i class="acc" style="background:${esc(c.accent)}"></i>
        </div>`).join("");
      return `<button type="button" class="theme ${p.theme === t.key ? "active" : ""}" data-key="${esc(t.key)}">
        <div class="swatches">${sw}</div>
        <div class="theme-body"><b>${esc(t.label)}</b><p>${esc(t.description)}</p></div></button>`;
    }).join("");
    $("themeGrid").querySelectorAll(".theme").forEach((b) => b.addEventListener("click", () => {
      p.theme = b.dataset.key;
      renderThemes();
      saveSoon();
    }));
  }

  function renderWeatherOptions() {
    const sel = $("fWeather");
    const ws = (state.layout && state.layout.house && state.layout.house.weather) || [];
    sel.innerHTML = `<option value="">Automatic</option>` + ws.map((w) => `<option>${esc(w)}</option>`).join("");
    sel.value = state.project.weather_entity || "";
    sel.onchange = () => { state.project.weather_entity = sel.value || null; saveSoon(); };
  }

  // ------------------------------------------------------------------ rooms & devices
  async function loadDiscovery() {
    $("roomsList").innerHTML = `<div class="muted">Scanning Home Assistant…</div>`;
    const res = await api("api/discovery");
    if (!res.layout) {
      $("roomsList").innerHTML = `<div class="result bad">Discovery failed: ${esc(res.error)}</div>`;
      return;
    }
    state.layout = res.layout;
    if (state.project) { renderLayoutRooms(); renderModesKeep(); renderModesTable(); }
    if (res.error) toast(res.error);
    renderKpis();
    renderRooms();
    renderWeatherOptions();
  }

  function renderRooms() {
    const p = state.project;
    const q = ($("roomSearch").value || "").trim().toLowerCase();
    const floors = Object.fromEntries((state.layout.floors || []).map((f) => [f.id, f.name]));
    const favs = new Set(p.favorites || []);
    let lastFloor;
    const html = [];

    state.layout.areas.forEach((a) => {
      const included = ((p.areas || {})[a.id] || {}).included !== false;
      const groups = Object.keys(GROUP_LABELS).filter((g) => (a[g] || []).length);
      const matches = (e) => !q || e.name.toLowerCase().includes(q) || e.entity_id.includes(q) ||
                             (e.full_name || "").toLowerCase().includes(q);
      const anyMatch = groups.some((g) => a[g].some(matches)) || a.name.toLowerCase().includes(q);
      if (q && !anyMatch) return;

      const floor = a.floor_id ? floors[a.floor_id] : (state.layout.floors.length ? "No floor" : null);
      if (floor && floor !== lastFloor) {
        html.push(`<div class="floor-title">${esc(floor)}</div>`);
        lastFloor = floor;
      }
      const chips = CHIP_GROUPS.filter(([g]) => (a[g] || []).length)
        .map(([g, icon]) => `<span class="chip">${icon} ${a[g].length}</span>`).join("");
      const body = groups.map((g) => {
        const ents = a[g].filter((e) => !q || matches(e) || a.name.toLowerCase().includes(q));
        if (!ents.length) return "";
        return `<div class="ent-group"><div>${GROUP_LABELS[g]}</div>${ents.map((e) => `
          <div class="ent ${e.excluded ? "excluded" : ""}">
            <input type="checkbox" data-ent="${esc(e.entity_id)}" ${e.excluded ? "" : "checked"} title="Include">
            <div><div class="ename">${esc(e.name)}</div><div class="eid">${esc(e.entity_id)}${e.device ? " · " + esc(e.device) : ""}</div></div>
            <button class="star ${favs.has(e.entity_id) ? "on" : ""}" data-fav="${esc(e.entity_id)}" title="Pin to Home">★</button>
          </div>`).join("")}</div>`;
      }).join("");
      const open = state.openRooms.has(a.id) || !!q;
      html.push(`<div class="room ${included ? "" : "off"} ${open ? "open" : ""}" data-room="${esc(a.id)}">
        <div class="room-head">
          <input type="checkbox" data-area="${esc(a.id)}" ${included ? "checked" : ""} title="Include room">
          <span class="name">${esc(a.name)}</span><span class="chips">${chips}</span>
          <span class="muted">${open ? "▾" : "▸"}</span>
        </div>
        <div class="room-body">${body}</div></div>`);
    });

    const list = $("roomsList");
    list.innerHTML = html.join("") || `<div class="muted">${q ? "No matches." :
      "No devices found. Create Areas in Settings → Areas & zones and assign devices to them."}</div>`;

    list.querySelectorAll(".room-head").forEach((h) => h.addEventListener("click", (ev) => {
      if (ev.target.matches("input")) return;
      const id = h.parentElement.dataset.room;
      state.openRooms.has(id) ? state.openRooms.delete(id) : state.openRooms.add(id);
      renderRooms();
    }));
    list.querySelectorAll("[data-area]").forEach((cb) => cb.addEventListener("change", () => {
      p.areas = Object.assign({}, p.areas, { [cb.dataset.area]: { included: cb.checked } });
      cb.closest(".room").classList.toggle("off", !cb.checked);
      saveSoon();
    }));
    list.querySelectorAll("[data-ent]").forEach((cb) => cb.addEventListener("change", () => {
      const set = new Set(p.excluded_entities || []);
      cb.checked ? set.delete(cb.dataset.ent) : set.add(cb.dataset.ent);
      p.excluded_entities = [...set];
      markExcluded(cb.dataset.ent, !cb.checked);
      cb.closest(".ent").classList.toggle("excluded", !cb.checked);
      saveSoon();
    }));
    list.querySelectorAll("[data-fav]").forEach((b) => b.addEventListener("click", () => {
      const set = new Set(p.favorites || []);
      set.has(b.dataset.fav) ? set.delete(b.dataset.fav) : set.add(b.dataset.fav);
      p.favorites = [...set];
      b.classList.toggle("on");
      saveSoon();
    }));
  }

  function markExcluded(entityId, excluded) {
    state.layout.areas.forEach((a) => Object.values(a).forEach((v) => {
      if (Array.isArray(v)) v.forEach((e) => { if (e && e.entity_id === entityId) e.excluded = excluded; });
    }));
  }

  // ------------------------------------------------------------------ support
  function renderSupport() {
    const b = (state.project.branding = state.project.branding || {});
    [["bCompany", "company"], ["bPhone", "phone"], ["bEmail", "email"], ["bWebsite", "website"], ["bNotes", "notes"]]
      .forEach(([id, key]) => bind(id, (el) => (b[key] = el.value), (el) => (el.value = b[key] || "")));
  }

  // ------------------------------------------------------------------ deploy & backups
  async function deploy() {
    const btns = [$("btnDeploy"), $("btnDeployTop")];
    btns.forEach((b) => (b.disabled = true));
    activateTab("deploy");
    $("deployResult").innerHTML = `<div class="result">Deploying…</div>`;
    const res = await api("api/deploy", { project: state.project });
    btns.forEach((b) => (b.disabled = false));
    const steps = (res.steps || []).map((s) =>
      `<li>${s.ok ? "✓" : s.ok === false ? "✕" : "•"} ${esc(s.step)}${s.detail ? ` – <span class="muted">${esc(s.detail)}</span>` : ""}</li>`).join("");
    if (res.ok) {
      const base = `/${res.url_path}`;
      const main = (res.views || []).filter((v) => !v.subview);
      const warn = (res.steps || []).some((s) => s.ok === false);
      $("deployResult").innerHTML = `<div class="result ${warn ? "bad" : "ok"}">
        <b>${warn ? "Dashboard deployed with warnings – fix the ✕ items, then deploy again." : "Dashboard deployed."}</b><ul>${steps}</ul>
        <div class="links">${main.map((v) =>
          `<a class="btn small" href="${esc(base + "/" + v.path)}" target="_top">${esc(v.title)}</a>`).join("")}</div>
        <p class="muted">Tip: on wall tablets open <code>${esc(base)}/tablet</code> in the Companion app or kiosk browser.
          Room photos come from Settings → Areas (add a picture to each area). If the page shows
          "Custom element doesn't exist", refresh the browser once to load the new UI kit.</p></div>`;
      toast("Deployed");
      loadBackups();
      loadHealth();
    } else {
      $("deployResult").innerHTML = `<div class="result bad"><b>Deploy failed:</b> ${esc(res.error || "Unknown error")}
        ${steps ? `<ul>${steps}</ul>` : ""}</div>`;
    }
  }

  async function preview() {
    await saveNow();
    const res = await api("api/preview");
    if (!res.ok) return toast(res.error || "Preview failed");
    $("previewCode").textContent = JSON.stringify(res.config, null, 2);
    $("previewDialog").showModal();
  }

  async function loadBackups() {
    const res = await api("api/backups");
    const list = res.backups || [];
    $("backupsList").innerHTML = list.length ? `<div class="list">${list.map((b) => `
      <div class="row-item"><div><b>/${esc(b.url_path)}</b><div class="muted">${new Date(b.saved_at * 1000).toLocaleString()}
        · ${Math.round(b.size / 1024)} KB</div></div>
        <button class="btn small" data-restore="${esc(b.file)}">Restore</button></div>`).join("")}</div>`
      : "No backups yet.";
    $("backupsList").querySelectorAll("[data-restore]").forEach((b) => b.addEventListener("click", async () => {
      if (!confirm("Restore this version? The current layout is backed up first.")) return;
      const r = await api("api/backups/restore", { file: b.dataset.restore });
      toast(r.ok ? "Restored – refresh the dashboard" : r.error || "Restore failed");
      loadBackups();
    }));
  }

  // ------------------------------------------------------------------ blueprints
  async function loadBlueprints() {
    const res = await api("api/blueprints");
    $("blueprintsList").innerHTML = (res.blueprints || []).map((b) => `
      <div class="row-item"><div><b>${esc(b.name)}</b><div class="muted">${esc(b.description)}</div></div>
        <span class="badge ${b.installed ? "ok" : "off"}">${b.installed ? "Installed" : "Not installed"}</span></div>`).join("");
  }

  // ------------------------------------------------------------------ layout (drag and drop, no YAML)
  const BANDS = {
    top: ["🕐", "Header + top row", "Clock, status chips, weather · prayer · music / Right now"],
    modes: ["🌙", "House modes", "Home · Away · Night · Guests (when turned on in House modes)"],
    scenes: ["🎬", "Scenes & quick actions", "Scenes, all lights off, AC off, shades, shortcuts"],
    access: ["🔐", "Access", "Gates, doors, garage, locks"],
    favorites: ["⭐", "Favourites", "Devices you starred in Rooms & Devices"],
    rooms: ["🏠", "Rooms", "Room tiles with floor tabs"],
    climate: ["❄️", "Climate", "AC controls"],
    insights: ["📊", "Today at home", "Agenda, energy today, room temperatures (24 h graph), water"],
    cameras: ["📹", "Cameras", "Large pictures; gate/garage buttons on the picture"],
    custom: ["🧩", "My cards", "Your own cards from the My cards dashboard"],
  };
  const DEFAULT_ORDER = {
    home: ["top", "modes", "scenes", "access", "favorites", "rooms", "climate", "insights", "cameras", "custom"],
    panel: ["top", "modes", "cameras", "rooms", "scenes", "access", "favorites", "climate", "insights", "custom"],
  };
  const INSIGHTS = { calendar: ["📅", "Agenda", "Next events from the HA calendars"],
    energy: ["⚡", "Energy", "Used today and the last 7 days (from HA's Energy settings)"],
    temperature: ["🌡️", "Room temperatures", "Every room's temperature over 24 h"],
    water: ["💧", "Water", "Tank levels, booster pump, garden watering (found by name: tank, pump, irrigation, zone)"] };
  const TOP = { weather: ["🌤️", "Weather forecast"], prayer: ["🕌", "Prayer times"], media: ["🎵", "Music / Right now"] };

  // A list that can be reordered by drag and drop (mouse) or ▲▼ (touch), each row with an on/off box.
  function sortable(box, rows, onChange, onAction) {
    box.innerHTML = rows.map((r, i) => `
      <div class="srow ${r.on ? "" : "off"}" draggable="true" data-i="${i}">
        <span class="grip" title="Drag">⋮⋮</span><span class="ic">${r.icon || ""}</span>
        <span class="tx"><b>${esc(r.title)}</b>${r.sub ? `<span>${esc(r.sub)}</span>` : ""}</span>
        <span class="mv">${(r.actions || []).map(([k, label, tip]) => `<button data-act="${k}" data-ai="${i}" title="${esc(tip)}">${label}</button>`).join("")}<button data-up="${i}" aria-label="Up">▲</button><button data-dn="${i}" aria-label="Down">▼</button></span>
        ${r.fixed ? `<span class="tag">${esc(r.fixed)}</span>` : `<input type="checkbox" data-on="${i}" ${r.on ? "checked" : ""} title="Show">`}
      </div>`).join("");
    const commit = (list) => { onChange(list); sortable(box, list, onChange, onAction); };
    box.querySelectorAll("[data-act]").forEach((b) => b.addEventListener("click", () => onAction && onAction(b.dataset.act, rows[+b.dataset.ai], b)));
    let from = null;
    box.querySelectorAll(".srow").forEach((el) => {
      el.addEventListener("dragstart", (e) => { from = +el.dataset.i; el.classList.add("drag"); e.dataTransfer.effectAllowed = "move"; });
      el.addEventListener("dragend", () => el.classList.remove("drag"));
      el.addEventListener("dragover", (e) => { e.preventDefault(); el.classList.add("over"); });
      el.addEventListener("dragleave", () => el.classList.remove("over"));
      el.addEventListener("drop", (e) => {
        e.preventDefault(); el.classList.remove("over");
        const to = +el.dataset.i;
        if (from === null || from === to) return;
        const list = rows.slice(); const [m] = list.splice(from, 1); list.splice(to, 0, m); from = null; commit(list);
      });
    });
    // fingers and pens: native drag and drop doesn't work on touch screens, so drag by the grip with pointer events
    box.querySelectorAll(".srow .grip").forEach((grip) => grip.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse") return;
      e.preventDefault();
      const row = grip.closest(".srow");
      const start = +row.dataset.i;
      let to = start;
      row.classList.add("touch-drag");
      grip.setPointerCapture(e.pointerId);
      const y0 = e.clientY;
      const move = (ev) => {
        row.style.transform = `translateY(${ev.clientY - y0}px)`;
        const el = [...box.querySelectorAll(".srow")].find((r) => {
          if (r === row) return false;
          const b = r.getBoundingClientRect();
          return ev.clientY >= b.top && ev.clientY <= b.bottom;
        });
        box.querySelectorAll(".srow.over").forEach((r) => r.classList.remove("over"));
        if (el) { el.classList.add("over"); to = +el.dataset.i; }
      };
      const end = () => {
        grip.removeEventListener("pointermove", move);
        row.classList.remove("touch-drag"); row.style.transform = "";
        if (to === start) return box.querySelectorAll(".srow.over").forEach((r) => r.classList.remove("over"));
        const list = rows.slice(); const [m] = list.splice(start, 1); list.splice(to, 0, m); commit(list);
      };
      grip.addEventListener("pointermove", move);
      grip.addEventListener("pointerup", end, { once: true });
      grip.addEventListener("pointercancel", end, { once: true });
    }));
    box.querySelectorAll("[data-up],[data-dn]").forEach((b) => b.addEventListener("click", () => {
      const i = +(b.dataset.up ?? b.dataset.dn); const j = b.dataset.up !== undefined ? i - 1 : i + 1;
      if (j < 0 || j >= rows.length) return;
      const list = rows.slice(); [list[i], list[j]] = [list[j], list[i]]; commit(list);
    }));
    box.querySelectorAll("[data-on]").forEach((cb) => cb.addEventListener("change", () => {
      const list = rows.slice(); list[+cb.dataset.on] = Object.assign({}, list[+cb.dataset.on], { on: cb.checked }); commit(list);
    }));
  }

  function renderLayout() {
    const p = state.project;
    p.layout = p.layout || {};
    ["home", "panel"].forEach((page) => {
      const conf = p.layout[page] || {};
      const order = (conf.order || []).filter((b) => BANDS[b]);
      DEFAULT_ORDER[page].forEach((b, i) => {   // blocks added in a later version go after their default neighbour
        if (order.includes(b)) return;
        const prev = DEFAULT_ORDER[page].slice(0, i).reverse().find((x) => order.includes(x));
        order.splice(prev ? order.indexOf(prev) + 1 : 0, 0, b);
      });
      const hidden = new Set(conf.hidden || []);
      sortable($(page === "home" ? "lyHome" : "lyPanel"),
        order.map((b) => ({ id: b, icon: BANDS[b][0], title: BANDS[b][1], sub: BANDS[b][2], on: !hidden.has(b) })),
        (list) => {
          p.layout = Object.assign({}, p.layout, { [page]: { order: list.map((r) => r.id), hidden: list.filter((r) => !r.on).map((r) => r.id) } });
          saveSoon();
        });
    });
    const topOn = Array.isArray(p.top_cards) ? p.top_cards : Object.keys(TOP);
    const topOrder = [...topOn, ...Object.keys(TOP).filter((k) => !topOn.includes(k))];
    sortable($("lyTop"), topOrder.map((k) => ({ id: k, icon: TOP[k][0], title: TOP[k][1], on: topOn.includes(k) })), (list) => {
      p.top_cards = list.filter((r) => r.on).map((r) => r.id); saveSoon();
    });
    // the old default (before Water existed) still means "all of them"
    const insOn = Array.isArray(p.insights) && p.insights.join() !== "calendar,energy,temperature" ? p.insights : Object.keys(INSIGHTS);
    const insOrder = [...insOn.filter((k) => INSIGHTS[k]), ...Object.keys(INSIGHTS).filter((k) => !insOn.includes(k))];
    sortable($("lyInsights"), insOrder.map((k) => ({ id: k, icon: INSIGHTS[k][0], title: INSIGHTS[k][1], sub: INSIGHTS[k][2], on: insOn.includes(k) })), (list) => {
      p.insights = list.filter((r) => r.on).map((r) => r.id); saveSoon();
    });
    if (!state.lyBound) {   // inputs read state.project when they change, so bind them once
      state.lyBound = true;
      bind("fRoomStyle", (el) => (state.project.room_style = el.value), (el) => (el.value = p.room_style === "photo" ? "photo" : "tile"), "change");
      bind("fHomeCams", (el) => (state.project.home_cameras = Math.max(1, Math.min(8, parseInt(el.value, 10) || 4))), (el) => (el.value = p.home_cameras || 4));
    }
    renderLayoutRooms();
    const mc = $("btnMyCards");
    mc.textContent = p.custom_dashboard ? "Open My cards editor" : "Create My cards";
    $("myCardsInfo").textContent = p.custom_dashboard ? `/${p.custom_dashboard} - hidden from the sidebar` : "";
    mc.onclick = async () => {
      let url = p.custom_dashboard;
      if (!url) {
        mc.disabled = true;
        const r = await api("api/my_cards", {});
        mc.disabled = false;
        if (!r.ok) return toast(r.error || "Could not create the My cards dashboard");
        state.project = r.project; url = r.url_path;
        toast("My cards created - press Apply so the dashboard picks it up");
        renderLayout();
      }
      window.open(`/${url}/home?edit=1`, "_blank");
    };
    $("pvOpen").href = `/${p.url_path}/${state.pv || "home"}`;
  }

  // rooms and cameras come from discovery (loaded a moment after the project)
  function renderLayoutRooms() {
    const p = state.project;
    if (!state.layout || !$("lyRooms")) return;
    const floors = Object.fromEntries((state.layout.floors || []).map((f) => [f.id, f.name]));
    const areas = state.layout.areas.filter((a) => ((p.areas || {})[a.id] || {}).included !== false);
    const ord = p.room_order || [];
    const sorted = areas.map((a, i) => [a, ord.includes(a.id) ? ord.indexOf(a.id) : 1000 + i]).sort((x, y) => x[1] - y[1]).map(([a]) => a);
    sortable($("lyRooms"), sorted.map((a) => ({ id: a.id, icon: a.picture ? `<img src="${esc(a.picture)}" alt="">` : "🚪", title: a.name,
      on: true, fixed: floors[a.floor_id] || "No floor", actions: [["rename", "✏️", "Rename room"], ["photo", "📷", "Upload room photo"], ["scene", "🎬", "Save what the room does now as a scene"]] })),
      (list) => { p.room_order = list.map((r) => r.id); saveSoon(); },
      (act, row) => (act === "rename" ? renameRoom(row) : act === "scene" ? saveScene(row) : pickPhoto(row)));
    const cams = state.layout.areas.flatMap((a) => (a.cameras || []).map((c) => Object.assign({ area: a.name }, c)));
    const chosen = p.cameras && p.cameras.length ? p.cameras : cams.map((c) => c.entity_id);
    const camRows = [...chosen.map((id) => cams.find((c) => c.entity_id === id)).filter(Boolean), ...cams.filter((c) => !chosen.includes(c.entity_id))];
    sortable($("lyCams"), camRows.map((c) => ({ id: c.entity_id, icon: "📹", title: c.name, sub: c.area, on: chosen.includes(c.entity_id) })),
      (list) => { const on = list.filter((r) => r.on).map((r) => r.id); p.cameras = on.length === cams.length && on.every((id, i) => id === cams[i].entity_id) ? [] : on; saveSoon(); });
  }

  async function renameRoom(row) {
    const name = prompt("Room name", row.title);
    if (!name || name.trim() === row.title) return;
    const r = await api("api/room", { area_id: row.id, name: name.trim() });
    if (!r.ok) return toast(r.error || "Rename failed");
    const a = state.layout.areas.find((x) => x.id === row.id);
    if (a) a.name = r.name;
    toast("Room renamed - the dashboard updates by itself");
    renderLayoutRooms(); renderRooms();
  }

  // pick a photo, let the installer frame it (4:3, drag + zoom), send it as a JPEG of at most 1600 x 1200
  function pickPhoto(row) {
    const input = document.createElement("input");
    input.type = "file"; input.accept = "image/*";
    input.onchange = () => {
      const file = input.files && input.files[0];
      if (!file) return;
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(img.src); cropPhoto(row, img); };
      img.onerror = () => toast("That file is not an image");
      img.src = URL.createObjectURL(file);
    };
    input.click();
  }

  function cropPhoto(row, img) {
    const dlg = $("cropDialog"), cv = $("cropCanvas"), ctx = cv.getContext("2d"), zoom = $("cropZoom");
    const W = cv.width, H = cv.height;
    const base = Math.max(W / img.width, H / img.height);   // zoom 1 = the photo just covers the frame
    const view = { z: 1, x: 0, y: 0 };                       // x/y: offset of the photo centre from the frame centre
    const clamp = () => {
      const s = base * view.z, mx = Math.max(0, (img.width * s - W) / 2), my = Math.max(0, (img.height * s - H) / 2);
      view.x = Math.max(-mx, Math.min(mx, view.x)); view.y = Math.max(-my, Math.min(my, view.y));
    };
    const draw = (c, w, h) => {
      const s = base * view.z * (w / W), iw = img.width * s, ih = img.height * s;
      c.fillStyle = "#111"; c.fillRect(0, 0, w, h);
      c.drawImage(img, (w - iw) / 2 + view.x * (w / W), (h - ih) / 2 + view.y * (h / H), iw, ih);
    };
    const paint = () => { clamp(); draw(ctx, W, H); };
    zoom.value = 1;
    zoom.oninput = () => { view.z = +zoom.value; paint(); };
    let drag = null;
    cv.onpointerdown = (e) => { drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }; cv.setPointerCapture(e.pointerId); };
    cv.onpointermove = (e) => {
      if (!drag) return;
      const k = W / cv.getBoundingClientRect().width;
      view.x = drag.vx + (e.clientX - drag.x) * k; view.y = drag.vy + (e.clientY - drag.y) * k; paint();
    };
    cv.onpointerup = cv.onpointercancel = () => { drag = null; };
    cv.onwheel = (e) => { e.preventDefault(); zoom.value = view.z = Math.max(1, Math.min(4, view.z * (e.deltaY < 0 ? 1.08 : 0.93))); paint(); };
    $("btnCropCancel").onclick = () => dlg.close();
    $("btnCropSave").onclick = async () => {
      const out = document.createElement("canvas");   // as many pixels as the frame covers in the original, 400-1600 wide
      out.width = Math.round(Math.max(400, Math.min(1600, W / (base * view.z))));
      out.height = Math.round(out.width * H / W);
      draw(out.getContext("2d"), out.width, out.height);
      $("btnCropSave").disabled = true;
      toast("Uploading photo…");
      const r = await api("api/room", { area_id: row.id, photo: out.toDataURL("image/jpeg", 0.85) });
      $("btnCropSave").disabled = false;
      if (!r.ok) return toast(r.error || "Upload failed");
      dlg.close();
      const a = state.layout.areas.find((x) => x.id === row.id);
      if (a) a.picture = r.picture;
      toast("Photo set - it shows on the photo room cards and room sheets");
      renderLayoutRooms();
    };
    paint();
    dlg.showModal();
  }

  // save what a room's devices are doing now as a normal HA scene in that room
  async function saveScene(row) {
    const dlg = $("sceneDialog");
    $("sceneTitle").textContent = `Save ${row.title} as a scene`;
    $("sceneName").value = "";
    $("sceneResult").innerHTML = "";
    $("sceneList").classList.add("muted");
    $("sceneList").textContent = "Reading the room…";
    $("btnSceneCancel").onclick = () => dlg.close();
    dlg.showModal();
    const res = await api(`api/room/now?area=${encodeURIComponent(row.id)}`);
    const list = res.entities || [];
    $("sceneList").classList.toggle("muted", !list.length);
    $("sceneList").innerHTML = list.length ? list.map((e) => `<label><input type="checkbox" value="${esc(e.entity_id)}"
        ${e.now === "unavailable" ? "disabled" : e.group === "media" || e.group === "switches" ? "" : "checked"}>
        ${esc(e.name)}<small>${esc(e.now)}</small></label>`).join("")
      : esc(res.error || "This room has no lights, curtains, ACs, fans or speakers.");
    $("btnSceneSave").onclick = async () => {
      const name = $("sceneName").value.trim();
      const ids = [...$("sceneList").querySelectorAll("input:checked")].map((cb) => cb.value);
      if (!name) return toast("Give the scene a name");
      if (!ids.length) return toast("Tick at least one device");
      $("btnSceneSave").disabled = true;
      const r = await api("api/room/scene", { area_id: row.id, name, entities: ids });
      $("btnSceneSave").disabled = false;
      if (!r.ok) { $("sceneResult").innerHTML = `<div class="result bad">${esc(r.error || "Could not save the scene")}</div>`; return; }
      dlg.close();
      toast(`Scene "${name}" saved with ${r.count} devices - it shows on the room page`);
    };
  }

  function loadPreview() {
    const p = state.project;
    const src = `/${p.url_path}/${state.pv || "home"}`;
    $("pvFrame").src = src;
    $("pvOpen").href = src;
  }

  async function applyLayout() {
    const b = $("btnApplyLayout");
    b.disabled = true; b.textContent = "Applying…";
    await saveNow();
    const res = await api("api/deploy", { project: state.project });
    b.disabled = false; b.textContent = "Apply";
    if (!res.ok) return toast(res.error || "Apply failed");
    toast("Dashboard updated");
    loadPreview();
  }

  // ------------------------------------------------------------------ house modes
  const MODES = { home: ["🏠", "Home"], away: ["🧳", "Away"], night: ["🌙", "Night"], guests: ["🫖", "Guests"] };
  const MODE_FIELDS = [
    ["lights", "Lights", [["keep", "Leave"], ["off", "All off"]]],
    ["climate", "AC", [["keep", "Leave"], ["off", "All off"]]],
    ["covers", "Shades", [["keep", "Leave"], ["close", "Close"], ["open", "Open"]]],
    ["media", "Music & TV", [["keep", "Leave"], ["pause", "Pause"]]],
    ["alarm", "Alarm", [["keep", "Leave"], ["arm_away", "Arm away"], ["arm_night", "Arm night"], ["arm_home", "Arm home"], ["disarm", "Disarm"]]],
  ];

  function modesCfg() {
    const p = state.project;
    p.house_modes = p.house_modes || {};
    p.house_modes.modes = p.house_modes.modes || {};
    return p.house_modes;
  }

  async function renderModes() {
    const hm = modesCfg();
    $("mEnabled").checked = !!hm.enabled;
    $("mAlexa").checked = hm.alexa !== false;
    $("mEnabled").onchange = () => { hm.enabled = $("mEnabled").checked; renderModesTable(); saveSoon(); };
    $("mAlexa").onchange = () => { hm.alexa = $("mAlexa").checked; saveSoon(); };
    renderModesTable();
    renderModesKeep();
    const info = await api("api/house_modes");
    if (!info.ok) return;
    const t = info.targets || {};
    const al = info.alexa || {};
    $("modesInfo").textContent = `Modes act on ${t.lights || 0} lights, ${t.climate || 0} ACs, ${t.covers || 0} shades, ` +
      `${t.media || 0} speakers/TVs${t.alarm ? " and the alarm" : " (no alarm found)"}.` +
      (info.current ? ` Current mode: ${info.current}.` : " Not applied yet.") +
      (al.installed ? ` Alexa Matter Bridge found (label "${al.label}").` : " Alexa Matter Bridge is not installed.");
  }

  function renderModesTable() {
    const hm = modesCfg();
    const scenes = state.layout ? state.layout.areas.flatMap((a) => [...(a.scenes || []), ...(a.scripts || [])])
      .filter((e) => !String(e.entity_id).startsWith("script.ajnetweb_mode_")) : [];
    const box = $("modesTable");
    box.classList.toggle("off", !hm.enabled);
    box.innerHTML = Object.entries(MODES).map(([k, [icon, label]]) => {
      const m = hm.modes[k] || {};
      const on = !!m.on;   // the add-on fills in the defaults of every mode
      const sel = (field, opts) => `<select data-m="${k}" data-f="${field}">${opts.map(([o, l]) =>
        `<option value="${o}" ${m[field] === o ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
      return `<div class="mrow ${on ? "" : "off"}">
        <label class="mname"><input type="checkbox" data-m="${k}" data-f="on" ${on ? "checked" : ""}> ${icon}
          <input type="text" data-m="${k}" data-f="name" placeholder="${label}" value="${esc(m.name || "")}" maxlength="40" title="Name on the dashboard and for Alexa"></label>
        ${MODE_FIELDS.map(([f, l, opts]) => `<label>${l}${sel(f, opts)}</label>`).join("")}
        <label>Then run<select data-m="${k}" data-f="scene"><option value="">Nothing</option>${scenes.map((e) =>
          `<option value="${esc(e.entity_id)}" ${m.scene === e.entity_id ? "selected" : ""}>${esc(e.full_name || e.name)}</option>`).join("")}</select></label>
      </div>`;
    }).join("");
    box.querySelectorAll("[data-m]").forEach((el) => el.addEventListener(el.type === "text" ? "input" : "change", () => {
      const m = (hm.modes[el.dataset.m] = hm.modes[el.dataset.m] || {});
      m[el.dataset.f] = el.type === "checkbox" ? el.checked : el.value.trim();
      if (el.dataset.f === "on") el.closest(".mrow").classList.toggle("off", !el.checked);
      saveSoon();
    }));
  }

  function renderModesKeep() {
    const hm = modesCfg();
    if (!state.layout) return;
    const keep = new Set(hm.keep_on || []);
    const lights = state.layout.areas.flatMap((a) => (a.lights || []).map((e) => Object.assign({ area: a.name }, e)));
    const box = $("modesKeep");
    box.innerHTML = lights.length ? lights.map((e) => `<label class="switch"><input type="checkbox" data-keep="${esc(e.entity_id)}"
      ${keep.has(e.entity_id) ? "checked" : ""}><span></span>${esc(e.area)} · ${esc(e.name)}</label>`).join("") : "No lights found.";
    box.querySelectorAll("[data-keep]").forEach((cb) => cb.addEventListener("change", () => {
      const set = new Set(hm.keep_on || []);
      cb.checked ? set.add(cb.dataset.keep) : set.delete(cb.dataset.keep);
      hm.keep_on = [...set];
      saveSoon();
    }));
  }

  async function applyModes() {
    const b = $("btnModesApply");
    if (!modesCfg().enabled) return toast("Turn on \"Use house modes\" first");
    b.disabled = true;
    $("modesResult").innerHTML = `<div class="result">Applying…</div>`;
    await saveNow();
    const res = await api("api/house_modes/apply", {});
    b.disabled = false;
    const steps = (res.steps || []).map((s) =>
      `<li>${s.ok ? "✓" : s.ok === false ? "✕" : "•"} ${esc(s.step)}${s.detail ? ` – <span class="muted">${esc(s.detail)}</span>` : ""}</li>`).join("");
    $("modesResult").innerHTML = `<div class="result ${res.ok ? "ok" : "bad"}"><b>${res.ok ? "House modes are set up." :
      esc(res.error || "Some steps failed – see below.")}</b>${steps ? `<ul>${steps}</ul>` : ""}
      ${res.ok ? `<p class="muted">Press <b>Deploy</b> (or Apply in Layout) once so the dashboard shows the modes.</p>` : ""}</div>`;
    renderModes();
  }

  // ------------------------------------------------------------------ alarm pack
  const ARM = [["away", "Away"], ["night", "Night"], ["home", "Home"]];
  function alarmCfg() {
    const p = state.project;
    p.alarm = p.alarm || {};
    p.alarm.sensors = p.alarm.sensors || {};
    return p.alarm;
  }

  async function renderAlarm() {
    const info = await api("api/alarm");
    if (!info.ok) { $("alarmInfo").textContent = info.error || "Could not read Home Assistant."; return; }
    const a = alarmCfg();
    Object.keys(info.config).forEach((k) => { if (a[k] === undefined) a[k] = info.config[k]; });
    $("aEnabled").checked = !!a.enabled;
    $("aAlexa").checked = a.alexa !== false;
    $("aLights").checked = !!a.lights_on;
    $("aSource").innerHTML = `<option value="auto">Automatic (${info.panels.length ? "the panel in Home Assistant" : "our own - no panel found"})</option>
      <option value="own">Our own alarm (door, window and motion sensors)</option>` +
      info.panels.map((pn) => `<option value="panel:${esc(pn.entity_id)}">${esc(pn.name)}</option>`).join("");
    $("aSource").value = a.source === "panel" && a.panel ? `panel:${a.panel}` : a.source === "own" ? "own" : "auto";
    $("aCode").value = a.code || "";
    $("aExit").value = a.exit_delay; $("aEntry").value = a.entry_delay; $("aSiren").value = a.siren_minutes;
    const own = () => $("aSource").value === "own" || ($("aSource").value === "auto" && !info.panels.length);
    $("tab-alarm").classList.toggle("own-off", !own());
    const set = (key, val) => { alarmCfg()[key] = val; saveSoon(); };
    $("aEnabled").onchange = () => set("enabled", $("aEnabled").checked);
    $("aAlexa").onchange = () => set("alexa", $("aAlexa").checked);
    $("aLights").onchange = () => set("lights_on", $("aLights").checked);
    $("aSource").onchange = () => {
      const v = $("aSource").value;
      alarmCfg().source = v.startsWith("panel:") ? "panel" : v;
      alarmCfg().panel = v.startsWith("panel:") ? v.slice(6) : "";
      $("tab-alarm").classList.toggle("own-off", !own()); saveSoon();
    };
    $("aCode").oninput = () => { const v = $("aCode").value.replace(/\D/g, ""); $("aCode").value = v; if (!v || v.length >= 4) set("code", v); };
    [["aExit", "exit_delay"], ["aEntry", "entry_delay"], ["aSiren", "siren_minutes"]].forEach(([id, key]) => {
      $(id).onchange = () => set(key, Number($(id).value));
    });
    const u = info.using || {};
    $("alarmInfo").textContent = (u.own ? `Our own alarm (${u.panel})` : u.panel ? `Using ${u.panel}` : "No alarm panel found.") +
      (u.state ? ` - now ${u.state}.` : u.own ? " - not created yet; Apply, then restart Home Assistant once." : "") +
      (u.own && !info.packages_ok ? " Home Assistant doesn't load packages yet (see Good to know)." : "") +
      (info.alexa && info.alexa.installed ? " Alexa Matter Bridge found." : "");
    $("alarmSensors").classList.toggle("muted", !info.sensors.length);
    $("alarmSensors").innerHTML = info.sensors.length ? `<div class="asrow head"><span>Sensor</span>${ARM.map(([, l]) => `<span style="text-align:center">${l}</span>`).join("")}</div>` +
      info.sensors.map((x) => `<div class="asrow"><span>${esc(x.name)} <small>${x.kind === "motion" ? "motion" : "door / window"}</small></span>
        ${ARM.map(([m]) => `<label><input type="checkbox" data-as="${esc(x.entity_id)}" data-m="${m}" ${x.modes.includes(m) ? "checked" : ""}></label>`).join("")}</div>`).join("")
      : "No door, window or motion sensors found.";
    $("alarmSensors").querySelectorAll("[data-as]").forEach((cb) => cb.addEventListener("change", () => {
      const row = [...$("alarmSensors").querySelectorAll(`[data-as="${CSS.escape(cb.dataset.as)}"]`)];
      alarmCfg().sensors[cb.dataset.as] = row.filter((c) => c.checked).map((c) => c.dataset.m);
      saveSoon();
    }));
    const picks = (box, list, key, idKey, empty) => {
      const chosen = Array.isArray(a[key]) ? a[key] : list.map((x) => x[idKey]);
      $(box).innerHTML = list.length ? list.map((x) => `<label class="switch"><input type="checkbox" data-pk="${esc(x[idKey])}"
        ${chosen.includes(x[idKey]) ? "checked" : ""}><span></span>${esc(x.name)}</label>`).join("") : `<span class="muted">${empty}</span>`;
      $(box).querySelectorAll("[data-pk]").forEach((cb) => cb.addEventListener("change", () => {
        set(key, [...$(box).querySelectorAll("[data-pk]:checked")].map((c) => c.dataset.pk));
      }));
    };
    picks("alarmSirens", info.sirens, "sirens", "entity_id", "No sirens found (siren entities, or switches named siren).");
    picks("alarmPhones", info.phones, "notify", "service", "No phones with the Home Assistant app found.");
  }

  async function applyAlarm() {
    const b = $("btnAlarmApply");
    if (!alarmCfg().enabled) return toast("Turn on \"Use the alarm pack\" first");
    b.disabled = true;
    $("alarmResult").innerHTML = `<div class="result">Applying…</div>`;
    await saveNow();
    const res = await api("api/alarm/apply", {});
    b.disabled = false;
    const steps = (res.steps || []).map((x) =>
      `<li>${x.ok ? "✓" : x.ok === false ? "✕" : "•"} ${esc(x.step)}${x.detail ? ` – <span class="muted">${esc(x.detail)}</span>` : ""}</li>`).join("");
    $("alarmResult").innerHTML = `<div class="result ${res.ok ? "ok" : "bad"}"><b>${res.ok ? "The alarm pack is set up." :
      esc(res.error || "Some steps failed – see below.")}</b>${steps ? `<ul>${steps}</ul>` : ""}</div>`;
    renderAlarm();
  }

  // ------------------------------------------------------------------ wall panels (QR codes + Fully Kiosk tablets)
  const wp = { info: null, timer: null };

  async function renderPanels(base) {
    const info = await api("api/wall_panels" + (base ? `?base=${encodeURIComponent(base)}` : ""));
    if (!info.ok) { $("wpQr").innerHTML = `<p class="muted">${esc(info.error || "Could not load.")}</p>`; return; }
    wp.info = info;
    if (document.activeElement !== $("wpBase")) $("wpBase").value = info.base_url || "";
    $("wpViewOff").hidden = info.panel_view !== false;
    const qr = info.qr || {};
    const tile = (kind, title) => info.urls[kind] && qr[kind]
      ? `<div class="qr">${qr[kind]}<b>${title}</b><code>${esc(info.urls[kind])}</code></div>` : "";
    $("wpQr").innerHTML = (tile("browser", "Browser / Fully Kiosk") || `<p class="muted">Enter the Home Assistant address
      (starting with http:// or https://) for the browser code.</p>`) + tile("app", "Home Assistant app") +
      (qr.error ? `<p class="muted">${esc(qr.error)}</p>` : "");
    const p = info.profile || {};
    $("wpMotion").checked = !!p.motion;
    $("wpKeepOn").checked = !!p.keep_on;
    $("wpDimAfter").value = p.dim_after;
    $("wpDimBright").value = p.dim_brightness;
    const tabs = info.tablets || [];
    $("wpTablets").classList.toggle("muted", !tabs.length);
    $("wpTablets").innerHTML = tabs.length ? tabs.map((t) => `<div class="tablet-row"><div><b>${esc(t.name)}</b>
        <small>${esc(t.model)}${t.entities.motion ? "" : " · no motion switch (needs PLUS)"}</small></div>
        <button class="btn" data-wp="${esc(t.device_id)}">Apply wall panel profile</button></div>`).join("")
      : "No Fully Kiosk tablets found in Home Assistant yet. Use the codes above, or add the Fully Kiosk Browser integration.";
    $("wpTablets").querySelectorAll("[data-wp]").forEach((b) => b.addEventListener("click", () => applyPanel(b)));
  }

  async function applyPanel(btn) {
    const url = (wp.info && wp.info.urls.browser) || "";
    if (!url) return toast("Enter the Home Assistant address first");
    btn.disabled = true;
    $("wpResult").innerHTML = `<div class="result">Applying…</div>`;
    const res = await api("api/wall_panels/apply", {
      device_id: btn.dataset.wp, url,
      profile: { motion: $("wpMotion").checked, keep_on: $("wpKeepOn").checked,
        dim_after: Number($("wpDimAfter").value), dim_brightness: Number($("wpDimBright").value) },
    });
    btn.disabled = false;
    const steps = (res.steps || []).map((s) =>
      `<li>${s.ok ? "✓" : "✕"} ${esc(s.step)}${s.detail ? ` – <span class="muted">${esc(s.detail)}</span>` : ""}</li>`).join("");
    $("wpResult").innerHTML = `<div class="result ${res.ok ? "ok" : "bad"}"><b>${res.ok ? `${esc(res.tablet)} is set up as a wall panel.` :
      esc(res.error || "Some steps failed – see below.")}</b>${steps ? `<ul>${steps}</ul>` : ""}</div>`;
  }

  // ------------------------------------------------------------------ music
  async function renderMusic() {
    const p = state.project;
    $("fMusicLibrary").checked = p.music_library !== false;
    $("fMusicLibrary").onchange = () => { p.music_library = $("fMusicLibrary").checked; saveSoon(); };
    const info = await api("api/music");
    const list = $("musicSteps");
    if (!info.ok) {
      list.innerHTML = `<li><span class="dot bad">!</span><div>${esc(info.error || "Check failed")}</div></li>`;
      return;
    }
    const ACT = { install: "Install and start", start: "Start", connect: "Connect" };
    list.innerHTML = info.steps.map((st) => {
      const cls = st.ok ? "ok" : st.action ? "warn" : "bad";
      return `<li><span class="dot ${cls}">${st.ok ? "✓" : "!"}</span><div><b>${esc(st.label)}</b>
        <div class="muted">${esc(st.detail || "")}</div>
        ${st.action ? `<button class="btn small primary step-act" data-music="${esc(st.action)}">${esc(ACT[st.action] || st.action)}</button>` : ""}</div></li>`;
    }).join("");
    list.querySelectorAll("[data-music]").forEach((b) => b.addEventListener("click", () => musicAction(b, b.dataset.music)));
    const ma = info.music_assistant || {};
    const open = $("btnMusicOpen");
    open.hidden = !ma.running;
    if (ma.panel) open.href = ma.panel;
    $("musicProviders").innerHTML = (info.providers || []).map((pr) => `<div class="provider">
      <b>${esc(pr.name)}<span class="lvl ${pr.level === "advanced" ? "advanced" : ""}">${pr.level === "advanced" ? "Advanced" : "Easy"}</span></b>
      <p class="acc">${esc(pr.account)}</p><p>${esc(pr.how)}</p></div>`).join("");
    const po = info.po_token || {};
    $("musicPo").innerHTML = `<ul class="checks"><li><span class="dot ${po.running ? "ok" : "warn"}">${po.running ? "✓" : "!"}</span>
      <div><b>YouTube Music helper (YT Music PO Token Generator)</b><div class="muted">${po.running ? "Running" :
        po.installed ? "Installed but not running" : "Only needed for YouTube Music"}</div>
      ${po.running ? "" : `<button class="btn small step-act" data-po>${po.installed ? "Start" : "Install and start"}</button>`}</div></li></ul>`;
    const b = $("musicPo").querySelector("[data-po]");
    if (b) b.addEventListener("click", () => musicAction(b, "po"));
  }

  async function musicAction(btn, act) {
    btn.disabled = true;
    btn.textContent = act === "connect" ? "Connecting…" : "Working… (installing can take a few minutes)";
    const res = act === "connect" ? await api("api/music/connect", {})
      : await api("api/music/install", { addon: act === "po" ? "ytm_po_token_generator" : "music_assistant" });
    toast(res.ok ? "Done" : res.error || "Failed");
    renderMusic();
  }

  // ------------------------------------------------------------------ tabs & init
  function activateTab(name) {
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
    document.querySelectorAll(".panel").forEach((p) => p.classList.toggle("active", p.id === `tab-${name}`));
    if (name === "licence" && !$("licFrame").src) $("licFrame").src = "license";
    if (name === "layout") { renderLayout(); if (!$("pvFrame").src) loadPreview(); }
    if (name === "modes") renderModes();
    if (name === "panels") renderPanels();
    if (name === "alarm") renderAlarm();
    if (name === "music") renderMusic();
  }

  async function init() {
    document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => activateTab(t.dataset.tab)));
    $("btnDeploy").addEventListener("click", deploy);
    $("btnDeployTop").addEventListener("click", deploy);
    $("btnApplyLayout").addEventListener("click", applyLayout);
    $("btnModesApply").addEventListener("click", applyModes);
    $("btnAlarmApply").addEventListener("click", applyAlarm);
    $("wpBase").addEventListener("input", () => {
      clearTimeout(wp.timer);
      wp.timer = setTimeout(() => renderPanels($("wpBase").value.trim()), 500);
    });
    $("btnMusicRefresh").addEventListener("click", renderMusic);
    document.querySelectorAll("[data-pv]").forEach((b) => b.addEventListener("click", () => {
      document.querySelectorAll("[data-pv]").forEach((x) => x.classList.toggle("on", x === b));
      state.pv = b.dataset.pv; loadPreview();
    }));
    $("btnPreview").addEventListener("click", preview);
    $("btnClosePreview").addEventListener("click", () => $("previewDialog").close());
    $("btnCopy").addEventListener("click", () => {
      navigator.clipboard.writeText($("previewCode").textContent).then(() => toast("Copied"), () => toast("Copy failed"));
    });
    $("btnRescan").addEventListener("click", loadDiscovery);
    $("roomSearch").addEventListener("input", () => state.layout && renderRooms());
    $("btnBlueprints").addEventListener("click", async () => {
      const r = await api("api/blueprints/install", {});
      toast(r.ok ? `${(r.installed || []).length} blueprints installed` : r.error || "Install failed");
      loadBlueprints();
    });

    const [proj, themes] = await Promise.all([api("api/project"), api("api/themes")]);
    if (!proj.ok) {
      document.querySelector("main").innerHTML = `<div class="result bad">Could not load project: ${esc(proj.error)}</div>`;
      return;
    }
    state.project = proj.project;
    state.themes = themes.themes || [];
    renderDesign();
    renderSupport();
    renderKpis();
    loadHealth();
    loadDiscovery();
    loadBackups();
    loadBlueprints();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
