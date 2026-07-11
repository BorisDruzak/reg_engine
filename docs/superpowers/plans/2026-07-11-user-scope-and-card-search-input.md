# User Scope Visibility And Card Search Input Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show inherited organization coverage accurately, identify users by
login, and use one card-search input for tag discovery and scalar filter entry.

**Architecture:** The existing user profile continues to submit only selected
organization roots; the frontend derives and renders inherited descendants
without changing grants or authorization. `CardTagSearchBar` gains a local
pending-input mode that reuses its primary input for scalar values, while the
already applied text and field filter payloads continue to drive existing card
list API requests.

**Tech Stack:** React 19, TypeScript, TanStack Query, Vitest, Testing Library,
Vite, CSS, in-app Browser verification.

## Global Constraints

- Keep backend access control and `include_descendants=true` enforcement
  unchanged; frontend scope state is an explanatory UX projection only.
- Persist only intentionally selected organization roots; do not create a
  database migration or rewrite existing grants.
- Keep card list filters on the existing backend API parameters; do not add a
  client-side filtering path.
- Use Russian-first labels and accessible controls.
- Work on `main` with focused commits; do not create a branch or worktree.
- Do not modify public-card, role, permission, attachment, or schema behavior.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `frontend/src/features/users/UsersAndRoles.tsx` | Derives inherited scope coverage, keeps root-only selection, and renders login as the table identity. |
| `frontend/src/features/users/UsersAndRoles.test.tsx` | Proves inherited checkbox state and login-driven inline profile opening. |
| `frontend/src/app/uiText.ts` | Supplies the Russian `Логин` and card text-search choice labels. |
| `frontend/src/features/cards/CardTagSearchBar.tsx` | Owns tag discovery, pending scalar input mode, and existing filter application. |
| `frontend/src/App.test.tsx` | Proves search-bar behavior through the full card workspace and API request mocks. |
| `frontend/src/styles/globals.css` | Styles inherited organization descriptions and the visible pending-search prefix. |
| `PLANS.md` | Records verification, release, and Browser evidence. |

### Task 1: Make organization inheritance visible and identify user rows by login

**Files:**
- Modify: `frontend/src/features/users/UsersAndRoles.tsx:153-242,435-490`
- Modify: `frontend/src/features/users/UsersAndRoles.test.tsx:8-63`
- Modify: `frontend/src/app/uiText.ts:146-152`
- Modify: `frontend/src/styles/globals.css:4685-4712`

**Interfaces:**
- Consumes: `OrganizationTreeNodeRead[]`, `UserRead.organization_ids`, and the
  existing `UserUpdatePayload.organization_ids` root list.
- Produces: `OrganizationScopeSelection` render state with direct and
  inherited selections; a table column headed `Логин` whose button name is
  `user.email`.

- [ ] **Step 1: Write the failing user-workspace test.**

  Extend `UsersAndRoles.test.tsx` with this behavior after rendering a root
  organization with one child and a subordinate user whose
  `organization_ids` contains only the root:

  ```tsx
  await user.click(screen.getByRole("button", { name: "branch@example.test" }));

  expect(screen.getByRole("columnheader", { name: "Логин" })).toBeInTheDocument();
  expect(screen.getByLabelText("Администрация района")).toBeChecked();

  const childScope = screen.getByLabelText("Подведомственная организация");
  expect(childScope).toBeChecked();
  expect(childScope).toBeDisabled();
  expect(screen.getByText("Входит через Администрация района")).toBeInTheDocument();
  ```

- [ ] **Step 2: Run the focused test and confirm it fails because the child is not selected and the row is named by display name.**

  Run:

  ```powershell
  pnpm -C frontend test:run src/features/users/UsersAndRoles.test.tsx
  ```

  Expected: one assertion reports that the descendant checkbox is unchecked or
  enabled, and the login-named row cannot be found.

- [ ] **Step 3: Implement derived scope selection and login display.**

  In `UsersAndRoles.tsx`, add a pure helper that walks the organization tree,
  marks every descendant of a selected root as inherited, and records the
  closest selected ancestor name. Its result must distinguish direct from
  inherited selection:

  ```tsx
  type OrganizationScopeSelection = {
    directIds: ReadonlySet<string>;
    inheritedById: ReadonlyMap<string, string>;
  };

  function organizationScopeSelection(
    nodes: OrganizationTreeNodeRead[],
    selectedIds: string[],
  ): OrganizationScopeSelection {
  const directIds = new Set(selectedIds);
  const inheritedById = new Map<string, string>();
  const visit = (items: OrganizationTreeNodeRead[], inheritedFrom: string | null) => {
    items.forEach((node) => {
      const isCoveredByAncestor = inheritedFrom !== null;
      const selectedHere = directIds.has(node.id) && !isCoveredByAncestor;
      const activeAncestor = selectedHere ? node.name : inheritedFrom;
      if (isCoveredByAncestor) inheritedById.set(node.id, inheritedFrom);
      visit(node.children, activeAncestor);
    });
  };
    visit(nodes, null);
    return { directIds, inheritedById };
  }
  ```

  Pass this state through the recursive selector. Render inherited entries as
  checked disabled checkboxes with the visible explanatory text. When selecting
  a direct root, remove every descendant from the submitted root list before
  adding the root; when clearing a root, remove only that root. Change the
  table header to `uiText.login`, render `user.email` in the selection button,
  and add `login: "Логин"` to `uiText`.

- [ ] **Step 4: Re-run the focused test and type checks.**

  Run:

  ```powershell
  pnpm -C frontend test:run src/features/users/UsersAndRoles.test.tsx
  pnpm -C frontend typecheck
  pnpm -C frontend exec prettier --check src/features/users/UsersAndRoles.tsx src/features/users/UsersAndRoles.test.tsx src/app/uiText.ts src/styles/globals.css
  ```

  Expected: the test passes; TypeScript and scoped Prettier return exit code
  zero.

- [ ] **Step 5: Commit the user-scope UX slice.**

  ```powershell
  git add frontend/src/features/users/UsersAndRoles.tsx frontend/src/features/users/UsersAndRoles.test.tsx frontend/src/app/uiText.ts frontend/src/styles/globals.css
  git commit -m "Show inherited user organization scopes"
  ```

### Task 2: Reuse the main card-search input for tags and scalar values

**Files:**
- Modify: `frontend/src/features/cards/CardTagSearchBar.tsx:24-260,540-610`
- Modify: `frontend/src/App.test.tsx:4980-5139,5260-5305`
- Modify: `frontend/src/app/uiText.ts:85-94`
- Modify: `frontend/src/styles/globals.css:3461-3640`

**Interfaces:**
- Consumes: the current `searchInput`, `CardFieldFilterPayload`, field types,
  `onTextQueryChange`, and `onFieldFiltersChange` callbacks.
- Produces: `SearchDraft` state of either `text` or a scalar field id, plus
  unchanged applied search chips and unchanged API payloads.

- [ ] **Step 1: Write failing full-workspace tests for discovery and main-input scalar entry.**

  Replace the existing assertion that types directly into the search input to
  create a text chip. Add these assertions in `App.test.tsx`:

  ```tsx
  const searchInput = within(searchBar).getByLabelText("Поиск карточек");
  await user.type(searchInput, "Статус");
  expect(within(tagMenu).getByRole("button", { name: "Статус" })).toBeInTheDocument();
  expect(screen.queryByText("Текст: Статус")).not.toBeInTheDocument();

  await user.click(within(tagMenu).getByRole("button", { name: "Статус" }));
  const valueInput = within(searchBar).getByLabelText("Значение фильтра Статус");
  expect(within(searchBar).getByText("Статус:")).toBeInTheDocument();
  expect(screen.queryByLabelText("Значение фильтра Статус", { selector: ".search-inline-value-form input" })).not.toBeInTheDocument();

  await user.type(valueInput, "drafted{enter}");
  expect(within(searchBar).getByText("Статус: drafted")).toBeInTheDocument();
  ```

  Add a text-search test that chooses `Текст карточки`, enters `Архивная` in
  the same main input, presses Enter, and observes the existing `Текст:
  Архивная` chip and its `q` request.

- [ ] **Step 2: Run the focused tests and confirm they fail because the current component creates a text query immediately and renders a second inline form.**

  Run:

  ```powershell
  pnpm -C frontend test:run src/App.test.tsx -t "dynamic field filters|filters cards by search organization"
  ```

  Expected: the new discovery assertion observes a text chip or request too
  early, and the main search row does not contain the scalar draft input.

- [ ] **Step 3: Add explicit draft modes and filter tag choices locally.**

  In `CardTagSearchBar.tsx`, replace the implicit Enter behavior with a narrow
  draft union:

  ```tsx
  type SearchDraft =
    | { type: "text" }
    | { type: "field"; fieldId: string }
    | null;

  const [searchDraft, setSearchDraft] = useState<SearchDraft>(null);
  const draftField =
    searchDraft?.type === "field" ? fieldById.get(searchDraft.fieldId) ?? null : null;

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = searchInput.trim();
    if (!value || !searchDraft) return;
    if (searchDraft.type === "text") onTextQueryChange(value);
    if (draftField) {
      const filter = buildFieldFilterPayload(draftField, value);
      if (filter) applyFieldFilter(draftField, filter);
    }
    setSearchInput("");
    setSearchDraft(null);
    setActiveMenuItem(null);
  }
  ```

  Add `Текст карточки` as an explicit basic tag choice. Selecting that choice
  or a scalar field clears discovery text, sets `searchDraft`, focuses the
  primary input, and renders its visible prefix in `.search-draft-prefix`.
  In discovery mode, use a normalized `searchInput` to narrow template,
  organization, and field menu choices by their Russian labels; never call
  `onTextQueryChange` in that mode. Remove the scalar branch of
  `FieldInlineFilterControls`, leaving its boolean and reference-list controls
  intact. Escape clears `searchDraft` and its text before the existing popover
  close handler runs.

- [ ] **Step 4: Run focused and broad frontend verification.**

  Run:

  ```powershell
  pnpm -C frontend test:run src/App.test.tsx -t "dynamic field filters|reference field filters|filters cards by search organization"
  pnpm -C frontend test:run
  pnpm -C frontend typecheck
  pnpm -C frontend lint
  pnpm -C frontend exec prettier --check src/features/cards/CardTagSearchBar.tsx src/App.test.tsx src/app/uiText.ts src/styles/globals.css
  pnpm -C frontend build
  ```

  Expected: applied text, field, template, organization, boolean, date, and
  reference filters keep their prior request behavior; no second scalar value
  input remains.

- [ ] **Step 5: Commit the unified search-input UX slice.**

  ```powershell
  git add frontend/src/features/cards/CardTagSearchBar.tsx frontend/src/App.test.tsx frontend/src/app/uiText.ts frontend/src/styles/globals.css
  git commit -m "Use one input for card search tags"
  ```

### Task 3: Run release gates, deploy the frontend, and record evidence

**Files:**
- Modify: `PLANS.md`
- Verify: `scripts/check.ps1`, `scripts/deploy.ps1`,
  `scripts/deploy-frontend.ps1`, and the in-app Browser

**Interfaces:**
- Consumes: the focused commits from Tasks 1 and 2.
- Produces: a deployed frontend bundle and a durable record of local, server,
  and visible-browser verification.

- [ ] **Step 1: Run the local project gate.**

  ```powershell
  powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote
  ```

  Expected: targeted frontend behavior, lint, TypeScript, production build,
  backend checks, and project-map checks pass. Any existing unrelated warning
  is recorded without being hidden or changed.

- [ ] **Step 2: Commit and push the verified implementation.**

  ```powershell
  git add PLANS.md
  git commit -m "Record scope and card search checks"
  powershell -ExecutionPolicy Bypass -File scripts/push-git.ps1 -Message "Publish scope and card search input UX"
  ```

  Expected: local `main` and `origin/main` reference the verified commit.

- [ ] **Step 3: Deploy and run server checks.**

  ```powershell
  powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1
  powershell -ExecutionPolicy Bypass -File scripts/deploy-frontend.ps1
  powershell -ExecutionPolicy Bypass -File scripts/server-check.ps1
  ```

  Expected: server checkout follows `origin/main`, API health passes, and the
  same-origin frontend bundle is published. No migration runs.

- [ ] **Step 4: Perform live Browser verification.**

  Verify at a desktop viewport and one narrow mobile viewport:

  1. Selecting `Школа 1` shows `Садик 1` checked, disabled, and explained as
     inherited coverage.
  2. The first users-table header is `Логин`; its email value opens the inline
     profile.
  3. Typing with no pending tag narrows tag choices without applying a card
     text filter.
  4. Choosing a scalar field shows its prefix in the main row; Enter creates a
     field chip, with no separate value form.
  5. Choosing `Текст карточки` produces the existing text chip only after
     Enter.
  6. Check page identity, targeted interaction, no framework overlay, no
     console errors or warnings, and no horizontal overflow.

- [ ] **Step 5: Update release evidence and commit it.**

  Record the commands, published asset names, Browser observations, and any
  retained unrelated warning in `PLANS.md`, then run:

  ```powershell
  git add PLANS.md
  git commit -m "Record scope and card search release evidence"
  powershell -ExecutionPolicy Bypass -File scripts/push-git.ps1 -Message "Record scope and card search release evidence"
  ```

## Plan Self-Review

- Spec coverage: Task 1 covers inherited organization presentation, root-only
  storage, and login identity. Task 2 covers tag discovery, single-input
  scalar entry, explicit full-text search, and compatibility for structured
  filters. Task 3 covers local checks, deployment, and visible proof.
- Scope boundary: no backend route, data migration, role, permission, public
  link, template, or reference behavior changes are included.
- Placeholder scan: every task lists exact files, named functions or state,
  tests, commands, expected results, and commit scopes.
- Type consistency: `OrganizationScopeSelection`, `SearchDraft`,
  `CardFieldFilterPayload`, `organizationIds`, and `user.email` match their
  planned use across implementation and tests.
