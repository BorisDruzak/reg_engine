# Phase 5R — User Scenario UAT Bugfix And Product Readiness

## Status

Planned after Phase 5Q, or may be merged into Phase 5Q if no Phase 5Q implementation has started yet.

## Purpose

Validate and harden the real end-to-end user scenarios across the full product surface before adding more MCP tools, report polish, binary export, public document workflows, or new product capabilities.

This is a user-scenario bugfix phase. It must focus on correctness, permission boundaries, UX blockers, and UAT readiness.

## Current Project Stage

The project currently includes:

- schema-driven registries;
- hierarchical organizations and organization-scoped RBAC;
- authenticated Russian admin UI;
- cards, repeatable blocks, dynamic values, `file_ref`, attachments, generated documents, reports, import/export;
- public edit links with field editing and attachment workflows;
- MCP read/write tools that call the REST API only;
- report/generated-document content read tools through MCP;
- production Alembic at `0014_report_pdf_output` unless a later approved phase changes it.

## User Scenario Review Findings

### P0 — Global frontend data loading causes permission-noise for scoped users

`HomePage.tsx` starts many global queries as soon as a token exists: organizations, registries, schema, cards, users, roles, permissions, access grants, and audit. For scoped users such as an `org_admin` or a card-only user, some of these endpoints can legitimately return 403. The global `DataAlert` then shows unrelated errors even when the user is working in an allowed section.

Risk:

- A valid non-system user can see persistent error banners even when their allowed workflows work.
- UAT for scoped admin roles becomes noisy and misleading.

Required work:

- Load sensitive/admin-only queries only when their section is active or when the current user has enough capability.
- Do not show users/roles/permissions/access/audit errors globally on card/registry workflows.
- Treat expected 403 on unavailable sections as section-local no-access state, not global app failure.
- Add tests for a scoped user who can manage cards but cannot read users/roles/permissions/audit.

Acceptance criteria:

- Scoped card/org users can open and edit allowed cards without global error noise.
- Admin-only sections still show clear access errors when opened without permission.

### P0 — End-to-end user scenario matrix is not yet explicit

Many phases have unit/API tests, but product readiness now requires a small scenario matrix that maps user roles to end-to-end workflows.

Required work:

- Add a documented UAT matrix covering:
  - `system_admin`;
  - `registry_admin`;
  - `org_admin` / scoped card manager;
  - public-link user;
  - MCP operator token.
- For each role, define allowed and denied workflows.
- Add automated tests where low-risk, and manual UAT checklist where browser/server state is required.

Acceptance criteria:

- Each major user role has a clear allowed/denied scenario checklist.
- UAT blockers are recorded as bugs, not hidden in phase history.

### P1 — Card editor has competing single-field and bulk-field editing UX

The card workspace currently renders a bulk field-values form for most fields and also renders individual field editors for every field. This can confuse users about which save button is authoritative and can produce duplicate editing surfaces for the same value.

Required work:

- Decide the intended UX:
  - either bulk form is the primary editor and single editors are removed/collapsed;
  - or single editors remain primary and bulk save moves to an advanced mode;
  - or both remain but are visually separated with clear labels and state reset behavior.
- Ensure `file_ref` remains handled through the attachment-aware editor and is not accidentally hidden from the main edit flow.
- Add frontend tests for the chosen behavior.

Acceptance criteria:

- Users have one obvious primary way to edit card fields.
- Bulk save and single-field save do not conflict visually or functionally.

### P1 — Existing card metadata editing does not expose org unit changes

Card creation supports `org_unit_id`, but existing card editing currently focuses on display name and public flags. In real registry use, users may need to correct department/unit assignment without transferring the card to another organization.

Required work:

- Decide whether editing `org_unit_id` on an existing card is allowed in v1.
- If allowed, add backend/API/frontend support and audit.
- If deferred, document the limitation in the card UI and UAT checklist.

Acceptance criteria:

- Card department/unit correction behavior is explicit.
- Users are not forced to use organization transfer for same-organization unit corrections.

### P1 — Card list UX lacks visible search/filter/archive controls

Backend card listing supports registry scope and some filters, but the main card UI does not yet expose a complete operator workflow for search, organization filter, and archive visibility.

Required work:

- Add or confirm UI controls for:
  - card search text;
  - organization filter;
  - archive/superseded visibility;
  - lifecycle status display.
- Ensure filters map to existing backend APIs without bypassing RBAC.

Acceptance criteria:

- Large registries can be navigated without relying only on the first card/list order.
- Archived/superseded visibility is deliberate and tested.

### P1 — Import XLSX upload reads the whole file into memory without explicit bounds

The import endpoint reads uploaded XLSX content with `await uploaded.read()` and then loads workbook rows. This is acceptable for small test files, but not safe as an unbounded production path.

Required work:

- Add an explicit import upload size limit and row count limit for CSV/XLSX preview and commit.
- Reject oversized files with a stable 4xx error.
- Document the current limits in README.
- Add tests for oversized XLSX/CSV import payloads.

Acceptance criteria:

- Import workflows cannot consume unbounded memory from large uploads.
- Error messages are stable and user-facing enough for the frontend.

### P1 — Public-link attachment UI should expose limit/exhausted states earlier

Public links now separate field-edit usage and attachment-upload usage. The public page can still show the upload form and only reveal an upload-limit error after submit.

Required work:

- Decide whether the public preview/attachment list API should expose safe upload-limit metadata.
- If safe, show a Russian message when upload limit is exhausted and disable the upload form while list/download remains available.
- If not safe, document that the backend error after submit is the intended MVP behavior.

Acceptance criteria:

- Public users understand whether they can upload more files.
- Upload exhaustion does not imply list/download failure.

### P1 — MCP content-read hardening must be included in user-scenario readiness

Phase 5P allows MCP operators to read report/generated-document content as base64. This is useful, but UAT must verify size limits, sensitive-content behavior, and error normalization before broader operational use.

Required work:

- Complete Phase 5Q before marking MCP user scenarios ready.
- Add MCP scenario tests for:
  - read metadata;
  - read content under size limit;
  - oversized content handling;
  - forbidden content access;
  - bad IDs and backend 4xx errors.

Acceptance criteria:

- MCP content scenarios are safe and predictable.
- No unbounded content payload reaches MCP clients.

### P1 — Backup/restore and operational recovery scenario is not yet represented in UAT

The project has careful migration discipline, but product readiness also needs a restore drill for operational confidence.

Required work:

- Add a documented backup/restore drill using a disposable copy.
- Verify app startup, Alembic state, login, card read, attachment download, generated document download, report download after restore.

Acceptance criteria:

- A restore procedure is proven before production use with real data.

### P2 — Reports parameter UI supports a flat JSON Schema subset only

The report run visual form supports a controlled flat subset. This is acceptable, but UAT should prevent users from assuming nested forms/full visual report builder support.

Required work:

- Document the supported report parameter schema subset in the UI or README.
- Ensure unsupported schema structures either fail backend validation or are safely ignored with a clear explanation.

Acceptance criteria:

- Report template authors understand the supported parameter schema subset.

### P2 — Binary attachment/document export remains metadata-only in card export

Card export includes attachment/generated-document metadata, not binary file bundles. This is correct for current scope but must remain visible in UAT expectations.

Required work:

- Keep export documentation explicit: binary attachment/document export is deferred.
- Add UAT check that metadata export does not imply binary archive export.

Acceptance criteria:

- Users do not expect exported CSV/XLSX/JSON to contain binary files.

## Required Scenario Matrix

### System admin

Must verify:

- login/logout;
- create/update/archive organizations;
- create/update/archive users;
- create/revoke access grants;
- create registry and schema;
- read audit;
- no global frontend error noise.

### Registry admin

Must verify:

- create/update/archive registry schema blocks and fields;
- manage reference lists/items;
- create templates and report templates where permitted;
- denied access to unrelated organization/user administration where applicable.

### Org admin / scoped card manager

Must verify:

- sees only assigned organization branch and descendants;
- cannot see parent/sibling branches;
- can create/edit/archive cards inside scope;
- can use attachments, `file_ref`, generated documents, imports/exports, and reports only within scope;
- no global users/roles/audit permission errors while working with cards.

### Public-link user

Must verify:

- opens card without login;
- edits only public-editable fields;
- uploads/list/downloads attachments within public-link rules;
- cannot archive/delete files;
- cannot edit `file_ref` unless a later explicit phase approves it;
- sees useful Russian errors for expired/disabled/exhausted links.

### MCP operator

Must verify:

- tools use REST API only;
- read tools are read-only annotated;
- write tools require confirmation for destructive actions;
- content reads have size/sensitivity guardrails;
- forbidden operations return normalized errors.

## Scope

Allowed:

- user-scenario bug fixes;
- frontend query/loading/permission UX fixes;
- import size/row limit hardening;
- card list/filter/archive UX fixes;
- card metadata/org-unit correction decision and implementation if approved inside this bugfix scope;
- UAT scenario documentation and tests;
- MCP content-read scenario hardening inherited from Phase 5Q.

Not allowed:

- new report formats;
- new MCP tool categories;
- public-link document workflows;
- binary attachment/document export;
- new storage backend;
- service desk integration;
- MDB migration;
- hardcoded HR-specific fields.

## Verification

Required checks before closeout:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote
pnpm -C frontend e2e
```

Server-side validation where applicable:

```bash
cd /opt/reg_engine/backend
sudo -u postgres env TEST_DATABASE_URL='postgresql+psycopg:///reg_engine_test' .venv/bin/python -m pytest -q -p no:cacheprovider
```

Manual UAT must be run against disposable/staging data, not production personal data.

## Closeout Criteria

- All P0 findings are fixed.
- P1 findings are fixed or explicitly deferred with rationale.
- User scenario matrix is documented and at least smoke-tested.
- README, PLANS.md, PROJECT_TREE.md, and tests are updated.
- No unrelated feature work is included.
