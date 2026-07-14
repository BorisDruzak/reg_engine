import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
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
  { ...administration, children: [{ ...school, children: [] }] },
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
];

const emptyManagement: OrgUnitRead = {
  id: "unit-empty-management",
  organization_id: administration.id,
  parent_id: null,
  code: "empty_management",
  name: "Управление без отделов",
  type: "management",
  is_active: true,
};

afterEach(() => vi.unstubAllGlobals());

test("places all add actions in the organization card without a unit-panel header or close button", async () => {
  const user = userEvent.setup();
  stubOrgUnitApi();
  renderOrganizations();

  await user.click(screen.getByRole("treeitem", { name: administration.name }));

  expect(
    await screen.findByRole("button", { name: "Добавить подведомственную организацию" }),
  ).toBeVisible();
  expect(screen.getByRole("button", { name: "Добавить управление" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Добавить отдел" })).toBeVisible();
  expect(
    screen.queryByRole("heading", { name: `Подразделения: ${administration.name}` }),
  ).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Закрыть" })).not.toBeInTheDocument();
});

test("opens and closes the organization card only from organization rows", async () => {
  const user = userEvent.setup();
  stubOrgUnitApi();
  renderOrganizations();

  const administrationRow = screen.getByRole("treeitem", { name: administration.name });
  await user.click(administrationRow);
  expect(screen.getByRole("button", { name: "Добавить управление" })).toBeVisible();

  await user.click(administrationRow);
  expect(screen.queryByRole("button", { name: "Добавить управление" })).not.toBeInTheDocument();

  await user.click(screen.getByRole("treeitem", { name: school.name }));
  expect(screen.getByRole("button", { name: "Добавить отдел" })).toBeVisible();
});

test.each([
  ["Добавить подведомственную организацию", "/api/v1/organizations", "organization"],
  ["Добавить управление", "/organizations/organization-administration/org-units", "management"],
  ["Добавить отдел", "/organizations/organization-administration/org-units", "department"],
] as const)("creates a %s from the organization card", async (actionLabel, endpoint, type) => {
  const user = userEvent.setup();
  const fetchMock = stubOrgUnitApi();
  renderOrganizations();

  await user.click(screen.getByRole("treeitem", { name: administration.name }));
  await user.click(screen.getByRole("button", { name: actionLabel }));
  await user.type(
    screen.getByLabelText(type === "organization" ? "Название" : "Название подразделения"),
    "Новое наименование",
  );
  await user.click(screen.getByRole("button", { name: "Создать" }));

  await waitFor(() => {
    const call = fetchMock.mock.calls.find(
      ([input, init]) => String(input).endsWith(endpoint) && init?.method === "POST",
    );
    expect(call).toBeTruthy();
    expect(JSON.parse(String(call?.[1]?.body))).toMatchObject(
      type === "organization"
        ? { name: "Новое наименование", parent_id: administration.id }
        : { name: "Новое наименование", unit_type: type },
    );
  });
});

test("replaces a typed unit create form when another card action is selected", async () => {
  const user = userEvent.setup();
  stubOrgUnitApi();
  renderOrganizations();

  await user.click(screen.getByRole("treeitem", { name: administration.name }));
  await user.click(screen.getByRole("button", { name: "Добавить управление" }));
  const input = screen.getByLabelText("Название подразделения");
  await user.type(input, "Черновик управления");

  await user.click(screen.getByRole("button", { name: "Добавить отдел" }));

  expect(screen.getByRole("heading", { name: "Добавить отдел" })).toBeVisible();
  expect(screen.getByLabelText("Название подразделения")).toHaveValue("");
});

test.each([
  ["Enter", "{Enter}"],
  ["Space", " "],
] as const)("replaces the create form when %s activates another card action", async (_, key) => {
  const user = userEvent.setup();
  stubOrgUnitApi();
  renderOrganizations();

  await user.click(screen.getByRole("treeitem", { name: administration.name }));
  await user.click(screen.getByRole("button", { name: "Добавить управление" }));
  await user.type(screen.getByLabelText("Название подразделения"), "Черновик управления");

  const departmentAction = screen.getByRole("button", { name: "Добавить отдел" });
  departmentAction.focus();
  await user.keyboard(key);

  expect(screen.getByRole("heading", { name: "Добавить отдел" })).toBeVisible();
  expect(screen.getByLabelText("Название подразделения")).toHaveValue("");
});

test.each([
  ["Управление образования", "unit-education"],
  ["Отдел бухгалтерии", "unit-accounting"],
] as const)("edits %s inline and only shows controls in edit mode", async (unitName, unitId) => {
  const user = userEvent.setup();
  const fetchMock = stubOrgUnitApi();
  renderOrganizations();

  await user.click(screen.getByRole("treeitem", { name: administration.name }));
  const nameButton = await screen.findByRole("button", { name: unitName });
  expect(screen.queryByRole("button", { name: "В архив" })).not.toBeInTheDocument();

  await user.click(nameButton);
  const input = screen.getByLabelText("Название подразделения");
  expect(input).toHaveValue(unitName);
  expect(screen.getByRole("button", { name: "Сохранить" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Отмена" })).toBeVisible();
  expect(screen.getByRole("button", { name: "В архив" })).toBeVisible();

  await user.clear(input);
  await user.type(input, `${unitName} новое`);
  await user.click(screen.getByRole("button", { name: "Сохранить" }));
  await waitFor(() => {
    const call = fetchMock.mock.calls.find(
      ([input, init]) => String(input).endsWith(`/org-units/${unitId}`) && init?.method === "PATCH",
    );
    expect(call).toBeTruthy();
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ name: `${unitName} новое` });
  });
});

test("cancels inline unit editing and keeps management expansion on its non-control row area", async () => {
  const user = userEvent.setup();
  stubOrgUnitApi();
  renderOrganizations();

  await user.click(screen.getByRole("treeitem", { name: administration.name }));
  const management = await screen.findByRole("treeitem", { name: /Управление образования/ });
  expect(management).toHaveAttribute("aria-expanded", "false");

  await user.click(screen.getByRole("button", { name: "Управление образования" }));
  expect(management).toHaveAttribute("aria-expanded", "false");
  await user.click(screen.getByRole("button", { name: "Отмена" }));
  expect(screen.getByRole("button", { name: "Управление образования" })).toBeVisible();

  await user.click(management);
  expect(management).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByRole("button", { name: "Отдел дошкольного образования" })).toBeVisible();
});

test("creates a department from an expanded management with that management as its parent", async () => {
  const user = userEvent.setup();
  const fetchMock = stubOrgUnitApi();
  renderOrganizations();

  await user.click(screen.getByRole("treeitem", { name: administration.name }));
  const management = await screen.findByRole("treeitem", { name: /Управление образования/ });
  await user.click(management);
  const managementItem = management.closest("li");
  expect(managementItem).not.toBeNull();

  await user.click(
    within(managementItem as HTMLLIElement).getByRole("button", { name: "Добавить отдел" }),
  );
  await user.type(screen.getByLabelText("Название подразделения"), "Отдел проектов");
  await user.click(screen.getByRole("button", { name: "Создать" }));

  await waitFor(() => {
    const call = fetchMock.mock.calls.find(
      ([input, init]) =>
        String(input).endsWith("/organizations/organization-administration/org-units") &&
        init?.method === "POST",
    );
    expect(call).toBeTruthy();
    expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({
      name: "Отдел проектов",
      parent_id: "unit-education",
      unit_type: "department",
    });
  });
});

test("expands an empty management to offer its first child-department action", async () => {
  const user = userEvent.setup();
  stubOrgUnitApi({ units: [...administrationUnits, emptyManagement] });
  renderOrganizations();

  await user.click(screen.getByRole("treeitem", { name: administration.name }));
  const management = await screen.findByRole("treeitem", { name: /Управление без отделов/ });
  expect(management).toHaveAttribute("aria-expanded", "false");

  await user.click(management);

  expect(management).toHaveAttribute("aria-expanded", "true");
  expect(
    within(management.closest("li") as HTMLLIElement).getByRole("button", {
      name: "Добавить отдел",
    }),
  ).toBeVisible();
});

test("opens unit archive confirmation only from inline edit mode without collapsing management", async () => {
  const user = userEvent.setup();
  stubOrgUnitApi();
  renderOrganizations();

  await user.click(screen.getByRole("treeitem", { name: administration.name }));
  const management = await screen.findByRole("treeitem", { name: /Управление образования/ });
  await user.click(management);
  await user.click(screen.getByRole("button", { name: "Управление образования" }));
  await user.click(screen.getByRole("button", { name: "В архив" }));

  expect(management).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByRole("dialog", { name: "Архивировать подразделение" })).toBeVisible();
});

test("shows an inline unit update failure without expanding the management row", async () => {
  const user = userEvent.setup();
  stubOrgUnitApi({ updateStatus: 500 });
  renderOrganizations();

  await user.click(screen.getByRole("treeitem", { name: administration.name }));
  const management = await screen.findByRole("treeitem", { name: /Управление образования/ });
  await user.click(screen.getByRole("button", { name: "Управление образования" }));
  await user.click(screen.getByRole("button", { name: "Сохранить" }));

  expect(await screen.findByRole("alert")).toBeVisible();
  expect(management).toHaveAttribute("aria-expanded", "false");
});

test("replaces a failed create form when the alternate card action is selected", async () => {
  const user = userEvent.setup();
  stubOrgUnitApi({ createStatus: 500 });
  renderOrganizations();

  await user.click(screen.getByRole("treeitem", { name: administration.name }));
  await user.click(screen.getByRole("button", { name: "Добавить управление" }));
  await user.type(screen.getByLabelText("Название подразделения"), "Черновик управления");
  await user.click(screen.getByRole("button", { name: "Создать" }));
  expect(await screen.findByRole("alert")).toBeVisible();

  await user.click(screen.getByRole("button", { name: "Добавить отдел" }));

  expect(screen.getByRole("heading", { name: "Добавить отдел" })).toBeVisible();
  expect(screen.getByLabelText("Название подразделения")).toHaveValue("");
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

function stubOrgUnitApi({
  createStatus = 200,
  updateStatus = 200,
  units = administrationUnits,
}: { createStatus?: number; updateStatus?: number; units?: OrgUnitRead[] } = {}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const organizationMatch = url.match(/\/organizations\/([^/]+)\/org-units$/);
    if (organizationMatch && init?.method !== "POST") {
      return Response.json({
        items: organizationMatch[1] === administration.id ? units : [],
      });
    }
    if (organizationMatch && init?.method === "POST") {
      if (createStatus !== 200) {
        return Response.json({ detail: "Create failed" }, { status: createStatus });
      }
      return Response.json({
        id: "unit-created",
        organization_id: organizationMatch[1],
        is_active: true,
        ...JSON.parse(String(init.body)),
      });
    }
    if (url.endsWith("/organizations") && init?.method === "POST") {
      return Response.json({
        id: "organization-created",
        is_active: true,
        ...JSON.parse(String(init.body)),
      });
    }
    if (url.includes("/org-units/") && init?.method === "PATCH") {
      if (updateStatus !== 200) {
        return Response.json({ detail: "Update failed" }, { status: updateStatus });
      }
      return Response.json({ id: url.split("/").at(-1), ...JSON.parse(String(init.body)) });
    }
    return Response.json({ detail: "Not Found" }, { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
