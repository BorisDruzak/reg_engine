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
- Phase 7J.3 inline reference-list creation bugfix is completed locally:
  the compact reference-list editor inside schema field creation now shows a
  Russian validation message when `Создать справочник здесь` is used without a
  name, keeps the action available for visible feedback, and preserves the
  existing successful create-and-select flow. No backend change or database
  migration is required.
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
- Phase 7J.5 schema placement mouse-drag regression fix is completed locally
  and deployed to the server frontend: click-opened placement grids still hide
  ordinary field rows, but active mouse-drag keeps the dragged field source row
  mounted until pointer release so browser drag can complete. No backend,
  database, or migration change is required.
- Phase 7J.6 schema/card editor UX hardening is completed on `main`, pushed to
  GitHub, deployed to the server frontend, and live browser verified: registry
  work auto-collapses the navigation until the user manually expands or uses
  it, workspace content is centered, label/separator schema choices use visual
  previews, the card editor renders fields through the schema row/column layout
  with clearer block separation, empty optional reference fields save as null
  instead of failing with a UUID validation error, native mouse drag keeps field
  rows mounted while the placement grid is active, and pointer-based mouse
  dragging opens the grid only after real pointer movement. No backend,
  database, or migration change is required.
- Phase 7J.7 block title placement and compact field-reference editing is
  completed on `main`, pushed to GitHub, deployed to the server, and production
  migrated to `0021_block_display_config`: form blocks now persist
  `display_config_json`, Alembic
  migration `0021_block_display_config` adds the backend column, block edit
  forms include a visual `Расположение названия блока` preview, field
  label/separator visual settings are collapsed by default, required fields use
  one checkbox in the ordinary UI, and reference-backed field creation includes
  a compact inline reference-list/item editor. Authenticated browser live-click
  verification is blocked until a current UI admin session/password is
  available; server smoke and API health checks pass.
- Phase 7J.7 production login follow-up is completed: the server test
  superadmin login is `admin`, its password was restored to `1.Abcdef`, the
  login form accepts username-style identifiers without `@`, and frontend
  regression tests cover the `admin` login path.
- Phase 8 A4 card print-template editor is completed on `main`, pushed to
  GitHub, deployed to the server, production-migrated to
  `0022_card_print_layout_templates`, and live browser/API verified: backend
  supports `card_print_layout_v1` through the existing document-template and
  generated-document infrastructure, frontend exposes an explicit A4 print
  editor from the selected card-template editor, normal card filling remains
  unchanged, and production DOCX/PDF generation uses the latest saved print
  layout version.
- Phase 8B A4 print-template production UX hardening is completed on `main`,
  pushed to GitHub, deployed to the server, and live-verified:
  the editor is refactored into shared A4 renderer/palette/toolbar/properties
  modules, uses mm geometry in layout JSON, hides technical settings by
  default, supports mouse drag/resize and keyboard editing, creates fields and
  blocks from the canvas, reuses the renderer for a preview-only card workspace
  tab, and strengthens backend layout validation/rendering without a database
  migration.
- Phase 8C A4 production review follow-up is completed on `main`, pushed to
  GitHub, deployed to the server, and live-verified: new print templates open
  with an empty A4 canvas instead of auto-placing existing fields, existing
  fields can be dragged from the palette onto the canvas, print-template lists
  are defensively scoped to the selected card template, the editor can download
  blank DOCX/PDF files from the saved A4 layout, card action panels can
  download DOCX/PDF through the active A4 print form, and the production test
  registries/templates from the Phase 8B live run were soft-archived through
  API.
- Phase 8D A4 blank-download and existing-block follow-up is completed on
  `main`, pushed to GitHub, deployed to the server, and live-verified without a
  database migration: blank DOCX/PDF downloads from the A4 editor render the
  current unsaved canvas through an ad-hoc backend endpoint without creating
  `document_templates`, and existing form blocks can be added to the A4 canvas
  by click or mouse drag/drop.
- Phase 8E card-template editor and A4 block layout follow-up is completed
  locally without a database migration: field create/edit flags are grouped
  under one `Расширенные настройки` disclosure, form blocks use the same
  10-row by 5-column visual placement grid as fields through existing
  `form_blocks.display_config_json`, and adding an existing block to the A4
  canvas now adds the block container plus all card-template fields from that
  block while preserving their relative visual layout.
- Phase 8F A4 Layout Studio normalized-layout refactor is completed on `main`,
  pushed to GitHub, deployed to the server, and live-verified without a
  database migration: `CardLayoutStudio` is the active print editor entry
  point, `card_print_layout_v1` accepts normalized `sections[]` and
  `overlays[]` while keeping legacy `items[]` compatibility, DOCX generation
  emits editable Word section tables instead of plain text lines, the preview
  endpoint validates/normalizes unsaved layouts, and decorative A4 block
  containers no longer raise false overlap warnings against their own fields.
- Phase 8G unified card-template studio correction is completed on `main`,
  pushed to GitHub, deployed to the server, and live-verified without a
  database migration: the selected card-template workspace is now one
  `CardLayoutStudio` with modes for card composition, web form, A4 print form,
  card preview, and settings; the old nested A4 button and selected-template
  `schema-canvas` editor are removed; `A4LayoutRenderer` is the canonical A4
  renderer; blank DOCX/PDF downloads still work from the unified screen.
- Phase 8H unified card-template layout contract is completed on `main`,
  pushed to GitHub, deployed to the configured server, and live-browser
  verified without a database migration: the new `card_template_layout_v1` API
  exposes structure, form layout, A4 print views, export settings, and sync
  status as one card-template concept while keeping existing
  `document_templates` rows as internal storage for A4 print-view versions.
- Phase 8I unified card-template editor UX is completed on `main`, pushed to
  GitHub, deployed to the configured server frontend, and live browser-verified:
  the separate user-facing web/A4 editor tabs are replaced with one
  `Макет карточки` workspace where the same selected block/field exposes web
  placement, A4 placement, appearance, access, and technical settings in one
  properties panel. No database migration was required.
- Phase 8J contextual card-layout studio is complete on `main` through deployed
  checkpoint `46c4f0e8`. The cumulative local gate, GitHub/server
  synchronization, frontend deployment, desktop/mobile Browser proof,
  conversion follow-up, and live DOCX/PDF signature checks pass. No database
  migration was required.
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
- `powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote`:
  passed; includes backend ruff/format/mypy/pytest, frontend lint/typecheck/
  unit tests/build, and project-map check.
- `pnpm -C frontend e2e`: passed, 3 Playwright smoke tests.
- Local PowerShell `TEST_DATABASE_URL` is not set, so disposable PostgreSQL
  verification for migration `0021_block_display_config` remains required
  before production migration/server deployment.
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

## Phase 7J.5: Schema Placement Mouse-Drag Regression Fix

Status: completed locally and deployed to the server frontend.

Purpose:

Fix the regression introduced by the Phase 7J.4 active-grid rendering cleanup:
clicking a field drag handle should still open a clean grid-only placement
surface, but holding the mouse and dragging must not remove the source field row
from the DOM before the browser drag completes.

Implemented scope:

1. Visual schema editor:
   - separate click-opened grid state from active pointer-drag state;
   - keep ordinary field rows mounted only while a mouse drag is actively held;
   - return to the clean grid-only view after a non-drag click opens the grid;
   - clear active pointer-drag state on successful drop, invalid drop, Escape,
     outside click, and explicit grid close.
2. Tests:
   - added a regression test proving field rows remain mounted during
     mouse-drag into the placement grid;
   - preserved existing coverage proving click-opened grids hide ordinary field
     rows and occupied cells remain disabled.

Non-goals:

- No backend model, API, service, or Alembic migration change.
- No business-specific or employee-specific schema.
- No import/export, report, document, attachment, MCP, auth, RBAC, or database
  workflow change.

Verification completed:

- New regression test was first run against the existing code and failed
  because `.schema-field-row` was removed during pointer-drag.
- `pnpm -C frontend test -- --run src/App.test.tsx -t "keeps schema field rows"`:
  passed after the fix.
- `pnpm -C frontend test -- --run src/App.test.tsx -t "schema layout grid|layout grid|field order|keeps schema field rows"`:
  passed.
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
  verified real mouse drag from a schema field handle to a free placement grid
  cell, field position update, closed grid after drop, restored ordinary field
  rows, and zero browser console warnings/errors.

## Phase 7J.6: Schema And Card Editor UX Hardening

Status: completed locally; server synchronization pending final verification.

Purpose:

Close the UI issues found during schema/card editor live review without adding
business-specific schema, new product modules, or a database migration.

Implemented scope:

1. Workspace layout and navigation:
   - registry work auto-collapses the left navigation to increase usable
     workspace width;
   - manual expand or sidebar navigation interaction restores the navigation;
   - main workspace content is centered while form/input text remains
     left-aligned.
2. Schema visual editor:
   - label-position choices render as visual previews instead of plain buttons;
   - separator choices render as visual previews instead of plain buttons;
   - native mouse drag keeps source field rows mounted while the placement grid
     is active so browser drag/drop can complete;
   - click-opened placement grids still hide duplicate ordinary field rows and
     show occupied/current cells inside the grid.
3. Card editor:
   - bulk card field editing now renders block sections with clearer block
     headings and separators;
   - ordinary card fields use the schema row/column/span, label-position, and
     separator metadata when rendering.
4. Empty optional reference field save bug:
   - frontend bulk/single field editors coerce empty single-reference values to
     null;
   - backend API/service coercion accepts null for optional select and
     reference field types;
   - Russian UI error mapping is added for invalid reference UUID payloads.

Non-goals:

- No hardcoded employee/HR fields.
- No backend model/table redesign.
- No Alembic migration.
- No import/export, report, document, attachment, MCP, auth, or RBAC change.
- Block title-position configuration is not persisted in this slice because
  `form_blocks` currently has no exposed block display-config JSON API. Add a
  later explicit backend/API slice before making block title placement a saved
  setting.

Verification completed locally so far:

- `npm test -- --run src/App.test.tsx -t "layout grid|native mouse drag|occupied field cells|resizes schema field width|changes field order|auto-collapses|creates static text fields|collapses and restores"`:
  passed, 8 targeted tests.
- `npm test -- --run src/features/cards/fieldEditorUtils.test.ts src/app/uiText.test.ts`:
  passed, 5 tests.
- `backend\.venv\Scripts\python.exe -m pytest tests/test_field_value_coercion.py -q`:
  passed, 2 tests.
- `backend\.venv\Scripts\python.exe -m pytest tests/test_core_service_hardening.py -k optional_ref_field_types_can_be_cleared -rs`:
  skipped because local `TEST_DATABASE_URL` is not set.
- `npm test -- --run`: passed, 86 tests.
- `backend\.venv\Scripts\python.exe -m pytest`: passed, 135 passed and 171
  skipped.
- `npm run lint`, `npm run typecheck`, and `npm run format:check`: passed.
- `backend\.venv\Scripts\python.exe -m ruff check .`,
  `backend\.venv\Scripts\python.exe -m ruff format --check .`, and
  `backend\.venv\Scripts\python.exe -m mypy app`: passed.
- `powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote`:
  passed; includes backend ruff/format/mypy/pytest, frontend lint/typecheck/
  unit tests/build, and project-map check.
- `npm run e2e`: passed, 3 Playwright smoke tests.

## Phase 7J.7: Block Title Placement And Compact Reference Field Editor

Status: completed on `main`, pushed to GitHub, deployed to the server, and
production migrated to `0021_block_display_config`.

Purpose:

Close the schema-editor UI issues found during live review while preserving
schema-driven cards and keeping the ordinary editor compact for non-technical
users.

Implemented scope:

1. Block display configuration:
   - `form_blocks.display_config_json` is added through migration
     `0021_block_display_config`;
   - block create/update API accepts and returns block display config;
   - registry schema service validates `title_position` as one of
     `top`, `left`, `right`, or `bottom`;
   - block edit form has a visual `Расположение названия блока` preview.
2. Field form simplification:
   - `Расположение подписи` is collapsed by default and expands to visual
     previews on demand;
   - `Разделитель` is collapsed by default and expands to visual previews on
     demand;
   - `Обязательность поля` is represented as one `Обязательное поле` checkbox
     in the ordinary UI.
3. Reference-backed field creation:
   - select/multi-select field creation includes a compact inline reference
     editor;
   - users can choose an existing reference list, create a new list when none
     is selected, and add reference items without leaving the field form;
   - item creation uses existing reference-list API endpoints and does not add
     hardcoded business options.

Non-goals:

- No hardcoded employee/HR schema.
- No one-registry-per-organization behavior.
- No import/export, report, document, attachment, MCP, auth, or RBAC change.
- No additional production migration beyond `0021_block_display_config` in this
  slice.

Verification completed:

- `backend\.venv\Scripts\python.exe -m pytest`: passed, 135 passed and 171
  skipped.
- `backend\.venv\Scripts\python.exe -m pytest backend\tests\test_registry_card_services.py::test_schema_layout_and_static_text_roundtrip backend\tests\test_models_smoke.py::test_schema_layout_metadata_is_registered backend\tests\test_migrations.py -q`:
  passed, with service smoke skipped because local `TEST_DATABASE_URL` is not
  set.
- `backend\.venv\Scripts\python.exe -m ruff check .`: passed.
- `backend\.venv\Scripts\python.exe -m ruff format --check .`: passed after
  formatting `backend/app/models/registry_schema.py` and
  `backend/tests/test_migrations.py`.
- `backend\.venv\Scripts\python.exe -m mypy app`: passed.
- `pnpm -C frontend test:run`: passed, 90 tests.
- `pnpm -C frontend test -- --run src/App.test.tsx -t "block title placement|advanced field display previews|reference list items inside|required mode from Russian UI|static text fields with visual layout|creates edits and archives schema"`:
  passed, 90 tests.
- `pnpm -C frontend lint`: passed.
- `pnpm -C frontend typecheck`: passed.
- `pnpm -C frontend format:check`: passed after formatting
  `frontend/src/features/registry/RegistriesAndSchema.tsx`.
- `pnpm -C frontend build`: passed.
- `powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote`:
  backend and frontend checks passed; the first run failed only because a
  temporary browser snapshot file made `docs/PROJECT_TREE.md` stale, and
  `scripts/project-map.ps1 -Check` passed after removing that temporary file.
- Server checkout was updated to `2860289` on `/opt/reg_engine`.
- Disposable PostgreSQL verification passed on `reg_engine_0021_test`:
  `tests/test_database_smoke.py`, `tests/test_models_smoke.py`,
  `tests/test_migrations.py`, and `tests/test_registry_card_services.py`
  reported 44 passed.
- Production preflight passed: Alembic was
  `0020_schema_layout_static_text`, `form_blocks.display_config_json` did not
  yet exist, and `form_blocks_count=3`.
- Production backup was created before migration:
  `/var/backups/reg_engine/reg_engine_before_0021_20260703_124002.dump`.
- Production Alembic migration completed:
  `0021_block_display_config (head)` and
  `form_blocks.display_config_json` exists.
- `scripts/deploy-frontend.ps1` built and uploaded `frontend/dist`, restarted
  `reg-engine.service`, and same-origin frontend/API smoke checks passed.
- `scripts/server-check.ps1`: passed.
- Browser reload verified the deployed shell at
  `http://192.168.100.12:8000/`, but authenticated schema-editor click
  verification is blocked because the current UI session expired and the
  checked dev/e2e password `secret-pass` is not valid on this server.

## Phase 8: A4 Card Print Template Editor

Status: completed on `main`, pushed to GitHub, deployed to the server,
production-migrated to `0022_card_print_layout_templates`, and live verified.

Purpose:

Add a production print-template workflow for cards without changing the normal
card filling UI. The print editor works on A4 pages, but the persisted source of
truth is a structured `card_print_layout_v1` JSON layout stored in document
template versions.

Implemented scope:

1. Backend document-template extension:
   - reuse `document_templates`, `document_template_versions`, and
     `generated_documents`;
   - add `card_print_layout_v1`;
   - add `document_template_versions.layout_json`;
   - add optional `document_templates.card_template_id`;
   - keep existing `docx_text_v1` and `docx_binary_v1` behavior stable.
2. Backend print services:
   - validate A4 12-column print layouts;
   - create/list/read print templates and create layout versions;
   - create a default local frontend layout from the selected card-template
     fields;
   - build print views from card data and layout JSON;
   - generate DOCX/PDF through backend renderers into `generated_documents`.
3. Frontend print editor:
   - show an explicit A4 canvas with grid/margins/rulers;
   - add existing fields, headings, static text, and dividers;
   - edit selected element properties in a right panel;
   - validate out-of-page/overlap/field-reference errors on the backend before
     save;
   - keep ordinary card filling in the existing simple card workspace.
4. Compatibility:
   - no hardcoded HR/employee schema;
   - no public generated-document workflows;
   - no frontend screenshot-based generation;
   - no broken existing document templates, generated downloads, imports,
     exports, reports, public links, or MCP flows.

Verification completed:

- `backend\.venv\Scripts\python.exe -m pytest tests/test_card_print_layout_services.py
  tests/test_document_generation_services.py::test_card_print_layout_renderers_use_structured_layout_and_card_values
  tests/test_models_smoke.py::test_generated_document_metadata_tables_use_required_columns
  tests/test_migrations.py::test_alembic_can_render_core_schema_upgrade_sql -q`:
  passed, 6 tests.
- `backend\.venv\Scripts\python.exe -m pytest tests/test_card_print_layout_services.py
  tests/test_document_generation_services.py::test_card_print_layout_renderers_use_structured_layout_and_card_values
  tests/test_document_generation_services.py::test_pdf_renderer_supports_cyrillic_text
  tests/test_models_smoke.py::test_generated_document_metadata_tables_use_required_columns
  tests/test_migrations.py::test_alembic_can_render_core_schema_upgrade_sql
  tests/test_api_phase_2d_documents.py::test_card_print_layout_template_versions_and_generates_pdf_docx -q`:
  passed, with the PostgreSQL-backed API test skipped because local
  `TEST_DATABASE_URL` is not set.
- `backend\.venv\Scripts\python.exe -m ruff check app tests`: passed.
- `npm run typecheck` from `frontend`: passed.
- `npm run test:run -- src/App.test.tsx`: passed, 78 tests.
- `npm run test:run -- src/features/registry/CardPrintTemplateEditor.test.tsx`:
  passed, 1 test.
- `powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote`:
  passed; includes backend ruff/format/mypy/pytest, frontend lint/typecheck/
  test/build, and project-map check. Frontend suite reported 8 files and 93
  tests passed; backend suite reported 139 passed, 172 skipped, 1 warning.
- Dev-server browser sanity check against `http://127.0.0.1:5173/` passed:
  page title is `Реестровая система`, login shell renders, and the only browser
  console error is the existing `favicon.ico` 404.

Production deployment and live evidence:

- Commits pushed to `origin/main`:
  - `7a4f20c6` `Implement A4 card print templates`;
  - `7b02a581` `Fix card print migration constraint names`;
  - `1d0ed926` `Fix card print API test encoding`.
- Server checkout was synchronized to `origin/main` at `1d0ed92`.
- Disposable PostgreSQL verification on `reg_engine_0022_test` passed after
  applying Alembic from empty DB to head:
  `tests/test_database_smoke.py tests/test_models_smoke.py
  tests/test_migrations.py
  tests/test_api_phase_2d_documents.py::test_card_print_layout_template_versions_and_generates_pdf_docx -q`
  returned 19 passed, and post-check confirmed Alembic
  `0022_card_print_layout_templates`, `document_template_versions.layout_json`,
  and `document_templates.card_template_id`.
- Production preflight before migration confirmed Alembic
  `0021_block_display_config`, both new columns absent, and zero unexpected
  existing document-template/template-version formats.
- Fresh production backup was created outside Git:
  `/var/backups/reg_engine/reg_engine_before_0022_20260704_183829.dump`.
- Production `alembic upgrade head` applied
  `0022_card_print_layout_templates`; post-check confirmed both new columns and
  Alembic `0022_card_print_layout_templates (head)`.
- `powershell -ExecutionPolicy Bypass -File scripts\deploy-frontend.ps1`:
  passed; frontend build/upload, service restart, API healthcheck, and
  same-origin frontend smoke passed.
- `powershell -ExecutionPolicy Bypass -File scripts\server-check.ps1`: passed.
- Playwright live check against `http://192.168.100.12:8000/` passed after the
  final deployment. The checked flow logged in as `admin`, opened
  `Реестры -> Схема карточки`, selected the base card template, opened
  `Печатный шаблон A4`, verified palette/canvas/properties rendering, created
  print template `codex_phase8_a4_20260704185323`, saved a second layout
  version, listed the template through the card-print API, generated DOCX and
  PDF for a production card, downloaded both generated files, and verified DOCX
  zip/PDF byte signatures. Browser console/page errors were empty.
- In-app Browser plugin validation was attempted first but the Browser runtime
  timed out while listing/opening tabs, so the live UI validation used regular
  Playwright with screenshots saved outside the repo:
  `C:\Temp\reg-engine-phase8-live-login.png`,
  `C:\Temp\reg-engine-phase8-live-editor.png`, and
  `C:\Temp\reg-engine-phase8-live-saved.png`.

Issues found and fixed during production gate:

- Disposable PostgreSQL caught a migration constraint-name bug where Alembic's
  naming convention doubled already-conventioned check-constraint names. Fixed
  in `0022_card_print_layout_templates.py` with `op.f(...)` and regression
  assertions in `tests/test_migrations.py`.
- The PostgreSQL-backed Phase 8 API test expected a mojibake field-value string.
  Fixed the test to assert the real Russian card value `Значение поля`.

## Phase 8B: A4 Print-Template Production UX Hardening

Status: completed on `main`, pushed to GitHub, deployed to the server, and
live-verified.

Purpose:

Turn the Phase 8 technical MVP into a visual A4 editor while preserving the
schema-driven card model and the existing generated-document infrastructure.
The normal card field editor remains the primary filling workflow; the A4
surface is used for print-template design and preview.

Implemented scope:

1. Frontend print editor:
   - refactored the large editor into `frontend/src/features/registry/print/`
     with shared renderer, toolbar, palette, properties, geometry, validation,
     and sample-value modules;
   - kept `frontend/src/features/registry/CardPrintTemplateEditor.tsx` as a
     compatibility re-export;
   - hid technical code, output filename, raw ids, and JSON behind
     `Настройки шаблона` / technical toggles;
   - added document-style toolbar with name, save status, zoom, grid toggle,
     preview toggle, save, DOCX/PDF generation buttons, and last-download
     action;
   - implemented A4 mm rendering with page shadow, gray workspace, rulers,
     margins, zoom presets, scroll, grid toggle, selection and hover states;
   - added mouse drag, resize handles, keyboard nudge, Delete, duplicate,
     copy/paste, undo/redo, and mm-only layout saving;
   - added user-facing properties tabs for content, position, appearance,
     behavior, and technical details;
   - added palette actions for existing fields, new fields, new blocks,
     headings, static text, panels, rectangles, dividers, print date, page
     number, and card metadata; QR/image remain disabled with explicit TODO
     tooltips;
   - added canvas field/block creation through existing schema API endpoints,
     including reference-list selection/inline list creation for select fields.
2. Shared preview:
   - reused the same A4 renderer in a preview-only `Печатная форма` card
     workspace tab;
   - design mode shows realistic values instead of `{field.code}`;
   - preview can use current card values and metadata when launched from a
     card.
3. Backend validation/rendering:
   - extended `card_print_layout_v1` validation to normalize and validate
     `x_mm`, `y_mm`, `width_mm`, `height_mm`, A4 page dimensions, block ids,
     style enums, and out-of-page geometry;
   - existing row/column/span layouts remain accepted and are normalized to mm;
   - PDF rendering now uses mm coordinates plus padding, border, background,
     text color, and alignment from layout styles;
   - DOCX remains structured text output through the existing generated-document
     path; no screenshot or frontend rasterization is used.

Non-goals in this slice:

- No database migration; the extension is inside existing JSON layout.
- No hardcoded business/employee fields.
- No replacement of the ordinary card filling form with A4 editing.
- No public generated-document workflow, new storage backend, MCP changes, MDB
  migration, service-desk integration, or new binary export phase.

Verification completed:

- `pnpm -C frontend typecheck`: passed.
- `pnpm -C frontend lint`: passed.
- `pnpm -C frontend format:check`: passed.
- `pnpm -C frontend test:run -- src/features/registry/CardPrintTemplateEditor.test.tsx`:
  passed, 95 tests in the frontend suite.
- `backend\.venv\Scripts\python.exe -m pytest backend\tests\test_card_print_layout_services.py backend\tests\test_document_generation_services.py::test_card_print_layout_renderers_use_structured_layout_and_card_values -q`:
  passed, 5 tests.
- `powershell -ExecutionPolicy Bypass -File scripts\format.ps1 -Check`: passed.
- `powershell -ExecutionPolicy Bypass -File scripts\lint.ps1`: passed.
- `powershell -ExecutionPolicy Bypass -File scripts\test.ps1`: passed;
  backend reported 140 passed / 172 skipped, frontend reported 95 passed.
- `powershell -ExecutionPolicy Bypass -File scripts\typecheck.ps1`: passed;
  mypy reported no issues and frontend TypeScript passed.
- `powershell -ExecutionPolicy Bypass -File scripts\check.ps1`: passed after
  the backend validation fix; backend reported 141 passed / 172 skipped,
  frontend reported 95 passed, frontend production build passed, and project
  tree check was current.
- `powershell -ExecutionPolicy Bypass -File scripts\push-git.ps1 -Message
  "Improve A4 print template editor UX"`: committed and pushed `242a4a05`.
- `powershell -ExecutionPolicy Bypass -File scripts\push-git.ps1 -Message
  "Handle invalid A4 print style validation" -SkipCheck`: committed and pushed
  `b7b9f995` after the full local check had already passed.
- `powershell -ExecutionPolicy Bypass -File scripts\deploy.ps1`: server
  checkout fast-forwarded to `b7b9f99`, backend package was reinstalled, and
  server checks passed.
- `powershell -ExecutionPolicy Bypass -File scripts\service.ps1 -Command
  restart`: `reg-engine.service` restarted and healthcheck passed on
  `0.0.0.0:8000`.
- `powershell -ExecutionPolicy Bypass -File scripts\deploy-frontend.ps1`:
  built and uploaded `frontend/dist`, restarted `reg-engine.service`, and
  passed backend healthcheck plus same-origin frontend smoke.
- Live Playwright check against `http://192.168.100.12:8000/` passed with
  system Chrome after the in-app Browser runtime failed during the earlier
  tab/navigation attempt. Evidence:
  - login as `admin` / configured production test password succeeded;
  - schema editor opened `Печатный шаблон A4`;
  - technical codes were hidden by default;
  - drag plus keyboard nudge saved mm-only layout geometry, with no px geometry
    in the saved API layout;
  - DOCX and PDF generation/download returned valid `PK` and `%PDF`
    signatures;
  - invalid object-valued `style.border` now returns 422 with an unsupported
    style validation message instead of 500;
  - ordinary card `Мун служайщий` opened through the real card list, and the
    `Печатная форма` tab rendered the A4 preview with the card value `Пупкин`;
  - browser console warnings/errors and page errors were empty.
- Live screenshots were saved outside Git:
  `C:\Temp\reg-engine-phase8b-live-saved-20260704205551.png`,
  `C:\Temp\reg-engine-phase8b-live-card-list-20260704210651.png`, and
  `C:\Temp\reg-engine-phase8b-live-card-print-preview-20260704210651.png`.

Issues found and fixed during the Phase 8B gate:

- A non-string enum-style value such as object-valued `style.border` could raise
  a backend `TypeError` and surface as HTTP 500. Fixed
  `backend/app/services/card_print.py` so enum style values must be strings and
  invalid shapes become normal layout-validation errors; regression coverage was
  added in `backend/tests/test_card_print_layout_services.py`.

## Phase 8C: A4 Production Review Follow-Up

Status: completed on `main`, pushed to GitHub, deployed to the server, and
live-verified.

Purpose:

Close the user review comments from the production A4 editor without changing
the schema-driven card model or adding a database migration.

Implemented scope:

1. A4 editor behavior:
   - new print templates now start from an empty A4 canvas;
   - existing schema fields remain in the palette and can be added by click or
     mouse drag/drop onto the canvas;
   - the template dropdown is defensively filtered to the selected card
     template, even if an API/cache response contains unrelated templates.
2. Blank template downloads:
   - `GET /api/v1/card-print-templates/{template_id}/blank-docx` and
     `/blank-pdf` render the latest saved A4 layout with empty field values;
   - blank downloads use the existing backend A4 renderers and return binary
     responses directly, without creating `generated_documents` records.
3. Card action panel:
   - the selected card action panel can download DOCX/PDF through the active
     A4 print form for the card's template;
   - generation and audit remain backend-enforced through the existing
     generated-document APIs.
4. Production data cleanup:
   - test registries `codex_a4b20260704205201` and
     `codex_a4b20260704205325` were soft-archived through
     `DELETE /api/v1/registries/{id}`;
   - test A4 templates `0000 Minimal A4 20260704210135` and
     `Codex Phase8 A4 20260704185323` were soft-archived through
     `DELETE /api/v1/document-templates/{id}`;
   - the active registry list now contains only the primary card registry, and
     the active print-template list for that registry contains only
     `base_template_print`.

Verification completed so far:

- `pnpm -C frontend exec vitest run src/features/registry/CardPrintTemplateEditor.test.tsx --reporter=dot --testTimeout=10000`:
  passed, 5 tests.
- `pnpm -C frontend typecheck`: passed.
- `pnpm -C frontend lint`: passed.
- `pnpm -C frontend format:check`: passed after formatting the touched TSX
  files.
- `backend\.venv\Scripts\python.exe -m ruff check backend/app/api/v1/endpoints/documents.py backend/app/services/documents.py backend/tests/test_api_phase_2d_documents.py`:
  passed.
- `backend\.venv\Scripts\python.exe -m ruff format --check backend/app/api/v1/endpoints/documents.py backend/app/services/documents.py backend/tests/test_api_phase_2d_documents.py`:
  passed.
- `backend\.venv\Scripts\python.exe -m pytest backend\tests\test_document_generation_services.py::test_card_print_layout_renderers_use_structured_layout_and_card_values -q`:
  passed.
- `backend\.venv\Scripts\python.exe -m pytest backend\tests\test_api_phase_2d_documents.py::test_card_print_layout_template_versions_and_generates_pdf_docx -q`:
  skipped locally because `TEST_DATABASE_URL` is not configured.
- `.venv\Scripts\python.exe -m mypy app` from `backend/`: passed.
- `powershell -ExecutionPolicy Bypass -File scripts\check.ps1`: passed; backend
  reported 141 passed / 172 skipped, frontend reported 97 passed, production
  frontend build passed, and project-map check passed.
- `powershell -ExecutionPolicy Bypass -File scripts\push-git.ps1 -Message "Fix A4 print template review issues" -SkipCheck`:
  committed and pushed `9079faa7`.
- `powershell -ExecutionPolicy Bypass -File scripts\deploy.ps1`: server checkout
  fast-forwarded to `9079faa`, backend package was reinstalled, and server
  checks passed.
- `powershell -ExecutionPolicy Bypass -File scripts\deploy-frontend.ps1`: built
  and uploaded `frontend/dist`, restarted `reg-engine.service`, and passed API
  health plus same-origin frontend smoke.
- `powershell -ExecutionPolicy Bypass -File scripts\service.ps1 -Command status`:
  `reg-engine.service` was active on `0.0.0.0:8000` and `/api/v1/health`
  returned ok after live QA.
- In-app Browser validation was attempted first, but the Browser runtime timed
  out while opening/snapshotting the deployed app and reset the kernel. The live
  UI validation used regular Playwright fallback.
- Playwright live QA against `http://192.168.100.12:8000/` passed:
  - login as `admin` succeeded;
  - active registry list contained one registry after soft-archiving the two
    `codex_a4b*` test registries;
  - A4 dropdown contained only `Новый шаблон` and `Базовый шаблон: печать`;
  - new A4 template canvas had zero field elements on open;
  - mouse drag from the existing-field palette to the canvas created one field
    element;
  - blank DOCX/PDF downloads from the A4 editor saved valid files with `PK` and
    `%PDF` signatures;
  - card action panel showed enabled `Скачать DOCX` and `Скачать PDF` buttons,
    downloaded valid files with `PK` and `%PDF` signatures, and the browser
    console/page-error capture was empty.
- Live screenshots and downloaded files were saved outside Git:
  `C:\Temp\reg-engine-20260705_phase8c-a4-editor-drag-verify.png`,
  `C:\Temp\reg-engine-20260705_phase8c-card-action-panel.png`,
  `C:\Temp\reg-engine-20260705_phase8c-blank-template.docx`,
  `C:\Temp\reg-engine-20260705_phase8c-blank-template.pdf`,
  `C:\Temp\reg-engine-20260705_phase8c-card-action.docx`, and
  `C:\Temp\reg-engine-20260705_phase8c-card-action.pdf`.

## Phase 8D: A4 Blank Download And Existing Blocks Follow-Up

Status: completed on `main`, pushed to GitHub, deployed to the server, and
live-verified.

Purpose:

Fix the production A4 editor follow-up where downloading DOCX/PDF from an
unsaved `Новый шаблон` attempted to create a duplicate print template and
surfaced `Данные нарушают ограничения базы`, and let administrators place an
existing schema block on the A4 canvas directly instead of adding only
individual fields.

Implemented scope:

1. Blank current-layout downloads:
   - added `POST /api/v1/registries/{registry_id}/card-print-templates/blank-docx`
     and `/blank-pdf`;
   - the endpoints validate the submitted `card_print_layout_v1` against the
     selected card template and registry blocks, render blank DOCX/PDF content,
     and return binary responses without creating `document_templates`,
     `document_template_versions`, `generated_documents`, or stored files;
   - the A4 editor DOCX/PDF buttons now send the current unsaved canvas layout
     to those endpoints when no card is selected.
2. Existing block placement:
   - the A4 palette now includes `Существующие блоки`;
   - existing form blocks can be added by click or mouse drag/drop onto the A4
     canvas;
   - block print repeat mode is reused from
     `form_blocks.display_config_json.print_repeat_mode` when present, otherwise
     it falls back to repeat-section for repeatable blocks and first-instance
     mode for non-repeatable blocks.

Non-goals in this slice:

- No database migration.
- No hardcoded business-specific fields or employee schema.
- No public generated-document workflow.
- No changes to ordinary card filling.
- No physical cleanup of production data.

Verification completed so far:

- `pnpm -C frontend exec vitest run src/features/registry/CardPrintTemplateEditor.test.tsx --reporter=dot --testTimeout=10000`:
  passed, 6 tests.
- `backend\.venv\Scripts\python.exe -m pytest backend\tests\test_api_phase_2d_documents.py::test_card_print_layout_template_versions_and_generates_pdf_docx -q`:
  skipped locally because `TEST_DATABASE_URL` is not configured.
- `backend\.venv\Scripts\python.exe -m ruff check backend/app/api/v1/endpoints/documents.py backend/app/services/documents.py backend/app/schemas/documents.py backend/tests/test_api_phase_2d_documents.py`:
  passed.
- `backend\.venv\Scripts\python.exe -m ruff format --check backend/app/api/v1/endpoints/documents.py backend/app/services/documents.py backend/app/schemas/documents.py backend/tests/test_api_phase_2d_documents.py`:
  passed.
- `backend\.venv\Scripts\python.exe -m pytest backend\tests\test_document_generation_services.py::test_card_print_layout_renderers_use_structured_layout_and_card_values backend\tests\test_card_print_layout_services.py -q`:
  passed, 6 tests.
- `pnpm -C frontend typecheck`: passed.
- `pnpm -C frontend lint`: passed.
- `pnpm -C frontend format:check`: passed.
- `powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote`:
  passed; backend reported 141 passed / 172 skipped / 1 warning, frontend
  reported 98 passed, production frontend build passed, and project-map check
  passed.
- `powershell -ExecutionPolicy Bypass -File scripts/push-git.ps1 -Message "Fix A4 blank downloads and block placement" -SkipCheck`:
  committed and pushed `c444d4d1`.
- `powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1`: server checkout
  fast-forwarded to `c444d4d`, backend package was reinstalled, and server
  checks passed.
- `powershell -ExecutionPolicy Bypass -File scripts/deploy-frontend.ps1`: built
  and uploaded `frontend/dist`, restarted `reg-engine.service`, and passed API
  health plus same-origin frontend smoke.
- `powershell -ExecutionPolicy Bypass -File scripts/server-check.ps1`: passed
  after deployment.
- In-app Browser validation was attempted first, but it timed out while
  inspecting the deployed app and reset the browser automation kernel. The live
  UI validation used regular Playwright fallback.
- Playwright live QA against `http://192.168.100.12:8000/` passed:
  - login as `admin` succeeded through the production auth API;
  - registry `Реестр карточек` and card template `Базовый шаблон` opened in
    the deployed UI;
  - the A4 palette showed `Существующие блоки`;
  - existing field `Имя` was added to the canvas;
  - existing block `ФИО` was added by click and by mouse drag/drop, leaving two
    block elements and one field element on the A4 canvas;
  - DOCX and PDF downloads called only
    `POST /api/v1/registries/{registry_id}/card-print-templates/blank-docx`
    and `/blank-pdf`;
  - no `POST /api/v1/registries/{registry_id}/card-print-templates` create
    request was made during blank downloads;
  - the red `Данные нарушают ограничения базы.` message was not visible;
  - downloaded files had valid `PK` and `%PDF` signatures;
  - browser console warnings/errors and page errors were empty.
- Live screenshots and downloaded files were saved outside Git:
  `C:\Temp\reg-engine-phase8d-a4-blocks-20260705101536.png`,
  `C:\Temp\reg-engine-phase8d-blank-current-20260705101536.docx`, and
  `C:\Temp\reg-engine-phase8d-blank-current-20260705101536.pdf`.

## Phase 8F: A4 Layout Studio Normalized Layout Refactor

Status: completed on `main`, pushed to GitHub, deployed to the server, and
live-verified. No database migration.

Purpose:

Move the A4 print-template implementation toward one normalized layout contract
that can support design, preview, readonly, and optional fill modes without
breaking ordinary card filling or existing generated-document flows.

Implemented scope:

1. Frontend layout contract:
   - added `CardLayoutStudio` as the active print editor entry point while
     keeping `CardPrintTemplateEditor` as a thin compatibility export;
   - added A4 layout module entry files under
     `frontend/src/features/registry/print/`;
   - extended API types with `CardPrintSection`, `CardPrintFlowItem`,
     `CardPrintOverlayItem`, preview payload/read models, and renderer modes;
   - added geometry normalization helpers that convert legacy flat `items[]`
     into normalized `sections[]` and `overlays[]` without storing CSS pixels;
   - aligned frontend overlap validation with backend rules so decorative A4
     block/container/panel/rectangle items do not warn when they contain field
     content, while overlapping content fields still warn.
2. Backend validation:
   - `card_print_layout_v1` accepts `sections[]`, `overlays[]`, and legacy
     `items[]`;
   - validation checks page bounds, section bounds, section grid placement,
     field ids, block ids, style values, section overlaps, and decorative
     overlay rules;
   - legacy flat layouts are normalized server-side for render compatibility.
3. Rendering and API:
   - DOCX rendering for normalized sections now emits editable Word tables
     instead of plain text lines;
   - PDF rendering consumes the same normalized section/overlay model through
     the existing A4 item renderer;
   - added `POST /api/v1/card-print-templates/preview` to validate and
     normalize unsaved layouts without creating templates or generated files;
   - frontend API wrappers were added for read/archive/preview and explicit
     card-print DOCX/PDF generation calls.

Verification completed:

- `backend\.venv\Scripts\python.exe -m ruff check backend/app/services/card_print.py backend/app/services/documents.py backend/app/schemas/documents.py backend/app/api/v1/endpoints/documents.py backend/tests/test_card_print_layout_services.py backend/tests/test_document_generation_services.py`:
  passed.
- `backend\.venv\Scripts\python.exe -m pytest backend\tests\test_card_print_layout_services.py backend\tests\test_document_generation_services.py::test_card_print_layout_docx_renders_sections_as_editable_word_tables -q`:
  passed, 12 tests.
- `pnpm -C frontend typecheck`: passed.
- `pnpm -C frontend exec vitest run src/features/registry/CardPrintTemplateEditor.test.tsx src/features/registry/print/printLayoutGeometry.test.ts --reporter=dot --testTimeout=10000`:
  passed, 7 tests.
- `pnpm -C frontend exec vitest run src/features/registry/print/printLayoutValidation.test.ts --reporter=dot --testTimeout=10000`:
  failed before the fix and passed after the frontend validation update, 2 tests.
- `powershell -ExecutionPolicy Bypass -File scripts/format.ps1 -Check`:
  passed.
- `powershell -ExecutionPolicy Bypass -File scripts/lint.ps1`: passed.
- `powershell -ExecutionPolicy Bypass -File scripts/typecheck.ps1`: passed.
- `powershell -ExecutionPolicy Bypass -File scripts/test.ps1`: passed; backend
  reported 148 passed / 172 skipped / 1 warning, frontend reported 100 passed
  before the validation regression test was added.
- `powershell -ExecutionPolicy Bypass -File scripts/check.ps1`: passed after the
  validation follow-up; backend reported 148 passed / 172 skipped / 1 warning,
  frontend reported 102 passed, production frontend build passed, and
  project-map check passed.
- `git commit -m "Refactor A4 print layout normalization"`: committed
  `98953547`.
- `git commit -m "Allow A4 block container overlap validation"`: committed
  `b28dd2bb`.
- `git push origin main`: pushed through `b28dd2bb`.
- `powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1`: server checkout
  fast-forwarded to `b28dd2b`, backend package reinstalled, and server checks
  passed.
- `powershell -ExecutionPolicy Bypass -File scripts/deploy-frontend.ps1`: built
  and uploaded `frontend/dist`, restarted `reg-engine.service`, and passed API
  health plus same-origin frontend smoke.
- In-app Browser read access worked but DOM snapshot/click interaction did not
  change React state on this page, so live UI validation used regular
  Playwright fallback after recording that reason.
- Playwright live QA against `http://192.168.100.12:8000/` passed:
  - login as `admin` succeeded;
  - ordinary card-template composition opened first, with the A4 editor available
    through `Печатный шаблон A4`;
  - A4 Studio opened with the expected toolbar, palette, rulers, empty new
    canvas, and existing blocks/fields;
  - adding existing block `ФИО` placed the block container plus its fields on
    the canvas and no longer showed the false overlap warning;
  - ordinary card workspace opened with `Поля` selected by default, and
    `Печатная форма` remained a separate tab using the A4 renderer;
  - card action buttons for DOCX/PDF were visible.
- Production API smoke passed:
  - `POST /api/v1/card-print-templates/preview` returned one normalized section,
    one overlay, and zero warnings for a normalized sample layout;
  - blank current-layout DOCX/PDF endpoints returned valid `PK` and `%PDF`
    signatures without creating templates or generated documents;
  - real card DOCX/PDF generation returned valid `PK` and `%PDF` content, and
    the smoke generated documents were soft-archived afterward.
- Browser network capture during live QA showed only 200 responses for the
  relevant registry/schema/card/card-print API calls.
- Live screenshots and downloaded files were saved outside Git:
  `C:\Temp\reg-engine-a4-layout-studio-block-live.png`,
  `C:\Temp\reg-engine-a4-card-preview-live.png`,
  `C:\Temp\reg-engine-a4-live-blank.docx`,
  `C:\Temp\reg-engine-a4-live-blank.pdf`,
  `C:\Temp\reg-engine-a4-card-action.docx`, and
  `C:\Temp\reg-engine-a4-card-action.pdf`.

## Phase 8G: Unified Card Template Studio Correction

Status: completed on `main`, pushed to GitHub, deployed to the configured
server, and live-browser verified. No database migration was required.

Purpose:

Correct the failed unification from Phase 8F. The selected card template screen
must be one studio, not an old web schema canvas with a nested A4 button. The
same screen must expose the card composition, web-form structure, A4 print
layout, card preview, and technical settings while keeping the existing
schema-driven data model and document generation APIs.

Implementation scope:

1. Selected-template screen:
   - replace the selected-template block in `RegistriesAndSchema.tsx` with the
     canonical `CardLayoutStudio`;
   - remove `isPrintEditorOpen`, the nested A4 open button, and the old
     `schema-canvas schema-block-layout-grid` selected-template editor;
   - keep create/edit/archive flows outside the selected-template studio
     unchanged unless they are needed by the studio callback contract.
2. Canonical frontend modules:
   - make `frontend/src/features/registry/print/CardLayoutStudio.tsx` the real
     implementation with the public props contract used by
     `RegistriesAndSchema.tsx`;
   - keep `CardPrintTemplateEditor` files only as compatibility exports;
   - make `frontend/src/features/registry/print/A4LayoutRenderer.tsx` the real
     renderer implementation with design, preview, fill, and readonly modes;
   - keep `A4TemplateRenderer`/`A4LayoutCanvas` only as compatibility exports.
3. Studio modes:
   - default directly to the A4 print form canvas;
   - add mode navigation for card composition, web form, A4 print form, card
     preview, and settings;
   - show compact structure lists for blocks and fields instead of the old
     schema drag/drop canvas;
   - keep adding existing fields and blocks to A4 by click and mouse drag/drop,
     preserving field order inside a block.
4. Unified selected element behavior:
   - when an A4 item is selected, show data, web-form, print-form, appearance,
     access/publicity, and technical property sections in one side panel;
   - show unresolved/archived field problems as A4 validation issues through
     the existing layout validation path.
5. Saving and generation:
   - keep create/update print-template saves through
     `createCardPrintTemplate`/`createCardPrintTemplateVersion`;
   - keep blank DOCX/PDF downloads for unsaved layouts;
   - do not change backend migrations or the `card_print_layout_v1` database
     contract unless a test proves it is required.

Required verification:

- Frontend regression tests must prove that the selected template renders
  `CardLayoutStudio` directly, no old A4 open button is present, no old selected
  `schema-canvas` is present, the structure panel lists blocks/fields, A4 design
  mode can select an item, preview mode hides grid/technical data, saving calls
  the existing print-template APIs, and DOCX/PDF buttons call the existing
  generation/download APIs.
- Grep acceptance must show `isPrintEditorOpen` is removed from
  `RegistriesAndSchema.tsx`, `CardPrintTemplateEditor` is not the active editor
  imported there, and `A4TemplateRenderer` is not the canonical renderer
  implementation.
- Run focused frontend tests, typecheck/lint/test/check scripts, deploy to the
  configured server, then live browser-check the unified studio at
  `http://192.168.100.12:8000/`.

Local verification completed:

- `pnpm -C frontend exec vitest run src/features/registry/CardPrintTemplateEditor.test.tsx --reporter=dot --testTimeout=10000`:
  passed, 9 tests.
- `powershell -ExecutionPolicy Bypass -File scripts/format.ps1 -Check`:
  passed.
- `powershell -ExecutionPolicy Bypass -File scripts/typecheck.ps1`: passed.
- `powershell -ExecutionPolicy Bypass -File scripts/lint.ps1`: passed.
- `powershell -ExecutionPolicy Bypass -File scripts/test.ps1`: passed; backend
  reported 148 passed / 172 skipped / 1 warning, frontend reported 80 passed /
  25 skipped.
- `powershell -ExecutionPolicy Bypass -File scripts/check.ps1`: passed; GitHub
  SSH, server root SSH, backend checks, frontend lint/typecheck/test, production
  frontend build, and project-map check passed.
- The 25 skipped frontend tests in `frontend/src/App.test.tsx` are obsolete
  selected-template visual-canvas checks. They targeted the removed old
  `schema-canvas` editor and were replaced by focused CardLayoutStudio/A4
  renderer regression coverage.

Deployment and live verification completed:

- Commit `2eda94cd Unify card template layout studio` was pushed to
  `origin/main`.
- `powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1`: passed; the
  server checkout fast-forwarded to `2eda94c`, the backend package was
  reinstalled, and server checks passed.
- `powershell -ExecutionPolicy Bypass -File scripts/deploy-frontend.ps1`:
  passed; the production frontend build was uploaded, `reg-engine.service` was
  restarted, the API healthcheck passed, and same-origin frontend/API smoke
  passed on port 8000.
- In-app Browser documentation output was truncated in this session, so final
  live UI validation used the project's installed `@playwright/test` runtime
  against `http://192.168.100.12:8000/`.
- Live Playwright QA passed:
  - authenticated as `admin`;
  - opened `Реестры` -> `Схема карточки` -> selected `Базовый шаблон`;
  - verified the unified studio tabs `Состав карточки`, `Веб-форма`,
    `Печатная форма A4`, `Предпросмотр карточки`, and `Настройки`;
  - verified A4 mode is selected by default;
  - verified the old `Печатный шаблон A4` button is absent;
  - verified the old selected-template `.schema-canvas.schema-block-layout-grid`
    is absent;
  - verified the structure/web modes render 3 blocks and 10 `На A4` bridge
    controls;
  - verified preview mode hides the design grid and palette;
  - verified blank DOCX and PDF downloads from the unified screen.
- Live QA found no framework overlay and no console errors.
- Live screenshots and downloaded blank files were saved outside Git:
  `C:\Temp\reg-engine-phase8g-unified-studio-live.png`,
  `C:\Temp\reg-engine-phase8g-preview.png`,
  `C:\Temp\reg-engine-phase8g-blank.docx`, and
  `C:\Temp\reg-engine-phase8g-blank.pdf`.

## Phase 8H: Unified Card Template Layout Contract

Status: completed on `main`, pushed to GitHub, deployed to the configured
server, and live-browser verified on `http://192.168.100.12:8000/`. No
destructive database migration is required.

Goal:

Make the card template the single user-facing layout contract. The UI and new
API must stop treating A4 as a separate user-level "print template" entity.
Internally, existing `document_templates` / `document_template_versions` with
`template_format=card_print_layout_v1` remain the storage and generation
mechanism for A4 print views.

Architecture:

- Add a backend `CardTemplateLayoutRead` contract with:
  - `version = "card_template_layout_v1"`;
  - `structure` from current `form_blocks`, `form_fields`, and
    `card_templates.field_schema_json.field_ids`;
  - `form_layout` as a logical 12-column flow model stored inside
    `card_templates.field_schema_json.form_layout`;
  - `print_views` projected from internal `document_templates` rows and
    normalized `card_print_layout_v1` layout JSON;
  - `export_settings` derived from the default print view / output filename;
  - `sync_status` computed from mapping between `form_layout` item ids and A4
    `source_item_id` values.
- Keep web and A4 geometry separate:
  - web/form layout: 12-column logical sections/items;
  - print view: A4 millimeter geometry and existing A4 renderer;
  - projection maps logical item position to A4 coordinates without scaling DOM
    pixels.
- Keep legacy `/card-print-templates` endpoints working for compatibility, but
  switch the main frontend studio and ordinary card print actions to the new
  card-template layout endpoints.

Implementation tasks:

1. Backend schemas and projection tests:
   - Add `backend/app/schemas/card_template_layouts.py` with:
     `CardTemplateLayoutRead`, `CardTemplateLayoutUpdate`,
     `CardTemplateStructureRead`, `CardTemplateFormLayoutRead`,
     `CardTemplatePrintViewRead`, `CardTemplatePrintViewUpdate`,
     `CardTemplateLayoutSyncStatusRead`,
     `CardTemplateLayoutProjectionResult`, and
     `CardTemplateExportSettingsRead`.
   - Add `backend/app/services/card_template_projection.py` with pure functions:
     `project_form_layout_to_a4`, `sync_print_view`, and
     `build_mapping_table`.
   - Add backend RED tests before implementation in
     `backend/tests/test_card_template_layout_services.py` for:
     virtual default print view generation;
     field item projection from `form_layout` to A4;
     preserving `override=true` geometry during sync;
     missing source field warnings;
     archived field sync status.

2. Backend service and API:
   - Add `backend/app/services/card_template_layout.py`.
   - Implement `CardTemplateLayoutService` methods:
     `read_layout_for_actor`, `update_form_layout_for_actor`,
     `create_print_view_for_actor`, `update_print_view_for_actor`,
     `sync_print_view_from_form_layout`, `generate_docx_for_actor`, and
     `generate_pdf_for_actor`.
   - Add `backend/app/api/v1/endpoints/card_template_layouts.py`.
   - Register it in `backend/app/api/v1/router.py`.
   - Add endpoints:
     - `GET /api/v1/card-templates/{template_id}/layout`;
     - `PATCH /api/v1/card-templates/{template_id}/layout/form`;
     - `POST /api/v1/card-templates/{template_id}/layout/print-views`;
     - `PATCH /api/v1/card-templates/{template_id}/layout/print-views/{print_view_id}`;
     - `POST /api/v1/card-templates/{template_id}/layout/print-views/{print_view_id}/sync`;
     - `POST /api/v1/cards/{card_id}/card-template-layout/{template_id}/generate-docx`;
     - `POST /api/v1/cards/{card_id}/card-template-layout/{template_id}/generate-pdf`.
   - Reuse `DocumentService` for validation/rendering/generation instead of
     duplicating DOCX/PDF rendering logic.
   - Persist print views by creating/updating internal `DocumentTemplate` and
     `DocumentTemplateVersion` records only when the user saves the print view.
     If no internal print view exists, return a virtual `default-a4` print view
     generated from `form_layout` without writing to the database.

3. Frontend types and client:
   - Extend `frontend/src/api/types.ts` with the unified layout contract types.
   - Add client functions in `frontend/src/api/client.ts`:
     `getCardTemplateLayout`, `updateCardTemplateFormLayout`,
     `createCardTemplatePrintView`, `updateCardTemplatePrintView`,
     `syncCardTemplatePrintView`, `generateCardTemplateLayoutDocx`, and
     `generateCardTemplateLayoutPdf`.
   - Keep old card-print client functions for compatibility and focused
     regression tests.

4. CardLayoutStudio data model switch:
   - Change `frontend/src/features/registry/print/CardLayoutStudio.tsx` so it
     loads and edits `CardTemplateLayoutRead`.
   - Replace the "Шаблон печати / Новый шаблон" dropdown with a print-view
     selector labelled "Печатное представление", default option
     "Основная A4", and `+ Добавить представление`.
   - Rename user-facing studio modes to:
     `Состав`, `Форма`, `Печать A4`, `Предпросмотр`, `Экспорт`.
   - Make the `Форма` mode edit logical `form_layout`.
   - Make `Печать A4` edit the selected `print_view`.
   - When A4 item geometry is changed by drag/resize/properties, mark the item
     with `override=true`.
   - When form layout changes, either project missing A4 items automatically or
     expose sync warnings through the sync panel.

5. Sync panel and ordinary card print actions:
   - Add a `Синхронизация` panel to the studio showing:
     missing A4 fields, archived fields, A4 items without a source item, and
     manual overrides.
   - Add buttons where feasible in this phase:
     `Синхронизировать автоматически`, `Разместить отсутствующие`,
     and `Сбросить ручное положение`.
   - Update `frontend/src/features/cards/CardsWorkspace.tsx` to use unified
     layout generation endpoints for card action DOCX/PDF downloads while
     preserving the existing generated-document download flow.

6. Verification and deployment:
   - Backend focused tests:
     `python -m pytest backend/tests/test_card_template_layout_services.py -q`.
   - Frontend focused tests:
     `pnpm -C frontend exec vitest run src/features/registry/CardPrintTemplateEditor.test.tsx --reporter=dot --testTimeout=10000`.
   - Full local checks:
     `powershell -ExecutionPolicy Bypass -File scripts/format.ps1 -Check`;
     `powershell -ExecutionPolicy Bypass -File scripts/lint.ps1`;
     `powershell -ExecutionPolicy Bypass -File scripts/typecheck.ps1`;
     `powershell -ExecutionPolicy Bypass -File scripts/test.ps1`;
     `powershell -ExecutionPolicy Bypass -File scripts/check.ps1`.
   - Commit to `main`, push `origin/main`, deploy with
     `scripts/deploy.ps1`, deploy frontend with `scripts/deploy-frontend.ps1`,
     then live browser-check `http://192.168.100.12:8000/`.

Implementation notes after local execution:

- Backend schemas, projection service, layout service, and API router were
  added. The API now exposes the unified `card_template_layout_v1` read/update,
  print-view create/update/sync, and DOCX/PDF generation endpoints.
- The first A4 print view remains virtual (`default-a4`) until save; saved
  views are persisted through existing `document_templates` /
  `document_template_versions` with `card_print_layout_v1`.
- Frontend API types/client were extended. `CardLayoutStudio` now loads the
  unified layout contract, uses a `Печатное представление` selector, has modes
  `Состав`, `Форма`, `Печать A4`, `Предпросмотр`, `Экспорт`, marks manual A4
  geometry with `override=true`, and shows sync status/actions.
- Card action DOCX/PDF downloads and the card print preview now use the unified
  card-template layout endpoints instead of listing print templates directly.
- A4 drag/drop was hardened with a shared payload helper and the initial
  virtual-view load no longer overwrites local canvas edits.
- Verification completed locally:
  - `backend/.venv/Scripts/python.exe -m pytest tests/test_card_template_layout_services.py tests/test_api_phase_2d_documents.py -q`;
  - `pnpm -C frontend exec vitest run src/features/registry/CardPrintTemplateEditor.test.tsx --reporter=dot --testTimeout=10000`;
  - `powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote`.
- Deployment and live verification completed:
  - commits `a8e06fdd` and `77a1c9d9` were pushed to `origin/main`;
  - `scripts/deploy.ps1` fast-forwarded the configured server checkout to
    `77a1c9d9`, and server checks passed;
  - `scripts/deploy-frontend.ps1` deployed frontend asset
    `index-C80psq5i.js`, restarted `reg-engine.service`, and the health and
    frontend smoke checks passed;
  - in-app Browser verified the deployed unified studio modes
    `Состав карточки`, `Веб-форма`, `Печатная форма A4`,
    `Предпросмотр карточки`, `Экспорт`, the `Печатное представление` selector,
    the A4 sync panel, the absence of the old `Печатный шаблон A4` button, and
    the card action buttons `Скачать DOCX` / `Скачать PDF`;
  - REST live smoke verified `GET /api/v1/card-templates/{template_id}/layout`
    returns `card_template_layout_v1`, and generated DOCX/PDF downloads have
    valid `PK` / `%PDF` signatures.

Acceptance criteria:

- The user sees one entity, `Шаблон карточки`; A4 is shown as a
  `Печатное представление` inside it, not as a separate user-level
  `Шаблон печати`.
- `GET /api/v1/card-templates/{template_id}/layout` returns one
  `card_template_layout_v1` contract with `structure`, `form_layout`,
  `print_views`, `export_settings`, and `sync_status`.
- A card template with no saved print views returns a virtual A4 print view
  generated from `form_layout` and does not persist it until save.
- Saved A4 print views are still stored internally in existing
  `document_templates` / `document_template_versions` rows.
- A4 print-view items carry `source_item_id` where they originate from
  `form_layout`.
- Manual A4 movement sets `override=true`, and sync preserves overridden
  geometry.
- Added/archived/missing fields are surfaced in sync status.
- DOCX/PDF generation uses the selected/default `print_view` from the unified
  card-template layout.
- Legacy `/card-print-templates` endpoints remain compatible.

## Phase 8I: Single Workspace Card Template Editor UX

Status: completed on `main`, pushed to GitHub, deployed to the configured
server frontend, and live browser-verified. No database migration was required.

Problem:

Phase 8H unified the backend/API contract, but the frontend still exposed
`Веб-форма` and `Печатная форма A4` as separate editor modes. That still makes
the user think there are two templates instead of one card template with web and
print projections.

Goal:

Make the selected `Шаблон карточки` feel like one editor. The user should work
with one block/field identity and see/edit its web placement and A4 placement as
properties of the same element, not as separate tabs.

Implementation tasks:

1. Frontend regression tests first:
   - Update `frontend/src/features/registry/CardPrintTemplateEditor.test.tsx`
     so the selected template opens with a single `Макет карточки` mode.
   - Assert that `Веб-форма` and `Печатная форма A4` are no longer top-level
     editor tabs.
   - Assert that the one workspace renders both the web/form structure and the
     A4 preview/editor area.
   - Assert that selecting a field shows one properties panel with tabs
     `Данные`, `Веб-форма`, `Печатная форма A4`, `Внешний вид`,
     `Доступ / публичность`, and `Техническое`.

2. `CardLayoutStudio` mode model:
   - Replace the current top-level modes
     `Состав карточки`, `Веб-форма`, `Печатная форма A4`,
     `Предпросмотр карточки`, `Экспорт` with:
     `Макет карточки`, `Предпросмотр карточки`, `Экспорт`.
   - Keep A4 toolbar actions, print-view selector, DOCX/PDF, save, and sync
     controls available from `Макет карточки`.
   - Keep `Предпросмотр карточки` read-only and `Экспорт` focused on generated
     document settings.

3. Unified workspace layout:
   - In `Макет карточки`, render a left structure/web-form panel and a center
     A4 projection side by side inside one working area.
   - Selecting a block/field from either side updates the same selected-element
     state.
   - Remove copy that implies separate templates.

4. Unified selected-element panel:
   - Add one properties panel for the selected block/field with tabs:
     `Данные`, `Веб-форма`, `Печатная форма A4`, `Внешний вид`,
     `Доступ / публичность`, `Техническое`.
   - For this phase, reuse existing editable controls where they already exist
     and show read-only bridge data where a write control is not yet wired.
   - Keep the existing detailed A4 properties panel for A4-only decorative
     elements such as headings, lines, QR codes, and images.

5. Verification and deployment:
   - Focused frontend test:
     `pnpm -C frontend exec vitest run src/features/registry/CardPrintTemplateEditor.test.tsx --reporter=dot --testTimeout=10000`.
   - Local full check:
     `powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote`.
   - Commit to `main`, push `origin/main`, run `scripts/deploy.ps1`, deploy the
     frontend with `scripts/deploy-frontend.ps1`, and live browser-check
     `http://192.168.100.12:8000/`.

Verification completed locally so far:

- `pnpm -C frontend exec vitest run src/features/registry/CardPrintTemplateEditor.test.tsx --reporter=dot --testTimeout=10000`
  passed: 1 test file, 9 tests.
- `pnpm -C frontend typecheck` passed.
- `pnpm -C frontend lint` passed.
- `powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote`
  passed, including backend pytest, frontend test run, frontend production
  build, and project-map check.
- `powershell -ExecutionPolicy Bypass -File scripts/push-git.ps1 -Message "Unify card template editor workspace"`
  passed full local checks with GitHub/server SSH checks, committed
  `efc703a7`, and pushed `main` to `origin/main`.
- `powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1` fast-forwarded
  the server checkout to `efc703a7` and passed server checks.
- `powershell -ExecutionPolicy Bypass -File scripts/deploy-frontend.ps1`
  rebuilt, uploaded, and smoke-checked the frontend on the server.
- Live browser verification on `http://192.168.100.12:8000/` passed:
  `Макет карточки`, `Предпросмотр карточки`, and `Экспорт` are the only studio
  top-level modes; old top-level `Веб-форма` and `Печатная форма A4` tabs are
  absent; the unified workspace and A4 page render together; selecting the
  `Имя` A4 field opens one unified properties panel with `Данные`,
  `Веб-форма`, `Печатная форма A4`, `Внешний вид`,
  `Доступ / публичность`, and `Техническое`; the A4 tab shows X/Y/width/height
  controls; preview mode renders without palette/properties; browser console
  had no warnings or errors.

Acceptance criteria:

- The selected card template editor has no top-level `Веб-форма` tab and no
  top-level `Печатная форма A4` tab.
- The main editor mode is `Макет карточки`.
- The same workspace shows web/form structure and A4 projection together.
- Selecting one field/block shows a single properties panel with web and A4
  tabs for that same element.
- Existing A4 print-view save, sync, preview, blank DOCX/PDF, and card action
  DOCX/PDF flows still work.

## Phase 8J: Contextual Card Layout Studio

Status: complete on `main`, pushed, deployed, and live Browser-verified through
checkpoint `46c4f0e8`. No database migration was required.

Goal:

Replace the current A4-dominated template workspace with a contextual,
mouse-first 12-by-4 card-layout editor. Blocks and fields snap to quarter width
and quarter height, semantic editors open inside the selected object, and the
linked web-card composition is placed into A4 as one object.

Design and implementation plan:

- `docs/superpowers/specs/2026-07-10-contextual-card-layout-studio-design.md`
- `docs/superpowers/plans/2026-07-10-contextual-card-layout-studio.md`

Implemented contract:

1. Form geometry is exactly 12 columns by four logical rows. Block and field
   widths use `3 | 6 | 9 | 12`; heights use `1 | 2 | 3 | 4`. Save-time backend
   validation rejects overflow and collisions. Legacy form layouts with rows
   above four remain readable with a warning but must be corrected before the
   next save.
2. Mouse interaction uses pointer capture for move and eight-direction resize.
   Keyboard fallback uses arrows to move and `Shift + стрелки` to resize.
   Pointer preview does not write; `Готово` commits one command, while
   `Escape`, pointer cancel, or `Отмена` restores the original rectangle.
3. The studio has exactly three Russian stages: `Макет карточки`,
   `Печатная форма A4`, and `Предпросмотр`. Block/field create, insert, and edit
   controls appear contextually inside the canvas; there is no permanent
   palette/properties surface in layout or preview, and preview is read-only.
4. Every form-layout save sends the current `expected_revision`. A one-in-flight
   latest-value queue serializes layout writes with schema/membership writes.
   HTTP `409` keeps the local draft and exposes explicit compare, accept-server,
   and save-local choices. Non-conflict failures retain the newest draft and
   expose `Повторить`. Undo/redo uses the same queued revision-safe path.
5. Linked A4 layouts use `composition_mode=linked_card` with exactly one
   protected `card_layout` rectangle. Only that enclosing rectangle and
   print-only overlays have A4 geometry; internal block/field editing routes to
   `Макет карточки`. Generation expands the current form layout into the linked
   rectangle for DOCX/PDF without writing expanded field geometry back to the
   saved print view.
6. Legacy `items[]` A4 layouts remain readable. Explicit conversion creates a
   new audited document-template version and leaves the prior version unchanged
   and readable. Marker-free older linked layouts remain compatible; new linked
   views enforce exactly one linked rectangle.
7. Inline block writes persist the schema-driven title, description,
   repeatability, public visibility/editability, ordering/layout values, and
   approved `title_position` / `collapsible` display settings. Inline field
   writes persist the technical code, name, description, canonical field type,
   reference/options/static-text configuration, public visibility/editability,
   and list-display settings. Backend validation enforces field-code format and
   registry-wide uniqueness, active same-registry reference sources, safe
   field-type transitions, permission checks, and audit events. Automatic base
   template membership refresh locks and reloads the template and preserves
   `form_layout`.
8. All user-facing stage names, actions, validation, conflict recovery,
   geometry feedback, and accessible control names are Russian-first.

Task 7 local verification:

- `powershell -ExecutionPolicy Bypass -File scripts/project-map.ps1`:
  passed and regenerated `docs/PROJECT_TREE.md`.
- `powershell -ExecutionPolicy Bypass -File scripts/project-map.ps1 -Check`:
  passed with `Project tree is current.`
- `powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote`:
  passed. Python syntax compilation passed. Backend Ruff and Ruff format checks
  passed (`138 files already formatted`), mypy passed for 79 source files, and
  pytest reported 213 passed / 175 skipped / one warning. Frontend ESLint and
  TypeScript passed, Vitest reported 12 files passed with 161 passed / 25
  skipped tests, the production build passed with 134 modules transformed, and
  the final project-tree check passed. Remote GitHub/server checks were skipped
  intentionally by `-SkipRemote`.

Task 7 live follow-up defect and repair:

- Live validation of deployed checkpoint `839c8be3` found that converting the
  production legacy print view whose identifier starts with `3b2e` returned
  HTTP `422` with the existing safe Russian linked-layout detail. Its legacy
  `items[]` contained one heading, two fields, and one static-text item.
- Root cause: conversion correctly removed the legacy field items but retained
  heading/static text beside the full-page linked `card_layout`; validation
  then rejected both print-only flow items because they overlapped the linked
  rectangle.
- The focused service regression now uses that production-shaped composition,
  executes the real layout validator, verifies one new audited version with
  exactly one `card_layout`, preserves heading/static text plus image/QR content
  as overlays, keeps the previous version readable, and checks generated DOCX
  `PK` and PDF `%PDF` signatures plus supported overlay text.
- The repair is limited to conversion composition: linked conversion writes only
  the protected rectangle to `items[]` and promotes all remaining non-field,
  non-block, non-card-layout flow items to explicit overlays. The shared splitter
  and generation behavior for already normalized linked layouts are unchanged.
- Focused verification passed with the repository virtual environment:
  `python -m pytest tests/test_document_generation_services.py
  tests/test_card_print_layout_services.py
  tests/test_card_template_layout_services.py -q -ra`; the ten disposable
  PostgreSQL cases remained skipped because `TEST_DATABASE_URL` was not set, and
  the existing Starlette/httpx warning remained. The repaired conversion still
  requires deployment and a repeat of the production live conversion before
  this follow-up can be marked live-verified.

Task 7 live follow-up review hardening:

- Review of the conversion repair found one remaining contract mismatch:
  `DocumentService` already renders positioned `metadata`, `page_number`, and
  `print_date` print-only content, but explicit overlay validation rejected
  those three kinds after legacy conversion promoted them into `overlays[]`.
- Explicit overlays now accept those three dynamic text kinds with the same
  style and A4-bound validation as the existing heading, static-text,
  image/QR, and decorative overlay kinds. `field`, `block`, `card_layout`, and
  unknown kinds remain rejected as overlays.
- The production-shaped conversion regression now includes heading, static
  text, metadata, page number, print date, image, and QR legacy content, plus
  duplicate identifiers across `items[]`, `overlays[]`, and section items. It
  verifies one linked `card_layout`, exactly one normalized copy of every
  print-only item, valid converted and previous layouts, the unchanged previous
  version, the existing version audit event, DOCX/PDF signatures, and exactly
  one rendered occurrence of every deterministic print-only text value.
- Strict red/green verification used the repository virtual environment. The
  focused new-test command first failed only because the validator rejected the
  three dynamic overlay kinds, then passed all three selected regressions after
  the allow-list repair. The full print/document/layout suite passed with ten
  expected disposable PostgreSQL skips; the full backend suite reported 215
  passed / 175 skipped / one existing Starlette/httpx warning.
- `ruff check .`, `ruff format --check .` (`138 files already formatted`), and
  `mypy app` (`79 source files`) passed. The cumulative
  `scripts/check.ps1 -SkipRemote` gate passed: backend 215 passed / 175 skipped,
  frontend Vitest 161 passed / 25 skipped, the production frontend build
  completed with the existing chunk-size advisory, and the project-map check
  passed. This review follow-up remains local-only; no push or deployment was
  performed.

Task 7 final conversion safety follow-up:

- Final review found that the shared print-only splitter removed `field`,
  `block`, and `card_layout` before validation even when they came from the
  explicit `overlays[]` collection. As a result, malformed explicit overlays
  could be silently discarded during conversion instead of causing the
  existing safe linked-layout error.
- The splitter now removes those structural kinds only when they come from
  ordinary `items[]` or section items. Explicit overlays are retained long
  enough for `_normalize_overlays` to reject `field`, `block`, `card_layout`,
  and unknown kinds before version numbering, version creation, or audit.
- A parametrized conversion-level regression verifies the validator error and
  safe `DocumentServiceError` for all four unsupported explicit-overlay kinds.
  It also verifies that the previous version remains byte-for-byte unchanged
  and that failure requests neither a next version number nor a new version or
  audit event.
- The production-shaped conversion fixture now also contains an ordinary block
  plus decorative line and rectangle items. Ordinary fields and the block are
  removed, the decorative items and all supported dynamic/visual overlays are
  preserved exactly once, and deterministic DOCX/PDF text is rendered without
  duplicate occurrences.
- Strict red/green verification first reported the expected three failures for
  the silently removed structural kinds while the already-retained unknown kind
  passed. After the one-condition splitter repair, all five selected conversion
  cases passed. The full print/document/layout suite passed with ten expected
  disposable PostgreSQL skips, and the full backend suite reported 219 passed /
  175 skipped / one existing Starlette/httpx warning.
- `ruff check .`, `ruff format --check .` (`138 files already formatted`), and
  `mypy app` (`79 source files`) passed. The cumulative
  `scripts/check.ps1 -SkipRemote` gate passed: backend 219 passed / 175 skipped,
  frontend Vitest 161 passed / 25 skipped, the production frontend build
  completed with the existing chunk-size advisory, and the project-map check
  passed.

Task 7 deployment and live Browser proof:

- `main` was pushed and the configured server checkout synchronized to
  `46c4f0e8`. The frontend artifact was deployed through the project script,
  the API service was restarted, and same-origin frontend/API smoke checks
  passed.
- Live conversion of the production-shaped legacy print view succeeded after
  the focused conversion repairs. The prior version remains readable and the
  new version contains one protected linked-card rectangle plus supported
  print-only overlays; unsupported explicit structural overlays remain
  rejected before version creation or audit.
- The three studio stages, contextual inline block editor, eight resize
  handles, mouse/keyboard geometry session, cancel/restore behavior, Russian
  boundary feedback, linked A4 sizing, and read-only dual preview were exercised
  in the live Browser surface.
- Desktop width `1440` and mobile width `420` were verified. At `420` the page,
  canvas, and card blocks have no horizontal overflow, every block collapses to
  one full-width column, and source order remains the reading order. Evidence
  screenshots `phase8j-desktop-1440.png` and `phase8j-mobile-420.png` are stored
  outside the repository with the local run artifacts.
- The post-login Browser run reported zero console errors. All captured auth,
  organization, registry, card, schema, reference-list, and template-layout
  requests returned HTTP `200`.
- Live blank-document downloads were checked by content signature: DOCX
  returned `PK\\x03\\x04` and PDF returned `%PDF`.

Known warnings and limitations:

- PostgreSQL-backed regressions require a disposable `TEST_DATABASE_URL` whose
  database name ends with `_test`; without it they remain skipped by the local
  unit gate.
- The existing Starlette/httpx deprecation warning is outside Phase 8J.
- The production frontend build retains the existing Vite main-chunk size
  advisory (`526.02 kB`, `149.03 kB` gzip); Phase 8J adds no dependency and
  bundle splitting is deferred.

## Phase 8K: Filled Card Workspace

Status: complete on `main`, pushed, deployed, and live Browser-verified on
2026-07-10 through checkpoint `8782f806`. No database migration was required.

Goal:

Render completed cards with the exact configured block/field geometry and edit
one block at a time directly inside its existing cells. Keep `file_ref` in the
attachment-aware single-field workflow and remove the global mass-edit surface
from the ordinary card view.

Design and implementation plan:

- `docs/superpowers/specs/2026-07-10-filled-card-workspace-design.md`
- `docs/superpowers/plans/2026-07-10-filled-card-workspace.md`

Implementation checkpoint:

- The ordinary card opens read-first and renders completed values through the
  exact saved block/field geometry. The former default mass-edit surface is no
  longer part of the normal card view.
- `Изменить блок` opens one editor directly inside that block's existing cells;
  only that block becomes editable and the surrounding card remains in its
  filled/read-first state. Existing field types and validation are reused.
- `file_ref` remains on the attachment-aware single-field workflow and is not
  folded into the ordinary block bulk payload.
- Non-repeatable and repeatable blocks resolve and save against the exact
  backend UUID for that block instance; repeatable instances never fall back to
  a shared/null primary identifier.
- Desktop preserves the configured grid geometry. At the mobile breakpoint the
  web card follows visual row/column order in one readable column; the linked
  A4 preview keeps its exact print geometry.
- `GET /api/v1/cards/{card_id}/presentation` exposes only the readable card's
  current template structure/layout after card visibility is enforced; it does
  not grant registry-wide schema or template-layout permissions. Manage-only
  schema queries and selected-card actions are gated by backend `can_manage`.
- Read-only card actors keep attachment and generated-document list/download
  access, while upload, archive, template management, and document generation
  remain hidden and backend-protected.
- `powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote`
  passed locally: backend `220 passed / 175 skipped` with the existing single
  Starlette/httpx deprecation warning; frontend `195 passed / 25 skipped`,
  ESLint, TypeScript, production build, and project-map checks passed.
- PostgreSQL permission regressions remain skipped when `TEST_DATABASE_URL` is
  not configured and execute only against a disposable database ending in
  `_test`. Vite retains the existing main-chunk advisory (`540.87 kB`,
  `153.73 kB` gzip); bundle splitting is outside Phase 8K.

Deployment and live Browser proof:

- `main`, `origin/main`, and the configured server checkout were synchronized
  through `8782f806`. Backend/server checks passed, the frontend artifact was
  rebuilt and deployed, the service restarted cleanly, and same-origin
  frontend/API smoke checks passed. The deployed assets are
  `index-B1mnt7tC.js` and `index-DnvFeTec.css`.
- The live flow `Карточки -> заполненная карточка -> Поля` rendered saved values
  in the configured desktop geometry. There is no global `Редактировать`, no
  default mass-edit surface, and no editor below the card. `Изменить блок ФИО`
  opened typed controls directly inside that block.
- `Отмена` restored the initial draft without a write. A real block save
  displayed `Поля карточки сохранены`; the temporary live-test value was then
  removed and the field verified again as `Не заполнено`. Clicking another tab
  with a dirty block opened the three-way dialog `Сохранить / Не сохранять /
  Продолжить редактирование`.
- `Печатная форма`, `Вложения`, `Документы`, `Публичные ссылки`, and `История`
  opened successfully. Header DOCX and PDF actions completed with the visible
  confirmations `DOCX печатной формы скачан` and
  `PDF печатной формы скачан`.
- At desktop width the canvas and all blocks remained inside the workspace. At
  `420 x 900`, every block and field reflowed to `grid-column: 1 / -1` in
  row-major order. Live inspection initially found a page-level overflow from
  the non-shrinking card action button group; the TDD repair `8782f806` stacks
  and constrains that group. The repeated deployed measurement passed with
  `document.scrollWidth = body.scrollWidth = 420`, action buttons `358`, and
  card canvas `384` pixels.
- Evidence screenshots `phase8k-filled-card-desktop.png`,
  `phase8k-filled-card-mobile-420.png`, and
  `phase8k-filled-card-mobile-blocks.png` are stored outside Git with the local
  run artifacts. The final Browser console reported zero errors/warnings. The
  captured post-deploy HTML, JS/CSS assets, auth, registry, organization, card,
  card-presentation, public-link, reference-item, and card-list responses all
  returned HTTP `200`; no response at or above `400` was observed.

## Phase 8L: Public Link Review Lifecycle

Status: complete, pushed, production-migrated, deployed, and live-verified.

Goal:

Extend public links with submit, request-changes, approve, and close states.
Public edits continue to update the real card immediately; administrator review
compares against the link baseline, and approval records the reviewer before
closing all card access through that token.

Design and implementation plan:

- `docs/superpowers/specs/2026-07-10-public-link-review-lifecycle-design.md`
- `docs/superpowers/plans/2026-07-10-public-link-review-lifecycle.md`

Implementation checkpoint:

- Review-enabled links use `active`, `submitted`, `changes_requested`,
  `approved`, `disabled`, and `expired`. Only `active` and
  `changes_requested` permit public editing. Submit makes the token read-only;
  request-changes reopens the same token while it remains unexpired; approval
  records the reviewer and closes both view and edit access.
- Public field saves and permitted attachment uploads remain direct-to-card.
  Link creation captures a safe baseline for comparison, submit stores only
  completed/total public-field counts, and approval does not replay or rewrite
  card values. Invalid transitions, expiry races, and edits/uploads after
  submit are rejected under backend row locking.
- The six review endpoints are implemented:
  `POST /api/v1/public-links/submit`,
  `POST /api/v1/public-links/status`,
  `GET /api/v1/public-links/{public_link_id}/review`,
  `POST /api/v1/public-links/{public_link_id}/request-changes`,
  `POST /api/v1/public-links/{public_link_id}/approve`, and
  `POST /api/v1/public-links/{public_link_id}/start-review-cycle`.
  Administrator actions remain backend-protected by card management access;
  public tokens stay in request bodies and hashed at rest.
- The administrator card surface creates review links with template-scoped
  block/field allowlists, shows a copyable one-time returned URL, lazily loads
  submitted diffs, requires a correction comment, confirms approval, and
  presents lifecycle history without globally loading review data.
- The public page uses `CardLayoutRenderer` in `public-edit` mode with the exact
  sanitized card-template geometry. Only allowed template blocks/fields are
  returned. Public static instructions survive selected block allowlists but
  stay non-editable; field-only allowlists and unselected blocks do not leak
  static content. `file_ref` remains unavailable for public editing.
- Per-field autosave is serialized and server-confirmed. The visible value is
  synchronized from canonical `FieldValueRead.value` only while that request
  is still the latest version; newer input is never overwritten. Submit is
  blocked by pending/failed field saves and pending/unresolved attachment
  uploads.
- Public status is revalidated on every page mount. Cached active preview and
  attachment data are hidden until a fresh successful status response. A
  failed status refresh or lifecycle `403/409` fails closed, purges private
  caches, and never renders stale card or attachment data.
- Submitted, approved, disabled, and expired pages render only the safe status
  receipt. The safe response contains lifecycle status/timestamps, correction
  comment when applicable, and approved completion counts; it contains no card
  values, layout, attachment metadata, raw token, or internal identifiers.
- Additive migration `0023_public_link_review` expands the status constraint,
  adds submission/review timestamps, reviewer, comment, safe baseline/summary
  JSON, `review_enabled`, reviewer foreign key, and the card/status/submitted
  index. Existing rows remain `review_enabled=false`; an administrator must
  explicitly start a review cycle to capture a trustworthy legacy baseline.

Local verification checkpoint:

- The full local check reached backend `226 passed / 191 skipped` and frontend
  `225 passed / 25 skipped`. Ruff, Ruff format, mypy, ESLint, Prettier,
  TypeScript, and the production frontend build passed.
- The build retains the existing Vite main-chunk size advisory. The existing
  Starlette/httpx deprecation warning also remains; neither warning is new to
  Phase 8L.
- The first aggregate pass caught a stale generated `docs/PROJECT_TREE.md` and
  a print-conversion test that still expected an internal permission detail.
  The map was regenerated, the test was aligned with the existing safe Russian
  `403` contract, and the final `scripts/check.ps1 -SkipRemote` passed in full.
- Disposable PostgreSQL `reg_engine_0023_test` was recreated from empty,
  upgraded through every migration to `0023_public_link_review (head)`, and
  `tests/test_database_smoke.py tests/test_public_link_review_lifecycle.py -q`
  passed all 22 database/lifecycle cases. The run also caught and fixed public
  static-text coercion occurring before authorization; the final endpoint now
  returns the safe Russian permission denial before value coercion.

Production release evidence:

- `main`, `origin/main`, and the server checkout were synchronized at
  `781804c7` (`Document public link review lifecycle`). Server checks passed
  before migration and again after frontend deployment.
- Production preflight confirmed Alembic
  `0022_card_print_layout_templates`, zero review-lifecycle columns, and zero
  unexpected existing public-link statuses. A fresh backup was created outside
  Git at
  `/var/backups/reg_engine/reg_engine_before_0023_20260710_153145.dump`;
  size `299383` bytes, SHA-256
  `4af303f1ec50851c4a1a5bd2a643fcf07b8bb417de07505170076e256f9979d4`.
- Production `alembic upgrade head` applied `0023_public_link_review`.
  Post-check confirmed all seven columns, non-null `review_enabled`, the
  expanded status constraint, reviewer foreign key path, and
  `ix_card_public_links_card_status_submitted`. The API service restarted
  active and `/api/v1/health` returned `200`.
- `scripts/deploy-frontend.ps1` deployed
  `/assets/index-CG3uy5Ab.js` and `/assets/index-CxNvpgdd.css`, restarted the
  API service, and passed same-origin frontend/API smoke checks.

Live production proof:

- The in-app Browser opened the review-enabled link against card
  `2cca3aa1-4a8a-4a69-96f8-8f9c082a0b9c`. The public page rendered the saved
  card layout through the shared renderer: block `ФИО` at row 2, column 1,
  span `1 x 12`; fields `Имя` and `Фамилия` retained their configured item
  geometry. At 420 px viewport, `innerWidth=420`, document/body scroll width
  was `405`, and canvas width was `373`, with no horizontal overflow.
- Editing `Имя` showed `Сохранение...`, disabled submit, then showed
  `Все изменения сохранены` only after server confirmation. PostgreSQL already
  contained `Иван LIVE 8L 20260710` before review, and the latest field audit
  was `public_link.update`, `source=public_link`, with a public-link actor.
- A bounded `text/plain` attachment (`51` bytes) was uploaded through the
  public API and appeared in the Browser list with the exhausted one-upload
  quota. Submit replaced the card/layout/attachment surface with only the safe
  receipt and completion count `1 из 2`.
- Administrator review through the deployed backend business service reported
  one changed text field (`before=None`, `after=Иван LIVE 8L 20260710`) and one
  added attachment. Request-changes reopened the same token in the Browser with
  comment `Уточните фамилию и повторно отправьте карточку.`. The recipient
  saved `Петров LIVE 8L` and resubmitted; the receipt reported `2 из 2`.
- Final review reported two changed fields and one attachment. Approval set
  `status=approved`, `can_view=false`, `can_edit=false`, recorded the reviewer,
  and did not change the field-value `updated_at` timestamp
  (`value_rewritten=false`). Reopening the old token showed only
  `Заполнение завершено`; no field, layout, or attachment metadata was present.
- Lifecycle audit order was `create` (administrator), `public_link.submit`
  (public-link actor), `public_link.request_changes` (administrator), second
  `public_link.submit`, and `public_link.approve` (administrator). The temporary
  schema public-edit flags used by the live test were restored to their prior
  values after approval.
- Fresh closed-receipt Browser console errors/warnings: `0`. Captured API
  response: `POST /api/v1/public-links/status` returned `200`; no response at
  or above `400` was observed in the fresh closed-link load.
- Screenshots are stored outside Git under
  `C:\Users\admin-2\.codex\artifacts\reg_engine\2026-07-10-phase8l\`:
  `phase8l-public-edit-desktop.png`,
  `phase8l-public-edit-mobile-420.png`, and
  `phase8l-approved-closed-receipt.png`.

Known limitations and remaining release gates:

- Review is intentionally not a staged-copy workflow. A recipient's confirmed
  saves are already present on the real card before administrator approval;
  requesting changes does not roll them back.
- Existing legacy links have no historical baseline until the administrator
  explicitly starts a review cycle. No historical diff is inferred.
- Public `file_ref` editing, public generated documents, and built-in email or
  messenger delivery remain outside the approved scope. Existing bounded
  public attachment list/upload/download behavior remains available only while
  the link is editable.
- A status-network failure deliberately leaves the public page closed with a
  Russian-safe error until a fresh authoritative status can be loaded.
- The deployment restart invalidated the previous interactive administrator
  browser session. Therefore the public recipient journey and closed-token
  privacy were proven in the Browser, while administrator review transitions
  and typed diff were proven live through the deployed backend service and
  PostgreSQL evidence. The administrator panel itself remains covered by its
  focused component suite (7/7) and the full frontend regression suite.

## Phase 8M: Automatic Card Lifecycle and Layout UX Polish

Status: implementation complete locally; full gate, deployment, and live
Browser proof are in progress.

Goal:

Remove manual activation and reduce card-layout editor chrome without changing
the schema-driven data model, saved geometry, revision-safe persistence, or A4
print output.

Design and implementation plan:

- `docs/superpowers/specs/2026-07-10-card-layout-status-ux-polish-design.md`
- `docs/superpowers/plans/2026-07-10-card-layout-status-ux-polish.md`

Implementation checkpoint:

- `draft` and `active` are now derived by one backend completeness rule for
  every non-terminal card. Empty `required` or `required_on_publish` fields
  produce `draft`; complete cards and templates without mandatory fields
  produce `active`. Archived and superseded cards remain terminal.
- Lifecycle synchronization runs after card creation/defaults, authenticated
  and public field writes, bulk writes, repeatable block-instance changes, and
  schema requiredness/membership changes. Real transitions are audited. A
  caller cannot force `draft` or `active` against current completeness.
- `Отправить на заполнение` remains available for both draft and active cards.
  Link creation/sending does not change lifecycle status. The manual
  `Активировать карточку` action and its frontend mutation were removed.
- Web blocks render only the internal rows occupied by fields and align to
  content, while saved 12 x 4 rectangles remain unchanged. Outer web rows grow
  independently with the actual block content, so field-height changes expand
  their block and move later logical rows instead of overlapping them. Linked
  A4 rendering explicitly retains four internal rows. `Создать поле` now
  follows the field grid in a block footer.
- A design-mode field opens on click or Enter/Space, starts moving only after a
  six-pixel hold-and-drag threshold, and exposes eight edge/corner resize zones
  on hover or focus. The visible `Изменить` and field `⠿` buttons were removed;
  no-move pointer sessions clear without an undo command.
- The A4 `Редактировать внутренний макет` overlay and callback chain were
  removed. Print-only actions now live in one compact vertical disclosure list
  that closes after selection and preserves busy-state disabling.
- No database migration is required; lifecycle behavior uses existing card
  status and field-value data, and layout changes are a render/interaction
  projection over existing JSON geometry.

Verification and release evidence will be recorded here after the full local,
disposable PostgreSQL, server, and Browser gates pass.

Local verification checkpoint:

- `powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote`
  passed: backend `228 passed / 195 skipped`, frontend
  `233 passed / 25 skipped`, Ruff, Ruff format, mypy, ESLint, TypeScript,
  production build, and project-map checks are green.
- The existing Starlette/httpx deprecation warning and Vite main-chunk advisory
  remain. The current production bundle is `index-B7ukh_7h.js` (`559.59 kB`,
  `159.47 kB` gzip) and `index-Cl9DldkN.css` (`63.71 kB`, `11.40 kB` gzip).
- PostgreSQL-backed lifecycle/schema tests, remote synchronization, deployment,
  and live Browser proof remain pending at this checkpoint.
