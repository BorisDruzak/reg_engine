import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";

import {
  approvePublicLink,
  archivePublicLink,
  createPublicLink,
  getPublicLinkReview,
  listPublicLinks,
  requestPublicLinkChanges,
  startPublicLinkReviewCycle,
} from "@/api/client";
import type {
  FormBlockRead,
  FormFieldRead,
  PublicLinkCreatePayload,
  PublicLinkRead,
  PublicLinkReviewFieldDiffRead,
  PublicLinkTokenRead,
} from "@/api/types";
import { uiText } from "@/app/uiText";
import {
  AdminMutationDialog,
  AdminMutationForm,
  MutationFeedback,
} from "@/components/common/AdminMutation";
import { Panel } from "@/components/common/DataSurfaces";
import { formatDate, shortId } from "@/components/common/dataUtils";

import { formatValue } from "./fieldEditorUtils";

type CreateFormState = {
  expiresInDays: string;
  maxAttachmentUploads: string;
  blockIds: string[];
  fieldIds: string[];
};

export function PublicLinkReviewPanel({
  blocks,
  cardId,
  createFormOpen,
  fields,
  onCreateFormOpenChange,
  token,
}: {
  blocks: FormBlockRead[];
  cardId: string;
  createFormOpen?: boolean;
  fields: FormFieldRead[];
  onCreateFormOpenChange?: (open: boolean) => void;
  token: string;
}) {
  const queryClient = useQueryClient();
  const eligibleFields = useMemo(
    () =>
      fields.filter(
        (field) =>
          field.is_active &&
          field.public_visible &&
          field.public_editable &&
          !["file_ref", "static_text"].includes(field.field_type),
      ),
    [fields],
  );
  const eligibleBlocks = useMemo(() => {
    const fieldBlockIds = new Set(eligibleFields.map((field) => field.block_id));
    return blocks.filter(
      (block) =>
        block.is_active &&
        block.public_visible &&
        block.public_editable &&
        fieldBlockIds.has(block.id),
    );
  }, [blocks, eligibleFields]);
  const defaultForm = useMemo(
    (): CreateFormState => ({
      expiresInDays: "7",
      maxAttachmentUploads: "",
      blockIds: eligibleBlocks.map((block) => block.id),
      fieldIds: eligibleFields
        .filter((field) => eligibleBlocks.some((block) => block.id === field.block_id))
        .map((field) => field.id),
    }),
    [eligibleBlocks, eligibleFields],
  );
  const [internalCreateFormOpen, setInternalCreateFormOpen] = useState(false);
  const isCreating = createFormOpen ?? internalCreateFormOpen;
  const [createForm, setCreateForm] = useState<CreateFormState>(defaultForm);
  const [createPending, setCreatePending] = useState(false);
  const [createError, setCreateError] = useState<unknown>(null);
  const [createdToken, setCreatedToken] = useState<PublicLinkTokenRead | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null);
  const [requestChangesOpen, setRequestChangesOpen] = useState(false);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewCommentError, setReviewCommentError] = useState<string | null>(null);
  const [approvalTarget, setApprovalTarget] = useState<PublicLinkRead | null>(null);
  const [disableTarget, setDisableTarget] = useState<PublicLinkRead | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const publicLinksQuery = useQuery({
    queryKey: ["public-links", token, cardId],
    queryFn: () => listPublicLinks(token, cardId),
    enabled: Boolean(token && cardId),
  });
  const items = publicLinksQuery.data?.items ?? [];
  const selectedReviewLink = items.find((item) => item.id === selectedReviewId) ?? null;
  const reviewQuery = useQuery({
    queryKey: ["public-link-review", token, selectedReviewId],
    queryFn: () => {
      if (!selectedReviewId) throw new Error(uiText.notFound);
      return getPublicLinkReview(token, selectedReviewId);
    },
    enabled: Boolean(selectedReviewId && selectedReviewLink?.status === "submitted"),
  });

  const invalidateLinkQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["public-links", token, cardId] }),
      queryClient.invalidateQueries({ queryKey: ["audit-events", token] }),
    ]);
  };
  const requestChangesMutation = useMutation({
    mutationFn: ({ publicLinkId, comment }: { publicLinkId: string; comment: string }) =>
      requestPublicLinkChanges(token, publicLinkId, comment),
    onSuccess: async () => {
      setRequestChangesOpen(false);
      setReviewComment("");
      setSelectedReviewId(null);
      setSuccessMessage("Карточка возвращена на доработку");
      await invalidateLinkQueries();
    },
  });
  const approveMutation = useMutation({
    mutationFn: (publicLinkId: string) => approvePublicLink(token, publicLinkId),
    onSuccess: async () => {
      setApprovalTarget(null);
      setSelectedReviewId(null);
      setSuccessMessage("Карточка подтверждена, публичный доступ закрыт");
      await invalidateLinkQueries();
    },
  });
  const startReviewMutation = useMutation({
    mutationFn: (publicLinkId: string) => startPublicLinkReviewCycle(token, publicLinkId),
    onSuccess: async () => {
      setSuccessMessage("Цикл проверки начат");
      await invalidateLinkQueries();
    },
  });
  const disableMutation = useMutation({
    mutationFn: (publicLinkId: string) => archivePublicLink(token, publicLinkId),
    onSuccess: async () => {
      setDisableTarget(null);
      setSuccessMessage(uiText.publicLinkDisabled);
      await invalidateLinkQueries();
    },
  });

  function openCreateForm() {
    setCreateForm(defaultForm);
    setCreateError(null);
    setCreatedToken(null);
    setCopyMessage(null);
    setSuccessMessage(null);
    setCreateFormVisibility(true);
  }

  function closeCreateForm() {
    setCreateForm(defaultForm);
    setCreateError(null);
    setCreateFormVisibility(false);
  }

  function setCreateFormVisibility(open: boolean) {
    setInternalCreateFormOpen(open);
    onCreateFormOpenChange?.(open);
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = createPayload(createForm);
    if (typeof payload === "string") {
      setCreateError(new Error(payload));
      return;
    }
    setCreatePending(true);
    setCreateError(null);
    setCreatedToken(null);
    try {
      const created = await createPublicLink(token, cardId, payload);
      setCreatedToken(created);
      setSuccessMessage(uiText.publicLinkCreated);
      setCreateFormVisibility(false);
      setCreateForm(defaultForm);
      await invalidateLinkQueries();
    } catch (error) {
      setCreateError(error);
    } finally {
      setCreatePending(false);
    }
  }

  async function copyCreatedUrl() {
    if (!createdToken) return;
    try {
      await navigator.clipboard.writeText(publicLinkEditUrl(createdToken.raw_token));
      setCopyMessage("Ссылка скопирована");
    } catch {
      setCopyMessage("Не удалось скопировать ссылку");
    }
  }

  function submitChangesRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const comment = reviewComment.trim();
    if (!comment) {
      setReviewCommentError("Введите комментарий для пользователя.");
      return;
    }
    if (!selectedReviewId) return;
    setReviewCommentError(null);
    requestChangesMutation.mutate({ publicLinkId: selectedReviewId, comment });
  }

  const actionError =
    publicLinksQuery.error ??
    reviewQuery.error ??
    requestChangesMutation.error ??
    approveMutation.error ??
    startReviewMutation.error ??
    disableMutation.error;

  return (
    <Panel title={uiText.publicLinks}>
      <div className="panel-toolbar public-link-review-toolbar">
        <button type="button" className="ghost-button" onClick={openCreateForm}>
          Отправить на заполнение
        </button>
      </div>
      <p className="public-link-direct-warning">
        Сохранённые по ссылке значения сразу изменяют карточку. Проверка не применяет отдельную
        копию данных.
      </p>
      {isCreating ? (
        <div className="panel-form public-link-create-form">
          <AdminMutationForm
            title="Отправить на заполнение"
            submitLabel="Создать ссылку"
            isSubmitting={createPending}
            error={createError}
            onCancel={closeCreateForm}
            onSubmit={handleCreate}
          >
            <label>
              <span>{uiText.publicLinkExpiresInDays}</span>
              <input
                aria-label={uiText.publicLinkExpiresInDays}
                min={1}
                max={30}
                step={1}
                type="number"
                value={createForm.expiresInDays}
                onChange={(event) => {
                  const expiresInDays = event.currentTarget.value;
                  setCreateForm((current) => ({
                    ...current,
                    expiresInDays,
                  }));
                }}
              />
            </label>
            <label>
              <span>{uiText.publicLinkAttachmentUploadLimit}</span>
              <input
                aria-label={uiText.publicLinkAttachmentUploadLimit}
                min={0}
                step={1}
                type="number"
                placeholder={uiText.publicLinkUnlimitedUploads}
                value={createForm.maxAttachmentUploads}
                onChange={(event) => {
                  const maxAttachmentUploads = event.currentTarget.value;
                  setCreateForm((current) => ({
                    ...current,
                    maxAttachmentUploads,
                  }));
                }}
              />
            </label>
            <fieldset className="public-link-schema-choice">
              <legend>Доступные блоки и поля</legend>
              {eligibleBlocks.map((block) => {
                const blockFields = eligibleFields.filter((field) => field.block_id === block.id);
                return (
                  <div key={block.id} className="public-link-schema-block-choice">
                    <label className="checkbox-control">
                      <input
                        aria-label={`Блок ${block.title}`}
                        type="checkbox"
                        checked={createForm.blockIds.includes(block.id)}
                        onChange={(event) => {
                          const checked = event.currentTarget.checked;
                          setCreateForm((current) => ({
                            ...current,
                            blockIds: checked
                              ? [...new Set([...current.blockIds, block.id])]
                              : current.blockIds.filter((id) => id !== block.id),
                            fieldIds: checked
                              ? [
                                  ...new Set([
                                    ...current.fieldIds,
                                    ...blockFields.map((field) => field.id),
                                  ]),
                                ]
                              : current.fieldIds.filter(
                                  (id) => !blockFields.some((field) => field.id === id),
                                ),
                          }));
                        }}
                      />
                      <strong>{block.title}</strong>
                    </label>
                    {createForm.blockIds.includes(block.id)
                      ? blockFields.map((field) => (
                          <label
                            key={field.id}
                            className="checkbox-control public-link-field-choice"
                          >
                            <input
                              aria-label={`Поле ${field.label}`}
                              type="checkbox"
                              checked={createForm.fieldIds.includes(field.id)}
                              onChange={(event) => {
                                const checked = event.currentTarget.checked;
                                setCreateForm((current) => ({
                                  ...current,
                                  fieldIds: checked
                                    ? [...new Set([...current.fieldIds, field.id])]
                                    : current.fieldIds.filter((id) => id !== field.id),
                                }));
                              }}
                            />
                            <span>{field.label}</span>
                          </label>
                        ))
                      : null}
                  </div>
                );
              })}
              {eligibleBlocks.length === 0 ? (
                <p className="data-empty">Нет публично редактируемых полей</p>
              ) : null}
            </fieldset>
          </AdminMutationForm>
        </div>
      ) : null}
      <MutationFeedback error={actionError} successMessage={successMessage} />
      {createdToken ? (
        <div className="public-link-token public-link-created-receipt">
          <strong>Ссылка готова к отправке</strong>
          <label className="public-link-url-control">
            <span>{uiText.publicLinkUrl}</span>
            <input
              aria-label={uiText.publicLinkUrl}
              readOnly
              value={publicLinkEditUrl(createdToken.raw_token)}
            />
          </label>
          <div className="row-actions">
            <button type="button" className="primary-button" onClick={copyCreatedUrl}>
              Копировать ссылку
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={() => {
                setCreatedToken(null);
                setCopyMessage(null);
              }}
            >
              Скрыть созданную ссылку
            </button>
          </div>
          {copyMessage ? <p className="inline-success">{copyMessage}</p> : null}
        </div>
      ) : null}
      {items.length > 0 ? (
        <ul className="public-link-list public-link-review-list">
          {items.map((publicLink) => (
            <PublicLinkTimelineItem
              key={publicLink.id}
              isBusy={
                approveMutation.isPending ||
                disableMutation.isPending ||
                startReviewMutation.isPending
              }
              publicLink={publicLink}
              onDisable={() => setDisableTarget(publicLink)}
              onOpenReview={() => {
                setSelectedReviewId(publicLink.id);
                setRequestChangesOpen(false);
                setReviewComment("");
                setReviewCommentError(null);
              }}
              onStartReview={() => startReviewMutation.mutate(publicLink.id)}
            />
          ))}
        </ul>
      ) : (
        <p className="data-empty">
          {publicLinksQuery.isLoading ? uiText.loadingCard : uiText.noData}
        </p>
      )}
      {selectedReviewLink?.status === "submitted" ? (
        <section className="public-link-review-surface" aria-label="Проверка заполнения">
          <header>
            <div>
              <p className="eyebrow">На проверке</p>
              <h3>Проверка заполненной карточки</h3>
            </div>
            <button
              type="button"
              className="ghost-button"
              onClick={() => setSelectedReviewId(null)}
            >
              Закрыть проверку
            </button>
          </header>
          <p className="public-link-direct-warning">
            Изменения уже применены к карточке. Подтверждение только завершит проверку и закроет
            публичный доступ.
          </p>
          {reviewQuery.isLoading ? <p>{uiText.loadingCard}</p> : null}
          {reviewQuery.data ? (
            <ReviewDiff
              blocks={blocks}
              fields={reviewQuery.data.fields}
              attachments={reviewQuery.data.attachments}
            />
          ) : null}
          {requestChangesOpen ? (
            <form className="public-link-comment-form" onSubmit={submitChangesRequest}>
              <label>
                <span>Комментарий для пользователя</span>
                <textarea
                  aria-label="Комментарий для пользователя"
                  maxLength={2000}
                  value={reviewComment}
                  onChange={(event) => {
                    setReviewComment(event.currentTarget.value);
                    setReviewCommentError(null);
                  }}
                />
              </label>
              {reviewCommentError ? (
                <p className="inline-alert" role="alert">
                  {reviewCommentError}
                </p>
              ) : null}
              <div className="row-actions">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => setRequestChangesOpen(false)}
                >
                  {uiText.cancel}
                </button>
                <button
                  type="submit"
                  className="primary-button"
                  disabled={requestChangesMutation.isPending}
                >
                  Отправить замечание
                </button>
              </div>
            </form>
          ) : (
            <div className="row-actions public-link-review-actions">
              <button
                type="button"
                className="ghost-button"
                onClick={() => setRequestChangesOpen(true)}
              >
                Вернуть на доработку
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={() => setApprovalTarget(selectedReviewLink)}
              >
                Подтвердить и закрыть доступ
              </button>
            </div>
          )}
        </section>
      ) : null}
      {approvalTarget ? (
        <AdminMutationDialog title="Подтвердить карточку" onCancel={() => setApprovalTarget(null)}>
          <div className="archive-confirmation">
            <p>
              Все изменения уже сохранены в карточке. После подтверждения публичный доступ будет
              закрыт.
            </p>
            <div className="admin-mutation-actions">
              <button
                type="button"
                className="ghost-button"
                onClick={() => setApprovalTarget(null)}
              >
                {uiText.cancel}
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={approveMutation.isPending}
                onClick={() => approveMutation.mutate(approvalTarget.id)}
              >
                Подтвердить
              </button>
            </div>
          </div>
        </AdminMutationDialog>
      ) : null}
      {disableTarget ? (
        <AdminMutationDialog
          title={uiText.disablePublicLink}
          onCancel={() => setDisableTarget(null)}
        >
          <div className="archive-confirmation">
            <p>{uiText.publicLinkDisableConfirmation}</p>
            <div className="admin-mutation-actions">
              <button type="button" className="ghost-button" onClick={() => setDisableTarget(null)}>
                {uiText.cancel}
              </button>
              <button
                type="button"
                className="danger-button"
                disabled={disableMutation.isPending}
                onClick={() => disableMutation.mutate(disableTarget.id)}
              >
                Отключить
              </button>
            </div>
          </div>
        </AdminMutationDialog>
      ) : null}
    </Panel>
  );
}

function PublicLinkTimelineItem({
  publicLink,
  isBusy,
  onDisable,
  onOpenReview,
  onStartReview,
}: {
  publicLink: PublicLinkRead;
  isBusy: boolean;
  onDisable: () => void;
  onOpenReview: () => void;
  onStartReview: () => void;
}) {
  const canDisable = ["active", "changes_requested", "submitted"].includes(publicLink.status);
  return (
    <li data-testid={`public-link-${publicLink.id}`}>
      <div className="public-link-history-card">
        <header>
          <strong>{`${uiText.publicLink} ${shortId(publicLink.id)}`}</strong>
          <span className={`status-badge status-${publicLink.status}`}>
            {publicLinkStatusLabel(publicLink)}
          </span>
        </header>
        <span>
          {uiText.expires}: {formatDate(publicLink.expires_at)}
        </span>
        <span>
          {usageLabel(uiText.publicLinkFieldEditUsage, publicLink.used_count, publicLink.max_uses)}
        </span>
        <span>
          {usageLabel(
            uiText.publicLinkAttachmentUploadUsage,
            publicLink.attachment_upload_count,
            publicLink.max_attachment_uploads,
          )}
        </span>
        {publicLink.max_attachment_uploads !== null &&
        publicLink.attachment_upload_count >= publicLink.max_attachment_uploads ? (
          <span>{uiText.publicLinkUploadLimitExhausted}</span>
        ) : null}
        <ol
          className="public-link-timeline"
          aria-label={`История ссылки ${shortId(publicLink.id)}`}
        >
          <li>Ссылка создана</li>
          {publicLink.submitted_at ? (
            <li>Отправлена на проверку · {formatDate(publicLink.submitted_at)}</li>
          ) : null}
          {publicLink.status === "changes_requested" ? <li>Возвращена на доработку</li> : null}
          {publicLink.status === "approved" ? <li>Подтверждена</li> : null}
          {publicLink.status === "disabled" ? <li>Отключена администратором</li> : null}
          {publicLink.status === "expired" ? <li>Срок действия истёк</li> : null}
          {publicLink.status === "approved" || publicLink.status === "disabled" ? (
            <li>Доступ закрыт</li>
          ) : null}
        </ol>
      </div>
      <div className="row-actions">
        {publicLink.status === "submitted" ? (
          <button type="button" className="primary-button" disabled={isBusy} onClick={onOpenReview}>
            Открыть проверку
          </button>
        ) : null}
        {publicLink.status === "active" && !publicLink.review_enabled ? (
          <button type="button" className="ghost-button" disabled={isBusy} onClick={onStartReview}>
            Начать цикл проверки
          </button>
        ) : null}
        {canDisable ? (
          <button
            type="button"
            className="ghost-button"
            aria-label={`${uiText.disablePublicLink} ${shortId(publicLink.id)}`}
            disabled={isBusy}
            onClick={onDisable}
          >
            Отключить
          </button>
        ) : null}
      </div>
    </li>
  );
}

function ReviewDiff({
  blocks,
  fields,
  attachments,
}: {
  blocks: FormBlockRead[];
  fields: PublicLinkReviewFieldDiffRead[];
  attachments: {
    attachment_id: string;
    title: string;
    original_filename: string;
    content_length_bytes: number;
    change: "added" | "archived";
  }[];
}) {
  const blockIds = [...new Set(fields.map((field) => field.block_id))];
  return (
    <div className="public-link-review-layout">
      {blockIds.map((blockId) => {
        const block = blocks.find((item) => item.id === blockId);
        return (
          <section key={blockId} className="public-link-review-block">
            <h4>{block?.title ?? "Блок карточки"}</h4>
            <div className="public-link-review-fields">
              {fields
                .filter((field) => field.block_id === blockId)
                .map((field) => {
                  const changed = JSON.stringify(field.before) !== JSON.stringify(field.after);
                  return (
                    <article
                      key={`${field.block_instance_id ?? "base"}:${field.field_id}`}
                      className={changed ? "is-changed" : undefined}
                    >
                      <strong>{field.label}</strong>
                      <span>{`Было: ${formatValue(field.before)}`}</span>
                      <span>{`Стало: ${formatValue(field.after)}`}</span>
                    </article>
                  );
                })}
            </div>
          </section>
        );
      })}
      {attachments.length > 0 ? (
        <section className="public-link-review-block">
          <h4>Вложения</h4>
          <ul>
            {attachments.map((attachment) => (
              <li key={attachment.attachment_id}>
                {attachment.change === "added" ? "Добавлено" : "Удалено"}: {attachment.title} (
                {attachment.original_filename})
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function createPayload(form: CreateFormState): PublicLinkCreatePayload | string {
  const expiresInDays = Number(form.expiresInDays);
  if (!Number.isInteger(expiresInDays) || expiresInDays < 1 || expiresInDays > 30) {
    return uiText.publicLinkExpiresInvalid;
  }
  if (form.blockIds.length === 0 || form.fieldIds.length === 0) {
    return "Выберите хотя бы один публичный блок и поле.";
  }
  const uploadsText = form.maxAttachmentUploads.trim();
  const maxAttachmentUploads = uploadsText ? Number(uploadsText) : null;
  if (
    maxAttachmentUploads !== null &&
    (!Number.isInteger(maxAttachmentUploads) || maxAttachmentUploads < 0)
  ) {
    return uiText.publicLinkUploadLimitInvalid;
  }
  return {
    expires_in_days: expiresInDays,
    max_attachment_uploads: maxAttachmentUploads,
    review_enabled: true,
    allowed_block_ids: form.blockIds,
    allowed_field_ids: form.fieldIds,
  };
}

function publicLinkStatusLabel(publicLink: PublicLinkRead) {
  const labels: Record<PublicLinkRead["status"], string> = {
    active: "Ожидает заполнения",
    submitted: "На проверке",
    changes_requested: "На доработке",
    approved: "Статус: Подтверждена",
    disabled: "Статус: Отключена",
    expired: "Срок истёк",
  };
  return labels[publicLink.status];
}

function publicLinkEditUrl(rawToken: string) {
  const origin =
    typeof window !== "undefined" && window.location?.origin ? window.location.origin : "";
  return `${origin}/public/edit/${rawToken}`;
}

function usageLabel(label: string, used: number, max: number | null) {
  if (max === null) {
    return `${label}: ${used} / ${uiText.publicLinkUnlimitedUploads}`;
  }
  return `${label}: ${used} из ${max}`;
}
