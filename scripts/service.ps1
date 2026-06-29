[CmdletBinding()]
param(
    [ValidateSet("install", "start", "stop", "restart", "status", "logs")]
    [string]$Command = "status",
    [string]$ServiceName = "",
    [string]$HostAddress = "",
    [int]$Port = 0,
    [string]$EnvFile = "",
    [string]$RunAsUser = "root",
    [int]$LogLines = 100,
    [switch]$NoInstall
)

. "$PSScriptRoot\lib\RegEngine.ps1"

function Assert-ServiceUnitName {
    param([Parameter(Mandatory = $true)][string]$Name)

    if ($Name -notmatch '^[A-Za-z0-9_.@-]+(\.service)?$') {
        throw "Invalid systemd service name: $Name"
    }
}

function Assert-ServicePath {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Name
    )

    if ([string]::IsNullOrWhiteSpace($Path) -or $Path -notmatch '^/') {
        throw "$Name must be an absolute Linux path."
    }
}

function ConvertTo-Base64Utf8 {
    param([Parameter(Mandatory = $true)][string]$Value)

    return [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($Value))
}

$config = Get-RegEngineConfig
Assert-RegEngineCleanCommandPrerequisites
Assert-RegEngineServerConfig

if ([string]::IsNullOrWhiteSpace($ServiceName)) {
    $ServiceName = $config.ServiceName
}
if ([string]::IsNullOrWhiteSpace($HostAddress)) {
    $HostAddress = $config.ServiceHost
}
if ($Port -le 0) {
    $Port = [int]$config.ServicePort
}
if ([string]::IsNullOrWhiteSpace($EnvFile)) {
    $EnvFile = $config.ServiceEnvFile
}

Assert-ServiceUnitName -Name $ServiceName
Assert-ServicePath -Path $config.ServerRepo -Name "ServerRepo"
Assert-ServicePath -Path $EnvFile -Name "EnvFile"

if ($Port -lt 1 -or $Port -gt 65535) {
    throw "Port must be between 1 and 65535."
}
if ($RunAsUser -notmatch '^[A-Za-z0-9_.@-]+$') {
    throw "Invalid Linux user name: $RunAsUser"
}

$unitName = if ($ServiceName.EndsWith(".service")) { $ServiceName } else { "$ServiceName.service" }
$backendRoot = "$($config.ServerRepo)/backend"
$pythonPath = "$backendRoot/.venv/bin/python"
$healthUrl = "http://127.0.0.1:$Port/api/v1/health"
$publicDocsUrl = "http://$($config.ServerHost):$Port/docs"

$unitText = @"
[Unit]
Description=Registry Engine API
After=network-online.target postgresql.service
Wants=network-online.target postgresql.service

[Service]
Type=simple
WorkingDirectory=$backendRoot
EnvironmentFile=-$EnvFile
Environment=REG_ENGINE_ENV_FILE=$EnvFile
Environment=PYTHONUNBUFFERED=1
ExecStart=$pythonPath -m uvicorn app.main:app --host $HostAddress --port $Port
Restart=on-failure
RestartSec=5
User=$RunAsUser

[Install]
WantedBy=multi-user.target
"@

$unitBase64 = ConvertTo-Base64Utf8 -Value $unitText

function Invoke-ServiceInstall {
    $script = @"
set -euo pipefail
test -d '$($config.ServerRepo)' || { echo 'Server checkout does not exist: $($config.ServerRepo)' >&2; exit 1; }
test -d '$backendRoot' || { echo 'Backend directory does not exist: $backendRoot' >&2; exit 1; }
test -x '$pythonPath' || { echo 'Backend virtualenv python does not exist or is not executable: $pythonPath' >&2; exit 1; }
printf '%s' '$unitBase64' | base64 -d > '/etc/systemd/system/$unitName'
systemctl daemon-reload
systemctl enable '$unitName'
echo 'installed_unit=$unitName'
systemctl cat '$unitName'
"@
    Invoke-RegEngineServerScript -Script $script
}

function Invoke-ServiceHealth {
    $script = @"
set -euo pipefail
for attempt in `$(seq 1 20); do
  if curl -fsS '$healthUrl'; then
    echo
    echo 'healthcheck=ok'
    exit 0
  fi
  sleep 1
done
echo 'healthcheck=failed' >&2
journalctl -u '$unitName' -n 80 --no-pager
exit 1
"@
    Invoke-RegEngineServerScript -Script $script
}

function Invoke-ServiceStatus {
    $script = @"
set -euo pipefail
echo 'service=$unitName'
echo 'local_health_url=$healthUrl'
echo 'public_docs_url=$publicDocsUrl'
systemctl status '$unitName' --no-pager || true
ss -ltnp | grep -E ':$Port\b' || true
if curl -fsS '$healthUrl'; then
  echo
  echo 'healthcheck=ok'
else
  echo
  echo 'healthcheck=failed'
fi
"@
    Invoke-RegEngineServerScript -Script $script
}

switch ($Command) {
    "install" {
        Invoke-ServiceInstall
        Invoke-ServiceStatus
    }
    "start" {
        if (-not $NoInstall) {
            Invoke-ServiceInstall
        }
        Invoke-RegEngineServerScript -Script "set -euo pipefail`nsystemctl start '$unitName'"
        Invoke-ServiceHealth
        Invoke-ServiceStatus
    }
    "restart" {
        if (-not $NoInstall) {
            Invoke-ServiceInstall
        }
        Invoke-RegEngineServerScript -Script "set -euo pipefail`nsystemctl restart '$unitName'"
        Invoke-ServiceHealth
        Invoke-ServiceStatus
    }
    "stop" {
        Invoke-RegEngineServerScript -Script "set -euo pipefail`nsystemctl stop '$unitName' || true"
        Invoke-ServiceStatus
    }
    "status" {
        Invoke-ServiceStatus
    }
    "logs" {
        if ($LogLines -lt 1) {
            throw "LogLines must be positive."
        }
        Invoke-RegEngineServerScript -Script "set -euo pipefail`njournalctl -u '$unitName' -n $LogLines --no-pager"
    }
}
