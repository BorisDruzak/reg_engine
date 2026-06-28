# ADR 0004: Phase 2 Documents Scope Proposal

## Status

Proposed

## Context

Phase 2 is the next planned product phase after the completed Phase 1L stabilization work. `PLANS.md` explicitly blocks Phase 2 implementation until the user approves the scope and storage target.

The existing Core Schema v1 is schema-driven and does not contain document/file storage tables. `docs/BASE.md` reserves `file_ref` for the documents phase, but does not define a final documents architecture.

## Recommended Starting Scope

Start Phase 2 with attachments first:

- card-level attachments;
- attachment metadata and authorization;
- attachment archive/restore-read behavior;
- audit events for attachment create/archive/download where required;
- optional `file_ref` dynamic field support after attachment metadata is stable.

Defer generated `.docx`/`.pdf` documents until attachment storage, access control, and audit behavior are proven. Generated documents should become Phase 2C, not the first slice.

## Recommended Storage Direction

Use a storage abstraction with a local filesystem backend for MVP/internal staging, configured outside Git.

Reasons:

- lowest operational complexity for the current single-server deployment;
- no cloud credentials in the public repository;
- easy backup and smoke-test behavior;
- compatible with future S3-compatible storage if a second backend is added behind the same service interface.

Do not store binary file contents in Git. Avoid PostgreSQL `bytea`/large-object storage as the first implementation unless there is a strong operational reason; it increases database backup size and couples file throughput to the primary database.

## Open Decisions Requiring User Approval

- Whether Phase 2 approval covers attachments only, generated documents only, or both.
- Whether public-link users can upload attachments.
- Whether public-link users can download attachments.
- Whether `file_ref` dynamic fields are required in the first Phase 2 implementation slice.
- Whether generated documents must support `.docx`, `.pdf`, or both.
- Whether template management is deferred, operator-managed, or UI-managed.
- Whether malware scanning is required immediately or explicitly deferred with risk notes.

## Proposed Phase 2 Slice Order

1. Phase 2.0: approve scope and storage target.
2. Phase 2A: storage ADR accepted, file metadata schema designed, access rules specified.
3. Phase 2B: attachments backend foundation with tests before endpoints.
4. Phase 2D: Russian-first attachment UI after backend behavior is stable.
5. Phase 2C: generated documents after attachment foundation.
6. Phase 2E: security and live validation.

## Non-Goals

- No hardcoded HR document templates.
- No import/export.
- No MDB migration.
- No MCP.
- No committed real personal data or binary templates.
- No storage credentials or concrete storage endpoints in Git.

## Acceptance For Converting This ADR To Accepted

- User explicitly approves Phase 2 implementation.
- User confirms attachment/generated-document scope.
- User confirms storage target.
- `PLANS.md` is updated from approval gate to the first active Phase 2 implementation checkpoint.
