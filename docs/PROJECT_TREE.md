# Project Tree

- Generated: 2026-06-28 00:34:02 +05:00
- Branch: main

## Entrypoints

- Backend app: `backend/app/main.py`
- Frontend app: `frontend/src/main.tsx`
- Local checks: `scripts/check.ps1`
- Server checks: `scripts/server-check.ps1`

## Available Commands

- `powershell -ExecutionPolicy Bypass -File scripts/check.ps1`
- `powershell -ExecutionPolicy Bypass -File scripts/test.ps1`
- `powershell -ExecutionPolicy Bypass -File scripts/lint.ps1`
- `powershell -ExecutionPolicy Bypass -File scripts/format.ps1 -Check`
- `powershell -ExecutionPolicy Bypass -File scripts/typecheck.ps1`

## Files

- `.editorconfig`
- `.env.example`
- `.github/workflows/ci.yml`
- `.gitignore`
- `.pre-commit-config.yaml`
- `AGENTS.md`
- `backend/alembic.ini`
- `backend/app/__init__.py`
- `backend/app/api/__init__.py`
- `backend/app/api/v1/__init__.py`
- `backend/app/api/v1/endpoints/__init__.py`
- `backend/app/api/v1/endpoints/health.py`
- `backend/app/api/v1/router.py`
- `backend/app/core/__init__.py`
- `backend/app/core/config.py`
- `backend/app/core/database.py`
- `backend/app/core/logging.py`
- `backend/app/domain/__init__.py`
- `backend/app/domain/constants.py`
- `backend/app/main.py`
- `backend/app/models/__init__.py`
- `backend/app/models/audit.py`
- `backend/app/models/base.py`
- `backend/app/models/card.py`
- `backend/app/models/identity.py`
- `backend/app/models/organization.py`
- `backend/app/models/public_link.py`
- `backend/app/models/reference.py`
- `backend/app/models/registry_schema.py`
- `backend/app/repositories/__init__.py`
- `backend/app/schemas/__init__.py`
- `backend/app/services/__init__.py`
- `backend/migrations/env.py`
- `backend/migrations/script.py.mako`
- `backend/migrations/versions/0001_database_foundation.py`
- `backend/migrations/versions/0002_core_schema_v1.py`
- `backend/migrations/versions/0003_reconcile_core_schema_v1.py`
- `backend/pyproject.toml`
- `backend/tests/__init__.py`
- `backend/tests/conftest.py`
- `backend/tests/test_config.py`
- `backend/tests/test_database_smoke.py`
- `backend/tests/test_healthcheck.py`
- `backend/tests/test_migrations.py`
- `backend/tests/test_models_smoke.py`
- `backend/tests/test_schema_constraints.py`
- `docs/ADR/0001-project-foundation.md`
- `docs/ARCHITECTURE.md`
- `docs/BASE.md`
- `docs/CODEX_PHASE_1A_PROMPT.md`
- `docs/CODEX_PROJECT_FOUNDATION_PROMPT.md`
- `docs/CODEX_WORKFLOW.md`
- `docs/CONVENTIONS.md`
- `docs/PROJECT_MAP.md`
- `docs/PROJECT_TREE.md`
- `docs/superpowers/plans/2026-06-26-dev-deploy-scripts.md`
- `docs/superpowers/specs/2026-06-26-dev-deploy-scripts-design.md`
- `frontend/.prettierignore`
- `frontend/.prettierrc`
- `frontend/eslint.config.mjs`
- `frontend/index.html`
- `frontend/package.json`
- `frontend/playwright.config.ts`
- `frontend/src/api/client.ts`
- `frontend/src/api/types.ts`
- `frontend/src/App.test.tsx`
- `frontend/src/App.tsx`
- `frontend/src/app/AppProviders.tsx`
- `frontend/src/app/router.tsx`
- `frontend/src/components/common/.gitkeep`
- `frontend/src/components/layout/.gitkeep`
- `frontend/src/features/cards/.gitkeep`
- `frontend/src/features/organizations/.gitkeep`
- `frontend/src/features/registry/.gitkeep`
- `frontend/src/main.tsx`
- `frontend/src/pages/HomePage.tsx`
- `frontend/src/styles/globals.css`
- `frontend/src/test/setup.ts`
- `frontend/src/vite-env.d.ts`
- `frontend/tests/e2e/smoke.spec.ts`
- `frontend/tsconfig.app.json`
- `frontend/tsconfig.json`
- `frontend/tsconfig.node.json`
- `frontend/vite.config.ts`
- `package.json`
- `PLANS.md`
- `pnpm-lock.yaml`
- `pnpm-workspace.yaml`
- `README.md`
- `scripts/check.ps1`
- `scripts/deploy.ps1`
- `scripts/dev-backend.ps1`
- `scripts/dev-cycle.ps1`
- `scripts/dev-frontend.ps1`
- `scripts/format.ps1`
- `scripts/lib/RegEngine.ps1`
- `scripts/lint.ps1`
- `scripts/project-map.ps1`
- `scripts/push-git.ps1`
- `scripts/server-check.ps1`
- `scripts/test.ps1`
- `scripts/tree.ps1`
- `scripts/typecheck.ps1`

## Ignored Or Generated

- `.git/`, `.venv/`, `node_modules/`, `dist/`, `coverage/`, `htmlcov/`, `logs/`, `artifacts/`, `uploads/`, `storage/`
