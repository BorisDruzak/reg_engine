import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import {
  commitTabularXlsxImport,
  downloadTabularXlsxCards,
  downloadTabularXlsxImportTemplate,
  getTabularXlsxCardExchangeOptions,
  previewTabularXlsxImport,
} from "@/api/client";
import type {
  TabularCardExchangeFieldRead,
  TabularCardImportCommitRead,
  TabularCardImportPreviewRead,
  TabularCardWorkbookPayload,
} from "@/api/types";
import { uiText } from "@/app/uiText";
import { Panel } from "@/components/common/DataSurfaces";
import { errorText } from "@/components/common/dataUtils";

export function ImportExportPanel({
  selectedRegistryId,
  token,
}: {
  selectedRegistryId: string;
  token: string;
}) {
  const queryClient = useQueryClient();
  const optionsQuery = useQuery({
    queryKey: ["tabular-xlsx-card-exchange-options", token, selectedRegistryId],
    queryFn: () => getTabularXlsxCardExchangeOptions(token, selectedRegistryId),
    enabled: Boolean(token && selectedRegistryId),
  });
  const [templateId, setTemplateId] = useState("");
  const [organizationIds, setOrganizationIds] = useState<string[]>([]);
  const [hideOrganizationColumn, setHideOrganizationColumn] = useState(true);
  const [fixedOrganizationId, setFixedOrganizationId] = useState("");
  const [fieldIds, setFieldIds] = useState<string[]>([]);
  const [xlsxFile, setXlsxFile] = useState<File | null>(null);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<TabularCardImportPreviewRead | null>(null);
  const [commitResult, setCommitResult] = useState<TabularCardImportCommitRead | null>(null);
  const [downloadMessage, setDownloadMessage] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const selectedTemplate =
    optionsQuery.data?.templates.find((template) => template.id === templateId) ?? null;
  const supportedFields = selectedTemplate?.fields.filter((field) => field.supported) ?? [];
  const unsupportedFields = selectedTemplate?.fields.filter((field) => !field.supported) ?? [];
  const selectedOrganizationIds = organizationIds.filter((organizationId) =>
    optionsQuery.data?.organizations.some((organization) => organization.id === organizationId),
  );
  const selectedFieldIds = fieldIds.filter((fieldId) =>
    supportedFields.some((field) => field.id === fieldId),
  );
  const needsImportOrganizationChoice =
    hideOrganizationColumn && selectedOrganizationIds.length > 1;
  const effectiveFixedOrganizationId = hideOrganizationColumn
    ? selectedOrganizationIds.length === 1
      ? selectedOrganizationIds[0]
      : selectedOrganizationIds.includes(fixedOrganizationId)
        ? fixedOrganizationId
        : ""
    : "";
  const exportPayload: TabularCardWorkbookPayload | null =
    selectedTemplate && selectedFieldIds.length && selectedOrganizationIds.length
      ? {
          card_template_id: selectedTemplate.id,
          field_ids: selectedFieldIds,
          organization_ids: selectedOrganizationIds,
          include_organization_column: !hideOrganizationColumn,
        }
      : null;
  const importPayload: TabularCardWorkbookPayload | null =
    exportPayload && (!hideOrganizationColumn || effectiveFixedOrganizationId)
      ? {
          ...exportPayload,
          ...(hideOrganizationColumn
            ? { fixed_organization_id: effectiveFixedOrganizationId }
            : {}),
        }
      : null;

  const downloadMutation = useMutation({
    mutationFn: async (kind: "list" | "template") => {
      const workbookPayload = kind === "list" ? exportPayload : importPayload;
      if (!workbookPayload) {
        throw new Error(
          configurationError(
            Boolean(selectedTemplate),
            selectedOrganizationIds,
            selectedFieldIds,
            kind === "template" && hideOrganizationColumn,
            effectiveFixedOrganizationId,
          ),
        );
      }
      const download =
        kind === "list"
          ? await downloadTabularXlsxCards(token, selectedRegistryId, workbookPayload)
          : await downloadTabularXlsxImportTemplate(token, selectedRegistryId, workbookPayload);
      return { kind, ...download };
    },
    onSuccess: ({ kind, blob, filename }) => {
      triggerBrowserDownload(blob, filename);
      if (kind === "list") {
        setDownloadMessage(uiText.tabularXlsxDownloaded);
        setDownloadError(null);
      } else {
        setImportMessage(uiText.tabularXlsxDownloaded);
        setImportError(null);
      }
    },
    onError: (error, kind) => {
      if (kind === "list") {
        setDownloadMessage(null);
        setDownloadError(errorText(error));
      } else {
        setImportMessage(null);
        setImportError(errorText(error));
      }
    },
  });
  const previewMutation = useMutation({
    mutationFn: () => {
      if (!xlsxFile) {
        throw new Error(uiText.importXlsxRequired);
      }
      return previewTabularXlsxImport(token, selectedRegistryId, xlsxFile);
    },
    onSuccess: (result) => {
      setPreview(result);
      setPreviewFile(xlsxFile);
      setCommitResult(null);
      setImportMessage(
        result.summary.invalid_rows === 0
          ? uiText.tabularXlsxCanCommit
          : uiText.tabularXlsxPreviewReady,
      );
      setImportError(null);
    },
    onError: (error) => {
      setImportMessage(null);
      setImportError(errorText(error));
    },
  });
  const commitMutation = useMutation({
    mutationFn: () => {
      if (!preview || !previewFile) {
        throw new Error(uiText.tabularXlsxPreviewRequired);
      }
      if (previewFile !== xlsxFile) {
        throw new Error(uiText.importXlsxPreviewStale);
      }
      return commitTabularXlsxImport(token, selectedRegistryId, previewFile);
    },
    onSuccess: async (result) => {
      setCommitResult(result);
      setImportMessage(uiText.tabularXlsxImported);
      setImportError(null);
      await queryClient.invalidateQueries({ queryKey: ["cards", token, selectedRegistryId] });
      await queryClient.invalidateQueries({ queryKey: ["audit-events", token] });
    },
    onError: (error) => {
      setImportMessage(null);
      setImportError(errorText(error));
    },
  });

  const hasValidPreview = Boolean(preview) && preview?.summary.invalid_rows === 0;
  const hasStablePreview = hasValidPreview && previewFile === xlsxFile;
  const optionsError = optionsQuery.error ? errorText(optionsQuery.error) : null;

  function resetPreview() {
    setPreview(null);
    setPreviewFile(null);
    setCommitResult(null);
    setImportMessage(null);
    setImportError(null);
  }

  function resetConfigurationFeedback() {
    resetPreview();
    setDownloadMessage(null);
    setDownloadError(null);
  }

  function toggleValue(value: string, current: string[], setValue: (next: string[]) => void) {
    setValue(
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
    );
    resetConfigurationFeedback();
  }

  return (
    <Panel title={uiText.importExport}>
      <section className="template-manager" aria-labelledby="tabular-xlsx-heading">
        <h3 id="tabular-xlsx-heading">{uiText.tabularXlsxTitle}</h3>
        <p className="muted-text">{uiText.tabularXlsxDescription}</p>
        {optionsQuery.isLoading && <p className="muted-text">{uiText.loadingCard}</p>}
        {optionsError && <p className="inline-alert attachment-status">{optionsError}</p>}
        {!optionsQuery.isLoading && !optionsError && optionsQuery.data && (
          <>
            {optionsQuery.data.templates.length === 0 ||
            optionsQuery.data.organizations.length === 0 ? (
              <p className="empty-state">{uiText.tabularXlsxNoOptions}</p>
            ) : (
              <section className="xlsx-exchange-settings" aria-labelledby="tabular-xlsx-settings">
                <h4 id="tabular-xlsx-settings">{uiText.tabularXlsxSettingsTitle}</h4>
                <div className="template-form">
                  <label className="field-editor-control">
                    <span>{uiText.cardTemplate}</span>
                    <select
                      value={templateId}
                      onChange={(event) => {
                        setTemplateId(event.currentTarget.value);
                        setFieldIds([]);
                        resetConfigurationFeedback();
                      }}
                    >
                      <option value="">{uiText.tabularXlsxSelectTemplate}</option>
                      {optionsQuery.data.templates.map((template) => (
                        <option key={template.id} value={template.id}>
                          {template.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <fieldset className="field-editor-control">
                    <legend>{uiText.tabularXlsxOrganizations}</legend>
                    <div className="checkbox-list">
                      {optionsQuery.data.organizations.map((organization) => (
                        <label key={organization.id}>
                          <input
                            type="checkbox"
                            checked={selectedOrganizationIds.includes(organization.id)}
                            onChange={() =>
                              toggleValue(organization.id, organizationIds, setOrganizationIds)
                            }
                          />
                          <span>{organization.label}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <label className="field-editor-control">
                    <input
                      type="checkbox"
                      checked={hideOrganizationColumn}
                      onChange={(event) => {
                        setHideOrganizationColumn(event.currentTarget.checked);
                        resetConfigurationFeedback();
                      }}
                    />
                    <span>{uiText.tabularXlsxHideOrganizationColumn}</span>
                  </label>
                  {selectedTemplate && (
                    <fieldset className="field-editor-control template-body-control">
                      <legend>{uiText.tabularXlsxFields}</legend>
                      <div className="checkbox-list">
                        {supportedFields.map((field) => (
                          <FieldSelection
                            key={field.id}
                            field={field}
                            checked={selectedFieldIds.includes(field.id)}
                            onChange={() => toggleValue(field.id, fieldIds, setFieldIds)}
                          />
                        ))}
                      </div>
                      {unsupportedFields.map((field) => (
                        <p key={field.id} className="muted-text">
                          {field.block_title}: {field.label} — {field.unsupported_reason}
                        </p>
                      ))}
                    </fieldset>
                  )}
                </div>
              </section>
            )}
          </>
        )}
        <div className="xlsx-operation-grid">
          <section className="xlsx-operation" aria-labelledby="tabular-xlsx-export">
            <h4 id="tabular-xlsx-export">{uiText.tabularXlsxExportTitle}</h4>
            <p className="muted-text">{uiText.tabularXlsxExportDescription}</p>
            <div className="row-actions">
              <button
                type="button"
                className="primary-button"
                disabled={!exportPayload || downloadMutation.isPending}
                onClick={() => downloadMutation.mutate("list")}
              >
                {uiText.downloadCardList}
              </button>
            </div>
            {downloadMessage && (
              <p className="inline-success attachment-status">{downloadMessage}</p>
            )}
            {downloadError && <p className="inline-alert attachment-status">{downloadError}</p>}
          </section>
          <section className="xlsx-operation" aria-labelledby="tabular-xlsx-import">
            <h4 id="tabular-xlsx-import">{uiText.tabularXlsxImportTitle}</h4>
            <p className="muted-text">{uiText.tabularXlsxImportDescription}</p>
            {needsImportOrganizationChoice && (
              <label className="field-editor-control">
                <span>{uiText.tabularXlsxImportOrganization}</span>
                <select
                  aria-label={uiText.tabularXlsxImportOrganization}
                  value={effectiveFixedOrganizationId}
                  onChange={(event) => {
                    setFixedOrganizationId(event.currentTarget.value);
                    resetConfigurationFeedback();
                  }}
                >
                  <option value="">{uiText.tabularXlsxSelectImportOrganization}</option>
                  {(optionsQuery.data?.organizations ?? [])
                    .filter((organization) => selectedOrganizationIds.includes(organization.id))
                    .map((organization) => (
                      <option key={organization.id} value={organization.id}>
                        {organization.label}
                      </option>
                    ))}
                </select>
                <small className="muted-text">{uiText.tabularXlsxHiddenOrganizationHint}</small>
              </label>
            )}
            <div className="row-actions">
              <button
                type="button"
                className="ghost-button"
                disabled={!importPayload || downloadMutation.isPending}
                onClick={() => downloadMutation.mutate("template")}
              >
                {uiText.downloadImportTemplate}
              </button>
            </div>
            <label className="field-editor-control">
              <span>{uiText.importXlsxFile}</span>
              <input
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(event) => {
                  setXlsxFile(event.currentTarget.files?.[0] ?? null);
                  resetPreview();
                }}
              />
            </label>
            <div className="row-actions">
              <button
                type="button"
                className="primary-button"
                disabled={!xlsxFile || previewMutation.isPending}
                onClick={() => previewMutation.mutate()}
              >
                {uiText.previewTabularXlsxImport}
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={!hasStablePreview || commitMutation.isPending}
                onClick={() => commitMutation.mutate()}
              >
                {uiText.commitTabularXlsxImport}
              </button>
            </div>
            {importMessage && <p className="inline-success attachment-status">{importMessage}</p>}
            {importError && <p className="inline-alert attachment-status">{importError}</p>}
            {preview && <ImportPreview preview={preview} />}
            {commitResult && <ImportCommitResult result={commitResult} />}
          </section>
        </div>
      </section>
    </Panel>
  );
}

function FieldSelection({
  field,
  checked,
  onChange,
}: {
  field: TabularCardExchangeFieldRead;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label>
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span>{`${field.block_title}: ${field.label}`}</span>
    </label>
  );
}

function ImportPreview({ preview }: { preview: TabularCardImportPreviewRead }) {
  return (
    <div className="import-export-result">
      <strong>{formatImportSummary(preview)}</strong>
      <ul className="file-action-list">
        {preview.rows.map((row) => (
          <li key={row.row_number}>
            <div>
              <strong>
                {`Строка ${row.row_number} / ${
                  row.status === "valid" ? uiText.importRowValid : uiText.importRowInvalid
                }`}
              </strong>
              {row.organization_label && <span>{row.organization_label}</span>}
              {row.errors.map((error) => (
                <span key={error}>{error}</span>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ImportCommitResult({ result }: { result: TabularCardImportCommitRead }) {
  return (
    <div className="import-export-result">
      <strong>{formatCommitSummary(result)}</strong>
    </div>
  );
}

function configurationError(
  hasTemplate: boolean,
  organizationIds: string[],
  fieldIds: string[],
  hideOrganizationColumn: boolean,
  fixedOrganizationId: string,
) {
  if (!hasTemplate) return uiText.tabularXlsxSelectTemplate;
  if (!organizationIds.length) return uiText.tabularXlsxSelectOrganization;
  if (!fieldIds.length) return uiText.tabularXlsxSelectField;
  return hideOrganizationColumn && !fixedOrganizationId
    ? uiText.tabularXlsxSelectImportOrganization
    : uiText.tabularXlsxSelectTemplate;
}

function formatImportSummary(preview: TabularCardImportPreviewRead) {
  return uiText.tabularXlsxSummary
    .replace("{total}", String(preview.summary.total_rows))
    .replace("{valid}", String(preview.summary.valid_rows))
    .replace("{invalid}", String(preview.summary.invalid_rows));
}

function formatCommitSummary(result: TabularCardImportCommitRead) {
  return uiText.tabularXlsxCommitSummary
    .replace("{created}", String(result.summary.created_cards))
    .replace("{values}", String(result.summary.field_values_written));
}

function triggerBrowserDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
