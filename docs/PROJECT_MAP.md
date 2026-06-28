# Project Map

## Purpose

Registry Engine is a schema-driven web foundation for configurable registries. It is not an employee registry and must not grow hardcoded employee-specific tables or UI flows.

## Current Phase

Project Foundation Tooling:

- FastAPI backend skeleton.
- React + TypeScript + Vite frontend skeleton.
- Healthcheck and smoke tests.
- PowerShell automation for Windows Codex workflow.
- Project navigation docs and CI.

## Main Entrypoints

- Backend app: `backend/app/main.py`
- Backend API v1 router: `backend/app/api/v1/router.py`
- Backend health endpoint: `backend/app/api/v1/endpoints/health.py`
- Frontend app: `frontend/src/main.tsx`
- Frontend root component: `frontend/src/App.tsx`
- Local checks: `scripts/check.ps1`
- Server deploy: `scripts/deploy.ps1`

## Backend Folder Map

- `backend/app/api/`: API route composition.
- `backend/app/core/`: settings, database connection helpers, logging.
- `backend/app/models/`: future SQLAlchemy models.
- `backend/app/schemas/`: future Pydantic request/response contracts.
- `backend/app/repositories/`: future persistence adapters.
- `backend/app/services/`: future business workflows.
- `backend/tests/`: pytest tests.

## Frontend Folder Map

- `frontend/src/app/`: providers and routing.
- `frontend/src/api/`: API client primitives and shared API types.
- `frontend/src/pages/`: route-level page shells.
- `frontend/src/components/`: shared UI components.
- `frontend/src/features/`: future domain feature folders.
- `frontend/src/test/`: test setup.
- `frontend/tests/e2e/`: Playwright tests.

## Scripts Map

- `scripts/check.ps1`: full local quality gate.
- `scripts/test.ps1`: backend pytest and frontend unit tests; e2e behind `-E2E`.
- `scripts/lint.ps1`: ruff and eslint.
- `scripts/format.ps1`: ruff format and prettier, with `-Check`.
- `scripts/typecheck.ps1`: mypy and TypeScript.
- `scripts/project-map.ps1`: generate/check `docs/PROJECT_TREE.md`.
- `scripts/tree.ps1`: print filtered project tree.
- `scripts/dev-backend.ps1`: start FastAPI dev server.
- `scripts/dev-frontend.ps1`: start Vite dev server.
- `scripts/server-check.ps1`: verify remote server and PostgreSQL.
- `scripts/deploy.ps1`: update the configured server checkout from GitHub.

## Test Strategy

- Backend healthcheck tests run without PostgreSQL.
- Frontend unit smoke test verifies the application shell renders.
- Playwright e2e smoke test verifies the Vite-rendered page.
- CI does not require PostgreSQL during this phase.

## Command Matrix

| Purpose | Command |
| --- | --- |
| Full local check | `powershell -ExecutionPolicy Bypass -File scripts/check.ps1` |
| Tests | `powershell -ExecutionPolicy Bypass -File scripts/test.ps1` |
| Tests with e2e | `powershell -ExecutionPolicy Bypass -File scripts/test.ps1 -E2E` |
| Lint | `powershell -ExecutionPolicy Bypass -File scripts/lint.ps1` |
| Format check | `powershell -ExecutionPolicy Bypass -File scripts/format.ps1 -Check` |
| Typecheck | `powershell -ExecutionPolicy Bypass -File scripts/typecheck.ps1` |
| Server check | `powershell -ExecutionPolicy Bypass -File scripts/server-check.ps1` |

## Where To Add New Backend Code

- New API endpoints go under `backend/app/api/v1/endpoints/`.
- Shared API routers are wired through `backend/app/api/v1/router.py`.
- Domain services go under `backend/app/services/`.
- Data access goes under `backend/app/repositories/`.
- SQLAlchemy models go under `backend/app/models/`.

## Where To Add New Frontend Code

- Route shells go under `frontend/src/pages/`.
- Domain modules go under `frontend/src/features/`.
- Shared reusable UI goes under `frontend/src/components/`.
- API client code goes under `frontend/src/api/`.

## Where Not To Put Business Logic

- Do not put business logic in React components.
- Do not put SQL access inside API route functions.
- Do not put registry/card business models in this foundation phase.
- Do not bypass backend APIs from future MCP integrations.

## Codex Navigation Rules

1. Read `AGENTS.md`, `PLANS.md`, and this file before large changes.
2. Check `git status --short --branch` before edits.
3. Extend existing `scripts/*.ps1`; do not replace them blindly.
4. Run the narrowest relevant script before broad checks.
5. Update `PLANS.md` and project docs when changing architecture or workflow.

