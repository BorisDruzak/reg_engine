# Registry Engine

Registry Engine — расширяемый web-движок реестров с динамическими карточками, организационной моделью доступа, audit log, REST API и будущей поддержкой MCP.

Это не жёстко заданный кадровый реестр. Базовый принцип проекта: администратор создаёт реестр, настраивает структуру карточки через блоки и поля, а пользователи работают с карточками только в рамках своих прав доступа.

## Product Direction

Целевая система:

- web-панель;
- серверная PostgreSQL БД;
- REST API;
- MCP layer в будущем;
- пользователи и роли;
- доступы по организациям;
- динамические карточки;
- настраиваемые блоки и поля;
- audit log;
- импорт/экспорт на следующих этапах;
- документы и вложения на следующих этапах.

## MVP-1 Goal

Создать архитектурное ядро:

- users;
- organizations;
- registries;
- form_blocks;
- form_fields;
- cards;
- card_block_instances;
- field_values;
- roles;
- permissions;
- access_grants;
- audit_events;
- минимальный REST API;
- минимальный frontend для проверки schema-driven карточек.

## Non-goals for MVP-1

На первом этапе не делать:

- миграцию старой MDB-базы;
- интеграцию с service desk;
- импорт/экспорт;
- документы и файловое хранилище;
- сложные отчёты;
- MCP write-tools;
- production UI polish.

## Critical Architecture Rules

1. Не создавать жёсткую таблицу `employees` с фиксированными кадровыми полями.
2. Структура карточки задаётся через `registries`, `form_blocks`, `form_fields`.
3. Значения полей хранятся типизированно: `value_text`, `value_number`, `value_date`, `value_bool`, `value_json`.
4. Добавление нового поля не должно требовать миграции БД.
5. Старые карточки не должны ломаться после изменения схемы.
6. Права доступа проверяются на backend.
7. Frontend может скрывать элементы интерфейса, но не является уровнем безопасности.
8. Все create/update/archive действия пишутся в audit log.
9. Доступ к родительской организации не даёт доступ к дочерним без `include_descendants=true`.
10. Будущий MCP должен работать через API, а не напрямую через БД.

## Planned Stack

Backend:

- Python 3.12+
- FastAPI
- SQLAlchemy 2.x
- Alembic
- Pydantic v2
- PostgreSQL
- psycopg3
- pytest
- httpx
- ruff

Frontend:

- React
- TypeScript
- Vite
- schema-driven dynamic forms

Infrastructure:

- Docker Compose or documented server runtime
- PostgreSQL 16+

## Development Workspace

Development starts from the Codex Windows workspace:

```powershell
cd C:\Users\admin-2\Documents\reg_engine
```

## Main Commands

Run local checks:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/check.ps1
```

Run server checks:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/server-check.ps1
```

Commit and push changes:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/push-git.ps1 -Message "Describe the change"
```

Deploy the latest `origin/main` to `/opt/reg_engine`:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1
```

Run the full development cycle:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/dev-cycle.ps1 -Message "Describe the change"
```

## Database Check Password

The scripts do not store database passwords in Git. For full PostgreSQL TCP login checks, set the password in the current PowerShell session:

```powershell
$env:REG_ENGINE_PGPASSWORD = "<password>"
powershell -ExecutionPolicy Bypass -File scripts/server-check.ps1
```

The server can also keep the same value outside the repo in `/etc/reg_engine/reg_engine.env`.

## Server

- SSH target: `root@registoryengine`
- Server checkout: `/opt/reg_engine`
- GitHub remote: `git@github.com:BorisDruzak/reg_engine.git`
- PostgreSQL: `192.168.100.12:5432`, database `reg_engine`, role `reg_engine_admin`

## Current Status

Phase 0: repository and development rules are being prepared.

Next phase: Phase 1A — backend foundation.
