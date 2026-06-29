[CmdletBinding()]
param(
    [switch]$SkipBuild,
    [switch]$SkipRestart,
    [switch]$SkipSmoke
)

. "$PSScriptRoot\lib\RegEngine.ps1"

function New-RegEngineTempFile {
    $name = "reg-engine-frontend-{0}.tar.gz" -f ([Guid]::NewGuid().ToString("N"))
    return Join-Path ([System.IO.Path]::GetTempPath()) $name
}

$config = Get-RegEngineConfig
Assert-RegEngineCleanCommandPrerequisites
Assert-RegEngineServerConfig
foreach ($name in @("scp", "tar")) {
    if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
        throw "Required command not found: $name"
    }
}

if (-not $SkipBuild) {
    Write-RegEngineStep "Build frontend"
    Invoke-RegEnginePnpm -Arguments @("-C", "frontend", "build")
}

$distPath = Join-Path $config.FrontendRoot "dist"
if (-not (Test-Path -LiteralPath (Join-Path $distPath "index.html"))) {
    throw "Frontend dist is missing. Run pnpm -C frontend build or omit -SkipBuild."
}

$archivePath = New-RegEngineTempFile
try {
    Write-RegEngineStep "Create frontend artifact"
    Invoke-RegEngineCommand -FilePath "tar" -Arguments @(
        "-C",
        $config.FrontendRoot,
        "-czf",
        $archivePath,
        "dist"
    ) -WorkingDirectory $config.RepoRoot

    Write-RegEngineStep "Upload frontend artifact"
    Invoke-RegEngineCommand -FilePath "scp" -Arguments @(
        "-o",
        "BatchMode=yes",
        $archivePath,
        "$($config.ServerTarget):/tmp/reg-engine-frontend.tar.gz"
    )

    $deployScript = @"
set -euo pipefail
test -d '$($config.ServerRepo)' || { echo 'Server checkout does not exist: $($config.ServerRepo)' >&2; exit 1; }
mkdir -p '$($config.ServerRepo)/frontend'
rm -rf '$($config.ServerRepo)/frontend/dist'
tar -xzf /tmp/reg-engine-frontend.tar.gz -C '$($config.ServerRepo)/frontend'
rm -f /tmp/reg-engine-frontend.tar.gz
test -f '$($config.ServerRepo)/frontend/dist/index.html'
echo 'frontend_dist=$($config.ServerRepo)/frontend/dist'
"@
    Invoke-RegEngineServerScript -Script $deployScript
}
finally {
    if (Test-Path -LiteralPath $archivePath) {
        Remove-Item -LiteralPath $archivePath -Force
    }
}

if (-not $SkipRestart) {
    Write-RegEngineStep "Restart backend service to pick up frontend dist"
    & "$PSScriptRoot\service.ps1" -Command restart
    if ($LASTEXITCODE -ne 0) {
        throw "Backend service restart failed after frontend deploy."
    }
}

if (-not $SkipSmoke) {
    Write-RegEngineStep "Frontend smoke check"
    $smokeScript = @"
set -euo pipefail
curl -fsS 'http://127.0.0.1:$($config.ServicePort)/' | grep -E '<div id="root"></div>|/assets/'
curl -fsS 'http://127.0.0.1:$($config.ServicePort)/api/v1/health'
echo
echo 'frontend_smoke=ok'
"@
    Invoke-RegEngineServerScript -Script $smokeScript
}

Write-Host ""
Write-Host "Frontend deployed." -ForegroundColor Green
