# Card creation tabs and organisation-triggered drafts

**Date:** 2026-07-12
**Status:** approved by the user for inline implementation

## Goal

Keep the card registry list focused while making creation workflows reachable
as first-class workspace tabs. A public creation link must create its draft
card and child public-edit link as soon as the recipient explicitly selects an
allowed organisation, not after the first typed character.

## Administrator workspace

- The existing card tab strip is the only place where creation workflows open.
- `Создать карточку`, `Создать ссылку`, and `Список ссылок` are closeable
  workspace tabs beside open-card tabs; they do not render below the search or
  card list.
- The `Создать карточку` button remains a compact menu launcher. Selecting an
  action opens and activates its corresponding tab. Closing a utility tab
  returns to `Список карточек`.
- The card list itself contains only search, rows, and its normal feedback.

## Public creation flow

1. A recipient opens a reusable parent creation URL.
2. The page always shows the configured organisation selector, including when
   the link has only one available organisation. No field is editable before
   a deliberate selection.
3. Selecting an organisation calls a new public draft-create endpoint. It
   validates the open parent link and server-side allowlist, then atomically
   creates a schema-driven draft card, its indefinite child public-edit link,
   and their relation. No business field value is required.
4. The page replaces its URL with the child `/public/edit/:rawToken` URL. All
   actual field and attachment edits use the ordinary existing public-card
   flow and its autosave queue.
5. The draft is immediately visible in the registry under the selected
   organisation. Closing the parent later prevents further drafts but leaves
   every existing child link usable.

## Backend contract

- Add `POST /public/card-creation-links/create-draft` with parent raw token
  and allowed `organization_id` only. It returns the same child-card/link
  payload used by the old first-save endpoint.
- Keep `first-save` temporarily compatible for existing callers, but route new
  UI through `create-draft`; do not create duplicate cards if a recipient is
  already on the child URL.
- The creation action writes audits for the card, child public link, and parent
  relation without raw tokens. Public allowlist and close-state checks remain
  entirely backend-enforced.

## Verification

- Backend service/API tests prove an explicit organisation choice creates a
  draft with an indefinite child link, rejects an organisation outside the
  allowlist, and preserves child access after parent closure.
- Frontend tests prove selecting an organisation calls `create-draft` before
  any field interaction and redirects to the child URL.
- Workspace tests prove each create/list action renders in a closeable tab and
  never below the search/list panel.
