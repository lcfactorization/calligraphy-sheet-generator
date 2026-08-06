# 字帖生成器 — Vite工程化 + PWA离线 + SVG矢量化 + 学习闭环 + 双轨PDF

> TRAE AI 创造力大赛复赛作品 | 从"字帖生成工具"升级为"汉字学习闭环平台"
> 双轨方案:浏览器直接打印(全平台) + Puppeteer 命令行批量生成(桌面端)
> 在线体验:https://lcfactorization.github.io/calligraphy-sheet-generator/

[![Deploy to GitHub Pages](https://github.com/lcfactorization/calligraphy-sheet-generator/actions/workflows/deploy.yml/badge.svg?branch=retake)](https://github.com/lcfactorization/calligraphy-sheet-generator/actions/workflows/deploy.yml)
[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-online-brightgreen)](https://lcfactorization.github.io/calligraphy-sheet-generator/)
[![PWA](https://img.shields.io/badge/PWA-installable-blueviolet)](https://lcfactorization.github.io/calligraphy-sheet-generator/manifest.webmanifest)
[![Version](https://img.shields.io/badge/version-2.9.8-blue)](CHANGELOG.md)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

## 部署状态

- **在线访问**:https://lcfactorization.github.io/calligraphy-sheet-generator/
- **部署方式**:GitHub Actions 自动部署(push 到 `retake` 分支触发)
- **PWA 支持**:可安装到桌面/手机主屏,离线可用
- **最新版本**:v2.9.8(笔画笔顺动态演示 + 导航引导增强 16 步 + Dark/触屏/移动端多项 Bug 修复)
- **最新更新**:v2.9.8 — 新增离线笔画笔顺动态演示(点击字格弹窗逐笔演示,9574 汉字离线数据 + Web Worker 解压 + HanziWriter 双图层架构 + 播放/暂停 + 速度调节 1x-5x + 多窗口 + 速度持久化);引导从 9 步扩展到 16 步(新增笔顺演示/侧栏控件/历史记录引导);新增笔顺演示介绍页 stroke-demo-guide.html;修复 Dark 主题打印页脚黑底/汉字不显示、触屏 Light 主题渲染、移动端 settings/theme 按钮位置、移动端字格双击弹窗等 Bug;package.json 新增 fflate 依赖。详见 [CHANGELOG.md](./CHANGELOG.md)

## 目录结构

```
distribution/
├── index.html               ← Vite 入口 HTML(双栏布局 + 浮动按钮 + 输入面板)
├── vite.config.js           ← Vite 配置(PWA + SingleFile + Tailwind,cssMinify:false)
├── package.json             ← 依赖配置(v2.9.8,ES Module)
├── puppeteer-pdf.cjs        ← Puppeteer PDF 矢量生成脚本(CommonJS,命令行批量)
├── puppeteer-server.cjs     ← Puppeteer HTTP 服务(/health + /api/generate-pdf + 静态 dist 托管)
├── matepad-simulate.cjs     ← MatePad 模拟测试脚本(本地模拟华为 MatePad 打印 PDF)
├── 启动Puppeteer.bat/.ps1/.sh ← 三平台启动脚本(三步检查:Node/dist/Puppeteer)
├── 字帖生成器.html          ← 早期独立 HTML(参赛初版,仅作历史保留)
├── README.md / README_EN.md ← 中英文主文档
├── README_contest.md        ← 参赛最初文档 + 迭代演进附录
├── CHANGELOG.md             ← 更新日志(v1.0 → v2.9.8 全记录)
├── TASK_BOARD.md            ← v2.4.0 重构任务看板 + 后续演进
├── .github/workflows/       ← GitHub Pages 自动部署(触发分支:retake)
├── scripts/
│   └── download-fonts.sh    ← CI 构建时下载开源字体
├── public/
│   ├── icon-*.svg           ← PWA 图标(192/512/maskable)
│   └── fonts/               ← 字体目录(本地开发用,CI 构建时自动下载)
├── fonts/
│   └── texgyreadventor-regular.otf ← 拼音字体(GUST,本地兜底)
└── src/
    ├── main.js              ← 入口:CSS 导入 + 模块导入 + 事件绑定 + PWA 更新提示
    ├── contracts/
    │   └── interfaces.js    ← 接口契约层(GridCellProps/GridType/RenderMode/PdfExportOptions)
    ├── components/
    │   ├── GridEngine.js    ← SVG 字格引擎(createGridCellSVG + renderSheet,5 类型 × 3 模式)
    │   └── Sidebar.js       ← 320px 双栏侧栏(网格类型/透明度/预设场景)
    ├── utils/
    │   └── pdfExport.js     ← 双轨 PDF 导出(client-jspdf 默认 + client-print + server-puppeteer)
    ├── data/
    │   ├── customZuCi.js    ← 自定义组词字典
    │   ├── templates.js     ← 预设模板(唐诗/三字经/千字文等)
    │   └── vocabulary.js    ← 分级分类字库
    ├── modules/
    │   ├── fontManager.js   ← FontFace 加载 + base64 拼音字体 + 系统楷体检测
    │   ├── pinyin.js        ← pinyin-pro 封装
    │   ├── zuci.js          ← 组词(customZuCi + cnchar 回退)
    │   ├── strokes.js       ← 笔画 SVG + HanziWriter
    │   ├── settings.js      ← 主题/计数器/页眉页脚
    │   ├── puppeteerClient.js ← Puppeteer HTTP 客户端
    │   ├── history.js       ← 历史记录(localStorage)
    │   ├── settingsCenter.js ← 设置中心(网格类型/颜色预设/透明度/开关/主题/引导)
    │   ├── difficulty.js    ← 难度评估(cnchar 笔画数 + 5 级星级)
    │   ├── fileImporter.js  ← 文件导入(txt/md/csv/xlsx/docx)
    │   ├── recommender.js   ← 智能推荐(离线规则版,按难度/主题/场景)
    │   ├── reportPanel.js   ← 学习报告统计
    │   ├── feedback.js      ← 练习反馈(reportPanel 依赖)
    │   ├── onboarding.js    ← v2.9.5 移动端首次使用引导(9 步 + 滚动边角提示)
    │   └── fabDrag.js       ← v2.9.5 桌面端 FAB 拖拽(Pointer Events + 8px 网格吸附)
    └── styles/              ← CSS 模块(18 个)
        ├── base.css / components.css / grid.css / theme.css / main.css
        ├── print.css        ← 打印样式(@media print + 移动端 iframe 打印)
        ├── fab.css / tailwind.css
        ├── grid-svg.css     ← SVG 字格物理尺寸(18mm)
        ├── grid-styles.css  ← 网格类型样式
        ├── onboarding.css   ← v2.9.5 引导浮层样式
        ├── difficulty.css / feedback.css / fileImporter.css
        ├── history.css / recommender.css / report.css / settingsCenter.css
└── dist/                    ← 构建产物(npm run build 生成)
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
npm run preview      # 预览构建结果 http://localhost:4173
```

### 在线使用
直接访问 https://lcfactorization.github.io/calligraphy-sheet-generator/
- 支持 PWA 安装到桌面/手机
- 离线可用(Service Worker 缓存)

---

## 功能特性

### 核心功能(v2.0–v2.9.8 累计)

| # | 功能 | 说明 | 引入版本 |
|:--:|:-----|:-----|:-----|
| 1 | 智能描红字帖生成 | 输入汉字自动生成 SVG 矢量字格描红字帖 | v1.0 |
| 2 | 拼音自动标注 | pinyin-pro 引擎,带声调显示 | v1.0 |
| 3 | 组词辅助 | 自定义词典 + cnchar 回退 | v1.0 |
| 4 | 笔画分解 | hanzi-writer SVG 笔画渲染 | v1.0 |
| 5 | 矢量 PDF 导出 | 浏览器打印 + jsPDF/svg2pdf + Puppeteer 三轨道 | v1.0/v2.4 |
| 6 | 日间/夜间主题 | CSS 变量驱动,Dark 模式范字自动反色 | v1.0/v2.9.7 |
| 7 | 字体上传 | 用户自定义字体(FontFace API) | v1.0 |
| 8 | PWA 离线安装 | Service Worker 缓存,安装到桌面/主屏 | v2.0 |
| 9 | 开源字体(版权合规) | 4 款中文字体 + 1 款拼音字体,全部开源协议 | v2.0 |
| 10 | Vite 工程化构建 | ES Module 模块化 + Tailwind CSS v4 | v2.0 |
| 11 | CI/CD 自动部署 | GitHub Actions 自动构建部署到 Pages | v2.0 |
| 12 | 单文件构建能力 | vite-plugin-singlefile 生成可离线分发单 HTML | v2.0 |
| 13 | Lucide Icons | 现代 SVG 图标库 | v2.0 |
| 14 | **笔画笔顺动态演示** | 点击字格弹窗逐笔演示笔顺,9574 汉字离线数据 + HanziWriter 双图层 + 播放/暂停 + 速度调节 + 多窗口 | v2.9.8 |

### v2.4.0 重构 — SVG 矢量引擎 + 双轨矢量 PDF + 接口契约层

| # | 功能 | 模块 | 说明 |
|:--:|:-----|:-----|:-----|
| 14 | **参数化 Inline SVG 字格引擎** | GridEngine.js | 废弃 CSS 拼凑网格,升级为 viewBox 100×100 抽象坐标 + CSS mm 物理尺寸的矢量 SVG 引擎,屏幕/PDF/打印三者一致 |
| 15 | **5 种网格类型** | GridEngine.js | 田字格 / 米字格 / 九宫格 / 回字格 / 拼音田字格(上 30% 四线三格 + 下 70% 田字格),侧栏一键切换 |
| 16 | **3 种渲染模式** | GridEngine.js | stroke-order(首字彩色笔顺示范)/ trace(浅灰描红 0.1–0.4 透明度可调)/ blank(空白自写) |
| 17 | **物理级 18mm 精准尺寸** | grid-svg.css | CSS `width: 18mm` + `@page margin` + `preferCSSPageSize: true`,误差 < 0.1mm,绝不跨页断格 |
| 18 | **双轨矢量 PDF 导出** | utils/pdfExport.js | 轨1a:浏览器 `window.print()` 直印;轨1b:jsPDF + svg2pdf.js 纯矢量导出(默认轨道,DOM SVG→1:1 mm 坐标);轨2:Puppeteer HTTP 服务 |
| 19 | **4 色网格颜色预设** | interfaces.js | 传统绿(默认)/朱砂红/靛青蓝/墨黑,侧栏快切 |
| 20 | **320px 双栏工作台** | Sidebar.js | 左侧柔光侧栏(输入/字体/网格/透明度/预设场景)+ 右侧 A4 沉浸式预览,移动端自动改抽屉 |
| 21 | **预设场景快速选择** | Sidebar.js | 从 templates.js 读取预设模板(唐诗/三字经/千字文等),按 category 分组 |
| 22 | **接口契约层** | contracts/interfaces.js | GridCellProps / GridType / RenderMode / PdfExportOptions 标准 Props,多 Agent 并行开发零冲突 |

### v2.1.0 学习闭环 — 界面辅助 + 内容增强

| # | 功能 | 模块 | 说明 |
|:--:|:-----|:-----|:-----|
| 23 | **历史记录** | history.js | 每次生成自动保存到 localStorage,右侧可折叠侧边栏,支持重新生成/删除/清空 |
| 24 | **设置中心** | settingsCenter.js | 模态框含网格类型 + 颜色预设 + 描红透明度 + 开关 + 主题 + 引导设置 |
| 25 | **难度评估** | difficulty.js | cnchar.stroke() 笔画数,5 级星级,实时评估 |
| 26 | **内置模板库** | templates.js | 预设模板(唐诗宋词/三字经/千字文/常用字/成语/节日) |
| 27 | **分级字库** | vocabulary.js | 分级分类字库(初级/中级/高级) |
| 28 | **学习报告样式** | report.css | 报告卡片/统计/柱状图/进度条样式 |
| 29 | **文件导入** | fileImporter.js | 支持 txt/md/csv/xlsx/docx 导入生词 |
| 30 | **智能推荐** | recommender.js | 离线规则版,按难度/主题/场景三维度推荐 |

### v2.5–v2.9 演进 — 移动端适配 + 引导 + 体验优化

| # | 功能 | 说明 | 引入版本 |
|:--:|:-----|:-----|:-----|
| 31 | **Puppeteer PDF 应用网格设置** | Puppeteer 导出尊重当前网格类型和颜色预设 | v2.6.0 |
| 32 | **主题切换记忆** | 主题状态持久化到 localStorage | v2.7.0 |
| 33 | **MatePad 适配** | 华为 MatePad(HarmonyOS)打印 PDF 多轮修复 | v2.8.0–v2.8.7 |
| 34 | **移动端打印 iframe 架构** | 改隐藏 iframe 静态文档架构,根治页眉页脚缺失 | v2.9.0 |
| 35 | **Puppeteer 贴顶/页眉修复** | 恢复 @page margin:29mm 历史架构 | v2.9.1 |
| 36 | **移动端控件重叠修复** | 纯 CSS 重排修复 P0 硬伤 | v2.9.4 |
| 37 | **移动端首次使用引导** | 5 步引导浮层 + 滚动边角提示 | v2.9.5 |
| 38 | **桌面端 FAB 拖拽** | Pointer Events + 8px 网格吸附 + localStorage 持久化 | v2.9.5 |
| 39 | **引导 spotlight 修复** | 修复高亮控件位置错乱到对角的 P0 硬伤 | v2.9.6 |
| 40 | **引导增强 9 步** | 新增字体选择/自定义字体/智能推荐/导入生词文件,每步标注 🔄/✋ | v2.9.7 |
| 41 | **"不再自动弹出"选项** | 引导浮层复选框 + 设置中心开关,双向绑定 localStorage | v2.9.7 |
| 42 | **Dark 模式范字反色** | SVG `currentColor` + dark 自动反色 + 打印强制黑色 | v2.9.7 |
| 43 | **笔画笔顺动态演示弹窗** | 点击字格弹窗逐笔演示,9574 汉字离线数据 + 双图层 + 播放/暂停 + 速度持久化 | v2.9.8 |
| 44 | **导航引导增强 16 步** | 新增笔顺演示/侧栏控件/历史记录引导,含 autoOpen/tooltipText 字段 | v2.9.8 |
| 45 | **Dark/触屏/移动端 Bug 修复** | Dark 打印页脚黑底/汉字不显示、触屏 Light 主题、移动端按钮位置/字格双击 | v2.9.8 |

### 技术亮点

- **跨模块通信**:自定义事件 `calligraphy:history-updated`、`calligraphy:settings-updated`、`calligraphy:sidebar-updated`
- **接口契约层**:多 Agent 并行开发零冲突,所有跨模块传参遵循 `contracts/interfaces.js`
- **打印友好**:所有 UI 在 `@media print` 下隐藏,不影响 PDF 导出
- **localStorage 规范**:所有 key 使用 `calligraphy_` 前缀
- **PWA 更新提示**:`controllerchange` 监听 + 常驻 toast 引导刷新
- **真机调试通道**:`?printdebug=1` 注入页内日志浮层,hook console.warn/error
- **微信/QQ X5 检测**:检测内置浏览器拦截 `window.print()`,引导外部浏览器打开
- **多 Agent 协同**:全程使用 Trae CN IDE 多 Agent 并行开发,各版本有备份分支可回退

---

## CI/CD 自动部署

### GitHub Actions 工作流

项目通过 `.github/workflows/deploy.yml` 配置了 GitHub Pages 自动部署:

- **触发条件**:push 到 `retake` 分支,或手动 `workflow_dispatch`
- **构建流程**:`npm ci` → 下载字体 → `npm run build` → 上传 artifact → 部署到 Pages
- **部署环境**:`github-pages` environment
- **访问 URL**:https://lcfactorization.github.io/calligraphy-sheet-generator/

### CI 字体下载脚本

由于字体文件较大,未直接提交到仓库,而是通过 `scripts/download-fonts.sh` 在 CI 构建时下载:

| 字体 | 来源 | 协议 |
|:-----|:-----|:-----|
| 霞鹜文楷 Regular | lxgw/LxgwWenKai releases | SIL OFL 1.1 |
| 霞鹜文楷 Light | lxgw/LxgwWenKai releases | SIL OFL 1.1 |
| 思源宋体 SC | adobe-fonts/source-han-serif releases | SIL OFL 1.1 |
| 文鼎楷体(TW-Kai) | anthonyfok/TW-Kai releases | ARPH |
| TeX Gyre Adventor(拼音字体) | base64 内嵌于 fontManager.js | GUST |

> [!NOTE]
> 思源宋体 zip 解压后实际路径为 `OTF/SimplifiedChinese/SourceHanSerifSC-Regular.otf`,脚本使用 `find` 命令动态查找以避免硬编码路径问题。我逸清晨体楷书为商用字体,已移除。

### 本地开发字体准备

如需本地开发,可手动执行字体下载脚本:

```bash
# Linux/macOS
bash scripts/download-fonts.sh

# Windows (Git Bash)
bash scripts/download-fonts.sh
```

或从 `public/fonts/` 目录直接复制已下载的字体文件。

---

## 方案一:浏览器直接打印(推荐,全平台)

### 适用场景
- 日常使用,快速生成字帖 PDF
- 跨平台:Windows / Linux / Android / macOS / HarmonyOS
- 无需安装任何额外软件

### 使用步骤
1. 用浏览器(推荐 Chrome/Edge)打开在线版或本地 `npm run dev`
2. 在文本框输入要练习的文字(支持中文、拼音自动标注)
3. 选择汉字字体、网格类型、颜色预设等选项
4. 点击「生成字帖」按钮
5. 点击右下角打印按钮
6. 在弹出的打印窗口中,选择目标打印机为「另存为PDF」或「Microsoft Print to PDF」
7. 点击打印,保存 PDF 文件

### PDF 质量保证
- 矢量图形:浏览器打印引擎生成矢量 PDF,放大不失真
- 文字可选择复制:所有文字以文本形式嵌入,非光栅化图片
- 字体完整嵌入:拼音字体(base64 内嵌)+ 汉字字体(FontFace API 加载)确保 PDF 中字体正确显示
- 字体加载验证:打印前自动验证关键字体是否就绪,未就绪时自动重试等待

### 打印参数设置建议

| 参数 | 建议值 |
|------|--------|
| 目标打印机 | 另存为PDF / Microsoft Print to PDF |
| 页面大小 | A4 |
| 边距 | 默认 或 自定义(上下左右10mm) |
| 缩放 | 100% |
| 页眉页脚 | 根据需要开启 |
| 背景图形 | 勾选(确保网格线显示) |

### 移动端使用
- 手机/平板浏览器打开在线版
- 支持 PWA 安装到主屏,离线可用
- 首次访问自动弹出 16 步引导(v2.9.8)
- 微信/QQ 内置浏览器会引导跳转外部浏览器打印

---

## 方案二:Puppeteer 命令行生成(桌面端自动化)

### 适用场景
- 批量生成字帖 PDF
- 需要自动化集成(如定时生成、脚本调用)
- 桌面端 Windows / Linux / macOS
- 需要精确控制 PDF 参数(页眉页脚、页码、页面格式等)

### 环境要求
- **Node.js** v18 或更高版本
- 首次运行需安装 Puppeteer(会自动下载 Chromium,约 200MB)

### 安装步骤

```bash
cd distribution
npm install
```

> 如果 Chromium 下载失败,可手动安装:
> ```bash
> npx puppeteer browsers install chrome
> ```

### 启动方式

**方式 A:一键启动脚本(推荐)**

- Windows:双击 `启动Puppeteer.bat`
- macOS/Linux:在终端执行 `./启动Puppeteer.sh`(首次需 `chmod +x`)

脚本会自动三步检查:Node.js → dist 构建产物 → Puppeteer,缺则自动构建安装。

**方式 B:命令行直接启动**

```bash
node puppeteer-server.cjs    # 启动 HTTP 服务 http://localhost:3000
```

启动后浏览器自动打开,点击紫色 Puppeteer 按钮一键生成矢量 PDF。

### Puppeteer 脚本参数

```bash
# 直接指定文本
node puppeteer-pdf.cjs --text "床前明月光,疑是地上霜"

# 从文件读取文本
node puppeteer-pdf.cjs --input poem.txt --output 我的字帖.pdf

# 指定字体和页面格式
node puppeteer-pdf.cjs -t "静夜思" --font 思源宋体 --format a3 --landscape
```

完整参数请执行 `node puppeteer-pdf.cjs --help` 查看。

### 可选字体

| 字体名称 | CSS 字体族 | 开源协议 |
|----------|-----------|----------|
| 霞鹜文楷 | LXGWWenKai | SIL OFL 1.1 |
| 霞鹜文楷 Light | LXGWWenKaiLight | SIL OFL 1.1 |
| 思源宋体 | SourceHanSerifSC | SIL OFL 1.1 |
| 文鼎楷体(默认) | TW-Kai | ARPH 公共许可证 |
| TeX Gyre Adventor(拼音字体) | TeXGyreAdventor | GUST 字体许可证 |

### Puppeteer 方案 PDF 特点
- 矢量 PDF:Chromium PDF 引擎生成,与浏览器打印相同质量
- 文字可选择复制:所有文本以矢量文字形式嵌入
- 字体完整嵌入:拼音字体(base64)+ 汉字字体(FontFace)均嵌入 PDF
- 页眉页脚支持:可自定义页眉页脚文本和页码
- 批量自动化:可脚本调用,支持批量生成
- 网格设置同步:导出尊重当前网格类型和颜色预设(v2.6.0+)

---

## 添加自定义字体

1. 在浏览器界面中点击字体下拉框旁的上传按钮(图标-only,悬停显示说明)
2. 选择本地字体文件(.ttf / .otf / .woff / .woff2)
3. 字体自动加载并添加到下拉框
4. 也可手动编辑 `src/modules/fontManager.js` 的 `FONT_LIST` 数组添加内置字体

---

## 两种方案对比

| 特性 | 浏览器打印 | Puppeteer 脚本 |
|------|-----------|--------------|
| **矢量 PDF** | 是 | 是 |
| **文字可选择** | 是 | 是 |
| **字体嵌入** | 是 | 是 |
| **Windows** | 是 | 是 |
| **Linux** | 是 | 是 |
| **Android/HarmonyOS** | 是 | 否 |
| **macOS** | 是 | 是 |
| **无需安装** | 是 | 否(需 Node.js) |
| **批量生成** | 否 | 是 |
| **自动化集成** | 否 | 是 |
| **页眉页脚** | 浏览器设置 | 命令行控制 |
| **使用难度** | 简单 | 需命令行基础 |

---

## 常见问题

### Q: PDF 中字体显示不正确?
**A:**
- 浏览器方案:确保打印前等待"正在加载字体"提示消失,字体加载完成后才打印
- Puppeteer 方案:脚本已内置字体加载验证和重试机制

### Q: 移动端无法生成 PDF?
**A:** 移动端浏览器支持打印为 PDF。打开在线版 → 生成字帖 → 点击打印按钮 → 在打印界面选择"保存为 PDF"。v2.9.0 起采用 iframe 静态文档架构,根治了页眉页脚缺失问题。

### Q: 微信/QQ 内置浏览器点打印没反应?
**A:** 微信/QQ 内置浏览器(X5 内核)拦截 `window.print()`。项目会自动检测并提示:点击右上角「⋯」→「在浏览器中打开」→ 在新浏览器中再点打印按钮。

### Q: Puppeteer 安装失败?
**A:**
```bash
# 方法1:使用淘宝镜像
PUPPETEER_DOWNLOAD_BASE_URL=https://cdn.npmmirror.com/binaries/chrome-for-testing npm install

# 方法2:手动下载 Chromium
npx puppeteer browsers install chrome
```

### Q: 如何在服务器上批量生成字帖?
**A:** 使用 Puppeteer 方案,编写 Shell/Python 脚本循环调用:
```bash
for poem in *.txt; do
  node puppeteer-pdf.cjs --input "$poem" --output "${poem%.txt}.pdf"
done
```

### Q: Dark 模式下范字看不见?
**A:** v2.9.7 已修复。SVG 范字改用 `currentColor`,Dark 模式下自动反色为浅色,打印时由 `print.css` 强制黑色。

---

## 技术说明

### 为什么 Puppeteer 不能嵌入 HTML?
Puppeteer 是 Node.js 服务端工具,需要:
1. Node.js 运行时(浏览器中没有 `require()`)
2. 独立 Chromium 进程(浏览器无法启动其他进程)
3. 约 200MB 的 Chromium 二进制文件

但浏览器 `window.print()` 和 Puppeteer `page.pdf()` 使用**同一个 Chromium PDF 引擎**,输出质量完全相同。

### 拼音字体为什么用 base64 内嵌?
- 拼音字体(TeXGyreAdventor)是关键字体,必须保证 100% 可用
- base64 内嵌避免了文件路径依赖问题
- 在打印窗口和 Puppeteer 中都能正确加载

### 字体加载验证机制
打印前会自动验证:
1. 每个字体 5 秒超时加载
2. 关键字体(拼音+汉字)`document.fonts.check()` 验证
3. 验证失败时自动重试等待 3 秒
4. 控制台输出加载状态日志

### 启动脚本编码机制

Windows 系统的 cmd.exe 默认使用 GBK(代码页 936)编码读取批处理文件,但项目文件使用 UTF-8 编码。`启动Puppeteer.bat` 通过 `chcp 65001 >nul` 切换到 UTF-8 代码页,复杂逻辑委托给 `启动Puppeteer.ps1`。PowerShell 脚本内部设置 `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8`。Linux/macOS 脚本使用标准 bash 语法,无编码问题。

---

## 许可证

MIT License

## 致谢

- [pinyin-pro](https://github.com/zh-lx/pinyin-pro) — 拼音转换库
- [hanzi-writer](https://github.com/chanind/hanzi-writer) — 汉字笔顺动画
- [cnchar](https://github.com/zh-lx/cnchar) — 中文汉字处理库
- [Puppeteer](https://github.com/puppeteer/puppeteer) — 无头 Chrome 控制库
- [TeX Gyre Adventor](http://www.gust.org.pl/projects/e-foundry/tex-gyre/) — 拼音字体
- [Vite](https://vitejs.dev/) — 现代前端构建工具
- [Tailwind CSS](https://tailwindcss.com/) — 实用优先的 CSS 框架
- [Trae CN IDE](https://trae.cn/) — AI 辅助开发环境,全程多 Agent 协同开发
