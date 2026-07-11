import { render, screen } from "@testing-library/react";
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
});
