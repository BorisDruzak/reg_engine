import { afterEach, expect, test, vi } from "vitest";

import { createOrganizationCardDraft } from "./client";

afterEach(() => {
  vi.unstubAllGlobals();
});

test("creates an explicit organization card draft through the draft endpoint", async () => {
  const fetchMock = vi.fn(
    async () =>
      new Response(JSON.stringify({ id: "draft-card-1" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
  );
  vi.stubGlobal("fetch", fetchMock);

  await createOrganizationCardDraft("test-token", "organization-1", {
    card_template_id: "template-1",
    public_access: { public_edit_enabled: true },
  });

  expect(fetchMock).toHaveBeenCalledOnce();
  const [[url, init]] = fetchMock.mock.calls as unknown as Array<
    [RequestInfo | URL, RequestInit | undefined]
  >;
  expect(String(url).endsWith("/organizations/organization-1/cards/draft")).toBe(true);
  expect(init).toMatchObject({ method: "POST" });
  expect(JSON.parse(String(init?.body))).toMatchObject({
    card_template_id: "template-1",
    public_access: { public_edit_enabled: true },
  });
});
