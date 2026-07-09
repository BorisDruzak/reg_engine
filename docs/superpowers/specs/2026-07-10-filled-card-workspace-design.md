# Filled Card Workspace Design

## Goal

Render a completed card as a clear schema-driven document that exactly follows
the configured card-template block and field geometry, while allowing one block
at a time to be edited directly in place.

## Approved Read View

The selected card opens in read view, not as a mass-edit form.

- the header shows the card display name, lifecycle status, template,
  organization, registry, completion count, public-link state, and update time;
- primary card actions such as PDF/DOCX download and
  `Отправить на заполнение` stay in the card header;
- there is no global `Редактировать` action;
- every editable block exposes only `Изменить блок`;
- blocks use the same top-level 12-by-4 geometry as the template;
- fields use the same nested geometry as the template;
- dimension labels are hidden in the ordinary read view; an administrator-only
  layout diagnostic overlay may show them when troubleshooting;
- empty values render as `Не заполнено`, not as empty input controls;
- references, choices, dates, booleans, files, and static text keep their
  existing Russian display behavior.

The renderer is generic. It must not infer or add business-specific fields.

## In-Block Editing

Clicking `Изменить блок` changes only that block from read mode to edit mode.
Each value is replaced by its existing type-specific control in the same field
cell. No editor appears below the card and no page-level edit mode is entered.

The block header changes to `Сохранить` and `Отмена` while editing:

- `Сохранить` validates and applies the block's editable ordinary fields;
- `Отмена` restores values loaded when the block editor opened;
- clicking another block or empty card space with unsaved changes opens a small
  `Сохранить / Не сохранять / Продолжить редактирование` decision instead of
  losing data;
- only one block editor may be open at a time;
- successful save returns the same block to read mode and preserves focus.

Existing field behavior remains authoritative:

- `text`, `number`, dates, booleans, select, multi-select, JSON, and reference
  fields reuse the current controls and coercion rules;
- `static_text` remains read-only;
- `file_ref` remains in the existing attachment-aware single-field workflow and
  is not added to a competing bulk-save surface;
- repeatable block instances retain their existing add/archive behavior;
- fields the actor cannot edit stay read-only even while their block is open.

## Rendering Architecture

Create a shared schema-driven card-layout renderer with explicit modes:

- `readonly` for the completed internal card;
- `block-edit` for one internal block;
- `public-edit` for the public form;
- `preview` for template/A4 design previews.

The renderer consumes `CardTemplateLayoutRead`, card values, block instances,
field permissions, and a selected block-instance id. It emits layout and field
events but does not own API mutations.

`CardsWorkspace` retains card tabs and card-level actions but delegates the
field surface to the shared renderer. Block-edit state and mutations live in a
focused card feature hook so card attachments, documents, public links, and
history remain independent tabs/workflows.

## Data Loading and Permissions

- load the selected card, its template layout, visible field values, and
  reference options for visible fields;
- do not load unrelated admin-only users, roles, grants, or audit data for the
  field view;
- enforce every read and edit permission on the backend;
- use frontend permission flags only to hide or disable unavailable actions;
- preserve the existing rule that scoped users can work with allowed cards
  without unrelated global 403 banners.

## Error and Save Behavior

- validation errors stay inside the affected field cell in Russian;
- a failed block save leaves the editor open with the user's draft intact;
- partial success is not shown as a successful block save;
- reference and attachment failures do not expose storage paths or backend
  internals;
- stale card data produces a conflict message with reload/review guidance;
- successful create/update/archive actions continue to write audit events.

## Responsive and Accessible Behavior

On desktop, read and edit modes preserve the exact configured composition. On
narrow screens, the renderer reflows blocks and fields in logical row-major
order without horizontal scrolling. The active block remains visually and
semantically identified.

Every `Изменить блок`, `Сохранить`, and `Отмена` action is keyboard reachable;
labels remain associated with their controls; focus moves into the first
editable field when a block opens and returns to the block action after close.

## Testing and Acceptance

Frontend tests cover exact template geometry in read mode, absence of a global
edit button, one-block-at-a-time editing, type-specific controls, block save and
cancel, click-away protection, permission-readonly fields, repeatable blocks,
`static_text`, and attachment-aware `file_ref` behavior.

Backend/API tests cover block-scoped value validation, permission denial,
atomic error reporting for the block save boundary, old-card/new-field empty
rendering, and audit events.

Browser acceptance verifies:

- the completed card visually matches its configured template;
- `Изменить блок` edits values inside the block rather than below the card;
- save/cancel and validation feedback work;
- mobile reflow has no clipping, overlap, or horizontal scroll;
- no relevant console errors occur.
