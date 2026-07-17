# Creation-Only XLSX Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two safe XLSX modes that create new schema-driven cards, with either strict existing choices or controlled creation of values in global flat reference lists.

**Architecture:** Keep the existing tabular XLSX API and metadata workbook as the single card-creation boundary. Extend its configuration with an import mode, a card title and an as-of date for work experience. A planning pass resolves strict choices or produces a deduplicated reference-item creation plan; commit performs that plan and card creation atomically through the existing card and reference services.

**Tech Stack:** FastAPI, SQLAlchemy, PostgreSQL/Alembic, Pydantic, openpyxl, React, TypeScript, TanStack Query, Vitest, pytest.

## Global Constraints

- Create new cards only; do not match, update, transfer, archive, or otherwise mutate existing cards.
- Preserve schema-driven cards and typed field values. Do not add fixed business fields.
- New `select` values may be created only in active global, flat, `reference_list`-backed reference lists.
- Keep `multi_select` active in the schema but unsupported in XLSX import.
- Empty required fields create a draft card; ordinary lifecycle synchronization may activate a complete card.
- Work experience uses days/months/years columns and one batch-wide as-of date, defaulting to the import date.
- Enforce RBAC on the backend: card management and reference-list edit permission are both required for enrichment.
- All mutations are audited and an invalid file must leave neither cards nor reference items.
- User-facing XLSX copy and errors are Russian-first.
- Do not touch unrelated `.playwright-cli/` files.

---

### Task 1: Define the XLSX v2 contract and render a title/stage-aware template

**Files:**
- Modify: `backend/app/schemas/import_export.py`
- Modify: `backend/app/services/import_export.py`
- Modify: `backend/app/api/v1/endpoints/import_export.py`
- Modify: `backend/tests/test_tabular_xlsx_exchange.py`
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/features/registry/ImportExportPanel.test.tsx`

**Interfaces:**
- Produces `TabularCardWorkbookRequest.import_mode: Literal["strict", "enrich_global_references"]` and `work_experience_as_of_date: date | None`.
- Produces workbook metadata format `tabular_card_xlsx_v2` with `import_mode`, `work_experience_as_of_date`, `title_header`, and `title_required=true`.
- Produces `TabularWorkbookConfiguration.import_mode`, `work_experience_as_of_date`, and title-column helpers consumed by Tasks 2–4.

- [ ] **Step 1: Write failing backend tests for v2 metadata and title column.**

Add tests that request both modes and assert the first visible columns are `№ п/п`, `Название карточки`, then the optional organization and field columns; assert metadata contains `tabular_card_xlsx_v2`, the requested mode, and an ISO as-of date. Add a test that an import with a blank title is an invalid row.

- [ ] **Step 2: Run the focused backend tests and verify RED.**

Run: `backend\.venv\Scripts\python.exe -m pytest backend/tests/test_tabular_xlsx_exchange.py -k "title or metadata" -v`

Expected: failures because title and v2 configuration do not exist.

- [ ] **Step 3: Add the minimal request/schema/configuration contract.**

Add Pydantic defaults of `strict` and `None`; resolve `None` to `date.today()` only while generating a new template. Add the two values to `TabularWorkbookConfiguration`; emit and validate them in metadata. Preserve rejection of legacy `tabular_card_xlsx_v1` upload templates rather than silently guessing their intent.

- [ ] **Step 4: Add the title column in workbook build/read paths.**

Create a fixed-title header helper using the registry `card_title_label` with a safe fallback. Write template cells as text-formatted cells, parse the title before dynamic fields, and add `display_name` to each planned row. In commit, pass the parsed name to `CardService.create_card_for_actor`.

- [ ] **Step 5: Run focused backend tests and verify GREEN.**

Run: `backend\.venv\Scripts\python.exe -m pytest backend/tests/test_tabular_xlsx_exchange.py -k "title or metadata" -v`

Expected: PASS.

- [ ] **Step 6: Update TypeScript request types and client serialization with tests.**

Extend `TabularCardWorkbookPayload` and the request helpers to carry the mode and ISO date. Add a frontend client test that generation sends both values and does not alter preview/commit multipart requests.

- [ ] **Step 7: Run the focused frontend tests and commit.**

Run: `pnpm -C frontend test:run src/api/client.test.ts src/features/registry/ImportExportPanel.test.tsx`

Expected: PASS.

Commit: `git add backend/app/schemas/import_export.py backend/app/services/import_export.py backend/app/api/v1/endpoints/import_export.py backend/tests/test_tabular_xlsx_exchange.py frontend/src/api/types.ts frontend/src/api/client.ts frontend/src/api/client.test.ts frontend/src/features/registry/ImportExportPanel.test.tsx && git commit -m "feat: add XLSX creation import contract"`

### Task 2: Add global flat reference-value planning and atomic enrichment

**Files:**
- Modify: `backend/app/services/references.py`
- Modify: `backend/app/services/import_export.py`
- Modify: `backend/app/schemas/import_export.py`
- Modify: `backend/tests/test_tabular_xlsx_exchange.py`
- Modify: `backend/tests/test_registry_card_services.py`

**Interfaces:**
- Produces `ReferenceListService.resolve_or_plan_global_import_item_for_actor(actor_user_id, list_id, raw_label) -> ImportReferenceResolution` without a mutation.
- Produces `ReferenceListService.create_global_import_item_for_actor(actor_user_id, list_id, normalized_label, display_label) -> ReferenceItem` for commit-only use.
- Produces preview field `new_reference_items: list[TabularCardImportReferenceItemRead]` and summary count `would_create_reference_items`.

- [ ] **Step 1: Write failing service tests for normalized matching.**

Cover NFKC/trim/collapsed whitespace/casefold reuse, zero-match planning, ambiguous-match error, non-global list rejection, hierarchical-list rejection, and actor-without-reference-edit permission rejection. Assert matching does not lower or otherwise rewrite the displayed label.

- [ ] **Step 2: Run the service tests and verify RED.**

Run: `backend\.venv\Scripts\python.exe -m pytest backend/tests/test_registry_card_services.py -k "global_import or normalized_reference" -v`

Expected: failures because planning APIs do not exist.

- [ ] **Step 3: Implement focused reference-list helpers.**

Add a private normalizer using `unicodedata.normalize("NFKC", value)`, whitespace collapse, and `casefold`. Reject lists with `owner_organization_id is not None`, inactive/archive state, a parented item, non-`reference_list` configuration, or no edit permission. Return an explicit resolution status of existing, create, or ambiguous; create root items only with a deterministic `import-<sha256-prefix>` code and the first cleaned source label. Keep existing manual duplicate labels legal; ambiguous imports must fail rather than select one.

- [ ] **Step 4: Run service tests and verify GREEN.**

Run: `backend\.venv\Scripts\python.exe -m pytest backend/tests/test_registry_card_services.py -k "global_import or normalized_reference" -v`

Expected: PASS.

- [ ] **Step 5: Write failing XLSX integration tests.**

For `enrich_global_references`, assert an unknown single-select text produces a preview reference-item plan, repeated normalized values produce one planned item, and commit creates it once then assigns it to every created card. Assert any invalid row rolls back planned reference items and cards. Assert `strict` reports an unknown choice as an error and never plans a reference item.

- [ ] **Step 6: Implement import planning and commit integration.**

Keep raw select text while reading an enrichment workbook. After rows are read, resolve every selectable field against its configured global list, deduplicate planned creations by `(list_id, normalized_label)`, replace values with existing or created UUIDs, then call existing card validation. On commit, re-plan inside one nested transaction, create planned items through `ReferenceListService`, validate final UUID values, create cards, and write the aggregate audit event with `import_mode` and `created_reference_items`.

- [ ] **Step 7: Run integration tests and commit.**

Run: `backend\.venv\Scripts\python.exe -m pytest backend/tests/test_tabular_xlsx_exchange.py backend/tests/test_registry_card_services.py -k "enrich or strict or global_import or normalized_reference" -v`

Expected: PASS.

Commit: `git add backend/app/services/references.py backend/app/services/import_export.py backend/app/schemas/import_export.py backend/tests/test_tabular_xlsx_exchange.py backend/tests/test_registry_card_services.py && git commit -m "feat: enrich global references during XLSX import"`

### Task 3: Complete typed XLSX behavior and harden workbook handling

**Files:**
- Modify: `backend/app/services/cards.py`
- Modify: `backend/app/services/import_export.py`
- Modify: `backend/app/api/v1/endpoints/import_export.py`
- Modify: `backend/app/core/config.py`
- Modify: `backend/tests/test_work_experience.py`
- Modify: `backend/tests/test_tabular_xlsx_exchange.py`
- Modify: `backend/tests/test_config.py`

**Interfaces:**
- Extends `CardService.set_field_value_for_actor(..., work_experience_as_of_date: date | None = None)` for import callers; ordinary callers retain `date.today()` behavior.
- Adds `REG_ENGINE_MAX_IMPORT_UNCOMPRESSED_BYTES`, `REG_ENGINE_MAX_IMPORT_SHEETS`, `REG_ENGINE_MAX_IMPORT_COLUMNS`, and `REG_ENGINE_MAX_IMPORT_CELLS` settings with safe defaults.

- [ ] **Step 1: Write failing tests for grouped work experience.**

Assert the XLSX template renders days/months/years columns instead of a display-text column. Assert all-three blank is empty, partial groups are invalid, complete groups pass, and the configured as-of date determines the stored anchor rather than the server’s current date.

- [ ] **Step 2: Run work-experience tests and verify RED.**

Run: `backend\.venv\Scripts\python.exe -m pytest backend/tests/test_work_experience.py backend/tests/test_tabular_xlsx_exchange.py -k "xlsx and experience" -v`

Expected: failures because XLSX still uses display text and `CardService` always anchors at today.

- [ ] **Step 3: Implement grouped experience parsing and explicit anchor date.**

Expand one configured `work_experience` field into exactly three workbook columns with stable metadata. Parse all three as integers into the existing `{days, months, years}` shape. Thread the configuration date through the import-only field-write call and use it in `anchor_for_experience`; retain existing external editor/API payload and default behavior.

- [ ] **Step 4: Write failing workbook-hardening tests.**

Cover rejecting a formula cell, exporting a text value beginning with `=`, rejecting excessive sheet/column/cell configuration before ordinary row parsing, and rejecting a configured uncompressed ZIP size. Add a configuration test for each new positive limit.

- [ ] **Step 5: Implement bounded workbook inspection and formula protection.**

Inspect the XLSX ZIP manifest before `openpyxl.load_workbook`; reject unsafe entry count and uncompressed totals. Open formulas separately from cached values to reject any formula in visible data cells. Escape formula-leading exported strings and mark text/identifier columns with Excel text number format. Enforce configured sheet, column, and cell limits during validation without changing the existing byte/row checks.

- [ ] **Step 6: Run focused backend tests and commit.**

Run: `backend\.venv\Scripts\python.exe -m pytest backend/tests/test_work_experience.py backend/tests/test_tabular_xlsx_exchange.py backend/tests/test_config.py -v`

Expected: PASS.

Commit: `git add backend/app/services/cards.py backend/app/services/import_export.py backend/app/api/v1/endpoints/import_export.py backend/app/core/config.py backend/tests/test_work_experience.py backend/tests/test_tabular_xlsx_exchange.py backend/tests/test_config.py && git commit -m "feat: harden typed XLSX card creation"`

### Task 4: Expose the two creation modes in the Russian-first import workspace

**Files:**
- Modify: `frontend/src/features/registry/ImportExportPanel.tsx`
- Modify: `frontend/src/features/registry/ImportExportPanel.test.tsx`
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/app/uiText.ts`
- Modify: `frontend/src/app/uiText.test.ts`

**Interfaces:**
- Uses `import_mode` and `work_experience_as_of_date` in template-download payloads.
- Renders preview `would_create_reference_items` and `new_reference_items` without exposing internal UUIDs.

- [ ] **Step 1: Write failing frontend tests.**

Cover the Russian mode selector, default strict mode, inclusion of the selected mode/date in the template request, enrich-mode help explaining free-text choices, disabled unsupported fields, and a preview block listing planned global-reference values. Assert the commit button remains disabled for invalid rows.

- [ ] **Step 2: Run the focused frontend test and verify RED.**

Run: `pnpm -C frontend test:run src/features/registry/ImportExportPanel.test.tsx`

Expected: failures because the controls and preview summary do not exist.

- [ ] **Step 3: Implement the smallest Russian-first controls.**

Add a two-option control: `Строгое создание карточек` and `Создание с пополнением глобальных справочников`. Add a date input labelled `Дата актуальности стажа`; include it only in template-download configuration. Render safe planned-item labels and counts returned by preview. Keep all current file freshness and invalid-preview guards.

- [ ] **Step 4: Run frontend quality checks and commit.**

Run: `pnpm -C frontend test:run src/features/registry/ImportExportPanel.test.tsx src/api/client.test.ts && pnpm -C frontend typecheck && pnpm -C frontend lint`

Expected: PASS.

Commit: `git add frontend/src/features/registry/ImportExportPanel.tsx frontend/src/features/registry/ImportExportPanel.test.tsx frontend/src/api/types.ts frontend/src/app/uiText.ts frontend/src/app/uiText.test.ts && git commit -m "feat: choose XLSX card creation mode"`

### Task 5: Verify the integrated contract and record the implemented scope

**Files:**
- Modify: `PLANS.md`
- Test: `backend/tests/test_api_phase_3_import_export.py`
- Test: `frontend/src/features/registry/ImportExportPanel.test.tsx`

**Interfaces:**
- Consumes the completed v2 service, API, and frontend contracts.
- Produces release-ready evidence and a current `PLANS.md` checkpoint.

- [ ] **Step 1: Add failing API-level tests for both modes.**

Use the real import endpoints against the disposable PostgreSQL fixture. Assert strict mode creates cards only from existing global reference values; enrichment creates exactly the previewed values and cards; a missing reference permission returns a safe 403; and an invalid commit leaves no partial data.

- [ ] **Step 2: Run API tests and verify RED.**

Run: `backend\.venv\Scripts\python.exe -m pytest backend/tests/test_api_phase_3_import_export.py -k "tabular or xlsx" -v`

Expected: failures until endpoint wiring and fixtures cover the new contract.

- [ ] **Step 3: Make only integration fixes required by the failing API tests.**

Do not add update/upsert behavior, non-global reference creation, or unsupported field types. Preserve the thin-route/service-layer boundary and map all browser-visible errors to Russian copy.

- [ ] **Step 4: Run the scoped test and quality gates.**

Run: `powershell -ExecutionPolicy Bypass -File scripts/test.ps1`

Run: `powershell -ExecutionPolicy Bypass -File scripts/lint.ps1`

Run: `powershell -ExecutionPolicy Bypass -File scripts/format.ps1 -Check`

Run: `powershell -ExecutionPolicy Bypass -File scripts/typecheck.ps1`

Run: `git diff --check`

Expected: each command exits `0`; record any unavailable PostgreSQL-backed tests instead of claiming they ran.

- [ ] **Step 5: Update `PLANS.md` and commit.**

Add a concise checkpoint naming both creation-only modes, supported/unsupported fields, atomic reference enrichment, limits, test evidence, and remaining exclusions. Do not claim push, deployment, migration, or live-browser proof unless actually performed.

Commit: `git add PLANS.md backend/tests/test_api_phase_3_import_export.py && git commit -m "docs: record XLSX creation import verification"`

## Plan Self-Review

- Spec coverage: Tasks 1–4 cover every approved mode, field, title, lifecycle, reference, RBAC, preview, and safety requirement; Task 5 supplies end-to-end evidence and a project checkpoint.
- Scope check: update/upsert, non-global dictionaries, multi-select, repeated blocks, and binary import are excluded in every task.
- Type consistency: Task 1 defines the configuration fields used by Tasks 2–4; Task 2 defines preview reference data used by Task 4; Task 3 extends the card write call used only by the import path.
- Completeness scan: no unassigned implementation steps or deferred requirements remain in this plan.
