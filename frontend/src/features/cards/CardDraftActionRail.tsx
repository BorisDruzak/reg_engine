import type { ReactNode } from "react";

export type CardDraftActionRailProps = {
  state: "setup" | "draft" | "active";
  setupComplete?: boolean;
  isSaving?: boolean;
  onSaveDraft?: () => void;
  result?: ReactNode;
  "aria-label"?: string;
};

export function CardDraftActionRail({
  state,
  setupComplete = false,
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
      <p>Выберите организацию и шаблон, затем сохраните черновик.</p>
      <button
        type="button"
        className="primary-button"
        disabled={!setupComplete || isSaving || !onSaveDraft}
        onClick={onSaveDraft}
      >
        Сохранить черновик
      </button>
      {result ? <p role="status">{result}</p> : null}
    </div>
  );
}
