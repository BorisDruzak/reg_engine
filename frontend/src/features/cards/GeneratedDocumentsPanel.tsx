import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import {
  archiveDocumentTemplate,
  archiveGeneratedDocument,
  createDocumentTemplate,
  downloadGeneratedDocumentContent,
  generateDocument,
  generatePdfDocument,
  listDocumentTemplates,
  listGeneratedDocuments,
} from "@/api/client";
import type { DocumentTemplateRead, GeneratedDocumentRead } from "@/api/types";
import { generateTechnicalCode } from "@/app/technicalCode";
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
  const [templateName, setTemplateName] = useState("");
  const [templateDescription, setTemplateDescription] = useState("");
  const [templateBody, setTemplateBody] = useState("");
  const [outputFilenameTemplate, setOutputFilenameTemplate] = useState(
    "{{ card.display_name }}.docx",
  );
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
  const selectedTemplate = (templatesQuery.data?.items ?? []).find(
    (template) => template.id === selectedTemplateId,
  );
  const canCreateTemplate = Boolean(
    templateName.trim() && templateBody.trim() && outputFilenameTemplate.trim(),
  );
  const createTemplateMutation = useMutation({
    mutationFn: () =>
      createDocumentTemplate(token, registryId, {
        code: generateTechnicalCode(
          templateName,
          "template",
          (templatesQuery.data?.items ?? []).map((template) => template.code),
        ),
        name: templateName.trim(),
        description: templateDescription.trim() || null,
        template_body: templateBody,
        output_filename_template: outputFilenameTemplate.trim(),
      }),
    onSuccess: async (template) => {
      setMessage(uiText.templateCreated);
      setLocalError(null);
      setTemplateId(template.id);
      setTemplateName("");
      setTemplateDescription("");
      setTemplateBody("");
      setOutputFilenameTemplate("{{ card.display_name }}.docx");
      await queryClient.invalidateQueries({ queryKey: ["document-templates", token, registryId] });
      await queryClient.invalidateQueries({ queryKey: ["audit-events", token] });
    },
    onError: (error) => setLocalError(errorText(error)),
  });
  const archiveTemplateMutation = useMutation({
    mutationFn: (documentTemplateId: string) => archiveDocumentTemplate(token, documentTemplateId),
    onSuccess: async (template) => {
      setMessage(uiText.templateArchived);
      setLocalError(null);
      if (template.id === selectedTemplateId) {
        setTemplateId("");
      }
      await queryClient.invalidateQueries({ queryKey: ["document-templates", token, registryId] });
      await queryClient.invalidateQueries({ queryKey: ["audit-events", token] });
    },
    onError: (error) => setLocalError(errorText(error)),
  });
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
  const generatePdfMutation = useMutation({
    mutationFn: () =>
      generatePdfDocument(
        token,
        cardId,
        selectedTemplateId,
        selectedTemplate ? `${selectedTemplate.name} PDF` : undefined,
      ),
    onSuccess: async () => {
      setMessage(uiText.pdfGenerated);
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
        <button
          type="button"
          className="ghost-button"
          disabled={!selectedTemplateId || generatePdfMutation.isPending}
          onClick={() => generatePdfMutation.mutate()}
        >
          {uiText.generatePdfDocument}
        </button>
      </div>
      {templatesQuery.data?.items.length === 0 && (
        <p className="data-empty">{uiText.noDocumentTemplates}</p>
      )}
      <section className="template-manager" aria-labelledby="document-templates-heading">
        <h3 id="document-templates-heading">{uiText.documentTemplates}</h3>
        <form
          className="template-form"
          onSubmit={(event) => {
            event.preventDefault();
            createTemplateMutation.mutate();
          }}
        >
          <label className="field-editor-control">
            <span>{uiText.templateName}</span>
            <input
              required
              value={templateName}
              onChange={(event) => setTemplateName(event.target.value)}
            />
          </label>
          <label className="field-editor-control">
            <span>{uiText.templateDescription}</span>
            <input
              value={templateDescription}
              onChange={(event) => setTemplateDescription(event.target.value)}
            />
          </label>
          <label className="field-editor-control">
            <span>{uiText.outputFilenameTemplate}</span>
            <input
              required
              value={outputFilenameTemplate}
              onChange={(event) => setOutputFilenameTemplate(event.target.value)}
            />
          </label>
          <label className="field-editor-control template-body-control">
            <span>{uiText.templateBody}</span>
            <textarea
              required
              value={templateBody}
              onChange={(event) => setTemplateBody(event.target.value)}
            />
          </label>
          <button
            type="submit"
            className="primary-button"
            disabled={!canCreateTemplate || createTemplateMutation.isPending}
          >
            {uiText.createTemplate}
          </button>
        </form>
        <DocumentTemplateList
          items={templatesQuery.data?.items ?? []}
          archivingId={archiveTemplateMutation.variables ?? null}
          onArchive={(template) => archiveTemplateMutation.mutate(template.id)}
        />
      </section>
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

function DocumentTemplateList({
  items,
  archivingId,
  onArchive,
}: {
  items: DocumentTemplateRead[];
  archivingId: string | null;
  onArchive: (template: DocumentTemplateRead) => void;
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <ul className="file-action-list template-list">
      {items.map((template) => (
        <li key={template.id}>
          <div>
            <strong>{template.name}</strong>
            <span>
              {uiText.technicalCode}: {template.code} / {template.output_filename_template} /{" "}
              {formatUiDateTime(template.created_at)}
            </span>
          </div>
          <div className="row-actions">
            <button
              type="button"
              className="ghost-button"
              aria-label={`${uiText.archive} шаблон ${template.name}`}
              disabled={archivingId === template.id}
              onClick={() => onArchive(template)}
            >
              {uiText.archive}
            </button>
          </div>
        </li>
      ))}
    </ul>
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
