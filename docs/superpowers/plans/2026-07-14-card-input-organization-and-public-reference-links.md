# Card Input, Organization Choice, and Public Reference Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve active card-field input during autosave, add securely scoped organization choices, and deliver public links that manage only reference lists created through that link.

**Architecture:** Keep card field drafts local and version-aware while saving through the existing REST API. Extend the existing typed `organization_ref` value with backend-issued option lists and explicit public allowlists. Add a new public-reference-link model, service, API namespace, and page rather than extending card public-link authority.

**Tech Stack:** FastAPI, SQLAlchemy, Alembic/PostgreSQL, React, TypeScript, TanStack Query, Vitest, pytest, Playwright Browser validation, PowerShell release scripts.

## Global Constraints

- Keep business fields schema-driven; use only `organization_ref` and typed `field_values.value_organization_id`.
- Backend authorization is authoritative. Frontend option filtering is UX only.
- Do not physically delete cards, organizations, reference lists, reference items, or public links.
- Use Russian-first visible text and hide technical codes from public editing flows.
- A parent organization grant includes descendants only when the existing permission rule permits it.
- Existing card public links remain unchanged; public reference links are separate opaque hashed tokens.
- Every create, update, archive, and close action must write an audit event.
- Work on `main` only, as required by this repository; do not revert unrelated changes.
- Test the new migration against a disposable PostgreSQL database ending in `_test` before production migration.

---

## File map

| Path | Responsibility |
| --- | --- |
| `frontend/src/features/cards/useBlockEditor.ts` | Version-aware authenticated field draft and autosave state. |
| `frontend/src/features/cards/FilledCardLayout.tsx` | Debounce policy by field type. |
| `frontend/src/features/cards/FieldEditorControl.tsx` | Common picker and blur integration for controlled editors. |
| `frontend/src/pages/PublicLinkEditPage.tsx` | Public field draft queue without response-driven input replacement. |
| `frontend/src/features/cardLayout/InlineFieldEditor.tsx` | `organization_ref` public allowlist configuration. |
| `frontend/src/features/cards/CardsWorkspace.tsx` | Authenticated organization option queries for a card field. |
| `backend/app/services/cards.py` | Authorized organization option and write validation. |
| `backend/app/api/v1/endpoints/cards.py`, `public_links.py` | Authenticated and public organization option endpoints. |
| `backend/app/models/reference_edit_link.py` | Public-reference-link persistence model. |
| `backend/app/models/reference.py`, `audit.py` | Link-created-list ownership and audit actor references. |
| `backend/app/services/reference_edit_links.py` | Token lifecycle and public reference-list/item mutations. |
| `backend/app/api/v1/endpoints/reference_edit_links.py` | Administrator and token-based API routes. |
| `backend/app/schemas/reference_edit_links.py` | Request and response contracts. |
| `frontend/src/features/registry/ReferenceEditLinksPanel.tsx` | Administrator issuance/list/close UI. |
| `frontend/src/pages/PublicReferenceEditPage.tsx` | Public Russian-first list/item workspace. |
| `backend/migrations/versions/0029_public_reference_edit_links.py` | PostgreSQL schema evolution from `0028_org_unit_hierarchy`. |

## Task 1: Preserve drafts during card autosave

**Files:**
- Modify: `frontend/src/features/cards/useBlockEditor.ts:43-195`
- Modify: `frontend/src/features/cards/FilledCardLayout.tsx:31,311-317`
- Modify: `frontend/src/features/cards/BlockFieldControl.tsx:54-67`
- Modify: `frontend/src/features/cards/FieldEditorControl.tsx:8-143`
- Modify: `frontend/src/pages/PublicLinkEditPage.tsx:815-911`
- Test: `frontend/src/features/cards/FilledCardLayout.test.tsx`
- Test: `frontend/src/pages/PublicLinkEditPage.test.tsx`

**Interfaces:**
- Consumes: `FieldEditorState`, `FieldValuesBulkUpdatePayload`, existing public `saveFieldValue` callback.
- Produces: `useBlockEditor` sessions that retain an active input after save; `FieldEditorControl` accepts optional `onBlur`; public drafts are never replaced while active.

- [ ] **Step 1: Write the failing authenticated regression tests.**

  Add a `date` fixture field and a deferred `saveValues` mock. Open the field, change its value, resolve the request, and assert that the input is still mounted and is `document.activeElement`.

  ```tsx
  expect(saveValues).toHaveBeenCalledWith({
    values: [{ field_id: "birth-date", value: "2026-03-30", block_instance_id: null }],
  });
  await waitFor(() => expect(dateInput).toHaveFocus());
  expect(dateInput).toHaveValue("2026-03-30");
  ```

- [ ] **Step 2: Run the authenticated regression test and confirm the current editor closes it.**

  Run: `npm --prefix frontend test -- --run src/features/cards/FilledCardLayout.test.tsx`

  Expected: the new focus assertion fails because successful `save()` sets the session to `null`.

- [ ] **Step 3: Make the authenticated session version-aware.**

  Add `version` to `BlockEditorSession`; increment it in `updateAndSave`, including while a request is pending. Capture the saved version in `save()`. On a successful request, retain the session when no newer value exists; set its saved baseline and clear `dirty`, `pending`, and `autoSaveDelayMs`. When a newer value exists, clear only `pending` and schedule its next save immediately. Do not disable the ordinary input while a save is in flight.

  ```ts
  if (current.version === savedVersion) {
    return {
      ...current,
      initialValues: { ...current.values },
      dirty: false,
      pending: false,
      autoSaveDelayMs: null,
      errors: {},
    };
  }
  return { ...current, pending: false, autoSaveDelayMs: 0 };
  ```

  Keep `pendingOpen` behaviour: if another field was clicked while the current draft was dirty, save first and then open the requested field.

- [ ] **Step 4: Use a text-like debounce and immediate only non-caret controls.**

  Change `immediateAutosaveFieldTypes` to contain only `bool`, `select`, and `multi_select`. Route `date` and `datetime` through the existing 600 ms delay. Pass `disabled={false}` for an active ordinary `BlockFieldControl`; its editor state, not a disabled input, serializes writes.

- [ ] **Step 5: Write the failing public regression tests.**

  Extend the deferred public save test to focus the input, resolve an intentionally different canonical response, and assert that the displayed local draft and focus are retained. Add a date-field variant and assert that only a completed date is sent after the debounce.

  ```tsx
  statusInput.focus();
  fireEvent.change(statusInput, { target: { value: "local draft" } });
  resolveNextEdit("server canonical");
  await waitFor(() => expect(statusInput).toHaveFocus());
  expect(statusInput).toHaveValue("local draft");
  ```

- [ ] **Step 6: Implement public draft scheduling and blur flush.**

  Keep `rawValue` as the rendered local source of truth. Replace direct `void drainSaveQueue()` in `updateRawValue` with a timer for text, number, date, datetime, and JSON; choices flush immediately. Add `onBlur` to `FieldEditorControl` and call a public `flushPendingSave` handler. On a successful request, remove `setRawValue(initialEditorValue(...))`; update only save state and `onSaveConfirmed`.

  ```ts
  onSaveConfirmed(fieldKey, savedFieldValue.value);
  setSaveState("saved");
  // rawValue deliberately remains the local focused draft.
  ```

- [ ] **Step 7: Run focused frontend regression tests.**

  Run: `npm --prefix frontend test -- --run src/features/cards/FilledCardLayout.test.tsx src/pages/PublicLinkEditPage.test.tsx`

  Expected: all existing tests and the new focus/draft tests pass.

- [ ] **Step 8: Commit the focused autosave slice.**

  ```powershell
  git add frontend/src/features/cards/useBlockEditor.ts frontend/src/features/cards/FilledCardLayout.tsx frontend/src/features/cards/BlockFieldControl.tsx frontend/src/features/cards/FieldEditorControl.tsx frontend/src/pages/PublicLinkEditPage.tsx frontend/src/features/cards/FilledCardLayout.test.tsx frontend/src/pages/PublicLinkEditPage.test.tsx
  git commit -m "fix: preserve card input during autosave"
  ```

## Task 2: Secure organization-reference options and schema configuration

**Files:**
- Modify: `backend/app/services/cards.py:921-973,1776-1785`
- Modify: `backend/app/api/v1/endpoints/cards.py`
- Modify: `backend/app/api/v1/endpoints/public_links.py`
- Modify: `backend/app/schemas/cards.py`
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/features/cards/CardsWorkspace.tsx`
- Modify: `frontend/src/features/cards/FieldEditorControl.tsx`
- Modify: `frontend/src/features/cardLayout/InlineFieldEditor.tsx`
- Test: `backend/tests/test_api_phase_2k.py`
- Test: `frontend/src/features/cards/FieldEditorControl.test.tsx`
- Test: `frontend/src/features/cardLayout/InlineFieldEditor.test.tsx`

**Interfaces:**
- Consumes: existing `organization_ref` typed storage, `OrganizationService.list_organizations_for_actor`, `SearchableChoicePicker`.
- Produces: `CardFieldOptionListRead` organization choices, `allowed_organization_ids` field configuration, and backend-enforced actor/public scopes.

- [ ] **Step 1: Write backend API tests for authenticated and public scopes.**

  Cover an organization administrator with a limited scope, a system administrator, a public token with two allowed organization ids, and archived/foreign targets. Assert `403` or `422` for every unauthorized write.

  ```python
  assert {item["id"] for item in option_response.json()["items"]} == {allowed_org_id}
  assert denied_write.status_code in {403, 422}
  ```

- [ ] **Step 2: Run the new backend tests and confirm current global-only validation is insufficient.**

  Run: `pytest backend/tests/test_api_phase_2k.py -k "organization_ref" -q`

  Expected: the scope assertions fail before the new option service and public allowlist validation exist.

- [ ] **Step 3: Add option and validation helpers to `CardService`.**

  Implement `list_organization_options_for_actor(actor_user_id, card_id, field_id)` and `list_organization_options_for_public_link(public_link_id, field_id)`. Validate `options_config_json["allowed_organization_ids"]` as a de-duplicated UUID list. Change `_ensure_active_organization_reference` callers to require either actor read permission in the card registry scope or a matching public allowlist entry.

- [ ] **Step 4: Expose typed authenticated and public endpoints.**

  Add `GET /cards/{card_id}/fields/{field_id}/organization-options` and a token-bearing `POST /public-links/organization-options`. Return only `id`, `label`, `archived`, and hierarchy metadata required by the picker; never return raw access grants.

- [ ] **Step 5: Add schema-editor configuration tests and implementation.**

  In `InlineFieldEditor`, render `Организации для публичного выбора` only for `organization_ref`. Reuse the organization tree as a multi-picker and persist exactly:

  ```ts
  options_config_json: { allowed_organization_ids: selectedIds }
  ```

  Remove this configuration in the field-type transition path for every non-organization type.

- [ ] **Step 6: Render organization choices in cards.**

  Extend `CardsWorkspace` reference option queries to include `organization_ref`. Make `FieldEditorControl` render `organization_ref` with `SearchableChoicePicker hierarchy`, not a free-text `<input>`. Public cards fetch only their public organization options through the new endpoint.

- [ ] **Step 7: Run focused backend and frontend tests.**

  Run: `pytest backend/tests/test_api_phase_2k.py -k "organization_ref" -q`

  Run: `npm --prefix frontend test -- --run src/features/cards/FieldEditorControl.test.tsx src/features/cardLayout/InlineFieldEditor.test.tsx src/pages/PublicLinkEditPage.test.tsx`

  Expected: all tests pass and no free text can be submitted as an organization value.

- [ ] **Step 8: Commit the organization-choice slice.**

  ```powershell
  git add backend/app/services/cards.py backend/app/api/v1/endpoints/cards.py backend/app/api/v1/endpoints/public_links.py backend/app/schemas/cards.py frontend/src/api/types.ts frontend/src/api/client.ts frontend/src/features/cards/CardsWorkspace.tsx frontend/src/features/cards/FieldEditorControl.tsx frontend/src/features/cardLayout/InlineFieldEditor.tsx backend/tests/test_api_phase_2k.py frontend/src/features/cards/FieldEditorControl.test.tsx frontend/src/features/cardLayout/InlineFieldEditor.test.tsx frontend/src/pages/PublicLinkEditPage.test.tsx
  git commit -m "feat: add scoped organization field choices"
  ```

## Task 3: Add public-reference-link persistence and audited service boundary

**Files:**
- Create: `backend/migrations/versions/0029_public_reference_edit_links.py`
- Create: `backend/app/models/reference_edit_link.py`
- Modify: `backend/app/models/__init__.py`
- Modify: `backend/app/models/reference.py`
- Modify: `backend/app/models/audit.py`
- Modify: `backend/app/domain/constants.py`
- Modify: `backend/app/services/audit.py`
- Create: `backend/app/services/reference_edit_links.py`
- Test: `backend/tests/test_public_reference_edit_links.py`
- Test: `backend/tests/test_audit_schema.py`

**Interfaces:**
- Consumes: `ReferenceList`, `ReferenceItem`, `AuditService`, token hashing conventions from `PublicLinkService`.
- Produces: `ReferenceEditLink`, public-link audit actor support, and `ReferenceEditLinkService` lifecycle/mutation methods.

- [ ] **Step 1: Write migration and model tests before implementation.**

  Test that a link owns a registry and optional organization, a list can be associated with exactly one creating link, and an audit event can store `actor_reference_edit_link_id`.

  ```python
  assert created_list.created_via_reference_edit_link_id == link.id
  assert event.actor_reference_edit_link_id == link.id
  ```

- [ ] **Step 2: Run the tests on the disposable PostgreSQL database and observe schema absence.**

  Run: `$env:TEST_DATABASE_URL='<disposable *_test URL>'; pytest backend/tests/test_public_reference_edit_links.py -q`

  Expected: failure before migration/model implementation because the link model and columns do not exist.

- [ ] **Step 3: Create migration `0029_public_reference_edit_links`.**

  Use `down_revision = "0028_org_unit_hierarchy"`. Create `reference_edit_links` with UUID id, required registry foreign key, nullable owner-organization foreign key, unique token hash, nullable expiry/closed timestamps, creator, and timestamps. Add nullable `created_via_reference_edit_link_id` to `reference_lists` and nullable `actor_reference_edit_link_id` plus an index to `audit_events`. Add foreign keys and indexes; downgrade removes them in reverse order.

- [ ] **Step 4: Implement models and audit support.**

  Add `ReferenceEditLink` and export it. Extend `ReferenceList` and `AuditEvent` mappings. Add `AuditService.record_reference_edit_link_event(...)` that writes a distinct `reference_edit_link` actor type and its link id.

- [ ] **Step 5: Implement the isolated service.**

  `ReferenceEditLinkService` hashes/verifies tokens, computes active/closed/expired status, requires the fixed registry and owner on created lists, and checks every list/item belongs to the acting link. It calls `AuditService` for all state changes and soft-archives through existing archive columns. It rejects system-managed settings, registry/owner mutation, foreign parent ids, cycles, inactive targets, and writes after close/expiry.

- [ ] **Step 6: Run migration and service tests.**

  Run: `$env:TEST_DATABASE_URL='<disposable *_test URL>'; alembic -c backend/alembic.ini upgrade head`

  Run: `$env:TEST_DATABASE_URL='<disposable *_test URL>'; pytest backend/tests/test_public_reference_edit_links.py backend/tests/test_audit_schema.py -q`

  Expected: migration reaches `0029_public_reference_edit_links` and tests pass.

- [ ] **Step 7: Commit the persistence and service slice.**

  ```powershell
  git add backend/migrations/versions/0029_public_reference_edit_links.py backend/app/models backend/app/domain/constants.py backend/app/services/audit.py backend/app/services/reference_edit_links.py backend/tests/test_public_reference_edit_links.py backend/tests/test_audit_schema.py
  git commit -m "feat: add public reference edit links"
  ```

## Task 4: Expose administrator and public reference-link APIs

**Files:**
- Create: `backend/app/schemas/reference_edit_links.py`
- Create: `backend/app/api/v1/endpoints/reference_edit_links.py`
- Modify: `backend/app/api/v1/router.py`
- Modify: `backend/app/schemas/__init__.py`
- Test: `backend/tests/test_api_phase_2l.py`

**Interfaces:**
- Consumes: `ReferenceEditLinkService` from Task 3.
- Produces: authenticated management routes and token-only public list/item routes.

- [ ] **Step 1: Write failing route contract tests.**

  Cover an administrator creating/listing/closing a link, an outsider denial, token preview, create/update/archive list, create/update/archive nested item, closed denial, expired denial, and cross-link isolation.

  ```python
  response = api_client.post("/api/v1/public/reference-edit-links/lists", json={"token": raw_token, "name": "Новый"})
  assert response.status_code == 201
  ```

- [ ] **Step 2: Implement Pydantic contracts.**

  Define `ReferenceEditLinkCreate`, `ReferenceEditLinkRead`, `ReferenceEditLinkListRead`, `ReferenceEditLinkStatusRead`, and narrow public list/item mutation payloads. Public create payloads omit registry, owner, inheritance, lock, system-management, and technical-code fields.

- [ ] **Step 3: Implement routes.**

  Add authenticated routes under `/registries/{registry_id}/reference-edit-links` for creation/listing and `/reference-edit-links/{link_id}/close` for closure. Add public token routes under `/public/reference-edit-links/*` for status, workspace, and list/item mutations. Route functions call only `ReferenceEditLinkService` and map backend errors to existing Russian API error handling.

- [ ] **Step 4: Run endpoint tests.**

  Run: `pytest backend/tests/test_api_phase_2l.py backend/tests/test_public_reference_edit_links.py -q`

  Expected: all authenticated, token isolation, lifecycle, and hierarchy cases pass.

- [ ] **Step 5: Commit the API slice.**

  ```powershell
  git add backend/app/schemas/reference_edit_links.py backend/app/api/v1/endpoints/reference_edit_links.py backend/app/api/v1/router.py backend/app/schemas/__init__.py backend/tests/test_api_phase_2l.py
  git commit -m "feat: expose public reference link api"
  ```

## Task 5: Build administrator controls and public reference workspace

**Files:**
- Create: `frontend/src/features/registry/ReferenceEditLinksPanel.tsx`
- Create: `frontend/src/features/registry/ReferenceEditLinksPanel.test.tsx`
- Modify: `frontend/src/features/registry/RegistriesAndSchema.tsx`
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/api/client.ts`
- Create: `frontend/src/pages/PublicReferenceEditPage.tsx`
- Create: `frontend/src/pages/PublicReferenceEditPage.test.tsx`
- Modify: `frontend/src/app/router.tsx`
- Modify: `frontend/src/app/uiText.ts`

**Interfaces:**
- Consumes: Task 4 API contracts and existing reference list/item display helpers.
- Produces: administrator link issuance controls and `/public/references/:rawToken` workspace.

- [ ] **Step 1: Write administrator UI tests.**

  Verify the selected registry is fixed, organization owner is optional, a created link URL is copied, existing links list their status, and close requires the existing archive-style confirmation.

- [ ] **Step 2: Implement `ReferenceEditLinksPanel`.**

  Render it in the expanded reference workspace. It uses Russian labels `Ссылка на заполнение справочников`, `Создать ссылку`, `Закрыть ссылку`, `Действует`, `Закрыта`, and `Истекла`. It never displays a token hash and it invalidates only its own query keys after mutation.

- [ ] **Step 3: Write public-page tests.**

  Cover active workspace list creation, inline list rename/archive, nested item create/edit/archive, zero foreign-list visibility, and closed/expired read-only display.

- [ ] **Step 4: Implement the public page and router.**

  Add `/public/references/:rawToken`. Read public status before workspace data. While active, show only forms the public API permits; while closed/expired, render created lists/items without action controls and show Russian lifecycle feedback. Reuse item-tree semantics but generate no free technical-code input.

- [ ] **Step 5: Run focused frontend tests.**

  Run: `npm --prefix frontend test -- --run src/features/registry/ReferenceEditLinksPanel.test.tsx src/pages/PublicReferenceEditPage.test.tsx src/App.test.tsx`

  Expected: administrator and public lifecycle flows pass, including read-only closure.

- [ ] **Step 6: Commit the frontend slice.**

  ```powershell
  git add frontend/src/features/registry/ReferenceEditLinksPanel.tsx frontend/src/features/registry/ReferenceEditLinksPanel.test.tsx frontend/src/features/registry/RegistriesAndSchema.tsx frontend/src/api/types.ts frontend/src/api/client.ts frontend/src/pages/PublicReferenceEditPage.tsx frontend/src/pages/PublicReferenceEditPage.test.tsx frontend/src/app/router.tsx frontend/src/app/uiText.ts
  git commit -m "feat: add public reference workspace"
  ```

## Task 6: Integrate, release, and prove the user-visible flows

**Files:**
- Modify: `PLANS.md`
- Modify: `docs/PROJECT_TREE.md` if `scripts/project-map.ps1` updates it

**Interfaces:**
- Consumes: Tasks 1-5 and the configured disposable/production PostgreSQL environments.
- Produces: documented release evidence and production-safe deployment.

- [ ] **Step 1: Run full local checks before committing release metadata.**

  Run: `powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote`

  Run: `powershell -ExecutionPolicy Bypass -File scripts/test.ps1`

  Expected: report any pre-existing unrelated failure separately; all tests covering this plan must pass.

- [ ] **Step 2: Validate migration safety on the disposable database.**

  Run the exact configured disposable `TEST_DATABASE_URL` through `alembic upgrade head`, targeted public-reference tests, then `alembic downgrade 0028_org_unit_hierarchy` and upgrade head again. Record the final revision and test output in `PLANS.md`.

- [ ] **Step 3: Build and verify the frontend.**

  Run: `powershell -ExecutionPolicy Bypass -File scripts/lint.ps1`

  Run: `powershell -ExecutionPolicy Bypass -File scripts/typecheck.ps1`

  Run: `powershell -ExecutionPolicy Bypass -File scripts/format.ps1 -Check`

  Run: `npm --prefix frontend run build`

  Expected: no new lint, type, formatting, or build failures.

- [ ] **Step 4: Prepare production migration evidence.**

  Confirm the server checkout tracks `origin/main`, production is on `0028_org_unit_hierarchy`, and preflight confirms no conflicting identifiers. Create a fresh production backup outside Git before applying `0029_public_reference_edit_links`; record only policy-safe evidence in `PLANS.md`.

- [ ] **Step 5: Push, deploy, migrate, and smoke check.**

  Run: `powershell -ExecutionPolicy Bypass -File scripts/push-git.ps1 -Message "feat: public reference editing links"`

  Run: `powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1`

  Apply the verified migration on the configured runtime server, then run `powershell -ExecutionPolicy Bypass -File scripts/deploy-frontend.ps1` and `powershell -ExecutionPolicy Bypass -File scripts/server-check.ps1`.

- [ ] **Step 6: Perform Browser proof without changing unrelated production data.**

  Verify: (a) an active public card field retains focus through autosave; (b) administrator organization choices respect scope; (c) public organization choices show only the configured allowlist; (d) a test reference link shows only its own lists, supports nested items while active, and becomes read-only after close. Capture console output and delete only the deliberately created disposable proof data through the normal archive/lifecycle path.

- [ ] **Step 7: Update `PLANS.md` and commit release evidence.**

  Record migrations, commands, pass/fail evidence, deploy revision, and known unrelated failures. Commit the documentation-only checkpoint.

  ```powershell
  git add PLANS.md docs/PROJECT_TREE.md
  git commit -m "docs: record public reference links release"
  ```

## Plan self-review

- Spec coverage: Task 1 implements stable autosave; Task 2 implements the organization field and public allowlist; Tasks 3-5 implement isolated reference-link persistence, audit, API, administrator controls, public UI, lifecycle, and nested items; Task 6 supplies migration and release proof.
- Scope: no task exposes existing reference lists to public tokens or changes card public-link permissions.
- Type consistency: every new public route depends on `ReferenceEditLinkService`; every UI route consumes the Task 4 contracts; migration `0029_public_reference_edit_links` depends on the current `0028_org_unit_hierarchy` head.
