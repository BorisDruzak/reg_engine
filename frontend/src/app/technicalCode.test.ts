import { describe, expect, test } from "vitest";

import { generateTechnicalCode } from "./technicalCode";

describe("generateTechnicalCode", () => {
  test("transliterates Russian names into stable technical codes", () => {
    expect(generateTechnicalCode("Главная организация", "org")).toBe("glavnaya_organizatsiya");
    expect(generateTechnicalCode("Отчет по карточкам", "report")).toBe("otchet_po_kartochkam");
  });

  test("uses prefix fallback and prefixes digit-leading codes", () => {
    expect(generateTechnicalCode("   ", "field")).toBe("field");
    expect(generateTechnicalCode("2026 отчет", "report")).toBe("report_2026_otchet");
  });

  test("appends a suffix when generated code already exists", () => {
    expect(
      generateTechnicalCode("Главная организация", "org", [
        "root",
        "glavnaya_organizatsiya",
        "glavnaya_organizatsiya_2",
      ]),
    ).toBe("glavnaya_organizatsiya_3");
  });
});
