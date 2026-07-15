# Explicit Card Draft Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Create cards only through explicit draft saving, then render creation, administrative editing, and public filling with one schema-driven base block and navigation presentation.

**Architecture:** Add a transactional authenticated endpoint that creates a card draft and persists local public-access settings, but never creates a public link. Extract the visual base rows and the sticky action beside navigation into small shared React components. Creation uses an editable setup mode; saved cards and public editing reuse the same rows in read-only modes, while existing dynamic-field persistence stays unchanged.

**Tech Stack:** FastAPI, SQLAlchemy, Pydantic, React, TypeScript, TanStack Query, Vitest, pytest, Vite, CSS.

## Global Constraints

- Backend enforces permissions; frontend controls are only UX hints.
- Every write remains audit-backed and schema-driven.
- UI remains Russian-first; no employee-specific hardcoding.
- Selecting organization/template/name, navigating, or touching disabled inputs must not create a card or send a write request.
- Organization starts empty every time. Exactly one available template is selected automatically.
- Only "Сохранить черновик" creates a draft; creating a public link is unavailable until a card exists.
- Public editing shows organization, template, name and public access only for reading; its API accepts only link-permitted dynamic values.
- Preserve existing CSS visual language, block completion states, responsive layout, and sticky navigation. Do not reset global styles.
- This supersedes the prior unified-presentation plan only in automatic first-value creation and pre-draft public-link creation.

---

## File Structure

- backend/app/schemas/cards.py — request contract for explicit draft creation.
- backend/app/services/cards.py — transaction that creates a card, preserves draft, and saves public access.
- backend/app/api/v1/endpoints/cards.py — POST organization-scoped draft endpoint.
- backend/tests/test_registry_card_services.py and backend/tests/test_api_phase_1g.py — service, rollback, audit and HTTP tests.
- frontend/src/api/client.ts and frontend/src/api/types.ts — typed browser contract.
- frontend/src/features/cards/CardBaseBlockSurface.tsx — shared creation/admin/public base block.
- frontend/src/features/cards/CardDraftActionRail.tsx — sticky Save Draft and status surface.
- frontend/src/features/cards/CardPresentationShell.tsx — sidebar composition slot.
- frontend/src/features/cards/SingleStageCardCreation.tsx — local pre-draft setup and disabled template controls.
- frontend/src/features/cards/CardsWorkspace.tsx and FilledCardLayout.tsx — unified saved-card base surface.
- backend/app/schemas/public_links.py, backend/app/services/public_links.py, backend/app/api/v1/endpoints/public_links.py, frontend/src/pages/PublicLinkEditPage.tsx — safe public base metadata.
- Related test files, frontend/src/styles/globals.css, and PLANS.md — regressions and release evidence.

### Task 1: Add the explicit atomic draft-card command

**Files:**
- Modify: backend/app/schemas/cards.py lines 50-90.
- Modify: backend/app/services/cards.py lines 255-310.
- Modify: backend/app/api/v1/endpoints/cards.py lines 15-165.
- Test: backend/tests/test_registry_card_services.py.
- Test: backend/tests/test_api_phase_1g.py.

**Interfaces:**
- Consumes: CardDraftCreateRequest with display name, template id, public access.
- Produces: POST /api/v1/organizations/{organization_id}/cards/draft returning CardSummaryRead.
- Preserves: old first-save and draft-plus-link APIs for existing callers; new creation UI does not call either.

- [ ] **Step 1: Write failing service tests**

Add permitted, denied and rollback cases:

~~~python
created = CardService(db_session).create_card_draft_for_actor(
    actor_user_id=administrator.id,
    organization_id=organization.id,
    display_name="Новая карточка",
    card_template_id=template.id,
    public_access=CardPublicAccessUpdate(public_edit_enabled=True),
)

assert created.lifecycle_status == "draft"
assert created.display_name == "Новая карточка"
assert PublicLinkService(db_session).list_for_card(created.id) == []
~~~

Use a template without required fields to prove explicit save still returns draft. Monkeypatch CardPublicAccessService.update_for_actor to raise; then assert no matching Card and no public-access rows persisted.

- [ ] **Step 2: Verify RED**

Run:

~~~powershell
pytest backend/tests/test_registry_card_services.py -k "explicit_draft or draft_creation_rolls_back" -v
~~~

Expected: FAIL because the request type and service method do not exist.

- [ ] **Step 3: Implement schema and service**

Add:

~~~python
class CardDraftCreateRequest(BaseModel):
    display_name: str | None = None
    card_template_id: UUID
    public_access: CardPublicAccessUpdate = Field(default_factory=CardPublicAccessUpdate)
~~~

Implement:

~~~python
def create_card_draft_for_actor(
    self,
    *,
    actor_user_id: UUID,
    organization_id: UUID,
    display_name: str | None,
    card_template_id: UUID,
    public_access: CardPublicAccessUpdate,
) -> Card:
~~~

Inside a nested transaction, use the existing organization-centered creation service, rename the private draft-preservation helper to _preserve_draft_lifecycle and call it after creation, then call CardPublicAccessService.update_for_actor. Do not create a public token. Let exceptions escape the savepoint so the request transaction rolls back fully.

- [ ] **Step 4: Add the endpoint and API tests**

Add POST /api/v1/organizations/{organization_id}/cards/draft with response CardSummaryRead and HTTP 201. Map failures with raise_service_http_error. Assert 201, draft response, saved public settings, one card audit event, no public-link audit event, and 403 for an actor without card-management permission.

- [ ] **Step 5: Verify GREEN and commit**

Run:

~~~powershell
pytest backend/tests/test_registry_card_services.py backend/tests/test_api_phase_1g.py -q
~~~

Expected: PASS or only documented disposable-database skips.

~~~bash
git add backend/app/schemas/cards.py backend/app/services/cards.py backend/app/api/v1/endpoints/cards.py backend/tests/test_registry_card_services.py backend/tests/test_api_phase_1g.py
git commit -m "feat: save card drafts explicitly"
~~~

### Task 2: Expose the explicit draft command to React

**Files:**
- Modify: frontend/src/api/types.ts lines 360-430.
- Modify: frontend/src/api/client.ts lines 450-510.
- Test: frontend/src/features/cards/CardsWorkspace.test.tsx.

**Interfaces:**
- Consumes: CardDraftCreatePayload.
- Produces: createOrganizationCardDraft(token, organizationId, payload): Promise<CardSummaryRead>.
- Removes from creation flow: calls to firstSaveOrganizationCard and createOrganizationCardDraftPublicLink.

- [ ] **Step 1: Write the failing browser-client contract test**

Configure the creation mock to click Save Draft; assert the request ends with /organizations/organization-1/cards/draft and its JSON contains:

~~~ts
{
  card_template_id: "template-1",
  public_access: { public_edit_enabled: true }
}
~~~

- [ ] **Step 2: Verify RED**

Run:

~~~powershell
npm --prefix frontend test -- CardsWorkspace.test.tsx --run
~~~

Expected: FAIL because no draft client function exists.

- [ ] **Step 3: Implement the client contract**

Add:

~~~ts
export type CardDraftCreatePayload = {
  display_name?: string | null;
  card_template_id: string;
  public_access: CardPublicAccessPayload;
};

export async function createOrganizationCardDraft(
  token: string,
  organizationId: string,
  payload: CardDraftCreatePayload,
) {
  return apiRequest<CardSummaryRead>(
    "/api/v1/organizations/" + organizationId + "/cards/draft",
    { method: "POST", token, body: payload },
  );
}
~~~

Do not alter generic creation APIs or public-link APIs.

- [ ] **Step 4: Verify GREEN and commit**

Run:

~~~powershell
npm --prefix frontend test -- CardsWorkspace.test.tsx --run
npm --prefix frontend run typecheck
~~~

Expected: PASS.

~~~bash
git add frontend/src/api/client.ts frontend/src/api/types.ts frontend/src/features/cards/CardsWorkspace.test.tsx
git commit -m "feat: expose explicit card draft client"
~~~

### Task 3: Build the reusable base surface and sticky action rail

**Files:**
- Create: frontend/src/features/cards/CardBaseBlockSurface.tsx.
- Create: frontend/src/features/cards/CardBaseBlockSurface.test.tsx.
- Create: frontend/src/features/cards/CardDraftActionRail.tsx.
- Create: frontend/src/features/cards/CardDraftActionRail.test.tsx.
- Modify: frontend/src/features/cards/CardPresentationShell.tsx.
- Modify: frontend/src/styles/globals.css lines 2140-2450 and 5370-5450.

**Interfaces:**
- Consumes: base rows plus optional public-access content and footer.
- Produces: CardBaseBlockSurface modes creation, admin and public; CardDraftActionRail states setup, draft and active.
- Preserves: CardBlockNavigator title, active-section observer, item classes and current navigation behavior.

- [ ] **Step 1: Write failing component tests**

Test output-only public mode:

~~~tsx
render(
  <CardBaseBlockSurface
    id="card-base-block"
    mode="public"
    organization={{ label: "Организация карточки", value: "Администрация" }}
    template={{ label: "Шаблон карточки", value: "Муниципальный служащий" }}
    displayName={{ label: "Наименование карточки", value: "Карточка" }}
  />,
);

expect(screen.getByText("Администрация")).toBeInTheDocument();
expect(screen.queryByRole("combobox", { name: "Организация карточки" })).not.toBeInTheDocument();
expect(screen.queryByRole("textbox", { name: "Наименование карточки" })).not.toBeInTheDocument();
~~~

Test the action rail is disabled without a complete setup, invokes onSaveDraft once when enabled, and renders a role=status result after saving.

- [ ] **Step 2: Verify RED**

Run:

~~~powershell
npm --prefix frontend test -- CardBaseBlockSurface.test.tsx CardDraftActionRail.test.tsx --run
~~~

Expected: FAIL because neither component exists.

- [ ] **Step 3: Implement focused shared components**

Export:

~~~ts
export type CardBaseValue = {
  label: string;
  value: string;
  options?: readonly { id: string; label: string }[];
  onChange?: (value: string) => void;
  placeholder?: string;
};

export type CardBaseBlockSurfaceProps = {
  id: string;
  mode: "creation" | "admin" | "public";
  organization: CardBaseValue;
  template: CardBaseValue;
  displayName: CardBaseValue;
  publicAccessContent?: ReactNode;
  footer?: ReactNode;
  disabled?: boolean;
};
~~~

Render selects/input only for creation. Admin and public render the same labelled rows as read-only output. Put public access inside a details element with class card-base-public-access and no open attribute. CardDraftActionRail renders a Russian setup hint plus Save Draft, or a non-button Draft/Active status.

- [ ] **Step 4: Add shell slot and focused styles**

Extend CardPresentationShell props with navigatorAction. Compose left rail as an aside containing CardBlockNavigator and the optional action. Add only classes card-presentation-sidebar, card-draft-action-rail, card-base-block-row, card-base-block-output and card-base-public-access. Make the sidebar sticky as one desktop unit and normal flow below 900px.

- [ ] **Step 5: Verify GREEN and commit**

Run:

~~~powershell
npm --prefix frontend test -- CardBaseBlockSurface.test.tsx CardDraftActionRail.test.tsx --run
npm --prefix frontend run lint
npm --prefix frontend run typecheck
~~~

Expected: focused tests and TypeScript pass; record existing unrelated lint debt verbatim.

~~~bash
git add frontend/src/features/cards/CardBaseBlockSurface.tsx frontend/src/features/cards/CardBaseBlockSurface.test.tsx frontend/src/features/cards/CardDraftActionRail.tsx frontend/src/features/cards/CardDraftActionRail.test.tsx frontend/src/features/cards/CardPresentationShell.tsx frontend/src/styles/globals.css
git commit -m "feat: add shared card base surface"
~~~

### Task 4: Require explicit draft saving in card creation

**Files:**
- Modify: frontend/src/features/cards/SingleStageCardCreation.tsx.
- Modify: frontend/src/features/cards/CardsWorkspace.test.tsx lines 150-410.
- Test: frontend/src/features/cards/CardBlockNavigator.test.tsx.

**Interfaces:**
- Consumes: creation preview, createOrganizationCardDraft, shared base surface and action rail.
- Produces: a draft only after button click, then invokes onCardCreated(card.id) to open normal saved-card editor.
- Prohibits: dynamic-field write before draft creation.

- [ ] **Step 1: Replace automatic-save tests**

Replace first-value and pre-draft-link tests with:

~~~tsx
expect(screen.getByLabelText("Организация карточки")).toHaveValue("");
expect(screen.getByLabelText("Шаблон карточки")).toHaveValue("template-1");
expect(screen.getByRole("button", { name: "Сохранить черновик" })).toBeDisabled();
expect(screen.getByLabelText("Наименование")).toBeDisabled();

fireEvent.change(screen.getByLabelText("Организация карточки"), {
  target: { value: organization.id },
});
expect(screen.getByRole("button", { name: "Сохранить черновик" })).toBeEnabled();
~~~

After click assert exactly one draft request, no first-save or draft-public-link request, and onOpenCreatedCard receives draft-card-1.

- [ ] **Step 2: Verify RED**

Run:

~~~powershell
npm --prefix frontend test -- CardsWorkspace.test.tsx CardBlockNavigator.test.tsx --run
~~~

Expected: FAIL because current component selects the first organization and persists on first field value.

- [ ] **Step 3: Refactor setup state and handler**

Initialize organization as empty and the single template as selected:

~~~ts
const [state, setState] = useState<CreationState>({
  organizationId: "",
  templateId: templates.length === 1 ? templates[0].id : "",
  displayName: "",
  values: {},
  publicAccess: { public_view_enabled: true, public_edit_enabled: true, fields: [] },
});
~~~

Delete saveFirstValue and createDraftPublicLink. Save only from:

~~~ts
async function saveDraft() {
  if (!state.organizationId || !templateId) return;
  setIsSaving(true);
  try {
    const card = await createOrganizationCardDraft(token, state.organizationId, {
      display_name: state.displayName.trim() || undefined,
      card_template_id: templateId,
      public_access: publicAccessPayload(),
    });
    await onCardCreated(card.id);
  } finally {
    setIsSaving(false);
  }
}
~~~

Keep preview loading dynamic but disable every FieldEditorControl pre-draft and do not attach a write handler. Display the exact hint: "Сначала сохраните черновик — после этого можно заполнять поля шаблона." Remove the pre-draft public-link button and automatic-save hint.

- [ ] **Step 4: Verify GREEN and commit**

Run:

~~~powershell
npm --prefix frontend test -- CardsWorkspace.test.tsx CardBlockNavigator.test.tsx --run
npm --prefix frontend run typecheck
npm --prefix frontend run build
~~~

Expected: PASS.

~~~bash
git add frontend/src/features/cards/SingleStageCardCreation.tsx frontend/src/features/cards/CardsWorkspace.test.tsx frontend/src/features/cards/CardBlockNavigator.test.tsx
git commit -m "feat: require explicit card draft save"
~~~

### Task 5: Use the same base surface for saved administrative cards

**Files:**
- Modify: frontend/src/features/cards/CardsWorkspace.tsx lines 620-930.
- Modify: frontend/src/features/cards/FilledCardLayout.tsx lines 55-210.
- Modify: frontend/src/features/cards/CardsWorkspace.test.tsx.
- Modify: frontend/src/features/cards/FilledCardLayout.test.tsx.
- Modify: frontend/src/styles/globals.css.

**Interfaces:**
- Consumes: saved CardRead, CardPublicAccessRead, repeatable controls and PublicLinkQuickControl.
- Produces: read-only shared base, collapsed public-access panel and status in the sticky action rail.
- Preserves: useBlockEditor, dynamic field autosave, repeatable blocks, downloads and archive controls.

- [ ] **Step 1: Write failing saved-card tests**

Assert a saved draft has a labelled base block, no organization combobox, and a role=status label named Status Card containing Draft. Assert Public Access is not visible before opening its details summary. When opened, public switches and picker appear only for card.can_manage. Assert creation never renders a public-link action.

- [ ] **Step 2: Verify RED**

Run:

~~~powershell
npm --prefix frontend test -- CardsWorkspace.test.tsx FilledCardLayout.test.tsx --run
~~~

Expected: FAIL because CardBaseBlock still uses metadata list and direct expanded access controls.

- [ ] **Step 3: Replace only base-block composition**

Replace local CardBaseBlock with CardBaseBlockSurface mode=admin. Supply organization/template/name as outputs. Put global access switches, picker, repeatable controls and PublicLinkQuickControl into publicAccessContent. Extend FilledCardLayoutProps with navigatorAction and forward it to CardPresentationShell:

~~~tsx
<CardDraftActionRail
  state={card.lifecycle_status === "active" ? "active" : "draft"}
  aria-label="Статус карточки"
/>
~~~

Do not change field storage or lifecycle synchronization.

- [ ] **Step 4: Verify GREEN and commit**

Run:

~~~powershell
npm --prefix frontend test -- CardsWorkspace.test.tsx FilledCardLayout.test.tsx --run
npm --prefix frontend run lint
npm --prefix frontend run typecheck
~~~

Expected: PASS or documented unrelated gate failure only.

~~~bash
git add frontend/src/features/cards/CardsWorkspace.tsx frontend/src/features/cards/FilledCardLayout.tsx frontend/src/features/cards/CardsWorkspace.test.tsx frontend/src/features/cards/FilledCardLayout.test.tsx frontend/src/styles/globals.css
git commit -m "feat: unify saved card base presentation"
~~~

### Task 6: Render a safe read-only base block in public editing

**Files:**
- Modify: backend/app/services/public_links.py.
- Modify: backend/app/schemas/public_links.py lines 121-130.
- Modify: backend/app/api/v1/endpoints/public_links.py lines 425-480.
- Test: existing public-link backend tests.
- Modify: frontend/src/api/types.ts lines 752-760.
- Modify: frontend/src/pages/PublicLinkEditPage.tsx.
- Modify: frontend/src/pages/PublicLinkEditPage.test.tsx.

**Interfaces:**
- Consumes: existing link-authorized preview.
- Produces: public preview metadata organization_name, card_template_name and lifecycle_status for display only.
- Prohibits: public mutation of metadata and public access.

- [ ] **Step 1: Write failing API and page tests**

Add preview data and assert Organization Card label plus the actual organization name appear, but no organization combobox and no Create Public Link button appear. Submit a public field-update JSON body with extra organization_id and assert HTTP 422; reload the card and prove organization/template/name/public access did not change.

- [ ] **Step 2: Verify RED**

Run:

~~~powershell
pytest backend/tests -k "public_link_preview" -v
npm --prefix frontend test -- PublicLinkEditPage.test.tsx --run
~~~

Expected: FAIL because current preview has no organization/template/status metadata and public page has no base surface.

- [ ] **Step 3: Extend only the safe projection**

Add to internal service dataclass, schema and TypeScript:

~~~python
organization_name: str
card_template_name: str
lifecycle_status: str
~~~

Populate from card/template/organization already resolved for the public link. In PublicLinkEditPage render CardBaseBlockSurface mode=public in CardPresentationShell beforeContent. It contains output rows and a collapsed non-interactive Public Access summary. Add CardDraftActionRail only as status, never as save action. Keep dynamic controls restricted to server-provided public_editable values.

- [ ] **Step 4: Verify GREEN and commit**

Run:

~~~powershell
pytest backend/tests -k "public_link_preview" -v
npm --prefix frontend test -- PublicLinkEditPage.test.tsx --run
npm --prefix frontend run typecheck
npm --prefix frontend run build
~~~

Expected: PASS.

~~~bash
git add backend/app/services/public_links.py backend/app/schemas/public_links.py backend/app/api/v1/endpoints/public_links.py frontend/src/api/types.ts frontend/src/pages/PublicLinkEditPage.tsx frontend/src/pages/PublicLinkEditPage.test.tsx
git commit -m "feat: show readonly public card base"
~~~

### Task 7: Verify, deploy and prove all three surfaces

**Files:**
- Modify: PLANS.md.

**Interfaces:**
- Consumes: completed backend and frontend tasks.
- Produces: release evidence, deployed main and live proof for creation, saved card and public link.

- [ ] **Step 1: Run targeted and aggregate checks**

Run:

~~~powershell
pytest backend/tests/test_registry_card_services.py backend/tests/test_api_phase_1g.py -q
npm --prefix frontend test -- CardsWorkspace.test.tsx FilledCardLayout.test.tsx PublicLinkEditPage.test.tsx CardBaseBlockSurface.test.tsx CardDraftActionRail.test.tsx --run
npm --prefix frontend run lint
npm --prefix frontend run typecheck
npm --prefix frontend run build
powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote
~~~

Expected: focused tests, typecheck and build pass. If aggregate checks stop only on known unrelated Ruff format drift, record each exact file and do not alter unrelated code.

- [ ] **Step 2: Publish verified main**

Update PLANS.md with commands, results, deployed commit and known external gate state. Then run:

~~~powershell
git add PLANS.md
git commit -m "docs: record explicit draft workflow release"
git push origin main
powershell -ExecutionPolicy Bypass -File scripts/deploy-frontend.ps1
powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1
~~~

Expected: server checkout fast-forwards, service active, same-origin frontend/API smoke passes.

- [ ] **Step 3: Prove behavior in the in-app browser**

At desktop and narrow width verify:

1. Creation opens with blank organization, one template auto-selected, disabled draft save, locked dynamic fields and no creation request.
2. Choosing organization then saving creates one draft, locks base fields, shows Draft, and unlocks fields.
3. Completing required fields switches status to Active; only the saved management card offers public-link creation.
4. Public link uses matching base/block styles but has no editable organization/template/name/public access, attachment or archive action.

Capture screenshot evidence, confirm no blank surface/framework overlay/relevant console error, and append live evidence to PLANS.md when needed.

- [ ] **Step 4: Commit post-deploy evidence if needed**

~~~bash
git add PLANS.md
git commit -m "docs: record explicit draft workflow proof"
git push origin main
~~~

Expected: git status reports clean main tracking origin/main.

