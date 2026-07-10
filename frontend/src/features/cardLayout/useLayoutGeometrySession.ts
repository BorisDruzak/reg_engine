import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";

import type { CardTemplateLayoutRead } from "@/api/types";

import { moveRect, resizeRect } from "./layoutGeometry";
import type { LayoutRect, ResizeHandle } from "./layoutGeometry";

export type LayoutGeometryTargetKind = "block" | "field";

export type LayoutGeometrySession = {
  targetId: string;
  targetKind: LayoutGeometryTargetKind;
  operation: "move" | "resize";
  original: LayoutRect;
  preview: LayoutRect;
  handle?: ResizeHandle;
};

export type LayoutGeometryTarget = {
  targetId: string;
  targetKind: LayoutGeometryTargetKind;
  original: LayoutRect;
};

export type LayoutGeometryCommand = {
  target: { id: string; kind: LayoutGeometryTargetKind };
  before: LayoutRect;
  after: LayoutRect;
};

export type LayoutGeometryValidation = {
  isValid: boolean;
  message: string;
};

type PointerCaptureSession = {
  pointerId: number;
  captureTarget: HTMLElement;
  base: LayoutRect;
  startX: number;
  startY: number;
  columnWidth: number;
  rowHeight: number;
};

type UseLayoutGeometrySessionOptions = {
  onCommit: (command: LayoutGeometryCommand) => void;
  validate: (session: LayoutGeometrySession) => string | null;
};

const GRID_COLUMNS = 12;
const GRID_ROWS = 4;
const OUT_OF_GRID_MESSAGE = "Объект выходит за границы сетки 12 × 4.";
const INVALID_SIZE_MESSAGE = "Размер объекта должен занимать хотя бы одну четверть сетки.";

export function useLayoutGeometrySession({ onCommit, validate }: UseLayoutGeometrySessionOptions) {
  const [session, setSession] = useState<LayoutGeometrySession | null>(null);
  const [boundaryReason, setBoundaryReason] = useState<string | null>(null);
  const sessionActive = session !== null;
  const sessionRef = useRef<LayoutGeometrySession | null>(null);
  const boundaryReasonRef = useRef<string | null>(null);
  const pointerRef = useRef<PointerCaptureSession | null>(null);

  const publish = useCallback(
    (nextSession: LayoutGeometrySession, nextBoundaryReason: string | null = null) => {
      sessionRef.current = nextSession;
      boundaryReasonRef.current = nextBoundaryReason;
      setSession(nextSession);
      setBoundaryReason(nextBoundaryReason);
    },
    [],
  );

  const releasePointer = useCallback(() => {
    const pointer = pointerRef.current;
    if (!pointer) {
      return;
    }
    pointerRef.current = null;
    if (typeof pointer.captureTarget.releasePointerCapture === "function") {
      try {
        pointer.captureTarget.releasePointerCapture(pointer.pointerId);
      } catch {
        // The browser may have released capture after the pointer left the document.
      }
    }
  }, []);

  const clear = useCallback(() => {
    sessionRef.current = null;
    boundaryReasonRef.current = null;
    setSession(null);
    setBoundaryReason(null);
  }, []);

  const cancel = useCallback(() => {
    releasePointer();
    clear();
  }, [clear, releasePointer]);

  const commit = useCallback(() => {
    const current = sessionRef.current;
    if (!current) {
      return false;
    }
    const reason = boundaryReasonRef.current ?? validate(current);
    if (reason) {
      return false;
    }
    releasePointer();
    if (rectEquals(current.original, current.preview)) {
      clear();
      return false;
    }
    clear();
    onCommit({
      target: { id: current.targetId, kind: current.targetKind },
      before: current.original,
      after: current.preview,
    });
    return true;
  }, [clear, onCommit, releasePointer, validate]);

  const beginPointer = useCallback(
    (
      event: ReactPointerEvent<HTMLElement>,
      target: LayoutGeometryTarget,
      gridElement: HTMLElement,
      operation: "move" | "resize",
      handle?: ResizeHandle,
    ) => {
      if (pointerRef.current) {
        return;
      }
      const existing = sessionRef.current;
      if (
        existing &&
        (existing.targetId !== target.targetId || existing.targetKind !== target.targetKind)
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const gridRect = gridElement.getBoundingClientRect();
      const pointerId = event.pointerId;
      const captureTarget = event.currentTarget;
      const base = existing?.preview ?? target.original;
      const nextPointer = {
        pointerId,
        captureTarget,
        base,
        startX: event.clientX,
        startY: event.clientY,
        columnWidth: gridRect.width > 0 ? gridRect.width / GRID_COLUMNS : 1,
        rowHeight: gridRect.height > 0 ? gridRect.height / GRID_ROWS : 1,
      };
      captureTarget.focus();
      pointerRef.current = nextPointer;
      if (typeof captureTarget.setPointerCapture === "function") {
        try {
          captureTarget.setPointerCapture(pointerId);
        } catch {
          if (pointerRef.current === nextPointer) {
            pointerRef.current = null;
          }
          return;
        }
      }
      if (pointerRef.current !== nextPointer) {
        return;
      }
      publish({
        targetId: existing?.targetId ?? target.targetId,
        targetKind: existing?.targetKind ?? target.targetKind,
        operation,
        original: existing?.original ?? target.original,
        preview: base,
        ...(handle ? { handle } : {}),
      });
    },
    [publish],
  );

  const beginMove = useCallback(
    (
      event: ReactPointerEvent<HTMLElement>,
      target: LayoutGeometryTarget,
      gridElement: HTMLElement,
    ) => beginPointer(event, target, gridElement, "move"),
    [beginPointer],
  );

  const beginResize = useCallback(
    (
      event: ReactPointerEvent<HTMLElement>,
      target: LayoutGeometryTarget,
      handle: ResizeHandle,
      gridElement: HTMLElement,
    ) => beginPointer(event, target, gridElement, "resize", handle),
    [beginPointer],
  );

  const pointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const pointer = pointerRef.current;
      const current = sessionRef.current;
      if (!pointer || !current || event.pointerId !== pointer.pointerId) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const columnDelta = Math.round((event.clientX - pointer.startX) / pointer.columnWidth);
      const rowDelta = Math.round((event.clientY - pointer.startY) / pointer.rowHeight);
      if (current.operation === "move") {
        const requestedColumn = pointer.base.column + columnDelta;
        const requestedRow = pointer.base.row + rowDelta;
        const nextSession = {
          ...current,
          preview: moveRect(pointer.base, requestedColumn, requestedRow),
        };
        publish(
          nextSession,
          isMoveOutOfGrid(pointer.base, requestedColumn, requestedRow) ? OUT_OF_GRID_MESSAGE : null,
        );
        return;
      }
      const handle = current.handle ?? "bottom-right";
      const requested = requestedResize(pointer.base, handle, columnDelta, rowDelta);
      publish(
        {
          ...current,
          preview: resizeRect(pointer.base, handle, requested.columnSpan, requested.rowSpan),
        },
        requested.invalidReason,
      );
    },
    [publish],
  );

  const pointerUp = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const pointer = pointerRef.current;
      if (!pointer || event.pointerId !== pointer.pointerId) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      releasePointer();
      const current = sessionRef.current;
      if (current && rectEquals(current.original, current.preview)) {
        clear();
        return;
      }
      commit();
    },
    [clear, commit, releasePointer],
  );

  const pointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const pointer = pointerRef.current;
      if (!pointer || event.pointerId !== pointer.pointerId) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      cancel();
    },
    [cancel],
  );

  const lostPointerCapture = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const pointer = pointerRef.current;
      if (
        !pointer ||
        event.pointerId !== pointer.pointerId ||
        event.currentTarget !== pointer.captureTarget
      ) {
        return;
      }
      event.stopPropagation();
      pointerRef.current = null;
      clear();
    },
    [clear],
  );

  const keyboard = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>, target: LayoutGeometryTarget) => {
      const direction = arrowDirection(event.key);
      if (!direction) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const current = sessionRef.current;
      if (
        current &&
        (current.targetId !== target.targetId || current.targetKind !== target.targetKind)
      ) {
        return;
      }
      const base: LayoutGeometrySession = current ?? {
        targetId: target.targetId,
        targetKind: target.targetKind,
        operation: event.shiftKey ? "resize" : "move",
        original: target.original,
        preview: target.original,
        ...(event.shiftKey ? { handle: "bottom-right" as const } : {}),
      };
      if (event.shiftKey) {
        const horizontalDelta = direction.column * 3;
        const verticalDelta = direction.row;
        const requested = requestedResize(
          base.preview,
          "bottom-right",
          horizontalDelta,
          verticalDelta,
        );
        publish(
          {
            ...base,
            operation: "resize",
            handle: "bottom-right",
            preview: resizeRect(
              base.preview,
              "bottom-right",
              requested.columnSpan,
              requested.rowSpan,
            ),
          },
          requested.invalidReason,
        );
        return;
      }
      const requestedColumn = base.preview.column + direction.column;
      const requestedRow = base.preview.row + direction.row;
      publish(
        {
          ...base,
          operation: "move",
          handle: undefined,
          preview: moveRect(base.preview, requestedColumn, requestedRow),
        },
        isMoveOutOfGrid(base.preview, requestedColumn, requestedRow) ? OUT_OF_GRID_MESSAGE : null,
      );
    },
    [publish],
  );

  useEffect(() => {
    if (!sessionActive) {
      return;
    }
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        cancel();
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [cancel, sessionActive]);

  const invalidReason = session ? (boundaryReason ?? validate(session)) : null;

  return {
    beginMove,
    beginResize,
    cancel,
    commit,
    keyboard,
    lostPointerCapture,
    pointerCancel,
    pointerMove,
    pointerUp,
    previewRect: session?.preview ?? null,
    session,
    validation: {
      isValid: !invalidReason,
      message: invalidReason ?? "Область свободна. Положение можно сохранить.",
    } satisfies LayoutGeometryValidation,
  };
}

export type LayoutGeometryControls = ReturnType<typeof useLayoutGeometrySession>;

export function applyLayoutGeometryPreview(
  layout: CardTemplateLayoutRead,
  session: LayoutGeometrySession | null,
): CardTemplateLayoutRead {
  if (!session) {
    return layout;
  }
  return {
    ...layout,
    form_layout: {
      ...layout.form_layout,
      sections: layout.form_layout.sections.map((section) => {
        if (session.targetKind === "block" && section.id === session.targetId) {
          return { ...section, ...toApiRect(session.preview) };
        }
        if (session.targetKind !== "field") {
          return section;
        }
        let changed = false;
        const items = section.items.map((item) => {
          if (item.id !== session.targetId) {
            return item;
          }
          changed = true;
          return { ...item, ...toApiRect(session.preview) };
        });
        return changed ? { ...section, items } : section;
      }),
    },
  };
}

function isMoveOutOfGrid(rect: LayoutRect, column: number, row: number) {
  return (
    column < 1 ||
    row < 1 ||
    column + rect.columnSpan > GRID_COLUMNS + 1 ||
    row + rect.rowSpan > GRID_ROWS + 1
  );
}

function requestedResize(
  rect: LayoutRect,
  handle: ResizeHandle,
  columnDelta: number,
  rowDelta: number,
) {
  const left = handle.includes("left") ? rect.column + columnDelta : rect.column;
  const right = handle.includes("right")
    ? rect.column + rect.columnSpan + columnDelta
    : rect.column + rect.columnSpan;
  const top = handle.includes("top") ? rect.row + rowDelta : rect.row;
  const bottom = handle.includes("bottom")
    ? rect.row + rect.rowSpan + rowDelta
    : rect.row + rect.rowSpan;
  const columnSpan = right - left;
  const rowSpan = bottom - top;
  const invalidReason =
    left < 1 || top < 1 || right > GRID_COLUMNS + 1 || bottom > GRID_ROWS + 1
      ? OUT_OF_GRID_MESSAGE
      : columnSpan < 1 || rowSpan < 1
        ? INVALID_SIZE_MESSAGE
        : null;
  return { columnSpan, rowSpan, invalidReason };
}

function arrowDirection(key: string) {
  switch (key) {
    case "ArrowLeft":
      return { column: -1, row: 0 };
    case "ArrowRight":
      return { column: 1, row: 0 };
    case "ArrowUp":
      return { column: 0, row: -1 };
    case "ArrowDown":
      return { column: 0, row: 1 };
    default:
      return null;
  }
}

function rectEquals(left: LayoutRect, right: LayoutRect) {
  return (
    left.row === right.row &&
    left.column === right.column &&
    left.rowSpan === right.rowSpan &&
    left.columnSpan === right.columnSpan
  );
}

function toApiRect(rect: LayoutRect) {
  return {
    row: rect.row,
    column: rect.column,
    row_span: rect.rowSpan,
    column_span: rect.columnSpan,
  };
}
