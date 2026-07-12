# Card creation tabs and organisation-triggered drafts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for inline implementation. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move card/link creation workflows into the existing card tab strip and create a public draft immediately after explicit organisation selection.

**Architecture:** Extend the existing creation-link aggregate with a no-field-value draft operation that reuses the current card/child-link transaction and response. Extend the `CardsWorkspace` tab union with closeable utility tabs so list, form, and link list are mutually exclusive workspace surfaces.

**Tech Stack:** FastAPI, SQLAlchemy, Pydantic, React, TypeScript, TanStack Query, Pytest, Vitest.

## Global Constraints

- Keep all cards schema-driven and enforce public organisation allowlists in backend services.
- Keep raw tokens out of audits, logs, and persistent browser storage.
- Use Russian-first labels and preserve existing normal public-child autosave behavior.
- Do not migrate schema: `card_creation_links`, `cards`, and `card_public_links` already support this behavior.

### Task 1: Public organisation selection creates the draft

**Files:**
- Modify: `backend/app/services/card_creation_links.py`
- Modify: `backend/app/schemas/card_creation_links.py`
- Modify: `backend/app/api/v1/endpoints/card_creation_links.py`
- Modify: `backend/tests/test_card_creation_links.py`

- [x] Write a failing service/API test that calls `create_draft_from_public_link(raw_token, organization_id)` and expects one draft card, one child link with `expires_at is None`, and no field values.
- [x] Run `pytest tests/test_card_creation_links.py -q` against disposable PostgreSQL and confirm the test fails because the method/route is missing.
- [x] Add the service method and `POST /public/card-creation-links/create-draft`; reuse the existing transaction, token encryption, child-link construction, relation, and audits without field coercion.
- [x] Re-run the focused backend test and confirm it passes, including rejection of a disallowed organisation and parent-close/child-continuity behavior.

### Task 2: Public page creates only on organisation selection

**Files:**
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/pages/PublicCardCreationPage.tsx`
- Modify: `frontend/src/pages/PublicCardCreationPage.test.tsx`

- [x] Write a failing page test that selects an organisation, expects a single `create-draft` request before typing, and verifies navigation to `/public/edit/:childRawToken`.
- [x] Run the focused Vitest file and confirm the test fails because selection only refreshes preview.
- [x] Add the typed client mutation and change the selector event to perform the mutation; keep fields hidden while it is pending and render a Russian progress/error state.
- [x] Re-run the focused page tests and confirm no `first-save` request is made from the parent page.

### Task 3: Utility workflows are workspace tabs

**Files:**
- Modify: `frontend/src/features/cards/CardsWorkspace.tsx`
- Modify: `frontend/src/features/cards/CardsWorkspace.test.tsx` or the existing focused workspace test file
- Modify: `frontend/src/styles/globals.css`

- [x] Write a failing workspace test that opens `Создать карточку`, `Создать ссылку`, and `Список ссылок` from the menu and expects each to appear in the card tab strip while the list panel remains free of forms.
- [x] Run the focused workspace test and confirm it fails because `cardFormMode` and `cardCreationLinkPanelMode` append panels below the list.
- [x] Extend `CardShellTab` and its persisted state with closeable utility tabs; render the matching form/panel only when that utility tab is active; closing returns to the list tab.
- [x] Re-run the workspace tests, TypeScript, scoped Prettier, and production build. The repository-wide ESLint gate remains blocked only by the existing unrelated `FilledCardLayout.tsx` hook-dependency warning.

### Task 4: Release evidence

- [x] Update `PLANS.md` with the final behavior and fresh verification output.
- [x] Run the disposable PostgreSQL backend suite, then `scripts/deploy.ps1`, `scripts/deploy-frontend.ps1`, `scripts/server-check.ps1`, and focused Browser proof.

## Verification record

- Local frontend: focused Vitest files pass (3 tests); TypeScript, scoped ESLint,
  Prettier, and production build pass.
- Server disposable PostgreSQL: `tests/test_card_creation_links.py`,
  `tests/test_migrations.py`, and `tests/test_card_public_access.py` pass (18
  tests).
- Deployment: `scripts/deploy.ps1`, `scripts/deploy-frontend.ps1`, and
  `scripts/server-check.ps1` pass. The live OpenAPI contract contains the new
  `POST /api/v1/public/card-creation-links/create-draft` route.
- Browser: the three utility views open as individual closeable tabs in
  `Вкладки карточек`; no form or link panel is rendered below tag search.
- A broader historical review-link suite has four stale fixture expectations
  after intentional public-access defaults from `e8018ade`; no review-link code
  changed in this plan.
