# Wide XLSX Card Exchange Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Replace technical card import/export with one permission-checked, schema-driven, wide XLSX workflow for card lists and creation templates.

**Architecture:** FastAPI owns configuration, workbook creation/parsing, RBAC, preview, and atomic commits. React exposes only one compact Russian-first tab. The visible sheet is a formatted table; hidden mapping metadata identifies columns but is verified on the server.

**Tech Stack:** FastAPI, SQLAlchemy, Pydantic, existing openpyxl runtime dependency, React, TypeScript, TanStack Query, pytest, Vitest.

## Global Constraints

- Work on main in the existing checkout; do not create a branch or worktree.
- Remove JSON, CSV, and long-row XLSX card exchange from UI and REST API.
- Keep fields schema-driven and enforce all access checks in the backend.
- Visible columns are always № п/п, Организация, then selected supported fields.
- Import creates only new cards, assigns the selected template, and uses its name for display_name.
- Do not add a migration, fixed business fields, binaries, or Excel macros.
- Follow Red–Green–Refactor: no production behavior before a focused failing test.

---

### Task 1: Tabular XLSX API options and generation selection

**Files:**

- Modify: backend/app/schemas/import_export.py
- Modify: backend/app/api/v1/endpoints/import_export.py
- Modify: backend/app/services/import_export.py
- Modify: backend/tests/test_api_phase_3_import_export.py

**Interfaces:**

- Produces GET /api/v1/registries/{registry_id}/tabular-xlsx-card-exchange/options.
- Produces TabularCardWorkbookRequest with card_template_id, field_ids, and organization_ids.
- Returns only active templates, their template-member fields, and organisations with current cards.manage scope.

- [ ] **Step 1: Write the failing API test.**

~~~
def test_tabular_xlsx_options_expose_only_card_manage_organizations(
    api_client: TestClient, db_session: Session
) -> None:
    context = _phase_3_export_context(db_session)
    response = api_client.get(
        f"/api/v1/registries/{context['registry'].id}/tabular-xlsx-card-exchange/options",
        headers=_actor_headers(context["org_admin"].id),
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert [row["id"] for row in payload["organizations"]] == [str(context["child"].id)]
    assert payload["templates"][0]["fields"][0]["supported"] is True
~~~

Extend _phase_3_export_context in the same test file to return its child organization and an active template as child and template, so later workbook/import assertions use the exact fixtures they create.

- [ ] **Step 2: Verify RED.**

Run: backend\.venv\Scripts\python.exe -m pytest backend\tests\test_api_phase_3_import_export.py -k tabular_xlsx_options -q

Expected: FAIL because the endpoint and response types do not exist.

- [ ] **Step 3: Implement only configuration/options.**

~~~
class TabularCardWorkbookRequest(BaseModel):
    card_template_id: UUID
    field_ids: list[UUID]
    organization_ids: list[UUID]

@router.get("/registries/{registry_id}/tabular-xlsx-card-exchange/options")
def get_tabular_xlsx_options(...) -> TabularCardExchangeOptionsRead:
    return TabularCardExchangeService(session).options_for_actor(
        actor_user_id=actor_user_id, registry_id=registry_id
    )
~~~

Create one shared selection validator. It must reject empty and duplicate selections, archived values, fields outside the chosen template, unsupported types, and organizations without current cards.manage.

- [ ] **Step 4: Verify GREEN.**

Run: same command. Expected: PASS.

- [ ] **Step 5: Commit.**

~~~
git add backend/app/schemas/import_export.py backend/app/api/v1/endpoints/import_export.py backend/app/services/import_export.py backend/tests/test_api_phase_3_import_export.py
git commit -m "feat: add tabular XLSX exchange options"
~~~

### Task 2: Generate wide XLSX exports and blank templates

**Files:**

- Modify: backend/app/services/import_export.py
- Modify: backend/app/api/v1/endpoints/import_export.py
- Modify: backend/tests/test_api_phase_3_import_export.py

**Interfaces:**

- Produces POST .../tabular-xlsx-card-exchange/export.
- Produces POST .../tabular-xlsx-card-exchange/import-template.
- Each binary response uses the XLSX media type.

- [ ] **Step 1: Write failing workbook tests.**

~~~
def test_tabular_xlsx_export_has_wide_visible_columns_and_typed_values(...) -> None:
    response = api_client.post(export_url, json=selection, headers=headers)
    workbook = openpyxl.load_workbook(BytesIO(response.content), data_only=True)
    sheet = workbook["Карточки"]
    assert [cell.value for cell in sheet[1]][:4] == ["№ п/п", "Организация", "Статус", "Дата"]
    assert sheet["A2"].value == 1
    assert sheet.freeze_panes == "A2"

def test_tabular_xlsx_template_prefills_one_organization_and_validates_many(...) -> None:
    workbook = _download_template(...)
    assert workbook["Карточки"]["B2"].value == "Доступная организация"
    assert workbook["_registry_engine"].sheet_state == "hidden"
~~~

- [ ] **Step 2: Verify RED.**

Run: backend\.venv\Scripts\python.exe -m pytest backend\tests\test_api_phase_3_import_export.py -k "tabular_xlsx_export or tabular_xlsx_template" -q

Expected: FAIL because the builder and routes are absent.

- [ ] **Step 3: Implement the builder and routes.**

~~~
def build_tabular_workbook(
    self, *, configuration: TabularWorkbookConfiguration, cards: Sequence[Card] | None
) -> bytes:
    workbook = openpyxl.Workbook()
    sheet = workbook.active
    sheet.title = "Карточки"
    sheet.append(["№ п/п", "Организация", *configuration.field_labels])
    sheet.freeze_panes = "A2"
    self._write_hidden_metadata_sheet(workbook, configuration)
    return self._save_workbook(workbook)
~~~

Filter cards by selected template and organisations with CardService.list_visible_cards. Write native number/date values, Russian Да/Нет, reference labels, serial numbers, borders, wrapped headers, filter controls, a frozen header, and fitting widths. Use the same layout for a blank template; prefill one organisation or add a validation list for several. Add single-select lists and multi_select semicolon guidance.

- [ ] **Step 4: Verify GREEN and commit.**

Run: same command. Expected: PASS.

~~~
git add backend/app/services/import_export.py backend/app/api/v1/endpoints/import_export.py backend/tests/test_api_phase_3_import_export.py
git commit -m "feat: generate wide XLSX card workbooks"
~~~

### Task 3: Preview and atomically create cards from uploaded templates

**Files:**

- Modify: backend/app/schemas/import_export.py
- Modify: backend/app/services/import_export.py
- Modify: backend/app/api/v1/endpoints/import_export.py
- Modify: backend/tests/test_api_phase_3_import_export.py

**Interfaces:**

- Produces multipart POST .../tabular-xlsx-card-exchange/import/preview.
- Produces multipart POST .../tabular-xlsx-card-exchange/import/commit.
- Preview is Russian-safe; commit returns created-card/value totals.

- [ ] **Step 1: Write failing preview/commit tests.**

~~~
def test_tabular_xlsx_import_creates_cards_with_template_name_and_values(...) -> None:
    uploaded = _filled_tabular_template(organization="Доступная организация", status="Готово")
    preview = api_client.post(preview_url, files={"file": ("cards.xlsx", uploaded, XLSX_MEDIA_TYPE)}, headers=headers)
    assert preview.json()["summary"]["invalid_rows"] == 0
    committed = api_client.post(commit_url, files={"file": ("cards.xlsx", uploaded, XLSX_MEDIA_TYPE)}, headers=headers)
    assert committed.status_code == 200
    card = db_session.scalar(select(Card).order_by(Card.created_at.desc()))
    assert card.display_name == context["template"].name
    assert card.card_template_id == context["template"].id

def test_tabular_xlsx_import_rejects_tampering_without_partial_create(...) -> None:
    response = api_client.post(preview_url, files={"file": _tampered_template(...)}, headers=headers)
    assert response.json()["summary"]["invalid_rows"] == 1
    assert api_client.post(commit_url, files={"file": _tampered_template(...)}, headers=headers).status_code == 400
    assert _card_count(db_session) == existing_count
~~~

- [ ] **Step 2: Verify RED.**

Run: backend\.venv\Scripts\python.exe -m pytest backend\tests\test_api_phase_3_import_export.py -k tabular_xlsx_import -q

Expected: FAIL because no tabular parser or routes exist.

- [ ] **Step 3: Implement safe parsing, preview, and commit.**

~~~
def preview_tabular_import_for_actor(self, *, actor_user_id: UUID, registry_id: UUID, xlsx_content: bytes) -> dict[str, Any]:
    configuration, rows = self._read_and_validate_tabular_workbook(xlsx_content)
    self._validate_configuration_for_actor(actor_user_id, registry_id, configuration)
    return self._preview_rows(actor_user_id, registry_id, configuration, rows)
~~~

Ignore wholly blank rows and flag nonempty invalid rows. Validate metadata, current template/fields, current organization access, limits, typed values, and reference labels on preview and commit. Call CardService.create_card_for_actor with template name and selected template, then established value writes. Roll back every row on any failure. Record aggregate tabular_xlsx audit events and retain card/value history.

- [ ] **Step 4: Verify GREEN and commit.**

Run: same command. Expected: PASS.

~~~
git add backend/app/schemas/import_export.py backend/app/services/import_export.py backend/app/api/v1/endpoints/import_export.py backend/tests/test_api_phase_3_import_export.py
git commit -m "feat: import cards from wide XLSX templates"
~~~

### Task 4: Delete technical exchange contracts

**Files:**

- Modify: backend/app/schemas/import_export.py
- Modify: backend/app/services/import_export.py
- Modify: backend/app/api/v1/endpoints/import_export.py
- Modify: backend/tests/test_api_phase_3_import_export.py

**Interfaces:**

- Removes format=json|csv|xlsx, csv_content, long-row block/field mapping, card update import, and former preview/commit paths.
- Preserves only Tasks 1–3.

- [ ] **Step 1: Write failing removal coverage.**

~~~
def test_technical_card_exchange_routes_are_not_exposed(api_client: TestClient, db_session: Session) -> None:
    context = _phase_3_export_context(db_session)
    headers = _actor_headers(context["org_admin"].id)
    assert api_client.get(f"/api/v1/registries/{context['registry'].id}/exports/cards?format=xlsx", headers=headers).status_code == 404
    assert api_client.post(f"/api/v1/registries/{context['registry'].id}/imports/cards/preview", json={"csv_content": "x"}, headers=headers).status_code == 404
~~~

- [ ] **Step 2: Verify RED.**

Run: backend\.venv\Scripts\python.exe -m pytest backend\tests\test_api_phase_3_import_export.py -k technical_card_exchange_routes -q

Expected: FAIL because legacy routes still exist.

- [ ] **Step 3: Delete the obsolete implementation and tests.**

Remove old Pydantic contracts, routes, long-row CSV/XLSX parser/exporter, and obsolete tests. Retain only shared XLSX byte-limit reading where new multipart routes use it. Rename CSV-specific errors to tabular-XLSX errors.

- [ ] **Step 4: Verify GREEN and commit.**

Run: backend\.venv\Scripts\python.exe -m pytest backend\tests\test_api_phase_3_import_export.py -q

Expected: PASS.

~~~
git add backend/app/schemas/import_export.py backend/app/services/import_export.py backend/app/api/v1/endpoints/import_export.py backend/tests/test_api_phase_3_import_export.py
git commit -m "refactor: remove technical card exchange formats"
~~~

### Task 5: Replace the technical frontend panel with one compact XLSX tab

**Files:**

- Modify: frontend/src/api/types.ts
- Modify: frontend/src/api/client.ts
- Modify: frontend/src/app/uiText.ts
- Modify: frontend/src/features/registry/ImportExportPanel.tsx
- Create: frontend/src/features/registry/ImportExportPanel.test.tsx

**Interfaces:**

- Consumes Tasks 1–3.
- Shows only template, organization, and field selection; two downloads; file upload/preview; guarded commit.

- [ ] **Step 1: Write failing UI tests.**

~~~
it("shows only tabular XLSX setup and blocks downloads without fields and organizations", async () => {
  renderImportExportPanel({ options: optionsWithOneTemplateAndTwoOrganizations() })
  expect(screen.queryByText("JSON")).not.toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Скачать список" })).toBeDisabled()
  await user.selectOptions(screen.getByLabelText("Шаблон карточки"), "template-1")
  await user.click(screen.getByLabelText("Организация 1"))
  await user.click(screen.getByLabelText("Фамилия"))
  expect(screen.getByRole("button", { name: "Скачать шаблон импорта" })).toBeEnabled()
})
~~~

- [ ] **Step 2: Verify RED.**

Run: pnpm -C frontend test:run src/features/registry/ImportExportPanel.test.tsx

Expected: FAIL because the panel still contains technical controls.

- [ ] **Step 3: Implement types, client, and panel.**

~~~
export async function getTabularXlsxCardExchangeOptions(token: string, registryId: string) { ... }
export async function downloadTabularXlsxCards(token: string, registryId: string, payload: TabularCardWorkbookPayload) { ... }
export async function downloadTabularXlsxImportTemplate(...) { ... }
export async function previewTabularXlsxImport(token: string, registryId: string, file: File) { ... }
export async function commitTabularXlsxImport(token: string, registryId: string, file: File) { ... }
~~~

Use one section-scoped options query; clear stale choices when template/options change; preserve the exact previewed File instance. Render Russian labels, explanations, status, and mapped errors only. Invalidate card/audit queries after commit. Do not make global admin queries or rely on frontend authorization.

- [ ] **Step 4: Verify GREEN and commit.**

Run: same command. Expected: PASS.

~~~
git add frontend/src/api/types.ts frontend/src/api/client.ts frontend/src/app/uiText.ts frontend/src/features/registry/ImportExportPanel.tsx frontend/src/features/registry/ImportExportPanel.test.tsx
git commit -m "feat: add tabular XLSX card exchange UI"
~~~

### Task 6: Update docs and run local release checks

**Files:**

- Modify: README.md
- Modify: PLANS.md
- Modify: docs/PROJECT_TREE.md

**Interfaces:**

- Documents XLSX-only behavior, type scope, access control, atomic creation, and verified results.

- [ ] **Step 1: Write failing documentation assertions.**

~~~
if ((rg -n "wide XLSX|Табличный XLSX|XLSX-only" README.md PLANS.md).Count -lt 2) {
  throw "Wide XLSX behavior is not documented."
}
~~~

- [ ] **Step 2: Verify RED.**

Run the shown PowerShell block. Expected: FAIL because the new user-facing contract is not yet documented. Historical phase records remain intact.

- [ ] **Step 3: Update docs and regenerate the map.**

Replace technical exchange language with the approved behavior. Add precise status and verified commands to PLANS.md. Use scripts/project-map.ps1 to update only the generated project tree.

- [ ] **Step 4: Run verification.**

~~~
backend\.venv\Scripts\python.exe -m pytest backend\tests\test_api_phase_3_import_export.py -q
pnpm -C frontend test:run src/features/registry/ImportExportPanel.test.tsx
powershell -ExecutionPolicy Bypass -File scripts\lint.ps1
powershell -ExecutionPolicy Bypass -File scripts\format.ps1 -Check
powershell -ExecutionPolicy Bypass -File scripts\typecheck.ps1
pnpm -C frontend build
powershell -ExecutionPolicy Bypass -File scripts\project-map.ps1
powershell -ExecutionPolicy Bypass -File scripts\check.ps1 -SkipRemote
~~~

Expected: focused tests, static checks, build, project map, and local check pass. Record only confirmed unrelated suite debt.

- [ ] **Step 5: Commit.**

~~~
git add README.md PLANS.md docs/PROJECT_TREE.md
git commit -m "docs: record wide XLSX card exchange"
~~~
