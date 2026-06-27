[CmdletBinding()]
param(
    [int]$Port = 5173
)

. "$PSScriptRoot\lib\RegEngine.ps1"

Invoke-RegEnginePnpm -Arguments @("-C", "frontend", "dev", "--host", "127.0.0.1", "--port", "$Port")

