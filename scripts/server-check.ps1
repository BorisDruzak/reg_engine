[CmdletBinding()]
param(
    [switch]$SkipDatabaseLogin
)

. "$PSScriptRoot\lib\RegEngine.ps1"

$config = Get-RegEngineConfig
Assert-RegEngineCleanCommandPrerequisites

$passwordExport = ""
if ($env:REG_ENGINE_PGPASSWORD) {
    $escaped = $env:REG_ENGINE_PGPASSWORD.Replace("'", "'\''")
    $passwordExport = "export REG_ENGINE_PGPASSWORD='$escaped'"
}

$databaseLogin = @'
if [ -f /etc/reg_engine/reg_engine.env ]; then
  set -a
  . /etc/reg_engine/reg_engine.env
  set +a
fi
if [ -n "${REG_ENGINE_PGPASSWORD:-}" ]; then
  PGPASSWORD="$REG_ENGINE_PGPASSWORD" psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -c "select current_database(), current_user, inet_server_addr(), inet_server_port();"
else
  echo "REG_ENGINE_PGPASSWORD is not set; skipping TCP role login check."
fi
'@

if ($SkipDatabaseLogin) {
    $databaseLogin = 'echo "Skipping TCP role login check by request."'
}

$script = @"
set -euo pipefail
$passwordExport
export PGHOST="$($config.PgHost)"
export PGPORT="$($config.PgPort)"
export PGDATABASE="$($config.PgDatabase)"
export PGUSER="$($config.PgUser)"

echo "server_user=`$(whoami)"
echo "server_host=`$(hostname)"
echo "server_repo=$($config.ServerRepo)"

cd "$($config.ServerRepo)"
git remote -v
git fetch origin
git status --short --branch

systemctl is-active postgresql
ss -ltn '( sport = :5432 )'
sudo -u postgres psql -d "$($config.PgDatabase)" -c "select current_database(), current_user;"

$databaseLogin
"@

Invoke-RegEngineServerScript -Script $script

Write-Host ""
Write-Host "Server checks passed." -ForegroundColor Green
