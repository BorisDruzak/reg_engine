[CmdletBinding()]
param(
    [string]$Branch = "",
    [switch]$HardReset,
    [switch]$SkipServerCheck
)

. "$PSScriptRoot\lib\RegEngine.ps1"

$config = Get-RegEngineConfig
if ([string]::IsNullOrWhiteSpace($Branch)) {
    $Branch = $config.Branch
}
Assert-RegEngineCleanCommandPrerequisites

$mode = if ($HardReset) { "hard-reset" } else { "fast-forward" }

$deployScript = @"
set -euo pipefail
mkdir -p "$($config.ServerRepo)"
cd "$($config.ServerRepo)"
if [ ! -d .git ]; then
  git init
fi
git remote remove origin >/dev/null 2>&1 || true
git remote add origin "$($config.RepoUrl)"
git fetch origin
if [ "$mode" = "hard-reset" ]; then
  git checkout -B "$Branch" "origin/$Branch"
  git reset --hard "origin/$Branch"
else
  if git rev-parse --verify "$Branch" >/dev/null 2>&1; then
    git checkout "$Branch"
  else
    git checkout -B "$Branch" "origin/$Branch"
  fi
  git branch --set-upstream-to="origin/$Branch" "$Branch" >/dev/null 2>&1 || true
  git pull --ff-only origin "$Branch"
fi
git status --short --branch
git log --oneline -1
"@

Invoke-RegEngineServerScript -Script $deployScript

if (-not $SkipServerCheck) {
    & "$PSScriptRoot\server-check.ps1"
    if ($LASTEXITCODE -ne 0) {
        throw "Server checks failed after deploy."
    }
}

Write-Host ""
Write-Host "Deploy completed for $Branch." -ForegroundColor Green
