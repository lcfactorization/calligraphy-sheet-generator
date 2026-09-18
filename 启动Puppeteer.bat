@echo off
chcp 65001 >nul
rem ==================================================================
rem  Calligraphy Sheet Generator - Puppeteer vector PDF service
rem  Windows entry point (double-click this file).
rem
rem  ENCODING CONTRACT - do not break either side:
rem
rem   * This .bat : UTF-8 WITHOUT BOM.
rem       cmd.exe executes "chcp 65001" first and only then reads the
rem       Chinese file names below. A BOM would corrupt line 1.
rem
rem   * 启动Puppeteer.ps1 : UTF-8 WITH BOM.
rem       Windows PowerShell 5.1 decodes a BOM-less .ps1 with the ANSI
rem       code page (GBK/936 on zh-CN). A Chinese trailing byte can then
rem       pair up with the line-ending CR(0x0D) to form a "valid" GBK
rem       double-byte char, swallowing the newline and gluing two lines
rem       together, which cascades into:
rem         Unexpected token '}' in expression or statement.
rem         Missing closing ')' in expression.
rem         The string is missing the terminator: ".
rem       Full post-mortem: see the header of 启动Puppeteer.ps1.
rem
rem  NOTE: everything above runs before "chcp" takes effect, so keep it
rem  ASCII. Everything below runs under code page 65001 (UTF-8).
rem ==================================================================

title 字帖生成器 - Puppeteer 矢量PDF服务

rem --- Pre-flight: launcher must exist and must carry a UTF-8 BOM ---
powershell -NoProfile -ExecutionPolicy Bypass -Command "$p='%~dp0启动Puppeteer.ps1'; if(-not (Test-Path -LiteralPath $p)){exit 3}; $b=[System.IO.File]::ReadAllBytes($p); if($b.Length -lt 3 -or $b[0] -ne 239 -or $b[1] -ne 187 -or $b[2] -ne 191){exit 4}; exit 0"
set "PRE=%ERRORLEVEL%"
if "%PRE%"=="3" (
    echo [X] 找不到启动脚本: 启动Puppeteer.ps1
    echo     请确认它与本 .bat 位于同一目录。
    pause
    exit /b 3
)
if "%PRE%"=="4" (
    echo [X] 启动Puppeteer.ps1 丢失了 UTF-8 BOM，PowerShell 5.1 无法解析它。
    echo     修复命令，在本目录执行:
    echo         python tools\ensure_ps1_bom.py "启动Puppeteer.ps1"
    echo     或直接重新解压/重新检出该文件。
    pause
    exit /b 4
)
if not "%PRE%"=="0" (
    echo [X] 预检未通过，退出码 %PRE%，请确认 PowerShell 可用。
    pause
    exit /b %PRE%
)

rem --- Launch ------------------------------------------------------
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0启动Puppeteer.ps1"
set "RC=%ERRORLEVEL%"
if not "%RC%"=="0" (
    echo.
    echo [启动器] PowerShell 退出码 %RC%，请查看上方输出。
    pause
)
