import type { PropsWithChildren } from "react";

import { CardBlockNavigator } from "./CardBlockNavigator";
import type { CardBlockNavigationItem } from "./CardBlockNavigator";

type CardPresentationShellProps = PropsWithChildren<{
  items: readonly CardBlockNavigationItem[];
}>;

export function CardPresentationShell({ items, children }: CardPresentationShellProps) {
  return (
    <div className="card-presentation-shell">
      <CardBlockNavigator items={items} />
      <div className="card-presentation-content">{children}</div>
    </div>
  );
}
