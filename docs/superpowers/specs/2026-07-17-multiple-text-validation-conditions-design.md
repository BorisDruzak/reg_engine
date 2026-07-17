# Multiple Text Validation Conditions Design

## Goal

Allow a text field to have multiple independently configured validation
conditions. Each condition has its own Russian error message and interaction
mode: show an immediate error or prevent an invalid edit from entering the
field.

## Data Contract

`form_fields.validation_json` stores an ordered array of validation conditions.
Each condition has the existing validation shape (`russian_text` or portable
`regex`), its configured `message`, and `input_mode`:

- `show_error` — keep the draft, mark the control invalid, and show its message.
- `block_input` — reject an edit operation that would make the value violate the
  condition.

The API accepts the previous single-rule JSON object for existing fields and
normalizes it to a one-item list with `input_mode: "show_error"`. All read
projections return the canonical ordered list.

## Editor Experience

The text-field editor displays a list under `Проверка значения`. Saving a
condition leaves it visible and provides `Создать условие` for another one.
Every condition independently configures type, RegExp when relevant, Russian
message, and interaction mode. Changing the field type away from text clears
the complete condition list.

## Runtime Experience

All conditions are evaluated in order. Their messages are shown as separate
lines in one transient overlay, and an invalid saved-card/public-link field is
visually marked red. `show_error` retains the invalid draft and suppresses the
save callback. `block_input` rejects the whole attempted keyboard, paste, or
autofill change; no partial sanitization is performed. A valid edit continues
through the existing autosave flow.

## Server Enforcement

The backend evaluates every condition regardless of its UI interaction mode.
Any failure prevents persistence through ordinary cards, public links, card
creation links, and XLSX import/preview. Returned errors contain only the
configured Russian messages, never raw patterns or engine details.

## Safety and Compatibility

Each regex condition keeps the existing portable-syntax, timeout, and
client-side safety guards. Legacy malformed payloads fail closed in the client.
Existing one-rule fields remain usable via normalization; no schema migration is
required.

## Verification

Tests cover normalization of legacy and multi-condition payloads, all-condition
server enforcement, editor creation/removal/persistence, immediate red-state
messages, whole-operation blocking for typing and paste, recovery after a valid
edit, public-link parity, and no overlay-driven layout shift or focus loss.
