# Inline card field row Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render editable public and administrator card fields as one label/control row without duplicated technical metadata.

**Architecture:** Add an explicit inline presentation option to the shared card-layout renderer. The public editor will supply only its existing autosaving control, while the authenticated card view will keep its current field-activation/autosave path but display its read state as an input-like right-hand value surface.

**Tech Stack:** React, TypeScript, Vitest, Testing Library, existing CSS grid and `FieldEditorControl`.

## Global Constraints

- No API, database, schema, public-access, or audit contract change.
- Keep backend permissions authoritative; static text, `file_ref`, and unavailable fields remain read-only.
- Preserve the current public save queue and authenticated field autosave delays.
- All user-facing copy remains Russian-first.

---

### Task 1: Add regression tests for the public inline row

**Files:**
- Modify: `frontend/src/pages/PublicLinkEditPage.test.tsx`

**Interfaces:**
- Consumes: the existing `public-field-item-status` layout fixture and `PublicFieldEditor` control.
- Produces: regression assertions for one visible label, one active field control, and no `Текущее значение`/instance/type metadata within that field.

- [ ] **Step 1: Write the failing test**

```tsx
const fieldNode = screen.getByTestId("public-field-item-status");
expect(within(fieldNode).getByText("Публичный статус", { exact: true })).toBeInTheDocument();
expect(within(fieldNode).getByRole("textbox", { name: "Публичный статус" })).toHaveValue("drafted");
expect(within(fieldNode).queryByText(/Текущее значение/)).not.toBeInTheDocument();
expect(within(fieldNode).queryByText(/экземпляр 1/i)).not.toBeInTheDocument();
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm -C frontend test:run src/pages/PublicLinkEditPage.test.tsx -t "renders public fields as one inline label and control row"`

Expected: FAIL because the current public field contains `экземпляр 1 / Текст` and `Текущее значение`.

- [ ] **Step 3: Implement the public row**

In `PublicLinkEditPage.tsx`, remove the `field-editor-meta` and repeated inner label from `PublicFieldEditor`; leave `FieldEditorControl`, save status, and error state intact. Pass the shared renderer its inline field presentation option.

```tsx
renderFieldValue={({ field, item }) => (
  <PublicFieldEditor field={field} fieldKey={publicFieldKey(item)} /* existing props */ />
)}
```

- [ ] **Step 4: Run the public page tests**

Run: `pnpm -C frontend test:run src/pages/PublicLinkEditPage.test.tsx`

Expected: PASS, including autosave, retry, repeatable-instance, and attachment tests.

- [ ] **Step 5: Commit**

```powershell
git add frontend/src/pages/PublicLinkEditPage.tsx frontend/src/pages/PublicLinkEditPage.test.tsx
git commit -m "Simplify public card field rows"
```

### Task 2: Add the shared inline field presentation

**Files:**
- Modify: `frontend/src/features/cardLayout/CardLayoutRenderer.tsx`
- Modify: `frontend/src/features/cardLayout/CardWebLayoutCanvas.tsx`
- Modify: `frontend/src/features/cardLayout/CardBlockLayoutNode.tsx`
- Modify: `frontend/src/features/cardLayout/CardFieldLayoutNode.tsx`
- Modify: `frontend/src/features/cardLayout/CardLayoutRenderer.test.tsx`
- Modify: `frontend/src/styles/globals.css`

**Interfaces:**
- Consumes: `renderFieldValue(context)` and the current header/value markup in `CardFieldLayoutNode`.
- Produces: optional `fieldPresentationLayout?: "stacked" | "inline"` passed through the renderer stack.

- [ ] **Step 1: Write the failing renderer test**

```tsx
render(<CardLayoutRenderer {...canvasProps({ fieldPresentationLayout: "inline" })} />);
const node = screen.getByTestId("layout-field-field-1");
expect(node.querySelector(".card-layout-inline-field")).not.toBeNull();
expect(within(node).queryByText(fieldTypeLabel("text"))).not.toBeInTheDocument();
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm -C frontend test:run src/features/cardLayout/CardLayoutRenderer.test.tsx -t "renders inline field presentation"`

Expected: FAIL because the current field header is stacked and always shows the field type.

- [ ] **Step 3: Implement the explicit layout option**

Thread the optional property through the renderer and canvas props. In
`CardFieldLayoutNode`, wrap the existing label header and value surface in the
following structure only when the option is `inline`; do not alter design,
print preview, or readonly defaults.

```tsx
<div className="card-layout-inline-field">
  <header className="card-layout-field-header"><strong>{field.label}</strong></header>
  <div className="card-layout-field-value">{renderedControlOrValue}</div>
</div>
```

Add CSS for `minmax(120px, 0.42fr) minmax(0, 1fr)`, an input-like read value
surface, and a one-column mobile fallback. Keep the control focus styles and
do not apply the option to `static_text` or `file_ref` specialised views.

- [ ] **Step 4: Run renderer tests**

Run: `pnpm -C frontend test:run src/features/cardLayout/CardLayoutRenderer.test.tsx`

Expected: PASS for geometry, activation, public-edit, and new inline layout coverage.

- [ ] **Step 5: Commit**

```powershell
git add frontend/src/features/cardLayout/CardLayoutRenderer.tsx frontend/src/features/cardLayout/CardWebLayoutCanvas.tsx frontend/src/features/cardLayout/CardBlockLayoutNode.tsx frontend/src/features/cardLayout/CardFieldLayoutNode.tsx frontend/src/features/cardLayout/CardLayoutRenderer.test.tsx frontend/src/styles/globals.css
git commit -m "Add inline card field presentation"
```

### Task 3: Use the inline presentation in the authenticated card view

**Files:**
- Modify: `frontend/src/features/cards/FilledCardLayout.tsx`
- Modify: `frontend/src/features/cards/FilledCardLayout.test.tsx`

**Interfaces:**
- Consumes: `fieldPresentationLayout="inline"`, existing `BlockFieldControl`, and `useBlockEditor` activation/autosave contract.
- Produces: input-like read values in the right column before activation, then the existing active control in the same position after click.

- [ ] **Step 1: Write the failing filled-card tests**

```tsx
render(<EditableFilledCard saveValues={vi.fn().mockResolvedValue(undefined)} />);
const fieldNode = screen.getByTestId("filled-field-layout-first-name");
expect(fieldNode.querySelector(".card-layout-inline-field")).not.toBeNull();
expect(within(fieldNode).queryByText("Текст", { exact: true })).not.toBeInTheDocument();
await user.click(fieldNode);
expect(screen.getByRole("textbox", { name: "Имя" })).toHaveValue("Иван");
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm -C frontend test:run src/features/cards/FilledCardLayout.test.tsx -t "renders editable fields as inline controls"`

Expected: FAIL because the current layout uses the stacked header/type card.

- [ ] **Step 3: Implement the authenticated surface**

Pass `fieldPresentationLayout="inline"` from `FilledCardLayout`. Wrap the
normal ordinary read values there in `card-inline-field-read-value`, so they
occupy the right control surface while the existing field-node activation opens
the editor. Leave `BlockFieldControl`, `file_ref`, static text, validation
errors, and actual `FieldEditorControl` behaviour unchanged.

- [ ] **Step 4: Run the filled-card tests**

Run: `pnpm -C frontend test:run src/features/cards/FilledCardLayout.test.tsx`

Expected: PASS, including click-to-open, outside-click commit, delayed text
autosave, and immediate choice autosave.

- [ ] **Step 5: Commit**

```powershell
git add frontend/src/features/cards/FilledCardLayout.tsx frontend/src/features/cards/FilledCardLayout.test.tsx
git commit -m "Show authenticated card fields inline"
```

### Task 4: Verify and release

**Files:**
- Modify: `PLANS.md`

- [ ] **Step 1: Run focused frontend checks**

```powershell
pnpm -C frontend test:run src/pages/PublicLinkEditPage.test.tsx
pnpm -C frontend test:run src/features/cardLayout/CardLayoutRenderer.test.tsx
pnpm -C frontend test:run src/features/cards/FilledCardLayout.test.tsx
pnpm -C frontend typecheck
pnpm -C frontend lint
pnpm -C frontend build
```

Expected: focused tests, typecheck, lint, and build pass.

- [ ] **Step 2: Run rendered browser checks**

Use the existing authenticated in-app Browser session:

```text
public edit URL -> public field shows left label/right active input -> no instance/type/current-value duplicate -> type once -> autosave state changes
authenticated card -> field shows left label/right input-like value -> click value -> active input appears in the same right column
```

Expected: no framework overlay and no relevant browser console error.

- [ ] **Step 3: Record evidence and release**

Append the exact test output, Browser URL, and remaining responsive limitation
to `PLANS.md`, then run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/push-git.ps1 -Message "Refine inline card field rows"
powershell -ExecutionPolicy Bypass -File scripts/deploy-frontend.ps1
powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1
```

Expected: `main`, server checkout, and frontend bundle are synchronized; same-origin API and frontend smoke checks pass.
