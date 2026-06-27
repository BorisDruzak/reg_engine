[CmdletBinding()]
param(
    [int]$Port = 8000
)

. "$PSScriptRoot\lib\RegEngine.ps1"

$config = Get-RegEngineConfig
Invoke-RegEngineCommand -FilePath (Get-RegEnginePython) -Arguments @(
    "-m",
    "uvicorn",
    "app.main:app",
    "--reload",
    "--host",
    "127.0.0.1",
    "--port",
    "$Port"
) -WorkingDirectory $config.BackendRoot

