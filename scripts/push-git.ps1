[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Message,
    [string[]]$Path = @(),
    [switch]$SkipCheck
)

. "$PSScriptRoot\lib\RegEngine.ps1"

$config = Get-RegEngineConfig
Assert-RegEngineCleanCommandPrerequisites
Assert-RegEngineMainBranch

if (-not $SkipCheck) {
    & "$PSScriptRoot\check.ps1"
    if ($LASTEXITCODE -ne 0) {
        throw "Local checks failed."
    }
}

Write-RegEngineStep "Inspect local changes"
$status = Invoke-RegEngineCapture -FilePath "git" -Arguments @("status", "--porcelain") -WorkingDirectory $config.RepoRoot
if ([string]::IsNullOrWhiteSpace($status.Text)) {
    Write-Host "No local changes to commit."
    return
}
$status.Output | ForEach-Object { Write-Host $_ }

if ($Path.Count -gt 0) {
    Invoke-RegEngineCommand -FilePath "git" -Arguments (@("add", "--") + $Path) -WorkingDirectory $config.RepoRoot
}
else {
    Invoke-RegEngineCommand -FilePath "git" -Arguments @("add", "-A") -WorkingDirectory $config.RepoRoot
}

$staged = Invoke-RegEngineCapture -FilePath "git" -Arguments @("diff", "--cached", "--name-only") -WorkingDirectory $config.RepoRoot
if ([string]::IsNullOrWhiteSpace($staged.Text)) {
    throw "No staged changes after git add."
}

Invoke-RegEngineCommand -FilePath "git" -Arguments @("commit", "-m", $Message) -WorkingDirectory $config.RepoRoot
Invoke-RegEngineCommand -FilePath "git" -Arguments @("push", "-u", $config.Remote, $config.Branch) -WorkingDirectory $config.RepoRoot

Write-Host ""
Write-Host "Pushed to $($config.Remote)/$($config.Branch)." -ForegroundColor Green
