import { useQuery } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { firstSaveCardFromCreationLink, readPublicCardCreationLinkPreview } from "@/api/client";
import { uiText } from "@/app/uiText";
import { errorText } from "@/components/common/dataUtils";

import { PublicCardLayout, type PublicFieldValueSaver } from "./PublicLinkEditPage";

export function PublicCardCreationPage() {
  const { rawToken = "" } = useParams<{ rawToken: string }>();
  const navigate = useNavigate();
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const previewQuery = useQuery({
    queryKey: ["public-card-creation-preview", rawToken, organizationId],
    queryFn: () => readPublicCardCreationLinkPreview(rawToken, organizationId),
    enabled: Boolean(rawToken),
  });
  const preview = previewQuery.data;
  const selectedOrganizationId = organizationId ?? preview?.selected_organization_id ?? null;

  const saveFieldValue = useCallback<PublicFieldValueSaver>(
    async ({ fieldId, value, blockInstanceId }) => {
      if (!selectedOrganizationId) {
        throw new Error("Сначала выберите организацию карточки.");
      }
      const created = await firstSaveCardFromCreationLink(rawToken, {
        organization_id: selectedOrganizationId,
        field_id: fieldId,
        value,
        block_instance_id: blockInstanceId,
      });
      navigate(`/public/edit/${created.child_raw_token}`, { replace: true });
      return { value };
    },
    [navigate, rawToken, selectedOrganizationId],
  );

  return (
    <main className="public-shell">
      <header className="public-header">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true" />
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
                <h2>Заполните первое поле новой карточки</h2>
                <h3>{preview.card_template_name}</h3>
              </div>
              <span>Карточка появится после первого непустого сохранения.</span>
            </header>

            {preview.organizations.length > 1 && (
              <label className="field-editor-control public-card-creation-organization">
                <span>{uiText.cardOrganization}</span>
                <select
                  aria-label={uiText.cardOrganization}
                  value={selectedOrganizationId ?? ""}
                  onChange={(event) => setOrganizationId(event.currentTarget.value || null)}
                >
                  <option value="">Выберите организацию</option>
                  {preview.organizations.map((organization) => (
                    <option key={organization.id} value={organization.id}>
                      {organization.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {!selectedOrganizationId ? (
              <p className="data-alert">Выберите организацию, чтобы перейти к заполнению.</p>
            ) : preview.blocks.length === 0 ? (
              <p className="data-alert">В шаблоне нет доступных для заполнения полей.</p>
            ) : (
              <PublicCardLayout
                confirmedFieldValues={publicConfirmedFieldValues(preview)}
                onFieldSaveStateChange={() => undefined}
                onFieldValueConfirmed={() => undefined}
                onLifecycleDenial={async () => false}
                preview={preview}
                saveFieldValue={saveFieldValue}
              />
            )}
          </div>
        )}
      </section>
    </main>
  );
}

function publicConfirmedFieldValues(preview: {
  blocks: Array<{
    instances: Array<{
      block_instance_id: string | null;
      ordinal: number;
      fields: Array<{ field_id: string; value: unknown }>;
    }>;
  }>;
}) {
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
