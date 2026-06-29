[CmdletBinding()]
param(
    [string]$ApiBaseUrl = "http://127.0.0.1:8000",
    [string]$Token = ""
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$backendRoot = Join-Path $repoRoot "backend"
$python = Join-Path $backendRoot ".venv\Scripts\python.exe"

if (-not (Test-Path $python)) {
    $python = "python"
}

$env:REG_ENGINE_API_BASE_URL = $ApiBaseUrl
if ($Token) {
    $env:REG_ENGINE_API_TOKEN = $Token
}

Push-Location $backendRoot
try {
    & $python -m app.mcp.server
    if ($LASTEXITCODE -ne 0) {
        throw "MCP server exited with code $LASTEXITCODE."
    }
}
finally {
    Pop-Location
}
