# Single Work Experience Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render work experience as one contenteditable control with immutable Russian unit words.

**Architecture:** `WorkExperienceEditor` keeps its three existing string drafts but replaces three native inputs with one `contenteditable` textbox. The editable numeric spans are identified by data attributes; unit spans are `contentEditable={false}`. Input events reconstruct the drafts from the three numeric spans and emit the unchanged payload only when all values are valid.

**Tech Stack:** React, TypeScript, Vitest, Testing Library, global CSS, Vite.

## Global Constraints

- Keep the schema-driven `work_experience` type, API payload, server calculation, and exports unchanged.
- Render exactly one visible external border and one `role="textbox"` element for the whole control.
- Unit words must stay visible, immutable, and use the existing Russian declension rules.
- `Space` moves selection days → months → years; in years it is prevented without changing selection or text.
- Follow TDD: test first, observe RED, then add the smallest implementation.

---

### Task 1: Specify the single-control DOM and keyboard behavior

**Files:**

- Modify: `frontend/src/features/cards/WorkExperienceEditor.test.tsx`
- Modify: `frontend/src/features/cards/FieldEditorControl.test.tsx`

**Interfaces:**

- Consumes: `FieldEditorControl` with `fieldType="work_experience"`.
- Produces: one `role="textbox"` named by the field label and numeric spans with `data-work-experience-part`.

- [x] **Step 1: Write a failing one-control rendering test**

```tsx
const control = screen.getByRole("textbox", { name: "Стаж работы" });
expect(control).toHaveAttribute("contenteditable", "true");
expect(screen.getAllByRole("textbox", { name: "Стаж работы" })).toHaveLength(1);
expect(control).toHaveTextContent("16 дней 3 месяца 9 лет");
expect(control.querySelectorAll("[data-work-experience-part]")).toHaveLength(3);
expect(control.querySelectorAll("[contenteditable='false']")).toHaveLength(3);
```

- [x] **Step 2: Write a failing keyboard-flow test**

Use `user.click(control)`, place the selection in the days span through the public test helper, press `Space`, and assert selection is in the months span. Repeat for years and assert another `Space` retains the same selection and text.

- [x] **Step 3: Verify RED**

```powershell
node node_modules/vitest/vitest.mjs run src/features/cards/WorkExperienceEditor.test.tsx src/features/cards/FieldEditorControl.test.tsx --reporter=dot
```

Expected: FAIL because the current editor renders three independent textboxes.

### Task 2: Replace three inputs with one protected contenteditable control

**Files:**

- Modify: `frontend/src/features/cards/WorkExperienceEditor.tsx`
- Modify: `frontend/src/features/cards/WorkExperienceEditor.test.tsx`

**Interfaces:**

- Consumes: `WorkExperiencePart`, `workExperiencePayload`, and `workExperienceUnitWord`.
- Produces: a single `div role="textbox" contentEditable` and an unchanged `WorkExperiencePayload`.

- [x] **Step 1: Render one editor with three numeric spans**

```tsx
<div
  ref={editorRef}
  aria-label={label}
  className="work-experience-editor"
  contentEditable={!disabled}
  onInput={handleInput}
  onKeyDown={handleKeyDown}
  role="textbox"
  suppressContentEditableWarning
>
  <span data-work-experience-part="days">{draft.days}</span>
  <span contentEditable={false}>{workExperienceUnitWord(dayValue, "days")}</span>
  <span data-work-experience-part="months">{draft.months}</span>
  <span contentEditable={false}>{workExperienceUnitWord(monthValue, "months")}</span>
  <span data-work-experience-part="years">{draft.years}</span>
  <span contentEditable={false}>{workExperienceUnitWord(yearValue, "years")}</span>
</div>
```

Use `aria-disabled={disabled}` and prevent edits/keyboard changes when disabled.

- [x] **Step 2: Normalize input and preserve words**

Read the three `[data-work-experience-part]` span text values on every input. Replace non-digits with an empty string, update the controlled draft, and emit `workExperiencePayload(parsed)` only when all three values are safe non-negative integers. Re-render on every input event so attempts to alter unit spans restore the fixed words.

- [x] **Step 3: Set selection by numeric part**

Implement a `focusPart(part)` helper that creates a range inside the named numeric span, collapses it at the end, and updates `window.getSelection()`. On `Space`, call `preventDefault()`; focus months from days, years from months, and leave selection in years otherwise.

- [x] **Step 4: Verify GREEN**

```powershell
node node_modules/vitest/vitest.mjs run src/features/cards/WorkExperienceEditor.test.tsx src/features/cards/FieldEditorControl.test.tsx --reporter=dot
```

Expected: all focused tests pass, including one textbox, protected unit spans, and Space navigation.

### Task 3: Apply one-border style, verify consumers, and release

**Files:**

- Modify: `frontend/src/styles/globals.css`
- Modify: `frontend/src/features/cards/FilledCardLayout.test.tsx`
- Modify: `frontend/src/pages/PublicLinkEditPage.test.tsx`
- Modify: `PLANS.md`

**Interfaces:**

- Consumes: the single contenteditable `WorkExperienceEditor`.
- Produces: the same one-control interaction in creation, saved-card, and public-link surfaces.

- [x] **Step 1: Replace segment border styles with one-control styles**

```css
.work-experience-editor {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  min-height: 42px;
  padding: 10px 12px;
  border: 1px solid #cbd5df;
  border-radius: 8px;
  background: #ffffff;
}
.work-experience-editor [data-work-experience-part] { min-width: 1ch; outline: none; }
.work-experience-editor [contenteditable="false"] { user-select: none; white-space: nowrap; }
```

Remove the independent input/segment layout rules. Add the existing focus-visible border treatment to `.work-experience-editor:focus-within`.

- [x] **Step 2: Update saved and public card tests**

Change their assertions from three textbox controls to one textbox containing all units. Update values through the numeric span helper and retain checks for the exact structured payload.

- [x] **Step 3: Run verification**

```powershell
node node_modules/vitest/vitest.mjs run src/features/cards/WorkExperienceEditor.test.tsx src/features/cards/workExperience.test.ts src/features/cards/FieldEditorControl.test.tsx src/features/cards/FilledCardLayout.test.tsx src/pages/PublicLinkEditPage.test.tsx --reporter=dot
node node_modules/typescript/bin/tsc -b --noEmit
node node_modules/eslint/bin/eslint.js src/features/cards/WorkExperienceEditor.tsx src/features/cards/WorkExperienceEditor.test.tsx src/features/cards/workExperience.ts src/styles/globals.css
node node_modules/prettier/bin/prettier.cjs --check src/features/cards/WorkExperienceEditor.tsx src/features/cards/WorkExperienceEditor.test.tsx src/features/cards/workExperience.ts src/styles/globals.css
node node_modules/vite/bin/vite.js build
```

Expected: all commands exit 0, with only the known Vite chunk-size advisory permitted.

- [ ] **Step 4: Commit, deploy, and prove the published control**

```powershell
git add PLANS.md frontend/src/features/cards/WorkExperienceEditor.tsx frontend/src/features/cards/WorkExperienceEditor.test.tsx frontend/src/features/cards/FieldEditorControl.test.tsx frontend/src/features/cards/FilledCardLayout.test.tsx frontend/src/pages/PublicLinkEditPage.test.tsx frontend/src/styles/globals.css
git commit -m "fix: render work experience as one control"
git push origin main
powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1
powershell -ExecutionPolicy Bypass -File scripts/deploy-frontend.ps1
```

Reload the open public card without saving data. Verify one visible editor border, fixed Russian words, a single editable control, and the three Space transitions.
