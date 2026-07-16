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

The active editor currently reacts only after the browser reaches the later
`click` phase. A changed field can begin its blur/save sequence before that
activation is handled. `CardFieldLayoutNode` will request activation during
`pointerdown` capture for an inactive, eligible field. The document outside
pointer handler will treat every card field as an in-card interaction and
close the editor only when the pointer is outside all card fields.

`useBlockEditor.openField` remains the only transition path. It queues the
target as `pendingOpen`, flushes the changed current field, and opens/focuses
the target after a successful save. If the current value is unchanged, the
target opens immediately. A failed save retains the current field and its
visible error. The later click may repeat the request safely because opening
the already active target is a no-op.

## Verification

Add a regression test that edits one field, sends pointerdown to another
editable field without a later click, and asserts the save payload plus focus
on the newly opened control. Keep the existing outside-click close behavior
intact.
