# Schema Layout And Static Text Design

## Goal

Add durable schema layout controls for card blocks and fields, plus a static text field type, without turning cards into hardcoded business forms.

## Decisions

- Use a row-major grid model. A block stores `layout_columns` from 1 to 3. Fields keep the existing `position`; visual horizontal placement is derived from field order and block column count.
- Store field display settings in `form_fields.display_config_json`. Initial supported keys are `column_span`, `label_position`, and `separator_style`.
- Add `static_text` to the schema-driven field type list. Static text is configured in `options_config_json.static_text`, renders as read-only content, does not create editable card values, and is not required/list-display editable.
- Keep block and field archive operations as soft archive. The visual editor moves archive controls into inline edit panels.
- Keep existing registry/schema API compatibility and extend payloads instead of replacing endpoints.

## UI Behavior

- Template list opens a template by clicking the template card, not a separate `Открыть` button.
- Block cards open inline block editing by clicking the block header/card area.
- Field rows open inline field editing by clicking the row.
- Dragging fields changes row-major order. With three columns, fields can be positioned horizontally by dragging order.
- The card editor and public editor read layout settings and render fields according to block columns and field display config.
- The navigation sidebar can collapse, with navigation icons visible in the collapsed state.

## Migration

Add migration `0020_schema_layout_static_text`:

- `form_blocks.layout_columns integer not null default 1`, constrained to `1..3`;
- `form_fields.display_config_json jsonb`;
- update `ck_form_fields_field_type` to include `static_text`.

## Testing

- Backend metadata and migration SQL include the new columns, constraint, and field type.
- API/service tests cover block layout column roundtrip, field display config roundtrip, and static text rejection from card value editing.
- Frontend tests cover the schema editor opening behavior, static text option, and configured layout rendering.
