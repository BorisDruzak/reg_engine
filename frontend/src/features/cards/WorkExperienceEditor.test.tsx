import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { FieldEditorControl } from "./FieldEditorControl";

describe("WorkExperienceEditor", () => {
  test("renders three numeric segments with visible unit words", () => {
    renderEditor({ days: 1, months: 2, years: 5 });

    const { days, months, years } = segmentedInputs();
    expect(days).toHaveValue("1");
    expect(months).toHaveValue("2");
    expect(years).toHaveValue("5");
    expect(screen.getByText("день")).toBeVisible();
    expect(screen.getByText("месяца")).toBeVisible();
    expect(screen.getByText("лет")).toBeVisible();
  });

  test("updates a unit word immediately from the current segment", async () => {
    const user = userEvent.setup();
    renderEditor({ days: 1, months: 2, years: 5 });

    const { days } = segmentedInputs();
    await user.clear(days);
    await user.type(days, "5");

    expect(screen.getByText("дней")).toBeVisible();
  });

  test("moves through duration segments with Space and keeps the year segment focused", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderEditor({ days: 0, months: 0, years: 0 }, onChange);

    const { days, months, years } = segmentedInputs();
    await user.clear(days);
    await user.type(days, "16");
    await user.keyboard(" ");
    expect(months).toHaveFocus();
    await user.clear(months);
    await user.type(months, "3");
    await user.keyboard(" ");
    expect(years).toHaveFocus();
    await user.clear(years);
    await user.type(years, "9");
    await user.keyboard(" ");

    expect(years).toHaveFocus();
    expect(onChange).toHaveBeenLastCalledWith({ days: 16, months: 3, years: 9 });
  });

  test("submits a form after entering a valid duration", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<WorkExperienceFormHost onSubmit={onSubmit} />);

    const { days, months, years } = segmentedInputs();
    await replaceDuration(user, days, months, years, ["16", "3", "12"]);
    await user.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  test("keeps an incomplete segment visible without emitting a payload", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderEditor({ days: 1, months: 2, years: 3 }, onChange);

    const { days } = segmentedInputs();
    await user.clear(days);

    expect(days).toHaveValue("");
    expect(onChange).not.toHaveBeenCalled();
  });

  test("does not emit an unsafe numeric segment", () => {
    const onChange = vi.fn();
    renderEditor({ days: 1, months: 2, years: 3 }, onChange);

    const { days } = segmentedInputs();
    fireEvent.change(days, { target: { value: "9007199254740992" } });

    expect(days).toHaveValue("9007199254740992");
    expect(onChange).not.toHaveBeenCalled();
  });

  test("rejects words inside a numeric segment", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderEditor({ days: 1, months: 2, years: 3 }, onChange);

    const { days } = segmentedInputs();
    await user.type(days, "дней");

    expect(days).toHaveValue("1");
    expect(onChange).not.toHaveBeenCalled();
  });

  test("disables all three segments and keeps the hint", () => {
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

    const { days, months, years } = segmentedInputs();
    await user.click(days);
    await user.tab();
    expect(months).toHaveFocus();
    expect(onBlur).not.toHaveBeenCalled();
    await user.tab();
    expect(years).toHaveFocus();
    expect(onBlur).not.toHaveBeenCalled();
    await user.tab();

    expect(screen.getByRole("button", { name: "После стажа" })).toHaveFocus();
    expect(onBlur).toHaveBeenCalledTimes(1);
  });
});

function segmentedInputs(label = "Стаж работы") {
  return {
    days: screen.getByRole("textbox", { name: label + ", дни" }),
    months: screen.getByRole("textbox", { name: label + ", месяцы" }),
    years: screen.getByRole("textbox", { name: label + ", годы" }),
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

async function replaceDuration(
  user: ReturnType<typeof userEvent.setup>,
  days: HTMLElement,
  months: HTMLElement,
  years: HTMLElement,
  values: [string, string, string],
) {
  await user.clear(days);
  await user.type(days, values[0]);
  await user.clear(months);
  await user.type(months, values[1]);
  await user.clear(years);
  await user.type(years, values[2]);
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
