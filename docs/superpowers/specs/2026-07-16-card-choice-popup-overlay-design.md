# Card choice popup overlay

## Goal

Show choice lists in saved-card fields as an overlay above the card canvas. An
open list must not increase the card grid row height or move neighbouring
fields.

## Current cause

`SearchableChoicePicker` renders its popup as a normal grid child. The popup
therefore participates in the layout height. Saved-card field nodes also use
`overflow: hidden`, which prevents an overlaid popup from extending beyond the
field.

## Design

The picker remains in the existing field DOM subtree; no portal or coordinate
measurement is required. While open, its root receives an explicit open class.

- The picker is a relative positioning context.
- Its popup is absolutely positioned below the trigger, spans the field width,
  has a bounded scrollable height, and has a high z-index.
- The saved-card field node containing an open picker becomes overflow-visible
  and gets a local stacking level above adjacent card fields.
- Closed fields keep their current overflow clipping and layout.

The component's existing accessible trigger, search, keyboard navigation,
option selection, and Escape behavior remain unchanged. This scope covers
schema-driven `select`, `multi_select`, `organization_ref`, and `org_unit_ref`
fields, which share `SearchableChoicePicker`.

## Verification

Add a unit test for the explicit open class and CSS-contract assertions for
relative picker positioning, absolute popup positioning, the open card-field
overflow rule, and stacking levels. Keep the existing picker filter, selection,
Escape, and card field-switch tests green.
