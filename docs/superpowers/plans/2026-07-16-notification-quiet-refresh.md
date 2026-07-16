# Quiet Notification Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the card notification switch into the basic-card header and refresh the bell every ten seconds without disturbing card editing or focus.

**Architecture:** Extend the existing `CardBaseBlockSurface` with an optional header action, then pass the already-created subscription toggle through the selected-card workspace. Keep the notification query mounted independently and change only its TanStack Query polling configuration; background refetches update notification data only.

**Tech Stack:** React, TypeScript, TanStack Query, Vitest, existing global CSS.

## Global Constraints

- Visible copy is Russian-first.
- The card subscription control remains available to every readable selected card.
- Polling is exactly 10 seconds; no websocket, page reload, or external delivery is added.
- Background notification refetches must not remount card fields, reset local drafts, or move focus.
- No raw audit data is interpreted in the frontend.

---

### Task 1: Place the card subscription action in the basic-block header

**Files:**
- Modify: `frontend/src/features/cards/CardBaseBlockSurface.tsx`
- Modify: `frontend/src/features/cards/CardsWorkspace.tsx`
- Modify: `frontend/src/features/cards/CardsWorkspace.test.tsx`
- Modify: `frontend/src/styles/globals.css`

**Interfaces:**
- `CardBaseBlockSurfaceProps` gains `headerAction?: ReactNode`.
- `CardsWorkspace` passes `<CardChangeNotificationToggle cardId={card.id} token={token} />` only for the selected readable card.

- [ ] **Step 1: Write failing placement tests**

  Add a workspace assertion that the button `Уведомлять об изменениях` is inside the element with `#card-base-block .card-base-block-header`, and assert the former `.card-change-notification-actions` wrapper is absent.

- [ ] **Step 2: Run the focused test to verify RED**

  Run: `pnpm -C frontend exec vitest run src/features/cards/CardsWorkspace.test.tsx`

  Expected: FAIL because the switch is rendered outside the base-block header.

- [ ] **Step 3: Add the minimal header-action slot and move the control**

  ```tsx
  export type CardBaseBlockSurfaceProps = {
    // existing props
    headerAction?: ReactNode;
  };

  <header className="card-base-block-header">
    <div>
      <strong>Базовый блок</strong>
      <small>{modeDescriptions[mode]}</small>
    </div>
    {headerAction ? <div className="card-base-block-header-actions">{headerAction}</div> : null}
  </header>
  ```

  In `CardsWorkspace`, remove the standalone action wrapper and pass the existing toggle as `headerAction` to the selected card's `CardBaseBlockSurface`. Add compact flex alignment styles that preserve the existing mobile header stack.

- [ ] **Step 4: Run the focused test to verify GREEN**

  Run: `pnpm -C frontend exec vitest run src/features/cards/CardsWorkspace.test.tsx`

  Expected: PASS, including readable non-manager and presentation-failure coverage already present for the toggle.

- [ ] **Step 5: Commit**

  ```powershell
  git add frontend/src/features/cards/CardBaseBlockSurface.tsx frontend/src/features/cards/CardsWorkspace.tsx frontend/src/features/cards/CardsWorkspace.test.tsx frontend/src/styles/globals.css
  git commit -m "fix: place card notifications in base header"
  ```

### Task 2: Poll the notification inbox quietly every ten seconds

**Files:**
- Modify: `frontend/src/features/notifications/CardChangeNotificationBell.tsx`
- Modify: `frontend/src/features/notifications/CardChangeNotificationBell.test.tsx`

**Interfaces:**
- The existing inbox `useQuery` retains `['card-change-notifications', token]`, now with `refetchInterval: 10_000` and `refetchOnWindowFocus: false`.

- [ ] **Step 1: Write failing query-options and focus-preservation tests**

  Use fake timers to assert a second notification request starts after 10,000 ms, not 60,000 ms. Render a focused input outside the bell, advance the interval and resolve the notification query, then assert `document.activeElement` remains that input. Assert a window-focus event does not trigger another notification request.

- [ ] **Step 2: Run the focused test to verify RED**

  Run: `pnpm -C frontend exec vitest run src/features/notifications/CardChangeNotificationBell.test.tsx`

  Expected: FAIL because the existing interval is 60,000 ms and focus-window refetch remains enabled.

- [ ] **Step 3: Change only query refresh configuration**

  ```tsx
  const inboxQuery = useQuery({
    queryKey,
    queryFn: () => listCardChangeNotifications(token),
    enabled: Boolean(token),
    refetchInterval: 10_000,
    refetchOnWindowFocus: false,
    staleTime: 15_000,
  });
  ```

  Do not introduce loading state during `isFetching`, do not set card state from the query, and do not change `open`, the selected card, or editor components on refetch.

- [ ] **Step 4: Run the focused test to verify GREEN**

  Run: `pnpm -C frontend exec vitest run src/features/notifications/CardChangeNotificationBell.test.tsx`

  Expected: PASS with ten-second polling, no focus-window refetch, and preserved external input focus.

- [ ] **Step 5: Run frontend checks and commit**

  ```powershell
  pnpm -C frontend exec tsc --noEmit
  pnpm -C frontend exec eslint src/features/notifications/CardChangeNotificationBell.tsx src/features/cards/CardBaseBlockSurface.tsx src/features/cards/CardsWorkspace.tsx
  pnpm -C frontend exec prettier --check src/features/notifications/CardChangeNotificationBell.tsx src/features/cards/CardBaseBlockSurface.tsx src/features/cards/CardsWorkspace.tsx
  git add frontend/src/features/notifications/CardChangeNotificationBell.tsx frontend/src/features/notifications/CardChangeNotificationBell.test.tsx
  git commit -m "fix: refresh notifications quietly"
  ```
