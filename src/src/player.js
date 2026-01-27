/* ===== SKY-SHOP: MP3 PER PRODUKT + STICKY + 1x PLAY PER PRODUKT + RESUME ===== */
(() => {
  'use strict';

  /* ================= CONFIG ================= */
  const CFG = {
    AUDIO_BASE: 'https://dv202.mysky-shop.pl/upload/dv202/audio/',
    STYLE_ID: 'ss-player-style',
    WRAP_ID: 'ss-sticky-player',
    STORE_KEY: 'ss_player_state_v3',
    RESTORE_MAX_AGE_MS: 30 * 60 * 1000, // 30 min
    OBS_DEBOUNCE_MS: 80,
    URL_TIMEOUT_MS: 2500,
  };

  if (document.getElementById(CFG.WRAP_ID)) return;

  /* ================= MODULE: Utils ================= */
  const Utils = (() => {
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

    const fmt = (sec) => {
      if (!isFinite(sec)) return '0:00';
      const m = Math.floor(sec / 60);
      const s = Math.floor(sec % 60).toString().padStart(2, '0');
      return `${m}:${s}`;
    };

    const safeJsonParse = (raw) => {
      try { return JSON.parse(raw); } catch (_) { return null; }
    };

    return { deDia, slugFromTitle, fmt, safeJsonParse };
  })();

  /* ================= MODULE: Styles ================= */
  const Styles = (() => {
    const inject = () => {
      if (document.getElementById(CFG.STYLE_ID)) return;
      const st = document.createElement('style');
      st.id = CFG.STYLE_ID;
      st.textContent = `
#${CFG.WRAP_ID}{
  position:fixed;
  left:12px; right:12px; bottom:12px;
  z-index:99999;
  background:rgba(10,10,10,.92);
  border:1px solid rgba(255,255,255,.12);
  border-radius:14px;
  padding:10px 12px;
  backdrop-filter:blur(8px);
}
#${CFG.WRAP_ID} .ss-row{
  display:flex;
  align-items:center;
  gap:10px;
}
#${CFG.WRAP_ID} #ss-play{
  width:46px; height:46px;
  background:#000; color:#fff;
  border:none; border-radius:10px;
  cursor:pointer;
}
#${CFG.WRAP_ID} .ss-meta{flex:1; min-width:0;}
#${CFG.WRAP_ID} #ss-title{
  color:#fff; font-weight:600; font-size:13px;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
  margin-bottom:6px;
}
#${CFG.WRAP_ID} .ss-bar{
  display:flex; gap:10px; align-items:center;
}
#${CFG.WRAP_ID} #ss-range{flex:1;}
#${CFG.WRAP_ID} #ss-time{
  width:120px;
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

    return { inject };
  })();

  /* ================= MODULE: Resolver (MP3 URL) ================= */
  const Resolver = (() => {
    const audioUrlExists = (url, timeoutMs = CFG.URL_TIMEOUT_MS) =>
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
        a.addEventListener('canplay',       () => { clearTimeout(t); finish(true); }, { once: true });
        a.addEventListener('error',         () => { clearTimeout(t); finish(false); }, { once: true });

        a.preload = 'metadata';
        a.src = url;
      });

    const resolveMp3Url = async (productTitle) => {
      const s = Utils.slugFromTitle(productTitle);
      const candidates = [
        `${CFG.AUDIO_BASE}${s}.mp3`,
        `${CFG.AUDIO_BASE}${s}-.mp3`,
      ];
      for (const url of candidates) {
        // eslint-disable-next-line no-await-in-loop
        if (await audioUrlExists(url)) return url;
      }
      return null;
    };

    return { resolveMp3Url };
  })();

  /* ================= MODULE: Player (sticky + Audio) ================= */
  const Player = (() => {
    const audio = new Audio();
    audio.preload = 'none';

    let currentInlineBtn = null;

    const wrap = document.createElement('div');
    wrap.id = CFG.WRAP_ID;
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

    const setCurrentInlineBtn = (btnOrNull) => { currentInlineBtn = btnOrNull; };

    const setTitle = (t) => { titleElSticky.textContent = t || '—'; };
    const getTitle = () => (titleElSticky.textContent || '').trim();

    const setPlayIcons = (playing) => {
      btnPlay.textContent = playing ? '⏸' : '▶';
      if (currentInlineBtn) currentInlineBtn.textContent = playing ? '⏸' : '▶';
      if (!playing) resetInlineButtons();
    };

    btnPlay.addEventListener('click', () => {
      if (!audio.src) return;

      const rawTitle = (getTitle() || '').replace(/\s*\(kliknij.*?\)\s*$/i, '').trim();
      if (rawTitle) setTitle(rawTitle);

      if (audio.paused) {
        const p = audio.play();
        setPlayIcons(true);
        State.save(true, true);

        if (p && typeof p.catch === 'function') {
          p.catch(() => {
            setPlayIcons(false);
            setTitle(`${rawTitle || '—'} (kliknij ▶ aby kontynuować)`);
            State.save(false, true);
          });
        }
      } else {
        audio.pause();
        setPlayIcons(false);
        State.save(false, true);
      }
    });

    audio.addEventListener('timeupdate', () => {
      const d = audio.duration || 0;
      const c = audio.currentTime || 0;
      range.value = d ? Math.round((c / d) * 1000) : 0;
      timeEl.textContent = `${Utils.fmt(c)} / ${Utils.fmt(d)}`;
    });

    audio.addEventListener('ended', () => {
      setPlayIcons(false);
    });

    range.addEventListener('input', () => {
      const d = audio.duration || 0;
      if (d) audio.currentTime = (range.value / 1000) * d;
    });

    const playUrl = (url, title, inlineBtn) => {
      try { audio.pause(); } catch (_) {}
      audio.src = url;
      setTitle(title);
      setCurrentInlineBtn(inlineBtn || null);

      const p = audio.play();
      setPlayIcons(true);
      State.save(true, true);

      if (p && typeof p.catch === 'function') {
        p.catch(() => {
          setPlayIcons(false);
          if (inlineBtn) inlineBtn.textContent = '▶';
          setTitle(`${title} (kliknij ▶ aby kontynuować)`);
          State.save(false, true);
        });
      }
    };

    const pause = () => {
      audio.pause();
      setPlayIcons(false);
    };

    const getAudio = () => audio;

    return {
      playUrl,
      pause,
      getAudio,
      setTitle,
      getTitle,
      setPlayIcons,
      setCurrentInlineBtn,
      resetInlineButtons,
    };
  })();

  /* ================= MODULE: State (resume/localStorage) ================= */
  const State = (() => {
    const audio = Player.getAudio();

    const save = (playing, wasPlaying = null) => {
      try {
        const prevRaw = localStorage.getItem(CFG.STORE_KEY);
        const prev = prevRaw ? Utils.safeJsonParse(prevRaw) : null;

        localStorage.setItem(CFG.STORE_KEY, JSON.stringify({
          src: audio.src || '',
          title: (Player.getTitle() || '').trim(),
          t: audio.currentTime || 0,
          playing: !!playing,
          wasPlaying: wasPlaying === null ? !!(prev && prev.wasPlaying) : !!wasPlaying,
          ts: Date.now()
        }));
      } catch (_) {}
    };

    const load = () => {
      const raw = (() => { try { return localStorage.getItem(CFG.STORE_KEY); } catch (_) { return null; } })();
      if (!raw) return null;
      const st = Utils.safeJsonParse(raw);
      if (!st || !st.src) return null;
      if (st.ts && Date.now() - st.ts > CFG.RESTORE_MAX_AGE_MS) return null;
      return st;
    };

    // auto-save co ~1s
    let lastSave = 0;
    audio.addEventListener('timeupdate', () => {
      const now = Date.now();
      if (now - lastSave > 1000) {
        lastSave = now;
        save(!audio.paused, null);
      }
    });

    audio.addEventListener('pause', () => {
      const hidden = document.hidden === true;
      save(false, hidden ? null : false);
    });
    audio.addEventListener('play',  () => save(true, true));
    audio.addEventListener('ended', () => save(false, false));

    const restore = () => {
      const st = load();
      if (!st) return;

      audio.src = st.src;

      const baseTitle = st.title || '—';
      const seekTo = Math.max(0, Number(st.t || 0));
      const shouldTryPlay = !!(st.playing || st.wasPlaying);

      Player.setPlayIcons(shouldTryPlay);
      Player.setTitle(`${baseTitle} (od ${Utils.fmt(seekTo)})`);

      const doSeekAndMaybePlay = () => {
        try { audio.currentTime = seekTo; } catch (_) {}

        if (shouldTryPlay) {
          const p = audio.play();
          if (p && typeof p.catch === 'function') {
            p.catch(() => {
              Player.setPlayIcons(false);
              Player.setTitle(`${baseTitle} (kliknij ▶ aby kontynuować od ${Utils.fmt(seekTo)})`);
              save(false, true);
            });
          }
        } else {
          Player.setTitle(`${baseTitle} (kliknij ▶ aby kontynuować od ${Utils.fmt(seekTo)})`);
          save(false, st.wasPlaying === true);
        }
      };

      if (audio.readyState >= 1) doSeekAndMaybePlay();
      else audio.addEventListener('loadedmetadata', doSeekAndMaybePlay, { once: true });
    };

    const hookNavigationSave = () => {
      const handler = (e) => {
        if (!audio.src) return;

        const a = e.target && e.target.closest ? e.target.closest('a') : null;
        if (!a) return;

        const href = (a.getAttribute('href') || '').trim();
        if (!href || href === '#' || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) return;

        if (e.button !== 0) return;
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

        save(!audio.paused, !audio.paused);
      };

      document.addEventListener('click', handler, true);
    };

    return { save, load, restore, hookNavigationSave };
  })();

  /* ================= MODULE: ProductList (buttons per product) ================= */
  const ProductList = (() => {
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

          const audio = Player.getAudio();

          // toggle pause jeśli to ten sam przycisk i gra
          if (audio.src && !audio.paused && Player && b === (document.activeElement || b) && false) {
            // (nie używamy — zostawiamy czytelniej poniżej)
          }

          // Jeżeli kliknięty jest obecnie grający inline
          // (wykrywamy po referencji zapamiętanej w Player)
          // -> prosto: jeśli na przycisku jest ⏸ i audio gra, to pauza.
          if (b.textContent === '⏸' && !audio.paused) {
            Player.pause();
            State.save(false, true);
            b.textContent = '▶';
            return;
          }

          b.textContent = '…';

          let url;
          if (cache.has(title)) url = cache.get(title);
          else {
            url = await Resolver.resolveMp3Url(title);
            cache.set(title, url);
          }

          if (!url) {
            b.textContent = 'Brak MP3';
            setTimeout(() => (b.textContent = '▶'), 1200);
            return;
          }

          Player.resetInlineButtons();
          Player.setCurrentInlineBtn(b);
          Player.playUrl(url, title, b);
        });

        line.appendChild(b);

        const base = titleEl.matches('a') ? titleEl.parentElement : titleEl;
        base.insertAdjacentElement('afterend', line);

        box.dataset.ssHasPlay = '1';
      });
    };

    return { attach };
  })();

  /* ================= BOOTSTRAP ================= */
  const BOOT = () => {
    Styles.inject();
    ProductList.attach();

    // obserwuj dynamiczne doładowania
    let t = null;
    const obs = new MutationObserver(() => {
      clearTimeout(t);
      t = setTimeout(() => ProductList.attach(), CFG.OBS_DEBOUNCE_MS);
    });
    obs.observe(document.body, { childList: true, subtree: true });

    State.hookNavigationSave();
    State.restore();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', BOOT);
  } else {
    BOOT();
  }
})();
