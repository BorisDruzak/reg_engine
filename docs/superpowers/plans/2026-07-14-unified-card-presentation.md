# Unified Card Presentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Use one block-oriented presentation for creation, administrative editing, and public filling, and create a real draft when an administrator sends a public link.

**Architecture:** Preserve the existing schema-driven models and `CardPresentationShell`. Add a single authenticated atomic command that creates a draft card, applies public-field settings, and creates a card-specific public link. Reuse the existing searchable choice picker for the two public-field sets, and reuse the presentation shell for public rendering without administrative controls.

**Tech Stack:** FastAPI, SQLAlchemy, Pydantic, React, TypeScript, TanStack Query, Vitest, pytest, Vite.

## Global Constraints

- Backend enforces every permission; frontend controls are UX only.
- Card and public-link actions write audit events.
- UI remains Russian-first and schema-driven.
- No ordinary card exists until a first non-empty field is saved.
- An explicit public-link action creates a draft card even when every field is empty.
- Saved template layout defines field order; schema position is the fallback for legacy layouts.
- Public pages contain only public fields and no administrative, archive, or attachment actions.

---

## File Structure

- `backend/app/schemas/cards.py` — request and response types for draft-plus-link creation.
- `backend/app/services/cards.py` — layout order and atomic card/link orchestration.
- `backend/app/api/v1/endpoints/cards.py` — authenticated organization-scoped endpoint.
- `backend/tests/test_registry_card_services.py`, `backend/tests/test_api_phase_1g.py` — service and HTTP contract tests.
- `frontend/src/api/client.ts`, `frontend/src/api/types.ts` — browser API client and types.
- `frontend/src/features/cards/PublicAccessFieldPicker.tsx` — reusable public-field picker.
- `frontend/src/features/cards/SingleStageCardCreation.tsx`, `CardsWorkspace.tsx` — common base block and controls.
- `frontend/src/pages/PublicLinkEditPage.tsx` — public rendering with the shared presentation shell.
- Related frontend tests, `frontend/src/styles/globals.css`, and `PLANS.md` — regression, visual and release evidence.

### Task 1: Return creation preview blocks and fields in template-layout order

**Files:**
- Modify: `backend/app/services/cards.py:251-303,2564-2582`
- Test: `backend/tests/test_registry_card_services.py:483-566`

**Interfaces:**
- Consumes: `CardTemplate.field_schema_json["form_layout"]` and active schema rows.
- Produces: `CardCreationPreviewRead.blocks` ordered by section and item layout coordinates.

- [ ] **Step 1: Write the failing test**

Create two fields with conflicting `FormField.position` and saved layout row order, then assert:

```python
assert [item.field_id for item in preview.blocks[0].fields] == [first_layout_field.id, second_layout_field.id]
```

- [ ] **Step 2: Verify RED**

Run: `pytest backend/tests/test_registry_card_services.py -k creation_preview -v`

Expected: FAIL because the preview currently uses `FormField.position`.

- [ ] **Step 3: Implement the minimal layout rank helper**

Build a rank map only from valid `kind == "field"` items. Sort selected schema rows by:

```python
(layout_rank.get(field_model.id, legacy_rank), block.position, field_model.position, field_model.code)
```

Use the current schema sequence for `legacy_rank`, so fields absent from an old or partial layout remain compatible.

- [ ] **Step 4: Verify GREEN and commit**

Run: `pytest backend/tests/test_registry_card_services.py -k creation_preview -v`

Expected: PASS.

```bash
git add backend/app/services/cards.py backend/tests/test_registry_card_services.py
git commit -m "fix: preserve template order in card creation"
```

### Task 2: Add an atomic administrative draft-card-plus-link operation

**Files:**
- Modify: `backend/app/schemas/cards.py:55-70`
- Modify: `backend/app/services/cards.py:185-378`
- Modify: `backend/app/api/v1/endpoints/cards.py:109-144`
- Test: `backend/tests/test_registry_card_services.py`
- Test: `backend/tests/test_api_phase_1g.py`

**Interfaces:**
- Consumes: organization id, template id, optional name, `CardPublicAccessUpdate`, and public-link defaults.
- Produces: `CardDraftPublicLinkRead { card: CardSummaryRead, raw_token: str, public_link_id: UUID }`.

- [ ] **Step 1: Write failing service tests**

Add a permitted and a denied scenario. The permitted case proves one draft, one card-specific link, saved public settings, and audits:

```python
created = CardService(db_session).create_card_draft_with_public_link_for_actor(...)
assert created.card.lifecycle_status == "draft"
assert created.public_link.public_link.card_id == created.card.id
assert {"card", "card_public_link"}.issubset(audit_object_types)
```

- [ ] **Step 2: Verify RED**

Run: `pytest backend/tests/test_registry_card_services.py -k "draft and public_link" -v`

Expected: FAIL because the command does not exist.

- [ ] **Step 3: Add contracts and service orchestration**

Define the request with an existing public-access payload and response:

```python
class CardDraftPublicLinkRequest(BaseModel):
    display_name: str | None = None
    card_template_id: UUID
    public_access: CardPublicAccessUpdate = Field(default_factory=CardPublicAccessUpdate)
```

Create the card through the existing organization-centered service, leave its lifecycle as `draft`, apply access through `CardPublicAccessService`, then call `PublicLinkService.create_public_link_for_actor` with `expires_in_days=7` and `review_enabled=True`. Let an exception roll back the request transaction; do not create a compensating partial record.

- [ ] **Step 4: Expose and test the endpoint**

Add:

```text
POST /api/v1/organizations/{organization_id}/cards/draft-public-link
```

Map failures through `raise_service_http_error`. Assert `201`, returned raw token, `draft` status and `403` without card-management permission.

- [ ] **Step 5: Verify GREEN and commit**

Run: `pytest backend/tests/test_registry_card_services.py backend/tests/test_api_phase_1g.py -q`

Expected: PASS or only documented disposable-database skips.

```bash
git add backend/app/schemas/cards.py backend/app/services/cards.py backend/app/api/v1/endpoints/cards.py backend/tests/test_registry_card_services.py backend/tests/test_api_phase_1g.py
git commit -m "feat: create draft card with public link"
```

### Task 3: Build a shared searchable public-field picker

**Files:**
- Create: `frontend/src/features/cards/PublicAccessFieldPicker.tsx`
- Create: `frontend/src/features/cards/PublicAccessFieldPicker.test.tsx`
- Modify: `frontend/src/features/cards/SingleStageCardCreation.tsx`
- Modify: `frontend/src/features/cards/CardsWorkspace.tsx:788-903`
- Modify: `frontend/src/api/types.ts:450-458`
- Modify: `frontend/src/api/client.ts:467-476`
- Modify: `frontend/src/styles/globals.css`

**Interfaces:**
- Consumes: active `FormFieldRead[]`, `CardPublicAccessRead | null`, and `onChange(CardPublicAccessPayload)`.
- Produces: `PublicAccessFieldPicker` with `Показывать поля` and `Разрешить изменение` searchable multiple-choice controls.

- [ ] **Step 1: Write failing picker tests**

Use `text`, `file_ref`, and `static_text` fields. Assert active fields are visible by default, ordinary text is editable by default, restricted field types do not appear in editable choices, and hiding a field removes it from edit permissions:

```tsx
expect(screen.getByRole("group", { name: "Показывать поля" })).toBeInTheDocument();
expect(onChange).toHaveBeenLastCalledWith({
  fields: expect.arrayContaining([
    { field_id: "text", public_visible: false, public_editable: false },
  ]),
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- PublicAccessFieldPicker.test.tsx --run`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement with `SearchableChoicePicker`**

Render two existing `SearchableChoicePicker` controls in `multiple` mode. Generate full field updates from selected id sets, enforce `editableIds ⊆ visibleIds`, and exclude `file_ref` and `static_text` from editable options. Use `resolveCardPublicFieldAccess` for stored defaults.

- [ ] **Step 4: Wire both creation paths and existing cards**

Extend first-save data with optional public settings, add `createOrganizationCardDraftPublicLink` to the API client, and render the picker in the creation base block. Replace only the existing per-row checkbox list in `CardBaseBlock`; retain global switches and link lifecycle controls.

- [ ] **Step 5: Verify GREEN and commit**

Run:

```bash
npm test -- PublicAccessFieldPicker.test.tsx CardsWorkspace.test.tsx --run
npm run typecheck
npm run build
```

Expected: PASS.

```bash
git add frontend/src/api frontend/src/features/cards frontend/src/styles/globals.css
git commit -m "feat: unify public access field selection"
```

### Task 4: Converge creation and existing-card presentation

**Files:**
- Modify: `frontend/src/features/cards/SingleStageCardCreation.tsx`
- Modify: `frontend/src/features/cards/CardsWorkspace.tsx`
- Modify: `frontend/src/features/cards/FilledCardLayout.tsx`
- Modify: `frontend/src/features/cards/CardPresentationShell.tsx`
- Modify: `frontend/src/features/cards/CardsWorkspace.test.tsx`
- Modify: `frontend/src/features/cards/FilledCardLayout.test.tsx`
- Modify: `frontend/src/styles/globals.css`

**Interfaces:**
- Consumes: dynamic creation preview and card presentation layout.
- Produces: matching base-block spacing, navigation placement, block-state styling, and responsive behavior.

- [ ] **Step 1: Write failing visual-structure tests**

Assert both modes contain a labelled base block and the same navigator contract:

```tsx
expect(screen.getByLabelText("Базовый блок")).toBeInTheDocument();
expect(screen.getByRole("navigation", { name: "Содержание карточки" })).toBeInTheDocument();
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- CardsWorkspace.test.tsx FilledCardLayout.test.tsx --run`

Expected: at least one shared-structure assertion fails before convergence.

- [ ] **Step 3: Implement only shared composition primitives**

Keep `CardPresentationShell` and the renderer. Use shared base-block classes so existing-card `beforeContent` sits above template blocks in the same content column, creation shows the same public-access section, and only the creation mode exposes `Создать публичную ссылку` before any field is entered.

- [ ] **Step 4: Verify GREEN and commit**

Run:

```bash
npm test -- CardsWorkspace.test.tsx FilledCardLayout.test.tsx --run
npm run lint
npm run typecheck
```

Expected: focused tests and TypeScript pass; record unrelated existing lint warnings without changing them.

```bash
git add frontend/src/features/cards frontend/src/styles/globals.css
git commit -m "feat: align card creation and editing presentation"
```

### Task 5: Use the same safe presentation shell on public links

**Files:**
- Modify: `frontend/src/pages/PublicLinkEditPage.tsx`
- Modify: `frontend/src/pages/PublicLinkEditPage.test.tsx`
- Modify: `frontend/src/styles/globals.css`

**Interfaces:**
- Consumes: server-filtered `PublicLinkPreviewRead` blocks and fields.
- Produces: public navigation and block styling limited to fields allowed by the link.

- [ ] **Step 1: Write failing public-page tests**

```tsx
expect(screen.getByRole("navigation", { name: "Содержание карточки" })).toBeInTheDocument();
expect(screen.queryByText("Публичный доступ")).not.toBeInTheDocument();
expect(screen.queryByText("Архивировать карточку")).not.toBeInTheDocument();
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- PublicLinkEditPage.test.tsx --run`

Expected: FAIL because the public page has not adopted the shared shell.

- [ ] **Step 3: Implement the public projection**

Wrap public surfaces in `CardPresentationShell`, derive items from existing server-filtered blocks, and preserve `can_edit`, field saver, submission and review behavior. Do not add attachments or any admin metadata.

- [ ] **Step 4: Verify GREEN and commit**

Run:

```bash
npm test -- PublicLinkEditPage.test.tsx --run
npm run typecheck
npm run build
```

Expected: PASS.

```bash
git add frontend/src/pages/PublicLinkEditPage.tsx frontend/src/pages/PublicLinkEditPage.test.tsx frontend/src/styles/globals.css
git commit -m "feat: align public card filling presentation"
```

### Task 6: Release and prove the completed flow

**Files:**
- Modify: `PLANS.md`

**Interfaces:**
- Consumes: completed backend and frontend work.
- Produces: deployed `main`, release evidence, and browser proof.

- [ ] **Step 1: Run checks**

```powershell
powershell -ExecutionPolicy Bypass -File scripts/test.ps1
powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote
```

Expected: record exact pass/skip results; if only known unrelated Ruff format drift stops the aggregate gate, record the affected files without changing them.

- [ ] **Step 2: Record release evidence and publish**

```powershell
git add PLANS.md
git commit -m "docs: record unified card presentation release"
git push origin main
powershell -ExecutionPolicy Bypass -File scripts/deploy-frontend.ps1
powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1
```

Expected: `main` is deployed, the service is active, and same-origin frontend/API smoke checks pass.

- [ ] **Step 3: Verify in the in-app browser**

At desktop and narrow widths: choose a template and verify its field order; verify public-picker defaults; create a public link before entry and confirm a draft plus URL; open the URL and verify the matching navigator/style with no administrative controls; open the card as admin and verify saved settings. Confirm page identity, non-blank content, no framework overlay, no relevant console errors/warnings, screenshot evidence, and interaction results.

- [ ] **Step 4: Commit post-deploy evidence if necessary**

```bash
git add PLANS.md
git commit -m "docs: record unified card presentation release"
git push origin main
```

Expected: `git status --short --branch` is clean on `main...origin/main`.
