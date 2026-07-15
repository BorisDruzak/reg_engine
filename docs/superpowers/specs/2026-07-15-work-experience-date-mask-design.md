# Work Experience Date-Mask Input Design

## Goal

Make `work_experience` editing deterministic and familiar: one visible field
with duration words, sequential numeric entry, and no `contenteditable` DOM
reconciliation.

## User Interaction

- The editor has one outer border and one visual line.
- It contains three borderless numeric segments in this order: days, months,
  years. The visible unit words remain fixed next to their numeric segment.
- A user starts in days. When two digits are entered, focus automatically moves
  to months. After two month digits it moves to years. A year segment accepts
  up to four digits and does not advance further.
- `Space` also advances days to months and months to years. It has no text or
  focus-changing effect in the years segment.
- Backspace on an empty month or year segment moves to the prior segment.
- Blur preserves the exact entered numeric values. No formatted-text parser,
  selection reset, or post-blur value replacement is used.

## Implementation

- Replace the shared editor's `contenteditable` element with three controlled
  native text inputs, held in one wrapper with one border.
- Inputs have no individual border, background, or independent focus ring. The
  wrapper renders the focused state, preserving the visual contract of one
  field.
- Keep the existing three string drafts and existing validation. Emit the same
  `{ days, months, years }` payload only when all segments contain safe,
  non-negative integers.
- The API, stored server anchor date, calculation, Russian declension, and
  export representation remain unchanged.

## Verification

- Regression tests cover automatic 2/2/4 movement, Space navigation,
  backspace return, stable blur, protected unit words, and the structured
  payload.
- Creation, saved-card, and public-link tests assert one visual wrapper and
  the same saved payload.
- Run focused Vitest, TypeScript, ESLint, Prettier, production build, deploy,
  and live public-card verification without changing card data.
