# Calligraphy Sheet Generator — Vite + PWA + SVG Vector + Learning Loop + Dual-track PDF

> **A Type, A Trace** — Generate printable calligraphy practice sheets with Pinyin, word associations, and stroke decomposition. Supports vector PDF output.
> TRAE AI Creativity Contest entry | Evolved from "calligraphy tool" to "Chinese character learning platform"
> Live demo: https://lcfactorization.github.io/calligraphy-sheet-generator/

**English** | [中文](./README.md)

---

## Overview

**Calligraphy Sheet Generator** is a Vite-engineered PWA single-page application. Enter Chinese characters and automatically generate traceable practice sheets with Pinyin annotations, word associations, and stroke decomposition. Supports vector PDF export via three tracks: browser native print, jsPDF/svg2pdf, and Puppeteer.

This project is an entry in the [TRAE AI Creativity Contest](https://forum.trae.cn/t/topic/71664) (Learning & Productivity track), developed entirely with **Trae CN IDE** AI-assisted multi-agent coding.

## Key Features

| Feature | Description | Since |
|---------|-------------|-------|
| Smart Practice Sheets | Generate SVG vector grid sheets with Pinyin (tone marks included) | v1.0 |
| Word Associations | Built-in dictionary + cnchar fallback | v1.0 |
| Stroke Decomposition | SVG stroke breakdown powered by Hanzi Writer | v1.0 |
| Vector PDF Export | Three tracks: browser print + jsPDF/svg2pdf + Puppeteer | v1.0/v2.4 |
| 5 Open-Source Fonts | 4 Chinese fonts (LXGW WenKai/Light, Source Han Serif, TW-Kai) + 1 Pinyin font | v2.0 |
| 5 Grid Types | Tian / Mizi / Jiugong / Hui / Pinyin-Tian | v2.4/v2.5.3 |
| 4 Color Presets | Traditional Green / Cinnabar Red / Indigo Blue / Ink Black | v2.5.3 |
| Dark Mode | CSS variables, auto inverted color for SVG chars in dark mode | v1.0/v2.9.7 |
| PWA Offline | Installable, Service Worker cache, fully offline | v2.0 |
| Vite Engineering | ES Module + Tailwind CSS v4 + single-file build | v2.0 |
| Learning Loop | History / Settings Center / Difficulty / Templates / Vocabulary / Report | v2.1 |
| File Import | txt/md/csv/xlsx/docx | v2.2 |
| Smart Recommender | Offline rule-based, by difficulty/topic/scenario | v2.2 |
| Mobile Onboarding | 9-step first-use guide + scroll hints | v2.9.5/v2.9.7 |
| Desktop FAB Drag | Pointer Events + 8px grid snap + localStorage | v2.9.5 |
| Mobile Print Fix | Hidden iframe static document architecture | v2.9.0 |
| MatePad Adapted | HarmonyOS print PDF multi-round fixes | v2.8 |
| Stroke Order Demo | Click char grid to popup stroke-by-stroke animation, 9574 offline chars + HanziWriter dual-layer + play/pause + speed | v2.9.8 |

## Quick Start

### Method 1: Online (Recommended)

Visit https://lcfactorization.github.io/calligraphy-sheet-generator/
- PWA installable to desktop/mobile home screen
- Works offline after first load
- 16-step onboarding on first visit (v2.9.8)

### Method 2: Local Development

```bash
npm install
npm run dev          # http://localhost:3000
```

### Method 3: Build & Preview

```bash
npm run build        # build to dist/
npm run preview      # preview at http://localhost:4173
```

### Method 4: Puppeteer Vector PDF (Desktop)

1. Install [Node.js](https://nodejs.org/) v18+
2. Run `npm install` in the project directory
3. Double-click `启动Puppeteer.bat` (Windows) or `./启动Puppeteer.sh` (macOS/Linux)
4. Browser opens automatically, click the purple Puppeteer button for one-click vector PDF

## Project Structure

```
calligraphy-sheet-generator/
├── index.html               # Vite entry HTML (dual-column layout + FABs + input panel)
├── vite.config.js           # Vite config (PWA + SingleFile + Tailwind, cssMinify:false)
├── package.json             # Dependencies (v2.9.8, ES Module)
├── puppeteer-pdf.cjs        # Puppeteer vector PDF CLI script (CommonJS)
├── puppeteer-server.cjs     # Puppeteer HTTP server (/health + /api/generate-pdf + static dist)
├── matepad-simulate.cjs     # MatePad print simulation test script
├── 启动Puppeteer.bat/.ps1/.sh # Cross-platform launch scripts (3-step check)
├── 字帖生成器.html          # Legacy standalone HTML (contest initial version, kept for history)
├── README.md / README_EN.md # Chinese/English main docs
├── README_contest.md        # Original contest doc + iteration appendix
├── CHANGELOG.md             # Version history (v1.0 → v2.9.8)
├── TASK_BOARD.md            # v2.4.0 refactor task board + evolution
├── .github/workflows/       # GitHub Pages auto-deploy (trigger: retake branch)
├── scripts/
│   └── download-fonts.sh    # CI font download script
├── public/
│   ├── icon-*.svg           # PWA icons (192/512/maskable)
│   └── fonts/               # Fonts (local dev, CI auto-downloads)
├── fonts/
│   └── texgyreadventor-regular.otf  # Pinyin font (GUST, local fallback)
└── src/
    ├── main.js              # Entry: CSS imports + module imports + event binding
    ├── contracts/           # Interface contracts (GridCellProps/GridType/RenderMode)
    ├── components/          # GridEngine.js (SVG engine) + Sidebar.js
    ├── utils/               # pdfExport.js (dual-track PDF)
    ├── data/                # customZuCi / templates / vocabulary
    ├── modules/             # 15 JS modules (fontManager/pinyin/zuci/strokes/settings/...)
    └── styles/              # 18 CSS modules
```

> **Font Policy**: The repo only includes TeX Gyre Adventor (GUST Font License) in `fonts/`. Other fonts are downloaded at CI build time via `scripts/download-fonts.sh`. All 4 Chinese fonts are open-source (SIL OFL 1.1 / ARPH). Commercial fonts were removed for license compliance.

## Built with Trae CN IDE

This project was developed through human-AI co-creation in **Trae CN IDE** with multi-agent parallel collaboration:

| Key Task | Description |
|----------|-------------|
| v2.4.0 SVG refactor | Multi-agent: Master + A(SVG engine) + B(PDF) + C(UI) + D(build/docs) |
| v2.8.x MatePad fixes | Multi-round mobile print PDF debugging |
| v2.9.0 iframe architecture | Root-fix mobile print header/footer |
| v2.9.5 swarm | 3 groups: cross-platform scripts / mobile onboarding / desktop FAB drag |
| v2.9.7 onboarding enhancement | 9-step guide + dark mode inverted color |
| v2.9.8 stroke order demo | Stroke-by-stroke animation popup + 16-step onboarding + dark/touch/mobile bug fixes |

Trae AI played a decisive role in: SVG vectorization, multi-agent coordination, cross-platform encoding, mobile print architecture, and the dual-track PDF strategy.

## Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Build | Vite 5 + vite-plugin-pwa + vite-plugin-singlefile | ES Module |
| CSS | Tailwind CSS v4 + 18 custom CSS modules | cssMinify disabled to protect print rules |
| Pinyin | [pinyin-pro](https://github.com/zh-lx/pinyin-pro) (MIT) | Automatic tone marks |
| Dictionary | [cnchar](https://github.com/theajack/cnchar) (MIT) | Word lookup |
| Strokes | [Hanzi Writer](https://github.com/chanind/hanzi-writer) (MIT) | SVG decomposition |
| PDF | `window.print()` + jsPDF/svg2pdf + Puppeteer | Triple-track |
| Fonts | FontFace API + base64 pinyin font | 5 open-source fonts |
| Themes | CSS variables + `data-theme` | Light/Dark with auto inverted color |
| AI IDE | **Trae CN IDE** | Full development lifecycle, multi-agent |

## License

- **Source code**: MIT License — free to use, modify, and distribute
- **Built-in font**: `texgyreadventor-regular.otf` — GUST Font License, freely distributable
- **CI-downloaded fonts**: 4 Chinese fonts under SIL OFL 1.1 / ARPH
- **Privacy**: Fully offline. No data uploaded anywhere.

## Contributing

Issues and Pull Requests are welcome!

---

*A character, a world. A stroke, a universe. May this small tool contribute to the teaching and preservation of Chinese calligraphy.*

*Contest link: https://forum.trae.cn/t/topic/71664*
