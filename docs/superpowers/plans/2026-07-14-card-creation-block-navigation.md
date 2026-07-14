# Card Creation Block Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the sticky, scroll-linked block navigation for one-stage card creation while retaining a distinct base block and comfortable visual spacing.

**Architecture:** `SingleStageCardCreation` remains responsible for the unsaved creation state and the first-save request. It will project its template-preview blocks into the existing `CardPresentationShell` and `CardBlockNavigator`, using stable anchor IDs and the existing `IntersectionObserver` navigation behavior. Completion state is derived only from values actually entered in the unsaved creation state, so untouched fields remain visibly empty.

**Tech Stack:** React 18, TypeScript, TanStack Query, Vitest, Testing Library, CSS.

## Global Constraints

- Keep the card schema-driven; do not introduce business-specific fields or API payloads.
- Keep the current first-save lifecycle: no card is created until one nonempty dynamic field value is entered.
- Keep the base block separate from template blocks and preserve dynamic preview loading without page refresh.
- Reuse the existing sticky `CardPresentationShell` and `CardBlockNavigator`; on narrow screens retain its non-sticky responsive behavior.
- User-facing copy remains Russian-first; do not expose technical identifiers.
- Do not alter ordinary filled-card or public-card behavior.

---

### Task 1: Test the creation-page block structure and completion states

**Files:**
- Modify: `frontend/src/features/cards/CardsWorkspace.test.tsx:115-250`

**Interfaces:**
- Consumes: `CardsWorkspace` and the `GET /api/v1/organizations/{organizationId}/cards/creation-preview` response fixture.
- Produces: regression coverage for the static base block, sticky block navigator, anchored template sections, and required/filled field classes.

- [ ] **Step 1: Write the failing navigation fixture and assertions**

Replace the single-block preview in the existing creation test with two blocks and assert the restored structure before entering a value:

```tsx
blocks: [
  {
    block_id: "block-person",
    code: "person",
    title: "ФИО",
    description: "Основные сведения",
    is_repeatable: false,
    fields: [{ field_id: "field-name", code: "name", label: "Фамилия", description: null, field_type: "text", required_mode: "required", options: [] }],
  },
  {
    block_id: "block-details",
    code: "details",
    title: "Сведения",
    description: null,
    is_repeatable: false,
    fields: [{ field_id: "field-note", code: "note", label: "Примечание", description: null, field_type: "text", required_mode: "optional", options: [] }],
  },
],
```

After opening `Создать карточку`, assert:

```tsx
expect(screen.getByText("Базовый блок")).toBeInTheDocument();
expect(screen.getByRole("navigation", { name: "Содержание карточки" })).toBeInTheDocument();
expect(screen.getByRole("button", { name: /ФИО: Нужно заполнить 1 из 1/ })).toBeInTheDocument();
expect(screen.getByRole("button", { name: /Сведения: Не заполнено/ })).toBeInTheDocument();
expect(document.getElementById("creation-card-block-block-person")).toHaveClass(
  "single-stage-card-creation-block",
  "is-attention",
);
expect(document.getElementById("creation-card-block-block-details")).toHaveClass(
  "single-stage-card-creation-block",
  "is-empty",
);
```

- [ ] **Step 2: Run the focused test to confirm it fails**

Run:

```powershell
pnpm -C frontend test:run src/features/cards/CardsWorkspace.test.tsx -t "restores scroll-linked template block navigation"
```

Expected: FAIL because the creation UI has no `Содержание карточки` navigation and no anchored template sections.

- [ ] **Step 3: Add a style-source regression assertion**

In the existing compact-textarea CSS test, add assertions for the creation shell and visual states:

```tsx
expect(globalStyles).toContain(".single-stage-card-creation {\n  width: min(100%, 72rem);");
expect(globalStyles).toContain(".single-stage-card-creation-block.is-attention {");
expect(globalStyles).toContain(".single-stage-card-creation-field.is-filled {");
```

- [ ] **Step 4: Commit the failing test checkpoint**

```powershell
git add frontend/src/features/cards/CardsWorkspace.test.tsx
git commit -m "test: cover card creation block navigation"
```

### Task 2: Project creation preview blocks into the existing sticky card shell

**Files:**
- Modify: `frontend/src/features/cards/SingleStageCardCreation.tsx:1-225`

**Interfaces:**
- Consumes: `CardCreationPreviewRead.blocks`, `CardPresentationShell`, `CardBlockNavigationItem`, `buildBlockCompletions`, `isValueFilled`, `coerceEditorValue`.
- Produces: `<CardPresentationShell items={navigationItems}>` containing anchored creation sections with `is-empty`, `is-attention`, or `is-complete` classes.

- [ ] **Step 1: Add creation-preview completion helpers**

Import the existing card navigation and completion contracts:

```tsx
import { CardPresentationShell } from "./CardPresentationShell";
import type { CardBlockNavigationItem } from "./CardBlockNavigator";
import { buildBlockCompletions } from "./cardCompletion";
```

Add the helper below `isEmptyFirstValue`. It returns `null` for untouched or invalid draft data, ensuring the initial `false`, `[]`, and `{}` editor defaults do not incorrectly mark fields as filled:

```tsx
function creationValueForCompletion(field: CardCreationPreviewFieldRead, value: FieldEditorState | undefined) {
  if (value === undefined) return null;
  try {
    return coerceEditorValue(field.field_type, value);
  } catch {
    return null;
  }
}

function creationBlockAnchorId(blockId: string) {
  return `creation-card-block-${blockId}`;
}
```

- [ ] **Step 2: Derive navigation items from preview blocks and entered values**

Inside `SingleStageCardCreation`, after `fields`, add a memoized completion map and navigation items. Preserve field-to-block membership by flattening the preview blocks:

```tsx
const completions = useMemo(() => {
  const previewBlocks = preview?.blocks ?? [];
  const previewFields = previewBlocks.flatMap((block) =>
    block.fields.map((field) => ({
      id: field.field_id,
      block_id: block.block_id,
      field_type: field.field_type,
      required_mode: field.required_mode,
    })),
  );
  const fieldsById = new Map(previewBlocks.flatMap((block) => block.fields.map((field) => [field.field_id, field])));
  return buildBlockCompletions({
    blocks: previewBlocks.map((block) => ({ id: block.block_id, title: block.title })),
    fields: previewFields,
    valueForField: (field) => {
      const previewField = fieldsById.get(field.id);
      return previewField ? creationValueForCompletion(previewField, state.values[field.id]) : null;
    },
  });
}, [preview?.blocks, state.values]);

const navigationItems = useMemo<readonly CardBlockNavigationItem[]>(
  () =>
    (preview?.blocks ?? []).map((block) => {
      const completion = completions.blocks.get(block.block_id)!;
      return {
        anchorId: creationBlockAnchorId(block.block_id),
        label: block.title,
        state: completion.state,
        filledCount: completion.filledCount,
        totalCount: completion.totalCount,
        requiredMissingCount: completion.requiredMissingCount,
      };
    }),
  [completions.blocks, preview?.blocks],
);
```

- [ ] **Step 3: Replace the flat template mapping with the shared presentation shell**

Keep `single-stage-card-creation-base` before the template region. Replace the existing `preview?.blocks.map(...)` output with the following structure, retaining the current `FieldEditorControl` props and `saveFirstValue` handler in the inner mapping:

```tsx
{preview?.blocks.length ? (
  <CardPresentationShell items={navigationItems}>
    <div className="single-stage-card-creation-template">
      {preview.blocks.map((block) => {
        const completion = completions.blocks.get(block.block_id);
        return (
          <section
            key={block.block_id}
            id={creationBlockAnchorId(block.block_id)}
            className={`data-panel single-stage-card-creation-block is-${completion?.state ?? "empty"}`}
          >
            {/* existing header and field mapping */}
          </section>
        );
      })}
    </div>
  </CardPresentationShell>
) : null}
```

For each field label, derive its state from `completions.fields.get(field.field_id)?.state ?? "empty"` and render:

```tsx
<label className={`single-stage-card-creation-field is-${fieldState}`}>
```

Do not change `saveFirstValue`, request payloads, or file-field disabling.

- [ ] **Step 4: Run the focused component test and TypeScript check**

Run:

```powershell
pnpm -C frontend test:run src/features/cards/CardsWorkspace.test.tsx
pnpm -C frontend typecheck
```

Expected: the focused test passes, existing card creation first-save coverage passes, and TypeScript reports no errors.

- [ ] **Step 5: Commit the behavior implementation**

```powershell
git add frontend/src/features/cards/SingleStageCardCreation.tsx frontend/src/features/cards/CardsWorkspace.test.tsx
git commit -m "feat: restore card creation block navigation"
```

### Task 3: Restore comfortable creation-page spacing and visual field states

**Files:**
- Modify: `frontend/src/styles/globals.css:5320-5340`
- Modify: `frontend/src/features/cards/CardsWorkspace.test.tsx:115-125`

**Interfaces:**
- Consumes: the `single-stage-card-creation`, `single-stage-card-creation-base`, `single-stage-card-creation-template`, `single-stage-card-creation-block`, and `single-stage-card-creation-field` classes from Task 2.
- Produces: a centered content width, visibly separate base/template panels, and consistent empty/required/filled states without changing shared card CSS.

- [ ] **Step 1: Add scoped creation-page layout CSS**

Append these rules after the existing `.single-stage-card-creation` textarea overrides. Keep all selectors scoped to creation so filled and public cards are unchanged:

```css
.single-stage-card-creation {
  width: min(100%, 72rem);
  margin: 0 auto;
  gap: 20px;
  padding: 4px 12px 28px;
}

.single-stage-card-creation-base {
  padding: 20px;
  border-color: #83c7b6;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06);
}

.single-stage-card-creation-template {
  display: grid;
  gap: 16px;
}

.single-stage-card-creation-block {
  display: grid;
  gap: 14px;
  padding: 20px;
  scroll-margin-top: 16px;
  border-color: #d5dfeb;
  box-shadow: 0 5px 18px rgba(15, 23, 42, 0.05);
}

.single-stage-card-creation-block.is-attention {
  border-color: #e6aa4a;
  background: #fffdf7;
}

.single-stage-card-creation-block.is-complete {
  border-color: #83c7b6;
  background: #fbfffd;
}

.single-stage-card-creation-field {
  display: grid;
  gap: 7px;
  padding: 12px;
  border: 1px solid #d5dfeb;
  border-radius: 8px;
  background: #ffffff;
}

.single-stage-card-creation-field.is-required-missing {
  border-color: #e6aa4a;
  background: #fff8eb;
}

.single-stage-card-creation-field.is-filled {
  border-color: #b9ddd1;
  background: #f5fcf8;
}
```

- [ ] **Step 2: Preserve responsive behavior**

Inside the existing `@media (max-width: 900px)` block, add:

```css
  .single-stage-card-creation {
    width: 100%;
    padding-inline: 0;
  }

  .single-stage-card-creation-base,
  .single-stage-card-creation-block {
    padding: 16px;
  }
```

The existing `.card-presentation-shell` media rule keeps the navigator non-sticky and above the block content.

- [ ] **Step 3: Run style and build verification**

Run:

```powershell
pnpm -C frontend test:run src/features/cards/CardsWorkspace.test.tsx
pnpm -C frontend lint
pnpm -C frontend typecheck
pnpm -C frontend build
```

Expected: tests, lint, TypeScript, and production build pass. Record any pre-existing warning separately rather than weakening assertions.

- [ ] **Step 4: Commit the visual implementation**

```powershell
git add frontend/src/styles/globals.css frontend/src/features/cards/CardsWorkspace.test.tsx
git commit -m "style: clarify card creation block states"
```

### Task 4: Record release evidence and publish only after validation

**Files:**
- Modify: `PLANS.md`

**Interfaces:**
- Consumes: verified frontend commit from Tasks 1-3 and the configured project deployment scripts.
- Produces: a dated `PLANS.md` checkpoint with exact commands, commit IDs, deployment output asset names, and browser-proof result.

- [ ] **Step 1: Run the local project gate**

Run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote
```

Expected: local backend syntax/tests, frontend checks, and project-map checks pass; if a historical unrelated suite remains red, record its exact test names and do not change unrelated assertions.

- [ ] **Step 2: Publish the verified main branch**

Run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/push-git.ps1 -Message "feat: restore card creation block navigation"
powershell -ExecutionPolicy Bypass -File scripts/deploy-frontend.ps1
powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1
```

Expected: `main` is pushed, the server checkout fast-forwards to the same commit, the frontend artifact is uploaded, the service restarts, and same-origin API/health checks pass.

- [ ] **Step 3: Perform browser-only visual verification without creating data**

Open the authenticated `Карточки → Создать карточку` page and verify only read-only UI state:

```text
- base block is visually distinct and contains organization, template, and name;
- the left navigation stays visible while the page scrolls;
- clicking a navigation block scrolls to the corresponding named template block;
- unfilled required fields use the amber state and empty optional fields remain neutral;
- no production card is created during verification.
```

- [ ] **Step 4: Update `PLANS.md` and commit the evidence**

Add a dated checkpoint with commands, test counts, commit IDs, asset name, and browser result, then run:

```powershell
git add PLANS.md
git commit -m "docs: record card creation navigation release"
powershell -ExecutionPolicy Bypass -File scripts/push-git.ps1 -Message "docs: record card creation navigation release"
powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1
```

Expected: `PLANS.md` evidence is committed and the server checkout is synchronized to the documentation commit.

## Self-review

- Spec coverage: Tasks 1-2 restore the static base block, scroll-linked sticky navigation, dynamic preview, and untouched first-save lifecycle. Task 3 covers separated panels, reduced edge pressure, and empty/required/filled states. Task 4 covers local checks, publication, and live visual proof.
- Placeholder scan: no `TODO`, `TBD`, or unspecified test steps remain.
- Type consistency: Task 2 produces only existing `CardBlockNavigationItem` objects and `CardPresentationShell` children; it does not change public component interfaces or API types.
