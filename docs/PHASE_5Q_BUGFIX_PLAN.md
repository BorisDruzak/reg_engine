# Phase 5Q — MCP Content And Cross-Cutting Stabilization

## Status

Planned next.

## Purpose

Stabilize the current Phase 5 MCP-heavy implementation after Phase 5P and before adding any more MCP tools, report polish, binary export, public document workflows, or new product capabilities.

This is a bugfix and correctness phase. It must not introduce unrelated features.

## Current Project Stage

The project currently has:

- schema-driven registries, organizations, RBAC, cards, dynamic fields, attachments, `file_ref`, generated documents, import/export, reports, and Russian frontend workflows;
- report output formats `json`, `csv`, `xlsx`, and `pdf`;
- read-only MCP tools plus multiple MCP write tools that call the REST API only;
- MCP report/generated-document content read tools that return base64 content through structured output;
- production Alembic currently at `0014_report_pdf_output`.

## Current Review Findings

### P0 — Phase plan active checkpoint drift

`PLANS.md` has accumulated a long chronological history and the active next step can be hard to distinguish from completed evidence.

Required work:

- Mark Phase 5Q as the single next active implementation checkpoint in `PLANS.md`.
- Keep completed history intact, but do not add new product work into the bugfix phase.
- Keep the production migration checkpoint explicit: Alembic remains `0014_report_pdf_output` unless a Phase 5Q task proves a migration is necessary.

Acceptance criteria:

- The next implementation step is unambiguous.
- No completed phase is also listed as pending.

### P0 — MCP content read tools have no explicit response-size guardrail

Phase 5P added MCP tools that read report-run and generated-document content and return base64 content through MCP structured output. The implementation uses the existing REST content endpoints and then base64-encodes the whole response body.

Risk:

- Large report/generated-document outputs can produce very large MCP responses.
- This can increase memory use and can overload an MCP client/LLM context.
- This is especially important because base64 expands binary content.

Required work:

- Add an explicit MCP content-size limit before returning base64 content.
- Prefer a runtime setting such as `REG_ENGINE_MCP_MAX_CONTENT_BYTES` with a safe default.
- If content exceeds the limit, return a controlled MCP tool error or structured metadata with content omitted.
- Add tests for under-limit and over-limit content.

Acceptance criteria:

- MCP content tools cannot return unbounded base64 payloads.
- Error/omission behavior is deterministic and documented.

### P1 — MCP content read tools need a clear sensitive-content UX contract

Report and generated-document content may contain personal or operational data. The tools are technically read-only, but they can still expose content into an MCP client context.

Required work:

- Decide whether content-read MCP tools should require an explicit argument such as `include_content=true` or `confirm_content_read=true`.
- If no explicit confirmation is required, document why authenticated API scope is considered sufficient for the current deployment.
- Ensure tool descriptions make clear that content bytes are returned as base64.

Acceptance criteria:

- Content-read behavior is deliberate and documented.
- Tool descriptions and tests match the chosen behavior.

### P1 — MCP write tool surface needs a consistency audit

The MCP tool surface has grown significantly. Destructive tools generally require confirmation flags, but the whole set should be audited for consistent safeguards.

Required work:

- Audit every MCP write tool for:
  - `readOnlyHint=false`;
  - existing REST API boundary usage only;
  - no DB/model/service imports;
  - confirmation flag for destructive operations;
  - no raw storage key/path exposure;
  - clear validation errors before making API calls.
- Add or update tests where gaps are found.

Acceptance criteria:

- All write tools have consistent safety annotations and validation behavior.
- Destructive tools require explicit confirmation.
- No MCP tool bypasses REST API.

### P1 — MCP error payloads may expose too much backend detail

`RegEngineApiClient` returns REST error details through MCP tool errors. This is useful for operators, but the boundary should be checked so internal storage paths, SQL errors, trace details, or sensitive metadata are never surfaced.

Required work:

- Audit MCP error paths for API errors and unexpected exceptions.
- Add regression tests that backend 4xx/5xx payloads are normalized enough for MCP clients.
- Keep useful validation messages, but avoid raw internal details.

Acceptance criteria:

- MCP tool errors remain actionable without exposing sensitive internals.

### P1 — Report/download memory behavior remains byte-buffer based

REST report/generated-document content endpoints and MCP content tools currently read full files as bytes. This may be acceptable for MVP-sized outputs, but the limit must be explicit.

Required work:

- Document the current REST download memory behavior and expected MVP size assumptions.
- Do not add pseudo-streaming unless the storage abstraction changes to support real streaming/open-file reads.
- Align REST and MCP size-limit documentation.

Acceptance criteria:

- Memory behavior is explicit and tested where the code enforces a limit.

### P2 — Public-link document workflows and attachment content MCP tools remain deferred

Phase 5P intentionally added report/generated-document content reads only. Attachment content, document-template content, public-link document workflows, import/export MCP tools, and additional write tools remain deferred.

Required work:

- Keep these deferred unless explicitly approved.
- Ensure `PLANS.md` and README do not imply that these flows are already supported.

Acceptance criteria:

- Deferred scope remains explicit.

## Allowed Work

- MCP content-size limit and tests.
- MCP content-read confirmation/UX decision and tests.
- MCP write-tool safety audit and tests.
- MCP error-boundary cleanup.
- Documentation updates.
- Small API-client changes needed by the above.

## Not Allowed

- New MCP write tools.
- Import/export MCP tools.
- Attachment upload/download MCP tools.
- Public-link document workflows.
- New report formats.
- Full visual report builder.
- Scheduled reports.
- Binary attachment/document export.
- New storage backend.
- Hardcoded HR-specific fields.
- MDB migration.
- Service desk integration.

## Required Tests

Backend/MCP tests:

- content read under size limit returns base64 and safe metadata;
- content read over size limit returns the chosen controlled error/omission response;
- content-read confirmation behavior matches the chosen contract if confirmation is added;
- all MCP write tools have `readOnlyHint=false`;
- all MCP read tools have `readOnlyHint=true`;
- destructive MCP tools require explicit confirmation;
- MCP API errors are normalized and do not expose storage paths, SQL traces, or raw internals;
- existing Phase 5 MCP tests continue to pass.

Documentation checks:

- README documents MCP content size and content-read behavior.
- PLANS.md marks Phase 5Q completion evidence at closeout.
- PROJECT_TREE.md is updated if files change.

## Verification

Required verification before closeout:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote
pnpm -C frontend e2e
```

Server-side targeted verification where applicable:

```bash
cd /opt/reg_engine/backend
sudo -u postgres env TEST_DATABASE_URL='postgresql+psycopg:///reg_engine_test' .venv/bin/python -m pytest -q -p no:cacheprovider backend/tests/test_mcp_phase_5.py
```

If no database migration is required, confirm Alembic remains at `0014_report_pdf_output`.

## Closeout Criteria

- Phase 5Q issues are fixed or explicitly deferred with reasons.
- No unrelated feature work is added.
- README, PLANS.md, PROJECT_TREE.md, and tests reflect the final result.
- Server and frontend deployment happen only after checks pass.
