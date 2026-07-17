# Notification Popover and Picker Layering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct notification-panel dismissal, stacking, and scrolling, and keep open searchable-choice lists above the card canvas.

**Architecture:** `CardChangeNotificationBell` owns dismissal through a shell ref and document-level pointer/keyboard listeners. CSS keeps the popover header outside a bounded scroll list and assigns overlay layers above ordinary workspace content. `SearchableChoicePicker` keeps its current absolute popup but raises the active picker and popup through explicit stacking rules.

**Tech Stack:** React, TypeScript, Vitest, Testing Library, CSS.

## Global Constraints

- Keep the existing notification API/polling and searchable-picker DOM ownership.
- Do not add a portal, database change, or API change.
- Preserve Russian-first UI text and keyboard semantics.
- Do not modify unrelated `.playwright-cli/` files.

---

### Task 1: Notification popover behaviour and layout

**Files:**
- Modify: `frontend/src/features/notifications/CardChangeNotificationBell.tsx`
- Modify: `frontend/src/features/notifications/CardChangeNotificationBell.test.tsx`
- Modify: `frontend/src/styles/globals.css`

**Interfaces:**
- Consumes: notification bell `open` state and existing `notification-bell-shell` DOM wrapper.
- Produces: outside-pointer and `Escape` dismissal; a popover header above a scrollable `.notification-list`.

- [ ] **Step 1: Write failing component tests**

```tsx
it("closes on pointer interaction outside the notification shell", async () => {
  await user.click(screen.getByRole("button", { name: /Уведомления/ }));
  await user.pointer({ target: document.body, keys: "[MouseLeft]" });
  expect(screen.queryByRole("dialog", { name: "Уведомления" })).not.toBeInTheDocument();
});

it("keeps the panel open for an interaction inside the panel and closes on Escape", async () => {
  await user.click(screen.getByRole("button", { name: /Уведомления/ }));
  await user.click(screen.getByRole("button", { name: "Отметить все прочитанными" }));
  expect(screen.getByRole("dialog", { name: "Уведомления" })).toBeInTheDocument();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog", { name: "Уведомления" })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the notification test to verify RED**

Run: `pnpm -C frontend vitest run src/features/notifications/CardChangeNotificationBell.test.tsx`

Expected: FAIL because outside pointer and `Escape` do not close the panel.

- [ ] **Step 3: Implement the smallest ownership and CSS changes**

```tsx
const shellRef = useRef<HTMLDivElement>(null);
useEffect(() => {
  if (!open) return;
  const dismissOutside = (event: PointerEvent) => {
    if (!shellRef.current?.contains(event.target as Node)) setOpen(false);
  };
  const dismissEscape = (event: KeyboardEvent) => {
    if (event.key === "Escape") setOpen(false);
  };
  document.addEventListener("pointerdown", dismissOutside);
  document.addEventListener("keydown", dismissEscape);
  return () => { document.removeEventListener("pointerdown", dismissOutside); document.removeEventListener("keydown", dismissEscape); };
}, [open]);
```

Keep the popover a grid with `grid-template-rows: auto minmax(0, 1fr)`, move its overflow to `.notification-list`, and use a workspace-overlay z-index above ordinary list controls.

- [ ] **Step 4: Run notification test to verify GREEN**

Run: `pnpm -C frontend vitest run src/features/notifications/CardChangeNotificationBell.test.tsx`

Expected: PASS.

### Task 2: Active searchable-choice picker layer

**Files:**
- Modify: `frontend/src/features/cards/SearchableChoicePicker.test.tsx`
- Modify: `frontend/src/styles/globals.css`

**Interfaces:**
- Consumes: `.searchable-choice-picker.is-open` rendered by the shared picker.
- Produces: open popups visually above adjacent card blocks while remaining absolutely positioned.

- [ ] **Step 1: Write a failing style regression assertion**

```tsx
it("marks an open picker so its popup can layer over neighbouring card content", async () => {
  await user.click(screen.getByRole("combobox", { name: "Поле" }));
  expect(document.querySelector(".searchable-choice-picker.is-open")).toBeTruthy();
});
```

Add a CSS-source assertion in the existing frontend style test if one exists; otherwise the component test documents the required active state while manual browser proof verifies visual stacking.

- [ ] **Step 2: Run the picker test to verify RED**

Run: `pnpm -C frontend vitest run src/features/cards/SearchableChoicePicker.test.tsx`

Expected: FAIL only if the test captures an absent active-layer contract; otherwise retain the existing rendered-state test and add the CSS regression before implementation.

- [ ] **Step 3: Implement the smallest stacking rule**

```css
.searchable-choice-picker { position: relative; z-index: 0; }
.searchable-choice-picker.is-open { z-index: 30; }
.searchable-choice-picker-popup { z-index: 1; }
```

Do not alter grid dimensions, popup positioning, or data flow.

- [ ] **Step 4: Run the picker test to verify GREEN**

Run: `pnpm -C frontend vitest run src/features/cards/SearchableChoicePicker.test.tsx`

Expected: PASS.

### Task 3: Verification and deployment

**Files:**
- Modify: `PLANS.md`
- Regenerate: `docs/PROJECT_TREE.md` if required by the project-map gate

- [ ] **Step 1: Run focused tests and frontend checks**

Run: `pnpm -C frontend vitest run src/features/notifications/CardChangeNotificationBell.test.tsx src/features/cards/SearchableChoicePicker.test.tsx; pnpm -C frontend lint; pnpm -C frontend typecheck; pnpm -C frontend build`

Expected: all commands pass; existing lint warnings may remain warnings only.

- [ ] **Step 2: Run local project gate**

Run: `powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote`

Expected: backend and frontend suites pass; regenerate `docs/PROJECT_TREE.md` only if the project-map check reports it stale.

- [ ] **Step 3: Record release proof, commit, and deploy**

Update `PLANS.md` with the tests, browser proof, and served frontend asset. Commit scoped files, push `main`, run `scripts/deploy-frontend.ps1`, then verify the notification panel and two pickers in the browser.
