# Card Field Editor State Indicators Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show active, unsaved, saving, and saved visual states for the one card field being edited.

**Architecture:** `FilledCardLayout` derives an editor-state value from its existing `BlockEditorState` and returns it with the existing field completion presentation. `CardFieldLayoutNode` translates that presentation into a field-scoped CSS class, while `globals.css` defines the visual treatment. No backend request, persistence, or editor transition changes are introduced.

**Tech Stack:** React, TypeScript, Vitest, Testing Library, CSS.

## Global Constraints

- Keep card fields schema-driven and preserve backend-authoritative saves.
- Keep direct pointer-down field switching and outside-click save/close behavior unchanged.
- Do not introduce hardcoded business fields, new API calls, timers, or global state.
- Keep visible UI Russian-first; these changes add no user-facing copy.

---

### Task 1: Project single-field editor state through card presentation

**Files:**

- Modify: `frontend/src/features/cardLayout/CardLayoutRenderer.tsx:31-35`
- Modify: `frontend/src/features/cardLayout/CardFieldLayoutNode.tsx:376`
- Modify: `frontend/src/features/cards/FilledCardLayout.tsx:246-257`
- Test: `frontend/src/features/cards/FilledCardLayout.test.tsx:387-444`

**Interfaces:**

- Consumes: `BlockEditorState.values`, `dirty`, `pending`, and `target` from `useBlockEditor`.
- Produces: optional `editingState` in `CardLayoutFieldPresentation`, with one of `"active"`, `"dirty"`, or `"saving"`.

- [ ] **Step 1: Write failing editor-state tests**

Add a deferred save helper and tests that assert classes on `filled-field-layout-first-name`:

```tsx
test("marks only the active field while its value matches the saved value", async () => {
  const user = userEvent.setup();
  render(<EditableFilledCard saveValues={vi.fn().mockResolvedValue(undefined)} />);

  await user.click(screen.getByTestId("filled-field-layout-first-name"));

  expect(screen.getByTestId("filled-field-layout-first-name")).toHaveClass("is-editor-active");
  expect(screen.getByTestId("filled-field-layout-last-name")).not.toHaveClass("is-editor-active");
});

test("marks the changed field as unsaved until its save resolves", async () => {
  const deferred = createDeferred<void>();
  const saveValues = vi.fn().mockReturnValue(deferred.promise);
  render(<EditableFilledCard saveValues={saveValues} />);

  fireEvent.click(screen.getByTestId("filled-field-layout-first-name"));
  fireEvent.change(screen.getByLabelText("Имя"), { target: { value: "Пётр" } });
  expect(screen.getByTestId("filled-field-layout-first-name")).toHaveClass("is-editor-dirty");

  fireEvent.blur(screen.getByLabelText("Имя"));
  await waitFor(() => expect(saveValues).toHaveBeenCalledTimes(1));
  expect(screen.getByTestId("filled-field-layout-first-name")).toHaveClass("is-editor-saving");

  await act(async () => deferred.resolve());
  await waitFor(() =>
    expect(screen.getByTestId("filled-field-layout-first-name")).toHaveClass("is-editor-active"),
  );
});
```

- [ ] **Step 2: Run test to verify RED**

Run:

```powershell
pnpm -C frontend exec vitest run src/features/cards/FilledCardLayout.test.tsx
```

Expected: FAIL because `is-editor-active`, `is-editor-dirty`, and `is-editor-saving` are not emitted.

- [ ] **Step 3: Add the minimal presentation contract and projection**

Extend the presentation type without replacing completion state:

```tsx
export type CardLayoutFieldPresentation = {
  state?: "filled" | "required-missing" | "empty";
  editingState?: "active" | "dirty" | "saving";
  description?: string;
};
```

In `FilledCardLayout`, derive state only for the current surface and active field, with priority `saving`, then `dirty`, then `active`:

```tsx
const isActiveEditorField =
  editorTarget?.blockId === field.block_id &&
  blockEditor &&
  Object.prototype.hasOwnProperty.call(blockEditor.values, field.id);
const editingState = isActiveEditorField
  ? blockEditor.pending
    ? "saving"
    : blockEditor.dirty
      ? "dirty"
      : "active"
  : undefined;
```

Return `editingState` together with existing completion presentation. In `CardFieldLayoutNode`, append the node class:

```tsx
${presentation?.editingState ? ` is-editor-${presentation.editingState}` : ""}
```

- [ ] **Step 4: Run test to verify GREEN**

Run:

```powershell
pnpm -C frontend exec vitest run src/features/cards/FilledCardLayout.test.tsx
```

Expected: PASS with the new active, unsaved, and saving assertions and existing field-switch tests.

- [ ] **Step 5: Commit**

```powershell
git add frontend/src/features/cardLayout/CardLayoutRenderer.tsx frontend/src/features/cardLayout/CardFieldLayoutNode.tsx frontend/src/features/cards/FilledCardLayout.tsx frontend/src/features/cards/FilledCardLayout.test.tsx
git commit -m "fix: show card field editor states"
```

### Task 2: Restore visual hierarchy in CSS and verify the release gate

**Files:**

- Modify: `frontend/src/styles/globals.css:2670-2727`
- Modify: `frontend/src/features/cards/FilledCardLayout.test.tsx:15, 387-444`
- Modify: `PLANS.md`

**Interfaces:**

- Consumes: `is-editor-active`, `is-editor-dirty`, and `is-editor-saving` classes emitted by Task 1.
- Produces: active blue, unsaved amber/red, and saving blue visual treatments.

- [ ] **Step 1: Write a failing CSS-contract assertion**

Read `globals.css` in the existing test and assert:

```tsx
expect(globalStyles).toContain(".filled-card-layout .card-layout-field-node.is-editor-active");
expect(globalStyles).toContain(".filled-card-layout .card-layout-field-node.is-editor-dirty");
expect(globalStyles).toContain(".filled-card-layout .card-layout-field-node.is-editor-saving");
```

- [ ] **Step 2: Run test to verify RED**

Run:

```powershell
pnpm -C frontend exec vitest run src/features/cards/FilledCardLayout.test.tsx
```

Expected: FAIL because the editor-state CSS selectors do not exist.

- [ ] **Step 3: Add the state-specific styling**

Add rules after the completion presentation rules:

```css
.filled-card-layout .card-layout-field-node.is-editor-active,
.filled-card-layout .card-layout-field-node.is-editor-saving {
  border-color: #0f66d0;
  box-shadow: 0 0 0 2px rgba(15, 102, 208, 0.18);
}

.filled-card-layout .card-layout-field-node.is-editor-dirty {
  border-color: #d25c19;
  background: #fff4e8;
  box-shadow: 0 0 0 3px rgba(210, 92, 25, 0.24);
}
```

The selectors are more specific than completion styling, so unsaved state overrides green only while the draft differs from its saved value.

- [ ] **Step 4: Run focused checks and build**

Run:

```powershell
pnpm -C frontend exec vitest run src/features/cards/FilledCardLayout.test.tsx
pnpm -C frontend exec tsc --noEmit
pnpm -C frontend exec eslint src/features/cardLayout/CardLayoutRenderer.tsx src/features/cardLayout/CardFieldLayoutNode.tsx src/features/cards/FilledCardLayout.tsx src/features/cards/FilledCardLayout.test.tsx
pnpm -C frontend exec prettier --check src/features/cardLayout/CardLayoutRenderer.tsx src/features/cardLayout/CardFieldLayoutNode.tsx src/features/cards/FilledCardLayout.tsx src/features/cards/FilledCardLayout.test.tsx src/styles/globals.css
pnpm -C frontend build
git diff --check
```

Expected: test and typecheck pass; ESLint has no new errors; the existing `FilledCardLayout.tsx` hook-dependency warning may remain; build succeeds with only the known Vite chunk-size advisory.

- [ ] **Step 5: Record and commit release evidence**

Add the local and deployment outcome to `PLANS.md`, then commit:

```powershell
git add frontend/src/styles/globals.css frontend/src/features/cards/FilledCardLayout.test.tsx PLANS.md
git commit -m "docs: record card field state indicators"
```

