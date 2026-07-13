# Organization cards and unit picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans task-by-task.

**Goal:** Open organizations as inline cards and make organization-unit fields searchable hierarchical choices.

**Architecture:** Keep existing backend contracts. `OrganizationsTable` owns expandable row cards and inline name edit; `OrganizationUnitsPanel` owns the internal expanded unit tree; a reusable picker renders existing safe option lists in both card editors.

**Tech Stack:** React, TypeScript, TanStack Query, Vitest.

## Global Constraints

- Organization and unit trees remain separate; no new DB tables, unit types, or RBAC scopes.
- No technical codes in the organization tree. Archive remains soft-only, confirmed, and backend-authorized.
- Row click toggles its inline card; name click enters edit and stops row toggling.
- The inline card owns adding department, management, and child organization; an expanded management owns adding its department.
- Pickers receive only card-scoped API/public-preview options; archived choices remain visible but disabled.

## Task 1: Inline organization cards

**Files:** `frontend/src/features/organizations/OrganizationsTable.tsx`, `OrganizationsTable.test.tsx`, `frontend/src/styles/globals.css`.

- [ ] Write failing tests: clicking a row opens exactly its inline card; clicking its name shows only `Сохранить`, `Отмена`, and `В архив`; no technical code or row action buttons exist; adding a child uses the selected parent.
- [ ] Run `pnpm -C frontend test:run src/features/organizations/OrganizationsTable.test.tsx` and record RED.
- [ ] Implement selected-row state, event propagation isolation, inline name form, archive confirmation, and contextual add-child action.
- [ ] Run focused Vitest, typecheck, and changed-file Prettier; commit `feat: open organization cards inline`.

## Task 2: Expandable internal unit tree

**Files:** `frontend/src/features/organizations/OrganizationUnitsPanel.tsx`, `OrganizationsTable.test.tsx`, `frontend/src/styles/globals.css`.

- [ ] Write failing tests: a management expands to its departments; root departments remain separate; contextual `Добавить отдел` submits `{ parent_id: management.id, unit_type: "department" }`.
- [ ] Run the focused test for RED.
- [ ] Add management expansion state and contextual add button, retaining backend validation and archive behavior.
- [ ] Run focused test/typecheck; commit `feat: expand organization unit hierarchy`.

## Task 3: Searchable hierarchy-aware unit picker

**Files:** create `frontend/src/features/cards/OrganizationUnitPicker.tsx`; modify `FieldEditorControl.tsx`, `CardsWorkspace.test.tsx`, `PublicLinkEditPage.test.tsx`, and `globals.css`.

- [ ] Write failing admin/public tests for filtered management/department results, selecting either level, and disabled archived history.
- [ ] Run `pnpm -C frontend test:run src/features/cards/CardsWorkspace.test.tsx src/pages/PublicLinkEditPage.test.tsx` for RED.
- [ ] Dispatch `org_unit_ref` from `FieldEditorControl` to the picker. Group existing `Управление → Отдел` labels, filter by management or leaf name, and keep IDs/options server-owned.
- [ ] Run focused Vitest/typecheck/lint; commit `feat: search organization unit card fields`.

## Task 4: Release and browser acceptance

- [ ] Run all changed-surface tests, `scripts/typecheck.ps1`, `scripts/lint.ps1`, project-map, and diff check.
- [ ] Update `PLANS.md`, commit docs, push `main`, deploy through project scripts, and run server checks.
- [ ] In Browser, verify row/card toggles, name Save/Cancel, three card actions, management expansion/contextual department action, hierarchy-aware picker search, disabled archived option, and zero console errors using disposable data only.

## Plan self-review

Tasks 1–2 cover every organization-card interaction; Task 3 covers both card editors; Task 4 covers evidence, deployment, and live acceptance. No backend contract is changed.
