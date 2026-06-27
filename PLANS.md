# PLANS.md

## Project

Registry Engine is an extensible web engine for schema-driven registries.

The system must not become a hardcoded employee registry. Old Access/MDB data can be used as domain reference later, but the new system must be a configurable engine where card structure is defined through blocks and fields.

## Current Phase

Phase 1A: Project Foundation Tooling completed locally.

## Phase 0: Repository, Connectivity, And Server Preparation

- [x] GitHub repository exists: `BorisDruzak/reg_engine`.
- [x] README.md created/updated.
- [x] AGENTS.md exists.
- [x] `.gitignore` exists.
- [x] Operational scripts are documented in README/AGENTS.
- [x] `.env.example` exists.
- [x] Codex Phase 1A prompt exists: `docs/CODEX_PHASE_1A_PROMPT.md`.
- [x] Server SSH access works for `root@registoryengine`.
- [x] Server checkout exists at `/opt/reg_engine`.
- [x] PostgreSQL 16 is active on `registoryengine`.

## Phase 1A: Project Foundation Tooling

### Goal

Create the technical foundation without registry business logic.

### Completed

- [x] Backend skeleton under `backend/`.
- [x] FastAPI app factory and application entrypoint.
- [x] Settings module with optional `DATABASE_URL`.
- [x] Database placeholder helper.
- [x] Logging helper.
- [x] `GET /health`.
- [x] `GET /api/v1/health`.
- [x] Backend pytest healthcheck tests.
- [x] Backend ruff configuration.
- [x] Backend mypy configuration.
- [x] Frontend React + TypeScript + Vite skeleton under `frontend/`.
- [x] Frontend app provider and router shell.
- [x] Frontend unit smoke test.
- [x] Frontend Playwright e2e smoke test.
- [x] Root pnpm workspace and root command orchestrator.
- [x] PowerShell scripts for check, test, lint, format, typecheck, dev servers, project tree, server check, push, deploy, and dev cycle.
- [x] Project navigation docs.
- [x] ADR 0001 for project foundation.
- [x] GitHub Actions CI workflow.
- [x] `.env.example`, `.editorconfig`, and pre-commit config.

### Non-goals Kept

- [x] No auth implementation.
- [x] No RBAC implementation.
- [x] No users/organizations/registries/cards business models.
- [x] No business CRUD.
- [x] No import/export.
- [x] No document generation.
- [x] No MCP.
- [x] No MDB migration.

## Known Limitations

- Healthcheck intentionally does not depend on PostgreSQL.
- Backend tests currently cover only healthcheck foundation behavior.
- Frontend is a placeholder shell only.
- Playwright e2e requires local browser install with `pnpm -C frontend exec playwright install chromium`.
- Server `/opt/reg_engine` may need deployment after this branch is pushed.

## Phase 1B: Core Schema Design Before Models

### Goal

Design the schema-driven registry data model before implementing migrations.

### Future Models

- users
- organizations
- registries
- form_blocks
- form_fields
- cards
- card_block_instances
- field_values
- roles
- permissions
- role_permissions
- access_grants
- audit_events

### Required Rules

1. Do not create a hardcoded employee table with fixed HR fields.
2. Use schema-driven cards.
3. Use typed field values.
4. Use soft delete/archive for cards, blocks, fields, and organizations.
5. Keep all database changes under Alembic migrations.

## Later Phases

- Phase 1C: Registry schema API.
- Phase 1D: Cards and dynamic values.
- Phase 1E: Permissions and audit.
- Phase 1F: Minimal schema-driven frontend.
- Phase 2: Documents.
- Phase 3: Import/export.
- Phase 4: Reports.
- Phase 5: MCP over API only.

## Global Non-goals Until Explicitly Requested

- Do not migrate MDB data.
- Do not integrate with the helpdesk repository.
- Do not add real personal data.
- Do not store secrets in Git.
- Do not bypass API with MCP or scripts.

