# Runtime Organization Selection for XLSX Exports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move saved XLSX template download and organization selection from the template editor to the `Экспорт карточек` workflow.

**Architecture:** A saved template stores only its export kind, card template and selected dynamic fields. The download request carries the current non-empty organization list and optional personnel period; `CardExportTemplateService` checks this list against RBAC immediately before rendering. The frontend separates the editor (`ExportTemplatesPanel`) from a saved-export runner in `ImportExportPanel`.

**Tech Stack:** FastAPI, Pydantic v2, SQLAlchemy, openpyxl, React, TypeScript, TanStack Query, Vitest, pytest.

**Spec:** `docs/superpowers/specs/2026-09-10-export-run-organization-selection-design.md`

## Global Constraints

- Keep business fields schema-driven; do not add employee-specific columns.
- Keep Russian-first visible UI and backend-enforced authorization.
- Preserve legacy JSON configurations while ignoring their `organization_ids` during download; remove the key on the next template save.
- Require one or more organizations on every download request and validate every selected organization on the backend.
- Do not create an Alembic migration: template configuration is existing JSON data.

---

### Task 1: Make organizations request-scoped in the export API

**Files:**
- Modify: `backend/app/schemas/card_export_templates.py:11-75`
- Modify: `backend/app/services/card_export_templates.py:84-365`
- Modify: `backend/app/api/v1/endpoints/card_export_templates.py:30-141`
- Test: `backend/tests/test_card_export_templates.py`

**Interfaces:**
- Consumes: `CardExportDownloadRequest` and persisted `CardExportTemplate.configuration_json`.
- Produces: `render_for_actor(..., organization_ids: list[UUID], period_from: date | None, period_to: date | None) -> bytes`.

- [ ] **Step 1: Write failing backend tests**

  Add tests that create templates without `organization_ids`, download a card-list template with two request organizations, reject an empty request list and an inaccessible request organization, and prove legacy persisted `organization_ids` do not override the request list.

  ```python
  template = create_template(ctx, payload=template_payload(ctx))
  sheet = workbook(download(ctx, template, organization_ids=[ctx.org.id, ctx.child.id])).active
  assert [row[2] for row in list(sheet.values)[1:]] == ["Альфа", "Бета"]

  response = ctx.client.post(f"/api/v1/card-export-templates/{template['id']}/download", json={})
  assert response.status_code == 422
  ```

- [ ] **Step 2: Run the new backend tests and confirm RED**

  Run: `backend/.venv/Scripts/python.exe -m pytest backend/tests/test_card_export_templates.py -k "request_organizations or legacy_organizations" -q`

  Expected: failure because template configuration still requires `organization_ids` and download does not accept a list.

- [ ] **Step 3: Implement the request-scoped contract**

  Remove `OrganizationScopedExportConfiguration`; keep field-only configuration models. Define `CardExportDownloadRequest.organization_ids: list[UUID] = Field(min_length=1, max_length=512)` and reject duplicates. In create/update validation, remove legacy `organization_ids` before Pydantic validation and persist only the normalized field configuration. In render, validate every requested organization using `PermissionService.can_see_organization`, then render from those organizations instead of persisted configuration. Keep personnel dates inclusive and required only for `personnel_changes`.

- [ ] **Step 4: Run backend tests and confirm GREEN**

  Run: `backend/.venv/Scripts/python.exe -m pytest backend/tests/test_card_export_templates.py -q`

  Expected: all export-template tests pass, including ordinary one-sheet and personnel per-organization-sheet behavior.

- [ ] **Step 5: Commit the backend contract**

  ```powershell
  git add backend/app/schemas/card_export_templates.py backend/app/services/card_export_templates.py backend/app/api/v1/endpoints/card_export_templates.py backend/tests/test_card_export_templates.py
  git commit -m "feat(exports): select organizations at download time"
  ```

### Task 2: Move the download UI into `Экспорт карточек`

**Files:**
- Modify: `frontend/src/api/types.ts:555-590`
- Modify: `frontend/src/api/client.ts:698-710`
- Modify: `frontend/src/features/registry/ExportTemplatesPanel.tsx`
- Modify: `frontend/src/features/registry/ImportExportPanel.tsx`
- Test: `frontend/src/api/client.test.ts`
- Test: `frontend/src/features/registry/ImportExportPanel.test.tsx`

**Interfaces:**
- Consumes: `CardExportTemplateRead`, accessible organizations from tabular XLSX options, and `downloadCardExportTemplate(token, templateId, payload)`.
- Produces: an export runner that sends `{ organization_ids, period_from?, period_to? }` and an editor with no download/organization controls.

- [ ] **Step 1: Write failing frontend tests**

  Add a test that opens `Экспорт карточек`, selects `Кадровые изменения`, sees only personnel templates, selects several organizations, enters a valid period, and expects the download client to receive all selected organization ids. Add a card-list test for `Все организации`. Add assertions that the template tab has no `Организации выгрузки`, period fields, or `Скачать XLSX` button.

  ```tsx
  await user.selectOptions(screen.getByLabelText("Вид выгрузки"), "personnel_changes");
  await user.selectOptions(screen.getByLabelText("Шаблон выгрузки"), "personnel-export");
  await user.click(screen.getByRole("button", { name: "Все организации" }));
  await user.click(screen.getByRole("button", { name: "Скачать XLSX" }));
  expect(api.downloadCardExportTemplate).toHaveBeenCalledWith("token", "personnel-export", {
    organization_ids: ["organization-1", "organization-2"],
    period_from: "2026-09-01",
    period_to: "2026-09-30",
  });
  ```

- [ ] **Step 2: Run the new frontend tests and confirm RED**

  Run: `npm --prefix frontend test -- --run src/features/registry/ImportExportPanel.test.tsx -t "saved export"`

  Expected: failure because `Экспорт карточек` still drives the unrelated tabular exchange and saved-template download remains in the editor.

- [ ] **Step 3: Implement the runner and simplify the editor**

  Make `CardExportDownloadPayload.organization_ids` required in TypeScript and serialize it in `downloadCardExportTemplate`. Remove `organizationIds`, `Все организации`, period state, download mutation and download messages from `ExportTemplatesPanel`; its configuration fingerprint and save payload contain only field mapping/field ids. In `ImportExportPanel`, query saved export templates, render the ordered `Вид выгрузки` selector, filter `Шаблон выгрузки` by the selected kind, render multiple organization selection plus `Все организации`, conditionally render personnel dates, and use the existing browser-download helper after API success. Keep tabular import controls unchanged.

- [ ] **Step 4: Run frontend tests and confirm GREEN**

  Run: `npm --prefix frontend test -- --run src/features/registry/ImportExportPanel.test.tsx src/api/client.test.ts`

  Expected: all focused tests pass; download is absent from the template editor and runs only from `Экспорт карточек`.

- [ ] **Step 5: Commit the frontend workflow**

  ```powershell
  git add frontend/src/api/types.ts frontend/src/api/client.ts frontend/src/api/client.test.ts frontend/src/features/registry/ExportTemplatesPanel.tsx frontend/src/features/registry/ImportExportPanel.tsx frontend/src/features/registry/ImportExportPanel.test.tsx
  git commit -m "feat(exports): run saved templates from export tab"
  ```

### Task 3: Integrate, document, and release

**Files:**
- Modify: `PLANS.md:8-45`
- Test: `backend/tests/test_card_export_templates.py`
- Test: `frontend/src/features/registry/ImportExportPanel.test.tsx`

**Interfaces:**
- Consumes: Tasks 1 and 2.
- Produces: a released production workflow with current operational documentation.

- [ ] **Step 1: Run integration verification**

  ```powershell
  backend/.venv/Scripts/python.exe -m pytest backend/tests/test_card_export_templates.py -q
  npm --prefix frontend test -- --run src/features/registry/ImportExportPanel.test.tsx src/api/client.test.ts
  npm --prefix frontend run typecheck
  npm --prefix frontend run lint
  npm --prefix frontend run format:check
  git diff --check
  ```

  Expected: no test failures or type/format errors; record any unrelated existing lint warning verbatim.

- [ ] **Step 2: Update the project checkpoint**

  Replace the saved-organization export contract in `PLANS.md` with the request-scoped organization contract, exact checks run, commit ids, deployed frontend asset, and production smoke result.

- [ ] **Step 3: Commit release documentation**

  ```powershell
  git add PLANS.md
  git commit -m "docs(exports): record request-scoped organization release"
  ```

- [ ] **Step 4: Push and deploy**

  ```powershell
  git push origin main
  powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1
  powershell -ExecutionPolicy Bypass -File scripts/deploy-frontend.ps1
  ```

  Expected: server checkout tracks `origin/main`, service is active, and same-origin frontend/API smoke checks pass.
