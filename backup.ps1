# 字帖生成器项目备份脚本
# 用途：在重大修改前创建完整备份（zip + git tag）
# 使用：右键 → 使用 PowerShell 运行，或在终端执行 .\backup.ps1

param(
    [string]$BackupName = "",
    [string]$ProjectDir = "C:\poem2pdf\distribution"
)

$ErrorActionPreference = "Stop"
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"

if ($BackupName -eq "") {
    $BackupName = "pre_vite_refactor"
}

$backupDir = "C:\poem2pdf\backups"
$zipName = "distribution_${BackupName}_${timestamp}.zip"
$zipPath = Join-Path $backupDir $zipName

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  字帖生成器项目备份脚本" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "项目目录: $ProjectDir"
Write-Host "备份名称: $BackupName"
Write-Host "时间戳:   $timestamp"
Write-Host ""

# 1. 检查项目目录
if (-not (Test-Path $ProjectDir)) {
    Write-Host "[错误] 项目目录不存在: $ProjectDir" -ForegroundColor Red
    exit 1
}

# 2. 创建备份目录
if (-not (Test-Path $backupDir)) {
    New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
    Write-Host "[1/5] 创建备份目录: $backupDir" -ForegroundColor Green
} else {
    Write-Host "[1/5] 备份目录已存在: $backupDir" -ForegroundColor Green
}

# 3. 统计项目文件
$projectFiles = Get-ChildItem $ProjectDir -Recurse -File | Where-Object {
    $_.FullName -notmatch '\\node_modules\\|\\\.git\\|\\dist\\'
}
$totalSize = [math]::Round(($projectFiles | Measure-Object -Property Length -Sum).Sum / 1MB, 1)
Write-Host "[2/5] 项目文件统计: $($projectFiles.Count) 个文件, ${totalSize} MB" -ForegroundColor Green

# 4. 创建 Zip 备份
Write-Host "[3/5] 正在创建 Zip 备份..." -ForegroundColor Yellow
$tempZip = Join-Path $env:TEMP $zipName

# 使用 Compress-Archive，排除 node_modules/.git/dist
$sourcePaths = Get-ChildItem $ProjectDir -Exclude "node_modules", ".git", "dist" | Select-Object -ExpandProperty FullName
Compress-Archive -Path $sourcePaths -DestinationPath $tempZip -Force

# 移动到备份目录
Move-Item -Path $tempZip -Destination $zipPath -Force

if (Test-Path $zipPath) {
    $zipSize = [math]::Round((Get-Item $zipPath).Length / 1MB, 1)
    Write-Host "  ✅ Zip备份完成: $zipPath (${zipSize} MB)" -ForegroundColor Green
} else {
    Write-Host "  ❌ Zip备份失败" -ForegroundColor Red
    exit 1
}

# 5. Git 备份（如果可用）
Write-Host "[4/5] Git 备份..." -ForegroundColor Yellow
$gitDir = Join-Path $ProjectDir ".git"
if (Test-Path $gitDir) {
    Push-Location $ProjectDir
    
    # 检查是否有未提交的更改
    $status = git status --porcelain 2>&1
    if ($status) {
        Write-Host "  发现未提交的更改，正在提交..." -ForegroundColor Yellow
        git add -A
        git commit -m "backup: ${BackupName} (${timestamp})" 2>&1 | Out-Null
    }
    
    # 创建 git tag
    $tagName = "backup/${BackupName}/${timestamp}"
    git tag $tagName 2>&1 | Out-Null
    Write-Host "  ✅ Git Tag 已创建: $tagName" -ForegroundColor Green
    
    # 显示当前状态
    $currentBranch = git branch --show-current
    $commitHash = git rev-parse --short HEAD
    Write-Host "  当前分支: $currentBranch" -ForegroundColor Green
    Write-Host "  当前提交: $commitHash" -ForegroundColor Green
    
    # 列出所有备份 tag
    $tags = git tag -l "backup/*" | Sort-Object -Descending | Select-Object -First 5
    if ($tags) {
        Write-Host ""
        Write-Host "  最近备份标签:" -ForegroundColor DarkGray
        $tags | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
    }
    
    Pop-Location
} else {
    Write-Host "  ⚠️ Git 仓库不存在，跳过 Git 备份" -ForegroundColor Yellow
}

# 6. 验证备份
Write-Host "[5/5] 验证备份..." -ForegroundColor Yellow
if (Test-Path $zipPath) {
    $verifySize = (Get-Item $zipPath).Length
    if ($verifySize -gt 0) {
        Write-Host "  ✅ Zip 文件验证通过 (${zipSize} MB)" -ForegroundColor Green
    } else {
        Write-Host "  ❌ Zip 文件为空" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "  ❌ Zip 文件不存在" -ForegroundColor Red
    exit 1
}

# 7. 生成备份信息文件
$infoFile = Join-Path $backupDir "last_backup_info.txt"
$backupInfo = @"
备份时间: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
备份名称: $BackupName
Zip文件: $zipPath
Zip大小: ${zipSize} MB
项目文件数: $($projectFiles.Count)
项目总大小: ${totalSize} MB
Git标签: $tagName
"@
Set-Content -Path $infoFile -Value $backupInfo -Encoding UTF8

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  备份完成!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "备份文件: $zipPath" -ForegroundColor White
Write-Host "备份信息: $infoFile" -ForegroundColor White
Write-Host ""
Write-Host "恢复方法:" -ForegroundColor Yellow
Write-Host "  1. Zip恢复: 解压 $zipName 到项目目录" -ForegroundColor White
Write-Host "  2. Git恢复: git checkout $tagName" -ForegroundColor White
Write-Host ""

# 8. 清理旧备份（保留最近10个）
$oldBackups = Get-ChildItem $backupDir -Filter "distribution_*.zip" | Sort-Object CreationTime -Descending
if ($oldBackups.Count -gt 10) {
    Write-Host "清理旧备份（保留最近10个）..." -ForegroundColor Yellow
    $oldBackups | Select-Object -Skip 10 | ForEach-Object {
        Remove-Item $_.FullName -Force
        Write-Host "  已删除: $($_.Name)" -ForegroundColor DarkGray
    }
}
