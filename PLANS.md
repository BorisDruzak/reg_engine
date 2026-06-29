# PLANS.md

## Project

Registry Engine is a configurable web engine for schema-driven registries. It is not a hardcoded employee registry.

## Current Status

Completed phases:

- Phase 1B: Core Schema v1 database foundation.
- Phase 1C: Organization tree and RBAC services.
- Phase 1D: Registry schema and dynamic cards.
- Phase 1E: Public links, transfer, and audit.
- Phase 1E.1: Core service hardening before API.
- Phase 1F: REST API foundation and service wiring.
- Phase 1G: Current API/service hardening.
- Phase 1H: Bootstrap and seed.
- Phase 1I: Login and session flow.
- Phase 1J: User and access management API.
- Phase 1K.1: Authenticated admin shell.
- Phase 1K.2: Registry and card frontend workflows.
- Phase 1K.3: Dynamic card form editing.
- Phase 1K.4: Public-link edit page.
- Phase 1K.5: Frontend browser validation pass.
- Phase 1K.6: Russian UI localization.
- Phase 1L: Current implementation stabilization.
- Phase 2.0: Documents product scope decision.
- Phase 2A: Document storage architecture.
- Phase 2B: Attachment backend foundation.
- Phase 2E: Attachment security and live validation slice for attachment-first backend.
- Phase 2F: Attachment backend hardening before next document phases.
- Phase 2C: Generated document templates backend foundation.
- Phase 2D: Frontend document workflows.
- Phase 2G: Document template management UI.
- Phase 2H: Public-link attachment workflows.
- Phase 2I: Public-link attachment limit semantics and bugfixes.
- Phase 2K.0: Admin workflow API gap audit.
- Phase 2K.1: Organization Units API.
- Phase 2K.2: Registry Update And Archive API.
- Phase 2K.3: Card Block Instance Archive API.
- Phase 2K.4: Bulk Card Values Update API.
- Phase 2K.5: API Coverage And Live Validation.
- Phase 2K: Core Backend API Completeness.
- Phase 2L.0: Admin UI Mutation Foundation.
- Phase 2L.1: Organization Management UI.
- Phase 2L.2: User Management UI.
- Phase 2L.3: Access Grant Management UI.
- Phase 2L.4: Registry Management UI.
- Phase 2L.5: Schema Builder UI.
- Phase 2L.6: Reference List Management UI.
- Phase 2L.7: Card Create, Metadata, And Editor UI.
- Phase 2L.8: Public Link Admin Controls UI.
- Phase 2L.9: Admin UI Live Validation.
- Phase 2J.0: `file_ref` Planning And ADR.
- Phase 2J.1: `file_ref` Database And Model Foundation.
- Phase 2J.2: `file_ref` Backend Service Support.
- Phase 2J.3: `file_ref` Transfer Behavior.
- Phase 2J.4: `file_ref` API Support.
- Phase 2J.5: `file_ref` Frontend Authenticated Editor.
- Phase 2J.6: `file_ref` Generated Document Rendering.
- Phase 2J.7: `file_ref` Live Validation.
- Phase 2M: Binary `.docx` Template Upload And Template Versioning.
- Phase 2N: PDF Conversion.
- Phase 3A: Card Export Foundation.
- Phase 3B: Import Preview And Mapping.
- Phase 3C: Import Commit And Export Polish.
- Phase 4A: Report Foundation API.

Current stop point:

- Phase 2I public-link attachment limit semantics and bugfixes are completed.
- Phase 2K.0 admin workflow API gap audit is completed and recorded in
  `docs/PHASE_2K_ADMIN_API_READINESS.md`.
- Phase 2K.1 Organization Units API is completed.
- Phase 2K.2 Registry Update And Archive API is completed.
- Phase 2K.3 Card Block Instance Archive API is completed.
- Phase 2K.4 Bulk Card Values Update API is completed.
- Phase 2K.5 API Coverage And Live Validation is completed.
- Phase 2K Core Backend API Completeness is completed.
- Phase 2J.0 `file_ref` planning and ADR is completed and recorded in
  `docs/ADR/0007-file-ref-dynamic-field.md`.
- Phase 2J.1 `file_ref` database and model foundation is completed:
  migration `0008_file_ref_field_values`, metadata support, and model smoke
  tests are in place.
- Production PostgreSQL is migrated to `0008_file_ref_field_values` after
  backup, preflight, disposable PostgreSQL verification, and post-checks.
- Phase 2J.2 `file_ref` backend service support is completed: authenticated
  card editors can set/read/clear same-card active attachment references;
  wrong-card and archived attachment selections are rejected; archived
  referenced attachment metadata remains readable; public-link `file_ref`
  editing remains blocked.
- Phase 2J.3 `file_ref` transfer behavior is completed: active referenced
  attachments are copied as target-card attachment links pointing to the same
  stored file, while archived references are cleared and recorded in transfer
  audit metadata.
- Phase 2J.4 `file_ref` API support is completed: authenticated card field
  value endpoints accept `card_attachment.id`/`null` and card reads return safe
  attachment metadata without storage keys, filesystem paths, checksums, or
  stored-file ids.
- Phase 2J.5 `file_ref` frontend authenticated editor is completed: the
  Russian card editor lists existing card attachments, allows selecting and
  clearing a `file_ref`, shows empty and archived states, and keeps inline file
  upload out of the `file_ref` control.
- Phase 2J.6 `file_ref` generated document rendering is completed:
  `docx_text_v1` renders active references as attachment title/original
  filename text, empty values as empty text, and archived references with an
  `(архив)` marker, without embedding files or adding download URLs.
- Phase 2J.7 `file_ref` live validation is completed on disposable
  PostgreSQL and temporary storage: schema creation, attachment upload,
  `file_ref` set/read, generated document rendering, transfer copy semantics,
  audit metadata, and cleanup were verified.
- Phase 2L.0 Admin UI Mutation Foundation is completed.
- Phase 2L.1 Organization Management UI is completed.
- Phase 2L.2 User Management UI is completed.
- Phase 2L.3 Access Grant Management UI is completed.
- Phase 2L.4 Registry Management UI is completed.
- Phase 2L.5 Schema Builder UI is completed.
- Phase 2L.6 Reference List Management UI is completed.
- Phase 2L.7 Card Create, Metadata, And Editor UI is completed.
- Phase 2L.8 Public Link Admin Controls UI is completed.
- Phase 2L.9 Admin UI Live Validation is completed.
- Phase 2L core admin UI product-completeness phase is completed: full admin
  CRUD UI for organizations, users, access grants, registries, schema builder,
  reference lists, cards, attachments, generated documents, public links, and
  audit has browser validation coverage.
- Phase 2J is complete.
- Phase 2M binary `.docx` template upload and template versioning is
  completed as an authenticated backend API and migration slice.
- Production PostgreSQL is migrated to
  `0009_document_template_versions` after fresh backup, preflight,
  disposable PostgreSQL verification, Alembic upgrade, post-checks, backend
  service restart, and server check.
- Phase 2N PDF conversion is completed for authenticated `docx_text_v1`
  generated documents. Binary `.docx` layout conversion to PDF and public
  generated-document workflows remain deferred.
- Phase 3A Card Export Foundation is completed as an authenticated backend API
  slice: JSON and CSV card export use card visibility scope, preserve
  schema-driven block/instance/field structure, export attachment/generated
  document metadata only, and write audit events.
- Phase 3B Import Preview And Mapping is completed as an authenticated backend
  API slice: CSV preview maps rows by `block_code.field_code`, validates
  organization/card scope and dynamic values through card service rules, returns
  row-level errors, and does not mutate cards, field values, files, or audit.
- Phase 3C Import Commit And Export Polish is completed as an authenticated
  backend API slice: CSV commit reuses preview validation, applies atomic
  create/update batches, groups new-card rows by optional `import_key`, and
  writes import audit.
- Phase 4A Report Foundation API is completed: migration `0010_reports`,
  backend report templates/runs, JSON report output storage, scoped
  reads/downloads, and audit are implemented, pushed, deployed, and migrated in
  production.
- Production PostgreSQL is migrated to `0010_reports` after fresh backup,
  preflight, disposable PostgreSQL verification, Alembic upgrade, post-checks,
  backend service restart, live OpenAPI route verification, and server check.
- Next planned work by order is Phase 5 MCP Over API Only unless report
  frontend UI/polish or non-JSON report output is explicitly prioritized first.
- Later explicit phases remain report frontend UI/polish, non-JSON report
  outputs, and Phase 5 MCP.
- XLSX export/import, import/export frontend UI, binary attachment/document
  export, report frontend UI/polish, non-JSON report outputs, and MCP remain
  deferred until their explicit phases.
- Operational tooling supports same-origin frontend serving from `frontend/dist` through the backend service and `scripts/deploy-frontend.ps1`.

## Core Rules

- Keep the engine schema-driven.
- Do not create a hardcoded employee table.
- Do not add fixed HR-only fields.
- Keep card structure in registries, blocks, fields, and typed values.
- Keep backend access checks as the security boundary.
- Keep public-link editing backend-validated.
- Keep normal deletes as archive behavior.
- Keep the frontend Russian-first for user-facing text.
- Keep Phase 2 storage roots and operational values outside Git.
- Keep `file_ref` generic: it must not become an HR-specific document field.

## Current Admin UI Gap

The backend exposes the core REST operations needed for Phase 2L admin UI
foundation: organizations, org units, users, roles, permissions, access grants,
registries, blocks, fields, reference lists/items, cards, repeatable block
instances, bulk card values, attachments, generated documents, public links,
and audit reads. Phase 2K.0 records the API readiness matrix in
`docs/PHASE_2K_ADMIN_API_READINESS.md`. Phase 2K.5 completed the API coverage
and live validation checkpoint. No planned Phase 2K backend API gaps remain
before Phase 2L.

The current authenticated frontend now covers the complete core admin
workspace:

- Phase 2L.0 now provides shared admin mutation API client functions, reusable
  Russian-first form/dialog/confirmation/feedback components, localized error
  mapping, and an E2E smoke path that opens every admin section without console
  errors;
- organizations can be created, edited, and archived through Russian-first UI;
- users can be created, edited, password-reset, and archived through
  Russian-first UI; roles and permissions remain read-only in this phase;
- access grants can be issued and revoked through Russian-first UI with
  explicit organization/registry/descendant scope summary;
- registries can be created, updated, and archived through Russian-first UI;
  registry schema block/field create, update, and archive workflows are exposed
  through Russian-first UI; reference lists and reference items can be created,
  updated, archived, and selected for `select`/`multi_select` schema fields;
- cards can be created, metadata-edited, archived, edited through existing
  per-field controls, edited through atomic bulk save, and managed with
  repeatable block-instance add/archive controls;
- authenticated public-link list/create/disable controls are available on the
  card workspace and expose separate attachment-upload limit semantics;
- Phase 2L.9 added a full browser validation path that creates organization,
  user, access grant, registry, schema, reference list/items, card, field
  values, attachment, generated document, public link, and audit evidence from
  the Russian UI without Swagger/manual API calls.

Phase 2L exists to close the remaining frontend workflow gaps before advanced
document, import/export, report, or MCP phases.

## Phase 2: Documents And Attachments

Status: in progress.

Approved direction so far:

- Card-level attachments first.
- Local filesystem storage backend through a storage abstraction, configured outside Git.
- Generated `.docx` documents use schema-driven card data through the approved `docx_text_v1` renderer.
- Public-link attachment list/upload/download is available for active public edit links.
- Public-link attachment upload limits are separate from public field-edit usage limits.

Completed Phase 2 work:

- Phase 2.0 captured the product scope decision and accepted attachment-first direction.
- Phase 2A accepted the attachment storage architecture and metadata model.
- Phase 2B added attachment metadata models, migration `0005_attachments`, local filesystem storage abstraction, attachment service, authenticated attachment endpoints, and tests.
- Phase 2E completed live security validation for the attachment-first backend slice using disposable data and temporary storage.
- Phase 2F hardened upload bounds, storage cleanup, filename/download headers, runtime settings, scanner mode handling, and attachment lifecycle documentation.
- Phase 2C added `document_templates`, `generated_documents`, backend-only `docx_text_v1` rendering, generated file storage, audit, and archive behavior.
- Phase 2D added authenticated Russian-first card-workspace panels for attachments and generated documents, plus generated-document API endpoints needed by the UI.
- Phase 2G added authenticated Russian-first template creation and archive controls for existing `docx_text_v1` document templates.
- Phase 2H added public-link attachment list/upload/download for active public edit links without adding public archive/delete, generated-document controls, `file_ref`, PDF conversion, import/export, MCP, or a new migration.
- Phase 2I separated public field-edit usage limits from public attachment upload limits, added rollback storage cleanup, clarified download streaming deferral, and fixed public no-file UI validation text.
- Phase 2J.0 accepted the `file_ref` dynamic field type ADR without adding backend code, frontend code, API endpoints, or migrations.
- Phase 2J.1 added `field_values.value_attachment_id`, registered the generic
  `file_ref` field type, added migration `0008_file_ref_field_values`, and
  added model/migration smoke coverage. Type registration supports schema
  persistence. Value-setting/read service semantics, transfer behavior, and
  REST API metadata were completed in later Phase 2J slices; frontend UI,
  public-link editing, import/export, PDF, reports, and MCP remain deferred.
- Phase 2J.2 added backend service support for authenticated `file_ref`
  set/read/clear behavior, same-card active attachment validation, archived
  referenced attachment metadata reads, safe audit behavior, and explicit
  public-link edit blocking. Transfer behavior, REST value API metadata,
  frontend UI, and generated document rendering were completed in later Phase
  2J slices; public-link `file_ref` editing, import/export, PDF, reports, and
  MCP remain deferred.
- Phase 2J.3 added transfer behavior for active `file_ref` values by creating
  a new target-card `card_attachments` link that points to the same
  `stored_file_id`; archived `file_ref` references are cleared on transfer and
  recorded in transfer audit metadata.
- Phase 2J.4 added authenticated REST card value API support for `file_ref`.
  Single-field and card-read responses expose safe metadata with attachment id,
  title, original filename, content type, content length, scanner status, and
  archive status.
- Phase 2J.5 added authenticated Russian-first frontend `file_ref` editing.
  The schema builder exposes the generic `file_ref` field type, the card editor
  lists existing card attachments as selectable candidates, supports clear,
  shows empty/archived states, excludes `file_ref` from bulk save, and keeps
  inline upload out of the `file_ref` control. Public-link `file_ref` editing,
  import/export, PDF, reports, and MCP remain deferred.
- Phase 2J.6 added generated document rendering for `file_ref` in
  `docx_text_v1`: active references render as attachment title/original
  filename text, empty values render as empty text, and archived references
  render with an `(архив)` marker. Generated documents still do not embed
  attachment bytes or add download URLs.
- Phase 2J.7 completed live validation on disposable PostgreSQL and temporary
  storage for the full `file_ref` flow: create schema, upload attachment, set
  and read metadata, generate document text, transfer card, verify target-card
  attachment link, verify transfer audit metadata, and clean up test resources.
- Phase 2M added `document_template_versions`, migration
  `0009_document_template_versions`, authenticated binary `.docx` template
  upload, binary version upload/list API, generated-document
  `template_version_id`, and latest-version rendering for `docx_binary_v1`.
  Public document workflows, binary template download, binary `.docx` layout
  conversion to PDF, advanced Word run/content-control templating,
  import/export, reports, and MCP remain deferred.
- Phase 2N added authenticated PDF generation for `docx_text_v1` templates.
  PDFs are rendered directly from schema-driven text placeholders, stored
  through the generated-document storage abstraction, listed/downloaded through
  existing generated-document workflows, exposed in the Russian card document
  UI, and audited with `generated_document_pdf_generate`.

## Phase 2J: `file_ref` Dynamic Field Type

Status: completed.

Purpose: add a generic dynamic field type that references an existing card attachment from the same card, without adding new storage, public-link file-ref editing, PDF conversion, import/export, reports, or MCP.

### Phase 2J.0: Planning And ADR

Status: completed.

Required decisions:

- `file_ref` references `card_attachments.id`, not `stored_files.id`.
- `file_ref` is a single attachment reference in the first implementation; `multi_file_ref` is deferred.
- `file_ref` uses existing attachment upload/list/download flows. It does not upload bytes inline in the first implementation.
- Public-link editing of `file_ref` is deferred.
- Transfer behavior must not copy the old `card_attachment.id` directly into the new card.
- Generated documents render `file_ref` as attachment title/original filename text only.

Acceptance criteria:

- ADR records the decisions above before code starts:
  `docs/ADR/0007-file-ref-dynamic-field.md`.
- PLANS.md states all sub-phases, tests, non-goals, and transfer behavior.
- No backend, frontend, migration, or API implementation starts in Phase 2J.0.

Completion evidence:

- `docs/ADR/0007-file-ref-dynamic-field.md` was added.
- Phase 2J transfer behavior is fixed: active referenced attachments are copied
  as new target-card `card_attachments` rows pointing at the same stored file;
  archived referenced attachments are cleared on the target with audit metadata.
- Phase 2J generated document behavior is fixed: render title/original filename
  text only; do not embed files or links.
- No backend, frontend, migration, API, PDF, import/export, reports, MCP, or
  business-specific document-field implementation was added in Phase 2J.0.
- Verification on 2026-06-30: `git diff --check`,
  `scripts/format.ps1 -Check`, and `scripts/check.ps1 -SkipRemote` passed.

### Phase 2J.1: Database And Model Foundation

Status: completed.

Required work after Phase 2J.0 acceptance:

- Add migration, expected as `0008_file_ref_field_values` or equivalent.
- Add `field_values.value_attachment_id uuid nullable` referencing `card_attachments.id`.
- Add an index such as `ix_field_values_field_id_value_attachment_id`.
- Add `file_ref` to supported dynamic field types and related check constraints/constants.
- Keep `file_ref` generic and schema-driven.

Acceptance criteria:

- Migration applies cleanly on disposable PostgreSQL.
- Metadata/schema tests cover the new column, FK, index, and allowed field type.
- No HR-specific document field is added.

Completion evidence:

- Added migration `0008_file_ref_field_values`.
- Added nullable `field_values.value_attachment_id` referencing
  `card_attachments.id`.
- Added index `ix_field_values_field_attachment`.
- Added `file_ref` to the generic dynamic field type check.
- Added model/migration smoke tests for column, FK, index, and allowed type.
- Type registration now supports schema persistence, but no `file_ref`
  value-setting/read service semantics, REST value API metadata behavior,
  frontend UI, public-link `file_ref` editing, import/export, PDF, reports, MCP,
  or HR-specific document model was added in Phase 2J.1.
- Verification on 2026-06-30: targeted model/migration tests passed; local
  `scripts/check.ps1 -SkipRemote` passed; disposable PostgreSQL `*_test` smoke
  passed; production migration moved from `0007_public_link_limits` to
  `0008_file_ref_field_values` after backup/preflight/post-checks; backend
  service restart and `scripts/server-check.ps1` passed.

### Phase 2J.2: Backend Service Support

Status: completed.

Required work:

- Allow registry admins to create `form_fields.field_type=file_ref`.
- Let authenticated card editors set a `file_ref` value to an existing active attachment of the same card.
- Let authenticated card editors clear a `file_ref` value with `null`.
- Reject references to attachments from another card.
- Reject setting a new `file_ref` value to an archived attachment.
- Preserve existing `file_ref` values on read if the referenced attachment is later archived, returning archived metadata instead of silently deleting the value.
- Keep public-link edit for `file_ref` blocked/deferred.

Acceptance criteria:

- Service tests cover set, read, clear, wrong-card rejection, archived-attachment rejection, and archived-reference read behavior.
- Audit records field value changes without exposing storage keys or filesystem paths.
- Public-link `file_ref` edits are denied without consuming public-link field
  edit usage.

Completion evidence:

- `CardService` stores `file_ref` in `field_values.value_attachment_id`.
- `CardService` returns safe `FileRefValueRead` metadata with attachment id,
  title, original filename, content type, content length, scanner status, and
  `archived_at`.
- Service validation rejects wrong-card attachment ids and archived attachment
  ids for new values.
- Clearing with `null` removes the `file_ref` value.
- Archived referenced attachment metadata remains readable.
- `PublicLinkService` denies public-link `file_ref` edits.
- Service tests cover set/read/clear, wrong-card rejection, archived-attachment
  rejection, archived-reference read behavior, public-link denial, and audit
  safety without storage keys, checksums, stored file ids, or filesystem paths.
- No REST value API metadata, frontend UI, generated document rendering,
  transfer behavior, import/export, PDF, reports, MCP, or business-specific
  document-field implementation was added in Phase 2J.2.

### Phase 2J.3: Transfer Behavior

Status: completed.

Required behavior:

- When a card transfer copies dynamic values, `file_ref` must not point from the new card to the old card's `card_attachment.id`.
- Preferred behavior: create a new `card_attachment` row for the target card pointing to the same `stored_file_id`, copy title/description/position as appropriate, and point the new field value to the new `card_attachment.id`.
- If the referenced old attachment is archived at transfer time, either preserve a read-only archived reference according to explicit rules or clear it with a documented audit entry. Preferred behavior is to copy only active attachment links.

Acceptance criteria:

- Transfer tests prove the new card has its own `card_attachment` link.
- New card `file_ref` points to the new attachment link, not the old one.
- Old and new attachment links may share the same `stored_file_id`; binary bytes are not duplicated.
- Archived referenced attachments are cleared on the new card and recorded in
  transfer audit metadata.

Completion evidence:

- `CardService.transfer_card_for_actor` creates new target-card
  `card_attachments` rows for active `file_ref` values.
- Copied target attachment links reuse the same `stored_file_id` and copy
  title, description, and position; binary bytes are not duplicated.
- New card `field_values.value_attachment_id` points to the new target-card
  attachment link, not the old source-card attachment link.
- Archived or invalid source attachment references are cleared on the target
  value and listed in `cleared_file_ref_attachment_ids` on the transfer audit
  event.
- Transfer tests cover active copy, target-link independence, shared stored
  file metadata, archived-reference clearing, and audit metadata.
- No REST value API metadata, frontend UI, generated document rendering,
  import/export, PDF, reports, MCP, or business-specific document-field
  implementation was added in Phase 2J.3.

### Phase 2J.4: API Support

Status: completed.

Required work:

- Existing card field update endpoint accepts `file_ref` values as `card_attachment.id` or `null`.
- Card read returns `file_ref` as metadata, not only a raw UUID.
- Metadata should include: `attachment_id`, `title`, `original_filename`, `content_type`, `content_length_bytes`, `scanner_status`, and `archived_at`.
- Existing attachment list endpoint remains the source of selectable file candidates.

Acceptance criteria:

- API tests cover set, clear, read metadata, wrong-card rejection, and archived-reference read behavior.
- API responses do not expose storage key, filesystem path, or storage root.

Completion evidence:

- `PATCH /api/v1/cards/{card_id}/fields/{field_id}` accepts a
  same-card `card_attachment.id` UUID for `file_ref` and accepts `null` to
  clear the value.
- `GET /api/v1/cards/{card_id}` returns `file_ref` values as safe attachment
  metadata in both flat `fields` and nested `blocks -> instances -> fields`
  structures.
- Returned metadata is limited to `attachment_id`, `title`,
  `original_filename`, `content_type`, `content_length_bytes`,
  `scanner_status`, and `archived_at`.
- API tests cover set, clear, card read metadata, wrong-card rejection,
  archived-reference metadata reads, archived-reference set rejection, and
  absence of storage keys, filesystem paths, checksums, and stored-file ids.
- No frontend UI, public-link `file_ref` editing, generated document
  rendering, import/export, PDF, reports, MCP, migration, or business-specific
  document-field behavior was added.

### Phase 2J.5: Frontend Authenticated Editor

Status: completed.

Required work:

- Add authenticated `file_ref` editor to the schema-driven card form.
- The editor lists active attachments for the current card.
- The editor allows selecting an attachment and clearing the value.
- The editor shows Russian-first labels and empty states:
  - `Файл`;
  - `Выберите файл`;
  - `Нет вложений`;
  - `Сначала загрузите файл во Вложения`;
  - `Файл архивирован`;
  - `Очистить файл`.
- Do not add inline file upload inside the `file_ref` control in this phase.

Acceptance criteria:

- Frontend unit/e2e tests cover list/select/save/clear/empty-state behavior.
- Dynamic form stays schema-driven and does not hardcode HR document fields.

Completion evidence:

- The authenticated card editor renders `file_ref` as a Russian-first file
  selector backed by existing active card attachments.
- The editor allows selecting an attachment, clearing the selected file, and
  saving `card_attachment.id`/`null` through the existing field-value API.
- Empty states show `Нет вложений` and
  `Сначала загрузите файл во Вложения`.
- Archived referenced values remain visible with `Файл архивирован` while
  active candidates still come from the attachment list endpoint.
- `file_ref` is excluded from bulk field save to avoid accidental clearing.
- The schema builder exposes the generic `file_ref` field type.
- Unit tests cover list/select/save/clear/empty/archived states; Playwright
  smoke covers schema creation, upload, select, and save.
- No inline upload inside the `file_ref` control, public-link `file_ref`
  editing, generated document rendering, import/export, PDF, reports, MCP,
  backend migration, or business-specific document field was added.

### Phase 2J.6: Generated Document Rendering

Status: completed.

Required work:

- `docx_text_v1` renders `file_ref` as attachment title/original filename text.
- Empty `file_ref` renders safely as empty text.
- Archived referenced attachment renders with an archive marker, for example `(архив)`.
- Do not embed binary files into generated `.docx`.
- Do not add PDF conversion.
- Do not add download URLs into generated documents in this phase.

Acceptance criteria:

- Generated document tests cover active file ref, empty file ref, and archived file ref rendering.
- Rendering remains schema-driven and does not assume HR templates.

Completion evidence:

- `DocumentService` formats `FileRefValueRead` as safe text for
  `docx_text_v1` placeholders.
- Active references render as attachment title plus original filename when
  they differ.
- Empty `file_ref` values render as empty text.
- Archived referenced attachments render with an `(архив)` marker.
- Generated documents do not embed referenced attachment bytes and do not add
  attachment download URLs.
- Tests cover active, empty, archived, no dataclass/UUID leakage, and no
  download-link output.
- No database migration, API endpoint, frontend change, public-link
  `file_ref` editing, PDF conversion, import/export, reports, MCP, or
  business-specific document field was added.

### Phase 2J.7: Live Validation

Status: completed.

Required work:

- Use disposable PostgreSQL database and temporary storage.
- Create a registry schema with a `file_ref` field.
- Upload an attachment to a card.
- Set `file_ref` to that attachment.
- Read the card and verify metadata.
- Generate a document and verify rendered text.
- Transfer the card and verify the new card has its own attachment link and `file_ref` points to it.
- Clean up disposable database/storage.

Acceptance criteria:

- No production personal data is used.
- No production storage is mutated.
- Local checks, PostgreSQL-backed tests, frontend tests, project-map check, README, and PLANS update pass.

Completion evidence:

- Server validation used disposable database `reg_engine_2j7_file_ref_test`
  and temporary storage `/tmp/reg_engine_2j7_file_ref_storage`.
- Alembic upgraded the disposable database through
  `0008_file_ref_field_values`.
- Validation created a registry schema with a `file_ref` field, uploaded an
  attachment to a card, set `file_ref`, and read safe metadata.
- Generated `.docx` content rendered `File: Validation scan (validation.pdf)`
  without leaking attachment ids, dataclass output, or attachment API links.
- Transfer created a new target-card `card_attachments` link pointing to the
  same stored file and recorded `copied_file_ref_attachments` in audit
  metadata.
- Disposable database and temporary storage were removed after validation.

## Phase 2J Non-Goals

Phase 2J must not implement:

- `multi_file_ref`;
- public-link `file_ref` editing;
- inline upload inside the `file_ref` editor;
- `file_ref` import/export;
- PDF conversion;
- binary `.docx` template upload;
- template versioning;
- reports;
- MCP;
- MDB migration;
- service desk integration.

## Phase 2K: Core Backend API Completeness

Status: completed.

Purpose: close remaining non-document backend API gaps that are needed for a complete registry administration workflow before moving to advanced documents, import/export, reports, or MCP.

Phase 2K must not implement:

- PDF conversion;
- binary `.docx` template upload;
- template versioning;
- import/export;
- reports;
- MCP;
- service desk integration;
- hardcoded HR fields.

### Phase 2K.0: Admin Workflow API Gap Audit

Status: completed.

Required work:

- Verify the actual API surface needed by Phase 2L:
  organizations, org units, users, roles, permissions, access grants,
  registries, blocks, fields, reference lists/items, cards, block instances,
  public links, attachments, generated documents, and audit.
- Record which workflows already have complete API support and which require
  backend additions in Phase 2K.
- Keep frontend-only gaps in Phase 2L, not Phase 2K.

Acceptance criteria:

- PLANS.md or a linked implementation note lists the API readiness matrix.
- No new business-specific tables or HR-specific fields are introduced.
- No frontend implementation is added in this audit step.

Completion evidence:

- API readiness matrix: `docs/PHASE_2K_ADMIN_API_READINESS.md`.
- Backend gaps confirmed for Phase 2K: org units API, registry update/archive,
  card block instance archive, and atomic bulk card values update.
- Frontend-only gaps remain assigned to Phase 2L.

### Phase 2K.1: Organization Units API

Status: completed.

Required work:

- Add API for `org_units` management:
  - list by organization;
  - create;
  - read;
  - update;
  - archive.
- Keep `org_units` as filters/reference data, not RBAC boundaries in v1.
- Enforce organization-scope permissions through backend services.

Acceptance criteria:

- Org-unit API tests cover allowed and denied access paths.
- Org-unit list can be used by frontend filters and dynamic `org_unit_ref` fields.

Completion evidence:

- Added `GET/POST /api/v1/organizations/{organization_id}/org-units`.
- Added `GET/PATCH/DELETE /api/v1/org-units/{org_unit_id}`.
- Org units remain filters/reference data and are not RBAC boundaries.
- Reads use organization visibility scope; create/update/archive require
  `organizations.manage` in organization scope or superuser.
- Create/update/archive write `audit_events` with `object_type=org_unit`.
- Tests added in `backend/tests/test_api_phase_2k.py`.

### Phase 2K.2: Registry Update And Archive API

Status: completed.

Required work:

- Add registry update endpoint for safe metadata changes such as name/description/status where supported.
- Add registry archive endpoint.
- Keep schema-changing operations in block/field APIs.
- Keep archive behavior soft; no physical deletion.

Acceptance criteria:

- Registry update/archive tests cover permission boundaries.
- Archived registries do not disappear from audit/history-sensitive reads where archive scope is requested.

Completion evidence:

- Added `PATCH /api/v1/registries/{registry_id}` for safe metadata updates:
  name, description, and draft/active lifecycle status.
- Added `DELETE /api/v1/registries/{registry_id}` for soft archive.
- Added `include_archive` support for registry list/read.
- Registry archive sets `lifecycle_status=archived` and `archived_at`.
- Registry update/archive require `registry.schema.manage`.
- Create/update/archive write `audit_events` with `object_type=registry`.
- Tests added in `backend/tests/test_api_phase_2k.py`.

### Phase 2K.3: Card Block Instance Archive API

Status: completed.

Required work:

- Add archive endpoint for repeatable `card_block_instances`.
- Prevent archiving required/non-repeatable system instances where unsafe.
- Ensure archived block instances are hidden from normal card reads but available in archive scope if supported.

Acceptance criteria:

- Tests cover repeatable instance archive, non-repeatable/system guardrails, and value retention.

Completion evidence:

- Added `DELETE /api/v1/card-block-instances/{block_instance_id}`.
- Repeatable block instances can be soft-archived.
- Non-repeatable, system, locked, and required-minimum instances are guarded.
- Normal card reads hide archived instances.
- `include_archive=true` card reads include archived instances and retained
  field values.
- New repeatable instances allocate ordinals above archived rows to avoid unique
  constraint conflicts.
- Archive writes `audit_events` with `object_type=card_block_instance`.
- Tests added in `backend/tests/test_api_phase_2k.py`.

### Phase 2K.4: Bulk Card Values Update API

Status: completed.

Required work:

- Add an atomic bulk field-values endpoint, expected as `PATCH /api/v1/cards/{card_id}/values` or equivalent.
- Reuse existing single-field validation and audit behavior.
- Ensure either all values save or none save.
- Include support for normal dynamic field types and `file_ref` after Phase 2J.

Acceptance criteria:

- Tests cover atomic success, partial validation failure rollback, audit behavior, and permission denial.

Completion evidence:

- Added `PATCH /api/v1/cards/{card_id}/values`.
- Bulk payload accepts multiple `{field_id, value, block_instance_id}` updates.
- Bulk update reuses existing single-field coercion, validation, permission,
  and audit behavior.
- Service uses a nested transaction/savepoint so partial validation failure
  rolls back earlier values in the same bulk request.
- Tests cover route registration, success, rollback, and permission denial in
  `backend/tests/test_api_phase_2k.py`.

### Phase 2K.5: API Coverage And Live Validation

Status: completed.

Required work:

- Add integration tests for org units, registry update/archive, block-instance archive, and bulk card values.
- Validate against disposable PostgreSQL and temporary storage where relevant.
- Update README, PLANS.md, PROJECT_TREE.md, and frontend API client only if needed.

Acceptance criteria:

- Local backend checks pass.
- PostgreSQL-backed tests pass against disposable database.
- No unrelated document/import/report/MCP work is introduced.

Completion evidence:

- Local full check passed with `scripts/check.ps1 -SkipRemote` after Phase
  2K.4 implementation.
- Disposable PostgreSQL validation passed against `reg_engine_test` with
  `backend/tests/test_api_phase_2k.py -q`: 13 tests passed.
- Server checkout was synchronized to `origin/main` at commit `e834482e`.
- Server healthcheck passed after service restart.
- Live OpenAPI validation confirmed Phase 2K routes for org units, registry
  update/archive, card block instance archive, and bulk card values update.
- No migration was required for Phase 2K.5; production database schema was not
  changed in this validation slice.
- No frontend implementation, import/export, PDF conversion, reports, or MCP
  work was introduced.

## Phase 2L: Core Admin CRUD UI

Status: in progress.

Purpose: make the authenticated Russian-first admin UI capable of setting up
and operating the registry engine from an empty or near-empty database without
using Swagger or manual API calls.

Phase 2L must not implement:

- `file_ref` unless Phase 2J is already completed;
- PDF conversion;
- binary `.docx` template upload;
- template versioning;
- import/export;
- reports;
- MCP;
- service desk integration;
- hardcoded HR screens or HR-only labels.

### Phase 2L.0: Admin UI Mutation Foundation

Status: completed.

Required work:

- Add frontend API client functions for create/update/archive operations already
  exposed by backend.
- Establish reusable Russian-first form, modal/drawer, confirmation, error, and
  success-message patterns.
- Keep backend errors mapped to Russian user-facing messages.
- Preserve frontend checks as UX only; backend remains the security boundary.

Acceptance criteria:

- Unit tests cover shared form/error utilities.
- E2E smoke can log in and open every admin section without console errors.
- No business-specific labels or fixed employee fields are added.

Completion evidence:

- Added typed frontend API client functions for backend create/update/archive
  routes covering organizations, org units, registries, blocks, fields,
  reference lists/items, cards, repeatable block instances, bulk field values,
  users, access grants, public links, and card transfer.
- Added reusable Russian-first admin mutation components:
  `AdminMutationForm`, `AdminMutationDialog`, `ArchiveConfirmation`, and
  `MutationFeedback`.
- Error and success feedback uses existing localized frontend error mapping.
- Added frontend unit tests for admin mutation API routes and shared mutation
  form/dialog/feedback utilities.
- Updated Playwright smoke to log in, open every admin section, and fail on
  browser console/page errors.
- Verified `pnpm -C frontend test:run`, `pnpm -C frontend lint`,
  `pnpm -C frontend typecheck`, and `pnpm -C frontend e2e`.
- No business-specific labels, fixed employee fields, backend code,
  migrations, import/export, PDF conversion, reports, or MCP work was added.

### Phase 2L.1: Organization Management UI

Status: completed.

Required work:

- Add create organization form.
- Add edit organization metadata form.
- Add archive organization confirmation.
- Display parent/child context clearly.
- Keep descendants visibility rules explained through data, not frontend-only
  security checks.

Acceptance criteria:

- User can create a root or child organization through UI.
- User can edit allowed organization metadata through UI.
- User can archive an organization with confirmation.
- Frontend tests cover create/edit/archive success and validation errors.

Completion evidence:

- Added Russian-first create organization form with code, name, parent
  organization, and type fields.
- Added edit organization form for metadata supported by the backend API.
- Added archive organization confirmation using the shared Phase 2L.0
  mutation dialog/confirmation components.
- Organization mutations invalidate organization and audit query data after
  success.
- Added frontend test coverage for create, validation error without POST,
  edit, archive confirmation, and archive success.
- Verified `pnpm -C frontend test:run`, `pnpm -C frontend lint`, and
  `pnpm -C frontend typecheck`.
- No backend code, migrations, hardcoded employee fields, import/export, PDF
  conversion, reports, or MCP work was added.

### Phase 2L.2: User Management UI

Status: completed.

Required work:

- Add create user form with email, display name, password, status, and superuser
  flag where allowed.
- Add edit user form for profile/status fields.
- Add password reset/change workflow for admins.
- Add archive user confirmation.
- Show Russian labels for built-in/system display names.

Acceptance criteria:

- User can create, edit, password-reset, and archive users through UI.
- Password fields are not logged or persisted outside the API request.
- Frontend tests cover validation, success, and backend-denied states.

Completion evidence:

- Added Russian-first user create form with email, display name, password,
  status, and superuser flag.
- Added user profile edit form for email, display name, status, and superuser
  flag.
- Added admin password reset workflow that sends password only in the password
  update request and clears the field after success.
- Added user archive confirmation through the shared Phase 2L.0 confirmation
  component.
- Built-in/system display names continue to render through localized
  `userDisplayNameLabel`.
- Added frontend tests for required-field validation, create, edit, password
  reset, archive, password non-display after submit, request payload shape, and
  backend-denied localized error handling.
- Verified `pnpm -C frontend exec vitest run src/App.test.tsx`,
  `pnpm -C frontend test:run`, `pnpm -C frontend lint`, and
  `pnpm -C frontend typecheck`.
- Verified `powershell -ExecutionPolicy Bypass -File scripts/format.ps1 -Check`,
  `powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote`, and
  `pnpm -C frontend e2e`.
- No backend code, migrations, hardcoded employee fields, import/export, PDF
  conversion, reports, or MCP work was added.

### Phase 2L.3: Access Grant Management UI

Status: completed.

Required work:

- Add create access grant workflow:
  user, role, optional registry, organization, include descendants, validity
  dates where supported.
- Add revoke/archive access grant confirmation.
- Show scope summary in Russian before save.
- Prevent ambiguous UI states where a grant appears broader or narrower than
  backend rules.

Acceptance criteria:

- User can issue and revoke grants through UI.
- Org admin descendant-scope rules remain backend-enforced.
- Frontend tests cover global, organization-scoped, descendant, registry-scoped,
  and denied grant flows where supported by API.

Completion evidence:

- Added Russian-first access grant create form with user, role, optional
  organization, optional registry, include-descendants toggle, and validity
  dates.
- Added an explicit Russian scope summary before save so global,
  organization-scoped, descendant, and registry-scoped grants are not ambiguous.
- Added access grant revoke confirmation and success/error feedback using the
  shared Phase 2L.0 mutation patterns.
- Access-grant mutations invalidate access-grant and audit query data after
  success.
- Added frontend tests for required-field validation, global grant, descendant
  organization grant, registry-scoped grant, revoke flow, request payloads, and
  backend-denied localized error handling.
- Verified `pnpm -C frontend exec vitest run src/App.test.tsx`,
  `pnpm -C frontend test:run`, `pnpm -C frontend lint`, and
  `pnpm -C frontend typecheck`.
- Verified `powershell -ExecutionPolicy Bypass -File scripts/format.ps1 -Check`,
  `powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote`, and
  `pnpm -C frontend e2e`.
- No backend code, migrations, hardcoded employee fields, import/export, PDF
  conversion, reports, or MCP work was added.

### Phase 2L.4: Registry Management UI

Status: completed.

Required work:

- Add create registry form.
- Add update/archive registry controls when Phase 2K exposes them.
- Keep registry as a list/mechanism for organizing cards, not a per-organization
  database schema.
- Surface lifecycle/status labels in Russian.

Acceptance criteria:

- User can create a generic schema-driven registry through UI.
- User can update/archive registry metadata if API support exists.
- Tests prove no hardcoded employee registry fields are created.

Completion evidence:

- Added Russian-first registry create/edit/archive controls to the authenticated
  registry workspace.
- Registry mutations use existing Phase 2K API support and invalidate registry,
  schema, card, and audit query data after successful changes.
- Registry lifecycle/status values are surfaced through existing Russian status
  labels.
- Added frontend tests for required-field validation, create, update, archive,
  backend-denied localized error handling, and request payloads without
  hardcoded employee/HR fields.
- Verified `pnpm -C frontend exec vitest run src/App.test.tsx`,
  `pnpm -C frontend test:run`, `pnpm -C frontend lint`, and
  `pnpm -C frontend typecheck`.
- Verified `powershell -ExecutionPolicy Bypass -File scripts/format.ps1 -Check`,
  `powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote`, and
  `pnpm -C frontend e2e`.
- No backend code, migrations, hardcoded employee fields, import/export, PDF
  conversion, reports, or MCP work was added.

### Phase 2L.5: Schema Builder UI

Status: completed.

Required work:

- Add block create/update/archive controls.
- Add field create/update/archive controls.
- Support dynamic field types already supported by backend.
- Support repeatable block flag, public visibility/editability flags, required
  flags, position/order controls where API supports them.
- Keep locked/system blocks and fields protected by backend and reflected in UI.

Acceptance criteria:

- User can build a registry schema from UI without migrations.
- Adding a new field keeps old cards valid with empty values.
- Frontend tests cover block/field create/update/archive and locked-field
  denial states.

Completion evidence:

- Added Russian-first schema builder controls for form block create, metadata
  update, and archive.
- Added Russian-first schema builder controls for form field create, metadata
  update, active/inactive update, and archive.
- Field creation exposes all dynamic field types currently supported by the
  backend Core Schema v1 contract, excluding deferred `file_ref`.
- Block creation supports repeatable flag, public visibility/editability flags,
  and position/order input where the current API supports them.
- Field creation supports public visibility/editability flags, optional
  reference-list ID wiring, dynamic field type, and position/order input where
  the current API supports them.
- Locked/system blocks and fields remain protected by backend services; the
  frontend reflects backend-denied locked/system operations through localized
  Russian error text instead of raw service errors.
- Added frontend tests for block create/update/archive, field
  create/update/archive, dynamic field type payloads, no hardcoded employee/HR
  fields, and locked-field denial handling.
- Verified `pnpm -C frontend test:run`, `pnpm -C frontend lint`,
  `pnpm -C frontend typecheck`, and
  `powershell -ExecutionPolicy Bypass -File scripts/format.ps1 -Check`.
- Verified `pnpm -C frontend e2e` and
  `powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote`.
- No backend code, migrations, hardcoded employee fields, import/export, PDF
  conversion, reports, MCP, or `file_ref` implementation was added.

Known limitations:

- `required_mode`, `is_locked`, and `is_system` exist in backend
  model/service behavior but are not exposed in the current
  `FormBlockRead`/`FormFieldRead` API schemas. Phase 2L.5 therefore does not
  add proactive required-mode controls or lock/system badges; backend denial is
  still the security boundary.
- `file_ref` remains deferred until Phase 2J, so schema builder does not expose
  file-backed dynamic fields yet.

### Phase 2L.6: Reference List Management UI

Status: completed.

Required work:

- Add reference-list create/update/archive controls.
- Add reference-item create/update/archive controls.
- Support owner organization, inheritance to descendants, and locked inherited
  list behavior as exposed by backend.
- Wire select/multi_select fields to reference lists without hardcoded options.

Acceptance criteria:

- User can create a reference list and items through UI.
- Select/multi_select fields can use that reference list.
- Locked inherited list behavior is visible and cannot be bypassed in UI.

Completion evidence:

- Added Russian-first reference-list create, update, and archive controls in
  the registry admin workspace.
- Added Russian-first reference-item create, update, and archive controls for
  the selected reference list.
- Reference-list creation exposes owner organization, inheritance to
  descendants, locked-for-descendants, and system-managed flags supported by the
  current backend API.
- Reference-list table surfaces owner organization, inheritance, locked state,
  and active/archive status; backend-denied locked/inherited operations are
  mapped to localized Russian error text.
- Schema field creation now uses a reference-list selector for
  `select`/`multi_select` fields instead of a raw reference-list UUID input.
- Added frontend tests for reference-list/item create-update-archive,
  select-field reference-list wiring without hardcoded options, and locked
  reference-list denial localization.
- Verified `pnpm -C frontend exec vitest run src/App.test.tsx -t
  "reference lists|select fields|locked reference"`,
  `pnpm -C frontend test:run`, `pnpm -C frontend lint`, and
  `pnpm -C frontend typecheck`.
- No backend code, migrations, hardcoded employee fields, import/export, PDF
  conversion, reports, MCP, or `file_ref` implementation was added.

### Phase 2L.7: Card Create, Metadata, And Editor UI

Status: completed.

Required work:

- Add create card form:
  registry, organization, optional org unit, display name, lifecycle/public-edit
  flags where supported.
- Add card metadata edit and archive controls.
- Add repeatable block-instance add/archive UI after Phase 2K API support.
- Add bulk save workflow after Phase 2K API support.
- Keep existing per-field editor as a fallback path.

Acceptance criteria:

- User can create a card through UI and immediately edit schema-driven values.
- User can archive a card with confirmation.
- Repeatable block instance controls work where API support exists.
- Bulk save is atomic where API support exists.
- Frontend e2e covers create card, edit values, add repeatable instance,
  archive card, and audit refresh.

Completion evidence:

- Added Russian-first card create form with registry, organization, optional
  org unit, display name, and public view/edit flags.
- Added card metadata panel with edit and archive controls.
- Added repeatable block-instance add/archive controls using the Phase 2K API.
- Added atomic bulk field-values save workflow while preserving the existing
  per-field editor as a fallback path.
- Added frontend test coverage for create, metadata update, repeatable
  instance add/archive, bulk save payloads, card archive, and no hardcoded
  employee/HR payload fields.
- Verified `pnpm -C frontend exec vitest run src/App.test.tsx -t
  "creates updates archives cards"`, `pnpm -C frontend test:run`,
  `pnpm -C frontend lint`, `pnpm -C frontend typecheck`, and
  `pnpm -C frontend exec playwright test tests/e2e/smoke.spec.ts
  --project=chromium`.
- Verified `powershell -ExecutionPolicy Bypass -File scripts/check.ps1
  -SkipRemote`.

### Phase 2L.8: Public Link Admin Controls UI

Status: completed.

Required work:

- Add authenticated public-link list/create/disable controls on the card
  workspace.
- Expose `expires_in_days` and `max_attachment_uploads` controls.
- Clearly separate field-edit usage limits from attachment-upload limits.
- Keep public-link generated-document workflows deferred.

Acceptance criteria:

- User can create and disable a public edit link through UI.
- User can set attachment upload limit at link creation.
- Public-link UI tests cover disabled, expired, upload-limit, and no-file
  validation messaging.

Completion evidence:

- Added Russian-first authenticated public-link panel to the card workspace.
- Public-link list shows active, disabled, expired, field-edit usage, and
  attachment-upload usage as separate concepts.
- Create form exposes `expires_in_days` and `max_attachment_uploads`; blank
  upload limit maps to unlimited uploads and does not overload `used_count`.
- Created public-link raw token and relative public edit URL are shown only
  after a successful create response.
- Disable flow uses explicit confirmation and the existing authenticated
  public-link archive endpoint.
- Added frontend unit coverage for list/create/disable, disabled status,
  expired status, exhausted upload limit, separate usage counters, and create
  payload shape without `max_uses`/`used_count`.
- Existing public-link frontend test continues to cover no-file validation with
  `Выберите файл`.
- Updated Playwright smoke to cover the authenticated public-link panel.
- Verified `pnpm -C frontend exec vitest run src/App.test.tsx -t
  "public links from authenticated"`, `pnpm -C frontend test:run`,
  `pnpm -C frontend lint`, `pnpm -C frontend typecheck`,
  `pnpm -C frontend e2e`, and
  `powershell -ExecutionPolicy Bypass -File scripts/format.ps1 -Check`.
- Verified `powershell -ExecutionPolicy Bypass -File scripts/check.ps1
  -SkipRemote`.
- No backend code, migrations, generated-document public workflows, `file_ref`,
  PDF conversion, import/export, reports, or MCP work was added.

### Phase 2L.9: Admin UI Live Validation

Status: completed.

Required work:

- Use disposable or explicitly approved test data.
- Validate this complete setup path in browser:
  create organization, create user, issue access grant, create registry, build
  schema, create reference list/items, create card, edit card fields, upload
  attachment, generate document, create public link, verify audit.
- Capture console health and first-screen rendering evidence.
- Update README, PLANS.md, PROJECT_TREE.md, and docs as needed.

Acceptance criteria:

- Full admin setup path works from UI without Swagger/manual API calls.
- `scripts/check.ps1 -SkipRemote` passes.
- Frontend e2e and browser smoke pass.
- Server deployment and same-origin frontend serving remain working.

Completion evidence:

- Added Playwright browser coverage for the full Russian admin setup path using
  disposable mock API state:
  organization create, user create, access grant issue, registry create, schema
  block/field create, reference-list/item create, card create, bulk field-value
  save, attachment upload, generated-document generation, public-link create,
  and audit verification.
- The Phase 2L.9 scenario asserts first-screen rendering, page title, Russian
  admin shell visibility, no unhandled API routes, and no browser console/page
  errors.
- Verified targeted e2e with `pnpm -C frontend exec playwright test
  tests/e2e/smoke.spec.ts --project=chromium -g "complete admin setup"`.
- No backend code, migrations, production data changes, import/export,
  `file_ref`, PDF conversion, reports, MCP, or business-specific HR UI was
  added.

## Planned Phases After Core Admin UI

These require explicit approval after Phase 2K/2L unless the user explicitly
reprioritizes them.

### Phase 2M: Binary `.docx` Template Upload And Template Versioning

Status: completed.

Purpose: move from JSON `docx_text_v1` template bodies toward managed binary template assets and version history.

Planned scope:

- Upload binary `.docx` templates through authenticated API.
- Store template files through storage abstraction.
- Add template versions.
- Keep templates schema-driven and avoid real personal data in Git/tests.
- Keep PDF conversion deferred.

Completion evidence:

- Added migration `0009_document_template_versions`.
- Added `document_template_versions` with version number, template format,
  text body or stored binary file reference, safe binary metadata, archive
  fields, and uniqueness/index/check constraints.
- Existing text templates are backfilled as version `1`.
- Added `generated_documents.template_version_id`.
- Added `docx_binary_v1` template format support.
- Added authenticated multipart API:
  `POST /api/v1/registries/{registry_id}/document-templates/upload`,
  `GET /api/v1/document-templates/{template_id}/versions`, and
  `POST /api/v1/document-templates/{template_id}/versions/upload`.
- Binary template files are stored through the storage abstraction under the
  `document_templates` prefix and are not stored in Git.
- Generation uses the latest active template version and records the
  `template_version_id`.
- Version read responses expose safe metadata and omit storage keys, checksums,
  and stored-file ids.
- Tests cover metadata/migration constraints, binary upload, version upload,
  latest-version generation, invalid upload rejection, safe version response
  shape, and audit events.
- Production PostgreSQL was migrated from `0008_file_ref_field_values` to
  `0009_document_template_versions` after a fresh server-side backup outside
  Git, preflight checks, disposable PostgreSQL verification, and post-checks.
  Post-checks verified Alembic current `0009_document_template_versions`,
  `document_template_versions`, `generated_documents.template_version_id`,
  nullable `document_templates.template_body`, key constraints, and indexes.
  The backend service was restarted and `scripts/server-check.ps1` passed.

Known limitations:

- No browser UI for binary template upload in this slice.
- Binary template download is not exposed.
- The first `docx_binary_v1` renderer replaces placeholders in `.docx` XML
  parts when placeholders are contiguous text; advanced Word run merging,
  content controls, tables/repeated sections, and conditional blocks are
  deferred.
- Binary `.docx` layout conversion to PDF, public generated-document
  workflows, import/export, reports, and MCP remain deferred.

### Phase 2N: PDF Conversion

Status: completed.

Purpose: add PDF generation after generated-document and template boundaries are stable.

Completed scope:

- Accepted ADR `docs/ADR/0009-pdf-conversion.md`.
- Chose a direct backend PDF renderer for `docx_text_v1` templates.
- Added authenticated API:
  `POST /api/v1/cards/{card_id}/generated-documents/pdf`.
- Stored generated PDFs through the existing generated-document storage
  abstraction and `generated_documents` metadata.
- Kept the same `cards.manage` generation permission and generated-document
  read/download/archive rules.
- Added Russian-first card document UI control `Сформировать PDF`.
- Added tests for Cyrillic PDF rendering, service-level PDF generation, API
  PDF generation/download, binary-template rejection, and frontend UI flow.
- Verified PostgreSQL-backed PDF service/API tests on disposable
  `*_test` database.
- Deployed commit `74b90ae` to the configured server checkout; no production
  migration was required because Phase 2N adds no schema changes. Frontend
  dist was deployed, backend service was restarted, same-origin frontend/API
  smoke passed, `scripts/server-check.ps1` passed, and production Alembic
  remained at `0009_document_template_versions` head.

Known limitations:

- Binary `.docx` layout-faithful conversion to PDF is not implemented.
- Public-link PDF generation/download is not exposed.
- Advanced Word layout, headers/footers, tables, images, content controls, and
  repeated sections remain deferred to a future converter boundary.

### Phase 3: Import And Export

Purpose: add controlled data exchange.

Status: completed for the current approved backend API slices; XLSX and
frontend import/export workflows are deferred until explicitly approved.

Approved/current scope:

- CSV import with mapping, preview, validation, commit, and audit.
- JSON/CSV export with permission checks.
- Export of attachment/document metadata only first; binary export requires separate approval.
- XLSX import/export remains a later explicit phase if needed.

Decisions:

- Export uses the same backend organization-scope card visibility as card
  list/read.
- JSON export preserves schema-driven `blocks -> instances -> fields`.
- CSV export is field-row based and must include `block_code`,
  `block_instance_ordinal`, and `field_code` to avoid ambiguity when different
  blocks reuse the same field code.
- Attachment and generated-document exports include metadata only in the first
  slice. Binary bytes, storage keys, checksums, stored file ids, and filesystem
  paths are not exported.
- Export actions write `audit_events` with `action=export`.
- Import preview and import commit must validate against existing registry
  schema instead of creating hardcoded business fields.
- Import commit uses the preview contract as its validation gate: any invalid
  row rejects the whole batch before mutation.
- CSV import matching rules are explicit: rows with `card_id` update that
  editable card; rows without `card_id` create cards, and create rows sharing
  the same optional `import_key` are grouped into one new card.
- Successful import commits write `audit_events` with `action=import_commit`.

### Phase 3A: Card Export Foundation

Status: completed.

Purpose: provide a safe backend export foundation before import workflows and
XLSX support.

Completed scope:

- Added authenticated API:
  `GET /api/v1/registries/{registry_id}/exports/cards?format=json|csv`.
- JSON export includes registry id, format version, visible cards, card
  metadata, schema-driven blocks/instances/fields, attachment metadata, and
  generated-document metadata.
- CSV export emits one row per card field with explicit card, block, instance,
  field, field type, and serialized value columns.
- Export uses `CardService.list_visible_cards` and
  `CardService.read_card_for_actor` so organization scope, descendant scope,
  archive filtering, and backend permission behavior remain centralized.
- Export writes `audit_events` with `action=export`,
  `object_type=registry`, format, export type, and exported card count.
- Added PostgreSQL-backed API regression tests for scoped JSON export,
  duplicate field-code CSV export, attachment/document metadata-only output,
  and audit recording.
- Verification on 2026-06-30: RED failed with 404 before implementation on
  disposable `reg_engine_phase3a_test`; GREEN passed with `2 passed` after
  implementation on the same disposable PostgreSQL strategy; targeted mypy and
  ruff passed; `scripts/check.ps1 -SkipRemote` passed with backend pytest
  `61 passed, 124 skipped`, frontend unit tests `29 passed`, frontend build,
  and project tree check; `pnpm -C frontend e2e` passed with `3 passed`.
- Deployed commit `a8c1027` to the configured server checkout. No production
  migration was required because Phase 3A adds no schema changes. Backend
  service was restarted, healthcheck passed, live OpenAPI exposed
  `/api/v1/registries/{registry_id}/exports/cards`, `scripts/server-check.ps1`
  passed, and production Alembic remained at
  `0009_document_template_versions` head.

Known limitations:

- No XLSX export in this slice.
- No import preview or import commit in this slice.
- No frontend export UI in this slice.
- CSV export is field-row based; it is intended for technical exchange and
  mapping, not a polished report.
- Reference values are exported as stored ids in Phase 3A; label enrichment is
  deferred to later import/export polish.
- Binary attachment and generated-document bytes are not exported.

### Phase 3B: Import Preview And Mapping

Status: completed.

Purpose: add safe import preview before any data mutation.

Planned scope:

- CSV import preview first, XLSX preview later if dependency and UX boundaries
  are accepted.
- Registry field mapping by `block_code.field_code`.
- Validate organization/card visibility and editable scope.
- Validate dynamic values through the same service rules as manual card edits.
- Return row-level validation errors without mutating cards.
- Do not upload binary attachments/documents through import in this phase.

Completed scope:

- Added authenticated API:
  `POST /api/v1/registries/{registry_id}/imports/cards/preview`.
- Preview accepts CSV content with required columns `card_id`,
  `organization_id`, `display_name`, `block_code`, `field_code`, and `value`.
- Rows with `card_id` are previewed as updates; rows without `card_id` are
  previewed as new-card rows requiring `organization_id` and `display_name`.
- Field mapping uses `block_code.field_code` against the active registry
  schema.
- Preview validates editable card scope, create organization scope, and typed
  dynamic field values through `CardService.validate_field_value_for_actor`.
- Preview returns row-level status, action, parsed values, and validation
  errors.
- Preview does not create cards, update field values, upload binaries, attach
  documents, or write audit events.
- Added PostgreSQL-backed API regression tests for valid update/create preview,
  invalid numeric values, inaccessible sibling branch update/create, invalid
  reference-list item, unknown field mapping, required CSV columns, and no
  mutation of `cards`, `field_values`, or `audit_events`.
- Verification on 2026-06-30: RED failed with `405 Method Not Allowed` before
  implementation on disposable `reg_engine_phase3b_test`; GREEN passed with
  `4 passed` after implementation on the same disposable PostgreSQL strategy;
  `scripts/check.ps1 -SkipRemote` passed with backend pytest `61 passed,
  126 skipped`, frontend unit tests `29 passed`, frontend build, and project
  tree check; `pnpm -C frontend e2e` passed with `3 passed`.
- Deployed commit `7a7ffee` to the configured server checkout. No production
  migration was required because Phase 3B adds no schema changes. Backend
  service was restarted, healthcheck passed, live OpenAPI exposed
  `/api/v1/registries/{registry_id}/imports/cards/preview`,
  `scripts/server-check.ps1` passed, and production Alembic remained at
  `0009_document_template_versions` head.

Known limitations:

- No import commit in this slice.
- No XLSX preview in this slice.
- No frontend import UI in this slice.
- No binary attachment/document import in this slice.
- Preview is row-oriented; grouping multiple rows into one future card is
  deferred to Phase 3C matching/commit rules.
- Reference labels are not resolved in preview responses yet; values use stored
  ids.

### Phase 3C: Import Commit And Export Polish

Status: completed.

Completed scope:

- Added authenticated API:
  `POST /api/v1/registries/{registry_id}/imports/cards/commit`.
- Commit accepts the Phase 3B CSV columns plus optional `import_key`.
- Rows with `card_id` update an existing editable card.
- Rows without `card_id` create a new card; multiple create rows with the same
  `import_key` are grouped into one card and must share the same
  `organization_id` and `display_name`.
- Commit reuses preview validation before mutating data. If any row is invalid,
  the API returns the preview payload in `detail` with row-level errors and
  does not create cards, update field values, or write import audit events.
- Valid commits run inside a nested transaction, create/update schema-driven
  card values through `CardService`, and write one registry-level
  `audit_events` row with `action=import_commit`.
- Added PostgreSQL-backed API regression tests for successful create/update
  import commit, import audit, `import_key` grouping, invalid-batch rejection,
  and no partial writes on validation failure.
- Verification on 2026-06-30: RED failed with `405 Method Not Allowed` before
  implementation on disposable `reg_engine_phase3c_test`; GREEN passed with
  `2 passed` for the new commit tests and `6 passed` for the full
  `test_api_phase_3_import_export.py` suite on the same disposable PostgreSQL
  strategy; `scripts/check.ps1 -SkipRemote` passed with backend pytest
  `61 passed, 128 skipped`, frontend unit tests `29 passed`, frontend build,
  and project tree check; `pnpm -C frontend e2e` passed with `3 passed`.
- Deployed commit `eb790b65` to the configured server checkout. No production
  migration was required because Phase 3C adds no schema changes. Backend
  service was restarted, healthcheck passed, live OpenAPI exposed
  `/api/v1/registries/{registry_id}/imports/cards/commit`,
  `scripts/server-check.ps1` passed, and production Alembic remained at
  `0009_document_template_versions` head.

Known limitations:

- No XLSX import/export in this slice.
- No frontend import/export UI in this slice.
- No binary attachment/document import/export.
- Reference values are still accepted/exported as stored ids; label enrichment
  remains deferred.
- No production migration was required because Phase 3C adds no schema changes.

### Phase 4: Reports

Purpose: add report definitions and report runs.

Status: completed for the approved backend report foundation slice.

Planned overall scope:

- Report templates.
- Registry/card reports.
- Period reports.
- Report output storage and audit.

### Phase 4A: Report Foundation API

Status: completed.

Purpose: add the first backend/API report slice without frontend report UI,
XLSX/PDF report outputs, scheduled jobs, public report workflows, binary
attachment/document export, or MCP.

Completed local scope:

- Added migration `0010_reports`.
- Added `report_templates` and `report_runs` SQLAlchemy models.
- Added constraints/indexes for report type, output format, run status,
  template code uniqueness per registry, stored output linkage, and report
  lookup.
- Added authenticated REST API:
  `POST /api/v1/registries/{registry_id}/report-templates`,
  `GET /api/v1/registries/{registry_id}/report-templates`,
  `DELETE /api/v1/report-templates/{template_id}`,
  `POST /api/v1/report-templates/{template_id}/runs`,
  `GET /api/v1/registries/{registry_id}/report-runs`,
  `GET /api/v1/report-runs/{report_run_id}`,
  `GET /api/v1/report-runs/{report_run_id}/content`, and
  `DELETE /api/v1/report-runs/{report_run_id}`.
- Added report types `registry_cards`, `card_detail`, and `period_summary`.
- Stored generated JSON report output through the existing storage abstraction
  under the `reports` prefix.
- Kept API response metadata safe by omitting storage keys, filesystem paths,
  checksums, and stored-file ids from report run responses.
- Enforced backend scope through existing registry schema permissions, card
  management permissions, and card visibility reads.
- Added audit events for report template create/archive and report run
  generate/download/archive.

Verification so far:

- Targeted model/schema/migration tests passed locally.
- `ruff check` passed for the Phase 4A files.
- `mypy app` passed.
- Offline Alembic SQL render passed locally.
- Disposable PostgreSQL database `reg_engine_phase4a_test` passed clean
  `alembic upgrade head` through `0010_reports`.
- PostgreSQL-backed `tests/test_api_phase_4_reports.py` passed on the same
  disposable database.
- Full `scripts/check.ps1 -SkipRemote` passed with backend pytest
  `62 passed, 130 skipped`, frontend unit tests `29 passed`, frontend build,
  and project tree check.
- `pnpm -C frontend e2e` passed with `3 passed`.
- Deployed commit `abaa76b` to the configured server checkout.
- Production PostgreSQL was migrated from `0009_document_template_versions` to
  `0010_reports` after a fresh server-side backup outside Git, preflight table
  checks, disposable PostgreSQL verification, Alembic upgrade, and post-checks.
- Post-checks verified Alembic current `0010_reports (head)`,
  `report_templates`, `report_runs`, report constraints, and report indexes.
- Backend service was restarted; healthcheck returned `ok`,
  `scripts/server-check.ps1` passed, and live OpenAPI exposed all report
  endpoints.

Production migration checkpoint:

- Completed for `0010_reports`.

Known limitations:

- JSON is the only report output format in Phase 4A.
- No frontend report UI yet.
- No XLSX/PDF report outputs.
- No scheduled/background report jobs.
- No charts or visual report builder.
- No public-link report workflows.
- No binary attachment/generated-document report export.
- No MCP.

### Phase 5: MCP Over API Only

Purpose: add MCP after API, auth, RBAC, audit, import/export, and document boundaries are stable.

Planned scope:

- Read-only MCP tools first.
- MCP calls API only.
- No direct DB access.
- Audit source `mcp`.
- Write tools only after explicit approval.

## Verification

Required checks for each implementation checkpoint:

- local backend checks;
- PostgreSQL-backed tests against a disposable test database where applicable;
- frontend lint, typecheck, unit tests, e2e tests, and format checks where applicable;
- project map update/check;
- README and PLANS update.
