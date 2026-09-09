import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import {
  ApiError,
  archiveCardExportTemplate,
  createCardExportTemplate,
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

function configurationFingerprint(configuration: CardExportTemplatePayload["configuration_json"]) {
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(configuration).sort(([left], [right]) => left.localeCompare(right)),
    ),
  );
}

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
  const queryKey = ["card-export-templates", token, registryId, "with-archive"];
  const templatesQuery = useQuery({
    queryKey,
    queryFn: () => listCardExportTemplates(token, registryId, true),
    enabled: Boolean(token && registryId),
  });
  const allTemplates = templatesQuery.data?.items ?? [];
  const templates = allTemplates.filter((item) => !item.archived_at);
  const [selected, setSelected] = useState<CardExportTemplateRead | null>(null);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<CardExportKind>("card_list");
  const [cardTemplateId, setCardTemplateId] = useState("");
  const [fieldIds, setFieldIds] = useState<string[]>([]);
  const [mapping, setMapping] = useState<PersonnelExportMapping>(emptyMapping);
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
    configurationFingerprint(selected.configuration_json) !==
      configurationFingerprint(configuration);
  const personnel = kind === "personnel_changes";

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
        ? {
            position_field_id: template.configuration_json.position_field_id,
            structural_unit_field_id: template.configuration_json.structural_unit_field_id,
            appointment_date_field_id: template.configuration_json.appointment_date_field_id,
            appointment_basis_field_id: template.configuration_json.appointment_basis_field_id,
          }
        : emptyMapping,
    );
    clearFeedback();
  }
  function cacheTemplate(template: CardExportTemplateRead) {
    client.setQueryData<{ items: CardExportTemplateRead[] }>(queryKey, (old) => ({
      items: [...(old?.items ?? []).filter((item) => item.id !== template.id), template],
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
            allTemplates.map((item) => item.code),
            100,
          ),
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
    onError: async (failure) => {
      setMessage(null);
      if (!selected && failure instanceof ApiError && failure.status === 409) {
        const refreshed = await templatesQuery.refetch();
        setError(
          refreshed.isError
            ? "Не удалось создать шаблон из-за конфликта. Обновите список шаблонов и повторите сохранение."
            : "Не удалось создать шаблон из-за конфликта. Список шаблонов обновлён. Повторите сохранение.",
        );
        return;
      }
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
  const pending = save.isPending || archive.isPending;

  function moveField(index: number, direction: number) {
    const next = fieldIds.filter((id) => id !== fioId);
    [next[index], next[index + direction]] = [next[index + direction], next[index]];
    setFieldIds(next);
    clearFeedback();
  }

  return (
    <section className="xlsx-operation" aria-label="Шаблоны выгрузки">
      <h4>Шаблоны выгрузки</h4>
      <p className="muted-text">Настройте состав и порядок колонок или отчёт об изменениях.</p>
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
