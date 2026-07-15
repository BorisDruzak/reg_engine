import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { createOrganizationCardDraft, getCardCreationPreview } from "@/api/client";
import type {
  CardCreationPreviewFieldRead,
  CardPublicAccessPayload,
  CardPublicAccessRead,
  CardTemplateRead,
  FormFieldRead,
  OrganizationRead,
} from "@/api/types";
import { DataAlert } from "@/components/common/DataSurfaces";
import { errorText } from "@/components/common/dataUtils";

import { FieldEditorControl } from "./FieldEditorControl";
import type { CardBlockNavigationItem } from "./CardBlockNavigator";
import { CardBaseBlockSurface } from "./CardBaseBlockSurface";
import { CardDraftActionRail } from "./CardDraftActionRail";
import { CardPresentationShell } from "./CardPresentationShell";
import { PublicAccessFieldPicker } from "./PublicAccessFieldPicker";
import { buildBlockCompletions } from "./cardCompletion";
import { type FieldEditorState, coerceEditorValue, initialEditorValue } from "./fieldEditorUtils";

type CreationState = {
  organizationId: string;
  templateId: string;
  displayName: string;
  values: Record<string, FieldEditorState>;
  publicAccess: CardPublicAccessPayload;
};

export function SingleStageCardCreation({
  token,
  organizations,
  templates,
  schemaFields,
  onCancel,
  onCardCreated,
}: {
  token: string;
  organizations: OrganizationRead[];
  templates: CardTemplateRead[];
  schemaFields: readonly FormFieldRead[];
  onCancel: () => void;
  onCardCreated: (cardId: string) => Promise<void>;
}) {
  const [state, setState] = useState<CreationState>({
    organizationId: "",
    templateId: templates.length === 1 ? templates[0].id : "",
    displayName: "",
    values: {},
    publicAccess: {
      public_view_enabled: true,
      public_edit_enabled: true,
      fields: [],
    },
  });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const templateId = state.templateId || (templates.length === 1 ? templates[0].id : "");
  const canLoadPreview = Boolean(state.organizationId && templateId);
  const previewQuery = useQuery({
    queryKey: ["card-creation-preview", token, state.organizationId, templateId],
    queryFn: () => getCardCreationPreview(token, state.organizationId, templateId),
    enabled: canLoadPreview,
  });
  const preview = previewQuery.data ?? null;
  const creationFields = useMemo(
    () => preview?.blocks.flatMap((block) => block.fields) ?? [],
    [preview?.blocks],
  );
  const publicAccessFields = useMemo(() => {
    const previewFieldIds = new Set(creationFields.map((field) => field.field_id));
    return schemaFields.filter((field) => previewFieldIds.has(field.id));
  }, [creationFields, schemaFields]);
  const publicAccess = useMemo<CardPublicAccessRead>(
    () => ({
      card_id: "",
      public_view_enabled: state.publicAccess.public_view_enabled ?? true,
      public_edit_enabled: state.publicAccess.public_edit_enabled ?? true,
      fields: state.publicAccess.fields ?? [],
    }),
    [state.publicAccess],
  );
  const completions = useMemo(() => {
    const previewBlocks = preview?.blocks ?? [];
    const fieldsById = new Map(
      previewBlocks.flatMap((block) => block.fields.map((field) => [field.field_id, field])),
    );
    return buildBlockCompletions({
      blocks: previewBlocks.map((block) => ({ id: block.block_id, title: block.title })),
      fields: previewBlocks.flatMap((block) =>
        block.fields.map((field) => ({
          id: field.field_id,
          block_id: block.block_id,
          field_type: field.field_type,
          required_mode: field.required_mode,
        })),
      ),
      valueForField: (field) => {
        const previewField = fieldsById.get(field.id);
        return previewField
          ? creationValueForCompletion(previewField, state.values[field.id])
          : null;
      },
    });
  }, [preview?.blocks, state.values]);
  const navigationItems = useMemo<readonly CardBlockNavigationItem[]>(
    () =>
      (preview?.blocks ?? []).map((block) => {
        const completion = completions.blocks.get(block.block_id)!;
        return {
          anchorId: creationBlockAnchorId(block.block_id),
          label: block.title,
          state: completion.state,
          filledCount: completion.filledCount,
          totalCount: completion.totalCount,
          requiredMissingCount: completion.requiredMissingCount,
        };
      }),
    [completions.blocks, preview?.blocks],
  );

  function resetTemplateValues(next: Pick<CreationState, "organizationId" | "templateId">) {
    if (Object.keys(state.values).length > 0) {
      const confirmed = window.confirm(
        "При смене организации или шаблона введённые значения будут очищены. Продолжить?",
      );
      if (!confirmed) return;
    }
    setState((current) => ({
      ...current,
      ...next,
      values: {},
      publicAccess: { ...current.publicAccess, fields: [] },
    }));
  }

  function updatePublicAccess(payload: CardPublicAccessPayload) {
    setState((current) => ({
      ...current,
      publicAccess: {
        ...current.publicAccess,
        ...payload,
        fields: payload.fields ?? current.publicAccess.fields,
      },
    }));
  }

  function publicAccessPayload(): CardPublicAccessPayload {
    return {
      public_view_enabled: state.publicAccess.public_view_enabled ?? true,
      public_edit_enabled: state.publicAccess.public_edit_enabled ?? true,
      fields: state.publicAccess.fields ?? [],
    };
  }

  async function saveDraft() {
    if (!canLoadPreview) return;
    setError(null);
    setIsSaving(true);
    try {
      const card = await createOrganizationCardDraft(token, state.organizationId, {
        display_name: state.displayName.trim() || undefined,
        card_template_id: templateId,
        public_access: publicAccessPayload(),
      });
      await onCardCreated(card.id);
    } catch (nextError) {
      setError(nextError);
    } finally {
      setIsSaving(false);
    }
  }

  const baseBlock = (
    <CardBaseBlockSurface
      id="creation-card-base-block"
      mode="creation"
      disabled={isSaving}
      organization={{
        label: "Организация карточки",
        value: state.organizationId,
        options: organizations.map((organization) => ({
          id: organization.id,
          label: organization.name,
        })),
        placeholder: "Нет данных",
        onChange: (organizationId) => resetTemplateValues({ organizationId, templateId }),
      }}
      template={{
        label: "Шаблон карточки",
        value: templateId,
        options: templates.map((template) => ({ id: template.id, label: template.name })),
        placeholder: templates.length === 1 ? undefined : "Выберите шаблон карточки",
        onChange: (nextTemplateId) =>
          resetTemplateValues({ organizationId: state.organizationId, templateId: nextTemplateId }),
      }}
      displayName={{
        label: "Наименование карточки",
        value: state.displayName,
        placeholder: preview?.display_name || "Необязательно",
        onChange: (displayName) => setState((current) => ({ ...current, displayName })),
      }}
      publicAccessContent={
        <div className="card-base-block-public-settings">
          <div className="card-base-toggle-grid">
            <label className="checkbox-control">
              <input
                type="checkbox"
                checked={publicAccess.public_view_enabled}
                disabled={isSaving || publicAccess.public_edit_enabled}
                onChange={(event) =>
                  updatePublicAccess({ public_view_enabled: event.currentTarget.checked })
                }
              />
              <span>Публичный просмотр карточки</span>
            </label>
            <label className="checkbox-control">
              <input
                type="checkbox"
                checked={publicAccess.public_edit_enabled}
                disabled={isSaving}
                onChange={(event) =>
                  updatePublicAccess({ public_edit_enabled: event.currentTarget.checked })
                }
              />
              <span>Публичное редактирование карточки</span>
            </label>
          </div>
          <PublicAccessFieldPicker
            fields={publicAccessFields}
            publicAccess={publicAccess}
            disabled={isSaving}
            onChange={updatePublicAccess}
          />
        </div>
      }
      footer={
        <button type="button" className="ghost-button" disabled={isSaving} onClick={onCancel}>
          Отмена
        </button>
      }
    />
  );
  const draftActionRail = (
    <CardDraftActionRail
      state="setup"
      setupComplete={canLoadPreview}
      isSaving={isSaving}
      onSaveDraft={() => void saveDraft()}
    />
  );

  return (
    <section className="single-stage-card-creation stack" aria-label="Создание карточки">
      {preview?.blocks.length ? null : baseBlock}
      <DataAlert
        error={
          error instanceof Error ? error : error ? new Error(errorText(error)) : previewQuery.error
        }
      />
      {previewQuery.isLoading ? <p>Загрузка полей шаблона…</p> : null}
      {canLoadPreview && !previewQuery.isLoading && preview?.blocks.length === 0 ? (
        <p className="data-empty">В выбранном шаблоне нет доступных полей.</p>
      ) : null}
      {preview?.blocks.length ? (
        <CardPresentationShell
          items={[
            {
              anchorId: "creation-card-base-block",
              label: "Базовый блок",
              state: "neutral",
              filledCount: 0,
              totalCount: 0,
              requiredMissingCount: 0,
            },
            ...navigationItems,
          ]}
          beforeContent={baseBlock}
          navigatorAction={draftActionRail}
        >
          <div className="single-stage-card-creation-template">
            {preview.blocks.map((block) => {
              const blockState = completions.blocks.get(block.block_id)?.state ?? "empty";
              return (
                <section
                  key={block.block_id}
                  id={creationBlockAnchorId(block.block_id)}
                  className={`data-panel single-stage-card-creation-block is-${blockState}`}
                >
                  <header className="admin-mutation-header">
                    <div>
                      <strong>{block.title}</strong>
                      {block.description ? <small>{block.description}</small> : null}
                    </div>
                  </header>
                  <div className="admin-mutation-body">
                    {block.fields.map((field) => {
                      const isFile = field.field_type === "file_ref";
                      const fieldState = completions.fields.get(field.field_id)?.state ?? "empty";
                      return (
                        <label
                          key={field.field_id}
                          className={`single-stage-card-creation-field is-${fieldState}`}
                        >
                          <span>
                            {field.label}
                            {isRequired(field.required_mode) ? " *" : ""}
                          </span>
                          <FieldEditorControl
                            label={field.label}
                            fieldType={field.field_type}
                            hint={
                              isFile
                                ? "Файл можно добавить после первого сохранения карточки."
                                : field.description
                            }
                            options={field.options}
                            value={
                              state.values[field.field_id] ??
                              initialEditorValue({ field_type: field.field_type, value: null })
                            }
                            disabled
                            onChange={() => undefined}
                          />
                        </label>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        </CardPresentationShell>
      ) : null}
      {creationFields.length > 0 ? (
        <p className="field-editor-hint">
          Сначала сохраните черновик — после этого можно заполнять поля шаблона.
        </p>
      ) : null}
      {!preview?.blocks.length ? draftActionRail : null}
    </section>
  );
}

function isRequired(requiredMode: string) {
  return requiredMode === "required" || requiredMode === "required_on_publish";
}

function creationValueForCompletion(
  field: CardCreationPreviewFieldRead,
  value: FieldEditorState | undefined,
) {
  if (value === undefined) return null;
  try {
    return coerceEditorValue(field.field_type, value);
  } catch {
    return null;
  }
}

function creationBlockAnchorId(blockId: string) {
  return `creation-card-block-${blockId}`;
}
