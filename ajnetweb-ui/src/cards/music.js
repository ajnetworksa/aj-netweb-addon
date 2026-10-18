// custom:ajnetweb-music-card - premium music player for Home Assistant media players.
// Best with Music Assistant (official HA project): YouTube Music, Spotify, Apple Music, Tidal,
// Deezer, SoundCloud, TuneIn/radio - search, favourites and moving music between rooms.
// Plain media players (Cast, Sonos, AirPlay, Spotify Connect...) get the playback controls.
//
//   entities: [media_player.majlis, ...]   # default: Music Assistant players, else all speakers
//   entity: media_player.majlis            # start with this one
//   music_assistant_entry: <config entry id>  # optional; found automatically for admins
//   variant: full | compact ; search: true ; favorites: true
import { AjnBase, OFFLINE, bindGestures, cssUrl, esc, haptic } from "../core/base.js";
import { COLORS } from "../core/styles.js";

const F = { PAUSE: 1, VOLUME_SET: 4, VOLUME_MUTE: 8, PREV: 16, NEXT: 32, PLAY: 16384, SHUFFLE: 32768, REPEAT: 262144 };
const ACTIVE = ["playing", "paused", "buffering"];
let _maEntry; // cached Music Assistant config entry id (undefined = not looked up yet)

export function musicPlayers(hass, onlyMa) {
  const all = Object.values(hass.states).filter((s) => s.entity_id.startsWith("media_player."));
  const ma = all.filter((s) => s.attributes.mass_player_type);
  if (ma.length || onlyMa) return ma.map((s) => s.entity_id);
  return all.filter((s) => s.attributes.device_class !== "tv" && ((s.attributes.supported_features || 0) & F.PLAY))
    .map((s) => s.entity_id);
}

export class AjnetwebMusicCard extends AjnBase {
  static getStubConfig() {
    return {};
  }

  setConfig(config) {
    super.setConfig(config || {});
    this._query = "";
    this._results = null;
  }

  _players() {
    return (this._config.entities && this._config.entities.length ? this._config.entities : musicPlayers(this._hass))
      .filter((id) => this.st(id));
  }

  _current() {
    const list = this._players();
    if (this._selected && list.includes(this._selected)) return this._selected;
    const playing = list.find((id) => this.st(id).state === "playing");
    return playing || (this._config.entity && list.includes(this._config.entity) ? this._config.entity : list[0]);
  }

  watched() {
    return this._hass ? this._players() : [];
  }

  connectedCallback() {
    this._timer = setInterval(() => this._progress(), 1000);
  }

  disconnectedCallback() {
    clearInterval(this._timer);
  }

  async _maEntryId() {
    if (this._config.music_assistant_entry) return this._config.music_assistant_entry;
    if (_maEntry !== undefined) return _maEntry;
    try {
      const entries = await this._hass.callWS({ type: "config_entries/get", domain: "music_assistant" });
      _maEntry = (entries.find((e) => e.state === "loaded") || entries[0] || {}).entry_id || null;
    } catch (e) {
      _maEntry = null; // not an admin, or MA not installed
    }
    return _maEntry;
  }

  async _ma(service, data) {
    const res = await this._hass.callWS({ type: "call_service", domain: "music_assistant", service,
                                          service_data: data, return_response: true });
    return res && res.response;
  }

  _isMa(id) {
    const s = this.st(id);
    return !!(s && s.attributes.mass_player_type);
  }

  async _loadFavorites() {
    if (this._favs !== undefined || this._config.favorites === false) return;
    this._favs = null;
    const entry = await this._maEntryId();
    if (!entry) return;
    try {
      const lists = await Promise.all(["playlist", "radio", "album"].map((media_type) =>
        this._ma("get_library", { config_entry_id: entry, media_type, favorite: true, limit: 8 }).catch(() => null)));
      this._favs = lists.flatMap((r) => (r && r.items) || []).slice(0, 16);
      this.render();
    } catch (e) { /* keep empty */ }
  }

  async _search(q) {
    this._query = q;
    if (!q.trim()) { this._results = null; this._force = true; return this.render(); }
    const entry = await this._maEntryId();
    if (!entry) return;
    this._results = "loading";
    this._force = true;
    this.render();
    try {
      const r = await this._ma("search", { config_entry_id: entry, name: q, limit: 6 });
      this._results = r || {};
    } catch (e) {
      this._results = {};
      this.notify(`${this.t("failed")}: ${e.message || e}`);
    }
    this._force = true;
    this.render();
  }

  async _playItem(item) {
    const id = this._current();
    if (!id) return;
    haptic("light");
    if (this._isMa(id)) {
      await this.call("music_assistant.play_media", [id], { media_id: item.uri, media_type: item.media_type, enqueue: "replace" });
    } else {
      await this.call("media_player.play_media", [id], { media_content_id: item.uri, media_content_type: item.media_type || "music" });
    }
  }

  _progress() {
    const bar = this.shadowRoot && this.shadowRoot.querySelector(".prog i");
    const s = this.st(this._current());
    if (!bar || !s) return;
    const a = s.attributes;
    if (!a.media_duration) return;
    let pos = a.media_position || 0;
    if (s.state === "playing" && a.media_position_updated_at) pos += (Date.now() - new Date(a.media_position_updated_at)) / 1000;
    bar.style.width = `${Math.min(100, (pos / a.media_duration) * 100)}%`;
  }

  _art(s) {
    return s && (s.attributes.entity_picture_local || s.attributes.entity_picture);
  }

  css() {
    return `
      .wrap { padding: 16px; display: grid; gap: 14px; }
      .np { display: grid; grid-template-columns: auto 1fr; gap: 16px; align-items: center; }
      .art { width: 112px; height: 112px; border-radius: 18px; background: linear-gradient(145deg, #3a2f5c, #1d2a44) center/cover;
             display: grid; place-items: center; color: rgba(255,255,255,.7); box-shadow: 0 10px 26px rgba(0,0,0,.3); flex: none; }
      .art ha-icon { --mdc-icon-size: 40px; }
      .meta { min-width: 0; }
      .label { font-size: 12px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--_text2); }
      .title { font-size: 19px; font-weight: 700; color: var(--_text); letter-spacing: -.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .artist { font-size: 14px; color: var(--_text2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .prog { height: 4px; border-radius: 2px; background: var(--_muted); margin-top: 10px; overflow: hidden; }
      .prog i { display: block; height: 100%; width: 0; background: var(--_grad); border-radius: 2px; transition: width 1s linear; }
      .ctl { display: flex; align-items: center; gap: 8px; margin-top: 10px; }
      .b { width: 40px; height: 40px; border-radius: 50%; border: none; background: transparent; color: var(--_text);
           display: grid; place-items: center; cursor: pointer; padding: 0; }
      .b ha-icon { --mdc-icon-size: 24px; }
      .b.main { width: 50px; height: 50px; background: var(--_grad); color: #fff;
               box-shadow: inset 0 1px 0 rgba(255,255,255,.3), 0 6px 18px var(--ajn-glow, rgba(0,0,0,.2)); }
      .b.main ha-icon { --mdc-icon-size: 28px; }
      .b.dim { color: var(--_text2); } .b.act { color: var(--_accent); }
      .vol { display: grid; grid-template-columns: auto 1fr; gap: 10px; align-items: center; }
      .vbar { position: relative; height: 34px; border-radius: 17px; background: var(--_muted); overflow: hidden; cursor: pointer; }
      .vbar i { position: absolute; inset: 0 auto 0 0; background: var(--_grad); opacity: .45; }
      .vbar span { position: absolute; inset: 0; display: flex; align-items: center; padding: 0 14px; font-size: 12px; font-weight: 600; color: var(--_text2); }
      .chips { display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none; padding: 2px; }
      .chips::-webkit-scrollbar { display: none; }
      .chip { flex: none; display: inline-flex; align-items: center; gap: 7px; height: 36px; padding: 0 14px 0 10px; border-radius: 999px;
              border: 1px solid var(--_border); background: transparent; color: var(--_text); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
      .chip ha-icon { --mdc-icon-size: 18px; color: var(--_text2); }
      .chip.sel { background: var(--_surface-on); color: var(--_text-on); border-color: transparent; }
      .chip.sel ha-icon { color: rgb(${COLORS.purple}); }
      .chip .eq { width: 6px; height: 6px; border-radius: 50%; background: rgb(${COLORS.green}); }
      input.search { width: 100%; box-sizing: border-box; font: inherit; font-size: 15px; padding: 12px 16px; border-radius: 14px;
                     border: 1px solid var(--_border); background: var(--_muted); color: var(--_text); outline: none; }
      .grp { font-size: 12px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--_text2); margin: 4px 2px 6px; }
      .items { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 10px; }
      .it { cursor: pointer; border-radius: 14px; padding: 8px; background: var(--_muted); min-width: 0; }
      .it .im { aspect-ratio: 1; border-radius: 10px; background: linear-gradient(145deg, #2c3e5c, #18202e) center/cover;
                display: grid; place-items: center; color: rgba(255,255,255,.6); }
      .it .nm { font-size: 13px; font-weight: 600; margin-top: 6px; color: var(--_text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .it .sb { font-size: 11px; color: var(--_text2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .it:active { transform: scale(.97); }
      .muted2 { font-size: 13px; color: var(--_text2); padding: 6px 2px; }
      .compact .wrap { grid-template-columns: auto 1fr auto; align-items: center; padding: 12px; gap: 12px; }
      .compact .art { width: 56px; height: 56px; border-radius: 12px; }
      .compact .art ha-icon { --mdc-icon-size: 26px; }
      .compact .title { font-size: 15px; }
      @container (max-width: 420px) { .art { width: 84px; height: 84px; } .title { font-size: 17px; } }
    `;
  }

  _thumb(it) {
    const img = it.image || (it.album && it.album.image) || "";
    return img ? `style="background-image:${esc(cssUrl(img))}"` : "";
  }

  render() {
    // Don't rebuild while someone is typing a search (players update every second while playing)
    const focused = this.shadowRoot.activeElement;
    if (!this._force && focused && focused.classList && focused.classList.contains("search")) {
      this._deferred = true;
      return;
    }
    this._force = false;
    const c = this._config;
    const id = this._current();
    const s = this.st(id);
    if (!s) {
      this.html(`<ha-card><div class="wrap muted2">${esc(this.t("music"))}: no speakers found.</div></ha-card>`);
      return;
    }
    const a = s.attributes;
    const sf = a.supported_features || 0;
    const active = ACTIVE.includes(s.state);
    const art = this._art(s);
    const title = active ? a.media_title || a.friendly_name : this.t("nothing_playing");
    const artist = active ? [a.media_artist, a.media_album_name].filter(Boolean).join(" · ") || a.app_name || "" : a.friendly_name;
    const playIcon = s.state === "playing" ? "mdi:pause" : "mdi:play";
    const compact = c.variant === "compact";

    if (compact) {
      this.html(`<ha-card class="compact"><div class="wrap">
        <div class="art tap" data-more ${art ? `style="background-image:${esc(cssUrl(art))}"` : ""}>${art ? "" : '<ha-icon icon="mdi:music"></ha-icon>'}</div>
        <div class="meta tap" data-more><div class="title">${esc(title)}</div><div class="artist">${esc(artist)}</div></div>
        <div class="ctl" style="margin:0">
          <button class="b main" data-svc="media_play_pause"><ha-icon icon="${playIcon}"></ha-icon></button>
          ${sf & F.NEXT ? `<button class="b" data-svc="media_next_track"><ha-icon icon="mdi:skip-next"></ha-icon></button>` : ""}
        </div></div></ha-card>`);
      return this._bind(id, s);
    }

    const players = this._players();
    const vol = Math.round((a.volume_level || 0) * 100);
    const results = this._results;
    let resHtml = "";
    if (results === "loading") resHtml = `<div class="muted2">…</div>`;
    else if (results) {
      const groups = [["playlists", "playlists"], ["tracks", "tracks"], ["albums", "albums"], ["artists", "artists"], ["radio", "radio"]];
      resHtml = groups.filter(([k]) => (results[k] || []).length).map(([k, label]) => `
        <div><div class="grp">${esc(this.t(label))}</div><div class="items">${results[k].slice(0, 6).map((it, i) => `
          <div class="it" data-res="${k}:${i}"><div class="im" ${this._thumb(it)}>${it.image ? "" : '<ha-icon icon="mdi:music-note"></ha-icon>'}</div>
            <div class="nm">${esc(it.name)}</div><div class="sb">${esc((it.artists || []).map((x) => x.name).join(", "))}</div></div>`).join("")}</div></div>`).join("")
        || `<div class="muted2">${esc(this.t("no_results"))}</div>`;
    }
    const favs = this._favs || [];
    const canSearch = c.search !== false && this._isMa(id);

    this.html(`<ha-card><div class="wrap">
      <div class="np">
        <div class="art tap" data-more ${art ? `style="background-image:${esc(cssUrl(art))}"` : ""}>${art ? "" : '<ha-icon icon="mdi:music"></ha-icon>'}</div>
        <div class="meta">
          <div class="label">${esc(active ? this.t("now_playing") : a.friendly_name)}</div>
          <div class="title">${esc(title)}</div>
          <div class="artist">${esc(active ? artist : "")}</div>
          ${a.media_duration ? `<div class="prog"><i></i></div>` : ""}
          <div class="ctl">
            ${sf & F.SHUFFLE ? `<button class="b ${a.shuffle ? "act" : "dim"}" data-shuffle><ha-icon icon="mdi:shuffle-variant"></ha-icon></button>` : ""}
            ${sf & F.PREV ? `<button class="b" data-svc="media_previous_track"><ha-icon icon="mdi:skip-previous"></ha-icon></button>` : ""}
            <button class="b main" data-svc="media_play_pause"><ha-icon icon="${playIcon}"></ha-icon></button>
            ${sf & F.NEXT ? `<button class="b" data-svc="media_next_track"><ha-icon icon="mdi:skip-next"></ha-icon></button>` : ""}
            ${sf & F.REPEAT ? `<button class="b ${a.repeat && a.repeat !== "off" ? "act" : "dim"}" data-repeat><ha-icon icon="${a.repeat === "one" ? "mdi:repeat-once" : "mdi:repeat"}"></ha-icon></button>` : ""}
          </div>
        </div>
      </div>
      ${sf & F.VOLUME_SET ? `<div class="vol">
        <button class="b dim" data-mute><ha-icon icon="${a.is_volume_muted ? "mdi:volume-off" : "mdi:volume-high"}"></ha-icon></button>
        <div class="vbar"><i style="width:${vol}%"></i><span>${vol}%</span></div></div>` : ""}
      ${players.length > 1 ? `<div class="chips">${players.map((p) => {
        const ps = this.st(p);
        return `<button class="chip ${p === id ? "sel" : ""}" data-player="${esc(p)}">
          ${ps.state === "playing" ? '<span class="eq"></span>' : '<ha-icon icon="mdi:speaker"></ha-icon>'}${esc(ps.attributes.friendly_name || p)}</button>`;
      }).join("")}</div>` : ""}
      ${this._isMa(id) && players.some((p) => p !== id && this.st(p).state === "playing" && this._isMa(p)) ? `
        <div class="chips"><button class="chip" data-transfer><ha-icon icon="mdi:swap-horizontal"></ha-icon>${esc(this.t("move_here"))}</button></div>` : ""}
      ${canSearch ? `<input class="search" type="search" placeholder="${esc(this.t("search_music"))}" value="${esc(this._query)}">` : ""}
      ${resHtml}
      ${!results && favs.length ? `<div><div class="grp">${esc(this.t("favorites_music"))}</div><div class="items">${favs.map((it, i) => `
        <div class="it" data-fav="${i}"><div class="im" ${this._thumb(it)}>${it.image ? "" : '<ha-icon icon="mdi:playlist-music"></ha-icon>'}</div>
          <div class="nm">${esc(it.name)}</div><div class="sb">${esc(it.media_type || "")}</div></div>`).join("")}</div></div>` : ""}
    </div></ha-card>`);
    this._bind(id, s);
    if (canSearch) this._loadFavorites();
    this._progress();
  }

  _bind(id, s) {
    const sr = this.shadowRoot;
    const a = s.attributes;
    sr.querySelectorAll("[data-more]").forEach((el) => bindGestures(el, { onTap: () => this.moreInfo(id) }));
    sr.querySelectorAll("[data-svc]").forEach((b) => bindGestures(b, {
      onTap: () => { haptic("light"); this.call(`media_player.${b.dataset.svc}`, [id]); } }));
    const sh = sr.querySelector("[data-shuffle]");
    if (sh) bindGestures(sh, { onTap: () => this.call("media_player.shuffle_set", [id], { shuffle: !a.shuffle }) });
    const rp = sr.querySelector("[data-repeat]");
    if (rp) bindGestures(rp, { onTap: () => this.call("media_player.repeat_set", [id],
      { repeat: a.repeat === "off" || !a.repeat ? "all" : a.repeat === "all" ? "one" : "off" }) });
    const mu = sr.querySelector("[data-mute]");
    if (mu) bindGestures(mu, { onTap: () => this.call("media_player.volume_mute", [id], { is_volume_muted: !a.is_volume_muted }) });
    const vb = sr.querySelector(".vbar");
    if (vb) {
      const show = (v) => { vb.querySelector("i").style.width = `${v}%`; vb.querySelector("span").textContent = `${Math.round(v)}%`; };
      bindGestures(vb, {
        onTap: (e) => { const r = vb.getBoundingClientRect(); const v = ((e.clientX - r.left) / r.width) * 100; show(v);
                        this.call("media_player.volume_set", [id], { volume_level: Math.round(v) / 100 }); },
        onDrag: (v) => show(v),
        onDragEnd: (v) => this.call("media_player.volume_set", [id], { volume_level: Math.round(v) / 100 }),
      });
    }
    sr.querySelectorAll("[data-player]").forEach((b) => bindGestures(b, {
      onTap: () => { haptic("light"); this._selected = b.dataset.player; this.render(); } }));
    const tr = sr.querySelector("[data-transfer]");
    if (tr) bindGestures(tr, { onTap: () => {
      const src = this._players().find((p) => p !== id && this.st(p).state === "playing" && this._isMa(p));
      if (src) this.call("music_assistant.transfer_queue", [id], { source_player: src, auto_play: true });
    } });
    const input = sr.querySelector("input.search");
    if (input) {
      input.addEventListener("keydown", (e) => { if (e.key === "Enter") this._search(input.value); });
      input.addEventListener("search", () => this._search(input.value));
      input.addEventListener("blur", () => { if (this._deferred) { this._deferred = false; this.render(); } });
    }
    sr.querySelectorAll("[data-res]").forEach((el) => bindGestures(el, { onTap: () => {
      const [k, i] = el.dataset.res.split(":");
      this._playItem(this._results[k][+i]);
    } }));
    sr.querySelectorAll("[data-fav]").forEach((el) => bindGestures(el, { onTap: () => this._playItem(this._favs[+el.dataset.fav]) }));
  }

  getCardSize() {
    return this._config && this._config.variant === "compact" ? 1 : 5;
  }

  getGridOptions() {
    return this._config && this._config.variant === "compact" ? { columns: 12, rows: "auto" } : { columns: 12, min_columns: 6, rows: "auto" };
  }
}
