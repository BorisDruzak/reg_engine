# Filled Card Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render completed cards with the configured block/field geometry and allow one block at a time to be edited directly inside its existing cells.

**Architecture:** Reuse the shared `CardLayoutRenderer` from the contextual studio in `readonly` and `block-edit` modes. Keep card-level actions and tabs in `CardsWorkspace`, but move value display and block-scoped edit state into focused card components and preserve the existing attachment-aware `file_ref` workflow.

**Tech Stack:** React 19, TypeScript, TanStack Query, Testing Library, Vitest, existing Registry Engine card APIs and typed field controls.

## Global Constraints

- The completed card must exactly follow the saved template geometry on desktop.
- Do not show a global `Редактировать` action; expose only `Изменить блок` per editable block.
- Edit controls replace values inside the selected block; no editor appears below the card.
- Only one block editor may be open at a time.
- Preserve the existing `file_ref` attachment-aware single-field editor and do not create a competing bulk save surface.
- Preserve repeatable block-instance behavior, typed coercion, backend permissions, and audit events.
- Empty values use Russian `Не заполнено`; arbitrary user-entered content remains unchanged.
- Admin-only queries remain section-scoped and backend access checks remain authoritative.
- Work on `main`; do not create a feature branch unless the user explicitly requests it.

---

## File Structure

- `frontend/src/features/cards/FilledCardLayout.tsx`: completed-card read surface and block actions.
- `frontend/src/features/cards/useBlockEditor.ts`: block draft, dirty state, save/cancel/conflict behavior.
- `frontend/src/features/cards/BlockFieldControl.tsx`: type-specific inline block controls around existing `FieldEditorControl`.
- `frontend/src/features/cards/FilledCardLayout.test.tsx`: focused completed-card and edit-state tests.
- `frontend/src/features/cards/CardsWorkspace.tsx`: card header, tabs, data wiring, removal of the bulk fields surface from the default view.
- `frontend/src/features/cardLayout/CardLayoutRenderer.tsx`: renderer support for `readonly` and `block-edit` modes.
- `frontend/src/features/cards/FieldEditorControl.tsx`: reused typed controls; no business-specific additions.
- `frontend/src/App.test.tsx`: end-to-end component regression for the real card workspace.
- `frontend/src/styles/globals.css`: completed-card and responsive styles.

### Task 1: Add a read-only completed-card renderer

**Files:**
- Create: `frontend/src/features/cards/FilledCardLayout.tsx`
- Create: `frontend/src/features/cards/FilledCardLayout.test.tsx`
- Modify: `frontend/src/features/cardLayout/CardLayoutRenderer.tsx`
- Modify: `frontend/src/styles/globals.css`

**Interfaces:**
- Produces: `FilledCardLayoutProps`.
- Consumes: `CardTemplateLayoutRead`, visible `FormBlockRead[]`, `FormFieldRead[]`, block instances, values, and edit permissions.
- Produces: `onEditBlock(blockId: string, blockInstanceId: string | null): void`.

- [ ] **Step 1: Write failing read-view tests**

```tsx
render(<FilledCardLayout {...fixtureProps} />);

expect(screen.queryByRole("button", { name: "Редактировать" })).not.toBeInTheDocument();
expect(screen.getByRole("button", { name: "Изменить блок ФИО" })).toBeInTheDocument();
expect(screen.getByText("Не заполнено")).toBeInTheDocument();
expect(screen.getByTestId("filled-block-fio")).toHaveStyle({
  gridColumn: "1 / span 6",
  gridRow: "1 / span 2",
});
expect(screen.getByTestId("filled-field-last-name")).toHaveStyle({
  gridColumn: "7 / span 6",
  gridRow: "1 / span 1",
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm -C frontend exec vitest run src/features/cards/FilledCardLayout.test.tsx --reporter=dot --testTimeout=10000`

Expected: FAIL because `FilledCardLayout` does not exist.

- [ ] **Step 3: Define the completed-card component contract**

```ts
export type FilledCardLayoutProps = {
  layout: CardTemplateLayoutRead;
  blocks: FormBlockRead[];
  fields: FormFieldRead[];
  blockInstances: CardBlockInstanceRead[];
  values: FieldValueRead[];
  editableFieldIds: ReadonlySet<string>;
  activeBlock: { blockId: string; blockInstanceId: string | null } | null;
  onEditBlock: (blockId: string, blockInstanceId: string | null) => void;
};
```

- [ ] **Step 4: Implement read-value adapters by existing field type**

Use the current `fieldTypeLabel`, reference option labels, card reference links,
date formatting, choice chips, boolean labels, safe JSON formatting, file title,
and static text. Return `Не заполнено` for a missing editable value and do not
invent values.

- [ ] **Step 5: Render exact template geometry through `CardLayoutRenderer`**

Pass `mode="readonly"`, hide geometry diagnostics, and render
`Изменить блок` only when the block contains at least one field allowed by the
backend-derived edit permissions.

- [ ] **Step 6: Add responsive row-major fallback styles**

At the existing mobile breakpoint, render blocks in logical row/column order at
full width and fields in readable one- or two-column rows without horizontal
scrolling.

- [ ] **Step 7: Run the focused test and verify GREEN**

Run: `pnpm -C frontend exec vitest run src/features/cards/FilledCardLayout.test.tsx --reporter=dot --testTimeout=10000`

Expected: PASS with geometry, Russian empty values, type display, permission,
and responsive class coverage.

- [ ] **Step 8: Commit the completed-card read view**

```powershell
git add frontend/src/features/cards/FilledCardLayout.tsx frontend/src/features/cards/FilledCardLayout.test.tsx frontend/src/features/cardLayout/CardLayoutRenderer.tsx frontend/src/styles/globals.css
git commit -m "Add completed card layout view"
```

### Task 2: Add block-scoped inline editing

**Files:**
- Create: `frontend/src/features/cards/useBlockEditor.ts`
- Create: `frontend/src/features/cards/BlockFieldControl.tsx`
- Modify: `frontend/src/features/cards/FilledCardLayout.tsx`
- Modify: `frontend/src/features/cards/FilledCardLayout.test.tsx`

**Interfaces:**
- Produces: `useBlockEditor(options) -> BlockEditorState`.
- Produces: `BlockEditorState.open`, `update`, `save`, `cancel`, `requestClose`.
- Consumes: existing atomic `updateCardFieldValues`, block-instance, and attachment-aware `file_ref` client functions.

- [ ] **Step 1: Write failing in-block edit tests**

```tsx
await user.click(screen.getByRole("button", { name: "Изменить блок ФИО" }));
const block = screen.getByTestId("filled-block-fio");
expect(within(block).getByLabelText("Имя")).toHaveValue("Иван");
expect(within(block).getByRole("button", { name: "Сохранить блок ФИО" })).toBeInTheDocument();
expect(screen.queryByText("Массовое сохранение полей")).not.toBeInTheDocument();

await user.clear(within(block).getByLabelText("Имя"));
await user.type(within(block).getByLabelText("Имя"), "Пётр");
await user.click(within(block).getByRole("button", { name: "Сохранить блок ФИО" }));
expect(api.updateCardFieldValues).toHaveBeenCalledWith(
  expect.anything(),
  expect.anything(),
  {
    values: [expect.objectContaining({ field_id: FIELD_NAME_ID, value: "Пётр" })],
  },
);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm -C frontend exec vitest run src/features/cards/FilledCardLayout.test.tsx --reporter=dot --testTimeout=10000`

Expected: FAIL because the block editor hook and controls do not exist.

- [ ] **Step 3: Define block draft state**

```ts
export type BlockEditorKey = `${string}:${string | "primary"}`;

export type BlockEditorState = {
  key: BlockEditorKey | null;
  values: Record<string, unknown>;
  dirty: boolean;
  pending: boolean;
  errors: Record<string, string>;
  open: (blockId: string, blockInstanceId: string | null, initial: Record<string, unknown>) => void;
  update: (fieldId: string, value: unknown) => void;
  save: () => Promise<boolean>;
  cancel: () => void;
  requestClose: () => "closed" | "confirm-discard";
};
```

- [ ] **Step 4: Implement typed controls in the existing field cells**

Wrap `FieldEditorControl` for ordinary editable types. Render `static_text` as
read-only. Render `file_ref` as its existing attachment-aware action and exclude
it from the ordinary block-save loop.

- [ ] **Step 5: Implement save/cancel and dirty close protection**

Save all changed ordinary fields through one existing
`PATCH /api/v1/cards/{card_id}/values` request after client-side coercion passes.
The backend already wraps this bulk operation in a nested transaction, so any
invalid field leaves the entire block draft unapplied. If the request fails,
keep the draft and show the mapped Russian field error. `Отмена` restores the
initial snapshot. Click-away with dirty values opens the three-way decision
`Сохранить / Не сохранять / Продолжить редактирование`.

- [ ] **Step 6: Add repeatable-block instance coverage**

Open and save the exact `(block_id, block_instance_id)` pair. Assert edits in
instance 2 never overwrite primary or instance 1 values.

- [ ] **Step 7: Run the focused suite and typecheck**

Run: `pnpm -C frontend exec vitest run src/features/cards/FilledCardLayout.test.tsx --reporter=dot --testTimeout=10000`

Run: `pnpm -C frontend typecheck`

Expected: both commands exit `0`.

- [ ] **Step 8: Commit inline block editing**

```powershell
git add frontend/src/features/cards/useBlockEditor.ts frontend/src/features/cards/BlockFieldControl.tsx frontend/src/features/cards/FilledCardLayout.tsx frontend/src/features/cards/FilledCardLayout.test.tsx
git commit -m "Add inline card block editing"
```

### Task 3: Integrate the completed view into `CardsWorkspace`

**Files:**
- Modify: `frontend/src/features/cards/CardsWorkspace.tsx`
- Modify: `frontend/src/App.test.tsx`
- Modify: `frontend/src/styles/globals.css`

**Interfaces:**
- Consumes: `FilledCardLayout`, `useBlockEditor`, existing card/template/value queries, card actions, attachment panel, document panel, public-links panel, history.
- Produces: the default `Поля` tab as completed read view with block editing.

- [ ] **Step 1: Update the real workspace regression test first**

Open an existing card and assert:

```tsx
expect(await screen.findByRole("heading", { name: "Карточка № 213" })).toBeInTheDocument();
expect(screen.queryByText("Массовое сохранение полей")).not.toBeInTheDocument();
await user.click(screen.getByRole("button", { name: "Изменить блок ФИО" }));
expect(screen.getByRole("button", { name: "Сохранить блок ФИО" })).toBeInTheDocument();
```

Retain assertions for print downloads, attachments, documents, public links,
history, activation, archive, and repeatable block instances.

- [ ] **Step 2: Run the targeted app regression and verify RED**

Run: `pnpm -C frontend exec vitest run src/App.test.tsx --reporter=dot --testNamePattern="card workspace" --testTimeout=15000`

Expected: FAIL because the current default tab still renders the mass-edit form.

- [ ] **Step 3: Replace the default bulk form with `FilledCardLayout`**

Keep `BulkCardValuesForm` only if another explicit import/internal workflow
still references it; otherwise remove its dead component code after `rg`
confirms no callers. Do not disturb attachments, documents, links, or history
tabs.

- [ ] **Step 4: Add completion and public-link state to the card header**

Compute completion from visible values and required modes returned by the API.
Display status text without loading audit or user-management data globally.

- [ ] **Step 5: Run app tests, lint, typecheck, and build**

Run: `pnpm -C frontend exec vitest run src/features/cards/FilledCardLayout.test.tsx src/App.test.tsx --reporter=dot --testTimeout=15000`

Run: `pnpm -C frontend lint`

Run: `pnpm -C frontend typecheck`

Run: `pnpm -C frontend build`

Expected: all commands exit `0`.

- [ ] **Step 6: Commit the workspace integration**

```powershell
git add frontend/src/features/cards/CardsWorkspace.tsx frontend/src/App.test.tsx frontend/src/styles/globals.css
git commit -m "Use completed card layout workspace"
```

### Task 4: Documentation, full gate, deployment, and browser acceptance

**Files:**
- Modify: `PLANS.md`
- Modify: `README.md`
- Modify: `docs/PROJECT_MAP.md`
- Modify: `docs/PROJECT_TREE.md` through `scripts/project-map.ps1`

**Interfaces:**
- Produces: recorded Phase 8K verification and live evidence.
- Consumes: Tasks 1-3 and the contextual layout studio checkpoint.

- [ ] **Step 1: Document the completed-card behavior**

Record read-first rendering, exact template geometry, one-block editing,
`file_ref` preservation, repeatable blocks, responsive behavior, and the removal
of the default mass-edit surface.

- [ ] **Step 2: Refresh and check project maps**

Run: `powershell -ExecutionPolicy Bypass -File scripts/project-map.ps1`

Run: `powershell -ExecutionPolicy Bypass -File scripts/project-map.ps1 -Check`

Expected: check exits `0`.

- [ ] **Step 3: Run the full local gate**

Run: `powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote`

Expected: all backend, frontend, build, and project-map checks pass.

- [ ] **Step 4: Commit docs and generated maps**

```powershell
git add PLANS.md README.md docs/PROJECT_MAP.md docs/PROJECT_TREE.md
git commit -m "Document completed card workspace"
```

- [ ] **Step 5: Push and deploy the checkpoint**

Run: `powershell -ExecutionPolicy Bypass -File scripts/push-git.ps1 -Message "Release completed card workspace"`

Run: `powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1`

Run: `powershell -ExecutionPolicy Bypass -File scripts/deploy-frontend.ps1`

Expected: local, `origin/main`, and configured server checkout use the same
commit; health and frontend smoke checks pass.

- [ ] **Step 6: Perform live Browser validation**

The flow under test is: `Карточки -> открыть заполненную карточку -> Изменить блок -> Сохранить/Отмена -> Печатная форма/Вложения/Документы/Публичные ссылки/История`.

Verify exact desktop geometry, mobile reflow, no global edit action, no editor
below the card, type-specific controls inside the block, dirty click-away
protection, repeatable instances, attachment-aware `file_ref`, print downloads,
and no relevant console errors.

- [ ] **Step 7: Record live evidence in `PLANS.md`**

Add the deployed commit, exact Browser flow, screenshots stored outside Git,
console result, and remaining limitations; commit and push the evidence update.
