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
- Phase 1L.6: Frontend structure refactor and full Russian UI naming.
- Phase 1L.7: Browser storage risk decision.
- Phase 1L.8: Repository visibility and infrastructure exposure.
- Phase 2.0: Documents product scope decision.
- Phase 2A: Document storage architecture.
- Phase 2B: Attachment backend foundation.

Phase 1L is complete. Phase 2 has started with card-level attachments first. Phase 2.0, Phase 2A, and Phase 2B are complete. The next phase must be selected explicitly because generated documents, `file_ref`, public-link file flows, and frontend attachment UI remain deferred.

## Core Rules

- Keep the engine schema-driven.
- Do not create a hardcoded employee table.
- Do not add fixed HR-only fields.
- Keep card structure in registries, blocks, fields, and typed values.
- Keep backend access checks as the security boundary.
- Keep public-link editing backend-validated.
- Keep normal deletes as archive behavior.
- Keep the frontend Russian-first for user-facing text.
- Keep the visible product name in UI as `Реестровая система`; keep `Registry Engine` only for technical project/repository context.
- Keep browser-visible metadata Russian: `html lang="ru"` and page title `Реестровая система`.
- Keep built-in UI display names for roles, permissions, statuses, validation, and API errors Russian-first.
- Keep known built-in system user names localized in UI, for example `System Admin` -> `Системный администратор`.
- Keep technical role/permission/field/registry codes secondary in UI, under the Russian label `Технический код`, when they must be visible.
- Keep visible demo/test names Russian unless a test intentionally verifies legacy stored text.
- Keep browser `localStorage` bearer-token persistence limited to MVP/internal staging until a production session persistence phase replaces it.
- Keep Phase 2 document work attachment-first until generated documents are explicitly started in Phase 2C.
- Keep Phase 2 storage roots and operational values outside Git.
- Keep public-link upload/download and `file_ref` deferred until their later approved phases.

Phase 1K.6 delivered:

- Navigation, tables, panels, loading states, validation messages, and public-link screens use Russian text.
- The visible product name in UI is `Реестровая система`.
- Built-in role names and permission descriptions are Russian in seed data and in the frontend display layer.
- Browser metadata uses Russian language and title.
- Technical codes remain available as secondary diagnostic text under `Технический код`.
- Known built-in system user names are localized in the frontend display layer.
- Frontend maps known backend/API error details to Russian browser messages.
- Technical codes such as `system_admin`, `users.manage`, field codes, registry codes, and route/API names remain unchanged.

## Phase 1L: Current Implementation Bugfix, Security, And Live Stabilization

Purpose: stabilize the current backend and frontend implementation before starting new product capabilities.

Status: completed.

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
- Validated frontend against a configured staging backend and local Vite frontend.
- Used disposable PostgreSQL database `reg_engine_test`; production `reg_engine` was not migrated or mutated.
- Verified real browser flows: login, organizations, registries, card list/read, dynamic field save, audit update visibility, and public-link edit.
- Stored ignored screenshots under `artifacts/phase-1l5/admin-live.png` and `artifacts/phase-1l5/public-live.png`.
- Concrete staging URLs and SSH/database targets are intentionally not recorded in public documentation.

Verification:

- `backend\.venv\Scripts\python.exe -m pytest backend\tests\test_config.py -q` -> 5 passed.
- `backend\.venv\Scripts\python.exe -m pytest backend\tests\test_audit_schema.py backend\tests\test_config.py -q` -> 6 passed.
- `powershell -ExecutionPolicy Bypass -File scripts\check.ps1 -SkipRemote` -> passed after CORS and audit fixes.
- CORS preflight against the configured staging API origin -> `200 OK` with `access-control-allow-origin`.
- `node tmp\phase1l5-live-validate.mjs` -> passed for real browser validation.
- PostgreSQL-backed tests on the configured runtime server against disposable `reg_engine_test` -> 94 passed, 2 warnings.

### Phase 1L.6: Frontend Structure Refactor

Status: completed.

Required work:

- Split large frontend code into feature modules for login, organizations, registries, cards, users, access, and audit.
- Keep UI Russian-first.
- Keep schema-driven card form logic generic.
- Preserve existing tests.

Acceptance criteria:

- No single frontend page owns all feature workflows.
- Unit, e2e, lint, typecheck, and format checks continue to pass.

Delivered:

- Split the authenticated admin UI into feature modules for auth/session, overview, organizations, registries/schema, cards/dynamic fields, users/roles, access grants, and audit.
- Kept `HomePage` as a shell for session state, active section state, and query orchestration only.
- Added a shared Russian UI product name: `Реестровая система`.
- Added shared Russian empty state text and hid unknown English API errors behind the localized generic request failure message.
- Kept dynamic card editing schema-driven through registry schema, blocks, block instances, fields, typed values, and reference-list options.
- Updated frontend unit and e2e coverage for Russian UI naming.

Verification:

- `pnpm -C frontend lint` -> passed.
- `pnpm -C frontend typecheck` -> passed.
- `pnpm -C frontend test:run` -> 6 passed.
- `pnpm -C frontend format:check` -> passed.
- `pnpm -C frontend e2e` -> 2 passed.
- `powershell -ExecutionPolicy Bypass -File scripts\check.ps1 -SkipRemote` -> passed.

### Phase 1L.7: Browser Storage Risk Decision

Status: completed.

Required work:

- Decide whether browser storage remains acceptable for MVP session persistence.
- If kept, document the risk and mitigation assumptions.
- If changed, design the new session storage approach before implementation.

Acceptance criteria:

- The session storage decision is explicit before production frontend hosting.

Decision:

- Keep current frontend `localStorage` session persistence only for MVP, local development, disposable tests, and internal staging.
- Do not treat `localStorage` bearer-token persistence as production-ready for externally hosted or untrusted-client deployments.
- Before production frontend hosting, replace it with server-side session or refresh-token persistence, hashed stored tokens, explicit logout revocation, httpOnly `Secure` `SameSite` cookies, short-lived access tokens, CSRF protection for cookie-authenticated unsafe methods, and session audit events.

Delivered:

- Added ADR 0002 for browser session storage.
- README documents the current `localStorage` behavior, logout limitation, MVP risk assumptions, and production replacement direction.
- AGENTS.md records the standing rule that current browser storage is MVP-only.

Verification:

- Documentation-only checkpoint; no backend, migration, auth-flow, or frontend UI code was changed.
- `powershell -ExecutionPolicy Bypass -File scripts\check.ps1 -SkipRemote` -> passed after documentation update.

### Phase 1L.8: Repository Visibility And Infrastructure Exposure

Status: completed.

Required work:

- Decide whether the GitHub repository must be private.
- If the repository remains public, reduce unnecessary internal infrastructure details from documentation.
- Do not commit private operational material.

Acceptance criteria:

- Public documentation does not expose unnecessary infrastructure details.
- Private repository decision is recorded if chosen.

Decision:

- GitHub API showed `BorisDruzak/reg_engine` is public at this checkpoint.
- The repository may remain public only if committed documentation and defaults do not expose concrete internal hostnames, LAN IP addresses, SSH users, private key paths, deploy-key values, database endpoints, or operator-only runbooks.
- If future work needs to keep concrete operational runbooks in Git, the repository must be made private first.

Delivered:

- Replaced concrete runtime server, SSH, checkout, and PostgreSQL details in public docs with placeholders and local-config guidance.
- Added ignored `scripts/local.reg_engine.psd1` support through `scripts/local.reg_engine.example.psd1` so operational values can stay machine-local.
- Kept GitHub remote, branch policy, and generic deploy workflow documented.
- Added ADR 0003 for repository visibility and operational details.

Verification:

- GitHub REST API check for `BorisDruzak/reg_engine` -> `private=false`, `visibility=public`.
- `rg` check across public docs/scripts found no concrete internal host/IP/user/path/deploy-key strings after redaction.
- `powershell -ExecutionPolicy Bypass -File scripts\check.ps1` -> passed with remote checks using ignored local config.

## Planned Phases After Phase 1L

- Phase 2: Documents and attachments.
- Phase 2C: Generated document templates. Requires explicit approval before implementation.
- Phase 2D: Frontend document workflows. Requires explicit approval before implementation.
- Phase 3: Import and export.
- Phase 4: Reports.
- Phase 5: MCP over API only.

## Phase 2: Documents And Attachments

Status: in progress.

Approval captured:

- Date: 2026-06-28.
- Scope: card-level attachments first; generated documents deferred.
- Storage: local filesystem backend through a storage abstraction, configured outside Git.
- Public links: no upload/download support in the first Phase 2 slice.
- `file_ref`: deferred until attachment metadata is stable.
- Archive/retention: archived attachments are hidden from normal active lists, preserved, and readable only as read-only archive records by actors who can read the card in the relevant scope.
- Malware scanning: enforcement deferred in Phase 2A; future scanner hook must be designed before upload endpoints are exposed.
- Implementation order: Phase 2A first, then Phase 2B; no upload endpoints or UI until Phase 2A is accepted.

Purpose:

- Add document and attachment capabilities without breaking schema-driven cards, organization-scoped access, audit logging, public-link rules, or the public-repository exposure rules.

Known inputs:

- `docs/BASE.md` reserves `file_ref` for the future documents phase.
- README identifies documents and attachments as later phases.
- Current Core Schema v1 has dynamic card fields but no document/file storage tables.
- `docs/ADR/0004-phase-2-documents-scope.md` records the accepted starting scope and storage direction.
- `docs/ADR/0005-attachment-storage-architecture.md` records the accepted attachment storage architecture.
- `docs/PHASE_2A_ATTACHMENT_ARCHITECTURE.md` records metadata schema, service boundary, access-control rules, scanner hook, and required Phase 2B tests.
- `docs/PHASE_2_APPROVAL_CHECKLIST.md` records the exact approval text and decisions needed to start implementation.

Non-goals until explicitly approved:

- No MDB migration.
- No import/export.
- No MCP.
- No hardcoded HR document templates.
- No committed binary document templates containing real personal data.
- No public operational storage credentials or bucket details in Git.

### Phase 2.0: Documents Product Scope Decision

Status: completed.

Required decisions:

- Attachments: whether users can upload files to cards.
- Generated documents: whether the system produces `.docx`, `.pdf`, or both from card data.
- Templates: whether templates are managed in UI, stored as files, or deferred.
- `file_ref`: whether dynamic fields should support file references in Phase 2.
- Public links: whether public-link users can upload or download documents.
- Retention: archived attachments are hidden from normal active lists, preserved, and readable only as read-only archive records by actors who can read the card in the relevant scope.

Proposed default if the user approves:

- Start with card-level attachments first.
- Use a storage abstraction with a local filesystem backend configured outside Git for MVP/internal staging.
- Defer generated `.docx`/`.pdf` documents until attachment metadata, authorization, archive behavior, and audit are proven.
- Add `file_ref` only after the attachment metadata model is stable.

Acceptance criteria:

- Scope is written in `PLANS.md` before code starts.
- Storage target and security assumptions are explicit.
- No implementation starts while these decisions are open.
- Approval text or equivalent user instruction is captured before Phase 2A starts.

Delivered:

- User approval captured on 2026-06-28.
- ADR 0004 converted to accepted.
- Attachment-first scope, local filesystem storage abstraction, public-link deferral, generated-document deferral, `file_ref` deferral, archive/retention behavior, and malware scanning deferral are recorded.

### Phase 2A: Document Storage Architecture

Status: completed.

Planned work after approval:

- Design storage abstraction for binary files and metadata.
- Decide future database tables for stored files and card attachment links.
- Explicitly defer generated-document and template metadata tables to Phase 2C.
- Define checksum, MIME type, file size, original filename, storage key, created_by, archived_at, and audit fields.
- Define access rules through card visibility and organization scope.
- Define malware scanning or explicitly defer it with risk notes.

Acceptance criteria:

- ADR records the storage decision.
- No secrets or concrete storage endpoints are committed.
- Tests cover metadata validation and access boundaries before upload endpoints are exposed.

Delivered:

- Added ADR 0005 for attachment storage architecture.
- Added `docs/PHASE_2A_ATTACHMENT_ARCHITECTURE.md` with metadata schema for future `stored_files` and `card_attachments`, service boundaries, access rules, scanner hook, audit rules, storage configuration, and required Phase 2B tests.
- Added `backend/tests/test_phase_2a_document_architecture.py` doc-guard coverage for the accepted decisions and required Phase 2B test matrix.
- No backend models, migrations, endpoints, upload flows, download flows, public-link file flows, generated-document code, or frontend attachment UI were added.

Verification:

- `backend\.venv\Scripts\python.exe -m pytest backend\tests\test_phase_2a_document_architecture.py -q` -> 2 passed.

### Phase 2B: Attachment Backend Foundation

Status: completed.

Planned work after approval:

- Add migrations and SQLAlchemy models for attachment metadata.
- Add service methods for upload metadata creation, read authorization, archive, and audit events.
- Add REST endpoints only after services and permission tests exist.
- Keep physical delete outside normal workflow.

Acceptance criteria:

- Users can attach files only to cards they can edit.
- Users can read/download files only for cards they can view.
- Archive preserves metadata and audit history.
- Tests cover denied parent/sibling branch access.

Delivered:

- Added `stored_files` and `card_attachments` SQLAlchemy models.
- Added Alembic revision `0005_attachments` through `backend/migrations/versions/0005_attachment_backend_foundation.py`.
- Added `AttachmentStorage`, `LocalFilesystemAttachmentStorage`, `DeferredMalwareScanner`, and `AttachmentService`.
- Added authenticated attachment endpoints for create/list/read/download/archive.
- Added external runtime settings for `REG_ENGINE_STORAGE_BACKEND`, `REG_ENGINE_STORAGE_ROOT`, `REG_ENGINE_MAX_ATTACHMENT_BYTES`, `REG_ENGINE_ATTACHMENT_ALLOWED_TYPES`, and `REG_ENGINE_MALWARE_SCANNER`.
- Added `python-multipart` for FastAPI multipart upload handling.
- Added audit events for `attachment_create`, `attachment_download`, and `attachment_archive`.
- Added metadata, migration, service, and authenticated API tests.

Still deferred:

- No frontend attachment UI.
- No public-link upload/download.
- No generated `.docx` / `.pdf` documents.
- No `file_ref` field type or dynamic file values.
- Malware scanner enforcement remains deferred; scanner status is recorded as `deferred` by the MVP scanner hook.

Verification:

- `backend\.venv\Scripts\python.exe -m pytest backend\tests\test_models_smoke.py backend\tests\test_migrations.py backend\tests\test_schema_constraints.py backend\tests\test_attachment_services.py -q` -> passed locally, PostgreSQL service tests skipped without `TEST_DATABASE_URL`.
- PostgreSQL-backed `backend\tests\test_attachment_services.py` against disposable `_test` database -> 14 passed.
- PostgreSQL-backed `backend\tests\test_api_phase_2b_attachments.py` against disposable `_test` database -> 2 passed.
- `powershell -ExecutionPolicy Bypass -File scripts\check.ps1 -SkipRemote` -> passed.
- `pnpm -C frontend e2e` -> 2 passed.
- Commit `5f03bc51` was pushed to `origin/main` and deployed to the runtime checkout.
- Runtime dependency sync installed `python-multipart` on the server backend environment.
- Production migration `0005_attachments` completed after fresh backup and preflight verified production was at `0004_core_service_hardening` and did not yet have `stored_files` / `card_attachments`.
- Production post-checks verified Alembic head `0005_attachments`, both attachment tables, and registered attachment API paths.
- Runtime attachment storage is configured outside Git, and `scripts/server-check.ps1` now verifies storage backend/root readiness.

### Phase 2C: Generated Document Templates

Planned work after approval:

- Decide template format and rendering engine.
- Store templates without real personal data.
- Render documents from schema-driven card data, not hardcoded employee columns.
- Record generated document metadata and audit events.

Acceptance criteria:

- Generated documents use registry schema and card values.
- Old cards with missing new fields render empty values safely.
- Template rendering errors are deterministic and localized in UI.

### Phase 2D: Frontend Document Workflows

Planned work after approval:

- Add Russian-first UI for attachments and generated documents.
- Keep document UI inside feature modules, not a monolithic route.
- Add upload/download/archive states and localized errors.
- Keep public-link document behavior aligned with approved Phase 2.0 scope.

Acceptance criteria:

- UI uses `Реестровая система` naming and Russian labels.
- No browser-visible raw English service errors.
- Frontend tests cover upload/download/archive or generated-document flows approved for Phase 2.

### Phase 2E: Document Security And Live Validation

Planned work after approval:

- Verify authorization on metadata, upload, download, archive, and generated-document reads.
- Run backend tests, frontend tests, project-map check, and storage smoke tests.
- If server storage is configured, validate against non-production or explicitly approved staging storage first.

Acceptance criteria:

- No production personal data is used in tests.
- No storage credentials are committed.
- Audit events exist for create/read-sensitive where required, archive, and generated-document operations.
- Deployment and server checks pass after implementation.

## Verification

Required checks for each implementation checkpoint:

- local backend checks;
- PostgreSQL-backed tests against a disposable test database where applicable;
- frontend lint, typecheck, unit tests, e2e tests, and format checks where applicable;
- project map update/check;
- README and PLANS update.
