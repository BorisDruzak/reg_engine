import "@testing-library/jest-dom/vitest";

import { readFileSync } from "node:fs";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { CardRead, CardSummaryRead, OrganizationRead, RegistrySchemaRead } from "@/api/types";

import { CardsWorkspace } from "./CardsWorkspace";

const globalStyles = readFileSync("src/styles/globals.css", "utf8");

const organization: OrganizationRead = {
  id: "organization-1",
  parent_id: null,
  code: "organization",
  name: "Организация",
  type: "organization",
  is_active: true,
};

const schema: RegistrySchemaRead = {
  registry: {
    id: "registry-1",
    code: "registry",
    name: "Реестр",
    description: null,
    lifecycle_status: "active",
    schema_version: 1,
    owner_organization_id: null,
    is_default_for_owner_tree: true,
  },
  blocks: [],
  fields: [],
  templates: [
    {
      id: "template-1",
      registry_id: "registry-1",
      code: "template",
      name: "Шаблон",
      description: null,
      position: 1,
      field_schema_json: {},
      default_values_json: [],
      is_active: true,
    },
  ],
};

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.includes("/presentation")) return Response.json(organizationUnitPresentation());
      if (url.includes("/public-access")) {
        return Response.json({
          card_id: "card-org-unit",
          public_view_enabled: true,
          public_edit_enabled: true,
          fields: [],
        });
      }
      if (url.includes("/org-unit-options")) {
        return Response.json({
          items: [
            { id: "management-local", label: "Управление образования", archived: false },
            {
              id: "department-local",
              label: "Управление образования → Отдел дошкольного образования",
              archived: false,
            },
            { id: "archived-local", label: "Отдел кадров", archived: true },
          ],
        });
      }
      if (url.includes("/card-creation-links")) {
        return Response.json({
          items: [
            {
              id: "creation-link-1",
              registry_id: "registry-1",
              card_template_id: "template-1",
              card_template_name: "Шаблон",
              raw_token: "creation-token",
              created_at: "2026-07-13T12:00:00Z",
              closed_at: null,
              organizations: [{ id: organization.id, name: organization.name }],
              created_cards: [
                {
                  card_id: "created-card-1",
                  display_value: "Созданная карточка",
                  organization_id: organization.id,
                  organization_name: organization.name,
                  child_public_link_id: "child-link-1",
                  child_raw_token: "child-token-1",
                },
              ],
            },
          ],
        });
      }
      return Response.json({ items: [] });
    }),
  );
});

afterEach(() => vi.unstubAllGlobals());

describe("CardsWorkspace", () => {
  test("keeps draft tab navigation basis-free and preserves the active close confirmation", async () => {
    const rendered = renderWorkspace({
      cards: [{ ...organizationUnitCardSummary, lifecycle_status: "draft" }],
      card: organizationUnitCard,
    });
    fireEvent.doubleClick(screen.getByRole("button", { name: /Карточка подразделения/ }));
    fireEvent.click(await screen.findByTestId("filled-field-item-org-unit"));
    fireEvent.click(await screen.findByRole("option", { name: "Управление образования" }));
    fireEvent.click(screen.getByRole("tab", { name: "Список карточек" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    rendered.unmount();
    localStorage.clear();
    renderWorkspace({ cards: [organizationUnitCardSummary], card: organizationUnitCard });
    fireEvent.doubleClick(screen.getByRole("button", { name: /Карточка подразделения/ }));
    fireEvent.click(await screen.findByTestId("filled-field-item-org-unit"));
    fireEvent.click(await screen.findByRole("option", { name: "Управление образования" }));
    fireEvent.change(screen.getByLabelText("Основание изменения"), { target: { value: "Приказ" } });
    fireEvent.click(screen.getByRole("button", { name: /Закрыть вкладку Карточка подразделения/ }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Продолжить редактирование" }),
    );
    expect(screen.getByLabelText("Основание изменения")).toHaveValue("Приказ");
  });
  test.each(["Список карточек", "Создать карточку", "Ссылки на заполнение"])(
    "guards active staged edits when navigating to %s and discards only after confirmation",
    async (destination) => {
      renderWorkspace({ cards: [organizationUnitCardSummary], card: organizationUnitCard });
      fireEvent.doubleClick(screen.getByRole("button", { name: /Карточка подразделения/ }));
      fireEvent.click(await screen.findByTestId("filled-field-item-org-unit"));
      const input = await screen.findByRole("combobox", { name: "Подразделение организации" });
      fireEvent.click(await screen.findByRole("option", { name: "Управление образования" }));
      fireEvent.change(screen.getByLabelText("Основание изменения"), {
        target: { value: "Приказ" },
      });
      fireEvent.click(screen.getByRole("tab", { name: destination }));
      const dialog = screen.getByRole("dialog");
      fireEvent.click(within(dialog).getByRole("button", { name: "Продолжить редактирование" }));
      expect(input).toHaveTextContent("Управление образования");
      expect(screen.getByLabelText("Основание изменения")).toHaveValue("Приказ");
      fireEvent.click(screen.getByRole("tab", { name: destination }));
      fireEvent.click(
        within(screen.getByRole("dialog")).getByRole("button", { name: "Не сохранять" }),
      );
      expect(screen.getByRole("tab", { name: destination })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      expect(screen.queryByLabelText("Основание изменения")).not.toBeInTheDocument();
      expect(
        vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === "PATCH"),
      ).toHaveLength(0);
    },
  );

  test("retains failed changes before card-tab navigation, then saves before selecting the destination", async () => {
    const other = {
      ...organizationUnitCardSummary,
      id: "other-card",
      display_value: "Другая карточка",
    };
    const onSelectCard = vi.fn();
    renderWorkspace({
      cards: [organizationUnitCardSummary, other],
      card: organizationUnitCard,
      onSelectCard,
    });
    fireEvent.doubleClick(screen.getByRole("button", { name: /Другая карточка/ }));
    fireEvent.click(screen.getByRole("tab", { name: "Список карточек" }));
    fireEvent.doubleClick(screen.getByRole("button", { name: /Карточка подразделения/ }));
    fireEvent.click(await screen.findByTestId("filled-field-item-org-unit"));
    fireEvent.click(await screen.findByRole("option", { name: "Управление образования" }));
    fireEvent.change(screen.getByLabelText("Основание изменения"), {
      target: { value: "  Приказ  " },
    });
    onSelectCard.mockClear();
    const originalFetch = vi.mocked(fetch).getMockImplementation()!;
    let rejected = true;
    const writes: unknown[] = [];
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      if (init?.method === "PATCH") {
        writes.push(JSON.parse(String(init.body)));
        return rejected
          ? Response.json({ detail: "Ошибка сохранения" }, { status: 400 })
          : Response.json({ items: [] });
      }
      return originalFetch(input, init);
    });
    fireEvent.click(screen.getByRole("tab", { name: "Другая карточка" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Сохранить и перейти" }));
    await waitFor(() => expect(writes).toHaveLength(1));
    await waitFor(() =>
      expect(within(dialog).getByRole("button", { name: "Сохранить и перейти" })).toBeEnabled(),
    );
    expect(onSelectCard).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Основание изменения")).toHaveValue("  Приказ  ");
    rejected = false;
    fireEvent.click(within(dialog).getByRole("button", { name: "Сохранить и перейти" }));
    await waitFor(() => expect(onSelectCard).toHaveBeenCalledExactlyOnceWith(other.id));
    expect(writes).toEqual(
      Array(2).fill({
        values: [
          { field_id: "field-org-unit", value: "management-local", block_instance_id: null },
        ],
        basis_text: "Приказ",
      }),
    );
  });
  test.each(["active", "dismissed"])(
    "requires a basis when a superuser archives a previously activated %s card",
    async (lifecycle) => {
      const writes: unknown[] = [];
      const originalFetch = vi.mocked(fetch).getMockImplementation()!;
      vi.mocked(fetch).mockImplementation(async (input, init) => {
        if (init?.method === "DELETE") {
          writes.push(JSON.parse(String(init.body)));
          return Response.json({ ...organizationUnitCardSummary, lifecycle_status: "archived" });
        }
        return originalFetch(input, init);
      });
      renderWorkspace({
        cards: [{ ...organizationUnitCardSummary, lifecycle_status: lifecycle }],
        card: organizationUnitCard,
        isSuperuser: true,
      });
      fireEvent.doubleClick(screen.getByRole("button", { name: /Карточка подразделения/ }));
      fireEvent.click(await screen.findByRole("button", { name: /Архивировать карточку/ }));
      const dialog = screen.getByRole("dialog");
      expect(within(dialog).getByRole("button", { name: "Сохранить" })).toBeDisabled();
      fireEvent.change(within(dialog).getByLabelText("Основание изменения"), {
        target: { value: "Приказ об архивировании" },
      });
      fireEvent.click(within(dialog).getByRole("button", { name: "Сохранить" }));
      await waitFor(() => expect(writes).toEqual([{ basis_text: "Приказ об архивировании" }]));
    },
  );
  test("closes the archive dialog when list refresh removes the selected card", async () => {
    const nextSummary = {
      ...organizationUnitCardSummary,
      id: "card-next",
      display_value: "Следующая карточка",
    };
    const nextCard = { ...organizationUnitCard, ...nextSummary };
    const originalFetch = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (input, init) =>
      init?.method === "DELETE"
        ? Response.json({ ...organizationUnitCardSummary, lifecycle_status: "archived" })
        : originalFetch(input, init),
    );
    const workspace = renderWorkspace({
      cards: [organizationUnitCardSummary, nextSummary],
      card: organizationUnitCard,
      isSuperuser: true,
    });
    let finishRefresh!: () => void;
    const refresh = new Promise<void>((resolve) => {
      finishRefresh = resolve;
    });
    const invalidate = vi.spyOn(workspace.queryClient, "invalidateQueries");
    invalidate.mockImplementation(async (filters) => {
      if (filters?.queryKey?.[0] === "cards") await refresh;
    });
    fireEvent.doubleClick(screen.getByRole("button", { name: /Карточка подразделения/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Архивировать карточку/ }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Основание изменения"), {
      target: { value: "Приказ об архивировании" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Сохранить" }));
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: ["cards", "test-token", "registry-1"],
      }),
    );

    // The refreshed list updates HomePage props before the invalidation chain finishes.
    workspace.rerenderCards([nextSummary], nextCard);
    finishRefresh();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("tab", { name: "Список карточек" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.queryByRole("tab", { name: "Карточка подразделения" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Базовый блок")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Следующая карточка/ })).toBeInTheDocument();
  });
  test("keeps the archive dialog and basis available after a rejected archive", async () => {
    const originalFetch = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (input, init) =>
      init?.method === "DELETE"
        ? Response.json({ detail: "Ошибка архивирования" }, { status: 400 })
        : originalFetch(input, init),
    );
    renderWorkspace({
      cards: [organizationUnitCardSummary],
      card: organizationUnitCard,
      isSuperuser: true,
    });
    fireEvent.doubleClick(screen.getByRole("button", { name: /Карточка подразделения/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Архивировать карточку/ }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Основание изменения"), {
      target: { value: "Приказ об архивировании" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Сохранить" }));
    expect(await within(dialog).findByText("Запрос не выполнен")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Основание изменения")).toHaveValue(
      "Приказ об архивировании",
    );
    expect(within(dialog).getByRole("button", { name: "Сохранить" })).toBeEnabled();
  });
  test("requires a basis for a demoted card's ordinary field save", async () => {
    renderWorkspace({
      cards: [
        {
          ...organizationUnitCardSummary,
          lifecycle_status: "draft",
          activated_at: "2026-09-01T00:00:00Z",
        },
      ],
      card: organizationUnitCard,
    });
    fireEvent.doubleClick(screen.getByRole("button", { name: /Карточка подразделения/ }));
    fireEvent.click(await screen.findByTestId("filled-field-item-org-unit"));
    expect(await screen.findByLabelText("Основание изменения")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Сохранить блок" })).toBeDisabled();
  });

  test.each(["add", "archive"])(
    "requires one basis for repeatable instance %s and forwards it",
    async (action) => {
      const presentation = organizationUnitPresentation();
      presentation.layout.structure.blocks[0].is_repeatable = true;
      const repeatCard = {
        ...organizationUnitCard,
        blocks: {
          main: {
            ...organizationUnitCard.blocks["block-org-unit"],
            instances: [
              {
                ...organizationUnitCard.blocks["block-org-unit"].instances[0],
                block_instance_id: "instance-1",
                ordinal: 1,
              },
            ],
          },
        },
      };
      const writes: unknown[] = [];
      const originalFetch = vi.mocked(fetch).getMockImplementation()!;
      vi.mocked(fetch).mockImplementation(async (input, init) => {
        if (String(input).includes("/presentation")) return Response.json(presentation);
        if (init?.method === "POST" || init?.method === "DELETE") {
          writes.push(JSON.parse(String(init.body)));
          return Response.json({
            id: "instance-1",
            card_id: repeatCard.id,
            block_id: "block-org-unit",
            ordinal: 1,
          });
        }
        return originalFetch(input, init);
      });
      renderWorkspace({ cards: [organizationUnitCardSummary], card: repeatCard });
      fireEvent.doubleClick(screen.getByRole("button", { name: /Карточка подразделения/ }));
      await screen.findByLabelText("Базовый блок");
      fireEvent.click(screen.getByText("Публичный доступ", { selector: "summary" }));
      const name =
        action === "add"
          ? /Добавить экземпляр блока Основные сведения/
          : /Архивировать экземпляр блока Основные сведения/;
      fireEvent.click(await screen.findByRole("button", { name }));
      const dialog = await screen.findByRole("dialog");
      expect(writes).toEqual([]);
      expect(within(dialog).getByRole("button", { name: "Сохранить" })).toBeDisabled();
      fireEvent.change(within(dialog).getByLabelText("Основание изменения"), {
        target: { value: "  Приказ 44  " },
      });
      fireEvent.click(within(dialog).getByRole("button", { name: "Сохранить" }));
      await waitFor(() => expect(writes).toEqual([{ basis_text: "Приказ 44" }]));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    },
  );

  test("requires basis in the attachment-aware file reference save", async () => {
    let resolveSave: (response: Response) => void = () => undefined;
    const presentation = organizationUnitPresentation();
    presentation.layout.structure.fields[0].field_type = "file_ref";
    const writes: unknown[] = [];
    const originalFetch = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      if (String(input).includes("/presentation")) return Response.json(presentation);
      if (init?.method === "PATCH") {
        writes.push(JSON.parse(String(init.body)));
        return new Promise<Response>((resolve) => {
          resolveSave = resolve;
        });
      }
      return originalFetch(input, init);
    });
    const fileCard = {
      ...organizationUnitCard,
      blocks: {
        main: {
          ...organizationUnitCard.blocks["block-org-unit"],
          instances: [
            {
              ...organizationUnitCard.blocks["block-org-unit"].instances[0],
              fields: {
                file: {
                  field_id: "field-org-unit",
                  code: "org_unit",
                  field_type: "file_ref",
                  value: null,
                },
              },
            },
          ],
        },
      },
    };
    renderWorkspace({ cards: [organizationUnitCardSummary], card: fileCard });
    fireEvent.doubleClick(screen.getByRole("button", { name: /Карточка подразделения/ }));
    const fieldNode = await screen.findByTestId("filled-field-item-org-unit");
    const save = within(fieldNode).getByRole("button", { name: /Сохранить/ });
    expect(save).toBeDisabled();
    fireEvent.change(within(fieldNode).getByLabelText("Основание изменения"), {
      target: { value: "Приказ 45" },
    });
    fireEvent.click(save);
    await waitFor(() =>
      expect(writes).toEqual([{ value: null, block_instance_id: null, basis_text: "Приказ 45" }]),
    );
    expect(within(fieldNode).getByRole("combobox")).toBeDisabled();
    resolveSave(Response.json({ value: null }));
    await waitFor(() => expect(within(fieldNode).getByRole("combobox")).toBeEnabled());
  });
  test("returns to the list when dismissal removes the active tab instead of editing the next card", async () => {
    const nextSummary = {
      ...organizationUnitCardSummary,
      id: "card-next",
      display_value: "Следующая карточка",
    };
    const nextCard = {
      ...organizationUnitCard,
      id: nextSummary.id,
      display_value: nextSummary.display_value,
    };
    const originalFetch = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (input, init) =>
      String(input).endsWith("/dismissal")
        ? Response.json({ ...organizationUnitCardSummary, lifecycle_status: "dismissed" })
        : originalFetch(input, init),
    );
    const workspace = renderWorkspace({
      cards: [organizationUnitCardSummary, nextSummary],
      card: organizationUnitCard,
      cardLifecycleStatus: "active",
    });
    fireEvent.doubleClick(screen.getByRole("button", { name: /Карточка подразделения/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Уволить" }));
    const dialog = screen.getByRole("dialog", { name: "Увольнение" });
    fireEvent.change(within(dialog).getByLabelText("Дата увольнения"), {
      target: { value: "2026-09-09" },
    });
    fireEvent.change(within(dialog).getByLabelText("Основание"), {
      target: { value: "Приказ № 7" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Уволить" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    // HomePage's refreshed active-only list falls back to B after A is dismissed.
    workspace.rerenderCards([nextSummary], nextCard);
    expect(screen.getByRole("tab", { name: "Список карточек" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.queryByRole("tab", { name: "Карточка подразделения" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Базовый блок")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Следующая карточка/ })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("reg_engine.card_tabs.v1")!).activeTab).toBe("list");

    workspace.rerenderCards(
      [{ ...organizationUnitCardSummary, lifecycle_status: "dismissed" }],
      organizationUnitCard,
    );
    expect(screen.getByRole("tab", { name: "Список карточек" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.queryByLabelText("Базовый блок")).not.toBeInTheDocument();
  });

  test("never displays another card while the selected tab detail is loading", async () => {
    const nextSummary = {
      ...organizationUnitCardSummary,
      id: "card-next",
      display_value: "Следующая карточка",
    };
    const nextCard = {
      ...organizationUnitCard,
      id: nextSummary.id,
      display_value: nextSummary.display_value,
    };
    const workspace = renderWorkspace({
      cards: [organizationUnitCardSummary, nextSummary],
      card: organizationUnitCard,
    });
    fireEvent.doubleClick(screen.getByRole("button", { name: /Карточка подразделения/ }));
    await screen.findByTestId("filled-field-item-org-unit");
    workspace.rerenderCards([organizationUnitCardSummary, nextSummary], nextCard);
    await waitFor(() =>
      expect(
        workspace.queryClient.getQueryState(["card-presentation", "test-token", nextCard.id])
          ?.status,
      ).toBe("success"),
    );
    expect(screen.getByRole("tab", { name: "Карточка подразделения" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.queryByLabelText("Базовый блок")).not.toBeInTheDocument();
  });

  test("forwards the dismissed filter and keeps the list controlled by server data", () => {
    const onCardLifecycleStatusChange = vi.fn();
    renderWorkspace({ cards: [organizationUnitCardSummary], onCardLifecycleStatusChange });
    fireEvent.change(screen.getByLabelText("Статус карточек"), { target: { value: "dismissed" } });
    expect(onCardLifecycleStatusChange).toHaveBeenCalledWith("dismissed");
    expect(screen.getByRole("button", { name: /Карточка подразделения/ })).toBeInTheDocument();
  });

  test("superuser can archive while dismissed cards cannot be dismissed again", async () => {
    renderWorkspace({
      cards: [{ ...organizationUnitCardSummary, lifecycle_status: "dismissed" }],
      card: organizationUnitCard,
      isSuperuser: true,
    });
    fireEvent.doubleClick(screen.getByRole("button", { name: /Карточка подразделения/ }));
    expect(
      await screen.findByRole("button", { name: /Архивировать карточку/ }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Уволить" })).not.toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Статус карточки" })).toHaveTextContent("Уволен");
    fireEvent.click(screen.getByTestId("filled-field-item-org-unit"));
    expect(
      screen.queryByRole("group", { name: "Подразделение организации" }),
    ).not.toBeInTheDocument();
  });

  test("uses FIO for list and tabs and exposes dismissed state explicitly", async () => {
    renderWorkspace({
      cards: [
        {
          ...organizationUnitCardSummary,
          display_value: "Иванов Иван Иванович",
          lifecycle_status: "dismissed",
        },
      ],
    });
    const row = screen.getByRole("button", { name: /Иванов Иван Иванович/ });
    expect(row).toHaveClass("is-dismissed");
    expect(row).toHaveTextContent("Уволен");
    fireEvent.doubleClick(row);
    expect(screen.getByRole("tab", { name: "Иванов Иван Иванович" })).toBeInTheDocument();
  });

  test("dismissal requires date and nonblank basis and refreshes the card list", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(async (input) => {
      if (String(input).includes("/public-access"))
        return Response.json({
          card_id: organizationUnitCard.id,
          public_view_enabled: true,
          public_edit_enabled: true,
          fields: [],
        });
      if (String(input).endsWith("/dismissal"))
        return Response.json({ ...organizationUnitCardSummary, lifecycle_status: "dismissed" });
      if (String(input).includes("/presentation"))
        return Response.json(organizationUnitPresentation());
      return Response.json({ items: [] });
    });
    const { queryClient } = renderWorkspace({
      cards: [organizationUnitCardSummary],
      card: organizationUnitCard,
    });
    const invalidation = vi.spyOn(queryClient, "invalidateQueries");
    fireEvent.doubleClick(screen.getByRole("button", { name: /Карточка подразделения/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Уволить" }));
    const dialog = screen.getByRole("dialog", { name: "Увольнение" });
    const submit = within(dialog).getByRole("button", { name: "Уволить" });
    expect(submit).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText("Дата увольнения"), {
      target: { value: "2026-09-09" },
    });
    fireEvent.change(within(dialog).getByLabelText("Основание"), { target: { value: "   " } });
    expect(submit).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText("Основание"), {
      target: { value: " Приказ № 7 " },
    });
    fireEvent.click(submit);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const request = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/dismissal"));
    expect(request?.[1]?.method).toBe("POST");
    expect(JSON.parse(String(request?.[1]?.body))).toEqual({
      occurred_on: "2026-09-09",
      basis_text: "Приказ № 7",
    });
    expect(invalidation).toHaveBeenCalledWith({ queryKey: ["organization-cards", "test-token"] });
    expect(screen.getByText("Увольнение сохранено")).toBeVisible();
  });

  test("non-superuser has no archive action even when card management is allowed", async () => {
    renderWorkspace({ cards: [organizationUnitCardSummary], card: organizationUnitCard });
    fireEvent.doubleClick(screen.getByRole("button", { name: /Карточка подразделения/ }));
    await screen.findByTestId("filled-field-item-org-unit");
    expect(screen.queryByRole("button", { name: /Архивировать карточку/ })).not.toBeInTheDocument();
  });

  test("keeps dismissal form values and reports a rejected request without false success", async () => {
    const originalFetch = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (input, init) =>
      String(input).endsWith("/dismissal")
        ? Response.json({ detail: "Основание изменения обязательно." }, { status: 400 })
        : originalFetch(input, init),
    );
    renderWorkspace({ cards: [organizationUnitCardSummary], card: organizationUnitCard });
    fireEvent.doubleClick(screen.getByRole("button", { name: /Карточка подразделения/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Уволить" }));
    const dialog = screen.getByRole("dialog", { name: "Увольнение" });
    fireEvent.change(within(dialog).getByLabelText("Дата увольнения"), {
      target: { value: "2026-09-09" },
    });
    fireEvent.change(within(dialog).getByLabelText("Основание"), { target: { value: "Приказ" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Уволить" }));
    expect(await within(dialog).findByText("Основание изменения обязательно.")).toBeVisible();
    expect(within(dialog).getByLabelText("Основание")).toHaveValue("Приказ");
    expect(screen.queryByText("Увольнение сохранено")).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Отмена" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("keeps dynamic multi-line creation fields compact before the user enters long text", () => {
    expect(globalStyles).toContain(".single-stage-card-creation .field-editor-autosize-text {");
    expect(globalStyles).toContain(
      ".single-stage-card-creation .field-editor-autosize-text {\n  min-height: 42px;",
    );
    expect(globalStyles).toContain(
      ".single-stage-card-creation .admin-mutation-header small {\n  display: block;",
    );
    expect(globalStyles).toContain(".single-stage-card-creation {\n  width: min(100%, 72rem);");
    expect(globalStyles).toContain(
      ".card-presentation-shell {\n  width: min(100%, 72rem);\n  margin: 0 auto;",
    );
    expect(globalStyles).toContain(".single-stage-card-creation-block.is-attention {");
    expect(globalStyles).toContain(".single-stage-card-creation-field.is-filled {");
    expect(globalStyles).toContain(".data-panel:has(> .single-stage-card-creation) {");
    expect(globalStyles).toContain(
      ".data-panel:has(> .single-stage-card-creation) {\n  overflow: visible;\n  border-color: transparent;\n  background: transparent;",
    );
    expect(globalStyles).toContain(
      ".single-stage-card-creation .card-presentation-content {\n  display: grid;\n  gap: 16px;",
    );
    expect(globalStyles).toContain(".single-stage-card-creation-field.is-locked {");
    expect(globalStyles).toContain(".single-stage-card-creation-field.is-locked-attention {");
    expect(globalStyles).toContain(".card-draft-save-button.is-ready:not(:disabled) {");
    expect(globalStyles).toContain("@keyframes card-draft-save-pulse {");
    expect(globalStyles).toContain("@media (prefers-reduced-motion: reduce) {");
  });

  test("restores scroll-linked template block navigation while creating a card", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = input instanceof Request ? input.url : String(input);
        if (url.includes("/creation-preview")) {
          return Response.json({
            organization_id: organization.id,
            card_template_id: "template-1",
            display_value: "Шаблон",
            blocks: [
              {
                block_id: "block-person",
                code: "person",
                title: "ФИО",
                description: "Основные сведения",
                is_repeatable: false,
                fields: [
                  {
                    field_id: "field-name",
                    code: "name",
                    label: "Фамилия",
                    description: null,
                    field_type: "text",
                    required_mode: "required",
                    options: [],
                  },
                ],
              },
              {
                block_id: "block-details",
                code: "details",
                title: "Сведения",
                description: null,
                is_repeatable: false,
                fields: [
                  {
                    field_id: "field-note",
                    code: "note",
                    label: "Примечание",
                    description: null,
                    field_type: "text",
                    required_mode: "optional",
                    options: [],
                  },
                ],
              },
            ],
          });
        }
        return Response.json({ items: [] });
      }),
    );

    renderWorkspace();
    fireEvent.click(screen.getByRole("tab", { name: "Создать карточку" }));

    expect(await screen.findByLabelText("Базовый блок")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Сохранить черновик" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Организация карточки"), {
      target: { value: organization.id },
    });
    expect(await screen.findByLabelText("Фамилия")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Сохранить черновик" })).toBeEnabled();
    const navigator = screen.getByRole("navigation", { name: "Содержание карточки" });
    expect(within(navigator).getByRole("button", { name: /Базовый блок/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ФИО: нужно заполнить 1 из 1/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Сведения: не заполнено/ })).toBeInTheDocument();
    expect(document.getElementById("creation-card-block-block-person")).toHaveClass(
      "single-stage-card-creation-block",
      "is-attention",
    );
    expect(document.getElementById("creation-card-block-block-details")).toHaveClass(
      "single-stage-card-creation-block",
      "is-empty",
    );
  });

  test("shows the first template and its fields immediately with one sidebar draft action", () => {
    const schemaWithTemplateField: RegistrySchemaRead = {
      ...schema,
      blocks: [
        {
          id: "block-person",
          registry_id: "registry-1",
          code: "person",
          title: "ФИО",
          description: null,
          position: 0,
          is_repeatable: false,
          is_active: true,
          public_visible: true,
          public_editable: true,
        },
      ],
      fields: [
        {
          id: "field-name",
          block_id: "block-person",
          code: "name",
          label: "Фамилия",
          description: null,
          field_type: "text",
          position: 0,
          required_mode: "required",
          options_source_type: null,
          options_source_id: null,
          options_config_json: null,
          is_active: true,
          is_list_display: false,
          public_visible: true,
          public_editable: true,
        },
      ],
      templates: [
        {
          ...schema.templates[0],
          field_schema_json: { field_ids: ["field-name"] },
        },
        {
          ...schema.templates[0],
          id: "template-2",
          code: "other-template",
          name: "Другой шаблон",
          position: 2,
          field_schema_json: { field_ids: [] },
        },
      ],
    };

    renderWorkspace({ schema: schemaWithTemplateField });
    fireEvent.click(screen.getByRole("tab", { name: "Создать карточку" }));

    expect(screen.queryByLabelText("Шаблон карточки")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Фамилия")).toBeDisabled();
    const saveDraftButtons = screen.getAllByRole("button", { name: "Сохранить черновик" });
    expect(saveDraftButtons).toHaveLength(1);
    expect(saveDraftButtons[0].closest(".card-presentation-sidebar")).not.toBeNull();
  });

  test("uses the template layout sequence before an organization is selected", () => {
    const schemaWithLayoutOrder: RegistrySchemaRead = {
      ...schema,
      blocks: [
        {
          id: "block-person",
          registry_id: "registry-1",
          code: "person",
          title: "ФИО",
          description: null,
          position: 2,
          is_repeatable: false,
          is_active: true,
          public_visible: true,
          public_editable: true,
        },
        {
          id: "block-position",
          registry_id: "registry-1",
          code: "position",
          title: "Должность",
          description: null,
          position: 1,
          is_repeatable: false,
          is_active: true,
          public_visible: true,
          public_editable: true,
        },
      ],
      fields: [
        {
          id: "field-birth-date",
          block_id: "block-person",
          code: "birth_date",
          label: "Дата рождения",
          description: null,
          field_type: "date",
          position: 1,
          required_mode: "required",
          options_source_type: null,
          options_source_id: null,
          options_config_json: null,
          is_active: true,
          is_list_display: false,
          public_visible: true,
          public_editable: true,
        },
        {
          id: "field-name",
          block_id: "block-person",
          code: "name",
          label: "ФИО",
          description: null,
          field_type: "text",
          position: 2,
          required_mode: "required",
          options_source_type: null,
          options_source_id: null,
          options_config_json: null,
          is_active: true,
          is_list_display: false,
          public_visible: true,
          public_editable: true,
        },
        {
          id: "field-position-name",
          block_id: "block-position",
          code: "position_name",
          label: "Наименование должности",
          description: null,
          field_type: "text",
          position: 0,
          required_mode: "optional",
          options_source_type: null,
          options_source_id: null,
          options_config_json: null,
          is_active: true,
          is_list_display: false,
          public_visible: true,
          public_editable: true,
        },
      ],
      templates: [
        {
          ...schema.templates[0],
          field_schema_json: {
            field_ids: ["field-birth-date", "field-name", "field-position-name"],
            form_layout: {
              sections: [
                {
                  row: 2,
                  column: 1,
                  items: [
                    {
                      kind: "field",
                      field_id: "field-position-name",
                      row: 1,
                      column: 1,
                    },
                  ],
                },
                {
                  row: 1,
                  column: 1,
                  items: [
                    { kind: "field", field_id: "field-birth-date", row: 2, column: 1 },
                    { kind: "field", field_id: "field-name", row: 1, column: 1 },
                  ],
                },
              ],
            },
          },
        },
      ],
    };

    renderWorkspace({ schema: schemaWithLayoutOrder });
    fireEvent.click(screen.getByRole("tab", { name: "Создать карточку" }));

    const preview = document.querySelector(".single-stage-card-creation-template");
    expect(
      [
        ...(preview?.querySelectorAll(".single-stage-card-creation-block > header strong") ?? []),
      ].map((heading) => heading.textContent),
    ).toEqual(["ФИО", "Должность"]);
    expect(
      [
        ...document.querySelectorAll(
          "#creation-card-block-block-person .single-stage-card-creation-field > span",
        ),
      ].map((label) => label.textContent),
    ).toEqual(["ФИО *", "Дата рождения *"]);
  });

  test("shows the reference-list label instead of its stored identifier in a card row", async () => {
    const referenceItemId = "ffca44e1-85b0-47ad-99b0-cadcc2e757a5";
    const referenceCard: CardSummaryRead = {
      ...organizationUnitCardSummary,
      id: "card-reference-list",
      display_value: "Карточка со справочником",
      list_fields: [
        {
          field_id: "field-position-group",
          code: "position_group",
          label: "Группа должностей",
          field_type: "select",
          value: referenceItemId,
          display_value: "Высшая",
        },
      ],
    };

    renderWorkspace({ cards: [referenceCard] });

    expect(
      await screen.findByRole("button", { name: /Группа должностей: Высшая/ }),
    ).toBeInTheDocument();
    expect(screen.queryByText(referenceItemId)).not.toBeInTheDocument();
  });

  test("renders fixed creation actions in the shared card tab strip without a dropdown", () => {
    renderWorkspace();

    const tabList = screen.getByRole("tablist", { name: "Вкладки карточек" });
    expect(within(tabList).getByRole("tab", { name: "Создать карточку" })).toBeInTheDocument();
    expect(within(tabList).getByRole("tab", { name: "Ссылки на заполнение" })).toBeInTheDocument();
    expect(screen.queryByRole("menu", { name: "Создание карточек" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Создать карточку" })).not.toBeInTheDocument();
  });

  test("switches fixed utility tabs without rendering the card list beneath them", () => {
    renderWorkspace();

    fireEvent.click(screen.getByRole("tab", { name: "Создать карточку" }));
    expect(screen.getByRole("region", { name: "Создание карточки" })).toBeInTheDocument();
    const organizationControl = screen.getByLabelText("Организация карточки");
    expect(organizationControl).toBeInTheDocument();
    expect(organizationControl.closest(".admin-mutation-body")).not.toBeNull();
    expect(screen.queryByLabelText("Шаблон карточки")).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Текст карточки или поля")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Создать карточку" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Ссылки на заполнение" }));
    expect(screen.getByRole("region", { name: "Ссылки на создание карточек" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Закрыть вкладку Ссылки на заполнение" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Ссылки на заполнение" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  test("requires an explicit draft save before opening the created card", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void init;
      const url = input instanceof Request ? input.url : String(input);
      if (url.includes("/creation-preview")) {
        return Response.json({
          organization_id: organization.id,
          card_template_id: "template-1",
          display_value: "Шаблон",
          blocks: [
            {
              block_id: "block-1",
              code: "main",
              title: "Основной блок",
              description: null,
              is_repeatable: false,
              fields: [
                {
                  field_id: "field-1",
                  code: "name",
                  label: "Наименование",
                  description: null,
                  field_type: "text",
                  required_mode: "required",
                  options: [],
                },
              ],
            },
          ],
        });
      }
      if (url.endsWith("/cards/draft")) {
        return Response.json({
          id: "draft-card-1",
          registry_id: "registry-1",
          card_template_id: "template-1",
          organization_id: organization.id,
          org_unit_id: null,
          display_value: "Шаблон",
          lifecycle_status: "draft",
          public_view_enabled: true,
          public_edit_enabled: true,
          list_fields: [],
        });
      }
      return Response.json({ items: [] });
    });
    vi.stubGlobal("fetch", fetchMock);
    const onOpenCreatedCard = vi.fn().mockResolvedValue(undefined);
    renderWorkspace({ onOpenCreatedCard });

    fireEvent.click(screen.getByRole("tab", { name: "Создать карточку" }));
    expect(screen.getByLabelText("Организация карточки")).toHaveValue("");
    expect(screen.queryByLabelText("Шаблон карточки")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Сохранить черновик" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Организация карточки"), {
      target: { value: organization.id },
    });
    expect(screen.getByRole("button", { name: "Сохранить черновик" })).toBeEnabled();
    const field = await screen.findByLabelText("Наименование");
    expect(field).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Заполнить поле Наименование" }));
    expect(
      screen.getByText("Сначала сохраните черновик, чтобы заполнить поле «Наименование»."),
    ).toBeInTheDocument();
    expect(field.closest(".single-stage-card-creation-field")).toHaveClass(
      "is-locked",
      "is-locked-attention",
    );
    expect(screen.getByRole("button", { name: "Сохранить черновик" })).toHaveClass("is-attention");
    expect(
      screen.getByText("Базовый блок заполнен. Сохраните черновик, чтобы перейти к полям шаблона."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Сначала сохраните черновик — после этого можно заполнять поля шаблона."),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Сохранить черновик" }));

    await waitFor(() => expect(onOpenCreatedCard).toHaveBeenCalledWith("draft-card-1"));
    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/cards/draft")),
    ).toHaveLength(1);
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/cards/first-save"))).toBe(
      false,
    );
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).endsWith("/cards/draft-public-link")),
    ).toBe(false);
    const [, init] = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/cards/draft"))!;
    expect(JSON.parse(String(init?.body))).toEqual({
      public_access: {
        public_view_enabled: true,
        public_edit_enabled: true,
        fields: [],
      },
    });
  });

  test("clears card-list filters through the parent before opening a created card", async () => {
    let completeFilterReset: (() => void) | undefined;
    const onOpenCreatedCard = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          completeFilterReset = resolve;
        }),
    );
    const onSelectCard = vi.fn();
    renderWorkspace({ onOpenCreatedCard, onSelectCard });

    fireEvent.click(screen.getByRole("tab", { name: "Ссылки на заполнение" }));
    fireEvent.doubleClick(await screen.findByRole("button", { name: /Созданная карточка/ }));

    await waitFor(() => {
      expect(onOpenCreatedCard).toHaveBeenCalledWith("created-card-1");
    });
    expect(onSelectCard).not.toHaveBeenCalled();

    completeFilterReset?.();
    await waitFor(() => {
      expect(onSelectCard).toHaveBeenCalledWith("created-card-1");
    });
  });

  test("shows card-local organization units and retains an archived selected value", async () => {
    localStorage.setItem(
      "reg_engine.card_tabs.v1",
      JSON.stringify({ activeTab: "card:card-org-unit", openCardIds: ["card-org-unit"] }),
    );
    renderWorkspace({
      cards: [organizationUnitCardSummary],
      card: organizationUnitCard,
      selectedCardId: organizationUnitCard.id,
    });

    fireEvent.click(await screen.findByTestId("filled-field-item-org-unit"));

    const control = await screen.findByRole("group", { name: "Подразделение организации" });
    expect(
      within(control).getByRole("option", { name: "Отдел кадров / Архивировано" }),
    ).toHaveAttribute("aria-selected", "true");
    expect(within(control).getByRole("option", { name: "Управление образования" })).toBeEnabled();
    expect(
      within(control).getByRole("option", { name: "Отдел кадров / Архивировано" }),
    ).toBeDisabled();
  });

  test("does not render the attachments panel while filling a card", async () => {
    localStorage.setItem(
      "reg_engine.card_tabs.v1",
      JSON.stringify({ activeTab: "card:card-org-unit", openCardIds: ["card-org-unit"] }),
    );
    renderWorkspace({
      cards: [organizationUnitCardSummary],
      card: organizationUnitCard,
      selectedCardId: organizationUnitCard.id,
    });

    await screen.findByTestId("filled-field-item-org-unit");

    expect(screen.queryByRole("heading", { name: "Вложения" })).not.toBeInTheDocument();
  });

  test("uses the shared read-only base and collapsed public access for a saved draft", async () => {
    localStorage.setItem(
      "reg_engine.card_tabs.v1",
      JSON.stringify({ activeTab: "card:card-org-unit", openCardIds: ["card-org-unit"] }),
    );
    renderWorkspace({
      cards: [{ ...organizationUnitCardSummary, lifecycle_status: "draft" }],
      card: organizationUnitCard,
      selectedCardId: organizationUnitCard.id,
    });

    const baseBlock = await screen.findByLabelText("Базовый блок");
    expect(within(baseBlock).getByText("Шаблон", { selector: "output" })).toBeInTheDocument();
    expect(within(baseBlock).getByText(organizationUnitCard.display_value)).toBeInTheDocument();
    expect(within(baseBlock).getByText("Не указан")).toBeInTheDocument();
    expect(
      within(baseBlock).queryByRole("combobox", { name: "Организация карточки" }),
    ).not.toBeInTheDocument();
    expect(baseBlock.querySelector(".metadata-list")).toBeNull();

    expect(screen.getByRole("status", { name: "Статус карточки" })).toHaveTextContent("Черновик");

    const accessSummary = within(baseBlock).getByText("Публичный доступ", { selector: "summary" });
    const accessDetails = accessSummary.closest("details");
    expect(accessDetails).not.toBeNull();
    expect(accessDetails).not.toHaveAttribute("open");

    fireEvent.click(accessSummary);

    expect(accessDetails).toHaveAttribute("open");
    expect(
      within(accessDetails!).getByRole("checkbox", { name: "Публичный просмотр карточки" }),
    ).toBeInTheDocument();
    expect(within(accessDetails!).getByText("Показывать поля")).toBeInTheDocument();
    expect(
      within(accessDetails!).getByRole("button", { name: "Публичная ссылка" }),
    ).toBeInTheDocument();
  });

  test("renders the server-provided creator in the selected card and card list detail", async () => {
    const creatorDisplayName = "Иванов Иван Иванович";
    localStorage.setItem(
      "reg_engine.card_tabs.v1",
      JSON.stringify({ activeTab: "card:card-org-unit", openCardIds: ["card-org-unit"] }),
    );
    renderWorkspace({
      cards: [{ ...organizationUnitCardSummary, creator_display_name: creatorDisplayName }],
      card: { ...organizationUnitCard, creator_display_name: creatorDisplayName },
      selectedCardId: organizationUnitCard.id,
    });

    const baseBlock = await screen.findByLabelText("Базовый блок");
    expect(within(baseBlock).getByText("Создатель")).toBeVisible();
    expect(within(baseBlock).getByText(creatorDisplayName)).toBeVisible();

    fireEvent.click(screen.getByRole("tab", { name: "Список карточек" }));
    expect(screen.getByText(new RegExp(`Создатель: ${creatorDisplayName}`))).toBeVisible();
  });

  test("hides saved-card public access controls from users without management rights", async () => {
    localStorage.setItem(
      "reg_engine.card_tabs.v1",
      JSON.stringify({ activeTab: "card:card-org-unit", openCardIds: ["card-org-unit"] }),
    );
    renderWorkspace({
      cards: [organizationUnitCardSummary],
      card: { ...organizationUnitCard, can_manage: false },
      selectedCardId: organizationUnitCard.id,
    });

    const baseBlock = await screen.findByLabelText("Базовый блок");
    expect(
      within(baseBlock).queryByText("Публичный доступ", { selector: "summary" }),
    ).not.toBeInTheDocument();
    expect(
      within(baseBlock).queryByRole("checkbox", { name: "Публичный просмотр карточки" }),
    ).not.toBeInTheDocument();
    const notificationButton = await within(baseBlock).findByRole("button", {
      name: "Уведомлять об изменениях",
    });
    expect(notificationButton).toHaveAttribute("aria-pressed", "false");
    expect(baseBlock.querySelector(".card-base-block-header")).toContainElement(notificationButton);
    expect(document.querySelector(".card-change-notification-actions")).toBeNull();
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([input]) =>
          String(input).includes(
            `/api/v1/cards/${organizationUnitCard.id}/change-notification-subscription`,
          ),
        ),
    ).toBe(true);
  });

  test("keeps the readable-card notification control available when presentation loading fails", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.includes("/presentation")) {
        return Response.json({ detail: "layout unavailable" }, { status: 500 });
      }
      if (url.includes("/change-notification-subscription")) {
        return Response.json({ enabled: false });
      }
      return Response.json({ items: [] });
    });
    vi.stubGlobal("fetch", fetchMock);
    localStorage.setItem(
      "reg_engine.card_tabs.v1",
      JSON.stringify({ activeTab: "card:card-org-unit", openCardIds: ["card-org-unit"] }),
    );

    renderWorkspace({
      cards: [organizationUnitCardSummary],
      card: { ...organizationUnitCard, can_manage: false },
      selectedCardId: organizationUnitCard.id,
    });

    expect(await screen.findByRole("button", { name: "Уведомлять об изменениях" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).includes(
          `/api/v1/cards/${organizationUnitCard.id}/change-notification-subscription`,
        ),
      ),
    ).toBe(true);
  });

  test("does not render a public-link action while creating a card", () => {
    renderWorkspace();

    fireEvent.click(screen.getByRole("tab", { name: "Создать карточку" }));

    expect(screen.queryByRole("button", { name: "Публичная ссылка" })).not.toBeInTheDocument();
  });
});

function renderWorkspace({
  cardLifecycleStatus = "",
  isSuperuser = false,
  onCardLifecycleStatusChange = vi.fn(),
  onOpenCreatedCard = vi.fn().mockResolvedValue(undefined),
  onSelectCard = vi.fn(),
  cards = [],
  card = null,
  selectedCardId = "",
  schema: workspaceSchema = schema,
}: {
  cardLifecycleStatus?: string;
  isSuperuser?: boolean;
  onCardLifecycleStatusChange?: (value: string) => void;
  onOpenCreatedCard?: (cardId: string) => Promise<void>;
  onSelectCard?: (cardId: string) => void;
  cards?: CardSummaryRead[];
  card?: CardRead | null;
  selectedCardId?: string;
  schema?: RegistrySchemaRead;
} = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const content = (nextCards = cards, nextCard = card) => (
    <QueryClientProvider client={queryClient}>
      <CardsWorkspace
        isSuperuser={isSuperuser}
        cardLifecycleStatus={cardLifecycleStatus}
        onCardLifecycleStatusChange={onCardLifecycleStatusChange}
        cards={nextCards}
        card={nextCard}
        schema={workspaceSchema}
        token="test-token"
        organizations={[organization]}
        selectedCardId={selectedCardId}
        cardSearch=""
        cardOrganizationIds={[]}
        cardIncludeDescendantOrganizations
        cardTemplateIds={[]}
        cardFieldFilters={[]}
        includeArchivedCards={false}
        onSelectCard={onSelectCard}
        onCardSearchChange={vi.fn()}
        onCardOrganizationIdsChange={vi.fn()}
        onCardIncludeDescendantOrganizationsChange={vi.fn()}
        onCardTemplateIdsChange={vi.fn()}
        onCardFieldFiltersChange={vi.fn()}
        onIncludeArchivedCardsChange={vi.fn()}
        onOpenCreatedCard={onOpenCreatedCard}
      />
    </QueryClientProvider>
  );
  const rendered = render(content());
  return {
    ...rendered,
    queryClient,
    rerenderCards: (nextCards: CardSummaryRead[], nextCard: CardRead | null) =>
      rendered.rerender(content(nextCards, nextCard)),
  };
}

const organizationUnitCard: CardRead = {
  id: "card-org-unit",
  registry_id: "registry-1",
  card_template_id: "template-1",
  organization_id: organization.id,
  display_value: "Карточка подразделения",
  can_manage: true,
  fields: {},
  blocks: {
    "block-org-unit": {
      block_id: "block-org-unit",
      code: "main",
      instances: [
        {
          block_instance_id: null,
          ordinal: 0,
          fields: {
            "field-org-unit": {
              field_id: "field-org-unit",
              code: "org_unit",
              field_type: "org_unit_ref",
              value: "archived-local",
            },
          },
        },
      ],
    },
  },
};

const organizationUnitCardSummary: CardSummaryRead = {
  id: organizationUnitCard.id,
  registry_id: organizationUnitCard.registry_id,
  card_template_id: organizationUnitCard.card_template_id,
  card_template_name: "Шаблон",
  organization_id: organization.id,
  org_unit_id: null,
  display_value: organizationUnitCard.display_value,
  lifecycle_status: "active",
  public_view_enabled: true,
  public_edit_enabled: true,
  list_fields: [],
};

function organizationUnitPresentation() {
  const block = {
    id: "block-org-unit",
    registry_id: "registry-1",
    code: "main",
    title: "Основные сведения",
    description: null,
    position: 0,
    is_repeatable: false,
    is_active: true,
    public_visible: true,
    public_editable: true,
    layout_columns: 12,
    display_config_json: null,
  };
  const field = {
    id: "field-org-unit",
    block_id: block.id,
    code: "org_unit",
    label: "Подразделение организации",
    description: null,
    field_type: "org_unit_ref",
    position: 0,
    required_mode: "not_required",
    options_source_type: null,
    options_source_id: null,
    options_config_json: null,
    display_config_json: null,
    is_active: true,
    is_list_display: false,
    public_visible: true,
    public_editable: true,
  };
  return {
    card_id: organizationUnitCard.id,
    registry_id: "registry-1",
    registry_name: "Реестр",
    card_template_id: "template-1",
    card_template_name: "Шаблон",
    layout: {
      version: "card_template_layout_v1",
      revision: "org-unit-test",
      card_template_id: "template-1",
      registry_id: "registry-1",
      structure: { blocks: [block], fields: [field] },
      form_layout: {
        columns: 12,
        sections: [
          {
            id: "section-org-unit",
            block_id: block.id,
            row: 1,
            column: 1,
            row_span: 1,
            column_span: 12,
            items: [
              {
                id: "item-org-unit",
                kind: "field",
                field_id: field.id,
                row: 1,
                column: 1,
                row_span: 1,
                column_span: 12,
                text: null,
              },
            ],
          },
        ],
      },
      print_views: [],
      export_settings: { formats: [] },
      sync_status: { has_errors: false, errors: [], warnings: [], mapping: {} },
    },
  };
}
