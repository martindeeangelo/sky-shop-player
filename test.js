(function () {
  // ====== GUARD ======
  if (window.__SS_PLAYER_LOADED__) return;
  window.__SS_PLAYER_LOADED__ = true;

  // ====== CONFIG ======
  const SELECTOR_TILE = 'figure.product-tile';
  const TITLE_SELECTORS = ['.product-name', '.product-name-container', '.product-title', 'figcaption', 'h3', 'h2'];
  const PLAYLINE_WIDTH_PX = 160; // <- długość paska przy produkcie (na prawo od ▶)
  const STICKY_LINE_WIDTH_PX = 260; // <- długość paska w sticky playerze

  // ====== STATE ======
  const audios = [];
  let currentAudio = null;

  // ====== HELPERS ======
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function findTitleContainer(tile) {
    for (const sel of TITLE_SELECTORS) {
      const el = $(sel, tile);
      if (el) return el;
    }
    return tile; // fallback
  }

  function getMp3Url(tile) {
    // 1) data-mp3
    const data = tile.getAttribute('data-mp3');
    if (data && data.trim()) return data.trim();

    // 2) link ending with .mp3
    const a = $('a[href$=".mp3"]', tile);
    if (a && a.href) return a.href;

    return null;
  }

  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  function percent(audio) {
    if (!audio || !isFinite(audio.duration) || audio.duration <= 0) return 0;
    return clamp((audio.currentTime / audio.duration) * 100, 0, 100);
  }

  function formatTime(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  // ====== CSS INJECT ======
  const style = document.createElement('style');
  style.textContent = `
    .ss-play-wrap{
      display:inline-flex;
      align-items:center;
      gap:8px;
      vertical-align:middle;
    }
    .ss-play-btn{
      cursor:pointer;
      border:0;
      background:transparent;
      font-size:16px;
      line-height:1;
      padding:0;
    }
    .ss-playline{
      width:${PLAYLINE_WIDTH_PX}px;
      height:6px;
      background:rgba(0,0,0,.18);
      border-radius:999px;
      position:relative;
      overflow:hidden;
      cursor:pointer;
      flex:0 0 auto;
    }
    .ss-playline-fill{
      position:absolute;
      left:0; top:0; bottom:0;
      width:0%;
      background:#000;
    }
    .ss-playline-knob{
      position:absolute;
      top:50%;
      transform:translate(-50%,-50%);
      width:10px; height:10px;
      background:#000;
      border-radius:50%;
      left:0%;
      pointer-events:none;
      opacity:.9;
    }

    /* sticky */
    #ss-sticky-player{
      position:fixed;
      left:0; right:0; bottom:0;
      height:58px;
      background:#111;
      color:#fff;
      display:none;
      align-items:center;
      padding:0 12px;
      z-index:999999;
      gap:12px;
      font-family:system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
      box-shadow:0 -8px 24px rgba(0,0,0,.25);
    }
    #ss-sticky-player button{
      cursor:pointer;
      border:0;
      background:transparent;
      color:#fff;
      font-size:20px;
      padding:0;
      line-height:1;
    }
    #ss-sticky-title{
      flex:1;
      font-size:13px;
      white-space:nowrap;
      overflow:hidden;
      text-overflow:ellipsis;
      opacity:.95;
    }
    #ss-sticky-time{
      font-size:12px;
      opacity:.8;
      min-width:80px;
      text-align:right;
    }
    #ss-sticky-line{
      width:${STICKY_LINE_WIDTH_PX}px;
      height:6px;
      background:rgba(255,255,255,.18);
      border-radius:999px;
      position:relative;
      overflow:hidden;
      cursor:pointer;
      flex:0 0 auto;
    }
    #ss-sticky-line .ss-playline-fill{ background:#fff; }
    #ss-sticky-line .ss-playline-knob{ background:#fff; }
  `;
  document.head.appendChild(style);

  // ====== STICKY UI ======
  const sticky = document.createElement('div');
  sticky.id = 'ss-sticky-player';

  const stickyBtn = document.createElement('button');
  stickyBtn.id = 'ss-sticky-btn';
  stickyBtn.textContent = '⏸';

  const stickyTitle = document.createElement('div');
  stickyTitle.id = 'ss-sticky-title';
  stickyTitle.textContent = '';

  const stickyLine = document.createElement('div');
  stickyLine.id = 'ss-sticky-line';

  const stickyFill = document.createElement('div');
  stickyFill.className = 'ss-playline-fill';

  const stickyKnob = document.createElement('div');
  stickyKnob.className = 'ss-playline-knob';

  stickyLine.appendChild(stickyFill);
  stickyLine.appendChild(stickyKnob);

  const stickyTime = document.createElement('div');
  stickyTime.id = 'ss-sticky-time';
  stickyTime.textContent = '0:00 / 0:00';

  sticky.appendChild(stickyBtn);
  sticky.appendChild(stickyTitle);
  sticky.appendChild(stickyLine);
  sticky.appendChild(stickyTime);
  document.body.appendChild(sticky);

  function showSticky(titleText) {
    sticky.style.display = 'flex';
    stickyTitle.textContent = titleText || '';
  }

  function hideStickyIfNothing() {
    if (!currentAudio) {
      sticky.style.display = 'none';
      stickyFill.style.width = '0%';
      stickyKnob.style.left = '0%';
      stickyTime.textContent = '0:00 / 0:00';
      stickyTitle.textContent = '';
    }
  }

  function updateSticky() {
    if (!currentAudio) return;
    const p = percent(currentAudio);
    stickyFill.style.width = p + '%';
    stickyKnob.style.left = p + '%';
    stickyTime.textContent = `${formatTime(currentAudio.currentTime)} / ${formatTime(currentAudio.duration)}`;
  }

  stickyBtn.addEventListener('click', () => {
    if (!currentAudio) return;
    if (currentAudio.paused) {
      currentAudio.play();
      stickyBtn.textContent = '⏸';
      if (currentAudio._btn) currentAudio._btn.textContent = '⏸';
    } else {
      currentAudio.pause();
      stickyBtn.textContent = '▶';
      if (currentAudio._btn) currentAudio._btn.textContent = '▶';
    }
  });

  stickyLine.addEventListener('click', (e) => {
    if (!currentAudio || !isFinite(currentAudio.duration) || currentAudio.duration <= 0) return;
    const rect = stickyLine.getBoundingClientRect();
    const x = clamp(e.clientX - rect.left, 0, rect.width);
    currentAudio.currentTime = (x / rect.width) * currentAudio.duration;
    updateSticky();
  });

  // ====== AUDIO CONTROL ======
  function stopAllExcept(audio) {
    audios.forEach(a => {
      if (a !== audio) {
        a.pause();
        if (a._btn) a._btn.textContent = '▶';
        // reset local bar
        if (a._fill && a._knob) {
          a._fill.style.width = '0%';
          a._knob.style.left = '0%';
        }
      }
    });
  }

  function bindCurrentAudio(audio, titleText) {
    // detach old
    if (currentAudio) {
      currentAudio.removeEventListener('timeupdate', updateSticky);
      currentAudio.removeEventListener('loadedmetadata', updateSticky);
    }

    currentAudio = audio;

    currentAudio.addEventListener('timeupdate', updateSticky);
    currentAudio.addEventListener('loadedmetadata', updateSticky);

    showSticky(titleText);
    updateSticky();
  }

  // ====== BUILD PER-PRODUCT CONTROLS ======
  function initTiles(root = document) {
    $$(SELECTOR_TILE, root).forEach(tile => {
      if (tile.querySelector('.ss-play-wrap')) return;

      const mp3 = getMp3Url(tile);
      if (!mp3) return;

      const titleContainer = findTitleContainer(tile);
      const titleText =
        (titleContainer && titleContainer.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 160);

      const audio = document.createElement('audio');
      audio.src = mp3;
      audio.preload = 'none';

      audios.push(audio);

      // UI: wrap -> [btn][line]
      const wrap = document.createElement('div');
      wrap.className = 'ss-play-wrap';

      const btn = document.createElement('button');
      btn.className = 'ss-play-btn';
      btn.type = 'button';
      btn.textContent = '▶';

      const line = document.createElement('div');
      line.className = 'ss-playline';

      const fill = document.createElement('div');
      fill.className = 'ss-playline-fill';

      const knob = document.createElement('div');
      knob.className = 'ss-playline-knob';

      line.appendChild(fill);
      line.appendChild(knob);

      wrap.appendChild(btn);
      wrap.appendChild(line);

      // attach near title
      titleContainer.appendChild(wrap);

      // store refs
      audio._btn = btn;
      audio._fill = fill;
      audio._knob = knob;
      audio._title = titleText;

      function updateLocal() {
        const p = percent(audio);
        fill.style.width = p + '%';
        knob.style.left = p + '%';
        // sticky synchronizuje się tylko z currentAudio (updateSticky listener)
      }

      audio.addEventListener('timeupdate', updateLocal);
      audio.addEventListener('loadedmetadata', updateLocal);
      audio.addEventListener('ended', () => {
        btn.textContent = '▶';
        updateLocal();
        if (currentAudio === audio) {
          stickyBtn.textContent = '▶';
          updateSticky();
        }
      });

      line.addEventListener('click', (e) => {
        if (!isFinite(audio.duration) || audio.duration <= 0) return;
        const rect = line.getBoundingClientRect();
        const x = clamp(e.clientX - rect.left, 0, rect.width);
        audio.currentTime = (x / rect.width) * audio.duration;
        updateLocal();
        if (currentAudio === audio) updateSticky();
      });

      btn.addEventListener('click', () => {
        // zatrzymaj inne
        stopAllExcept(audio);

        if (audio.paused) {
          audio.play();
          btn.textContent = '⏸';
          stickyBtn.textContent = '⏸';
          bindCurrentAudio(audio, audio._title || 'Odtwarzanie…');
        } else {
          audio.pause();
          btn.textContent = '▶';
          if (currentAudio === audio) stickyBtn.textContent = '▶';
        }

        // jeśli nic nie gra, można schować sticky (opcjonalnie)
        // tu zostawiamy sticky widoczne, dopóki była interakcja
        // ale jeśli chcesz auto-hide po pauzie -> odkomentuj:
        // if (audio.paused && currentAudio === audio) { currentAudio = null; hideStickyIfNothing(); }
      });
    });
  }

  // ====== INIT ON READY ======
  function boot() {
    initTiles(document);

    // jeśli SkyShop doczytuje produkty dynamicznie
    const obs = new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.addedNodes && m.addedNodes.length) {
          initTiles(document);
          break;
        }
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
