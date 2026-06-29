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

Current stop point:

- Phase 2I public-link attachment limit semantics and bugfixes are completed.
- Phase 2J is the next planned phase: `file_ref` dynamic field type.
- Phase 2J must start with planning/ADR and acceptance criteria before implementation.
- PDF conversion, binary `.docx` template upload/versioning, import/export, reports, and MCP remain deferred.
- Operational tooling now supports same-origin frontend serving from `frontend/dist` through the backend service and `scripts/deploy-frontend.ps1`.

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

## Phase 2J: `file_ref` Dynamic Field Type

Status: planned next.

Purpose: add a generic dynamic field type that references an existing card attachment from the same card, without adding new storage, public-link file-ref editing, PDF conversion, import/export, reports, or MCP.

### Phase 2J.0: Planning And ADR

Status: planned next.

Required decisions:

- `file_ref` references `card_attachments.id`, not `stored_files.id`.
- `file_ref` is a single attachment reference in the first implementation; `multi_file_ref` is deferred.
- `file_ref` uses existing attachment upload/list/download flows. It does not upload bytes inline in the first implementation.
- Public-link editing of `file_ref` is deferred.
- Transfer behavior must not copy the old `card_attachment.id` directly into the new card.
- Generated documents render `file_ref` as attachment title/original filename text only.

Acceptance criteria:

- ADR records the decisions above before code starts.
- PLANS.md states all sub-phases, tests, non-goals, and transfer behavior.
- No backend, frontend, migration, or API implementation starts in Phase 2J.0.

### Phase 2J.1: Database And Model Foundation

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

### Phase 2J.2: Backend Service Support

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

### Phase 2J.3: Transfer Behavior

Required behavior:

- When a card transfer copies dynamic values, `file_ref` must not point from the new card to the old card's `card_attachment.id`.
- Preferred behavior: create a new `card_attachment` row for the target card pointing to the same `stored_file_id`, copy title/description/position as appropriate, and point the new field value to the new `card_attachment.id`.
- If the referenced old attachment is archived at transfer time, either preserve a read-only archived reference according to explicit rules or clear it with a documented audit entry. Preferred behavior is to copy only active attachment links.

Acceptance criteria:

- Transfer tests prove the new card has its own `card_attachment` link.
- New card `file_ref` points to the new attachment link, not the old one.
- Old and new attachment links may share the same `stored_file_id`; binary bytes are not duplicated.

### Phase 2J.4: API Support

Required work:

- Existing card field update endpoint accepts `file_ref` values as `card_attachment.id` or `null`.
- Card read returns `file_ref` as metadata, not only a raw UUID.
- Metadata should include: `attachment_id`, `title`, `original_filename`, `content_type`, `content_length_bytes`, `scanner_status`, and `archived_at`.
- Existing attachment list endpoint remains the source of selectable file candidates.

Acceptance criteria:

- API tests cover set, clear, read metadata, wrong-card rejection, and archived-reference read behavior.
- API responses do not expose storage key, filesystem path, or storage root.

### Phase 2J.5: Frontend Authenticated Editor

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

### Phase 2J.6: Generated Document Rendering

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

### Phase 2J.7: Live Validation

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

## Future Directions After Phase 2J

These require explicit approval after Phase 2J:

- Public-link `file_ref` editing.
- `multi_file_ref`.
- Binary `.docx` template upload and template versioning.
- PDF conversion.
- Import/export.
- Reports.
- MCP over API only.

## Verification

Required checks for each implementation checkpoint:

- local backend checks;
- PostgreSQL-backed tests against a disposable test database where applicable;
- frontend lint, typecheck, unit tests, e2e tests, and format checks where applicable;
- project map update/check;
- README and PLANS update.
