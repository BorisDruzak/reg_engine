import type { PointerEvent } from "react";

export const A4_RESIZE_HANDLE_EDGES = [
  "top-left",
  "top",
  "top-right",
  "right",
  "bottom-right",
  "bottom",
  "bottom-left",
  "left",
] as const;

type A4ResizeHandlesProps = {
  onResizeStart: (event: PointerEvent<HTMLSpanElement>, edge: string) => void;
};

export function A4ResizeHandles({ onResizeStart }: A4ResizeHandlesProps) {
  return (
    <span className="a4-resize-handles" aria-hidden="true">
      {A4_RESIZE_HANDLE_EDGES.map((edge) => (
        <span
          key={edge}
          className={`a4-resize-handle a4-resize-handle--${edge}`}
          onPointerDown={(event) => onResizeStart(event, edge)}
        />
      ))}
    </span>
  );
}
