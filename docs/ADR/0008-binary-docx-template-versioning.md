# ADR 0008: Binary DOCX Template Versioning

## Status

Accepted

## Context

Phase 2C introduced `docx_text_v1`, where template bodies are stored as text in
`document_templates.template_body`. Phase 2M moves the document boundary toward
managed binary `.docx` template assets while keeping generated documents
schema-driven and storage-backed.

The system must not store template files in Git. Template uploads must use the
existing backend storage abstraction and the same backend permission boundary as
text templates.

## Decision

Phase 2M adds `document_template_versions`.

- `document_templates` remains the logical template record identified by
  registry, code, name, output filename template, lifecycle, and permissions.
- `document_template_versions` stores immutable template versions.
- Text templates receive version rows with `template_format=docx_text_v1` and a
  `template_body`.
- Binary uploads create versions with `template_format=docx_binary_v1` and a
  `stored_file_id`.
- Existing text templates are backfilled as version `1` during migration.
- Generated documents record the `template_version_id` used to produce the
  output.
- The current generation workflow uses the latest active template version.
- Binary `.docx` rendering replaces supported placeholders in XML parts. It
  does not implement full Word run-merge templating in this slice.
- Binary template uploads are authenticated API workflows requiring
  `registry.schema.manage`.
- Template version responses expose safe metadata only and do not expose storage
  keys or checksums.

## Non-Goals

Phase 2M does not add PDF conversion, public-link document workflows, import or
export, reports, MCP, browser UI for binary upload, binary template download,
or business-specific document fields.

## Consequences

The first binary renderer supports placeholders that are present as contiguous
text in `.docx` XML. More advanced Word template parsing, content controls,
repeated sections, and binary template downloads require later explicit phases.
