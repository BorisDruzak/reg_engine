# Inline row for card fields

## Purpose

Make ordinary card completion compact and direct in both the administrator
workspace and the public card link. A person should see the field label and
the editable value control in one row without opening a separate editor.

## Approved presentation

- Each ordinary editable field is rendered as one row: label at the left,
  control at the right.
- The control is always present and editable when the viewer has the existing
  permission to edit that field. Existing autosave, validation, and server
  confirmation behaviour remain unchanged.
- Empty controls use the existing field description as the placeholder where
  the field type supports it. A value remains directly visible in the control.
- Public cards do not render duplicate field label, block-instance label,
  field-type label, or `Текущее значение` text beside the control.
- The administrator card view follows the same row structure. It does not
  weaken backend permissions, nor make static text, attachments, or fields
  without edit permission editable.
- At the narrow responsive breakpoint, each row stacks into a readable label
  above its control.

## Scope and boundaries

- The work is presentation-only: no API, database, schema, public-access, or
  audit contract changes.
- Repeatable-block headings continue to identify the instance once per block;
  they are not repeated inside every field.
- `file_ref`, static text, and read-only values keep their specialised safe
  presentation rather than being represented as fake editable inputs.

## Validation

- Component tests prove that the public and administrator views render one
  label/control row, omit duplicate metadata, and keep editable controls
  available.
- Rendered browser checks cover the public link and authenticated card view,
  console health, desktop layout, and a narrow viewport when the authenticated
  browser surface permits resizing.
