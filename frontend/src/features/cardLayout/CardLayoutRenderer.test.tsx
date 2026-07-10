/// <reference types="node" />

import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import type { ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";

import type { CardTemplateLayoutRead, FormBlockRead, FormFieldRead } from "@/api/types";
import { FIELD_TYPES, fieldTypeLabel } from "@/app/uiText";

import { CardLayoutRenderer } from "./CardLayoutRenderer";
import { CardWebLayoutCanvas, type CardWebLayoutCanvasProps } from "./CardWebLayoutCanvas";

const globalStyles = readFileSync("src/styles/globals.css", "utf8");

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

const secondaryBlock: FormBlockRead = {
  ...block,
  id: "block-work",
  code: "work",
  title: "Работа",
  position: 1,
};

const secondaryField: FormFieldRead = {
  ...fields[0],
  id: "field-position",
  block_id: secondaryBlock.id,
  code: "position",
  label: "Должность",
};

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

const twoBlockLayout: CardTemplateLayoutRead = {
  ...layout,
  structure: {
    blocks: [block, secondaryBlock],
    fields: [...fields, secondaryField],
  },
  form_layout: {
    ...layout.form_layout,
    sections: [
      layout.form_layout.sections[0],
      {
        id: secondaryBlock.id,
        block_id: secondaryBlock.id,
        row: 3,
        column: 7,
        row_span: 2,
        column_span: 6,
        items: [
          {
            id: secondaryField.id,
            kind: "field",
            field_id: secondaryField.id,
            row: 2,
            column: 4,
            row_span: 2,
            column_span: 6,
          },
        ],
      },
    ],
  },
};

function canvasProps(overrides: Partial<CardWebLayoutCanvasProps> = {}): CardWebLayoutCanvasProps {
  return {
    layout,
    blocks: [block],
    fields,
    mode: "design",
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

function mockGridRect(element: HTMLElement, width = 1200, height = 400) {
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
    bottom: height,
    height,
    left: 0,
    right: width,
    top: 0,
    width,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
}

function installPointerCapture(element: HTMLElement) {
  const setPointerCapture = vi.fn();
  const releasePointerCapture = vi.fn();
  Object.defineProperties(element, {
    setPointerCapture: { configurable: true, value: setPointerCapture },
    releasePointerCapture: { configurable: true, value: releasePointerCapture },
  });
  return { releasePointerCapture, setPointerCapture };
}

function dispatchPointer(
  element: HTMLElement,
  type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel" | "lostpointercapture",
  { pointerId, clientX, clientY }: { pointerId: number; clientX: number; clientY: number },
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    clientX: { value: clientX },
    clientY: { value: clientY },
    pointerId: { value: pointerId },
  });
  fireEvent(element, event);
}

function blockMoveHandle() {
  const handle = screen
    .getByTestId("layout-block-block-fio")
    .querySelector<HTMLButtonElement>(
      ":scope > .card-layout-geometry-affordances > .card-layout-move-handle",
    );
  expect(handle).not.toBeNull();
  return handle!;
}

describe("CardWebLayoutCanvas", () => {
  test("renders responsive grids in row-major DOM order with a single-column CSS contract", () => {
    const unsortedLayout: CardTemplateLayoutRead = {
      ...layout,
      structure: {
        blocks: [block, secondaryBlock],
        fields: [...fields, secondaryField],
      },
      form_layout: {
        ...layout.form_layout,
        sections: [
          {
            id: secondaryBlock.id,
            block_id: secondaryBlock.id,
            row: 2,
            column: 1,
            row_span: 1,
            column_span: 12,
            items: [
              {
                id: secondaryField.id,
                kind: "field",
                field_id: secondaryField.id,
                row: 1,
                column: 1,
                row_span: 1,
                column_span: 12,
              },
            ],
          },
          {
            ...layout.form_layout.sections[0],
            items: [...layout.form_layout.sections[0].items].reverse(),
          },
        ],
      },
    };

    render(<CardWebLayoutCanvas layout={unsortedLayout} mode="preview" />);

    expect(screen.getByTestId("card-layout-canvas")).toHaveClass("card-layout-responsive-grid");
    expect(screen.getAllByTestId(/^layout-block-/).map((node) => node.dataset.testid)).toEqual([
      "layout-block-block-fio",
      "layout-block-block-work",
    ]);
    expect(
      within(screen.getByTestId("layout-block-block-fio"))
        .getAllByTestId(/^layout-field-/)
        .map((node) => node.dataset.testid),
    ).toEqual(["layout-field-field-name", "layout-field-field-active"]);
    expect(globalStyles).toContain(".card-layout-responsive-grid");
    expect(globalStyles).toMatch(
      /@media \(max-width: 820px\)[\s\S]*\.card-layout-responsive-grid[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\)\s*!important/,
    );
    expect(globalStyles).toMatch(
      /\.card-layout-responsive-grid\s*>\s*\.card-layout-block-node[\s\S]*grid-column:\s*1\s*\/\s*-1\s*!important/,
    );
    expect(globalStyles).toMatch(
      /\.card-layout-responsive-field-grid\s*>\s*\.card-layout-field-node[\s\S]*grid-row:\s*auto\s*!important/,
    );
  });

  test("treats an explicit null selection as controlled", async () => {
    const user = userEvent.setup();
    const onSelectionChange = vi.fn();
    render(
      <CardWebLayoutCanvas
        {...canvasProps({
          selection: null,
          onSelectionChange,
        })}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Изменить блок ФИО" }));

    expect(onSelectionChange).toHaveBeenCalledWith({ kind: "block", id: block.id });
    expect(screen.queryByLabelText("Название блока")).not.toBeInTheDocument();
  });

  test("keeps a controlled selection derived from the prop after a canvas click", async () => {
    const user = userEvent.setup();
    const onCommitBlock = vi.fn();
    const onSelectionChange = vi.fn();
    render(
      <CardWebLayoutCanvas
        {...canvasProps({
          selection: { kind: "block", id: block.id },
          onCommitBlock,
          onSelectionChange,
        })}
      />,
    );

    await user.click(screen.getByTestId("card-layout-canvas"));

    expect(onCommitBlock).toHaveBeenCalledTimes(1);
    expect(onSelectionChange).toHaveBeenCalledTimes(1);
    expect(onSelectionChange).toHaveBeenCalledWith(null);
    expect(screen.getByLabelText("Название блока")).toBeInTheDocument();
  });

  test("does not restore an uncontrolled edit selection after leaving design mode", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<CardWebLayoutCanvas {...canvasProps()} />);

    await user.click(screen.getByRole("button", { name: "Изменить блок ФИО" }));
    expect(screen.getByLabelText("Название блока")).toBeInTheDocument();

    rerender(<CardWebLayoutCanvas {...canvasProps({ mode: "readonly" })} />);
    expect(screen.queryByLabelText("Название блока")).not.toBeInTheDocument();

    rerender(<CardWebLayoutCanvas {...canvasProps()} />);
    expect(screen.queryByLabelText("Название блока")).not.toBeInTheDocument();
  });

  test("hides design actions that do not have callback boundaries", () => {
    render(<CardWebLayoutCanvas layout={layout} mode="design" />);

    expect(
      screen.queryByRole("button", { name: "Создать блок в этой области" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Вставить существующий блок в эту область" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Создать поле в блоке ФИО" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Изменить блок ФИО" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Изменить поле Имя" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Переместить блок ФИО" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Переместить поле Имя" })).not.toBeInTheDocument();
  });

  test("moves a block through one captured pointer session and commits only on pointer up", () => {
    const onGeometryCommit = vi.fn();
    render(<CardWebLayoutCanvas {...canvasProps({ onGeometryCommit })} />);

    const canvas = screen.getByTestId("card-layout-canvas");
    const moveHandle = screen.getByRole("button", { name: "Переместить блок ФИО" });
    mockGridRect(canvas);
    const capture = installPointerCapture(moveHandle);

    dispatchPointer(moveHandle, "pointerdown", { pointerId: 17, clientX: 100, clientY: 50 });
    dispatchPointer(moveHandle, "pointermove", { pointerId: 17, clientX: 400, clientY: 150 });

    expect(capture.setPointerCapture).toHaveBeenCalledOnce();
    expect(capture.setPointerCapture).toHaveBeenCalledWith(17);
    expect(onGeometryCommit).not.toHaveBeenCalled();
    expect(screen.getByTestId("layout-block-block-fio")).toHaveStyle({
      gridColumn: "4 / span 6",
      gridRow: "2 / span 2",
    });
    expect(screen.getByText("Размер: 6 из 12 × 2 из 4")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Готово" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Отмена изменения геометрии" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Область свободна");
    expect(
      screen.queryByRole("button", { name: "Создать поле в блоке ФИО" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Изменить блок ФИО" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Изменить поле Имя" })).not.toBeInTheDocument();

    const webPreview = screen.getByRole("region", { name: "Предпросмотр веб-карточки" });
    const a4Preview = screen.getByRole("region", {
      name: "Предпросмотр связанной карточки A4",
    });
    expect(webPreview).toHaveAttribute(
      "data-layout-identity",
      a4Preview.getAttribute("data-layout-identity"),
    );
    expect(within(webPreview).getByTestId("live-layout-block-block-fio")).toHaveStyle({
      gridColumn: "4 / span 6",
      gridRow: "2 / span 2",
    });
    expect(within(a4Preview).getByTestId("live-layout-block-block-fio")).toHaveStyle({
      gridColumn: "4 / span 6",
      gridRow: "2 / span 2",
    });

    dispatchPointer(moveHandle, "pointerup", { pointerId: 17, clientX: 400, clientY: 150 });

    expect(capture.releasePointerCapture).toHaveBeenCalledOnce();
    expect(capture.releasePointerCapture).toHaveBeenCalledWith(17);
    expect(onGeometryCommit).toHaveBeenCalledOnce();
    expect(onGeometryCommit).toHaveBeenCalledWith({
      target: { id: block.id, kind: "block" },
      before: { row: 1, column: 1, rowSpan: 2, columnSpan: 6 },
      after: { row: 2, column: 4, rowSpan: 2, columnSpan: 6 },
    });
  });

  test("rolls back a failed pointer capture so a later pointer session can start", () => {
    const onGeometryCommit = vi.fn();
    render(<CardWebLayoutCanvas {...canvasProps({ onGeometryCommit })} />);

    const canvas = screen.getByTestId("card-layout-canvas");
    const moveHandle = blockMoveHandle();
    mockGridRect(canvas);
    const capture = installPointerCapture(moveHandle);
    capture.setPointerCapture.mockImplementationOnce(() => {
      throw new Error("capture unavailable");
    });

    expect(() =>
      dispatchPointer(moveHandle, "pointerdown", { pointerId: 101, clientX: 100, clientY: 50 }),
    ).not.toThrow();
    expect(document.querySelector(".card-layout-geometry-session")).not.toBeInTheDocument();

    dispatchPointer(moveHandle, "pointerdown", { pointerId: 102, clientX: 100, clientY: 50 });
    dispatchPointer(moveHandle, "pointermove", { pointerId: 102, clientX: 400, clientY: 150 });
    dispatchPointer(moveHandle, "pointerup", { pointerId: 102, clientX: 400, clientY: 150 });

    expect(capture.setPointerCapture).toHaveBeenCalledTimes(2);
    expect(onGeometryCommit).toHaveBeenCalledOnce();
  });

  test("cancels and restores an active session when pointer capture is lost", () => {
    const onGeometryCommit = vi.fn();
    render(<CardWebLayoutCanvas {...canvasProps({ onGeometryCommit })} />);

    const canvas = screen.getByTestId("card-layout-canvas");
    const moveHandle = blockMoveHandle();
    mockGridRect(canvas);
    const capture = installPointerCapture(moveHandle);
    dispatchPointer(moveHandle, "pointerdown", { pointerId: 103, clientX: 100, clientY: 50 });
    dispatchPointer(moveHandle, "pointermove", { pointerId: 103, clientX: 400, clientY: 150 });

    dispatchPointer(moveHandle, "lostpointercapture", {
      pointerId: 103,
      clientX: 400,
      clientY: 150,
    });

    expect(capture.releasePointerCapture).not.toHaveBeenCalled();
    expect(onGeometryCommit).not.toHaveBeenCalled();
    expect(screen.getByTestId("layout-block-block-fio")).toHaveStyle({
      gridColumn: "1 / span 6",
      gridRow: "1 / span 2",
    });
    expect(document.querySelector(".card-layout-geometry-session")).not.toBeInTheDocument();
  });

  test("ignores lost capture emitted by an intentional pointer release", () => {
    const onGeometryCommit = vi.fn();
    render(<CardWebLayoutCanvas {...canvasProps({ onGeometryCommit })} />);

    const canvas = screen.getByTestId("card-layout-canvas");
    const moveHandle = blockMoveHandle();
    mockGridRect(canvas);
    const capture = installPointerCapture(moveHandle);
    capture.releasePointerCapture.mockImplementation((pointerId: number) => {
      dispatchPointer(moveHandle, "lostpointercapture", {
        pointerId,
        clientX: 400,
        clientY: 150,
      });
    });
    dispatchPointer(moveHandle, "pointerdown", { pointerId: 104, clientX: 100, clientY: 50 });
    dispatchPointer(moveHandle, "pointermove", { pointerId: 104, clientX: 400, clientY: 150 });

    dispatchPointer(moveHandle, "pointerup", { pointerId: 104, clientX: 400, clientY: 150 });

    expect(capture.releasePointerCapture).toHaveBeenCalledOnce();
    expect(onGeometryCommit).toHaveBeenCalledOnce();
    expect(document.querySelector(".card-layout-geometry-session")).not.toBeInTheDocument();
  });

  test("renders a compact block from its occupied field rows", () => {
    const compactLayout: CardTemplateLayoutRead = {
      ...layout,
      form_layout: {
        ...layout.form_layout,
        sections: [
          {
            ...layout.form_layout.sections[0],
            items: [layout.form_layout.sections[0].items[0]],
          },
        ],
      },
    };

    render(
      <CardWebLayoutCanvas {...canvasProps({ layout: compactLayout, fields: [fields[0]] })} />,
    );

    const blockNode = screen.getByTestId("layout-block-block-fio");
    const fieldGrid = blockNode.querySelector<HTMLElement>("[data-layout-grid='fields']");
    expect(fieldGrid).not.toBeNull();
    expect(fieldGrid!.style.gridTemplateRows).toBe("repeat(1, minmax(3rem, auto))");
    expect(fieldGrid!.style.minHeight).toBe("3rem");
    expect(blockNode.style.alignSelf).toBe("start");
  });

  test("places field creation footer after the existing field grid", () => {
    render(<CardWebLayoutCanvas {...canvasProps()} />);

    const blockNode = screen.getByTestId("layout-block-block-fio");
    const fieldGrid = blockNode.querySelector<HTMLElement>("[data-layout-grid='fields']");
    const createFieldButton = screen.getByRole("button", {
      name: "Создать поле в блоке ФИО",
    });
    expect(createFieldButton.closest(".card-layout-block-footer")).not.toBeNull();
    expect(
      fieldGrid!.compareDocumentPosition(createFieldButton) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  test("keeps A4 exact height when compact block projection is disabled", () => {
    render(<CardWebLayoutCanvas {...canvasProps({ compactBlockHeight: false })} />);

    const canvas = screen.getByTestId("card-layout-canvas");
    const blockNode = screen.getByTestId("layout-block-block-fio");
    const fieldGrid = blockNode.querySelector<HTMLElement>("[data-layout-grid='fields']");
    expect(fieldGrid).not.toBeNull();
    expect(fieldGrid!.style.gridTemplateRows).toBe("repeat(4, minmax(3rem, auto))");
    expect(fieldGrid!.style.minHeight).toBe("12rem");
    expect(blockNode.style.alignSelf).toBe("");
    expect(canvas.style.gridTemplateRows).toBe("repeat(4, minmax(6rem, 1fr))");
    expect(canvas.style.minHeight).toBe("24rem");
  });

  test("grows the web block row with a resized field without overlapping the next block", () => {
    const tallFieldLayout: CardTemplateLayoutRead = {
      ...twoBlockLayout,
      form_layout: {
        ...twoBlockLayout.form_layout,
        sections: [
          {
            ...twoBlockLayout.form_layout.sections[0],
            row: 1,
            row_span: 1,
            items: [
              {
                ...twoBlockLayout.form_layout.sections[0].items[0],
                row_span: 4,
              },
            ],
          },
          {
            ...twoBlockLayout.form_layout.sections[1],
            row: 2,
            row_span: 1,
          },
        ],
      },
    };

    render(
      <CardWebLayoutCanvas
        {...canvasProps({
          layout: tallFieldLayout,
          blocks: [block, secondaryBlock],
          fields: [...fields, secondaryField],
        })}
      />,
    );

    const canvas = screen.getByTestId("card-layout-canvas");
    const firstBlock = screen.getByTestId("layout-block-block-fio");
    const nextBlock = screen.getByTestId("layout-block-block-work");
    const firstGrid = firstBlock.querySelector<HTMLElement>("[data-layout-grid='fields']");

    expect(canvas.style.gridTemplateRows).toBe("repeat(4, minmax(0, auto))");
    expect(canvas.style.minHeight).toBe("0");
    expect(firstGrid!.style.gridTemplateRows).toBe("repeat(4, minmax(3rem, auto))");
    expect(firstGrid!.style.minHeight).toBe("12rem");
    expect(firstBlock.style.gridRow).toBe("1 / span 1");
    expect(nextBlock.style.gridRow).toBe("2 / span 1");
  });

  test("uses adaptive web canvas rows while keeping live previews exact", () => {
    render(<CardWebLayoutCanvas {...canvasProps({ onGeometryCommit: vi.fn() })} />);

    const canvas = screen.getByTestId("card-layout-canvas");
    const fieldGrid = screen
      .getByTestId("layout-field-field-name")
      .closest<HTMLElement>("[data-layout-grid='fields']");
    expect(fieldGrid).not.toBeNull();
    expect(canvas.style.gridTemplateRows).toBe("repeat(4, minmax(0, auto))");
    expect(canvas.style.minHeight).toBe("0");
    expect(fieldGrid!.style.gridTemplateRows).toBe("repeat(3, minmax(3rem, auto))");
    expect(fieldGrid!.style.minHeight).toBe("9rem");

    const moveHandle = blockMoveHandle();
    mockGridRect(canvas);
    installPointerCapture(moveHandle);
    dispatchPointer(moveHandle, "pointerdown", { pointerId: 105, clientX: 100, clientY: 50 });

    const liveCanvasGrids = document.querySelectorAll<HTMLElement>(".layout-live-preview-grid");
    const liveFieldGrids = document.querySelectorAll<HTMLElement>(
      ".layout-live-preview-field-grid",
    );
    expect(liveCanvasGrids).toHaveLength(2);
    expect(liveFieldGrids).toHaveLength(2);
    for (const grid of liveCanvasGrids) {
      expect(grid.style.gridTemplateRows).toBe("repeat(4, minmax(6rem, 1fr))");
      expect(grid.style.gridTemplateRows).not.toContain("auto");
      expect(grid.style.minHeight).toBe("24rem");
    }
    for (const grid of liveFieldGrids) {
      expect(grid.style.gridTemplateRows).toBe("repeat(4, minmax(3rem, 1fr))");
      expect(grid.style.gridTemplateRows).not.toContain("auto");
      expect(grid.style.minHeight).toBe("12rem");
    }
  });

  test("supports direct field interaction without edit or move buttons", async () => {
    const user = userEvent.setup();
    render(<CardWebLayoutCanvas {...canvasProps({ onGeometryCommit: vi.fn() })} />);

    expect(screen.queryByRole("button", { name: "Изменить поле Имя" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Переместить поле Имя" })).not.toBeInTheDocument();

    const fieldNode = screen.getByTestId("layout-field-field-name");
    await user.click(fieldNode);

    expect(within(fieldNode).getByLabelText("Название поля")).toBeInTheDocument();
  });

  test("starts a field surface drag only after the six pixel threshold", () => {
    const onGeometryCommit = vi.fn();
    render(<CardWebLayoutCanvas {...canvasProps({ onGeometryCommit })} />);

    const fieldNode = screen.getByTestId("layout-field-field-name");
    const fieldGrid = fieldNode.closest<HTMLElement>("[data-layout-grid='fields']");
    expect(fieldGrid).not.toBeNull();
    mockGridRect(fieldGrid!);
    const capture = installPointerCapture(fieldNode);

    dispatchPointer(fieldNode, "pointerdown", { pointerId: 121, clientX: 0, clientY: 0 });
    dispatchPointer(fieldNode, "pointermove", { pointerId: 121, clientX: 5, clientY: 0 });
    expect(document.querySelector(".card-layout-geometry-session")).not.toBeInTheDocument();

    dispatchPointer(fieldNode, "pointermove", { pointerId: 121, clientX: 6, clientY: 0 });
    expect(document.querySelector(".card-layout-geometry-session")).toBeInTheDocument();
    dispatchPointer(fieldNode, "pointermove", { pointerId: 121, clientX: 306, clientY: 0 });
    dispatchPointer(fieldNode, "pointerup", { pointerId: 121, clientX: 306, clientY: 0 });

    expect(capture.setPointerCapture).toHaveBeenCalledWith(121);
    expect(capture.releasePointerCapture).toHaveBeenCalledWith(121);
    expect(onGeometryCommit).toHaveBeenCalledWith({
      target: { id: fields[0].id, kind: "field" },
      before: { row: 1, column: 1, rowSpan: 1, columnSpan: 9 },
      after: { row: 1, column: 4, rowSpan: 1, columnSpan: 9 },
    });
  });

  test("exposes all field resize zones without a field move button", () => {
    render(<CardWebLayoutCanvas {...canvasProps({ onGeometryCommit: vi.fn() })} />);

    expect(screen.queryByRole("button", { name: "Переместить поле Имя" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Изменить размер поля Имя:/ })).toHaveLength(8);
  });

  test("resizes a field from a corner on both axes and allows edge touching", () => {
    const onGeometryCommit = vi.fn();
    render(<CardWebLayoutCanvas {...canvasProps({ onGeometryCommit })} />);

    const fieldGrid = screen
      .getByTestId("layout-field-field-name")
      .closest<HTMLElement>("[data-layout-grid='fields']");
    expect(fieldGrid).not.toBeNull();
    mockGridRect(fieldGrid!);
    expect(onGeometryCommit).not.toHaveBeenCalled();
    expect(screen.getAllByRole("button", { name: /Изменить размер поля Имя:/ })).toHaveLength(8);
    const resizeHandle = screen.getByRole("button", {
      name: "Изменить размер поля Имя: нижний левый угол",
    });
    const capture = installPointerCapture(resizeHandle);

    dispatchPointer(resizeHandle, "pointerdown", { pointerId: 23, clientX: 0, clientY: 0 });
    dispatchPointer(resizeHandle, "pointermove", { pointerId: 23, clientX: 300, clientY: 100 });

    expect(onGeometryCommit).not.toHaveBeenCalled();
    expect(screen.getByTestId("layout-field-field-name")).toHaveStyle({
      gridColumn: "4 / span 6",
      gridRow: "1 / span 2",
    });
    expect(screen.getByRole("status")).toHaveTextContent("Область свободна");

    dispatchPointer(resizeHandle, "pointerup", { pointerId: 23, clientX: 300, clientY: 100 });

    expect(capture.setPointerCapture).toHaveBeenCalledWith(23);
    expect(capture.releasePointerCapture).toHaveBeenCalledWith(23);
    expect(onGeometryCommit).toHaveBeenCalledOnce();
    expect(onGeometryCommit).toHaveBeenCalledWith({
      target: { id: fields[0].id, kind: "field" },
      before: { row: 1, column: 1, rowSpan: 1, columnSpan: 9 },
      after: { row: 1, column: 4, rowSpan: 2, columnSpan: 6 },
    });
    expect(screen.queryByLabelText("Название поля")).not.toBeInTheDocument();
  });

  test("releases pointer capture and restores geometry on pointer cancel", () => {
    const onGeometryCommit = vi.fn();
    render(<CardWebLayoutCanvas {...canvasProps({ onGeometryCommit })} />);

    const canvas = screen.getByTestId("card-layout-canvas");
    const moveHandle = screen.getByRole("button", { name: "Переместить блок ФИО" });
    mockGridRect(canvas);
    const capture = installPointerCapture(moveHandle);
    dispatchPointer(moveHandle, "pointerdown", { pointerId: 31, clientX: 100, clientY: 50 });
    dispatchPointer(moveHandle, "pointermove", { pointerId: 31, clientX: 400, clientY: 150 });

    dispatchPointer(moveHandle, "pointercancel", { pointerId: 31, clientX: 400, clientY: 150 });

    expect(capture.releasePointerCapture).toHaveBeenCalledWith(31);
    expect(onGeometryCommit).not.toHaveBeenCalled();
    expect(screen.getByTestId("layout-block-block-fio")).toHaveStyle({
      gridColumn: "1 / span 6",
      gridRow: "1 / span 2",
    });
    expect(
      screen.queryByRole("region", { name: "Предпросмотр веб-карточки" }),
    ).not.toBeInTheDocument();
  });

  test("restores the original geometry on Escape and on the cancel button without commit", async () => {
    const user = userEvent.setup();
    const onGeometryCommit = vi.fn();
    render(<CardWebLayoutCanvas {...canvasProps({ onGeometryCommit })} />);

    const canvas = screen.getByTestId("card-layout-canvas");
    const moveHandle = screen.getByRole("button", { name: "Переместить блок ФИО" });
    mockGridRect(canvas);
    const capture = installPointerCapture(moveHandle);
    dispatchPointer(moveHandle, "pointerdown", { pointerId: 37, clientX: 100, clientY: 50 });
    dispatchPointer(moveHandle, "pointermove", { pointerId: 37, clientX: 400, clientY: 150 });

    fireEvent.keyDown(window, { key: "Escape" });

    expect(capture.releasePointerCapture).toHaveBeenCalledWith(37);
    expect(onGeometryCommit).not.toHaveBeenCalled();
    expect(screen.getByTestId("layout-block-block-fio")).toHaveStyle({
      gridColumn: "1 / span 6",
      gridRow: "1 / span 2",
    });

    const keyboardHandle = screen.getByRole("button", { name: "Переместить блок ФИО" });
    keyboardHandle.focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByTestId("layout-block-block-fio")).toHaveStyle({
      gridColumn: "2 / span 6",
    });
    await user.click(screen.getByRole("button", { name: "Отмена изменения геометрии" }));
    expect(onGeometryCommit).not.toHaveBeenCalled();
    expect(screen.getByTestId("layout-block-block-fio")).toHaveStyle({
      gridColumn: "1 / span 6",
    });
  });

  test("rejects collision and out-of-grid pointer commits with Russian feedback", async () => {
    const user = userEvent.setup();
    const onGeometryCommit = vi.fn();
    render(
      <CardWebLayoutCanvas
        {...canvasProps({
          blocks: [block, secondaryBlock],
          fields: [...fields, secondaryField],
          layout: twoBlockLayout,
          onGeometryCommit,
        })}
      />,
    );

    const canvas = screen.getByTestId("card-layout-canvas");
    const moveHandle = screen.getByRole("button", { name: "Переместить блок ФИО" });
    mockGridRect(canvas);
    installPointerCapture(moveHandle);
    dispatchPointer(moveHandle, "pointerdown", { pointerId: 41, clientX: 100, clientY: 50 });
    dispatchPointer(moveHandle, "pointermove", { pointerId: 41, clientX: 700, clientY: 250 });

    expect(screen.getByRole("status")).toHaveTextContent("Пересечение с другим блоком");
    dispatchPointer(moveHandle, "pointerup", { pointerId: 41, clientX: 700, clientY: 250 });
    expect(onGeometryCommit).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Готово" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Отмена изменения геометрии" }));
    const nextMoveHandle = screen.getByRole("button", { name: "Переместить блок ФИО" });
    installPointerCapture(nextMoveHandle);
    dispatchPointer(nextMoveHandle, "pointerdown", {
      pointerId: 43,
      clientX: 100,
      clientY: 50,
    });
    dispatchPointer(nextMoveHandle, "pointermove", {
      pointerId: 43,
      clientX: -100,
      clientY: 50,
    });

    expect(screen.getByRole("status")).toHaveTextContent("за границы сетки 12 × 4");
    dispatchPointer(nextMoveHandle, "pointerup", {
      pointerId: 43,
      clientX: -100,
      clientY: 50,
    });
    expect(onGeometryCommit).not.toHaveBeenCalled();
  });

  test("revalidates immediately when a controlled layout removes the active obstacle", () => {
    const onGeometryCommit = vi.fn();
    const { rerender } = render(
      <CardWebLayoutCanvas
        {...canvasProps({
          blocks: [block, secondaryBlock],
          fields: [...fields, secondaryField],
          layout: twoBlockLayout,
          onGeometryCommit,
        })}
      />,
    );

    const canvas = screen.getByTestId("card-layout-canvas");
    const moveHandle = blockMoveHandle();
    mockGridRect(canvas);
    installPointerCapture(moveHandle);
    dispatchPointer(moveHandle, "pointerdown", { pointerId: 106, clientX: 100, clientY: 50 });
    dispatchPointer(moveHandle, "pointermove", { pointerId: 106, clientX: 700, clientY: 250 });
    expect(screen.getByRole("status")).toHaveClass("is-invalid");

    rerender(<CardWebLayoutCanvas {...canvasProps({ layout, onGeometryCommit })} />);

    const doneButton = document.querySelector<HTMLButtonElement>(
      ".card-layout-geometry-session button:not(.ghost-button)",
    );
    expect(screen.getByRole("status")).toHaveClass("is-valid");
    expect(doneButton).not.toBeNull();
    expect(doneButton).toBeEnabled();
    fireEvent.click(doneButton!);
    expect(onGeometryCommit).toHaveBeenCalledOnce();
  });

  test("revalidates immediately when a controlled layout adds an active obstacle", () => {
    const onGeometryCommit = vi.fn();
    const { rerender } = render(
      <CardWebLayoutCanvas {...canvasProps({ layout, onGeometryCommit })} />,
    );

    const canvas = screen.getByTestId("card-layout-canvas");
    const moveHandle = blockMoveHandle();
    mockGridRect(canvas);
    installPointerCapture(moveHandle);
    dispatchPointer(moveHandle, "pointerdown", { pointerId: 107, clientX: 100, clientY: 50 });
    dispatchPointer(moveHandle, "pointermove", { pointerId: 107, clientX: 700, clientY: 250 });
    expect(screen.getByRole("status")).toHaveClass("is-valid");

    rerender(
      <CardWebLayoutCanvas
        {...canvasProps({
          blocks: [block, secondaryBlock],
          fields: [...fields, secondaryField],
          layout: twoBlockLayout,
          onGeometryCommit,
        })}
      />,
    );

    const doneButton = document.querySelector<HTMLButtonElement>(
      ".card-layout-geometry-session button:not(.ghost-button)",
    );
    expect(screen.getByRole("status")).toHaveClass("is-invalid");
    expect(doneButton).not.toBeNull();
    expect(doneButton).toBeDisabled();
    expect(onGeometryCommit).not.toHaveBeenCalled();
  });

  test("supports arrow movement and documented Shift plus arrow resizing with one Done commit", async () => {
    const user = userEvent.setup();
    const onGeometryCommit = vi.fn();
    const { rerender } = render(<CardWebLayoutCanvas {...canvasProps({ onGeometryCommit })} />);

    const blockMoveHandle = screen.getByRole("button", { name: "Переместить блок ФИО" });
    expect(blockMoveHandle).toHaveAttribute(
      "title",
      "Стрелки — перемещение; Shift + стрелки — изменение размера",
    );
    blockMoveHandle.focus();
    await user.keyboard("{ArrowRight}");
    expect(onGeometryCommit).not.toHaveBeenCalled();
    expect(screen.getByTestId("layout-block-block-fio")).toHaveStyle({
      gridColumn: "2 / span 6",
    });
    await user.click(screen.getByRole("button", { name: "Готово" }));
    expect(onGeometryCommit).toHaveBeenCalledOnce();
    expect(onGeometryCommit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        target: { id: block.id, kind: "block" },
        after: expect.objectContaining({ column: 2 }),
      }),
    );

    onGeometryCommit.mockClear();
    rerender(<CardWebLayoutCanvas {...canvasProps({ onGeometryCommit })} />);
    const fieldNode = screen.getByTestId("layout-field-field-name");
    fieldNode.focus();
    await user.keyboard("{Shift>}{ArrowLeft}{/Shift}");
    expect(onGeometryCommit).not.toHaveBeenCalled();
    expect(screen.getByTestId("layout-field-field-name")).toHaveStyle({
      gridColumn: "1 / span 6",
    });
    await user.click(screen.getByRole("button", { name: "Готово" }));
    expect(onGeometryCommit).toHaveBeenCalledOnce();
    expect(onGeometryCommit).toHaveBeenLastCalledWith({
      target: { id: fields[0].id, kind: "field" },
      before: { row: 1, column: 1, rowSpan: 1, columnSpan: 9 },
      after: { row: 1, column: 1, rowSpan: 1, columnSpan: 6 },
    });
  });

  test("keeps eight field resize zones available until another geometry target is active", () => {
    render(<CardWebLayoutCanvas {...canvasProps({ onGeometryCommit: vi.fn() })} />);

    expect(screen.getAllByRole("button", { name: /Изменить размер блока ФИО:/ })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: /Изменить размер поля Имя:/ })).toHaveLength(8);

    const canvas = screen.getByTestId("card-layout-canvas");
    const moveHandle = screen.getByRole("button", { name: "Переместить блок ФИО" });
    mockGridRect(canvas);
    installPointerCapture(moveHandle);
    dispatchPointer(moveHandle, "pointerdown", { pointerId: 45, clientX: 0, clientY: 0 });
    dispatchPointer(moveHandle, "pointermove", { pointerId: 45, clientX: 100, clientY: 0 });

    expect(screen.getAllByRole("button", { name: /Изменить размер блока ФИО:/ })).toHaveLength(8);
    expect(
      screen.queryByRole("button", { name: /Изменить размер поля Имя:/ }),
    ).not.toBeInTheDocument();
  });

  test("requires commit callbacks before opening inline editors", async () => {
    const user = userEvent.setup();
    render(
      <CardWebLayoutCanvas
        layout={layout}
        mode="design"
        onCommitBlock={vi.fn()}
        onCommitField={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Изменить блок ФИО" }));
    expect(screen.getByLabelText("Название блока")).toBeInTheDocument();
  });

  test("hides every geometry affordance while an inline semantic editor owns the draft", async () => {
    const user = userEvent.setup();
    render(<CardWebLayoutCanvas {...canvasProps({ onGeometryCommit: vi.fn() })} />);

    await user.click(screen.getByRole("button", { name: "Изменить блок ФИО" }));
    await user.type(screen.getByLabelText("Название блока"), " — черновик");

    expect(screen.getByLabelText("Название блока")).toHaveValue("ФИО — черновик");
    expect(screen.queryByRole("button", { name: "Переместить блок ФИО" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Переместить поле Имя" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Изменить размер поля Активно:/ }),
    ).not.toBeInTheDocument();
  });

  test("keeps geometry unavailable for a controlled semantic edit selection", () => {
    render(
      <CardWebLayoutCanvas
        {...canvasProps({
          selection: { kind: "field", id: fields[0].id },
          onGeometryCommit: vi.fn(),
        })}
      />,
    );

    expect(screen.getByLabelText("Название поля")).toHaveValue("Имя");
    expect(screen.queryByRole("button", { name: "Переместить блок ФИО" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Переместить поле Активно" }),
    ).not.toBeInTheDocument();
  });

  test("clears a pointer session without a geometry change or undo command", () => {
    const onGeometryCommit = vi.fn();
    render(<CardWebLayoutCanvas {...canvasProps({ onGeometryCommit })} />);

    const canvas = screen.getByTestId("card-layout-canvas");
    const moveHandle = screen.getByRole("button", { name: "Переместить блок ФИО" });
    mockGridRect(canvas);
    const capture = installPointerCapture(moveHandle);

    dispatchPointer(moveHandle, "pointerdown", { pointerId: 47, clientX: 100, clientY: 50 });
    dispatchPointer(moveHandle, "pointerup", { pointerId: 47, clientX: 100, clientY: 50 });

    expect(capture.releasePointerCapture).toHaveBeenCalledWith(47);
    expect(onGeometryCommit).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("region", { name: "Предпросмотр веб-карточки" }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Изменить размер блока ФИО:/ })).toHaveLength(1);
  });

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

    const fieldNode = screen.getByTestId("layout-field-field-name");
    fieldNode.focus();
    await user.keyboard("{Enter}");
    expect(within(fieldNode).getByLabelText("Название поля")).toHaveValue("Имя");
    const typeSelect = within(fieldNode).getByLabelText("Тип поля");
    const options = within(typeSelect).getAllByRole("option");

    expect(options.map((option) => option.getAttribute("value"))).toEqual([...FIELD_TYPES]);
    expect(options.map((option) => option.textContent)).toEqual(
      FIELD_TYPES.map((fieldType) => fieldTypeLabel(fieldType)),
    );
  });

  test("keeps reference-list selection real for select and multi-select field types", async () => {
    const user = userEvent.setup();
    const onCommitField = vi.fn();
    render(
      <CardWebLayoutCanvas
        {...canvasProps({
          onCommitField,
          referenceLists: [
            {
              id: "reference-statuses",
              registry_id: "registry-1",
              owner_organization_id: null,
              code: "statuses",
              name: "Статусы",
              description: null,
              inherit_to_descendants: false,
              locked_for_descendants: false,
              managed_by_system_only: false,
              is_active: true,
            },
          ],
        })}
      />,
    );

    await user.click(screen.getByTestId("layout-field-field-name"));
    await user.selectOptions(screen.getByLabelText("Тип поля"), "select");
    await user.selectOptions(screen.getByLabelText("Справочник"), "reference-statuses");
    await user.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(onCommitField).toHaveBeenCalledWith(
      expect.objectContaining({
        field_type: "select",
        options_source_type: "reference_list",
        options_source_id: "reference-statuses",
      }),
    );
  });

  test("commits a valid field on click-away and keeps invalid fields focused", async () => {
    const user = userEvent.setup();
    const onCommitField = vi.fn();
    render(<CardWebLayoutCanvas {...canvasProps({ onCommitField })} />);

    await user.click(screen.getByTestId("layout-field-field-name"));
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

    await user.click(screen.getByTestId("layout-field-field-name"));
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

  test("edits values only inside the selected block and preserves both grid geometries", () => {
    render(
      <CardWebLayoutCanvas
        {...canvasProps({
          layout: twoBlockLayout,
          blocks: [block, secondaryBlock],
          fields: [...fields, secondaryField],
          mode: "block-edit",
          selection: { kind: "block", id: block.id },
          fieldValues: {
            [fields[0].id]: "Анна",
            [secondaryField.id]: "Секретарь",
          },
          onFieldValueChange: vi.fn(),
        })}
      />,
    );

    expect(screen.getByRole("textbox", { name: "Имя" })).toHaveValue("Анна");
    expect(screen.queryByRole("textbox", { name: "Должность" })).not.toBeInTheDocument();
    expect(screen.getByText("Секретарь")).toBeInTheDocument();
    expect(screen.getByTestId("layout-block-block-fio")).toHaveStyle({
      gridColumn: "1 / span 6",
      gridRow: "1 / span 2",
    });
    expect(screen.getByTestId("layout-block-block-work")).toHaveStyle({
      gridColumn: "7 / span 6",
      gridRow: "3 / span 2",
    });
    expect(screen.getByTestId("layout-field-field-position")).toHaveStyle({
      gridColumn: "4 / span 6",
      gridRow: "2 / span 2",
    });
  });

  test("never exposes schema actions or inline schema editors in block-edit mode", () => {
    render(
      <CardWebLayoutCanvas
        {...canvasProps({
          mode: "block-edit",
          selection: { kind: "block", id: block.id },
          fieldValues: { [fields[0].id]: "Анна" },
          onFieldValueChange: vi.fn(),
        })}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Создать блок в этой области" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Вставить существующий блок в эту область" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Создать поле в блоке ФИО" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Изменить блок ФИО" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Изменить поле Имя" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Название блока")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Название поля")).not.toBeInTheDocument();
  });

  test("renders block-edit as readonly when no block is selected", () => {
    render(
      <CardWebLayoutCanvas
        {...canvasProps({
          mode: "block-edit",
          selection: null,
          fieldValues: { [fields[0].id]: "Анна" },
          onFieldValueChange: vi.fn(),
        })}
      />,
    );

    expect(screen.queryByRole("textbox", { name: "Имя" })).not.toBeInTheDocument();
    expect(screen.getByText("Анна")).toBeInTheDocument();
  });

  test("forwards selected block control changes through the field value callback", async () => {
    const user = userEvent.setup();
    const onFieldValueChange = vi.fn();
    render(
      <CardWebLayoutCanvas
        {...canvasProps({
          mode: "block-edit",
          selection: { kind: "block", id: block.id },
          fieldValues: { [fields[0].id]: "Анна" },
          onFieldValueChange,
        })}
      />,
    );

    await user.type(screen.getByRole("textbox", { name: "Имя" }), "!");

    expect(onFieldValueChange).toHaveBeenLastCalledWith(fields[0], "Анна!");
  });

  test("switches between block-edit controls and readonly values without leaking schema state", () => {
    const sharedProps = canvasProps({
      selection: { kind: "block", id: block.id },
      fieldValues: { [fields[0].id]: "Анна" },
      onFieldValueChange: vi.fn(),
    });
    const { rerender } = render(<CardWebLayoutCanvas {...sharedProps} mode="block-edit" />);

    expect(screen.getByRole("textbox", { name: "Имя" })).toBeInTheDocument();

    rerender(<CardWebLayoutCanvas {...sharedProps} mode="readonly" />);
    expect(screen.queryByRole("textbox", { name: "Имя" })).not.toBeInTheDocument();
    expect(screen.getByText("Анна")).toBeInTheDocument();

    rerender(<CardWebLayoutCanvas {...sharedProps} mode="block-edit" selection={null} />);
    expect(screen.queryByRole("textbox", { name: "Имя" })).not.toBeInTheDocument();
    expect(screen.getByText("Анна")).toBeInTheDocument();
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
