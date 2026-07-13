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
    children: [
      {
        ...school,
        children: [],
      },
    ],
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

const unsupportedOrgUnitType: OrgUnitRead = {
  id: "unit-unsupported",
  organization_id: administration.id,
  parent_id: null,
  code: "unsupported",
  name: "Неизвестное подразделение",
  // @ts-expect-error OrgUnitRead only permits management and department values.
  type: "unsupported",
  is_active: true,
};

void unsupportedOrgUnitType;

afterEach(() => {
  vi.unstubAllGlobals();
});

test("opens only the clicked organization card, including for child organizations", async () => {
  const user = userEvent.setup();
  stubOrgUnitApi();
  renderOrganizations();

  await user.click(screen.getByRole("treeitem", { name: administration.name }));
  expect(
    await screen.findByRole("heading", { name: `Подразделения: ${administration.name}` }),
  ).toBeVisible();
  expect(
    screen.queryByRole("heading", { name: `Подразделения: ${school.name}` }),
  ).not.toBeInTheDocument();

  await user.click(screen.getByRole("treeitem", { name: school.name }));
  expect(
    await screen.findByRole("heading", { name: `Подразделения: ${school.name}` }),
  ).toBeVisible();
  expect(
    screen.queryByRole("heading", { name: `Подразделения: ${administration.name}` }),
  ).not.toBeInTheDocument();
});

test("toggles an organization card from the focused row with Enter and Space", async () => {
  const user = userEvent.setup();
  stubOrgUnitApi();
  renderOrganizations();

  const row = screen.getByRole("treeitem", { name: administration.name });
  row.focus();
  expect(row).toHaveFocus();

  await user.keyboard("{Enter}");
  expect(
    await screen.findByRole("heading", { name: `Подразделения: ${administration.name}` }),
  ).toBeVisible();

  await user.keyboard(" ");
  expect(
    screen.queryByRole("heading", { name: `Подразделения: ${administration.name}` }),
  ).not.toBeInTheDocument();
});

test("edits an organization name without technical details or row actions", async () => {
  const user = userEvent.setup();
  renderOrganizations();

  expect(screen.queryByText(/Технический код/)).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: `Подразделения ${administration.name}` }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: `Редактировать ${administration.name}` }),
  ).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: administration.name }));

  expect(
    screen.queryByRole("heading", { name: `Подразделения: ${administration.name}` }),
  ).not.toBeInTheDocument();
  expect(screen.getByLabelText("Название")).toHaveValue(administration.name);
  expect(screen.getByRole("button", { name: "Сохранить" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Отмена" })).toBeVisible();
  expect(screen.getByRole("button", { name: "В архив" })).toBeVisible();

  await user.click(screen.getByRole("button", { name: "Отмена" }));
  expect(screen.getByRole("button", { name: administration.name })).toBeVisible();
  expect(
    screen.queryByRole("heading", { name: `Подразделения: ${administration.name}` }),
  ).not.toBeInTheDocument();
});

test("shows an inline error and disables Save while a name update is pending", async () => {
  const user = userEvent.setup();
  let resolveUpdate: ((response: Response) => void) | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (
        String(input).endsWith(`/organizations/${administration.id}`) &&
        init?.method === "PATCH"
      ) {
        return new Promise<Response>((resolve) => {
          resolveUpdate = resolve;
        });
      }
      return Promise.resolve(Response.json({ detail: "Not Found" }, { status: 404 }));
    }),
  );
  renderOrganizations();

  await user.click(screen.getByRole("button", { name: administration.name }));
  const saveButton = screen.getByRole("button", { name: "Сохранить" });
  await user.click(saveButton);

  await waitFor(() => expect(resolveUpdate).toBeDefined());
  expect(saveButton).toBeDisabled();

  resolveUpdate?.(Response.json({ detail: "Not Found" }, { status: 404 }));
  expect(await screen.findByRole("alert")).toBeVisible();
});

test("creates a child organization from its inline card with the current parent", async () => {
  const user = userEvent.setup();
  const fetchMock = stubOrgUnitApi();
  renderOrganizations();

  await user.click(screen.getByRole("treeitem", { name: administration.name }));
  await screen.findByRole("heading", { name: `Подразделения: ${administration.name}` });
  await user.click(screen.getByRole("button", { name: "Добавить подведомственную организацию" }));
  await user.type(screen.getByLabelText("Название"), "Школа 2");
  await user.click(screen.getByRole("button", { name: "Создать" }));

  await waitFor(() => {
    const createCall = fetchMock.mock.calls.find(
      ([input, init]) => String(input).endsWith("/api/v1/organizations") && init?.method === "POST",
    );
    expect(createCall).toBeTruthy();
    expect(JSON.parse(String(createCall?.[1]?.body))).toMatchObject({
      name: "Школа 2",
      parent_id: administration.id,
    });
  });
});

test("keeps management departments collapsed while root departments stay visible", async () => {
  const user = userEvent.setup();
  stubOrgUnitApi({
    [administration.id]: [
      ...administrationUnits,
      {
        id: "unit-foreign",
        organization_id: school.id,
        parent_id: null,
        code: "foreign",
        name: "Чужое управление",
        type: "management",
        is_active: true,
      },
    ],
  });
  renderOrganizations();

  await user.click(screen.getByRole("treeitem", { name: administration.name }));

  expect(
    await screen.findByRole("heading", { name: "Подразделения: Администрация" }),
  ).toBeVisible();
  expect(screen.getByText("Управление образования")).toBeVisible();
  expect(screen.getByText("Отдел бухгалтерии")).toBeVisible();
  expect(screen.queryByText("Отдел дошкольного образования")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Добавить отдел" })).not.toBeInTheDocument();
  expect(screen.queryByText("Чужое управление")).not.toBeInTheDocument();

  const management = screen.getByRole("treeitem", { name: /Управление образования/ });
  await user.click(
    screen.getByRole("button", { name: "Развернуть управление Управление образования" }),
  );

  expect(management).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByText("Отдел дошкольного образования")).toBeVisible();
  expect(screen.getByRole("button", { name: "Добавить отдел" })).toBeVisible();
});

test("creates a management as a root unit", async () => {
  const user = userEvent.setup();
  const fetchMock = stubOrgUnitApi();
  renderOrganizations();

  await user.click(screen.getByRole("treeitem", { name: administration.name }));
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

test("creates a department under the expanded management", async () => {
  const user = userEvent.setup();
  const fetchMock = stubOrgUnitApi();
  renderOrganizations();

  await user.click(screen.getByRole("treeitem", { name: administration.name }));
  await screen.findByRole("heading", { name: "Подразделения: Администрация" });
  await user.click(
    screen.getByRole("button", { name: "Развернуть управление Управление образования" }),
  );
  await user.click(screen.getByRole("button", { name: "Добавить отдел" }));
  await user.type(screen.getByLabelText("Название подразделения"), "Отдел молодежных программ");
  await user.click(screen.getByRole("button", { name: "Создать" }));

  await waitFor(() => {
    const createCall = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(createCall).toBeTruthy();
    expect(JSON.parse(String(createCall?.[1]?.body))).toMatchObject({
      name: "Отдел молодежных программ",
      parent_id: "unit-education",
      unit_type: "department",
    });
  });
});

test("names active child departments before archiving a management", async () => {
  const user = userEvent.setup();
  stubOrgUnitApi();
  renderOrganizations();

  await user.click(screen.getByRole("treeitem", { name: administration.name }));
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
    if (url.endsWith("/organizations") && init?.method === "POST") {
      return Response.json({
        id: "organization-created",
        is_active: true,
        ...JSON.parse(String(init.body)),
      });
    }
    return Response.json({ detail: "Not Found" }, { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
