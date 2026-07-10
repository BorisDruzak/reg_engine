import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent as ReactKeyboardEvent } from "react";

import type { FormFieldRead, ReferenceListRead } from "@/api/types";
import { FIELD_TYPE_OPTIONS } from "@/app/uiText";

export type InlineFieldEditorProps = {
  field: FormFieldRead;
  referenceLists?: ReferenceListRead[];
  onCommit: (field: FormFieldRead) => void;
  onCancel: () => void;
};

export function InlineFieldEditor({
  field,
  referenceLists = [],
  onCommit,
  onCancel,
}: InlineFieldEditorProps) {
  const rootRef = useRef<HTMLFormElement>(null);
  const labelRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(field);
  const [errors, setErrors] = useState<{ label?: string; code?: string }>({});

  const commitIfValid = useCallback(() => {
    const nextErrors: { label?: string; code?: string } = {};
    if (!draft.label.trim()) {
      nextErrors.label = "Введите название поля";
    }
    if (!draft.code.trim()) {
      nextErrors.code = "Введите технический код поля";
    }
    setErrors(nextErrors);
    if (nextErrors.label) {
      labelRef.current?.focus();
      return false;
    }
    if (nextErrors.code) {
      codeRef.current?.focus();
      return false;
    }
    onCommit({ ...draft, label: draft.label.trim(), code: draft.code.trim() });
    return true;
  }, [draft, onCommit]);

  useEffect(() => {
    const handleClickAway = (event: MouseEvent) => {
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
  }, [commitIfValid]);

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
    onCancel();
  }

  const usesReferenceList = draft.field_type === "select" || draft.field_type === "multi_select";
  const staticText =
    typeof draft.options_config_json?.static_text === "string"
      ? draft.options_config_json.static_text
      : "";

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
          onChange={(event) => setDraft({ ...draft, field_type: event.currentTarget.value })}
        >
          {FIELD_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Технический код</span>
        <input
          ref={codeRef}
          aria-describedby={errors.code ? `field-${field.id}-code-error` : undefined}
          aria-invalid={Boolean(errors.code)}
          value={draft.code}
          onChange={(event) => {
            setDraft({ ...draft, code: event.currentTarget.value });
            setErrors((current) => ({ ...current, code: undefined }));
          }}
        />
      </label>
      {errors.code ? (
        <span id={`field-${field.id}-code-error`} className="inline-alert">
          {errors.code}
        </span>
      ) : null}
      <label>
        <span>Описание поля</span>
        <textarea
          value={draft.description ?? ""}
          onChange={(event) => setDraft({ ...draft, description: event.currentTarget.value })}
        />
      </label>
      <label>
        <span>Обязательность</span>
        <select
          value={draft.required_mode}
          onChange={(event) => setDraft({ ...draft, required_mode: event.currentTarget.value })}
        >
          <option value="not_required">Необязательное поле</option>
          <option value="required">Обязательное поле</option>
          <option value="required_on_publish">Обязательное при публикации</option>
        </select>
      </label>
      {usesReferenceList ? (
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
            {referenceLists
              .filter((referenceList) => referenceList.is_active)
              .map((referenceList) => (
                <option key={referenceList.id} value={referenceList.id}>
                  {referenceList.name}
                </option>
              ))}
          </select>
        </label>
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
      <label className="checkbox-inline">
        <input
          type="checkbox"
          checked={draft.public_visible}
          onChange={(event) => setDraft({ ...draft, public_visible: event.currentTarget.checked })}
        />
        <span>Видно в публичной ссылке</span>
      </label>
      <label className="checkbox-inline">
        <input
          type="checkbox"
          checked={draft.public_editable}
          onChange={(event) => setDraft({ ...draft, public_editable: event.currentTarget.checked })}
        />
        <span>Доступно для публичного редактирования</span>
      </label>
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
        <button type="button" className="ghost-button" onClick={onCancel}>
          Отмена
        </button>
      </div>
    </form>
  );
}
