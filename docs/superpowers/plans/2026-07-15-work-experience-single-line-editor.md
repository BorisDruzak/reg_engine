# Single-line work experience editor implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the three-part work-experience editor with one keyboard-focusable input that accepts `days months years` and shows the correctly declensed Russian duration.

**Architecture:** Keep the backend and `WorkExperienceValue` API contract unchanged. `WorkExperienceEditor` owns one raw text draft, parses exactly three whitespace-separated non-negative safe integers, and emits the existing `{ days, months, years }` payload only after a complete valid input. The existing `formatWorkExperience` function supplies the canonical visible value.

**Tech Stack:** React, TypeScript, Vitest, Testing Library, user-event, existing frontend CSS.

## Global Constraints

- The field remains schema-driven `work_experience`; do not introduce a business-specific model, API endpoint, or database column.
- The only persisted representation remains the server-owned anchor date. The browser must never receive or calculate it.
- The editor sends only `{ days, months, years }` after complete valid input; parsing is client-side convenience only.
- One visible `<input>` and one tab-stop are required. Labels, hint, disabled state, and blur behavior remain accessible.
- The displayed duration uses the existing Russian declension function and `days → months → years` order.

---

### Task 1: Define the single-input interaction with a focused test

**Files:**
- Modify: `frontend/src/features/cards/WorkExperienceEditor.test.tsx`

**Interfaces:**
- Consumes: `FieldEditorControl` with `fieldType="work_experience"`.
- Produces: a regression test requiring one accessible input that emits `WorkExperienceValue`.

- [ ] **Step 1: Write the failing test**

Replace the three-control assertion with a test that types one duration string:

```tsx
test("accepts a complete duration through one input", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(
    <FieldEditorControl
      fieldType="work_experience"
      label="Стаж работы"
      options={[]}
      value={{ days: 0, months: 0, years: 0 } as never}
      onChange={onChange}
    />,
  );

  const input = screen.getByRole("textbox", { name: "Стаж работы" });
  await user.clear(input);
  await user.type(input, "16 3 9");

  expect(screen.getAllByRole("textbox", { name: "Стаж работы" })).toHaveLength(1);
  expect(input).toHaveValue("16 дней 3 месяца 9 лет");
  expect(onChange).toHaveBeenLastCalledWith({ days: 16, months: 3, years: 9 });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
pnpm -C frontend vitest run src/features/cards/WorkExperienceEditor.test.tsx
```

Expected: the test fails because the existing editor exposes three textboxes.

- [ ] **Step 3: Add incomplete and invalid-input expectations**

Add cases that confirm `"16 3"` does not emit, `"16 days 3 9"` is rejected,
and a disabled editor exposes one disabled textbox.

- [ ] **Step 4: Run the focused test and verify the failures describe missing one-line behavior**

Run the same Vitest command. Expected: failures are assertions about the
current three-input editor, not test setup errors.

### Task 2: Implement the minimal editor rewrite

**Files:**
- Modify: `frontend/src/features/cards/WorkExperienceEditor.tsx`
- Test: `frontend/src/features/cards/WorkExperienceEditor.test.tsx`

**Interfaces:**
- Consumes: `formatWorkExperience`, `workExperiencePayload`, and
  `workExperienceValueFromUnknown` from `workExperience.ts`.
- Produces: one `input[type=text]` with `aria-label={label}`. A complete draft
  calls `onChange(workExperiencePayload({ days, months, years }))`.

- [ ] **Step 1: Replace the three-part raw draft with one string draft**

Use one state string. Derive the input value from the controlled value as
`formatWorkExperience(normalizedValue)` unless the user is actively holding an
incomplete draft.

```tsx
type ParsedDuration = { days: number; months: number; years: number };

function parseDurationDraft(value: string): ParsedDuration | null {
  const parts = value.trim().split(/\s+/);
  if (parts.length !== 3 || parts.some((part) => !/^\d+$/.test(part))) {
    return null;
  }
  const [days, months, years] = parts.map(Number);
  if (![days, months, years].every(Number.isSafeInteger)) {
    return null;
  }
  return { days, months, years };
}
```

- [ ] **Step 2: Emit and format only a complete valid draft**

On a complete parsed duration, call `onChange` with the existing payload then
replace the raw string with `formatWorkExperience(parsed)`. On incomplete
numeric text, retain it locally and do not emit. Reject any text that contains
letters, punctuation other than spaces, a minus sign, or more than three
numeric parts.

- [ ] **Step 3: Preserve accessible focus and blur behavior**

Render a single input inside the existing group:

```tsx
<input
  aria-label={label}
  disabled={disabled}
  inputMode="numeric"
  onBlur={onBlur}
  onChange={handleChange}
  pattern="[0-9 ]*"
  type="text"
  value={draftValue}
/>
```

Remove the unused per-part labels and the result `<output>`; the canonical
formatted text is the input value after a valid three-number entry.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```powershell
pnpm -C frontend vitest run src/features/cards/WorkExperienceEditor.test.tsx
```

Expected: all tests in the file pass.

- [ ] **Step 5: Commit the focused implementation**

```powershell
git add frontend/src/features/cards/WorkExperienceEditor.tsx frontend/src/features/cards/WorkExperienceEditor.test.tsx
git commit -m "fix: use one work experience input"
```

### Task 3: Run consumer and quality verification

**Files:**
- Modify: `PLANS.md`
- Modify: `docs/PROJECT_TREE.md` if the project-map check requires it.

**Interfaces:**
- Consumes: the existing card creation, filled-card, and public-link consumers
  through `FieldEditorControl`.
- Produces: recorded verification evidence without altering the backend contract.

- [ ] **Step 1: Run relevant consumer tests**

```powershell
pnpm -C frontend vitest run src/features/cards/WorkExperienceEditor.test.tsx src/features/cards/FieldEditorControl.test.tsx src/features/cards/SingleStageCardCreation.test.tsx src/features/cards/FilledCardLayout.test.tsx src/pages/PublicLinkEditPage.test.tsx
```

Expected: all selected frontend tests pass.

- [ ] **Step 2: Run frontend quality gates**

```powershell
pnpm -C frontend typecheck
pnpm -C frontend lint
pnpm -C frontend build
```

Expected: typecheck and build pass; lint has no errors. Preserve only already
documented advisories if they are unchanged.

- [ ] **Step 3: Update the plan evidence and project map**

Record the one-input behavior, test results, and unchanged server contract in
`PLANS.md`. Then run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/project-map.ps1
powershell -ExecutionPolicy Bypass -File scripts/project-map.ps1 -Check
git diff --check
```

Expected: the map is current and no whitespace errors are reported.

- [ ] **Step 4: Commit verification documentation**

```powershell
git add PLANS.md docs/PROJECT_TREE.md
git commit -m "docs: record single-line work experience editor"
```
