import { useCallback, useMemo, useState } from "react";

import type {
  FieldValueBulkItemUpdatePayload,
  FieldValuesBulkUpdatePayload,
  FormFieldRead,
} from "@/api/types";
import { runtimeErrorMessageLabel, uiText } from "@/app/uiText";

import { coerceEditorValue, initialEditorValue, type FieldEditorState } from "./fieldEditorUtils";

export type BlockEditorKey = `${string}:${string | "primary"}`;

export type BlockEditorTarget = {
  blockId: string;
  blockInstanceId: string | null;
};

export type BlockEditorState = {
  key: BlockEditorKey | null;
  target: BlockEditorTarget | null;
  values: Record<string, FieldEditorState>;
  dirty: boolean;
  pending: boolean;
  errors: Record<string, string>;
  confirmClose: boolean;
  open: (blockId: string, blockInstanceId: string | null, initial: Record<string, unknown>) => void;
  update: (fieldId: string, value: FieldEditorState) => void;
  save: () => Promise<boolean>;
  cancel: () => void;
  requestClose: () => "closed" | "confirm-discard";
  discard: () => void;
  continueEditing: () => void;
};

export type UseBlockEditorOptions = {
  fields: FormFieldRead[];
  editableFieldIds: ReadonlySet<string>;
  saveValues: (payload: FieldValuesBulkUpdatePayload) => Promise<unknown>;
};

type BlockEditorSession = {
  key: BlockEditorKey;
  target: BlockEditorTarget;
  initialValues: Record<string, FieldEditorState>;
  values: Record<string, FieldEditorState>;
  dirty: boolean;
  pending: boolean;
  errors: Record<string, string>;
  confirmClose: boolean;
  pendingOpen: BlockEditorSession | null;
};

const emptyValues: Record<string, FieldEditorState> = {};
const emptyErrors: Record<string, string> = {};

export function useBlockEditor({
  fields,
  editableFieldIds,
  saveValues,
}: UseBlockEditorOptions): BlockEditorState {
  const fieldsById = useMemo(() => new Map(fields.map((field) => [field.id, field])), [fields]);
  const [session, setSession] = useState<BlockEditorSession | null>(null);

  const open = useCallback(
    (blockId: string, blockInstanceId: string | null, initial: Record<string, unknown>) => {
      const nextSession = createSession(
        { blockId, blockInstanceId },
        initial,
        fieldsById,
        editableFieldIds,
      );
      setSession((current) => {
        if (!current || !current.dirty) return nextSession;
        if (current.key === nextSession.key) return current;
        return { ...current, confirmClose: true, pendingOpen: nextSession };
      });
    },
    [editableFieldIds, fieldsById],
  );

  const update = useCallback((fieldId: string, value: FieldEditorState) => {
    setSession((current) => {
      if (!current || current.pending || !(fieldId in current.values)) return current;
      const values = { ...current.values, [fieldId]: value };
      const errors = { ...current.errors };
      delete errors[fieldId];
      delete errors._form;
      return {
        ...current,
        values,
        errors,
        dirty: isDirty(current.initialValues, values),
      };
    });
  }, []);

  const save = useCallback(async () => {
    if (!session || session.pending) return false;

    const validationErrors: Record<string, string> = {};
    const changedValues: FieldValueBulkItemUpdatePayload[] = [];
    for (const [fieldId, editorValue] of Object.entries(session.values)) {
      const field = fieldsById.get(fieldId);
      if (!field || !isOrdinaryEditableField(field, editableFieldIds)) continue;
      if (field.required_mode === "required" && isEmptyEditorValue(editorValue)) {
        validationErrors[fieldId] = uiText.requiredFields;
        continue;
      }
      if (sameEditorValue(editorValue, session.initialValues[fieldId])) continue;
      try {
        changedValues.push({
          field_id: fieldId,
          value: coerceEditorValue(field.field_type, editorValue),
          block_instance_id: session.target.blockInstanceId,
        });
      } catch (error) {
        validationErrors[fieldId] = runtimeError(error);
      }
    }

    if (Object.keys(validationErrors).length > 0) {
      setSession((current) =>
        current?.key === session.key
          ? { ...current, pending: false, errors: validationErrors }
          : current,
      );
      return false;
    }

    if (changedValues.length === 0) {
      setSession((current) =>
        current?.key === session.key ? (current.pendingOpen ?? null) : current,
      );
      return true;
    }

    setSession((current) =>
      current?.key === session.key ? { ...current, pending: true, errors: {} } : current,
    );
    try {
      await saveValues({ values: changedValues });
      setSession((current) =>
        current?.key === session.key ? (current.pendingOpen ?? null) : current,
      );
      return true;
    } catch (error) {
      setSession((current) =>
        current?.key === session.key
          ? { ...current, pending: false, errors: { _form: runtimeError(error) } }
          : current,
      );
      return false;
    }
  }, [editableFieldIds, fieldsById, saveValues, session]);

  const cancel = useCallback(() => setSession(null), []);

  const requestClose = useCallback(() => {
    if (!session) return "closed" as const;
    if (!session.dirty) {
      setSession(null);
      return "closed" as const;
    }
    setSession((current) =>
      current ? { ...current, confirmClose: true, pendingOpen: null } : current,
    );
    return "confirm-discard" as const;
  }, [session]);

  const discard = useCallback(() => {
    setSession((current) => current?.pendingOpen ?? null);
  }, []);

  const continueEditing = useCallback(() => {
    setSession((current) =>
      current ? { ...current, confirmClose: false, pendingOpen: null } : current,
    );
  }, []);

  return {
    key: session?.key ?? null,
    target: session?.target ?? null,
    values: session?.values ?? emptyValues,
    dirty: session?.dirty ?? false,
    pending: session?.pending ?? false,
    errors: session?.errors ?? emptyErrors,
    confirmClose: session?.confirmClose ?? false,
    open,
    update,
    save,
    cancel,
    requestClose,
    discard,
    continueEditing,
  };
}

export function blockEditorKey(blockId: string, blockInstanceId: string | null): BlockEditorKey {
  return `${blockId}:${blockInstanceId ?? "primary"}`;
}

function createSession(
  target: BlockEditorTarget,
  initial: Record<string, unknown>,
  fieldsById: ReadonlyMap<string, FormFieldRead>,
  editableFieldIds: ReadonlySet<string>,
): BlockEditorSession {
  const initialValues: Record<string, FieldEditorState> = {};
  for (const [fieldId, value] of Object.entries(initial)) {
    const field = fieldsById.get(fieldId);
    if (
      !field ||
      field.block_id !== target.blockId ||
      !isOrdinaryEditableField(field, editableFieldIds)
    ) {
      continue;
    }
    initialValues[fieldId] = initialEditorValue({ field_type: field.field_type, value });
  }
  return {
    key: blockEditorKey(target.blockId, target.blockInstanceId),
    target,
    initialValues,
    values: { ...initialValues },
    dirty: false,
    pending: false,
    errors: {},
    confirmClose: false,
    pendingOpen: null,
  };
}

function isOrdinaryEditableField(field: FormFieldRead, editableFieldIds: ReadonlySet<string>) {
  return (
    field.is_active &&
    editableFieldIds.has(field.id) &&
    field.field_type !== "static_text" &&
    field.field_type !== "file_ref"
  );
}

function isDirty(
  initialValues: Record<string, FieldEditorState>,
  values: Record<string, FieldEditorState>,
) {
  return Object.keys(initialValues).some(
    (fieldId) => !sameEditorValue(initialValues[fieldId], values[fieldId]),
  );
}

function sameEditorValue(left: FieldEditorState, right: FieldEditorState) {
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((value, index) => value === right[index]);
  }
  return left === right;
}

function isEmptyEditorValue(value: FieldEditorState) {
  if (typeof value === "boolean") return false;
  if (Array.isArray(value)) return value.length === 0;
  return value.trim() === "";
}

function runtimeError(error: unknown) {
  return runtimeErrorMessageLabel(error instanceof Error ? error.message : "");
}
