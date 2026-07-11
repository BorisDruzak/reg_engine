import type { CardPublicFieldSettingRead } from "@/api/types";

const NON_PUBLIC_EDITABLE_FIELD_TYPES = new Set(["file_ref", "static_text"]);

export function resolveCardPublicFieldAccess(
  setting: CardPublicFieldSettingRead | undefined,
  fieldType: string,
) {
  const publicEditableByDefault = !NON_PUBLIC_EDITABLE_FIELD_TYPES.has(fieldType);

  return {
    publicVisible: setting?.public_visible ?? true,
    publicEditable: setting?.public_editable ?? publicEditableByDefault,
  };
}
