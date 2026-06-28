# PLANS.md

## Project

Registry Engine is a configurable web engine for schema-driven registries. It is not a hardcoded employee registry.

The system keeps card structure in registry metadata and dynamic typed values. Backend access checks are the security boundary. Frontend checks are UX hints only.

## Current Planning Scope

- This document is the active plan for Phase 1 Core Schema v1.
- Phase 1B through Phase 1I backend foundation, API hardening, bootstrap tooling, and auth flow is completed.
- Current next checkpoint is **Phase 1J: User And Access Management API**.
- Phase 1J must not start until Phase 1I code is synchronized and verified on the server checkout.
- Core Schema v1 must remain generic and schema-driven. Do not add fixed HR/business fields.
- Do not add service desk integration or MDB migration until explicitly requested.

## Current Phase Status

- Phase 1B.1 Database Foundation is completed.
- Phase 1B.2 Core Models And Migration is completed.
- Phase 1B.3 Model Smoke Tests are completed.
- Phase 1C Organization Tree And RBAC Services is completed and verified against server test database `reg_engine_test`.
- Phase 1D Registry Schema And Dynamic Cards is completed and verified against server test database `reg_engine_test`.
- Phase 1E Public Links, Transfer, Audit is completed and verified against server test database `reg_engine_test`.
- Phase 1E.1 Core Service Hardening Before API is completed and verified against server test database `reg_engine_test`.
- Phase 1F REST API Foundation And Service Wiring is completed and verified against server test database `reg_engine_test`.
- Phase 1G Current API/Service Bugfix And Hardening is completed and verified against disposable PostgreSQL database `reg_engine_test`.
- Phase 1H Bootstrap And Seed is completed and verified against disposable PostgreSQL database `reg_engine_test`.
- Phase 1I Auth And Session Flow is completed and verified against disposable PostgreSQL database `reg_engine_test`.
- Phase 1J User And Access Management API is the next planned implementation phase.
- Single-branch workflow is active: `main` is the only long-lived local, GitHub, and server branch.
- Synchronization checkpoint is carried on `main`: local `main`, GitHub `origin/main`, and server checkout `/opt/reg_engine` must stay aligned.
- Production PostgreSQL schema migration is completed through `0004_core_service_hardening`.
- Phase 1G did not require a database migration.
- Phase 1H did not require a database migration.
- Phase 1I did not require a database migration.
- Production backup before `0004`: `/var/backups/reg_engine/reg_engine_before_0004_20260628_085627.dump`, sha256 `60cee20a0343bdc96df6d0c7e247bd95789861f0277935eca6cbcf4f5a7fa288`.
- Production live schema compare against SQLAlchemy metadata passed after `0004`: 20/20 Core Schema v1 tables exist, no missing columns, no missing unique/check constraints, no missing indexes, no `employees` table, new scope-aware indexes exist, and obsolete constraints were removed.

## Core Architecture Decisions

1. Registry is the mechanism for organizing card lists, search, filters, display behavior, and access rules.
2. Card is the unit of content inside a registry.
3. Do not create a separate registry schema or separate database schema for each organization.
4. One `registry` can contain cards from different organizations.
5. Card visibility is determined by organization scope.
6. Organizations are hierarchical.
7. `org_admin` sees the assigned organization and all descendants.
8. `org_admin` does not see parent organizations or sibling branches.
9. `org_units` are departments/subdivisions used as filters and reference data; they are not an RBAC boundary in v1.
10. Only `system_admin` or `registry_admin` changes card schema.
11. `org_admin` manages cards and child organizations inside the assigned branch.
12. New fields appear in old cards as empty/null until a value is saved.
13. Fields, blocks, cards, and organizations are not physically deleted by normal business flows; they are archived.
14. `select` and `multi_select` fields use `reference_lists` and `reference_items`.
15. A public link edits the card directly through backend-validated public endpoints.
16. A public link lives for 7 days by default.
17. If `card.public_edit_enabled=false`, public-link editing is blocked.
18. Card transfer creates a new card.
19. The old card receives `lifecycle_status=superseded`.
20. The old card remains visible to the old `org_admin` in archive scope.
21. All create, update, archive, transfer, and public-link changes write `audit_events`.

## Core Schema v1 Model List

Core Schema v1 consists of these tables/models:

1. `users`
2. `roles`
3. `permissions`
4. `role_permissions`
5. `organizations`
6. `organization_closure`
7. `org_units`
8. `access_grants`
9. `registries`
10. `form_blocks`
11. `form_fields`
12. `reference_lists`
13. `reference_items`
14. `cards`
15. `card_block_instances`
16. `field_values`
17. `field_value_items`
18. `card_relations`
19. `card_public_links`
20. `audit_events`

## Data Model Rules

- Every main entity uses UUID primary keys.
- Use PostgreSQL `gen_random_uuid()` through `pgcrypto` for server-side UUID defaults.
- Use `created_at` and `updated_at` timestamps for mutable entities.
- Use `archived_at` for archive/soft-delete behavior.
- Use `timestamptz` for timestamp columns.
- Use `jsonb` for `*_json` fields.
- Avoid PostgreSQL enum types for business statuses; use `text` plus application constants and check constraints.
- Keep card structure schema-driven through `registries`, `form_blocks`, and `form_fields`.
- Store dynamic values in typed columns, for example `value_text`, `value_number`, `value_date`, `value_datetime`, `value_bool`, `value_json`, and reference FK columns.
- Do not add employee-specific fixed business columns such as education, awards, service history, dismissal details, or HR-only fields.

## Completed Phase Summary

### Phase 1B: Core Schema v1 Database Foundation

Status: completed.

Delivered:

- SQLAlchemy infrastructure.
- Alembic infrastructure.
- SQLAlchemy model declarations for all 20 Core Schema v1 tables.
- Core Schema v1 migration path through `0004_core_service_hardening`.
- Model/migration smoke tests.
- Healthcheck independent from PostgreSQL.

Verification highlights:

- Disposable PostgreSQL smoke tests passed against `reg_engine_test`.
- All 20 Core Schema v1 tables exist.
- `pgcrypto` is enabled.
- No `employees` table exists.
- No business-specific HR columns exist.

### Phase 1C: Organization Tree And RBAC Services

Status: completed.

Delivered:

- `OrganizationService`.
- `PermissionService`.
- `access_grants` behavior.
- `organization_closure` maintenance and subtree visibility.
- `org_units` as filters/reference data, not RBAC boundary.

Verified behavior:

- `system_admin` can create a root organization.
- `org_admin` can create/manage child organizations inside own subtree.
- `org_admin` cannot create or see sibling organizations.
- `org_admin` cannot see parent organizations.
- `org_admin` sees descendants.
- Exact organization grants work when `include_descendants=false`.

### Phase 1D: Registry Schema And Dynamic Cards

Status: completed.

Delivered:

- `RegistrySchemaService`.
- `ReferenceListService`.
- `CardService`.
- Dynamic typed field values.
- Card reads that merge schema plus existing values.
- Old cards show newly added fields as null/empty.
- `org_admin` manages cards in organization scope.
- `system_admin` / `registry_admin` manage schema.

Verified behavior:

- Registry is not duplicated per organization.
- One registry can contain cards from different organizations.
- Card visibility follows organization scope.
- Text/number/date/datetime/bool/json values save to correct typed columns.
- `select` values store `reference_items.id`.
- `multi_select` values store rows in `field_value_items`.
- Archived fields, blocks, cards, and organizations remain in the database.

### Phase 1E: Public Links, Transfer, Audit

Status: completed.

Delivered:

- `PublicLinkService`.
- Card transfer behavior.
- `AuditService`.
- Public edit rules.
- Public link token hashing.
- Default public link TTL of 7 days.
- Transfer by creating a new card and marking old card `superseded`.
- Audit events for create/update/archive/transfer/public-link changes.

Verified behavior:

- Public links return raw token once and store only token hash.
- Public links edit only public-editable blocks/fields.
- Public editing is blocked when `card.public_edit_enabled=false`.
- Transfer creates a new card and stores `card_relations`.
- Old `org_admin` sees old card in archive scope.

### Phase 1E.1: Core Service Hardening Before API

Status: completed.

Delivered:

- Fixed baseline migration strategy; `0002_core_schema_v1.py` must not call live model metadata at migration runtime.
- Added `0004_core_service_hardening.py` for constraint/index hardening.
- Ref field type persistence for `organization_ref`, `org_unit_ref`, `user_ref`, `card_ref`, and `registry_ref`.
- Repeatable block support through multiple `card_block_instances`.
- Nested card read structure: `blocks -> instances -> fields`.
- Read/edit split for cards; `superseded` cards are archive-readable only and not editable.
- Transfer copies dynamic values and multi-select items.
- Reference list inheritance/locking behavior.
- Scope-aware uniqueness for `access_grants` and `reference_lists`.
- Locked/system schema blocks and fields cannot be changed by normal service methods.
- Cached database engine/sessionmaker.

Verification:

```bash
cd /opt/reg_engine/backend
sudo -u postgres env TEST_DATABASE_URL='postgresql+psycopg:///reg_engine_test' .venv/bin/python -m pytest -q -p no:cacheprovider
```

Result at closeout: `42` PostgreSQL-backed backend tests passed against disposable database `reg_engine_test`.

Production migration completed after explicit approval:

```bash
cd /opt/reg_engine/backend
sudo -u postgres env DATABASE_URL='postgresql+psycopg:///reg_engine' .venv/bin/python -m alembic upgrade head
```

Result: production `alembic_version` is `0004_core_service_hardening`; post-migration schema compare passed.

### Phase 1F: REST API Foundation And Service Wiring

Status: completed.

Delivered:

- API session dependency using `backend/app/core/database.py`.
- Temporary actor context dependency using `X-Actor-User-Id` for tests/local development only.
- API schemas for organizations, registries, blocks, fields, reference lists/items, cards, public links, transfers, and audit event reads.
- REST endpoints that call the service layer instead of duplicating business rules.
- Service exceptions mapped to stable HTTP errors.
- Public link raw token returned one time in create-link response only.
- No database schema changes in Phase 1F.

Expected/current files:

- `backend/app/api/dependencies.py`
- `backend/app/api/v1/endpoints/_field_values.py`
- `backend/app/api/v1/endpoints/organizations.py`
- `backend/app/api/v1/endpoints/registries.py`
- `backend/app/api/v1/endpoints/cards.py`
- `backend/app/api/v1/endpoints/public_links.py`
- `backend/app/api/v1/endpoints/audit.py`
- `backend/app/schemas/organizations.py`
- `backend/app/schemas/registries.py`
- `backend/app/schemas/cards.py`
- `backend/app/schemas/public_links.py`
- `backend/app/schemas/audit.py`
- `backend/tests/test_api_phase_1f.py`

Verification completed:

```powershell
cd C:\Users\admin-2\Documents\reg_engine
powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote
```

Result: local backend, frontend, and project-map checks passed.

```bash
cd /opt/reg_engine/backend
sudo -u postgres env TEST_DATABASE_URL='postgresql+psycopg:///reg_engine_test' .venv/bin/python -m pytest -q -p no:cacheprovider
```

Result: `47` PostgreSQL-backed backend tests passed against disposable database `reg_engine_test`.

Known limitations at Phase 1F closeout:

- Temporary API actor context uses `X-Actor-User-Id`; this is not a production auth flow.
- API coverage is foundation-level service wiring for Core Schema v1 workflows.
- Some REST workflows are intentionally incomplete and must be hardened before frontend work.
- No frontend implementation, auth/session flow, import/export, documents, or MCP implementation was added in Phase 1F.
- No database migration is required for Phase 1F.

### Phase 1G: Current API/Service Bugfix And Hardening

Status: completed.

Delivered:

- Safe-by-default temporary actor header: `ALLOW_DEV_ACTOR_HEADER=false` blocks `X-Actor-User-Id`.
- Test/local actor injection remains available only when `ALLOW_DEV_ACTOR_HEADER=true`.
- Organization list/tree/update/archive endpoints.
- Registry read and registry schema read endpoints.
- Block update/archive endpoints.
- Field update/archive endpoints.
- Reference list read/list/update/archive endpoints.
- Reference item read/list/update/archive endpoints.
- Card list/update/archive endpoints with registry, organization, archive, and query filters.
- Repeatable card block instance create endpoint.
- Public link list and disable endpoints.
- Public link `expires_in_days` validation in the API/service range `1..30`.
- Public edit validates token usability before field lookup/coercion.
- Reference field target validation for organization, org unit, user, card, and registry refs before commit.
- Request metadata capture for audit events through API session context.
- Stable HTTP mapping for common integrity errors without raw database details.
- Phase 1G API regression tests.

Verification completed:

```powershell
cd C:\Users\admin-2\Documents\reg_engine
$env:TEST_DATABASE_URL = "postgresql+psycopg://<user>:<password>@192.168.100.12:5432/reg_engine_test"
backend\.venv\Scripts\python.exe -m pytest backend -q
backend\.venv\Scripts\ruff.exe check backend
backend\.venv\Scripts\ruff.exe format --check backend
backend\.venv\Scripts\mypy.exe backend\app
```

Result at local closeout: `54` PostgreSQL-backed backend tests passed against disposable database `reg_engine_test`; ruff check, ruff format check, and mypy passed.

Known limitations after Phase 1G:

- `X-Actor-User-Id` remains a temporary development/test mechanism only.
- No production auth/session flow has been added.
- No frontend implementation has been added.
- No import/export, documents, MCP, MDB migration, or service desk integration has been added.
- No database migration was required for Phase 1G.

### Phase 1H: Bootstrap And Seed

Status: completed.

Delivered:

- Idempotent bootstrap service for core permissions and roles.
- Seed roles:
  - `system_admin`;
  - `registry_admin`;
  - `org_admin`;
  - `auditor`.
- Seed permissions:
  - `organizations.manage`;
  - `registry.schema.manage`;
  - `cards.manage`;
  - `audit.read`;
  - `users.manage`;
  - `roles.read`;
  - `permissions.read`;
  - `access_grants.manage`.
- Missing `role_permissions` links are repaired by repeat seed runs.
- Repeatable first superadmin creation/update by email.
- Python CLI entrypoint: `python -m app.cli.bootstrap`.
- PowerShell wrapper: `scripts/bootstrap.ps1`.
- No database schema changes.

Verification completed:

```powershell
cd C:\Users\admin-2\Documents\reg_engine
$env:TEST_DATABASE_URL = "postgresql+psycopg://<user>:<password>@192.168.100.12:5432/reg_engine_test"
backend\.venv\Scripts\python.exe -m pytest backend\tests\test_bootstrap_seed.py -q
backend\.venv\Scripts\python.exe -m pytest backend -q
backend\.venv\Scripts\ruff.exe check backend
backend\.venv\Scripts\ruff.exe format --check backend
backend\.venv\Scripts\mypy.exe backend\app
```

Known limitations after Phase 1H:

- Password hashing is not implemented here; Phase 1I owns production auth/password flow.
- `audit.read`, `users.manage`, `roles.read`, `permissions.read`, and `access_grants.manage` are seeded for upcoming phases, but API enforcement for those workflows is still later.
- No production auth/session flow has been added.
- No frontend implementation has been added.
- No import/export, documents, MCP, MDB migration, or service desk integration has been added.
- No database migration was required for Phase 1H.

### Phase 1I: Auth And Session Flow

Status: completed.

Delivered:

- Password hashing with stdlib PBKDF2-SHA256 hashes.
- Login endpoint: `POST /api/v1/auth/login`.
- Bearer-token current user dependency.
- Signed token strategy controlled by `AUTH_TOKEN_SECRET` and `AUTH_ACCESS_TOKEN_MINUTES`.
- Current-user endpoint: `GET /api/v1/auth/me`.
- Logout placeholder endpoint: `POST /api/v1/auth/logout`.
- Protected endpoints prefer `Authorization: Bearer <token>`.
- `X-Actor-User-Id` remains disabled by default and works only when `ALLOW_DEV_ACTOR_HEADER=true`.
- Phase 1I auth regression tests.

Verification completed:

```powershell
cd C:\Users\admin-2\Documents\reg_engine
$env:TEST_DATABASE_URL = "postgresql+psycopg://<user>:<password>@192.168.100.12:5432/reg_engine_test"
backend\.venv\Scripts\python.exe -m pytest backend\tests\test_auth_phase_1i.py -q
backend\.venv\Scripts\python.exe -m pytest backend\tests\test_api_phase_1f.py backend\tests\test_api_phase_1g.py -q
backend\.venv\Scripts\python.exe -m pytest backend -q
backend\.venv\Scripts\ruff.exe check backend
backend\.venv\Scripts\ruff.exe format --check backend
backend\.venv\Scripts\mypy.exe backend\app
```

Known limitations after Phase 1I:

- Logout validates the token and returns `{"status":"ok"}`, but server-side token revocation storage is deferred.
- User, role, permission, and access-grant management APIs are still Phase 1J.
- No production frontend implementation has been added.
- No import/export, documents, MCP, MDB migration, or service desk integration has been added.
- No database migration was required for Phase 1I.

## Phase 1G: Current API/Service Bugfix And Hardening

Purpose: fix the current API/service correctness and security gaps before adding new product capabilities.

Status: completed.

Phase 1G must not implement:

- production frontend workflows;
- full auth/session flow;
- import/export;
- documents;
- MCP;
- service desk integration;
- MDB migration.

### Phase 1G.1: Temporary Actor Context Hardening

Problem:

- Current protected API endpoints accept `X-Actor-User-Id` as temporary actor identity.
- This is acceptable for tests/local development only, but unsafe for production-like use.

Required work:

- Add explicit setting, for example `ALLOW_DEV_ACTOR_HEADER` or equivalent.
- Default must be safe for production. If the setting is absent/false, protected endpoints must not accept arbitrary `X-Actor-User-Id` as production authentication.
- Tests may override this setting for Phase 1F-style API tests.
- Document the temporary nature of this mechanism in README/PLANS.

Acceptance criteria:

- Dev actor header cannot be accidentally treated as production auth.
- Tests still have a controlled way to inject actor identity.
- Healthcheck remains public and independent from database/auth.

### Phase 1G.2: REST Workflow Completion For Existing Services

Problem:

- Phase 1F added foundation endpoints, but several existing service-layer workflows are not exposed through API.

Required endpoints/workflows:

- Organization list/tree endpoint.
- Organization update endpoint.
- Organization archive endpoint.
- Registry read endpoint.
- Registry schema read endpoint.
- Block update/archive endpoints.
- Field update/archive endpoints.
- Reference list read/list endpoints.
- Reference item read/list/update/archive endpoints.
- Card list endpoint with registry, organization, archive, and query filters where supported.
- Card update endpoint for system card properties such as `display_name`, `public_view_enabled`, and `public_edit_enabled`.
- Card archive endpoint.
- Card block instance create endpoint for repeatable blocks.
- Public link list endpoint for a card.
- Public link disable endpoint.

Acceptance criteria:

- API exposes the already-existing service-layer workflows without moving business rules into endpoints.
- Endpoints enforce service-layer permissions.
- Tests cover both allowed and denied access paths.

### Phase 1G.3: Public Link API Hardening

Problems:

- `PublicLinkCreate.expires_in_days` needs validation.
- Public edit currently risks revealing field existence before token validation.
- Public endpoints need stricter response/error behavior.

Required work:

- Validate `expires_in_days`, recommended range `1..30` days.
- Public edit path must validate token usability before revealing field-level errors.
- Public edit must still enforce:
  - link active;
  - not expired;
  - usage limit;
  - `card.public_edit_enabled=true`;
  - `block.public_editable=true`;
  - `field.public_editable=true`;
  - allowed block/field restrictions.
- Add tests for invalid/expired/disabled tokens and invalid field IDs.

Acceptance criteria:

- Invalid public token receives a stable permission/error response without revealing internal field state.
- Expiration and usage-limit behavior is tested.
- No raw token is persisted.

### Phase 1G.4: Reference Field Validation

Problem:

- Reference field API coercion parses UUIDs, but target object existence and active/visible state must be validated before database commit.

Required work:

- Validate `organization_ref` target exists and is active.
- Validate `org_unit_ref` target exists and is active.
- Validate `user_ref` target exists and is not archived.
- Validate `card_ref` target exists and is readable/valid for the actor or public context as appropriate.
- Validate `registry_ref` target exists and is active/not archived.
- Return stable API errors instead of late FK/IntegrityError failures.
- Add service and API tests.

Acceptance criteria:

- Invalid reference UUIDs return controlled 4xx errors.
- No uncontrolled database integrity error leaks to clients.
- Tests cover all reference field types.

### Phase 1G.5: Audit Request Metadata

Problem:

- `audit_events` has `ip_address`, `user_agent`, and `request_id` columns, but API/service writes do not currently pass request metadata.

Required work:

- Add request metadata extraction dependency.
- Pass `request_id`, client IP, and user agent into `AuditService` for API writes.
- Public-link writes must also include request metadata.
- Add tests asserting metadata is recorded.

Acceptance criteria:

- API-created audit events include request metadata where available.
- Existing service tests remain valid when metadata is absent.

### Phase 1G.6: HTTP Error And IntegrityError Hardening

Problem:

- Some invalid operations may still surface as generic 500 errors, especially unique/FK violations.

Required work:

- Map SQLAlchemy `IntegrityError` to stable HTTP 409/422 responses where appropriate.
- Keep permission errors as 403.
- Keep missing objects as 404 where the service can identify them.
- Add tests for duplicate organization code, duplicate registry code, duplicate reference list code, duplicate block/field code, and invalid FK-style references where applicable.

Acceptance criteria:

- Common client mistakes return stable 4xx errors.
- No raw database error text is exposed in API responses.

### Phase 1G.7: API Test Coverage Expansion

Required tests:

- Protected endpoints reject actor header when dev actor mode is disabled.
- Organization list/tree/update/archive API tests.
- Registry schema read/update/archive API tests.
- Card list/update/archive/block-instance API tests.
- Public link list/disable/hardening API tests.
- Reference read/list/update/archive API tests.
- Reference field validation tests.
- Audit request metadata tests.
- IntegrityError mapping tests.

Verification commands:

```powershell
cd C:\Users\admin-2\Documents\reg_engine
powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote
```

```bash
cd /opt/reg_engine/backend
sudo -u postgres env TEST_DATABASE_URL='postgresql+psycopg:///reg_engine_test' .venv/bin/python -m pytest -q -p no:cacheprovider
```

Acceptance criteria for Phase 1G:

1. Current API/service bugs and gaps listed above are closed or explicitly deferred with reason.
2. No production auth/session flow is introduced yet.
3. No frontend implementation is added.
4. No import/export, documents, MCP, MDB migration, or service desk integration is added.
5. No hardcoded employee table or HR-specific fixed business columns are introduced.
6. No database migration is added unless a specific Phase 1G subtask proves it is required and the migration follows the standing migration approval rule.
7. Local checks pass.
8. PostgreSQL-backed tests pass against disposable `reg_engine_test`.
9. README and PLANS.md reflect the final Phase 1G result.

## Planned Phases After Phase 1I

The following phases must not start until Phase 1I is synchronized to GitHub/server and verified there.

### Phase 1H: Bootstrap And Seed

Purpose: make the system bootstrappable without manual SQL.

Status: completed.

Required work:

- Seed permissions.
- Seed roles:
  - `system_admin`;
  - `registry_admin`;
  - `org_admin`;
  - `auditor`.
- CLI/script for creating the first superadmin.
- Safe repeatable bootstrap behavior.
- Tests for idempotency and no duplicate seed data.

### Phase 1I: Auth And Session Flow

Purpose: replace temporary actor context with production authentication.

Status: completed.

Required work:

- Password hashing.
- Login endpoint.
- Current user dependency.
- Session/token strategy.
- `GET /api/v1/auth/me`.
- Logout/session invalidation placeholder or implementation.
- Disable `X-Actor-User-Id` outside controlled dev/test mode.
- Tests for auth and protected endpoints.

### Phase 1J: User And Access Management API

Purpose: let admins manage users, roles, permissions, and grants through API.

Required work:

- Users API.
- Roles read API.
- Permissions read API.
- Access grants API.
- Grant archive/revoke API.
- Organization-scoped admin assignment workflows.
- Tests for system admin and org admin boundaries.

### Phase 1K: Production Frontend Workflows

Purpose: build the first usable web UI on top of the hardened API and auth/session flow.

Required work:

- Login screen.
- Organization tree/list pages.
- Registry list and schema view.
- Card list.
- Card read/edit shell.
- Dynamic card form renderer for existing block/field schema.
- Public-link edit page.
- Audit list for allowed actors.

### Phase 2: Documents

Purpose: add documents and attachments.

Required work:

- File upload.
- Attachment metadata.
- Card/block/field attachment links.
- File permissions.
- File access audit.
- Storage abstraction.

### Phase 3: Import And Export

Purpose: add controlled data exchange.

Required work:

- XLSX/CSV import.
- Column mapping.
- Preview and validation.
- Background import jobs.
- XLSX/CSV/JSON/PDF export.
- Export permission checks.

### Phase 4: Reports

Purpose: add report generation.

Required work:

- Report templates.
- Card PDF.
- Registry reports.
- Period reports.
- DOCX/PDF generation.

### Phase 5: MCP Over API Only

Purpose: add MCP after API, auth, and audit boundaries are stable.

Required work:

- Read-only MCP tools first.
- MCP tools call API only.
- No direct DB access.
- Audit source `mcp`.
- Write tools only after explicit approval.

## Verification Commands

Documentation-only checks:

```powershell
cd C:\Users\admin-2\Documents\reg_engine
git diff --check -- PLANS.md
powershell -ExecutionPolicy Bypass -File scripts/project-map.ps1 -Check
```

Backend checks:

```powershell
cd C:\Users\admin-2\Documents\reg_engine
powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote
```

PostgreSQL-backed backend checks:

```bash
cd /opt/reg_engine/backend
sudo -u postgres env TEST_DATABASE_URL='postgresql+psycopg:///reg_engine_test' .venv/bin/python -m pytest -q -p no:cacheprovider
```

## Implementation Guardrail

- Phase 1I replaced temporary actor context with bearer auth for protected endpoints; the dev actor header remains available only when explicitly enabled for controlled tests/local development.
- Phase 1J must complete admin user/access workflows before production frontend, import/export, documents, or MCP.
- Future PostgreSQL schema migrations or schema-changing deployments to `/opt/reg_engine` may be run by Codex only when they are part of the active plan and pass the standing planned-migration rule in `AGENTS.md`: disposable DB verification, fresh backup, data preflight, intentional production target, and post-migration checks.
- After each verified implementation checkpoint, synchronize the scoped commit to GitHub `origin/main` and update the server checkout from `origin/main` before continuing to the next phase, unless the user explicitly requests local-only work.
- Temporary branches are not part of the normal workflow; if one is explicitly used, merge or fast-forward it into `main` and delete it locally and on GitHub after synchronization.
