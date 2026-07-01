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
- This file was cleaned on 2026-07-01 to replace the old live-verification plan
  with the current product/UI architecture plan.
- This update is documentation-only. Do not change backend code, frontend code,
  migrations, production data, or server runtime for this checkpoint.

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
9. Do not create a separate registry for every organization.
10. Ordinary card creation must not require the user to manually choose a
    registry.
11. A main/root organization should get one default card registry. Descendant
    organizations should use that same registry automatically.
12. Registry/schema administration may remain visible to system or registry
    admins, but the ordinary card workflow should be organization-centered.
13. A common registry schema should define blocks and fields for the whole
    organization tree.
14. Subordinate organizations must be able to use their own organization-owned
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

### Weak Option: Keep Registries Global And Let UI Pick The First One

This avoids a migration, but it is too implicit.

Problems:

- The system cannot prove which registry belongs to which organization tree.
- Multiple registries would make card creation ambiguous.
- It relies on frontend convention instead of a backend-enforced rule.

### Recommended Option: Default Registry For Root Organization Tree

Use one default card registry for a root organization tree.

Proposed behavior:

- When the first/main organization is created, the system creates or assigns
  one default registry named `Реестр карточек`.
- Child organizations do not get their own registries by default.
- When a user creates a card, the UI asks for the card organization.
- The backend resolves the default registry from that organization or its root
  ancestor.
- The card is saved with:
  - `cards.registry_id = resolved default registry`;
  - `cards.organization_id = selected organization`.
- The existing registry/schema admin screen becomes an advanced settings area
  for system/registry admins, not a required ordinary workflow.

Likely technical model for implementation:

- Add registry ownership/default metadata, for example:
  - `registries.owner_organization_id`;
  - `registries.is_default_for_owner_tree`;
  - optionally `registries.available_to_descendants`.
- Enforce at most one active default registry per owner organization.
- Add a backend resolver that finds the default registry for an organization by
  walking its ancestors through `organization_closure`.
- Keep existing `/registries/{registry_id}/cards` endpoints for compatibility.
- Add or expose a simplified organization-centered card-create path that does
  not require the frontend to pass a registry id manually.

Open decision before implementation:

- Whether the first root organization always gets the default registry
  automatically, or whether system admin explicitly marks one root organization
  as the registry owner during setup. The product preference is automatic
  creation for the first/main organization.

## Reference List And Card Schema Analysis

### Recommended Schema Rule

Keep one common card schema for the root organization tree:

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
- Do not change backend/frontend code.

Checks:

```powershell
git diff --check
powershell -ExecutionPolicy Bypass -File scripts/project-map.ps1
```

## Phase 6B: Organization UI Simplification And Tree

Status: planned next.

Purpose:

Make organization management match the real product model.

Required work:

1. Hide organization type selection in the create/edit organization UI.
2. Submit `organization_type="organization"` internally while the backend still
   requires the field.
3. Replace or supplement the flat organization table with a hierarchical tree.
4. Use `GET /api/v1/organizations/tree` for tree data.
5. Keep edit/archive/create-child actions available from tree rows.
6. Hide `Подразделение карточки` in the simple card create/edit flow unless an
   explicit org-unit workflow is enabled later.
7. Keep `org_units` API/model intact.

Required tests:

- Organization create form does not show type choices.
- Created organization is still sent with the safe internal default type.
- Organization tree renders parent/child nesting.
- Child organization creation preserves parent relationship.
- Card form can create/edit cards without selecting `org_unit_id`.
- Backend RBAC behavior is unchanged.

Acceptance criteria:

- Users no longer see organization type choices.
- Lower entities are represented as normal child organizations.
- Organization screen is visually hierarchical.
- No database column is physically removed.
- No hardcoded employee-specific fields are added.

## Phase 6C: Default Card Registry For Organization Tree

Status: planned after Phase 6B; final technical model pending approval.

Purpose:

Remove manual registry selection from ordinary card creation while keeping one
common schema-driven registry for the main organization tree.

Recommended work:

1. Add registry owner/default metadata with an Alembic migration if approved.
2. Create a resolver for the default registry of an organization.
3. Automatically create or assign `Реестр карточек` for the first/main root
   organization.
4. Make descendant organizations inherit the root default registry.
5. Add an organization-centered card create flow that resolves registry
   automatically.
6. Keep advanced registry/schema administration available only where useful.
7. Keep existing registry-based APIs for compatibility.

Required tests:

- First/main root organization gets one default registry.
- Descendant organization does not get a duplicate registry.
- Creating a card for a descendant uses the root default registry.
- Card still stores the selected descendant `organization_id`.
- Sibling/root visibility rules remain organization-scoped.
- No ordinary card workflow requires manual registry selection.

Acceptance criteria:

- One default card registry serves the root organization and descendants.
- UI remains organization-centered and clean.
- No separate registry is created for every organization.
- Existing schema-driven card architecture remains intact.

## Phase 6D: Common Schema With Organization-Owned References

Status: planned after Phase 6C.

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

## Phase 6E: Browser And Live Verification

Status: planned.

Scope:

- Verify organization tree UI.
- Verify clean card creation without manual registry selection.
- Verify default registry resolution for root and descendant organizations.
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
- Do not physically delete `organizations.type` or `org_units` in the UI
  cleanup slice.
- Do not bypass backend RBAC with frontend-only filtering.
- Do not remove existing REST/MCP compatibility endpoints without a separate
  deprecation plan.
- Do not change production schema unless the active implementation phase
  requires a migration and the project migration rules are satisfied.
