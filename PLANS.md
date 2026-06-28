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

Current stop point:

- Phase 2D authenticated frontend attachment/document workflows are complete.
- PDF conversion remains deferred.
- Public-link upload/download remains deferred.
- `file_ref` remains deferred.
- Generated document template management UI remains deferred; Phase 2D lists
  existing templates and generates documents from the card workspace.

## Core Rules

- Keep the engine schema-driven.
- Do not create a hardcoded employee table.
- Do not add fixed HR-only fields.
- Keep card structure in registries, blocks, fields, and typed values.
- Keep backend access checks as the security boundary.
- Keep public-link editing backend-validated.
- Keep normal deletes as archive behavior.
- Keep the frontend Russian-first for user-facing text.
- Keep Phase 2 document work attachment-first; generated document work starts only from the Phase 2C backend foundation.
- Keep Phase 2 storage roots and operational values outside Git.
- Keep public-link upload/download and `file_ref` deferred until their later approved phases.

## Phase 2: Documents And Attachments

Status: in progress.

Approved scope:

- Card-level attachments first.
- Generated documents started backend-only in Phase 2C and have authenticated
  card-workspace UI in Phase 2D.
- Local filesystem backend through a storage abstraction, configured outside Git.
- No public-link upload/download in the first attachment slice.
- `file_ref` deferred until attachment metadata is stable.

Completed Phase 2 work:

- Phase 2.0 captured the product scope decision and accepted attachment-first direction.
- Phase 2A accepted the attachment storage architecture and metadata model.
- Phase 2B added attachment metadata models, migration `0005_attachments`, local filesystem storage abstraction, attachment service, authenticated attachment endpoints, and tests.
- Phase 2E completed live security validation for the attachment-first backend slice using disposable data and temporary storage.
- Phase 2F hardened upload bounds, storage cleanup, filename/download headers, runtime settings, scanner mode handling, and attachment lifecycle documentation.
- Phase 2C added `document_templates`, `generated_documents`, backend-only `docx_text_v1` rendering, generated file storage, audit, and archive behavior.
- Phase 2D added authenticated Russian-first card-workspace panels for attachments and generated documents, plus generated-document API endpoints needed by the UI.

## Review Findings After Phase 2E

These findings were addressed in Phase 2F before generated documents, frontend attachment UI, public-link file flows, or `file_ref`.

### P0: Upload memory behavior

Before Phase 2F, the API read uploaded file content into memory before service-level size validation. This was acceptable only for small test files. Phase 2F had to implement a bounded read or streaming storage path that enforces configured size limits before unbounded memory growth is possible.

### P0: Storage and database consistency

Before Phase 2F, the service wrote bytes to storage before metadata rows were fully committed. If the database transaction failed after storage write, an orphaned file could remain. Phase 2F had to add cleanup-on-failure behavior or a documented pending/committed storage lifecycle.

### P1: Filename and download header hardening

Attachment filenames are stored as metadata and later returned in response headers. Phase 2F had to normalize or validate filenames for control characters and unsafe header characters, and use a safe `Content-Disposition` attachment header for downloads.

### P1: Runtime content-type policy

The attachment service supports `REG_ENGINE_ATTACHMENT_ALLOWED_TYPES`, but an empty allow-list means all content types are accepted in development/test. Phase 2F had to decide and document whether an explicit allow-list is required for staging/production-like runtimes while remaining convenient for tests.

### P1: MIME trust boundary

The backend relies on the client-provided upload MIME type for MVP allow-list checks. Phase 2F had to document this as MVP behavior or add a basic server-side type check where practical.

### P1: Malware scanner setting is not enforced

Runtime setting `REG_ENGINE_MALWARE_SCANNER` exists, while the service uses the deferred scanner hook for the MVP slice. Phase 2F had to either enforce only the documented `deferred` mode or wire supported scanner modes explicitly. Unsupported scanner modes must fail clearly.

### P1: Attachment retention and stored file lifecycle

Archiving an attachment preserves metadata and bytes. Phase 2F had to explicitly document whether `stored_files.archived_at` remains unused for now, whether file bytes are retained indefinitely, and what later garbage-collection or retention phase will own cleanup.

### P2: Attachment API response shape

Attachment responses expose internal `stored_file_id` and checksum. Phase 2F had to confirm whether these values should remain visible before frontend document UI starts.

## Phase 2F: Attachment Backend Hardening Before Next Document Phases

Purpose: close attachment backend correctness and security gaps before approving generated documents, frontend attachment UI, public-link file flows, or `file_ref`.

Status: completed.

Phase 2F must not implement:

- generated document templates;
- frontend attachment/document UI;
- public-link upload/download;
- `file_ref` dynamic field type;
- import/export;
- MCP;
- MDB migration;
- service desk integration.

Required work:

1. Add bounded upload reading or streaming storage so configured size limits are enforced without unbounded memory reads.
2. Add storage cleanup on database failure, or introduce an explicit pending/committed storage lifecycle.
3. Normalize/validate `original_filename` for unsafe/control characters and add safe download filename handling.
4. Decide and enforce production-like behavior for `REG_ENGINE_ATTACHMENT_ALLOWED_TYPES`.
5. Document or improve the MIME trust boundary.
6. Enforce supported `REG_ENGINE_MALWARE_SCANNER` values; unsupported values must fail clearly.
7. Document attachment retention and stored-file lifecycle.
8. Decide whether `stored_file_id` and checksum stay in user-facing API responses.
9. Add regression tests for the items above.
10. Update README, PLANS.md, PROJECT_TREE.md, and attachment architecture docs where needed.

Delivered:

- Added bounded multipart upload reading in the attachment API. Oversized uploads fail with `413` before an unbounded `read()`.
- Added storage cleanup when post-write scanner/metadata work fails before transaction completion.
- Normalized stored filenames for control/header-unsafe characters.
- Added safe `Content-Disposition: attachment` download headers with ASCII fallback and UTF-8 `filename*`.
- Required `REG_ENGINE_ATTACHMENT_ALLOWED_TYPES` in production-like runtimes while keeping development/test convenient.
- Documented the MVP MIME trust boundary: the allow-list checks the client-provided upload MIME type until a later scanner/content-inspection phase.
- Enforced `REG_ENGINE_MALWARE_SCANNER=deferred` as the only supported scanner mode for this slice; unsupported modes fail startup.
- Documented that attachment archive preserves stored file metadata and bytes, leaves `stored_files.archived_at` unused in the MVP link-archive flow, and defers physical cleanup to a later retention phase.
- Kept `stored_file_id` and `checksum_sha256` in authenticated API responses as technical metadata for authorized callers; frontend UI should not present them as primary labels.
- Added regression tests for bounded upload reads, cleanup-on-failure, filename/header safety, production-like allow-list enforcement, and unsupported scanner mode rejection.

Acceptance criteria:

- Oversized uploads are rejected without unbounded memory reads.
- Failed metadata writes do not silently leave untracked files, or the pending-file lifecycle is explicit and tested.
- Download headers are safe for filenames with unusual characters.
- Runtime storage/content-type/scanner settings are deterministic and tested.
- Attachment archive/retention behavior is documented.
- Existing attachment service/API tests still pass.
- No generated-document, frontend attachment UI, public-link file flow, or `file_ref` work is introduced.

## Phase 2C: Generated Document Templates

Status: completed.

Delivered:

- Added `document_templates` and `generated_documents` metadata tables in migration `0006_generated_documents`.
- Chose `docx_text_v1` as the first constrained renderer.
- Rendered `.docx` output from schema-driven card data through `DocumentService`.
- Stored generated bytes through `stored_files` and the existing storage abstraction with prefix `generated_documents`.
- Enforced `registry.schema.manage` for template create/archive.
- Enforced `cards.manage` for generation and generated-document archive.
- Kept generated document reads scoped by card visibility.
- Blocked generation for archived/superseded cards.
- Preserved stored file metadata and bytes when generated documents are archived.
- Recorded audit events for template create/archive and document generate/archive.

Verification evidence:

- Disposable PostgreSQL backend suite passed against a database ending with `_test`.
- Local `scripts/check.ps1 -SkipRemote` passed.
- `scripts/push-git.ps1` passed and pushed `main`.
- Server checkout was updated from `origin/main`.
- Fresh production PostgreSQL backup was created outside Git before migration.
- Production preflight confirmed Alembic `0005_attachments` and absent Phase 2C tables.
- Production Alembic upgrade reached `0006_generated_documents`.
- Production post-check confirmed `document_templates`, `generated_documents`, constraints, and backend `create_app`.

Phase 2C did not implement:

- frontend attachment/document UI;
- public-link upload/download or public document generation;
- `file_ref`;
- PDF conversion;
- binary `.docx` template upload;
- import/export;
- MCP;
- MDB migration.

### Phase 2D: Frontend Document Workflows

Status: completed.

Delivered:

- Added Russian-first `Вложения` and `Документы` panels inside the card workspace.
- Added authenticated frontend API client methods for attachment upload/download/archive.
- Added authenticated frontend API client methods for listing document templates, generating documents, downloading generated content, and archiving generated documents.
- Added generated-document REST API endpoints required by the frontend.
- Kept public-link screens without upload/download/document controls.
- Added localized empty, success, archive, download, and scanner-deferred states.
- Added unit and e2e coverage for upload/download/archive and document generation workflows.

Verification evidence:

- `pnpm -C frontend test:run -- App.test.tsx` passed.
- `pnpm -C frontend typecheck` passed.
- `pnpm -C frontend e2e` passed.

Phase 2D did not implement:

- public-link upload/download;
- public document generation;
- document template management UI;
- `file_ref`;
- PDF conversion;
- import/export;
- MCP;
- MDB migration.

## Future Directions

### Later deferred items

- Public-link file upload/download.
- `file_ref` dynamic field type.
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
