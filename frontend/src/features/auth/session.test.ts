import { afterEach, beforeEach, expect, test } from "vitest";

import { loadSession } from "./session";

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

test("discards an expired persisted session before the workspace renders", () => {
  localStorage.setItem(
    "reg_engine.session.v1",
    JSON.stringify({
      token: "expired-token",
      user: { id: "user-1" },
      expiresAt: "2000-01-01T00:00:00Z",
    }),
  );

  expect(loadSession()).toBeNull();
  expect(localStorage.getItem("reg_engine.session.v1")).toBeNull();
});
