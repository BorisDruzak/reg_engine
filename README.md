# Registry Engine

Registry Engine is an extensible web engine for schema-driven registries.

This is not a hardcoded employee registry. The core rule is that an administrator creates registries and configures card structure through blocks and fields. Future users work with cards only through backend-enforced access rules.

## Product Direction

Target system:

- web panel;
- PostgreSQL server database;
- REST API;
- future MCP layer;
- users and roles;
- organization-based access;
- dynamic cards;
- configurable blocks and fields;
- audit log;
- import/export in later phases;
- documents and attachments in later phases.

## Critical Architecture Rules

1. Do not create a hardcoded `employees` table with fixed HR fields.
2. Card structure is defined through `registries`, `form_blocks`, and `form_fields`.
3. Future field values should be typed, for example `value_text`, `value_number`, `value_date`, `value_bool`, and `value_json`.
4. Adding a field must not require a database migration.
5. Old cards must not break after schema changes.
6. Access is checked on the backend.
7. Frontend may hide controls, but it is not the security boundary.
8. Future create/update/archive actions must write audit events.
9. Parent organization access does not imply child organization access without `include_descendants=true`.
10. Future MCP must call the API, not the database directly.

## Current Foundation

- Backend: FastAPI in `backend/`.
- Frontend: React + TypeScript + Vite in `frontend/`.
- Automation: PowerShell-first scripts in `scripts/` for the Codex Windows app.
- CI: GitHub Actions backend and frontend quality gates.
- Server: `/opt/reg_engine` on `registoryengine`.

## Local Setup

```powershell
cd C:\Users\admin-2\Documents\reg_engine
```

Backend:

```powershell
cd backend
python -m pip install -e ".[dev]"
```

Frontend:

```powershell
pnpm install
```

Playwright browser install for e2e:

```powershell
pnpm -C frontend exec playwright install chromium
```

## Main Scripts

| Purpose | Command |
| --- | --- |
| Full check | `powershell -ExecutionPolicy Bypass -File scripts/check.ps1` |
| Tests | `powershell -ExecutionPolicy Bypass -File scripts/test.ps1` |
| Tests with e2e | `powershell -ExecutionPolicy Bypass -File scripts/test.ps1 -E2E` |
| Lint | `powershell -ExecutionPolicy Bypass -File scripts/lint.ps1` |
| Format check | `powershell -ExecutionPolicy Bypass -File scripts/format.ps1 -Check` |
| Typecheck | `powershell -ExecutionPolicy Bypass -File scripts/typecheck.ps1` |
| Backend dev server | `powershell -ExecutionPolicy Bypass -File scripts/dev-backend.ps1` |
| Frontend dev server | `powershell -ExecutionPolicy Bypass -File scripts/dev-frontend.ps1` |
| Project map | `powershell -ExecutionPolicy Bypass -File scripts/project-map.ps1` |
| Server check | `powershell -ExecutionPolicy Bypass -File scripts/server-check.ps1` |
| Deploy | `powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1` |

## Direct Backend Commands

```powershell
cd backend
python -m pytest
ruff check .
ruff format --check .
mypy app
```

## Direct Frontend Commands

```powershell
pnpm -C frontend lint
pnpm -C frontend typecheck
pnpm -C frontend test:run
pnpm -C frontend build
pnpm -C frontend e2e
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

## Known Non-Goals For The Foundation Phase

- No auth.
- No RBAC.
- No registry/card/user business models.
- No business CRUD.
- No import/export.
- No document generation.
- No MCP.
- No MDB migration.

