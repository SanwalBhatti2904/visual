/* ==========================================================================
   ZENIN — preload orchestrator
   Loads every frame from every sequence, plus the carousel imagery, before
   the experience reveals itself. One loader, one progress bar, no surprises.
   ========================================================================== */

(() => {
    'use strict';

    /* ------------------------------------------------------------------------
       Configuration
       ------------------------------------------------------------------------ */

    const CONFIG = {
        sequences: {
            frames: { count: 300, dir: 'frames/', prefix: 'ezgif-frame-', ext: '.jpg', pad: 3 },
            fuji: { count: 300, dir: 'fuji/', prefix: 'ezgif-frame-', ext: '.jpg', pad: 3 },
            village: { count: 300, dir: 'village/', prefix: 'ezgif-frame-', ext: '.jpg', pad: 3 },
        },

        carousel: [
            'assets/img1.jpg',
            'assets/img2.jpg',
            'assets/img3.jpg',
            'assets/img4.jpg',
            'assets/img5.jpg',
            'assets/img6.jpg',
            'assets/img7.jpg',
            'assets/img8.jpg',
        ],

        concurrency: 8,

        // First N frames of every sequence are queued first so the very first
        // paint has real imagery. Doesn't affect the block-until-loaded
        // behaviour — everything still needs to complete before reveal.
        firstPaintPerSequence: 4,

        // ----------------------------------------------------------------
        // loadEverything: true  → wait for ALL 900+ frames before revealing.
        //                        Smoothest possible experience. Slow on
        //                        mobile / slow connections.
        //
        // loadEverything: false → wait only for the priority batch (~24 frames
        //                        plus the 8 carousel images), then stream the
        //                        rest in behind. Reveal feels instant.
        // ----------------------------------------------------------------
        loadEverything: true,
    };

    /* ------------------------------------------------------------------------
       Shared image store — every consuming module reads from here.
       ------------------------------------------------------------------------ */

    const images = {
        frames: new Array(CONFIG.sequences.frames.count).fill(null),
        fuji: new Array(CONFIG.sequences.fuji.count).fill(null),
        village: new Array(CONFIG.sequences.village.count).fill(null),
        carousel: new Array(CONFIG.carousel.length).fill(null),
    };

    window.__zeninImages = images;

    /* ------------------------------------------------------------------------
       Progress tracker
       ------------------------------------------------------------------------ */

    const total =
        CONFIG.sequences.frames.count +
        CONFIG.sequences.fuji.count +
        CONFIG.sequences.village.count +
        CONFIG.carousel.length;

    const tracker = (() => {
        let loaded = 0;
        let complete = false;
        const progressCbs = [];
        const completeCbs = [];

        return {
            get total() { return total; },
            get loaded() { return loaded; },
            get complete() { return complete; },
            get progress() { return total > 0 ? loaded / total : 1; },

            tick() {
                loaded++;
                const p = total > 0 ? loaded / total : 1;

                for (let i = 0; i < progressCbs.length; i++) {
                    try { progressCbs[i](p, loaded, total); } catch (_) { }
                }

                if (loaded >= total && !complete) {
                    complete = true;
                    for (let i = 0; i < completeCbs.length; i++) {
                        try { completeCbs[i](); } catch (_) { }
                    }
                }
            },

            onProgress(cb) {
                progressCbs.push(cb);
                // Fire immediately with current state so late subscribers catch up.
                try { cb(this.progress, loaded, total); } catch (_) { }
            },

            onComplete(cb) {
                if (complete) { try { cb(); } catch (_) { } }
                else completeCbs.push(cb);
            },
        };
    })();

    window.__zeninPreload = tracker;

    /* ------------------------------------------------------------------------
       Loading primitives
       ------------------------------------------------------------------------ */

    const frameUrl = (spec, i) =>
        spec.dir + spec.prefix + String(i + 1).padStart(spec.pad, '0') + spec.ext;

    function loadImage(src) {
        return new Promise((resolve) => {
            const img = new Image();
            img.decoding = 'async';
            img.onload = () => resolve(img);
            img.onerror = () => resolve(null);   // missing frame never blocks the site
            img.src = src;
        });
    }

    async function loadInto(store, index, src) {
        const img = await loadImage(src);
        store[index] = img;
        tracker.tick();
    }

    function runPool(tasks, concurrency) {
        return new Promise((resolve) => {
            const n = tasks.length;
            if (!n) return resolve();

            let cursor = 0;
            let active = 0;
            let done = 0;

            const pump = () => {
                while (active < concurrency && cursor < n) {
                    const task = tasks[cursor++];
                    active++;
                    task().then(() => {
                        active--;
                        done++;
                        if (done === n) resolve();
                        else pump();
                    });
                }
            };

            pump();
        });
    }

    /* ------------------------------------------------------------------------
       Task list
       ------------------------------------------------------------------------ */

    function buildTaskList() {
        const priority = [];
        const rest = [];

        for (const key of Object.keys(CONFIG.sequences)) {
            const spec = CONFIG.sequences[key];
            const store = images[key];
            const firstN = CONFIG.firstPaintPerSequence;

            for (let i = 0; i < spec.count; i++) {
                const idx = i;
                const src = frameUrl(spec, idx);
                const task = () => loadInto(store, idx, src);
                if (idx < firstN) priority.push(task);
                else rest.push(task);
            }
        }

        for (let i = 0; i < CONFIG.carousel.length; i++) {
            const idx = i;
            const src = CONFIG.carousel[idx];
            priority.push(() => loadInto(images.carousel, idx, src));
        }

        return { priority, rest };
    }

    /* ------------------------------------------------------------------------
       Start
       ------------------------------------------------------------------------ */

    function start() {
        const { priority, rest } = buildTaskList();

        runPool(priority, CONFIG.concurrency).then(() => {
            if (CONFIG.loadEverything) {
                // Full block: don't let `complete` fire until every image is in.
                runPool(rest, CONFIG.concurrency);
            } else {
                // Fast reveal: mark the tail as loaded-immediately so `complete`
                // fires now, and let the rest stream in silently.
                const remaining = rest.length;
                for (let i = 0; i < remaining; i++) tracker.tick();
                runPool(rest, CONFIG.concurrency);
            }
        });
    }

    window.__zeninStartPreload = start;

    // Auto-start once the document has finished parsing. Every consuming
    // module (script.js, fuji.js, village.js) will have run its top-level
    // code and attached listeners before the first image onload fires.
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
        start();
    }

})();