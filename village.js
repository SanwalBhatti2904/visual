/* ==========================================================================
   VILLAGE — the settling in. Third movement.
   Portrait → ultrawide → photograph, then a scroll-driven carousel.
   Reads window.scrollY directly (Lenis provides the smoothing).
   ========================================================================== */

(() => {
    'use strict';

    /* ========================================================================
       1. CONFIG
       ======================================================================== */

    const CONFIG = {

        frames: {
            count: 300,
            dir: 'village/',
            prefix: 'ezgif-frame-',
            ext: '.jpg',
            pad: 3,
        },

        /* --------------------------------------------------------------------
           Four phases. Fractions of the runway's scroll progress — they sum
           to 1.
           -------------------------------------------------------------------- */
        phases: {
            hold: 0.12,       // A — small portrait window, frame 001 frozen
            open: 0.20,       // B — window opens wide (portrait → 21:9)
            play: 0.48,       // C — frames 001 → 300 play, window holds at 21:9
            settle: 0.20,     // D — window contracts gently to a 3:2 photograph
        },

        /* --------------------------------------------------------------------
           Geometry. Starts small and portrait, opens to a wide cinematic
           landscape, then settles into a photograph you could hold.
           -------------------------------------------------------------------- */
        geometry: {
            startAspect: 9 / 16,
            startHeight: 0.55,       // fraction of vh
            startMaxWidth: 0.55,     // fraction of vw (clamp, esp. on narrow)

            openAspect: 21 / 9,
            openHeight: 0.68,        // fraction of vh
            openMaxWidth: 0.94,      // fraction of vw

            endAspect: 3 / 2,
            endHeight: 0.62,         // fraction of vh
            endMaxWidth: 0.72,       // fraction of vw
        },

        /* Runway height (in vh). Bigger = slower, more contemplative. */
        runway: 5.2,

        render: {
            cropY: 0.5,
            maxCanvasPixels: 2_400_000,
            maxBackingWidth: 1920,
            backingStep: 64,
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
        runway: document.getElementById('villageRunway'),
        stage: document.getElementById('villageStage'),
        frame: document.getElementById('villageFrame'),
        canvas: document.getElementById('villageCanvas'),
        captions: Array.from(document.querySelectorAll('.village__caption')),
        eyebrow: document.querySelector('.village__eyebrow'),
        arrival: document.querySelector('.village__arrival'),
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
        (window.__zeninImages && window.__zeninImages.village) ||
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
        progress: 0,
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
       7. RENDER — the four-phase timeline
       ========================================================================
  
         Progress 0 → 1 maps across the whole runway.
  
           HOLD    p ∈ [0.00, 0.12]   small portrait window, frame 001
           OPEN    p ∈ [0.12, 0.32]   portrait → 21:9 ultrawide, frame 001
           PLAY    p ∈ [0.32, 0.80]   frames 001 → 300, still ultrawide
           SETTLE  p ∈ [0.80, 1.00]   21:9 → 3:2 photograph, frame 300
  
       ====================================================================== */

    function render(progress) {
        const vw = state.vw;
        const vh = state.vh;
        if (!vw || !vh) return;

        const P = CONFIG.phases;
        const G = CONFIG.geometry;

        const holdEnd = P.hold;
        const openEnd = P.hold + P.open;
        const playEnd = openEnd + P.play;

        /* ---- Geometry targets --------------------------------------------- */

        // Start — small portrait window
        let startH = G.startHeight * vh;
        const startWLimit = G.startMaxWidth * vw;
        if (startH * G.startAspect > startWLimit) {
            startH = startWLimit / G.startAspect;
        }
        const startW = startH * G.startAspect;

        // Open — ultrawide
        let openH = G.openHeight * vh;
        const openWLimit = G.openMaxWidth * vw;
        if (openH * G.openAspect > openWLimit) {
            openH = openWLimit / G.openAspect;
        }
        const openW = openH * G.openAspect;

        // Settle — a 3:2 photograph
        let endH = G.endHeight * vh;
        const endWLimit = G.endMaxWidth * vw;
        if (endH * G.endAspect > endWLimit) {
            endH = endWLimit / G.endAspect;
        }
        const endW = endH * G.endAspect;

        /* ---- Resolve phase ------------------------------------------------ */
        let width, height, frameIndex;

        if (progress <= holdEnd) {
            /* ---- HOLD ------------------------------------------------------ */
            width = startW;
            height = startH;
            frameIndex = 0;

        } else if (progress <= openEnd) {
            /* ---- OPEN ------------------------------------------------------ */
            // The frame widens AND the aspect changes. This is the "world
            // opening up" motion — distinct from the opening section (which
            // just scaled a single aspect) and from fuji (which just shrank).
            const t = ease(clamp01((progress - holdEnd) / P.open));
            width = lerp(startW, openW, t);
            height = lerp(startH, openH, t);
            frameIndex = 0;

        } else if (progress <= playEnd) {
            /* ---- PLAY ------------------------------------------------------ */
            width = openW;
            height = openH;
            const t = clamp01((progress - openEnd) / P.play);
            frameIndex = Math.round(t * (FRAME_COUNT - 1));

        } else {
            /* ---- SETTLE ---------------------------------------------------- */
            // Ultrawide contracts into a warm 3:2 photograph. The final
            // aspect reads as something you could pick up and hold.
            const t = ease(clamp01((progress - playEnd) / P.settle));
            width = lerp(openW, endW, t);
            height = lerp(openH, endH, t);
            frameIndex = FRAME_COUNT - 1;
        }

        /* ---- Apply --------------------------------------------------------- */
        const fs = dom.frame.style;
        fs.width = width.toFixed(2) + 'px';
        fs.height = height.toFixed(2) + 'px';

        paint(frameIndex, width, height);
        updateCaptions(progress);
        updateLabels(progress, holdEnd, openEnd, playEnd);
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
       10. LABELS
       ======================================================================== */

    function updateLabels(progress, holdEnd, openEnd, playEnd) {
        // Eyebrow — visible during HOLD, fades out as soon as OPEN begins.
        if (dom.eyebrow) {
            let o = 0;
            if (progress < holdEnd) {
                o = clamp01(progress / (holdEnd * 0.7));
            } else if (progress < openEnd) {
                const t = (progress - holdEnd) / (openEnd - holdEnd);
                o = clamp01(1 - t * 5);
            }
            const prev = parseFloat(dom.eyebrow.dataset.o || '-1');
            if (Math.abs(prev - o) > 0.005) {
                dom.eyebrow.dataset.o = o;
                dom.eyebrow.style.opacity = o;
            }
        }

        // Arrival line — fades in during the second half of SETTLE.
        if (dom.arrival) {
            let o = 0;
            const settleSpan = 1 - playEnd;
            const begin = playEnd + settleSpan * 0.55;
            if (progress > begin) {
                o = clamp01((progress - begin) / (settleSpan * 0.4));
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
       ======================================================================== */

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
       13. CAROUSEL — eight moments revealed on scroll
       ========================================================================
         Full-bleed slides arranged on a horizontal track. Scroll progress is
         mapped across the runway: slide N sits at x=0 when progress reaches
         the matching fractional index, and the neighbours sit one viewport
         to either side. Inner images counter-scroll for depth.
  
         Driven by the same window.scrollY that Lenis smooths, so it feels
         identical to the rest of the site.
       ====================================================================== */

    const carousel = (() => {
        const runway = document.getElementById('villageCarouselRunway');
        const slidesWrap = document.getElementById('villageSlides');
        const countEl = document.getElementById('villageCount');
        const barEl = document.getElementById('villageBar');

        if (!runway || !slidesWrap) return null;

        const slides = Array.from(slidesWrap.querySelectorAll('.slide'));
        const N = slides.length;
        if (!N) return null;

        const imgs = slides.map((s) => s.querySelector('.slide__media img'));

        const CFG = {
            // Total runway height in vh. 1.15 per transition × 7 transitions + entry
            // padding. Raise the multiplier to slow the whole thing down.
            runwayVh: 1.15 * (N - 1) + 1.4,
            span: N - 1,
            // Media counter-scroll factor. 0 = image locked to slide, 0.3 = strong.
            parallax: 0.15,
            // How much off-centre slides shrink.
            maxScale: 0.06,
            // Cull slides whose |offset| exceeds this (in vw).
            cullAt: 130,
        };

        const s = {
            runwayTop: 0,
            runwayRange: 1,
            rafId: null,
            lastP: -1,
        };

        function measure() {
            runway.style.height = (CFG.runwayVh * window.innerHeight) + 'px';
            const rect = runway.getBoundingClientRect();
            s.runwayTop = rect.top + window.scrollY;
            s.runwayRange = Math.max(1, runway.offsetHeight - window.innerHeight);
        }

        function render() {
            const p = clamp01((window.scrollY - s.runwayTop) / s.runwayRange);

            // Skip work if the position barely moved.
            if (Math.abs(p - s.lastP) < 0.00008) return;
            s.lastP = p;

            const slideProgress = p * CFG.span;

            for (let i = 0; i < N; i++) {
                const offset = (i - slideProgress) * 100;   // vw
                const abs = Math.abs(offset);

                // Visibility cull — far slides cost nothing.
                if (abs > CFG.cullAt) {
                    if (slides[i].dataset.on !== '0') {
                        slides[i].style.visibility = 'hidden';
                        slides[i].dataset.on = '0';
                    }
                    continue;
                }
                if (slides[i].dataset.on !== '1') {
                    slides[i].style.visibility = 'visible';
                    slides[i].dataset.on = '1';
                }

                const scale = 1 - Math.min(1, abs / 100) * CFG.maxScale;

                slides[i].style.transform =
                    'translate3d(' + offset.toFixed(2) + 'vw, 0, 0) scale(' +
                    scale.toFixed(4) + ')';

                const img = imgs[i];
                if (img) {
                    // Image drifts the opposite direction at a fraction of the slide's
                    // travel. Combined with the 1.4 base scale, edges never show.
                    img.style.transform =
                        'translate3d(' + (-offset * CFG.parallax).toFixed(2) +
                        'vw, 0, 0) scale(1.4)';
                }
            }

            // Progress UI
            const active = Math.round(slideProgress);
            if (countEl) {
                countEl.textContent =
                    String(active + 1).padStart(2, '0') + ' / ' +
                    String(N).padStart(2, '0');
            }
            if (barEl) {
                barEl.style.transform = 'scaleX(' + p.toFixed(4) + ')';
            }
        }

        function requestTick() {
            if (s.rafId === null) s.rafId = requestAnimationFrame(tick);
        }

        function tick() {
            s.rafId = null;
            render();
        }

        function init() {
            measure();
            s.lastP = -1;
            render();

            window.addEventListener('scroll', requestTick, { passive: true });

            let resizeT = null;
            window.addEventListener('resize', () => {
                clearTimeout(resizeT);
                resizeT = setTimeout(() => {
                    measure();
                    s.lastP = -1;
                    requestTick();
                    if (window.ScrollTrigger) window.ScrollTrigger.refresh();
                }, 120);
            }, { passive: true });
        }

        return { init };
    })();


    /* ========================================================================
       14. BOOT
       ======================================================================== */

    function boot() {
        measure();
        updateProgress();
        render(state.progress);

        const preload = window.__zeninPreload;

        if (preload && window.__zeninImages) {
            // Repaint once the shared preload finishes.
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

        // Attach the carousel after one frame so layout has settled.
        requestAnimationFrame(() => {
            if (carousel) carousel.init();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot, { once: true });
    } else {
        boot();
    }

})();