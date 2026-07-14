import "@testing-library/jest-dom/vitest";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { CardTemplateRead, OrganizationRead } from "@/api/types";

import { CardCreationLinksPanel } from "./CardCreationLinksPanel";

let clipboardWrite: ReturnType<typeof vi.fn>;

beforeEach(() => {
  clipboardWrite = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: clipboardWrite },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify({ items: creationLinks }), {
          headers: { "Content-Type": "application/json" },
        }),
    ),
  );
});

afterEach(() => vi.unstubAllGlobals());

describe("CardCreationLinksPanel", () => {
  test("copies a creation URL when its text is clicked", async () => {
    renderPanel();

    const [urlInput] = await screen.findAllByLabelText("Ссылка на создание");
    await act(async () => {
      fireEvent.click(urlInput);
    });

    expect(clipboardWrite).toHaveBeenCalledWith(
      `${window.location.origin}/public/create/creation-token`,
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Ссылка скопирована");
  });

  test("shows created cards separately and opens a selected card internally on double click", async () => {
    const onOpenCard = vi.fn();
    const { container } = renderPanel({ onOpenCard });

    await screen.findByText("Карточка садика");
    const createdCards = screen.getByRole("region", { name: "Созданные карточки" });
    expect(createdCards).toHaveTextContent("Карточка садика");
    expect(createdCards).toHaveTextContent("Карточка школы");
    expect(createdCards).toHaveTextContent("Базовый шаблон");
    expect(createdCards).toHaveTextContent("Дополнительный шаблон");
    expect(screen.queryByDisplayValue(/\/public\/edit\//)).not.toBeInTheDocument();
    expect(container.querySelector("details")).not.toBeInTheDocument();

    fireEvent.doubleClick(screen.getByRole("button", { name: /Карточка школы/ }));

    expect(onOpenCard).toHaveBeenCalledWith("card-2");
  });
});

function renderPanel({ onOpenCard = vi.fn() }: { onOpenCard?: (cardId: string) => void } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <CardCreationLinksPanel
        mode="manage"
        organizations={[organization]}
        registryId="registry-1"
        templates={[template]}
        token="admin-token"
        onOpenCard={onOpenCard}
      />
    </QueryClientProvider>,
  );
}

const organization: OrganizationRead = {
  id: "organization-1",
  parent_id: null,
  code: "organization",
  name: "Организация",
  type: "organization",
  is_active: true,
};

const template: CardTemplateRead = {
  id: "template-1",
  registry_id: "registry-1",
  code: "template",
  name: "Базовый шаблон",
  description: null,
  position: 1,
  field_schema_json: {},
  default_values_json: [],
  is_active: true,
};

const creationLink = {
  id: "creation-link-1",
  registry_id: "registry-1",
  card_template_id: template.id,
  card_template_name: template.name,
  raw_token: "creation-token",
  created_at: "2026-07-12T12:00:00Z",
  closed_at: null,
  organizations: [{ id: organization.id, name: organization.name }],
  created_cards: [
    {
      card_id: "card-1",
      display_name: "Карточка садика",
      organization_id: organization.id,
      organization_name: organization.name,
      child_public_link_id: "child-link-1",
      child_raw_token: "child-token-1",
    },
  ],
};

const secondCreationLink = {
  ...creationLink,
  id: "creation-link-2",
  card_template_id: "template-2",
  card_template_name: "Дополнительный шаблон",
  raw_token: "creation-token-2",
  created_cards: [
    {
      card_id: "card-2",
      display_name: "Карточка школы",
      organization_id: organization.id,
      organization_name: organization.name,
      child_public_link_id: "child-link-2",
      child_raw_token: "child-token-2",
    },
  ],
};

const creationLinks = [creationLink, secondCreationLink];
