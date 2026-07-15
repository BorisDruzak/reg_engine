import type { ReactNode } from "react";

export type CardDraftActionRailProps = {
  state: "setup" | "draft" | "active";
  setupComplete?: boolean;
  attention?: boolean;
  setupMessage?: string;
  isSaving?: boolean;
  onSaveDraft?: () => void;
  result?: ReactNode;
  "aria-label"?: string;
};

export function CardDraftActionRail({
  state,
  setupComplete = false,
  attention = false,
  setupMessage,
  isSaving = false,
  onSaveDraft,
  result,
  "aria-label": ariaLabel,
}: CardDraftActionRailProps) {
  if (state !== "setup") {
    return (
      <div className="card-draft-action-rail">
        <p role="status" aria-label={ariaLabel}>
          {state === "draft" ? "Черновик" : "Активна"}
        </p>
      </div>
    );
  }

  return (
    <div className="card-draft-action-rail">
      <p>
        {setupMessage ??
          (setupComplete
            ? "Базовый блок заполнен. Сохраните черновик, чтобы перейти к полям шаблона."
            : "Выберите организацию и шаблон, затем сохраните черновик.")}
      </p>
      <button
        type="button"
        className={`primary-button card-draft-save-button${setupComplete ? " is-ready" : ""}${attention ? " is-attention" : ""}`}
        disabled={!setupComplete || isSaving || !onSaveDraft}
        onClick={onSaveDraft}
      >
        Сохранить черновик
      </button>
      {result ? <p role="status">{result}</p> : null}
    </div>
  );
}
