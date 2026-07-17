# Notification Popover and Picker Layering Design

## Goal

Make the notification popover dismiss predictably, remain above the cards list,
and keep its notification rows scrollable. Ensure open searchable choice lists
render above the card canvas and neighbouring fields without changing layout.

## Behaviour

- The notification panel closes on an outside pointer interaction or `Escape`.
  Interactions inside the bell or panel remain available.
- The notification panel uses a layer above card-list controls. Its header stays
  visible and only the notification rows scroll within the bounded panel.
- An open `SearchableChoicePicker` remains in normal document ownership but is
  raised above sibling card blocks and controls. Its popup stays absolutely
  positioned, so opening it cannot expand or reflow the card canvas.

## Boundaries

- No API, database, notification payload, or polling-contract changes.
- No portal is introduced: the existing components retain their DOM ownership
  and accessibility semantics.
- Russian-first labels and the current keyboard behaviour remain unchanged.

## Verification

- Component tests prove outside dismissal, `Escape` dismissal, and that inside
  interaction does not dismiss the notification panel.
- CSS regression coverage proves the notification panel and an open picker use
  a higher layer than ordinary card content, and scrolling is constrained to the
  notification-list region.
- Existing frontend unit, type, lint, and production build checks remain green.
