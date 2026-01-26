/* ===== SKY-SHOP: MP3 PER PRODUKT + STICKY + 1x PLAY PER PRODUKT + RESUME MIĘDZY PODSTRONAMI ===== */
(() => {
  const AUDIO_BASE = 'https://dv202.mysky-shop.pl/upload/dv202/audio/';
  const STYLE_ID = 'ss-player-style';
  const WRAP_ID = 'ss-sticky-player';

  // resume state
  const STORE_KEY = 'ss_player_state_v2';
  const RESTORE_MAX_AGE_MS = 30 * 60 * 1000; // 30 min

  if (document.getElementById(WRAP_ID)) return;

  /* ================= HELPERS ================= */

  const deDia = (s) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const slugFromTitle = (title) => {
    let s = deDia(title);
    s = s.replace(/^\s*(audio|mp3|utw[oó]r|preview)\s+/i, '');
    s = s.replace(/&/g, ' ');
    s = s.replace(/[()']/g, '');
    s = s.replace(/[^A-Za-z0-9_]+/g, '-');
    s = s.replace(/(^|[^-])_www/ig, '$1-_www');
    s = s.replace(/-+/g, '-').replace(/^-|-$/g, '');
    return s;
  };

  const audioUrlExists = (url, timeoutMs = 2500) =>
    new Promise((resolve) => {
      const a = new Audio();
      let done = false;

      const finish = (ok) => {
        if (done) return;
        done = true;
        try { a.pause(); } catch (_) {}
        a.src = '';
        resolve(ok);
      };

      const t = setTimeout(() => finish(false), timeoutMs);

      a.addEventListener('loadedmetadata', () => { clearTimeout(t); finish(true); }, { once: true });
      a.addEventListener('canplay', () => { clearTimeout(t); finish(true); }, { once: true });
      a.addEventListener('error', () => { clearTimeout(t); finish(false); }, { once: true });

      a.preload = 'metadata';
      a.src = url;
    });

  const resolveMp3Url = async (productTitle) => {
    const s = slugFromTitle(productTitle);
    const candidates = [
      `${AUDIO_BASE}${s}.mp3`,
      `${AUDIO_BASE}${s}-.mp3`,
    ];
    for (const url of candidates) {
      // eslint-disable-next-line no-await-in-loop
      if (await audioUrlExists(url)) return url;
    }
    return null;
  };

  const fmt = (sec) => {
    if (!isFinite(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const safeJsonParse = (raw) => {
    try { return JSON.parse(raw); } catch (_) { return null; }
  };

  /* ================= CSS ================= */

  const injectCss = () => {
    if (document.getElementById(STYLE_ID)) return;
    const st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = `
#${WRAP_ID}{
  position:fixed;
  left:12px; right:12px; bottom:12px;
  z-index:99999;
  background:rgba(10,10,10,.92);
  border:1px solid rgba(255,255,255,.12);
  border-radius:14px;
  padding:10px 12px;
  backdrop-filter:blur(8px);
}
#${WRAP_ID} .ss-row{
  display:flex;
  align-items:center;
  gap:10px;
}
#${WRAP_ID} #ss-play{
  width:46px; height:46px;
  background:#000; color:#fff;
  border:none; border-radius:10px;
  cursor:pointer;
}
#${WRAP_ID} .ss-meta{flex:1; min-width:0;}
#${WRAP_ID} #ss-title{
  color:#fff; font-weight:600; font-size:13px;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
  margin-bottom:6px;
}
#${WRAP_ID} .ss-bar{
  display:flex; gap:10px; align-items:center;
}
#${WRAP_ID} #ss-range{flex:1;}
#${WRAP_ID} #ss-time{
  width:110px;
  text-align:right;
  color:#ccc;
  font-size:12px;
  white-space:nowrap;
}
.ss-playline{margin-top:6px;}
.ss-inline-play{
  width:34px; height:28px;
  border-radius:8px;
  border:1px solid rgba(0,0,0,.2);
  background:#000; color:#fff;
  font-size:12px;
  cursor:pointer;
}
`;
    document.head.appendChild(st);
  };

  /* ================= STICKY PLAYER ================= */

  let currentBtn = null;
  const audio = new Audio();
  audio.preload = 'none';

  const wrap = document.createElement('div');
  wrap.id = WRAP_ID;
  wrap.innerHTML = `
    <div class="ss-row">
      <button id="ss-play" type="button">▶</button>
      <div class="ss-meta">
        <div id="ss-title">—</div>
        <div class="ss-bar">
          <input id="ss-range" type="range" min="0" max="1000" value="0">
          <span id="ss-time">0:00 / 0:00</span>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(wrap);

  const btnPlay = wrap.querySelector('#ss-play');
  const titleElSticky = wrap.querySelector('#ss-title');
  const range = wrap.querySelector('#ss-range');
  const timeEl = wrap.querySelector('#ss-time');

  const resetInlineButtons = () => {
    document.querySelectorAll('.ss-inline-play').forEach((b) => (b.textContent = '▶'));
  };

  btnPlay.addEventListener('click', () => {
    if (!audio.src) return;
    if (audio.paused) {
      const p = audio.play();
      btnPlay.textContent = '⏸';
      if (currentBtn) currentBtn.textContent = '⏸';
      if (p && typeof p.catch === 'function') {
        p.catch(() => {
          btnPlay.textContent = '▶';
          if (currentBtn) currentBtn.textContent = '▶';
        });
      }
    } else {
      audio.pause();
      btnPlay.textContent = '▶';
      resetInlineButtons();
    }
  });

  audio.addEventListener('timeupdate', () => {
    const d = audio.duration || 0;
    const c = audio.currentTime || 0;
    range.value = d ? Math.round((c / d) * 1000) : 0;
    timeEl.textContent = `${fmt(c)} / ${fmt(d)}`;
  });

  audio.addEventListener('ended', () => {
    btnPlay.textContent = '▶';
    resetInlineButtons();
  });

  range.addEventListener('input', () => {
    const d = audio.duration || 0;
    if (d) audio.currentTime = (range.value / 1000) * d;
  });

  /* ================= RESUME (localStorage) ================= */

  const saveState = (playing) => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        src: audio.src || '',
        title: (titleElSticky.textContent || '').trim(),
        t: audio.currentTime || 0,
        playing: !!playing,
        ts: Date.now()
      }));
    } catch (_) {}
  };

  const loadState = () => {
    const raw = (() => { try { return localStorage.getItem(STORE_KEY); } catch (_) { return null; } })();
    if (!raw) return null;
    const st = safeJsonParse(raw);
    if (!st || !st.src) return null;
    if (st.ts && Date.now() - st.ts > RESTORE_MAX_AGE_MS) return null;
    return st;
  };

  // zapisuj postęp co ~1s
  let _lastSave = 0;
  audio.addEventListener('timeupdate', () => {
    const now = Date.now();
    if (now - _lastSave > 1000) {
      _lastSave = now;
      saveState(!audio.paused);
    }
  });

  audio.addEventListener('play',  () => saveState(true));
  audio.addEventListener('pause', () => saveState(false));
  audio.addEventListener('ended', () => saveState(false));

  const restoreState = () => {
    const st = loadState();
    if (!st) return;

    audio.src = st.src;
    const baseTitle = st.title || '—';
    titleElSticky.textContent = baseTitle;

    btnPlay.textContent = st.playing ? '⏸' : '▶';

    const seekTo = Math.max(0, Number(st.t || 0));

    const doSeekAndMaybePlay = () => {
      try { audio.currentTime = seekTo; } catch (_) {}

      if (st.playing) {
        const p = audio.play();
        if (p && typeof p.catch === 'function') {
          p.catch(() => {
            // autoplay zablokowany – powiedz userowi co zrobić
            btnPlay.textContent = '▶';
            titleElSticky.textContent = `${baseTitle} (kliknij ▶ aby kontynuować)`;
            saveState(false);
          });
        }
      }
    };

    if (audio.readyState >= 1) doSeekAndMaybePlay();
    else audio.addEventListener('loadedmetadata', doSeekAndMaybePlay, { once: true });
  };

  // zapis tuż przed nawigacją (klik w link produktu)
  const hookNavigationSave = () => {
    const handler = (e) => {
      if (!audio.src) return;

      const a = e.target && e.target.closest ? e.target.closest('a') : null;
      if (!a) return;

      const href = (a.getAttribute('href') || '').trim();
      if (!href || href === '#' || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) return;

      if (e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      saveState(!audio.paused);
    };

    document.addEventListener('click', handler, true);
  };

  /* ================= 1 PRZYCISK NA 1 PRODUKT ================= */

  const cache = new Map(); // title -> url|null

  const getProductBox = (titleEl) => {
    return (
      titleEl.closest('figure.product-tile') ||
      titleEl.closest('figure') ||
      titleEl.closest('.product-item') ||
      titleEl.closest('.product-tile') ||
      titleEl.closest('article') ||
      titleEl.closest('li') ||
      titleEl.closest('.product') ||
      null
    );
  };

  const pickMainTitleEl = (box) => {
    const a = box.querySelector('.product-name a, .product-name-container a');
    if (a && a.textContent.trim()) return a.closest('.product-name') || a;

    const names = Array.from(
      box.querySelectorAll('.product-name, .product-name-container, h2.product-name, h3.product-name')
    );

    for (const el of names) {
      const txt = (el.textContent || '').trim();
      if (!txt) continue;
      if (el.getAttribute('aria-hidden') === 'true') continue;
      const cs = window.getComputedStyle(el);
      if (cs && (cs.display === 'none' || cs.visibility === 'hidden')) continue;
      return el;
    }
    return null;
  };

  const attach = (root = document) => {
    const candidates = root.querySelectorAll('.product-name, .product-name-container, h2.product-name, h3.product-name');

    candidates.forEach((cand) => {
      const box = getProductBox(cand);
      if (!box) return;

      if (box.dataset.ssHasPlay === '1') return;

      const titleEl = pickMainTitleEl(box);
      if (!titleEl) return;

      const title = (titleEl.textContent || '').trim();
      if (!title) return;

      if (box.querySelector('.ss-playline')) {
        box.dataset.ssHasPlay = '1';
        return;
      }

      const line = document.createElement('div');
      line.className = 'ss-playline';

      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ss-inline-play';
      b.textContent = '▶';

      b.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (currentBtn === b && !audio.paused) {
          audio.pause();
          btnPlay.textContent = '▶';
          b.textContent = '▶';
          saveState(false);
          return;
        }

        b.textContent = '…';

        let url;
        if (cache.has(title)) {
          url = cache.get(title);
        } else {
          url = await resolveMp3Url(title);
          cache.set(title, url);
        }

        if (!url) {
          b.textContent = 'Brak MP3';
          setTimeout(() => (b.textContent = '▶'), 1200);
          return;
        }

        resetInlineButtons();
        currentBtn = b;

        try { audio.pause(); } catch (_) {}
        audio.src = url;
        titleElSticky.textContent = title;

        const p = audio.play();
        btnPlay.textContent = '⏸';
        b.textContent = '⏸';
        saveState(true);

        if (p && typeof p.catch === 'function') {
          p.catch(() => {
            btnPlay.textContent = '▶';
            b.textContent = '▶';
            titleElSticky.textContent = `${title} (kliknij ▶ aby kontynuować)`;
            saveState(false);
          });
        }
      });

      line.appendChild(b);

      const base = titleEl.matches('a') ? titleEl.parentElement : titleEl;
      base.insertAdjacentElement('afterend', line);

      box.dataset.ssHasPlay = '1';
    });
  };

  /* ================= START + AJAX ================= */

  const BOOT = () => {
    injectCss();
    attach();

    // obserwuj dynamiczne doładowania (debounce)
    let t = null;
    const obs = new MutationObserver(() => {
      clearTimeout(t);
      t = setTimeout(() => attach(), 80);
    });
    obs.observe(document.body, { childList: true, subtree: true });

    hookNavigationSave();
    restoreState();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', BOOT);
  } else {
    BOOT();
  }
})();
