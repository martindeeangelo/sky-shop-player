<script>
/* ===== AUTO FIND MP3 (CASE-SAFE) + STICKY PLAYER + ▶/⏸ POD .product-name ===== */
(function () {
  const AUDIO_BASE = 'https://dv202.mysky-shop.pl/upload/dv202/audio/';
  if (document.getElementById('ss-sticky-player')) return;

  /* ================= HELPERS ================= */

  const deDia = (s) =>
    (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // FINALNE slugowanie – obsługuje &, nawiasy, _www, końcowe -.mp3
  const slugFromTitle = (title) => {
    let s = deDia(title);

    // usuń prefixy
    s = s.replace(/^\s*(audio|mp3|utw[oó]r|preview)\s+/i, '');

    // "&" -> spacja (NIE "and")
    s = s.replace(/&/g, ' ');

    // usuń nawiasy i apostrofy
    s = s.replace(/[()']/g, '');

    // zachowaj "_" (dla _www), reszta -> -
    s = s.replace(/[^A-Za-z0-9_]+/g, '-');

    // wymuś dokładnie "-_www"
    s = s.replace(/(^|[^-])_www/ig, '$1-_www');

    // porządki
    s = s.replace(/-+/g, '-').replace(/^-|-$/g, '');

    return s;
  };

  // sprawdzanie istnienia pliku przez Audio (bez HEAD)
  const audioUrlExists = (url, timeoutMs = 2000) =>
    new Promise((resolve) => {
      const a = new Audio();
      let done = false;

      const finish = (ok) => {
        if (done) return;
        done = true;
        a.src = '';
        resolve(ok);
      };

      const t = setTimeout(() => finish(false), timeoutMs);

      a.addEventListener('loadedmetadata', () => {
        clearTimeout(t);
        finish(true);
      }, { once: true });

      a.addEventListener('canplay', () => {
        clearTimeout(t);
        finish(true);
      }, { once: true });

      a.addEventListener('error', () => {
        clearTimeout(t);
        finish(false);
      }, { once: true });

      a.preload = 'metadata';
      a.src = url;
    });

  const resolveMp3Url = async (productTitle) => {
    const s = slugFromTitle(productTitle);

    const candidates = [
      `${AUDIO_BASE}${s}.mp3`,
      `${AUDIO_BASE}${s}-.mp3`
    ];

    for (const url of candidates) {
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

  /* ================= STICKY PLAYER ================= */

  let currentBtn = null;
  const audio = new Audio();
  audio.preload = 'none';

  const wrap = document.createElement('div');
  wrap.id = 'ss-sticky-player';
  wrap.innerHTML = `
    <div class="ss-row">
      <button id="ss-play">▶</button>
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
  const titleEl = wrap.querySelector('#ss-title');
  const range = wrap.querySelector('#ss-range');
  const timeEl = wrap.querySelector('#ss-time');

  const resetInlineButtons = () =>
    document.querySelectorAll('.ss-inline-play')
      .forEach(b => b.textContent = '▶');

  btnPlay.onclick = () => {
    if (!audio.src) return;
    if (audio.paused) {
      audio.play();
      btnPlay.textContent = '⏸';
      if (currentBtn) currentBtn.textContent = '⏸';
    } else {
      audio.pause();
      btnPlay.textContent = '▶';
      resetInlineButtons();
    }
  };

  audio.ontimeupdate = () => {
    const d = audio.duration || 0;
    const c = audio.currentTime || 0;
    range.value = d ? Math.round((c / d) * 1000) : 0;
    timeEl.textContent = `${fmt(c)} / ${fmt(d)}`;
  };

  audio.onended = () => {
    btnPlay.textContent = '▶';
    resetInlineButtons();
  };

  range.oninput = () => {
    const d = audio.duration || 0;
    if (d) audio.currentTime = (range.value / 1000) * d;
  };

  /* ================= BUTTONS POD .product-name ================= */

  const cache = new Map(); // title -> url|null

  const attach = (root = document) => {
    root.querySelectorAll('.product-name').forEach(el => {
      if (el.dataset.ssBtn === '1') return;

      const title = (el.textContent || '').trim();
      if (!title) return;

      const line = document.createElement('div');
      line.className = 'ss-playline';

      const b = document.createElement('button');
      b.className = 'ss-inline-play';
      b.textContent = '▶';

      b.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();

        // pauza
        if (currentBtn === b && !audio.paused) {
          audio.pause();
          btnPlay.textContent = '▶';
          b.textContent = '▶';
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
          setTimeout(() => b.textContent = '▶', 1200);
          return;
        }

        resetInlineButtons();
        currentBtn = b;
        audio.src = url;
        titleEl.textContent = title;
        audio.play();
        btnPlay.textContent = '⏸';
        b.textContent = '⏸';
      };

      line.appendChild(b);
      el.insertAdjacentElement('afterend', line);
      el.dataset.ssBtn = '1';
    });
  };

  // start + AJAX
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => attach());
  } else {
    attach();
  }

  new MutationObserver(m =>
    m.forEach(x => x.addedNodes.forEach(n => n.nodeType === 1 && attach(n)))
  ).observe(document.body, { childList: true, subtree: true });

})();
</script>

<style>
#ss-sticky-player{
  position:fixed;
  left:12px; right:12px; bottom:12px;
  z-index:99999;
  background:rgba(10,10,10,.92);
  border:1px solid rgba(255,255,255,.12);
  border-radius:14px;
  padding:10px 12px;
  backdrop-filter:blur(8px);
}
#ss-sticky-player .ss-row{
  display:flex;
  align-items:center;
  gap:10px;
}
#ss-play{
  width:46px; height:46px;
  background:#000; color:#fff;
  border:none; border-radius:10px;
  cursor:pointer;
}
#ss-sticky-player .ss-meta{flex:1; min-width:0;}
#ss-title{
  color:#fff; font-weight:600; font-size:13px;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
  margin-bottom:6px;
}
#ss-sticky-player .ss-bar{
  display:flex; gap:10px; align-items:center;
}
#ss-range{flex:1;}
#ss-time{
  width:84px;
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
</style>
