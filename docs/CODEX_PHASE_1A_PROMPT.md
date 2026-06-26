# Codex Prompt — Phase 1A Backend Foundation

Use this prompt as the first development task for Codex.

```text
Прочитай AGENTS.md, PLANS.md и README.md.

Ничего пока не реализуй.

Составь план Phase 1A: backend foundation.

Цель Phase 1A:
- создать backend skeleton на FastAPI;
- настроить config module;
- подготовить SQLAlchemy/Alembic foundation, если это не раздувает этап;
- настроить PostgreSQL connection settings через env;
- добавить healthcheck endpoint;
- добавить pytest/httpx тест healthcheck;
- добавить ruff;
- обновить README команды запуска;
- обновить PLANS.md.

Ограничения:
- не делать frontend;
- не делать модели реестра;
- не делать auth;
- не делать RBAC;
- не делать import/export;
- не делать MCP;
- не добавлять реальные персональные данные;
- не хранить секреты в Git.

Сначала покажи:
1. какие файлы будешь создавать или изменять;
2. какие команды проверки будешь использовать;
3. какие риски видишь.

После согласования реализуй Phase 1A, запусти проверки и обнови PLANS.md.
```

## Expected Phase 1A Files

Approximate structure:

```text
backend/
  app/
    main.py
    core/
      config.py
      database.py
  tests/
    test_healthcheck.py
  pyproject.toml

README.md
PLANS.md
```

Do not treat this list as mandatory if the existing repository already has a better structure. Inspect the current tree before editing.

## Acceptance Criteria

- App starts locally.
- Healthcheck endpoint returns OK.
- Healthcheck test passes.
- Ruff/check command passes or is documented if not yet available.
- PLANS.md records what was completed and what remains.
