# Card Status And Layout UX Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically derive card draft/active lifecycle from mandatory-field completeness and implement the six approved card-layout/A4 interaction improvements without changing saved form or print geometry contracts.

**Architecture:** Keep `cards.lifecycle_status` materialized and backend-owned. Reuse the existing required-value reader in `CardService`, synchronize status at every value/schema boundary, and keep send-for-filling lifecycle-neutral. On the frontend, preserve the current revision-safe geometry session while replacing visible field action buttons with direct pointer/keyboard interaction and rendering web blocks at content height only.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy 2, PostgreSQL, pytest, React 19, TypeScript, TanStack Query, Vitest/Testing Library, Vite, in-app Browser.

## Global Constraints

- User-facing UI is Russian-first and the visible product name remains `Реестровая система`.
- The platform remains schema-driven; no hardcoded employee/business fields.
- Backend RBAC and REST API remain the business-logic boundary.
- Saved form geometry remains exactly 12 columns by four logical rows.
- A4 geometry remains millimeter-based and DOCX/PDF generation remains backend-owned.
- `Отправить на заполнение` is available for manageable draft and active cards and never changes lifecycle status by itself.
- `required` and `required_on_publish` both count toward automatic completeness.
- Archived and superseded cards are terminal and are never reopened by automatic synchronization.
- No Alembic migration or new dependency.
- Work on `main` only; do not create a feature branch or worktree.

---

### Task 1: Backend completeness status core

**Files:**
- Modify: `backend/app/services/cards.py`
- Test: `backend/tests/test_registry_card_services.py`

**Interfaces:**
- Produces: `CardService.synchronize_card_lifecycle -> bool` and `CardService.synchronize_registry_card_lifecycles -> int`.
- Produces: `_missing_required_field_labels(card, *, include_publish_required) -> list[str]` shared by activation validation and automatic lifecycle.
- Consumes: existing `_active_schema_rows_for_registry`, `_template_field_ids`, `_field_value_is_empty`, `_multi_select_item_ids`, and `AuditService`.

- [ ] **Step 1: Add failing lifecycle tests**

Add PostgreSQL-backed tests that create template-scoped mandatory fields and assert the desired persisted status:

```python
def test_card_lifecycle_is_derived_from_mandatory_completeness(db_session: Session) -> None:
    context = _phase_1d_context(db_session)
    card_service = CardService(db_session)
    card = card_service.create_card_for_actor(
        actor_user_id=context["org_admin"].id,
        registry_id=context["registry"].id,
        organization_id=context["organization"].id,
    )
    assert card.lifecycle_status == "draft"

    card_service.set_field_value_for_actor(
        actor_user_id=context["org_admin"].id,
        card_id=card.id,
        field_id=context["required_field"].id,
        value="Заполнено",
    )
    assert card.lifecycle_status == "active"
```

Cover no mandatory fields (`active`), missing mandatory fields (`draft`), template defaults (`active`), clearing `required_on_publish` (`draft`), terminal states unchanged, template field membership, and one card audit event per actual automatic transition.

- [ ] **Step 2: Run the focused backend tests and verify RED**

Run:

```powershell
backend\.venv\Scripts\python.exe -m pytest backend\tests\test_registry_card_services.py -k "derived_from_mandatory or automatic_lifecycle" -q
```

Expected: failures because newly created cards still hardcode `draft` and value saves do not synchronize lifecycle.

- [ ] **Step 3: Extract missing-label calculation and implement synchronization**

Refactor the current raising validator into a reusable result:

```python
def _missing_required_field_labels(
    self,
    card: Card,
    *,
    include_publish_required: bool,
) -> list[str]:
    template = self.session.get(CardTemplate, card.card_template_id)
    if template is None:
        raise CardServiceError("Card template was not found.")
    template_field_ids = self._template_field_ids(template)
    required_modes = {"required"}
    if include_publish_required:
        required_modes.add("required_on_publish")
    schema_rows = [
        (block, field_model)
        for block, field_model in self._active_schema_rows_for_registry(card.registry_id)
        if field_model.id in template_field_ids
        and field_model.required_mode in required_modes
        and field_model.field_type != "static_text"
    ]
    field_ids = [field_model.id for _, field_model in schema_rows]
    field_values = (
        list(
            self.session.scalars(
                select(FieldValue).where(
                    FieldValue.card_id == card.id,
                    FieldValue.field_id.in_(field_ids),
                )
            ).all()
        )
        if field_ids
        else []
    )
    item_ids_by_value_id = self._multi_select_item_ids(field_values)
    values_by_instance_field = {
        (field_value.block_instance_id, field_value.field_id): field_value
        for field_value in field_values
    }
    values_by_field: dict[UUID, list[FieldValue]] = {}
    for field_value in field_values:
        values_by_field.setdefault(field_value.field_id, []).append(field_value)
    instances_by_block = self._block_instances_for_card(card.id)
    missing_labels: list[str] = []
    for block, field_model in schema_rows:
        if block.is_repeatable:
            for instance in instances_by_block.get(block.id, []):
                value = values_by_instance_field.get((instance.id, field_model.id))
                if self._field_value_is_empty(field_model, value, item_ids_by_value_id):
                    missing_labels.append(f"{field_model.label} ({block.title})")
            continue
        values = values_by_field.get(field_model.id, [])
        if not any(
            not self._field_value_is_empty(field_model, value, item_ids_by_value_id)
            for value in values
        ):
            missing_labels.append(field_model.label)
    return sorted(set(missing_labels))

def synchronize_card_lifecycle(
    self,
    card: Card,
    *,
    actor_user_id: UUID | None = None,
    actor_public_link_id: UUID | None = None,
    audit_transition: bool = True,
) -> bool:
    if card.lifecycle_status in {"archived", "superseded"}:
        return False
    missing = self._missing_required_field_labels(card, include_publish_required=True)
    next_status = "draft" if missing else "active"
    if next_status == card.lifecycle_status:
        return False
    old_status = card.lifecycle_status
    card.lifecycle_status = next_status
    self.session.flush()
    if audit_transition:
        self._record_lifecycle_transition(
            card,
            old_status=old_status,
            actor_user_id=actor_user_id,
            actor_public_link_id=actor_public_link_id,
        )
    return True
```

Use user, public-link, or system audit methods according to the supplied actor. Keep `_validate_required_fields_for_card` as a thin wrapper that raises from returned labels for compatibility.

- [ ] **Step 4: Synchronize creation after defaults**

After `_apply_card_template_defaults`, call `synchronize_card_lifecycle(card, actor_user_id=created_by, audit_transition=False)` and include `lifecycle_status` in the existing card-create audit payload. A card with no mandatory fields becomes active without a separate update audit.

- [ ] **Step 5: Run the focused backend tests and verify GREEN**

Run the same focused pytest command. Expected: selected lifecycle tests pass with no unexpected errors.

- [ ] **Step 6: Commit the backend core**

```powershell
git add -- backend/app/services/cards.py backend/tests/test_registry_card_services.py
git commit -m "Derive card lifecycle from completeness"
```

### Task 2: Wire every card mutation and schema boundary

**Files:**
- Modify: `backend/app/services/cards.py`
- Modify: `backend/app/services/registry_schema.py`
- Test: `backend/tests/test_registry_card_services.py`
- Test: `backend/tests/test_public_link_review_lifecycle.py`
- Test: `backend/tests/test_api_phase_3_import_export.py`

**Interfaces:**
- Consumes: `CardService.synchronize_card_lifecycle` from Task 1.
- Consumes: `CardService.synchronize_registry_card_lifecycles` from Task 1.
- Produces: all authenticated, public, import, repeatable-block, and schema paths maintain the lifecycle invariant.

- [ ] **Step 1: Add failing integration tests for mutation paths**

Add focused tests asserting:

```python
assert draft_card.lifecycle_status == "draft"
PublicLinkService(db_session).edit_card_field_with_token(
    raw_token=raw_token,
    field_id=required_field.id,
    value="Последнее обязательное значение",
)
assert draft_card.lifecycle_status == "active"

status_before_send = active_card.lifecycle_status
PublicLinkService(db_session).create_public_link_for_actor(
    actor_user_id=org_admin.id,
    card_id=active_card.id,
)
assert active_card.lifecycle_status == status_before_send
```

Also cover authenticated bulk writes, import commit, repeatable instance create/archive, and changing a field from `not_required` to `required_on_publish`.

- [ ] **Step 2: Run focused mutation tests and verify RED**

Run:

```powershell
backend\.venv\Scripts\python.exe -m pytest backend\tests\test_registry_card_services.py backend\tests\test_public_link_review_lifecycle.py backend\tests\test_api_phase_3_import_export.py -k "lifecycle or send_for_filling" -q
```

Expected: failures on paths that currently leave `lifecycle_status` unchanged.

- [ ] **Step 3: Synchronize authenticated and public value writes**

Add an internal boolean to avoid intermediate bulk transitions:

Extend the existing `set_field_value_for_actor` signature with
`synchronize_lifecycle: bool = True`. Immediately before returning its
`FieldValue`, call `self.synchronize_card_lifecycle(card,
actor_user_id=actor_user_id)` only when that flag is true. Replace the bulk
method with the following batching shape:

```python
def set_field_values_for_actor(
    self,
    *,
    actor_user_id: UUID,
    card_id: UUID,
    values: Sequence[BulkFieldValueInput],
) -> list[FieldValue]:
    card = self._get_editable_card(card_id)
    with self.session.begin_nested():
        field_values = [
            self.set_field_value_for_actor(
                actor_user_id=actor_user_id,
                card_id=card_id,
                field_id=item.field_id,
                value=item.value,
                block_instance_id=item.block_instance_id,
                synchronize_lifecycle=False,
            )
            for item in values
        ]
        self.synchronize_card_lifecycle(card, actor_user_id=actor_user_id)
    return field_values
```

Remove the global bulk-save rejection that requires unrelated `required` fields to be filled before a draft can be saved incrementally. Keep the direct empty assignment guard for the required field being edited. Public writes call synchronization with `actor_public_link_id`.

- [ ] **Step 4: Synchronize repeatable block changes and registry schema changes**

Call card synchronization after block-instance create/archive. Add registry-level synchronization:

```python
def synchronize_registry_card_lifecycles(
    self,
    *,
    registry_id: UUID,
    actor_user_id: UUID,
) -> int:
    cards = self.session.scalars(
        select(Card).where(
            Card.registry_id == registry_id,
            Card.lifecycle_status.in_(("draft", "active")),
        )
    ).all()
    return sum(
        self.synchronize_card_lifecycle(card, actor_user_id=actor_user_id)
        for card in cards
    )
```

From `RegistrySchemaService`, locally import `CardService` after field create/update/archive and card-template membership changes, then synchronize affected registry cards inside the same transaction.

- [ ] **Step 5: Verify mutation tests GREEN**

Run the same focused pytest command. Expected: selected tests pass; sending/link creation preserves both statuses.

- [ ] **Step 6: Run the broader backend suite**

```powershell
backend\.venv\Scripts\python.exe -m pytest -q
backend\.venv\Scripts\ruff.exe check backend
backend\.venv\Scripts\ruff.exe format --check backend
backend\.venv\Scripts\mypy.exe backend\app
```

Expected: zero failures. PostgreSQL tests may skip only when `TEST_DATABASE_URL` is absent.

- [ ] **Step 7: Commit mutation coverage**

```powershell
git add -- backend/app/services/cards.py backend/app/services/registry_schema.py backend/tests/test_registry_card_services.py backend/tests/test_public_link_review_lifecycle.py backend/tests/test_api_phase_3_import_export.py
git commit -m "Synchronize lifecycle across card writes"
```

### Task 3: Remove manual activation while preserving send-for-filling

**Files:**
- Modify: `frontend/src/features/cards/CardsWorkspace.tsx`
- Modify: `frontend/src/App.test.tsx`
- Modify: `frontend/src/app/uiText.ts`

**Interfaces:**
- Consumes: backend lifecycle transitions from Tasks 1-2.
- Produces: action panel without activation control; send-for-filling remains for both `draft` and `active` manageable cards.

- [ ] **Step 1: Add failing action-panel tests**

Update/add tests to assert:

```typescript
expect(screen.queryByRole("button", { name: /Активировать карточку/ })).not.toBeInTheDocument();
expect(within(draftPanel).getByRole("button", { name: "Отправить на заполнение" })).toBeEnabled();
expect(within(activePanel).getByRole("button", { name: "Отправить на заполнение" })).toBeEnabled();
expect(fetchMock).not.toHaveBeenCalledWith(
  expect.stringContaining("/cards/"),
  expect.objectContaining({ body: expect.stringContaining('"lifecycle_status":"active"') }),
);
```

- [ ] **Step 2: Run the focused frontend test and verify RED**

```powershell
pnpm -C frontend exec vitest run src/App.test.tsx -t "card action panel|send for filling|activation" --reporter=dot
```

Expected: activation button/mutation assertions fail against the current UI.

- [ ] **Step 3: Remove activation state, mutation, props, and copy**

Delete `activateCardMutation`, `isActivating`, `onActivate`, and the draft-only activation button. Keep the existing unconditional manageable-card send button. Ensure successful block/public saves invalidate card and list queries so backend-derived status appears without reload.

- [ ] **Step 4: Run focused frontend test and verify GREEN**

Run the same Vitest command. Expected: selected tests pass.

- [ ] **Step 5: Commit the action-panel change**

```powershell
git add -- frontend/src/features/cards/CardsWorkspace.tsx frontend/src/App.test.tsx frontend/src/app/uiText.ts
git commit -m "Remove manual card activation"
```

### Task 4: Compact web blocks and move field creation to the footer

**Files:**
- Modify: `frontend/src/features/cardLayout/CardWebLayoutCanvas.tsx`
- Modify: `frontend/src/features/cardLayout/CardBlockLayoutNode.tsx`
- Modify: `frontend/src/features/registry/print/A4LayoutRenderer.tsx`
- Modify: `frontend/src/styles/globals.css`
- Test: `frontend/src/features/cardLayout/CardLayoutRenderer.test.tsx`

**Interfaces:**
- Produces: `compactBlockHeight?: boolean` prop flowing from `CardWebLayoutCanvas` to `CardBlockLayoutNode`.
- Produces: exact A4 linked rendering by passing `compactBlockHeight={false}`.

- [ ] **Step 1: Add failing compact-height/footer tests**

Assert a block whose fields occupy only row 1 renders one internal row and that the create action follows the field grid in DOM order:

```typescript
const block = screen.getByTestId("layout-block-block-fio");
const fieldGrid = block.querySelector("[data-layout-grid='fields']");
expect(fieldGrid).toHaveStyle({
  gridTemplateRows: "repeat(1, minmax(3rem, auto))",
  minHeight: "3rem",
});
expect(block).toHaveStyle({ alignSelf: "start" });
expect(fieldGrid?.compareDocumentPosition(createFieldButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
```

Add an A4 assertion that linked rendering still uses four rows and `12rem` minimum height.

- [ ] **Step 2: Run focused tests and verify RED**

```powershell
pnpm -C frontend exec vitest run src/features/cardLayout/CardLayoutRenderer.test.tsx -t "compact block|field creation footer|A4 exact height" --reporter=dot
```

- [ ] **Step 3: Implement content-row calculation and footer placement**

In `CardBlockLayoutNode`:

```typescript
const occupiedRowCount = section.items.reduce(
  (lastRow, item) => Math.max(lastRow, item.row + item.row_span - 1),
  1,
);
const visibleRowCount = compactBlockHeight ? occupiedRowCount : 4;
```

Use `repeat(${visibleRowCount}, minmax(3rem, auto))`, `${visibleRowCount * 3}rem`, and `alignSelf: compactBlockHeight ? "start" : undefined`. Move `Создать поле` into `.card-layout-block-footer` after the field grid; leave `Изменить блок` in the header.

- [ ] **Step 4: Preserve exact A4 projection**

Pass `compactBlockHeight={false}` from the linked-card renderer in `A4LayoutRenderer.tsx`. Add focused CSS for the footer without fixed height or overflow.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run the same Vitest command. Expected: compact web and exact A4 assertions pass.

### Task 5: Direct field click, drag, resize, and keyboard interaction

**Files:**
- Modify: `frontend/src/features/cardLayout/CardFieldLayoutNode.tsx`
- Modify: `frontend/src/features/cardLayout/useLayoutGeometrySession.ts`
- Modify: `frontend/src/styles/globals.css`
- Test: `frontend/src/features/cardLayout/CardLayoutRenderer.test.tsx`

**Interfaces:**
- Consumes: existing `LayoutGeometryControls` and revision-safe `onGeometryCommit`.
- Produces: field-surface pending gesture with a six-pixel threshold and eight unobtrusive resize zones.

- [ ] **Step 1: Add failing direct-interaction tests**

Cover all required behavior:

```typescript
expect(screen.queryByRole("button", { name: "Изменить поле Имя" })).not.toBeInTheDocument();
expect(screen.queryByRole("button", { name: "Переместить поле Имя" })).not.toBeInTheDocument();

await user.click(screen.getByTestId("layout-field-field-name"));
expect(screen.getByLabelText("Название поля")).toBeInTheDocument();
```

Dispatch pointer down/move/up on the article to prove a move commits only after at least six pixels, while down/up without movement opens editing and does not leave `.card-layout-geometry-session`. Assert eight resize zones exist and edge drag commits resize. Assert Enter opens editing, arrows move, and Shift+arrows resize.

- [ ] **Step 2: Run focused direct-interaction tests and verify RED**

```powershell
pnpm -C frontend exec vitest run src/features/cardLayout/CardLayoutRenderer.test.tsx -t "direct field interaction|field surface drag|field resize zones" --reporter=dot
```

- [ ] **Step 3: Implement pending field-surface gesture**

Use refs in `CardFieldLayoutNode`:

```typescript
const pendingMoveRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
const suppressClickRef = useRef(false);
const DIRECT_MOVE_THRESHOLD_PX = 6;
```

On pointer down, ignore interactive descendants and remember the origin. On pointer move beyond six pixels, set `suppressClickRef`, invoke `geometry.beginMove(event, target, grid)`, then forward later pointer events to the geometry session. On click, suppress after a drag; otherwise select the field. Add `tabIndex={0}`, `aria-label`, Enter/Space editing, and existing arrow keyboard geometry.

- [ ] **Step 4: Remove visible field action buttons and expose border zones**

Delete the visible edit and move buttons. Render all eight resize handles at rest. CSS keeps them transparent until `.card-layout-field-node:hover`, `:focus-visible`, `:focus-within`, or active geometry, while preserving focus outlines and accessible names.

- [ ] **Step 5: Cancel no-move geometry sessions**

In `useLayoutGeometrySession.pointerUp`, clear the session when preview equals original:

```typescript
if (current && rectEquals(current.original, current.preview)) {
  clear();
  return;
}
```

This prevents a click/no-move gesture from leaving the editor in geometry mode.

- [ ] **Step 6: Run focused and full renderer tests GREEN**

```powershell
pnpm -C frontend exec vitest run src/features/cardLayout/CardLayoutRenderer.test.tsx --reporter=dot
```

Expected: all renderer tests pass with updated direct-interaction expectations.

- [ ] **Step 7: Commit web-layout interaction work**

```powershell
git add -- frontend/src/features/cardLayout/CardWebLayoutCanvas.tsx frontend/src/features/cardLayout/CardBlockLayoutNode.tsx frontend/src/features/cardLayout/CardFieldLayoutNode.tsx frontend/src/features/cardLayout/useLayoutGeometrySession.ts frontend/src/features/registry/print/A4LayoutRenderer.tsx frontend/src/styles/globals.css frontend/src/features/cardLayout/CardLayoutRenderer.test.tsx
git commit -m "Polish direct card layout interactions"
```

### Task 6: Clean up A4 linked controls and print-element list

**Files:**
- Modify: `frontend/src/features/cardLayout/A4LinkedCardCanvas.tsx`
- Modify: `frontend/src/features/registry/print/A4LayoutRenderer.tsx`
- Modify: `frontend/src/features/registry/print/CardLayoutStudio.tsx`
- Modify: `frontend/src/styles/globals.css`
- Test: `frontend/src/features/registry/CardPrintTemplateEditor.test.tsx`

**Interfaces:**
- Removes: `onEditCardLayout` and `onEditLinkedCard` callback chain.
- Produces: `Добавить печатный элемент` disclosure containing the unchanged `PrintOnlyItemKind` callbacks.

- [ ] **Step 1: Add failing A4 cleanup tests**

```typescript
expect(screen.queryByRole("button", { name: "Редактировать внутренний макет" })).not.toBeInTheDocument();
await user.click(screen.getByText("Добавить печатный элемент"));
expect(screen.getByRole("button", { name: "Добавить заголовок" })).toBeVisible();
await user.click(screen.getByRole("button", { name: "Добавить заголовок" }));
expect(screen.queryByRole("button", { name: "Добавить заголовок" })).not.toBeVisible();
```

Assert the remaining seven actions appear when reopened and disabled state follows `busy`.

- [ ] **Step 2: Run focused A4 tests and verify RED**

```powershell
pnpm -C frontend exec vitest run src/features/registry/CardPrintTemplateEditor.test.tsx -t "print element list|inner layout button" --reporter=dot
```

- [ ] **Step 3: Remove the inner-layout callback chain**

Delete the button from `A4LayoutRenderer`, remove `onEditLinkedCard` from its props and child function signatures, remove `onEditCardLayout` from `A4LinkedCardCanvas`, and remove the callback passed by `CardLayoutStudio`. Stage tabs remain the only navigation between card layout and A4.

- [ ] **Step 4: Implement disclosure list**

Use a controlled-by-DOM `<details>` with a ref:

```tsx
<details ref={printActionsRef} className="a4-linked-card-action-menu">
  <summary>Добавить печатный элемент</summary>
  <ul>
    {printOnlyActions.map((action) => (
      <li key={action.kind}>
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            onAddPrintItem?.(action.kind);
            printActionsRef.current?.removeAttribute("open");
          }}
        >
          {action.label}
        </button>
      </li>
    ))}
  </ul>
</details>
```

Style the menu as a compact vertical popup above the A4 workspace without overlapping the printable page.

- [ ] **Step 5: Run focused A4 tests and verify GREEN**

Run the same focused Vitest command, then the complete `CardPrintTemplateEditor.test.tsx` file.

- [ ] **Step 6: Commit A4 cleanup**

```powershell
git add -- frontend/src/features/cardLayout/A4LinkedCardCanvas.tsx frontend/src/features/registry/print/A4LayoutRenderer.tsx frontend/src/features/registry/print/CardLayoutStudio.tsx frontend/src/styles/globals.css frontend/src/features/registry/CardPrintTemplateEditor.test.tsx
git commit -m "Simplify A4 layout controls"
```

### Task 7: Documentation, full verification, release, and live proof

**Files:**
- Modify: `README.md`
- Modify: `PLANS.md`
- Modify: `docs/PROJECT_TREE.md` through the project script if source paths changed

**Interfaces:**
- Consumes: all completed behavior from Tasks 1-6.
- Produces: verified local checkpoint, synchronized `main`, deployed frontend/backend, and Browser evidence.

- [ ] **Step 1: Update project documentation**

Record the automatic lifecycle invariant, lifecycle-neutral send behavior, compact web blocks, direct field gestures, bottom field creation, and A4 control cleanup. State explicitly that no migration was required and do not claim deployment until it passes.

- [ ] **Step 2: Run the project map and full local gate**

```powershell
powershell -ExecutionPolicy Bypass -File scripts/project-map.ps1
powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote
```

Expected: backend pytest, Ruff, format, mypy, frontend ESLint, TypeScript, Vitest, production build, and project-map check all pass. Record exact pass/skip counts and known pre-existing warnings.

- [ ] **Step 3: Run disposable PostgreSQL tests**

Use only a configured database ending in `_test` and run the focused lifecycle/database suites. If local `TEST_DATABASE_URL` is absent, use the project’s configured remote workflow without touching production data. Expected: migrations reach head and all lifecycle cases pass.

- [ ] **Step 4: Commit documentation and final local evidence**

```powershell
git add -- README.md PLANS.md docs/PROJECT_TREE.md
git commit -m "Document automatic card status UX"
```

- [ ] **Step 5: Push and deploy through project scripts**

```powershell
git push origin main
powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1
powershell -ExecutionPolicy Bypass -File scripts/deploy-frontend.ps1
powershell -ExecutionPolicy Bypass -File scripts/server-check.ps1
```

Expected: `main`, `origin/main`, and server checkout match; API health and same-origin frontend smoke pass. No production schema migration is run.

- [ ] **Step 6: Run Browser QA on the exact deployed host**

The flow under test is: `http://192.168.100.12:8000/` -> card create/fill/send and template layout/A4 interactions -> derived statuses and compact direct-manipulation UI render without regressions.

Use the in-app Browser first. Verify page identity/title, non-blank DOM, no framework overlay, console health, screenshot evidence, and target interactions at desktop and 420 px. Exercise draft send, active send, final mandatory save, field click, field-surface drag, edge resize, compact block, footer add action, absent activation/inner-layout buttons, and the print-element disclosure.

- [ ] **Step 7: Record live evidence and final commit only if documentation changed**

Update `PLANS.md` with exact deployment commit, assets, test counts, Browser checks, console/network results, and screenshot artifact paths outside Git. Commit and push that evidence, then re-run deploy/server smoke only if the deployed source changed.
