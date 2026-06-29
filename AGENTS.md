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

## UI Language Rules

- User-facing UI chrome must be Russian-first.
- The visible product name in UI must be `Реестровая система`; keep `Registry Engine` only for repository, code, API, and technical documentation context.
- Browser-visible metadata must be Russian: `html lang="ru"` and page title `Реестровая система`.
- Navigation labels must use these Russian names:
  - `Обзор`
  - `Организации`
  - `Реестры`
  - `Карточки`
  - `Пользователи`
  - `Доступ`
  - `Аудит`
- Common UI actions must use Russian labels, for example `Войти`, `Выйти`, `Сохранить`, `Сохранено`.
- User-facing entity names must use these Russian names:
  - Product: `Реестровая система`
  - Admin workspace: `Панель администратора`
  - Public card edit: `Публичное редактирование карточки`
  - Organization: `Организация`
  - Registry: `Реестр`
  - Card: `Карточка`
  - Form block: `Блок формы`
  - Form field: `Поле формы`
  - User: `Пользователь`
  - Role: `Роль`
  - Permission: `Право`
  - Access grant: `Право доступа`
  - Audit: `Аудит`
  - Public link: `Публичная ссылка`
  - Reference list: `Справочник`
- Tables, panels, empty states, loading states, validation messages, and public-link screens must use Russian text.
- Built-in user-facing role names, permission descriptions, status labels, and system display names must use Russian text in UI.
- Known built-in system user display names such as `System Admin` must be shown as `Системный администратор`; arbitrary user-entered names remain unchanged.
- When technical codes are visible for diagnostics, show the Russian label first and put codes under `Технический код`.
- Empty states must use Russian text, for example `Нет данных`.
- Frontend tests and demo fixtures must use Russian visible organization, registry, block, field, card, and user names unless the test intentionally checks legacy or user-entered foreign-language data.
- Backend/API error details shown in the browser must be mapped to Russian user-facing text; raw English service messages are not UI copy.
- Technical identifiers, permission codes, role codes, field codes, registry codes, API-provided names, and user-entered data may remain in their stored language.
- Do not hardcode business-specific Russian labels that imply a fixed HR/employee registry. Keep labels generic and schema-driven.

---

## Browser Session Rules

- Current frontend `localStorage` bearer-token persistence is allowed only for MVP, local development, disposable test environments, and internal staging.
- Do not call the current browser session approach production-ready.
- Before production frontend hosting, implement a replacement based on server-side session or refresh-token persistence, hashed stored tokens, explicit logout revocation, httpOnly `Secure` `SameSite` cookies, short-lived access tokens, CSRF protection for cookie-authenticated unsafe methods, and session audit events.
- Keep logout limitations documented until server-side revocation exists.
- Re-check `docs/ADR/0002-browser-session-storage.md` before adding features that increase browser XSS risk.

---

## Attachment Rules

- Keep Phase 2 attachment-first until generated documents are explicitly approved.
- Keep attachment storage behind the backend storage abstraction.
- Configure storage roots and limits outside Git, for example through `REG_ENGINE_STORAGE_ROOT`.
- Do not commit uploaded files, storage roots, bucket names, endpoints, credentials, or malware scanner secrets.
- Public links must not upload or download attachments until a later explicit phase approves that behavior.
- Do not add `file_ref` dynamic values until attachment metadata is accepted as stable.
- Malware scanning enforcement is deferred, but scanner status must be recorded through the scanner hook before uploaded files are exposed.

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
- Runtime server, SSH target, checkout path, PostgreSQL host, and PostgreSQL role must be configured outside Git through environment variables or ignored `scripts/local.reg_engine.psd1`.
- Public documentation must use placeholders for internal hostnames, LAN IP addresses, users, checkout paths, and database endpoints.
- The local ignored config may be created from `scripts/local.reg_engine.example.psd1`.

---

## SSH Access

Local SSH configuration is machine-local and must not be committed. Use a local SSH alias or `REG_ENGINE_SERVER_TARGET`.

Example host alias shape:

```sshconfig
Host <server-alias>
    HostName <server-host-or-ip>
    User <server-admin-user>
    Port 22
    IdentityFile <local-private-key-path>
    IdentitiesOnly yes
    ServerAliveInterval 30
    ServerAliveCountMax 3
```

Verify user access:

```powershell
ssh -o BatchMode=yes <server-admin-user>@<server-alias> "whoami; hostname; id -u"
```

Verify root access:

```powershell
ssh -o BatchMode=yes <server-root-target> "whoami; hostname; id -u"
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
- Server GitHub SSH authentication uses a separate deploy key stored on the configured runtime server.
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

- Server deploy-key paths and public key values are operational details and must not be documented in the public repository.
- Add the server public deploy key to GitHub repository deploy keys out-of-band.
- Read-only deploy key access is enough for server pulls. Write access is not required for runtime deployment.

Verify server GitHub access after the deploy key is added:

```bash
ssh <server-root-target> "ssh -T git@github.com"
ssh <server-root-target> "cd <server-checkout> && git fetch origin"
```

---

## Code Transfer Rules

GitHub is the source of truth for code transfer.

This project uses a single-branch workflow:

- `main` is the only long-lived local, GitHub, and server branch.
- Do not create feature branches unless the user explicitly requests a temporary exception.
- If a temporary branch is used, merge or fast-forward its work into `main`, then delete the temporary branch locally and on GitHub.
- Routine checks, pushes, and deploys must run from `main`.
- Server checkout configured by `REG_ENGINE_SERVER_REPO` or `scripts/local.reg_engine.psd1` must track `origin/main`.

Prefer project scripts for routine checks, pushes, and deploys.

Local development flow:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/check.ps1
powershell -ExecutionPolicy Bypass -File scripts/push-git.ps1 -Message "<message>"
```

After a verified implementation checkpoint, synchronize in this order unless the user explicitly requests local-only work:

1. Commit the scoped local changes.
2. Push `main` to GitHub.
3. Update the configured server checkout from `origin/main`.
4. Run server checks that do not mutate production data.

Production PostgreSQL migrations are allowed without an additional per-run question when all of these are true:

- the migration is explicitly included in the active `PLANS.md` phase or checkpoint;
- the migration has already passed against a disposable PostgreSQL database whose name ends with `_test`;
- the server checkout is synchronized to `origin/main`;
- a fresh production backup is created before applying the migration;
- duplicate/data preflight checks relevant to the migration pass;
- the migration command targets production `reg_engine` intentionally, not through `TEST_DATABASE_URL`;
- post-migration schema/status checks are run and recorded in `PLANS.md`.

This is the standing user approval for planned migrations. If any condition is missing or the migration is outside the active plan, stop and ask before changing production schema.

Use local-only checks when remote SSH/GitHub reachability is not part of the current task:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote
```

Server update flow:

```bash
ssh <server-root-target>
mkdir -p <server-checkout>
cd <server-checkout>
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
Runtime commands must be executed on the configured runtime server, not from the Windows workspace.

---

## Development Scripts

- `scripts/check.ps1` runs local Git, GitHub SSH, server SSH, Python syntax checks, backend checks, frontend checks, and project-map checks.
- `scripts/check.ps1 -SkipRemote` skips GitHub SSH and server SSH reachability while keeping local checks.
- `scripts/test.ps1` runs backend pytest and frontend unit tests; pass `-E2E` for Playwright.
- `scripts/lint.ps1` runs backend ruff and frontend eslint.
- `scripts/format.ps1 -Check` verifies backend ruff format and frontend prettier.
- `scripts/typecheck.ps1` runs backend mypy and frontend TypeScript checks.
- `scripts/project-map.ps1` generates or checks `docs/PROJECT_TREE.md`.
- `scripts/tree.ps1` prints a filtered project tree.
- `scripts/dev-backend.ps1` starts the FastAPI dev server.
- `scripts/dev-frontend.ps1` starts the Vite dev server.
- `scripts/server-check.ps1` verifies the server checkout, server GitHub access, PostgreSQL service, listen sockets, database access, and attachment storage configuration.
- `scripts/service.ps1` installs and controls the configured server systemd API service; use `-Command start`, `status`, `logs`, `restart`, or `stop`.
- `scripts/deploy-frontend.ps1` builds local `frontend/dist`, uploads the generated artifact to the configured server checkout, restarts the backend API service, and smoke-checks same-origin frontend/API serving.
- `scripts/push-git.ps1 -Message "<message>"` stages, commits, and pushes local changes to `origin/main`.
- `scripts/deploy.ps1` updates the configured server checkout from `origin/main` and runs server checks.
- `scripts/dev-cycle.ps1 -Message "<message>"` runs the normal full loop on `main`: check, push, deploy, server-check.
- Shared PowerShell helpers live in `scripts/lib/RegEngine.ps1`.
- Scripts must not contain secrets or private operational details. Use local environment variables, ignored `scripts/local.reg_engine.psd1`, or the server runtime environment file for runtime values.
- Backend runtime settings load direct environment variables first, then `backend/.env` by default.
- Set `REG_ENGINE_ENV_FILE=<server-env-file>` for server/runtime processes that should load an explicit external env file.
- Alembic uses `TEST_DATABASE_URL`, then `DATABASE_URL`, then `REG_ENGINE_ENV_FILE` through backend settings, then the `backend/alembic.ini` fallback URL.

---

## PostgreSQL Rules

- PostgreSQL runs on the configured runtime server.
- Project database and role are configured by local environment or ignored script config.
- PostgreSQL listens on localhost and the server LAN address.
- Remote PostgreSQL access is limited to the configured allowed LAN subnet.
- Use password authentication over TCP. Do not use `trust` authentication for remote connections.
- Do not store the PostgreSQL password in this file or commit it to Git.
- DB smoke tests that set `TEST_DATABASE_URL` must use a disposable database whose name ends with `_test`, for example `reg_engine_test`.
- `backend/tests/test_database_smoke.py` resets the `public` schema in `TEST_DATABASE_URL`; never point it at production `reg_engine`.

Expected server listen sockets:

```text
127.0.0.1:5432
<server-lan-address>:5432
```

Verify local server access:

```bash
sudo -u postgres psql -d <database> -c "select current_database(), current_user;"
```

Verify TCP access from the server:

```bash
PGPASSWORD='<password>' psql -h 127.0.0.1 -U <database-role> -d <database> -c "select current_database(), current_user;"
```

Verify TCP access from Windows when `psql` is available locally:

```powershell
$env:PGPASSWORD = '<password>'
psql -h <database-host> -U <database-role> -d <database> -c "select current_database(), current_user;"
```

---

## PostgreSQL Server Setup Notes

- Package: `postgresql`
- Config directory is version-specific, for example `/etc/postgresql/16/main`.
- Required effective settings:

```text
listen_addresses = 'localhost,<server-lan-address>'
password_encryption = scram-sha-256
```

- Required `pg_hba.conf` LAN rule:

```text
host    all             all             <allowed-lan-subnet>       scram-sha-256
```

After config changes:

```bash
sudo systemctl restart postgresql
sudo systemctl status postgresql --no-pager
```

## Foundation Phase Guardrails

- Do not add hardcoded employee models, tables, or UI pages.
- Do not implement auth, RBAC, registry CRUD, import/export, documents, MCP, service desk integration, or MDB migration in the foundation phase.
- Healthcheck endpoints must remain independent from PostgreSQL.
- Backend business logic should not live inside API route functions.
- Frontend business logic should not live inside visual components.
