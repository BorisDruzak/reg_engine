# AGENTS.md

## Persistent user context

- The user works in the Codex Windows app, not Codex CLI.
- The in-app terminal is PowerShell unless the user says otherwise.
- Prefer configuring MCP servers through `C:\Users\admin-2\.codex\config.toml` or the app settings UI, not via `codex ...` commands, unless the CLI is explicitly installed.
- Primary use cases: browser automation and Python development.
- For browser automation, prefer the existing Playwright MCP setup when `Node.js`/`npx` is available.

## Project

- Local workspace: `C:\Users\admin-2\Documents\reg_engine`
- GitHub repository: `git@github.com:BorisDruzak/reg_engine.git`
- Local default branch: `main`
- Local Git remote: `origin`
- Runtime server: `registoryengine`
- Runtime server IP: `192.168.100.12`
- Server admin user: `osn_admin`
- Server root user: `root`
- Server code directory: `/opt/reg_engine`
- Server Git remote in `/opt/reg_engine`: `git@github.com:BorisDruzak/reg_engine.git`
- PostgreSQL host: `registoryengine`
- PostgreSQL port: `5432`
- PostgreSQL database: `reg_engine`
- PostgreSQL admin role for this project: `reg_engine_admin`
- PostgreSQL version on server: `16`

## SSH Access

- Local SSH config file: `C:\Users\admin-2\.ssh\config`
- Local key for server access: `C:\Users\admin-2\.ssh\id_ed25519`
- Server alias must be configured as:

```sshconfig
Host registoryengine
    HostName 192.168.100.12
    User osn_admin
    Port 22
    IdentityFile C:\Users\admin-2\.ssh\id_ed25519
    IdentitiesOnly yes
    ServerAliveInterval 30
    ServerAliveCountMax 3
```

- Verify user access:

```powershell
ssh -o BatchMode=yes osn_admin@registoryengine "whoami; hostname; id -u"
```

- Verify root access:

```powershell
ssh -o BatchMode=yes root@registoryengine "whoami; hostname; id -u"
```

- Root SSH access is allowed only by key. Do not enable password login for `root`.
- Expected server SSH settings:

```text
PermitRootLogin without-password
PubkeyAuthentication yes
```

## GitHub Access

- GitHub SSH access must use `git@github.com`.
- Local GitHub SSH authentication is configured on the Windows machine.
- Server GitHub SSH authentication uses a separate deploy key stored on `registoryengine`.
- Do not copy private SSH keys from Windows to the server.
- Verify GitHub auth:

```powershell
ssh -T git@github.com
```

- Verify repository access:

```powershell
git ls-remote git@github.com:BorisDruzak/reg_engine.git
```

- Local repository remote must be:

```powershell
git remote add origin git@github.com:BorisDruzak/reg_engine.git
```

- If `origin` already exists, verify it:

```powershell
git remote -v
```

### Server GitHub Deploy Key

- Server private deploy key path: `/root/.ssh/reg_engine_github_ed25519`
- Server SSH config path: `/root/.ssh/config`
- Server deploy key public value:

```text
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIBIy27sDRrcdIMfLCNFtDotv6L19RJkwM5lHHnC7j+aJ reg_engine@registoryengine
```

- This public key must be added to GitHub repository deploy keys for `BorisDruzak/reg_engine`.
- Read-only deploy key access is enough for server pulls. Write access is not required for runtime deployment.
- Verify server GitHub access after the deploy key is added:

```bash
ssh root@registoryengine "ssh -T git@github.com"
ssh root@registoryengine "cd /opt/reg_engine && git fetch origin"
```

## Local Change Rules

- Before editing, check current state:

```powershell
git status --short --branch
```

- Do not revert or delete unrelated local changes.
- Keep changes scoped to the requested task.
- Use `apply_patch` for manual file edits.
- Do not commit generated secrets, local passwords, `.env` files, private keys, dumps, or runtime logs.
- Keep `.gitignore` updated when new generated files, local artifacts, dumps, or secrets appear.
- Store runtime secrets outside Git. Use `.env` on the server or a systemd environment file with restricted permissions.
- Add or update docs when changing connection details, deployment steps, database schema, or runtime commands.
- Before handing off code, run the relevant tests or at least a syntax/import smoke check for the changed code.

## Code Transfer Rules

- GitHub is the source of truth for code transfer.
- Prefer the project scripts for routine checks, pushes, and deploys.
- Local development flow:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/check.ps1
powershell -ExecutionPolicy Bypass -File scripts/push-git.ps1 -Message "<message>"
```

- Server update flow:

```bash
ssh root@registoryengine
mkdir -p /opt/reg_engine
cd /opt/reg_engine
git remote -v
git fetch origin
git checkout main
git pull --ff-only origin main
```

- Preferred scripted server update flow:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1
```

- Do not copy code manually with ad hoc file moves unless GitHub is unavailable.
- If server files differ from Git, inspect with `git status --short --branch` before overwriting.
- Runtime commands must be executed on `registoryengine`, not from the Windows workspace.

## Server Runtime Rules

- Main server code lives in `/opt/reg_engine`.
- `/opt/reg_engine` is already initialized as a Git repository with `origin` set to `git@github.com:BorisDruzak/reg_engine.git`.
- Runtime services should run from the server checkout, not from the Windows workspace.
- Use root only for system setup, package installation, firewall, systemd, and database administration.
- Use a dedicated non-root service user for long-running application processes when the app service is created.
- Keep application logs under `/var/log/reg_engine` or another documented server path.
- Keep application environment files outside the repository, for example `/etc/reg_engine/reg_engine.env`.

## Development Scripts

- `scripts/check.ps1` runs local Git, GitHub SSH, server SSH, and Python syntax checks.
- `scripts/server-check.ps1` verifies the server checkout, server GitHub access, PostgreSQL service, listen sockets, and database access.
- `scripts/push-git.ps1 -Message "<message>"` stages, commits, and pushes local changes to `origin/main`.
- `scripts/deploy.ps1` updates `/opt/reg_engine` from `origin/main` and runs server checks.
- `scripts/dev-cycle.ps1 -Message "<message>"` runs the normal full loop: check, push, deploy, server-check.
- Shared PowerShell helpers live in `scripts/lib/RegEngine.ps1`.
- Scripts must not contain secrets. Use local environment variables or `/etc/reg_engine/reg_engine.env` for runtime passwords.

## PostgreSQL Rules

- PostgreSQL runs on `registoryengine`.
- Project database: `reg_engine`
- Project admin role: `reg_engine_admin`
- The project admin role is a PostgreSQL superuser for full project/database administration.
- PostgreSQL listens on localhost and the server LAN address.
- Remote PostgreSQL access is limited to the LAN subnet `192.168.100.0/24`.
- Use password authentication over TCP. Do not use `trust` authentication for remote connections.
- Do not store the PostgreSQL password in this file or commit it to Git.
- Current server listen sockets:

```text
127.0.0.1:5432
192.168.100.12:5432
```

- Verify local server access:

```bash
sudo -u postgres psql -d reg_engine -c "select current_database(), current_user;"
```

- Verify TCP access from the server:

```bash
PGPASSWORD='<password>' psql -h 127.0.0.1 -U reg_engine_admin -d reg_engine -c "select current_database(), current_user;"
```

- Verify TCP access from Windows when `psql` is available locally:

```powershell
$env:PGPASSWORD = '<password>'
psql -h registoryengine -U reg_engine_admin -d reg_engine -c "select current_database(), current_user;"
```

## PostgreSQL Server Setup Notes

- Package: `postgresql`
- Config directory is version-specific, for example `/etc/postgresql/16/main`.
- Required effective settings:

```text
listen_addresses = 'localhost,192.168.100.12'
password_encryption = scram-sha-256
```

- Required `pg_hba.conf` LAN rule:

```text
host    all             all             192.168.100.0/24          scram-sha-256
```

- After config changes:

```bash
sudo systemctl restart postgresql
sudo systemctl status postgresql --no-pager
```
