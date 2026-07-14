# Normalized template layout — Task 2 report

Date: 2026-07-14

## Scope

Completed only Task 2 on top of reviewed Task 1 commit `ee9f906a`.

- Preserved Task 1's parameter-free block creation and normalized studio draft
  boundary.
- Removed the unused existing-block insertion dialog, state, callbacks, and
  unused-block selector from `CardLayoutStudio`.
- Changed new web fields to occupy the first entirely unoccupied logical row
  at full width. The search no longer stops at row four, so a field appends
  after rows already occupied by prior fields.
- Added editor integration coverage for a first-row full-width inline field
  and for appending after four occupied rows.

No A4, API, database, archive, migration, or deployment behavior changed.

## Files changed

- `frontend/src/features/registry/print/CardLayoutStudio.tsx`
  - Removes the retained insert-dialog implementation and related dead state.
  - Replaces quarter-column field placement with complete-row, full-width
    placement that can extend beyond four rows.
- `frontend/src/features/registry/CardPrintTemplateEditor.test.tsx`
  - Verifies the temporary field editor is rendered at full width and the
    persisted item is `{ row: 1, column: 1, row_span: 1, column_span: 12 }`
    for an empty field layout.
  - Adds an occupied-row mock and verifies a new field persists at row 5.

## TDD evidence

### RED

Command:

```text
pnpm --dir frontend test:run src/features/registry/CardPrintTemplateEditor.test.tsx
```

Observed result: 2 expected failures out of 33 tests before the studio change.
The inline field node was not full width, and after four full-width occupied
rows the created field was still placed at row 4, column 10 with span 3.

### GREEN

Command:

```text
pnpm --dir frontend test:run src/features/registry/CardPrintTemplateEditor.test.tsx
```

Observed result: 1 test file passed, 33 tests passed.

TypeScript command:

```text
pnpm --dir frontend typecheck
```

Observed result: passed with no errors. `git diff --check` passed and a source
search found no retained insert-dialog identifiers.

## Self-review

- A complete-row occupancy check means a new 12-column field never overlaps a
  pre-existing field occupying any part of that row.
- The row scan reaches `lastOccupiedRow + 1`, so layouts with more than four
  field rows remain writable without clamping or overlap.
- Task 1 normalization remains in `mergeExternalStructure`, covering initial
  and conflict-reviewed server layouts without triggering an initial PATCH.
- No temporary insert-dialog UI, callback, state, or selector remains in the
  studio.

## Concerns

- Verification is local and focused: no deployment, browser proof, push, or
  production-data operation was performed.
