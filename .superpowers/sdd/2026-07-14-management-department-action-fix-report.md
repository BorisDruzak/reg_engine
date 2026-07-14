# Management child-department action fix

## Scope

- Added a contextual `Добавить отдел` action to an expanded management node.
- The action uses local `OrganizationUnitsPanel` state to open a department create form with the selected management ID as `parentId`.
- The existing organization-card management and root-department actions are unchanged.

## TDD evidence

- RED: the focused component suite failed because the expanded management did not contain `Добавить отдел`.
- GREEN: the new regression opens the management, invokes its local action, submits a department, and verifies the POST body contains `unit_type: "department"` and `parent_id: "unit-education"`.

## Verification

- `pnpm --dir frontend test:run OrganizationsTable.test.tsx` — 15 passed.
- `pnpm --dir frontend typecheck` — passed.
- `git diff --check` — passed.

## Notes

- No deployment, migration, remote operation, or production-data action was performed.
