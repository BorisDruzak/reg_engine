# ADR 0006: Generated Document Templates

## Status

Accepted

## Context

Phase 2B and Phase 2F established card-level attachment storage, access checks,
audit behavior, bounded upload reads, and storage cleanup. The next approved
Phase 2C step is generated document support after the attachment foundation.

The repository remains schema-driven. Generated documents must use registry
schema and card values, not fixed employee or HR columns. Templates and generated
outputs may contain sensitive operational data, so binary templates, generated
files, and real personal data must not be committed to Git.

## Decision

Phase 2C introduces a backend-only generated document foundation:

- template metadata is stored in `document_templates`;
- generated output metadata is stored in `generated_documents`;
- generated output bytes are stored through the existing storage abstraction and
  represented by `stored_files`;
- the first renderer is `docx_text_v1`;
- `docx_text_v1` renders a constrained text template into a generated `.docx`
  file;
- template placeholders are resolved from schema-driven card data;
- no hardcoded HR fields, employee tables, or business-specific columns are
  introduced;
- template creation and archive require `registry.schema.manage`;
- document generation and generated document archive require `cards.manage` in
  the card organization and registry scope;
- generated document reads use card visibility;
- all create/generate/archive actions write `audit_events`.

Supported placeholders in this slice:

- `{{ card.id }}`
- `{{ card.display_name }}`
- `{{ card.registry_id }}`
- `{{ card.organization_id }}`
- `{{ fields.<block_code>.<field_code> }}`

Public links do not generate, upload, or download documents in Phase 2C.
`file_ref` remains deferred. PDF remains deferred. Frontend attachment/document
UI remains Phase 2D work.

Follow-up implementation kept this decision narrow: Phase 2D added authenticated
generation/download/archive UI, and Phase 2G added authenticated text-template
create/archive UI. Public-link file flows, `file_ref`, PDF conversion, binary
template upload, and template versioning remain deferred.

## Consequences

The first generated document slice is intentionally narrow. It proves schema
resolution, access control, generated file persistence, audit, and archive
semantics before richer template authoring, `.docx` binary template upload, PDF
conversion, frontend workflows, public-link file flows, or `file_ref`.

Generated document outputs use the storage prefix `generated_documents`. The
storage root remains configured outside Git.

Template body text is metadata in the database for this slice. Binary operator
templates and template versioning remain future work.
