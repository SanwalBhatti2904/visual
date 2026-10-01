/* ==========================================================================
   ZENIN — cinematic scroll experience
   Lenis provides smoothed scroll. GSAP + ScrollTrigger provide reveals and
   parallax. This file owns the three-phase frame timeline only.
   ========================================================================== */

(() => {
  'use strict';

  /* ========================================================================
     1. CONFIG
     ======================================================================== */

  const CONFIG = {

    frames: {
      count: 300,
      dir: 'frames/',
      prefix: 'ezgif-frame-',
      ext: '.jpg',
      pad: 3,
    },

    /* --------------------------------------------------------------------
       Three clean phases, measured in viewport heights (vh).
       -------------------------------------------------------------------- */
    timeline: {
      expand: 0.7,    // A — window opens 9:16 → fullscreen. Frame stays at 001.
      play: 3.5,      // B — frames 001 → 300 play. Window is fullscreen.
      exit: 1.2,      // C — window shrinks and lifts away.
      spacer: 5.6,    // Document height of the scroll runway (≈ A+B+C).
    },

    window: {
      startAspect: 9 / 16,
      startHeight: 0.62,   // fraction of vh on first paint
      startMaxWidth: 0.78, // never wider than this fraction of vw
    },

    exit: {
      scale: 0.44,   // final size of the window (fraction of fullscreen)
      lift: 0.72,    // upward drift, in vh
    },

    render: {
      cropY: 0.5,
      maxCanvasPixels: 2_400_000,
      maxBackingWidth: 1920,
      backingStep: 64,
      // NOTE: no `smoothing` value. Lenis handles interpolation now.
    },

    preload: {
      firstBatch: 16,
      concurrency: 6,
      backgroundConcurrency: 3,
    },

    /* --------------------------------------------------------------------
       Anchor navigation. Duration scales with distance and is clamped into
       a cinematic range. The actual scrolling is delegated to Lenis.
       -------------------------------------------------------------------- */
    navigation: {
      minDuration: 1800,   // ms
      maxDuration: 6500,   // ms
      msPerPixel: 1.1,
    },
  };

  const FRAME_COUNT = CONFIG.frames.count;


  /* ========================================================================
     2. HELPERS
     ======================================================================== */

  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = (t) => t * t * (3 - 2 * t);

  const frameUrl = (i) =>
    CONFIG.frames.dir +
    CONFIG.frames.prefix +
    String(i + 1).padStart(CONFIG.frames.pad, '0') +
    CONFIG.frames.ext;


  /* ========================================================================
     3. DOM
     ======================================================================== */

  const dom = {
    body: document.body,
    loader: document.getElementById('loader'),
    loaderPct: document.getElementById('loaderPct'),
    loaderBar: document.getElementById('loaderBar'),
    nav: document.getElementById('nav'),
    frame: document.getElementById('frame'),
    canvas: document.getElementById('canvas'),
    spacer: document.getElementById('journey'),
    captions: Array.from(document.querySelectorAll('.caption')),
    intro: document.getElementById('intro'),
    year: document.getElementById('year'),
  };

  const ctx = dom.canvas.getContext('2d', { alpha: false });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';


  /* ========================================================================
     4. FRAME LOADING
     ======================================================================== */

  // Shared with preload.js. If preload.js failed to load, fall back to a
  // private array and load our own frames (see boot()).
  const images =
    (window.__zeninImages && window.__zeninImages.frames) ||
    new Array(FRAME_COUNT).fill(null);

  function loadFrame(index) {
    return new Promise((resolve) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => { images[index] = img; resolve(true); };
      img.onerror = () => resolve(false);
      img.src = frameUrl(index);
    });
  }

  function pool(indices, concurrency, onProgress) {
    return new Promise((resolve) => {
      const total = indices.length;
      if (!total) return resolve();

      let cursor = 0;
      let active = 0;
      let done = 0;

      const pump = () => {
        while (active < concurrency && cursor < total) {
          const index = indices[cursor++];
          active++;
          loadFrame(index).then(() => {
            active--;
            done++;
            if (onProgress) onProgress(done, total);
            if (done === total) resolve();
            else pump();
          });
        }
      };

      pump();
    });
  }


  /* ========================================================================
     5. LOADER
     ======================================================================== */

  let loaderPctShown = -1;

  function setLoaderProgress(value) {
    const p = clamp01(value);
    const pct = Math.round(p * 100);
    if (pct === loaderPctShown) return;
    loaderPctShown = pct;
    dom.loaderPct.textContent = pct + '%';
    dom.loaderBar.style.transform = 'scaleX(' + p + ')';
  }


  /* ========================================================================
     6. STATE
     ======================================================================== */

  const state = {
    vw: 0,
    vh: 0,
    rafId: null,
    backingW: 0,
    backingH: 0,
    paintedIndex: -1,
    anchorAnimId: null,   // only used by the fallback anchor path
  };


  /* ========================================================================
     7. LAYOUT MEASUREMENT
     ======================================================================== */

  function measure() {
    state.vw = window.innerWidth;
    state.vh = window.innerHeight;
    dom.spacer.style.height = (CONFIG.timeline.spacer * state.vh) + 'px';
  }


  /* ========================================================================
     8. RENDER — the three-phase scroll timeline
     ======================================================================== */

  function render(scroll) {
    const vw = state.vw;
    const vh = state.vh;
    if (!vw || !vh) return;

    const T = CONFIG.timeline;
    const expandPx = T.expand * vh;
    const playPx = T.play * vh;
    const exitPx = T.exit * vh;
    const playEnd = expandPx + playPx;
    const exitEnd = playEnd + exitPx;

    /* ---- Starting geometry (9:16 portrait window) ----------------------- */
    let startH = CONFIG.window.startHeight * vh;
    const startWLimit = CONFIG.window.startMaxWidth * vw;
    if (startH * CONFIG.window.startAspect > startWLimit) {
      startH = startWLimit / CONFIG.window.startAspect;
    }
    const startW = startH * CONFIG.window.startAspect;

    /* ---- Resolve phase -------------------------------------------------- */
    let width, height, frameIndex, lift;

    if (scroll <= expandPx) {

      /* ---------- PHASE A — EXPAND ------------------------------------- */
      const t = ease(clamp01(scroll / expandPx));
      width = lerp(startW, vw, t);
      height = lerp(startH, vh, t);
      frameIndex = 0;
      lift = 0;

    } else if (scroll <= playEnd) {

      /* ---------- PHASE B — PLAY --------------------------------------- */
      width = vw;
      height = vh;
      const t = clamp01((scroll - expandPx) / playPx);
      frameIndex = Math.round(t * (FRAME_COUNT - 1));
      lift = 0;

    } else {

      /* ---------- PHASE C — EXIT --------------------------------------- */
      const t = clamp01((scroll - playEnd) / exitPx);
      const e = ease(t);

      const scale = lerp(1, CONFIG.exit.scale, e);
      width = vw * scale;
      height = vh * scale;
      frameIndex = FRAME_COUNT - 1;
      lift = lerp(0, CONFIG.exit.lift * vh, e);

      lift += Math.max(0, scroll - exitEnd) * 0.6;
    }

    /* ---- Apply ---------------------------------------------------------- */
    const fs = dom.frame.style;
    fs.width = width.toFixed(2) + 'px';
    fs.height = height.toFixed(2) + 'px';
    fs.transform =
      'translate3d(-50%, -50%, 0) translate3d(0, ' + (-lift).toFixed(2) + 'px, 0)';

    paint(frameIndex, width, height);
    updateCaptions(scroll, vh);
    updateIntro(scroll, vh);

    dom.nav.classList.toggle('is-scrolled', scroll > 40);
  }


  /* ========================================================================
     9. CANVAS PAINT — cover-fit, aspect-preserving
     ======================================================================== */

  function paint(index, cssW, cssH) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const step = CONFIG.render.backingStep;

    let bw = Math.max(step, Math.round((cssW * dpr) / step) * step);
    bw = Math.min(bw, CONFIG.render.maxBackingWidth);

    const aspect = cssW / cssH;
    let bh = Math.max(step, Math.round((bw / aspect) / step) * step);

    const pixels = bw * bh;
    if (pixels > CONFIG.render.maxCanvasPixels) {
      const k = Math.sqrt(CONFIG.render.maxCanvasPixels / pixels);
      bw = Math.max(step, Math.round((bw * k) / step) * step);
      bh = Math.max(step, Math.round((bh * k) / step) * step);
    }

    const sizeChanged = bw !== state.backingW || bh !== state.backingH;
    const frameChanged = index !== state.paintedIndex;
    if (!sizeChanged && !frameChanged) return;

    const img = images[index];
    if (!img) return;

    if (sizeChanged) {
      dom.canvas.width = bw;
      dom.canvas.height = bh;
      state.backingW = bw;
      state.backingH = bh;
    }

    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    if (!iw || !ih) return;

    const scale = Math.max(bw / iw, bh / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    const dx = (bw - dw) / 2;
    const dy = (bh - dh) * CONFIG.render.cropY;

    ctx.drawImage(img, dx, dy, dw, dh);
    state.paintedIndex = index;
  }


  /* ========================================================================
     10. CAPTIONS
     ======================================================================== */

  function updateCaptions(scroll, vh) {
    const p = scroll / vh;

    for (const el of dom.captions) {
      const start = parseFloat(el.dataset.start);
      const end = parseFloat(el.dataset.end);
      const fade = Math.max(0.2, (end - start) * 0.35);

      let opacity = 0;
      if (p > start && p < end) {
        if (p < start + fade) opacity = (p - start) / fade;
        else if (p > end - fade) opacity = (end - p) / fade;
        else opacity = 1;
      }
      opacity = clamp01(opacity);

      const prev = parseFloat(el.dataset.o || '-1');
      if (Math.abs(prev - opacity) < 0.005) continue;

      el.dataset.o = opacity;
      el.style.opacity = opacity;
      el.style.transform =
        'translate3d(-50%, ' + ((1 - opacity) * 14).toFixed(1) + 'px, 0)';
    }
  }


  /* ========================================================================
     10b. INTRO FADE
     ======================================================================== */

  let introOpacity = 1;

  function updateIntro(scroll, vh) {
    if (!dom.intro) return;

    const expandPx = CONFIG.timeline.expand * vh;
    const t = clamp01(scroll / expandPx);

    const f = clamp01((t - 0.10) / 0.60);
    const opacity = 1 - ease(f);

    if (Math.abs(opacity - introOpacity) < 0.005) return;
    introOpacity = opacity;

    dom.intro.style.opacity = opacity;
    dom.intro.classList.toggle('is-hidden', opacity < 0.02);
  }


  /* ========================================================================
     11. SCROLL LOOP
     ========================================================================
       Lenis writes a smoothed value into window.scrollY on every frame and
       fires a `scroll` event. So we simply read it — no internal lerp.
     ====================================================================== */

  function requestTick() {
    if (state.rafId === null) {
      state.rafId = requestAnimationFrame(tick);
    }
  }

  function tick() {
    state.rafId = null;
    render(window.scrollY);
  }


  /* ========================================================================
     12. EVENTS
     ======================================================================== */

  window.addEventListener('scroll', requestTick, { passive: true });

  let resizeTimer = null;
  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      measure();
      state.paintedIndex = -1;
      state.backingW = 0;
      state.backingH = 0;
      render(window.scrollY);
      // Ask GSAP to re-measure trigger positions after the layout change.
      if (window.ScrollTrigger) window.ScrollTrigger.refresh();
    }, 120);
  }

  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);


  /* ========================================================================
     12b. ANCHOR NAVIGATION
     ========================================================================
       Delegated to Lenis when it's available. Falls back to a manual rAF
       loop otherwise, so the site still works without the CDN.
     ====================================================================== */

  function cancelAnchorScroll() {
    if (state.anchorAnimId !== null) {
      cancelAnimationFrame(state.anchorAnimId);
      state.anchorAnimId = null;
    }
  }

  function cinematicScrollTo(targetY) {
    const nav = CONFIG.navigation;
    const distance = Math.abs(targetY - window.scrollY);
    const raw = distance * nav.msPerPixel;
    const durationMs = Math.min(nav.maxDuration, Math.max(nav.minDuration, raw));

    /* ---------- Lenis path (preferred) --------------------------------- */
    if (window.__lenis) {
      window.__lenis.scrollTo(targetY, {
        duration: durationMs / 1000,   // Lenis uses seconds
        easing: ease,
      });
      return;
    }

    /* ---------- Fallback: manual rAF loop ------------------------------ */
    cancelAnchorScroll();

    const startY = window.scrollY;
    const delta = targetY - startY;
    if (Math.abs(delta) < 2) return;

    const startTime = performance.now();

    const step = (now) => {
      const t = clamp01((now - startTime) / durationMs);
      window.scrollTo(0, startY + delta * ease(t));
      if (t < 1) {
        state.anchorAnimId = requestAnimationFrame(step);
      } else {
        state.anchorAnimId = null;
      }
    };

    state.anchorAnimId = requestAnimationFrame(step);
  }

  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

    const link = e.target.closest('a[href^="#"]');
    if (!link) return;

    const hash = link.getAttribute('href');
    if (!hash || hash === '#') return;

    const target = document.querySelector(hash);
    if (!target) return;

    e.preventDefault();

    const rect = target.getBoundingClientRect();
    const targetY = rect.top + window.scrollY;

    cinematicScrollTo(targetY);

    if (history.replaceState) {
      history.replaceState(null, '', hash);
    }
  });

  // Interrupt the fallback rAF loop on user input. Lenis handles its own
  // interruption internally when it's driving the scroll.
  ['wheel', 'touchstart', 'keydown'].forEach((ev) => {
    window.addEventListener(ev, cancelAnchorScroll, { passive: true });
  });


  /* ========================================================================
     13. REVEALS
     ========================================================================
       If smooth.js has already installed GSAP reveals (window.__gsapReveals
       === true), this function steps aside completely.
     ====================================================================== */

  function initReveals() {
    if (window.__gsapReveals) return;

    const items = document.querySelectorAll('[data-reveal]');

    if (!('IntersectionObserver' in window)) {
      items.forEach((el) => el.classList.add('is-visible'));
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        });
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.08 }
    );

    items.forEach((el) => io.observe(el));
  }


  /* ========================================================================
     14. BOOT
     ======================================================================== */

  async function boot() {
    const started = performance.now();
    const preload = window.__zeninPreload;

    if (preload && window.__zeninImages) {
      // -------- New path — wait for the shared orchestrator ----------
      preload.onProgress((p) => setLoaderProgress(p));
      // onProgress fires immediately on subscribe, so the loader jumps
      // straight to the real current percentage.

      await new Promise((resolve) => preload.onComplete(resolve));
    } else {
      // -------- Fallback — load our own first batch ------------------
      const firstBatch = Math.min(CONFIG.preload.firstBatch, FRAME_COUNT);
      const head = [];
      for (let i = 0; i < firstBatch; i++) head.push(i);

      await pool(head, CONFIG.preload.concurrency, (done, total) => {
        setLoaderProgress(done / total);
      });

      const tail = [];
      for (let i = firstBatch; i < FRAME_COUNT; i++) tail.push(i);
      pool(tail, CONFIG.preload.backgroundConcurrency);
    }

    // Ensure the loader doesn't flash on very fast connections.
    const elapsed = performance.now() - started;
    const minimum = 600;
    if (elapsed < minimum) {
      await new Promise((r) => setTimeout(r, minimum - elapsed));
    }

    reveal();
  }

  function reveal() {
    dom.body.classList.remove('is-loading');
    dom.loader.classList.add('is-done');

    measure();
    state.paintedIndex = -1;
    state.backingW = 0;
    state.backingH = 0;

    render(window.scrollY);
    requestTick();
  }

  function init() {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    window.scrollTo(0, 0);

    if (dom.year) dom.year.textContent = String(new Date().getFullYear());

    measure();
    render(0);
    initReveals();
    boot();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

})();