# Normalized template layout — Task 3 report

Date: 2026-07-14

## Scope

Completed Task 3 on top of `ed421728`.

- Moved the opened-template command toolbar into the selected template card
  with an optional React portal target.
- Kept the studio header's template name and save status, without a duplicate
  toolbar when a card host is present.
- Preserved the exact undo, DOCX, PDF, conditional download, and close
  handlers and disabled conditions.
- Moved the selected template editor under its selected card and removed the
  former separate editor section.
- Kept template archive and inline rename behavior; stopped card-open event
  propagation from the embedded editor and its command host.
- Added only scoped template-card CSS; A4 selectors are unchanged.

No API, database, archive semantics, A4 behavior, deployment, or production
data changed.

## Files changed

- `frontend/src/features/registry/print/CardLayoutStudio.tsx`
  - Adds optional `actionPortalTarget` and renders the existing command toolbar
    there with `createPortal` when supplied.
- `frontend/src/features/registry/RegistriesAndSchema.tsx`
  - Creates and clears the selected card's action host, embeds the selected
    editor in that card, and passes the host to the studio.
- `frontend/src/features/registry/CardPrintTemplateEditor.test.tsx`
  - Verifies commands are descendants of the selected card, not the studio
    header; verifies portaled DOCX/PDF, undo, and close keep working.
- `frontend/src/styles/globals.css`
  - Adds scoped selected-card/editor and command-host layout rules.

## TDD evidence

### RED

```text
pnpm --dir frontend test:run src/features/registry/CardPrintTemplateEditor.test.tsx
```

Observed result: 1 expected failure out of 33 tests. The selected template card
contained only its archive action and could not find `DOCX`; the commands were
still in the external studio header.

### GREEN

```text
pnpm --dir frontend test:run src/features/registry/CardPrintTemplateEditor.test.tsx
```

Observed result: 1 test file passed, 33 tests passed.

## Verification

- Focused Task 1–3 Vitest command: 3 files, 103 tests passed.
- Frontend ESLint: no errors; one pre-existing exhaustive-deps warning in
  `frontend/src/features/cards/FilledCardLayout.tsx`.
- TypeScript: passed.
- Production frontend build: passed. Vite retained its pre-existing large main
  chunk advisory (`599.10 kB`, `170.21 kB` gzip).
- `git diff --check`: passed.
- `scripts/check.ps1 -SkipRemote`: reached backend Ruff format and failed only
  because the pre-existing, untouched `backend/tests/test_schema_constraints.py`
  would be reformatted. Frontend build/type/test evidence above passed after
  the local nullable-type correction.

## Self-review

- The toolbar JSX is built once; portal and non-portal rendering share all
  handlers and disabled predicates.
- The action host is reset before selecting a new template and on close, so a
  new studio instance does not retain a stale card target.
- The selected card's host and embedded editor both stop click/key propagation,
  preventing internal actions from re-triggering the card selection.
- The conditional `Скачать` action remains in the shared toolbar and appears
  only when `lastGenerated` exists.

## Concerns

- Verification is local only; no deployment, live browser proof, push, or
  production mutation was performed.
- The broad local check remains blocked by the unrelated backend formatting
  issue described above.
