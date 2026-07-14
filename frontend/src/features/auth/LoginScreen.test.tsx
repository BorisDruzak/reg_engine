import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";

import { LoginScreen } from "./LoginScreen";

test("shows a plain login field instead of an email field", () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <LoginScreen onLogin={vi.fn()} />
    </QueryClientProvider>,
  );

  expect(screen.getByLabelText("Логин")).toHaveAttribute("type", "text");
  expect(screen.queryByText("Логин или электронная почта")).not.toBeInTheDocument();
});
