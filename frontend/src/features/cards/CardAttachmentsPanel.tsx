import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type FormEvent } from "react";

import {
  archiveAttachment,
  downloadAttachmentContent,
  listAttachments,
  uploadAttachment,
} from "@/api/client";
import type { AttachmentRead } from "@/api/types";
import { formatUiDateTime, uiText } from "@/app/uiText";
import { DataAlert, Panel } from "@/components/common/DataSurfaces";
import { errorText } from "@/components/common/dataUtils";

export function CardAttachmentsPanel({
  cardId,
  token,
  canManage,
}: {
  cardId: string;
  token: string;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const formRef = useRef<HTMLFormElement>(null);
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const attachmentsQuery = useQuery({
    queryKey: ["attachments", token, cardId],
    queryFn: () => listAttachments(token, cardId),
    enabled: Boolean(token && cardId),
  });
  const uploadMutation = useMutation({
    mutationFn: () => {
      if (!file) {
        throw new Error(uiText.file);
      }
      return uploadAttachment(token, cardId, { file, title });
    },
    onSuccess: async () => {
      setMessage(uiText.fileUploaded);
      setLocalError(null);
      setTitle("");
      setFile(null);
      formRef.current?.reset();
      await queryClient.invalidateQueries({ queryKey: ["attachments", token, cardId] });
      await queryClient.invalidateQueries({ queryKey: ["audit-events", token] });
    },
    onError: (error) => setLocalError(errorText(error)),
  });
  const downloadMutation = useMutation({
    mutationFn: (attachment: AttachmentRead) => downloadAttachmentContent(token, attachment.id),
    onSuccess: ({ blob, filename }) => {
      triggerBrowserDownload(blob, filename);
      setMessage(uiText.fileDownloaded);
      setLocalError(null);
    },
    onError: (error) => setLocalError(errorText(error)),
  });
  const archiveMutation = useMutation({
    mutationFn: (attachmentId: string) => archiveAttachment(token, attachmentId),
    onSuccess: async () => {
      setMessage(uiText.fileArchived);
      setLocalError(null);
      await queryClient.invalidateQueries({ queryKey: ["attachments", token, cardId] });
      await queryClient.invalidateQueries({ queryKey: ["card", token, cardId] });
      await queryClient.invalidateQueries({ queryKey: ["audit-events", token] });
    },
    onError: (error) => setLocalError(errorText(error)),
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    uploadMutation.mutate();
  }

  return (
    <Panel title={uiText.attachments}>
      {canManage ? (
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
      ) : null}
      {message && <p className="inline-success attachment-status">{message}</p>}
      {localError && <p className="inline-alert attachment-status">{localError}</p>}
      <DataAlert error={attachmentsQuery.error} />
      <AttachmentList
        items={attachmentsQuery.data?.items ?? []}
        canManage={canManage}
        downloadingId={downloadMutation.variables?.id ?? null}
        archivingId={archiveMutation.variables ?? null}
        onDownload={(attachment) => downloadMutation.mutate(attachment)}
        onArchive={(attachment) => archiveMutation.mutate(attachment.id)}
      />
    </Panel>
  );
}

function AttachmentList({
  items,
  canManage,
  downloadingId,
  archivingId,
  onDownload,
  onArchive,
}: {
  items: AttachmentRead[];
  canManage: boolean;
  downloadingId: string | null;
  archivingId: string | null;
  onDownload: (attachment: AttachmentRead) => void;
  onArchive: (attachment: AttachmentRead) => void;
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
              {canManage ? (
                <button
                  type="button"
                  className="ghost-button"
                  aria-label={`${uiText.archive} файл ${title}`}
                  disabled={archivingId === attachment.id}
                  onClick={() => onArchive(attachment)}
                >
                  {uiText.archive}
                </button>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
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
