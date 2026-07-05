import type { ReactNode } from "react";

type A4LayoutSettingsPanelProps = {
  children: ReactNode;
};

export function A4LayoutSettingsPanel({ children }: A4LayoutSettingsPanelProps) {
  return (
    <aside className="a4-layout-settings-panel" aria-label="Настройки шаблона">
      {children}
    </aside>
  );
}
