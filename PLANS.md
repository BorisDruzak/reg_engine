# PLANS.md

## Project

Registry Engine is a configurable web engine for schema-driven registries. It is
not a hardcoded employee registry.

## Current Stop Point

- Completed baseline: backend, frontend, attachments, generated documents,
  import/export, reports, MCP phases through Phase 5R, live verification, and
  production follow-up fixes are implemented on `main`.
- Current active checkpoint: **Phase 6: Organization-Centered Card Workflow
  Cleanup** is implemented and verified.
- Phase 6B UI simplification/tree work is completed and browser-verified.
- Phase 6C and Phase 6D are completed, including migration
  `0016_default_registry_tree`, organization-centered card creation, and
  organization-effective reference options.
- Phase 6E disposable PostgreSQL, production migration, frontend deployment,
  API live checks, and browser live checks are completed.
- Phase 6F root/default-registry enforcement and ordinary card workflow fixes
  are completed, deployed to `main`, and live-verified.
- Phase 6F production follow-up repaired the existing single-root production
  data to exactly one active root-owned default registry after a fresh
  server-side backup stored outside Git.
- Phase 7A admin UI workspace refactor is implemented on `main`: cards use a
  focused list/detail workflow with tabs, registry administration uses focused
  setup tabs, and row actions use compact visible labels with full accessible
  names.
- Phase 7B technical-code autogeneration in create forms is implemented on
  `main`, deployed to the server frontend, and live-verified in the browser.
- Production migration `0016_default_registry_tree` was applied on 2026-07-01
  after disposable PostgreSQL verification, a fresh server-side backup stored
  outside Git, preflight checks, and post-migration schema checks.
- Next implementation checkpoint after Phase 7B is not selected yet.
- This file was cleaned on 2026-07-01 to replace the old live-verification plan
  with the current product/UI architecture plan.
- Phase 6A is documentation/product decision work. Do not change backend code,
  frontend code, migrations, production data, or server runtime for Phase 6A.
- Phase 6B and later implementation phases may change code only after their
  scope is explicitly approved.

## Accepted Product Decisions

1. `organizations.type` must not be exposed as a user-facing concept.
2. The UI must not ask users whether an organization is an organization,
   department, unit, administration, or subdivision.
3. Departments, subdivisions, offices, and administrations are not organization
   types in the product model.
4. If a lower entity owns cards, users, access, or visibility scope, create it
   as a normal child organization in the organization tree.
5. If a department/subdivision is only a value inside a card, represent it as a
   card field value through a reference list or another explicit field type, not
   through `organizations.type`.
6. `org_units` remain optional internal/filter data and are not an RBAC
   boundary. Do not physically delete `org_units` in this cleanup slice.
7. The simple card workflow should hide `Подразделение карточки` until a
   specific workflow needs card-level org-unit filtering.
8. Organizations must be shown hierarchically in the UI.
9. **Phase 6 v1 supports one main root organization.** A root organization is an
   organization without a parent.
10. The first organization created in an empty system becomes the main root
    organization.
11. After the main root organization exists, the ordinary create-organization UI
    must no longer offer `Без родительской организации`. New organizations must
    be created as descendants of the main root organization or its descendants.
12. Creating additional root organizations is out of scope for Phase 6 v1. Any
    future multi-root support requires a separate approved architecture phase.
13. Do not create a separate registry for every organization.
14. Ordinary card creation must not require the user to manually choose a
    registry.
15. The main root organization should get one default card registry. Descendant
    organizations should use that same registry automatically.
16. Registry/schema administration may remain visible to system or registry
    admins, but the ordinary card workflow should be organization-centered.
17. A common registry schema should define blocks and fields for the whole
    organization tree.
18. Subordinate organizations must be able to use their own organization-owned
    reference lists for fields whose values differ by organization.
19. Ordinary create forms must not require users to manually invent technical
    codes. The UI should generate stable codes from Russian user-facing names
    and keep technical codes visible only as diagnostic metadata where useful.

## Current Technical Facts

- Cards already store both `registry_id` and `organization_id`.
- Card visibility is already organization-scoped through access grants and
  `organization_closure`.
- Backend already exposes `GET /api/v1/organizations/tree`.
- Frontend currently renders organizations as a flat table.
- `organizations.type` exists in the database/API and the frontend form, but it
  does not define RBAC or card visibility.
- `org_units` are optional card-level metadata and filters, not access-control
  boundaries.
- `registries` currently do not have an owner/default organization field.
- `form_blocks` and `form_fields` belong to a registry, not to an organization.
- `reference_lists` already support:
  - `registry_id`;
  - `owner_organization_id`;
  - `inherit_to_descendants`;
  - `locked_for_descendants`;
  - `managed_by_system_only`.
- Current select/multi-select field configuration points to one
  `options_source_id`. Organization-specific effective option resolution needs
  explicit backend/frontend work before subordinate-owned lists can drive the
  same field automatically.

## Registry Workflow Analysis

### Rejected Option: Registry Per Organization

Creating a separate registry for every organization is rejected.

Reasons:

- It duplicates the card schema for every child organization.
- Schema changes would have to be synchronized across many registries.
- Reports, imports, exports, document templates, and MCP tools would have to
  merge many registry schemas for one business workflow.
- It conflicts with the existing Core Schema v1 decision that one registry can
  contain cards from different organizations.

### Rejected Option: Hidden Global Default Registry

A hidden global default registry is rejected.

Reasons:

- It would make card creation ambiguous when more than one registry exists.
- It would let API/MCP/import workflows accidentally create cards in the wrong
  schema.
- It would be a frontend convention instead of a backend-enforced business rule.

### Accepted Option: Default Registry For The Main Root Organization Tree

Use one default card registry for the single main root organization tree in
Phase 6 v1.

Behavior:

- When the first/main root organization is created, the system creates or assigns
  one default registry named `Реестр карточек`.
- Child organizations do not get their own registries by default.
- When a user creates a card through the ordinary UI, the UI asks for the card
  organization, not for a registry.
- The backend resolves the default registry from the selected organization by
  using the main root organization.
- The card is saved with:
  - `cards.registry_id = resolved default registry`;
  - `cards.organization_id = selected organization`.
- The existing registry/schema admin screen becomes an advanced settings area for
  system/registry admins, not a required ordinary workflow.

Technical model for Phase 6C:

- Add registry ownership/default metadata with an Alembic migration:
  - `registries.owner_organization_id`;
  - `registries.is_default_for_owner_tree`.
- Do **not** add `registries.available_to_descendants` in Phase 6C. In v1 the
  default registry for the main root organization is available to descendants by
  definition.
- `owner_organization_id` is required when `is_default_for_owner_tree=true`.
- `is_default_for_owner_tree=true` means the registry is the default card schema
  for the owner organization and its descendants.
- Enforce at most one active default registry for the owner organization with a
  PostgreSQL partial unique index.
- Add a backend resolver that finds the active default registry for the selected
  organization by walking ancestors through `organization_closure`. In Phase 6
  v1 this should resolve to the main root organization's default registry.
- If no default registry is found, organization-centered card creation returns a
  controlled setup-required error with a UI call-to-action to configure the card
  registry.
- Keep existing `/registries/{registry_id}/cards` endpoints for compatibility.
- Add or expose a simplified organization-centered card-create path that takes
  `organization_id` and resolves `registry_id` server-side.
- MCP card creation must use either an explicit `registry_id` path or the new
  explicit `organization_id` path. No hidden global default is allowed.

Default registry archive rule:

- Use option A for Phase 6C: **forbid archiving an active default registry while
  it has active or draft cards**.
- Replacement default registry support is deferred.
- Archiving an unused default registry may be allowed only if the organization
  tree is left in a controlled setup-required state.

Transfer rule:

- Phase 6 v1 supports one main root organization, so cross-root transfer is out
  of scope.
- Transfer inside the main organization tree keeps the same resolved default
  registry and still stores the selected target `organization_id`.
- Future multi-root transfer behavior requires a separate approved phase.

## Reference List And Card Schema Analysis

### Recommended Schema Rule

Keep one common card schema for the main root organization tree:

- one default registry;
- one set of form blocks;
- one set of form fields;
- schema changes controlled by system admin or registry admin.

This keeps cards comparable across the main organization and all subordinate
organizations.

### Recommended Reference Rule

Reference lists should be organization-aware while the schema remains common.

Use reference list ownership like this:

- Global/root-owned locked list: descendants can use it but cannot edit it.
- Organization-owned local list: that organization can maintain its own items.
- Inherited list: descendants can use it when `inherit_to_descendants=true`.
- Locked inherited list: descendants cannot edit it when
  `locked_for_descendants=true`.

Example:

- Field `Статус карточки` uses a central locked list. All organizations use the
  same values.
- Field `Подразделение/отдел` uses an organization-overridable list. Each
  subordinate organization can maintain its own department names.

### Effective Reference List Resolution

For select/multi-select fields that allow local organization values, resolve the
effective list by card organization:

1. Exact list for `card.organization_id` with the same logical code.
2. Nearest ancestor list with `inherit_to_descendants=true`.
3. Registry-level/root list.
4. Global fallback only when explicitly allowed.

Recommended initial behavior: an exact organization-owned list replaces the
inherited list for that field. Merging inherited and local items can be added
later only if a real workflow needs it.

Likely technical model for implementation:

- Treat the selected/base reference list code as a logical list family.
- Add field/reference policy metadata, preferably in existing
  `form_fields.options_config_json`, for example:
  - `reference_resolution = "fixed_list"` for central-only lists;
  - `reference_resolution = "by_card_organization"` for local lists;
  - `allow_owner_override = true` only for fields where local organization lists
    are allowed.
- Update card read/edit option loading so options are resolved for the card
  organization, not only from the static `options_source_id`.
- Update field-value validation so a submitted reference item must belong to the
  effective list for that card organization.
- Keep locked inherited lists protected from descendant edits.
- Allow an org admin with the right scope to create/edit/archive only lists and
  items owned by their organization or descendant organizations.

## Phase 6A: Plan Cleanup And Product Decisions

Status: completed.

Scope:

- Clean `PLANS.md`.
- Record accepted decisions for organization type removal from UI.
- Record accepted decision for hierarchical organization display.
- Analyze default registry behavior.
- Analyze organization-owned reference list behavior.
- Record the Phase 6 v1 decision that only one main root organization is
  supported.
- Do not change backend/frontend code.

Checks:

```powershell
git diff --check
powershell -ExecutionPolicy Bypass -File scripts/project-map.ps1
```

## Phase 6B: Organization UI Simplification And Tree

Status: completed.

Purpose:

Make organization management match the real product model.

Required work:

1. Hide organization type selection in the create/edit organization UI.
2. Submit `organization_type="organization"` internally while the backend still
   requires the field.
3. Replace or supplement the flat organization table with a hierarchical tree.
4. Use `GET /api/v1/organizations/tree` for tree data.
5. Support the Phase 6 v1 one-root rule in the UI:
   - if no root organization exists, the create form may create the main root;
   - after the root organization exists, remove `Без родительской организации`
     from the parent-organization selector;
   - after the root organization exists, new organizations must be created as
     children of the root organization or an existing descendant.
6. Keep edit/archive/create-child actions available from tree rows.
7. Hide `Подразделение карточки` in the simple card create/edit flow unless an
   explicit org-unit workflow is enabled later.
8. Keep `org_units` API/model intact.
9. Do not physically remove `organizations.type` or `org_units`.

Required tests:

- Organization create form does not show type choices.
- Created organization is still sent with the safe internal default type.
- When no root organization exists, a root organization can be created.
- After a root organization exists, `Без родительской организации` is no longer
  offered in the ordinary create-organization UI.
- After a root organization exists, a newly created organization preserves a
  parent relationship.
- Organization tree renders parent/child nesting.
- Card form can create/edit cards without selecting `org_unit_id`.
- Backend RBAC behavior is unchanged.

Acceptance criteria:

- Users no longer see organization type choices.
- The organization screen clearly supports one main root organization in Phase 6
  v1.
- Lower entities are represented as normal child organizations.
- Organization screen is visually hierarchical.
- No database column is physically removed.
- No hardcoded employee-specific fields are added.

## Phase 6C: Default Card Registry For Main Organization Tree

Status: completed.

Purpose:

Remove manual registry selection from ordinary card creation while keeping one
common schema-driven registry for the main organization tree.

Required work:

1. Add `registries.owner_organization_id` and
   `registries.is_default_for_owner_tree` with an Alembic migration.
2. Do not add `available_to_descendants` in Phase 6C.
3. Enforce that `owner_organization_id` is present when
   `is_default_for_owner_tree=true`.
4. Enforce at most one active default registry for the main root organization.
5. Create a resolver for the default registry of an organization using
   `organization_closure`.
6. Automatically create or assign `Реестр карточек` for the first/main root
   organization.
7. Make descendant organizations inherit the root default registry.
8. Add an organization-centered card create flow that takes `organization_id` and
   resolves `registry_id` automatically.
9. Keep advanced registry/schema administration available only where useful.
10. Keep existing registry-based APIs for compatibility.
11. Forbid archiving an active default registry while it has active or draft
    cards.
12. Keep transfer inside the single main organization tree on the same default
    registry. Multi-root transfer is out of scope.
13. Ensure MCP card creation uses either explicit `registry_id` or explicit
    `organization_id`; no hidden global default.

Required tests:

- First/main root organization gets one default registry.
- A second active default registry for the same owner organization is rejected.
- Descendant organization does not get a duplicate registry.
- Creating a card for a descendant through the organization-centered path uses
  the root default registry.
- Card still stores the selected descendant `organization_id`.
- Sibling visibility rules remain organization-scoped.
- No ordinary card workflow requires manual registry selection.
- No-default-registry state returns a controlled setup-required error.
- Archived default registry is ignored by resolver.
- Active default registry with active/draft cards cannot be archived.
- Existing registry-based card create API still works.
- Transfer inside the main organization tree keeps the same registry.

Acceptance criteria:

- One default card registry serves the root organization and descendants.
- UI remains organization-centered and clean.
- No separate registry is created for every organization.
- Existing schema-driven card architecture remains intact.
- Default registry behavior is backend-enforced, not frontend-only guessing.

Implementation notes:

- Added Alembic revision `0016_default_registry_tree`.
- Added `registries.owner_organization_id` and
  `registries.is_default_for_owner_tree`.
- Added default-registry resolver through `organization_closure`.
- Added `POST /api/v1/organizations/{organization_id}/cards` for
  organization-centered card creation.
- Frontend ordinary card creation no longer asks for a registry.
- Disposable PostgreSQL verification applied Alembic head and confirmed
  `ck_registries_default_owner_requires_owner`,
  `ix_registries_owner_organization_id`, and
  `uq_registries_default_owner_tree_active`.
- Production migration was applied after backup/preflight/post-checks. Production
  Alembic version is `0016_default_registry_tree`.

## Phase 6D: Common Schema With Organization-Owned References

Status: completed.

Purpose:

Keep blocks/fields common while allowing subordinate organizations to maintain
their own allowed values for fields such as local departments.

Required work:

1. Define reference resolution policy for each select/multi-select field:
   central fixed list or organization-effective list.
2. Resolve effective reference lists by card organization.
3. Validate selected reference items against the effective list.
4. Allow scoped org admins to manage organization-owned reference lists/items
   where their permissions allow it.
5. Deny edits to locked inherited lists.
6. Keep central schema editing restricted to system/registry admins.
7. Show clear Russian UI labels separating:
   - common schema fields;
   - central reference lists;
   - organization-owned reference lists.

Required tests:

- Central locked reference list is usable by descendants.
- Descendant admin cannot edit locked inherited list.
- Descendant admin can create/edit their own allowed local list.
- Card in descendant organization sees local options for an organization-local
  field.
- Card in another organization does not see sibling local options.
- Submitted reference item from the wrong organization scope is rejected.
- Public-link select options use the same effective-list rules for the target
  card organization.

Acceptance criteria:

- One registry schema can serve all organizations in the tree.
- Subordinate organizations can maintain local value lists where allowed.
- Sibling organization reference values do not leak.
- Schema management and local dictionary management are separate permissions.

Implementation notes:

- Uses existing `form_fields.options_config_json` for reference resolution
  policy.
- `reference_resolution="by_card_organization"` and/or
  `allow_owner_override=true` make select/multi-select fields resolve values by
  the target card organization.
- Exact organization-owned list replaces inherited values for that field.
- Fixed lists keep the existing `options_source_id` behavior.
- Authenticated card field option loading uses
  `GET /api/v1/cards/{card_id}/fields/{field_id}/reference-items`.
- Public-link preview/edit uses the same effective-list resolver for the target
  card organization.
- PostgreSQL-backed service tests passed against a disposable `_test` database.
- Live API checks confirmed child organization local reference options, sibling
  fallback to root inherited options, wrong-scope reference rejection, and
  public-link preview/edit effective options.

## Phase 6E: Browser And Live Verification

Status: completed.

Scope:

- Verify organization tree UI.
- Verify the one-root organization UX:
  - first organization can be created as root;
  - after root exists, `Без родительской организации` is absent from ordinary
    creation flow;
  - new organizations are created as descendants.
- Verify clean card creation without manual registry selection.
- Verify default registry resolution for root and descendant organizations.
- Verify default registry archive guard when active/draft cards exist.
- Verify existing registry-based API compatibility.
- Verify local organization reference lists in card editing and public-link
  editing if public fields use those lists.
- Verify audit events for create/update/archive actions changed by this phase.

Checks:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote
pnpm -C frontend e2e
```

Use a disposable/staging database for live workflow checks. Do not run
destructive scenario data against production personal data.

Verification completed:

- `powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote`
  passed locally: backend ruff, backend format check, backend mypy, backend
  pytest, frontend lint, frontend typecheck, frontend tests, frontend build, and
  project-map check.
- `pnpm -C frontend e2e` passed after updating the smoke mocks for the Phase 6
  organization tree endpoint, organization-centered card creation endpoint, and
  card-field effective reference item endpoint.
- Disposable PostgreSQL verification passed on a database whose name ended with
  `_test`: Alembic upgraded to `0016_default_registry_tree`, metadata matched
  migrations, and PostgreSQL-backed Phase 6 service tests passed.
- Production migration used the approved planned-migration flow: server checkout
  synchronized to `origin/main`, production was preflighted at
  `0015_audit_created_at_default`, a fresh backup was created outside Git,
  `alembic upgrade head` moved production to `0016_default_registry_tree`, and
  post-checks verified new columns, constraint, and indexes.
- Frontend deployment rebuilt and uploaded `frontend/dist`, restarted the API
  service, and passed same-origin frontend/API smoke checks.
- Live API checks used a temporary staging database and verified root default
  registry creation, descendant registry inheritance, organization-centered card
  creation, existing registry-based card create compatibility, default-registry
  archive guard, organization-owned reference list resolution, wrong-scope
  reference rejection, and public-link effective reference options.
- Browser checks on the temporary staging runtime verified Russian UI chrome,
  hierarchical organization display, absence of organization type selection,
  absence of `Без родительской организации` after root exists, clean card create
  without manual registry or card org-unit selection, successful card creation,
  effective local reference options in the card editor, and no browser console
  errors.
- Temporary staging service, staging database, and temporary storage directory
  were removed after live verification.

Live notes:

- A staging-only user display name created through the shell bootstrap path was
  mojibaked by shell Unicode handling. Production data was checked separately
  and stores `Системный администратор` correctly, so this is not a Phase 6
  application blocker. Future ad hoc live seed scripts should avoid passing
  Cyrillic display names through shell paths that do not preserve UTF-8.

## Phase 6F: Root/Default Registry Enforcement And Card Workflow Fixes

Status: completed.

Purpose:

Close Phase 6 v1 gaps where the UI hid invalid choices but backend and ordinary
card list workflows could still drift from the accepted one-root/default-registry
model.

Required work:

1. Reject creating a second active root organization in backend service/API
   flows. UI hiding is not the security boundary.
2. Add tests proving a direct backend/API create-root attempt without
   `parent_id` is rejected after the first active root exists.
3. Add an idempotent maintenance service/CLI path to ensure the existing single
   active root organization has exactly one active default registry.
4. Keep the repair path safe:
   - if there is exactly one active root and exactly one active registry with no
     active default, assign that registry as the root default;
   - if there are no active registries, create the standard root default
     registry;
   - if multiple active registries or invalid active defaults exist, fail and
     require an explicit operator decision.
5. Add `GET /api/v1/organizations/{organization_id}/cards` using the
   default-registry resolver. Preserve existing
   `GET /api/v1/registries/{registry_id}/cards` for compatibility.
6. Fix ordinary frontend card list workflow so it calls the organization-centered
   list endpoint and never uses `registries[0]` as an implicit card registry.
7. Hide card `org_unit_id` metadata from the simple card workflow until an
   explicit advanced metadata/filter workflow is approved.
8. Do not implement multi-root support.
9. Do not add `available_to_descendants`.
10. Do not create one registry per organization.
11. Do not remove existing registry-based APIs.

Implementation notes:

- Added `OrganizationTopologyError` and a backend guard before root creation.
- Added `RegistrySchemaService.ensure_single_root_default_registry()`.
- Added CLI:

```powershell
cd backend
python -m app.cli.phase6f preflight
python -m app.cli.phase6f ensure-default-registry
```

- Added organization-centered card list API:

```http
GET /api/v1/organizations/{organization_id}/cards
```

- The query parameter `organization_id` remains available on the new endpoint as
  a card-organization filter; the path organization is the default-registry
  resolver context.
- The frontend ordinary card workspace now uses the organization-centered list
  endpoint and keeps old registry-based APIs for advanced/import/export/report
  surfaces.

Production/staging SQL preflight:

Run before Phase 6F live checks or before applying the repair CLI to a
non-disposable database. Expected result is one active root organization, one
active default registry, and the default registry owner equal to the active root
id.

```sql
with active_roots as (
    select id
    from organizations
    where parent_id is null
      and archived_at is null
      and is_active = true
),
active_defaults as (
    select id, owner_organization_id
    from registries
    where is_default_for_owner_tree = true
      and archived_at is null
      and lifecycle_status <> 'archived'
)
select
    (select count(*) from active_roots) as active_root_organizations,
    (select count(*) from active_defaults) as active_default_registries,
    (
        select count(*)
        from active_defaults d
        join active_roots r on r.id = d.owner_organization_id
    ) as defaults_owned_by_active_root;
```

Detailed owner check:

```sql
select
    d.id as default_registry_id,
    d.owner_organization_id,
    r.id as root_organization_id,
    (d.owner_organization_id = r.id) as default_owner_equals_root
from registries d
cross join organizations r
where d.is_default_for_owner_tree = true
  and d.archived_at is null
  and d.lifecycle_status <> 'archived'
  and r.parent_id is null
  and r.archived_at is null
  and r.is_active = true;
```

Acceptance criteria:

- Backend rejects a second active root organization.
- Tests prove direct backend/API calls are protected, not only the UI.
- Existing data can be safely checked and repaired to one root default registry.
- Ordinary card list uses the resolved default registry, not an arbitrary first
  registry.
- Simple card UI does not show card org-unit metadata.
- Existing registry-based APIs remain available.
- Full backend, frontend, e2e, disposable PostgreSQL, and Phase 6 live checks are
  recorded before marking the phase fully completed.

Verification completed:

- Local `powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote`
  passed: backend ruff, backend format check, backend mypy, backend pytest,
  frontend lint, frontend typecheck, frontend unit tests, frontend build, and
  project-map check.
- Local `pnpm -C frontend e2e` passed: 3 Playwright smoke tests.
- Disposable PostgreSQL verification on the server passed against a database
  whose name ended with `_test`: `tests/test_database_smoke.py`,
  `tests/test_registry_card_services.py`, and `tests/test_api_phase_1g.py`
  reported 28 passed.
- Production Phase 6F preflight initially found one active root organization and
  no active default registry. A fresh server-side backup was created outside Git,
  then `python -m app.cli.phase6f ensure-default-registry` assigned the existing
  active registry as the root default.
- Production post-check reported one active root organization, one active default
  registry, and one root-owned active default registry.
- Server checkout was synchronized to `origin/main`; server checks passed.
- API service restart passed healthcheck on the deployed server.
- Live API check on a temporary uvicorn runtime with disposable PostgreSQL
  verified:
  - second root creation returns 400;
  - organization-centered card list includes the default-registry card;
  - organization-centered card list does not leak an arbitrary registry card.
- Browser live smoke on the deployed server verified the Russian login page,
  title `Реестровая система`, and visible `Войти` action.

## Non-Goals For Phase 6

- Do not create a hardcoded employee table.
- Do not add HR-specific fixed backend columns.
- Do not create one registry per organization.
- Do not support multiple root organizations in Phase 6 v1.
- Do not physically delete `organizations.type` or `org_units` in the UI
  cleanup slice.
- Do not bypass backend RBAC with frontend-only filtering.
- Do not remove existing REST/MCP compatibility endpoints without a separate
  deprecation plan.
- Do not change production schema unless the active implementation phase
  requires a migration and the project migration rules are satisfied.

## Phase 7A: Admin UI Workspace Refactor

Status: completed locally.

Purpose:

Improve the existing Russian-first admin UI without adding backend business
logic or new product features. The focus is faster navigation, clearer page
structure, and less visual overload for card and registry workflows.

Implemented scope:

1. Card workspace:
   - changed the layout to a focused card list plus selected-card detail area;
   - added tabs for `Поля`, `Вложения`, `Документы`, `Публичные ссылки`, and
     `История`;
   - kept bulk field editing as the primary ordinary field editor;
   - kept `file_ref` editing in the attachment-aware single-field editor;
   - kept attachments, generated documents, and public links on their own tabs;
   - kept card org-unit metadata hidden from the simple card workflow.
2. Registry workspace:
   - added tabs for `Схема карточки`, `Справочники`, `Импорт и экспорт`, and
     `Отчеты`;
   - kept registry/schema APIs and existing advanced functionality intact;
   - made reference lists, import/export, and reports focused sections instead
     of always-visible panels.
3. Organization/registry row actions:
   - visible row actions now use compact Russian labels such as `Изменить` and
     `В архив`;
   - full entity-specific action labels remain available through accessible
     names, for example `Редактировать организацию <name>`.
4. Layout hardening:
   - added shared accessible workspace tabs;
   - adjusted table and tree wrapping so Russian text does not break into
     single-letter columns in ordinary desktop layouts.

Non-goals:

- No backend endpoint, service, auth, RBAC, schema, or migration changes.
- No hardcoded employee/HR card fields.
- No new import/export, reports, documents, or MCP capability.
- No production migration.

Verification completed:

- `pnpm -C frontend test:run src/App.test.tsx`: 41 passed.
- `pnpm -C frontend test:run`: 5 files passed, 50 tests passed.
- `pnpm -C frontend format:check`: passed.
- `pnpm -C frontend lint`: passed.
- `pnpm -C frontend typecheck`: passed.
- `pnpm -C frontend build`: passed.
- `pnpm -C frontend e2e`: 3 Playwright smoke tests passed after updating the
  browser scenarios to use the new tabs.

Known limitations:

- `История` is a placeholder tab in the card workspace and does not yet load a
  dedicated card-scoped audit feed.
- This phase is frontend-only and does not change backend APIs, migrations, or
  production data.

## Phase 7B: Technical Code Autogeneration In UI

Status: completed, pushed to `main`, deployed, and live-verified.

Purpose:

Remove avoidable user-facing technical-code input from ordinary admin create
forms while preserving the backend's existing schema-driven `code` contract.

Implemented scope:

1. Added a shared frontend technical-code generator:
   - transliterates Cyrillic names to lowercase Latin slugs;
   - normalizes separators to `_`;
   - uses a safe prefix fallback when the source name is empty or starts with a
     digit;
   - appends `_2`, `_3`, and later suffixes when the generated code already
     exists in the currently loaded list.
2. Hid manual technical-code inputs in create forms for:
   - organizations;
   - registries;
   - form blocks;
   - form fields;
   - reference lists;
   - reference items;
   - document templates;
   - report templates.
3. Kept technical codes visible in tables/details as diagnostic metadata.
4. Kept edit flows from changing existing technical codes.
5. Kept backend APIs, services, schemas, migrations, auth, RBAC, import/export,
   documents, reports, and MCP capabilities unchanged.

Required behavior:

- Backend payloads still include `code`.
- User-visible create forms ask for names/titles/labels, not manual technical
  codes.
- Empty-name validation still prevents create requests without a user-facing
  name.
- Duplicate generated codes are handled client-side with suffixes, while the
  backend remains the final constraint authority.

Verification completed:

- `pnpm -C frontend test:run src/app/technicalCode.test.ts`: 3 passed.
- `pnpm -C frontend test:run`: 6 files passed, 53 tests passed.
- `pnpm -C frontend format:check`: passed.
- `pnpm -C frontend lint`: passed.
- `pnpm -C frontend typecheck`: passed.
- `pnpm -C frontend build`: passed.
- `pnpm -C frontend e2e`: 3 Playwright smoke tests passed.
- `powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote`:
  passed, including backend ruff, backend format check, backend mypy, backend
  pytest, frontend lint, frontend typecheck, frontend tests, frontend build,
  and project-map check.
- `powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1`: server checkout
  fast-forwarded to commit `2786847` and server checks passed.
- `powershell -ExecutionPolicy Bypass -File scripts/deploy-frontend.ps1`:
  rebuilt and uploaded `frontend/dist`, restarted `reg-engine.service`, and
  passed same-origin frontend/API smoke checks.
- Browser live check on `http://192.168.100.12:8000/` verified Russian page
  title, active authenticated admin shell, and absence of manual technical-code
  fields in create forms for organization, registry, form block, and form field.

Known limitations:

- The frontend only checks collisions against currently loaded entities. Backend
  unique constraints remain authoritative for concurrent or stale-client cases.
- Technical code editing for existing entities remains intentionally out of
  scope.
