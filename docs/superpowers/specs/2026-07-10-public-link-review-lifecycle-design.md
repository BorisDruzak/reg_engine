# Public Link Review Lifecycle Design

## Goal

Extend public card editing into a clear lifecycle in which an administrator
creates a link, a recipient edits the card, the recipient submits the result for
review, and the administrator either returns it for correction or confirms it
and closes access.

The approved data rule is direct editing: every successful public field save or
attachment upload immediately changes the real card. Administrator approval
records review completion and closes the link; it does not apply a staged copy.

## Lifecycle

New review-enabled links use these statuses:

- `active` — recipient may view and edit allowed content;
- `submitted` — recipient submitted for review; card data is already updated,
  but the link is read-only;
- `changes_requested` — administrator returned the same link for correction;
  allowed content is editable again;
- `approved` — administrator confirmed the changes; card data remains as
  edited and public card access is closed;
- `disabled` — administrator manually closed the link without approval;
- `expired` — the configured expiry time passed.

Allowed transitions are:

```text
active -> submitted
changes_requested -> submitted
submitted -> changes_requested
submitted -> approved
active | changes_requested | submitted -> disabled
active | changes_requested | submitted -> expired
```

All other transitions return a conflict response and do not mutate the link.

`active` and `changes_requested` imply `can_edit=true`. `submitted`, `approved`,
`disabled`, and `expired` imply `can_edit=false`. Approval also sets
`can_view=false` and `disabled_at`; the closed-status endpoint remains available
but never returns card values, schema, attachment metadata, or identifiers.

## Link Creation

`Отправить на заполнение` opens a compact card-side form with:

- expiry from 1 to 30 days;
- allowed blocks and fields, defaulting to the template's public-editable
  content;
- maximum public attachment uploads;
- a plain-language warning that saved values immediately update the card.

Creation returns the raw token once. The UI shows the full public URL and
`Копировать`. The application does not add email or messenger delivery in this
scope; the administrator sends the copied link through an existing channel.

At creation, the service stores a review baseline containing only the allowed
field/instance values and safe attachment comparison metadata. It never stores
the raw token, file content, storage paths, checksums, or scanner secrets in the
baseline.

Existing pre-review links remain compatible with active/disable/expire behavior.
They receive review controls only after an explicit `Начать цикл проверки`
action captures a baseline. This avoids presenting an incomplete historical
diff as authoritative.

## Recipient Editing

The public page uses the same shared card-layout renderer and exact configured
block/field composition as the internal card.

- type-specific controls keep existing validation and reference behavior;
- `file_ref` remains unavailable to public editing;
- the currently approved public attachment list/upload/download behavior remains
  supported while the link is editable;
- every successful field save immediately updates the card and writes an audit
  event with `actor_type=public_link` and `source=public_link`;
- every successful attachment upload keeps the existing scanner and quota
  behavior;
- progress counts visible required public fields without exposing hidden fields;
- the UI shows `Все изменения сохранены` only after the server confirms the
  latest mutation.

`Отправить на проверку` locks the link in one backend transaction, sets
`submitted_at`, stores a safe `submission_summary_json` containing only completed
and total public-field counts, writes a public-link audit event, and returns the
safe submitted status. Field edits and attachment uploads racing after
submission are rejected.

## Submitted Recipient State

The token may call a safe status endpoint after submission. The response exposes
only status and lifecycle timestamps needed for Russian UI copy. It does not
expose card values, layout, files, or internal ids.

The recipient sees:

- `Карточка отправлена на проверку`;
- submission time and completion summary captured at submit time;
- a read-only explanation that the administrator may approve or return the
  card for correction.

If the administrator requests changes, the same page returns to editable mode
and shows the administrator's Russian comment. If approved, it shows
`Заполнение завершено` and no card data.

## Administrator Review

The card and public-link list show a visible `На проверке` badge. Review data is
loaded only when the administrator opens the review surface.

The review response compares the current card with the link baseline:

- changed fields show baseline and current typed display values;
- unchanged fields remain visible without diff decoration;
- new/archived public attachments are summarized using safe metadata;
- each change links to its public-link audit timestamp;
- the screen states explicitly that changes are already applied to the card.

`Вернуть на доработку` requires a short comment, sets
`status=changes_requested`, restores allowed public editing, records the
reviewer and audit event, and reuses the same token and expiry.

`Подтвердить и закрыть доступ` requires a confirmation dialog, locks the row,
sets `status=approved`, records `reviewed_at` and `reviewed_by`, disables public
view/edit access, and writes one approval audit event. It does not rewrite card
values.

## Database Changes

Migration `0023_public_link_review_lifecycle` extends
`card_public_links` without deleting existing data:

- expand the status check to include `submitted`, `changes_requested`, and
  `approved`;
- add nullable `submitted_at timestamptz`;
- add nullable `reviewed_at timestamptz`;
- add nullable `reviewed_by uuid` referencing `users.id`;
- add nullable `review_comment text`;
- add nullable `baseline_snapshot_json jsonb`;
- add nullable `submission_summary_json jsonb`;
- add `review_enabled boolean not null default false` for legacy compatibility;
- add an index supporting administrator queries by `card_id`, `status`, and
  `submitted_at`.

The new link-creation service explicitly sets `review_enabled=true`. Existing
rows remain valid with `review_enabled=false` until an administrator starts a
review cycle.

## API Contract

Extend the existing create/list/read schemas with review fields and allowed
block/field ids. Add these endpoints:

- `POST /api/v1/public-links/submit` — token-authenticated submit;
- `POST /api/v1/public-links/status` — token-authenticated safe status;
- `GET /api/v1/public-links/{public_link_id}/review` — administrator diff;
- `POST /api/v1/public-links/{public_link_id}/request-changes` — administrator
  transition with comment;
- `POST /api/v1/public-links/{public_link_id}/approve` — administrator approval
  and close;
- `POST /api/v1/public-links/{public_link_id}/start-review-cycle` — opt-in
  baseline capture for a legacy active link.

All administrator endpoints require backend `cards.manage` access to the link's
card. Public token endpoints accept the token in the request body, never in logs
or query parameters.

## Concurrency, Security, and Errors

- lifecycle transitions lock the public-link row;
- submitting twice, approving a non-submitted link, or editing a submitted link
  returns a stable conflict response;
- expiry wins over later edit/submit attempts;
- approval never re-enables an expired or disabled token;
- raw tokens remain hashed at rest;
- closed status responses reveal no card data;
- public errors are mapped to Russian UI text and do not expose SQL, storage,
  scanner, traceback, or internal file information;
- all create/edit/upload/submit/request-changes/approve/disable actions write
  audit events.

## UI Placement

The internal card header owns `Отправить на заполнение`. The card's
`Публичные ссылки` tab becomes a status/history surface with link state, expiry,
progress, review badge, and allowed actions.

The review screen preserves the card-template block layout and highlights
changed fields inside their blocks. Completed links show a four-step timeline:
created, submitted, approved, and access closed.

## Testing and Acceptance

Migration/model tests cover new columns, constraints, indexes, and legacy-row
compatibility.

Service/API tests cover:

- baseline capture for new and opted-in legacy links;
- direct public field edits and attachment uploads;
- submit row locking and edit/upload rejection after submit;
- safe token status for submitted, changes-requested, approved, disabled, and
  expired links;
- typed field and safe attachment diffs;
- request-changes and resubmission using the same token;
- approve-and-close without rewriting card values;
- forbidden administrator access;
- invalid transitions and expiry races;
- complete audit events and absence of raw-token/internal-file leakage.

Frontend tests cover link creation, copyable URL, exact public layout,
autosave-confirmed state, submit confirmation, submitted receipt,
changes-requested reopening, administrator diff, approval confirmation, closed
timeline, and Russian error mapping.

Browser acceptance exercises the complete live flow from card link creation to
public edit, submit, administrator review, approval, and closed-token receipt,
including attachment quota behavior and absence of relevant console errors.
