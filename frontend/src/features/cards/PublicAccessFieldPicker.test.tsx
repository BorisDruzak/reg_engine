import "@testing-library/jest-dom/vitest";

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import type { FormFieldRead } from "@/api/types";

import { PublicAccessFieldPicker } from "./PublicAccessFieldPicker";

const fields: FormFieldRead[] = [
  field({ id: "text", label: "Текстовое поле", field_type: "text" }),
  field({ id: "file", label: "Вложение", field_type: "file_ref" }),
  field({ id: "static", label: "Пояснение", field_type: "static_text" }),
  field({ id: "archived", label: "Архивное поле", field_type: "text", is_active: false }),
];

describe("PublicAccessFieldPicker", () => {
  test("selects active fields for visibility and ordinary fields for editing by default", async () => {
    const user = userEvent.setup();
    render(<PublicAccessFieldPicker fields={fields} publicAccess={null} onChange={vi.fn()} />);

    const visible = screen.getByRole("group", { name: "Показывать поля" });
    const editable = screen.getByRole("group", { name: "Разрешить изменение" });

    expect(within(visible).getByText("Текстовое поле")).toBeInTheDocument();
    expect(within(visible).getByText("Вложение")).toBeInTheDocument();
    expect(within(visible).getByText("Пояснение")).toBeInTheDocument();
    expect(within(editable).getByText("Текстовое поле")).toBeInTheDocument();
    expect(within(editable).queryByText("Вложение")).not.toBeInTheDocument();
    expect(within(editable).queryByText("Пояснение")).not.toBeInTheDocument();

    await user.click(within(editable).getByRole("button", { name: "Разрешить изменение" }));
    expect(screen.getByLabelText("Текстовое поле")).toBeChecked();
    expect(screen.queryByLabelText("Вложение")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Пояснение")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Архивное поле")).not.toBeInTheDocument();
  });

  test("removes edit permission when a visible field is hidden", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<PublicAccessFieldPicker fields={fields} publicAccess={null} onChange={onChange} />);

    const visible = screen.getByRole("group", { name: "Показывать поля" });
    await user.click(within(visible).getByRole("button", { name: "Показывать поля" }));
    await user.click(screen.getByLabelText("Текстовое поле"));

    expect(onChange).toHaveBeenLastCalledWith({
      fields: expect.arrayContaining([
        { field_id: "text", public_visible: false, public_editable: false },
      ]),
    });
  });
});

function field(
  overrides: Partial<FormFieldRead> & Pick<FormFieldRead, "id" | "label" | "field_type">,
): FormFieldRead {
  const { id, label, field_type, ...rest } = overrides;
  return {
    id,
    block_id: "block-1",
    code: id,
    label,
    description: null,
    field_type,
    position: 0,
    required_mode: "not_required",
    options_source_type: null,
    options_source_id: null,
    options_config_json: null,
    is_active: true,
    is_list_display: false,
    public_visible: true,
    public_editable: true,
    ...rest,
  };
}
