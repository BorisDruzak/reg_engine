import { afterEach, expect, test, vi } from "vitest";

import {
  commitTabularXlsxImport,
  createOrganizationCardDraft,
  listOrganizationCards,
  downloadTabularXlsxImportTemplate,
  previewTabularXlsxImport,
  listCardExportTemplates,
  createCardExportTemplate,
  updateCardExportTemplate,
  archiveCardExportTemplate,
  downloadCardExportTemplate,
} from "./client";
import type { TabularCardWorkbookPayload } from "./types";

afterEach(() => {
  vi.unstubAllGlobals();
});

test("uses authenticated persisted export CRUD routes and downloads server-named XLSX bytes", async () => {
  const requests: { path: string; method: string; body: unknown; auth: string | null }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, init: RequestInit) => {
      requests.push({
        path,
        method: init.method ?? "GET",
        body: init.body ? JSON.parse(String(init.body)) : null,
        auth: new Headers(init.headers).get("Authorization"),
      });
      return path.endsWith("/download")
        ? new Response("xlsx bytes", { headers: { "X-Document-Filename": "registry-export.xlsx" } })
        : Response.json(
            path.endsWith("card-export-templates") && !init.method
              ? { items: [] }
              : { id: "export-1" },
          );
    }),
  );
  const payload = {
    code: "spisok",
    name: "Список",
    export_kind: "card_list" as const,
    card_template_id: "template-1",
    configuration_json: {
      field_ids: ["fio", "second", "first"],
      organization_ids: ["org-1", "org-2"],
    },
  };
  await listCardExportTemplates("token", "registry-1");
  await createCardExportTemplate("token", "registry-1", payload);
  await updateCardExportTemplate("token", "export-1", payload);
  await archiveCardExportTemplate("token", "export-1");
  const result = await downloadCardExportTemplate("token", "export-1", {});
  expect(requests.map(({ path, method }) => [path, method])).toEqual([
    ["/api/v1/registries/registry-1/card-export-templates", "GET"],
    ["/api/v1/registries/registry-1/card-export-templates", "POST"],
    ["/api/v1/card-export-templates/export-1", "PATCH"],
    ["/api/v1/card-export-templates/export-1", "DELETE"],
    ["/api/v1/card-export-templates/export-1/download", "POST"],
  ]);
  expect(requests.every((request) => request.auth === "Bearer token")).toBe(true);
  expect(requests[1].body).toEqual(payload);
  expect(requests[4].body).toEqual({});
  expect(result.filename).toBe("registry-export.xlsx");
  const contents = await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsText(result.blob);
  });
  expect(contents).toBe("xlsx bytes");
});

test("can list archived export codes for collision-free template creation", async () => {
  const fetchMock = vi.fn().mockResolvedValue(Response.json({ items: [] }));
  vi.stubGlobal("fetch", fetchMock);
  await listCardExportTemplates("token", "registry-1", true);
  expect(String(fetchMock.mock.calls[0][0])).toBe(
    "/api/v1/registries/registry-1/card-export-templates?include_archive=true",
  );
});

test("sends dismissed list filtering to the backend with existing organization scope", async () => {
  const fetchMock = vi.fn().mockResolvedValue(Response.json({ items: [] }));
  vi.stubGlobal("fetch", fetchMock);
  await listOrganizationCards("token", "organization-1", {
    lifecycleStatus: "dismissed",
    organizationIds: ["organization-1"],
    includeDescendantOrganizations: false,
  });
  const url = new URL(String(fetchMock.mock.calls[0][0]), "http://localhost");
  expect(url.searchParams.get("lifecycle_status")).toBe("dismissed");
  expect(url.searchParams.getAll("organization_ids")).toEqual(["organization-1"]);
  expect(url.searchParams.get("include_descendant_organizations")).toBe("false");
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
    public_access: { public_edit_enabled: true },
  });

  expect(fetchMock).toHaveBeenCalledOnce();
  const [[url, init]] = fetchMock.mock.calls as unknown as Array<
    [RequestInfo | URL, RequestInit | undefined]
  >;
  expect(String(url).endsWith("/organizations/organization-1/cards/draft")).toBe(true);
  expect(init).toMatchObject({ method: "POST" });
  expect(JSON.parse(String(init?.body))).toMatchObject({
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
  expect(
    String(templateUrl).endsWith(
      "/registries/registry-1/tabular-xlsx-card-exchange/import-template",
    ),
  ).toBe(true);
  expect(JSON.parse(String(templateInit.body))).toMatchObject({
    import_mode: "enrich_global_references",
    work_experience_as_of_date: "2026-07-17",
  });
  expect(String(previewUrl).endsWith("/import/preview")).toBe(true);
  expect(previewInit.body).toBeInstanceOf(FormData);
  expect(String(commitUrl).endsWith("/import/commit")).toBe(true);
  expect(commitInit.body).toBeInstanceOf(FormData);
});
