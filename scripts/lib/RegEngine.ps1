Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-RegEngineConfig {
    $repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
    $localConfig = Get-RegEngineLocalConfig -RepoRoot $repoRoot.Path
    $serverHost = Get-RegEngineConfigValue -LocalConfig $localConfig -Key "ServerHost" -EnvName "REG_ENGINE_SERVER_HOST" -Default ""
    $serverUser = Get-RegEngineConfigValue -LocalConfig $localConfig -Key "ServerUser" -EnvName "REG_ENGINE_SERVER_USER" -Default "root"
    $serverTarget = Get-RegEngineConfigValue -LocalConfig $localConfig -Key "ServerTarget" -EnvName "REG_ENGINE_SERVER_TARGET" -Default ""
    if ([string]::IsNullOrWhiteSpace($serverTarget) -and -not [string]::IsNullOrWhiteSpace($serverHost)) {
        $serverTarget = "$serverUser@$serverHost"
    }

    [pscustomobject]@{
        RepoRoot     = $repoRoot.Path
        BackendRoot  = Join-Path $repoRoot.Path "backend"
        FrontendRoot = Join-Path $repoRoot.Path "frontend"
        Branch       = "main"
        Remote       = "origin"
        RepoUrl      = "git@github.com:BorisDruzak/reg_engine.git"
        ServerHost   = $serverHost
        ServerUser   = $serverUser
        ServerTarget = $serverTarget
        ServerRepo   = Get-RegEngineConfigValue -LocalConfig $localConfig -Key "ServerRepo" -EnvName "REG_ENGINE_SERVER_REPO" -Default ""
        PgHost       = Get-RegEngineConfigValue -LocalConfig $localConfig -Key "PgHost" -EnvName "REG_ENGINE_PGHOST" -Default ""
        PgPort       = Get-RegEngineConfigValue -LocalConfig $localConfig -Key "PgPort" -EnvName "REG_ENGINE_PGPORT" -Default "5432"
        PgDatabase   = Get-RegEngineConfigValue -LocalConfig $localConfig -Key "PgDatabase" -EnvName "REG_ENGINE_PGDATABASE" -Default "reg_engine"
        PgUser       = Get-RegEngineConfigValue -LocalConfig $localConfig -Key "PgUser" -EnvName "REG_ENGINE_PGUSER" -Default ""
    }
}

function Get-RegEngineLocalConfig {
    param([Parameter(Mandatory = $true)][string]$RepoRoot)

    $localConfigPath = $env:REG_ENGINE_LOCAL_CONFIG
    if ([string]::IsNullOrWhiteSpace($localConfigPath)) {
        $localConfigPath = Join-Path $RepoRoot "scripts\local.reg_engine.psd1"
    }
    if (-not (Test-Path -LiteralPath $localConfigPath)) {
        return @{}
    }
    return Import-PowerShellDataFile -LiteralPath $localConfigPath
}

function Get-RegEngineConfigValue {
    param(
        [Parameter(Mandatory = $true)][hashtable]$LocalConfig,
        [Parameter(Mandatory = $true)][string]$Key,
        [Parameter(Mandatory = $true)][string]$EnvName,
        [Parameter()][string]$Default = ""
    )

    $envValue = [Environment]::GetEnvironmentVariable($EnvName)
    if (-not [string]::IsNullOrWhiteSpace($envValue)) {
        return $envValue
    }
    if ($LocalConfig.ContainsKey($Key) -and -not [string]::IsNullOrWhiteSpace([string]$LocalConfig[$Key])) {
        return [string]$LocalConfig[$Key]
    }
    return $Default
}

function Assert-RegEngineRemoteConfig {
    $config = Get-RegEngineConfig
    $missing = @()
    if ([string]::IsNullOrWhiteSpace($config.ServerTarget)) { $missing += "REG_ENGINE_SERVER_HOST or REG_ENGINE_SERVER_TARGET" }
    if ([string]::IsNullOrWhiteSpace($config.ServerRepo)) { $missing += "REG_ENGINE_SERVER_REPO" }
    if ([string]::IsNullOrWhiteSpace($config.PgHost)) { $missing += "REG_ENGINE_PGHOST" }
    if ([string]::IsNullOrWhiteSpace($config.PgUser)) { $missing += "REG_ENGINE_PGUSER" }

    if ($missing.Count -gt 0) {
        throw "Remote configuration is missing: $($missing -join ', '). Set environment variables or create ignored scripts/local.reg_engine.psd1 from scripts/local.reg_engine.example.psd1."
    }
}

function Write-RegEngineStep {
    param([Parameter(Mandatory = $true)][string]$Message)
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Invoke-RegEngineCommand {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter()][string[]]$Arguments = @(),
        [Parameter()][int[]]$AllowedExitCodes = @(0),
        [Parameter()][string]$WorkingDirectory = (Get-Location).Path
    )

    $parts = @($FilePath) + $Arguments
    Write-RegEngineStep ($parts -join " ")
    Push-Location $WorkingDirectory
    try {
        & $FilePath @Arguments
        $exitCode = if ($null -eq $global:LASTEXITCODE) { 0 } else { $global:LASTEXITCODE }
        if ($AllowedExitCodes -notcontains $exitCode) {
            throw "Command failed with exit code ${exitCode}: $FilePath $($Arguments -join ' ')"
        }
    }
    finally {
        Pop-Location
    }
}

function Invoke-RegEngineCapture {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter()][string[]]$Arguments = @(),
        [Parameter()][string]$WorkingDirectory = (Get-Location).Path
    )

    Push-Location $WorkingDirectory
    try {
        $oldErrorActionPreference = $ErrorActionPreference
        $ErrorActionPreference = "Continue"
        try {
            $output = & $FilePath @Arguments 2>&1 | ForEach-Object { $_.ToString() }
        }
        finally {
            $ErrorActionPreference = $oldErrorActionPreference
        }
        $exitCode = if ($null -eq $global:LASTEXITCODE) { 0 } else { $global:LASTEXITCODE }
        [pscustomobject]@{
            ExitCode = $exitCode
            Output   = $output
            Text     = ($output -join [Environment]::NewLine)
        }
    }
    finally {
        Pop-Location
    }
}

function Invoke-RegEngineServerScript {
    param(
        [Parameter(Mandatory = $true)][string]$Script,
        [Parameter()][int[]]$AllowedExitCodes = @(0)
    )

    $config = Get-RegEngineConfig
    Assert-RegEngineRemoteConfig
    Write-RegEngineStep "ssh $($config.ServerTarget) bash -s"
    $Script | & ssh -o BatchMode=yes $config.ServerTarget "tr -d '\r' | bash -s"
    $exitCode = if ($null -eq $global:LASTEXITCODE) { 0 } else { $global:LASTEXITCODE }
    if ($AllowedExitCodes -notcontains $exitCode) {
        throw "Server script failed with exit code ${exitCode}"
    }
}

function Test-RegEngineGitHubAuth {
    param([Parameter()][string]$Target = "git@github.com")

    $result = Invoke-RegEngineCapture -FilePath "ssh" -Arguments @("-T", "-o", "BatchMode=yes", "-o", "ConnectTimeout=10", $Target)
    $result.Output | ForEach-Object { Write-Host $_ }

    if ($result.Text -notmatch "successfully authenticated") {
        throw "GitHub SSH authentication failed for $Target"
    }
}

function Assert-RegEngineRemote {
    $config = Get-RegEngineConfig
    $actual = (Invoke-RegEngineCapture -FilePath "git" -Arguments @("remote", "get-url", $config.Remote) -WorkingDirectory $config.RepoRoot).Text.Trim()
    if ($actual -ne $config.RepoUrl) {
        throw "Expected remote '$($config.Remote)' to be '$($config.RepoUrl)', got '$actual'"
    }
    Write-Host "remote $($config.Remote) = $actual"
}

function Assert-RegEngineMainBranch {
    $config = Get-RegEngineConfig
    $current = (Invoke-RegEngineCapture -FilePath "git" -Arguments @("branch", "--show-current") -WorkingDirectory $config.RepoRoot).Text.Trim()
    if ($current -ne $config.Branch) {
        throw "Single-branch policy: expected '$($config.Branch)', got '$current'. Checkout '$($config.Branch)' before running this command."
    }
}

function Get-RegEnginePythonFiles {
    $config = Get-RegEngineConfig
    Get-ChildItem -LiteralPath $config.RepoRoot -Recurse -File -Filter "*.py" |
        Where-Object {
            $_.FullName -notmatch "\\\.git\\" -and
            $_.FullName -notmatch "\\\.venv\\" -and
            $_.FullName -notmatch "\\venv\\" -and
            $_.FullName -notmatch "\\__pycache__\\"
        }
}

function Assert-RegEngineCleanCommandPrerequisites {
    foreach ($name in @("git", "ssh")) {
        if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
            throw "Required command not found: $name"
        }
    }
}

function Test-RegEngineBackendExists {
    $config = Get-RegEngineConfig
    Test-Path -LiteralPath (Join-Path $config.BackendRoot "pyproject.toml")
}

function Test-RegEngineFrontendExists {
    $config = Get-RegEngineConfig
    Test-Path -LiteralPath (Join-Path $config.FrontendRoot "package.json")
}

function Get-RegEnginePython {
    $config = Get-RegEngineConfig
    $venvPython = Join-Path $config.BackendRoot ".venv\Scripts\python.exe"
    if (Test-Path -LiteralPath $venvPython) {
        return $venvPython
    }
    return "python"
}

function Invoke-RegEngineBackend {
    param(
        [Parameter(Mandatory = $true)][string[]]$Arguments
    )

    $config = Get-RegEngineConfig
    $python = Get-RegEnginePython
    Invoke-RegEngineCommand -FilePath $python -Arguments $Arguments -WorkingDirectory $config.BackendRoot
}

function Invoke-RegEnginePnpm {
    param(
        [Parameter(Mandatory = $true)][string[]]$Arguments
    )

    $config = Get-RegEngineConfig
    Invoke-RegEngineCommand -FilePath "pnpm" -Arguments $Arguments -WorkingDirectory $config.RepoRoot
}
