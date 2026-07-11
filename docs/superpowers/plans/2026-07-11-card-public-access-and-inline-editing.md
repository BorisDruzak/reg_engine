# Индивидуальный публичный доступ и рабочая карточка: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Перенести публичность с шаблона на карточку и сделать её единым рабочим документом с базовым блоком, автосохранением и нижними действиями.

**Architecture:** Новая нормализованная настройка связывает карточку и поле. Сервер вычисляет содержимое публичной ссылки по текущим настройкам на каждом запросе. FilledCardLayout получает базовый и нижние виртуальные блоки, а выбранное обычное поле использует независимую последовательную очередь автосохранения.

**Tech Stack:** FastAPI, SQLAlchemy, Alembic, PostgreSQL, React, TypeScript, TanStack Query, Vitest, pytest, PowerShell.

## Global Constraints

- Все видимые подписи и ошибки русские; бизнес-поля остаются schema-driven.
- Сервер проверяет can_manage и принадлежность поля карточке. UI является только подсказкой.
- public_editable=true всегда сохраняет public_visible=true. file_ref не становится публично редактируемым.
- Исторические флаги шаблона остаются в БД для совместимости, но перестают участвовать в решении и исчезают из редактора шаблона.
- Текст сохраняется после 600 мс бездействия, дискретные значения — сразу. file_ref оставляет attachment-aware сценарий.
- Нормальные архивные операции не превращаются в физическое удаление. Единственная очистка карточечных данных запускается только после backup, preflight и явного флага применения.
- Миграция сначала проходит на disposable PostgreSQL с именем БД, оканчивающимся на _test; перед production нужен новый backup.

---

## File Structure

| Файл | Ответственность |
| --- | --- |
| backend/migrations/versions/0024_card_public_field_settings.py | Таблица настроек публичности поля конкретной карточки. |
| backend/app/models/card.py | CardPublicFieldSetting. |
| backend/app/services/card_public_access.py | RBAC, чтение и изменение карточечных настроек. |
| backend/app/schemas/cards.py | DTO публичного доступа карточки. |
| backend/app/api/v1/endpoints/cards.py | GET/PATCH публичных настроек. |
| backend/app/services/public_links.py | Динамический public preview и edit. |
| backend/app/services/registry_schema.py | Архив поля и удаление только пустых значений. |
| frontend/src/features/cards/CardBaseBlock.tsx | Первый виртуальный блок карточки. |
| frontend/src/features/cards/CardTrailingActions.tsx | Нижние Скачать карточку и Архивирование карточки. |
| frontend/src/features/cards/useFieldAutosave.ts | Очередь сохранения одного поля. |
| frontend/src/features/cards/FilledCardLayout.tsx | Композиция виртуальных и шаблонных блоков. |
| backend/app/services/card_data_purge.py | Preflight-first очистка согласованного набора. |
| backend/scripts/purge_card_data.py | Серверная точка запуска очистки. |

### Task 1: Миграция, модель и DTO публичного доступа

**Files:**
- Create: backend/migrations/versions/0024_card_public_field_settings.py
- Modify: backend/app/models/card.py, backend/app/models/__init__.py, backend/app/schemas/cards.py
- Test: backend/tests/test_migrations.py, backend/tests/test_card_public_access.py

**Interfaces:**
- Produces CardPublicFieldSetting(card_id, field_id, public_visible, public_editable).
- Produces CardPublicFieldSettingUpdate, CardPublicAccessUpdate and CardPublicAccessRead for Task 2.

- [ ] **Step 1: Write the failing migration and uniqueness tests.**

~~~python
def test_card_public_access_migration_creates_scope_table() -> None:
    sql = _render_upgrade_sql("head")
    assert "CREATE TABLE card_public_field_settings" in sql
    assert "uq_card_public_field_settings_card_field" in sql


def test_public_field_setting_is_unique_per_card_and_field(db_session: Session) -> None:
    db_session.add_all([
        CardPublicFieldSetting(card_id=card.id, field_id=field.id, public_visible=True, public_editable=False),
        CardPublicFieldSetting(card_id=card.id, field_id=field.id, public_visible=True, public_editable=True),
    ])
    with pytest.raises(IntegrityError):
        db_session.flush()
~~~

- [ ] **Step 2: Run the tests to verify they fail.**

Run: python -m pytest backend/tests/test_migrations.py backend/tests/test_card_public_access.py -q

Expected: FAIL because CardPublicFieldSetting and migration 0024 do not exist.

- [ ] **Step 3: Add the smallest schema change that satisfies the tests.**

~~~python
class CardPublicFieldSetting(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "card_public_field_settings"
    __table_args__ = (
        UniqueConstraint("card_id", "field_id", name="uq_card_public_field_settings_card_field"),
        Index("ix_card_public_field_settings_card_id", "card_id"),
    )
    card_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("cards.id"))
    field_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("form_fields.id"))
    public_visible: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    public_editable: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    updated_by: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("users.id"))


class CardPublicFieldSettingUpdate(BaseModel):
    field_id: UUID
    public_visible: bool
    public_editable: bool


class CardPublicAccessUpdate(BaseModel):
    public_view_enabled: bool | None = None
    public_edit_enabled: bool | None = None
    fields: list[CardPublicFieldSettingUpdate] = Field(default_factory=list)


class CardPublicFieldSettingRead(BaseModel):
    field_id: UUID
    public_visible: bool
    public_editable: bool


class CardPublicAccessRead(BaseModel):
    card_id: UUID
    public_view_enabled: bool
    public_edit_enabled: bool
    fields: list[CardPublicFieldSettingRead]
~~~

Set migration revision to 0024_card_public_access and down_revision to 0023_public_link_review. The migration creates the table, index and unique constraint, and downgrade removes them.

- [ ] **Step 4: Run the focused tests.**

Run: python -m pytest backend/tests/test_migrations.py backend/tests/test_card_public_access.py -q

Expected: PASS.

- [ ] **Step 5: Commit.**

~~~powershell
git add backend/migrations/versions/0024_card_public_field_settings.py backend/app/models/card.py backend/app/models/__init__.py backend/app/schemas/cards.py backend/tests/test_migrations.py backend/tests/test_card_public_access.py
git commit -m "Add card public field settings"
~~~

### Task 2: Сервис и API карточечных настроек

**Files:**
- Create: backend/app/services/card_public_access.py
- Modify: backend/app/schemas/cards.py, backend/app/api/v1/endpoints/cards.py
- Test: backend/tests/test_card_public_access.py

**Interfaces:**
- Consumes CardPublicAccessUpdate from Task 1.
- Produces CardPublicAccessService.read_for_actor and update_for_actor for Tasks 3 and 5.

- [ ] **Step 1: Write failing RBAC and invariant tests.**

~~~python
def test_public_access_update_requires_manage_and_promotes_visibility(db_session: Session) -> None:
    result = CardPublicAccessService(db_session).update_for_actor(
        actor_user_id=admin.id,
        card_id=card.id,
        public_view_enabled=False,
        public_edit_enabled=True,
        field_updates=[CardPublicFieldSettingUpdate(
            field_id=field.id, public_visible=False, public_editable=True
        )],
    )
    assert result.public_view_enabled is True
    assert result.public_edit_enabled is True
    assert result.fields[0].public_visible is True
    assert result.fields[0].public_editable is True


def test_public_access_rejects_foreign_template_field_and_file_ref(db_session: Session) -> None:
    with pytest.raises(CardPublicAccessError):
        CardPublicAccessService(db_session).update_for_actor(
            actor_user_id=admin.id,
            card_id=card.id,
            field_updates=[CardPublicFieldSettingUpdate(
                field_id=foreign_field.id, public_visible=True, public_editable=False
            )],
        )
~~~

- [ ] **Step 2: Run the tests to verify they fail.**

Run: python -m pytest backend/tests/test_card_public_access.py -q

Expected: FAIL because CardPublicAccessService is absent.

- [ ] **Step 3: Implement the service and routes.**

~~~python
class CardPublicAccessService:
    def read_for_actor(self, *, actor_user_id: UUID, card_id: UUID) -> CardPublicAccessRead: ...
    def update_for_actor(
        self, *, actor_user_id: UUID, card_id: UUID,
        public_view_enabled: bool | None = None,
        public_edit_enabled: bool | None = None,
        field_updates: list[CardPublicFieldSettingUpdate],
    ) -> CardPublicAccessRead: ...
    def visible_public_fields_for_card(self, *, card: Card) -> list[tuple[FormBlock, FormField]]: ...
    def field_is_publicly_editable(self, *, card: Card, field_id: UUID) -> bool: ...
~~~

The update method requires card management, accepts only active fields in the current card template, rejects duplicate IDs and public edit for static_text and file_ref, promotes public view whenever public edit is enabled, upserts settings, and writes one audit event containing old/new flags and changed field rows.

Add GET /cards/{card_id}/public-access and PATCH /cards/{card_id}/public-access. Both must call this service and map errors with raise_service_http_error.

- [ ] **Step 4: Run service and API tests.**

Run: python -m pytest backend/tests/test_card_public_access.py backend/tests/test_registry_card_services.py -q

Expected: PASS, including no-manage denial, safe defaults, audit, template membership and editable-implies-visible.

- [ ] **Step 5: Commit.**

~~~powershell
git add backend/app/services/card_public_access.py backend/app/schemas/cards.py backend/app/api/v1/endpoints/cards.py backend/tests/test_card_public_access.py
git commit -m "Add card public access API"
~~~

### Task 3: Динамическая публичная ссылка и публичный read-only режим

**Files:**
- Modify: backend/app/services/public_links.py, backend/app/schemas/public_links.py, frontend/src/api/types.ts, frontend/src/pages/PublicLinkEditPage.tsx
- Test: backend/tests/test_public_link_review_lifecycle.py, frontend/src/pages/PublicLinkEditPage.test.tsx

**Interfaces:**
- Consumes visible_public_fields_for_card and field_is_publicly_editable from Task 2.
- Produces public preview with can_edit=false for public-view-only cards.

- [ ] **Step 1: Write failing dynamic-access tests.**

~~~python
def test_active_link_observes_current_card_settings(db_session: Session) -> None:
    assert public_field_ids(service.preview_public_link(raw_token=raw_token)) == {field_a.id}
    access.update_for_actor(
        actor_user_id=admin.id, card_id=card.id,
        field_updates=[CardPublicFieldSettingUpdate(
            field_id=field_b.id, public_visible=True, public_editable=True
        )],
    )
    assert public_field_ids(service.preview_public_link(raw_token=raw_token)) == {field_a.id, field_b.id}


def test_public_view_can_be_readonly_but_public_edit_cannot_write(db_session: Session) -> None:
    access.update_for_actor(
        actor_user_id=admin.id, card_id=card.id,
        public_view_enabled=True, public_edit_enabled=False, field_updates=[]
    )
    assert service.preview_public_link(raw_token=raw_token).can_edit is False
    with pytest.raises(PermissionDeniedError):
        service.edit_card_field_with_token(raw_token=raw_token, field_id=field_a.id, value="x")
~~~

- [ ] **Step 2: Run the tests to verify they fail.**

Run: python -m pytest backend/tests/test_public_link_review_lifecycle.py -q
Run: pnpm -C frontend exec vitest run src/pages/PublicLinkEditPage.test.tsx

Expected: FAIL because preview still uses template flags and rejects public read-only.

- [ ] **Step 3: Implement current-card evaluation.**

~~~python
if not public_link.can_view or not card.public_view_enabled:
    raise PermissionDeniedError("Public viewing is disabled for this card.")

schema_rows = CardPublicAccessService(self.session).visible_public_fields_for_card(card=card)
can_edit = public_link.can_edit and card.public_edit_enabled
if not can_edit or not CardPublicAccessService(self.session).field_is_publicly_editable(
    card=card, field_id=field.id
):
    raise PermissionDeniedError("Field is not public editable.")
~~~

Do not use FormBlock.public_visible, FormField.public_visible, FormBlock.public_editable, FormField.public_editable, allowed_blocks_json or allowed_fields_json for new preview/edit decisions. PublicLinkEditPage renders the layout read-only whenever preview.can_edit is false and must not call updatePublicLinkFieldValue in that state.

- [ ] **Step 4: Run dynamic public tests.**

Run: python -m pytest backend/tests/test_public_link_review_lifecycle.py backend/tests/test_public_link_hint_payloads.py -q
Run: pnpm -C frontend exec vitest run src/pages/PublicLinkEditPage.test.tsx

Expected: PASS, including immediate link change and no write from read-only page.

- [ ] **Step 5: Commit.**

~~~powershell
git add backend/app/services/public_links.py backend/app/schemas/public_links.py backend/tests/test_public_link_review_lifecycle.py frontend/src/api/types.ts frontend/src/pages/PublicLinkEditPage.tsx frontend/src/pages/PublicLinkEditPage.test.tsx
git commit -m "Use card public settings for links"
~~~

### Task 4: Архив поля без потери непустых данных

**Files:**
- Modify: backend/app/services/registry_schema.py, backend/tests/test_registry_card_services.py, frontend/src/features/cardLayout/InlineFieldEditor.tsx, frontend/src/features/cardLayout/CardFieldLayoutNode.tsx, frontend/src/features/cardLayout/CardLayoutStudio.tsx
- Test: frontend/src/features/cardLayout/CardFieldLayoutNode.test.tsx, frontend/src/features/cardLayout/InlineFieldEditor.test.tsx

**Interfaces:**
- Extends RegistrySchemaService.archive_field_for_actor.
- Adds onArchiveField(field: FormFieldRead) from CardLayoutStudio to CardFieldLayoutNode.

- [ ] **Step 1: Write failing value-retention and UI tests.**

~~~python
def test_archiving_field_retains_content_and_removes_empty_value_rows(db_session: Session) -> None:
    schema.archive_field_for_actor(actor_user_id=admin.id, field_id=field.id)
    assert db_session.get(FormField, field.id).archived_at is not None
    assert db_session.get(FieldValue, filled_value.id) is not None
    assert db_session.get(FieldValue, empty_value.id) is None
~~~

~~~tsx
test("offers field deletion instead of cancellation", async () => {
  render(<CardFieldLayoutNode {...props} />);
  await user.click(screen.getByRole("button", { name: "Удалить поле" }));
  expect(onArchiveField).toHaveBeenCalledWith(expect.objectContaining({ id: "field-id" }));
});
~~~

- [ ] **Step 2: Run tests to verify they fail.**

Run: python -m pytest backend/tests/test_registry_card_services.py -q
Run: pnpm -C frontend exec vitest run src/features/cardLayout/CardFieldLayoutNode.test.tsx src/features/cardLayout/InlineFieldEditor.test.tsx

Expected: FAIL because empty values remain and no delete action is rendered.

- [ ] **Step 3: Implement the safe archive policy.**

~~~python
def _field_value_has_content(value: FieldValue, item_count: int) -> bool:
    return any((
        bool(value.value_text and value.value_text.strip()),
        value.value_number is not None, value.value_date is not None,
        value.value_datetime is not None, value.value_bool is not None,
        bool(value.value_json), value.value_reference_item_id is not None,
        value.value_card_id is not None, value.value_user_id is not None,
        value.value_organization_id is not None, value.value_org_unit_id is not None,
        value.value_registry_id is not None, value.value_attachment_id is not None,
        item_count > 0,
    ))
~~~

Before archiving the field, delete FieldValueItem and FieldValue only for rows where this predicate is false. Preserve meaningful values under the archived field. Replace the inline cancel button with Удалить поле, open the existing Russian confirmation dialog in CardLayoutStudio, then call archiveFormField. Remove template public visibility/editability controls from InlineFieldEditor.

- [ ] **Step 4: Run focused checks.**

Run: python -m pytest backend/tests/test_registry_card_services.py backend/tests/test_registry_schema_field_update_contract.py -q
Run: pnpm -C frontend exec vitest run src/features/cardLayout/CardFieldLayoutNode.test.tsx src/features/cardLayout/InlineFieldEditor.test.tsx

Expected: PASS.

- [ ] **Step 5: Commit.**

~~~powershell
git add backend/app/services/registry_schema.py backend/tests/test_registry_card_services.py frontend/src/features/cardLayout/InlineFieldEditor.tsx frontend/src/features/cardLayout/CardFieldLayoutNode.tsx frontend/src/features/cardLayout/CardLayoutStudio.tsx frontend/src/features/cardLayout/CardFieldLayoutNode.test.tsx frontend/src/features/cardLayout/InlineFieldEditor.test.tsx
git commit -m "Archive fields without empty values"
~~~

### Task 5: Базовый блок и нижние действия документа

**Files:**
- Create: frontend/src/features/cards/CardBaseBlock.tsx, frontend/src/features/cards/CardBaseBlock.test.tsx, frontend/src/features/cards/CardTrailingActions.tsx, frontend/src/features/cards/CardTrailingActions.test.tsx
- Modify: frontend/src/api/client.ts, frontend/src/api/types.ts, frontend/src/app/uiText.ts, frontend/src/features/cards/CardsWorkspace.tsx, frontend/src/features/cards/FilledCardLayout.tsx, frontend/src/features/cards/CardBlockNavigator.tsx, frontend/src/features/cards/CardPresentationShell.tsx, frontend/src/features/cards/PublicLinkQuickControl.tsx, frontend/src/features/cards/publicLinkSchema.ts, frontend/src/styles/globals.css
- Test: frontend/src/api/adminMutations.test.ts, frontend/src/features/cards/FilledCardLayout.test.tsx, frontend/src/features/cards/CardBlockNavigator.test.tsx, frontend/src/features/cards/PublicLinkQuickControl.test.tsx

**Interfaces:**
- Consumes CardPublicAccessRead from Task 2.
- Produces FilledCardTrailingBlock for Task 6.

- [ ] **Step 1: Write failing composition and mutation tests.**

~~~tsx
test("renders base first and keeps template hidden", () => {
  render(<FilledCardLayout {...props} baseBlock={<CardBaseBlock {...baseProps} />} trailingBlocks={trailing} />);
  expect(screen.getByRole("heading", { name: "Базовый блок" })).toBeInTheDocument();
  expect(screen.queryByText("Шаблон карточки")).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Архивирование карточки" })).toBeInTheDocument();
});


test("saves a public field switch immediately", async () => {
  await user.click(screen.getByRole("checkbox", { name: "Показывать публично: Имя" }));
  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringContaining("/api/v1/cards/card-id/public-access"),
    expect.objectContaining({ method: "PATCH" }),
  );
});
~~~

- [ ] **Step 2: Run tests to verify they fail.**

Run: pnpm -C frontend exec vitest run src/api/adminMutations.test.ts src/features/cards/CardBaseBlock.test.tsx src/features/cards/CardTrailingActions.test.tsx src/features/cards/FilledCardLayout.test.tsx src/features/cards/CardBlockNavigator.test.tsx src/features/cards/PublicLinkQuickControl.test.tsx

Expected: FAIL because the API client and virtual components do not exist.

- [ ] **Step 3: Implement API client and document composition.**

~~~ts
export async function updateCardPublicAccess(
  token: string, cardId: string, payload: CardPublicAccessUpdatePayload,
) {
  return apiRequest<CardPublicAccessRead>("/api/v1/cards/" + cardId + "/public-access", {
    method: "PATCH", token, body: payload,
  });
}

export async function readCardPublicAccess(token: string, cardId: string) {
  return apiRequest<CardPublicAccessRead>("/api/v1/cards/" + cardId + "/public-access", { token });
}

export type FilledCardTrailingBlock = {
  anchorId: string;
  label: string;
  content: ReactNode;
  state?: "neutral" | "attention" | "complete" | "empty";
};
~~~

CardBaseBlock shows card name, status, required-field progress, organization, public view/edit toggles, quick public link and block-grouped field switches. It does not show the card template. CardsWorkspace removes CardActionPanel and the metadata Panel, passes CardBaseBlock into FilledCardLayout, then passes trailing blocks in this order: CardAttachmentsPanel, CardTrailingActions download section, CardTrailingActions archive section. Only managers see active switches and archive.

Extend navigator state with neutral for virtual/action blocks. Keep it sticky on desktop and static on mobile. PublicLinkQuickControl and publicLinkSchema derive eligibility from CardPublicAccessRead, not schema flags.

- [ ] **Step 4: Run focused UI tests.**

Run: pnpm -C frontend exec vitest run src/api/adminMutations.test.ts src/features/cards/CardBaseBlock.test.tsx src/features/cards/CardTrailingActions.test.tsx src/features/cards/FilledCardLayout.test.tsx src/features/cards/CardBlockNavigator.test.tsx src/features/cards/PublicLinkQuickControl.test.tsx

Expected: PASS.

- [ ] **Step 5: Commit.**

~~~powershell
git add frontend/src/api/client.ts frontend/src/api/types.ts frontend/src/app/uiText.ts frontend/src/features/cards/CardBaseBlock.tsx frontend/src/features/cards/CardBaseBlock.test.tsx frontend/src/features/cards/CardTrailingActions.tsx frontend/src/features/cards/CardTrailingActions.test.tsx frontend/src/features/cards/CardsWorkspace.tsx frontend/src/features/cards/FilledCardLayout.tsx frontend/src/features/cards/CardBlockNavigator.tsx frontend/src/features/cards/CardPresentationShell.tsx frontend/src/features/cards/PublicLinkQuickControl.tsx frontend/src/features/cards/publicLinkSchema.ts frontend/src/features/cards/FilledCardLayout.test.tsx frontend/src/features/cards/CardBlockNavigator.test.tsx frontend/src/features/cards/PublicLinkQuickControl.test.tsx frontend/src/api/adminMutations.test.ts frontend/src/styles/globals.css
git commit -m "Compose card as a document"
~~~

### Task 6: Автосохранение выбранного поля

**Files:**
- Create: frontend/src/features/cards/useFieldAutosave.ts, frontend/src/features/cards/useFieldAutosave.test.tsx
- Modify: frontend/src/features/cards/BlockFieldControl.tsx, frontend/src/features/cards/FilledCardLayout.tsx, frontend/src/features/cards/FilledCardLayout.test.tsx, frontend/src/features/cardLayout/CardFieldLayoutNode.tsx, frontend/src/features/cardLayout/CardBlockLayoutNode.tsx, frontend/src/features/cardLayout/CardWebLayoutCanvas.tsx, frontend/src/features/cardLayout/CardLayoutRenderer.tsx, frontend/src/styles/globals.css

**Interfaces:**
- Produces FieldAutosaveState for exactly one ordinary field.
- Extends the renderer with canActivateField and onActivateField.

- [ ] **Step 1: Write failing autosave tests.**

~~~tsx
test("debounces text and writes only the selected field", async () => {
  const { result } = renderHook(() => useFieldAutosave(options));
  act(() => result.current.open(target, ""));
  act(() => result.current.update("Новое значение"));
  await vi.advanceTimersByTimeAsync(600);
  expect(saveValues).toHaveBeenCalledWith({
    values: [{ field_id: target.fieldId, block_instance_id: target.blockInstanceId, value: "Новое значение" }],
  });
});


test("clicking a field opens no block save or cancel actions", async () => {
  render(<FilledCardLayout {...props} />);
  await user.click(screen.getByTestId("filled-field-first-name"));
  expect(screen.getByLabelText("Имя")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Сохранить блок/i })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Отмена блока/i })).not.toBeInTheDocument();
});
~~~

- [ ] **Step 2: Run tests to verify they fail.**

Run: pnpm -C frontend exec vitest run src/features/cards/useFieldAutosave.test.tsx src/features/cards/FilledCardLayout.test.tsx

Expected: FAIL because useFieldAutosave and field activation do not exist.

- [ ] **Step 3: Implement the queue and field activation.**

~~~ts
export type FieldAutosaveTarget = {
  blockId: string;
  blockInstanceId: string | null;
  fieldId: string;
  fieldType: string;
};

export type FieldAutosaveState = {
  target: FieldAutosaveTarget | null;
  value: FieldEditorState | undefined;
  status: "idle" | "saving" | "saved" | "error";
  error?: string;
  open: (target: FieldAutosaveTarget, initial: unknown) => void;
  update: (value: FieldEditorState) => void;
  retry: () => void;
  close: () => void;
};
~~~

The hook owns a one-item latest-value queue. It delays text, json and multiline controls by 600 ms; it saves date, number, select, bool and multi_select immediately; it validates required values and coercion locally; it sets saved only after updateCardFieldValues resolves. Failure keeps the typed value, shows Russian error and exposes retry. BlockFieldControl displays status/retry but no save/cancel controls.

CardFieldLayoutNode becomes click/Enter/Space activatable when canActivateField permits it. FilledCardLayout opens the hook with the exact block_instance_id, renders a control only for that field, and removes renderBlockActions. file_ref, static_text and non-manage users remain non-activatable.

- [ ] **Step 4: Run hook and renderer tests.**

Run: pnpm -C frontend exec vitest run src/features/cards/useFieldAutosave.test.tsx src/features/cards/FilledCardLayout.test.tsx src/features/cardLayout/CardLayoutRenderer.test.tsx

Expected: PASS, including immediate select, retry, keyboard activation and repeatable instance ID.

- [ ] **Step 5: Commit.**

~~~powershell
git add frontend/src/features/cards/useFieldAutosave.ts frontend/src/features/cards/useFieldAutosave.test.tsx frontend/src/features/cards/BlockFieldControl.tsx frontend/src/features/cards/FilledCardLayout.tsx frontend/src/features/cards/FilledCardLayout.test.tsx frontend/src/features/cardLayout/CardFieldLayoutNode.tsx frontend/src/features/cardLayout/CardBlockLayoutNode.tsx frontend/src/features/cardLayout/CardWebLayoutCanvas.tsx frontend/src/features/cardLayout/CardLayoutRenderer.tsx frontend/src/styles/globals.css
git commit -m "Autosave individual card fields"
~~~

### Task 7: Preflight-first очистка подтверждённых карточечных данных

**Files:**
- Create: backend/app/services/card_data_purge.py, backend/scripts/purge_card_data.py, backend/tests/test_card_data_purge.py
- Modify: PLANS.md

**Interfaces:**
- Produces CardDataPurgeService.preflight and purge.
- CLI mutates only with --apply --confirm-card-data-purge and --actor-user-id.

- [ ] **Step 1: Write failing scope and stop-condition tests.**

~~~python
def test_preflight_counts_only_confirmed_dependencies(db_session: Session) -> None:
    report = CardDataPurgeService(db_session, storage).preflight()
    assert report.cards == 2
    assert report.field_values == 3
    assert report.organizations == 0
    assert report.unapproved_dependencies == []


def test_purge_stops_for_generated_documents_or_card_relations(db_session: Session) -> None:
    with pytest.raises(CardDataPurgeBlockedError, match="generated_documents"):
        CardDataPurgeService(db_session, storage).purge()
~~~

- [ ] **Step 2: Run tests to verify they fail.**

Run: python -m pytest backend/tests/test_card_data_purge.py -q

Expected: FAIL because CardDataPurgeService does not exist.

- [ ] **Step 3: Implement the guarded server-only service and CLI.**

~~~python
@dataclass(frozen=True)
class CardDataPurgeReport:
    cards: int
    public_field_settings: int
    field_value_items: int
    field_values: int
    block_instances: int
    public_links: int
    card_attachments: int
    stored_files: int
    unapproved_dependencies: list[str]


class CardDataPurgeService:
    def preflight(self) -> CardDataPurgeReport: ...
    def purge(self, *, actor_user_id: UUID) -> CardDataPurgeReport: ...
~~~

The approved delete order is FieldValueItem, FieldValue, CardPublicFieldSetting, public-link review/link rows, CardBlockInstance, CardAttachment plus its storage abstraction object, then Card. Preflight inspects card relations and generated documents first. Any nonzero count raises CardDataPurgeBlockedError without mutation. Users, roles, organizations, registries, templates, schema, reference data, audit and unrelated stored files are preserved. Purge writes a dedicated audit event with the report counts.

~~~powershell
python backend/scripts/purge_card_data.py
python backend/scripts/purge_card_data.py --apply --confirm-card-data-purge --actor-user-id <uuid>
~~~

Without both apply flags the command prints canonical JSON with applied=false and changes nothing.

- [ ] **Step 4: Run service tests and non-mutating CLI preflight.**

Run: python -m pytest backend/tests/test_card_data_purge.py -q
Run: python backend/scripts/purge_card_data.py

Expected: PASS and JSON with applied=false.

- [ ] **Step 5: Commit.**

~~~powershell
git add backend/app/services/card_data_purge.py backend/scripts/purge_card_data.py backend/tests/test_card_data_purge.py PLANS.md
git commit -m "Add guarded card data purge"
~~~

### Task 8: Full verification, migration, release and live proof

**Files:**
- Modify: PLANS.md, docs/PROJECT_TREE.md
- Test: all focused suites from Tasks 1–7.

**Interfaces:**
- Consumes every previous task.
- Produces recorded verification, migration, cleanup and Browser evidence.

- [ ] **Step 1: Run local quality gates.**

~~~powershell
python -m pytest backend/tests/test_migrations.py backend/tests/test_card_public_access.py backend/tests/test_public_link_review_lifecycle.py backend/tests/test_registry_card_services.py backend/tests/test_card_data_purge.py -q
pnpm -C frontend lint
pnpm -C frontend typecheck
pnpm -C frontend exec vitest run src/api/adminMutations.test.ts src/pages/PublicLinkEditPage.test.tsx src/features/cards/CardBaseBlock.test.tsx src/features/cards/CardTrailingActions.test.tsx src/features/cards/useFieldAutosave.test.tsx src/features/cards/FilledCardLayout.test.tsx src/features/cards/CardBlockNavigator.test.tsx src/features/cards/PublicLinkQuickControl.test.tsx src/features/cardLayout/CardFieldLayoutNode.test.tsx src/features/cardLayout/CardLayoutRenderer.test.tsx
pnpm -C frontend build
powershell -ExecutionPolicy Bypass -File scripts/project-map.ps1 -Check
~~~

Expected: all selected checks PASS. Record unrelated pre-existing failures separately.

- [ ] **Step 2: Prove migration on disposable PostgreSQL.**

Run: powershell -ExecutionPolicy Bypass -File scripts/test.ps1 with TEST_DATABASE_URL set to a disposable database ending in _test.

Expected: Alembic reaches 0024_card_public_access and public-access/public-link tests pass against PostgreSQL.

- [ ] **Step 3: Commit, push, deploy and server-check.**

~~~powershell
powershell -ExecutionPolicy Bypass -File scripts/project-map.ps1
git add PLANS.md docs/PROJECT_TREE.md
git commit -m "Record card public access verification"
powershell -ExecutionPolicy Bypass -File scripts/push-git.ps1 -Message "Release card public access workspace"
powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1
powershell -ExecutionPolicy Bypass -File scripts/deploy-frontend.ps1
powershell -ExecutionPolicy Bypass -File scripts/server-check.ps1
~~~

Expected: server checkout matches origin/main, service/API/storage checks pass, and the production migration runs only after fresh backup.

- [ ] **Step 4: Execute the separately confirmed card cleanup.**

Run server preflight first and record its JSON counts in PLANS.md. Create fresh backup. Apply only if the report has no generated documents or card relations:

~~~powershell
python backend/scripts/purge_card_data.py --apply --confirm-card-data-purge --actor-user-id <operator-uuid>
~~~

Expected: applied=true, cards=0 after purge, non-card entities unchanged and audit event present. If a disallowed dependency appears, stop without deletion and request a new scope decision.

- [ ] **Step 5: Perform live Browser proof and record it.**

Verify desktop and mobile: navigator order is Base, schema blocks, attachments, download and archive; base replaces both top panels and omits template; public switches change an active link; public view-only is read-only; one field autosaves with Сохранено; download follows attachments; archive is separate and last; console has no errors.

- [ ] **Step 6: Commit release evidence.**

~~~powershell
git add PLANS.md docs/PROJECT_TREE.md
git commit -m "Record card workspace release proof"
git push origin main
~~~

## Self-Review

- **Spec coverage:** Tasks 1–3 cover card-specific public access and immediate public-link changes. Task 4 covers field archive. Tasks 5–6 cover the document layout and field autosave. Task 7 covers the explicit destructive operation. Task 8 verifies release and Browser behavior.
- **Placeholder scan:** This plan contains no unfinished-marker or deferred implementation instruction. Every task has paths, a failing test, a command, an implementation interface, a passing check and a commit.
- **Type consistency:** CardPublicAccessUpdate, CardPublicAccessRead, CardPublicFieldSettingUpdate, FilledCardTrailingBlock and FieldAutosaveState are defined before later tasks consume them.
