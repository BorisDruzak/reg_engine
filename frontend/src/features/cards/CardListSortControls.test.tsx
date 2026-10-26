import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { expect, test } from "vitest";
import type { FormBlockRead, FormFieldRead } from "@/api/types";
import { CardListSortControls } from "./CardListSortControls";

test("chooses FIO or active date fields and switches direction", () => {
  const blocks = [
    { id: "base", title: "Основное", is_active: true },
    { id: "retired", title: "Старое", is_active: false },
  ] as FormBlockRead[];
  const fields = [
    { id: "date", block_id: "base", label: "Дата события", field_type: "date", is_active: true },
    {
      id: "time",
      block_id: "base",
      label: "Время события",
      field_type: "datetime",
      is_active: true,
    },
    { id: "text", block_id: "base", label: "Описание", field_type: "text", is_active: true },
    { id: "old", block_id: "base", label: "Старая дата", field_type: "date", is_active: false },
    {
      id: "old-block",
      block_id: "retired",
      label: "Старый блок",
      field_type: "date",
      is_active: true,
    },
  ] as FormFieldRead[];
  function Harness() {
    const [sort, setSort] = useState({ field: "", direction: "asc" as "asc" | "desc" });
    return (
      <CardListSortControls
        fields={fields}
        blocks={blocks}
        field={sort.field}
        direction={sort.direction}
        onChange={(field, direction) => setSort({ field, direction })}
      />
    );
  }
  render(<Harness />);
  const field = screen.getByRole("combobox", { name: "Сортировка" });
  const direction = screen.getByRole("combobox", { name: "Направление сортировки" });
  expect(direction).toBeDisabled();
  expect(within(field).getAllByRole("option")).toHaveLength(4);
  fireEvent.change(field, { target: { value: "display_value" } });
  expect(direction).toBeEnabled();
  expect(screen.getByRole("option", { name: "А → Я" })).toBeVisible();
  fireEvent.change(direction, { target: { value: "desc" } });
  expect(direction).toHaveValue("desc");
  fireEvent.change(field, { target: { value: "date" } });
  expect(screen.getByRole("option", { name: "Сначала поздние" })).toBeVisible();
  expect(field).toHaveValue("date");
});
