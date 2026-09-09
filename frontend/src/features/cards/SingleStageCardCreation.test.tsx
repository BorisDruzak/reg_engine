import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { CardTemplateRead, FormBlockRead, FormFieldRead, OrganizationRead } from "@/api/types";

import { SingleStageCardCreation } from "./SingleStageCardCreation";

const organization: OrganizationRead = {
  id: "organization-1",
  parent_id: null,
  code: "organization",
  name: "Организация",
  type: "organization",
  is_active: true,
};

const block: FormBlockRead = {
  id: "block-employment",
  registry_id: "registry-1",
  code: "employment",
  title: "Трудовая деятельность",
  description: null,
  position: 0,
  is_repeatable: false,
  is_active: true,
  public_visible: true,
  public_editable: true,
};

const experienceField: FormFieldRead = {
  id: "field-experience",
  block_id: block.id,
  code: "experience",
  label: "Стаж работы",
  description: null,
  field_type: "work_experience",
  position: 0,
  required_mode: "required",
  options_source_type: null,
  options_source_id: null,
  options_config_json: null,
  is_active: true,
  is_list_display: false,
  public_visible: true,
  public_editable: true,
};

const template: CardTemplateRead = {
  id: "template-1",
  registry_id: "registry-1",
  code: "employment",
  name: "Трудовая карточка",
  description: null,
  position: 0,
  field_schema_json: { field_ids: [experienceField.id] },
  default_values_json: [],
  is_active: true,
};

describe("SingleStageCardCreation", () => {
  afterEach(() => vi.unstubAllGlobals());

  test("requires organization and uses the first active template without sending a title or template", async () => {
    const requests: { url: string; body: unknown }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        requests.push({
          url: String(input),
          body: init?.body ? JSON.parse(String(init.body)) : null,
        });
        return Response.json(
          String(input).includes("creation-preview")
            ? {
                organization_id: organization.id,
                card_template_id: template.id,
                display_value: "Не заполнено",
                blocks: [],
              }
            : { id: "new-card" },
        );
      }),
    );
    const onCardCreated = vi.fn();
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <SingleStageCardCreation
          token="token"
          organizations={[organization]}
          templates={[
            { ...template, id: "inactive", is_active: false },
            { ...template, id: "z-template", name: "Альтернативная карточка" },
            template,
          ]}
          schemaBlocks={[block]}
          schemaFields={[experienceField]}
          onCancel={() => undefined}
          onCardCreated={onCardCreated}
        />
      </QueryClientProvider>,
    );
    expect(screen.queryByLabelText("Наименование карточки")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Шаблон карточки" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Организация карточки")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Сохранить черновик" })).toBeDisabled();
    expect(requests).toHaveLength(0);
    fireEvent.change(screen.getByLabelText("Организация карточки"), {
      target: { value: organization.id },
    });
    await waitFor(() =>
      expect(
        requests.some(({ url }) => url.includes("card-templates/template-1/creation-preview")),
      ).toBe(true),
    );
    fireEvent.click(screen.getByRole("button", { name: "Сохранить черновик" }));
    await waitFor(() => expect(onCardCreated).toHaveBeenCalledWith("new-card"));
    expect(requests.find(({ url }) => url.endsWith("cards/draft"))?.body).toEqual({
      public_access: { public_view_enabled: true, public_edit_enabled: true, fields: [] },
    });
  });

  test("keeps an absent required work experience incomplete while its locked editor shows zero defaults", () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <SingleStageCardCreation
          token="token"
          organizations={[organization]}
          templates={[template]}
          schemaBlocks={[block]}
          schemaFields={[experienceField]}
          onCancel={() => undefined}
          onCardCreated={async () => undefined}
        />
      </QueryClientProvider>,
    );

    expect(screen.getByRole("button", { name: "Сохранить черновик" })).toBeDisabled();
    const experienceControl = screen.getByRole("group", { name: "Стаж работы" });
    expect(experienceControl).toBeInTheDocument();
    for (const part of ["дни", "месяцы", "годы"]) {
      const experienceInput = screen.getByRole("textbox", { name: `Стаж работы, ${part}` });
      expect(experienceInput).toHaveValue("0");
      expect(experienceInput).toBeDisabled();
    }
    expect(experienceControl.closest(".single-stage-card-creation-field")).toHaveClass(
      "is-required-missing",
    );
  });
});
