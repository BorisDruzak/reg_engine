import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent as ReactKeyboardEvent } from "react";

import type { FormBlockRead } from "@/api/types";

export type InlineBlockEditorProps = {
  block: FormBlockRead;
  onCommit: (block: FormBlockRead) => void;
  onCancel: () => void;
};

export function InlineBlockEditor({ block, onCommit, onCancel }: InlineBlockEditorProps) {
  const rootRef = useRef<HTMLFormElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(block);
  const [titleError, setTitleError] = useState<string | null>(null);

  const commitIfValid = useCallback(() => {
    if (!draft.title.trim()) {
      setTitleError("Введите название блока");
      titleRef.current?.focus();
      return false;
    }
    setTitleError(null);
    onCommit({ ...draft, title: draft.title.trim() });
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

  return (
    <form
      ref={rootRef}
      className="card-layout-inline-editor card-layout-inline-block-editor"
      aria-label={`Редактирование блока ${block.title}`}
      noValidate
      onClick={(event) => event.stopPropagation()}
      onKeyDown={handleKeyDown}
      onSubmit={handleSubmit}
    >
      <label>
        <span>Название блока</span>
        <input
          ref={titleRef}
          autoFocus
          aria-describedby={titleError ? `block-${block.id}-title-error` : undefined}
          aria-invalid={Boolean(titleError)}
          value={draft.title}
          onChange={(event) => {
            setDraft({ ...draft, title: event.currentTarget.value });
            setTitleError(null);
          }}
        />
      </label>
      {titleError ? (
        <span id={`block-${block.id}-title-error`} className="inline-alert">
          {titleError}
        </span>
      ) : null}
      <label>
        <span>Описание блока</span>
        <textarea
          value={draft.description ?? ""}
          onChange={(event) => setDraft({ ...draft, description: event.currentTarget.value })}
        />
      </label>
      <label className="checkbox-inline">
        <input
          type="checkbox"
          checked={draft.is_repeatable}
          onChange={(event) => setDraft({ ...draft, is_repeatable: event.currentTarget.checked })}
        />
        <span>Повторяемый блок</span>
      </label>
      <label className="checkbox-inline">
        <input
          type="checkbox"
          checked={draft.public_visible}
          onChange={(event) => setDraft({ ...draft, public_visible: event.currentTarget.checked })}
        />
        <span>Виден в публичной ссылке</span>
      </label>
      <label className="checkbox-inline">
        <input
          type="checkbox"
          checked={draft.public_editable}
          onChange={(event) => setDraft({ ...draft, public_editable: event.currentTarget.checked })}
        />
        <span>Доступен для публичного редактирования</span>
      </label>
      <label className="checkbox-inline">
        <input
          type="checkbox"
          checked={draft.display_config_json?.collapsible === true}
          onChange={(event) =>
            setDraft({
              ...draft,
              display_config_json: {
                ...draft.display_config_json,
                collapsible: event.currentTarget.checked,
              },
            })
          }
        />
        <span>Можно свернуть</span>
      </label>
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
