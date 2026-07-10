# Card Workspace Quality Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the selected-card workspace use exact backend block-instance UUIDs, expose only actor-authorized management UI, keep completion and list caches correct, and prevent card-scoped feedback leaking across tabs.

**Architecture:** `FilledCardLayout` will receive block-associated instances and build one shared primary layout whose fields resolve through a per-block instance map; repeatable surfaces continue to resolve one exact instance. `CardsWorkspace` will derive tabs, queries and actions from backend `card.can_manage`, use the shared invalidation helper after field saves, and scope mutation feedback to the card that started the operation.

**Tech Stack:** React 19, TypeScript, TanStack Query, Vitest/Testing Library, FastAPI contract tests, Ruff, mypy, Vite.

## Global Constraints

- Keep all user-facing copy Russian-first.
- Keep backend authorization authoritative; `card.can_manage` is a UI capability, not a replacement for API checks.
- Do not load global user, role or permission lists to decide card actions.
- Preserve read access to fields, attachments, documents, print preview and history.
- Keep `file_ref` in its attachment-aware single-field editor.
- Use exact `block_instance_id` UUIDs for reads and writes, including non-repeatable blocks.
- Do not modify production data, deploy, push or update Phase 8K documentation in this repair.

---

### Task 1: Exact block-instance targeting

**Files:**
- Modify: `frontend/src/features/cards/FilledCardLayout.tsx`
- Modify: `frontend/src/features/cards/FilledCardLayout.test.tsx`
- Modify: `frontend/src/features/cards/CardsWorkspace.tsx`
- Modify: `frontend/src/App.test.tsx`

**Interfaces:**
- Produces: `FilledCardBlockInstanceRead`, containing `block_id` plus the nested `CardBlockInstanceRead` data.
- Consumes: backend-shaped non-repeatable instances with UUID `block_instance_id` values.

- [ ] **Step 1: Write failing component and App tests**

```tsx
expect(screen.getByTestId("filled-field-first-name")).toHaveTextContent("Иван");
await user.click(screen.getByRole("button", { name: "Изменить блок ФИО" }));
expect(onEditBlock).toHaveBeenCalledWith("fio", "fio-instance-uuid");
expect(saveValues).toHaveBeenCalledWith({
  values: [{ field_id: "first-name", value: "Пётр", block_instance_id: "fio-instance-uuid" }],
});
```

- [ ] **Step 2: Run RED tests**

Run: `pnpm -C frontend test:run src/features/cards/FilledCardLayout.test.tsx src/App.test.tsx`

Expected: existing values render empty or save payload contains `block_instance_id: null`.

- [ ] **Step 3: Implement a per-block instance map on each surface**

```ts
export type FilledCardBlockInstanceRead = CardBlockInstanceRead & { block_id: string };

type FilledCardSurface = {
  key: string;
  surfaceInstanceId: string | null;
  blockInstanceIds: ReadonlyMap<string, string | null>;
  layout: CardTemplateLayoutRead;
};
```

Resolve each field and each block action through `blockInstanceIds.get(field.block_id)` or `blockInstanceIds.get(block.id)`, then pass that exact value to `blockEditor.open`, `onEditBlock`, `renderFileRefControl`, and save payloads.

- [ ] **Step 4: Run GREEN tests**

Run: `pnpm -C frontend test:run src/features/cards/FilledCardLayout.test.tsx src/App.test.tsx`

Expected: both files pass and UUID payload assertions succeed.

### Task 2: Actor-capability gating

**Files:**
- Modify: `frontend/src/features/cards/CardsWorkspace.tsx`
- Modify: `frontend/src/App.test.tsx`
- Test: `backend/tests/test_api_phase_1f.py`

**Interfaces:**
- Consumes: `CardRead.can_manage` computed by the backend for the card organization and registry.
- Produces: manage-only workspace tabs, queries and buttons only when `can_manage === true`.

- [ ] **Step 1: Extend the read-only App regression**

```tsx
expect(screen.queryByRole("tab", { name: "Публичные ссылки" })).not.toBeInTheDocument();
expect(screen.queryByRole("button", { name: "Скачать DOCX" })).not.toBeInTheDocument();
expect(screen.queryByRole("button", { name: /Активировать карточку/ })).not.toBeInTheDocument();
expect(publicLinksRequests()).toHaveLength(0);
expect(screen.getByRole("tab", { name: "Вложения" })).toBeInTheDocument();
expect(screen.getByRole("tab", { name: "Документы" })).toBeInTheDocument();
```

- [ ] **Step 2: Run the regression and confirm RED**

Run: `pnpm -C frontend test:run src/App.test.tsx -t "read-only actor"`

Expected: manage-only tabs/actions are present and the public-links request exists.

- [ ] **Step 3: Gate selected-card management UI and queries**

Filter the `links` tab, disable the header public-links query, omit lifecycle/print management buttons, and omit repeatable instance add/archive controls unless `card.can_manage` is true. Keep fields, print preview, attachments, documents and history readable.

- [ ] **Step 4: Run GREEN App and backend capability tests**

Run: `pnpm -C frontend test:run src/App.test.tsx -t "read-only actor"`

Run: `backend/.venv/Scripts/python.exe -m pytest backend/tests/test_api_phase_1f.py -k "card_read_contract or card_visibility" -q`

Expected: frontend passes; local backend contract passes and PostgreSQL test runs when `TEST_DATABASE_URL` is configured.

### Task 3: Completion and cache correctness

**Files:**
- Modify: `frontend/src/features/cards/CardsWorkspace.tsx`
- Modify: `frontend/src/App.test.tsx`

**Interfaces:**
- Produces: completion count for `required` and `required_on_publish` modes.
- Produces: block save invalidation through `invalidateCardQueries(queryClient, token, registryId, cardId)`.

- [ ] **Step 1: Write failing completion and list-cache tests**

```tsx
expect(within(actionPanel).getByText("Обязательные поля: 2 из 2 заполнено")).toBeInTheDocument();
await saveStatus("published");
await user.click(screen.getByRole("tab", { name: "Список карточек" }));
expect(screen.getByText("Статус: published")).toBeInTheDocument();
```

- [ ] **Step 2: Run RED tests**

Run: `pnpm -C frontend test:run src/App.test.tsx -t "completion|list display"`

Expected: `required_on_publish` is not counted and the list retains its pre-save value.

- [ ] **Step 3: Implement minimal completion and invalidation changes**

Treat both required modes as completion-required and replace the two narrow invalidations in `saveBlockValues` with the shared `invalidateCardQueries` call.

- [ ] **Step 4: Run GREEN tests**

Run: `pnpm -C frontend test:run src/App.test.tsx -t "completion|list display"`

Expected: both regressions pass.

### Task 4: Card-scoped async feedback

**Files:**
- Modify: `frontend/src/features/cards/CardsWorkspace.tsx`
- Modify: `frontend/src/App.test.tsx`

**Interfaces:**
- Produces: card switch cleanup for local feedback, dialogs and mutation state.
- Produces: late-result guards keyed by the card ID captured by each mutation.

- [ ] **Step 1: Write a failing delayed-response switch test**

```tsx
startDelayedPrintDownloadFor("card-a");
await openCard("card-b");
resolveDelayedDownload();
expect(screen.queryByText("DOCX печатной формы скачан")).not.toBeInTheDocument();
expect(screen.queryByRole("alert")).not.toHaveTextContent("card-a");
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `pnpm -C frontend test:run src/App.test.tsx -t "late card mutation feedback"`

Expected: the old card success appears on the newly selected card.

- [ ] **Step 3: Scope mutation results and simplify editor state**

Track the current card ID in a ref, return the originating card ID from async mutation functions, ignore late feedback for a different card, clear local messages/dialogs and reset card mutations on switch, and replace `CardEditorPanelState` with the single live `isDirty` boolean.

- [ ] **Step 4: Run GREEN tests**

Run: `pnpm -C frontend test:run src/App.test.tsx -t "late card mutation feedback"`

Expected: no old-card feedback remains after the switch.

### Task 5: Verification and follow-up commit

**Files:**
- Verify: all modified frontend/backend files

- [ ] **Step 1: Run focused tests**

```powershell
pnpm -C frontend test:run src/features/cards/FilledCardLayout.test.tsx src/features/cardLayout/CardLayoutRenderer.test.tsx src/App.test.tsx
backend/.venv/Scripts/python.exe -m pytest backend/tests/test_api_phase_1f.py -q
```

- [ ] **Step 2: Run the full frontend and static gates**

```powershell
pnpm -C frontend test:run
powershell -ExecutionPolicy Bypass -File scripts/typecheck.ps1
powershell -ExecutionPolicy Bypass -File scripts/lint.ps1
powershell -ExecutionPolicy Bypass -File scripts/format.ps1 -Check
pnpm -C frontend build
git diff --check
```

- [ ] **Step 3: Commit the scoped repair**

```powershell
git add docs/superpowers/plans/2026-07-10-card-workspace-quality-repair.md frontend/src/features/cards/FilledCardLayout.tsx frontend/src/features/cards/FilledCardLayout.test.tsx frontend/src/features/cards/CardsWorkspace.tsx frontend/src/App.test.tsx
git commit -m "Repair card workspace instance targeting"
```
