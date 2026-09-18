#Requires -Version 5.1
<#
=====================================================================
 字帖生成器 - Puppeteer 矢量PDF服务  启动器（Windows）
=====================================================================

 【编码约束 · 请勿违反】
 本文件必须以「UTF-8 带 BOM（EF BB BF）」保存。

 2026-09-18 修复记录：
   此前本文件保存为「UTF-8 无 BOM」，PowerShell 5.1 会用系统 ANSI
   代码页（中文 Windows 为 GBK/936）解码 .ps1 源码，中文注释与字符串
   被按 GBK 重新拆字节。危险点在于：某个 UTF-8 尾字节（例如「息」的
   0xAF）会与行尾的 CR(0x0D) 拼成一个"合法"的 GBK 双字节字符，于是
   换行被吞掉，相邻两行被粘成一行，连锁引发：

     Unexpected token '}' in expression or statement.
     Missing closing ')' in expression.
     The string is missing the terminator: ".

   修复方式：加 UTF-8 BOM，让 PowerShell 5.1 与 7.x 都能正确识别编码。
   若用会剥离 BOM 的编辑器重新保存本文件，故障会复现。校验命令：
     Get-Content .\启动Puppeteer.ps1 -Encoding Byte -TotalCount 3
   应输出 239 187 191。
=====================================================================
#>

$ErrorActionPreference = 'Stop'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Port = 3210

# 输出编码：配合 .bat 里的 chcp 65001，保证中文不出现乱码
try {
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    $OutputEncoding = [System.Text.Encoding]::UTF8
} catch { }

$global:PSDefaultParameterValues = @{ 'Invoke-WebRequest:UseBasicParsing' = $true }
$global:ProgressPreference = 'SilentlyContinue'

# ---------------------------------------------------------------
# 工具函数
# ---------------------------------------------------------------

# 收尾等待：交互式终端优先「按任意键」，无控制台时（输出被重定向、或宿主
# 是 IDE / CI）逐级降级，保证收尾提示永远不会让脚本以异常告终。
# 设 CALLA_NO_PAUSE=1 可整体跳过等待，便于自动化/CI 调用。
function Wait-KeyPress {
    if ($env:CALLA_NO_PAUSE -eq '1') { return }
    try { $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown'); return } catch { }
    try { [void](Read-Host '按回车退出'); return } catch { }
    Start-Sleep -Seconds 3
}

function Exit-WithPause {
    param([int]$Code = 0)
    Write-Host ''
    Wait-KeyPress
    exit $Code
}

# 捕获式执行：拿到退出码 + 完整输出（用于输出量可控、且只在失败时才需要
# 展示的命令，例如 node -v / npm install）。
#
# 两个 PowerShell 5.1 的坑必须绕开：
#   1) $ErrorActionPreference='Stop' 并**不会**让非零退出的原生命令抛异常，
#      必须显式读 $LASTEXITCODE，否则失败会被静默吞掉。
#   2) `2>&1` 会把原生命令的 stderr 包成 ErrorRecord，在 Stop 策略下会误
#      触发终止，故临时降级为 Continue，跑完还原。
function Invoke-Capture {
    param(
        [Parameter(Mandatory = $true)][string]$Exe,
        [string[]]$Arguments = @()
    )
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $raw = & $Exe @Arguments 2>&1
        $code = $LASTEXITCODE
        if ($null -eq $code) { $code = 0 }
        return [pscustomobject]@{
            Code     = [int]$code
            NotFound = $false
            Lines    = @($raw | ForEach-Object { [string]$_ })
        }
    } catch [System.Management.Automation.CommandNotFoundException] {
        return [pscustomobject]@{
            Code     = -1
            NotFound = $true
            Lines    = @("$($_.Exception.Message)")
        }
    } catch {
        return [pscustomobject]@{
            Code     = -1
            NotFound = $false
            Lines    = @("$($_.Exception.Message)")
        }
    } finally {
        $ErrorActionPreference = $prevEap
    }
}

# 流式执行：stdout 实时显示（构建进度 / 服务日志不能缓冲到最后才吐），
# stderr 直接透传到控制台。同样显式返回退出码。
function Invoke-Live {
    param(
        [Parameter(Mandatory = $true)][string]$Exe,
        [string[]]$Arguments = @(),
        [switch]$Indent
    )
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        if ($Indent) {
            & $Exe @Arguments | Where-Object { "$_".Trim() -ne '' } | ForEach-Object {
                Write-Host "      $_" -ForegroundColor DarkGray
            }
        } else {
            # 必须经 Write-Host 送到宿主：直接 `& $Exe ...` 会把子进程输出
            # 混进本函数的返回值，导致退出码被输出内容污染成数组。
            & $Exe @Arguments | ForEach-Object { Write-Host $_ }
        }
        $code = $LASTEXITCODE
        if ($null -eq $code) { $code = 0 }
        return [int]$code
    } catch {
        Write-Host "      $($_.Exception.Message)" -ForegroundColor DarkGray
        return -1
    } finally {
        $ErrorActionPreference = $prevEap
    }
}

# ---------------------------------------------------------------

Write-Host '═══════════════════════════════════════════════════' -ForegroundColor Cyan
Write-Host '  字帖生成器 - Puppeteer 矢量PDF服务' -ForegroundColor Cyan
Write-Host '═══════════════════════════════════════════════════' -ForegroundColor Cyan
Write-Host ''

# 1. 检查 Node.js
# 不用 Get-Command 做前置判断：命令解析与「能否真正执行」是两件事，直接跑
# 一次 `node -v` 才能同时覆盖「没装」和「装了但坏了」两种情况。
Write-Host '[1/4] 检查 Node.js...' -ForegroundColor Yellow
$nodeProbe = Invoke-Capture -Exe 'node' -Arguments @('-v')
if ($nodeProbe.NotFound) {
    Write-Host '[X] 未找到 Node.js，请安装: https://nodejs.org/' -ForegroundColor Red
    Exit-WithPause 1
}
if ($nodeProbe.Code -ne 0) {
    Write-Host '[X] Node.js 存在但无法执行，请重新安装: https://nodejs.org/' -ForegroundColor Red
    $nodeProbe.Lines | Where-Object { $_.Trim() -ne '' } | ForEach-Object { Write-Host "      $_" -ForegroundColor DarkGray }
    Exit-WithPause 1
}
Write-Host "      Node.js $($nodeProbe.Lines -join ' ')" -ForegroundColor Green

# 2. 检查构建产物，缺失则构建
Write-Host '[2/4] 检查构建产物...' -ForegroundColor Yellow
$distHtml = Join-Path $ScriptDir 'dist\index.html'
if (-not (Test-Path -LiteralPath $distHtml)) {
    Write-Host '      未找到 dist\index.html，正在构建项目...' -ForegroundColor Yellow
    Push-Location -LiteralPath $ScriptDir
    try {
        $buildCode = Invoke-Live -Exe 'npm' -Arguments @('run', 'build') -Indent
    } finally {
        Pop-Location
    }
    if ($buildCode -ne 0 -or -not (Test-Path -LiteralPath $distHtml)) {
        Write-Host '[X] 构建失败' -ForegroundColor Red
        Exit-WithPause 1
    }
}
Write-Host '      构建产物就绪' -ForegroundColor Green

# 3. 检查 Puppeteer
Write-Host '[3/4] 检查 Puppeteer...' -ForegroundColor Yellow
$pupDir = Join-Path $ScriptDir 'node_modules\puppeteer'
if (-not (Test-Path -LiteralPath $pupDir)) {
    Write-Host '      安装 Puppeteer...' -ForegroundColor Yellow
    Push-Location -LiteralPath $ScriptDir
    try {
        $install = Invoke-Capture -Exe 'npm' -Arguments @('install', 'puppeteer', '--no-fund', '--no-audit')
    } finally {
        Pop-Location
    }
    if ($install.Code -ne 0) {
        $install.Lines | Where-Object { $_.Trim() -ne '' } | Select-Object -Last 15 | ForEach-Object {
            Write-Host "      $_" -ForegroundColor DarkGray
        }
    }
}
if (Test-Path -LiteralPath $pupDir) {
    Write-Host '      Puppeteer 就绪' -ForegroundColor Green
} else {
    Write-Host '[X] Puppeteer 安装失败，请手动执行: npm install puppeteer' -ForegroundColor Red
    Exit-WithPause 1
}

# 4. 端口占用检查 — 占用时让用户选择是否关闭原进程
Write-Host '[4/4] 检查端口占用...' -ForegroundColor Yellow
$occupiedPid = 0
if (Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue) {
    $conns = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
    if ($conns.Count -gt 0 -and $conns[0].OwningProcess) {
        $occupiedPid = [int]$conns[0].OwningProcess
    }
} else {
    # 回退：模块不可用时用一次绑定试探判断占用（与系统语言无关）
    $listener = $null
    try {
        $listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $Port)
        $listener.Start()
    } catch {
        $occupiedPid = -1   # 已占用，但拿不到 PID
    } finally {
        if ($listener) { try { $listener.Stop() } catch { } }
    }
}

if ($occupiedPid -ne 0) {
    $proc = if ($occupiedPid -gt 0) { Get-Process -Id $occupiedPid -ErrorAction SilentlyContinue } else { $null }
    Write-Host ''
    Write-Host '═══════════════════════════════════════════════════' -ForegroundColor Red
    Write-Host "  [警告] 端口 $Port 已被占用！" -ForegroundColor Red
    if ($proc) {
        Write-Host "  占用进程: $($proc.ProcessName) (PID: $occupiedPid)" -ForegroundColor Yellow
    } elseif ($occupiedPid -gt 0) {
        Write-Host "  占用进程 PID: $occupiedPid (进程信息不可用)" -ForegroundColor Yellow
    } else {
        Write-Host '  占用进程: 无法获取 PID（可能属于其他用户）' -ForegroundColor Yellow
    }
    Write-Host '═══════════════════════════════════════════════════' -ForegroundColor Red
    Write-Host ''

    if ($occupiedPid -lt 0) {
        Write-Host "  请手动关闭占用 $Port 的进程后重试。" -ForegroundColor Yellow
        Exit-WithPause 1
    }

    # 无控制台时 Read-Host 会抛异常 —— 视为「用户取消」，这是最安全的方向
    $choice = ''
    try { $choice = Read-Host '是否关闭占用进程并继续启动？(Y=关闭并继续 / N=退出)' } catch { $choice = '' }
    if ($choice -match '^[Yy]') {
        try {
            Stop-Process -Id $occupiedPid -Force -ErrorAction Stop
            Write-Host "      已关闭进程 $occupiedPid，等待端口释放..." -ForegroundColor Green
            Start-Sleep -Seconds 2
        } catch {
            Write-Host "      [错误] 无法关闭进程: $($_.Exception.Message)" -ForegroundColor Red
            Exit-WithPause 1
        }
    } else {
        Write-Host '  用户取消，退出脚本。' -ForegroundColor Yellow
        exit 0
    }
} else {
    Write-Host "      端口 $Port 可用" -ForegroundColor Green
}

# 5. 启动服务
$serverScript = Join-Path $ScriptDir 'puppeteer-server.cjs'
if (-not (Test-Path -LiteralPath $serverScript)) {
    Write-Host "[X] 未找到服务脚本: $serverScript" -ForegroundColor Red
    Exit-WithPause 1
}

Write-Host ''
Write-Host '服务启动中... 浏览器将自动打开' -ForegroundColor Green
Write-Host '按 Ctrl+C 退出' -ForegroundColor DarkGray
Write-Host ''

$env:NODE_PATH = "$(Join-Path $ScriptDir 'node_modules');$(Join-Path $ScriptDir '..\node_modules')"

# 服务退出后暂停，防止闪退看不到错误信息
$serverCode = Invoke-Live -Exe 'node' -Arguments @($serverScript)
if ($serverCode -ne 0) {
    Write-Host ''
    Write-Host "[错误] 服务异常退出，退出码: $serverCode" -ForegroundColor Red
}
Write-Host ''
Write-Host '服务已停止，按任意键退出...' -ForegroundColor Yellow
Wait-KeyPress
