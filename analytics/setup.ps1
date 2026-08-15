# ============================================================
# 字帖生成器 访问统计系统 - 一键安装脚本
# ============================================================
# 前置条件：
# 1. API Token 已更新（包含 D1、Workers、Workers Scripts 权限）
# 2. 已注册 workers.dev 子域名
# 3. 已获取 Resend API Key（可选，用于邮件发送）
#
# 用法：
#   .\setup.ps1
#   .\setup.ps1 -ResendApiKey "re_xxxxx" -CronSecret "your_secret"
# ============================================================

param(
    [string]$ResendApiKey = "",
    [string]$CronSecret = "",
    [string]$ApiToken = ""
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$CronWorkerDir = Join-Path $PSScriptRoot "cron-worker"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  字帖生成器 访问统计系统 - 安装向导" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 检查 API Token
if ([string]::IsNullOrEmpty($ApiToken)) {
    Write-Host "  [!] 请提供 CLOUDFLARE_API_TOKEN 参数" -ForegroundColor Red
    Write-Host "  用法: .\setup.ps1 -ApiToken `"cfut_xxxxx`" -ResendApiKey `"re_xxxxx`"" -ForegroundColor Yellow
    exit 1
}

# 设置 API Token
$env:CLOUDFLARE_API_TOKEN = $ApiToken

# ============================================================
# 步骤 1：验证 API Token
# ============================================================
Write-Host "[1/6] 验证 API Token..." -ForegroundColor Yellow
try {
    $headers = @{ "Authorization" = "Bearer $ApiToken"; "Content-Type" = "application/json" }
    $response = Invoke-RestMethod -Uri "https://api.cloudflare.com/client/v4/user/tokens/verify" -Headers $headers -Method GET
    if ($response.success) {
        Write-Host "  OK - Token 有效且活跃" -ForegroundColor Green
    }
} catch {
    Write-Host "  FAIL - Token 无效，请检查" -ForegroundColor Red
    exit 1
}

# 获取 Account ID
$accountsResponse = Invoke-RestMethod -Uri "https://api.cloudflare.com/client/v4/accounts" -Headers $headers -Method GET
$AccountId = $accountsResponse.result[0].id
Write-Host "  Account ID: $AccountId" -ForegroundColor Gray

# ============================================================
# 步骤 2：创建 D1 数据库
# ============================================================
Write-Host ""
Write-Host "[2/6] 创建 D1 数据库 (calligraphy-analytics-db)..." -ForegroundColor Yellow
try {
    # 检查是否已存在
    $existingDbs = Invoke-RestMethod -Uri "https://api.cloudflare.com/client/v4/accounts/$AccountId/d1/database?name=calligraphy-analytics-db" -Headers $headers -Method GET
    if ($existingDbs.result.Count -gt 0) {
        $DatabaseId = $existingDbs.result[0].uuid
        Write-Host "  OK - 数据库已存在，ID: $DatabaseId" -ForegroundColor Green
    } else {
        $body = '{"name":"calligraphy-analytics-db"}'
        $dbResponse = Invoke-RestMethod -Uri "https://api.cloudflare.com/client/v4/accounts/$AccountId/d1/database" -Headers $headers -Method POST -Body $body
        if ($dbResponse.success) {
            $DatabaseId = $dbResponse.result.uuid
            Write-Host "  OK - 数据库创建成功，ID: $DatabaseId" -ForegroundColor Green
        } else {
            throw "D1 creation failed: $($dbResponse.errors | ConvertTo-Json)"
        }
    }
} catch {
    Write-Host "  FAIL - $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "  请确保 API Token 包含 D1 Edit 权限" -ForegroundColor Red
    Write-Host "  访问: https://dash.cloudflare.com/profile/api-tokens" -ForegroundColor Yellow
    exit 1
}

# ============================================================
# 步骤 3：创建/更新 wrangler.toml（Pages Functions 绑定 D1）
# ============================================================
Write-Host ""
Write-Host "[3/6] 创建 Pages Functions 配置..." -ForegroundColor Yellow
$wranglerPath = Join-Path $ProjectRoot "wrangler.toml"
$wranglerContent = @"
# 字帖生成器 - Cloudflare Pages 配置
# 用于本地部署 Pages Functions（访问统计）
# 部署命令: npx wrangler pages deploy dist --project-name=calligraphy-sheet-generator

name = "calligraphy-sheet-generator"
compatibility_date = "2025-01-01"

[[d1_databases]]
binding = "DB"
database_name = "calligraphy-analytics-db"
database_id = "$DatabaseId"
"@
Set-Content -Path $wranglerPath -Value $wranglerContent -Encoding UTF8
Write-Host "  OK - wrangler.toml 已创建 (database_id = $DatabaseId)" -ForegroundColor Green

# ============================================================
# 步骤 4：部署 Pages Functions
# ============================================================
Write-Host ""
Write-Host "[4/6] 部署 Pages Functions（访问追踪）..." -ForegroundColor Yellow
Push-Location $ProjectRoot
try {
    npx wrangler pages deploy dist --project-name=calligraphy-sheet-generator --branch=main 2>&1 | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
    Write-Host "  OK - Pages Functions 部署成功" -ForegroundColor Green
} catch {
    Write-Host "  FAIL - $($_.Exception.Message)" -ForegroundColor Red
}
Pop-Location

# ============================================================
# 步骤 5：部署 Cron Worker
# ============================================================
Write-Host ""
Write-Host "[5/6] 部署 Cron Worker（每日报告）..." -ForegroundColor Yellow
Push-Location $CronWorkerDir
try {
    # 安装依赖
    if (-not (Test-Path "node_modules")) {
        npm install 2>&1 | Out-Null
    }

    # 部署
    npx wrangler deploy 2>&1 | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
    Write-Host "  OK - Cron Worker 部署成功" -ForegroundColor Green

    # 设置 Cron Worker 的 secrets
    if ([string]::IsNullOrEmpty($CronSecret)) {
        $CronSecret = "calligraphy_cron_secret_x8k3n5q9w2r7"
    }

    $secretBody = @{ name = "CRON_SECRET"; text = $CronSecret } | ConvertTo-Json
    try {
        Invoke-RestMethod -Uri "https://api.cloudflare.com/client/v4/accounts/$AccountId/workers/scripts/calligraphy-analytics-cron/secrets" -Headers $headers -Method PUT -Body $secretBody -ContentType "application/json" 2>&1 | Out-Null
        Write-Host "  OK - CRON_SECRET 已设置" -ForegroundColor Green
    } catch {
        Write-Host "  WARN - 需要手动设置 Cron Worker 的 CRON_SECRET" -ForegroundColor Yellow
    }

    if (-not [string]::IsNullOrEmpty($ResendApiKey)) {
        $secretBody = @{ name = "RESEND_API_KEY"; text = $ResendApiKey } | ConvertTo-Json
        try {
            Invoke-RestMethod -Uri "https://api.cloudflare.com/client/v4/accounts/$AccountId/workers/scripts/calligraphy-analytics-cron/secrets" -Headers $headers -Method PUT -Body $secretBody -ContentType "application/json" 2>&1 | Out-Null
            Write-Host "  OK - RESEND_API_KEY 已设置" -ForegroundColor Green
        } catch {
            Write-Host "  WARN - 需要手动设置 Cron Worker 的 RESEND_API_KEY" -ForegroundColor Yellow
        }
    }
} catch {
    Write-Host "  FAIL - $($_.Exception.Message)" -ForegroundColor Red
}
Pop-Location

# ============================================================
# 步骤 6：验证部署
# ============================================================
Write-Host ""
Write-Host "[6/6] 验证部署..." -ForegroundColor Yellow

# 测试健康检查端点
Start-Sleep -Seconds 3
try {
    $healthCheck = Invoke-RestMethod -Uri "https://calligraphy-sheet-generator.pages.dev/api/health" -Method GET -TimeoutSec 10
    Write-Host "  OK - 健康检查通过: $($healthCheck.status)" -ForegroundColor Green
} catch {
    Write-Host "  WARN - 健康检查失败（可能需要等待几分钟后重试）" -ForegroundColor Yellow
}

# ============================================================
# 完成
# ============================================================
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  安装完成！" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "部署信息：" -ForegroundColor White
Write-Host "  追踪地址: https://calligraphy-sheet-generator.pages.dev" -ForegroundColor White
Write-Host "  报告 API: https://calligraphy-sheet-generator.pages.dev/api/report" -ForegroundColor White
Write-Host "  统计 API: https://calligraphy-sheet-generator.pages.dev/api/stats" -ForegroundColor White
Write-Host "  Cron Worker: 每天北京时间 08:00 自动发送报告" -ForegroundColor White
Write-Host ""
if ([string]::IsNullOrEmpty($ResendApiKey)) {
    Write-Host "  [!] 尚未配置 Resend API Key，邮件发送功能未启用" -ForegroundColor Yellow
    Write-Host "      获取地址: https://resend.com" -ForegroundColor Yellow
    Write-Host "      设置命令: npx wrangler secret put RESEND_API_KEY" -ForegroundColor Yellow
    Write-Host ""
}
Write-Host "  CRON_SECRET: $CronSecret" -ForegroundColor Gray
Write-Host "  （请妥善保存此密钥，并确保与 wrangler.toml 一致）" -ForegroundColor Gray
Write-Host ""
