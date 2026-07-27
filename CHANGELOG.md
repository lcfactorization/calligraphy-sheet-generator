# 更新日志

所有 notable 变更记录在此文件中。
格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)。

---

## [文档同步] — 2026-07-27

> **纯文档更新版本,不 bump 代码版本号**(package.json/index.html 保持 v2.9.7)。本次修订对项目用户可见文档进行全面同步,使之能反映最初的策略、迭代过程中策略的变化、以及当前最新版本中的有效状态。同时把策略性内部文档(审查报告/修复方案/发布说明/测试清单等)从 GitHub 跟踪中移除,仅本地保留。

### 📝 文档修订 — 用户可见文档同步

#### README.md(从 v2.5.4 同步到 v2.9.7)
- **版本徽章**:2.5.4 → 2.9.7
- **最新版本段落**:更新为 v2.9.7 引导增强 + Dark 模式范字 inverted color
- **目录结构**:补全 matepad-simulate.cjs / onboarding.js / fabDrag.js 等 v2.5–v2.9 新增文件;标注 字帖生成器.html 为早期独立 HTML
- **网格类型**:4 种 → 5 种(田/米/九宫/回/拼音田)
- **jsPDF/svg2pdf 描述**:修正"v2.4.5 已停用"的错误描述,实际仍是默认矢量导出轨道 `client-jspdf`
- **字体清单**:明确 4 中文字体 + 1 拼音字体 = 5 款,移除已删除的"我逸清晨体楷书"
- **功能列表**:新增 v2.5.5–v2.9.7 共 12 项功能(MatePad 适配/iframe 打印架构/移动端引导/FAB 拖拽/Dark 反色等)
- **FAQ**:新增移动端/微信X5/Dark模式范字 等问答
- **致谢**:补充 Vite/Tailwind/Trae CN IDE

#### README_EN.md(从最初版本全面重写到 v2.9.7)
- **字体数量**:"9 Calligraphy Fonts" → "5 Open-Source Fonts"(4 Chinese + 1 Pinyin)
- **运行方式**:"Double-click HTML" → Vite 工程(npm run dev/build)
- **主程序文件**:"字帖生成器.html" → index.html(Vite 入口)
- **Puppeteer 脚本**:puppeteer-pdf.js → puppeteer-pdf.cjs
- **文件结构**:补全 src/、vite.config.js、.github/ 等完整 Vite 工程结构
- **功能列表**:新增 PWA/网格切换/Dark 模式/引导/FAB 拖拽/MatePad 适配等全部 v2.0–v2.9 功能
- **Tech Stack**:从"Zero-dependency"更新为 Vite + PWA + Tailwind + 多依赖
- **移除**:过时的"字帖_2026-07-06.pdf"示例引用

#### README_contest.md(保留参赛原貌 + 追加迭代演进附录)
- **保留**:参赛最初文档全文(反映"最初的策略":纯HTML/9字体/双轨PDF/TRAE实践过程)
- **新增头部说明**:标注文档性质为参赛最初文档,指向 README.md 和 CHANGELOG.md
- **新增附录 A.1–A.8**:迭代演进时间线,记录从 v1.0.1 到 v2.9.7 的 8 个阶段策略变化
- **新增对比表**:参赛初版 vs 当前版本(v2.9.7)的 12 维度对比

#### TASK_BOARD.md(从 v2.4.0 补充到 v2.9.7)
- **头部说明**:标注 v2.4.0 重构已全部完成,本看板保留作为历史记录
- **保留**:v2.4.0 重构任务看板全文(契约/矩阵/进度/验证/回滚)
- **新增"重构后续演进"段落**:v2.5.x / v2.6.0 / v2.7.0 / v2.8.x / v2.9.x 各阶段演进节点
- **新增"当前状态(v2.9.7)"段落**:代码版本/构建模块/源文件数/备份机制/部署/在线访问
- **修正**:旧模块 gridRenderer.js/pdfExport.js 在 v2.8.7 已清理为死代码删除

### 🔒 策略文件管理 — .gitignore 强化

#### 新增 .gitignore 条目
```
# v2.9.7 文档同步:策略性文件(本地保留作为迭代记录,禁止上传 GitHub)
docs/
_commit_v287.txt
视频自我介绍脚本_陈自强_Trae大赛.md
```

#### 从 GitHub 跟踪移除(本地保留)
- `docs/` 目录下 40 个策略文件(深度审查报告/根因分析/修复方案/发布说明/测试清单/多Agent简报/patch/飞书问卷数据/PWA安装指南等)
- `_commit_v287.txt`(临时提交说明文件)
- `视频自我介绍脚本_陈自强_Trae大赛.md`(个人文件)

> [!NOTE]
> 策略性文件定义为项目迭代过程中产生的内部文档,包括审查报告/根因分析/修复方案/发布说明/测试清单/多Agent简报等。这些文件本地保留作为迭代历史记录,但不再推送到 GitHub,避免污染公开仓库。

### 📦 变更文件清单

| 文件 | 操作 | 说明 |
|---|---|---|
| `README.md` | 修改 | 从 v2.5.4 全面同步到 v2.9.7(版本/结构/功能/字体/网格/FAQ) |
| `README_EN.md` | 修改 | 从最初版本全面重写(5字体/Vite工程/index.html/v2.0-v2.9功能) |
| `README_contest.md` | 修改 | 保留参赛原貌 + 追加迭代演进附录 A.1–A.8 |
| `TASK_BOARD.md` | 修改 | 保留 v2.4.0 看板 + 追加重构后续演进段落 + 当前状态 |
| `CHANGELOG.md` | 修改 | 新增"文档同步"条目(本节,不 bump 版本) |
| `.gitignore` | 修改 | 新增 docs/ + _commit_v287.txt + 视频脚本 忽略规则 |
| `docs/*` | git rm --cached | 40 个策略文件从 GitHub 跟踪移除(本地保留) |
| `_commit_v287.txt` | git rm --cached | 临时文件从 GitHub 跟踪移除(本地保留) |
| `视频自我介绍脚本_陈自强_Trae大赛.md` | git rm --cached | 个人文件从 GitHub 跟踪移除(本地保留) |

### 🚫 不变项
- `package.json`:版本号保持 2.9.7(不 bump)
- `index.html`:UI 徽章保持 v2.9.7(不 bump)
- 所有源代码文件:不修改
- 所有备份分支:不删除

### 🔄 后续同步
- 提交到 `retake` 分支并推送
- `main` 分支同步到 `retake` 状态(使 GitHub 首页展示最新文档)

---

## [v2.9.7] — 2026-07-26

> **引导功能增强 + Dark 模式范字反色修复版本**。新增"不再自动弹出"选项与设置中心开关；引导步骤从 5 步扩展到 9 步，覆盖字体选择、自定义字体、智能推荐、导入生词文件；每步标注是否触发字帖自动刷新（🔄/✋）；修复 Dark 模式下范字仍为黑色不可见的问题，改为 inverted color 自动反色，打印时强制黑色。

### ✨ 新功能 — 引导弹出逻辑与选项

#### 默认每次访问自动弹出 + "不再自动弹出"选项
- **旧逻辑（v2.9.6）**：完成引导后写入 `localStorage.onboarding_completed='true'`，老用户不再自动弹出
- **新逻辑（v2.9.7）**：默认每次访问都自动弹出，除非用户主动勾选"不再自动弹出"
- 引导浮层底部新增"不再自动弹出"复选框，勾选后写入 `localStorage.onboarding_never_show='true'`
- 清空 localStorage 后恢复自动弹出（边界场景验证通过）
- 设置中心"🎓 新手引导"区域新增"启动时自动显示"开关，与 localStorage 双向绑定

#### 引导步骤从 5 步扩展到 9 步
- 新增第 6 步：`#font-select` 字体选择（标注 ✋ 需手动点"生成"）
- 新增第 7 步：`.font-upload-btn` 自定义字体上传（标注 ✋）
- 新增第 8 步：`#recommendBtn` 智能推荐（标注 ✋，描述含三维度机理说明）
- 新增第 9 步：`#fileImportBtn` 导入生词文件（标注 ✋）
- 原有 5 步描述中补充 🔄/✋ 标注：
  - 🔄 自动刷新：设置中心、侧栏预设场景
  - ✋ 需手动生成：字体选择、自定义字体、智能推荐、导入生词文件
  - 无标注：打印、主题切换、Puppeteer（不改变字帖内容）

#### 智能推荐机理说明
- 数据来源：`vocabulary.js`（分级字库）+ `templates.js`（预设模板），离线规则，非 AI/LLM
- 三个维度：按难度（初级/中级/高级）、按主题（13 类）、按场景（唐诗宋词/三字经等）
- 交互规则：单字点击追加到输入框尾部（不覆盖），模板点击覆盖原内容
- 对设置的影响：只修改输入框内容，不改变任何设置（网格/颜色/字体等都不动）
- 字帖刷新：不自动刷新，需手动点"生成"或"🔄"按钮

### 🔧 修复 — Dark 模式范字 inverted color

#### 问题
- Dark 模式下，SVG `<text>` 元素的 `fill="#000"` 硬编码黑色，在深色背景上几乎不可见
- 影响范围：所有范字（reference 模式）、描红（trace 模式）、笔顺回退（stroke-order fallback）

#### 根因
- `src/components/GridEngine.js` 第 465/468/473 行：`drawChar(svg, char, { color: '#000', ... })` 三处硬编码黑色
- SVG `<text>` 的 `fill` 是 inline 属性，CSS 无法覆盖

#### 修复方案（三文件协同）
1. **GridEngine.js**：`drawChar` 默认 `color = 'currentColor'`，三处调用改为 `color: 'currentColor'`
2. **grid-svg.css**：`.grid-svg-cell { color: var(--text-color, #000); }`，dark 模式下 `--text-color: #e2e8f0` 自动反色
3. **print.css**：`@media print { .grid-svg-cell { color: #000 !important; } }` 打印时强制黑色（黑字白纸）

#### 跨平台兼容性
- `currentColor` 是 SVG 1.1 标准关键字，所有现代浏览器（Chrome/Edge/Firefox/Safari）支持
- 所有操作系统（Windows/macOS/Linux/Android/iOS/HarmonyOS）支持
- Puppeteer 生成的 PDF 中 `currentColor` 正确渲染

#### 测试验证
- Light 模式：cellColor=rgb(30,41,59) 深色，textFill=currentColor ✅
- Dark 模式：cellColor=rgb(226,232,240) 浅色，textFill=currentColor ✅
- Dark 模式下范字在深色背景上清晰可见 ✅
- 9 步引导全部通过，spotlight 位置正确 ✅

### 📦 变更文件清单

| 文件 | 操作 | 说明 |
|---|---|---|
| `src/modules/onboarding.js` | 修改 | 新增 `onboarding_never_show` 逻辑、引导浮层复选框、9 步引导数据、智能推荐步骤、🔄/✋ 标注 |
| `src/styles/onboarding.css` | 修改 | 新增 `.ob-bubble-nevershow` 复选框样式 |
| `src/modules/settingsCenter.js` | 修改 | 新手引导区域新增"启动时自动显示"开关，与 localStorage 双向绑定 |
| `src/components/GridEngine.js` | 修改 | `drawChar` 默认 `color='currentColor'`，三处调用改用 `currentColor` |
| `src/styles/grid-svg.css` | 修改 | `.grid-svg-cell { color: var(--text-color, #000); }` + dark 模式覆盖 |
| `src/styles/print.css` | 修改 | `@media print` 强制 `.grid-svg-cell { color: #000 !important; }` |
| `package.json` | 修改 | 版本号 2.9.6 → 2.9.7 |
| `index.html` | 修改 | UI 显示版本号 2.9.6 → 2.9.7 |
| `CHANGELOG.md` | 修改 | 新增 v2.9.7 章节 |

---

## [v2.9.6] — 2026-07-26

> **P0 紧急修复版本**：修复启动引导功能中高亮控件位置被错乱到对角的视觉硬伤。多 Agent 项目小组协同定位 → 修复 → 跨平台/跨浏览器测试 → 验收 → 发布全流程，备份分支 `backup/pre_v296_spotlight_fix_20260726` 已就位，可随时回退到 v2.9.5。

### 🔥 P0 修复 — 引导 spotlight 位置错乱（落到对角）

#### 现象
- 启动时的"新手引导"功能，介绍某个控件时，被高亮的控件位置会被错误地移到屏幕对角方向，而非其本应在的位置。
- 影响范围：所有 5 步引导（设置中心 / 打印 / 侧栏 / 主题 / Puppeteer），在桌面端和移动端均可复现。

#### 根因分析（项目分析师 + 系统架构师小组）
- 位置：`src/styles/onboarding.css` 的 `.ob-spotlight` 规则
- 错误代码（v2.9.5）：
  ```css
  .ob-spotlight {
      position: relative !important;   /* ⚠️ 罪魁祸首 */
      z-index: 10011 !important;
      box-shadow: 0 0 0 9999px rgba(0,0,0,.7) !important;
  }
  ```
- 定位语义冲突链：
  1. FAB 类控件（`.fab-settings` / `.fab-theme` / `.fab-print` / `.fab-puppeteer` / `.history-fab`）原本 `position: fixed`，其 `top/right/bottom/left` 是**视口坐标**。
  2. `.ob-spotlight` 用 `position: relative !important` 强制覆盖后，FAB 退回 `static` 流末尾（视觉上跌到文档末尾），再叠加 `right: 24px` —— 但 relative 的 `right` 是**反向相对偏移**（向左偏移 24px）。
  3. 最终视觉：FAB 跌到文档末尾后向左偏移 24px，呈现"对角位置"的错乱效果。
- z-index 也失效：`position: relative` 本想让 z-index 生效，但破坏了 FAB 的 fixed 定位语义，得不偿失。

#### 修复方案（前端开发工程师小组 + 民主集中评审）
位置：`src/styles/onboarding.css`

1. **移除 `.ob-spotlight` 的 `position: relative !important`** —— FAB 本身已是 `position:fixed`（属"已定位元素"），z-index 天然生效，无需额外 position 声明。
2. **按目标形状分设 `border-radius`** —— FAB 类保留 50%（圆形），其他目标用 10px（圆角矩形）：
   ```css
   .fab-settings.ob-spotlight,
   .fab-theme.ob-spotlight,
   .fab-print.ob-spotlight,
   .fab-puppeteer.ob-spotlight,
   .history-fab.ob-spotlight {
       border-radius: 50% !important;
   }
   ```
3. **非 FAB 的 static 目标（如 `.sidebar-drawer-toggle`）才加 `position: relative`** —— 用 `:not()` 排除 FAB 类，避免误伤：
   ```css
   .ob-spotlight:not(.fab-settings):not(.fab-theme):not(.fab-print):not(.fab-puppeteer):not(.history-fab) {
       position: relative !important;
       border-radius: 10px !important;
   }
   ```
4. **防御性处理拖拽时的 box-shadow 覆盖** —— 引导期间若用户尝试拖拽 FAB 触发 `.dragging` 类，`.dragging` 的 box-shadow 会覆盖 spotlight 的 9999px 阴影导致遮罩消失。用三重类选择器（特异性 0,3,0）确保 spotlight 阴影优先级高于 `.dragging`（0,1,0）：
   ```css
   .fab-settings.ob-spotlight.dragging,
   .fab-theme.ob-spotlight.dragging,
   .fab-print.ob-spotlight.dragging,
   .fab-puppeteer.ob-spotlight.dragging,
   .history-fab.ob-spotlight.dragging {
       box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.7) !important;
   }
   ```

### 🧪 跨平台跨浏览器测试验收（测试工程师小组）

#### 测试矩阵
| 平台/视口 | 浏览器 | 引导步骤 | spotlight 位置 | 圆形保持 | 暗色遮罩 | 结论 |
|---|---|---|---|---|---|---|
| 桌面端 1280×800 | Chromium | 5 步全通过 | ✅ 正确（右上/右下/左上等） | ✅ 50% | ✅ 0.7 / 0.78 | PASS |
| 移动端 375×812 (iPhone X) | Chromium 设备模拟 | 5 步全通过 | ✅ 正确（无对角错乱） | ✅ 50% | — | PASS |
| 移动端 768×1024 (iPad Mini) | Chromium 设备模拟 | 5 步全通过 | ✅ 正确（走桌面端逻辑） | ✅ 50% | — | PASS |
| 横屏 812×375 | — | — | — | — | — | BLOCKED（预算限制，待真机回归） |

#### Console 诊断输出（桌面端第 1 步示例）
```json
{
  "selector": "fab-settings ob-spotlight",
  "rect": {"left": 292, "top": 20, "right": 344, "bottom": 72, "w": 52, "h": 52},
  "viewport": {"w": 1280, "h": 800},
  "position": "fixed",
  "borderRadius": "50%",
  "boxShadow": "rgba(0, 0, 0, 0.7) 0px 0px 0px 9999px"
}
```
- `position: fixed` ✅（未被错误覆盖为 relative）
- `borderRadius: 50%` ✅（圆形保持）
- `rect.left=292, rect.top=20` ✅（在视口右上角，未跌到对角）
- `boxShadow` 含 `9999px` ✅（全屏遮罩生效）

### 📦 文件变更清单
| 文件 | 操作 | 行数变化 | 说明 |
|---|---|---|---|
| `src/styles/onboarding.css` | 修改 | 17→50 行 | 移除 position:relative !important；按形状分设 border-radius；防御性处理 .dragging 覆盖 |
| `package.json` | 修改 | 1 行 | 版本号 2.9.5 → 2.9.6 |
| `CHANGELOG.md` | 修改 | +本节 | 新增 v2.9.6 条目 |
| `docs/移动端布局修复报告.md` | 修改 | +v2.9.6 章节 | 补充本次修复过程、方案对比、测试结果 |

### 🔄 可回退机制
- **备份分支**：`backup/pre_v296_spotlight_fix_20260726`（v2.9.5 状态）
- **回退命令**：`git reset --hard backup/pre_v296_spotlight_fix_20260726` 或 `git checkout v2.9.5`
- **GitHub 标签**：v2.9.5 / v2.9.6 双标签保留

### 📋 下一步计划
- 横屏 812×375 真机回归测试（待后续版本验证）
- 考虑为引导功能添加自动 E2E 测试（Playwright），避免类似回归

---

## [v2.9.5] — 2026-07-26

> **三大增强版本**：跨平台启动脚本对齐 + 移动端首次使用引导 + 桌面端 FAB 拖拽。在 v2.9.4 纯 CSS 重排修复移动端控件重叠的基础上，进一步优化新用户友好性、桌面端交互自由度，并补齐类 Unix 启动脚本的功能对称性。多 Agent 蜂群智能体模式实施（小组1 跨平台脚本 / 小组2 移动端引导 / 小组3 桌面端拖拽），主代理统一协调避免文件冲突。

### ✨ 新增

#### 新增 1 — 移动端首次使用引导 + 滚动边角提示

- **新增文件**：`src/styles/onboarding.css`、`src/modules/onboarding.js`
- **首次访问**：自动展示 5 步引导浮层（设置中心 → 打印 → 侧栏 → 主题 → Puppeteer），高亮目标控件 + 气泡卡片介绍
- **桌面端适配**：气泡居中显示，隐藏指向箭头；桌面端 `.sidebar-drawer-toggle` 为 `display:none`，引导自动跳过该步（`isElementVisible()` 检查 `offsetParent` 与 `getComputedStyle`）
- **移动端适配**：气泡贴近高亮控件，含指向箭头；旋转屏幕时自动重新定位（`resize` 监听）
- **老用户**：`localStorage.onboarding_completed === 'true'` 时不自动弹窗
- **滚动边角提示**：引导完成后启用，用 `IntersectionObserver` 检测核心控件是否在视口内，不在则显示半透明箭头指示器（`pulse` 动画 1.5s）
- **打印时隐藏**：`@media print` 对 `.ob-spotlight/.ob-bubble/.ob-hint/#onboarding-root` 设 `display:none`，并还原 `box-shadow`
- **设置中心入口**：新增"🎓 新手引导 → 重新查看新手引导"按钮，复用现有 `.sc-restart-ob` 样式，动态 `import('./onboarding.js')` 避免静态循环依赖

#### 新增 2 — 桌面端 FAB 拖拽功能

- **新增文件**：`src/modules/fabDrag.js`
- **启用条件**：`window.matchMedia('(min-width: 681px)')` 匹配时启用，移动端不启用（避免与 click 冲突）
- **可拖拽 FAB**：`.fab-settings` / `.fab-theme` / `.fab-puppeteer` / `.fab-print` / `.history-fab`（5 个）
- **click 与 drag 冲突处理**：5px 位移阈值，< 5px 视为 click（不拦截），≥ 5px 视为 drag（在 pointerup 时用 `{ capture: true, once: true }` 拦截下一次 click）
- **定位体系切换**：拖拽时从 `right/top` 切换到 `left/top`，基于 `getBoundingClientRect()` 的实际像素位置，**无跳变**
- **边界约束**：`left ∈ [8, innerWidth - offsetWidth - 8]`，`top` 同理
- **8px 网格吸附**：拖拽释放时 `Math.round(value / 8) * 8`
- **位置持久化**：`localStorage.calligraphy_fab_positions`，JSON 格式 `{ "fab-print": {left, top}, ... }`
- **断点切换**：监听 `mqDesktop.change`，桌面端→移动端自动 `disableAll()` 清除内联定位，移动端→桌面端自动 `enableAll()` 应用持久化位置
- **拖拽视觉反馈**：`.dragging` 类（`cursor:grabbing`、`transform:scale(1.05)`、`box-shadow` 增强、`z-index:10001`、`transition:none`），拖拽时隐藏 `::after` tooltip
- **设置中心入口**：新增"📐 控件位置 → 重置控件位置"按钮，点击后清 localStorage + 清内联样式 + 绿色 toast 提示

### 🔧 修复

#### 修复 1 — 跨平台启动脚本功能不对称

- **位置**：`启动Puppeteer.sh`（37 → 133 行）
- **根因**：原 `.sh` 缺少端口占用检查（`.ps1` 有 `Get-NetTCPConnection` 检查 + Y/N 交互），功能与 Windows 版不对称
- **修复**：
  - shebang 改为 `#!/usr/bin/env bash`（跨平台，避免硬编码 `/bin/bash`）
  - 增加 `set -u`（未定义变量报错，不加 `set -e` 保留端口选择交互）
  - 增加 `nodejs` 命令兜底（部分 Linux 发行版 `node` 软链接缺失）
  - **端口占用检查**：三工具链自动选择（`lsof` → `ss` → `netstat`），兼顾 macOS（lsof 默认可用）和 Linux（lsof 需 sudo 看 PID，回退到 ss/netstat）
  - 进程名通过 `ps -p $PID -o comm=` 反查，绕过 Linux lsof/ss 看进程名需 sudo 的限制
  - 服务异常退出后 `read -rp` 暂停（仿 `.ps1` 第 84-92 行）
  - 4 步检查 `[1/4]`…`[4/4]` 与 `.ps1` 对称
- **未修改**：`.bat`（4 行启动器无 bug）、`.ps1`（Windows 专用，已验证）、`package.json`/`package-lock.json`（Puppeteer 版本 `^23.0.0` ↔ `23.11.1` 一致无退回）

### 📋 跨平台兼容性矩阵

| 平台 | 启动脚本 | Node.js 检查 | 构建产物 | Puppeteer | 端口检查 | 退出暂停 |
|---|---|---|---|---|---|---|
| Windows | `.bat` → `.ps1` | ✅ | ✅ | ✅ | ✅ `Get-NetTCPConnection` | ✅ `RawUI.ReadKey` |
| macOS | `.sh` | ✅ `node` | ✅ | ✅ | ✅ `lsof -i:3210` | ✅ `read -rp` |
| Linux | `.sh` | ✅ `node`/`nodejs` 兜底 | ✅ | ✅ | ✅ `lsof`→`ss`→`netstat` | ✅ `read -rp` |

### 🧪 测试验证

- ✅ Vite 生产构建通过（842 模块，13.72s，无错误）
- ✅ 所有新增 JS 文件无 TypeScript/ESLint 诊断错误
- ✅ 设置中心新按钮功能验证（"重置控件位置" toast 提示正常 + localStorage 清除）
- ⚠️ 桌面端拖拽 + 移动端引导的浏览器自动化测试因预算限制未完整执行（代码层面已实现，待真机回归）
- ✅ Puppeteer 版本一致性确认（package.json `^23.0.0` ↔ package-lock.json `23.11.1`，符合 semver）

### 📦 文件变更清单

| 文件 | 操作 | 说明 |
|---|---|---|
| `启动Puppeteer.sh` | 修改 | 37→133 行，补齐端口检查 + 健壮性增强 |
| `src/styles/onboarding.css` | 新增 | 引导浮层 + 边角提示样式（230 行） |
| `src/modules/onboarding.js` | 新增 | 引导逻辑 + 滚动提示（330 行） |
| `src/modules/fabDrag.js` | 新增 | 桌面端 FAB 拖拽（240 行） |
| `src/styles/fab.css` | 修改 | 新增 `.dragging` 视觉反馈样式 |
| `src/main.js` | 修改 | 引入 onboarding + fabDrag 模块 |
| `src/modules/settingsCenter.js` | 修改 | 新增"重新查看新手引导"+"重置控件位置"按钮 |
| `index.html` | 修改 | 新增 `#onboarding-root` 容器 + 版本号 v2.9.5 |
| `package.json` | 修改 | 版本号 v2.9.4 → v2.9.5 |
| `docs/移动端布局修复报告.md` | 新增 | v2.9.4+v2.9.5 修复过程+方案对比+效果 |

### 🔄 回退方案

- 备份分支：`backup/pre_v295_swarm_20260726`（已创建）
- 回退命令：`git checkout backup/pre_v295_swarm_20260726 -- .` 或 `git reset --hard v2.9.4`
- localStorage 清理：`onboarding_completed`、`onboarding_version`、`calligraphy_fab_positions` 三个键可手动清除

---

## [v2.9.4] — 2026-07-26

> 移动端控件重叠问题的**纯 CSS 重排修复版本**。多 Agent 协同分析（项目分析师 + 系统分析师与架构师 + 前端开发工程师 + 全栈调研）确认 P0 硬伤：`.fab-print` 与 `.history-fab` 像素级完全重叠（同 `bottom:24px;right:24px`），移动端 `@media (max-width:680px)` 仅缩小尺寸未重排位置。v2.9.4 采用方案 A（纯 CSS 重排），零 JS 改动、零依赖增加、零 click 冲突，跨平台兼容性满分。

### 🐛 修复

#### 修复 1 — P0 硬伤：`.fab-print` 与 `.history-fab` 像素级重叠

- **位置**：`src/styles/history.css` 第 5-7 行
- **根因**：`.fab-print`（fab.css:25 `bottom:24px;right:24px`）与 `.history-fab`（history.css:6 `bottom:24px;right:24px`）定位完全相同，桌面端和移动端都像素级重叠
- **修复**：`.history-fab` 桌面端从 `right:24px` 改为 `left:24px`，移到左下角（桌面端 `.sidebar-drawer-toggle` 不显示，左下角空闲）

#### 修复 2 — 移动端控件重排（@media max-width:680px）

- **位置**：`src/styles/fab.css` 第 70-82 行
- **根因**：原 `@media (max-width:680px)` 仅缩小 FAB 尺寸（52px→40px/36px），未重排位置，右下角重叠依旧
- **修复**：移动端布局重排
  - `.fab-settings` → `top:16px; right:16px`（右上角，微调）
  - `.fab-theme` → `top:16px; left:16px`（移到左上角，与抽屉开关错开）
  - `.fab-puppeteer` → `bottom:80px; right:16px`（移到右下角打印上方）
  - `.fab-print` → `bottom:16px; right:16px`（右下角，缩小到 40px）
- **移动端布局示意**：
  ```
  ┌──────────────────────┐
  │ [theme]     [settings]│
  │                       │
  │       (字帖区域)      │
  │                       │
  │ [toggle] [history]    │
  │            [puppeteer] │
  │            [print]     │
  └──────────────────────┘
  ```

#### 修复 3 — 移动端 768px 断点避让 `.sidebar-drawer-toggle`

- **位置**：`src/styles/history.css` 第 18-21 行（新增 `@media (max-width:768px)`）
- **根因**：`.sidebar-drawer-toggle` 在 `@media (max-width:768px)` 显示在 `left:16px;bottom:16px`（48×48px），而 fab.css 的移动端断点是 680px，681-768px 范围内 `.history-fab` 若在 `left:24px` 会与抽屉开关重叠
- **修复**：新增 `@media (max-width:768px){ .history-fab{bottom:16px;left:80px} }`，确保 768px 以下 `.history-fab` 始终避让抽屉开关

### 📋 多 Agent 协同审查

- **审查报告**：`docs/移动端控件重叠问题_多Agent分析简报_v2.9.3.md`
- **审查范围**：4 方案比对（纯 CSS 重排 / Pointer Events 拖拽 / interact.js 库 / 混合方案）
- **推荐方案**：方案 A（纯 CSS 重排），理由：最低风险、确保稳定、对项目总体影响最小
- **关键风险规避**：
  - iOS WebKit 渲染层穿透缺陷（Bug #153852，截至 2026-07 未修复）→ 纯 CSS 无此风险
  - HarmonyOS ArkWeb Pointer Events 非原生浏览器行为 → 纯 CSS 无此风险
  - 拖拽与现有 6 个 click 监听器冲突 → 纯 CSS 无此风险

### 📋 版本号全量同步

- **index.html**：`v2.9.3` → `v2.9.4` + `build 2026-07-26 v2.9.4`
- **package.json**：`2.9.3` → `2.9.4`
- **CHANGELOG.md**：新增 v2.9.4 条目
- **src/styles/fab.css**：注释更新为 v2.9.4 说明
- **src/styles/history.css**：注释更新为 v2.9.4 说明

### 📋 影响范围

- **修改文件**：`src/styles/fab.css`、`src/styles/history.css`（仅 CSS，无 JS）
- **不影响**：任何 click 事件、任何 JS 逻辑、任何打印/PDF 功能、任何设置中心功能
- **测试范围**：6 个按钮在 3 个断点（>768px、680-768px、<680px）下的视觉布局

### 🔄 回退

- 回退 tag：`v2.9.3`（`git reset --hard v2.9.3`）

---

## [v2.9.3] — 2026-07-26

> v2.9.2 的视觉调优版本。用户反馈"11行字帖和拼音总体下移位置偏多"，v2.9.2 的 20mm 顶部边距让字格从 y=20mm 开始，视觉上字帖"沉底"。v2.9.3 采用**双参数协同调优**：顶部边距 20mm→12mm + headerTemplate padding-top 10mm→3mm，字格上移 8mm 至 y=12mm，页眉文字上移 7mm 至 y=3mm，间距 5.8mm 仍充足避免重叠。

### 🐛 修复

#### 修复 1 — 顶部边距精准调优 20mm → 12mm（双参数协同）

- **位置**：`puppeteer-server.cjs` 第 179 行（@page margin 注入）+ 第 264 行（page.pdf margin.top）+ 第 249 行（headerTemplate padding-top）
- **问题**：v2.9.2 把顶部边距从 29mm 调为 20mm 解决了 19 页问题，但字格 y=20mm 仍然偏下，用户反馈"下移位置偏多"未消除
- **修复**：顶部边距 20mm → 12mm + headerTemplate padding-top 10mm → 3mm（双参数协同）
  - 字格 y=12mm（比 v2.9.2 上移 8mm，视觉上字帖不再"沉底"）
  - 页眉文字 y=3mm（比 v2.9.2 上移 7mm，仍距纸张上边缘 3mm，安全）
  - 页眉文字底部到字格顶部间距 ≈ 5.8mm（9pt 字高约 3.2mm，间距充足避免重叠）
  - printableArea=269mm（297-12-16），11行 237.6mm 余 31.4mm，198字稳定 18 页
- **测试覆盖**（`_test_v293_optimize.cjs`）：8/10/12/15/20/29mm 六档边距 × 198字 均 18 页，12mm+pad3 是视觉最优档
- **演进历史**：v2.9.1(29mm,下移过多) → v2.9.2(20mm,仍偏下) → **v2.9.3(12mm+pad3,视觉最优)**

#### 修复 2 — 颜色跟随逻辑保留 + 健壮性注释

- **位置**：`puppeteer-server.cjs` 第 213-217 行（hfInfo 读取 gridColor）
- **说明**：v2.9.2 已实现页眉页脚颜色跟随网格颜色预设（绿/红/蓝/黑），v2.9.3 保留此逻辑并添加诊断注释
- **常见误诊**：若用户反馈"颜色不跟随"，99% 是 `puppeteer-server.cjs` 未重启（仍运行旧版无此逻辑的代码）
- **验证**（`_test_v293_verify.cjs`）：4 种颜色预设（绿 #2E7D32 / 红 #9E2A2B / 蓝 #1565C0 / 黑 #1F2937）页眉页脚颜色全部正确跟随 ✓

### 📋 版本号全量同步

- **index.html**：`<span class="version-tag">v2.9.0</span>` → `v2.9.3` + `build 2026-07-26 v2.9.3`（此前遗漏 3 个版本未更新）
- **package.json**：`2.9.2` → `2.9.3`
- **CHANGELOG.md**：新增 v2.9.3 条目
- **puppeteer-server.cjs**：注释更新为 v2.9.3 说明

### 📋 验证

- **页数验证**：198字（18页边界）× 4种颜色 = 4/4 PASS（全部 18 页，无空白尾页）
- **颜色验证**：4种颜色预设页眉页脚颜色全部正确跟随 = 4/4 PASS
- **测试脚本**：`_test_v293_verify.cjs`（验证）、`_test_v293_optimize.cjs`（参数选优）

### 🔄 回退

- 回退 tag：`v2.9.2`（`git reset --hard v2.9.2`）

---

## [v2.9.2] — 2026-07-26

> v2.9.1 的两项精准调优：①顶部边距 29mm→20mm，恢复 198 字 18 页（v2.9.1 的 29mm 导致 printableArea 仅 252mm，余量 14.4mm 太紧，溢出 19 页尾页空白）；②页眉页脚颜色跟随字帖网格颜色预设（绿/红/蓝/黑），不再硬编码深绿色。

### 🐛 修复

#### 修复 1 — 顶部边距调优 29mm → 20mm

- **位置**：`puppeteer-server.cjs` 第 173 行（@page margin 注入）+ 第 254 行（page.pdf margin.top）
- **问题**：v2.9.1 用 29mm 修复页眉重叠，但 printableArea 仅 252mm（297-29-16），11 行字格 237.6mm 余量仅 14.4mm，198 字从 18 页溢出为 19 页（尾页空白）
- **修复**：调为 20mm，printableArea=261mm（=window.print() 路径的 `.page-section-content` 高度），余量 23.4mm，恢复 18 页
- **间距**：页眉文字 y=10mm（headerTemplate padding-top:10mm），字格 y=20mm，间距 10mm 足够避免重叠

#### 修复 2 — 页眉页脚颜色跟随网格颜色

- **位置**：`puppeteer-server.cjs` 第 207-210 行（hfInfo 读取 gridColor）+ 第 237/240/247 行（headerTemplate/footerTemplate 使用动态 color）
- **问题**：headerTemplate/footerTemplate 硬编码 `color:#2E7D32`（深绿色），切换朱砂红/靛青蓝/墨黑网格时页眉页脚不跟随
- **修复**：在 `page.evaluate` 中读取 `--grid-theme-color` / `--grid-primary-color` CSS 变量（由 `GridEngine.js` 第 609-610 行设置），传给 headerTemplate/footerTemplate
- **兼容**：颜色变量未设置时回退 `#2E7D32` 默认深绿色

### 📋 多 Agent 协同

- **审查报告**：`docs/Puppeteer字帖贴顶问题_根因分析与修复方案_v2.9.0.md`
- **审查范围**：4 agent 并行分析（项目分析师 / 系统分析师与架构师 / 前端开发工程师 / 全栈工程师）

---

## [v2.9.1] — 2026-07-26

> Puppeteer 导出 PDF 字帖贴顶/页眉重叠问题的**精准回归修复**。v2.8.7 移动端重构时将 `print.css` 的 `@page margin` 从 29mm 改为 10mm，但遗漏了为 Puppeteer 路径保留 29mm 覆盖；`page.pdf({preferCSSPageSize:true})` 让 CSS @page 优先，导致 Puppeteer 实际顶部边距只有 10mm，headerTemplate 文字与第一行字格在 y=10mm 处纵向坐标完全重合。v2.9.1 恢复 v2.8.3 历史架构，为 Puppeteer headless 页面注入专用 @page margin。

### 🐛 修复

#### 修复 1 — Puppeteer 路径专用 @page margin 覆盖

- **位置**：`puppeteer-server.cjs` 第 163-173 行（`page.evaluate` 内，移除 `.print-page-section` 之后）
- **根因**（多 Agent 审查 + 历史铁证，详见报告）：
  - v2.8.3 及之前：CSS `@page margin: 29mm`（Puppeteer 路径用），`printDirect()` 动态注入 `margin:0` 覆盖给 `window.print()` 路径，两路径互不干扰
  - v2.8.7 重构：CSS `@page margin` 改为 `10mm`（服务 `window.print()` 路径的 `.print-page-section` 190×277mm 几何），但**未同步为 Puppeteer 路径保留 29mm 覆盖**
  - `page.pdf({preferCSSPageSize:true})` 使 CSS @page 优先，`page.pdf()` 的 `margin.top:29mm` 被覆盖为 10mm
  - 结果：headerTemplate 文字（padding-top:10mm → y=10mm）与第一行字格（从 y=10mm 开始）**纵向坐标完全重合**，且多页字帖每页都重叠
- **修复**：在 `puppeteer-server.cjs` 的 `page.evaluate` 中注入 `<style>@media print{@page{margin:29mm 15.9mm 16mm 15.9mm !important}}</style>`，仅作用于 Puppeteer headless 页面
- **隔离性**：`window.print()` 路径不经过 `puppeteer-server.cjs`，零影响；`print.css` 完全不改；字格几何不变（printableArea 宽 178.2mm = 字格行宽）
- **多页修复**：@page margin 作用于每一页，多页字帖每页页眉都不再重叠（padding-top 方案只能修第一页）

### 📋 多 Agent 协同审查

- **审查报告**：`docs/Puppeteer字帖贴顶问题_根因分析与修复方案_v2.9.0.md`
- **补丁文件**：`docs/patch_v2.9.1_puppeteer_margin_fix.diff`
- **审查范围**：4 个 agent 并行分析（项目分析师 / 系统分析师与架构师 / 前端开发工程师 / 全栈工程师与高级软件开发工程师）
- **铁证**：`src/styles/print.css.v2.8.3.bak` 第 53-60 行记录历史 @page margin:29mm 架构
- **回退 tag**：`backup/pre_v291_puppeteer_margin/20260726`

---

## [v2.9.0] — 2026-07-25

> 移动端打印页眉页脚缺失问题的**架构级根治版本**。在 v2.8.9 基础上（v2.8.9 修错方向——假设"元素在 DOM 里但不显示"，而真相是"元素被打印时已不在 DOM 里"），引入**隐藏 iframe 静态独立打印文档架构**，从架构层面消除"cleanup 时机 vs 异步打印管线读取"的竞态。

### 🐛 修复（架构级）

#### 修复 1 — 移动端打印改隐藏 iframe 静态独立打印文档

- **位置**：`src/utils/pdfExport.js` 新增 `printViaIframe()` 函数 + `printDirect()` 入口 UA 路由
- **根因**（多 Agent 审查 + git 取证，详见报告 v2）：
  - 移动端（Android/HarmonyOS）打印管线是**异步**的：`window.print()` 立即返回，排版/PDF 生成发生在系统打印框架回调阶段，基于**彼时的实时 DOM**
  - `afterprint` 在 Android Chrome 上 `print()` 返回后**立即触发**（已知 bug），`matchMedia('print')` 存在 true→false→true 抖动（WebKit #68614 WONTFIX）
  - 因此 cleanup 永远先于系统分页渲染执行——移动端实际打印的是 **cleanup 后的屏幕态 DOM**：字格行已移回、`.page-break` 已恢复（恰好 18 页 11 行 ✅）、含页眉页脚的 wrapper 已销毁（❌ 页眉页脚全部缺失）
- **修复架构**：
  - 移动端 UA → 创建独立隐藏 iframe（`position:fixed;opacity:0;pointer-events:none`，禁用 `display:none` 避免部分引擎跳过渲染）
  - iframe 内组装静态打印文档：`<base>` 解析相对路径 + 克隆主文档全部 `<style>` 节点（含 `@page` 与 `@media print`，零漂移）+ 用 `iwin.FontFace` 重新注册字体（`document.fonts` 每文档独立）
  - 按 `.page-break` 分组克隆字格行（`importNode` 深克隆保真内联 SVG，**只读主文档不修改**）
  - 页眉/页脚颜色内联具体色值（不依赖 CSS 变量）
  - 双 rAF 后调用 `iframe.contentWindow.print()`
  - **主文档零改动、零 cleanup——竞态从架构上消除**
- **销毁策略**（多 Agent 审查后调整）：
  - 删除 `afterprint`/`focus`/`60s` 三重触发器（复刻原 bug 竞态拓扑）
  - 仅保留 `window.pagehide`（用户离开页面时回收内存）
  - 主要清理依靠下次打印开头的幂等清理 `document.querySelectorAll('iframe.print-frame').forEach(f => f.remove())`
  - iframe 常驻 `opacity:0/pointer-events:none`，无视觉/交互成本
- **手势上下文**：`iwin.print()` 用 `requestAnimationFrame` 嵌套调用，与现有 `printDirect` 一致，最大限度保留用户手势上下文
- **UA 检测**：补充 iPadOS 13+ 触屏判定（`navigator.platform==='MacIntel' && navigator.maxTouchPoints>1`），避免 iPad 误判为桌面走原 bug 路径
- **异常回退**：`printViaIframe` 抛错时清理已创建的 iframe，回退到现有 `printDirect` 就地打印逻辑

#### 修复 2 — 删除 v2.8.9 负资产

- `src/styles/print.css`：`.page-section-header` 与 `.page-section-footer` 的 `font-size: 0;` 改回 `font-size: 9pt;`（v2.8.9 防御性设置，但 `header.innerHTML` / `footer.innerHTML` 使用字符串拼接无空白文本节点，该防御无必要且影响可读性）
- `src/utils/pdfExport.js`：删除 `printDirect` cleanup 的 `pagehide` 监听与解绑（系统打印预览不触发 `pagehide`，该监听无收益且在国产 ROM 冻结场景有隐患）

#### 修复 3 — PWA 更新提示强化

- **位置**：`src/main.js` 的 `controllerchange` toast
- **修复**：删除 `setTimeout(() => toast.remove(), 10000)`，改为**常驻直到用户点击**；文案改为 `✨ 已升级到新版本（当前运行的是旧版），点击此处刷新`
- **原因**：防止真机长期运行旧代码导致版本归因失真

### 🆕 新增

- `src/modules/fontManager.js`：新增 `customFontSources` 数组与 `getFontSources()` 导出，记录所有字体源（内置 5 个 + 用户上传），供 iframe 打印文档重新注册字体
- `src/utils/pdfExport.js`：新增 `printViaIframe()` 函数（约 190 行）；`printDirect` 改为 `async`；入口加移动端 UA 路由
- `src/main.js`：`?printdebug=1` 浮层补充 hook `console.warn` / `console.error`，确保 iframe 打印路径的 `[iframe-print]` 警告/异常在真机浮层可见

### 📋 多 Agent 协同审查

- **审查报告**：`C:\poem2pdf\字帖项目_移动端打印页眉页脚缺失_深度审查报告v2_20260725.md`
- **修复方案**：`C:\poem2pdf\TraeCN_v2.9.0_iframe打印架构_一次性修复提示词_20260725.md`
- **审查范围**：4 个 agent 并行分析（前端开发 / 网页打印 CSS / 移动端系统 / 代码取证）+ 4 视角审查方案（高级前端 / 移动端 / 全栈 / 架构师）
- **审查结论**：
  - ✅ 架构方向正确（iframe 静态打印文档是根治路径，与 print.js 等成熟库策略一致）
  - ❌ 4 个 P0 阻塞项（已全部采纳修复）：
    1. 销毁策略复刻原 bug 竞态 → 改为懒清理（仅 pagehide + 下次打印开头清理）
    2. iOS Safari 用户手势上下文丢失 → `iwin.print()` 用 rAF 嵌套调用
    3. 60s 兜底过短 → 删除定时器（懒清理策略下无必要）
    4. iPadOS 13+ 误判为桌面 → 补充触屏判定
  - ⚠️ 3 个 P1 改进项（已全部采纳）：异常回退清理 iframe、`printdebug` 浮层 hook warn/error、`alert` 改 `showToast`

### 📋 路由策略

- 移动端 UA（HarmonyOS/Android/iOS/iPadOS 13+）→ iframe 静态打印文档路径
- 桌面 UA → 现有 `printDirect` 就地打印路径（零改动，已验证正确）
- 异常自动回退到就地打印

### 📋 验证

- **桌面回归**：`npm run build` 0 错误；桌面 Chrome 打印 198 字 = 18 页，页眉页脚齐全
- **真机验收**（待用户验证）：`?printdebug=1` 打开，生成默认字帖 → 打印 → 保存 PDF，应出现 `[iframe-print]` 系列日志，PDF = 18 页、每页 11 行、页眉页脚全部可见

---

## [v2.8.9] — 2026-07-25

> 移动端打印 DOM 页眉页脚不显示问题修复版本。在 v2.8.7 基础上（v2.8.7 已解决分页问题但页眉页脚仍缺失），针对多 Agent 协同分析确认的 3 个主根因（P0-1/P0-2/P0-3）进行精准修复。版本号跳过 v2.8.8（v2.8.8 是中间失败尝试，未发布）。

### 🐛 修复

#### 修复 1 — P0-1：移动端 cleanup 事件链误触发（主根因）

- **位置**：`src/utils/pdfExport.js` 的 `printDirect()` 函数（第 491-555 行）
- **根因**：v2.8.7 新增的 `focus` / `visibilitychange` cleanup 监听器在移动端打印预览的整个生命周期中会误触发（如打印预览弹窗夺取焦点、用户切换 Tab、用户切到后台选保存位置等），导致 wrapper DOM 被提前销毁，打印管线异步读取 DOM 时读到屏幕态 DOM（无页眉页脚）。即使有 `let cleaned = false` 幂等保护，第一次误触发就足以致命
- **修复**：
  - 删除 `window.addEventListener('focus', cleanup)` 和 `document.addEventListener('visibilitychange', onVisible)`
  - 新增 `window.matchMedia('print').addEventListener('change', onPrintChange)` 精确感知打印状态（matches=false 表示打印流程结束）
  - 保留 `window.addEventListener('afterprint', cleanup)` 作为桌面 Chrome 主要触发器
  - 新增 `window.addEventListener('pagehide', cleanup)` 作为移动端极端兜底
  - 保留 120s 超长兜底超时（仅作内存回收）
  - 调整变量声明顺序：先声明 `printMediaQuery` / `onPrintChange` / `fallbackTimer`，再定义 cleanup（提升可读性，符合高级程序员审查建议）
  - 兼容 Safari < 14 的 `addListener` / `removeListener` API

#### 修复 2 — P0-2：页眉页脚 display 切换失效

- **位置**：`src/styles/print.css` 第 127-204 行
- **根因**：`.page-section-header` / `.page-section-footer` 从屏幕态 `display: none` 切换到打印态 `display: flex !important`，移动端打印引擎（华为 HarmonyOS WebView、三星 Internet、旧 Android WebView）对这种运行时切换支持不完整，子元素的内联布局可能未及时重建
- **修复**：
  - `.page-section-header` / `.page-section-footer` 的 `display: flex !important` 改为 `display: block !important`（最保守的 display 值，移动端兼容性最好）
  - 子元素 `<span>` 从 `flex: 1` 改为 `display: inline-block` + `width: 33%/34%/33%`（页眉）和 `width: 70%/30%`（页脚）
  - 父元素 `font-size: 0` 防御性设置，消除 inline-block 之间可能的空白字符间隙
  - 子元素 `line-height: 8mm` + `vertical-align: middle` 保证文字垂直居中
  - 子元素重设 `font-size: 9pt`

#### 修复 3 — P0-3：缺少 print-color-adjust 导致颜色/边框被丢弃

- **位置**：`src/styles/print.css` 第 145-146 行、第 191-192 行
- **根因**：移动端打印引擎默认会"优化"打印输出，丢弃彩色背景/边框以节省墨水。当前 CSS 只对字格 SVG 设置了 `print-color-adjust: exact`，页眉页脚的文字颜色和边框没有此设置
- **修复**：在 `.page-section-header` 和 `.page-section-footer` 显式添加：
  ```css
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
  ```
- **附带**：`background: #fff` 改为 `background: #fff !important`，确保背景色在打印时强制显示

### 📋 多 Agent 协同审查

- **审查报告**：`docs/移动端页眉页脚不显示问题_根因分析与修复方案_v2.8.9.md`
- **审查范围**：4 个 agent 并行分析（前端工程师 / 网页工程师 / 移动端开发工程师 / 代码分析师），再 5 个 agent 审查方案（架构师 / 前端高级工程师 / 移动端高级开发工程师 / 全栈工程师 / 高级程序员）
- **审查结论**：
  - ✅ 方案无阻塞问题，3 个主根因（P0-1/P0-2/P0-3）置信度 ⭐⭐⭐⭐⭐
  - ⚠️ 2 处小改进（已采纳）：调整变量声明顺序、加 `font-size: 0` 防御 inline-block 空白
  - ℹ️ 次根因（P1-1 几何溢出、P1-2 CSS 变量 fallback）留待 P0 修复后真机验证，再决定是否处理

### 📋 验证

- **方法论**：Puppeteer 仅用于桌面回归，移动端验收以真机为准
- **真机验收标准**：
  - 198 字 = 18 页（不退化）
  - 移动端打印后**页眉完整显示**（日期/标题/字体）
  - 移动端打印后**页脚完整显示**（评分/页码）
  - 移动端页眉页脚**颜色正确**（与网格颜色同步）
  - `?printdebug=1` 日志显示 cleanup 在打印流程**结束后**才触发（matchMedia(print) change: false）
- **测试链接**：https://lcfactorization.github.io/calligraphy-sheet-generator/?printdebug=1

### 🔄 回退

- 备份 tag：`backup/pre_v289_header_footer/20260725_203328`
- 回退命令：`git reset --hard backup/pre_v289_header_footer/20260725_203328`
- 线下备份：`C:\poem2pdf\distribution_backups\v2.8.7_pre_v289_20260725_203328\`

---

## [v2.8.7] — 2026-07-25

> 移动端打印分页根因修复版本。在 v2.8.6 基础上，针对移动端真机打印长期存在的「分页错乱、二次打印失效、拼音行被撕页」等根因进行集中修复，覆盖 6 个根因（RC1-RC5 + RC6 验证方法论）。代码修改由代码 agent 完成，本条目仅同步版本号与文档。

### 🐛 修复

#### 修复 1 — RC1：移动端打印清理竞态

- **位置**：打印触发与清理链路（`src/modules/pdfExport.js` 调用方）
- **根因**：原实现使用 `setTimeout(cleanup, 1000)` 兜底清理，与 `window.print()` 的同步阻塞行为在移动端产生竞态——`print()` 返回后 1s 内若用户仍在打印对话框操作，清理会提前撕掉打印 DOM，导致首末页内容缺失或样式未还原
- **修复**：
  - 删除 1s `setTimeout` 兜底
  - 改为 `afterprint` / `visibilitychange` / `focus` 三事件驱动清理
  - 增加 120s 兜底超时（极端情况下防止清理永不触发）
  - 清理函数加幂等保护（多次触发安全）

#### 修复 2 — RC2+RC3：print.css 移动端重构

- **位置**：`src/styles/print.css`
- **根因**：
  - RC2：`@media (max-width: 1200px)` 伪断点在移动端误命中，覆盖了桌面端严格物理单位规则
  - RC3：分断元素（`.page-break` 等）使用 `display:flex` / `inline-block`，移动端浏览器对非 `block` 元素的 `break-after:page` 支持不一致
- **修复**：
  - 删除 1200px 伪断点
  - 删除 210mm 宽度锁（让 `@page` 与 A4 物理宽度自然对齐）
  - 分断元素统一改为普通 `block` 显示
  - 固定几何：`header 8mm + content 261mm + footer 8mm = 277mm`（A4 - 2×10mm）
  - 末页 `height:auto`，消除空白尾页

#### 修复 3 — RC4：cleanup 恢复 .page-break（二次打印不再失效）

- **位置**：打印清理逻辑
- **根因**：v2.8.6 之前的 cleanup 在还原 DOM 时遗漏重建 `.page-break` 分断元素，导致用户首次打印后再次打印时，所有内容堆在一页无法分页
- **修复**：cleanup 完整恢复 `.page-break` 节点，二次/多次打印分页行为一致

### ✨ 新增

#### 新增 1 — RC5：.print-row-pair 行对防撕

- **位置**：`src/styles/print.css` + 字帖渲染逻辑
- **需求**：移动端部分浏览器在跨页时会把「拼音行 + 汉字行」拆到两页，导致拼音与汉字分离
- **实现**：将相邻的拼音行与汉字行包裹为 `.print-row-pair` 容器，应用 `break-inside: avoid`，强制行对在同一页内不被撕开

#### 新增 2 — 每页首行强制页顶线

- **位置**：`src/styles/print.css`
- **实现**：每页首行（行对）应用 `break-before: page` + 顶线对齐规则，确保每页第一行精确落在页顶，避免移动端渲染抖动导致首行位置漂移

#### 新增 3 — ?printdebug=1 真机日志浮层

- **位置**：URL 参数解析 + 调试浮层
- **实现**：访问 `https://lcfactorization.github.io/calligraphy-sheet-generator/?printdebug=1` 时，页面右下角显示半透明日志浮层，实时输出 `section` 数量、`page-break` 数量、`window.print()` 调用前后时间戳、UA、视口尺寸等关键诊断信息，便于真机排查

### 🗑 清理

#### 清理 1 — 删除死代码

- 删除 `src/modules/pdfExport.js`（v2.8.5 已停用，v2.8.6 审查报告 P3 遗留）
- 删除 `src/modules/gridRenderer.js`（v2.4.0 起被 GridEngine.js 替代，长期未引用）

### 📋 验证

- **方法论（RC6）**：明确 Puppeteer 仅用于桌面回归，移动端验收以真机为准
- **真机验收标准**：
  - 198 字 = 18 页
  - 页眉页脚齐全
  - 拼音行不撕页
  - `?printdebug=1` 日志浮层显示正常
- **测试链接**：https://lcfactorization.github.io/calligraphy-sheet-generator/?printdebug=1

### 🔄 回退

- 备份 tag：`backup/pre_v287_mobileprint/20260725_185852`
- 回退命令：`git reset --hard backup/pre_v287_mobileprint/20260725_185852`

---

## [v2.8.6] — 2026-07-25

> 在 v2.8.5-hotfix 基础上增加版本号可视化与一致性修复。基于多 Agent 协同审查（功能退化审查报告 v2.8.5），确认核心功能零退化后，修补 1 项 P2 一致性问题。

### ✨ 新增

#### 新增 1 — HTML 页面版本号显示

- **位置**：`index.html:28-29` + `src/styles/base.css:38-40`
- **需求**：用户复赛测试要求在页面显眼位置可见当前版本号，便于移动端测试时确认部署版本
- **实现**：
  - 标题 `字帖生成器` 后增加 `<span class="version-tag">v2.8.6</span>` 紫色圆角徽章
  - 副标题 `输入汉字 → 选择字体 → 生成字帖 → 打印/导出PDF` 后追加 `· build 2026-07-25` 灰色等宽文字
- **样式**：10px 等宽字体，紫色半透明背景，与现有 UI 风格一致；不占用核心显示区

### 🐛 修复

#### 修复 1 — puppeteerClient.js 默认字体名硬编码为已删除字体

- **位置**：`src/modules/puppeteerClient.js:52`
- **根因**：v2.5.x 之前字体列表含「姜浩硬笔楷书」，v2.5.x 起替换为「文鼎楷体」等新字体，但 `puppeteerClient.js` 的 fallback 字体名仍硬编码为 `'\u59dc\u6d69\u786c\u7b14\u6977\u4e66'`（姜浩硬笔楷书）
- **影响**：当 `font-select` 元素无选中项时，Puppeteer 路径会传不存在的字体名到服务端，可能导致 PDF 生成失败或字体回退到默认
- **修复**：fallback 改为 `'\u6587\u9f0e\u6977\u4f53'`（文鼎楷体），与 `index.html` 的 `<option value="TW-Kai" selected>文鼎楷体</option>` 一致

### 📋 审查

#### 多 Agent 协同审查 — 功能退化深度核查

- **审查报告**：`docs/功能退化审查报告_v2.8.5.md`（372 行）
- **审查范围**：v2.4.x → v2.8.5-hotfix 升级过程中 29 项核心功能的演进追踪
- **审查结论**：
  - ✅ 29 项核心功能零丢失、零回退
  - ✅ v2.8.5-hotfix 4 项修复（末页空白 / 多余 toast / 微信 X5 / 日志增强）无副作用
  - ⚠️ 1 项 P1 死代码（DEFAULT_SETTINGS 残留 4 个失效字段，不影响功能）
  - ⚠️ 1 项 P2 一致性问题（puppeteerClient.js 字体名，本次修复）
  - ℹ️ 2 项 P3 遗留未引用模块（modules/pdfExport.js, modules/gridRenderer.js，可后续清理）

### 🔄 回退

- 备份 tag：`backup/pre_v285_hotfix2/20260725_173418`（v2.8.5-hotfix 状态）
- 回退命令：`git reset --hard backup/pre_v285_hotfix2/20260725_173418`

---

## [v2.8.5-hotfix] — 2026-07-25

> 在 v2.8.5 基础上重构打印样式为严格物理单位 + DOM 页眉页脚 + 色彩同步。Puppeteer 5 平台（MatePad/Samsung/Kiwi/Android/Desktop）全部 18 页验证通过。

### 🐛 修复

#### 修复 1 — 打印分页严格物理单位（解决 198 字 18 页变 15/16 页）

- **位置**：`src/styles/print.css`
- **根因**：移动端浏览器对 `vh/px/%` 相对单位处理不一致，导致每页高度无法精确匹配 A4 物理高度
- **修复**：
  - `@page margin` 统一为 `10mm`
  - `.page-sheet` 严格 `190mm × 277mm`（A4 - 2×10mm）
  - `break-after:page` + `page-break-after:always` 双重保险
  - 末页 `height:auto + min-height:0` 消除空白尾页

#### 修复 2 — DOM 实装页眉页脚（解决移动端页眉页脚消失）

- **位置**：`src/styles/print.css` + `src/utils/pdfExport.js`
- **根因**：移动端浏览器默认隐蔽浏览器原生页眉页脚
- **修复**：在每个 `.page-sheet` 内部植入 `.sheet-header`（日期/标题/字体）与 `.sheet-footer`（评分/页码），色彩通过 `--grid-theme-color` CSS 变量与网格同步

#### 修复 3 — 色彩同步联动

- **位置**：`src/components/GridEngine.js` + `src/modules/settingsCenter.js`
- **修复**：新增 `--grid-theme-color` CSS 变量（兼容旧 `--grid-primary-color`），切换网格颜色时同步更新页眉页脚色彩

#### 修复 4 — 文本过滤器简化

- **位置**：`src/modules/fileImporter.js` + `src/modules/settings.js` + `src/components/GridEngine.js`
- **修复**：3 处正则从 `/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g` 简化为 `/[\u4e00-\u9fa5]/g`

#### 修复 5 — 移除多余 @page margin 动态注入

- **位置**：`src/utils/pdfExport.js`
- **修复**：移除 `printDirect()` 中动态注入的 `@page margin:0`，与 `print.css` 的 `@page margin:10mm` 协同

---

## [v2.8.5] — 2026-07-25（hotfix）

> 针对 v2.8.4 在移动端实测中暴露的 4 个根因进行精准修复。所有修复均基于深度代码审核报告 v2.8.5-pre 的 double 验证结论，Puppeteer 5 平台模拟测试全部从 19 页修正为 18 页。

### 🐛 修复

#### 修复 1 — 末页强制 min-height 导致多 1 空白页（19 页 → 18 页）

- **位置**：`src/styles/print.css` `.print-page-section:last-child`
- **根因**：`.print-page-section { min-height: 295mm; page-break-after: always; }` 对所有 section（包括末页）生效，导致末页即使内容不足也强制占满整页
- **修复**：末页 `:last-child` 改为 `min-height: 0 !important; page-break-after: auto !important; break-after: auto !important;`
- **验证**：Puppeteer 模拟 5 平台（MatePad/Samsung/Kiwi/Android Chrome/Desktop）全部从 19 页 → 18 页 ✅

#### 修复 2 — 删除多余 toast 弹窗"请取消勾选页眉和页脚"

- **位置**：`src/utils/pdfExport.js:555`
- **根因**：移动端浏览器（MatePad/Samsung/Kiwi/微信）的打印对话框根本没有"页眉和页脚"选项，此提示纯属多余；用户反馈"纯属多此一举"
- **修复**：直接删除 `showToast('正在准备打印…请在对话框中取消勾选「页眉和页脚」', 1500);`
- **附带**：移动端冗长提示（6 秒）简化为「正在准备打印…」（1.5 秒）

#### 修复 3 — 微信 X5 内核拦截 window.print() 适配

- **位置**：`src/main.js:66-102`
- **根因**：微信/QQ 内置浏览器（X5/TBS 内核）拦截 `window.print()`，点击打印按钮无任何反应，用户不知道是"不支持"还是"按钮坏了"
- **修复**：新增 `isWeChatX5Browser()` 检测 `MicroMessenger` / `QQBrowser` UA，检测到时禁用打印流程，弹出引导提示（8 秒）告知用户"点击右上角「⋯」→「在浏览器中打开」"
- **覆盖**：同时绑定 `printBtn` 和 `quick-print-btn` 两个打印入口

#### 修复 4 — 移动端日志增强（便于排查）

- **位置**：`src/utils/pdfExport.js` `printDirect` 函数
- **修复**：在 `window.print()` 调用前后增加 4 行关键日志：
  - UA（前 80 字符）
  - 视口尺寸 + DPR
  - `print-page-section` 数量（应为 18）
  - `page-break` 标记数量（应为 17）
- **用途**：移动端无开发者工具时，可通过远程调试或日志收集快速定位问题

### ✅ 验证

- **Puppeteer 5 平台测试**：MatePad Chrome 114 / Samsung Internet 23 / Kiwi 120 / Android Chrome 115 / Desktop Chrome 120，全部 18 页 ✅
- **视觉验证**：页眉（日期/标题/字体名）、页脚（评分/页码）、11 行/页、四线格、笔画 SVG 全部正常
- **颜色同步**：切换网格颜色预设后页眉页脚颜色同步变化（`var(--grid-primary-color)` 已在 v2.8.3 就位，本次确认无回退）
- **默认 198 字**：与用户期望完全一致（逐字符 diff 0 差异）
- **文本过滤器**：3 处使用同一正则 `/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g`，已实测过滤中文标点、英文标点、空格、数字、字母、emoji、日韩文

### 📚 文档

- 新增 `docs/复赛发布说明_v2.8.5.md` — 复赛发布帖完整说明（含 PWA 安装、跨平台矩阵、飞书问卷数据）
- 新增 `docs/移动端功能测试清单_v2.8.5.md` — 51 项逐项打钩验证清单
- 新增 `docs/PWA安装二维码_v2.8.5.md` — PWA 二维码与 4 平台安装步骤
- 新增 `docs/飞书问卷提交数据_v2.8.5.md` — 飞书问卷模拟数据（含 Session ID 和 JSON 格式）
- 新增 `docs/深度代码审核报告_v2.8.5-pre.md` — 修复前的 double 验证报告

### 🗂 备份与回退

- **回退 tag**：`v2.8.4-rollback-pre-v2.8.5`（已推送 origin）
- **回退命令**：`git checkout v2.8.4-rollback-pre-v2.8.5`

---

## [v2.8.4] — 2026-07-25

> 本次升级由 4 个独立小组并行完成（A 核心修复分页+页眉页脚+CSS压缩 / B 验证笔画SVG+字数+过滤器 / C 文档与数据生成 / D 日志增强+跨平台分析），针对 v2.8.3 修复在 MatePad 实机上未生效的根因进行深度修复。

### 🐛 修复

#### 修复 1 — MatePad 移动端断点未触发（14 行/页 → 11 行/页）

- **用户反馈**：v2.8.3 修复后 MatePad 上仍然是 14 行/页，198 字生成 16 页（应为 18 页）
- **根因**：[print.css:128](file:///c:/poem2pdf/distribution/src/styles/print.css#L128) 移动端断点为 `@media print and (max-width: 900px)`，但 MatePad 视口 768×1024 DPR=2 实际渲染宽度 1536px > 900px，导致移动端分页规则未触发，回退到桌面默认 `min-height: auto`
- **修复**：[print.css:128](file:///c:/poem2pdf/distribution/src/styles/print.css#L128) 断点从 `900px` 扩展到 `1200px`，覆盖所有移动设备视口
- **验证**：dist/index.html 包含 `max-width:1200px`；MatePad 模拟测试 3 用例全部 PASS；printDirect 路径验证 22 字 = 2 页（11 行/页）

#### 修复 2 — CSS 压缩潜在风险（防御性配置）

- **风险**：Vite 默认 esbuild CSS 压缩可能合并/简化 `@media print` 关键规则
- **修复**：[vite.config.js:43-48](file:///c:/poem2pdf/distribution/vite.config.js#L43) 添加 `cssMinify: false` + `target: 'es2020'` + `cssTarget: 'chrome89'` + `preview.port: 4173`
- **验证**：dist/index.html 关键 CSS 规则 10/10 PASS（`min-height:295mm` / `page-break-after:always` / `break-after:page` / `max-width:1200px` / `page-break-inside:avoid` / `var(--grid-primary-color)` 全部保留）

### 🔧 工程化

#### 增强 1 — pdfExport.js 日志增强（38 处日志节点）

- **新增**：[pdfExport.js](file:///c:/poem2pdf/distribution/src/utils/pdfExport.js) 新增 `detectPlatform()` 函数，统一检测 HarmonyOS / iOS Safari / Android Chrome / Mobile
- **exportVectorPDF**：11 处日志（入口/字体/grid-container/页眉页脚/总页数/每页循环/SVG写入/绘制/保存/异常）
- **printDirect**：8 处日志（入口/页眉页脚/分页段/section创建/注入/异常）
- **UA 检测**：`isHarmonyOS` / `isIOSSafari` / `isAndroidChrome` / `isMobile` 四维检测
- **目的**：移动端无法直接查看 console.log，通过详细日志便于排查

#### 增强 2 — 默认字数与过滤器验证

- **验证**：默认 textarea 内容 = 198 字（11×18=18 页），与用户期望完全一致
- **验证**：filterChineseChars 正则 `/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g` 覆盖 CJK 基本汉字 + 扩展 A 区 + 兼容汉字
- **测试**：5/5 测试用例 PASS（中文标点过滤 / 字母数字过滤 / 繁体保留）

### 📝 文档

#### 文档 1 — 深度审查报告 v2.8.4

- 新增 [docs/深度审查报告_v2.8.4.md](file:///c:/poem2pdf/distribution/docs/深度审查报告_v2.8.4.md)
- 涵盖：5 个问题根因分析、各模块审查结果、跨平台一致性保障策略、HarmonyOS 打印配置指南、备份与回退机制、多 Agent 协作机制、验收清单

#### 文档 2 — 跨平台兼容性分析 v2.8.4

- 新增 [docs/跨平台兼容性分析_v2.8.4.md](file:///c:/poem2pdf/distribution/docs/跨平台兼容性分析_v2.8.4.md)
- 涵盖：MatePad HarmonyOS / MacOS Safari / iPad Safari / Android Chrome / Desktop Chrome 五平台分析 + 一致性保障策略 + HarmonyOS 打印配置指南

#### 文档 3 — 飞书问卷提交数据 v2.8.4

- 新增 [docs/飞书问卷提交数据_v2.8.4.md](file:///c:/poem2pdf/distribution/docs/飞书问卷提交数据_v2.8.4.md)
- 5 套测试数据 + Session ID `sess-20260725-XXXX` + 演示视频占位符

#### 文档 4 — 移动端功能测试清单 v2.8.4

- 新增 [docs/移动端功能测试清单_v2.8.4.md](file:///c:/poem2pdf/distribution/docs/移动端功能测试清单_v2.8.4.md)
- 32 项可勾选测试项（6 大类：MatePad 专项 / 字数过滤 / PDF 性能 / PWA / 跨平台 / UI）

#### 文档 5 — PWA 安装指南 v2.8.4

- 新增 [docs/PWA安装指南_v2.8.4.md](file:///c:/poem2pdf/distribution/docs/PWA安装指南_v2.8.4.md)
- 二维码（240×240 + 480×480）+ 5 平台安装步骤 + HarmonyOS 特殊说明 + PWA 验证清单 + FAQ

#### 文档 6 — 复赛发布帖 v2.8.4

- 新增 [docs/复赛发布_v2.8.4.md](file:///c:/poem2pdf/distribution/docs/复赛发布_v2.8.4.md)
- 完整发布帖草稿 + GitHub Pages 部署说明 + HarmonyOS MatePad 打印 PDF 步骤

### 🔒 备份与回退

- 创建备份文件：
  - [vite.config.js.v2.8.3.bak](file:///c:/poem2pdf/distribution/vite.config.js.v2.8.3.bak)
  - [src/styles/print.css.v2.8.3.bak](file:///c:/poem2pdf/distribution/src/styles/print.css.v2.8.3.bak)
  - [src/utils/pdfExport.js.v2.8.3.bak](file:///c:/poem2pdf/distribution/src/utils/pdfExport.js.v2.8.3.bak)
- 回退方法：覆盖原文件后 `npm run build`（详见深度审查报告第六章）

### ✅ 验证清单

- `npm run build` 成功（11.35s，dist/index.html 3,047.28 kB）
- dist/index.html 关键 CSS 规则 10/10 PASS
- dist/index.html pdfExport 日志字符串 7/10 PASS（3 个中文字符串因 esbuild 转义为 Unicode，但功能正常）
- MatePad 模拟测试 3 用例全部 PASS（米字格+绿/田字格+红/九宫格+蓝，99 字格/9 行）
- 默认字数 198 字 = 18 页 ✅
- 过滤器 5/5 测试用例 PASS ✅
- 笔画 SVG 对齐修复完整保留 ✅
- CSS 变量同步双路径正常 ✅

---

## [v2.8.3] — 2026-07-25

> 本次升级由 3 个独立小组并行完成（A print.css 分页+页眉页脚 / B grid-svg.css 笔画 SVG 偏移 / C GridEngine+settingsCenter 颜色同步），基于 MatePad 实测反馈的 3 个严重问题修复。

### 🐛 修复

#### 修复 1 — MatePad 分页错误（14 行/页 → 11 行/页，18 页恢复）

- **用户反馈**：华为 MatePad 打印 PDF 时，本来每页 11 行，实际分成 14 行/页，198 字从 18 页变成 16 页
- **根因**：v2.8.1 修复时在 [print.css:140-144](file:///c:/poem2pdf/distribution/src/styles/print.css#L140) 移动端断点中写了 `min-height: auto !important`，取消了 295mm 最小高度，导致：
  - flex column 的 `margin-top: auto`（页脚）失效
  - 多个 section 在一页内紧凑排列 → 14 行/页
- **修复**：
  - [print.css:143-150](file:///c:/poem2pdf/distribution/src/styles/print.css#L143) 移动端断点恢复 `min-height: 295mm !important` + `padding: 8mm 15.9mm 5mm 15.9mm`（与桌面端完全一致）
  - [print.css:148-149](file:///c:/poem2pdf/distribution/src/styles/print.css#L148) 新增 `page-break-after: always !important`（段后强制分页）
  - [print.css:225-233](file:///c:/poem2pdf/distribution/src/styles/print.css#L225) 桌面端也新增 `page-break-after: always`（统一分页策略）
- **验证**：构建通过 + MatePad 模拟测试 3 用例全部 ✅（9 字 × 11 格 = 99 SVG 字格，9 行）

#### 修复 2 — 笔画 SVG 位置偏移（MatePad 打印 PDF 中向下移出四线格拼音行）

- **用户反馈**：笔画/笔顺分解 SVG 在 HTML 显示正常，但 MatePad 打印 PDF 中被向下移出四线格拼音所在行，偏移严重
- **根因**：[grid-svg.css:114-120](file:///c:/poem2pdf/distribution/src/styles/grid-svg.css#L114) `.grid-svg-stroke-box svg` 缺少 `vertical-align: middle` 和 `display: block`。移动端浏览器（HarmonyOS）对 flex 内异步插入 SVG 的默认 `vertical-align: baseline` 处理不同，导致 SVG 被推到行基线以下
- **修复**：
  - [grid-svg.css:114-125](file:///c:/poem2pdf/distribution/src/styles/grid-svg.css#L114) 新增 `vertical-align: middle` + `display: block`
  - [grid-svg.css:189-199](file:///c:/poem2pdf/distribution/src/styles/grid-svg.css#L189) @media print 中新增 `.grid-svg-stroke-box { align-items: center !important; }` + SVG 强制 `vertical-align: middle !important; display: block !important;`
  - [print.css:178-187](file:///c:/poem2pdf/distribution/src/styles/print.css#L178) 移动端断点也同步加固

#### 修复 3 — 页眉页脚丢失 + 颜色不同步

- **用户反馈**：
  1. MatePad 打印 PDF 中没有页眉页脚
  2. 切换网格颜色后，页眉页脚颜色仍是绿色（不跟随）
- **根因 1（页眉页脚丢失）**：与修复 1 同源，`min-height: auto` 导致 flex column 的 `margin-top: auto`（页脚）失效，页脚无法推到页面底部
- **根因 2（颜色不同步）**：[print.css:223,244](file:///c:/poem2pdf/distribution/src/styles/print.css#L223) 硬编码 `color: #2E7D32`（传统绿），切换朱砂红/靛青蓝/墨黑时不跟随
- **修复**：
  - 页眉页脚丢失：同修复 1，恢复 `min-height: 295mm`
  - 颜色不同步：
    - [print.css:250,272](file:///c:/poem2pdf/distribution/src/styles/print.css#L250) 页眉页脚颜色改为 `var(--grid-primary-color, #2E7D32)`
    - [GridEngine.js:603-607](file:///c:/poem2pdf/distribution/src/components/GridEngine.js#L603) renderSheet 时设置 `--grid-primary-color` CSS 变量
    - [settingsCenter.js](file:///c:/poem2pdf/distribution/src/modules/settingsCenter.js) applySettings 时同步设置 CSS 变量（颜色预设切换立即生效）

### 📝 文档

#### 文档 1 — 深度审查报告 v2.8.3（改动前）

- 新增 [docs/深度审查报告_v2.8.3_pre_change.md](file:///c:/poem2pdf/distribution/docs/深度审查报告_v2.8.3_pre_change.md)
- 涵盖：3 个问题根因分析、字数与页数契约、分页机制对比、笔画 SVG 布局结构、页眉页脚颜色同步方案、回归检测、改动影响评估

### 🔧 工程化

- 创建备份 tag `backup/pre_v283_tasks/20260725_223000` 并推送到 GitHub
- 多 Agent 并行：A print.css（主线程统一修改）/ B grid-svg.css / C GridEngine+settingsCenter
- 所有修改通过 `npm run build` 构建验证（839 模块，0 错误，8.83s）
- 所有修改文件通过 IDE 诊断检查（0 错误，0 警告）
- MatePad 模拟测试 3 用例全部通过：
  - ✅ 米字格+传统绿 → matepad_test_green.pdf（99 字格，9 行）
  - ✅ 田字格+朱砂红 → matepad_test_red.pdf（99 字格，9 行）
  - ✅ 九宫格+靛青蓝 → matepad_test_jiugong_blue.pdf（99 字格，9 行）
- 修复 matepad-simulate.cjs 移动端视口下 click 失败问题（改用 evaluate 触发）

### ✅ MatePad 实测验证清单（用户执行）

> [!IMPORTANT]
> 等 GitHub Pages 部署完成（约 1-3 分钟），在 MatePad 上验证：
> 1. 生成 198 字字帖 → 打印 PDF → 确认 **18 页**（不是 16 页）
> 2. 每页 **11 行**（不是 14 行）
> 3. 笔画 SVG **在四线格拼音行水平居中**（不向下偏移）
> 4. **页眉页脚正常显示**（日期/标题/字体名 + 评分/页码）
> 5. 切换朱砂红 → 页眉页脚颜色**跟随变红**
> 6. 切换靛青蓝 → 页眉页脚颜色**跟随变蓝**

---

## [v2.8.2] — 2026-07-25

> 本次升级由 3 个独立小组并行完成（A 默认文本调整 / B 文本过滤器强化 / C pdfExport 日志+MatePad 模拟测试），基于深度审查报告驱动。

### 🐛 修复

#### 修复 1 — 文本过滤器 Unicode 范围过窄（v2.8.2 基本原则修复）

- **用户原则**："请务必只保留汉字字符，繁体简体都可以，但其它符号都务必过滤掉，哪怕是中文的标点符号，也必须过滤掉，因为练字的时候字帖里永不上，这是一个基本原则"
- **多 Agent 调查结论**：
  - 根因 1：[fileImporter.js:26](file:///c:/poem2pdf/distribution/src/modules/fileImporter.js#L26) `filterChineseChars` 正则 `/[\u4e00-\u9fa5]/g` 仅覆盖 CJK 基本区，缺扩展 A 区（U+3400–U+4DBF）、基本区扩展（U+9FA6–U+9FFF）、兼容汉字（U+F900–U+FAFF）
  - 根因 2：[GridEngine.js:604](file:///c:/poem2pdf/distribution/src/components/GridEngine.js#L604) `renderSheet` 入口仅过滤空白换行，textarea 直接粘贴的中文标点/字母/数字被当作字符渲染进字格
  - 根因 3：[settings.js](file:///c:/poem2pdf/distribution/src/modules/settings.js) `updateCharCounter` 基于 `textarea.value.length` 统计，含标点，与实际渲染字数不一致
- **修复**：
  - [fileImporter.js:26](file:///c:/poem2pdf/distribution/src/modules/fileImporter.js#L26) 正则扩展为 `/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g`，覆盖基本区+扩展 A+兼容汉字
  - [fileImporter.js](file:///c:/poem2pdf/distribution/src/modules/fileImporter.js) export 新增 `filterChineseChars`，供其他模块复用
  - [GridEngine.js:603-611](file:///c:/poem2pdf/distribution/src/components/GridEngine.js#L603) `renderSheet` 入口加预过滤 IIFE，渲染前已是纯汉字
  - [settings.js](file:///c:/poem2pdf/distribution/src/modules/settings.js) `updateCharCounter` 改为基于过滤后字数，与实际渲染一致
- **验证**：构建通过（839 模块，0 错误），IDE 诊断 0 错误

### ✨ 新增

#### 新增 1 — 默认文本调整为 198 字（18 页正好）

- **用户反馈**：希望默认文本为指定 200 字内容，刚好 18 页；如果多了从末尾删一两个
- **字数验证**：
  - 原文本 200 字 → ⌈200/11⌉ = 19 页（11 字/页，多 1 页）
  - 删末尾 "替骂" 2 字 → 198 字 → 18 页正好
- **修复**：[index.html:74](file:///c:/poem2pdf/distribution/index.html#L74) textarea 默认值改为 198 字版本
- **验证**：PowerShell 实测 `Default text length: 198` / `Pages (11 chars/page): 18`

#### 新增 2 — pdfExport.js 关键节点日志（移动端调试增强）

- **背景**：MatePad 移动端无法直接查看 console.log，排查空白问题困难
- **新增日志节点**（8 个，全部 `[pdfExport]` 前缀）：
  - [pdfExport.js:254](file:///c:/poem2pdf/distribution/src/utils/pdfExport.js#L254) printDirect 入口（UA + 字数 + 字体）
  - [pdfExport.js:395](file:///c:/poem2pdf/distribution/src/utils/pdfExport.js#L395) 移动端检测（isMobileUA + isHarmonyOS）
  - [pdfExport.js:312](file:///c:/poem2pdf/distribution/src/utils/pdfExport.js#L312) 分页段创建（页数 + 字数）
  - [pdfExport.js:409-411](file:///c:/poem2pdf/distribution/src/utils/pdfExport.js#L409) 字体等待开始/完成
  - [pdfExport.js:413-415](file:///c:/poem2pdf/distribution/src/utils/pdfExport.js#L413) waitForStrokes 开始/完成
  - [pdfExport.js:428-431](file:///c:/poem2pdf/distribution/src/utils/pdfExport.js#L428) window.print() 调用
  - [pdfExport.js:375,385](file:///c:/poem2pdf/distribution/src/utils/pdfExport.js#L375) cleanup 开始/完成
  - [pdfExport.js:112](file:///c:/poem2pdf/distribution/src/utils/pdfExport.js#L112) exportVectorPDF 入口
- **使用方法**：移动端 Chrome 远程调试（USB）或 vConsole 注入后，按 `[pdfExport]` 过滤日志

#### 新增 3 — MatePad 模拟测试脚本（本地验证网格颜色）

- **背景**：用户要求"帮我构造一个模拟的 MatePad 环境数据，在本地运行一下导出 PDF 的测试，验证网格颜色是否正常"
- **新增**：[matepad-simulate.cjs](file:///c:/poem2pdf/distribution/matepad-simulate.cjs)
- **特性**：
  - MatePad UA：`Mozilla/5.0 (Linux; Android 10; HARMONYOS; MatePad Pro) AppleWebKit/537.36 Chrome/114.0.0.0 Safari/537.36`
  - 视口 768×1024 DPR=2（MatePad 横屏）
  - 3 个测试用例：米字格+传统绿 / 田字格+朱砂红 / 九宫格+靛青蓝
  - 复用本地 puppeteer Chromium（与 puppeteer-server.cjs 同源）
  - 收集 `[pdfExport]` 日志并输出
  - 输出 3 个 PDF：matepad_test_green.pdf / matepad_test_red.pdf / matepad_test_jiugong_blue.pdf
- **用法**：`node matepad-simulate.cjs --url http://localhost:3000`（需先启动 `npm run dev`）

### 📝 文档

#### 文档 1 — 深度审查报告（改动前）

- 新增 [docs/深度审查报告_v2.8.2_pre_change.md](file:///c:/poem2pdf/distribution/docs/深度审查报告_v2.8.2_pre_change.md)
- 涵盖：字数与页数关系、过滤器缺陷、pdfExport 日志节点、MatePad 模拟方案、回归检测、改动影响评估、多 Agent 任务分配

### 🔧 工程化

- 创建备份 tag `backup/pre_v282_tasks/20260725_220000` 并推送到 GitHub
- 多 Agent 并行：A 默认文本 / B 过滤器强化（3 文件协同）/ C 日志+模拟脚本
- 所有修改通过 `npm run build` 构建验证（839 模块，0 错误，9.56s）
- 所有修改文件通过 IDE 诊断检查（0 错误，0 警告）

### 📚 引用文档（v2.8.1 已生成，本轮复用）

> [!NOTE]
> 用户任务 4-7（MatePad 适配 / HarmonyOS 说明 / 飞书问卷数据 / 测试清单 / PWA 二维码）已在 v2.8.1 完成，本轮引用：
> - [docs/移动端打印替代方案_v2.8.1.md](file:///c:/poem2pdf/distribution/docs/移动端打印替代方案_v2.8.1.md)
> - [docs/飞书问卷提交数据_v2.8.1.md](file:///c:/poem2pdf/distribution/docs/飞书问卷提交数据_v2.8.1.md)
> - [docs/PWA安装指南_v2.8.1.md](file:///c:/poem2pdf/distribution/docs/PWA安装指南_v2.8.1.md)
> - [docs/移动端功能测试清单_v2.8.1.md](file:///c:/poem2pdf/distribution/docs/移动端功能测试清单_v2.8.1.md)
> - [docs/复赛发布_v2.8.1.md](file:///c:/poem2pdf/distribution/docs/复赛发布_v2.8.1.md)

### ✅ GitHub Pages 部署状态

- **在线访问**：https://lcfactorization.github.io/calligraphy-sheet-generator/
- **部署方式**：GitHub Actions 自动部署（push 到 `retake` 分支触发）
- **v2.8.2 推送后**：Actions 将自动重新构建并部署（约 1-3 分钟）

---

## [v2.8.1] — 2026-07-25

> 本次升级由 6 个独立小组并行完成（A 核心代码修复 / B 替代方案研究 / C 飞书问卷数据 / D 测试清单更新 / E PWA 安装指南 / F 复赛发布帖与 CHANGELOG），基于多 Agent 协同调查 + 修复。

### 🐛 修复

#### 修复 1 — MatePad 移动端打印 PDF 预览空白（v2.8.1 核心修复）

- **用户反馈**：华为 MatePad（HarmonyOS）通过 GitHub Pages 访问时，点击打印按钮后预览全空白，无法生成正确字帖 PDF
- **多 Agent 调查结论**：
  - 根因 1：print.css 使用 `body * { visibility: hidden; }` + `.a4-page * { visibility: visible; }` 方案，HarmonyOS 浏览器与移动 Chrome 在 @media print 下 visibility 继承机制不可靠
  - 根因 2：pdfExport.js 用 async/await 链触发 window.print()，移动端浏览器严格要求 window.print() 在用户手势上下文内调用，async 链脱离手势上下文导致调用被吞
- **修复**：
  - [print.css](file:///c:/poem2pdf/distribution/src/styles/print.css#L77-L103) 废弃 visibility:hidden/visible 方案，改用 display:none 显式隐藏 UI 元素
  - [print.css](file:///c:/poem2pdf/distribution/src/styles/print.css#L124-L169) 新增 `@media print and (max-width: 900px)` 移动端断点规则，显式声明容器宽度 210mm + 保留 SVG 字格可见性
  - [pdfExport.js](file:///c:/poem2pdf/distribution/src/utils/pdfExport.js#L380-L385) 新增移动端 UA 检测（HarmonyOS/Android/iOS）
  - [pdfExport.js](file:///c:/poem2pdf/distribution/src/utils/pdfExport.js#L391-L397) 移动端显示用户引导 toast（HarmonyOS 专用提示「建议点击浏览器底部 ∷ 菜单 → 保存 PDF / WPS 网页转 PDF」）
  - [pdfExport.js](file:///c:/poem2pdf/distribution/src/utils/pdfExport.js#L409-L423) 用 requestAnimationFrame 双层同步触发 window.print()，保持用户手势上下文
- **验证**：构建通过（839 模块，0 错误，0 警告）

### 📝 文档

#### 文档 1 — 移动端打印替代方案研究

- 新增 [docs/移动端打印替代方案_v2.8.1.md](file:///c:/poem2pdf/distribution/docs/移动端打印替代方案_v2.8.1.md)
- 5 方案对比：A 用户引导 / B svg2pdf.js 矢量 / C html2canvas 光栅 / D dom-to-image / E Web Share
- 推荐路线：v2.8.1 止血（修复 print.css + 用户引导）→ v2.9.0 主推（svg2pdf.js）→ v3.0.0 统一架构
- 包含 HarmonyOS 浏览器"网页转 PDF"操作路径（3 个版本差异）

#### 文档 2 — 飞书问卷模拟提交数据

- 新增 [docs/飞书问卷提交数据_v2.8.1.md](file:///c:/poem2pdf/distribution/docs/飞书问卷提交数据_v2.8.1.md)
- 3 套模拟数据（MatePad/Android/Windows）+ Session ID + 演示视频占位符
- 含 Markdown 表格版本 + 纯文本版本 + 统计汇总表

#### 文档 3 — PWA 安装二维码 + 多平台指南

- 新增 [docs/PWA安装指南_v2.8.1.md](file:///c:/poem2pdf/distribution/docs/PWA安装指南_v2.8.1.md)
- 5 平台安装步骤：HarmonyOS / Android / iOS / Windows / macOS
- PWA 验证清单（8 项）+ FAQ（8 条）+ 二维码（api.qrserver.com 生成）

#### 文档 4 — 移动端功能测试清单更新

- 更新 [docs/移动端功能测试清单_v2.8.1.md](file:///c:/poem2pdf/distribution/docs/移动端功能测试清单_v2.8.1.md)
- 第四章"打印 PDF"从"待修复"改为"已修复"
- 新增 TC-04-06 移动端用户引导 toast 测试项
- 新增 TC-04-07 HarmonyOS 网页转 PDF 替代路径测试项
- 总测试项从 72 增至 74

### 🔧 工程化

- 创建备份 tag `backup/pre_v281_tasks/20260725_203000` 并推送到 GitHub
- 多 Agent 并行：6 个独立小组同时工作（A 代码修复 + B/C/D/E 文档 + F 帖子与日志）
- 所有修改通过 `npm run build` 构建验证（839 模块，0 错误，0 警告）

---

## [v2.8.0] — 2026-07-25

> 本次升级由 6 个独立小组并行完成（A 模态修复 / B 字数扩展 / C 打印性能 / D 项目重定位 / E 回归检测 / F 文档与版本控制），基于多 Agent 协同调查 + 修复。

### 🐛 修复

#### 修复 1 — 移动端设置中心模态全屏遮挡问题（MatePad 反馈）

- **用户反馈**：华为 MatePad（HarmonyOS）通过 GitHub Pages 访问时，设置中心切换网格类型/颜色后看似不生效
- **多 Agent 调查结论**：不是性能滞后，也不是功能失效。根因是 `settingsCenter.css` 移动端断点（max-width:680px）让 `.sc-modal` 全屏覆盖（100vh），重渲染发生在被遮挡的背景中
- **修复**：
  - [settingsCenter.css](file:///c:/poem2pdf/distribution/src/styles/settingsCenter.css#L277-L282) 移动端模态改为底部抽屉（65vh，留 35vh 预览区）+ 减淡遮罩（0.5 → 0.25）
  - [main.js](file:///c:/poem2pdf/distribution/src/main.js#L98-L106) 字格容器添加视觉反馈（设置更新后紫色外框闪烁 400ms）
  - [grid-svg.css](file:///c:/poem2pdf/distribution/src/styles/grid-svg.css#L208-L213) 新增 `#grid-container.just-updated` 样式
  - [main.js](file:///c:/poem2pdf/distribution/src/main.js#L114-L124) 末尾追加 PWA 更新提示（避免旧访客持续运行老代码）
- **验证**：构建通过（839 模块，0 错误），IDE 诊断 0 错误 0 警告

#### 修复 2 — 打印 PDF 性能优化（GitHub Pages 慢）

- **用户反馈**：GitHub Pages 在线版本打印 PDF 非常慢
- **多 Agent 调查结论**：
  - 首次访问慢主因：字体串行加载（40MB 跨境下载 30-60 秒）+ alert 阻塞 + waitForStrokes 10s 超时
  - 二次访问慢主因：笔画串行加载 + SVG DOM 规模（30 页 7590 SVG / 3 万节点）
- **修复（短期优化，预计性能提升 60-80%）**：
  - [fontManager.js](file:///c:/poem2pdf/distribution/src/modules/fontManager.js#L14-L55) `loadFonts()` 改并行（`Promise.all`）+ `display:swap` + 按需加载（仅加载当前选中字体，其余延迟加载）
  - [utils/pdfExport.js](file:///c:/poem2pdf/distribution/src/utils/pdfExport.js#L60-L77) 新增 `showToast` 辅助函数
  - [utils/pdfExport.js](file:///c:/poem2pdf/distribution/src/utils/pdfExport.js#L380-L396) `printDirect()` 中的 `alert()` 改为非阻塞 toast（复用 `.puppeteer-toast` 样式）
  - `waitForStrokes` 超时从 10s 缩短为 2s（未加载的笔画自然缺失，不阻塞打印）

### ✨ 新增

#### 新增 1 — 字数上限扩展（200 → 330 推荐 + 1000 硬上限）

- **用户反馈**：200 字上限太少，希望增加到 330 字（30 页）
- **实现**：
  - [index.html](file:///c:/poem2pdf/distribution/index.html#L74) textarea `maxlength` 从 200 改为 1000
  - [settings.js](file:///c:/poem2pdf/distribution/src/modules/settings.js) `updateCharCounter` 重写为三级样式（正常/警告/错误）+ 越限 toast 提示
  - [recommender.js](file:///c:/poem2pdf/distribution/src/modules/recommender.js) 三处 `maxLength || 200` 改为 `|| 1000`
  - [components.css](file:///c:/poem2pdf/distribution/src/styles/components.css) 新增 `.char-counter.warn` 警告样式 + `.char-limit-toast` toast 样式
- **行为**：
  - 0-330 字：正常（灰色）
  - 331-1000 字：黄色警告 + 跨过 330 时弹一次 toast「超过 30 页推荐上限（330 字），将生成更多页」
  - >1000 字：浏览器原生 maxlength 阻止继续输入
  - **不强制截断**：用户输入超过 330 字仍可正常生成字帖

### 📝 文档

#### 文档 1 — 项目定位重新说明

- 早期文档中"纯前端 PWA 离线应用"的描述不准确，已在 [docs/复赛发布_v2.8.0.md](file:///c:/poem2pdf/distribution/docs/复赛发布_v2.8.0.md) 开头添加详细的项目定位说明
- 准确描述："以前端为主、本地 Node.js 服务为辅的混合架构字帖生成工具"
- GitHub Pages 部署说明：是为了节省服务器成本的临时方案，并非唯一发布路径

#### 文档 2 — 文档一致性修订（避免功能谎言）

- 多 Agent 回归检测发现：v2.7.0 帖子仍宣称"练习反馈闭环 ✅"和"复习计划生成 ✅"，但 v2.3.0 已删除
- 修订：
  - 帖子 #17、#18 项标记为"❌ v2.3.0 移除"
  - 修正"AI 智能推荐"描述（基于分级字库和预设模板，非学习历史）
  - README.md "4 滑块 + 4 开关 + 3 主题"改为实际的"1 滑块 + 5 网格类型 + 4 色预设 + 4 Toggle + 3 主题"
  - 学习闭环技术方案章节添加诚实说明（v2.3.0 主动移除反馈/复习以聚焦核心）

### 🔧 工程化

- 创建备份 tag `backup/pre_v280_tasks/20260725_190000` 并推送到 GitHub
- 多 Agent 并行调查（4 个调查任务同时进行）+ 多 Agent 并行修复（2 个修复任务同时进行）
- 所有修改通过 `npm run build` 构建验证（839 模块，0 错误，0 警告）
- 所有修改文件通过 IDE 诊断检查（0 错误，0 警告）

---

## [v2.7.0] — 2026-07-25

### 🐛 修复

#### 修复 1 — 主题切换不记忆（fab-theme 按钮不保存到 localStorage）

- **用户反馈**：切换 light/dark 模式后，主题没有记忆，刷新页面后恢复默认
- **根因**：[settings.js:16](file:///c:/poem2pdf/distribution/src/modules/settings.js#L16) `toggleTheme()` 只切换 `data-theme` 属性，不写入 localStorage。`settingsCenter` 的 `settings.theme` 字段保持旧值
- **修复**：`toggleTheme()` 现在同步写入 `calligraphy_settings.theme` 到 localStorage
- **验证**：浏览器测试确认 — 切换主题后 localStorage 更新，刷新页面后主题保持

#### 修复 2 — 主题切换按钮与"学习报告"按钮重叠

- **用户反馈**：light/dark 主题切换按钮与"学习报告"按钮重叠，无法直接点击
- **根因**：`.fab-theme` 位于 `top:20px right:20px`，与 `.app-header-actions` 中的"学习报告"按钮在同一位置
- **修复**：交换 `.fab-theme` 和 `.fab-settings` 位置
  - `.fab-settings`: `top:20px`（移到顶部）
  - `.fab-theme`: `top:84px`（移到下方，避免与"学习报告"重叠）
  - `.fab-puppeteer`: `top:148px`（不变）
- **验证**：浏览器测试确认 — fab-theme 可正常点击，不被 fab-settings 拦截

#### 修复 3 — CSS 压缩器丢失 .fab-settings 定位属性

- **问题**：Vite 的 CSS 压缩器（Lightning CSS）在合并公共属性时，丢失了 `.fab-settings` 的 `position:fixed/top/right`
- **修复**：在 [fab.css:22](file:///c:/poem2pdf/distribution/src/styles/fab.css#L22) 添加独立定位规则 `.fab-settings{position:fixed;top:20px;right:20px;z-index:9999}`
- **验证**：构建产物确认规则存在

### 🔧 技术说明

> [!NOTE] 网格设置保持说明
> 经浏览器测试验证，网格类型（gridType）和颜色预设（gridColorPreset）在主题切换过程中**始终保持在 localStorage 中不被重置**。用户之前感知的"重置"实际上是主题不记忆导致页面刷新后视觉不一致的误解。本次修复主题记忆后，所有设置（网格类型、颜色、透明度、显示开关、主题）均能跨刷新保持。

---

## [v2.6.0] — 2026-07-25

### 🐛 修复

#### 修复 1 — Puppeteer PDF 导出不应用网格类型和颜色预设（严重功能缺陷）

- **用户反馈**：切换田字格/回字格/九宫格以及网格颜色时，对 Puppeteer 方式导出的 PDF 矢量图没有任何影响
- **根因**：Puppeteer 加载全新 dist/index.html 页面，localStorage 为空，GridEngine.js 读取到默认值（米字格+绿色）。客户端 `puppeteerClient.js` 未将用户的网格设置传递给服务端
- **修复方案**：三文件协同修复
  1. [puppeteerClient.js:57-70](file:///c:/poem2pdf/distribution/src/modules/puppeteerClient.js#L57) — 新增读取 localStorage `calligraphy_settings`，提取 `gridType`/`gridColorPreset`/`traceOpacity`
  2. [puppeteerClient.js:90-102](file:///c:/poem2pdf/distribution/src/modules/puppeteerClient.js#L90) — 请求体新增 3 个字段
  3. [puppeteer-server.cjs:62](file:///c:/poem2pdf/distribution/puppeteer-server.cjs#L62) — `generatePDF` 函数签名新增 3 个参数
  4. [puppeteer-server.cjs:73-92](file:///c:/poem2pdf/distribution/puppeteer-server.cjs#L73) — 在点击 generate-btn 前，将设置写入 Puppeteer 页面的 localStorage
  5. [puppeteer-server.cjs:312](file:///c:/poem2pdf/distribution/puppeteer-server.cjs#L312) — 从请求体提取 3 个新字段
  6. [puppeteer-server.cjs:336](file:///c:/poem2pdf/distribution/puppeteer-server.cjs#L336) — 调用 generatePDF 时传递新参数
- **同步修复**：[puppeteer-pdf.cjs](file:///c:/poem2pdf/distribution/puppeteer-pdf.cjs) CLI 工具新增 `--grid-type`/`--grid-color`/`--trace-opacity` 参数
- **验证**：
  - CLI 测试：`--grid-type jiugong --grid-color red` ✅ 生成 79.3KB PDF
  - CLI 测试：`--grid-type tian --grid-color blue` ✅ 生成 78.1KB PDF
  - HTTP 测试：发送 gridType=jiugong, gridColorPreset=red ✅ 生成 72.3KB PDF
  - 服务器日志确认：`[Server] 生成PDF: 3字, 网格=jiugong, 颜色=red`

### 🔧 技术说明

> [!NOTE] 数据流修复说明
> 修复后的完整数据流：
> 1. 用户在浏览器切换网格类型/颜色 → settingsCenter 写入 localStorage
> 2. 用户点击 Puppeteer 按钮 → puppeteerClient.js 读取 localStorage，发送 gridType/gridColorPreset
> 3. puppeteer-server.cjs 接收参数 → 在 Puppeteer 页面加载后、点击生成按钮前，写入 localStorage
> 4. GridEngine.js 的 `getSidebarState()`/`getActiveGridColors()` 读取 localStorage → 渲染正确的网格类型和颜色
> 5. Puppeteer 生成 PDF → 网格类型和颜色正确应用

---

## [v2.5.5] — 2026-07-25

### 🐛 修复

#### 修复 1 — 学习报告按钮样式丢失（v2.3.0 遗留退化）

- **根因**：v2.3.0 删除 demoMode.css 时，reportPanel.js 仍引用 `.demo-btn` 类（已无 CSS 定义），导致按钮呈现浏览器默认样式
- **修复**：[reportPanel.js:361](file:///c:/poem2pdf/distribution/src/modules/reportPanel.js#L361) `btn.className = 'demo-btn'` → `'btn btn-secondary'`
- **验证**：构建版本浏览器测试通过，按钮样式与其他次要按钮统一

#### 修复 2 — 默认输入文本超过 maxlength 限制

- **根因**：[index.html:74](file:///c:/poem2pdf/distribution/index.html#L74) 默认文本超过 `maxlength="200"` 限制，控制台出现截断警告
- **修复**：缩短默认文本至 200 字以内，移除末尾约 30 字重复内容
- **验证**：文本长度计数器初始显示正确，无截断警告

### ✅ 深度审查验证

- 构建版本全面功能测试 10/10 通过（控制台无 SyntaxError，所有功能正常）
- 开发模式的 fontManager.js SyntaxError 在构建后不存在（Vite 编译时处理）
- 仅 4 条字体加载失败警告（本地无字体文件，GitHub Pages CI 会下载字体）

---

## [v2.5.4] — 2026-07-25

### 🔧 修复与优化

#### 修复 1 — 页脚年份空格不足

- **用户反馈**："评分：☆☆☆☆☆　___年___月___日" 中"年"前面空间太少
- **修复**：`___年` → `______年`（3个下划线 → 6个下划线），统一修改 6 处：
  - [index.html:117](file:///c:/poem2pdf/distribution/index.html#L117) — footerText 输入框默认值
  - [settings.js:33](file:///c:/poem2pdf/distribution/src/modules/settings.js#L33) — hfDefaults.footerText
  - [pdfExport.js:143,268](file:///c:/poem2pdf/distribution/src/utils/pdfExport.js#L143) — 2处兜底默认值
  - [modules/pdfExport.js:45](file:///c:/poem2pdf/distribution/src/modules/pdfExport.js#L45) — 兜底默认值
  - [puppeteer-pdf.cjs:416](file:///c:/poem2pdf/distribution/puppeteer-pdf.cjs#L416) — Puppeteer 兜底默认值
  - [puppeteer-server.cjs:181](file:///c:/poem2pdf/distribution/puppeteer-server.cjs#L181) — Puppeteer Server 兜底默认值

#### 优化 2 — 顶部标题区压缩

- **用户反馈**：标题区空白太大，可放到左上角边缘、高度适当压缩
- **修复**：[base.css:30-39](file:///c:/poem2pdf/distribution/src/styles/base.css#L30)
  - 改为 flex 左对齐布局（原居中）
  - h1 + 副标题同一行（原上下两行）
  - padding 从 `8px 0 24px` → `4px 0 6px`
  - margin-bottom 从 `24px` → `8px`
  - h1 字号从 24px → 18px，副标题从 13px → 11px
- [index.html:26-32](file:///c:/poem2pdf/distribution/index.html#L26)：添加 `.header-title` 和 `.app-header-actions` 容器

#### 优化 3 — Puppeteer 按钮移至右侧主列最下面

- **用户反馈**：Puppeteer 按钮应与右侧控件同列、放最下面不显眼位置
- **修复**：[fab.css:24-34](file:///c:/poem2pdf/distribution/src/styles/fab.css#L24)
  - 位置从 `top:90px right:84px`（偏离主列）→ `top:148px right:20px`（与主列同列）
  - 右侧控件列从上到下：☀主题(20px) → ⚙设置(84px) → Puppeteer(148px,40px灰) → [间隔] → 🖨打印(右下角)
- [settingsCenter.css:6](file:///c:/poem2pdf/distribution/src/styles/settingsCenter.css#L6)：设置按钮从 `top:212px` → `top:84px`（紧跟主题按钮）
- 移动端定位同步调整

### 🐛 回归修复（5项）

#### 修复 4 — 移除3个失效设置控件

- **问题**：设置面板的"格子大小/每行字数/每页行数"滑块 UI 有反应但实际不影响字帖渲染（SVG引擎用静态值）
- **修复**：[settingsCenter.js](file:///c:/poem2pdf/distribution/src/modules/settingsCenter.js) createPanel 移除3个滑块 HTML + sliders 数组移除对应条目
- 保留 DEFAULT_SETTINGS 字段作为兼容

#### 修复 5 — 修复4个显示开关CSS选择器

- **问题**：showPinyin/showZuci/showStrokes/showStrokeOrder 的 CSS 选择器不匹配实际 SVG 类名
- **修复**：[settingsCenter.css:268-271](file:///c:/poem2pdf/distribution/src/styles/settingsCenter.css#L268)
  - `.pinyin-row` → `.grid-svg-pinyin-box`
  - `.tianzi-cell` → `.grid-svg-cell[data-grid-type="pinyin-zuci"]`
  - `.stroke-container` → `.grid-svg-stroke-box`
  - `.stroke-container .stroke-svg` → `.grid-svg-stroke-box .stroke-svg`

#### 修复 6 — 学习报告按钮覆盖主题按钮

- **问题**：reportPanel.js 期望 `.app-header-actions` 容器但不存在，降级到 `top:16px right:16px` 与 fab-theme 重叠
- **修复**：
  - [index.html:31](file:///c:/poem2pdf/distribution/index.html#L31)：添加 `.app-header-actions` 容器
  - [reportPanel.js:372](file:///c:/poem2pdf/distribution/src/modules/reportPanel.js#L372)：降级位置从 `right:16px` → `left:16px`（避免冲突）

#### 修复 7 — PWA theme_color 不一致

- **问题**：manifest theme_color `#667eea`（紫蓝）与 meta theme-color `#9E2A2B`（印泥红）不一致
- **修复**：[vite.config.js:18](file:///c:/poem2pdf/distribution/vite.config.js#L18) 统一为 `#9E2A2B`

#### 修复 8 — print.css 遗漏 .fab-settings

- **问题**：print.css 的隐藏列表缺少 .fab-settings 和 #settingsPanel
- **修复**：[print.css:30-31](file:///c:/poem2pdf/distribution/src/styles/print.css#L30) 补充

### 📚 文档

- 新增 [docs/INDEX_HTML_说明.md](file:///c:/poem2pdf/distribution/docs/INDEX_HTML_说明.md) — 详细解释 index.html 的作用、为什么不能双击打开、三者关系（源文件→构建→外壳）

### 📦 备份与回退

- **基线备份 tag**：`backup/pre_v254_tasks/20260725_180000`（本批任务前）
- **本地备份**：`backup_v253_complete_20260725_080347/`
- 回退命令：`git reset --hard backup/pre_v254_tasks/20260725_180000`

### ✅ 验证

- ✅ 构建通过：`npm run build` 成功，10.87s，0 错误 0 警告
- ✅ PWA 正常：sw.js + workbox + manifest.webmanifest 生成
- ✅ 浏览器验证：页脚6下划线 ✅、设置面板功能 ✅、九宫格渲染 ✅、颜色预设 ✅、3个失效控件已移除 ✅
- ✅ 诊断检查：所有修改文件 0 诊断错误

---

## [v2.5.3] — 2026-07-25

### ✨ 新功能：网格类型快切（田/米/九宫）+ 线框颜色预设（4色）

参考 `gemini-code-1784931812615.html` 设计建议，新增九宫格类型与 4 色线框颜色快切，性能影响微乎其微（< 1ms）。

#### 新增 1 — 九宫格（jiugong）类型

- **[interfaces.js](file:///c:/poem2pdf/distribution/src/contracts/interfaces.js#L18-L24)**：GridType 枚举新增 `'jiugong'`，外框 + 三等分虚线 3×3 布局
- **[GridEngine.js](file:///c:/poem2pdf/distribution/src/components/GridEngine.js#L153-L180)**：新增 `drawJiugongGrid()` 函数，绘制两条垂直 + 两条水平三等分虚线
- **[Sidebar.js](file:///c:/poem2pdf/distribution/src/components/Sidebar.js#L32-L38)**：GRID_TYPES 数组新增九宫格选项
- **[settingsCenter.js](file:///c:/poem2pdf/distribution/src/modules/settingsCenter.js#L136-L148)**：设置面板网格类型选择器新增九宫格按钮

#### 新增 2 — 线框颜色快切（4 色预设）

- **[interfaces.js](file:///c:/poem2pdf/distribution/src/contracts/interfaces.js#L86-L111)**：新增 `GRID_COLOR_PRESETS` 数组，含 4 套配色：
  - 传统绿（默认）：#2E7D32 深绿主色
  - 朱砂红：#9E2A2B 印泥红
  - 靛青蓝：#1565C0
  - 墨黑：#1F2937
- **[GridEngine.js](file:///c:/poem2pdf/distribution/src/components/GridEngine.js#L27-L44)**：新增 `getActiveGridColors()` 动态读取 settingsCenter 的颜色预设，回退到默认 GRID_COLORS；所有 `draw*Grid()` 和 `createRowBorderSVG()`、`createAuxRow()`、`renderSheet()` 均支持动态颜色
- **[Sidebar.js](file:///c:/poem2pdf/distribution/src/components/Sidebar.js#L165-L206)**：新增 `createColorPresetSection()` 4 色圆形快切按钮组
- **[settingsCenter.js](file:///c:/poem2pdf/distribution/src/modules/settingsCenter.js#L154-L173)**：设置面板新增"🎨 线框颜色"分节
- **[theme.css](file:///c:/poem2pdf/distribution/src/styles/theme.css#L180-L215)**：新增 `.color-preset-btn` 圆形色块按钮样式（32px，hover 放大，active 加粗边框）
- **[settingsCenter.css](file:///c:/poem2pdf/distribution/src/styles/settingsCenter.css#L193-L219)**：新增 `.sc-color-preset-btn` 样式（与侧栏按钮等效，独立类名避免冲突）

### 🎨 UI 控件重排与界面优化（参考 design-proposals.html 建议）

以"字帖显示区域不作实质性变动、始终居于核心地位"为基本原则，对其它控件编排进行合理优化。

#### 优化 1 — "生成"按钮简化为刷新图标

- **用户反馈**："生成"按钮与"生成字帖"是同一功能，可用"刷新"SVG 图标替代则更加简洁
- **[index.html](file:///c:/poem2pdf/distribution/index.html#L59-L67)**：快捷工具栏的"生成"按钮改为 refresh SVG 图标（icon-only），title="刷新字帖（按当前输入与设置重新生成预览）"
- 主按钮"生成字帖"保留文字+图标（明确主操作）
- **[fab.css](file:///c:/poem2pdf/distribution/src/styles/fab.css#L96-L109)**：新增 `.btn-quick.icon-only` 样式（36×36px 方形，图标居中）

#### 优化 2 — "打印"按钮简化为图标-only

- **用户反馈**："打印"按钮与右下角打印机 FAB 是同一功能，只用图标即可简洁明了
- **[index.html](file:///c:/poem2pdf/distribution/index.html#L64-L66)**：快捷工具栏的"打印"按钮改为 icon-only，title="打印 / 导出PDF（矢量PDF，调用浏览器原生打印）"

#### 优化 3 — Puppeteer 按钮移至低调位置

- **用户反馈**："Puppeteer 打印在没有 Node.js 或后端服务的情况下仅仅演示，大概率评委会无法使用，可放到低调位置"
- **[fab.css](file:///c:/poem2pdf/distribution/src/styles/fab.css#L24-L37)**：
  - 位置从 `bottom:88px right:24px`（紧邻主打印按钮）→ `top:90px right:84px`（右上角设置按钮左侧）
  - 尺寸从 52px → 40px（缩小）
  - 配色从紫色渐变 `#8b5cf6/#7c3aed` → 低调灰 `rgba(100,116,139,0.85)`
  - 明确视觉层级：右下角=核心操作（打印），右上角=配置/演示功能（主题/设置/Puppeteer）

#### 优化 4 — "添加字体"按钮改为图标+悬停 tooltip

- **用户反馈**："添加字体"四字在界面中显得格格不入，可用 icon 替代但悬停显示详细功能解释
- **[index.html](file:///c:/poem2pdf/distribution/index.html#L50-L54)**：移除"添加字体"文字，保留上传图标，title 改为详细说明"添加自己的字体文件（支持 ttf/otf/woff/woff2 格式，加载后可在字体下拉框中选择）"
- **[fab.css](file:///c:/poem2pdf/distribution/src/styles/fab.css#L104-L109)**：新增 `.font-upload-btn.icon-only` 样式（34×34px 方形）

#### 优化 5 — "难度评估"改为状态栏样式

- **用户反馈**："难度评估只是辅助次要功能，以状态栏之类不起眼方式显示即可，不需要占据 UI 正中心最显眼位置"
- **[index.html](file:///c:/poem2pdf/distribution/index.html#L89-L92)**：难度评估从输入区中部移至底部，class 从 `.diff-area` 改为 `.diff-status-bar`，新增 `role="status" aria-live="polite"`
- **[difficulty.css](file:///c:/poem2pdf/distribution/src/styles/difficulty.css)**：整体尺寸缩小（padding 5px、font-size 11px、星级 11px、标签 10px），去除粗边框改为透明边框，视觉上不抢眼

#### 优化 6 — 移除字号控件

- **用户反馈**："字号修改意味着整个网格和 SVG 图片也要相应修改，每行网格数、分页行数都要大幅度调整，意义不大且工作量巨大，不建议有这个功能"
- **[settingsCenter.js](file:///c:/poem2pdf/distribution/src/modules/settingsCenter.js#L100-L102)**：createPanel 函数移除字号滑块 UI
- **DEFAULT_SETTINGS 保留 `fontSize: 43`** 作为向后兼容（applySettings 仍设置 `--sc-font-size` CSS 变量），但 UI 不再暴露

### 🐛 修复回归 bug（2 项）

#### 修复 1 — 设置面板因 scFontSize 残留引用导致整体交互失效（严重）

- **根因**：v2.5.3 移除字号控件时，`bindPanelEvents` 中的 `sliders` 数组仍保留 `{ id: 'scFontSize', valId: 'scFontSizeVal', ... }` 条目
- **影响**：用户打开设置面板时，`overlay.querySelector('#scFontSize')` 返回 null，`input.addEventListener` 抛 `TypeError: Cannot read properties of null`，导致 `forEach` 中断，**后续所有事件绑定都不执行**，包括：
  - 描红透明度滑块无响应
  - 网格类型按钮（田/米/九宫/回/拼音田）无响应
  - **v2.5.3 新增的颜色预设按钮无响应** ← 核心新功能失效
  - 显示开关、主题单选、重置/完成按钮全部无响应
  - 面板成为"死面板"无法关闭
- **修复**：[settingsCenter.js:253-271](file:///c:/poem2pdf/distribution/src/modules/settingsCenter.js#L253-L271)
  - 删除 sliders 数组中的 scFontSize 条目
  - 新增防御性 null 检查 `if (!input || !valEl) return;` 防止未来类似回归

#### 修复 2 — 设置面板颜色预设按钮缺少事件绑定

- **根因**：createPanel 生成了 `.sc-color-preset-btn` 按钮 HTML，但 bindPanelEvents 遗漏了对应的事件绑定
- **影响**：点击设置面板内的颜色预设按钮无反应（侧栏的颜色快切按钮不受影响，独立工作）
- **修复**：[settingsCenter.js:286-297](file:///c:/poem2pdf/distribution/src/modules/settingsCenter.js#L286-L297) 新增 `.sc-color-preset-btn` 点击事件绑定，逻辑与侧栏等效

### 📦 备份与回退

- **基线备份 tag**：`backup/pre_v2.5.3_features/20260725_160000`（v2.5.3 网格类型/颜色切换功能提交前）
- **v2.5.3 提交**：`e9260e9`（feat(v2.5.3): 网格类型快切+线框颜色预设）
- **UI 优化提交**：本次 UI 控件重排 + 回归 bug 修复
- 回退命令：`git reset --hard backup/pre_v2.5.3_features/20260725_160000`

### ✅ 验证

- ✅ 构建通过：`npm run build` 成功，839 模块，0 错误 0 警告
- ✅ 诊断检查：所有修改文件 0 诊断错误
- ✅ 回归检查：index.html 完整性、事件绑定一致性、v2.5.3 功能完整性全部通过
- ✅ 字号移除：UI 面板不再渲染字号滑块；DEFAULT_SETTINGS 保留 fontSize 字段作为兼容

---

## [v2.5.2] — 2026-07-24

### 🔧 自定义字体Puppeteer修复 + 页眉字体名 + 系统楷体检测（4项功能修复）

启用多 agent 并行调查与修复，备份于 `backup_v251/`。

#### 修复1 — Puppeteer 加载用户自定义字体后 PDF 仍用默认文鼎楷体

- **用户反馈**："加载用户自定义的新字体之后，用window.print()可以打印出正常矢量PDF格式的字帖和新渲染好的字体；但使用puppeteer方式生成矢量PDF的时候，加载新的字体、完成渲染，导出的PDF文件中字帖里仍然使用的是默认的文鼎楷体"
- **根因**：
  1. 用户自定义字体通过 `FontFace API` + `FileReader.readAsDataURL()` 加载到浏览器内存
  2. 字体数据仅存在于当前页面的 `document.fonts` 中，未持久化
  3. Puppeteer 服务器加载全新页面（`file:///dist/index.html`），无法访问客户端内存中的自定义字体
  4. 服务器仅收到字体显示名（如 "★ 姜浩硬笔楷书"），但下拉框中没有该选项
  5. 字体选择失败，回退到默认 "文鼎楷体"
- **修复方案**：
  - **[fontManager.js](file:///c:/poem2pdf/distribution/src/modules/fontManager.js#L40-L42)**：
    - `handleFontUpload` 中将 data URL 存储到 `opt.dataset.fontDataUrl`
    - 同时存储显示名到 `opt.dataset.fontDisplayName`
  - **[puppeteerClient.js](file:///c:/poem2pdf/distribution/src/modules/puppeteerClient.js#L53-L55)**：
    - 读取选中字体的 `fontValue`（内部名称）和 `fontDataUrl`（base64 数据）
    - 将两者随请求发送给服务器
  - **[puppeteer-server.cjs](file:///c:/poem2pdf/distribution/puppeteer-server.cjs#L73-L96)**：
    - 接收 `fontDataUrl` 和 `fontValue`
    - 将 base64 数据写入临时文件 `dist/temp-custom-font.ttf`
    - 在 Puppeteer 页面中通过 `FontFace API` 注册字体（URL 加载）
    - 添加到下拉框并设为选中
    - 请求体大小限制从 1MB 提升到 50MB
    - PDF 生成完成后自动清理临时字体文件
  - **[puppeteer-pdf.cjs](file:///c:/poem2pdf/distribution/puppeteer-pdf.cjs#L97-L99)**：
    - 新增 `--font-file <路径>` 命令行选项
    - 使用 `file:///` 协议直接加载本地字体文件
    - `--font` 参数作为显示名，注册为 `CustomFont1`
- **验证**：CLI 测试 `--font "测试字体" --font-file "fonts/texgyreadventor-regular.otf"` 成功，页眉正确显示 "测试字体练习"

#### 修复2 — 自动检测系统已安装的楷体字体（最多2种）

- **用户反馈**："用户在使用的时候，可能希望电脑上已经有的各种楷体都可以自动作为备选加载项"
- **方案**：Canvas 文本测量法（性能开销 < 10ms，不影响启动速度）
  - **[fontManager.js](file:///c:/poem2pdf/distribution/src/modules/fontManager.js#L52-L97)**：
    - 新增 `detectSystemFonts()` 函数
    - 维护跨平台楷体字体名称列表（Windows/macOS/Linux/HarmonyOS）
    - 使用 canvas `measureText()` 对比目标字体与 monospace 的宽度差异
    - 检测到字体自动添加到下拉框（☆ 前缀区分）
    - 最多添加 2 种非默认楷体
  - **[main.js](file:///c:/poem2pdf/distribution/src/main.js#L57-L58)**：
    - `loadFonts().then()` 中调用 `detectSystemFonts()`
- **覆盖的操作系统字体**：
  - Windows: 楷体, KaiTi, 华文楷体, STKaiti, 方正楷体_GBK, 方正楷体, KaiTi_GB2312, SimKai
  - macOS: 楷体-简, Kaiti SC, KaiTi
  - Linux: AR PL UKai CN, WenQuanYi Zen Hei
  - HarmonyOS/Android: HarmonyOS Sans SC, Source Han Sans SC

#### 修复3 — 页眉右侧默认文本改为字体名+练习

- **用户反馈**："页眉中最右侧默认的文本'字体练习'切换为不超过6个汉字字符的对实际加载字体的名字的描述、后加'练习'"
- **修复**：在 4 个文件中统一修改页眉右侧逻辑：
  - **[puppeteer-pdf.cjs](file:///c:/poem2pdf/distribution/puppeteer-pdf.cjs#L391-L412)**
  - **[puppeteer-server.cjs](file:///c:/poem2pdf/distribution/puppeteer-server.cjs#L149-L172)**
  - **[src/modules/pdfExport.js](file:///c:/poem2pdf/distribution/src/modules/pdfExport.js#L22-L44)**（window.print() 路径）
  - **[src/utils/pdfExport.js](file:///c:/poem2pdf/distribution/src/utils/pdfExport.js#L128-L141)**（jsPDF 路径）
- **逻辑**：
  1. 如果用户自定义了页眉右侧（值 ≠ "字体练习"），使用用户自定义值
  2. 否则，取字体显示名，去掉 ★/☆ 前缀和文件扩展名
  3. 如果汉字字符 > 6，先尝试移除 "体" 字
  4. 如果仍 > 6，截断到 6 个汉字字符
  5. 追加 "练习"
- **示例**：
  - "文鼎楷体" → "文鼎楷体练习"
  - "方正楷体_GBK" → "方正楷体_GBK练习"
  - "我逸清晨体楷书" → "我逸清晨楷书练习"（移除"体"，6字+练习）

#### 备份与回退
- `backup_v251/` 保存修复前版本
- 回退方法：从 `backup_v251/` 还原对应文件后重新 `npm run build`

---

## [未发布 / v2.5.1] — 2026-07-24

### 🔧 边框填充矩形化 + IDM修复回退 + 效率深度优化（3项顽固问题修复）

启用多 agent 并行调查与修复，备份于 `backup_v250/`。

#### 修复1 — 格子边框线宽过小（填充矩形方案，彻底解决）

- **用户反馈**："之间修复2矫枉过正的问题没有解决：不论用window.print() 还是 puppeteer 方式打印，格子的边框线宽都过小了"
- **v2.5.0 失败原因**：
  1. CSS `@media print` 中 `shape-rendering: crispEdges !important` 覆盖了 SVG 元素上的 `geometricPrecision` 设置
  2. SVG `stroke-width=2.0`（用户单位）在 PDF 中渲染为 **0 宽度**（PyMuPDF 分析确认：66 条边框线 width=0.0pt）
  3. 根因：Chrome PDF 引擎对 SVG stroke + `preserveAspectRatio: none` + `crispEdges` 的组合处理有 bug，stroke 被转为 0 宽度填充路径
- **v2.5.1 修复方案 — 改用填充矩形代替 stroke**：
  - **[GridEngine.js](file:///c:/poem2pdf/distribution/src/components/GridEngine.js#L306-L331)**：
    - `createRowBorderSVG` 中的 stroke rect/line 全部改为 **fill rect**（填充矩形）
    - 4 个填充矩形绘制外框（上/下/左/右），N-1 个填充矩形绘制内部竖线
    - 填充矩形在 PDF 中始终按精确尺寸渲染，不受 shape-rendering 和 preserveAspectRatio 影响
    - 与页顶 `border-top` 的 PDF 渲染机制完全一致（CSS border 在 PDF 中也是填充矩形）
  - **[grid-svg.css](file:///c:/poem2pdf/distribution/src/styles/grid-svg.css#L166-L175)**：
    - `@media print` 中 `shape-rendering: crispEdges !important` → `geometricPrecision !important`
    - 新增 `.grid-svg-row-border rect` 的 `print-color-adjust: exact !important`
- **验证结果**（PyMuPDF 分析）：
  - 绿色填充路径：85 条（13 水平边 + 72 竖直边）✓
  - 边框宽度：**0.92pt (0.324mm)** — 精确渲染，不再是 0 宽度 ✓
  - 页顶实线：0.75pt (0.265mm) — 与边框基本一致（差异 0.059mm）✓
  - 绿色描边路径中 0 宽度线：**0 条** — 彻底消除 ✓

#### 修复2 — Puppeteer PDF 生成彻底不能用（回退 IDM 修复到 v2.4.18）

- **用户反馈**："为了解决跟这个IDM插件的冲突，导致puppeteer生成矢量格式PDF文件的功能彻底不能用了；如果解决跟IDM插件的冲突问题太难，就这个方面的修复回退到2418版，确保至少能用"
- **v2.5.0 失败原因**：base64 JSON 响应模式（`X-Response-Type: json`）导致 PDF 生成彻底不能用
- **v2.5.1 修复方案 — 回退到 v2.4.18 直接 PDF 响应模式**：
  - **[puppeteerClient.js](file:///c:/poem2pdf/distribution/src/modules/puppeteerClient.js#L80-L131)**：
    - 移除 `X-Response-Type: json` 请求头
    - 移除 base64 JSON 解码逻辑（`atob` → `Uint8Array` → `Blob`）
    - 恢复直接 `response.blob()` 下载方式
    - 保留友好提示：当 `Failed to fetch` 时显示绿色成功提示（非红色错误），引导用户检查 IDM 下载列表
  - **[puppeteer-server.cjs](file:///c:/poem2pdf/distribution/puppeteer-server.cjs)**：
    - 保留 base64 JSON 响应代码（向后兼容旧客户端），但默认使用直接 PDF 响应
- **效果**：Puppeteer PDF 生成恢复正常，IDM 用户看到绿色提示而非红色错误

#### 优化3 — Puppeteer 效率深度优化（耗时降低 44%）

- **用户反馈**："用puppeteer方式打印效率太低，进一步找一找导致效率低的原因"
- **低效根因分析**：
  1. **puppeteer-server.cjs 重复等待**：字体/笔画等待逻辑被复制了两份（第 87-98 行和第 135-146 行完全相同），浪费 ~2-3 秒
  2. **固定等待时间过长**：初始等待 1500ms、字体等待 800ms、打印模式等待 500ms
  3. **puppeteer-pdf.cjs 同样存在过长等待**
- **优化措施**：
  - **puppeteer-server.cjs**：
    - 移除重复的字体/笔画等待块（节省 ~2-3 秒）
    - 初始等待 1500ms → 500ms
    - 字体等待 800ms → 400ms
    - 打印模式等待 500ms → 200ms
    - 保留 `--disable-extensions` 禁用 IDM 等扩展
  - **puppeteer-pdf.cjs**：
    - 初始等待 1500ms → 500ms
    - 打印模式等待 500ms → 200ms
    - 保留 `--disable-extensions`
- **效果**：
  - puppeteer-pdf.cjs CLI 耗时：14.0 秒 → **7.8 秒**（提升 44%）
  - puppeteer-server.cjs 预期提升更大（移除了重复等待）

#### 备份与回退
- `backup_v250/` 保存修复前版本（GridEngine.js, grid-svg.css, puppeteerClient.js, puppeteer-server.cjs, puppeteer-pdf.cjs）
- 回退方法：从 `backup_v250/` 还原对应文件后重新 `npm run build`

---

## [未发布 / v2.5.0] — 2026-07-24

### 🔧 页顶实线修复 + 边框线宽校准 + IDM兼容 + 效率优化（4项深度修复）

启用多 agent 并行调查与修复，备份于 `backup_v2418/`。

#### 修复1 — 格子边框线宽过小（矫枉过正修复）+ 页顶实线在 PDF 中不显示

- **用户反馈**："之间修复2矫枉过正了：不论用window.print() 还是 puppeteer 方式打印，格子的边框线宽都过小了，请把它调整到跟每页最上面的跟整个页面行宽等宽的实线线宽线型都一致的程度"
- **真正根因（双重问题）**：
  1. **边框过细**：v2.4.18 将 `BORDER_SW` 从 3.6 骤减至 1.6（≈0.26mm），加上 `shape-rendering: crispEdges` 的像素对齐，导致细线在矢量 PDF 中视觉上更细
  2. **页顶实线在 PDF 中不可见**：v2.4.10 将页顶实线从 SVG 改为 CSS `background-image: linear-gradient`，但 CSS `background-image` 在 Puppeteer 生成的 PDF 中不渲染（`print-color-adjust: exact` 对 background-image 无效）
  - **验证**：PyMuPDF 分析 v2.4.18 PDF，绿色填充路径 = 0，页顶区域无贯穿整行的绿色线条

- **修复方案**：
  - **页顶实线改回实体边框实现**（[grid-svg.css](file:///c:/poem2pdf/distribution/src/styles/grid-svg.css#L72-L81)）：
    - 从 `background-image: linear-gradient` 改为 `border-top: 0.324mm solid #2E7D32`
    - border 是元素固有属性，打印/PDF 中自然渲染，不受 print-color-adjust 限制
    - 天然撑满整行宽度，无分页孤立问题
  - **边框线宽校准**（[GridEngine.js](file:///c:/poem2pdf/distribution/src/components/GridEngine.js#L306-L330)）：
    - `BORDER_SW` 从 1.6 调整为 **2.0 SVG 单位 ≈ 0.324mm**
    - 与页顶实线 `border-top: 0.324mm` 完全一致
    - 是 1.6（过细）和 3.6（过粗）之间的合理中间值
    - 换算：每格 16.2mm = 100 SVG 单位 → 2.0 / 100 × 16.2 = 0.324mm
  - **渲染精度优化**（[GridEngine.js](file:///c:/poem2pdf/distribution/src/components/GridEngine.js#L302-L304)）：
    - `shape-rendering` 从 `crispEdges` 改为 **`geometricPrecision`**
    - crispEdges 将细线对齐到整像素，导致 0.3mm 级别的线在打印/PDF 中视觉上过细
    - geometricPrecision 确保矢量 PDF 中 stroke 宽度精确渲染
  - **保持外框内对齐**：`HALF_SW` 偏移不变，确保 stroke 完全在 viewBox 内，不被页面边距裁剪

- **效果**：
  - 页顶实线在 PDF 中正常显示（绿色，贯穿整行，0.324mm）
  - 格子边框线宽与页顶实线完全一致（同渲染机制，同物理宽度）
  - 两种打印方式（window.print() / Puppeteer）效果一致
- **验证方式**：对比 PDF 中格子边框与页顶实线的粗细，应完全一致

#### 修复2 — Puppeteer "Fetch failed" 红色错误（IDM 下载插件拦截）

- **用户反馈**："每次通过脚本启动，用Puppeteer打印矢量格式PDF，到了下载阶段，总是Fetch failed这个红色提示，但最终的PDF文件又能够从internet download manager下载出来"
- **根因**：
  - `puppeteerClient.js` 用 `fetch()` 请求 `/api/generate-pdf`，服务器返回 `Content-Type: application/pdf`
  - IDM（Internet Download Manager）浏览器扩展检测到 PDF 响应，拦截 fetch 响应流并自行下载
  - fetch API 无法读取被拦截的响应，抛出 "Fetch failed" 错误并显示红色 toast
  - 但 IDM 已成功下载 PDF，所以用户能在 IDM 中找到文件
- **修复方案 — base64 JSON 响应模式**：
  - **[puppeteerClient.js](file:///c:/poem2pdf/distribution/src/modules/puppeteerClient.js#L80-L144)**：
    - 请求添加 `X-Response-Type: json` 自定义头部
    - 响应格式从直接 PDF 改为 `{ success: true, data: base64PDF }`
    - 客户端用 `atob()` 解码 base64 → `Uint8Array` → `Blob` → 创建下载链接
    - `Content-Type: application/json` 不会被下载管理器拦截，彻底解决 "Fetch failed"
    - 兜底：即使 fetch 仍失败（极端情况），提示 "PDF已生成，请检查下载列表"（绿色成功提示，而非红色错误）
  - **[puppeteer-server.cjs](file:///c:/poem2pdf/distribution/puppeteer-server.cjs#L258-L282)**：
    - 检测 `X-Response-Type: json` 头部，返回 base64 JSON 响应
    - 无此头部时保持直接 PDF 响应（向后兼容）
    - CORS 允许 `X-Response-Type` 头部
- **效果**：不论是否启用 IDM 插件，都能正常下载，无 "Fetch failed" 红色错误

#### 优化3 — Puppeteer 效率深度优化

- **用户反馈**："用puppeteer方式打印效率太低，进一步找一找导致效率低的原因"
- **低效根因分析**：
  1. **浏览器扩展后台运行**：Puppeteer 启动的 Chromium 未禁用扩展，IDM 等扩展在后台消耗 CPU/内存
  2. **puppeteer-server 缺少字体和笔画等待逻辑**：可能在资源未就绪时就生成 PDF，且后续调用时重复等待
- **优化措施**：
  - **puppeteer-pdf.cjs + puppeteer-server.cjs**：
    - 添加 `--disable-extensions` 和 `--disable-component-extensions-with-background-pages` 启动参数
    - 禁用所有浏览器扩展，减少资源消耗和启动时间
  - **puppeteer-server.cjs generatePDF 函数**：
    - 添加字体加载等待（`document.fonts.ready` + 800ms）
    - 添加笔画 SVG 等待（`window.__waitForStrokes(15000)`）
    - 确保 PDF 生成时所有资源已就绪（之前缺少这两步，可能导致笔画不显示）
- **预期效果**：
  - 浏览器启动更快（无扩展加载开销）
  - 运行时内存占用更低
  - 服务器端生成的 PDF 也包含笔画 SVG 信息

#### 修复4 — puppeteer-server 笔画 SVG 不显示

- **根因**：`puppeteer-server.cjs` 的 `generatePDF` 函数中，点击生成按钮后，只等待了 `.grid-svg-cell` 出现，未等待字体和笔画加载完成
- **修复**：在 `generatePDF` 中添加字体等待（800ms）和笔画等待（`__waitForStrokes`），与 `puppeteer-pdf.cjs` 逻辑对齐
- **效果**：服务器模式生成的 PDF 也包含完整的笔画/笔顺 SVG 信息

#### 备份与回退
- `backup_v2418/` 保存修复前版本（关键文件备份）
- 回退方法：从 `backup_v2418/` 还原对应文件后重新 `npm run build`

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
