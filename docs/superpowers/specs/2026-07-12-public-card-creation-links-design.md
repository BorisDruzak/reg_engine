# Public card-creation links design

**Date:** 2026-07-12
**Status:** approved design, ready for implementation planning
**Execution:** direct on `main` at the user's request

## Goal

Administrators can issue a public, indefinitely active link that starts a new
schema-driven card from one selected template. The link may allow one or more
organisations. No empty card is persisted: the first successful field save
creates the card and a separate public continuation link for that exact card.

The existing public-card submit-for-review panel is removed from the public UI.
Public field edits remain direct, sequential autosaves.

## User flow

1. In the card-list `Создать карточку` menu, an administrator chooses
   `Создать ссылку на создание карточки`.
2. The administrator selects a template and one or more allowed organisations.
   The creation link has no expiry by default.
3. A recipient opens `/public/create/:rawToken`.
   - One allowed organisation is selected automatically.
   - With several organisations, the recipient must select one of the listed
     organisations before editing fields.
4. The public page displays the selected template without a persisted card.
   Its first successful field save atomically creates the card, records the
   selected organisation, saves that field, and creates a child public edit
   link for the new card.
5. The browser changes to `/public/edit/:rawToken` for that child link. Later
   field and attachment saves use the existing public-card workflow.
6. The new card appears in the registry from the first save onward. Its base
   block shows `Ссылка на заполнение`, and the creation-link list shows the
   created card and its continuation URL.

## Data and access model

- Introduce a dedicated `card_creation_links` entity. It stores the registry,
  template, creator, active/closed state, nullable expiry, and audit metadata.
- Store the allowed organisations in a normalised relation, not in a client
  supplied payload. A creation-link/card relation records the exact card and
  child public link created from each first save.
- Store only a SHA-256 token hash, following the existing public-link model.
  Return the raw token only in the successful creation response; neither
  administration list endpoints nor audit events expose it.
- A creation link is reusable: every fresh open begins a distinct unpersisted
  draft. A creation link never creates an empty card during page open, close,
  refresh, or organisation selection.
- Public creation is authorised only by the raw creation-link token and its
  server-side organisation allowlist. It does not grant the recipient ordinary
  administrator permissions over any organisation.
- Child public edit links are indefinitely active by default. Closing the
  parent creation link prevents only new-card creation; child links retain
  access until an administrator closes each child link separately.
- Closing is a soft lifecycle action, records an audit event, and makes the
  creation URL return a safe closed receipt without template/card data.

## Administration and UI

- The card list exposes a compact menu with: `Создать карточку`, `Создать
  ссылку на создание карточки`, and `Список ссылок на создание`.
- The link-create form contains only the required configuration: template and
  allowed organisations. The expiry field is omitted because these links are
  indefinite by default.
- The link list shows state, template, allowed organisations, creation time,
  created-card count, each created card's continuation URL, and a dangerous
  `Закрыть ссылку` action with confirmation.
- The card base block shows the child continuation link as system metadata;
  it is not a hardcoded business form field and is excluded from print layout.
- Administrators with normal card-management access can update a card's
  organisation from the base block. The backend checks their ordinary
  organisation scope. This differs from the public creation allowlist.
- The public `Проверка заполнения` panel and `Отправить на проверку` action are
  removed. Existing lifecycle endpoints and historical submitted links remain
  readable and compatible; this change removes the public UI entry point only.

## Backend contracts

- New administrator endpoints create, list, read, and close creation links.
- New public endpoints read a safe creation-link preview and perform the
  atomic first field save/create operation. All raw-token errors use safe,
  Russian browser messages and never reveal hidden organisations or tokens.
- The first-save endpoint validates: active/not expired creation link, template
  availability, selected organisation membership in the link allowlist, field
  availability/public editability, typed value, and normal template rules.
- Until the first save, public field access is resolved with the same defaults
  as a normal new card: fields are visible and editable by default, except
  protected types such as `file_ref` and `static_text`. The saved card then
  uses its normal per-card public-field settings.
- The operation writes creation, first field-value update, child-link creation,
  and close actions to the audit log.

## Non-goals

- Do not create fixed business fields or a generic unauthenticated card API.
- Do not broaden a public recipient's organisation or administrator rights.
- Do not close already-created card links when a creation link closes.
- Do not remove existing review history or change stored historical links.

## Verification

- Backend tests cover no-card-before-first-save, atomic create/save, rejected
  disallowed organisation, child-link continuity after parent close, close
  denial, audit events, and ordinary administrator organisation updates.
- Frontend tests cover the menu, link form/list, multi-organisation choice,
  URL handoff after first save, and absence of the public submit panel.
- Disposable PostgreSQL migration proof precedes any production migration.
- Live Browser proof creates a disposable card only after one field value is
  entered, verifies the continuation URL, closes the parent link, confirms new
  creation is denied, and confirms the child link remains usable.
