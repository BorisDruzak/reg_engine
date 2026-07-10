/// <reference types="node" />

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { describe, expect, test, vi } from "vitest";

import type {
  CardBlockInstanceRead,
  CardTemplateLayoutRead,
  FieldValueRead,
  FormBlockRead,
  FormFieldRead,
} from "@/api/types";

import { FilledCardLayout, type FilledCardLayoutProps } from "./FilledCardLayout";

const globalStyles = readFileSync("src/styles/globals.css", "utf8");

const block: FormBlockRead = {
  id: "fio",
  registry_id: "registry-1",
  code: "fio",
  title: "ФИО",
  description: "Основные сведения",
  position: 0,
  is_repeatable: false,
  is_active: true,
  public_visible: true,
  public_editable: true,
  layout_columns: 12,
  display_config_json: null,
};

const restrictedBlock: FormBlockRead = {
  ...block,
  id: "service",
  code: "service",
  title: "Служебные сведения",
  position: 1,
};

const repeatableBlock: FormBlockRead = {
  ...block,
  id: "contacts",
  code: "contacts",
  title: "Контакты",
  position: 2,
  is_repeatable: true,
};

const fields: FormFieldRead[] = [
  field({ id: "first-name", code: "first_name", label: "Имя", position: 0 }),
  field({ id: "last-name", code: "last_name", label: "Фамилия", position: 1 }),
  field({
    id: "status",
    code: "status",
    label: "Статус",
    field_type: "select",
    position: 2,
  }),
  field({
    id: "confirmed",
    code: "confirmed",
    label: "Подтверждено",
    field_type: "bool",
    position: 3,
  }),
  field({
    id: "attachment",
    code: "attachment",
    label: "Документ",
    field_type: "file_ref",
    position: 4,
  }),
  field({
    id: "note",
    block_id: restrictedBlock.id,
    code: "note",
    label: "Примечание",
    position: 0,
  }),
  field({
    id: "birth-date",
    block_id: restrictedBlock.id,
    code: "birth_date",
    label: "Дата",
    field_type: "date",
    position: 1,
  }),
  field({
    id: "roles",
    block_id: restrictedBlock.id,
    code: "roles",
    label: "Роли",
    field_type: "multi_select",
    position: 2,
  }),
  field({
    id: "metadata",
    block_id: restrictedBlock.id,
    code: "metadata",
    label: "Метаданные",
    field_type: "json",
    position: 3,
  }),
  field({
    id: "related-card",
    block_id: restrictedBlock.id,
    code: "related_card",
    label: "Связанная карточка",
    field_type: "card_ref",
    position: 4,
  }),
  field({
    id: "hint",
    block_id: restrictedBlock.id,
    code: "hint",
    label: "Подсказка",
    field_type: "static_text",
    options_config_json: { static_text: "Проверьте сведения перед подтверждением" },
    position: 5,
  }),
  field({
    id: "contact-value",
    block_id: repeatableBlock.id,
    code: "contact_value",
    label: "Контакт",
    position: 0,
  }),
];

const layout: CardTemplateLayoutRead = {
  version: "card_template_layout_v1",
  revision: "revision-1",
  card_template_id: "template-1",
  registry_id: "registry-1",
  structure: { blocks: [block, restrictedBlock], fields },
  form_layout: {
    columns: 12,
    sections: [
      {
        id: block.id,
        block_id: block.id,
        row: 1,
        column: 1,
        row_span: 2,
        column_span: 6,
        items: [
          layoutField("first-name", 1, 1, 1, 6),
          layoutField("last-name", 1, 7, 1, 6),
          layoutField("status", 2, 1, 1, 3),
          layoutField("confirmed", 2, 4, 1, 3),
          layoutField("attachment", 2, 7, 1, 6),
        ],
      },
      {
        id: restrictedBlock.id,
        block_id: restrictedBlock.id,
        row: 3,
        column: 7,
        row_span: 1,
        column_span: 6,
        items: [
          layoutField("note", 1, 1, 1, 3),
          layoutField("birth-date", 1, 4, 1, 3),
          layoutField("roles", 1, 7, 1, 6),
          layoutField("metadata", 2, 1, 1, 6),
          layoutField("related-card", 2, 7, 1, 3),
          layoutField("hint", 2, 10, 1, 3),
        ],
      },
    ],
  },
  print_views: [],
  export_settings: {
    output_filename_template: "{{ card.display_name }}.docx",
    formats: ["docx", "pdf"],
  },
  sync_status: { has_errors: false, errors: [], warnings: [], mapping: {} },
};

const values: FieldValueRead[] = [
  value("last-name", "Иванов"),
  value("status", "approved"),
  value("confirmed", true),
  value("attachment", {
    attachment_id: "attachment-1",
    title: "Заявление",
    original_filename: "request.pdf",
    archived_at: null,
  }),
  value("birth-date", "2026-07-10"),
  value("roles", ["reviewer", "owner"]),
  value("metadata", { level: 2 }),
  value("related-card", "card-42"),
];

const blockInstances: CardBlockInstanceRead[] = [
  {
    block_instance_id: null,
    ordinal: 0,
    fields: Object.fromEntries(
      fields.map((item) => [
        item.code,
        { field_id: item.id, code: item.code, field_type: item.field_type, value: null },
      ]),
    ),
  },
];

function props(overrides: Partial<FilledCardLayoutProps> = {}): FilledCardLayoutProps {
  return {
    layout,
    blocks: [block, restrictedBlock],
    fields,
    blockInstances,
    values,
    editableFieldIds: new Set(["first-name", "last-name"]),
    activeBlock: null,
    onEditBlock: vi.fn(),
    referenceOptions: {
      status: [{ id: "approved", label: "Согласовано" }],
      roles: [
        { id: "reviewer", label: "Проверяющий" },
        { id: "owner", label: "Ответственный" },
      ],
      "related-card": [{ id: "card-42", label: "Карточка № 42", href: "/cards/card-42" }],
    },
    ...overrides,
  };
}

describe("FilledCardLayout", () => {
  test("renders the configured geometry, Russian empty values, and block-scoped actions", async () => {
    const user = userEvent.setup();
    const onEditBlock = vi.fn();
    render(<FilledCardLayout {...props({ onEditBlock })} />);

    expect(screen.queryByRole("button", { name: "Редактировать" })).not.toBeInTheDocument();
    const editButton = screen.getByRole("button", { name: "Изменить блок ФИО" });
    expect(editButton).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Изменить блок Служебные сведения" }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText("Не заполнено")).not.toHaveLength(0);

    expect(screen.getByTestId("filled-block-fio")).toHaveStyle({
      gridColumn: "1 / span 6",
      gridRow: "1 / span 2",
    });
    expect(screen.getByTestId("filled-field-last-name")).toHaveStyle({
      gridColumn: "7 / span 6",
      gridRow: "1 / span 1",
    });

    await user.click(editButton);
    expect(onEditBlock).toHaveBeenCalledWith(block.id, null);
  });

  test("uses existing type display behavior without inventing missing values", () => {
    render(<FilledCardLayout {...props()} />);

    expect(within(screen.getByTestId("filled-field-status")).getByText("Согласовано")).toHaveClass(
      "filled-card-choice-chip",
    );
    expect(
      within(screen.getByTestId("filled-field-confirmed")).getByText("Да"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("filled-field-attachment")).getByText("Заявление (request.pdf)"),
    ).toBeInTheDocument();
  });

  test("renders dates, multiple choices, JSON, card links, and static text readably", () => {
    render(<FilledCardLayout {...props()} />);

    expect(
      within(screen.getByTestId("filled-field-birth-date")).getByText("10.07.2026"),
    ).toHaveAttribute("datetime", "2026-07-10");
    const roleField = within(screen.getByTestId("filled-field-roles"));
    expect(roleField.getByText("Проверяющий")).toHaveClass("filled-card-choice-chip");
    expect(roleField.getByText("Ответственный")).toHaveClass("filled-card-choice-chip");
    expect(within(screen.getByTestId("filled-field-metadata")).getByText(/"level": 2/)).toHaveClass(
      "filled-card-json-value",
    );
    expect(
      within(screen.getByTestId("filled-field-related-card")).getByRole("link", {
        name: "Карточка № 42",
      }),
    ).toHaveAttribute("href", "/cards/card-42");
    expect(
      within(screen.getByTestId("filled-field-hint")).getByText(
        "Проверьте сведения перед подтверждением",
      ),
    ).toBeInTheDocument();
  });

  test("keeps malformed JSON-like values safe for the read surface", () => {
    const cyclicValue: Record<string, unknown> = { level: 2 };
    cyclicValue.self = cyclicValue;

    render(
      <FilledCardLayout
        {...props({
          values: [
            ...values.filter((item) => item.field_id !== "metadata"),
            value("metadata", cyclicValue),
          ],
        })}
      />,
    );

    expect(
      within(screen.getByTestId("filled-field-metadata")).getByText(
        "Значение JSON недоступно для отображения",
      ),
    ).toBeInTheDocument();
  });

  test("renders repeatable blocks only for their explicit instances", async () => {
    const user = userEvent.setup();
    const onEditBlock = vi.fn();
    const repeatableLayout: CardTemplateLayoutRead = {
      ...layout,
      structure: {
        blocks: [...layout.structure.blocks, repeatableBlock],
        fields,
      },
      form_layout: {
        ...layout.form_layout,
        sections: [
          ...layout.form_layout.sections,
          {
            id: repeatableBlock.id,
            block_id: repeatableBlock.id,
            row: 4,
            column: 1,
            row_span: 1,
            column_span: 12,
            items: [layoutField("contact-value", 1, 1, 1, 12)],
          },
        ],
      },
    };
    const repeatableInstances: CardBlockInstanceRead[] = [
      ...blockInstances,
      repeatableInstance("contact-instance-1", 0, "Первый контакт"),
      repeatableInstance("contact-instance-2", 1, "Второй контакт"),
    ];

    render(
      <FilledCardLayout
        {...props({
          layout: repeatableLayout,
          blocks: [block, restrictedBlock, repeatableBlock],
          blockInstances: repeatableInstances,
          editableFieldIds: new Set(["contact-value"]),
          onEditBlock,
        })}
      />,
    );

    expect(screen.queryByTestId("filled-block-contacts")).not.toBeInTheDocument();
    const firstInstance = screen.getByTestId(
      "filled-instance-contact-instance-1-block-contacts-contact-instance-1",
    );
    const secondInstance = screen.getByTestId(
      "filled-instance-contact-instance-2-block-contacts-contact-instance-2",
    );
    expect(within(firstInstance).getByText("Первый контакт")).toBeInTheDocument();
    expect(within(secondInstance).getByText("Второй контакт")).toBeInTheDocument();
    expect(screen.getAllByText("Повторяемый блок")).toHaveLength(2);

    await user.click(within(firstInstance).getByRole("button", { name: "Изменить блок Контакты" }));
    expect(onEditBlock).toHaveBeenCalledWith(repeatableBlock.id, "contact-instance-1");
  });

  test("shows an edit action only when an editable field is visible in the section", () => {
    const hiddenEditableFieldLayout: CardTemplateLayoutRead = {
      ...layout,
      form_layout: {
        ...layout.form_layout,
        sections: layout.form_layout.sections.map((section) =>
          section.block_id === block.id
            ? { ...section, items: [layoutField("status", 1, 1, 1, 12)] }
            : section,
        ),
      },
    };

    render(<FilledCardLayout {...props({ layout: hiddenEditableFieldLayout })} />);

    expect(screen.getByTestId("filled-field-status")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Изменить блок ФИО" })).not.toBeInTheDocument();
  });

  test("marks the read surface for row-major mobile reflow without horizontal scrolling", () => {
    render(<FilledCardLayout {...props()} />);

    expect(screen.getByTestId("filled-card-layout")).toHaveClass("filled-card-layout");
    expect(screen.getByTestId("card-layout-canvas")).toHaveClass("card-layout-responsive-grid");
    expect(globalStyles).toContain(".filled-card-layout .card-layout-responsive-grid");
    expect(globalStyles).toMatch(
      /\.filled-card-layout[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
    );
    expect(globalStyles).toMatch(
      /\.filled-card-primary,\s*\.filled-card-repeatable-instance\s*{[^}]*min-width:\s*0/,
    );
    expect(globalStyles).not.toMatch(
      /\.filled-card-layout \.card-layout-responsive-field-grid\s*{[^}]*repeat\(2/,
    );
    expect(globalStyles).toMatch(
      /\.card-layout-responsive-grid \.card-layout-responsive-field-grid > \.card-layout-field-node\s*{[^}]*grid-column:\s*1 \/ -1[^}]*grid-row:\s*auto/,
    );
  });
});

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
    public_visible: true,
    public_editable: true,
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
    id: fieldId,
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
    block_instance_id: null,
    field_id: fieldId,
    value: fieldValue,
  };
}

function repeatableInstance(
  blockInstanceId: string,
  ordinal: number,
  fieldValue: string,
): CardBlockInstanceRead {
  return {
    block_instance_id: blockInstanceId,
    ordinal,
    fields: {
      contact_value: {
        field_id: "contact-value",
        code: "contact_value",
        field_type: "text",
        value: fieldValue,
      },
    },
  };
}
