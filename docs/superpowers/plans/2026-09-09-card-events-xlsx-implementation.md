# Card Events and XLSX Exports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove persisted card titles, derive card identity from `fio`, record durable card changes/dismissals with a mandatory basis, and add saved XLSX export templates including the three-section personnel-change workbook.

**Architecture:** `CardService` remains the business boundary for draft creation, visibility, lifecycle, and card mutations. A new append-only card-event service records post-activation business changes independently from expiring technical audit data. Saved export-template configuration is rendered server-side to XLSX and consumes card events plus schema-field mappings; frontend panels call only authenticated REST APIs.

**Tech Stack:** FastAPI, Pydantic, SQLAlchemy/Alembic, PostgreSQL JSONB, openpyxl, React, TypeScript, TanStack Query, Vitest, pytest.

**Spec:** `docs/superpowers/specs/2026-09-09-card-events-xlsx-design.md`

## Global Constraints

- Preserve schema-driven card values; `fio` is the fixed display-field convention required by the approved specification.
- Do not physically delete cards, events, export templates, or user data.
- All write authorization and required-basis validation execute in the backend.
- User-visible UI text and errors are Russian-first.
- New title data must never be persisted; migration removes existing `display_name` snapshots from history.
- Implement test-first: each added behavior starts with a focused failing test, then minimal production code, then the focused test passes.
- Do not stage `.playwright-cli/` or `output/`.

---

### Task 1: Persist card events, export templates, dismissed lifecycle, and title removal

**Files:**
- Create: `backend/app/models/card_event.py`
- Create: `backend/app/models/export_template.py`
- Create: `backend/migrations/versions/0034_card_events_exports_display_fio.py`
- Modify: `backend/app/models/card.py`
- Modify: `backend/app/models/registry_schema.py`
- Modify: `backend/app/models/__init__.py`
- Modify: `backend/app/domain/constants.py`
- Test: `backend/tests/test_migrations.py`
- Test: `backend/tests/test_schema_constraints.py`

**Interfaces:**
- Produces `CardEvent`, `CardEventChange`, and `CardExportTemplate` SQLAlchemy models.
- Produces lifecycle status `dismissed` and event types `change`, `dismissal`.
- Removes `Card.display_name` and `Registry.card_title_label` from ORM models and schema.

- [ ] **Step 1: Write the failing migration/model tests**

```python
def test_card_events_export_templates_and_dismissed_lifecycle_are_migrated(engine):
    upgrade_to_head(engine)
    assert table_exists(engine, "card_events")
    assert table_exists(engine, "card_event_changes")
    assert table_exists(engine, "card_export_templates")
    assert lifecycle_constraint_includes(engine, "cards", "dismissed")
    assert not column_exists(engine, "cards", "display_name")
    assert not column_exists(engine, "registries", "card_title_label")

def test_title_keys_are_removed_from_existing_audit_snapshots(session):
    event = make_audit_event(old_data_json={"display_name": "Старое", "x": 1})
    run_0034_upgrade(session)
    assert event.old_data_json == {"x": 1}
```

- [ ] **Step 2: Run the focused tests and verify they fail because the models/migration do not exist**

Run: `backend\.venv\Scripts\python.exe -m pytest backend/tests/test_migrations.py backend/tests/test_schema_constraints.py -k "card_events or export_templates or dismissed or title" -v`

Expected: failure for missing tables/columns or lifecycle status.

- [ ] **Step 3: Add the models and one Alembic migration**

```python
class CardEvent(...):
    event_type: Mapped[str]
    occurred_on: Mapped[date]
    basis_text: Mapped[str]

class CardEventChange(...):
    card_event_id: Mapped[UUID]
    old_value_json: Mapped[object | None]
    new_value_json: Mapped[object | None]

class CardExportTemplate(...):
    export_kind: Mapped[str]
    configuration_json: Mapped[dict[str, object]]
```

The migration creates indexed foreign-key tables, adds `dismissed` to the card lifecycle check, removes title columns/indexes, and updates JSONB snapshots with `old_data_json - 'display_name'` and `new_data_json - 'display_name'`.

- [ ] **Step 4: Re-run focused tests and verify they pass**

Run: same command as Step 2.

Expected: PASS.

- [ ] **Step 5: Commit the isolated persistence change**

```powershell
git add backend/app/domain/constants.py backend/app/models backend/migrations/versions/0034_card_events_exports_display_fio.py backend/tests/test_migrations.py backend/tests/test_schema_constraints.py
git commit -m "feat(cards): add events and export template persistence"
```

### Task 2: Derive display identity from `fio` and create drafts from the first template

**Files:**
- Modify: `backend/app/services/cards.py`
- Modify: `backend/app/services/registry_schema.py`
- Modify: `backend/app/schemas/cards.py`
- Modify: `backend/app/api/v1/endpoints/cards.py`
- Test: `backend/tests/test_registry_card_services.py`
- Test: `backend/tests/test_api_phase_1g.py`

**Interfaces:**
- Produces `CardService.card_display_value(card) -> str`.
- `create_card_draft_for_actor(actor_user_id, organization_id, public_access)` resolves the first active template itself.
- Card list/read/preview response uses `display_value`, not `display_name`.

- [ ] **Step 1: Write failing service/API tests**

```python
def test_first_active_template_is_used_when_creating_a_draft(session, admin, organization):
    first = make_template(position=1, fio_field=True)
    make_template(position=2, fio_field=True)
    card = CardService(session).create_card_draft_for_actor(
        actor_user_id=admin.id, organization_id=organization.id, public_access=empty_access()
    )
    assert card.card_template_id == first.id

def test_template_without_exactly_one_text_fio_field_cannot_create_a_card(session, admin, organization):
    make_template(position=1, fio_field=False)
    with pytest.raises(CardServiceError, match="поле ФИО"):
        CardService(session).create_card_draft_for_actor(...)
```

- [ ] **Step 2: Run the tests and verify the former title/template payload contract fails**

Run: `backend\.venv\Scripts\python.exe -m pytest backend/tests/test_registry_card_services.py backend/tests/test_api_phase_1g.py -k "fio or first_active_template or draft" -v`

Expected: failure because the service still accepts client template/title input or cannot derive the display value.

- [ ] **Step 3: Implement server-side template selection and `fio` projection**

```python
def _first_active_card_template_for_registry(self, registry_id: UUID) -> CardTemplate: ...
def _require_single_fio_field(self, template: CardTemplate) -> FormField: ...
def card_display_value(self, card: Card) -> str: ...
```

Remove title inputs from card-create/draft schemas and response DTOs; update every service response construction to project the derived value. Keep the raw schema field value as the only persistent source.

- [ ] **Step 4: Re-run focused tests and verify they pass**

Run: same command as Step 2.

Expected: PASS.

- [ ] **Step 5: Commit the display and draft contract change**

```powershell
git add backend/app/services/cards.py backend/app/services/registry_schema.py backend/app/schemas/cards.py backend/app/api/v1/endpoints/cards.py backend/tests/test_registry_card_services.py backend/tests/test_api_phase_1g.py
git commit -m "feat(cards): derive display from fio"
```

### Task 3: Record required-basis active-card changes and dismissals

**Files:**
- Create: `backend/app/services/card_events.py`
- Modify: `backend/app/services/cards.py`
- Modify: `backend/app/schemas/cards.py`
- Modify: `backend/app/api/v1/endpoints/cards.py`
- Test: `backend/tests/test_registry_card_services.py`
- Test: `backend/tests/test_api_phase_1g.py`

**Interfaces:**
- `CardChangeContext(basis_text: str, occurred_on: date | None)` carries a required basis for active mutations.
- `CardEventService.record_change(...)` records one event plus changed-field snapshots in the same transaction.
- `CardService.dismiss_card_for_actor(actor_user_id, card_id, occurred_on, basis_text) -> Card`.

- [ ] **Step 1: Write failing tests for basis and event boundaries**

```python
def test_active_bulk_save_requires_one_nonempty_basis_and_rolls_back(session, active_card, admin):
    with pytest.raises(CardServiceError, match="Основание изменения"):
        CardService(session).set_field_values_for_actor(..., change_context=None)
    assert read_values(active_card) == before_values

def test_active_bulk_save_records_one_change_event_with_each_real_difference(...):
    CardService(session).set_field_values_for_actor(..., change_context=CardChangeContext("Приказ № 1"))
    assert card_events(active_card) == [("change", "Приказ № 1")]
    assert event_change_count(active_card) == 2

def test_dismissal_sets_status_and_blocks_future_edits(...):
    CardService(session).dismiss_card_for_actor(..., occurred_on=date(2026, 9, 9), basis_text="Приказ")
    assert active_card.lifecycle_status == "dismissed"
```

- [ ] **Step 2: Run the focused tests and verify they fail because basis/event APIs are absent**

Run: `backend\.venv\Scripts\python.exe -m pytest backend/tests/test_registry_card_services.py backend/tests/test_api_phase_1g.py -k "basis or card_event or dismissal or dismissed" -v`

Expected: failure for absent arguments/routes/status.

- [ ] **Step 3: Implement event recording and atomic active-card writes**

```python
@dataclass(frozen=True)
class CardChangeContext:
    basis_text: str
    occurred_on: date | None = None

def set_field_values_for_actor(..., change_context: CardChangeContext | None = None) -> list[FieldValue]: ...
def dismiss_card_for_actor(..., occurred_on: date, basis_text: str) -> Card: ...
```

Keep draft writes basis-free. For active writes normalize and reject blank basis before assignments; compare snapshots and persist one event only when values changed. Add `POST /cards/{card_id}/dismissal` and Russian-safe error mapping.

- [ ] **Step 4: Re-run focused tests and verify they pass**

Run: same command as Step 2.

Expected: PASS.

- [ ] **Step 5: Commit the event/lifecycle behavior**

```powershell
git add backend/app/services/card_events.py backend/app/services/cards.py backend/app/schemas/cards.py backend/app/api/v1/endpoints/cards.py backend/tests/test_registry_card_services.py backend/tests/test_api_phase_1g.py
git commit -m "feat(cards): require basis for active changes"
```

### Task 4: Apply derived display and change context to every backend consumer

**Files:**
- Modify: `backend/app/services/audit.py`
- Modify: `backend/app/services/public_links.py`
- Modify: `backend/app/services/card_public_access.py`
- Modify: `backend/app/services/card_creation_links.py`
- Modify: `backend/app/services/card_change_notifications.py`
- Modify: `backend/app/services/documents.py`
- Modify: `backend/app/services/reports.py`
- Modify: `backend/app/services/import_export.py`
- Modify: `backend/app/mcp/tools.py`
- Modify: `backend/app/schemas/public_links.py`
- Test: `backend/tests/test_audit_schema.py`
- Test: `backend/tests/test_public_link_review_lifecycle.py`
- Test: `backend/tests/test_mcp_phase_5.py`
- Test: `backend/tests/test_tabular_xlsx_exchange.py`

**Interfaces:**
- No API/MCP/document/report/import payload exposes or accepts `display_name` for a card.
- Public/MCP active-card writes require the same `basis_text` as direct API writes.

- [ ] **Step 1: Write failing cross-consumer regression tests**

```python
def test_public_active_field_write_without_basis_is_rejected(...): ...
def test_mcp_active_card_value_write_forwards_basis_to_api(...): ...
def test_audit_and_document_context_resolve_fio_without_display_name(...): ...
def test_xlsx_list_has_no_card_title_column(...): ...
```

- [ ] **Step 2: Run the consumer-focused tests and verify they fail on the removed contract**

Run: `backend\.venv\Scripts\python.exe -m pytest backend/tests/test_audit_schema.py backend/tests/test_public_link_review_lifecycle.py backend/tests/test_mcp_phase_5.py backend/tests/test_tabular_xlsx_exchange.py -k "display_name or fio or basis" -v`

Expected: failure where a consumer still reads, writes, or renders `display_name`.

- [ ] **Step 3: Replace persisted-title use and propagate basis payloads**

Use `CardService.card_display_value` in display contexts. Remove title XLSX column parsing/metadata and create cards from organization plus schema values only. Update MCP JSON schemas and REST payload forwarding to include `basis_text` for active-card changes; retain `X-Reg-Engine-Source: mcp` and no direct database access.

- [ ] **Step 4: Re-run consumer-focused tests and verify they pass**

Run: same command as Step 2.

Expected: PASS.

- [ ] **Step 5: Commit the consumer compatibility migration**

```powershell
git add backend/app/services backend/app/mcp/tools.py backend/app/schemas/public_links.py backend/tests/test_audit_schema.py backend/tests/test_public_link_review_lifecycle.py backend/tests/test_mcp_phase_5.py backend/tests/test_tabular_xlsx_exchange.py
git commit -m "refactor(cards): remove title consumer contracts"
```

### Task 5: Add export-template REST service and personnel XLSX renderer

**Files:**
- Create: `backend/app/services/card_export_templates.py`
- Create: `backend/app/schemas/card_export_templates.py`
- Create: `backend/app/api/v1/endpoints/card_export_templates.py`
- Modify: `backend/app/api/v1/router.py`
- Modify: `backend/app/services/import_export.py`
- Test: `backend/tests/test_card_export_templates.py`
- Test: `backend/tests/test_tabular_xlsx_exchange.py`

**Interfaces:**
- CRUD routes for `/registries/{registry_id}/card-export-templates`.
- `POST /card-export-templates/{template_id}/download` returns an XLSX response.
- `CardExportTemplateService.render_for_actor(actor_user_id, template_id, organization_id, period_from, period_to) -> bytes`.

- [ ] **Step 1: Write failing export-template and workbook tests**

```python
def test_card_list_export_template_keeps_configured_field_order(...): ...
def test_personnel_export_contains_three_merged_sections_and_event_rows(...): ...
def test_personnel_export_rejects_missing_mapping_or_inaccessible_organization(...): ...
```

- [ ] **Step 2: Run tests and verify they fail because export templates/routes do not exist**

Run: `backend\.venv\Scripts\python.exe -m pytest backend/tests/test_card_export_templates.py backend/tests/test_tabular_xlsx_exchange.py -k "export_template or personnel" -v`

Expected: failure for missing service/model/route.

- [ ] **Step 3: Implement validated template configuration and XLSX rendering**

```python
class CardListExportConfiguration(BaseModel):
    field_ids: list[UUID]

class PersonnelChangesExportConfiguration(BaseModel):
    position_field_id: UUID
    structural_unit_field_id: UUID
    appointment_date_field_id: UUID
    appointment_basis_field_id: UUID
```

Validate field/template ownership, duplicate ids, field order, and actor organization visibility. Use openpyxl to create merged Russian headings, bordered section tables, date formatting, and one worksheet; query new cards by configured appointment date and events by inclusive `occurred_on` range.

- [ ] **Step 4: Re-run tests and inspect the generated workbook**

Run: same command as Step 2.

Expected: PASS; tests load the bytes with openpyxl and assert headings, merge ranges, cells, and row ordering.

- [ ] **Step 5: Commit export-template backend support**

```powershell
git add backend/app/services/card_export_templates.py backend/app/schemas/card_export_templates.py backend/app/api/v1/endpoints/card_export_templates.py backend/app/api/v1/router.py backend/app/services/import_export.py backend/tests/test_card_export_templates.py backend/tests/test_tabular_xlsx_exchange.py
git commit -m "feat(exports): add personnel xlsx templates"
```

### Task 6: Update TypeScript contracts, creation, list state, and dismissal UI

**Files:**
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/app/uiText.ts`
- Modify: `frontend/src/features/cards/SingleStageCardCreation.tsx`
- Modify: `frontend/src/features/cards/CardsWorkspace.tsx`
- Modify: `frontend/src/features/cards/CardListFilters.tsx`
- Modify: `frontend/src/styles.css`
- Test: `frontend/src/features/cards/SingleStageCardCreation.test.tsx`
- Test: `frontend/src/features/cards/CardsWorkspace.test.tsx`

**Interfaces:**
- Frontend card DTO uses `display_value`; draft payload contains no title/template id.
- `dismissCard(token, cardId, { occurred_on, basis_text })` calls the new route.
- List filtering accepts `dismissed` and a dismissed row has an explicit red class.

- [ ] **Step 1: Write failing component/client tests**

```tsx
test("draft creation shows no card name or template control and requires organization", async () => { ... });
test("dismissal dialog sends date and basis then marks the list row dismissed", async () => { ... });
test("non-superuser does not receive the archive control", async () => { ... });
```

- [ ] **Step 2: Run the focused frontend tests and verify they fail on old controls/contracts**

Run: `pnpm -C frontend test:run src/features/cards/SingleStageCardCreation.test.tsx src/features/cards/CardsWorkspace.test.tsx`

Expected: failure because the current components still expose title/template/archive behavior.

- [ ] **Step 3: Implement the visual changes in existing component patterns**

Remove the title/template controls, derive tab/list labels from `display_value`, add the compact dismissal dialog, `Уволенные` filter, red dismissed row styling, and a superuser-only archive action. Keep query invalidation and Russian mutation feedback.

- [ ] **Step 4: Re-run focused frontend tests and verify they pass**

Run: same command as Step 2.

Expected: PASS.

- [ ] **Step 5: Commit the cards workspace UI**

```powershell
git add frontend/src/api/types.ts frontend/src/api/client.ts frontend/src/app/uiText.ts frontend/src/features/cards frontend/src/styles.css
git commit -m "feat(cards): add dismissal workspace flow"
```

### Task 7: Require a basis in active-card and public editors

**Files:**
- Modify: `frontend/src/features/cards/useBlockEditor.ts`
- Modify: `frontend/src/features/cardLayout/InlineBlockEditor.tsx`
- Modify: `frontend/src/features/cards/CardsWorkspace.tsx`
- Modify: `frontend/src/pages/PublicLinkEditPage.tsx`
- Modify: `frontend/src/pages/PublicCardCreationPage.tsx`
- Test: `frontend/src/features/cards/FilledCardLayout.test.tsx`
- Test: `frontend/src/pages/PublicLinkEditPage.test.tsx`

**Interfaces:**
- Active block save accepts `{ values, basis_text }`.
- Draft save continues to call the former no-basis path.

- [ ] **Step 1: Write failing editor tests**

```tsx
test("active block cannot save until the change basis is entered", async () => { ... });
test("one active block save sends a single shared basis with changed values", async () => { ... });
test("public active edit requires a Russian basis before its request", async () => { ... });
```

- [ ] **Step 2: Run focused tests and verify they fail because the basis input/payload is absent**

Run: `pnpm -C frontend test:run src/features/cards/FilledCardLayout.test.tsx src/pages/PublicLinkEditPage.test.tsx`

Expected: failure for absent label or missing request field.

- [ ] **Step 3: Implement explicit active-card save sessions**

Add a compact required textarea only in active edit sessions. Disable `Сохранить блок` until the trimmed value is non-empty; preserve drafts and the attachment-aware `file_ref` control. Pass the basis through the existing mutation queue and keep errors beside the active block.

- [ ] **Step 4: Re-run focused tests and verify they pass**

Run: same command as Step 2.

Expected: PASS.

- [ ] **Step 5: Commit active-editor basis UI**

```powershell
git add frontend/src/features/cards/useBlockEditor.ts frontend/src/features/cardLayout/InlineBlockEditor.tsx frontend/src/features/cards/CardsWorkspace.tsx frontend/src/pages/PublicLinkEditPage.tsx frontend/src/pages/PublicCardCreationPage.tsx frontend/src/features/cards/FilledCardLayout.test.tsx frontend/src/pages/PublicLinkEditPage.test.tsx
git commit -m "feat(cards): require basis in active editor"
```

### Task 8: Build the export-template management UI and run release verification

**Files:**
- Modify: `frontend/src/features/registry/ImportExportPanel.tsx`
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/app/uiText.ts`
- Test: `frontend/src/features/registry/ImportExportPanel.test.tsx`
- Modify: `PLANS.md`

**Interfaces:**
- The panel lists/creates/archives export templates, edits ordered fields/mappings, and downloads the selected template for one organization and optional period.

- [ ] **Step 1: Write failing panel tests**

```tsx
test("saves a card-list export template with manually ordered fields", async () => { ... });
test("personnel export requests organization and inclusive period before download", async () => { ... });
test("personnel export displays backend mapping validation in Russian", async () => { ... });
```

- [ ] **Step 2: Run the focused panel tests and verify they fail because template controls are absent**

Run: `pnpm -C frontend test:run src/features/registry/ImportExportPanel.test.tsx`

Expected: failure for missing export-template controls/mutations.

- [ ] **Step 3: Implement the panel using current selectors and row actions**

Render the template list in the existing import/export workspace, use ordered field controls rather than schema-order sorting, show required organization/period controls only for the personnel kind, and surface download/validation feedback in Russian.

- [ ] **Step 4: Re-run focused panel tests and verify they pass**

Run: same command as Step 2.

Expected: PASS.

- [ ] **Step 5: Run full scoped verification, update project status, and commit**

```powershell
backend\.venv\Scripts\python.exe -m pytest backend/tests/test_migrations.py backend/tests/test_registry_card_services.py backend/tests/test_api_phase_1g.py backend/tests/test_audit_schema.py backend/tests/test_public_link_review_lifecycle.py backend/tests/test_mcp_phase_5.py backend/tests/test_tabular_xlsx_exchange.py backend/tests/test_card_export_templates.py -v
pnpm -C frontend test:run src/features/cards/SingleStageCardCreation.test.tsx src/features/cards/CardsWorkspace.test.tsx src/features/cards/FilledCardLayout.test.tsx src/features/cards/SingleStageCardCreation.test.tsx src/pages/PublicLinkEditPage.test.tsx src/features/registry/ImportExportPanel.test.tsx
powershell -ExecutionPolicy Bypass -File scripts/lint.ps1
powershell -ExecutionPolicy Bypass -File scripts/typecheck.ps1
powershell -ExecutionPolicy Bypass -File scripts/format.ps1 -Check
powershell -ExecutionPolicy Bypass -File scripts/project-map.ps1 -Check
git diff --check
```

Record exact results and known pre-existing failures in `PLANS.md`. Run the disposable PostgreSQL `_test` migration upgrade/downgrade/upgrade tests and inspect a generated personnel XLSX before any production migration. Then commit only task files and `PLANS.md`.

```powershell
git add frontend/src/features/registry/ImportExportPanel.tsx frontend/src/features/registry/ImportExportPanel.test.tsx frontend/src/api/client.ts frontend/src/api/types.ts frontend/src/app/uiText.ts PLANS.md
git commit -m "feat(exports): manage xlsx export templates"
```

## Plan Review

- Every approved requirement maps to a task: derived ФИО (Task 2), title data purge (Task 1/4), active-change basis (Task 3/7), dismissal and admin archive (Task 3/6), ordered XLSX templates (Task 5/8), and the three report sections (Task 5/8).
- No task adds a hardcoded business database column beyond the explicit `fio` display convention; personnel report field mapping stays template-driven.
- Production migration is deferred until disposable database proof, fresh external backup, preflight, and post-migration validation succeed.
