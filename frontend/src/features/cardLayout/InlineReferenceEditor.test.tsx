import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { ReferenceListRead } from "@/api/types";

import { InlineReferenceEditor } from "./InlineReferenceEditor";

const createdReferenceList: ReferenceListRead = {
  id: "reference-created",
  registry_id: "registry-1",
  owner_organization_id: null,
  code: "statusy",
  name: "Статусы",
  description: null,
  inherit_to_descendants: false,
  locked_for_descendants: false,
  managed_by_system_only: false,
  is_active: true,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderWithQueryClient(children: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>);
}

describe("InlineReferenceEditor", () => {
  test("validates and creates a reference list before selecting it", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onReferenceDataChanged = vi.fn();
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        return Response.json(createdReferenceList);
      }
      return Response.json({ items: [] });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithQueryClient(
      <InlineReferenceEditor
        context={{ token: "token", registryId: "registry-1", onReferenceDataChanged }}
        referenceLists={[]}
        selectedReferenceListId={null}
        mode="create"
        onSelect={onSelect}
        onBack={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Создать справочник" }));
    expect(screen.getByText("Введите название справочника")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("Название справочника"), "Статусы");
    expect(screen.queryByText("Введите название справочника")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Создать справочник" }));

    await waitFor(() => expect(onSelect).toHaveBeenCalledWith(createdReferenceList));
    expect(onReferenceDataChanged).toHaveBeenCalled();
    const createCall = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(createCall).toBeTruthy();
    expect(JSON.parse(String(createCall?.[1]?.body))).toMatchObject({
      code: "statusy",
      name: "Статусы",
    });
  });

  test("manages selected reference items without leaving the field editor", async () => {
    const user = userEvent.setup();
    let items = [
      {
        id: "item-a",
        list_id: createdReferenceList.id,
        parent_id: null,
        code: "a",
        label: "Первый",
        description: null,
        position: 0,
        is_active: true,
      },
      {
        id: "item-b",
        list_id: createdReferenceList.id,
        parent_id: null,
        code: "b",
        label: "Второй",
        description: null,
        position: 1,
        is_active: true,
      },
    ];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (!init?.method || init.method === "GET") {
        return Response.json({ items });
      }
      const body = init.body ? JSON.parse(String(init.body)) : {};
      if (init.method === "POST" && url.endsWith("/items")) {
        const created = {
          ...items[0],
          id: "item-c",
          code: body.code,
          label: body.label,
          position: body.position,
        };
        items = [...items, created];
        return Response.json(created);
      }
      if (init.method === "PATCH" && url.includes("/reference-items/")) {
        const itemId = url.split("/").at(-1);
        items = items.map((item) => (item.id === itemId ? { ...item, ...body } : item));
        return Response.json(items.find((item) => item.id === itemId));
      }
      if (init.method === "DELETE") {
        const itemId = url.split("/").at(-1);
        const archived = items.find((item) => item.id === itemId)!;
        items = items.filter((item) => item.id !== itemId);
        return Response.json({ ...archived, is_active: false });
      }
      if (init.method === "PATCH" && url.includes("/reference-lists/")) {
        return Response.json({ ...createdReferenceList, ...body });
      }
      throw new Error(`Unexpected request: ${init?.method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithQueryClient(
      <InlineReferenceEditor
        context={{
          token: "token",
          registryId: "registry-1",
          onReferenceDataChanged: vi.fn(),
        }}
        referenceLists={[createdReferenceList]}
        selectedReferenceListId={createdReferenceList.id}
        mode="manage"
        onSelect={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    expect(await screen.findByText("Первый")).toBeInTheDocument();
    expect(screen.getByText("Второй")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Добавить элемент" }));
    await user.click(screen.getByRole("button", { name: "Создать элемент" }));
    expect(screen.getByText("Введите название элемента")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Название элемента"), "Третий");
    await user.click(screen.getByRole("button", { name: "Создать элемент" }));
    expect(await screen.findByText("Третий")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Изменить элемент Первый" }));
    const itemName = screen.getByLabelText("Название элемента");
    await user.clear(itemName);
    await user.type(itemName, "Первый обновлённый");
    await user.click(screen.getByRole("button", { name: "Сохранить элемент" }));
    expect(await screen.findByText("Первый обновлённый")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Переместить вверх Второй" }));
    await waitFor(() => {
      const reorderCall = fetchMock.mock.calls.find(
        ([input, init]) =>
          String(input).endsWith("/reference-items/item-b") &&
          init?.method === "PATCH" &&
          JSON.parse(String(init.body)).position === 0,
      );
      expect(reorderCall).toBeTruthy();
    });

    await user.click(screen.getByRole("button", { name: "Архивировать элемент Второй" }));
    await user.click(screen.getByRole("button", { name: "Подтвердить архивирование" }));
    await waitFor(() => expect(screen.queryByText("Второй")).not.toBeInTheDocument());
  });

  test("keeps system-managed reference lists read-only", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          items: [
            {
              id: "item-system",
              list_id: createdReferenceList.id,
              parent_id: null,
              code: "system",
              label: "Системный элемент",
              description: null,
              position: 0,
              is_active: true,
            },
          ],
        }),
      ),
    );

    renderWithQueryClient(
      <InlineReferenceEditor
        context={{
          token: "token",
          registryId: "registry-1",
          onReferenceDataChanged: vi.fn(),
        }}
        referenceLists={[{ ...createdReferenceList, managed_by_system_only: true }]}
        selectedReferenceListId={createdReferenceList.id}
        mode="manage"
        onSelect={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    expect(await screen.findByText("Системный элемент")).toBeInTheDocument();
    expect(screen.getByLabelText("Название справочника")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Добавить элемент" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Изменить элемент Системный элемент" }),
    ).not.toBeInTheDocument();
  });
});
