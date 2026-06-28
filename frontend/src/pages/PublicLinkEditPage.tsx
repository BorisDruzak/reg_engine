import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";

import {
  downloadPublicLinkAttachmentContent,
  listPublicLinkAttachments,
  readPublicLinkPreview,
  updatePublicLinkFieldValue,
  uploadPublicLinkAttachment,
} from "@/api/client";
import type { PublicLinkAttachmentRead, PublicLinkPreviewFieldRead } from "@/api/types";
import {
  fieldTypeLabel,
  formatUiDateTime,
  instanceLabel,
  saveLabel,
  savedLabel,
  uiText,
} from "@/app/uiText";
import { errorText } from "@/components/common/dataUtils";
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
            <h1>{uiText.productName}</h1>
            <span>{uiText.publicCardEdit}</span>
          </div>
        </div>
      </header>

      <section className="public-main">
        {!rawToken && <p className="data-alert">{uiText.publicTokenMissing}</p>}
        {previewQuery.error && <p className="data-alert">{errorText(previewQuery.error)}</p>}
        {previewQuery.isLoading && <p className="public-muted">{uiText.loadingCard}</p>}

        {previewQuery.data && (
          <div className="stack">
            <header className="public-title">
              <div>
                <p className="section-kicker">{uiText.publicEdit}</p>
                <h2>{previewQuery.data.display_name}</h2>
              </div>
              <span>
                {uiText.expires} {formatUiDateTime(previewQuery.data.expires_at)}
              </span>
            </header>

            {previewQuery.data.blocks.length === 0 ? (
              <p className="data-alert">{uiText.noEditablePublicFields}</p>
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
            <PublicLinkAttachmentsPanel rawToken={rawToken} />
          </div>
        )}
      </section>
    </main>
  );
}

function PublicLinkAttachmentsPanel({ rawToken }: { rawToken: string }) {
  const queryClient = useQueryClient();
  const formRef = useRef<HTMLFormElement>(null);
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const attachmentsQuery = useQuery({
    queryKey: ["public-link-attachments", rawToken],
    queryFn: () => listPublicLinkAttachments(rawToken),
    enabled: Boolean(rawToken),
  });
  const uploadMutation = useMutation({
    mutationFn: () => {
      if (!file) {
        throw new Error(uiText.file);
      }
      return uploadPublicLinkAttachment(rawToken, { file, title });
    },
    onSuccess: async () => {
      setMessage(uiText.fileUploaded);
      setLocalError(null);
      setTitle("");
      setFile(null);
      formRef.current?.reset();
      await queryClient.invalidateQueries({ queryKey: ["public-link-attachments", rawToken] });
    },
    onError: (error) => setLocalError(errorText(error)),
  });
  const downloadMutation = useMutation({
    mutationFn: (attachment: PublicLinkAttachmentRead) =>
      downloadPublicLinkAttachmentContent(rawToken, attachment.id),
    onSuccess: ({ blob, filename }) => {
      triggerBrowserDownload(blob, filename);
      setMessage(uiText.fileDownloaded);
      setLocalError(null);
    },
    onError: (error) => setLocalError(errorText(error)),
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    uploadMutation.mutate();
  }

  return (
    <section className="data-panel">
      <header>
        <h3>{uiText.attachments}</h3>
      </header>
      <form ref={formRef} className="attachment-form" onSubmit={handleSubmit}>
        <label className="field-editor-control">
          <span>{uiText.fileTitle}</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label className="field-editor-control">
          <span>{uiText.file}</span>
          <input
            aria-label={uiText.file}
            type="file"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </label>
        <button
          type="submit"
          className="primary-button"
          disabled={!file || uploadMutation.isPending}
        >
          {uiText.uploadFile}
        </button>
      </form>
      {message && <p className="inline-success attachment-status">{message}</p>}
      {localError && <p className="inline-alert attachment-status">{localError}</p>}
      {attachmentsQuery.error && <p className="data-alert">{errorText(attachmentsQuery.error)}</p>}
      <PublicAttachmentList
        items={attachmentsQuery.data?.items ?? []}
        downloadingId={downloadMutation.isPending ? (downloadMutation.variables?.id ?? null) : null}
        onDownload={(attachment) => downloadMutation.mutate(attachment)}
      />
    </section>
  );
}

function PublicAttachmentList({
  items,
  downloadingId,
  onDownload,
}: {
  items: PublicLinkAttachmentRead[];
  downloadingId: string | null;
  onDownload: (attachment: PublicLinkAttachmentRead) => void;
}) {
  if (items.length === 0) {
    return <p className="data-empty">{uiText.noFiles}</p>;
  }

  return (
    <ul className="file-action-list">
      {items.map((attachment) => {
        const title = attachment.title || attachment.original_filename;
        return (
          <li key={attachment.id}>
            <div>
              <strong>{title}</strong>
              <span>
                {attachment.original_filename} / {formatBytes(attachment.content_length_bytes)} /{" "}
                {scannerStatusLabel(attachment.scanner_status)} /{" "}
                {formatUiDateTime(attachment.created_at)}
              </span>
            </div>
            <div className="row-actions">
              <button
                type="button"
                className="ghost-button"
                aria-label={`${uiText.download} файл ${title}`}
                disabled={downloadingId === attachment.id}
                onClick={() => onDownload(attachment)}
              >
                {uiText.download}
              </button>
            </div>
          </li>
        );
      })}
    </ul>
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
          {instanceLabel(instanceOrdinal)} / {fieldTypeLabel(field.field_type)}
        </span>
        <span>
          {uiText.currentValue}: {formatValue(field.value)}
        </span>
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
        {saveLabel(field.label)}
      </button>
      {(localError || mutation.error) && (
        <p className="inline-alert">{localError ?? errorText(mutation.error)}</p>
      )}
      {saved && <p className="inline-success">{savedLabel(field.label)}</p>}
    </form>
  );
}

function formatBytes(value: number) {
  if (value < 1024) {
    return `${value} Б`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} КБ`;
  }
  return `${(value / (1024 * 1024)).toFixed(1)} МБ`;
}

function scannerStatusLabel(value: string) {
  if (value === "deferred") {
    return uiText.scannerDeferred;
  }
  return value;
}

function triggerBrowserDownload(blob: Blob, filename: string) {
  if (typeof document === "undefined" || typeof window.URL.createObjectURL !== "function") {
    return;
  }
  const href = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  try {
    link.click();
  } catch {
    // Test and embedded browser environments can block programmatic downloads.
  } finally {
    if (typeof window.URL.revokeObjectURL === "function") {
      window.URL.revokeObjectURL(href);
    }
  }
}
