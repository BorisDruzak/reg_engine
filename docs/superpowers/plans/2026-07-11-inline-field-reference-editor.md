# Compact Field and Reference Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the technical inline field form with a compact Russian-first editor that uses hints during card filling and embeds reference-list creation and maintenance.

**Architecture:** `InlineFieldEditor` keeps the field draft and switches between the field form and a new `InlineReferenceEditor`. Registry context is passed from `CardLayoutStudio` through the layout renderer only in design mode. `FieldEditorControl` receives an optional hint and owns type-specific placeholder/fallback rendering.

**Tech Stack:** React 19, TypeScript, TanStack Query, Vitest, Testing Library, Vite, existing REST API client.

## Global Constraints

- Keep the schema-driven `FormFieldRead.description`, `required_mode`, and reference-list REST contracts unchanged.
- User-facing copy is Russian-first.
- Do not expose technical codes in the compact editor.
- Mandatory UI saves `required_on_publish`, allowing incomplete cards to remain drafts.
- Do not introduce nested HTML forms.
- Preserve backend authorization; frontend checks are UX only.
- Use TDD and preserve unrelated working-tree changes.

---

### Task 1: Compact field form

**Files:**
- Modify: `frontend/src/features/cardLayout/InlineFieldEditor.tsx`
- Test: `frontend/src/features/cardLayout/CardLayoutRenderer.test.tsx`

**Interfaces:**
- Consumes: `FormFieldRead` and existing `onCommit` / `onCancel` callbacks.
- Produces: a field form without a technical-code control, with `description` edited as `Подсказка`, binary mandatory UI, and collapsed public settings.

- [x] **Step 1: Write failing renderer tests**

Add tests that open a field and assert:

```tsx
expect(screen.queryByLabelText("Технический код")).not.toBeInTheDocument();
expect(screen.getByLabelText("Подсказка")).toHaveValue(field.description ?? "");
expect(screen.getByRole("group", { name: "Публичное редактирование" })).not.toHaveAttribute(
  "open",
);
```

Submit a legacy `required` field and assert the committed draft keeps the code but uses:

```ts
expect(onCommit).toHaveBeenCalledWith(
  expect.objectContaining({ code: field.code, required_mode: "required_on_publish" }),
);
```

- [x] **Step 2: Run the focused tests and verify RED**

Run:

```powershell
pnpm -C frontend test:run -- src/features/cardLayout/CardLayoutRenderer.test.tsx -t "compact field editor"
```

Expected: failures because the technical-code input and three mandatory values are still visible.

- [x] **Step 3: Implement the compact field form**

Remove the code label/input and code-focused validation UI while preserving `draft.code`. Replace the description textarea with:

```tsx
<label>
  <span>Подсказка</span>
  <input
    value={draft.description ?? ""}
    onChange={(event) => setDraft({ ...draft, description: event.currentTarget.value })}
  />
</label>
```

Render a two-option mandatory selector whose UI value is derived from
`draft.required_mode === "not_required" ? "not_required" : "required_on_publish"`.
Before `onCommit`, normalize every non-optional editable field to
`required_on_publish`. Put both public checkboxes inside closed-by-default:

```tsx
<details aria-label="Публичное редактирование">
  <summary>Публичное редактирование</summary>
  {/* existing public_visible and public_editable checkboxes */}
</details>
```

Keep static text forced to `not_required` and hide its hint/mandatory controls.

- [x] **Step 4: Run focused tests and verify GREEN**

Run the Task 1 command. Expected: all matching tests pass.

- [x] **Step 5: Commit the task**

```powershell
git add frontend/src/features/cardLayout/InlineFieldEditor.tsx frontend/src/features/cardLayout/CardLayoutRenderer.test.tsx
git commit -m "Simplify inline field settings"
```

### Task 2: Inline reference-list editor

**Files:**
- Create: `frontend/src/features/cardLayout/InlineReferenceEditor.tsx`
- Create: `frontend/src/features/cardLayout/InlineReferenceEditor.test.tsx`
- Modify: `frontend/src/features/cardLayout/InlineFieldEditor.tsx`
- Modify: `frontend/src/features/cardLayout/CardFieldLayoutNode.tsx`
- Modify: `frontend/src/features/cardLayout/CardBlockLayoutNode.tsx`
- Modify: `frontend/src/features/cardLayout/CardWebLayoutCanvas.tsx`
- Modify: `frontend/src/features/registry/print/CardLayoutStudio.tsx`
- Modify: `frontend/src/app/uiText.ts`

**Interfaces:**
- Produces:

```ts
export type InlineReferenceEditorContext = {
  token: string;
  registryId: string;
  onReferenceDataChanged: () => Promise<void> | void;
};

export type InlineReferenceEditorProps = {
  context: InlineReferenceEditorContext;
  referenceLists: ReferenceListRead[];
  selectedReferenceListId: string | null;
  mode: "create" | "manage";
  onSelect: (referenceList: ReferenceListRead) => void;
  onBack: () => void;
};
```

- Consumes existing `createReferenceList`, `updateReferenceList`,
  `listReferenceItems`, `createReferenceItem`, `updateReferenceItem`, and
  `archiveReferenceItem` API functions.

- [x] **Step 1: Write failing component tests**

Cover empty-name validation, generated technical code in the create POST,
automatic `onSelect`, item loading, create, rename, reorder, archive, Russian
mutation errors, and `Назад`. Mock `fetch` at the API boundary rather than
mocking component internals.

- [x] **Step 2: Write failing field-editor integration tests**

Verify that `select` / `multi_select` fields show `Создать новый`, selected
lists show `Изменить выбранный`, the reference screen replaces the field form,
and `Назад` restores an unsaved field name and hint. Dispatch an outside click
while the reference screen is active and assert `onCommit` is not called.

- [x] **Step 3: Run reference tests and verify RED**

```powershell
pnpm -C frontend test:run -- src/features/cardLayout/InlineReferenceEditor.test.tsx src/features/cardLayout/CardLayoutRenderer.test.tsx -t "справочник|reference"
```

Expected: the new component/actions do not exist.

- [x] **Step 4: Implement `InlineReferenceEditor`**

Use separate non-nested forms for create/list metadata and item actions. Keep
local `screen`, list-name, and item-draft state; query items using:

```ts
useQuery({
  queryKey: ["inline-reference-items", context.token, selectedReferenceListId],
  queryFn: () => listReferenceItems(context.token, selectedReferenceListId ?? ""),
  enabled: Boolean(selectedReferenceListId),
});
```

Create unique list/item codes with `generateTechnicalCode`. Keep create buttons
enabled while idle so empty submission can show `Введите название справочника`
or `Введите название элемента`. Reorder items by updating only changed
positions. Show `runtimeError(error)` in an inline alert.

- [x] **Step 5: Switch field/reference screens without losing the draft**

Add `editorScreen` state to `InlineFieldEditor`. Use one editor root around a
conditional field `<form>` or `InlineReferenceEditor`; disable click-away commit
unless `editorScreen === "field"`. After list creation call `onSelect`, update
the draft to `options_source_type: "reference_list"` and the created id, then
remain in manage mode. Escape on reference screens calls `onBack`.

- [x] **Step 6: Pass registry context through the design renderer**

Add optional `inlineReferenceEditorContext` props through
`CardWebLayoutCanvas`, `CardBlockLayoutNode`, and `CardFieldLayoutNode`.
`CardLayoutStudio` passes:

```ts
{
  token,
  registryId,
  onReferenceDataChanged: () =>
    queryClient.invalidateQueries({ queryKey: ["reference-lists", token, registryId] }),
}
```

Do not pass this context in preview, readonly, block-edit, or public-edit modes.

- [x] **Step 7: Run focused tests and verify GREEN**

Run the Task 2 command plus TypeScript:

```powershell
pnpm -C frontend typecheck
```

Expected: all focused tests and typecheck pass.

- [x] **Step 8: Commit the task**

```powershell
git add frontend/src/features/cardLayout frontend/src/features/registry/print/CardLayoutStudio.tsx frontend/src/app/uiText.ts
git commit -m "Embed reference editing in fields"
```

### Task 3: Data-entry hints

**Files:**
- Modify: `frontend/src/features/cards/FieldEditorControl.tsx`
- Create: `frontend/src/features/cards/FieldEditorControl.test.tsx`
- Modify: `frontend/src/features/cardLayout/CardFieldLayoutNode.tsx`
- Modify: `frontend/src/features/cards/BlockFieldControl.tsx`
- Modify: `frontend/src/features/cards/CardsWorkspace.tsx`
- Modify: `frontend/src/pages/PublicLinkEditPage.tsx`
- Test: relevant existing card/public editor tests.

**Interfaces:**
- Extends `FieldEditorControl` with `hint?: string | null`.
- Text/number inputs and JSON textarea use `placeholder={hint || undefined}`.
- Select uses `hint || uiText.empty` for its empty option.
- Multi-select, date, date-time, boolean, file, and reference controls render
  `<small className="field-editor-hint">{hint}</small>` inside a wrapper.

- [x] **Step 1: Write failing control tests**

Test text placeholder, select prompt, multi-select fallback, date fallback,
boolean fallback, and absence when hint is empty.

- [x] **Step 2: Run control tests and verify RED**

```powershell
pnpm -C frontend test:run -- src/features/cards/FieldEditorControl.test.tsx
```

Expected: `hint` is unsupported and no hint content renders.

- [x] **Step 3: Implement hint rendering and pass descriptions**

Add the prop and a small `ControlWithHint` helper. Pass `field.description`
from every `FieldEditorControl` call site, including authenticated card forms,
layout block editing, and public-link editing.

- [x] **Step 4: Run focused tests and verify GREEN**

Run the Task 3 command and relevant public/block editor tests.

- [x] **Step 5: Commit the task**

```powershell
git add frontend/src/features/cards frontend/src/features/cardLayout/CardFieldLayoutNode.tsx frontend/src/pages/PublicLinkEditPage.tsx
git commit -m "Show field hints during entry"
```

### Task 4: Responsive polish, full verification, release, and live proof

**Files:**
- Modify: `frontend/src/styles/globals.css`
- Modify: `PLANS.md`
- Modify: `docs/PROJECT_TREE.md` if generated map changes.

**Interfaces:**
- The inline field and reference screens must fit the field rectangle at the
  current compact editor width without horizontal overflow.

- [x] **Step 1: Add focused compact-editor CSS**

Use wrapping action rows, `min-width: 0`, full-width controls, compact item
rows, and `.field-editor-hint` styling. Do not alter unrelated layout geometry.

- [x] **Step 2: Run the full local gate**

```powershell
powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote
```

Expected: backend tests, frontend tests, lint, format, typecheck, build, and
project-map checks pass; only existing documented warnings remain.

- [x] **Step 3: Update `PLANS.md` with implementation and verification evidence**

Record behavior, test counts, bundle hash, and limitations. Regenerate the
project map when required.

- [ ] **Step 4: Commit, push, and deploy through project scripts**

```powershell
powershell -ExecutionPolicy Bypass -File scripts/push-git.ps1 -Message "Release compact field reference editor"
powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1
powershell -ExecutionPolicy Bypass -File scripts/deploy-frontend.ps1
```

- [ ] **Step 5: Live browser verification**

On `http://192.168.100.12:8000/`, verify the deployed bundle and exact flow:
open a field, confirm hidden code and collapsed public section, preserve an
edited hint while entering and leaving reference management, validate empty
list/item names, create or edit only disposable test reference data, and open
authenticated/public filling controls to confirm hint rendering. Restore or
archive disposable changes and require zero console errors.

- [ ] **Step 6: Final synchronization check**

Confirm local `main`, `origin/main`, and `/opt/reg_engine` match; the server
checkout is clean; `reg-engine.service` and healthcheck are active; the final
browser has no active editor or unintended saved test mutation.
