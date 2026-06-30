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
const reportOutputFormats = ["json", "csv", "xlsx", "pdf"];
type ReportParameterFieldType = "string" | "number" | "integer" | "boolean";
type ReportParameterOption = {
  value: string | number | boolean;
  label: string;
};
type ReportParameterField = {
  code: string;
  label: string;
  description: string | null;
  required: boolean;
  pattern: string | null;
  minLength: number | null;
  maxLength: number | null;
  minimum: number | null;
  maximum: number | null;
  exclusiveMinimum: number | null;
  exclusiveMaximum: number | null;
  multipleOf: number | null;
  type: ReportParameterFieldType;
  inputType: "date" | "number" | "text";
  options: ReportParameterOption[];
};

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
  const [templateParametersSchemaJson, setTemplateParametersSchemaJson] = useState("");
  const [templateParametersJson, setTemplateParametersJson] = useState("");
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [editTemplateName, setEditTemplateName] = useState("");
  const [editTemplateDescription, setEditTemplateDescription] = useState("");
  const [editReportType, setEditReportType] = useState("registry_cards");
  const [editOutputFormat, setEditOutputFormat] = useState("json");
  const [editTemplateParametersSchemaJson, setEditTemplateParametersSchemaJson] = useState("");
  const [editTemplateParametersJson, setEditTemplateParametersJson] = useState("");
  const [runParametersJson, setRunParametersJson] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [showArchivedReportTemplates, setShowArchivedReportTemplates] = useState(false);
  const [showArchivedReportRuns, setShowArchivedReportRuns] = useState(false);

  const templatesQuery = useQuery({
    queryKey: ["report-templates", token, selectedRegistryId, showArchivedReportTemplates],
    queryFn: () => listReportTemplates(token, selectedRegistryId, showArchivedReportTemplates),
    enabled: Boolean(token && selectedRegistryId),
  });
  const runsQuery = useQuery({
    queryKey: ["report-runs", token, selectedRegistryId, showArchivedReportRuns],
    queryFn: () => listReportRuns(token, selectedRegistryId, showArchivedReportRuns),
    enabled: Boolean(token && selectedRegistryId),
  });
  const templates = useMemo(() => templatesQuery.data?.items ?? [], [templatesQuery.data?.items]);
  const activeTemplates = useMemo(
    () => templates.filter((template) => isActiveTemplate(template)),
    [templates],
  );
  const selectedTemplateId = templateId || activeTemplates[0]?.id || "";
  const templateById = useMemo(
    () => new Map(templates.map((template) => [template.id, template])),
    [templates],
  );
  const selectedTemplate = selectedTemplateId ? templateById.get(selectedTemplateId) : undefined;
  const selectedTemplateSchemaDefaults = useMemo(
    () => getReportParameterDefaults(selectedTemplate?.parameters_schema_json ?? null),
    [selectedTemplate?.parameters_schema_json],
  );
  const selectedTemplateDefaultParameters = useMemo(
    () =>
      mergeReportParameterDefaults(
        selectedTemplateSchemaDefaults,
        selectedTemplate?.default_parameters_json,
      ),
    [selectedTemplateSchemaDefaults, selectedTemplate?.default_parameters_json],
  );
  const runParameterValues = useMemo(
    () => parseJsonObjectForDisplay(runParametersJson) ?? selectedTemplateDefaultParameters ?? {},
    [runParametersJson, selectedTemplateDefaultParameters],
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
        parameters_schema_json: parseJsonObjectOrNull(templateParametersSchemaJson),
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
      setTemplateParametersSchemaJson("");
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
        report_type: editReportType,
        parameters_schema_json: parseJsonObjectOrNull(editTemplateParametersSchemaJson),
        default_parameters_json: parseJsonObjectOrNull(editTemplateParametersJson),
        output_format: editOutputFormat,
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
        parameters: parseReportRunParameters(runParametersJson, selectedTemplateDefaultParameters),
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
    mutationFn: (reportRun: ReportRunRead) =>
      downloadReportRunContent(token, reportRun.id, Boolean(reportRun.archived_at)),
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
    setEditReportType(template.report_type);
    setEditOutputFormat(template.output_format);
    setEditTemplateParametersSchemaJson(formatJsonObjectForEdit(template.parameters_schema_json));
    setEditTemplateParametersJson(formatJsonObjectForEdit(template.default_parameters_json));
    setMessage(null);
    setLocalError(null);
  }

  function clearTemplateEdit() {
    setEditingTemplateId(null);
    setEditTemplateName("");
    setEditTemplateDescription("");
    setEditReportType("registry_cards");
    setEditOutputFormat("json");
    setEditTemplateParametersSchemaJson("");
    setEditTemplateParametersJson("");
  }

  function updateRunParameterValue(code: string, type: ReportParameterFieldType, value: unknown) {
    const nextParameters = {
      ...(parseJsonObjectForDisplay(runParametersJson) ?? selectedTemplateDefaultParameters ?? {}),
    };
    if (type === "boolean") {
      nextParameters[code] = Boolean(value);
    } else if (type === "number" || type === "integer") {
      const textValue = String(value ?? "").trim();
      if (!textValue) {
        delete nextParameters[code];
      } else {
        const numberValue = Number(textValue);
        if (Number.isFinite(numberValue)) {
          nextParameters[code] = type === "integer" ? Math.trunc(numberValue) : numberValue;
        } else {
          delete nextParameters[code];
        }
      }
    } else {
      nextParameters[code] = String(value ?? "");
    }
    setRunParametersJson(JSON.stringify(nextParameters));
  }

  function generateReportFromCurrentParameters() {
    let parameters: Record<string, unknown> | null;
    try {
      parameters = parseReportRunParameters(runParametersJson, selectedTemplateDefaultParameters);
    } catch (error) {
      setMessage(null);
      setLocalError(errorText(error));
      return;
    }
    const validationError = validateReportRunParameters(
      selectedTemplate?.parameters_schema_json ?? null,
      parameters,
    );
    if (validationError) {
      setMessage(null);
      setLocalError(validationError);
      return;
    }
    generateRunMutation.mutate();
  }

  return (
    <Panel title={uiText.reports}>
      <section className="template-manager" aria-labelledby="report-templates-heading">
        <h3 id="report-templates-heading">{uiText.reportTemplates}</h3>
        <label className="checkbox-control">
          <input
            aria-label={uiText.showArchivedReportTemplates}
            checked={showArchivedReportTemplates}
            type="checkbox"
            onChange={(event) => setShowArchivedReportTemplates(event.currentTarget.checked)}
          />
          <span>{uiText.showArchivedReportTemplates}</span>
        </label>
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
            <span>Схема параметров JSON</span>
            <textarea
              value={templateParametersSchemaJson}
              onChange={(event) => setTemplateParametersSchemaJson(event.target.value)}
            />
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
            <label className="field-editor-control">
              <span>Новый тип отчета</span>
              <select
                value={editReportType}
                onChange={(event) => setEditReportType(event.target.value)}
              >
                {reportTypes.map((type) => (
                  <option key={type} value={type}>
                    {reportTypeLabel(type)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-editor-control">
              <span>Новый формат отчета</span>
              <select
                value={editOutputFormat}
                onChange={(event) => setEditOutputFormat(event.target.value)}
              >
                {reportOutputFormats.map((format) => (
                  <option key={format} value={format}>
                    {reportOutputFormatLabel(format)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-editor-control template-body-control">
              <span>Новая схема параметров JSON</span>
              <textarea
                value={editTemplateParametersSchemaJson}
                onChange={(event) => setEditTemplateParametersSchemaJson(event.target.value)}
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
            {activeTemplates.map((template) => (
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
        <ReportRunParameterFields
          template={selectedTemplate}
          values={runParameterValues}
          onChange={updateRunParameterValue}
        />
        <button
          type="button"
          className="primary-button"
          disabled={!selectedTemplateId || generateRunMutation.isPending}
          onClick={generateReportFromCurrentParameters}
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
        <label className="checkbox-control">
          <input
            aria-label={uiText.showArchivedReportRuns}
            checked={showArchivedReportRuns}
            type="checkbox"
            onChange={(event) => setShowArchivedReportRuns(event.currentTarget.checked)}
          />
          <span>{uiText.showArchivedReportRuns}</span>
        </label>
        <ReportRunList
          items={runsQuery.data?.items ?? []}
          templateById={templateById}
          downloadingId={
            downloadMutation.isPending ? (downloadMutation.variables?.id ?? null) : null
          }
          archivingId={archiveRunMutation.variables ?? null}
          onDownload={(run) => downloadMutation.mutate(run)}
          onArchive={(run) => archiveRunMutation.mutate(run.id)}
        />
      </section>
    </Panel>
  );
}

function ReportRunParameterFields({
  template,
  values,
  onChange,
}: {
  template: ReportTemplateRead | undefined;
  values: Record<string, unknown>;
  onChange: (code: string, type: ReportParameterFieldType, value: unknown) => void;
}) {
  const fields = getReportParameterFields(template?.parameters_schema_json ?? null);
  if (fields.length === 0) {
    return null;
  }

  return (
    <div className="report-parameter-fields">
      {fields.map((field) => (
        <label key={field.code} className="field-editor-control">
          <span>{field.label}</span>
          {field.type === "boolean" ? (
            <input
              aria-label={field.label}
              aria-required={field.required || undefined}
              type="checkbox"
              checked={Boolean(values[field.code])}
              onChange={(event) => onChange(field.code, field.type, event.currentTarget.checked)}
            />
          ) : field.options.length > 0 ? (
            <select
              aria-label={field.label}
              aria-required={field.required || undefined}
              value={formatReportParameterInputValue(values[field.code])}
              onChange={(event) => onChange(field.code, field.type, event.currentTarget.value)}
            >
              {field.options.map((option) => (
                <option key={String(option.value)} value={String(option.value)}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              aria-label={field.label}
              aria-required={field.required || undefined}
              type={field.inputType}
              value={formatReportParameterInputValue(values[field.code])}
              onChange={(event) => onChange(field.code, field.type, event.currentTarget.value)}
            />
          )}
          {field.description && <small>{field.description}</small>}
        </label>
      ))}
    </div>
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
      {items.map((template) => {
        const isArchived = !isActiveTemplate(template);
        return (
          <li key={template.id}>
            <div>
              <strong>{template.name}</strong>
              <span>
                {uiText.technicalCode}: {template.code} / {reportTypeLabel(template.report_type)} /{" "}
                {reportOutputFormatLabel(template.output_format)} /{" "}
                {formatUiDateTime(template.created_at)}
                {isArchived ? ` / ${uiText.archived}` : ""}
              </span>
            </div>
            <div className="row-actions">
              <button
                type="button"
                className="ghost-button"
                aria-label={`${uiText.editReportTemplate} ${template.name}`}
                disabled={isArchived || editingId === template.id}
                onClick={() => onEdit(template)}
              >
                {uiText.update}
              </button>
              <button
                type="button"
                className="ghost-button"
                aria-label={`${uiText.archiveReportTemplate} ${template.name}`}
                disabled={isArchived || archivingId === template.id}
                onClick={() => onArchive(template)}
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
        const isArchived = Boolean(run.archived_at);
        return (
          <li key={run.id}>
            <div>
              <strong>{title}</strong>
              <span>
                {reportTypeLabel(run.report_type)} / {reportRunStatusLabel(run.run_status)} /{" "}
                {outputFormat} / {run.output_filename} / {run.row_count} /{" "}
                {formatUiDateTime(run.created_at)}
                {isArchived ? ` / ${uiText.archived}` : ""}
              </span>
              <span>Параметры запуска: {formatJsonObjectInline(run.parameters_json)}</span>
              <span>Сводка отчета: {formatJsonObjectInline(run.summary_json)}</span>
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
                disabled={isArchived || archivingId === run.id}
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

function isActiveTemplate(template: ReportTemplateRead) {
  return template.is_active && !template.archived_at;
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

function parseReportRunParameters(
  value: string,
  defaultParameters: Record<string, unknown> | null | undefined,
) {
  if (value.trim()) {
    return parseJsonObjectOrNull(value);
  }
  return defaultParameters ?? null;
}

function mergeReportParameterDefaults(
  schemaDefaults: Record<string, unknown> | null,
  templateDefaults: Record<string, unknown> | null | undefined,
) {
  const merged = {
    ...(schemaDefaults ?? {}),
    ...(templateDefaults ?? {}),
  };
  return Object.keys(merged).length > 0 ? merged : null;
}

function parseJsonObjectForDisplay(value: string) {
  try {
    return parseJsonObjectOrNull(value);
  } catch {
    return null;
  }
}

function formatJsonObjectForEdit(value: Record<string, unknown> | null) {
  return value ? JSON.stringify(value, null, 2) : "";
}

function formatJsonObjectInline(value: Record<string, unknown> | null) {
  return value ? JSON.stringify(value) : uiText.noData;
}

function getReportParameterFields(schema: Record<string, unknown> | null): ReportParameterField[] {
  const properties = isRecord(schema?.properties) ? schema.properties : null;
  if (!properties) {
    return [];
  }
  const requiredCodes = getReportParameterRequiredCodes(schema);

  return Object.entries(properties).flatMap(([code, rawConfig]) => {
    if (!isRecord(rawConfig)) {
      return [];
    }
    const rawType = typeof rawConfig.type === "string" ? rawConfig.type : "string";
    if (!isReportParameterFieldType(rawType)) {
      return [];
    }
    const label =
      typeof rawConfig.title === "string" && rawConfig.title.trim() ? rawConfig.title : code;
    const description =
      typeof rawConfig.description === "string" && rawConfig.description.trim()
        ? rawConfig.description
        : null;
    return [
      {
        code,
        label,
        description,
        required: requiredCodes.has(code),
        pattern: getStringConstraint(rawConfig.pattern),
        minLength: getNonNegativeIntegerConstraint(rawConfig.minLength),
        maxLength: getNonNegativeIntegerConstraint(rawConfig.maxLength),
        minimum: getFiniteNumberConstraint(rawConfig.minimum),
        maximum: getFiniteNumberConstraint(rawConfig.maximum),
        exclusiveMinimum: getFiniteNumberConstraint(rawConfig.exclusiveMinimum),
        exclusiveMaximum: getFiniteNumberConstraint(rawConfig.exclusiveMaximum),
        multipleOf: getPositiveNumberConstraint(rawConfig.multipleOf),
        type: rawType,
        inputType: getReportParameterInputType(rawConfig, rawType),
        options: getReportParameterOptions(rawConfig, rawType),
      },
    ];
  });
}

function getReportParameterRequiredCodes(schema: Record<string, unknown> | null) {
  if (!Array.isArray(schema?.required)) {
    return new Set<string>();
  }
  return new Set(
    schema.required.filter(
      (value): value is string => typeof value === "string" && Boolean(value.trim()),
    ),
  );
}

function validateReportRunParameters(
  schema: Record<string, unknown> | null,
  parameters: Record<string, unknown> | null,
) {
  const fields = getReportParameterFields(schema);
  const missingLabels = fields.flatMap((field) => {
    if (!field.required || !isReportParameterMissing(parameters?.[field.code])) {
      return [];
    }
    return [field.label];
  });
  if (missingLabels.length === 0) {
    const constraintErrors = fields.flatMap((field) =>
      validateReportParameterConstraints(field, parameters?.[field.code]),
    );
    if (constraintErrors.length === 0) {
      return null;
    }
    return `${uiText.reportInvalidParameters}: ${constraintErrors.join("; ")}`;
  }
  return `${uiText.reportRequiredParameters}: ${missingLabels.join(", ")}`;
}

function validateReportParameterConstraints(field: ReportParameterField, value: unknown) {
  if (isReportParameterMissing(value)) {
    return [];
  }
  if (field.type === "string") {
    const textValue = String(value);
    return [
      ...(field.minLength !== null && textValue.length < field.minLength
        ? [`${field.label} должен быть не короче ${field.minLength} символов`]
        : []),
      ...(field.maxLength !== null && textValue.length > field.maxLength
        ? [`${field.label} должен быть не длиннее ${field.maxLength} символов`]
        : []),
      ...(field.pattern !== null && !matchesReportParameterPattern(textValue, field.pattern)
        ? [`${field.label} должен соответствовать шаблону`]
        : []),
    ];
  }
  if (field.type !== "number" && field.type !== "integer") {
    return [];
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return [`${field.label} должен быть числом`];
  }
  return [
    ...(field.type === "integer" && !Number.isInteger(value)
      ? [`${field.label} должен быть целым числом`]
      : []),
    ...(field.minimum !== null && value < field.minimum
      ? [`${field.label} должен быть не меньше ${field.minimum}`]
      : []),
    ...(field.maximum !== null && value > field.maximum
      ? [`${field.label} должен быть не больше ${field.maximum}`]
      : []),
    ...(field.exclusiveMinimum !== null && value <= field.exclusiveMinimum
      ? [`${field.label} должен быть больше ${field.exclusiveMinimum}`]
      : []),
    ...(field.exclusiveMaximum !== null && value >= field.exclusiveMaximum
      ? [`${field.label} должен быть меньше ${field.exclusiveMaximum}`]
      : []),
    ...(field.multipleOf !== null && !isReportParameterMultipleOf(value, field.multipleOf)
      ? [`${field.label} должен быть кратен ${field.multipleOf}`]
      : []),
  ];
}

function isReportParameterMissing(value: unknown) {
  if (value === null || value === undefined) {
    return true;
  }
  return typeof value === "string" && value.trim() === "";
}

function getFiniteNumberConstraint(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getPositiveNumberConstraint(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function getNonNegativeIntegerConstraint(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function getStringConstraint(value: unknown) {
  return typeof value === "string" && value ? value : null;
}

function matchesReportParameterPattern(value: string, pattern: string) {
  try {
    return new RegExp(pattern).test(value);
  } catch {
    return true;
  }
}

function isReportParameterMultipleOf(value: number, multipleOf: number) {
  const quotient = value / multipleOf;
  return Math.abs(quotient - Math.round(quotient)) < Number.EPSILON;
}

function getReportParameterDefaults(schema: Record<string, unknown> | null) {
  const properties = isRecord(schema?.properties) ? schema.properties : null;
  if (!properties) {
    return null;
  }

  const entries = Object.entries(properties).flatMap(([code, rawConfig]) => {
    if (!isRecord(rawConfig)) {
      return [];
    }
    const rawType = typeof rawConfig.type === "string" ? rawConfig.type : "string";
    if (!isReportParameterFieldType(rawType) || !Object.hasOwn(rawConfig, "default")) {
      return [];
    }
    const defaultValue = rawConfig.default;
    if (!isReportParameterOptionValue(defaultValue, rawType)) {
      return [];
    }
    const options = getReportParameterOptions(rawConfig, rawType);
    if (options.length > 0 && !options.some((option) => option.value === defaultValue)) {
      return [];
    }
    return [[code, defaultValue] as const];
  });

  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

function getReportParameterInputType(
  config: Record<string, unknown>,
  type: ReportParameterFieldType,
): ReportParameterField["inputType"] {
  if (type === "number" || type === "integer") {
    return "number";
  }
  if (type === "string" && config.format === "date") {
    return "date";
  }
  return "text";
}

function getReportParameterOptions(
  config: Record<string, unknown>,
  type: ReportParameterFieldType,
): ReportParameterOption[] {
  const oneOfOptions = getReportParameterOneOfOptions(config, type);
  if (oneOfOptions.length > 0) {
    return oneOfOptions;
  }

  if (!Array.isArray(config.enum)) {
    return [];
  }
  return config.enum.flatMap((value) => {
    if (!isReportParameterOptionValue(value, type)) {
      return [];
    }
    return [{ value, label: String(value) }];
  });
}

function getReportParameterOneOfOptions(
  config: Record<string, unknown>,
  type: ReportParameterFieldType,
): ReportParameterOption[] {
  if (!Array.isArray(config.oneOf)) {
    return [];
  }

  return config.oneOf.flatMap((rawOption) => {
    if (!isRecord(rawOption) || !isReportParameterOptionValue(rawOption.const, type)) {
      return [];
    }
    const label =
      typeof rawOption.title === "string" && rawOption.title.trim()
        ? rawOption.title
        : String(rawOption.const);
    return [{ value: rawOption.const, label }];
  });
}

function isReportParameterOptionValue(
  value: unknown,
  type: ReportParameterFieldType,
): value is string | number | boolean {
  if (type === "string") {
    return typeof value === "string";
  }
  if (type === "number") {
    return typeof value === "number" && Number.isFinite(value);
  }
  if (type === "integer") {
    return typeof value === "number" && Number.isInteger(value);
  }
  return typeof value === "boolean";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isReportParameterFieldType(value: string): value is ReportParameterFieldType {
  return value === "string" || value === "number" || value === "integer" || value === "boolean";
}

function formatReportParameterInputValue(value: unknown) {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  return "";
}

function reportOutputFormatLabel(format: string) {
  return format.toUpperCase();
}

function reportRunOutputFormatLabel(run: ReportRunRead) {
  if (run.output_content_type.includes("pdf") || run.output_filename.endsWith(".pdf")) {
    return "PDF";
  }
  if (
    run.output_content_type.includes("spreadsheetml.sheet") ||
    run.output_filename.endsWith(".xlsx")
  ) {
    return "XLSX";
  }
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
