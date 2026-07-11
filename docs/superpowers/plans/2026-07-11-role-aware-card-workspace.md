# Role-aware Card Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Replace the tab-heavy card surface with a schema-driven, role-aware card document that has block navigation, visible completion states, inline attachments, compact public-link controls, and a matching public-fill presentation.

**Architecture:** Keep CardLayoutRenderer as the only renderer of saved geometry. Add a pure completion model and optional presentation metadata to that renderer, then compose a reusable contents-and-document shell around both FilledCardLayout and the public card layout. Existing API contracts, public-link lifecycle, attachment APIs, and RBAC remain unchanged.

**Tech Stack:** React 19, TypeScript, TanStack Query, Vitest, Testing Library, Vite, FastAPI REST API.

## Global Constraints

- Preserve schema-driven blocks, fields, values, ordering, geometry, and backend-authoritative RBAC.
- Keep block_instance_id scoping, inline edit, file_ref rules, public autosave ordering, and existing public lifecycle states.
- All visible copy remains Russian-first.
- The one-click public link includes all active public_visible and public_editable non-file_ref/non-static fields and eligible blocks; default TTL is 7 days, upload limit is null, review is enabled.
- Do not delete documents, print layouts, audit records, or public links. Hide only their current card tabs.
- Add no database migration, dependency, or public URL change.

---

## File Structure

| File | Responsibility |
| --- | --- |
| frontend/src/features/cards/cardCompletion.ts | Pure value, field, and block completion classification. |
| frontend/src/features/cards/cardCompletion.test.ts | Unit regression coverage for completion semantics. |
| frontend/src/features/cards/CardBlockNavigator.tsx | Accessible contents list, anchor navigation, and current-block state. |
| frontend/src/features/cards/CardBlockNavigator.test.tsx | Navigation and scroll behaviour coverage. |
| frontend/src/features/cards/CardPresentationShell.tsx | Responsive navigator/content composition. |
| frontend/src/features/cards/PublicLinkQuickControl.tsx | One-click public-link creation, copy/status, and compact lifecycle details. |
| frontend/src/features/cards/PublicLinkQuickControl.test.tsx | Link defaults, eligibility guard, copy, and lifecycle coverage. |
| frontend/src/features/cards/PublicLinkReviewPanel.tsx | Exports public-schema eligibility and compact lifecycle detail primitives. |
| frontend/src/features/cards/PublicLinkReviewPanel.test.tsx | Retains review/lifecycle regression coverage after extraction. |
| frontend/src/features/cardLayout/CardLayoutRenderer.tsx | Presentation metadata types. |
| frontend/src/features/cardLayout/CardWebLayoutCanvas.tsx | Propagates metadata to existing nodes. |
| frontend/src/features/cardLayout/CardBlockLayoutNode.tsx | Block anchor, classes, and status description. |
| frontend/src/features/cardLayout/CardFieldLayoutNode.tsx | Field classes and status description. |
| frontend/src/features/cards/FilledCardLayout.tsx | Authenticated surface integration. |
| frontend/src/pages/PublicLinkEditPage.tsx | Public surface integration and live completion values. |
| frontend/src/features/cards/CardsWorkspace.tsx | Action panel, hidden tabs, and inline attachments. |
| frontend/src/styles/globals.css | Shared card-shell and status styles. |
| frontend/src/features/cards/FilledCardLayout.test.tsx | Authenticated surface regression tests. |
| frontend/src/pages/PublicLinkEditPage.test.tsx | Public surface regression tests. |
| frontend/src/App.test.tsx | Workspace action/tab regression tests. |
| PLANS.md | Scope and release evidence. |

## Task 1: Implement the pure completion model

**Files:**
- Create: frontend/src/features/cards/cardCompletion.ts
- Create: frontend/src/features/cards/cardCompletion.test.ts

**Interfaces:**
- Consumes schema fields with id, block_id, field_type, required_mode and a value resolver.
- Produces CardFieldCompletionState, CardBlockCompletionState, isValueFilled, and buildBlockCompletions.

- [ ] **Step 1: Write the failing unit tests**

    import { buildBlockCompletions, isValueFilled } from "./cardCompletion";

    test("marks a required empty field and its block as needing attention", () => {
      const result = buildBlockCompletions({
        blocks: [{ id: "employment", title: "Положение" }],
        fields: [{ id: "department", block_id: "employment", field_type: "text", required_mode: "required" }],
        valueForField: () => undefined,
      });

      expect(result.fields.get("department")?.state).toBe("required-missing");
      expect(result.blocks.get("employment")?.state).toBe("attention");
    });

    test("preserves optional empty and static text semantics", () => {
      expect(isValueFilled("Инструкция", "static_text")).toBe(true);
      const result = buildBlockCompletions({
        blocks: [{ id: "notes", title: "Примечания" }],
        fields: [{ id: "optional-field", block_id: "notes", field_type: "text", required_mode: "optional" }],
        valueForField: () => undefined,
      });
      expect(result.fields.get("optional-field")?.state).toBe("empty");
    });

Include string whitespace, zero, false, non-empty arrays, empty arrays, required_on_publish, file_ref, and a second instance of the same repeatable block.

- [ ] **Step 2: Run the test to verify it fails**

Run: pnpm -C frontend test:run -- src/features/cards/cardCompletion.test.ts

Expected: FAIL because cardCompletion.ts does not yet exist.

- [ ] **Step 3: Write the minimal model**

    import type { FormBlockRead, FormFieldRead } from "@/api/types";

    export type CardFieldCompletionState = "filled" | "required-missing" | "empty";
    export type CardBlockCompletionState = "complete" | "attention" | "empty";

    export type CardFieldCompletion = {
      fieldId: string;
      blockId: string;
      state: CardFieldCompletionState;
    };

    export type CardBlockCompletion = {
      blockId: string;
      filledCount: number;
      totalCount: number;
      state: CardBlockCompletionState;
    };

    export type CompletionResult = {
      fields: Map<string, CardFieldCompletion>;
      blocks: Map<string, CardBlockCompletion>;
    };

    export type CompletionInput = {
      blocks: readonly Pick<FormBlockRead, "id" | "title">[];
      fields: readonly Pick<FormFieldRead, "id" | "block_id" | "field_type" | "required_mode">[];
      valueForField: (field: Pick<FormFieldRead, "id">) => unknown;
    };

    export function isValueFilled(value: unknown, fieldType: string): boolean {
      if (fieldType === "static_text") return true;
      if (value === null || value === undefined) return false;
      if (typeof value === "string") return value.trim().length > 0;
      if (Array.isArray(value)) return value.length > 0;
      return true;
    }

    export function buildBlockCompletions(input: CompletionInput): CompletionResult {
      const fields = new Map<string, CardFieldCompletion>();
      const blocks = new Map<string, CardBlockCompletion>();
      for (const field of input.fields) {
        const filled = isValueFilled(input.valueForField(field), field.field_type);
        const required = field.required_mode === "required" || field.required_mode === "required_on_publish";
        fields.set(field.id, { fieldId: field.id, blockId: field.block_id, state: filled ? "filled" : required ? "required-missing" : "empty" });
      }
      for (const block of input.blocks) {
        const blockFields = Array.from(fields.values()).filter((field) => field.blockId === block.id);
        const missingCount = blockFields.filter((field) => field.state === "required-missing").length;
        const filledCount = blockFields.filter((field) => field.state === "filled").length;
        blocks.set(block.id, { blockId: block.id, filledCount, totalCount: blockFields.length, state: missingCount > 0 ? "attention" : filledCount > 0 ? "complete" : "empty" });
      }
      return { fields, blocks };
    }

Treat required and required_on_publish as mandatory. Return labels/counts so callers do not infer meaning only from colour.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: pnpm -C frontend test:run -- src/features/cards/cardCompletion.test.ts

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

    git add frontend/src/features/cards/cardCompletion.ts frontend/src/features/cards/cardCompletion.test.ts
    git commit -m "Add card completion model"

## Task 2: Let the shared renderer carry completion presentation

**Files:**
- Modify: frontend/src/features/cardLayout/CardLayoutRenderer.tsx
- Modify: frontend/src/features/cardLayout/CardWebLayoutCanvas.tsx
- Modify: frontend/src/features/cardLayout/CardBlockLayoutNode.tsx
- Modify: frontend/src/features/cardLayout/CardFieldLayoutNode.tsx
- Modify: frontend/src/features/cardLayout/CardLayoutRenderer.test.tsx

**Interfaces:**
- Consumes the Task 1 completion model.
- Produces optional blockPresentation and fieldPresentation callbacks supported in readonly, block-edit, and public-edit modes.

- [ ] **Step 1: Write the failing renderer test**

    render(
      <CardLayoutRenderer
        {...layoutProps}
        mode="readonly"
        blockPresentation={() => ({
          anchorId: "card-block-primary-employment",
          state: "attention",
          description: "Нужно заполнить 1 из 3 полей",
        })}
        fieldPresentation={() => ({
          state: "required-missing",
          description: "Нужно заполнить обязательное поле",
        })}
      />,
    );

    expect(screen.getByLabelText("Блок Положение")).toHaveAttribute(
      "id",
      "card-block-primary-employment",
    );
    expect(screen.getByTestId("layout-field-department")).toHaveClass("is-required-missing");

- [ ] **Step 2: Run it to verify it fails**

Run: pnpm -C frontend test:run -- src/features/cardLayout/CardLayoutRenderer.test.tsx --testNamePattern "completion presentation"

Expected: FAIL because the metadata props and DOM classes are absent.

- [ ] **Step 3: Add the narrow metadata contract**

    export type CardLayoutBlockPresentation = {
      anchorId?: string;
      state?: "complete" | "attention" | "empty";
      description?: string;
    };

    export type CardLayoutFieldPresentation = {
      state?: "filled" | "required-missing" | "empty";
      description?: string;
    };

Pass the callbacks through CardWebLayoutCanvas to existing node components. Append only is-complete, is-attention, is-empty, is-filled, and is-required-missing classes; assign anchorId to the block section; render a readable description for assistive technology. Do not change geometry, drag/resize, selection, or block activation.

- [ ] **Step 4: Run the renderer suite**

Run: pnpm -C frontend test:run -- src/features/cardLayout/CardLayoutRenderer.test.tsx

Expected: PASS, including existing exact-geometry and mobile reflow checks.

- [ ] **Step 5: Commit**

Run:

    git add frontend/src/features/cardLayout
    git commit -m "Expose card completion presentation"

## Task 3: Add reusable contents navigation and normal-page card scrolling

**Files:**
- Create: frontend/src/features/cards/CardBlockNavigator.tsx
- Create: frontend/src/features/cards/CardBlockNavigator.test.tsx
- Create: frontend/src/features/cards/CardPresentationShell.tsx
- Modify: frontend/src/styles/globals.css

**Interfaces:**
- Consumes CardBlockNavigationItem with anchorId, label, state, filledCount, and totalCount.
- Produces a responsive CardPresentationShell with a navigation landmark named Содержание карточки.

- [ ] **Step 1: Write failing navigation tests**

    const scrollIntoView = vi.fn();
    vi.spyOn(document, "getElementById").mockReturnValue({ scrollIntoView } as never);

    render(<CardBlockNavigator items={[attentionItem, completeItem]} />);
    await user.click(
      screen.getByRole("button", { name: "Положение: нужно заполнить 2 из 4" }),
    );

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
    expect(screen.getByText("Нужно заполнить")).toBeInTheDocument();

- [ ] **Step 2: Run to verify it fails**

Run: pnpm -C frontend test:run -- src/features/cards/CardBlockNavigator.test.tsx

Expected: FAIL because the navigator does not exist.

- [ ] **Step 3: Implement the shell and navigator**

    export type CardBlockNavigationItem = {
      anchorId: string;
      label: string;
      state: CardBlockCompletionState;
      filledCount: number;
      totalCount: number;
    };

    export function CardPresentationShell({ items, children }: PropsWithChildren<Props>) {
      return (
        <div className="card-presentation-shell">
          <CardBlockNavigator items={items} />
          <div className="card-presentation-content">{children}</div>
        </div>
      );
    }

Use buttons, document.getElementById, and scrollIntoView. Track the visible block with IntersectionObserver when available and retain the most recently selected item as the fallback. The document page is the card scroll container; only a too-long navigator list gets its own max-height and overflow-y:auto.

- [ ] **Step 4: Add responsive CSS**

Add card-presentation-shell desktop columns, a sticky card-block-navigator, status variants, focus-visible styling, and a mobile breakpoint that puts the contents list before the card without horizontal overflow. Each state has text/count plus colour.

- [ ] **Step 5: Run tests and formatting**

Run:

    pnpm -C frontend test:run -- src/features/cards/CardBlockNavigator.test.tsx
    pnpm -C frontend exec prettier --check src/features/cards/CardBlockNavigator.tsx src/features/cards/CardPresentationShell.tsx src/styles/globals.css

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

    git add frontend/src/features/cards/CardBlockNavigator.tsx frontend/src/features/cards/CardBlockNavigator.test.tsx frontend/src/features/cards/CardPresentationShell.tsx frontend/src/styles/globals.css
    git commit -m "Add card block navigation shell"

## Task 4: Apply shared completion/navigation to authenticated cards

**Files:**
- Modify: frontend/src/features/cards/FilledCardLayout.tsx
- Modify: frontend/src/features/cards/FilledCardLayout.test.tsx
- Modify: frontend/src/styles/globals.css

**Interfaces:**
- Consumes Tasks 1-3.
- Produces anchors, navigator entries, completion classes, and existing inline-edit behavior for every authenticated surface.

- [ ] **Step 1: Write failing authenticated-card tests**

    render(<FilledCardLayout {...props({ values: requiredValueMissing })} />);

    expect(screen.getByRole("navigation", { name: "Содержание карточки" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "ФИО: нужно заполнить 1 из 2" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("filled-field-name")).toHaveClass("is-required-missing");
    expect(screen.getByLabelText("Блок ФИО")).toHaveAttribute(
      "id",
      "card-block-primary-fio",
    );

Add repeatable-instance coverage proving anchors and counts use that instance's values.

- [ ] **Step 2: Run to verify it fails**

Run: pnpm -C frontend test:run -- src/features/cards/FilledCardLayout.test.tsx --testNamePattern "completion navigator"

Expected: FAIL because the authenticated renderer has no shared shell.

- [ ] **Step 3: Adapt FilledCardLayout**

For each existing surface, derive values with its blockInstanceIds map, calculate status with buildBlockCompletions, and create deterministic anchors shaped as card-block-<surface-key>-<block-id>. Pass the result to CardLayoutRenderer and wrap the surfaces once in CardPresentationShell. Retain canActivateBlock, onActivateBlock, file-ref controls, dirty-draft interception, save/cancel actions, and row-major mobile reflow exactly as they work today.

- [ ] **Step 4: Run the full focused suite**

Run: pnpm -C frontend test:run -- src/features/cards/FilledCardLayout.test.tsx

Expected: PASS, including direct block click, repeatable instance, attachment, and dirty-draft tests.

- [ ] **Step 5: Commit**

Run:

    git add frontend/src/features/cards/FilledCardLayout.tsx frontend/src/features/cards/FilledCardLayout.test.tsx frontend/src/styles/globals.css
    git commit -m "Show authenticated card completion by block"

## Task 5: Apply the same shell to public filling

**Files:**
- Modify: frontend/src/pages/PublicLinkEditPage.tsx
- Modify: frontend/src/pages/PublicLinkEditPage.test.tsx
- Modify: frontend/src/styles/globals.css

**Interfaces:**
- Consumes Tasks 1-3 and existing PublicFieldEditor sequential autosave.
- Produces matching public navigation and live completion state without exposing admin actions.

- [ ] **Step 1: Write failing public-page tests**

    renderPublicPage({ preview: previewWithRequiredEmptyField });

    expect(
      await screen.findByRole("navigation", { name: "Содержание карточки" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Основные сведения: нужно заполнить 1 из 3" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("public-field-department")).toHaveClass("is-required-missing");

Add a save test where a server-confirmed field value changes the navigator from Нужно заполнить to Заполнено. Assert PublicLinkAttachmentsPanel remains after fields and before the submit panel.

- [ ] **Step 2: Run to verify it fails**

Run: pnpm -C frontend test:run -- src/pages/PublicLinkEditPage.test.tsx --testNamePattern "public completion navigator"

Expected: FAIL because public layout has no shared status/navigation.

- [ ] **Step 3: Implement public presentation state**

Lift confirmed public values into PublicEditableCard using an instance-key plus field-id string. PublicFieldEditor reports only server-confirmed saves upward. Pending or failed saves retain their own state and do not mark a blank field as filled. Feed initial plus confirmed values into buildBlockCompletions and CardPresentationShell; keep existing lifecycle denial/cache-purge behavior.

- [ ] **Step 4: Run public page suite**

Run: pnpm -C frontend test:run -- src/pages/PublicLinkEditPage.test.tsx

Expected: PASS, including closed-link receipt, autosave ordering, attachment quota, review comment, and blocked file_ref tests.

- [ ] **Step 5: Commit**

Run:

    git add frontend/src/pages/PublicLinkEditPage.tsx frontend/src/pages/PublicLinkEditPage.test.tsx frontend/src/styles/globals.css
    git commit -m "Match public card completion presentation"

## Task 6: Simplify actions, links, tabs, and attachments

**Files:**
- Create: frontend/src/features/cards/PublicLinkQuickControl.tsx
- Create: frontend/src/features/cards/PublicLinkQuickControl.test.tsx
- Modify: frontend/src/features/cards/PublicLinkReviewPanel.tsx
- Modify: frontend/src/features/cards/PublicLinkReviewPanel.test.tsx
- Modify: frontend/src/features/cards/CardsWorkspace.tsx
- Modify: frontend/src/app/uiText.ts
- Modify: frontend/src/components/common/dataUtils.ts
- Modify: frontend/src/styles/globals.css
- Modify: frontend/src/App.test.tsx

**Interfaces:**
- Consumes existing public-link API/lifecycle actions, existing DOCX/PDF mutations, and CardAttachmentsPanel.
- Produces a compact PublicLinkQuickControl and one accessible Скачать menu in CardActionPanel.

- [ ] **Step 1: Write failing quick-control and workspace tests**

    render(<PublicLinkQuickControl {...eligibleProps} />);
    await user.click(screen.getByRole("button", { name: "Публичная ссылка" }));

    await waitFor(() =>
      expect(createCall.body).toEqual({
        expires_in_days: 7,
        max_attachment_uploads: null,
        review_enabled: true,
        allowed_block_ids: ["block-a"],
        allowed_field_ids: ["field-a"],
      }),
    );
    expect(await screen.findByLabelText("Адрес публичной ссылки")).toHaveValue(
      expect.stringContaining("/public/edit/"),
    );

    render(<PublicLinkQuickControl {...noEligibleFieldsProps} />);
    expect(screen.getByRole("button", { name: "Публичная ссылка" })).toBeDisabled();
    expect(
      screen.getByText(
        "Сначала настройте публичное редактирование полей в шаблоне карточки.",
      ),
    ).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();

Add App assertions for exactly one Скачать control; DOCX/PDF menu items; absent Печатная форма, Документы, Публичные ссылки, История tabs; and Вложения rendered after card fields.

- [ ] **Step 2: Run to verify failures**

Run:

    pnpm -C frontend test:run -- src/features/cards/PublicLinkQuickControl.test.tsx
    pnpm -C frontend test:run -- src/App.test.tsx --testNamePattern "card action panel"

Expected: FAIL because old checkboxes, duplicate download buttons, and tabs remain.

- [ ] **Step 3: Implement PublicLinkQuickControl**

Extract an exported eligiblePublicLinkSchema(blocks, fields) helper from PublicLinkReviewPanel. It returns exactly the active public-visible/public-editable blocks plus non-file_ref/non-static fields, and preserves the existing relationship that a field is eligible only when its block is eligible. Extract a PublicLinkLifecycleDetails component that receives token, cardId, items, and layout; it owns the existing review, request-changes, approve, start-review, and disable mutations.

PublicLinkQuickControl calls eligiblePublicLinkSchema and does not render a checkbox form. With eligible data, call createPublicLink with the approved default payload; retain raw token only in component state; show status, read-only URL, and copy feedback; invalidate existing public-link queries. With no eligible fields, render the approved disabled explanation and issue no POST. Render PublicLinkLifecycleDetails inside a compact disclosure for submitted/changes-requested and older links.

Add the exact local message Выберите хотя бы один публичный блок и поле to runtimeErrorMessageLabel as defense in depth.

- [ ] **Step 4: Refactor CardsWorkspace**

Reduce CardWorkspaceTab to fields. Remove visible print, document, public-link, history, and attachment tabs plus their render branches. Keep affected components/files intact for data/API compatibility. Render FilledCardLayout followed by CardAttachmentsPanel in the same document flow.

Replace Скачать DOCX and Скачать PDF with an accessible menu button containing DOCX and PDF actions. Disable the trigger when no print layout is available. Move Archive to a secondary menu/action that still opens existing ArchiveConfirmation. Put PublicLinkQuickControl in CardActionPanel under can_manage.

- [ ] **Step 5: Run action regressions**

Run:

    pnpm -C frontend test:run -- src/features/cards/PublicLinkQuickControl.test.tsx
    pnpm -C frontend test:run -- src/App.test.tsx --testNamePattern "card action panel|card workspace|public link"
    pnpm -C frontend exec prettier --check src/features/cards/PublicLinkQuickControl.tsx src/features/cards/CardsWorkspace.tsx src/app/uiText.ts src/components/common/dataUtils.ts src/styles/globals.css

Expected: PASS. The no-eligible-fields path is explanatory and makes no network call.

- [ ] **Step 6: Commit**

Run:

    git add frontend/src/features/cards/PublicLinkQuickControl.tsx frontend/src/features/cards/PublicLinkQuickControl.test.tsx frontend/src/features/cards/PublicLinkReviewPanel.tsx frontend/src/features/cards/PublicLinkReviewPanel.test.tsx frontend/src/features/cards/CardsWorkspace.tsx frontend/src/app/uiText.ts frontend/src/components/common/dataUtils.ts frontend/src/styles/globals.css frontend/src/App.test.tsx
    git commit -m "Simplify card actions and public links"

## Task 7: Validate, document, deploy, and prove live behaviour

**Files:**
- Modify: PLANS.md
- Modify: docs/PROJECT_TREE.md only if scripts/project-map.ps1 changes it

**Interfaces:**
- Consumes completed Tasks 1-6.
- Produces local and live release evidence with no migration.

- [ ] **Step 1: Run full local quality gates**

Run:

    pnpm -C frontend lint
    pnpm -C frontend typecheck
    pnpm -C frontend test:run -- src/features/cardLayout/CardLayoutRenderer.test.tsx
    pnpm -C frontend test:run -- src/features/cards/cardCompletion.test.ts src/features/cards/CardBlockNavigator.test.tsx src/features/cards/FilledCardLayout.test.tsx src/features/cards/PublicLinkQuickControl.test.tsx
    pnpm -C frontend test:run -- src/pages/PublicLinkEditPage.test.tsx
    pnpm -C frontend build
    powershell -ExecutionPolicy Bypass -File scripts/project-map.ps1 -Check

Expected: all named tests, lint, typecheck, build, and project-map pass. If the existing full App.test.tsx worker limitation remains, record it verbatim rather than claiming a green full suite.

- [ ] **Step 2: Update PLANS.md**

Append a checkpoint that records the new card surface, no-migration decision, command results, bundle names, and any pre-existing test-runner limitation.

- [ ] **Step 3: Commit and publish implementation**

Run:

    git add frontend PLANS.md docs/PROJECT_TREE.md
    git commit -m "Refactor role aware card workspace"
    powershell -ExecutionPolicy Bypass -File scripts/push-git.ps1 -SkipCheck -Message "Refactor role aware card workspace"

- [ ] **Step 4: Deploy**

Run:

    powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1
    powershell -ExecutionPolicy Bypass -File scripts/deploy-frontend.ps1 -SkipBuild

Expected: server checkout, service/API health, and same-origin frontend/API smoke checks pass.

- [ ] **Step 5: Run live Browser QA**

Target flow: Карточки → card 213 → block navigator → block edit / public-link action → expected visible state.

At desktop and 390 x 844 mobile verify:

1. Page identity, nonblank card, no framework overlay, and no relevant console warning/error.
2. Full-page scrolling shows later blocks while the contents navigator remains usable; clicking a navigator item scrolls to its anchor.
3. Required empty fields/blocks show attention, filled data shows completion, optional empty values stay neutral.
4. Print/documents/public-links/history tabs are absent and attachments are below card fields.
5. One download trigger offers DOCX/PDF. Card 213 shows no-eligible-fields explanation and causes no POST.
6. A disposable card configured with eligible public fields creates/copies a link in one click; archive/disable the temporary link after validation.
7. The public URL shows matching contents/status/attachments and preserves autosave plus submit behavior.

- [ ] **Step 6: Commit release evidence and confirm synchronized heads**

Run:

    git add PLANS.md
    git commit -m "Record role aware card release proof"
    git push origin main
    git status --short --branch
    ssh -o BatchMode=yes root@registoryengine "cd /opt/reg_engine && git rev-parse HEAD"

Expected: clean local main, origin/main, and server checkout at the same commit.
