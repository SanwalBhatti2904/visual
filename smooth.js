/* ==========================================================================
   ZENIN — smooth scroll + motion layer
   Lenis provides buttery scroll. GSAP provides ScrollTrigger parallax and
   premium reveal animations. This file is the only place where those two
   libraries meet.
   ========================================================================== */

(() => {
    'use strict';

    /* ========================================================================
       1. CONFIG
       ======================================================================== */

    const CONFIG = {

        lenis: {
            // Higher = longer glide. 1.15 feels snappy, 1.6 feels dreamy.
            duration: 1.35,
            // Exponential ease-out. Feels natural, never sluggish.
            easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
            smoothWheel: true,
            // Sync touch to native scroll — the recommended setting on iOS/Android.
            syncTouch: false,
            touchMultiplier: 1.4,
            wheelMultiplier: 1,
            // Prevent the horizontal container from ever scrolling the page.
            orientation: 'vertical',
            gestureOrientation: 'vertical',
        },

        /* --------------------------------------------------------------------
           Parallax — the "depth" layer. Each value is a total pixel or
           percentage drift across the trigger's full scroll range.
           -------------------------------------------------------------------- */
        parallax: {
            // Intro columns drift upward as the opening window expands
            introColumnLeft: -80,
            introColumnRight: -50,
            introCorner: -30,

            // Fuji hero / panel media counter-scroll inside their cards
            // (media is scaled 1.14× in CSS so these won't show edges)
            fujiMediaFrom: -6,   // yPercent
            fujiMediaTo: 6,   // yPercent

            // Closing section drifts up gently as it enters
            closingInner: -40,
        },

        /* --------------------------------------------------------------------
           Reveals — the entrance animations for [data-reveal] elements.
           -------------------------------------------------------------------- */
        reveal: {
            y: 32,
            duration: 1.1,
            ease: 'power2.out',
            start: 'top 88%',
        },
    };


    /* ========================================================================
       2. GUARDS — bail gracefully if the CDN failed
       ======================================================================== */

    const hasLenis = typeof window.Lenis === 'function';
    const hasGsap = typeof window.gsap === 'object' && !!window.gsap;

    if (!hasLenis) {
        console.warn('[ZENIN] Lenis not loaded — falling back to native scroll.');
    }
    if (!hasGsap) {
        console.warn('[ZENIN] GSAP not loaded — reveals will fall back to CSS.');
    }


    /* ========================================================================
       3. LENIS
       ======================================================================== */

    let lenis = null;

    if (hasLenis) {
        lenis = new window.Lenis({
            duration: CONFIG.lenis.duration,
            easing: CONFIG.lenis.easing,
            smoothWheel: CONFIG.lenis.smoothWheel,
            syncTouch: CONFIG.lenis.syncTouch,
            touchMultiplier: CONFIG.lenis.touchMultiplier,
            wheelMultiplier: CONFIG.lenis.wheelMultiplier,
            orientation: CONFIG.lenis.orientation,
            gestureOrientation: CONFIG.lenis.gestureOrientation,
            autoRaf: false,   // we drive the loop from GSAP's ticker below
        });

        // Expose globally so script.js can delegate anchor scrolls.
        window.__lenis = lenis;

        // Keep the CSS class in sync so styling can react if needed.
        document.documentElement.classList.add('has-lenis');
    }


    /* ========================================================================
       4. GSAP + SCROLLTRIGGER WIRING
       ======================================================================== */

    if (hasGsap && window.ScrollTrigger) {
        window.gsap.registerPlugin(window.ScrollTrigger);
    }

    // Run Lenis on the same rAF as GSAP. This is the canonical integration —
    // it guarantees scroll position and animations are always in lockstep,
    // never one frame apart.
    if (hasGsap && lenis) {
        window.gsap.ticker.add((time) => {
            lenis.raf(time * 1000);
        });
        window.gsap.ticker.lagSmoothing(0);

        lenis.on('scroll', window.ScrollTrigger.update);
    }


    /* ========================================================================
       5. TAKE OVER REVEALS
       ========================================================================
         When GSAP is available we replace the IntersectionObserver-based
         reveals in script.js with GSAP timelines. This gives us finer
         control over easing, stagger, and drift. We set a flag so
         script.js's own initReveals() skips its work.
       ====================================================================== */

    function initReveals() {
        if (!hasGsap || !window.ScrollTrigger) return;

        window.__gsapReveals = true;

        document.querySelectorAll('[data-reveal]').forEach((el) => {
            // Delay comes from the inline --d custom property (e.g. "80ms").
            const delay =
                (parseFloat(el.style.getPropertyValue('--d')) || 0) / 1000;

            window.gsap.from(el, {
                y: CONFIG.reveal.y,
                opacity: 0,
                duration: CONFIG.reveal.duration,
                delay,
                ease: CONFIG.reveal.ease,
                scrollTrigger: {
                    trigger: el,
                    start: CONFIG.reveal.start,
                    // Play once — matches the original behaviour.
                    toggleActions: 'play none none none',
                },
            });
        });
    }


    /* ========================================================================
       6. PARALLAX
       ========================================================================
         Only applied to elements that DON'T carry [data-reveal], so nothing
         fights. Targets are chosen specifically for the effect they create:
  
           • Intro columns      — depth as the opening window expands
           • Fuji media         — the card becomes a window into the frame
           • Closing inner      — a slow drift as the final statement arrives
       ====================================================================== */

    function initParallax() {
        if (!hasGsap || !window.ScrollTrigger) return;

        const gsap = window.gsap;
        const P = CONFIG.parallax;

        /* ---------- INTRO COLUMNS ---------------------------------------- */
        // Drift upward as the frame expands. Total duration is one expand
        // phase (0.7 vh) — same window used by script.js's timeline.
        const expandEnd = () => window.innerHeight * 0.7;

        const introLeft = document.querySelector('.intro__col--left');
        const introRight = document.querySelector('.intro__col--right');

        if (introLeft) {
            gsap.to(introLeft, {
                y: P.introColumnLeft,
                ease: 'none',
                scrollTrigger: {
                    trigger: document.body,
                    start: 'top top',
                    end: expandEnd,
                    scrub: 1,
                },
            });
        }

        if (introRight) {
            gsap.to(introRight, {
                y: P.introColumnRight,
                ease: 'none',
                scrollTrigger: {
                    trigger: document.body,
                    start: 'top top',
                    end: expandEnd,
                    scrub: 1,
                },
            });
        }

        document.querySelectorAll('.intro__corner').forEach((corner) => {
            gsap.to(corner, {
                y: P.introCorner,
                ease: 'none',
                scrollTrigger: {
                    trigger: document.body,
                    start: 'top top',
                    end: expandEnd,
                    scrub: 1,
                },
            });
        });

        /* ---------- FUJI HERO / PANEL MEDIA ----------------------------- */
        // The card acts like a window. As you scroll past it, the image
        // inside drifts slightly slower. The media div is CSS-scaled 1.14×
        // so the ±6% drift never exposes an edge.
        const fujiMedia = document.querySelectorAll(
            '.fuji-card--hero .fuji-card__media, .fuji-card--panel .fuji-card__media'
        );

        fujiMedia.forEach((media) => {
            gsap.fromTo(
                media,
                { yPercent: P.fujiMediaFrom },
                {
                    yPercent: P.fujiMediaTo,
                    ease: 'none',
                    scrollTrigger: {
                        trigger: media.closest('.fuji-card'),
                        start: 'top bottom',
                        end: 'bottom top',
                        scrub: 1.2,
                    },
                }
            );
        });

        /* ---------- CLOSING INNER --------------------------------------- */
        // Wraps the closing section — children still animate via reveal.
        const closingInner = document.querySelector('.closing__inner');
        if (closingInner) {
            gsap.to(closingInner, {
                y: P.closingInner,
                ease: 'none',
                scrollTrigger: {
                    trigger: '.closing',
                    start: 'top bottom',
                    end: 'bottom top',
                    scrub: 1.2,
                },
            });
        }
    }


    /* ========================================================================
       7. LOADER ENTRANCE
       ========================================================================
         Small, tasteful: the brand mark and meta line fade up when the
         page first becomes interactive. Nothing else.
       ====================================================================== */

    function initLoader() {
        if (!hasGsap) return;

        const gsap = window.gsap;
        const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

        tl.from('.loader__brand', { y: 22, opacity: 0, duration: 0.9 }, 0)
            .from('.loader__meta', { y: 10, opacity: 0, duration: 0.7 }, 0.15)
            .from('.loader__track', { scaleX: 0, opacity: 0, duration: 0.9 }, 0.2);
    }


    /* ========================================================================
       8. SMOOTH HAND-OFF AFTER LOADING
       ========================================================================
         When the main script removes the loader, we stop Lenis briefly so
         any residual momentum from the preloader can't roll the page.
         script.js reveals the page at its own pace; we just clear state.
       ====================================================================== */

    function onLoaderComplete() {
        if (!lenis) return;
        // Force the internal scroll position to match the (now visible) doc.
        lenis.resize();
        window.ScrollTrigger && window.ScrollTrigger.refresh();
    }

    // Watch for the loader's .is-done class. script.js adds it, and we
    // need a tiny delay so layout has settled before ScrollTrigger measures.
    const loaderEl = document.getElementById('loader');
    if (loaderEl && 'MutationObserver' in window) {
        const mo = new MutationObserver(() => {
            if (loaderEl.classList.contains('is-done')) {
                setTimeout(onLoaderComplete, 220);
                mo.disconnect();
            }
        });
        mo.observe(loaderEl, { attributes: true, attributeFilter: ['class'] });
    }


    /* ========================================================================
       9. BOOT
       ======================================================================== */

    function init() {
        initLoader();
        // Reveals and parallax wait a beat so the DOM (and any layout
        // measurement) has settled.
        requestAnimationFrame(() => {
            initReveals();
            initParallax();
            if (window.ScrollTrigger) window.ScrollTrigger.refresh();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }

})();