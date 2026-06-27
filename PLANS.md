# PLANS.md

## Project

Registry Engine is a configurable web engine for schema-driven registries. It is not a hardcoded employee registry.

The system must keep card structure in registry metadata and dynamic typed values. Backend access checks are the security boundary. Frontend checks are UX hints only.

## Current Status

- Phase 1A foundation tooling is complete: FastAPI backend skeleton, React/Vite frontend skeleton, PowerShell scripts, CI workflow, GitHub/SSH/server connectivity, and healthcheck tests.
- Phase 1B.1 models and migration are implemented locally on `codex/core-schema-v1`.
- Phase 1B.2 organization scope and access foundation service logic is implemented locally on `codex/core-schema-v1`.
- Phase 1B.3 registry schema and reference list service logic is implemented locally on `codex/core-schema-v1`.
- Phase 1B.4 card command/query and dynamic value service logic is implemented locally on `codex/core-schema-v1`.
- Phase 1B.5 public link service logic is implemented locally on `codex/core-schema-v1`.
- Phase 1B.6 card transfer and audit service boundaries are implemented locally on `codex/core-schema-v1`.
- Phase 1B service-layer audit wiring is implemented locally on `codex/core-schema-v1` for organization, org unit, registry schema, reference list, card, transfer, and public-link actions.
- Phase 1B audit SQLAlchemy repository adapter is implemented locally on `codex/core-schema-v1`.
- Phase 1B organization closure and org unit SQLAlchemy repository adapters are implemented locally on `codex/core-schema-v1`.
- Phase 1B registry schema and reference list SQLAlchemy repository adapters are implemented locally on `codex/core-schema-v1`.
- Phase 1B card, field value, card relation, and public-link SQLAlchemy repository adapters are implemented locally on `codex/core-schema-v1`.
- Phase 1B runtime dependency composition and business endpoints are started locally on `codex/core-schema-v1` for organization root/child creation, org unit create/list/archive, registry schema create/archive operations, and reference list/item create/archive operations.
- Backend still does not contain the complete Core Schema v1 endpoint set, frontend UI, full runtime dependency composition for every Core Schema service, or production schema deployment.

## Phase 1B: Core Schema v1

### Goal

Define and implement the backend foundation for the final Core Schema v1: SQLAlchemy models, Alembic migration, service boundaries, API route plan, and required tests for a schema-driven registry engine.

### Final Core Schema v1 Tables

Phase 1B must cover these tables:

1. `organizations`
2. `organization_closure`
3. `org_units`
4. `users`
5. `roles`
6. `permissions`
7. `role_permissions`
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

### Accepted Architecture Decisions

1. A registry is a card-list mechanism: it defines how cards are grouped, searched, filtered, displayed, and protected.
2. One `registry` can contain cards from many organizations.
3. Do not create a separate registry schema or separate database schema per organization.
4. Card visibility is determined by organization scope.
5. `org_admin` can see and manage the assigned organization and descendants when the grant allows descendants.
6. `org_admin` cannot see parent organizations or sibling branches.
7. `org_units` are departments/subdivisions and filters in v1; they are not an RBAC boundary.
8. New fields appear in old cards as empty/null until a value is saved.
9. Fields, blocks, cards, and organizations are archived, not physically deleted by normal business flows.
10. `reference_lists` and `reference_items` are used for `select` and `multi_select` fields.
11. A public link edits a card directly through backend-validated public endpoints.
12. A public link lives for 7 days by default.
13. If `card.public_edit_enabled=false`, the public link cannot edit the card.
14. Card transfer creates a new card in the target organization and marks the old card `superseded`.
15. The old card remains visible to the old `org_admin` in archive scope.
16. All create, update, archive, transfer, and public-link changes write `audit_events`.

### Data Model Requirements

- Every main entity uses UUID primary keys.
- Use PostgreSQL `gen_random_uuid()` through `pgcrypto` for server-side UUID defaults.
- Use `created_at` and `updated_at` timestamps where the entity is mutable.
- Use `archived_at` for soft archive where normal business flows must not hard-delete records.
- Use `timestamptz` for timestamp columns.
- Use `jsonb` for `*_json` fields.
- Avoid PostgreSQL enum types for business statuses; use `text` plus application constants and safe check constraints.
- Keep card structure schema-driven through `registries`, `form_blocks`, and `form_fields`.
- Store dynamic values in typed columns such as `value_text`, `value_number`, `value_date`, `value_datetime`, `value_bool`, `value_json`, and reference FK value columns.
- Do not add employee-specific fixed business columns such as education, awards, service history, dismissal details, or other кадровые fields.

### Phase 1B File Plan

#### Migration Infrastructure

- Create `backend/alembic.ini`.
- Create `backend/migrations/env.py`.
- Create `backend/migrations/script.py.mako`.
- Create `backend/migrations/versions/0001_core_schema_v1.py`.
- Modify `backend/app/core/database.py` only for SQLAlchemy engine/session helpers; healthcheck must remain independent from PostgreSQL.
- Modify `backend/app/models/__init__.py` so Alembic can import all model metadata.

#### SQLAlchemy Model Files

- Create `backend/app/models/base.py`.
- Create `backend/app/models/identity.py` for `users`, `roles`, `permissions`, `role_permissions`.
- Create `backend/app/models/organization.py` for `organizations`, `organization_closure`, `org_units`, `access_grants`.
- Create `backend/app/models/registry_schema.py` for `registries`, `form_blocks`, `form_fields`.
- Create `backend/app/models/reference.py` for `reference_lists`, `reference_items`.
- Create `backend/app/models/card.py` for `cards`, `card_block_instances`, `field_values`, `field_value_items`, `card_relations`.
- Create `backend/app/models/public_link.py` for `card_public_links`.
- Create `backend/app/models/audit.py` for `audit_events`.

#### Domain Constants

- Create `backend/app/domain/__init__.py`.
- Create `backend/app/domain/constants.py`.
- Include constants for user statuses, registry statuses, card lifecycle statuses, field types, required modes, public link statuses, relation types, actor types, audit sources, seed roles, and seed permissions.

#### Service Boundaries

Phase 1B service design must reserve these modules:

- `backend/app/services/organizations.py`
- `backend/app/services/org_units.py`
- `backend/app/services/permissions.py`
- `backend/app/services/registry_schema.py`
- `backend/app/services/reference_lists.py`
- `backend/app/services/cards.py`
- `backend/app/services/card_queries.py`
- `backend/app/services/public_links.py`
- `backend/app/services/audit.py`

Rules:

- Audit writes go through `AuditService`; do not scatter audit inserts across route handlers.
- Permission decisions go through `PermissionService`; do not duplicate access logic in route handlers.
- Card read behavior must merge schema plus existing values and return null for missing values.
- Public-link edits must reuse the same value validation rules as authenticated card edits.

#### API Route Plan

Do not add endpoints before their tests and services exist. When Phase 1B implementation starts, use this route structure:

- `backend/app/api/v1/endpoints/organizations.py`
- `backend/app/api/v1/endpoints/org_units.py`
- `backend/app/api/v1/endpoints/registries.py`
- `backend/app/api/v1/endpoints/reference_lists.py`
- `backend/app/api/v1/endpoints/cards.py`
- `backend/app/api/v1/endpoints/public_links.py`
- `backend/app/api/v1/endpoints/audit.py`

Planned route groups:

- Organizations: create root, create child, tree, get, update, archive.
- Org units: create, list by organization, get, update, archive.
- Registries and schema: create registry, get schema, create/update/archive blocks, create/update/archive fields.
- Reference lists: create/update/archive lists and items.
- Cards: create, list, get, update system fields, values, block instances, archive, transfer, relations.
- Public links: create, list, disable, public get, public values update.
- Audit: global audit list, card audit, organization audit.

## Phase 1B Implementation Slices

### 1B.1 Models And Migration

- [x] Add Alembic infrastructure.
- [x] Add SQLAlchemy model base and all Core Schema v1 models.
- [x] Add `0001_core_schema_v1` migration.
- [x] Enable `pgcrypto`.
- [x] Add indexes, unique constraints, foreign keys, and safe check constraints.
- [x] Add deterministic seed data for initial roles and permissions.
- [x] Add migration/schema tests for all 20 tables, typed values, constraints, indexes, `pgcrypto`, no `employees` table, and `timestamptz` SQL rendering.

Verification completed locally:

```powershell
cd C:\Users\admin-2\Documents\reg_engine\backend
.\.venv\Scripts\python.exe -m pytest tests\test_models_smoke.py tests\test_schema_constraints.py tests\test_migrations.py -q
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\python.exe -m ruff check .
.\.venv\Scripts\python.exe -m ruff format --check .
.\.venv\Scripts\python.exe -m mypy app
.\.venv\Scripts\python.exe -m alembic upgrade head --sql
```

Remaining limitation: online `python -m alembic upgrade head` against PostgreSQL is not run yet. Server schema migration remains an explicit approval step because it changes PostgreSQL schema.

### 1B.2 Organization Scope And Access Foundation

- [x] Implement organization tree creation and `organization_closure` maintenance.
- [x] Implement org unit create/list/archive behavior.
- [x] Implement access grants and permission checks.
- [x] Enforce descendant access and block parent/sibling access.
- [x] Add service tests for root organization creation, child organization creation, sibling denial, descendant-only visibility, org unit list/archive behavior, and permission scope rules.

Verification completed locally:

```powershell
cd C:\Users\admin-2\Documents\reg_engine\backend
.\.venv\Scripts\python.exe -m pytest tests\test_organization_service.py tests\test_org_unit_service.py tests\test_permission_service.py -q
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\python.exe -m ruff check .
.\.venv\Scripts\python.exe -m ruff format --check .
.\.venv\Scripts\python.exe -m mypy app
```

Remaining limitation: 1B.2 service logic and SQLAlchemy repository adapters are implemented. API endpoints and runtime dependency composition are still open work.

### 1B.3 Registry Schema And Reference Lists

- [x] Implement registry creation.
- [x] Implement form block creation/archive.
- [x] Implement form field creation/archive.
- [x] Validate field types and required modes.
- [x] Implement reference lists and reference items for select/multi_select.
- [x] Implement reference list and reference item archive behavior.
- [x] Enforce locked inherited reference-list behavior.
- [x] Add service tests for system admin registry/block/field creation, org admin schema denial, field type validation, block/field archive, inherited reference lists, locked descendant edit denial, and reference list/item archive.

Verification completed locally:

```powershell
cd C:\Users\admin-2\Documents\reg_engine\backend
.\.venv\Scripts\python.exe -m pytest tests\test_registry_schema_service.py tests\test_reference_list_service.py -q
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\python.exe -m ruff check .
.\.venv\Scripts\python.exe -m ruff format --check .
.\.venv\Scripts\python.exe -m mypy app
```

Remaining limitation: 1B.3 service logic and SQLAlchemy repository adapters are implemented. API endpoints, registry/block/field update operations, and reference list/item update operations are still open work.

### 1B.4 Cards And Dynamic Values

- [x] Implement card creation and archive.
- [x] Implement card block instances.
- [x] Implement typed field value writes.
- [x] Implement schema plus values read model with null missing values.
- [x] Implement card list filters by registry, organization scope, lifecycle status, org unit, and display name query.
- [x] Add service tests for org-scope create/edit denial, typed value column mapping, multi-select item rows, archived-card value retention, schema/value read merging, null missing values, and scoped list filters.

Verification completed locally:

```powershell
cd C:\Users\admin-2\Documents\reg_engine\backend
.\.venv\Scripts\python.exe -m pytest tests\test_card_service.py tests\test_card_query_service.py -q
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\python.exe -m ruff check .
.\.venv\Scripts\python.exe -m ruff format --check .
.\.venv\Scripts\python.exe -m mypy app
```

Remaining limitation: 1B.4 service logic and SQLAlchemy repository adapters are implemented. API endpoints, runtime dependency composition, and value validation against concrete reference-list membership are still open work.

### 1B.5 Public Links

- [x] Implement 7-day public link creation.
- [x] Store `token_hash`, not raw token.
- [x] Enforce link status, expiry, usage, `card.public_edit_enabled`, block public flags, and field public flags.
- [x] Implement direct public value update using the same typed value mapper as authenticated card edits.
- [x] Write public-link audit events through the repository boundary.
- [x] Add service tests for token hashing, default expiry, scope denial, disabled/expired/overused links, public edit flags, direct field update, usage count, and audit recording.

Verification completed locally:

```powershell
cd C:\Users\admin-2\Documents\reg_engine\backend
.\.venv\Scripts\python.exe -m pytest tests\test_public_link_service.py -q
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\python.exe -m ruff check .
.\.venv\Scripts\python.exe -m ruff format --check .
.\.venv\Scripts\python.exe -m mypy app
```

Remaining limitation: 1B.5 service logic and SQLAlchemy repository adapters are implemented. API endpoints and runtime dependency composition are still open work.

### 1B.6 Transfer, Archive, And Audit

- [x] Implement transfer as new-card creation plus old-card `superseded`.
- [x] Write `card_relations` with `transferred_to`.
- [x] Preserve old card visibility in old organization archive scope.
- [x] Add `AuditService` as the centralized audit-event boundary for user, public-link, and system actors.
- [x] Add service tests for transfer relation creation, target-scope denial, old/new organization visibility after transfer, and audit actor/source mapping.

Verification completed locally:

```powershell
cd C:\Users\admin-2\Documents\reg_engine\backend
.\.venv\Scripts\python.exe -m pytest tests\test_audit_service.py tests\test_card_service.py tests\test_card_query_service.py -q
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\python.exe -m ruff check .
.\.venv\Scripts\python.exe -m ruff format --check .
.\.venv\Scripts\python.exe -m mypy app
```

Remaining limitation: 1B.6 service logic and SQLAlchemy repository adapters are implemented. API endpoints and runtime dependency composition are still open work.

### 1B.7 Service-Layer Audit Wiring Follow-Up

- [x] Wire organization create actions to `AuditService`.
- [x] Wire org unit create/archive actions to `AuditService`.
- [x] Wire registry/block/field create/archive actions to `AuditService`.
- [x] Wire reference list/item create/archive actions to `AuditService`.
- [x] Wire card create/archive, block instance create, field value update, and transfer actions to `AuditService`.
- [x] Wire public-link create/disable actions as user audit events and public value edits as public-link audit events.
- [x] Add service tests proving audit event actions are emitted through the shared `AuditService` boundary.

Verification completed locally:

```powershell
cd C:\Users\admin-2\Documents\reg_engine\backend
.\.venv\Scripts\python.exe -m pytest tests\test_service_audit_wiring.py tests\test_public_link_service.py tests\test_card_service.py tests\test_organization_service.py tests\test_org_unit_service.py tests\test_registry_schema_service.py tests\test_reference_list_service.py -q
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\python.exe -m ruff check .
.\.venv\Scripts\python.exe -m ruff format --check .
.\.venv\Scripts\python.exe -m mypy app
```

Remaining limitation: audit wiring is service-layer only until services are composed with SQLAlchemy repository adapters in API/runtime dependencies.

### 1B.8 SQLAlchemy Repository Adapters

- [x] Add SQLAlchemy repository adapter for `audit_events`.
- [x] Add repository tests proving `AuditEvent` ORM objects are created with UUID, actor, action, object, JSON data, source, and timestamp fields.
- [x] Add SQLAlchemy repository adapters for organizations and organization closure.
- [x] Add SQLAlchemy repository adapters for org units.
- [x] Add SQLAlchemy repository adapters for registry schema.
- [x] Add SQLAlchemy repository adapters for reference lists/items.
- [x] Add SQLAlchemy repository adapters for cards, block instances, field values, field value items, and card relations.
- [x] Add SQLAlchemy repository adapter for public links.

Verification completed locally for completed repository adapters:

```powershell
cd C:\Users\admin-2\Documents\reg_engine\backend
.\.venv\Scripts\python.exe -m pytest tests\test_audit_repository.py tests\test_audit_service.py -q
.\.venv\Scripts\python.exe -m pytest tests\test_organization_repositories.py -q
.\.venv\Scripts\python.exe -m pytest tests\test_registry_reference_repositories.py -q
.\.venv\Scripts\python.exe -m pytest tests\test_card_public_link_repositories.py -q
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\python.exe -m ruff check .
.\.venv\Scripts\python.exe -m ruff format --check .
.\.venv\Scripts\python.exe -m mypy app
```

Remaining limitation: SQLAlchemy repository adapters exist for all Phase 1B service protocols. API/runtime dependency composition and production PostgreSQL migration remain open work.

### 1B.9 API Runtime Composition

- [x] Add API dependency composition for current actor, database session, organization repository, audit repository, audit service, and organization service.
- [x] Add organization API schemas.
- [x] Add organization root creation endpoint.
- [x] Add organization child creation endpoint.
- [x] Add API tests proving endpoints call services and commit the injected session.
- [x] Add org unit API schemas.
- [x] Add org unit create/list/archive endpoints.
- [x] Add API tests proving org unit endpoints call services and commit the injected session for writes.
- [x] Add registry schema API schemas.
- [x] Add registry, form block, and form field create endpoints.
- [x] Add form block and form field archive endpoints.
- [x] Add API tests proving registry schema endpoints call services and commit the injected session for writes.
- [x] Add reference list API schemas.
- [x] Add reference list/item create endpoints.
- [x] Add reference list/item archive endpoints.
- [x] Add API tests proving reference list endpoints call services and commit the injected session for writes.
- [ ] Add organization tree/get/update/archive endpoints.
- [ ] Add card endpoints.
- [ ] Add public link endpoints.
- [ ] Add audit endpoints.

Verification completed locally for completed organization API slice:

```powershell
cd C:\Users\admin-2\Documents\reg_engine\backend
.\.venv\Scripts\python.exe -m pytest tests\test_organization_api.py -q
.\.venv\Scripts\python.exe -m pytest tests\test_org_unit_api.py -q
.\.venv\Scripts\python.exe -m pytest tests\test_registry_schema_api.py -q
.\.venv\Scripts\python.exe -m pytest tests\test_reference_list_api.py -q
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\python.exe -m ruff check .
.\.venv\Scripts\python.exe -m ruff format --check .
.\.venv\Scripts\python.exe -m mypy app
```

Remaining limitation: organization root/child, org unit create/list/archive, registry schema create/archive, and reference list/item create/archive endpoints are wired. Auth is still a placeholder system actor until a dedicated auth phase; production PostgreSQL migration remains a separate explicit approval step.

## Phase 1B Acceptance Criteria

- All 20 final Core Schema v1 tables exist in SQLAlchemy models and Alembic migration.
- `alembic upgrade head` applies cleanly against PostgreSQL.
- No hardcoded `employees` table or employee-specific fixed business columns are introduced.
- One registry can hold cards from multiple organizations.
- Organization scope controls card visibility.
- `org_admin` sees own organization and descendants, not parent or sibling branches.
- `org_units` are usable as filters/subdivisions and are not an RBAC boundary in v1.
- New fields appear in existing cards as null/empty without creating mass `field_values` rows.
- Field values are stored in the correct typed value columns or reference tables.
- `reference_lists` and `reference_items` support select and multi_select.
- Normal business flows archive fields, blocks, cards, organizations, and reference data instead of physical deletion.
- Public links expire after 7 days by default.
- Public links cannot edit when `card.public_edit_enabled=false`.
- Transfer creates a new target card, marks the old card `superseded`, and records `card_relations`.
- Old organization admin can still see the superseded old card in archive scope.
- All create/update/archive/transfer/public-link changes write `audit_events`.
- Healthcheck remains independent from PostgreSQL.
- README is updated with migration/test commands after implementation.

## Mandatory Phase 1B Tests

### Migration And Schema Tests

- `alembic upgrade head` works.
- All 20 tables exist.
- Important unique constraints exist.
- Required indexes exist.
- `pgcrypto` is enabled.
- No `employees` table exists.

### Organization And RBAC Tests

- `system_admin` can create a root organization.
- `org_admin` can create a child organization inside own subtree.
- `org_admin` cannot create a sibling organization.
- `org_admin` sees descendants.
- `org_admin` cannot see parent organization.
- `org_admin` cannot see sibling branch.
- `org_units` can be listed by organization and do not grant access by themselves.

### Registry Schema Tests

- `system_admin` can create a registry.
- `system_admin` can create a block.
- `system_admin` can create a field.
- `org_admin` cannot manage registry schema in v1.
- Archived field remains in the database.
- Adding a field after card creation does not create old-card field value rows.
- Old card response includes the new field as null/empty.

### Reference List Tests

- Reference list can be created.
- Reference item can be created.
- Select values store `reference_items.id`, not copied text.
- Multi-select values store rows in `field_value_items`.
- Descendant organization can use an inherited reference list.
- Descendant admin cannot edit a locked inherited reference list.

### Card And Dynamic Value Tests

- `org_admin` can create a card in own organization.
- `org_admin` cannot create a card in sibling organization.
- `org_admin` can edit a card in own subtree.
- `org_admin` cannot edit a parent or sibling card.
- Text value saves to `value_text`.
- Date value saves to `value_date`.
- Boolean value saves to `value_bool`.
- Select value saves to `value_reference_item_id`.
- Multi-select saves to `field_value_items`.
- Archived card leaves existing values intact.

### Public Link Tests

- Admin can create a public link.
- Public link expires in 7 days by default.
- Raw token is returned once and only token hash is stored.
- Public link can edit public-editable fields.
- Public link cannot edit an admin-only block.
- Public link cannot edit a field with `public_editable=false`.
- Public link cannot edit when `card.public_edit_enabled=false`.
- Public link writes an audit event.

### Transfer Tests

- Transfer creates a new card in target organization.
- Old card becomes `superseded`.
- `card_relations` stores `transferred_to`.
- Old `org_admin` sees old card in archive.
- Old `org_admin` does not see the new active card if target organization is outside scope.
- Top organization admin sees both cards when scope includes both organizations.

### Audit Tests

- Audit event is written on organization create/update/archive.
- Audit event is written on registry/block/field create/update/archive.
- Audit event is written on reference list/item create/update/archive.
- Audit event is written on card create/update/archive.
- Audit event is written on field value update.
- Audit event is written on public link create/disable/edit.
- Audit event is written on transfer.

## Verification Commands For Phase 1B

Run locally before marking Phase 1B complete:

```powershell
cd C:\Users\admin-2\Documents\reg_engine\backend
python -m alembic upgrade head
python -m pytest
```

Run the repo gates:

```powershell
cd C:\Users\admin-2\Documents\reg_engine
powershell -ExecutionPolicy Bypass -File scripts/check.ps1
powershell -ExecutionPolicy Bypass -File scripts/test.ps1
powershell -ExecutionPolicy Bypass -File scripts/lint.ps1
powershell -ExecutionPolicy Bypass -File scripts/format.ps1 -Check
powershell -ExecutionPolicy Bypass -File scripts/typecheck.ps1
powershell -ExecutionPolicy Bypass -File scripts/project-map.ps1 -Check
```

Server migration is a separate explicit approval step because it changes PostgreSQL schema:

```powershell
ssh root@registoryengine "cd /opt/reg_engine/backend && python -m alembic upgrade head"
```

## Implementation Guardrail

Phase 1B implementation is approved and in progress. Continue in TDD slices from the next unchecked item. Do not run server PostgreSQL schema migration or deploy schema-changing code to `/opt/reg_engine` without a separate explicit approval step.
