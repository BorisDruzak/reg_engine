import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import registryBackground from "@/assets/branding/registry-background.png";

import { BrandMark } from "./BrandMark";

test("renders the supplied registry logo with Russian alternative text", () => {
  render(<BrandMark />);

  expect(screen.getByRole("img", { name: "Логотип Реестровой системы" })).toHaveClass(
    "brand-mark-image",
  );
});

test("bundles the supplied global background asset", () => {
  expect(registryBackground).toContain("registry-background");
});
