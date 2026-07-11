# Registry Advanced Navigation and Block Ordering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplify the registry workspace navigation, remove duplicate editor chrome, and replace block dragging with collision-free up/down ordering controls.

**Architecture:** Split registry navigation into primary and advanced tab state while preserving the existing panel components and queries. Add a pure block-ordering utility, thread explicit ordering callbacks through the existing card-layout renderer, and store layout history as whole-form snapshots so one reorder saves and undoes atomically.

**Tech Stack:** React 19, TypeScript, TanStack Query, Vitest, Testing Library, Vite, existing Registry Engine REST API and PowerShell release scripts.

## Global Constraints

- Primary registry tabs are exactly `Схема карточки`, `Импорт и экспорт`, and `Расширенное`.
- Advanced registry tabs are exactly `Реестры`, `Справочники`, and `Отчёты`.
- `Схема карточки` is the default primary tab; `Реестры` is the default advanced tab.
- No backend schema, database migration, permission, or API contract change.
- Block order actions preserve `column`, `column_span`, and `row_span`, clamp only out-of-grid columns, and never create overlap.
- Field dragging/resizing and block resizing keep their current behavior.
- The visible redo action is removed; one-step undo remains.
- User-facing copy is Russian-first.
- Work stays on `main`; do not create a feature branch or worktree.

---

## File Structure

- Create `frontend/src/features/cardLayout/blockOrdering.ts`: pure row-major sorting and collision-free vertical block repacking.
- Create `frontend/src/features/cardLayout/blockOrdering.test.ts`: boundary, mixed-span, dimension-preservation, and collision tests.
- Modify `frontend/src/features/registry/RegistriesAndSchema.tsx`: primary/advanced tabs and removal of the duplicate outer editor header.
- Modify `frontend/src/app/uiText.ts`: Russian labels for advanced navigation.
- Modify `frontend/src/App.test.tsx`: registry navigation and duplicate-header integration coverage.
- Modify `frontend/tests/e2e/smoke.spec.ts`: reach moved panels through `Расширенное`.
- Modify `frontend/src/features/cardLayout/CardWebLayoutCanvas.tsx`: expose and distribute block-order callbacks and boundary state.
- Modify `frontend/src/features/cardLayout/CardBlockLayoutNode.tsx`: visible up/down controls and resize-only block geometry affordances.
- Modify `frontend/src/features/cardLayout/CardLayoutRenderer.test.tsx`: arrow, boundary, resize, and no-drag regressions.
- Modify `frontend/src/features/registry/print/CardLayoutStudio.tsx`: snapshot history, atomic reorder save/undo, and toolbar cleanup.
- Modify `frontend/src/features/registry/CardPrintTemplateEditor.test.tsx`: studio save/history/header/toolbar integration tests.
- Modify `frontend/src/styles/globals.css`: compact order controls, nested-tab spacing, and removal of obsolete duplicate-header styles.
- Modify `PLANS.md`: implementation, gate, release, and live proof.
- Regenerate `docs/PROJECT_TREE.md` after adding the utility and test.

---

### Task 1: Primary and Advanced Registry Navigation

**Files:**
- Modify: `frontend/src/app/uiText.ts:150-205`
- Modify: `frontend/src/features/registry/RegistriesAndSchema.tsx:84-92, 120-250`
- Test: `frontend/src/App.test.tsx:3600-3675`
- Test: `frontend/tests/e2e/smoke.spec.ts:1015-1030, 2295-2310`

**Interfaces:**
- Produces: `RegistryPrimaryTab = "schema" | "importExport" | "advanced"`.
- Produces: `RegistryAdvancedTab = "registries" | "references" | "reports"`.
- Preserves: existing `Panel`, `ImportExportPanel`, `ReportsPanel`, reference-list, registry, and schema rendering paths.

- [ ] **Step 1: Write failing primary/advanced navigation tests**

Add assertions scoped to each tab list:

```tsx
const primaryTabs = screen.getByRole("tablist", { name: "Разделы настройки реестра" });
expect(within(primaryTabs).getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
  "Схема карточки",
  "Импорт и экспорт",
  "Расширенное",
]);
expect(within(primaryTabs).getByRole("tab", { name: "Схема карточки" })).toHaveAttribute(
  "aria-selected",
  "true",
);

await user.click(within(primaryTabs).getByRole("tab", { name: "Расширенное" }));
const advancedTabs = screen.getByRole("tablist", {
  name: "Расширенные разделы настройки реестра",
});
expect(within(advancedTabs).getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
  "Реестры",
  "Справочники",
  "Отчёты",
]);
```

Also verify that selecting `Справочники`, leaving `Расширенное`, and returning
restores `Справочники` as the selected advanced tab.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
pnpm -C frontend test:run -- src/App.test.tsx -t "registry workspace navigation"
```

Expected: FAIL because `Расширенное` and its secondary tab list do not exist.

- [ ] **Step 3: Add labels and separate navigation state**

Add to `uiText`:

```ts
advanced: "Расширенное",
advancedRegistrySettings: "Расширенные разделы настройки реестра",
```

Replace the current combined tab type and array:

```ts
type RegistryPrimaryTab = "schema" | "importExport" | "advanced";
type RegistryAdvancedTab = "registries" | "references" | "reports";

const registryPrimaryTabs: { id: RegistryPrimaryTab; label: string }[] = [
  { id: "schema", label: uiText.cardSchema },
  { id: "importExport", label: uiText.importExport },
  { id: "advanced", label: uiText.advanced },
];

const registryAdvancedTabs: { id: RegistryAdvancedTab; label: string }[] = [
  { id: "registries", label: uiText.registries },
  { id: "references", label: uiText.referenceLists },
  { id: "reports", label: uiText.reports },
];
```

Initialize state and visibility flags:

```ts
const [activeTab, setActiveTab] = useState<RegistryPrimaryTab>("schema");
const [advancedTab, setAdvancedTab] = useState<RegistryAdvancedTab>("registries");
const showRegistries = activeTab === "advanced" && advancedTab === "registries";
const showReferences = activeTab === "advanced" && advancedTab === "references";
const showReports = activeTab === "advanced" && advancedTab === "reports";
```

Render the advanced tab list only inside the advanced primary panel:

```tsx
<WorkspaceTabs
  tabs={registryPrimaryTabs}
  activeTab={activeTab}
  ariaLabel={uiText.registrySettingsSections}
  onChange={setActiveTab}
/>
{activeTab === "advanced" ? (
  <WorkspaceTabs
    tabs={registryAdvancedTabs}
    activeTab={advancedTab}
    ariaLabel={uiText.advancedRegistrySettings}
    onChange={setAdvancedTab}
  />
) : null}
```

Replace the existing `activeTab === "registries" | "references" | "reports"`
render guards with the three visibility flags. Leave `schema` and
`importExport` guards on the primary state.

- [ ] **Step 4: Update E2E navigation paths**

Before every existing E2E click on a moved tab, enter the advanced panel:

```ts
await page.getByRole("tab", { name: "Расширенное" }).click();
await page.getByRole("tab", { name: "Справочники" }).click();
```

Use the equivalent sequence for `Реестры` and `Отчёты`; do not change the
existing assertions inside those panels.

- [ ] **Step 5: Run focused navigation tests and verify GREEN**

Run:

```powershell
pnpm -C frontend test:run -- src/App.test.tsx
pnpm -C frontend typecheck
```

Expected: App tests pass and TypeScript reports no errors.

- [ ] **Step 6: Commit the navigation task**

```powershell
git add frontend/src/app/uiText.ts frontend/src/features/registry/RegistriesAndSchema.tsx frontend/src/App.test.tsx frontend/tests/e2e/smoke.spec.ts
git commit -m "Group advanced registry sections"
```

---

### Task 2: Pure Collision-Free Block Ordering

**Files:**
- Create: `frontend/src/features/cardLayout/blockOrdering.ts`
- Create: `frontend/src/features/cardLayout/blockOrdering.test.ts`

**Interfaces:**
- Produces: `BlockOrderDirection = "up" | "down"`.
- Produces: `reorderBlockSections(layout, sectionId, direction): CardTemplateFormLayoutRead | null`.
- Returns `null` when the section is missing or already at the requested boundary.

- [ ] **Step 1: Write failing utility tests**

Cover full-width and mixed-span layouts:

```ts
const moved = reorderBlockSections(layout, "section-b", "up");
expect(moved?.sections.map((section) => section.id)).toEqual([
  "section-b",
  "section-a",
  "section-c",
]);
expect(moved?.sections.map(({ id, column_span, row_span }) => ({ id, column_span, row_span })))
  .toEqual([
    { id: "section-b", column_span: 6, row_span: 2 },
    { id: "section-a", column_span: 12, row_span: 1 },
    { id: "section-c", column_span: 3, row_span: 1 },
  ]);
expect(moved?.sections.map((section) => section.row)).toEqual([1, 3, 4]);
```

Add pairwise `rectsOverlap` assertions, boundary `null` assertions, stable
row/column/id sorting, and a column clamp case where
`column + column_span - 1 > layout.columns`.

- [ ] **Step 2: Run utility tests and verify RED**

Run:

```powershell
pnpm -C frontend test:run -- src/features/cardLayout/blockOrdering.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the pure ordering utility**

```ts
import type {
  CardTemplateFormLayoutRead,
  CardTemplateFormLayoutSectionRead,
} from "@/api/types";

export type BlockOrderDirection = "up" | "down";

export function reorderBlockSections(
  layout: CardTemplateFormLayoutRead,
  sectionId: string,
  direction: BlockOrderDirection,
): CardTemplateFormLayoutRead | null {
  const ordered = [...layout.sections].sort(compareSections);
  const index = ordered.findIndex((section) => section.id === sectionId);
  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || targetIndex < 0 || targetIndex >= ordered.length) return null;

  [ordered[index], ordered[targetIndex]] = [ordered[targetIndex], ordered[index]];
  let nextRow = 1;
  const sections = ordered.map((section) => {
    const column = Math.min(
      Math.max(1, section.column),
      Math.max(1, layout.columns - section.column_span + 1),
    );
    const placed = { ...section, row: nextRow, column };
    nextRow += section.row_span;
    return placed;
  });
  return { ...layout, sections };
}

function compareSections(
  left: CardTemplateFormLayoutSectionRead,
  right: CardTemplateFormLayoutSectionRead,
) {
  return left.row - right.row || left.column - right.column || left.id.localeCompare(right.id);
}
```

- [ ] **Step 4: Run utility tests and verify GREEN**

Run:

```powershell
pnpm -C frontend test:run -- src/features/cardLayout/blockOrdering.test.ts
```

Expected: all ordering tests pass.

- [ ] **Step 5: Commit the ordering utility**

```powershell
git add frontend/src/features/cardLayout/blockOrdering.ts frontend/src/features/cardLayout/blockOrdering.test.ts
git commit -m "Add collision free block ordering"
```

---

### Task 3: Visible Block Order Controls

**Files:**
- Modify: `frontend/src/features/cardLayout/CardWebLayoutCanvas.tsx:25-75, 145-220`
- Modify: `frontend/src/features/cardLayout/CardBlockLayoutNode.tsx:20-55, 95-180, 260-325`
- Test: `frontend/src/features/cardLayout/CardLayoutRenderer.test.tsx:360-420, 1480-1585`

**Interfaces:**
- Consumes: `BlockOrderDirection` from `blockOrdering.ts`.
- Produces: `onMoveBlock?: (sectionId: string, direction: BlockOrderDirection) => void` on renderer/canvas props.
- Produces: `blockOrderingDisabled?: boolean` on renderer/canvas props.

- [ ] **Step 1: Write failing renderer tests**

Verify the rendered controls and callbacks:

```tsx
expect(screen.queryByRole("button", { name: "Переместить блок ФИО" })).not.toBeInTheDocument();
const up = screen.getByRole("button", { name: "Переместить блок ФИО вверх" });
const down = screen.getByRole("button", { name: "Переместить блок ФИО вниз" });
expect(up).toBeDisabled();
expect(down).toBeEnabled();
await user.click(down);
expect(onMoveBlock).toHaveBeenCalledWith("section-1", "down");
```

Add a three-block case proving middle buttons are both enabled, last-down is
disabled, `blockOrderingDisabled` disables every arrow, block resize remains,
and field move/resize controls still render.

- [ ] **Step 2: Run renderer tests and verify RED**

Run:

```powershell
pnpm -C frontend test:run -- src/features/cardLayout/CardLayoutRenderer.test.tsx
```

Expected: FAIL because arrow controls and the new props do not exist.

- [ ] **Step 3: Thread block-order props through the canvas**

Add props:

```ts
onMoveBlock?: (sectionId: string, direction: BlockOrderDirection) => void;
blockOrderingDisabled?: boolean;
```

When mapping `orderedSections`, pass index-derived boundaries:

```tsx
{orderedSections.map((section, index) => (
  <CardBlockLayoutNode
    // existing props
    onMoveBlock={onMoveBlock}
    canMoveBlockUp={index > 0}
    canMoveBlockDown={index < orderedSections.length - 1}
    blockOrderingDisabled={blockOrderingDisabled}
  />
))}
```

- [ ] **Step 4: Replace the block drag handle with arrows**

Add node props and render them beside `Изменить блок`:

```tsx
{onMoveBlock ? (
  <span className="card-layout-block-order-actions" aria-label={`Порядок блока ${block.title}`}>
    <button
      type="button"
      className="ghost-button card-layout-block-order-button"
      aria-label={`Переместить блок ${block.title} вверх`}
      disabled={blockOrderingDisabled || !canMoveBlockUp}
      onClick={() => onMoveBlock(section.id, "up")}
    >
      ↑
    </button>
    <button
      type="button"
      className="ghost-button card-layout-block-order-button"
      aria-label={`Переместить блок ${block.title} вниз`}
      disabled={blockOrderingDisabled || !canMoveBlockDown}
      onClick={() => onMoveBlock(section.id, "down")}
    >
      ↓
    </button>
  </span>
) : null}
```

Remove only the block `.card-layout-move-handle` from
`LayoutGeometryAffordances`. Keep its bottom-right resize handle and keep the
field affordance implementation unchanged.

- [ ] **Step 5: Run renderer tests and verify GREEN**

Run:

```powershell
pnpm -C frontend test:run -- src/features/cardLayout/CardLayoutRenderer.test.tsx
pnpm -C frontend typecheck
```

Expected: renderer tests and TypeScript pass.

- [ ] **Step 6: Commit the renderer task**

```powershell
git add frontend/src/features/cardLayout/CardWebLayoutCanvas.tsx frontend/src/features/cardLayout/CardBlockLayoutNode.tsx frontend/src/features/cardLayout/CardLayoutRenderer.test.tsx
git commit -m "Replace block dragging with order arrows"
```

---

### Task 4: Atomic Reorder History and Editor Chrome Cleanup

**Files:**
- Modify: `frontend/src/features/registry/print/CardLayoutStudio.tsx:85-180, 405-445, 945-1010, 1105-1130, 1320-1360`
- Modify: `frontend/src/features/registry/RegistriesAndSchema.tsx:676-705`
- Modify: `frontend/src/styles/globals.css:2814-2843` and card-layout action styles
- Test: `frontend/src/features/registry/CardPrintTemplateEditor.test.tsx:420-465, 1100-1150`
- Test: `frontend/src/App.test.tsx:2560-2600, 3640-3680`

**Interfaces:**
- Consumes: `reorderBlockSections` and `BlockOrderDirection`.
- Produces internally: `FormLayoutHistoryEntry = { before: CardTemplateFormLayoutRead; after: CardTemplateFormLayoutRead }`.
- Preserves: existing `saveNextFormLayout`, revision queue, conflict UI, and schema mutation queue.

- [ ] **Step 1: Write failing studio integration tests**

Add a mixed-height three-block fixture and verify:

```tsx
await user.click(screen.getByRole("button", { name: "Переместить блок ФИО вверх" }));
await waitFor(() => expect(api.formSavePayloads).toHaveLength(1));
expect(api.formSavePayloads[0].form_layout.sections.map((section) => section.id)).toEqual([
  "section-fio",
  "section-main",
  "section-extra",
]);
expect(hasSectionCollision(api.formSavePayloads[0].form_layout.sections)).toBe(false);

await user.click(screen.getByRole("button", { name: "Отменить изменение" }));
await waitFor(() => expect(api.formSavePayloads).toHaveLength(2));
expect(api.formSavePayloads[1].form_layout).toEqual(originalFormLayout);
expect(screen.queryByRole("button", { name: "Повторить изменение" })).not.toBeInTheDocument();
```

Also assert that the selected editor region has no
`.schema-template-editor-header`, the studio heading remains, and one visible
`Закрыть` action closes the editor.

- [ ] **Step 2: Run studio tests and verify RED**

Run:

```powershell
pnpm -C frontend test:run -- src/features/registry/CardPrintTemplateEditor.test.tsx src/App.test.tsx
```

Expected: FAIL on missing arrows, non-atomic history, duplicate header, and
visible redo.

- [ ] **Step 3: Convert geometry history to form-layout snapshots**

Replace command-only history with:

```ts
type FormLayoutHistoryEntry = {
  before: CardTemplateFormLayoutRead;
  after: CardTemplateFormLayoutRead;
};

type GeometryHistory = {
  undo: FormLayoutHistoryEntry[];
};
```

Record existing field/block resize commits atomically:

```ts
function recordFormLayoutChange(after: CardTemplateFormLayoutRead) {
  const before = draftLayoutRef.current.form_layout;
  if (JSON.stringify(before) === JSON.stringify(after)) return;
  updateGeometryHistory({ undo: [...geometryHistoryRef.current.undo, { before, after }] });
  void saveNextFormLayout(after);
}

function handleGeometryCommit(command: LayoutGeometryCommand) {
  recordFormLayoutChange(applyGeometryCommand(draftLayoutRef.current.form_layout, command));
}
```

Undo the complete snapshot:

```ts
function undoGeometryChange() {
  const entry = geometryHistoryRef.current.undo.at(-1);
  if (!entry || conflictActive.current || schemaWritesInFlight.current > 0) return;
  updateGeometryHistory({ undo: geometryHistoryRef.current.undo.slice(0, -1) });
  void saveNextFormLayout(entry.before);
}
```

Remove the redo state, `redoGeometryChange`, and the visible redo button.

- [ ] **Step 4: Connect block ordering to atomic save history**

```ts
function moveBlock(sectionId: string, direction: BlockOrderDirection) {
  if (busy || conflictActive.current) return;
  const next = reorderBlockSections(
    draftLayoutRef.current.form_layout,
    sectionId,
    direction,
  );
  if (next) recordFormLayoutChange(next);
}
```

Pass to the design renderer:

```tsx
<CardLayoutRenderer
  // existing props
  onMoveBlock={moveBlock}
  blockOrderingDisabled={busy || hasFormConflict}
  onGeometryCommit={handleGeometryCommit}
/>
```

- [ ] **Step 5: Remove duplicate and obsolete chrome**

Keep the accessible wrapper but delete its visible outer header:

```tsx
<section
  className="schema-template-editor"
  role="region"
  aria-label={`${uiText.cardTemplateEditor} ${selectedTemplate.name}`}
>
  <CardLayoutStudio
    // existing props
    onClose={closeTemplateEditor}
  />
</section>
```

Remove `.schema-template-editor-header` CSS. Add compact arrow styles:

```css
.card-layout-block-order-actions {
  display: inline-flex;
  gap: 0.25rem;
}

.card-layout-block-order-button {
  width: 2rem;
  min-width: 2rem;
  height: 2rem;
  padding: 0;
}
```

Ensure the existing header action row can wrap and does not overflow narrow
blocks.

- [ ] **Step 6: Run focused integration tests and verify GREEN**

Run:

```powershell
pnpm -C frontend test:run -- src/features/registry/CardPrintTemplateEditor.test.tsx src/features/cardLayout/CardLayoutRenderer.test.tsx src/App.test.tsx
pnpm -C frontend lint
pnpm -C frontend typecheck
```

Expected: focused UI suites, ESLint, and TypeScript pass.

- [ ] **Step 7: Commit the studio task**

```powershell
git add frontend/src/features/registry/print/CardLayoutStudio.tsx frontend/src/features/registry/RegistriesAndSchema.tsx frontend/src/features/registry/CardPrintTemplateEditor.test.tsx frontend/src/App.test.tsx frontend/src/styles/globals.css
git commit -m "Simplify template editor block ordering"
```

---

### Task 5: Full Gate, Documentation, Deployment, and Live Proof

**Files:**
- Modify: `PLANS.md`
- Regenerate: `docs/PROJECT_TREE.md`
- Update task checkboxes in this plan.

**Interfaces:**
- Consumes: all previous tasks.
- Produces: synchronized local/GitHub/server `main` plus deployed frontend assets and live Browser evidence.

- [ ] **Step 1: Regenerate and verify the project map**

```powershell
powershell -ExecutionPolicy Bypass -File scripts/project-map.ps1
powershell -ExecutionPolicy Bypass -File scripts/project-map.ps1 -Check
```

Expected: `docs/PROJECT_TREE.md` includes `blockOrdering.ts` and its test and
the check reports `Project tree is current.`

- [ ] **Step 2: Run the full local gate**

```powershell
powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote
```

Expected: Ruff, Ruff format, mypy, backend pytest, ESLint, TypeScript, Vitest,
Vite production build, and project-map checks all pass. Record exact test
counts and bundle names.

- [ ] **Step 3: Update project status evidence**

Append a `Registry advanced navigation and block ordering` checkpoint to
`PLANS.md` containing:

- primary and advanced tab behavior;
- duplicate header and redo removal;
- arrow boundary/collision/atomic-undo behavior;
- exact local gate counts and bundle assets;
- no migration statement.

- [ ] **Step 4: Commit and push through the project script**

```powershell
powershell -ExecutionPolicy Bypass -File scripts/push-git.ps1 -Message "Release advanced registry navigation"
```

Expected: the script reruns the gate, commits scoped files, and pushes
`origin/main`.

- [ ] **Step 5: Deploy server and frontend**

```powershell
powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1
powershell -ExecutionPolicy Bypass -File scripts/deploy-frontend.ps1
```

Expected: server checkout is clean on `main`, service and PostgreSQL checks
pass, health returns `{"status":"ok","service":"reg_engine"}`, and the new
hashed JS/CSS assets are served.

- [ ] **Step 6: Live Browser verification**

Using the in-app Browser session:

1. Confirm primary tabs are `Схема карточки`, `Импорт и экспорт`,
   `Расширенное` and schema is selected by default after a fresh mount.
2. Open `Расширенное`, verify `Реестры`, `Справочники`, and `Отчёты`, then
   verify the selected advanced tab survives a primary-tab round trip.
3. Open `Базовый шаблон`; confirm one visible studio header, no duplicate
   technical-code header, and no `Повторить` button.
4. Confirm block arrows and first/last disabled boundaries.
5. Move one middle block, verify rows/dimensions and zero pairwise overlap,
   then click `Отменить` and verify the original layout returns.
6. Confirm field drag/resize and block resize affordances still exist without
   committing a geometry change.
7. Confirm zero page overflow and zero browser warnings/errors.

- [ ] **Step 7: Record live proof and final synchronization**

Update `PLANS.md` with deployed asset names and live evidence, mark all plan
checkboxes complete, commit/push the documentation, rerun `scripts/deploy.ps1`,
then verify:

```powershell
git status --short --branch
git log -1 --format=local=%H
git log -1 origin/main --format=origin=%H
ssh -o BatchMode=yes root@registoryengine "git -C /opt/reg_engine status --short --branch && git -C /opt/reg_engine log -1 --format=server=%H"
```

Expected: clean `main`, and local/origin/server hashes are identical.
