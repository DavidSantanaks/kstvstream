/* ==========================================================================
   KS TV-Stream — Apple TV (tvOS) IPTV Player Engine (Fire TV Stick 4K & Web)
   ========================================================================== */

(function () {
  'use strict';

  const STORAGE_KEYS = {
    SESSION: 'appletv_iptv_session_v1',
    FAVORITES: 'appletv_iptv_favorites_v1',
    RECENT: 'appletv_iptv_recent_v1'
  };

  const PAGE_SIZE = 36;
  const OSD_AUTOHIDE_MS = 4500;

  const state = {
    loginMode: 'xtream', // 'xtream' | 'core' | 'm3u'
    m3uFormatType: 'm3u_plus',
    session: null,
    activeSection: 'home',

    // Categories
    liveCategories: [],
    vodCategories: [],
    seriesCategories: [],
    fourKCatIds: new Set(),

    // Active Category IDs
    activeLiveCatId: null,
    activeVodCatId: null,
    activeSeriesCatId: null,

    // In-memory stream & EPG caches
    liveByCat: new Map(),
    vodByCat: new Map(),
    seriesByCat: new Map(),
    vodInfoCache: new Map(),
    seriesInfoCache: new Map(),
    epgCache: new Map(),
    epgDebounceTimer: null,

    // Current rendered lists & pagination limits
    currentLiveList: [],
    liveRenderLimit: PAGE_SIZE,
    currentVodList: [],
    vodRenderLimit: PAGE_SIZE,
    currentSeriesList: [],
    seriesRenderLimit: PAGE_SIZE,

    // Showcase hero item
    heroItem: null,

    // Favorites & Continue Watching
    favorites: loadJson(STORAGE_KEYS.FAVORITES, []),
    recent: loadJson(STORAGE_KEYS.RECENT, []),

    // Details Modal State
    modal: {
      active: false,
      item: null,
      type: null,
      seriesInfo: null,
      activeSeason: null,
      previousFocus: null
    },

    // Video Player & Mini Player (PiP) State
    player: {
      active: false,
      miniPipActive: false,
      osdVisible: false,
      osdTimer: null,
      type: 'live', // 'live' | 'movie' | 'series'
      currentItem: null,
      channelList: [],
      channelIndex: -1,
      episodeList: [],
      episodeIndex: -1,
      isPlaying: false,
      aspectMode: 'contain',
      hls: null,
      activePopover: null, // 'quality' | 'audio' | 'subs' | null
      popoverTrigger: null,
      customSubBlobUrls: [],
      pendingResumeTime: 0,
      previousFocus: null
    }
  };

  const dom = {
    loginScreen: document.getElementById('login-screen'),
    appScreen: document.getElementById('app-screen'),
    loginForm: document.getElementById('login-form'),
    loginError: document.getElementById('login-error'),
    btnLoginSubmit: document.getElementById('btn-login-submit'),
    btnLoginText: document.getElementById('btn-login-text'),

    // Header
    accountBadge: document.getElementById('account-badge'),
    clockDisplay: document.getElementById('clock-display'),

    // Hero
    heroBackdropImg: document.getElementById('hero-backdrop-img'),
    heroBadgeType: document.getElementById('hero-badge-type'),
    heroBadgeMeta: document.getElementById('hero-badge-meta'),
    heroTitle: document.getElementById('hero-title'),
    heroDesc: document.getElementById('hero-desc'),
    btnHeroPlay: document.getElementById('btn-hero-play'),
    btnHeroLive: document.getElementById('btn-hero-live'),
    homeRows: document.getElementById('home-rows'),

    // Live TV & EPG & Mini Player controls
    liveCatCount: document.getElementById('live-cat-count'),
    liveCategoriesList: document.getElementById('live-categories-list'),
    liveCurrentCatTitle: document.getElementById('live-current-cat-title'),
    liveCurrentCatSub: document.getElementById('live-current-cat-sub'),
    liveFilterInput: document.getElementById('live-filter-input'),
    epgChannelTitle: document.getElementById('epg-channel-title'),
    epgNowText: document.getElementById('epg-now-text'),
    epgNextText: document.getElementById('epg-next-text'),
    pipControlsBox: document.getElementById('pip-controls-box'),
    btnPipExpand: document.getElementById('btn-pip-expand'),
    btnPipStop: document.getElementById('btn-pip-stop'),
    liveChannelsGrid: document.getElementById('live-channels-grid'),
    liveLoadMoreWrap: document.getElementById('live-load-more-wrap'),
    btnLiveLoadMore: document.getElementById('btn-live-load-more'),

    // Movies
    moviesCatCount: document.getElementById('movies-cat-count'),
    moviesCategoriesList: document.getElementById('movies-categories-list'),
    moviesCurrentCatTitle: document.getElementById('movies-current-cat-title'),
    moviesCurrentCatSub: document.getElementById('movies-current-cat-sub'),
    moviesFilterInput: document.getElementById('movies-filter-input'),
    moviesGrid: document.getElementById('movies-grid'),
    moviesLoadMoreWrap: document.getElementById('movies-load-more-wrap'),
    btnMoviesLoadMore: document.getElementById('btn-movies-load-more'),

    // Series
    seriesCatCount: document.getElementById('series-cat-count'),
    seriesCategoriesList: document.getElementById('series-categories-list'),
    seriesCurrentCatTitle: document.getElementById('series-current-cat-title'),
    seriesCurrentCatSub: document.getElementById('series-current-cat-sub'),
    seriesFilterInput: document.getElementById('series-filter-input'),
    seriesGrid: document.getElementById('series-grid'),
    seriesLoadMoreWrap: document.getElementById('series-load-more-wrap'),
    btnSeriesLoadMore: document.getElementById('btn-series-load-more'),

    // Favorites & Search
    favoritesGrid: document.getElementById('favorites-grid'),
    globalSearchInput: document.getElementById('global-search-input'),
    btnGlobalSearch: document.getElementById('btn-global-search'),
    searchStatus: document.getElementById('search-status'),
    searchResultsGrid: document.getElementById('search-results-grid'),

    // Account
    accProfileName: document.getElementById('acc-profile-name'),
    accStatusBadge: document.getElementById('acc-status-badge'),
    accServerUrl: document.getElementById('acc-server-url'),
    accUsername: document.getElementById('acc-username'),
    accExpDate: document.getElementById('acc-exp-date'),
    accConnections: document.getElementById('acc-connections'),
    btnRefreshCache: document.getElementById('btn-refresh-cache'),
    btnSwitchLogin: document.getElementById('btn-switch-login'),

    // Details Modal
    detailsModal: document.getElementById('details-modal'),
    btnDetailsBack: document.getElementById('btn-details-back'),
    detailsTopBarTitle: document.getElementById('details-top-bar-title'),
    detailsBackdrop: document.getElementById('details-backdrop'),
    detailsPoster: document.getElementById('details-poster'),
    detailsBadge4k: document.getElementById('details-badge-4k'),
    detailsBadgeType: document.getElementById('details-badge-type'),
    detailsBadgeYear: document.getElementById('details-badge-year'),
    detailsBadgeRating: document.getElementById('details-badge-rating'),
    detailsTitle: document.getElementById('details-title'),
    detailsMeta: document.getElementById('details-meta'),
    detailsPlot: document.getElementById('details-plot'),
    btnDetailsPlay: document.getElementById('btn-details-play'),
    btnDetailsFav: document.getElementById('btn-details-fav'),
    detailsFavLabel: document.getElementById('details-fav-label'),
    btnDetailsClose: document.getElementById('btn-details-close'),
    seriesEpisodesSection: document.getElementById('series-episodes-section'),
    seasonSelector: document.getElementById('season-selector'),
    episodesList: document.getElementById('episodes-list'),

    // Video Player Overlay & OSD
    playerOverlay: document.getElementById('player-overlay'),
    videoElement: document.getElementById('video-element'),
    subtitleFileInput: document.getElementById('subtitle-file-input'),
    miniPipBar: document.getElementById('mini-pip-bar'),
    miniPipTitle: document.getElementById('mini-pip-title'),
    btnMiniPipExpand: document.getElementById('btn-mini-pip-expand'),
    btnMiniPipClose: document.getElementById('btn-mini-pip-close'),
    playerSpinner: document.getElementById('player-Spinner'),
    playerLoadingText: document.getElementById('player-loading-text'),
    playerErrorBox: document.getElementById('player-error-box'),
    playerErrorTitle: document.getElementById('player-error-title'),
    playerErrorDesc: document.getElementById('player-error-desc'),
    btnPlayerRetry: document.getElementById('btn-player-retry'),
    btnPlayerExitErr: document.getElementById('btn-player-exit-err'),

    playerOsd: document.getElementById('player-osd'),
    btnOsdBack: document.getElementById('btn-osd-back'),
    osdBackLabel: document.getElementById('osd-back-label'),
    osdLiveBadge: document.getElementById('osd-live-badge'),
    osdCategoryPill: document.getElementById('osd-category-pill'),
    osdResBadge: document.getElementById('osd-res-badge'),
    osdChannelDrawer: document.getElementById('osd-channel-drawer'),
    osdDrawerEpg: document.getElementById('osd-drawer-epg'),
    osdDrawerList: document.getElementById('osd-drawer-list'),
    osdTracksPopover: document.getElementById('osd-tracks-popover'),
    osdPopoverTitle: document.getElementById('osd-popover-title'),
    btnOsdPopoverClose: document.getElementById('btn-osd-popover-close'),
    osdPopoverList: document.getElementById('osd-popover-list'),
    osdLogo: document.getElementById('osd-logo'),
    osdTitle: document.getElementById('osd-title'),
    osdSubtitle: document.getElementById('osd-subtitle'),
    osdTimeDisplay: document.getElementById('osd-time-display'),
    osdTimeCurrent: document.getElementById('osd-time-current'),
    osdTimeTotal: document.getElementById('osd-time-total'),
    osdProgressWrap: document.getElementById('osd-progress-wrap'),
    osdProgressFill: document.getElementById('osd-progress-fill'),

    btnOsdPrevCh: document.getElementById('btn-osd-prev-ch'),
    btnOsdRw: document.getElementById('btn-osd-rw'),
    btnOsdPlayPause: document.getElementById('btn-osd-playpause'),
    osdPlayPauseIcon: document.getElementById('osd-playpause-icon'),
    osdPlayPauseLabel: document.getElementById('osd-playpause-label'),
    btnOsdFf: document.getElementById('btn-osd-ff'),
    btnOsdNextCh: document.getElementById('btn-osd-next-ch'),
    btnOsdNextEp: document.getElementById('btn-osd-next-ep'),
    btnOsdQuality: document.getElementById('btn-osd-quality'),
    osdQualityLabel: document.getElementById('osd-quality-label'),
    btnOsdAudio: document.getElementById('btn-osd-audio'),
    osdAudioLabel: document.getElementById('osd-audio-label'),
    btnOsdSubs: document.getElementById('btn-osd-subs'),
    osdSubsLabel: document.getElementById('osd-subs-label'),
    btnOsdFav: document.getElementById('btn-osd-fav'),
    osdFavLabel: document.getElementById('osd-fav-label'),
    btnOsdAspect: document.getElementById('btn-osd-aspect'),
    osdAspectLabel: document.getElementById('osd-aspect-label'),
    btnOsdHide: document.getElementById('btn-osd-hide'),
    btnOsdClose: document.getElementById('btn-osd-close')
  };

  /* ========================================================================
     UTILITIES & PERSISTENCE
     ======================================================================== */
  function loadJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function saveJson(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch (_) {}
  }

  function normalizeServerUrl(url) {
    let clean = (url || '').trim();
    if (!clean) return '';
    if (!/^https?:\/\//i.test(clean)) {
      clean = 'http://' + clean;
    }
    return clean.replace(/\/+$/, '');
  }

  function extractXtreamFromM3u(m3uUrl) {
    try {
      const u = new URL(m3uUrl.trim());
      const server = `${u.protocol}//${u.host}`;
      const pathMatch = u.pathname.match(/\/playlist\/([^\/]+)\/([^\/]+)/i);
      if (pathMatch) {
        return {
          server,
          username: decodeURIComponent(pathMatch[1]),
          password: decodeURIComponent(pathMatch[2])
        };
      }
      const userParam = u.searchParams.get('username');
      const passParam = u.searchParams.get('password');
      if (userParam && passParam) {
        return {
          server,
          username: userParam,
          password: passParam
        };
      }
    } catch (_) {}
    return null;
  }

  function decodeBase64Utf8(str) {
    if (!str) return '';
    try {
      const binString = atob(str);
      const bytes = new Uint8Array(binString.length);
      for (let i = 0; i < binString.length; i++) {
        bytes[i] = binString.charCodeAt(i);
      }
      return new TextDecoder('utf-8').decode(bytes);
    } catch (_) {
      return str;
    }
  }

  function formatTime(sec) {
    if (!Number.isFinite(sec) || sec < 0) return '00:00';
    const total = Math.floor(sec);
    const hrs = Math.floor(total / 3600);
    const mins = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    if (hrs > 0) {
      return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  function updateClock() {
    const now = new Date();
    dom.clockDisplay.textContent = now.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  const FOUR_K_REGEX = /(?:^|[\s\[\(\-\|\._\/])(4k|uhd|2160p)(?:$|[\s\]\)\-\|\._\/+])/i;

  function rebuildFourKCategorySet() {
    state.fourKCatIds.clear();
    const scan = (cats, type) => {
      (cats || []).forEach(c => {
        if (c && FOUR_K_REGEX.test(c.category_name || '')) {
          state.fourKCatIds.add(`${type}:${c.category_id}`);
        }
      });
    };
    scan(state.liveCategories, 'live');
    scan(state.vodCategories, 'movie');
    scan(state.seriesCategories, 'series');
  }

  function isItem4K(item, type) {
    if (!item) return false;
    const label = String(item.name || item.title || '');
    if (FOUR_K_REGEX.test(label)) return true;
    if (item.category_name && FOUR_K_REGEX.test(item.category_name)) return true;
    if (item.category_id != null && type && state.fourKCatIds.has(`${type}:${item.category_id}`)) {
      return true;
    }
    return false;
  }

  function formatLangCode(raw) {
    const code = String(raw || '').trim().toLowerCase();
    const map = {
      pt: 'Português',
      'pt-br': 'Português (Brasil)',
      por: 'Português',
      pob: 'Português (Brasil)',
      en: 'Inglês',
      eng: 'Inglês',
      es: 'Espanhol',
      spa: 'Espanhol',
      fr: 'Francês',
      fre: 'Francês',
      it: 'Italiano',
      ita: 'Italiano',
      ja: 'Japonês',
      jpn: 'Japonês',
      ko: 'Coreano',
      kor: 'Coreano',
      de: 'Alemão',
      ger: 'Alemão',
      und: 'Áudio Original'
    };
    return map[code] || (raw ? String(raw).toUpperCase() : '');
  }

  function srtToVtt(srtText) {
    const clean = String(srtText || '')
      .replace(/^\uFEFF/, '')
      .replace(/\r+/g, '')
      .trim();
    if (clean.startsWith('WEBVTT')) return clean;
    const converted = clean.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
    return 'WEBVTT\n\n' + converted + '\n';
  }

  function normalizeMediaBaseTitle(rawName) {
    return String(rawName || '')
      .toLowerCase()
      .replace(/\[[^\]]*\]|\([^\)]*\)/g, ' ')
      .replace(/\b(4k|uhd|2160p|fhd|full\s*hd|1080p|hd|720p|sd|480p|h\.?265|hevc|leg|legendado|dub|dublado|dual|alt|backup)\b/gi, ' ')
      .replace(/[^a-z0-9\u00c0-\u017f]+/gi, ' ')
      .trim();
  }

  function extractQualityTagFromName(rawName) {
    const s = String(rawName || '');
    if (/\b(4k|uhd|2160p)\b/i.test(s)) return '4K UHD';
    if (/\b(fhd|full\s*hd|1080p)\b/i.test(s)) return 'Full HD (1080p)';
    if (/\b(h\.?265|hevc)\b/i.test(s)) return 'HEVC / H.265';
    if (/\b(hd|720p)\b/i.test(s)) return 'HD (720p)';
    if (/\b(sd|480p)\b/i.test(s)) return 'SD (480p)';
    return '';
  }

  /* ========================================================================
     NETWORK LAYER
     ======================================================================== */
  const isLocalServer = window.location.protocol.startsWith('http') && !window.AndroidBridge;

  async function fetchXtreamJson(actionParams = '', noCache = false) {
    const { server, username, password } = state.session;
    const baseApi = `${server}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}${actionParams ? '&' + actionParams : ''}`;

    if (window.AndroidBridge && typeof window.AndroidBridge.httpGet === 'function') {
      const raw = window.AndroidBridge.httpGet(baseApi);
      if (raw && !raw.startsWith('__ERROR__:')) {
        return JSON.parse(raw);
      }
    }

    if (isLocalServer) {
      const proxyUrl = `/api/xtream?url=${encodeURIComponent(baseApi)}${noCache ? '&nocache=1' : ''}`;
      const res = await fetch(proxyUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    }

    const res = await fetch(baseApi);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  }

  async function resolveStreamRedirect(rawStreamUrl) {
    if (isLocalServer) {
      try {
        const res = await fetch(`/api/resolve?url=${encodeURIComponent(rawStreamUrl)}`);
        if (res.ok) {
          const data = await res.json();
          if (data && data.resolvedUrl) return data.resolvedUrl;
        }
      } catch (_) {}
    }
    return rawStreamUrl;
  }

  function buildStreamUrl(item, type) {
    if (item.direct_source && item.direct_source.startsWith('http')) {
      return item.direct_source;
    }
    const { server, username, password } = state.session;
    if (type === 'live') {
      return `${server}/live/${encodeURIComponent(username)}/${encodeURIComponent(password)}/${item.stream_id}.m3u8`;
    }
    if (type === 'movie') {
      const ext = item.container_extension || 'mp4';
      return `${server}/movie/${encodeURIComponent(username)}/${encodeURIComponent(password)}/${item.stream_id}.${ext}`;
    }
    if (type === 'series') {
      const ext = item.container_extension || 'mp4';
      return `${server}/series/${encodeURIComponent(username)}/${encodeURIComponent(password)}/${item.id || item.stream_id}.${ext}`;
    }
    return '';
  }

  /* ========================================================================
     EPG (GUIA DE PROGRAMAÇÃO) ENGINE
     ======================================================================== */
  function requestChannelEpg(channel) {
    if (!channel || !channel.stream_id) return;
    dom.epgChannelTitle.textContent = channel.name || 'Canal ao Vivo';

    const sid = String(channel.stream_id);
    if (state.epgCache.has(sid)) {
      applyEpgDisplay(state.epgCache.get(sid), sid);
      return;
    }

    dom.epgNowText.textContent = 'Consultando programação...';
    dom.epgNextText.textContent = '--';

    if (state.epgDebounceTimer) clearTimeout(state.epgDebounceTimer);
    state.epgDebounceTimer = setTimeout(async () => {
      try {
        const data = await fetchXtreamJson(`action=get_short_epg&stream_id=${encodeURIComponent(sid)}&limit=4`);
        const listings = (data && Array.isArray(data.epg_listings)) ? data.epg_listings : [];
        const parsed = listings.map(item => {
          const title = decodeBase64Utf8(item.title || '');
          const startStr = (item.start || '').split(' ')[1] ? (item.start || '').split(' ')[1].slice(0, 5) : '';
          const endStr = (item.end || '').split(' ')[1] ? (item.end || '').split(' ')[1].slice(0, 5) : '';
          const timeRange = (startStr && endStr) ? `(${startStr} - ${endStr}) ` : '';
          return `${timeRange}${title}`.trim();
        }).filter(Boolean);

        const result = {
          now: parsed[0] || 'Transmissão ao Vivo',
          next: parsed[1] || 'Programação contínua'
        };
        state.epgCache.set(sid, result);
        applyEpgDisplay(result, sid);
      } catch (_) {
        const fallback = { now: 'Transmissão ao Vivo', next: 'Programação contínua' };
        state.epgCache.set(sid, fallback);
        applyEpgDisplay(fallback, sid);
      }
    }, 220);
  }

  function applyEpgDisplay(epgObj, channelStreamId) {
    dom.epgNowText.textContent = epgObj.now || 'Transmissão ao Vivo';
    dom.epgNextText.textContent = epgObj.next || '--';
    const epgLine = `AGORA: ${epgObj.now || 'Transmissão ao Vivo'}${epgObj.next ? '  •  A SEGUIR: ' + epgObj.next : ''}`;
    if (dom.osdDrawerEpg) {
      dom.osdDrawerEpg.textContent = epgLine;
    }
    if (
      state.player.type === 'live' &&
      state.player.currentItem &&
      (!channelStreamId || String(state.player.currentItem.stream_id) === String(channelStreamId))
    ) {
      dom.osdSubtitle.textContent = epgLine;
      if (window.AndroidBridge && typeof window.AndroidBridge.updateLiveSubtitle === 'function') {
        try { window.AndroidBridge.updateLiveSubtitle(epgLine); } catch (_) {}
      }
    }
  }

  /* ========================================================================
     1. LOGIN FLOW
     ======================================================================== */
  function setupLoginEvents() {
    const saved = loadJson(STORAGE_KEYS.SESSION, null);
    if (saved && saved.server) {
      if (saved.mode === 'core') {
        const coreSrv = document.getElementById('core-server');
        if (coreSrv) coreSrv.value = saved.server || '';
        const coreUser = document.getElementById('core-user');
        if (coreUser) coreUser.value = saved.username || '';
        const corePass = document.getElementById('core-pass');
        if (corePass) corePass.value = saved.password || '';
        const coreTab = document.querySelector('.login-tab[data-login-mode="core"]');
        if (coreTab) coreTab.click();
      } else if (saved.mode && saved.mode.startsWith('m3u')) {
        const m3uInput = document.getElementById('m3u-url');
        if (m3uInput) m3uInput.value = saved.m3uUrl || saved.server || '';
        const m3uTab = document.querySelector('.login-tab[data-login-mode="m3u"]');
        if (m3uTab) m3uTab.click();
      } else {
        const xName = document.getElementById('xtream-name');
        if (xName) xName.value = saved.name || 'KS TV-Stream';
        const xSrv = document.getElementById('xtream-server');
        if (xSrv) xSrv.value = saved.server || '';
        const xUser = document.getElementById('xtream-user');
        if (xUser) xUser.value = saved.username || '';
        const xPass = document.getElementById('xtream-pass');
        if (xPass) xPass.value = saved.password || '';
      }
    }

    document.querySelectorAll('.login-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const mode = tab.dataset.loginMode;
        state.loginMode = mode;
        document.querySelectorAll('.login-tab').forEach(t => t.classList.toggle('active', t === tab));
        document.querySelectorAll('.login-panel').forEach(p => p.classList.remove('active'));
        const activePanel = document.getElementById(`login-panel-${mode}`);
        if (activePanel) activePanel.classList.add('active');
        dom.loginError.classList.add('hidden');
      });
    });

    document.querySelectorAll('[data-m3u-type]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.m3uFormatType = btn.dataset.m3uType;
        document.querySelectorAll('[data-m3u-type]').forEach(b => b.classList.toggle('active', b === btn));
      });
    });

    dom.loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      await performLogin();
    });
  }

  async function performLogin() {
    dom.loginError.classList.add('hidden');
    dom.btnLoginSubmit.disabled = true;
    dom.btnLoginText.textContent = 'Conectando ao servidor...';

    try {
      let sessionCandidate = null;

      if (state.loginMode === 'xtream') {
        const name = document.getElementById('xtream-name').value.trim() || 'KS TV-Stream';
        const server = normalizeServerUrl(document.getElementById('xtream-server').value);
        const username = document.getElementById('xtream-user').value.trim();
        const password = document.getElementById('xtream-pass').value.trim();
        if (!server || !username || !password) throw new Error('Informe o servidor, usuário e senha.');
        sessionCandidate = { mode: 'xtream', name, server, username, password };
      } else if (state.loginMode === 'core') {
        const coreSrvInput = document.getElementById('core-server');
        const server = normalizeServerUrl(coreSrvInput ? coreSrvInput.value : '');
        const username = document.getElementById('core-user').value.trim();
        const password = document.getElementById('core-pass').value.trim();
        if (!server || !username || !password) throw new Error('Informe o servidor, usuário e senha.');
        sessionCandidate = {
          mode: 'core',
          name: 'KS TV-Stream Rápido',
          server,
          username,
          password
        };
      } else if (state.loginMode === 'm3u') {
        const m3uUrl = document.getElementById('m3u-url').value.trim();
        if (!m3uUrl) throw new Error('Cole a URL da lista M3U.');
        const extracted = extractXtreamFromM3u(m3uUrl);
        if (extracted) {
          sessionCandidate = {
            mode: 'm3u-xtream',
            name: 'Lista M3U',
            server: extracted.server,
            username: extracted.username,
            password: extracted.password,
            m3uUrl
          };
        } else {
          sessionCandidate = {
            mode: 'm3u-custom',
            name: 'Lista M3U Personalizada',
            server: m3uUrl,
            username: 'M3U',
            password: '',
            m3uUrl
          };
        }
      }

      state.session = sessionCandidate;

      // Clear previous cached catalog and history to prevent data collision between different sources
      state.liveByCat.clear();
      state.vodByCat.clear();
      state.seriesByCat.clear();
      state.vodInfoCache.clear();
      state.seriesInfoCache.clear();
      state.epgCache.clear();
      state.fourKCatIds.clear();
      state.recent = [];
      saveJson(STORAGE_KEYS.RECENT, []);
      dom.homeRows.innerHTML = '';
      dom.favoritesGrid.innerHTML = '';
      dom.searchResultsGrid.innerHTML = '';

      if (sessionCandidate.mode === 'm3u-custom') {
        await loadCustomM3uPlaylist(sessionCandidate.m3uUrl);
      } else {
        const authData = await fetchXtreamJson('', true);
        if (!authData || !authData.user_info || Number(authData.user_info.auth) !== 1) {
          throw new Error('Usuário ou senha inválidos, ou assinatura expirada.');
        }

        state.session.userInfo = authData.user_info;
        state.session.serverInfo = authData.server_info || {};
        saveJson(STORAGE_KEYS.SESSION, state.session);

        await initializeCatalog();
      }

      dom.loginScreen.classList.remove('active');
      dom.appScreen.classList.add('active');
      populateAccountSection();
      switchSection('home');

      const firstNav = document.querySelector('.nav-item.active') || document.querySelector('.nav-item');
      if (firstNav) setTvFocus(firstNav);
    } catch (err) {
      dom.loginError.textContent = err.message || 'Não foi possível conectar ao servidor. Verifique os dados.';
      dom.loginError.classList.remove('hidden');
    } finally {
      dom.btnLoginSubmit.disabled = false;
      dom.btnLoginText.textContent = 'Continuar';
    }
  }

  async function loadCustomM3uPlaylist(m3uUrl) {
    const res = await fetch(`/api/parse-m3u?url=${encodeURIComponent(m3uUrl)}`);
    if (!res.ok) throw new Error('Falha ao ler a lista M3U informada.');
    const data = await res.json();
    state.liveCategories = data.categories || [];
    rebuildFourKCategorySet();
    const grouped = new Map();
    (data.items || []).forEach(item => {
      if (!grouped.has(item.category_id)) grouped.set(item.category_id, []);
      grouped.get(item.category_id).push(item);
    });
    state.liveByCat = grouped;
    renderCategorySidebar('live', state.liveCategories);
    if (state.liveCategories[0]) {
      await selectCategory('live', state.liveCategories[0].category_id);
    }
    buildHomeShowcase();
  }

  /* ========================================================================
     2. INITIALIZE CATALOG
     ======================================================================== */
  async function initializeCatalog() {
    const [liveCats, vodCats, seriesCats] = await Promise.all([
      fetchXtreamJson('action=get_live_categories').catch(() => []),
      fetchXtreamJson('action=get_vod_categories').catch(() => []),
      fetchXtreamJson('action=get_series_categories').catch(() => [])
    ]);

    state.liveCategories = Array.isArray(liveCats) ? liveCats : [];
    state.vodCategories = Array.isArray(vodCats) ? vodCats : [];
    state.seriesCategories = Array.isArray(seriesCats) ? seriesCats : [];
    rebuildFourKCategorySet();

    dom.liveCatCount.textContent = state.liveCategories.length;
    dom.moviesCatCount.textContent = state.vodCategories.length;
    dom.seriesCatCount.textContent = state.seriesCategories.length;

    renderCategorySidebar('live', state.liveCategories);
    renderCategorySidebar('movies', state.vodCategories);
    renderCategorySidebar('series', state.seriesCategories);

    const firstLiveCat = state.liveCategories.find(c => !/suporte/i.test(c.category_name)) || state.liveCategories[0];
    const firstVodCat = state.vodCategories[0];
    const firstSeriesCat = state.seriesCategories[0];

    await Promise.all([
      firstLiveCat ? selectCategory('live', firstLiveCat.category_id, false) : Promise.resolve(),
      firstVodCat ? selectCategory('movies', firstVodCat.category_id, false) : Promise.resolve(),
      firstSeriesCat ? selectCategory('series', firstSeriesCat.category_id, false) : Promise.resolve()
    ]);

    buildHomeShowcase();
  }

  function renderCategorySidebar(section, categories) {
    const container =
      section === 'live' ? dom.liveCategoriesList :
      section === 'movies' ? dom.moviesCategoriesList :
      dom.seriesCategoriesList;

    container.innerHTML = '';
    const frag = document.createDocumentFragment();

    categories.forEach(cat => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cat-btn';
      btn.dataset.focusable = 'true';
      btn.dataset.catId = cat.category_id;
      btn.textContent = cat.category_name.replace(/^(Canais|Filmes|Series|Séries)\s*\|\s*/i, '');
      btn.addEventListener('click', () => selectCategory(section, cat.category_id, true));
      frag.appendChild(btn);
    });

    container.appendChild(frag);
  }

  async function selectCategory(section, categoryId, focusFirst = false) {
    if (section === 'live') {
      state.activeLiveCatId = String(categoryId);
      const catObj = state.liveCategories.find(c => String(c.category_id) === String(categoryId));
      dom.liveCurrentCatTitle.textContent = catObj ? catObj.category_name : 'Canais ao Vivo';
      dom.liveFilterInput.value = '';
      highlightActiveCategory(dom.liveCategoriesList, categoryId);

      if (!state.liveByCat.has(String(categoryId))) {
        dom.liveChannelsGrid.innerHTML = '<p class="catalog-sub">Carregando canais...</p>';
        const items = await fetchXtreamJson(`action=get_live_streams&category_id=${encodeURIComponent(categoryId)}`).catch(() => []);
        state.liveByCat.set(String(categoryId), Array.isArray(items) ? items : []);
      }

      state.currentLiveList = state.liveByCat.get(String(categoryId)) || [];
      state.liveRenderLimit = PAGE_SIZE;
      dom.liveCurrentCatSub.textContent = `${state.currentLiveList.length} canais • Aperte OK no vídeo para Lista de Canais e VOLTAR para Mini Player`;
      renderLiveChannels();
      if (state.currentLiveList[0]) {
        requestChannelEpg(state.currentLiveList[0]);
      }
      if (focusFirst) {
        const firstCard = dom.liveChannelsGrid.querySelector('.channel-card');
        if (firstCard) setTvFocus(firstCard);
      }
    } else if (section === 'movies') {
      state.activeVodCatId = String(categoryId);
      const catObj = state.vodCategories.find(c => String(c.category_id) === String(categoryId));
      dom.moviesCurrentCatTitle.textContent = catObj ? catObj.category_name : 'Filmes';
      dom.moviesFilterInput.value = '';
      highlightActiveCategory(dom.moviesCategoriesList, categoryId);

      if (!state.vodByCat.has(String(categoryId))) {
        dom.moviesGrid.innerHTML = '<p class="catalog-sub">Carregando filmes...</p>';
        const items = await fetchXtreamJson(`action=get_vod_streams&category_id=${encodeURIComponent(categoryId)}`).catch(() => []);
        state.vodByCat.set(String(categoryId), Array.isArray(items) ? items : []);
      }

      state.currentVodList = state.vodByCat.get(String(categoryId)) || [];
      state.vodRenderLimit = PAGE_SIZE;
      dom.moviesCurrentCatSub.textContent = `${state.currentVodList.length} títulos nesta categoria`;
      renderVodGrid();
      if (focusFirst) {
        const firstCard = dom.moviesGrid.querySelector('.poster-card');
        if (firstCard) setTvFocus(firstCard);
      }
    } else if (section === 'series') {
      state.activeSeriesCatId = String(categoryId);
      const catObj = state.seriesCategories.find(c => String(c.category_id) === String(categoryId));
      dom.seriesCurrentCatTitle.textContent = catObj ? catObj.category_name : 'Séries';
      dom.seriesFilterInput.value = '';
      highlightActiveCategory(dom.seriesCategoriesList, categoryId);

      if (!state.seriesByCat.has(String(categoryId))) {
        dom.seriesGrid.innerHTML = '<p class="catalog-sub">Carregando séries...</p>';
        const items = await fetchXtreamJson(`action=get_series&category_id=${encodeURIComponent(categoryId)}`).catch(() => []);
        state.seriesByCat.set(String(categoryId), Array.isArray(items) ? items : []);
      }

      state.currentSeriesList = state.seriesByCat.get(String(categoryId)) || [];
      state.seriesRenderLimit = PAGE_SIZE;
      dom.seriesCurrentCatSub.textContent = `${state.currentSeriesList.length} séries disponíveis`;
      renderSeriesGrid();
      if (focusFirst) {
        const firstCard = dom.seriesGrid.querySelector('.poster-card');
        if (firstCard) setTvFocus(firstCard);
      }
    }
  }

  function highlightActiveCategory(container, categoryId) {
    container.querySelectorAll('.cat-btn').forEach(btn => {
      btn.classList.toggle('active', String(btn.dataset.catId) === String(categoryId));
    });
  }

  /* ========================================================================
     3. RENDERING CARDS
     ======================================================================== */
  function createChannelCard(channel, index, channelListContext) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'channel-card';
    btn.dataset.focusable = 'true';

    const logoBox = document.createElement('div');
    logoBox.className = 'channel-logo-box';
    const initials = (channel.name || 'TV').slice(0, 3).toUpperCase();

    if (channel.stream_icon) {
      const img = document.createElement('img');
      img.loading = 'lazy';
      img.decoding = 'async';
      img.src = channel.stream_icon;
      img.alt = channel.name;
      img.onerror = () => {
        img.remove();
        logoBox.textContent = initials;
      };
      logoBox.appendChild(img);
    } else {
      logoBox.textContent = initials;
    }

    const meta = document.createElement('div');
    meta.className = 'channel-meta';

    const numRow = document.createElement('div');
    numRow.className = 'channel-num-row';
    const numSpan = document.createElement('span');
    numSpan.className = 'channel-num';
    numSpan.textContent = `CH ${channel.num || index + 1}`;
    const liveDot = document.createElement('span');
    liveDot.className = 'live-dot';
    liveDot.textContent = 'AO VIVO';
    numRow.appendChild(numSpan);
    numRow.appendChild(liveDot);

    if (isItem4K(channel, 'live')) {
      const badge4k = document.createElement('span');
      badge4k.className = 'channel-4k-badge';
      badge4k.textContent = '4K';
      numRow.appendChild(badge4k);
    }

    const nameEl = document.createElement('div');
    nameEl.className = 'channel-name';
    nameEl.textContent = channel.name || 'Canal';

    meta.appendChild(numRow);
    meta.appendChild(nameEl);

    btn.appendChild(logoBox);
    btn.appendChild(meta);

    btn.addEventListener('focus', () => {
      if (state.activeSection === 'live') {
        requestChannelEpg(channel);
      }
    });

    btn.addEventListener('click', () => {
      startPlayback({
        type: 'live',
        item: channel,
        channelList: channelListContext || state.currentLiveList,
        channelIndex: index,
        triggerElement: btn
      });
    });

    return btn;
  }

  function createPosterCard(item, type) {
    const fourK = isItem4K(item, type);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'poster-card' + (fourK ? ' is-4k' : '');
    btn.dataset.focusable = 'true';

    const thumbWrap = document.createElement('div');
    thumbWrap.className = 'poster-thumb-wrap';

    const fallback = document.createElement('div');
    fallback.className = 'poster-fallback';
    fallback.textContent = (item.name || item.title || 'TV').slice(0, 3).toUpperCase();
    thumbWrap.appendChild(fallback);

    const coverUrl = item.stream_icon || item.cover || '';
    if (coverUrl) {
      const img = document.createElement('img');
      img.loading = 'lazy';
      img.decoding = 'async';
      img.src = coverUrl;
      img.alt = item.name || item.title || '';
      img.onerror = () => {
        img.style.display = 'none';
      };
      thumbWrap.appendChild(img);
    }

    if (fourK) {
      const badge4k = document.createElement('span');
      badge4k.className = 'poster-4k-badge';
      badge4k.textContent = '4K';
      thumbWrap.appendChild(badge4k);
    }

    const ratingVal = Number(item.rating || 0);
    if (ratingVal > 0) {
      const badge = document.createElement('span');
      badge.className = 'poster-rating-badge';
      badge.textContent = `★ ${ratingVal.toFixed(1)}`;
      thumbWrap.appendChild(badge);
    }

    const caption = document.createElement('div');
    caption.className = 'poster-caption';

    const titleEl = document.createElement('div');
    titleEl.className = 'poster-title';
    titleEl.textContent = item.name || item.title || 'Sem título';

    const subEl = document.createElement('div');
    subEl.className = 'poster-sub';
    subEl.textContent = item.year || (type === 'series' ? 'Série' : 'Filme');

    caption.appendChild(titleEl);
    caption.appendChild(subEl);

    btn.appendChild(thumbWrap);
    btn.appendChild(caption);

    btn.addEventListener('click', () => {
      openDetailsModal(item, type, btn);
    });

    return btn;
  }

  function renderLiveChannels() {
    const query = dom.liveFilterInput.value.trim().toLowerCase();
    const filtered = query
      ? state.currentLiveList.filter(c => (c.name || '').toLowerCase().includes(query))
      : state.currentLiveList;

    dom.liveChannelsGrid.innerHTML = '';
    const slice = filtered.slice(0, state.liveRenderLimit);
    const frag = document.createDocumentFragment();

    slice.forEach((ch, idx) => {
      frag.appendChild(createChannelCard(ch, idx, filtered));
    });

    dom.liveChannelsGrid.appendChild(frag);
    dom.liveLoadMoreWrap.classList.toggle('hidden', filtered.length <= state.liveRenderLimit);
  }

  function renderVodGrid() {
    const query = dom.moviesFilterInput.value.trim().toLowerCase();
    const filtered = query
      ? state.currentVodList.filter(m => (m.name || '').toLowerCase().includes(query))
      : state.currentVodList;

    dom.moviesGrid.innerHTML = '';
    const slice = filtered.slice(0, state.vodRenderLimit);
    const frag = document.createDocumentFragment();

    slice.forEach(movie => {
      frag.appendChild(createPosterCard(movie, 'movie'));
    });

    dom.moviesGrid.appendChild(frag);
    dom.moviesLoadMoreWrap.classList.toggle('hidden', filtered.length <= state.vodRenderLimit);
  }

  function renderSeriesGrid() {
    const query = dom.seriesFilterInput.value.trim().toLowerCase();
    const filtered = query
      ? state.currentSeriesList.filter(s => (s.name || '').toLowerCase().includes(query))
      : state.currentSeriesList;

    dom.seriesGrid.innerHTML = '';
    const slice = filtered.slice(0, state.seriesRenderLimit);
    const frag = document.createDocumentFragment();

    slice.forEach(ser => {
      frag.appendChild(createPosterCard(ser, 'series'));
    });

    dom.seriesGrid.appendChild(frag);
    dom.seriesLoadMoreWrap.classList.toggle('hidden', filtered.length <= state.seriesRenderLimit);
  }

  function buildHomeShowcase() {
    const movies = state.currentVodList || [];
    const series = state.currentSeriesList || [];
    const channels = state.currentLiveList || [];

    const heroCandidate = movies[0] || series[0] || channels[0];
    if (heroCandidate) {
      state.heroItem = {
        item: heroCandidate,
        type: movies[0] ? 'movie' : series[0] ? 'series' : 'live'
      };
      const cover =
        (Array.isArray(heroCandidate.backdrop_path) && heroCandidate.backdrop_path[0]) ||
        heroCandidate.stream_icon ||
        heroCandidate.cover ||
        '';
      if (cover) {
        dom.heroBackdropImg.src = cover;
      }
      dom.heroBadgeType.textContent = state.heroItem.type === 'movie' ? 'Destaque • Filme' : 'Destaque • KS TV';
      const heroIs4k = isItem4K(heroCandidate, state.heroItem.type);
      dom.heroBadgeMeta.className = heroIs4k ? 'badge-4k' : 'badge-outline';
      dom.heroBadgeMeta.textContent = heroIs4k
        ? (heroCandidate.year ? `${heroCandidate.year} • 4K UHD` : '4K UHD • HDR')
        : (heroCandidate.year ? `${heroCandidate.year} • HD` : 'Alta Definição');
      dom.heroTitle.textContent = heroCandidate.name || heroCandidate.title || 'Destaque KS TV-Stream';
      dom.heroDesc.textContent =
        heroCandidate.plot ||
        'Assista agora com reprodução limpa em tela cheia. No player, pressione VOLTAR uma vez para ocultar os controles.';
    }

    dom.homeRows.innerHTML = '';

    if (state.recent.length > 0) {
      appendHomeShelf('Continuar Assistindo', state.recent.slice(0, 12), 'mixed');
    }
    if (channels.length > 0) {
      appendHomeShelf('TV ao Vivo — Destaques de Hoje', channels.slice(0, 14), 'live');
    }
    if (movies.length > 0) {
      appendHomeShelf('Filmes Mais Assistidos', movies.slice(0, 14), 'movie');
    }
    if (series.length > 0) {
      appendHomeShelf('Séries em Alta', series.slice(0, 14), 'series');
    }
  }

  function appendHomeShelf(title, items, shelfType) {
    const row = document.createElement('div');
    row.className = 'home-row';

    const heading = document.createElement('h3');
    heading.className = 'home-row-title';
    heading.textContent = title;

    const track = document.createElement('div');
    track.className = 'home-row-track';

    items.forEach((entry, idx) => {
      const actualType = shelfType === 'mixed' ? entry._savedType || 'live' : shelfType;
      if (actualType === 'live') {
        track.appendChild(createChannelCard(entry, idx, items));
      } else {
        track.appendChild(createPosterCard(entry, actualType));
      }
    });

    row.appendChild(heading);
    row.appendChild(track);
    dom.homeRows.appendChild(row);
  }

  /* ========================================================================
     4. DETAILS MODAL (Movies & Series Seasons/Episodes)
     ======================================================================== */
  async function openDetailsModal(item, type, triggerEl) {
    state.modal.active = true;
    state.modal.item = item;
    state.modal.type = type;
    state.modal.previousFocus = triggerEl || document.activeElement;

    const cover = item.stream_icon || item.cover || '';
    dom.detailsPoster.src = cover;
    dom.detailsBackdrop.src =
      (Array.isArray(item.backdrop_path) && item.backdrop_path[0]) || cover;
    if (dom.detailsBadge4k) {
      dom.detailsBadge4k.classList.toggle('hidden', !isItem4K(item, type));
    }
    if (dom.detailsTopBarTitle) {
      dom.detailsTopBarTitle.textContent = type === 'series' ? 'Série' : 'Filme';
    }
    dom.detailsBadgeType.textContent = type === 'series' ? 'Série' : 'Filme';
    dom.detailsBadgeYear.textContent = item.year || 'HD';
    dom.detailsBadgeRating.textContent = item.rating ? `★ ${Number(item.rating).toFixed(1)}` : '★ HD';
    dom.detailsTitle.textContent = item.name || item.title || '';
    dom.detailsMeta.textContent = [item.genre, item.director, item.cast].filter(Boolean).join(' • ') || 'Catálogo On-Demand';
    dom.detailsPlot.textContent = item.plot || 'Carregando sinopse e informações detalhadas...';

    updateDetailsFavButton();
    dom.detailsModal.classList.remove('hidden');
    pushBackState('modal');

    if (type === 'movie') {
      dom.seriesEpisodesSection.classList.add('hidden');
      dom.btnDetailsPlay.classList.remove('hidden');
      setTvFocus(dom.btnDetailsPlay);

      const vodId = item.stream_id;
      if (vodId) {
        let info = state.vodInfoCache.get(String(vodId));
        if (!info) {
          info = await fetchXtreamJson(`action=get_vod_info&vod_id=${encodeURIComponent(vodId)}`).catch(() => null);
          if (info) state.vodInfoCache.set(String(vodId), info);
        }
        if (info && info.info) {
          const d = info.info;
          dom.detailsPlot.textContent = d.description || d.plot || 'Pronto para reprodução em tela limpa.';
          dom.detailsMeta.textContent = [
            d.genre,
            d.episode_run_time ? `${d.episode_run_time} min` : '',
            d.director ? `Dir: ${d.director}` : ''
          ].filter(Boolean).join(' • ');
          if (d.backdrop_path && d.backdrop_path[0]) {
            dom.detailsBackdrop.src = d.backdrop_path[0];
          }
        }
      }
    } else if (type === 'series') {
      dom.seriesEpisodesSection.classList.remove('hidden');
      dom.seasonSelector.innerHTML = '';
      dom.episodesList.innerHTML = '<p class="catalog-sub">Carregando temporadas e episódios...</p>';
      setTvFocus(dom.btnDetailsPlay);

      const seriesId = item.series_id;
      let sInfo = state.seriesInfoCache.get(String(seriesId));
      if (!sInfo) {
        sInfo = await fetchXtreamJson(`action=get_series_info&series_id=${encodeURIComponent(seriesId)}`).catch(() => null);
        if (sInfo) state.seriesInfoCache.set(String(seriesId), sInfo);
      }

      state.modal.seriesInfo = sInfo;
      if (sInfo && sInfo.info) {
        dom.detailsPlot.textContent = sInfo.info.plot || item.plot || 'Selecione um episódio abaixo.';
      }

      const episodesBySeason = (sInfo && sInfo.episodes) || {};
      const seasonKeys = Object.keys(episodesBySeason);
      if (seasonKeys.length > 0) {
        renderSeasonPills(seasonKeys, episodesBySeason);
        selectSeason(seasonKeys[0], episodesBySeason);
      } else {
        dom.episodesList.innerHTML = '<p class="catalog-sub">Nenhum episódio listado para esta série.</p>';
      }
    }
  }

  function renderSeasonPills(seasonKeys, episodesBySeason) {
    dom.seasonSelector.innerHTML = '';
    seasonKeys.forEach(sKey => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'season-pill';
      btn.dataset.focusable = 'true';
      btn.dataset.season = sKey;
      btn.textContent = `Temporada ${sKey}`;
      btn.addEventListener('click', () => selectSeason(sKey, episodesBySeason));
      dom.seasonSelector.appendChild(btn);
    });
  }

  function selectSeason(seasonKey, episodesBySeason) {
    state.modal.activeSeason = seasonKey;
    dom.seasonSelector.querySelectorAll('.season-pill').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.season === String(seasonKey));
    });

    const episodes = episodesBySeason[seasonKey] || [];
    dom.episodesList.innerHTML = '';
    const frag = document.createDocumentFragment();

    episodes.forEach((ep, idx) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'episode-card';
      card.dataset.focusable = 'true';

      const numBadge = document.createElement('div');
      numBadge.className = 'episode-num-badge';
      numBadge.textContent = `E${ep.episode_num || idx + 1}`;

      const info = document.createElement('div');
      info.className = 'episode-info';

      const title = document.createElement('div');
      title.className = 'episode-title';
      title.textContent = ep.title || `Episódio ${ep.episode_num || idx + 1}`;

      const dur = document.createElement('div');
      dur.className = 'episode-dur';
      dur.textContent = (ep.info && ep.info.duration) ? `Duração: ${ep.info.duration}` : `Temporada ${seasonKey}`;

      info.appendChild(title);
      info.appendChild(dur);
      card.appendChild(numBadge);
      card.appendChild(info);

      card.addEventListener('click', () => {
        startPlayback({
          type: 'series',
          item: {
            ...ep,
            name: `${state.modal.item.name} — T${seasonKey}:E${ep.episode_num || idx + 1}`,
            seriesName: state.modal.item.name,
            stream_icon: (ep.info && ep.info.movie_image) || state.modal.item.cover
          },
          episodeList: episodes,
          episodeIndex: idx,
          triggerElement: card
        });
      });

      frag.appendChild(card);
    });

    dom.episodesList.appendChild(frag);
  }

  function closeDetailsModal() {
    if (!state.modal.active) return;
    state.modal.active = false;
    dom.detailsModal.classList.add('hidden');
    if (state.modal.previousFocus && document.body.contains(state.modal.previousFocus)) {
      setTvFocus(state.modal.previousFocus);
    }
  }

  /* ========================================================================
     5. VIDEO PLAYER, LIVE CHANNEL DRAWER & MINI PLAYER (PiP)
     ======================================================================== */
  async function startPlayback({ type, item, channelList = [], channelIndex = -1, episodeList = [], episodeIndex = -1, triggerElement = null }) {
    if (triggerElement) {
      state.player.previousFocus = triggerElement;
    }

    addToRecent(item, type);

    const isLive = type === 'live';
    const titleText = item.name || item.title || 'Reproduzindo';
    const epgEntry = isLive && item.stream_id ? state.epgCache.get(String(item.stream_id)) : null;
    const subtitleText = isLive
      ? (epgEntry && epgEntry.now ? `AGORA: ${epgEntry.now}` : `Canal ${item.num || (channelIndex + 1)} • Ao Vivo`)
      : item.year ? `${item.year} • Cinema` : 'Reprodução Limpa';

    const rawUrl = buildStreamUrl(item, type);

    state.player.type = type;
    state.player.currentItem = item;
    state.player.channelList = channelList;
    state.player.channelIndex = channelIndex;
    state.player.episodeList = episodeList;
    state.player.episodeIndex = episodeIndex;
    state.player.miniPipActive = false;
    dom.pipControlsBox.classList.add('hidden');

    if (dom.miniPipTitle) {
      dom.miniPipTitle.textContent = titleText;
    }

    if (isLive) {
      requestChannelEpg(item);
    }

    // 1. NATIVE FIRE TV STICK 4K PLAYER (With Native Channel List on OK + Native Mini Player on Back!)
    if (window.AndroidBridge && typeof window.AndroidBridge.openNativePlayer === 'function') {
      state.player.active = false;
      if (isLive && typeof window.AndroidBridge.setLiveChannelList === 'function') {
        const compactList = (channelList || []).slice(0, 120).map((ch, idx) => {
          const cachedEpg = ch.stream_id ? state.epgCache.get(String(ch.stream_id)) : null;
          return {
            idx,
            num: ch.num || idx + 1,
            name: ch.name || 'Canal',
            epg: cachedEpg && cachedEpg.now ? cachedEpg.now : '',
            id: ch.stream_id
          };
        });
        try {
          window.AndroidBridge.setLiveChannelList(JSON.stringify(compactList), channelIndex);
        } catch (_) {}
      }
      window.AndroidBridge.openNativePlayer(rawUrl, titleText, subtitleText, isLive);
      return;
    }

    // 2. WEB APP PLAYER
    state.player.active = true;
    closeTracksPopover(false);
    dom.playerOverlay.classList.remove('hidden', 'mini-pip-mode', 'cursor-idle');
    dom.playerErrorBox.classList.add('hidden');
    dom.playerSpinner.classList.remove('hidden');
    dom.playerLoadingText.textContent = 'Conectando ao sinal...';

    dom.osdLiveBadge.classList.toggle('hidden', !isLive);
    dom.osdCategoryPill.textContent =
      isLive ? 'TV ao Vivo' : type === 'movie' ? 'Filme • Cinema' : 'Série';

    // 4K Badge detection
    const is4kInitial = isItem4K(item, type);
    dom.osdResBadge.classList.toggle('res-4k', is4kInitial);
    dom.osdResBadge.textContent = is4kInitial ? '4K UHD' : '';
    dom.osdResBadge.classList.toggle('hidden', !is4kInitial);

    // Initial state for track buttons
    dom.btnOsdQuality.classList.add('hidden');
    dom.btnOsdAudio.classList.add('hidden');
    dom.btnOsdSubs.classList.add('hidden');

    const logoUrl = item.stream_icon || item.cover || '';
    if (logoUrl) {
      dom.osdLogo.src = logoUrl;
      dom.osdLogo.classList.remove('hidden');
    } else {
      dom.osdLogo.classList.add('hidden');
    }

    dom.osdTitle.textContent = titleText;
    dom.osdSubtitle.textContent = subtitleText;

    dom.btnOsdPrevCh.classList.toggle('hidden', !isLive);
    dom.btnOsdNextCh.classList.toggle('hidden', !isLive);
    dom.btnOsdRw.classList.toggle('hidden', isLive);
    dom.btnOsdFf.classList.toggle('hidden', isLive);
    dom.osdProgressWrap.classList.toggle('hidden', isLive);
    dom.osdTimeDisplay.classList.toggle('hidden', isLive);
    dom.btnOsdNextEp.classList.toggle(
      'hidden',
      !(type === 'series' && episodeIndex >= 0 && episodeIndex + 1 < episodeList.length)
    );

    if (isLive) {
      renderWebChannelDrawer();
      dom.osdChannelDrawer.classList.remove('hidden');
    } else {
      dom.osdChannelDrawer.classList.add('hidden');
    }

    updateOsdFavButton();
    showPlayerOsd(true);
    pushBackState('player');

    stopMediaEngines();

    const finalUrl = await resolveStreamRedirect(rawUrl);
    const video = dom.videoElement;
    const isHlsUrl = isLive || /\.m3u8(\?|$)/i.test(finalUrl);

    if (isHlsUrl && window.Hls && window.Hls.isSupported()) {
      const hls = new window.Hls({
        enableWorker: true,
        enableWebVTT: true,
        lowLatencyMode: false,
        backBufferLength: 30,
        maxBufferLength: 30,
        manifestLoadingTimeOut: 15000
      });
      state.player.hls = hls;
      hls.loadSource(finalUrl);
      hls.attachMedia(video);

      hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {});
        refreshPlayerTrackControls();
      });

      hls.on(window.Hls.Events.LEVEL_SWITCHED, () => {
        refreshPlayerTrackControls();
      });

      hls.on(window.Hls.Events.AUDIO_TRACKS_UPDATED, () => {
        refreshPlayerTrackControls();
      });

      hls.on(window.Hls.Events.AUDIO_TRACK_SWITCHED, () => {
        refreshPlayerTrackControls();
      });

      hls.on(window.Hls.Events.SUBTITLE_TRACKS_UPDATED, () => {
        refreshPlayerTrackControls();
      });

      hls.on(window.Hls.Events.SUBTITLE_TRACK_SWITCH, () => {
        refreshPlayerTrackControls();
      });

      hls.on(window.Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          if (data.type === window.Hls.ErrorTypes.NETWORK_ERROR) {
            hls.startLoad();
          } else if (data.type === window.Hls.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError();
          } else {
            showPlayerError('Sinal indisponível neste canal no momento.');
          }
        }
      });
    } else {
      video.src = finalUrl;
      video.load();
      video.play().catch(() => {});
    }

    if (type === 'movie' || type === 'series') {
      loadExternalXtreamSubtitles(item, type);
    }
  }

  async function loadExternalXtreamSubtitles(item, type) {
    if (!state.session || !isLocalServer) return;
    const streamId = item.stream_id || (item.info && item.info.stream_id);
    if (!streamId) return;
    try {
      const action = type === 'series'
        ? `action=get_series_info&series_id=${item.series_id || streamId}`
        : `action=get_vod_info&vod_id=${streamId}`;
      const infoData = await fetchXtreamJson(action);
      if (!infoData) return;
      const subs = (infoData.info && infoData.info.subtitles) || infoData.subtitles;
      if (Array.isArray(subs) && subs.length > 0) {
        subs.forEach((sub, idx) => {
          const subUrl = typeof sub === 'string' ? sub : sub.url || sub.link;
          const lang = typeof sub === 'string' ? `Legenda ${idx + 1}` : sub.name || sub.language || `Legenda ${idx + 1}`;
          if (subUrl) {
            addExternalSubtitleTrack(subUrl, lang);
          }
        });
      }
    } catch (_) {}
  }

  async function addExternalSubtitleTrack(subUrl, label) {
    try {
      const res = await fetch(`/api/xtream?url=${encodeURIComponent(subUrl)}`);
      if (!res.ok) return;
      const text = await res.text();
      const vtt = srtToVtt(text);
      const blob = new Blob([vtt], { type: 'text/vtt' });
      const blobUrl = URL.createObjectURL(blob);
      state.player.customSubBlobUrls.push(blobUrl);

      const track = document.createElement('track');
      track.kind = 'subtitles';
      track.label = label || 'Legenda';
      track.srclang = 'pt';
      track.src = blobUrl;
      dom.videoElement.appendChild(track);
      refreshPlayerTrackControls();
    } catch (_) {}
  }

  function renderWebChannelDrawer() {
    if (!dom.osdDrawerList) return;
    dom.osdDrawerList.innerHTML = '';
    const list = (state.player.channelList || []).slice(0, 80);
    const frag = document.createDocumentFragment();

    list.forEach((ch, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'osd-drawer-item' + (idx === state.player.channelIndex ? ' active' : '');
      btn.dataset.focusable = 'true';
      btn.textContent = `${ch.num || idx + 1}. ${ch.name || 'Canal'}`;
      btn.addEventListener('click', () => {
        startPlayback({
          type: 'live',
          item: ch,
          channelList: state.player.channelList,
          channelIndex: idx,
          triggerElement: state.player.previousFocus
        });
      });
      frag.appendChild(btn);
    });

    dom.osdDrawerList.appendChild(frag);
  }

  function stopMediaEngines() {
    closeTracksPopover(false);
    if (state.player.customSubBlobUrls && state.player.customSubBlobUrls.length > 0) {
      state.player.customSubBlobUrls.forEach(url => {
        try { URL.revokeObjectURL(url); } catch (_) {}
      });
      state.player.customSubBlobUrls = [];
    }
    if (window.AndroidBridge && typeof window.AndroidBridge.stopStream === 'function') {
      try { window.AndroidBridge.stopStream(); } catch (_) {}
    }
    if (state.player.hls) {
      try { state.player.hls.destroy(); } catch (_) {}
      state.player.hls = null;
    }
    const video = dom.videoElement;
    video.pause();
    video.querySelectorAll('track').forEach(t => t.remove());
    video.removeAttribute('src');
    video.load();
  }

  function showPlayerOsd(focusPrimary = false) {
    if (!state.player.active) return;
    state.player.osdVisible = true;
    dom.playerOverlay.classList.remove('cursor-idle');
    dom.playerOsd.classList.remove('osd-hidden');

    if (focusPrimary) {
      if (state.player.type === 'live' && dom.osdDrawerList) {
        const activeChBtn = dom.osdDrawerList.querySelector('.osd-drawer-item.active') || dom.osdDrawerList.querySelector('.osd-drawer-item');
        if (activeChBtn) {
          setTvFocus(activeChBtn);
          resetOsdAutoHideTimer();
          return;
        }
      }
      setTvFocus(dom.btnOsdPlayPause);
    }

    resetOsdAutoHideTimer();
  }

  function hidePlayerOsd() {
    closeTracksPopover(false);
    state.player.osdVisible = false;
    dom.playerOsd.classList.add('osd-hidden');
    if (state.player.active) {
      dom.playerOverlay.classList.add('cursor-idle');
    }
    if (state.player.osdTimer) {
      clearTimeout(state.player.osdTimer);
      state.player.osdTimer = null;
    }
  }

  function resetOsdAutoHideTimer() {
    if (state.player.osdTimer) {
      clearTimeout(state.player.osdTimer);
    }
    if (state.player.activePopover) return;

    state.player.osdTimer = setTimeout(() => {
      if (state.player.active && state.player.isPlaying && !state.player.activePopover) {
        hidePlayerOsd();
      }
    }, OSD_AUTOHIDE_MS);
  }

  function enterWebMiniPipMode() {
    closeTracksPopover(false);
    hidePlayerOsd();
    state.player.active = false;
    state.player.miniPipActive = true;
    dom.playerOverlay.classList.remove('cursor-idle');
    dom.playerOverlay.classList.add('mini-pip-mode');
    if (dom.miniPipTitle && state.player.currentItem) {
      dom.miniPipTitle.textContent = state.player.currentItem.name || state.player.currentItem.title || 'Mini Player';
    }
    dom.pipControlsBox.classList.remove('hidden');
    if (state.player.previousFocus && document.body.contains(state.player.previousFocus)) {
      setTvFocus(state.player.previousFocus);
    }
  }

  function expandMiniPipToFullScreen() {
    if (window.AndroidBridge && typeof window.AndroidBridge.expandMiniPlayer === 'function') {
      state.player.miniPipActive = false;
      dom.pipControlsBox.classList.add('hidden');
      window.AndroidBridge.expandMiniPlayer();
      return;
    }
    if (!state.player.miniPipActive) return;
    state.player.miniPipActive = false;
    state.player.active = true;
    dom.pipControlsBox.classList.add('hidden');
    dom.playerOverlay.classList.remove('mini-pip-mode', 'cursor-idle');
    showPlayerOsd(true);
  }

  function closePlayer() {
    closeTracksPopover(false);
    hidePlayerOsd();
    stopMediaEngines();
    state.player.active = false;
    state.player.miniPipActive = false;
    dom.pipControlsBox.classList.add('hidden');
    dom.playerOverlay.classList.add('hidden');
    dom.playerOverlay.classList.remove('mini-pip-mode', 'cursor-idle');
    dom.playerSpinner.classList.add('hidden');
    dom.playerErrorBox.classList.add('hidden');

    if (state.player.previousFocus && document.body.contains(state.player.previousFocus)) {
      setTvFocus(state.player.previousFocus);
    }
  }

  function togglePlayPause() {
    if (!state.player.active) return;
    const v = dom.videoElement;
    if (v.paused) {
      v.play().catch(() => {});
    } else {
      v.pause();
    }
    resetOsdAutoHideTimer();
  }

  function seekRelative(deltaSeconds) {
    if (!state.player.active || state.player.type === 'live') return;
    const v = dom.videoElement;
    if (Number.isFinite(v.duration)) {
      v.currentTime = Math.max(0, Math.min(v.duration, v.currentTime + deltaSeconds));
    }
    resetOsdAutoHideTimer();
  }

  function stepChannel(delta) {
    const list = state.player.channelList;
    if (!list || list.length === 0) return;
    const nextIdx = (state.player.channelIndex + delta + list.length) % list.length;
    startPlayback({
      type: 'live',
      item: list[nextIdx],
      channelList: list,
      channelIndex: nextIdx,
      triggerElement: state.player.previousFocus
    });
  }

  function playNextEpisode() {
    if (state.player.type !== 'series') return;
    const list = state.player.episodeList;
    const nextIdx = state.player.episodeIndex + 1;
    if (!list || nextIdx >= list.length) return;
    const ep = list[nextIdx];
    const seasonKey = state.modal.activeSeason || '1';
    startPlayback({
      type: 'series',
      item: {
        ...ep,
        name: `${state.modal.item ? state.modal.item.name : 'Série'} — T${seasonKey}:E${ep.episode_num || nextIdx + 1}`,
        stream_icon: (ep.info && ep.info.movie_image) || (state.modal.item && state.modal.item.cover)
      },
      episodeList: list,
      episodeIndex: nextIdx,
      triggerElement: state.player.previousFocus
    });
  }

  function cycleAspectRatio() {
    const modes = ['contain', 'cover', 'fill'];
    const labels = {
      contain: 'Padrão',
      cover: 'Zoom',
      fill: 'Esticar'
    };
    const next = modes[(modes.indexOf(state.player.aspectMode) + 1) % modes.length];
    state.player.aspectMode = next;
    dom.osdAspectLabel.textContent = labels[next];

    dom.videoElement.classList.remove('aspect-cover', 'aspect-fill');
    if (next === 'cover') dom.videoElement.classList.add('aspect-cover');
    if (next === 'fill') dom.videoElement.classList.add('aspect-fill');
    resetOsdAutoHideTimer();
  }

  function updatePlayPauseLabel(isPlaying) {
    dom.osdPlayPauseLabel.textContent = isPlaying ? 'Pausar' : 'Reproduzir';
    if (dom.osdPlayPauseIcon) {
      dom.osdPlayPauseIcon.innerHTML = isPlaying
        ? '<rect x="5.2" y="4.2" width="3.4" height="11.6" rx="1.1" /><rect x="11.4" y="4.2" width="3.4" height="11.6" rx="1.1" />'
        : '<path d="M5.6 3.9c0-.8.88-1.28 1.56-.86l9.6 5.96c.64.4.64 1.32 0 1.72l-9.6 5.96c-.68.42-1.56-.06-1.56-.86V3.9z" />';
    }
  }

  function showPlayerError(msg) {
    dom.playerSpinner.classList.add('hidden');
    dom.playerErrorDesc.textContent = msg;
    dom.playerErrorBox.classList.remove('hidden');
    setTvFocus(dom.btnPlayerRetry);
  }

  /* --- Sibling Stream Finders (Quality & Audio versions) --- */
  function getSiblingQualityItems() {
    const item = state.player.currentItem;
    if (!item) return [];
    const baseTitle = normalizeMediaBaseTitle(item.name || item.title);
    if (!baseTitle) return [];
    const list = state.player.type === 'live' ? state.player.channelList : state.currentVodList;
    if (!list || list.length === 0) return [];
    return list.filter(other => normalizeMediaBaseTitle(other.name || other.title) === baseTitle);
  }

  function getSiblingAudioItems() {
    if (state.player.type === 'live') return [];
    const item = state.player.currentItem;
    if (!item) return [];
    const baseTitle = normalizeMediaBaseTitle(item.name || item.title);
    if (!baseTitle) return [];
    const list = state.currentVodList;
    if (!list || list.length === 0) return [];
    return list.filter(other => normalizeMediaBaseTitle(other.name || other.title) === baseTitle);
  }

  function getAvailableSubtitleTracks() {
    const tracks = [];
    const v = dom.videoElement;
    const hls = state.player.hls;

    if (hls && hls.subtitleTracks && hls.subtitleTracks.length > 0) {
      hls.subtitleTracks.forEach((t, idx) => {
        tracks.push({
          type: 'hls',
          index: idx,
          label: t.name || formatLangCode(t.lang) || `Faixa ${idx + 1}`,
          lang: t.lang,
          active: hls.subtitleTrack === idx
        });
      });
    }

    if (v && v.textTracks && v.textTracks.length > 0) {
      for (let i = 0; i < v.textTracks.length; i++) {
        const tt = v.textTracks[i];
        if (tracks.some(t => t.label === tt.label)) continue;
        tracks.push({
          type: 'native',
          index: i,
          label: tt.label || formatLangCode(tt.language) || `Legenda ${i + 1}`,
          lang: tt.language,
          active: tt.mode === 'showing'
        });
      }
    }

    return tracks;
  }

  function refreshPlayerTrackControls() {
    if (!state.player.active) return;
    const v = dom.videoElement;
    const hls = state.player.hls;
    const item = state.player.currentItem;
    const type = state.player.type;

    // 1. Resolution Badge & Quality Label
    let resText = '';
    let is4K = isItem4K(item, type);
    const w = v.videoWidth || 0;
    const h = v.videoHeight || 0;

    if (h >= 2000 || w >= 3800 || is4K) {
      resText = '4K UHD';
      is4K = true;
    } else if (h >= 1400) {
      resText = '1440p QHD';
    } else if (h >= 1000) {
      resText = '1080p FHD';
    } else if (h >= 700) {
      resText = '720p HD';
    } else if (h > 0) {
      resText = 'SD';
    }

    if (hls && hls.levels && hls.currentLevel >= 0 && hls.levels[hls.currentLevel]) {
      const lvl = hls.levels[hls.currentLevel];
      if (lvl.height >= 2000 || lvl.width >= 3800) {
        resText = '4K UHD';
        is4K = true;
      } else if (lvl.height >= 1400) {
        resText = '1440p';
      } else if (lvl.height >= 1000) {
        resText = '1080p';
      } else if (lvl.height >= 700) {
        resText = '720p';
      } else if (lvl.height > 0) {
        resText = `${lvl.height}p`;
      }
    }

    if (resText || is4K) {
      dom.osdResBadge.textContent = resText || '4K UHD';
      dom.osdResBadge.classList.toggle('res-4k', is4K);
      dom.osdResBadge.classList.remove('hidden');
    } else {
      dom.osdResBadge.classList.add('hidden');
    }

    const siblingQualities = getSiblingQualityItems();
    const hasHlsLevels = hls && hls.levels && hls.levels.length > 1;
    const canChangeQuality = hasHlsLevels || siblingQualities.length > 1 || h > 0;

    if (canChangeQuality) {
      let qLabel = 'Automática';
      if (hasHlsLevels) {
        if (hls.autoLevelEnabled || hls.currentLevel === -1) {
          qLabel = resText ? `Auto (${resText})` : 'Auto';
        } else if (hls.levels[hls.currentLevel]) {
          const lvl = hls.levels[hls.currentLevel];
          qLabel = `${lvl.height || lvl.width}p`;
        }
      } else if (resText) {
        qLabel = resText;
      }
      dom.osdQualityLabel.textContent = qLabel;
      dom.btnOsdQuality.classList.remove('hidden');
    } else {
      dom.btnOsdQuality.classList.add('hidden');
    }

    // 2. Audio Button
    const hasHlsAudio = hls && hls.audioTracks && hls.audioTracks.length > 1;
    const siblingAudios = getSiblingAudioItems();
    const hasNativeAudio = v.audioTracks && v.audioTracks.length > 1;
    const canAudio = hasHlsAudio || siblingAudios.length > 1 || hasNativeAudio || type !== 'live';

    if (canAudio) {
      let aLabel = 'Áudio';
      if (hasHlsAudio && hls.audioTracks[hls.audioTrack]) {
        const t = hls.audioTracks[hls.audioTrack];
        aLabel = formatLangCode(t.lang) || t.name || 'Áudio';
      } else if (item && item.name) {
        if (/\b(dub|dublado)\b/i.test(item.name)) aLabel = 'Dublado';
        else if (/\b(leg|legendado)\b/i.test(item.name)) aLabel = 'Original / Leg';
        else if (/\b(dual)\b/i.test(item.name)) aLabel = 'Dual Áudio';
      }
      dom.osdAudioLabel.textContent = aLabel;
      dom.btnOsdAudio.classList.remove('hidden');
    } else {
      dom.btnOsdAudio.classList.add('hidden');
    }

    // 3. Subtitles Button
    const subTracks = getAvailableSubtitleTracks();
    const canSubs = subTracks.length > 0 || type !== 'live';
    if (canSubs) {
      const activeSub = subTracks.find(t => t.active);
      dom.osdSubsLabel.textContent = activeSub ? activeSub.label : 'Legendas';
      dom.btnOsdSubs.classList.remove('hidden');
    } else {
      dom.btnOsdSubs.classList.add('hidden');
    }
  }

  /* --- Apple TV Glass Popover for Resolution, Audio & Subtitles --- */
  function openTracksPopover(kind, triggerBtn) {
    state.player.activePopover = kind;
    state.player.popoverTrigger = triggerBtn;

    dom.osdPopoverList.innerHTML = '';
    const frag = document.createDocumentFragment();

    if (kind === 'quality') {
      dom.osdPopoverTitle.textContent = 'Qualidade de Vídeo';
      const hls = state.player.hls;
      const v = dom.videoElement;

      if (hls && hls.levels && hls.levels.length > 1) {
        const autoBtn = createPopoverItem({
          title: 'Automática',
          sub: hls.autoLevelEnabled ? `Ativa (${v.videoHeight || ''}p)` : 'Ajusta dinamicamente à sua conexão',
          active: hls.autoLevelEnabled || hls.currentLevel === -1,
          onClick: () => {
            hls.currentLevel = -1;
            closeTracksPopover(true);
            refreshPlayerTrackControls();
          }
        });
        frag.appendChild(autoBtn);

        hls.levels.forEach((lvl, idx) => {
          const height = lvl.height || Math.round(lvl.width * 9 / 16);
          const name = height >= 2000 ? '4K UHD (2160p)' : height >= 1000 ? `Full HD (${height}p)` : `${height}p`;
          const kbps = lvl.bitrate ? ` • ${(lvl.bitrate / 1000000).toFixed(1)} Mbps` : '';
          const btn = createPopoverItem({
            title: name,
            sub: `${lvl.width || ''}x${lvl.height || ''}${kbps}`,
            active: !hls.autoLevelEnabled && hls.currentLevel === idx,
            onClick: () => {
              hls.currentLevel = idx;
              closeTracksPopover(true);
              refreshPlayerTrackControls();
            }
          });
          frag.appendChild(btn);
        });
      }

      const siblings = getSiblingQualityItems();
      if (siblings.length > 1) {
        if (frag.childNodes.length > 0) {
          frag.appendChild(createPopoverDivider('Variantes do Canal / Catálogo'));
        }
        siblings.forEach(s => {
          const qTag = extractQualityTagFromName(s.name || s.title) || (isItem4K(s, state.player.type) ? '4K UHD' : 'Padrão');
          const isActive = (s.stream_id && state.player.currentItem && s.stream_id === state.player.currentItem.stream_id) || (s === state.player.currentItem);
          const btn = createPopoverItem({
            title: s.name || s.title,
            sub: qTag,
            active: isActive,
            onClick: () => {
              if (isActive) {
                closeTracksPopover(true);
                return;
              }
              if (state.player.type !== 'live') {
                state.player.pendingResumeTime = dom.videoElement.currentTime || 0;
              }
              closeTracksPopover(false);
              startPlayback({
                type: state.player.type,
                item: s,
                channelList: state.player.channelList,
                channelIndex: state.player.channelList.indexOf(s),
                episodeList: state.player.episodeList,
                episodeIndex: state.player.episodeIndex,
                triggerElement: triggerBtn
              });
            }
          });
          frag.appendChild(btn);
        });
      }

      if (frag.childNodes.length === 0) {
        const info = createPopoverNote(v.videoHeight ? `Resolução atual: ${v.videoWidth}x${v.videoHeight}` : 'Resolução fixa fornecida pelo servidor.');
        frag.appendChild(info);
      }
    } else if (kind === 'audio') {
      dom.osdPopoverTitle.textContent = 'Faixas de Áudio';
      const hls = state.player.hls;
      const v = dom.videoElement;

      if (hls && hls.audioTracks && hls.audioTracks.length > 1) {
        hls.audioTracks.forEach((t, idx) => {
          const title = formatLangCode(t.lang) || t.name || `Faixa ${idx + 1}`;
          const sub = t.lang ? `Idioma: ${t.lang.toUpperCase()}` : '';
          const btn = createPopoverItem({
            title,
            sub,
            active: hls.audioTrack === idx,
            onClick: () => {
              hls.audioTrack = idx;
              closeTracksPopover(true);
              refreshPlayerTrackControls();
            }
          });
          frag.appendChild(btn);
        });
      }

      if (v.audioTracks && v.audioTracks.length > 1) {
        for (let i = 0; i < v.audioTracks.length; i++) {
          const at = v.audioTracks[i];
          const title = formatLangCode(at.language) || at.label || `Faixa ${i + 1}`;
          const btn = createPopoverItem({
            title,
            sub: at.language ? at.language.toUpperCase() : '',
            active: at.enabled,
            onClick: () => {
              for (let j = 0; j < v.audioTracks.length; j++) {
                v.audioTracks[j].enabled = (j === i);
              }
              closeTracksPopover(true);
              refreshPlayerTrackControls();
            }
          });
          frag.appendChild(btn);
        }
      }

      const audioSiblings = getSiblingAudioItems();
      if (audioSiblings.length > 1) {
        if (frag.childNodes.length > 0) {
          frag.appendChild(createPopoverDivider('Versões Disponíveis'));
        }
        audioSiblings.forEach(s => {
          let tag = 'Versão Padrão';
          if (/\b(dub|dublado)\b/i.test(s.name)) tag = 'Dublado (Português)';
          else if (/\b(leg|legendado)\b/i.test(s.name)) tag = 'Legendado (Original)';
          else if (/\b(dual)\b/i.test(s.name)) tag = 'Dual Áudio';
          const isActive = (s.stream_id && state.player.currentItem && s.stream_id === state.player.currentItem.stream_id) || (s === state.player.currentItem);

          const btn = createPopoverItem({
            title: s.name || s.title,
            sub: tag,
            active: isActive,
            onClick: () => {
              if (isActive) {
                closeTracksPopover(true);
                return;
              }
              state.player.pendingResumeTime = dom.videoElement.currentTime || 0;
              closeTracksPopover(false);
              startPlayback({
                type: state.player.type,
                item: s,
                channelList: state.player.channelList,
                channelIndex: state.player.channelList.indexOf(s),
                episodeList: state.player.episodeList,
                episodeIndex: state.player.episodeIndex,
                triggerElement: triggerBtn
              });
            }
          });
          frag.appendChild(btn);
        });
      }

      if (frag.childNodes.length === 0) {
        frag.appendChild(createPopoverNote('Áudio padrão estéreo embutido no sinal.'));
      }
    } else if (kind === 'subs') {
      dom.osdPopoverTitle.textContent = 'Legendas';
      const hls = state.player.hls;
      const v = dom.videoElement;
      const tracks = getAvailableSubtitleTracks();
      const anyActive = tracks.some(t => t.active);

      const offBtn = createPopoverItem({
        title: 'Desativada',
        sub: 'Sem legendas na tela',
        active: !anyActive,
        onClick: () => {
          if (hls) hls.subtitleTrack = -1;
          if (v.textTracks) {
            for (let i = 0; i < v.textTracks.length; i++) {
              v.textTracks[i].mode = 'disabled';
            }
          }
          closeTracksPopover(true);
          refreshPlayerTrackControls();
        }
      });
      frag.appendChild(offBtn);

      if (tracks.length > 0) {
        frag.appendChild(createPopoverDivider('Faixas Disponíveis'));
        tracks.forEach(t => {
          const btn = createPopoverItem({
            title: t.label,
            sub: t.lang ? `Idioma: ${t.lang.toUpperCase()}` : 'Faixa de legenda',
            active: t.active,
            onClick: () => {
              if (t.type === 'hls' && hls) {
                hls.subtitleTrack = t.index;
              } else if (v.textTracks && v.textTracks[t.index]) {
                for (let i = 0; i < v.textTracks.length; i++) {
                  v.textTracks[i].mode = (i === t.index) ? 'showing' : 'disabled';
                }
              }
              closeTracksPopover(true);
              refreshPlayerTrackControls();
            }
          });
          frag.appendChild(btn);
        });
      }

      frag.appendChild(createPopoverDivider('Importar do Dispositivo'));
      const importBtn = createPopoverItem({
        title: 'Carregar arquivo (.srt / .vtt)...',
        sub: 'Selecione uma legenda local no seu computador ou celular',
        active: false,
        onClick: () => {
          dom.subtitleFileInput.click();
        }
      });
      frag.appendChild(importBtn);
    }

    dom.osdPopoverList.appendChild(frag);
    dom.osdTracksPopover.classList.remove('hidden');

    const activeItem = dom.osdPopoverList.querySelector('.osd-popover-item.active') || dom.osdPopoverList.querySelector('.osd-popover-item');
    if (activeItem) {
      setTvFocus(activeItem);
    }
  }

  function closeTracksPopover(restoreFocus = true) {
    if (!state.player.activePopover) return;
    state.player.activePopover = null;
    dom.osdTracksPopover.classList.add('hidden');
    dom.osdPopoverList.innerHTML = '';
    if (restoreFocus && state.player.popoverTrigger && document.body.contains(state.player.popoverTrigger)) {
      setTvFocus(state.player.popoverTrigger);
    }
    resetOsdAutoHideTimer();
  }

  function createPopoverItem({ title, sub = '', active = false, onClick }) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'osd-popover-item' + (active ? ' active' : '');
    btn.dataset.focusable = 'true';

    const check = document.createElement('span');
    check.className = 'osd-popover-check';
    check.textContent = active ? '✓' : '';

    const labelBox = document.createElement('div');
    labelBox.className = 'osd-popover-label-box';

    const titleSpan = document.createElement('span');
    titleSpan.className = 'osd-popover-label';
    titleSpan.textContent = title;
    labelBox.appendChild(titleSpan);

    if (sub) {
      const subSpan = document.createElement('span');
      subSpan.className = 'osd-popover-sub';
      subSpan.textContent = sub;
      labelBox.appendChild(subSpan);
    }

    btn.appendChild(check);
    btn.appendChild(labelBox);

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (typeof onClick === 'function') onClick();
    });

    return btn;
  }

  function createPopoverDivider(text) {
    const div = document.createElement('div');
    div.className = 'osd-popover-divider';
    div.textContent = text;
    return div;
  }

  function createPopoverNote(text) {
    const p = document.createElement('p');
    p.className = 'osd-popover-note';
    p.textContent = text;
    return p;
  }

  function setupVideoElementEvents() {
    const v = dom.videoElement;

    v.addEventListener('loadedmetadata', () => {
      if (state.player.pendingResumeTime > 0) {
        try {
          v.currentTime = state.player.pendingResumeTime;
        } catch (_) {}
        state.player.pendingResumeTime = 0;
      }
      refreshPlayerTrackControls();
    });

    v.addEventListener('resize', () => {
      refreshPlayerTrackControls();
    });

    v.addEventListener('playing', () => {
      state.player.isPlaying = true;
      dom.playerSpinner.classList.add('hidden');
      dom.playerErrorBox.classList.add('hidden');
      updatePlayPauseLabel(true);
      refreshPlayerTrackControls();
    });

    v.addEventListener('pause', () => {
      state.player.isPlaying = false;
      updatePlayPauseLabel(false);
    });

    v.addEventListener('waiting', () => {
      if (state.player.active) dom.playerSpinner.classList.remove('hidden');
    });

    v.addEventListener('timeupdate', () => {
      if (!state.player.active || state.player.type === 'live') return;
      const cur = v.currentTime || 0;
      const dur = v.duration || 0;
      dom.osdTimeCurrent.textContent = formatTime(cur);
      dom.osdTimeTotal.textContent = dur > 0 ? formatTime(dur) : '--:--';
      const pct = dur > 0 ? Math.min(100, (cur / dur) * 100) : 0;
      dom.osdProgressFill.style.width = `${pct}%`;
    });

    v.addEventListener('error', () => {
      if (!state.player.active) return;
      showPlayerError('Não foi possível abrir este stream no momento.');
    });

    dom.osdProgressWrap.addEventListener('click', (e) => {
      if (state.player.type === 'live') return;
      const rect = dom.osdProgressWrap.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      if (Number.isFinite(v.duration)) {
        v.currentTime = ratio * v.duration;
      }
      resetOsdAutoHideTimer();
    });

    // Subtitle File Upload
    dom.subtitleFileInput.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const vtt = srtToVtt(text);
        const blob = new Blob([vtt], { type: 'text/vtt' });
        const blobUrl = URL.createObjectURL(blob);
        state.player.customSubBlobUrls.push(blobUrl);

        if (v.textTracks) {
          for (let i = 0; i < v.textTracks.length; i++) {
            v.textTracks[i].mode = 'disabled';
          }
        }
        if (state.player.hls) {
          state.player.hls.subtitleTrack = -1;
        }

        const track = document.createElement('track');
        track.kind = 'subtitles';
        track.label = file.name.replace(/\.[^.]+$/, '');
        track.srclang = 'pt';
        track.src = blobUrl;
        track.default = true;
        v.appendChild(track);

        setTimeout(() => {
          if (track.track) track.track.mode = 'showing';
          refreshPlayerTrackControls();
          closeTracksPopover(true);
        }, 120);
      } catch (err) {
        console.error('Falha ao importar legenda:', err);
      }
      dom.subtitleFileInput.value = '';
    });

    // Top OSD Back Button (Browser / TV Click)
    dom.btnOsdBack.addEventListener('click', (e) => {
      e.stopPropagation();
      if (state.player.type === 'live') {
        enterWebMiniPipMode();
      } else {
        closePlayer();
      }
    });

    // Mini PiP Direct Action Buttons (Browser 1-click Close & Expand)
    dom.btnMiniPipExpand.addEventListener('click', (e) => {
      e.stopPropagation();
      expandMiniPipToFullScreen();
    });

    dom.btnMiniPipClose.addEventListener('click', (e) => {
      e.stopPropagation();
      if (window.AndroidBridge && typeof window.AndroidBridge.closeMiniPlayer === 'function') {
        window.AndroidBridge.closeMiniPlayer();
      }
      closePlayer();
    });

    // Bottom Track Popover Triggers
    dom.btnOsdQuality.addEventListener('click', (e) => {
      e.stopPropagation();
      if (state.player.activePopover === 'quality') {
        closeTracksPopover(true);
      } else {
        openTracksPopover('quality', dom.btnOsdQuality);
      }
    });

    dom.btnOsdAudio.addEventListener('click', (e) => {
      e.stopPropagation();
      if (state.player.activePopover === 'audio') {
        closeTracksPopover(true);
      } else {
        openTracksPopover('audio', dom.btnOsdAudio);
      }
    });

    dom.btnOsdSubs.addEventListener('click', (e) => {
      e.stopPropagation();
      if (state.player.activePopover === 'subs') {
        closeTracksPopover(true);
      } else {
        openTracksPopover('subs', dom.btnOsdSubs);
      }
    });

    dom.btnOsdPopoverClose.addEventListener('click', (e) => {
      e.stopPropagation();
      closeTracksPopover(true);
    });

    dom.btnOsdPlayPause.addEventListener('click', togglePlayPause);
    dom.btnOsdPrevCh.addEventListener('click', () => stepChannel(-1));
    dom.btnOsdNextCh.addEventListener('click', () => stepChannel(1));
    dom.btnOsdRw.addEventListener('click', () => seekRelative(-15));
    dom.btnOsdFf.addEventListener('click', () => seekRelative(15));
    dom.btnOsdNextEp.addEventListener('click', playNextEpisode);
    dom.btnOsdFav.addEventListener('click', () => {
      if (state.player.currentItem) {
        toggleFavorite(state.player.currentItem, state.player.type);
        updateOsdFavButton();
      }
      resetOsdAutoHideTimer();
    });
    dom.btnOsdAspect.addEventListener('click', cycleAspectRatio);
    dom.btnOsdHide.addEventListener('click', hidePlayerOsd);
    dom.btnOsdClose.addEventListener('click', closePlayer);

    dom.btnPipExpand.addEventListener('click', expandMiniPipToFullScreen);
    dom.btnPipStop.addEventListener('click', () => {
      if (window.AndroidBridge && typeof window.AndroidBridge.closeMiniPlayer === 'function') {
        window.AndroidBridge.closeMiniPlayer();
      }
      closePlayer();
    });

    dom.btnPlayerRetry.addEventListener('click', () => {
      if (state.player.currentItem) {
        startPlayback({
          type: state.player.type,
          item: state.player.currentItem,
          channelList: state.player.channelList,
          channelIndex: state.player.channelIndex,
          episodeList: state.player.episodeList,
          episodeIndex: state.player.episodeIndex,
          triggerElement: state.player.previousFocus
        });
      }
    });
    dom.btnPlayerExitErr.addEventListener('click', closePlayer);

    // Mouse wake up during browser playback
    let lastMouseMoveTime = 0;
    dom.playerOverlay.addEventListener('mousemove', () => {
      if (!state.player.active || state.player.miniPipActive) return;
      const now = Date.now();
      if (now - lastMouseMoveTime < 180) return;
      lastMouseMoveTime = now;
      dom.playerOverlay.classList.remove('cursor-idle');
      if (!state.player.osdVisible) {
        showPlayerOsd(false);
      } else {
        resetOsdAutoHideTimer();
      }
    });

    dom.playerOverlay.addEventListener('click', (e) => {
      if (e.target.closest('#mini-pip-bar') || e.target.closest('#pip-controls-box')) {
        return;
      }
      if (state.player.miniPipActive) {
        expandMiniPipToFullScreen();
        return;
      }
      if (state.player.activePopover) {
        if (!e.target.closest('#osd-tracks-popover') && !e.target.closest('#btn-osd-quality') && !e.target.closest('#btn-osd-audio') && !e.target.closest('#btn-osd-subs')) {
          closeTracksPopover(false);
        }
        return;
      }
      if (e.target === dom.videoElement) {
        if (!state.player.osdVisible) {
          showPlayerOsd(true);
        } else {
          hidePlayerOsd();
        }
      }
    });
  }

  // Callbacks invoked from Native Android Player
  window.onNativeStepChannel = function (delta) {
    stepChannel(delta);
  };

  window.onNativeSelectChannelIndex = function (idx) {
    const list = state.player.channelList;
    if (!list || idx < 0 || idx >= list.length) return;
    startPlayback({
      type: 'live',
      item: list[idx],
      channelList: list,
      channelIndex: idx,
      triggerElement: state.player.previousFocus
    });
  };

  window.onNativeMiniPlayerState = function (isActive) {
    state.player.miniPipActive = Boolean(isActive);
    dom.pipControlsBox.classList.toggle('hidden', !state.player.miniPipActive);
    if (state.player.previousFocus && document.body.contains(state.player.previousFocus)) {
      setTvFocus(state.player.previousFocus);
    }
  };

  /* ========================================================================
     6. FAVORITES, RECENT, SEARCH & ACCOUNT
     ======================================================================== */
  function getItemKey(item, type) {
    const id = item.stream_id || item.series_id || item.id || item.name;
    return `${type}:${id}`;
  }

  function isFavorite(item, type) {
    const key = getItemKey(item, type);
    return state.favorites.some(f => f._favKey === key);
  }

  function toggleFavorite(item, type) {
    const key = getItemKey(item, type);
    const idx = state.favorites.findIndex(f => f._favKey === key);
    if (idx >= 0) {
      state.favorites.splice(idx, 1);
    } else {
      state.favorites.unshift({ ...item, _favKey: key, _savedType: type });
    }
    saveJson(STORAGE_KEYS.FAVORITES, state.favorites);
    if (state.activeSection === 'favorites') renderFavoritesGrid();
  }

  function updateDetailsFavButton() {
    if (!state.modal.item) return;
    const fav = isFavorite(state.modal.item, state.modal.type);
    dom.btnDetailsFav.classList.toggle('is-fav', fav);
    if (dom.detailsFavLabel) {
      dom.detailsFavLabel.textContent = fav ? 'Nos Favoritos' : 'Favoritar';
    } else {
      dom.btnDetailsFav.textContent = fav ? 'Nos Favoritos' : 'Favoritar';
    }
  }

  function updateOsdFavButton() {
    if (!state.player.currentItem) return;
    const fav = isFavorite(state.player.currentItem, state.player.type);
    dom.btnOsdFav.classList.toggle('is-fav', fav);
    dom.osdFavLabel.textContent = fav ? 'Favorito' : 'Favoritar';
  }

  function addToRecent(item, type) {
    const key = getItemKey(item, type);
    state.recent = state.recent.filter(r => r._favKey !== key);
    state.recent.unshift({ ...item, _favKey: key, _savedType: type });
    if (state.recent.length > 20) state.recent.length = 20;
    saveJson(STORAGE_KEYS.RECENT, state.recent);
  }

  function renderFavoritesGrid() {
    dom.favoritesGrid.innerHTML = '';
    if (state.favorites.length === 0) {
      dom.favoritesGrid.innerHTML = '<p class="catalog-sub">Você ainda não adicionou canais, filmes ou séries aos favoritos.</p>';
      return;
    }
    const frag = document.createDocumentFragment();
    state.favorites.forEach((item, idx) => {
      if (item._savedType === 'live') {
        frag.appendChild(createChannelCard(item, idx, state.favorites.filter(f => f._savedType === 'live')));
      } else {
        frag.appendChild(createPosterCard(item, item._savedType || 'movie'));
      }
    });
    dom.favoritesGrid.appendChild(frag);
  }

  async function executeGlobalSearch() {
    const q = dom.globalSearchInput.value.trim().toLowerCase();
    if (!q) return;

    dom.searchStatus.textContent = `Buscando por "${q}"...`;
    dom.searchResultsGrid.innerHTML = '';

    const results = [];
    const seen = new Set();

    function collectFromMap(map, type) {
      for (const list of map.values()) {
        for (const item of list) {
          const name = (item.name || item.title || '').toLowerCase();
          const key = getItemKey(item, type);
          if (name.includes(q) && !seen.has(key)) {
            seen.add(key);
            results.push({ item, type });
            if (results.length >= 60) return;
          }
        }
      }
    }

    collectFromMap(state.liveByCat, 'live');
    collectFromMap(state.vodByCat, 'movie');
    collectFromMap(state.seriesByCat, 'series');

    dom.searchStatus.textContent = `${results.length} resultados encontrados para "${q}"`;
    const frag = document.createDocumentFragment();
    results.forEach(({ item, type }, idx) => {
      if (type === 'live') {
        frag.appendChild(createChannelCard(item, idx, [item]));
      } else {
        frag.appendChild(createPosterCard(item, type));
      }
    });
    dom.searchResultsGrid.appendChild(frag);
  }

  function populateAccountSection() {
    if (!state.session) return;
    dom.accProfileName.textContent = state.session.name || 'KS TV-Stream';
    dom.accServerUrl.textContent = state.session.server || '--';
    dom.accUsername.textContent = state.session.username || '--';

    const u = state.session.userInfo;
    if (u) {
      dom.accStatusBadge.textContent = u.status === 'Active' ? 'Ativo' : u.status;
      dom.accountBadge.textContent = u.is_trial === '1' ? 'Teste Ativo' : 'Ativo';
      if (u.exp_date) {
        const exp = new Date(Number(u.exp_date) * 1000);
        dom.accExpDate.textContent = exp.toLocaleString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      } else {
        dom.accExpDate.textContent = 'Ilimitado';
      }
      dom.accConnections.textContent = `${u.active_cons || 0} / ${u.max_connections || 1}`;
    }
  }

  function switchSection(sectionName) {
    state.activeSection = sectionName;
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.section === sectionName);
    });
    document.querySelectorAll('.content-section').forEach(sec => {
      sec.classList.toggle('active', sec.id === `section-${sectionName}`);
    });
    if (sectionName === 'favorites') {
      renderFavoritesGrid();
    } else if (sectionName === 'home') {
      buildHomeShowcase();
    }
  }

  /* ========================================================================
     7. ULTRA-FAST STRUCTURED D-PAD NAVIGATION ENGINE (0ms Lag on Fire TV)
     ======================================================================== */
  function pushBackState(tag) {
    try {
      window.history.pushState({ tvLayer: tag, t: Date.now() }, '');
    } catch (_) {}
  }

  function handleBackAction() {
    // 1. If Video Player is open in Full Screen:
    if (state.player.active) {
      if (state.player.activePopover) {
        closeTracksPopover(true);
        return true;
      }
      if (state.player.osdVisible) {
        // 1st Back press: Hide player options & channel list (leave video 100% CLEAR)!
        hidePlayerOsd();
        pushBackState('player-clear');
        return true;
      } else {
        // 2nd Back press (screen is already clear):
        // On Live TV -> Shrink to Mini Player (PiP) so stream continues while browsing!
        if (state.player.type === 'live') {
          enterWebMiniPipMode();
          return true;
        }
        // On Movies/Series -> Exit player
        closePlayer();
        return true;
      }
    }

    // 2. If Details / Series Modal is open:
    if (state.modal.active) {
      closeDetailsModal();
      return true;
    }

    // 3. If inside App Screen and focus is not in Top Navigation Bar, move focus up to Top Nav
    if (dom.appScreen.classList.contains('active')) {
      const activeEl = document.querySelector('.tv-focused') || document.activeElement;
      if (activeEl && !activeEl.closest('.tvos-nav-pill')) {
        const currentNav = document.querySelector(`.nav-item[data-section="${state.activeSection}"]`) || document.querySelector('.nav-item');
        if (currentNav) {
          setTvFocus(currentNav);
          return true;
        }
      }
    }

    return false;
  }

  window.handleFireTvBack = handleBackAction;

  window.handleFireTvKey = function (keyName) {
    if (keyName === 'Back') {
      return handleBackAction() ? 'CONSUMED' : 'IGNORED';
    }

    if (state.player.active) {
      if (keyName === 'MediaPlayPause') {
        togglePlayPause();
        return 'CONSUMED';
      }
      if (keyName === 'MediaFastForward') {
        seekRelative(15);
        return 'CONSUMED';
      }
      if (keyName === 'MediaRewind') {
        seekRelative(-15);
        return 'CONSUMED';
      }

      if (!state.player.osdVisible) {
        showPlayerOsd(true);
        return 'CONSUMED';
      }

      resetOsdAutoHideTimer();
      const focusedEl = document.querySelector('.tv-focused') || document.activeElement;
      if (focusedEl === dom.osdProgressWrap && (keyName === 'ArrowLeft' || keyName === 'ArrowRight')) {
        seekRelative(keyName === 'ArrowRight' ? 15 : -15);
        return 'CONSUMED';
      }
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(keyName)) {
        moveSpatialFocus(keyName.replace('Arrow', '').toLowerCase());
        return 'CONSUMED';
      }
      if (keyName === 'Enter') {
        if (focusedEl) focusedEl.click();
        return 'CONSUMED';
      }
      return 'CONSUMED';
    }

    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(keyName)) {
      moveSpatialFocus(keyName.replace('Arrow', '').toLowerCase());
      return 'CONSUMED';
    }

    if (keyName === 'Enter') {
      const focused = document.querySelector('.tv-focused') || document.activeElement;
      if (!focused) return 'IGNORED';
      if (focused.tagName === 'INPUT') {
        focused.focus();
        return 'INPUT_FOCUS';
      }
      focused.click();
      return 'CONSUMED';
    }

    return 'IGNORED';
  };

  window.addEventListener('popstate', () => {
    handleBackAction();
  });

  /**
   * Instantaneous focus + direct container scroll math (avoids slow browser scrollIntoView!)
   */
  function setTvFocus(el) {
    if (!el) return;
    const prev = document.querySelector('.tv-focused');
    if (prev && prev !== el) prev.classList.remove('tv-focused');
    el.classList.add('tv-focused');
    try {
      el.focus({ preventScroll: true });
    } catch (_) {
      el.focus();
    }

    // 1. Category Sidebar fast vertical centering
    const catList = el.closest('.category-list');
    if (catList) {
      catList.scrollTop = el.offsetTop - (catList.clientHeight >> 1) + (el.offsetHeight >> 1);
      return;
    }

    // 2. Live Channel Drawer fast vertical centering
    const drawerList = el.closest('.osd-drawer-list');
    if (drawerList) {
      drawerList.scrollTop = el.offsetTop - (drawerList.clientHeight >> 1) + (el.offsetHeight >> 1);
      return;
    }

    // 2b. OSD Tracks Popover fast vertical centering
    const popoverList = el.closest('.osd-popover-list');
    if (popoverList) {
      popoverList.scrollTop = el.offsetTop - (popoverList.clientHeight >> 1) + (el.offsetHeight >> 1);
      return;
    }

    // 3. Horizontal Shelf ("Em Alta") fast horizontal + section vertical positioning
    const rowTrack = el.closest('.home-row-track');
    if (rowTrack) {
      rowTrack.scrollLeft = Math.max(0, el.offsetLeft - 36);
      const sec = el.closest('.content-section');
      const row = el.closest('.home-row');
      if (sec && row) {
        const targetTop = row.offsetTop - 80;
        if (sec.scrollTop > targetTop || sec.scrollTop + sec.clientHeight < row.offsetTop + row.offsetHeight) {
          sec.scrollTop = Math.max(0, targetTop);
        }
      }
      return;
    }

    // 4. Catalog Main Grid fast vertical scroll
    const catalogMain = el.closest('.catalog-main');
    if (catalogMain) {
      const elTop = el.offsetTop;
      const elBottom = elTop + el.offsetHeight + 24;
      if (elTop < catalogMain.scrollTop + 60) {
        catalogMain.scrollTop = Math.max(0, elTop - 80);
      } else if (elBottom > catalogMain.scrollTop + catalogMain.clientHeight) {
        catalogMain.scrollTop = elBottom - catalogMain.clientHeight + 24;
      }
      return;
    }

    // 5. Fallback for modals/other sections
    const sec = el.closest('.content-section, .details-modal');
    if (sec) {
      const elTop = el.offsetTop;
      if (elTop < sec.scrollTop + 50 || elTop > sec.scrollTop + sec.clientHeight - 80) {
        sec.scrollTop = Math.max(0, elTop - 100);
      }
    }
  }

  function getActiveNavBtn() {
    return document.querySelector(`.nav-item[data-section="${state.activeSection}"]`) || document.querySelector('.nav-item');
  }

  /**
   * Structured Zone + Neighbor Navigation first (0ms DOM traversal), with geometric fallback
   */
  function moveSpatialFocus(direction) {
    const current = document.querySelector('.tv-focused') || document.activeElement;
    if (!current) {
      const first = getVisibleFocusables()[0];
      if (first) setTvFocus(first);
      return;
    }

    // --- ZONE 1: Top Navigation Pill (.tvos-nav-pill) ---
    if (current.closest('.tvos-nav-pill')) {
      if (direction === 'left' && current.previousElementSibling) {
        setTvFocus(current.previousElementSibling);
        return;
      }
      if (direction === 'right' && current.nextElementSibling) {
        setTvFocus(current.nextElementSibling);
        return;
      }
      if (direction === 'down') {
        if (state.activeSection === 'home') {
          setTvFocus(dom.btnHeroPlay);
          return;
        }
        if (state.activeSection === 'live') {
          const target = dom.liveCategoriesList.querySelector('.cat-btn.active') || dom.liveCategoriesList.querySelector('.cat-btn') || dom.liveChannelsGrid.querySelector('.channel-card');
          if (target) { setTvFocus(target); return; }
        }
        if (state.activeSection === 'movies') {
          const target = dom.moviesCategoriesList.querySelector('.cat-btn.active') || dom.moviesCategoriesList.querySelector('.cat-btn') || dom.moviesGrid.querySelector('.poster-card');
          if (target) { setTvFocus(target); return; }
        }
        if (state.activeSection === 'series') {
          const target = dom.seriesCategoriesList.querySelector('.cat-btn.active') || dom.seriesCategoriesList.querySelector('.cat-btn') || dom.seriesGrid.querySelector('.poster-card');
          if (target) { setTvFocus(target); return; }
        }
        if (state.activeSection === 'search') {
          setTvFocus(dom.globalSearchInput);
          return;
        }
        if (state.activeSection === 'account') {
          setTvFocus(dom.btnRefreshCache);
          return;
        }
      }
      if (direction === 'up') return;
    }

    // --- ZONE 2: Category Sidebar (.category-list) -> Instant Up/Down/Right! ---
    const catList = current.closest('.category-list');
    if (catList) {
      if (direction === 'up') {
        if (current.previousElementSibling) {
          setTvFocus(current.previousElementSibling);
        } else {
          setTvFocus(getActiveNavBtn());
        }
        return;
      }
      if (direction === 'down') {
        if (current.nextElementSibling) {
          setTvFocus(current.nextElementSibling);
        }
        return;
      }
      if (direction === 'right') {
        const layout = catList.closest('.catalog-layout');
        if (layout) {
          const firstCard = layout.querySelector('.channel-card, .poster-card, .toolbar-search input');
          if (firstCard) setTvFocus(firstCard);
        }
        return;
      }
      if (direction === 'left') return;
    }

    // --- ZONE 3: Horizontal Shelves on Home (.home-row-track) -> Instant Left/Right/Up/Down! ---
    const rowTrack = current.closest('.home-row-track');
    if (rowTrack) {
      if (direction === 'left') {
        if (current.previousElementSibling) setTvFocus(current.previousElementSibling);
        return;
      }
      if (direction === 'right') {
        if (current.nextElementSibling) setTvFocus(current.nextElementSibling);
        return;
      }
      const currentRow = current.closest('.home-row');
      if (direction === 'up' && currentRow) {
        const prevRow = currentRow.previousElementSibling;
        if (prevRow && prevRow.classList.contains('home-row')) {
          const card = prevRow.querySelector('[data-focusable="true"]');
          if (card) { setTvFocus(card); return; }
        }
        const homeSec = document.getElementById('section-home');
        if (homeSec) homeSec.scrollTop = 0;
        setTvFocus(dom.btnHeroPlay);
        return;
      }
      if (direction === 'down' && currentRow) {
        const nextRow = currentRow.nextElementSibling;
        if (nextRow && nextRow.classList.contains('home-row')) {
          const card = nextRow.querySelector('[data-focusable="true"]');
          if (card) { setTvFocus(card); return; }
        }
        return;
      }
    }

    // --- ZONE 4: Hero Banner Buttons (.hero-buttons) ---
    if (current.closest('.hero-buttons')) {
      if (direction === 'left' && current.previousElementSibling) {
        setTvFocus(current.previousElementSibling);
        return;
      }
      if (direction === 'right' && current.nextElementSibling) {
        setTvFocus(current.nextElementSibling);
        return;
      }
      if (direction === 'up') {
        setTvFocus(getActiveNavBtn());
        return;
      }
      if (direction === 'down') {
        const firstShelfCard = dom.homeRows.querySelector('[data-focusable="true"]');
        if (firstShelfCard) setTvFocus(firstShelfCard);
        return;
      }
    }

    // --- ZONE 5: Global Search Box (.search-hero-box) ---
    if (current === dom.globalSearchInput) {
      if (direction === 'right') {
        setTvFocus(dom.btnGlobalSearch);
        return;
      }
      if (direction === 'up') {
        setTvFocus(getActiveNavBtn());
        return;
      }
      if (direction === 'down') {
        const firstResult = dom.searchResultsGrid.querySelector('[data-focusable="true"]');
        if (firstResult) setTvFocus(firstResult);
        return;
      }
      return;
    }
    if (current === dom.btnGlobalSearch) {
      if (direction === 'left') {
        setTvFocus(dom.globalSearchInput);
        return;
      }
      if (direction === 'up') {
        setTvFocus(getActiveNavBtn());
        return;
      }
      if (direction === 'down') {
        const firstResult = dom.searchResultsGrid.querySelector('[data-focusable="true"]');
        if (firstResult) setTvFocus(firstResult);
        return;
      }
      return;
    }

    // --- ZONE 5b: OSD Tracks Popover (.osd-tracks-popover) ---
    if (current.closest('.osd-tracks-popover')) {
      if (direction === 'up') {
        if (current.previousElementSibling && current.previousElementSibling.classList.contains('osd-popover-item')) {
          setTvFocus(current.previousElementSibling);
        } else if (current !== dom.btnOsdPopoverClose) {
          setTvFocus(dom.btnOsdPopoverClose);
        }
        return;
      }
      if (direction === 'down') {
        if (current === dom.btnOsdPopoverClose) {
          const firstItem = dom.osdPopoverList.querySelector('.osd-popover-item');
          if (firstItem) setTvFocus(firstItem);
        } else if (current.nextElementSibling && current.nextElementSibling.classList.contains('osd-popover-item')) {
          setTvFocus(current.nextElementSibling);
        }
        return;
      }
      if (direction === 'left' || direction === 'right') return;
    }

    // --- ZONE 5c: Details Modal Top Bar (.details-top-bar) ---
    if (state.modal.active) {
      if (current === dom.btnDetailsBack && direction === 'down') {
        const target = dom.btnDetailsPlay || dom.detailsModal.querySelector('.details-actions [data-focusable="true"]');
        if (target) { setTvFocus(target); return; }
      }
      if (current.closest('.details-actions') && direction === 'up') {
        if (dom.btnDetailsBack) { setTvFocus(dom.btnDetailsBack); return; }
      }
    }

    // --- ZONE 6: Live Channel Drawer inside Player (.osd-drawer-list) ---
    const drawerList = current.closest('.osd-drawer-list');
    if (drawerList) {
      if (direction === 'up') {
        if (current.previousElementSibling) {
          setTvFocus(current.previousElementSibling);
        } else {
          setTvFocus(dom.btnOsdBack);
        }
        return;
      }
      if (direction === 'down') {
        if (current.nextElementSibling) {
          setTvFocus(current.nextElementSibling);
        } else {
          setTvFocus(dom.btnOsdPlayPause);
        }
        return;
      }
      if (direction === 'right') {
        setTvFocus(dom.btnOsdPlayPause);
        return;
      }
      return;
    }

    // --- ZONE 7: Fallback Geometric Navigation for Grids & Modals ---
    const focusables = getVisibleFocusables();
    if (focusables.length === 0) return;
    if (!focusables.includes(current)) {
      setTvFocus(focusables[0]);
      return;
    }

    const curRect = current.getBoundingClientRect();
    const curCx = curRect.left + curRect.width / 2;
    const curCy = curRect.top + curRect.height / 2;

    let bestCandidate = null;
    let bestScore = Infinity;

    for (const cand of focusables) {
      if (cand === current) continue;
      const r = cand.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = cx - curCx;
      const dy = cy - curCy;

      if (direction === 'left' && dx >= -6) continue;
      if (direction === 'right' && dx <= 6) continue;
      if (direction === 'up' && dy >= -6) continue;
      if (direction === 'down' && dy <= 6) continue;

      const primaryDist = (direction === 'left' || direction === 'right') ? Math.abs(dx) : Math.abs(dy);
      const orthoDist = (direction === 'left' || direction === 'right') ? Math.abs(dy) : Math.abs(dx);

      const score = primaryDist + orthoDist * 2.5;
      if (score < bestScore) {
        bestScore = score;
        bestCandidate = cand;
      }
    }

    if (bestCandidate) {
      setTvFocus(bestCandidate);
    } else if (direction === 'up' && dom.appScreen.classList.contains('active') && !state.modal.active && !state.player.active) {
      setTvFocus(getActiveNavBtn());
    }
  }

  function getVisibleFocusables() {
    let scope = document.body;
    if (state.player.active) {
      scope = dom.playerOverlay;
    } else if (state.modal.active) {
      scope = dom.detailsModal;
    } else if (dom.loginScreen.classList.contains('active')) {
      scope = dom.loginScreen;
    } else {
      scope = dom.appScreen;
    }

    const candidates = Array.from(scope.querySelectorAll('[data-focusable="true"]'));
    return candidates.filter(el => {
      if (el.disabled) return false;
      if (el.closest('.hidden')) return false;
      const sec = el.closest('.content-section');
      if (sec && !sec.classList.contains('active')) return false;
      const loginPanel = el.closest('.login-panel');
      if (loginPanel && !loginPanel.classList.contains('active')) return false;
      return el.offsetWidth > 0 && el.offsetHeight > 0;
    });
  }

  function setupKeyboardAndRemoteNavigation() {
    window.addEventListener('keydown', (e) => {
      const key = e.key;
      const keyCode = e.keyCode || e.which;
      const activeEl = document.activeElement;
      const isTextInput = activeEl && activeEl.tagName === 'INPUT';

      const isBackKey =
        key === 'Escape' ||
        key === 'GoBack' ||
        key === 'BrowserBack' ||
        keyCode === 4 ||
        (key === 'Backspace' && !isTextInput);

      if (isBackKey) {
        if (handleBackAction()) {
          e.preventDefault();
          e.stopPropagation();
        }
        return;
      }

      if (state.player.active) {
        if (key === 'MediaPlayPause' || keyCode === 179) {
          e.preventDefault();
          togglePlayPause();
          return;
        }
        if (key === 'MediaFastForward' || keyCode === 228) {
          e.preventDefault();
          seekRelative(15);
          return;
        }
        if (key === 'MediaRewind' || keyCode === 227) {
          e.preventDefault();
          seekRelative(-15);
          return;
        }

        if (!state.player.osdVisible) {
          if (['Enter', ' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)) {
            e.preventDefault();
            showPlayerOsd(true);
            return;
          }
        } else {
          resetOsdAutoHideTimer();
          const curFocused = document.querySelector('.tv-focused') || document.activeElement;
          if (curFocused === dom.osdProgressWrap && (key === 'ArrowLeft' || key === 'ArrowRight')) {
            e.preventDefault();
            seekRelative(key === 'ArrowRight' ? 15 : -15);
            return;
          }
          if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(key)) {
            e.preventDefault();
            const dir = key.replace('Arrow', '').toLowerCase();
            moveSpatialFocus(dir);
            return;
          }
        }
        return;
      }

      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)) {
        e.preventDefault();
        const dir = key.replace('Arrow', '').toLowerCase();
        moveSpatialFocus(dir);
      }
    }, true);
  }

  /* ========================================================================
     8. APP EVENT WIRING & INITIALIZATION
     ======================================================================== */
  function setupAppEvents() {
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', () => {
        switchSection(btn.dataset.section);
      });
    });

    dom.btnHeroPlay.addEventListener('click', () => {
      if (!state.heroItem) return;
      if (state.heroItem.type === 'live') {
        startPlayback({
          type: 'live',
          item: state.heroItem.item,
          channelList: state.currentLiveList,
          channelIndex: 0,
          triggerElement: dom.btnHeroPlay
        });
      } else {
        openDetailsModal(state.heroItem.item, state.heroItem.type, dom.btnHeroPlay);
      }
    });

    dom.btnHeroLive.addEventListener('click', () => {
      switchSection('live');
    });

    dom.liveFilterInput.addEventListener('input', () => {
      state.liveRenderLimit = PAGE_SIZE;
      renderLiveChannels();
    });
    dom.moviesFilterInput.addEventListener('input', () => {
      state.vodRenderLimit = PAGE_SIZE;
      renderVodGrid();
    });
    dom.seriesFilterInput.addEventListener('input', () => {
      state.seriesRenderLimit = PAGE_SIZE;
      renderSeriesGrid();
    });

    dom.btnLiveLoadMore.addEventListener('click', () => {
      state.liveRenderLimit += PAGE_SIZE;
      renderLiveChannels();
    });
    dom.btnMoviesLoadMore.addEventListener('click', () => {
      state.vodRenderLimit += PAGE_SIZE;
      renderVodGrid();
    });
    dom.btnSeriesLoadMore.addEventListener('click', () => {
      state.seriesRenderLimit += PAGE_SIZE;
      renderSeriesGrid();
    });

    if (dom.btnDetailsBack) {
      dom.btnDetailsBack.addEventListener('click', closeDetailsModal);
    }
    dom.btnDetailsClose.addEventListener('click', closeDetailsModal);
    dom.btnDetailsFav.addEventListener('click', () => {
      if (state.modal.item) {
        toggleFavorite(state.modal.item, state.modal.type);
        updateDetailsFavButton();
      }
    });
    dom.btnDetailsPlay.addEventListener('click', () => {
      if (!state.modal.item) return;
      if (state.modal.type === 'movie') {
        startPlayback({
          type: 'movie',
          item: state.modal.item,
          triggerElement: dom.btnDetailsPlay
        });
      } else if (state.modal.type === 'series') {
        const firstEpBtn = dom.episodesList.querySelector('.episode-card');
        if (firstEpBtn) firstEpBtn.click();
      }
    });

    dom.btnGlobalSearch.addEventListener('click', executeGlobalSearch);
    dom.globalSearchInput.addEventListener('input', () => {
      if (dom.globalSearchInput.value.trim().length >= 2) {
        executeGlobalSearch();
      }
    });
    dom.globalSearchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') executeGlobalSearch();
    });

    dom.btnRefreshCache.addEventListener('click', async () => {
      state.liveByCat.clear();
      state.vodByCat.clear();
      state.seriesByCat.clear();
      state.vodInfoCache.clear();
      state.seriesInfoCache.clear();
      state.epgCache.clear();
      await initializeCatalog();
      switchSection('home');
    });

    dom.btnSwitchLogin.addEventListener('click', async () => {
      await resetApplicationStateAndClearData();
    });
  }

  async function resetApplicationStateAndClearData() {
    closePlayer();
    closeDetailsModal();

    // 1. Reset Session & In-Memory Catalogs
    state.session = null;
    state.favorites = [];
    state.recent = [];
    state.liveCategories = [];
    state.vodCategories = [];
    state.seriesCategories = [];
    state.fourKCatIds.clear();
    state.liveByCat.clear();
    state.vodByCat.clear();
    state.seriesByCat.clear();
    state.vodInfoCache.clear();
    state.seriesInfoCache.clear();
    state.epgCache.clear();
    state.currentLiveList = [];
    state.currentVodList = [];
    state.currentSeriesList = [];
    state.heroItem = null;

    // 2. Remove all persistence from LocalStorage
    localStorage.removeItem(STORAGE_KEYS.SESSION);
    localStorage.removeItem(STORAGE_KEYS.FAVORITES);
    localStorage.removeItem(STORAGE_KEYS.RECENT);

    // 3. Purge Proxy In-Memory Cache on Node server
    if (isLocalServer) {
      try {
        await fetch('/api/clear-cache');
      } catch (_) {}
    }

    // 4. Wipe clean all input fields across ALL login tabs
    const xtreamName = document.getElementById('xtream-name');
    if (xtreamName) xtreamName.value = 'KS TV-Stream';
    const xtreamServer = document.getElementById('xtream-server');
    if (xtreamServer) xtreamServer.value = '';
    const xtreamUser = document.getElementById('xtream-user');
    if (xtreamUser) xtreamUser.value = '';
    const xtreamPass = document.getElementById('xtream-pass');
    if (xtreamPass) xtreamPass.value = '';

    const coreServer = document.getElementById('core-server');
    if (coreServer) coreServer.value = '';
    const coreUser = document.getElementById('core-user');
    if (coreUser) coreUser.value = '';
    const corePass = document.getElementById('core-pass');
    if (corePass) corePass.value = '';

    const m3uUrl = document.getElementById('m3u-url');
    if (m3uUrl) m3uUrl.value = '';

    dom.loginError.classList.add('hidden');
    dom.loginError.textContent = '';

    // 5. Clear all rendered UI components & grids
    dom.homeRows.innerHTML = '';
    dom.liveCategoriesList.innerHTML = '';
    dom.liveChannelsGrid.innerHTML = '';
    dom.moviesCategoriesList.innerHTML = '';
    dom.moviesGrid.innerHTML = '';
    dom.seriesCategoriesList.innerHTML = '';
    dom.seriesGrid.innerHTML = '';
    dom.favoritesGrid.innerHTML = '';
    dom.searchResultsGrid.innerHTML = '';
    dom.globalSearchInput.value = '';
    dom.liveFilterInput.value = '';
    dom.moviesFilterInput.value = '';
    dom.seriesFilterInput.value = '';
    dom.liveCatCount.textContent = '0';
    dom.moviesCatCount.textContent = '0';
    dom.seriesCatCount.textContent = '0';

    // 6. Reset Account section labels
    dom.accProfileName.textContent = 'KS TV-Stream';
    dom.accServerUrl.textContent = '--';
    dom.accUsername.textContent = '--';
    dom.accStatusBadge.textContent = '--';
    dom.accExpDate.textContent = '--';
    dom.accConnections.textContent = '--';
    dom.accountBadge.textContent = 'Desconectado';

    // 7. Transition to Login Screen
    dom.appScreen.classList.remove('active');
    dom.loginScreen.classList.add('active');

    const activePanel = document.querySelector('.login-panel.active');
    const firstInput = activePanel ? activePanel.querySelector('input') : null;
    if (firstInput) {
      firstInput.focus();
    } else {
      setTvFocus(dom.btnLoginSubmit);
    }
  }

  function init() {
    updateClock();
    setInterval(updateClock, 15000);

    setupLoginEvents();
    setupAppEvents();
    setupVideoElementEvents();
    setupKeyboardAndRemoteNavigation();

    setTvFocus(dom.btnLoginSubmit);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
