import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type FormEvent } from "react";

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
  CardRead,
  CardSummaryRead,
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
  cardOrganizationId,
  includeArchivedCards,
  onSelectCard,
  onCardSearchChange,
  onCardOrganizationChange,
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
  cardOrganizationId: string;
  includeArchivedCards: boolean;
  onSelectCard: (cardId: string) => void;
  onCardSearchChange: (value: string) => void;
  onCardOrganizationChange: (value: string) => void;
  onIncludeArchivedCardsChange: (value: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const selectedCard = cards.find((item) => item.id === card?.id) ?? null;
  const [cardFormMode, setCardFormMode] = useState<"create" | "edit" | null>(null);
  const [activeTab, setActiveTab] = useState<CardWorkspaceTab>("fields");
  const [openCardIds, setOpenCardIds] = useState<string[]>(() => loadCardTabs().openCardIds);
  const [activeShellTab, setActiveShellTab] = useState<CardShellTab>(
    () => loadCardTabs().activeTab,
  );
  const [dirtyCardIds, setDirtyCardIds] = useState<Set<string>>(() => new Set());
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
        };
      }),
    ],
    [cards, currentUserId, dirtyCardIds, visibleOpenCardIds],
  );
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
  const createCardMutation = useMutation({
    mutationFn: () =>
      createOrganizationCard(token, cardForm.organizationId, {
        display_name: cardForm.displayName.trim(),
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
    setCardForm(initialCreateCardForm(organizations));
    setCardFormMode("create");
    setActiveShellTab("list");
    setActiveTab("fields");
    setArchiveTarget(null);
    setSuccessMessage(null);
    setLocalError(null);
  }

  function openEditForm() {
    if (!card) {
      return;
    }
    setCardForm({
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

  return (
    <div className="stack">
      <WorkspaceTabs
        tabs={cardShellTabs}
        activeTab={activeShellTab}
        ariaLabel={uiText.cardEditorTabs}
        onChange={handleShellTabChange}
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
            organizationId={cardOrganizationId}
            includeArchive={includeArchivedCards}
            organizations={organizations}
            onSearchChange={onCardSearchChange}
            onOrganizationChange={onCardOrganizationChange}
            onIncludeArchiveChange={onIncludeArchivedCardsChange}
          />
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
            onOpen={openCardEditor}
          />
          <MutationFeedback error={archiveCardMutation.error} successMessage={successMessage} />
          {cardFormMode === "create" && (
            <div className="panel-form">
              <CardMutationForm
                mode="create"
                form={cardForm}
                organizations={organizations}
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
          <Panel title={cardFormMode === "create" ? uiText.newCard : card ? card.display_name : uiText.card}>
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
                  {selectedCard.lifecycle_status === "draft" && (
                    <button
                      type="button"
                      className="primary-button"
                      aria-label={`${uiText.activateCard} ${card.display_name}`}
                      disabled={activateCardMutation.isPending}
                      onClick={() => activateCardMutation.mutate()}
                    >
                      {uiText.activateCard}
                    </button>
                  )}
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
                    activateCardMutation.error ??
                    archiveCardMutation.error ??
                    createBlockInstanceMutation.error ??
                    archiveBlockInstanceMutation.error
                  }
                  successMessage={successMessage}
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
                  onDirtyChange={handleCardDirtyChange}
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
  orgUnitId: string;
  displayName: string;
  publicViewEnabled: boolean;
  publicEditEnabled: boolean;
};

function CardListFilters({
  cardSearch,
  organizationId,
  includeArchive,
  organizations,
  onSearchChange,
  onOrganizationChange,
  onIncludeArchiveChange,
}: {
  cardSearch: string;
  organizationId: string;
  includeArchive: boolean;
  organizations: OrganizationRead[];
  onSearchChange: (value: string) => void;
  onOrganizationChange: (value: string) => void;
  onIncludeArchiveChange: (value: boolean) => void;
}) {
  return (
    <div className="filter-grid">
      <label>
        <span>{uiText.cardSearch}</span>
        <input
          placeholder={uiText.cardSearchPlaceholder}
          value={cardSearch}
          onChange={(event) => onSearchChange(event.currentTarget.value)}
        />
      </label>
      <label>
        <span>{uiText.filterByOrganization}</span>
        <select
          value={organizationId}
          onChange={(event) => onOrganizationChange(event.currentTarget.value)}
        >
          <option value="">{uiText.allOrganizations}</option>
          {organizations.map((organization) => (
            <option key={organization.id} value={organization.id}>
              {organization.name}
            </option>
          ))}
        </select>
      </label>
      <label className="checkbox-control">
        <input
          aria-label={uiText.showArchivedCards}
          checked={includeArchive}
          type="checkbox"
          onChange={(event) => onIncludeArchiveChange(event.currentTarget.checked)}
        />
        <span>{uiText.showArchivedCards}</span>
      </label>
    </div>
  );
}

function CardMutationForm({
  mode,
  form,
  organizations,
  isSubmitting,
  error,
  onCancel,
  onChange,
  onSubmit,
}: {
  mode: "create" | "edit";
  form: CardFormState;
  organizations: OrganizationRead[];
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
          <span>
            {uiText.publicLinkUrl}: /public/edit/{createdToken.raw_token}
          </span>
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
  onDirtyChange,
}: {
  card: CardRead;
  fields: EditableCardField[];
  token: string;
  currentUserId: string;
  onDirtyChange: (cardId: string, isDirty: boolean) => void;
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

  useEffect(() => {
    onDirtyChange(card.id, isDirty);
  }, [card.id, isDirty, onDirtyChange]);

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
      onDirtyChange(card.id, false);
      await queryClient.invalidateQueries({ queryKey: ["card", token, card.id] });
      await queryClient.invalidateQueries({ queryKey: ["audit-events", token] });
    },
  });

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
      <footer className="card-editor-footer" aria-label={uiText.cardEditorFooter}>
        {(localError || mutation.error) && (
          <p className="inline-alert">{localError ?? errorText(mutation.error)}</p>
        )}
        {isDirty && !localError && !mutation.error && (
          <p className="inline-alert">{uiText.unsavedCardChanges}</p>
        )}
        {saved && <p className="inline-success">{uiText.cardFieldsSaved}</p>}
      </footer>
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

function initialCreateCardForm(organizations: OrganizationRead[]): CardFormState {
  return {
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

function requiredMissingFieldLabels(
  fields: EditableCardField[],
  draftValues: Record<string, FieldEditorState>,
) {
  return fields
    .filter((field) => field.schema?.required_mode === "required")
    .filter((field) => isEditorValueEmpty(field.field.field_type, currentBulkValue(field, draftValues)))
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
