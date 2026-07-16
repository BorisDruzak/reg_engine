# Direct Card-Field Switch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a click on another editable field save the current card-field draft and immediately focus the clicked field.

**Architecture:** Keep the existing single-field `useBlockEditor` and its `pendingOpen` queue. Change the document-level pointer handler in `FilledCardLayout` so only clicks outside every card field close the active editor; a click on another eligible field then reaches its existing activation handler, which queues the target and focuses it after the current save completes.

**Tech Stack:** React, TypeScript, Vitest, Testing Library, existing `useBlockEditor` state hook.

## Global Constraints

- Applies only to pointer/click activation in the authenticated filled-card layout.
- Reuse `useBlockEditor.openField` and its current queued-save behavior; do not add a second editor state path.
- Preserve current outside-click close behavior, save errors, public-link editing, `Tab` / `Shift+Tab`, picker keyboard behavior, and non-ordinary field handling.
- Do not change backend contracts, audit behavior, or card schema behavior.

---

### Task 1: Preserve in-card clicks and transfer focus to the clicked field

**Files:**
- Modify: `frontend/src/features/cards/FilledCardLayout.tsx:163-177`
- Modify: `frontend/src/features/cards/FilledCardLayout.test.tsx:426-449`

**Interfaces:**
- Consumes existing `BlockEditorState.openField`, which queues `pendingOpen` and flushes a dirty active field.
- Keeps `closeFieldOnOutsidePointer(event: PointerEvent)` private to `FilledCardLayout`.

- [ ] **Step 1: Write the failing focus-transfer assertion**

In the existing `saves the current field before opening another field` test,
add an assertion after the save expectation that the newly opened last-name
control owns browser focus:

```tsx
const lastName = await screen.findByLabelText("Фамилия");
expect(lastName).toHaveFocus();
expect(lastName).toHaveValue("Иванов");
```

- [ ] **Step 2: Run the focused test to verify RED**

Run:

```powershell
pnpm -C frontend exec vitest run src/features/cards/FilledCardLayout.test.tsx
```

Expected: the existing click sequence saves the first-name value but the new
focus assertion fails because the document capture handler closes the editor
before the target field's activation path can retain the transition.

- [ ] **Step 3: Keep card-field clicks inside the editor transition**

Replace the active-field-only guard in `FilledCardLayout` with an all-card-field
guard:

```tsx
const fieldNode = event.target.closest<HTMLElement>("[data-card-field-id]");
if (fieldNode) return;
commitAndClose();
```

Do not call `commitAndClose` for a click on another card field. Its existing
`onActivateField` call must reach `blockEditor.openField`, which flushes the
dirty current value and resolves `pendingOpen` to the target field after the
save.

- [ ] **Step 4: Run the focused test to verify GREEN**

Run:

```powershell
pnpm -C frontend exec vitest run src/features/cards/FilledCardLayout.test.tsx
```

Expected: PASS. The clicked field is focused after the current value is saved;
the surrounding existing tests still cover outside click closure, choice saves,
and date blur behavior.

- [ ] **Step 5: Run scoped static checks and commit**

Run:

```powershell
pnpm -C frontend exec tsc --noEmit
pnpm -C frontend exec eslint src/features/cards/FilledCardLayout.tsx
pnpm -C frontend exec prettier --check src/features/cards/FilledCardLayout.tsx src/features/cards/FilledCardLayout.test.tsx
git diff --check
```

Commit:

```powershell
git add frontend/src/features/cards/FilledCardLayout.tsx frontend/src/features/cards/FilledCardLayout.test.tsx
git commit -m "fix: switch card fields on click"
```
