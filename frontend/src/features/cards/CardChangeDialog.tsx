import { useState } from "react";

import type { CardChangePayload } from "@/api/types";
import { AdminMutationDialog } from "@/components/common/AdminMutation";
import { errorText } from "@/components/common/dataUtils";

import { ChangeBasisFields } from "./ChangeBasisFields";

export function CardChangeDialog({
  title,
  isPending,
  error,
  onCancel,
  onSubmit,
}: {
  title: string;
  isPending: boolean;
  error: Error | null;
  onCancel: () => void;
  onSubmit: (payload: CardChangePayload) => void;
}) {
  const [basisText, setBasisText] = useState("");
  const [occurredOn, setOccurredOn] = useState("");
  return (
    <AdminMutationDialog title={title} onCancel={isPending ? undefined : onCancel}>
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          if (!basisText.trim() || isPending) return;
          onSubmit({
            basis_text: basisText.trim(),
            ...(occurredOn ? { occurred_on: occurredOn } : {}),
          });
        }}
      >
        <ChangeBasisFields
          basisText={basisText}
          occurredOn={occurredOn}
          disabled={isPending}
          onBasisTextChange={setBasisText}
          onOccurredOnChange={setOccurredOn}
        />
        {error ? <p className="inline-alert">{errorText(error)}</p> : null}
        <div className="row-actions">
          <button
            type="submit"
            className="primary-button"
            disabled={!basisText.trim() || isPending}
          >
            Сохранить
          </button>
          <button type="button" className="ghost-button" disabled={isPending} onClick={onCancel}>
            Отмена
          </button>
        </div>
      </form>
    </AdminMutationDialog>
  );
}
