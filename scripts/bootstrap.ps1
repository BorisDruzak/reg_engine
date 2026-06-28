[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("seed", "create-superadmin")]
    [string]$Command,

    [string]$DatabaseUrl,
    [string]$Email,
    [string]$DisplayName,
    [string]$PasswordHash
)

. "$PSScriptRoot\lib\RegEngine.ps1"

$arguments = @("-m", "app.cli.bootstrap", $Command)

if ($Command -eq "create-superadmin") {
    if (-not $Email) {
        throw "-Email is required for create-superadmin."
    }
    if (-not $DisplayName) {
        throw "-DisplayName is required for create-superadmin."
    }
    $arguments += @("--email", $Email, "--display-name", $DisplayName)
    if ($PasswordHash) {
        $arguments += @("--password-hash", $PasswordHash)
    }
}

$config = Get-RegEngineConfig
$previousDatabaseUrl = $env:DATABASE_URL
try {
    if ($DatabaseUrl) {
        $env:DATABASE_URL = $DatabaseUrl
    }
    Invoke-RegEngineCommand -FilePath (Get-RegEnginePython) -Arguments $arguments -WorkingDirectory $config.BackendRoot
}
finally {
    if ($null -eq $previousDatabaseUrl) {
        Remove-Item Env:\DATABASE_URL -ErrorAction SilentlyContinue
    }
    else {
        $env:DATABASE_URL = $previousDatabaseUrl
    }
}
