[CmdletBinding()]
param(
    [switch]$SkipPython
)

. "$PSScriptRoot\lib\RegEngine.ps1"

$config = Get-RegEngineConfig
Assert-RegEngineCleanCommandPrerequisites

Write-RegEngineStep "Repository status"
Invoke-RegEngineCommand -FilePath "git" -Arguments @("status", "--short", "--branch") -WorkingDirectory $config.RepoRoot

Write-RegEngineStep "Repository remote"
Assert-RegEngineRemote

Write-RegEngineStep "GitHub SSH authentication from Windows"
Test-RegEngineGitHubAuth

Write-RegEngineStep "Server root SSH authentication"
Invoke-RegEngineCommand -FilePath "ssh" -Arguments @("-o", "BatchMode=yes", $config.ServerTarget, "whoami; hostname; id -u")

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

Write-Host ""
Write-Host "Local checks passed." -ForegroundColor Green
