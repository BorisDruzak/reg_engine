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

$storageCheck = @'
if [ -f /etc/reg_engine/reg_engine.env ]; then
  set -a
  . /etc/reg_engine/reg_engine.env
  set +a
fi
if [ "${REG_ENGINE_STORAGE_BACKEND:-local_filesystem}" != "local_filesystem" ]; then
  echo "Unsupported REG_ENGINE_STORAGE_BACKEND: ${REG_ENGINE_STORAGE_BACKEND}" >&2
  exit 1
fi
if [ -z "${REG_ENGINE_STORAGE_ROOT:-}" ]; then
  echo "REG_ENGINE_STORAGE_ROOT is not set; attachment uploads would fail." >&2
  exit 1
fi
if [ ! -d "$REG_ENGINE_STORAGE_ROOT" ]; then
  echo "REG_ENGINE_STORAGE_ROOT does not exist: $REG_ENGINE_STORAGE_ROOT" >&2
  exit 1
fi
case "$REG_ENGINE_STORAGE_ROOT" in
  "$REG_ENGINE_SERVER_REPO"|"$REG_ENGINE_SERVER_REPO"/*)
    echo "REG_ENGINE_STORAGE_ROOT must be outside the Git checkout." >&2
    exit 1
    ;;
esac
echo "attachment_storage_backend=${REG_ENGINE_STORAGE_BACKEND:-local_filesystem}"
echo "attachment_storage_root_configured=yes"
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
export REG_ENGINE_SERVER_REPO="$($config.ServerRepo)"

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
$storageCheck
"@

Invoke-RegEngineServerScript -Script $script

Write-Host ""
Write-Host "Server checks passed." -ForegroundColor Green
