import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import {
  archiveCardExportTemplate,
  createCardExportTemplate,
  downloadCardExportTemplate,
  listCardExportTemplates,
  updateCardExportTemplate,
} from "@/api/client";
import type {
  CardExportKind,
  CardExportTemplatePayload,
  CardExportTemplateRead,
  PersonnelExportMapping,
  TabularCardExchangeOptionsRead,
} from "@/api/types";
import { generateTechnicalCode } from "@/app/technicalCode";
import { errorText } from "@/components/common/dataUtils";

const mappings = [
  ["position_field_id", "Поле должности"],
  ["structural_unit_field_id", "Поле подразделения"],
  ["appointment_date_field_id", "Поле даты назначения"],
  ["appointment_basis_field_id", "Поле основания назначения"],
] as const;
const emptyMapping: PersonnelExportMapping = {
  position_field_id: "",
  structural_unit_field_id: "",
  appointment_date_field_id: "",
  appointment_basis_field_id: "",
};

export function ExportTemplatesPanel({
  token,
  registryId,
  options,
}: {
  token: string;
  registryId: string;
  options: TabularCardExchangeOptionsRead;
}) {
  const client = useQueryClient();
  const queryKey = ["card-export-templates", token, registryId];
  const templatesQuery = useQuery({
    queryKey,
    queryFn: () => listCardExportTemplates(token, registryId),
    enabled: Boolean(token && registryId),
  });
  const templates = templatesQuery.data?.items.filter((item) => !item.archived_at) ?? [];
  const [selected, setSelected] = useState<CardExportTemplateRead | null>(null);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<CardExportKind>("card_list");
  const [cardTemplateId, setCardTemplateId] = useState("");
  const [fieldIds, setFieldIds] = useState<string[]>([]);
  const [mapping, setMapping] = useState<PersonnelExportMapping>(emptyMapping);
  const [organizationId, setOrganizationId] = useState("");
  const [periodFrom, setPeriodFrom] = useState("");
  const [periodTo, setPeriodTo] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const cardTemplate = options.templates.find((item) => item.id === cardTemplateId);
  const fields = cardTemplate?.fields.filter((field) => field.supported) ?? [];
  const fioId = cardTemplate?.fio_field_id;
  const selectableFields = fields.filter((field) => field.id !== fioId);
  const orderedIds = fioId ? [fioId, ...fieldIds.filter((id) => id !== fioId)] : fieldIds;
  const configuration = kind === "card_list" ? { field_ids: orderedIds } : mapping;
  const validMapping =
    mappings.every(([key]) =>
      selectableFields.some(
        (field) =>
          field.id === mapping[key] &&
          (key !== "appointment_date_field_id" || field.field_type === "date"),
      ),
    ) && new Set(Object.values(mapping)).size === mappings.length;
  const valid = Boolean(
    name.trim() &&
    cardTemplate &&
    fioId &&
    fields.some((field) => field.id === fioId) &&
    (kind === "card_list"
      ? orderedIds.every((id) => fields.some((field) => field.id === id))
      : validMapping),
  );
  const dirty =
    !selected ||
    selected.name !== name.trim() ||
    selected.card_template_id !== cardTemplateId ||
    selected.export_kind !== kind ||
    JSON.stringify(selected.configuration_json) !== JSON.stringify(configuration);
  const personnel = kind === "personnel_changes";
  const validPeriod = !personnel || Boolean(periodFrom && periodTo && periodFrom <= periodTo);

  function clearFeedback() {
    setError(null);
    setMessage(null);
    setConfirmArchive(false);
  }
  function chooseTemplate(template: CardExportTemplateRead | null) {
    setSelected(template);
    setName(template?.name ?? "");
    setKind(template?.export_kind ?? "card_list");
    setCardTemplateId(template?.card_template_id ?? "");
    setFieldIds(
      template && "field_ids" in template.configuration_json
        ? template.configuration_json.field_ids
        : [],
    );
    setMapping(
      template && "position_field_id" in template.configuration_json
        ? template.configuration_json
        : emptyMapping,
    );
    setOrganizationId("");
    setPeriodFrom("");
    setPeriodTo("");
    clearFeedback();
  }
  function cacheTemplate(template: CardExportTemplateRead) {
    client.setQueryData<{ items: CardExportTemplateRead[] }>(queryKey, (old) => ({
      items: [...(old?.items ?? []).filter((item) => item.id !== template.id), template].filter(
        (item) => !item.archived_at,
      ),
    }));
    void client.invalidateQueries({ queryKey: ["audit-events", token] });
  }
  const save = useMutation({
    mutationFn: () => {
      const payload: CardExportTemplatePayload = {
        code:
          selected?.code ??
          generateTechnicalCode(
            name,
            "export",
            templates.map((item) => item.code),
          ).slice(0, 100),
        name: name.trim(),
        export_kind: kind,
        card_template_id: cardTemplateId,
        configuration_json: configuration,
      };
      return selected
        ? updateCardExportTemplate(token, selected.id, payload)
        : createCardExportTemplate(token, registryId, payload);
    },
    onSuccess: (template) => {
      cacheTemplate(template);
      chooseTemplate(template);
      setMessage("Шаблон выгрузки сохранён");
    },
    onError: (failure) => {
      setMessage(null);
      setError(errorText(failure));
    },
  });
  const archive = useMutation({
    mutationFn: () => archiveCardExportTemplate(token, selected!.id),
    onSuccess: (template) => {
      cacheTemplate(template);
      chooseTemplate(null);
      setMessage("Шаблон выгрузки архивирован");
    },
    onError: (failure) => {
      setMessage(null);
      setError(errorText(failure));
    },
  });
  const download = useMutation({
    mutationFn: () =>
      downloadCardExportTemplate(token, selected!.id, {
        organization_id: organizationId,
        ...(personnel ? { period_from: periodFrom, period_to: periodTo } : {}),
      }),
    onSuccess: ({ blob, filename }) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      try {
        link.href = url;
        link.download = filename;
        document.body.append(link);
        link.click();
      } finally {
        link.remove();
        URL.revokeObjectURL(url);
      }
      setError(null);
      setMessage("XLSX-файл скачан");
    },
    onError: (failure) => {
      setMessage(null);
      setError(errorText(failure));
    },
  });
  const pending = save.isPending || archive.isPending || download.isPending;

  function moveField(index: number, direction: number) {
    const next = fieldIds.filter((id) => id !== fioId);
    [next[index], next[index + direction]] = [next[index + direction], next[index]];
    setFieldIds(next);
    clearFeedback();
  }

  return (
    <section className="xlsx-operation" aria-label="Шаблоны выгрузки">
      <h4>Шаблоны выгрузки</h4>
      <p className="muted-text">
        Сохраните состав и порядок колонок или настройте отчёт об изменениях. Организация выбирается
        перед скачиванием.
      </p>
      {templatesQuery.isLoading && <p>Загрузка шаблонов…</p>}
      {templatesQuery.error && (
        <div>
          <p role="alert" className="inline-alert">
            {errorText(templatesQuery.error)}
          </p>
          <button
            type="button"
            className="ghost-button"
            onClick={() => void templatesQuery.refetch()}
          >
            Повторить загрузку шаблонов
          </button>
        </div>
      )}
      {!templatesQuery.isLoading && !templatesQuery.error && !templates.length && (
        <p className="empty-state">Шаблоны выгрузки пока не созданы</p>
      )}
      <fieldset
        disabled={pending || templatesQuery.isLoading || Boolean(templatesQuery.error)}
        className="export-template-controls"
      >
        <label className="field-editor-control">
          <span>Сохранённый шаблон выгрузки</span>
          <select
            value={selected?.id ?? ""}
            onChange={(event) =>
              chooseTemplate(templates.find((item) => item.id === event.target.value) ?? null)
            }
          >
            <option value="">Новый шаблон выгрузки</option>
            {templates.map((item) => (
              <option value={item.id} key={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <div className="template-form">
          <label className="field-editor-control">
            <span>Название шаблона выгрузки</span>
            <input
              maxLength={255}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                clearFeedback();
              }}
            />
          </label>
          <label className="field-editor-control">
            <span>Вид выгрузки</span>
            <select
              value={kind}
              onChange={(event) => {
                setKind(event.target.value as CardExportKind);
                clearFeedback();
              }}
            >
              <option value="card_list">Список карточек</option>
              <option value="personnel_changes">Кадровые изменения</option>
            </select>
          </label>
          <label className="field-editor-control">
            <span>Шаблон карточки для выгрузки</span>
            <select
              value={cardTemplateId}
              onChange={(event) => {
                setCardTemplateId(event.target.value);
                setFieldIds([]);
                setMapping(emptyMapping);
                clearFeedback();
              }}
            >
              <option value="">Выберите шаблон карточки</option>
              {options.templates.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {cardTemplate && (
          <>
            <label className="field-editor-control">
              <span>ФИО (обязательное поле отображения)</span>
              <input
                disabled
                value={fields.find((field) => field.id === fioId)?.label ?? "Поле ФИО недоступно"}
              />
            </label>
            {!fioId && (
              <p className="inline-alert">
                Шаблон должен содержать одно активное текстовое поле ФИО (fio).
              </p>
            )}
            {personnel ? (
              <div className="template-form">
                {mappings.map(([key, label]) => (
                  <label key={key} className="field-editor-control">
                    <span>{label}</span>
                    <select
                      value={mapping[key]}
                      onChange={(event) => {
                        setMapping({ ...mapping, [key]: event.target.value });
                        clearFeedback();
                      }}
                    >
                      <option value="">Выберите поле</option>
                      {selectableFields
                        .filter(
                          (field) =>
                            key !== "appointment_date_field_id" || field.field_type === "date",
                        )
                        .map((field) => (
                          <option key={field.id} value={field.id}>
                            {field.block_title}: {field.label}
                          </option>
                        ))}
                    </select>
                  </label>
                ))}
              </div>
            ) : (
              <>
                <ol className="export-template-columns" aria-label="Порядок колонок">
                  <li>ФИО — обязательная первая колонка</li>
                  {fieldIds
                    .filter((id) => id !== fioId)
                    .map((id, index, selectedFields) => {
                      const label =
                        fields.find((field) => field.id === id)?.label ?? "Недоступное поле";
                      return (
                        <li key={id}>
                          <span>{label}</span>
                          <div className="row-actions">
                            <button
                              type="button"
                              className="ghost-button"
                              aria-label={`Поднять ${label}`}
                              disabled={index === 0}
                              onClick={() => moveField(index, -1)}
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              className="ghost-button"
                              aria-label={`Опустить ${label}`}
                              disabled={index === selectedFields.length - 1}
                              onClick={() => moveField(index, 1)}
                            >
                              ↓
                            </button>
                            <button
                              type="button"
                              className="ghost-button"
                              aria-label={`Убрать ${label}`}
                              onClick={() => {
                                setFieldIds(fieldIds.filter((item) => item !== id));
                                clearFeedback();
                              }}
                            >
                              Убрать
                            </button>
                          </div>
                        </li>
                      );
                    })}
                </ol>
                <label className="field-editor-control">
                  <span>Добавить колонку</span>
                  <select
                    value=""
                    onChange={(event) => {
                      if (event.target.value) setFieldIds([...fieldIds, event.target.value]);
                      clearFeedback();
                    }}
                  >
                    <option value="">Выберите поле</option>
                    {selectableFields
                      .filter((field) => !fieldIds.includes(field.id))
                      .map((field) => (
                        <option key={field.id} value={field.id}>
                          {field.block_title}: {field.label}
                        </option>
                      ))}
                  </select>
                </label>
              </>
            )}
            {personnel && !validMapping && (
              <p className="muted-text">
                Выберите четыре разных поля; дата назначения должна иметь тип «Дата».
              </p>
            )}
          </>
        )}
        <div className="row-actions">
          <button
            type="button"
            className="primary-button"
            disabled={!valid || !dirty}
            onClick={() => {
              clearFeedback();
              save.mutate();
            }}
          >
            Сохранить шаблон выгрузки
          </button>
          {selected && (
            <button
              type="button"
              className="ghost-button"
              onClick={() => {
                clearFeedback();
                setConfirmArchive(true);
              }}
            >
              Архивировать шаблон
            </button>
          )}
        </div>
        {confirmArchive && (
          <div role="group" aria-label="Архивирование шаблона">
            <p>Архивировать шаблон «{selected?.name}»? Он исчезнет из списка доступных выгрузок.</p>
            <div className="row-actions">
              <button
                type="button"
                className="ghost-button"
                onClick={() => setConfirmArchive(false)}
              >
                Отмена
              </button>
              <button type="button" className="primary-button" onClick={() => archive.mutate()}>
                Подтвердить архивирование
              </button>
            </div>
          </div>
        )}
        <div className="template-form">
          <label className="field-editor-control">
            <span>Организация для выгрузки</span>
            <select
              value={organizationId}
              onChange={(event) => {
                setOrganizationId(event.target.value);
                clearFeedback();
              }}
            >
              <option value="">Выберите организацию</option>
              {options.organizations.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          {personnel && (
            <>
              <label className="field-editor-control">
                <span>Начало периода</span>
                <input
                  type="date"
                  value={periodFrom}
                  onChange={(event) => {
                    setPeriodFrom(event.target.value);
                    clearFeedback();
                  }}
                />
              </label>
              <label className="field-editor-control">
                <span>Конец периода</span>
                <input
                  type="date"
                  value={periodTo}
                  onChange={(event) => {
                    setPeriodTo(event.target.value);
                    clearFeedback();
                  }}
                />
              </label>
            </>
          )}
        </div>
        {personnel && (
          <p className="muted-text">
            Обе даты включаются в период. Отчёт содержит назначения, изменения и увольнения.
          </p>
        )}
        {personnel && periodFrom && periodTo && !validPeriod && (
          <p className="inline-alert">Конец периода не может быть раньше начала.</p>
        )}
        {dirty && selected && (
          <p className="muted-text">Сохраните изменения шаблона перед скачиванием.</p>
        )}
        <button
          type="button"
          className="primary-button"
          disabled={
            !selected ||
            dirty ||
            !valid ||
            !options.organizations.some((item) => item.id === organizationId) ||
            !validPeriod
          }
          onClick={() => {
            clearFeedback();
            download.mutate();
          }}
        >
          Скачать XLSX
        </button>
      </fieldset>
      {pending && <p role="status">Выполняется…</p>}
      {message && (
        <p role="status" className="inline-success attachment-status">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="inline-alert attachment-status">
          {error}
        </p>
      )}
    </section>
  );
}
