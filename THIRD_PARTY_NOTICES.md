# 第三方组件与数据 · 许可与署名

> 本文件列出本仓库**分发**或**构建产物中内联**的第三方作品及其许可条款。
> 项目自身源码的许可见 [LICENSE](./LICENSE)（MIT）。
>
> 最近更新：v3.0.5（2026-09-18）

---

## ⚠️ 重要：中文笔画数据（ARPHIC PUBLIC LICENSE）

这是本项目**唯一带有强制保留义务**的第三方资产，请勿删除。

| 项目 | 说明 |
|---|---|
| 仓库内文件 | `public/hanzi-data/hanzi-data.bin`（12,325,622 字节，gzip）<br>`public/hanzi-data/hanzi-data-embedded.js`（16,434,933 字节，同一数据的 Base64 内联版） |
| 内容 | 9,574 个汉字的笔画 SVG 路径、笔顺中心线与偏旁索引 |
| 上游来源 | [`hanzi-writer-data`](https://github.com/chanind/hanzi-writer-data) v2.0.1（其 `package.json` 声明 `"license": "SEE LICENSE IN ARPHICPL.TXT"`） |
| 更上游 | [`Make Me A Hanzi`](https://github.com/skishore/makemeahanzi) —— 该项目的字形数据提取自 **Arphic Technology Co., Ltd.** 于 1999 年以宽松条款发布的字体 |
| **适用许可** | **ARPHIC PUBLIC LICENSE**（全文见 [ARPHICPL.TXT](./ARPHICPL.TXT)） |
| 许可要求 | ARPHIC PUBLIC LICENSE §1：*"You may copy and distribute verbatim copies of this Font in any medium, without restriction, **provided that you retain this license file (ARPHICPL.TXT) unaltered in all copies**."* |

### 本项目对该数据做了什么（§2(a) 变更声明）

上游数据**未做任何内容改动**（没有增删笔画、没有重排字形、没有改字表）。仅做了**容器格式的无损转换**：

- 原始逐字 JSON → 合并为单个 JSON 字典 → **gzip 压缩**（`.bin`）
- 同一 gzip 字节流 → **Base64 编码**内联为 `<script>`（`.js`，用于绕过下载管理器对 `.bin` 的拦截）

- **变更时间**：2026-08-05
- **变更性质**：仅压缩与编码，**解压后字节与上游完全一致**
- **可获取性**（满足 §2(b)「修改须同样自由可得」）：转换脚本与全部原始数据均在本公开仓库中；重新生成方式见 `src/modules/hanziDataStore.js` 头部注释与 `scripts/`。

> 说明：严格来说 gzip/Base64 属于「无损重新封装」而非衍生创作，因此 §2 的额外义务未必适用；此处仍主动给出变更声明，以覆盖更严格的解读。

---

## 字体

| 字体 | 文件 | 许可 | 是否随仓库分发 |
|---|---|---|---|
| 文鼎楷体 TW-Kai | `public/fonts/TW-Kai.woff2` | **ARPHIC PUBLIC LICENSE**（同 [ARPHICPL.TXT](./ARPHICPL.TXT)） | 是（随仓库分发） |
| 霞鹜文楷 LXGW WenKai | `public/fonts/LXGWWenKai-Regular.woff2` | SIL Open Font License 1.1 | 是（随仓库分发） |
| 霞鹜文楷 Light | `public/fonts/LXGWWenKai-Light.woff2` | SIL Open Font License 1.1 | 是（随仓库分发） |
| 思源宋体 SC | `public/fonts/SourceHanSerifSC-Regular.woff2` | SIL Open Font License 1.1 | 是（随仓库分发） |
| TeX Gyre Adventor（拼音用） | `fonts/texgyreadventor-regular.otf` | GUST Font License | 是 |

- 4 个 woff2 字体**随仓库分发**（`public/fonts/`，共约 48 MB）；`.gitignore` 仅排除非 woff2 的原始 ttf/otf。
  `.github/workflows/deploy.yml` 调用 `scripts/verify-fonts.sh` 校验其存在与完整性，**不做下载或格式转换**。
- 各字体的来源仓库与许可见 `scripts/verify-fonts.sh` 顶部注释；完整许可文本随其官方发布包分发。
- ⚠ **`TW-Kai.woff2` 的公开上游已失效**（`anthonyfok/TW-Kai` 仓库已被删除，原下载链接实测返回 404），
  本仓库中的副本为唯一来源，请勿删除；误删可用 `git checkout -- public/fonts/` 恢复。

### 未包含的商业字体（重要）

本项目**不包含、也不默认引用**任何需要单独商业授权的字体。以下字体在 v3.0.5 中已从公开代码移除：

方正仿宋 GBK、方正宋简大漆、方正宋简海豚、姜浩硬笔楷书、田英章楷书 30Light、我逸清晨体 等。

如需使用，请**自行取得相应授权**，然后：

- 网页端：用界面上的「添加字体」按钮加载本地字体文件；或
- 命令行：`node puppeteer-pdf.cjs --font-file <你的字体文件> --font <显示名>`；或
- 在项目根目录创建 `puppeteer-fonts.local.json`（已加入 `.gitignore`，不会被提交）：
  ```json
  { "你的字体名": "YourFontPostScriptName" }
  ```

> `src/modules/fontManager.js` 中的 `SYSTEM_KAITI_FONTS` 数组仅用于**检测用户本机是否已安装**某些楷体（含方正楷体等），以便回退到系统字体渲染。它不下载、不嵌入、不分发任何字体文件，属于对字体名称的指示性使用。

---

## 内联的 JavaScript 库

构建产物 `dist/index.html` 由 `vite-plugin-singlefile` 将全部依赖**内联为单文件**，因此下列库均随产物分发：

| 库 | 版本 | 许可 | 用途 |
|---|---|---|---|
| [cnchar](https://github.com/theajack/cnchar) | 3.2.6 | MIT | 汉字笔画/拼音数据 |
| [cnchar-words](https://github.com/theajack/cnchar) | 3.2.6 | MIT | 组词 |
| [fflate](https://github.com/101arrowz/fflate) | 0.8.3 | MIT | gzip 解压（笔画数据） |
| [hanzi-writer](https://github.com/chanind/hanzi-writer) | 3.7.3 | MIT | 笔画笔顺动画 |
| [jsPDF](https://github.com/parallax/jsPDF) | 2.5.2 | MIT | 矢量 PDF 导出 |
| [svg2pdf.js](https://github.com/yWorks/svg2pdf.js) | 2.7.0 | MIT | SVG → PDF |
| [pinyin-pro](https://github.com/zh-lx/pinyin-pro) | 3.28.2 | MIT | 拼音标注 |
| [mammoth](https://github.com/mwilliamson/mammoth.js) | 1.12.0 | BSD-2-Clause | .docx 导入 |
| [SheetJS xlsx](https://git.sheetjs.com/sheetjs/sheetjs) | 0.18.5 | Apache-2.0 | 表格导入 |
| [lucide-static](https://github.com/lucide-icons/lucide) | 1.25.0 | ISC | 图标 |

### 另含内联副本

| 文件 | 许可 |
|---|---|
| `public/hanzi-data/fflate.min.js`（32,665 字节，独立副本） | MIT（fflate 0.8.3） |

---

## 构建/开发依赖（不随产物分发）

| 包 | 许可 |
|---|---|
| vite、@tailwindcss/vite、vite-plugin-pwa、vite-plugin-singlefile | MIT |
| workbox-*（由 vite-plugin-pwa 生成） | MIT |
| puppeteer | Apache-2.0 |

---

## 合规自查清单

- [x] `LICENSE` 存在且与 README 声明一致（MIT）
- [x] `ARPHICPL.TXT` 存在且**未被修改**（ARPHIC PUBLIC LICENSE §1 的硬性要求）
- [x] 笔画数据的来源、许可与变更情况已声明
- [x] 全部内联依赖的许可已列出
- [x] 未分发任何需要单独商业授权的字体
- [x] 未分发任何真实 API Key、个人邮箱或其它个人数据

如发现遗漏或错误，欢迎提 Issue 指出。
