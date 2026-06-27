import { render, screen } from "@testing-library/react";

import { App } from "@/App";

test("renders Registry Engine home page", () => {
  render(<App />);

  expect(screen.getByRole("heading", { name: "Registry Engine" })).toBeInTheDocument();
  expect(screen.getByText(/schema-driven registry platform foundation/i)).toBeInTheDocument();
});
