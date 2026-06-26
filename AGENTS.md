# AGENTS.md

## Primary Instruction

Before changing code, read:

1. `README.md`
2. `PLANS.md`
3. this `AGENTS.md`

This project is **Registry Engine**: an extensible web-based registry platform with dynamic card schemas, organization-scoped access control, audit logging, REST API, and future MCP support.

It is **not** a hardcoded employee registry. Do not create fixed employee columns for business fields such as full_name, birth_date, education, qualification, experience, awards, service history, or dismissal details except for minimal system-level display/search columns explicitly required by the plan.

---

## Critical Architecture Contract

1. Use schema-driven cards:
   - `registries`
   - `form_blocks`
   - `form_fields`
   - `cards`
   - `card_block_instances`
   - `field_values`

2. Do not hardcode business fields in backend or frontend.

3. Use typed field values:
   - `value_text`
   - `value_number`
   - `value_date`
   - `value_bool`
   - `value_json`

4. Do not physically delete blocks, fields, cards, organizations, files, or users by default. Use `is_active`, `archived_at`, or soft-delete.

5. All access control must be enforced on the backend. Frontend checks are only UX hints.

6. Parent organization access does not imply child organization access unless `include_descendants=true`.

7. Every create/update/archive action must write `audit_events`.

8. API is the single business-logic boundary. Future MCP must call API, not the database directly.

9. Do not store secrets, real personal data, `.env`, database dumps, MDB/ACCDB files, private SSH keys, or runtime logs in Git.

10. Prefer small, reviewable changes. Do not make large unrelated rewrites.

---

## Phase 1 Scope

Implement gradually:

- backend foundation;
- users;
- organizations;
- registries;
- form blocks;
- form fields;
- cards;
- field values;
- access grants;
- audit log;
- minimal schema-driven frontend.

Do not implement in Phase 1 unless explicitly requested:

- MDB migration;
- service desk integration;
- import/export;
- documents;
- complex reports;
- MCP write tools;
- production UI polish.

---

## Required Backend Tests

The project must accumulate tests for:

- healthcheck;
- create registry;
- create block;
- create field;
- create card;
- update field values;
- add field after card exists;
- old card shows new field as empty;
- user without access cannot see card;
- user with organization access can see card;
- parent org without descendants cannot see child cards;
- parent org with descendants can see child cards;
- user without `field.edit` cannot update values;
- audit event is written on create/update/archive.

---

## Development Workflow

Before editing:

1. Inspect the current tree.
2. Read `PLANS.md`.
3. Check current git state.
4. State the intended file changes briefly.
5. Make focused changes.
6. Run relevant checks/tests.
7. Update `PLANS.md` if scope, status, commands, or known limitations changed.
8. Summarize what changed and what remains.

Do not revert or delete unrelated local changes.

---

## Persistent User Context

- The user works in the Codex Windows app, not necessarily Codex CLI.
- The in-app terminal is PowerShell unless the user says otherwise.
- Prefer configuring MCP servers through `C:\Users\admin-2\.codex\config.toml` or the app settings UI, not via `codex ...` commands, unless the CLI is explicitly installed.
- Primary use cases: browser automation and Python development.
- For browser automation, prefer the existing Playwright MCP setup when `Node.js`/`npx` is available.

---

## Project Environment

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

---

## SSH Access

Local SSH config file:

```text
C:\Users\admin-2\.ssh\config
```

Expected host alias:

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

Verify user access:

```powershell
ssh -o BatchMode=yes osn_admin@registoryengine "whoami; hostname; id -u"
```

Verify root access:

```powershell
ssh -o BatchMode=yes root@registoryengine "whoami; hostname; id -u"
```

Root SSH access is allowed only by key. Do not enable password login for `root`.

Expected server SSH settings:

```text
PermitRootLogin without-password
PubkeyAuthentication yes
```

---

## GitHub Access

- GitHub SSH access must use `git@github.com`.
- Local GitHub SSH authentication is configured on the Windows machine.
- Server GitHub SSH authentication uses a separate deploy key stored on `registoryengine`.
- Do not copy private SSH keys from Windows to the server.

Verify GitHub auth:

```powershell
ssh -T git@github.com
```

Verify repository access:

```powershell
git ls-remote git@github.com:BorisDruzak/reg_engine.git
```

Local repository remote must be:

```powershell
git remote add origin git@github.com:BorisDruzak/reg_engine.git
```

If `origin` already exists, verify it:

```powershell
git remote -v
```

### Server GitHub Deploy Key

- Server private deploy key path: `/root/.ssh/reg_engine_github_ed25519`
- Server SSH config path: `/root/.ssh/config`
- Public deploy key value:

```text
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIBIy27sDRrcdIMfLCNFtDotv6L19RJkwM5lHHnC7j+aJ reg_engine@registoryengine
```

This public key must be added to GitHub repository deploy keys for `BorisDruzak/reg_engine`.
Read-only deploy key access is enough for server pulls. Write access is not required for runtime deployment.

Verify server GitHub access after the deploy key is added:

```bash
ssh root@registoryengine "ssh -T git@github.com"
ssh root@registoryengine "cd /opt/reg_engine && git fetch origin"
```

---

## Code Transfer Rules

GitHub is the source of truth for code transfer.

Prefer project scripts for routine checks, pushes, and deploys.

Local development flow:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/check.ps1
powershell -ExecutionPolicy Bypass -File scripts/push-git.ps1 -Message "<message>"
```

Server update flow:

```bash
ssh root@registoryengine
mkdir -p /opt/reg_engine
cd /opt/reg_engine
git remote -v
git fetch origin
git checkout main
git pull --ff-only origin main
```

Preferred scripted server update flow:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1
```

Do not copy code manually with ad hoc file moves unless GitHub is unavailable.
If server files differ from Git, inspect with `git status --short --branch` before overwriting.
Runtime commands must be executed on `registoryengine`, not from the Windows workspace.

---

## Development Scripts

- `scripts/check.ps1` runs local Git, GitHub SSH, server SSH, and Python syntax checks.
- `scripts/server-check.ps1` verifies the server checkout, server GitHub access, PostgreSQL service, listen sockets, and database access.
- `scripts/push-git.ps1 -Message "<message>"` stages, commits, and pushes local changes to `origin/main`.
- `scripts/deploy.ps1` updates `/opt/reg_engine` from `origin/main` and runs server checks.
- `scripts/dev-cycle.ps1 -Message "<message>"` runs the normal full loop: check, push, deploy, server-check.
- Shared PowerShell helpers live in `scripts/lib/RegEngine.ps1`.
- Scripts must not contain secrets. Use local environment variables or `/etc/reg_engine/reg_engine.env` for runtime passwords.

---

## PostgreSQL Rules

- PostgreSQL runs on `registoryengine`.
- Project database: `reg_engine`.
- Project admin role: `reg_engine_admin`.
- PostgreSQL listens on localhost and the server LAN address.
- Remote PostgreSQL access is limited to the LAN subnet `192.168.100.0/24`.
- Use password authentication over TCP. Do not use `trust` authentication for remote connections.
- Do not store the PostgreSQL password in this file or commit it to Git.

Current server listen sockets:

```text
127.0.0.1:5432
192.168.100.12:5432
```

Verify local server access:

```bash
sudo -u postgres psql -d reg_engine -c "select current_database(), current_user;"
```

Verify TCP access from the server:

```bash
PGPASSWORD='<password>' psql -h 127.0.0.1 -U reg_engine_admin -d reg_engine -c "select current_database(), current_user;"
```

Verify TCP access from Windows when `psql` is available locally:

```powershell
$env:PGPASSWORD = '<password>'
psql -h registoryengine -U reg_engine_admin -d reg_engine -c "select current_database(), current_user;"
```

---

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

After config changes:

```bash
sudo systemctl restart postgresql
sudo systemctl status postgresql --no-pager
```
