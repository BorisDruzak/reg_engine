import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import type { FormFieldRead } from "@/api/types";

import { InlineFieldEditor } from "./InlineFieldEditor";

const field: FormFieldRead = {
  id: "field-name",
  block_id: "block-main",
  code: "name",
  label: "ФИО",
  description: null,
  field_type: "text",
  position: 0,
  required_mode: "not_required",
  validation_json: {
    kind: "russian_text",
    message: "Только русские буквы",
  },
  options_source_type: null,
  options_source_id: null,
  options_config_json: null,
  display_config_json: null,
  is_active: true,
  is_list_display: false,
  public_visible: true,
  public_editable: false,
};

describe("InlineFieldEditor text validation conditions", () => {
  test("adds a second independent condition and commits both conditions", async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(
      <InlineFieldEditor field={field} onCommit={onCommit} onClose={vi.fn()} onDelete={vi.fn()} />,
    );

    await user.click(screen.getByText("Проверка значения"));
    await user.click(screen.getByRole("button", { name: "Создать условие" }));

    expect(screen.getAllByLabelText("Тип проверки")).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(onCommit).toHaveBeenCalledWith(
      expect.objectContaining({
        validation_json: [
          expect.objectContaining({ kind: "russian_text" }),
          expect.objectContaining({ kind: "russian_text" }),
        ],
      }),
    );
  });
});

const serviceField: FormFieldRead = {
  ...field,
  label: "Муниципальный стаж",
  field_type: "work_experience",
  validation_json: null,
};
const startDateField: FormFieldRead = {
  ...field,
  id: "11111111-1111-4111-8111-111111111111",
  label: "Начало периода",
  field_type: "date",
};

describe("InlineFieldEditor municipal service settings", () => {
  test("requires explicit opt-in and preserves the optional date independently", async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    const { unmount } = render(
      <InlineFieldEditor
        field={{ ...serviceField, options_config_json: { custom_setting: "сохранить" } }}
        municipalServiceDateFields={[startDateField]}
        onCommit={onCommit}
        onClose={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    const calculator = screen.getByRole("checkbox", { name: "Калькулятор муниципального стажа" });
    const startDate = screen.getByLabelText("Дата поступления для расчёта стажа");
    expect(calculator).not.toBeChecked();
    expect(startDate).toHaveValue("");
    await user.selectOptions(startDate, startDateField.id);
    await user.click(calculator);
    await user.click(screen.getByRole("button", { name: "Сохранить" }));
    const saved = onCommit.mock.calls.at(-1)![0] as FormFieldRead;
    expect(saved.options_config_json).toEqual({
      custom_setting: "сохранить",
      municipal_service_calculator: true,
      municipal_service_start_date_field_id: startDateField.id,
    });

    unmount();
    render(
      <InlineFieldEditor
        field={saved}
        municipalServiceDateFields={[startDateField]}
        onCommit={onCommit}
        onClose={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("checkbox", { name: "Калькулятор муниципального стажа" }),
    ).toBeChecked();
    expect(screen.getByLabelText("Дата поступления для расчёта стажа")).toHaveValue(
      startDateField.id,
    );
    await user.click(screen.getByRole("checkbox", { name: "Калькулятор муниципального стажа" }));
    await user.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(onCommit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        options_config_json: {
          custom_setting: "сохранить",
          municipal_service_calculator: false,
          municipal_service_start_date_field_id: startDateField.id,
        },
      }),
    );
    await user.selectOptions(screen.getByLabelText("Дата поступления для расчёта стажа"), "");
    await user.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(onCommit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        options_config_json: { custom_setting: "сохранить", municipal_service_calculator: false },
      }),
    );
  });

  test("clears calculator settings when switching field type and does not infer them from labels", async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(
      <InlineFieldEditor
        field={{
          ...serviceField,
          options_config_json: {
            municipal_service_calculator: true,
            municipal_service_start_date_field_id: startDateField.id,
          },
        }}
        onCommit={onCommit}
        onClose={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    await user.selectOptions(screen.getByLabelText("Тип поля"), "number");
    expect(screen.queryByText("Калькулятор муниципального стажа")).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Тип поля"), "work_experience");
    expect(
      screen.getByRole("checkbox", { name: "Калькулятор муниципального стажа" }),
    ).not.toBeChecked();
    expect(screen.getByLabelText("Дата поступления для расчёта стажа")).toHaveValue("");
    await user.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(onCommit).toHaveBeenCalledWith(expect.objectContaining({ options_config_json: null }));
  });

  test("leaves unrelated field configuration untouched", async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(
      <InlineFieldEditor
        field={{ ...field, options_config_json: { existing: { value: true } } }}
        onCommit={onCommit}
        onClose={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.queryByText("Калькулятор муниципального стажа")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(onCommit).toHaveBeenCalledWith(
      expect.objectContaining({ options_config_json: { existing: { value: true } } }),
    );
  });
});
