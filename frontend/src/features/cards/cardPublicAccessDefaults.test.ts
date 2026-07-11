import { describe, expect, test } from "vitest";

import { resolveCardPublicFieldAccess } from "./cardPublicAccessDefaults";

describe("resolveCardPublicFieldAccess", () => {
  test("uses public defaults when a card has no individual field override", () => {
    expect(resolveCardPublicFieldAccess(undefined, "text")).toEqual({
      publicVisible: true,
      publicEditable: true,
    });
  });

  test("keeps non-editable field types visible but protected", () => {
    expect(resolveCardPublicFieldAccess(undefined, "file_ref")).toEqual({
      publicVisible: true,
      publicEditable: false,
    });
    expect(resolveCardPublicFieldAccess(undefined, "static_text")).toEqual({
      publicVisible: true,
      publicEditable: false,
    });
  });

  test("preserves an explicit card-level override", () => {
    expect(
      resolveCardPublicFieldAccess(
        { field_id: "field-1", public_visible: false, public_editable: false },
        "text",
      ),
    ).toEqual({ publicVisible: false, publicEditable: false });
  });
});
