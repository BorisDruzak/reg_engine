import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { BrandMark } from "./BrandMark";

test("renders the supplied registry logo with Russian alternative text", () => {
  render(<BrandMark />);

  expect(screen.getByRole("img", { name: "Логотип Реестровой системы" })).toHaveClass(
    "brand-mark-image",
  );
});
