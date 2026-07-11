# Card Layout Interaction and Hover Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for inline execution. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove unavailable block-order controls, open the correct filled-card block editor on block click, and replace the navigation toggle with smooth desktop hover expansion.

**Architecture:** Keep layout ordering in the existing canvas/node chain, adding only conditional rendering. Thread a typed block-activation callback through the shared card renderer so the filled-card surface reuses its existing editor lifecycle. Keep persisted navigation collapse separate from an in-memory hover-preview class controlled by `HomePage`.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, Vite, existing Registry Engine REST API, PowerShell release scripts.

## Global Constraints

- User-facing UI copy remains Russian-first.
- No backend schema, database migration, permission, API, or persistence-contract change.
- The `Изменить блок` button remains available as the keyboard-accessible editor action.
- Hover expansion is desktop-only, temporary, and never writes `isSidebarCollapsed`.
- Work stays on `main`; do not create a feature branch or worktree.

---

## File Structure

- Modify `frontend/src/features/cardLayout/CardBlockLayoutNode.tsx`: omit unavailable ordering buttons and expose safe block-body activation.
- Modify `frontend/src/features/cards/FilledCardLayout.tsx`: reuse one per-instance block-open function for the button and block-body clicks.
- Modify `frontend/src/features/cardLayout/CardLayoutRenderer.test.tsx`: cover absent boundary arrows and busy ordering state.
- Modify `frontend/src/features/cards/FilledCardLayout.test.tsx`: cover primary/repeatable block-body editor activation and dirty switching.
- Modify `frontend/src/pages/HomePage.tsx`: remove the toggle and maintain transient hover-preview state.
- Modify `frontend/src/styles/globals.css`: animate and constrain the temporary desktop sidebar expansion.
- Modify `frontend/src/App.test.tsx`: cover no toggle and pointer entry/exit preview state.
- Modify `PLANS.md` and regenerate `docs/PROJECT_TREE.md`: record the verified release checkpoint.

---

### Task 1: Conditional block-order controls

**Files:**
- Modify: `frontend/src/features/cardLayout/CardBlockLayoutNode.tsx:154-186`
- Test: `frontend/src/features/cardLayout/CardLayoutRenderer.test.tsx:375-432`

**Interfaces:**
- Preserves: `onMoveBlock(sectionId, direction)`, `canMoveBlockUp`, `canMoveBlockDown`, and `blockOrderingDisabled`.
- Produces: order buttons only for directions that exist in the current ordered section list.

- [ ] **Step 1: Write the failing boundary-control test**

Change the existing two-block test so the first block has only its down button
and the last block has only its up button:

```tsx
expect(screen.queryByRole("button", { name: "Переместить блок ФИО вверх" })).not.toBeInTheDocument();
expect(screen.getByRole("button", { name: "Переместить блок ФИО вниз" })).toBeEnabled();
expect(screen.getByRole("button", { name: "Переместить блок Работа вверх" })).toBeEnabled();
expect(screen.queryByRole("button", { name: "Переместить блок Работа вниз" })).not.toBeInTheDocument();
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
pnpm -C frontend test:run -- src/features/cardLayout/CardLayoutRenderer.test.tsx
```

Expected: FAIL because the first up and last down buttons are still rendered.

- [ ] **Step 3: Render only available order directions**

Wrap each existing order button independently:

```tsx
{canMoveBlockUp ? <button /* existing up props */>↑</button> : null}
{canMoveBlockDown ? <button /* existing down props */>↓</button> : null}
```

Keep `disabled={blockOrderingDisabled}` on every rendered button; do not
disable a boundary button because it no longer exists.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the command from Step 2. Expected: the renderer suite passes, including
the existing busy-state coverage adapted to count only available controls.

### Task 2: Activate the exact filled-card block by clicking its body

**Files:**
- Modify: `frontend/src/features/cardLayout/CardBlockLayoutNode.tsx:25-105`
- Modify: `frontend/src/features/cards/FilledCardLayout.tsx:95-310`
- Test: `frontend/src/features/cards/FilledCardLayout.test.tsx:560-690, 960-1045`

**Interfaces:**
- Produces: `onActivateBlock?: (block, section) => void` through the shared canvas/renderer props.
- Preserves: `onEditBlock(blockId, blockInstanceId)` and `blockEditor.open(blockId, blockInstanceId, values)`.

- [ ] **Step 1: Write failing primary and repeatable body-click tests**

Add a primary-block assertion that does not use `Изменить блок`:

```tsx
await user.click(screen.getByTestId("filled-block-fio"));
expect(screen.getByLabelText("Имя")).toHaveValue("Иван");
```

Add a repeatable assertion that clicks the second instance block node and
expects the second instance's value in the editor.

- [ ] **Step 2: Run the tests and verify RED**

Run:

```powershell
pnpm -C frontend test:run -- src/features/cards/FilledCardLayout.test.tsx
```

Expected: FAIL because a block-body click currently leaves a read-only block
unchanged.

- [ ] **Step 3: Add safe shared block activation**

Add `onActivateBlock` to `CardBlockLayoutNodeProps`. For non-interactive
pointer targets inside an activatable block, call it with the block and
section. Add an activation marker class only to blocks that receive the
callback. Treat `button`, `a`, `input`, `select`, `textarea`, and elements
with a button-like role as interactive targets.

In `FilledCardLayout`, create one local `openBlockEditor(block, section)`
function per rendered surface. It verifies editable fields, resolves the
surface's `blockInstanceId`, creates `sectionValues`, calls `onEditBlock`, and
calls `blockEditor.open`. Supply it both as `onActivateBlock` and from the
existing `Изменить блок` button. Update the dirty-click guard to recognize a
safe activatable block target as a block switch.

- [ ] **Step 4: Run the tests and verify GREEN**

Run the command from Step 2. Expected: primary and repeatable clicks select
only their own block instance; the existing save/cancel and dirty-draft tests
remain green.

### Task 3: Toggle-free temporary navigation hover expansion

**Files:**
- Modify: `frontend/src/pages/HomePage.tsx:53-231, 316-360`
- Modify: `frontend/src/styles/globals.css:177-266, 4404-4435`
- Test: `frontend/src/App.test.tsx:2944-2985`

**Interfaces:**
- Produces: local `sidebarHoverPreview` state and the `is-sidebar-hover-preview` shell class.
- Preserves: persisted `isSidebarCollapsed` and registry-only automatic collapse.

- [ ] **Step 1: Write the failing hover-navigation test**

Replace toggle expectations with:

```tsx
expect(screen.queryByRole("button", { name: /навигацию/i })).not.toBeInTheDocument();
const sidebar = screen.getByLabelText("Основная навигация");
fireEvent.pointerEnter(sidebar);
expect(container.querySelector(".workspace-shell")).toHaveClass("is-sidebar-hover-preview");
fireEvent.pointerLeave(sidebar);
expect(container.querySelector(".workspace-shell")).not.toHaveClass("is-sidebar-hover-preview");
```

Also assert the shell remains `is-sidebar-collapsed` throughout the preview.

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
pnpm -C frontend test:run -- src/App.test.tsx
```

Expected: FAIL because the toggle exists and no hover-preview class is set.

- [ ] **Step 3: Remove the toggle and add transient pointer handlers**

Remove `sidebarPinnedExpanded`, `handleSidebarToggle`, and the toggle button.
Add `sidebarHoverPreview`, `onPointerEnter`, `onPointerMove`, and
`onPointerLeave` handlers that set/clear the preview only when the persisted
state is collapsed. Include `is-sidebar-hover-preview` only while both states
are true. Leave navigation-item buttons and their Russian accessible labels
unchanged.

- [ ] **Step 4: Add desktop transition CSS**

Animate `grid-template-columns`, padding, opacity, and label transform. In
the collapsed base state, keep brand/nav text present but clipped and
transparent; in `.is-sidebar-hover-preview`, restore normal sidebar width,
padding, header alignment, text opacity, and nav alignment. Scope these rules
outside the existing mobile media query and retain its always-visible labels.

- [ ] **Step 5: Run test and typecheck to verify GREEN**

Run:

```powershell
pnpm -C frontend test:run -- src/App.test.tsx
pnpm -C frontend typecheck
```

Expected: app tests and TypeScript pass.

### Task 4: Gate, release, and live proof

**Files:**
- Modify: `PLANS.md`
- Regenerate: `docs/PROJECT_TREE.md`

- [ ] **Step 1: Run focused frontend verification**

```powershell
pnpm -C frontend test:run -- src/features/cardLayout/CardLayoutRenderer.test.tsx src/features/cards/FilledCardLayout.test.tsx src/App.test.tsx
pnpm -C frontend lint
pnpm -C frontend typecheck
```

- [ ] **Step 2: Regenerate the project map and full local gate**

```powershell
powershell -ExecutionPolicy Bypass -File scripts/project-map.ps1
powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote
```

- [ ] **Step 3: Update implementation evidence**

Append a checkpoint to `PLANS.md` with exact test counts, bundle names, no
migration statement, and the three user-visible behaviors.

- [ ] **Step 4: Commit, push, deploy, and live-verify**

```powershell
powershell -ExecutionPolicy Bypass -File scripts/push-git.ps1 -Message "Improve card layout interactions"
powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1
powershell -ExecutionPolicy Bypass -File scripts/deploy-frontend.ps1
```

Verify the deployed page with the Browser session: first/last block arrows,
body-click block editing, desktop hover enter/leave, a mobile viewport, and
zero relevant console errors.
