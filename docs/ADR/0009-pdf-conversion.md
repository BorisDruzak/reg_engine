# ADR 0009: PDF Conversion Strategy

## Status

Accepted for Phase 2N.

## Context

Registry Engine already stores generated documents through the storage
abstraction and records metadata in `generated_documents`. Phase 2M added
binary `.docx` template upload and template versioning, but exact Word-to-PDF
conversion for arbitrary binary templates requires an external converter
boundary such as LibreOffice/UNO or a dedicated document conversion service.

## Decision

Phase 2N starts with authenticated PDF generation for `docx_text_v1` templates
only.

- The backend renders the same schema-driven text template data directly to PDF.
- PDF bytes are stored through the existing generated-document storage prefix.
- The output is recorded as a normal `generated_documents` row with
  `content_type=application/pdf`.
- Generation requires the same `cards.manage` permission and card scope checks
  as `.docx` generation.
- Reads, downloads, archive behavior, and storage cleanup reuse the existing
  generated-document boundary.
- Public-link PDF generation/download is not exposed.
- Binary `.docx` to PDF conversion remains unsupported until an explicit
  converter boundary is designed and validated.

## Consequences

- No database migration is required.
- The first PDF renderer is deterministic and does not execute template code.
- Cyrillic text is rendered with DejaVuSans when the font is available.
- Complex Word layout fidelity, tables, repeated sections, headers, footers,
  content controls, images, and binary `.docx` layout conversion are deferred.
- Future converter integration must stay behind the backend service/API boundary
  and continue using storage, RBAC, and audit rules.
