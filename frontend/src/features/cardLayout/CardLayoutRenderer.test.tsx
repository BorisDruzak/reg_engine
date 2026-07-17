/// <reference types="node" />

import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import type { ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";

import type { CardTemplateLayoutRead, FormBlockRead, FormFieldRead } from "@/api/types";
import { FIELD_TYPES, fieldTypeLabel } from "@/app/uiText";

import { normalizeWebBlockSections } from "./blockOrdering";
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
  fireEvent(element, pointerEvent(type, { pointerId, clientX, clientY }));
}

function dispatchPointerOutsideField(
  target: EventTarget,
  type: "pointermove" | "pointerup" | "pointercancel",
  { pointerId, clientX, clientY }: { pointerId: number; clientX: number; clientY: number },
) {
  act(() => {
    target.dispatchEvent(pointerEvent(type, { pointerId, clientX, clientY }));
  });
}

function pointerEvent(
  type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel" | "lostpointercapture",
  { pointerId, clientX, clientY }: { pointerId: number; clientX: number; clientY: number },
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    clientX: { value: clientX },
    clientY: { value: clientY },
    pointerId: { value: pointerId },
  });
  return event;
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

  test("renders inline field presentation without type metadata", () => {
    render(
      <CardLayoutRenderer
        {...({
          ...canvasProps({
            mode: "readonly",
            renderedValues: { "field-name": "Иван" },
          }),
          fieldPresentationLayout: "inline",
        } as unknown as CardWebLayoutCanvasProps)}
      />,
    );

    const node = screen.getByTestId("layout-field-field-name");
    expect(node.querySelector(".card-layout-inline-field")).not.toBeNull();
    expect(
      within(node).queryByText(fieldTypeLabel("text"), { exact: true }),
    ).not.toBeInTheDocument();
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

    expect(screen.queryByRole("button", { name: "Создать блок" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Создать поле в блоке ФИО" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Изменить блок ФИО" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Изменить поле Имя" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Переместить блок ФИО" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Переместить поле Имя" })).not.toBeInTheDocument();
  });

  test("uses visible block order arrows with safe boundaries instead of block dragging", async () => {
    const user = userEvent.setup();
    const onMoveBlock = vi.fn();
    render(
      <CardWebLayoutCanvas
        {...canvasProps({
          blocks: [block, secondaryBlock],
          fields: [...fields, secondaryField],
          layout: twoBlockLayout,
          onGeometryCommit: vi.fn(),
          onMoveBlock,
        })}
      />,
    );

    expect(screen.queryByRole("button", { name: "Переместить блок ФИО" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Переместить блок ФИО вверх" }),
    ).not.toBeInTheDocument();
    const firstDown = screen.getByRole("button", { name: "Переместить блок ФИО вниз" });
    const lastUp = screen.getByRole("button", { name: "Переместить блок Работа вверх" });

    expect(firstDown).toBeEnabled();
    expect(lastUp).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: "Переместить блок Работа вниз" }),
    ).not.toBeInTheDocument();
    await user.click(firstDown);
    expect(onMoveBlock).toHaveBeenCalledWith(block.id, "down");
    expect(
      screen.queryByRole("button", { name: /Изменить размер блока ФИО:/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("article", {
        name: "Поле Имя. Нажмите, чтобы изменить; удерживайте и перетащите, чтобы переместить.",
      }),
    ).toBeInTheDocument();
  });

  test("disables every block order arrow while ordering is unavailable", () => {
    render(
      <CardWebLayoutCanvas
        {...canvasProps({
          blocks: [block, secondaryBlock],
          fields: [...fields, secondaryField],
          layout: twoBlockLayout,
          onMoveBlock: vi.fn(),
          blockOrderingDisabled: true,
        })}
      />,
    );

    expect(
      screen.getAllByRole("button", { name: /Переместить блок .* (вверх|вниз)/ }),
    ).toHaveLength(2);
    for (const button of screen.getAllByRole("button", { name: /Переместить блок/ })) {
      expect(button).toBeDisabled();
    }
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

    const resizeHandle = screen.getByRole("button", {
      name: "Изменить размер поля Имя: нижний правый угол",
    });
    mockGridRect(canvas);
    installPointerCapture(resizeHandle);
    dispatchPointer(resizeHandle, "pointerdown", { pointerId: 105, clientX: 100, clientY: 50 });

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

  test("prevents native text selection on the field drag surface", async () => {
    const user = userEvent.setup();
    render(<CardWebLayoutCanvas {...canvasProps({ onGeometryCommit: vi.fn() })} />);

    const fieldNode = screen.getByTestId("layout-field-field-name");
    expect(fieldNode).toHaveStyle({ userSelect: "none" });

    await user.click(fieldNode);

    expect(within(fieldNode).getByLabelText("Название поля")).toBeInTheDocument();
    expect(fieldNode.style.userSelect).toBe("");
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
    expect(capture.setPointerCapture).toHaveBeenCalledWith(121);
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

  test("releases pending pointer capture when a field click does not become a drag", () => {
    render(<CardWebLayoutCanvas {...canvasProps({ onGeometryCommit: vi.fn() })} />);

    const fieldNode = screen.getByTestId("layout-field-field-name");
    const capture = installPointerCapture(fieldNode);

    dispatchPointer(fieldNode, "pointerdown", { pointerId: 133, clientX: 0, clientY: 0 });
    dispatchPointer(fieldNode, "pointerup", { pointerId: 133, clientX: 0, clientY: 0 });

    expect(capture.setPointerCapture).toHaveBeenCalledWith(133);
    expect(capture.releasePointerCapture).toHaveBeenCalledWith(133);
    expect(document.querySelector(".card-layout-geometry-session")).not.toBeInTheDocument();

    fireEvent.click(fieldNode);
    expect(within(fieldNode).getByLabelText("Название поля")).toBeInTheDocument();
  });

  test("keeps processing a fast pointer stream before React rerenders", () => {
    const onGeometryCommit = vi.fn();
    render(<CardWebLayoutCanvas {...canvasProps({ onGeometryCommit })} />);

    const fieldNode = screen.getByTestId("layout-field-field-name");
    const fieldGrid = fieldNode.closest<HTMLElement>("[data-layout-grid='fields']");
    expect(fieldGrid).not.toBeNull();
    mockGridRect(fieldGrid!);
    installPointerCapture(fieldNode);

    act(() => {
      fieldNode.dispatchEvent(
        pointerEvent("pointerdown", { pointerId: 130, clientX: 0, clientY: 0 }),
      );
      fieldNode.dispatchEvent(
        pointerEvent("pointermove", { pointerId: 130, clientX: 6, clientY: 0 }),
      );
      fieldNode.dispatchEvent(
        pointerEvent("pointermove", { pointerId: 130, clientX: 306, clientY: 0 }),
      );
      fieldNode.dispatchEvent(
        pointerEvent("pointerup", { pointerId: 130, clientX: 306, clientY: 0 }),
      );
    });

    expect(document.querySelector(".card-layout-geometry-session")).not.toBeInTheDocument();
    expect(onGeometryCommit).toHaveBeenCalledWith({
      target: { id: fields[0].id, kind: "field" },
      before: { row: 1, column: 1, rowSpan: 1, columnSpan: 9 },
      after: { row: 1, column: 4, rowSpan: 1, columnSpan: 9 },
    });
  });

  test("keeps the originating field while the pointer crosses a fully occupied row", () => {
    const onGeometryCommit = vi.fn();
    const fullRowField: FormFieldRead = {
      ...fields[0],
      id: "field-full-row",
      code: "full_row",
      label: "Полная строка",
      position: 2,
    };
    const layoutWithPointerLeavingField: CardTemplateLayoutRead = {
      ...layout,
      structure: {
        ...layout.structure,
        fields: [...fields, fullRowField],
      },
      form_layout: {
        ...layout.form_layout,
        sections: [
          {
            ...layout.form_layout.sections[0],
            row_span: 1,
            items: [
              {
                ...layout.form_layout.sections[0].items[1],
                row: 1,
                column: 7,
                row_span: 1,
                column_span: 3,
              },
              {
                ...layout.form_layout.sections[0].items[0],
                row: 1,
                column: 10,
                row_span: 1,
                column_span: 3,
              },
              {
                id: fullRowField.id,
                kind: "field",
                field_id: fullRowField.id,
                row: 2,
                column: 1,
                row_span: 1,
                column_span: 12,
              },
            ],
          },
        ],
      },
    };
    render(
      <CardWebLayoutCanvas
        {...canvasProps({
          layout: layoutWithPointerLeavingField,
          fields: [...fields, fullRowField],
          onGeometryCommit,
        })}
      />,
    );

    const fieldNode = screen.getByTestId("layout-field-field-name");
    const neighbourNode = screen.getByTestId("layout-field-field-active");
    const fieldGrid = fieldNode.closest<HTMLElement>("[data-layout-grid='fields']");
    expect(fieldGrid).not.toBeNull();
    mockGridRect(fieldGrid!, 1200, 200);
    installPointerCapture(fieldNode);

    dispatchPointer(fieldNode, "pointerdown", { pointerId: 134, clientX: 950, clientY: 50 });
    dispatchPointerOutsideField(window, "pointermove", {
      pointerId: 134,
      clientX: 950,
      clientY: 150,
    });

    expect(fieldNode).toHaveStyle({
      gridColumn: "10 / span 3",
      gridRow: "3 / span 1",
    });
    expect(neighbourNode).toHaveStyle({
      gridColumn: "7 / span 3",
      gridRow: "1 / span 1",
    });

    dispatchPointerOutsideField(window, "pointerup", {
      pointerId: 134,
      clientX: 950,
      clientY: 150,
    });

    expect(onGeometryCommit).toHaveBeenCalledWith({
      target: { id: fields[0].id, kind: "field" },
      before: { row: 1, column: 10, rowSpan: 1, columnSpan: 3 },
      after: { row: 3, column: 10, rowSpan: 1, columnSpan: 3 },
    });
  });

  test("does not swallow a later click when the drag produces no click event", async () => {
    render(<CardWebLayoutCanvas {...canvasProps({ onGeometryCommit: vi.fn() })} />);

    const fieldNode = screen.getByTestId("layout-field-field-name");
    const fieldGrid = fieldNode.closest<HTMLElement>("[data-layout-grid='fields']");
    expect(fieldGrid).not.toBeNull();
    mockGridRect(fieldGrid!);
    installPointerCapture(fieldNode);

    dispatchPointer(fieldNode, "pointerdown", { pointerId: 131, clientX: 0, clientY: 0 });
    dispatchPointer(fieldNode, "pointermove", { pointerId: 131, clientX: 306, clientY: 0 });
    dispatchPointer(fieldNode, "pointerup", { pointerId: 131, clientX: 306, clientY: 0 });

    await new Promise((resolve) => window.setTimeout(resolve, 0));
    fireEvent.click(fieldNode);

    expect(within(fieldNode).getByLabelText("Название поля")).toBeInTheDocument();
  });

  test("grows a compact block on the first vertical field drag event", () => {
    const onGeometryCommit = vi.fn();
    const singleFieldLayout: CardTemplateLayoutRead = {
      ...layout,
      form_layout: {
        ...layout.form_layout,
        sections: [
          {
            ...layout.form_layout.sections[0],
            row_span: 1,
            items: [layout.form_layout.sections[0].items[0]],
          },
        ],
      },
    };
    render(
      <CardWebLayoutCanvas
        {...canvasProps({
          layout: singleFieldLayout,
          fields: [fields[0]],
          onGeometryCommit,
        })}
      />,
    );

    const fieldNode = screen.getByTestId("layout-field-field-name");
    const fieldGrid = fieldNode.closest<HTMLElement>("[data-layout-grid='fields']");
    expect(fieldGrid).not.toBeNull();
    expect(fieldGrid!.dataset.layoutGridRows).toBe("1");
    mockGridRect(fieldGrid!, 1200, 100);
    installPointerCapture(fieldNode);

    dispatchPointer(fieldNode, "pointerdown", { pointerId: 122, clientX: 0, clientY: 0 });
    dispatchPointer(fieldNode, "pointermove", { pointerId: 122, clientX: 0, clientY: 100 });

    expect(fieldNode).toHaveStyle({ gridRow: "2 / span 1" });
    expect(fieldGrid!.dataset.layoutGridRows).toBe("2");
    expect(fieldGrid!.style.gridTemplateRows).toBe("repeat(2, minmax(3rem, auto))");
    expect(fieldGrid!.style.minHeight).toBe("6rem");

    dispatchPointer(fieldNode, "pointerup", { pointerId: 122, clientX: 0, clientY: 100 });

    expect(onGeometryCommit).toHaveBeenCalledWith({
      target: { id: fields[0].id, kind: "field" },
      before: { row: 1, column: 1, rowSpan: 1, columnSpan: 9 },
      after: { row: 2, column: 1, rowSpan: 1, columnSpan: 9 },
    });
  });

  test("clamps a downward drag past a compact field grid to its last logical row", () => {
    const onGeometryCommit = vi.fn();
    const singleFieldLayout: CardTemplateLayoutRead = {
      ...layout,
      form_layout: {
        ...layout.form_layout,
        sections: [
          {
            ...layout.form_layout.sections[0],
            row_span: 1,
            items: [
              {
                ...layout.form_layout.sections[0].items[0],
                row: 1,
                column: 1,
                row_span: 1,
                column_span: 6,
              },
            ],
          },
        ],
      },
    };
    render(
      <CardWebLayoutCanvas
        {...canvasProps({
          layout: singleFieldLayout,
          fields: [fields[0]],
          onGeometryCommit,
        })}
      />,
    );

    const fieldNode = screen.getByTestId("layout-field-field-name");
    const fieldGrid = fieldNode.closest<HTMLElement>("[data-layout-grid='fields']");
    expect(fieldGrid).not.toBeNull();
    expect(fieldGrid!.dataset.layoutGridRows).toBe("1");
    mockGridRect(fieldGrid!, 1200, 100);
    installPointerCapture(fieldNode);

    dispatchPointer(fieldNode, "pointerdown", { pointerId: 132, clientX: 0, clientY: 0 });
    dispatchPointer(fieldNode, "pointermove", { pointerId: 132, clientX: 0, clientY: 400 });

    expect(fieldNode).toHaveStyle({
      gridColumn: "1 / span 6",
      gridRow: "4 / span 1",
    });
    expect(fieldGrid!.dataset.layoutGridRows).toBe("4");
    expect(screen.getByRole("status")).toHaveClass("is-valid");

    dispatchPointer(fieldNode, "pointerup", { pointerId: 132, clientX: 0, clientY: 400 });

    expect(onGeometryCommit).toHaveBeenCalledWith({
      target: { id: fields[0].id, kind: "field" },
      before: { row: 1, column: 1, rowSpan: 1, columnSpan: 6 },
      after: { row: 4, column: 1, rowSpan: 1, columnSpan: 6 },
    });
  });

  test("places a moved field in the nearest free part of a partially occupied row", () => {
    const onGeometryCommit = vi.fn();
    const partiallyOccupiedLayout: CardTemplateLayoutRead = {
      ...layout,
      form_layout: {
        ...layout.form_layout,
        sections: [
          {
            ...layout.form_layout.sections[0],
            row_span: 1,
            items: [
              {
                ...layout.form_layout.sections[0].items[0],
                row: 1,
                column: 1,
                row_span: 1,
                column_span: 6,
              },
              {
                ...layout.form_layout.sections[0].items[1],
                row: 2,
                column: 7,
                row_span: 1,
                column_span: 6,
              },
            ],
          },
        ],
      },
    };
    render(
      <CardWebLayoutCanvas
        {...canvasProps({ layout: partiallyOccupiedLayout, onGeometryCommit })}
      />,
    );

    const fieldNode = screen.getByTestId("layout-field-field-name");
    const fieldGrid = fieldNode.closest<HTMLElement>("[data-layout-grid='fields']");
    expect(fieldGrid).not.toBeNull();
    mockGridRect(fieldGrid!, 1200, 200);
    installPointerCapture(fieldNode);

    dispatchPointer(fieldNode, "pointerdown", { pointerId: 123, clientX: 0, clientY: 0 });
    dispatchPointer(fieldNode, "pointermove", { pointerId: 123, clientX: 600, clientY: 100 });

    expect(fieldNode).toHaveStyle({
      gridColumn: "1 / span 6",
      gridRow: "2 / span 1",
    });
    expect(screen.getByRole("status")).toHaveClass("is-valid");

    dispatchPointer(fieldNode, "pointerup", { pointerId: 123, clientX: 600, clientY: 100 });

    expect(onGeometryCommit).toHaveBeenCalledWith({
      target: { id: fields[0].id, kind: "field" },
      before: { row: 1, column: 1, rowSpan: 1, columnSpan: 6 },
      after: { row: 2, column: 1, rowSpan: 1, columnSpan: 6 },
    });
  });

  test("shrinks only the moved field to the largest free width in the target row", () => {
    const onGeometryCommit = vi.fn();
    const narrowGapLayout: CardTemplateLayoutRead = {
      ...layout,
      form_layout: {
        ...layout.form_layout,
        sections: [
          {
            ...layout.form_layout.sections[0],
            row_span: 1,
            items: [
              {
                ...layout.form_layout.sections[0].items[0],
                row: 1,
                column: 1,
                row_span: 1,
                column_span: 6,
              },
              {
                ...layout.form_layout.sections[0].items[1],
                row: 2,
                column: 1,
                row_span: 1,
                column_span: 9,
              },
            ],
          },
        ],
      },
    };
    render(<CardWebLayoutCanvas {...canvasProps({ layout: narrowGapLayout, onGeometryCommit })} />);

    const fieldNode = screen.getByTestId("layout-field-field-name");
    const occupiedFieldNode = screen.getByTestId("layout-field-field-active");
    const fieldGrid = fieldNode.closest<HTMLElement>("[data-layout-grid='fields']");
    expect(fieldGrid).not.toBeNull();
    mockGridRect(fieldGrid!, 1200, 200);
    installPointerCapture(fieldNode);

    dispatchPointer(fieldNode, "pointerdown", { pointerId: 127, clientX: 0, clientY: 0 });
    dispatchPointer(fieldNode, "pointermove", { pointerId: 127, clientX: 0, clientY: 100 });

    expect(fieldNode).toHaveStyle({
      gridColumn: "10 / span 3",
      gridRow: "2 / span 1",
    });
    expect(occupiedFieldNode).toHaveStyle({
      gridColumn: "1 / span 9",
      gridRow: "2 / span 1",
    });
    expect(screen.getByRole("status")).toHaveClass("is-valid");

    dispatchPointer(fieldNode, "pointerup", { pointerId: 127, clientX: 0, clientY: 100 });

    expect(onGeometryCommit).toHaveBeenCalledWith({
      target: { id: fields[0].id, kind: "field" },
      before: { row: 1, column: 1, rowSpan: 1, columnSpan: 6 },
      after: { row: 2, column: 10, rowSpan: 1, columnSpan: 3 },
    });
  });

  test("prefers the narrow free interval under the pointer over the field's old space", () => {
    const onGeometryCommit = vi.fn();
    const sameRowGapLayout: CardTemplateLayoutRead = {
      ...layout,
      form_layout: {
        ...layout.form_layout,
        sections: [
          {
            ...layout.form_layout.sections[0],
            row_span: 1,
            items: [
              {
                ...layout.form_layout.sections[0].items[0],
                row: 1,
                column: 1,
                row_span: 1,
                column_span: 6,
              },
              {
                ...layout.form_layout.sections[0].items[1],
                row: 1,
                column: 7,
                row_span: 1,
                column_span: 3,
              },
            ],
          },
        ],
      },
    };
    render(
      <CardWebLayoutCanvas {...canvasProps({ layout: sameRowGapLayout, onGeometryCommit })} />,
    );

    const fieldNode = screen.getByTestId("layout-field-field-name");
    const occupiedFieldNode = screen.getByTestId("layout-field-field-active");
    const fieldGrid = fieldNode.closest<HTMLElement>("[data-layout-grid='fields']");
    expect(fieldGrid).not.toBeNull();
    mockGridRect(fieldGrid!, 1200, 100);
    installPointerCapture(fieldNode);

    dispatchPointer(fieldNode, "pointerdown", { pointerId: 129, clientX: 0, clientY: 0 });
    dispatchPointer(fieldNode, "pointermove", { pointerId: 129, clientX: 600, clientY: 0 });

    expect(fieldNode).toHaveStyle({
      gridColumn: "10 / span 3",
      gridRow: "1 / span 1",
    });
    expect(occupiedFieldNode).toHaveStyle({
      gridColumn: "7 / span 3",
      gridRow: "1 / span 1",
    });

    dispatchPointer(fieldNode, "pointerup", { pointerId: 129, clientX: 600, clientY: 0 });

    expect(onGeometryCommit).toHaveBeenCalledWith({
      target: { id: fields[0].id, kind: "field" },
      before: { row: 1, column: 1, rowSpan: 1, columnSpan: 6 },
      after: { row: 1, column: 10, rowSpan: 1, columnSpan: 3 },
    });
  });

  test("moves an upper field below a fully occupied intermediate row", () => {
    const onGeometryCommit = vi.fn();
    const fullRowField: FormFieldRead = {
      ...fields[0],
      id: "field-full-row",
      code: "full_row",
      label: "Полная строка",
      position: 2,
    };
    const layoutWithFullIntermediateRow: CardTemplateLayoutRead = {
      ...layout,
      structure: {
        ...layout.structure,
        fields: [...fields, fullRowField],
      },
      form_layout: {
        ...layout.form_layout,
        sections: [
          {
            ...layout.form_layout.sections[0],
            row_span: 1,
            items: [
              {
                ...layout.form_layout.sections[0].items[0],
                row: 1,
                column: 1,
                row_span: 1,
                column_span: 6,
              },
              {
                ...layout.form_layout.sections[0].items[1],
                row: 1,
                column: 7,
                row_span: 1,
                column_span: 6,
              },
              {
                id: fullRowField.id,
                kind: "field",
                field_id: fullRowField.id,
                row: 2,
                column: 1,
                row_span: 1,
                column_span: 12,
              },
            ],
          },
        ],
      },
    };
    render(
      <CardWebLayoutCanvas
        {...canvasProps({
          layout: layoutWithFullIntermediateRow,
          fields: [...fields, fullRowField],
          onGeometryCommit,
        })}
      />,
    );

    const fieldNode = screen.getByTestId("layout-field-field-name");
    const fieldGrid = fieldNode.closest<HTMLElement>("[data-layout-grid='fields']");
    expect(fieldGrid).not.toBeNull();
    mockGridRect(fieldGrid!, 1200, 200);
    installPointerCapture(fieldNode);

    dispatchPointer(fieldNode, "pointerdown", { pointerId: 126, clientX: 0, clientY: 0 });
    dispatchPointer(fieldNode, "pointermove", { pointerId: 126, clientX: 0, clientY: 100 });

    expect(fieldNode).toHaveStyle({
      gridColumn: "1 / span 6",
      gridRow: "3 / span 1",
    });
    expect(fieldGrid!.dataset.layoutGridRows).toBe("3");
    expect(fieldGrid!.style.minHeight).toBe("9rem");
    expect(screen.getByRole("status")).toHaveClass("is-valid");

    dispatchPointer(fieldNode, "pointermove", { pointerId: 126, clientX: 0, clientY: 100 });

    expect(fieldNode).toHaveStyle({
      gridColumn: "1 / span 6",
      gridRow: "3 / span 1",
    });

    dispatchPointer(fieldNode, "pointerup", { pointerId: 126, clientX: 0, clientY: 100 });

    expect(onGeometryCommit).toHaveBeenCalledWith({
      target: { id: fields[0].id, kind: "field" },
      before: { row: 1, column: 1, rowSpan: 1, columnSpan: 6 },
      after: { row: 3, column: 1, rowSpan: 1, columnSpan: 6 },
    });
  });

  test("moves a lower field above a fully occupied intermediate row", () => {
    const onGeometryCommit = vi.fn();
    const layoutWithFullIntermediateRow: CardTemplateLayoutRead = {
      ...layout,
      form_layout: {
        ...layout.form_layout,
        sections: [
          {
            ...layout.form_layout.sections[0],
            row_span: 1,
            items: [
              {
                ...layout.form_layout.sections[0].items[0],
                row: 4,
                column: 1,
                row_span: 1,
                column_span: 6,
              },
              {
                ...layout.form_layout.sections[0].items[1],
                row: 3,
                column: 1,
                row_span: 1,
                column_span: 12,
              },
            ],
          },
        ],
      },
    };
    render(
      <CardWebLayoutCanvas
        {...canvasProps({ layout: layoutWithFullIntermediateRow, onGeometryCommit })}
      />,
    );

    const fieldNode = screen.getByTestId("layout-field-field-name");
    const fieldGrid = fieldNode.closest<HTMLElement>("[data-layout-grid='fields']");
    expect(fieldGrid).not.toBeNull();
    mockGridRect(fieldGrid!, 1200, 400);
    installPointerCapture(fieldNode);

    dispatchPointer(fieldNode, "pointerdown", { pointerId: 128, clientX: 0, clientY: 300 });
    dispatchPointer(fieldNode, "pointermove", { pointerId: 128, clientX: 0, clientY: 200 });

    expect(fieldNode).toHaveStyle({
      gridColumn: "1 / span 6",
      gridRow: "2 / span 1",
    });
    expect(screen.getByRole("status")).toHaveClass("is-valid");

    dispatchPointer(fieldNode, "pointerup", { pointerId: 128, clientX: 0, clientY: 200 });

    expect(onGeometryCommit).toHaveBeenCalledWith({
      target: { id: fields[0].id, kind: "field" },
      before: { row: 4, column: 1, rowSpan: 1, columnSpan: 6 },
      after: { row: 2, column: 1, rowSpan: 1, columnSpan: 6 },
    });
  });

  test("keeps a moved field out of a row without enough free width", () => {
    const onGeometryCommit = vi.fn();
    const fullyOccupiedLayout: CardTemplateLayoutRead = {
      ...layout,
      form_layout: {
        ...layout.form_layout,
        sections: [
          {
            ...layout.form_layout.sections[0],
            row_span: 1,
            items: [
              {
                ...layout.form_layout.sections[0].items[0],
                row: 1,
                column: 1,
                row_span: 1,
                column_span: 6,
              },
              {
                ...layout.form_layout.sections[0].items[1],
                row: 4,
                column: 1,
                row_span: 1,
                column_span: 12,
              },
            ],
          },
        ],
      },
    };
    render(
      <CardWebLayoutCanvas {...canvasProps({ layout: fullyOccupiedLayout, onGeometryCommit })} />,
    );

    const fieldNode = screen.getByTestId("layout-field-field-name");
    const fieldGrid = fieldNode.closest<HTMLElement>("[data-layout-grid='fields']");
    expect(fieldGrid).not.toBeNull();
    mockGridRect(fieldGrid!, 1200, 400);
    installPointerCapture(fieldNode);

    dispatchPointer(fieldNode, "pointerdown", { pointerId: 124, clientX: 0, clientY: 0 });
    dispatchPointer(fieldNode, "pointermove", { pointerId: 124, clientX: 100, clientY: 200 });

    expect(fieldNode).toHaveStyle({
      gridColumn: "2 / span 6",
      gridRow: "3 / span 1",
    });
    expect(screen.getByRole("status")).toHaveClass("is-valid");

    dispatchPointer(fieldNode, "pointermove", { pointerId: 124, clientX: 100, clientY: 300 });

    expect(fieldNode).toHaveStyle({
      gridColumn: "2 / span 6",
      gridRow: "3 / span 1",
    });
    expect(screen.getByRole("status")).toHaveTextContent(
      "В выбранной строке нет свободного места для поля такого размера",
    );

    dispatchPointer(fieldNode, "pointerup", { pointerId: 124, clientX: 100, clientY: 300 });

    expect(onGeometryCommit).not.toHaveBeenCalled();
    expect(document.querySelector(".card-layout-geometry-session")).not.toBeInTheDocument();

    const otherFieldNode = screen.getByTestId("layout-field-field-active");
    fireEvent.click(otherFieldNode);
    expect(within(otherFieldNode).getByLabelText("Название поля")).toBeInTheDocument();
  });

  test("keeps an out-of-grid field preview out of an occupied row", () => {
    const onGeometryCommit = vi.fn();
    const occupiedTopRowLayout: CardTemplateLayoutRead = {
      ...layout,
      form_layout: {
        ...layout.form_layout,
        sections: [
          {
            ...layout.form_layout.sections[0],
            row_span: 1,
            items: [
              {
                ...layout.form_layout.sections[0].items[0],
                row: 2,
                column: 1,
                row_span: 1,
                column_span: 12,
              },
              {
                ...layout.form_layout.sections[0].items[1],
                row: 1,
                column: 7,
                row_span: 1,
                column_span: 6,
              },
            ],
          },
        ],
      },
    };
    render(
      <CardWebLayoutCanvas {...canvasProps({ layout: occupiedTopRowLayout, onGeometryCommit })} />,
    );

    const fieldNode = screen.getByTestId("layout-field-field-name");
    const fieldGrid = fieldNode.closest<HTMLElement>("[data-layout-grid='fields']");
    expect(fieldGrid).not.toBeNull();
    mockGridRect(fieldGrid!, 1200, 200);
    installPointerCapture(fieldNode);

    dispatchPointer(fieldNode, "pointerdown", { pointerId: 125, clientX: 0, clientY: 100 });
    dispatchPointer(fieldNode, "pointermove", { pointerId: 125, clientX: 0, clientY: -100 });

    expect(fieldNode).toHaveStyle({
      gridColumn: "1 / span 12",
      gridRow: "2 / span 1",
    });
    expect(screen.getByRole("status")).toHaveTextContent("Объект выходит за границы сетки 12 × 4");

    dispatchPointer(fieldNode, "pointerup", { pointerId: 125, clientX: 0, clientY: -100 });

    expect(onGeometryCommit).not.toHaveBeenCalled();
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

  test("supports documented Shift plus arrow field resizing with one Done commit", async () => {
    const user = userEvent.setup();
    const onGeometryCommit = vi.fn();
    render(<CardWebLayoutCanvas {...canvasProps({ onGeometryCommit })} />);
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

    expect(
      screen.queryByRole("button", { name: /Изменить размер блока ФИО:/ }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Изменить размер поля Имя:/ })).toHaveLength(8);

    const canvas = screen.getByTestId("card-layout-canvas");
    const resizeHandle = screen.getByRole("button", {
      name: "Изменить размер поля Имя: нижний правый угол",
    });
    mockGridRect(canvas);
    installPointerCapture(resizeHandle);
    dispatchPointer(resizeHandle, "pointerdown", { pointerId: 45, clientX: 0, clientY: 0 });
    dispatchPointer(resizeHandle, "pointermove", { pointerId: 45, clientX: 100, clientY: 0 });

    expect(
      screen.queryByRole("button", { name: /Изменить размер блока ФИО:/ }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Изменить размер поля Имя:/ })).toHaveLength(8);
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
    const resizeHandle = screen.getByRole("button", {
      name: "Изменить размер поля Имя: нижний правый угол",
    });
    mockGridRect(canvas);
    const capture = installPointerCapture(resizeHandle);

    dispatchPointer(resizeHandle, "pointerdown", { pointerId: 47, clientX: 100, clientY: 50 });
    dispatchPointer(resizeHandle, "pointerup", { pointerId: 47, clientX: 100, clientY: 50 });

    expect(capture.releasePointerCapture).toHaveBeenCalledWith(47);
    expect(onGeometryCommit).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("region", { name: "Предпросмотр веб-карточки" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Изменить размер блока ФИО:/ }),
    ).not.toBeInTheDocument();
  });

  test("keeps the idle canvas contextual with one bottom block creation action", () => {
    const onCreateBlock = vi.fn();
    render(<CardWebLayoutCanvas {...canvasProps({ onCreateBlock })} />);

    expect(screen.queryByText("Свойства элемента")).not.toBeInTheDocument();
    expect(screen.queryByText("Палитра типов полей")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Создать блок" })).toBeInTheDocument();
    expect(screen.queryByText("Вставить существующий блок")).not.toBeInTheDocument();
    expect(screen.queryByTestId("card-layout-empty-area")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Создать блок" }));
    expect(onCreateBlock).toHaveBeenCalledWith();
    expect(
      within(screen.getByTestId("layout-block-block-fio")).getByRole("button", {
        name: "Создать поле в блоке ФИО",
      }),
    ).toBeInTheDocument();
  });

  test("does not expose block resize diagnostics in design mode", () => {
    render(<CardWebLayoutCanvas {...canvasProps({ showGeometryDiagnostics: true })} />);

    expect(screen.queryByLabelText(/Размер блока:/)).not.toBeInTheDocument();
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

  test("renders the compact field editor and preserves hidden technical data", async () => {
    const user = userEvent.setup();
    const onCommitField = vi.fn();
    const describedField = {
      ...fields[0],
      description: "Укажите полное значение",
      required_mode: "required",
    };
    render(
      <CardWebLayoutCanvas
        {...canvasProps({
          fields: [describedField, fields[1]],
          onCommitField,
        })}
      />,
    );

    await user.click(screen.getByTestId("layout-field-field-name"));

    expect(screen.queryByLabelText("Технический код")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Описание поля")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Подсказка")).toHaveValue("Укажите полное значение");

    const mandatory = screen.getByLabelText("Обязательность");
    expect(
      within(mandatory)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["Необязательное поле", "Обязательное поле"]);
    expect(mandatory).toHaveValue("required_on_publish");

    expect(screen.queryByText("Публичное редактирование")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Удалить поле" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(onCommitField).toHaveBeenCalledWith(
      expect.objectContaining({
        code: fields[0].code,
        description: "Укажите полное значение",
        required_mode: "required_on_publish",
      }),
    );
  });

  test("commits the Russian-text validation rule configured in the field editor", async () => {
    const user = userEvent.setup();
    const onCommitField = vi.fn();
    render(<CardWebLayoutCanvas {...canvasProps({ onCommitField })} />);

    await user.click(screen.getByTestId("layout-field-field-name"));
    await user.click(screen.getByText("Проверка значения"));
    await user.click(screen.getByRole("button", { name: "Создать условие" }));
    await user.clear(screen.getByLabelText("Подсказка при ошибке"));
    await user.type(screen.getByLabelText("Подсказка при ошибке"), "Введите ФИО русскими буквами");
    await user.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(onCommitField).toHaveBeenCalledWith(
      expect.objectContaining({
        validation_json: [
          {
            kind: "russian_text",
            message: "Введите ФИО русскими буквами",
            input_mode: "show_error",
          },
        ],
      }),
    );
  });

  test("shows regex pattern and message controls for a regex validation rule", async () => {
    const user = userEvent.setup();
    const onCommitField = vi.fn();
    render(<CardWebLayoutCanvas {...canvasProps({ onCommitField })} />);

    await user.click(screen.getByTestId("layout-field-field-name"));
    await user.click(screen.getByText("Проверка значения"));
    await user.click(screen.getByRole("button", { name: "Создать условие" }));
    await user.selectOptions(screen.getByLabelText("Тип проверки"), "regex");
    fireEvent.change(screen.getByLabelText("Регулярное выражение"), {
      target: { value: "[А-Я]{2}" },
    });
    await user.clear(screen.getByLabelText("Подсказка при ошибке"));
    await user.type(screen.getByLabelText("Подсказка при ошибке"), "Введите две заглавные буквы");
    await user.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(onCommitField).toHaveBeenCalledWith(
      expect.objectContaining({
        validation_json: [
          {
            kind: "regex",
            pattern: "[А-Я]{2}",
            message: "Введите две заглавные буквы",
            input_mode: "show_error",
          },
        ],
      }),
    );
  });

  test("clears a text validation rule when the field type changes", async () => {
    const user = userEvent.setup();
    const onCommitField = vi.fn();
    render(
      <CardWebLayoutCanvas
        {...canvasProps({
          fields: [
            {
              ...fields[0],
              validation_json: {
                kind: "russian_text",
                message: "Введите текст русскими буквами",
              },
            },
            fields[1],
          ],
          onCommitField,
        })}
      />,
    );

    await user.click(screen.getByTestId("layout-field-field-name"));
    expect(screen.getByText("Проверка значения")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Тип поля"), "date");
    expect(screen.queryByText("Проверка значения")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(onCommitField).toHaveBeenCalledWith(
      expect.objectContaining({ field_type: "date", validation_json: null }),
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

  test("keeps the field draft while opening and leaving inline reference creation", async () => {
    const user = userEvent.setup();
    const onCommitField = vi.fn();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <CardWebLayoutCanvas
          {...canvasProps({
            onCommitField,
            inlineReferenceEditorContext: {
              token: "token",
              registryId: "registry-1",
              onReferenceDataChanged: vi.fn(),
            },
          })}
        />
      </QueryClientProvider>,
    );

    await user.click(screen.getByTestId("layout-field-field-name"));
    await user.clear(screen.getByLabelText("Название поля"));
    await user.type(screen.getByLabelText("Название поля"), "Статус заявки");
    await user.type(screen.getByLabelText("Подсказка"), "Выберите статус");
    await user.selectOptions(screen.getByLabelText("Тип поля"), "select");
    await user.click(screen.getByRole("button", { name: "Создать новый" }));

    expect(
      screen.getByRole("region", { name: "Редактор справочника для поля" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Название поля")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("card-layout-canvas"));
    expect(onCommitField).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Назад" }));
    expect(screen.getByLabelText("Название поля")).toHaveValue("Статус заявки");
    expect(screen.getByLabelText("Подсказка")).toHaveValue("Выберите статус");
  });

  test("opens a newly created reference list for management immediately", async () => {
    const user = userEvent.setup();
    const createdReferenceList = {
      id: "reference-created",
      registry_id: "registry-1",
      owner_organization_id: null,
      code: "statusy",
      name: "Статусы",
      description: null,
      inherit_to_descendants: false,
      locked_for_descendants: false,
      managed_by_system_only: false,
      is_active: true,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
        init?.method === "POST"
          ? Response.json(createdReferenceList)
          : Response.json({ items: [] }),
      ),
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <CardWebLayoutCanvas
          {...canvasProps({
            inlineReferenceEditorContext: {
              token: "token",
              registryId: "registry-1",
              onReferenceDataChanged: vi.fn(),
            },
          })}
        />
      </QueryClientProvider>,
    );

    await user.click(screen.getByTestId("layout-field-field-name"));
    await user.selectOptions(screen.getByLabelText("Тип поля"), "select");
    await user.click(screen.getByRole("button", { name: "Создать новый" }));
    await user.type(screen.getByLabelText("Название справочника"), "Статусы");
    await user.click(screen.getByRole("button", { name: "Создать справочник" }));

    expect(await screen.findByDisplayValue("Статусы")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Назад" }));
    expect(screen.getByLabelText("Справочник")).toHaveValue(createdReferenceList.id);
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

  test("closes field editing with Escape without archiving the field", async () => {
    const user = userEvent.setup();
    const onCancelField = vi.fn();
    render(<CardWebLayoutCanvas {...canvasProps({ onCancelField })} />);

    await user.click(screen.getByTestId("layout-field-field-name"));
    await user.keyboard("{Escape}");

    expect(onCancelField).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Название поля")).not.toBeInTheDocument();
  });

  test("archives a field from the inline editor", async () => {
    const user = userEvent.setup();
    const onCancelField = vi.fn();
    render(<CardWebLayoutCanvas {...canvasProps({ onCancelField })} />);

    await user.click(screen.getByTestId("layout-field-field-name"));
    await user.click(screen.getByRole("button", { name: "Удалить поле" }));

    expect(onCancelField).toHaveBeenCalledWith(fields[0].id);
    expect(screen.queryByLabelText("Название поля")).not.toBeInTheDocument();
  });

  test("keeps field geometry diagnostics without design-mode block diagnostics", () => {
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
    expect(screen.queryByTestId("layout-block-block-fio-geometry")).not.toBeInTheDocument();
    expect(screen.getByTestId("layout-field-field-name-geometry")).toHaveTextContent("9 × 1");
  });

  test("renders caller-normalized blocks as sequential full-width rows", () => {
    const normalizedLayout: CardTemplateLayoutRead = {
      ...layout,
      form_layout: normalizeWebBlockSections({
        ...layout.form_layout,
        sections: [
          {
            ...layout.form_layout.sections[0],
            id: "section-a",
            row: 3,
            column: 7,
            row_span: 2,
            column_span: 6,
          },
          {
            ...layout.form_layout.sections[0],
            id: "section-b",
            row: 1,
            column: 10,
            row_span: 1,
            column_span: 3,
          },
          {
            ...layout.form_layout.sections[0],
            id: "section-c",
            row: 2,
            column: 1,
            row_span: 1,
            column_span: 9,
          },
        ],
      }),
    };

    render(<CardWebLayoutCanvas {...canvasProps({ layout: normalizedLayout })} />);

    expect(screen.getByTestId("layout-block-section-b")).toHaveStyle({
      gridColumn: "1 / span 12",
      gridRow: "1 / span 1",
    });
    expect(screen.getByTestId("layout-block-section-c")).toHaveStyle({
      gridColumn: "1 / span 12",
      gridRow: "2 / span 1",
    });
    expect(screen.getByTestId("layout-block-section-a")).toHaveStyle({
      gridColumn: "1 / span 12",
      gridRow: "3 / span 1",
    });
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
    expect(screen.queryByRole("button", { name: "Создать блок" })).not.toBeInTheDocument();

    rerender(
      <CardWebLayoutCanvas
        {...canvasProps({ mode: "public-edit", renderFieldValue: publicFieldRenderer })}
      />,
    );
    expect(screen.getByRole("button", { name: "Изменить значение Имя" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Изменить поле Имя" })).not.toBeInTheDocument();
  });

  test("keeps compact field and reference editors inside their field width", () => {
    expect(globalStyles).toMatch(
      /\.card-layout-inline-editor\s*{[^}]*min-width:\s*0[^}]*width:\s*100%/,
    );
    expect(globalStyles).toMatch(
      /\.card-layout-inline-editor \.row-actions\s*{[^}]*flex-wrap:\s*wrap/,
    );
    expect(globalStyles).toMatch(
      /\.inline-reference-item\s*{[^}]*min-width:\s*0[^}]*overflow-wrap:\s*anywhere/,
    );
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

    expect(screen.queryByRole("button", { name: "Создать блок" })).not.toBeInTheDocument();
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
  test("renders stored work-experience display text in the generic readonly layout node", () => {
    const experienceField: FormFieldRead = {
      ...fields[0],
      id: "field-experience",
      code: "experience",
      label: "Стаж работы",
      field_type: "work_experience",
    };
    const experienceLayout: CardTemplateLayoutRead = {
      ...layout,
      structure: { blocks: [block], fields: [experienceField] },
      form_layout: {
        ...layout.form_layout,
        sections: [
          {
            ...layout.form_layout.sections[0],
            items: [
              {
                ...layout.form_layout.sections[0].items[0],
                id: "field-experience",
                field_id: "field-experience",
              },
            ],
          },
        ],
      },
    };

    render(
      <CardLayoutRenderer
        {...canvasProps({
          layout: experienceLayout,
          blocks: [block],
          fields: [experienceField],
          mode: "readonly",
          fieldValues: {
            "field-experience": {
              days: 16,
              months: 3,
              years: 9,
              display: "16 дней 3 месяца 9 лет",
            },
          },
        })}
      />,
    );

    const node = screen.getByTestId("layout-field-field-experience");
    expect(node).toHaveTextContent("16 дней 3 месяца 9 лет");
    expect(node).not.toHaveTextContent('"days"');
    expect(node.querySelector("a")).toBeNull();
  });

  test("renders completion presentation metadata without changing the layout", () => {
    render(
      <CardLayoutRenderer
        {...canvasProps({ mode: "readonly" })}
        blockPresentation={() => ({
          anchorId: "card-block-primary-fio",
          state: "attention",
          description: "Нужно заполнить 1 из 2 полей",
        })}
        fieldPresentation={() => ({
          state: "required-missing",
          description: "Нужно заполнить обязательное поле",
        })}
      />,
    );

    expect(screen.getByLabelText("Блок ФИО")).toHaveAttribute("id", "card-block-primary-fio");
    expect(screen.getByLabelText("Блок ФИО")).toHaveClass("is-attention");
    expect(screen.getByTestId("layout-field-field-name")).toHaveClass("is-required-missing");
    expect(screen.getByTestId("layout-field-field-name")).toHaveAccessibleDescription(
      "Нужно заполнить обязательное поле",
    );
  });

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
