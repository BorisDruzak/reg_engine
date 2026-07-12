# XLSX: порядок колонок и скрытие организации Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Always produce schema-ordered XLSX columns and hide the organization column by default without making multi-organization imports ambiguous.

**Architecture:** The XLSX service owns canonical field sorting and a workbook configuration that records whether the organization column is visible and, when hidden, the fixed import organization. The React panel only gathers the configuration, defaulting to hidden and requiring an explicit target when several organizations are selected.

**Tech Stack:** FastAPI, Pydantic, SQLAlchemy, openpyxl, React, TypeScript, Vitest, pytest.

## Global Constraints

- Keep cards schema-driven and enforce organization access in the backend.
- Use Russian-first visible labels and do not restore technical JSON/CSV exchange controls.
- Keep `№ п/п` first and support legacy XLSX metadata that contains the organization column.
- Do not add a migration or relax import byte/row limits.

---

### Task 1: Define and test the workbook configuration contract

**Files:**
- Modify: `backend/app/schemas/import_export.py`
- Modify: `backend/app/services/import_export.py`
- Test: `backend/tests/test_tabular_xlsx_exchange.py`

**Interfaces:**
- Consumes: `TabularCardWorkbookRequest` with selected template, field, and organization ids.
- Produces: `TabularWorkbookConfiguration.include_organization_column` and `.fixed_organization_id`, plus canonical `fields` order.

- [ ] **Step 1: Write failing backend tests**

```python
def test_tabular_xlsx_orders_fields_by_block_then_field_position() -> None:
    ordered = TabularCardExchangeService._order_selected_fields([
        (field_in_second_block, second_block),
        (second_field_in_first_block, first_block),
        (first_field_in_first_block, first_block),
    ])
    assert [field.id for field, _block in ordered] == [
        first_field_in_first_block.id,
        second_field_in_first_block.id,
        field_in_second_block.id,
    ]

def test_hidden_organization_template_starts_fields_after_ordinal() -> None:
    assert [cell.value for cell in sheet[1][:2]] == ["№ п/п", "Дата рождения"]
    assert "B2:B101" not in validations
```

- [ ] **Step 2: Run the focused backend tests and confirm RED**

Run: `backend\.venv\Scripts\python.exe -m pytest backend\tests\test_tabular_xlsx_exchange.py -q`

Expected: FAIL because canonical sort and the hidden-organization configuration do not exist.

- [ ] **Step 3: Implement the backend configuration**

```python
class TabularCardWorkbookRequest(BaseModel):
    card_template_id: UUID
    field_ids: list[UUID]
    organization_ids: list[UUID]
    include_organization_column: bool = False
    fixed_organization_id: UUID | None = None
```

```python
def _order_selected_fields(self, pairs: list[tuple[FormField, FormBlock]]):
    return sorted(pairs, key=lambda item: (
        item[1].position, item[1].id, item[0].position, item[0].id,
    ))
```

Pass both new values through the endpoint/service methods. Require a permitted
fixed organization whenever `include_organization_column` is false; use it in
the configuration and never derive it from file data.

- [ ] **Step 4: Run the focused backend tests and confirm GREEN**

Run: `backend\.venv\Scripts\python.exe -m pytest backend\tests\test_tabular_xlsx_exchange.py -q`

Expected: PASS.

### Task 2: Make workbook construction and reading symmetric

**Files:**
- Modify: `backend/app/services/import_export.py`
- Test: `backend/tests/test_tabular_xlsx_exchange.py`
- Test: `backend/tests/test_api_phase_3_import_export.py`

**Interfaces:**
- Consumes: `TabularWorkbookConfiguration` from Task 1.
- Produces: XLSX headers and metadata that describe the visible/hidden organization mode and can be previewed/committed safely.

- [ ] **Step 1: Write failing tests for metadata and hidden import mapping**

```python
def test_hidden_organization_metadata_records_fixed_import_organization() -> None:
    metadata = json.loads(workbook["_registry_engine"]["B1"].value)
    assert metadata["include_organization_column"] is False
    assert metadata["fixed_organization_id"] == str(organization.id)
```

- [ ] **Step 2: Run focused backend tests and confirm RED**

Run: `backend\.venv\Scripts\python.exe -m pytest backend\tests\test_tabular_xlsx_exchange.py backend\tests\test_api_phase_3_import_export.py -q`

Expected: FAIL because the workbook still always contains `Организация`.

- [ ] **Step 3: Implement symmetric workbook I/O**

```python
headers = ["№ п/п"]
if configuration.include_organization_column:
    headers.append("Организация")
headers.extend(item.header for item in configuration.fields)
```

Use the fixed-column count in row writing, styling, validation and parsing. Add
the two metadata keys. During metadata reads, use `True` when the visibility
key is absent to retain support for already-downloaded workbooks. In hidden
mode, assign each parsed row the configured fixed organization and its label;
in visible mode retain the existing Excel-list validation and per-row lookup.

- [ ] **Step 4: Run focused tests and confirm GREEN**

Run: `backend\.venv\Scripts\python.exe -m pytest backend\tests\test_tabular_xlsx_exchange.py backend\tests\test_api_phase_3_import_export.py -q`

Expected: PASS; database-dependent API tests may skip without `TEST_DATABASE_URL`.

### Task 3: Add Russian-first panel controls and payload state

**Files:**
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/app/uiText.ts`
- Modify: `frontend/src/features/registry/ImportExportPanel.tsx`
- Test: `frontend/src/features/registry/ImportExportPanel.test.tsx`

**Interfaces:**
- Consumes: API payload from Task 1.
- Produces: a download payload with `include_organization_column` and a permitted `fixed_organization_id` in hidden mode.

- [ ] **Step 1: Write a failing UI test**

```tsx
test("hides organization by default and requires target for multiple organizations", async () => {
  // select a template, two organizations and one field
  expect(screen.getByLabelText("Скрывать колонку «Организация»")).toBeChecked();
  expect(screen.getByLabelText("Организация для импорта")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Скачать список" })).toBeDisabled();
})
```

- [ ] **Step 2: Run the UI test and confirm RED**

Run: `pnpm -C frontend test:run src/features/registry/ImportExportPanel.test.tsx`

Expected: FAIL because the toggle and target selector are missing.

- [ ] **Step 3: Implement the smallest panel change**

```tsx
const [hideOrganizationColumn, setHideOrganizationColumn] = useState(true);
const [fixedOrganizationId, setFixedOrganizationId] = useState("");
const needsFixedOrganization = hideOrganizationColumn && selectedOrganizationIds.length > 1;
```

Render the checked-by-default Russian switch. The list export stays available
with any selected organizations. When hiding and one organization is selected,
put that id into the import-template payload automatically. When hiding and
multiple are selected, render a select in the import section limited to the
checked organizations and disable only the import-template download until it
has a value. When showing the column, omit the fixed id and retain all existing
organization controls.

- [ ] **Step 4: Run UI tests and typecheck**

Run: `pnpm -C frontend test:run src/features/registry/ImportExportPanel.test.tsx; pnpm -C frontend typecheck`

Expected: PASS.

### Task 4: Verify, document and release

**Files:**
- Modify: `PLANS.md`
- Modify: `docs/PROJECT_TREE.md` only if the project map changes

- [ ] **Step 1: Run focused and build gates**

Run: `backend\.venv\Scripts\python.exe -m pytest backend\tests\test_tabular_xlsx_exchange.py backend\tests\test_api_phase_3_import_export.py -q; pnpm -C frontend test:run src/features/registry/ImportExportPanel.test.tsx; pnpm -C frontend typecheck; pnpm -C frontend build; git diff --check`

Expected: focused tests/typecheck/build pass; record any unavailable disposable-PostgreSQL skips.

- [ ] **Step 2: Test the rendered flow**

Use the existing authenticated browser session: select a template, two organizations and fields; confirm hidden mode starts checked, select the explicit import organization, then switch visibility on and confirm the target selector disappears. Inspect console logs and capture desktop plus mobile evidence.

- [ ] **Step 3: Record and release the verified checkpoint**

Update `PLANS.md`, run `scripts/project-map.ps1 -Check`, commit scoped files on `main`, push, run `scripts/deploy.ps1`, build/deploy the frontend with `scripts/deploy-frontend.ps1`, then repeat the live smoke check.
