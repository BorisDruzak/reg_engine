# Three-Role User Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the technical access-grant UI with three business roles and
backend-enforced hierarchical organization scopes configured inline on users.

**Architecture:** Reuse `access_grants` as the source of selected organization
roots and descendant coverage. Add a single `users.can_manage_access` exception
for the separately grantable access-administration capability; canonical roles
continue to own all remaining technical permissions. The user API reads and
writes one derived role profile atomically, and the React user table is its only
access-management surface.

**Tech Stack:** FastAPI, SQLAlchemy, Alembic, PostgreSQL, React 19, TypeScript,
TanStack Query, Vitest, pytest, Playwright browser verification.

## Global Constraints

- Keep backend API authorization authoritative; frontend checks are UX only.
- Use exactly three active system roles: `administrator`,
  `organization_administrator`, and `subordinate_organization_administrator`.
- Keep user-facing labels Russian-first; never display permission codes,
  role codes, grant identifiers, or permission catalogs.
- Do not physically delete users, organizations, cards, templates, references,
  audit data, or legacy roles/grants; archive superseded roles and grants.
- A selected subordinate organization includes all active descendants.
- Subordinate administrators can read templates and reference options but must
  not mutate schema, layout, or reference data.
- Work on `main`; do not create a feature branch or worktree.
- Prove the Alembic migration on a disposable database ending in `_test` before
  the guarded production backup/preflight/migration deployment.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `backend/app/models/identity.py` | Stores the separate `can_manage_access` capability on `User`. |
| `backend/app/services/bootstrap.py` | Defines the exact three canonical roles and reconciles their permission links. |
| `backend/app/services/permissions.py` | Resolves global organization scope and the special access-management capability. |
| `backend/app/services/user_access.py` | Builds and validates atomic business-role profiles, organization roots, and delegation boundaries. |
| `backend/app/schemas/access_management.py` | Defines user-access profile request and response contracts. |
| `backend/app/api/v1/endpoints/access_management.py` | Uses the profile contract for user create/read/update routes. |
| `backend/app/services/registry_schema.py` and `backend/app/services/references.py` | Preserve read-only template/reference access for scoped card managers. |
| `backend/migrations/versions/0025_three_role_user_access.py` | Adds the flag and conservatively migrates legacy roles/grants. |
| `backend/tests/test_access_management_phase_1j.py` | Covers role migration semantics, profile authorization, scope boundaries, and audit output. |
| `frontend/src/api/types.ts` and `frontend/src/api/client.ts` | Transport the business-role profile; remove obsolete frontend grant APIs. |
| `frontend/src/features/users/UsersAndRoles.tsx` | Renders selectable user rows and one inline user-profile editor. |
| `frontend/src/features/users/UsersAndRoles.test.tsx` | Covers accessible row selection and role/scope UI behavior. |
| `frontend/src/pages/HomePage.tsx` and `frontend/src/app/uiText.ts` | Removes the standalone Access section and its requests/navigation. |
| `PLANS.md` | Records migration, verification, deployment, and known constraints. |

---

### Task 1: Canonical roles and migration foundation

**Files:**
- Create: `backend/migrations/versions/0025_three_role_user_access.py`
- Modify: `backend/app/models/identity.py:40-57`
- Modify: `backend/app/services/bootstrap.py:18-94`
- Modify: `backend/tests/test_access_management_phase_1j.py:200-450`

**Interfaces:**
- Consumes: `Role`, `Permission`, `AccessGrant`, `role_permissions`, and
  `BootstrapService.seed_defaults()`.
- Produces: `User.can_manage_access: bool`, canonical role codes, and migration
  revision `0025_three_role_user_access`.

- [ ] **Step 1: Write the failing backend tests for canonical role reconciliation and migration data.**

```python
def test_bootstrap_keeps_only_three_active_canonical_roles(db_session: Session) -> None:
    BootstrapService(db_session).seed_defaults()
    assert {
        role.code
        for role in db_session.scalars(
            select(Role).where(Role.archived_at.is_(None))
        )
    } == {
        "administrator",
        "organization_administrator",
        "subordinate_organization_administrator",
    }


def test_migrated_legacy_org_grant_becomes_subordinate_scope(
    migrated_0025_session: Session,
) -> None:
    migrated_grant = migrated_0025_session.scalar(
        select(AccessGrant)
        .join(Role, Role.id == AccessGrant.role_id)
        .where(
            AccessGrant.user_id == legacy_user_id,
            Role.code == "subordinate_organization_administrator",
            AccessGrant.archived_at.is_(None),
        )
    )
    assert migrated_grant.organization_id == legacy_organization_id
    assert migrated_grant.include_descendants is True
    assert migrated_0025_session.scalar(
        select(Role.archived_at).where(Role.code == "org_admin")
    ) is not None
```

- [ ] **Step 2: Run the targeted tests and confirm they fail for missing role codes/column/revision.**

Run:

```powershell
$env:TEST_DATABASE_URL = '<disposable database ending in _test>'
python -m pytest backend/tests/test_access_management_phase_1j.py -k "canonical or migrated_legacy" -q
```

Expected: failure because the canonical roles and `can_manage_access` column do
not exist yet.

- [ ] **Step 3: Add the model field, exact role seeds, and Alembic migration.**

```python
# identity.py
can_manage_access: Mapped[bool] = mapped_column(
    Boolean, nullable=False, server_default="false"
)

# bootstrap.py
CANONICAL_ROLE_CODES = frozenset({
    "administrator",
    "organization_administrator",
    "subordinate_organization_administrator",
})

def _replace_role_permissions(self, role: Role, permission_codes: Sequence[str]) -> None:
    self.session.execute(
        role_permissions.delete().where(role_permissions.c.role_id == role.id)
    )
    self.session.execute(role_permissions.insert(), [
        {"role_id": role.id, "permission_id": permission.id}
        for permission in self._permissions_for_codes(permission_codes)
    ])
```

The migration must add the boolean with a non-null false server default; create
or reactivate the three canonical roles; make their links exact; convert active
`org_admin` grants to the subordinate role without changing organization,
registry, validity, or descendant fields; archive every noncanonical role and
its remaining active grants. It must leave all `User.is_superuser` rows intact.

- [ ] **Step 4: Re-run the targeted tests and inspect the generated revision state.**

Run:

```powershell
$env:TEST_DATABASE_URL = '<disposable database ending in _test>'
python -m pytest backend/tests/test_access_management_phase_1j.py -k "canonical or migrated_legacy" -q
python -m alembic -c backend/alembic.ini current
```

Expected: tests pass and Alembic reports `0025_three_role_user_access`.

- [ ] **Step 5: Commit the migration foundation.**

```powershell
git add backend/app/models/identity.py backend/app/services/bootstrap.py backend/migrations/versions/0025_three_role_user_access.py backend/tests/test_access_management_phase_1j.py
git commit -m "Add canonical user access roles"
```

### Task 2: Permission and scope enforcement

**Files:**
- Modify: `backend/app/services/permissions.py:22-156`
- Modify: `backend/tests/test_organization_permission_services.py:199-296`
- Modify: `backend/tests/test_access_management_phase_1j.py:284-450`

**Interfaces:**
- Consumes: `User.can_manage_access`, canonical grants from Task 1, and
  `OrganizationClosure`.
- Produces: correct global scope resolution and access-management authorization
  for `PermissionService.has_permission()`.

- [ ] **Step 1: Write failing permission tests for global organization administrators, subordinate descendants, and siblings.**

```python
def test_subordinate_admin_scope_contains_selected_root_and_descendants_only(db_session: Session) -> None:
    permissions = PermissionService(db_session)
    assert permissions.can_see_organization(subordinate.id, selected_root.id)
    assert permissions.can_see_organization(subordinate.id, selected_child.id)
    assert not permissions.can_see_organization(subordinate.id, sibling.id)


def test_global_organization_admin_can_manage_every_active_organization(db_session: Session) -> None:
    assert PermissionService(db_session).get_organization_scope_ids(org_admin.id) == {
        root.id, child.id, sibling.id
    }


def test_separate_access_flag_only_grants_access_management(db_session: Session) -> None:
    assert PermissionService(db_session).has_permission(user.id, "access_grants.manage")
    assert not PermissionService(db_session).has_permission(user.id, "registry.schema.manage")
```

- [ ] **Step 2: Run the tests and confirm the legacy resolver fails the new cases.**

Run:

```powershell
$env:TEST_DATABASE_URL = '<disposable database ending in _test>'
python -m pytest backend/tests/test_organization_permission_services.py backend/tests/test_access_management_phase_1j.py -k "subordinate or global_organization or separate_access" -q
```

Expected: failure because a global grant currently produces no organization IDs
and the separate flag is not checked.

- [ ] **Step 3: Implement the narrow authorization changes.**

```python
def get_organization_scope_ids(self, user_id: UUID, *, registry_id: UUID | None = None) -> set[UUID]:
    grants = self._active_access_grants(user_id, registry_id=registry_id)
    if self.is_superuser(user_id) or any(grant.organization_id is None for grant in grants):
        return self._all_active_organization_ids()
    # Keep the current union of selected roots and include_descendants expansion.

def has_permission(self, user_id: UUID, permission_code: str, **scope: UUID | None) -> bool:
    if permission_code == "access_grants.manage" and self._active_user_has_access_flag(user_id):
        return scope.get("organization_id") is None or self.can_see_organization(
            user_id, scope["organization_id"], registry_id=scope.get("registry_id")
        )
    # Preserve current superuser and role-grant checks for every other permission.
```

Ensure inactive/archived users never receive the flag's benefit and do not
broaden a selected root into a sibling branch.

- [ ] **Step 4: Re-run the tests and complete the existing permission suite.**

Run:

```powershell
$env:TEST_DATABASE_URL = '<disposable database ending in _test>'
python -m pytest backend/tests/test_organization_permission_services.py backend/tests/test_access_management_phase_1j.py -q
```

Expected: all selected PostgreSQL authorization tests pass.

- [ ] **Step 5: Commit scope enforcement.**

```powershell
git add backend/app/services/permissions.py backend/tests/test_organization_permission_services.py backend/tests/test_access_management_phase_1j.py
git commit -m "Enforce canonical organization access scopes"
```

### Task 3: Atomic user access-profile API

**Files:**
- Modify: `backend/app/schemas/access_management.py:7-70`
- Modify: `backend/app/services/user_access.py:35-420`
- Modify: `backend/app/api/v1/endpoints/access_management.py:45-190`
- Modify: `backend/tests/test_access_management_phase_1j.py:200-450`

**Interfaces:**
- Consumes: canonical role codes and scope enforcement from Tasks 1-2.
- Produces: `UserAccessProfileRead`, `UserCreate.role_code`, and
  `UserUpdate.role_code/organization_ids/can_manage_access`.

- [ ] **Step 1: Write failing API tests for atomic profile writes and privilege boundaries.**

```python
def test_superuser_creates_subordinate_admin_with_two_scope_roots(api_client, db_session) -> None:
    response = api_client.post("/api/v1/users", json={
        "email": "branch@example.test",
        "display_name": "Администратор филиала",
        "password": "secret-pass",
        "role_code": "subordinate_organization_administrator",
        "organization_ids": [str(root_a.id), str(root_b.id)],
    }, headers=system_headers)
    assert response.status_code == 201
    assert response.json()["role_code"] == "subordinate_organization_administrator"
    assert set(response.json()["organization_ids"]) == {str(root_a.id), str(root_b.id)}


def test_non_superuser_cannot_enable_access_management_or_assign_global_role(api_client) -> None:
    access_flag_response = api_client.patch(
        f"/api/v1/users/{managed_user.id}",
        json={"can_manage_access": True},
        headers=scoped_headers,
    )
    global_role_response = api_client.patch(
        f"/api/v1/users/{managed_user.id}",
        json={"role_code": "organization_administrator"},
        headers=scoped_headers,
    )
    assert access_flag_response.status_code == 403
    assert global_role_response.status_code == 403
```

- [ ] **Step 2: Run the API tests and confirm they fail because the profile fields are absent.**

Run:

```powershell
$env:TEST_DATABASE_URL = '<disposable database ending in _test>'
python -m pytest backend/tests/test_access_management_phase_1j.py -k "profile or access_management or two_scope" -q
```

Expected: request validation or response assertions fail for the new profile
fields.

- [ ] **Step 3: Define schemas and implement profile replacement in one transaction.**

```python
class UserAccessProfileRead(BaseModel):
    id: UUID
    email: str
    display_name: str
    status: str
    role_code: Literal[
        "administrator",
        "organization_administrator",
        "subordinate_organization_administrator",
    ]
    organization_ids: list[UUID]
    can_manage_access: bool

def replace_user_role_profile_for_actor(
    self, *, actor_user_id: UUID, user: User, role_code: str, organization_ids: list[UUID]
) -> UserAccessProfileRead:
    self._assert_actor_can_assign_profile(actor_user_id, user, role_code, organization_ids)
    self._archive_active_canonical_grants(user.id, actor_user_id)
    self._create_canonical_grants(user.id, role_code, organization_ids, actor_user_id)
    return self._profile_read(user)
```

Validate exactly one role, forbid roots for global roles, require at least one
active root for the subordinate role, deduplicate IDs, force descendant
coverage to true, and reject a self-elevation, administrator assignment by a
non-superuser, global grant by a scoped actor, or separate-flag changes by a
non-superuser. Record a single role-profile audit event plus existing user
audit data with old/new role/scope values.

- [ ] **Step 4: Re-run the API tests and inspect direct forbidden requests.**

Run:

```powershell
$env:TEST_DATABASE_URL = '<disposable database ending in _test>'
python -m pytest backend/tests/test_access_management_phase_1j.py -q
```

Expected: profile creation/update is atomic, sibling/global escalation returns
`403`, and audit rows contain the changed role/scope summary.

- [ ] **Step 5: Commit the profile API.**

```powershell
git add backend/app/schemas/access_management.py backend/app/services/user_access.py backend/app/api/v1/endpoints/access_management.py backend/tests/test_access_management_phase_1j.py
git commit -m "Add inline user access profile API"
```

### Task 4: Read-only templates and references for subordinate administrators

**Files:**
- Modify: `backend/app/services/registry_schema.py:442-470,1239-1261`
- Modify: `backend/app/services/references.py:160-185,523-560`
- Modify: `backend/tests/test_access_management_phase_1j.py`

**Interfaces:**
- Consumes: scoped `cards.manage` access from Task 2.
- Produces: read-only schema/template/reference responses for subordinate
  administrators while all mutation routes retain `registry.schema.manage`.

- [ ] **Step 1: Write failing read-versus-mutation tests.**

```python
def test_subordinate_admin_reads_schema_and_reference_options_but_cannot_mutate(api_client) -> None:
    assert api_client.get(f"/api/v1/registries/{registry.id}/schema", headers=branch_headers).status_code == 200
    assert api_client.get(f"/api/v1/registries/{registry.id}/reference-lists", headers=branch_headers).status_code == 200
    assert api_client.post(
        f"/api/v1/registries/{registry.id}/blocks",
        json={"code": "forbidden_block", "title": "Недоступный блок", "position": 1},
        headers=branch_headers,
    ).status_code == 403
```

- [ ] **Step 2: Run the test and confirm that at least one read route is denied.**

Run:

```powershell
$env:TEST_DATABASE_URL = '<disposable database ending in _test>'
python -m pytest backend/tests/test_access_management_phase_1j.py -k "reads_schema_and_reference" -q
```

Expected: failure identifies the current read check that still requires schema
mutation permission.

- [ ] **Step 3: Route only reads through a shared `cards.manage` fallback.**

```python
def _require_registry_read_permission(self, actor_user_id: UUID, registry_id: UUID) -> None:
    permissions = PermissionService(self.session)
    if permissions.has_permission(actor_user_id, "registry.schema.manage", registry_id=registry_id):
        return
    if permissions.has_permission(actor_user_id, "cards.manage", registry_id=registry_id):
        return
    raise PermissionDeniedError("Actor cannot read registry.")
```

Use this helper only for GET/list/read paths. Do not change schema/layout or
reference create/update/archive permission checks.

- [ ] **Step 4: Re-run the focused test and the registry/reference permission suites.**

Run:

```powershell
$env:TEST_DATABASE_URL = '<disposable database ending in _test>'
python -m pytest backend/tests/test_access_management_phase_1j.py backend/tests/test_organization_permission_services.py -q
```

Expected: read routes return `200`; every attempted mutation still returns
`403` for the subordinate actor.

- [ ] **Step 5: Commit the read-only access adjustment.**

```powershell
git add backend/app/services/registry_schema.py backend/app/services/references.py backend/tests/test_access_management_phase_1j.py
git commit -m "Allow scoped template and reference reads"
```

### Task 5: Frontend profile contract and retired access navigation

**Files:**
- Modify: `frontend/src/api/types.ts:668-750`
- Modify: `frontend/src/api/client.ts:762-815`
- Modify: `frontend/src/pages/HomePage.tsx:1-190,380-590`
- Modify: `frontend/src/app/uiText.ts:128-305,453-465,605-661`
- Test: `frontend/src/App.test.tsx`

**Interfaces:**
- Consumes: `UserAccessProfileRead` from Task 3 and organization tree data.
- Produces: `UserRead.role_code`, `UserRead.organization_ids`, and
  `UserRead.can_manage_access` TypeScript types; no standalone Access section.

- [ ] **Step 1: Write failing frontend tests for retired navigation and nontechnical API display data.**

```tsx
test("does not render the retired access navigation item", async () => {
  render(<App />);
  expect(await screen.findByRole("button", { name: "Пользователи" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "Доступ" })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test and confirm that the Access navigation is still present.**

Run:

```powershell
npm run test:run -- --run src/App.test.tsx
```

Expected: the navigation assertion fails before the section/query removal.

- [ ] **Step 3: Replace grant transport with profile transport and remove the Access section.**

```ts
export type UserRead = {
  id: string;
  email: string;
  display_name: string;
  status: string;
  role_code: BusinessRoleCode;
  organization_ids: string[];
  can_manage_access: boolean;
  archived_at: string | null;
};
```

Remove `AccessGrantsTable`, access-grant/permission page queries, the `access`
workspace state value, navigation label/icon, and the standalone section.
Retain no frontend path that renders technical permissions or codes.

- [ ] **Step 4: Re-run the frontend test, TypeScript, and ESLint.**

Run:

```powershell
npm run test:run -- --run src/App.test.tsx
npm run typecheck
npm run lint -- --quiet
```

Expected: the Access item and obsolete technical lists are absent; type and lint
checks pass.

- [ ] **Step 5: Commit the frontend contract/navigation change.**

```powershell
git add frontend/src/api/types.ts frontend/src/api/client.ts frontend/src/pages/HomePage.tsx frontend/src/app/uiText.ts frontend/src/App.test.tsx
git commit -m "Retire standalone access workspace"
```

### Task 6: Inline user profile workspace

**Files:**
- Modify: `frontend/src/features/users/UsersAndRoles.tsx`
- Create: `frontend/src/features/users/UsersAndRoles.test.tsx`
- Modify: `frontend/src/styles.css` or the existing user-workspace style source that owns `.row-actions` and `.table-wrap`

**Interfaces:**
- Consumes: profile API client/types from Task 5, `OrganizationTreeNodeRead`,
  and the selected user's `role_code`/`organization_ids`.
- Produces: one keyboard-accessible selected row and a single inline profile
  editor with business-role selection and hierarchical organization roots.

- [ ] **Step 1: Write failing component tests for selection, role visibility, and subordinate organization roots.**

```tsx
test("opens an inline user profile when the user row is selected", async () => {
  const user = userEvent.setup();
  render(<UsersAndRoles users={[subordinateUser]} organizationTree={tree} token="token" />);
  await user.click(screen.getByRole("button", { name: /Администратор филиала/ }));
  expect(screen.getByRole("combobox", { name: "Роль пользователя" })).toHaveValue(
    "subordinate_organization_administrator",
  );
  expect(screen.getByLabelText("Администрация района")).toBeChecked();
  expect(screen.queryByText("Технический код")).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the component test and confirm the existing table has only action buttons.**

Run:

```powershell
npm run test:run -- --run src/features/users/UsersAndRoles.test.tsx
```

Expected: failure because a selectable row, role combobox, and hierarchical
scope controls do not exist.

- [ ] **Step 3: Implement a focused inline editor with no technical catalog.**

```tsx
<button
  type="button"
  className="user-row-select"
  aria-expanded={selectedUserId === user.id}
  onClick={() => setSelectedUserId(user.id)}
>
  <span>{userDisplayNameLabel(user.display_name)}</span>
  <span>{businessRoleLabel(user.role_code)}</span>
  <span>{organizationScopeSummary(user.organization_ids, organizationTree)}</span>
</button>
```

Render three fixed role choices. Render the tree multi-select only for the
subordinate role; clear its roots for either global role. Show the access
management switch only when the current actor is a system administrator.
Replace the profile atomically through `updateUser`; keep password reset and
archive within the expanded profile, with archive confirmation. Do not render
role/permission compact lists, edit buttons, reset buttons, or grant rows.

- [ ] **Step 4: Re-run component tests and production frontend checks.**

Run:

```powershell
npm run test:run -- --run src/features/users/UsersAndRoles.test.tsx src/App.test.tsx
npm run typecheck
npm run lint -- --quiet
npx prettier --check src/features/users/UsersAndRoles.tsx src/features/users/UsersAndRoles.test.tsx
npm run build
```

Expected: inline editing, scope selection, role-only UI, and accessible focus
behavior pass without displaying technical codes.

- [ ] **Step 5: Commit the inline user workspace.**

```powershell
git add frontend/src/features/users/UsersAndRoles.tsx frontend/src/features/users/UsersAndRoles.test.tsx frontend/src/styles.css
git commit -m "Manage user access inline"
```

### Task 7: Migration proof, release gates, and live verification

**Files:**
- Modify: `PLANS.md`
- Verify: `scripts/check.ps1`, `scripts/deploy.ps1`, `scripts/deploy-frontend.ps1`, and the in-app Browser

**Interfaces:**
- Consumes: Tasks 1-6 and the server's production database/checkout.
- Produces: a backed-up, migrated production release with browser evidence for
  user access and API evidence for the scope boundary.

- [ ] **Step 1: Run the full local quality and disposable migration gates.**

```powershell
$env:TEST_DATABASE_URL = '<disposable database ending in _test>'
powershell -ExecutionPolicy Bypass -File scripts/test.ps1
powershell -ExecutionPolicy Bypass -File scripts/lint.ps1
powershell -ExecutionPolicy Bypass -File scripts/format.ps1 -Check
powershell -ExecutionPolicy Bypass -File scripts/typecheck.ps1
powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote
```

Expected: all targeted backend PostgreSQL tests, frontend tests, lint, format,
typecheck, production build, and local check pass. Record unrelated pre-existing
failures separately if any occur.

- [ ] **Step 2: Perform production preflight and backup before migration.**

```powershell
powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1
ssh <server-root-target> "sudo -u postgres pg_dump -Fc -d reg_engine -f /var/backups/reg_engine-before-0025.dump"
ssh <server-root-target> "cd <server-checkout>/backend && .venv/bin/alembic current"
```

Expected: server checkout is at the committed `main`, backup exists outside Git,
and preflight records active users, roles, grants, and current Alembic revision.

- [ ] **Step 3: Apply the migration and verify database survivors.**

```powershell
ssh <server-root-target> "cd <server-checkout>/backend && .venv/bin/alembic upgrade head"
ssh <server-root-target> "sudo -u postgres psql -d reg_engine -c \"select code from roles where archived_at is null order by code;\""
```

Expected: Alembic reports `0025_three_role_user_access`; exactly the three
canonical role codes are active; no users, organizations, cards, templates,
references, or audit rows were deleted.

- [ ] **Step 4: Deploy frontend and run server checks.**

```powershell
powershell -ExecutionPolicy Bypass -File scripts/deploy-frontend.ps1
powershell -ExecutionPolicy Bypass -File scripts/server-check.ps1
```

Expected: same-origin frontend/API smoke check, PostgreSQL, storage, service,
and health checks pass.

- [ ] **Step 5: Perform live browser and direct API proof.**

Check these flows without changing unrelated production records:

1. User navigation has no `Доступ` item and no technical role/permission list.
2. Selecting a user opens only its inline profile editor.
3. A system administrator can assign each business role, select multiple
   subordinate roots, and see scope summaries.
4. A subordinate test actor can list/read/manage only cards inside selected
   roots and descendants; sibling card API calls return `403`.
5. The same actor can view a template/reference list but mutation calls return
   `403`.
6. Browser console has no error/warning introduced by this release.

- [ ] **Step 6: Update the plan record and commit release evidence.**

```powershell
git add PLANS.md
git commit -m "Record three-role user access release"
```

Document the migration revision, backup/preflight outcome, server/frontend
artifact checks, scope-boundary evidence, and any retained known limitations.

## Plan Self-Review

- Spec coverage: Tasks 1-4 implement the three roles, individual access flag,
  hierarchy, read-only template/reference rule, migration, and audit behavior.
  Tasks 5-6 implement the single nontechnical users surface and retired Access
  workspace. Task 7 covers required safe migration/deployment proof.
- Deliberate scope boundary: public-form layout and card-search tag UX are
  documented as a separate follow-up slice in the approved design and are not
  mixed with this authorization migration.
- Placeholder scan: every task names files, interfaces, failing-test behavior,
  implementation direction, commands, and expected outcomes.
- Type consistency: role codes and `can_manage_access` use the same names in
  migration, backend services/schemas, API, frontend types, component, and
  tests.
