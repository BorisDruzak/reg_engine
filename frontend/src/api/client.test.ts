import { afterEach, expect, test, vi } from "vitest";

import {
  commitTabularXlsxImport,
  createOrganizationCardDraft,
  downloadTabularXlsxImportTemplate,
  previewTabularXlsxImport,
} from "./client";
import type { TabularCardWorkbookPayload } from "./types";

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

test("sends XLSX v2 creation options only with the template download", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(new Blob(["xlsx"]), {
        status: 200,
        headers: { "X-Document-Filename": "registry-card-import-template.xlsx" },
      }),
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ format_version: "tabular_card_xlsx_v2" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ format_version: "tabular_card_xlsx_v2" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  vi.stubGlobal("fetch", fetchMock);
  const payload: TabularCardWorkbookPayload = {
    card_template_id: "template-1",
    field_ids: ["field-1"],
    organization_ids: ["organization-1"],
    include_organization_column: false,
    fixed_organization_id: "organization-1",
    import_mode: "enrich_global_references",
    work_experience_as_of_date: "2026-07-17",
  };
  const file = new File(["xlsx"], "cards.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  await downloadTabularXlsxImportTemplate("test-token", "registry-1", payload);
  await previewTabularXlsxImport("test-token", "registry-1", file);
  await commitTabularXlsxImport("test-token", "registry-1", file);

  const [[templateUrl, templateInit], [previewUrl, previewInit], [commitUrl, commitInit]] =
    fetchMock.mock.calls as unknown as Array<[RequestInfo | URL, RequestInit]>;
  expect(String(templateUrl).endsWith("/registries/registry-1/tabular-xlsx-card-exchange/import-template")).toBe(
    true,
  );
  expect(JSON.parse(String(templateInit.body))).toMatchObject({
    import_mode: "enrich_global_references",
    work_experience_as_of_date: "2026-07-17",
  });
  expect(String(previewUrl).endsWith("/import/preview")).toBe(true);
  expect(previewInit.body).toBeInstanceOf(FormData);
  expect(String(commitUrl).endsWith("/import/commit")).toBe(true);
  expect(commitInit.body).toBeInstanceOf(FormData);
});
