# Логин пользователей и XLSX-обмен Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Разрешить обычные логины со специальными символами и сделать XLSX-обмен компактным с автоматически выбранным единственным шаблоном и всеми колонками по умолчанию.

**Architecture:** Техническое имя поля `email` и REST-контракт сохраняются, но сервис доступа нормализует его как логин. `ImportExportPanel` хранит единую конфигурацию XLSX; выбор колонок использует существующий `SearchableChoicePicker`, а нижние операции становятся взаимоисключающими вкладками.

**Tech Stack:** FastAPI, SQLAlchemy, React, TypeScript, TanStack Query, Vitest, Testing Library.

## Global Constraints

- Не менять схему базы данных и не выполнять миграцию.
- Сохранить REST-ключ `email` и действующие логины для обратной совместимости.
- Пользовательский текст остаётся русским; специальные символы в логине разрешены, пробельные символы запрещены.
- Экспорт и импорт используют одну конфигурацию шаблона, организаций и полей.

---

### Task 1: Нормализация логина на backend

**Files:**
- Modify: `backend/app/services/user_access.py:794-805`
- Modify: `backend/tests/test_access_management_phase_1j.py:217-267`

**Interfaces:**
- Consumes: `UserAccessService.update_user_for_actor(email: str | None)`.
- Produces: `_normalize_login(login: str) -> str`, используемый при создании и обновлении через существующий ключ `email`.

- [ ] **Step 1: Write the failing test**

Добавить в `test_system_admin_user_role_permission_and_grant_workflow`:
`patched_user = api_client.patch(f"/api/v1/users/{created_payload['id']}", json={"email": "unit_123-admin"}, headers=headers)`
`assert patched_user.status_code == 200`
`assert patched_user.json()["email"] == "unit_123-admin"`
`assert _auth_headers(api_client, "unit_123-admin", "created-pass")`

Добавить проверки `"unit 123" -> 400` и второго пользователя с `"UNIT_123-ADMIN" -> 409`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest backend/tests/test_access_management_phase_1j.py -k login -v`

Expected: FAIL, потому что `_normalize_email` требует `@`.

- [ ] **Step 3: Write minimal implementation**

Заменить `_normalize_email` и его вызовы при создании/обновлении:
`def _normalize_login(self, login: str) -> str:`
`    normalized = login.strip().lower()`
`    if not normalized or any(character.isspace() for character in normalized):`
`        raise UserAccessError("Valid login is required.")`
`    return normalized`

Проверку дубликатов сохранить через `func.lower(User.email)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest backend/tests/test_access_management_phase_1j.py -v`

Expected: PASS при `TEST_DATABASE_URL`; иначе только ожидаемый SKIP disposable PostgreSQL fixture.

- [ ] **Step 5: Commit**

Run: `git add backend/app/services/user_access.py backend/tests/test_access_management_phase_1j.py; git commit -m "fix: allow special-character logins"`

### Task 2: Автовыбор шаблона и поиск колонок XLSX

**Files:**
- Modify: `frontend/src/features/registry/ImportExportPanel.tsx:1-270`
- Modify: `frontend/src/features/registry/ImportExportPanel.test.tsx:1-150`

**Interfaces:**
- Consumes: `TabularCardExchangeOptionsRead.templates[].fields` и `SearchableChoicePicker` в `mode="multiple"`.
- Produces: эффективный `selectedTemplateId`, начальный набор всех supported field ids и текущий `field_ids` payload.

- [ ] **Step 1: Write the failing frontend test**

Проверить, что при одном шаблоне `getByLabelText("Шаблон карточки")` имеет value `template-1`, а кнопка `Колонки карточки` показывает поддерживаемое поле.

Открыть список, ввести `Фамилия` в `Поиск в списке`, снять единственную колонку и проверить, что `Скачать список` отключена.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C frontend vitest run src/features/registry/ImportExportPanel.test.tsx`

Expected: FAIL, потому что шаблон и поля первоначально пусты, а колонки — отдельные флажки.

- [ ] **Step 3: Write minimal implementation**

Добавить `effectiveTemplateId = templateId || (templates.length === 1 ? templates[0].id : "")`.

При первом появлении каждого effective template записывать в `fieldIds` все `field.id` с `supported === true`, не перезаписывая ручное снятие выбора.

Заменить `checkbox-list` компонентом `SearchableChoicePicker` с `label={uiText.tabularXlsxFields}`, `mode="multiple"`, `value={selectedFieldIds}` и `options` из `${field.block_title}: ${field.label}`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -C frontend vitest run src/features/registry/ImportExportPanel.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

Run: `git add frontend/src/features/registry/ImportExportPanel.tsx frontend/src/features/registry/ImportExportPanel.test.tsx; git commit -m "feat: streamline xlsx field selection"`

### Task 3: Компактные вкладки операций XLSX

**Files:**
- Modify: `frontend/src/features/registry/ImportExportPanel.tsx:270-360`
- Modify: `frontend/src/features/registry/ImportExportPanel.test.tsx:120-220`
- Modify: `frontend/src/styles/globals.css:4696-4734`

**Interfaces:**
- Consumes: общий `exportPayload`, `importPayload`, download, preview и commit mutations.
- Produces: локальное состояние `activeOperation: "export" | "import"` и русские доступные вкладки.

- [ ] **Step 1: Write the failing tab test**

Проверить `role="tab"` для `Экспорт` с `aria-selected="true"`; до переключения нет кнопки `Импортировать`.

Нажать `Импорт`, убедиться, что `Импортировать` есть, а `Скачать список` отсутствует.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C frontend vitest run src/features/registry/ImportExportPanel.test.tsx`

Expected: FAIL, потому что обе операции одновременно находятся в DOM.

- [ ] **Step 3: Write minimal implementation**

Добавить `activeOperation` с начальным значением `"export"` и `div.xlsx-operation-tabs` с `role="tablist"`.

Условно рендерить только выбранный `section.xlsx-operation`; не сбрасывать сообщения и mutation state при переключении.

Добавить `.xlsx-operation-tabs { display: flex; gap: 6px; }` и удалить grid-правило для двух одновременных operation sections.

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm -C frontend vitest run src/features/registry/ImportExportPanel.test.tsx; pnpm -C frontend typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

Run: `git add frontend/src/features/registry/ImportExportPanel.tsx frontend/src/features/registry/ImportExportPanel.test.tsx frontend/src/styles/globals.css; git commit -m "feat: split xlsx operations into tabs"`

### Task 4: Интеграционная проверка и выпуск

**Files:**
- Modify: `PLANS.md` (результат, команды и известные ограничения).

- [ ] **Step 1: Run targeted checks**

Run: `powershell -ExecutionPolicy Bypass -File scripts/test.ps1 -Frontend; pnpm -C frontend build`

Expected: целевые тесты и production build PASS.

- [ ] **Step 2: Run local quality gate**

Run: `powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote`

Expected: новые изменения не создают ошибок; существующие exact-metadata ожидания фиксируются отдельно.

- [ ] **Step 3: Deploy**

Run: `powershell -ExecutionPolicy Bypass -File scripts/push-git.ps1 -Message "feat: streamline login and xlsx workflows"; powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1; powershell -ExecutionPolicy Bypass -File scripts/deploy-frontend.ps1`

Expected: сервер на `main`, Nginx HTTPS reverse proxy сохраняет same-origin API доступ.

- [ ] **Step 4: Verify in HTTPS browser**

Flow: `https://regbase.sosnadmin.local/` -> Пользователи -> изменить логин без `@` -> Сохранить -> успех; Реестры -> Импорт и экспорт -> один выбранный шаблон, все выбранные колонки и переключение `Экспорт`/`Импорт`.

- [ ] **Step 5: Update PLANS.md and commit**

Run: `git add PLANS.md; git commit -m "docs: record login and xlsx workflow release"`
