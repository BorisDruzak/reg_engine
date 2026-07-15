# Work experience field implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the schema-driven `work_experience` field type. It accepts one duration entered as days, months, and years; calculates its anchor and current duration from the server calendar date; and always shows Russian day-month-year wording in card views and exports.

**Architecture:** Persist only a private technical `anchor_date` in the existing `field_values.value_json` column. A pure backend domain module validates duration input, calculates an anchor from the server date, recalculates the displayed duration on every read, and formats Russian declensions. `CardService` remains the sole read/write integration point, so admin cards, public links, documents, reports, and XLSX receive a calculated public value and never the anchor. One reusable frontend control renders the three number inputs and applies the same declension feedback while the user edits.

**Tech Stack:** Python 3/FastAPI, SQLAlchemy/Alembic/PostgreSQL, React/TypeScript/Vite, Vitest/Testing Library, pytest, openpyxl.

## Global constraints

- Keep this a dynamic form-field type. Do not add employee-specific columns, models, routes, or hard-coded card screens.
- Store only `{ "anchor_date": "YYYY-MM-DD" }` in `value_json`; never expose that date in card/public/API/document/XLSX output.
- The browser must not calculate the current duration. Server calendar date is authoritative for every persisted-card read and export.
- Do not schedule daily writes. Recalculation must survive a process restart because it is derived from the anchor at read time.
- After save, the server immediately returns the canonical calendar decomposition for its anchor. It must not preserve an ambiguous submitted decomposition that maps to the same anchor date.
- The visible order is always `days → months → years`; omit no unit when its value is zero.
- Russian unit forms must follow: 11–19 (`N % 100`) plural; otherwise 1 singular; 2–4 paucal; all other values plural.
- Retain existing typed-value validation, card/public RBAC, lifecycle, audit, soft-delete, and attachment restrictions.
- Do not use server-local time implicitly in tests. Inject or pass a `today: date` value to pure calculation helpers and freeze it in service tests.
- Preserve the existing XLSX import/export contract: exports use the rendered value; imports accept the same strict rendered Russian value and convert it to an anchor on the server date, so an exported row can be imported without leaking an internal date.

---

## File structure

```text
backend/
├── app/
│   ├── domain/work_experience.py                 # duration parsing, calendar arithmetic, declension
│   ├── domain/constants.py                       # register work_experience
│   ├── services/cards.py                         # assignment and calculated read value
│   ├── services/import_export.py                 # XLSX render/import support
│   ├── api/v1/endpoints/_field_values.py         # legacy single-field API coercion/read
│   └── models/registry_schema.py                 # model-level field type check source
├── migrations/versions/0030_work_experience_field.py
└── tests/
    ├── test_work_experience.py
    ├── test_cards.py                             # extend only targeted field-value scenarios
    └── test_import_export.py                     # extend XLSX round-trip coverage
frontend/src/
├── api/types.ts                                  # generated/manual FieldType union if required
├── app/uiText.ts                                 # type label and Russian UI copy
├── features/cards/workExperience.ts              # UI value model, formatting, editor coercion
├── features/cards/WorkExperienceEditor.tsx       # reusable three-input control
├── features/cards/FieldEditorControl.tsx         # dispatch to the reusable control
└── features/cards/*.test.tsx                     # focused unit and consumer-flow tests
```

## Task 1: Define the server-side duration contract with tests first

**Files:**
- Create: `backend/tests/test_work_experience.py`
- Create: `backend/app/domain/work_experience.py`

- [ ] Write pure pytest cases before implementation for:
  - Russian forms for each unit at `0, 1, 2, 4, 5, 11, 12, 14, 19, 21, 22, 25`.
  - Stable display order, including zeroes: `0 дней 0 месяцев 0 лет`.
  - valid API/editor payload `{"days": 16, "months": 3, "years": 9}` and rejection of missing keys, booleans, negatives, fractions, unknown keys, and string numerals.
  - a strict XLSX text parser accepting only the complete `N day-unit N month-unit N year-unit` order and rejecting reordered, incomplete, or malformed strings.
  - calendar boundary cases (month ends, leap day, and a next-day read) using explicit `today` arguments.
  - an ambiguous month-boundary duration that is converted to an anchor and then read on the same date as the canonical calendar decomposition, rather than the submitted decomposition.
- [ ] Implement a small dependency-free public API in `work_experience.py`:

  ```text
  WorkExperience(days: int, months: int, years: int)
  parse_work_experience(payload) -> WorkExperience
  parse_work_experience_display(text) -> WorkExperience
  anchor_for_experience(value, today) -> date
  experience_for_anchor(anchor_date, today) -> WorkExperience
  serialize_experience(value) -> {days, months, years, display}
  format_work_experience(value) -> Russian display string
  ```

  `serialize_experience` returns only `{days, months, years, display}`. It must never return `anchor_date`.
- [ ] Implement calendar subtraction/difference without approximating a month as a fixed number of days. Clamp a day only when subtracting months/years would otherwise produce an invalid calendar date, and use the matching whole-year/whole-month subtraction when deriving the read value.
- [ ] Run the focused test file and commit the isolated domain implementation.

  ```powershell
  .\scripts\test.ps1 -Backend -TestPath backend/tests/test_work_experience.py
  git add backend/app/domain/work_experience.py backend/tests/test_work_experience.py
  git commit -m "feat: add work experience duration domain"
  ```

## Task 2: Register the type and persist only its anchor

**Files:**
- Modify: `backend/app/domain/constants.py`
- Modify: `backend/app/models/registry_schema.py`
- Create: `backend/migrations/versions/0030_work_experience_field.py`
- Modify: `backend/app/services/registry_schema.py`
- Modify: `backend/app/services/cards.py`
- Modify: `backend/app/api/v1/endpoints/_field_values.py`
- Test: `backend/tests/test_migrations.py`, `backend/tests/test_cards.py`, `backend/tests/test_api_phase_*.py` where field-value API coverage lives

- [ ] Add `work_experience` to the canonical backend `FIELD_TYPES`, schema service validation, model check source, and the next Alembic migration. Follow `0020_schema_layout_static_text.py`: replace the `ck_form_fields_field_type` constraint in upgrade, and refuse downgrade if a `work_experience` field exists.
- [ ] In `CardService._coerce_field_assignment`, accept only the three-number object, calculate `anchor_for_experience` using the server calendar date, and assign exactly `value_json={"anchor_date": anchor.isoformat()}`. All other typed columns must remain null through `_apply_assignment`.
- [ ] In `CardService._read_field_value`, parse that private JSON and return the serialized result from `experience_for_anchor`; malformed historical storage should raise the existing controlled field-value service error rather than leak raw data or silently invent a duration.
- [ ] Update required-field completion and card-copy paths so `work_experience` is considered filled when its anchor exists and copied as JSON without changing the anchor.
- [ ] Make `_field_values.py` use the same domain parsing and calculated read projection for the legacy single-field endpoint; use the server date there too. Keep its 422 messages mapped by normal frontend error handling.
- [ ] Add backend integration tests proving:
  - a dynamic schema can create a `work_experience` field;
  - saving `{days: 16, months: 3, years: 9}` stores only `anchor_date`;
  - admin card reads and public-link reads return `{days, months, years, display}` and no anchor;
  - a read with the next server date increments according to calendar rules without an update query;
  - RBAC and audit behaviour match an ordinary editable schema field.
- [ ] Run migration tests against a disposable `_test` database, then focused card/API tests and commit.

  ```powershell
  .\scripts\test.ps1 -Backend -TestPath backend/tests/test_migrations.py
  .\scripts\test.ps1 -Backend -TestPath backend/tests/test_cards.py
  git add backend/app/domain/constants.py backend/app/models/registry_schema.py backend/migrations/versions/0030_work_experience_field.py backend/app/services/registry_schema.py backend/app/services/cards.py backend/app/api/v1/endpoints/_field_values.py backend/tests
  git commit -m "feat: persist work experience field anchors"
  ```

## Task 3: Make every server-rendered output show the calculated value

**Files:**
- Modify: `backend/app/services/import_export.py`
- Modify: `backend/app/services/documents.py` only if a field value bypasses `CardService` in a print/template path
- Modify: `backend/app/services/reports.py` only if a report renderer bypasses `CardService`
- Test: `backend/tests/test_import_export.py`
- Test: focused document/report tests that render a dynamic field value

- [ ] Add `work_experience` to `TABULAR_XLSX_SUPPORTED_FIELD_TYPES` for non-repeatable blocks.
- [ ] Make `TabularCardExchangeService._display_value` write `value["display"]` for this type, with a plain text Excel cell and no date number format.
- [ ] Extend `_parse_import_value` to parse the strict Russian export string through `parse_work_experience_display`; pass the resulting `{days, months, years}` object into normal `CardService` creation so the server derives a fresh anchor from its calendar date.
- [ ] Verify all document/report placeholder and card-print paths consume `CardRead` values. Where any path reads `FieldValue.value_json` directly, route it through the same calculated projection before `_format_render_value`.
- [ ] Add XLSX tests that export a card as `16 дней 3 месяца 9 лет`, verify no ISO date occurs in workbook cells/metadata, and import that exact value back into a new card. Add a malformed-text import error test.
- [ ] Run focused export/document tests and commit.

  ```powershell
  .\scripts\test.ps1 -Backend -TestPath backend/tests/test_import_export.py
  .\scripts\test.ps1 -Backend -TestPath backend/tests/test_documents.py
  git add backend/app/services/import_export.py backend/app/services/documents.py backend/app/services/reports.py backend/tests
  git commit -m "feat: render work experience in exports"
  ```

## Task 4: Add the dynamic field type and reusable editor in the frontend

**Files:**
- Modify: `frontend/src/app/uiText.ts`
- Modify: `frontend/src/api/types.ts`
- Create: `frontend/src/features/cards/workExperience.ts`
- Create: `frontend/src/features/cards/WorkExperienceEditor.tsx`
- Modify: `frontend/src/features/cards/fieldEditorUtils.ts`
- Modify: `frontend/src/features/cards/FieldEditorControl.tsx`
- Create: `frontend/src/features/cards/workExperience.test.ts`
- Create: `frontend/src/features/cards/WorkExperienceEditor.test.tsx`

- [ ] Add `work_experience` to the frontend field-type union/options and give it the Russian label `Стаж работы`.
- [ ] Define one frontend value type compatible with the public API:

  ```ts
  export type WorkExperienceValue = {
    days: number;
    months: number;
    years: number;
    display?: string;
  };
  ```

  The editor sends only `{ days, months, years }`; the optional `display` is read-only server output. Do not create client-side anchor state.
- [ ] Implement a three-input `WorkExperienceEditor`, ordered and labelled `Дни`, `Месяцы`, `Годы`. Each input accepts only a non-negative integer, preserves a user’s in-progress edit, and updates the nearby combined string immediately with the Russian declension rules.
- [ ] Update `initialEditorValue`, `coerceEditorValue`, and display formatting so this field does not become `[object Object]` in normal card, layout, or read-only surfaces. Retain the server-returned display for a persisted value and use the frontend formatter only for immediate form feedback.
- [ ] Dispatch `work_experience` from `FieldEditorControl`; preserve existing `disabled`, `onBlur`, field hint, accessible label, and reduced-motion behaviour. The control must behave as one schema field, not three separate field rows.
- [ ] Add focused unit/UI tests for all declension edge cases, a zero duration, invalid input prevention, immediate text update, disabled control, and correct outgoing object shape.
- [ ] Run TypeScript and focused Vitest tests, then commit.

  ```powershell
  cd frontend
  npm run test -- --run src/features/cards/workExperience.test.ts src/features/cards/WorkExperienceEditor.test.tsx
  npm run typecheck
  git add frontend/src/app/uiText.ts frontend/src/api/types.ts frontend/src/features/cards
  git commit -m "feat: add work experience field editor"
  ```

## Task 5: Prove all dynamic-card surfaces use the one field correctly

**Files:**
- Modify only if a consumer needs a typed guard: `frontend/src/features/cards/BlockFieldControl.tsx`, `frontend/src/features/cards/FilledCardLayout.tsx`, `frontend/src/features/cardLayout/CardFieldLayoutNode.tsx`, `frontend/src/pages/PublicLinkEditPage.tsx`, `frontend/src/features/cards/cardCompletion.ts`
- Test: `frontend/src/features/cards/FieldEditorControl.test.tsx`
- Test: `frontend/src/pages/PublicLinkEditPage.test.tsx`
- Test: relevant `CardsWorkspace`, creation, filled-card, and card-layout test files

- [ ] Exercise the new field through existing shared `FieldEditorControl` consumers: internal creation, saved-card edit, public edit, normal read-only card, and layout/print preview.
- [ ] Ensure public field defaults remain unchanged: the type is visible/editable when its normal per-field public flags permit it, but it inherits the existing public-link lifecycle and cannot bypass backend validation.
- [ ] Ensure completion logic treats a stored experience value as complete, while an absent value remains empty. Do not mark a blank field complete solely because its three editor inputs initialise to zero.
- [ ] Add regression tests at the consumer boundaries: one saved card shows `16 дней 3 месяца 9 лет`; one public save sends the three-number payload; one read-only/layout view shows display text rather than JSON; and one required blank field blocks completion.
- [ ] Run the focused frontend suites, typecheck, lint, and production build. Commit consumer changes only if needed.

  ```powershell
  cd frontend
  npm run test -- --run src/features/cards/FieldEditorControl.test.tsx src/pages/PublicLinkEditPage.test.tsx
  npm run typecheck
  npm run lint
  npm run build
  git add frontend/src
  git commit -m "test: cover work experience card surfaces"
  ```

## Task 6: Document, release, and prove the server-date behaviour

**Files:**
- Modify: `PLANS.md`
- Modify: API/OpenAPI-facing documentation only if a field-type catalog exists
- Test: release scripts and browser proof artifacts only; no production test cards containing personal data

- [ ] Record the storage contract, server-date authority, no-daily-write guarantee, and the released test evidence in `PLANS.md`.
- [ ] Run the project-local quality gate. Resolve failures caused by this work; report pre-existing failures separately without changing unrelated files.

  ```powershell
  .\scripts\check.ps1 -SkipRemote
  .\scripts\test.ps1
  ```

- [ ] Commit all remaining scoped documentation, push `main`, and deploy through project scripts. Before applying the production migration, satisfy the repository migration gate: disposable `_test` migration proof, fresh production backup, relevant preflight, synchronized server checkout, then production schema/status verification.

  ```powershell
  .\scripts\push-git.ps1 -Message "feat: add schema-driven work experience field"
  .\scripts\deploy.ps1
  .\scripts\deploy-frontend.ps1
  .\scripts\server-check.ps1
  ```

- [ ] Live-verify with a disposable non-personal card/template: choose `Стаж работы`, enter `16 / 3 / 9`, confirm immediate Russian wording, save, reload, verify no anchor date is visible, check a public edit link if enabled, and download an XLSX export that shows the same words. Capture a server-date unit/integration proof for the next-day recalculation rather than changing the production clock.

## Final verification checklist

- [ ] `work_experience` appears in backend and frontend type catalogs and the database constraint.
- [ ] The only persisted work-experience payload key is `anchor_date`.
- [ ] Admin card, public card, legacy field-value response, documents, reports, and XLSX never expose `anchor_date`.
- [ ] Russian forms are correct for 0, 1, 2, 4, 5, 11–19, 21, 22, and 25 for all three units.
- [ ] The displayed duration advances from the server date with no scheduled job or database mutation.
- [ ] The browser control sends three non-negative integer values and renders them days → months → years.
- [ ] All new/affected tests, TypeScript, lint, build, migration checks, server smoke checks, and live browser proof are recorded in `PLANS.md`.
