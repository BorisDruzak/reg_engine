import { describe, expect, test } from "vitest";

import {
  apiErrorMessageLabel,
  runtimeErrorMessageLabel,
  uiText,
  userDisplayNameLabel,
  visibleSections,
} from "./uiText";

describe("uiText", () => {
  test("uses Russian product and navigation labels", () => {
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
  });

  test("does not expose unknown English API errors as UI text", () => {
    expect(apiErrorMessageLabel("Unexpected service failure.")).toBe("Запрос не выполнен");
    expect(runtimeErrorMessageLabel("Unexpected local failure.")).toBe("Запрос не выполнен");
    expect(runtimeErrorMessageLabel(uiText.jsonObjectRequired)).toBe(uiText.jsonObjectRequired);
  });

  test("localizes known built-in user display names", () => {
    expect(userDisplayNameLabel("System Admin")).toBe("Системный администратор");
    expect(userDisplayNameLabel("Пользователь")).toBe("Пользователь");
  });
});
