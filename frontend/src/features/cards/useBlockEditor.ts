import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
  openField: (
    blockId: string,
    blockInstanceId: string | null,
    fieldId: string,
    initial: Record<string, unknown>,
  ) => void;
  updateAndSave: (fieldId: string, value: FieldEditorState, delayMs: number | null) => void;
  flushPendingSave: () => void;
  commitAndClose: () => void;
  cancel: () => void;
};

export type UseBlockEditorOptions = {
  fields: FormFieldRead[];
  editableFieldIds: ReadonlySet<string>;
  saveValues: (payload: FieldValuesBulkUpdatePayload) => Promise<unknown>;
};

type BlockEditorSession = {
  id: number;
  key: BlockEditorKey;
  target: BlockEditorTarget;
  initialValues: Record<string, FieldEditorState>;
  values: Record<string, FieldEditorState>;
  dirty: boolean;
  pending: boolean;
  errors: Record<string, string>;
  pendingOpen: BlockEditorSession | null;
  closeAfterSave: boolean;
  autoSaveDelayMs: number | null;
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
  const sessionIdRef = useRef(0);

  const openField = useCallback(
    (
      blockId: string,
      blockInstanceId: string | null,
      fieldId: string,
      initial: Record<string, unknown>,
    ) => {
      const nextSession = createSession(
        { blockId, blockInstanceId },
        { [fieldId]: initial[fieldId] },
        fieldsById,
        editableFieldIds,
        ++sessionIdRef.current,
      );
      setSession((current) => {
        if (!current || !current.dirty) return nextSession;
        const currentFieldId = Object.keys(current.values)[0] ?? null;
        if (current.key === nextSession.key && currentFieldId === fieldId) return current;
        return { ...current, pendingOpen: nextSession, autoSaveDelayMs: 0 };
      });
    },
    [editableFieldIds, fieldsById],
  );

  const updateAndSave = useCallback((fieldId: string, value: FieldEditorState, delayMs: number | null) => {
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
        autoSaveDelayMs: delayMs,
      };
    });
  }, []);

  const flushPendingSave = useCallback(() => {
    setSession((current) => {
      if (!current || current.pending || !current.dirty) return current;
      return { ...current, autoSaveDelayMs: 0 };
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
        current?.id === session.id
          ? { ...current, pending: false, errors: validationErrors }
          : current,
      );
      return false;
    }

    if (changedValues.length === 0) {
      setSession((current) =>
        current?.id === session.id ? (current.pendingOpen ?? null) : current,
      );
      return true;
    }

    setSession((current) =>
      current?.id === session.id ? { ...current, pending: true, errors: {} } : current,
    );
    try {
      await saveValues({ values: changedValues });
      setSession((current) =>
        current?.id === session.id
          ? (current.pendingOpen ??
            (current.closeAfterSave
              ? null
              : {
                  ...current,
                  initialValues: { ...current.values },
                  dirty: false,
                  pending: false,
                  errors: {},
                  autoSaveDelayMs: null,
                }))
          : current,
      );
      return true;
    } catch (error) {
      setSession((current) =>
        current?.id === session.id
          ? { ...current, pending: false, errors: { _form: runtimeError(error) } }
          : current,
      );
      return false;
    }
  }, [editableFieldIds, fieldsById, saveValues, session]);

  useEffect(() => {
    if (!session?.dirty || session.pending || session.autoSaveDelayMs === null) return;
    const timer = window.setTimeout(() => {
      void save();
    }, session.autoSaveDelayMs);
    return () => window.clearTimeout(timer);
  }, [save, session?.autoSaveDelayMs, session?.dirty, session?.pending, session?.values]);

  const cancel = useCallback(() => setSession(null), []);
  const commitAndClose = useCallback(() => {
    setSession((current) => {
      if (!current) return current;
      if (current.pending) return { ...current, closeAfterSave: true };
      if (!current.dirty) return null;
      return { ...current, closeAfterSave: true, pendingOpen: null, autoSaveDelayMs: 0 };
    });
  }, []);

  return {
    key: session?.key ?? null,
    target: session?.target ?? null,
    values: session?.values ?? emptyValues,
    dirty: session?.dirty ?? false,
    pending: session?.pending ?? false,
    errors: session?.errors ?? emptyErrors,
    openField,
    updateAndSave,
    flushPendingSave,
    commitAndClose,
    cancel,
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
  id: number,
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
    id,
    key: blockEditorKey(target.blockId, target.blockInstanceId),
    target,
    initialValues,
    values: { ...initialValues },
    dirty: false,
    pending: false,
    errors: {},
    pendingOpen: null,
    closeAfterSave: false,
    autoSaveDelayMs: null,
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
  if (typeof value !== "string") return false;
  return value.trim() === "";
}

function runtimeError(error: unknown) {
  return runtimeErrorMessageLabel(error instanceof Error ? error.message : "");
}
