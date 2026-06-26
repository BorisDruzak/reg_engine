# PLANS.md

## Project

Registry Engine — расширяемый web-движок реестров.

Цель: создать независимую систему реестров с web-интерфейсом, серверной БД, API, RBAC/ABAC, audit log и будущей поддержкой MCP.

Система не должна быть просто аналогом старого Access-реестра. Старый реестр используется только как предметный ориентир. Новая система должна быть движком, где структура карточек задаётся через блоки и поля.

---

## Current Phase

Phase 0: подготовка репозитория, среды и правил разработки.

---

## Phase 0 Checklist

- [x] GitHub repository exists: `BorisDruzak/reg_engine`.
- [x] README.md created/updated.
- [x] AGENTS.md exists.
- [x] .gitignore exists.
- [x] Operational scripts are documented in README/AGENTS.
- [ ] .env.example exists.
- [ ] Phase 1A backend foundation implemented.

---

## Phase 1A — Backend Foundation

### Goal

Create the backend foundation without business models beyond a healthcheck.

### Scope

Implement:

- backend skeleton;
- FastAPI app;
- config module;
- database module placeholder/config;
- healthcheck endpoint;
- pytest + httpx test for healthcheck;
- ruff config;
- project scripts updated if needed;
- README commands updated if needed.

### Non-goals

Do not implement yet:

- frontend;
- auth;
- users;
- organizations;
- registries;
- cards;
- RBAC;
- audit log;
- import/export;
- documents;
- MCP.

### Definition of Done

- Healthcheck endpoint works.
- Tests pass.
- Lint/syntax checks pass.
- README contains run/test commands.
- PLANS.md updated with actual result.

---

## Phase 1B — Core Models and Migrations

### Goal

Add the schema foundation for dynamic registries.

### Models

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

1. Do not create a hardcoded employee table with fixed кадровые fields.
2. Use schema-driven cards.
3. Use typed field values.
4. Use soft delete/archive for cards, blocks, fields, organizations.
5. Keep all database changes under Alembic migrations.

---

## Phase 1C — Registry Schema API

### Goal

Allow an administrator to manage registries, blocks and fields through API.

### Endpoints

- `GET /api/v1/registries`
- `POST /api/v1/registries`
- `GET /api/v1/registries/{registry_id}`
- `PATCH /api/v1/registries/{registry_id}`
- `GET /api/v1/registries/{registry_id}/schema`
- `POST /api/v1/registries/{registry_id}/blocks`
- `PATCH /api/v1/blocks/{block_id}`
- `POST /api/v1/blocks/{block_id}/fields`
- `PATCH /api/v1/fields/{field_id}`

---

## Phase 1D — Cards and Dynamic Values

### Goal

Create and edit cards using registry schema.

### Endpoints

- `GET /api/v1/cards`
- `POST /api/v1/cards`
- `GET /api/v1/cards/{card_id}`
- `PATCH /api/v1/cards/{card_id}`
- `POST /api/v1/cards/{card_id}/archive`
- `PATCH /api/v1/cards/{card_id}/values`

### Critical Test

Adding a new field to an existing registry must not break old cards. Old cards must show the new field as empty.

---

## Phase 1E — Permissions and Audit

### Goal

Add backend-enforced access control and audit logging.

### Permission Rules

1. `is_superuser` can do everything.
2. Regular users see cards only through `access_grants`.
3. Parent organization access does not include child organizations by default.
4. Child organizations are visible only when `include_descendants=true`.
5. Backend checks every action.
6. API never returns cards or fields the user has no right to see.

### Audit Events

Write audit for:

- registry create/update;
- block create/update/archive;
- field create/update/archive;
- card create/update/archive;
- field value update;
- organization create/update/archive;
- access grant create/update/delete.

---

## Phase 1F — Minimal Frontend

### Goal

Create a minimal web interface proving schema-driven cards.

### Pages

- login page;
- organizations page;
- registries page;
- registry schema editor;
- card list page;
- card create page;
- card edit/view page;
- audit page.

### Frontend Rule

Do not hardcode fields such as ФИО, дата рождения, образование, стаж. Frontend must request schema from API and render fields dynamically.

Components:

- `DynamicCardForm`
- `DynamicBlock`
- `DynamicFieldRenderer`

---

## Future Phases

### Phase 2 — Documents

- file upload;
- attachment metadata;
- file permissions;
- file access audit;
- antivirus scan hook;
- storage abstraction.

### Phase 3 — Import/Export

- XLSX/CSV import;
- column mapping;
- preview and validation;
- background import jobs;
- XLSX/CSV/JSON/PDF export;
- export permissions.

### Phase 4 — Reports

- report templates;
- employee/card PDF;
- registry reports;
- period reports;
- DOCX/PDF generation.

### Phase 5 — MCP

- read-only MCP tools first;
- tools over API only;
- no direct DB access;
- audit source `mcp`;
- write-tools only after RBAC/audit are mature.

---

## Required Backend Tests

- `test_healthcheck`
- `test_create_registry`
- `test_create_block`
- `test_create_field`
- `test_create_card`
- `test_update_card_values`
- `test_add_field_after_card_created`
- `test_old_card_has_empty_new_field`
- `test_user_without_access_cannot_see_card`
- `test_user_with_org_access_can_see_card`
- `test_parent_org_without_descendants_does_not_see_child_cards`
- `test_parent_org_with_descendants_sees_child_cards`
- `test_user_without_field_edit_cannot_update_value`
- `test_audit_written_on_card_create`
- `test_audit_written_on_value_update`

---

## Global Non-goals Until Explicitly Requested

- Do not migrate MDB data.
- Do not integrate with the helpdesk repository.
- Do not implement production deployment.
- Do not add real personal data.
- Do not store secrets in Git.
- Do not bypass API with MCP or scripts.
