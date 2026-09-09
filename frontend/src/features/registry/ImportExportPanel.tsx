import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  commitTabularXlsxImport,
  downloadCardExportTemplate,
  downloadTabularXlsxImportTemplate,
  getTabularXlsxCardExchangeOptions,
  listCardExportTemplates,
  previewTabularXlsxImport,
} from "@/api/client";
import type {
  CardExportKind,
  TabularCardImportCommitRead,
  TabularCardImportPreviewRead,
  TabularCardWorkbookPayload,
} from "@/api/types";
import { uiText } from "@/app/uiText";
import { Panel } from "@/components/common/DataSurfaces";
import { errorText } from "@/components/common/dataUtils";
import { SearchableChoicePicker } from "@/features/cards/SearchableChoicePicker";
import { ExportTemplatesPanel } from "./ExportTemplatesPanel";

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
  const savedExportsQuery = useQuery({
    queryKey: ["card-export-templates", token, selectedRegistryId],
    queryFn: () => listCardExportTemplates(token, selectedRegistryId),
    enabled: Boolean(token && selectedRegistryId),
  });
  const [templateId, setTemplateId] = useState("");
  const [organizationIds, setOrganizationIds] = useState<string[]>([]);
  const [fixedOrganizationId, setFixedOrganizationId] = useState("");
  const [fieldIds, setFieldIds] = useState<string[]>([]);
  const [activeOperation, setActiveOperation] = useState<"export" | "import" | "templates">(
    "export",
  );
  const [importMode, setImportMode] = useState<"strict" | "enrich_global_references">("strict");
  const [workExperienceAsOfDate, setWorkExperienceAsOfDate] = useState(() =>
    localIsoDate(new Date()),
  );
  const initializedTemplateKey = useRef<string | null>(null);
  const [xlsxFile, setXlsxFile] = useState<File | null>(null);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<TabularCardImportPreviewRead | null>(null);
  const [commitResult, setCommitResult] = useState<TabularCardImportCommitRead | null>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [savedExportKind, setSavedExportKind] = useState<CardExportKind>("card_list");
  const [savedExportTemplateId, setSavedExportTemplateId] = useState("");
  const [savedExportOrganizationIds, setSavedExportOrganizationIds] = useState<string[]>([]);
  const [savedExportPeriodFrom, setSavedExportPeriodFrom] = useState("");
  const [savedExportPeriodTo, setSavedExportPeriodTo] = useState("");
  const [savedExportMessage, setSavedExportMessage] = useState<string | null>(null);
  const [savedExportError, setSavedExportError] = useState<string | null>(null);

  const templates = optionsQuery.data?.templates ?? [];
  const effectiveTemplateId =
    templateId || (templates.length === 1 ? (templates[0]?.id ?? "") : "");
  const selectedTemplate =
    templates.find((template) => template.id === effectiveTemplateId) ?? null;
  const supportedFields = useMemo(
    () => selectedTemplate?.fields.filter((field) => field.supported) ?? [],
    [selectedTemplate],
  );
  const unsupportedFields = useMemo(
    () => selectedTemplate?.fields.filter((field) => !field.supported) ?? [],
    [selectedTemplate],
  );
  const supportedFieldIds = useMemo(
    () => supportedFields.map((field) => field.id),
    [supportedFields],
  );
  const templateFieldKey = `${effectiveTemplateId}:${supportedFieldIds.join("|")}`;
  const selectedOrganizationIds = organizationIds.filter((organizationId) =>
    optionsQuery.data?.organizations.some((organization) => organization.id === organizationId),
  );
  const selectedFieldIds = fieldIds.filter((fieldId) =>
    supportedFields.some((field) => field.id === fieldId),
  );
  const savedExports = (savedExportsQuery.data?.items ?? []).filter(
    (template) => template.export_kind === savedExportKind,
  );
  const selectedSavedExport =
    savedExports.find((template) => template.id === savedExportTemplateId) ?? null;
  const selectedSavedExportOrganizationIds = savedExportOrganizationIds.filter((organizationId) =>
    optionsQuery.data?.organizations.some((organization) => organization.id === organizationId),
  );
  const savedExportPersonnel = selectedSavedExport?.export_kind === "personnel_changes";
  const savedExportPeriodValid =
    !savedExportPersonnel ||
    Boolean(
      savedExportPeriodFrom && savedExportPeriodTo && savedExportPeriodFrom <= savedExportPeriodTo,
    );

  useEffect(() => {
    if (!effectiveTemplateId || initializedTemplateKey.current === templateFieldKey) {
      return;
    }
    initializedTemplateKey.current = templateFieldKey;
    setFieldIds(supportedFieldIds);
  }, [effectiveTemplateId, supportedFieldIds, templateFieldKey]);
  const needsImportOrganizationChoice = selectedOrganizationIds.length > 1;
  const effectiveFixedOrganizationId =
    selectedOrganizationIds.length === 1
      ? selectedOrganizationIds[0]
      : selectedOrganizationIds.includes(fixedOrganizationId)
        ? fixedOrganizationId
        : "";
  const importWorkbookPayload: TabularCardWorkbookPayload | null =
    selectedTemplate && selectedFieldIds.length && selectedOrganizationIds.length
      ? {
          card_template_id: selectedTemplate.id,
          field_ids: selectedFieldIds,
          organization_ids: selectedOrganizationIds,
          include_organization_column: false,
        }
      : null;
  const importPayload: TabularCardWorkbookPayload | null =
    importWorkbookPayload && effectiveFixedOrganizationId
      ? {
          ...importWorkbookPayload,
          fixed_organization_id: effectiveFixedOrganizationId,
          import_mode: importMode,
          work_experience_as_of_date: workExperienceAsOfDate || undefined,
        }
      : null;

  const downloadMutation = useMutation({
    mutationFn: async () => {
      if (!importPayload) {
        throw new Error(
          configurationError(
            Boolean(selectedTemplate),
            selectedOrganizationIds,
            selectedFieldIds,
            true,
            effectiveFixedOrganizationId,
          ),
        );
      }
      return downloadTabularXlsxImportTemplate(token, selectedRegistryId, importPayload);
    },
    onSuccess: ({ blob, filename }) => {
      triggerBrowserDownload(blob, filename);
      setImportMessage(uiText.tabularXlsxDownloaded);
      setImportError(null);
    },
    onError: (error) => {
      setImportMessage(null);
      setImportError(errorText(error));
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
  const savedExportDownloadMutation = useMutation({
    mutationFn: () => {
      if (!selectedSavedExport || !selectedSavedExportOrganizationIds.length) {
        throw new Error("Выберите шаблон и одну или несколько организаций для выгрузки.");
      }
      if (!savedExportPeriodValid) {
        throw new Error("Укажите корректный период выгрузки: начало и окончание включительно.");
      }
      return downloadCardExportTemplate(token, selectedSavedExport.id, {
        organization_ids: selectedSavedExportOrganizationIds,
        ...(savedExportPersonnel
          ? { period_from: savedExportPeriodFrom, period_to: savedExportPeriodTo }
          : {}),
      });
    },
    onSuccess: ({ blob, filename }) => {
      triggerBrowserDownload(blob, filename);
      setSavedExportMessage("XLSX-файл скачан");
      setSavedExportError(null);
    },
    onError: (error) => {
      setSavedExportMessage(null);
      setSavedExportError(errorText(error));
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

  return (
    <Panel title={uiText.importExport}>
      <section className="template-manager" aria-labelledby="tabular-xlsx-heading">
        <h3 id="tabular-xlsx-heading">{uiText.tabularXlsxTitle}</h3>
        <p className="muted-text">{uiText.tabularXlsxDescription}</p>
        {optionsQuery.isLoading && <p className="muted-text">{uiText.loadingCard}</p>}
        {optionsError && <p className="inline-alert attachment-status">{optionsError}</p>}
        {activeOperation === "import" &&
          !optionsQuery.isLoading &&
          !optionsError &&
          optionsQuery.data && (
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
                        value={effectiveTemplateId}
                        onChange={(event) => {
                          setTemplateId(event.currentTarget.value);
                          initializedTemplateKey.current = null;
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
                    <div className="field-editor-control">
                      <span>{uiText.tabularXlsxOrganizations}</span>
                      <SearchableChoicePicker
                        label={uiText.tabularXlsxOrganizations}
                        hint={uiText.tabularXlsxSelectOrganization}
                        mode="multiple"
                        options={optionsQuery.data.organizations.map((organization) => ({
                          id: organization.id,
                          label: organization.label,
                        }))}
                        value={selectedOrganizationIds}
                        onChange={(value) => {
                          setOrganizationIds(Array.isArray(value) ? value : []);
                          resetPreview();
                        }}
                      />
                    </div>
                    {selectedTemplate && (
                      <div className="field-editor-control template-body-control">
                        <SearchableChoicePicker
                          label={uiText.tabularXlsxFields}
                          hint={uiText.tabularXlsxSelectField}
                          mode="multiple"
                          options={supportedFields.map((field) => ({
                            id: field.id,
                            label: `${field.block_title}: ${field.label}`,
                          }))}
                          value={selectedFieldIds}
                          onChange={(value) => {
                            setFieldIds(Array.isArray(value) ? value : []);
                            resetPreview();
                          }}
                        />
                        {unsupportedFields.map((field) => (
                          <p key={field.id} className="muted-text">
                            {field.block_title}: {field.label} — {field.unsupported_reason}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                </section>
              )}
            </>
          )}
        <div className="xlsx-operation-tabs" role="tablist" aria-label={uiText.importExport}>
          <button
            type="button"
            role="tab"
            aria-selected={activeOperation === "templates"}
            className={
              activeOperation === "templates" ? "workspace-tab is-active" : "workspace-tab"
            }
            onClick={() => setActiveOperation("templates")}
          >
            Шаблоны выгрузки
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeOperation === "export"}
            className={activeOperation === "export" ? "workspace-tab is-active" : "workspace-tab"}
            onClick={() => setActiveOperation("export")}
          >
            {uiText.tabularXlsxExportTitle}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeOperation === "import"}
            className={activeOperation === "import" ? "workspace-tab is-active" : "workspace-tab"}
            onClick={() => setActiveOperation("import")}
          >
            {uiText.tabularXlsxImportTitle}
          </button>
        </div>
        <div className="xlsx-operation-grid">
          {activeOperation === "templates" ? (
            optionsQuery.data ? (
              <ExportTemplatesPanel
                key={`${token}:${selectedRegistryId}`}
                token={token}
                registryId={selectedRegistryId}
                options={optionsQuery.data}
              />
            ) : null
          ) : activeOperation === "export" ? (
            <section className="xlsx-operation" aria-labelledby="tabular-xlsx-export">
              <h4 id="tabular-xlsx-export">{uiText.tabularXlsxExportTitle}</h4>
              <p className="muted-text">
                Выберите вид, шаблон и организации для формирования XLSX-файла.
              </p>
              {savedExportsQuery.isLoading && <p className="muted-text">Загрузка шаблонов…</p>}
              {savedExportsQuery.error && (
                <p role="alert" className="inline-alert attachment-status">
                  {errorText(savedExportsQuery.error)}
                </p>
              )}
              {!savedExportsQuery.isLoading && !savedExportsQuery.error && (
                <div className="template-form">
                  <label className="field-editor-control">
                    <span>Вид выгрузки</span>
                    <select
                      aria-label="Вид выгрузки"
                      value={savedExportKind}
                      onChange={(event) => {
                        setSavedExportKind(event.currentTarget.value as CardExportKind);
                        setSavedExportTemplateId("");
                        setSavedExportPeriodFrom("");
                        setSavedExportPeriodTo("");
                        setSavedExportMessage(null);
                        setSavedExportError(null);
                      }}
                    >
                      <option value="card_list">Список карточек</option>
                      <option value="personnel_changes">Кадровые изменения</option>
                    </select>
                  </label>
                  <label className="field-editor-control">
                    <span>Шаблон выгрузки</span>
                    <select
                      aria-label="Шаблон выгрузки"
                      value={savedExportTemplateId}
                      onChange={(event) => {
                        setSavedExportTemplateId(event.currentTarget.value);
                        setSavedExportPeriodFrom("");
                        setSavedExportPeriodTo("");
                        setSavedExportMessage(null);
                        setSavedExportError(null);
                      }}
                    >
                      <option value="">Выберите шаблон выгрузки</option>
                      {savedExports.map((template) => (
                        <option key={template.id} value={template.id}>
                          {template.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="field-editor-control">
                    <span>Организации выгрузки</span>
                    <SearchableChoicePicker
                      label="Организации выгрузки"
                      hint="Выберите организации"
                      mode="multiple"
                      options={(optionsQuery.data?.organizations ?? []).map((organization) => ({
                        id: organization.id,
                        label: organization.label,
                      }))}
                      value={selectedSavedExportOrganizationIds}
                      onChange={(value) => {
                        setSavedExportOrganizationIds(Array.isArray(value) ? value : []);
                        setSavedExportMessage(null);
                        setSavedExportError(null);
                      }}
                    />
                    <div className="row-actions">
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => {
                          setSavedExportOrganizationIds(
                            (optionsQuery.data?.organizations ?? []).map(
                              (organization) => organization.id,
                            ),
                          );
                          setSavedExportMessage(null);
                          setSavedExportError(null);
                        }}
                      >
                        Все организации
                      </button>
                    </div>
                  </div>
                  {savedExportPersonnel && (
                    <>
                      <label className="field-editor-control">
                        <span>Начало периода</span>
                        <input
                          aria-label="Начало периода"
                          type="date"
                          value={savedExportPeriodFrom}
                          onChange={(event) => setSavedExportPeriodFrom(event.currentTarget.value)}
                        />
                      </label>
                      <label className="field-editor-control">
                        <span>Конец периода</span>
                        <input
                          aria-label="Конец периода"
                          type="date"
                          value={savedExportPeriodTo}
                          onChange={(event) => setSavedExportPeriodTo(event.currentTarget.value)}
                        />
                      </label>
                    </>
                  )}
                </div>
              )}
              <div className="row-actions">
                <button
                  type="button"
                  className="primary-button"
                  disabled={
                    !selectedSavedExport ||
                    !selectedSavedExportOrganizationIds.length ||
                    !savedExportPeriodValid ||
                    savedExportDownloadMutation.isPending
                  }
                  onClick={() => savedExportDownloadMutation.mutate()}
                >
                  Скачать XLSX
                </button>
              </div>
              {savedExportPersonnel && (
                <p className="muted-text">
                  Обе даты включаются в период. Отчёт содержит назначения, изменения и увольнения.
                </p>
              )}
              {savedExportMessage && (
                <p className="inline-success attachment-status">{savedExportMessage}</p>
              )}
              {savedExportError && (
                <p role="alert" className="inline-alert attachment-status">
                  {savedExportError}
                </p>
              )}
            </section>
          ) : (
            <section className="xlsx-operation" aria-labelledby="tabular-xlsx-import">
              <h4 id="tabular-xlsx-import">{uiText.tabularXlsxImportTitle}</h4>
              <p className="muted-text">{uiText.tabularXlsxImportDescription}</p>
              <label className="field-editor-control">
                <span>{uiText.tabularXlsxImportMode}</span>
                <select
                  aria-label={uiText.tabularXlsxImportMode}
                  value={importMode}
                  onChange={(event) => {
                    setImportMode(event.currentTarget.value as typeof importMode);
                    resetPreview();
                  }}
                >
                  <option value="strict">{uiText.tabularXlsxImportModeStrict}</option>
                  <option value="enrich_global_references">
                    {uiText.tabularXlsxImportModeEnrich}
                  </option>
                </select>
                {importMode === "enrich_global_references" && (
                  <small className="muted-text">{uiText.tabularXlsxImportModeEnrichHelp}</small>
                )}
              </label>
              <label className="field-editor-control">
                <span>{uiText.tabularXlsxExperienceAsOfDate}</span>
                <input
                  aria-label={uiText.tabularXlsxExperienceAsOfDate}
                  type="date"
                  value={workExperienceAsOfDate}
                  onChange={(event) => {
                    setWorkExperienceAsOfDate(event.currentTarget.value);
                    resetPreview();
                  }}
                />
              </label>
              {needsImportOrganizationChoice && (
                <label className="field-editor-control">
                  <span>{uiText.tabularXlsxImportOrganization}</span>
                  <select
                    aria-label={uiText.tabularXlsxImportOrganization}
                    value={effectiveFixedOrganizationId}
                    onChange={(event) => {
                      setFixedOrganizationId(event.currentTarget.value);
                      resetPreview();
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
                  onClick={() => downloadMutation.mutate()}
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
          )}
        </div>
      </section>
    </Panel>
  );
}

function ImportPreview({ preview }: { preview: TabularCardImportPreviewRead }) {
  return (
    <div className="import-export-result">
      <strong>{formatImportSummary(preview)}</strong>
      {preview.summary.would_create_reference_items > 0 && (
        <div className="import-export-reference-plan">
          <strong>{formatReferenceItemSummary(preview)}</strong>
          <ul className="file-action-list">
            {preview.new_reference_items.map((item) => (
              <li key={`${item.field_label}:${item.label}`}>
                {item.field_label}: {item.label}
              </li>
            ))}
          </ul>
        </div>
      )}
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
  requiresFixedOrganization: boolean,
  fixedOrganizationId: string,
) {
  if (!hasTemplate) return uiText.tabularXlsxSelectTemplate;
  if (!organizationIds.length) return uiText.tabularXlsxSelectOrganization;
  if (!fieldIds.length) return uiText.tabularXlsxSelectField;
  return requiresFixedOrganization && !fixedOrganizationId
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

function formatReferenceItemSummary(preview: TabularCardImportPreviewRead) {
  return uiText.tabularXlsxReferenceItemsPlanned.replace(
    "{count}",
    String(preview.summary.would_create_reference_items),
  );
}

function localIsoDate(value: Date) {
  const offsetMilliseconds = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offsetMilliseconds).toISOString().slice(0, 10);
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
