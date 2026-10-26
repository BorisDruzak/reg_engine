import { useEffect, useRef, useState, type FormEvent } from "react";

import type { WorkExperienceValue } from "@/api/types";
import { ApiError } from "@/api/client";
import { AdminMutationDialog, MutationFeedback } from "@/components/common/AdminMutation";

import { WorkExperienceEditor } from "./WorkExperienceEditor";
import {
  defaultWorkExperienceValue,
  formatStoredWorkExperience,
  workExperiencePayload,
} from "./workExperience";
import {
  getMunicipalServiceExperience,
  previewMunicipalServiceExperience,
  saveMunicipalServiceExperience,
  setManualMunicipalServiceExperience,
  municipalServiceKinds,
  type MunicipalServiceCalculation,
  type MunicipalServicePeriod,
  type MunicipalServiceRead,
  type MunicipalServiceResult,
  type MunicipalServiceKind,
} from "./municipalServiceExperience";
import "./municipalServiceCalculator.css";

export type MunicipalServiceCalculatorProps = {
  token: string;
  cardId: string;
  fieldId: string;
  blockInstanceId: string | null;
  requiresBasis: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
};
const emptyCalculation = (): MunicipalServiceCalculation => ({
  mode: "calculated",
  version: 1,
  method: "calendar_remainder_30_v1",
  periods: [],
  baseline: null,
});
const previewKey = (calculation: MunicipalServiceCalculation | null, asOfDate: string) =>
  JSON.stringify([calculation, asOfDate]);

export function MunicipalServiceCalculator(props: MunicipalServiceCalculatorProps) {
  const identity = JSON.stringify([
    props.token,
    props.cardId,
    props.fieldId,
    props.blockInstanceId,
  ]);
  return <MunicipalServiceCalculatorSession key={identity} {...props} />;
}

function MunicipalServiceCalculatorSession({
  token,
  cardId,
  fieldId,
  blockInstanceId,
  requiresBasis,
  onClose,
  onSaved,
}: MunicipalServiceCalculatorProps) {
  const [source, setSource] = useState<MunicipalServiceRead | null>(null);
  const [calculation, setCalculation] = useState<MunicipalServiceCalculation | null>(null);
  const [asOfDate, setAsOfDate] = useState("");
  const [preview, setPreview] = useState<{ key: string; result: MunicipalServiceResult } | null>(
    null,
  );
  const [previewError, setPreviewError] = useState<unknown>(null);
  const [error, setError] = useState<unknown>(null);
  const [isLoading, setLoading] = useState(true);
  const [isSaving, setSaving] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [manualConfirmed, setManualConfirmed] = useState(false);
  const [manualValue, setManualValue] = useState<WorkExperienceValue>(defaultWorkExperienceValue);
  const [invalidDuration, setInvalidDuration] = useState(false);
  const [basisText, setBasisText] = useState("");
  const [occurredOn, setOccurredOn] = useState("");
  const generation = useRef(0);

  useEffect(() => {
    const current = ++generation.current;
    let active = true;
    getMunicipalServiceExperience(token, cardId, fieldId, blockInstanceId)
      .then((value) => {
        if (!active || current !== generation.current) return;
        setSource(value);
        setCalculation(value.calculation);
        setAsOfDate(value.server_date);
        setOccurredOn(value.server_date);
        setManualValue(value.result?.value ?? value.manual_value ?? defaultWorkExperienceValue());
        if (value.result && value.calculation)
          setPreview({
            key: previewKey(value.calculation, value.server_date),
            result: value.result,
          });
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

  const currentKey = previewKey(calculation, asOfDate);
  const validDates =
    calculation !== null &&
    isIsoDate(asOfDate) &&
    calculation.periods.every(
      (period) =>
        isIsoDate(period.start_date) && (period.end_date === null || isIsoDate(period.end_date)),
    ) &&
    (calculation.baseline === null || isIsoDate(calculation.baseline.as_of_date));
  const matchingPreview = preview?.key === currentKey ? preview.result : null;

  useEffect(() => {
    if (!source || !calculation || !validDates || manualMode || invalidDuration) return;
    let active = true;
    const current = generation.current;
    const timer = window.setTimeout(() => {
      setPreviewError(null);
      previewMunicipalServiceExperience(token, cardId, fieldId, {
        calculation,
        as_of_date: asOfDate,
        block_instance_id: blockInstanceId,
      })
        .then((value) => {
          if (active && current === generation.current)
            setPreview({ key: currentKey, result: value });
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
  }, [
    token,
    cardId,
    fieldId,
    blockInstanceId,
    source,
    calculation,
    asOfDate,
    currentKey,
    validDates,
    manualMode,
    invalidDuration,
  ]);

  function close() {
    generation.current++;
    onClose();
  }
  function updatePeriod(id: string, patch: Partial<MunicipalServicePeriod>) {
    setCalculation(
      (previous) =>
        previous && {
          ...previous,
          periods: previous.periods.map((period) =>
            period.id === id ? { ...period, ...patch } : period,
          ),
        },
    );
  }
  function addPeriod() {
    setCalculation((previous) => {
      const next = previous ?? emptyCalculation();
      return {
        ...next,
        periods: [
          ...next.periods,
          {
            id: crypto.randomUUID(),
            kind: "municipal",
            start_date: "",
            end_date: null,
            included: true,
            confirmed: false,
            basis: "",
            pension_only: false,
          },
        ],
      };
    });
  }
  function addBaseline() {
    if (!source) return;
    setCalculation((previous) => ({
      ...(previous ?? emptyCalculation()),
      baseline: {
        ...workExperiencePayload(source.manual_value ?? defaultWorkExperienceValue()),
        as_of_date: source.server_date,
        basis: "",
        confirmed: false,
      },
    }));
  }
  function updateBaseline(patch: Partial<NonNullable<MunicipalServiceCalculation["baseline"]>>) {
    setCalculation((previous) =>
      previous?.baseline ? { ...previous, baseline: { ...previous.baseline, ...patch } } : previous,
    );
  }

  const auditValid = requiresBasis
    ? basisText.trim().length > 0 && isIsoDate(occurredOn)
    : occurredOn === "" || isIsoDate(occurredOn);
  const baselineReady =
    !calculation?.baseline ||
    (calculation.baseline.confirmed && calculation.baseline.basis.trim().length > 0);
  const canSave =
    source?.can_manage &&
    !isSaving &&
    auditValid &&
    !invalidDuration &&
    (manualMode
      ? manualConfirmed
      : baselineReady && validDates && matchingPreview?.can_save === true);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!source || !canSave) return;
    const current = generation.current;
    setSaving(true);
    setError(null);
    const audit = {
      block_instance_id: blockInstanceId,
      expected_revision: source.revision,
      ...(basisText.trim() ? { basis_text: basisText.trim() } : {}),
      ...(isIsoDate(occurredOn) ? { occurred_on: occurredOn } : {}),
    };
    try {
      if (manualMode)
        await setManualMunicipalServiceExperience(token, cardId, fieldId, {
          ...workExperiencePayload(manualValue),
          ...audit,
          confirm_manual: true,
        });
      else if (calculation)
        await saveMunicipalServiceExperience(token, cardId, fieldId, {
          calculation,
          as_of_date: asOfDate,
          ...audit,
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
      title="Расчёт стажа муниципальной службы"
      onCancel={close}
      headerActions={
        <button
          type="button"
          className="ghost-button municipal-service-close"
          aria-label="Закрыть"
          onClick={close}
        >
          ×
        </button>
      }
    >
      <div className="municipal-service-calculator">
        {isLoading ? (
          <p role="status">Загрузка периодов…</p>
        ) : source ? (
          <form onSubmit={save}>
            <p className="municipal-service-method">
              Календарная длительность включительно; остаток: 30 дней = месяц, 12 месяцев = год.
              Служба по призыву учитывается в двойном размере. Категория сама по себе не
              подтверждает право на зачёт.
            </p>
            {!source.can_manage && <p>Доступен только просмотр.</p>}
            {manualMode ? (
              <section aria-label="Ручной ввод" className="municipal-service-manual">
                <p role="note">
                  История периодов будет заменена ручным значением. Продолжайте только после
                  проверки основания.
                </p>
                <DurationControl
                  label="Ручной стаж"
                  value={manualValue}
                  disabled={isSaving}
                  onChange={setManualValue}
                  onValidityChange={setInvalidDuration}
                />
                <label>
                  <input
                    type="checkbox"
                    checked={manualConfirmed}
                    disabled={isSaving}
                    onChange={(event) => setManualConfirmed(event.target.checked)}
                  />
                  Подтверждаю замену расчёта ручным значением
                </label>
                <button
                  type="button"
                  className="ghost-button"
                  disabled={isSaving}
                  onClick={() => {
                    setManualMode(false);
                    setInvalidDuration(false);
                  }}
                >
                  Вернуться к периодам
                </button>
              </section>
            ) : (
              <>
                <div className="municipal-service-preview-date">
                  <DateControl
                    label="Рассчитать на дату"
                    value={asOfDate}
                    onChange={setAsOfDate}
                    disabled={isSaving}
                  />
                  <p>
                    Выбранная дата меняет только предпросмотр. Значение карточки рассчитывается на
                    текущую дату сервера: {displayDate(source.server_date)}.
                  </p>
                </div>
                {calculation?.baseline && (
                  <fieldset
                    className="municipal-service-baseline"
                    disabled={!source.can_manage || isSaving}
                  >
                    <legend>Подтверждённый исходный стаж</legend>
                    <p>
                      Покрывает историю по указанную дату включительно. Периоды должны начинаться
                      позже неё.
                    </p>
                    <DurationControl
                      label="Исходный стаж"
                      value={calculation.baseline}
                      onChange={(value) => updateBaseline(workExperiencePayload(value))}
                      onValidityChange={setInvalidDuration}
                    />
                    <DateControl
                      label="Дата исходного стажа"
                      value={calculation.baseline.as_of_date}
                      onChange={(value) => updateBaseline({ as_of_date: value })}
                    />
                    <label>
                      Основание исходного стажа
                      <textarea
                        maxLength={2000}
                        value={calculation.baseline.basis}
                        onChange={(event) => updateBaseline({ basis: event.target.value })}
                      />
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={calculation.baseline.confirmed}
                        onChange={(event) => updateBaseline({ confirmed: event.target.checked })}
                      />
                      Исходный стаж подтверждён
                    </label>
                    {source.can_manage && (
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => {
                          setCalculation((previous) => previous && { ...previous, baseline: null });
                          setInvalidDuration(false);
                        }}
                      >
                        Удалить исходный стаж
                      </button>
                    )}
                  </fieldset>
                )}
                {!calculation?.periods.length && <p>Периоды ещё не добавлены</p>}
                <div className="municipal-service-periods">
                  {calculation?.periods.map((period, index) => (
                    <fieldset
                      className="municipal-service-period"
                      disabled={!source.can_manage || isSaving}
                      key={period.id}
                    >
                      <legend>Период {index + 1}</legend>
                      <label className="municipal-service-kind">
                        Категория периода {index + 1}
                        <select
                          value={period.kind}
                          onChange={(event) =>
                            updatePeriod(period.id, {
                              kind: event.target.value as MunicipalServiceKind,
                            })
                          }
                        >
                          {Object.entries(municipalServiceKinds).map(([kind, label]) => (
                            <option value={kind} key={kind}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <DateControl
                        label={`Начало периода ${index + 1}`}
                        value={period.start_date}
                        onChange={(value) => updatePeriod(period.id, { start_date: value })}
                      />
                      <DateControl
                        label={`Окончание периода ${index + 1}`}
                        value={period.end_date ?? ""}
                        optional
                        onChange={(value) => updatePeriod(period.id, { end_date: value || null })}
                      />
                      <label className="municipal-service-period-basis">
                        Основание периода {index + 1}
                        <textarea
                          maxLength={2000}
                          value={period.basis}
                          onChange={(event) =>
                            updatePeriod(period.id, { basis: event.target.value })
                          }
                        />
                      </label>
                      <div className="municipal-service-flags">
                        <label>
                          <input
                            aria-label={`Учитывать, период ${index + 1}`}
                            type="checkbox"
                            checked={period.included}
                            onChange={(event) =>
                              updatePeriod(period.id, { included: event.target.checked })
                            }
                          />
                          Учитывать
                        </label>
                        <label>
                          <input
                            aria-label={`Подтверждён, период ${index + 1}`}
                            type="checkbox"
                            checked={period.confirmed}
                            onChange={(event) =>
                              updatePeriod(period.id, { confirmed: event.target.checked })
                            }
                          />
                          Подтверждён
                        </label>
                        <label>
                          <input
                            aria-label={`Только для пенсии, период ${index + 1}`}
                            type="checkbox"
                            checked={period.pension_only}
                            onChange={(event) =>
                              updatePeriod(period.id, { pension_only: event.target.checked })
                            }
                          />
                          Только для пенсии
                        </label>
                      </div>
                      {source.can_manage && (
                        <button
                          type="button"
                          className="ghost-button"
                          aria-label={`Удалить период ${index + 1}`}
                          onClick={() =>
                            setCalculation(
                              (previous) =>
                                previous && {
                                  ...previous,
                                  periods: previous.periods.filter((item) => item.id !== period.id),
                                },
                            )
                          }
                        >
                          Удалить период
                        </button>
                      )}
                    </fieldset>
                  ))}
                </div>
                {source.can_manage && (
                  <div className="municipal-service-tools">
                    <button
                      type="button"
                      className="ghost-button"
                      disabled={isSaving || (calculation?.periods.length ?? 0) >= 200}
                      onClick={addPeriod}
                    >
                      Добавить период
                    </button>
                    {!calculation?.baseline && (
                      <button
                        type="button"
                        className="ghost-button"
                        disabled={isSaving}
                        title="Добавьте подтверждённую документами сумму стажа на конкретную дату. Периоды автоматически не создаются."
                        onClick={addBaseline}
                      >
                        Добавить подтверждённый исходный стаж
                      </button>
                    )}
                  </div>
                )}
                <section
                  className="municipal-service-result"
                  aria-label="Результат расчёта"
                  aria-live="polite"
                  aria-busy={Boolean(calculation && validDates && !matchingPreview)}
                >
                  <h4>Результат расчёта</h4>
                  {preview && (
                    <>
                      <strong>{formatStoredWorkExperience(preview.result.value)}</strong>
                      {(!matchingPreview || !validDates || invalidDuration) && (
                        <p>Предпросмотр устарел. Проверьте введённые значения.</p>
                      )}
                      {preview.result.forecast && (
                        <p className="municipal-service-warning">
                          Прогноз: будущая дата не подтверждает фактически приобретённый стаж.
                        </p>
                      )}
                      <p>
                        Учтено: {preview.result.included_count}; исключено:{" "}
                        {preview.result.excluded_count}; требуют проверки:{" "}
                        {preview.result.review_count}.
                      </p>
                      {preview.result.overlaps.map((overlap, index) => (
                        <p key={index} className="municipal-service-warning">
                          {overlap.conflict ? "Конфликт пересечения" : "Объединяемое пересечение"}:{" "}
                          {displayDate(overlap.start_date)} — {displayDate(overlap.end_date)}.
                        </p>
                      ))}
                      {preview.result.warnings.map((warning, index) => (
                        <p className="municipal-service-warning" key={index}>
                          {warning}
                        </p>
                      ))}
                    </>
                  )}
                  {!preview && (
                    <p>
                      {calculation && validDates
                        ? "Расчёт…"
                        : "Добавьте периоды или исходный стаж и заполните даты."}
                    </p>
                  )}
                  <CalculatorFeedback error={previewError} />
                </section>
              </>
            )}
            {source.can_manage && (
              <>
                <fieldset className="municipal-service-audit" disabled={isSaving}>
                  <legend>Основание изменения</legend>
                  <label>
                    Основание изменения
                    <textarea
                      value={basisText}
                      maxLength={2000}
                      required={requiresBasis}
                      onChange={(event) => setBasisText(event.target.value)}
                    />
                  </label>
                  <DateControl
                    label="Дата изменения"
                    value={occurredOn}
                    optional={!requiresBasis}
                    onChange={setOccurredOn}
                  />
                </fieldset>
                <CalculatorFeedback error={error} />
                <footer className="admin-mutation-actions">
                  {!manualMode && (
                    <button
                      type="button"
                      className="ghost-button"
                      disabled={isSaving}
                      onClick={() => {
                        setManualValue(
                          source.result?.value ??
                            source.manual_value ??
                            defaultWorkExperienceValue(),
                        );
                        setManualMode(true);
                        setManualConfirmed(false);
                        setInvalidDuration(false);
                      }}
                    >
                      Перейти к ручному вводу
                    </button>
                  )}
                  <button type="submit" className="primary-button" disabled={!canSave}>
                    {isSaving
                      ? "Сохранение…"
                      : manualMode
                        ? "Сохранить ручное значение"
                        : "Сохранить расчёт"}
                  </button>
                </footer>
              </>
            )}
          </form>
        ) : (
          <CalculatorFeedback error={error} />
        )}
      </div>
    </AdminMutationDialog>
  );
}

function DurationControl({
  label,
  value,
  disabled,
  onChange,
  onValidityChange,
}: {
  label: string;
  value: WorkExperienceValue;
  disabled?: boolean;
  onChange: (value: WorkExperienceValue) => void;
  onValidityChange: (invalid: boolean) => void;
}) {
  function validate(event: FormEvent<HTMLDivElement>) {
    const inputs = Array.from(event.currentTarget.querySelectorAll<HTMLInputElement>("input"));
    onValidityChange(inputs.some((input) => !/^\d+$/.test(input.value)));
  }
  return (
    <div onInputCapture={validate} onChangeCapture={validate}>
      <WorkExperienceEditor label={label} value={value} disabled={disabled} onChange={onChange} />
    </div>
  );
}
function DateControl({
  label,
  value,
  onChange,
  optional = false,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  optional?: boolean;
  disabled?: boolean;
}) {
  const valid = (optional && value === "") || isIsoDate(value);
  return (
    <div className="municipal-service-date">
      <label>
        {label}
        <input
          type="text"
          inputMode="numeric"
          placeholder="ДД.ММ.ГГГГ"
          maxLength={10}
          value={displayDate(value)}
          disabled={disabled}
          aria-invalid={!valid}
          onChange={(event) => {
            const raw = event.target.value;
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
        onChange={(event) => onChange(event.target.value)}
      />
      {optional && (
        <small>Пусто — {label.startsWith("Окончание") ? "период открыт" : "не указано"}</small>
      )}
    </div>
  );
}
function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
function displayDate(value: string): string {
  return isIsoDate(value) ? value.split("-").reverse().join(".") : value;
}

function CalculatorFeedback({ error }: { error: unknown }) {
  if (error instanceof ApiError && /^[А-Яа-яЁё]/.test(error.message)) {
    return (
      <p className="inline-alert" role="alert">
        {error.message}
      </p>
    );
  }
  return <MutationFeedback error={error} />;
}
