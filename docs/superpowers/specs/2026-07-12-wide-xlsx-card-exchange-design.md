# Wide XLSX Card Exchange Design

**Date:** 2026-07-12

## Goal

Replace the technical row-oriented card import/export formats with one Russian-first, user-facing XLSX workflow. It must export cards as a readable table, generate a matching empty import template, and create cards from valid filled rows without bypassing the existing schema or access-control rules.

## Scope and constraints

- Remove the technical JSON, CSV, and long-row XLSX card import/export formats from both the `Импорт и экспорт` interface and REST API. There is no compatibility UI or deprecated endpoint branch.
- The only card exchange format is an `.xlsx` workbook with one visible data sheet. It is schema-driven; it never introduces fixed employee or other business columns.
- The user configures a card template, one or more organisations, and at least one supported template field before downloading an export or an empty import template.
- The first visible column is always `№ п/п`; the second is always `Организация`; selected field columns follow in the selected order.
- A newly imported card receives the selected card template and its display name is the selected template's name.
- The feature uses the existing card, field-value, permissions, audit, XLSX byte-limit, and row-limit contracts. It adds no database migration.

## User workflow

### Configure the workbook

The simplified `Импорт и экспорт` tab contains a single compact configuration surface:

1. Select an active card template in the current registry.
2. Select one or more accessible organisations.
3. Select supported fields from that template and order them with the existing compact list-control pattern.
4. Choose `Скачать список` to export existing cards or `Скачать шаблон импорта` to download empty rows.

The organisation selector presents only active organisations for which the current actor has `cards.manage` in the selected registry. A global grant can select all active organisations; a scoped grant can select only its own covered organisation tree. The client-side list is a usability aid. The backend repeats the check whenever it creates a workbook, previews an upload, and commits an upload.

The field selector shows Russian labels and optional block context. It accepts `text`, `number`, `date`, `datetime`, `bool`, `select`, and `multi_select` fields. It disables static-text, file-reference, and entity-reference fields with a Russian explanation: their values do not have a safe, stable user-facing cell contract in this initial XLSX workflow.

### Export existing cards

`Скачать список` returns one row for each visible, non-archived card that belongs to both the chosen template and one of the chosen organisations. The sequence column starts at one in the exported order. The organisation column uses an unambiguous display label. Each selected field is written using its typed display format:

- text is written as text;
- numbers remain numeric cells;
- dates and datetimes remain Excel date/time values with a Russian-readable number format;
- booleans use the Russian values `Да` and `Нет`;
- single and multiple reference values use their visible reference-list labels; multiple values are joined with `; `.

The visible data sheet has wrapped column headers, borders, filter controls, frozen header row, readable column widths, and serial numbering in the first column. It follows the table-like presentation in the supplied example without treating its business labels as product fields.

### Download and fill an import template

`Скачать шаблон импорта` returns the same visible sheet and columns, but with empty data rows. `Организация` is always column two. If the configuration selected exactly one organisation, template rows are prefilled with that organisation. If it selected several, cells offer only those organisations as an Excel validation list.

Single-reference fields include Excel validation lists of the active values from their configured reference list. Date, datetime, number, and boolean cells receive fitting formats and validations. `multi_select` cells include an explicit header note and accept a semicolon-separated sequence of the same visible reference labels because native Excel validation lists cannot make multiple selections in one cell without macros.

The workbook stores non-visible worksheet metadata that maps visible headers, permitted organisation labels, field identifiers, card-template identifier, and the format version. The metadata is a mapping aid only: the server verifies every identifier, organisation, and field against current database state and current access before it uses it.

### Preview and commit an import

The user uploads the filled template and chooses `Проверить импорт`. The preview reports totals and a concise row list: Excel row number, resolved organisation, and Russian validation errors. Typical errors include an altered template, blank organisation, organisation not selected for this template, lost access, invalid reference label, invalid typed value, or an empty data row.

`Импортировать` is enabled only for the same successfully previewed file with zero invalid rows. The commit creates one new card for every populated data row in one transaction, assigns the selected template and the template name as the card display name, and writes each selected field through `CardService`. Existing cards are never updated by this user-facing format. If any validation or write fails, no card from that upload is retained.

## Backend contract

Replace the existing technical card exchange endpoint family with a tabular XLSX endpoint family under the selected registry. The request payload for workbook generation contains `card_template_id`, ordered `field_ids`, and non-empty `organization_ids`. Upload preview and commit are multipart XLSX requests whose configuration is read from validated workbook metadata.

The backend has dedicated request/response schemas for configuration, generated workbook download, preview summary/rows, and commit summary. It retains no `csv_content`, technical `block_code`, technical `field_code`, card-id, or raw UUID column contract in the visible workbook.

The service layer is responsible for all workbook construction and parsing. It resolves the active selected template and its allowed active fields, applies `PermissionService` and card-management checks for every organisation, validates uploads against `REG_ENGINE_MAX_IMPORT_BYTES` and `REG_ENGINE_MAX_IMPORT_ROWS`, converts cells through the established field-value rules, and calls `CardService` for card and value creation. API routes remain thin request/response boundaries.

Each export records one registry `export` audit event with `format=tabular_xlsx`, selected template, selected field count, selected organisation count, and exported card count. A successful import records an aggregate registry `import_commit` audit event with the same format and counts; the normal card/value audit events remain the source of per-card history. Invalid previews do not mutate data.

## Frontend contract

The old textarea, JSON/CSV buttons, technical XLSX upload, and raw technical preview are removed. The tab becomes one Russian-first workflow with:

- template selector;
- multi-organisation selector, containing only API-returned accessible organisations;
- supported-field selector with an explicit selected-column order;
- `Скачать список` and `Скачать шаблон импорта` actions;
- XLSX file picker, `Проверить импорт`, validation summary, and guarded `Импортировать` action;
- compact Russian success, loading, empty, and error messages.

The frontend never assumes access from the selected organisation list. It maps backend error details to Russian display copy, retains preview/file identity so a changed file cannot be committed, and invalidates card and audit queries after a successful import.

## Error handling and security

- Selecting no organisation or no supported field is blocked before a request, then validated again by the API.
- A field outside the selected template, an archived field, altered metadata, an unsupported workbook version, duplicate visible headers, and a changed field type fail preview safely.
- Organisation labels must resolve uniquely within the metadata-approved selection. A changed or now-inaccessible organisation is rejected at preview and commit.
- No organisation ID, field ID, storage key, checksum, filesystem path, raw internal traceback, or technical mapping is rendered on the visible sheet or exposed in browser errors.
- The user-facing format never carries attachment binaries or accepts `file_ref` values.

## Test strategy

Backend tests cover workbook generation, table order, Russian organization/reference labels, cell formats and validations, template metadata validation, typed parsing, selected-field/template checks, empty-row handling, one and multiple organisation selection, scoped and global permission scenarios, denied/changed access at preview and commit, atomic failure, audit payloads, row/byte limits, and removal of technical-format routes.

Frontend tests cover the minimal configuration UI, selection validation, unsupported-field explanation, accessible-organisation display, export/template download requests, preview-file freshness, Russian validation rendering, disabled commit for any invalid row, and query invalidation after success. Focused XLSX tests inspect the produced workbook rather than only its bytes.

The implementation must pass focused backend and frontend suites, lint, format, type checks, production frontend build, project-map check, and the local project check before deployment. A release check must prove the visible browser workflow with an XLSX template and must not create production cards merely for visual QA.

## Non-goals

- Updating or archiving existing cards through the user-facing XLSX format.
- CSV, JSON, long-row XLSX, or other technical import/export compatibility.
- Binary attachment/document transfer.
- Macros or Excel-specific multi-select scripting.
- New fixed business fields, database tables, or migrations.
