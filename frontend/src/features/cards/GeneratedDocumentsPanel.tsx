import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import {
  archiveGeneratedDocument,
  downloadGeneratedDocumentContent,
  generateDocument,
  listDocumentTemplates,
  listGeneratedDocuments,
} from "@/api/client";
import type { GeneratedDocumentRead } from "@/api/types";
import { formatUiDateTime, uiText } from "@/app/uiText";
import { DataAlert, Panel } from "@/components/common/DataSurfaces";
import { errorText } from "@/components/common/dataUtils";

export function GeneratedDocumentsPanel({
  cardId,
  registryId,
  token,
}: {
  cardId: string;
  registryId: string;
  token: string;
}) {
  const queryClient = useQueryClient();
  const [templateId, setTemplateId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const templatesQuery = useQuery({
    queryKey: ["document-templates", token, registryId],
    queryFn: () => listDocumentTemplates(token, registryId),
    enabled: Boolean(token && registryId),
  });
  const documentsQuery = useQuery({
    queryKey: ["generated-documents", token, cardId],
    queryFn: () => listGeneratedDocuments(token, cardId),
    enabled: Boolean(token && cardId),
  });
  const selectedTemplateId = templateId || templatesQuery.data?.items[0]?.id || "";
  const generateMutation = useMutation({
    mutationFn: () => generateDocument(token, cardId, selectedTemplateId),
    onSuccess: async () => {
      setMessage(uiText.documentGenerated);
      setLocalError(null);
      await queryClient.invalidateQueries({ queryKey: ["generated-documents", token, cardId] });
      await queryClient.invalidateQueries({ queryKey: ["audit-events", token] });
    },
    onError: (error) => setLocalError(errorText(error)),
  });
  const downloadMutation = useMutation({
    mutationFn: (document: GeneratedDocumentRead) =>
      downloadGeneratedDocumentContent(token, document.id),
    onSuccess: ({ blob, filename }) => {
      triggerBrowserDownload(blob, filename);
      setMessage(uiText.documentDownloaded);
      setLocalError(null);
    },
    onError: (error) => setLocalError(errorText(error)),
  });
  const archiveMutation = useMutation({
    mutationFn: (documentId: string) => archiveGeneratedDocument(token, documentId),
    onSuccess: async () => {
      setMessage(uiText.documentArchived);
      setLocalError(null);
      await queryClient.invalidateQueries({ queryKey: ["generated-documents", token, cardId] });
      await queryClient.invalidateQueries({ queryKey: ["audit-events", token] });
    },
    onError: (error) => setLocalError(errorText(error)),
  });

  return (
    <Panel title={uiText.documents}>
      <div className="document-generator">
        <label className="field-editor-control">
          <span>{uiText.template}</span>
          <select
            value={selectedTemplateId}
            onChange={(event) => setTemplateId(event.target.value)}
          >
            {(templatesQuery.data?.items ?? []).map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="primary-button"
          disabled={!selectedTemplateId || generateMutation.isPending}
          onClick={() => generateMutation.mutate()}
        >
          {uiText.generateDocument}
        </button>
      </div>
      {templatesQuery.data?.items.length === 0 && (
        <p className="data-empty">{uiText.noDocumentTemplates}</p>
      )}
      {message && <p className="inline-success attachment-status">{message}</p>}
      {localError && <p className="inline-alert attachment-status">{localError}</p>}
      <DataAlert error={templatesQuery.error} />
      <DataAlert error={documentsQuery.error} />
      <GeneratedDocumentList
        items={documentsQuery.data?.items ?? []}
        downloadingId={downloadMutation.variables?.id ?? null}
        archivingId={archiveMutation.variables ?? null}
        onDownload={(document) => downloadMutation.mutate(document)}
        onArchive={(document) => archiveMutation.mutate(document.id)}
      />
    </Panel>
  );
}

function GeneratedDocumentList({
  items,
  downloadingId,
  archivingId,
  onDownload,
  onArchive,
}: {
  items: GeneratedDocumentRead[];
  downloadingId: string | null;
  archivingId: string | null;
  onDownload: (document: GeneratedDocumentRead) => void;
  onArchive: (document: GeneratedDocumentRead) => void;
}) {
  if (items.length === 0) {
    return <p className="data-empty">{uiText.noDocuments}</p>;
  }

  return (
    <ul className="file-action-list">
      {items.map((document) => (
        <li key={document.id}>
          <div>
            <strong>{document.title}</strong>
            <span>
              {document.output_filename} / {document.render_status} /{" "}
              {formatUiDateTime(document.created_at)}
            </span>
          </div>
          <div className="row-actions">
            <button
              type="button"
              className="ghost-button"
              aria-label={`${uiText.download} документ ${document.title}`}
              disabled={downloadingId === document.id}
              onClick={() => onDownload(document)}
            >
              {uiText.download}
            </button>
            <button
              type="button"
              className="ghost-button"
              aria-label={`${uiText.archive} документ ${document.title}`}
              disabled={archivingId === document.id}
              onClick={() => onArchive(document)}
            >
              {uiText.archive}
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
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
