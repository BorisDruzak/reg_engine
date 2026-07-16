import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";

import {
  ApiError,
  getPublicLinkStatus,
  readPublicLinkPreview,
  updatePublicLinkFieldValue,
} from "@/api/client";
import type {
  CardTemplateLayoutRead,
  FormBlockRead,
  FormFieldRead,
  PublicLinkPreviewBlockRead,
  PublicLinkPreviewBlockInstanceRead,
  PublicLinkPreviewFieldRead,
  PublicLinkPreviewRead,
  PublicLinkSafeStatusRead,
} from "@/api/types";
import { formatUiDateTime, instanceLabel, uiText } from "@/app/uiText";
import { BrandMark } from "@/components/common/BrandMark";
import { copyTextToClipboard } from "@/components/common/clipboard";
import { errorText } from "@/components/common/dataUtils";
import { CardLayoutRenderer } from "@/features/cardLayout/CardLayoutRenderer";
import { CardBaseBlockSurface } from "@/features/cards/CardBaseBlockSurface";
import { CardDraftActionRail } from "@/features/cards/CardDraftActionRail";
import { CardPresentationShell } from "@/features/cards/CardPresentationShell";
import type { CardBlockNavigationItem } from "@/features/cards/CardBlockNavigator";
import { FieldEditorControl } from "@/features/cards/FieldEditorControl";
import { buildBlockCompletions, type CompletionResult } from "@/features/cards/cardCompletion";
import {
  type FieldEditorState,
  coerceEditorValue,
  formatValue,
  initialEditorValue,
} from "@/features/cards/fieldEditorUtils";

export function PublicLinkEditPage() {
  const { rawToken = "" } = useParams<{ rawToken: string }>();
  const queryClient = useQueryClient();
  const [lifecycleRefreshing, setLifecycleRefreshing] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<{
    message: string;
    isError: boolean;
  } | null>(null);
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

  async function copyPublicLink() {
    try {
      await copyTextToClipboard(window.location.href);
      setCopyFeedback({ message: "Ссылка скопирована", isError: false });
    } catch {
      setCopyFeedback({ message: "Не удалось скопировать ссылку", isError: true });
    }
  }

  return (
    <main className="public-shell">
      <header className="public-header">
        <div className="brand-lockup">
          <BrandMark />
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
              <div className="public-title-actions">
                <span>
                  {previewQuery.data.expires_at
                    ? `${uiText.expires} ${formatUiDateTime(previewQuery.data.expires_at)}`
                    : "Бессрочная ссылка"}
                </span>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => void copyPublicLink()}
                >
                  Копировать ссылку
                </button>
                {copyFeedback && (
                  <span
                    className={`public-title-copy-status${copyFeedback.isError ? " is-error" : ""}`}
                    role="status"
                  >
                    {copyFeedback.message}
                  </span>
                )}
              </div>
            </header>

            <PublicEditableCard
              onLifecycleDenial={handleLifecycleDenial}
              onPreviewRefresh={() => void previewQuery.refetch()}
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

function PublicEditableCard({
  preview,
  rawToken,
  status,
  onLifecycleDenial,
  onPreviewRefresh,
}: {
  preview: PublicLinkPreviewRead;
  rawToken: string;
  status: PublicLinkSafeStatusRead;
  onLifecycleDenial: (error: unknown) => Promise<boolean>;
  onPreviewRefresh: () => void;
}) {
  const [confirmedFieldValues, setConfirmedFieldValues] = useState(() =>
    publicConfirmedFieldValues(preview),
  );
  const saveFieldValue: PublicFieldValueSaver = ({ fieldId, value, blockInstanceId }) =>
    updatePublicLinkFieldValue(rawToken, fieldId, value, blockInstanceId);
  const baseBlock = (
    <CardBaseBlockSurface
      id="public-card-base-block"
      mode="public"
      organization={{ label: "Организация", value: preview.organization_name }}
      template={{ label: "Шаблон", value: preview.card_template_name }}
      displayName={{ label: "Карточка", value: preview.display_name }}
      publicAccessContent={
        <p className="public-muted">Параметры публичного доступа определяет администратор.</p>
      }
    />
  );
  const navigatorAction = (
    <CardDraftActionRail
      state={preview.lifecycle_status === "active" ? "active" : "draft"}
      aria-label="Статус карточки"
    />
  );

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
        <CardPresentationShell
          items={[]}
          beforeContent={baseBlock}
          navigatorAction={navigatorAction}
        >
          <p className="data-alert">{uiText.noEditablePublicFields}</p>
        </CardPresentationShell>
      ) : (
        <PublicCardLayout
          confirmedFieldValues={confirmedFieldValues}
          onLifecycleDenial={onLifecycleDenial}
          onFieldValueConfirmed={(fieldKey, value) => {
            setConfirmedFieldValues((current) => ({ ...current, [fieldKey]: value }));
            onPreviewRefresh();
          }}
          preview={preview}
          onFieldSaveStateChange={() => undefined}
          saveFieldValue={saveFieldValue}
          beforeContent={baseBlock}
          navigatorAction={navigatorAction}
        />
      )}
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

type PublicCardPreview = Pick<PublicLinkPreviewRead, "form_layout" | "blocks">;

export type PublicFieldValueSaver = (input: {
  fieldId: string;
  value: unknown;
  blockInstanceId: string | null;
}) => Promise<{ value: unknown }>;

export function PublicCardLayout({
  preview,
  onLifecycleDenial,
  onFieldSaveStateChange,
  confirmedFieldValues,
  onFieldValueConfirmed,
  saveFieldValue,
  beforeContent,
  navigatorAction,
}: {
  preview: PublicCardPreview;
  onLifecycleDenial: (error: unknown) => Promise<boolean>;
  onFieldSaveStateChange: (fieldKey: string, saveState: PublicFieldSaveState) => void;
  confirmedFieldValues: Readonly<Record<string, unknown>>;
  onFieldValueConfirmed: (fieldKey: string, value: unknown) => void;
  saveFieldValue: PublicFieldValueSaver;
  beforeContent?: ReactNode;
  navigatorAction?: ReactNode;
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
    <CardPresentationShell
      items={navigationItems}
      beforeContent={beforeContent}
      navigatorAction={navigatorAction}
    >
      <div className="stack public-card-layout-surfaces">
        {surfaces.map((surface) => (
          <PublicCardLayoutSurface
            key={surface.key}
            completions={completionBySurface.get(surface.key)}
            onLifecycleDenial={onLifecycleDenial}
            onFieldSaveStateChange={onFieldSaveStateChange}
            onFieldValueConfirmed={onFieldValueConfirmed}
            saveFieldValue={saveFieldValue}
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

function publicConfirmedFieldValues(preview: PublicCardPreview) {
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
  onLifecycleDenial,
  onFieldSaveStateChange,
  onFieldValueConfirmed,
  saveFieldValue,
  completions,
}: {
  surface: PublicCardSurface;
  onLifecycleDenial: (error: unknown) => Promise<boolean>;
  onFieldSaveStateChange: (fieldKey: string, saveState: PublicFieldSaveState) => void;
  onFieldValueConfirmed: (fieldKey: string, value: unknown) => void;
  saveFieldValue: PublicFieldValueSaver;
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
            ? {
                state: completion.state,
                description:
                  completion.state !== "filled"
                    ? field.description?.trim() || completion.label
                    : completion.label,
              }
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
          if (!context.field.public_editable) {
            return (
              <div className="public-readonly-field-value">
                {publicReadonlyFieldValue(context.field)}
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
              saveFieldValue={saveFieldValue}
            />
          );
        }}
      />
    </section>
  );
}

function publicCardSurfaces(
  preview: PublicCardPreview,
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

function publicCardTemplateLayout(preview: PublicCardPreview): CardTemplateLayoutRead {
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
    ({ field, blockId }, index): FormFieldRead => {
      const publicEditable =
        field.public_editable && !["file_ref", "static_text"].includes(field.field_type);
      return {
        id: field.field_id,
        block_id: blockId,
        code: field.code,
        label: field.label,
        description: field.description,
        field_type: field.field_type,
        position: index,
        required_mode: publicEditable ? field.required_mode : "not_required",
        options_source_type: field.options_source_type,
        options_source_id: field.options_source_id,
        options_config_json: field.options_config_json ?? null,
        display_config_json: field.display_config_json ?? null,
        is_active: true,
        is_list_display: false,
        public_visible: true,
        public_editable: publicEditable,
      };
    },
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

function PublicFieldEditor({
  fieldKey,
  blockInstanceId,
  field,
  onLifecycleDenial,
  onSaveStateChange,
  onSaveConfirmed,
  saveFieldValue,
}: {
  fieldKey: string;
  blockInstanceId: string | null;
  field: PublicLinkPreviewFieldRead;
  onLifecycleDenial: (error: unknown) => Promise<boolean>;
  onSaveStateChange: (fieldKey: string, saveState: PublicFieldSaveState) => void;
  onSaveConfirmed: (fieldKey: string, value: unknown) => void;
  saveFieldValue: PublicFieldValueSaver;
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
        const savedFieldValue = await saveFieldValue({
          fieldId: field.field_id,
          value: pendingSave.value,
          blockInstanceId,
        });
        if (
          mountedRef.current &&
          pendingSave.version === latestVersionRef.current &&
          queuedSaveRef.current === null
        ) {
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

  function flushPendingSave() {
    void drainSaveQueue();
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
      if (!usesDelayedPublicSave(field.field_type)) {
        void drainSaveQueue();
      }
    } catch (error) {
      queuedSaveRef.current = null;
      setLocalError(errorText(error));
      setSaveState("error");
      onSaveStateChange(fieldKey, "error");
    }
  }

  return (
    <div
      className="public-inline-field-control"
      onBlurCapture={(event) => {
        const nextTarget = event.relatedTarget;
        if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
        flushPendingSave();
      }}
    >
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

function usesDelayedPublicSave(fieldType: string) {
  return ["text", "number", "date", "datetime", "json", "work_experience"].includes(fieldType);
}

function publicStaticTextContent(field: PublicLinkPreviewFieldRead) {
  const value = field.options_config_json?.static_text;
  return typeof value === "string" && value.trim() ? value : uiText.empty;
}

function publicReadonlyFieldValue(field: PublicLinkPreviewFieldRead) {
  const optionLabels = new Map(field.options.map((option) => [option.id, option.label]));
  if (Array.isArray(field.value)) {
    return field.value
      .map((value) =>
        typeof value === "string" ? (optionLabels.get(value) ?? value) : formatValue(value),
      )
      .join(", ");
  }
  if (typeof field.value === "string") {
    return optionLabels.get(field.value) ?? field.value;
  }
  return formatValue(field.value);
}
