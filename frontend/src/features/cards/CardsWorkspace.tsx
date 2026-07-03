import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";

import {
  archivePublicLink,
  archiveCard,
  archiveCardBlockInstance,
  createOrganizationCard,
  createCardBlockInstance,
  createPublicLink,
  listCardFieldReferenceItems,
  listAttachments,
  listPublicLinks,
  updateCard,
  updateCardFieldValue,
  updateCardFieldValues,
} from "@/api/client";
import type {
  CardFieldFilterPayload,
  CardRead,
  CardSummaryRead,
  CardTemplateRead,
  FormBlockRead,
  FormFieldRead,
  OrganizationRead,
  PublicLinkCreatePayload,
  PublicLinkRead,
  PublicLinkTokenRead,
  RegistrySchemaRead,
  AttachmentRead,
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
import { Panel, SelectableList, WorkspaceTabs } from "@/components/common/DataSurfaces";
import { errorText, formatDate, shortId } from "@/components/common/dataUtils";

import { FieldEditorControl, type FieldEditorFileRefOption } from "./FieldEditorControl";
import { CardAttachmentsPanel } from "./CardAttachmentsPanel";
import { CardTagSearchBar } from "./CardTagSearchBar";
import { GeneratedDocumentsPanel } from "./GeneratedDocumentsPanel";
import {
  type FieldEditorState,
  coerceEditorValue,
  fileRefValueFromUnknown,
  formatValue as formatEditorValue,
  initialEditorValue,
} from "./fieldEditorUtils";

type CardWorkspaceTab = "fields" | "attachments" | "documents" | "links" | "history";

const cardWorkspaceTabs: { id: CardWorkspaceTab; label: string }[] = [
  { id: "fields", label: uiText.cardFieldsTab },
  { id: "attachments", label: uiText.attachments },
  { id: "documents", label: uiText.documents },
  { id: "links", label: uiText.publicLinks },
  { id: "history", label: uiText.cardHistory },
];

type CardShellTab = "list" | `card:${string}`;

type CardEditorPanelState = {
  isDirty: boolean;
  isPending: boolean;
  error: string | null;
  saved: boolean;
};

const cardTabsStorageKey = "reg_engine.card_tabs.v1";

export function CardsWorkspace({
  cards,
  card,
  schema,
  token,
  currentUserId,
  organizations,
  selectedCardId,
  cardSearch,
  cardOrganizationIds,
  cardIncludeDescendantOrganizations,
  cardTemplateIds,
  cardFieldFilters,
  includeArchivedCards,
  onSelectCard,
  onCardSearchChange,
  onCardOrganizationIdsChange,
  onCardIncludeDescendantOrganizationsChange,
  onCardTemplateIdsChange,
  onCardFieldFiltersChange,
  onIncludeArchivedCardsChange,
}: {
  cards: CardSummaryRead[];
  card: CardRead | null;
  schema: RegistrySchemaRead | null;
  token: string;
  currentUserId: string;
  organizations: OrganizationRead[];
  selectedCardId: string;
  cardSearch: string;
  cardOrganizationIds: string[];
  cardIncludeDescendantOrganizations: boolean;
  cardTemplateIds: string[];
  cardFieldFilters: CardFieldFilterPayload[];
  includeArchivedCards: boolean;
  onSelectCard: (cardId: string) => void;
  onCardSearchChange: (value: string) => void;
  onCardOrganizationIdsChange: (value: string[]) => void;
  onCardIncludeDescendantOrganizationsChange: (value: boolean) => void;
  onCardTemplateIdsChange: (value: string[]) => void;
  onCardFieldFiltersChange: (value: CardFieldFilterPayload[]) => void;
  onIncludeArchivedCardsChange: (value: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const selectedCard = cards.find((item) => item.id === card?.id) ?? null;
  const [cardFormMode, setCardFormMode] = useState<"create" | null>(null);
  const [activeTab, setActiveTab] = useState<CardWorkspaceTab>("fields");
  const [openCardIds, setOpenCardIds] = useState<string[]>(() => loadCardTabs().openCardIds);
  const [activeShellTab, setActiveShellTab] = useState<CardShellTab>(
    () => loadCardTabs().activeTab,
  );
  const [dirtyCardIds, setDirtyCardIds] = useState<Set<string>>(() => new Set());
  const [fieldEditorStates, setFieldEditorStates] = useState<Record<string, CardEditorPanelState>>(
    {},
  );
  const [cardForm, setCardForm] = useState<CardFormState>(() =>
    initialCreateCardForm(organizations),
  );
  const [archiveTarget, setArchiveTarget] = useState<CardSummaryRead | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const organizationsById = useMemo(
    () => new Map(organizations.map((organization) => [organization.id, organization])),
    [organizations],
  );
  const visibleOpenCardIds = useMemo(
    () => openCardIds.filter((cardId) => cards.some((item) => item.id === cardId)),
    [cards, openCardIds],
  );
  const cardShellTabs = useMemo(
    () => [
      { id: "list" as CardShellTab, label: uiText.cardListTab },
      ...visibleOpenCardIds.map((cardId) => {
        const item = cards.find((cardItem) => cardItem.id === cardId);
        const title = item?.display_name ?? shortId(cardId);
        const isDirty = dirtyCardIds.has(cardId) || hasCardDraft(currentUserId, cardId);
        return {
          id: `card:${cardId}` as CardShellTab,
          label: isDirty ? `${title} *` : title,
          closeLabel: `${uiText.closeCardTab} ${title}`,
        };
      }),
    ],
    [cards, currentUserId, dirtyCardIds, visibleOpenCardIds],
  );
  const activeEditorState: CardEditorPanelState | null = card
    ? (fieldEditorStates[card.id] ?? {
        isDirty: dirtyCardIds.has(card.id) || hasCardDraft(currentUserId, card.id),
        isPending: false,
        error: null,
        saved: false,
      })
    : null;
  const fieldRows = useMemo(() => buildEditableCardFields(card, schema), [card, schema]);
  const bulkFieldRows = useMemo(
    () => fieldRows.filter((field) => field.field.field_type !== "file_ref"),
    [fieldRows],
  );
  const fileRefFieldRows = useMemo(
    () => fieldRows.filter((field) => field.field.field_type === "file_ref"),
    [fieldRows],
  );
  const repeatableBlocks = useMemo(
    () => (schema?.blocks ?? []).filter((block) => block.is_active && block.is_repeatable),
    [schema?.blocks],
  );
  const activeCardTemplates = useMemo(
    () =>
      [...(schema?.templates ?? [])]
        .filter((template) => template.is_active)
        .sort(
          (left, right) => left.position - right.position || left.name.localeCompare(right.name),
        ),
    [schema?.templates],
  );
  const bulkFieldFormId = card ? `bulk-card-values-form-${card.id}` : "";
  const createCardMutation = useMutation({
    mutationFn: () =>
      createOrganizationCard(token, cardForm.organizationId, {
        card_template_id: cardForm.cardTemplateId,
        public_view_enabled: cardForm.publicViewEnabled,
        public_edit_enabled: cardForm.publicEditEnabled,
      }),
    onSuccess: async (created) => {
      setSuccessMessage(uiText.cardCreated);
      setCardFormMode(null);
      onSelectCard(created.id);
      setOpenCardIds((current) =>
        current.includes(created.id) ? current : [...current, created.id],
      );
      setActiveShellTab(`card:${created.id}`);
      await invalidateCardQueries(queryClient, token, created.registry_id, created.id);
    },
  });
  const activateCardMutation = useMutation({
    mutationFn: () => {
      if (!card) {
        throw new Error(uiText.notFound);
      }
      return updateCard(token, card.id, {
        lifecycle_status: "active",
      });
    },
    onSuccess: async (updated) => {
      setSuccessMessage(uiText.cardActivated);
      await invalidateCardQueries(queryClient, token, updated.registry_id, updated.id);
    },
  });
  const archiveCardMutation = useMutation({
    mutationFn: (target: CardSummaryRead) => archiveCard(token, target.id),
    onSuccess: async (archived) => {
      setSuccessMessage(uiText.cardArchived);
      setArchiveTarget(null);
      const nextCardId = cards.find((item) => item.id !== archived.id)?.id ?? "";
      setOpenCardIds((current) => current.filter((cardId) => cardId !== archived.id));
      setDirtyCardIds((current) => {
        const next = new Set(current);
        next.delete(archived.id);
        return next;
      });
      setActiveShellTab("list");
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

  useEffect(() => {
    saveCardTabs({
      activeTab: activeShellTab,
      openCardIds: visibleOpenCardIds,
    });
  }, [activeShellTab, visibleOpenCardIds]);

  function openCreateForm() {
    setCardForm({
      ...initialCreateCardForm(organizations),
      cardTemplateId: activeCardTemplates[0]?.id ?? "",
    });
    setCardFormMode("create");
    setActiveShellTab("list");
    setActiveTab("fields");
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
    if (!cardForm.cardTemplateId) {
      setLocalError(uiText.requiredFields);
      return;
    }
    if (cardFormMode === "create") {
      createCardMutation.mutate();
      return;
    }
  }

  function openCardEditor(cardId: string) {
    setOpenCardIds((current) => (current.includes(cardId) ? current : [...current, cardId]));
    setActiveShellTab(`card:${cardId}`);
    setActiveTab("fields");
    setCardFormMode(null);
    setArchiveTarget(null);
    setSuccessMessage(null);
    setLocalError(null);
    onSelectCard(cardId);
  }

  function handleShellTabChange(tabId: CardShellTab) {
    setActiveShellTab(tabId);
    setCardFormMode(null);
    setArchiveTarget(null);
    if (tabId.startsWith("card:")) {
      onSelectCard(tabId.slice("card:".length));
    }
  }

  function handleShellTabClose(tabId: CardShellTab) {
    if (!tabId.startsWith("card:")) {
      return;
    }
    const cardId = tabId.slice("card:".length);
    const hasUnsavedChanges = dirtyCardIds.has(cardId) || hasCardDraft(currentUserId, cardId);
    if (hasUnsavedChanges && !window.confirm(uiText.closeDirtyCardTabConfirmation)) {
      return;
    }

    setOpenCardIds((current) => current.filter((openCardId) => openCardId !== cardId));
    setDirtyCardIds((current) => {
      const next = new Set(current);
      next.delete(cardId);
      return next;
    });
    setFieldEditorStates((current) => {
      const next = { ...current };
      delete next[cardId];
      return next;
    });
    setCardFormMode(null);
    setArchiveTarget(null);
    setSuccessMessage(null);
    setLocalError(null);
    if (activeShellTab === tabId) {
      setActiveShellTab("list");
      onSelectCard(cards.find((item) => item.id !== cardId)?.id ?? "");
    }
  }

  function handleCardDirtyChange(cardId: string, isDirty: boolean) {
    setDirtyCardIds((current) => {
      if (current.has(cardId) === isDirty) {
        return current;
      }
      const next = new Set(current);
      if (isDirty) {
        next.add(cardId);
      } else {
        next.delete(cardId);
      }
      return next;
    });
  }

  function handleCardEditorStateChange(cardId: string, nextState: CardEditorPanelState) {
    setFieldEditorStates((current) => {
      const previous = current[cardId];
      if (
        previous &&
        previous.isDirty === nextState.isDirty &&
        previous.isPending === nextState.isPending &&
        previous.error === nextState.error &&
        previous.saved === nextState.saved
      ) {
        return current;
      }
      return {
        ...current,
        [cardId]: nextState,
      };
    });
    handleCardDirtyChange(cardId, nextState.isDirty);
  }

  function cardListDetail(item: CardSummaryRead) {
    const baseDetail = `${organizationsById.get(item.organization_id)?.name ?? shortId(item.organization_id)} / ${lifecycleStatusLabel(
      item.lifecycle_status,
    )}`;
    const selectedFieldDetails = (item.list_fields ?? []).map(
      (field) => `${field.label}: ${formatEditorValue(field.value)}`,
    );
    return [baseDetail, ...selectedFieldDetails].join(" / ");
  }

  return (
    <div className="stack">
      <WorkspaceTabs
        tabs={cardShellTabs}
        activeTab={activeShellTab}
        ariaLabel={uiText.cardEditorTabs}
        onChange={handleShellTabChange}
        onClose={handleShellTabClose}
      />
      {activeShellTab === "list" ? (
        <Panel title={uiText.cards}>
          <div className="panel-toolbar">
            <button type="button" className="primary-button" onClick={openCreateForm}>
              {uiText.createCard}
            </button>
          </div>
          <CardListFilters
            cardSearch={cardSearch}
            organizationIds={cardOrganizationIds}
            includeDescendantOrganizations={cardIncludeDescendantOrganizations}
            includeArchive={includeArchivedCards}
            fieldFilters={cardFieldFilters}
            fields={schema?.fields ?? []}
            templates={schema?.templates ?? []}
            templateIds={cardTemplateIds}
            token={token}
            organizations={organizations}
            onSearchChange={onCardSearchChange}
            onOrganizationIdsChange={onCardOrganizationIdsChange}
            onIncludeDescendantOrganizationsChange={onCardIncludeDescendantOrganizationsChange}
            onTemplateIdsChange={onCardTemplateIdsChange}
            onFieldFiltersChange={onCardFieldFiltersChange}
            onIncludeArchiveChange={onIncludeArchivedCardsChange}
          />
          <SelectableList
            items={cards.map((item) => ({
              id: item.id,
              title: item.display_name,
              detail: cardListDetail(item),
            }))}
            selectedId={selectedCardId}
            onSelect={onSelectCard}
            onOpen={openCardEditor}
          />
          <MutationFeedback error={archiveCardMutation.error} successMessage={successMessage} />
          {cardFormMode === "create" && (
            <div className="panel-form">
              <CardMutationForm
                form={cardForm}
                organizations={organizations}
                templates={activeCardTemplates}
                isSubmitting={createCardMutation.isPending}
                error={localError ? new Error(localError) : createCardMutation.error}
                onCancel={() => setCardFormMode(null)}
                onChange={setCardForm}
                onSubmit={handleCardFormSubmit}
              />
            </div>
          )}
        </Panel>
      ) : (
        <div className="stack">
          {card && selectedCard && activeEditorState && (
            <CardActionPanel
              card={card}
              selectedCard={selectedCard}
              editorState={activeEditorState}
              fieldFormId={
                activeTab === "fields" && bulkFieldRows.length > 0 ? bulkFieldFormId : undefined
              }
              isActivating={activateCardMutation.isPending}
              actionError={activateCardMutation.error ?? archiveCardMutation.error}
              successMessage={successMessage}
              onActivate={() => activateCardMutation.mutate()}
              onArchive={() => {
                setArchiveTarget(selectedCard);
                setCardFormMode(null);
                setSuccessMessage(null);
              }}
            />
          )}
          <Panel
            title={
              cardFormMode === "create" ? uiText.newCard : card ? card.display_name : uiText.card
            }
          >
            {card && selectedCard ? (
              <div className="card-metadata-panel">
                <dl className="metadata-list">
                  <div>
                    <dt>{uiText.cardTemplate}</dt>
                    <dd>{card.card_template_name ?? card.display_name}</dd>
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
                  error={createBlockInstanceMutation.error ?? archiveBlockInstanceMutation.error}
                />
                <WorkspaceTabs
                  tabs={cardWorkspaceTabs}
                  activeTab={activeTab}
                  ariaLabel={uiText.cardSections}
                  onChange={setActiveTab}
                />
              </div>
            ) : (
              <p className="data-empty">{uiText.noData}</p>
            )}
          </Panel>
          {card && activeTab === "fields" && (
            <Panel title={uiText.cardFields}>
              {bulkFieldRows.length > 0 && (
                <BulkCardValuesForm
                  key={fieldRows.map((field) => field.key).join("|")}
                  card={card}
                  fields={bulkFieldRows}
                  token={token}
                  currentUserId={currentUserId}
                  formId={bulkFieldFormId}
                  onEditorStateChange={handleCardEditorStateChange}
                />
              )}
              {fileRefFieldRows.length > 0 && (
                <div className="field-editor-list">
                  {fileRefFieldRows.map((field) => (
                    <CardFieldEditor key={field.key} cardId={card.id} field={field} token={token} />
                  ))}
                </div>
              )}
              {fieldRows.length === 0 && <p className="data-empty">{uiText.noData}</p>}
            </Panel>
          )}
          {card && activeTab === "attachments" && (
            <CardAttachmentsPanel cardId={card.id} token={token} />
          )}
          {card && activeTab === "documents" && (
            <GeneratedDocumentsPanel cardId={card.id} registryId={card.registry_id} token={token} />
          )}
          {card && activeTab === "links" && <PublicLinksPanel cardId={card.id} token={token} />}
          {card && activeTab === "history" && (
            <Panel title={uiText.cardHistory}>
              <p className="data-empty">{uiText.noData}</p>
            </Panel>
          )}
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
  organizationId: string;
  cardTemplateId: string;
  publicViewEnabled: boolean;
  publicEditEnabled: boolean;
};

function CardActionPanel({
  card,
  selectedCard,
  editorState,
  fieldFormId,
  isActivating,
  actionError,
  successMessage,
  onActivate,
  onArchive,
}: {
  card: CardRead;
  selectedCard: CardSummaryRead;
  editorState: CardEditorPanelState;
  fieldFormId?: string;
  isActivating: boolean;
  actionError?: unknown;
  successMessage?: string | null;
  onActivate: () => void;
  onArchive: () => void;
}) {
  return (
    <div className="card-action-panel" role="group" aria-label={uiText.cardActionPanel}>
      <div className="card-action-status">
        <strong>{card.display_name}</strong>
        <span>{lifecycleStatusLabel(selectedCard.lifecycle_status)}</span>
        {editorState.error && (
          <p className="inline-alert" role="alert">
            {editorState.error}
          </p>
        )}
        {!editorState.error && editorState.isDirty && (
          <p className="inline-alert">{uiText.unsavedCardChanges}</p>
        )}
        {!editorState.error && !editorState.isDirty && editorState.saved && (
          <p className="inline-success">{uiText.cardFieldsSaved}</p>
        )}
        <MutationFeedback error={actionError} successMessage={successMessage} />
      </div>
      <div className="row-actions card-action-buttons">
        {fieldFormId && (
          <button
            type="submit"
            form={fieldFormId}
            className="primary-button"
            disabled={editorState.isPending}
          >
            {editorState.isPending ? uiText.saving : uiText.saveAllFields}
          </button>
        )}
        {selectedCard.lifecycle_status === "draft" && (
          <button
            type="button"
            className="primary-button"
            aria-label={`${uiText.activateCard} ${card.display_name}`}
            disabled={isActivating}
            onClick={onActivate}
          >
            {uiText.activateCard}
          </button>
        )}
        <button
          type="button"
          className="danger-button"
          aria-label={`${uiText.archiveCard} ${card.display_name}`}
          onClick={onArchive}
        >
          {uiText.archive}
        </button>
      </div>
    </div>
  );
}

function CardListFilters({
  cardSearch,
  organizationIds,
  includeDescendantOrganizations,
  includeArchive,
  fieldFilters,
  fields,
  templates,
  templateIds,
  token,
  organizations,
  onSearchChange,
  onOrganizationIdsChange,
  onIncludeDescendantOrganizationsChange,
  onTemplateIdsChange,
  onFieldFiltersChange,
  onIncludeArchiveChange,
}: {
  cardSearch: string;
  organizationIds: string[];
  includeDescendantOrganizations: boolean;
  includeArchive: boolean;
  fieldFilters: CardFieldFilterPayload[];
  fields: FormFieldRead[];
  templates: CardTemplateRead[];
  templateIds: string[];
  token: string;
  organizations: OrganizationRead[];
  onSearchChange: (value: string) => void;
  onOrganizationIdsChange: (value: string[]) => void;
  onIncludeDescendantOrganizationsChange: (value: boolean) => void;
  onTemplateIdsChange: (value: string[]) => void;
  onFieldFiltersChange: (value: CardFieldFilterPayload[]) => void;
  onIncludeArchiveChange: (value: boolean) => void;
}) {
  return (
    <div className="filter-grid">
      <CardTagSearchBar
        token={token}
        textQuery={cardSearch}
        fieldFilters={fieldFilters}
        fields={fields}
        organizations={organizations}
        selectedOrganizationIds={organizationIds}
        includeDescendantOrganizations={includeDescendantOrganizations}
        includeArchive={includeArchive}
        cardTemplates={templates}
        selectedCardTemplateIds={templateIds}
        onTextQueryChange={onSearchChange}
        onFieldFiltersChange={onFieldFiltersChange}
        onSelectedOrganizationIdsChange={onOrganizationIdsChange}
        onIncludeDescendantOrganizationsChange={onIncludeDescendantOrganizationsChange}
        onSelectedCardTemplateIdsChange={onTemplateIdsChange}
        onIncludeArchiveChange={onIncludeArchiveChange}
      />
    </div>
  );
}

function CardMutationForm({
  form,
  organizations,
  templates,
  isSubmitting,
  error,
  onCancel,
  onChange,
  onSubmit,
}: {
  form: CardFormState;
  organizations: OrganizationRead[];
  templates: CardTemplateRead[];
  isSubmitting: boolean;
  error?: unknown;
  onCancel: () => void;
  onChange: (form: CardFormState) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <AdminMutationForm
      title={uiText.createCard}
      submitLabel={uiText.create}
      isSubmitting={isSubmitting}
      error={error}
      onCancel={onCancel}
      onSubmit={onSubmit}
    >
      <label>
        <span>{uiText.cardOrganization}</span>
        <select
          value={form.organizationId}
          onChange={(event) => onChange({ ...form, organizationId: event.currentTarget.value })}
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
        <span>{uiText.cardTemplate}</span>
        <select
          aria-label={uiText.cardTemplate}
          value={form.cardTemplateId}
          onChange={(event) => onChange({ ...form, cardTemplateId: event.currentTarget.value })}
        >
          {templates.length === 0 && <option value="">{uiText.noData}</option>}
          {templates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name}
            </option>
          ))}
        </select>
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

type PublicLinkFormState = {
  expiresInDays: string;
  maxAttachmentUploads: string;
};

function PublicLinksPanel({ cardId, token }: { cardId: string; token: string }) {
  const queryClient = useQueryClient();
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState<PublicLinkFormState>(() => initialPublicLinkForm());
  const [localError, setLocalError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [createdToken, setCreatedToken] = useState<PublicLinkTokenRead | null>(null);
  const [disableTarget, setDisableTarget] = useState<PublicLinkRead | null>(null);

  const publicLinksQuery = useQuery({
    queryKey: ["public-links", token, cardId],
    queryFn: () => listPublicLinks(token, cardId),
    enabled: Boolean(token && cardId),
  });
  const createMutation = useMutation({
    mutationFn: (payload: PublicLinkCreatePayload) => createPublicLink(token, cardId, payload),
    onSuccess: async (created) => {
      setCreatedToken(created);
      setSuccessMessage(uiText.publicLinkCreated);
      setIsCreating(false);
      setForm(initialPublicLinkForm());
      await queryClient.invalidateQueries({ queryKey: ["public-links", token, cardId] });
      await queryClient.invalidateQueries({ queryKey: ["audit-events", token] });
    },
  });
  const disableMutation = useMutation({
    mutationFn: (target: PublicLinkRead) => archivePublicLink(token, target.id),
    onSuccess: async () => {
      setDisableTarget(null);
      setSuccessMessage(uiText.publicLinkDisabled);
      await queryClient.invalidateQueries({ queryKey: ["public-links", token, cardId] });
      await queryClient.invalidateQueries({ queryKey: ["audit-events", token] });
    },
  });

  function openCreateForm() {
    setIsCreating(true);
    setLocalError(null);
    setSuccessMessage(null);
    setCreatedToken(null);
  }

  function handleCreateSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError(null);
    setSuccessMessage(null);
    setCreatedToken(null);
    const payload = buildPublicLinkPayload(form);
    if (typeof payload === "string") {
      setLocalError(payload);
      return;
    }
    createMutation.mutate(payload);
  }

  const items = publicLinksQuery.data?.items ?? [];

  return (
    <Panel title={uiText.publicLinks}>
      <div className="panel-toolbar">
        <button type="button" className="primary-button" onClick={openCreateForm}>
          {uiText.createPublicLink}
        </button>
      </div>
      {isCreating && (
        <div className="panel-form">
          <AdminMutationForm
            title={uiText.createPublicLink}
            submitLabel={uiText.create}
            isSubmitting={createMutation.isPending}
            error={localError ? new Error(localError) : createMutation.error}
            onCancel={() => setIsCreating(false)}
            onSubmit={handleCreateSubmit}
          >
            <label>
              <span>{uiText.publicLinkExpiresInDays}</span>
              <input
                min={1}
                max={30}
                step={1}
                type="number"
                value={form.expiresInDays}
                onChange={(event) => {
                  const expiresInDays = event.currentTarget.value;
                  setForm((current) => ({
                    ...current,
                    expiresInDays,
                  }));
                }}
              />
            </label>
            <label>
              <span>{uiText.publicLinkAttachmentUploadLimit}</span>
              <input
                min={0}
                step={1}
                type="number"
                placeholder={uiText.publicLinkUnlimitedUploads}
                value={form.maxAttachmentUploads}
                onChange={(event) => {
                  const maxAttachmentUploads = event.currentTarget.value;
                  setForm((current) => ({
                    ...current,
                    maxAttachmentUploads,
                  }));
                }}
              />
            </label>
          </AdminMutationForm>
        </div>
      )}
      <MutationFeedback
        error={publicLinksQuery.error ?? disableMutation.error}
        successMessage={successMessage}
      />
      {createdToken && (
        <div className="public-link-token" aria-label={uiText.publicLinkToken}>
          <span>{uiText.publicLinkToken}</span>
          <code>{createdToken.raw_token}</code>
          <label className="public-link-url-control">
            <span>{uiText.publicLinkUrl}</span>
            <input
              aria-label={uiText.publicLinkUrl}
              readOnly
              value={publicLinkEditUrl(createdToken.raw_token)}
            />
          </label>
        </div>
      )}
      {items.length > 0 ? (
        <ul className="public-link-list">
          {items.map((publicLink) => (
            <PublicLinkListItem
              key={publicLink.id}
              publicLink={publicLink}
              isDisabling={disableMutation.isPending}
              onDisable={() => {
                setDisableTarget(publicLink);
                setSuccessMessage(null);
                setLocalError(null);
              }}
            />
          ))}
        </ul>
      ) : (
        <p className="data-empty">
          {publicLinksQuery.isLoading ? uiText.loadingCard : uiText.noData}
        </p>
      )}
      {disableTarget && (
        <AdminMutationDialog title={uiText.disablePublicLink}>
          <div className="archive-confirmation">
            <p>
              {uiText.publicLink}: {shortId(disableTarget.id)}
            </p>
            <p>{uiText.publicLinkDisableConfirmation}</p>
            <div className="admin-mutation-actions">
              <button type="button" className="ghost-button" onClick={() => setDisableTarget(null)}>
                {uiText.cancel}
              </button>
              <button
                type="button"
                className="danger-button"
                disabled={disableMutation.isPending}
                onClick={() => disableMutation.mutate(disableTarget)}
              >
                {disableMutation.isPending ? uiText.saving : uiText.disable}
              </button>
            </div>
          </div>
        </AdminMutationDialog>
      )}
    </Panel>
  );
}

function PublicLinkListItem({
  publicLink,
  isDisabling,
  onDisable,
}: {
  publicLink: PublicLinkRead;
  isDisabling: boolean;
  onDisable: () => void;
}) {
  const statusLabel = publicLinkStatusLabel(publicLink);
  const uploadLimitExhausted =
    publicLink.max_attachment_uploads !== null &&
    publicLink.attachment_upload_count >= publicLink.max_attachment_uploads;
  const canDisable = publicLink.status === "active" && !publicLink.disabled_at;

  return (
    <li>
      <div>
        <strong>{`${uiText.publicLink} ${shortId(publicLink.id)}`}</strong>
        <span>
          {uiText.publicLinkStatus}: {statusLabel}
        </span>
        <span>
          {uiText.expires}: {formatDate(publicLink.expires_at)}
        </span>
        <span>{publicLinkFieldEditUsageLabel(publicLink)}</span>
        <span>{publicLinkAttachmentUsageLabel(publicLink)}</span>
        {uploadLimitExhausted && <span>{uiText.publicLinkUploadLimitExhausted}</span>}
      </div>
      <div className="row-actions">
        {canDisable && (
          <button
            type="button"
            className="ghost-button"
            aria-label={`${uiText.disablePublicLink} ${shortId(publicLink.id)}`}
            disabled={isDisabling}
            onClick={onDisable}
          >
            {uiText.disablePublicLink}
          </button>
        )}
      </div>
    </li>
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
  currentUserId,
  formId,
  onEditorStateChange,
}: {
  card: CardRead;
  fields: EditableCardField[];
  token: string;
  currentUserId: string;
  formId: string;
  onEditorStateChange: (cardId: string, state: CardEditorPanelState) => void;
}) {
  const queryClient = useQueryClient();
  const draftStorageKey = cardDraftStorageKey(currentUserId, card.id);
  const [draftValues, setDraftValues] = useState<Record<string, FieldEditorState>>(() =>
    loadCardDraft(draftStorageKey),
  );
  const [localError, setLocalError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const isDirty = Object.keys(draftValues).length > 0;

  useEffect(() => {
    saveCardDraft(draftStorageKey, draftValues);
  }, [draftStorageKey, draftValues]);

  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        values: fields
          .filter((field) => field.field.field_type !== "static_text")
          .map((field) => ({
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
  const currentError = localError ?? (mutation.error ? errorText(mutation.error) : null);

  useEffect(() => {
    onEditorStateChange(card.id, {
      isDirty,
      isPending: mutation.isPending,
      error: currentError,
      saved,
    });
  }, [card.id, currentError, isDirty, mutation.isPending, onEditorStateChange, saved]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError(null);
    setSaved(false);
    const missingRequiredFields = requiredMissingFieldLabels(fields, draftValues);
    if (missingRequiredFields.length > 0) {
      setLocalError(`${uiText.requiredFields}: ${missingRequiredFields.join(", ")}`);
      return;
    }
    try {
      mutation.mutate();
    } catch (error) {
      setLocalError(errorText(error));
    }
  }

  const fieldGroups = groupedEditableFields(fields);

  return (
    <form
      id={formId}
      aria-label={uiText.bulkFieldValues}
      className="bulk-field-form"
      onSubmit={handleSubmit}
    >
      <header className="bulk-field-header">
        <h4>{uiText.bulkFieldValues}</h4>
      </header>
      <div className="bulk-field-blocks">
        {fieldGroups.map((group) => (
          <section
            key={group.blockId}
            className="bulk-field-block"
            aria-label={`${uiText.formBlock}: ${group.blockLabel}`}
          >
            <header className="bulk-field-block-header">
              <h5>{group.blockLabel}</h5>
            </header>
            {group.rows.map((row) => (
              <div key={row.row} className="bulk-field-grid" style={fieldColumnsStyle(row.columns)}>
                {row.fields.map((field) => (
                  <BulkFieldEditor
                    key={field.key}
                    cardId={card.id}
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
            ))}
          </section>
        ))}
      </div>
      <footer className="card-editor-footer" aria-label={uiText.cardEditorFooter} />
    </form>
  );
}

function BulkFieldEditor({
  cardId,
  field,
  token,
  value,
  onChange,
}: {
  cardId: string;
  field: EditableCardField;
  token: string;
  value: FieldEditorState;
  onChange: (value: FieldEditorState) => void;
}) {
  const isReferenceField =
    field.schema?.options_source_type === "reference_list" &&
    ["select", "multi_select"].includes(field.field.field_type);
  const referenceItemsQuery = useQuery({
    queryKey: ["card-field-reference-items", token, cardId, field.field.field_id],
    queryFn: () => listCardFieldReferenceItems(token, cardId, field.field.field_id),
    enabled: Boolean(token && cardId && isReferenceField),
  });

  if (field.field.field_type === "static_text") {
    return (
      <div
        className={[
          "field-editor-control",
          "field-editor-static-text",
          fieldEditorLayoutClassName(field),
        ]
          .filter(Boolean)
          .join(" ")}
        style={fieldGridSpanStyle(field)}
      >
        <span>{field.label}</span>
        <div className="field-editor-static-text-body">{staticTextContent(field)}</div>
        <small>
          {field.blockLabel} / {field.instanceLabel}
        </small>
      </div>
    );
  }

  return (
    <label
      className={["field-editor-control", fieldEditorLayoutClassName(field)]
        .filter(Boolean)
        .join(" ")}
      style={fieldGridSpanStyle(field)}
    >
      <span>{field.label}</span>
      <div className="field-editor-widget">
        <FieldEditorControl
          fieldType={field.field.field_type}
          label={field.label}
          options={referenceItemsQuery.data?.items ?? []}
          value={value}
          onChange={onChange}
        />
      </div>
      <small>
        {field.blockLabel} / {field.instanceLabel}
      </small>
    </label>
  );
}

function groupedEditableFields(fields: EditableCardField[]) {
  const groups: {
    blockId: string;
    blockLabel: string;
    rows: {
      row: number;
      columns: number;
      fields: EditableCardField[];
    }[];
  }[] = [];
  for (const field of fields) {
    let group = groups.find((item) => item.blockId === field.blockId);
    if (!group) {
      group = {
        blockId: field.blockId,
        blockLabel: field.blockLabel,
        rows: [],
      };
      groups.push(group);
    }
    const rowNumber = fieldLayoutRow(field, group.rows.length + 1);
    let row = group.rows.find((item) => item.row === rowNumber);
    if (!row) {
      row = { row: rowNumber, columns: 1, fields: [] };
      group.rows.push(row);
    }
    row.fields.push(field);
    row.columns = Math.max(row.columns, fieldLayoutColumn(field, 1) + fieldColumnSpan(field) - 1);
  }
  for (const group of groups) {
    group.rows.sort((left, right) => left.row - right.row);
    for (const row of group.rows) {
      row.columns = clampColumns(row.columns);
      row.fields.sort(
        (left, right) =>
          fieldLayoutColumn(left, 1) - fieldLayoutColumn(right, 1) ||
          (left.schema?.position ?? 0) - (right.schema?.position ?? 0),
      );
    }
  }
  return groups;
}

function fieldColumnsStyle(columns: number): CSSProperties {
  return { "--field-editor-columns": String(clampColumns(columns)) } as CSSProperties;
}

function fieldGridSpanStyle(field: EditableCardField): CSSProperties {
  const column = fieldLayoutColumn(field, 1);
  const span = Math.min(fieldColumnSpan(field), maxVisualColumns - column + 1);
  return { "--field-editor-column": `${column} / span ${span}` } as CSSProperties;
}

function fieldEditorLayoutClassName(field: EditableCardField) {
  const labelPosition = displayConfigString(field.schema, "label_position", "top");
  const separatorStyle = displayConfigString(field.schema, "separator_style", "none");
  return [
    `field-editor-control--label-${labelPosition}`,
    separatorStyle !== "none" ? `field-editor-control--separator-${separatorStyle}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function staticTextContent(field: EditableCardField) {
  const value = field.schema?.options_config_json?.static_text;
  return typeof value === "string" && value.trim() ? value : uiText.empty;
}

function displayConfigString(schema: FormFieldRead | null, key: string, fallback: string) {
  const value = schema?.display_config_json?.[key];
  return typeof value === "string" && value.trim() ? value : fallback;
}

function displayConfigNumber(schema: FormFieldRead | null, key: string, fallback: number) {
  const value = schema?.display_config_json?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

const maxVisualColumns = 5;
const maxVisualRows = 50;

function fieldLayoutRow(field: EditableCardField, fallback: number) {
  return Math.min(
    maxVisualRows,
    Math.max(1, displayConfigNumber(field.schema, "layout_row", fallback)),
  );
}

function fieldLayoutColumn(field: EditableCardField, fallback: number) {
  return Math.min(
    maxVisualColumns,
    Math.max(1, displayConfigNumber(field.schema, "layout_column", fallback)),
  );
}

function fieldColumnSpan(field: EditableCardField) {
  return Math.min(
    maxVisualColumns,
    Math.max(1, displayConfigNumber(field.schema, "column_span", 1)),
  );
}

function clampColumns(value: number | null | undefined) {
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.min(maxVisualColumns, Math.max(1, Number(value)));
}

function initialCreateCardForm(organizations: OrganizationRead[]): CardFormState {
  return {
    organizationId: organizations[0]?.id ?? "",
    cardTemplateId: "",
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

function requiredMissingFieldLabels(
  fields: EditableCardField[],
  draftValues: Record<string, FieldEditorState>,
) {
  return fields
    .filter((field) => field.schema?.required_mode === "required")
    .filter((field) => field.field.field_type !== "static_text")
    .filter((field) =>
      isEditorValueEmpty(field.field.field_type, currentBulkValue(field, draftValues)),
    )
    .map((field) => field.label);
}

function isEditorValueEmpty(fieldType: string, value: FieldEditorState) {
  if (fieldType === "bool") {
    return false;
  }
  if (Array.isArray(value)) {
    return value.length === 0;
  }
  if (typeof value === "string") {
    return value.trim() === "";
  }
  return false;
}

function loadCardTabs(): { activeTab: CardShellTab; openCardIds: string[] } {
  try {
    const raw = localStorage.getItem(cardTabsStorageKey);
    if (!raw) {
      return { activeTab: "list", openCardIds: [] };
    }
    const parsed = JSON.parse(raw) as { activeTab?: unknown; openCardIds?: unknown };
    const openCardIds = Array.isArray(parsed.openCardIds)
      ? parsed.openCardIds.filter((item): item is string => typeof item === "string")
      : [];
    const activeTab =
      typeof parsed.activeTab === "string" &&
      (parsed.activeTab === "list" || parsed.activeTab.startsWith("card:"))
        ? (parsed.activeTab as CardShellTab)
        : "list";
    if (activeTab.startsWith("card:") && !openCardIds.includes(activeTab.slice("card:".length))) {
      return { activeTab: "list", openCardIds };
    }
    return { activeTab, openCardIds };
  } catch {
    return { activeTab: "list", openCardIds: [] };
  }
}

function saveCardTabs(state: { activeTab: CardShellTab; openCardIds: string[] }) {
  localStorage.setItem(cardTabsStorageKey, JSON.stringify(state));
}

function cardDraftStorageKey(currentUserId: string, cardId: string) {
  return `reg_engine.card_draft.v1:${currentUserId}:${cardId}`;
}

function loadCardDraft(storageKey: string): Record<string, FieldEditorState> {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, FieldEditorState] => {
        const value = entry[1];
        return (
          typeof value === "string" ||
          typeof value === "boolean" ||
          (Array.isArray(value) && value.every((item) => typeof item === "string"))
        );
      }),
    );
  } catch {
    return {};
  }
}

function saveCardDraft(storageKey: string, draftValues: Record<string, FieldEditorState>) {
  if (Object.keys(draftValues).length === 0) {
    localStorage.removeItem(storageKey);
    return;
  }
  localStorage.setItem(storageKey, JSON.stringify(draftValues));
}

function hasCardDraft(currentUserId: string, cardId: string) {
  return Object.keys(loadCardDraft(cardDraftStorageKey(currentUserId, cardId))).length > 0;
}

function initialPublicLinkForm(): PublicLinkFormState {
  return {
    expiresInDays: "7",
    maxAttachmentUploads: "",
  };
}

function buildPublicLinkPayload(form: PublicLinkFormState): PublicLinkCreatePayload | string {
  const expiresInDays = Number(form.expiresInDays);
  if (!Number.isInteger(expiresInDays) || expiresInDays < 1 || expiresInDays > 30) {
    return uiText.publicLinkExpiresInvalid;
  }

  const maxAttachmentUploadsText = form.maxAttachmentUploads.trim();
  if (!maxAttachmentUploadsText) {
    return {
      expires_in_days: expiresInDays,
      max_attachment_uploads: null,
    };
  }

  const maxAttachmentUploads = Number(maxAttachmentUploadsText);
  if (!Number.isInteger(maxAttachmentUploads) || maxAttachmentUploads < 0) {
    return uiText.publicLinkUploadLimitInvalid;
  }

  return {
    expires_in_days: expiresInDays,
    max_attachment_uploads: maxAttachmentUploads,
  };
}

function publicLinkStatusLabel(publicLink: PublicLinkRead) {
  if (publicLink.disabled_at || publicLink.status === "disabled") {
    return "Отключена";
  }
  if (publicLink.status === "expired" || new Date(publicLink.expires_at) <= new Date()) {
    return "Истекла";
  }
  if (publicLink.status === "active") {
    return "Активна";
  }
  return publicLink.status;
}

function publicLinkEditUrl(rawToken: string) {
  const origin =
    typeof window !== "undefined" && window.location?.origin ? window.location.origin : "";
  return `${origin}/public/edit/${rawToken}`;
}

function publicLinkFieldEditUsageLabel(publicLink: PublicLinkRead) {
  return usageLabel(uiText.publicLinkFieldEditUsage, publicLink.used_count, publicLink.max_uses);
}

function publicLinkAttachmentUsageLabel(publicLink: PublicLinkRead) {
  return usageLabel(
    uiText.publicLinkAttachmentUploadUsage,
    publicLink.attachment_upload_count,
    publicLink.max_attachment_uploads,
  );
}

function usageLabel(label: string, used: number, max: number | null) {
  if (max === null) {
    return `${label}: ${used} / ${uiText.publicLinkUnlimitedUploads}`;
  }
  return `${label}: ${used} из ${max}`;
}

async function invalidateCardQueries(
  queryClient: QueryClient,
  token: string,
  registryId: string,
  cardId: string,
) {
  await queryClient.invalidateQueries({ queryKey: ["cards", token, registryId] });
  await queryClient.invalidateQueries({ queryKey: ["organization-cards", token] });
  await queryClient.invalidateQueries({ queryKey: ["card", token, cardId] });
  await queryClient.invalidateQueries({ queryKey: ["audit-events", token] });
}

type EditableCardField = {
  key: string;
  blockLabel: string;
  blockId: string;
  blockLayoutColumns: number;
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
  const isReferenceField =
    field.schema?.options_source_type === "reference_list" &&
    ["select", "multi_select"].includes(field.field.field_type);
  const referenceItemsQuery = useQuery({
    queryKey: ["card-field-reference-items", token, cardId, field.field.field_id],
    queryFn: () => listCardFieldReferenceItems(token, cardId, field.field.field_id),
    enabled: Boolean(token && cardId && isReferenceField),
  });
  const attachmentsQuery = useQuery({
    queryKey: ["attachments", token, cardId],
    queryFn: () => listAttachments(token, cardId),
    enabled: Boolean(token && cardId && field.field.field_type === "file_ref"),
  });
  const fileRefOptions = useMemo(
    () => buildFileRefOptions(attachmentsQuery.data?.items ?? [], field.field.value),
    [attachmentsQuery.data?.items, field.field.value],
  );
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
          fileRefOptions={fileRefOptions}
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

function buildFileRefOptions(
  attachments: AttachmentRead[],
  currentValue: unknown,
): FieldEditorFileRefOption[] {
  const options = attachments
    .filter((attachment) => !attachment.archived_at)
    .map((attachment) => ({
      id: attachment.id,
      label: attachmentLabel(attachment),
      archived: false,
    }));
  const currentFileRef = fileRefValueFromUnknown(currentValue);
  if (currentFileRef && !options.some((item) => item.id === currentFileRef.attachment_id)) {
    options.push({
      id: currentFileRef.attachment_id,
      label: fileRefLabel(currentFileRef),
      archived: Boolean(currentFileRef.archived_at),
    });
  }
  return options;
}

function attachmentLabel(attachment: AttachmentRead) {
  const title = attachment.title || attachment.original_filename;
  return title === attachment.original_filename
    ? attachment.original_filename
    : `${title} (${attachment.original_filename})`;
}

function fileRefLabel(fileRef: ReturnType<typeof fileRefValueFromUnknown>) {
  if (!fileRef) {
    return uiText.empty;
  }
  return fileRef.title === fileRef.original_filename
    ? fileRef.original_filename
    : `${fileRef.title} (${fileRef.original_filename})`;
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
  const templateFieldIds = card.card_template_id
    ? templateFieldIdSet(
        schema?.templates.find((template) => template.id === card.card_template_id),
      )
    : null;

  return Object.values(card.blocks).flatMap((block) =>
    block.instances.flatMap((instance) =>
      Object.values(instance.fields)
        .filter((field) => !templateFieldIds || templateFieldIds.has(field.field_id))
        .map((field) => {
          const fieldSchema = fieldsById.get(field.field_id) ?? null;
          const blockSchema = blocksById.get(block.block_id);
          return {
            key: `${card.id}:${block.block_id}:${instance.block_instance_id ?? instance.ordinal}:${field.field_id}`,
            blockId: block.block_id,
            blockLabel: blockSchema?.title ?? block.code,
            blockLayoutColumns: blockSchema?.layout_columns ?? 1,
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

function templateFieldIdSet(template: CardTemplateRead | undefined) {
  const fieldIds = template?.field_schema_json?.field_ids;
  if (!Array.isArray(fieldIds) || fieldIds.some((item) => typeof item !== "string")) {
    return null;
  }
  return new Set(fieldIds);
}
