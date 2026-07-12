import "@testing-library/jest-dom/vitest";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

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
});

describe("CardsWorkspace", () => {
  test("opens card creation in the shared card tab strip instead of below the list", () => {
    renderWorkspace();

    fireEvent.click(screen.getByRole("button", { name: "Создать карточку" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Создать карточку" }));

    expect(screen.getByRole("tab", { name: "Создать карточку" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Закрыть вкладку Создать карточку" }),
    ).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Текст карточки или поля")).not.toBeInTheDocument();
  });

  test("opens creation-link actions as their own closeable tabs", () => {
    renderWorkspace();

    fireEvent.click(screen.getByRole("button", { name: "Создать карточку" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Создать ссылку на создание карточки" }));

    expect(screen.getByRole("tab", { name: "Создать ссылку" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Закрыть вкладку Создать ссылку" }));

    fireEvent.click(screen.getByRole("button", { name: "Создать карточку" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Список ссылок" }));

    expect(screen.getByRole("tab", { name: "Список ссылок" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Закрыть вкладку Список ссылок" }),
    ).toBeInTheDocument();
  });
});

function renderWorkspace() {
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
        onSelectCard={vi.fn()}
        onCardSearchChange={vi.fn()}
        onCardOrganizationIdsChange={vi.fn()}
        onCardIncludeDescendantOrganizationsChange={vi.fn()}
        onCardTemplateIdsChange={vi.fn()}
        onCardFieldFiltersChange={vi.fn()}
        onIncludeArchivedCardsChange={vi.fn()}
      />
    </QueryClientProvider>,
  );
}
