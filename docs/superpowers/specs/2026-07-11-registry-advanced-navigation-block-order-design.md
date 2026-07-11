# Registry Advanced Navigation and Block Ordering Design

## Goal

Simplify the registry workspace and card-template editor without changing the
registry data model, permissions, schema save API, field geometry behavior, or
document-generation workflows.

The change has four user-visible outcomes:

1. The primary registry navigation contains only `Схема карточки`,
   `Импорт и экспорт`, and `Расширенное`.
2. `Реестры`, `Справочники`, and `Отчёты` are available as secondary tabs
   inside `Расширенное`.
3. Card blocks are reordered with explicit up/down buttons instead of a drag
   handle, with collision-free atomic saving.
4. The duplicate template-editor header and the visible `Повторить` action are
   removed.

## Navigation

`RegistriesAndSchema` will keep two independent pieces of UI state:

- primary tab: `schema | importExport | advanced`;
- advanced tab: `registries | references | reports`.

`Схема карточки` is the default primary tab. Opening `Расширенное` shows the
last advanced tab selected during the current mounted session; its initial
value is `Реестры`.

The primary tab list contains:

1. `Схема карточки`;
2. `Импорт и экспорт`;
3. `Расширенное`.

The advanced panel contains a second `WorkspaceTabs` instance with:

1. `Реестры`;
2. `Справочники`;
3. `Отчёты`.

Existing panels, mutations, queries, RBAC checks, and validation remain owned
by their current components. This is a navigation/state rearrangement only;
moving a panel into `Расширенное` must not cause new global data loading or
weaken backend access checks.

## Template Editor Chrome

The outer `schema-template-editor-header` is removed. It currently repeats the
selected template name, technical code, and close action already represented
by the selected template card and `CardLayoutStudio`.

The surrounding editor region and its accessible name remain in place, so
assistive technology still receives `Редактор шаблона <название>`. The
`CardLayoutStudio` header remains the single visible editor header and keeps
its `Закрыть` action.

The visible `Повторить` button is removed from the studio toolbar. The
`Отменить` button, DOCX/PDF actions, optional download action, and `Закрыть`
remain. Existing internal redo data may remain as an implementation detail;
there is no public redo control in this scope.

## Block Ordering Controls

Block drag handles are removed only for layout sections (`targetKind = block`).
Field dragging and every existing field resize handle remain unchanged. The
block bottom-right resize handle also remains.

Each design-mode block displays two compact buttons in its header/action area:

- `Переместить блок <название> вверх` (`↑`);
- `Переместить блок <название> вниз` (`↓`).

The first block has its up button disabled. The last block has its down button
disabled. Both buttons are disabled while a layout/schema save is pending or a
layout conflict is active.

### Ordering algorithm

1. Sort sections by current visual row, then column, then stable section id.
2. Swap the selected section with the adjacent section in the requested
   direction.
3. Repack the ordered sections into consecutive vertical bands. Each section
   retains its `column`, `column_span`, and `row_span`; its column is clamped
   only if needed to stay inside the 12-column grid. Each following band starts
   after the previous section's bottom edge.
4. Validate the complete result with the existing grid-boundary and collision
   rules before updating the draft.

This deterministic packing guarantees that blocks do not overlap, even when
adjacent blocks have different heights or widths. Block dimensions are never
changed by an order action. Empty vertical gaps may be compacted as part of the
repack.

### Saving and undo

A block reorder is one atomic geometry-history entry containing the complete
form-layout state before and after the action. The draft changes immediately,
then uses the existing queued form-layout save path and revision/conflict
handling.

`Отменить` restores the complete previous block order in one action. A failed
save follows the existing layout-conflict UI and must not leave a partial block
swap on screen.

## Styling and Responsive Behavior

The nested advanced tabs reuse the existing `WorkspaceTabs` styling and may
wrap at narrow widths. They must not introduce horizontal page overflow.

Block order buttons use the existing ghost-button visual language but have a
compact square footprint. They remain keyboard-focusable and expose full
Russian accessible names; the arrow glyphs are presentation only.

Removing the outer template header closes the current empty vertical gap and
leaves one visible name/status header for the studio.

## Tests

Frontend tests will cover:

- only `Схема карточки`, `Импорт и экспорт`, and `Расширенное` appearing in the
  primary tab list;
- `Реестры`, `Справочники`, and `Отчёты` appearing inside the advanced tab
  list, including retained advanced selection;
- `Схема карточки` being the default primary tab;
- the duplicate outer template header and technical-code line being absent;
- the visible `Повторить изменение` control being absent while `Отменить`
  remains;
- block drag handles being absent and block up/down controls being present;
- disabled first/last boundary buttons;
- moving up and down across blocks with different spans while preserving every
  block dimension and producing no collisions;
- one queued save per reorder and one-step undo of the entire reorder;
- field dragging/resizing and block resizing retaining their current behavior;
- the relevant CSS contracts preventing overflow.

The full project gate remains `scripts/check.ps1 -SkipRemote`. After push and
deployment, live Browser verification will confirm the nested navigation,
single editor header, toolbar actions, arrow boundary states, one reversible
block reorder, zero overlaps, and zero console errors. The verification move
will be undone so the saved production layout is left unchanged.

## Non-goals

- No backend schema, database migration, or permission change.
- No change to registry/reference/report functionality beyond navigation.
- No change to field drag, field resize, or inline field/reference editing.
- No redesign of import/export, reporting, or document generation.
- No public redo action or new keyboard shortcut.
