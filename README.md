# 字帖生成器 — 纯前端离线汉字书法练习工具

> **A Type, A Trace** — 一键生成带拼音、组词、笔画分解的描红字帖，支持矢量 PDF 输出。

[English](./README_EN.md) | **中文**

---

## 🌟 简介

**字帖生成器** 是一款纯前端单页应用（HTML5 + CSS3 + Vanilla JS），**双击 HTML 文件即可在浏览器中运行**。无需服务器、无需安装、无需联网。输入汉字后自动生成带拼音标注、组词提示、笔画分解的描红字帖，支持通过浏览器原生打印输出矢量 PDF。

本作品参加 [TRAE AI 创造力大赛](https://forum.trae.cn/t/topic/71664)（学习工作赛道），全程使用 **TRAE IDE** 的 AI 辅助编码完成。

## ✨ 核心功能

| 功能 | 说明 |
|------|------|
| 🖌️ **智能描红字帖** | 输入汉字自动生成田字格描红，支持拼音标注（含声调） |
| 📖 **组词辅助** | 内置 4000+ 词库，自动为每个汉字提供组词参考 |
| ✍️ **笔画分解** | 基于 Hanzi Writer 输出 SVG 笔画分解动画 |
| 📄 **矢量 PDF 输出** | 双轨方案：浏览器打印另存为 PDF + Puppeteer 一键矢量 PDF |
| 🖼️ **9 款书法字体** | 支持姜浩硬笔楷书、华文楷体、方正仿宋等（需自行准备） |
| 🌓 **极光毛玻璃 UI** | 日间/夜间双主题，打印时自动隐藏控制面板 |

## 🚀 快速开始

### 方式一：直接使用（推荐）

1. 下载 [`字帖生成器.html`](./字帖生成器.html) 到本地
2. 双击用 Chrome/Edge 打开
3. 输入汉字，点击"生成字帖"
4. 点击打印按钮 → 选择"另存为 PDF" → 保存

### 方式二：一键矢量 PDF（Windows）

1. 确保已安装 [Node.js](https://nodejs.org/)
2. 在目录下运行 `npm install`
3. 双击 `启动Puppeteer.bat`，浏览器自动打开
4. 点击紫色按钮一键生成矢量 PDF（文字可选可复制）

## 📂 文件结构

```
calligraphy-sheet-generator/
├── 字帖生成器.html           # 主程序（独立 HTML，JS + 拼音字体内嵌）
├── 启动Puppeteer.bat         # Windows 一键启动脚本
├── 启动Puppeteer.ps1         # PowerShell 启动脚本
├── 启动Puppeteer.sh          # Linux/macOS 启动脚本
├── puppeteer-pdf.js          # Puppeteer PDF 矢量生成脚本
├── package.json              # Node.js 依赖配置
├── CHANGELOG.md              # 更新日志
├── README_contest.md         # TRAE 大赛原始参赛文档
├── 字帖_2026-07-06.pdf       # 示例输出 PDF
├── .gitignore
├── README.md                 # 本文件（中文）
├── README_EN.md              # 英文说明
└── fonts/
    └── texgyreadventor-regular.otf  # 拼音字体（GUST Font License，可自由分发）
```

> **字体说明**：本仓库仅包含 TeX Gyre Adventor 字体（GUST Font License，自由使用）。
> 其他书法字体涉及版权，需自行准备。详见[版权声明](#-版权声明)。

## 🛠️ 使用 TRAE IDE 开发

本项目全程使用 **TRAE IDE** 的人机协同开发模式完成：

| 关键任务 | TRAE Session ID |
|---------|----------------|
| HTML 独立打包、JS 内嵌 | `6a49f7e8...` |
| 模板字符串修复、UI 增强 | `6a49f7e8...` |
| PDF 乱码修复、Puppeteer | `6a49f7e8...` |
| JSON 解析、三层防御 | `6a49f7e8...` |

TRAE 在以下关键节点发挥了决定性作用：
- 🔍 识破 AI 生成"伪曲"问题（初版钢琴项目经验复用）
- 📦 完整的离线嵌入策略（Tone.js / pinyin-pro 等库内嵌）
- 🔧 字体加载时序与 Puppeteer 兼容性修复
- 🛡️ HTTP keep-alive 请求合并导致的 JSON 解析失败（三层防御方案）
- 🌐 跨平台编码兼容（Windows GBK / UTF-8 BOM / JSON 编码）

## 📄 示例输出

![示例字帖](./字帖_2026-07-06.pdf)

下载本仓库中的 `字帖_2026-07-06.pdf` 查看生成的描红字帖示例。

## 🧪 技术栈

| 技术点 | 方案 | 说明 |
|--------|------|------|
| 架构 | HTML5 + CSS3 + Vanilla JS | 单页面，零依赖运行 |
| 拼音转换 | [pinyin-pro](https://github.com/zh-lx/pinyin-pro)（MIT） | 自动标注声调 |
| 组词查询 | [cnchar](https://github.com/theajack/cnchar)（MIT） | 智能组词推荐 |
| 笔画渲染 | [Hanzi Writer](https://github.com/chanind/hanzi-writer)（MIT） | SVG 笔画分解 |
| PDF 导出 | `window.print()` + Puppeteer | 双轨方案 |
| 主题切换 | CSS 变量 + `data-theme` | 日间/夜间 |

## 📜 版权声明

- **本工具本体代码**：MIT License，可自由使用、修改、分发
- **内置字体**：仅包含 `texgyreadventor-regular.otf`（GUST Font License），可自由分发
- **商业字体**：需自行准备并替换，本仓库不包含任何商业字体
- **用户数据**：本工具完全离线运行，不上传任何用户数据

### 字体推荐（开源/免费替代）

如需替换商业字体，推荐以下开源替代：
- [霞鹜文楷](https://github.com/lxgw/LxgwWenKai)（SIL Open Font License）
- [思源宋体](https://github.com/adobe-fonts/source-han-serif)（SIL Open Font License）
- [思源黑体](https://github.com/adobe-fonts/source-han-sans)（SIL Open Font License）

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

---

*一字一世界，一笔一乾坤。愿这份小小的工具，能为汉字教学与书写传承尽一份力。*

*参赛链接：https://forum.trae.cn/t/topic/71664*