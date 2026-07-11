import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { FormEvent, KeyboardEvent as ReactKeyboardEvent } from "react";

import {
  archiveReferenceItem,
  createReferenceItem,
  createReferenceList,
  listReferenceItems,
  updateReferenceItem,
  updateReferenceList,
} from "@/api/client";
import type { ReferenceItemRead, ReferenceListRead } from "@/api/types";
import { generateTechnicalCode } from "@/app/technicalCode";
import { errorText } from "@/components/common/dataUtils";

export type InlineReferenceEditorContext = {
  token: string;
  registryId: string;
  onReferenceDataChanged: () => Promise<void> | void;
};

export type InlineReferenceEditorProps = {
  context: InlineReferenceEditorContext;
  referenceLists: ReferenceListRead[];
  selectedReferenceListId: string | null;
  mode: "create" | "manage";
  onSelect: (referenceList: ReferenceListRead) => void;
  onBack: () => void;
};

export function InlineReferenceEditor({
  context,
  referenceLists,
  selectedReferenceListId,
  mode,
  onSelect,
  onBack,
}: InlineReferenceEditorProps) {
  const [listName, setListName] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [itemDraft, setItemDraft] = useState<{
    mode: "create" | "edit";
    itemId: string | null;
    label: string;
  } | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<ReferenceItemRead | null>(null);
  const selectedReferenceList =
    referenceLists.find((referenceList) => referenceList.id === selectedReferenceListId) ?? null;
  const referenceReadOnly = Boolean(selectedReferenceList?.managed_by_system_only);
  const [managedListName, setManagedListName] = useState(selectedReferenceList?.name ?? "");
  const itemsQuery = useQuery({
    queryKey: ["inline-reference-items", context.token, selectedReferenceListId],
    queryFn: () => listReferenceItems(context.token, selectedReferenceListId ?? ""),
    enabled: mode === "manage" && Boolean(selectedReferenceListId),
  });
  const referenceItems = [...(itemsQuery.data?.items ?? [])]
    .filter((item) => item.is_active)
    .sort((left, right) => left.position - right.position);
  const createListMutation = useMutation({
    mutationFn: (name: string) =>
      createReferenceList(context.token, context.registryId, {
        code: generateTechnicalCode(
          name,
          "list",
          referenceLists.map((referenceList) => referenceList.code),
        ),
        name,
      }),
    onSuccess: async (created) => {
      await context.onReferenceDataChanged();
      onSelect(created);
    },
  });
  const manageMutation = useMutation({
    mutationFn: (operation: () => Promise<unknown>) => operation(),
    onSuccess: async () => {
      setItemDraft(null);
      setArchiveTarget(null);
      await context.onReferenceDataChanged();
      await itemsQuery.refetch();
    },
  });

  function handleCreateList(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = listName.trim();
    if (!name) {
      setLocalError("Введите название справочника");
      return;
    }
    setLocalError(null);
    createListMutation.mutate(name);
  }

  function handleRenameList(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedReferenceListId) return;
    const name = managedListName.trim();
    if (!name) {
      setLocalError("Введите название справочника");
      return;
    }
    setLocalError(null);
    manageMutation.mutate(async () => {
      const updated = await updateReferenceList(context.token, selectedReferenceListId, { name });
      onSelect(updated);
    });
  }

  function handleItemSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!itemDraft || !selectedReferenceListId) return;
    const label = itemDraft.label.trim();
    if (!label) {
      setLocalError("Введите название элемента");
      return;
    }
    setLocalError(null);
    if (itemDraft.mode === "create") {
      manageMutation.mutate(() =>
        createReferenceItem(context.token, selectedReferenceListId, {
          code: generateTechnicalCode(
            label,
            "item",
            referenceItems.map((item) => item.code),
          ),
          label,
          position: referenceItems.length,
        }),
      );
      return;
    }
    if (itemDraft.itemId) {
      manageMutation.mutate(() => updateReferenceItem(context.token, itemDraft.itemId!, { label }));
    }
  }

  function moveItem(itemId: string, direction: -1 | 1) {
    const index = referenceItems.findIndex((item) => item.id === itemId);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= referenceItems.length) return;
    const reordered = [...referenceItems];
    [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];
    manageMutation.mutate(() =>
      Promise.all(
        reordered
          .map((item, position) => ({ item, position }))
          .filter(({ item, position }) => item.position !== position)
          .map(({ item, position }) => updateReferenceItem(context.token, item.id, { position })),
      ),
    );
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onBack();
    }
  }

  const mutationError = createListMutation.error ?? manageMutation.error ?? itemsQuery.error;

  return (
    <section
      className="card-layout-inline-editor card-layout-inline-reference-editor"
      role="region"
      aria-label="Редактор справочника для поля"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={handleKeyDown}
    >
      <header className="inline-reference-editor-header">
        <button type="button" className="ghost-button" onClick={onBack}>
          Назад
        </button>
        <strong>{mode === "create" ? "Новый справочник" : "Выбранный справочник"}</strong>
      </header>
      {mode === "create" ? (
        <form className="inline-reference-form" onSubmit={handleCreateList}>
          <label>
            <span>Название справочника</span>
            <input
              autoFocus
              value={listName}
              onChange={(event) => {
                setListName(event.currentTarget.value);
                setLocalError(null);
              }}
            />
          </label>
          {localError ? <span className="inline-alert">{localError}</span> : null}
          {mutationError ? <span className="inline-alert">{errorText(mutationError)}</span> : null}
          <button type="submit" className="primary-button" disabled={createListMutation.isPending}>
            Создать справочник
          </button>
        </form>
      ) : selectedReferenceList ? (
        <div className="inline-reference-manage">
          <form className="inline-reference-form" onSubmit={handleRenameList}>
            <label>
              <span>Название справочника</span>
              <input
                value={managedListName}
                disabled={referenceReadOnly}
                onChange={(event) => {
                  setManagedListName(event.currentTarget.value);
                  setLocalError(null);
                }}
              />
            </label>
            {!referenceReadOnly ? (
              <button type="submit" className="ghost-button" disabled={manageMutation.isPending}>
                Сохранить название
              </button>
            ) : null}
          </form>
          {localError ? <span className="inline-alert">{localError}</span> : null}
          {mutationError ? <span className="inline-alert">{errorText(mutationError)}</span> : null}
          <div className="inline-reference-items">
            {referenceItems.map((item, index) => (
              <article key={item.id} className="inline-reference-item">
                <strong>{item.label}</strong>
                {!referenceReadOnly ? (
                  <div className="row-actions">
                    <button
                      type="button"
                      className="ghost-button"
                      aria-label={`Переместить вверх ${item.label}`}
                      disabled={index === 0 || manageMutation.isPending}
                      onClick={() => moveItem(item.id, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="ghost-button"
                      aria-label={`Переместить вниз ${item.label}`}
                      disabled={index === referenceItems.length - 1 || manageMutation.isPending}
                      onClick={() => moveItem(item.id, 1)}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="ghost-button"
                      aria-label={`Изменить элемент ${item.label}`}
                      onClick={() =>
                        setItemDraft({ mode: "edit", itemId: item.id, label: item.label })
                      }
                    >
                      Изменить
                    </button>
                    <button
                      type="button"
                      className="ghost-button"
                      aria-label={`Архивировать элемент ${item.label}`}
                      onClick={() => setArchiveTarget(item)}
                    >
                      В архив
                    </button>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
          {!referenceReadOnly && itemDraft ? (
            <form className="inline-reference-form" onSubmit={handleItemSubmit}>
              <label>
                <span>Название элемента</span>
                <input
                  autoFocus
                  value={itemDraft.label}
                  onChange={(event) => {
                    setItemDraft({ ...itemDraft, label: event.currentTarget.value });
                    setLocalError(null);
                  }}
                />
              </label>
              <div className="row-actions">
                <button
                  type="submit"
                  className="primary-button"
                  disabled={manageMutation.isPending}
                >
                  {itemDraft.mode === "create" ? "Создать элемент" : "Сохранить элемент"}
                </button>
                <button type="button" className="ghost-button" onClick={() => setItemDraft(null)}>
                  Отмена
                </button>
              </div>
            </form>
          ) : !referenceReadOnly ? (
            <button
              type="button"
              className="ghost-button"
              onClick={() => setItemDraft({ mode: "create", itemId: null, label: "" })}
            >
              Добавить элемент
            </button>
          ) : null}
          {!referenceReadOnly && archiveTarget ? (
            <div className="inline-reference-confirmation" role="alert">
              <span>Архивировать «{archiveTarget.label}»?</span>
              <div className="row-actions">
                <button
                  type="button"
                  className="danger-button"
                  disabled={manageMutation.isPending}
                  onClick={() =>
                    manageMutation.mutate(() =>
                      archiveReferenceItem(context.token, archiveTarget.id),
                    )
                  }
                >
                  Подтвердить архивирование
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => setArchiveTarget(null)}
                >
                  Отмена
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="inline-alert">Справочник недоступен.</p>
      )}
    </section>
  );
}
