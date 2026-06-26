Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-RegEngineConfig {
    $repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")

    [pscustomobject]@{
        RepoRoot     = $repoRoot.Path
        Branch       = "main"
        Remote       = "origin"
        RepoUrl      = "git@github.com:BorisDruzak/reg_engine.git"
        ServerHost   = "registoryengine"
        ServerUser   = "root"
        ServerTarget = "root@registoryengine"
        ServerRepo   = "/opt/reg_engine"
        PgHost       = "192.168.100.12"
        PgPort       = "5432"
        PgDatabase   = "reg_engine"
        PgUser       = "reg_engine_admin"
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
