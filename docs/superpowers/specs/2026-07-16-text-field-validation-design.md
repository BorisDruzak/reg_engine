# Text Field Validation Design

## Goal

Allow schema administrators to configure safe validation for `text` form
fields. Invalid values remain visible to the editor, are not saved, and show a
temporary Russian error message above the card canvas.

## Scope

- Add validation configuration only for fields whose `field_type` is `text`.
- Use the existing `form_fields.validation_json` column; no migration is
  required.
- Validate all field-value write paths: card creation, ordinary card editing,
  public-link editing, and XLSX import.
- Preserve the configured validation in field read/write API payloads and in
  safe public-card schema data needed for client-side feedback.
- Keep the backend as the authoritative validator. Client-side validation is a
  fast UX preview and must not be the only enforcement point.

## Validation Contract

`validation_json` is `null` when no text validation is configured. For a
configured text field it has exactly one rule:

```json
{
  "kind": "russian_text",
  "message": "Введите значение русскими буквами"
}
```

or:

```json
{
  "kind": "regex",
  "pattern": "[А-Яа-яЁё -]+",
  "message": "Введите фамилию, имя и отчество без цифр"
}
```

Rules are mutually exclusive. Selecting one replaces the other. An empty text
value remains valid here; existing `required_mode` remains responsible for
required-field validation.

`russian_text` permits Russian Cyrillic letters including `Ё/ё`, spaces, and
hyphens. Every other character, including digits and punctuation, fails.

`regex` uses full-string matching: the configured expression must match the
entire non-empty value, not merely a substring. The server compiles and checks
the expression before a schema field can be created or updated. Empty patterns,
invalid expressions, non-string messages, unsupported keys, and validation on
non-text fields are rejected with controlled Russian API errors.

## Schema Editor

The inline text-field editor gains a disclosure titled `Проверка значения`.
Inside it, the administrator chooses `Не задана`, `Только русский язык`, or
`Регулярное выражение`.

- `Только русский язык` shows `Подсказка при ошибке`.
- `Регулярное выражение` shows `Регулярное выражение` and `Подсказка при
  ошибке`.
- A configured validation is saved together with the ordinary field schema
  update and is included in the form-field audit diff.

The default error message is Russian and editable. Existing text fields retain
`validation_json=null` and no new validation.

## Card and Public Editing

The shared text editor receives the field validation rule. On input, it
evaluates the current non-empty draft using the same contract as the backend.
If invalid, it keeps the draft in place, suppresses its autosave/immediate save,
and raises one anchored transient validation message above the card canvas.

The message uses the configured field-specific text and closes automatically
after four seconds. Re-editing a value restarts the timer; a successful local
validation or changing to another field closes the previous message. The popup
does not resize the grid, steal focus, or alter a stored value.

The backend repeats validation immediately after type coercion and before
writing `FieldValue`. A failure returns a structured, Russian-safe `422`
response that includes the field identifier and configured message but not raw
regular-expression internals. The frontend renders this response through the
same popup so race conditions or non-UI writes have a clear result.

## Imports and Other Consumers

XLSX preview/commit and card creation use the existing backend field coercion,
so they receive the same failure without separate duplicate rule logic. Export,
search, audit value rendering, document generation, and print output remain
unchanged because they read only already-valid stored values.

## Tests and Acceptance

- Schema API rejects malformed validation objects, invalid regexes, and rules
  on non-text fields.
- Schema create/update returns the stored validation rule and records it in the
  audit event.
- Card, public-link, creation, and XLSX write paths reject invalid text with
  the configured message and preserve existing values.
- Shared frontend editor blocks autosave for an invalid draft, displays a
  temporary popup, and resumes saving after the value becomes valid.
- The schema editor exposes each configuration state and rejects invalid regex
  before submitting a schema write.
- Existing unconfigured text fields continue to save unchanged.
