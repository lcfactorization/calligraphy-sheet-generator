# 字帖生成器 — 重构任务看板（v2.4.0 · SVG 矢量化 + 双轨 PDF + 朱砂暖宣 UI）

> 提示词来源：`C:\poem2pdf\字帖项目html渲染网格PDF显示以及最终打印的精准尺寸控制提示词.20260723Gemini.md`
> 备份 tag：`backup/pre_svg_refactor/20260723_143000`（HEAD: 9587410）
> 架构契约：`src/contracts/interfaces.js`

## 绝对架构契约
- ✅ 技术栈锁定：Vite + Vanilla JS/TS + Tailwind CSS + PWA（禁止迁移 React）
- ✅ 功能零退化：保留 pinyin-pro / cnchar / hanzi-writer / 本地词典 / 模板库 / LocalStorage
- ✅ 彻底矢量化：废弃 CSS 拼凑网格 → 参数化 Inline SVG 字格引擎
- ✅ 双轨 PDF：客户端 window.print() + jsPDF/svg2pdf.js；服务端 Puppeteer
- ✅ 物理级尺寸：18mm × 18mm，误差 < 0.1mm，绝不跨页断格

## 文件隔离矩阵
| Agent | 模块 | 独占文件 |
|:------|:-----|:--------|
| 0 Master | 契约调度 | `src/contracts/interfaces.js`, `TASK_BOARD.md` |
| A | SVG 网格引擎 | `src/components/GridEngine.js`, `src/styles/grid-svg.css` |
| B | 物理排版 + 双轨 PDF | `src/utils/pdfExport.js`, `src/styles/print.css`, `puppeteer-pdf.cjs` |
| C | 东方 UI + 双栏 | `src/styles/theme.css`, `src/components/Sidebar.js`, `index.html` |
| D | 构建验收 + 文档 | `npm run build`, `CHANGELOG.md`, `README.md` |

## 执行进度
- [x] 阶段 0：契约定义 + 备份 tag `backup/pre_svg_refactor/20260723_143000`
- [x] 阶段 1（A）：SVG 网格引擎（4 类型 × 3 模式 × 18mm）✅
- [x] 阶段 2（B）：print.css A4 锁定 + jsPDF/svg2pdf 客户端导出 + Puppeteer 适配 ✅
- [x] 阶段 3（C）：朱砂暖宣 theme + 320px 双栏 Sidebar ✅
- [x] 集成：main.js 切换新引擎（保留旧 gridRenderer 作回退）✅
- [x] 阶段 4（D）：构建 839 模块 11.29s 0 错 0 警 + 浏览器 6/6 PASS + Puppeteer PDF 18.6KB ✅
- [x] 文档：CHANGELOG + README + package.json v2.4.0 + commit + push ✅

## 验证结果
- 构建：839 模块，11.29s，0 错误 0 警告，dist/index.html 3000.95 KB（gzip 1107.90 KB）
- 浏览器自动化测试 6/6 PASS（首屏加载/SVG网格/双栏布局/网格切换/主题色/控制台）
- Puppeteer PDF：18.6 KB 矢量 PDF，A4 纵向，文字可选择复制，字体完整嵌入

## 回滚策略
- 任意阶段失败：`git reset --hard backup/pre_svg_refactor/20260723_143000`
- 旧模块保留：`src/modules/gridRenderer.js` / `src/modules/pdfExport.js` 不删除，仅 main.js 不再引用
- 新模块路径独立：`src/components/` / `src/utils/` / `src/contracts/` 与 `src/modules/` 物理隔离
