import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";

import {
  ApiError,
  downloadPublicLinkAttachmentContent,
  getPublicLinkStatus,
  listPublicLinkAttachments,
  readPublicLinkPreview,
  submitPublicLink,
  updatePublicLinkFieldValue,
  uploadPublicLinkAttachment,
} from "@/api/client";
import type {
  CardTemplateLayoutRead,
  FormBlockRead,
  FormFieldRead,
  PublicLinkAttachmentRead,
  PublicLinkPreviewBlockRead,
  PublicLinkPreviewBlockInstanceRead,
  PublicLinkPreviewFieldRead,
  PublicLinkPreviewRead,
  PublicLinkSafeStatusRead,
} from "@/api/types";
import { formatUiDateTime, instanceLabel, uiText } from "@/app/uiText";
import { errorText } from "@/components/common/dataUtils";
import { CardLayoutRenderer } from "@/features/cardLayout/CardLayoutRenderer";
import { CardPresentationShell } from "@/features/cards/CardPresentationShell";
import type { CardBlockNavigationItem } from "@/features/cards/CardBlockNavigator";
import { FieldEditorControl } from "@/features/cards/FieldEditorControl";
import { buildBlockCompletions, type CompletionResult } from "@/features/cards/cardCompletion";
import {
  type FieldEditorState,
  coerceEditorValue,
  initialEditorValue,
} from "@/features/cards/fieldEditorUtils";

export function PublicLinkEditPage() {
  const { rawToken = "" } = useParams<{ rawToken: string }>();
  const queryClient = useQueryClient();
  const [lifecycleRefreshing, setLifecycleRefreshing] = useState(false);
  const statusQuery = useQuery({
    queryKey: ["public-link-status", rawToken],
    queryFn: () => getPublicLinkStatus(rawToken),
    enabled: Boolean(rawToken),
    staleTime: 0,
    refetchOnMount: "always",
  });
  const statusAuthoritative =
    statusQuery.isSuccess &&
    statusQuery.error === null &&
    statusQuery.isFetchedAfterMount &&
    !statusQuery.isFetching &&
    !lifecycleRefreshing;
  const editableStatus =
    statusAuthoritative &&
    statusQuery.data?.can_edit === true &&
    ["active", "changes_requested"].includes(statusQuery.data.status);
  const previewQuery = useQuery({
    queryKey: ["public-link-preview", rawToken],
    queryFn: () => readPublicLinkPreview(rawToken),
    enabled: Boolean(rawToken && editableStatus),
  });

  useEffect(() => {
    if (!rawToken || !statusQuery.data || editableStatus) return;
    void queryClient.cancelQueries({ queryKey: ["public-link-preview", rawToken] });
    void queryClient.cancelQueries({ queryKey: ["public-link-attachments", rawToken] });
    queryClient.removeQueries({ queryKey: ["public-link-preview", rawToken], exact: true });
    queryClient.removeQueries({ queryKey: ["public-link-attachments", rawToken], exact: true });
  }, [editableStatus, queryClient, rawToken, statusQuery.data]);

  async function handleLifecycleDenial(error: unknown) {
    if (!(error instanceof ApiError) || (error.status !== 403 && error.status !== 409)) {
      return false;
    }
    setLifecycleRefreshing(true);
    try {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: ["public-link-preview", rawToken] }),
        queryClient.cancelQueries({ queryKey: ["public-link-attachments", rawToken] }),
      ]);
      queryClient.removeQueries({ queryKey: ["public-link-preview", rawToken], exact: true });
      queryClient.removeQueries({ queryKey: ["public-link-attachments", rawToken], exact: true });
      await statusQuery.refetch();
    } finally {
      setLifecycleRefreshing(false);
    }
    return true;
  }

  return (
    <main className="public-shell">
      <header className="public-header">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true" />
          <div>
            <h1>{uiText.productName}</h1>
            <span>{uiText.publicCardEdit}</span>
          </div>
        </div>
      </header>

      <section className="public-main">
        {!rawToken && <p className="data-alert">{uiText.publicTokenMissing}</p>}
        {statusQuery.error && <p className="data-alert">{errorText(statusQuery.error)}</p>}
        {previewQuery.error && <p className="data-alert">{errorText(previewQuery.error)}</p>}
        {(statusQuery.isFetching || (editableStatus && previewQuery.isLoading)) && (
          <p className="public-muted">{uiText.loadingCard}</p>
        )}

        {editableStatus && statusQuery.data && previewQuery.data && (
          <div className="stack">
            <header className="public-title">
              <div>
                <p className="section-kicker">{uiText.publicCardEdit}</p>
                <h2>Публичное заполнение карточки</h2>
                <h3>{previewQuery.data.display_name}</h3>
              </div>
              <span>
                {uiText.expires} {formatUiDateTime(previewQuery.data.expires_at)}
              </span>
            </header>

            <PublicEditableCard
              onLifecycleDenial={handleLifecycleDenial}
              preview={previewQuery.data}
              rawToken={rawToken}
              status={statusQuery.data}
            />
          </div>
        )}
        {statusAuthoritative && statusQuery.data && !editableStatus && (
          <PublicLinkStatusReceipt status={statusQuery.data} />
        )}
      </section>
    </main>
  );
}

type PublicFieldSaveState = "idle" | "saving" | "saved" | "error";
type PublicAttachmentUploadState = "idle" | "uploading" | "error";

function PublicEditableCard({
  preview,
  rawToken,
  status,
  onLifecycleDenial,
}: {
  preview: PublicLinkPreviewRead;
  rawToken: string;
  status: PublicLinkSafeStatusRead;
  onLifecycleDenial: (error: unknown) => Promise<boolean>;
}) {
  const queryClient = useQueryClient();
  const [fieldSaveStates, setFieldSaveStates] = useState<Record<string, PublicFieldSaveState>>({});
  const [confirmedFieldValues, setConfirmedFieldValues] = useState(() =>
    publicConfirmedFieldValues(preview),
  );
  const [attachmentUploadState, setAttachmentUploadState] =
    useState<PublicAttachmentUploadState>("idle");
  const submitMutation = useMutation({
    mutationFn: () => submitPublicLink(rawToken),
    onSuccess: (nextStatus) => {
      queryClient.setQueryData(["public-link-status", rawToken], nextStatus);
    },
    onError: (error) => {
      void onLifecycleDenial(error);
    },
  });
  const hasUnsavedFields = Object.values(fieldSaveStates).some(
    (saveState) => saveState === "saving" || saveState === "error",
  );
  const hasPendingChanges = hasUnsavedFields || attachmentUploadState !== "idle";

  return (
    <div className="stack">
      {status.status === "changes_requested" && status.review_comment && (
        <section className="data-panel public-review-comment" aria-label="Комментарий проверяющего">
          <p className="section-kicker">Карточка возвращена на доработку</p>
          <h3>Что нужно исправить</h3>
          <p>{status.review_comment}</p>
        </section>
      )}
      {preview.blocks.length === 0 ? (
        <p className="data-alert">{uiText.noEditablePublicFields}</p>
      ) : (
        <PublicCardLayout
          confirmedFieldValues={confirmedFieldValues}
          onLifecycleDenial={onLifecycleDenial}
          onFieldValueConfirmed={(fieldKey, value) =>
            setConfirmedFieldValues((current) => ({ ...current, [fieldKey]: value }))
          }
          preview={preview}
          rawToken={rawToken}
          onFieldSaveStateChange={(fieldKey, saveState) =>
            setFieldSaveStates((current) =>
              current[fieldKey] === saveState ? current : { ...current, [fieldKey]: saveState },
            )
          }
        />
      )}
      <PublicLinkAttachmentsPanel
        onLifecycleDenial={onLifecycleDenial}
        onUploadStateChange={setAttachmentUploadState}
        rawToken={rawToken}
      />
      <section className="data-panel public-submit-panel">
        <div>
          <h3>Проверка заполнения</h3>
          <p className="public-muted">
            После отправки редактирование будет закрыто до решения администратора.
          </p>
        </div>
        <button
          type="button"
          className="primary-button"
          disabled={submitMutation.isPending || hasPendingChanges}
          onClick={() => submitMutation.mutate()}
        >
          {status.status === "changes_requested"
            ? "Повторно отправить на проверку"
            : "Отправить на проверку"}
        </button>
        {hasPendingChanges && <p className="inline-alert">Дождитесь сохранения всех изменений.</p>}
        {submitMutation.error && <p className="inline-alert">{errorText(submitMutation.error)}</p>}
      </section>
    </div>
  );
}

function PublicLinkStatusReceipt({ status }: { status: PublicLinkSafeStatusRead }) {
  const receipt = publicStatusReceipt(status.status);
  return (
    <section className="data-panel public-status-receipt" aria-live="polite">
      <p className="section-kicker">Статус публичной ссылки</p>
      <h2>{receipt.title}</h2>
      <p>{receipt.description}</p>
      {status.submitted_at && <p>Отправлено: {formatUiDateTime(status.submitted_at)}</p>}
      {status.reviewed_at && <p>Рассмотрено: {formatUiDateTime(status.reviewed_at)}</p>}
      {status.completed_public_fields !== null && status.total_public_fields !== null && (
        <p>
          Заполнено полей: {status.completed_public_fields} из {status.total_public_fields}
        </p>
      )}
    </section>
  );
}

function publicStatusReceipt(status: PublicLinkSafeStatusRead["status"]) {
  if (status === "submitted") {
    return {
      title: "Карточка отправлена на проверку",
      description: "Администратор проверит изменения. Редактирование временно закрыто.",
    };
  }
  if (status === "approved") {
    return {
      title: "Заполнение завершено",
      description: "Администратор подтвердил изменения и закрыл доступ к редактированию.",
    };
  }
  if (status === "expired") {
    return {
      title: "Срок действия ссылки истёк",
      description: "Для продолжения запросите у администратора новую публичную ссылку.",
    };
  }
  return {
    title: "Доступ к карточке закрыт",
    description: "Редактирование по этой публичной ссылке больше недоступно.",
  };
}

function PublicCardLayout({
  preview,
  rawToken,
  onLifecycleDenial,
  onFieldSaveStateChange,
  confirmedFieldValues,
  onFieldValueConfirmed,
}: {
  preview: PublicLinkPreviewRead;
  rawToken: string;
  onLifecycleDenial: (error: unknown) => Promise<boolean>;
  onFieldSaveStateChange: (fieldKey: string, saveState: PublicFieldSaveState) => void;
  confirmedFieldValues: Readonly<Record<string, unknown>>;
  onFieldValueConfirmed: (fieldKey: string, value: unknown) => void;
}) {
  const layout = useMemo(() => publicCardTemplateLayout(preview), [preview]);
  const surfaces = useMemo(() => publicCardSurfaces(preview, layout), [layout, preview]);
  const completionBySurface = useMemo(
    () =>
      new Map(
        surfaces.map(
          (surface) =>
            [
              surface.key,
              buildBlockCompletions({
                blocks: surface.layout.structure.blocks,
                fields: surface.layout.structure.fields,
                valueForField: (field) => {
                  const context = surface.fieldsById.get(field.id);
                  return context ? confirmedFieldValue(context, confirmedFieldValues) : undefined;
                },
              }),
            ] as const,
        ),
      ),
    [confirmedFieldValues, surfaces],
  );
  const navigationItems = useMemo<readonly CardBlockNavigationItem[]>(
    () =>
      surfaces.flatMap((surface) => {
        const completions = completionBySurface.get(surface.key);
        return surface.layout.form_layout.sections.flatMap((section) => {
          const blockId = section.block_id;
          const block = blockId
            ? surface.layout.structure.blocks.find((candidate) => candidate.id === blockId)
            : null;
          const completion = blockId ? completions?.blocks.get(blockId) : null;
          if (!block || !completion) return [];
          return [
            {
              anchorId: publicCardBlockAnchorId(surface, block.id),
              label:
                surface.instanceOrdinal === null
                  ? block.title
                  : `${block.title} — ${instanceLabel(surface.instanceOrdinal)}`,
              state: completion.state,
              filledCount: completion.filledCount,
              totalCount: completion.totalCount,
              requiredMissingCount: completion.requiredMissingCount,
            },
          ];
        });
      }),
    [completionBySurface, surfaces],
  );
  return (
    <CardPresentationShell items={navigationItems}>
      <div className="stack public-card-layout-surfaces">
        {surfaces.map((surface) => (
          <PublicCardLayoutSurface
            key={surface.key}
            completions={completionBySurface.get(surface.key)}
            onLifecycleDenial={onLifecycleDenial}
            onFieldSaveStateChange={onFieldSaveStateChange}
            onFieldValueConfirmed={onFieldValueConfirmed}
            rawToken={rawToken}
            surface={surface}
          />
        ))}
      </div>
    </CardPresentationShell>
  );
}

type PublicFieldContext = {
  blockId: string;
  blockInstanceId: string | null;
  field: PublicLinkPreviewFieldRead;
  instanceOrdinal: number;
};

type PublicCardSurface = {
  key: string;
  instanceOrdinal: number | null;
  layout: CardTemplateLayoutRead;
  fieldsById: Map<string, PublicFieldContext>;
};

function publicFieldKey({ blockInstanceId, instanceOrdinal, field }: PublicFieldContext) {
  return `${blockInstanceId ?? instanceOrdinal}:${field.field_id}`;
}

function publicConfirmedFieldValues(preview: PublicLinkPreviewRead) {
  return Object.fromEntries(
    preview.blocks.flatMap((block) =>
      block.instances.flatMap((instance) =>
        instance.fields.map((field) => [
          `${instance.block_instance_id ?? instance.ordinal}:${field.field_id}`,
          field.value,
        ]),
      ),
    ),
  ) as Record<string, unknown>;
}

function confirmedFieldValue(
  context: PublicFieldContext,
  confirmedFieldValues: Readonly<Record<string, unknown>>,
) {
  const key = publicFieldKey(context);
  return Object.prototype.hasOwnProperty.call(confirmedFieldValues, key)
    ? confirmedFieldValues[key]
    : context.field.value;
}

function publicCardBlockAnchorId(surface: PublicCardSurface, blockId: string) {
  return `card-block-${surface.key}-${blockId}`;
}

function PublicCardLayoutSurface({
  surface,
  rawToken,
  onLifecycleDenial,
  onFieldSaveStateChange,
  onFieldValueConfirmed,
  completions,
}: {
  surface: PublicCardSurface;
  rawToken: string;
  onLifecycleDenial: (error: unknown) => Promise<boolean>;
  onFieldSaveStateChange: (fieldKey: string, saveState: PublicFieldSaveState) => void;
  onFieldValueConfirmed: (fieldKey: string, value: unknown) => void;
  completions: CompletionResult | undefined;
}) {
  return (
    <section className="public-card-layout-surface">
      {surface.instanceOrdinal !== null && (
        <header className="public-repeatable-instance-header">
          <h3>{instanceLabel(surface.instanceOrdinal)}</h3>
        </header>
      )}
      <CardLayoutRenderer
        layout={surface.layout}
        mode="public-edit"
        fieldPresentationLayout="inline"
        responsive
        testIdPrefix={surface.key === "primary" ? "public" : `public-${surface.key}`}
        blockPresentation={({ block }) => {
          if (!block) return undefined;
          const completion = completions?.blocks.get(block.id);
          return completion
            ? {
                anchorId: publicCardBlockAnchorId(surface, block.id),
                state: completion.state,
                description: completion.label,
              }
            : undefined;
        }}
        fieldPresentation={({ field }) => {
          const completion = completions?.fields.get(field.id);
          return completion
            ? { state: completion.state, description: completion.label }
            : undefined;
        }}
        renderFieldValue={({ field }) => {
          const context = surface.fieldsById.get(field.id);
          if (!context) return uiText.empty;
          if (context.field.field_type === "file_ref") {
            return <span className="public-muted">Редактирование файла недоступно</span>;
          }
          if (context.field.field_type === "static_text") {
            return (
              <div className="field-editor-static-text-body">
                {publicStaticTextContent(context.field)}
              </div>
            );
          }
          return (
            <PublicFieldEditor
              key={`${context.blockInstanceId ?? context.instanceOrdinal}:${context.field.field_id}`}
              fieldKey={publicFieldKey(context)}
              blockInstanceId={context.blockInstanceId}
              field={context.field}
              onLifecycleDenial={onLifecycleDenial}
              onSaveConfirmed={onFieldValueConfirmed}
              onSaveStateChange={onFieldSaveStateChange}
              rawToken={rawToken}
            />
          );
        }}
      />
    </section>
  );
}

function publicCardSurfaces(
  preview: PublicLinkPreviewRead,
  layout: CardTemplateLayoutRead,
): PublicCardSurface[] {
  const previewBlocksById = new Map(preview.blocks.map((block) => [block.block_id, block]));
  const primarySections = layout.form_layout.sections.filter(
    (section) => !section.block_id || !previewBlocksById.get(section.block_id)?.is_repeatable,
  );
  const surfaces: PublicCardSurface[] = [];

  if (primarySections.length > 0) {
    const primaryBlockIds = new Set(
      primarySections.map((section) => section.block_id).filter(Boolean),
    );
    surfaces.push({
      key: "primary",
      instanceOrdinal: null,
      layout: publicLayoutWithSections(layout, primarySections),
      fieldsById: publicFieldsForInstances(
        preview.blocks
          .filter((block) => primaryBlockIds.has(block.block_id))
          .flatMap((block) => block.instances.slice(0, 1).map((instance) => ({ block, instance }))),
      ),
    });
  }

  for (const block of preview.blocks) {
    if (!block.is_repeatable) continue;
    const section = layout.form_layout.sections.find(
      (candidate) => candidate.block_id === block.block_id,
    );
    if (!section) continue;
    for (const instance of block.instances) {
      if (!instance.block_instance_id) continue;
      surfaces.push({
        key: `instance-${instance.block_instance_id}`,
        instanceOrdinal: instance.ordinal,
        layout: publicLayoutWithSections(layout, [
          { ...section, id: `${section.id}-${instance.block_instance_id}` },
        ]),
        fieldsById: publicFieldsForInstances([{ block, instance }]),
      });
    }
  }

  return surfaces;
}

function publicLayoutWithSections(
  layout: CardTemplateLayoutRead,
  sections: CardTemplateLayoutRead["form_layout"]["sections"],
): CardTemplateLayoutRead {
  const blockIds = new Set(sections.map((section) => section.block_id).filter(Boolean));
  return {
    ...layout,
    structure: {
      blocks: layout.structure.blocks.filter((block) => blockIds.has(block.id)),
      fields: layout.structure.fields.filter((field) => blockIds.has(field.block_id)),
    },
    form_layout: { ...layout.form_layout, sections },
  };
}

function publicFieldsForInstances(
  entries: Array<{
    block: PublicLinkPreviewBlockRead;
    instance: PublicLinkPreviewBlockInstanceRead;
  }>,
) {
  const result = new Map<string, PublicFieldContext>();
  for (const { block, instance } of entries) {
    for (const field of instance.fields) {
      result.set(field.field_id, {
        blockId: block.block_id,
        blockInstanceId: instance.block_instance_id,
        field,
        instanceOrdinal: instance.ordinal,
      });
    }
  }
  return result;
}

function publicCardTemplateLayout(preview: PublicLinkPreviewRead): CardTemplateLayoutRead {
  const blocks: FormBlockRead[] = preview.blocks.map((block, index) => ({
    id: block.block_id,
    registry_id: "public",
    code: block.code,
    title: block.title,
    description: null,
    position: index,
    is_repeatable: block.is_repeatable,
    is_active: true,
    public_visible: true,
    public_editable: true,
    layout_columns: block.layout_columns ?? 12,
    display_config_json: block.display_config_json ?? null,
  }));
  const fields = [...publicPreviewFieldsById(preview.blocks).values()].map(
    ({ field, blockId }, index): FormFieldRead => ({
      id: field.field_id,
      block_id: blockId,
      code: field.code,
      label: field.label,
      description: null,
      field_type: field.field_type,
      position: index,
      required_mode: field.required_mode,
      options_source_type: field.options_source_type,
      options_source_id: field.options_source_id,
      options_config_json: field.options_config_json ?? null,
      display_config_json: field.display_config_json ?? null,
      is_active: true,
      is_list_display: false,
      public_visible: true,
      public_editable: field.field_type !== "file_ref" && field.field_type !== "static_text",
    }),
  );
  return {
    version: "card_template_layout_v1",
    revision: "public-preview",
    card_template_id: "public",
    registry_id: "public",
    structure: { blocks, fields },
    form_layout: preview.form_layout,
    print_views: [],
    export_settings: { output_filename_template: "card", formats: [] },
    sync_status: { has_errors: false, errors: [], warnings: [], mapping: {} },
  };
}

function publicPreviewFieldsById(blocks: PublicLinkPreviewBlockRead[]) {
  const result = new Map<
    string,
    {
      blockId: string;
      blockInstanceId: string | null;
      field: PublicLinkPreviewFieldRead;
      instanceOrdinal: number;
    }
  >();
  for (const block of blocks) {
    for (const instance of block.instances) {
      for (const field of instance.fields) {
        if (!result.has(field.field_id)) {
          result.set(field.field_id, {
            blockId: block.block_id,
            blockInstanceId: instance.block_instance_id,
            field,
            instanceOrdinal: instance.ordinal,
          });
        }
      }
    }
  }
  return result;
}

function PublicLinkAttachmentsPanel({
  rawToken,
  onLifecycleDenial,
  onUploadStateChange,
}: {
  rawToken: string;
  onLifecycleDenial: (error: unknown) => Promise<boolean>;
  onUploadStateChange: (state: PublicAttachmentUploadState) => void;
}) {
  const queryClient = useQueryClient();
  const formRef = useRef<HTMLFormElement>(null);
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const attachmentsQuery = useQuery({
    queryKey: ["public-link-attachments", rawToken],
    queryFn: () => listPublicLinkAttachments(rawToken),
    enabled: Boolean(rawToken),
  });
  useEffect(() => {
    if (attachmentsQuery.error) {
      void onLifecycleDenial(attachmentsQuery.error);
    }
  }, [attachmentsQuery.error, onLifecycleDenial]);
  const canUploadAttachments = attachmentsQuery.data?.can_upload_attachments ?? true;
  const uploadMutation = useMutation({
    mutationFn: () => {
      if (!file) {
        throw new Error(uiText.selectFile);
      }
      return uploadPublicLinkAttachment(rawToken, { file, title });
    },
    onMutate: () => onUploadStateChange("uploading"),
    onSuccess: async () => {
      onUploadStateChange("idle");
      setMessage(uiText.fileUploaded);
      setLocalError(null);
      setTitle("");
      setFile(null);
      formRef.current?.reset();
      await queryClient.invalidateQueries({ queryKey: ["public-link-attachments", rawToken] });
    },
    onError: (error) => {
      onUploadStateChange("error");
      setLocalError(errorText(error));
      void onLifecycleDenial(error);
    },
  });
  const downloadMutation = useMutation({
    mutationFn: (attachment: PublicLinkAttachmentRead) =>
      downloadPublicLinkAttachmentContent(rawToken, attachment.id),
    onSuccess: ({ blob, filename }) => {
      triggerBrowserDownload(blob, filename);
      setMessage(uiText.fileDownloaded);
      setLocalError(null);
    },
    onError: (error) => {
      setLocalError(errorText(error));
      void onLifecycleDenial(error);
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canUploadAttachments) {
      setMessage(null);
      setLocalError(uiText.publicLinkUploadLimitExhausted);
      return;
    }
    if (!file) {
      setMessage(null);
      setLocalError(uiText.selectFile);
      return;
    }
    uploadMutation.mutate();
  }

  return (
    <section className="data-panel">
      <header>
        <h3>{uiText.attachments}</h3>
      </header>
      <form ref={formRef} className="attachment-form" onSubmit={handleSubmit}>
        <label className="field-editor-control">
          <span>{uiText.fileTitle}</span>
          <input
            disabled={!canUploadAttachments}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <label className="field-editor-control">
          <span>{uiText.file}</span>
          <input
            aria-label={uiText.file}
            disabled={!canUploadAttachments}
            type="file"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setLocalError(null);
              if (!uploadMutation.isPending) {
                onUploadStateChange("idle");
              }
            }}
          />
        </label>
        <button
          type="submit"
          className="primary-button"
          disabled={uploadMutation.isPending || !canUploadAttachments}
        >
          {uiText.uploadFile}
        </button>
      </form>
      {attachmentsQuery.data && !attachmentsQuery.data.can_upload_attachments && (
        <p className="inline-alert attachment-status">{uiText.publicLinkUploadLimitExhausted}</p>
      )}
      {message && <p className="inline-success attachment-status">{message}</p>}
      {localError && <p className="inline-alert attachment-status">{localError}</p>}
      {attachmentsQuery.error && <p className="data-alert">{errorText(attachmentsQuery.error)}</p>}
      <PublicAttachmentList
        items={attachmentsQuery.data?.items ?? []}
        downloadingId={downloadMutation.isPending ? (downloadMutation.variables?.id ?? null) : null}
        onDownload={(attachment) => downloadMutation.mutate(attachment)}
      />
    </section>
  );
}

function PublicAttachmentList({
  items,
  downloadingId,
  onDownload,
}: {
  items: PublicLinkAttachmentRead[];
  downloadingId: string | null;
  onDownload: (attachment: PublicLinkAttachmentRead) => void;
}) {
  if (items.length === 0) {
    return <p className="data-empty">{uiText.noFiles}</p>;
  }

  return (
    <ul className="file-action-list">
      {items.map((attachment) => {
        const title = attachment.title || attachment.original_filename;
        return (
          <li key={attachment.id}>
            <div>
              <strong>{title}</strong>
              <span>
                {attachment.original_filename} / {formatBytes(attachment.content_length_bytes)} /{" "}
                {scannerStatusLabel(attachment.scanner_status)} /{" "}
                {formatUiDateTime(attachment.created_at)}
              </span>
            </div>
            <div className="row-actions">
              <button
                type="button"
                className="ghost-button"
                aria-label={`${uiText.download} файл ${title}`}
                disabled={downloadingId === attachment.id}
                onClick={() => onDownload(attachment)}
              >
                {uiText.download}
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function PublicFieldEditor({
  rawToken,
  fieldKey,
  blockInstanceId,
  field,
  onLifecycleDenial,
  onSaveStateChange,
  onSaveConfirmed,
}: {
  rawToken: string;
  fieldKey: string;
  blockInstanceId: string | null;
  field: PublicLinkPreviewFieldRead;
  onLifecycleDenial: (error: unknown) => Promise<boolean>;
  onSaveStateChange: (fieldKey: string, saveState: PublicFieldSaveState) => void;
  onSaveConfirmed: (fieldKey: string, value: unknown) => void;
}) {
  const [rawValue, setRawValue] = useState<FieldEditorState>(() => initialEditorValue(field));
  const [localError, setLocalError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const latestVersionRef = useRef(0);
  const queuedSaveRef = useRef<{ value: unknown; version: number } | null>(null);
  const savingRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  async function drainSaveQueue() {
    if (savingRef.current) return;
    savingRef.current = true;

    while (queuedSaveRef.current) {
      const pendingSave = queuedSaveRef.current;
      queuedSaveRef.current = null;
      try {
        const savedFieldValue = await updatePublicLinkFieldValue(
          rawToken,
          field.field_id,
          pendingSave.value,
          blockInstanceId,
        );
        if (
          mountedRef.current &&
          pendingSave.version === latestVersionRef.current &&
          queuedSaveRef.current === null
        ) {
          setRawValue(
            initialEditorValue({ field_type: field.field_type, value: savedFieldValue.value }),
          );
          setLocalError(null);
          setSaveState("saved");
          onSaveStateChange(fieldKey, "saved");
          onSaveConfirmed(fieldKey, savedFieldValue.value);
        }
      } catch (error) {
        void onLifecycleDenial(error);
        if (
          mountedRef.current &&
          pendingSave.version === latestVersionRef.current &&
          queuedSaveRef.current === null
        ) {
          setLocalError(errorText(error));
          setSaveState("error");
          onSaveStateChange(fieldKey, "error");
        }
      }
    }

    savingRef.current = false;
  }

  function updateRawValue(nextValue: FieldEditorState) {
    setRawValue(nextValue);
    setLocalError(null);
    const version = latestVersionRef.current + 1;
    latestVersionRef.current = version;
    try {
      queuedSaveRef.current = {
        value: coerceEditorValue(field.field_type, nextValue),
        version,
      };
      setSaveState("saving");
      onSaveStateChange(fieldKey, "saving");
      void drainSaveQueue();
    } catch (error) {
      queuedSaveRef.current = null;
      setLocalError(errorText(error));
      setSaveState("error");
      onSaveStateChange(fieldKey, "error");
    }
  }

  return (
    <div className="public-inline-field-control">
      <FieldEditorControl
        fieldType={field.field_type}
        label={field.label}
        hint={field.description}
        options={field.options}
        value={rawValue}
        onChange={updateRawValue}
      />
      {saveState === "saving" && <p className="public-muted">Сохранение…</p>}
      {localError && <p className="inline-alert">{localError}</p>}
      {saveState === "saved" && <p className="inline-success">Все изменения сохранены</p>}
    </div>
  );
}

function publicStaticTextContent(field: PublicLinkPreviewFieldRead) {
  const value = field.options_config_json?.static_text;
  return typeof value === "string" && value.trim() ? value : uiText.empty;
}

function formatBytes(value: number) {
  if (value < 1024) {
    return `${value} Б`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} КБ`;
  }
  return `${(value / (1024 * 1024)).toFixed(1)} МБ`;
}

function scannerStatusLabel(value: string) {
  if (value === "deferred") {
    return uiText.scannerDeferred;
  }
  return value;
}

function triggerBrowserDownload(blob: Blob, filename: string) {
  if (typeof document === "undefined" || typeof window.URL.createObjectURL !== "function") {
    return;
  }
  const href = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  try {
    link.click();
  } catch {
    // Test and embedded browser environments can block programmatic downloads.
  } finally {
    if (typeof window.URL.revokeObjectURL === "function") {
      window.URL.revokeObjectURL(href);
    }
  }
}
