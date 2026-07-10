# Card Status And Layout UX Polish Design

## Context

The current card workspace exposes a manual `Активировать карточку` action,
while the real product distinction is whether all mandatory card data is
complete. The contextual layout studio also exposes separate field edit/move
buttons, reserves four full visual rows inside every web block, places field
creation in the block header, and leaves print-layout controls on top of the A4
canvas.

This design applies the seven approved browser comments without changing the
schema-driven card model, backend RBAC boundary, saved 12-by-4 form geometry,
or A4 millimeter geometry.

## Goals

1. Derive persisted card lifecycle status from mandatory-field completeness.
2. Keep `Отправить на заполнение` available for both drafts and active cards,
   without changing lifecycle status when a link is sent or created.
3. Make web blocks visually compact while preserving saved layout geometry.
4. Make direct field interaction mouse-first: click to edit, drag the field to
   move it, and drag its border to resize it.
5. Move field creation to the bottom of its block.
6. Remove the linked-card inner-layout button from the A4 page.
7. Replace the wide A4 element toolbar with a compact disclosure list.

## Non-Goals

- No hardcoded business or employee fields.
- No physical deletion or new archive behavior.
- No new database table or Alembic migration is expected.
- No change to backend access-control rules.
- No change to the saved 12-column by four-row form-layout contract.
- No change to A4 millimeter geometry, DOCX/PDF generation, or linked-layout
  expansion.
- No removal of the existing send-for-filling or public-link workflows.

## Chosen Approach

Use a backend-owned, materialized lifecycle status. A centralized completeness
helper will reuse the current required-field rules and persist `draft` or
`active` whenever card data that affects completeness changes. Frontend-only
calculation is rejected because API, reports, filters, imports, public links,
and MCP would disagree. Read-time-only calculation is rejected because the
stored lifecycle, audit history, and existing queries would remain stale.

## Automatic Card Lifecycle

### Completeness rule

- Active `required` and `required_on_publish` fields are mandatory.
- If every mandatory field in the card template has a non-empty valid value,
  the card lifecycle is `active`.
- If at least one mandatory field is empty, the lifecycle is `draft`.
- A template with no mandatory fields produces an active card immediately.
- Archived and superseded cards keep their terminal lifecycle and are not
  reopened by completeness synchronization.

### Synchronization boundaries

The backend will synchronize completeness after:

- card creation, after template defaults have been applied;
- authenticated single-field and bulk-field writes;
- public-link field writes;
- import commits that create or update card values;
- repeatable block-instance creation or archive when required values can be
  introduced or removed.

The same helper will be the only place that maps completeness to lifecycle
status. A real status transition is persisted in the same transaction and is
included in audit evidence. No separate activation endpoint or frontend
activation mutation is required.

Schema changes that alter requiredness, active fields, or template membership
must use the same synchronization helper for affected non-terminal cards so an
existing active card cannot remain active after a newly mandatory field becomes
empty.

### Send-for-filling behavior

- `Отправить на заполнение` remains visible for manageable `draft` and `active`
  cards.
- Sending or creating the filling link is lifecycle-neutral.
- An active card remains active when sent.
- A draft remains a draft when sent.
- Later confirmed field writes may independently change the status through the
  completeness rule.

### Frontend lifecycle UI

- Remove `Активировать карточку` from the action panel.
- Remove the dedicated activation mutation and related pending state.
- Refresh card/list queries after value saves so automatic transitions become
  visible immediately.
- Keep existing Russian lifecycle labels and status filtering.

## Adaptive Web Block Rendering

Saved block and field rectangles remain unchanged. Web rendering calculates the
last occupied internal field row for each block and renders only that many
visible internal rows, with at least one row for an empty block. The block uses
content alignment instead of stretching to fill its full reserved outer grid
area.

This compact behavior applies to design, preview, readonly card, block edit,
and public edit web surfaces. The linked A4 renderer explicitly disables the
compact web-height projection so print geometry remains exact.

The resulting block boundary surrounds its title, fields, and footer action;
unused logical placement space may remain outside the block, but the block
itself no longer appears as a large half-empty panel.

## Field Creation Placement

`Создать поле` moves from `card-layout-block-header` into a dedicated footer
after the field grid. It remains contextual to the block, keeps its current
accessible name `Создать поле в блоке <название>`, and opens the existing inline
field editor. Block editing stays in the header.

## Direct Field Interaction

### Click and keyboard edit

- Remove the visible `Изменить` button.
- A normal click on the field surface opens the existing inline field editor.
- A focused field opens the editor with Enter or Space.
- Semantic editing continues to hide geometry affordances and owns the draft
  until save or cancel.

### Move gesture

- Remove the visible `⠿` field move button.
- Pointer down on a non-control part of the field starts a pending move gesture.
- Movement of at least 6 CSS pixels starts pointer capture and geometry preview.
- Pointer release without crossing the threshold is treated as a click and
  opens editing.
- Pointer release after a valid drag commits one geometry command through the
  existing revision-safe save queue.
- Invalid geometry keeps the existing Russian boundary/collision feedback and
  can be cancelled without a write.
- Arrow keys move the focused field; Shift plus arrows resize it.

### Resize gesture

- All four edges and four corners expose unobtrusive resize hit zones.
- The zones become visually discoverable on field hover, focus, or active
  geometry interaction; they do not render as ordinary action buttons.
- Each zone retains an accessible Russian label.
- Resizing continues to use the existing pointer-capture, validation, preview,
  undo, redo, cancel, and revision-safe commit paths.

## A4 Surface Cleanup

### Linked card button

Remove `Редактировать внутренний макет` from the linked `card_layout` element.
Users return to `Макет карточки` through the existing stage navigation. Moving
and resizing the enclosing linked-card rectangle remain available.

### Print-element list

Replace the always-expanded horizontal `Печатные элементы A4` toolbar with a
compact disclosure control labelled `Добавить печатный элемент`. When open, it
shows a vertical list containing the existing actions for heading, print text,
panel, rectangle, line, print date, page number, and card name. Choosing an item
uses the current add callback and closes the list. Disabled/busy behavior and
Russian accessible labels remain intact.

## Error Handling And Consistency

- Backend lifecycle synchronization is transactional with the triggering card
  mutation; a failed status update rolls back the whole write.
- Status transitions are backend-owned and cannot be bypassed by frontend,
  public-link, import, or MCP callers.
- Layout drag/resize failures keep the newest local draft and existing conflict
  recovery behavior.
- Click-to-edit must never fire after a completed drag or resize.
- A4 controls must not cover or change the printable page contents.

## Testing Strategy

### Backend

- Card with no mandatory fields is active after creation.
- Card with an empty mandatory field is draft after creation.
- Template defaults that complete all mandatory fields create an active card.
- Filling the final mandatory value changes draft to active.
- Clearing a `required_on_publish` value changes active to draft.
- Public-link, import, and repeatable-block writes use the same rule.
- Send-for-filling does not change an active or draft lifecycle.
- Every automatic transition has audit evidence.
- Archived and superseded cards are not reopened.

### Frontend components

- No activation button or activation mutation remains.
- Send-for-filling is available for active and draft manageable cards.
- Web block height follows the last occupied field row.
- `Создать поле` appears after existing fields.
- No visible field edit or move buttons remain.
- Click and keyboard open the field editor.
- Dragging the field surface moves it; a no-move pointer sequence edits it.
- Edge/corner zones resize with existing validation and commit behavior.
- The A4 linked-card inner-layout button is absent.
- The A4 print actions are exposed through the vertical disclosure list.

### Live Browser QA

Verify the deployed flow at desktop width and at 420 px:

1. Create an incomplete card and confirm `Черновик` with no activation action.
2. Send both a draft and an active card for filling and confirm status does not
   change.
3. Fill the final mandatory value and confirm the card becomes active.
4. Open the layout studio, click a field to edit, drag its body to move, and
   resize from an edge.
5. Confirm compact blocks, bottom field creation, the removed A4 inner-layout
   button, and the print-element disclosure list.
6. Confirm page identity, no framework overlay, no relevant console errors,
   no horizontal overflow, and successful target interactions.
