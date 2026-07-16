# Direct Card-Field Switch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a click on another editable field save the current card-field draft and immediately focus the clicked field.

**Architecture:** Keep the existing single-field `useBlockEditor` and its `pendingOpen` queue. Let `CardFieldLayoutNode` request an eligible field during pointerdown capture, then change the document-level pointer handler in `FilledCardLayout` so only pointers outside every card field close the active editor. The target is queued and focused after the current save completes.

**Tech Stack:** React, TypeScript, Vitest, Testing Library, existing `useBlockEditor` state hook.

## Global Constraints

- Applies only to pointer/click activation in the authenticated filled-card layout.
- Reuse `useBlockEditor.openField` and its current queued-save behavior; do not add a second editor state path.
- Preserve current outside-click close behavior, save errors, public-link editing, `Tab` / `Shift+Tab`, picker keyboard behavior, and non-ordinary field handling.
- Do not change backend contracts, audit behavior, or card schema behavior.

---

### Task 1: Preserve in-card clicks and transfer focus to the clicked field

**Files:**

- Modify: `frontend/src/features/cardLayout/CardFieldLayoutNode.tsx:377-421`
- Modify: `frontend/src/features/cards/FilledCardLayout.tsx:163-177`
- Modify: `frontend/src/features/cards/FilledCardLayout.test.tsx:426-449`

**Interfaces:**

- Consumes existing `BlockEditorState.openField`, which queues `pendingOpen` and flushes a dirty active field.
- Keeps `closeFieldOnOutsidePointer(event: PointerEvent)` private to `FilledCardLayout`.

- [ ] **Step 1: Write the failing focus-transfer assertion**

Add a new regression test next to `saves the current field before opening
another field`. It must change the first-name draft and send pointerdown to
the last-name field without a later click:

```tsx
fireEvent.pointerDown(screen.getByTestId("filled-field-layout-last-name"));
await waitFor(() =>
  expect(saveValues).toHaveBeenCalledWith({
    values: [
      { field_id: "first-name", value: "Пётр", block_instance_id: null },
    ],
  }),
);
expect(await screen.findByLabelText("Фамилия")).toHaveFocus();
```

- [ ] **Step 2: Run the focused test to verify RED**

Run:

```powershell
pnpm -C frontend exec vitest run src/features/cards/FilledCardLayout.test.tsx
```

Expected: FAIL because field activation currently happens in the later click
handler; pointerdown alone only closes the current field.

- [ ] **Step 3: Keep card-field clicks inside the editor transition**

In `CardFieldLayoutNode`, request the existing activation during pointerdown
capture when the field is activatable and the pointer target is not an
interactive editor control:

```tsx
onPointerDownCapture={(event) => {
  if (fieldActivatable && fieldActivationContext && !isInteractiveTarget(event.target)) {
    onActivateField?.(fieldActivationContext);
  }
}}
```

Replace the active-field-only guard in `FilledCardLayout` with an all-card-field
guard:

```tsx
const fieldNode = event.target.closest<HTMLElement>("[data-card-field-id]");
if (fieldNode) return;
commitAndClose();
```

Do not call `commitAndClose` for a pointer on another card field. The early
activation reaches `blockEditor.openField`, which flushes the dirty current
value and resolves `pendingOpen` to the target field after the save.

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
pnpm -C frontend exec eslint src/features/cardLayout/CardFieldLayoutNode.tsx src/features/cards/FilledCardLayout.tsx
pnpm -C frontend exec prettier --check src/features/cardLayout/CardFieldLayoutNode.tsx src/features/cards/FilledCardLayout.tsx src/features/cards/FilledCardLayout.test.tsx
git diff --check
```

Commit:

```powershell
git add frontend/src/features/cardLayout/CardFieldLayoutNode.tsx frontend/src/features/cards/FilledCardLayout.tsx frontend/src/features/cards/FilledCardLayout.test.tsx
git commit -m "fix: switch card fields on click"
```
