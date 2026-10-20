// custom:ajnetweb-music-browser-card - the music library in the dashboard's own design.
// Everything the client added in Music Assistant (Spotify, YouTube Music, Apple Music, Tidal, radio, own
// files) as tiles: Favourites, Playlists, Radio, Albums, Artists, Songs, plus search. Tap a tile to play it
// on the chosen speaker; the arrow on albums, playlists and artists opens their songs.
//
//   entities: [media_player.majlis, ...]       # speakers to offer; default: Music Assistant players
//   music_assistant_entry: <config entry id>   # needed for non-admin users (the Studio fills it in)
//   tabs: [favorites, playlists, radio, albums, artists, tracks]   # which tabs, in this order
//   app: true                                  # "Music Assistant" button: its own app in your colours
//
// Data: the Music Assistant integration's services (get_library, search, play_media) and HA's standard
// media browser (media_player/browse_media) for an album's or playlist's songs. All allowed for normal users.
import { AjnBase, bindGestures, cssUrl, esc, haptic } from "../core/base.js";
import { musicPlayers } from "./music.js";
import { musicAssistantAddon } from "./music-library.js";

const STR = {
  en: {
    title: "Music library", favorites: "Favourites", playlists: "Playlists", radio: "Radio", albums: "Albums",
    artists: "Artists", tracks: "Songs", search: "Search Spotify, YouTube Music, radio…", play_on: "Play on",
    empty: "Nothing here yet. Add music services in Music Assistant (Settings → Music sources) and mark favourites.",
    no_ma: "Music Assistant is not set up yet. The installer adds it in Dashboard Suite → Music.",
    no_entry: "Ask the installer to deploy the dashboard again so everyone can browse music.",
    no_speaker: "No Music Assistant speakers yet.", app: "Music Assistant", back: "Back", play_all: "Play all",
    playing_on: "Playing on {name}", failed: "Could not play",
  },
  ar: {
    title: "مكتبة الموسيقى", favorites: "المفضلة", playlists: "قوائم التشغيل", radio: "الإذاعة", albums: "الألبومات",
    artists: "الفنانون", tracks: "الأغاني", search: "ابحث في Spotify أو YouTube Music أو الإذاعة…", play_on: "التشغيل على",
    empty: "لا يوجد شيء بعد. أضف خدمات الموسيقى في Music Assistant (الإعدادات ← مصادر الموسيقى) وحدد المفضلة.",
    no_ma: "لم يتم إعداد Music Assistant بعد. يضيفه الفني من Dashboard Suite ← الموسيقى.",
    no_entry: "اطلب من الفني إعادة نشر لوحة التحكم ليتمكن الجميع من تصفح الموسيقى.",
    no_speaker: "لا توجد سماعات Music Assistant بعد.", app: "Music Assistant", back: "رجوع", play_all: "تشغيل الكل",
    playing_on: "يعمل على {name}", failed: "تعذّر التشغيل",
  },
};

const TABS = {
  favorites: { icon: "mdi:heart", types: ["playlist", "radio", "album", "artist", "track"], favorite: true },
  playlists: { icon: "mdi:playlist-music", types: ["playlist"] },
  radio: { icon: "mdi:radio", types: ["radio"] },
  albums: { icon: "mdi:album", types: ["album"] },
  artists: { icon: "mdi:account-music", types: ["artist"] },
  tracks: { icon: "mdi:music-note", types: ["track"] },
};
const TYPE_ICON = { playlist: "mdi:playlist-music", radio: "mdi:radio", album: "mdi:album", artist: "mdi:account-music", track: "mdi:music-note" };
const SUB = { playlist: "playlists", radio: "radio", album: "albums", artist: "artists", track: "tracks" };
const OPENABLE = ["album", "playlist", "artist"];
const PAGE = 48;

let _entry; // cached Music Assistant config entry id

export class AjnetwebMusicBrowserCard extends AjnBase {
  static getStubConfig() {
    return {};
  }

  setConfig(config) {
    super.setConfig(config || {});
    const tabs = (this._config.tabs || Object.keys(TABS)).filter((t) => TABS[t]);
    this._tabs = tabs.length ? tabs : Object.keys(TABS);
    this._tab = this._tabs[0];
    this._cache = {};
    this._query = "";
    this._detail = null;
  }

  s(key, vars) {
    let v = (STR[this.lang()] || STR.en)[key] || STR.en[key] || key;
    if (vars) Object.entries(vars).forEach(([k, val]) => (v = v.replace(`{${k}}`, val)));
    return v;
  }

  _players() {
    return (this._config.entities && this._config.entities.length ? this._config.entities : musicPlayers(this._hass, true))
      .filter((id) => this.st(id));
  }

  _target() {
    const list = this._players();
    if (this._selected && list.includes(this._selected)) return this._selected;
    return list.find((id) => this.st(id).state === "playing") || list[0];
  }

  watched() {
    // nothing: a playing speaker updates every second and would redraw every tile
    return [];
  }

  async _entryId() {
    if (this._config.music_assistant_entry) return this._config.music_assistant_entry;
    if (_entry !== undefined) return _entry;
    try {
      const entries = await this._hass.callWS({ type: "config_entries/get", domain: "music_assistant" });
      _entry = (entries.find((e) => e.state === "loaded") || entries[0] || {}).entry_id || null;
    } catch (e) {
      _entry = null; // not an admin: the Studio passes the id in the strategy
    }
    return _entry;
  }

  async _ma(service, data) {
    const res = await this._hass.callWS({ type: "call_service", domain: "music_assistant", service,
                                          service_data: data, return_response: true });
    return (res && res.response) || {};
  }

  async _load(key) {
    if (this._cache[key] && this._cache[key] !== "error") return;
    const entry = await this._entryId();
    if (!entry) { this._cache[key] = "no_entry"; return this.render(); }
    this._cache[key] = "loading";
    this.render();
    try {
      let items;
      if (key.startsWith("search:")) {
        const r = await this._ma("search", { config_entry_id: entry, name: key.slice(7), limit: 12 });
        items = ["playlists", "artists", "albums", "tracks", "radio"].flatMap((k) => r[k] || []);
      } else {
        const tab = TABS[key];
        const lists = await Promise.all(tab.types.map((media_type) => this._ma("get_library", {
          config_entry_id: entry, media_type, limit: tab.favorite ? 16 : PAGE, order_by: "sort_name",
          ...(tab.favorite ? { favorite: true } : {}) }).catch(() => ({}))));
        items = lists.flatMap((r) => r.items || []);
      }
      this._cache[key] = items;
    } catch (e) {
      this._cache[key] = "error";
    }
    this.render();
  }

  async _open(item) {
    // an album / playlist / artist: its songs, from HA's standard media browser of the chosen speaker
    const player = this._target();
    this._detail = { item, items: "loading" };
    this.render();
    try {
      const r = await this._hass.callWS({ type: "media_player/browse_media", entity_id: player,
                                          media_content_id: item.uri, media_content_type: item.media_type });
      this._detail.items = (r.children || []).map((c) => ({ name: c.title, uri: c.media_content_id,
        media_type: c.media_content_type || "track", image: c.thumbnail, playable: c.can_play, openable: c.can_expand }));
    } catch (e) {
      this._detail.items = [];
    }
    this.render();
  }

  async _play(item) {
    const id = this._target();
    if (!id || !item) return;
    haptic("light");
    try {
      await this._hass.callService("music_assistant", "play_media",
        { entity_id: id, media_id: item.uri, media_type: item.media_type, enqueue: "replace" });
      this.notify(this.s("playing_on", { name: (this.st(id).attributes.friendly_name || id) }));
    } catch (e) {
      this.notify(`${this.s("failed")}: ${(e && e.message) || e}`);
    }
  }

  css() {
    return `
      .wrap { padding: 16px; display: grid; gap: 14px; }
      .head { display: flex; align-items: center; gap: 10px; }
      .head .t { flex: 1; font-size: 17px; font-weight: 700; color: var(--_text); letter-spacing: -.01em; }
      .head ha-icon.lead { color: var(--_accent); }
      .pill { display: inline-flex; align-items: center; gap: 6px; height: 34px; padding: 0 14px; border-radius: 999px;
              border: 1px solid var(--_border); background: transparent; color: var(--_text); font: inherit; font-size: 13px;
              font-weight: 600; cursor: pointer; white-space: nowrap; }
      .pill ha-icon { --mdc-icon-size: 18px; color: var(--_text2); }
      .chips { display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none; padding: 2px; }
      .chips::-webkit-scrollbar { display: none; }
      .chip { flex: none; display: inline-flex; align-items: center; gap: 7px; height: 36px; padding: 0 14px 0 10px; border-radius: 999px;
              border: 1px solid var(--_border); background: transparent; color: var(--_text); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
      .chip ha-icon { --mdc-icon-size: 18px; color: var(--_text2); }
      .chip.sel { background: var(--_grad); color: #fff; border-color: transparent; }
      .chip.sel ha-icon { color: #fff; }
      .lbl { flex: none; white-space: nowrap; font-size: 12px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--_text2); margin-inline-start: 2px; }
      input.search { width: 100%; box-sizing: border-box; font: inherit; font-size: 15px; padding: 12px 16px; border-radius: 14px;
                     border: 1px solid var(--_border); background: var(--_muted); color: var(--_text); outline: none; }
      .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; }
      .it { position: relative; border-radius: 16px; padding: 8px; background: var(--_muted); min-width: 0; cursor: pointer;
            transition: transform .15s var(--_ease); }
      .it:active { transform: scale(.97); }
      .im { aspect-ratio: 1; border-radius: 12px; background: var(--_grad) center/cover; display: grid; place-items: center; color: rgba(255,255,255,.85); }
      .im ha-icon { --mdc-icon-size: 34px; }
      .it.artist .im { border-radius: 50%; }
      .nm { font-size: 14px; font-weight: 600; margin-top: 8px; color: var(--_text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .sb { font-size: 12px; color: var(--_text2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .play { position: absolute; inset-inline-end: 14px; top: calc(100% - 92px); width: 40px; height: 40px; border-radius: 50%; border: none;
              background: var(--_grad); color: #fff; display: grid; place-items: center; box-shadow: 0 6px 16px rgba(0,0,0,.3); cursor: pointer; }
      .rows { display: grid; gap: 4px; }
      .row { display: grid; grid-template-columns: 44px 1fr auto; gap: 12px; align-items: center; padding: 6px; border-radius: 12px; cursor: pointer; }
      .row:active { background: var(--_muted); }
      .row .im { width: 44px; border-radius: 8px; } .row .im ha-icon { --mdc-icon-size: 20px; }
      .row .nm { margin: 0; }
      .row ha-icon.p { color: var(--_accent); }
      .dhead { display: grid; grid-template-columns: 96px 1fr; gap: 16px; align-items: center; }
      .dhead .im { width: 96px; }
      .dhead .nm { font-size: 19px; font-weight: 700; white-space: normal; }
      .msg { font-size: 14px; color: var(--_text2); padding: 10px 2px; line-height: 1.5; }
      @container (max-width: 420px) { .grid { grid-template-columns: repeat(2, 1fr); gap: 10px; } .play { width: 36px; height: 36px; } }
    `;
  }

  _tile(it, i, list) {
    const type = it.media_type || "track";
    const img = it.image || (it.album && it.album.image) || "";
    const sub = (it.artists || []).map((a) => a.name).join(", ") || this.s(SUB[type] || "tracks");
    return `<div class="it ${esc(type)}" data-play="${list}:${i}">
      <div class="im" ${img ? `style="background-image:${esc(cssUrl(img))}"` : ""}>${img ? "" : `<ha-icon icon="${TYPE_ICON[type] || "mdi:music"}"></ha-icon>`}</div>
      <button class="play" data-play="${list}:${i}" aria-label="▶"><ha-icon icon="mdi:play"></ha-icon></button>
      <div class="nm">${esc(it.name)}</div><div class="sb">${esc(sub)}</div></div>`;
  }

  _status(v) {
    if (v === "loading" || v === undefined) return `<div class="msg">…</div>`;
    if (v === "no_entry") return `<div class="msg">${esc(this.s("no_entry"))}</div>`;
    if (v === "error" || !v.length) return `<div class="msg">${esc(this.s("empty"))}</div>`;
    return "";
  }

  render() {
    // don't rebuild while someone types a search (speakers update every second while playing)
    const focused = this.shadowRoot.activeElement;
    if (!this._force && focused && focused.classList && focused.classList.contains("search")) { this._deferred = true; return; }
    this._force = false;
    const dir = this.lang() === "ar" ? "rtl" : "ltr";
    const players = this._players();
    const slug = musicAssistantAddon(this._hass);
    if (!players.length && !slug) {
      this.html(`<ha-card dir="${dir}"><div class="wrap"><div class="msg">${esc(this.s("no_ma"))}</div></div></ha-card>`);
      return;
    }
    const target = this._target();
    const app = this._config.app !== false && slug;
    const speakers = players.length > 1 ? `<div class="chips"><span class="lbl" style="align-self:center">${esc(this.s("play_on"))}</span>${players.map((p) => `
      <button class="chip ${p === target ? "sel" : ""}" data-player="${esc(p)}"><ha-icon icon="${this.st(p).state === "playing" ? "mdi:volume-high" : "mdi:speaker"}"></ha-icon>${esc(this.st(p).attributes.friendly_name || p)}</button>`).join("")}</div>`
      : players.length ? "" : `<div class="msg">${esc(this.s("no_speaker"))}</div>`;

    let body;
    const d = this._detail;
    if (d) {
      const it = d.item;
      const img = it.image || "";
      body = `<div><button class="pill" data-back><ha-icon icon="mdi:arrow-left"></ha-icon>${esc(this.s("back"))}</button></div>
        <div class="dhead"><div class="im" ${img ? `style="background-image:${esc(cssUrl(img))}"` : ""}>${img ? "" : `<ha-icon icon="${TYPE_ICON[it.media_type] || "mdi:music"}"></ha-icon>`}</div>
          <div><div class="nm">${esc(it.name)}</div><div class="sb">${esc((it.artists || []).map((a) => a.name).join(", "))}</div>
          <div style="margin-top:10px"><button class="chip sel" data-play-detail><ha-icon icon="mdi:play"></ha-icon>${esc(this.s("play_all"))}</button></div></div></div>
        ${d.items === "loading" ? `<div class="msg">…</div>` : `<div class="rows">${d.items.map((t, i) => `
          <div class="row" data-row="${i}"><div class="im" ${t.image ? `style="background-image:${esc(cssUrl(t.image))}"` : ""}>${t.image ? "" : '<ha-icon icon="mdi:music-note"></ha-icon>'}</div>
            <div style="min-width:0"><div class="nm">${esc(t.name)}</div></div><ha-icon class="p" icon="${t.openable && !t.playable ? "mdi:chevron-right" : "mdi:play-circle"}"></ha-icon></div>`).join("")}</div>`}`;
    } else {
      const key = this._query ? `search:${this._query}` : this._tab;
      const items = this._cache[key];
      body = `<input class="search" type="search" placeholder="${esc(this.s("search"))}" value="${esc(this._query)}">
        ${this._query ? "" : `<div class="chips">${this._tabs.map((t) => `<button class="chip ${t === this._tab ? "sel" : ""}" data-tab="${t}">
          <ha-icon icon="${TABS[t].icon}"></ha-icon>${esc(this.s(t))}</button>`).join("")}</div>`}
        ${this._status(items) || `<div class="grid">${items.map((it, i) => this._tile(it, i, "list")).join("")}</div>`}`;
      if (items === undefined) this._load(key);
    }
    this.html(`<ha-card dir="${dir}"><div class="wrap">
      <div class="head"><ha-icon class="lead" icon="mdi:music-box-multiple"></ha-icon><div class="t">${esc(this.s("title"))}</div>
        ${app ? `<button class="pill" data-app><ha-icon icon="mdi:music-circle"></ha-icon>${esc(this.s("app"))}</button>` : ""}</div>
      ${speakers}${body}</div></ha-card>`);
    this._bind();
  }

  _list(ref) {
    const [, i] = ref.split(":");
    const key = this._query ? `search:${this._query}` : this._tab;
    return (this._cache[key] || [])[+i];
  }

  _bind() {
    const sr = this.shadowRoot;
    sr.querySelectorAll("[data-tab]").forEach((b) => bindGestures(b, { onTap: () => { haptic("light"); this._tab = b.dataset.tab; this.render(); } }));
    sr.querySelectorAll("[data-player]").forEach((b) => bindGestures(b, { onTap: () => { haptic("light"); this._selected = b.dataset.player; this.render(); } }));
    sr.querySelectorAll(".it[data-play]").forEach((el) => bindGestures(el, { onTap: (e) => {
      const it = this._list(el.dataset.play);
      const onPlay = e && e.target && e.target.closest && e.target.closest(".play");
      // albums, playlists and artists open their songs; the round button (and everything else) plays
      return OPENABLE.includes(it.media_type) && !onPlay ? this._open(it) : this._play(it);
    } }));
    const back = sr.querySelector("[data-back]");
    if (back) bindGestures(back, { onTap: () => { this._detail = null; this.render(); } });
    const all = sr.querySelector("[data-play-detail]");
    if (all) bindGestures(all, { onTap: () => this._play(this._detail.item) });
    sr.querySelectorAll("[data-row]").forEach((el) => bindGestures(el, { onTap: () => {
      const t = this._detail.items[+el.dataset.row];
      if (t.openable && !t.playable) return this._open(t);
      return this._play(t);
    } }));
    const app = sr.querySelector("[data-app]");
    if (app) bindGestures(app, { onTap: () => this._openApp() });
    const input = sr.querySelector("input.search");
    if (input) {
      const go = () => { this._query = input.value.trim(); this._force = true; this.render(); };
      input.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
      input.addEventListener("search", go);
      input.addEventListener("blur", () => { if (this._deferred) { this._deferred = false; this._force = true; this.render(); } });
    }
  }

  _openApp() {
    // Music Assistant's own app (settings, queue, providers) full screen, painted in the person's colours
    haptic("light");
    const lib = document.createElement("ajnetweb-music-library-card");
    lib.setConfig({ language: this._config.language, palette: this._config.palette, closable: true });
    lib.hass = this._hass;
    lib.addEventListener("ajn-close", () => lib.remove());
    this.shadowRoot.appendChild(lib);
    lib._setFull(true);
  }

  getCardSize() {
    return 8;
  }

  getGridOptions() {
    return { columns: "full", rows: "auto" };
  }
}
