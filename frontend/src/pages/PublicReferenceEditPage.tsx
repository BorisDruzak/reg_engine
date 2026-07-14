import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";

import {
  archivePublicReferenceItem,
  archivePublicReferenceList,
  createPublicReferenceItem,
  createPublicReferenceList,
  getPublicReferenceWorkspace,
  updatePublicReferenceItem,
  updatePublicReferenceList,
} from "@/api/client";
import type { PublicReferenceItemRead } from "@/api/types";
import { errorText } from "@/components/common/dataUtils";

export function PublicReferenceEditPage() {
  const { rawToken = "" } = useParams();
  const queryClient = useQueryClient();
  const [listName, setListName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const workspaceQuery = useQuery({
    queryKey: ["public-reference-workspace", rawToken],
    queryFn: () => getPublicReferenceWorkspace(rawToken),
    enabled: Boolean(rawToken),
  });
  const workspace = workspaceQuery.data;
  const refresh = async () =>
    queryClient.invalidateQueries({ queryKey: ["public-reference-workspace", rawToken] });
  const createList = useMutation({
    mutationFn: () => createPublicReferenceList(rawToken, listName),
    onSuccess: async () => {
      setListName("");
      setError(null);
      await refresh();
    },
    onError: (cause) => setError(errorText(cause)),
  });

  if (workspaceQuery.isLoading)
    return (
      <main className="public-reference-workspace">
        <p>Загрузка справочников…</p>
      </main>
    );
  if (workspaceQuery.error || !workspace)
    return (
      <main className="public-reference-workspace">
        <p className="inline-alert">{errorText(workspaceQuery.error)}</p>
      </main>
    );

  return (
    <main className="public-reference-workspace" aria-label="Публичное заполнение справочников">
      <header>
        <p className="page-eyebrow">Реестровая система</p>
        <h1>Справочники</h1>
        <p>
          {workspace.can_edit
            ? "Ссылка активна: можно создавать и редактировать справочники."
            : workspace.status === "expired"
              ? "Срок действия ссылки истёк. Доступен только просмотр."
              : "Ссылка закрыта. Доступен только просмотр."}
        </p>
      </header>
      {error ? <p className="inline-alert">{error}</p> : null}
      {workspace.can_edit ? (
        <form
          className="panel-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (listName.trim()) createList.mutate();
          }}
        >
          <label>
            <span>Название справочника</span>
            <input value={listName} onChange={(event) => setListName(event.currentTarget.value)} />
          </label>
          <button type="submit" disabled={createList.isPending}>
            Создать справочник
          </button>
        </form>
      ) : null}
      <div className="stack">
        {workspace.lists.length === 0 ? (
          <p className="data-empty">Нет созданных справочников</p>
        ) : null}
        {workspace.lists.map((referenceList) => (
          <PublicReferenceListCard
            key={referenceList.id}
            rawToken={rawToken}
            canEdit={workspace.can_edit && referenceList.archived_at === null}
            referenceList={referenceList}
            items={workspace.items.filter((item) => item.list_id === referenceList.id)}
            onChanged={refresh}
            onError={(cause) => setError(errorText(cause))}
          />
        ))}
      </div>
    </main>
  );
}

function PublicReferenceListCard({
  rawToken,
  canEdit,
  referenceList,
  items,
  onChanged,
  onError,
}: {
  rawToken: string;
  canEdit: boolean;
  referenceList: { id: string; name: string; archived_at: string | null };
  items: PublicReferenceItemRead[];
  onChanged: () => Promise<unknown>;
  onError: (cause: unknown) => void;
}) {
  const [name, setName] = useState(referenceList.name);
  const [itemLabel, setItemLabel] = useState("");
  const orderedItems = useMemo(() => buildItemTree(items), [items]);
  const updateList = useMutation({
    mutationFn: () => updatePublicReferenceList(rawToken, referenceList.id, { name }),
    onSuccess: onChanged,
    onError,
  });
  const archiveList = useMutation({
    mutationFn: () => archivePublicReferenceList(rawToken, referenceList.id),
    onSuccess: onChanged,
    onError,
  });
  const createItem = useMutation({
    mutationFn: () => createPublicReferenceItem(rawToken, referenceList.id, { label: itemLabel }),
    onSuccess: async () => {
      setItemLabel("");
      await onChanged();
    },
    onError,
  });
  return (
    <section className="data-panel">
      <header>
        <h2>
          {referenceList.archived_at ? `${referenceList.name} / В архиве` : referenceList.name}
        </h2>
      </header>
      {canEdit ? (
        <form
          className="row-actions"
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim()) updateList.mutate();
          }}
        >
          <input
            aria-label={`Название справочника ${referenceList.name}`}
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
          />
          <button type="submit">Сохранить</button>
          <button type="button" className="ghost-button" onClick={() => archiveList.mutate()}>
            В архив
          </button>
        </form>
      ) : null}
      <ul className="reference-item-tree">
        {orderedItems.map(({ item, depth }) => (
          <PublicReferenceItemRow
            key={item.id}
            rawToken={rawToken}
            item={item}
            depth={depth}
            canEdit={canEdit && item.archived_at === null}
            onChanged={onChanged}
            onError={onError}
          />
        ))}
      </ul>
      {canEdit ? (
        <form
          className="row-actions"
          onSubmit={(event) => {
            event.preventDefault();
            if (itemLabel.trim()) createItem.mutate();
          }}
        >
          <input
            aria-label={`Новый элемент ${referenceList.name}`}
            value={itemLabel}
            onChange={(event) => setItemLabel(event.currentTarget.value)}
          />
          <button type="submit">Добавить элемент</button>
        </form>
      ) : null}
    </section>
  );
}

function PublicReferenceItemRow({
  rawToken,
  item,
  depth,
  canEdit,
  onChanged,
  onError,
}: {
  rawToken: string;
  item: PublicReferenceItemRead;
  depth: number;
  canEdit: boolean;
  onChanged: () => Promise<unknown>;
  onError: (cause: unknown) => void;
}) {
  const [label, setLabel] = useState(item.label);
  const [childLabel, setChildLabel] = useState("");
  const update = useMutation({
    mutationFn: () => updatePublicReferenceItem(rawToken, item.id, { label }),
    onSuccess: onChanged,
    onError,
  });
  const archive = useMutation({
    mutationFn: () => archivePublicReferenceItem(rawToken, item.id),
    onSuccess: onChanged,
    onError,
  });
  const createChild = useMutation({
    mutationFn: () =>
      createPublicReferenceItem(rawToken, item.list_id, {
        label: childLabel,
        parent_id: item.id,
      }),
    onSuccess: async () => {
      setChildLabel("");
      await onChanged();
    },
    onError,
  });
  return (
    <li style={{ marginInlineStart: `${depth * 20}px` }}>
      {canEdit ? (
        <>
          <form
            className="row-actions"
            onSubmit={(event) => {
              event.preventDefault();
              if (label.trim()) update.mutate();
            }}
          >
            <input
              aria-label={`Элемент ${item.label}`}
              value={label}
              onChange={(event) => setLabel(event.currentTarget.value)}
            />
            <button type="submit">Сохранить</button>
            <button type="button" className="ghost-button" onClick={() => archive.mutate()}>
              В архив
            </button>
          </form>
          <form
            className="row-actions"
            onSubmit={(event) => {
              event.preventDefault();
              if (childLabel.trim()) createChild.mutate();
            }}
          >
            <input
              aria-label={`Вложенный элемент ${item.label}`}
              value={childLabel}
              onChange={(event) => setChildLabel(event.currentTarget.value)}
            />
            <button type="submit">Добавить вложенный элемент</button>
          </form>
        </>
      ) : (
        <span>
          {item.label}
          {item.archived_at ? " / В архиве" : ""}
        </span>
      )}
    </li>
  );
}

function buildItemTree(items: PublicReferenceItemRead[]) {
  const byParent = new Map<string | null, PublicReferenceItemRead[]>();
  for (const item of items)
    byParent.set(item.parent_id, [...(byParent.get(item.parent_id) ?? []), item]);
  const ordered: Array<{ item: PublicReferenceItemRead; depth: number }> = [];
  const visit = (parentId: string | null, depth: number) => {
    for (const item of [...(byParent.get(parentId) ?? [])].sort(
      (left, right) => left.position - right.position || left.label.localeCompare(right.label),
    )) {
      ordered.push({ item, depth });
      visit(item.id, depth + 1);
    }
  };
  visit(null, 0);
  return ordered;
}
