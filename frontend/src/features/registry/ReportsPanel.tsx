import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import {
  archiveReportRun,
  archiveReportTemplate,
  createReportTemplate,
  downloadReportRunContent,
  generateReportRun,
  listReportRuns,
  listReportTemplates,
  updateReportTemplate,
} from "@/api/client";
import type { ReportRunRead, ReportTemplateRead } from "@/api/types";
import { formatUiDateTime, reportRunStatusLabel, reportTypeLabel, uiText } from "@/app/uiText";
import { DataAlert, Panel } from "@/components/common/DataSurfaces";
import { errorText } from "@/components/common/dataUtils";

const reportTypes = ["registry_cards", "card_detail", "period_summary"];
const reportOutputFormats = ["json", "csv"];

export function ReportsPanel({
  selectedRegistryId,
  token,
}: {
  selectedRegistryId: string;
  token: string;
}) {
  const queryClient = useQueryClient();
  const [templateId, setTemplateId] = useState("");
  const [templateCode, setTemplateCode] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [templateDescription, setTemplateDescription] = useState("");
  const [reportType, setReportType] = useState("registry_cards");
  const [outputFormat, setOutputFormat] = useState("json");
  const [templateParametersJson, setTemplateParametersJson] = useState("");
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [editTemplateName, setEditTemplateName] = useState("");
  const [editTemplateDescription, setEditTemplateDescription] = useState("");
  const [editTemplateParametersJson, setEditTemplateParametersJson] = useState("");
  const [runParametersJson, setRunParametersJson] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const templatesQuery = useQuery({
    queryKey: ["report-templates", token, selectedRegistryId],
    queryFn: () => listReportTemplates(token, selectedRegistryId),
    enabled: Boolean(token && selectedRegistryId),
  });
  const runsQuery = useQuery({
    queryKey: ["report-runs", token, selectedRegistryId],
    queryFn: () => listReportRuns(token, selectedRegistryId),
    enabled: Boolean(token && selectedRegistryId),
  });
  const templates = useMemo(() => templatesQuery.data?.items ?? [], [templatesQuery.data?.items]);
  const selectedTemplateId = templateId || templates[0]?.id || "";
  const templateById = useMemo(
    () => new Map(templates.map((template) => [template.id, template])),
    [templates],
  );
  const canCreateTemplate = Boolean(
    selectedRegistryId && templateCode.trim() && templateName.trim() && reportType,
  );
  const canUpdateTemplate = Boolean(editingTemplateId && editTemplateName.trim());
  const createTemplateMutation = useMutation({
    mutationFn: () =>
      createReportTemplate(token, selectedRegistryId, {
        code: templateCode.trim(),
        name: templateName.trim(),
        description: templateDescription.trim() || null,
        report_type: reportType,
        default_parameters_json: parseJsonObjectOrNull(templateParametersJson),
        output_format: outputFormat,
      }),
    onSuccess: async (template) => {
      setMessage(uiText.reportTemplateCreated);
      setLocalError(null);
      setTemplateId(template.id);
      setTemplateCode("");
      setTemplateName("");
      setTemplateDescription("");
      setReportType("registry_cards");
      setOutputFormat("json");
      setTemplateParametersJson("");
      await invalidateReportData(queryClient, token, selectedRegistryId);
    },
    onError: (error) => setLocalError(errorText(error)),
  });
  const updateTemplateMutation = useMutation({
    mutationFn: () => {
      if (!editingTemplateId) {
        throw new Error(uiText.noReportTemplates);
      }
      return updateReportTemplate(token, editingTemplateId, {
        name: editTemplateName.trim(),
        description: editTemplateDescription.trim() || null,
        default_parameters_json: parseJsonObjectOrNull(editTemplateParametersJson),
      });
    },
    onSuccess: async () => {
      setMessage(uiText.reportTemplateUpdated);
      setLocalError(null);
      clearTemplateEdit();
      await invalidateReportData(queryClient, token, selectedRegistryId);
    },
    onError: (error) => setLocalError(errorText(error)),
  });
  const archiveTemplateMutation = useMutation({
    mutationFn: (reportTemplateId: string) => archiveReportTemplate(token, reportTemplateId),
    onSuccess: async (template) => {
      setMessage(uiText.reportTemplateArchived);
      setLocalError(null);
      if (template.id === selectedTemplateId) {
        setTemplateId("");
      }
      await invalidateReportData(queryClient, token, selectedRegistryId);
    },
    onError: (error) => setLocalError(errorText(error)),
  });
  const generateRunMutation = useMutation({
    mutationFn: () =>
      generateReportRun(token, selectedTemplateId, {
        parameters: parseJsonObjectOrNull(runParametersJson),
      }),
    onSuccess: async () => {
      setMessage(uiText.reportGenerated);
      setLocalError(null);
      await queryClient.invalidateQueries({ queryKey: ["report-runs", token, selectedRegistryId] });
      await queryClient.invalidateQueries({ queryKey: ["audit-events", token] });
    },
    onError: (error) => setLocalError(errorText(error)),
  });
  const downloadMutation = useMutation({
    mutationFn: (reportRun: ReportRunRead) => downloadReportRunContent(token, reportRun.id),
    onSuccess: ({ blob, filename }) => {
      triggerBrowserDownload(blob, filename);
      setMessage(uiText.reportDownloaded);
      setLocalError(null);
    },
    onError: (error) => setLocalError(errorText(error)),
  });
  const archiveRunMutation = useMutation({
    mutationFn: (reportRunId: string) => archiveReportRun(token, reportRunId),
    onSuccess: async () => {
      setMessage(uiText.reportArchived);
      setLocalError(null);
      await queryClient.invalidateQueries({ queryKey: ["report-runs", token, selectedRegistryId] });
      await queryClient.invalidateQueries({ queryKey: ["audit-events", token] });
    },
    onError: (error) => setLocalError(errorText(error)),
  });

  function startTemplateEdit(template: ReportTemplateRead) {
    setEditingTemplateId(template.id);
    setEditTemplateName(template.name);
    setEditTemplateDescription(template.description ?? "");
    setEditTemplateParametersJson(formatJsonObjectForEdit(template.default_parameters_json));
    setMessage(null);
    setLocalError(null);
  }

  function clearTemplateEdit() {
    setEditingTemplateId(null);
    setEditTemplateName("");
    setEditTemplateDescription("");
    setEditTemplateParametersJson("");
  }

  return (
    <Panel title={uiText.reports}>
      <section className="template-manager" aria-labelledby="report-templates-heading">
        <h3 id="report-templates-heading">{uiText.reportTemplates}</h3>
        <form
          className="template-form"
          onSubmit={(event) => {
            event.preventDefault();
            createTemplateMutation.mutate();
          }}
        >
          <label className="field-editor-control">
            <span>{uiText.reportTemplateCode}</span>
            <input
              required
              value={templateCode}
              onChange={(event) => setTemplateCode(event.target.value)}
            />
          </label>
          <label className="field-editor-control">
            <span>{uiText.reportTemplateName}</span>
            <input
              required
              value={templateName}
              onChange={(event) => setTemplateName(event.target.value)}
            />
          </label>
          <label className="field-editor-control">
            <span>{uiText.reportTemplateDescription}</span>
            <input
              value={templateDescription}
              onChange={(event) => setTemplateDescription(event.target.value)}
            />
          </label>
          <label className="field-editor-control">
            <span>{uiText.reportType}</span>
            <select value={reportType} onChange={(event) => setReportType(event.target.value)}>
              {reportTypes.map((type) => (
                <option key={type} value={type}>
                  {reportTypeLabel(type)}
                </option>
              ))}
            </select>
          </label>
          <label className="field-editor-control">
            <span>{uiText.reportOutputFormat}</span>
            <select value={outputFormat} onChange={(event) => setOutputFormat(event.target.value)}>
              {reportOutputFormats.map((format) => (
                <option key={format} value={format}>
                  {reportOutputFormatLabel(format)}
                </option>
              ))}
            </select>
          </label>
          <label className="field-editor-control template-body-control">
            <span>{uiText.reportTemplateParametersJson}</span>
            <textarea
              value={templateParametersJson}
              onChange={(event) => setTemplateParametersJson(event.target.value)}
            />
          </label>
          <button
            type="submit"
            className="primary-button"
            disabled={!canCreateTemplate || createTemplateMutation.isPending}
          >
            {uiText.createReportTemplate}
          </button>
        </form>
        {editingTemplateId && (
          <form
            className="template-form"
            aria-label={uiText.editReportTemplate}
            onSubmit={(event) => {
              event.preventDefault();
              updateTemplateMutation.mutate();
            }}
          >
            <label className="field-editor-control">
              <span>{uiText.reportTemplateEditName}</span>
              <input
                required
                value={editTemplateName}
                onChange={(event) => setEditTemplateName(event.target.value)}
              />
            </label>
            <label className="field-editor-control">
              <span>{uiText.reportTemplateEditDescription}</span>
              <input
                value={editTemplateDescription}
                onChange={(event) => setEditTemplateDescription(event.target.value)}
              />
            </label>
            <label className="field-editor-control template-body-control">
              <span>{uiText.reportTemplateEditParametersJson}</span>
              <textarea
                value={editTemplateParametersJson}
                onChange={(event) => setEditTemplateParametersJson(event.target.value)}
              />
            </label>
            <div className="row-actions">
              <button
                type="submit"
                className="primary-button"
                disabled={!canUpdateTemplate || updateTemplateMutation.isPending}
              >
                {uiText.saveReportTemplate}
              </button>
              <button type="button" className="ghost-button" onClick={clearTemplateEdit}>
                {uiText.cancel}
              </button>
            </div>
          </form>
        )}
        <ReportTemplateList
          items={templates}
          editingId={editingTemplateId}
          archivingId={archiveTemplateMutation.variables ?? null}
          onEdit={startTemplateEdit}
          onArchive={(template) => archiveTemplateMutation.mutate(template.id)}
        />
        {templates.length === 0 && <p className="data-empty">{uiText.noReportTemplates}</p>}
      </section>

      <div className="document-generator">
        <label className="field-editor-control">
          <span>{uiText.reportTemplate}</span>
          <select
            value={selectedTemplateId}
            onChange={(event) => setTemplateId(event.target.value)}
          >
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field-editor-control">
          <span>{uiText.reportRunParametersJson}</span>
          <input
            value={runParametersJson}
            onChange={(event) => setRunParametersJson(event.target.value)}
          />
        </label>
        <button
          type="button"
          className="primary-button"
          disabled={!selectedTemplateId || generateRunMutation.isPending}
          onClick={() => generateRunMutation.mutate()}
        >
          {uiText.generateReport}
        </button>
      </div>

      {message && <p className="inline-success attachment-status">{message}</p>}
      {localError && <p className="inline-alert attachment-status">{localError}</p>}
      <DataAlert error={templatesQuery.error} />
      <DataAlert error={runsQuery.error} />
      <section aria-labelledby="report-runs-heading">
        <h3 id="report-runs-heading">{uiText.reportRuns}</h3>
        <ReportRunList
          items={runsQuery.data?.items ?? []}
          templateById={templateById}
          downloadingId={downloadMutation.variables?.id ?? null}
          archivingId={archiveRunMutation.variables ?? null}
          onDownload={(run) => downloadMutation.mutate(run)}
          onArchive={(run) => archiveRunMutation.mutate(run.id)}
        />
      </section>
    </Panel>
  );
}

function ReportTemplateList({
  items,
  editingId,
  archivingId,
  onEdit,
  onArchive,
}: {
  items: ReportTemplateRead[];
  editingId: string | null;
  archivingId: string | null;
  onEdit: (template: ReportTemplateRead) => void;
  onArchive: (template: ReportTemplateRead) => void;
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
              {uiText.technicalCode}: {template.code} / {reportTypeLabel(template.report_type)} /{" "}
              {reportOutputFormatLabel(template.output_format)} /{" "}
              {formatUiDateTime(template.created_at)}
            </span>
          </div>
          <div className="row-actions">
            <button
              type="button"
              className="ghost-button"
              aria-label={`${uiText.editReportTemplate} ${template.name}`}
              disabled={editingId === template.id}
              onClick={() => onEdit(template)}
            >
              {uiText.update}
            </button>
            <button
              type="button"
              className="ghost-button"
              aria-label={`${uiText.archiveReportTemplate} ${template.name}`}
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

function ReportRunList({
  items,
  templateById,
  downloadingId,
  archivingId,
  onDownload,
  onArchive,
}: {
  items: ReportRunRead[];
  templateById: Map<string, ReportTemplateRead>;
  downloadingId: string | null;
  archivingId: string | null;
  onDownload: (run: ReportRunRead) => void;
  onArchive: (run: ReportRunRead) => void;
}) {
  if (items.length === 0) {
    return <p className="data-empty">{uiText.noReportRuns}</p>;
  }

  return (
    <ul className="file-action-list">
      {items.map((run) => {
        const title = templateById.get(run.report_template_id)?.name ?? run.output_filename;
        const outputFormat = reportRunOutputFormatLabel(run);
        return (
          <li key={run.id}>
            <div>
              <strong>{title}</strong>
              <span>
                {reportTypeLabel(run.report_type)} / {reportRunStatusLabel(run.run_status)} /{" "}
                {outputFormat} / {run.output_filename} / {run.row_count} /{" "}
                {formatUiDateTime(run.created_at)}
              </span>
            </div>
            <div className="row-actions">
              <button
                type="button"
                className="ghost-button"
                aria-label={`${uiText.downloadReport} ${title}`}
                disabled={downloadingId === run.id}
                onClick={() => onDownload(run)}
              >
                {uiText.download}
              </button>
              <button
                type="button"
                className="ghost-button"
                aria-label={`${uiText.archiveReport} ${title}`}
                disabled={archivingId === run.id}
                onClick={() => onArchive(run)}
              >
                {uiText.archive}
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

async function invalidateReportData(queryClient: QueryClient, token: string, registryId: string) {
  await queryClient.invalidateQueries({ queryKey: ["report-templates", token, registryId] });
  await queryClient.invalidateQueries({ queryKey: ["report-runs", token, registryId] });
  await queryClient.invalidateQueries({ queryKey: ["audit-events", token] });
}

function parseJsonObjectOrNull(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed) as unknown;
  } catch {
    throw new Error(uiText.jsonObjectRequired);
  }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error(uiText.jsonObjectRequired);
  }
  return parsed as Record<string, unknown>;
}

function formatJsonObjectForEdit(value: Record<string, unknown> | null) {
  return value ? JSON.stringify(value, null, 2) : "";
}

function reportOutputFormatLabel(format: string) {
  return format.toUpperCase();
}

function reportRunOutputFormatLabel(run: ReportRunRead) {
  if (run.output_content_type.includes("csv") || run.output_filename.endsWith(".csv")) {
    return "CSV";
  }
  if (run.output_content_type.includes("json") || run.output_filename.endsWith(".json")) {
    return "JSON";
  }
  return run.output_content_type;
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
