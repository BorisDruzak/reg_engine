# PLANS.md

## Project

Registry Engine is a configurable web engine for schema-driven registries. It is not a hardcoded employee registry.

## Current Status

Completed phases:

- Phase 1B: Core Schema v1 database foundation.
- Phase 1C: Organization tree and RBAC services.
- Phase 1D: Registry schema and dynamic cards.
- Phase 1E: Public links, transfer, and audit.
- Phase 1E.1: Core service hardening before API.
- Phase 1F: REST API foundation and service wiring.
- Phase 1G: Current API/service hardening.
- Phase 1H: Bootstrap and seed.
- Phase 1I: Login and session flow.
- Phase 1J: User and access management API.
- Phase 1K.1: Authenticated admin shell.
- Phase 1K.2: Registry and card frontend workflows.
- Phase 1K.3: Dynamic card form editing.
- Phase 1K.4: Public-link edit page.
- Phase 1K.5: Frontend browser validation pass.
- Phase 1K.6: Russian UI localization.
- Phase 1L: Current implementation stabilization.
- Phase 2.0: Documents product scope decision.
- Phase 2A: Document storage architecture.
- Phase 2B: Attachment backend foundation.
- Phase 2E: Attachment security and live validation slice for attachment-first backend.
- Phase 2F: Attachment backend hardening before next document phases.
- Phase 2C: Generated document templates backend foundation.
- Phase 2D: Frontend document workflows.
- Phase 2G: Document template management UI.
- Phase 2H: Public-link attachment workflows.
- Phase 2I: Public-link attachment limit semantics and bugfixes.
- Phase 2K.0: Admin workflow API gap audit.
- Phase 2K.1: Organization Units API.
- Phase 2K.2: Registry Update And Archive API.
- Phase 2K.3: Card Block Instance Archive API.
- Phase 2K.4: Bulk Card Values Update API.
- Phase 2K.5: API Coverage And Live Validation.
- Phase 2K: Core Backend API Completeness.
- Phase 2L.0: Admin UI Mutation Foundation.

Current stop point:

- Phase 2I public-link attachment limit semantics and bugfixes are completed.
- Phase 2K.0 admin workflow API gap audit is completed and recorded in
  `docs/PHASE_2K_ADMIN_API_READINESS.md`.
- Phase 2K.1 Organization Units API is completed.
- Phase 2K.2 Registry Update And Archive API is completed.
- Phase 2K.3 Card Block Instance Archive API is completed.
- Phase 2K.4 Bulk Card Values Update API is completed.
- Phase 2K.5 API Coverage And Live Validation is completed.
- Phase 2K Core Backend API Completeness is completed.
- Phase 2J remains planned for the `file_ref` dynamic field type, but it may be
  deferred behind Phase 2L core admin workflows unless explicitly reprioritized.
- Phase 2L.0 Admin UI Mutation Foundation is completed.
- Phase 2L is the current frontend product-completeness phase: full admin CRUD UI
  for organizations, users, access grants, registries, schema builder, and
  cards.
- Phase 2L.1 Organization Management UI is the next implementation slice.
- PDF conversion, binary `.docx` template upload/versioning, import/export, reports, and MCP remain deferred until their explicit phases.
- Operational tooling supports same-origin frontend serving from `frontend/dist` through the backend service and `scripts/deploy-frontend.ps1`.

## Core Rules

- Keep the engine schema-driven.
- Do not create a hardcoded employee table.
- Do not add fixed HR-only fields.
- Keep card structure in registries, blocks, fields, and typed values.
- Keep backend access checks as the security boundary.
- Keep public-link editing backend-validated.
- Keep normal deletes as archive behavior.
- Keep the frontend Russian-first for user-facing text.
- Keep Phase 2 storage roots and operational values outside Git.
- Keep `file_ref` generic: it must not become an HR-specific document field.

## Current Admin UI Gap

The backend exposes the core REST operations needed for Phase 2L admin UI
foundation: organizations, org units, users, roles, permissions, access grants,
registries, blocks, fields, reference lists/items, cards, repeatable block
instances, bulk card values, attachments, generated documents, public links,
and audit reads. Phase 2K.0 records the API readiness matrix in
`docs/PHASE_2K_ADMIN_API_READINESS.md`. Phase 2K.5 completed the API coverage
and live validation checkpoint. No planned Phase 2K backend API gaps remain
before Phase 2L.

The current authenticated frontend is not yet a complete admin workspace:

- Phase 2L.0 now provides shared admin mutation API client functions, reusable
  Russian-first form/dialog/confirmation/feedback components, localized error
  mapping, and an E2E smoke path that opens every admin section without console
  errors;
- organizations are listed but cannot be created, edited, or archived in UI;
- users, roles, and permissions are listed, but users cannot be created,
  edited, password-reset, or archived in UI;
- access grants are listed, but grants cannot be issued or revoked in UI;
- registries and schemas are displayed, but registry create/update/archive and
  block/field/reference-list editing are not exposed as UI workflows;
- cards are listed and existing field values can be edited, but card creation,
  card metadata edit, archive, repeatable block-instance management, and bulk
  save workflows are incomplete;
- current UI is useful for inspection and partial editing, not yet for full
  setup from an empty database.

Phase 2L exists to close the remaining frontend workflow gaps before advanced
document, import/export, report, or MCP phases.

## Phase 2: Documents And Attachments

Status: in progress.

Approved direction so far:

- Card-level attachments first.
- Local filesystem storage backend through a storage abstraction, configured outside Git.
- Generated `.docx` documents use schema-driven card data through the approved `docx_text_v1` renderer.
- Public-link attachment list/upload/download is available for active public edit links.
- Public-link attachment upload limits are separate from public field-edit usage limits.

Completed Phase 2 work:

- Phase 2.0 captured the product scope decision and accepted attachment-first direction.
- Phase 2A accepted the attachment storage architecture and metadata model.
- Phase 2B added attachment metadata models, migration `0005_attachments`, local filesystem storage abstraction, attachment service, authenticated attachment endpoints, and tests.
- Phase 2E completed live security validation for the attachment-first backend slice using disposable data and temporary storage.
- Phase 2F hardened upload bounds, storage cleanup, filename/download headers, runtime settings, scanner mode handling, and attachment lifecycle documentation.
- Phase 2C added `document_templates`, `generated_documents`, backend-only `docx_text_v1` rendering, generated file storage, audit, and archive behavior.
- Phase 2D added authenticated Russian-first card-workspace panels for attachments and generated documents, plus generated-document API endpoints needed by the UI.
- Phase 2G added authenticated Russian-first template creation and archive controls for existing `docx_text_v1` document templates.
- Phase 2H added public-link attachment list/upload/download for active public edit links without adding public archive/delete, generated-document controls, `file_ref`, PDF conversion, import/export, MCP, or a new migration.
- Phase 2I separated public field-edit usage limits from public attachment upload limits, added rollback storage cleanup, clarified download streaming deferral, and fixed public no-file UI validation text.

## Phase 2J: `file_ref` Dynamic Field Type

Status: planned, can be deferred behind Phase 2K/2L admin usability work.

Purpose: add a generic dynamic field type that references an existing card attachment from the same card, without adding new storage, public-link file-ref editing, PDF conversion, import/export, reports, or MCP.

### Phase 2J.0: Planning And ADR

Status: planned next.

Required decisions:

- `file_ref` references `card_attachments.id`, not `stored_files.id`.
- `file_ref` is a single attachment reference in the first implementation; `multi_file_ref` is deferred.
- `file_ref` uses existing attachment upload/list/download flows. It does not upload bytes inline in the first implementation.
- Public-link editing of `file_ref` is deferred.
- Transfer behavior must not copy the old `card_attachment.id` directly into the new card.
- Generated documents render `file_ref` as attachment title/original filename text only.

Acceptance criteria:

- ADR records the decisions above before code starts.
- PLANS.md states all sub-phases, tests, non-goals, and transfer behavior.
- No backend, frontend, migration, or API implementation starts in Phase 2J.0.

### Phase 2J.1: Database And Model Foundation

Required work after Phase 2J.0 acceptance:

- Add migration, expected as `0008_file_ref_field_values` or equivalent.
- Add `field_values.value_attachment_id uuid nullable` referencing `card_attachments.id`.
- Add an index such as `ix_field_values_field_id_value_attachment_id`.
- Add `file_ref` to supported dynamic field types and related check constraints/constants.
- Keep `file_ref` generic and schema-driven.

Acceptance criteria:

- Migration applies cleanly on disposable PostgreSQL.
- Metadata/schema tests cover the new column, FK, index, and allowed field type.
- No HR-specific document field is added.

### Phase 2J.2: Backend Service Support

Required work:

- Allow registry admins to create `form_fields.field_type=file_ref`.
- Let authenticated card editors set a `file_ref` value to an existing active attachment of the same card.
- Let authenticated card editors clear a `file_ref` value with `null`.
- Reject references to attachments from another card.
- Reject setting a new `file_ref` value to an archived attachment.
- Preserve existing `file_ref` values on read if the referenced attachment is later archived, returning archived metadata instead of silently deleting the value.
- Keep public-link edit for `file_ref` blocked/deferred.

Acceptance criteria:

- Service tests cover set, read, clear, wrong-card rejection, archived-attachment rejection, and archived-reference read behavior.
- Audit records field value changes without exposing storage keys or filesystem paths.

### Phase 2J.3: Transfer Behavior

Required behavior:

- When a card transfer copies dynamic values, `file_ref` must not point from the new card to the old card's `card_attachment.id`.
- Preferred behavior: create a new `card_attachment` row for the target card pointing to the same `stored_file_id`, copy title/description/position as appropriate, and point the new field value to the new `card_attachment.id`.
- If the referenced old attachment is archived at transfer time, either preserve a read-only archived reference according to explicit rules or clear it with a documented audit entry. Preferred behavior is to copy only active attachment links.

Acceptance criteria:

- Transfer tests prove the new card has its own `card_attachment` link.
- New card `file_ref` points to the new attachment link, not the old one.
- Old and new attachment links may share the same `stored_file_id`; binary bytes are not duplicated.

### Phase 2J.4: API Support

Required work:

- Existing card field update endpoint accepts `file_ref` values as `card_attachment.id` or `null`.
- Card read returns `file_ref` as metadata, not only a raw UUID.
- Metadata should include: `attachment_id`, `title`, `original_filename`, `content_type`, `content_length_bytes`, `scanner_status`, and `archived_at`.
- Existing attachment list endpoint remains the source of selectable file candidates.

Acceptance criteria:

- API tests cover set, clear, read metadata, wrong-card rejection, and archived-reference read behavior.
- API responses do not expose storage key, filesystem path, or storage root.

### Phase 2J.5: Frontend Authenticated Editor

Required work:

- Add authenticated `file_ref` editor to the schema-driven card form.
- The editor lists active attachments for the current card.
- The editor allows selecting an attachment and clearing the value.
- The editor shows Russian-first labels and empty states:
  - `Файл`;
  - `Выберите файл`;
  - `Нет вложений`;
  - `Сначала загрузите файл во Вложения`;
  - `Файл архивирован`;
  - `Очистить файл`.
- Do not add inline file upload inside the `file_ref` control in this phase.

Acceptance criteria:

- Frontend unit/e2e tests cover list/select/save/clear/empty-state behavior.
- Dynamic form stays schema-driven and does not hardcode HR document fields.

### Phase 2J.6: Generated Document Rendering

Required work:

- `docx_text_v1` renders `file_ref` as attachment title/original filename text.
- Empty `file_ref` renders safely as empty text.
- Archived referenced attachment renders with an archive marker, for example `(архив)`.
- Do not embed binary files into generated `.docx`.
- Do not add PDF conversion.
- Do not add download URLs into generated documents in this phase.

Acceptance criteria:

- Generated document tests cover active file ref, empty file ref, and archived file ref rendering.
- Rendering remains schema-driven and does not assume HR templates.

### Phase 2J.7: Live Validation

Required work:

- Use disposable PostgreSQL database and temporary storage.
- Create a registry schema with a `file_ref` field.
- Upload an attachment to a card.
- Set `file_ref` to that attachment.
- Read the card and verify metadata.
- Generate a document and verify rendered text.
- Transfer the card and verify the new card has its own attachment link and `file_ref` points to it.
- Clean up disposable database/storage.

Acceptance criteria:

- No production personal data is used.
- No production storage is mutated.
- Local checks, PostgreSQL-backed tests, frontend tests, project-map check, README, and PLANS update pass.

## Phase 2J Non-Goals

Phase 2J must not implement:

- `multi_file_ref`;
- public-link `file_ref` editing;
- inline upload inside the `file_ref` editor;
- `file_ref` import/export;
- PDF conversion;
- binary `.docx` template upload;
- template versioning;
- reports;
- MCP;
- MDB migration;
- service desk integration.

## Phase 2K: Core Backend API Completeness

Status: completed.

Purpose: close remaining non-document backend API gaps that are needed for a complete registry administration workflow before moving to advanced documents, import/export, reports, or MCP.

Phase 2K must not implement:

- PDF conversion;
- binary `.docx` template upload;
- template versioning;
- import/export;
- reports;
- MCP;
- service desk integration;
- hardcoded HR fields.

### Phase 2K.0: Admin Workflow API Gap Audit

Status: completed.

Required work:

- Verify the actual API surface needed by Phase 2L:
  organizations, org units, users, roles, permissions, access grants,
  registries, blocks, fields, reference lists/items, cards, block instances,
  public links, attachments, generated documents, and audit.
- Record which workflows already have complete API support and which require
  backend additions in Phase 2K.
- Keep frontend-only gaps in Phase 2L, not Phase 2K.

Acceptance criteria:

- PLANS.md or a linked implementation note lists the API readiness matrix.
- No new business-specific tables or HR-specific fields are introduced.
- No frontend implementation is added in this audit step.

Completion evidence:

- API readiness matrix: `docs/PHASE_2K_ADMIN_API_READINESS.md`.
- Backend gaps confirmed for Phase 2K: org units API, registry update/archive,
  card block instance archive, and atomic bulk card values update.
- Frontend-only gaps remain assigned to Phase 2L.

### Phase 2K.1: Organization Units API

Status: completed.

Required work:

- Add API for `org_units` management:
  - list by organization;
  - create;
  - read;
  - update;
  - archive.
- Keep `org_units` as filters/reference data, not RBAC boundaries in v1.
- Enforce organization-scope permissions through backend services.

Acceptance criteria:

- Org-unit API tests cover allowed and denied access paths.
- Org-unit list can be used by frontend filters and dynamic `org_unit_ref` fields.

Completion evidence:

- Added `GET/POST /api/v1/organizations/{organization_id}/org-units`.
- Added `GET/PATCH/DELETE /api/v1/org-units/{org_unit_id}`.
- Org units remain filters/reference data and are not RBAC boundaries.
- Reads use organization visibility scope; create/update/archive require
  `organizations.manage` in organization scope or superuser.
- Create/update/archive write `audit_events` with `object_type=org_unit`.
- Tests added in `backend/tests/test_api_phase_2k.py`.

### Phase 2K.2: Registry Update And Archive API

Status: completed.

Required work:

- Add registry update endpoint for safe metadata changes such as name/description/status where supported.
- Add registry archive endpoint.
- Keep schema-changing operations in block/field APIs.
- Keep archive behavior soft; no physical deletion.

Acceptance criteria:

- Registry update/archive tests cover permission boundaries.
- Archived registries do not disappear from audit/history-sensitive reads where archive scope is requested.

Completion evidence:

- Added `PATCH /api/v1/registries/{registry_id}` for safe metadata updates:
  name, description, and draft/active lifecycle status.
- Added `DELETE /api/v1/registries/{registry_id}` for soft archive.
- Added `include_archive` support for registry list/read.
- Registry archive sets `lifecycle_status=archived` and `archived_at`.
- Registry update/archive require `registry.schema.manage`.
- Create/update/archive write `audit_events` with `object_type=registry`.
- Tests added in `backend/tests/test_api_phase_2k.py`.

### Phase 2K.3: Card Block Instance Archive API

Status: completed.

Required work:

- Add archive endpoint for repeatable `card_block_instances`.
- Prevent archiving required/non-repeatable system instances where unsafe.
- Ensure archived block instances are hidden from normal card reads but available in archive scope if supported.

Acceptance criteria:

- Tests cover repeatable instance archive, non-repeatable/system guardrails, and value retention.

Completion evidence:

- Added `DELETE /api/v1/card-block-instances/{block_instance_id}`.
- Repeatable block instances can be soft-archived.
- Non-repeatable, system, locked, and required-minimum instances are guarded.
- Normal card reads hide archived instances.
- `include_archive=true` card reads include archived instances and retained
  field values.
- New repeatable instances allocate ordinals above archived rows to avoid unique
  constraint conflicts.
- Archive writes `audit_events` with `object_type=card_block_instance`.
- Tests added in `backend/tests/test_api_phase_2k.py`.

### Phase 2K.4: Bulk Card Values Update API

Status: completed.

Required work:

- Add an atomic bulk field-values endpoint, expected as `PATCH /api/v1/cards/{card_id}/values` or equivalent.
- Reuse existing single-field validation and audit behavior.
- Ensure either all values save or none save.
- Include support for normal dynamic field types and `file_ref` after Phase 2J.

Acceptance criteria:

- Tests cover atomic success, partial validation failure rollback, audit behavior, and permission denial.

Completion evidence:

- Added `PATCH /api/v1/cards/{card_id}/values`.
- Bulk payload accepts multiple `{field_id, value, block_instance_id}` updates.
- Bulk update reuses existing single-field coercion, validation, permission,
  and audit behavior.
- Service uses a nested transaction/savepoint so partial validation failure
  rolls back earlier values in the same bulk request.
- Tests cover route registration, success, rollback, and permission denial in
  `backend/tests/test_api_phase_2k.py`.

### Phase 2K.5: API Coverage And Live Validation

Status: completed.

Required work:

- Add integration tests for org units, registry update/archive, block-instance archive, and bulk card values.
- Validate against disposable PostgreSQL and temporary storage where relevant.
- Update README, PLANS.md, PROJECT_TREE.md, and frontend API client only if needed.

Acceptance criteria:

- Local backend checks pass.
- PostgreSQL-backed tests pass against disposable database.
- No unrelated document/import/report/MCP work is introduced.

Completion evidence:

- Local full check passed with `scripts/check.ps1 -SkipRemote` after Phase
  2K.4 implementation.
- Disposable PostgreSQL validation passed against `reg_engine_test` with
  `backend/tests/test_api_phase_2k.py -q`: 13 tests passed.
- Server checkout was synchronized to `origin/main` at commit `e834482e`.
- Server healthcheck passed after service restart.
- Live OpenAPI validation confirmed Phase 2K routes for org units, registry
  update/archive, card block instance archive, and bulk card values update.
- No migration was required for Phase 2K.5; production database schema was not
  changed in this validation slice.
- No frontend implementation, import/export, PDF conversion, reports, or MCP
  work was introduced.

## Phase 2L: Core Admin CRUD UI

Status: in progress.

Purpose: make the authenticated Russian-first admin UI capable of setting up
and operating the registry engine from an empty or near-empty database without
using Swagger or manual API calls.

Phase 2L must not implement:

- `file_ref` unless Phase 2J is already completed;
- PDF conversion;
- binary `.docx` template upload;
- template versioning;
- import/export;
- reports;
- MCP;
- service desk integration;
- hardcoded HR screens or HR-only labels.

### Phase 2L.0: Admin UI Mutation Foundation

Status: completed.

Required work:

- Add frontend API client functions for create/update/archive operations already
  exposed by backend.
- Establish reusable Russian-first form, modal/drawer, confirmation, error, and
  success-message patterns.
- Keep backend errors mapped to Russian user-facing messages.
- Preserve frontend checks as UX only; backend remains the security boundary.

Acceptance criteria:

- Unit tests cover shared form/error utilities.
- E2E smoke can log in and open every admin section without console errors.
- No business-specific labels or fixed employee fields are added.

Completion evidence:

- Added typed frontend API client functions for backend create/update/archive
  routes covering organizations, org units, registries, blocks, fields,
  reference lists/items, cards, repeatable block instances, bulk field values,
  users, access grants, public links, and card transfer.
- Added reusable Russian-first admin mutation components:
  `AdminMutationForm`, `AdminMutationDialog`, `ArchiveConfirmation`, and
  `MutationFeedback`.
- Error and success feedback uses existing localized frontend error mapping.
- Added frontend unit tests for admin mutation API routes and shared mutation
  form/dialog/feedback utilities.
- Updated Playwright smoke to log in, open every admin section, and fail on
  browser console/page errors.
- Verified `pnpm -C frontend test:run`, `pnpm -C frontend lint`,
  `pnpm -C frontend typecheck`, and `pnpm -C frontend e2e`.
- No business-specific labels, fixed employee fields, backend code,
  migrations, import/export, PDF conversion, reports, or MCP work was added.

### Phase 2L.1: Organization Management UI

Required work:

- Add create organization form.
- Add edit organization metadata form.
- Add archive organization confirmation.
- Display parent/child context clearly.
- Keep descendants visibility rules explained through data, not frontend-only
  security checks.

Acceptance criteria:

- User can create a root or child organization through UI.
- User can edit allowed organization metadata through UI.
- User can archive an organization with confirmation.
- Frontend tests cover create/edit/archive success and validation errors.

### Phase 2L.2: User Management UI

Required work:

- Add create user form with email, display name, password, status, and superuser
  flag where allowed.
- Add edit user form for profile/status fields.
- Add password reset/change workflow for admins.
- Add archive user confirmation.
- Show Russian labels for built-in/system display names.

Acceptance criteria:

- User can create, edit, password-reset, and archive users through UI.
- Password fields are not logged or persisted outside the API request.
- Frontend tests cover validation, success, and backend-denied states.

### Phase 2L.3: Access Grant Management UI

Required work:

- Add create access grant workflow:
  user, role, optional registry, organization, include descendants, validity
  dates where supported.
- Add revoke/archive access grant confirmation.
- Show scope summary in Russian before save.
- Prevent ambiguous UI states where a grant appears broader or narrower than
  backend rules.

Acceptance criteria:

- User can issue and revoke grants through UI.
- Org admin descendant-scope rules remain backend-enforced.
- Frontend tests cover global, organization-scoped, descendant, registry-scoped,
  and denied grant flows where supported by API.

### Phase 2L.4: Registry Management UI

Required work:

- Add create registry form.
- Add update/archive registry controls when Phase 2K exposes them.
- Keep registry as a list/mechanism for organizing cards, not a per-organization
  database schema.
- Surface lifecycle/status labels in Russian.

Acceptance criteria:

- User can create a generic schema-driven registry through UI.
- User can update/archive registry metadata if API support exists.
- Tests prove no hardcoded employee registry fields are created.

### Phase 2L.5: Schema Builder UI

Required work:

- Add block create/update/archive controls.
- Add field create/update/archive controls.
- Support dynamic field types already supported by backend.
- Support repeatable block flag, public visibility/editability flags, required
  flags, position/order controls where API supports them.
- Keep locked/system blocks and fields protected by backend and reflected in UI.

Acceptance criteria:

- User can build a registry schema from UI without migrations.
- Adding a new field keeps old cards valid with empty values.
- Frontend tests cover block/field create/update/archive and locked-field
  denial states.

### Phase 2L.6: Reference List Management UI

Required work:

- Add reference-list create/update/archive controls.
- Add reference-item create/update/archive controls.
- Support owner organization, inheritance to descendants, and locked inherited
  list behavior as exposed by backend.
- Wire select/multi_select fields to reference lists without hardcoded options.

Acceptance criteria:

- User can create a reference list and items through UI.
- Select/multi_select fields can use that reference list.
- Locked inherited list behavior is visible and cannot be bypassed in UI.

### Phase 2L.7: Card Create, Metadata, And Editor UI

Required work:

- Add create card form:
  registry, organization, optional org unit, display name, lifecycle/public-edit
  flags where supported.
- Add card metadata edit and archive controls.
- Add repeatable block-instance add/archive UI after Phase 2K API support.
- Add bulk save workflow after Phase 2K API support.
- Keep existing per-field editor as a fallback path.

Acceptance criteria:

- User can create a card through UI and immediately edit schema-driven values.
- User can archive a card with confirmation.
- Repeatable block instance controls work where API support exists.
- Bulk save is atomic where API support exists.
- Frontend e2e covers create card, edit values, add repeatable instance,
  archive card, and audit refresh.

### Phase 2L.8: Public Link Admin Controls UI

Required work:

- Add authenticated public-link list/create/disable controls on the card
  workspace.
- Expose `expires_in_days` and `max_attachment_uploads` controls.
- Clearly separate field-edit usage limits from attachment-upload limits.
- Keep public-link generated-document workflows deferred.

Acceptance criteria:

- User can create and disable a public edit link through UI.
- User can set attachment upload limit at link creation.
- Public-link UI tests cover disabled, expired, upload-limit, and no-file
  validation messaging.

### Phase 2L.9: Admin UI Live Validation

Required work:

- Use disposable or explicitly approved test data.
- Validate this complete setup path in browser:
  create organization, create user, issue access grant, create registry, build
  schema, create reference list/items, create card, edit card fields, upload
  attachment, generate document, create public link, verify audit.
- Capture console health and first-screen rendering evidence.
- Update README, PLANS.md, PROJECT_TREE.md, and docs as needed.

Acceptance criteria:

- Full admin setup path works from UI without Swagger/manual API calls.
- `scripts/check.ps1 -SkipRemote` passes.
- Frontend e2e and browser smoke pass.
- Server deployment and same-origin frontend serving remain working.

## Planned Phases After Core Admin UI

These require explicit approval after Phase 2K/2L unless the user explicitly
reprioritizes them.

### Phase 2M: Binary `.docx` Template Upload And Template Versioning

Purpose: move from JSON `docx_text_v1` template bodies toward managed binary template assets and version history.

Planned scope:

- Upload binary `.docx` templates through authenticated API.
- Store template files through storage abstraction.
- Add template versions.
- Keep templates schema-driven and avoid real personal data in Git/tests.
- Keep PDF conversion deferred.

### Phase 2N: PDF Conversion

Purpose: add PDF generation after generated-document and template boundaries are stable.

Planned scope:

- Decide renderer/converter strategy.
- Add PDF generation for supported generated documents.
- Store generated PDFs through storage abstraction.
- Add audit and access checks.
- Avoid adding direct public-link PDF flows unless explicitly approved.

### Phase 3: Import And Export

Purpose: add controlled data exchange.

Planned scope:

- CSV/XLSX import with mapping, preview, validation, and audit.
- CSV/XLSX/JSON export with permission checks.
- Export of attachment/document metadata only first; binary export requires separate approval.

### Phase 4: Reports

Purpose: add report definitions and report runs.

Planned scope:

- Report templates.
- Registry/card reports.
- Period reports.
- Report output storage and audit.

### Phase 5: MCP Over API Only

Purpose: add MCP after API, auth, RBAC, audit, import/export, and document boundaries are stable.

Planned scope:

- Read-only MCP tools first.
- MCP calls API only.
- No direct DB access.
- Audit source `mcp`.
- Write tools only after explicit approval.

## Verification

Required checks for each implementation checkpoint:

- local backend checks;
- PostgreSQL-backed tests against a disposable test database where applicable;
- frontend lint, typecheck, unit tests, e2e tests, and format checks where applicable;
- project map update/check;
- README and PLANS update.
