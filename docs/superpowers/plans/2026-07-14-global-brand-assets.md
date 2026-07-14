# Глобальные брендовые изображения Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Заменить знак приложения и добавить фиксированный глобальный фон на всех экранах Реестровой системы.

**Architecture:** PNG-файлы располагаются в `frontend/src/assets/branding` и импортируются в единый компонент `BrandMark`. Он заменяет декоративный CSS-знак во всех существующих брендовых блоках. Глобальные стили задают неподвижный фон `body`, а оболочки и панели получают полупрозрачную светлую поверхность для сохранения контраста.

**Tech Stack:** React, TypeScript, Vite asset imports, CSS.

## Global Constraints

- Использовать предоставленные пользователем `Логотип.png` и `Фон.png`, не изменяя исходные файлы.
- Фон применяется ко всем маршрутам, не повторяется, не прокручивается и покрывает окно с `background-size: cover`.
- Пользовательский интерфейс остаётся русскоязычным; у логотипа есть русский альтернативный текст.
- Не добавлять зависимости, миграции, API или настройки сервера.

---

### Task 1: Ресурсы и единый компонент логотипа

**Files:**
- Create: `frontend/src/assets/branding/registry-logo.png`
- Create: `frontend/src/assets/branding/registry-background.png`
- Create: `frontend/src/components/common/BrandMark.tsx`
- Modify: `frontend/src/pages/HomePage.tsx:352-358`
- Modify: `frontend/src/features/auth/LoginScreen.tsx:28-34`
- Modify: `frontend/src/pages/PublicCardCreationPage.tsx:37-42`
- Modify: `frontend/src/pages/PublicLinkEditPage.tsx:105-110`

**Interfaces:**
- Consumes: Vite static asset imports and existing `.brand-lockup` containers.
- Produces: `BrandMark(): JSX.Element`, rendering `registry-logo.png` with `alt="Логотип Реестровой системы"` and class `brand-mark-image`.

- [ ] **Step 1: Add a failing component test**

Create `frontend/src/components/common/BrandMark.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { BrandMark } from "./BrandMark";

test("renders the supplied registry logo with Russian alternative text", () => {
  render(<BrandMark />);
  expect(screen.getByRole("img", { name: "Логотип Реестровой системы" })).toHaveClass(
    "brand-mark-image",
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run src/components/common/BrandMark.test.tsx`

Expected: FAIL because `BrandMark` does not exist.

- [ ] **Step 3: Copy images and implement the component**

Run from the repository root:

```powershell
New-Item -ItemType Directory -Force frontend/src/assets/branding
Copy-Item 'C:/Users/admin-2/Downloads/Логотип.png' frontend/src/assets/branding/registry-logo.png
Copy-Item 'C:/Users/admin-2/Downloads/Фон.png' frontend/src/assets/branding/registry-background.png
```

Create `frontend/src/components/common/BrandMark.tsx`:

```tsx
import registryLogo from "@/assets/branding/registry-logo.png";

export function BrandMark() {
  return <img className="brand-mark-image" src={registryLogo} alt="Логотип Реестровой системы" />;
}
```

Replace every `<span className="brand-mark" aria-hidden="true" />` in the four
listed files with `<BrandMark />` and add the corresponding import.

- [ ] **Step 4: Run the component test**

Run: `pnpm exec vitest run src/components/common/BrandMark.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit the asset and component checkpoint**

```powershell
git add frontend/src/assets/branding frontend/src/components/common/BrandMark.tsx frontend/src/components/common/BrandMark.test.tsx frontend/src/pages/HomePage.tsx frontend/src/features/auth/LoginScreen.tsx frontend/src/pages/PublicCardCreationPage.tsx frontend/src/pages/PublicLinkEditPage.tsx
git commit -m "feat: add registry brand assets"
```

### Task 2: Фиксированный фон и читаемые поверхности

**Files:**
- Modify: `frontend/src/styles/globals.css:1-90`
- Test: `frontend/src/components/common/BrandMark.test.tsx`

**Interfaces:**
- Consumes: `registry-background.png`, `.login-shell`, `.workspace-shell`, `.login-panel`, `.data-panel`.
- Produces: fixed non-repeating background and semi-transparent white content surfaces.

- [ ] **Step 1: Extend the failing test with the background asset contract**

Add to `BrandMark.test.tsx`:

```tsx
import registryBackground from "@/assets/branding/registry-background.png";

test("bundles the supplied global background asset", () => {
  expect(registryBackground).toContain("registry-background");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run src/components/common/BrandMark.test.tsx`

Expected: FAIL until the background import is present.

- [ ] **Step 3: Implement the global visual contract**

Add the Vite background import in the global entry style or expose it through a
CSS URL supported by Vite, then use this CSS contract:

```css
body {
  min-width: 320px;
  min-height: 100vh;
  margin: 0;
  background:
    linear-gradient(rgba(248, 250, 252, 0.58), rgba(248, 250, 252, 0.58)),
    url("../assets/branding/registry-background.png") center / cover fixed no-repeat;
}

.brand-mark-image {
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  border-radius: 8px;
  object-fit: contain;
}

.login-shell,
.workspace-shell {
  background: transparent;
}
```

Use existing component-specific panel rules to retain white or near-white
surfaces; where a global shell currently paints `#f5f6f8`, replace only that
surface with transparent. Do not lower text contrast or change action colors.

- [ ] **Step 4: Run focused frontend checks**

Run:

```powershell
pnpm exec vitest run src/components/common/BrandMark.test.tsx
pnpm exec tsc --noEmit
pnpm exec eslint src/components/common/BrandMark.tsx src/components/common/BrandMark.test.tsx
pnpm exec prettier --check src/components/common/BrandMark.tsx src/components/common/BrandMark.test.tsx src/styles/globals.css
pnpm run build
```

Expected: PASS; Vite output includes hashed logo and background assets.

- [ ] **Step 5: Commit the visual styling checkpoint**

```powershell
git add frontend/src/styles/globals.css frontend/src/components/common/BrandMark.test.tsx
git commit -m "feat: apply fixed registry background"
```

### Task 3: Документация, выпуск и HTTPS-проверка

**Files:**
- Modify: `PLANS.md`

**Interfaces:**
- Consumes: existing `scripts/deploy.ps1` and `scripts/deploy-frontend.ps1` release workflow.
- Produces: deployed static assets through the same HTTPS origin.

- [ ] **Step 1: Record verification outcome**

Add a dated `Current Stop Point` entry to `PLANS.md` recording the two assets,
fixed full-viewport background behavior, focused checks, deployment result, and
any unrelated existing check limitation.

- [ ] **Step 2: Commit and push main**

```powershell
git add PLANS.md
git commit -m "docs: record brand asset release"
git push origin main
```

- [ ] **Step 3: Deploy code and frontend bundle**

```powershell
powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1
powershell -ExecutionPolicy Bypass -File scripts/deploy-frontend.ps1
```

Expected: server checks and same-origin frontend/API smoke check pass.

- [ ] **Step 4: Verify the released HTTPS page**

Open `https://regbase.sosnadmin.local/`, reload it, and confirm that the new
logo is visible, the background remains fixed while the page scrolls, and no
background tiles appear. Read the browser console for errors.
