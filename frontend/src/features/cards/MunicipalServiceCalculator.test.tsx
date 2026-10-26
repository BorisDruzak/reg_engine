import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { MunicipalServiceCalculator } from "./MunicipalServiceCalculator";

const calculation = {
  mode: "calculated",
  version: 1,
  method: "calendar_remainder_30_v1",
  baseline: null,
  periods: [
    {
      id: "period-1",
      kind: "municipal",
      start_date: "2020-01-01",
      end_date: null,
      included: true,
      confirmed: true,
      basis: "Приказ № 1",
      pension_only: false,
    },
  ],
};
const result = {
  value: { days: 26, months: 9, years: 6, display: "6 лет 9 месяцев 26 дней" },
  as_of_date: "2026-10-26",
  server_date: "2026-10-26",
  forecast: false,
  included_count: 1,
  excluded_count: 0,
  review_count: 0,
  overlaps: [],
  warnings: [],
  can_save: true,
};
const baseRead = {
  calculation,
  result,
  manual_value: null,
  source_date: "2026-01-01",
  server_date: "2026-10-26",
  can_manage: true,
  revision: "revision-1",
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
let writes: { method: string; body: Record<string, unknown> }[];
let failSave: boolean;
const fetchMock = vi.fn(async (_url: string | URL | Request, options?: RequestInit) => {
  const method = options?.method ?? "GET";
  if (method === "GET") return Response.json(read);
  const body = JSON.parse(String(options?.body)) as Record<string, unknown>;
  writes.push({ method, body });
  if (failSave && method === "PUT")
    return Response.json({ detail: "Конфликт версии" }, { status: 409 });
  return Response.json(method === "POST" ? result : baseRead);
});

beforeEach(() => {
  read = structuredClone(baseRead);
  writes = [];
  failSave = false;
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("MunicipalServiceCalculator", () => {
  test("loads saved periods, previews edits and saves exact values with revision and audit context", async () => {
    const user = userEvent.setup();
    render(<MunicipalServiceCalculator {...props} />);
    expect(await screen.findByLabelText("Начало периода 1")).toHaveValue("01.01.2020");
    expect(fetchMock.mock.calls[0][0]).toContain("block_instance_id=instance-1");
    fireEvent.change(screen.getByLabelText("Основание периода 1"), {
      target: { value: "Приказ № 2" },
    });
    expect(screen.getByRole("button", { name: "Сохранить расчёт" })).toBeDisabled();
    await waitFor(() =>
      expect(writes.some(({ body }) => JSON.stringify(body).includes("Приказ № 2"))).toBe(true),
    );
    fireEvent.change(screen.getByLabelText("Основание изменения"), {
      target: { value: "Исправление" },
    });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Сохранить расчёт" })).toBeEnabled(),
    );
    await user.click(screen.getByRole("button", { name: "Сохранить расчёт" }));
    await waitFor(() => expect(props.onSaved).toHaveBeenCalledOnce());
    expect(writes.find(({ method }) => method === "PUT")?.body).toMatchObject({
      block_instance_id: "instance-1",
      expected_revision: "revision-1",
      basis_text: "Исправление",
      occurred_on: "2026-10-26",
      calculation: { periods: [{ basis: "Приказ № 2" }] },
    });
  });

  test("does not invent periods from manual history and creates only explicitly added periods", async () => {
    read = {
      ...baseRead,
      calculation: null,
      result: null,
      manual_value: { years: 10, months: 2, days: 3 },
    };
    const user = userEvent.setup();
    render(<MunicipalServiceCalculator {...props} />);
    expect(await screen.findByText("Периоды ещё не добавлены")).toBeInTheDocument();
    expect(screen.queryByLabelText("Начало периода 1")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Добавить период" }));
    expect(screen.getByLabelText("Начало периода 1")).toHaveValue("");
    expect(screen.getByLabelText("Категория периода 1").children).toHaveLength(9);
    fireEvent.change(screen.getByLabelText("Начало периода 1"), {
      target: { value: "01.02.2020" },
    });
    fireEvent.click(screen.getByLabelText("Подтверждён, период 1"));
    await waitFor(() =>
      expect(writes.some(({ body }) => JSON.stringify(body).includes("2020-02-01"))).toBe(true),
    );
    await user.click(screen.getByRole("button", { name: "Удалить период 1" }));
    expect(screen.queryByLabelText("Начало периода 1")).not.toBeInTheDocument();
  });

  test("keeps unsaved input after save errors and allows safe retry", async () => {
    failSave = true;
    const user = userEvent.setup();
    render(<MunicipalServiceCalculator {...props} />);
    await screen.findByLabelText("Основание периода 1");
    fireEvent.change(screen.getByLabelText("Основание периода 1"), {
      target: { value: "Новый приказ" },
    });
    fireEvent.change(screen.getByLabelText("Основание изменения"), {
      target: { value: "Уточнение" },
    });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Сохранить расчёт" })).toBeEnabled(),
    );
    await user.click(screen.getByRole("button", { name: "Сохранить расчёт" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Конфликт|Данные|версии/);
    expect(screen.getByLabelText("Основание периода 1")).toHaveValue("Новый приказ");
    expect(props.onClose).not.toHaveBeenCalled();
    failSave = false;
    await user.click(screen.getByRole("button", { name: "Сохранить расчёт" }));
    await waitFor(() => expect(props.onSaved).toHaveBeenCalledOnce());
  });

  test("discards a late load on close and loads fresh server state on reopening", async () => {
    let resolveLoad!: (response: Response) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolveLoad = resolve;
        }),
    );
    const user = userEvent.setup();
    const view = render(<MunicipalServiceCalculator {...props} />);
    await user.click(screen.getByRole("button", { name: "Закрыть" }));
    expect(props.onClose).toHaveBeenCalledOnce();
    view.unmount();
    resolveLoad(Response.json(baseRead));
    read = { ...baseRead, calculation: null, result: null };
    render(<MunicipalServiceCalculator {...props} />);
    expect(await screen.findByText("Периоды ещё не добавлены")).toBeInTheDocument();
    expect(screen.queryByLabelText("Начало периода 1")).not.toBeInTheDocument();
  });

  test("supports explicit baseline only with operator confirmation, basis and server date", async () => {
    read = {
      ...baseRead,
      calculation: null,
      result: null,
      manual_value: { years: 10, months: 2, days: 3 },
    };
    const user = userEvent.setup();
    render(<MunicipalServiceCalculator {...props} />);
    await screen.findByText("Периоды ещё не добавлены");
    await user.click(screen.getByRole("button", { name: "Добавить подтверждённый исходный стаж" }));
    expect(screen.getByLabelText("Дата исходного стажа")).toHaveValue("26.10.2026");
    expect(screen.getByLabelText("Исходный стаж, годы")).toHaveValue("10");
    expect(screen.getByLabelText("Исходный стаж подтверждён")).not.toBeChecked();
    expect(screen.getByLabelText("Основание исходного стажа")).toHaveValue("");
  });

  test("offers explicit confirmed manual replacement and preserves three components", async () => {
    const user = userEvent.setup();
    render(<MunicipalServiceCalculator {...props} />);
    await screen.findByLabelText("Начало периода 1");
    await user.click(screen.getByRole("button", { name: "Перейти к ручному вводу" }));
    expect(screen.getByText(/История периодов будет заменена/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Ручной стаж, годы"), { target: { value: "12" } });
    fireEvent.change(screen.getByLabelText("Основание изменения"), { target: { value: "Приказ" } });
    expect(screen.getByRole("button", { name: "Сохранить ручное значение" })).toBeDisabled();
    await user.click(screen.getByLabelText("Подтверждаю замену расчёта ручным значением"));
    await user.click(screen.getByRole("button", { name: "Сохранить ручное значение" }));
    await waitFor(() => expect(props.onSaved).toHaveBeenCalledOnce());
    expect(writes.find(({ body }) => body.confirm_manual === true)?.body).toMatchObject({
      days: 26,
      months: 9,
      years: 12,
      confirm_manual: true,
      expected_revision: "revision-1",
    });
  });

  test("blocks incomplete dates and shows forecast and server overlap warnings", async () => {
    fetchMock.mockImplementationOnce(async () =>
      Response.json({
        ...baseRead,
        result: {
          ...result,
          forecast: true,
          can_save: false,
          warnings: ["Проверьте основание"],
          overlaps: [
            {
              period_ids: ["period-1", "period-2"],
              start_date: "2020-01-01",
              end_date: "2020-02-01",
              conflict: true,
            },
          ],
        },
      }),
    );
    render(<MunicipalServiceCalculator {...props} />);
    expect(await screen.findByText(/Прогноз/)).toBeInTheDocument();
    expect(screen.getByText(/Конфликт пересечения/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Начало периода 1"), {
      target: { value: "31.02.2020" },
    });
    expect(screen.getByRole("button", { name: "Сохранить расчёт" })).toBeDisabled();
    expect(screen.getByLabelText("Начало периода 1")).toHaveAttribute("aria-invalid", "true");
  });

  test("keeps read-only period history disabled without write actions", async () => {
    read = { ...baseRead, can_manage: false };
    render(<MunicipalServiceCalculator {...props} />);
    expect(await screen.findByLabelText("Начало периода 1")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Сохранить расчёт" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Перейти к ручному вводу" }),
    ).not.toBeInTheDocument();
    expect(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Закрыть" }),
    ).toBeEnabled();
  });

  test("ignores an older preview after a newer input has already been calculated", async () => {
    render(<MunicipalServiceCalculator {...props} />);
    await screen.findByLabelText("Начало периода 1");
    let resolveOld!: (response: Response) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolveOld = resolve;
        }),
    );
    fireEvent.change(screen.getByLabelText("Основание периода 1"), {
      target: { value: "Старый ввод" },
    });
    await waitFor(() => expect(resolveOld).toBeDefined());
    fetchMock.mockImplementationOnce(async () =>
      Response.json({
        ...result,
        value: { days: 1, months: 2, years: 8, display: "8 лет 2 месяца 1 день" },
      }),
    );
    fireEvent.change(screen.getByLabelText("Основание периода 1"), {
      target: { value: "Актуальный ввод" },
    });
    fireEvent.change(screen.getByLabelText("Основание изменения"), {
      target: { value: "Уточнение" },
    });
    expect(screen.getByRole("button", { name: "Сохранить расчёт" })).toBeDisabled();
    expect(await screen.findByText("8 лет 2 месяца 1 день")).toBeInTheDocument();
    await act(async () => {
      resolveOld(
        Response.json({
          ...result,
          can_save: false,
          value: { ...result.value, display: "Устаревший итог" },
        }),
      );
    });
    expect(screen.queryByText("Устаревший итог")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Сохранить расчёт" })).toBeEnabled();
  });

  test("does not call refresh or close again when a save finishes after closing", async () => {
    const user = userEvent.setup();
    render(<MunicipalServiceCalculator {...props} />);
    await screen.findByLabelText("Начало периода 1");
    let resolveSave!: (response: Response) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolveSave = resolve;
        }),
    );
    fireEvent.change(screen.getByLabelText("Основание изменения"), { target: { value: "Приказ" } });
    await user.click(screen.getByRole("button", { name: "Сохранить расчёт" }));
    await user.click(screen.getByRole("button", { name: "Закрыть" }));
    await act(async () => {
      resolveSave(Response.json(baseRead));
    });
    expect(props.onSaved).not.toHaveBeenCalled();
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  test("requires complete numeric manual input even after confirming replacement", async () => {
    const user = userEvent.setup();
    render(<MunicipalServiceCalculator {...props} />);
    await screen.findByLabelText("Начало периода 1");
    await user.click(screen.getByRole("button", { name: "Перейти к ручному вводу" }));
    fireEvent.change(screen.getByLabelText("Основание изменения"), { target: { value: "Приказ" } });
    await user.click(screen.getByLabelText("Подтверждаю замену расчёта ручным значением"));
    fireEvent.change(screen.getByLabelText("Ручной стаж, дни"), { target: { value: "" } });
    expect(screen.getByRole("button", { name: "Сохранить ручное значение" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Ручной стаж, дни"), { target: { value: "7" } });
    expect(screen.getByRole("button", { name: "Сохранить ручное значение" })).toBeEnabled();
  });
});
