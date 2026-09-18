param([string]$Root = (Split-Path -Parent $PSScriptRoot))   # v3.0.5: default to the repo root, no hardcoded local path

# 纯 ASCII 脚本：不含任何非 ASCII 字符，因此在任何代码页下都能被正确解析。
# 用 PowerShell 自带 Parser 做静态语法校验，不做任何执行。

$files = Get-ChildItem -LiteralPath $Root -Filter '*.ps1' -File -Recurse -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -notmatch '\\(node_modules|backup[^\\]*|backups|_tmp_measure)\\' }

$bad = 0
foreach ($f in $files) {
    $errors = $null
    $tokens = $null
    [void][System.Management.Automation.Language.Parser]::ParseFile($f.FullName, [ref]$tokens, [ref]$errors)
    if ($errors -and $errors.Count -gt 0) {
        $bad++
        Write-Output ("FAIL  {0}" -f $f.FullName)
        foreach ($e in $errors) {
            Write-Output ("        L{0}C{1}: {2}" -f $e.Extent.StartLineNumber, $e.Extent.StartColumnNumber, $e.Message)
        }
    } else {
        $head = [System.IO.File]::ReadAllBytes($f.FullName) | Select-Object -First 3
        $bom = if ($head.Count -eq 3 -and $head[0] -eq 239 -and $head[1] -eq 187 -and $head[2] -eq 191) { 'BOM' } else { 'noBOM' }
        Write-Output ("OK    [{0}] {1}" -f $bom, $f.FullName)
    }
}

Write-Output ("---- PSVersion={0}  files={1}  parseErrors={2} ----" -f $PSVersionTable.PSVersion, $files.Count, $bad)
if ($bad -gt 0) { exit 1 }
