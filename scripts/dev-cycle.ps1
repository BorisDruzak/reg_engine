[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Message,
    [switch]$HardResetDeploy
)

. "$PSScriptRoot\lib\RegEngine.ps1"

$config = Get-RegEngineConfig

& "$PSScriptRoot\check.ps1"
if ($LASTEXITCODE -ne 0) {
    throw "Local checks failed."
}

& "$PSScriptRoot\push-git.ps1" -Message $Message -SkipCheck
if ($LASTEXITCODE -ne 0) {
    throw "Git push failed."
}

if ($HardResetDeploy) {
    & "$PSScriptRoot\deploy.ps1" -Branch $config.Branch -HardReset
}
else {
    & "$PSScriptRoot\deploy.ps1" -Branch $config.Branch
}

if ($LASTEXITCODE -ne 0) {
    throw "Deploy failed."
}

Write-Host ""
Write-Host "Development cycle completed." -ForegroundColor Green
