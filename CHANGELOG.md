# 更新日志

所有 notable 变更记录在此文件中。
格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)。

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
