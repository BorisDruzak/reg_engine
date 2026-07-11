# Public card creation links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an administrator create an indefinite public link that starts a new schema-driven card only when its first public field is saved, and manage the link and its created cards safely.

**Architecture:** Add a separate creation-link aggregate instead of overloading `CardPublicLink`: it holds the source registry/template, allowed organisations, encrypted parent token, and close state. On the public page, an atomic first-save service validates the parent token and selected organisation, creates the card plus a normal child `CardPublicLink`, persists encrypted URL material for authorised administration, and writes the first field value before returning the child URL. The existing public edit page continues to own all subsequent saves.

**Tech Stack:** FastAPI, SQLAlchemy 2, Alembic/PostgreSQL, Pydantic 2, React, TypeScript, TanStack Query, Vitest, Pytest, `cryptography` Fernet.

## Global Constraints

- Keep cards, links, organisations, users, fields, and blocks schema-driven and soft-archived; never make a fixed business field for the URL.
- Enforce every access decision in backend services. The creation-link organisation allowlist is the only authority for a public recipient; it does not grant administrator rights.
- Persist token hashes for lookup and only Fernet-encrypted raw tokens for authorised URL display. Never write raw tokens to audits, logs, browser localStorage, or unprotected API responses.
- Parent creation links and child public-edit links are indefinite by default. Closing a parent denies only new creations; existing children remain usable until individually closed.
- Keep public browser-visible text Russian-first. Translate new API failures at the browser boundary.
- Preserve existing review endpoints and historical public links, but remove the public submit-for-review UI.
- Use `main` directly, commit focused checkpoints, test migration `0027` on a disposable PostgreSQL database before production, take a fresh production backup, and update `PLANS.md` with real verification evidence.

## File Structure

- Create: `backend/app/models/card_creation_link.py` — parent link, allowed-organisation and created-card relation models.
- Create: `backend/app/schemas/card_creation_links.py` — authenticated and public request/response schemas.
- Create: `backend/app/services/card_creation_links.py` — token encryption, scope checks, preview, first-save transaction, listing, close, and card metadata lookup.
- Create: `backend/app/api/v1/endpoints/card_creation_links.py` — administrator and unauthenticated public endpoints.
- Create: `backend/migrations/versions/0027_card_creation_links.py` — normalized tables, constraints, indexes, and downgrade.
- Create: `backend/tests/test_card_creation_links.py` — service/API lifecycle, access, atomicity, continuation, and audit scenarios.
- Create: `frontend/src/features/cards/CardCreationLinksPanel.tsx` — creation form and authorised list/close UI.
- Create: `frontend/src/features/cards/CardCreationLinksPanel.test.tsx` — menu, form, URLs, and close interaction.
- Create: `frontend/src/pages/PublicCardCreationPage.tsx` — virtual public template form and first-save handoff.
- Create: `frontend/src/pages/PublicCardCreationPage.test.tsx` — organisation selection, no draft before save, first-save redirect, and closed receipt.
- Modify: `backend/pyproject.toml`, `backend/app/core/config.py`, `.env.example` — Fernet dependency and runtime-only encryption-key setting.
- Modify: `backend/app/models/public_link.py`, `backend/app/schemas/public_links.py`, `backend/app/services/public_links.py` — nullable public-link expiry for indefinite child links while ordinary links keep their seven-day default.
- Modify: `backend/app/models/__init__.py`, `backend/app/api/v1/router.py`, `backend/tests/test_migrations.py` — model/router registration and migration metadata assertions.
- Modify: `backend/app/schemas/cards.py`, `backend/app/services/cards.py`, `backend/app/api/v1/endpoints/cards.py` — safe card organisation transfer payload and existing-card creation-link metadata.
- Modify: `frontend/src/api/types.ts`, `frontend/src/api/client.ts`, `frontend/src/app/router.tsx` — new typed API client and `/public/create/:rawToken` route.
- Modify: `frontend/src/features/cards/CardsWorkspace.tsx`, `frontend/src/styles/globals.css` — card-list creation menu, base-block organisation control/continuation URL, and responsive layout.
- Modify: `frontend/src/pages/PublicLinkEditPage.tsx`, `frontend/src/pages/PublicLinkEditPage.test.tsx` — remove only the visible submission panel and preserve existing edit/attachment flow.
- Modify: `PLANS.md` — phase status, migration and live-proof evidence after work is actually complete.

---

### Task 1: Persist creation-link data and protect displayable URLs

**Files:**
- Create: `backend/app/models/card_creation_link.py`
- Create: `backend/migrations/versions/0027_card_creation_links.py`
- Modify: `backend/app/models/__init__.py`
- Modify: `backend/app/models/public_link.py`
- Modify: `backend/app/schemas/public_links.py`
- Modify: `backend/app/services/public_links.py`
- Modify: `backend/app/core/config.py`
- Modify: `backend/pyproject.toml`
- Modify: `.env.example`
- Modify: `backend/tests/test_migrations.py`
- Test: `backend/tests/test_card_creation_links.py`

**Interfaces:**
- Consumes: `Card`, `CardPublicLink`, `CardTemplate`, `Organization`, `User`, `hash_public_token()`.
- Produces: `CardCreationLink`, `CardCreationLinkOrganization`, `CardCreationLinkCard`, `CreationLinkTokenCipher`, and Alembic revision `0027_card_creation_links`.

- [ ] **Step 1: Write the migration/model failures before adding tables**

```python
def test_creation_link_metadata_and_migration_create_normalized_tables() -> None:
    assert {
        "card_creation_links",
        "card_creation_link_organizations",
        "card_creation_link_cards",
    } <= set(Base.metadata.tables)
    sql = _render_upgrade_sql("head")
    assert "CREATE TABLE card_creation_links" in sql
    assert "CREATE TABLE card_creation_link_organizations" in sql
    assert "CREATE TABLE card_creation_link_cards" in sql
    assert "uq_card_creation_links_token_hash" in sql
    assert "ALTER COLUMN expires_at DROP NOT NULL" in sql
```

- [ ] **Step 2: Run the focused migration test and confirm the red state**

Run: `python -m pytest backend/tests/test_migrations.py -q`

Expected: FAIL because the three tables and revision `0027_card_creation_links` do not yet exist.

- [ ] **Step 3: Add models, ciphertext storage, configuration and migration**

```python
# backend/app/models/card_creation_link.py
class CardCreationLink(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    __tablename__ = "card_creation_links"
    registry_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("registries.id"))
    card_template_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("card_templates.id"))
    token_hash: Mapped[str] = mapped_column(String, nullable=False)
    token_ciphertext: Mapped[str] = mapped_column(Text, nullable=False)
    created_by: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("users.id"))
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    closed_by: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("users.id"))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

class CardCreationLinkOrganization(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "card_creation_link_organizations"
    creation_link_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("card_creation_links.id"))
    organization_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("organizations.id"))

class CardCreationLinkCard(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    __tablename__ = "card_creation_link_cards"
    creation_link_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("card_creation_links.id"))
    card_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("cards.id"), unique=True)
    child_public_link_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("card_public_links.id"), unique=True)
    child_token_ciphertext: Mapped[str] = mapped_column(Text, nullable=False)
```

```python
# backend/app/core/config.py
public_link_token_encryption_key: str | None = Field(
    default=None,
    validation_alias="REG_ENGINE_PUBLIC_LINK_TOKEN_ENCRYPTION_KEY",
)

# validate_runtime_configuration(settings)
if app_env in PRODUCTION_LIKE_ENVS and not settings.public_link_token_encryption_key:
    raise RuntimeError(
        "REG_ENGINE_PUBLIC_LINK_TOKEN_ENCRYPTION_KEY must be configured in production-like environments."
    )
```

Add `cryptography>=43,<46` to backend runtime dependencies. In migration `0027`, create unique constraints for token hash, `(creation_link_id, organization_id)`, and `(creation_link_id, card_id)`; add indexes for token lookup, parent-link cards, and card metadata lookup. The downgrade drops relation tables before `card_creation_links`. Add only the placeholder `REG_ENGINE_PUBLIC_LINK_TOKEN_ENCRYPTION_KEY=change-me` to `.env.example`, never a real key.

In the same migration, alter `card_public_links.expires_at` to nullable. Change the model and public-link schemas to `datetime | None`, preserve the existing seven-day value in `create_public_link_for_actor()`, and update `_require_not_expired()` so it returns immediately for `None`. Add `create_indefinite_public_link_for_new_card()` for the child only; it passes `expires_at=None` and does not weaken the ordinary public-link expiry validation.

- [ ] **Step 4: Run metadata and SQL rendering tests**

Run: `python -m pytest backend/tests/test_migrations.py -q`

Expected: PASS and SQL contains all three tables, the hash uniqueness constraint, relation uniqueness constraints, and revision `0027_card_creation_links`.

- [ ] **Step 5: Commit the migration/model checkpoint**

```powershell
git add backend/pyproject.toml backend/app/core/config.py backend/app/models backend/migrations/versions/0027_card_creation_links.py backend/tests/test_migrations.py .env.example
git commit -m "Add card creation link storage"
```

### Task 2: Implement authenticated creation-link administration and card organisation move

**Files:**
- Create: `backend/app/schemas/card_creation_links.py`
- Create: `backend/app/services/card_creation_links.py`
- Create: `backend/app/api/v1/endpoints/card_creation_links.py`
- Modify: `backend/app/api/v1/router.py`
- Modify: `backend/app/schemas/cards.py`
- Modify: `backend/app/services/cards.py`
- Modify: `backend/app/api/v1/endpoints/cards.py`
- Test: `backend/tests/test_card_creation_links.py`

**Interfaces:**
- Consumes: Task 1 models, `CardService._require_card_permission`, `PermissionService`, `PublicLinkService`, `AuditService`.
- Produces: `create_for_actor`, `list_for_actor`, `close_for_actor`, `list_for_card_for_actor`, `move_card_organization_for_actor`, and protected API routes.

- [ ] **Step 1: Write failing authenticated lifecycle/access tests**

```python
def test_admin_creation_link_list_exposes_parent_and_child_urls_only_to_authorized_actor(...) -> None:
    created = service.create_for_actor(
        actor_user_id=admin.id,
        registry_id=registry.id,
        card_template_id=template.id,
        organization_ids=[organization.id],
    )
    assert created.parent_url.endswith(created.raw_token)
    with pytest.raises(PermissionDeniedError):
        service.list_for_actor(actor_user_id=outsider.id, registry_id=registry.id)

def test_move_card_organization_requires_management_scope_for_old_and_new_org(...) -> None:
    moved = CardService(db_session).move_card_organization_for_actor(
        actor_user_id=admin.id,
        card_id=card.id,
        target_organization_id=target.id,
    )
    assert moved.organization_id == target.id
```

- [ ] **Step 2: Run those focused tests and verify they fail**

Run: `python -m pytest backend/tests/test_card_creation_links.py -q`

Expected: FAIL because schemas, service methods, and routes do not exist.

- [ ] **Step 3: Add secure token codec, administrative service and routes**

```python
# backend/app/services/card_creation_links.py
class CreationLinkTokenCipher:
    def __init__(self, key: str) -> None:
        self._fernet = Fernet(key.encode("ascii"))

    def encrypt(self, raw_token: str) -> str:
        return self._fernet.encrypt(raw_token.encode("utf-8")).decode("ascii")

    def decrypt(self, ciphertext: str) -> str:
        return self._fernet.decrypt(ciphertext.encode("ascii")).decode("utf-8")

class CardCreationLinkService:
    def create_for_actor(self, *, actor_user_id: UUID, registry_id: UUID,
                         card_template_id: UUID, organization_ids: Sequence[UUID]) -> CreationLinkToken: ...
    def list_for_actor(self, *, actor_user_id: UUID, registry_id: UUID) -> list[CardCreationLinkReadModel]: ...
    def close_for_actor(self, *, actor_user_id: UUID, creation_link_id: UUID) -> CardCreationLink: ...
    def list_for_card_for_actor(self, *, actor_user_id: UUID, card_id: UUID) -> list[CardCreationLinkCardReadModel]: ...
```

Add these routes with authentication and explicit response models:

```text
POST   /api/v1/registries/{registry_id}/card-creation-links
GET    /api/v1/registries/{registry_id}/card-creation-links
DELETE /api/v1/card-creation-links/{creation_link_id}
GET    /api/v1/cards/{card_id}/creation-links
PATCH  /api/v1/cards/{card_id}/organization
```

The final route moves the active card in place only after `cards.manage` is confirmed for both the old and target organisations; it validates the same registry and active organisation, updates `organization_id`, clears incompatible `org_unit_id`, and writes one `update` audit event containing both organisation IDs. Do not use the existing historical-copy `/transfer` route for this form because the requested control edits this card and must preserve its child public link.

Return parent/child URLs only after `cards.manage` is checked for the registry/card scope. Build URLs at API serialization time from decrypted tokens; keep both ciphertext columns out of all Pydantic response schemas and audit payloads. Closing sets `closed_at`/`closed_by`, records `card_creation_link.close`, and never changes `CardPublicLink` rows.

- [ ] **Step 4: Run backend lifecycle, access, audit and organisation-move tests**

Run: `python -m pytest backend/tests/test_card_creation_links.py backend/tests/test_public_link_transfer_audit_services.py -q`

Expected: PASS, including denial for an actor without both organisation scopes and no ciphertext/token hash in public JSON.

- [ ] **Step 5: Commit the administration/API checkpoint**

```powershell
git add backend/app/schemas backend/app/services backend/app/api/v1 backend/app/schemas/cards.py backend/app/services/cards.py backend/tests/test_card_creation_links.py
git commit -m "Add card creation link administration"
```

### Task 3: Implement public virtual preview and atomic first-save handoff

**Files:**
- Modify: `backend/app/schemas/card_creation_links.py`
- Modify: `backend/app/services/card_creation_links.py`
- Modify: `backend/app/api/v1/endpoints/card_creation_links.py`
- Test: `backend/tests/test_card_creation_links.py`

**Interfaces:**
- Consumes: Task 2 `CardCreationLinkService`, `CardService.create_card`, `CardService.set_field_value_from_public_link`, public card layout projection, `CardPublicAccessService` defaults.
- Produces: `preview_public_creation`, `create_on_first_public_save`, `PublicCreationPreviewRead`, and `PublicCreationFirstSaveRead`.

- [ ] **Step 1: Write failing public-creation transaction tests**

```python
def test_public_creation_has_no_card_until_first_valid_field_save(...) -> None:
    preview = service.preview_public_creation(raw_token=token.raw_token)
    assert preview.card_id is None
    assert db_session.query(Card).count() == 0

def test_first_public_save_creates_card_child_link_value_and_audits_atomically(...) -> None:
    result = service.create_on_first_public_save(
        raw_token=token.raw_token,
        organization_id=organization.id,
        field_id=field.id,
        value="Первое значение",
        block_instance_id=None,
    )
    assert result.card_id
    assert result.child_public_url.endswith(result.child_raw_token)
    assert db_session.query(FieldValue).filter_by(card_id=result.card_id).one().value_text == "Первое значение"

def test_first_public_save_rejects_organisation_outside_link_allowlist_without_card(...) -> None:
    with pytest.raises(PermissionDeniedError):
        service.create_on_first_public_save(..., organization_id=forbidden_org.id, ...)
    assert db_session.query(Card).count() == 0

def test_parent_close_denies_new_creation_but_child_public_link_stays_editable(...) -> None:
    service.close_for_actor(actor_user_id=admin.id, creation_link_id=creation_link.id)
    with pytest.raises(PermissionDeniedError):
        service.preview_public_creation(raw_token=parent_token)
    assert PublicLinkService(db_session).preview_public_link(raw_token=child_token).card_id == child_card.id
```

- [ ] **Step 2: Run the public creation tests and verify the red state**

Run: `python -m pytest backend/tests/test_card_creation_links.py -q`

Expected: FAIL because public creation preview/first-save endpoints are absent.

- [ ] **Step 3: Implement the locked, nested first-save transaction**

```python
def create_on_first_public_save(
    self, *, raw_token: str, organization_id: UUID, field_id: UUID,
    value: object, block_instance_id: UUID | None,
) -> PublicCreationFirstSave:
    with self.session.begin_nested():
        link = self._locked_active_link_for_token(raw_token)
        self._require_allowed_organization(link, organization_id)
        template = self._active_template_for_link(link)
        field, block = self._editable_template_field(template, field_id)
        card = CardService(self.session).create_card(
            registry_id=link.registry_id,
            organization_id=organization_id,
            card_template_id=template.id,
            public_view_enabled=True,
            public_edit_enabled=True,
            created_by=None,
        )
        child = PublicLinkService(self.session).create_indefinite_public_link_for_new_card(
            card_id=card.id,
        )
        field_value = CardService(self.session).set_field_value_from_public_link(
            actor_public_link_id=child.public_link.id, card_id=card.id,
            field_id=field.id, value=value, block_instance_id=block_instance_id,
        )
        self._record_created_card(link, card, child)
        self.session.flush()
    return PublicCreationFirstSave(...)
```

Implement `create_indefinite_public_link_for_new_card()` in `PublicLinkService` so normal public links can be issued without the 1–30 day input restriction while retaining hash lookup, `active` status, `can_view`, `can_edit`, `review_enabled=False`, and all existing public-edit field checks. Do not use an HTTP endpoint from the service.

Expose unauthenticated endpoints:

```text
POST /api/v1/card-creation-links/preview
POST /api/v1/card-creation-links/first-save
```

The preview returns only active template blocks/fields visible by the default card access rules, allowed organisation IDs/names, and a nullable `card_id`. It returns a generic Russian closed receipt for unknown, expired, or closed parent tokens and never reveals hidden organisation data. The first-save route runs `coerce_api_field_value` before the transactional service, converts service errors through `raise_service_http_error`, and returns the child edit URL only after the transaction has succeeded.

- [ ] **Step 4: Run focused backend public-creation and regression tests**

Run: `python -m pytest backend/tests/test_card_creation_links.py backend/tests/test_public_link_review_lifecycle.py backend/tests/test_card_public_access.py -q`

Expected: PASS; repeated page refreshes do not add cards, disallowed organisations make zero rows, and ordinary active public links still use their existing edit contract.

- [ ] **Step 5: Commit the public first-save checkpoint**

```powershell
git add backend/app/schemas/card_creation_links.py backend/app/services/card_creation_links.py backend/app/services/public_links.py backend/app/api/v1/endpoints/card_creation_links.py backend/tests/test_card_creation_links.py
git commit -m "Create cards from public creation links"
```

### Task 4: Add the administrator menu, link management, base metadata and organisation editor

**Files:**
- Create: `frontend/src/features/cards/CardCreationLinksPanel.tsx`
- Create: `frontend/src/features/cards/CardCreationLinksPanel.test.tsx`
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/features/cards/CardsWorkspace.tsx`
- Modify: `frontend/src/styles/globals.css`

**Interfaces:**
- Consumes: authenticated Task 2 endpoints and existing `OrganizationRead`, `CardTemplateRead`, `CardSummaryRead`.
- Produces: `CardCreationLinksPanel`, `createCardCreationLink`, `listCardCreationLinks`, `closeCardCreationLink`, `listCardCreationLinksForCard`, and `moveCardOrganization` client calls.

- [ ] **Step 1: Write failing UI tests for the menu, list and base block**

```tsx
test("opens creation-link form from the create-card menu and sends template plus organisations", async () => {
  render(<CardsWorkspace {...props} />);
  await userEvent.click(screen.getByRole("button", { name: "Создать" }));
  await userEvent.click(screen.getByRole("menuitem", { name: "Создать ссылку на создание карточки" }));
  await userEvent.selectOptions(screen.getByLabelText("Шаблон карточки"), "template-1");
  await userEvent.click(screen.getByLabelText("Организация 1"));
  await userEvent.click(screen.getByRole("button", { name: "Создать ссылку" }));
  expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("card-creation-links"), expect.anything());
});

test("shows a child continuation URL and edits the card organisation only for managers", async () => {
  render(<CardsWorkspace {...props} />);
  expect(await screen.findByLabelText("Ссылка на заполнение")).toHaveValue(
    expect.stringContaining("/public/edit/"),
  );
  await userEvent.selectOptions(screen.getByLabelText("Организация карточки"), "organization-2");
  expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/organization"), expect.anything());
});
```

- [ ] **Step 2: Run focused frontend tests and confirm the red state**

Run: `pnpm -C frontend test:run src/features/cards/CardCreationLinksPanel.test.tsx`

Expected: FAIL because the panel, typed client, and creation menu are absent.

- [ ] **Step 3: Implement typed client and focused administrative UI**

```ts
export type CardCreationLinkCreatePayload = {
  card_template_id: string;
  organization_ids: string[];
};

export type CardCreationLinkRead = {
  id: string;
  card_template_id: string;
  card_template_name: string;
  organizations: OrganizationRead[];
  created_at: string;
  closed_at: string | null;
  public_url: string;
  created_cards: Array<{ card_id: string; display_name: string; continuation_url: string }>;
};

export async function createCardCreationLink(
  token: string, registryId: string, payload: CardCreationLinkCreatePayload,
) {
  return apiRequest<CardCreationLinkRead>(`/api/v1/registries/${registryId}/card-creation-links`, {
    method: "POST", token, body: payload,
  });
}
```

Replace the single card-list `Создать карточку` control with one accessible menu button that exposes exactly: `Создать карточку`, `Создать ссылку на создание карточки`, and `Список ссылок`. Keep the existing card form unchanged behind the first menu item. `CardCreationLinksPanel` must:

- require one active template and at least one organisation;
- render one checkbox per administrator-visible organisation;
- show parent URL, state, template, selected organisations, created-card count and child URLs;
- offer `Закрыть ссылку` only for open links, with existing `ArchiveConfirmation`-style confirmation and query invalidation;
- never write URLs to `localStorage` or session storage.

In `CardBaseBlock`, add the editable `Организация карточки` select for `canManage`, call the protected move endpoint, invalidate card/list/public-link/creation-link queries, and show `Ссылка на заполнение` read-only only when a child relation exists. A non-manager sees the organisation and URL as ordinary metadata only if the backend returns it; they never see an organisation selector or close action.

Add CSS for a compact menu, readable URL rows, and a single-column mobile layout without changing the existing sticky navigator behavior.

- [ ] **Step 4: Run component, type and style checks**

Run: `pnpm -C frontend test:run src/features/cards/CardCreationLinksPanel.test.tsx && pnpm -C frontend typecheck && pnpm -C frontend lint`

Expected: PASS; no raw URL is persisted and non-manager controls are absent.

- [ ] **Step 5: Commit the administrative UI checkpoint**

```powershell
git add frontend/src/api frontend/src/features/cards/CardCreationLinksPanel.tsx frontend/src/features/cards/CardCreationLinksPanel.test.tsx frontend/src/features/cards/CardsWorkspace.tsx frontend/src/styles/globals.css
git commit -m "Add card creation link workspace"
```

### Task 5: Build the public creation page and remove the public review-submit UI

**Files:**
- Create: `frontend/src/pages/PublicCardCreationPage.tsx`
- Create: `frontend/src/pages/PublicCardCreationPage.test.tsx`
- Modify: `frontend/src/app/router.tsx`
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/pages/PublicLinkEditPage.tsx`
- Modify: `frontend/src/pages/PublicLinkEditPage.test.tsx`
- Modify: `frontend/src/styles/globals.css`

**Interfaces:**
- Consumes: Task 3 public preview/first-save APIs and the existing `PublicFieldEditor` visual primitives, `CardLayoutRenderer`, `FieldEditorControl`, `CardPresentationShell`.
- Produces: `/public/create/:rawToken`, virtual creation page, atomic first-save URL handoff, and an edit page without a submit/review panel.

- [ ] **Step 1: Write failing public UI tests**

```tsx
test("creates no card on preview and moves to child edit URL after the first autosave", async () => {
  renderAtRoute("/public/create/parent-token");
  expect(await screen.findByRole("heading", { name: "Публичное заполнение карточки" })).toBeVisible();
  expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/preview"), expect.anything());
  await userEvent.type(screen.getByLabelText("Имя"), "Борис");
  await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/public/edit/child-token", { replace: true }));
});

test("requires an allowed organisation before first save when the link has several organisations", async () => {
  renderAtRoute("/public/create/parent-token");
  expect(await screen.findByLabelText("Организация карточки")).toBeVisible();
  expect(screen.getByLabelText("Имя")).toBeDisabled();
});

test("does not render the public submit-for-review panel", async () => {
  renderAtRoute("/public/edit/active-token");
  expect(await screen.findByLabelText("Имя")).toBeVisible();
  expect(screen.queryByRole("button", { name: /отправить на проверку/i })).not.toBeInTheDocument();
  expect(screen.queryByText("Проверка заполнения")).not.toBeInTheDocument();
});

test("labels an indefinite child link without an expiry timestamp", async () => {
  renderAtRoute("/public/edit/child-token");
  expect(await screen.findByText("Бессрочная ссылка")).toBeVisible();
});
```

- [ ] **Step 2: Run public page tests and verify the red state**

Run: `pnpm -C frontend test:run src/pages/PublicCardCreationPage.test.tsx src/pages/PublicLinkEditPage.test.tsx`

Expected: FAIL because the create route and first-save client call do not exist, while the old submit panel still renders.

- [ ] **Step 3: Implement public creation and exact handoff behavior**

```tsx
// frontend/src/app/router.tsx
<Route path="/public/create/:rawToken" element={<PublicCardCreationPage />} />

// first-save success handler in PublicCardCreationPage
onSuccess: (created) => {
  queryClient.removeQueries({ queryKey: ["public-creation-preview", rawToken] });
  navigate(`/public/edit/${created.child_raw_token}`, { replace: true });
}
```

The creation page uses the same inline label/control geometry as `PublicLinkEditPage`, renders only the template fields available under default public-access rules, and uses the parent endpoint only for the first successful autosave. It derives choices/reference options from the preview and gives the user an explicit organisation select only when the link includes multiple allowed organisations; one allowed organisation is selected immediately. It does not load attachments, repeatable-instance creation, review status, or `PublicLinkStatusReceipt` before a card exists.

Refactor the shared field render helpers only when necessary so both public pages retain the current sequential autosave behavior. Render `Бессрочная ссылка` when a preview has `expires_at: null`; ordinary links continue to render their date. Delete `submitPublicLink` imports, submit mutation/state, and the `public-submit-panel` JSX from `PublicLinkEditPage`; retain status/receipt rendering for old submitted, approved, expired, and disabled ordinary links.

- [ ] **Step 4: Run public-page and layout regression checks**

Run: `pnpm -C frontend test:run src/pages/PublicCardCreationPage.test.tsx src/pages/PublicLinkEditPage.test.tsx src/features/cards/FilledCardLayout.test.tsx && pnpm -C frontend typecheck`

Expected: PASS; preview alone makes no write, the first confirmed field redirects to a child edit URL, multiple organisations require selection, and the old submit panel is absent.

- [ ] **Step 5: Commit the public UI checkpoint**

```powershell
git add frontend/src/app/router.tsx frontend/src/api frontend/src/pages/PublicCardCreationPage.tsx frontend/src/pages/PublicCardCreationPage.test.tsx frontend/src/pages/PublicLinkEditPage.tsx frontend/src/pages/PublicLinkEditPage.test.tsx frontend/src/styles/globals.css
git commit -m "Add public card creation links"
```

### Task 6: Verify migration, release safely, prove the browser flow, and record evidence

**Files:**
- Modify: `PLANS.md`
- Test: `backend/tests/test_card_creation_links.py`
- Test: `backend/tests/test_migrations.py`
- Test: `frontend/src/features/cards/CardCreationLinksPanel.test.tsx`
- Test: `frontend/src/pages/PublicCardCreationPage.test.tsx`

**Interfaces:**
- Consumes: Tasks 1–5 and project release scripts.
- Produces: a verified migration, deployed `main`, current `PLANS.md` evidence, and live browser proof.

- [ ] **Step 1: Run the focused complete feature suite**

Run:

```powershell
python -m pytest backend/tests/test_card_creation_links.py backend/tests/test_migrations.py backend/tests/test_public_link_review_lifecycle.py backend/tests/test_card_public_access.py -q
pnpm -C frontend test:run src/features/cards/CardCreationLinksPanel.test.tsx src/pages/PublicCardCreationPage.test.tsx src/pages/PublicLinkEditPage.test.tsx
pnpm -C frontend lint
pnpm -C frontend typecheck
pnpm -C frontend build
```

Expected: all focused backend and frontend tests pass. Record unrelated historical broad-suite failures separately rather than masking them.

- [ ] **Step 2: Prove migration in disposable PostgreSQL before production**

Run:

```powershell
$env:TEST_DATABASE_URL = '<configured disposable database ending in _test>'
python -m alembic upgrade head
python -m pytest backend/tests/test_card_creation_links.py backend/tests/test_migrations.py -q
Remove-Item Env:TEST_DATABASE_URL
```

Expected: Alembic reaches `0027_card_creation_links`; creation-link tables/constraints exist; all focused tests pass. Do not point `TEST_DATABASE_URL` to production.

- [ ] **Step 3: Check the workspace and commit the verification record**

```powershell
powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote
git add PLANS.md docs/superpowers/specs/2026-07-12-public-card-creation-links-design.md docs/superpowers/plans/2026-07-12-public-card-creation-links.md
git commit -m "Record card creation link verification"
git push origin main
```

Expected: local checks pass or any known pre-existing broad assertions are explicitly documented in `PLANS.md` with their exact scope.

- [ ] **Step 4: Run the planned production migration gate and deploy**

Run in this order:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1
powershell -ExecutionPolicy Bypass -File scripts/server-check.ps1
powershell -ExecutionPolicy Bypass -File scripts/deploy-frontend.ps1
```

Before `alembic upgrade head` on production, use the configured server release procedure to create a fresh backup outside Git, check the current revision and duplicate/foreign-key preflight, confirm the server checkout is at pushed `origin/main`, then apply only `0027_card_creation_links`. Verify Alembic head, the three tables/indexes, service health, and same-origin frontend/API smoke afterwards.

- [ ] **Step 5: Perform browser proof with one disposable live card**

1. Open `Карточки` and choose `Создать ссылку на создание карточки` from the creation menu.
2. Select an active template and at least two allowed organisations; create and copy the parent URL.
3. Open the parent URL: confirm no card exists before a field save and the organisation selector contains only the configured organisations.
4. Select one configured organisation, enter one non-empty editable field, and wait for autosave.
5. Confirm redirect to `/public/edit/:childToken`, one created card in the registry, `Ссылка на заполнение` in its base block, and parent/child URLs in the authorised list.
6. Close the parent link; reopen it and confirm a Russian closed receipt without template data.
7. Reload the child URL and save a second value; confirm it remains editable.
8. Archive the disposable card and close the child ordinary public link after proof, retaining audit history.

- [ ] **Step 6: Update the durable project stop point and commit**

Add the actual migration revision, test command results, deployment asset names, backup/preflight evidence, browser URL behavior, and cleanup result to the current stop point in `PLANS.md`. Then run:

```powershell
git add PLANS.md
git commit -m "Record public card creation link release"
git push origin main
```
