# Organization cards and hierarchy-aware unit picker

## Goal

Make the Organizations workspace a compact expandable hierarchy: each
organization row opens its own inline card, which contains the organization
actions and its internal management/department tree. Improve `org_unit_ref`
fields so users can search and choose either a management or a department from
the current card organization using a hierarchy-aware result list.

## Organization tree

- Rows show the organization name, active/archive status, and expand indicator;
  technical codes and row action buttons are not visible.
- Clicking a row opens or closes that organization's inline card. Clicking a
  child organization behaves the same, so the existing organization hierarchy
  remains independently navigable.
- Clicking the organization name enters inline name editing. Only while
  editing are `Сохранить`, `Отмена`, and the confirmed dangerous `В архив`
  action shown. These controls do not toggle the containing row.
- The inline card contains `Добавить отдел`, `Добавить управление`, and
  `Добавить подведомственную организацию`. The last action preselects the
  current organization as parent.
- The card presents an expandable internal unit tree. Managements are roots;
  their departments are nested children; standalone departments are roots.
  Each expanded management offers `Добавить отдел`, which creates a department
  with that management as its parent.
- Existing backend hierarchy, archive, audit, and permission rules remain the
  sole source of truth. The UI makes no RBAC inference and does not expose
  organization technical codes.

## Unit-reference field picker

- The user-facing field type remains `Подразделение организации` and is always
  resolved from the current card organization, never a fixed template
  organization.
- Admin and public editors render a searchable combobox rather than a plain
  select. Filtering matches management and department names.
- Unfiltered results show managements with their departments indented beneath
  them, plus standalone departments. Either level is selectable.
- Results come only from the authenticated card option endpoint or the safe
  public preview payload respectively. No generic public unit API is added.
- Historical archived selected values remain readable and marked archived; they
  cannot be selected as a new value. Backend validation remains authoritative.

## Testing

- Add component tests for row/card expansion, inline organization edit,
  nested add actions, organization-child expansion, and unit-tree expansion.
- Add picker tests for searching, hierarchy presentation, selecting a
  management or department, and disabled archived values in both admin and
  public editors.
- Preserve focused backend option/authentication regression tests and perform
  browser acceptance with disposable organization data only.

## Scope boundaries

- No technical codes in the organization tree or organization card.
- No new database tables, unit types, or access scopes.
- No physical deletion; archive behavior is unchanged.
