[CmdletBinding()]
param(
    [ValidateSet("install", "run", "status")]
    [string]$Command = "status",
    [string]$ServiceName = "",
    [string]$EnvFile = "",
    [string]$RunAsUser = "root"
)

. "$PSScriptRoot\lib\RegEngine.ps1"

function Assert-RetentionUnitName {
    param([Parameter(Mandatory = $true)][string]$Name)

    if ($Name -notmatch '^[A-Za-z0-9_.@-]+$') {
        throw "Invalid systemd unit base name: $Name"
    }
}

function Assert-RetentionLinuxPath {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Name
    )

    if ($Path -notmatch '^/[A-Za-z0-9_./@:+-]+$') {
        throw "$Name must be a safe absolute Linux path."
    }
}

function ConvertTo-RetentionBase64Utf8 {
    param([Parameter(Mandatory = $true)][string]$Value)

    return [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($Value))
}

$config = Get-RegEngineConfig
Assert-RegEngineCleanCommandPrerequisites
Assert-RegEngineServerConfig

if ([string]::IsNullOrWhiteSpace($ServiceName)) {
    $ServiceName = "$($config.ServiceName)-audit-retention"
}
if ([string]::IsNullOrWhiteSpace($EnvFile)) {
    $EnvFile = $config.ServiceEnvFile
}
if ($RunAsUser -notmatch '^[A-Za-z0-9_.@-]+$') {
    throw "Invalid Linux user name: $RunAsUser"
}

Assert-RetentionUnitName -Name $ServiceName
Assert-RetentionLinuxPath -Path $config.ServerRepo -Name "ServerRepo"
Assert-RetentionLinuxPath -Path $EnvFile -Name "EnvFile"

$serviceUnitName = if ($ServiceName.EndsWith(".service")) { $ServiceName } else { "$ServiceName.service" }
$serviceUnitBaseName = $serviceUnitName.Substring(0, $serviceUnitName.Length - ".service".Length)
$timerUnitName = "$serviceUnitBaseName.timer"
$backendRoot = "$($config.ServerRepo)/backend"
$pythonPath = "$backendRoot/.venv/bin/python"

$serviceUnitText = @"
[Unit]
Description=Registry Engine audit retention cleanup
After=network-online.target postgresql.service
Wants=network-online.target postgresql.service

[Service]
Type=oneshot
WorkingDirectory=$backendRoot
EnvironmentFile=-$EnvFile
Environment=REG_ENGINE_ENV_FILE=$EnvFile
ExecStart=$pythonPath -m app.cli.audit_retention
User=$RunAsUser
"@

$timerUnitText = @"
[Unit]
Description=Run Registry Engine audit retention daily

[Timer]
OnCalendar=daily
Persistent=true
Unit=$serviceUnitName

[Install]
WantedBy=timers.target
"@

$serviceUnitBase64 = ConvertTo-RetentionBase64Utf8 -Value $serviceUnitText
$timerUnitBase64 = ConvertTo-RetentionBase64Utf8 -Value $timerUnitText

function Install-AuditRetentionTimer {
    $script = @"
set -euo pipefail
test -d '$($config.ServerRepo)' || { echo 'Server checkout does not exist: $($config.ServerRepo)' >&2; exit 1; }
test -d '$backendRoot' || { echo 'Backend directory does not exist: $backendRoot' >&2; exit 1; }
test -x '$pythonPath' || { echo 'Backend virtualenv python does not exist or is not executable: $pythonPath' >&2; exit 1; }
printf '%s' '$serviceUnitBase64' | base64 -d > '/etc/systemd/system/$serviceUnitName'
printf '%s' '$timerUnitBase64' | base64 -d > '/etc/systemd/system/$timerUnitName'
systemctl daemon-reload
systemctl enable --now '$timerUnitName'
echo 'installed_service=$serviceUnitName'
echo 'installed_timer=$timerUnitName'
systemctl cat '$serviceUnitName'
systemctl cat '$timerUnitName'
"@
    Invoke-RegEngineServerScript -Script $script
}

function Get-AuditRetentionTimerStatus {
    $script = @"
set -euo pipefail
echo 'service=$serviceUnitName'
echo 'timer=$timerUnitName'
systemctl status '$timerUnitName' --no-pager || true
systemctl list-timers '$timerUnitName' --no-pager || true
"@
    Invoke-RegEngineServerScript -Script $script
}

switch ($Command) {
    "install" {
        Install-AuditRetentionTimer
        Get-AuditRetentionTimerStatus
    }
    "run" {
        Invoke-RegEngineServerScript -Script "set -euo pipefail`nsystemctl start '$serviceUnitName'`nsystemctl status '$serviceUnitName' --no-pager || true`ntest \`$(systemctl show '$serviceUnitName' -p Result --value) = success"
    }
    "status" {
        Get-AuditRetentionTimerStatus
    }
}
