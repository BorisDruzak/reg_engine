import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";

import { listReferenceItems, updateCardFieldValue } from "@/api/client";
import type {
  CardRead,
  CardSummaryRead,
  FormFieldRead,
  OrganizationRead,
  RegistrySchemaRead,
} from "@/api/types";
import {
  fieldTypeLabel,
  instanceLabel,
  lifecycleStatusLabel,
  saveLabel,
  savedLabel,
  uiText,
} from "@/app/uiText";
import { Panel, SelectableList } from "@/components/common/DataSurfaces";
import { errorText, shortId } from "@/components/common/dataUtils";

import { FieldEditorControl } from "./FieldEditorControl";
import {
  type FieldEditorState,
  coerceEditorValue,
  formatValue as formatEditorValue,
  initialEditorValue,
} from "./fieldEditorUtils";

export function CardsWorkspace({
  cards,
  card,
  schema,
  token,
  organizations,
  selectedCardId,
  onSelectCard,
}: {
  cards: CardSummaryRead[];
  card: CardRead | null;
  schema: RegistrySchemaRead | null;
  token: string;
  organizations: OrganizationRead[];
  selectedCardId: string;
  onSelectCard: (cardId: string) => void;
}) {
  const organizationsById = useMemo(
    () => new Map(organizations.map((organization) => [organization.id, organization])),
    [organizations],
  );
  const fieldRows = useMemo(() => buildEditableCardFields(card, schema), [card, schema]);

  return (
    <div className="stack">
      <div className="split-grid">
        <Panel title={uiText.cards}>
          <SelectableList
            items={cards.map((item) => ({
              id: item.id,
              title: item.display_name,
              detail: `${organizationsById.get(item.organization_id)?.name ?? shortId(item.organization_id)} / ${lifecycleStatusLabel(
                item.lifecycle_status,
              )}`,
            }))}
            selectedId={selectedCardId}
            onSelect={onSelectCard}
          />
        </Panel>
        <Panel title={uiText.cardFields}>
          <div className="field-editor-list">
            {card && fieldRows.length > 0 ? (
              fieldRows.map((field) => (
                <CardFieldEditor key={field.key} cardId={card.id} field={field} token={token} />
              ))
            ) : (
              <p className="data-empty">{uiText.noData}</p>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}

type EditableCardField = {
  key: string;
  blockLabel: string;
  instanceLabel: string;
  label: string;
  field: CardRead["fields"][string];
  schema: FormFieldRead | null;
  blockInstanceId: string | null;
};

function CardFieldEditor({
  cardId,
  field,
  token,
}: {
  cardId: string;
  field: EditableCardField;
  token: string;
}) {
  const queryClient = useQueryClient();
  const [rawValue, setRawValue] = useState<FieldEditorState>(() => initialEditorValue(field.field));
  const [localError, setLocalError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const referenceListId =
    field.schema?.options_source_type === "reference_list" ? field.schema.options_source_id : null;
  const referenceItemsQuery = useQuery({
    queryKey: ["reference-items", token, referenceListId],
    queryFn: () => listReferenceItems(token, referenceListId ?? ""),
    enabled:
      Boolean(token && referenceListId) &&
      ["select", "multi_select"].includes(field.field.field_type),
  });
  const mutation = useMutation({
    mutationFn: (value: unknown) =>
      updateCardFieldValue(token, cardId, field.field.field_id, value, field.blockInstanceId),
    onSuccess: async () => {
      setSaved(true);
      await queryClient.invalidateQueries({ queryKey: ["card", token, cardId] });
      await queryClient.invalidateQueries({ queryKey: ["audit-events", token] });
    },
  });

  function updateRawValue(nextValue: FieldEditorState) {
    setRawValue(nextValue);
    setSaved(false);
    setLocalError(null);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      mutation.mutate(coerceEditorValue(field.field.field_type, rawValue));
    } catch (error) {
      setLocalError(errorText(error));
    }
  }

  return (
    <form className="field-editor-row" onSubmit={handleSubmit}>
      <div className="field-editor-meta">
        <strong>{field.label}</strong>
        <span>
          {field.blockLabel} / {field.instanceLabel} / {fieldTypeLabel(field.field.field_type)}
        </span>
        <span>
          {uiText.currentValue}: {formatEditorValue(field.field.value)}
        </span>
      </div>
      <label className="field-editor-control">
        <span>{field.label}</span>
        <FieldEditorControl
          fieldType={field.field.field_type}
          label={field.label}
          options={referenceItemsQuery.data?.items ?? []}
          value={rawValue}
          onChange={updateRawValue}
        />
      </label>
      <button type="submit" className="primary-button" disabled={mutation.isPending}>
        {saveLabel(field.label)}
      </button>
      {(localError || mutation.error) && (
        <p className="inline-alert">{localError ?? errorText(mutation.error)}</p>
      )}
      {saved && <p className="inline-success">{savedLabel(field.label)}</p>}
    </form>
  );
}

function buildEditableCardFields(
  card: CardRead | null,
  schema: RegistrySchemaRead | null,
): EditableCardField[] {
  if (!card) {
    return [];
  }

  const fieldsById = new Map((schema?.fields ?? []).map((field) => [field.id, field]));
  const blocksById = new Map((schema?.blocks ?? []).map((block) => [block.id, block]));

  return Object.values(card.blocks).flatMap((block) =>
    block.instances.flatMap((instance) =>
      Object.values(instance.fields).map((field) => {
        const fieldSchema = fieldsById.get(field.field_id) ?? null;
        const blockSchema = blocksById.get(block.block_id);
        return {
          key: `${card.id}:${block.block_id}:${instance.block_instance_id ?? instance.ordinal}:${field.field_id}`,
          blockLabel: blockSchema?.title ?? block.code,
          instanceLabel: instanceLabel(instance.ordinal),
          label: fieldSchema?.label ?? field.code,
          field,
          schema: fieldSchema,
          blockInstanceId: instance.block_instance_id,
        };
      }),
    ),
  );
}
