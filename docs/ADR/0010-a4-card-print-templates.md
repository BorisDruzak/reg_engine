# ADR 0010: A4 Card Print Templates

## Status

Accepted for Phase 8.

## Context

Registry Engine already has schema-driven cards, document templates, generated
documents, storage-backed downloads, RBAC checks, and audit logging. The current
card filling workflow is intentionally a simple data-entry surface, while
operators also need a print-oriented layout editor for card outputs.

The A4 editor must not turn the normal card editor into a page-layout tool. It
is only for print templates. The saved source of truth must be structured JSON,
not DOM state, a screenshot, or CSS pixel coordinates.

## Decision

Add `card_print_layout_v1` as a new document template format that reuses the
existing `document_templates`, `document_template_versions`, and
`generated_documents` infrastructure.

- `document_templates.card_template_id` optionally scopes a print template to a
  card template.
- `document_template_versions.layout_json` stores an immutable print layout for
  `card_print_layout_v1`.
- The print layout uses A4 page metadata, a 12-column grid, stable item ids,
  grid row/column/span coordinates, and style metadata.
- Backend validation rejects invalid versions, unknown field ids, out-of-page
  items, invalid spans, invalid repeat modes, and blocking overlaps.
- Backend generation renders DOCX/PDF from card data plus layout JSON through
  deterministic services. It does not use frontend screenshots or
  HTML-to-image.
- Generated files continue to be stored as `generated_documents` and keep the
  existing download/archive boundaries.

## Consequences

- Existing `docx_text_v1` and `docx_binary_v1` templates remain valid.
- Existing cards, card templates, public links, import/export, reports, and MCP
  flows remain outside the print-layout editing surface.
- The first DOCX renderer uses editable Word content, favoring table-based
  layout over floating text boxes for data fields.
- The first PDF renderer uses ReportLab, A4 dimensions, grid placement, and
  text wrapping.
- QR and image/logo items may be represented in layout JSON before full
  rendering support, but unsupported generation must be explicit and safe.
