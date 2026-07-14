# Card Creation Scroll Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the card-creation workspace show the application background while keeping desktop block navigation visible and scroll-linked.

**Architecture:** A CSS selector scoped to the outer panel that directly contains `single-stage-card-creation` removes only that panel's white surface and scroll clipping. Existing inner card panels and `CardPresentationShell` are reused unchanged. `CardBlockNavigator` retains intersection state and selects the entry nearest the reading line, so callback order cannot leave a previous block highlighted. The existing responsive breakpoint continues to make navigation static on mobile.

**Tech Stack:** React 18, TypeScript, Vitest, Testing Library, CSS, Vite.

## Global Constraints

- Keep the UI Russian-first and schema-driven; do not alter API, lifecycle, or access behavior.
- Scope CSS to `data-panel` that directly contains `single-stage-card-creation`; do not restyle other panels.
- Keep desktop navigation sticky and mobile navigation static above the fields at `900px` and below.
- Preserve the existing base and template-block cards and their completion states.

---

### Task 1: Scope the transparent creation surface and sticky navigation fix

**Files:**
- Modify: `frontend/src/features/cards/CardsWorkspace.test.tsx:115-122`
- Modify: `frontend/src/styles/globals.css:492-498`
- Modify: `frontend/src/features/cards/CardBlockNavigator.tsx:48-72`
- Modify: `frontend/src/features/cards/CardBlockNavigator.test.tsx:26-81`
- Modify: `PLANS.md`

**Interfaces:**
- Consumes: the outer `<section className="data-panel">` rendered by `Panel` around `SingleStageCardCreation` and the child selector `.single-stage-card-creation`.
- Produces: an outer creation surface with `background: transparent`, no visible border, and `overflow: visible`; existing `.card-block-navigator { position: sticky; }` can use page scrolling on desktop, while its current item follows the block nearest the reading line.

- [ ] **Step 1: Write the failing regression assertion**

In `CardsWorkspace.test.tsx`, extend the existing CSS-source test with exact assertions:

```ts
expect(globalStyles).toContain(".data-panel:has(> .single-stage-card-creation) {");
expect(globalStyles).toContain(
  ".data-panel:has(> .single-stage-card-creation) {\n  overflow: visible;\n  border-color: transparent;\n  background: transparent;",
);
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```powershell
pnpm -C frontend test:run src/features/cards/CardsWorkspace.test.tsx
```

Expected: FAIL because the creation-only outer panel selector is absent from `globals.css`.

- [ ] **Step 3: Add the minimal scoped CSS**

Immediately after the general `.data-panel` overflow rules in `frontend/src/styles/globals.css`, add:

```css
.data-panel:has(> .single-stage-card-creation) {
  overflow: visible;
  border-color: transparent;
  background: transparent;
}
```

Keep the mobile media query unchanged: its existing `sticky` desktop and `static` mobile behavior is retained. In `CardBlockNavigator.tsx`, retain the latest observation for each anchor and choose the intersecting entry whose `boundingClientRect.top` is nearest `window.innerHeight * 0.15`. Add a focused test where two neighboring entries intersect together and the later, nearer entry receives `aria-current="location"`. Do not modify `SingleStageCardCreation.tsx` or backend code.

- [ ] **Step 4: Run focused and frontend checks**

Run:

```powershell
pnpm -C frontend test:run src/features/cards/CardsWorkspace.test.tsx
pnpm -C frontend lint
pnpm -C frontend typecheck
pnpm -C frontend build
```

Expected: the focused suite passes; lint/typecheck/build have no new errors. Record any already-known advisory separately.

- [ ] **Step 5: Update the release plan and commit**

Add a concise current checkpoint to `PLANS.md` describing the creation-only transparent surface, `overflow: visible` sticky fix, and the commands executed. Then commit the scoped change:

```powershell
git add frontend/src/features/cards/CardsWorkspace.test.tsx frontend/src/styles/globals.css PLANS.md
git commit -m "fix: keep card creation navigation sticky"
```

### Task 2: Publish and visually verify the rendered flow

**Files:**
- Modify: `PLANS.md`

**Interfaces:**
- Consumes: the committed frontend CSS from Task 1 and the existing deployment scripts.
- Produces: deployed frontend assets at `https://regbase.sosnadmin.local/` and browser evidence for desktop and mobile creation layouts.

- [ ] **Step 1: Publish the verified commit**

Run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/push-git.ps1 -Message "fix: keep card creation navigation sticky"
powershell -ExecutionPolicy Bypass -File scripts/deploy-frontend.ps1
powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1
```

Expected: `main` is pushed; frontend artifact is uploaded; server checkout and service checks succeed.

- [ ] **Step 2: Verify desktop browser behavior**

Using the in-app Browser at `https://regbase.sosnadmin.local/`, open `Карточки → Создать карточку`, select an accessible organization and template if not already selected, then:

```text
scroll through at least two template blocks → navigator remains visible → current navigator item changes
```

Capture a fresh DOM snapshot, console log check, and desktop screenshot. Do not type into a field or create a card.

- [ ] **Step 3: Verify mobile browser behavior**

Set a narrow viewport, reload the same creation view, and verify:

```text
navigator is rendered above fields → navigator is not sticky → fields remain readable without horizontal overflow
```

Capture a fresh snapshot and screenshot. Do not create a card.

- [ ] **Step 4: Record live evidence and commit documentation**

Append the deployment and Browser proof to `PLANS.md`, including the URL, desktop/mobile outcome, and any non-blocking advisory. Then commit:

```powershell
git add PLANS.md
git commit -m "docs: record card creation scroll surface release"
git push origin main
```
