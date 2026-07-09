import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";

import type { CardTemplateLayoutRead, FormBlockRead, FormFieldRead } from "@/api/types";
import { FIELD_TYPES, fieldTypeLabel } from "@/app/uiText";

import { CardLayoutRenderer } from "./CardLayoutRenderer";
import { CardWebLayoutCanvas, type CardWebLayoutCanvasProps } from "./CardWebLayoutCanvas";

const block: FormBlockRead = {
  id: "block-fio",
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
  display_config_json: { collapsible: false },
};

const fields: FormFieldRead[] = [
  {
    id: "field-name",
    block_id: block.id,
    code: "name",
    label: "Имя",
    description: null,
    field_type: "text",
    position: 0,
    required_mode: "required",
    options_source_type: null,
    options_source_id: null,
    options_config_json: null,
    display_config_json: null,
    is_active: true,
    is_list_display: true,
    public_visible: true,
    public_editable: true,
  },
  {
    id: "field-active",
    block_id: block.id,
    code: "active",
    label: "Активно",
    description: null,
    field_type: "bool",
    position: 1,
    required_mode: "not_required",
    options_source_type: null,
    options_source_id: null,
    options_config_json: null,
    display_config_json: null,
    is_active: true,
    is_list_display: false,
    public_visible: true,
    public_editable: false,
  },
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
        column_span: 6,
        items: [
          {
            id: fields[0].id,
            kind: "field",
            field_id: fields[0].id,
            row: 1,
            column: 1,
            row_span: 1,
            column_span: 9,
          },
          {
            id: fields[1].id,
            kind: "field",
            field_id: fields[1].id,
            row: 2,
            column: 10,
            row_span: 2,
            column_span: 3,
          },
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

function canvasProps(overrides: Partial<CardWebLayoutCanvasProps> = {}): CardWebLayoutCanvasProps {
  return {
    layout,
    blocks: [block],
    fields,
    mode: "design",
    selection: null,
    onSelectionChange: vi.fn(),
    onCreateBlock: vi.fn(),
    onInsertBlock: vi.fn(),
    onCreateField: vi.fn(),
    onCommitBlock: vi.fn(),
    onCancelBlock: vi.fn(),
    onCommitField: vi.fn(),
    onCancelField: vi.fn(),
    ...overrides,
  };
}

describe("CardWebLayoutCanvas", () => {
  test("keeps the idle canvas contextual and exposes creation actions locally", () => {
    render(<CardWebLayoutCanvas {...canvasProps()} />);

    expect(screen.queryByText("Свойства элемента")).not.toBeInTheDocument();
    expect(screen.queryByText("Палитра типов полей")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Создать блок в этой области" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Вставить существующий блок в эту область" }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("layout-block-block-fio")).getByRole("button", {
        name: "Создать поле в блоке ФИО",
      }),
    ).toBeInTheDocument();
  });

  test("places create actions only in a quarter area that does not overlap a shifted block", () => {
    const shiftedLayout: CardTemplateLayoutRead = {
      ...layout,
      form_layout: {
        ...layout.form_layout,
        sections: [
          {
            ...layout.form_layout.sections[0],
            column: 2,
            column_span: 3,
            row_span: 1,
          },
        ],
      },
    };

    render(<CardWebLayoutCanvas {...canvasProps({ layout: shiftedLayout })} />);

    expect(screen.getByTestId("card-layout-empty-area")).toHaveStyle({
      gridColumn: "7 / span 3",
      gridRow: "1 / span 1",
    });
  });

  test("opens the block editor inside the block and commits a valid click-away", async () => {
    const user = userEvent.setup();
    const onCommitBlock = vi.fn();
    render(<CardWebLayoutCanvas {...canvasProps({ onCommitBlock })} />);

    await user.click(screen.getByRole("button", { name: "Изменить блок ФИО" }));
    const blockNode = screen.getByTestId("layout-block-block-fio");
    const titleInput = within(blockNode).getByLabelText("Название блока");
    expect(titleInput).toHaveValue("ФИО");
    expect(
      screen.queryByRole("complementary", { name: "Свойства элемента" }),
    ).not.toBeInTheDocument();

    await user.clear(titleInput);
    await user.type(titleInput, "Основные данные");
    await user.click(screen.getByTestId("card-layout-canvas"));

    expect(onCommitBlock).toHaveBeenCalledWith(
      expect.objectContaining({ id: block.id, title: "Основные данные" }),
    );
    expect(within(blockNode).queryByLabelText("Название блока")).not.toBeInTheDocument();
  });

  test("keeps an invalid block editor open and focuses its first invalid control", async () => {
    const user = userEvent.setup();
    const onCommitBlock = vi.fn();
    render(<CardWebLayoutCanvas {...canvasProps({ onCommitBlock })} />);

    await user.click(screen.getByRole("button", { name: "Изменить блок ФИО" }));
    const titleInput = screen.getByLabelText("Название блока");
    await user.clear(titleInput);
    await user.click(screen.getByTestId("card-layout-canvas"));

    expect(onCommitBlock).not.toHaveBeenCalled();
    expect(screen.getByText("Введите название блока")).toBeInTheDocument();
    expect(titleInput).toHaveFocus();
  });

  test("cancels block editing with Escape", async () => {
    const user = userEvent.setup();
    const onCancelBlock = vi.fn();
    render(<CardWebLayoutCanvas {...canvasProps({ onCancelBlock })} />);

    await user.click(screen.getByRole("button", { name: "Изменить блок ФИО" }));
    await user.type(screen.getByLabelText("Название блока"), " временно");
    await user.keyboard("{Escape}");

    expect(onCancelBlock).toHaveBeenCalledWith(block.id);
    expect(screen.queryByLabelText("Название блока")).not.toBeInTheDocument();
  });

  test("opens the field editor inside its field and lists every canonical field type", async () => {
    const user = userEvent.setup();
    render(<CardWebLayoutCanvas {...canvasProps()} />);

    await user.click(screen.getByRole("button", { name: "Изменить поле Имя" }));
    const fieldNode = screen.getByTestId("layout-field-field-name");
    expect(within(fieldNode).getByLabelText("Название поля")).toHaveValue("Имя");
    const typeSelect = within(fieldNode).getByLabelText("Тип поля");
    const options = within(typeSelect).getAllByRole("option");

    expect(options.map((option) => option.getAttribute("value"))).toEqual([...FIELD_TYPES]);
    expect(options.map((option) => option.textContent)).toEqual(
      FIELD_TYPES.map((fieldType) => fieldTypeLabel(fieldType)),
    );
  });

  test("commits a valid field on click-away and keeps invalid fields focused", async () => {
    const user = userEvent.setup();
    const onCommitField = vi.fn();
    render(<CardWebLayoutCanvas {...canvasProps({ onCommitField })} />);

    await user.click(screen.getByRole("button", { name: "Изменить поле Имя" }));
    const labelInput = screen.getByLabelText("Название поля");
    await user.clear(labelInput);
    await user.click(screen.getByTestId("card-layout-canvas"));
    expect(screen.getByText("Введите название поля")).toBeInTheDocument();
    expect(labelInput).toHaveFocus();
    expect(onCommitField).not.toHaveBeenCalled();

    await user.type(labelInput, "Полное имя");
    await user.click(screen.getByTestId("card-layout-canvas"));
    expect(onCommitField).toHaveBeenCalledWith(
      expect.objectContaining({ id: fields[0].id, label: "Полное имя" }),
    );
  });

  test("cancels field editing with Escape", async () => {
    const user = userEvent.setup();
    const onCancelField = vi.fn();
    render(<CardWebLayoutCanvas {...canvasProps({ onCancelField })} />);

    await user.click(screen.getByRole("button", { name: "Изменить поле Имя" }));
    await user.keyboard("{Escape}");

    expect(onCancelField).toHaveBeenCalledWith(fields[0].id);
    expect(screen.queryByLabelText("Название поля")).not.toBeInTheDocument();
  });

  test("maps block and field geometry exactly and hides diagnostics by default", () => {
    const { rerender } = render(<CardWebLayoutCanvas {...canvasProps()} />);

    expect(screen.getByTestId("layout-block-block-fio")).toHaveStyle({
      gridColumn: "1 / span 6",
      gridRow: "1 / span 2",
    });
    expect(screen.getByTestId("layout-field-field-name")).toHaveStyle({
      gridColumn: "1 / span 9",
      gridRow: "1 / span 1",
    });
    expect(screen.queryByTestId("layout-block-block-fio-geometry")).not.toBeInTheDocument();
    expect(screen.queryByTestId("layout-field-field-name-geometry")).not.toBeInTheDocument();

    rerender(<CardWebLayoutCanvas {...canvasProps({ showGeometryDiagnostics: true })} />);
    expect(screen.getByTestId("layout-block-block-fio-geometry")).toHaveTextContent("6 × 2");
    expect(screen.getByTestId("layout-field-field-name-geometry")).toHaveTextContent("9 × 1");
  });

  test("keeps design controls out of readonly and public editing modes", () => {
    const publicFieldRenderer = ({ field }: { field: FormFieldRead }): ReactNode => (
      <button type="button">Изменить значение {field.label}</button>
    );
    const { rerender } = render(
      <CardWebLayoutCanvas
        {...canvasProps({ mode: "readonly", renderedValues: { "field-name": "Анна" } })}
      />,
    );

    expect(screen.getByText("Анна")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Изменить блок ФИО" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Создать блок в этой области" }),
    ).not.toBeInTheDocument();

    rerender(
      <CardWebLayoutCanvas
        {...canvasProps({ mode: "public-edit", renderFieldValue: publicFieldRenderer })}
      />,
    );
    expect(screen.getByRole("button", { name: "Изменить значение Имя" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Изменить поле Имя" })).not.toBeInTheDocument();
  });
});

describe("CardLayoutRenderer", () => {
  test.each([
    ["design", "Редактор макета карточки"],
    ["preview", "Предпросмотр макета карточки"],
    ["readonly", "Макет карточки только для чтения"],
    ["block-edit", "Редактирование блока карточки"],
    ["public-edit", "Публичное редактирование карточки"],
  ] as const)("gives %s mode a Russian accessible name", (mode, accessibleName) => {
    render(<CardLayoutRenderer {...canvasProps({ mode })} />);

    expect(screen.getByRole("region", { name: accessibleName })).toBeInTheDocument();
  });
});
