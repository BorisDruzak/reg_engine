import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { describe, expect, test, vi } from "vitest";

import { FieldEditorControl } from "./FieldEditorControl";
import { validateTextDraft } from "./textValidation";

const globalStyles = readFileSync("src/styles/globals.css", "utf8");

const options = [
  { id: "one", label: "Первый" },
  { id: "two", label: "Второй" },
];

function renderControl(fieldType: string, hint: string | null = "Заполните значение") {
  return render(
    <FieldEditorControl
      fieldType={fieldType}
      label={`Поле ${fieldType}`}
      hint={hint}
      options={options}
      value={fieldType === "multi_select" ? [] : fieldType === "bool" ? false : ""}
      onChange={vi.fn()}
    />,
  );
}

describe("FieldEditorControl hints", () => {
  test("retains an invalid text draft, announces it transiently, and resumes changes after recovery", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <FieldEditorControl
        fieldType="text"
        label="ФИО"
        options={[]}
        value="Иванов"
        validation={{
          kind: "russian_text",
          message: "Введите ФИО русскими буквами",
        }}
        onChange={onChange}
      />,
    );

    const input = screen.getByRole("textbox", { name: "ФИО" });
    await user.type(input, " 2");

    expect(onChange).not.toHaveBeenCalledWith("Иванов 2");
    expect(screen.getByRole("alert")).toHaveTextContent("Введите ФИО русскими буквами");
    expect(input).toHaveValue("Иванов 2");
    expect(input).toHaveFocus();

    await user.clear(input);
    await user.type(input, "Иванов");
    expect(onChange).toHaveBeenLastCalledWith("Иванов");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  test("dismisses a text validation alert after four seconds and restarts its timer for a new error", () => {
    vi.useFakeTimers();
    try {
      render(
        <FieldEditorControl
          fieldType="text"
          label="ФИО"
          options={[]}
          value=""
          validation={{ kind: "russian_text", message: "Введите ФИО русскими буквами" }}
          onChange={vi.fn()}
        />,
      );

      const input = screen.getByRole("textbox", { name: "ФИО" });
      fireEvent.change(input, { target: { value: "Ivan" } });
      act(() => vi.advanceTimersByTime(3_000));
      fireEvent.change(input, { target: { value: "Ivan 2" } });
      act(() => vi.advanceTimersByTime(1_500));
      expect(screen.getByRole("alert")).toBeInTheDocument();

      act(() => vi.advanceTimersByTime(2_500));
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  test("mirrors blank, BMP, and malformed legacy validation rules without sending unsafe text", () => {
    const rule = { kind: "regex", pattern: "[А-Я]{2}", message: "Введите две буквы" } as const;

    expect(validateTextDraft(" \u00a0", rule)).toEqual({ valid: true });
    expect(validateTextDraft("АБ", rule)).toEqual({ valid: true });
    expect(validateTextDraft("😀", rule)).toEqual({
      valid: false,
      conditions: [{ ...rule, input_mode: "show_error" }],
      messages: [rule.message],
    });
    expect(
      validateTextDraft("АБ", {
        kind: "regex",
        pattern: "[",
        message: "Некорректное значение",
      }),
    ).toEqual({
      valid: false,
      conditions: [
        {
          kind: "regex",
          pattern: "[",
          message: "Некорректное значение",
          input_mode: "show_error",
        },
      ],
      messages: ["Некорректное значение"],
    });
  });

  test("blocks an invalid typed value when one failed condition prohibits input", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <FieldEditorControl
        fieldType="text"
        label="ФИО"
        options={[]}
        value="Ста"
        validation={[
          { kind: "russian_text", message: "Только русские буквы", input_mode: "show_error" },
          {
            kind: "regex",
            pattern: "[^0-9]{1,256}",
            message: "Цифры запрещены",
            input_mode: "block_input",
          },
        ]}
        onChange={onChange}
      />,
    );

    const input = screen.getByRole("textbox", { name: "ФИО" });
    await user.type(input, "1");

    expect(input).toHaveValue("Ста");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Только русские буквы");
    expect(screen.getByRole("alert")).toHaveTextContent("Цифры запрещены");
    expect(onChange).not.toHaveBeenCalled();
  });

  test("accepts a non-digit draft with an anchored negated digit condition", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <FieldEditorControl
        fieldType="text"
        label="ФИО"
        options={[]}
        value=""
        validation={{
          kind: "regex",
          pattern: "^[^0-9]+$",
          message: "Не допускаются цифры",
          input_mode: "block_input",
        }}
        onChange={onChange}
      />,
    );

    await user.type(screen.getByRole("textbox", { name: "ФИО" }), "Ста");

    expect(onChange).toHaveBeenLastCalledWith("Ста");
  });

  test("renders one visual work-experience mask used by card creation and saved edits", () => {
    render(
      <FieldEditorControl
        fieldType="work_experience"
        label="Стаж работы"
        options={[]}
        value={{ days: 16, months: 3, years: 9, display: "16 дней 3 месяца 9 лет" }}
        onChange={vi.fn()}
      />,
    );

    const control = screen.getByRole("group", { name: "Стаж работы" });
    expect(within(control).getAllByRole("textbox")).toHaveLength(3);
    expect(within(control).getByRole("textbox", { name: "Стаж работы, дни" })).toHaveValue("16");
    expect(within(control).getByRole("textbox", { name: "Стаж работы, месяцы" })).toHaveValue("3");
    expect(within(control).getByRole("textbox", { name: "Стаж работы, годы" })).toHaveValue("9");
    expect(control).toHaveTextContent("дней");
    expect(control).toHaveTextContent("месяца");
    expect(control).toHaveTextContent("лет");
  });

  test("uses the hint as a text placeholder", () => {
    renderControl("text");
    expect(screen.getByLabelText("Поле text")).toHaveAttribute("placeholder", "Заполните значение");
  });

  test("renders ordinary text in a one-row auto-sizing textarea", () => {
    renderControl("text");

    const control = screen.getByLabelText("Поле text");
    expect(control.tagName).toBe("TEXTAREA");
    expect(control).toHaveAttribute("rows", "1");
    expect(control).toHaveClass("field-editor-autosize-text");
  });

  test("uses the hint as the empty select prompt", () => {
    renderControl("select", "Выберите вариант");
    expect(screen.getByRole("combobox", { name: "Поле select" })).toHaveTextContent(
      "Выберите вариант",
    );
  });

  test.each(["select", "multi_select", "organization_ref", "org_unit_ref"] as const)(
    "opens %s choices immediately without saving an empty value",
    (fieldType) => {
      const onChange = vi.fn();
      render(
        <FieldEditorControl
          fieldType={fieldType}
          label={`Поле ${fieldType}`}
          hint="Выберите значение"
          options={options}
          value={fieldType === "multi_select" ? [] : ""}
          autoOpenChoice
          onChange={onChange}
        />,
      );

      expect(screen.getByRole("searchbox", { name: "Поиск варианта" })).toHaveFocus();
      expect(screen.getByTestId("searchable-choice-options")).toBeVisible();
      expect(onChange).not.toHaveBeenCalled();
    },
  );

  test("marks an open choice picker for overlay positioning", async () => {
    const user = userEvent.setup();
    renderControl("select", "Выберите вариант");

    const picker = screen.getByRole("group", { name: "Поле select" });
    expect(picker).not.toHaveClass("is-open");

    await user.click(within(picker).getByRole("combobox", { name: "Поле select" }));

    expect(picker).toHaveClass("is-open");
    expect(globalStyles).toContain(".searchable-choice-picker.is-open");
    expect(globalStyles).toContain(".searchable-choice-picker.is-open {\n  z-index: 40;");
    expect(globalStyles).toContain("position: absolute;");
    expect(globalStyles).toContain(
      ".filled-card-layout .card-layout-field-node:has(.searchable-choice-picker.is-open)",
    );
    expect(globalStyles).toContain(
      ".filled-card-layout .card-layout-field-node:has(.searchable-choice-picker.is-open) {\n  z-index: 40;",
    );
    expect(globalStyles).toContain(
      ".filled-card-layout .card-web-layout-canvas:has(.searchable-choice-picker.is-open)",
    );
    expect(globalStyles).toContain(
      ".card-base-block:has(.searchable-choice-picker.is-open) {\n  position: relative;\n  z-index: 40;\n  overflow: visible;",
    );
  });

  test("filters server-supplied single choices and never exposes a free-text value", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <FieldEditorControl
        fieldType="select"
        label="Статус"
        hint="Выберите статус"
        options={options}
        value=""
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole("combobox", { name: "Статус" }));
    await user.type(screen.getByRole("searchbox", { name: "Поиск варианта" }), "Второй");

    expect(screen.getByRole("option", { name: "Второй" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Первый" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Статус" })).not.toBeInTheDocument();

    await user.clear(screen.getByRole("searchbox", { name: "Поиск варианта" }));
    await user.type(screen.getByRole("searchbox", { name: "Поиск варианта" }), "Нет такого");
    expect(screen.getByText("Ничего не найдено")).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  test("selects one controlled choice and closes the popup", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <FieldEditorControl
        fieldType="select"
        label="Статус"
        options={options}
        value=""
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole("combobox", { name: "Статус" }));
    await user.click(screen.getByRole("option", { name: "Второй" }));

    expect(onChange).toHaveBeenCalledWith("two");
    expect(screen.queryByRole("listbox", { name: "Статус" })).not.toBeInTheDocument();
  });

  test("closes the choice popup when Escape is pressed in its search field", async () => {
    const user = userEvent.setup();
    render(
      <FieldEditorControl
        fieldType="select"
        label="Статус"
        options={options}
        value=""
        onChange={vi.fn()}
      />,
    );

    const trigger = screen.getByRole("combobox", { name: "Статус" });
    await user.click(trigger);
    expect(screen.getByRole("searchbox", { name: "Поиск варианта" })).toHaveFocus();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("searchbox", { name: "Поиск варианта" })).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  test("toggles multiple controlled choices by keyboard and renders selected chips", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <FieldEditorControl
        fieldType="multi_select"
        label="Категории"
        options={options}
        value={[]}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Категории" }));
    expect(screen.getByTestId("searchable-choice-options")).toHaveAttribute("role", "group");
    await user.tab();
    expect(screen.getByRole("checkbox", { name: "Первый" })).toHaveFocus();
    await user.keyboard(" ");

    expect(onChange).toHaveBeenCalledWith(["one"]);
    expect(screen.getByTestId("searchable-choice-options")).toBeInTheDocument();
  });

  test.each(["multi_select", "date", "bool"])(
    "shows a compact fallback hint for %s",
    (fieldType) => {
      renderControl(fieldType);
      expect(screen.getByText("Заполните значение", { selector: "small" })).toHaveClass(
        "field-editor-hint",
      );
    },
  );

  test("does not render an empty hint", () => {
    renderControl("bool", "");
    expect(screen.queryByText("Заполните значение")).not.toBeInTheDocument();
    expect(document.querySelector(".field-editor-hint")).not.toBeInTheDocument();
  });

  test("searches the existing organization unit hierarchy and selects either level", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <FieldEditorControl
        fieldType="org_unit_ref"
        label="Подразделение организации"
        options={[
          { id: "management", label: "Управление образования" },
          { id: "department", label: "Управление образования → Отдел кадров" },
          { id: "archived", label: "Управление образования → Архивный отдел", archived: true },
        ]}
        value=""
        onChange={onChange}
      />,
    );

    const picker = screen.getByRole("group", { name: "Подразделение организации" });
    await user.click(within(picker).getByRole("combobox", { name: "Подразделение организации" }));
    const search = screen.getByRole("searchbox", { name: "Поиск варианта" });
    const management = screen.getByRole("option", { name: "Управление образования" });
    expect(management).toBeEnabled();
    const department = screen.getByRole("option", {
      name: "Управление образования → Отдел кадров",
    });
    expect(department).toBeEnabled();
    expect(department).toHaveAttribute("data-hierarchy-level", "2");
    expect(
      screen.getByRole("option", {
        name: "Управление образования → Архивный отдел / Архивировано",
      }),
    ).toBeDisabled();

    expect(search).toHaveFocus();
    await user.tab();
    await user.tab();
    expect(management).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenLastCalledWith("management");

    await user.click(within(picker).getByRole("combobox", { name: "Подразделение организации" }));
    const reopenedSearch = screen.getByRole("searchbox", { name: "Поиск варианта" });
    await user.type(reopenedSearch, "кадров");
    expect(
      screen.queryByRole("option", { name: "Управление образования" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: "Управление образования → Отдел кадров" }));
    expect(onChange).toHaveBeenLastCalledWith("department");
  });

  test("selects an organization from supplied choices without a free-text input", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <FieldEditorControl
        fieldType="organization_ref"
        label="Организация"
        options={[{ id: "organization-1", label: "Администрация" }]}
        value=""
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole("combobox", { name: "Организация" }));
    expect(screen.queryByRole("textbox", { name: "Организация" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: "Администрация" }));
    expect(onChange).toHaveBeenCalledWith("organization-1");
  });
});
