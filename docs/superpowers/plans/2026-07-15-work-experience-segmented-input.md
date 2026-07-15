# Segmented Work Experience Input Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the free-text work-experience editor with three keyboard-linked numeric segments displayed as one Russian duration field.

**Architecture:** `WorkExperienceEditor` remains the only client editor for the schema-driven `work_experience` type. It will hold three local string drafts, emit the existing `{ days, months, years }` payload only when all parts are safe non-negative integers, and render unit words from the existing declension formatter. CSS presents the inputs and their words as one responsive control; no API, stored value, server calculation, or export code changes.

**Tech Stack:** React, TypeScript, Vitest, Testing Library, existing global CSS, Vite.

## Global Constraints

- Keep `work_experience` schema-driven; do not add card columns, API routes, or database changes.
- Preserve the exact outbound `WorkExperiencePayload` shape: `{ days, months, years }`.
- Keep server-owned `anchor_date` private and preserve all document/XLSX display behavior.
- UI copy and accessible labels are Russian-first.
- A space moves focus only from days to months and months to years; a space in years has no effect.
- Use TDD: add each test, observe its expected failure, then write the smallest implementation that passes.

---

### Task 1: Define the segmented editor interaction with failing tests

**Files:**

- Modify: `frontend/src/features/cards/WorkExperienceEditor.test.tsx`

**Interfaces:**

- Consumes: `FieldEditorControl` with `fieldType="work_experience"` and a `WorkExperienceValue`.
- Produces: textboxes named `«<label>, дни»`, `«<label>, месяцы»`, and `«<label>, годы»`.

- [ ] **Step 1: Replace one-textbox test access with a segment helper**

```tsx
function segmentedInputs(label = "Стаж работы") {
  return {
    days: screen.getByRole("textbox", { name: `${label}, дни` }),
    months: screen.getByRole("textbox", { name: `${label}, месяцы` }),
    years: screen.getByRole("textbox", { name: `${label}, годы` }),
  };
}
```

Keep the labelled outer group and assert the visible unit words inside it.

- [ ] **Step 2: Write the failing Space-navigation test**

```tsx
test("moves through duration segments with Space and keeps the year segment focused", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(<FieldEditorControl fieldType="work_experience" label="Стаж работы" options={[]} value={{ days: 0, months: 0, years: 0 } as never} onChange={onChange} />);
  const { days, months, years } = segmentedInputs();
  await user.clear(days);
  await user.type(days, "16");
  await user.keyboard(" ");
  expect(months).toHaveFocus();
  await user.type(months, "3");
  await user.keyboard(" ");
  expect(years).toHaveFocus();
  await user.type(years, "9");
  await user.keyboard(" ");
  expect(years).toHaveFocus();
  expect(onChange).toHaveBeenLastCalledWith({ days: 16, months: 3, years: 9 });
});
```

- [ ] **Step 3: Write the failing visible-word test**

```tsx
test("keeps unit words visible and recalculates their forms", async () => {
  const user = userEvent.setup();
  render(<FieldEditorControl fieldType="work_experience" label="Стаж работы" options={[]} value={{ days: 1, months: 2, years: 5 } as never} onChange={vi.fn()} />);
  const { days } = segmentedInputs();
  expect(screen.getByText("день")).toBeVisible();
  expect(screen.getByText("месяца")).toBeVisible();
  expect(screen.getByText("лет")).toBeVisible();
  await user.clear(days);
  await user.type(days, "5");
  expect(screen.getByText("дней")).toBeVisible();
});
```

Adapt current incomplete, unsafe, disabled, form-submit, and group-blur tests to three inputs.

- [ ] **Step 4: Verify RED**

Run:

```powershell
node node_modules/vitest/vitest.mjs run src/features/cards/WorkExperienceEditor.test.tsx --reporter=dot
```

Expected: the current single textbox does not satisfy the three named segment inputs or the Space-focus flow.

- [ ] **Step 5: Commit the test checkpoint**

```powershell
git add frontend/src/features/cards/WorkExperienceEditor.test.tsx
git commit -m "test: specify segmented work experience input"
```

### Task 2: Implement the three native numeric segments

**Files:**

- Modify: `frontend/src/features/cards/WorkExperienceEditor.tsx`
- Modify: `frontend/src/features/cards/workExperience.ts`
- Modify: `frontend/src/features/cards/workExperience.test.ts`
- Modify: `frontend/src/features/cards/WorkExperienceEditor.test.tsx`

**Interfaces:**

- Consumes: `WorkExperienceValue`, `defaultWorkExperienceValue`, `workExperienceValueFromUnknown`, and `workExperiencePayload`.
- Produces: three native text inputs and the unchanged complete `WorkExperiencePayload`.

- [ ] **Step 1: Add a typed three-part draft and parser**

```tsx
type DurationDraft = { days: string; months: string; years: string };
type DurationPart = keyof DurationDraft;

function durationDraft(value: WorkExperienceValue): DurationDraft {
  return { days: String(value.days), months: String(value.months), years: String(value.years) };
}

function parseDurationDraft(draft: DurationDraft): WorkExperienceValue | null {
  const parts = [draft.days, draft.months, draft.years];
  if (parts.some((part) => !/^\d+$/.test(part))) return null;
  const [days, months, years] = parts.map(Number);
  return [days, months, years].every(Number.isSafeInteger) ? { days, months, years } : null;
}
```

Reset drafts from a new external value only while no child input is focused. An incomplete draft remains visible and never emits a payload.

- [ ] **Step 2: Reuse the existing declension logic through an explicit helper**

Export this from `workExperience.ts` and add table coverage in `workExperience.test.ts`:

```ts
export function workExperienceUnitWord(
  value: number,
  part: "days" | "months" | "years",
): string {
  const forms = {
    days: ["день", "дня", "дней"],
    months: ["месяц", "месяца", "месяцев"],
    years: ["год", "года", "лет"],
  } as const;
  const [singular, paucal, plural] = forms[part];
  return declension(value, singular, paucal, plural);
}
```

Refactor `formatWorkExperience` to call this helper so display and input words cannot diverge.

- [ ] **Step 3: Render the composite editor and keyboard behavior**

Render a labelled `role="group"`, each input with `type="text"`, `inputMode="numeric"`, and the names `${label}, дни`, `${label}, месяцы`, and `${label}, годы`. Follow every input with `<span className="work-experience-editor-unit">{word}</span>`.

```tsx
function handleKeyDown(part: DurationPart, event: KeyboardEvent<HTMLInputElement>) {
  if (event.key !== " ") return;
  if (part === "days") { event.preventDefault(); monthsRef.current?.focus(); }
  if (part === "months") { event.preventDefault(); yearsRef.current?.focus(); }
}
```

Use refs for months/years. Do not prevent default for Space in years. Use a group blur handler which calls the existing `onBlur` only when `relatedTarget` is not inside the group.

- [ ] **Step 4: Verify GREEN**

Run:

```powershell
node node_modules/vitest/vitest.mjs run src/features/cards/WorkExperienceEditor.test.tsx src/features/cards/workExperience.test.ts --reporter=dot
```

Expected: all focused tests pass, including days → months → years focus movement and no-op Space in years.

- [ ] **Step 5: Commit the implementation**

```powershell
git add frontend/src/features/cards/WorkExperienceEditor.tsx frontend/src/features/cards/WorkExperienceEditor.test.tsx frontend/src/features/cards/workExperience.ts frontend/src/features/cards/workExperience.test.ts
git commit -m "feat: segment work experience input"
```

### Task 3: Style, consumer verification, release, and live proof

**Files:**

- Modify: `frontend/src/styles/globals.css`
- Modify: `frontend/src/features/cards/FieldEditorControl.test.tsx`
- Modify: `frontend/src/features/cards/FilledCardLayout.test.tsx`
- Modify: `frontend/src/pages/PublicLinkEditPage.test.tsx`
- Modify: `PLANS.md`

**Interfaces:**

- Consumes: the editor's three named inputs and existing admin/public card consumers.
- Produces: one responsive visual control with the unchanged shared editor contract.

- [ ] **Step 1: Add focused composite-control styles**

```css
.work-experience-editor {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.work-experience-editor input {
  width: 5.5ch;
  min-width: 4ch;
  min-height: 42px;
  padding: 10px 8px;
  text-align: center;
}
.work-experience-editor-unit {
  white-space: nowrap;
  color: #344054;
}
```

Extend the existing focus-visible selector with `.work-experience-editor input:focus-visible`. Keep one responsive row where it fits, allow natural wrapping on narrow widths, and do not add another save surface or outer border.

- [ ] **Step 2: Adapt mounted-consumer assertions**

Update existing tests to check that admin and public card surfaces expose three segment inputs via the shared editor, while retaining their structured payload assertions.

- [ ] **Step 3: Run the complete affected frontend gate**

```powershell
node node_modules/vitest/vitest.mjs run src/features/cards/WorkExperienceEditor.test.tsx src/features/cards/workExperience.test.ts src/features/cards/FieldEditorControl.test.tsx src/features/cards/FilledCardLayout.test.tsx src/pages/PublicLinkEditPage.test.tsx --reporter=dot
node node_modules/typescript/bin/tsc -b --noEmit
node node_modules/eslint/bin/eslint.js src/features/cards/WorkExperienceEditor.tsx src/features/cards/WorkExperienceEditor.test.tsx src/features/cards/workExperience.ts src/features/cards/workExperience.test.ts
node node_modules/prettier/bin/prettier.cjs --check src/features/cards/WorkExperienceEditor.tsx src/features/cards/WorkExperienceEditor.test.tsx src/features/cards/workExperience.ts src/features/cards/workExperience.test.ts src/styles/globals.css
node node_modules/vite/bin/vite.js build
```

Expected: all listed tests and static checks exit 0. The existing Vite chunk-size advisory may remain.

- [ ] **Step 4: Record evidence and commit**

Update the active `work_experience` entry in `PLANS.md`, then:

```powershell
git diff --check
git add frontend/src/styles/globals.css frontend/src/features/cards/FieldEditorControl.test.tsx frontend/src/features/cards/FilledCardLayout.test.tsx frontend/src/pages/PublicLinkEditPage.test.tsx PLANS.md
git commit -m "style: present work experience as one segmented field"
```

- [ ] **Step 5: Release and prove live behavior without saving card data**

```powershell
git push origin main
powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1
powershell -ExecutionPolicy Bypass -File scripts/deploy-frontend.ps1
```

Reload the already-open card once. Verify one visual row with three enabled segments and fixed words; verify Space moves days → months → years and another Space in years retains focus. Do not type values or save the card during browser proof. Hand the tab back to the user at the end.
