# 字帖生成器 — Vite工程化 + PWA离线 + Puppeteer PDF 矢量生成

> TRAE AI 创造力大赛复赛作品 | 双轨方案：浏览器直接打印（全平台） + Puppeteer 命令行批量生成（桌面端）
> 在线体验：https://lcfactorization.github.io/calligraphy-sheet-generator/

## 目录结构

```
distribution/
├── index.html               ← Vite入口HTML
├── vite.config.js           ← Vite配置（PWA + SingleFile + Tailwind）
├── package.json             ← 依赖配置（ES Module）
├── puppeteer-pdf.cjs        ← Puppeteer PDF矢量生成脚本（CommonJS）
├── README.md / CHANGELOG.md ← 文档
├── .github/workflows/       ← GitHub Pages自动部署
├── src/
│   ├── main.js              ← 入口：CSS导入 + 模块导入 + 事件绑定
│   ├── styles/              ← CSS模块（7个 + tailwind.css）
│   ├── data/customZuCi.js   ← 1719条自定义组词字典
│   └── modules/             ← JS模块（10个）
│       ├── fontManager.js   ← FontFace加载 + base64拼音字体
│       ├── pinyin.js        ← pinyin-pro封装
│       ├── zuci.js          ← 组词（customZuCi + cnchar）
│       ├── strokes.js       ← 笔画SVG + HanziWriter
│       ├── gridRenderer.js  ← 字帖生成核心
│       ├── settings.js      ← 主题/计数器/页眉页脚
│       ├── pdfExport.js     ← PDF导出
│       └── puppeteerClient.js
├── public/
│   ├── fonts/               ← 6个开源字体
│   │   ├── LXGWWenKai-Regular.ttf   ← 霞鹜文楷（SIL OFL）
│   │   ├── LXGWWenKai-Light.ttf     ← 霞鹜文楷 Light（SIL OFL）
│   │   ├── SourceHanSerifSC-Regular.otf ← 思源宋体（SIL OFL）
│   │   ├── TW-Kai.ttf               ← 文鼎楷体（ARPH）
│   │   ├── texgyreadventor-regular.otf ← 拼音字体（GUST）
│   │   └── 我逸清晨体楷书.ttf        ← 我逸清晨体（免费商用）
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
| `--font` | `-f` | 汉字字体名称 | 霞鹜文楷 |
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
| 霞鹜文楷（默认） | LXGWWenKai | SIL OFL 1.1 |
| 霞鹜文楷 Light | LXGWWenKaiLight | SIL OFL 1.1 |
| 思源宋体 | SourceHanSerifSC | SIL OFL 1.1 |
| 文鼎楷体 | TW-Kai | ARPH 公共许可证 |
| TeX Gyre Adventor（拼音字体） | TeXGyreAdventor | GUST 字体许可证 |
| 我逸清晨体楷书 | WoYiQingChenTiKaiShu | 免费商用 |

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
