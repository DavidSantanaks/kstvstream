/* ==========================================================================
    Apple TV (tvOS) IPTV Player Engine — Fire TV Stick 4K & Web
   ========================================================================== */

(function () {
  'use strict';

  const STORAGE_KEYS = {
    SESSION: 'appletv_iptv_session_v1',
    FAVORITES: 'appletv_iptv_favorites_v1',
    RECENT: 'appletv_iptv_recent_v1'
  };

  const PAGE_SIZE = 36;
  const OSD_AUTOHIDE_MS = 4000;

  const state = {
    loginMode: 'xtream', // 'xtream' | 'core' | 'm3u'
    coreHost: '',
    session: null,       // { mode, name, server, username, password, m3uUrl, userInfo, serverInfo }
    activeSection: 'home',

    // Categories
    liveCategories: [],
    vodCategories: [],
    seriesCategories: [],

    // Active Category IDs
    activeLiveCatId: null,
    activeVodCatId: null,
    activeSeriesCatId: null,

    // In-memory stream caches by categoryId
    liveByCat: new Map(),
    vodByCat: new Map(),
    seriesByCat: new Map(),
    vodInfoCache: new Map(),
    seriesInfoCache: new Map(),

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
      type: null, // 'movie' | 'series'
      seriesInfo: null,
      activeSeason: null,
      previousFocus: null
    },

    // Video Player State
    player: {
      active: false,
      osdVisible: false,
      osdTimer: null,
      type: 'live', // 'live' | 'movie' | 'series'
      currentItem: null,
      channelList: [],
      channelIndex: -1,
      episodeList: [],
      episodeIndex: -1,
      isPlaying: false,
      aspectMode: 'contain', // 'contain' | 'cover' | 'fill'
      hls: null,
      usingNativeExo: false,
      nativeProgressInterval: null,
      previousFocus: null
    }
  };

  // DOM Elements cache
  const dom = {
    ambientImage: document.getElementById('ambient-image'),
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

    // Live TV
    liveCatCount: document.getElementById('live-cat-count'),
    liveCategoriesList: document.getElementById('live-categories-list'),
    liveCurrentCatTitle: document.getElementById('live-current-cat-title'),
    liveCurrentCatSub: document.getElementById('live-current-cat-sub'),
    liveFilterInput: document.getElementById('live-filter-input'),
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
    detailsBackdrop: document.getElementById('details-backdrop'),
    detailsPoster: document.getElementById('details-poster'),
    detailsBadgeType: document.getElementById('details-badge-type'),
    detailsBadgeYear: document.getElementById('details-badge-year'),
    detailsBadgeRating: document.getElementById('details-badge-rating'),
    detailsTitle: document.getElementById('details-title'),
    detailsMeta: document.getElementById('details-meta'),
    detailsPlot: document.getElementById('details-plot'),
    btnDetailsPlay: document.getElementById('btn-details-play'),
    btnDetailsFav: document.getElementById('btn-details-fav'),
    btnDetailsClose: document.getElementById('btn-details-close'),
    seriesEpisodesSection: document.getElementById('series-episodes-section'),
    seasonSelector: document.getElementById('season-selector'),
    episodesList: document.getElementById('episodes-list'),

    // Video Player Overlay & OSD
    playerOverlay: document.getElementById('player-overlay'),
    videoElement: document.getElementById('video-element'),
    playerSpinner: document.getElementById('player-Spinner'),
    playerLoadingText: document.getElementById('player-loading-text'),
    playerErrorBox: document.getElementById('player-error-box'),
    playerErrorTitle: document.getElementById('player-error-title'),
    playerErrorDesc: document.getElementById('player-error-desc'),
    btnPlayerRetry: document.getElementById('btn-player-retry'),
    btnPlayerExitErr: document.getElementById('btn-player-exit-err'),

    playerOsd: document.getElementById('player-osd'),
    osdLiveBadge: document.getElementById('osd-live-badge'),
    osdCategoryPill: document.getElementById('osd-category-pill'),
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
    osdPlayPauseLabel: document.getElementById('osd-playpause-label'),
    btnOsdFf: document.getElementById('btn-osd-ff'),
    btnOsdNextCh: document.getElementById('btn-osd-next-ch'),
    btnOsdNextEp: document.getElementById('btn-osd-next-ep'),
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
      // Format 1: /playlist/{user}/{pass}/...
      const pathMatch = u.pathname.match(/\/playlist\/([^\/]+)\/([^\/]+)/i);
      if (pathMatch) {
        return {
          server,
          username: decodeURIComponent(pathMatch[1]),
          password: decodeURIComponent(pathMatch[2])
        };
      }
      // Format 2: /get.php?username=...&password=...
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

  function setAmbientBackdrop(imgUrl) {
    if (!imgUrl) return;
    dom.ambientImage.style.backgroundImage = `url("${imgUrl}")`;
  }

  /* ========================================================================
     NETWORK LAYER (Supports Node Proxy, Direct CORS, and Android APK Bridge)
     ======================================================================== */
  const isLocalServer = window.location.protocol.startsWith('http') && !window.AndroidBridge;

  async function fetchXtreamJson(actionParams = '', noCache = false) {
    const { server, username, password } = state.session;
    const baseApi = `${server}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}${actionParams ? '&' + actionParams : ''}`;

    // 1. If running in Native Android APK with AndroidBridge.httpGet
    if (window.AndroidBridge && typeof window.AndroidBridge.httpGet === 'function') {
      const raw = window.AndroidBridge.httpGet(baseApi);
      if (raw && !raw.startsWith('__ERROR__:')) {
        return JSON.parse(raw);
      }
    }

    // 2. If running on our Node.js server, use cached /api/xtream proxy first
    if (isLocalServer) {
      const proxyUrl = `/api/xtream?url=${encodeURIComponent(baseApi)}${noCache ? '&nocache=1' : ''}`;
      const res = await fetch(proxyUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    }

    // 3. Direct fetch when CORS is enabled on the IPTV server
    const res = await fetch(baseApi);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  }

  async function resolveStreamRedirect(rawStreamUrl) {
    // 1. Native Android APK bridge
    if (window.AndroidBridge && typeof window.AndroidBridge.resolveUrl === 'function') {
      try {
        const resolved = window.AndroidBridge.resolveUrl(rawStreamUrl);
        if (resolved && resolved.startsWith('http')) return resolved;
      } catch (_) {}
    }

    // 2. Local Node server /api/resolve
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
     1. LOGIN FLOW (3 Modes from PDF)
     ======================================================================== */
  function setupLoginEvents() {
    // Switch Login Tabs
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

    // Core Host Preset Pills
    document.querySelectorAll('[data-core-host]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.coreHost = btn.dataset.coreHost;
        document.querySelectorAll('[data-core-host]').forEach(b => b.classList.toggle('active', b === btn));
      });
    });

    // M3U Preset Pills
    document.querySelectorAll('[data-m3u-preset]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.getElementById('m3u-url').value = btn.dataset.m3uPreset;
        document.querySelectorAll('[data-m3u-preset]').forEach(b => b.classList.toggle('active', b === btn));
      });
    });

    // Submit Login
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
        const server = normalizeServerUrl(coreSrvInput ? coreSrvInput.value : state.coreHost);
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

      // Switch to App Screen
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
      dom.btnLoginText.textContent = 'Entrar agora';
    }
  }

  async function loadCustomM3uPlaylist(m3uUrl) {
    const res = await fetch(`/api/parse-m3u?url=${encodeURIComponent(m3uUrl)}`);
    if (!res.ok) throw new Error('Falha ao ler a lista M3U informada.');
    const data = await res.json();
    state.liveCategories = data.categories || [];
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
     2. INITIALIZE CATALOG (Ultra-Light Category Loading)
     ======================================================================== */
  async function initializeCatalog() {
    // Load the 3 category lists in parallel (tiny payload, ~10KB total)
    const [liveCats, vodCats, seriesCats] = await Promise.all([
      fetchXtreamJson('action=get_live_categories').catch(() => []),
      fetchXtreamJson('action=get_vod_categories').catch(() => []),
      fetchXtreamJson('action=get_series_categories').catch(() => [])
    ]);

    state.liveCategories = Array.isArray(liveCats) ? liveCats : [];
    state.vodCategories = Array.isArray(vodCats) ? vodCats : [];
    state.seriesCategories = Array.isArray(seriesCats) ? seriesCats : [];

    dom.liveCatCount.textContent = state.liveCategories.length;
    dom.moviesCatCount.textContent = state.vodCategories.length;
    dom.seriesCatCount.textContent = state.seriesCategories.length;

    renderCategorySidebar('live', state.liveCategories);
    renderCategorySidebar('movies', state.vodCategories);
    renderCategorySidebar('series', state.seriesCategories);

    // Pick smart initial categories (avoid "Suporte" as first live category if sports/globo exists)
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
      dom.liveCurrentCatSub.textContent = `${state.currentLiveList.length} canais disponíveis • Aperte OK para assistir`;
      renderLiveChannels();
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
     3. RENDERING CARDS (Channels, Movies, Series, Home Shelves)
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
    liveDot.textContent = '● AO VIVO';
    numRow.appendChild(numSpan);
    numRow.appendChild(liveDot);

    const nameEl = document.createElement('div');
    nameEl.className = 'channel-name';
    nameEl.textContent = channel.name || 'Canal';

    meta.appendChild(numRow);
    meta.appendChild(nameEl);

    btn.appendChild(logoBox);
    btn.appendChild(meta);

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
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'poster-card';
    btn.dataset.focusable = 'true';

    const thumbWrap = document.createElement('div');
    thumbWrap.className = 'poster-thumb-wrap';

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

    // Hero Banner Item
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
        setAmbientBackdrop(cover);
      }
      dom.heroBadgeType.textContent = state.heroItem.type === 'movie' ? 'KS TV-Stream • Filme em Alta' : 'KS TV-Stream • Destaque';
      dom.heroBadgeMeta.textContent = heroCandidate.year ? `${heroCandidate.year} • 4K HDR` : 'Alta Definição';
      dom.heroTitle.textContent = heroCandidate.name || heroCandidate.title || 'Destaque Core Play';
      dom.heroDesc.textContent =
        heroCandidate.plot ||
        'Assista agora com reprodução limpa em tela cheia. No player, pressione VOLTAR uma vez para ocultar os controles.';
    }

    // Build Horizontal Shelves
    dom.homeRows.innerHTML = '';

    // 1. Continue Watching / Recent
    if (state.recent.length > 0) {
      appendHomeShelf('Continuar Assistindo', state.recent.slice(0, 12), 'mixed');
    }

    // 2. Featured Live Channels
    if (channels.length > 0) {
      appendHomeShelf('TV ao Vivo — Destaques de Hoje', channels.slice(0, 16), 'live');
    }

    // 3. Popular Movies
    if (movies.length > 0) {
      appendHomeShelf('Filmes Mais Assistidos', movies.slice(0, 18), 'movie');
    }

    // 4. Popular Series
    if (series.length > 0) {
      appendHomeShelf('Séries em Alta', series.slice(0, 18), 'series');
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

      // Fetch rich VOD info
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
     5. CLEAR VIDEO PLAYER ENGINE (Live TV, Movies, Series)
     - Supports both Native Android ExoPlayer (in APK) and HTML5/HLS.js (Web)
     - Strict Back Button Rule:
       * 1st Back press when OSD is visible -> Hides OSD (leaves video 100% CLEAR)
       * 2nd Back press when OSD is hidden -> Exits video player
     ======================================================================== */
  async function startPlayback({ type, item, channelList = [], channelIndex = -1, episodeList = [], episodeIndex = -1, triggerElement = null }) {
    if (triggerElement) {
      state.player.previousFocus = triggerElement;
    }

    // Save to Recent / Continue Watching
    addToRecent(item, type);

    const isLive = type === 'live';
    const titleText = item.name || item.title || 'Reproduzindo';
    const subtitleText = isLive
      ? `Canal ${item.num || (channelIndex + 1)} • Ao Vivo`
      : item.year ? `${item.year} • Cinema` : 'Reprodução Limpa';

    const rawUrl = buildStreamUrl(item, type);

    // 1. NATIVE FIRE TV STICK 4K PLAYER (100% Native SurfaceView + Native Apple TV OSD)
    if (window.AndroidBridge && typeof window.AndroidBridge.openNativePlayer === 'function') {
      state.player.active = false;
      state.player.currentItem = item;
      state.player.type = type;
      state.player.channelList = channelList;
      state.player.channelIndex = channelIndex;
      state.player.episodeList = episodeList;
      state.player.episodeIndex = episodeIndex;
      window.AndroidBridge.openNativePlayer(rawUrl, titleText, subtitleText, isLive);
      return;
    }

    state.player.active = true;
    state.player.type = type;
    state.player.currentItem = item;
    state.player.channelList = channelList;
    state.player.channelIndex = channelIndex;
    state.player.episodeList = episodeList;
    state.player.episodeIndex = episodeIndex;

    // Show overlay & spinner
    dom.playerOverlay.classList.remove('hidden');
    dom.playerErrorBox.classList.add('hidden');
    dom.playerSpinner.classList.remove('hidden');
    dom.playerLoadingText.textContent = 'Conectando ao sinal...';

    // Update OSD metadata
    dom.osdLiveBadge.classList.toggle('hidden', !isLive);
    dom.osdCategoryPill.textContent =
      isLive ? 'TV ao Vivo' : type === 'movie' ? 'Filme • Cinema' : 'Série';

    const logoUrl = item.stream_icon || item.cover || '';
    if (logoUrl) {
      dom.osdLogo.src = logoUrl;
      dom.osdLogo.classList.remove('hidden');
    } else {
      dom.osdLogo.classList.add('hidden');
    }

    dom.osdTitle.textContent = titleText;
    dom.osdSubtitle.textContent = subtitleText;

    // Toggle Live vs VOD controls in OSD
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

    updateOsdFavButton();

    // Show OSD briefly at start, then auto-hide to leave screen 100% CLEAR
    showPlayerOsd(true);
    pushBackState('player');

    // Stop any previous stream
    stopMediaEngines();

    const finalUrl = await resolveStreamRedirect(rawUrl);

    // Check if running inside our Fire TV Native APK with Hardware ExoPlayer Bridge
    if (window.AndroidBridge && typeof window.AndroidBridge.playStream === 'function') {
      state.player.usingNativeExo = true;
      document.body.classList.add('native-video-active');
      window.AndroidBridge.playStream(finalUrl, rawUrl, isLive);
      state.player.isPlaying = true;
      updatePlayPauseLabel(true);
      startNativeProgressPoller();
      return;
    }

    // Web App Playback (HTML5 Video + HLS.js)
    state.player.usingNativeExo = false;
    document.body.classList.remove('native-video-active');
    const video = dom.videoElement;

    if (isLive && window.Hls && window.Hls.isSupported()) {
      const hls = new window.Hls({
        enableWorker: true,
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
  }

  function stopMediaEngines() {
    if (state.player.nativeProgressInterval) {
      clearInterval(state.player.nativeProgressInterval);
      state.player.nativeProgressInterval = null;
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
    video.removeAttribute('src');
    video.load();
  }

  function showPlayerOsd(focusPrimary = false) {
    if (!state.player.active) return;
    state.player.osdVisible = true;
    dom.playerOsd.classList.remove('osd-hidden');

    if (focusPrimary) {
      setTvFocus(dom.btnOsdPlayPause);
    }

    resetOsdAutoHideTimer();
  }

  function hidePlayerOsd() {
    state.player.osdVisible = false;
    dom.playerOsd.classList.add('osd-hidden');
    if (state.player.osdTimer) {
      clearTimeout(state.player.osdTimer);
      state.player.osdTimer = null;
    }
  }

  function resetOsdAutoHideTimer() {
    if (state.player.osdTimer) {
      clearTimeout(state.player.osdTimer);
    }
    state.player.osdTimer = setTimeout(() => {
      if (state.player.active && state.player.isPlaying) {
        hidePlayerOsd();
      }
    }, OSD_AUTOHIDE_MS);
  }

  function closePlayer() {
    if (!state.player.active) return;
    hidePlayerOsd();
    stopMediaEngines();
    state.player.active = false;
    state.player.usingNativeExo = false;
    document.body.classList.remove('native-video-active');
    dom.playerOverlay.classList.add('hidden');
    dom.playerSpinner.classList.add('hidden');
    dom.playerErrorBox.classList.add('hidden');

    if (state.player.previousFocus && document.body.contains(state.player.previousFocus)) {
      setTvFocus(state.player.previousFocus);
    }
  }

  function togglePlayPause() {
    if (!state.player.active) return;
    if (state.player.usingNativeExo && window.AndroidBridge) {
      const playing = window.AndroidBridge.togglePlayPause();
      state.player.isPlaying = Boolean(playing);
      updatePlayPauseLabel(state.player.isPlaying);
      resetOsdAutoHideTimer();
      return;
    }
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
    if (state.player.usingNativeExo && window.AndroidBridge) {
      window.AndroidBridge.seekByMs(deltaSeconds * 1000);
      resetOsdAutoHideTimer();
      return;
    }
    const v = dom.videoElement;
    if (Number.isFinite(v. duration)) {
      v.currentTime = Math.max(0, Math.min(v.duration, v.currentTime + deltaSeconds));
    }
    resetOsdAutoHideTimer();
  }

  function stepChannel(delta) {
    if (!state.player.active || state.player.type !== 'live') return;
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
    if (!state.player.active || state.player.type !== 'series') return;
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
      contain: '⛶ Tela: Padrão',
      cover: '⛶ Tela: Zoom',
      fill: '⛶ Tela: Esticar'
    };
    const next = modes[(modes.indexOf(state.player.aspectMode) + 1) % modes.length];
    state.player.aspectMode = next;
    dom.osdAspectLabel.textContent = labels[next];

    dom.videoElement.classList.remove('aspect-cover', 'aspect-fill');
    if (next === 'cover') dom.videoElement.classList.add('aspect-cover');
    if (next === 'fill') dom.videoElement.classList.add('aspect-fill');

    if (state.player.usingNativeExo && window.AndroidBridge && typeof window.AndroidBridge.setAspectMode === 'function') {
      window.AndroidBridge.setAspectMode(next);
    }
    resetOsdAutoHideTimer();
  }

  function updatePlayPauseLabel(isPlaying) {
    dom.osdPlayPauseLabel.textContent = isPlaying ? '⏸ Pausar' : '▶ Reproduzir';
  }

  function showPlayerError(msg) {
    dom.playerSpinner.classList.add('hidden');
    dom.playerErrorDesc.textContent = msg;
    dom.playerErrorBox.classList.remove('hidden');
    setTvFocus(dom.btnPlayerRetry);
  }

  function setupVideoElementEvents() {
    const v = dom.videoElement;

    v.addEventListener('playing', () => {
      state.player.isPlaying = true;
      dom.playerSpinner.classList.add('hidden');
      dom.playerErrorBox.classList.add('hidden');
      updatePlayPauseLabel(true);
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
      if (!state.player.active || state.player.usingNativeExo) return;
      showPlayerError('Não foi possível abrir este stream no momento.');
    });

    // Click on progress bar to seek
    dom.osdProgressWrap.addEventListener('click', (e) => {
      if (state.player.type === 'live') return;
      const rect = dom.osdProgressWrap.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      if (state.player.usingNativeExo && window.AndroidBridge) {
        window.AndroidBridge.seekToPercent(ratio);
      } else if (Number.isFinite(v.duration)) {
        v.currentTime = ratio * v.duration;
      }
      resetOsdAutoHideTimer();
    });

    // OSD Control Button Listeners
    dom.btnOsdPlayPause.addEventListener('click', togglePlayPause);
    dom.btnOsdPrevCh.addEventListener('click', () => stepChannel(-1));
    dom.btnOsdNextCh.addEventListener('click', () => stepChannel(1));
    dom.btnOsdRw.addEventListener('click', () => seekRelative(-10));
    dom.btnOsdFf.addEventListener('click', () => seekRelative(10));
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

    // Clicking or moving mouse on clear video brings up OSD
    dom.playerOverlay.addEventListener('mousemove', () => {
      if (state.player.active && !state.player.osdVisible) {
        showPlayerOsd(false);
      } else if (state.player.active) {
        resetOsdAutoHideTimer();
      }
    });

    dom.videoElement.addEventListener('click', () => {
      if (!state.player.osdVisible) {
        showPlayerOsd(true);
      } else {
        hidePlayerOsd();
      }
    });
  }

  function startNativeProgressPoller() {
    if (state.player.nativeProgressInterval) clearInterval(state.player.nativeProgressInterval);
    state.player.nativeProgressInterval = setInterval(() => {
      if (!state.player.active || !state.player.usingNativeExo || !window.AndroidBridge) return;
      try {
        const statusJson = window.AndroidBridge.getPlayerStatus();
        if (!statusJson) return;
        const st = JSON.parse(statusJson);
        if (st.ready) {
          dom.playerSpinner.classList.add('hidden');
          state.player.isPlaying = Boolean(st.playing);
          updatePlayPauseLabel(state.player.isPlaying);
        }
        if (st.error) {
          showPlayerError(st.error);
        }
        if (state.player.type !== 'live' && st.durationMs > 0) {
          const curSec = st.positionMs / 1000;
          const durSec = st.durationMs / 1000;
          dom.osdTimeCurrent.textContent = formatTime(curSec);
          dom.osdTimeTotal.textContent = formatTime(durSec);
          dom.osdProgressFill.style.width = `${Math.min(100, (curSec / durSec) * 100)}%`;
        }
      } catch (_) {}
    }, 500);
  }

  // Callback invoked from Native Android ExoPlayer when first frame renders
  window.onNativePlayerReady = function () {
    dom.playerSpinner.classList.add('hidden');
    dom.playerErrorBox.classList.add('hidden');
  };

  window.onNativePlayerError = function (msg) {
    showPlayerError(msg || 'Falha ao reproduzir stream.');
  };

  window.onNativeStepChannel = function (delta) {
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
  };

  window.onNativeNextEpisode = function () {
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
    dom.btnDetailsFav.textContent = fav ? '★ Nos Favoritos' : '☆ Favoritar';
  }

  function updateOsdFavButton() {
    if (!state.player.currentItem) return;
    const fav = isFavorite(state.player.currentItem, state.player.type);
    dom.osdFavLabel.textContent = fav ? '★ Favorito' : '☆ Favoritar';
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
     7. BACK BUTTON & D-PAD REMOTE CONTROL ENGINE (FIRE TV STICK 4K)
     ======================================================================== */
  function pushBackState(tag) {
    try {
      window.history.pushState({ tvLayer: tag, t: Date.now() }, '');
    } catch (_) {}
  }

  /**
   * Central handler for Fire TV Remote BACK button, Keyboard ESC/Backspace, and Android Bridge.
   * Returns true if consumed.
   */
  function handleBackAction() {
    // 1. If Video Player is open:
    if (state.player.active) {
      if (state.player.osdVisible) {
        // REQUIREMENT: When pressing Back while player options are on screen,
        // ONLY hide the player options (leave video playing 100% CLEAR)!
        hidePlayerOsd();
        pushBackState('player-clear');
        return true;
      } else {
        // Screen is already clear -> pressing Back exits the video player
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
      const activeEl = document.activeElement;
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

  // Expose to Android Native APK MainActivity.onKeyDown(KEYCODE_BACK)
  window.handleFireTvBack = handleBackAction;

  // Expose direct D-Pad & Media key handler for Fire TV Stick 4K Native APK
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
        seekRelative(10);
        return 'CONSUMED';
      }
      if (keyName === 'MediaRewind') {
        seekRelative(-10);
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
        const focused = document.querySelector('.tv-focused') || document.activeElement;
        if (focused) focused.click();
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

  function setTvFocus(el) {
    if (!el) return;
    document.querySelectorAll('.tv-focused').forEach(node => node.classList.remove('tv-focused'));
    el.classList.add('tv-focused');
    el.focus({ preventScroll: false });
    try {
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    } catch (_) {}
  }

  function getVisibleFocusables() {
    // Restrict focus scope to active overlay/modal/screen so D-Pad never escapes behind modals
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
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
  }

  function moveSpatialFocus(direction) {
    const focusables = getVisibleFocusables();
    if (focusables.length === 0) return;

    const current = document.querySelector('.tv-focused') || document.activeElement;
    if (!current || !focusables.includes(current)) {
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

      // Weight orthogonal distance higher so focus stays in the same row/column naturally
      const score = primaryDist + orthoDist * 2.65;
      if (score < bestScore) {
        bestScore = score;
        bestCandidate = cand;
      }
    }

    if (bestCandidate) {
      setTvFocus(bestCandidate);
    }
  }

  function setupKeyboardAndRemoteNavigation() {
    window.addEventListener('keydown', (e) => {
      const key = e.key;
      const keyCode = e.keyCode || e.which;
      const activeEl = document.activeElement;
      const isTextInput = activeEl && activeEl.tagName === 'INPUT';

      // Detect Back button on Fire TV Remote / Browser / Keyboard
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

      // If Video Player is active:
      if (state.player.active) {
        // Media keys on Fire TV Remote
        if (key === 'MediaPlayPause' || keyCode === 179) {
          e.preventDefault();
          togglePlayPause();
          return;
        }
        if (key === 'MediaFastForward' || keyCode === 228) {
          e.preventDefault();
          seekRelative(10);
          return;
        }
        if (key === 'MediaRewind' || keyCode === 227) {
          e.preventDefault();
          seekRelative(-10);
          return;
        }

        // If OSD is currently hidden (screen is CLEAR):
        if (!state.player.osdVisible) {
          if (['Enter', ' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)) {
            e.preventDefault();
            showPlayerOsd(true);
            return;
          }
        } else {
          // OSD is visible -> reset auto-hide timer on any key press
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

      // Spatial D-Pad Navigation across UI
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)) {
        // Allow left/right cursor movement inside text inputs only when typing
        if (isTextInput && (key === 'ArrowLeft' || key === 'ArrowRight')) {
          return;
        }
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
    // Top Navigation Bar
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', () => {
        switchSection(btn.dataset.section);
      });
    });

    // Hero Buttons
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

    // Category Search Filters
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

    // Load More Pagination Buttons
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

    // Details Modal Buttons
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

    // Global Search
    dom.btnGlobalSearch.addEventListener('click', executeGlobalSearch);
    dom.globalSearchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') executeGlobalSearch();
    });

    // Account Actions
    dom.btnRefreshCache.addEventListener('click', async () => {
      state.liveByCat.clear();
      state.vodByCat.clear();
      state.seriesByCat.clear();
      state.vodInfoCache.clear();
      state.seriesInfoCache.clear();
      await initializeCatalog();
      switchSection('home');
    });

    dom.btnSwitchLogin.addEventListener('click', () => {
      localStorage.removeItem(STORAGE_KEYS.SESSION);
      dom.appScreen.classList.remove('active');
      dom.loginScreen.classList.add('active');
      setTvFocus(dom.btnLoginSubmit);
    });
  }

  function init() {
    updateClock();
    setInterval(updateClock, 15000);

    setupLoginEvents();
    setupAppEvents();
    setupVideoElementEvents();
    setupKeyboardAndRemoteNavigation();

    // Focus the primary login button right away so 1 press of OK on Fire TV remote logs in!
    setTvFocus(dom.btnLoginSubmit);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
