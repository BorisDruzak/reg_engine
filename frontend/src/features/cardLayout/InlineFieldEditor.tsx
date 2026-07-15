import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent as ReactKeyboardEvent } from "react";

import type { FormFieldRead, OrganizationRead, ReferenceListRead } from "@/api/types";
import { FIELD_TYPE_OPTIONS } from "@/app/uiText";

import { InlineReferenceEditor, type InlineReferenceEditorContext } from "./InlineReferenceEditor";

export type InlineFieldEditorProps = {
  field: FormFieldRead;
  referenceLists?: ReferenceListRead[];
  organizations?: OrganizationRead[];
  inlineReferenceEditorContext?: InlineReferenceEditorContext;
  onCommit: (field: FormFieldRead) => void;
  onClose: () => void;
  onDelete: () => void;
};

export function InlineFieldEditor({
  field,
  referenceLists = [],
  organizations = [],
  inlineReferenceEditorContext,
  onCommit,
  onClose,
  onDelete,
}: InlineFieldEditorProps) {
  const rootRef = useRef<HTMLFormElement>(null);
  const labelRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(field);
  const [inlineReferenceList, setInlineReferenceList] = useState<ReferenceListRead | null>(null);
  const [editorScreen, setEditorScreen] = useState<
    "field" | "create-reference" | "manage-reference"
  >("field");
  const [errors, setErrors] = useState<{ label?: string }>({});

  const commitIfValid = useCallback(() => {
    const nextErrors: { label?: string } = {};
    if (!draft.label.trim()) {
      nextErrors.label = "Введите название поля";
    }
    setErrors(nextErrors);
    if (nextErrors.label) {
      labelRef.current?.focus();
      return false;
    }
    onCommit({
      ...draft,
      label: draft.label.trim(),
      code: draft.code.trim(),
      required_mode:
        draft.field_type === "static_text" || draft.required_mode === "not_required"
          ? "not_required"
          : "required_on_publish",
    });
    return true;
  }, [draft, onCommit]);

  useEffect(() => {
    const handleClickAway = (event: MouseEvent) => {
      if (editorScreen !== "field") {
        return;
      }
      if (rootRef.current?.contains(event.target as Node)) {
        return;
      }
      if (!commitIfValid()) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    document.addEventListener("click", handleClickAway, true);
    return () => document.removeEventListener("click", handleClickAway, true);
  }, [commitIfValid, editorScreen]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    commitIfValid();
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLFormElement>) {
    if (event.key !== "Escape") {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    onClose();
  }

  const usesReferenceList = draft.field_type === "select" || draft.field_type === "multi_select";
  const effectiveReferenceLists = inlineReferenceList
    ? [
        inlineReferenceList,
        ...referenceLists.filter((referenceList) => referenceList.id !== inlineReferenceList.id),
      ]
    : referenceLists;
  const staticText =
    typeof draft.options_config_json?.static_text === "string"
      ? draft.options_config_json.static_text
      : "";
  const allowedOrganizationIds = Array.isArray(draft.options_config_json?.allowed_organization_ids)
    ? draft.options_config_json.allowed_organization_ids.filter(
        (organizationId): organizationId is string => typeof organizationId === "string",
      )
    : [];

  if (editorScreen !== "field" && inlineReferenceEditorContext) {
    return (
      <InlineReferenceEditor
        key={`${editorScreen}:${draft.options_source_id ?? "new"}`}
        context={inlineReferenceEditorContext}
        referenceLists={effectiveReferenceLists}
        selectedReferenceListId={draft.options_source_id}
        mode={editorScreen === "create-reference" ? "create" : "manage"}
        onSelect={(referenceList) => {
          setInlineReferenceList(referenceList);
          setDraft({
            ...draft,
            options_source_type: "reference_list",
            options_source_id: referenceList.id,
          });
          setEditorScreen("manage-reference");
        }}
        onBack={() => setEditorScreen("field")}
      />
    );
  }

  return (
    <form
      ref={rootRef}
      className="card-layout-inline-editor card-layout-inline-field-editor"
      aria-label={`Редактирование поля ${field.label}`}
      noValidate
      onClick={(event) => event.stopPropagation()}
      onKeyDown={handleKeyDown}
      onSubmit={handleSubmit}
    >
      <label>
        <span>Название поля</span>
        <input
          ref={labelRef}
          autoFocus
          aria-describedby={errors.label ? `field-${field.id}-label-error` : undefined}
          aria-invalid={Boolean(errors.label)}
          value={draft.label}
          onChange={(event) => {
            setDraft({ ...draft, label: event.currentTarget.value });
            setErrors((current) => ({ ...current, label: undefined }));
          }}
        />
      </label>
      {errors.label ? (
        <span id={`field-${field.id}-label-error`} className="inline-alert">
          {errors.label}
        </span>
      ) : null}
      <label>
        <span>Тип поля</span>
        <select
          value={draft.field_type}
          onChange={(event) => {
            const fieldType = event.currentTarget.value;
            const usesReference = fieldType === "select" || fieldType === "multi_select";
            const staticTextField = fieldType === "static_text";
            const fieldTypeChanged = fieldType !== draft.field_type;
            setDraft({
              ...draft,
              field_type: fieldType,
              required_mode: staticTextField ? "not_required" : draft.required_mode,
              options_source_type: usesReference ? draft.options_source_type : null,
              options_source_id: usesReference ? draft.options_source_id : null,
              options_config_json: staticTextField
                ? { static_text: "" }
                : fieldTypeChanged
                  ? null
                  : draft.options_config_json,
              is_list_display: staticTextField ? false : draft.is_list_display,
            });
          }}
        >
          {FIELD_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      {draft.field_type !== "static_text" ? (
        <>
          <label>
            <span>Подсказка</span>
            <input
              value={draft.description ?? ""}
              onChange={(event) => setDraft({ ...draft, description: event.currentTarget.value })}
            />
          </label>
          <label>
            <span>Обязательность</span>
            <select
              value={
                draft.required_mode === "not_required" ? "not_required" : "required_on_publish"
              }
              onChange={(event) => setDraft({ ...draft, required_mode: event.currentTarget.value })}
            >
              <option value="not_required">Необязательное поле</option>
              <option value="required_on_publish">Обязательное поле</option>
            </select>
          </label>
        </>
      ) : null}
      {usesReferenceList ? (
        <div className="inline-reference-field-settings">
          <label>
            <span>Справочник</span>
            <select
              value={draft.options_source_id ?? ""}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  options_source_type: event.currentTarget.value ? "reference_list" : null,
                  options_source_id: event.currentTarget.value || null,
                })
              }
            >
              <option value="">Не выбран</option>
              {effectiveReferenceLists
                .filter((referenceList) => referenceList.is_active)
                .map((referenceList) => (
                  <option key={referenceList.id} value={referenceList.id}>
                    {referenceList.name}
                  </option>
                ))}
            </select>
          </label>
          {inlineReferenceEditorContext ? (
            <div className="row-actions inline-reference-field-actions">
              <button
                type="button"
                className="ghost-button"
                onClick={() => setEditorScreen("create-reference")}
              >
                Создать новый
              </button>
              {draft.options_source_id ? (
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => setEditorScreen("manage-reference")}
                >
                  Изменить выбранный
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
      {draft.field_type === "organization_ref" ? (
        <fieldset className="inline-reference-field-settings">
          <legend>Организации для публичного выбора</legend>
          {organizations.length === 0 ? (
            <p className="data-empty">Нет доступных организаций</p>
          ) : null}
          {organizations.map((organization) => {
            const checked = allowedOrganizationIds.includes(organization.id);
            return (
              <label key={organization.id} className="checkbox-inline">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(event) => {
                    const nextIds = new Set(allowedOrganizationIds);
                    if (event.currentTarget.checked) {
                      nextIds.add(organization.id);
                    } else {
                      nextIds.delete(organization.id);
                    }
                    setDraft({
                      ...draft,
                      options_config_json: {
                        ...draft.options_config_json,
                        allowed_organization_ids: Array.from(nextIds),
                      },
                    });
                  }}
                />
                <span>{organization.name}</span>
              </label>
            );
          })}
        </fieldset>
      ) : null}
      {draft.field_type === "static_text" ? (
        <label>
          <span>Текст</span>
          <textarea
            value={staticText}
            onChange={(event) =>
              setDraft({
                ...draft,
                options_config_json: {
                  ...draft.options_config_json,
                  static_text: event.currentTarget.value,
                },
              })
            }
          />
        </label>
      ) : null}
      <details>
        <summary>Ещё</summary>
        <label className="checkbox-inline">
          <input
            type="checkbox"
            checked={draft.is_list_display}
            onChange={(event) =>
              setDraft({ ...draft, is_list_display: event.currentTarget.checked })
            }
          />
          <span>Показывать в списке карточек</span>
        </label>
      </details>
      <div className="row-actions">
        <button type="submit" className="primary-button">
          Сохранить
        </button>
        <button type="button" className="danger-button" onClick={onDelete}>
          Удалить поле
        </button>
      </div>
    </form>
  );
}
