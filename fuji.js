/* ==========================================================================
   FUJI — reverse cinematic journey
   Fullscreen (with breathing room) contracts down to a 9:16 portrait window.
   Lenis provides smoothed scroll; this file only reads window.scrollY.
   ========================================================================== */

(() => {
  'use strict';

  /* ========================================================================
     1. CONFIG
     ======================================================================== */

  const CONFIG = {

    frames: {
      count: 300,
      dir: 'fuji/',
      prefix: 'ezgif-frame-',
      ext: '.jpg',
      pad: 3,
    },

    /* --------------------------------------------------------------------
       Three phases, expressed as fractions of the runway's scroll progress.
       Fractions sum to 1.
       -------------------------------------------------------------------- */
    phases: {
      hold: 0.18,       // A — fullscreen-with-margin, frame 001 frozen
      play: 0.62,       // B — frames 001 → 300 play, still fullscreen
      contract: 0.20,   // C — frame 300, container contracts to 9:16
    },

    /* --------------------------------------------------------------------
       Geometry. The frame starts slightly inset (breathing room on all
       sides) and ends as a 9:16 portrait window, mirroring the opening
       section of the site.
       -------------------------------------------------------------------- */
    geometry: {
      startInsetX: 0.94,   // start width  = startInsetX × vw
      startInsetY: 0.86,   // start height = startInsetY × vh
      endAspect: 9 / 16,
      endHeight: 0.62,     // end height as fraction of vh
      endMaxWidth: 0.78,   // never wider than this fraction of vw
    },

    /* Runway height (in vh) — the scroll distance the sticky stage stays
       pinned for. Bigger = slower, more contemplative. */
    runway: 5.6,

    render: {
      cropY: 0.5,
      maxCanvasPixels: 2_400_000,
      maxBackingWidth: 1920,
      backingStep: 64,
      // NOTE: no `smoothing` value. Lenis handles interpolation.
    },

    preload: {
      firstBatch: 16,
      concurrency: 6,
      backgroundConcurrency: 3,
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
    runway: document.getElementById('fujiRunway'),
    stage: document.getElementById('fujiStage'),
    frame: document.getElementById('fujiFrame'),
    canvas: document.getElementById('fujiCanvas'),
    captions: Array.from(document.querySelectorAll('.fuji__caption')),
    eyebrow: document.querySelector('.fuji__eyebrow'),
    arrival: document.querySelector('.fuji__arrival'),
  };

  // Section is optional — bail silently if it isn't on the page.
  if (!dom.runway || !dom.frame || !dom.canvas) return;

  const ctx = dom.canvas.getContext('2d', { alpha: false });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';


  /* ========================================================================
     4. FRAME LOADING
     ======================================================================== */

  // Shared with preload.js — fall back to a private array if it's absent.
  const images =
    (window.__zeninImages && window.__zeninImages.fuji) ||
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

  function pool(indices, concurrency) {
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
            if (done === total) resolve();
            else pump();
          });
        }
      };

      pump();
    });
  }


  /* ========================================================================
     5. STATE
     ======================================================================== */

  const state = {
    vw: 0,
    vh: 0,
    runwayTop: 0,
    runwayRange: 1,
    progress: 0,           // current 0..1 progress, recomputed each frame
    rafId: null,
    backingW: 0,
    backingH: 0,
    paintedIndex: -1,
  };


  /* ========================================================================
     6. LAYOUT
     ======================================================================== */

  function measure() {
    state.vw = window.innerWidth;
    state.vh = window.innerHeight;

    dom.runway.style.height = (CONFIG.runway * state.vh) + 'px';

    const rect = dom.runway.getBoundingClientRect();
    state.runwayTop = rect.top + window.scrollY;
    state.runwayRange = Math.max(1, dom.runway.offsetHeight - state.vh);
  }

  function updateProgress() {
    const y = window.scrollY;
    state.progress = clamp01((y - state.runwayTop) / state.runwayRange);
  }


  /* ========================================================================
     7. RENDER
     ========================================================================

       Progress 0 → 1 maps across the whole runway.

         HOLD      p ∈ [0.00, 0.18]   fullscreen-with-margin, frame 001
         PLAY      p ∈ [0.18, 0.80]   frames 001 → 300, still fullscreen
         CONTRACT  p ∈ [0.80, 1.00]   frame 300, shrinks to 9:16 portrait

     ====================================================================== */

  function render(progress) {
    const vw = state.vw;
    const vh = state.vh;
    if (!vw || !vh) return;

    const P = CONFIG.phases;
    const G = CONFIG.geometry;

    const holdEnd = P.hold;
    const playEnd = P.hold + P.play;

    /* ---- Geometry targets --------------------------------------------- */
    const fullW = vw * G.startInsetX;
    const fullH = vh * G.startInsetY;

    let endH = G.endHeight * vh;
    const endWMax = vw * G.endMaxWidth;
    if (endH * G.endAspect > endWMax) endH = endWMax / G.endAspect;
    const endW = endH * G.endAspect;

    /* ---- Resolve phase ------------------------------------------------ */
    let width, height, frameIndex;

    if (progress <= holdEnd) {
      /* ---- HOLD ------------------------------------------------------ */
      width = fullW;
      height = fullH;
      frameIndex = 0;

    } else if (progress <= playEnd) {
      /* ---- PLAY ------------------------------------------------------ */
      width = fullW;
      height = fullH;
      const t = clamp01((progress - holdEnd) / P.play);
      frameIndex = Math.round(t * (FRAME_COUNT - 1));

    } else {
      /* ---- CONTRACT -------------------------------------------------- */
      const t = clamp01((progress - playEnd) / P.contract);
      const e = ease(t);
      width = lerp(fullW, endW, e);
      height = lerp(fullH, endH, e);
      frameIndex = FRAME_COUNT - 1;
    }

    /* ---- Apply --------------------------------------------------------- */
    const fs = dom.frame.style;
    fs.width = width.toFixed(2) + 'px';
    fs.height = height.toFixed(2) + 'px';

    paint(frameIndex, width, height);
    updateCaptions(progress);
    updateLabels(progress, holdEnd, playEnd);
  }


  /* ========================================================================
     8. PAINT — cover-fit, aspect-preserving
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
     9. CAPTIONS
     ======================================================================== */

  function updateCaptions(progress) {
    for (const el of dom.captions) {
      const start = parseFloat(el.dataset.start);
      const end = parseFloat(el.dataset.end);
      const fade = Math.max(0.05, (end - start) * 0.35);

      let o = 0;
      if (progress > start && progress < end) {
        if (progress < start + fade) o = (progress - start) / fade;
        else if (progress > end - fade) o = (end - progress) / fade;
        else o = 1;
      }
      o = clamp01(o);

      const prev = parseFloat(el.dataset.o || '-1');
      if (Math.abs(prev - o) < 0.005) continue;

      el.dataset.o = o;
      el.style.opacity = o;
      el.style.transform =
        'translate3d(-50%, calc(-50% + ' + ((1 - o) * 16).toFixed(1) + 'px), 0)';
    }
  }


  /* ========================================================================
     10. LABELS — eyebrow and arrival line
     ======================================================================== */

  function updateLabels(progress, holdEnd, playEnd) {
    const contractSpan = 1 - playEnd;

    // Eyebrow — fades in during HOLD, out as soon as PLAY begins.
    if (dom.eyebrow) {
      let o = 0;
      if (progress < holdEnd) {
        o = clamp01(progress / (holdEnd * 0.7));
      } else if (progress < playEnd) {
        const t = (progress - holdEnd) / (playEnd - holdEnd);
        o = clamp01(1 - t * 6);
      }
      const prev = parseFloat(dom.eyebrow.dataset.o || '-1');
      if (Math.abs(prev - o) > 0.005) {
        dom.eyebrow.dataset.o = o;
        dom.eyebrow.style.opacity = o;
      }
    }

    // Arrival line — fades in during the second half of CONTRACT and stays.
    if (dom.arrival) {
      let o = 0;
      const begin = playEnd + contractSpan * 0.5;
      if (progress > begin) {
        o = clamp01((progress - begin) / (contractSpan * 0.4));
      }
      const prev = parseFloat(dom.arrival.dataset.o || '-1');
      if (Math.abs(prev - o) > 0.005) {
        dom.arrival.dataset.o = o;
        dom.arrival.style.opacity = o;
      }
    }
  }


  /* ========================================================================
     11. SCROLL LOOP
     ========================================================================
       Lenis fires a `scroll` event on every frame it moves, and writes the
       interpolated value into window.scrollY. We just read it.
     ====================================================================== */

  function requestTick() {
    if (state.rafId === null) state.rafId = requestAnimationFrame(tick);
  }

  function tick() {
    state.rafId = null;
    updateProgress();
    render(state.progress);
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
      updateProgress();
      render(state.progress);
    }, 120);
  }

  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);


  /* ========================================================================
     13. BOOT
     ======================================================================== */

  function boot() {
    measure();
    updateProgress();
    render(state.progress);

    const preload = window.__zeninPreload;

    if (preload && window.__zeninImages) {
      // Repaint once the shared preload finishes, in case frame 001
      // wasn't ready when we first rendered.
      preload.onComplete(() => {
        state.paintedIndex = -1;
        render(state.progress);
      });
    } else {
      // Fallback — load our own first batch.
      const firstBatch = Math.min(CONFIG.preload.firstBatch, FRAME_COUNT);
      const head = [];
      for (let i = 0; i < firstBatch; i++) head.push(i);

      pool(head, CONFIG.preload.concurrency).then(() => {
        state.paintedIndex = -1;
        render(state.progress);

        const tail = [];
        for (let i = firstBatch; i < FRAME_COUNT; i++) tail.push(i);
        pool(tail, CONFIG.preload.backgroundConcurrency);
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }

})();