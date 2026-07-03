# PLANS.md

## Project

Registry Engine is a configurable web engine for schema-driven registries. It is
not a hardcoded employee registry.

## Current Stop Point

- Completed baseline: backend, frontend, attachments, generated documents,
  import/export, reports, MCP phases through Phase 5R, live verification, and
  production follow-up fixes are implemented on `main`.
- Phase 6 organization-centered card workflow cleanup is implemented and
  verified.
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
- Phase 7C card editor tabs, draft-state persistence, required field mode, and
  required-field validation are implemented and locally verified. No database
  migration is required because `form_fields.required_mode` already exists.
- Phase 7D organization tag search for the card list is implemented on `main`,
  pushed to GitHub, deployed to the server, and browser-smoke verified: users
  can filter cards by one or many RBAC-visible organizations, selected parent
  organizations include descendants by default, and the descendants mode is
  controlled by a visible tag toggle.
- Phase 7E unified card tag search is implemented on `main`, pushed to GitHub,
  deployed to the server, and live-smoke verified: the ordinary card list now
  uses one Russian-first search bar for free-text, organization, and
  schema-field tags; backend list APIs accept typed field filters without
  bypassing RBAC.
- Phase 7E.1 card tag search UX polish is implemented on `main`, pushed to
  GitHub, deployed to the server, and live-smoke verified: the search input is
  now the primary long control, focusing it opens the available tag list, and
  the organization selector is launched from the same tag workflow.
- Phase 7E.2 card tag search inline-entry polish is implemented on `main`,
  pushed to GitHub, deployed to the server, and live-smoke verified:
  organization filtering is no longer rendered as a separate duplicate
  control, selected filters are chips inside the same search box, and field
  values are entered inline as `Поле: значение` before Enter creates the tag.
- Phase 7E.3 card editor action-panel hardening is implemented on `main`,
  pushed to GitHub, deployed to the server, and live-smoke verified:
  the tag-search menu closes on outside click/Escape, opened card tabs have a
  close button with an unsaved-changes warning, and save/activate/archive card
  actions live in one sticky `Панель действий карточки` instead of being split
  across metadata and the bulk-field form.
- Phase 7F visual registry schema/reference editor is implemented on `main`,
  pushed to GitHub, deployed to the server frontend, and live-smoke verified:
  `Схема карточки` now uses one visual editor where fields live inside blocks,
  technical codes/positions/descriptions are not manual create-form burden, and
  `Справочники` now edits reference-list metadata and items in one selected-list
  editor.
- Production migration `0016_default_registry_tree` was applied on 2026-07-01
  after disposable PostgreSQL verification, a fresh server-side backup stored
  outside Git, preflight checks, and post-migration schema checks.
- Phase 7H: Inline Visual Editor Polish And Reference List Workspace is
  implemented on `main`, pushed to GitHub,
  deployed to the server, migrated to Alembic head
  `0017_registry_card_title_label`, and live-verified against
  `http://192.168.100.12:8000/`.
- Phase 7H.1 reference-list inline metadata and item-ordering polish is
  completed: reference-list edit/archive header buttons are removed, metadata
  is edited in place, item creation opens from the bottom add slot, manual item
  description/position inputs are removed from the ordinary UI, and item order
  is changed by mouse drag/drop. No database migration is required.
- Phase 7H.2 card tag search/reference-filter and organization-parent bugfix
  is completed on `main`, pushed to GitHub, deployed to the server frontend,
  and browser live-verified. No database migration is required.
- Phase 7I: Card Templates And Inline Search Completion is implemented on
  `main`, pushed to GitHub, deployed to the server, migrated to Alembic head
  `0018_card_templates`, and live-smoke verified against
  `http://192.168.100.12:8000/`. It adds card templates, template-based card
  creation, template search tags, inline typed tag choices for select,
  multi-select, bool, date, number, and text fields, readable public-link URLs,
  and mouse drag/drop field ordering in the visual schema editor.
- Phase 7I.1 base/default template enforcement is implemented on `main`,
  pushed to GitHub, deployed to the server, migrated to Alembic head
  `0019_base_card_templates`, and server/browser-smoke verified. Free-schema
  card creation is removed from the UI, backend card creation resolves a base
  template when old callers omit `card_template_id`, cards require
  `card_template_id`, and the card UI now shows `Шаблон карточки` instead of a
  separate user-facing `Название карточки`.
- Phase 7I.2 template-list-first schema editor polish is implemented and
  locally verified: the schema tab opens with the card-template list only,
  selecting a template opens the visual block/field editor, and the separate
  checkbox/default-value template editor is removed from the ordinary UI. No
  database migration or backend API change is required.
- Phase 7J schema layout/static-text variant B is implemented, deployed, and
  browser-verified: blocks get a 1-3 column layout, fields get visual
  placement/display settings, `static_text` fields render as non-editable
  template text, schema editing opens by clicking templates/blocks/fields, and
  the admin navigation can be collapsed. Production migration
  `0020_schema_layout_static_text` is applied.
- Phase 7J.1 schema grid hardening is completed on `main`, pushed to GitHub,
  deployed to the server, and live-verified: the user-facing block
  column-count setting is removed, field technical codes are hidden in visual
  field rows, expanded field edit rows collapse by clicking the field summary
  again, and field grid placement is stored per field through
  `display_config_json.layout_row`, `layout_column`, and `column_span` without a
  new migration.
- Phase 7J.2 schema grid interaction polish is completed on `main`, pushed to
  GitHub, deployed to the server frontend, and live-verified: expanded block
  edit forms now collapse on repeated block-header click, mouse-holding any
  field drag handle opens per-row placement slots, row/column/width controls
  are removed from the ordinary field edit form, label-position and separator
  settings are visual choices, and field width is changed through the visual
  resize handle. No database migration is required.
- Phase 7J.3 schema placement grid usability is completed on `main`, pushed to
  GitHub, deployed to the server frontend, and live-verified: the visual
  placement grid is now a separate 10-row by 5-column panel, the current field
  cell is highlighted and disabled, the grid closes on repeated handle
  click/Escape/drop/outside click, and mouse drag/drop is applied through grid
  cells. No database migration is required.
- Phase 7J.4 schema placement occupied-cell hardening is completed on `main`,
  deployed to the server frontend, and live browser verified: when a field
  placement grid is active, all fields in the block are shown inside grid
  cells, occupied cells are disabled drop targets, and the ordinary field list
  is hidden to avoid duplicate placement surfaces. No database migration is
  required.
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
  passed, including backend ruff/format/mypy/pytest, frontend lint/typecheck/
  test/build, and project-map check.
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

## Phase 7C: Card Tabs, Draft Persistence, And Required Fields

Status: completed locally and ready for GitHub/server synchronization.

Purpose:

Make the card workspace safer for ordinary users before deeper UI redesign
work: opening cards should not destroy list context, unsaved values should not
disappear on refresh, and required card fields must be explicit and enforced by
the backend, not only by the frontend.

Implemented scope:

1. Card workspace:
   - added top-level card workspace tabs with `Список карточек` as the search
     and filter tab;
   - opening an existing card by double click creates a dedicated card tab;
   - opened card tabs and the active card tab are saved in local storage;
   - unsaved bulk field edits are saved as a per-user/per-card local draft;
   - dirty card tabs show `*` and restore after remount/page refresh;
   - the lower editor panel shows validation errors, unsaved state, and saved
     state in Russian.
2. Registry workspace:
   - kept `Реестры` as its own setup subtab;
   - schema blocks/fields remain under `Схема карточки`;
   - e2e and unit flows now use the explicit registry setup tabs.
3. Required fields:
   - exposed `required_mode` in form-field create/read/update schemas and API
     payloads;
   - added Russian UI control `Обязательность поля`;
   - supported `not_required`, `required`, and `required_on_publish`;
   - backend bulk field save rejects empty active `required` fields;
   - single field save and public-link field save reject empty `required`
     assignments;
   - card activation to `active` validates both `required` and
     `required_on_publish` fields;
   - normal card metadata update can activate a draft card through
     `lifecycle_status="active"`.

Non-goals:

- No new database migration.
- No new business-specific card fields or employee/HR columns.
- No new import/export, report, document, attachment, MCP, auth, or RBAC
  capability.
- No public-link `file_ref` editing changes.

Verification completed:

- `backend\.venv\Scripts\python.exe -m pytest`: 128 passed, 160 skipped.
- `pnpm -C frontend test:run`: 6 files passed, 56 tests passed.
- `backend\.venv\Scripts\ruff.exe check .`: passed.
- `backend\.venv\Scripts\ruff.exe format --check .`: passed.
- `backend\.venv\Scripts\mypy.exe app`: passed.
- `pnpm -C frontend lint`: passed.
- `pnpm -C frontend typecheck`: passed.
- `pnpm -C frontend build`: passed.
- `pnpm -C frontend e2e`: 3 passed.
- `powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote`:
  passed.
- `powershell -ExecutionPolicy Bypass -File scripts/project-map.ps1`: updated
  and checked `docs/PROJECT_TREE.md`.

Known limitations:

- `TEST_DATABASE_URL` was not set in the local PowerShell environment, so
  PostgreSQL-backed optional service smoke tests that require a disposable
  `_test` database remained skipped in the normal backend test run.
- Card tab drafts are MVP local-browser state, consistent with the current
  documented browser-session limitations; they are not a production-grade
  server-side autosave system.

## Phase 7D: Organization Tag Search In Card List

Status: completed, pushed to `main`, deployed, and live browser-smoke verified.

Purpose:

Make the ordinary card list search closer to a tag-based workflow while keeping
backend RBAC as the security boundary. This slice covers organization tags
first; dynamic field tags remain the next step.

Implemented scope:

1. Backend card list filtering:
   - `GET /api/v1/organizations/{organization_id}/cards` accepts repeated
     `organization_ids` query parameters;
   - `GET /api/v1/registries/{registry_id}/cards` accepts the same parameters
     for compatibility;
   - `include_descendant_organizations` defaults to `true`;
   - the old single `organization_id` query parameter remains supported;
   - requested organizations are first checked against the actor's RBAC
     organization scope;
   - descendants are expanded only for selected organizations already visible to
     the actor;
   - the final filter is intersected with backend RBAC scope, so frontend
     filtering is not the access-control boundary.
2. Frontend card list:
   - replaced the single organization select with the tag
     `Организации: все доступные`;
   - the tag opens a compact organization tree with checkboxes;
   - one or many organizations can be selected;
   - `Включать подведомственные` is enabled by default and can be toggled;
   - selected state is persisted in the existing workspace UI localStorage;
   - old single-organization localStorage state is migrated to the new array
     shape.

Non-goals:

- No dynamic field tag search yet.
- No saved filters.
- No new database migration.
- No hardcoded employee or HR-specific search fields.
- No frontend-only RBAC filtering.
- No changes to import/export, reports, documents, attachments, MCP, auth, or
  public-link workflows.

Verification completed:

- Added backend PostgreSQL-backed API regression coverage for repeated
  `organization_ids`, descendants mode, exact mode, and inaccessible
  organization filtering.
- Added frontend regression coverage for the Russian organization tag UI and
  query serialization.
- `backend\.venv\Scripts\python.exe -m pytest`: 128 passed, 161 skipped.
- `backend\.venv\Scripts\ruff.exe check backend`: passed.
- `backend\.venv\Scripts\ruff.exe format --check backend`: passed.
- `backend\.venv\Scripts\mypy.exe backend/app`: passed.
- `pnpm -C frontend test:run`: 6 files passed, 56 tests passed.
- `pnpm -C frontend lint`: passed.
- `pnpm -C frontend typecheck`: passed.
- `pnpm -C frontend build`: passed.
- `pnpm -C frontend format:check`: passed after applying Prettier to changed
  frontend files.
- `pnpm -C frontend e2e`: 3 Playwright smoke tests passed.
- `powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote`:
  passed after re-running separately from e2e to avoid a transient Playwright
  `frontend/test-results` directory race.
- `powershell -ExecutionPolicy Bypass -File scripts/project-map.ps1`: updated
  and checked `docs/PROJECT_TREE.md`.
- `powershell -ExecutionPolicy Bypass -File scripts/push-git.ps1 -Message
  "Implement organization tag card filtering" -SkipCheck`: committed and pushed
  implementation commit `ee68e9b` to `origin/main`.
- `powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1`: server checkout
  fast-forwarded to `ee68e9b`, backend editable package installed, and
  server-check passed.
- `powershell -ExecutionPolicy Bypass -File scripts/deploy-frontend.ps1`: built
  and uploaded `frontend/dist`, restarted `reg-engine.service`, and passed
  same-origin frontend/API smoke.
- Browser live smoke on `http://192.168.100.12:8000/` verified the card list
  tag `Организации: все доступные`, the popover action `Все доступные`, the
  checked default toggle `Включать подведомственные`, selecting the accessible
  organization, the resulting tag with `+ подведомственные`, and no browser
  console errors.

Known limitations:

- Dynamic field tags were deferred from Phase 7D and implemented in Phase 7E.
- `TEST_DATABASE_URL` was not set in the local PowerShell environment, so the
  new PostgreSQL-backed API regression test is present but skipped in the local
  aggregate pytest run until a disposable `_test` database is configured.

## Phase 7E: Unified Card Tag Search Bar

Status: completed, pushed to `main`, deployed, and live-smoke verified.

Purpose:

Unify ordinary card search into one Russian-first search bar so users can work
with free-text, organization, and schema-field filters as visible tags instead
of separate disconnected controls. Backend list APIs remain the filtering and
RBAC boundary.

Implemented scope:

1. Backend card list filtering:
   - `GET /api/v1/organizations/{organization_id}/cards` accepts optional
     `filters` as a JSON array of typed dynamic field filters;
   - `GET /api/v1/registries/{registry_id}/cards` accepts the same `filters`
     parameter for compatibility;
   - existing `q`, `organization_ids`, `include_descendant_organizations`, and
     `include_archive` parameters remain compatible;
   - `q` now matches both `cards.display_name` and text dynamic values in
     `field_values.value_text`;
   - field tags are enforced through backend SQL predicates over typed
     `field_values` columns and `field_value_items` for multi-select;
   - field filters are validated against active schema fields belonging to the
     filtered registry.
2. Frontend card list:
   - replaced the separate search input plus standalone organization tag with
     one `Поисковая строка карточек` control;
   - expanded the search input into the primary wide control so text and tags
     fit inside the search row;
   - focusing the search input opens one available-tags menu with
     `Организации` and active schema fields;
   - removed the separate organization-filter button from the search row;
   - selected organization filters render as chips inside the same search box;
   - selecting a text-like schema field switches the same search input into
     inline `Поле: значение` entry, and Enter creates the field tag;
   - free text becomes a visible `Текст: ...` tag after Enter;
   - the current organization tag selector is rendered inside the same search
     row and still supports multiple RBAC-visible organizations plus the
     descendants toggle;
   - active schema fields can be added as field tags from the same search-menu
     workflow;
   - field tag state is persisted in the existing workspace UI localStorage;
   - the ordinary card list continues to call the organization-centered list
     endpoint and does not perform frontend-only access filtering.

Supported field tag behavior in the first UI slice:

- `text`: contains search;
- `bool`: exact true/false search;
- `select`: exact reference item search when the field has a reference list;
- `multi_select`: contains reference item search when the field has a reference
  list;
- `number`, `date`, and `datetime`: backend contract exists, with simple text
  entry in the first UI slice.

Non-goals:

- No saved filter presets.
- No advanced OR/NOT query language.
- No separate report-builder search UI.
- No hardcoded employee or HR-specific search fields.
- No frontend-only RBAC filtering.
- No database migration.
- No import/export, documents, attachments, MCP, auth, or public-link changes.

Verification completed so far:

- Added backend PostgreSQL-backed regression coverage for dynamic text search
  and field-filter JSON parameters.
- Added frontend regression coverage for the unified search bar, text tags,
  organization tags, and dynamic field tags.
- `pnpm -C frontend test:run src/App.test.tsx -t "dynamic field filters"`:
  passed.
- `pnpm -C frontend test:run src/App.test.tsx -t "filters cards by search
  organization"`: passed.
- `pnpm -C frontend test:run`: 6 files passed, 57 tests passed.
- `pnpm -C frontend typecheck`: passed.
- `pnpm -C frontend test:run src/App.test.tsx -t "filters cards by search
  organization|dynamic field filters"`: passed for the Phase 7E.1 search-menu
  regression.
- `pnpm -C frontend lint`: passed for the Phase 7E.1 UI polish.
- `pnpm -C frontend format:check`: passed for the Phase 7E.1 UI polish.
- `pnpm -C frontend typecheck`: passed for the Phase 7E.1 UI polish.
- `pnpm -C frontend test:run`: 6 files passed, 57 tests passed for the Phase
  7E.1 UI polish.
- `pnpm -C frontend build`: passed for the Phase 7E.1 UI polish.
- `pnpm -C frontend e2e`: 3 Playwright smoke tests passed for the Phase 7E.1
  UI polish.
- `pnpm -C frontend test:run src/App.test.tsx -t "filters cards by search
  organization|dynamic field filters"`: passed for the Phase 7E.2 inline-entry
  regression.
- `pnpm -C frontend lint`: passed for the Phase 7E.2 UI polish.
- `pnpm -C frontend format:check`: passed for the Phase 7E.2 UI polish.
- `pnpm -C frontend typecheck`: passed for the Phase 7E.2 UI polish.
- `pnpm -C frontend test:run`: 6 files passed, 57 tests passed for the Phase
  7E.2 UI polish.
- `pnpm -C frontend build`: passed for the Phase 7E.2 UI polish.
- `pnpm -C frontend e2e`: 3 Playwright smoke tests passed for the Phase 7E.2
  UI polish.
- `powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote`:
  passed for the Phase 7E.2 UI polish.
- `pnpm -C frontend test:run src/App.test.tsx -t "warns before closing a dirty
  card tab|shows card editor actions in the sticky card panel|filters cards by
  search organization"`: passed for the Phase 7E.3 card editor/search
  regressions.
- `pnpm -C frontend test:run`: 6 files passed, 59 tests passed for the Phase
  7E.3 UI hardening.
- `pnpm -C frontend lint`: passed for the Phase 7E.3 UI hardening.
- `pnpm -C frontend typecheck`: passed for the Phase 7E.3 UI hardening.
- `pnpm -C frontend format:check`: passed for the Phase 7E.3 UI hardening.
- `pnpm -C frontend build`: passed for the Phase 7E.3 UI hardening.
- `pnpm -C frontend e2e`: 3 Playwright smoke tests passed for the Phase 7E.3
  UI hardening.
- `powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote`:
  passed for the Phase 7E.3 UI hardening.
- `powershell -ExecutionPolicy Bypass -File scripts/push-git.ps1 -Message
  "Harden card editor actions"`: committed and pushed `765c6b28` to
  `origin/main` after the full local check passed.
- `powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1`: server
  checkout fast-forwarded to `765c6b2` and server checks passed.
- `powershell -ExecutionPolicy Bypass -File scripts/deploy-frontend.ps1`:
  rebuilt and uploaded `frontend/dist`, restarted `reg-engine.service`, and
  passed same-origin frontend/API smoke.
- In-app browser live smoke on `http://192.168.100.12:8000/` verified the page
  title `Реестровая система`, zero browser warning/error logs, the card search
  tag menu closing on outside click, visible close buttons for open card tabs,
  no old `Редактировать карточку` button, and the sticky
  `Панель действий карточки` with save, activate, and archive actions.
- `powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1`: server
  checkout fast-forwarded to `e9632be` and server checks passed.
- `powershell -ExecutionPolicy Bypass -File scripts/deploy-frontend.ps1`:
  rebuilt and uploaded `frontend/dist`, restarted `reg-engine.service`, and
  passed same-origin frontend/API smoke.
- Live Playwright smoke on `http://192.168.100.12:8000/` verified no separate
  `.card-tag-organization-filter`, a 1266px highlighted search row with a
  1242px input area, a tag menu attached 6px below the search box, inline
  `Фамилия: Светлана` tag creation by Enter, no separate field-value form, and
  no browser console errors. The in-app browser runtime timed out during this
  check, so the deployed UI was verified with the project's Playwright runtime.
- `powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote`:
  passed for the Phase 7E.1 UI polish.
- `powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1`: server
  checkout fast-forwarded to `ff71053` and server checks passed.
- `powershell -ExecutionPolicy Bypass -File scripts/deploy-frontend.ps1`:
  rebuilt and uploaded `frontend/dist`, restarted `reg-engine.service`, and
  passed same-origin frontend/API smoke.
- Live Playwright smoke on `http://192.168.100.12:8000/` verified a 1266px
  search row, a 1010px search input, one available-tags menu with
  `Организации` plus the current schema field, field-filter draft opening after
  field selection, and no browser console errors. The in-app browser runtime
  timed out during this check, so the deployed UI was verified with the
  project's Playwright runtime.
- `backend\.venv\Scripts\ruff.exe check
  backend\app\api\v1\endpoints\cards.py backend\app\services\cards.py
  backend\tests\test_api_phase_1g.py`: passed.
- `backend\.venv\Scripts\mypy.exe backend\app\api\v1\endpoints\cards.py
  backend\app\services\cards.py`: passed.
- `backend\.venv\Scripts\python.exe -m pytest`: 128 passed, 162 skipped.
- `backend\.venv\Scripts\ruff.exe check backend`: passed.
- `backend\.venv\Scripts\ruff.exe format --check backend`: passed.
- `backend\.venv\Scripts\mypy.exe backend\app`: passed.
- `pnpm -C frontend lint`: passed.
- `pnpm -C frontend typecheck`: passed.
- `pnpm -C frontend format:check`: passed.
- `pnpm -C frontend build`: passed.
- `pnpm -C frontend e2e`: 3 Playwright smoke tests passed.
- `powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote`:
  passed after a separate rerun. The first run was interrupted by the known
  transient `frontend/test-results` directory race after parallel e2e.
- `powershell -ExecutionPolicy Bypass -File scripts/project-map.ps1`: updated
  and checked `docs/PROJECT_TREE.md`.
- `powershell -ExecutionPolicy Bypass -File scripts/push-git.ps1 -Message
  "Implement unified card tag search" -SkipCheck`: committed and pushed
  implementation commit `455a310` to `origin/main`.
- `powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1`: server checkout
  fast-forwarded to `455a310` and server checks passed.
- `powershell -ExecutionPolicy Bypass -File scripts/deploy-frontend.ps1`: built
  and uploaded `frontend/dist`, restarted `reg-engine.service`, and passed
  same-origin frontend/API smoke.
- Live Playwright smoke on `http://192.168.100.12:8000/` verified the deployed
  `Поисковая строка карточек`, organization tag control inside the unified
  search row, `Добавить фильтр`, text tag creation, and no browser console
  errors. The in-app browser control was unavailable during this check, so the
  deployed UI was verified with the project's Playwright runtime.

Known limitations:

- Local aggregate backend pytest still skips disposable PostgreSQL tests when
  `TEST_DATABASE_URL` is not configured.
- The first UI slice intentionally keeps field tags simple. Advanced operators,
  grouped OR semantics, and saved searches require a later approved phase.

## Phase 7F: Visual Schema And Reference Editors

Status: completed, pushed to `main`, deployed, and live-smoke verified.

Purpose:

Reduce registry setup friction for non-technical administrators by replacing
separate schema tables with one visual card-schema editor, and by merging
reference-list metadata plus reference items into one selected-list editor.

Implemented scope:

1. `Реестры -> Схема карточки` now renders one visual editor:
   - a card-title preview;
   - form blocks as visual containers;
   - fields displayed inside their block;
   - `+ Добавить поле` from the block context;
   - `+ Добавить блок формы` from the canvas;
   - block and field edit/archive actions remain available.
2. Create forms no longer ask users for manual technical codes, positions, or
   descriptions:
   - technical codes are generated from Russian user-facing names;
   - positions are resolved from the current visual order;
   - field creation uses the selected visual block instead of a separate block
     selector.
3. `Реестры -> Справочники` now uses one editor:
   - the left side selects or creates a reference list;
   - the right side edits the selected reference list metadata;
   - reference items are created, edited, and archived inside the same
     reference-list editor.
4. Existing backend schema/admin APIs remain unchanged.

Non-goals:

- No backend model, migration, or API contract change.
- No drag-and-drop layout persistence yet.
- No business-specific employee fields.
- No import/export, reports, generated documents, attachments, MCP, auth, or
  public-link changes.

Verification completed so far:

- `pnpm -C frontend test:run src/App.test.tsx -t "schema blocks|reference
  lists|wires select|registry workspace|required mode|visual card schema|visual
  block|one editor"`: 8 tests passed.
- `pnpm -C frontend test:run`: 6 files passed, 62 tests passed.
- `pnpm -C frontend lint`: passed.
- `pnpm -C frontend format:check`: passed.
- `pnpm -C frontend typecheck`: passed.
- `pnpm -C frontend build`: passed.
- `pnpm -C frontend e2e`: 3 Playwright smoke tests passed.
- `powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote`:
  passed, including backend ruff/format/mypy/pytest, frontend lint/typecheck/
  test/build, and project-map check.
- `powershell -ExecutionPolicy Bypass -File scripts/push-git.ps1 -Message
  "Add visual registry editors" -SkipCheck`: committed and pushed
  implementation commit `b680340b` to `origin/main`.
- `powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1`: server
  checkout fast-forwarded to `b680340b` and server checks passed.
- `powershell -ExecutionPolicy Bypass -File scripts/deploy-frontend.ps1`:
  rebuilt and uploaded `frontend/dist`, restarted `reg-engine.service`, and
  passed same-origin frontend/API smoke.
- Live Playwright smoke on `http://192.168.100.12:8000/` verified the deployed
  page title `Реестровая система`, visible `Визуальный редактор схемы
  карточки`, visible `Добавить блок формы`, two `Добавить поле в блок` actions,
  no manual `Код блока формы` create field, visible `Редактор справочника`,
  visible `Создать элемент справочника`, and no browser console warnings/errors.
## Phase 7G: Visual Schema Polish And Card List Display Fields

Status: completed, pushed to `main`, deployed, and live-smoke verified.

Purpose:

Close the first live-use gaps in the visual schema editor and ordinary card
list without adding new business-specific registry behavior.

Implemented scope:

1. Field create/edit forms are rendered inside the selected visual block instead
   of above the whole schema canvas.
2. Field create/edit forms are compact:
   - user-facing technical code, position, and description inputs remain hidden
     from create forms;
   - public-link checkboxes are inline with their labels;
   - the form uses a bounded two-column layout on desktop and one column on
     narrow screens.
3. Visual field rows now support ordering through above/below controls that
   update neighboring field positions through the existing field PATCH API.
4. `form_fields.is_list_display` is exposed through API schemas and service
   methods.
5. Schema admins can mark a field as `Отображать поле в списке карточек`.
6. Backend card-list responses include selected `list_fields` values from typed
   dynamic values, so the frontend does not derive list-display values by
   bypassing backend card RBAC.
7. The ordinary card list appends selected field values to each card row detail,
   for example `Статус: drafted`.
8. Registry/schema changes invalidate organization-card list queries because
   list-display field settings affect card rows.

Non-goals:

- No database migration; `form_fields.is_list_display` already exists in Core
  Schema v1.
- No hardcoded employee or HR-specific field labels.
- No drag-and-drop layout persistence.
- No new import/export, reports, generated documents, attachments, MCP, auth,
  or public-link workflows.

Verification completed so far:

- `backend\.venv\Scripts\python.exe -m pytest
  backend\tests\test_required_field_payloads.py -q`: passed.
- `pnpm -C frontend test:run src/App.test.tsx -t "field form compact|changes
  field order|display in the card list"`: passed.
- `backend\.venv\Scripts\python.exe -m pytest`: passed, 129 passed, 162
  skipped, 1 warning.
- `pnpm -C frontend test:run`: passed, 65 passed.
- `pnpm -C frontend e2e`: passed, 3 passed.
- `powershell -ExecutionPolicy Bypass -File scripts\check.ps1 -SkipRemote`:
  passed.
- `powershell -ExecutionPolicy Bypass -File scripts\push-git.ps1 -Message
  "Polish visual schema editor fields"`: passed; code commit `66c10cc4` was
  pushed to `origin/main`.
- `powershell -ExecutionPolicy Bypass -File scripts\deploy.ps1`: passed;
  server checkout fast-forwarded to `66c10cc4` and server checks passed.
- `powershell -ExecutionPolicy Bypass -File scripts\deploy-frontend.ps1`:
  passed; frontend artifact deployed and same-origin smoke check passed.
- Live Playwright smoke on `http://192.168.100.12:8000/`: passed. Verified
  login, schema editor tab, field create form inside the selected block, inline
  checkbox layout, visible field order controls, `Имя` marked as
  `is_list_display`, ordinary card list showing `Имя: Игорь`, and no browser
  console warnings/errors.

## Phase 7H: Inline Visual Editor Polish And Reference List Workspace

Status: completed, pushed to GitHub, deployed to the server, production
migration applied, and live-smoke verified.

Purpose:

Close the next live-use gaps in the registry/card UI without adding
business-specific fields or new product modules.

Implemented scope:

1. Registry schema editor:
   - card title label is editable inline as plain text in the visual editor;
   - `registries.card_title_label` stores the label through migration
     `0017_registry_card_title_label`;
   - field edit forms expand inside the clicked field row;
   - field create forms expand in the clicked `+ Add field` slot inside the
     selected block;
   - block create forms expand at the bottom `+ Add form block` slot;
   - block edit forms render inline in the selected block.
2. Card list search:
   - the archived/superseded visibility control moved into the unified tag
     search workflow;
   - enabling it creates an archive/superseded tag inside the search bar;
   - the old separate archive checkbox is removed from the ordinary card list
     filter area.
3. Reference lists:
   - `Registries -> Reference lists` now uses one expandable list workspace;
   - the selected reference list expands in place and shows properties, items,
     edit actions, and item create/edit/archive actions;
   - reference-list metadata and item editing remain on the existing backend
     API contract.
4. Accessibility:
   - shared admin mutation forms now expose `aria-label` from their visible
     Russian title so inline forms can be identified by tests and assistive
     technologies.

Non-goals:

- No hardcoded employee or HR-specific fields.
- No drag-and-drop block or field layout persistence.
- No new card CRUD behavior beyond UI placement.
- No import/export, reports, generated documents, attachments, MCP, auth, or
  public-link workflow changes.
- No additional production migration beyond `0017_registry_card_title_label`.

Verification completed so far:

- `backend\.venv\Scripts\python.exe -m pytest
  backend\tests\test_required_field_payloads.py -q`: passed.
- `pnpm -C frontend test:run src/App.test.tsx -t "card title label|acted
  row|bottom add-block|search organization and archive|expandable editor"`:
  passed, 5 tests.
- `backend\.venv\Scripts\python.exe -m pytest`: passed, 130 passed, 162
  skipped, 1 warning.
- `backend\.venv\Scripts\ruff.exe check backend`: passed.
- `backend\.venv\Scripts\ruff.exe format --check backend`: passed after
  formatting `backend/app/models/registry_schema.py`.
- `backend\.venv\Scripts\mypy.exe backend\app`: passed.
- `pnpm -C frontend lint`: passed.
- `pnpm -C frontend typecheck`: passed.
- `pnpm -C frontend format:check`: passed after Prettier formatting.
- `pnpm -C frontend test:run`: passed, 68 tests.
- `pnpm -C frontend build`: passed.
- `pnpm -C frontend e2e`: passed, 3 tests.
- `powershell -ExecutionPolicy Bypass -File scripts\project-map.ps1`: updated
  and checked `docs/PROJECT_TREE.md`.
- `powershell -ExecutionPolicy Bypass -File scripts\check.ps1 -SkipRemote`:
  passed, including backend ruff/format/mypy/pytest, frontend lint/typecheck/
  test/build, and project-map check.
- `backend\tests\test_database_smoke.py` migration-head expectation was updated
  to `0017_registry_card_title_label`.
- Server checkout was updated to commit `fc30e44` on `main`.
- Disposable PostgreSQL database `reg_engine_0017_test` passed
  `tests/test_database_smoke.py`: 3 passed, Alembic version
  `0017_registry_card_title_label`.
- Production preflight on `reg_engine` before migration:
  `0016_default_registry_tree`, one active root organization, one active
  default registry, default owner equals root, and no existing
  `registries.card_title_label` column.
- Fresh production backup was created outside Git under
  `/var/backups/reg_engine/` before applying migration `0017`.
- Production `alembic upgrade head` moved `reg_engine` to
  `0017_registry_card_title_label (head)`; post-check confirmed one
  `registries.card_title_label` column, zero null title labels, and one
  registry row.
- `powershell -ExecutionPolicy Bypass -File scripts\deploy-frontend.ps1`:
  passed, including frontend build, service restart, API healthcheck, and
  same-origin frontend smoke.
- `powershell -ExecutionPolicy Bypass -File scripts\server-check.ps1`: passed.
- Live UI Playwright check against `http://192.168.100.12:8000/`: passed.
  Verified page title, authenticated admin shell, editable card title label,
  inline field create/edit forms, bottom block-create form, one expandable
  reference-list workspace with item table, archive/superseded card search tag,
  no console issues, and no HTTP 500 responses. Screenshots were stored outside
  Git in `C:\Temp\reg-engine-live-schema.png`,
  `C:\Temp\reg-engine-live-references.png`, and
  `C:\Temp\reg-engine-live-cards-search.png`.

Remaining risks:

- In-app Browser plugin timed out on basic URL/title reads during verification,
  so final live verification used project Playwright instead.
- The current server environment does not set `AUTH_TOKEN_SECRET`; this remains
  acceptable only for MVP/internal development and must be fixed before any
  production-like hosting.

## Phase 7H.1: Reference List Inline Metadata And Item Ordering Polish

Status: completed on `main`, pushed to GitHub, deployed to the server, and
live-smoke verified. No database migration is required.

Purpose:

Close the live UI comments for `Registries -> Reference lists` without adding a
new product module or business-specific schema.

Implemented scope:

1. Reference-list workspace:
   - removed the separate `Edit` and `Archive` header buttons from expanded
     reference-list cards;
   - made owner organization, descendant inheritance, descendant lock, and
     active/inactive status editable directly in the expanded reference-list
     metadata area;
   - changing status to inactive uses the existing archive confirmation flow.
2. Reference item workflow:
   - removed description and manual position from the ordinary item create/edit
     form;
   - moved item creation to a bottom `+ Add reference item` slot;
   - added mouse drag/drop ordering for existing reference-list items;
   - kept existing item update/archive API compatibility.
3. Backend/API support:
   - extended reference-list update payloads to support inline metadata edits;
   - preserved omitted `owner_organization_id` versus explicit `null`
     semantics, so PATCH can either keep, set, or clear the owner organization;
   - added service tests for metadata update behavior.

Non-goals:

- No new reference-list table or migration.
- No hardcoded employee or HR-specific fields.
- No import/export, reports, generated documents, attachments, MCP, auth, or
  public-link workflow changes.
- No public API removal; existing registry/reference APIs remain compatible.
- Reactivation of archived reference lists remains out of scope for this slice.

Verification completed:

- `backend\.venv\Scripts\python.exe -m pytest`: passed, 131 passed, 163
  skipped, 1 warning.
- `backend\.venv\Scripts\ruff.exe check backend`: passed.
- `backend\.venv\Scripts\ruff.exe format --check backend`: passed.
- `backend\.venv\Scripts\mypy.exe backend\app`: passed.
- `pnpm -C frontend test:run`: passed, 70 tests.
- `pnpm -C frontend lint`: passed.
- `pnpm -C frontend typecheck`: passed.
- `pnpm -C frontend format:check`: passed.
- `pnpm -C frontend build`: passed.
- `pnpm -C frontend e2e`: passed, 3 tests.
- `powershell -ExecutionPolicy Bypass -File scripts\project-map.ps1 -Check`:
  passed.
- `powershell -ExecutionPolicy Bypass -File scripts\check.ps1 -SkipRemote`:
  passed, including backend ruff/format/mypy/pytest, frontend lint/typecheck/
  test/build, and project-map check.
- `git push origin main`: passed for commit `002b1978` with a one-command
  temporary SSH DNS override after local DNS `10.10.10.1` timed out resolving
  `github.com`.
- `powershell -ExecutionPolicy Bypass -File scripts\deploy.ps1`: passed;
  server checkout fast-forwarded to `002b1978`.
- `powershell -ExecutionPolicy Bypass -File scripts\deploy-frontend.ps1`:
  passed, including frontend build, service restart, healthcheck, and
  same-origin frontend smoke.
- `powershell -ExecutionPolicy Bypass -File scripts\server-check.ps1`: passed.
- In-app Browser live smoke on `http://192.168.100.12:8000/`: passed. Verified
  the reference-list workspace has inline owner/status/inheritance controls, no
  separate reference-list header edit/archive buttons, a bottom add-item slot,
  no manual item code/description/position fields in the create form, item drag
  handles, and zero browser console errors. Screenshot stored outside Git at
  `C:\Temp\reg-engine-live-reference-inline-7h1.png`.

## Phase 7H.2: Card Tag Search Reference Filters And Organization Parent Bugfix

Status: completed on `main`, pushed to GitHub, deployed to the server
frontend, and browser live-verified. No database migration is required.

Purpose:

Close the live UI comments for the ordinary card search and organization create
form without adding a new product feature or changing backend business logic.

Implemented scope:

1. Card tag search:
   - select and multi-select schema fields now open reference-list choices
     directly inside the search-tag popover instead of showing raw UUID values;
   - multi-select filters can add multiple selected reference items as separate
     readable chips for the same field;
   - filter chips store a UI-only `value_label`, while list API requests still
     send only `field_id`, `field_type`, `operator`, and `value`;
   - the tag popover is no longer clipped by the card list panel and has a
     higher stacking layer.
2. Organization create form:
   - when the main root organization already exists, the create form initializes
     `parentId` to the first active parent option instead of visually selecting
     it while keeping an empty state value;
   - the ordinary create flow no longer shows the parent-required validation
     error when the only valid parent is already displayed in the selector.

Non-goals:

- No backend filter API change.
- No database migration.
- No registry schema change.
- No new card field types.
- No import/export, reports, generated documents, attachments, MCP, auth, or
  public-link workflow changes.

Verification completed locally:

- `pnpm -C frontend test:run src/App.test.tsx -t "reference field filters|organization hierarchy"`:
  passed, 2 targeted tests.
- `pnpm -C frontend test:run`: passed, 71 tests.
- `pnpm -C frontend typecheck`: passed.
- `pnpm -C frontend lint`: passed.
- `pnpm -C frontend format:check`: passed.
- `powershell -ExecutionPolicy Bypass -File scripts\check.ps1 -SkipRemote`:
  passed, including backend ruff/format/mypy/pytest, frontend lint/typecheck/
  test/build, and project-map check.

Synchronization and live verification:

- `powershell -ExecutionPolicy Bypass -File scripts\push-git.ps1 -SkipCheck
  -Message "Fix card search reference filters"`: passed, creating commit
  `bf8d41a9` on `main` and pushing it to `origin/main`.
- `powershell -ExecutionPolicy Bypass -File scripts\deploy.ps1`: passed;
  server checkout fast-forwarded to `bf8d41a9`.
- `powershell -ExecutionPolicy Bypass -File scripts\deploy-frontend.ps1`:
  passed, including frontend build, service restart, API healthcheck, and
  same-origin frontend smoke.
- `powershell -ExecutionPolicy Bypass -File scripts\server-check.ps1`: passed.
- In-app Browser live smoke on `http://192.168.100.12:8000/`: passed. Verified
  the card search menu opens reference-list choices for multi-select field
  `tst`, selected values render as readable chips such as `tst: 123` and
  `tst: Школа` without UUIDs, the popover is not clipped by the card list
  panel, and the create-organization form initializes its only available parent
  organization as the selected value without showing the parent-required error.
  No browser console errors were present.

## Phase 7I: Card Templates And Inline Search Completion

Status: completed on `main`, synchronized to GitHub and the server, production
migration `0018_card_templates` applied after disposable PostgreSQL
verification and backup.

Purpose:

Complete the user-facing card workflow shift from manual card names to reusable
schema-driven card templates while finishing the inline tag-search behavior
requested during live UI review.

Implemented scope:

1. Card templates:
   - added `card_templates` model/table through migration
     `0018_card_templates`;
   - a template stores a Russian user-facing name, generated technical code,
     selected schema field ids, optional default field values, ordering, active
     state, and archive metadata;
   - registry schema reads now include templates;
   - registry admins can create, edit, list, and archive templates through the
     existing registry/schema admin boundary;
   - ordinary card creation selects a template instead of asking for a manual
     card title;
   - cards store `card_template_id` and use the template name as the default
     display name;
   - active template default values are applied when a new card is created.
2. Card search:
   - the unified card search bar has a template tag;
   - select and multi-select field choices expand inline under the selected
     field row and render readable chips, not raw UUIDs;
   - bool fields expose inline `Да` / `Нет` choices;
   - date, datetime, number, and text fields expose inline value entry inside
     the selected field row;
   - archive/superseded and organization filters remain part of the same
     search bar workflow.
3. Visual schema editor:
   - field ordering now supports mouse drag/drop through row drag handles;
   - existing backend position updates are preserved, with no new reorder API;
   - public-link creation now shows a browser-openable URL in a readonly
     Russian-labeled field.

Non-goals:

- No hardcoded employee or HR-specific fields.
- No one-registry-per-organization behavior.
- No public API removal; existing registry-based card APIs remain compatible.
- No import/export, reports, generated documents, attachments, MCP, auth-flow,
  or public attachment workflow changes.

Verification completed locally:

- `backend\.venv\Scripts\python.exe -m pytest`: passed, 132 passed, 165
  skipped, 1 warning.
- `backend\.venv\Scripts\ruff.exe check backend`: passed.
- `backend\.venv\Scripts\ruff.exe format --check backend`: passed.
- `backend\.venv\Scripts\mypy.exe backend\app`: passed.
- `pnpm -C frontend lint`: passed.
- `pnpm -C frontend typecheck`: passed.
- `pnpm -C frontend format:check`: passed.
- `pnpm -C frontend test:run`: passed, 73 tests.
- `pnpm -C frontend build`: passed.
- `pnpm -C frontend e2e`: passed, 3 tests.
- `powershell -ExecutionPolicy Bypass -File scripts\check.ps1 -SkipRemote`:
  passed.

Migration and deployment notes:

- Local `TEST_DATABASE_URL` was not set, so disposable PostgreSQL verification
  was run on the configured server against `reg_engine_0018_test`.
- Server disposable PostgreSQL verification command passed:
  `sudo -u postgres env TEST_DATABASE_URL=postgresql+psycopg:///reg_engine_0018_test .venv/bin/python -m pytest tests/test_database_smoke.py tests/test_registry_card_services.py -q`
  returned 25 passed.
- Production preflight before migration:
  `alembic_version=0017_registry_card_title_label`,
  `active_root_organizations=1`, `active_default_registries=1`,
  `card_templates_exists=f`, and `cards_has_card_template_id=f`.
- Fresh production backup was created outside Git:
  `/var/backups/reg_engine/reg_engine_before_0018_20260702_144556.dump`.
- Production migration command passed:
  `sudo -u postgres env DATABASE_URL=postgresql+psycopg:///reg_engine .venv/bin/python -m alembic upgrade head`.
- Post-check passed:
  `alembic_version=0018_card_templates`, `card_templates_exists=t`,
  `cards_has_card_template_id=t`, constraint
  `ck_card_templates_position_non_negative`, and indexes
  `ix_card_templates_active_order`, `ix_card_templates_registry_id`,
  `uq_card_templates_registry_id_code`.
- `powershell -ExecutionPolicy Bypass -File scripts\deploy-frontend.ps1`:
  frontend build/upload, service restart, healthcheck, and frontend smoke
  passed.
- `powershell -ExecutionPolicy Bypass -File scripts\server-check.ps1`: passed.
- Browser live smoke against `http://192.168.100.12:8000/` verified:
  Russian UI title, `Схема карточки` shows `Шаблоны карточек`, create-card
  form uses `Шаблон карточки` and no longer shows manual `Название карточки`,
  field drag handles are visible, and the public-links tab remains available.

## Phase 7I.1: Base Template Enforcement And No Free Card Schema

Status: completed on `main`, pushed to GitHub, deployed to the server, migrated
to Alembic head `0019_base_card_templates`, and server/browser-smoke verified.

Purpose:

Close the remaining Phase 7I gap where the UI and API still allowed a card to
exist without an explicit template. The current registry schema must be
available as a base template, and ordinary card creation must always create a
template-backed card.

Implemented scope:

1. Backend base template enforcement:
   - added `BASE_CARD_TEMPLATE_CODE = base_template` and Russian base template
     name `Базовый шаблон`;
   - registry/schema service now ensures the base template exists for each
     registry and refreshes its `field_schema_json` from all active schema
     fields after registry, block, and field changes;
   - the base template cannot be archived or deactivated through ordinary
     schema service methods;
   - card creation without `card_template_id` is still accepted for backwards
     compatibility, but it resolves to the active base template instead of
     creating a free-schema card.
2. Migration:
   - added Alembic revision `0019_base_card_templates`;
   - the migration creates/repairs one active `base_template` per registry,
     backfills cards with missing `card_template_id`, then sets
     `cards.card_template_id` to `NOT NULL`.
3. Frontend:
   - removed the old schema editor `Название карточки` inline form;
   - create-card form defaults to the first active template and no longer has a
     free blank template path when templates exist;
   - card metadata now shows `Шаблон карточки` and the resolved template name
     instead of a separate user-facing `Название карточки`;
   - card search placeholder no longer asks for a card title and instead says
     `Текст карточки или поля`;
   - frontend API types now model returned `card_template_id` as required.
4. Tests:
   - model metadata asserts `cards.card_template_id` is non-nullable;
   - migration SQL test asserts revision `0019_base_card_templates` and the
     `NOT NULL` alter;
   - card service regression tests cover implicit base-template card creation
     and base-template archive protection;
   - frontend tests cover the removed free title editor and template-backed
     card creation;
   - frontend card-workspace regression test asserts the old card-title label is
     not visible and template metadata is visible in the card editor.

Acceptance criteria:

- No hardcoded employee/HR schema is added.
- Existing registry-based card APIs remain compatible.
- Old callers that omit `card_template_id` do not create free-schema cards.
- UI card creation always uses a template-backed workflow.
- Existing cards are backfilled before enforcing `NOT NULL`.
- Production migration is applied only after disposable PostgreSQL verification,
  backup, preflight, and post-check under the standing migration rules.

Verification completed:

- `backend\.venv\Scripts\python.exe -m pytest`: passed, 132 passed, 167
  skipped, 1 warning.
- `backend\.venv\Scripts\python.exe -m ruff check .`: passed.
- `backend\.venv\Scripts\python.exe -m ruff format --check .`: passed.
- `backend\.venv\Scripts\mypy.exe backend\app`: passed.
- `npm --prefix frontend test -- --run`: passed, 6 files and 73 tests.
- `npm --prefix frontend run lint`: passed.
- `npm --prefix frontend run typecheck`: passed.
- `npm --prefix frontend run format:check`: passed.
- `npm --prefix frontend run build`: passed.
- `npm --prefix frontend run e2e`: passed, 3 tests.
- `powershell -ExecutionPolicy Bypass -File scripts\check.ps1 -SkipRemote`:
  passed.
- `npm --prefix frontend test -- --run src/App.test.tsx -t "refactored card workspace|template-backed card"`:
  passed, 1 targeted test and 60 skipped.
- `npm --prefix frontend test -- --run`: passed, 6 files and 73 tests.
- `npm --prefix frontend run lint`: passed.
- `npm --prefix frontend run typecheck`: passed.
- `npm --prefix frontend run format:check`: passed.
- `npm --prefix frontend run build`: passed.
- `npm --prefix frontend run e2e`: passed, 3 tests.

Migration and deployment evidence:

- Server checkout was synchronized to commit `41737f9e` before applying the
  production migration.
- Disposable PostgreSQL verification on `reg_engine_0019_test` passed:
  `tests/test_database_smoke.py tests/test_registry_card_services.py -q`
  returned 27 passed.
- Production preflight before migration confirmed Alembic
  `0018_card_templates`, one active root organization, one active default
  registry, four cards without template, and zero existing active base
  templates.
- Fresh production backup was created outside Git:
  `/var/backups/reg_engine/reg_engine_before_0019_20260702_152846.dump`.
- Production `alembic upgrade head` applied
  `0019_base_card_templates`.
- Post-check confirmed Alembic `0019_base_card_templates`,
  `cards_without_template=0`, `active_base_templates=1`, and
  `cards.card_template_id` is `NOT NULL`.
- `powershell -ExecutionPolicy Bypass -File scripts\deploy-frontend.ps1`:
  frontend build/upload, service restart, API healthcheck, and same-origin
  frontend smoke passed.
- `powershell -ExecutionPolicy Bypass -File scripts\server-check.ps1`: passed.
- In-app Browser live smoke against `http://192.168.100.12:8000/` passed after
  the final frontend deployment: page title is `Реестровая система`, the card
  workspace no longer renders `Название карточки`, `Шаблон карточки` and
  `Базовый шаблон` are visible, and browser console warnings/errors are empty.

Known limitations / next work:

- `display_name` remains in the API and export/document compatibility surface
  for older integrations, but the ordinary Russian UI no longer exposes it as a
  separate card-title field.

## Phase 7I.2: Template-List-First Schema Editor Polish

Status: implemented locally. No database migration is required.

Purpose:

Remove the confusing second template editor from `Реестры -> Схема карточки`
and make the card-template list the single entry point into visual block/field
editing.

Implemented scope:

1. The schema tab now opens with only `Шаблоны карточек` visible.
2. The visual block/field editor appears only after opening a concrete
   template.
3. The old card-template edit form with field checkboxes and default-value
   inputs is no longer rendered in the ordinary schema screen.
4. Creating a template asks only for the template name, generates the technical
   code, creates an empty `field_ids` template, and then opens that template for
   visual editing.
5. Existing block/field create, edit, archive, required-mode, list-display, and
   drag/drop ordering workflows are preserved inside the selected template
   editor.

Non-goals:

- No backend schema change.
- No Alembic migration.
- No hardcoded employee or HR-specific schema.
- No import/export, reports, documents, attachments, MCP, auth-flow, or
  public-link workflow change.
- No true per-template block/field storage migration in this slice; current
  Core Schema v1 fields still belong to the registry, while the UI workflow is
  template-centered.

Verification completed locally:

- `npm --prefix frontend test -- --run src/App.test.tsx -t "visual card schema editor|card templates from the template list|creates form fields with required mode|creates fields from the visual block|keeps the field form compact|opens field edit|opens the block create|changes field order|marks schema fields|creates edits and archives schema blocks|wires select fields|localized locked schema"`:
  passed, 12 tests.
- `npm --prefix frontend test -- --run`: passed, 73 tests.
- `npm --prefix frontend run lint`: passed.
- `npm --prefix frontend run typecheck`: passed.
- `npm --prefix frontend run format:check`: passed.
- `npm --prefix frontend run build`: passed.
- `npm --prefix frontend run e2e`: passed, 3 Playwright smoke tests.
- `powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote`:
  passed locally; includes backend ruff, backend format check, backend mypy,
  backend pytest, frontend lint, frontend typecheck, frontend unit tests,
  frontend build, and project-map check.

Deployment and live evidence:

- Commit `f84a8975` was pushed to `origin/main`.
- Server checkout was synchronized to `origin/main` at `f84a8975`.
- `powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1`: passed.
- `powershell -ExecutionPolicy Bypass -File scripts/deploy-frontend.ps1`:
  passed; frontend smoke returned the new built assets and API healthcheck OK.
- `powershell -ExecutionPolicy Bypass -File scripts/server-check.ps1`: passed.
- Browser live check at `http://192.168.100.12:8000/` passed: `Схема карточки`
  opens with `Шаблоны карточек` only, `Добавить блок формы` is hidden until a
  template is opened, opening `Базовый шаблон` shows `Редактор шаблона:
  Базовый шаблон`, existing blocks/fields are visible inside that editor, and
  the removed default-value template editor is not rendered.

## Phase 7J: Schema Layout Static Text And Collapsible Navigation

Status: completed, deployed, and browser-verified.

Purpose:

Implement the approved variant B for the visual schema editor: template text
and card field placement are configured in the same schema editor that already
owns blocks and fields. The ordinary card and public-link editors must render
that schema without adding hardcoded business fields.

Implemented scope:

1. Database/API model:
   - add Alembic migration `0020_schema_layout_static_text`;
   - add `form_blocks.layout_columns` with a 1-3 column constraint;
   - add `form_fields.display_config_json` for visual field settings;
   - register `static_text` as a schema field type.
2. Backend behavior:
   - validate block column count and field display settings;
   - keep `static_text` values non-editable in authenticated and public edit
     workflows;
   - exclude `static_text` from required-value validation and bulk save
     payloads;
   - expose visible static text in public-link preview without allowing public
     edits.
3. Visual schema editor:
   - template cards open by clicking the template area, not a separate Open
     button;
   - block and field edit forms open inline from the clicked block/field;
   - archive controls are moved inside the edit forms;
   - block settings include column count;
   - field settings include column width, label position, separator style, and
     non-editable text content for `static_text`;
   - field order remains mouse drag/drop and is rendered through the block grid.
4. Card/public editors:
   - ordinary card fields render by block with the configured 1-3 column grid;
   - `static_text` appears as non-editable explanatory text and is not sent in
     bulk value updates;
   - public-link card preview renders the same visible static text and layout
     metadata.
5. Workspace navigation:
   - the left admin navigation can be collapsed and restored;
   - each navigation section has a visual icon;
   - the collapsed state is stored in the existing admin workspace state.

Non-goals:

- No hardcoded employee/HR schema or business-specific columns.
- No separate per-template physical schema tables.
- No one-registry-per-organization behavior.
- No import/export, reports, generated-document, attachment, MCP, auth-flow,
  or public attachment workflow changes.
- Production migration was applied only after disposable PostgreSQL
  verification, backup, preflight, migration, and post-check under the standing
  migration rules.

Verification completed locally so far:

- `npm --prefix frontend test -- --run src/App.test.tsx -t "collapses and restores"`:
  passed, 1 targeted test.
- `npm --prefix frontend test -- --run src/App.test.tsx -t "static text|visual layout|inline at the acted row|creates edits and archives schema blocks"`:
  passed, 4 targeted tests.
- `.venv\Scripts\python.exe -m pytest tests/test_models_smoke.py tests/test_migrations.py tests/test_registry_card_services.py -q`:
  passed, 15 passed and 26 skipped.
- `.venv\Scripts\python.exe -m pytest tests/test_public_link_transfer_audit_services.py -q`:
  skipped because local `TEST_DATABASE_URL` is not set.
- `npm --prefix frontend run typecheck`: passed.
- `npm --prefix frontend run lint`: passed.
- `powershell -ExecutionPolicy Bypass -File scripts\check.ps1 -SkipRemote`:
  passed; includes backend ruff/format/mypy/pytest, frontend lint/typecheck/
  unit tests/build, and project-map check.
- `npm --prefix frontend run e2e`: passed, 3 Playwright smoke tests.

Migration, deployment, and live evidence:

- Commit `e05e975a` was pushed to `origin/main` and the server checkout was
  synchronized before the production migration.
- Disposable PostgreSQL verification on `reg_engine_0020_test` passed:
  `tests/test_database_smoke.py tests/test_registry_card_services.py
  tests/test_public_link_transfer_audit_services.py -q` returned 35 passed.
- Production preflight before migration confirmed Alembic
  `0019_base_card_templates`, no existing `form_blocks.layout_columns`, no
  existing `form_fields.display_config_json`, and zero existing `static_text`
  fields.
- Fresh production backup was created outside Git:
  `/var/backups/reg_engine/reg_engine_before_0020_20260702_184937.dump`.
- Production `alembic upgrade head` applied
  `0020_schema_layout_static_text`.
- Post-check confirmed Alembic `0020_schema_layout_static_text`,
  `form_blocks.layout_columns`, `form_fields.display_config_json`,
  `ck_form_blocks_layout_columns`, and `ck_form_fields_field_type`.
- `powershell -ExecutionPolicy Bypass -File scripts\deploy-frontend.ps1`:
  frontend build/upload, service restart, API healthcheck, and same-origin
  frontend smoke passed.
- `powershell -ExecutionPolicy Bypass -File scripts\server-check.ps1`: passed.
- In-app Browser live smoke against `http://192.168.100.12:8000/` passed:
  the admin navigation collapses and restores, `Схема карточки` shows
  `Шаблоны карточек`, the separate `Открыть` template button is absent,
  `Базовый шаблон` opens by clicking the template card, and browser console
  errors are empty.

Known limitations / next work:

- Existing `form_blocks.layout_columns` remains in the database/API for
  backward compatibility with migration `0020_schema_layout_static_text`, but
  the ordinary visual schema UI no longer exposes block-wide column count as a
  user setting.
- Current layout support stores per-field row, column, column span, label
  position, separator style, and static text content in `display_config_json`.
  Row/column placement is registry-field metadata, not a separate physical
  per-template schema.
- No per-template physical schema separation was introduced; current Core
  Schema fields remain registry-scoped in this slice.

## Phase 7J.1: Schema Grid Hardening

Status: completed on `main`, pushed to GitHub, deployed to the server, and
browser-live verified.

Purpose:

Close the first usability gaps in the visual schema editor after Phase 7J by
making field placement explicit and removing user-facing block-wide column
configuration.

Implemented scope:

1. Visual schema editor:
   - hide technical codes in ordinary field rows while keeping block/template
     technical codes visible for diagnostics;
   - clicking an already-expanded field summary closes the inline edit form;
   - remove the `Колонки блока` control from create/edit block forms;
   - keep block archive inside the inline block edit form;
   - add per-field row, column, and width settings;
   - add drag/drop drop-zones for moving a field to an explicit row and column;
   - render rows independently so different rows can occupy different numbers
     of columns up to 5.
2. Backend:
   - keep `form_blocks.layout_columns` unchanged for compatibility;
   - allow `form_fields.display_config_json` to store `layout_row`,
     `layout_column`, and `column_span` up to 5 columns;
   - no new migration is required because the data is stored in the existing
     JSON column from Phase 7J.
3. Card/public editors:
   - render ordinary card fields using the same per-row layout metadata;
   - render public-link editable fields with the same row/column layout.

Non-goals:

- No new business-specific fields or employee schema.
- No new database table or Alembic migration.
- No import/export, report, document, attachment, MCP, auth, or RBAC changes.
- No per-template physical schema separation.

Verification completed:

- `npm --prefix frontend test -- --run src/App.test.tsx -t "closes field edit|moves schema fields|creates edits and archives schema blocks and fields|creates static text fields"`:
  passed, 4 targeted tests.
- `npm --prefix frontend test -- --run src/App.test.tsx`: passed, 66 tests.
- `npm --prefix frontend run typecheck`: passed.
- `backend\.venv\Scripts\python.exe -m pytest` from `backend`: passed, 133
  passed, 170 skipped.
- `backend\.venv\Scripts\python.exe -m ruff check .`: passed.
- `backend\.venv\Scripts\python.exe -m ruff format --check .`: passed.
- `backend\.venv\Scripts\mypy.exe backend\app`: passed.
- `npm --prefix frontend run lint`: passed.
- `npm --prefix frontend run format:check`: passed.
- `npm --prefix frontend run build`: passed.
- `npm --prefix frontend run e2e`: passed, 3 Playwright smoke tests.
- `powershell -ExecutionPolicy Bypass -File scripts\check.ps1 -SkipRemote`:
  passed; includes backend ruff/format/mypy/pytest, frontend lint/typecheck/
  unit tests/build, and project-map check.

Deployment and live evidence:

- Commit `75a33717` was pushed to `origin/main`.
- `powershell -ExecutionPolicy Bypass -File scripts\deploy.ps1`: passed;
  server checkout fast-forwarded to `75a33717` and server checks passed.
- `powershell -ExecutionPolicy Bypass -File scripts\deploy-frontend.ps1`:
  passed; frontend build/upload, service restart, API healthcheck, and
  same-origin frontend smoke passed.
- Browser live check against `http://192.168.100.12:8000/` passed with a
  Playwright fallback after the in-app browser control API timed out on tab
  access: the schema tab shows the template editor, the block-wide column
  setting is absent, ordinary field rows do not display technical codes, a
  field row opens and then closes its inline editor on repeated clicks, row and
  column field settings are visible, independent visual rows render, and
  browser console errors are empty.

## Phase 7J.2: Schema Grid Interaction Polish

Status: completed on `main`, pushed to GitHub, deployed to the server, and
live-verified.

Purpose:

Close the second usability pass in the visual schema editor without adding new
product features or changing backend schema.

Implemented scope:

1. Block editor interaction:
   - clicking an already-expanded block header closes the inline block editor;
   - Enter/Space on the focused block header uses the same toggle behavior.
2. Field placement interaction:
   - pressing/focusing any field drag handle opens placement slots for each
     visual row, not only after a full browser drag starts;
   - placement slots are clickable and still support drag/drop;
   - field placement remains stored in `display_config_json.layout_row` and
     `display_config_json.layout_column`.
3. Field width interaction:
   - row/column/width form controls were removed from the ordinary field form;
   - field width remains supported through `display_config_json.column_span`;
   - users change field width from the visual field edge resize handle.
4. Field display settings:
   - label-position settings are now visual choices instead of a select;
   - separator settings are now visual choices instead of a select.

Non-goals:

- No backend model, API, or Alembic migration change.
- No business-specific or employee-specific field schema.
- No import/export, report, document, attachment, MCP, auth, or RBAC change.
- No per-template physical schema split.

Verification completed:

- `npm --prefix frontend test -- --run src/App.test.tsx -t "toggles block edit|opens layout drop grid|resizes schema field width|creates static text fields"`:
  passed, 4 targeted regression tests.
- `npm --prefix frontend test -- --run src/App.test.tsx`: passed, 69 tests.
- `npm --prefix frontend run lint`: passed.
- `npm --prefix frontend run typecheck`: passed.
- `npm --prefix frontend run format:check`: passed after formatting.
- `npm --prefix frontend run build`: passed.
- `npm --prefix frontend run e2e`: passed, 3 Playwright smoke tests.
- `powershell -ExecutionPolicy Bypass -File scripts\check.ps1 -SkipRemote`:
  passed; includes backend ruff/format/mypy/pytest, frontend lint/typecheck/
  unit tests/build, and project-map check.

Deployment and live evidence:

- Commit `01929819` was pushed to `origin/main`.
- `powershell -ExecutionPolicy Bypass -File scripts\deploy.ps1`: passed;
  server checkout fast-forwarded to `0192981` and server checks passed.
- `powershell -ExecutionPolicy Bypass -File scripts\deploy-frontend.ps1`:
  passed; frontend build/upload, service restart, API healthcheck, and
  same-origin frontend smoke passed.
- Browser live verification against `http://192.168.100.12:8000/` passed with a
  fresh Playwright context after the in-app Browser runtime timed out on
  reload/new-tab control: page title is `Реестровая система`, repeated
  block-header click closes the block edit form, mouse-holding a second field
  drag handle opened 15 placement slots, mouse-holding a later block's field
  drag handle opened 20 placement slots, row/column/width form controls are not
  rendered, label-position and separator settings are visual controls, repeated
  field-summary click closes the field edit form, field rows render no
  technical-code spans, resize handles are present, and browser console
  warnings/errors were empty.

## Phase 7J.3: Schema Placement Grid Usability

Status: completed on `main`, pushed to GitHub, deployed to the server frontend,
and live browser verified.

Purpose:

Make field placement in the visual schema editor understandable and controllable
without adding product features or changing backend schema.

Implemented scope:

1. Field placement grid:
   - the placement UI is rendered as a separate panel instead of interleaving
     slot rows with real field rows;
   - the grid is limited to 10 visual rows and 5 columns;
   - the grid panel scrolls vertically when needed.
2. Field position clarity:
   - occupied cells show the field label;
   - the selected field's current cell is highlighted and disabled;
   - the selected field row remains visibly highlighted in the field list.
   - Phase 7J.4 supersedes the active-grid rendering so the field list is no
     longer duplicated while the placement grid is open.
3. Grid lifecycle:
   - repeated drag-handle click closes the grid;
   - Escape, outside click, and successful drop close the grid;
   - native mouse drag/drop remains supported through the grid cells.

Non-goals:

- No backend model, API, or Alembic migration change.
- No business-specific or employee-specific field schema.
- No import/export, report, document, attachment, MCP, auth, or RBAC change.

Verification completed:

- `pnpm -C frontend test -- --run src/App.test.tsx -t "schema layout grid|layout grid"`:
  passed, including regression coverage for open/close, disabled current cell,
  10x5 limit, and mouse drop.
- `pnpm -C frontend lint`: passed.
- `pnpm -C frontend typecheck`: passed.
- `pnpm -C frontend format:check`: passed.
- `pnpm -C frontend test:run`: passed, 82 tests.
- `pnpm -C frontend build`: passed.
- `powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote`:
  passed; includes backend ruff/format/mypy/pytest, frontend lint/typecheck/
  unit tests/build, and project-map check.
- `powershell -ExecutionPolicy Bypass -File scripts/deploy-frontend.ps1`:
  passed; built `frontend/dist`, uploaded it to the server, restarted
  `reg-engine.service`, and passed backend healthcheck plus frontend smoke.
- External Playwright live check against `http://192.168.100.12:8000/`: passed;
  verified repeated-click close, Escape close, 10x5 grid, disabled current cell,
  real mouse drag/drop to another grid cell, and zero browser console errors.
  Screenshot: `C:/Temp/reg-engine-schema-placement-grid-live.png`.

Synchronization note:

- Current local `main` HEAD contains the latest Phase 7J.3 code fix.
- `git push origin main`: passed after DNS resolution recovered.

## Phase 7J.4: Schema Placement Occupied-Cell Hardening

Status: completed on `main`, deployed to the server frontend, and live browser
verified.

Purpose:

Fix the remaining visual schema placement-grid bug where occupied cells looked
like available targets and the active grid duplicated the ordinary field list.

Implemented scope:

1. Occupied placement cells:
   - occupied cells show the occupying field label directly inside the grid;
   - occupied cells are disabled and cannot be clicked or used as drop targets;
   - native drag-end logic treats disabled occupied cells as blocked so a stale
     remembered empty target is not reused.
2. Active grid rendering:
   - while a block placement grid is active, the block's ordinary field rows are
     hidden;
   - the grid becomes the single visible placement surface for all fields in
     that block;
   - successful placement, Escape, outside click, or the close button returns to
     the ordinary field list.
3. Visual clarity:
   - occupied and current cells use stronger field-like styling;
   - the current cell remains highlighted and disabled.

Non-goals:

- No backend model, API, or Alembic migration change.
- No business-specific or employee-specific schema.
- No import/export, report, document, attachment, MCP, auth, or RBAC change.

Verification completed:

- `pnpm -C frontend test -- --run src/App.test.tsx -t "schema layout grid|layout grid|field order"`:
  passed, 82 tests.
- `pnpm -C frontend lint`: passed.
- `pnpm -C frontend typecheck`: passed.
- `pnpm -C frontend format:check`: passed.
- `powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote`:
  passed; includes backend ruff/format/mypy/pytest, frontend lint/typecheck/
  unit tests/build, and project-map check.
- `powershell -ExecutionPolicy Bypass -File scripts/deploy-frontend.ps1`:
  passed; built `frontend/dist`, uploaded it to the server, restarted
  `reg-engine.service`, and passed backend healthcheck plus frontend smoke.
- In-app browser live check against `http://192.168.100.12:8000/`: passed;
  verified a 10-row by 5-column grid, no duplicated `.schema-field-row` rows
  while the grid is active, disabled current and occupied cells, visible
  occupied-field labels, restored field rows after `Закрыть сетку`, zero
  browser console warnings/errors, and 200 responses for the visible registry
  API reads. Screenshot: `C:/Temp/reg-engine-schema-grid-occupied-cells.png`.
