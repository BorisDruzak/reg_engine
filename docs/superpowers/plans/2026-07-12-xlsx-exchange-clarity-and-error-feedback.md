# XLSX Exchange Clarity and Error Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax.

**Goal:** Separate card XLSX export and import visually and surface safe XLSX
validation errors in Russian.

**Architecture:** Keep one shared React configuration state for template,
organisation, and field selection. Split only the operation controls into
separate components/sections. Extend the existing safe client error mapper
without exposing unknown backend details.

**Tech Stack:** React, TypeScript, TanStack Query, Vitest, Testing Library.

## Global Constraints

- UI copy is Russian-first.
- Backend remains the authorization boundary.
- Unsupported reference fields are explanatory only and are never sent in XLSX
  payloads.
- Unknown API errors remain generic; no internal details are rendered.
- No database migration and no production card creation for QA.

---

### Task 1: Preserve safe XLSX validation details

**Files:**

- Modify: frontend/src/app/uiText.ts
- Modify: frontend/src/features/registry/ImportExportPanel.test.tsx

**Interfaces:**

- Consumes apiErrorMessageLabel(message: string): string.
- Produces user-safe Russian output for XLSX validation details and keeps the
  generic output for unknown errors.

- [ ] **Step 1: Write the failing test**

~~~
test("shows a safe XLSX API validation detail instead of the generic fallback", () => {
  expect(apiErrorMessageLabel("Выберите хотя бы одну организацию для XLSX.")).toBe(
    "Выберите хотя бы одну организацию для XLSX.",
  );
});
~~~

- [ ] **Step 2: Verify RED**

Run: pnpm -C frontend test:run src/app/uiText.test.ts

Expected: the assertion fails because the current mapper returns
Запрос не выполнен.

- [ ] **Step 3: Implement the minimal safe allowlist**

~~~
if (
  message.startsWith("Выберите хотя бы ") ||
  message.startsWith("Заголовки XLSX") ||
  message.startsWith("XLSX-шаблон") ||
  message.startsWith("Превышен лимит строк XLSX")
) {
  return message;
}
~~~

Use exact prefixes only for existing Russian ImportExportServiceError messages.
Do not pass unknown messages through.

- [ ] **Step 4: Verify GREEN**

Run: pnpm -C frontend test:run src/app/uiText.test.ts

Expected: PASS.

### Task 2: Separate export and import operations

**Files:**

- Modify: frontend/src/features/registry/ImportExportPanel.tsx
- Modify: frontend/src/features/registry/ImportExportPanel.test.tsx
- Modify: frontend/src/app/uiText.ts

**Interfaces:**

- Consumes the existing TabularCardWorkbookPayload and download/preview/commit
  client functions.
- Produces shared Параметры XLSX, Экспорт карточек, and Импорт карточек
  sections.

- [ ] **Step 1: Write the failing UI test**

~~~
expect(await screen.findByRole("heading", { name: "Экспорт карточек" })).toBeInTheDocument();
expect(screen.getByRole("heading", { name: "Импорт карточек" })).toBeInTheDocument();
expect(
  screen.getByRole("button", { name: "Скачать список" }).closest("section"),
).not.toContainElement(screen.getByRole("button", { name: "Импортировать" }));
~~~

- [ ] **Step 2: Verify RED**

Run: pnpm -C frontend test:run src/features/registry/ImportExportPanel.test.tsx

Expected: FAIL because the current panel has one undivided XLSX section.

- [ ] **Step 3: Implement minimal separated sections**

~~~
<section aria-labelledby="xlsx-export-heading">
  <h4 id="xlsx-export-heading">{uiText.xlsxExportTitle}</h4>
  <button onClick={() => downloadMutation.mutate("list")}>{uiText.downloadCardList}</button>
</section>
<section aria-labelledby="xlsx-import-heading">
  <h4 id="xlsx-import-heading">{uiText.xlsxImportTitle}</h4>
  <button onClick={() => downloadMutation.mutate("template")}>
    {uiText.downloadImportTemplate}
  </button>
  {/* picker, preview, and commit controls */}
</section>
~~~

Keep the shared configuration above both sections. Move the current download
template action, picker, preview, results, and commit controls into the import
section without changing mutation behavior.

- [ ] **Step 4: Verify GREEN**

Run: pnpm -C frontend test:run src/features/registry/ImportExportPanel.test.tsx

Expected: PASS.

### Task 3: Validate and document

**Files:**

- Modify: PLANS.md
- Modify: docs/PROJECT_TREE.md

- [ ] **Step 1: Run focused checks**

~~~
pnpm -C frontend test:run src/app/uiText.test.ts src/features/registry/ImportExportPanel.test.tsx
pnpm -C frontend typecheck
pnpm -C frontend exec prettier --check src/app/uiText.ts src/features/registry/ImportExportPanel.tsx src/features/registry/ImportExportPanel.test.tsx
pnpm -C frontend build
powershell -ExecutionPolicy Bypass -File scripts/project-map.ps1
~~~

Expected: all commands pass.

- [ ] **Step 2: Browser QA**

Use the in-app Browser at http://192.168.100.12:8000/. Confirm the separate
section headings, no framework overlay, relevant console health, desktop and
mobile layout, and one non-mutating validation/error interaction. Do not create
or import production cards.

- [ ] **Step 3: Commit and deploy**

~~~
git add frontend/src/app/uiText.ts frontend/src/features/registry/ImportExportPanel.tsx frontend/src/features/registry/ImportExportPanel.test.tsx PLANS.md docs/PROJECT_TREE.md
git commit -m "fix: clarify XLSX exchange workflow"
git push origin main
powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1
powershell -ExecutionPolicy Bypass -File scripts/deploy-frontend.ps1 -SkipBuild
~~~

## Execution update

- The server log identified an additional root cause: Cyrillic values in
  X-Document-Filename caused Starlette to raise UnicodeEncodeError while
  building the response header.
- The implementation adds xlsx_download_headers(filename) in the import/export
  endpoint module. It supplies ASCII X-Document-Filename and
  Content-Disposition values for the export and import-template responses.
- The test suite now includes a Response construction regression test for the
  generated headers. The XLSX service unit suite passes four tests, and the
  focused frontend suites pass ten tests.
