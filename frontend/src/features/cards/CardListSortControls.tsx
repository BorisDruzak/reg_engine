import type { FormBlockRead, FormFieldRead } from "@/api/types";

export function CardListSortControls({
  fields,
  blocks,
  field,
  direction,
  onChange,
}: {
  fields: FormFieldRead[];
  blocks: FormBlockRead[];
  field: string;
  direction: "asc" | "desc";
  onChange: (field: string, direction: "asc" | "desc") => void;
}) {
  const activeBlocks = new Map(
    blocks.filter((block) => block.is_active).map((block) => [block.id, block]),
  );
  const dateFields = fields.filter(
    (item) =>
      item.is_active &&
      activeBlocks.has(item.block_id) &&
      ["date", "datetime"].includes(item.field_type),
  );
  return (
    <>
      <label className="card-lifecycle-filter">
        <span>Сортировка</span>
        <select value={field} onChange={(event) => onChange(event.currentTarget.value, direction)}>
          <option value="">Без сортировки</option>
          <option value="display_value">ФИО</option>
          {field && field !== "display_value" && !dateFields.some((item) => item.id === field) && (
            <option value={field}>Поле даты недоступно</option>
          )}
          {dateFields.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label} — {activeBlocks.get(item.block_id)?.title}
            </option>
          ))}
        </select>
      </label>
      <label className="card-lifecycle-filter">
        <span>Направление сортировки</span>
        <select
          value={direction}
          disabled={!field}
          onChange={(event) => onChange(field, event.currentTarget.value as "asc" | "desc")}
        >
          <option value="asc">{field === "display_value" ? "А → Я" : "Сначала ранние"}</option>
          <option value="desc">{field === "display_value" ? "Я → А" : "Сначала поздние"}</option>
        </select>
      </label>
    </>
  );
}
