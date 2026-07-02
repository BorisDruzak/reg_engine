# Card Unified Tag Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the separate card text search and organization filter with one Russian-first tag search bar that also supports schema-driven field filters.

**Architecture:** Keep backend RBAC and list endpoints as the filtering boundary. Extend the existing card list API with a typed `filters` query parameter for dynamic field values while preserving `q`, `organization_ids`, and archive flags for compatibility.

**Tech Stack:** FastAPI, SQLAlchemy, React, TanStack Query, Vitest, Playwright.

---

### Task 1: Backend Dynamic Field Filters

**Files:**
- Modify: `backend/app/api/v1/endpoints/cards.py`
- Modify: `backend/app/services/cards.py`
- Test: `backend/tests/test_api_phase_1g.py`

- [ ] Add a failing API regression test that creates schema fields, writes values, and proves `q` searches text field values.
- [ ] Add a failing API regression test that sends JSON `filters` and proves specific field filters narrow the card list.
- [ ] Add a small parser for the `filters` query parameter in the card endpoints.
- [ ] Add service-layer `CardFieldFilterInput` handling with SQL `exists` predicates over `field_values` and `field_value_items`.
- [ ] Preserve existing organization scope, archive filtering, and registry/default-registry list behavior.

### Task 2: Frontend API Contract

**Files:**
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/api/types.ts`
- Test: `frontend/src/App.test.tsx`

- [ ] Add frontend types for card field filter payloads.
- [ ] Serialize filters as one JSON query parameter on both registry and organization card list calls.
- [ ] Extend the existing fetch mock to parse `filters` and filter test cards by dynamic value state.

### Task 3: Unified Tag Search UI

**Files:**
- Create: `frontend/src/features/cards/CardTagSearchBar.tsx`
- Modify: `frontend/src/features/cards/CardsWorkspace.tsx`
- Modify: `frontend/src/pages/HomePage.tsx`
- Modify: `frontend/src/app/uiText.ts`
- Test: `frontend/src/App.test.tsx`

- [ ] Add a failing UI test that no longer expects a separate organization filter next to the search input.
- [ ] Add a failing UI test that creates a free-text tag, an organization tag, and a field tag from the same search bar.
- [ ] Implement chips for text, organizations, and supported active schema fields.
- [ ] Support text, bool, select, and multi-select field tag controls in the first UI slice.
- [ ] Keep unsupported field types hidden or disabled from the add-filter menu until a dedicated UX is approved.

### Task 4: Documentation And Verification

**Files:**
- Modify: `PLANS.md`
- Modify: `docs/PROJECT_TREE.md`

- [ ] Record Phase 7E scope, non-goals, known limitations, and verification.
- [ ] Regenerate/check the project map.
- [ ] Run backend pytest, ruff, format check, mypy, frontend tests, lint, typecheck, build, e2e, and `scripts/check.ps1 -SkipRemote`.
- [ ] Push `main`, deploy to the server, deploy frontend, and run a browser smoke check on the deployed UI.
