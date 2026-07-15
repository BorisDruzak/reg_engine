import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { FieldEditorControl } from "./FieldEditorControl";

describe("WorkExperienceEditor", () => {
  test("renders three date-mask segments inside one visual control", () => {
    renderEditor({ days: 16, months: 3, years: 9 });

    const control = experienceControl();
    const { days, months, years } = segmentedInputs();
    expect(control).toHaveClass("work-experience-editor");
    expect(within(control).getAllByRole("textbox")).toHaveLength(3);
    expect(days).toHaveValue("16");
    expect(months).toHaveValue("3");
    expect(years).toHaveValue("9");
    expect(control).toHaveTextContent("дней");
    expect(control).toHaveTextContent("месяца");
    expect(control).toHaveTextContent("лет");
  });

  test("starts editing days when the shared field is activated", async () => {
    const user = userEvent.setup();
    renderEditor({ days: 16, months: 3, years: 9 });

    await user.click(experienceControl());

    expect(segmentedInputs().days).toHaveFocus();
  });

  test("moves through 2/2/4 segments while entering a duration", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderEditor({ days: 0, months: 0, years: 0 }, onChange);

    const { days, months, years } = segmentedInputs();
    await user.click(days);
    await user.type(days, "16");
    expect(days).toHaveValue("16");
    expect(months).toHaveFocus();

    await user.type(months, "03");
    expect(months).toHaveValue("03");
    expect(years).toHaveFocus();

    await user.type(years, "2026");
    expect(years).toHaveValue("2026");
    expect(years).toHaveFocus();
    expect(onChange).toHaveBeenLastCalledWith({ days: 16, months: 3, years: 2026 });
  });

  test("keeps only digits and caps the input at 2/2/4 characters", () => {
    renderEditor({ days: 0, months: 0, years: 0 });

    const { days, months, years } = segmentedInputs();
    fireEvent.change(days, { target: { value: "1a -2" } });
    fireEvent.change(months, { target: { value: "0+3x" } });
    fireEvent.change(years, { target: { value: "20a2 67" } });

    expect(days).toHaveValue("12");
    expect(months).toHaveValue("03");
    expect(years).toHaveValue("2026");
  });

  test("moves with Space and returns to the prior segment with Backspace", async () => {
    const user = userEvent.setup();
    renderEditor({ days: 0, months: 0, years: 0 });

    const { days, months, years } = segmentedInputs();
    await user.click(days);
    await user.keyboard(" ");
    expect(months).toHaveFocus();

    await user.clear(months);
    await user.keyboard("{Backspace}");
    expect(days).toHaveFocus();

    await user.keyboard(" ");
    expect(months).toHaveFocus();
    await user.keyboard(" ");
    expect(years).toHaveFocus();
    await user.keyboard(" ");
    expect(years).toHaveFocus();
  });

  test("preserves entered values when focus leaves the field", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <>
        <FieldEditorControl
          fieldType="work_experience"
          label="Стаж работы"
          options={[]}
          value={{ days: 0, months: 0, years: 0 } as never}
          onChange={onChange}
        />
        <button type="button">После стажа</button>
      </>,
    );

    const { days, months, years } = segmentedInputs();
    await user.click(days);
    await user.type(days, "16");
    await user.type(months, "03");
    await user.type(years, "2026");
    await user.click(screen.getByRole("button", { name: "После стажа" }));

    expect(days).toHaveValue("16");
    expect(months).toHaveValue("03");
    expect(years).toHaveValue("2026");
    expect(onChange).toHaveBeenLastCalledWith({ days: 16, months: 3, years: 2026 });
  });

  test("updates a unit word from the current numeric segment", () => {
    renderEditor({ days: 1, months: 2, years: 5 });

    fireEvent.change(segmentedInputs().days, { target: { value: "5" } });

    expect(experienceControl()).toHaveTextContent("дней");
    expect(experienceControl()).toHaveTextContent("месяца");
    expect(experienceControl()).toHaveTextContent("лет");
  });

  test("keeps an incomplete segment visible without emitting a payload", () => {
    const onChange = vi.fn();
    renderEditor({ days: 1, months: 2, years: 3 }, onChange);

    fireEvent.change(segmentedInputs().days, { target: { value: "" } });

    expect(segmentedInputs().days).toHaveValue("");
    expect(onChange).not.toHaveBeenCalled();
  });

  test("disables the three mask segments and keeps the hint", () => {
    render(
      <FieldEditorControl
        fieldType="work_experience"
        label="Стаж работы"
        hint="Укажите длительность"
        options={[]}
        value={{ days: 1, months: 2, years: 3 } as never}
        disabled
        onChange={vi.fn()}
      />,
    );

    const { days, months, years } = segmentedInputs();
    expect(days).toBeDisabled();
    expect(months).toBeDisabled();
    expect(years).toBeDisabled();
    expect(screen.getByText("Укажите длительность", { selector: "small" })).toHaveClass(
      "field-editor-hint",
    );
  });

  test("calls blur once when focus exits the mask", async () => {
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

    await user.click(segmentedInputs().days);
    await user.tab();
    expect(segmentedInputs().months).toHaveFocus();
    expect(onBlur).not.toHaveBeenCalled();
    await user.tab();
    expect(segmentedInputs().years).toHaveFocus();
    expect(onBlur).not.toHaveBeenCalled();
    await user.tab();

    expect(screen.getByRole("button", { name: "После стажа" })).toHaveFocus();
    expect(onBlur).toHaveBeenCalledTimes(1);
  });
});

function experienceControl() {
  return screen.getByRole("group", { name: "Стаж работы" });
}

function segmentedInputs(label = "Стаж работы") {
  return {
    days: screen.getByRole("textbox", { name: `${label}, дни` }),
    months: screen.getByRole("textbox", { name: `${label}, месяцы` }),
    years: screen.getByRole("textbox", { name: `${label}, годы` }),
  };
}

function renderEditor(value: { days: number; months: number; years: number }, onChange = vi.fn()) {
  return render(
    <FieldEditorControl
      fieldType="work_experience"
      label="Стаж работы"
      options={[]}
      value={value as never}
      onChange={onChange}
    />,
  );
}
