1. Базовая архитектурная модель v1
Главная идея

Технически система выглядит так:

Registry
  └── Cards
        ├── organization_id
        ├── org_unit_id
        ├── display_name
        ├── lifecycle_status
        └── dynamic field values

В интерфейсе пользователь может видеть:

Реестр сотрудников / АДМ
Реестр сотрудников / Подвед-1
Реестр сотрудников / Подвед-2

Но в базе это не отдельные схемы и не отдельные реестры. Это:

registry_id = employee_registry
organization_scope = доступная ветка организации

Так мы избегаем проблем с наследованием схемы, расхождением полей и сложной агрегацией.

2. Финальная схема БД v1

Ниже схема на уровне проектирования. Для реализации в SQLAlchemy/Alembic её нужно превратить в модели и миграции.

Общие правила для всех основных таблиц:

id uuid primary key
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
archived_at timestamptz nullable

Для uuid лучше использовать PostgreSQL gen_random_uuid() через pgcrypto.

2.1. Users

Пользователи системы — это администраторы и технические пользователи. Обычный человек, который редактирует карточку по ссылке, не является user.

users
  id uuid pk
  email text unique not null
  password_hash text nullable
  display_name text not null
  status text not null                 -- active / inactive / blocked
  is_superuser boolean not null default false
  last_login_at timestamptz nullable
  created_at timestamptz
  updated_at timestamptz
  archived_at timestamptz nullable

Индексы:

unique lower(email)
status
is_superuser
2.2. Roles / Permissions
roles
  id uuid pk
  code text unique not null            -- system_admin, org_admin
  name text not null
  description text nullable
  is_system boolean not null default false
  created_at timestamptz
  updated_at timestamptz
  archived_at timestamptz nullable
permissions
  id uuid pk
  code text unique not null
  description text nullable
role_permissions
  role_id uuid fk roles.id
  permission_id uuid fk permissions.id
  primary key(role_id, permission_id)

Стартовые роли:

system_admin
org_admin

Стартовые права:

registry.view
registry.manage_schema

organization.view
organization.manage
organization.create_child
organization.manage_admins

org_unit.view
org_unit.manage

card.list
card.view
card.create
card.edit
card.archive
card.transfer
card.public_link.manage

reference_list.view
reference_list.manage

audit.view
2.3. Organizations

Организации участвуют в RBAC.

organizations
  id uuid pk
  parent_id uuid nullable fk organizations.id
  code text not null
  name text not null
  type text not null default 'organization'
  is_active boolean not null default true
  created_by uuid nullable fk users.id
  created_at timestamptz
  updated_at timestamptz
  archived_at timestamptz nullable

Ограничения:

unique(code)
parent_id cannot point to self

Индексы:

parent_id
code
is_active
archived_at
2.4. Organization Closure

Нужна для быстрых проверок доступа по дереву.

organization_closure
  ancestor_id uuid fk organizations.id
  descendant_id uuid fk organizations.id
  depth integer not null
  primary key(ancestor_id, descendant_id)

Пример:

АДМ -> АДМ, depth 0
АДМ -> Подвед-1, depth 1
АДМ -> Подвед-1.1, depth 2
Подвед-1 -> Подвед-1.1, depth 1

При создании дочерней организации backend обязан обновить organization_closure.

2.5. Org Units

Отделы, управления, внутренние подразделения. В v1 используются для фильтрации и выпадающих списков, но не как отдельная RBAC-граница.

org_units
  id uuid pk
  organization_id uuid not null fk organizations.id
  parent_id uuid nullable fk org_units.id
  code text not null
  name text not null
  type text nullable                  -- department / management / office / custom
  is_active boolean not null default true
  created_by uuid nullable fk users.id
  created_at timestamptz
  updated_at timestamptz
  archived_at timestamptz nullable

Ограничения:

unique(organization_id, code)

Индексы:

organization_id
parent_id
is_active
2.6. Access Grants

Права назначаются пользователю в рамках организации и реестра.

access_grants
  id uuid pk
  user_id uuid not null fk users.id
  role_id uuid not null fk roles.id
  registry_id uuid nullable fk registries.id
  organization_id uuid nullable fk organizations.id
  include_descendants boolean not null default true
  valid_from timestamptz nullable
  valid_to timestamptz nullable
  created_by uuid nullable fk users.id
  created_at timestamptz
  archived_at timestamptz nullable

Правило для org_admin:

organization_id = его организация
include_descendants = true

То есть админ подведа видит свою ветку вниз, но не видит родителя и соседей.

Индексы:

user_id
role_id
registry_id
organization_id
include_descendants
valid_from, valid_to
2.7. Registries

Реестр — это тип списка карточек и схема карточки.

registries
  id uuid pk
  code text unique not null
  name text not null
  description text nullable
  lifecycle_status text not null default 'active'   -- active / archived
  schema_version integer not null default 1
  display_name_field_id uuid nullable               -- FK на form_fields, можно добавить после создания таблиц
  display_name_template text nullable               -- future: "{last_name} {first_name}"
  created_by uuid nullable fk users.id
  created_at timestamptz
  updated_at timestamptz
  archived_at timestamptz nullable

В v1 display_name можно задавать вручную при создании карточки. Позже можно синхронизировать его с выбранным полем.

2.8. Form Blocks

Блоки карточки.

form_blocks
  id uuid pk
  registry_id uuid not null fk registries.id
  code text not null
  title text not null
  description text nullable
  position integer not null default 0

  is_repeatable boolean not null default false
  min_instances integer nullable
  max_instances integer nullable

  is_system boolean not null default false
  is_locked boolean not null default false
  is_active boolean not null default true

  is_admin_only boolean not null default false
  public_visible boolean not null default true
  public_editable boolean not null default false

  display_mode text not null default 'section'      -- section / table / cards

  created_by uuid nullable fk users.id
  created_at timestamptz
  updated_at timestamptz
  archived_at timestamptz nullable

Ограничения:

unique(registry_id, code)

is_locked=true означает, что блок нельзя менять обычными средствами.

2.9. Form Fields

Динамические поля внутри блоков.

form_fields
  id uuid pk
  block_id uuid not null fk form_blocks.id

  code text not null
  label text not null
  description text nullable
  field_type text not null

  position integer not null default 0

  required_mode text not null default 'not_required'
  default_value_json jsonb nullable
  validation_json jsonb nullable

  options_source_type text nullable
  options_source_id uuid nullable
  options_config_json jsonb nullable

  is_system boolean not null default false
  is_locked boolean not null default false
  is_active boolean not null default true

  is_searchable boolean not null default false
  is_filterable boolean not null default false
  is_sortable boolean not null default false
  is_list_display boolean not null default false
  is_exportable boolean not null default true

  sensitivity_level text not null default 'normal'  -- normal / personal / sensitive / secret

  public_visible boolean not null default true
  public_editable boolean not null default false

  replaces_field_id uuid nullable fk form_fields.id

  created_by uuid nullable fk users.id
  created_at timestamptz
  updated_at timestamptz
  archived_at timestamptz nullable

Ограничения:

unique(block_id, code)

Типы полей v1:

text
textarea
integer
decimal
date
datetime
boolean
select
multi_select
organization_ref
org_unit_ref
user_ref
card_ref
registry_ref

file_ref оставляем на будущий этап документов.

Режимы обязательности:

not_required
required_for_new_cards
required_on_publish

В v1 по умолчанию используем:

not_required

Правило изменения типа:

field_type не меняем у существующего поля с данными.
Если нужно изменить тип — архивируем старое поле и создаём новое поле с новым code.
2.10. Reference Lists

Справочники значений для select, multi_select и других полей.

Примеры:

employee_statuses
education_levels
contract_types
position_groups
reference_lists
  id uuid pk
  registry_id uuid nullable fk registries.id
  owner_organization_id uuid nullable fk organizations.id

  code text not null
  name text not null
  description text nullable

  scope_mode text not null default 'global'          -- global / organization_exact / organization_tree
  inherit_to_descendants boolean not null default true
  locked_for_descendants boolean not null default true
  managed_by_system_only boolean not null default false

  is_active boolean not null default true

  created_by uuid nullable fk users.id
  created_at timestamptz
  updated_at timestamptz
  archived_at timestamptz nullable

Ограничения:

unique(registry_id, owner_organization_id, code)

Логика:

owner_organization_id = null → глобальный справочник
owner_organization_id = АДМ + inherit_to_descendants=true → доступен подведам
locked_for_descendants=true → подведы используют, но не редактируют
2.11. Reference Items
reference_items
  id uuid pk
  list_id uuid not null fk reference_lists.id
  parent_id uuid nullable fk reference_items.id

  code text not null
  label text not null
  description text nullable
  position integer not null default 0

  is_active boolean not null default true

  created_by uuid nullable fk users.id
  created_at timestamptz
  updated_at timestamptz
  archived_at timestamptz nullable

Ограничения:

unique(list_id, code)

Важно: в карточке храним ссылку на reference_items.id, а не текст. Тогда переименование значения не ломает старые карточки.

2.12. Cards

Карточка — единица содержания реестра.

cards
  id uuid pk

  registry_id uuid not null fk registries.id
  organization_id uuid not null fk organizations.id
  org_unit_id uuid nullable fk org_units.id

  display_name text not null

  lifecycle_status text not null default 'draft'
    -- draft / active / archived / superseded

  public_view_enabled boolean not null default false
  public_edit_enabled boolean not null default false

  created_by uuid nullable fk users.id
  updated_by uuid nullable fk users.id
  archived_by uuid nullable fk users.id
  archive_reason text nullable

  created_at timestamptz
  updated_at timestamptz
  archived_at timestamptz nullable

Индексы:

registry_id
organization_id
org_unit_id
lifecycle_status
lower(display_name)
registry_id, organization_id, lifecycle_status

Правила:

draft можно сохранять без обязательных полей
active требует проверки required_on_publish
archived/superseded не показываются в активных списках
hard delete через обычный UI запрещён
2.13. Card Block Instances

Экземпляры блоков внутри карточки.

Нужны для repeatable-блоков: образование, награды, служба, история.

card_block_instances
  id uuid pk
  card_id uuid not null fk cards.id
  block_id uuid not null fk form_blocks.id
  ordinal integer not null default 0

  created_by uuid nullable fk users.id
  created_at timestamptz
  updated_at timestamptz
  archived_at timestamptz nullable

Индексы:

card_id
block_id
card_id, block_id

Для неповторяемого блока backend должен не позволять создавать больше одного активного экземпляра.

2.14. Field Values

Типизированные значения полей.

field_values
  id uuid pk

  card_id uuid not null fk cards.id
  block_instance_id uuid not null fk card_block_instances.id
  field_id uuid not null fk form_fields.id

  value_text text nullable
  value_number numeric nullable
  value_date date nullable
  value_datetime timestamptz nullable
  value_bool boolean nullable
  value_json jsonb nullable

  value_reference_item_id uuid nullable fk reference_items.id
  value_card_id uuid nullable fk cards.id
  value_user_id uuid nullable fk users.id
  value_organization_id uuid nullable fk organizations.id
  value_org_unit_id uuid nullable fk org_units.id
  value_registry_id uuid nullable fk registries.id

  created_by uuid nullable fk users.id
  updated_by uuid nullable fk users.id

  created_at timestamptz
  updated_at timestamptz

Ограничения:

unique(card_id, block_instance_id, field_id)

Индексы:

card_id
block_instance_id
field_id
field_id, value_text
field_id, value_number
field_id, value_date
field_id, value_datetime
field_id, value_bool
field_id, value_reference_item_id
field_id, value_card_id
field_id, value_user_id
field_id, value_organization_id
field_id, value_org_unit_id

Правило:

Для одного field_type заполняется только соответствующее value_* поле.

Например:

text              → value_text
integer/decimal   → value_number
date              → value_date
boolean           → value_bool
select            → value_reference_item_id
organization_ref  → value_organization_id
org_unit_ref      → value_org_unit_id
card_ref          → value_card_id
user_ref          → value_user_id
2.15. Field Value Items

Для multi_select.

field_value_items
  id uuid pk
  field_value_id uuid not null fk field_values.id
  reference_item_id uuid not null fk reference_items.id
  position integer not null default 0

Ограничения:

unique(field_value_id, reference_item_id)
2.16. Card Relations

Связи между карточками.

Нужно для перевода, копирования, замены, связанной карточки.

card_relations
  id uuid pk

  source_card_id uuid not null fk cards.id
  target_card_id uuid not null fk cards.id

  relation_type text not null
    -- transferred_to / copied_to / replaced_by / related_to

  description text nullable

  created_by uuid nullable fk users.id
  created_at timestamptz

Пример перевода:

old_card -- transferred_to --> new_card

Старая карточка остаётся:

organization_id = старая организация
lifecycle_status = superseded

Старый админ видит её в архиве.

2.17. Card Public Links

Публичные ссылки для прямого редактирования карточки.

card_public_links
  id uuid pk

  card_id uuid not null fk cards.id

  token_hash text unique not null
  status text not null default 'active'
    -- active / disabled / expired

  can_view boolean not null default true
  can_edit boolean not null default true

  expires_at timestamptz not null
  max_uses integer nullable
  used_count integer not null default 0

  allowed_blocks_json jsonb nullable
  allowed_fields_json jsonb nullable

  created_by uuid nullable fk users.id
  created_at timestamptz
  disabled_at timestamptz nullable

Правила:

1. Сама ссылка живёт 7 дней.
2. В БД храним token_hash, не сам token.
3. Редактирование разрешено только если:
   - link.status = active
   - now() < expires_at
   - card.public_edit_enabled = true
   - link.can_edit = true
   - block.public_editable = true
   - field.public_editable = true
4. Если card.public_edit_enabled=false, ссылка не может редактировать даже до истечения срока.
5. Все изменения через ссылку пишутся в audit_events.
2.18. Audit Events
audit_events
  id uuid pk

  actor_type text not null
    -- user / public_link / system

  actor_user_id uuid nullable fk users.id
  actor_public_link_id uuid nullable fk card_public_links.id

  action text not null
  object_type text not null
  object_id uuid nullable

  old_data_json jsonb nullable
  new_data_json jsonb nullable

  source text not null
    -- web / api / public_link / system / future_mcp / future_import

  ip_address inet nullable
  user_agent text nullable
  request_id text nullable

  created_at timestamptz not null default now()

Индексы:

actor_user_id
actor_public_link_id
object_type, object_id
action
source
created_at
request_id

Логируем:

organization.create
organization.update
organization.archive

org_unit.create
org_unit.update
org_unit.archive

registry.create
registry.update
registry.archive

block.create
block.update
block.archive

field.create
field.update
field.archive

reference_list.create
reference_list.update
reference_list.archive

reference_item.create
reference_item.update
reference_item.archive

card.create
card.update
card.archive
card.transfer
card.public_edit_enabled
card.public_link.create
card.public_link.disable

field_value.create
field_value.update
field_value.delete_or_clear

access_grant.create
access_grant.update
access_grant.archive
3. Ключевые backend-механизмы v1
3.1. OrganizationService

Отвечает за:

создание организации
создание подведа
проверку, что org_admin создаёт подвед только внутри своей ветки
обновление organization_closure
архивацию организации
получение дерева организаций
получение доступной ветки пользователя

Главное правило:

system_admin может всё
org_admin может управлять своей организацией и descendants
org_admin не может управлять parent/sibling branches
3.2. OrgUnitService

Отвечает за:

создание отделов/управлений внутри организации
редактирование org_units
архивацию org_units
фильтрацию org_units по организации

В v1 org_units не являются RBAC-границей.

3.3. PermissionService

Центральная точка проверки прав.

Методы:

can_manage_schema(user, registry_id)
can_view_organization(user, organization_id)
can_manage_organization(user, organization_id)
can_create_child_organization(user, parent_organization_id)
can_view_card(user, card_id)
can_edit_card(user, card_id)
can_archive_card(user, card_id)
can_transfer_card(user, card_id, target_organization_id)
can_manage_public_link(user, card_id)
can_manage_reference_list(user, reference_list_id)

Логика:

is_superuser → true
иначе проверяем access_grants
иначе deny
3.4. RegistrySchemaService

Отвечает за:

создание реестра
создание блока
создание поля
архивацию блока
архивацию поля
получение схемы реестра
проверку locked/system полей
валидацию field_type
валидацию required_mode

Важное правило:

Добавление нового поля не создаёт field_values во всех старых карточках.
При чтении карточки backend объединяет schema + existing values.
Если значения нет — отдаёт null.
3.5. ReferenceListService

Отвечает за:

создание справочника
создание значения справочника
наследование справочника вниз по organization tree
запрет редактирования locked справочников дочерними админами
получение доступных значений для select/multi_select
3.6. CardService

Отвечает за:

создание карточки
редактирование системных полей карточки
редактирование dynamic field_values
создание block instances
архивацию карточки
перевод карточки в другую организацию
связь old_card → new_card
валидацию значений по field_type
валидацию required_on_publish

Главный сценарий адаптации к новым полям:

1. Есть карточка.
2. Админ добавляет новое поле.
3. field_values для старой карточки не создаются.
4. GET card возвращает schema и null для нового поля.
5. При сохранении значения создаётся новая запись field_values.
3.7. PublicLinkService

Отвечает за:

создание публичной ссылки на 7 дней
хеширование token
валидацию token
проверку expires_at
проверку card.public_edit_enabled
проверку public_visible/public_editable у блоков и полей
прямое сохранение значений
audit actor_type=public_link
3.8. AuditService

Единый сервис записи audit events.

Нельзя размазывать audit руками по контроллерам. Должен быть сервис:

audit.log(
  actor=...,
  action=...,
  object_type=...,
  object_id=...,
  old_data=...,
  new_data=...,
  source=...
)
3.9. CardQueryService

Отвечает за списки, поиск и фильтры.

В v1:

фильтр по registry_id
фильтр по organization subtree
фильтр по lifecycle_status
фильтр по org_unit_id
поиск по display_name

Позже:

фильтры по dynamic fields
сортировка по dynamic fields
полнотекстовый поиск
saved views
4. API v1
Auth / Users
POST /api/v1/auth/login
GET  /api/v1/auth/me

GET  /api/v1/users
POST /api/v1/users
GET  /api/v1/users/{user_id}
PATCH /api/v1/users/{user_id}
Organizations
GET  /api/v1/organizations
POST /api/v1/organizations
GET  /api/v1/organizations/tree
GET  /api/v1/organizations/{organization_id}
PATCH /api/v1/organizations/{organization_id}
POST /api/v1/organizations/{organization_id}/children
POST /api/v1/organizations/{organization_id}/archive
Org Units
GET  /api/v1/org-units?organization_id=...
POST /api/v1/org-units
GET  /api/v1/org-units/{org_unit_id}
PATCH /api/v1/org-units/{org_unit_id}
POST /api/v1/org-units/{org_unit_id}/archive
Registries and Schema
GET  /api/v1/registries
POST /api/v1/registries
GET  /api/v1/registries/{registry_id}
PATCH /api/v1/registries/{registry_id}

GET  /api/v1/registries/{registry_id}/schema

POST /api/v1/registries/{registry_id}/blocks
PATCH /api/v1/blocks/{block_id}
POST  /api/v1/blocks/{block_id}/archive

POST /api/v1/blocks/{block_id}/fields
PATCH /api/v1/fields/{field_id}
POST  /api/v1/fields/{field_id}/archive
Reference Lists
GET  /api/v1/reference-lists
POST /api/v1/reference-lists
GET  /api/v1/reference-lists/{list_id}
PATCH /api/v1/reference-lists/{list_id}
POST /api/v1/reference-lists/{list_id}/archive

GET  /api/v1/reference-lists/{list_id}/items
POST /api/v1/reference-lists/{list_id}/items
PATCH /api/v1/reference-items/{item_id}
POST  /api/v1/reference-items/{item_id}/archive
Cards
GET  /api/v1/cards
POST /api/v1/cards
GET  /api/v1/cards/{card_id}
PATCH /api/v1/cards/{card_id}
POST /api/v1/cards/{card_id}/archive

GET  /api/v1/cards/{card_id}/values
PATCH /api/v1/cards/{card_id}/values

POST /api/v1/cards/{card_id}/block-instances
POST /api/v1/block-instances/{block_instance_id}/archive

POST /api/v1/cards/{card_id}/transfer
GET  /api/v1/cards/{card_id}/relations

Фильтры:

GET /api/v1/cards?registry_id=...
GET /api/v1/cards?organization_id=...
GET /api/v1/cards?include_descendants=true
GET /api/v1/cards?lifecycle_status=active
GET /api/v1/cards?query=агафонова
GET /api/v1/cards?org_unit_id=...
Public Links

Админские endpoints:

POST /api/v1/cards/{card_id}/public-links
GET  /api/v1/cards/{card_id}/public-links
POST /api/v1/public-links/{link_id}/disable
PATCH /api/v1/cards/{card_id}/public-edit

Публичные endpoints без авторизации:

GET   /public/card-edit/{token}
PATCH /public/card-edit/{token}/values

Правило:

PATCH запрещён, если cards.public_edit_enabled=false.
Audit
GET /api/v1/audit
GET /api/v1/cards/{card_id}/audit
GET /api/v1/organizations/{organization_id}/audit
5. План разработки основы
Phase Core-1 — Models + Alembic

Цель:

создать SQLAlchemy модели и Alembic migration для схемы v1

Сделать:

users
roles
permissions
role_permissions
organizations
organization_closure
org_units
access_grants
registries
form_blocks
form_fields
reference_lists
reference_items
cards
card_block_instances
field_values
field_value_items
card_relations
card_public_links
audit_events

Проверки:

alembic upgrade head
pytest test_models_smoke
Phase Core-2 — Organization Tree + RBAC

Цель:

организации, подведы, closure table, права org_admin

Тесты:

system_admin can create root organization
org_admin can create child organization in own subtree
org_admin cannot create sibling organization
org_admin cannot see parent
org_admin sees descendants
org_admin cannot see sibling branch
Phase Core-3 — Registry Schema + Reference Lists

Цель:

реестр, блоки, поля, справочники

Тесты:

system_admin creates registry
system_admin creates block
system_admin creates field
org_admin cannot manage schema
new field does not create values for old cards
reference list inherited to descendants
locked reference list cannot be edited by descendant admin
Phase Core-4 — Cards + Dynamic Values

Цель:

создание карточек, значения полей, повторяемые блоки

Тесты:

org_admin creates card in own organization
org_admin cannot create card in sibling organization
org_admin can edit own subtree card
org_admin cannot edit parent card
old card shows new field as null
field value validates by type
select stores reference_item_id
multi_select stores field_value_items
archived card leaves data intact
Phase Core-5 — Public Link Direct Edit

Цель:

ссылка на 7 дней, прямое сохранение, запрет при выключенном тумблере

Тесты:

admin creates public link
public link expires in 7 days
public link can edit public_editable fields
public link cannot edit admin-only block
public link cannot edit field with public_editable=false
public link cannot edit if card.public_edit_enabled=false
public link writes audit event
Phase Core-6 — Transfer + Archive

Цель:

перевод карточки через создание новой карточки

Тесты:

transfer creates new card in target organization
old card becomes superseded
card_relations stores transferred_to
old org admin sees old card in archive
old org admin does not see new active card if target outside scope
top org admin sees both