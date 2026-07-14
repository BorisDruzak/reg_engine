# Одноэтапное создание карточки — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Создать одну динамическую форму карточки, которая не оставляет пустых записей, сохраняет черновик после первого значения и автоматически активирует карточку после заполнения обязательных полей.

**Architecture:** Новые административные endpoint-ы дают предварительный просмотр структуры выбранного шаблона в контексте организации и выполняют первое сохранение атомарно. `CardsWorkspace` держит форму до первого значения локально, затем переключается на существующий редактор карточки и его пакетное сохранение. Существующие обычные API создания, публичные ссылки и импорт не меняются.

**Tech Stack:** FastAPI, SQLAlchemy, Pydantic, React, TypeScript, TanStack Query, Vitest, pytest.

## Global Constraints

- Карточки и поля остаются schema-driven; фиксированные бизнес-поля не добавляются.
- Все проверки прав и валидация выполняются сервером; каждая запись аудируется.
- Пустая форма, выбор организации и выбор шаблона не создают запись `cards`.
- Первый непустой ввод создаёт черновик атомарно; статус `active` зависит только от полей `required` и `required_on_publish` выбранного шаблона.
- Пользовательский интерфейс и ошибки браузера остаются русскоязычными.
- Изменение не требует миграции и не меняет поведение публичных ссылок, импорта или прежних endpoint-ов создания карточек.

---

## File structure

- `backend/app/schemas/cards.py` — новые типы предварительного просмотра и первого сохранения.
- `backend/app/services/cards.py` — разрешение структуры/вариантов шаблона и транзакционное создание карточки с первым значением.
- `backend/app/api/v1/endpoints/cards.py` — административные маршруты preview и first-save.
- `backend/tests/test_registry_card_services.py` — сервисные проверки атомарного первого сохранения и жизненного цикла.
- `backend/tests/test_api_phase_1f.py` — API/RBAC-контракт новых маршрутов.
- `frontend/src/api/types.ts` — типы preview/first-save.
- `frontend/src/api/client.ts` — вызовы новых API.
- `frontend/src/features/cards/SingleStageCardCreation.tsx` — изолированная форма до первого сохранения.
- `frontend/src/features/cards/singleStageCardCreation.ts` — чистые функции формы: пустота, выбор обязательных полей и сборка initial-save payload.
- `frontend/src/features/cards/singleStageCardCreation.test.ts` — unit-тесты чистых функций.
- `frontend/src/features/cards/SingleStageCardCreation.test.tsx` — UI-тесты динамической подгрузки, смены шаблона и первого сохранения.
- `frontend/src/features/cards/CardsWorkspace.tsx` — замена старой `CardMutationForm` новым компонентом и переход в редактор после создания.
- `frontend/src/features/cards/CardsWorkspace.test.tsx` — регрессии интеграции рабочей вкладки.
- `PLANS.md` — запись результата, проверок и публикации.

## Interfaces

```python
class CardCreationPreviewRead(BaseModel):
    organization_id: UUID
    card_template_id: UUID
    display_name: str
    form_layout: CardTemplateFormLayoutRead
    blocks: list[CardCreationPreviewBlockRead]

class CardFirstSaveRequest(BaseModel):
    display_name: str | None = None
    card_template_id: UUID
    public_view_enabled: bool = True
    public_edit_enabled: bool = True
    field_id: UUID
    value: Any
    block_instance_id: UUID | None = None
```

```python
def create_card_with_first_value_for_actor(
    self,
    *,
    actor_user_id: UUID,
    organization_id: UUID,
    display_name: str | None,
    card_template_id: UUID,
    public_view_enabled: bool,
    public_edit_enabled: bool,
    field_id: UUID,
    value: object,
    block_instance_id: UUID | None,
) -> Card:
    """Create the card and persist its first nonempty field value atomically."""
```

```ts
export async function readOrganizationCardCreationPreview(
  token: string,
  organizationId: string,
  cardTemplateId: string,
): Promise<CardCreationPreviewRead>;

export async function firstSaveOrganizationCard(
  token: string,
  organizationId: string,
  payload: CardFirstSavePayload,
): Promise<CardSummaryRead>;
```

### Task 1: Серверный preview выбранного шаблона

**Files:**
- Modify: `backend/app/schemas/cards.py`
- Modify: `backend/app/services/cards.py`
- Modify: `backend/app/api/v1/endpoints/cards.py`
- Test: `backend/tests/test_registry_card_services.py`
- Test: `backend/tests/test_api_phase_1f.py`

**Consumes:** `CardTemplateLayoutService.read_layout_for_actor`, `CardService` typed-field validation and effective reference-list resolution.

**Produces:** `GET /api/v1/organizations/{organization_id}/card-templates/{card_template_id}/creation-preview`, returning the selected template’s layout, blocks, fields, blank values, and resolved choice options for that organization.

- [ ] **Step 1: Write failing service tests**

Add cases proving that preview includes only the active fields listed in
`card_template.field_schema_json`, returns blank values, resolves active select,
organization, and organization-unit options for the selected organization, and
rejects a template from another registry.

```python
preview = CardService(db_session).preview_card_creation_for_actor(
    actor_user_id=actor.id,
    organization_id=organization.id,
    card_template_id=template.id,
)
assert [field.field_id for block in preview.blocks for field in block.fields] == [field.id]
assert preview.blocks[0].instances[0].fields[0].value is None
```

- [ ] **Step 2: Run service tests and confirm failure**

Run: `pytest backend/tests/test_registry_card_services.py -k "creation_preview" -q`

Expected: FAIL because `preview_card_creation_for_actor` and its response types do not exist.

- [ ] **Step 3: Add preview schemas and service implementation**

Define `CardCreationPreviewOptionRead`, `CardCreationPreviewFieldRead`,
`CardCreationPreviewBlockInstanceRead`, `CardCreationPreviewBlockRead`, and
`CardCreationPreviewRead` in `backend/app/schemas/cards.py`. In `CardService`,
validate `cards.manage` for the selected organization, obtain the active
template, limit schema rows to `_template_field_ids(template)`, and return the
existing layout plus organization-scoped option labels. Do not create `Card`,
`CardBlockInstance`, or `FieldValue` records.

- [ ] **Step 4: Add the authenticated route and API tests**

Add the route before the generic organization-card route:

```python
@router.get(
    "/organizations/{organization_id}/card-templates/{card_template_id}/creation-preview",
    response_model=CardCreationPreviewRead,
)
def read_organization_card_creation_preview(
    organization_id: UUID,
    card_template_id: UUID,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> CardCreationPreviewRead:
    return CardService(session).preview_card_creation_for_actor(
        actor_user_id=actor_user_id,
        organization_id=organization_id,
        card_template_id=card_template_id,
    )
```

Test a permitted request, forbidden organization access, and invalid template
membership. Map errors through `raise_service_http_error`.

- [ ] **Step 5: Run focused server verification**

Run: `pytest backend/tests/test_registry_card_services.py -k "creation_preview" -q; pytest backend/tests/test_api_phase_1f.py -k "creation_preview" -q`

Expected: all selected tests pass.

- [ ] **Step 6: Commit**

```powershell
git add backend/app/schemas/cards.py backend/app/services/cards.py backend/app/api/v1/endpoints/cards.py backend/tests/test_registry_card_services.py backend/tests/test_api_phase_1f.py
git commit -m "feat: preview card template before creation"
```

### Task 2: Атомарное первое сохранение карточки

**Files:**
- Modify: `backend/app/schemas/cards.py`
- Modify: `backend/app/services/cards.py`
- Modify: `backend/app/api/v1/endpoints/cards.py`
- Test: `backend/tests/test_registry_card_services.py`
- Test: `backend/tests/test_api_phase_1f.py`

**Consumes:** Task 1 preview validation, `CardService.create_card_for_actor`,
`set_field_value_for_actor`, and `synchronize_card_lifecycle`.

**Produces:** `POST /api/v1/organizations/{organization_id}/cards/first-save`, which creates and fills one card in one database transaction.

- [ ] **Step 1: Write failing service tests**

Create tests for the three lifecycle boundaries:

```python
with pytest.raises(InvalidFieldValueError, match="non-empty"):
    service.create_card_with_first_value_for_actor(
        actor_user_id=actor.id, organization_id=organization.id, display_name=None,
        card_template_id=template.id, public_view_enabled=True, public_edit_enabled=True,
        field_id=optional.id, value="", block_instance_id=None,
    )
assert db_session.scalars(select(Card)).all() == []

draft = service.create_card_with_first_value_for_actor(
    actor_user_id=actor.id, organization_id=organization.id, display_name=None,
    card_template_id=template.id, public_view_enabled=True, public_edit_enabled=True,
    field_id=optional.id, value="x", block_instance_id=None,
)
assert draft.lifecycle_status == "draft"

active = service.create_card_with_first_value_for_actor(
    actor_user_id=actor.id, organization_id=organization.id, display_name=None,
    card_template_id=required_only_template.id, public_view_enabled=True,
    public_edit_enabled=True, field_id=required.id, value="x", block_instance_id=None,
)
assert active.lifecycle_status == "active"
```

Also assert create, field-value update, and lifecycle audit events where a
transition occurs.

- [ ] **Step 2: Run the failing tests**

Run: `pytest backend/tests/test_registry_card_services.py -k "first_value" -q`

Expected: FAIL because the service method does not exist.

- [ ] **Step 3: Implement one transactional service method**

Use `with self.session.begin_nested():`. Validate the actor’s `cards.manage`
access and template membership before creating the card. Coerce the first value
with the same typed validation as ordinary field writes, reject it when empty,
then call `create_card_for_actor`, write the field value, flush, and call
`synchronize_card_lifecycle`. Record create and field-value audits without
duplicating lifecycle audit events. Let any exception roll back the nested
transaction so no empty card remains.

- [ ] **Step 4: Add request/route/API tests**

Define `CardFirstSaveRequest` and add:

```python
@router.post(
    "/organizations/{organization_id}/cards/first-save",
    response_model=CardSummaryRead,
    status_code=status.HTTP_201_CREATED,
)
def first_save_organization_card(
    organization_id: UUID,
    payload: CardFirstSaveRequest,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> CardSummaryRead:
    card_service = CardService(session)
    card = card_service.create_card_with_first_value_for_actor(
        actor_user_id=actor_user_id,
        organization_id=organization_id,
        display_name=payload.display_name,
        card_template_id=payload.card_template_id,
        public_view_enabled=payload.public_view_enabled,
        public_edit_enabled=payload.public_edit_enabled,
        field_id=payload.field_id,
        value=payload.value,
        block_instance_id=payload.block_instance_id,
    )
    return _card_to_summary(card, card_service)
```

Test `201`, a blank initial value returning validation failure with zero cards,
and forbidden organization access returning `403`.

- [ ] **Step 5: Run focused backend verification**

Run: `pytest backend/tests/test_registry_card_services.py -k "first_value" -q; pytest backend/tests/test_api_phase_1f.py -k "first_save" -q`

Expected: all selected tests pass.

- [ ] **Step 6: Commit**

```powershell
git add backend/app/schemas/cards.py backend/app/services/cards.py backend/app/api/v1/endpoints/cards.py backend/tests/test_registry_card_services.py backend/tests/test_api_phase_1f.py
git commit -m "feat: save initial card value atomically"
```

### Task 3: Клиент API и изолированная динамическая форма

**Files:**
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/api/client.ts`
- Create: `frontend/src/features/cards/singleStageCardCreation.ts`
- Create: `frontend/src/features/cards/singleStageCardCreation.test.ts`
- Create: `frontend/src/features/cards/SingleStageCardCreation.tsx`
- Create: `frontend/src/features/cards/SingleStageCardCreation.test.tsx`

**Consumes:** preview and first-save API from Tasks 1–2, `FieldEditorControl`,
`CardLayoutRenderer`, and existing typed editor helpers.

**Produces:** a form that chooses organization/template/name statically,
loads template blocks dynamically, retains local values until first save, and
emits `onCardCreated(cardId)` only after server creation.

- [ ] **Step 1: Write failing pure-function tests**

Test `isNonEmptyCardCreationValue` for whitespace text, empty arrays, `false`,
dates, references, and numbers; test `requiredPreviewFieldIds`; test that
`firstSavePayload` includes exactly one edited field and static metadata.

```ts
expect(isNonEmptyCardCreationValue("   ")).toBe(false);
expect(isNonEmptyCardCreationValue(false)).toBe(true);
expect(firstSavePayload(state, field, "Текст").field_id).toBe(field.field_id);
```

- [ ] **Step 2: Run the unit test and confirm failure**

Run: `pnpm -C frontend exec vitest run src/features/cards/singleStageCardCreation.test.ts`

Expected: FAIL because the helper module is absent.

- [ ] **Step 3: Implement typed API and helpers**

Add TypeScript equivalents of the preview and first-save contracts. Add
`readOrganizationCardCreationPreview` and `firstSaveOrganizationCard` to
`frontend/src/api/client.ts`. Implement helper functions without React state so
they can be tested independently.

- [ ] **Step 4: Write failing component tests**

Mock preview requests and assert:

1. the sole template is selected automatically;
2. changing the template replaces the visible block title without calling
   `window.location.reload`;
3. selecting metadata alone makes no POST;
4. first nonempty field edit performs exactly one first-save POST and calls
   `onCardCreated` with its id;
5. a failed first save keeps typed text and shows a Russian error;
6. changing a template after a typed value requires confirmation before reset.

- [ ] **Step 5: Implement `SingleStageCardCreation`**

Use a query key containing token, organization id, and template id. Render the
static metadata block first, then loading/empty/error states, then template
layout and typed controls. Keep values in local state while `cardId` is null.
On a nonempty `onValueChange`, serialise a single first-save mutation; block
concurrent first-save attempts. On success, call `onCardCreated`, invalidate
the card queries, and hand future editing to the existing card workspace. Use
Russian labels `Организация`, `Шаблон`, `Наименование карточки`, `Черновик
сохранён`, and `Внутренняя ошибка сервиса` mapping through existing `errorText`.

- [ ] **Step 6: Run focused frontend verification**

Run: `pnpm -C frontend exec vitest run src/features/cards/singleStageCardCreation.test.ts src/features/cards/SingleStageCardCreation.test.tsx`

Expected: all selected tests pass.

- [ ] **Step 7: Commit**

```powershell
git add frontend/src/api/types.ts frontend/src/api/client.ts frontend/src/features/cards/singleStageCardCreation.ts frontend/src/features/cards/singleStageCardCreation.test.ts frontend/src/features/cards/SingleStageCardCreation.tsx frontend/src/features/cards/SingleStageCardCreation.test.tsx
git commit -m "feat: add dynamic single-stage card form"
```

### Task 4: Включить форму в рабочую область карточек

**Files:**
- Modify: `frontend/src/features/cards/CardsWorkspace.tsx`
- Modify: `frontend/src/features/cards/CardsWorkspace.test.tsx`

**Consumes:** `SingleStageCardCreation` from Task 3 and existing
`openCreatedCardEditor`, tab, query-invalidating, and bulk-editor behavior.

**Produces:** `Создать карточку` показывает динамическую форму вместо
`CardMutationForm`; после первого сохранения открывается обычная вкладка новой
карточки без обновления страницы.

- [ ] **Step 1: Write failing integration tests**

Replace the old expectation for a standalone submit button with checks that the
workspace renders static metadata and preview fields in the create tab, makes
no card-create request before field input, and opens the card tab after the
first-save response.

- [ ] **Step 2: Run the focused integration test and confirm failure**

Run: `pnpm -C frontend exec vitest run src/features/cards/CardsWorkspace.test.tsx -t "single-stage"`

Expected: FAIL because `CardsWorkspace` still renders `CardMutationForm` and
calls `createOrganizationCard` immediately.

- [ ] **Step 3: Replace the old mutation form wiring**

Remove `createCardMutation`, `handleCardFormSubmit`, and `CardMutationForm`.
Render `SingleStageCardCreation` for `activeShellTab === "create-card"`; pass
active templates, organizations, token, and an `onCardCreated` callback that
reuses `openCreatedCardEditor`. Preserve cancellation, tab state, and card-list
query invalidation. Do not expose public-access controls before a card exists.

- [ ] **Step 4: Run focused frontend tests**

Run: `pnpm -C frontend exec vitest run src/features/cards/CardsWorkspace.test.tsx src/features/cards/SingleStageCardCreation.test.tsx`

Expected: all selected tests pass.

- [ ] **Step 5: Commit**

```powershell
git add frontend/src/features/cards/CardsWorkspace.tsx frontend/src/features/cards/CardsWorkspace.test.tsx
git commit -m "feat: use single-stage card creation workspace"
```

### Task 5: Полная проверка и публикация

**Files:**
- Modify: `PLANS.md`

**Consumes:** Tasks 1–4.

**Produces:** validated `main`, серверная публикация и зафиксированная точка
продолжения.

- [ ] **Step 1: Run focused checks**

Run:

```powershell
pytest backend/tests/test_registry_card_services.py -k "creation_preview or first_value" -q
pytest backend/tests/test_api_phase_1f.py -k "creation_preview or first_save" -q
pnpm -C frontend exec vitest run src/features/cards/singleStageCardCreation.test.ts src/features/cards/SingleStageCardCreation.test.tsx src/features/cards/CardsWorkspace.test.tsx
pnpm -C frontend exec tsc --noEmit
pnpm -C frontend exec eslint src/api/client.ts src/api/types.ts src/features/cards/SingleStageCardCreation.tsx src/features/cards/singleStageCardCreation.ts src/features/cards/CardsWorkspace.tsx
pnpm -C frontend exec prettier --check src/api/client.ts src/api/types.ts src/features/cards/SingleStageCardCreation.tsx src/features/cards/singleStageCardCreation.ts src/features/cards/CardsWorkspace.tsx
pnpm -C frontend run build
```

Expected: selected backend/frontend tests, TypeScript, scoped lint/formatting,
and Vite build pass. Record pre-existing unrelated failures separately.

- [ ] **Step 2: Update the stop point**

Add to `PLANS.md` the commit, no-migration status, exact tests, known unrelated
quality-gate results, server deployment outcome, and live browser proof.

- [ ] **Step 3: Commit and publish on `main`**

```powershell
git add PLANS.md
git commit -m "docs: record single-stage card creation release"
git push origin main
powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1
powershell -ExecutionPolicy Bypass -File scripts/deploy-frontend.ps1
powershell -ExecutionPolicy Bypass -File scripts/server-check.ps1
```

- [ ] **Step 4: Prove the deployed flow**

In the browser, open `Карточки → Создать карточку`, choose an organization and
the sole template, confirm dynamic fields appear without a page reload, enter
one optional value and verify a draft appears, then fill the required fields
and verify its list status becomes `Активна`. Confirm that no blank card was
created before the first value.
