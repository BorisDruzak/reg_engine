# Normalized template layout — Task 1 report

Date: 2026-07-14

## Scope

Implemented Task 1 of the normalized template-layout plan. The change is
limited to frontend web-block normalization, canvas interaction, focused tests,
and the one approved type-safety handoff at the `CardLayoutStudio` call site.
It does not change REST API, database, A4 layout, or existing-card rendering.

## Files changed

- `frontend/src/features/cardLayout/blockOrdering.ts`
  - Adds `normalizeWebBlockSections` and makes adjacent block reorder use the
    same full-width sequential mapping.
- `frontend/src/features/cardLayout/blockOrdering.test.ts`
  - Replaces geometry-preservation expectations with crooked-layout
    normalization and normalized-reorder coverage.
- `frontend/src/features/cardLayout/CardWebLayoutCanvas.tsx`
  - Removes insertion UI and empty-cell placement, creates blocks from one
    bottom action, and supplies a deterministic full-width appended position.
- `frontend/src/features/cardLayout/CardBlockLayoutNode.tsx`
  - Suppresses block diagnostics, dimension badges, and resize handles in web
    design mode while keeping field geometry support.
- `frontend/src/features/cardLayout/CardLayoutRenderer.test.tsx`
  - Covers bottom-only creation, no insertion/empty cell/block resize UI, the
    deterministic callback position, and caller-normalized visual rows.
- `frontend/src/styles/globals.css`
  - Replaces empty-cell styling and its responsive selector with the bottom
    block-create footer.
- `frontend/src/features/registry/print/CardLayoutStudio.tsx`
  - Deletes only the now-invalid `onInsertBlock` JSX prop, under the explicit
    parent-approved cross-task exception required for TypeScript safety.

## TDD evidence

### RED

Command:

```text
pnpm --dir frontend test:run src/features/cardLayout/blockOrdering.test.ts
```

Observed result: 3 of 5 tests failed as expected. The new export was missing
(`TypeError: normalizeWebBlockSections is not a function`), and existing
reorder behavior retained the source widths/heights and clamped column 9
instead of normalizing to column 1 / width 12.

After adding canvas expectations, the focused renderer run also failed as
expected: the old create button had the accessible name
`Создать блок в этой области`, and design mode still exposed the block geometry
diagnostic.

### GREEN

Command:

```text
pnpm --dir frontend test:run src/features/cardLayout/blockOrdering.test.ts src/features/cardLayout/CardLayoutRenderer.test.tsx
```

Observed result: 2 test files passed, 70 tests passed.

TypeScript command:

```text
pnpm --dir frontend typecheck
```

Observed result: passed with no errors.

`git diff --check` also passed with no whitespace errors.

## Self-review

- The normalizer sorts with the existing stable comparator and preserves every
  section's `items`; only outer section row/column/spans change.
- Reorder preserves unknown-ID and edge-move `null` behavior, then maps the
  swapped visual order to rows 1..N at full width.
- The design canvas has exactly one block-create control below the canvas;
  insertion text, empty-area test ID, and responsive empty-area selector are
  removed.
- The create callback receives `{ row: max(row + row_span), column: 1,
  row_span: 1, column_span: 12 }`, so the current consumer remains safe while
  Task 2 moves it to a parameter-free callback.
- Web design mode removes block resize affordances without removing the field
  resize affordances or non-design geometry behavior.
- No API, database, archive, A4, or production-data code changed.

## Commit

Planned commit subject: `feat: normalize web template blocks`.

## Concerns and Task 2 handoff

- Task 1 intentionally retains `CardLayoutCreatePosition` as an internal
  callback parameter because the existing `CardLayoutStudio.startCreateBlock`
  consumer is scheduled for refactoring in Task 2. Its span is now full width.
- The obsolete insert-dialog state, `openInsertBlock`, and `insertExistingBlock`
  remain in `CardLayoutStudio` for Task 2 cleanup. The only Task-1 exception
  was removal of the invalid `onInsertBlock={openInsertBlock}` prop so this
  commit typechecks.
- No deployment, browser proof, migration, push, or production data mutation
  was performed for this isolated task.
