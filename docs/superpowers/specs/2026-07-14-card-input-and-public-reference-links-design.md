# Card input stability, organization choices, and public reference links

## Goal

Keep the cursor and local draft stable while a card field is saved, provide a
safe organization picker, and let an administrator issue a separately scoped
public link for creating and maintaining reference lists and their items.

## Scope and delivery order

The work is three independently releasable slices, implemented and verified in
this order:

1. Stable autosave for authenticated and public card fields.
2. A schema-driven `organization_ref` field with secure choices.
3. Public reference-edit links.

Existing card public links are not broadened. Existing reference lists and
items are not physically deleted by this work.

## Slice 1: stable card-field autosave

### Problem

The authenticated editor closes a field when its background save succeeds.
The public editor writes the API response back into the active controlled
input. Both behaviours can remove focus or move the caret while a person is
typing.

### Behaviour

- A successful background save retains the active authenticated field and its
  focus. The editor records the current value as its saved baseline and clears
  the dirty state; it only closes on an explicit outside-field action or when
  another field is opened.
- Text, number, date, datetime, and JSON use a short debounce. Boolean and
  controlled choices save immediately because they have no text caret.
- Public fields keep their local draft as the displayed value while focused.
  A successful response updates only confirmation/completion state; it must
  not replace the focused input value. The public editor debounces text-like
  fields and flushes a pending draft on blur.
- Validation and request failures preserve the draft and show the Russian
  error. They never silently replace it with an older server value.

### Tests

Tests cover administrator and public text/date inputs with deferred requests:
after a successful autosave the same input remains mounted, focused, and holds
the locally entered value. Existing queue ordering and lifecycle-denial tests
remain in place.

## Slice 2: `organization_ref` field

### Schema and validation

- `organization_ref` remains a typed `field_values.value_organization_id`
  reference; no business-specific field is added.
- Its `options_config_json` receives the optional
  `allowed_organization_ids: string[]` configuration. The schema editor writes
  this only for `organization_ref` fields, validates UUIDs, de-duplicates them,
  and removes the setting when the field changes type.
- An authenticated actor may write only an active organization that they can
  read in the card registry scope. A system administrator sees every active
  organization.
- A public link may write only an active organization explicitly listed in
  this field's `allowed_organization_ids`. An empty list makes the public
  organization field read-only/unavailable rather than exposing all
  organizations.
- Archived organizations remain resolvable for historical card display but
  are disabled and rejected for new writes.

### User interface

- Administrator and public cards use the existing keyboard-safe
  `SearchableChoicePicker`, with the organization tree and text search.
- The template field editor displays an organization-tree multi-picker only
  when the field type is `organization_ref`, labelled
  `Организации для публичного выбора`.
- Public cards show only the explicitly configured allowed organizations;
  authenticated cards show only the caller's permitted organizations.

### Tests

Backend tests prove scoped-user rejection, public allowlist rejection, and
archived-target rejection. Frontend tests prove hierarchy/search behaviour and
that free text cannot be saved as an organization id.

## Slice 3: public reference-edit links

### Link model and lifecycle

`reference_edit_links` is a new table, separate from `card_public_links`.
Each row has a hashed opaque token, a required `registry_id`, an optional fixed
`owner_organization_id`, optional expiration, `closed_at`, and its creating
user. A reference list created by the link records its
`created_via_reference_edit_link_id`; this is the ownership boundary for the
public workspace.

The administrator may create, list, copy, and close a link. A link is
`active`, `closed`, or `expired`. Closing or expiry blocks every public write
and leaves the workspace read-only. A token never grants access to reference
lists that were not created by that same link.

The audit model gains an explicit nullable reference-edit-link actor field.
Every public create, update, and archive event records the acting link without
pretending that it was an authenticated user or a card public link.

### Public API

The API exposes a small public namespace for token status, its list workspace,
and allowed mutations. It never calls an authenticated user endpoint as a
substitute for token access.

- Read the link status and only the lists created through that link.
- Create a list in the link's fixed registry and fixed owner organization.
- Update or soft-archive only a link-owned list.
- List, create, update, or soft-archive only items belonging to a link-owned
  active list.
- Set an item's `parent_id` only to another active item in that same list;
  cyclic hierarchy and foreign parents are rejected.

Public forms accept names, descriptions, and hierarchy placement. The backend
generates a unique technical code for public-created lists and items, keeping
technical codes out of the public task while preserving current data
constraints. Public callers cannot change a list's registry, owner,
inheritance, descendant lock, or system-management flags.

### Administrator and public UI

- The registry's reference-list workspace adds `Ссылка на заполнение
  справочников`. Its inline form selects the fixed registry and optionally an
  organization owner, then shows the generated URL and a close action using
  the same lifecycle language as card links.
- `/public/references/:rawToken` is Russian-first. It lists only link-created
  reference lists, supports inline list/item forms and expandable item trees,
  and shows clear active/closed/expired states.
- Closing is not a delete: it disables public controls and preserves visible
  created data for review.

### Tests and release gates

Backend API tests cover token isolation, expiry/closure denial, registry and
owner immutability, item-parent isolation, soft archives, and audit actors.
Frontend tests cover active editing, closed read-only display, and URL routing.
The PostgreSQL migration is tested first against a disposable `*_test`
database. Production migration follows the repository's backup and preflight
gate, then normal local checks, deploy, and Browser proof.

## Non-goals

- No access to pre-existing reference lists through a public token.
- No public user, role, organization, registry, schema, card, or attachment
  management.
- No physical deletion of reference lists/items.
- No change to card-public-link tokens or their review lifecycle.

## Acceptance criteria

1. Typing a card value does not lose the cursor after autosave in either
   authenticated or public editing.
2. Organization fields enforce authenticated access and public allowlists in
   the backend and render searchable hierarchy choices in the frontend.
3. A public reference link can manage only its own created lists and their
   item trees while active; it becomes read-only when closed or expired.
4. Every state-changing action is audited with the correct user or public-link
   actor.
