[CmdletBinding()]
param(
    [switch]$SkipRemote,
    [switch]$SkipPython
)

. "$PSScriptRoot\lib\RegEngine.ps1"

$config = Get-RegEngineConfig
Assert-RegEngineCleanCommandPrerequisites

Write-RegEngineStep "Repository status"
Write-Host "repo_root=$($config.RepoRoot)"
Invoke-RegEngineCommand -FilePath "git" -Arguments @("status", "--short", "--branch") -WorkingDirectory $config.RepoRoot

Write-RegEngineStep "Repository remote"
Assert-RegEngineRemote

if ($SkipRemote) {
    Write-RegEngineStep "Remote checks"
    Write-Host "Skipping GitHub SSH and server SSH checks because -SkipRemote was passed."
}
else {
    Write-RegEngineStep "GitHub SSH authentication from Windows"
    Test-RegEngineGitHubAuth

    Write-RegEngineStep "Server root SSH authentication"
    Invoke-RegEngineCommand -FilePath "ssh" -Arguments @("-o", "BatchMode=yes", $config.ServerTarget, "whoami; hostname; id -u")
}

if (-not $SkipPython) {
    $pythonFiles = @(Get-RegEnginePythonFiles)
    if ($pythonFiles.Count -gt 0) {
        Write-RegEngineStep "Python syntax check"
        Invoke-RegEngineCommand -FilePath "python" -Arguments @("-m", "compileall", "-q", "-x", "(\.git|\.venv|venv|__pycache__)", ".") -WorkingDirectory $config.RepoRoot
    }
    else {
        Write-RegEngineStep "Python syntax check"
        Write-Host "No Python files found; skipping."
    }
}

if (Test-RegEngineBackendExists) {
    Write-RegEngineStep "Backend checks"
    Invoke-RegEngineBackend -Arguments @("-m", "ruff", "check", ".")
    Invoke-RegEngineBackend -Arguments @("-m", "ruff", "format", "--check", ".")
    Invoke-RegEngineBackend -Arguments @("-m", "mypy", "app")
    Invoke-RegEngineBackend -Arguments @("-m", "pytest")
}

if (Test-RegEngineFrontendExists) {
    Write-RegEngineStep "Frontend checks"
    Invoke-RegEnginePnpm -Arguments @("-C", "frontend", "lint")
    Invoke-RegEnginePnpm -Arguments @("-C", "frontend", "typecheck")
    Invoke-RegEnginePnpm -Arguments @("-C", "frontend", "test:run")
    Invoke-RegEnginePnpm -Arguments @("-C", "frontend", "build")
}

if (Test-Path -LiteralPath (Join-Path $config.RepoRoot "scripts\project-map.ps1")) {
    Write-RegEngineStep "Project map check"
    & (Join-Path $config.RepoRoot "scripts\project-map.ps1") -Check
    if ($LASTEXITCODE -ne 0) {
        throw "Project map check failed."
    }
}

Write-Host ""
Write-Host "Local checks passed." -ForegroundColor Green
