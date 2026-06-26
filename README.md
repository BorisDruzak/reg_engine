# reg_engine

Development starts from the Codex Windows workspace:

```powershell
cd C:\Users\admin-2\Documents\reg_engine
```

## Main Commands

Run local checks:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/check.ps1
```

Run server checks:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/server-check.ps1
```

Commit and push changes:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/push-git.ps1 -Message "Describe the change"
```

Deploy the latest `origin/main` to `/opt/reg_engine`:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1
```

Run the full development cycle:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/dev-cycle.ps1 -Message "Describe the change"
```

## Database Check Password

The scripts do not store database passwords in Git. For full PostgreSQL TCP login checks, set the password in the current PowerShell session:

```powershell
$env:REG_ENGINE_PGPASSWORD = "<password>"
powershell -ExecutionPolicy Bypass -File scripts/server-check.ps1
```

The server can also keep the same value outside the repo in `/etc/reg_engine/reg_engine.env`.

## Server

- SSH target: `root@registoryengine`
- Server checkout: `/opt/reg_engine`
- GitHub remote: `git@github.com:BorisDruzak/reg_engine.git`
- PostgreSQL: `192.168.100.12:5432`, database `reg_engine`, role `reg_engine_admin`

