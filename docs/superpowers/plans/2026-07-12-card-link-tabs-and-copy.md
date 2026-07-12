# Card link tabs and copy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the overlapping card-creation dropdown with persistent utility tabs and make public URLs copyable by one click.

**Architecture:** `CardsWorkspace` keeps `list` and card-detail tabs plus three fixed utility tabs. A shared clipboard helper uses the native browser API when available and a temporary selected control on HTTP/restricted pages, then returns a Russian success message.

**Tech Stack:** React, TypeScript, TanStack Query, Vitest, Testing Library, CSS.

## Global Constraints

- Keep public-link tokens in the existing URL-only client flow; no backend or schema change.
- Use Russian-first labels and keyboard-accessible controls.
- Do not render a creation menu over the card-list search surface.

### Task 1: Render fixed utility tabs

**Files:**
- Modify: `frontend/src/features/cards/CardsWorkspace.tsx`
- Modify: `frontend/src/features/cards/CardsWorkspace.test.tsx`

- [x] Write a failing test that expects `Создать карточку`, `Создать ссылку`, and `Список ссылок` in the tablist before any action and no `Создать карточку` menu trigger in the card-list panel.
- [x] Run `npx vitest run src/features/cards/CardsWorkspace.test.tsx --reporter=dot` and confirm failure because the tabs are opened only from the dropdown.
- [x] Remove `cardCreateMenuOpen`; append the three utility tab definitions directly after the list tab; make clicking a utility tab select its surface without rendering a close control.
- [x] Re-run the workspace test and confirm it passes.

### Task 2: Copy creation and public-edit URLs

**Files:**
- Modify: `frontend/src/features/cards/CardCreationLinksPanel.tsx`
- Modify: `frontend/src/features/cards/CardCreationLinksPanel.test.tsx`
- Modify: `frontend/src/pages/PublicLinkEditPage.tsx`
- Modify: `frontend/src/pages/PublicLinkEditPage.test.tsx`
- Modify: `frontend/src/styles/globals.css`

- [x] Write failing tests: clicking the labelled creation URL calls `navigator.clipboard.writeText` and shows `Ссылка скопирована`; the public title renders `Копировать ссылку` and copies `window.location.href`.
- [x] Run the two focused Vitest files and confirm each fails because the URL is read-only text and the public title has no copy action.
- [x] Implement click-to-copy with selection, Russian success/error feedback, and a public-title copy button.
- [x] Re-run focused tests, TypeScript, scoped ESLint, Prettier, and production build.
- [x] Verify the HTTP browser flow: the native Clipboard API is unavailable there, so add and test the shared temporary-control fallback.

### Task 3: Release proof

- [x] Update `PLANS.md` with the final behavior and verification output.
- [x] Commit, push `main`, deploy the frontend, run server checks, and verify in the Browser that fixed tabs do not overlap search and links copy with visible feedback.

## Verification record

- `npx vitest run src/components/common/clipboard.test.ts src/features/cards/CardsWorkspace.test.tsx src/features/cards/CardCreationLinksPanel.test.tsx src/pages/PublicLinkEditPage.test.tsx --reporter=dot` — 25 passed.
- `npm run typecheck`, scoped ESLint, Prettier, and `npm run build` — passed.
- `scripts/deploy.ps1`, `scripts/deploy-frontend.ps1`, and `scripts/server-check.ps1` — passed against `main` at `0752a33b`.
- Browser — the three fixed tabs are each rendered once, no `Создать карточку` menu button remains, no console errors appeared, and the HTTP public page copied its current URL with visible `Ссылка скопирована` feedback.
