# User Scope Visibility And Card Search Input Design

## Goal

Make the existing user-scope editor describe inherited organization access
truthfully, identify users by login in the compact table, and make the card
search input the sole place where a scalar tag value is entered.

## Confirmed Product Decisions

1. A selected organization is a scope root. Its active descendants are in the
   user's scope through the existing backend `include_descendants=true` grant.
2. Descendants of a selected root are shown as checked, disabled, and labelled
   `Входит через название выбранной родительской организации`; they are not written as
   additional organization roots.
3. The user table's first column is `Логин` and shows the user's email/login.
   Clicking that value still opens the same inline profile. The display name
   remains available in the profile heading and editor.
4. The card-search field is the only editable text surface for a scalar field
   filter. The separate `Значение фильтра …` row and its button are removed.
5. Without a pending tag, typing filters the available tag choices. It does
   not immediately issue a full-card text search.
6. Full-card text search remains available through the explicit `Текст
   карточки` choice. It uses the same main input, a visible prefix, and Enter
   to create its text-search chip.

## Non-Goals

- No change to role definitions, `access_grants`, stored organization roots,
  backend authorization, or the `include_descendants` contract.
- No database migration and no rewriting of existing user grants.
- No change to reference-list, boolean, organization, template, archive, or
  card-list API payloads.
- No new standalone search field, modal, or duplicate filter editor.

## Organization Scope Selector

`organizationIds` continues to store only intentionally selected scope roots.
The selector derives a second set of inherited descendants for rendering.

- A directly selected organization is checked and remains editable unless it
  is itself covered by another selected root.
- An inherited descendant is checked and disabled. Its visible explanation
  names the closest selected ancestor that grants the coverage.
- Selecting an organization removes any explicitly stored selected descendants
  because the new root already covers them. This prevents duplicate grants.
- Clearing a selected root removes its inherited coverage. A descendant can
  then be chosen independently as a new root.
- Existing redundant grants are displayed safely but are not silently changed
  until an administrator saves an edited scope.

The submission payload remains the compact root list. The backend continues to
create one `include_descendants=true` grant per submitted root, so UI state
cannot expand access beyond the already enforced scope rule.

## User Table

The compact list uses the column header `Логин`. The clickable value is
`user.email`, which is the stable operator-facing identifier requested for the
table. The inline profile continues to show and edit the display name,
password, role, scope, status, and permitted access delegation controls.

## Unified Card Search

The existing search row gains two modes.

### Tag discovery

With no active scalar draft, text in the main input filters the tag popover by
Russian label: basic choices, organization names, template names, and field
labels. The current text is not sent to the card list API in this mode. A
clear empty state is shown when no tag matches.

### Value entry

Choosing `Текст карточки` or a scalar field (`text`, `number`, `date`, or
`datetime`) clears discovery text and switches the main input to value entry.
The row visibly prefixes the input with `Текст карточки:` or the selected
field label followed by a colon. The accessible label becomes `Значение
фильтра` followed by that same field label.

- Enter validates the value and creates the existing search chip.
- A successful field filter uses the existing `CardFieldFilterPayload` and
  card-list query parameters.
- A successful text-search filter uses the existing `q` query parameter.
- Escape cancels the pending value entry without changing applied filters.
- Empty values do not add a filter.
- Date and number inputs retain their native input type while in value-entry
  mode.

Boolean and reference-list values remain selectable inside the popover. This
preserves their readable option labels and avoids accepting arbitrary IDs.
Their existing chips and request payloads are unchanged.

## Error Handling And Accessibility

- Disabled inherited checkboxes convey coverage rather than an unavailable
  permission; their label explains why they cannot be toggled directly.
- The selected field prefix is always visible. The input also keeps an
  explicit accessible label.
- Invalid scalar input does not create a filter or alter the currently applied
  card list. Existing browser validation and Russian field labels remain in
  use.
- Clicking outside the search closes the popover without applying a draft.
  Existing applied chips are never lost by that action.

## Testing Strategy

### User workspace

1. Selecting a root makes every rendered descendant checked and disabled with
   the inherited-coverage explanation.
2. Saving the scope submits only selected roots, not derived descendants.
3. Selecting a parent removes selected descendants from the submitted root
   list.
4. The table exposes `Логин`, displays the email/login, and still opens the
   inline profile when clicked.

### Card search

1. Typing with no pending tag narrows the tag popover and does not send `q`.
2. Selecting a scalar field moves its value draft into the main input, shows
   the field prefix, and removes the separate inline-value form.
3. Enter creates the same field-filter chip and API payload as the retired
   form.
4. Selecting `Текст карточки` creates the existing text-search chip and `q`
   request only after Enter.
5. Escape cancels a pending value draft without removing applied chips.
6. Existing reference, multi-select, boolean, date, template, and organization
   filter interactions stay available.

## Live Browser Acceptance

At desktop and narrow mobile widths, verify that a selected school visibly
covers its kindergarten descendant, that the first user-table value is a
login, and that the one card-search input both filters tags and accepts the
chosen tag's scalar value. Verify the resulting card requests and confirm no
browser console errors, framework overlay, or horizontal overflow.
