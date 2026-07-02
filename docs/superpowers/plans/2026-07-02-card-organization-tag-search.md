# Card Organization Tag Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an organization tag filter to the card list with multi-select support, descendants enabled by default, and backend-enforced RBAC.

**Architecture:** Keep the ordinary card workflow organization-centered. Extend the existing card list API and service so the backend accepts multiple organization ids and an include-descendants mode, validates them against the actor's organization scope, and never relies on frontend filtering for access control. Replace the single organization select in the card list UI with a Russian-first tag popover backed by the already RBAC-filtered organization tree.

**Tech Stack:** FastAPI, SQLAlchemy, pytest, React, TypeScript, TanStack Query, Vitest, Testing Library, Vite.

---

### Task 1: Backend Card Filter Contract

**Files:**
- Modify: `backend/app/services/cards.py`
- Modify: `backend/app/api/v1/endpoints/cards.py`
- Test: `backend/tests/test_api_phase_1g.py`

- [ ] **Step 1: Write failing backend tests**

Add tests that create a root, two child organizations, cards in each child, and an actor that can read only one branch. Assert that:

```python
response = client.get(
    f"/api/v1/organizations/{root_id}/cards",
    params=[("organization_ids", str(allowed_child_id))],
    headers={"X-Actor-User-Id": str(actor_id)},
)
assert response.status_code == 200
assert [item["id"] for item in response.json()["items"]] == [str(allowed_card_id)]
```

Also assert that selecting an inaccessible organization id returns no leaked rows, and selecting a parent with `include_descendant_organizations=true` includes descendant cards already in the actor's scope.

- [ ] **Step 2: Run the focused backend tests and verify RED**

Run:

```powershell
cd backend
python -m pytest tests/test_api_phase_1g.py -q
```

Expected: the new tests fail because `organization_ids` and `include_descendant_organizations` are not implemented.

- [ ] **Step 3: Implement service filtering**

Update `CardService.list_visible_cards` and `CardService.list_visible_cards_for_organization_for_actor` to accept:

```python
organization_ids: Sequence[UUID] | None = None
include_descendant_organizations: bool = True
```

Build the requested organization set from selected ids. When descendants are enabled, expand each selected id through `OrganizationService.get_descendant_ids(include_self=True)`. Intersect the requested ids with `PermissionService.get_organization_scope_ids(...)`; return an empty list if the intersection is empty. Keep the existing single `organization_id` parameter as compatibility input by merging it into the selected ids.

- [ ] **Step 4: Implement endpoint parameters**

Update both card list endpoints to accept repeated query parameters:

```http
organization_ids=<uuid>&organization_ids=<uuid>&include_descendant_organizations=true
```

Keep the existing `organization_id` query parameter for compatibility and pass it through the same backend filter path.

- [ ] **Step 5: Run backend tests and verify GREEN**

Run:

```powershell
cd backend
python -m pytest tests/test_api_phase_1g.py -q
```

Expected: the new card-list filter tests pass.

### Task 2: Frontend Organization Tag Filter

**Files:**
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/pages/HomePage.tsx`
- Modify: `frontend/src/features/cards/CardsWorkspace.tsx`
- Modify or create: `frontend/src/features/cards/CardOrganizationFilter.tsx`
- Test: `frontend/src/App.test.tsx`

- [ ] **Step 1: Write failing frontend tests**

Add tests that render the authenticated card workspace and assert:

```typescript
expect(screen.getByRole("button", { name: /Организации: все доступные/i })).toBeInTheDocument();
```

Then open the filter, select two organizations, verify the visible tag changes to the selected count, and assert the card list client request includes repeated `organization_ids` parameters and `include_descendant_organizations=true`.

- [ ] **Step 2: Run frontend tests and verify RED**

Run:

```powershell
pnpm -C frontend test:run src/App.test.tsx
```

Expected: the new tests fail because the tag filter does not exist yet.

- [ ] **Step 3: Extend frontend API options**

Change `CardListOptions` from a single `organizationId` to:

```typescript
organizationId?: string;
organizationIds?: string[];
includeDescendantOrganizations?: boolean;
includeArchive?: boolean;
q?: string;
```

Serialize `organizationIds` as repeated query params and keep `organizationId` for existing callers.

- [ ] **Step 4: Build the organization tag component**

Create or update a focused component that:

- renders the default tag `Организации: все доступные`;
- opens a compact popover with the RBAC-filtered organization tree;
- lets users select one or many organizations with checkboxes;
- includes the switch `Включать подведомственные`, enabled by default;
- clears selection back to all accessible organizations;
- uses only organization data already returned by backend RBAC endpoints.

- [ ] **Step 5: Wire card list state**

Store selected organization ids and include-descendants state in `HomePage`. Pass them into the organization-centered card list query. Keep ordinary card creation behavior unchanged.

- [ ] **Step 6: Run frontend tests and verify GREEN**

Run:

```powershell
pnpm -C frontend test:run src/App.test.tsx
```

Expected: tag-filter tests pass.

### Task 3: Documentation And Verification

**Files:**
- Modify: `PLANS.md`
- Modify: `docs/PROJECT_TREE.md`

- [ ] **Step 1: Update PLANS.md**

Add Phase 7D with status, behavior, tests, non-goals, and known limitations. Record that selected parent organizations include descendants by default through a visible toggle.

- [ ] **Step 2: Update project map**

Run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/project-map.ps1
```

- [ ] **Step 3: Run full available checks**

Run:

```powershell
backend\.venv\Scripts\python.exe -m pytest
backend\.venv\Scripts\ruff.exe check .
backend\.venv\Scripts\ruff.exe format --check .
backend\.venv\Scripts\mypy.exe app
pnpm -C frontend test:run
pnpm -C frontend lint
pnpm -C frontend typecheck
pnpm -C frontend build
pnpm -C frontend e2e
powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote
```

- [ ] **Step 4: Browser smoke**

Open `http://192.168.100.12:8000/` or the local dev URL, confirm the card list shows the organization tag, the popover opens, multiple organization selection is visible, and the descendants toggle is enabled by default.
