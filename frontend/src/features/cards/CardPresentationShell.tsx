import type { PropsWithChildren, ReactNode } from "react";

import { CardBlockNavigator } from "./CardBlockNavigator";
import type { CardBlockNavigationItem } from "./CardBlockNavigator";

type CardPresentationShellProps = PropsWithChildren<{
  items: readonly CardBlockNavigationItem[];
  beforeContent?: ReactNode;
}>;

export function CardPresentationShell({
  items,
  beforeContent,
  children,
}: CardPresentationShellProps) {
  return (
    <div className="card-presentation-shell">
      <CardBlockNavigator items={items} />
      <div className="card-presentation-content">
        {beforeContent}
        {children}
      </div>
    </div>
  );
}
