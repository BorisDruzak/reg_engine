import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import type { FormFieldRead } from "@/api/types";

import { InlineFieldEditor } from "./InlineFieldEditor";

const field: FormFieldRead = {
  id: "field-name",
  block_id: "block-main",
  code: "name",
  label: "ФИО",
  description: null,
  field_type: "text",
  position: 0,
  required_mode: "not_required",
  validation_json: {
    kind: "russian_text",
    message: "Только русские буквы",
  },
  options_source_type: null,
  options_source_id: null,
  options_config_json: null,
  display_config_json: null,
  is_active: true,
  is_list_display: false,
  public_visible: true,
  public_editable: false,
};

describe("InlineFieldEditor text validation conditions", () => {
  test("adds a second independent condition and commits both conditions", async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(
      <InlineFieldEditor field={field} onCommit={onCommit} onClose={vi.fn()} onDelete={vi.fn()} />,
    );

    await user.click(screen.getByText("Проверка значения"));
    await user.click(screen.getByRole("button", { name: "Создать условие" }));

    expect(screen.getAllByLabelText("Тип проверки")).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(onCommit).toHaveBeenCalledWith(
      expect.objectContaining({
        validation_json: [
          expect.objectContaining({ kind: "russian_text" }),
          expect.objectContaining({ kind: "russian_text" }),
        ],
      }),
    );
  });
});
