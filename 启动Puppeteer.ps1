# ═══════════════════════════════════════════════════════════════
# 字帖生成器 - 矢量PDF工具 (PowerShell 启动脚本)
# 功能：自动检查环境 → 启动本地服务 → 打开浏览器 → 一键生成矢量PDF
# ═══════════════════════════════════════════════════════════════

$ErrorActionPreference = 'Stop'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$HtmlFile = Join-Path $ScriptDir '字帖生成器.html'
$Port = 3210

# 设置控制台编码为 UTF-8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

# 消除 Invoke-WebRequest 的 IE 引擎安全警告（"分析页面时可能会运行网页中的脚本代码"）
# 使用 -UseBasicParsing 避免 IE 引擎初始化，同时提升性能
$global:PSDefaultParameterValues = @{
    'Invoke-WebRequest:UseBasicParsing' = $true
    'Invoke-RestMethod:UseBasicParsing' = $true
}
# 禁用进度流，避免某些环境下的安全提示
$global:ProgressPreference = 'SilentlyContinue'

function Write-Title {
    param([string]$Text)
    Write-Host ('=' * 60) -ForegroundColor Cyan
    Write-Host $Text -ForegroundColor Cyan
    Write-Host ('=' * 60) -ForegroundColor Cyan
}

function Write-Step {
    param([string]$Step, [string]$Message, [string]$Status = '')
    $line = "[$Step] $Message"
    if ($Status) { $line += "  $Status" }
    Write-Host $line
}

function Write-Ok { Write-Host '  [OK]' -ForegroundColor Green }
function Write-Err { Write-Host '  [X]' -ForegroundColor Red }

Write-Title '字帖生成器 - 矢量PDF工具 (Windows)'
Write-Host ''
Write-Host '功能：在浏览器中一键生成可复制文字的矢量PDF字帖'
Write-Host '特点：字体完整嵌入，Adobe Reader 可直接选择/复制文字'
Write-Host ''

# ───────── 步骤1：检查 Node.js ─────────
Write-Host '[1/4] 检查 Node.js 运行环境...' -ForegroundColor Yellow
try {
    $nodeVersion = (node -v 2>$null)
    if ($LASTEXITCODE -ne 0) { throw 'not found' }
    Write-Host "      Node.js 版本: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host ''
    Write-Host '[X] 未找到 Node.js！' -ForegroundColor Red
    Write-Host ''
    Write-Host '    请先安装 Node.js (v18 或以上版本)：'
    Write-Host '    下载地址: https://nodejs.org/zh-cn/'
    Write-Host '    安装时请勾选 "Add to PATH" 选项'
    Write-Host ''
    Write-Host '    安装完成后，请重新运行本脚本。'
    Read-Host '按回车键退出'
    exit 1
}

# ───────── 步骤2：检查 HTML 文件 ─────────
Write-Host '[2/4] 检查字帖生成器文件...' -ForegroundColor Yellow
if (-not (Test-Path $HtmlFile)) {
    Write-Host ''
    Write-Host "[X] 找不到核心文件: $HtmlFile" -ForegroundColor Red
    Write-Host '    请确保本脚本与字帖生成器.html 在同一文件夹中。'
    Read-Host '按回车键退出'
    exit 1
}
Write-Host '      文件检查通过' -ForegroundColor Green

# ───────── 步骤3：检查/安装 Puppeteer ─────────
Write-Host '[3/4] 检查 Puppeteer 模块...' -ForegroundColor Yellow
$puppeteerDir = Join-Path $ScriptDir 'node_modules\puppeteer'
$puppeteerParentDir = Join-Path $ScriptDir '..\node_modules\puppeteer'

if ((Test-Path $puppeteerDir) -or (Test-Path $puppeteerParentDir)) {
    Write-Host '      Puppeteer 已就绪' -ForegroundColor Green
} else {
    Write-Host '      首次运行，正在自动安装 Puppeteer (约200MB，请耐心等待)...' -ForegroundColor Yellow
    Write-Host '      如果长时间无响应，可手动运行: npm install puppeteer' -ForegroundColor DarkGray
    Write-Host ''
    Push-Location $ScriptDir
    try {
        & npm install puppeteer --no-fund --no-audit 2>&1 | Where-Object {
            $_ -notmatch 'npm warn' -and $_ -notmatch '^\s*$'
        } | ForEach-Object { Write-Host "      $_" -ForegroundColor DarkGray }
        if ($LASTEXITCODE -ne 0) { throw "npm install failed with code $LASTEXITCODE" }
        if (-not (Test-Path $puppeteerDir)) { throw 'puppeteer module not found after install' }
        Write-Host '      Puppeteer 安装完成' -ForegroundColor Green
    } catch {
        Pop-Location
        Write-Host ''
        Write-Host "[X] Puppeteer 安装失败: $_" -ForegroundColor Red
        Write-Host '    请手动运行以下命令：'
        Write-Host "      cd `"$ScriptDir`""
        Write-Host '      npm install puppeteer'
        Read-Host '按回车键退出'
        exit 1
    }
    Pop-Location
}

# ───────── 步骤4：提取服务器代码并启动 ─────────
Write-Host '[4/4] 正在启动服务...' -ForegroundColor Yellow
$tempDir = Join-Path $env:TEMP "puppeteer-pdf-$(Get-Random)"
$tempJs = Join-Path $tempDir 'server.js'
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

# 从 HTML 中提取服务器代码
$htmlContent = Get-Content -Raw -Encoding UTF8 $HtmlFile
$match = [regex]::Match($htmlContent, '// PUPPETEER_SERVER_BEGIN([\s\S]*?)// PUPPETEER_SERVER_END')
if (-not $match.Success) {
    Write-Host '[X] 未能从HTML中提取服务器代码' -ForegroundColor Red
    Read-Host '按回车键退出'
    exit 1
}
$serverCode = $match.Groups[1].Value
[IO.File]::WriteAllText($tempJs, $serverCode, [Text.UTF8Encoding]::new($false))

# 设置环境变量
$env:PUPPETEER_HTML_DIR = $ScriptDir
$env:NODE_PATH = "$(Join-Path $ScriptDir 'node_modules');$(Join-Path $ScriptDir '..\node_modules')"

Write-Host ''
Write-Title '使用说明（很简单）'
Write-Host ''
Write-Host '  1. 浏览器已自动打开字帖生成器页面'
Write-Host '  2. 在页面输入框中输入要练习的汉字'
Write-Host '  3. 选择喜欢的字体'
Write-Host '  4. 点击页面右上角的紫色「生成矢量PDF」按钮'
Write-Host '  5. PDF 会自动下载到浏览器默认下载文件夹'
Write-Host ''
Write-Host '生成的 PDF 特点：'
Write-Host '  - 矢量图形，放大不失真'
Write-Host '  - 汉字和拼音字体完整嵌入'
Write-Host '  - 可在 Adobe Reader 中直接选择、复制、搜索文字'
Write-Host ''
Write-Host '关闭本窗口可退出服务（或按 Ctrl+C）' -ForegroundColor DarkGray
Write-Host ''

# 启动服务器
try {
    & node $tempJs
} finally {
    # 清理临时文件
    if (Test-Path $tempDir) {
        Remove-Item -Recurse -Force $tempDir -ErrorAction SilentlyContinue
    }
    Write-Host ''
    Write-Host '服务已停止。感谢使用！'
}
