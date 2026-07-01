# PLANS.md

## Project

Registry Engine is a configurable web engine for schema-driven registries. It is
not a hardcoded employee registry.

## Current Stop Point

- Completed baseline: backend, frontend, attachments, generated documents,
  import/export, reports, and MCP phases through Phase 5R are implemented and
  deployed on `main`.
- Current checkpoint: **Phase 5S: Live Scenario Verification** is completed
  after focused `5S.7` bugfix reruns.
- Source analysis file: `docs/LIVE_VERIFICATION_PLAN.md`.
- This file was cleaned on 2026-07-01 to keep only the current live verification
  plan and the minimum baseline needed for execution.
- Live verification found focused blockers in `LC-010`, `LC-012`, and
  `LC-014`; all tracked fixes were rerun on the disposable livecheck
  environment.
- No production PostgreSQL migration is planned. Current production Alembic
  remains `0014_report_pdf_output (head)` unless a later bugfix phase changes
  schema under the standard migration rules.
- Follow-up production UI bugfix on 2026-07-01: admin display-name data
  mojibake/question marks were repaired for the bootstrap production admin, and
  organization/registry duplicate-code conflicts now return specific safe API
  details mapped to Russian UI messages. No schema migration was required.
- Registry/organization architecture remains unchanged: registries are not
  directly assigned to organizations; cards carry `organization_id`, and
  visibility is enforced by organization scope.

## Phase 5S: Live Scenario Verification

Status: completed.

Purpose: verify Registry Engine as a real system, not only as isolated tests:

```text
user action -> backend/API -> database/storage/audit -> UI/MCP/API result
```

Every live scenario must produce evidence that proves:

- the action was executed;
- data was written or rejected correctly;
- access rules were enforced;
- an audit event exists when required;
- archive behavior does not physically delete business records by default;
- storage stays consistent and does not leak storage internals;
- UI shows the correct Russian state;
- forbidden actions are actually forbidden.

## Live Environment Rules

Live checks must not run against production personal data.

Recommended environment:

- Database: `reg_engine_livecheck_test`.
- Storage root: separate temporary test directory outside Git.
- Backend: current `main` checkout.
- Frontend: staging/test frontend build served by the backend or local Vite.
- MCP: separate test bearer token.
- Evidence artifacts: ignored folder such as `artifacts/live/<run_id>/`.

All test entities must use one run prefix:

```text
livecheck_YYYYMMDD_HHMM
```

Example names:

```text
livecheck_20260701_1200_adm
livecheck_20260701_1200_registry
livecheck_20260701_1200_card_primary
```

The prefix is mandatory so SQL checks, audit queries, screenshots, and cleanup
can be tied to the same run.

## Evidence Template

Each scenario record must use this structure:

```text
Scenario ID:
Actor:
UI/API/MCP action:
Expected UI result:
Expected DB result:
Expected audit result:
Expected storage result:
Negative checks:
Actual result:
Bug? yes/no:
Evidence:
```

Evidence can include browser screenshots, Playwright snapshots, API responses,
SQL output, storage listing output, MCP JSON-RPC responses, and command logs.

## Test Actors And Organization Tree

Minimum users:

- `system_admin_livecheck`
- `registry_admin_livecheck`
- `org_admin_adm_livecheck`
- `org_admin_tu1_livecheck`
- `org_admin_tu2_livecheck`
- `mcp_operator_livecheck`
- public-link user without login

Organization tree:

```text
ADM
+-- TU-1
|   +-- TU-1-Sub
+-- TU-2
```

Expected visibility:

- `system_admin_livecheck` sees all organizations and all test data.
- `org_admin_adm_livecheck` sees `ADM`, `TU-1`, `TU-1-Sub`, and `TU-2`.
- `org_admin_tu1_livecheck` sees `TU-1` and `TU-1-Sub`.
- `org_admin_tu1_livecheck` does not see `ADM` or `TU-2`.
- `org_admin_tu2_livecheck` does not see `TU-1` or `TU-1-Sub`.

## Live Registry Fixture

Create one schema-driven registry for the run.

Registry:

- code: `livecheck_person_registry`
- name: `Livecheck Registry`

Blocks:

- `general_info`: non-repeatable
- `education`: repeatable
- `documents`: non-repeatable

Fields:

- `general_info.full_name`: `text`
- `general_info.birth_date`: `date`
- `general_info.is_active`: `bool`
- `general_info.status`: `select`
- `general_info.org_unit`: `org_unit_ref`
- `education.institution`: `text`
- `education.graduation_year`: `number`
- `documents.main_document`: `file_ref`

Reference list:

- code: `livecheck_employee_status`
- items: `active`, `dismissed`, `archive_review`

This registry is a live-check fixture only. It must not introduce hardcoded HR
tables or backend/frontend business fields.

## Scenario Order

Run scenarios in this order:

1. `LC-001` Login, session, logout.
2. `LC-002` Organization hierarchy and visibility.
3. `LC-003` Registry, schema, and reference list creation.
4. `LC-004` Card create, read, and scoped visibility.
5. `LC-005` Bulk field update atomicity.
6. `LC-006` Repeatable block instances.
7. `LC-007` Attachment upload, download, archive.
8. `LC-008` `file_ref` behavior.
9. `LC-009` Public link field edit and attachments.
10. `LC-010` Generated documents.
11. `LC-011` Import/export CSV and XLSX.
12. `LC-012` Reports.
13. `LC-013` MCP read, write, and content tools.
14. `LC-014` Scoped user no-error UX.
15. `LC-015` Backup/restore drill.

Detailed scenario SQL and expected negative checks are in
`docs/LIVE_VERIFICATION_PLAN.md`.

## Current Live Evidence

Run id: `livecheck_20260701_040741`.

Evidence folder: `artifacts/live/livecheck_20260701_040741/` (ignored by Git).

Initial live run status:

- `LC-001` through `LC-009`: passed with API/DB/storage/audit/browser evidence.
- `LC-010`: failed because generated-document download did not write a
  `generated_document_download` audit event.
- `LC-011`: passed.
- `LC-012`: failed because a report run accepted a provided empty string
  despite `minLength`.
- `LC-013`: passed.
- `LC-014`: failed because opening an admin-only section rendered empty tables
  instead of a Russian section-level access-denied state.
- `LC-015`: passed against a restored disposable database and copied temporary
  storage; restored Alembic head was `0014_report_pdf_output (head)`.

Local bugfix status:

- `LC-010`: regression tests added and local fix implemented for
  generated-document download audit.
- `LC-012`: regression tests added and local fix implemented so provided empty
  strings are validated against report parameter schema constraints.
- `LC-014`: regression test added and local fix implemented so forbidden
  admin-only sections show a section-level Russian access-denied state and do
  not render misleading empty admin tables.

Required before closing Phase 5S:

- Completed.
- Bugfix commit `86530f3d` closed `LC-010`, `LC-012`, and the original
  `LC-014` section-level access-denied issue.
- Bugfix commit `f3fea07` closed the follow-up `LC-014` card-workflow
  reference-item read 403.
- API/DB/storage/MCP rerun evidence:
  `artifacts/live/livecheck_20260701_040741/live_runner_rerun_result.json`,
  result `bugs=0`, entity prefix `livecheck_20260701_040741_000036`.
- Browser/UI rerun evidence:
  `artifacts/live/livecheck_20260701_040741/ui_livecheck_result.json`,
  result `bugs=[]`. The remaining 403 responses in that UI evidence are the
  expected admin-only `/permissions`, `/users`, and `/roles` denials after the
  scoped user explicitly opens the forbidden Users section; the section shows a
  localized Russian access-denied state.

## Scenario Acceptance Criteria

### LC-001: Login, Session, Logout

- Login as `system_admin_livecheck` opens the admin workspace.
- `/auth/me` returns the current user.
- Logout returns to the login screen.
- Protected sections are not available after logout.
- Disabled or archived users cannot log in.

### LC-002: Organization Hierarchy And Visibility

- Organization rows and `organization_closure` contain the expected tree.
- Access grants point to the intended organization branch.
- `org_admin_tu1_livecheck` sees `TU-1` and `TU-1-Sub` only.
- Parent and sibling branches remain hidden.

### LC-003: Registry, Schema, Reference Lists

- Registry, blocks, fields, and reference items are persisted correctly.
- `select` field is wired to its reference list.
- Field types are stored correctly.
- Org admins cannot modify schema without schema-management permission.
- Adding fields to a registry keeps old cards readable with empty values.

### LC-004: Card Create, Read, Scoped Visibility

- Card creation writes `cards`, `field_values`, and audit rows.
- The creating org admin and ancestor admin can read the card.
- Sibling org admin cannot read the card.
- UI success must match actual database state.

### LC-005: Bulk Field Update Atomicity

- Valid bulk update saves all submitted values.
- Invalid bulk update saves nothing.
- Single-field validation rules are not bypassed.
- Audit must not claim a partially successful rollback as success.

### LC-006: Repeatable Block Instances

- Repeatable `education` block can have multiple instances.
- Each instance keeps its own values.
- Archiving one instance hides it from normal reads and preserves it in archive
  scope.
- Non-repeatable block rules and minimum instance rules stay enforced.

### LC-007: Attachments

- Attachment upload writes safe metadata and a stored file.
- Download works only for actors with readable card access.
- Archive hides the attachment from normal lists without exposing storage keys.
- Audit is written for upload/download/archive where required.
- Storage file retention is consistent with the current attachment policy.

### LC-008: file_ref

- `file_ref` can reference only an attachment from the same card.
- Card reads expose safe attachment metadata only.
- Archived referenced attachments do not break card reads.
- Transfer copies active attachment references correctly and clears archived
  references as designed.
- Public links cannot edit `file_ref` without later explicit approval.

### LC-009: Public Links

- Public link opens without login while active and editable.
- Public field edit updates only public-editable fields.
- Public attachment upload/list/download obey active link and card state.
- Field-edit counters and attachment-upload counters remain separate.
- List/download do not increment upload counters.
- Disabled, expired, archived, superseded, or non-editable card/link states deny
  public operations.
- Public links cannot archive/delete attachments.

### LC-010: Generated Documents

- Text `.docx` generated document and PDF generation work for in-scope cards.
- Downloads return correct content type and safe filename behavior.
- Archived generated document requires archive scope where applicable.
- `file_ref` renders safe attachment title/original filename text, not storage
  paths.
- Audit exists for generation/download/archive.

### LC-011: Import/Export

- JSON, CSV, and XLSX exports include only visible cards.
- Binary attachments/documents are metadata-only in card exports.
- Preview does not mutate database state.
- Valid import commit is atomic.
- Invalid import commit does not partially create/update cards.
- CSV/XLSX byte limits and row limits reject oversized input.

### LC-012: Reports

- Report templates can generate JSON, CSV, XLSX, and PDF outputs.
- Backend validates report parameters, not only the frontend.
- Generated report rows and stored files are consistent.
- Report scope does not leak out-of-scope cards.
- Archived report runs require archive scope for download.
- Failed/rolled-back runs do not leave untracked storage files.

### LC-013: MCP

- `tools/list` returns expected read/write tools.
- Read tools have `readOnlyHint=true`.
- Write tools have `readOnlyHint=false`.
- Destructive write tools require explicit `confirm_* = true`.
- MCP tools call REST API only and send `X-Reg-Engine-Source: mcp`.
- Content reads require confirmation and obey `REG_ENGINE_MCP_MAX_CONTENT_BYTES`.
- MCP errors do not expose SQL traces, storage paths, checksums, stored-file ids,
  private filenames, or raw backend internals.
- Mutating MCP actions write audit with `source=mcp`.

### LC-014: Scoped User No-Error UX

- `org_admin_tu1_livecheck` can work in allowed card workflows without global
  403 banners from users, roles, permissions, access grants, or audit endpoints.
- Admin-only sections show section-local access errors when opened without
  permission.
- UI does not make the user think the card workflow is broken because unrelated
  admin-only queries are forbidden.

### LC-015: Backup/Restore Drill

- Backup the livecheck database.
- Restore into a disposable database.
- Start backend against the restored database and temporary storage.
- Verify Alembic state, login, card read, attachment download, generated
  document download, report download, and MCP health/read.
- Storage files must match restored database metadata.

## Stop Rules

- If `LC-002` RBAC or `LC-004` card scope fails, stop later document,
  import/export, report, and MCP checks until access control is fixed.
- If storage consistency fails, stop attachment, document, and report checks
  until storage behavior is fixed.
- If required audit rows are missing, do not mark the scenario complete.
- Do not continue destructive or broad tests against production data.

## What Counts As A Bug

Record a bug if any of these happen:

- UI shows success but database state did not change correctly.
- Database state changes but required audit is absent.
- Forbidden actor performs a protected action.
- Actor sees parent, sibling, or out-of-scope data.
- Archive physically deletes business data without an explicit policy.
- Public link can do more than its approved workflow.
- MCP bypasses the REST API.
- Import preview mutates data.
- Invalid import partially commits data.
- Download exposes storage keys, filesystem paths, checksums, or stored-file ids.
- Large file/report/import flow has no enforced limit.
- Restored database and storage cannot serve existing data.

## Execution Phases

### Phase 5S.0: Plan Cleanup And Readiness

Status: completed.

Work:

- Replace historical `PLANS.md` with this focused live verification plan.
- Keep `docs/LIVE_VERIFICATION_PLAN.md` as the detailed source scenario file.
- Confirm local browser automation capabilities.
- Decide whether to run live checks locally, on the configured server, or on a
  disposable staging backend.

Acceptance:

- `PLANS.md` contains the active Phase 5S plan and no long historical phase log.
- Browser capability assessment is recorded.
- No backend/frontend implementation is added.

### Phase 5S.1: Live Environment Provisioning

Status: completed.

Work:

- Create or verify disposable database `reg_engine_livecheck_test`.
- Configure a temporary storage root outside Git.
- Run Alembic to head on the disposable database.
- Seed roles, permissions, and test users.
- Deploy or start the current frontend/backend against test data.
- Prepare MCP test token.

Checks:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote
pnpm -C frontend e2e
```

Server checks where applicable:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/server-check.ps1
powershell -ExecutionPolicy Bypass -File scripts/service.ps1 -Command status
```

### Phase 5S.2: Core Access And Schema Live Checks

Status: completed.

Scope:

- `LC-001`
- `LC-002`
- `LC-003`
- `LC-004`

Exit:

- Login/session, RBAC tree, schema creation, and card scope are proven with UI,
  API/SQL, and audit evidence.

### Phase 5S.3: Dynamic Card Data Live Checks

Status: completed.

Scope:

- `LC-005`
- `LC-006`
- `LC-007`
- `LC-008`

Exit:

- Bulk values, repeatable blocks, attachments, and `file_ref` are proven with
  UI, API/SQL, storage, and audit evidence.

### Phase 5S.4: Public, Document, Import, Report Live Checks

Status: completed.

Scope:

- `LC-009`
- `LC-010`
- `LC-011`
- `LC-012`

Exit:

- Public links, generated documents, import/export, and reports are proven with
  UI, API/SQL, storage, download, and audit evidence.

### Phase 5S.5: MCP And Scoped UX Live Checks

Status: completed.

Scope:

- `LC-013`
- `LC-014`

Exit:

- MCP REST-only safety, confirmation behavior, content limits, normalized
  errors, audit source, and scoped frontend no-error UX are proven.

### Phase 5S.6: Backup/Restore Drill

Status: completed.

Scope:

- `LC-015`

Exit:

- Backup and restore into a disposable database is proven, including Alembic
  state, login, card reads, attachment/document/report downloads, storage
  consistency, and MCP health/read.

### Phase 5S.7: Bugfix Loop If Live Checks Fail

Status: completed.

Rules:

- Open a focused bug phase for each blocker or tightly related bug group.
- Add failing regression tests before implementation where practical.
- Keep fixes scoped; do not add unrelated product capabilities.
- Update this plan with actual evidence and remaining risk after each fix.
- Re-run the failed scenario and any affected downstream scenarios.

Closed bugs:

- `LC-010`: generated-document download now writes
  `generated_document_download` audit rows.
- `LC-012`: provided empty report string parameters are validated against
  schema constraints such as `minLength` instead of being treated as omitted.
- `LC-014`: forbidden admin-only sections now show a section-level Russian
  access-denied state instead of misleading empty tables.
- `LC-014`: scoped card workflows can read reference-list items needed by
  select/multi-select fields without granting reference-list edit rights.

### Phase 5S.8: Production UI Follow-Up Bugfix

Status: completed.

Scope:

- Correct the already persisted production bootstrap admin display name from
  question marks to `Системный администратор`.
- Keep UTF-8 Russian seed/UI regression coverage so future seed and UI labels
  do not regress into mojibake.
- Return specific safe API details for `uq_organizations_code` and
  `uq_registries_code` instead of a generic integrity message.
- Map those details in the frontend to:
  `Организация с таким кодом уже существует.` and
  `Реестр с таким кодом уже существует.`

Non-goals:

- No schema migration.
- No change to the Core Schema v1 registry/organization model.
- No direct organization-to-registry binding; cards remain the organization
  scoped records inside a registry.

## Browser And Live Testing Capability Assessment

Verified locally on 2026-07-01:

- Node.js: `v24.15.0`
- pnpm: `11.7.0`
- npx: `11.12.1`
- Playwright: `1.61.1`
- Project e2e command exists: `pnpm -C frontend e2e`
- Interactive Playwright MCP tools are available in this Codex session:
  navigation, tabs, snapshots, screenshots, and viewport resize.

I can run these parts myself:

- Browser UI scenarios with Playwright MCP or Playwright CLI.
- Screenshots and accessibility snapshots for evidence.
- Frontend unit/e2e/build checks.
- Backend API calls through curl, PowerShell, or Python test clients.
- Server SSH checks through existing scripts.
- PostgreSQL SQL verification through server-side `psql` when credentials and
  target database are configured.
- Storage consistency checks through server shell access.
- MCP stdio/tool checks against a test bearer token.
- GitHub/server synchronization through existing scripts when requested.

I can fully conduct `LC-001` through `LC-014` myself if:

- a disposable/staging database is available or I am allowed to create it;
- a temporary storage root is configured outside Git;
- test users/passwords or bootstrap permission to create them are available;
- the backend/frontend are pointed at the livecheck environment;
- an MCP test token is available or I can create one through the app/API.

I can conduct `LC-015` myself if, in addition:

- PostgreSQL backup/restore permissions are available;
- restore targets are disposable databases ending with `_test`;
- storage root backup/restore expectations are clear.

I cannot honestly mark the full live scenario set complete if:

- only production personal data is available;
- credentials/tokens are missing and cannot be bootstrapped;
- the staging backend cannot be pointed at disposable DB/storage;
- PostgreSQL restore permissions are unavailable;
- browser-only evidence is available but DB/audit/storage evidence is blocked.

Practical answer: yes, I can perform the live scenarios end-to-end myself with
the current toolset, but only against a disposable/staging environment with the
required credentials and server/database access. Browser automation alone is
not enough for Phase 5S; each scenario also needs DB, audit, storage, and
negative-access evidence.

## Verification For This Plan Update

Required after editing documentation:

```powershell
git diff --check
powershell -ExecutionPolicy Bypass -File scripts/project-map.ps1
```

No backend tests are required for this documentation-only plan update unless a
code change is introduced.
