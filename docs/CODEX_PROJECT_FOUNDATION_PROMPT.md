Прочитай README.md, PLANS.md и AGENTS.md.

Задача: подготовить грамотную техническую основу проекта Registry Engine.

Это этап Project Foundation Tooling. Не реализуй бизнес-логику реестра, карточек, пользователей, RBAC, API CRUD, импорт/экспорт, документы или MCP. Сейчас нужно подготовить структуру проекта, зависимости, тестовую инфраструктуру, скрипты, документацию навигации по проекту и базовые smoke tests.

Контекст проекта:
Registry Engine — расширяемый web-движок реестров. Это не жёстко заданный employee registry. Нельзя создавать фиксированную таблицу employees с кадровыми полями. В будущем структура карточек должна задаваться через registries, form_blocks, form_fields, cards, card_block_instances, field_values.

Перед изменениями:
1. Проверь текущую структуру проекта.
2. Проверь git status.
3. Не удаляй и не перезаписывай существующие scripts/*.ps1 без анализа.
4. Не коммить секреты, .env, реальные персональные данные, MDB/ACCDB, дампы БД, приватные ключи.
5. Сначала покажи план: какие файлы будешь создавать/изменять, какие зависимости добавишь, какие команды проверки будут доступны.
6. После согласования реализуй.

Главная цель этапа:
Создать основу, чтобы дальнейшая разработка через Codex была управляемой:
- понятная иерархия папок;
- backend skeleton на FastAPI;
- frontend skeleton на React + TypeScript + Vite;
- зависимости backend/frontend;
- тестовая инфраструктура backend/frontend/e2e;
- lint/format/typecheck;
- PowerShell scripts для Windows Codex workspace;
- проектная карта для навигации Codex;
- CI workflow;
- документация команд запуска и проверки.

Не реализовывать:
- auth;
- RBAC;
- модели users/organizations/registries/cards;
- Alembic миграции бизнес-таблиц;
- frontend страницы реестра;
- импорт/экспорт;
- документы;
- MCP;
- интеграцию с service desk;
- миграцию MDB.

Разрешено:
- healthcheck endpoint;
- базовая структура backend;
- базовая структура frontend;
- примерный smoke test;
- placeholder components;
- project documentation.

Требуемая итоговая структура проекта:

registry-engine/
  README.md
  PLANS.md
  AGENTS.md
  .gitignore
  .env.example
  .editorconfig
  .pre-commit-config.yaml
  pnpm-workspace.yaml
  package.json
  docker-compose.dev.yml optional
  docs/
    PROJECT_MAP.md
    PROJECT_TREE.md
    ARCHITECTURE.md
    CONVENTIONS.md
    CODEX_WORKFLOW.md
    ADR/
      0001-project-foundation.md
  scripts/
    check.ps1
    test.ps1
    lint.ps1
    format.ps1
    typecheck.ps1
    project-map.ps1
    tree.ps1
    dev-backend.ps1
    dev-frontend.ps1
    server-check.ps1 existing if already present
    push-git.ps1 existing if already present
    deploy.ps1 existing if already present
    dev-cycle.ps1 existing if already present
    lib/
      RegEngine.ps1 existing if already present
  backend/
    pyproject.toml
    alembic.ini optional placeholder
    app/
      __init__.py
      main.py
      api/
        __init__.py
        v1/
          __init__.py
          router.py
          endpoints/
            __init__.py
            health.py
      core/
        __init__.py
        config.py
        database.py
        logging.py
      models/
        __init__.py
      schemas/
        __init__.py
      services/
        __init__.py
      repositories/
        __init__.py
    tests/
      __init__.py
      conftest.py
      test_healthcheck.py
  frontend/
    package.json
    index.html
    vite.config.ts
    vitest.config.ts or test config inside vite.config.ts
    tsconfig.json
    tsconfig.app.json
    tsconfig.node.json
    eslint.config.js or eslint.config.mjs
    .prettierrc
    .prettierignore
    playwright.config.ts
    src/
      main.tsx
      App.tsx
      app/
        AppProviders.tsx
        router.tsx
      api/
        client.ts
        types.ts
      components/
        layout/
        common/
      features/
        registry/
        cards/
        organizations/
      pages/
        HomePage.tsx
      test/
        setup.ts
      styles/
        globals.css
    tests/
      e2e/
        smoke.spec.ts
  .github/
    workflows/
      ci.yml

Backend dependencies:
Use backend/pyproject.toml as the source of truth.

Runtime dependencies:
- fastapi
- uvicorn[standard]
- pydantic
- pydantic-settings
- SQLAlchemy
- alembic
- psycopg[binary]

Dev/test dependencies:
- pytest
- pytest-cov
- httpx
- ruff
- mypy
- pre-commit
- pytest-asyncio optional, only if async tests are introduced
- testcontainers[postgresql] optional, documented for future DB integration tests but not required in the first healthcheck test

Do not add unused auth/security dependencies yet unless you only document them as future dependencies. Do not add python-jose, passlib, argon2-cffi, redis, celery, minio, openpyxl, python-docx, weasyprint, or MCP libraries in this phase.

Backend configuration:
- Use pydantic-settings in backend/app/core/config.py.
- Read values from environment variables and optional .env.
- Do not fail app startup only because DATABASE_URL is absent if the current phase does not use DB yet.
- Provide Settings class with:
  - app_env
  - app_name
  - api_v1_prefix
  - database_url optional
  - log_level
- Keep .env.example updated.

Backend FastAPI:
- Create app/main.py.
- Create app/api/v1/router.py.
- Create app/api/v1/endpoints/health.py.
- Add GET /health and GET /api/v1/health.
- Response example:
  {"status": "ok", "service": "reg_engine"}
- Keep healthcheck independent from DB.

Backend tests:
- Use pytest.
- Use FastAPI TestClient or HTTPX through FastAPI testing tools.
- Add backend/tests/test_healthcheck.py.
- Test:
  - GET /health returns 200.
  - GET /api/v1/health returns 200.
  - JSON contains status=ok.

Backend pyproject:
Configure:
- project metadata;
- Python >=3.12;
- dependencies;
- optional dev dependencies;
- pytest config;
- ruff config;
- mypy config.

Suggested backend commands:
- python -m pip install -e ".[dev]"
- python -m pytest
- ruff check .
- ruff format --check .
- mypy app

If uv is available:
- uv sync --extra dev
- uv run pytest
- uv run ruff check .
- uv run ruff format --check .
- uv run mypy app

Do not make uv mandatory unless the repo already uses it. Document both pip and uv flows if uv is added.

Frontend:
Create frontend using Vite React TypeScript structure. If frontend directory does not exist, scaffold equivalent of:
- Vite
- React
- TypeScript

Do not use interactive prompts. If using package manager commands, prefer pnpm:
- pnpm create vite frontend --template react-ts
or manually create files if scaffolding would overwrite existing files.

Frontend runtime dependencies:
- react
- react-dom
- react-router-dom
- @tanstack/react-query
- zod
- react-hook-form
- @hookform/resolvers

Do not add a heavy UI component library yet. No Material UI, Ant Design, Mantine, Tailwind, shadcn/ui unless explicitly requested later. Use minimal CSS for now.

Frontend dev/test dependencies:
- typescript
- vite
- @vitejs/plugin-react
- vitest
- jsdom
- @testing-library/react
- @testing-library/jest-dom
- @testing-library/user-event
- @playwright/test
- eslint
- @eslint/js
- typescript-eslint
- eslint-plugin-react-hooks
- eslint-plugin-react-refresh
- prettier
- eslint-config-prettier
- vite-tsconfig-paths optional

Frontend scripts in frontend/package.json:
- dev
- build
- preview
- lint
- format
- format:check
- typecheck
- test
- test:run
- test:coverage
- e2e
- e2e:ui

Root package.json:
Create root package.json only as command orchestrator, not as frontend package replacement.

Suggested root scripts:
- frontend:dev = pnpm -C frontend dev
- frontend:build = pnpm -C frontend build
- frontend:test = pnpm -C frontend test:run
- frontend:lint = pnpm -C frontend lint
- frontend:typecheck = pnpm -C frontend typecheck
- frontend:e2e = pnpm -C frontend e2e

Create pnpm-workspace.yaml:
packages:
  - "frontend"

Frontend TypeScript:
- Enable strict mode.
- Use path alias @ for src if configured cleanly.
- Add test setup file frontend/src/test/setup.ts.
- Add one smoke component test for App or HomePage.
- Add one Playwright smoke test that checks the app renders a home page text.
- Do not build actual registry UI yet.

Frontend App:
- Minimal App.tsx.
- Minimal HomePage.tsx.
- Display "Registry Engine" and short text.
- No business forms yet.

Scripts:
The user works primarily in Windows Codex app and PowerShell. Scripts must be PowerShell-first and should work from any directory inside the repo by resolving repository root.

Do not overwrite existing scripts blindly. If scripts/check.ps1, scripts/server-check.ps1, scripts/push-git.ps1, scripts/deploy.ps1, scripts/dev-cycle.ps1 already exist, inspect and extend safely.

Required scripts:

scripts/check.ps1:
- fail fast;
- print repo root;
- print git branch/status;
- run backend checks if backend exists;
- run frontend checks if frontend exists;
- run project map check if applicable;
- exit non-zero on failure.

scripts/test.ps1:
- run backend pytest;
- run frontend test:run;
- optionally skip e2e unless -E2E flag is provided.

scripts/lint.ps1:
- run backend ruff check;
- run frontend eslint.

scripts/format.ps1:
- support -Check flag;
- backend: ruff format or ruff format --check;
- frontend: prettier write/check.

scripts/typecheck.ps1:
- backend: mypy app;
- frontend: tsc noEmit.

scripts/dev-backend.ps1:
- start backend dev server.
- use uvicorn app.main:app --reload.
- document required working directory.

scripts/dev-frontend.ps1:
- start Vite dev server.

scripts/tree.ps1:
- print project tree excluding:
  - .git
  - .venv
  - node_modules
  - __pycache__
  - .pytest_cache
  - .ruff_cache
  - .mypy_cache
  - dist
  - build
  - coverage
  - htmlcov
  - uploads
  - storage
  - logs
  - artifacts

scripts/project-map.ps1:
- generate or update docs/PROJECT_TREE.md.
- Use git-tracked files and optionally untracked non-ignored files.
- Do not include file contents.
- Do not include secrets.
- Include:
  - current branch;
  - timestamp;
  - top-level directories;
  - important entrypoints;
  - available commands;
  - ignored/generated directories.

PowerShell script quality:
- Use Set-StrictMode -Version Latest where practical.
- Use $ErrorActionPreference = "Stop".
- Resolve repo root robustly.
- Avoid hardcoded absolute paths unless already documented in AGENTS.md.
- Do not echo secrets or environment variable values containing passwords.

Documentation:
Update or create docs/PROJECT_MAP.md.

docs/PROJECT_MAP.md must include:
- project purpose;
- current phase;
- main entrypoints;
- backend folder map;
- frontend folder map;
- scripts map;
- test strategy;
- command matrix;
- where to add new backend code;
- where to add new frontend code;
- where not to put business logic;
- Codex navigation rules.

Create docs/PROJECT_TREE.md generated by scripts/project-map.ps1.

Create docs/ARCHITECTURE.md:
- short overview of Registry Engine;
- schema-driven principle;
- API-first principle;
- backend checks permissions;
- future MCP must call API, not DB;
- dynamic form principle;
- typed field values principle;
- no hardcoded employee fields.

Create docs/CONVENTIONS.md:
- naming conventions;
- Python module conventions;
- TypeScript conventions;
- test naming conventions;
- script conventions;
- commit conventions;
- environment variable conventions.

Create docs/CODEX_WORKFLOW.md:
- how Codex should start each task;
- files to read first;
- commands to run;
- how to update PLANS.md;
- how to avoid large unreviewable changes.

Create docs/ADR/0001-project-foundation.md:
- decision: monorepo-style repo with backend and frontend folders;
- decision: FastAPI backend;
- decision: React + TypeScript + Vite frontend;
- decision: pytest/ruff/mypy backend quality gate;
- decision: Vitest/Testing Library/Playwright frontend quality gate;
- decision: PowerShell scripts as primary local automation;
- consequences and tradeoffs.

CI:
Create .github/workflows/ci.yml.

CI should run on:
- push to main;
- pull_request to main.

CI jobs:
1. backend:
   - setup Python 3.12;
   - install backend dev dependencies;
   - run ruff check;
   - run ruff format --check;
   - run mypy app;
   - run pytest.

2. frontend:
   - setup Node.js compatible with current Vite requirements;
   - enable corepack;
   - install pnpm if needed;
   - pnpm install --frozen-lockfile;
   - pnpm -C frontend lint;
   - pnpm -C frontend typecheck;
   - pnpm -C frontend test:run;
   - pnpm -C frontend build.

Do not require DB in CI during this phase.

Docker/Compose:
If adding Docker Compose, use docker-compose.dev.yml only and make it optional.
Do not conflict with existing server PostgreSQL.
If local PostgreSQL is included, use a non-conflicting port such as 5433.
Do not require Docker for the healthcheck test.

.env.example:
Update .env.example with non-secret placeholders only:
- APP_ENV
- APP_NAME
- APP_SECRET_KEY=change-me
- API_V1_PREFIX
- DATABASE_URL
- POSTGRES_HOST
- POSTGRES_PORT
- POSTGRES_DB
- POSTGRES_USER
- POSTGRES_PASSWORD=change-me
- LOG_LEVEL
- FRONTEND_API_BASE_URL optional

.gitignore:
Ensure it excludes:
- .env
- .env.*
- but not .env.example
- .venv
- node_modules
- dist
- build
- coverage
- __pycache__
- .pytest_cache
- .ruff_cache
- .mypy_cache
- logs
- artifacts
- uploads
- storage
- *.db
- *.sqlite
- *.dump
- *.sql
- *.mdb
- *.accdb
- private keys

Pre-commit:
Add .pre-commit-config.yaml if safe:
- ruff check
- ruff format
- prettier check or format for frontend-supported files
- basic hooks for trailing whitespace/end-of-file
Do not make pre-commit required for normal scripts if it complicates Windows execution. Document installation separately.

README:
Update README with:
- project overview;
- architecture rules;
- local setup;
- backend setup;
- frontend setup;
- scripts table;
- checks;
- testing;
- CI;
- known non-goals.

PLANS.md:
Update Phase 0 / Phase 1A status:
- mark foundation tooling tasks completed only if actually completed;
- add known limitations;
- add next recommended phase.

Acceptance Criteria:
1. Repo has backend and frontend folder skeletons.
2. Backend dependencies are declared.
3. Frontend dependencies are declared.
4. Backend healthcheck test passes.
5. Frontend smoke test passes.
6. Frontend typecheck passes.
7. Frontend build passes.
8. Ruff check passes.
9. Ruff format check passes.
10. Mypy passes or has a documented minimal strictness baseline.
11. PowerShell scripts exist and run from repo root.
12. Project map docs exist.
13. CI workflow exists.
14. README and PLANS.md are updated.
15. No secrets, real personal data, MDB/ACCDB, dumps, .env, private keys are committed.
16. No hardcoded employee business model is introduced.
17. No business CRUD is implemented yet.

Expected final response from Codex:
- list of files created/changed;
- dependency summary;
- commands that were run;
- test/check results;
- remaining limitations;
- next recommended phase.

Before implementing, show the plan and wait for approval.