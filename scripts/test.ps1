[CmdletBinding()]
param(
    [switch]$E2E
)

. "$PSScriptRoot\lib\RegEngine.ps1"

if (Test-RegEngineBackendExists) {
    Invoke-RegEngineBackend -Arguments @("-m", "pytest")
}

if (Test-RegEngineFrontendExists) {
    Invoke-RegEnginePnpm -Arguments @("-C", "frontend", "test:run")
    if ($E2E) {
        Invoke-RegEnginePnpm -Arguments @("-C", "frontend", "e2e")
    }
}

Write-Host ""
Write-Host "Tests passed." -ForegroundColor Green

