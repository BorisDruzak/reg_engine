import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { firstSaveOrganizationCard, getCardCreationPreview } from "@/api/client";
import type {
  CardCreationPreviewFieldRead,
  CardTemplateRead,
  OrganizationRead,
} from "@/api/types";
import { DataAlert } from "@/components/common/DataSurfaces";
import { errorText } from "@/components/common/dataUtils";

import { FieldEditorControl } from "./FieldEditorControl";
import type { CardBlockNavigationItem } from "./CardBlockNavigator";
import { CardPresentationShell } from "./CardPresentationShell";
import { buildBlockCompletions } from "./cardCompletion";
import {
  type FieldEditorState,
  coerceEditorValue,
  initialEditorValue,
} from "./fieldEditorUtils";

type CreationState = {
  organizationId: string;
  templateId: string;
  displayName: string;
  values: Record<string, FieldEditorState>;
};

export function SingleStageCardCreation({
  token,
  organizations,
  templates,
  onCancel,
  onCardCreated,
}: {
  token: string;
  organizations: OrganizationRead[];
  templates: CardTemplateRead[];
  onCancel: () => void;
  onCardCreated: (cardId: string) => Promise<void>;
}) {
  const [state, setState] = useState<CreationState>(() => ({
    organizationId: organizations[0]?.id ?? "",
    templateId: "",
    displayName: "",
    values: {},
  }));
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
  const fields = useMemo(
    () => preview?.blocks.flatMap((block) => block.fields) ?? [],
    [preview?.blocks],
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
    setState((current) => ({ ...current, ...next, values: {} }));
  }

  async function saveFirstValue(field: CardCreationPreviewFieldRead, nextValue: FieldEditorState) {
    let value: unknown;
    try {
      value = coerceEditorValue(field.field_type, nextValue);
    } catch (nextError) {
      setError(nextError);
      return;
    }
    setState((current) => ({ ...current, values: { ...current.values, [field.field_id]: nextValue } }));
    if (isEmptyFirstValue(value)) return;

    setError(null);
    setIsSaving(true);
    try {
      const created = await firstSaveOrganizationCard(token, state.organizationId, {
        display_name: state.displayName.trim() || undefined,
        card_template_id: templateId,
        field_id: field.field_id,
        value,
      });
      await onCardCreated(created.id);
    } catch (nextError) {
      setError(nextError);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="single-stage-card-creation stack" aria-label="Создание карточки">
      <section className="data-panel single-stage-card-creation-base">
        <header className="admin-mutation-header">
          <div>
            <strong>Базовый блок</strong>
            <small>Выберите организацию и шаблон. Карточка будет создана после первого заполненного поля.</small>
          </div>
        </header>
        <div className="admin-mutation-body">
          <label>
            <span>Организация карточки</span>
            <select
              aria-label="Организация карточки"
              disabled={isSaving}
              value={state.organizationId}
              onChange={(event) =>
                resetTemplateValues({ organizationId: event.currentTarget.value, templateId })
              }
            >
              <option value="">Нет данных</option>
              {organizations.map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Шаблон карточки</span>
            <select
              aria-label="Шаблон карточки"
              disabled={isSaving || templates.length === 0}
              value={templateId}
              onChange={(event) =>
                resetTemplateValues({ organizationId: state.organizationId, templateId: event.currentTarget.value })
              }
            >
              {templates.length !== 1 && <option value="">Выберите шаблон карточки</option>}
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Наименование карточки</span>
            <input
              aria-label="Наименование карточки"
              disabled={isSaving}
              placeholder={preview?.display_name || "Необязательно"}
              value={state.displayName}
              onChange={(event) =>
                setState((current) => ({ ...current, displayName: event.currentTarget.value }))
              }
            />
          </label>
        </div>
        <footer className="admin-mutation-actions">
          <button type="button" className="ghost-button" disabled={isSaving} onClick={onCancel}>
            Отмена
          </button>
        </footer>
      </section>

      <DataAlert
        error={
          error instanceof Error
            ? error
            : error
              ? new Error(errorText(error))
              : previewQuery.error
        }
      />
      {previewQuery.isLoading ? <p>Загрузка полей шаблона…</p> : null}
      {canLoadPreview && !previewQuery.isLoading && preview?.blocks.length === 0 ? (
        <p className="data-empty">В выбранном шаблоне нет доступных полей.</p>
      ) : null}
      {preview?.blocks.length ? (
        <CardPresentationShell items={navigationItems}>
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
                            value={state.values[field.field_id] ?? initialEditorValue({ field_type: field.field_type, value: null })}
                            disabled={isSaving || isFile}
                            onChange={(nextValue) => void saveFirstValue(field, nextValue)}
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
      {fields.length > 0 ? (
        <p className="field-editor-hint">После первого заполненного поля карточка сохранится автоматически.</p>
      ) : null}
    </section>
  );
}

function isRequired(requiredMode: string) {
  return requiredMode === "required" || requiredMode === "required_on_publish";
}

function isEmptyFirstValue(value: unknown) {
  if (value === null || value === undefined || value === "") return true;
  if (Array.isArray(value)) return value.length === 0;
  return false;
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
