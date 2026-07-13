import "@testing-library/jest-dom/vitest";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { OrganizationRead, RegistrySchemaRead } from "@/api/types";

import { CardsWorkspace } from "./CardsWorkspace";

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
    card_title_label: "Наименование карточки",
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
                  display_name: "Созданная карточка",
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
  test("renders fixed creation actions in the shared card tab strip without a dropdown", () => {
    renderWorkspace();

    const tabList = screen.getByRole("tablist", { name: "Вкладки карточек" });
    expect(within(tabList).getByRole("tab", { name: "Создать карточку" })).toBeInTheDocument();
    expect(within(tabList).getByRole("tab", { name: "Создать ссылку" })).toBeInTheDocument();
    expect(within(tabList).getByRole("tab", { name: "Список ссылок" })).toBeInTheDocument();
    expect(screen.queryByRole("menu", { name: "Создание карточек" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Создать карточку" })).not.toBeInTheDocument();
  });

  test("switches fixed utility tabs without rendering the card list beneath them", () => {
    renderWorkspace();

    fireEvent.click(screen.getByRole("tab", { name: "Создать карточку" }));
    expect(screen.getByRole("form", { name: "Создать карточку" })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Текст карточки или поля")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Создать ссылку" }));
    expect(screen.getByRole("region", { name: "Ссылки на создание карточек" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Закрыть вкладку Создать ссылку" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Список ссылок" }));
    expect(screen.getByRole("tab", { name: "Список ссылок" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
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

    fireEvent.click(screen.getByRole("tab", { name: "Список ссылок" }));
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
});

function renderWorkspace({
  onOpenCreatedCard = vi.fn().mockResolvedValue(undefined),
  onSelectCard = vi.fn(),
}: {
  onOpenCreatedCard?: (cardId: string) => Promise<void>;
  onSelectCard?: (cardId: string) => void;
} = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <CardsWorkspace
        cards={[]}
        card={null}
        schema={schema}
        token="test-token"
        organizations={[organization]}
        selectedCardId=""
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
    </QueryClientProvider>,
  );
}
