# Multiple Text Validation Conditions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let administrators configure several text validation conditions with independent messages and input modes.

**Architecture:** Canonical field validation becomes an ordered list of condition objects while accepting the legacy one-rule object as input. The backend enforces every condition; the React editor manages the list and `FieldEditorControl` uses each condition's input mode to either retain an invalid draft or reject the attempted edit.

**Tech Stack:** FastAPI, Pydantic, SQLAlchemy JSONB, Python `regex`, React, TypeScript, Vitest.

## Global Constraints

- Only text fields may contain conditions; a non-text type clears the list.
- `show_error` retains an invalid draft; `block_input` rejects the complete keyboard, paste, or autofill edit.
- All conditions must pass before persistence through cards, public links, creation links, and XLSX.
- Preserve the portable-regex, timeout, non-BMP, ECMAScript-trim, and client ReDoS protections.
- UI text is Russian-first; raw patterns and service internals are never returned in errors.

---

### Task 1: Normalize and enforce condition lists on the backend

**Files:**
- Modify: `backend/app/domain/text_validation.py`
- Modify: `backend/app/services/registry_schema.py`
- Test: `backend/tests/test_text_validation.py`
- Test: `backend/tests/test_registry_schema_field_update_contract.py`

**Interfaces:**
- `normalize_text_validation(value) -> list[dict[str, str]] | None` accepts a legacy rule or canonical list.
- Each canonical condition has `kind`, `message`, optional `pattern`, and `input_mode` (`show_error` or `block_input`).
- `validate_text_value(value, validation)` raises a message containing every failing condition separated by newlines.

- [ ] **Step 1: Write failing backend tests**

```python
def test_normalize_legacy_rule_to_show_error_list() -> None:
    assert normalize_text_validation({"kind": "russian_text", "message": "Русский"}) == [
        {"kind": "russian_text", "message": "Русский", "input_mode": "show_error"}
    ]

def test_every_condition_is_enforced() -> None:
    rules = [
        {"kind": "russian_text", "message": "Русский", "input_mode": "show_error"},
        {"kind": "regex", "pattern": "[А-Яа-яЁё -]{1,256}", "message": "Без цифр", "input_mode": "block_input"},
    ]
    with pytest.raises(TextValidationError, match="Русский.*Без цифр"):
        validate_text_value("Ста1!", rules)
```

- [ ] **Step 2: Run RED**

Run: `backend\.venv\Scripts\python.exe -m pytest backend/tests/test_text_validation.py backend/tests/test_registry_schema_field_update_contract.py -q`

Expected: failures because lists and `input_mode` are not normalized.

- [ ] **Step 3: Implement canonical list normalization**

```python
def normalize_text_validation(value: object) -> list[dict[str, str]] | None:
    raw_conditions = [value] if isinstance(value, Mapping) else value
    if raw_conditions is None:
        return None
    if not isinstance(raw_conditions, list) or not raw_conditions:
        raise TextValidationError("Text validation must be a non-empty list.")
    return [_normalize_condition(item) for item in raw_conditions]
```

`_normalize_condition` must add `show_error` to legacy objects, validate the exact canonical keys, and reuse the current portable regex validation. Aggregate all failed configured messages in order. Persist the normalized list in schema create/update and audit old/new data.

- [ ] **Step 4: Run GREEN and commit**

Run the Step 2 command. Expected: PASS.

```powershell
git add backend/app/domain/text_validation.py backend/app/services/registry_schema.py backend/tests/test_text_validation.py backend/tests/test_registry_schema_field_update_contract.py
git commit -m "feat: support multiple text validation conditions"
```

### Task 2: Propagate the list through API contracts and all write paths

**Files:**
- Modify: `backend/app/schemas/registries.py`
- Modify: `backend/app/services/cards.py`
- Modify: `backend/app/services/public_links.py`
- Modify: `backend/app/services/card_creation_links.py`
- Modify: `backend/app/services/import_export.py`
- Test: `backend/tests/test_registry_card_services.py`
- Test: `backend/tests/test_public_link_transfer_audit_services.py`
- Test: `backend/tests/test_tabular_xlsx_exchange.py`

- [ ] **Step 1: Write failing cross-path tests**

```python
def test_public_link_rejects_when_any_condition_fails() -> None:
    field.validation_json = conditions
    with pytest.raises(InvalidFieldValueError, match="Русский.*Без цифр"):
        service.set_field_value_from_public_link(..., value="Ста1!")
```

Include ordinary card, creation link, and XLSX preview assertions.

- [ ] **Step 2: Run RED**

Run: `backend\.venv\Scripts\python.exe -m pytest backend/tests/test_registry_card_services.py backend/tests/test_public_link_transfer_audit_services.py backend/tests/test_tabular_xlsx_exchange.py -q`

- [ ] **Step 3: Implement projections without special-casing input mode**

Keep `CardService._coerce_field_assignment` as the single enforcement point. Update Pydantic/OpenAPI types to accept `dict[str, Any] | list[dict[str, Any]] | None` for backwards compatibility. Public/creation projections return the canonical list.

- [ ] **Step 4: Run GREEN and commit**

```powershell
git add backend/app/schemas/registries.py backend/app/services/cards.py backend/app/services/public_links.py backend/app/services/card_creation_links.py backend/app/services/import_export.py backend/tests
git commit -m "feat: enforce text validation condition lists"
```

### Task 3: Edit several conditions in the schema studio

**Files:**
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/features/cardLayout/InlineFieldEditor.tsx`
- Modify: `frontend/src/features/registry/print/CardLayoutStudio.tsx`
- Test: `frontend/src/features/cardLayout/CardLayoutRenderer.test.tsx`
- Test: `frontend/src/features/registry/CardPrintTemplateEditor.test.tsx`

- [ ] **Step 1: Write failing UI/payload tests**

```tsx
expect(screen.getByRole("button", { name: "Создать условие" })).toBeVisible();
expect(postBody.validation_json).toEqual([
  expect.objectContaining({ input_mode: "show_error" }),
  expect.objectContaining({ input_mode: "block_input" }),
]);
```

- [ ] **Step 2: Run RED**

Run: `pnpm -C frontend exec vitest run src/features/cardLayout/CardLayoutRenderer.test.tsx src/features/registry/CardPrintTemplateEditor.test.tsx`

- [ ] **Step 3: Implement condition cards**

Replace the single select with ordered condition cards. Each card provides type, RegExp when applicable, message, mode select (`Показывать ошибку` / `Запрещать ввод`), and delete. `Создать условие` appends a Russian-text/show-error default. Submit the full array; change to non-text submits `validation_json: null`.

- [ ] **Step 4: Run GREEN and commit**

```powershell
git add frontend/src/api/types.ts frontend/src/features/cardLayout/InlineFieldEditor.tsx frontend/src/features/registry/print/CardLayoutStudio.tsx frontend/src/features/cardLayout/CardLayoutRenderer.test.tsx frontend/src/features/registry/CardPrintTemplateEditor.test.tsx
git commit -m "feat: edit multiple text validation conditions"
```

### Task 4: Apply live error and input-blocking behavior

**Files:**
- Modify: `frontend/src/features/cards/textValidation.ts`
- Modify: `frontend/src/features/cards/FieldEditorControl.tsx`
- Modify: `frontend/src/features/cards/TextValidationPopover.tsx`
- Modify: `frontend/src/pages/PublicLinkEditPage.tsx`
- Modify: `frontend/src/styles/globals.css`
- Test: `frontend/src/features/cards/textValidation.test.ts`
- Test: `frontend/src/features/cards/FieldEditorControl.test.tsx`
- Test: `frontend/src/features/cards/FilledCardLayout.test.tsx`
- Test: `frontend/src/pages/PublicLinkEditPage.test.tsx`

- [ ] **Step 1: Write failing interaction tests**

```tsx
fireEvent.change(input, { target: { value: "Ста1" } });
expect(input).toHaveValue("Ста1");
expect(input).toHaveAttribute("aria-invalid", "true");
expect(screen.getByRole("alert")).toHaveTextContent("Русский");

fireEvent.change(blockedInput, { target: { value: "Ста1" } });
expect(blockedInput).toHaveValue("Ста");
expect(onChange).not.toHaveBeenCalledWith("Ста1");
```

- [ ] **Step 2: Run RED**

Run: `pnpm -C frontend exec vitest run src/features/cards/textValidation.test.ts src/features/cards/FieldEditorControl.test.tsx src/features/cards/FilledCardLayout.test.tsx src/pages/PublicLinkEditPage.test.tsx`

- [ ] **Step 3: Implement aggregate evaluation**

`validateTextDraft` returns `{ valid, failures: TextValidationCondition[] }`. Evaluate all rules using existing portable/client-safe helpers. The control uses a proposed full value: if any `block_input` failure exists, retain the prior draft; otherwise retain the proposed draft, mark it red when `show_error` failures exist, and suppress the save callback. Render every failure message in the one noninteractive absolute `role="alert"` overlay.

- [ ] **Step 4: Run GREEN and commit**

```powershell
git add frontend/src/features/cards/textValidation.ts frontend/src/features/cards/FieldEditorControl.tsx frontend/src/features/cards/TextValidationPopover.tsx frontend/src/pages/PublicLinkEditPage.tsx frontend/src/styles/globals.css frontend/src/features/cards/textValidation.test.ts frontend/src/features/cards/FieldEditorControl.test.tsx frontend/src/features/cards/FilledCardLayout.test.tsx frontend/src/pages/PublicLinkEditPage.test.tsx
git commit -m "feat: react to text validation condition modes"
```

### Task 5: Full verification and release

- [ ] **Step 1: Run full local gate**

```powershell
powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote
pnpm -C frontend build
```

Expected: backend tests, mypy, Ruff, frontend typecheck/lint/build pass.

- [ ] **Step 2: Review and release**

Use a fresh reviewer against the full feature range. After a clean review, commit any plan/status documentation, push `main`, run `scripts/deploy.ps1`, `scripts/deploy-frontend.ps1`, and `scripts/server-check.ps1`. Browser-check the schema list and one disposable-card/public-link validation scenario without altering user-owned card data.
