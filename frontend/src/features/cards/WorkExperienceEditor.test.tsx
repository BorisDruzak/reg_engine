import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { FieldEditorControl } from "./FieldEditorControl";

describe("WorkExperienceEditor", () => {
  test("updates the Russian summary immediately and emits only numeric duration fields", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <FieldEditorControl
        fieldType="work_experience"
        label="Стаж работы"
        hint="Укажите длительность"
        options={[]}
        value={{ days: 0, months: 3, years: 9 } as never}
        onChange={onChange}
      />,
    );

    const days = screen.getByLabelText("Дни");
    await user.clear(days);
    expect(days).toHaveValue("");
    expect(screen.getByText("0 дней 3 месяца 9 лет")).toBeInTheDocument();
    await user.type(days, "16");

    expect(days).toHaveValue("16");
    expect(screen.getByText("16 дней 3 месяца 9 лет")).toBeInTheDocument();
    expect(onChange).toHaveBeenLastCalledWith({ days: 16, months: 3, years: 9 });
    expect(onChange).not.toHaveBeenLastCalledWith(
      expect.objectContaining({ display: expect.anything() }),
    );
  });

  test("rejects invalid input and preserves disabled, hint, and blur behavior as one field", async () => {
    const user = userEvent.setup();
    const onBlur = vi.fn();
    const onChange = vi.fn();
    const { rerender } = render(
      <FieldEditorControl
        fieldType="work_experience"
        label="Стаж работы"
        hint="Укажите длительность"
        options={[]}
        value={{ days: 1, months: 2, years: 3 } as never}
        onBlur={onBlur}
        onChange={onChange}
      />,
    );

    const days = screen.getByLabelText("Дни");
    await user.type(days, "-abc");
    await user.tab();

    expect(days).toHaveValue("1");
    expect(onChange).not.toHaveBeenCalled();
    expect(onBlur).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Укажите длительность", { selector: "small" })).toHaveClass(
      "field-editor-hint",
    );
    expect(screen.getByRole("group", { name: "Стаж работы" })).toBeInTheDocument();

    rerender(
      <FieldEditorControl
        fieldType="work_experience"
        label="Стаж работы"
        hint="Укажите длительность"
        options={[]}
        value={{ days: 1, months: 2, years: 3 } as never}
        disabled
        onBlur={onBlur}
        onChange={onChange}
      />,
    );

    expect(screen.getByLabelText("Дни")).toBeDisabled();
    expect(screen.getByLabelText("Месяцы")).toBeDisabled();
    expect(screen.getByLabelText("Годы")).toBeDisabled();
  });
});
