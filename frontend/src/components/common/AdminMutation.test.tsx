import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";

import { ApiError } from "@/api/client";

import {
  AdminMutationDialog,
  AdminMutationForm,
  ArchiveConfirmation,
  MutationFeedback,
} from "./AdminMutation";
import { archiveConfirmationMessage } from "./AdminMutationUtils";

test("renders reusable Russian-first admin mutation form with actions and feedback", async () => {
  const user = userEvent.setup();
  const onCancel = vi.fn();
  const onSubmit = vi.fn((event: React.FormEvent<HTMLFormElement>) => event.preventDefault());

  render(
    <AdminMutationForm
      title="Организация"
      description="Основные сведения"
      submitLabel="Сохранить"
      cancelLabel="Отмена"
      isSubmitting={false}
      successMessage="Сохранено"
      error={new ApiError("Integrity constraint violation.", 409)}
      onCancel={onCancel}
      onSubmit={onSubmit}
    >
      <label>
        Название
        <input name="name" />
      </label>
    </AdminMutationForm>,
  );

  expect(screen.getByRole("heading", { name: "Организация" })).toBeInTheDocument();
  expect(screen.getByText("Основные сведения")).toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent("Данные нарушают ограничения базы.");
  expect(screen.getByText("Сохранено")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Сохранить" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Отмена" })).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Сохранить" }));
  await user.click(screen.getByRole("button", { name: "Отмена" }));

  expect(onSubmit).toHaveBeenCalledTimes(1);
  expect(onCancel).toHaveBeenCalledTimes(1);
});

test("renders reusable confirmation dialog and archive confirmation copy", async () => {
  const user = userEvent.setup();
  const onCancel = vi.fn();
  const onConfirm = vi.fn();

  render(
    <AdminMutationDialog title="Архивировать запись" onCancel={onCancel}>
      <ArchiveConfirmation
        entityLabel="Организация"
        itemLabel="Главная организация"
        isPending={false}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />
    </AdminMutationDialog>,
  );

  expect(screen.getByRole("dialog", { name: "Архивировать запись" })).toBeInTheDocument();
  expect(screen.getByText("Организация: Главная организация")).toBeInTheDocument();
  expect(screen.getByText(archiveConfirmationMessage("Организация"))).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Архивировать" }));
  await user.click(screen.getByRole("button", { name: "Отмена" }));

  expect(onConfirm).toHaveBeenCalledTimes(1);
  expect(onCancel).toHaveBeenCalledTimes(1);
});

test("renders mutation feedback only when error or success exists", () => {
  const { rerender } = render(<MutationFeedback error={null} successMessage={null} />);

  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.queryByText("Сохранено")).not.toBeInTheDocument();

  rerender(<MutationFeedback error={new Error("Unexpected failure")} successMessage={null} />);
  expect(screen.getByRole("alert")).toHaveTextContent("Запрос не выполнен");

  rerender(<MutationFeedback error={null} successMessage="Сохранено" />);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.getByText("Сохранено")).toBeInTheDocument();
});
