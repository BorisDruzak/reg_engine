# PLANS.md

## Project

Registry Engine is a configurable web engine for schema-driven registries. It is
not a hardcoded employee registry.

## Current Stop Point

- Completed baseline: backend, frontend, attachments, generated documents,
  import/export, reports, MCP phases through Phase 5R, live verification, and
  production follow-up fixes are implemented on `main`.
- Current active checkpoint: **Phase 6: Organization-Centered Card Workflow
  Cleanup**.
- Phase 6B UI simplification/tree work is implemented locally and covered by
  targeted frontend tests.
- Phase 6C and Phase 6D code paths are implemented locally, including migration
  `0016_default_registry_tree`, organization-centered card creation, and
  organization-effective reference options.
- Phase 6E live/browser verification and disposable PostgreSQL migration/service
  verification are still pending before production rollout.
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

Status: implemented locally; pending Phase 6E live verification.

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

Status: implemented locally; pending disposable PostgreSQL verification, live
verification, and production migration flow if deployed.

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
- Production migration is not applied in this local implementation checkpoint.

## Phase 6D: Common Schema With Organization-Owned References

Status: implemented locally; pending disposable PostgreSQL verification and
Phase 6E live/browser verification.

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
- PostgreSQL-backed service tests are present but require `TEST_DATABASE_URL`
  pointing to a disposable `_test` database.

## Phase 6E: Browser And Live Verification

Status: planned next.

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
