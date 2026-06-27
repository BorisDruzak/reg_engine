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
- Database foundation: SQLAlchemy Base, database engine/session helpers, and Alembic setup.
- Core Schema v1: SQLAlchemy models and Alembic migration for the final table set.
- Current backend scope has healthcheck, database infrastructure, Core Schema v1 models/migrations, and service-layer behavior for organization/RBAC, registry schema, dynamic cards, public links, transfer, and audit.
- REST API endpoints, auth flow, production frontend workflows, import/export, documents, and MCP are later phases.

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
| Local-only check | `powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote` |
| Tests | `powershell -ExecutionPolicy Bypass -File scripts/test.ps1` |
| Tests with e2e | `powershell -ExecutionPolicy Bypass -File scripts/test.ps1 -E2E` |
| Lint | `powershell -ExecutionPolicy Bypass -File scripts/lint.ps1` |
| Format check | `powershell -ExecutionPolicy Bypass -File scripts/format.ps1 -Check` |
| Typecheck | `powershell -ExecutionPolicy Bypass -File scripts/typecheck.ps1` |
| Backend dev server | `powershell -ExecutionPolicy Bypass -File scripts/dev-backend.ps1` |
| Frontend dev server | `powershell -ExecutionPolicy Bypass -File scripts/dev-frontend.ps1` |
| Project map | `powershell -ExecutionPolicy Bypass -File scripts/project-map.ps1` |
| Server check | `powershell -ExecutionPolicy Bypass -File scripts/server-check.ps1` |
| Push main | `powershell -ExecutionPolicy Bypass -File scripts/push-git.ps1 -Message "<message>"` |
| Deploy main | `powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1` |

This project uses one long-lived branch: `main`. After a verified implementation checkpoint, commit the scoped local changes, push `main` to GitHub, update `/opt/reg_engine` from `origin/main`, and run non-mutating server checks. Production PostgreSQL schema migrations require separate explicit approval.

## Direct Backend Commands

```powershell
cd backend
python -m pytest
ruff check .
ruff format --check .
mypy app
```

## Database Migration Commands

Core Schema v1 uses Alembic under `backend/migrations`.

Render migration SQL without changing a database:

```powershell
cd backend
python -m alembic upgrade head --sql
```

Apply migrations to the configured PostgreSQL database:

```powershell
cd backend
$env:DATABASE_URL = "postgresql+psycopg://<user>:<password>@<host>:5432/<database>"
python -m alembic upgrade head
```

Create a new autogenerate revision after model changes:

```powershell
cd backend
$env:DATABASE_URL = "postgresql+psycopg://<user>:<password>@<host>:5432/<database>"
python -m alembic revision --autogenerate -m "<message>"
```

Local migration tests render PostgreSQL SQL offline and do not connect to the production server. For a real upgrade test, point `TEST_DATABASE_URL` to a disposable PostgreSQL database, not `reg_engine` production:

```powershell
cd backend
$env:TEST_DATABASE_URL = "postgresql+psycopg://<user>:<password>@<host>:5432/<test_database>"
python -m alembic upgrade head
```

Core schema DB smoke tests use the same `TEST_DATABASE_URL` and reset the `public` schema in that database. The database name must end with `_test`, for example `reg_engine_test`:

```powershell
cd backend
$env:TEST_DATABASE_URL = "postgresql+psycopg://<user>:<password>@<host>:5432/reg_engine_test"
python -m pytest tests/test_database_smoke.py -q
```

Do not commit real database passwords. Server schema migration is a separate explicit approval step.

## Env Loading Strategy

Backend settings load direct environment variables first. For local development, `backend/.env` may provide defaults and must not contain committed secrets.

For server/runtime use, keep secrets outside the repository and point the backend to that file:

```powershell
$env:REG_ENGINE_ENV_FILE = "C:\path\to\reg_engine.env"
```

On `registoryengine`, the intended runtime file is:

```text
/etc/reg_engine/reg_engine.env
```

Alembic resolves database configuration in this order:

1. `TEST_DATABASE_URL`
2. `DATABASE_URL`
3. `REG_ENGINE_ENV_FILE` through backend settings
4. `backend/alembic.ini` fallback URL

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

Use `scripts/check.ps1 -SkipRemote` when you need local lint/typecheck/test/build checks without GitHub SSH or server SSH reachability.

## Server

- SSH target: `root@registoryengine`
- Server checkout: `/opt/reg_engine`
- GitHub remote: `git@github.com:BorisDruzak/reg_engine.git`
- PostgreSQL: `192.168.100.12:5432`, database `reg_engine`, role `reg_engine_admin`

## Known Remaining Non-Goals After Core Schema v1 Service Layer

- No auth flow yet.
- No REST API CRUD endpoints yet.
- No production frontend workflows yet.
- No import/export.
- No document generation.
- No MCP.
- No MDB migration.

Phase 1B through Phase 1E completed the Core Schema v1 database and backend service layer. REST API endpoints, authentication, production UI, import/export, documents, and MCP remain later phases.
