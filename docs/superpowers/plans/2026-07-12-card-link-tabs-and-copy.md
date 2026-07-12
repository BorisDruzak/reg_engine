# Card link tabs and copy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the overlapping card-creation dropdown with persistent utility tabs and make public URLs copyable by one click.

**Architecture:** `CardsWorkspace` keeps `list` and card-detail tabs plus three fixed utility tabs. A small shared frontend helper copies a URL and returns a Russian success message; it is used by the creation-link list and public edit title.

**Tech Stack:** React, TypeScript, TanStack Query, Vitest, Testing Library, CSS.

## Global Constraints

- Keep public-link tokens in the existing URL-only client flow; no backend or schema change.
- Use Russian-first labels and keyboard-accessible controls.
- Do not render a creation menu over the card-list search surface.

### Task 1: Render fixed utility tabs

**Files:**
- Modify: `frontend/src/features/cards/CardsWorkspace.tsx`
- Modify: `frontend/src/features/cards/CardsWorkspace.test.tsx`

- [ ] Write a failing test that expects `Создать карточку`, `Создать ссылку`, and `Список ссылок` in the tablist before any action and no `Создать карточку` menu trigger in the card-list panel.
- [ ] Run `npx vitest run src/features/cards/CardsWorkspace.test.tsx --reporter=dot` and confirm failure because the tabs are opened only from the dropdown.
- [ ] Remove `cardCreateMenuOpen`; append the three utility tab definitions directly after the list tab; make clicking a utility tab select its surface without rendering a close control.
- [ ] Re-run the workspace test and confirm it passes.

### Task 2: Copy creation and public-edit URLs

**Files:**
- Modify: `frontend/src/features/cards/CardCreationLinksPanel.tsx`
- Modify: `frontend/src/features/cards/CardCreationLinksPanel.test.tsx`
- Modify: `frontend/src/pages/PublicLinkEditPage.tsx`
- Modify: `frontend/src/pages/PublicLinkEditPage.test.tsx`
- Modify: `frontend/src/styles/globals.css`

- [ ] Write failing tests: clicking the labelled creation URL calls `navigator.clipboard.writeText` and shows `Ссылка скопирована`; the public title renders `Копировать ссылку` and copies `window.location.href`.
- [ ] Run the two focused Vitest files and confirm each fails because the URL is read-only text and the public title has no copy action.
- [ ] Implement click-to-copy with selection, Russian success/error feedback, and a public-title copy button.
- [ ] Re-run focused tests, TypeScript, scoped ESLint, Prettier, and production build.

### Task 3: Release proof

- [ ] Update `PLANS.md` with the final behavior and verification output.
- [ ] Commit, push `main`, deploy the frontend, run server checks, and verify in the Browser that fixed tabs do not overlap search and links copy with visible feedback.
