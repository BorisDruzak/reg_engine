[CmdletBinding()]
param(
    [switch]$Check
)

. "$PSScriptRoot\lib\RegEngine.ps1"

if (Test-RegEngineBackendExists) {
    if ($Check) {
        Invoke-RegEngineBackend -Arguments @("-m", "ruff", "format", "--check", ".")
    }
    else {
        Invoke-RegEngineBackend -Arguments @("-m", "ruff", "format", ".")
    }
}

if (Test-RegEngineFrontendExists) {
    if ($Check) {
        Invoke-RegEnginePnpm -Arguments @("-C", "frontend", "format:check")
    }
    else {
        Invoke-RegEnginePnpm -Arguments @("-C", "frontend", "format")
    }
}

Write-Host ""
Write-Host "Format command completed." -ForegroundColor Green

