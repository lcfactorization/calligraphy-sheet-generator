# Calligraphy Sheet Generator — Offline Chinese Character Practice Tool

> **A Type, A Trace** — Generate printable calligraphy practice sheets with Pinyin, word associations, and stroke decomposition. Supports vector PDF output.

**English** | [中文](./README.md)

---

## 🌟 Overview

**Calligraphy Sheet Generator** is a pure front-end single-page application (HTML5 + CSS3 + Vanilla JS). **Double-click the HTML file to run in your browser** — no server, no installation, no internet required. Enter Chinese characters and automatically generate traceable practice sheets with Pinyin annotations, word associations, and stroke decomposition. Supports vector PDF export via browser native print.

This project is an entry in the [TRAE AI Creativity Contest](https://forum.trae.cn/t/topic/71664) (Learning & Productivity track), developed entirely with **TRAE IDE** AI-assisted coding.

## ✨ Key Features

| Feature | Description |
|---------|-------------|
| 🖌️ **Smart Practice Sheets** | Generate traceable grid sheets with Pinyin (tone marks included) |
| 📖 **Word Associations** | Built-in 4000+ word dictionary for each character |
| ✍️ **Stroke Decomposition** | SVG stroke breakdown powered by Hanzi Writer |
| 📄 **Vector PDF Export** | Dual approach: browser print-to-PDF + Puppeteer vector PDF |
| 🖼️ **9 Calligraphy Fonts** | Support for various Chinese calligraphy fonts (user-provided) |
| 🌓 **Aurora Glass UI** | Light/Dark dual theme, auto-hide panels during print |

## 🚀 Quick Start

### Method 1: Direct Use (Recommended)

1. Download [`字帖生成器.html`](./字帖生成器.html) to your local machine
2. Double-click to open in Chrome/Edge
3. Enter Chinese characters, click "Generate"
4. Click Print button → "Save as PDF" → Save

### Method 2: One-Click Vector PDF (Windows)

1. Install [Node.js](https://nodejs.org/)
2. Run `npm install` in the project directory
3. Double-click `启动Puppeteer.bat` — browser opens automatically
4. Click the purple button for one-click vector PDF (selectable, copyable text)

## 📂 Project Structure

```
calligraphy-sheet-generator/
├── 字帖生成器.html           # Main app (standalone HTML, JS + pinyin font embedded)
├── 启动Puppeteer.bat         # Windows one-click startup script
├── 启动Puppeteer.ps1         # PowerShell startup script
├── 启动Puppeteer.sh          # Linux/macOS startup script
├── puppeteer-pdf.js          # Puppeteer vector PDF generator
├── package.json              # Node.js dependencies
├── CHANGELOG.md              # Version history
├── README_contest.md         # Original TRAE contest documentation (Chinese)
├── 字帖_2026-07-06.pdf       # Sample output PDF (10 MB)
├── .gitignore
├── README.md                 # Chinese README
├── README_EN.md              # This file
└── fonts/
    └── texgyreadventor-regular.otf  # Pinyin font (GUST Font License, freely distributable)
```

> **Font Policy**: This repo only includes TeX Gyre Adventor (GUST Font License, free to distribute).
> Other calligraphy fonts may have copyright restrictions. See [License](#-license) for details.

## 🛠️ Built with TRAE IDE

This project was developed through human-AI co-creation in **TRAE IDE**:

| Key Task | Description |
|----------|-------------|
| Standalone HTML packaging | Embedded all JS libraries into single HTML file |
| Template string fixes | Resolved escaping issues in multi-pass Python-Powershell pipeline |
| PDF vector output | Puppeteer script with font-load timing fix |
| JSON parsing defense | 3-layer protection against HTTP keep-alive request merging |

TRAE AI played a decisive role in: encoding compatibility (GBK/UTF-8 BOM), PowerShell `.bat` encoding fixes, cross-platform script generation, and the `window.print()` → Puppeteer dual-track PDF strategy.

## 📄 Sample Output

Download [`字帖_2026-07-06.pdf`](./字帖_2026-07-06.pdf) (9.8 MB) to see a generated example calligraphy sheet.

## 🧪 Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Core | HTML5 + CSS3 + Vanilla JS | Zero-dependency single page |
| Pinyin | [pinyin-pro](https://github.com/zh-lx/pinyin-pro) (MIT) | Automatic tone marks |
| Dictionary | [cnchar](https://github.com/theajack/cnchar) (MIT) | 4000+ word lookup |
| Strokes | [Hanzi Writer](https://github.com/chanind/hanzi-writer) (MIT) | SVG decomposition |
| PDF | `window.print()` + Puppeteer | Dual-track |
| Themes | CSS variables + `data-theme` | Light/Dark |
| AI IDE | **TRAE IDE** | Full development lifecycle |

## 📜 License

- **Source code**: MIT License — free to use, modify, and distribute
- **Built-in font**: `texgyreadventor-regular.otf` — GUST Font License, freely distributable
- **Commercial fonts**: Not included. Must be provided by the user.
- **Privacy**: Fully offline. No data uploaded anywhere.

### Recommended Open-Source Font Alternatives

- [Lxgw WenKai](https://github.com/lxgw/LxgwWenKai) (SIL Open Font License)
- [Source Han Serif](https://github.com/adobe-fonts/source-han-serif) (SIL Open Font License)
- [Source Han Sans](https://github.com/adobe-fonts/source-han-sans) (SIL Open Font License)

## 🤝 Contributing

Issues and Pull Requests are welcome!

---

*A character, a world. A stroke, a universe. May this small tool contribute to the teaching and preservation of Chinese calligraphy.*

*Contest link: https://forum.trae.cn/t/topic/71664*