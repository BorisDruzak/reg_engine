# Inline card-template name edit — implementation report

Date: 2026-07-14

## Scope

Implemented the approved inline rename flow for an opened card template only.
The change is limited to the registry schema editor, its focused regression
suite, and the active plan.

## Behavior

- The opened template header renders the current name as a button.
- Activating it replaces that button with an inline Russian form labelled
  `Название шаблона карточки`, with `Сохранить` and `Отменить` actions.
- Save trims the draft and rejects an empty name with
  `Заполните обязательные поля`.
- A successful save calls `updateCardTemplate(token, templateId, { name })`,
  clears the draft, shows the existing success feedback, and invalidates the
  registry caches.
- Cancel restores the name button without sending a PATCH request.
- The existing soft-archive action and the layout studio remain unchanged.

## TDD evidence

Added focused tests before production changes for:

1. Rename request with exactly `{ name: "Переименованный шаблон" }`.
2. Cancel without a PATCH request.
3. Empty-name validation without a PATCH request.

RED command:

```text
pnpm --dir frontend test:run CardPrintTemplateEditor.test.tsx
```

The new tests initially failed because the selected template name was an
`h3`, not an interactive button or form.

## Verification

- `pnpm --dir frontend test:run CardPrintTemplateEditor.test.tsx` — passed,
  32 tests.
- `pnpm --dir frontend typecheck` — passed.
- `pnpm --dir frontend lint` — completed with no errors; retains the unrelated
  existing `FilledCardLayout.tsx` hook-dependency warning.
- `pnpm --dir frontend build` — passed; retains the existing Vite chunk-size
  advisory.
- `git diff --check` — passed.

## Release status

No deployment, browser proof, migration, push, or production data change was
performed for this isolated frontend task.
