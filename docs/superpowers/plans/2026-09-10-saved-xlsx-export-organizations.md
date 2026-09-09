# Saved XLSX Export Organizations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Save multiple organizations in an XLSX export template and generate the agreed ordinary and personnel-change workbooks safely.

**Architecture:** Extend the existing JSON configuration contract rather than adding fixed employee storage. The backend validates and resolves saved organization identifiers at write and render time; the React editor persists those identifiers and removes the per-download organization selector. The XLSX renderer branches by export kind: one combined ordinary worksheet or one personnel worksheet per organization.

**Tech Stack:** FastAPI, Pydantic v2, SQLAlchemy, openpyxl, React, TypeScript, TanStack Query, Vitest, pytest.

**Spec:** `docs/superpowers/specs/2026-09-10-saved-xlsx-export-organizations-design.md`

**Status (2026-09-10):** Tasks 1–4 are implemented in commits `d7d0804f`,
`0e2f3129`, `eeee7b2d`, and `4b8aded7`; the frontend and API were deployed.
Focused backend and frontend tests, static checks, production build, server
smoke checks, and a non-mutating production UI inspection passed. The browser
inspection intentionally did not save or download an existing user template.

## Global Constraints

- Keep the model schema-driven; selected organizations are JSON configuration, not hardcoded business fields.
- Enforce organization access server-side at save and download.
- Use Russian-first UI and API error copy.
- Preserve card and template data; no destructive migration or data rewrite.
- Keep a legacy template without selected organizations editable but not downloadable.
- Use test-driven development: every production behavior begins with a focused failing test.

---

### Task 1: Expand the saved-template configuration contract

**Files:**
- Modify: `backend/app/schemas/card_export_templates.py`
- Modify: `backend/app/services/card_export_templates.py:87-147, 190-277`
- Modify: `backend/tests/test_card_export_templates.py`

**Interfaces:**
- Consumes: `CardListExportConfiguration` and `PersonnelChangesExportConfiguration`.
- Produces: both configuration models expose `organization_ids: list[UUID]` with at least one unique value; `CardExportDownloadRequest` accepts only optional period bounds.

- [ ] **Step 1: Write the failing API tests**

```python
def test_export_template_persists_multiple_organizations(export_context):
    ctx = export_context
    payload = template_payload(ctx)
    payload["configuration_json"]["organization_ids"] = [str(ctx.org.id), str(ctx.child.id)]
    template = create_template(ctx, payload=payload)
    assert template["configuration_json"]["organization_ids"] == [str(ctx.org.id), str(ctx.child.id)]


def test_export_template_rejects_empty_or_duplicate_organizations(export_context):
    ctx = export_context
    payload = template_payload(ctx)
    payload["configuration_json"]["organization_ids"] = [str(ctx.org.id), str(ctx.org.id)]
    response = ctx.client.post(f"/api/v1/registries/{ctx.registry.id}/card-export-templates", json=payload)
    assert response.status_code == 400
```

- [ ] **Step 2: Run the focused tests and verify they fail because `organization_ids` is not accepted or persisted**

Run: `backend/.venv/Scripts/python.exe -m pytest backend/tests/test_card_export_templates.py -k "persists_multiple_organizations or rejects_empty_or_duplicate_organizations" -q`

Expected: FAIL due to absent configuration support.

- [x] **Step 3: Add the configuration fields and validation**

```python
class CardListExportConfiguration(BaseModel):
    field_ids: list[UUID] = Field(min_length=1, max_length=256)
    organization_ids: list[UUID] = Field(min_length=1, max_length=512)

    @model_validator(mode="after")
    def reject_duplicate_organizations(self) -> Self:
        if len(set(self.organization_ids)) != len(self.organization_ids):
            raise ValueError("Организации шаблона не должны повторяться.")
        return self
```

Apply the same `organization_ids` and uniqueness rule to the personnel configuration. In `CardExportTemplateService._validate_configuration`, load each organization, require that it belongs to the registry's visible scope for the actor, and return the normalized organization ids alongside selected form fields.

- [x] **Step 4: Run the focused tests and verify they pass**

Run: `backend/.venv/Scripts/python.exe -m pytest backend/tests/test_card_export_templates.py -k "persists_multiple_organizations or rejects_empty_or_duplicate_organizations" -q`

Expected: PASS.

- [x] **Step 5: Commit the contract change**

```powershell
git add backend/app/schemas/card_export_templates.py backend/app/services/card_export_templates.py backend/tests/test_card_export_templates.py
git commit -m "feat(exports): save template organizations"
```

### Task 2: Render combined and per-organization worksheets

**Files:**
- Modify: `backend/app/services/card_export_templates.py:280-480`
- Modify: `backend/app/api/v1/endpoints/card_export_templates.py:99-119`
- Modify: `backend/tests/test_card_export_templates.py`

**Interfaces:**
- Consumes: saved `organization_ids`, `period_from`, and `period_to`.
- Produces: `render_for_actor(actor_user_id, template_id, period_from=None, period_to=None) -> bytes`; ordinary exports have one `Карточки` sheet and personnel exports have one unique sheet per saved organization.

- [ ] **Step 1: Write failing rendering tests**

```python
def test_card_list_export_combines_saved_organizations_without_organization_column(export_context):
    ctx = export_context
    add_card(ctx, 2, "Бета", date(2026, 9, 1), organization=ctx.child)
    template = create_template(ctx, organization_ids=[ctx.org.id, ctx.child.id])
    sheet = workbook(download(ctx, template)).active
    assert sheet.title == "Карточки"
    assert list(sheet.values)[0] == ("№ п/п", "ФИО", "Подразделение")
    assert {row[1] for row in list(sheet.values)[1:]} == {"Альфа", "Бета"}


def test_personnel_export_creates_one_sheet_per_saved_organization(export_context):
    ctx = export_context
    template = create_template(ctx, "personnel_changes", organization_ids=[ctx.org.id, ctx.child.id])
    book = workbook(download(ctx, template, period_from="2026-09-01", period_to="2026-09-30"))
    assert len(book.sheetnames) == 2
    assert all(sheet["A1"].value == "Сведения о кадровых изменениях" for sheet in book.worksheets)
```

- [ ] **Step 2: Run the focused tests and verify they fail under one-organization rendering**

Run: `backend/.venv/Scripts/python.exe -m pytest backend/tests/test_card_export_templates.py -k "combines_saved_organizations or one_sheet_per_saved_organization" -q`

Expected: FAIL because the current renderer requires `organization_id` and creates only one sheet.

- [x] **Step 3: Implement the minimal renderer change**

```python
for organization in organizations:
    cards = CardService(self.session).list_visible_cards(
        actor_user_id=actor_user_id,
        registry_id=template.registry_id,
        organization_ids=[organization.id],
        include_descendant_organizations=False,
        card_template_ids=[card_template_id],
    )
```

For `card_list`, collect the cards in configured organization order and render a single `Карточки` sheet with `№ п/п` followed only by configured fields. For `personnel_changes`, create and title a worksheet for every organization, using a sanitized unique Excel sheet title, then call the existing personnel section renderer for that organization. Validate access to every saved organization just before rendering. Update the endpoint call to omit the former required organization parameter.

- [x] **Step 4: Add and run the work-experience regression test**

```python
def test_card_list_export_formats_work_experience_as_one_russian_column(export_context):
    ctx = export_context
    field = add_work_experience_field(ctx)
    set_work_experience(ctx, field, {"days": 3, "months": 2, "years": 5, "display": "3 дня 2 месяца 5 лет"})
    template = create_template(ctx, field_ids=[ctx.fields[0].id, field.id])
    sheet = workbook(download(ctx, template)).active
    assert sheet.cell(1, 3).value == field.label
    assert sheet.cell(2, 3).value == "3 дня 2 месяца 5 лет"
```

Run: `backend/.venv/Scripts/python.exe -m pytest backend/tests/test_card_export_templates.py -k "work_experience_as_one_russian_column" -q`

Expected before implementation: FAIL with the strict work-experience parsing error.

Normalize the three component keys before `parse_work_experience`, or use validated `display` if present. Do not emit `display` as a second column.

- [x] **Step 5: Run the backend export suite and commit**

Run: `backend/.venv/Scripts/python.exe -m pytest backend/tests/test_card_export_templates.py -q`

Expected: PASS.

```powershell
git add backend/app/services/card_export_templates.py backend/app/api/v1/endpoints/card_export_templates.py backend/tests/test_card_export_templates.py
git commit -m "feat(exports): render saved organization workbooks"
```

### Task 3: Persist organizations through the TypeScript API client

**Files:**
- Modify: `frontend/src/api/types.ts:560-590`
- Modify: `frontend/src/api/client.ts:664-720`
- Modify: `frontend/src/api/client.test.ts`

**Interfaces:**
- Consumes: `CardExportTemplatePayload.configuration_json` with `organization_ids`.
- Produces: `CardExportDownloadPayload` only includes optional `period_from` and `period_to`; template create/update preserves the selected ids.

- [ ] **Step 1: Write the failing client test**

```ts
await downloadCardExportTemplate("token", "export-1", {
  period_from: "2026-09-01",
  period_to: "2026-09-30",
});
expect(JSON.parse(String(fetchMock.mock.calls.at(-1)?.[1]?.body))).toEqual({
  period_from: "2026-09-01",
  period_to: "2026-09-30",
});
```

- [ ] **Step 2: Run the focused test and verify it fails because the payload requires `organization_id`**

Run: `npm --prefix frontend test -- --run src/api/client.test.ts`

Expected: TypeScript/test failure caused by the obsolete required field.

- [x] **Step 3: Update API types and client serialization**

Define both saved configuration unions with `organization_ids: string[]`. Make `CardExportDownloadPayload` contain only optional period values and keep the `downloadCardExportTemplate` response handling unchanged.

- [x] **Step 4: Run the focused test and commit**

Run: `npm --prefix frontend test -- --run src/api/client.test.ts`

Expected: PASS.

```powershell
git add frontend/src/api/types.ts frontend/src/api/client.ts frontend/src/api/client.test.ts
git commit -m "feat(exports): align saved template client payloads"
```

### Task 4: Add multi-organization template editing UI

**Files:**
- Modify: `frontend/src/features/registry/ExportTemplatesPanel.tsx`
- Modify: `frontend/src/features/registry/ImportExportPanel.test.tsx`

**Interfaces:**
- Consumes: `options.organizations` and the extended saved-template payload.
- Produces: `organizationIds: string[]` editor state; `Все организации` sets all currently accessible ids; download uses only reporting dates.

- [ ] **Step 1: Write the failing UI tests**

```tsx
test("saves selected organizations and can select all", async () => {
  const user = await openExports();
  await user.selectOptions(screen.getByLabelText("Организации выгрузки"), ["organization-1", "organization-2"]);
  await user.click(screen.getByRole("button", { name: "Все организации" }));
  await user.click(screen.getByRole("button", { name: "Сохранить шаблон выгрузки" }));
  expect(api.createCardExportTemplate).toHaveBeenCalledWith(
    "token", "registry-1", expect.objectContaining({
      configuration_json: expect.objectContaining({ organization_ids: ["organization-1", "organization-2"] }),
    }),
  );
});
```

- [ ] **Step 2: Run the focused test and verify it fails because the selector does not exist**

Run: `npm --prefix frontend test -- --run src/features/registry/ImportExportPanel.test.tsx`

Expected: FAIL with missing `Организации выгрузки` control.

- [x] **Step 3: Implement the editor state and UI**

Use the existing accessible multi-choice control pattern from `ImportExportPanel`; do not add a new global data fetch. Include `organization_ids` in the configuration before computing `valid` and `dirty`. Load ids when selecting a saved template. Replace `Организация для выгрузки` with `Организации выгрузки` in the template editor, add `Все организации`, and disable download until the selected stored template has valid saved organizations. Keep only period controls for personnel download.

- [ ] **Step 4: Run the focused UI test and then the frontend suite**

Run: `npm --prefix frontend test -- --run src/features/registry/ImportExportPanel.test.tsx`

Run: `npm --prefix frontend run typecheck`

Expected: PASS.

- [x] **Step 5: Commit the UI change**

```powershell
git add frontend/src/features/registry/ExportTemplatesPanel.tsx frontend/src/features/registry/ImportExportPanel.test.tsx
git commit -m "feat(exports): select organizations in saved templates"
```

### Task 5: Integrate, verify, and deploy

**Files:**
- Modify: `PLANS.md`

**Interfaces:**
- Consumes: completed backend and frontend changes.
- Produces: a documented deployment record and a production XLSX smoke-test result.

- [x] **Step 1: Run focused quality checks**

```powershell
powershell -ExecutionPolicy Bypass -File scripts/test.ps1
powershell -ExecutionPolicy Bypass -File scripts/lint.ps1
powershell -ExecutionPolicy Bypass -File scripts/format.ps1 -Check
powershell -ExecutionPolicy Bypass -File scripts/typecheck.ps1
git diff --check
```

- [ ] **Step 2: Build and visually verify the UI**

Run: `powershell -ExecutionPolicy Bypass -File scripts/deploy-frontend.ps1` only after backend is pushed and server checkout is synchronized.

Verify: ordinary template download returns a valid workbook with one sheet and no organization column; personnel template returns a valid workbook with one sheet per saved organization; work experience stays one readable column.

- [x] **Step 3: Record the exact commands and observed results in `PLANS.md`**

Include the commit SHA, test commands, server smoke response, and whether any legacy templates must be edited once to choose organizations.

- [ ] **Step 4: Commit and deploy using the project workflow**

```powershell
git add PLANS.md
git commit -m "docs(exports): record multi-organization release"
powershell -ExecutionPolicy Bypass -File scripts/push-git.ps1 -Message "feat(exports): support saved organizations"
powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1
powershell -ExecutionPolicy Bypass -File scripts/deploy-frontend.ps1
```

## Plan Review

- Spec coverage: Task 1 covers saved configuration and access validation; Task 2 covers both workbook shapes and the work-experience regression; Task 3 covers the API boundary; Task 4 covers Russian-first multi-selection and all-selection; Task 5 covers checks, deployment, and legacy-template communication.
- Placeholder scan: no deferred behavior or unassigned implementation step remains.
- Type consistency: the persisted name is `organization_ids` in Pydantic, Python configuration JSON, TypeScript payloads, UI state, and tests.
