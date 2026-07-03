import { describe, expect, test } from "vitest";

import { coerceEditorValue } from "./fieldEditorUtils";

describe("fieldEditorUtils", () => {
  test("converts empty optional single-reference values to null", () => {
    for (const fieldType of [
      "select",
      "card_ref",
      "user_ref",
      "organization_ref",
      "org_unit_ref",
      "registry_ref",
    ]) {
      expect(coerceEditorValue(fieldType, "")).toBeNull();
      expect(coerceEditorValue(fieldType, "   ")).toBeNull();
    }
  });
});
