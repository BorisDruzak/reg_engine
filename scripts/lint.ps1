[CmdletBinding()]
param()

. "$PSScriptRoot\lib\RegEngine.ps1"

if (Test-RegEngineBackendExists) {
    Invoke-RegEngineBackend -Arguments @("-m", "ruff", "check", ".")
}

if (Test-RegEngineFrontendExists) {
    Invoke-RegEnginePnpm -Arguments @("-C", "frontend", "lint")
}

Write-Host ""
Write-Host "Lint checks passed." -ForegroundColor Green

