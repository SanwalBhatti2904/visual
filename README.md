<div align="center">

# ZENIN

**A Quieter Way Forward**

A scroll-driven cinematic website where image sequences play, expand and contract as you scroll.

[**Live Demo**](https://zeninview.netlify.app) · [**Repository**](https://github.com/SanwalBhatti2904/visual)

</div>

---

## Features

- **Scroll-scrubbed film**: three 300-frame sequences (opening, Fuji, village) painted to canvas
- **Shape-shifting frame**: the viewport morphs from fullscreen to 9:16 portrait to 21:9 ultrawide
- **Smooth motion**: Lenis scrolling with GSAP ScrollTrigger parallax and reveals
- **Full preloader**: every frame and image is loaded before the experience begins
- **Image carousel**: eight full-bleed scenes with parallax
- **Responsive**: works on desktop and mobile, respects reduced motion

## Tech Stack

| Layer | Tools |
| --- | --- |
| Core | HTML, CSS, Vanilla JavaScript |
| Rendering | Canvas 2D |
| Scroll & motion | Lenis 1.1.20, GSAP 3.12.5, ScrollTrigger |
| Hosting | Netlify |

## Project Structure

```
├── index.html
├── style.css  fuji.css  village.css
├── preload.js     # loads all frames + images
├── smooth.js      # Lenis + GSAP setup
├── script.js      # opening sequence
├── fuji.js        # Fuji sequence
├── village.js     # village sequence + carousel
├── frames/  fuji/  village/   # 300 frames each
└── assets/        # carousel images (img1–img8)
```

## Run Locally

```bash
git clone https://github.com/SanwalBhatti2904/visual.git
cd visual
npx serve
```

Then open the local URL shown in your terminal. Use a local server rather than opening `index.html` directly, so the frames load correctly.

## Configuration

Tweak behaviour at the top of each script:

- `preload.js`: set `loadEverything` to `false` for a faster reveal (frames stream in behind)
- `fuji.js`: adjust `phases`, `geometry` and `runway` to change pacing and shape
- `smooth.js`: change Lenis `duration` for longer or shorter scroll glide

---

<div align="center">

Made by [Sanwal Bhatti](https://github.com/SanwalBhatti2904)

</div>