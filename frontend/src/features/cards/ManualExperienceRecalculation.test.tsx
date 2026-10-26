import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { ManualExperienceRecalculation } from "./ManualExperienceRecalculation";

const initialRead = {
  calculation: null,
  result: null,
  manual_value: { years: 6, months: 10, days: 15 },
  manual_input: { years: 5, months: 2, days: 3 },
  manual_as_of_date: "2025-02-14",
  server_date: "2026-10-26",
  source_date: "2020-01-01",
  can_manage: true,
  revision: "revision-1",
};
const preview = {
  value: { years: 6, months: 10, days: 15, display: "6 лет 10 месяцев 15 дней" },
  server_date: "2026-10-26",
  as_of_date: "2025-02-14",
};
const props = {
  token: "test-token",
  cardId: "card-1",
  fieldId: "field-1",
  blockInstanceId: "instance-1",
  requiresBasis: true,
  onClose: vi.fn(),
  onSaved: vi.fn(async () => {}),
};
let read: Record<string, unknown>;
let failPreview: boolean;
let failSave: boolean;
const fetchMock = vi.fn(async (url: string | URL | Request, options?: RequestInit) => {
  if ((options?.method ?? "GET") === "GET") return Response.json(read);
  if (String(url).endsWith("/manual-preview"))
    return failPreview
      ? Response.json({ detail: "Проверьте дату исходного стажа" }, { status: 400 })
      : Response.json(preview);
  return failSave
    ? Response.json({ detail: "Конфликт версии" }, { status: 409 })
    : Response.json(initialRead);
});
beforeEach(() => {
  read = structuredClone(initialRead);
  failPreview = false;
  failSave = false;
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());
const confirm = () =>
  screen.getByRole("checkbox", {
    name: "Подтверждаю, что указанный стаж был на выбранную дату",
  });
const save = () => screen.getByRole("button", { name: "Применить пересчёт" });
async function awaitPreview() {
  await screen.findByText("6 лет 10 месяцев 15 дней");
}

describe("ManualExperienceRecalculation", () => {
  test("reuses original input/date and explicitly saves manual metadata without creating periods", async () => {
    const user = userEvent.setup();
    render(<ManualExperienceRecalculation {...props} />);
    expect(await screen.findByLabelText("Исходный стаж, годы")).toHaveValue("5");
    expect(screen.getByLabelText("Дата исходного стажа")).toHaveValue("14.02.2025");
    expect(fetchMock.mock.calls[0][0]).toContain("block_instance_id=instance-1");
    expect(confirm()).not.toBeChecked();
    await awaitPreview();
    expect(save()).toBeDisabled();
    await user.click(confirm());
    expect(save()).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Основание изменения"), {
      target: { value: "Уточнение" },
    });
    expect(save()).toBeEnabled();
    await user.click(save());
    await waitFor(() => expect(props.onSaved).toHaveBeenCalledOnce());
    const request = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/manual"));
    expect(JSON.parse(String(request?.[1]?.body))).toEqual({
      years: 5,
      months: 2,
      days: 3,
      as_of_date: "2025-02-14",
      block_instance_id: "instance-1",
      confirm_manual: false,
      expected_revision: "revision-1",
      basis_text: "Уточнение",
      occurred_on: "2026-10-26",
    });
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  test("falls back to manual summary and source date with a warning for legacy values", async () => {
    read = { ...initialRead, manual_input: null, manual_as_of_date: null };
    render(<ManualExperienceRecalculation {...props} requiresBasis={false} />);
    expect(await screen.findByLabelText("Исходный стаж, годы")).toHaveValue("6");
    expect(screen.getByLabelText("Дата исходного стажа")).toHaveValue("01.01.2020");
    expect(
      screen.getByText(/Если в карточке уже показан стаж на текущую дату/),
    ).toBeInTheDocument();
    await awaitPreview();
    expect(save()).toBeDisabled();
  });

  test("ignores stale preview and disables save while the changed input is pending", async () => {
    let resolveStale!: (value: Response) => void;
    fetchMock.mockImplementationOnce(async () => Response.json(read));
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolveStale = resolve;
        }),
    );
    const user = userEvent.setup();
    render(<ManualExperienceRecalculation {...props} requiresBasis={false} />);
    await screen.findByLabelText("Дата исходного стажа");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    fireEvent.change(screen.getByLabelText("Дата исходного стажа"), {
      target: { value: "15.02.2025" },
    });
    await user.click(confirm());
    expect(save()).toBeDisabled();
    await act(async () => {
      resolveStale(
        Response.json({
          ...preview,
          value: { years: 99, months: 0, days: 0, display: "Устаревший результат" },
        }),
      );
    });
    expect(screen.queryByText("Устаревший результат")).not.toBeInTheDocument();
    await awaitPreview();
    expect(save()).toBeEnabled();
    fireEvent.change(screen.getByLabelText("Исходный стаж, годы"), { target: { value: "7" } });
    expect(save()).toBeDisabled();
    expect(confirm()).not.toBeChecked();
  });

  test("rejects invalid calendar dates and incomplete duration input without posting", async () => {
    const user = userEvent.setup();
    render(<ManualExperienceRecalculation {...props} requiresBasis={false} />);
    await awaitPreview();
    await user.click(confirm());
    const before = fetchMock.mock.calls.length;
    fireEvent.change(screen.getByLabelText("Дата исходного стажа"), {
      target: { value: "31.02.2025" },
    });
    expect(screen.getByLabelText("Дата исходного стажа")).toHaveAttribute("aria-invalid", "true");
    expect(save()).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Календарь: Дата исходного стажа"), {
      target: { value: "2025-02-14" },
    });
    fireEvent.change(screen.getByLabelText("Исходный стаж, годы"), { target: { value: "" } });
    expect(save()).toBeDisabled();
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(fetchMock).toHaveBeenCalledTimes(before);
  });

  test("keeps input after save failure and reports preview failures", async () => {
    failPreview = true;
    const user = userEvent.setup();
    render(<ManualExperienceRecalculation {...props} requiresBasis={false} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Проверьте дату исходного стажа");
    expect(save()).toBeDisabled();
    failPreview = false;
    failSave = true;
    fireEvent.change(screen.getByLabelText("Исходный стаж, годы"), { target: { value: "7" } });
    await awaitPreview();
    await user.click(confirm());
    await user.click(save());
    expect(await screen.findByRole("alert")).toHaveTextContent(/Конфликт|версии/);
    expect(screen.getByLabelText("Исходный стаж, годы")).toHaveValue("7");
    expect(props.onSaved).not.toHaveBeenCalled();
    expect(props.onClose).not.toHaveBeenCalled();
  });

  test("does not rebase calculated history or offer a save", async () => {
    read = { ...initialRead, calculation: { mode: "calculated", periods: [] } };
    render(<ManualExperienceRecalculation {...props} />);
    expect(await screen.findByText(/Перейдите к ручному вводу в калькуляторе/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Исходный стаж, годы")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Применить пересчёт" })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("supports explicit close, cancel and Escape without saving", async () => {
    const user = userEvent.setup();
    const view = render(<ManualExperienceRecalculation {...props} />);
    await screen.findByLabelText("Дата исходного стажа");
    await user.click(screen.getByRole("button", { name: "Отмена" }));
    await user.click(screen.getByRole("button", { name: "Закрыть" }));
    await user.keyboard("{Escape}");
    expect(props.onClose).toHaveBeenCalledTimes(3);
    view.unmount();
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/manual"))).toBe(false);
  });
});
