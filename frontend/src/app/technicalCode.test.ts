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

  test("reserves space for a unique suffix after transliteration and length truncation", () => {
    const name = "щ".repeat(40);
    const first = "shch".repeat(25);
    const second = `${first.slice(0, 98)}_2`;
    expect(generateTechnicalCode(name, "export", [], 100)).toBe(first);
    expect(generateTechnicalCode(name, "export", [first, second], 100)).toBe(
      `${first.slice(0, 98)}_3`,
    );
  });
});
