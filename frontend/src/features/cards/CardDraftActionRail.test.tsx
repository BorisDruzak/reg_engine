import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { CardDraftActionRail } from "./CardDraftActionRail";

describe("CardDraftActionRail", () => {
  test("disables draft saving until setup is complete", () => {
    render(<CardDraftActionRail state="setup" setupComplete={false} onSaveDraft={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Сохранить черновик" })).toBeDisabled();
    expect(screen.getByText("Выберите организацию и шаблон, затем сохраните черновик.")).toBeInTheDocument();
  });

  test("saves once when setup is complete and reports the result", async () => {
    const user = userEvent.setup();
    const onSaveDraft = vi.fn();
    render(
      <CardDraftActionRail
        state="setup"
        setupComplete
        onSaveDraft={onSaveDraft}
        result="Черновик карточки сохранён"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Сохранить черновик" }));

    expect(onSaveDraft).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toHaveTextContent("Черновик карточки сохранён");
  });

  test("renders draft and active states as non-button statuses", () => {
    const { rerender } = render(<CardDraftActionRail state="draft" aria-label="Статус карточки" />);

    expect(screen.getByRole("status", { name: "Статус карточки" })).toHaveTextContent("Черновик");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();

    rerender(<CardDraftActionRail state="active" aria-label="Статус карточки" />);

    expect(screen.getByRole("status", { name: "Статус карточки" })).toHaveTextContent("Активна");
  });
});
