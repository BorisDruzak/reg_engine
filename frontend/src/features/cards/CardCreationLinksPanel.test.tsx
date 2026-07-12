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
        new Response(JSON.stringify({ items: [creationLink] }), {
          headers: { "Content-Type": "application/json" },
        }),
    ),
  );
});

afterEach(() => vi.unstubAllGlobals());

describe("CardCreationLinksPanel", () => {
  test("copies a creation URL when its text is clicked", async () => {
    renderPanel();

    const urlInput = await screen.findByLabelText("Ссылка на создание");
    await act(async () => {
      fireEvent.click(urlInput);
    });

    expect(clipboardWrite).toHaveBeenCalledWith(
      `${window.location.origin}/public/create/creation-token`,
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Ссылка скопирована");
  });
});

function renderPanel() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <CardCreationLinksPanel
        mode="list"
        organizations={[organization]}
        registryId="registry-1"
        templates={[template]}
        token="admin-token"
        onShowList={vi.fn()}
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
  name: "Шаблон",
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
  created_cards: [],
};
