# Phase 2 Approval Checklist

Phase 2 approval was captured on 2026-06-28. This checklist is retained as the approval audit artifact.

Follow-up: Phase 2G later moved authenticated document-template management UI out
of the deferred bucket. Phase 2H later moved public-link attachment
list/upload/download for active public edit links out of the deferred bucket.
`file_ref`, binary `.docx` template upload, PDF conversion, import/export, and
MCP remain deferred.

## Recommended Approval

Captured approval:

```text
Approve Phase 2 implementation.
Scope: card-level attachments first; generated documents deferred.
Storage: local filesystem backend through a storage abstraction, configured outside Git.
Public links: no upload/download support in the first Phase 2 slice.
file_ref: defer until attachment metadata is stable.
```

With this approval, the first implementation checkpoint is Phase 2A: storage architecture and metadata schema design. Code still starts with tests and an accepted storage ADR before endpoints or UI.

## Decisions To Change Before Approval

Change the approval text if any answer differs:

| Decision | Default proposal | Alternatives |
| --- | --- | --- |
| First scope | Card-level attachments | Generated documents first, or both attachments and generation |
| Storage target | Local filesystem backend via abstraction | S3-compatible object storage, PostgreSQL `bytea`/large objects, other approved storage |
| Public-link upload | Deferred | Allow public-link upload with explicit field/block/card rules |
| Public-link download | Deferred | Allow public-link download with explicit allowed-files rules |
| `file_ref` field type | Deferred until attachment metadata is stable | Include in the first slice |
| Generated formats | Deferred | `.docx`, `.pdf`, or both |
| Template management | Deferred | Operator-managed files, UI-managed templates |
| Malware scanning | Deferred with risk note | Required before any upload endpoint is exposed |

## Non-Negotiable Guardrails

- No hardcoded employee or HR-specific document model.
- No document templates with real personal data in Git.
- No storage credentials or concrete storage endpoints in Git.
- No physical delete as a normal workflow.
- Backend access checks remain the security boundary.
- Attachment access follows card visibility and organization scope.
- All create/archive/generated-document actions write audit events.
- UI remains Russian-first.

## First Implementation Checkpoint After Approval

Phase 2A should deliver:

- accepted storage ADR;
- proposed metadata schema;
- service boundary design;
- access-control rules;
- test list for attachment metadata, card visibility, archive behavior, and audit;
- no public endpoints until service tests exist.
