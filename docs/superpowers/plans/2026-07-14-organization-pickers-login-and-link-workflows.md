# Организации, логины и ссылки — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Сделать выбор организаций компактным и иерархическим, убрать из UI понятие e-mail, а сценарии ссылок и XLSX — однозначными.

**Architecture:** Общий React-компонент получает дерево доступных организаций и отдаёт выбранные UUID. Пользовательский профиль включает наследование дочерних организаций, XLSX — только явные отметки. Технический API-ключ `email` сохраняется для обратной совместимости, но пользовательский интерфейс называет его «Логин».

**Tech Stack:** React, TypeScript, TanStack Query, Vitest, FastAPI, SQLAlchemy, pytest.

## Global Constraints

- UI Russian-first; технический API-ключ не показывается пользователю.
- RBAC проверяется только backend-ом.
- Специальные символы существующих логинов остаются допустимыми.
- Работа ведётся на `main` без изменения несвязанных файлов.

---

### Task 1: Отображать идентификатор пользователя как логин

**Files:**
- Modify: `frontend/src/features/auth/LoginScreen.tsx`
- Modify: `frontend/src/features/users/UsersAndRoles.tsx`
- Modify: `frontend/src/features/access/AccessGrantsTable.tsx`
- Modify: `frontend/src/features/overview/Overview.tsx`
- Modify: `frontend/src/pages/HomePage.tsx`
- Modify: `frontend/src/ui/text.ts`
- Modify: `backend/app/services/auth.py`
- Modify: `backend/app/services/user_access.py`
- Test: `frontend/src/App.test.tsx`
- Test: `frontend/src/features/users/UsersAndRoles.test.tsx`
- Test: `backend/tests/test_auth_phase_1i.py`
- Test: `backend/tests/test_access_management_phase_1j.py`

**Interfaces:** Keeps `login(email, password)` and `UserRead.email` compatible; emits `Логин` labels and `type="text"` controls.

- [ ] Write RED tests:

```tsx
expect(screen.getByLabelText("Логин")).toHaveAttribute("type", "text");
expect(screen.queryByText("Электронная почта пользователя")).not.toBeInTheDocument();
```

```python
assert client.post("/api/v1/auth/login", json={"email": "admin+test@local", "password": "secret-pass"}).status_code == 200
```

- [ ] Run `pnpm -C frontend exec vitest run src/App.test.tsx src/features/users/UsersAndRoles.test.tsx` and `pytest backend/tests/test_auth_phase_1i.py backend/tests/test_access_management_phase_1j.py -q`; verify RED only for the unimplemented visible labels.
- [ ] Replace visible text/type and service error wording; preserve JSON/database names, trimming, special characters, and case-insensitive uniqueness.
- [ ] Re-run the same commands; verify GREEN; commit `feat: present user identity as login`.

### Task 2: Создать общий иерархический мультивыбор организаций

**Files:**
- Create: `frontend/src/components/OrganizationMultiSelect.tsx`
- Create: `frontend/src/components/OrganizationMultiSelect.test.tsx`
- Modify: `frontend/src/styles.css`
- Modify: `frontend/src/features/users/UsersAndRoles.tsx`
- Modify: `frontend/src/features/registry/ImportExportPanel.tsx`

**Interfaces:** `OrganizationMultiSelect({ nodes, selectedIds, onChange, inheritDescendants })` receives `OrganizationTreeNodeRead[]` and returns selected ids.

- [ ] Write RED tests for button opening, `Поиск организаций`, filtering with ancestor context, multiple checkbox selection, clear action, Escape closing, and disabled inherited child selection.
- [ ] Run `pnpm -C frontend exec vitest run src/components/OrganizationMultiSelect.test.tsx`; expect missing-component failure.
- [ ] Implement summary button, tags, search, tree checkbox rows, outside/Escape close, and ARIA. Render it with `inheritDescendants` in Users and without inheritance in XLSX.
- [ ] Run `pnpm -C frontend exec vitest run src/components/OrganizationMultiSelect.test.tsx src/features/users/UsersAndRoles.test.tsx src/features/registry/ImportExportPanel.test.tsx`; verify GREEN; commit `feat: add hierarchical organization multi-select`.

### Task 3: Сделать XLSX организацию схемным параметром

**Files:**
- Modify: `frontend/src/features/registry/ImportExportPanel.tsx`
- Modify: `frontend/src/features/registry/ImportExportPanel.test.tsx`
- Modify: `frontend/src/api/types.ts`
- Modify: `backend/app/schemas/import_export.py`
- Modify: `backend/app/api/v1/endpoints/import_export.py`
- Modify: `backend/app/services/import_export.py`
- Test: `backend/tests/test_tabular_xlsx_exchange.py`
- Test: `backend/tests/test_api_phase_3_import_export.py`

**Interfaces:** selected template + organization ids determine column behavior; `include_organization_column` is not a user-control API parameter.

- [ ] Write RED tests that `Скрывать колонку «Организация»` is absent and that an ambiguous multi-organization import without a template organization field returns Russian validation without creating cards.
- [ ] Run `pnpm -C frontend exec vitest run src/features/registry/ImportExportPanel.test.tsx` and `pytest backend/tests/test_tabular_xlsx_exchange.py backend/tests/test_api_phase_3_import_export.py -q`; verify RED.
- [ ] Remove the boolean state/control/request property. Derive fixed versus multi-organization behavior from template fields; retain a fixed organization fallback and reject ambiguity before writes.
- [ ] Re-run the same tests; verify GREEN; commit `feat: derive XLSX organization columns from schema`.

### Task 4: Объединить вкладки ссылок на заполнение

**Files:**
- Modify: `frontend/src/features/cards/CardsWorkspace.tsx`
- Modify: `frontend/src/features/cards/CardCreationLinksPanel.tsx`
- Test: `frontend/src/features/cards/CardCreationLinksPanel.test.tsx`
- Test: `frontend/src/App.test.tsx`

**Interfaces:** substitutes `CardUtilityTab = "creation-links"`; existing create/list calls, statuses, and public URLs stay unchanged.

- [ ] Write RED test for one `Ссылки на заполнение` tab and absence of the old two names.
- [ ] Run `pnpm -C frontend exec vitest run src/features/cards/CardCreationLinksPanel.test.tsx src/App.test.tsx`; verify RED.
- [ ] Render creation form first and existing list/closure controls below it in one panel; remove only split navigation state.
- [ ] Re-run focused tests; verify GREEN; commit `feat: combine card creation link tabs`.

### Task 5: Проверка и выпуск

**Files:**
- Modify: `PLANS.md`
- Modify: `docs/superpowers/specs/2026-07-14-organization-pickers-login-and-link-workflows-design.md`
- Modify: `docs/superpowers/plans/2026-07-14-organization-pickers-login-and-link-workflows.md`

- [ ] Run `powershell -ExecutionPolicy Bypass -File scripts/test.ps1`, `scripts/lint.ps1`, `scripts/typecheck.ps1`, `pnpm -C frontend build`, and `git diff --check`; record exact results.
- [ ] Push verified `main` with `scripts/push-git.ps1`, run `scripts/deploy.ps1` and `scripts/deploy-frontend.ps1`.
- [ ] Browser-check: searchable hierarchical XLSX picker; old XLSX checkbox absent; users show `Логин`; user access picker is hierarchical; one card-links tab contains both creation and list.
