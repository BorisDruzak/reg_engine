import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { createCardDraftFromCreationLink, readPublicCardCreationLinkPreview } from "@/api/client";
import { uiText } from "@/app/uiText";
import { BrandMark } from "@/components/common/BrandMark";
import { errorText } from "@/components/common/dataUtils";

export function PublicCardCreationPage() {
  const { rawToken = "" } = useParams<{ rawToken: string }>();
  const navigate = useNavigate();
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [actorName, setActorName] = useState("");
  const [actorHint, setActorHint] = useState<string | null>(null);
  const actorHintTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const normalizedActorName = actorName.trim().replace(/\s+/g, " ");
  useEffect(
    () => () => {
      if (actorHintTimeoutRef.current) clearTimeout(actorHintTimeoutRef.current);
    },
    [],
  );
  const previewQuery = useQuery({
    queryKey: ["public-card-creation-preview", rawToken],
    queryFn: () => readPublicCardCreationLinkPreview(rawToken),
    enabled: Boolean(rawToken),
  });
  const preview = previewQuery.data;
  const createDraftMutation = useMutation({
    mutationFn: (selectedOrganizationId: string) =>
      createCardDraftFromCreationLink(rawToken, normalizedActorName, selectedOrganizationId),
    onSuccess: (created) => {
      navigate(`/public/edit/${created.child_raw_token}`, { replace: true });
    },
  });

  function requireActorName() {
    if (normalizedActorName) return true;
    setActorHint("Сначала укажите ФИО");
    if (actorHintTimeoutRef.current) clearTimeout(actorHintTimeoutRef.current);
    actorHintTimeoutRef.current = setTimeout(() => setActorHint(null), 3000);
    return false;
  }

  function selectOrganization(selectedOrganizationId: string) {
    if (!selectedOrganizationId) {
      setOrganizationId(null);
      return;
    }
    if (!requireActorName()) {
      setOrganizationId(null);
      return;
    }
    setOrganizationId(selectedOrganizationId);
    createDraftMutation.mutate(selectedOrganizationId);
  }

  return (
    <main className="public-shell">
      <header className="public-header">
        <div className="brand-lockup">
          <BrandMark />
          <div>
            <h1>{uiText.productName}</h1>
            <span>Создание карточки</span>
          </div>
        </div>
      </header>

      <section className="public-main">
        {!rawToken && <p className="data-alert">Ссылка на создание карточки не указана.</p>}
        {previewQuery.error && <p className="data-alert">{errorText(previewQuery.error)}</p>}
        {previewQuery.isLoading && <p className="public-muted">{uiText.loadingCard}</p>}
        {preview && (
          <div className="stack">
            <header className="public-title">
              <div>
                <p className="section-kicker">Создание карточки</p>
                <h2>Выберите организацию новой карточки</h2>
                <h3>{preview.card_template_name}</h3>
              </div>
              <span>После выбора откроется новая карточка для заполнения.</span>
            </header>

            <label className="field-editor-control">
              <span>ФИО</span>
              <input
                aria-label="ФИО"
                autoComplete="name"
                value={actorName}
                onChange={(event) => {
                  setActorName(event.currentTarget.value);
                  setActorHint(null);
                }}
              />
            </label>
            {actorHint && (
              <p className="inline-alert" role="status" aria-label="ФИО">
                {actorHint}
              </p>
            )}

            <label className="field-editor-control public-card-creation-organization">
              <span>{uiText.cardOrganization}</span>
              <select
                aria-label={uiText.cardOrganization}
                disabled={createDraftMutation.isPending}
                value={organizationId ?? ""}
                onChange={(event) => selectOrganization(event.currentTarget.value)}
              >
                <option value="">Выберите организацию</option>
                {preview.organizations.map((organization) => (
                  <option key={organization.id} value={organization.id}>
                    {organization.name}
                  </option>
                ))}
              </select>
            </label>
            {createDraftMutation.isPending && <p className="public-muted">Создаём карточку…</p>}
            {createDraftMutation.error && (
              <p className="data-alert">{errorText(createDraftMutation.error)}</p>
            )}
            {!createDraftMutation.isPending && !createDraftMutation.error && (
              <p className="public-muted">
                Выберите организацию из списка, чтобы начать заполнение.
              </p>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
