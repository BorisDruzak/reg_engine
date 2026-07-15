import { act, render, screen } from "@testing-library/react";
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
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

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

  test("marks the block nearest the reading line when neighboring blocks intersect together", () => {
    let observerCallback: IntersectionObserverCallback | undefined;
    class IntersectionObserverMock {
      constructor(callback: IntersectionObserverCallback) {
        observerCallback = callback;
      }

      disconnect = vi.fn();
      observe = vi.fn();
    }
    vi.stubGlobal("IntersectionObserver", IntersectionObserverMock);
    const firstBlock = document.createElement("section");
    firstBlock.id = items[0].anchorId;
    const secondBlock = document.createElement("section");
    secondBlock.id = items[1].anchorId;
    document.body.append(firstBlock, secondBlock);

    render(<CardBlockNavigator items={items} />);

    act(() => {
      observerCallback?.(
        [
          {
            boundingClientRect: { top: -180 },
            isIntersecting: true,
            target: firstBlock,
          } as unknown as IntersectionObserverEntry,
          {
            boundingClientRect: { top: 110 },
            isIntersecting: true,
            target: secondBlock,
          } as unknown as IntersectionObserverEntry,
        ],
        {} as IntersectionObserver,
      );
    });

    expect(screen.getByRole("button", { name: "Контакты: заполнено 3 из 3" })).toHaveAttribute(
      "aria-current",
      "location",
    );
    firstBlock.remove();
    secondBlock.remove();
  });
});
