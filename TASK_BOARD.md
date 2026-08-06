# 字帖生成器 — 重构任务看板（v2.4.0 · SVG 矢量化 + 双轨 PDF + 朱砂暖宣 UI）

> [!NOTE]
> **文档状态**:v2.4.0 重构已全部完成,本看板保留作为重构历史记录。
> 重构后续演进(v2.5–v2.9.8)见文末[重构后续演进](#重构后续演进)段落。
> 当前最新有效状态请参阅 [README.md](./README.md) 和 [CHANGELOG.md](./CHANGELOG.md)。

> 提示词来源:`C:\poem2pdf\字帖项目html渲染网格PDF显示以及最终打印的精准尺寸控制提示词.20260723Gemini.md`
> 备份 tag:`backup/pre_svg_refactor/20260723_143000`(HEAD: 9587410)
> 架构契约:`src/contracts/interfaces.js`

## 绝对架构契约
- ✅ 技术栈锁定:Vite + Vanilla JS/TS + Tailwind CSS + PWA(禁止迁移 React)
- ✅ 功能零退化:保留 pinyin-pro / cnchar / hanzi-writer / 本地词典 / 模板库 / LocalStorage
- ✅ 彻底矢量化:废弃 CSS 拼凑网格 → 参数化 Inline SVG 字格引擎
- ✅ 双轨 PDF:客户端 window.print() + jsPDF/svg2pdf.js;服务端 Puppeteer
- ✅ 物理级尺寸:18mm × 18mm,误差 < 0.1mm,绝不跨页断格

## 文件隔离矩阵
| Agent | 模块 | 独占文件 |
|:------|:-----|:--------|
| 0 Master | 契约调度 | `src/contracts/interfaces.js`, `TASK_BOARD.md` |
| A | SVG 网格引擎 | `src/components/GridEngine.js`, `src/styles/grid-svg.css` |
| B | 物理排版 + 双轨 PDF | `src/utils/pdfExport.js`, `src/styles/print.css`, `puppeteer-pdf.cjs` |
| C | 东方 UI + 双栏 | `src/styles/theme.css`, `src/components/Sidebar.js`, `index.html` |
| D | 构建验收 + 文档 | `npm run build`, `CHANGELOG.md`, `README.md` |

## 执行进度(v2.4.0 重构,已全部完成)
- [x] 阶段 0:契约定义 + 备份 tag `backup/pre_svg_refactor/20260723_143000`
- [x] 阶段 1(A):SVG 网格引擎(4 类型 × 3 模式 × 18mm)✅
- [x] 阶段 2(B):print.css A4 锁定 + jsPDF/svg2pdf 客户端导出 + Puppeteer 适配 ✅
- [x] 阶段 3(C):朱砂暖宣 theme + 320px 双栏 Sidebar ✅
- [x] 集成:main.js 切换新引擎(保留旧 gridRenderer 作回退)✅
- [x] 阶段 4(D):构建 839 模块 11.29s 0 错 0 警 + 浏览器 6/6 PASS + Puppeteer PDF 18.6KB ✅
- [x] 文档:CHANGELOG + README + package.json v2.4.0 + commit + push ✅

> [!NOTE]
> v2.4.0 后,旧模块 `src/modules/gridRenderer.js` 和 `src/modules/pdfExport.js` 已在 v2.8.7 清理为死代码删除,main.js 不再引用。

## 验证结果(v2.4.0 重构时)
- 构建:839 模块,11.29s,0 错误 0 警告,dist/index.html 3000.95 KB(gzip 1107.90 KB)
- 浏览器自动化测试 6/6 PASS(首屏加载/SVG网格/双栏布局/网格切换/主题色/控制台)
- Puppeteer PDF:18.6 KB 矢量 PDF,A4 纵向,文字可选择复制,字体完整嵌入

## 回滚策略
- 任意阶段失败:`git reset --hard backup/pre_svg_refactor/20260723_143000`
- 旧模块保留:v2.4.0 时保留 `src/modules/gridRenderer.js` / `src/modules/pdfExport.js` 不删除,仅 main.js 不再引用(v2.8.7 已清理)
- 新模块路径独立:`src/components/` / `src/utils/` / `src/contracts/` 与 `src/modules/` 物理隔离

---

## 重构后续演进

> v2.4.0 重构完成后,项目继续迭代到 v2.9.8。以下为关键演进节点(完整记录见 [CHANGELOG.md](./CHANGELOG.md))。

### v2.5.x — UI 控件重排 + 网格类型快切
- v2.5.3:新增九宫格(第 5 种网格类型)+ 4 色网格颜色预设(传统绿/朱砂红/靛青蓝/墨黑)
- v2.5.4:页脚年份空格 + 标题区压缩 + Puppeteer 按钮位置 + 5 项回归修复
- v2.5.5:精确截取默认文本 + 学习报告按钮样式 + 默认文本超长修复

### v2.6.0 — Puppeteer PDF 应用网格设置
- Puppeteer 导出尊重当前网格类型和颜色预设

### v2.7.0 — 主题切换记忆
- 主题状态持久化到 localStorage + 按钮重叠修复

### v2.8.x — MatePad 适配 + 移动端打印多轮修复
- v2.8.0:多 Agent 协同升级,MatePad 模态/字数扩展/打印性能
- v2.8.1–v2.8.4:MatePad 打印 PDF 修复 + 跨平台文档 + CSS 压缩禁用
- v2.8.5–v2.8.5-hotfix:移动端实测修复 + 严格物理单位 + DOM 页眉页脚
- v2.8.6:页面版本号显示 + puppeteerClient 字体名硬编码修复
- v2.8.7:移动端打印分页根因修复(6 项根因:竞态/CSS冲突/分断结构/二次打印/行对防撕/验证方法论)+ 删除死代码 + ?printdebug=1 真机调试通道
- v2.8.9:移动端打印 DOM 页眉页脚不显示修复(cleanup 事件链 + display 切换 + print-color-adjust)

### v2.9.x — 移动端打印架构 + 引导 + 体验优化
- v2.9.0:移动端打印改隐藏 iframe 静态文档架构,根治页眉页脚缺失
- v2.9.1:修复 Puppeteer 导出 PDF 字帖贴顶/页眉重叠,恢复 @page margin:29mm
- v2.9.2–v2.9.3:顶部边距/页眉页脚颜色调优
- v2.9.4:纯 CSS 重排修复移动端控件重叠(P0 硬伤)
- v2.9.5:跨平台脚本对齐 + 移动端首次使用引导(5 步)+ 桌面端 FAB 拖拽(多 Agent 蜂群模式)
- v2.9.6:修复引导 spotlight 高亮控件位置错乱到对角的 P0 硬伤
- v2.9.7:引导增强(9 步 + "不再自动弹出"选项 + 智能推荐说明)+ Dark 模式范字 inverted color
- v2.9.8:笔画笔顺动态演示(点击字格弹窗逐笔演示,9574 汉字离线数据 + Web Worker 解压 + 双图层 + 播放/暂停 + 速度持久化)+ 引导增强 16 步 + 笔顺演示介绍页 + Dark/触屏/移动端多项 Bug 修复(dark 打印页脚黑底/汉字不显示、触屏 Light 主题、移动端按钮位置/字格双击)

### 当前状态(v2.9.8)
- **代码版本**:v2.9.8(package.json + index.html 徽章 + CHANGELOG)
- **构建模块**:840+ 模块(随迭代增长)
- **源文件**:15 JS + 18 CSS + 3 数据 + 2 组件 + 1 契约 + 1 工具 + 1 入口 = 41 源文件
- **备份机制**:每个版本有 backup 分支可回退
- **部署**:GitHub Actions 自动部署到 GitHub Pages(触发分支:retake)
- **在线访问**:https://lcfactorization.github.io/calligraphy-sheet-generator/
