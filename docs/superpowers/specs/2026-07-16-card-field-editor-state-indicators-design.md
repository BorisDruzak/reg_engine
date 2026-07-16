# Visual states of an editable card field

## Goal

Restore clear, field-level feedback in the saved-card editor. A user must be
able to distinguish the active field, a locally changed value that has not yet
been saved, and a normal successfully saved value.

## Current cause

`FilledCardLayout` opens one field through `useBlockEditor`, but it only passes
completion presentation to `CardLayoutRenderer`. The renderer gives every
field in the opened block the generic `is-editing` class. It does not receive
the editor target, dirty state, or pending state for the individual field.

## Design

`FilledCardLayout` will project the existing `useBlockEditor` state into the
presentation of the one editable field:

- Active: the open field has a blue border and blue focus halo.
- Unsaved: when that field differs from its initial value and no request is in
  flight, it has a high-contrast amber/red border and halo. This state remains
  visible until the existing save path succeeds or the user restores the
  original value.
- Saving: a request in flight uses the active blue treatment without claiming
  that the result is already saved.
- Saved: filled fields retain the existing green completion treatment; empty
  and required-missing presentation remains unchanged.

The visual state is derived in render from the existing session state. No new
backend calls, timers, persistence, or global editor state will be introduced.
The individual editor control continues to own keyboard focus and the direct
pointer-down switching behaviour remains unchanged.

## Verification

Add component tests that identify the active field, simulate a changed draft,
and assert the active/unsaved CSS state only applies to that field. Verify the
saved state returns to the existing filled presentation after the save promise
resolves. Keep existing direct switching and outside-click tests green.
