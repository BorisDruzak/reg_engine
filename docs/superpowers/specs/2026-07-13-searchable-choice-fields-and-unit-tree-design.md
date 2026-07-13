# Searchable choice fields and unit-tree polish

## Goal

Use one searchable, controlled choice surface for every card field whose value
must be selected from supplied options, and simplify organization-unit actions
and expansion.

## Searchable choice fields

- `select`, `multi_select`, reference-list selects, and `org_unit_ref` use the
  same popup search component in administrator and public editors.
- Users can search only among server-supplied options. Text that does not
  match an option is never persisted; the empty result message is
  `Ничего не найдено`.
- Single select closes after selecting one option. Multi-select stays open,
  toggles checked options, and renders selected values as chips in the field.
- Unit options retain management/department nesting and allow either level.
  Historical archived values remain visible but disabled.

## Organization unit tree

- The organization card toolbar offers both `Добавить управление` and
  `Добавить отдел`; the latter creates a standalone root department.
- Unit technical codes are not displayed.
- Clicking the management row expands or collapses its department list. The
  separate expand button is removed; edit/archive controls must not toggle the
  management row.

## Boundaries and tests

- Existing backend validation, public-preview scoping, option IDs, audit, and
  archive rules are unchanged.
- Tests cover no-free-text behavior, search/filtering, single/multi selection,
  archived disabled values, standalone department add, management-row toggle,
  and propagation isolation.
