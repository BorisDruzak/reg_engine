import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { closeCardCreationLink, createCardCreationLink, listCardCreationLinks } from "@/api/client";
import type { CardTemplateRead, OrganizationRead } from "@/api/types";
import { MutationFeedback } from "@/components/common/AdminMutation";
import { errorText } from "@/components/common/dataUtils";

export type CardCreationLinksPanelMode = "create" | "list";

export function CardCreationLinksPanel({
  registryId,
  token,
  organizations,
  templates,
  mode,
  onShowList,
}: {
  registryId: string;
  token: string;
  organizations: OrganizationRead[];
  templates: CardTemplateRead[];
  mode: CardCreationLinksPanelMode;
  onShowList: () => void;
}) {
  const queryClient = useQueryClient();
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [organizationIds, setOrganizationIds] = useState<string[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);
  const listQuery = useQuery({
    queryKey: ["card-creation-links", token, registryId],
    queryFn: () => listCardCreationLinks(token, registryId),
    enabled: Boolean(token && registryId),
  });
  const createMutation = useMutation({
    mutationFn: () =>
      createCardCreationLink(token, registryId, {
        card_template_id: templateId,
        organization_ids: organizationIds,
      }),
    onSuccess: async () => {
      setLocalError(null);
      setOrganizationIds([]);
      onShowList();
      await queryClient.invalidateQueries({ queryKey: ["card-creation-links", token, registryId] });
    },
  });
  const closeMutation = useMutation({
    mutationFn: (creationLinkId: string) => closeCardCreationLink(token, creationLinkId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["card-creation-links", token, registryId] });
    },
  });

  function toggleOrganization(organizationId: string, checked: boolean) {
    setOrganizationIds((current) =>
      checked
        ? current.includes(organizationId)
          ? current
          : [...current, organizationId]
        : current.filter((item) => item !== organizationId),
    );
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!templateId || organizationIds.length === 0) {
      setLocalError("Выберите шаблон и хотя бы одну организацию.");
      return;
    }
    setLocalError(null);
    createMutation.mutate();
  }

  return (
    <section
      className="data-panel card-creation-links-panel"
      aria-label="Ссылки на создание карточек"
    >
      <header className="panel-toolbar">
        <div>
          <h3>Ссылки на создание карточек</h3>
          <p className="public-muted">
            Выбор организации по ссылке создаёт новую карточку-черновик и отдельную ссылку на неё.
          </p>
        </div>
      </header>

      {mode === "create" && (
        <form className="panel-form" onSubmit={submit}>
          <label className="field-editor-control">
            <span>Шаблон карточки</span>
            <select
              value={templateId}
              onChange={(event) => setTemplateId(event.currentTarget.value)}
            >
              <option value="">Выберите шаблон</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="card-creation-link-organizations">
            <legend>Организации, доступные по ссылке</legend>
            <p className="public-muted">
              Посетитель сможет выбрать только отмеченную организацию. Права администратора ему не
              передаются.
            </p>
            {organizations.map((organization) => (
              <label key={organization.id} className="checkbox-control">
                <input
                  checked={organizationIds.includes(organization.id)}
                  type="checkbox"
                  onChange={(event) =>
                    toggleOrganization(organization.id, event.currentTarget.checked)
                  }
                />
                <span>{organization.name}</span>
              </label>
            ))}
          </fieldset>
          <div className="row-actions">
            <button className="primary-button" disabled={createMutation.isPending} type="submit">
              Создать ссылку
            </button>
          </div>
          <MutationFeedback error={localError ? new Error(localError) : createMutation.error} />
        </form>
      )}

      {mode === "list" && (
        <div className="stack">
          {listQuery.isLoading && <p className="public-muted">Загрузка ссылок…</p>}
          {listQuery.error && <p className="data-alert">{errorText(listQuery.error)}</p>}
          {listQuery.data?.items.length === 0 && <p className="data-empty">Нет ссылок.</p>}
          <ul className="public-link-list">
            {listQuery.data?.items.map((link) => {
              const url = `${window.location.origin}/public/create/${link.raw_token}`;
              return (
                <li key={link.id}>
                  <div>
                    <strong>{link.card_template_name}</strong>
                    <span>
                      {link.closed_at ? "Закрыта" : "Открыта"} ·{" "}
                      {link.organizations.map((item) => item.name).join(", ")}
                    </span>
                  </div>
                  <label className="public-link-url-control">
                    <span>Ссылка на создание</span>
                    <input readOnly value={url} />
                  </label>
                  {!link.closed_at && (
                    <button
                      type="button"
                      className="danger-button"
                      disabled={closeMutation.isPending}
                      onClick={() => {
                        if (window.confirm("Закрыть ссылку на создание новых карточек?")) {
                          closeMutation.mutate(link.id);
                        }
                      }}
                    >
                      Закрыть ссылку
                    </button>
                  )}
                  {link.created_cards.length > 0 && (
                    <details>
                      <summary>Созданные карточки: {link.created_cards.length}</summary>
                      <ul className="public-link-list">
                        {link.created_cards.map((card) => (
                          <li key={card.card_id}>
                            <div>
                              <strong>{card.display_name}</strong>
                              <span>{card.organization_name}</span>
                            </div>
                            <label className="public-link-url-control">
                              <span>Ссылка на карточку</span>
                              <input
                                readOnly
                                value={`${window.location.origin}/public/edit/${card.child_raw_token}`}
                              />
                            </label>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
          <MutationFeedback error={closeMutation.error} />
        </div>
      )}
    </section>
  );
}
