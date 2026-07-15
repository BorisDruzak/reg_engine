# Work Experience Date-Mask Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace unstable contenteditable duration editing with a one-border date-like numeric mask.

**Architecture:** `WorkExperienceEditor` keeps the existing three string drafts and payload parser. It replaces the contenteditable DOM with three controlled native text inputs inside one wrapper; each input is borderless so the field still looks like one line. Input handlers reject non-digits, enforce 2/2/4 segment lengths, and move focus predictably.

**Tech Stack:** React, TypeScript, Vitest, Testing Library, global CSS, Vite.

## Global Constraints

- Preserve the schema-driven `work_experience` type, existing `{ days, months, years }` API payload, server anchor-date calculation, and export display.
- Render one outer border and one visual row; do not reintroduce separate visible input borders.
- Allow digits only in every segment; discard letters, spaces, signs, punctuation, and mixed pasted text.
- Move days to months after two digits, months to years after two digits, and keep years capped at four digits.
- Keep Russian unit words visible and use `workExperienceUnitWord` for their declension.
- Follow RED → GREEN tests before production-code changes.

---

### Task 1: Specify deterministic mask input behavior

**Files:**

- Modify: `frontend/src/features/cards/WorkExperienceEditor.test.tsx`
- Modify: `frontend/src/features/cards/FieldEditorControl.test.tsx`

**Interfaces:**

- Consumes: `FieldEditorControl` with `fieldType="work_experience"`.
- Produces: controlled text inputs named `label, дни`, `label, месяцы`, and `label, годы` inside one `.work-experience-editor` wrapper.

- [x] **Step 1: Write failing automatic-transition tests**

```tsx
await user.click(days);
await user.type(days, "16");
expect(months).toHaveFocus();
await user.type(months, "03");
expect(years).toHaveFocus();
await user.type(years, "2026");
expect(years).toHaveValue("2026");
```

- [x] **Step 2: Write failing numeric-only and stable-blur tests**

```tsx
fireEvent.change(days, { target: { value: "1a -2" } });
expect(days).toHaveValue("12");
fireEvent.blur(years);
expect(days).toHaveValue("12");
expect(onChange).toHaveBeenLastCalledWith({ days: 12, months: 3, years: 2026 });
```

- [x] **Step 3: Write failing keyboard regression tests**

```tsx
await user.keyboard(" ");
expect(months).toHaveFocus();
await user.clear(months);
await user.keyboard("{Backspace}");
expect(days).toHaveFocus();
```

- [x] **Step 4: Verify RED**

```powershell
node node_modules/vitest/vitest.mjs run src/features/cards/WorkExperienceEditor.test.tsx src/features/cards/FieldEditorControl.test.tsx --reporter=dot
```

Expected: FAIL because the editor currently has one contenteditable textbox rather than controlled date-mask segments.

### Task 2: Implement the one-border controlled date mask

**Files:**

- Modify: `frontend/src/features/cards/WorkExperienceEditor.tsx`
- Modify: `frontend/src/styles/globals.css`

**Interfaces:**

- Consumes: `WorkExperiencePart`, `workExperiencePayload`, and `workExperienceUnitWord`.
- Produces: a `.work-experience-editor` wrapper with controlled `HTMLInputElement` refs for days, months, and years.

- [x] **Step 1: Restore three controlled input segments**

```tsx
<input
  ref={part === "days" ? daysRef : part === "months" ? monthsRef : yearsRef}
  aria-label={`${label}, ${partLabels[part]}`}
  inputMode="numeric"
  maxLength={part === "years" ? 4 : 2}
  onChange={(event) => handleChange(part, event.currentTarget.value)}
  onKeyDown={(event) => handleKeyDown(part, event)}
  type="text"
  value={draft[part]}
/>
```

- [x] **Step 2: Filter and cap each draft before state update**

```tsx
const maxLength = part === "years" ? 4 : 2;
const digits = nextPartValue.replace(/\D/g, "").slice(0, maxLength);
const nextDraft = { ...draft, [part]: digits };
setDraft(nextDraft);
const parsed = parseDurationDraft(nextDraft);
if (parsed) onChange(workExperiencePayload(parsed));
```

- [x] **Step 3: Move focus only after an actual segment reaches its limit**

```tsx
if (digits.length === maxLength && part === "days") monthsRef.current?.focus();
if (digits.length === maxLength && part === "months") yearsRef.current?.focus();
```

`Space` calls the same next-segment helper. `Backspace` on an empty month or year focuses the prior segment. The years segment never advances.

- [x] **Step 4: Render a single visual border**

```css
.work-experience-editor { border: 1px solid #cbd5df; }
.work-experience-editor input { border: 0; background: transparent; outline: 0; }
.work-experience-editor:focus-within { border-color: #0f766e; }
```

- [x] **Step 5: Verify GREEN**

```powershell
node node_modules/vitest/vitest.mjs run src/features/cards/WorkExperienceEditor.test.tsx src/features/cards/FieldEditorControl.test.tsx --reporter=dot
```

Expected: PASS with deterministic 2/2/4 focus movement, numeric filtering, and stable blur behavior.

### Task 3: Verify consumers and release

**Files:**

- Modify: `frontend/src/features/cards/FilledCardLayout.test.tsx`
- Modify: `frontend/src/pages/PublicLinkEditPage.test.tsx`
- Modify: `PLANS.md`

**Interfaces:**

- Consumes: the shared date-mask `WorkExperienceEditor`.
- Produces: unchanged structured payloads for creation, saved-card, and public-link edits.

- [x] **Step 1: Update consumer assertions**

```tsx
const days = screen.getByRole("textbox", { name: "Стаж работы, дни" });
await user.type(days, "16");
expect(screen.getByRole("textbox", { name: "Стаж работы, месяцы" })).toHaveFocus();
```

Retain each test's assertion that the emitted save request carries `{ days: 16, months: 3, years: 9 }`.

- [x] **Step 2: Run focused verification**

```powershell
node node_modules/vitest/vitest.mjs run src/features/cards/WorkExperienceEditor.test.tsx src/features/cards/workExperience.test.ts src/features/cards/FieldEditorControl.test.tsx src/features/cards/FilledCardLayout.test.tsx src/pages/PublicLinkEditPage.test.tsx --reporter=dot
node node_modules/typescript/bin/tsc -b --noEmit
node node_modules/eslint/bin/eslint.js src/features/cards/WorkExperienceEditor.tsx src/features/cards/WorkExperienceEditor.test.tsx src/features/cards/FieldEditorControl.test.tsx src/features/cards/FilledCardLayout.test.tsx src/pages/PublicLinkEditPage.test.tsx
node node_modules/prettier/bin/prettier.cjs --check src/features/cards/WorkExperienceEditor.tsx src/features/cards/WorkExperienceEditor.test.tsx src/features/cards/FieldEditorControl.test.tsx src/features/cards/FilledCardLayout.test.tsx src/pages/PublicLinkEditPage.test.tsx src/styles/globals.css
node node_modules/vite/bin/vite.js build
```

Expected: all commands exit 0; only the existing Vite chunk-size advisory is permitted.

- [x] **Step 3: Commit, deploy, and live-check**

```powershell
git add PLANS.md frontend/src/features/cards/WorkExperienceEditor.tsx frontend/src/features/cards/WorkExperienceEditor.test.tsx frontend/src/features/cards/FieldEditorControl.test.tsx frontend/src/features/cards/FilledCardLayout.test.tsx frontend/src/pages/PublicLinkEditPage.test.tsx frontend/src/styles/globals.css
git commit -m "fix: use date mask for work experience"
git push origin main
powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1
powershell -ExecutionPolicy Bypass -File scripts/deploy-frontend.ps1
```

Reload the open public card without saving data. Verify one visual border, digits-only segments, day-to-month and month-to-year automatic focus movement, and no browser console errors.

Completed on 2026-07-15. The controlled date-mask implementation was released
in `8267f516`; its final one-border CSS correction was released in `6376c540`.
The deployed public card has one outer field border, transparent borderless
numeric segments, stable `days -> months -> years` space navigation, and no
browser console errors. The focused suite passed 80 tests, followed by
TypeScript, ESLint, Prettier, and the production Vite build.
