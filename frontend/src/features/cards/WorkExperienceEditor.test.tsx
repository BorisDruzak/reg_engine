import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { FieldEditorControl } from "./FieldEditorControl";

describe("WorkExperienceEditor", () => {
  test("renders one editable control with protected unit words", () => {
    renderEditor({ days: 16, months: 3, years: 9 });

    const control = experienceControl();
    expect(screen.getAllByRole("textbox", { name: "Стаж работы" })).toHaveLength(1);
    expect(control).toHaveAttribute("contenteditable", "true");
    expect(control).toHaveTextContent("16 дней 3 месяца 9 лет");
    expect(control.querySelectorAll("[data-work-experience-part]")).toHaveLength(3);
    expect(control.querySelectorAll("[contenteditable='false']")).toHaveLength(3);
  });

  test("updates a unit word immediately from the corresponding numeric fragment", () => {
    renderEditor({ days: 1, months: 2, years: 5 });

    setPartValue("days", "5");

    expect(experienceControl()).toHaveTextContent("5 дней 2 месяца 5 лет");
  });

  test("moves the selection with Space and keeps it in the years fragment", () => {
    const onChange = vi.fn();
    renderEditor({ days: 0, months: 0, years: 0 }, onChange);

    const control = experienceControl();
    setPartSelection("days");
    fireEvent.keyDown(control, { key: " " });
    expect(selectedPart()).toBe("months");

    setPartValue("months", "3");
    setPartSelection("months");
    fireEvent.keyDown(control, { key: " " });
    expect(selectedPart()).toBe("years");

    setPartValue("years", "9");
    setPartSelection("years");
    fireEvent.keyDown(control, { key: " " });
    expect(selectedPart()).toBe("years");
    expect(onChange).toHaveBeenLastCalledWith({ days: 0, months: 3, years: 9 });
  });

  test("submits a form after entering a valid duration", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<WorkExperienceFormHost onSubmit={onSubmit} />);

    setPartValue("days", "16");
    setPartValue("months", "3");
    setPartValue("years", "12");
    await user.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  test("keeps an incomplete numeric fragment visible without emitting a payload", () => {
    const onChange = vi.fn();
    renderEditor({ days: 1, months: 2, years: 3 }, onChange);

    setPartValue("days", "");

    expect(part("days")).toHaveTextContent("");
    expect(onChange).not.toHaveBeenCalled();
  });

  test("does not emit an unsafe numeric fragment", () => {
    const onChange = vi.fn();
    renderEditor({ days: 1, months: 2, years: 3 }, onChange);

    setPartValue("days", "9007199254740992");

    expect(part("days")).toHaveTextContent("9007199254740992");
    expect(onChange).not.toHaveBeenCalled();
  });

  test("restores the fixed unit words after a contenteditable mutation", () => {
    const onChange = vi.fn();
    renderEditor({ days: 1, months: 2, years: 3 }, onChange);

    const control = experienceControl();
    control.querySelector("[contenteditable='false']")!.textContent = "изменено";
    fireEvent.input(control);

    expect(control).toHaveTextContent("1 день 2 месяца 3 года");
    expect(onChange).toHaveBeenLastCalledWith({ days: 1, months: 2, years: 3 });
  });

  test("disables the single control and keeps the hint", () => {
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

    expect(experienceControl()).toHaveAttribute("contenteditable", "false");
    expect(experienceControl()).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText("Укажите длительность", { selector: "small" })).toHaveClass(
      "field-editor-hint",
    );
  });

  test("calls blur once when focus exits the single control", async () => {
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

    await user.click(experienceControl());
    await user.tab();

    expect(screen.getByRole("button", { name: "После стажа" })).toHaveFocus();
    expect(onBlur).toHaveBeenCalledTimes(1);
  });
});

function experienceControl() {
  return screen.getByRole("textbox", { name: "Стаж работы" });
}

function part(name: "days" | "months" | "years") {
  const node = experienceControl().querySelector<HTMLElement>(
    `[data-work-experience-part="${name}"]`,
  );
  if (!node) {
    throw new Error(`Missing ${name} fragment`);
  }
  return node;
}

function setPartValue(name: "days" | "months" | "years", value: string) {
  part(name).textContent = value;
  fireEvent.input(experienceControl());
}

function setPartSelection(name: "days" | "months" | "years") {
  const range = document.createRange();
  range.selectNodeContents(part(name));
  range.collapse(false);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function selectedPart() {
  const node = window.getSelection()?.anchorNode;
  const element = node instanceof Element ? node : node?.parentElement;
  return element?.closest<HTMLElement>("[data-work-experience-part]")?.dataset.workExperiencePart;
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
