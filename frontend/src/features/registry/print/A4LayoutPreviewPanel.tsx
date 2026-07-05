import type { ReactNode } from "react";

type A4LayoutPreviewPanelProps = {
  children: ReactNode;
};

export function A4LayoutPreviewPanel({ children }: A4LayoutPreviewPanelProps) {
  return (
    <section className="a4-layout-preview-panel" aria-label="Предпросмотр печатной формы">
      {children}
    </section>
  );
}
