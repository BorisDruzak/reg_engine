# Contextual Card Layout Studio Design

## Goal

Replace the current A4-dominated card-template workspace with a contextual,
mouse-first editor in which administrators compose the web card from movable
and resizable blocks and fields, then place that linked card layout into a
single-card A4 print form.

The design must stay schema-driven. It must not add fixed business or employee
fields, and it must preserve all existing field types and their behavior.

## Approved User Model

The user works through three explicit stages:

1. `Макет карточки` — compose blocks and fields on the web-card canvas.
2. `Печатная форма A4` — position and resize the linked card composition on an
   A4 page and add print-only decoration around it.
3. `Предпросмотр` — inspect the filled web card and the A4 result without edit
   controls.

The web layout is the source of truth for block and field composition. A4 does
not expose a second independent arrangement of those fields. It embeds the
linked composition as one object.

## Logical Geometry

The persisted web layout remains a logical grid, not DOM pixels:

- the canonical horizontal grid has 12 columns;
- visible quarter-width snap points map to `column_span` values `3`, `6`, `9`,
  and `12`;
- the canonical vertical grid has four quarter-height tracks;
- visible quarter-height snap points map to `row_span` values `1`, `2`, `3`,
  and `4`;
- block sections store `row`, `column`, `row_span`, and `column_span`;
- fields store the same geometry inside the selected block's nested 12-by-4
  grid;
- `row_span` defaults to `1` when reading existing layouts that do not contain
  it;
- new or converted geometry is clamped to the owning 12-by-4 grid and
  overlapping placements are rejected before save;
- legacy layouts whose stored rows extend beyond the four-track grid remain
  readable with an overflow warning and require explicit conversion before a
  new quarter-grid save.

One card layout is designed as one four-track composition intended to fit the
usable area of one A4 page. The editor warns before save when content cannot fit
its assigned block or when the linked A4 composition would overflow the page.
It never silently clips fields.

Responsive web rendering preserves logical order. Below the desktop breakpoint,
blocks reflow to one column and fields reflow in row-major order while retaining
their relative quarter spans as minimum layout intent; the desktop and print
renderers retain the exact configured composition.

## Contextual Editor States

### Nothing selected

Only the card canvas and local actions are visible. There is no persistent
palette or property sidebar.

- every block header contains a drag handle, `Создать поле`, `Изменить блок`,
  and a resize handle;
- empty canvas space contains `Создать блок` and
  `Вставить существующий блок`;
- an existing block is inserted with its existing fields and configuration;
- all create actions remain inside the area that will receive the new object.

### Size or position editing

Clicking or dragging a resize/move affordance hides semantic properties and
opens the geometry-focused state:

- blocks and fields move by mouse drag;
- all four edges and corners resize by mouse;
- both width and height snap to `1/4`, `1/2`, `3/4`, and `1`;
- collision and destination previews appear before drop;
- a dimension badge shows the current logical width and height;
- web-card and A4 previews update while the pointer moves;
- `Escape` restores the pre-interaction geometry;
- keyboard move/resize remains available as an accessibility fallback without
  adding visible complexity to the ordinary mouse workflow.

### Block editing

Clicking a block header opens the block editor inside that block. Other canvas
content remains visible but visually secondary.

The inline editor exposes only block semantics: title, repeat behavior,
visibility, public-link availability, collapsible behavior, and the fields
already contained by the block. Geometry controls are absent.

Clicking another object or empty space validates and saves the draft, then
closes the editor. If validation fails, the editor stays open, the invalid
control receives focus, and a Russian error appears next to it. `Escape`
discards the unsaved draft.

### Field creation and editing

`Создать поле` opens inside the owning block. Clicking an existing field opens
the same editor in edit mode.

The type chooser uses the complete existing backend type set:

- `text`, `number`, `date`, `datetime`, and `bool`;
- `select` and `multi_select` with existing reference-list behavior;
- `card_ref`, `user_ref`, `organization_ref`, `org_unit_ref`, and
  `registry_ref`;
- `file_ref` with the existing attachment-aware behavior;
- `json` and `static_text`.

The inline form exposes the existing label, technical code, description,
required mode, public-edit flag, options source, and type-specific configuration.
Technical and rare settings remain under `Ещё`. Switching to another object or
empty space uses the same validate-save-close behavior as block editing.

## Frontend Component Boundaries

The implementation should split the current large studio into focused units:

- `CardLayoutStudio` owns loading, save status, stage navigation, selection,
  undo/redo, and the unified layout contract;
- `CardWebLayoutCanvas` renders the 12-by-4 block grid and canvas-local create
  actions;
- `CardBlockLayoutNode` renders one block, its nested field grid, and block
  editing state;
- `CardFieldLayoutNode` renders one field and its inline field editor;
- `LayoutGeometrySession` owns pointer capture, move/resize math, collision
  checks, snapping, cancel, and preview geometry;
- `LayoutLivePreview` renders the filled web preview and linked A4 preview;
- `A4LinkedCardCanvas` edits the page-level linked-card object and print-only
  elements;
- a shared schema-driven renderer is reused by the studio preview, the filled
  card workspace, and the public form.

No visual component owns API calls or business rules. Mutations remain in
feature hooks/services and all authoritative validation remains in the backend.

## Unified Layout API

Extend `card_template_layout_v1` compatibly:

- add `row_span: int = 1` to form-layout sections and items;
- validate block and field `row`, `column`, `row_span`, and `column_span` against
  their owning grids;
- return Russian-safe validation codes/messages that the frontend can map
  without exposing backend internals;
- keep existing layouts readable by defaulting missing `row_span` values;
- preserve legacy `display_config_json` reads while making the unified
  `form_layout` contract the primary layout boundary.

The ordinary save endpoint remains
`PATCH /api/v1/card-templates/{template_id}/layout/form`. Saving is revision-safe:
the client sends the complete logical layout it loaded and the API rejects a
stale version instead of silently overwriting another administrator's changes.

## Linked A4 Representation

Extend normalized `card_print_layout_v1` with a linked item kind
`card_layout`:

- the item references the selected `card_template_id` and current
  `form_layout` source;
- its A4 geometry remains `x_mm`, `y_mm`, `width_mm`, and `height_mm`;
- mouse resize preserves the internal web composition and changes only the
  enclosing linked-card rectangle;
- DOCX/PDF generation expands the current form layout at generation time;
- headings, signatures, static print text, page numbers, logos, lines, and
  other print-only items remain independent A4 elements around the card;
- page validation rejects linked-card overflow and unreadably small scale.

Existing field-by-field A4 layouts continue to render and generate. The editor
offers an explicit `Преобразовать в связанный макет` action for a legacy print
view. Conversion creates a new version and never deletes the old version.

## Save, Error, and Recovery Behavior

- pointer movement is local until pointer-up;
- pointer-up creates one undoable layout command;
- semantic block/field edits save on validated click-away;
- network save failure leaves the local draft visible and marks it
  `Не сохранено` with `Повторить`;
- stale-layout conflicts require reload or explicit retry after reviewing the
  newer server version;
- invalid references, archived fields, overlap, overflow, and A4 scale errors
  prevent save and identify the affected object on the canvas;
- create/update/archive actions continue to write audit events;
- blocks, fields, print views, and templates remain soft-archived.

## Accessibility and Russian UI

- all user-facing copy is Russian-first;
- drag handles and resize handles have Russian accessible names;
- selection, move, resize, save, cancel, undo, and redo are keyboard reachable;
- focus returns to the edited block or field after inline editor close;
- color is not the only indicator for selection, collision, or validation;
- the visible product name remains `Реестровая система`.

## Testing and Acceptance

Backend tests cover defaulting legacy `row_span`, valid quarter geometry,
overlap and boundary rejection, nested field geometry, linked-card A4
normalization, legacy A4 compatibility, generation-time expansion, stale-save
conflicts, and audit writes.

Frontend tests cover:

- no permanent palette/property panel in the idle state;
- inline block and field creation/editing;
- the complete existing field-type list;
- click-away save, validation failure, and `Escape` cancel;
- block and field mouse move/resize with quarter snapping on both axes;
- web and A4 live preview updates;
- undo/redo and keyboard fallback;
- linked-card placement in the A4 stage;
- legacy print-view conversion without destructive overwrite.

Browser acceptance verifies desktop and mobile layouts, pointer drag/resize,
inline editing, the three stages, A4 overflow feedback, preview fidelity, and no
relevant console errors.
