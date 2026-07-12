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
      "Аудит",
    ]);
  });

  test("does not expose unknown English API errors as UI text", () => {
    expect(apiErrorMessageLabel("Unexpected service failure.")).toBe("Запрос не выполнен");
    expect(runtimeErrorMessageLabel("Unexpected local failure.")).toBe("Запрос не выполнен");
    expect(runtimeErrorMessageLabel(uiText.jsonObjectRequired)).toBe(uiText.jsonObjectRequired);
  });

  test("shows safe XLSX validation details instead of the generic fallback", () => {
    expect(apiErrorMessageLabel("Выберите хотя бы одну организацию для XLSX.")).toBe(
      "Выберите хотя бы одну организацию для XLSX.",
    );
    expect(apiErrorMessageLabel("Поле «Ссылка» нельзя использовать в табличном XLSX.")).toBe(
      "Поле «Ссылка» нельзя использовать в табличном XLSX.",
    );
  });

  test("explains known invalid reference field values in Russian", () => {
    expect(apiErrorMessageLabel("card_ref fields require a UUID string.")).toBe(
      "Ссылочное поле должно содержать выбранный объект или быть пустым.",
    );
  });

  test("maps public link review lifecycle errors to safe Russian messages", () => {
    expect(apiErrorMessageLabel("Недопустимый переход состояния публичной ссылки.")).toBe(
      uiText.publicLinkInvalidTransition,
    );
    expect(apiErrorMessageLabel("Срок действия публичной ссылки истёк.")).toBe(
      uiText.publicLinkExpired,
    );
    expect(
      apiErrorMessageLabel(
        "Карточка уже отправлена на проверку. Редактирование временно недоступно.",
      ),
    ).toBe(uiText.publicLinkSubmittedReadOnly);
    expect(apiErrorMessageLabel("Недостаточно прав для проверки этой публичной ссылки.")).toBe(
      uiText.publicLinkReviewForbidden,
    );
    expect(apiErrorMessageLabel("Недостаточно прав для выполнения операции.")).toBe(
      uiText.actionDenied,
    );
  });

  test("localizes known built-in user display names", () => {
    expect(userDisplayNameLabel("System Admin")).toBe("Системный администратор");
    expect(userDisplayNameLabel("Пользователь")).toBe("Пользователь");
  });
});
