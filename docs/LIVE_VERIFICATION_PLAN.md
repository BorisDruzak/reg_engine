Phase 5S — Live Scenario Verification
Цель

Проверить проект как реальную систему:

действие пользователя → backend/API → БД/storage/audit → UI/MCP/API результат

Каждая проверка должна давать доказательство:

1. действие выполнено;
2. данные записались правильно;
3. права доступа соблюдены;
4. audit появился;
5. архивирование не удаляет физически;
6. storage не оставляет мусор;
7. UI показывает корректное состояние;
8. запрещённые действия действительно запрещены.
1. Среда проверки

Live-проверки нужно делать не на production-данных.

Рекомендуемая среда:

DB: reg_engine_livecheck_test
Storage root: отдельная временная директория
Frontend: staging / test frontend build
Backend: текущий main
MCP: отдельный test token

Все тестовые сущности создавать с единым префиксом:

livecheck_YYYYMMDD_HHMM

Например:

livecheck_20260701_1200_adm
livecheck_20260701_1200_registry
livecheck_20260701_1200_card_ivanov

Это упростит поиск, audit и cleanup.

2. Общая форма evidence для каждого сценария

Каждый live-сценарий должен фиксироваться так:

Scenario ID:
Actor:
UI/API/MCP action:
Expected UI result:
Expected DB result:
Expected audit result:
Expected storage result:
Negative checks:
Actual result:
Bug? yes/no:
Evidence:

Пример:

Scenario ID: LC-CARD-004
Actor: org_admin_tu1
Action: создать карточку в TU-1
Expected UI: карточка видна в списке TU-1
Expected DB: row в cards, organization_id = TU-1
Expected audit: audit_events object_type=card, action=create
Expected storage: нет изменений
Negative check: org_admin_tu2 не видит карточку
Actual: ...
Bug: no
Evidence: SQL output, screenshot, API response
3. Базовые тестовые роли

Нужно создать минимум 5 пользователей:

system_admin_livecheck
registry_admin_livecheck
org_admin_adm_livecheck
org_admin_tu1_livecheck
org_admin_tu2_livecheck
mcp_operator_livecheck

И одну public-link роль без логина:

public_link_user
Проверяемая иерархия организаций
ADM
├── TU-1
│   └── TU-1-Sub
└── TU-2

Ожидаемая логика:

system_admin видит всё;
org_admin_adm видит ADM, TU-1, TU-1-Sub, TU-2;
org_admin_tu1 видит TU-1 и TU-1-Sub;
org_admin_tu1 не видит ADM и TU-2;
org_admin_tu2 не видит TU-1.
4. Базовый реестр для live-check

Создать реестр:

code: livecheck_person_registry
name: Livecheck Registry

Блоки:

general_info — не повторяемый
education — повторяемый
documents — не повторяемый

Поля:

general_info.full_name        text
general_info.birth_date       date
general_info.is_active        bool
general_info.status           select
general_info.org_unit         org_unit_ref
education.institution         text
education.graduation_year     number
documents.main_document       file_ref

Справочник:

employee_status
- active
- dismissed
- archive_review
5. Live-сценарии
LC-001 — Login / session / logout
Действие
Войти как system_admin_livecheck.
Проверить /auth/me.
Выйти.
Попробовать открыть protected section после logout.
Проверка

UI:

после login открывается admin workspace;
после logout возвращает на login screen;
protected данные больше не доступны.

DB:

select id, email, status, is_superuser
from users
where email like 'system_admin_livecheck%';

Bug, если:

logout оставляет UI в состоянии авторизованного пользователя;
после logout старые protected данные продолжают отображаться как активные;
disabled/archived user может войти.
LC-002 — Organization hierarchy и visibility
Действие
Создать ADM.
Создать TU-1 и TU-2 как подведы ADM.
Создать TU-1-Sub как подвед TU-1.
Назначить org_admin_tu1 на TU-1.
DB-проверка
select code, parent_id, archived_at
from organizations
where code like 'livecheck_%'
order by code;
select ancestor_id, descendant_id, depth
from organization_closure
where ancestor_id in (
  select id from organizations where code like 'livecheck_%'
)
order by ancestor_id, depth;
select ag.user_id, ag.organization_id, ag.include_descendants, r.code as role_code
from access_grants ag
join roles r on r.id = ag.role_id
where ag.organization_id in (
  select id from organizations where code like 'livecheck_%'
);
Проверка логики

Как org_admin_tu1:

видит TU-1;
видит TU-1-Sub;
не видит ADM;
не видит TU-2.

Bug, если:

org_admin_tu1 видит sibling TU-2;
org_admin_tu1 может редактировать ADM;
organization_closure не содержит ancestor/descendant связей.
LC-003 — Registry/schema creation
Действие

Как registry_admin_livecheck или system_admin_livecheck:

Создать registry.
Создать blocks.
Создать fields.
Создать reference list и items.
DB-проверка
select id, code, name, lifecycle_status, archived_at
from registries
where code = 'livecheck_person_registry';
select fb.code as block_code, ff.code as field_code, ff.field_type, ff.archived_at
from form_fields ff
join form_blocks fb on fb.id = ff.block_id
where fb.registry_id = (
  select id from registries where code = 'livecheck_person_registry'
)
order by fb.position, ff.position;
select rl.code as list_code, ri.code as item_code, ri.label
from reference_items ri
join reference_lists rl on rl.id = ri.reference_list_id
where rl.code = 'livecheck_employee_status';

Bug, если:

org_admin может менять schema без registry.schema.manage;
field_type не сохраняется корректно;
select поле не связано со справочником;
новые поля не появляются в старых карточках пустыми.
LC-004 — Card create / read / scoped visibility
Действие
Как org_admin_tu1 создать карточку в TU-1.
Заполнить full_name, birth_date, status.
Проверить видимость карточки:
org_admin_tu1 видит;
org_admin_adm видит;
org_admin_tu2 не видит.
DB-проверка
select id, display_name, registry_id, organization_id, lifecycle_status, archived_at
from cards
where display_name like 'livecheck_%';
select fv.card_id, ff.code, ff.field_type,
       fv.value_text, fv.value_date, fv.value_bool,
       fv.value_reference_item_id, fv.value_attachment_id
from field_values fv
join form_fields ff on ff.id = fv.field_id
where fv.card_id in (
  select id from cards where display_name like 'livecheck_%'
)
order by ff.code;
Audit
select action, object_type, object_id, actor_user_id, source, created_at
from audit_events
where object_type in ('card', 'field_value')
  and created_at > now() - interval '1 hour'
order by created_at desc;

Bug, если:

карточка видна sibling admin;
field_values не записались;
audit отсутствует;
UI показывает сохранение, но БД не изменилась.
LC-005 — Bulk field update atomicity
Действие
Открыть карточку.
Сделать bulk update нескольких полей.
Повторить bulk update, где одно поле заведомо invalid.
Ожидаемо
валидный bulk update сохраняет все значения;
invalid bulk update не сохраняет ничего;
audit не должен создавать частично успешную историю.
DB-проверка

До и после invalid bulk:

select ff.code, fv.value_text, fv.value_date, fv.value_bool, fv.updated_at
from field_values fv
join form_fields ff on ff.id = fv.field_id
where fv.card_id = '<card_id>'
order by ff.code;

Bug, если:

часть значений сохранилась при ошибке;
bulk update обошёл валидацию single-field logic;
audit говорит success при rollback.
LC-006 — Repeatable block instances
Действие
В карточке добавить 2 блока education.
Заполнить разные значения.
Архивировать один block instance.
Проверить обычное чтение и archive scope.
DB-проверка
select cbi.id, fb.code, cbi.ordinal, cbi.archived_at
from card_block_instances cbi
join form_blocks fb on fb.id = cbi.block_id
where cbi.card_id = '<card_id>'
order by fb.code, cbi.ordinal;
select cbi.ordinal, ff.code, fv.value_text, fv.value_number
from field_values fv
join card_block_instances cbi on cbi.id = fv.block_instance_id
join form_fields ff on ff.id = fv.field_id
where fv.card_id = '<card_id>'
order by cbi.ordinal, ff.code;

Bug, если:

repeatable block перезаписывает старый instance;
archive физически удаляет values;
non-repeatable block можно архивировать как repeatable;
min_instances нарушается.
LC-007 — Attachment upload / download / archive
Действие
Загрузить файл к карточке.
Скачать файл.
Архивировать attachment.
Проверить, что обычный список его не показывает, archive scope показывает.
DB-проверка
select ca.id, ca.card_id, ca.title, ca.archived_at,
       sf.storage_backend, sf.storage_key, sf.original_filename,
       sf.content_type, sf.content_length_bytes, sf.checksum_sha256, sf.archived_at as stored_archived_at
from card_attachments ca
join stored_files sf on sf.id = ca.stored_file_id
where ca.card_id = '<card_id>';

Storage-проверка:

# Проверить, что файл физически существует в test storage root
find <storage_root> -type f | grep '<storage_key_fragment>'

Bug, если:

файл скачивается без прав;
archive физически удаляет файл без retention policy;
storage_key/path раскрывается в UI/API;
checksum не совпадает;
audit отсутствует.
LC-008 — file_ref
Действие
Загрузить attachment.
В поле documents.main_document выбрать этот attachment.
Прочитать карточку.
Архивировать attachment.
Повторно прочитать карточку.
Перевести карточку в другую организацию.
DB-проверка
select ff.code, fv.value_attachment_id
from field_values fv
join form_fields ff on ff.id = fv.field_id
where fv.card_id = '<card_id>'
  and ff.field_type = 'file_ref';

После transfer:

select old_ca.id as old_attachment_id,
       new_ca.id as new_attachment_id,
       old_ca.stored_file_id as old_stored_file_id,
       new_ca.stored_file_id as new_stored_file_id
from card_attachments old_ca
join card_attachments new_ca on new_ca.stored_file_id = old_ca.stored_file_id
where old_ca.card_id = '<old_card_id>'
  and new_ca.card_id = '<new_card_id>';

Bug, если:

file_ref может ссылаться на attachment другой карточки;
new card после transfer ссылается на old card_attachment.id;
file_ref раскрывает storage_key;
archived attachment ломает чтение карточки;
public link может редактировать file_ref без отдельного approval.
LC-009 — Public link: fields + attachments
Действие
Включить public_edit_enabled на карточке.
Создать public edit link.
Открыть public link без логина.
Изменить public-editable поле.
Загрузить attachment.
Скачать attachment.
Проверить лимиты:
field edit usage;
attachment upload usage;
list/download не тратят upload counter.
Disable link.
Проверить, что link больше не работает.
DB-проверка
select id, card_id, status, can_edit, expires_at,
       max_uses, used_count,
       max_attachment_uploads, attachment_upload_count,
       archived_at
from card_public_links
where card_id = '<card_id>';
select actor_type, source, action, object_type, object_id, created_at
from audit_events
where actor_type = 'public_link'
  and created_at > now() - interval '1 hour'
order by created_at desc;

Bug, если:

download увеличивает attachment_upload_count;
field edit увеличивает attachment_upload_count;
upload увеличивает used_count;
disabled/expired link всё ещё работает;
public link может archive/delete attachment;
public link видит private fields.
LC-010 — Generated documents
Действие
Создать document template.
Сгенерировать .docx_text_v1 document.
Сгенерировать PDF.
Скачать оба.
Архивировать generated document.
Проверить archive scope.
DB-проверка
select id, registry_id, code, name, template_format, archived_at
from document_templates
where code like 'livecheck_%';
select gd.id, gd.card_id, gd.document_template_id,
       gd.output_filename, gd.content_type, gd.render_status,
       gd.stored_file_id, gd.archived_at
from generated_documents gd
where gd.card_id = '<card_id>';
select id, storage_key, original_filename, content_type, content_length_bytes
from stored_files
where id in (
  select stored_file_id from generated_documents where card_id = '<card_id>'
);

Bug, если:

document генерируется по карточке вне scope;
archived document скачивается без include_archive;
file_ref рендерится как storage path;
PDF содержит нечитаемый текст;
audit отсутствует.
LC-011 — Import/export CSV/XLSX
Действие
Export cards JSON.
Export cards CSV.
Export cards XLSX.
Preview import CSV с валидными строками.
Preview import CSV с ошибками.
Commit valid import.
Проверить rollback на invalid commit.
Проверить oversized XLSX/CSV limit после реализации Phase 5R.
DB-проверка
select action, object_type, object_id, new_data_json, created_at
from audit_events
where action in ('export', 'import_commit')
  and created_at > now() - interval '1 hour'
order by created_at desc;

Для новых карточек после import:

select id, display_name, organization_id, registry_id, created_at
from cards
where display_name like 'livecheck_import_%';

Bug, если:

preview мутирует БД;
invalid commit частично создаёт карточки;
export показывает sibling cards;
CSV/XLSX экспорт обещает binary files, но не содержит их без пояснения;
большой XLSX читается без лимита.
LC-012 — Reports
Действие
Создать report template registry_cards.
Создать report template card_detail.
Проверить parameters_schema_json.
Сгенерировать JSON, CSV, XLSX, PDF.
Скачать output.
Архивировать report run.
Скачать archived через include_archive=true.
DB-проверка
select id, registry_id, code, report_type, output_format,
       parameters_schema_json, default_parameters_json, archived_at
from report_templates
where code like 'livecheck_%';
select id, report_template_id, registry_id, card_id,
       stored_file_id, report_type, run_status,
       parameters_json, summary_json, row_count,
       output_filename, output_content_type, archived_at
from report_runs
where report_template_id in (
  select id from report_templates where code like 'livecheck_%'
)
order by created_at desc;

Bug, если:

frontend validation есть, но API принимает invalid parameters;
report видит cards вне actor scope;
archive run скачивается без include_archive;
PDF/XLSX content type неверный;
stored_file остаётся после rollback failed run.
LC-013 — MCP read/write/content
Действие

Через MCP test token:

tools/list.
Read organizations.
Read registry schema.
Read card.
Create registry или card через write tool на test data.
Archive через destructive tool без confirm — должен быть отказ.
Archive с confirm — должен пройти.
Read report/generated document content under size limit.
Oversized content — должен быть controlled error после Phase 5Q.
Проверка

MCP tools:

read tools: readOnlyHint=true
write tools: readOnlyHint=false
destructive write tools require confirm_*=true
all tools call REST API only

Audit:

select source, action, object_type, object_id, created_at
from audit_events
where source = 'mcp'
  and created_at > now() - interval '1 hour'
order by created_at desc;

Bug, если:

MCP bypasses REST/API;
MCP write tool lacks confirmation for destructive action;
MCP content tool returns unbounded base64;
MCP error exposes SQL/storage path;
MCP action does not write audit source=mcp.
LC-014 — Scoped user no-error UX
Действие
Войти как org_admin_tu1.
Открыть карточки.
Создать/редактировать карточку.
Не открывать users/access/audit.
Проверить, что нет глобальных 403 banners от users/roles/permissions/audit.
Ожидаемо
card workflow работает;
нет глобального DataAlert из-за недоступных admin-only endpoints;
при открытии users/access/audit показывается section-local access error.

Bug, если:

пользователь может работать с карточками, но постоянно видит 403 от unrelated sections;
UI загружает все admin-only endpoints сразу после login;
scope user считает, что система сломана.
LC-015 — Backup/restore drill
Действие
Сделать backup livecheck DB.
Restore в disposable DB.
Поднять backend на restored DB.
Проверить:
Alembic current;
login;
card read;
attachment download;
generated document download;
report download;
MCP health/read.
Команды-пример
pg_dump -Fc reg_engine_livecheck_test > /tmp/reg_engine_livecheck_test.dump
createdb reg_engine_restore_test
pg_restore -d reg_engine_restore_test /tmp/reg_engine_livecheck_test.dump

Проверка Alembic:

cd /opt/reg_engine/backend
DATABASE_URL='postgresql+psycopg:///reg_engine_restore_test' .venv/bin/python -m alembic current

Bug, если:

restore не поднимается;
storage files не соответствуют DB metadata;
attachments/documents/reports не скачиваются после restore;
Alembic state повреждён.
6. Приоритет live-проверок

Я бы запускал в таком порядке:

1. LC-001 Login/session.
2. LC-002 Organization hierarchy/RBAC.
3. LC-003 Registry/schema/reference.
4. LC-004 Card create/read/scope.
5. LC-005 Bulk values atomicity.
6. LC-006 Repeatable blocks.
7. LC-007 Attachments.
8. LC-008 file_ref.
9. LC-009 Public links.
10. LC-010 Generated documents.
11. LC-011 Import/export.
12. LC-012 Reports.
13. LC-013 MCP.
14. LC-014 Scoped user frontend UX.
15. LC-015 Backup/restore.

Stop rule:

Если падает LC-002 RBAC или LC-004 card scope — дальше документы/import/reports/MCP не тестировать, сначала исправить права.
Если падает storage consistency — дальше attachment/document/report tests не продолжать.
Если падает audit — не считать сценарий готовым.
7. Что считать багом

Баг фиксируется, если есть хотя бы одно:

UI показывает success, но БД не изменилась;
БД изменилась, но audit отсутствует;
запрещённый actor выполнил действие;
actor видит parent/sibling/out-of-scope данные;
archive физически удаляет бизнес-данные без отдельной политики;
public link делает больше, чем разрешено;
MCP обходит REST API;
import preview мутирует данные;
invalid import частично commit-ится;
download раскрывает storage_key/path;
большой файл/отчёт/import не имеет лимита;
после restore данные не читаются.