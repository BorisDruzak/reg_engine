import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { FieldEditorControl } from "./FieldEditorControl";

describe("WorkExperienceEditor", () => {
  test("submits a form after entering a valid duration", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<WorkExperienceFormHost onSubmit={onSubmit} />);

    const input = screen.getByRole("textbox", { name: "Стаж работы" });
    await user.clear(input);
    await user.type(input, "16 3 12");
    await user.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  test("keeps an incomplete draft visible in a controlled editor", async () => {
    const user = userEvent.setup();
    render(<ControlledWorkExperienceHost />);

    const input = screen.getByRole("textbox", { name: "Стаж работы" });
    await user.clear(input);

    expect(input).toHaveValue("");
    expect(screen.getAllByRole("textbox", { name: "Стаж работы" })).toHaveLength(1);
  });

  test("keeps a complete numeric draft focused until blur", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <FieldEditorControl
        fieldType="work_experience"
        label="Стаж работы"
        hint="Укажите длительность"
        options={[]}
        value={{ days: 0, months: 0, years: 0 } as never}
        onChange={onChange}
      />,
    );

    const input = screen.getByRole("textbox", { name: "Стаж работы" });
    await user.clear(input);
    await user.type(input, "16 3 12");

    expect(screen.getAllByRole("textbox", { name: "Стаж работы" })).toHaveLength(1);
    expect(input).toHaveValue("16 3 12");
    expect(onChange).toHaveBeenLastCalledWith({ days: 16, months: 3, years: 12 });
    expect(onChange).not.toHaveBeenLastCalledWith(
      expect.objectContaining({ display: expect.anything() }),
    );

    await user.tab();

    expect(input).toHaveValue("16 дней 3 месяца 12 лет");
  });

  test("does not emit an incomplete duration", async () => {
    const user = userEvent.setup();
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

    const input = screen.getByRole("textbox", { name: "Стаж работы" });
    await user.clear(input);
    await user.type(input, "16 3");

    expect(input).toHaveValue("16 3");
    expect(onChange).not.toHaveBeenCalled();
  });

  test("rejects words in a duration input", async () => {
    const user = userEvent.setup();
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

    const input = screen.getByRole("textbox", { name: "Стаж работы" });
    await user.clear(input);
    await user.type(input, "16 days 3 9");

    expect(input).toHaveValue("1 день 2 месяца 3 года");
    expect(onChange).not.toHaveBeenCalled();
  });

  test("exposes one disabled textbox", () => {
    const onChange = vi.fn();
    render(
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

    const inputs = screen.getAllByRole("textbox", { name: "Стаж работы" });
    expect(inputs).toHaveLength(1);
    expect(inputs[0]).toBeDisabled();
    expect(screen.getByText("Укажите длительность", { selector: "small" })).toHaveClass(
      "field-editor-hint",
    );
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

    await user.click(screen.getByRole("textbox", { name: "Стаж работы" }));
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

      const input = screen.getByRole("textbox", { name: "Стаж работы" });
      fireEvent.change(input, { target: { value: `${unsafeValue} 2 3` } });

      expect(input).toHaveValue(`${unsafeValue} 2 3`);
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

function WorkExperienceFormHost({ onSubmit }: { onSubmit: () => void }) {
  const [value, setValue] = useState({ days: 1, months: 2, years: 3 });
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <FieldEditorControl
        fieldType="work_experience"
        label="Стаж работы"
        options={[]}
        value={value}
        onChange={(nextValue) => setValue(nextValue as typeof value)}
      />
      <button type="submit">Сохранить</button>
    </form>
  );
}
