import type { FormBlockRead, FormFieldRead } from "@/api/types";

export type CardFieldCompletionState = "filled" | "required-missing" | "empty";
export type CardBlockCompletionState = "complete" | "attention" | "empty";

export type CardFieldCompletion = {
  fieldId: string;
  blockId: string;
  state: CardFieldCompletionState;
  label: "Заполнено" | "Нужно заполнить" | "Не заполнено";
};

export type CardBlockCompletion = {
  blockId: string;
  filledCount: number;
  requiredMissingCount: number;
  totalCount: number;
  state: CardBlockCompletionState;
  label: string;
};

export type CompletionResult = {
  fields: Map<string, CardFieldCompletion>;
  blocks: Map<string, CardBlockCompletion>;
};

type CompletionBlock = Pick<FormBlockRead, "id" | "title">;
type CompletionField = Pick<FormFieldRead, "id" | "block_id" | "field_type" | "required_mode">;

export type CompletionInput = {
  blocks: readonly CompletionBlock[];
  fields: readonly CompletionField[];
  valueForField: (field: CompletionField) => unknown;
};

export function isValueFilled(value: unknown, fieldType: string): boolean {
  if (fieldType === "static_text") {
    return true;
  }
  if (value === null || value === undefined) {
    return false;
  }
  if (typeof value === "string") {
    return value.trim().length > 0;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  return true;
}

function fieldCompletionLabel(state: CardFieldCompletionState): CardFieldCompletion["label"] {
  if (state === "filled") {
    return "Заполнено";
  }
  if (state === "required-missing") {
    return "Нужно заполнить";
  }
  return "Не заполнено";
}

function blockCompletionLabel(
  state: CardBlockCompletionState,
  filledCount: number,
  requiredMissingCount: number,
  totalCount: number,
): string {
  if (state === "attention") {
    return `Нужно заполнить ${requiredMissingCount} из ${totalCount}`;
  }
  if (state === "complete") {
    return `Заполнено ${filledCount} из ${totalCount}`;
  }
  return totalCount === 0 ? "Нет полей" : "Не заполнено";
}

export function buildBlockCompletions(input: CompletionInput): CompletionResult {
  const fields = new Map<string, CardFieldCompletion>();
  const blocks = new Map<string, CardBlockCompletion>();

  for (const field of input.fields) {
    const filled = isValueFilled(input.valueForField(field), field.field_type);
    const required =
      field.required_mode === "required" || field.required_mode === "required_on_publish";
    const state: CardFieldCompletionState = filled
      ? "filled"
      : required
        ? "required-missing"
        : "empty";

    fields.set(field.id, {
      fieldId: field.id,
      blockId: field.block_id,
      state,
      label: fieldCompletionLabel(state),
    });
  }

  for (const block of input.blocks) {
    const blockFields = [...fields.values()].filter((field) => field.blockId === block.id);
    const filledCount = blockFields.filter((field) => field.state === "filled").length;
    const requiredMissingCount = blockFields.filter(
      (field) => field.state === "required-missing",
    ).length;
    const state: CardBlockCompletionState =
      requiredMissingCount > 0 ? "attention" : filledCount > 0 ? "complete" : "empty";

    blocks.set(block.id, {
      blockId: block.id,
      filledCount,
      requiredMissingCount,
      totalCount: blockFields.length,
      state,
      label: blockCompletionLabel(state, filledCount, requiredMissingCount, blockFields.length),
    });
  }

  return { fields, blocks };
}
