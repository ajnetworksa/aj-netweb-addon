(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ORDER = ["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"];
  const PRAYERS = ["fajr", "dhuhr", "asr", "maghrib", "isha"];
  let S = null; // last status
  let saveTimer = null;

  async function api(path, body, raw) {
    const opts = body === undefined ? {} : raw ? { method: "POST", body, headers: raw }
      : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
    try { return await (await fetch(path, opts)).json(); } catch (e) { return { ok: false, error: e.message }; }
  }
  function toast(m) { const t = $("toast"); t.textContent = m; t.style.display = "block"; clearTimeout(t._h); t._h = setTimeout(() => (t.style.display = "none"), 2500); }
  function saveSoon(changes) {
    Object.assign(S.settings, changes);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => { const r = await api("api/settings", changes); toast(r.ok ? "Saved" : r.error || "Save failed"); }, 400);
  }
  const fmt = (iso) => iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "--:--";
  const nm = (k) => (S.names[S.settings.language] || S.names.en)[k] || k;

  function renderToday() {
    const h = S.hijri || {};
    $("hijri").textContent = S.settings.language === "ar" ? (h.formatted_ar || "") : (h.formatted_en || "");
    $("times").innerHTML = ORDER.filter((k) => S.times[k]).map((k) =>
      `<div class="t ${S.next.prayer === k ? "next" : ""}"><span class="muted">${esc(nm(k))}</span><b>${fmt(S.times[k])}</b></div>`).join("");
    $("setupHint").hidden = S.integration.installed && Object.keys(S.times).length > 0;
  }

  function tickCountdown() {
    if (!S || !S.next.time) { $("countdown").textContent = ""; return; }
    const ms = new Date(S.next.time) - Date.now();
    if (ms < 0) return load();
    const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
    $("countdown").textContent = `${nm(S.next.prayer)} in ${h ? h + " h " : ""}${m} min`;
  }

  async function renderSpeakers() {
    const r = await api("api/speakers");
    const set = new Set(S.settings.speakers), pause = new Set(S.settings.pause_players);
    $("volume").value = Math.round((S.settings.volume || 0.45) * 100);
    $("speakers").innerHTML = (r.speakers || []).map((sp) => `
      <div class="sp"><input type="checkbox" data-sp="${esc(sp.entity_id)}" ${set.has(sp.entity_id) ? "checked" : ""}>
        <div><div>${esc(sp.name)}</div><div class="muted small">${esc(sp.entity_id)}
          ${sp.music_assistant ? '<span class="tag">Music Assistant</span>' : sp.announce ? '<span class="tag">announce</span>' : ""}
          ${!sp.can_play && !sp.music_assistant ? '<span class="tag">cannot play files</span>' : ""}</div></div>
        <label class="small"><input type="checkbox" data-pause="${esc(sp.entity_id)}" ${pause.has(sp.entity_id) ? "checked" : ""}> Pause</label>
        <span class="muted small">${esc(sp.state)}</span></div>`).join("") || '<div class="muted">No media players found.</div>';
    $("speakers").querySelectorAll("[data-sp]").forEach((cb) => cb.onchange = () => {
      const list = [...$("speakers").querySelectorAll("[data-sp]:checked")].map((x) => x.dataset.sp);
      saveSoon({ speakers: list });
    });
    $("speakers").querySelectorAll("[data-pause]").forEach((cb) => cb.onchange = () => {
      const list = [...$("speakers").querySelectorAll("[data-pause]:checked")].map((x) => x.dataset.pause);
      saveSoon({ pause_players: list });
    });
  }

  function renderPrayers() {
    const p = S.settings.prayers;
    $("prayers").innerHTML = PRAYERS.map((k) => `<tr>
      <td>${esc(nm(k))} <span class="muted small">${fmt(S.times[k])}</span></td>
      <td><input type="checkbox" data-en="${k}" ${p[k].enabled ? "checked" : ""}></td>
      <td><input type="number" min="-30" max="30" data-off="${k}" value="${p[k].offset || 0}"></td>
      <td><input type="number" min="0" max="100" placeholder="default" data-vol="${k}" value="${p[k].volume != null ? Math.round(p[k].volume * 100) : ""}"></td></tr>`).join("");
    const upd = (k, patch) => saveSoon({ prayers: { [k]: Object.assign({}, S.settings.prayers[k], patch) } });
    $("prayers").querySelectorAll("[data-en]").forEach((e) => e.onchange = () => upd(e.dataset.en, { enabled: e.checked }));
    $("prayers").querySelectorAll("[data-off]").forEach((e) => e.onchange = () => upd(e.dataset.off, { offset: Number(e.value) || 0 }));
    $("prayers").querySelectorAll("[data-vol]").forEach((e) => e.onchange = () => upd(e.dataset.vol, { volume: e.value === "" ? null : Number(e.value) / 100 }));
    const s = S.settings;
    $("reminder").value = s.reminder_minutes; $("suhoor").value = s.suhoor_minutes; $("hijriAdj").value = s.hijri_adjust;
    $("lang").value = s.language; $("notifyAt").checked = s.notify_at_adhan; $("onlyHome").checked = s.only_when_home;
  }

  function renderAudio() {
    const opts = (sel) => `<option value="">— none —</option>` + S.files.map((f) => `<option ${f === sel ? "selected" : ""}>${esc(f)}</option>`).join("");
    $("defaultFile").innerHTML = opts(S.settings.default_file);
    $("fajrFile").innerHTML = opts(S.settings.fajr_file);
    $("duaFile").innerHTML = opts(S.settings.dua_file);
    $("files").innerHTML = S.files.map((f) => `<div class="sp" style="grid-template-columns:1fr auto auto">
      <div>${esc(f)}</div><audio controls preload="none" src="/local/ajnetweb_adhan/${encodeURIComponent(f)}"></audio>
      <button class="btn small" data-del="${esc(f)}">Delete</button></div>`).join("") || '<div class="muted">No files yet.</div>';
    $("files").querySelectorAll("[data-del]").forEach((b) => b.onclick = async () => {
      if (!confirm(`Delete ${b.dataset.del}?`)) return;
      await api("api/delete", { file: b.dataset.del }); load();
    });
  }

  function renderSetup() {
    const i = S.integration;
    const st = $("intStatus");
    st.className = "status " + (i.installed && Object.keys(i.sensors).length ? "ok" : "bad");
    st.innerHTML = i.installed ? `Installed · method <b>${esc(i.method || "isna (HA default)")}</b> · ${Object.keys(i.sensors).length} sensors`
      : "Not installed yet - press the button below.";
    $("method").innerHTML = S.methods.map(([k, l]) => `<option value="${k}" ${k === (i.method || "makkah") ? "selected" : ""}>${esc(l)}</option>`).join("");
    $("helpers").innerHTML = Object.entries(S.helpers).map(([k, v]) => `<div><code>${esc(v)}</code></div>`).join("") || "Not created yet";
  }

  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  let climates = [];

  function savePrecool() { saveSoon({ precool: JSON.parse(JSON.stringify(S.settings.precool)) }); }

  async function renderPrecool() {
    const r = await api("api/climates");
    climates = r.climates || [];
    const pc = S.settings.precool;
    $("pcEnabled").checked = pc.enabled;
    $("pcSeason").textContent = r.season ? `(now: ${r.season})` : "";
    $("pcMonths").innerHTML = MONTHS.map((m, i) =>
      `<label class="small"><input type="checkbox" data-month="${i + 1}" ${pc.summer_months.includes(i + 1) ? "checked" : ""}> ${m}</label>`).join("");
    $("pcMonths").querySelectorAll("[data-month]").forEach((cb) => cb.onchange = () => {
      S.settings.precool.summer_months = [...$("pcMonths").querySelectorAll("[data-month]:checked")].map((x) => Number(x.dataset.month));
      savePrecool();
    });
    renderRules();
  }

  function renderRules() {
    const pc = S.settings.precool;
    $("pcRules").innerHTML = pc.rules.map((rule, i) => `<div class="card" data-rule="${i}">
      <div class="row"><input type="text" data-k="name" value="${esc(rule.name)}" style="flex:1;min-width:160px">
        <label class="small"><input type="checkbox" data-k="enabled" ${rule.enabled ? "checked" : ""}> On</label></div>
      <div class="grid" style="margin-top:12px">
        <label class="f">Minutes before<input type="number" min="0" max="180" data-k="minutes" value="${rule.minutes}"></label>
        <label class="f">Mode<select data-k="hvac_mode">${["cool", "heat", "heat_cool", "auto"].map((m) =>
          `<option ${m === rule.hvac_mode ? "selected" : ""}>${m}</option>`).join("")}</select></label>
        <label class="f">Summer temperature °<input type="number" min="16" max="30" step="0.5" data-k="summer_temp" value="${rule.summer_temp}"></label>
        <label class="f">Winter temperature ° (blank = rest)<input type="number" min="16" max="30" step="0.5" data-k="winter_temp" value="${rule.winter_temp ?? ""}"></label>
      </div>
      <div style="margin-top:12px"><div class="small" style="font-weight:600">Before</div><div class="chips">${PRAYERS.map((p) =>
        `<label><input type="checkbox" data-prayer="${p}" ${rule.prayers.includes(p) ? "checked" : ""}> ${esc(nm(p))}</label>`).join("")}</div></div>
      <div style="margin-top:12px"><div class="small" style="font-weight:600">ACs</div><div class="chips">${climates.map((c) =>
        `<label><input type="checkbox" data-climate="${esc(c.entity_id)}" ${rule.climates.includes(c.entity_id) ? "checked" : ""}> ${esc(c.name)}</label>`).join("")
        || '<span class="muted small">No climate entities found.</span>'}</div></div>
      <div class="row" style="margin-top:12px">
        <div class="chips"><label><input type="checkbox" data-k="only_when_home" ${rule.only_when_home ? "checked" : ""}> Only when someone is home</label>
          <label><input type="checkbox" data-k="ramadan_only" ${rule.ramadan_only ? "checked" : ""}> Only in Ramadan</label></div>
        <div><button class="btn small" data-test>Run now</button> <button class="btn small" data-del>Delete</button></div></div>
    </div>`).join("") || '<div class="card muted">No pre-cooling yet.</div>';

    // Look the rule up on every change: the page reloads its status every minute.
    $("pcRules").querySelectorAll("[data-rule]").forEach((card) => {
      const idx = Number(card.dataset.rule);
      const cur = () => S.settings.precool.rules[idx];
      card.querySelectorAll("[data-k]").forEach((el) => el.onchange = () => {
        const k = el.dataset.k;
        const rule = cur();
        if (el.type === "checkbox") rule[k] = el.checked;
        else if (k === "winter_temp") rule[k] = el.value === "" ? null : Number(el.value);
        else if (el.type === "number") rule[k] = Number(el.value) || 0;
        else rule[k] = el.value;
        savePrecool();
      });
      card.querySelectorAll("[data-prayer]").forEach((el) => el.onchange = () => {
        cur().prayers = [...card.querySelectorAll("[data-prayer]:checked")].map((x) => x.dataset.prayer); savePrecool();
      });
      card.querySelectorAll("[data-climate]").forEach((el) => el.onchange = () => {
        cur().climates = [...card.querySelectorAll("[data-climate]:checked")].map((x) => x.dataset.climate); savePrecool();
      });
      card.querySelector("[data-del]").onclick = () => {
        if (!confirm(`Delete ${cur().name}?`)) return;
        S.settings.precool.rules.splice(idx, 1); savePrecool(); renderRules();
      };
      card.querySelector("[data-test]").onclick = async () => {
        clearTimeout(saveTimer);
        await api("api/settings", { precool: JSON.parse(JSON.stringify(S.settings.precool)) });
        const res = await api("api/precool/test", { id: cur().id });
        const out = res.entry && res.entry.result;
        toast(!res.ok ? res.error || "Failed" : typeof out === "string" ? out
          : Object.entries(out || {}).map(([e, m]) => `${e.replace("climate.", "")}: ${m}`).join(", ") || "Done");
      };
    });
  }

  async function renderHistory() {
    const r = await api("api/history");
    $("history").innerHTML = (r.history || []).map((h) => `<div class="sp" style="grid-template-columns:1fr auto">
      <div><b>${h.kind === "precool" ? `❄ ${esc(h.rule)} · before ${esc(nm(h.prayer))}` : esc(nm(h.prayer))}</b> ${h.manual ? '<span class="tag">test</span>' : ""}<div class="muted small">${new Date(h.at).toLocaleString()}</div></div>
      <div class="small muted">${esc(typeof h.result === "string" ? h.result : Object.entries(h.result || {}).map(([e, m]) => `${e}: ${m}`).join(", "))}</div></div>`).join("")
      || '<div class="muted">Nothing played yet.</div>';
  }

  async function load() {
    const r = await api("api/status");
    if (!r.ok) { toast(r.error || "Could not load"); return; }
    S = r;
    renderToday(); renderPrayers(); renderAudio(); renderSetup();
  }

  document.querySelectorAll(".tab").forEach((t) => t.onclick = () => {
    document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("active", x === t));
    document.querySelectorAll(".panel").forEach((p) => p.classList.toggle("active", p.id === "tab-" + t.dataset.tab));
    if (t.dataset.tab === "speakers") renderSpeakers();
    if (t.dataset.tab === "history") renderHistory();
    if (t.dataset.tab === "precool") renderPrecool();
  });
  $("pcEnabled").onchange = () => { S.settings.precool.enabled = $("pcEnabled").checked; savePrecool(); };
  $("pcAdd").onclick = () => {
    const pc = S.settings.precool;
    pc.rules.push({ id: "r" + Date.now().toString(36), name: `Pre-cool ${pc.rules.length + 1}`, enabled: true,
      prayers: ["maghrib"], minutes: 30, climates: [], hvac_mode: "cool", summer_temp: 22, winter_temp: null,
      only_when_home: false, ramadan_only: false });
    savePrecool(); renderRules();
  };
  $("volume").onchange = () => saveSoon({ volume: Number($("volume").value) / 100 });
  $("reminder").onchange = () => saveSoon({ reminder_minutes: Number($("reminder").value) || 0 });
  $("suhoor").onchange = () => saveSoon({ suhoor_minutes: Number($("suhoor").value) || 0 });
  $("hijriAdj").onchange = () => saveSoon({ hijri_adjust: Number($("hijriAdj").value) || 0 });
  $("lang").onchange = () => { saveSoon({ language: $("lang").value }); setTimeout(load, 600); };
  $("notifyAt").onchange = () => saveSoon({ notify_at_adhan: $("notifyAt").checked });
  $("onlyHome").onchange = () => saveSoon({ only_when_home: $("onlyHome").checked });
  $("defaultFile").onchange = () => saveSoon({ default_file: $("defaultFile").value });
  $("fajrFile").onchange = () => saveSoon({ fajr_file: $("fajrFile").value });
  $("duaFile").onchange = () => saveSoon({ dua_file: $("duaFile").value });
  $("btnTest").onclick = async () => { const r = await api("api/test", { prayer: S.next.prayer || "dhuhr" }); toast(r.ok ? "Playing…" : r.error); setTimeout(renderHistory, 3000); };
  $("btnStop").onclick = async () => { await api("api/stop", {}); toast("Stopped"); };
  $("btnSetup").onclick = async () => {
    $("btnSetup").disabled = true;
    const r = await api("api/setup", { method: $("method").value, school: $("school").value });
    $("btnSetup").disabled = false;
    toast(r.ok ? "Prayer times set up" : r.error || "Setup failed");
    setTimeout(load, 2500);
  };
  $("btnUpload").onclick = async () => {
    const f = $("file").files[0];
    if (!f) return toast("Choose a file first");
    const r = await api("api/upload", f, { "X-Filename": encodeURIComponent(f.name), "Content-Type": "application/octet-stream" });
    toast(r.ok ? `Uploaded ${r.file} (${r.seconds}s)` : r.error);
    if (r.ok && !S.settings.default_file) saveSoon({ default_file: r.file });
    load();
  };

  load();
  setInterval(tickCountdown, 15000);
  setInterval(load, 60000);
  setTimeout(tickCountdown, 800);
})();
