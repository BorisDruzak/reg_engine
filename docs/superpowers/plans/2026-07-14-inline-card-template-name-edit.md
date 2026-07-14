# Inline-редактирование названия шаблона карточки: план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Разрешить переименование раскрытого шаблона карточки кликом по его названию.

**Architecture:** `SchemaVisualEditor` добавляет локальное состояние черновика имени и использует существующий `updateCardTemplate` API-клиент. Список шаблонов продолжает только открывать редактор; встроенная форма показывается только в раскрытом редакторе и после успешного PATCH инвалидирует существующий кэш реестра.

**Tech Stack:** React, TypeScript, TanStack Query, Vitest, Testing Library.

## Global Constraints

- Пользовательский интерфейс, ошибки и действия — русскоязычные.
- Не добавлять новые API-маршруты, миграции, таблицы или физическое удаление.
- Клик по названию доступен только в раскрытом шаблоне; не добавлять отдельную кнопку редактирования.
- PATCH изменяет только `name`; технический код, поля, блоки, макет, статус и архивирование неизменны.
- Архивирование сохраняет текущий подтверждённый soft-archive путь.

---

### Task 1: Встроенное переименование выбранного шаблона

**Files:**
- Modify: `frontend/src/features/registry/RegistriesAndSchema.tsx:1-700`
- Modify: `frontend/src/features/registry/CardPrintTemplateEditor.test.tsx:840-870, 914-1050`
- Modify: `PLANS.md`

**Interfaces:**
- Consumes `updateCardTemplate(token, templateId, { name })` from `@/api/client`.
- Consumes the selected `CardTemplateRead` from `SchemaVisualEditor`.
- Produces a selected-template header that toggles between a name button and a `form` with `input`, `Сохранить`, and `Отменить`.

- [x] **Step 1: Write failing interaction tests**

Add two tests beside `opens the contextual studio directly from the selected template`:

```tsx
test("renames an opened template inline through the existing PATCH endpoint", async () => {
  const user = userEvent.setup();
  const api = createEditorFetchMock();
  vi.stubGlobal("fetch", api.fetchMock);
  renderRegistrySchemaEditor();

  await user.click(await screen.findByRole("button", { name: "Шаблон карточки Базовый шаблон" }));
  await user.click(screen.getByRole("button", { name: "Базовый шаблон" }));
  const input = screen.getByLabelText("Название шаблона карточки");
  await user.clear(input);
  await user.type(input, "Переименованный шаблон");
  await user.click(screen.getByRole("button", { name: "Сохранить" }));

  await waitFor(() =>
    expect(api.templateUpdatePayloads).toContainEqual({ name: "Переименованный шаблон" }),
  );
});

test("cancels inline template rename without PATCH", async () => {
  // Open the same template, enter the title edit state, change the value,
  // click `Отменить`, then assert templateUpdatePayloads is empty and the
  // name button remains visible.
});
```

- [x] **Step 2: Run the focused test to verify RED**

Run:

```powershell
pnpm --dir frontend test:run CardPrintTemplateEditor.test.tsx
```

Expected result: the new interaction fails because the selected template header has no clickable name editor.

- [x] **Step 3: Implement the minimal inline editor**

In `SchemaVisualEditor`:

```tsx
const [templateNameDraft, setTemplateNameDraft] = useState<string | null>(null);
const updateTemplateMutation = useMutation({
  mutationFn: ({ templateId, name }: { templateId: string; name: string }) =>
    updateCardTemplate(token, templateId, { name }),
  onSuccess: async () => {
    setTemplateNameDraft(null);
    setSuccessMessage(uiText.cardTemplateUpdated);
    await invalidateRegistryData(queryClient, token);
  },
});
```

Render the selected template title as a button while `templateNameDraft === null`. Its click starts the draft. Otherwise render a form with a labelled input, `Сохранить`, and `Отменить`; trim and reject an empty value with `uiText.requiredFields`. Stop propagation only where necessary so these controls do not close or reopen the selected template. Include the update mutation in the displayed mutation error and submitting state.

- [x] **Step 4: Verify GREEN and focused quality gates**

Run:

```powershell
pnpm --dir frontend test:run CardPrintTemplateEditor.test.tsx
pnpm --dir frontend typecheck
pnpm --dir frontend lint
pnpm --dir frontend build
```

Expected result: the new PATCH and cancel tests pass, TypeScript/build pass, and lint has no new errors.

- [x] **Step 5: Record and commit**

Update the relevant status in `PLANS.md`, run `git diff --check`, and commit only the task files with:

```text
feat: edit template name inline
```
