# PLANS.md

## Project

Registry Engine is a configurable web engine for schema-driven registries. It is not a hardcoded employee registry.

## Current Status

Completed phases:

- Phase 1B: Core Schema v1 database foundation.
- Phase 1C: Organization tree and RBAC services.
- Phase 1D: Registry schema and dynamic cards.
- Phase 1E: Public links, transfer, and audit.
- Phase 1E.1: Core service hardening before API.
- Phase 1F: REST API foundation and service wiring.
- Phase 1G: Current API/service hardening.
- Phase 1H: Bootstrap and seed.
- Phase 1I: Login and session flow.
- Phase 1J: User and access management API.
- Phase 1K.1: Authenticated admin shell.
- Phase 1K.2: Registry and card frontend workflows.
- Phase 1K.3: Dynamic card form editing.
- Phase 1K.4: Public-link edit page.
- Phase 1K.5: Frontend browser validation pass.
- Phase 1K.6: Russian UI localization.
- Phase 1L.1: Plan and status cleanup.
- Phase 1L.2: Runtime configuration guardrails.
- Phase 1L.3: Login and session hardening.
- Phase 1L.4: Bootstrap UX hardening.
- Phase 1L.5: Frontend live integration validation.

The next active checkpoint is Phase 1L.6.

## Core Rules

- Keep the engine schema-driven.
- Do not create a hardcoded employee table.
- Do not add fixed HR-only fields.
- Keep card structure in registries, blocks, fields, and typed values.
- Keep backend access checks as the security boundary.
- Keep public-link editing backend-validated.
- Keep normal deletes as archive behavior.
- Keep the frontend Russian-first for user-facing text.
- Keep built-in UI display names for roles, permissions, statuses, validation, and API errors Russian-first.
- Keep visible demo/test names Russian unless a test intentionally verifies legacy stored text.

Phase 1K.6 delivered:

- Navigation, tables, panels, loading states, validation messages, and public-link screens use Russian text.
- Built-in role names and permission descriptions are Russian in seed data and in the frontend display layer.
- Frontend maps known backend/API error details to Russian browser messages.
- Technical codes such as `system_admin`, `users.manage`, field codes, registry codes, and route/API names remain unchanged.

## Phase 1L: Current Implementation Bugfix, Security, And Live Stabilization

Purpose: stabilize the current backend and frontend implementation before starting new product capabilities.

Status: in progress.

Phase 1L must not implement:

- import/export;
- documents;
- MCP;
- MDB migration;
- service desk integration;
- large new frontend product modules beyond refactoring and stabilization.

### Phase 1L.1: Plan And Status Cleanup

Status: completed.

Required work:

- Keep completed phase summaries accurate.
- Keep Phase 1L as the single active next checkpoint.
- Remove old wording where completed phases still look planned.

Acceptance criteria:

- This plan has one clear next phase.
- Completed phases are not duplicated as planned phases.

### Phase 1L.2: Runtime Configuration Guardrails

Status: completed.

Required work:

- Reject production-like runtime when development login/session configuration is still in use.
- Document required runtime configuration.
- Add tests.

Acceptance criteria:

- Production-like startup cannot use development-only login/session configuration.
- Development and test workflows remain convenient.

Delivered:

- Production-like `APP_ENV` values reject the built-in development `AUTH_TOKEN_SECRET` during app startup.
- Development and test startup still allow the default secret for local workflows.
- README documents the required runtime configuration.
- Tests cover both production-like rejection and development allowance.

### Phase 1L.3: Login And Session Hardening

Status: completed.

Required work:

- Add or confirm tests for modified session payload, expired session, wrong runtime configuration, inactive user, and malformed authorization header.
- Document the current session approach as a foundation implementation.
- Keep server-side session persistence deferred unless explicitly approved.
- Clarify logout limitation in README and PLANS.

Acceptance criteria:

- Login/session failure modes are deterministic and tested.
- Current logout limitation is visible.

Delivered:

- Added tests for modified session payloads, expired tokens, inactive token users, malformed authorization headers, and wrong runtime configuration.
- Existing disabled-user login and bad-token API behavior remains covered.
- README documents the current logout limitation: logout validates the bearer token and returns `{"status":"ok"}`, but server-side token revocation remains deferred.

### Phase 1L.4: Bootstrap UX Hardening

Status: completed.

Required work:

- Add a safer operator flow for first-admin bootstrap.
- Avoid storing private operator input in Git, logs, shell history, or planning files.
- Add tests for bootstrap idempotency and first-admin update behavior.

Acceptance criteria:

- A new deployment can create the first admin without manual SQL and without a fragile manual pre-step.

Delivered:

- Python bootstrap CLI supports `--password-hash-env` so the first-admin password hash can be read from an environment variable instead of process arguments.
- PowerShell bootstrap wrapper supports `-PasswordHashEnvVar`.
- CLI rejects missing env-var values and ambiguous direct/env-var password-hash sources.
- README documents the env-var flow and cleanup step.
- Existing bootstrap idempotency and first-admin update behavior remain covered; new CLI argument-resolution tests run without requiring PostgreSQL.

### Phase 1L.5: Frontend Live Integration Validation

Status: completed.

Required work:

- Validate frontend against a disposable or staging backend, not only a mock API.
- Use a test or staging database, not production.
- Verify login, organizations, registries, card list/read, dynamic field save, audit, and public-link edit.
- Record exact commands and results.

Acceptance criteria:

- Browser validation proves the real API contract.
- No production data is mutated.

Delivered:

- Added explicit `CORS_ALLOWED_ORIGINS` runtime configuration for browser frontends that call the API from another origin.
- Added CORS preflight regression coverage for `POST /api/v1/auth/login`.
- Fixed audit event API serialization for PostgreSQL `INET` values returned as `IPv4Address` objects.
- Added audit schema regression coverage for `AuditEventRead.ip_address`.
- Validated frontend against a real staging backend on `http://192.168.100.12:18080` and local Vite frontend on `http://127.0.0.1:5174`.
- Used disposable PostgreSQL database `reg_engine_test`; production `reg_engine` was not migrated or mutated.
- Verified real browser flows: login, organizations, registries, card list/read, dynamic field save, audit update visibility, and public-link edit.
- Stored ignored screenshots under `artifacts/phase-1l5/admin-live.png` and `artifacts/phase-1l5/public-live.png`.

Verification:

- `backend\.venv\Scripts\python.exe -m pytest backend\tests\test_config.py -q` -> 5 passed.
- `backend\.venv\Scripts\python.exe -m pytest backend\tests\test_audit_schema.py backend\tests\test_config.py -q` -> 6 passed.
- `powershell -ExecutionPolicy Bypass -File scripts\check.ps1 -SkipRemote` -> passed after CORS and audit fixes.
- `curl.exe -i -X OPTIONS http://192.168.100.12:18080/api/v1/auth/login -H "Origin: http://127.0.0.1:5173" -H "Access-Control-Request-Method: POST"` -> `200 OK` with `access-control-allow-origin`.
- `node tmp\phase1l5-live-validate.mjs` -> passed for real browser validation.
- `ssh root@registoryengine "cd /opt/reg_engine/backend && sudo -u postgres env TEST_DATABASE_URL='postgresql+psycopg:///reg_engine_test' .venv/bin/python -m pytest -p no:cacheprovider --tb=short"` -> 94 passed, 2 warnings.

### Phase 1L.6: Frontend Structure Refactor

Required work:

- Split large frontend code into feature modules for login, organizations, registries, cards, users, access, and audit.
- Keep UI Russian-first.
- Keep schema-driven card form logic generic.
- Preserve existing tests.

Acceptance criteria:

- No single frontend page owns all feature workflows.
- Unit, e2e, lint, typecheck, and format checks continue to pass.

### Phase 1L.7: Browser Storage Risk Decision

Required work:

- Decide whether browser storage remains acceptable for MVP session persistence.
- If kept, document the risk and mitigation assumptions.
- If changed, design the new session storage approach before implementation.

Acceptance criteria:

- The session storage decision is explicit before production frontend hosting.

### Phase 1L.8: Repository Visibility And Infrastructure Exposure

Required work:

- Decide whether the GitHub repository must be private.
- If the repository remains public, reduce unnecessary internal infrastructure details from documentation.
- Do not commit private operational material.

Acceptance criteria:

- Public documentation does not expose unnecessary infrastructure details.
- Private repository decision is recorded if chosen.

## Planned Phases After Phase 1L

- Phase 2: Documents.
- Phase 3: Import and export.
- Phase 4: Reports.
- Phase 5: MCP over API only.

## Verification

Required checks for each implementation checkpoint:

- local backend checks;
- PostgreSQL-backed tests against a disposable test database where applicable;
- frontend lint, typecheck, unit tests, e2e tests, and format checks where applicable;
- project map update/check;
- README and PLANS update.
