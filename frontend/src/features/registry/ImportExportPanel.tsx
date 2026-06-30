import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { commitCardImport, downloadCardExport, previewCardImport } from "@/api/client";
import type { CardImportCommitRead, CardImportPreviewRead } from "@/api/types";
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
  const [csvContent, setCsvContent] = useState("");
  const [previewCsvContent, setPreviewCsvContent] = useState("");
  const [preview, setPreview] = useState<CardImportPreviewRead | null>(null);
  const [commitResult, setCommitResult] = useState<CardImportCommitRead | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const downloadMutation = useMutation({
    mutationFn: (exportFormat: "json" | "csv") =>
      downloadCardExport(token, selectedRegistryId, exportFormat),
    onSuccess: ({ blob, filename }) => {
      triggerBrowserDownload(blob, filename);
      setMessage(uiText.exportDownloaded);
      setLocalError(null);
    },
    onError: (error) => setLocalError(errorText(error)),
  });
  const previewMutation = useMutation({
    mutationFn: () => {
      const content = csvContent.trim();
      if (!content) {
        throw new Error(uiText.importCsvRequired);
      }
      return previewCardImport(token, selectedRegistryId, { csv_content: csvContent });
    },
    onSuccess: (result) => {
      setPreview(result);
      setPreviewCsvContent(csvContent);
      setCommitResult(null);
      setMessage(
        result.summary.invalid_rows === 0 ? uiText.importCanApply : uiText.importPreviewReady,
      );
      setLocalError(null);
    },
    onError: (error) => setLocalError(errorText(error)),
  });
  const commitMutation = useMutation({
    mutationFn: () => {
      if (!preview) {
        throw new Error(uiText.importPreviewRequired);
      }
      if (previewCsvContent !== csvContent) {
        throw new Error(uiText.importPreviewStale);
      }
      return commitCardImport(token, selectedRegistryId, { csv_content: csvContent });
    },
    onSuccess: async (result) => {
      setCommitResult(result);
      setMessage(uiText.importApplied);
      setLocalError(null);
      await queryClient.invalidateQueries({ queryKey: ["cards", token, selectedRegistryId] });
      await queryClient.invalidateQueries({ queryKey: ["audit-events", token] });
    },
    onError: (error) => setLocalError(errorText(error)),
  });

  const hasStableValidPreview =
    Boolean(preview) && preview?.summary.invalid_rows === 0 && previewCsvContent === csvContent;

  function handlePreviewSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    previewMutation.mutate();
  }

  return (
    <Panel title={uiText.importExport}>
      <section className="template-manager" aria-labelledby="card-export-heading">
        <h3 id="card-export-heading">{uiText.exportCards}</h3>
        <div className="row-actions">
          <button
            type="button"
            className="ghost-button"
            disabled={!selectedRegistryId || downloadMutation.isPending}
            onClick={() => downloadMutation.mutate("json")}
          >
            {uiText.downloadJson}
          </button>
          <button
            type="button"
            className="ghost-button"
            disabled={!selectedRegistryId || downloadMutation.isPending}
            onClick={() => downloadMutation.mutate("csv")}
          >
            {uiText.downloadCsv}
          </button>
        </div>
      </section>

      <section className="template-manager" aria-labelledby="card-import-heading">
        <h3 id="card-import-heading">{uiText.importCards}</h3>
        <form className="template-form" onSubmit={handlePreviewSubmit}>
          <label className="field-editor-control template-body-control">
            <span>{uiText.importCsvContent}</span>
            <textarea
              value={csvContent}
              onChange={(event) => setCsvContent(event.currentTarget.value)}
            />
          </label>
          <div className="row-actions template-body-control">
            <button
              type="submit"
              className="primary-button"
              disabled={!selectedRegistryId || previewMutation.isPending}
            >
              {uiText.previewImport}
            </button>
            <button
              type="button"
              className="primary-button"
              disabled={!hasStableValidPreview || commitMutation.isPending}
              onClick={() => commitMutation.mutate()}
            >
              {uiText.applyImport}
            </button>
          </div>
        </form>
        {message && <p className="inline-success attachment-status">{message}</p>}
        {localError && <p className="inline-alert attachment-status">{localError}</p>}
        {preview && <ImportPreview preview={preview} />}
        {commitResult && <ImportCommitResult result={commitResult} />}
      </section>
    </Panel>
  );
}

function ImportPreview({ preview }: { preview: CardImportPreviewRead }) {
  return (
    <div className="import-export-result">
      <strong>{formatImportSummary(preview)}</strong>
      <ul className="file-action-list">
        {preview.rows.map((row) => (
          <li key={`${row.row_number}-${row.field_path}`}>
            <div>
              <strong>
                {`Строка ${row.row_number} / ${row.field_path} / ${
                  row.status === "valid" ? uiText.importRowValid : uiText.importRowInvalid
                }`}
              </strong>
              <span>{`${
                row.action === "create" ? uiText.importActionCreate : uiText.importActionUpdate
              } / ${row.raw_value}`}</span>
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

function ImportCommitResult({ result }: { result: CardImportCommitRead }) {
  return (
    <div className="import-export-result">
      <strong>{formatCommitSummary(result)}</strong>
    </div>
  );
}

function formatImportSummary(preview: CardImportPreviewRead) {
  return uiText.importSummary
    .replace("{total}", String(preview.summary.total_rows))
    .replace("{valid}", String(preview.summary.valid_rows))
    .replace("{invalid}", String(preview.summary.invalid_rows));
}

function formatCommitSummary(result: CardImportCommitRead) {
  return uiText.importCommitSummary
    .replace("{committed}", String(result.summary.committed_rows))
    .replace("{created}", String(result.summary.created_cards))
    .replace("{updated}", String(result.summary.updated_cards));
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
