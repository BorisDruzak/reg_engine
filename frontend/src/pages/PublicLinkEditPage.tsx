import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type CSSProperties, type FormEvent } from "react";
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
                  <div
                    className="field-editor-list"
                    style={publicFieldColumnsStyle(block.layout_columns)}
                  >
                    {block.instances.flatMap((instance) =>
                      instance.fields.map((field) =>
                        field.field_type === "static_text" ? (
                          <PublicStaticField
                            key={`${block.block_id}:${instance.block_instance_id ?? instance.ordinal}:${field.field_id}`}
                            field={field}
                            instanceOrdinal={instance.ordinal}
                          />
                        ) : (
                          <PublicFieldEditor
                            key={`${block.block_id}:${instance.block_instance_id ?? instance.ordinal}:${field.field_id}`}
                            blockInstanceId={instance.block_instance_id}
                            field={field}
                            instanceOrdinal={instance.ordinal}
                            rawToken={rawToken}
                          />
                        ),
                      ),
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
  const canUploadAttachments = attachmentsQuery.data?.can_upload_attachments ?? true;
  const uploadMutation = useMutation({
    mutationFn: () => {
      if (!file) {
        throw new Error(uiText.selectFile);
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
    if (!canUploadAttachments) {
      setMessage(null);
      setLocalError(uiText.publicLinkUploadLimitExhausted);
      return;
    }
    if (!file) {
      setMessage(null);
      setLocalError(uiText.selectFile);
      return;
    }
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
          <input
            disabled={!canUploadAttachments}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <label className="field-editor-control">
          <span>{uiText.file}</span>
          <input
            aria-label={uiText.file}
            disabled={!canUploadAttachments}
            type="file"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setLocalError(null);
            }}
          />
        </label>
        <button
          type="submit"
          className="primary-button"
          disabled={uploadMutation.isPending || !canUploadAttachments}
        >
          {uiText.uploadFile}
        </button>
      </form>
      {attachmentsQuery.data && !attachmentsQuery.data.can_upload_attachments && (
        <p className="inline-alert attachment-status">{uiText.publicLinkUploadLimitExhausted}</p>
      )}
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
    <form
      className={["field-editor-row", publicFieldLayoutClassName(field)].filter(Boolean).join(" ")}
      style={publicFieldSpanStyle(field)}
      onSubmit={handleSubmit}
    >
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
        <div className="field-editor-widget">
          <FieldEditorControl
            fieldType={field.field_type}
            label={field.label}
            options={field.options}
            value={rawValue}
            onChange={updateRawValue}
          />
        </div>
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

function PublicStaticField({
  field,
  instanceOrdinal,
}: {
  field: PublicLinkPreviewFieldRead;
  instanceOrdinal: number;
}) {
  return (
    <div
      className={["field-editor-row", "field-editor-static-row", publicFieldLayoutClassName(field)]
        .filter(Boolean)
        .join(" ")}
      style={publicFieldSpanStyle(field)}
    >
      <div className="field-editor-meta">
        <strong>{field.label}</strong>
        <span>
          {instanceLabel(instanceOrdinal)} / {fieldTypeLabel(field.field_type)}
        </span>
      </div>
      <div className="field-editor-control field-editor-static-text">
        <span>{field.label}</span>
        <div className="field-editor-static-text-body">{publicStaticTextContent(field)}</div>
      </div>
    </div>
  );
}

function publicFieldColumnsStyle(columns: number | null | undefined): CSSProperties {
  return { "--field-editor-columns": String(clampColumns(columns)) } as CSSProperties;
}

function publicFieldSpanStyle(field: PublicLinkPreviewFieldRead): CSSProperties {
  return {
    "--field-editor-span": String(displayConfigNumber(field, "column_span", 1)),
  } as CSSProperties;
}

function publicFieldLayoutClassName(field: PublicLinkPreviewFieldRead) {
  const labelPosition = displayConfigString(field, "label_position", "top");
  const separatorStyle = displayConfigString(field, "separator_style", "none");
  return [
    `field-editor-control--label-${labelPosition}`,
    separatorStyle !== "none" ? `field-editor-control--separator-${separatorStyle}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function publicStaticTextContent(field: PublicLinkPreviewFieldRead) {
  const value = field.options_config_json?.static_text;
  return typeof value === "string" && value.trim() ? value : uiText.empty;
}

function displayConfigString(field: PublicLinkPreviewFieldRead, key: string, fallback: string) {
  const value = field.display_config_json?.[key];
  return typeof value === "string" && value.trim() ? value : fallback;
}

function displayConfigNumber(field: PublicLinkPreviewFieldRead, key: string, fallback: number) {
  const value = field.display_config_json?.[key];
  return typeof value === "number" && Number.isFinite(value) ? clampColumns(value) : fallback;
}

function clampColumns(value: number | null | undefined) {
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.min(3, Math.max(1, Number(value)));
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
