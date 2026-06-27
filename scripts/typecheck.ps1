[CmdletBinding()]
param()

. "$PSScriptRoot\lib\RegEngine.ps1"

if (Test-RegEngineBackendExists) {
    Invoke-RegEngineBackend -Arguments @("-m", "mypy", "app")
}

if (Test-RegEngineFrontendExists) {
    Invoke-RegEnginePnpm -Arguments @("-C", "frontend", "typecheck")
}

Write-Host ""
Write-Host "Type checks passed." -ForegroundColor Green

