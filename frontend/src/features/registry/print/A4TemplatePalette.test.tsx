import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";

import { A4TemplatePalette } from "./A4TemplatePalette";

test("adds the derived FIO metadata token for a print layout", async () => {
  const onAddMetadata = vi.fn();
  const noop = () => {};
  render(
    <A4TemplatePalette
      blocks={[]}
      fields={[]}
      showTechnicalData={false}
      onAddExistingBlock={noop}
      onAddExistingField={noop}
      onAddHeading={noop}
      onAddStaticText={noop}
      onAddPanel={noop}
      onAddRectangle={noop}
      onAddDivider={noop}
      onAddPrintDate={noop}
      onAddPageNumber={noop}
      onAddMetadata={onAddMetadata}
      onOpenNewField={noop}
      onOpenNewBlock={noop}
    />,
  );
  await userEvent.click(screen.getByRole("button", { name: "ФИО" }));
  expect(onAddMetadata).toHaveBeenCalledWith("card.display_value");
  expect(screen.queryByText("Название карточки")).not.toBeInTheDocument();
});
