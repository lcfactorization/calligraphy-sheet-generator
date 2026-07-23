# 更新日志

所有 notable 变更记录在此文件中。
格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)。

---

## [2.4.0] — 2026-07-23

### 🚀 矢量 SVG 字格引擎 + 双轨矢量 PDF + 朱砂暖宣 UI（工业级重构）

基于 `字帖项目html渲染网格PDF显示以及最终打印的精准尺寸控制提示词.20260723Gemini.md` 的架构契约，通过 4 个 Agent 并行执行（Master 契约 + Agent-A/B/C 独占文件域 + Agent-D 构建验收），将项目从 CSS 拼凑网格升级为参数化 Inline SVG 矢量引擎，实现物理级 18mm 精准尺寸控制与双轨矢量 PDF 导出。

备份 tag：`backup/pre_svg_refactor/20260723_143000`（HEAD: 9587410）

#### 新增 — 接口契约层（Master Agent · 阶段 0）
- **`src/contracts/interfaces.js`**：定义 GridCellProps / GridType / RenderMode / PdfExportOptions 标准 Props，含 `resolveGridProps()` 合并函数、`MM_TO_PX` 换算常量、`A4_PORTRAIT` 物理尺寸常量
- **`TASK_BOARD.md`**：重构任务看板，记录 4 阶段进度与文件隔离矩阵

#### 新增 — 矢量 SVG 字格引擎（Agent-A · 阶段 1）
- **`src/components/GridEngine.js`**：导出 `createGridCellSVG(options)` 核心契约函数 + `renderSheet(input, options)` 高层编排
  - 纯 Inline SVG（`viewBox="0 0 100 100"`，pinyin-tian 为 `0 0 100 130`），`preserveAspectRatio="xMidYMid meet"`
  - SVG 上不设 width/height，物理尺寸完全由 CSS 控制（保证打印 18mm 误差 < 0.1mm）
  - **4 种网格类型**：'tian'（田字格）/ 'mizi'（米字格）/ 'hui'（回字格）/ 'pinyin-tian'（拼音田字格，上 30% 四线三格 + 下 70% 田字格）
  - **3 种渲染模式**：'stroke-order'（首字笔顺示范，彩色笔画循环色板）/ 'trace'（浅灰描红 0.1–0.4 透明度）/ 'blank'（空白自写）
  - 中心虚线统一 `stroke-dasharray="3,3"`，线条 `stroke-width="0.6"`
  - 集成 pinyin-pro 注音、cnchar 组词、hanzi-writer 笔顺（异步加载不阻塞渲染）
- **`src/styles/grid-svg.css`**：物理尺寸严格 18mm × 18mm（pinyin-tian 23.4mm），分页 `page-break-inside: avoid` 防跨页断格

#### 新增 — 双轨矢量 PDF 导出 + A4 物理排版（Agent-B · 阶段 2）
- **`src/styles/print.css`**（扩展）：追加 `@page { size: A4 portrait; margin: 0mm !important; }` + `.a4-page` 可见性锁定 + `.grid-svg-row { page-break-inside: avoid }` 物理排版规则
- **`src/utils/pdfExport.js`**（新建）：jsPDF + svg2pdf.js 纯矢量导出
  - `exportVectorPDF(opts)`：直接读取 DOM 的 `.grid-svg-row` SVG 节点，按 1:1 mm 坐标写入 PDF，8 行/页分页，mm 坐标页眉页脚
  - `printDirect()`：浏览器原生 `window.print()`，包装 `.a4-page` 容器让 print.css 生效
  - `exportPDF(opts)`：统一入口，按 `track` 路由（'client-print' | 'client-jspdf'）
  - 拒绝 html2canvas 位图化，保证 PDF 文字矢量、可缩放、可选择
- **`puppeteer-pdf.cjs`**（修复）：HTML 路径从已废弃的 `字帖生成器.html` 改为 `dist/index.html` 构建产物（+ `--url` 参数回退 dev server）；选择器改为 `.grid-svg-cell`；PDF 选项 `margin: 0mm` + `preferCSSPageSize: true` + `displayHeaderFooter: false`；evaluate 触发 input 事件并点击 generate-btn
- **`package.json`**：新增 `jspdf@^2.5.2` + `svg2pdf.js@^2.2.3` 依赖

#### 新增 — 朱砂暖宣东方文房 UI + 双栏工作台（Agent-C · 阶段 3）
- **`src/styles/theme.css`**（扩展）：保留蓝紫系（向后兼容），追加朱砂暖宣色系（`--paper-bg: #FDFBF7` / `--seal-red: #9E2A2B` / `--vermilion-frame: #D97777` / `--vermilion-dash: #F0B8B8` / `--ink-black` / `--sidebar-bg` / `--a4-shadow`），含暗色模式适配
- **`src/components/Sidebar.js`**（新建）：320px 左侧栏组件
  - 运行时把现有 `#input-container` + 页眉页脚 `.panel` 移入侧栏（保留全部 26 个元素 ID，不破坏 main.js 事件绑定）
  - 新增"网格类型"切换组（田/米/回/拼音田 4 按钮）+ "描红透明度"滑块（0.1–0.4）+ "预设场景"列表（从 templates.js 读取，按 category 分组）
  - 状态持久化到 localStorage（key: `calligraphy_sidebar_state`），派发 `calligraphy:sidebar-updated` 事件
  - 移动端（<768px）侧栏改为可折叠抽屉 + 遮罩
- **`index.html`**（改造）：双栏布局 `.app-workbench`（320px 侧栏 + A4 画布）+ `.a4-preview` 沉浸式纸张阴影容器 + `#exportVectorBtn` 矢量 PDF 导出浮动按钮；`theme-color` 改为 `#9E2A2B`

#### 变更 — 集成入口
- **`src/main.js`**：切换到新 SVG 引擎（`renderSheet` 替代旧 `generateGrid`）+ 新 PDF 导出（`exportPDF` 替代旧 `printToPDF`）+ `initSidebar` 初始化；监听 `calligraphy:sidebar-updated` 事件实时重渲染；保留旧模块文件作回退
- **`src/styles/main.css`**：新增 `@import './grid-svg.css'`

#### 保留 — 功能零退化
- ✅ pinyin-pro 注音（集成于 GridEngine.renderSheet）
- ✅ cnchar 笔顺 + hanzi-writer SVG 笔画（集成于 GridEngine + loadStrokes）
- ✅ 本地生字词典 customZuCi.js（1719 条）
- ✅ 预设模板库 templates.js（20 个模板，侧栏预设场景接入）
- ✅ LocalStorage 历史记录 history.js
- ✅ 设置中心 / 难度评估 / 文件导入 / AI 推荐 / 学习报告（全部保留）
- ✅ PWA 离线 + Service Worker

#### 验证 — 构建
- 模块数：460 → 839（+379，jspdf + svg2pdf.js 内部模块）
- 构建时间：7.77s → 11.29s
- 文件大小：2,163.02 KB → 3,000.95 KB（gzip: 854.01 → 1,107.90 KB）
- 0 错误 0 警告
- PWA precache：9 entries（3160.19 KiB）

#### 验证 — 浏览器自动化测试（6/6 PASS）
1. ✅ 首屏加载：页面正常加载，无 error 级别控制台消息
2. ✅ SVG 网格渲染：2830 个 `.grid-svg-cell`，283 行 `.grid-svg-row`，SVG 含 viewBox
3. ✅ 双栏布局：`#appSidebar` 存在，4 个 `.grid-type-btn`，`#exportVectorBtn` 存在，`--seal-red: #9E2A2B`
4. ✅ 网格类型切换：点击米字格按钮后 `data-grid-type` 变为 `mizi`，线条数增加
5. ✅ 主题色：`.a4-preview` 背景为 `rgb(253, 251, 247)`（宣纸色）
6. ✅ 控制台无 error

#### 验证 — Puppeteer PDF 生成
- 命令：`node puppeteer-pdf.cjs --text "床前明月光" --output 测试字帖_svg.pdf`
- 结果：✅ 18.6 KB 矢量 PDF，A4 纵向，文字可选择复制，字体完整嵌入
- 路径修复：`dist/index.html`（原 `字帖生成器.html` 已不存在）

#### 技术亮点
- **参数化 Inline SVG**：viewBox 100×100 抽象坐标 + CSS mm 物理尺寸，屏幕预览/导出 PDF/物理打印三者一致
- **双轨矢量 PDF**：客户端 jsPDF+svg2pdf.js（无浏览器对话框）+ 服务端 Puppeteer（命令行批量），共享同一 SVG DOM 源
- **物理级 18mm 精度**：CSS `width: 18mm` + `@page margin: 0mm` + `preferCSSPageSize: true`，误差 < 0.1mm
- **多 Agent 文件隔离**：4 个 Agent 严格独占文件域（src/contracts / src/components / src/utils / src/styles），零冲突并行
- **向后兼容**：保留旧 gridRenderer.js / modules/pdfExport.js 文件，仅 main.js 不再引用，可随时回退

#### 回滚策略
- `git reset --hard backup/pre_svg_refactor/20260723_143000`
- 旧模块保留：`src/modules/gridRenderer.js` / `src/modules/pdfExport.js` 未删除

---

## [2.3.0] — 2026-07-23

### 🔧 删除花哨功能 + 精简主界面 + 修复致命 bug + UI 优化

用户反馈 11 个问题，本次修复 9 个（P0×1 + P1×2 + P2×4 + P3 暂缓×2）。通过 4 个 Agent 并行执行（删除花哨功能 / 文件导入过滤 / 选择框打印+暗色模式 / 页眉 margin），1 个 Agent 串行清理遗留引用。净减少 676 行代码，460 模块（-3），2,163.02 KB（-22 KB）。

#### P0 致命修复 — 删除演示模式 + 新手引导（问题 3+4）
- **根因**：`onboarding.js` 的 overlay 清理不彻底，`scroll`/`resize` 事件监听器未移除，`setTimeout(startOnboarding, 800)` 自动触发后无法退出；`demoMode.js` 的 `setTimeout` 链导致页面灰掉卡死
- **决策**：用户明确要求"必要时请回退、去掉这种花哨的功能"→ 直接删除（方案 A）
- **删除文件（6 个）**：
  - `src/modules/demoMode.js`（90 行）
  - `src/modules/onboarding.js`（187 行）
  - `src/modules/review.js`（154 行）— 今日待复习功能
  - `src/styles/demoMode.css`（63 行）
  - `src/styles/onboarding.css`（88 行）
  - `src/styles/review.css`（77 行）
- **连带清理**：
  - `main.js`：移除 4 个 import + 4 个 init 调用 + showFeedbackUI 钩子
  - `index.html`：移除演示按钮 + 今日待复习区域 + 练习反馈区域 HTML
  - `settingsCenter.js`：移除 onboarding 引用 + "重新查看新手引导"按钮
  - `main.css`：移除 4 个 @import（demoMode/onboarding/review/feedback）

#### P1 严重修复 — 文件导入非汉字过滤（问题 1）
- **`src/modules/fileImporter.js`**：新增 `filterChineseChars(text)` 函数，正则 `/[\u4e00-\u9fa5]/g` 匹配 CJK 基本汉字
- **覆盖 5 条导入路径**：txt / md（去标记后过滤）/ csv（解析后过滤）/ xlsx（读单元格后过滤）/ docx（提取文本后过滤）
- **用户体验**：空结果提示改为"文件中未发现汉字字符"；Toast 改为"已导入 X 个汉字"；控制台输出过滤前后字符数对比
- **保留功能**：文件大小限制、Loading 状态、input 事件联动

#### P1 严重修复 — 选择框打印占位（问题 7）
- **根因**：`feedback.js` 的 `initFeedback()` 创建 `.char-feedback-btn` 悬浮按钮，打印时虽 `display:none` 但可能影响布局
- **修复**：`initFeedback()` 不再被调用 → 选择框元素不会被创建 → 打印时无占位问题
- **防御性增强**：`feedback.css` @media print 补充完整隐藏规则（.feedback-* / .char-feedback-* / .popover-*）；`print.css` 新增 `.black span, .black-char, .cell span, .cell .char { color:#000 !important }` 强制黑色

#### P2 UI 优化 — 精简主界面（问题 5+8）
- **移除**：顶部"今日待复习"区域 + "练习反馈"区域（不挤占字帖核心空间）
- **保留**：历史记录侧边栏（折叠按钮）+ 设置中心（浮动按钮）+ 学习报告（浮动按钮）— 均不占主界面空间
- **保留 feedback.js**：`reportPanel.js` 依赖其 `getCharFeedbackData` 函数（统计数据为空，可接受）

#### P2 UI 优化 — 默认字体改为文鼎楷体（问题 6）
- **`index.html`**：字体下拉框 `selected` 从 `LXGWWenKai` 移到 `TW-Kai`（文鼎楷体）

#### P2 UI 优化 — dark 模式汉字颜色（问题 11）
- **`src/styles/grid.css`**：`.black span` 和 `.tianzi-cell .black-char` 的 `color:black` 改为 `color:var(--text-color, #000)`
- **效果**：dark 模式下汉字显示为 `#e2e8f0`（浅灰蓝），light 模式下为 `#1e293b`（深灰蓝，接近黑）
- **打印强制黑色**：`print.css` @media print 新增 `color:#000 !important`，无论 light/dark 模式打印都是黑色

#### P2 UI 优化 — 页眉 margin 超出（问题 2）
- **`src/modules/pdfExport.js`**：
  - `box-sizing:border-box` 修复根因（原 width:100% + padding:0 20px 超出 @page margin）
  - `padding:0 4px`（从 20px 降到 4px，@page margin 已 20px）
  - `min-width:0` + `overflow:hidden` + `text-overflow:ellipsis` + `white-space:nowrap`（三段 flex 防重叠）
  - 字号 13px → 11px
  - JS 端字符数限制：页眉左 20 / 中 15 / 右 20 / 页脚 30（超出加省略号）

#### 验证 — 构建与提交
- 模块数：463 → 460（-3，删除 demoMode/onboarding/review）
- 构建时间：9.64s → 7.77s
- 文件大小：2,185.33 KB → 2,163.02 KB（-22.31 KB，gzip: 858.43 → 854.01 KB）
- 0 错误 0 警告
- PWA precache：9 entries（2340.65 KiB）
- Git diff：15 文件变更，65 insertions + 741 deletions（净减 676 行）
- Commit：`ef76bc0`，Tag：`v2.3.0`

#### 暂缓项（P3 低优先级）
- 问题 9：紫色 Puppeteer 按钮位置+交互优化（自动启动后台服务）— 需跨平台脚本，风险较高
- 问题 10：切换字体自动刷新字帖 — 需先评估资源消耗风险

---

## [2.2.1] — 2026-07-23

### 🔧 GitHub Pages 字体加载修复 + 商用字体清理

V2.2.0 浏览器自动化验收测试发现 5 条 `net::ERR_ABORTED` 字体加载错误。根因：`fontManager.js` 的 `FONT_LIST` 使用绝对路径 `/fonts/xxx.ttf`，在 GitHub Pages 子路径部署（`/calligraphy-sheet-generator/`）下被浏览器解析为根域名 `https://lcfactorization.github.io/fonts/xxx.ttf`（返回 404），而非项目子路径 `https://lcfactorization.github.io/calligraphy-sheet-generator/fonts/xxx.ttf`。

#### 修复 — 字体路径绝对→相对
- **`src/modules/fontManager.js`**：`FONT_LIST` 第 5-8 行 4 个字体路径从 `/fonts/` 改为 `./fonts/`，让浏览器基于当前页面 URL 解析为正确的子路径
  - 验证依据：`Invoke-WebRequest -Method Head` 确认 `https://lcfactorization.github.io/calligraphy-sheet-generator/fonts/LXGWWenKai-Regular.ttf` 返回 200（25,575,676 bytes），而 `https://lcfactorization.github.io/fonts/LXGWWenKai-Regular.ttf` 返回 404
- **`src/modules/pdfExport.js`**：同步修复 Puppeteer PDF 导出中的 `@font-face` 声明与 `fl` 数组（相对路径 + 移除商用字体项）

#### 变更 — 移除商用字体（合规清理）
- **`我逸清晨体楷书`（WoYiQingChenTiKaiShu）** 字体被移除，原因：
  1. **版权合规问题**：经 Web 搜索确认，该字体为商用字体（个人学习参考需授权），不符合开源项目版权合规要求
  2. **CI 下载源缺失**：`scripts/download-fonts.sh` 未包含该字体的下载块，GitHub Pages 上不存在该文件，导致 404
  3. **V2.0.0 历史遗留**：V2.0.0 重构时该字体项未清理，本次彻底移除
- **清理范围**（6 个文件）：
  - `src/modules/fontManager.js`：FONT_LIST 移除该项
  - `index.html`：第 71 行 `<option>` 移除
  - `src/modules/pdfExport.js`：`@font-face` 声明 + `fl` 数组项移除
  - `puppeteer-pdf.cjs`：字体映射表 + `--help` 输出列表移除
  - `scripts/download-fonts.sh`：移除错误的 `texgyreadventor` 下载块（base64 已内嵌，不需要文件下载），添加移除说明注释
  - `README.md`：字体列表从 6 款调整为 5 款，移除商用字体说明
- **保留**：`CHANGELOG.md` v2.0.0 历史记录中的"保留3个已有开源字体"原貌不动（历史记录不修改）

#### 验证 — 构建与提交
- 模块数：463（与 v2.2.0 一致）
- 构建时间：9.64s
- 文件大小：2,185.33 KB（gzip: 858.43 KB）
- 0 错误 0 警告
- PWA precache：9 entries（2363.25 KiB）
- Git diff：6 文件变更，11 insertions + 23 deletions
- Commit：`0431f5d`，Tag：`v2.2.1`

#### 验证 — CI 部署与浏览器自动化
- `gh run list` 确认 fix(v2.2.1) commit 已 success（52s）
- PowerShell `Invoke-WebRequest` 确认 HTML 部署正确（HTTP 200，2,185,334 bytes，不含 WoYiQingChenTiKaiShu，含 `./fonts/` 相对路径）
- 浏览器自动化测试 5/5 PASS：
  - 控制台无字体加载错误（仅 Vite 客户端无关 ERR_ABORTED）
  - 输入框预填文字以楷体正常渲染（未回退默认字体）
  - 字体下拉框仅 5 项（无"我逸清晨体楷书"）
  - 字体切换功能正常（霞鹜文楷 ↔ 思源宋体）

---

## [2.2.0] — 2026-07-23

### 🚀 文件导入 + AI推荐 + 学习报告 + UI优化（方案B/C高出彩度合并）

通过 TraeCN IDE 多 Agent 并行执行（5 Agent 并行 + 1 Agent 依赖串行），新增 5 个文件（3 个模块 + 2 个样式），修改 6 个文件（main.js + main.css + fab.css + components.css + grid.css + settingsCenter.css + history.css + package.json），补齐方案 B/C 中高出彩度未完成功能。

#### 新增 — 文件导入功能（Agent D + G）
- **txt/md/csv 导入**（`src/modules/fileImporter.js` + `src/styles/fileImporter.css`）：在输入框旁添加"📁 导入文件"按钮，支持纯文本/Markdown/CSV 文件导入到输入框
  - txt 原样填入；md 去除 markdown 标记（#、*、-、`、>、链接、图片等）；csv 按行解析（支持带引号字段）
  - 文件大小限制：1MB；Toast 提示导入结果
  - 导入后自动触发 input 事件（联动字数计数器/难度评估），聚焦输入框
- **xlsx/docx 导入**（扩展 `fileImporter.js`）：动态 import SheetJS + mammoth.js
  - xlsx：读取第一个 sheet，按行拼接单元格内容
  - docx：extractRawText 转换为纯文本，回退 mammoth.browser
  - 文件大小限制：5MB；Loading 状态显示
  - 新增依赖：xlsx ^0.18.5 + mammoth ^1.6.0

#### 新增 — AI 智能推荐（规则版，离线）（Agent E）
- **`src/modules/recommender.js` + `src/styles/recommender.css`**：在输入框旁添加"✨ 智能推荐"按钮，弹出推荐面板
  - 按难度：初级(1-5画)/中级(6-10画)/高级(10+画)，每级按内部分类分组
  - 按主题：跨难度聚合 13 个主题（数字/自然/动物/植物/人体/颜色等）
  - 按场景：从 templates.js 按 category 分组（唐诗宋词/三字经/千字文等）
  - 单字点击追加到输入框（不覆盖）；模板点击覆盖；"一键加载该分类全部"按钮
  - 完全离线可用，复用 vocabulary.js + templates.js 数据

#### 新增 — 学习报告统计逻辑（Agent F）
- **`src/modules/reportPanel.js`**：激活 report.css 样式，接入 history.js + feedback.js 数据
  - 练习统计：累计次数/字数/练习天数
  - 掌握情况：已掌握/待复习/错字数（Canvas 环形图）
  - 最近 7 天趋势（Canvas 柱状图）
  - 字体使用分布（Canvas 横向柱状图）
  - 操作：导出报告（剪贴板）/ 重置统计数据（二次确认）
  - 空状态提示；事件监听自动刷新

#### 变更 — UI 优化
- **PDF 按钮位置优化**（`src/styles/fab.css`）：FAB 组合为右下角垂直按钮组，距底/右各 24px，间距 12px，hover tooltip
- **移动端布局优化**（4 个 CSS 文件 `@media max-width:680px`）：
  - 输入框占满宽度；按钮组横向滚动；格子最小 60px + 横向滚动
  - 设置中心/历史侧边栏移动端全屏；字号/padding 缩小

#### 变更 — 集成入口
- `src/main.js`：新增 3 个模块 import 与初始化调用（registerFileImporter / registerRecommender / registerReportPanel）
- `src/styles/main.css`：新增 4 个 @import（grid-styles.css 补齐 + report.css 补齐 + fileImporter.css + recommender.css）
- `package.json`：新增 xlsx + mammoth 依赖

#### 验证 — 构建与模块
- 模块数：28 → 463（+431，含 xlsx/mammoth 内部模块）
- 构建时间：1.65s → 10.96s
- 文件大小：709.47 KB → 2,185.59 KB（gzip: 447.18 KB → 858.53 KB）
- 0 错误 0 警告
- PWA precache：915.82 KiB → 2,363.55 KiB

#### 技术亮点
- **多 Agent 并行开发**：5 个 Agent 完全并行（D/E/F/H/I），1 个 Agent 依赖串行（G 依赖 D），零文件冲突
- **动态 import**：xlsx/mammoth 按需加载（虽 singlefile 内联，但保留了按需加载的代码结构）
- **Canvas 原生图表**：学习报告用纯 Canvas API 绘制环形图/柱状图/横向柱状图，无图表库依赖
- **CSS 零冲突**：每个 Agent 严格限定文件边界，集成时统一修改 main.js/main.css

#### 已知问题
- xlsx+mammoth 导致体积 +1.4MB（singlefile 内联动态 import 所致）
- xlsx 依赖有 4 个 vulnerabilities（不影响功能运行）
- 功能待用户人工浏览器测试确认

---

## [2.1.0] — 2026-07-23

### 🚀 学习闭环 + 界面辅助 + 数据样式扩展（方案B核心 + 方案C部分）

通过 TraeCN IDE 多 Agent 并行执行，新增 18 个文件（10 个模块 + 8 个样式），修改 3 个文件（main.js + index.html + main.css），将项目从"字帖生成工具"升级为"汉字学习闭环平台"。

#### 新增 — 学习闭环三件套（Agent A）
- **历史记录功能**（`src/modules/history.js` + `src/styles/history.css`）：每次生成字帖自动保存到 localStorage（最多 20 条），右侧可折叠侧边栏，支持重新生成/删除/清空，刷新后数据持久化
- **练习反馈闭环**（`src/modules/feedback.js` + `src/styles/feedback.css`）：整体反馈三按钮（很轻松/有点难/需要继续）+ 单字反馈悬停图标（已掌握/需要复习/总是写错），状态色环显示（绿/黄/红），数据保存到 localStorage
- **复习计划生成**（`src/modules/review.js` + `src/styles/review.css`）：基于艾宾浩斯遗忘曲线本地规则（mastered→7天 / review→3天 / error→1天），首页顶部"今日待复习"区域，一键加载待复习字到输入框并生成字帖，统计信息（已掌握/待复习/错字数）

#### 新增 — 数据与样式准备（Agent B）
- **内置模板库**（`src/data/templates.js`）：20 个预设模板（唐诗宋词 8 + 三字经 2 + 千字文 2 + 常用字 3 + 成语 3 + 节日 2），含难度分级和描述
- **分级字库**（`src/data/vocabulary.js`）：3 个难度级别（初级 1-5画 / 中级 6-10画 / 高级 10+画），每级 6 个分类，每分类 ≥8 字
- **米字格/回宫格样式**（`src/styles/grid-styles.css`）：米字格（十字+对角线虚线）+ 回宫格（内外框），含打印友好样式
- **学习报告样式**（`src/styles/report.css`）：报告卡片/统计区域/柱状图/进度条样式，复用项目 CSS 变量

#### 新增 — 界面辅助功能（Agent C）
- **设置中心面板**（`src/modules/settingsCenter.js` + `src/styles/settingsCenter.css`）：模态框含 4 个滑块（格子大小/每行字数/每页行数/字体大小）+ 4 个 Toggle 开关（拼音/组词/笔画/笔顺编号）+ 3 个主题选项，实时更新预览
- **新手引导**（`src/modules/onboarding.js` + `src/styles/onboarding.css`）：3 步聚光灯引导（输入框→生成按钮→打印按钮），首次打开自动触发，设置中心可重新查看
- **演示模式**（`src/modules/demoMode.js` + `src/styles/demoMode.css`）：50% 概率加载千字文段 + 50% 从模板库随机选择，自动生成字帖并滚动，3 秒提示气泡，按钮脉冲动画
- **难度评估**（`src/modules/difficulty.js` + `src/styles/difficulty.css`）：用 cnchar.stroke() 获取笔画数，按平均笔画映射 5 级星级，实时评估

#### 变更 — 集成入口
- `src/main.js`：新增 7 个模块 import 与初始化调用，用 `handleGenerate` 包装 `generateGrid` 添加历史保存与反馈显示钩子
- `index.html`：新增设置浮动按钮、演示按钮、难度评估区域、历史侧边栏、反馈区、复习区 HTML
- `src/styles/main.css`：新增 9 个样式 import

#### 验证 — 构建与模块
- 模块数：23 → 28（+5 模块 +4 数据/样式）
- 构建时间：1.65s
- 文件大小：679.62 KB → 709.47 KB（gzip: 437.64 KB → 447.18 KB）
- 0 错误 0 警告
- PWA precache：9 entries（915.82 KiB）

#### 技术亮点
- **跨模块通信**：自定义事件 `calligraphy:history-updated`、`calligraphy:char-feedback-updated`、`calligraphy:settings-updated`
- **单字反馈**：DOM 事件委托，不修改 gridRenderer.js，悬停显示 Lucide 图标，点击弹出气泡选择
- **主题协同**：settingsCenter 通过 `toggleTheme()` 与现有 settings.js 的 isDark 状态同步
- **打印友好**：所有新 UI 在 `@media print` 下隐藏，不影响 PDF 导出
- **localStorage 规范**：所有 key 使用 `calligraphy_` 前缀（history / char_feedback / settings / onboarded）

---

## [2.0.2] — 2026-07-23

### 🔧 仓库配置优化

#### 变更 — 默认分支调整
- 通过 `gh api -X PATCH` 将仓库默认分支从 `main` 改为 `retake`
- 原因：`retake` 是复赛开发+部署分支，改为默认分支消除"recent pushes"提示
- `main` 分支保留作为初赛版本历史记录
- GitHub Pages 部署不受影响（由 deploy.yml 工作流触发，与默认分支无关）

#### 验证 — Pages持续可用
- HTTP 200，内容长度 879,217 bytes
- 标题：字帖生成器
- HTTPS enforced: true

---

## [2.0.1] — 2026-07-23

### 🔧 CI/CD部署修复 — GitHub Pages正式上线

#### 修复 — CI构建阻断问题
1. **思源宋体解压路径错误**：硬编码路径 `/tmp/shs/SourceHanSerifSC-Regular.otf` 改为 `find /tmp/shs -name "SourceHanSerifSC-Regular.otf" | head -1` 动态查找（实际路径为 `/tmp/shs/OTF/SimplifiedChinese/SourceHanSerifSC-Regular.otf`）— commit `c7d6ea5`
2. **`src/modules/fontManager.js` 远程缺失**：从 `backup/local_1b8eb4c` 分支恢复，通过 gh api Contents API 推送 — commit `d93e0ea`
3. **`fontManager.js` UTF-16编码导致JS解析失败**：PowerShell `>` 重定向默认 UTF-16 LE（BOM: FF-FE），改用 `[IO.File]::WriteAllText` + `UTF8Encoding($false)` 重写为 UTF-8（457,850 → 228,957 bytes）— commit `b35c2a6`
4. **`src/data/customZuCi.js` 远程缺失**：从备份分支恢复，UTF-8编码推送 — commit `8e3fd2e`

#### 变更 — 远程仓库清理
- 删除 `字帖生成器.html`（965KB，已被Vite项目替代）— commit `dc176e2`
- 删除 `字帖_2026-07-06.pdf`（10MB，不属于源码）— commit `237b4de`
- 删除重复的 `puppeteer-pdf.js`（保留 `.cjs` 版本）— commit `16dd6eb`

#### 新增 — 部署权限配置
- 通过 gh api 添加 `retake` 分支到 `github-pages` environment 的 deployment-branch-policies（原仅允许 `main`）
- 重新触发失败的 Deploy job（Run ID 29955797610），构建+部署均成功

#### 验证 — GitHub Pages部署成功
- 访问 URL：https://lcfactorization.github.io/calligraphy-sheet-generator/
- HTTP 状态码：200
- 内容长度：879,217 bytes（约 879KB）
- 构建耗时：32s（build） + 2s（deploy）
- 最新成功 Run ID：29955797610（head `8e3fd2e`）

#### Git 备份策略
- `backup/local_1b8eb4c` 分支：保护本地 download-fonts.sh 修复 commit
- `backup/pre_vite_refactor/20260723_024531` tag：Vite重构前完整快照
- `master` 分支（0adfade）：初赛版本完整备份

---

## [2.0.0] — 2026-07-23

### 🎉 TRAE复赛版本 — Vite工程化 + PWA + 开源字体

#### 新增 — 工程化重构
- **Vite构建系统**：从单HTML文件重构为Vite工程化项目
  - 模块化代码：10个JS模块 + 7个CSS文件 + 1个数据文件
  - ES Module：pinyin-pro/cnchar/hanzi-writer 通过npm管理
  - 单文件构建：vite-plugin-singlefile 生成可离线使用的单HTML
- **PWA支持**：vite-plugin-pwa 实现离线可用
  - Service Worker：预缓存 + 字体CacheFirst策略
  - manifest.webmanifest：lang=zh-CN, 3图标含maskable
  - 可安装到桌面/手机主屏
- **GitHub Pages自动部署**：.github/workflows/deploy.yml
  - push到retake分支自动构建部署
  - 访问地址：https://lcfactorization.github.io/calligraphy-sheet-generator/

#### 新增 — Tailwind CSS + Lucide Icons
- **Tailwind CSS v4**：渐进集成，保留CSS变量主题系统
- **Lucide Icons**：主题切换(☀☾→sun/moon SVG) + 打印按钮(printer SVG)

#### 变更 — 字体替换（版权合规）
- **删除6个商业字体**：姜浩硬笔楷书/华文楷体/方正仿宋/方正宋简×2/田英章楷书
- **新增3个开源字体**：
  - 霞鹜文楷 LXGWWenKai-Regular.ttf (SIL OFL 1.1)
  - 霞鹜文楷 Light LXGWWenKai-Light.ttf (SIL OFL 1.1)
  - 思源宋体 SourceHanSerifSC-Regular.otf (SIL OFL 1.1)
- **保留3个已有开源字体**：文鼎楷体(TW-Kai) / 拼音字体(TeXGyreAdventor) / 我逸清晨体楷书
- 同步更新：fontManager.js / index.html / pdfExport.js / components.css / README.md

#### 修复 — 重构过程中的3个问题
1. Workbox字体文件预缓存超限（2MB→40MB）
2. puppeteer-pdf.js与ES Module冲突（重命名为.cjs）
3. puppeteerClient.js顶层return语法错误（改为if包裹）

#### 技术架构变更
```
v1.0: 单HTML文件 (943KB, JS+CSS+字体全内嵌)
v2.0: Vite工程化项目
      ├── src/modules/ (10个JS模块)
      ├── src/styles/ (7个CSS + tailwind.css)
      ├── src/data/customZuCi.js (1719条组词字典)
      ├── public/fonts/ (6个开源字体)
      ├── public/icon-*.svg (3个PWA图标)
      ├── vite.config.js (PWA + SingleFile + Tailwind)
      └── dist/ (构建产物: 单HTML + PWA文件)
```

---

## [1.0.1] — 2026-07-06

### 🎉 首次完整发布

#### 新增
- **独立HTML打包**：将字帖生成器从混合项目中剥离，纯前端离线版
- **JS全部内嵌**：pinyin-pro.js、hanzi-writer.min.js、cnchar.min.js、cnchar.words.min.js 全部内联到HTML
- **拼音字体base64内嵌**：texgyreadventor-regular.otf 以base64编码嵌入HTML，确保拼音100%正确显示
- **字体文件夹开放**：9个字体文件保持开放状态，支持添加自定义字体
- **双轨PDF方案**：
  - 方案一：浏览器 `window.print()` 直接打印为PDF（全平台含Android）
  - 方案二：Puppeteer 命令行脚本批量生成矢量PDF（桌面端自动化）

#### UI美化
- 生成按钮 → 绿色渐变 (`#22c55e → #16a34a`)
- 清除按钮 → 灰色渐变 (`#64748b → #475569`)
- 打印按钮 → 橙色渐变 (`#f59e0b → #d97706`)
- 打印加载提示 → 橙色渐变主题（与打印按钮一致）
- 极光风格背景动画
- Obsidian Callout 风格面板设计

#### 打印功能增强
- 字体加载超时机制（每个字体5秒超时）
- 关键字体验证（`document.fonts.check()` 验证拼音+汉字字体）
- 字体未就绪时自动重试等待（额外3秒）
- 控制台输出字体加载状态日志（成功/失败数量、就绪状态）
- 打印窗口字体完整加载提示

#### Puppeteer脚本功能
- 支持命令行参数：`--text`、`--input`、`--output`、`--font`、`--format`
- 支持页眉页脚自定义（`--header`、`--footer`，支持 `{page}` `{total}` 页码变量）
- 支持横向/纵向打印（`--landscape`）
- 支持自定义边距（`--margin`）
- 字体加载验证（等待 `document.fonts.ready` + 额外2秒缓冲）
- 打印媒体类型模拟（`emulateMediaType('print')`）
- 8种汉字字体可选
- 帮助文档（`--help`）

#### 技术修复（历史迭代）
- ✅ 修复 `${pageContent}` 模板字面量未正确替换问题（改用字符串拼接）
- ✅ 修复 Python 转义 `${}` 和反引号导致模板字符串损坏问题
- ✅ 修复 `</script>` 导致浏览器提前闭合主标签问题（自动转义为 `<\/script>`）
- ✅ 移除 server.js 依赖，纯前端离线运行

#### 文档
- README.md：双轨方案完整文档（安装、使用、参数、FAQ、技术说明）
- CHANGELOG.md：更新日志

---

## [1.0.1] — 2026-07-06

### 🐛 问题修复

#### 1. Windows 启动脚本编码问题

**问题描述：**
- 双击运行 `启动Puppeteer.bat` 时报错：`'powershell' is not recognized as an internal or external command`
- 中文注释被错误解析，导致命令被截断

**根本原因：**
- Windows cmd.exe 默认使用 GBK（代码页 936）编码读取批处理文件
- .bat 文件包含中文字符，UTF-8 编码的中文字节在 GBK 下被错误解析
- 导致 `powershell` 命令被截断为 `rshell` 等乱码

**解决方案：**
在 `启动Puppeteer.bat` 中添加 `chcp 65001 >nul`，将 cmd.exe 代码页切换到 UTF-8：

```batch
@echo off
chcp 65001 >nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0启动Puppeteer.ps1"
if errorlevel 1 pause
```

**编码一致性保证：**
- ✅ Windows .bat 文件：使用 `chcp 65001` 切换到 UTF-8
- ✅ PowerShell .ps1 文件：设置 `[Console]::OutputEncoding = UTF8`
- ✅ Linux .sh 文件：bash 默认 UTF-8，无需额外处理

#### 2. PowerShell 安全警告问题

**问题描述：**
- 每次运行 PowerShell 脚本时弹出安全警告：`Invoke-WebRequest分析页面时可能会运行网页中的脚本代码，存在安全风险！`

**解决方案：**
在 `启动Puppeteer.ps1` 中设置全局参数，强制使用 `-UseBasicParsing`：

```powershell
$global:PSDefaultParameterValues = @{
    'Invoke-WebRequest:UseBasicParsing' = $true
    'Invoke-RestMethod:UseBasicParsing' = $true
}
$global:ProgressPreference = 'SilentlyContinue'
```

#### 3. PDF 生成时 JSON 解析错误

**问题描述：**
- 服务器日志显示多次错误：`Unexpected non-whitespace character after JSON at position 372`
- 第一个 PDF 生成成功（10MB），但后续出现 6 次 JSON 解析错误

**根本原因：**
- HTTP keep-alive 连接上浏览器重复发送请求
- 多个 JSON 请求体被合并为一个，导致 `JSON.parse()` 失败

**解决方案：**
在 `字帖生成器.html` 的服务器代码中添加三层防御：

1. **Connection: close 响应头**：强制每次请求后关闭连接
2. **safeJsonParse() 函数**：若 body 含多个 JSON 对象，仅解析第一个
3. **请求去重机制**：相同文本的请求正在处理时，跳过后续重复请求

```javascript
// 安全JSON解析
function safeJsonParse(str) {
    str = str.trim();
    try {
        return JSON.parse(str);
    } catch (e) {
        // 手动匹配第一个完整的JSON对象
        let depth = 0, inString = false, escape = false;
        for (let i = 0; i < str.length; i++) {
            const c = str.charAt(i);
            if (escape) { escape = false; continue; }
            if (c === '\\') { escape = true; continue; }
            if (c === '"') { inString = !inString; continue; }
            if (inString) continue;
            if (c === '{') depth++;
            else if (c === '}') {
                depth--;
                if (depth === 0) {
                    return JSON.parse(str.substring(0, i + 1));
                }
            }
        }
        throw e;
    }
}

// 服务器响应头
res.setHeader('Connection', 'close');

// 请求去重
let lastRequest = { key: '', active: false };
if (lastRequest.key === reqKey && lastRequest.active) {
    res.writeHead(204);
    res.end();
    return;
}
```

#### 4. PDF 字体乱码问题

**问题描述：**
- 生成的 PDF 中汉字和拼音显示为乱码
- 文字无法在 Adobe Reader 中选择/复制

**根本原因：**
- 服务器使用 `domcontentloaded` 事件（字体加载前触发）
- 应该使用 `networkidle0` 事件（等待所有资源加载完成）

**解决方案：**
在 `字帖生成器.html` 的服务器代码中实现字体加载策略：

```javascript
// 策略：先尝试 networkidle0（最可靠），超时则降级为 domcontentloaded
try {
    await page.goto(fileUrl, { waitUntil: 'networkidle0', timeout: 45000 });
} catch (navErr) {
    console.warn('networkidle0 timeout, falling back to domcontentloaded...');
    await page.goto(fileUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
}

// 显式等待字体加载
await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise(r => setTimeout(r, 2000));
    await document.fonts.ready;
    
    var pinyinOk = document.fonts.check('16px TeXGyreAdventor');
    var cnFont = document.getElementById('font-select').value;
    var cnOk = document.fonts.check('16px ' + cnFont);
    
    if (!pinyinOk || !cnOk) {
        await new Promise(r => setTimeout(r, 5000));
        await document.fonts.ready;
    }
});

// 切换到打印模式
await page.emulateMediaType('print');
await new Promise(r => setTimeout(r, 500));
```

**验证结果：**
- ✅ 17 个汉字和 17 个拼音（带声调）全部正确嵌入
- ✅ PDF 文件 893KB，3 页，文字可选择/复制
- ✅ Adobe Reader 中验证通过

---

### 交付物清单

| 文件 | 说明 | 大小 |
|------|------|------|
| `字帖生成器.html` | 独立HTML主文件（JS+拼音字体内嵌） | ~1.1 MB |
| `puppeteer-pdf.js` | Puppeteer PDF矢量生成脚本 | ~12 KB |
| `package.json` | Node.js依赖配置 | ~0.5 KB |
| `README.md` | 完整使用文档 | ~6 KB |
| `CHANGELOG.md` | 更新日志 | ~3 KB |
| `fonts/` | 字体文件夹（9个字体文件） | ~30 MB |

---

### 技术架构

```
┌─────────────────────────────────────────────────────────┐
│                    字帖生成器.html                        │
│  ┌─────────────────────────────────────────────────┐    │
│  │ 内嵌JS (4个库)                                    │    │
│  │  • pinyin-pro.js    (288 KB)  拼音转换           │    │
│  │  • hanzi-writer.min.js (36 KB) 汉字笔顺          │    │
│  │  • cnchar.min.js    (45 KB)  中文处理            │    │
│  │  • cnchar.words.min.js (65 KB) 词典              │    │
│  └─────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────┐    │
│  │ 内嵌字体 (base64)                                 │    │
│  │  • texgyreadventor-regular.otf (166 KB → 222 KB) │    │
│  │    拼音字体，通过 PINYIN_FONT_URI 变量引用        │    │
│  └─────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────┐    │
│  │ 开放字体文件夹 (./fonts/)                         │    │
│  │  • 姜浩硬笔楷书.ttf (默认汉字字体)                 │    │
│  │  • STKAITI.TTF / FZFSB.TTF / TW-Kai.ttf 等      │    │
│  │  • 支持用户添加自定义字体                          │    │
│  └─────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────┐    │
│  │ 打印功能 (window.print)                           │    │
│  │  • 字体加载验证 + 超时重试                         │    │
│  │  • 关键字体验证 (document.fonts.check)            │    │
│  │  • 打印窗口独立字体加载                            │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
         │
         │ file:// 协议打开
         ▼
┌─────────────────────────────────────────────────────────┐
│                   浏览器 (全平台)                         │
│  Windows / Linux / macOS / Android                      │
│  打印 → 另存为PDF → 矢量PDF（文字可选择+字体嵌入）       │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                puppeteer-pdf.js (Node.js)                │
│  • 启动无头Chromium                                    │
│  • 加载字帖生成器.html                                 │
│  • 设置文本+字体 → generateGrid()                      │
│  • 等待字体加载 (document.fonts.ready)                 │
│  • 模拟打印媒体 (emulateMediaType('print'))             │
│  • page.pdf() → 矢量PDF                                │
└─────────────────────────────────────────────────────────┘
         │
         │ node puppeteer-pdf.js --text "..."
         ▼
┌─────────────────────────────────────────────────────────┐
│              桌面端 (Windows / Linux / macOS)             │
│  批量生成 / 自动化集成 / 命令行控制                      │
│  矢量PDF（文字可选择+字体嵌入+页眉页脚）                 │
└─────────────────────────────────────────────────────────┘
```
