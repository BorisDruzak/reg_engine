# Embedded unit actions and inline unit editing

## Goal

Remove the redundant unit-panel header and make organization and unit editing
consistent: actions belong to the organization card and names edit in place.

## Organization card

- The top action row contains `Добавить подведомственную организацию`,
  `Добавить управление`, and `Добавить отдел`.
- The `Подразделения: {organization}` heading and `Закрыть` button are removed.
- A card closes only when its organization row is clicked again or another
  organization row is opened.

## Unit rows

- Clicking a management or department name enters inline name editing.
- Editing shows `Сохранить`, `Отмена`, and confirmed `В архив` only for that
  row. Controls do not toggle a management expansion.
- Clicking the non-control area of a management row toggles its departments.
- Existing soft archive, parent validation, audit, and option history are not
  changed.

## Tests

- Cover action placement, absence of header/close UI, card toggle behavior,
  unit inline edit/cancel/save/archive visibility, and management toggle
  propagation isolation.
