# Phase 4W — Cross-Cutting Bugfix And Stabilization

## Status

Planned next.

## Purpose

Stabilize the current implementation after the completed Phase 4V report-parameter validation work and before starting MCP write tools, additional report polish, binary export, or other new product capabilities.

This phase is a bugfix and correctness checkpoint. It must not add unrelated product features.

## Current Review Findings

### P0 — PLANS.md status drift and sequencing noise

`PLANS.md` has become very large and mixes long completed-phase evidence with current planning. The current top-level stop point is still readable, but the next active implementation phase should be explicitly named before new work starts.

Required work:

- Add Phase 4W as the single next active implementation checkpoint.
- Keep completed phase history but avoid adding new unrelated feature work inside the same phase.
- Keep the current migration checkpoint explicit: Alembic head is `0014_report_pdf_output` unless Phase 4W proves a migration is required.

Acceptance criteria:

- The next implementation step is unambiguous.
- No completed phase is simultaneously marked as planned.

### P1 — Report parameter validation has only frontend enforcement

Recent report-run parameter checks are implemented in the Russian frontend form. Backend `ReportService.generate_report_for_actor` still accepts `parameters_json` and uses it directly when rendering report runs.

Risk:

- API clients, MCP clients, scripts, or future integrations can bypass frontend validation and submit parameters that violate the template JSON Schema.

Required work:

- Add a backend validation boundary for the currently supported flat JSON Schema subset used by the frontend:
  - `required`;
  - scalar types `string`, `number`, `integer`, `boolean`;
  - string `minLength`, `maxLength`, `pattern`;
  - numeric `minimum`, `maximum`, `exclusiveMinimum`, `exclusiveMaximum`, `multipleOf`;
  - `enum` and `oneOf[].const` where currently supported.
- Reuse the same semantics as the frontend where possible.
- Add backend tests that prove invalid parameters are rejected through REST API even when bypassing UI.

Acceptance criteria:

- Report generation rejects invalid parameters at backend/service level.
- Frontend and backend validation semantics are aligned for the supported subset.
- No full JSON Schema engine is introduced unless explicitly approved.

### P1 — Report output storage cleanup on transaction rollback

`ReportService.generate_report_for_actor` writes report output bytes to storage before database metadata rows are committed. The service deletes the object if an exception happens inside the service block, but a later transaction rollback can still leave orphaned report output bytes.

This mirrors an issue previously hardened for attachments.

Required work:

- Introduce report output pending-storage cleanup on SQLAlchemy rollback, or reuse the existing attachment pending cleanup mechanism in a generic way.
- Add a regression test that writes report output bytes and rolls back the transaction, then verifies the object is removed from storage.

Acceptance criteria:

- Failed/rolled-back report generation does not silently leave untracked report files.
- Existing report generation tests still pass.

### P1 — Report downloads still buffer whole files in memory

Report content download reads full output bytes through the storage abstraction and returns a normal `Response`. This is acceptable for small MVP reports, but should be explicitly bounded or deferred as a streaming-storage task.

Required work:

- Document current behavior as bounded by practical MVP report sizes, or add a streaming/open-file storage boundary if implementation is low-risk.
- Do not wrap already-loaded bytes in `StreamingResponse` without changing the storage abstraction.

Acceptance criteria:

- Download memory behavior is documented or improved.
- No misleading pseudo-streaming implementation is added.

### P1 — Report template JSON fields lack schema-shape validation at backend boundary

Report template create/update accepts `parameters_schema_json` and `default_parameters_json` as dictionaries, but backend currently does not verify that the schema is an object with supported flat properties before storing it.

Required work:

- Validate or explicitly document the accepted `parameters_schema_json` subset.
- Reject unsupported obviously invalid structures where they would break the frontend visual run form.
- Keep advanced nested schema support deferred.

Acceptance criteria:

- Invalid report schema objects fail with stable 4xx errors instead of becoming broken UI state.
- Existing advanced/unsupported schema shapes are either explicitly unsupported or ignored safely.

### P2 — Import/export and report output binary scope remains incomplete

Binary attachment/document export remains deferred. This is acceptable, but it should stay explicit so new report/export polish does not accidentally imply binary archive/export coverage.

Required work:

- Keep binary attachment/document export out of Phase 4W.
- Keep import/export binary files out of Phase 4W.
- Confirm docs still state metadata-only behavior where appropriate.

Acceptance criteria:

- No binary attachment/document export is introduced in Phase 4W.
- Documentation remains explicit.

## Phase 4W Scope

Allowed:

- Backend validation fixes for existing report parameter/template flows.
- Report output rollback cleanup.
- Documentation updates.
- Tests for the bugfixes above.
- Small frontend alignment changes only if backend validation message handling requires them.

Not allowed:

- MCP write tools.
- New report formats.
- Full visual report builder.
- Scheduled reports.
- Public report workflows.
- Binary attachment/document export.
- Import/export expansion.
- New storage backend.
- Hardcoded HR-specific fields.
- MDB migration.
- Service desk integration.

## Required Tests

Backend:

- report run rejects missing required parameter through REST/API path;
- report run rejects string min/max/pattern violations through REST/API path;
- report run rejects numeric min/max/exclusive/multiple violations through REST/API path;
- report run rejects enum/oneOf values outside allowed set;
- report template create/update rejects invalid supported-schema structures where applicable;
- report output storage is cleaned after transaction rollback;
- existing report JSON/CSV/XLSX/PDF output tests continue to pass.

Frontend, if touched:

- existing report run parameter validation tests still pass;
- no regression in Russian validation text.

## Verification

Required verification before closeout:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote
pnpm -C frontend e2e
```

PostgreSQL-backed tests where applicable:

```bash
cd /opt/reg_engine/backend
sudo -u postgres env TEST_DATABASE_URL='postgresql+psycopg:///reg_engine_test' .venv/bin/python -m pytest -q -p no:cacheprovider
```

If no migration is required, confirm Alembic remains at `0014_report_pdf_output`.

## Closeout Criteria

- Phase 4W bugs are fixed or explicitly deferred with reason.
- No unrelated feature work is added.
- README, PLANS.md, PROJECT_TREE.md, and tests reflect the final result.
- Server and frontend deployment are performed only after checks pass.
