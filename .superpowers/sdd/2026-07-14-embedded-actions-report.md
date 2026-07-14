# Task 1 report: embedded unit actions and inline editing

## Implemented scope

- Moved `Добавить управление` and `Добавить отдел` beside `Добавить подведомственную организацию` in the selected organization card.
- Removed the unit-panel heading, close control, and standalone unit toolbar.
- Made management and department names enter inline editing on click. Save, Cancel, and `В архив` appear only while that row is being edited.
- Preserved management expansion from its non-control row area; name, form, and archive controls stop propagation.

## TDD evidence

- RED: `pnpm -C frontend test:run src/features/organizations/OrganizationsTable.test.tsx` initially failed with 8 expected failures, including the retained panel heading and legacy unit actions.
- GREEN: the same focused suite passes with 9 tests.

## Verification

- `pnpm -C frontend test:run src/features/organizations/OrganizationsTable.test.tsx` — 9 passed.
- `pnpm -C frontend typecheck` — passed.
- `pnpm -C frontend lint` — no errors; retains the existing unrelated `FilledCardLayout.tsx` hook-dependency warning.
- Scoped Prettier check and `git diff --check` — passed.

No deployment or remote actions were performed.
