import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";

import { UsersAndRoles } from "./UsersAndRoles";

test("opens an inline user profile with a fixed role list and hierarchical organization roots", async () => {
  const user = userEvent.setup();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <UsersAndRoles
        token="test-token"
        canConfigureAccess
        canToggleAccessDelegation
        users={[
          {
            id: "user-1",
            email: "branch@example.test",
            display_name: "Администратор филиала",
            status: "active",
            is_superuser: false,
            role_code: "subordinate_organization_administrator",
            organization_ids: ["organization-root"],
            can_manage_access: false,
            archived_at: null,
          },
        ]}
        organizationTree={[
          {
            id: "organization-root",
            parent_id: null,
            code: "root",
            name: "Администрация района",
            type: "organization",
            is_active: true,
            children: [
              {
                id: "organization-child",
                parent_id: "organization-root",
                code: "child",
                name: "Подведомственная организация",
                type: "organization",
                is_active: true,
                children: [],
              },
            ],
          },
        ]}
      />
    </QueryClientProvider>,
  );

  await user.click(screen.getByRole("button", { name: "branch@example.test" }));

  expect(screen.getByRole("columnheader", { name: "Логин" })).toBeInTheDocument();
  expect(screen.getByRole("combobox", { name: "Роль пользователя" })).toHaveValue(
    "subordinate_organization_administrator",
  );
  expect(screen.getByLabelText("Администрация района")).toBeChecked();
  expect(screen.getByLabelText("Подведомственная организация")).toBeChecked();
  expect(screen.getByLabelText("Подведомственная организация")).toBeDisabled();
  expect(screen.getByText("Входит через Администрация района")).toBeInTheDocument();
  expect(screen.queryByText("Технический код")).not.toBeInTheDocument();
});
