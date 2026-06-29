# ADR 0007: file_ref Dynamic Field Type

## Status

Accepted

## Context

Phase 2 established card-level attachments, stored file metadata, generated
`.docx` document rendering, authenticated attachment UI, public-link attachment
workflows, and attachment upload quota hardening. The next planned document
field step is a generic dynamic field type that lets a registry schema point a
card field at an existing attachment on the same card.

The repository remains schema-driven. `file_ref` must not become a hardcoded
employee, HR, or business-document column. Attachment storage roots, binary
files, storage keys, and operational configuration remain outside Git and must
not leak through API responses or browser UI.

## Decision

`file_ref` is a dynamic field type that references a card-scoped attachment
link, not a raw stored binary object.

- A `file_ref` value references `card_attachments.id`.
- A `file_ref` value does not reference `stored_files.id` directly.
- The first implementation supports a single attachment reference only.
- `multi_file_ref` is deferred.
- Upload, list, and download remain the existing attachment workflows.
- `file_ref` does not upload file bytes inline.
- Authenticated card editors may set a `file_ref` to an active attachment from
  the same card, or clear it with `null`.
- Setting a `file_ref` to an attachment from another card is invalid.
- Setting a new `file_ref` value to an archived attachment is invalid.
- Existing `file_ref` values that later point at archived attachment metadata
  remain readable as archived metadata instead of being silently removed.
- Public-link editing of `file_ref` is deferred.
- Public-link upload/download rules do not create public `file_ref` editing.
- API reads for `file_ref` return attachment metadata, not only a raw UUID.
- API reads must not expose storage keys, filesystem paths, storage roots,
  checksums, or `stored_file_id`.

Transfer behavior is explicit:

- The new card must not store the old card's `card_attachments.id`.
- If the source `file_ref` points to an active attachment, transfer creates a
  new `card_attachments` row for the target card that points to the same
  `stored_file_id`.
- The transferred `file_ref` points to the new target-card attachment link.
- The binary bytes are not duplicated.
- If the source `file_ref` points to an archived attachment, the first
  implementation clears that target value and records the skipped archived
  reference in audit metadata.

Generated document behavior is explicit:

- `docx_text_v1` renders `file_ref` as attachment title or original filename
  text only.
- Empty `file_ref` renders as empty text.
- Archived referenced attachments render with an archive marker.
- Generated documents do not embed binary files for `file_ref`.
- Generated documents do not add public or authenticated download URLs for
  `file_ref` in this phase.

## Consequences

Phase 2J.1 must add a migration, expected as `0008_file_ref_field_values` or an
equivalent ordered revision, with a nullable `field_values.value_attachment_id`
foreign key to `card_attachments.id` and supporting indexes/constraints.

Phase 2J implementation must add tests before or with behavior changes:

- model and migration tests for the new column, foreign key, index, and allowed
  field type;
- service tests for set, read, clear, wrong-card rejection, archived-selection
  rejection, archived-reference read behavior, and audit safety;
- transfer tests proving the target card gets its own attachment link;
- API tests proving reads return safe metadata and never expose storage
  internals;
- frontend tests for Russian-first select, save, clear, and empty states;
- generated document tests for active, empty, and archived `file_ref` values;
- live validation with disposable PostgreSQL and temporary storage.

Phase 2J does not implement public-link `file_ref` editing, inline upload inside
the `file_ref` control, `multi_file_ref`, import/export, PDF conversion, binary
`.docx` template upload, template versioning, reports, MCP, or business-specific
document fields.
