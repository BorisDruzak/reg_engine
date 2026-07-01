# Phase 5T — Admin UI Information Architecture And Guided Registry Builder

## Status

Planned next after Phase 5S live verification closeout.

## Purpose

Make the administrator UI understandable for real users. The current backend and workflows are functionally broad, but the registry/schema administration screen exposes too many technical concepts at once: registries, blocks, fields, reference lists, import/export, and reports are rendered on one canvas. This phase must improve information architecture, terminology, onboarding, and guided workflows without changing the schema-driven engine model.

This is a UX/product-readiness phase. It must not add new backend product domains unless a small API adjustment is required to support the improved UI.

## Screenshot And Code Review Summary

### Observed UI problems

1. Organization creation is mostly usable, but the user is forced to enter a technical organization code. This is technically useful, but not self-explanatory.
2. Registry creation does not explain what a registry is, what it is for, or what happens after creation.
3. The registry administration page places registry selection, form blocks, form fields, reference lists, import/export, reports, and generated-document/report controls into one large page.
4. Terms such as `Блоки формы`, `Поля формы`, and `Справочники` are technically correct but not enough for a non-technical admin. They need contextual explanations.
5. Empty panels show `Нет данных` without explaining what the user should create first.
6. Create buttons appear before prerequisites are obvious. For example, users can see `Создать блок формы` / `Создать поле формы` without understanding that they are configuring the future card structure.
7. The admin UI lacks a visible setup path: create registry -> add card sections -> add fields -> configure dropdowns -> create cards.

### Code-level cause

`frontend/src/features/registry/RegistriesAndSchema.tsx` currently owns too many responsibilities in a single component:

- registry list and registry create/edit/archive;
- schema blocks;
- schema fields;
- reference lists and reference items;
- import/export panel;
- reports panel.

The component renders these panels sequentially, which creates the current one-canvas experience.

## Product Terminology Decision

Keep backend terms unchanged, but improve user-facing terminology:

- `Registry` stays as backend/API term.
- User-facing primary label: `Реестр карточек` or `Тип карточек` depending on context.
- `Form block` becomes `Раздел карточки` in user-facing UI.
- `Form field` becomes `Поле карточки` in user-facing UI.
- `Reference list` becomes `Справочник для выбора` or `Выпадающий список` in helper text.
- `Code` becomes `Технический код` and should be hidden under advanced settings or generated automatically by default.

## Technical Code UX Decision

Technical codes are still required by the engine for stable imports, exports, integrations, schema references, and MCP/API operations. The UI should not remove codes, but it should stop making users invent them as the first mental step.

Required behavior:

- Auto-generate technical codes from names where possible.
- Show codes as `Технический код` with helper text.
- Allow manual editing through `Дополнительные настройки` / `Технические настройки`.
- Validate code uniqueness and format with clear Russian errors.

Examples:

- `Сотрудники` -> `sotrudniki` or `employees` depending on transliteration strategy.
- `Общие сведения` -> `obshchie_svedeniya`.
- `Дата рождения` -> `data_rozhdeniya`.

## Target Information Architecture

### Main navigation

Keep top-level sections simple:

1. `Обзор`
2. `Организации`
3. `Реестры карточек`
4. `Карточки`
5. `Документы и отчёты`
6. `Пользователи`
7. `Доступ`
8. `Аудит`

`Реестры карточек` should be the schema/admin area. `Карточки` should be the operator area where users create and edit actual records.

### Registry section redesign

Replace the current one-canvas registry page with a drill-down layout:

1. Registry list page.
2. Registry detail page for selected registry.
3. Tabs or steps inside registry detail:
   - `Обзор реестра`;
   - `Разделы карточки`;
   - `Поля карточки`;
   - `Справочники выбора`;
   - `Импорт и экспорт`;
   - `Шаблоны документов`;
   - `Отчёты`.

Only show the panels relevant to the selected tab.

## Guided Registry Setup Flow

Add a guided setup path for new registries:

### Step 1 — Create registry

User-facing explanation:

> Реестр карточек — это список однотипных карточек с общей структурой. Например: сотрудники, договоры, заявки, объекты имущества.

Fields:

- `Название реестра` — required.
- `Описание` — optional.
- `Технический код` — generated, advanced.

After creation:

- Auto-select the created registry.
- Show next recommended action: `Добавить первый раздел карточки`.

### Step 2 — Add card sections

Rename `Блоки формы` to `Разделы карточки`.

Explanation:

> Разделы группируют поля внутри карточки. Например: Общие сведения, Образование, Документы.

Fields:

- `Название раздела`.
- `Описание`.
- `Повторяемый раздел` with explanation: for education/history/awards where several entries are possible.
- `Технический код` — generated, advanced.

### Step 3 — Add card fields

Rename `Поля формы` to `Поля карточки`.

Explanation:

> Поля — это конкретные сведения, которые заполняются в карточке. Например: ФИО, дата рождения, статус, файл документа.

Field creation should be contextual to a selected section.

Required UX improvements:

- First choose section, then add field inside that section.
- Show field type explanations:
  - `Текст`;
  - `Число`;
  - `Дата`;
  - `Да/нет`;
  - `Выбор из справочника`;
  - `Несколько вариантов`;
  - `Файл из вложений`.
- For `select` / `multi_select`, guide user to create/select a reference list.
- For `file_ref`, explain: `Ссылка на файл, который уже загружен во вложения карточки`.

### Step 4 — Configure reference lists

Rename `Справочники` panel helper text to:

> Справочники используются для полей выбора. Например: статус, тип документа, категория, подразделение.

Required UX improvements:

- Do not show reference item panel as empty until a reference list is selected.
- Empty state: `Сначала создайте или выберите справочник`.
- For inherited/locked flags, add explanations or hide under advanced settings.

### Step 5 — Preview card form

Add a read-only preview of the future card form:

- sections in display order;
- fields inside each section;
- repeatable section marker;
- public visibility/editability markers;
- missing configuration warnings.

Examples of warnings:

- `Поле выбора не связано со справочником`.
- `В реестре нет разделов`.
- `В разделе нет полей`.

### Step 6 — Create first card

After schema is minimally valid, show CTA:

- `Перейти к карточкам`;
- `Создать первую карточку`.

## Organization UI Adjustments

Organization creation can remain mostly as-is, but technical code UX must be improved.

Required work:

- Auto-generate organization code from organization name.
- Rename `Код организации` to `Технический код организации`.
- Add helper text:
  - `Используется системой для импорта, API и уникальной идентификации. Обычно заполняется автоматически.`
- Keep manual edit available.
- Add clear duplicate-code error handling.

## Required Frontend Refactor

Split the current registry feature into smaller modules:

- `RegistryListPage` or `RegistryListPanel`;
- `RegistryDetailShell`;
- `RegistryOverviewTab`;
- `CardSectionsTab`;
- `CardFieldsTab`;
- `ReferenceListsTab`;
- `RegistryImportExportTab`;
- `RegistryDocumentsTab`;
- `RegistryReportsTab`;
- shared `TechnicalCodeField`;
- shared `GuidedEmptyState`;
- shared `RegistrySetupProgress`.

Current `RegistriesAndSchema.tsx` should no longer own the full registry admin workflow.

## Required UI States

Every empty state must answer three questions:

1. What is this section?
2. Why is it empty?
3. What should the user do next?

Examples:

- No registries:
  - `Реестров пока нет. Создайте первый реестр карточек, чтобы настроить структуру данных.`
- No sections:
  - `В этом реестре ещё нет разделов карточки. Добавьте раздел, например «Общие сведения».`
- No fields:
  - `В выбранном разделе ещё нет полей. Добавьте поле, например «ФИО» или «Дата рождения».`
- No reference lists:
  - `Справочники нужны для полей выбора. Создайте справочник, если у поля должен быть список вариантов.`

## Implementation Phases

### Phase 5T.1 — Terminology and copy pass

Required work:

- Update user-facing labels from form-centric terms to card-centric terms.
- Add helper text for registry, sections, fields, reference lists, technical codes.
- Keep backend/API terms unchanged.

Acceptance criteria:

- User can understand what a registry, section, field, and reference list are without reading documentation.
- No backend schema or API change is required.

### Phase 5T.2 — Technical code UX

Required work:

- Add reusable `TechnicalCodeField`.
- Auto-generate code from name/title/label for organizations, registries, sections, fields, reference lists, and reference items where safe.
- Allow manual editing in advanced settings.
- Keep code immutable where backend/business rules require it.

Acceptance criteria:

- Users are not forced to invent technical codes before understanding the entity.
- Tests cover auto-generation and manual override.

### Phase 5T.3 — Registry detail shell and tabs

Required work:

- Refactor registry page from one-canvas layout into registry list + selected registry detail shell.
- Add tabs/steps for overview, sections, fields, reference lists, import/export, documents, reports.
- Preserve existing API calls and mutations.

Acceptance criteria:

- Registry admin page is not a single long canvas.
- User sees only the relevant workflow at a time.
- Existing live-verified functionality remains available.

### Phase 5T.4 — Guided schema builder

Required work:

- Add setup progress and contextual CTAs.
- Hide or explain blocked actions until prerequisites are met.
- Add card form preview.
- Add configuration warnings.

Acceptance criteria:

- User can create a minimal registry schema by following visible steps.
- Empty states are instructional.

### Phase 5T.5 — Cards page alignment

Required work:

- Ensure card list filters/search/archive controls remain visible and understandable.
- Ensure field editing UX is not duplicated/confusing.
- Ensure `file_ref`, attachments, generated documents, and public links are placed in understandable card tabs/panels.

Acceptance criteria:

- Card operator can find, open, edit, and verify a card without schema-admin knowledge.

### Phase 5T.6 — Browser UAT rerun

Required work:

- Re-run the live UI scenarios affected by registry/schema/card UI changes.
- Verify system admin and registry admin flows.
- Verify scoped org admin still has clean no-error UX.

Acceptance criteria:

- No regression in Phase 5S scenarios.
- Browser/UI evidence shows a non-technical admin can follow the guided setup path.

## Non-Goals

Phase 5T must not implement:

- new backend entities;
- service desk integration;
- MDB migration;
- new MCP tools;
- new report formats;
- public-link document workflows;
- binary export bundles;
- hardcoded HR-specific registry fields.

## Required Tests

Frontend tests:

- registry create with auto-generated technical code;
- manual technical code override;
- empty registry state shows guidance;
- selected registry detail tabs render one workflow at a time;
- create section from guided step;
- create field inside selected section;
- reference list empty state requires selecting/creating a list;
- card form preview warns about missing sections/fields/reference list config;
- scoped user does not see global admin-only errors.

E2E/UAT:

- create organization with generated technical code;
- create registry with guided flow;
- add card section;
- add text/date/select/file_ref fields;
- add reference list and reference items;
- create first card from the configured registry;
- verify no regression in attachments, `file_ref`, documents, reports, and public links.

## Verification

Required before closeout:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote
pnpm -C frontend e2e
```

If backend is not changed, no Alembic migration is expected.

## Closeout Criteria

- Registry/schema UI is understandable without developer explanation.
- Technical codes are generated or clearly explained.
- Registry builder is step-based or tab-based, not one long canvas.
- Existing live-verified workflows continue to pass.
- README/PLANS/PROJECT_TREE are updated with the final result.
