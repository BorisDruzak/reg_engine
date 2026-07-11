import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { createPublicLink } from "@/api/client";
import type {
  CardTemplateLayoutRead,
  CardPublicAccessRead,
  FormBlockRead,
  FormFieldRead,
  PublicLinkTokenRead,
} from "@/api/types";
import { uiText } from "@/app/uiText";
import { errorText } from "@/components/common/dataUtils";

import { PublicLinkReviewPanel } from "./PublicLinkReviewPanel";

export function PublicLinkQuickControl({
  blocks,
  cardId,
  fields,
  layout,
  publicAccess = null,
  token,
}: {
  blocks: FormBlockRead[];
  cardId: string;
  fields: FormFieldRead[];
  layout: CardTemplateLayoutRead | null;
  publicAccess?: CardPublicAccessRead | null;
  token: string;
}) {
  const queryClient = useQueryClient();
  const eligibleFieldIds = useMemo(
    () =>
      new Set(
        publicAccess?.fields
          .filter((field) => field.public_visible)
          .map((field) => field.field_id) ?? [],
      ),
    [publicAccess?.fields],
  );
  const [created, setCreated] = useState<PublicLinkTokenRead | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const createMutation = useMutation({
    mutationFn: () =>
      createPublicLink(token, cardId, {
        expires_in_days: 7,
        max_attachment_uploads: null,
        review_enabled: true,
      }),
    onSuccess: async (nextCreated) => {
      setCreated(nextCreated);
      setCopyMessage(null);
      await queryClient.invalidateQueries({ queryKey: ["public-links", token, cardId] });
    },
  });
  const canCreate = Boolean(publicAccess?.public_view_enabled && eligibleFieldIds.size > 0);
  const url = created ? publicLinkEditUrl(created.raw_token) : null;

  async function copyUrl() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopyMessage("Ссылка скопирована");
    } catch {
      setCopyMessage("Не удалось скопировать ссылку");
    }
  }

  return (
    <div className="card-public-link-quick-control">
      <button
        type="button"
        className="primary-button"
        aria-label={uiText.publicLink}
        disabled={!canCreate || createMutation.isPending}
        onClick={() => createMutation.mutate()}
      >
        {uiText.publicLink}
      </button>
      {!canCreate ? (
        <p className="public-link-quick-hint">{uiText.publicLinkSchemaRequired}</p>
      ) : null}
      {createMutation.error ? (
        <p className="inline-alert">{errorText(createMutation.error)}</p>
      ) : null}
      {url ? (
        <div className="card-public-link-created" role="status">
          <label>
            <span>{uiText.publicLinkUrl}</span>
            <input aria-label={uiText.publicLinkUrl} readOnly value={url} />
          </label>
          <button type="button" className="ghost-button" onClick={() => void copyUrl()}>
            Копировать
          </button>
          {copyMessage ? <span>{copyMessage}</span> : null}
        </div>
      ) : null}
      <details className="card-public-link-lifecycle">
        <summary>Управление публичными ссылками</summary>
        <PublicLinkReviewPanel
          blocks={blocks}
          cardId={cardId}
          fields={fields}
          hideCreateAction
          layout={layout}
          token={token}
        />
      </details>
    </div>
  );
}

function publicLinkEditUrl(rawToken: string) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/public/edit/${rawToken}`;
}
