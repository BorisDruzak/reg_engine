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
  test("uses Russian XLSX creation mode labels", () => {
    expect(uiText.tabularXlsxImportMode).toBe(
      "\u0420\u0435\u0436\u0438\u043c \u0441\u043e\u0437\u0434\u0430\u043d\u0438\u044f \u043a\u0430\u0440\u0442\u043e\u0447\u0435\u043a",
    );
    expect(uiText.tabularXlsxImportModeStrict).toBe(
      "\u0421\u0442\u0440\u043e\u0433\u043e\u0435 \u0441\u043e\u0437\u0434\u0430\u043d\u0438\u0435 \u043a\u0430\u0440\u0442\u043e\u0447\u0435\u043a",
    );
    expect(uiText.tabularXlsxImportModeEnrich).toBe(
      "\u0421\u043e\u0437\u0434\u0430\u043d\u0438\u0435 \u0441 \u043f\u043e\u043f\u043e\u043b\u043d\u0435\u043d\u0438\u0435\u043c \u0433\u043b\u043e\u0431\u0430\u043b\u044c\u043d\u044b\u0445 \u0441\u043f\u0440\u0430\u0432\u043e\u0447\u043d\u0438\u043a\u043e\u0432",
    );
  });
});
