import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { FieldEditorControl } from "./FieldEditorControl";

describe("WorkExperienceEditor", () => {
  test("keeps an empty in-progress part after a controlled parent rerender", async () => {
    const user = userEvent.setup();
    render(<ControlledWorkExperienceHost />);

    const days = screen.getByLabelText("Дни");
    await user.clear(days);

    expect(days).toHaveValue("");
    expect(screen.getByText("0 дней 2 месяца 3 года")).toBeInTheDocument();
  });

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

  test("rejects invalid input and preserves disabled, hint, and one-field accessibility", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(
      <FieldEditorControl
        fieldType="work_experience"
        label="Стаж работы"
        hint="Укажите длительность"
        options={[]}
        value={{ days: 1, months: 2, years: 3 } as never}
        onChange={onChange}
      />,
    );

    const days = screen.getByLabelText("Дни");
    await user.type(days, "-abc");

    expect(days).toHaveValue("1");
    expect(onChange).not.toHaveBeenCalled();
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
        onChange={onChange}
      />,
    );

    expect(screen.getByLabelText("Дни")).toBeDisabled();
    expect(screen.getByLabelText("Месяцы")).toBeDisabled();
    expect(screen.getByLabelText("Годы")).toBeDisabled();
  });

  test("calls blur only when focus exits the field group", async () => {
    const user = userEvent.setup();
    const onBlur = vi.fn();
    render(
      <>
        <FieldEditorControl
          fieldType="work_experience"
          label="Стаж работы"
          options={[]}
          value={{ days: 1, months: 2, years: 3 } as never}
          onBlur={onBlur}
          onChange={vi.fn()}
        />
        <button type="button">После стажа</button>
      </>,
    );

    await user.click(screen.getByLabelText("Дни"));
    await user.tab();
    await user.tab();

    expect(onBlur).not.toHaveBeenCalled();

    await user.tab();

    expect(screen.getByRole("button", { name: "После стажа" })).toHaveFocus();
    expect(onBlur).toHaveBeenCalledTimes(1);
  });

  test.each(["9007199254740992", "999999999999999999999999999999999999999999999999999"])(
    "rejects unsafe numeric input %s before it emits a payload",
    (unsafeValue) => {
      const onChange = vi.fn();
      render(
        <FieldEditorControl
          fieldType="work_experience"
          label="Стаж работы"
          options={[]}
          value={{ days: 1, months: 2, years: 3 } as never}
          onChange={onChange}
        />,
      );

      const days = screen.getByLabelText("Дни");
      fireEvent.change(days, { target: { value: unsafeValue } });

      expect(days).toHaveValue("1");
      expect(onChange).not.toHaveBeenCalled();
    },
  );
});

function ControlledWorkExperienceHost() {
  const [value, setValue] = useState({ days: 1, months: 2, years: 3 });
  return (
    <FieldEditorControl
      fieldType="work_experience"
      label="Стаж работы"
      options={[]}
      value={value}
      onChange={(nextValue) => setValue(nextValue as typeof value)}
    />
  );
}
