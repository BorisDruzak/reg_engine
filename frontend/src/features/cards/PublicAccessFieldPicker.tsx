import { useMemo } from "react";

import type { CardPublicAccessPayload, CardPublicAccessRead, FormFieldRead } from "@/api/types";

import { resolveCardPublicFieldAccess } from "./cardPublicAccessDefaults";
import { SearchableChoicePicker } from "./SearchableChoicePicker";

const NON_PUBLIC_EDITABLE_FIELD_TYPES = new Set(["file_ref", "static_text"]);

export function PublicAccessFieldPicker({
  fields,
  publicAccess,
  disabled = false,
  onChange,
}: {
  fields: readonly FormFieldRead[];
  publicAccess: CardPublicAccessRead | null;
  disabled?: boolean;
  onChange: (payload: CardPublicAccessPayload) => void;
}) {
  const activeFields = useMemo(() => fields.filter((field) => field.is_active), [fields]);
  const settingsByFieldId = useMemo(
    () => new Map(publicAccess?.fields.map((setting) => [setting.field_id, setting]) ?? []),
    [publicAccess?.fields],
  );
  const visibleIds = useMemo(
    () =>
      activeFields
        .filter(
          (field) =>
            resolveCardPublicFieldAccess(settingsByFieldId.get(field.id), field.field_type)
              .publicVisible,
        )
        .map((field) => field.id),
    [activeFields, settingsByFieldId],
  );
  const editableIds = useMemo(
    () =>
      activeFields
        .filter((field) => {
          const access = resolveCardPublicFieldAccess(
            settingsByFieldId.get(field.id),
            field.field_type,
          );
          return (
            access.publicVisible &&
            access.publicEditable &&
            !NON_PUBLIC_EDITABLE_FIELD_TYPES.has(field.field_type)
          );
        })
        .map((field) => field.id),
    [activeFields, settingsByFieldId],
  );
  const visibleOptions = useMemo(
    () => activeFields.map((field) => ({ id: field.id, label: field.label })),
    [activeFields],
  );
  const editableOptions = useMemo(
    () =>
      activeFields
        .filter(
          (field) =>
            visibleIds.includes(field.id) && !NON_PUBLIC_EDITABLE_FIELD_TYPES.has(field.field_type),
        )
        .map((field) => ({ id: field.id, label: field.label })),
    [activeFields, visibleIds],
  );

  function publish(visibleFieldIds: readonly string[], editableFieldIds: readonly string[]) {
    const visible = new Set(visibleFieldIds);
    const editable = new Set(editableFieldIds);
    onChange({
      fields: activeFields.map((field) => ({
        field_id: field.id,
        public_visible: visible.has(field.id),
        public_editable:
          visible.has(field.id) &&
          editable.has(field.id) &&
          !NON_PUBLIC_EDITABLE_FIELD_TYPES.has(field.field_type),
      })),
    });
  }

  return (
    <div className="public-access-field-picker">
      <div className="public-access-field-picker-control">
        <span>Показывать поля</span>
        <SearchableChoicePicker
          label="Показывать поля"
          hint="Нет выбранных полей"
          mode="multiple"
          options={visibleOptions}
          value={visibleIds}
          disabled={disabled}
          onChange={(nextValue) => {
            const nextVisible = Array.isArray(nextValue) ? nextValue : [];
            publish(
              nextVisible,
              editableIds.filter((id) => nextVisible.includes(id)),
            );
          }}
        />
      </div>
      <div className="public-access-field-picker-control">
        <span>Разрешить изменение</span>
        <SearchableChoicePicker
          label="Разрешить изменение"
          hint="Нет редактируемых полей"
          mode="multiple"
          options={editableOptions}
          value={editableIds}
          disabled={disabled}
          onChange={(nextValue) => publish(visibleIds, Array.isArray(nextValue) ? nextValue : [])}
        />
      </div>
    </div>
  );
}
