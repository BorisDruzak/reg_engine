import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";

import { ApiError, readPublicLinkPreview, updatePublicLinkFieldValue } from "@/api/client";
import type { PublicLinkPreviewFieldRead } from "@/api/types";
import { FieldEditorControl } from "@/features/cards/FieldEditorControl";
import {
  type FieldEditorState,
  coerceEditorValue,
  formatValue,
  initialEditorValue,
} from "@/features/cards/fieldEditorUtils";

export function PublicLinkEditPage() {
  const { rawToken = "" } = useParams<{ rawToken: string }>();
  const previewQuery = useQuery({
    queryKey: ["public-link-preview", rawToken],
    queryFn: () => readPublicLinkPreview(rawToken),
    enabled: Boolean(rawToken),
  });

  return (
    <main className="public-shell">
      <header className="public-header">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true" />
          <div>
            <h1>Registry Engine</h1>
            <span>Public card edit</span>
          </div>
        </div>
      </header>

      <section className="public-main">
        {!rawToken && <p className="data-alert">Public link token is missing.</p>}
        {previewQuery.error && <p className="data-alert">{errorText(previewQuery.error)}</p>}
        {previewQuery.isLoading && <p className="public-muted">Loading card</p>}

        {previewQuery.data && (
          <div className="stack">
            <header className="public-title">
              <div>
                <p className="section-kicker">Public edit</p>
                <h2>{previewQuery.data.display_name}</h2>
              </div>
              <span>Expires {formatDateTime(previewQuery.data.expires_at)}</span>
            </header>

            {previewQuery.data.blocks.length === 0 ? (
              <p className="data-alert">This public link has no editable fields.</p>
            ) : (
              previewQuery.data.blocks.map((block) => (
                <section className="data-panel" key={block.block_id}>
                  <header>
                    <h3>{block.title}</h3>
                  </header>
                  <div className="field-editor-list">
                    {block.instances.flatMap((instance) =>
                      instance.fields.map((field) => (
                        <PublicFieldEditor
                          key={`${block.block_id}:${instance.block_instance_id ?? instance.ordinal}:${field.field_id}`}
                          blockInstanceId={instance.block_instance_id}
                          field={field}
                          instanceOrdinal={instance.ordinal}
                          rawToken={rawToken}
                        />
                      )),
                    )}
                  </div>
                </section>
              ))
            )}
          </div>
        )}
      </section>
    </main>
  );
}

function PublicFieldEditor({
  rawToken,
  blockInstanceId,
  instanceOrdinal,
  field,
}: {
  rawToken: string;
  blockInstanceId: string | null;
  instanceOrdinal: number;
  field: PublicLinkPreviewFieldRead;
}) {
  const queryClient = useQueryClient();
  const [rawValue, setRawValue] = useState<FieldEditorState>(() => initialEditorValue(field));
  const [localError, setLocalError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const mutation = useMutation({
    mutationFn: (value: unknown) =>
      updatePublicLinkFieldValue(rawToken, field.field_id, value, blockInstanceId),
    onSuccess: async () => {
      setSaved(true);
      await queryClient.invalidateQueries({ queryKey: ["public-link-preview", rawToken] });
    },
  });

  function updateRawValue(nextValue: FieldEditorState) {
    setRawValue(nextValue);
    setSaved(false);
    setLocalError(null);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      mutation.mutate(coerceEditorValue(field.field_type, rawValue));
    } catch (error) {
      setLocalError(errorText(error));
    }
  }

  return (
    <form className="field-editor-row" onSubmit={handleSubmit}>
      <div className="field-editor-meta">
        <strong>{field.label}</strong>
        <span>
          instance {instanceOrdinal + 1} / {field.field_type}
        </span>
        <span>Current: {formatValue(field.value)}</span>
      </div>
      <label className="field-editor-control">
        <span>{field.label}</span>
        <FieldEditorControl
          fieldType={field.field_type}
          label={field.label}
          options={field.options}
          value={rawValue}
          onChange={updateRawValue}
        />
      </label>
      <button type="submit" className="primary-button" disabled={mutation.isPending}>
        Save {field.label}
      </button>
      {(localError || mutation.error) && (
        <p className="inline-alert">{localError ?? errorText(mutation.error)}</p>
      )}
      {saved && <p className="inline-success">Saved {field.label}</p>}
    </form>
  );
}

function errorText(error: unknown) {
  if (error instanceof ApiError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Request failed";
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
