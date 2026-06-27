# PLANS.md

## Project

Registry Engine is a configurable web engine for schema-driven registries. It is not a hardcoded employee registry.

The system keeps card structure in registry metadata and dynamic typed values. Backend access checks are the security boundary. Frontend checks are UX hints only.

## Current Planning Scope

- This document is the active plan for Phase 1 Core Schema v1.
- Current checkpoint scope is Phase 1B.3 Model Smoke Tests implementation.
- Do not implement API CRUD, services, frontend, auth flow, import/export, documents, or MCP in this checkpoint.
- Core Schema v1 must remain generic and schema-driven. Do not add fixed HR/business fields.

## Current Phase Status

- Phase 1B.1 Database Foundation is completed locally in this checkpoint.
- Phase 1B.2 Core Models And Migration is completed locally in this checkpoint.
- Phase 1B.3 Model Smoke Tests are in progress: disposable PostgreSQL smoke tests were added and must run against `TEST_DATABASE_URL`, not production `reg_engine`.
- Phase 1C, Phase 1D, and Phase 1E remain planned future phases.
- Single-branch workflow is active: `main` is the only long-lived local, GitHub, and server branch.
- Synchronization checkpoint is carried on `main`: local `main`, GitHub `origin/main`, and server checkout `/opt/reg_engine` must stay aligned.
- Production PostgreSQL schema migration is completed through `0003_reconcile_core_schema_v1`.
- Production backup before migration: `/var/backups/reg_engine/reg_engine_before_alembic_head_20260627_191407.dump`, sha256 `9b7e6d0f5870f6da5f7da72f9fa77fa1856b3e1454030afe4350347824826152`.
- Production live schema compare against SQLAlchemy metadata passed after migration: 20/20 Core Schema v1 tables exist, no missing columns, no missing unique/check constraints, no missing indexes, and no `employees` table.

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

## Phase 1B: Core Schema v1 Database Foundation

### Phase 1B Goal

Create the database and model foundation for Core Schema v1 only. Phase 1B is not a business-logic phase.

Phase 1B may include:

- SQLAlchemy infrastructure;
- Alembic infrastructure;
- SQLAlchemy model declarations for Core Schema v1;
- Core Schema v1 migration;
- model/migration smoke tests;
- healthcheck staying independent from PostgreSQL.

Phase 1B must not include:

- business services;
- registry/card management endpoints;
- frontend implementation;
- import/export;
- documents;
- MCP;
- business-specific HR columns.

## Phase 1B.1: Database Foundation

Purpose: prepare the database infrastructure that later Core Schema v1 models and migrations will use.

Status: completed locally in this checkpoint.

Required work:

- [x] Add SQLAlchemy Base.
- [x] Add engine/session helpers.
- [x] Set up Alembic.
- [x] Define UUID and timestamp conventions.
- [x] Keep healthcheck independent from PostgreSQL.
- [x] Add a migration smoke test proving Alembic can render or run a baseline migration path.
- [x] Keep the initial foundation migration free of business tables.

Expected files:

- `backend/app/models/base.py`
- `backend/app/core/database.py`
- `backend/alembic.ini`
- `backend/migrations/env.py`
- `backend/migrations/script.py.mako`
- `backend/tests/test_migrations.py`

Verification:

```powershell
cd C:\Users\admin-2\Documents\reg_engine\backend
python -m alembic upgrade head --sql
python -m pytest tests\test_migrations.py -q
```

## Phase 1B.2: Core Models And Migration

Purpose: declare all Core Schema v1 SQLAlchemy models and create the first real schema migration.

Status: completed locally in this checkpoint.

Required work:

- [x] Add SQLAlchemy models for all Core Schema v1 tables.
- [x] Add Alembic migration for all Core Schema v1 tables.
- [x] Add indexes, unique constraints, foreign keys, and safe check constraints.
- [x] Enable `pgcrypto` for UUID defaults.
- [x] Do not add services or endpoints, except the existing healthcheck.

Expected model files:

- `backend/app/models/identity.py` for `users`, `roles`, `permissions`, `role_permissions`.
- `backend/app/models/organization.py` for `organizations`, `organization_closure`, `org_units`, `access_grants`.
- `backend/app/models/registry_schema.py` for `registries`, `form_blocks`, `form_fields`.
- `backend/app/models/reference.py` for `reference_lists`, `reference_items`.
- `backend/app/models/card.py` for `cards`, `card_block_instances`, `field_values`, `field_value_items`, `card_relations`.
- `backend/app/models/public_link.py` for `card_public_links`.
- `backend/app/models/audit.py` for `audit_events`.
- `backend/app/models/__init__.py` imports all model metadata for Alembic.

Expected migration file:

- `backend/migrations/versions/0002_core_schema_v1.py`
- `backend/migrations/versions/0003_reconcile_core_schema_v1.py` reconciles existing production schema drift from the superseded `0001_core_schema_v1` revision by adding missing constraints/indexes idempotently.

Verification:

```powershell
cd C:\Users\admin-2\Documents\reg_engine\backend
python -m alembic upgrade head --sql
python -m pytest tests\test_models_smoke.py tests\test_schema_constraints.py tests\test_migrations.py -q
```

Known limitations:

- No API CRUD, services, repositories, auth flow, frontend UI, import/export, documents, or MCP are implemented in Phase 1B.2.
- Local migration tests render PostgreSQL SQL offline. Routine schema tests should use a disposable PostgreSQL database through `TEST_DATABASE_URL`; production `reg_engine` migrations require backup-first explicit approval.
- Role/permission seed data is not inserted in this phase; initial seed strategy belongs to a later auth/RBAC phase.

Next phase:

- Phase 1B.3 should add broader model smoke tests, including minimal insert tests against a disposable PostgreSQL database when available.

## Phase 1B.3: Model Smoke Tests

Purpose: prove the Core Schema v1 model and migration contract before adding business services.

Required tests:

- `alembic upgrade head` works.
- All 20 Core Schema v1 tables exist.
- Key constraints exist.
- Required indexes exist.
- `pgcrypto` is enabled.
- No `employees` table exists.
- No business-specific HR columns exist.
- Core model insert smoke tests can create minimal valid rows where practical.
- Healthcheck remains independent from PostgreSQL.

Expected test files:

- `backend/tests/test_models_smoke.py`
- `backend/tests/test_schema_constraints.py`
- `backend/tests/test_migrations.py`
- `backend/tests/test_healthcheck.py`
- `backend/tests/test_database_smoke.py`

Verification:

```powershell
cd C:\Users\admin-2\Documents\reg_engine\backend
python -m pytest tests\test_models_smoke.py tests\test_schema_constraints.py tests\test_migrations.py tests\test_healthcheck.py -q
$env:TEST_DATABASE_URL = "postgresql+psycopg://<user>:<password>@<host>:5432/reg_engine_test"
python -m pytest tests\test_database_smoke.py -q
```

## Phase 1B Acceptance Criteria

1. `PLANS.md` reflects final Core Schema v1.
2. No hardcoded employee table is introduced.
3. No business-specific HR columns are introduced.
4. No frontend implementation is added.
5. No import/export implementation is added.
6. No documents implementation is added.
7. No MCP implementation is added.
8. Core Schema v1 model list is complete.
9. Tests required for later phases are listed.

## Phase 1C: Organization Tree And RBAC Services

Purpose: add backend service behavior for organization hierarchy and organization-scoped access.

Required work:

- Add `OrganizationService`.
- Add `PermissionService`.
- Implement `access_grants` behavior.
- Maintain and query `organization_closure`.
- Enforce subtree visibility.
- Prove `org_admin` sees descendants and cannot see parent/sibling branches.
- Keep `org_units` as filters/reference data, not an RBAC boundary.

Required tests:

- `system_admin` can create a root organization.
- `org_admin` can create/manage child organizations inside own subtree.
- `org_admin` cannot create or see sibling organizations.
- `org_admin` cannot see parent organizations.
- `org_admin` sees descendants.
- Access grant without descendants only allows exact organization when that mode is used.
- `org_units` can be listed/used by organization and do not grant access by themselves.

## Phase 1D: Registry Schema And Dynamic Cards

Purpose: add schema-driven registry and card behavior.

Required work:

- Add `RegistrySchemaService`.
- Add `ReferenceListService`.
- Add `CardService`.
- Implement dynamic field values.
- Implement card reads that merge schema plus existing values.
- Ensure old cards show newly added fields as null/empty.
- Enforce that only `system_admin` or `registry_admin` can change registry/card schema.
- Allow `org_admin` to manage cards in organization scope.

Required tests:

- Registry can be created without organization-specific schema duplication.
- One registry can contain cards from different organizations.
- Card visibility follows organization scope.
- `system_admin` or `registry_admin` can create/update/archive blocks and fields.
- `org_admin` cannot manage card schema in v1.
- Text/number/date/datetime/bool/json values save to the correct typed columns.
- `select` values store `reference_items.id`.
- `multi_select` values store rows in `field_value_items`.
- Select and multi-select writes reject items outside the field's configured reference list.
- Adding a field after card creation does not create mass old-card value rows.
- Old card response includes the new field as null/empty.
- Archived fields, blocks, cards, and organizations remain in the database.

## Phase 1E: Public Links, Transfer, Audit

Purpose: add public editing, card transfer, and audit-event behavior.

Required work:

- Add `PublicLinkService`.
- Add card transfer behavior.
- Add `AuditService`.
- Enforce public edit rules.
- Store public link token hashes, not raw tokens.
- Make public links expire after 7 days by default.
- Block public editing when `card.public_edit_enabled=false`.
- Transfer by creating a new card and marking the old card `superseded`.
- Preserve old-card visibility for the old `org_admin` in archive scope.
- Write audit events for create/update/archive/transfer/public-link changes.

Required tests:

- Admin can create a public link.
- Public link expires in 7 days by default.
- Raw token is returned once and only token hash is stored.
- Public link edits the card directly through public endpoints.
- Public link can edit only public-editable blocks/fields.
- Public link cannot edit when `card.public_edit_enabled=false`.
- Public link writes audit events.
- Transfer creates a new card in the target organization.
- Old card receives `lifecycle_status=superseded`.
- `card_relations` stores the transfer relation.
- Old `org_admin` sees the old card in archive scope.
- Old `org_admin` does not see the new active card if the target organization is outside scope.
- Audit event is written on organization create/update/archive.
- Audit event is written on registry/block/field create/update/archive.
- Audit event is written on reference list/item create/update/archive.
- Audit event is written on card create/update/archive.
- Audit event is written on field value update.
- Audit event is written on public link create/disable/edit.
- Audit event is written on transfer.

## Verification Commands

Documentation-only checks for this planning task:

```powershell
cd C:\Users\admin-2\Documents\reg_engine
git diff --check -- PLANS.md
powershell -ExecutionPolicy Bypass -File scripts/project-map.ps1 -Check
```

Backend checks for future implementation phases:

```powershell
cd C:\Users\admin-2\Documents\reg_engine
powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote
```

## Implementation Guardrail

- Phase 1B.2 added schema models and migration only.
- Future service/API work must be implemented in the phase order above.
- Future PostgreSQL schema migrations or schema-changing deployments to `/opt/reg_engine` require a separate explicit approval step.
- After each verified implementation checkpoint, synchronize the scoped commit to GitHub `origin/main` and update the server checkout from `origin/main` before continuing to the next phase, unless the user explicitly requests local-only work.
- Temporary branches are not part of the normal workflow; if one is explicitly used, merge or fast-forward it into `main` and delete it locally and on GitHub after synchronization.
