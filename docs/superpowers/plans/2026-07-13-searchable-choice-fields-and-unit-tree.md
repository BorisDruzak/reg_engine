# Searchable choice fields and unit-tree Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) task-by-task.

**Goal:** Make all controlled card choices searchable and polish the internal organization unit tree.

**Architecture:** Build one reusable popup choice component used by select, multi-select, reference, and unit field controls. Keep option authority on existing API/preview payloads. Simplify only unit-tree interactions and actions.

**Tech Stack:** React, TypeScript, Vitest.

## Global Constraints

- No free-text values for controlled fields; options are server supplied.
- Single choice closes on selection; multi choice stays open and renders chips.
- Archive, API, RBAC, and organization/unit hierarchy backend rules are unchanged.
- Unit technical codes are hidden; clicking management row toggles it, while controls do not.

## Task 1: Unit tree actions and interaction

**Files:** `frontend/src/features/organizations/OrganizationUnitsPanel.tsx`, `OrganizationsTable.test.tsx`, `frontend/src/styles/globals.css`.

- [ ] Add failing tests for standalone `Добавить отдел`, management-row click collapse/expand, hidden unit code, and edit/archive propagation isolation.
- [ ] Run focused organization test to observe RED.
- [ ] Add standalone department toolbar action, make management row keyboard/click toggle, remove separate expand button and code rendering, preserve contextual department add.
- [ ] Run focused tests/typecheck; commit `feat: simplify organization unit actions`.

## Task 2: Reusable searchable controlled choice picker

**Files:** create `frontend/src/features/cards/SearchableChoicePicker.tsx`; modify `FieldEditorControl.tsx`, `CardsWorkspace.test.tsx`, `PublicLinkEditPage.test.tsx`, `globals.css`.

- [ ] Add failing tests for searching plain/reference choices, no-result copy, native single selection, multi-choice checkbox/chips, and disabled archived unit choice in admin/public views.
- [ ] Run focused card/public tests to observe RED.
- [ ] Replace controlled select surfaces with `SearchableChoicePicker`; keep boolean/date/text controls unchanged. It accepts `{id,label,archived?}[]`, mode, value(s), and `onChange`; no text input is written as a field value.
- [ ] Run focused tests/typecheck/lint; commit `feat: search all controlled card choices`.

## Task 3: Consolidate and release

- [ ] Run focused tests, project type/lint/project-map/diff checks.
- [ ] Update `PLANS.md`, commit documentation, push `main`, deploy through scripts, and verify browser interactions with disposable data and zero console errors.

## Plan self-review

Tasks 1–2 cover every approved behavior. Task 3 supplies release evidence. No backend change is required.
