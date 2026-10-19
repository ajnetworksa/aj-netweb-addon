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
    insights: ["📊", "Today at home", "Agenda, energy today, room temperatures (24 h graph)"],
    cameras: ["📹", "Cameras", "Large pictures; gate/garage buttons on the picture"],
    custom: ["🧩", "My cards", "Your own cards from the My cards dashboard"],
  };
  const DEFAULT_ORDER = {
    home: ["top", "modes", "scenes", "access", "favorites", "rooms", "climate", "insights", "cameras", "custom"],
    panel: ["top", "modes", "cameras", "rooms", "scenes", "access", "favorites", "climate", "insights", "custom"],
  };
  const INSIGHTS = { calendar: ["📅", "Agenda", "Next events from the HA calendars"],
    energy: ["⚡", "Energy", "Used today and the last 7 days (from HA's Energy settings)"],
    temperature: ["🌡️", "Room temperatures", "Every room's temperature over 24 h"] };
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
    const insOn = Array.isArray(p.insights) ? p.insights : Object.keys(INSIGHTS);
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
      on: true, fixed: floors[a.floor_id] || "No floor", actions: [["rename", "✏️", "Rename room"], ["photo", "📷", "Upload room photo"]] })),
      (list) => { p.room_order = list.map((r) => r.id); saveSoon(); },
      (act, row) => (act === "rename" ? renameRoom(row) : pickPhoto(row)));
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

  // pick a photo, shrink it in the browser (max 1600 px, JPEG) and set it as the HA area picture
  function pickPhoto(row) {
    const input = document.createElement("input");
    input.type = "file"; input.accept = "image/*";
    input.onchange = () => {
      const file = input.files && input.files[0];
      if (!file) return;
      const img = new Image();
      img.onload = async () => {
        const k = Math.min(1, 1600 / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(img.src);
        toast("Uploading photo…");
        const r = await api("api/room", { area_id: row.id, photo: c.toDataURL("image/jpeg", 0.85) });
        if (!r.ok) return toast(r.error || "Upload failed");
        const a = state.layout.areas.find((x) => x.id === row.id);
        if (a) a.picture = r.picture;
        toast("Photo set - it shows on the photo room cards and room sheets");
        renderLayoutRooms();
      };
      img.onerror = () => toast("That file is not an image");
      img.src = URL.createObjectURL(file);
    };
    input.click();
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

  // ------------------------------------------------------------------ tabs & init
  function activateTab(name) {
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
    document.querySelectorAll(".panel").forEach((p) => p.classList.toggle("active", p.id === `tab-${name}`));
    if (name === "licence" && !$("licFrame").src) $("licFrame").src = "license";
    if (name === "layout") { renderLayout(); if (!$("pvFrame").src) loadPreview(); }
    if (name === "modes") renderModes();
  }

  async function init() {
    document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => activateTab(t.dataset.tab)));
    $("btnDeploy").addEventListener("click", deploy);
    $("btnDeployTop").addEventListener("click", deploy);
    $("btnApplyLayout").addEventListener("click", applyLayout);
    $("btnModesApply").addEventListener("click", applyModes);
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
