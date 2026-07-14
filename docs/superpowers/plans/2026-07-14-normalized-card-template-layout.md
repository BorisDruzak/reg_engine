# Normalized Card Template Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the web template editor a full-width vertical block list, create blocks and fields at a readable full width, and place the opened template commands in its own expanded card header.

**Architecture:** Web block geometry is normalized at the frontend layout boundary and persisted only through the established revision-aware layout save. The canvas keeps field geometry intact but stops exposing free block placement, while the selected template card supplies a portal target for the studio command toolbar. No REST API, database schema, or A4 print geometry changes.

**Tech Stack:** React 18, TypeScript, TanStack Query, Vitest, Testing Library, Vite.

## Global Constraints

- User-facing strings remain Russian-first; the backend API stays the business-logic boundary.
- Web blocks always save as `column=1`, `column_span=12`, and sequential rows; only up/down ordering remains available.
- Layout normalization is a draft-only transformation until the existing save mechanism writes it; loading a template alone does not mutate it.
- New fields use `column=1`, `column_span=12`, and `row_span=1`; existing field geometry is preserved and a full block appends past its last occupied row rather than overlapping a field.
- Remove the existing-block insertion affordance and free block size/placement controls only for the web template editor.
- A4 layout, existing cards, API contracts, migrations, and archive behavior are out of scope.

---

## File Structure

- `frontend/src/features/cardLayout/blockOrdering.ts` — pure normalization and reordering of web block sections.
- `frontend/src/features/cardLayout/blockOrdering.test.ts` — unit coverage for normalizing crooked block geometry and moving normalized blocks.
- `frontend/src/features/cardLayout/CardWebLayoutCanvas.tsx` — renders only full-width ordered blocks and a single bottom block-create action.
- `frontend/src/features/cardLayout/CardBlockLayoutNode.tsx` — removes web block geometry-resize affordances while retaining ordering controls.
- `frontend/src/features/cardLayout/CardLayoutRenderer.test.tsx` — canvas-level behavior for bottom-only creation and absent insertion/resize UI.
- `frontend/src/features/registry/print/CardLayoutStudio.tsx` — normalizes loaded web drafts, creates full-width fields, and portals command actions to the selected template card.
- `frontend/src/features/registry/RegistriesAndSchema.tsx` — renders the opened studio inside the selected template card and supplies its action host.
- `frontend/src/features/registry/CardPrintTemplateEditor.test.tsx` — integration tests for full-width draft persistence, field defaults, and command placement.
- `frontend/src/styles/globals.css` — makes the expanded template card and its action host wrap cleanly without changing A4 styling.

## Interfaces

```ts
export function normalizeWebBlockSections(
  layout: CardTemplateFormLayoutRead,
): CardTemplateFormLayoutRead;

export function reorderBlockSections(
  layout: CardTemplateFormLayoutRead,
  sectionId: string,
  direction: BlockOrderDirection,
): CardTemplateFormLayoutRead | null;

export type CardLayoutStudioProps = {
  // existing props
  actionPortalTarget?: HTMLElement | null;
};
```

`normalizeWebBlockSections` is pure and returns the visual row order with every block at full width. `reorderBlockSections` calls the same normalizer after swapping two adjacent blocks. `actionPortalTarget` belongs to the one selected template card; when set, the studio renders its full command toolbar there with `createPortal`.

### Task 1: Normalize web block geometry and simplify the canvas

**Files:**
- Modify: `frontend/src/features/cardLayout/blockOrdering.ts`
- Modify: `frontend/src/features/cardLayout/CardWebLayoutCanvas.tsx`
- Modify: `frontend/src/features/cardLayout/CardBlockLayoutNode.tsx`
- Modify: `frontend/src/features/cardLayout/CardLayoutRenderer.test.tsx`
- Modify: `frontend/src/styles/globals.css`
- Test: `frontend/src/features/cardLayout/blockOrdering.test.ts`

**Consumes:** `CardTemplateFormLayoutRead`, `CardTemplateFormLayoutSectionRead`, `BlockOrderDirection`.

**Produces:** `normalizeWebBlockSections(layout)` and a design-mode canvas whose sole block creation control is `Создать блок` at the visual bottom.

- [ ] **Step 1: Write failing normalization tests.**

  Replace geometry-preserving expectations with a crooked three-block fixture and assert that all normalized sections occupy columns 1–12 and sequential rows:

  ```ts
  const normalized = normalizeWebBlockSections(layout([
    section("section-a", 3, 7, 2, 6),
    section("section-b", 1, 10, 1, 3),
    section("section-c", 2, 1, 1, 9),
  ]));

  expect(normalized.sections.map(({ id, row, column, row_span, column_span }) => ({
    id, row, column, row_span, column_span,
  }))).toEqual([
    { id: "section-b", row: 1, column: 1, row_span: 1, column_span: 12 },
    { id: "section-c", row: 2, column: 1, row_span: 1, column_span: 12 },
    { id: "section-a", row: 3, column: 1, row_span: 1, column_span: 12 },
  ]);
  ```

  Add a reorder assertion that moving `section-c` up produces rows `[1, 2, 3]` and columns/spans `[(1, 12), (1, 12), (1, 12)]`.

- [ ] **Step 2: Run the targeted unit test and confirm the new expectation fails.**

  Run: `pnpm --dir frontend test:run src/features/cardLayout/blockOrdering.test.ts`

  Expected: FAIL because `normalizeWebBlockSections` is not exported and existing reorder keeps source width/height.

- [ ] **Step 3: Implement the pure normalizer and make reorder use it.**

  In `blockOrdering.ts`, order with the existing stable comparator, then map every section without touching `items`:

  ```ts
  export function normalizeWebBlockSections(layout: CardTemplateFormLayoutRead): CardTemplateFormLayoutRead {
    return {
      ...layout,
      sections: [...layout.sections]
        .sort(compareSections)
        .map((section, index) => ({
          ...section,
          row: index + 1,
          column: 1,
          row_span: 1,
          column_span: 12,
        })),
    };
  }
  ```

  After swapping the requested pair in `reorderBlockSections`, pass the swapped array through the same sequential full-width mapping. Keep `null` for unknown IDs and edge moves.

- [ ] **Step 4: Replace canvas-cell creation with a bottom action.**

  Remove `CardLayoutCreatePosition`, `onInsertBlock`, `firstEmptyQuarterCell`, the empty-cell grid item, and its responsive CSS selector. Change the creation callback to a position-free `onCreateBlock?: () => void`. After the canvas, render exactly one design-mode footer:

  ```tsx
  {designMode && !geometryActive && onCreateBlock ? (
    <div className="card-layout-create-block-footer">
      <button type="button" className="ghost-button" onClick={onCreateBlock}>
        Создать блок
      </button>
    </div>
  ) : null}
  ```

  Keep field geometry sessions available. For `CardBlockLayoutNode`, do not pass `geometry` for a block selection and omit block size diagnostics/resize handles in design mode; field geometry support remains unchanged. Preserve the existing up/down block controls.

- [ ] **Step 5: Update canvas tests before and after implementation.**

  In `CardLayoutRenderer.test.tsx`, replace references to `Создать блок в этой области`, `Вставить существующий блок в эту область`, and `card-layout-empty-area` with these assertions:

  ```ts
  expect(screen.getByRole("button", { name: "Создать блок" })).toBeInTheDocument();
  expect(screen.queryByText("Вставить существующий блок")).not.toBeInTheDocument();
  expect(screen.queryByTestId("card-layout-empty-area")).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/Размер блока:/)).not.toBeInTheDocument();
  ```

  Add one design-mode test that starts with non-normalized sections and confirms rendered block elements have `grid-column: 1 / span 12` and rows 1, 2, 3 after the caller passes the normalizer result.

- [ ] **Step 6: Run focused tests and commit the independently reviewable canvas change.**

  Run:

  ```powershell
  pnpm --dir frontend test:run src/features/cardLayout/blockOrdering.test.ts src/features/cardLayout/CardLayoutRenderer.test.tsx
  pnpm --dir frontend typecheck
  ```

  Expected: all selected tests pass and TypeScript has no errors.

  ```powershell
  git add frontend/src/features/cardLayout/blockOrdering.ts frontend/src/features/cardLayout/blockOrdering.test.ts frontend/src/features/cardLayout/CardWebLayoutCanvas.tsx frontend/src/features/cardLayout/CardBlockLayoutNode.tsx frontend/src/features/cardLayout/CardLayoutRenderer.test.tsx frontend/src/styles/globals.css
  git commit -m "feat: normalize web template blocks"
  ```

### Task 2: Normalize studio drafts and create full-width fields

**Files:**
- Modify: `frontend/src/features/registry/print/CardLayoutStudio.tsx`
- Modify: `frontend/src/features/registry/CardPrintTemplateEditor.test.tsx`

**Consumes:** `normalizeWebBlockSections`, existing revision-aware `saveNextFormLayout`, `createFormBlock`, `createFormField`.

**Produces:** Every loaded web draft is normalized in memory; a saved new block is appended after all blocks and a new field starts at full width.

- [ ] **Step 1: Write failing integration tests.**

  Update the initial editor test to expect only `Создать блок` and no existing-block insertion. Add a test whose mocked layout contains a narrow/crooked section; create or move a block and assert the first PATCH sends:

  ```ts
  form_layout: expect.objectContaining({
    sections: expect.arrayContaining([
      expect.objectContaining({ block_id: "block-1", row: 1, column: 1, row_span: 1, column_span: 12 }),
      expect.objectContaining({ block_id: "block-created", row: 2, column: 1, row_span: 1, column_span: 12 }),
    ]),
  }),
  ```

  Add a field-create test that saves the temporary field and asserts its layout item has `{ row: 1, column: 1, row_span: 1, column_span: 12 }` when the block has room, and that its inline editor is not constrained to a quarter-column item.

- [ ] **Step 2: Run the focused integration test and confirm it fails.**

  Run: `pnpm --dir frontend test:run src/features/registry/CardPrintTemplateEditor.test.tsx`

  Expected: FAIL on old quarter-width creation expectations and absent normalized PATCH geometry.

- [ ] **Step 3: Normalize only the web draft at the studio boundary.**

  Import `normalizeWebBlockSections`. Make `mergeExternalStructure` (or the `initialDraft` path immediately after it) rebuild only `form_layout`:

  ```ts
  const merged = mergeExternalStructure(initialLayout, blocks, fields);
  return {
    ...merged,
    form_layout: normalizeWebBlockSections(merged.form_layout),
  };
  ```

  Apply the same normalization when receiving a fresh server layout during conflict review or schema structure merge, so all subsequent existing save paths persist the normalized draft. Do not call a save on initial render.

  Delete `InsertBlockDialogState`, `insertDialog`, `openInsertBlock`, `insertExistingBlock`, and the matching dialog markup. Change `startCreateBlock` to calculate no grid cell and append a temporary section after `draftLayout.form_layout.sections`, then normalize the resulting form layout before setting it.

- [ ] **Step 4: Make the field position helper full width.**

  Replace quarter-column search in `firstEmptyFieldPosition` with a complete-row check that can append past the old four-row editor grid:

  ```ts
  function firstEmptyFieldPosition(items: CardTemplateFormLayoutRead["sections"][number]["items"]) {
    const lastOccupiedRow = items.reduce(
      (last, item) => Math.max(last, item.row + item.row_span - 1),
      0,
    );
    for (let row = 1; row <= lastOccupiedRow + 1; row += 1) {
      const collides = items.some((item) => row < item.row + item.row_span && row + 1 > item.row);
      if (!collides) return { row, column: 1, row_span: 1 as const, column_span: 12 as const };
    }
    return { row: lastOccupiedRow + 1, column: 1, row_span: 1 as const, column_span: 12 as const };
  }
  ```

  Pass `onCreateBlock={startCreateBlock}` to `CardLayoutRenderer` and remove its former `onInsertBlock` prop.

- [ ] **Step 5: Run Task 2 checks and commit.**

  Run:

  ```powershell
  pnpm --dir frontend test:run src/features/registry/CardPrintTemplateEditor.test.tsx
  pnpm --dir frontend typecheck
  ```

  Expected: all `CardPrintTemplateEditor` tests pass and no TypeScript errors.

  ```powershell
  git add frontend/src/features/registry/print/CardLayoutStudio.tsx frontend/src/features/registry/CardPrintTemplateEditor.test.tsx
  git commit -m "feat: default template fields to full width"
  ```

### Task 3: Place opened-template commands in the expanded template card

**Files:**
- Modify: `frontend/src/features/registry/print/CardLayoutStudio.tsx`
- Modify: `frontend/src/features/registry/RegistriesAndSchema.tsx`
- Modify: `frontend/src/features/registry/CardPrintTemplateEditor.test.tsx`
- Modify: `frontend/src/styles/globals.css`

**Consumes:** the selected-template state and `closeTemplateEditor`, existing studio command handlers `undoGeometryChange`, `generate`, `downloadLast`, and `onClose`.

**Produces:** The selected template card itself owns the visible `Отменить`, `DOCX`, `PDF`, `Скачать` (when generated), and `Закрыть` commands; the studio header retains only the save status.

- [ ] **Step 1: Write failing command-location tests.**

  Render `RegistriesAndSchema`, open one template, and locate the selected `.card-template-card`. Assert the command buttons are descendants of that card and not descendants of `.card-layout-studio-header`:

  ```ts
  const selected = container.querySelector(".card-template-card.is-selected");
  expect(within(selected as HTMLElement).getByRole("button", { name: "DOCX" })).toBeInTheDocument();
  expect(within(selected as HTMLElement).getByRole("button", { name: "PDF" })).toBeInTheDocument();
  expect(within(selected as HTMLElement).getByRole("button", { name: "Закрыть" })).toBeInTheDocument();
  expect(container.querySelector(".card-layout-studio-header .row-actions")).toBeNull();
  ```

  Keep the existing document generation test and verify clicking the portaled `DOCX` and `PDF` still reaches the same mock endpoints. Add an undo assertion after a geometry change to keep `Отменить изменение` operational from the card host.

- [ ] **Step 2: Run the test and confirm it fails before moving actions.**

  Run: `pnpm --dir frontend test:run src/features/registry/CardPrintTemplateEditor.test.tsx`

  Expected: FAIL because commands are currently inside `.card-layout-studio-header` and the selected article does not contain the studio.

- [ ] **Step 3: Add a safe portal target and relocate the selected editor.**

  In `CardLayoutStudio.tsx`, add optional `actionPortalTarget?: HTMLElement | null` and import `createPortal` from `react-dom`. Build the existing toolbar once, including the conditional `Скачать` action, then render it in the target when present:

  ```tsx
  const commandToolbar = <div className="row-actions" role="toolbar" aria-label="Действия макета карточки">…</div>;

  {actionPortalTarget ? createPortal(commandToolbar, actionPortalTarget) : commandToolbar}
  ```

  Keep the studio header's name/status container but do not leave an additional toolbar there when the portal target exists.

  In `RegistriesAndSchema.tsx`, keep an `HTMLElement | null` state for the selected action host. Render the selected `CardLayoutStudio` inside the selected template article after the card header, add a `div` with `ref={setTemplateActionHost}` in that header's actions area, pass it as `actionPortalTarget`, and stop click/key event propagation from the embedded editor so using tabs and fields does not re-open the card.

  Ensure a new selected template clears the old host before the new child mounts. `onClose` continues to call `closeTemplateEditor`, so closing still collapses the selected card.

- [ ] **Step 4: Add compact styling without altering A4 presentation.**

  In `globals.css`, add a scoped layout rule such as:

  ```css
  .card-template-card .schema-template-editor {
    grid-column: 1 / -1;
  }

  .card-template-card-header .card-template-editor-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 8px;
  }
  ```

  Retain the existing responsive header rules and add the new host selector to their wrapping rule if necessary. Do not alter `.a4-linked-card-renderer` selectors.

- [ ] **Step 5: Run all frontend quality gates and commit.**

  Run:

  ```powershell
  pnpm --dir frontend test:run src/features/cardLayout/blockOrdering.test.ts src/features/cardLayout/CardLayoutRenderer.test.tsx src/features/registry/CardPrintTemplateEditor.test.tsx
  pnpm --dir frontend lint
  pnpm --dir frontend typecheck
  pnpm --dir frontend build
  powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote
  ```

  Expected: focused tests, ESLint, TypeScript, and Vite build pass. Record any pre-existing broad-check failure separately from this change.

  ```powershell
  git add frontend/src/features/registry/print/CardLayoutStudio.tsx frontend/src/features/registry/RegistriesAndSchema.tsx frontend/src/features/registry/CardPrintTemplateEditor.test.tsx frontend/src/styles/globals.css
  git commit -m "feat: embed template layout actions in template card"
  ```

### Task 4: Release verification and production proof

**Files:**
- Modify: `PLANS.md`

**Consumes:** committed Tasks 1–3 and the configured deployment scripts.

**Produces:** a release record with local checks, deployed frontend evidence, and a browser proof that does not seed or alter the user-requested clean production data.

- [ ] **Step 1: Update the active plan record.**

  Add a short checkpoint to `PLANS.md` describing full-width sequential web blocks, bottom-only block creation, full-width new fields, and selected-template command placement. State explicitly that A4 geometry and existing cards are unaffected.

- [ ] **Step 2: Push and deploy the verified `main` commits.**

  Run:

  ```powershell
  powershell -ExecutionPolicy Bypass -File scripts/push-git.ps1 -Message "feat: normalize card template layout"
  powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1
  powershell -ExecutionPolicy Bypass -File scripts/deploy-frontend.ps1
  ```

  Expected: GitHub push succeeds, server checkout fast-forwards to `main`, service health and same-origin frontend/API smoke checks pass.

- [ ] **Step 3: Browser proof without creating production data.**

  Open the existing authenticated browser session, hard reload the deployed UI with a cache-busting query, and navigate to `Реестры → Схема карточки`. Confirm the empty production state remains intact. If no template exists, do not create one; record that the focused automated component tests cover interactive creation and command placement while the clean live state proves the deployed bundle loads without console errors.

- [ ] **Step 4: Commit the release record.**

  ```powershell
  git add PLANS.md
  git commit -m "docs: record normalized template layout release"
  powershell -ExecutionPolicy Bypass -File scripts/push-git.ps1 -Message "docs: record normalized template layout release"
  ```

## Self-Review

- **Spec coverage:** Task 1 covers full-width sequential blocks, no resize, ordering-only movement, bottom creation, and removal of existing-block insertion. Task 2 covers draft-only normalization and full-width new fields without overlap when an existing block exceeds four rows. Task 3 covers command relocation while retaining status and all existing handlers. Task 4 covers scope boundaries, deployment, and no-data browser proof.
- **Placeholder scan:** This plan contains no deferred implementation markers or generic testing instructions; every code-changing step names files, APIs, assertions, and commands.
- **Type consistency:** `normalizeWebBlockSections` consumes and returns `CardTemplateFormLayoutRead`; `CardLayoutStudioProps.actionPortalTarget` is `HTMLElement | null`; canvas creation is `() => void` after Task 1 and Task 2 passes a matching callback.
