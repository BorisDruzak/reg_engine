import { useEffect, useRef, useState, type FormEvent } from "react";

import { ApiError, apiRequest } from "@/api/client";
import type { WorkExperienceValue } from "@/api/types";
import { AdminMutationDialog, MutationFeedback } from "@/components/common/AdminMutation";

import {
  getMunicipalServiceExperience,
  type MunicipalServiceRead,
} from "./municipalServiceExperience";
import { WorkExperienceEditor } from "./WorkExperienceEditor";
import {
  defaultWorkExperienceValue,
  formatStoredWorkExperience,
  workExperiencePayload,
} from "./workExperience";
import "./manualExperienceRecalculation.css";

export type ManualExperienceRecalculationProps = {
  token: string;
  cardId: string;
  fieldId: string;
  blockInstanceId: string | null;
  requiresBasis: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
};
type ManualPreview = {
  value: WorkExperienceValue;
  server_date: string;
  as_of_date: string;
};

export function ManualExperienceRecalculation(props: ManualExperienceRecalculationProps) {
  const identity = JSON.stringify([
    props.token,
    props.cardId,
    props.fieldId,
    props.blockInstanceId,
  ]);
  return <ManualExperienceRecalculationSession key={identity} {...props} />;
}

function ManualExperienceRecalculationSession({
  token,
  cardId,
  fieldId,
  blockInstanceId,
  requiresBasis,
  onClose,
  onSaved,
}: ManualExperienceRecalculationProps) {
  const [source, setSource] = useState<MunicipalServiceRead | null>(null);
  const [value, setValue] = useState<WorkExperienceValue>(defaultWorkExperienceValue);
  const [asOfDate, setAsOfDate] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [invalidDuration, setInvalidDuration] = useState(false);
  const [basisText, setBasisText] = useState("");
  const [occurredOn, setOccurredOn] = useState("");
  const [preview, setPreview] = useState<{ key: string; result: ManualPreview } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [previewError, setPreviewError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const generation = useRef(0);
  const endpoint = `/api/v1/cards/${encodeURIComponent(cardId)}/fields/${encodeURIComponent(fieldId)}/municipal-service-experience`;

  useEffect(() => {
    const current = ++generation.current;
    let active = true;
    getMunicipalServiceExperience(token, cardId, fieldId, blockInstanceId)
      .then((loaded) => {
        if (!active || current !== generation.current) return;
        setSource(loaded);
        setValue(loaded.manual_input ?? loaded.manual_value ?? defaultWorkExperienceValue());
        setAsOfDate(loaded.manual_as_of_date ?? loaded.source_date ?? loaded.server_date);
        setOccurredOn(loaded.server_date);
      })
      .catch((reason: unknown) => {
        if (active && current === generation.current) setError(reason);
      })
      .finally(() => {
        if (active && current === generation.current) setLoading(false);
      });
    return () => {
      active = false;
      generation.current = current + 1;
    };
  }, [token, cardId, fieldId, blockInstanceId]);

  const currentKey = JSON.stringify([workExperiencePayload(value), asOfDate]);
  const inputValid = isIsoDate(asOfDate) && !invalidDuration;
  const matchingPreview = inputValid && preview?.key === currentKey ? preview.result : null;

  useEffect(() => {
    if (!source?.can_manage || source.calculation || !inputValid) return;
    const current = generation.current;
    let active = true;
    const timer = window.setTimeout(() => {
      setPreviewError(null);
      void apiRequest<ManualPreview>(`${endpoint}/manual-preview`, {
        token,
        method: "POST",
        body: {
          ...workExperiencePayload(value),
          as_of_date: asOfDate,
          block_instance_id: blockInstanceId,
        },
      })
        .then((result) => {
          if (active && current === generation.current) setPreview({ key: currentKey, result });
        })
        .catch((reason: unknown) => {
          if (active && current === generation.current) {
            setPreview(null);
            setPreviewError(reason);
          }
        });
    }, 280);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [source, inputValid, currentKey, value, asOfDate, blockInstanceId, endpoint, token]);

  const canSave = Boolean(
    source?.can_manage &&
    !source.calculation &&
    matchingPreview &&
    confirmed &&
    (!requiresBasis || basisText.trim()) &&
    (!occurredOn || isIsoDate(occurredOn)) &&
    !saving,
  );

  function close() {
    generation.current++;
    onClose();
  }
  function changeDate(next: string) {
    setAsOfDate(next);
    setConfirmed(false);
    setPreview(null);
    setPreviewError(null);
  }
  function validateDuration(event: FormEvent<HTMLDivElement>) {
    const inputs = event.currentTarget.querySelectorAll<HTMLInputElement>(
      "input[data-work-experience-part]",
    );
    setInvalidDuration(Array.from(inputs).some((input) => !/^\d+$/.test(input.value)));
    setConfirmed(false);
    setPreview(null);
    setPreviewError(null);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave || !source) return;
    const current = generation.current;
    setSaving(true);
    setError(null);
    try {
      await apiRequest<MunicipalServiceRead>(`${endpoint}/manual`, {
        token,
        method: "POST",
        body: {
          ...workExperiencePayload(value),
          as_of_date: asOfDate,
          block_instance_id: blockInstanceId,
          confirm_manual: false,
          expected_revision: source.revision,
          ...(basisText.trim() ? { basis_text: basisText.trim() } : {}),
          ...(occurredOn ? { occurred_on: occurredOn } : {}),
        },
      });
      if (current !== generation.current) return;
      await onSaved();
      if (current === generation.current) close();
    } catch (reason) {
      if (current === generation.current) setError(reason);
    } finally {
      if (current === generation.current) setSaving(false);
    }
  }

  return (
    <AdminMutationDialog
      title="Пересчёт стажа на текущую дату"
      onCancel={close}
      headerActions={
        <button
          type="button"
          className="ghost-button manual-experience-close"
          aria-label="Закрыть"
          onClick={close}
        >
          ×
        </button>
      }
    >
      <div className="manual-experience-recalculation">
        {loading ? <p role="status">Загрузка исходного стажа…</p> : null}
        <ManualFeedback error={error} />
        {source?.calculation ? (
          <p role="note">
            Стаж рассчитан по периодам. Перейдите к ручному вводу в калькуляторе, если нужно явно
            заменить историю периодов.
          </p>
        ) : source ? (
          <form onSubmit={(event) => void submit(event)} aria-label="Пересчёт ручного стажа">
            <p>
              Укажите стаж, который был на выбранную дату. К нему прибавляется календарное время со
              следующего дня до текущей даты сервера. При повторном открытии используются исходные
              числа и дата, поэтому время не прибавляется дважды.
            </p>
            {!source.manual_input ? (
              <p role="note">
                Если в карточке уже показан стаж на текущую дату, введите исходные числа на
                выбранную дату, чтобы не учесть прошедшее время повторно.
              </p>
            ) : null}
            {!source.can_manage ? <p>Доступен только просмотр.</p> : null}
            <div onInputCapture={validateDuration} onChangeCapture={validateDuration}>
              <WorkExperienceEditor
                label="Исходный стаж"
                value={value}
                disabled={saving || !source.can_manage}
                onChange={setValue}
              />
            </div>
            <ManualDateControl
              label="Дата исходного стажа"
              value={asOfDate}
              onChange={changeDate}
              disabled={saving || !source.can_manage}
            />
            <label className="checkbox-inline">
              <input
                type="checkbox"
                checked={confirmed}
                disabled={saving || !source.can_manage}
                onChange={(event) => setConfirmed(event.currentTarget.checked)}
              />
              <span>Подтверждаю, что указанный стаж был на выбранную дату</span>
            </label>
            <section aria-label="Результат пересчёта" aria-live="polite">
              {matchingPreview ? (
                <>
                  <p>Стаж на текущую дату сервера: {displayDate(matchingPreview.server_date)}</p>
                  <output>{formatStoredWorkExperience(matchingPreview.value)}</output>
                </>
              ) : (
                <p role="status">
                  {!source.can_manage
                    ? "Пересчёт недоступен."
                    : previewError
                      ? "Предпросмотр недоступен. Проверьте данные и повторите изменение."
                      : inputValid
                        ? "Ожидание предпросмотра…"
                        : "Проверьте исходный стаж и дату."}
                </p>
              )}
            </section>
            <ManualFeedback error={previewError} />
            {requiresBasis ? (
              <>
                <label>
                  Основание изменения
                  <textarea
                    value={basisText}
                    disabled={saving || !source.can_manage}
                    onChange={(event) => setBasisText(event.currentTarget.value)}
                  />
                </label>
                <ManualDateControl
                  label="Дата изменения"
                  value={occurredOn}
                  onChange={setOccurredOn}
                  disabled={saving || !source.can_manage}
                  optional
                />
              </>
            ) : null}
            <footer className="row-actions">
              <button type="button" className="ghost-button" onClick={close}>
                Отмена
              </button>
              <button type="submit" className="primary-button" disabled={!canSave}>
                {saving ? "Сохранение…" : "Применить пересчёт"}
              </button>
            </footer>
          </form>
        ) : null}
        {!source || source.calculation ? (
          <button type="button" className="ghost-button" onClick={close}>
            Отмена
          </button>
        ) : null}
      </div>
    </AdminMutationDialog>
  );
}

function ManualDateControl({
  label,
  value,
  onChange,
  disabled,
  optional = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  optional?: boolean;
}) {
  return (
    <div className="manual-experience-date">
      <label>
        {label}
        <input
          type="text"
          inputMode="numeric"
          placeholder="ДД.ММ.ГГГГ"
          maxLength={10}
          value={displayDate(value)}
          disabled={disabled}
          aria-invalid={!((optional && !value) || isIsoDate(value))}
          onChange={(event) => {
            const raw = event.currentTarget.value;
            const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(raw);
            const candidate = match ? `${match[3]}-${match[2]}-${match[1]}` : raw;
            onChange(isIsoDate(candidate) ? candidate : raw);
          }}
        />
      </label>
      <input
        type="date"
        aria-label={`Календарь: ${label}`}
        value={isIsoDate(value) ? value : ""}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </div>
  );
}
function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
function displayDate(value: string) {
  return isIsoDate(value) ? value.split("-").reverse().join(".") : value;
}
function ManualFeedback({ error }: { error: unknown }) {
  if (error instanceof ApiError && /^[А-Яа-яЁё]/.test(error.message))
    return (
      <p className="inline-alert" role="alert">
        {error.message}
      </p>
    );
  return <MutationFeedback error={error} />;
}
