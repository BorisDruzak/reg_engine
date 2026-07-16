# Direct card-field switch design

## Goal

When a user clicks another editable field in a filled card, the editor must
save the current draft and immediately transfer editing focus to the clicked
field. A preliminary click outside the current field must not be necessary.

## Scope

- Applies only to pointer/click activation of another editable field in the
  filled-card layout.
- Reuses the existing single-field `useBlockEditor` session and its queued
  `pendingOpen` save path.
- Leaves `Tab` / `Shift+Tab`, picker keyboard behavior, public-link editing,
  and field types that are not ordinary editable fields unchanged.

## Design

`FilledCardLayout` currently closes the active editor during document-level
pointer capture before the clicked field receives its activation event. The
outside-pointer handler will treat every card field as an in-card interaction:
it will close the editor only when the click is outside all card fields.

The clicked eligible field continues through its existing `onActivateField`
handler. `useBlockEditor.openField` then queues that field as `pendingOpen`,
flushes the changed current field, and opens/focuses the target after a
successful save. If the current value is unchanged, the target opens
immediately. A failed save retains the current field and its visible error.

## Verification

Add a regression test that edits one field, clicks another editable field, and
asserts the save payload plus focus on the newly opened control. Keep the
existing outside-click close test behavior intact.
