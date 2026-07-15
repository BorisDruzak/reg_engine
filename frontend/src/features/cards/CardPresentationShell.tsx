import type { PropsWithChildren, ReactNode } from "react";

import { CardBlockNavigator } from "./CardBlockNavigator";
import type { CardBlockNavigationItem } from "./CardBlockNavigator";

type CardPresentationShellProps = PropsWithChildren<{
  items: readonly CardBlockNavigationItem[];
  beforeContent?: ReactNode;
  navigatorAction?: ReactNode;
}>;

export function CardPresentationShell({
  items,
  beforeContent,
  navigatorAction,
  children,
}: CardPresentationShellProps) {
  return (
    <div className="card-presentation-shell">
      <aside className="card-presentation-sidebar">
        <CardBlockNavigator items={items} />
        {navigatorAction}
      </aside>
      <div className="card-presentation-content">
        {beforeContent}
        {children}
      </div>
    </div>
  );
}
