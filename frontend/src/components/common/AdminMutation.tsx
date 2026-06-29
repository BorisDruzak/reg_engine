import { useId, type FormEventHandler, type ReactNode } from "react";

import { uiText } from "@/app/uiText";

import { errorText } from "./dataUtils";
import { archiveConfirmationMessage } from "./AdminMutationUtils";

export function AdminMutationForm({
  title,
  description,
  children,
  submitLabel = uiText.save,
  cancelLabel = uiText.cancel,
  isSubmitting,
  error,
  successMessage,
  onCancel,
  onSubmit,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  submitLabel?: string;
  cancelLabel?: string;
  isSubmitting: boolean;
  error?: unknown;
  successMessage?: string | null;
  onCancel?: () => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
}) {
  return (
    <form className="admin-mutation-form" onSubmit={onSubmit}>
      <header className="admin-mutation-header">
        <h3>{title}</h3>
        {description && <p>{description}</p>}
      </header>
      <div className="admin-mutation-body">{children}</div>
      <MutationFeedback error={error} successMessage={successMessage} />
      <footer className="admin-mutation-actions">
        {onCancel && (
          <button type="button" className="ghost-button" onClick={onCancel}>
            {cancelLabel}
          </button>
        )}
        <button type="submit" className="primary-button" disabled={isSubmitting}>
          {isSubmitting ? uiText.saving : submitLabel}
        </button>
      </footer>
    </form>
  );
}

export function AdminMutationDialog({
  title,
  children,
}: {
  title: string;
  onCancel?: () => void;
  children: ReactNode;
}) {
  const titleId = useId();

  return (
    <div className="admin-mutation-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className="admin-mutation-dialog-surface">
        <h3 id={titleId}>{title}</h3>
        {children}
      </div>
    </div>
  );
}

export function ArchiveConfirmation({
  entityLabel,
  itemLabel,
  isPending,
  onCancel,
  onConfirm,
}: {
  entityLabel: string;
  itemLabel: string;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="archive-confirmation">
      <p>
        {entityLabel}: {itemLabel}
      </p>
      <p>{archiveConfirmationMessage(entityLabel)}</p>
      <div className="admin-mutation-actions">
        <button type="button" className="ghost-button" onClick={onCancel}>
          {uiText.cancel}
        </button>
        <button type="button" className="danger-button" disabled={isPending} onClick={onConfirm}>
          {isPending ? uiText.archiving : uiText.archive}
        </button>
      </div>
    </div>
  );
}

export function MutationFeedback({
  error,
  successMessage,
}: {
  error?: unknown;
  successMessage?: string | null;
}) {
  return (
    <>
      {error && <p className="inline-alert" role="alert">{errorText(error)}</p>}
      {successMessage && <p className="inline-success">{successMessage}</p>}
    </>
  );
}
