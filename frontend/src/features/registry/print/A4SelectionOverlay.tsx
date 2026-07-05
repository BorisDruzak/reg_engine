type A4SelectionOverlayProps = {
  selected: boolean;
  hovered?: boolean;
};

export function A4SelectionOverlay({ selected, hovered = false }: A4SelectionOverlayProps) {
  if (!selected && !hovered) {
    return null;
  }
  return (
    <span
      className={[
        "a4-selection-overlay",
        selected ? "is-selected" : "",
        hovered ? "is-hovered" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-hidden="true"
    />
  );
}
