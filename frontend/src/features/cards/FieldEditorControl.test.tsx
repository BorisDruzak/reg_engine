import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { FieldEditorControl } from "./FieldEditorControl";

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
  test("uses the hint as a text placeholder", () => {
    renderControl("text");
    expect(screen.getByLabelText("Поле text")).toHaveAttribute("placeholder", "Заполните значение");
  });

  test("uses the hint as the empty select prompt", () => {
    renderControl("select", "Выберите вариант");
    expect(screen.getByRole("option", { name: "Выберите вариант" })).toHaveValue("");
  });

  test.each(["multi_select", "date", "bool"])(
    "shows a compact fallback hint for %s",
    (fieldType) => {
      renderControl(fieldType);
      expect(screen.getByText("Заполните значение")).toHaveClass("field-editor-hint");
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

    const search = screen.getByRole("searchbox", { name: "Поиск подразделения" });
    const management = screen.getByRole("button", { name: "Управление образования" });
    expect(management).toBeEnabled();
    const department = screen.getByRole("button", {
      name: "Управление образования → Отдел кадров",
    });
    expect(department).toBeEnabled();
    expect(department).toHaveAttribute("data-hierarchy-level", "2");
    expect(
      screen.getByRole("button", {
        name: "Управление образования → Архивный отдел / Архивировано",
      }),
    ).toBeDisabled();

    await user.tab();
    expect(search).toHaveFocus();
    await user.tab();
    await user.tab();
    expect(management).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenLastCalledWith("management");

    await user.click(search);
    await user.type(search, "кадров");
    expect(
      screen.queryByRole("button", { name: "Управление образования" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Управление образования → Отдел кадров" }));
    expect(onChange).toHaveBeenLastCalledWith("department");
  });
});
