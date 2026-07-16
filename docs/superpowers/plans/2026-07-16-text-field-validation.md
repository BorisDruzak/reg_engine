# Text Field Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Allow schema administrators to configure Russian-language or full-string RegExp validation for text fields, preventing invalid ordinary, public, creation, and import values while showing a transient overlay error to the editor.

**Architecture:** form_fields.validation_json already exists, so the schema service normalizes a compact rule object and exposes it in existing field APIs. A pure backend domain module is authoritative and is called during every text-value coercion. A matching frontend helper gives immediate feedback; the shared text control keeps an invalid draft until it becomes valid and displays an accessible overlay without changing card geometry.

**Tech Stack:** FastAPI, Pydantic, SQLAlchemy/PostgreSQL JSONB, Python re, React, TypeScript, Vitest, Testing Library.

## Global Constraints

- Only field_type="text" accepts a non-null validation rule.
- Rules are either { "kind": "russian_text", "message": string } or { "kind": "regex", "pattern": string, "message": string }; they are mutually exclusive.
- Russian text accepts А-Яа-яЁё, spaces, and hyphens only; empty values remain valid and required_mode is unchanged.
- RegExp validates the complete non-empty string, never just a substring.
- No raw RegExp is returned in a value-write error; the configured Russian message is safe to show.
- Validation applies to card creation, ordinary card editing, public links, and XLSX preview/commit through backend coercion.
- Existing fields with validation_json=null retain their current behavior; no migration is needed.
- The error popup must not resize the grid, steal focus, or write a value.

---

### Task 1: Add authoritative backend rule normalization

**Files:**

- Create: backend/app/domain/text_validation.py
- Modify: backend/app/domain/__init__.py
- Test: backend/tests/test_text_validation.py

**Interfaces:**

- Produces TextValidationError(ValueError), normalize_text_validation(value) -> dict[str, str] | None, and validate_text_value(value: str, validation: Mapping[str, object] | None) -> None.
- Consumed by RegistrySchemaService while creating/updating a field and CardService._coerce_field_assignment while writing a text value.

- [ ] **Step 1: Write the failing domain tests**

~~~python
def test_russian_text_allows_cyrillic_spaces_and_hyphens() -> None:
    rule = normalize_text_validation({"kind": "russian_text", "message": "Только русский"})
    validate_text_value("Иванов-Петров Иван Ёлкин", rule)

def test_russian_text_rejects_digits_and_punctuation_with_configured_message() -> None:
    with pytest.raises(TextValidationError, match="Введите русские буквы"):
        validate_text_value("Иванов 2!", {"kind": "russian_text", "message": "Введите русские буквы"})

def test_regex_requires_the_entire_non_empty_value_to_match() -> None:
    rule = normalize_text_validation({"kind": "regex", "pattern": "[А-Я]{2}", "message": "Две заглавные"})
    validate_text_value("АБ", rule)
    with pytest.raises(TextValidationError, match="Две заглавные"):
        validate_text_value("АБВ", rule)
~~~

Also test empty values, invalid/oversized regexes, unknown keys, non-string messages, and unsupported kinds.

- [ ] **Step 2: Run the domain test to verify RED**

Run:

~~~powershell
backend\.venv\Scripts\python.exe -m pytest backend/tests/test_text_validation.py -q
~~~

Expected: FAIL because app.domain.text_validation does not exist.

- [ ] **Step 3: Implement the pure domain helper**

~~~python
RUSSIAN_TEXT_PATTERN = re.compile(r"[А-Яа-яЁё -]+")

def validate_text_value(value: str, validation: Mapping[str, object] | None) -> None:
    if not value.strip() or validation is None:
        return
    if validation["kind"] == "russian_text":
        valid = RUSSIAN_TEXT_PATTERN.fullmatch(value) is not None
    else:
        valid = re.fullmatch(str(validation["pattern"]), value) is not None
    if not valid:
        raise TextValidationError(str(validation["message"]))
~~~

normalize_text_validation must allow only the stated keys, compile the regex at schema-write time, and limit a custom pattern to 512 characters.

- [ ] **Step 4: Run the domain test to verify GREEN**

Run the command from Step 2.

Expected: PASS with every rule-shape and full-match case passing.

- [ ] **Step 5: Commit**

~~~powershell
git add backend/app/domain/text_validation.py backend/app/domain/__init__.py backend/tests/test_text_validation.py
git commit -m "feat: add text field validation contract"
~~~

### Task 2: Expose validation through schema and public field contracts

**Files:**

- Modify: backend/app/schemas/registries.py:84-145
- Modify: backend/app/services/registry_schema.py:663-917, 1530-1578
- Modify: backend/app/services/public_links.py:80-115, 1260-1290
- Modify: backend/app/services/card_creation_links.py:280-310, 640-670
- Test: backend/tests/test_registry_schema_field_update_contract.py
- Test: backend/tests/test_public_link_hint_payloads.py

**Interfaces:**

- FormFieldCreate, FormFieldUpdate, and FormFieldRead expose validation_json: dict[str, Any] | None.
- RegistrySchemaService field-create and field-update methods accept a `validation_json` keyword, normalize it, and persist the rule.
- Public and creation-link field projections pass validation_json through to the client.

- [ ] **Step 1: Write failing schema tests**

~~~python
def test_text_field_validation_is_persisted_and_included_in_field_audit() -> None:
    field = service.create_field_for_actor(
        actor_user_id=admin.id, block_id=block.id, code="fio", label="ФИО",
        field_type="text",
        validation_json={"kind": "russian_text", "message": "Введите ФИО русскими буквами"},
    )
    assert field.validation_json == {"kind": "russian_text", "message": "Введите ФИО русскими буквами"}
    assert latest_audit.new_data_json["validation_json"] == field.validation_json

def test_schema_rejects_text_validation_for_non_text_field() -> None:
    with pytest.raises(RegistrySchemaError, match="Text validation"):
        service.create_field_for_actor(
            actor_user_id=admin.id, block_id=block.id, code="birth_date",
            label="Дата рождения", field_type="date",
            validation_json={"kind": "russian_text", "message": "Ошибка"},
        )
~~~

Extend a public-link field payload test to assert that a public editable text field includes its configured rule.

- [ ] **Step 2: Run focused schema tests to verify RED**

~~~powershell
backend\.venv\Scripts\python.exe -m pytest backend/tests/test_registry_schema_field_update_contract.py backend/tests/test_public_link_hint_payloads.py -q
~~~

Expected: FAIL because schemas and field service methods do not accept validation_json.

- [ ] **Step 3: Implement schema persistence and audit**

Add the Pydantic fields and a validation_json parameter to create/update service methods. Compute an effective rule during update, reject explicitly supplied non-null validation for every non-text type, write it to FormField, and include it in both old/new audit data. Clear the rule if the field type changes away from text.

~~~python
if effective_field_type != "text" and candidate_validation is not None:
    raise RegistrySchemaError("Text validation is available only for text fields.")
effective_validation = (
    normalize_text_validation(candidate_validation)
    if effective_field_type == "text"
    else None
)
~~~

- [ ] **Step 4: Run focused schema tests to verify GREEN**

Run the command from Step 2.

Expected: PASS; read/write round-trip, audit, non-text rejection, and public projection pass.

- [ ] **Step 5: Commit**

~~~powershell
git add backend/app/schemas/registries.py backend/app/services/registry_schema.py backend/app/services/public_links.py backend/app/services/card_creation_links.py backend/tests/test_registry_schema_field_update_contract.py backend/tests/test_public_link_hint_payloads.py
git commit -m "feat: configure text field validation"
~~~

### Task 3: Enforce validation in the shared backend value coercion path

**Files:**

- Modify: backend/app/services/cards.py:47-53, 1077-1119, 2185-2195
- Test: backend/tests/test_registry_card_services.py
- Test: backend/tests/test_api_phase_2k.py
- Test: backend/tests/test_public_link_transfer_audit_services.py
- Test: backend/tests/test_tabular_xlsx_exchange.py

**Interfaces:**

- CardService._coerce_field_assignment calls validate_text_value before returning _FieldAssignment(value_text=value).
- InvalidFieldValueError contains only the configured user message on a validation mismatch.

- [ ] **Step 1: Write failing write-path tests**

~~~python
def test_card_text_value_rejects_configured_russian_text_violation() -> None:
    field.validation_json = {"kind": "russian_text", "message": "Введите ФИО русскими буквами"}
    with pytest.raises(InvalidFieldValueError, match="Введите ФИО русскими буквами"):
        service.set_field_value_for_actor(
            actor_user_id=admin.id, card_id=card.id, field_id=field.id, value="Иванов 7"
        )

def test_public_link_text_value_rejects_regex_and_preserves_old_value() -> None:
    field.validation_json = {"kind": "regex", "pattern": "[А-Я]{2}", "message": "Введите две буквы"}
    with pytest.raises(InvalidFieldValueError, match="Введите две буквы"):
        card_service.set_field_value_from_public_link(
            actor_public_link_id=public_link.id, card_id=card.id,
            field_id=field.id, value="АБВ"
        )
    assert stored.value_text == "АБ"
~~~

Add an XLSX preview/commit case with an invalid text cell and assert its controlled row/field message.

- [ ] **Step 2: Run focused write-path tests to verify RED**

~~~powershell
backend\.venv\Scripts\python.exe -m pytest backend/tests/test_registry_card_services.py backend/tests/test_api_phase_2k.py backend/tests/test_public_link_transfer_audit_services.py backend/tests/test_tabular_xlsx_exchange.py -q
~~~

Expected: FAIL because text coercion currently accepts every string.

- [ ] **Step 3: Add the single coercion-point enforcement**

~~~python
if field_model.field_type == "text":
    if not isinstance(value, str):
        raise InvalidFieldValueError("Text fields require a string value.")
    try:
        validate_text_value(value, field_model.validation_json)
    except TextValidationError as exc:
        raise InvalidFieldValueError(str(exc)) from exc
    return _FieldAssignment(value_text=value)
~~~

Do not add duplicate validators to public-link, import, or creation services: each already reaches _coerce_field_assignment.

- [ ] **Step 4: Run focused write-path tests to verify GREEN**

Run the command from Step 2.

Expected: PASS, including public-link preservation and XLSX rejection.

- [ ] **Step 5: Commit**

~~~powershell
git add backend/app/services/cards.py backend/tests/test_registry_card_services.py backend/tests/test_api_phase_2k.py backend/tests/test_public_link_transfer_audit_services.py backend/tests/test_tabular_xlsx_exchange.py
git commit -m "feat: enforce text field validation"
~~~

### Task 4: Add schema-editor controls and typed frontend API data

**Files:**

- Modify: frontend/src/api/types.ts:193-250
- Modify: frontend/src/features/cardLayout/InlineFieldEditor.tsx
- Modify: frontend/src/features/cardLayout/CardLayoutRenderer.test.tsx
- Modify: frontend/src/App.test.tsx only if API mock payload typing requires it

**Interfaces:**

- Produces TextValidationRule and adds validation_json?: TextValidationRule | null to field read/create/update types.
- InlineFieldEditor edits only the selected text-field rule and submits it through the existing field update.

- [ ] **Step 1: Write failing editor tests**

~~~tsx
await user.click(screen.getByText("Проверка значения"));
await user.selectOptions(screen.getByLabelText("Тип проверки"), "russian_text");
await user.clear(screen.getByLabelText("Подсказка при ошибке"));
await user.type(screen.getByLabelText("Подсказка при ошибке"), "Введите ФИО русскими буквами");
await user.click(screen.getByRole("button", { name: "Сохранить" }));
expect(onCommitField).toHaveBeenCalledWith(expect.objectContaining({
  validation_json: { kind: "russian_text", message: "Введите ФИО русскими буквами" },
}));
~~~

Add a RegExp test that exposes both Регулярное выражение and Подсказка при ошибке, and a field-type change test that clears the rule after selecting Дата.

- [ ] **Step 2: Run the editor test to verify RED**

~~~powershell
pnpm -C frontend exec vitest run src/features/cardLayout/CardLayoutRenderer.test.tsx
~~~

Expected: FAIL because no validation controls or typed payload exist.

- [ ] **Step 3: Implement the disclosure**

Render details with summary Проверка значения only for a text field. Its Тип проверки select has none, russian_text, and regex. Store null for none; fill editable Russian defaults when selecting a rule; clear the rule whenever a type becomes non-text.

- [ ] **Step 4: Run the editor test to verify GREEN**

Run the command from Step 2.

Expected: PASS; each rule’s controls and submitted payload are asserted.

- [ ] **Step 5: Commit**

~~~powershell
git add frontend/src/api/types.ts frontend/src/features/cardLayout/InlineFieldEditor.tsx frontend/src/features/cardLayout/CardLayoutRenderer.test.tsx frontend/src/App.test.tsx
git commit -m "feat: edit text validation rules"
~~~

### Task 5: Show shared transient validation feedback without saving invalid drafts

**Files:**

- Create: frontend/src/features/cards/textValidation.ts
- Create: frontend/src/features/cards/TextValidationPopover.tsx
- Modify: frontend/src/features/cards/FieldEditorControl.tsx
- Modify: frontend/src/features/cards/FieldEditorControl.test.tsx
- Modify: frontend/src/features/cardLayout/CardFieldLayoutNode.tsx
- Modify: frontend/src/features/cards/FilledCardLayout.tsx
- Modify: frontend/src/pages/PublicLinkEditPage.tsx
- Modify: frontend/src/styles/globals.css
- Test: frontend/src/features/cards/FilledCardLayout.test.tsx
- Test: frontend/src/pages/PublicLinkEditPage.test.tsx

**Interfaces:**

- validateTextDraft(value, validation) returns { valid: true } or { valid: false, message: string }.
- FieldEditorControl accepts validation?: TextValidationRule | null, retains invalid text in local state, and invokes existing onChange only for valid text.
- TextValidationPopover takes message, visible, and onDismiss; its timer is 4,000 ms and restarts on a new error.

- [ ] **Step 1: Write failing client tests**

~~~tsx
await user.type(screen.getByRole("textbox", { name: "ФИО" }), "Иванов 2");
expect(onChange).not.toHaveBeenCalledWith("Иванов 2");
expect(screen.getByRole("alert")).toHaveTextContent("Введите ФИО русскими буквами");
expect(screen.getByRole("textbox", { name: "ФИО" })).toHaveValue("Иванов 2");

await user.clear(screen.getByRole("textbox", { name: "ФИО" }));
await user.type(screen.getByRole("textbox", { name: "ФИО" }), "Иванов");
expect(onChange).toHaveBeenLastCalledWith("Иванов");
~~~

Use fake timers to assert dismissal after 4,000 ms. Add saved-card and public-link tests proving an invalid draft does not call a mutation.

- [ ] **Step 2: Run focused client tests to verify RED**

~~~powershell
pnpm -C frontend exec vitest run src/features/cards/FieldEditorControl.test.tsx src/features/cards/FilledCardLayout.test.tsx src/pages/PublicLinkEditPage.test.tsx
~~~

Expected: FAIL because no local validation, retained draft, or overlay exists.

- [ ] **Step 3: Implement shared validation and overlay**

Mirror only the two supported rule kinds using JavaScript RegExp anchored as ^(?:pattern)$. If a server-provided rule cannot be compiled, fail closed using its configured message. In the text branch of FieldEditorControl, retain invalid draft text and suppress onChange; on recovery, send the valid value and close the error. Render an absolutely positioned role="alert" popover from the card field node; reuse it for public editing and keep it outside grid flow.

- [ ] **Step 4: Run focused client tests to verify GREEN**

Run the command from Step 2.

Expected: PASS; message, timer, no invalid mutation, valid recovery, saved-card, and public-link paths pass.

- [ ] **Step 5: Commit**

~~~powershell
git add frontend/src/features/cards/textValidation.ts frontend/src/features/cards/TextValidationPopover.tsx frontend/src/features/cards/FieldEditorControl.tsx frontend/src/features/cards/FieldEditorControl.test.tsx frontend/src/features/cardLayout/CardFieldLayoutNode.tsx frontend/src/features/cards/FilledCardLayout.tsx frontend/src/features/cards/FilledCardLayout.test.tsx frontend/src/pages/PublicLinkEditPage.tsx frontend/src/pages/PublicLinkEditPage.test.tsx frontend/src/styles/globals.css
git commit -m "feat: show text validation feedback"
~~~

### Task 6: Verify, release, and record the feature

**Files:**

- Modify: PLANS.md

**Interfaces:**

- Consumes the completed backend and frontend contracts.
- Produces verified release evidence; no database schema change is expected.

- [ ] **Step 1: Run full relevant verification**

~~~powershell
backend\.venv\Scripts\python.exe -m pytest backend/tests/test_text_validation.py backend/tests/test_registry_schema_field_update_contract.py backend/tests/test_registry_card_services.py backend/tests/test_api_phase_2k.py backend/tests/test_public_link_transfer_audit_services.py backend/tests/test_tabular_xlsx_exchange.py -q
pnpm -C frontend exec vitest run src/features/cardLayout/CardLayoutRenderer.test.tsx src/features/cards/FieldEditorControl.test.tsx src/features/cards/FilledCardLayout.test.tsx src/pages/PublicLinkEditPage.test.tsx
pnpm -C frontend exec tsc --noEmit
pnpm -C frontend lint
pnpm -C frontend build
git diff --check
~~~

Expected: targeted tests, TypeScript, lint, build, and diff check pass. The existing Vite chunk-size advisory may remain.

- [ ] **Step 2: Record, publish, and live-verify**

Update PLANS.md with test counts, the no-migration decision, deployment asset, server checks, and a browser proof that an invalid value stays visible and the popup closes without a write. Then:

~~~powershell
git add PLANS.md
git commit -m "docs: record text field validation release"
git push origin main
powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1
powershell -ExecutionPolicy Bypass -File scripts/deploy-frontend.ps1
powershell -ExecutionPolicy Bypass -File scripts/server-check.ps1
~~~

Expected: server checkout follows origin/main, the service is active, same-origin smoke checks pass, and the popup does not resize the card grid or save invalid data.
