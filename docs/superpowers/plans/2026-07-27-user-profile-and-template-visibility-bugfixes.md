# User Profile and Template Visibility Bugfixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Allow user-profile edits with organization scopes to commit successfully and show available card templates before a scoped administrator has created their first card.

**Architecture:** Normalize every audit payload at the audit-service boundary, so UUID values from role-profile changes and future callers safely reach PostgreSQL JSON storage. In the card workspace, load the already-authorized registry schema when the Cards section has successfully established an empty card list and a default registry; do not probe schema access for a read-only user who already has a visible card.

**Tech Stack:** FastAPI, SQLAlchemy, PostgreSQL JSON audit storage, React, TypeScript, TanStack Query, Pytest, Vitest.

## Global Constraints

- Preserve schema-driven registry/card architecture; do not add business-specific fields.
- Enforce authorization in the backend; frontend conditions are workflow and UX only.
- Keep user-facing UI Russian-first and keep raw backend exceptions out of browser copy.
- Preserve soft-delete/audit behavior and write JSON-serializable audit payloads.
- Do not alter unrelated untracked .playwright-cli/ or output/ files.

---

### Task 1: Serialize user role-profile audit data safely

**Files:**
- Modify: backend/tests/test_access_management_phase_1j.py
- Modify: backend/tests/test_audit_schema.py
- Modify: backend/app/services/audit.py

**Interfaces:**
- Consumes: UserAccessService.update_user_for_actor(..., role_code, organization_ids) and AuditService.record_user_event(..., new_data_json=...).
- Produces: JSON-safe audit data for every audit event and a successful PATCH /api/v1/users/{user_id} response for a subordinate administrator profile.

- [ ] **Step 1: Write the failing test**

~~~python
def test_system_admin_updates_subordinate_user_profile_with_json_safe_audit(
    api_client: TestClient, db_session: Session
) -> None:
    response = api_client.patch(
        f"/api/v1/users/{subordinate.id}",
        json={
            "display_name": "Обновлённый администратор",
            "role_code": "subordinate_organization_administrator",
            "organization_ids": [str(root.id)],
        },
        headers=headers,
    )

    assert response.status_code == 200, response.text
    event = db_session.scalars(
        select(AuditEvent).where(AuditEvent.object_type == "user_role_profile")
    ).one()
    assert event.new_data_json == {
        "role_code": "subordinate_organization_administrator",
        "organization_ids": [str(root.id)],
    }
~~~

- [ ] **Step 2: Run test to verify it fails**

Run: python -m pytest tests/test_access_management_phase_1j.py -k json_safe_audit -v from backend/.

Expected: FAIL with the current 500 response caused by UUID values in the JSON audit payload.

- [ ] **Step 3: Write minimal implementation**

~~~python
safe_old_data = _json_safe_audit_value(old_data_json)
safe_new_data = _json_safe_audit_value(new_data_json)
assert safe_old_data is None or isinstance(safe_old_data, dict)
assert safe_new_data is None or isinstance(safe_new_data, dict)
~~~

Pass the normalized values into AuditEvent. This keeps _user_role_profile UUID values available to the role-update logic while protecting every audit caller at the persistence boundary.

- [ ] **Step 4: Run test to verify it passes**

Run: python -m pytest tests/test_access_management_phase_1j.py -k json_safe_audit -v from backend/.

Expected: PASS with a 200 response and an audit record containing string UUIDs.

### Task 2: Load templates for an empty scoped card workspace

**Files:**
- Modify: frontend/src/App.test.tsx
- Modify: frontend/src/pages/HomePage.tsx

**Interfaces:**
- Consumes: successful GET /api/v1/registries, successful empty organization-card list, and the existing GET /api/v1/registries/{registry_id}/schema response.
- Produces: the Карточки workspace receives its schema/template data before any card exists for an authorized scoped administrator.

- [ ] **Step 1: Write the failing test**

~~~tsx
test("loads the available template before a scoped administrator creates their first card", async () => {
  cardItems = [];
  const user = userEvent.setup();
  await signIn(user);
  await user.click(screen.getByRole("button", { name: "Карточки" }));

  expect(await screen.findByRole("option", { name: "Муниципальная карточка" })).toBeInTheDocument();
});
~~~

The test uses the application-level API fixture and asserts the rendered template choice, rather than only checking that a fetch mock was called.

- [ ] **Step 2: Run test to verify it fails**

Run: pnpm -C frontend test:run src/App.test.tsx -t "loads the available template before a scoped administrator creates their first card".

Expected: FAIL because HomePage currently leaves registrySchemaQuery disabled when activeCardId is empty.

- [ ] **Step 3: Write minimal implementation**

~~~tsx
const canLoadEmptyCardWorkflowSchema =
  activeSection === "cards" && cardsQuery.isSuccess && visibleCards.length === 0;

enabled: Boolean(
  token &&
    schemaRegistryId &&
    (needsRegistrySchema || cardReadQuery.data?.can_manage || canLoadEmptyCardWorkflowSchema),
),
~~~

Use the same condition when deciding whether a schema-query error belongs in the visible global alert. This retains the existing no-403-banner behavior for a read-only user who already has a visible card.

- [ ] **Step 4: Run test to verify it passes**

Run: pnpm -C frontend test:run src/App.test.tsx -t "loads the available template before a scoped administrator creates their first card".

Expected: PASS with the existing template rendered in the empty card-creation tab.

### Task 3: Verify focused regressions and record the checkpoint

**Files:**
- Modify: PLANS.md

- [ ] **Step 1: Run focused backend and frontend suites**

Run:

~~~powershell
Push-Location backend
python -m pytest tests/test_access_management_phase_1j.py -k "json_safe_audit or subordinate_admin_reads_schema" -v
Pop-Location
pnpm -C frontend test:run src/App.test.tsx -t "loads the available template before a scoped administrator creates their first card"
~~~

Expected: both regression scenarios pass.

- [ ] **Step 2: Run static checks for changed code**

Run:

~~~powershell
Push-Location backend
python -m ruff check app/services/audit.py tests/test_access_management_phase_1j.py tests/test_audit_schema.py
python -m ruff format --check app/services/audit.py tests/test_access_management_phase_1j.py tests/test_audit_schema.py
Pop-Location
pnpm -C frontend typecheck
pnpm -C frontend lint -- src/pages/HomePage.tsx src/App.test.tsx
pnpm -C frontend format:check -- src/pages/HomePage.tsx src/App.test.tsx
git diff --check
~~~

Expected: no new errors; document pre-existing warnings separately if encountered.

- [ ] **Step 3: Update the project plan**

Append a concise completed checkpoint to PLANS.md naming both root causes, the focused test commands/results, and release status.
