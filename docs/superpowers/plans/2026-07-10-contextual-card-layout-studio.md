# Contextual Card Layout Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a mouse-first contextual card-layout editor with quarter-width and quarter-height geometry and embed the linked web composition as one object in A4.

**Architecture:** Extend `card_template_layout_v1` with nested `row_span` geometry and a revision token, then add a linked `card_layout` print item that expands the current form layout during generation. Split the current `CardLayoutStudio` into geometry, canvas-node, inline-editor, preview, and A4-stage components while keeping API validation authoritative.

**Tech Stack:** FastAPI, Pydantic, SQLAlchemy, React 19, TypeScript, TanStack Query, Vitest, Testing Library, existing `card_print_layout_v1` DOCX/PDF renderers.

## Global Constraints

- Keep the system schema-driven; do not add fixed business or employee fields.
- Preserve all existing field types and their behavior.
- Use a 12-column by 4-row logical grid; visible width and height snap points are `1/4`, `1/2`, `3/4`, and `1`.
- Keep legacy form layouts and field-by-field A4 print layouts readable and renderable.
- All backend create/update/archive actions write audit events and all archives remain soft archives.
- Backend permission checks are authoritative; frontend checks are UX hints only.
- User-facing copy, validation, and accessibility labels are Russian-first.
- API remains the business-logic boundary; frontend and future MCP code never access the database directly.
- Work on `main`; do not create a feature branch unless the user explicitly requests it.

---

## File Structure

- `backend/app/schemas/card_template_layouts.py`: unified geometry/revision schemas.
- `backend/app/services/card_template_layout.py`: form-layout validation, revision conflicts, persistence, audit.
- `backend/app/services/card_template_projection.py`: linked-card projection and legacy conversion.
- `backend/app/services/card_print.py`: normalized `card_layout` print-item validation.
- `backend/app/services/documents.py`: generation-time linked-card expansion for DOCX/PDF.
- `backend/tests/test_card_template_layout_services.py`: geometry, revision, projection, and compatibility regressions.
- `frontend/src/features/cardLayout/layoutGeometry.ts`: pure 12-by-4 move/resize/snap/collision functions.
- `frontend/src/features/cardLayout/layoutGeometry.test.ts`: pure geometry tests.
- `frontend/src/features/cardLayout/useLayoutGeometrySession.ts`: pointer/keyboard interaction session.
- `frontend/src/features/cardLayout/CardLayoutRenderer.tsx`: shared schema-driven renderer and mode contract.
- `frontend/src/features/cardLayout/CardWebLayoutCanvas.tsx`: contextual web-card design surface.
- `frontend/src/features/cardLayout/CardBlockLayoutNode.tsx`: block node and inline block editor host.
- `frontend/src/features/cardLayout/CardFieldLayoutNode.tsx`: field node and inline field editor host.
- `frontend/src/features/cardLayout/LayoutLivePreview.tsx`: web and A4 live preview pair.
- `frontend/src/features/cardLayout/A4LinkedCardCanvas.tsx`: A4 linked-card and decoration surface.
- `frontend/src/features/registry/print/CardLayoutStudio.tsx`: orchestration, stages, data loading, save status, undo/redo.
- `frontend/src/features/registry/CardPrintTemplateEditor.test.tsx`: studio interaction regression suite.

### Task 1: Extend the unified form-layout contract

**Files:**
- Modify: `backend/app/schemas/card_template_layouts.py`
- Modify: `backend/app/services/card_template_layout.py`
- Modify: `backend/app/api/v1/endpoints/card_template_layouts.py`
- Test: `backend/tests/test_card_template_layout_services.py`

**Interfaces:**
- Produces: `CardTemplateLayoutRead.revision: str`.
- Produces: `CardTemplateFormLayoutSectionRead.row_span: int` and `CardTemplateFormLayoutItemRead.row_span: int`.
- Produces: `CardTemplateLayoutUpdate.expected_revision: str`.
- Consumes: existing `PATCH /api/v1/card-templates/{template_id}/layout/form`.

- [ ] **Step 1: Add failing schema and revision tests**

```python
def test_form_layout_defaults_legacy_row_span_to_one() -> None:
    layout = CardTemplateFormLayoutRead.model_validate(
        {
            "columns": 12,
            "sections": [
                {
                    "id": "block-a",
                    "row": 1,
                    "column": 1,
                    "column_span": 6,
                    "items": [
                        {
                            "id": "field-a",
                            "row": 1,
                            "column": 1,
                            "column_span": 6,
                        }
                    ],
                }
            ],
        }
    )
    assert layout.sections[0].row_span == 1
    assert layout.sections[0].items[0].row_span == 1


def test_form_layout_rejects_non_quarter_spans() -> None:
    with pytest.raises(CardTemplateLayoutError, match="quarter"):
        validate_form_layout_geometry(
            {"columns": 12, "sections": [{"id": "a", "row": 1, "column": 1, "column_span": 5, "row_span": 1, "items": []}]}
        )
```

- [ ] **Step 2: Run the focused backend test and verify RED**

Run: `backend\.venv\Scripts\python.exe -m pytest backend/tests/test_card_template_layout_services.py -q`

Expected: FAIL because `row_span`, `revision`, and `validate_form_layout_geometry` do not exist.

- [ ] **Step 3: Add bounded geometry and revision schemas**

```python
class CardTemplateFormLayoutItemRead(BaseModel):
    id: str
    kind: str = "field"
    field_id: UUID | None = None
    row: int = Field(default=1, ge=1)
    column: int = Field(default=1, ge=1, le=12)
    row_span: int = Field(default=1, ge=1, le=4)
    column_span: int = Field(default=12, ge=1, le=12)
    text: str | None = None


class CardTemplateFormLayoutSectionRead(BaseModel):
    id: str
    block_id: UUID | None = None
    row: int = Field(default=1, ge=1)
    column: int = Field(default=1, ge=1, le=12)
    row_span: int = Field(default=1, ge=1, le=4)
    column_span: int = Field(default=12, ge=1, le=12)
    items: list[CardTemplateFormLayoutItemRead] = Field(default_factory=list)


class CardTemplateLayoutRead(BaseModel):
    version: Literal["card_template_layout_v1"] = "card_template_layout_v1"
    revision: str
    card_template_id: UUID
    registry_id: UUID
    structure: CardTemplateStructureRead
    form_layout: CardTemplateFormLayoutRead
    print_views: list[CardTemplatePrintViewRead]
    export_settings: CardTemplateExportSettingsRead
    sync_status: CardTemplateLayoutSyncStatusRead


class CardTemplateLayoutUpdate(BaseModel):
    expected_revision: str
    form_layout: dict[str, Any]
```

- [ ] **Step 4: Implement canonical validation and revision hashing**

```python
QUARTER_COLUMN_SPANS = {3, 6, 9, 12}


class CardTemplateLayoutConflictError(CardTemplateLayoutError):
    """Raised when an update is based on a stale layout revision."""


def form_layout_revision(form_layout: dict[str, Any]) -> str:
    canonical = json.dumps(form_layout, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _grid_rect(item: dict[str, Any]) -> tuple[int, int, int, int]:
    left = int(item["column"])
    top = int(item["row"])
    return (
        left,
        top,
        left + int(item["column_span"]),
        top + int(item["row_span"]),
    )


def _grid_rects_overlap(
    left: tuple[int, int, int, int],
    right: tuple[int, int, int, int],
) -> bool:
    return not (
        left[2] <= right[0]
        or right[2] <= left[0]
        or left[3] <= right[1]
        or right[3] <= left[1]
    )


def reject_overlaps(form_layout: dict[str, Any]) -> None:
    sections = form_layout["sections"]
    for index, section in enumerate(sections):
        if any(
            _grid_rects_overlap(_grid_rect(section), _grid_rect(other))
            for other in sections[index + 1 :]
        ):
            raise CardTemplateLayoutError("Card blocks cannot overlap.")
        items = section["items"]
        for item_index, item in enumerate(items):
            if any(
                _grid_rects_overlap(_grid_rect(item), _grid_rect(other))
                for other in items[item_index + 1 :]
            ):
                raise CardTemplateLayoutError("Fields inside a block cannot overlap.")


def validate_form_layout_geometry(form_layout: dict[str, Any]) -> dict[str, Any]:
    normalized = CardTemplateFormLayoutRead.model_validate(form_layout).model_dump(mode="json")
    for section in normalized["sections"]:
        if section["column_span"] not in QUARTER_COLUMN_SPANS:
            raise CardTemplateLayoutError("Block width must use a quarter-grid span.")
        if section["column"] + section["column_span"] - 1 > 12:
            raise CardTemplateLayoutError("Block exceeds the card width.")
        if section["row"] + section["row_span"] - 1 > 4:
            raise CardTemplateLayoutError("Block exceeds the card height.")
        for item in section["items"]:
            if item["column_span"] not in QUARTER_COLUMN_SPANS:
                raise CardTemplateLayoutError("Field width must use a quarter-grid span.")
            if item["column"] + item["column_span"] - 1 > 12:
                raise CardTemplateLayoutError("Field exceeds its block width.")
            if item["row"] + item["row_span"] - 1 > 4:
                raise CardTemplateLayoutError("Field exceeds its block height.")
    reject_overlaps(normalized)
    return normalized
```

The read path uses `CardTemplateFormLayoutRead` directly so legacy rows above
four remain readable. The update path calls `validate_form_layout_geometry` and
rejects them with a conversion-required error; `sync_status.warnings` reports
the legacy overflow on reads.

- [ ] **Step 5: Enforce optimistic revision conflicts in the service and endpoint**

```python
current = self._form_layout(template, blocks, fields)
if expected_revision != form_layout_revision(current):
    raise CardTemplateLayoutConflictError("Card layout changed. Reload before saving.")
normalized = validate_form_layout_geometry(form_layout)
```

Map `CardTemplateLayoutConflictError` to HTTP `409` through the existing service error adapter.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run: `backend\.venv\Scripts\python.exe -m pytest backend/tests/test_card_template_layout_services.py -q`

Expected: PASS with legacy defaults, quarter validation, overlap rejection, and revision conflict coverage.

- [ ] **Step 7: Commit the backend geometry contract**

```powershell
git add backend/app/schemas/card_template_layouts.py backend/app/services/card_template_layout.py backend/app/api/v1/endpoints/card_template_layouts.py backend/tests/test_card_template_layout_services.py
git commit -m "Extend card layout geometry contract"
```

### Task 2: Add linked-card A4 normalization and generation

**Files:**
- Modify: `backend/app/schemas/card_template_layouts.py`
- Modify: `backend/app/services/card_template_projection.py`
- Modify: `backend/app/services/card_print.py`
- Modify: `backend/app/services/documents.py`
- Test: `backend/tests/test_card_template_layout_services.py`
- Test: `backend/tests/test_card_print_layout_services.py`
- Test: `backend/tests/test_document_generation_services.py`

**Interfaces:**
- Produces: normalized print item `kind="card_layout"` with `card_template_id`, `x_mm`, `y_mm`, `width_mm`, `height_mm`.
- Produces: `expand_linked_card_layout(form_layout, page_rect) -> list[dict[str, Any]]`.
- Consumes: the current form layout at generation time.

- [ ] **Step 1: Add failing linked-item normalization and expansion tests**

```python
def test_card_layout_item_expands_current_form_layout() -> None:
    expanded = expand_linked_card_layout(
        _form_layout(FIELD_ID, item_id="field-name"),
        {"x_mm": 15.0, "y_mm": 30.0, "width_mm": 180.0, "height_mm": 220.0},
    )
    assert expanded[0]["source_item_id"] == "field-name"
    assert expanded[0]["x_mm"] >= 15.0
    assert expanded[0]["y_mm"] >= 30.0


def test_legacy_field_items_remain_valid() -> None:
    normalized = validate_card_print_layout(_legacy_layout(), allowed_field_ids={UUID(FIELD_ID)})
    assert normalized["sections"]
```

- [ ] **Step 2: Run the three focused backend suites and verify RED**

Run: `backend\.venv\Scripts\python.exe -m pytest backend/tests/test_card_template_layout_services.py backend/tests/test_card_print_layout_services.py backend/tests/test_document_generation_services.py -q`

Expected: FAIL because linked-card normalization and expansion are missing.

- [ ] **Step 3: Normalize the linked-card item without weakening legacy validation**

```python
def _normalize_linked_card_item(item: dict[str, object]) -> dict[str, object]:
    return {
        "id": _required_string(item.get("id"), "Linked card item id is required."),
        "kind": "card_layout",
        "card_template_id": _required_uuid_string(item.get("card_template_id")),
        "page": _positive_int(item.get("page"), default=1),
        "x_mm": _non_negative_number(item.get("x_mm"), default=12.0),
        "y_mm": _non_negative_number(item.get("y_mm"), default=12.0),
        "width_mm": _positive_number(item.get("width_mm"), default=186.0),
        "height_mm": _positive_number(item.get("height_mm"), default=273.0),
    }
```

Add local `_required_string` and `_required_uuid_string` helpers beside the
normalizer:

```python
def _required_string(value: object, message: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise CardPrintLayoutError(message)
    return value.strip()


def _required_uuid_string(value: object) -> str:
    try:
        return str(UUID(str(value)))
    except (TypeError, ValueError) as exc:
        raise CardPrintLayoutError("Linked card template id is invalid.") from exc
```

Reject overflow and a computed print scale below the existing readable text threshold.

- [ ] **Step 4: Implement deterministic form-layout expansion**

```python
def expand_linked_card_layout(
    form_layout: dict[str, Any],
    rect: dict[str, float],
) -> list[dict[str, Any]]:
    column_mm = rect["width_mm"] / 12
    row_mm = rect["height_mm"] / 4
    result: list[dict[str, Any]] = []
    for section in form_layout.get("sections", []):
        section_x = rect["x_mm"] + (section["column"] - 1) * column_mm
        section_y = rect["y_mm"] + (section["row"] - 1) * row_mm
        for item in section.get("items", []):
            result.append(
                {
                    **item,
                    "source_item_id": item["id"],
                    "x_mm": section_x + (item["column"] - 1) * column_mm,
                    "y_mm": section_y + (item["row"] - 1) * row_mm,
                    "width_mm": item["column_span"] * column_mm,
                    "height_mm": item["row_span"] * row_mm,
                }
            )
    return result
```

- [ ] **Step 5: Expand at DOCX/PDF generation time**

Resolve the linked item's active card template, load its current normalized form layout, expand it into the existing renderer input, and keep print-only overlays unchanged. Do not persist expanded field items back into the print-view JSON.

- [ ] **Step 6: Add explicit legacy conversion service coverage**

Add `convert_print_view_to_linked_card_for_actor(...)` that creates a new document-template version containing one linked item plus preserved print-only overlays. Assert the previous version remains readable.

- [ ] **Step 7: Run linked-print and document tests**

Run: `backend\.venv\Scripts\python.exe -m pytest backend/tests/test_card_template_layout_services.py backend/tests/test_card_print_layout_services.py backend/tests/test_document_generation_services.py -q`

Expected: PASS; generated DOCX begins with `PK` and generated PDF begins with `%PDF` in existing binary assertions.

- [ ] **Step 8: Commit linked A4 support**

```powershell
git add backend/app/schemas/card_template_layouts.py backend/app/services/card_template_projection.py backend/app/services/card_print.py backend/app/services/documents.py backend/tests/test_card_template_layout_services.py backend/tests/test_card_print_layout_services.py backend/tests/test_document_generation_services.py
git commit -m "Add linked card layout printing"
```

### Task 3: Add frontend geometry types and pure interaction math

**Files:**
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/api/client.ts`
- Create: `frontend/src/features/cardLayout/layoutGeometry.ts`
- Create: `frontend/src/features/cardLayout/layoutGeometry.test.ts`

**Interfaces:**
- Produces: `LayoutRect`, `ResizeHandle`, `snapQuarterRect`, `moveRect`, `resizeRect`, and `rectsOverlap`.
- Consumes: `CardTemplateLayoutRead.revision` and `CardTemplateLayoutUpdatePayload.expected_revision`.

- [ ] **Step 1: Write failing geometry tests**

```ts
import { describe, expect, test } from "vitest";
import { resizeRect, snapQuarterRect } from "./layoutGeometry";

describe("quarter-grid geometry", () => {
  test("snaps both axes to quarter units", () => {
    expect(snapQuarterRect({ row: 1, column: 1, rowSpan: 3, columnSpan: 7 })).toEqual({
      row: 1,
      column: 1,
      rowSpan: 3,
      columnSpan: 6,
    });
  });

  test("resizes from the bottom right without leaving the grid", () => {
    expect(resizeRect({ row: 1, column: 1, rowSpan: 2, columnSpan: 6 }, "bottom-right", 9, 4)).toEqual({
      row: 1,
      column: 1,
      rowSpan: 4,
      columnSpan: 9,
    });
  });
});
```

- [ ] **Step 2: Run Vitest and verify RED**

Run: `pnpm -C frontend exec vitest run src/features/cardLayout/layoutGeometry.test.ts --reporter=dot`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Add exact frontend contracts**

```ts
export type LayoutRect = {
  row: number;
  column: number;
  rowSpan: 1 | 2 | 3 | 4;
  columnSpan: 3 | 6 | 9 | 12;
};

export type ResizeHandle =
  | "top-left"
  | "top"
  | "top-right"
  | "right"
  | "bottom-right"
  | "bottom"
  | "bottom-left"
  | "left";

export const QUARTER_COLUMN_SPANS = [3, 6, 9, 12] as const;
export const QUARTER_ROW_SPANS = [1, 2, 3, 4] as const;
```

Extend API types with `row_span`, `revision`, `expected_revision`, and `card_layout` item fields.

- [ ] **Step 4: Implement clamped move/resize/snap/collision helpers**

Use immutable return values. Resolve ties to the smaller span so pointer jitter cannot unexpectedly enlarge an object.

- [ ] **Step 5: Update the layout PATCH client payload**

```ts
export type CardTemplateLayoutUpdatePayload = {
  expected_revision: string;
  form_layout: CardTemplateFormLayoutRead;
};
```

- [ ] **Step 6: Run geometry tests, typecheck, and lint**

Run: `pnpm -C frontend exec vitest run src/features/cardLayout/layoutGeometry.test.ts --reporter=dot`

Run: `pnpm -C frontend typecheck`

Run: `pnpm -C frontend lint`

Expected: all commands exit `0`.

- [ ] **Step 7: Commit frontend contracts and geometry**

```powershell
git add frontend/src/api/types.ts frontend/src/api/client.ts frontend/src/features/cardLayout/layoutGeometry.ts frontend/src/features/cardLayout/layoutGeometry.test.ts
git commit -m "Add card layout interaction geometry"
```

### Task 4: Build the shared renderer and inline canvas nodes

**Files:**
- Create: `frontend/src/features/cardLayout/CardLayoutRenderer.tsx`
- Create: `frontend/src/features/cardLayout/CardWebLayoutCanvas.tsx`
- Create: `frontend/src/features/cardLayout/CardBlockLayoutNode.tsx`
- Create: `frontend/src/features/cardLayout/CardFieldLayoutNode.tsx`
- Create: `frontend/src/features/cardLayout/InlineBlockEditor.tsx`
- Create: `frontend/src/features/cardLayout/InlineFieldEditor.tsx`
- Create: `frontend/src/features/cardLayout/CardLayoutRenderer.test.tsx`

**Interfaces:**
- Produces: `CardLayoutRendererMode = "design" | "preview" | "readonly" | "block-edit" | "public-edit"`.
- Produces: `CardLayoutSelection = { kind: "block" | "field"; id: string } | null`.
- Consumes: normalized `CardTemplateLayoutRead`, blocks, fields, and optional rendered values.

- [ ] **Step 1: Write failing idle and inline-editor component tests**

```tsx
render(<CardWebLayoutCanvas {...fixtureProps} selection={null} />);
expect(screen.queryByText("Свойства элемента")).not.toBeInTheDocument();
expect(screen.getByRole("button", { name: "Создать блок в этой области" })).toBeInTheDocument();

await user.click(screen.getByRole("button", { name: "Изменить блок ФИО" }));
expect(within(screen.getByTestId("layout-block-block-fio")).getByLabelText("Название блока")).toHaveValue("ФИО");
expect(screen.queryByRole("complementary", { name: "Свойства элемента" })).not.toBeInTheDocument();
```

- [ ] **Step 2: Run the component test and verify RED**

Run: `pnpm -C frontend exec vitest run src/features/cardLayout/CardLayoutRenderer.test.tsx --reporter=dot --testTimeout=10000`

Expected: FAIL because the renderer components do not exist.

- [ ] **Step 3: Implement the renderer mode and CSS-grid mapping**

```tsx
const sectionStyle = {
  gridColumn: `${section.column} / span ${section.column_span}`,
  gridRow: `${section.row} / span ${section.row_span}`,
};

const fieldStyle = {
  gridColumn: `${field.column} / span ${field.column_span}`,
  gridRow: `${field.row} / span ${field.row_span}`,
};
```

Keep dimension labels behind a `showGeometryDiagnostics` prop that defaults to `false` outside the schema editor.

- [ ] **Step 4: Implement canvas-local creation actions**

Place `Создать блок` and `Вставить существующий блок` in empty canvas cells. Place `Создать поле` inside each block. Do not render a persistent type palette.

- [ ] **Step 5: Implement validated click-away inline editors**

Expose `onCommitBlock`, `onCancelBlock`, `onCommitField`, and `onCancelField`. On validation error, retain the editor and focus the first invalid control. List all existing field types from one shared constant derived from `fieldTypeLabel`.

- [ ] **Step 6: Run component tests and accessibility queries**

Run: `pnpm -C frontend exec vitest run src/features/cardLayout/CardLayoutRenderer.test.tsx --reporter=dot --testTimeout=10000`

Expected: PASS with idle, block-editor, field-editor, type-list, click-away, invalid-save, and Escape coverage.

- [ ] **Step 7: Commit the renderer foundation**

```powershell
git add frontend/src/features/cardLayout
git commit -m "Build contextual card layout canvas"
```

### Task 5: Add pointer geometry sessions and live previews

**Files:**
- Create: `frontend/src/features/cardLayout/useLayoutGeometrySession.ts`
- Create: `frontend/src/features/cardLayout/LayoutLivePreview.tsx`
- Modify: `frontend/src/features/cardLayout/CardBlockLayoutNode.tsx`
- Modify: `frontend/src/features/cardLayout/CardFieldLayoutNode.tsx`
- Modify: `frontend/src/features/cardLayout/CardWebLayoutCanvas.tsx`
- Test: `frontend/src/features/cardLayout/CardLayoutRenderer.test.tsx`

**Interfaces:**
- Produces: `beginMove`, `beginResize`, `previewRect`, `commit`, `cancel`.
- Consumes: pure helpers from `layoutGeometry.ts`.

- [ ] **Step 1: Add failing pointer, preview, undo-command, and keyboard tests**

Test pointer-down/move/up on a block handle, a field corner resize, Escape cancel, collision rejection, and Arrow-key fallback. Assert both preview surfaces receive the same preview layout.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm -C frontend exec vitest run src/features/cardLayout/CardLayoutRenderer.test.tsx --reporter=dot --testTimeout=10000`

Expected: FAIL because geometry sessions and previews are absent.

- [ ] **Step 3: Implement one pointer-capture session per interaction**

```ts
export type LayoutGeometrySession = {
  targetId: string;
  targetKind: "block" | "field";
  operation: "move" | "resize";
  original: LayoutRect;
  preview: LayoutRect;
  handle?: ResizeHandle;
};
```

Do not call the API during pointer movement. Commit exactly one undoable command on pointer-up.

- [ ] **Step 4: Hide semantic properties during geometry editing**

Render only dimension badges, destination/collision guides, `Готово`, `Отмена`, and `LayoutLivePreview` while a geometry session is active.

- [ ] **Step 5: Run focused tests and typecheck**

Run: `pnpm -C frontend exec vitest run src/features/cardLayout/CardLayoutRenderer.test.tsx --reporter=dot --testTimeout=10000`

Run: `pnpm -C frontend typecheck`

Expected: both commands exit `0`.

- [ ] **Step 6: Commit geometry interactions**

```powershell
git add frontend/src/features/cardLayout
git commit -m "Add mouse-first layout interactions"
```

### Task 6: Replace the studio workspace and add the A4 stage

**Files:**
- Create: `frontend/src/features/cardLayout/A4LinkedCardCanvas.tsx`
- Modify: `frontend/src/features/registry/print/CardLayoutStudio.tsx`
- Modify: `frontend/src/features/registry/print/A4LayoutRenderer.tsx`
- Modify: `frontend/src/features/registry/CardPrintTemplateEditor.test.tsx`
- Modify: `frontend/src/styles/globals.css`

**Interfaces:**
- Consumes: shared renderer, geometry session, linked `card_layout` print item, legacy conversion API.
- Produces: stage ids `layout`, `a4`, and `preview` with Russian labels.

- [ ] **Step 1: Rewrite the existing studio regression expectations first**

Assert the three stage labels, absence of permanent palette/properties, inline create/edit controls, geometry previews, one linked-card item on A4, preserved DOCX/PDF actions, and explicit legacy conversion.

- [ ] **Step 2: Run the existing studio suite and verify RED**

Run: `pnpm -C frontend exec vitest run src/features/registry/CardPrintTemplateEditor.test.tsx --reporter=dot --testTimeout=10000`

Expected: FAIL against the current mixed A4 workspace.

- [ ] **Step 3: Reduce `CardLayoutStudio` to orchestration**

Replace the current `StudioMode` with:

```ts
type StudioStage = "layout" | "a4" | "preview";
```

Load once, preserve TanStack Query cache behavior, pass mutations into focused components, and send `expected_revision` on every form-layout save.

- [ ] **Step 4: Implement the A4 linked-card surface**

Allow move/resize only on the enclosing linked-card rectangle and print-only items. Internal block/field edit actions must route back to `Макет карточки`.

- [ ] **Step 5: Add stale-save, legacy-conversion, and retry UI**

Map HTTP `409` to `Макет изменён другим пользователем. Обновите данные перед сохранением.` Keep the local draft visible until the user reloads or cancels.

- [ ] **Step 6: Run frontend suites, lint, typecheck, and build**

Run: `pnpm -C frontend exec vitest run src/features/cardLayout/layoutGeometry.test.ts src/features/cardLayout/CardLayoutRenderer.test.tsx src/features/registry/CardPrintTemplateEditor.test.tsx --reporter=dot --testTimeout=10000`

Run: `pnpm -C frontend lint`

Run: `pnpm -C frontend typecheck`

Run: `pnpm -C frontend build`

Expected: all commands exit `0`.

- [ ] **Step 7: Commit the contextual studio**

```powershell
git add frontend/src/features/cardLayout frontend/src/features/registry/print/CardLayoutStudio.tsx frontend/src/features/registry/print/A4LayoutRenderer.tsx frontend/src/features/registry/CardPrintTemplateEditor.test.tsx frontend/src/styles/globals.css
git commit -m "Replace card template layout studio"
```

### Task 7: Documentation, full checks, deployment, and live proof

**Files:**
- Modify: `PLANS.md`
- Modify: `README.md`
- Modify: `docs/PROJECT_MAP.md`
- Modify: `docs/PROJECT_TREE.md` through `scripts/project-map.ps1`

**Interfaces:**
- Produces: recorded Phase 8J verification and known limitations.
- Consumes: all tasks above.

- [ ] **Step 1: Update project documentation**

Record the 12-by-4 form-layout contract, contextual editor states, linked-card A4 behavior, legacy compatibility, and exact verification commands. Keep repository documentation free of private hostnames and secrets.

- [ ] **Step 2: Refresh and verify the project map**

Run: `powershell -ExecutionPolicy Bypass -File scripts/project-map.ps1`

Run: `powershell -ExecutionPolicy Bypass -File scripts/project-map.ps1 -Check`

Expected: project-map check exits `0`.

- [ ] **Step 3: Run the full local gate**

Run: `powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote`

Expected: backend pytest, frontend tests, lint, typecheck, production build, and project-map checks all pass.

- [ ] **Step 4: Commit documentation and generated project map**

```powershell
git add PLANS.md README.md docs/PROJECT_MAP.md docs/PROJECT_TREE.md
git commit -m "Document contextual card layout studio"
```

- [ ] **Step 5: Push and deploy the verified checkpoint**

Run: `powershell -ExecutionPolicy Bypass -File scripts/push-git.ps1 -Message "Release contextual card layout studio"`

Run: `powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1`

Run: `powershell -ExecutionPolicy Bypass -File scripts/deploy-frontend.ps1`

Expected: `origin/main` and the configured server checkout reach the same commit; health and server checks pass.

- [ ] **Step 6: Perform live Browser validation**

The flow under test is: `Реестры -> Схема карточки -> Базовый шаблон -> Макет карточки -> Печатная форма A4 -> Предпросмотр`.

Verify block and field creation in place, pointer move/resize on both axes, inline editor save/cancel, live web/A4 preview, linked-card A4 movement, legacy conversion, DOCX/PDF download signatures, desktop/mobile rendering, and no relevant console errors.

- [ ] **Step 7: Record live evidence in `PLANS.md`**

Add the deployed commit, commands, exact flow, screenshots stored outside Git, console result, and remaining limitations. Commit and push the evidence-only update.
