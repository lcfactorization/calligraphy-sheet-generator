# 字帖生成器 — Vite工程化 + PWA离线 + 学习闭环 + Puppeteer PDF 矢量生成

> TRAE AI 创造力大赛复赛作品 | 从"字帖生成工具"升级为"汉字学习闭环平台"
> 双轨方案：浏览器直接打印（全平台） + Puppeteer 命令行批量生成（桌面端）
> 在线体验：https://lcfactorization.github.io/calligraphy-sheet-generator/

[![Deploy to GitHub Pages](https://github.com/lcfactorization/calligraphy-sheet-generator/actions/workflows/deploy.yml/badge.svg?branch=retake)](https://github.com/lcfactorization/calligraphy-sheet-generator/actions/workflows/deploy.yml)
[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-online-brightgreen)](https://lcfactorization.github.io/calligraphy-sheet-generator/)
[![PWA](https://img.shields.io/badge/PWA-installable-blueviolet)](https://lcfactorization.github.io/calligraphy-sheet-generator/manifest.webmanifest)
[![Version](https://img.shields.io/badge/version-2.4.0-blue)](CHANGELOG.md)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

## 部署状态

- **在线访问**：https://lcfactorization.github.io/calligraphy-sheet-generator/
- **部署方式**：GitHub Actions 自动部署（push 到 `retake` 分支触发）
- **构建状态**：✅ 通过（build 1.65s + 0错误0警告）
- **PWA 支持**：✅ 可安装到桌面/手机主屏，离线可用
- **最新版本**：v2.4.0（矢量 SVG 字格引擎 + 双轨矢量 PDF + 朱砂暖宣 UI）
- **最新部署**：commit `ef76bc0`（v2.3.0）→ v2.4.0 重构
- **模块总数**：35 个源文件（17 JS + 15 CSS + 3 数据）+ 839 构建模块

## 目录结构

```
distribution/
├── index.html               ← Vite入口HTML（v2.4 双栏布局）
├── vite.config.js           ← Vite配置（PWA + SingleFile + Tailwind）
├── package.json             ← 依赖配置（ES Module）
├── puppeteer-pdf.cjs        ← Puppeteer PDF矢量生成脚本（CommonJS，v2.4 修复路径）
├── README.md / CHANGELOG.md ← 文档
├── TASK_BOARD.md            ← [v2.4.0] 重构任务看板
├── .github/workflows/       ← GitHub Pages自动部署
├── src/
│   ├── main.js              ← 入口：CSS导入 + 模块导入 + 事件绑定
│   ├── contracts/           ← [v2.4.0] 接口契约层
│   │   └── interfaces.js    ← GridCellProps / GridType / RenderMode / PdfExportOptions
│   ├── components/          ← [v2.4.0] 矢量组件层
│   │   ├── GridEngine.js    ← SVG字格引擎（createGridCellSVG + renderSheet）
│   │   └── Sidebar.js       ← 320px双栏侧栏（网格类型/透明度/预设场景）
│   ├── utils/               ← [v2.4.0] 工具层
│   │   └── pdfExport.js     ← jsPDF+svg2pdf.js 矢量PDF导出（双轨）
│   ├── styles/              ← CSS模块（15个）
│   │   ├── base.css / components.css / grid.css / theme.css
│   │   ├── print.css / fab.css / tailwind.css
│   │   ├── grid-svg.css     ← [v2.4.0] SVG字格18mm物理尺寸
│   │   └── history / settingsCenter / difficulty / grid-styles / report
│   │                        / fileImporter / recommender  共8个
│   ├── data/                ← 数据文件（3个）
│   │   ├── customZuCi.js    ← 1719条自定义组词字典
│   │   ├── templates.js     ← 20个预设模板（唐诗/三字经/千字文等）
│   │   └── vocabulary.js    ← 3级18分类分级字库
│   └── modules/             ← JS模块（12个，v2.4 保留作回退）
│       ├── fontManager.js   ← FontFace加载 + base64拼音字体
│       ├── pinyin.js        ← pinyin-pro封装
│       ├── zuci.js          ← 组词（customZuCi + cnchar）
│       ├── strokes.js       ← 笔画SVG + HanziWriter
│       ├── gridRenderer.js  ← [旧] CSS网格生成（v2.4 保留作回退）
│       ├── settings.js      ← 主题/计数器/页眉页脚
│       ├── pdfExport.js     ← [旧] window.print PDF（v2.4 保留作回退）
│       ├── puppeteerClient.js
│       ├── history.js       ← 历史记录（localStorage 20条）
│       ├── feedback.js      ← 练习反馈（整体+单字，状态色环）
│       ├── settingsCenter.js← 设置中心（4滑块+4开关+3主题）
│       ├── difficulty.js    ← 难度评估（cnchar笔画数+5级星级）
│       ├── fileImporter.js  ← 文件导入（txt/md/csv/xlsx/docx）
│       ├── recommender.js   ← AI智能推荐（离线规则版）
│       └── reportPanel.js   ← 学习报告统计
├── public/
│   ├── fonts/               ← 5个开源字体
│   │   ├── LXGWWenKai-Regular.ttf   ← 霞鹜文楷（SIL OFL）
│   │   ├── LXGWWenKai-Light.ttf     ← 霞鹜文楷 Light（SIL OFL）
│   │   ├── SourceHanSerifSC-Regular.otf ← 思源宋体（SIL OFL）
│   │   ├── TW-Kai.ttf               ← 文鼎楷体（ARPH）
│   │   └── texgyreadventor-regular.otf ← 拼音字体（GUST，仅CI占位，实际base64内嵌）
│   └── icon-*.svg           ← PWA图标（192/512/maskable）
└── dist/                    ← 构建产物（npm run build生成）
```

## 快速开始

### 开发模式
```bash
npm install
npm run dev          # 启动开发服务器 http://localhost:3000
```

### 构建部署
```bash
npm run build        # 构建到 dist/
npm run preview      # 预览构建结果
```

### 在线使用
直接访问 https://lcfactorization.github.io/calligraphy-sheet-generator/
- 支持PWA安装到桌面/手机
- 离线可用（Service Worker缓存）

---

## 功能特性

### 核心功能（v2.0）

| # | 功能 | 说明 |
|:--:|:-----|:-----|
| 1 | 智能描红字帖生成 | 输入汉字自动生成田字格描红字帖 |
| 2 | 拼音自动标注 | pinyin-pro 引擎，带声调显示 |
| 3 | 组词辅助 | 1719条自定义词典 + cnchar 回退 |
| 4 | 笔画分解 | hanzi-writer SVG 笔画渲染 |
| 5 | 矢量 PDF 导出 | 浏览器打印 + Puppeteer 双轨方案 |
| 6 | 日间/夜间主题 | CSS 变量驱动，Lucide 图标 |
| 7 | 字体上传 | 用户自定义字体 |
| 8 | PWA 离线安装 | Service Worker 缓存，安装到桌面/主屏 |
| 9 | 开源字体（版权合规） | 霞鹜文楷/思源宋体/文鼎楷体等6款 |
| 10 | Vite 工程化构建 | ES Module 模块化 |
| 11 | CI/CD 自动部署 | GitHub Actions 自动构建部署到 Pages |
| 12 | Tailwind CSS v4 | 现代化 UI 框架集成 |
| 13 | Lucide Icons | 现代化 SVG 图标库 |
| 14 | 单文件构建能力 | vite-plugin-singlefile 生成可离线分发单HTML |
| 15 | GitHub Pages 在线访问 | 评审可直接打开体验 |

### v2.4.0 新增功能 — 矢量 SVG 引擎 + 双轨矢量 PDF + 朱砂暖宣 UI（工业级重构）

| # | 功能 | 模块 | 说明 |
|:--:|:-----|:-----|:-----|
| 23 | **参数化 Inline SVG 字格引擎** | GridEngine.js | 彻底废弃 CSS 拼凑网格，升级为 viewBox 100×100 抽象坐标 + CSS mm 物理尺寸的矢量 SVG 引擎，屏幕/PDF/打印三者一致 |
| 24 | **4 种网格类型** | GridEngine.js | 田字格 / 米字格 / 回字格 / 拼音田字格（上 30% 四线三格 + 下 70% 田字格），侧栏一键切换 |
| 25 | **3 种渲染模式** | GridEngine.js | stroke-order（首字彩色笔顺示范）/ trace（浅灰描红 0.1–0.4 透明度可调）/ blank（空白自写） |
| 26 | **物理级 18mm 精准尺寸** | grid-svg.css | CSS `width: 18mm` + `@page margin: 0mm` + `preferCSSPageSize: true`，误差 < 0.1mm，绝不跨页断格 |
| 27 | **双轨矢量 PDF 导出** | utils/pdfExport.js | 轨1a：浏览器 `window.print()` 直印；轨1b：`jsPDF + svg2pdf.js` 无对话框矢量导出（DOM SVG → 1:1 mm 坐标）；轨2：Puppeteer 命令行批量 |
| 28 | **朱砂暖宣东方文房 UI** | theme.css | A4 宣纸背景 `#FDFBF7` + 印泥红 Accent `#9E2A2B` + 朱砂框线 `#D97777`，含暗色模式适配 |
| 29 | **320px 双栏工作台** | Sidebar.js + index.html | 左侧柔光宣纸侧栏（输入/字体/网格类型/透明度/预设场景）+ 右侧 A4 沉浸式预览画布（真实纸张阴影），移动端自动改抽屉 |
| 30 | **预设场景快速选择** | Sidebar.js | 从 templates.js 读取 20 个预设模板（唐诗/三字经/千字文等），按 category 分组，点击即生成 |
| 31 | **接口契约层** | contracts/interfaces.js | GridCellProps / GridType / RenderMode / PdfExportOptions 标准 Props，多 Agent 并行开发零冲突 |
| 32 | **Puppeteer 路径修复** | puppeteer-pdf.cjs | 修复引用已废弃的 `字帖生成器.html`，改为 `dist/index.html` 构建产物 + `--url` 参数回退 dev server |

### v2.1.0 新增功能 — 学习闭环 + 界面辅助 + 内容增强

| # | 功能 | 模块 | 说明 |
|:--:|:-----|:-----|:-----|
| 16 | **历史记录** | history.js | 每次生成自动保存到 localStorage（最多20条），右侧可折叠侧边栏，支持重新生成/删除/清空 |
| 17 | **设置中心** | settingsCenter.js | 模态框含 4 滑块 + 4 开关 + 3 主题选项，实时更新预览 |
| 18 | **难度评估** | difficulty.js | cnchar.stroke() 笔画数，5 级星级，实时评估 |
| 19 | **内置模板库** | templates.js | 20 个预设模板（唐诗宋词8+三字经2+千字文2+常用字3+成语3+节日2） |
| 20 | **分级字库** | vocabulary.js | 3 级 18 分类（初级1-5画/中级6-10画/高级10+画） |
| 21 | **米字格/回宫格** | grid-styles.css | 米字格（十字+对角线虚线）+ 回宫格（内外框），打印友好 |
| 22 | **学习报告样式** | report.css | 报告卡片/统计/柱状图/进度条样式 |

### 技术亮点（v2.1.0）

- **跨模块通信**：自定义事件 `calligraphy:history-updated`、`calligraphy:char-feedback-updated`、`calligraphy:settings-updated`
- **单字反馈**：DOM 事件委托，不修改 gridRenderer.js，悬停显示 Lucide 图标
- **主题协同**：settingsCenter 通过 `toggleTheme()` 与现有 settings.js 的 isDark 状态同步
- **打印友好**：所有新 UI 在 `@media print` 下隐藏，不影响 PDF 导出
- **localStorage 规范**：所有 key 使用 `calligraphy_` 前缀（history / char_feedback / settings）
- **多 Agent 并行开发**：通过 TraeCN IDE 多 Agent 并行执行，新增 18 个文件，构建 1.65s 0 错误

---

## CI/CD 自动部署

### GitHub Actions 工作流

项目通过 `.github/workflows/deploy.yml` 配置了 GitHub Pages 自动部署：

- **触发条件**：push 到 `retake` 分支，或手动 `workflow_dispatch`
- **构建流程**：`npm ci` → 下载字体 → `npm run build` → 上传 artifact → 部署到 Pages
- **部署环境**：`github-pages` environment（已配置允许 `main` 和 `retake` 分支部署）
- **访问 URL**：https://lcfactorization.github.io/calligraphy-sheet-generator/

### CI 字体下载脚本

由于字体文件较大（6个字体共~20MB），未直接提交到仓库，而是通过 `scripts/download-fonts.sh` 在 CI 构建时下载：

| 字体 | 来源 | 协议 |
|:-----|:-----|:-----|
| 霞鹜文楷 Regular | lxgw/LxgwWenKai releases | SIL OFL 1.1 |
| 霞鹜文楷 Light | lxgw/LxgwWenKai releases | SIL OFL 1.1 |
| 思源宋体 SC | adobe-fonts/source-han-serif releases | SIL OFL 1.1 |
| 文鼎楷体 | fontworks/onryou releases | ARPH |
| TeX Gyre Adventor（拼音字体） | base64 内嵌于 fontManager.js | GUST |

> [!NOTE]
> 思源宋体 zip 解压后实际路径为 `OTF/SimplifiedChinese/SourceHanSerifSC-Regular.otf`，脚本使用 `find` 命令动态查找以避免硬编码路径问题（详见 CHANGELOG v2.0.1）。

### 本地开发字体准备

如需本地开发，可手动执行字体下载脚本：

```bash
# Linux/macOS
bash scripts/download-fonts.sh

# Windows (Git Bash)
bash scripts/download-fonts.sh
```

或从 `public/fonts/` 目录直接复制已下载的字体文件。

---

## 方案一：浏览器直接打印（推荐，全平台）

### 适用场景
- 日常使用，快速生成字帖PDF
- 跨平台：Windows / Linux / Android / macOS
- 无需安装任何额外软件

### 使用步骤
1. 用浏览器（推荐 Chrome/Edge）打开 `字帖生成器.html`
2. 在文本框输入要练习的文字（支持中文、拼音自动标注）
3. 选择汉字字体、拼音样式、田字格等选项
4. 点击「生成字帖」按钮
5. 点击右下角橙色「打印PDF」按钮
6. 在弹出的打印窗口中，选择目标打印机为「另存为PDF」或「Microsoft Print to PDF」
7. 点击打印，保存PDF文件

### PDF质量保证
- ✅ **矢量图形**：浏览器打印引擎生成矢量PDF，放大不失真
- ✅ **文字可选择复制**：所有文字以文本形式嵌入，非光栅化图片
- ✅ **字体完整嵌入**：拼音字体(base64内嵌) + 汉字字体(FontFace API加载) 确保PDF中字体正确显示
- ✅ **字体加载验证**：打印前自动验证关键字体是否就绪，未就绪时自动重试等待

### 打印参数设置建议

| 参数 | 建议值 |
|------|--------|
| 目标打印机 | 另存为PDF / Microsoft Print to PDF |
| 页面大小 | A4 |
| 边距 | 默认 或 自定义(上下左右10mm) |
| 缩放 | 100% |
| 页眉页脚 | 根据需要开启 |
| 背景图形 | ✅ 勾选（确保田字格线显示） |

### Android 使用方法
1. 将 `distribution/` 整个文件夹传输到 Android 设备
2. 用 Chrome 浏览器打开 `字帖生成器.html`
3. 按上述步骤操作，在打印时选择「保存为PDF」

---

## 方案二：Puppeteer 命令行生成（桌面端自动化）

### 适用场景
- 批量生成字帖PDF
- 需要自动化集成（如定时生成、脚本调用）
- 桌面端 Windows / Linux / macOS
- 需要精确控制PDF参数（页眉页脚、页码、页面格式等）

### 环境要求
- **Node.js** v18 或更高版本
- 首次运行需安装 Puppeteer（会自动下载Chromium，约200MB）

### 安装步骤

```bash
# 进入 distribution 目录
cd distribution

# 安装依赖（首次运行）
npm install
```

> 如果 Chromium 下载失败，可手动安装：
> ```bash
> npx puppeteer browsers install chrome
> ```

### 使用方法

#### 基本用法
```bash
# 直接指定文本
node puppeteer-pdf.js --text "床前明月光，疑是地上霜"

# 从文件读取文本
node puppeteer-pdf.js --input poem.txt --output 我的字帖.pdf

# 指定字体和页面格式
node puppeteer-pdf.js -t "静夜思" --font 思源宋体 --format a3 --landscape
```

#### 完整参数列表

| 参数 | 简写 | 说明 | 默认值 |
|------|------|------|--------|
| `--text` | `-t` | 直接指定文本内容 | — |
| `--input` | `-i` | 从文本文件读取内容（UTF-8） | — |
| `--output` | `-o` | 输出PDF文件路径 | 字帖.pdf |
| `--font` | `-f` | 汉字字体名称 | 文鼎楷体 |
| `--format` | | 页面格式: a4/a3/a5/letter/legal | a4 |
| `--header` | | 页眉文本 | （空） |
| `--footer` | | 页脚文本（支持 `{page}` `{total}`） | 第 {page} 页 / 共 {total} 页 |
| `--margin` | | 页面边距 | 10mm |
| `--landscape` | | 横向打印 | （纵向） |
| `--timeout` | | 超时时间（毫秒） | 30000 |
| `--help` | `-h` | 显示帮助 | — |

#### 可选字体

| 字体名称 | CSS字体族 | 开源协议 |
|----------|-----------|----------|
| 霞鹜文楷 | LXGWWenKai | SIL OFL 1.1 |
| 霞鹜文楷 Light | LXGWWenKaiLight | SIL OFL 1.1 |
| 思源宋体 | SourceHanSerifSC | SIL OFL 1.1 |
| 文鼎楷体（默认） | TW-Kai | ARPH 公共许可证 |
| TeX Gyre Adventor（拼音字体） | TeXGyreAdventor | GUST 字体许可证 |

#### 使用示例

```bash
# 生成《静夜思》字帖，A3横向，带页眉
node puppeteer-pdf.js \
  --text "床前明月光，疑是地上霜。举头望明月，低头思故乡。" \
  --output 静夜思字帖.pdf \
  --font 霞鹜文楷 \
  --format a3 \
  --landscape \
  --header "李白《静夜思》"

# 从文件读取，自定义页脚
node puppeteer-pdf.js \
  --input 春晓.txt \
  --output 春晓字帖.pdf \
  --font 思源宋体 \
  --footer "孟浩然《春晓》— 第 {page} 页"

# 快速测试
npm run pdf:test
```

### Puppeteer方案 PDF特点
- ✅ **矢量PDF**：Chromium PDF引擎生成，与浏览器打印相同质量
- ✅ **文字可选择复制**：所有文本以矢量文字形式嵌入
- ✅ **字体完整嵌入**：拼音字体(base64) + 汉字字体(FontFace) 均嵌入PDF
- ✅ **页眉页脚支持**：可自定义页眉页脚文本和页码
- ✅ **批量自动化**：可脚本调用，支持批量生成

---

## 添加自定义字体

1. 将新的字体文件（.ttf / .otf）放入 `fonts/` 文件夹
2. 用文本编辑器打开 `字帖生成器.html`
3. 找到 FontFace 加载器（搜索 `FontFace 加载器`）
4. 在字体数组中添加新条目：
   ```javascript
   ['YourFontName', './fonts/你的字体文件.ttf'],
   ```
5. 找到字体下拉框（搜索 `font-select`）
6. 添加新的 `<option>`：
   ```html
   <option value="YourFontName">你的字体名称</option>
   ```
7. 保存文件，刷新浏览器即可使用新字体

> 也可以直接在浏览器界面中点击「添加字体」按钮上传字体文件（无需修改HTML）。

---

## 两种方案对比

| 特性 | 浏览器打印 | Puppeteer脚本 |
|------|-----------|--------------|
| **矢量PDF** | ✅ | ✅ |
| **文字可选择** | ✅ | ✅ |
| **字体嵌入** | ✅ | ✅ |
| **Windows** | ✅ | ✅ |
| **Linux** | ✅ | ✅ |
| **Android** | ✅ | ❌ |
| **macOS** | ✅ | ✅ |
| **无需安装** | ✅ | ❌ 需Node.js |
| **批量生成** | ❌ | ✅ |
| **自动化集成** | ❌ | ✅ |
| **页眉页脚** | 浏览器设置 | ✅ 命令行控制 |
| **使用难度** | 简单 | 需命令行基础 |

---

## 常见问题

### Q: PDF中字体显示不正确？
**A:** 
- 浏览器方案：确保打印前等待"正在加载字体"提示消失，字体加载完成后才打印
- Puppeteer方案：脚本已内置字体加载验证和重试机制

### Q: Android上无法生成PDF？
**A:** Android Chrome 浏览器支持打印为PDF。打开HTML → 生成字帖 → 点击打印按钮 → 在打印界面选择"保存为PDF"。

### Q: Puppeteer安装失败？
**A:** 
```bash
# 方法1：使用淘宝镜像
PUPPETEER_DOWNLOAD_BASE_URL=https://cdn.npmmirror.com/binaries/chrome-for-testing npm install

# 方法2：手动下载Chromium
npx puppeteer browsers install chrome
```

### Q: 如何在服务器上批量生成字帖？
**A:** 使用Puppeteer方案，编写Shell/Python脚本循环调用：
```bash
for poem in *.txt; do
  node puppeteer-pdf.js --input "$poem" --output "${poem%.txt}.pdf"
done
```

---

## 技术说明

### 为什么Puppeteer不能嵌入HTML？
Puppeteer是Node.js服务端工具，需要：
1. Node.js运行时（浏览器中没有`require()`）
2. 独立Chromium进程（浏览器无法启动其他进程）
3. 约200MB的Chromium二进制文件

但浏览器`window.print()`和Puppeteer `page.pdf()`使用**同一个Chromium PDF引擎**，输出质量完全相同。

### 拼音字体为什么用base64内嵌？
- 拼音字体（TeXGyreAdventor）是关键字体，必须保证100%可用
- base64内嵌避免了文件路径依赖问题
- 在打印窗口和Puppeteer中都能正确加载

### 字体加载验证机制
打印前会自动验证：
1. 每个字体5秒超时加载
2. 关键字体（拼音+汉字）`document.fonts.check()` 验证
3. 验证失败时自动重试等待3秒
4. 控制台输出加载状态日志

---

## 启动脚本编码机制说明

### 问题背景

Windows 系统的 cmd.exe 默认使用 GBK（代码页 936）编码读取批处理文件，但项目文件使用 UTF-8 编码。当 .bat 文件包含中文字符时，cmd.exe 会错误解析字节序列，导致命令被截断或乱码。

### 解决方案

#### Windows 启动脚本（.bat）

`启动Puppeteer.bat` 采用以下机制确保正确执行：

```batch
@echo off
chcp 65001 >nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0启动Puppeteer.ps1"
if errorlevel 1 pause
```

**关键机制：**
1. **`chcp 65001`**：将 cmd.exe 代码页切换到 UTF-8，使其能正确解析中文字符
2. **`>nul`**：重定向输出，避免显示"活动代码页已更改"消息
3. **调用 PowerShell**：所有复杂逻辑由 `启动Puppeteer.ps1` 处理，避免 bat 文件编码问题

#### PowerShell 启动脚本（.ps1）

`启动Puppeteer.ps1` 内部设置 UTF-8 编码：

```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
```

同时设置 `PSDefaultParameterValues` 消除 Invoke-WebRequest 安全警告：

```powershell
$global:PSDefaultParameterValues = @{
    'Invoke-WebRequest:UseBasicParsing' = $true
    'Invoke-RestMethod:UseBasicParsing' = $true
}
```

#### Linux/macOS 启动脚本（.sh）

`启动Puppeteer.sh` 使用标准 bash 语法，无编码问题：

```bash
#!/bin/bash
# 脚本使用 UTF-8 编码保存
```

### 编码一致性保证

所有启动脚本遵循以下原则：
- ✅ 使用 UTF-8 编码保存（无 BOM）
- ✅ Windows .bat 文件必须包含 `chcp 65001`
- ✅ PowerShell .ps1 文件设置 `[Console]::OutputEncoding`
- ✅ 复杂逻辑委托给 PowerShell，bat 文件仅作为入口

### 常见编码问题排查

| 症状 | 原因 | 解决方案 |
|------|------|----------|
| `'powershell' is not recognized` | bat 文件缺少 `chcp 65001` | 添加 `chcp 65001 >nul` |
| 中文显示乱码 | 控制台编码不匹配 | 确保脚本设置了 UTF-8 编码 |
| Invoke-WebRequest 弹出安全警告 | 未设置 UseBasicParsing | 添加 `$global:PSDefaultParameterValues` |

---

## 许可证

MIT License

## 致谢

- [pinyin-pro](https://github.com/zh-lx/pinyin-pro) — 拼音转换库
- [hanzi-writer](https://github.com/chanind/hanzi-writer) — 汉字笔顺动画
- [cnchar](https://github.com/zh-lx/cnchar) — 中文汉字处理库
- [Puppeteer](https://github.com/puppeteer/puppeteer) — 无头Chrome控制库
- [TeX Gyre Adventor](http://www.gust.org.pl/projects/e-foundry/tex-gyre/) — 拼音字体
