# Card Draft Guidance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Guide users to save the initial draft before trying to fill template fields.

**Architecture:** `SingleStageCardCreation` owns the field-attempt state and renders a safe overlay above disabled controls. `CardDraftActionRail` receives only presentation props for ready and attention states. CSS supplies locked color states, animations, and a reduced-motion fallback.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, CSS.

## Global Constraints

- Keep the card creation API and draft-save operation unchanged.
- Use Russian copy and preserve keyboard access.
- Do not create a card while testing field guidance.

---

### Task 1: Lock interaction and save guidance

**Files:**
- Modify: `frontend/src/features/cards/CardsWorkspace.test.tsx`
- Modify: `frontend/src/features/cards/SingleStageCardCreation.tsx`
- Modify: `frontend/src/features/cards/CardDraftActionRail.tsx`

**Interfaces:**
- Produces: `CardDraftActionRail` props `attention?: boolean` and
  `setupMessage?: string`.
- Produces: a keyboard-accessible `button` with class
  `single-stage-card-creation-field-lock` for each disabled preview field.

- [ ] **Step 1: Write the failing interaction test**

```tsx
fireEvent.click(screen.getByRole("button", { name: "Заполнить поле Фамилия" }));
expect(screen.getByText("Сначала сохраните черновик, чтобы заполнить это поле.")).toBeInTheDocument();
expect(screen.getByLabelText("Фамилия").closest(".single-stage-card-creation-field")).toHaveClass(
  "is-locked-attention",
);
expect(screen.getByRole("button", { name: "Сохранить черновик" })).toHaveClass("is-attention");
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npm run test:run -- CardsWorkspace.test.tsx`

Expected: failure because the field lock action and guidance text do not exist.

- [ ] **Step 3: Implement the minimum state and presentation props**

```tsx
const [lockedFieldId, setLockedFieldId] = useState<string | null>(null);

function explainDraftRequirement(fieldId: string) {
  setLockedFieldId(fieldId);
}

<button
  type="button"
  className="single-stage-card-creation-field-lock"
  aria-label={`Заполнить поле ${field.label}`}
  onClick={() => explainDraftRequirement(field.field_id)}
/>
```

Use `setupComplete` to show `Базовый блок заполнен. Сохраните черновик, чтобы перейти к полям шаблона.` in the action rail.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `npm run test:run -- CardsWorkspace.test.tsx`

Expected: all focused tests pass.

### Task 2: Locked-field and save-button visual states

**Files:**
- Modify: `frontend/src/features/cards/CardsWorkspace.test.tsx`
- Modify: `frontend/src/styles/globals.css`

**Interfaces:**
- Consumes: `is-locked`, `is-locked-attention`, `card-draft-save-button`,
  `is-ready`, and `is-attention` classes rendered by Task 1.

- [ ] **Step 1: Write the failing CSS-contract assertions**

```tsx
expect(globalStyles).toContain(".single-stage-card-creation-field.is-locked {");
expect(globalStyles).toContain(".single-stage-card-creation-field.is-locked-attention {");
expect(globalStyles).toContain("@keyframes card-draft-save-pulse {");
expect(globalStyles).toContain("@media (prefers-reduced-motion: reduce) {");
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npm run test:run -- CardsWorkspace.test.tsx`

Expected: failure because the locked state and animation rules do not exist.

- [ ] **Step 3: Add the minimum visual rules**

```css
.single-stage-card-creation-field.is-locked { /* muted non-editable treatment */ }
.single-stage-card-creation-field.is-locked-attention { animation: card-draft-field-shake 360ms ease-in-out; }
.card-draft-save-button.is-ready { animation: card-draft-save-pulse 2s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) { /* disable animations */ }
```

- [ ] **Step 4: Run focused tests, lint, typecheck, and build**

Run: `npm run test:run -- CardsWorkspace.test.tsx; npm run lint; npm run typecheck; npm run build`

Expected: tests, typecheck, and build pass; ESLint may retain only the existing unrelated `FilledCardLayout.tsx` hook-dependency warning.

### Task 3: Release verification

**Files:**
- Modify: `PLANS.md`

- [ ] **Step 1: Record checks and deployment evidence**

Document the focused test, build, deploy, live locked-field guidance, and the fact that no test card was saved.

- [ ] **Step 2: Commit, push, deploy, and inspect the published creation page**

Run: `powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1; powershell -ExecutionPolicy Bypass -File scripts/deploy-frontend.ps1`

Expected: server checks, healthcheck, and frontend smoke check pass. The browser confirms the base-block instruction, disabled field guidance, field shake, and draft-save animation without clicking the save action.
