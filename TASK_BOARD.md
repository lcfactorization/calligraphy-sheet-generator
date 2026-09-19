# 字帖生成器 — 重构任务看板（v2.4.0 · SVG 矢量化 + 双轨 PDF + 朱砂暖宣 UI）

> [!NOTE]
> **文档状态**:v2.4.0 重构已全部完成,本看板保留作为重构历史记录。
> 重构后续演进(v2.5–v3.0.5)见文末[重构后续演进](#重构后续演进)段落。
> 当前最新有效状态请参阅 [README.md](./README.md) 和 [CHANGELOG.md](./CHANGELOG.md)。

> 提示词来源:`字帖项目html渲染网格PDF显示以及最终打印的精准尺寸控制提示词.20260723Gemini.md`
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

> v2.4.0 重构完成后,项目继续迭代到 v3.0.5。以下为关键演进节点(完整记录见 [CHANGELOG.md](./CHANGELOG.md))。

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

### 当前状态(v3.0.5)
- **代码版本**:v3.0.5(package.json + CHANGELOG)
- **构建模块**:846 模块(随迭代增长)
- **源文件**:15 JS + 18 CSS + 3 数据 + 2 组件 + 1 契约 + 1 工具 + 1 入口 = 41 源文件
- **备份机制**:每个版本有 backup 分支可回退（v3.0.0 AI 加固前备份分支：backup/pre_v300_final_20260807）
- **部署**:GitHub Actions 自动部署(GitHub Pages + Cloudflare Pages 双平台,触发分支:retake)
- **在线访问**:https://calligraphy-sheet-generator.pages.dev/
- **v3.0.0 AI 加固**(2026-08-07):三模式分流(快速/单音字校验/多音字深度校验)+5分钟硬超时+3次重试+缓存穿透修复+级联开关+404/401/403/429错误诊断+AbortSignal.any兼容兜底+紧急逃生门+豆包JSON mode实测验证(90字组词测试通过)

### v3.0.1 — 功能增强与安全加固(2026-08-15)
- **手动修改模式**:点击字帖行右侧"拼音+组词"区域,弹出轻量编辑浮层,支持手动修改拼音和组词(优先级:手动 > AI > 默认词库)
- **导入格式增强**:宽松输入支持(多音字、拼音数字声调、组词自由输入)+ 导入格式说明页面 import-guide.html
- **多 API Key 管理**:支持保存多个 Key(DeepSeek sk-/火山引擎豆包 ark-),下拉切换即生效,眼睛/复制/删除按钮;从文件批量导入(txt/md/csv/docx);API Key 使用说明页 api-key-guide.html(密钥仅存 localStorage,不入库)
- **macOS 启动脚本**:从个人版移植 启动Puppeteer.command,跨平台启动脚本补齐 macOS 支持
- **安全加固**:.gitignore 追加 API Key 排除规则(.env/api-key-*/wrangler.toml/vercel.json 等)+ 个人版专属文件排除规则(使用说明.txt/api/functions/)
- **样式优化**:onboarding/base/fab/print/grid-svg 样式微调
- **代码质量**:zuci.js 手动修改优先级逻辑 + aiZuci.js userEdited 标记 + aiZuci.js 活跃 Key 兑底 + settingsCenter.js 多 Key UI + pinyin.js convert 导出 + main.js manualEdit 模块初始化
- **CI/CD**:deploy.yml 触发分支新增 main(同时支持 main 和 retake 分支推送)
- **不包含**:在线 PDF API/商业字体(均为个人版专属功能)

### v3.0.2 — 弹窗交互优化(2026-08-16)
- **弹窗行为统一**:所有弹窗(设置/手动修改/智能推荐/学习报告)移除"点击外部关闭"逻辑,点击外部保持打开(变灰)
- **窗口控制按钮**:每个弹窗新增最小化/最大化/关闭按钮(settingsCenter/manualEdit/recommender/reportPanel 四模块同步)
- **关键 Bug 修复**:manualEdit.js 修复设置弹窗关闭后 DOM 残留(仅 display:none)导致手动修改弹窗打不开的问题,改为检查可见 modal

### v3.0.3 — 访问统计系统(2026-08-16)
- **访问统计**:Cloudflare Pages Functions 中间件(functions/_middleware.js),记录访问 IP/操作系统/浏览器/访问时间/次数/地理位置/来源/路径
- **每日邮件报告**:analytics/cron-worker 每天北京时间 08:00 发送 Markdown 统计报告到指定邮箱(IP Top20/国家/浏览器/OS/设备/来源/路径/小时分布)
- **数据存储**:Cloudflare D1 数据库(analytics/daily_stats/reports 三表),API 端点 /api/report /api/stats /api/health(CRON_SECRET 鉴权)
- **一键配置**:analytics/setup.ps1(建 D1 + 部署 Pages Functions + 部署 Cron Worker + 验证)
- **设置导航**:analytics/README.md 详细 7 节步骤(创建 D1/绑定/环境变量/部署/验证/常见问题)
- **安全**:无密码保护(公开版,与自用版不同)、无 /api/debug /api/test-email、CRON_SECRET 默认值更换、wrangler.toml 不入库
- **在线访问改为 Cloudflare Pages**:https://calligraphy-sheet-generator.pages.dev/ 为主发布链接(统计功能仅 Cloudflare 生效)

### v3.0.5 — 隐私与合规加固 + 双击启动修复(2026-09-18)
- **隐私加固**:移除硬编码个人邮箱(改为 fail closed)与公开仓库中的默认 `CRON_SECRET`(未配置即 401,setup.ps1 改生成 32 字节随机密钥);访问统计**不再存储原始 IP / 完整 User-Agent / 城市**,访客标识改为带密钥 SHA-256 哈希(IPv4 无盐哈希可秒级反查,故必须带密钥);移除作者真实姓名;清除 138 处泄露本机目录结构的 `file:///C:/...` 死链(119 处转为仓库内相对链接);新增 `PRIVACY.md`
- **知识产权合规**:补齐**缺失的 `LICENSE`**(README 早已声明 MIT 并链接该文件,但文件不存在);补齐 **`ARPHICPL.TXT`** —— 笔画数据与文鼎楷体来自 Arphic Technology,其许可 §1 强制要求分发时原样保留该文件;新增 `THIRD_PARTY_NOTICES.md` 列出全部内联依赖许可;`puppeteer-pdf.cjs` 移除商业字体默认引用(姜浩硬笔楷书等),默认改为随仓库分发的文鼎楷体,并提供 gitignored 的本地私有字体映射
- **双击启动修复**:`file://` 下启动器误报「无法加载」的根因是 1500ms 超时 vs 实测 6009ms 加载(16.4MB 数据)+ 监听注册竞态 + 错误提示不可恢复;改为**应用主动发就绪信标**(`postMessage`),超时仅作兜底且可恢复;新增加载进度与重试按钮;顺带补 favicon、指南链接改相对路径、Service Worker 改自行注册(带 PROD 与 file:// 双重前置条件)
- **验证**:新增 `verify-v304-file-protocol.cjs`(19/0);8 个套件全绿
- **部署链路修复(2026-09-19 补记,版本号不变)**:v3.0.5 推送后线上并未更新 —— GitHub Pages 与 Cloudflare Pages 都停在 v3.0.3。根因是 v3.0.4 起 `scripts/download-fonts.sh` 在 CI 中新增了「pip 装 fontTools + 下载并转 woff2」逻辑,而 `pip3 install` 在 GitHub 的 Ubuntu 24.04 runner 上触发 PEP 668 必失败、TW-Kai 上游 `anthonyfok/TW-Kai` 已被删除(实测 404,curl 会把 404 HTML 当字体存下),`set -e` 使整个构建中断,Build/Setup Pages/Upload artifact 三步全被 skip(最近一次成功部署是 `39374ca`,2026-08-15)。修复:4 个 woff2 字体改为**随仓库分发**(共 48 MB,单文件 ≤16.6 MB,低于 CF Pages 25 MiB 单文件上限);新增 `scripts/verify-fonts.sh` 只做存在性 / `wOF2` 文件头 / 体积校验,CI 中失败即报错;`download-fonts.sh` 改为转发到 `verify-fonts.sh` 的兼容垫片(不再下载任何内容,保留文件名以兼容仍引用旧路径的构建配置),工作流 `Download fonts` → `Verify bundled fonts`。构建不再依赖任何外部 URL、pip 或字体转换工具

### v3.0.4 — 多引擎 AI 自动优选 + 触屏/平板笔顺弹窗自适应(2026-09-18)
- **多引擎 AI 自动优选**:新增 `src/modules/aiProviders.js` 引擎注册表(16 家:DeepSeek/火山引擎豆包/智谱 GLM/Kimi/硅基流动/阿里百炼/OpenRouter/MiniMax/阶跃星辰/千帆 v2/混元 + Agnes AI/ModelScope 魔搭 实测可用 + APINEX 实测 `cors:'failed'` + Gemini/Groq 标记 `cors:'unverified'`;不收录讯飞星火)+ `src/modules/aiKeyHealth.js` 两阶段探测(零 token `/models` 鉴权 + 3 token chat 能力);`sk-` 歧义 Key 逐个探测自动消歧并回写 `providerId`;设置中心默认「自动选择(推荐)」,新增「🔍 检测全部 Key 可用性」;添加/导入 Key 后自动探测;`ai_model_override` 改为按引擎作用域
- **触屏/平板笔顺弹窗自适应**:`.sd-overlay` 由 flex 改为 CSS Grid + `solveLayout()` 纯函数求解器(冻结 340×440 布局盒 + `transform: scale(--sd-s)`);桌面 `sMax=1.0` 逐像素零退化,触摸/平板 `sMax=1.6`;手机视口不足时自动收最旧窗口为最小化药丸(LRU 恢复);触摸目标放大(按钮 26→34px、播放 36→44px、滑块拇指 14→22px);拖拽视口边界约束 + 双击标题栏复位 + 补齐 `.sd-flash` 聚焦反馈;新增 769–1280px 平板断点
- **不包含**:在线 PDF API/商业字体(均为个人版专属功能)
