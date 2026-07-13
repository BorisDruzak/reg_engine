import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { describe, expect, test, vi } from "vitest";

import type {
  CardTemplateLayoutRead,
  FieldValueRead,
  FieldValuesBulkUpdatePayload,
  FormBlockRead,
  FormFieldRead,
} from "@/api/types";

import {
  FilledCardLayout,
  type FilledCardBlockInstanceRead,
  type FilledCardLayoutProps,
} from "./FilledCardLayout";
import { useBlockEditor } from "./useBlockEditor";

const globalStyles = readFileSync("src/styles/globals.css", "utf8");

const block: FormBlockRead = {
  id: "identity",
  registry_id: "registry-1",
  code: "identity",
  title: "Основные сведения",
  description: null,
  position: 0,
  is_repeatable: false,
  is_active: true,
  public_visible: false,
  public_editable: false,
  layout_columns: 12,
  display_config_json: null,
};

const fields: FormFieldRead[] = [
  field({ id: "first-name", code: "first_name", label: "Имя", position: 0 }),
  field({ id: "last-name", code: "last_name", label: "Фамилия", position: 1 }),
  field({ id: "status", code: "status", label: "Статус", field_type: "select", position: 2 }),
];

const layout: CardTemplateLayoutRead = {
  version: "card_template_layout_v1",
  revision: "revision-1",
  card_template_id: "template-1",
  registry_id: "registry-1",
  structure: { blocks: [block], fields },
  form_layout: {
    columns: 12,
    sections: [
      {
        id: block.id,
        block_id: block.id,
        row: 1,
        column: 1,
        row_span: 2,
        column_span: 12,
        items: [
          layoutField("first-name", 1, 1, 1, 6),
          layoutField("last-name", 1, 7, 1, 6),
          layoutField("status", 2, 1, 1, 6),
        ],
      },
    ],
  },
  print_views: [],
  export_settings: { output_filename_template: "{{ card.display_name }}.docx", formats: ["docx"] },
  sync_status: { has_errors: false, errors: [], warnings: [], mapping: {} },
};

const values: FieldValueRead[] = [
  value("first-name", "Иван"),
  value("last-name", "Иванов"),
  value("status", "approved"),
];

const blockInstances: FilledCardBlockInstanceRead[] = [
  {
    block_id: block.id,
    block_instance_id: null,
    ordinal: 0,
    fields: {
      first_name: { field_id: "first-name", code: "first_name", field_type: "text", value: "Иван" },
      last_name: { field_id: "last-name", code: "last_name", field_type: "text", value: "Иванов" },
      status: { field_id: "status", code: "status", field_type: "select", value: "approved" },
    },
  },
];

function defaultProps(overrides: Partial<FilledCardLayoutProps> = {}): FilledCardLayoutProps {
  return {
    layout,
    blocks: [block],
    fields,
    blockInstances,
    values,
    editableFieldIds: new Set(),
    referenceOptions: {
      status: [
        { id: "approved", label: "Согласовано" },
        { id: "draft", label: "Черновик" },
      ],
    },
    ...overrides,
  };
}

describe("FilledCardLayout", () => {
  test("keeps the block navigator sticky and renders the surrounding card sections in it", () => {
    render(
      <FilledCardLayout
        {...defaultProps({
          navigationBefore: [
            {
              anchorId: "card-base-block",
              label: "Базовый блок",
              state: "neutral",
              filledCount: 0,
              totalCount: 0,
              requiredMissingCount: 0,
            },
          ],
          navigationAfter: [
            {
              anchorId: "card-attachments-block",
              label: "Вложения",
              state: "neutral",
              filledCount: 0,
              totalCount: 0,
              requiredMissingCount: 0,
            },
          ],
          beforeContent: <section id="card-base-block">Базовый блок</section>,
          afterContent: <section id="card-attachments-block">Вложения карточки</section>,
        })}
      />,
    );

    const navigator = screen.getByRole("navigation", { name: "Содержание карточки" });
    expect(within(navigator).getByRole("button", { name: /Базовый блок/i })).toBeInTheDocument();
    expect(within(navigator).getByRole("button", { name: /Вложения/i })).toBeInTheDocument();
    expect(screen.getByTestId("filled-block-identity")).toHaveAttribute(
      "id",
      "card-block-primary-identity",
    );
    expect(globalStyles).toMatch(
      /\.card-block-navigator\s*{[^}]*position:\s*sticky[^}]*top:\s*16px/,
    );
  });

  test("renders editable fields as inline controls", async () => {
    const user = userEvent.setup();
    render(<EditableFilledCard saveValues={vi.fn().mockResolvedValue(undefined)} />);

    const fieldNode = screen.getByTestId("filled-field-layout-first-name");
    expect(fieldNode.querySelector(".card-layout-inline-field")).not.toBeNull();
    expect(within(fieldNode).queryByText("Текст", { exact: true })).not.toBeInTheDocument();
    expect(fieldNode.querySelector(".card-inline-field-read-value")).toHaveTextContent("Иван");

    await user.click(fieldNode);

    expect(screen.getByRole("textbox", { name: "Имя" })).toHaveValue("Иван");
  });

  test("opens only the field that was clicked and never shows a block edit action", async () => {
    const user = userEvent.setup();
    render(<EditableFilledCard saveValues={vi.fn().mockResolvedValue(undefined)} />);

    expect(screen.queryByRole("button", { name: /Изменить блок/i })).not.toBeInTheDocument();
    await user.click(screen.getByTestId("filled-field-layout-first-name"));

    expect(screen.getByLabelText("Имя")).toHaveValue("Иван");
    expect(screen.queryByLabelText("Фамилия")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Сохранить" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Отмена" })).not.toBeInTheDocument();
  });

  test("closes an unchanged field when the pointer leaves its field surface", async () => {
    const user = userEvent.setup();
    render(<EditableFilledCard saveValues={vi.fn().mockResolvedValue(undefined)} />);

    await user.click(screen.getByTestId("filled-field-layout-first-name"));
    expect(screen.getByLabelText("Имя")).toHaveValue("Иван");

    fireEvent.pointerDown(document.body);

    await waitFor(() => expect(screen.queryByLabelText("Имя")).not.toBeInTheDocument());
  });

  test("saves and closes a changed field when the pointer leaves its field surface", async () => {
    const saveValues = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<EditableFilledCard saveValues={saveValues} />);

    await user.click(screen.getByTestId("filled-field-layout-first-name"));
    fireEvent.change(screen.getByLabelText("Имя"), { target: { value: "Пётр" } });
    fireEvent.pointerDown(document.body);

    await waitFor(() =>
      expect(saveValues).toHaveBeenCalledWith({
        values: [{ field_id: "first-name", value: "Пётр", block_instance_id: null }],
      }),
    );
    expect(screen.queryByLabelText("Имя")).not.toBeInTheDocument();
  });

  test("automatically saves a text field after the short typing delay", async () => {
    const saveValues = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<EditableFilledCard saveValues={saveValues} />);

    await user.click(screen.getByTestId("filled-field-layout-first-name"));
    fireEvent.change(screen.getByLabelText("Имя"), { target: { value: "Пётр" } });

    await waitFor(
      () =>
        expect(saveValues).toHaveBeenCalledWith({
          values: [{ field_id: "first-name", value: "Пётр", block_instance_id: null }],
        }),
      { timeout: 1500 },
    );
    expect(screen.queryByLabelText("Имя")).not.toBeInTheDocument();
  });

  test("saves the current field before opening another field", async () => {
    const saveValues = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<EditableFilledCard saveValues={saveValues} />);

    await user.click(screen.getByTestId("filled-field-layout-first-name"));
    fireEvent.change(screen.getByLabelText("Имя"), { target: { value: "Пётр" } });
    await user.click(screen.getByTestId("filled-field-layout-last-name"));

    await waitFor(() =>
      expect(saveValues).toHaveBeenCalledWith({
        values: [{ field_id: "first-name", value: "Пётр", block_instance_id: null }],
      }),
    );
    expect(await screen.findByLabelText("Фамилия")).toHaveValue("Иванов");
    expect(
      screen.queryByRole("dialog", { name: "Несохранённые изменения" }),
    ).not.toBeInTheDocument();
  });

  test("immediately saves choices", async () => {
    const saveValues = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<EditableFilledCard saveValues={saveValues} />);

    await user.click(screen.getByTestId("filled-field-layout-status"));
    await user.click(screen.getByRole("combobox", { name: "Статус" }));
    await user.click(screen.getByRole("option", { name: "Черновик" }));

    await waitFor(() =>
      expect(saveValues).toHaveBeenCalledWith({
        values: [{ field_id: "status", value: "draft", block_instance_id: null }],
      }),
    );
  });
});

function EditableFilledCard({
  saveValues,
}: {
  saveValues: (payload: FieldValuesBulkUpdatePayload) => Promise<unknown>;
}) {
  const blockEditor = useBlockEditor({
    fields,
    editableFieldIds: new Set(["first-name", "last-name", "status"]),
    saveValues,
  });
  return (
    <FilledCardLayout
      {...defaultProps({
        editableFieldIds: new Set(["first-name", "last-name", "status"]),
        blockEditor,
      })}
    />
  );
}

function field(overrides: Partial<FormFieldRead> & Pick<FormFieldRead, "id" | "code" | "label">) {
  const { id, code, label, ...optionalOverrides } = overrides;
  return {
    id,
    block_id: optionalOverrides.block_id ?? block.id,
    code,
    label,
    description: null,
    field_type: "text",
    position: 0,
    required_mode: "not_required",
    options_source_type: null,
    options_source_id: null,
    options_config_json: null,
    display_config_json: null,
    is_active: true,
    is_list_display: false,
    public_visible: false,
    public_editable: false,
    ...optionalOverrides,
  } satisfies FormFieldRead;
}

function layoutField(
  fieldId: string,
  row: number,
  column: number,
  rowSpan: number,
  columnSpan: number,
) {
  return {
    id: `layout-${fieldId}`,
    kind: "field",
    field_id: fieldId,
    row,
    column,
    row_span: rowSpan,
    column_span: columnSpan,
  };
}

function value(fieldId: string, fieldValue: unknown): FieldValueRead {
  return {
    id: `value-${fieldId}`,
    card_id: "card-1",
    field_id: fieldId,
    block_instance_id: null,
    value: fieldValue,
  };
}
