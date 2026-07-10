import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FormEventHandler,
  type KeyboardEvent,
  type RefObject,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

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
    <form className="admin-mutation-form" aria-label={title} onSubmit={onSubmit}>
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
  onCancel,
  restoreFocusRef,
  children,
}: {
  title: string;
  onCancel?: () => void;
  restoreFocusRef?: RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [portalRoot] = useState<HTMLDivElement | null>(() => {
    if (typeof document === "undefined") return null;
    const root = document.createElement("div");
    root.dataset.adminMutationPortal = "true";
    return root;
  });

  useLayoutEffect(() => {
    if (!portalRoot) return;
    const restoreFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const requestedRestoreFocus = restoreFocusRef?.current ?? null;
    document.body.append(portalRoot);
    const background = Array.from(document.body.children)
      .filter(
        (element): element is HTMLElement =>
          element instanceof HTMLElement && element !== portalRoot,
      )
      .map((element) => ({
        element,
        hadInert: element.hasAttribute("inert"),
        ariaHidden: element.getAttribute("aria-hidden"),
      }));
    for (const { element } of background) {
      element.setAttribute("inert", "");
      element.setAttribute("aria-hidden", "true");
    }
    const initialFocus =
      dialogRef.current?.querySelector<HTMLElement>("[data-dialog-initial-focus]") ??
      focusableElements(dialogRef.current)[0] ??
      dialogRef.current;
    initialFocus?.focus();

    return () => {
      for (const { element, hadInert, ariaHidden } of background) {
        if (!hadInert) element.removeAttribute("inert");
        if (ariaHidden === null) {
          element.removeAttribute("aria-hidden");
        } else {
          element.setAttribute("aria-hidden", ariaHidden);
        }
      }
      portalRoot.remove();
      const focusTarget = requestedRestoreFocus?.isConnected ? requestedRestoreFocus : restoreFocus;
      focusTarget?.focus();
    };
  }, [portalRoot, restoreFocusRef]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && onCancel) {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = focusableElements(dialogRef.current);
    if (focusable.length === 0) {
      event.preventDefault();
      dialogRef.current?.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (
      event.shiftKey &&
      (document.activeElement === first || !dialogRef.current?.contains(document.activeElement))
    ) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  if (!portalRoot) return null;

  return createPortal(
    <div
      ref={dialogRef}
      className="admin-mutation-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
    >
      <div className="admin-mutation-dialog-surface">
        <h3 id={titleId}>{title}</h3>
        {children}
      </div>
    </div>,
    portalRoot,
  );
}

function focusableElements(root: HTMLElement | null) {
  if (!root) return [];
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter(
    (element) => !element.hasAttribute("hidden") && element.getAttribute("aria-hidden") !== "true",
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
      {error && (
        <p className="inline-alert" role="alert">
          {errorText(error)}
        </p>
      )}
      {successMessage && <p className="inline-success">{successMessage}</p>}
    </>
  );
}
