# Organization Unit Hierarchy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a two-level, organization-local hierarchy of managements and departments, and expose it as a safe card-field choice scoped to the card's organization.

**Architecture:** Reuse `org_units` as the only internal-unit store. A migration and `OrganizationService` make the two allowed types and parent rules durable; a dedicated card-field options endpoint supplies active local choices plus any historical archived value. The Organizations workspace gains a separate unit manager, while card and public editors consume the new options without treating units as an RBAC boundary.

**Tech Stack:** FastAPI, SQLAlchemy, Alembic/PostgreSQL, React, TypeScript, TanStack Query, Vitest, pytest.

## Global Constraints

- Keep `organizations` and `org_units` as separate trees; units never become organization/RBAC hierarchy nodes.
- Allowed unit types are exactly `management` and `department`; management is root-only and departments are root-only or children of a management in the same organization.
- Archive, never physically delete. Archiving a management archives its active department children but preserves `cards.org_unit_id` and `field_values.value_org_unit_id`.
- New `org_unit_ref` choices are active units of `card.organization_id` only; historical archived values stay readable and disabled.
- Enforce all access and structural rules in the backend; browser text is Russian-first and audit every create/update/archive action.
- Do not add a parallel departments table or a new access-grant scope.
- Follow the project main-branch and migration gates in `AGENTS.md`; run production migration only after disposable PostgreSQL proof, backup, preflight, and server synchronization.

---

## File structure

- `backend/migrations/versions/0028_org_unit_hierarchy.py` — validates legacy records, makes the unit type required, and adds database checks for the two supported types and root-only managements.
- `backend/app/models/organization.py` — mirrors the new database constraints and non-null unit type.
- `backend/app/schemas/organizations.py` — typed create/read/update API contracts and Russian-compatible metadata for units.
- `backend/app/services/organizations.py` — parent/type invariants, hierarchy ordering, cascade archive, historical lookup, and audit events.
- `backend/app/api/v1/endpoints/organizations.py` — keeps existing unit routes but uses the tightened service contracts.
- `backend/app/services/cards.py`, `backend/app/schemas/cards.py`, `backend/app/api/v1/endpoints/cards.py` — validates a field value against the card organization and serves organization-local `org_unit_ref` options.
- `backend/app/services/public_links.py`, `backend/app/schemas/public_links.py` — supplies the same safe options to public-card editing.
- `frontend/src/api/client.ts`, `frontend/src/api/types.ts` — typed unit-manager and card-field option clients.
- `frontend/src/features/organizations/OrganizationUnitsPanel.tsx` — isolated management/department tree, forms, confirmation, and mutations.
- `frontend/src/features/organizations/OrganizationsTable.tsx` — opens the selected organization's unit panel without mixing it into the organization tree.
- `frontend/src/features/cards/CardsWorkspace.tsx`, `frontend/src/features/cards/FieldEditorControl.tsx` — requests and renders card-local unit choices, including disabled archived historical values.
- `frontend/src/pages/PublicLinkEditPage.tsx` — renders public `org_unit_ref` choices from the supplied safe preview options.
- `frontend/src/styles/globals.css` — scoped visual treatment for the internal unit panel and two-level unit tree.

## Task 1: Migrate and enforce the unit hierarchy

**Files:**
- Create: `backend/migrations/versions/0028_org_unit_hierarchy.py`
- Modify: `backend/app/models/organization.py`
- Modify: `backend/app/schemas/organizations.py`
- Modify: `backend/app/services/organizations.py`
- Modify: `backend/tests/test_organization_permission_services.py`
- Modify: `backend/tests/test_api_phase_2k.py`
- Modify: `backend/tests/test_core_service_hardening.py`
- Modify: `backend/tests/test_database_smoke.py`
- Modify: `backend/tests/test_schema_constraints.py`
- Modify: `backend/tests/test_migrations.py`

**Interfaces:**
- Consumes: `OrgUnit(organization_id, parent_id, code, name, type, is_active, archived_at)` and `PermissionService.has_permission(..., "organizations.manage", organization_id=...)`.
- Produces: `OrganizationService.create_org_unit_for_actor(..., unit_type: Literal["management", "department"])`, `update_org_unit_for_actor(..., name: str | None)`, and cascade-aware `archive_org_unit_for_actor(...)`.

- [ ] **Step 1: Write failing hierarchy and migration tests**

```python
def test_department_can_be_root_or_child_of_management_and_management_cannot_be_child(db_session):
    management = service.create_org_unit_for_actor(
        actor_user_id=admin.id, organization_id=organization.id,
        code="education", name="Управление образования", unit_type="management",
    )
    department = service.create_org_unit_for_actor(
        actor_user_id=admin.id, organization_id=organization.id,
        code="preschool", name="Отдел дошкольного образования",
        parent_id=management.id, unit_type="department",
    )
    assert department.parent_id == management.id
    with pytest.raises(OrganizationTopologyError):
        service.create_org_unit_for_actor(
            actor_user_id=admin.id, organization_id=organization.id,
            code="nested", name="Вложенное управление",
            parent_id=management.id, unit_type="management",
        )
```

Add cases for a department under a department, a parent from another organization, a root department, and archive cascade. Assert that both management and child have `is_active is False`, `archived_at is not None`, and individual `org_unit` archive audit events exist.

Add an offline-Alembic assertion that revision `0028_org_unit_hierarchy` renders the two `org_units` check constraints.
Update the existing Phase 2K route scenario so it creates a root management before
its child department and no longer submits `unit_type` in a PATCH. Update all
unit fixtures in `test_core_service_hardening.py` and
`test_database_smoke.py` to include a conforming `type`; add the two new
constraint names to `test_schema_constraints.py`.

- [ ] **Step 2: Run the focused tests and observe the missing rules**

Run: `backend\.venv\Scripts\python.exe -m pytest backend/tests/test_organization_permission_services.py backend/tests/test_migrations.py -q`

Expected: hierarchy tests fail because arbitrary `type`/parent combinations are accepted and only the selected unit is archived.

- [ ] **Step 3: Add the migration and model constraints**

```python
# backend/app/models/organization.py
class OrgUnit(...):
    __table_args__ = (
        UniqueConstraint("organization_id", "code", name="uq_org_units_organization_id_code"),
        CheckConstraint("type in ('management', 'department')", name="ck_org_units_type"),
        CheckConstraint(
            "type <> 'management' or parent_id is null",
            name="ck_org_units_management_is_root",
        ),
        ...,
    )
    type: Mapped[str] = mapped_column(String, nullable=False)
```

In `0028_org_unit_hierarchy.py`, first execute a PostgreSQL preflight that raises when an existing `org_units` row has null/unsupported `type`, a management has a parent, a child is not a department, or a child's parent is not a management from the same organization. Only then alter `type` to non-null and create the two checks. Downgrade drops the checks and restores nullable `type`; it never deletes unit rows.

- [ ] **Step 4: Enforce parent and archive rules in the service/API schemas**

```python
ORG_UNIT_TYPES = frozenset({"management", "department"})

def _validate_org_unit_parent(self, *, organization_id: UUID, parent_id: UUID | None, unit_type: str) -> None:
    if unit_type == "management" and parent_id is not None:
        raise OrganizationTopologyError("Management must be a root organization unit.")
    if parent_id is None:
        return
    parent = self._get_active_org_unit(parent_id)
    if parent.organization_id != organization_id or parent.type != "management" or unit_type != "department":
        raise OrganizationTopologyError("Department parent must be an active management in the same organization.")
```

Use this helper from both actor and non-actor creation paths. Make `OrgUnitCreate.unit_type` a required `Literal["management", "department"]`; remove `unit_type` from `OrgUnitUpdate` so unit type and parent are immutable after creation. Archive the selected active unit and its active direct children in one flush, recording an archive event for every changed unit; return the originally requested unit.

- [ ] **Step 5: Verify the backend checkpoint**

Run: `backend\.venv\Scripts\python.exe -m pytest backend/tests/test_organization_permission_services.py backend/tests/test_migrations.py -q`

Expected: PASS; PostgreSQL-backed cases skip only when `TEST_DATABASE_URL` is absent.

Run: `backend\.venv\Scripts\python.exe -m ruff check app/models/organization.py app/schemas/organizations.py app/services/organizations.py tests/test_organization_permission_services.py tests/test_migrations.py`

Expected: `All checks passed!`

- [ ] **Step 6: Commit the checkpoint**

```powershell
git add backend/migrations/versions/0028_org_unit_hierarchy.py backend/app/models/organization.py backend/app/schemas/organizations.py backend/app/services/organizations.py backend/tests/test_organization_permission_services.py backend/tests/test_api_phase_2k.py backend/tests/test_core_service_hardening.py backend/tests/test_database_smoke.py backend/tests/test_schema_constraints.py backend/tests/test_migrations.py
git commit -m "feat: enforce organization unit hierarchy"
```

## Task 2: Scope card and public field values to their card organization

**Files:**
- Modify: `backend/app/services/cards.py`
- Modify: `backend/app/schemas/cards.py`
- Modify: `backend/app/api/v1/endpoints/cards.py`
- Modify: `backend/app/services/public_links.py`
- Modify: `backend/app/schemas/public_links.py`
- Modify: `backend/tests/test_registry_card_services.py`
- Modify: `backend/tests/test_card_public_access.py`
- Modify: `backend/tests/test_api_phase_2k.py`
- Modify: `backend/tests/test_field_value_coercion.py`

**Interfaces:**
- Consumes: active/historical `OrgUnit` rows from Task 1 and a card's `organization_id`.
- Produces: `CardService.list_org_unit_options_for_actor(actor_user_id, card_id, field_id) -> list[CardFieldOptionRead]` and `GET /cards/{card_id}/fields/{field_id}/org-unit-options`.

- [ ] **Step 1: Write failing option and assignment tests**

```python
def test_org_unit_ref_accepts_only_active_units_of_the_card_organization(db_session):
    card = create_card_for(organization_a)
    local_unit = create_unit(organization_a, "management")
    foreign_unit = create_unit(organization_b, "management")
    service.set_field_value_for_actor(..., card_id=card.id, field_id=unit_field.id, value=local_unit.id)
    with pytest.raises(InvalidFieldValueError, match="card organization"):
        service.set_field_value_for_actor(..., card_id=card.id, field_id=unit_field.id, value=foreign_unit.id)
```

Add coverage that an archived saved unit remains in the options response with `archived=True`, while a new write of the same ID is rejected. Add a public-link preview/edit test that sees only the card organization units and cannot submit a foreign or archived ID.
Extend the no-database OpenAPI test with
`/api/v1/cards/{card_id}/fields/{field_id}/org-unit-options`; update direct
coercion tests for the organization-id argument introduced by strict unit
validation.

- [ ] **Step 2: Run the targeted failure set**

Run: `backend\.venv\Scripts\python.exe -m pytest backend/tests/test_registry_card_services.py backend/tests/test_card_public_access.py -q`

Expected: FAIL because `org_unit_ref` currently validates only active existence and does not return options.

- [ ] **Step 3: Implement typed card-field options and strict assignment validation**

```python
class CardFieldOptionRead(BaseModel):
    id: UUID
    label: str
    archived: bool = False

def _ensure_active_org_unit_reference(self, org_unit_id: UUID, *, organization_id: UUID) -> None:
    unit = self.session.get(OrgUnit, org_unit_id)
    if unit is None or unit.archived_at is not None or not unit.is_active or unit.organization_id != organization_id:
        raise InvalidFieldValueError("Organization unit was not found in card organization.")
```

Pass the card organization through every `org_unit_ref` coercion path. Add the authenticated options method/route only for `org_unit_ref`: authorize card view, return active units of `card.organization_id` in hierarchy display order, and append a current archived saved value as `{archived: true}`. Build labels as `Управление → Отдел` for child departments and include type in a non-primary label only where needed to disambiguate.

Extend public preview options for `org_unit_ref` using the same organization-local query. Public payload coercion must reuse the strict card-value validation rather than trust the client option list.

- [ ] **Step 4: Verify the backend checkpoint**

Run: `backend\.venv\Scripts\python.exe -m pytest backend/tests/test_registry_card_services.py backend/tests/test_card_public_access.py -q`

Expected: PASS; archive, same-organization, foreign-organization, authenticated, and public scenarios are covered.

Run: `backend\.venv\Scripts\python.exe -m mypy app/services/cards.py app/services/public_links.py app/schemas/cards.py app/schemas/public_links.py`

Expected: `Success: no issues found`.

- [ ] **Step 5: Commit the checkpoint**

```powershell
git add backend/app/services/cards.py backend/app/schemas/cards.py backend/app/api/v1/endpoints/cards.py backend/app/services/public_links.py backend/app/schemas/public_links.py backend/tests/test_registry_card_services.py backend/tests/test_card_public_access.py backend/tests/test_api_phase_2k.py backend/tests/test_field_value_coercion.py
git commit -m "feat: scope organization unit field choices"
```

## Task 3: Add the organization-local unit manager

**Files:**
- Create: `frontend/src/features/organizations/OrganizationUnitsPanel.tsx`
- Create: `frontend/src/features/organizations/OrganizationsTable.test.tsx`
- Modify: `frontend/src/features/organizations/OrganizationsTable.tsx`
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/api/adminMutations.test.ts`
- Modify: `frontend/src/app/uiText.ts`
- Modify: `frontend/src/styles/globals.css`

**Interfaces:**
- Consumes: `listOrgUnits`, `createOrgUnit`, `updateOrgUnit`, and `archiveOrgUnit` plus the strict `OrgUnitRead` type from Task 1.
- Produces: `OrganizationUnitsPanel({ organization, token, onClose })`, rendered by `OrganizationsTable` when an administrator chooses `Подразделения` for one organization.

- [ ] **Step 1: Write failing UI tests**

```tsx
test("manages a separate management and department tree for one organization", async () => {
  renderOrganizations();
  await user.click(screen.getByRole("button", { name: /подразделения.*администрация/i }));
  expect(await screen.findByRole("heading", { name: /подразделения.*администрация/i })).toBeVisible();
  expect(screen.getByText("Управление образования")).toBeVisible();
  expect(screen.getByText("Отдел дошкольного образования")).toBeVisible();
  expect(screen.queryByText("Школа 1")).not.toBeInTheDocument();
});
```

Add tests that `Добавить управление` sends `unit_type: "management", parent_id: null`; `Добавить отдел` offers only managements from the selected organization; and an archive confirmation names the child departments affected by archive.

- [ ] **Step 2: Run the focused frontend test and confirm it fails**

Run: `pnpm -C frontend test:run src/features/organizations/OrganizationsTable.test.tsx`

Expected: FAIL because no unit-manager action or panel exists.

- [ ] **Step 3: Build the isolated unit-manager component and connect it**

```tsx
export function OrganizationUnitsPanel({ organization, token, onClose }: Props) {
  const unitsQuery = useQuery({
    queryKey: ["organization-org-units", token, organization.id],
    queryFn: () => listOrgUnits(token, organization.id),
  });
  // Build roots from parent_id; render management children below it.
  // Root departments remain siblings of managements.
}
```

Keep `OrganizationsTable` responsible only for organization-tree selection and add a visible `Подразделения` action to each organization row. Render one selected `OrganizationUnitsPanel` outside the `organization-tree` list, titled with the selected organization, so the two trees cannot be confused. Generate technical codes from units of that organization. Use Russian labels, `Добавить управление`, `Добавить отдел`, `Управление`, `Отдел`, and an archive dialog that lists the management's active child departments before confirmation.

Invalidate `["organization-org-units", token, organization.id]` and `["audit-events", token]` after every unit mutation. Do not invalidate or rebuild the organization tree for an internal-unit-only change.
Update `adminMutations.test.ts` so create uses a valid `management` or
`department` type and update sends only the name.

- [ ] **Step 4: Add visual and keyboard-safe styling**

```css
.organization-units-panel { margin-top: 16px; }
.organization-unit-tree [role="treeitem"] { padding-inline-start: calc(var(--unit-level) * 20px); }
.organization-unit-kind { color: #667085; font-size: 0.82rem; }
```

Scope selectors to the unit panel. Preserve the existing organization-tree layout and stack actions/rows at the existing narrow-screen breakpoint.

- [ ] **Step 5: Verify the frontend checkpoint**

Run: `pnpm -C frontend test:run src/features/organizations/OrganizationsTable.test.tsx`

Expected: PASS.

Run: `pnpm -C frontend typecheck; pnpm -C frontend lint; pnpm -C frontend format:check -- src/features/organizations/OrganizationUnitsPanel.tsx src/features/organizations/OrganizationsTable.tsx src/features/organizations/OrganizationsTable.test.tsx src/api/client.ts src/api/types.ts src/app/uiText.ts src/styles/globals.css`

Expected: typecheck and lint pass; formatting reports no changed-file issue.

- [ ] **Step 6: Commit the checkpoint**

```powershell
git add frontend/src/features/organizations/OrganizationUnitsPanel.tsx frontend/src/features/organizations/OrganizationsTable.tsx frontend/src/features/organizations/OrganizationsTable.test.tsx frontend/src/api/client.ts frontend/src/api/types.ts frontend/src/api/adminMutations.test.ts frontend/src/app/uiText.ts frontend/src/styles/globals.css
git commit -m "feat: manage organization unit hierarchy"
```

## Task 4: Render organization-local unit fields in admin and public cards

**Files:**
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/features/cards/CardsWorkspace.tsx`
- Modify: `frontend/src/features/cards/FieldEditorControl.tsx`
- Modify: `frontend/src/features/cards/FilledCardLayout.tsx`
- Modify: `frontend/src/pages/PublicLinkEditPage.tsx`
- Modify: `frontend/src/features/cards/CardsWorkspace.test.tsx`
- Modify: `frontend/src/pages/PublicLinkEditPage.test.tsx`

**Interfaces:**
- Consumes: `listCardFieldOrgUnitOptions(token, cardId, fieldId): Promise<CardFieldOptionListRead>` from Task 2.
- Produces: a standard select control for `org_unit_ref`, scoped to the card organization and able to display a disabled archived current option.

- [ ] **Step 1: Write failing editor tests**

```tsx
test("shows only card-local organization units and retains an archived selected value", async () => {
  renderCardWorkspace({ cardOrganizationId: "org-a", unitOptions: [
    { id: "management-a", label: "Управление образования", archived: false },
    { id: "department-a", label: "Управление образования → Отдел дошкольного образования", archived: false },
    { id: "archived-a", label: "Отдел кадров", archived: true },
  ]});
  expect(await screen.findByRole("option", { name: /управление образования/i })).toBeEnabled();
  expect(screen.getByRole("option", { name: /отдел кадров.*архив/i })).toBeDisabled();
});
```

Add a public-page test that an `org_unit_ref` field receives only the supplied local options and a disabled archived option cannot be newly selected.

- [ ] **Step 2: Run focused UI tests and observe the absent option source**

Run: `pnpm -C frontend test:run src/features/cards/CardsWorkspace.test.tsx src/pages/PublicLinkEditPage.test.tsx`

Expected: FAIL because `CardsWorkspace` requests options only for reference-list select fields and `org_unit_ref` falls through to a raw input.

- [ ] **Step 3: Wire the typed option source into the field controls**

```tsx
const orgUnitFields = fieldRows.filter((row) => row.field.field_type === "org_unit_ref");
const orgUnitQueries = useQueries({
  queries: orgUnitFields.map((row) => ({
    queryKey: ["card-field-org-unit-options", token, card?.id, row.field.id],
    queryFn: () => listCardFieldOrgUnitOptions(token, card!.id, row.field.id),
    enabled: Boolean(token && card),
  })),
});
```

Merge those options with the existing reference-list option map by field id. In `FieldEditorControl`, render `org_unit_ref` with the same `<select>` behavior as `select`, but disable `option.archived` and append ` / Архивировано` to its label. `FilledCardLayout` continues to show the selected label in read mode. Do not let an empty card without organization issue an options request.

For public links, render `org_unit_ref` from server-provided preview options and disable the historic archived option; do not make a separate unauthenticated organization-unit endpoint.

- [ ] **Step 4: Verify the card UI checkpoint**

Run: `pnpm -C frontend test:run src/features/cards/CardsWorkspace.test.tsx src/pages/PublicLinkEditPage.test.tsx`

Expected: PASS.

Run: `pnpm -C frontend typecheck; pnpm -C frontend lint`

Expected: no new errors.

- [ ] **Step 5: Commit the checkpoint**

```powershell
git add frontend/src/api/client.ts frontend/src/api/types.ts frontend/src/features/cards/CardsWorkspace.tsx frontend/src/features/cards/FieldEditorControl.tsx frontend/src/features/cards/FilledCardLayout.tsx frontend/src/pages/PublicLinkEditPage.tsx frontend/src/features/cards/CardsWorkspace.test.tsx frontend/src/pages/PublicLinkEditPage.test.tsx
git commit -m "feat: select local organization units in cards"
```

## Task 5: Document, run release gates, migrate, and prove the workflow

**Files:**
- Modify: `PLANS.md`
- Modify: `docs/PROJECT_TREE.md` (generated by `scripts/project-map.ps1`)
- Modify: `docs/superpowers/specs/2026-07-13-organization-unit-hierarchy-design.md` only if implementation reveals a factual design correction.

**Interfaces:**
- Consumes: all completed tasks and project deployment scripts.
- Produces: a documented, migrated, deployed, browser-verified feature on `main`.

- [ ] **Step 1: Run consolidated local checks**

Run:

```powershell
backend\.venv\Scripts\python.exe -m pytest backend/tests/test_organization_permission_services.py backend/tests/test_registry_card_services.py backend/tests/test_card_public_access.py backend/tests/test_migrations.py -q
pnpm -C frontend test:run src/features/organizations/OrganizationsTable.test.tsx src/features/cards/CardsWorkspace.test.tsx src/pages/PublicLinkEditPage.test.tsx
powershell -ExecutionPolicy Bypass -File scripts/typecheck.ps1
powershell -ExecutionPolicy Bypass -File scripts/lint.ps1
powershell -ExecutionPolicy Bypass -File scripts/project-map.ps1
git diff --check
```

Expected: focused checks pass. Record any pre-existing broad-suite or global-format drift separately; do not alter unrelated files merely to make a global gate green.

- [ ] **Step 2: Prove the migration against a disposable PostgreSQL database**

Run:

```powershell
$env:TEST_DATABASE_URL = '<configured disposable database ending in _test>'
Push-Location backend
..\.venv\Scripts\python.exe -m alembic upgrade head
Pop-Location
backend\.venv\Scripts\python.exe -m pytest backend/tests/test_organization_permission_services.py backend/tests/test_registry_card_services.py backend/tests/test_card_public_access.py backend/tests/test_migrations.py -q
Remove-Item Env:TEST_DATABASE_URL
```

Expected: Alembic reports `0028_org_unit_hierarchy (head)` and the migration/service/API cases pass. Never point `TEST_DATABASE_URL` at production.

- [ ] **Step 3: Update the implementation record and commit it**

Add to `PLANS.md`: the supported two-level model, cascade archive behavior, card-organization scoping, migration test result, and known unrelated gates. Regenerate `docs/PROJECT_TREE.md` only through its script.

```powershell
git add PLANS.md docs/PROJECT_TREE.md docs/superpowers/specs/2026-07-13-organization-unit-hierarchy-design.md
git commit -m "docs: record organization unit hierarchy checks"
```

- [ ] **Step 4: Push and deploy through the project workflow**

Run:

```powershell
git push origin main
powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1
```

Before production migration, confirm the server checkout is at `origin/main`, create a fresh backup outside Git, and run a read-only preflight that finds no nonconforming `org_units` rows. Apply Alembic deliberately to production `reg_engine`, then verify revision `0028_org_unit_hierarchy`, service health, and the database constraints. Run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/deploy-frontend.ps1
powershell -ExecutionPolicy Bypass -File scripts/server-check.ps1
```

Expected: same-origin frontend/API smoke passes and no card or field-value records are removed.

- [ ] **Step 5: Browser acceptance proof**

In the authenticated administrator interface:

1. open one organization and verify its `Подразделения` panel is visually separate from child organizations;
2. create a management, a child department, and an independent department in a safe test organization;
3. verify a second management cannot be selected as a child and a department cannot parent another department;
4. use `Подразделение организации` in a card of that organization and confirm only its three active units are offered;
5. archive the management, accept the dialog naming its departments, and confirm new choices exclude both while an existing saved value remains visible as archived;
6. confirm no console errors and clean up only disposable test data through the approved archive paths.

Expected: all interactions show Russian text, respect existing permissions, and never expose units from another organization.

## Plan self-review

- Spec coverage: Task 1 covers durable types, hierarchy, RBAC, audit, and cascade archive; Task 2 covers card/public data integrity and history; Task 3 covers the separate administrator tree; Task 4 covers editable UI; Task 5 covers documentation, migration, deployment, and browser proof.
- No-placeholder scan: no deferred implementation markers or unspecified validation steps remain.
- Type consistency: `management`/`department`, `CardFieldOptionRead`, and `listCardFieldOrgUnitOptions` are used consistently from the service through UI tasks.
