import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";

import {
  archiveCard,
  archiveCardBlockInstance,
  createCard,
  createCardBlockInstance,
  listOrgUnits,
  listReferenceItems,
  updateCard,
  updateCardFieldValue,
  updateCardFieldValues,
} from "@/api/client";
import type {
  CardRead,
  CardSummaryRead,
  FormBlockRead,
  FormFieldRead,
  OrgUnitRead,
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
import {
  AdminMutationDialog,
  AdminMutationForm,
  ArchiveConfirmation,
  MutationFeedback,
} from "@/components/common/AdminMutation";
import { Panel, SelectableList } from "@/components/common/DataSurfaces";
import { errorText, shortId } from "@/components/common/dataUtils";

import { FieldEditorControl } from "./FieldEditorControl";
import { CardAttachmentsPanel } from "./CardAttachmentsPanel";
import { GeneratedDocumentsPanel } from "./GeneratedDocumentsPanel";
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
  selectedRegistryId,
  selectedCardId,
  onSelectCard,
}: {
  cards: CardSummaryRead[];
  card: CardRead | null;
  schema: RegistrySchemaRead | null;
  token: string;
  organizations: OrganizationRead[];
  selectedRegistryId: string;
  selectedCardId: string;
  onSelectCard: (cardId: string) => void;
}) {
  const queryClient = useQueryClient();
  const selectedCard = cards.find((item) => item.id === card?.id) ?? null;
  const [cardFormMode, setCardFormMode] = useState<"create" | "edit" | null>(null);
  const [cardForm, setCardForm] = useState<CardFormState>(() =>
    initialCreateCardForm(selectedRegistryId, organizations),
  );
  const [archiveTarget, setArchiveTarget] = useState<CardSummaryRead | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const organizationsById = useMemo(
    () => new Map(organizations.map((organization) => [organization.id, organization])),
    [organizations],
  );
  const fieldRows = useMemo(() => buildEditableCardFields(card, schema), [card, schema]);
  const repeatableBlocks = useMemo(
    () => (schema?.blocks ?? []).filter((block) => block.is_active && block.is_repeatable),
    [schema?.blocks],
  );
  const orgUnitsQuery = useQuery({
    queryKey: ["org-units", token, cardForm.organizationId],
    queryFn: () => listOrgUnits(token, cardForm.organizationId),
    enabled: Boolean(token && cardFormMode === "create" && cardForm.organizationId),
  });
  const createCardMutation = useMutation({
    mutationFn: () =>
      createCard(token, cardForm.registryId, {
        organization_id: cardForm.organizationId,
        org_unit_id: optionalId(cardForm.orgUnitId),
        display_name: cardForm.displayName.trim(),
        public_view_enabled: cardForm.publicViewEnabled,
        public_edit_enabled: cardForm.publicEditEnabled,
      }),
    onSuccess: async (created) => {
      setSuccessMessage(uiText.cardCreated);
      setCardFormMode(null);
      onSelectCard(created.id);
      await invalidateCardQueries(queryClient, token, created.registry_id, created.id);
    },
  });
  const updateCardMutation = useMutation({
    mutationFn: () => {
      if (!card) {
        throw new Error(uiText.notFound);
      }
      return updateCard(token, card.id, {
        display_name: cardForm.displayName.trim(),
        public_view_enabled: cardForm.publicViewEnabled,
        public_edit_enabled: cardForm.publicEditEnabled,
      });
    },
    onSuccess: async (updated) => {
      setSuccessMessage(uiText.cardUpdated);
      setCardFormMode(null);
      await invalidateCardQueries(queryClient, token, updated.registry_id, updated.id);
    },
  });
  const archiveCardMutation = useMutation({
    mutationFn: (target: CardSummaryRead) => archiveCard(token, target.id),
    onSuccess: async (archived) => {
      setSuccessMessage(uiText.cardArchived);
      setArchiveTarget(null);
      const nextCardId = cards.find((item) => item.id !== archived.id)?.id ?? "";
      onSelectCard(nextCardId);
      await invalidateCardQueries(queryClient, token, archived.registry_id, archived.id);
    },
  });
  const createBlockInstanceMutation = useMutation({
    mutationFn: (blockId: string) => {
      if (!card) {
        throw new Error(uiText.notFound);
      }
      return createCardBlockInstance(token, card.id, blockId);
    },
    onSuccess: async () => {
      setSuccessMessage(uiText.blockInstanceCreated);
      if (card) {
        await invalidateCardQueries(queryClient, token, card.registry_id, card.id);
      }
    },
  });
  const archiveBlockInstanceMutation = useMutation({
    mutationFn: (blockInstanceId: string) => archiveCardBlockInstance(token, blockInstanceId),
    onSuccess: async () => {
      setSuccessMessage(uiText.blockInstanceArchived);
      if (card) {
        await invalidateCardQueries(queryClient, token, card.registry_id, card.id);
      }
    },
  });

  function openCreateForm() {
    setCardForm(initialCreateCardForm(selectedRegistryId, organizations));
    setCardFormMode("create");
    setArchiveTarget(null);
    setSuccessMessage(null);
    setLocalError(null);
  }

  function openEditForm() {
    if (!card) {
      return;
    }
    setCardForm({
      registryId: card.registry_id,
      organizationId: card.organization_id,
      orgUnitId: selectedCard?.org_unit_id ?? "",
      displayName: card.display_name,
      publicViewEnabled: selectedCard?.public_view_enabled ?? false,
      publicEditEnabled: selectedCard?.public_edit_enabled ?? false,
    });
    setCardFormMode("edit");
    setArchiveTarget(null);
    setSuccessMessage(null);
    setLocalError(null);
  }

  function handleCardFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError(null);
    if (cardFormMode === "create" && !cardForm.organizationId) {
      setLocalError(uiText.requiredFields);
      return;
    }
    if (!cardForm.displayName.trim()) {
      setLocalError(uiText.requiredFields);
      return;
    }
    if (cardFormMode === "create") {
      createCardMutation.mutate();
      return;
    }
    if (cardFormMode === "edit") {
      updateCardMutation.mutate();
    }
  }

  return (
    <div className="stack">
      <div className="split-grid">
        <Panel title={uiText.cards}>
          <div className="panel-toolbar">
            <button type="button" className="primary-button" onClick={openCreateForm}>
              {uiText.createCard}
            </button>
          </div>
          {cardFormMode === "create" && (
            <div className="panel-form">
              <CardMutationForm
                mode="create"
                form={cardForm}
                organizations={organizations}
                orgUnits={orgUnitsQuery.data?.items ?? []}
                registryName={schema?.registry.name ?? selectedRegistryId}
                isSubmitting={createCardMutation.isPending}
                error={localError ? new Error(localError) : createCardMutation.error}
                onCancel={() => setCardFormMode(null)}
                onChange={setCardForm}
                onSubmit={handleCardFormSubmit}
              />
            </div>
          )}
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
        <Panel title={uiText.cardMetadata}>
          {card && selectedCard ? (
            <div className="card-metadata-panel">
              <dl className="metadata-list">
                <div>
                  <dt>{uiText.cardDisplayName}</dt>
                  <dd>{card.display_name}</dd>
                </div>
                <div>
                  <dt>{uiText.organization}</dt>
                  <dd>
                    {organizationsById.get(card.organization_id)?.name ??
                      shortId(card.organization_id)}
                  </dd>
                </div>
                <div>
                  <dt>{uiText.status}</dt>
                  <dd>{lifecycleStatusLabel(selectedCard.lifecycle_status)}</dd>
                </div>
                <div>
                  <dt>{uiText.publicViewCard}</dt>
                  <dd>{selectedCard.public_view_enabled ? uiText.yes : uiText.no}</dd>
                </div>
                <div>
                  <dt>{uiText.publicEditCard}</dt>
                  <dd>{selectedCard.public_edit_enabled ? uiText.yes : uiText.no}</dd>
                </div>
              </dl>
              <div className="row-actions card-actions">
                <button
                  type="button"
                  className="ghost-button"
                  aria-label={`${uiText.editCard} ${card.display_name}`}
                  onClick={openEditForm}
                >
                  {uiText.editCard}
                </button>
                <button
                  type="button"
                  className="danger-button"
                  aria-label={`${uiText.archiveCard} ${card.display_name}`}
                  onClick={() => {
                    setArchiveTarget(selectedCard);
                    setCardFormMode(null);
                    setSuccessMessage(null);
                  }}
                >
                  {uiText.archive}
                </button>
              </div>
              {cardFormMode === "edit" && (
                <CardMutationForm
                  mode="edit"
                  form={cardForm}
                  organizations={organizations}
                  orgUnits={[]}
                  registryName={schema?.registry.name ?? selectedRegistryId}
                  isSubmitting={updateCardMutation.isPending}
                  error={localError ? new Error(localError) : updateCardMutation.error}
                  onCancel={() => setCardFormMode(null)}
                  onChange={setCardForm}
                  onSubmit={handleCardFormSubmit}
                />
              )}
              {repeatableBlocks.length > 0 && (
                <RepeatableBlockControls
                  blocks={repeatableBlocks}
                  card={card}
                  isCreating={createBlockInstanceMutation.isPending}
                  isArchiving={archiveBlockInstanceMutation.isPending}
                  onAdd={(blockId) => createBlockInstanceMutation.mutate(blockId)}
                  onArchive={(blockInstanceId) =>
                    archiveBlockInstanceMutation.mutate(blockInstanceId)
                  }
                />
              )}
              <MutationFeedback
                error={
                  archiveCardMutation.error ??
                  createBlockInstanceMutation.error ??
                  archiveBlockInstanceMutation.error
                }
                successMessage={successMessage}
              />
            </div>
          ) : (
            <p className="data-empty">{uiText.noData}</p>
          )}
        </Panel>
      </div>
      <Panel title={uiText.cardFields}>
        {card && fieldRows.length > 0 && (
          <BulkCardValuesForm
            key={fieldRows.map((field) => field.key).join("|")}
            card={card}
            fields={fieldRows}
            token={token}
          />
        )}
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
      {card && (
        <div className="split-grid">
          <CardAttachmentsPanel cardId={card.id} token={token} />
          <GeneratedDocumentsPanel cardId={card.id} registryId={card.registry_id} token={token} />
        </div>
      )}
      {archiveTarget && (
        <AdminMutationDialog title={uiText.archiveCard}>
          <ArchiveConfirmation
            entityLabel={uiText.archiveCard}
            itemLabel={archiveTarget.display_name}
            isPending={archiveCardMutation.isPending}
            onCancel={() => setArchiveTarget(null)}
            onConfirm={() => archiveCardMutation.mutate(archiveTarget)}
          />
        </AdminMutationDialog>
      )}
    </div>
  );
}

type CardFormState = {
  registryId: string;
  organizationId: string;
  orgUnitId: string;
  displayName: string;
  publicViewEnabled: boolean;
  publicEditEnabled: boolean;
};

function CardMutationForm({
  mode,
  form,
  organizations,
  orgUnits,
  registryName,
  isSubmitting,
  error,
  onCancel,
  onChange,
  onSubmit,
}: {
  mode: "create" | "edit";
  form: CardFormState;
  organizations: OrganizationRead[];
  orgUnits: OrgUnitRead[];
  registryName: string;
  isSubmitting: boolean;
  error?: unknown;
  onCancel: () => void;
  onChange: (form: CardFormState) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <AdminMutationForm
      title={mode === "create" ? uiText.createCard : uiText.editCard}
      submitLabel={mode === "create" ? uiText.create : uiText.save}
      isSubmitting={isSubmitting}
      error={error}
      onCancel={onCancel}
      onSubmit={onSubmit}
    >
      {mode === "create" && (
        <>
          <label>
            <span>{uiText.cardRegistry}</span>
            <select value={form.registryId} disabled>
              <option value={form.registryId}>{registryName}</option>
            </select>
          </label>
          <label>
            <span>{uiText.cardOrganization}</span>
            <select
              value={form.organizationId}
              onChange={(event) =>
                onChange({ ...form, organizationId: event.currentTarget.value, orgUnitId: "" })
              }
            >
              <option value="">{uiText.noData}</option>
              {organizations.map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{uiText.cardOrgUnit}</span>
            <select
              value={form.orgUnitId}
              onChange={(event) => onChange({ ...form, orgUnitId: event.currentTarget.value })}
            >
              <option value="">{uiText.noOrgUnit}</option>
              {orgUnits.map((orgUnit) => (
                <option key={orgUnit.id} value={orgUnit.id}>
                  {orgUnit.name}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
      <label>
        <span>{uiText.cardDisplayName}</span>
        <input
          value={form.displayName}
          onChange={(event) => onChange({ ...form, displayName: event.currentTarget.value })}
        />
      </label>
      <label className="checkbox-control">
        <input
          aria-label={uiText.publicViewCard}
          checked={form.publicViewEnabled}
          type="checkbox"
          onChange={(event) =>
            onChange({ ...form, publicViewEnabled: event.currentTarget.checked })
          }
        />
        <span>{uiText.publicViewCard}</span>
      </label>
      <label className="checkbox-control">
        <input
          aria-label={uiText.publicEditCard}
          checked={form.publicEditEnabled}
          type="checkbox"
          onChange={(event) =>
            onChange({ ...form, publicEditEnabled: event.currentTarget.checked })
          }
        />
        <span>{uiText.publicEditCard}</span>
      </label>
    </AdminMutationForm>
  );
}

function RepeatableBlockControls({
  blocks,
  card,
  isCreating,
  isArchiving,
  onAdd,
  onArchive,
}: {
  blocks: FormBlockRead[];
  card: CardRead;
  isCreating: boolean;
  isArchiving: boolean;
  onAdd: (blockId: string) => void;
  onArchive: (blockInstanceId: string) => void;
}) {
  return (
    <div className="repeatable-block-controls">
      <h4>{uiText.repeatableBlocks}</h4>
      {blocks.map((block) => {
        const readBlock = Object.values(card.blocks).find(
          (cardBlock) => cardBlock.block_id === block.id,
        );
        return (
          <div key={block.id} className="repeatable-block-control">
            <div className="repeatable-block-heading">
              <strong>{block.title}</strong>
              <button
                type="button"
                className="ghost-button"
                aria-label={`${uiText.addBlockInstance} ${block.title}`}
                disabled={isCreating}
                onClick={() => onAdd(block.id)}
              >
                {uiText.addBlockInstance}
              </button>
            </div>
            {(readBlock?.instances ?? [])
              .filter((instance) => Boolean(instance.block_instance_id))
              .map((instance) => (
                <div key={instance.block_instance_id} className="repeatable-instance-row">
                  <span>{instanceLabel(instance.ordinal)}</span>
                  <button
                    type="button"
                    className="ghost-button"
                    aria-label={`${uiText.archiveBlockInstance} ${block.title} ${instanceLabel(
                      instance.ordinal,
                    )}`}
                    disabled={isArchiving}
                    onClick={() => {
                      if (instance.block_instance_id) {
                        onArchive(instance.block_instance_id);
                      }
                    }}
                  >
                    {uiText.archive}
                  </button>
                </div>
              ))}
          </div>
        );
      })}
    </div>
  );
}

function BulkCardValuesForm({
  card,
  fields,
  token,
}: {
  card: CardRead;
  fields: EditableCardField[];
  token: string;
}) {
  const queryClient = useQueryClient();
  const [draftValues, setDraftValues] = useState<Record<string, FieldEditorState>>({});
  const [localError, setLocalError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        values: fields.map((field) => ({
          field_id: field.field.field_id,
          value: coerceEditorValue(field.field.field_type, currentBulkValue(field, draftValues)),
          block_instance_id: field.blockInstanceId,
        })),
      };
      return updateCardFieldValues(token, card.id, payload);
    },
    onSuccess: async () => {
      setSaved(true);
      setDraftValues({});
      await queryClient.invalidateQueries({ queryKey: ["card", token, card.id] });
      await queryClient.invalidateQueries({ queryKey: ["audit-events", token] });
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError(null);
    setSaved(false);
    try {
      mutation.mutate();
    } catch (error) {
      setLocalError(errorText(error));
    }
  }

  return (
    <form aria-label={uiText.bulkFieldValues} className="bulk-field-form" onSubmit={handleSubmit}>
      <header className="bulk-field-header">
        <h4>{uiText.bulkFieldValues}</h4>
        <button type="submit" className="primary-button" disabled={mutation.isPending}>
          {mutation.isPending ? uiText.saving : uiText.saveAllFields}
        </button>
      </header>
      <div className="bulk-field-grid">
        {fields.map((field) => (
          <BulkFieldEditor
            key={field.key}
            field={field}
            token={token}
            value={currentBulkValue(field, draftValues)}
            onChange={(value) => {
              setDraftValues((current) => ({ ...current, [field.key]: value }));
              setSaved(false);
              setLocalError(null);
            }}
          />
        ))}
      </div>
      {(localError || mutation.error) && (
        <p className="inline-alert">{localError ?? errorText(mutation.error)}</p>
      )}
      {saved && <p className="inline-success">{uiText.cardFieldsSaved}</p>}
    </form>
  );
}

function BulkFieldEditor({
  field,
  token,
  value,
  onChange,
}: {
  field: EditableCardField;
  token: string;
  value: FieldEditorState;
  onChange: (value: FieldEditorState) => void;
}) {
  const referenceListId =
    field.schema?.options_source_type === "reference_list" ? field.schema.options_source_id : null;
  const referenceItemsQuery = useQuery({
    queryKey: ["reference-items", token, referenceListId],
    queryFn: () => listReferenceItems(token, referenceListId ?? ""),
    enabled:
      Boolean(token && referenceListId) &&
      ["select", "multi_select"].includes(field.field.field_type),
  });

  return (
    <label className="field-editor-control">
      <span>{field.label}</span>
      <FieldEditorControl
        fieldType={field.field.field_type}
        label={field.label}
        options={referenceItemsQuery.data?.items ?? []}
        value={value}
        onChange={onChange}
      />
      <small>
        {field.blockLabel} / {field.instanceLabel}
      </small>
    </label>
  );
}

function initialCreateCardForm(
  selectedRegistryId: string,
  organizations: OrganizationRead[],
): CardFormState {
  return {
    registryId: selectedRegistryId,
    organizationId: organizations[0]?.id ?? "",
    orgUnitId: "",
    displayName: "",
    publicViewEnabled: false,
    publicEditEnabled: false,
  };
}

function currentBulkValue(field: EditableCardField, draftValues: Record<string, FieldEditorState>) {
  if (Object.prototype.hasOwnProperty.call(draftValues, field.key)) {
    return draftValues[field.key];
  }
  return initialEditorValue(field.field);
}

function optionalId(value: string) {
  return value.trim() ? value : null;
}

async function invalidateCardQueries(
  queryClient: QueryClient,
  token: string,
  registryId: string,
  cardId: string,
) {
  await queryClient.invalidateQueries({ queryKey: ["cards", token, registryId] });
  await queryClient.invalidateQueries({ queryKey: ["card", token, cardId] });
  await queryClient.invalidateQueries({ queryKey: ["audit-events", token] });
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
