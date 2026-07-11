import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

import {
  archiveCard,
  archiveCardBlockInstance,
  createOrganizationCard,
  createCardBlockInstance,
  downloadGeneratedDocumentContent,
  generateCardTemplateLayoutDocx,
  generateCardTemplateLayoutPdf,
  listCardFieldReferenceItems,
  listAttachments,
  listCardCreationLinksForCard,
  readCardPresentation,
  readCardPublicAccess,
  updateCardFieldValue,
  updateCardFieldValues,
  updateCardPublicAccess,
} from "@/api/client";
import type {
  CardFieldFilterPayload,
  CardPublicAccessRead,
  CardRead,
  CardSummaryRead,
  CardTemplateRead,
  FieldValuesBulkUpdatePayload,
  FormBlockRead,
  FormFieldRead,
  OrganizationRead,
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
import { DataAlert, Panel, SelectableList, WorkspaceTabs } from "@/components/common/DataSurfaces";
import { errorText, shortId } from "@/components/common/dataUtils";
import { FieldEditorControl, type FieldEditorFileRefOption } from "./FieldEditorControl";
import { CardAttachmentsPanel } from "./CardAttachmentsPanel";
import { CardCreationLinksPanel } from "./CardCreationLinksPanel";
import { CardTagSearchBar } from "./CardTagSearchBar";
import { resolveCardPublicFieldAccess } from "./cardPublicAccessDefaults";
import { FilledCardLayout, type FilledCardBlockInstanceRead } from "./FilledCardLayout";
import { PublicLinkQuickControl } from "./PublicLinkQuickControl";
import {
  type FieldEditorState,
  coerceEditorValue,
  fileRefValueFromUnknown,
  formatValue as formatEditorValue,
  initialEditorValue,
} from "./fieldEditorUtils";
import { useBlockEditor } from "./useBlockEditor";

type CardShellTab = "list" | `card:${string}`;

const cardTabsStorageKey = "reg_engine.card_tabs.v1";

export function CardsWorkspace({
  cards,
  card,
  schema,
  token,
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
  const [cardCreationLinkPanelMode, setCardCreationLinkPanelMode] = useState<
    "create" | "list" | null
  >(null);
  const [cardCreateMenuOpen, setCardCreateMenuOpen] = useState(false);
  const [openCardIds, setOpenCardIds] = useState<string[]>(() => loadCardTabs().openCardIds);
  const [activeShellTab, setActiveShellTab] = useState<CardShellTab>(
    () => loadCardTabs().activeTab,
  );
  const activeShellCardId = activeShellTab.startsWith("card:")
    ? activeShellTab.slice("card:".length)
    : null;
  const activeCardIdRef = useRef<string | null>(activeShellCardId);
  useEffect(() => {
    activeCardIdRef.current = activeShellCardId;
  }, [activeShellCardId]);
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
  const cardPresentationQuery = useQuery({
    queryKey: ["card-presentation", token, card?.id],
    queryFn: () => {
      if (!card) throw new Error(uiText.notFound);
      return readCardPresentation(token, card.id);
    },
    enabled: Boolean(token && card),
  });
  const presentationLayout = cardPresentationQuery.data?.layout ?? null;
  const publicAccessQuery = useQuery({
    queryKey: ["card-public-access", token, card?.id],
    queryFn: () => {
      if (!card) throw new Error(uiText.notFound);
      return readCardPublicAccess(token, card.id);
    },
    enabled: Boolean(token && card),
  });
  const publicAccess = publicAccessQuery.data ?? null;
  const presentationFields = useMemo(
    () => presentationLayout?.structure.fields ?? schema?.fields ?? [],
    [presentationLayout, schema?.fields],
  );
  const presentationBlocks = useMemo(
    () => presentationLayout?.structure.blocks ?? schema?.blocks ?? [],
    [presentationLayout, schema?.blocks],
  );
  const presentationFieldIds = useMemo(
    () =>
      presentationLayout
        ? new Set(presentationLayout.structure.fields.map((field) => field.id))
        : templateFieldIdSet(
            schema?.templates.find((template) => template.id === card?.card_template_id),
          ),
    [card?.card_template_id, presentationLayout, schema?.templates],
  );
  const fieldRows = useMemo(
    () =>
      buildEditableCardFields(card, presentationFields, presentationBlocks, presentationFieldIds),
    [card, presentationBlocks, presentationFieldIds, presentationFields],
  );
  const editableFieldIds = useMemo(
    () =>
      card?.can_manage
        ? new Set(fieldRows.map((field) => field.field.field_id))
        : new Set<string>(),
    [card?.can_manage, fieldRows],
  );
  const saveBlockValues = useCallback(
    async (payload: FieldValuesBulkUpdatePayload) => {
      if (!card) throw new Error(uiText.notFound);
      const cardId = card.id;
      await updateCardFieldValues(token, cardId, payload);
      await invalidateCardQueries(queryClient, token, card.registry_id, cardId);
      if (activeCardIdRef.current === cardId) {
        setSuccessMessage(uiText.cardFieldsSaved);
      }
    },
    [card, queryClient, token],
  );
  const blockEditor = useBlockEditor({
    fields: presentationFields,
    editableFieldIds,
    saveValues: saveBlockValues,
  });
  const cancelBlockEditor = blockEditor.cancel;
  useEffect(() => cancelBlockEditor(), [cancelBlockEditor, card?.id]);
  const fileRefFieldRows = useMemo(
    () => fieldRows.filter((field) => field.field.field_type === "file_ref"),
    [fieldRows],
  );
  const referenceFields = useMemo(() => {
    const unique = new Map<string, FormFieldRead>();
    for (const field of fieldRows) {
      if (
        field.schema?.options_source_type === "reference_list" &&
        ["select", "multi_select"].includes(field.field.field_type)
      ) {
        unique.set(field.schema.id, field.schema);
      }
    }
    return Array.from(unique.values());
  }, [fieldRows]);
  const referenceQueries = useQueries({
    queries: referenceFields.map((field) => ({
      queryKey: ["card-field-reference-items", token, card?.id, field.id],
      queryFn: () => {
        if (!card) throw new Error(uiText.notFound);
        return listCardFieldReferenceItems(token, card.id, field.id);
      },
      enabled: Boolean(token && card),
    })),
  });
  const referenceOptions = useMemo(
    () =>
      Object.fromEntries(
        referenceFields.map((field, index) => [
          field.id,
          referenceQueries[index]?.data?.items ?? [],
        ]),
      ),
    [referenceFields, referenceQueries],
  );
  const cardBlockInstances = useMemo(
    (): FilledCardBlockInstanceRead[] =>
      card
        ? Object.values(card.blocks).flatMap((block) =>
            block.instances.map((instance) => ({ ...instance, block_id: block.block_id })),
          )
        : [],
    [card],
  );
  const completionLabel = cardCompletionLabel(fieldRows);
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
        const isDirty = card?.id === cardId && blockEditor.dirty;
        return {
          id: `card:${cardId}` as CardShellTab,
          label: isDirty ? `${title} *` : title,
          closeLabel: `${uiText.closeCardTab} ${title}`,
        };
      }),
    ],
    [blockEditor.dirty, card?.id, cards, visibleOpenCardIds],
  );
  const repeatableBlocks = useMemo(
    () => presentationBlocks.filter((block) => block.is_active && block.is_repeatable),
    [presentationBlocks],
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
  const createCardMutation = useMutation({
    mutationFn: () =>
      createOrganizationCard(token, cardForm.organizationId, {
        display_name: cardForm.displayName.trim() || undefined,
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
  const archiveCardMutation = useMutation({
    mutationFn: (target: CardSummaryRead) => archiveCard(token, target.id),
    onSuccess: async (archived) => {
      await invalidateCardQueries(queryClient, token, archived.registry_id, archived.id);
      if (activeCardIdRef.current !== archived.id) {
        return;
      }
      setSuccessMessage(uiText.cardArchived);
      setArchiveTarget(null);
      const nextCardId = cards.find((item) => item.id !== archived.id)?.id ?? "";
      setOpenCardIds((current) => current.filter((cardId) => cardId !== archived.id));
      setActiveShellTab("list");
      activeCardIdRef.current = null;
      onSelectCard(nextCardId);
    },
  });
  const updatePublicAccessMutation = useMutation({
    mutationFn: async (payload: Parameters<typeof updateCardPublicAccess>[2]) => {
      if (!card) throw new Error(uiText.notFound);
      return updateCardPublicAccess(token, card.id, payload);
    },
    onSuccess: async (updated) => {
      if (!card) return;
      await queryClient.invalidateQueries({ queryKey: ["card-public-access", token, card.id] });
      await invalidateCardQueries(queryClient, token, card.registry_id, card.id);
      if (activeCardIdRef.current === card.id) {
        setSuccessMessage("Настройки публичного доступа сохранены");
      }
      return updated;
    },
  });
  const createBlockInstanceMutation = useMutation({
    mutationFn: async (blockId: string) => {
      if (!card) {
        throw new Error(uiText.notFound);
      }
      const instance = await createCardBlockInstance(token, card.id, blockId);
      return { instance, registryId: card.registry_id };
    },
    onSuccess: async ({ instance, registryId }) => {
      await invalidateCardQueries(queryClient, token, registryId, instance.card_id);
      if (activeCardIdRef.current === instance.card_id) {
        setSuccessMessage(uiText.blockInstanceCreated);
      }
    },
  });
  const archiveBlockInstanceMutation = useMutation({
    mutationFn: (blockInstanceId: string) => archiveCardBlockInstance(token, blockInstanceId),
    onSuccess: async (instance) => {
      const registryId = cards.find((item) => item.id === instance.card_id)?.registry_id;
      if (registryId) {
        await invalidateCardQueries(queryClient, token, registryId, instance.card_id);
      }
      if (activeCardIdRef.current === instance.card_id) {
        setSuccessMessage(uiText.blockInstanceArchived);
      }
    },
  });
  const selectedCardPrintView = presentationLayout?.print_views[0] ?? null;
  const downloadCardPrintDocxMutation = useMutation({
    mutationFn: async () => {
      if (!card || !selectedCardPrintView) {
        throw new Error("Для шаблона карточки пока нет печатной формы A4.");
      }
      const generated = await generateCardTemplateLayoutDocx(
        token,
        card.id,
        card.card_template_id,
        {
          print_view_id: selectedCardPrintView.id,
          title: selectedCardPrintView.name,
        },
      );
      return {
        cardId: card.id,
        download: await downloadGeneratedDocumentContent(token, generated.document.id),
      };
    },
    onSuccess: ({ cardId, download: { blob, filename } }) => {
      triggerBrowserDownload(blob, filename);
      if (activeCardIdRef.current === cardId) {
        setSuccessMessage("DOCX печатной формы скачан");
      }
    },
  });
  const downloadCardPrintPdfMutation = useMutation({
    mutationFn: async () => {
      if (!card || !selectedCardPrintView) {
        throw new Error("Для шаблона карточки пока нет печатной формы A4.");
      }
      const generated = await generateCardTemplateLayoutPdf(token, card.id, card.card_template_id, {
        print_view_id: selectedCardPrintView.id,
        title: `${selectedCardPrintView.name} PDF`,
      });
      return {
        cardId: card.id,
        download: await downloadGeneratedDocumentContent(token, generated.document.id),
      };
    },
    onSuccess: ({ cardId, download: { blob, filename } }) => {
      triggerBrowserDownload(blob, filename);
      if (activeCardIdRef.current === cardId) {
        setSuccessMessage("PDF печатной формы скачан");
      }
    },
  });

  function resetSelectedCardMutationState() {
    archiveCardMutation.reset();
    createBlockInstanceMutation.reset();
    archiveBlockInstanceMutation.reset();
    downloadCardPrintDocxMutation.reset();
    downloadCardPrintPdfMutation.reset();
  }

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
    setCardCreationLinkPanelMode(null);
    setCardCreateMenuOpen(false);
    setActiveShellTab("list");
    activeCardIdRef.current = null;
    setArchiveTarget(null);
    setSuccessMessage(null);
    setLocalError(null);
    resetSelectedCardMutationState();
  }

  function openCardCreationLinks(mode: "create" | "list") {
    setCardFormMode(null);
    setCardCreationLinkPanelMode(mode);
    setCardCreateMenuOpen(false);
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
    activeCardIdRef.current = cardId;
    setCardFormMode(null);
    setArchiveTarget(null);
    setSuccessMessage(null);
    setLocalError(null);
    resetSelectedCardMutationState();
    onSelectCard(cardId);
  }

  function handleShellTabChange(tabId: CardShellTab) {
    const cardId = tabId.startsWith("card:") ? tabId.slice("card:".length) : null;
    setActiveShellTab(tabId);
    activeCardIdRef.current = cardId;
    setCardFormMode(null);
    setArchiveTarget(null);
    setSuccessMessage(null);
    setLocalError(null);
    resetSelectedCardMutationState();
    if (cardId) {
      onSelectCard(cardId);
    }
  }

  function handleShellTabClose(tabId: CardShellTab) {
    if (!tabId.startsWith("card:")) {
      return;
    }
    const cardId = tabId.slice("card:".length);
    setOpenCardIds((current) => current.filter((openCardId) => openCardId !== cardId));
    setCardFormMode(null);
    setArchiveTarget(null);
    setSuccessMessage(null);
    setLocalError(null);
    resetSelectedCardMutationState();
    if (activeShellTab === tabId) {
      setActiveShellTab("list");
      activeCardIdRef.current = null;
      onSelectCard(cards.find((item) => item.id !== cardId)?.id ?? "");
    }
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
            <div className="card-create-menu">
              <button
                type="button"
                className="primary-button"
                aria-expanded={cardCreateMenuOpen}
                aria-haspopup="menu"
                onClick={() => setCardCreateMenuOpen((current) => !current)}
              >
                {uiText.createCard}
              </button>
              {cardCreateMenuOpen && (
                <div
                  className="card-download-menu-items"
                  role="menu"
                  aria-label="Создание карточек"
                >
                  <button type="button" role="menuitem" onClick={openCreateForm}>
                    Создать карточку
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => openCardCreationLinks("create")}
                  >
                    Создать ссылку на создание карточки
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => openCardCreationLinks("list")}
                  >
                    Список ссылок
                  </button>
                </div>
              )}
            </div>
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
          {cardCreationLinkPanelMode && schema && (
            <CardCreationLinksPanel
              initialMode={cardCreationLinkPanelMode}
              organizations={organizations}
              registryId={schema.registry.id}
              templates={activeCardTemplates}
              token={token}
              onClose={() => setCardCreationLinkPanelMode(null)}
            />
          )}
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
          {card && (
            <>
              {cardPresentationQuery.isLoading && <p>{uiText.loadingCard}</p>}
              <DataAlert error={cardPresentationQuery.error} />
              {presentationLayout ? (
                <FilledCardLayout
                  layout={presentationLayout}
                  blocks={presentationBlocks}
                  fields={presentationFields}
                  blockInstances={cardBlockInstances}
                  values={[]}
                  editableFieldIds={editableFieldIds}
                  blockEditor={blockEditor}
                  referenceOptions={referenceOptions}
                  onEditBlock={() => setSuccessMessage(null)}
                  navigationBefore={[
                    {
                      anchorId: "card-base-block",
                      label: "Базовый блок",
                      state: "neutral",
                      filledCount: 0,
                      totalCount: 0,
                      requiredMissingCount: 0,
                    },
                  ]}
                  navigationAfter={[
                    {
                      anchorId: "card-attachments-block",
                      label: "Вложения",
                      state: "neutral",
                      filledCount: 0,
                      totalCount: 0,
                      requiredMissingCount: 0,
                    },
                  ]}
                  beforeContent={
                    selectedCard ? (
                      <CardBaseBlock
                        card={card}
                        token={token}
                        completionLabel={completionLabel}
                        organizationName={
                          organizationsById.get(card.organization_id)?.name ??
                          shortId(card.organization_id)
                        }
                        fields={presentationFields}
                        canManage={card.can_manage}
                        publicAccess={publicAccess}
                        publicAccessError={publicAccessQuery.error}
                        isUpdatingPublicAccess={updatePublicAccessMutation.isPending}
                        repeatableBlocks={repeatableBlocks}
                        isCreatingBlockInstance={createBlockInstanceMutation.isPending}
                        isArchivingBlockInstance={archiveBlockInstanceMutation.isPending}
                        publicLinkControl={
                          card.can_manage ? (
                            <PublicLinkQuickControl
                              blocks={presentationBlocks}
                              cardId={card.id}
                              fields={presentationFields}
                              layout={presentationLayout}
                              publicAccess={publicAccess}
                              token={token}
                            />
                          ) : null
                        }
                        onPublicAccessChange={(payload) =>
                          updatePublicAccessMutation.mutate(payload)
                        }
                        onAddBlockInstance={(blockId) =>
                          createBlockInstanceMutation.mutate(blockId)
                        }
                        onArchiveBlockInstance={(blockInstanceId) =>
                          archiveBlockInstanceMutation.mutate(blockInstanceId)
                        }
                      />
                    ) : null
                  }
                  afterContent={
                    <>
                      <section
                        id="card-attachments-block"
                        className="card-workspace-following-block"
                      >
                        <CardAttachmentsPanel
                          cardId={card.id}
                          token={token}
                          canManage={card.can_manage}
                        />
                      </section>
                      {card.can_manage ? (
                        <CardWorkspaceFooter
                          card={card}
                          canDownloadPrint={Boolean(selectedCardPrintView)}
                          isDownloading={
                            downloadCardPrintDocxMutation.isPending ||
                            downloadCardPrintPdfMutation.isPending
                          }
                          error={
                            archiveCardMutation.error ??
                            downloadCardPrintDocxMutation.error ??
                            downloadCardPrintPdfMutation.error
                          }
                          onDownloadDocx={() => downloadCardPrintDocxMutation.mutate()}
                          onDownloadPdf={() => downloadCardPrintPdfMutation.mutate()}
                          onArchive={() => {
                            if (!selectedCard) return;
                            setArchiveTarget(selectedCard);
                            setCardFormMode(null);
                            setSuccessMessage(null);
                          }}
                        />
                      ) : null}
                    </>
                  }
                  renderFileRefControl={
                    card.can_manage
                      ? ({ field, blockInstanceId, readValue }) => {
                          const fileRefField = fileRefFieldRows.find(
                            (item) =>
                              item.field.field_id === field.id &&
                              item.blockInstanceId === blockInstanceId,
                          );
                          return fileRefField ? (
                            <CardFieldEditor
                              key={fileRefField.key}
                              cardId={card.id}
                              field={fileRefField}
                              token={token}
                            />
                          ) : (
                            readValue
                          );
                        }
                      : undefined
                  }
                />
              ) : null}
              {!cardPresentationQuery.isLoading &&
                !cardPresentationQuery.error &&
                !presentationLayout && <p className="data-empty">{uiText.noData}</p>}
            </>
          )}
        </div>
      )}
      {archiveTarget && card?.can_manage && (
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
  displayName: string;
  cardTemplateId: string;
  publicViewEnabled: boolean;
  publicEditEnabled: boolean;
};

function CardBaseBlock({
  card,
  token,
  completionLabel,
  organizationName,
  fields,
  canManage,
  publicAccess,
  publicAccessError,
  isUpdatingPublicAccess,
  repeatableBlocks,
  isCreatingBlockInstance,
  isArchivingBlockInstance,
  publicLinkControl,
  onPublicAccessChange,
  onAddBlockInstance,
  onArchiveBlockInstance,
}: {
  card: CardRead;
  token: string;
  completionLabel: string;
  organizationName: string;
  fields: FormFieldRead[];
  canManage: boolean;
  publicAccess: CardPublicAccessRead | null;
  publicAccessError: Error | null;
  isUpdatingPublicAccess: boolean;
  repeatableBlocks: FormBlockRead[];
  isCreatingBlockInstance: boolean;
  isArchivingBlockInstance: boolean;
  publicLinkControl: ReactNode;
  onPublicAccessChange: (payload: Parameters<typeof updateCardPublicAccess>[2]) => void;
  onAddBlockInstance: (blockId: string) => void;
  onArchiveBlockInstance: (blockInstanceId: string) => void;
}) {
  const settingsByFieldId = useMemo(
    () => new Map(publicAccess?.fields.map((setting) => [setting.field_id, setting]) ?? []),
    [publicAccess?.fields],
  );
  const publicFields = fields.filter((field) => field.is_active);
  const publicViewEnabled = publicAccess?.public_view_enabled ?? false;
  const publicEditEnabled = publicAccess?.public_edit_enabled ?? false;

  return (
    <section id="card-base-block" className="card-base-block" aria-label="Базовый блок">
      <header className="card-base-block-header">
        <div>
          <strong>Базовый блок</strong>
          <small>Основная информация и публичный доступ</small>
        </div>
      </header>
      <dl className="metadata-list card-base-block-metadata">
        <div>
          <dt>Карточка</dt>
          <dd>{card.display_name}</dd>
        </div>
        <div>
          <dt>{uiText.organization}</dt>
          <dd>{organizationName}</dd>
        </div>
        <div>
          <dt>{uiText.status}</dt>
          <dd>{completionLabel}</dd>
        </div>
      </dl>
      <CardCreationLinkContinuation cardId={card.id} canManage={canManage} token={token} />
      <div className="card-base-block-public-settings">
        <div className="card-base-block-public-heading">
          <strong>Публичный доступ</strong>
          {canManage ? publicLinkControl : null}
        </div>
        <DataAlert error={publicAccessError} />
        <div className="card-base-toggle-grid">
          <label className="checkbox-control">
            <input
              type="checkbox"
              checked={publicViewEnabled}
              disabled={!canManage || isUpdatingPublicAccess || publicEditEnabled}
              onChange={(event) =>
                onPublicAccessChange({ public_view_enabled: event.currentTarget.checked })
              }
            />
            <span>{uiText.publicViewCard}</span>
          </label>
          <label className="checkbox-control">
            <input
              type="checkbox"
              checked={publicEditEnabled}
              disabled={!canManage || isUpdatingPublicAccess}
              onChange={(event) =>
                onPublicAccessChange({ public_edit_enabled: event.currentTarget.checked })
              }
            />
            <span>{uiText.publicEditCard}</span>
          </label>
        </div>
        {canManage ? (
          <details className="card-base-field-access">
            <summary>Настройки полей для публичной ссылки</summary>
            <div className="card-base-field-access-list">
              {publicFields.map((field) => {
                const setting = settingsByFieldId.get(field.id);
                const { publicEditable: editable, publicVisible: visible } =
                  resolveCardPublicFieldAccess(setting, field.field_type);
                const fieldCanEdit = !["file_ref", "static_text"].includes(field.field_type);
                return (
                  <div key={field.id} className="card-base-field-access-row">
                    <span>{field.label}</span>
                    <label className="checkbox-control">
                      <input
                        type="checkbox"
                        checked={visible}
                        disabled={isUpdatingPublicAccess}
                        onChange={(event) =>
                          onPublicAccessChange({
                            fields: [
                              {
                                field_id: field.id,
                                public_visible: event.currentTarget.checked,
                                public_editable: event.currentTarget.checked && editable,
                              },
                            ],
                          })
                        }
                      />
                      <span>Показывать</span>
                    </label>
                    <label className="checkbox-control">
                      <input
                        type="checkbox"
                        checked={editable}
                        disabled={isUpdatingPublicAccess || !fieldCanEdit}
                        onChange={(event) =>
                          onPublicAccessChange({
                            fields: [
                              {
                                field_id: field.id,
                                public_visible: visible || event.currentTarget.checked,
                                public_editable: event.currentTarget.checked,
                              },
                            ],
                          })
                        }
                      />
                      <span>Разрешить изменение</span>
                    </label>
                  </div>
                );
              })}
            </div>
          </details>
        ) : null}
        {canManage && repeatableBlocks.length > 0 ? (
          <RepeatableBlockControls
            blocks={repeatableBlocks}
            card={card}
            isCreating={isCreatingBlockInstance}
            isArchiving={isArchivingBlockInstance}
            onAdd={onAddBlockInstance}
            onArchive={onArchiveBlockInstance}
          />
        ) : null}
      </div>
    </section>
  );
}

function CardCreationLinkContinuation({
  cardId,
  canManage,
  token,
}: {
  cardId: string;
  canManage: boolean;
  token: string;
}) {
  const linksQuery = useQuery({
    queryKey: ["card-creation-links-for-card", token, cardId],
    queryFn: () => listCardCreationLinksForCard(token, cardId),
    enabled: canManage,
  });
  const item = linksQuery.data?.items[0];
  if (!canManage || !item) return null;
  return (
    <section className="card-created-public-link" aria-label="Ссылка на карточку">
      <strong>Ссылка на карточку</strong>
      <label className="public-link-url-control">
        <span>Продолжить заполнение</span>
        <input readOnly value={`${window.location.origin}/public/edit/${item.child_raw_token}`} />
      </label>
      {linksQuery.error && <p className="inline-alert">{errorText(linksQuery.error)}</p>}
    </section>
  );
}

function CardWorkspaceFooter({
  card,
  canDownloadPrint,
  isDownloading,
  error,
  onDownloadDocx,
  onDownloadPdf,
  onArchive,
}: {
  card: CardRead;
  canDownloadPrint: boolean;
  isDownloading: boolean;
  error: unknown;
  onDownloadDocx: () => void;
  onDownloadPdf: () => void;
  onArchive: () => void;
}) {
  const [downloadOpen, setDownloadOpen] = useState(false);
  return (
    <>
      <section className="card-workspace-footer-panel" aria-label="Скачать карточку">
        <strong>Скачать карточку</strong>
        <div className="row-actions">
          <div className="card-download-menu">
            <button
              type="button"
              className="ghost-button"
              aria-expanded={downloadOpen}
              aria-haspopup="menu"
              disabled={!canDownloadPrint || isDownloading}
              onClick={() => setDownloadOpen((current) => !current)}
            >
              Скачать
            </button>
            {downloadOpen ? (
              <div className="card-download-menu-items" role="menu" aria-label="Формат скачивания">
                <button type="button" role="menuitem" onClick={onDownloadDocx}>
                  DOCX
                </button>
                <button type="button" role="menuitem" onClick={onDownloadPdf}>
                  PDF
                </button>
              </div>
            ) : null}
          </div>
        </div>
        <MutationFeedback error={error} />
      </section>
      <section className="card-workspace-archive-panel" aria-label="Архивирование карточки">
        <strong>Архивирование карточки</strong>
        <p>Архивная карточка остаётся доступной в архиве.</p>
        <button
          type="button"
          className="danger-button"
          aria-label={`${uiText.archiveCard} ${card.display_name}`}
          onClick={onArchive}
        >
          {uiText.archive}
        </button>
      </section>
    </>
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
        <span>{uiText.cardName}</span>
        <input
          aria-label={uiText.cardName}
          value={form.displayName}
          placeholder="Если не указать, будет использовано имя шаблона"
          onChange={(event) => onChange({ ...form, displayName: event.currentTarget.value })}
        />
      </label>
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

function initialCreateCardForm(organizations: OrganizationRead[]): CardFormState {
  return {
    organizationId: organizations[0]?.id ?? "",
    displayName: "",
    cardTemplateId: "",
    publicViewEnabled: true,
    publicEditEnabled: true,
  };
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

function cardCompletionLabel(fields: EditableCardField[]) {
  const requiredFields = fields.filter(
    (field) =>
      field.schema?.is_active &&
      ["required", "required_on_publish"].includes(field.schema.required_mode) &&
      field.field.field_type !== "static_text",
  );
  const completed = requiredFields.filter((field) =>
    isCompletedCardValue(field.field.value),
  ).length;
  return `Обязательные поля: ${completed} из ${requiredFields.length} заполнено`;
}

function isCompletedCardValue(value: unknown) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
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
          hint={field.schema?.description}
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
  fields: FormFieldRead[],
  blocks: FormBlockRead[],
  templateFieldIds: ReadonlySet<string> | null,
): EditableCardField[] {
  if (!card) {
    return [];
  }

  const fieldsById = new Map(fields.map((field) => [field.id, field]));
  const blocksById = new Map(blocks.map((block) => [block.id, block]));

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

function triggerBrowserDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
