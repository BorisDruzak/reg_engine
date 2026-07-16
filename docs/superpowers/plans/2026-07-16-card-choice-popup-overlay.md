# Card Choice Popup Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display saved-card choice lists above the card canvas without changing card-field grid geometry.

**Architecture:** `SearchableChoicePicker` exposes its existing open state as an `is-open` root class. CSS makes the picker a positioning context and its popup an absolute overlay. Narrow `:has(.searchable-choice-picker.is-open)` rules lift only the saved-card field node and card canvas containing the open popup, restoring visible overflow only for that state.

**Tech Stack:** React, TypeScript, CSS, Vitest, Testing Library.

## Global Constraints

- Keep existing picker accessibility, keyboard navigation, search, selection, Escape, and autosave behavior.
- Cover the shared picker used by `select`, `multi_select`, `organization_ref`, and `org_unit_ref`.
- Do not introduce portals, global coordinate calculation, new API calls, or persistent UI state.
- Closed card fields must retain existing layout and overflow behavior.

---

### Task 1: Expose picker state and add overlay styling

**Files:**

- Modify: `frontend/src/features/cards/SearchableChoicePicker.tsx:74`
- Modify: `frontend/src/features/cards/FieldEditorControl.test.tsx:1, 67-92`
- Modify: `frontend/src/styles/globals.css:2958-3020`

**Interfaces:**

- Consumes: local `isOpen` state already maintained by `SearchableChoicePicker`.
- Produces: `searchable-choice-picker is-open` on the root only while the popup is rendered.

- [x] **Step 1: Write failing component and CSS contract tests**

Import `readFileSync` and define:

```tsx
const globalStyles = readFileSync("src/styles/globals.css", "utf8");
```

Then add:

```tsx
test("marks an open choice picker for overlay positioning", async () => {
  const user = userEvent.setup();
  renderControl("select", "Выберите вариант");

  const picker = screen.getByRole("group", { name: "Поле select" });
  expect(picker).not.toHaveClass("is-open");

  await user.click(within(picker).getByRole("combobox", { name: "Поле select" }));

  expect(picker).toHaveClass("is-open");
  expect(globalStyles).toContain(".searchable-choice-picker.is-open");
  expect(globalStyles).toContain("position: absolute;");
  expect(globalStyles).toContain(
    ".filled-card-layout .card-layout-field-node:has(.searchable-choice-picker.is-open)",
  );
});
```

- [x] **Step 2: Run the focused test to verify RED**

Run:

```powershell
pnpm -C frontend exec vitest run src/features/cards/FieldEditorControl.test.tsx
```

Expected: FAIL because the picker root has no `is-open` class and overlay selectors do not exist.

- [x] **Step 3: Add the minimal component and CSS implementation**

Set the root class without new state:

```tsx
<div
  className={`searchable-choice-picker${isOpen ? " is-open" : ""}`}
  role="group"
  aria-label={label}
>
```

Use these CSS rules:

```css
.searchable-choice-picker {
  position: relative;
  z-index: 0;
}

.searchable-choice-picker.is-open {
  z-index: 8;
}

.searchable-choice-picker-popup {
  position: absolute;
  z-index: 1;
  top: calc(100% + 6px);
  right: 0;
  left: 0;
  max-height: min(320px, 50vh);
  padding: 8px;
  border: 1px solid #d6dde8;
  border-radius: 8px;
  background: #ffffff;
  box-shadow: 0 14px 28px rgba(24, 34, 48, 0.18);
}

.filled-card-layout .card-layout-field-node:has(.searchable-choice-picker.is-open) {
  overflow: visible;
  z-index: 8;
}

.filled-card-layout .card-web-layout-canvas:has(.searchable-choice-picker.is-open) {
  overflow: visible;
}
```

Keep the popup grid and its search/options children unchanged; absolute positioning removes that grid from document flow.

- [x] **Step 4: Run the focused test to verify GREEN**

Run:

```powershell
pnpm -C frontend exec vitest run src/features/cards/FieldEditorControl.test.tsx
pnpm -C frontend exec vitest run src/features/cards/FilledCardLayout.test.tsx
```

Expected: both files pass, including filtering, selection, Escape, immediate choice opening, and direct card-field switching.

- [x] **Step 5: Commit**

```powershell
git add frontend/src/features/cards/SearchableChoicePicker.tsx frontend/src/features/cards/FieldEditorControl.test.tsx frontend/src/styles/globals.css
git commit -m "fix: overlay card choice popups" # aab7dd59
```

### Task 2: Verify and record the release

**Files:**

- Modify: `PLANS.md`

**Interfaces:**

- Consumes: overlay implementation from Task 1.
- Produces: release evidence for the saved-card choice popup behavior.

- [x] **Step 1: Run focused quality checks**

```powershell
pnpm -C frontend exec tsc --noEmit
pnpm -C frontend exec eslint src/features/cards/SearchableChoicePicker.tsx src/features/cards/FieldEditorControl.test.tsx
pnpm -C frontend exec prettier --check src/features/cards/SearchableChoicePicker.tsx src/features/cards/FieldEditorControl.test.tsx src/styles/globals.css
pnpm -C frontend build
git diff --check
```

Expected: TypeScript, Prettier, and build pass. ESLint reports no errors. The known Vite chunk-size advisory may remain.

- [x] **Step 2: Update the release plan and commit**

Record red-green test evidence, build output, deployment artifact, server smoke check, and browser overlay proof in `PLANS.md`, then commit:

```powershell
git add PLANS.md
git commit -m "docs: record card choice popup overlay release"
```
