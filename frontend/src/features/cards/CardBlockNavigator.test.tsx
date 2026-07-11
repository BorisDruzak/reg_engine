import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import { CardBlockNavigator } from "./CardBlockNavigator";

const items = [
  {
    anchorId: "card-block-primary-employment",
    label: "Положение",
    state: "attention" as const,
    filledCount: 2,
    totalCount: 4,
    requiredMissingCount: 2,
  },
  {
    anchorId: "card-block-primary-contact",
    label: "Контакты",
    state: "complete" as const,
    filledCount: 3,
    totalCount: 3,
    requiredMissingCount: 0,
  },
];

describe("CardBlockNavigator", () => {
  afterEach(() => vi.restoreAllMocks());

  test("moves the document to the selected block and exposes text status", async () => {
    const user = userEvent.setup();
    const scrollIntoView = vi.fn();
    vi.spyOn(document, "getElementById").mockReturnValue({ scrollIntoView } as never);

    render(<CardBlockNavigator items={items} />);

    await user.click(screen.getByRole("button", { name: "Положение: нужно заполнить 2 из 4" }));

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
    expect(screen.getByText("Нужно заполнить")).toBeInTheDocument();
    expect(screen.getByText("Заполнено")).toBeInTheDocument();
    expect(screen.getByText("3 из 3")).toBeInTheDocument();
  });
});
