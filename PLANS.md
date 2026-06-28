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

Current stop point:

- Generated-document validation remains deferred until Phase 2C.
- Frontend attachment/document workflows remain deferred until Phase 2D.
- Public-link upload/download remains deferred.
- `file_ref` remains deferred.
- Before approving Phase 2C or 2D, run Phase 2F to harden the attachment backend slice.

## Core Rules

- Keep the engine schema-driven.
- Do not create a hardcoded employee table.
- Do not add fixed HR-only fields.
- Keep card structure in registries, blocks, fields, and typed values.
- Keep backend access checks as the security boundary.
- Keep public-link editing backend-validated.
- Keep normal deletes as archive behavior.
- Keep the frontend Russian-first for user-facing text.
- Keep Phase 2 document work attachment-first until generated documents are explicitly started in Phase 2C.
- Keep Phase 2 storage roots and operational values outside Git.
- Keep public-link upload/download and `file_ref` deferred until their later approved phases.

## Phase 2: Documents And Attachments

Status: in progress.

Approved scope:

- Card-level attachments first.
- Generated documents deferred.
- Local filesystem backend through a storage abstraction, configured outside Git.
- No public-link upload/download in the first attachment slice.
- `file_ref` deferred until attachment metadata is stable.

Completed Phase 2 work:

- Phase 2.0 captured the product scope decision and accepted attachment-first direction.
- Phase 2A accepted the attachment storage architecture and metadata model.
- Phase 2B added attachment metadata models, migration `0005_attachments`, local filesystem storage abstraction, attachment service, authenticated attachment endpoints, and tests.
- Phase 2E completed live security validation for the attachment-first backend slice using disposable data and temporary storage.

## Current Review Findings After Phase 2E

These findings must be addressed before generated documents, frontend attachment UI, public-link file flows, or `file_ref`.

### P0: Upload memory behavior

Current API reads uploaded file content into memory before service-level size validation. This is acceptable only for small test files. Phase 2F must implement a bounded read or streaming storage path that enforces configured size limits before unbounded memory growth is possible.

### P0: Storage and database consistency

Current service writes bytes to storage before metadata rows are fully committed. If the database transaction fails after storage write, an orphaned file can remain. Phase 2F must add cleanup-on-failure behavior or a documented pending/committed storage lifecycle.

### P1: Filename and download header hardening

Attachment filenames are stored as metadata and later returned in response headers. Phase 2F must normalize or validate filenames for control characters and unsafe header characters, and should use a safe `Content-Disposition` attachment header for downloads.

### P1: Runtime content-type policy

The attachment service supports `REG_ENGINE_ATTACHMENT_ALLOWED_TYPES`, but an empty allow-list currently means all content types are accepted. Phase 2F must decide and document whether an explicit allow-list is required for staging/production-like runtimes while remaining convenient for tests.

### P1: MIME trust boundary

The backend currently relies on the client-provided upload MIME type for allow-list checks. Phase 2F must document this as MVP behavior or add a basic server-side type check where practical.

### P1: Malware scanner setting is not enforced

Runtime setting `REG_ENGINE_MALWARE_SCANNER` exists, while the service currently uses the deferred scanner hook for the MVP slice. Phase 2F must either enforce only the documented `deferred` mode or wire supported scanner modes explicitly. Unsupported scanner modes must fail clearly.

### P1: Attachment retention and stored file lifecycle

Archiving an attachment preserves metadata and bytes. Phase 2F must explicitly document whether `stored_files.archived_at` remains unused for now, whether file bytes are retained indefinitely, and what later garbage-collection or retention phase will own cleanup.

### P2: Attachment API response shape

Attachment responses expose internal `stored_file_id` and checksum. This is currently acceptable for authenticated users with card visibility, but Phase 2F should confirm whether these values should remain visible before frontend document UI starts.

## Phase 2F: Attachment Backend Hardening Before Next Document Phases

Purpose: close attachment backend correctness and security gaps before approving generated documents, frontend attachment UI, public-link file flows, or `file_ref`.

Status: planned next.

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

Acceptance criteria:

- Oversized uploads are rejected without unbounded memory reads.
- Failed metadata writes do not silently leave untracked files, or the pending-file lifecycle is explicit and tested.
- Download headers are safe for filenames with unusual characters.
- Runtime storage/content-type/scanner settings are deterministic and tested.
- Attachment archive/retention behavior is documented.
- Existing attachment service/API tests still pass.
- No generated-document, frontend attachment UI, public-link file flow, or `file_ref` work is introduced.

## Blocked Future Directions

These require explicit approval after Phase 2F:

### Phase 2C: Generated Document Templates

Planned work after approval:

- Decide template format and rendering engine.
- Store templates without real personal data.
- Render documents from schema-driven card data, not hardcoded employee columns.
- Record generated document metadata and audit events.

### Phase 2D: Frontend Document Workflows

Planned work after approval:

- Add Russian-first UI for attachments and generated documents.
- Keep document UI inside feature modules, not a monolithic route.
- Add upload/download/archive states and localized errors.
- Keep public-link document behavior aligned with approved scope.

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
