# ADR 0004: Phase 2 Documents Scope

## Status

Accepted

## Context

Phase 2 is the next planned product phase after the completed Phase 1L stabilization work. `PLANS.md` blocked Phase 2 implementation until the user approved the scope and storage target.

The existing Core Schema v1 is schema-driven and does not contain document/file storage tables. `docs/BASE.md` reserves `file_ref` for the documents phase, but does not define a final documents architecture.

On 2026-06-28 the user approved Phase 2 implementation with the decisions below.

## Decision

Start Phase 2 with attachments first:

- card-level attachments;
- attachment metadata and authorization;
- attachment archive/restore-read behavior: archived attachments are hidden from normal active lists, preserved, and readable only as read-only archive records by actors who can read the card in the relevant scope;
- audit events for attachment create/archive/download where required;
- `file_ref` deferred until attachment metadata is stable.

Defer generated `.docx`/`.pdf` documents until attachment storage, access control, and audit behavior are proven. Generated documents should become Phase 2C, not the first slice.

Use a storage abstraction with a local filesystem backend for MVP/internal staging, configured outside Git.

Reasons:

- lowest operational complexity for the current single-server deployment;
- no cloud credentials in the public repository;
- easy backup and smoke-test behavior;
- compatible with future S3-compatible storage if a second backend is added behind the same service interface.

Do not store binary file contents in Git. Avoid PostgreSQL `bytea`/large-object storage as the first implementation unless there is a strong operational reason; it increases database backup size and couples file throughput to the primary database.

Public links do not upload or download attachments in the first Phase 2 slice.

Malware scanning enforcement is deferred in Phase 2A, but a future scanner hook must be designed before upload endpoints are exposed.

## Phase 2 Slice Order

1. Phase 2.0: approve scope and storage target. Completed by this ADR.
2. Phase 2A: storage ADR accepted, file metadata schema designed, service boundary and access rules specified.
3. Phase 2B: attachments backend foundation with tests before endpoints.
4. Phase 2C: generated documents after attachment foundation.
5. Phase 2D: Russian-first attachment UI after backend behavior is stable.
6. Phase 2E: security and live validation.

## Non-Goals

- No hardcoded HR document templates.
- No import/export.
- No MDB migration.
- No MCP.
- No committed real personal data or binary templates.
- No storage credentials or concrete storage endpoints in Git.

## Consequences

- Phase 2A can proceed as an architecture checkpoint.
- Phase 2B can start only after the user accepts Phase 2A artifacts covering the storage ADR, metadata schema, service boundary, access-control rules, malware scanner hook, and required tests.
- Upload endpoints and frontend UI remain out of scope until the backend service layer and tests exist.
