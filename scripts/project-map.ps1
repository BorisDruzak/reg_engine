[CmdletBinding()]
param(
    [switch]$Check
)

. "$PSScriptRoot\lib\RegEngine.ps1"

$config = Get-RegEngineConfig
$outputPath = Join-Path $config.RepoRoot "docs\PROJECT_TREE.md"
$branch = (Invoke-RegEngineCapture -FilePath "git" -Arguments @("branch", "--show-current") -WorkingDirectory $config.RepoRoot).Text.Trim()
$timestamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss zzz")
$files = Invoke-RegEngineCapture -FilePath "git" -Arguments @("ls-files") -WorkingDirectory $config.RepoRoot
$others = Invoke-RegEngineCapture -FilePath "git" -Arguments @("ls-files", "--others", "--exclude-standard") -WorkingDirectory $config.RepoRoot
$allFiles = @($files.Output + $others.Output) |
    Where-Object { $_ -and (Test-Path -LiteralPath (Join-Path $config.RepoRoot $_)) } |
    Sort-Object -Unique

$content = @()
$content += "# Project Tree"
$content += ""
$content += "- Generated: $timestamp"
$content += "- Branch: $branch"
$content += ""
$content += "## Entrypoints"
$content += ""
$content += '- Backend app: `backend/app/main.py`'
$content += '- Frontend app: `frontend/src/main.tsx`'
$content += '- Local checks: `scripts/check.ps1`'
$content += '- Server checks: `scripts/server-check.ps1`'
$content += ""
$content += "## Available Commands"
$content += ""
$content += '- `powershell -ExecutionPolicy Bypass -File scripts/check.ps1`'
$content += '- `powershell -ExecutionPolicy Bypass -File scripts/test.ps1`'
$content += '- `powershell -ExecutionPolicy Bypass -File scripts/lint.ps1`'
$content += '- `powershell -ExecutionPolicy Bypass -File scripts/format.ps1 -Check`'
$content += '- `powershell -ExecutionPolicy Bypass -File scripts/typecheck.ps1`'
$content += ""
$content += "## Files"
$content += ""
foreach ($file in $allFiles) {
    $content += "- ``$file``"
}
$content += ""
$content += "## Ignored Or Generated"
$content += ""
$content += '- `.git/`, `.venv/`, `node_modules/`, `dist/`, `coverage/`, `htmlcov/`, `logs/`, `artifacts/`, `uploads/`, `storage/`'

$newText = ($content -join [Environment]::NewLine) + [Environment]::NewLine

if ($Check) {
    if (-not (Test-Path -LiteralPath $outputPath)) {
        throw "docs/PROJECT_TREE.md does not exist. Run scripts/project-map.ps1."
    }
    $existing = Get-Content -LiteralPath $outputPath -Raw
    $normalizedExisting = ($existing -replace "- Generated: .+", "- Generated: <ignored>").TrimEnd()
    $normalizedNew = ($newText -replace "- Generated: .+", "- Generated: <ignored>").TrimEnd()
    if ($normalizedExisting -ne $normalizedNew) {
        throw "docs/PROJECT_TREE.md is stale. Run scripts/project-map.ps1."
    }
    Write-Host "Project tree is current."
    return
}

[System.IO.File]::WriteAllText($outputPath, $newText, [System.Text.UTF8Encoding]::new($false))
Write-Host "Updated docs/PROJECT_TREE.md"
