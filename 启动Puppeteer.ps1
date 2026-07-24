$ErrorActionPreference = 'Stop'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Port = 3210
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$global:PSDefaultParameterValues = @{ 'Invoke-WebRequest:UseBasicParsing' = $true }
$global:ProgressPreference = 'SilentlyContinue'

Write-Host '═══════════════════════════════════════════════════' -ForegroundColor Cyan
Write-Host '  字帖生成器 - Puppeteer 矢量PDF服务' -ForegroundColor Cyan
Write-Host '═══════════════════════════════════════════════════' -ForegroundColor Cyan
Write-Host ''

# 1. Check Node.js
Write-Host '[1/4] 检查 Node.js...' -ForegroundColor Yellow
try { $v = node -v 2>$null; if ($LASTEXITCODE -ne 0) { throw 'nf' } ; Write-Host "      Node.js $v" -ForegroundColor Green }
catch { Write-Host '[X] 未找到 Node.js，请安装: https://nodejs.org/' -ForegroundColor Red; Read-Host '回车退出'; exit 1 }

# 2. Check dist/index.html, build if missing
Write-Host '[2/4] 检查构建产物...' -ForegroundColor Yellow
$distHtml = Join-Path $ScriptDir 'dist\index.html'
if (-not (Test-Path $distHtml)) {
    Write-Host '      正在构建项目...' -ForegroundColor Yellow
    Push-Location $ScriptDir
    & npm run build 2>&1 | Where-Object { $_ -notmatch '^\s*$' } | ForEach-Object { Write-Host "      $_" -ForegroundColor DarkGray }
    Pop-Location
    if (-not (Test-Path $distHtml)) { Write-Host '[X] 构建失败' -ForegroundColor Red; Read-Host '回车退出'; exit 1 }
}
Write-Host '      构建产物就绪' -ForegroundColor Green

# 3. Check Puppeteer
Write-Host '[3/4] 检查 Puppeteer...' -ForegroundColor Yellow
$pupDir = Join-Path $ScriptDir 'node_modules\puppeteer'
if (-not (Test-Path $pupDir)) {
    Write-Host '      安装 Puppeteer...' -ForegroundColor Yellow
    Push-Location $ScriptDir
    & npm install puppeteer --no-fund --no-audit 2>&1 | Out-Null
    Pop-Location
}
if (Test-Path $pupDir) { Write-Host '      Puppeteer 就绪' -ForegroundColor Green }
else { Write-Host '[X] Puppeteer 安装失败，请手动: npm install puppeteer' -ForegroundColor Red; Read-Host '回车退出'; exit 1 }

# 4. v2.4.12：端口占用检查 — 检查 3210 是否被占用，让用户选择是否关闭原进程
Write-Host '[4/4] 检查端口占用...' -ForegroundColor Yellow
$connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($connections) {
    $procId = $connections[0].OwningProcess
    $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
    Write-Host ''
    Write-Host '═══════════════════════════════════════════════════' -ForegroundColor Red
    Write-Host "  [警告] 端口 $Port 已被占用！" -ForegroundColor Red
    if ($proc) {
        Write-Host "  占用进程: $($proc.ProcessName) (PID: $procId)" -ForegroundColor Yellow
    } else {
        Write-Host "  占用进程 PID: $procId (进程信息不可用)" -ForegroundColor Yellow
    }
    Write-Host '═══════════════════════════════════════════════════' -ForegroundColor Red
    Write-Host ''
    $choice = Read-Host "是否关闭占用进程并继续启动？(Y=关闭并继续 / N=退出)"
    if ($choice -eq 'Y' -or $choice -eq 'y') {
        try {
            Stop-Process -Id $procId -Force -ErrorAction Stop
            Write-Host "      已关闭进程 $procId，等待端口释放..." -ForegroundColor Green
            Start-Sleep -Seconds 2
        } catch {
            Write-Host "      [错误] 无法关闭进程: $_" -ForegroundColor Red
            Read-Host '回车退出'
            exit 1
        }
    } else {
        Write-Host '  用户取消，退出脚本。' -ForegroundColor Yellow
        exit 0
    }
} else {
    Write-Host "      端口 $Port 可用" -ForegroundColor Green
}

Write-Host ''
Write-Host '服务启动中... 浏览器将自动打开' -ForegroundColor Green
Write-Host '按 Ctrl+C 退出' -ForegroundColor DarkGray
Write-Host ''

$env:NODE_PATH = "$(Join-Path $ScriptDir 'node_modules');$(Join-Path $ScriptDir '..\node_modules')"
# v2.4.11：服务退出后暂停，防止闪退看不到错误信息
try {
    & node (Join-Path $ScriptDir 'puppeteer-server.cjs')
} catch {
    Write-Host ''
    Write-Host "[错误] 服务异常退出: $_" -ForegroundColor Red
}
Write-Host ''
Write-Host '服务已停止，按任意键退出...' -ForegroundColor Yellow
$null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
