/**
 * StreamTV Live - Premium IPTV Web Engine
 * Core application controller.
 */

(function () {
  'use strict';

  // Application State
  const state = {
    config: null,
    channels: [],
    categories: new Set(),
    activeGroup: 'ALL',
    searchQuery: '',
    favorites: [],
    recents: [],
    currentChannel: null,
    currentChannelIndex: -1,
    hlsPlayer: null,
    mpegtsPlayer: null,
    recoveryAttempts: 0,
    maxRecoveryAttempts: 3,
    recoveryTimer: null,
    aspectRatios: ['normal', 'aspect-fill', 'aspect-zoom', 'aspect-16-9'],
    currentAspectIndex: 0,
    volume: 0.8,
    isMuted: false,
    controlsTimeout: null,
    proxyUrl: ''
  };

  // DOM Elements cache
  const dom = {
    video: document.getElementById('mainVideoPlayer'),
    playerContainer: document.getElementById('playerContainer'),
    loadingSpinner: document.getElementById('playerLoadingSpinner'),
    loadingText: document.getElementById('playerLoadingText'),
    errorOverlay: document.getElementById('playerErrorOverlay'),
    errorMessage: document.getElementById('playerErrorMessage'),
    errorRetryBtn: document.getElementById('errorRetryBtn'),
    errorProxyBtn: document.getElementById('errorProxyBtn'),
    unmuteBanner: document.getElementById('autoplayUnmuteBanner'),
    bannerUnmuteBtn: document.getElementById('bannerUnmuteBtn'),
    
    // Custom controls
    customControls: document.getElementById('customControls'),
    progressBarContainer: document.getElementById('progressBarContainer'),
    progressBuffer: document.getElementById('progressBuffer'),
    progressFilled: document.getElementById('progressFilled'),
    playBtn: document.getElementById('controlPlayBtn'),
    playIcon: document.getElementById('playIcon'),
    pauseIcon: document.getElementById('pauseIcon'),
    prevBtn: document.getElementById('controlPrevBtn'),
    nextBtn: document.getElementById('controlNextBtn'),
    timeCurrent: document.getElementById('timeCurrent'),
    timeTotal: document.getElementById('timeTotal'),
    channelName: document.getElementById('playerChannelName'),
    channelFormat: document.getElementById('playerChannelFormat'),
    muteBtn: document.getElementById('controlMuteBtn'),
    volumeHighIcon: document.getElementById('volumeHighIcon'),
    volumeMutedIcon: document.getElementById('volumeMutedIcon'),
    volumeSlider: document.getElementById('volumeSlider'),
    aspectBtn: document.getElementById('controlAspectBtn'),
    pipBtn: document.getElementById('controlPipBtn'),
    fullscreenBtn: document.getElementById('controlFullscreenBtn'),
    fullscreenEnterIcon: document.getElementById('fullscreenEnterIcon'),
    fullscreenExitIcon: document.getElementById('fullscreenExitIcon'),
    
    // Metadata card
    activeChannelLogo: document.getElementById('activeChannelLogo'),
    activeChannelName: document.getElementById('activeChannelName'),
    activeChannelGroup: document.getElementById('activeChannelGroup'),
    favoriteToggleBtn: document.getElementById('favoriteToggleBtn'),
    
    // Sidebar & list
    categoryList: document.getElementById('categoryList'),
    mobileCategorySelect: document.getElementById('mobileCategorySelect'),
    categoryCount: document.getElementById('categoriesTotalCount'),
    activeCategoryTitle: document.getElementById('activeCategoryTitle'),
    activeCategoryCount: document.getElementById('activeCategoryCount'),
    channelGrid: document.getElementById('channelGrid'),
    desktopSearchInput: document.getElementById('desktopSearchInput'),
    mobileSearchInput: document.getElementById('mobileSearchInput'),
    clockDisplay: document.getElementById('clockDisplay'),
    
    // Sidebar badges
    badgeAll: document.getElementById('badgeAll'),
    badgeFav: document.getElementById('badgeFav'),
    badgeRec: document.getElementById('badgeRec'),
    
    // Modals
    settingsModal: document.getElementById('settingsModal'),
    shortcutsModal: document.getElementById('shortcutsModal'),
    settingsBtn: document.getElementById('settingsBtn'),
    shortcutsBtn: document.getElementById('shortcutsBtn'),
    closeSettingsBtn: document.getElementById('closeSettingsBtn'),
    closeShortcutsBtn: document.getElementById('closeShortcutsBtn'),
    
    // Settings forms
    playlistUrlInput: document.getElementById('playlistUrlInput'),
    loadPlaylistBtn: document.getElementById('loadPlaylistBtn'),
    proxyUrlInput: document.getElementById('proxyUrlInput'),
    loadProxyBtn: document.getElementById('loadProxyBtn'),
    resetPlaylistBtn: document.getElementById('resetPlaylistBtn'),
    clearAppCacheBtn: document.getElementById('clearAppCacheBtn'),
    
    // Diagnostics
    diagHttps: document.getElementById('diagHttps'),
    diagHls: document.getElementById('diagHls'),
    diagTs: document.getElementById('diagTs'),
    diagChCount: document.getElementById('diagChCount'),
    
    // Toast
    toast: document.getElementById('toastNotification'),
    toastMessage: document.getElementById('toastMessage')
  };

  // Base64 helper for decoding playlist source
  function decodeBase64(str) {
    try {
      return atob(str);
    } catch (e) {
      console.error('Base64 decode failed', e);
      return str;
    }
  }

  // Toast notifier
  function showToast(message) {
    dom.toastMessage.textContent = message;
    dom.toast.classList.remove('hidden');
    setTimeout(() => {
      dom.toast.classList.add('hidden');
    }, 3000);
  }

  // Initializing App
  async function init() {
    registerServiceWorker();
    startClock();
    setupEventListeners();
    checkDiagnostics();
    
    // Load local storage states
    loadSavedState();

    try {
      // Load configuration file
      const response = await fetch('./config.json');
      state.config = await response.json();
      
      // Determine M3U playlist URL
      let playlistUrl = localStorage.getItem('streamtv_playlist_url');
      if (!playlistUrl) {
        playlistUrl = decodeBase64(state.config.playlist);
      }
      dom.playlistUrlInput.value = playlistUrl;

      // Load custom proxy if available
      state.proxyUrl = localStorage.getItem('streamtv_proxy_url') || state.config.defaultProxy || '';
      dom.proxyUrlInput.value = state.proxyUrl;

      await loadPlaylist(playlistUrl);
    } catch (err) {
      console.error('App init failed', err);
      showPlaceholderGrid('Failed to load application configuration. Tap Settings to set a playlist manually.');
    }
  }

  // Clock Update
  function startClock() {
    setInterval(() => {
      const now = new Date();
      dom.clockDisplay.textContent = now.toTimeString().split(' ')[0];
    }, 1000);
  }

  // Diagnostics check
  function checkDiagnostics() {
    dom.diagHttps.textContent = window.location.protocol === 'https:' ? 'Yes (HTTPS)' : 'No (HTTP)';
    dom.diagHls.textContent = Hls.isSupported() ? 'Supported' : 'Fallback Native';
    dom.diagTs.textContent = mpegts.getFeatureList().mseLivePlayback ? 'Supported' : 'Unsupported';
  }

  // Register PWA Service Worker
  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
          .then(reg => console.log('[Service Worker] Registered successfully', reg.scope))
          .catch(err => console.error('[Service Worker] Registration failed', err));
      });
    }
  }

  // Load state from Local Storage
  function loadSavedState() {
    try {
      state.favorites = JSON.parse(localStorage.getItem('streamtv_favorites')) || [];
      state.recents = JSON.parse(localStorage.getItem('streamtv_recents')) || [];
      state.volume = parseFloat(localStorage.getItem('streamtv_volume')) ?? 0.8;
      state.isMuted = localStorage.getItem('streamtv_muted') === 'true';

      dom.volumeSlider.value = state.volume;
      dom.video.volume = state.volume;
      dom.video.muted = state.isMuted;
      updateVolumeUI();
    } catch (e) {
      console.warn('Failed to parse storage state', e);
    }
  }

  // Parse M3U playlist string into structured channels array
  function parseM3U(m3uString) {
    const channels = [];
    const lines = m3uString.split('\n');
    let currentMetadata = null;

    const extinfRegex = /#EXTINF:(?:-?\d+)\s*(.*)/;
    const logoRegex = /tvg-logo="([^"]+)"/;
    const groupRegex = /group-title="([^"]+)"/;
    const nameRegex = /tvg-name="([^"]+)"/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (!line) continue;

      if (line.startsWith('#EXTINF:')) {
        currentMetadata = {
          name: '',
          logo: '',
          group: 'General',
          url: '',
          format: 'hls'
        };

        // Parse Name (Everything after the last comma)
        const commaIndex = line.lastIndexOf(',');
        if (commaIndex !== -1) {
          currentMetadata.name = line.substring(commaIndex + 1).trim();
        }

        // Parse Group Title
        const groupMatch = line.match(groupRegex);
        if (groupMatch && groupMatch[1]) {
          currentMetadata.group = groupMatch[1].trim();
        }

        // Parse Logo URL
        const logoMatch = line.match(logoRegex);
        if (logoMatch && logoMatch[1]) {
          currentMetadata.logo = logoMatch[1].trim();
        }

        // Parse tvg-name fallback if name is empty
        if (!currentMetadata.name) {
          const nameMatch = line.match(nameRegex);
          if (nameMatch && nameMatch[1]) {
            currentMetadata.name = nameMatch[1].trim();
          } else {
            currentMetadata.name = 'Unnamed Channel';
          }
        }
      } else if (line.startsWith('http') || line.startsWith('/') || line.startsWith('./')) {
        if (currentMetadata) {
          currentMetadata.url = line;
          
          // Determine format
          const lowercaseUrl = line.toLowerCase();
          if (lowercaseUrl.includes('.ts') || lowercaseUrl.includes('/ts') || lowercaseUrl.includes('mpegts')) {
            currentMetadata.format = 'mpegts';
          } else if (lowercaseUrl.includes('.mp4') || lowercaseUrl.includes('.mkv') || lowercaseUrl.includes('.mov')) {
            currentMetadata.format = 'mp4';
          } else {
            currentMetadata.format = 'hls'; // Default fallback
          }

          channels.push(currentMetadata);
          currentMetadata = null;
        }
      }
    }

    return channels;
  }

  // Load and fetch M3U playlist from source
  async function loadPlaylist(url) {
    showPlaceholderGrid('Fetching IPTV playlist channels...');
    
    // Check if we are loading the default playlist
    const isDefaultPlaylist = url === decodeBase64(state.config.playlist) || !url;
    let dataLoaded = false;

    try {
      if (isDefaultPlaylist) {
        try {
          const apiResponse = await fetch('/api/channels?proxyStreams=true');
          if (apiResponse.ok) {
            const result = await apiResponse.json();
            if (result.success && result.channels && result.channels.length > 0) {
              state.channels = result.channels;
              // Set the default proxyUrl to the local proxy API so it handles custom loaded HTTP streams
              state.proxyUrl = window.location.origin + '/api/proxy?stream=';
              dom.proxyUrlInput.value = state.proxyUrl;
              dataLoaded = true;
              console.log('Successfully loaded playlist channels via Serverless API');
            }
          }
        } catch (apiErr) {
          console.warn('Serverless API endpoint not available. Falling back to direct client-side parsing.', apiErr);
        }
      }

      if (!dataLoaded) {
        // Fallback to fetching raw M3U and parsing client-side
        let fetchUrl = url;
        if (state.proxyUrl && url.startsWith('http') && !url.includes(window.location.hostname)) {
          fetchUrl = state.proxyUrl + encodeURIComponent(url);
        }

        const response = await fetch(fetchUrl);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const content = await response.text();
        state.channels = parseM3U(content);
      }
      
      if (state.channels.length === 0) {
        throw new Error('No valid channels found in the playlist.');
      }

      // Collect categories
      state.categories.clear();
      state.channels.forEach(ch => {
        if (ch.group) state.categories.add(ch.group);
      });

      dom.diagChCount.textContent = state.channels.length;
      renderCategories();
      filterAndRenderChannels();

      // Check if we can continue watching last played channel
      const lastPlayedUrl = localStorage.getItem('streamtv_last_channel_url');
      if (lastPlayedUrl) {
        const matchingChannel = state.channels.find(ch => ch.url === lastPlayedUrl);
        if (matchingChannel) {
          playChannel(matchingChannel);
          return;
        }
      }

      // Otherwise auto-play first channel
      if (state.channels.length > 0) {
        playChannel(state.channels[0]);
      }

    } catch (err) {
      console.error('Playlist load failed', err);
      showPlaceholderGrid(`Failed to load playlist: ${err.message}. Try checking CORS settings or set a proxy URL in settings.`);
      showToast('Error loading playlist.');
    }
  }

  // Render Category sidebar items
  function renderCategories() {
    // Clear dynamic categories (keep All, Favorites, Recents)
    const staticItems = dom.categoryList.querySelectorAll('[data-group="ALL"], [data-group="FAVORITES"], [data-group="RECENTS"]');
    dom.categoryList.innerHTML = '';
    staticItems.forEach(item => dom.categoryList.appendChild(item));

    // Update static category counts
    dom.badgeAll.textContent = state.channels.length;
    dom.badgeFav.textContent = state.favorites.length;
    dom.badgeRec.textContent = state.recents.length;

    // Rerender mobile selector options
    dom.mobileCategorySelect.innerHTML = `
      <option value="ALL">All Channels (${state.channels.length})</option>
      <option value="FAVORITES">⭐ Favorites (${state.favorites.length})</option>
      <option value="RECENTS">🕐 Recently Watched (${state.recents.length})</option>
    `;

    // Sort categories alphabetically and render
    const sortedCategories = Array.from(state.categories).sort();
    
    dom.categoryCount.textContent = `${sortedCategories.length} categories`;

    sortedCategories.forEach(group => {
      const count = state.channels.filter(ch => ch.group === group).length;
      
      // Desktop List item
      const li = document.createElement('li');
      li.className = 'category-item';
      li.setAttribute('data-group', group);
      if (state.activeGroup === group) li.classList.add('active');
      li.innerHTML = `
        <span>${group}</span>
        <span class="count-badge">${count}</span>
      `;
      dom.categoryList.appendChild(li);

      // Mobile select option
      const opt = document.createElement('option');
      opt.value = group;
      opt.textContent = `${group} (${count})`;
      if (state.activeGroup === group) opt.selected = true;
      dom.mobileCategorySelect.appendChild(opt);
    });
  }

  // Filter and display channels
  function filterAndRenderChannels() {
    dom.channelGrid.innerHTML = '';

    let filtered = [];

    // Filter by group
    if (state.activeGroup === 'ALL') {
      filtered = state.channels;
    } else if (state.activeGroup === 'FAVORITES') {
      filtered = state.channels.filter(ch => state.favorites.includes(ch.url));
    } else if (state.activeGroup === 'RECENTS') {
      filtered = state.recents;
    } else {
      filtered = state.channels.filter(ch => ch.group === state.activeGroup);
    }

    // Filter by search query
    if (state.searchQuery) {
      const query = state.searchQuery.toLowerCase();
      filtered = filtered.filter(ch => 
        ch.name.toLowerCase().includes(query) || 
        ch.group.toLowerCase().includes(query)
      );
    }

    dom.activeCategoryCount.textContent = `(${filtered.length})`;

    if (filtered.length === 0) {
      dom.channelGrid.innerHTML = `
        <div class="grid-placeholder">
          <p>No channels found matching the selected category or search filter.</p>
        </div>
      `;
      return;
    }

    // Render cards (Lazy-loading channel logos)
    filtered.forEach(ch => {
      const isFav = state.favorites.includes(ch.url);
      const isActive = state.currentChannel && state.currentChannel.url === ch.url;

      const card = document.createElement('div');
      card.className = `channel-card ${isActive ? 'active' : ''}`;
      
      // Default logo SVG as fallback
      const defaultLogo = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' fill='%236366f1'><rect x='5' y='20' width='90' height='70' rx='10'/><polygon points='40,40 70,55 40,70' fill='white'/></svg>`;
      const logoSrc = ch.logo || defaultLogo;

      card.innerHTML = `
        <button class="card-fav-btn ${isFav ? 'is-fav' : ''}" title="Favorite toggle" aria-label="Favorite">
          <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
        </button>
        <div class="card-logo-container">
          <img class="card-logo" src="${logoSrc}" alt="${ch.name}" loading="lazy" onerror="this.src='${defaultLogo}'">
        </div>
        <div class="card-info">
          <h4 class="card-name">${ch.name}</h4>
          <span class="card-group">${ch.group}</span>
          <div class="card-status">
            <span class="card-status-dot"></span> LIVE
          </div>
        </div>
      `;

      // Select channel click
      card.addEventListener('click', (e) => {
        // Stop click if favorite icon triggered
        if (e.target.closest('.card-fav-btn')) {
          e.stopPropagation();
          toggleFavorite(ch);
          return;
        }
        playChannel(ch);
      });

      dom.channelGrid.appendChild(card);
    });
  }

  // Display placeholder grid with custom text
  function showPlaceholderGrid(text) {
    dom.channelGrid.innerHTML = `
      <div class="grid-placeholder">
        <div class="spinner-core"></div>
        <p>${text}</p>
      </div>
    `;
  }

  // Toggle favorite channel status
  function toggleFavorite(ch) {
    const index = state.favorites.indexOf(ch.url);
    if (index === -1) {
      state.favorites.push(ch.url);
      showToast(`${ch.name} added to Favorites`);
    } else {
      state.favorites.splice(index, 1);
      showToast(`${ch.name} removed from Favorites`);
    }

    localStorage.setItem('streamtv_favorites', JSON.stringify(state.favorites));
    
    // Refresh badges and channels
    renderCategories();
    filterAndRenderChannels();
    updateFavoriteBtnUI();
  }

  // Update Favorite Active Meta Button UI
  function updateFavoriteBtnUI() {
    if (state.currentChannel && state.favorites.includes(state.currentChannel.url)) {
      dom.favoriteToggleBtn.classList.add('is-favorite');
    } else {
      dom.favoriteToggleBtn.classList.remove('is-favorite');
    }
  }

  // Play the selected IPTV channel
  function playChannel(channel) {
    if (!channel) return;
    
    clearTimeout(state.recoveryTimer);
    state.recoveryAttempts = 0;
    
    // Save state
    state.currentChannel = channel;
    state.currentChannelIndex = state.channels.findIndex(ch => ch.url === channel.url);
    localStorage.setItem('streamtv_last_channel_url', channel.url);

    // Track recently played
    addToRecents(channel);

    // Update active highlight in grids
    const cards = dom.channelGrid.querySelectorAll('.channel-card');
    const filteredChannels = getActiveCategoryChannels();
    const activeIndex = filteredChannels.findIndex(ch => ch.url === channel.url);
    
    cards.forEach((card, idx) => {
      if (idx === activeIndex) {
        card.classList.add('active');
      } else {
        card.classList.remove('active');
      }
    });

    // Update Details Container UI
    dom.activeChannelName.textContent = channel.name;
    dom.activeChannelGroup.textContent = channel.group;
    
    const defaultLogo = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' fill='%236366f1'><rect x='5' y='20' width='90' height='70' rx='10'/><polygon points='40,40 70,55 40,70' fill='white'/></svg>`;
    dom.activeChannelLogo.src = channel.logo || defaultLogo;
    dom.activeChannelLogo.onerror = () => dom.activeChannelLogo.src = defaultLogo;

    dom.channelName.textContent = channel.name;
    dom.channelFormat.textContent = channel.format;

    updateFavoriteBtnUI();
    loadStream(channel);
  }

  // Fetch only channels in current category view
  function getActiveCategoryChannels() {
    let list = [];
    if (state.activeGroup === 'ALL') {
      list = state.channels;
    } else if (state.activeGroup === 'FAVORITES') {
      list = state.channels.filter(ch => state.favorites.includes(ch.url));
    } else if (state.activeGroup === 'RECENTS') {
      list = state.recents;
    } else {
      list = state.channels.filter(ch => ch.group === state.activeGroup);
    }
    
    if (state.searchQuery) {
      const q = state.searchQuery.toLowerCase();
      list = list.filter(ch => ch.name.toLowerCase().includes(q) || ch.group.toLowerCase().includes(q));
    }
    return list;
  }

  // Track Recents list
  function addToRecents(channel) {
    // Remove if already in list to push to top
    state.recents = state.recents.filter(ch => ch.url !== channel.url);
    state.recents.unshift(channel);
    
    // Limit to 12 recents
    if (state.recents.length > 12) {
      state.recents.pop();
    }
    
    localStorage.setItem('streamtv_recents', JSON.stringify(state.recents));
    
    // Update count badge
    dom.badgeRec.textContent = state.recents.length;
    renderCategories();
  }

  // Load stream based on format
  function loadStream(channel) {
    destroyPlayers();
    hideErrorOverlay();
    showLoading('Loading channel stream...');

    let playUrl = channel.url;

    // Resolve CORS/HTTPS Mixed-content issues using proxy gateway if enabled
    const isHttp = playUrl.startsWith('http://');
    if ((isHttp || state.proxyUrl) && playUrl.startsWith('http') && !playUrl.includes(window.location.hostname)) {
      if (state.proxyUrl) {
        // Route through proxy server
        playUrl = state.proxyUrl + encodeURIComponent(playUrl);
        console.log('Routing stream via proxy:', playUrl);
      } else if (window.location.protocol === 'https:') {
        // Block warning
        console.warn('HTTP stream on HTTPS site without proxy will likely be blocked.');
      }
    }

    if (channel.format === 'hls') {
      initHLS(playUrl);
    } else if (channel.format === 'mpegts') {
      initMpegTS(playUrl);
    } else {
      // Normal VOD/MP4
      dom.video.src = playUrl;
      dom.progressBarContainer.style.display = 'block'; // Show seeker
      dom.video.load();
    }
  }

  // Destroy HLS.js and mpegts.js players
  function destroyPlayers() {
    if (state.hlsPlayer) {
      state.hlsPlayer.destroy();
      state.hlsPlayer = null;
    }
    if (state.mpegtsPlayer) {
      state.mpegtsPlayer.unload();
      state.mpegtsPlayer.detachMediaElement();
      state.mpegtsPlayer.destroy();
      state.mpegtsPlayer = null;
    }
    dom.video.removeAttribute('src');
    dom.progressBarContainer.style.display = 'none';
  }

  // HLS stream loader
  function initHLS(url) {
    if (Hls.isSupported()) {
      state.hlsPlayer = new Hls({
        maxBufferLength: 10,
        maxMaxBufferLength: 20,
        enableWorker: true,
        lowLatencyMode: true
      });
      state.hlsPlayer.loadSource(url);
      state.hlsPlayer.attachMedia(dom.video);

      state.hlsPlayer.on(Hls.Events.MANIFEST_PARSED, () => {
        attemptAutoplay();
      });

      state.hlsPlayer.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.error('HLS Fatal Network Error, trying to recover...', data);
              attemptStreamRecovery();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.error('HLS Fatal Media Error, trying to recover...', data);
              state.hlsPlayer.recoverMediaError();
              break;
            default:
              handleStreamError('Playback failed. Incompatible stream codec or offline feed.');
              break;
          }
        }
      });
    } else if (dom.video.canPlayType('application/vnd.apple.mpegurl')) {
      // Native Safari/iOS support
      dom.video.src = url;
      dom.video.addEventListener('loadedmetadata', () => {
        attemptAutoplay();
      });
      dom.video.addEventListener('error', () => {
        attemptStreamRecovery();
      });
    } else {
      handleStreamError('Your browser does not support HLS streaming.');
    }
  }

  // MPEG-TS stream loader
  function initMpegTS(url) {
    if (mpegts.getFeatureList().mseLivePlayback) {
      state.mpegtsPlayer = mpegts.createPlayer({
        type: 'mse',
        isLive: true,
        url: url
      });
      state.mpegtsPlayer.attachMediaElement(dom.video);
      state.mpegtsPlayer.load();
      
      attemptAutoplay();

      state.mpegtsPlayer.on(mpegts.ErrorTypes.NETWORK_ERROR, () => {
        attemptStreamRecovery();
      });
      state.mpegtsPlayer.on(mpegts.ErrorTypes.MEDIA_ERROR, () => {
        attemptStreamRecovery();
      });
    } else {
      handleStreamError('MPEG-TS (.ts) streaming is not supported on this browser.');
    }
  }

  // Autoplay handler
  function attemptAutoplay() {
    hideLoading();
    dom.video.play()
      .then(() => {
        updatePlayBtnUI(true);
        dom.unmuteBanner.classList.add('hidden');
      })
      .catch(err => {
        console.warn('Autoplay blocked by browser policy. Muting to play.', err);
        // Force mute and play
        dom.video.muted = true;
        dom.video.play()
          .then(() => {
            updatePlayBtnUI(true);
            dom.unmuteBanner.classList.remove('hidden'); // Show banner alert to turn on sound
          })
          .catch(e => {
            console.error('Autoplay fully blocked', e);
            updatePlayBtnUI(false);
          });
      });
  }

  // Recover streams on disconnects
  function attemptStreamRecovery() {
    if (state.recoveryAttempts < state.maxRecoveryAttempts) {
      state.recoveryAttempts++;
      showLoading(`Connection lost. Reconnecting... (Attempt ${state.recoveryAttempts}/${state.maxRecoveryAttempts})`);
      
      state.recoveryTimer = setTimeout(() => {
        console.log(`Reconnecting attempt ${state.recoveryAttempts}`);
        if (state.currentChannel) {
          loadStream(state.currentChannel);
        }
      }, 3000);
    } else {
      handleStreamError('Stream is offline or has blocked connection. If secure, check mixed-content proxy options.');
    }
  }

  // Error layout triggers
  function handleStreamError(message) {
    hideLoading();
    dom.errorMessage.textContent = message;
    dom.errorOverlay.classList.remove('hidden');
  }

  function hideErrorOverlay() {
    dom.errorOverlay.classList.add('hidden');
  }

  // Show/Hide spinner overlays
  function showLoading(text) {
    dom.loadingText.textContent = text;
    dom.loadingSpinner.classList.remove('hidden');
  }

  function hideLoading() {
    dom.loadingSpinner.classList.add('hidden');
  }

  // Sync volume UI settings
  function updateVolumeUI() {
    const vol = dom.video.volume;
    const isMuted = dom.video.muted || vol === 0;

    if (isMuted) {
      dom.volumeHighIcon.classList.add('hidden');
      dom.volumeMutedIcon.classList.remove('hidden');
    } else {
      dom.volumeHighIcon.classList.remove('hidden');
      dom.volumeMutedIcon.classList.add('hidden');
    }
    
    dom.volumeSlider.value = isMuted ? 0 : vol;
  }

  // Sync play icon UI
  function updatePlayBtnUI(isPlaying) {
    if (isPlaying) {
      dom.playIcon.classList.add('hidden');
      dom.pauseIcon.classList.remove('hidden');
    } else {
      dom.playIcon.classList.remove('hidden');
      dom.pauseIcon.classList.add('hidden');
    }
  }

  // Play next channel in filtered grid
  function playNextChannel() {
    const list = getActiveCategoryChannels();
    if (list.length === 0) return;

    let nextIndex = state.currentChannelIndex + 1;
    if (nextIndex >= list.length) {
      nextIndex = 0;
    }
    
    playChannel(list[nextIndex]);
  }

  // Play previous channel in filtered grid
  function playPrevChannel() {
    const list = getActiveCategoryChannels();
    if (list.length === 0) return;

    let prevIndex = state.currentChannelIndex - 1;
    if (prevIndex < 0) {
      prevIndex = list.length - 1;
    }
    
    playChannel(list[prevIndex]);
  }

  // Toggle fullscreen state on the player layout wrapper
  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      dom.playerContainer.requestFullscreen()
        .then(() => {
          dom.fullscreenEnterIcon.classList.add('hidden');
          dom.fullscreenExitIcon.classList.remove('hidden');
        })
        .catch(err => console.error('Error entering fullscreen', err));
    } else {
      document.exitFullscreen()
        .then(() => {
          dom.fullscreenEnterIcon.classList.remove('hidden');
          dom.fullscreenExitIcon.classList.add('hidden');
        })
        .catch(err => console.error('Error exiting fullscreen', err));
    }
  }

  // Listen for fullscreen change to restore icons if user hits ESC
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) {
      dom.fullscreenEnterIcon.classList.remove('hidden');
      dom.fullscreenExitIcon.classList.add('hidden');
    }
  });

  // Toggle picture in picture mode
  function togglePip() {
    if (document.pictureInPictureElement) {
      document.exitPictureInPicture()
        .catch(err => console.error('Error exiting PIP', err));
    } else {
      if (dom.video.readyState >= 1) { // metadata loaded
        dom.video.requestPictureInPicture()
          .catch(err => console.error('Error entering PIP', err));
      } else {
        showToast('Video not ready for Picture-in-Picture');
      }
    }
  }

  // Toggle aspect ratios
  function cycleAspectRatio() {
    dom.playerContainer.classList.remove(...state.aspectRatios);
    state.currentAspectIndex = (state.currentAspectIndex + 1) % state.aspectRatios.length;
    const nextAspect = state.aspectRatios[state.currentAspectIndex];
    
    if (nextAspect !== 'normal') {
      dom.playerContainer.classList.add(nextAspect);
    }
    showToast(`Aspect Ratio: ${nextAspect.replace('-', ' ').toUpperCase()}`);
  }

  // Trigger showing controls bar
  function resetControlsTimeout() {
    dom.playerContainer.classList.add('controls-active');
    clearTimeout(state.controlsTimeout);
    state.controlsTimeout = setTimeout(() => {
      dom.playerContainer.classList.remove('controls-active');
    }, 3000);
  }

  // Bind all event listeners
  function setupEventListeners() {
    
    // Play/Pause Video
    dom.playBtn.addEventListener('click', () => {
      if (dom.video.paused) {
        dom.video.play().then(() => updatePlayBtnUI(true));
      } else {
        dom.video.pause();
        updatePlayBtnUI(false);
      }
    });

    dom.video.addEventListener('play', () => updatePlayBtnUI(true));
    dom.video.addEventListener('pause', () => updatePlayBtnUI(false));

    // Next / Prev buttons
    dom.nextBtn.addEventListener('click', playNextChannel);
    dom.prevBtn.addEventListener('click', playPrevChannel);

    // Mute / Unmute
    dom.muteBtn.addEventListener('click', () => {
      dom.video.muted = !dom.video.muted;
      state.isMuted = dom.video.muted;
      localStorage.setItem('streamtv_muted', state.isMuted);
      updateVolumeUI();
    });

    // Volume slider
    dom.volumeSlider.addEventListener('input', (e) => {
      const vol = parseFloat(e.target.value);
      dom.video.volume = vol;
      dom.video.muted = false;
      state.volume = vol;
      state.isMuted = false;
      localStorage.setItem('streamtv_volume', vol);
      localStorage.setItem('streamtv_muted', 'false');
      updateVolumeUI();
    });

    // Unmute compliance banner
    dom.bannerUnmuteBtn.addEventListener('click', () => {
      dom.video.muted = false;
      state.isMuted = false;
      localStorage.setItem('streamtv_muted', 'false');
      dom.unmuteBanner.classList.add('hidden');
      updateVolumeUI();
    });

    // Aspect ratio trigger
    dom.aspectBtn.addEventListener('click', cycleAspectRatio);

    // PIP trigger
    dom.pipBtn.addEventListener('click', togglePip);

    // Fullscreen trigger
    dom.fullscreenBtn.addEventListener('click', toggleFullscreen);

    // Seeker progress for MP4 files
    dom.video.addEventListener('timeupdate', () => {
      if (dom.video.duration) {
        const pct = (dom.video.currentTime / dom.video.duration) * 100;
        dom.progressFilled.style.width = `${pct}%`;
        dom.timeCurrent.textContent = formatTime(dom.video.currentTime);
        dom.timeTotal.textContent = formatTime(dom.video.duration);
      }
    });

    // Buffer progress
    dom.video.addEventListener('progress', () => {
      if (dom.video.buffered.length > 0 && dom.video.duration) {
        const bufferedEnd = dom.video.buffered.end(dom.video.buffered.length - 1);
        const pct = (bufferedEnd / dom.video.duration) * 100;
        dom.progressBuffer.style.width = `${pct}%`;
      }
    });

    // Click on progress bar to seek
    dom.progressBarContainer.addEventListener('click', (e) => {
      if (dom.video.duration) {
        const rect = dom.progressBarContainer.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const width = rect.width;
        const pct = clickX / width;
        dom.video.currentTime = pct * dom.video.duration;
      }
    });

    // Keep controls visible on user activity
    dom.playerContainer.addEventListener('mousemove', resetControlsTimeout);
    dom.playerContainer.addEventListener('touchstart', resetControlsTimeout);

    // Double tap player to fullscreen
    let lastTap = 0;
    dom.playerContainer.addEventListener('touchend', (e) => {
      const now = new Date().getTime();
      const delay = now - lastTap;
      if (delay < 300 && delay > 0) {
        toggleFullscreen();
        e.preventDefault();
      }
      lastTap = now;
    });

    // Active Channel Favorite star
    dom.favoriteToggleBtn.addEventListener('click', () => {
      if (state.currentChannel) {
        toggleFavorite(state.currentChannel);
      }
    });

    // Error recovery buttons
    dom.errorRetryBtn.addEventListener('click', () => {
      if (state.currentChannel) playChannel(state.currentChannel);
    });

    dom.errorProxyBtn.addEventListener('click', () => {
      openModal(dom.settingsModal);
      showToast('Set your CORS/HTTPS Proxy Gateway URL here.');
    });

    // Sidebar Category Clicks
    dom.categoryList.addEventListener('click', (e) => {
      const item = e.target.closest('.category-item');
      if (!item) return;

      dom.categoryList.querySelectorAll('.category-item').forEach(li => li.classList.remove('active'));
      item.classList.add('active');

      const group = item.getAttribute('data-group');
      state.activeGroup = group;
      dom.activeCategoryTitle.textContent = group === 'ALL' ? 'All Channels' : group === 'FAVORITES' ? '⭐ Favorites' : group === 'RECENTS' ? '🕐 Recently Watched' : group;

      // Sync mobile select
      dom.mobileCategorySelect.value = group;

      filterAndRenderChannels();
    });

    // Mobile Group selection
    dom.mobileCategorySelect.addEventListener('change', (e) => {
      const group = e.target.value;
      state.activeGroup = group;
      
      dom.activeCategoryTitle.textContent = group === 'ALL' ? 'All Channels' : group === 'FAVORITES' ? '⭐ Favorites' : group === 'RECENTS' ? '🕐 Recently Watched' : group;

      // Sync desktop list highlight
      dom.categoryList.querySelectorAll('.category-item').forEach(li => {
        if (li.getAttribute('data-group') === group) {
          li.classList.add('active');
        } else {
          li.classList.remove('active');
        }
      });

      filterAndRenderChannels();
    });

    // Search query listeners
    const handleSearch = (e) => {
      state.searchQuery = e.target.value;
      // Sync search fields
      dom.desktopSearchInput.value = state.searchQuery;
      dom.mobileSearchInput.value = state.searchQuery;
      filterAndRenderChannels();
    };

    dom.desktopSearchInput.addEventListener('input', handleSearch);
    dom.mobileSearchInput.addEventListener('input', handleSearch);

    // Modal toggles
    dom.settingsBtn.addEventListener('click', () => openModal(dom.settingsModal));
    dom.shortcutsBtn.addEventListener('click', () => openModal(dom.shortcutsModal));
    dom.closeSettingsBtn.addEventListener('click', () => closeModal(dom.settingsModal));
    dom.closeShortcutsBtn.addEventListener('click', () => closeModal(dom.shortcutsModal));

    // Close modal on outer clicks
    window.addEventListener('click', (e) => {
      if (e.target === dom.settingsModal) closeModal(dom.settingsModal);
      if (e.target === dom.shortcutsModal) closeModal(dom.shortcutsModal);
    });

    // Settings actions
    dom.loadPlaylistBtn.addEventListener('click', () => {
      const val = dom.playlistUrlInput.value.trim();
      if (val) {
        localStorage.setItem('streamtv_playlist_url', val);
        loadPlaylist(val);
        closeModal(dom.settingsModal);
        showToast('IPTV playlist updated.');
      }
    });

    dom.loadProxyBtn.addEventListener('click', () => {
      const val = dom.proxyUrlInput.value.trim();
      localStorage.setItem('streamtv_proxy_url', val);
      state.proxyUrl = val;
      closeModal(dom.settingsModal);
      showToast('Proxy gateway configuration updated.');
      if (state.currentChannel) {
        playChannel(state.currentChannel); // reload active channel via proxy
      }
    });

    dom.resetPlaylistBtn.addEventListener('click', () => {
      localStorage.removeItem('streamtv_playlist_url');
      const defaultUrl = decodeBase64(state.config.playlist);
      dom.playlistUrlInput.value = defaultUrl;
      loadPlaylist(defaultUrl);
      closeModal(dom.settingsModal);
      showToast('Restored default M3U playlist.');
    });

    dom.clearAppCacheBtn.addEventListener('click', () => {
      if (confirm('Are you sure you want to clear all locally cached favorites, recents, and playlist selections?')) {
        localStorage.clear();
        showToast('App storage cleared. Reloading...');
        setTimeout(() => window.location.reload(), 1000);
      }
    });

    // Keyboard Hotkeys
    window.addEventListener('keydown', (e) => {
      // Ignore key events when typing in inputs
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

      switch (e.key.toLowerCase()) {
        case ' ':
        case 'k':
          e.preventDefault();
          dom.playBtn.click();
          break;
        case 'm':
          dom.muteBtn.click();
          break;
        case 'arrowup':
          e.preventDefault();
          adjustVolume(0.1);
          break;
        case 'arrowdown':
          e.preventDefault();
          adjustVolume(-0.1);
          break;
        case 'arrowleft':
        case '[':
          playPrevChannel();
          break;
        case 'arrowright':
        case ']':
          playNextChannel();
          break;
        case 'f':
          toggleFullscreen();
          break;
        case 'p':
          togglePip();
          break;
        case 'a':
          cycleAspectRatio();
          break;
      }
    });
  }

  // Time formatter helper
  function formatTime(seconds) {
    if (isNaN(seconds) || seconds === Infinity) return '0:00';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    let res = '';
    if (hrs > 0) {
      res += `${hrs}:${mins < 10 ? '0' : ''}`;
    }
    res += `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    return res;
  }

  // Adjust volume levels manually
  function adjustVolume(change) {
    let newVol = dom.video.volume + change;
    if (newVol > 1) newVol = 1;
    if (newVol < 0) newVol = 0;
    
    dom.video.volume = newVol;
    dom.video.muted = false;
    state.volume = newVol;
    state.isMuted = false;
    
    localStorage.setItem('streamtv_volume', newVol);
    localStorage.setItem('streamtv_muted', 'false');
    
    updateVolumeUI();
    showToast(`Volume: ${Math.round(newVol * 100)}%`);
  }

  // Modal show/hide helpers
  function openModal(modal) {
    modal.classList.remove('hidden');
  }

  function closeModal(modal) {
    modal.classList.add('hidden');
  }

  // Launch Core App
  window.addEventListener('DOMContentLoaded', init);

})();
