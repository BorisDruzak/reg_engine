import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";

import type { OrganizationRead, OrganizationTreeNodeRead, OrgUnitRead } from "@/api/types";

import { OrganizationsTable } from "./OrganizationsTable";

const administration: OrganizationRead = {
  id: "organization-administration",
  parent_id: null,
  code: "administration",
  name: "Администрация",
  type: "organization",
  is_active: true,
};

const school: OrganizationRead = {
  id: "organization-school",
  parent_id: administration.id,
  code: "school_1",
  name: "Школа 1",
  type: "organization",
  is_active: true,
};

const organizationTree: OrganizationTreeNodeRead[] = [
  {
    ...administration,
    children: [],
  },
];

const administrationUnits: OrgUnitRead[] = [
  {
    id: "unit-education",
    organization_id: administration.id,
    parent_id: null,
    code: "education",
    name: "Управление образования",
    type: "management",
    is_active: true,
  },
  {
    id: "unit-preschool",
    organization_id: administration.id,
    parent_id: "unit-education",
    code: "preschool",
    name: "Отдел дошкольного образования",
    type: "department",
    is_active: true,
  },
  {
    id: "unit-accounting",
    organization_id: administration.id,
    parent_id: null,
    code: "accounting",
    name: "Отдел бухгалтерии",
    type: "department",
    is_active: true,
  },
  {
    id: "unit-archive",
    organization_id: administration.id,
    parent_id: "unit-education",
    code: "archive",
    name: "Архивный отдел",
    type: "department",
    is_active: false,
  },
];

afterEach(() => {
  vi.unstubAllGlobals();
});

test("manages a separate management and department tree for one organization", async () => {
  const user = userEvent.setup();
  stubOrgUnitApi();
  renderOrganizations();

  await user.click(screen.getByRole("button", { name: "Подразделения Администрация" }));

  expect(
    await screen.findByRole("heading", { name: "Подразделения: Администрация" }),
  ).toBeVisible();
  expect(screen.getByText("Управление образования")).toBeVisible();
  expect(screen.getByText("Отдел дошкольного образования")).toBeVisible();
  expect(screen.getByText("Отдел бухгалтерии")).toBeVisible();
  expect(screen.queryByText("Школа 1")).not.toBeInTheDocument();
});

test("creates a management as a root unit", async () => {
  const user = userEvent.setup();
  const fetchMock = stubOrgUnitApi();
  renderOrganizations();

  await user.click(screen.getByRole("button", { name: "Подразделения Администрация" }));
  await screen.findByRole("heading", { name: "Подразделения: Администрация" });
  await user.click(screen.getByRole("button", { name: "Добавить управление" }));
  await user.type(screen.getByLabelText("Название подразделения"), "Управление культуры");
  await user.click(screen.getByRole("button", { name: "Создать" }));

  await waitFor(() => {
    const createCall = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(createCall).toBeTruthy();
    expect(JSON.parse(String(createCall?.[1]?.body))).toMatchObject({
      name: "Управление культуры",
      parent_id: null,
      unit_type: "management",
    });
  });
});

test("offers active managements of the selected organization as department parents", async () => {
  const user = userEvent.setup();
  stubOrgUnitApi({
    [school.id]: [
      {
        id: "unit-school-management",
        organization_id: school.id,
        parent_id: null,
        code: "school_management",
        name: "Управление школы",
        type: "management",
        is_active: true,
      },
    ],
  });
  renderOrganizations();

  await user.click(screen.getByRole("button", { name: "Подразделения Администрация" }));
  await screen.findByRole("heading", { name: "Подразделения: Администрация" });
  await user.click(screen.getByRole("button", { name: "Добавить отдел" }));

  const parentSelect = screen.getByLabelText("Родительское управление");
  expect(screen.getByRole("option", { name: "Управление образования" })).toBeEnabled();
  expect(screen.queryByRole("option", { name: "Управление школы" })).not.toBeInTheDocument();
  expect(parentSelect).toHaveValue("");
});

test("names active child departments before archiving a management", async () => {
  const user = userEvent.setup();
  stubOrgUnitApi();
  renderOrganizations();

  await user.click(screen.getByRole("button", { name: "Подразделения Администрация" }));
  await screen.findByRole("heading", { name: "Подразделения: Администрация" });
  await user.click(
    screen.getByRole("button", { name: "Архивировать подразделение Управление образования" }),
  );

  const dialog = await screen.findByRole("dialog", { name: "Архивировать подразделение" });
  expect(dialog).toHaveTextContent("Отдел дошкольного образования");
  expect(dialog).not.toHaveTextContent("Архивный отдел");
});

function renderOrganizations() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <OrganizationsTable
        organizations={[administration, school]}
        organizationTree={organizationTree}
        token="test-token"
      />
    </QueryClientProvider>,
  );
}

function stubOrgUnitApi(unitOverrides: Record<string, OrgUnitRead[]> = {}) {
  const unitsByOrganization: Record<string, OrgUnitRead[]> = {
    [administration.id]: administrationUnits,
    [school.id]: [],
    ...unitOverrides,
  };
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const organizationMatch = url.match(/\/organizations\/([^/]+)\/org-units$/);
    if (organizationMatch && init?.method !== "POST") {
      return Response.json({ items: unitsByOrganization[organizationMatch[1]] ?? [] });
    }
    if (organizationMatch && init?.method === "POST") {
      const payload = JSON.parse(String(init.body));
      return Response.json({
        id: "unit-created",
        organization_id: organizationMatch[1],
        is_active: true,
        ...payload,
      });
    }
    return Response.json({ detail: "Not Found" }, { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
