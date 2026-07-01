import { describe, expect, test } from "vitest";

import { apiErrorMessageLabel, uiText, userDisplayNameLabel, visibleSections } from "./uiText";

describe("uiText unicode regression", () => {
  test("keeps Russian labels as real Cyrillic", () => {
    expect(uiText.productName).toBe("Реестровая система");
    expect(visibleSections.map((section) => section.label)).toEqual([
      "Обзор",
      "Организации",
      "Реестры",
      "Карточки",
      "Пользователи",
      "Доступ",
      "Аудит",
    ]);
    expect(userDisplayNameLabel("System Admin")).toBe("Системный администратор");
  });

  test("maps duplicate code API details to specific Russian messages", () => {
    expect(apiErrorMessageLabel("Organization code already exists.")).toBe(
      "Организация с таким кодом уже существует.",
    );
    expect(apiErrorMessageLabel("Registry code already exists.")).toBe(
      "Реестр с таким кодом уже существует.",
    );
  });
});
