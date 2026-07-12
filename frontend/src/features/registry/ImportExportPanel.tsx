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
  const [fieldIds, setFieldIds] = useState<string[]>([]);
  const [xlsxFile, setXlsxFile] = useState<File | null>(null);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<TabularCardImportPreviewRead | null>(null);
  const [commitResult, setCommitResult] = useState<TabularCardImportCommitRead | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

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
  const payload: TabularCardWorkbookPayload | null =
    selectedTemplate && selectedFieldIds.length && selectedOrganizationIds.length
      ? {
          card_template_id: selectedTemplate.id,
          field_ids: selectedFieldIds,
          organization_ids: selectedOrganizationIds,
        }
      : null;

  const downloadMutation = useMutation({
    mutationFn: async (kind: "list" | "template") => {
      if (!payload) {
        throw new Error(
          configurationError(Boolean(selectedTemplate), selectedOrganizationIds, selectedFieldIds),
        );
      }
      return kind === "list"
        ? downloadTabularXlsxCards(token, selectedRegistryId, payload)
        : downloadTabularXlsxImportTemplate(token, selectedRegistryId, payload);
    },
    onSuccess: ({ blob, filename }) => {
      triggerBrowserDownload(blob, filename);
      setMessage(uiText.tabularXlsxDownloaded);
      setLocalError(null);
    },
    onError: (error) => setLocalError(errorText(error)),
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
      setMessage(
        result.summary.invalid_rows === 0
          ? uiText.tabularXlsxCanCommit
          : uiText.tabularXlsxPreviewReady,
      );
      setLocalError(null);
    },
    onError: (error) => setLocalError(errorText(error)),
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
      setMessage(uiText.tabularXlsxImported);
      setLocalError(null);
      await queryClient.invalidateQueries({ queryKey: ["cards", token, selectedRegistryId] });
      await queryClient.invalidateQueries({ queryKey: ["audit-events", token] });
    },
    onError: (error) => setLocalError(errorText(error)),
  });

  const hasValidPreview = Boolean(preview) && preview?.summary.invalid_rows === 0;
  const hasStablePreview = hasValidPreview && previewFile === xlsxFile;
  const optionsError = optionsQuery.error ? errorText(optionsQuery.error) : null;

  function resetPreview() {
    setPreview(null);
    setPreviewFile(null);
    setCommitResult(null);
    setMessage(null);
  }

  function toggleValue(value: string, current: string[], setValue: (next: string[]) => void) {
    setValue(
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
    );
    resetPreview();
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
              <div className="template-form">
                <label className="field-editor-control">
                  <span>{uiText.cardTemplate}</span>
                  <select
                    value={templateId}
                    onChange={(event) => {
                      setTemplateId(event.currentTarget.value);
                      setFieldIds([]);
                      resetPreview();
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
                {selectedTemplate && (
                  <fieldset className="field-editor-control">
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
                <div className="row-actions template-body-control">
                  <button
                    type="button"
                    className="primary-button"
                    disabled={!payload || downloadMutation.isPending}
                    onClick={() => downloadMutation.mutate("list")}
                  >
                    {uiText.downloadCardList}
                  </button>
                  <button
                    type="button"
                    className="ghost-button"
                    disabled={!payload || downloadMutation.isPending}
                    onClick={() => downloadMutation.mutate("template")}
                  >
                    {uiText.downloadImportTemplate}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
        <div className="template-form">
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
          <div className="row-actions template-body-control">
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
        </div>
        {message && <p className="inline-success attachment-status">{message}</p>}
        {localError && <p className="inline-alert attachment-status">{localError}</p>}
        {preview && <ImportPreview preview={preview} />}
        {commitResult && <ImportCommitResult result={commitResult} />}
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

function configurationError(hasTemplate: boolean, organizationIds: string[], fieldIds: string[]) {
  if (!hasTemplate) return uiText.tabularXlsxSelectTemplate;
  if (!organizationIds.length) return uiText.tabularXlsxSelectOrganization;
  return fieldIds.length ? uiText.tabularXlsxSelectTemplate : uiText.tabularXlsxSelectField;
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
