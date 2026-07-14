import "@testing-library/jest-dom/vitest";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { CardRead, CardSummaryRead, OrganizationRead, RegistrySchemaRead } from "@/api/types";

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
  test("shows the reference-list label instead of its stored identifier in a card row", async () => {
    const referenceItemId = "ffca44e1-85b0-47ad-99b0-cadcc2e757a5";
    const referenceCard: CardSummaryRead = {
      ...organizationUnitCardSummary,
      id: "card-reference-list",
      display_name: "Карточка со справочником",
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
});

function renderWorkspace({
  onOpenCreatedCard = vi.fn().mockResolvedValue(undefined),
  onSelectCard = vi.fn(),
  cards = [],
  card = null,
  selectedCardId = "",
}: {
  onOpenCreatedCard?: (cardId: string) => Promise<void>;
  onSelectCard?: (cardId: string) => void;
  cards?: CardSummaryRead[];
  card?: CardRead | null;
  selectedCardId?: string;
} = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <CardsWorkspace
        cards={cards}
        card={card}
        schema={schema}
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
    </QueryClientProvider>,
  );
}

const organizationUnitCard: CardRead = {
  id: "card-org-unit",
  registry_id: "registry-1",
  card_template_id: "template-1",
  organization_id: organization.id,
  display_name: "Карточка подразделения",
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
  display_name: organizationUnitCard.display_name,
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
