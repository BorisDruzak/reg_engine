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
- Phase 2L.1: Organization Management UI.
- Phase 2L.2: User Management UI.
- Phase 2L.3: Access Grant Management UI.
- Phase 2L.4: Registry Management UI.
- Phase 2L.5: Schema Builder UI.
- Phase 2L.6: Reference List Management UI.
- Phase 2L.7: Card Create, Metadata, And Editor UI.
- Phase 2L.8: Public Link Admin Controls UI.
- Phase 2L.9: Admin UI Live Validation.
- Phase 2J.0: `file_ref` Planning And ADR.
- Phase 2J.1: `file_ref` Database And Model Foundation.
- Phase 2J.2: `file_ref` Backend Service Support.
- Phase 2J.3: `file_ref` Transfer Behavior.
- Phase 2J.4: `file_ref` API Support.
- Phase 2J.5: `file_ref` Frontend Authenticated Editor.
- Phase 2J.6: `file_ref` Generated Document Rendering.
- Phase 2J.7: `file_ref` Live Validation.
- Phase 2M: Binary `.docx` Template Upload And Template Versioning.
- Phase 2N: PDF Conversion.
- Phase 3A: Card Export Foundation.
- Phase 3B: Import Preview And Mapping.
- Phase 3C: Import Commit And Export Polish.
- Phase 3D: Import Export Frontend UI.
- Phase 3E: XLSX Import Export Format Support.
- Phase 4A: Report Foundation API.
- Phase 4B: Report Frontend UI.
- Phase 4C: Report Template Settings Edit.
- Phase 4D: CSV Report Output.
- Phase 4E: Report Run List Polish.
- Phase 4F: Report Archive Visibility.
- Phase 4G: XLSX Report Output.
- Phase 4H: PDF Report Output.
- Phase 4I: Report Template Type And Format Edit.
- Phase 4J: Report Run Parameters And Summary Visibility.
- Phase 4K: Report Template Parameter Schema UI.
- Phase 4L: Report Run Visual Parameter Form.
- Phase 4M: Report Run Enum Parameter Controls.
- Phase 4N: Report Run Enum Option Labels.
- Phase 4O: Report Run Default Parameter Payload.
- Phase 4P: Report Run Date Parameter Controls.
- Phase 4Q: Report Run Parameter Description Hints.
- Phase 4R: Report Run Schema Default Parameters.
- Phase 4S: Report Run Required Parameter Validation.
- Phase 4T: Report Run Scalar Constraint Validation.
- Phase 4U: Report Run Pattern And Multiple Validation.
- Phase 4V: Report Run Exclusive Bound Validation.
- Phase 4W: Cross-Cutting Bugfix And Stabilization.
- Phase 5A: MCP Read-Only Gateway.
- Phase 5B: MCP Hardening And Config.
- Phase 5C: MCP Mutation Client Foundation.
- Phase 5D: MCP Registry Create Write Tool.
- Phase 5E: MCP Registry Update And Archive Write Tools.
- Phase 5F: MCP Schema Builder Write Tools.
- Phase 5G: MCP Card Lifecycle Write Tools.
- Phase 5H: MCP Card Field Value Write Tools.
- Phase 5I: MCP Card Block Instance Write Tools.
- Phase 5J: MCP Card Transfer Write Tool.
- Phase 5K: MCP Report Template Write Tools.
- Phase 5L: MCP Report Run Write Tools.

Current stop point:

- Phase 5K MCP Report Template Write Tools is completed and deployed:
  report template create/update/archive MCP tools call only existing REST API
  endpoints, with report template permissions, validation, archive semantics,
  and audit remaining API-enforced. Commit `f632adb5` is pushed, the server
  checkout is synchronized to `origin/main`, server checks passed, server MCP
  targeted tests passed with `33 passed`, server MCP stdio `tools/list` shows
  all three new tools with `readOnlyHint=false`, healthcheck passed, and
  Alembic remains at `0014_report_pdf_output (head)`. No production report
  template was created, updated, or archived during smoke validation.
- Phase 5L MCP Report Run Write Tools is completed and deployed:
  report run generation/archive MCP tools call only existing REST API
  endpoints, with report permissions, parameter/default validation, output
  storage, archive semantics, and audit remaining API-enforced. Commit
  `610defc7` is pushed, the server checkout is synchronized to `origin/main`,
  server checks passed, server MCP targeted tests passed with `35 passed`,
  server MCP stdio `tools/list` shows both new tools with
  `readOnlyHint=false`, healthcheck passed, and Alembic remains at
  `0014_report_pdf_output (head)`. No production report run was generated or
  archived during smoke validation. Report output download/content tools stay
  deferred as binary workflows.
- Phase 5M MCP Document Template Write Tools is completed locally and pending
  full local check, push, and deploy: text document template create/archive MCP
  tools call only existing REST API endpoints, while template permissions, text
  template validation, archive semantics, version metadata, and audit remain
  API-enforced. Binary `.docx` template upload, template version upload,
  generated document workflows, and document content download stay deferred for
  later MCP phases.
- Phase 5J MCP Card Transfer Write Tool is completed and deployed:
  the existing REST card transfer workflow is exposed through MCP with
  explicit transfer confirmation, while source-card superseding, target-card
  creation, dynamic value copy, `file_ref` copy/clear behavior, permissions,
  and audit remain API-enforced. Commit `cefdd6da` is pushed, the server
  checkout is synchronized to `origin/main`, server checks passed, server MCP
  targeted tests passed, server MCP stdio `tools/list` shows the new tool with
  `readOnlyHint=false`, healthcheck passed, and Alembic remains at
  `0014_report_pdf_output (head)`. No production card was transferred during
  smoke validation.
- Phase 5I MCP Card Block Instance Write Tools is completed and deployed:
  repeatable block-instance create/archive MCP tools call only existing REST
  API endpoints, with backend permissions, repeatable/non-repeatable rules,
  archive protection, and audit remaining API-enforced. Commit `f14a39b4` is
  pushed, the server checkout is synchronized to `origin/main`, server checks
  passed, server MCP targeted tests passed, server MCP stdio `tools/list`
  shows both new tools with `readOnlyHint=false`, healthcheck passed, and
  Alembic remains at `0014_report_pdf_output (head)`. No production block
  instance was created or archived during smoke validation.
- Phase 2I public-link attachment limit semantics and bugfixes are completed.
- Phase 2K.0 admin workflow API gap audit is completed and recorded in
  `docs/PHASE_2K_ADMIN_API_READINESS.md`.
- Phase 2K.1 Organization Units API is completed.
- Phase 2K.2 Registry Update And Archive API is completed.
- Phase 2K.3 Card Block Instance Archive API is completed.
- Phase 2K.4 Bulk Card Values Update API is completed.
- Phase 2K.5 API Coverage And Live Validation is completed.
- Phase 2K Core Backend API Completeness is completed.
- Phase 2J.0 `file_ref` planning and ADR is completed and recorded in
  `docs/ADR/0007-file-ref-dynamic-field.md`.
- Phase 2J.1 `file_ref` database and model foundation is completed:
  migration `0008_file_ref_field_values`, metadata support, and model smoke
  tests are in place.
- Production PostgreSQL is migrated to `0008_file_ref_field_values` after
  backup, preflight, disposable PostgreSQL verification, and post-checks.
- Phase 2J.2 `file_ref` backend service support is completed: authenticated
  card editors can set/read/clear same-card active attachment references;
  wrong-card and archived attachment selections are rejected; archived
  referenced attachment metadata remains readable; public-link `file_ref`
  editing remains blocked.
- Phase 2J.3 `file_ref` transfer behavior is completed: active referenced
  attachments are copied as target-card attachment links pointing to the same
  stored file, while archived references are cleared and recorded in transfer
  audit metadata.
- Phase 2J.4 `file_ref` API support is completed: authenticated card field
  value endpoints accept `card_attachment.id`/`null` and card reads return safe
  attachment metadata without storage keys, filesystem paths, checksums, or
  stored-file ids.
- Phase 2J.5 `file_ref` frontend authenticated editor is completed: the
  Russian card editor lists existing card attachments, allows selecting and
  clearing a `file_ref`, shows empty and archived states, and keeps inline file
  upload out of the `file_ref` control.
- Phase 2J.6 `file_ref` generated document rendering is completed:
  `docx_text_v1` renders active references as attachment title/original
  filename text, empty values as empty text, and archived references with an
  `(архив)` marker, without embedding files or adding download URLs.
- Phase 2J.7 `file_ref` live validation is completed on disposable
  PostgreSQL and temporary storage: schema creation, attachment upload,
  `file_ref` set/read, generated document rendering, transfer copy semantics,
  audit metadata, and cleanup were verified.
- Phase 2L.0 Admin UI Mutation Foundation is completed.
- Phase 2L.1 Organization Management UI is completed.
- Phase 2L.2 User Management UI is completed.
- Phase 2L.3 Access Grant Management UI is completed.
- Phase 2L.4 Registry Management UI is completed.
- Phase 2L.5 Schema Builder UI is completed.
- Phase 2L.6 Reference List Management UI is completed.
- Phase 2L.7 Card Create, Metadata, And Editor UI is completed.
- Phase 2L.8 Public Link Admin Controls UI is completed.
- Phase 2L.9 Admin UI Live Validation is completed.
- Phase 2L core admin UI product-completeness phase is completed: full admin
  CRUD UI for organizations, users, access grants, registries, schema builder,
  reference lists, cards, attachments, generated documents, public links, and
  audit has browser validation coverage.
- Phase 2J is complete.
- Phase 2M binary `.docx` template upload and template versioning is
  completed as an authenticated backend API and migration slice.
- Production PostgreSQL is migrated to
  `0009_document_template_versions` after fresh backup, preflight,
  disposable PostgreSQL verification, Alembic upgrade, post-checks, backend
  service restart, and server check.
- Phase 2N PDF conversion is completed for authenticated `docx_text_v1`
  generated documents. Binary `.docx` layout conversion to PDF and public
  generated-document workflows remain deferred.
- Phase 3A Card Export Foundation is completed as an authenticated backend API
  slice: JSON and CSV card export use card visibility scope, preserve
  schema-driven block/instance/field structure, export attachment/generated
  document metadata only, and write audit events.
- Phase 3B Import Preview And Mapping is completed as an authenticated backend
  API slice: CSV preview maps rows by `block_code.field_code`, validates
  organization/card scope and dynamic values through card service rules, returns
  row-level errors, and does not mutate cards, field values, files, or audit.
- Phase 3C Import Commit And Export Polish is completed as an authenticated
  backend API slice: CSV commit reuses preview validation, applies atomic
  create/update batches, groups new-card rows by optional `import_key`, and
  writes import audit.
- Phase 3D Import Export Frontend UI is completed and deployed as a
  frontend-only slice: authenticated registry admins can download JSON/CSV
  card exports and run CSV import preview/commit through the existing Phase 3
  REST API. No backend code, models, migrations, XLSX workflows, binary
  import/export, or MCP write tools were added. Commit `fe8163c` is pushed,
  the server checkout is synchronized to `origin/main`, frontend dist is
  deployed, healthcheck passed, Alembic remains at
  `0012_report_csv_output (head)`, and server checks passed.
- Phase 3E XLSX Import Export Format Support is completed and deployed as a
  bounded format-adapter slice: XLSX export/preview/commit reuse the existing
  row-oriented CSV contract and backend validation rules. Commit `6c7880a` is
  pushed, the server checkout is synchronized to `origin/main`, backend
  dependency `openpyxl==3.1.5` is installed on the server, frontend dist is
  deployed, healthcheck passed, Alembic remains at
  `0012_report_csv_output (head)`, and server checks passed. No database
  schema changes, binary attachment/document import/export, report output
  changes, or MCP write tools were included.
- Phase 4A Report Foundation API is completed: migration `0010_reports`,
  backend report templates/runs, JSON report output storage, scoped
  reads/downloads, and audit are implemented, pushed, deployed, and migrated in
  production.
- Production PostgreSQL is migrated to `0010_reports` after fresh backup,
  preflight, disposable PostgreSQL verification, Alembic upgrade, post-checks,
  backend service restart, live OpenAPI route verification, and server check.
- Phase 5A MCP Read-Only Gateway is completed: read-only MCP JSON-RPC tools
  call the REST API only, do not import DB/models or service layer, send
  `X-Reg-Engine-Source: mcp`, and migration `0011_mcp_audit_source` is
  implemented, pushed, deployed, and migrated in production.
- Production PostgreSQL is migrated to `0011_mcp_audit_source` after fresh
  backup, preflight, disposable PostgreSQL verification, Alembic upgrade,
  post-checks, backend service restart, live MCP sanity, and server check.
- Phase 5B MCP Hardening And Config is completed: the read-only MCP stdio
  gateway validates API base URLs, returns JSON-RPC parse/invalid params errors
  without terminating the server loop, and returns tool argument failures as
  MCP tool errors. It is implemented, pushed, deployed, and verified on the
  server. No migration was required.
- Phase 5C MCP Mutation Client Foundation is completed and deployed: the MCP
  REST API client can send JSON `POST`, `PATCH`, and `DELETE` requests with
  bearer auth and `X-Reg-Engine-Source: mcp`, while the published MCP tool list
  remains read-only and no MCP write tools are exposed. Commit `c01e088` is
  pushed, the server checkout is synchronized to `origin/main`, server checks
  passed, server MCP targeted tests passed, live MCP stdio sanity passed, and
  Alembic remains at `0014_report_pdf_output (head)`.
- Phase 5D MCP Registry Create Write Tool is completed and deployed:
  `reg_engine_create_registry` is exposed as the first non-destructive MCP
  write tool and calls the existing REST `POST /api/v1/registries` endpoint, so
  system-admin permission checks and audit remain API-enforced. Commit
  `115947c` is pushed, the server checkout is synchronized to `origin/main`,
  server checks passed, server MCP targeted tests passed, live MCP stdio
  `tools/list` shows `reg_engine_create_registry` with `readOnlyHint=false`,
  healthcheck passed, and Alembic remains at
  `0014_report_pdf_output (head)`. No direct DB access, backend service
  imports, destructive MCP tools, frontend UI, database schema changes, or
  Alembic migrations are included.
- Phase 5E MCP Registry Update And Archive Write Tools is completed and
  deployed: registry update/archive MCP tools call existing REST
  `PATCH /api/v1/registries/{registry_id}` and
  `DELETE /api/v1/registries/{registry_id}` endpoints, require explicit
  `confirm_archive=true` for archive, and keep permissions/audit API-enforced.
  Commit `727e1688` is pushed, the server checkout is synchronized to
  `origin/main`, server checks passed, server MCP targeted tests passed,
  server MCP stdio `tools/list` shows both new tools with
  `readOnlyHint=false`, healthcheck passed, and Alembic remains at
  `0014_report_pdf_output (head)`. No production registry was updated or
  archived during smoke validation.
- Phase 5F MCP Schema Builder Write Tools is completed and deployed:
  schema-builder MCP tools call existing REST form block and form field
  create/update/archive endpoints, require explicit `confirm_archive=true`
  for archive, and keep permissions/validation/audit API-enforced. Commit
  `e620b379` is pushed, the server checkout is synchronized to `origin/main`,
  server checks passed, server MCP targeted tests passed, server MCP stdio
  `tools/list` shows all six new tools with `readOnlyHint=false`, healthcheck
  passed, and Alembic remains at `0014_report_pdf_output (head)`. No
  production schema was updated or archived during smoke validation.
- Phase 5G MCP Card Lifecycle Write Tools is completed and deployed:
  card lifecycle MCP tools call existing REST card create, metadata update,
  and archive endpoints, require explicit `confirm_archive=true` for archive,
  and keep permissions/audit API-enforced. Commit `21b16009` is pushed, the
  server checkout is synchronized to `origin/main`, server checks passed,
  server MCP targeted tests passed, server MCP stdio `tools/list` shows all
  three new tools with `readOnlyHint=false`, healthcheck passed, and Alembic
  remains at `0014_report_pdf_output (head)`. No production card was created,
  updated, or archived during smoke validation.
- Phase 5H MCP Card Field Value Write Tools is completed and deployed:
  card field-value MCP tools call existing REST single and bulk card value
  endpoints, reject empty bulk payloads, and keep validation, permissions,
  atomic bulk behavior, and audit API-enforced. Commit `57a52bc0` is pushed,
  the server checkout is synchronized to `origin/main`, server checks passed,
  server MCP targeted tests passed, server MCP stdio `tools/list` shows both
  new tools with `readOnlyHint=false`, healthcheck passed, and Alembic remains
  at `0014_report_pdf_output (head)`. No production card value was changed
  during smoke validation.
- Phase 4B Report Frontend UI is completed: authenticated Russian-first
  report template/run controls use the existing Phase 4A REST API, without
  backend schema changes, migrations, non-JSON report outputs, scheduled
  reports, public report workflows, or MCP write tools. Commit `c5eb448` is
  pushed, the server checkout is synchronized to `origin/main`, frontend dist
  is deployed, same-origin smoke passed, and server checks passed.
- Phase 4C Report Template Settings Edit is completed and deployed:
  authenticated admins can update existing report template name, description,
  and default/schema JSON settings through REST API and the Russian registry
  UI. No migration was required. Commit `95001a6` is pushed, the server
  checkout is synchronized to `origin/main`, frontend dist is deployed, the
  backend service is restarted, OpenAPI exposes the PATCH route, healthcheck
  passed, and server checks passed.
- Phase 4D CSV Report Output is completed and deployed:
  `csv` is accepted as a report template output format, report runs can store
  and download CSV files through the existing storage abstraction, and the
  Russian report UI can create CSV templates. Commit `b9f25d0` is pushed, the
  server checkout is synchronized to `origin/main`, production PostgreSQL is
  migrated to `0012_report_csv_output` after backup and preflight, frontend
  dist is deployed, OpenAPI exposes report routes, healthcheck passed, and
  server checks passed.
- Phase 4E Report Run List Polish is completed and deployed:
  report runs are listed newest-first and the Russian report UI shows output
  format and filename for generated runs. Commit `98bdeef` is pushed, the
  server checkout is synchronized to `origin/main`, frontend dist is deployed,
  healthcheck passed, and server checks passed. No migration was required.
- Phase 4F Report Archive Visibility is completed and deployed:
  authenticated report template/run lists expose archive toggles in the
  Russian UI, archived report rows are visible in archive scope, archived runs
  remain downloadable through `include_archive=true`, and archived rows cannot
  be edited or archived again. Commit `7a33e25` is pushed, the server checkout
  is synchronized to `origin/main`, frontend dist is deployed, healthcheck
  passed, and server checks passed. No migration was required.
- Phase 4G XLSX Report Output is completed and deployed: `xlsx` is accepted as
  a report template output format, generated XLSX report runs are stored
  through the report storage abstraction, downloaded with the standard XLSX
  content type, and selectable from the Russian report UI. Commit `8aed67b` is
  pushed, the server checkout is synchronized to `origin/main`, production
  PostgreSQL is migrated to `0013_report_xlsx_output` after backup and
  disposable PostgreSQL verification, frontend dist is deployed, healthcheck
  passed, and server checks passed.
- Phase 4H PDF Report Output is completed and deployed: `pdf` is accepted as
  a report template output format, generated PDF report runs are stored through
  the report storage abstraction, downloaded with `application/pdf`, and
  selectable from the Russian report UI. Commit `54d0150` is pushed, the
  server checkout is synchronized to `origin/main`, production PostgreSQL is
  migrated to `0014_report_pdf_output` after backup and disposable PostgreSQL
  verification, frontend dist is deployed, healthcheck passed, and server
  checks passed.
- Phase 4I Report Template Type And Format Edit is completed and deployed:
  active report templates can update `report_type` and `output_format` through
  the existing PATCH API and Russian edit form, with existing validation,
  permission checks, audit, and archive protection. Commit `87c6481` is
  pushed, the server checkout is synchronized to `origin/main`, frontend dist
  is deployed, disposable PostgreSQL-backed API verification passed,
  healthcheck passed, and server checks passed. No migration was required.
- Phase 4J Report Run Parameters And Summary Visibility is completed and
  deployed:
  generated report rows now show run parameters and summary metadata in the
  Russian report UI using existing `parameters_json` and `summary_json` API
  fields. Commit `f66516d` is pushed, the server checkout is synchronized to
  `origin/main`, frontend dist is deployed, healthcheck passed, and server
  checks passed. No backend code, migrations, endpoints, report formats, or
  MCP write tools are included.
- Phase 4K Report Template Parameter Schema UI is completed and deployed: the
  Russian report template create/edit forms now expose existing
  `parameters_schema_json` API support so registry admins can save a template
  parameter schema JSON alongside default parameter JSON. Commit `ed718d1` is
  pushed, the server checkout is synchronized to `origin/main`, frontend dist
  is deployed, healthcheck passed, and server checks passed. No backend code,
  migrations, endpoints, report formats, or MCP write tools are included.
- Phase 4L Report Run Visual Parameter Form is completed and deployed: the Russian
  report run form now renders basic visual controls from existing
  `parameters_schema_json` object properties and syncs changes into the
  existing run parameters JSON payload. Commit `74089ea` is pushed, the server
  checkout is synchronized to `origin/main`, frontend dist is deployed,
  healthcheck passed, and server checks passed. No backend code, migrations,
  endpoints, report formats, full visual report builder, or MCP write tools are
  included.
- Phase 4M Report Run Enum Parameter Controls is completed and deployed:
  scalar enum report parameters now render as visual select controls and sync
  selected values into the existing report run parameters JSON payload. Commit
  `9112f30` is pushed, the server checkout is synchronized to `origin/main`,
  frontend dist is deployed, healthcheck passed, and server checks passed. No
  backend code, migrations, endpoints, report formats, full visual report
  builder, or MCP write tools are included.
- Phase 4N Report Run Enum Option Labels is completed and deployed: report
  run parameter select controls can display Russian option labels from
  `oneOf[].title` while preserving scalar `const` values in the existing run
  parameters JSON payload. Commit `01defa7` is pushed, the server checkout is
  synchronized to `origin/main`, frontend dist is deployed, healthcheck
  passed, and server checks passed. No backend code, migrations, endpoints,
  report formats, full visual report builder, or MCP write tools are included.
- Phase 4O Report Run Default Parameter Payload is completed and deployed:
  report generation now sends the selected template `default_parameters_json`
  when the manual run parameter JSON field is empty, while manual JSON still
  overrides defaults. Commit `c771562` is pushed, the server checkout is
  synchronized to `origin/main`, frontend dist is deployed, healthcheck
  passed, and server checks passed. No backend code, migrations, endpoints,
  report formats, full visual report builder, or MCP write tools are included.
- Phase 4P Report Run Date Parameter Controls is completed and deployed:
  report run parameter controls now render JSON Schema string properties with
  `format: "date"` as date inputs while preserving string values in the
  existing report run parameters JSON payload. Commit `a145e11` is pushed, the
  server checkout is synchronized to `origin/main`, frontend dist is deployed,
  healthcheck passed, and server checks passed. No backend code, migrations,
  endpoints, report formats, full visual report builder, or MCP write tools
  are included.
- Phase 4Q Report Run Parameter Description Hints is completed and deployed:
  report run parameter controls now render JSON Schema property `description`
  values as visible hints while preserving accessible field labels. Commit
  `c9d94fa` is pushed, the server checkout is synchronized to `origin/main`,
  frontend dist is deployed, healthcheck passed, and server checks passed. No
  backend code, migrations, endpoints, report formats, full visual report
  builder, or MCP write tools are included.
- Phase 4R Report Run Schema Default Parameters is completed and deployed:
  report run parameter controls now use valid scalar JSON Schema property
  `default` values when template `default_parameters_json` does not override
  them, and empty manual run JSON sends those defaults in the existing report
  run payload. Commit `1b23ffc` is pushed, the server checkout is synchronized
  to `origin/main`, frontend dist is deployed, healthcheck passed, and server
  checks passed. No backend code, migrations, endpoints, report formats, full
  visual report builder, or MCP write tools are included.
- Phase 4S Report Run Required Parameter Validation is completed and deployed:
  supported flat report run controls now read JSON Schema `required`, block
  generation when required values are empty, and show a Russian validation
  message listing missing parameter labels. Commit `a2a0ea0` is pushed, the
  server checkout is synchronized to `origin/main`, frontend dist is deployed
  with `index-DQlO092U.js`, healthcheck passed, server checks passed, and
  Alembic remains at `0014_report_pdf_output (head)`. No backend code,
  migrations, endpoints, report formats, full visual report builder, or MCP
  write tools are included.
- Phase 4T Report Run Scalar Constraint Validation is completed and deployed:
  supported flat report run controls now read `minLength`, `maxLength`,
  `minimum`, and `maximum`, block generation when provided scalar values fail
  those constraints, and show a Russian validation message listing the failing
  parameter labels. Commit `9dc6e7b` is pushed, the server checkout is
  synchronized to `origin/main`, frontend dist is deployed with
  `index-Dutb14Jc.js`, healthcheck passed, server checks passed, and Alembic
  remains at `0014_report_pdf_output (head)`. No backend code, migrations,
  endpoints, report formats, full visual report builder, or MCP write tools are
  included.
- Phase 4U Report Run Pattern And Multiple Validation is completed and deployed:
  supported flat report run controls now read string `pattern` and numeric
  `multipleOf`, block generation when provided values fail those constraints,
  and show a Russian validation message listing the failing parameter labels.
  Commit `7f4d676` is pushed, the server checkout is synchronized to
  `origin/main`, frontend dist is deployed with `index-VYoHv-du.js`,
  healthcheck passed, server checks passed, and Alembic remains at
  `0014_report_pdf_output (head)`. No backend code, migrations, endpoints,
  report formats, full visual report builder, or MCP write tools are included.
- Phase 4V Report Run Exclusive Bound Validation is completed and deployed:
  supported flat number/integer report run controls now read numeric
  `exclusiveMinimum` and `exclusiveMaximum`, block generation when provided
  values are equal to or cross those exclusive bounds, and show a Russian
  validation message listing the failing parameter labels. Commit `c333ad3` is
  pushed, the server checkout is synchronized to `origin/main`, frontend dist
  is deployed with `index-D6dl-Wmv.js`, healthcheck passed, server checks
  passed, and Alembic remains at `0014_report_pdf_output (head)`. No backend
  code, migrations, endpoints, report formats, full visual report builder, or
  MCP write tools are included.
- Phase 4W Cross-Cutting Bugfix And Stabilization is completed and deployed:
  backend report generation now enforces the supported flat template parameter
  schema subset at the service/API boundary, report template create/update
  rejects invalid supported-schema structures and invalid default parameters,
  and generated report output files are registered for cleanup on transaction
  rollback. Commit `fbe5232` is pushed, the server checkout is synchronized to
  `origin/main`, the backend service is restarted, server checks passed,
  PostgreSQL-backed report API tests passed on disposable `reg_engine_test`,
  healthcheck passed, and Alembic remains at
  `0014_report_pdf_output (head)`. No frontend feature work, report formats,
  MCP write tools, binary export, database schema changes, or Alembic
  migrations are included.
- Later explicit phases remain MCP write tools and additional report polish.
- Binary attachment/document export, additional report polish, and MCP write
  tools remain deferred until their explicit phases.
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

The current authenticated frontend now covers the complete core admin
workspace:

- Phase 2L.0 now provides shared admin mutation API client functions, reusable
  Russian-first form/dialog/confirmation/feedback components, localized error
  mapping, and an E2E smoke path that opens every admin section without console
  errors;
- organizations can be created, edited, and archived through Russian-first UI;
- users can be created, edited, password-reset, and archived through
  Russian-first UI; roles and permissions remain read-only in this phase;
- access grants can be issued and revoked through Russian-first UI with
  explicit organization/registry/descendant scope summary;
- registries can be created, updated, and archived through Russian-first UI;
  registry schema block/field create, update, and archive workflows are exposed
  through Russian-first UI; reference lists and reference items can be created,
  updated, archived, and selected for `select`/`multi_select` schema fields;
- cards can be created, metadata-edited, archived, edited through existing
  per-field controls, edited through atomic bulk save, and managed with
  repeatable block-instance add/archive controls;
- authenticated public-link list/create/disable controls are available on the
  card workspace and expose separate attachment-upload limit semantics;
- Phase 2L.9 added a full browser validation path that creates organization,
  user, access grant, registry, schema, reference list/items, card, field
  values, attachment, generated document, public link, and audit evidence from
  the Russian UI without Swagger/manual API calls.

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
- Phase 2J.0 accepted the `file_ref` dynamic field type ADR without adding backend code, frontend code, API endpoints, or migrations.
- Phase 2J.1 added `field_values.value_attachment_id`, registered the generic
  `file_ref` field type, added migration `0008_file_ref_field_values`, and
  added model/migration smoke coverage. Type registration supports schema
  persistence. Value-setting/read service semantics, transfer behavior, and
  REST API metadata were completed in later Phase 2J slices; frontend UI,
  public-link editing, import/export, PDF, reports, and MCP remain deferred.
- Phase 2J.2 added backend service support for authenticated `file_ref`
  set/read/clear behavior, same-card active attachment validation, archived
  referenced attachment metadata reads, safe audit behavior, and explicit
  public-link edit blocking. Transfer behavior, REST value API metadata,
  frontend UI, and generated document rendering were completed in later Phase
  2J slices; public-link `file_ref` editing, import/export, PDF, reports, and
  MCP remain deferred.
- Phase 2J.3 added transfer behavior for active `file_ref` values by creating
  a new target-card `card_attachments` link that points to the same
  `stored_file_id`; archived `file_ref` references are cleared on transfer and
  recorded in transfer audit metadata.
- Phase 2J.4 added authenticated REST card value API support for `file_ref`.
  Single-field and card-read responses expose safe metadata with attachment id,
  title, original filename, content type, content length, scanner status, and
  archive status.
- Phase 2J.5 added authenticated Russian-first frontend `file_ref` editing.
  The schema builder exposes the generic `file_ref` field type, the card editor
  lists existing card attachments as selectable candidates, supports clear,
  shows empty/archived states, excludes `file_ref` from bulk save, and keeps
  inline upload out of the `file_ref` control. Public-link `file_ref` editing,
  import/export, PDF, reports, and MCP remain deferred.
- Phase 2J.6 added generated document rendering for `file_ref` in
  `docx_text_v1`: active references render as attachment title/original
  filename text, empty values render as empty text, and archived references
  render with an `(архив)` marker. Generated documents still do not embed
  attachment bytes or add download URLs.
- Phase 2J.7 completed live validation on disposable PostgreSQL and temporary
  storage for the full `file_ref` flow: create schema, upload attachment, set
  and read metadata, generate document text, transfer card, verify target-card
  attachment link, verify transfer audit metadata, and clean up test resources.
- Phase 2M added `document_template_versions`, migration
  `0009_document_template_versions`, authenticated binary `.docx` template
  upload, binary version upload/list API, generated-document
  `template_version_id`, and latest-version rendering for `docx_binary_v1`.
  Public document workflows, binary template download, binary `.docx` layout
  conversion to PDF, advanced Word run/content-control templating,
  import/export, reports, and MCP remain deferred.
- Phase 2N added authenticated PDF generation for `docx_text_v1` templates.
  PDFs are rendered directly from schema-driven text placeholders, stored
  through the generated-document storage abstraction, listed/downloaded through
  existing generated-document workflows, exposed in the Russian card document
  UI, and audited with `generated_document_pdf_generate`.

## Phase 2J: `file_ref` Dynamic Field Type

Status: completed.

Purpose: add a generic dynamic field type that references an existing card attachment from the same card, without adding new storage, public-link file-ref editing, PDF conversion, import/export, reports, or MCP.

### Phase 2J.0: Planning And ADR

Status: completed.

Required decisions:

- `file_ref` references `card_attachments.id`, not `stored_files.id`.
- `file_ref` is a single attachment reference in the first implementation; `multi_file_ref` is deferred.
- `file_ref` uses existing attachment upload/list/download flows. It does not upload bytes inline in the first implementation.
- Public-link editing of `file_ref` is deferred.
- Transfer behavior must not copy the old `card_attachment.id` directly into the new card.
- Generated documents render `file_ref` as attachment title/original filename text only.

Acceptance criteria:

- ADR records the decisions above before code starts:
  `docs/ADR/0007-file-ref-dynamic-field.md`.
- PLANS.md states all sub-phases, tests, non-goals, and transfer behavior.
- No backend, frontend, migration, or API implementation starts in Phase 2J.0.

Completion evidence:

- `docs/ADR/0007-file-ref-dynamic-field.md` was added.
- Phase 2J transfer behavior is fixed: active referenced attachments are copied
  as new target-card `card_attachments` rows pointing at the same stored file;
  archived referenced attachments are cleared on the target with audit metadata.
- Phase 2J generated document behavior is fixed: render title/original filename
  text only; do not embed files or links.
- No backend, frontend, migration, API, PDF, import/export, reports, MCP, or
  business-specific document-field implementation was added in Phase 2J.0.
- Verification on 2026-06-30: `git diff --check`,
  `scripts/format.ps1 -Check`, and `scripts/check.ps1 -SkipRemote` passed.

### Phase 2J.1: Database And Model Foundation

Status: completed.

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

Completion evidence:

- Added migration `0008_file_ref_field_values`.
- Added nullable `field_values.value_attachment_id` referencing
  `card_attachments.id`.
- Added index `ix_field_values_field_attachment`.
- Added `file_ref` to the generic dynamic field type check.
- Added model/migration smoke tests for column, FK, index, and allowed type.
- Type registration now supports schema persistence, but no `file_ref`
  value-setting/read service semantics, REST value API metadata behavior,
  frontend UI, public-link `file_ref` editing, import/export, PDF, reports, MCP,
  or HR-specific document model was added in Phase 2J.1.
- Verification on 2026-06-30: targeted model/migration tests passed; local
  `scripts/check.ps1 -SkipRemote` passed; disposable PostgreSQL `*_test` smoke
  passed; production migration moved from `0007_public_link_limits` to
  `0008_file_ref_field_values` after backup/preflight/post-checks; backend
  service restart and `scripts/server-check.ps1` passed.

### Phase 2J.2: Backend Service Support

Status: completed.

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
- Public-link `file_ref` edits are denied without consuming public-link field
  edit usage.

Completion evidence:

- `CardService` stores `file_ref` in `field_values.value_attachment_id`.
- `CardService` returns safe `FileRefValueRead` metadata with attachment id,
  title, original filename, content type, content length, scanner status, and
  `archived_at`.
- Service validation rejects wrong-card attachment ids and archived attachment
  ids for new values.
- Clearing with `null` removes the `file_ref` value.
- Archived referenced attachment metadata remains readable.
- `PublicLinkService` denies public-link `file_ref` edits.
- Service tests cover set/read/clear, wrong-card rejection, archived-attachment
  rejection, archived-reference read behavior, public-link denial, and audit
  safety without storage keys, checksums, stored file ids, or filesystem paths.
- No REST value API metadata, frontend UI, generated document rendering,
  transfer behavior, import/export, PDF, reports, MCP, or business-specific
  document-field implementation was added in Phase 2J.2.

### Phase 2J.3: Transfer Behavior

Status: completed.

Required behavior:

- When a card transfer copies dynamic values, `file_ref` must not point from the new card to the old card's `card_attachment.id`.
- Preferred behavior: create a new `card_attachment` row for the target card pointing to the same `stored_file_id`, copy title/description/position as appropriate, and point the new field value to the new `card_attachment.id`.
- If the referenced old attachment is archived at transfer time, either preserve a read-only archived reference according to explicit rules or clear it with a documented audit entry. Preferred behavior is to copy only active attachment links.

Acceptance criteria:

- Transfer tests prove the new card has its own `card_attachment` link.
- New card `file_ref` points to the new attachment link, not the old one.
- Old and new attachment links may share the same `stored_file_id`; binary bytes are not duplicated.
- Archived referenced attachments are cleared on the new card and recorded in
  transfer audit metadata.

Completion evidence:

- `CardService.transfer_card_for_actor` creates new target-card
  `card_attachments` rows for active `file_ref` values.
- Copied target attachment links reuse the same `stored_file_id` and copy
  title, description, and position; binary bytes are not duplicated.
- New card `field_values.value_attachment_id` points to the new target-card
  attachment link, not the old source-card attachment link.
- Archived or invalid source attachment references are cleared on the target
  value and listed in `cleared_file_ref_attachment_ids` on the transfer audit
  event.
- Transfer tests cover active copy, target-link independence, shared stored
  file metadata, archived-reference clearing, and audit metadata.
- No REST value API metadata, frontend UI, generated document rendering,
  import/export, PDF, reports, MCP, or business-specific document-field
  implementation was added in Phase 2J.3.

### Phase 2J.4: API Support

Status: completed.

Required work:

- Existing card field update endpoint accepts `file_ref` values as `card_attachment.id` or `null`.
- Card read returns `file_ref` as metadata, not only a raw UUID.
- Metadata should include: `attachment_id`, `title`, `original_filename`, `content_type`, `content_length_bytes`, `scanner_status`, and `archived_at`.
- Existing attachment list endpoint remains the source of selectable file candidates.

Acceptance criteria:

- API tests cover set, clear, read metadata, wrong-card rejection, and archived-reference read behavior.
- API responses do not expose storage key, filesystem path, or storage root.

Completion evidence:

- `PATCH /api/v1/cards/{card_id}/fields/{field_id}` accepts a
  same-card `card_attachment.id` UUID for `file_ref` and accepts `null` to
  clear the value.
- `GET /api/v1/cards/{card_id}` returns `file_ref` values as safe attachment
  metadata in both flat `fields` and nested `blocks -> instances -> fields`
  structures.
- Returned metadata is limited to `attachment_id`, `title`,
  `original_filename`, `content_type`, `content_length_bytes`,
  `scanner_status`, and `archived_at`.
- API tests cover set, clear, card read metadata, wrong-card rejection,
  archived-reference metadata reads, archived-reference set rejection, and
  absence of storage keys, filesystem paths, checksums, and stored-file ids.
- No frontend UI, public-link `file_ref` editing, generated document
  rendering, import/export, PDF, reports, MCP, migration, or business-specific
  document-field behavior was added.

### Phase 2J.5: Frontend Authenticated Editor

Status: completed.

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

Completion evidence:

- The authenticated card editor renders `file_ref` as a Russian-first file
  selector backed by existing active card attachments.
- The editor allows selecting an attachment, clearing the selected file, and
  saving `card_attachment.id`/`null` through the existing field-value API.
- Empty states show `Нет вложений` and
  `Сначала загрузите файл во Вложения`.
- Archived referenced values remain visible with `Файл архивирован` while
  active candidates still come from the attachment list endpoint.
- `file_ref` is excluded from bulk field save to avoid accidental clearing.
- The schema builder exposes the generic `file_ref` field type.
- Unit tests cover list/select/save/clear/empty/archived states; Playwright
  smoke covers schema creation, upload, select, and save.
- No inline upload inside the `file_ref` control, public-link `file_ref`
  editing, generated document rendering, import/export, PDF, reports, MCP,
  backend migration, or business-specific document field was added.

### Phase 2J.6: Generated Document Rendering

Status: completed.

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

Completion evidence:

- `DocumentService` formats `FileRefValueRead` as safe text for
  `docx_text_v1` placeholders.
- Active references render as attachment title plus original filename when
  they differ.
- Empty `file_ref` values render as empty text.
- Archived referenced attachments render with an `(архив)` marker.
- Generated documents do not embed referenced attachment bytes and do not add
  attachment download URLs.
- Tests cover active, empty, archived, no dataclass/UUID leakage, and no
  download-link output.
- No database migration, API endpoint, frontend change, public-link
  `file_ref` editing, PDF conversion, import/export, reports, MCP, or
  business-specific document field was added.

### Phase 2J.7: Live Validation

Status: completed.

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

Completion evidence:

- Server validation used disposable database `reg_engine_2j7_file_ref_test`
  and temporary storage `/tmp/reg_engine_2j7_file_ref_storage`.
- Alembic upgraded the disposable database through
  `0008_file_ref_field_values`.
- Validation created a registry schema with a `file_ref` field, uploaded an
  attachment to a card, set `file_ref`, and read safe metadata.
- Generated `.docx` content rendered `File: Validation scan (validation.pdf)`
  without leaking attachment ids, dataclass output, or attachment API links.
- Transfer created a new target-card `card_attachments` link pointing to the
  same stored file and recorded `copied_file_ref_attachments` in audit
  metadata.
- Disposable database and temporary storage were removed after validation.

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

Status: completed for the approved read-only MCP gateway slice.

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

Status: completed.

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

Completion evidence:

- Added Russian-first create organization form with code, name, parent
  organization, and type fields.
- Added edit organization form for metadata supported by the backend API.
- Added archive organization confirmation using the shared Phase 2L.0
  mutation dialog/confirmation components.
- Organization mutations invalidate organization and audit query data after
  success.
- Added frontend test coverage for create, validation error without POST,
  edit, archive confirmation, and archive success.
- Verified `pnpm -C frontend test:run`, `pnpm -C frontend lint`, and
  `pnpm -C frontend typecheck`.
- No backend code, migrations, hardcoded employee fields, import/export, PDF
  conversion, reports, or MCP work was added.

### Phase 2L.2: User Management UI

Status: completed.

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

Completion evidence:

- Added Russian-first user create form with email, display name, password,
  status, and superuser flag.
- Added user profile edit form for email, display name, status, and superuser
  flag.
- Added admin password reset workflow that sends password only in the password
  update request and clears the field after success.
- Added user archive confirmation through the shared Phase 2L.0 confirmation
  component.
- Built-in/system display names continue to render through localized
  `userDisplayNameLabel`.
- Added frontend tests for required-field validation, create, edit, password
  reset, archive, password non-display after submit, request payload shape, and
  backend-denied localized error handling.
- Verified `pnpm -C frontend exec vitest run src/App.test.tsx`,
  `pnpm -C frontend test:run`, `pnpm -C frontend lint`, and
  `pnpm -C frontend typecheck`.
- Verified `powershell -ExecutionPolicy Bypass -File scripts/format.ps1 -Check`,
  `powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote`, and
  `pnpm -C frontend e2e`.
- No backend code, migrations, hardcoded employee fields, import/export, PDF
  conversion, reports, or MCP work was added.

### Phase 2L.3: Access Grant Management UI

Status: completed.

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

Completion evidence:

- Added Russian-first access grant create form with user, role, optional
  organization, optional registry, include-descendants toggle, and validity
  dates.
- Added an explicit Russian scope summary before save so global,
  organization-scoped, descendant, and registry-scoped grants are not ambiguous.
- Added access grant revoke confirmation and success/error feedback using the
  shared Phase 2L.0 mutation patterns.
- Access-grant mutations invalidate access-grant and audit query data after
  success.
- Added frontend tests for required-field validation, global grant, descendant
  organization grant, registry-scoped grant, revoke flow, request payloads, and
  backend-denied localized error handling.
- Verified `pnpm -C frontend exec vitest run src/App.test.tsx`,
  `pnpm -C frontend test:run`, `pnpm -C frontend lint`, and
  `pnpm -C frontend typecheck`.
- Verified `powershell -ExecutionPolicy Bypass -File scripts/format.ps1 -Check`,
  `powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote`, and
  `pnpm -C frontend e2e`.
- No backend code, migrations, hardcoded employee fields, import/export, PDF
  conversion, reports, or MCP work was added.

### Phase 2L.4: Registry Management UI

Status: completed.

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

Completion evidence:

- Added Russian-first registry create/edit/archive controls to the authenticated
  registry workspace.
- Registry mutations use existing Phase 2K API support and invalidate registry,
  schema, card, and audit query data after successful changes.
- Registry lifecycle/status values are surfaced through existing Russian status
  labels.
- Added frontend tests for required-field validation, create, update, archive,
  backend-denied localized error handling, and request payloads without
  hardcoded employee/HR fields.
- Verified `pnpm -C frontend exec vitest run src/App.test.tsx`,
  `pnpm -C frontend test:run`, `pnpm -C frontend lint`, and
  `pnpm -C frontend typecheck`.
- Verified `powershell -ExecutionPolicy Bypass -File scripts/format.ps1 -Check`,
  `powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote`, and
  `pnpm -C frontend e2e`.
- No backend code, migrations, hardcoded employee fields, import/export, PDF
  conversion, reports, or MCP work was added.

### Phase 2L.5: Schema Builder UI

Status: completed.

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

Completion evidence:

- Added Russian-first schema builder controls for form block create, metadata
  update, and archive.
- Added Russian-first schema builder controls for form field create, metadata
  update, active/inactive update, and archive.
- Field creation exposes all dynamic field types currently supported by the
  backend Core Schema v1 contract, excluding deferred `file_ref`.
- Block creation supports repeatable flag, public visibility/editability flags,
  and position/order input where the current API supports them.
- Field creation supports public visibility/editability flags, optional
  reference-list ID wiring, dynamic field type, and position/order input where
  the current API supports them.
- Locked/system blocks and fields remain protected by backend services; the
  frontend reflects backend-denied locked/system operations through localized
  Russian error text instead of raw service errors.
- Added frontend tests for block create/update/archive, field
  create/update/archive, dynamic field type payloads, no hardcoded employee/HR
  fields, and locked-field denial handling.
- Verified `pnpm -C frontend test:run`, `pnpm -C frontend lint`,
  `pnpm -C frontend typecheck`, and
  `powershell -ExecutionPolicy Bypass -File scripts/format.ps1 -Check`.
- Verified `pnpm -C frontend e2e` and
  `powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote`.
- No backend code, migrations, hardcoded employee fields, import/export, PDF
  conversion, reports, MCP, or `file_ref` implementation was added.

Known limitations:

- `required_mode`, `is_locked`, and `is_system` exist in backend
  model/service behavior but are not exposed in the current
  `FormBlockRead`/`FormFieldRead` API schemas. Phase 2L.5 therefore does not
  add proactive required-mode controls or lock/system badges; backend denial is
  still the security boundary.
- `file_ref` remains deferred until Phase 2J, so schema builder does not expose
  file-backed dynamic fields yet.

### Phase 2L.6: Reference List Management UI

Status: completed.

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

Completion evidence:

- Added Russian-first reference-list create, update, and archive controls in
  the registry admin workspace.
- Added Russian-first reference-item create, update, and archive controls for
  the selected reference list.
- Reference-list creation exposes owner organization, inheritance to
  descendants, locked-for-descendants, and system-managed flags supported by the
  current backend API.
- Reference-list table surfaces owner organization, inheritance, locked state,
  and active/archive status; backend-denied locked/inherited operations are
  mapped to localized Russian error text.
- Schema field creation now uses a reference-list selector for
  `select`/`multi_select` fields instead of a raw reference-list UUID input.
- Added frontend tests for reference-list/item create-update-archive,
  select-field reference-list wiring without hardcoded options, and locked
  reference-list denial localization.
- Verified `pnpm -C frontend exec vitest run src/App.test.tsx -t
  "reference lists|select fields|locked reference"`,
  `pnpm -C frontend test:run`, `pnpm -C frontend lint`, and
  `pnpm -C frontend typecheck`.
- No backend code, migrations, hardcoded employee fields, import/export, PDF
  conversion, reports, MCP, or `file_ref` implementation was added.

### Phase 2L.7: Card Create, Metadata, And Editor UI

Status: completed.

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

Completion evidence:

- Added Russian-first card create form with registry, organization, optional
  org unit, display name, and public view/edit flags.
- Added card metadata panel with edit and archive controls.
- Added repeatable block-instance add/archive controls using the Phase 2K API.
- Added atomic bulk field-values save workflow while preserving the existing
  per-field editor as a fallback path.
- Added frontend test coverage for create, metadata update, repeatable
  instance add/archive, bulk save payloads, card archive, and no hardcoded
  employee/HR payload fields.
- Verified `pnpm -C frontend exec vitest run src/App.test.tsx -t
  "creates updates archives cards"`, `pnpm -C frontend test:run`,
  `pnpm -C frontend lint`, `pnpm -C frontend typecheck`, and
  `pnpm -C frontend exec playwright test tests/e2e/smoke.spec.ts
  --project=chromium`.
- Verified `powershell -ExecutionPolicy Bypass -File scripts/check.ps1
  -SkipRemote`.

### Phase 2L.8: Public Link Admin Controls UI

Status: completed.

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

Completion evidence:

- Added Russian-first authenticated public-link panel to the card workspace.
- Public-link list shows active, disabled, expired, field-edit usage, and
  attachment-upload usage as separate concepts.
- Create form exposes `expires_in_days` and `max_attachment_uploads`; blank
  upload limit maps to unlimited uploads and does not overload `used_count`.
- Created public-link raw token and relative public edit URL are shown only
  after a successful create response.
- Disable flow uses explicit confirmation and the existing authenticated
  public-link archive endpoint.
- Added frontend unit coverage for list/create/disable, disabled status,
  expired status, exhausted upload limit, separate usage counters, and create
  payload shape without `max_uses`/`used_count`.
- Existing public-link frontend test continues to cover no-file validation with
  `Выберите файл`.
- Updated Playwright smoke to cover the authenticated public-link panel.
- Verified `pnpm -C frontend exec vitest run src/App.test.tsx -t
  "public links from authenticated"`, `pnpm -C frontend test:run`,
  `pnpm -C frontend lint`, `pnpm -C frontend typecheck`,
  `pnpm -C frontend e2e`, and
  `powershell -ExecutionPolicy Bypass -File scripts/format.ps1 -Check`.
- Verified `powershell -ExecutionPolicy Bypass -File scripts/check.ps1
  -SkipRemote`.
- No backend code, migrations, generated-document public workflows, `file_ref`,
  PDF conversion, import/export, reports, or MCP work was added.

### Phase 2L.9: Admin UI Live Validation

Status: completed.

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

Completion evidence:

- Added Playwright browser coverage for the full Russian admin setup path using
  disposable mock API state:
  organization create, user create, access grant issue, registry create, schema
  block/field create, reference-list/item create, card create, bulk field-value
  save, attachment upload, generated-document generation, public-link create,
  and audit verification.
- The Phase 2L.9 scenario asserts first-screen rendering, page title, Russian
  admin shell visibility, no unhandled API routes, and no browser console/page
  errors.
- Verified targeted e2e with `pnpm -C frontend exec playwright test
  tests/e2e/smoke.spec.ts --project=chromium -g "complete admin setup"`.
- No backend code, migrations, production data changes, import/export,
  `file_ref`, PDF conversion, reports, MCP, or business-specific HR UI was
  added.

## Planned Phases After Core Admin UI

These require explicit approval after Phase 2K/2L unless the user explicitly
reprioritizes them.

### Phase 2M: Binary `.docx` Template Upload And Template Versioning

Status: completed.

Purpose: move from JSON `docx_text_v1` template bodies toward managed binary template assets and version history.

Planned scope:

- Upload binary `.docx` templates through authenticated API.
- Store template files through storage abstraction.
- Add template versions.
- Keep templates schema-driven and avoid real personal data in Git/tests.
- Keep PDF conversion deferred.

Completion evidence:

- Added migration `0009_document_template_versions`.
- Added `document_template_versions` with version number, template format,
  text body or stored binary file reference, safe binary metadata, archive
  fields, and uniqueness/index/check constraints.
- Existing text templates are backfilled as version `1`.
- Added `generated_documents.template_version_id`.
- Added `docx_binary_v1` template format support.
- Added authenticated multipart API:
  `POST /api/v1/registries/{registry_id}/document-templates/upload`,
  `GET /api/v1/document-templates/{template_id}/versions`, and
  `POST /api/v1/document-templates/{template_id}/versions/upload`.
- Binary template files are stored through the storage abstraction under the
  `document_templates` prefix and are not stored in Git.
- Generation uses the latest active template version and records the
  `template_version_id`.
- Version read responses expose safe metadata and omit storage keys, checksums,
  and stored-file ids.
- Tests cover metadata/migration constraints, binary upload, version upload,
  latest-version generation, invalid upload rejection, safe version response
  shape, and audit events.
- Production PostgreSQL was migrated from `0008_file_ref_field_values` to
  `0009_document_template_versions` after a fresh server-side backup outside
  Git, preflight checks, disposable PostgreSQL verification, and post-checks.
  Post-checks verified Alembic current `0009_document_template_versions`,
  `document_template_versions`, `generated_documents.template_version_id`,
  nullable `document_templates.template_body`, key constraints, and indexes.
  The backend service was restarted and `scripts/server-check.ps1` passed.

Known limitations:

- No browser UI for binary template upload in this slice.
- Binary template download is not exposed.
- The first `docx_binary_v1` renderer replaces placeholders in `.docx` XML
  parts when placeholders are contiguous text; advanced Word run merging,
  content controls, tables/repeated sections, and conditional blocks are
  deferred.
- Binary `.docx` layout conversion to PDF, public generated-document
  workflows, import/export, reports, and MCP remain deferred.

### Phase 2N: PDF Conversion

Status: completed.

Purpose: add PDF generation after generated-document and template boundaries are stable.

Completed scope:

- Accepted ADR `docs/ADR/0009-pdf-conversion.md`.
- Chose a direct backend PDF renderer for `docx_text_v1` templates.
- Added authenticated API:
  `POST /api/v1/cards/{card_id}/generated-documents/pdf`.
- Stored generated PDFs through the existing generated-document storage
  abstraction and `generated_documents` metadata.
- Kept the same `cards.manage` generation permission and generated-document
  read/download/archive rules.
- Added Russian-first card document UI control `Сформировать PDF`.
- Added tests for Cyrillic PDF rendering, service-level PDF generation, API
  PDF generation/download, binary-template rejection, and frontend UI flow.
- Verified PostgreSQL-backed PDF service/API tests on disposable
  `*_test` database.
- Deployed commit `74b90ae` to the configured server checkout; no production
  migration was required because Phase 2N adds no schema changes. Frontend
  dist was deployed, backend service was restarted, same-origin frontend/API
  smoke passed, `scripts/server-check.ps1` passed, and production Alembic
  remained at `0009_document_template_versions` head.

Known limitations:

- Binary `.docx` layout-faithful conversion to PDF is not implemented.
- Public-link PDF generation/download is not exposed.
- Advanced Word layout, headers/footers, tables, images, content controls, and
  repeated sections remain deferred to a future converter boundary.

### Phase 3: Import And Export

Purpose: add controlled data exchange.

Status: completed for the JSON/CSV/XLSX backend and frontend slices.

Approved/current scope:

- CSV import with mapping, preview, validation, commit, and audit.
- JSON/CSV export with permission checks.
- Export of attachment/document metadata only first; binary export requires separate approval.
- XLSX import/export is limited to Phase 3E format support over the same
  row-oriented contract. Binary attachment/document import/export remains a
  separate later phase.

Decisions:

- Export uses the same backend organization-scope card visibility as card
  list/read.
- JSON export preserves schema-driven `blocks -> instances -> fields`.
- CSV export is field-row based and must include `block_code`,
  `block_instance_ordinal`, and `field_code` to avoid ambiguity when different
  blocks reuse the same field code.
- Attachment and generated-document exports include metadata only in the first
  slice. Binary bytes, storage keys, checksums, stored file ids, and filesystem
  paths are not exported.
- Export actions write `audit_events` with `action=export`.
- Import preview and import commit must validate against existing registry
  schema instead of creating hardcoded business fields.
- Import commit uses the preview contract as its validation gate: any invalid
  row rejects the whole batch before mutation.
- CSV import matching rules are explicit: rows with `card_id` update that
  editable card; rows without `card_id` create cards, and create rows sharing
  the same optional `import_key` are grouped into one new card.
- Successful import commits write `audit_events` with `action=import_commit`.

### Phase 3A: Card Export Foundation

Status: completed.

Purpose: provide a safe backend export foundation before import workflows and
XLSX support.

Completed scope:

- Added authenticated API:
  `GET /api/v1/registries/{registry_id}/exports/cards?format=json|csv`.
- JSON export includes registry id, format version, visible cards, card
  metadata, schema-driven blocks/instances/fields, attachment metadata, and
  generated-document metadata.
- CSV export emits one row per card field with explicit card, block, instance,
  field, field type, and serialized value columns.
- Export uses `CardService.list_visible_cards` and
  `CardService.read_card_for_actor` so organization scope, descendant scope,
  archive filtering, and backend permission behavior remain centralized.
- Export writes `audit_events` with `action=export`,
  `object_type=registry`, format, export type, and exported card count.
- Added PostgreSQL-backed API regression tests for scoped JSON export,
  duplicate field-code CSV export, attachment/document metadata-only output,
  and audit recording.
- Verification on 2026-06-30: RED failed with 404 before implementation on
  disposable `reg_engine_phase3a_test`; GREEN passed with `2 passed` after
  implementation on the same disposable PostgreSQL strategy; targeted mypy and
  ruff passed; `scripts/check.ps1 -SkipRemote` passed with backend pytest
  `61 passed, 124 skipped`, frontend unit tests `29 passed`, frontend build,
  and project tree check; `pnpm -C frontend e2e` passed with `3 passed`.
- Deployed commit `a8c1027` to the configured server checkout. No production
  migration was required because Phase 3A adds no schema changes. Backend
  service was restarted, healthcheck passed, live OpenAPI exposed
  `/api/v1/registries/{registry_id}/exports/cards`, `scripts/server-check.ps1`
  passed, and production Alembic remained at
  `0009_document_template_versions` head.

Known limitations:

- No XLSX export in this slice.
- No import preview or import commit in this slice.
- No frontend export UI in this slice.
- CSV export is field-row based; it is intended for technical exchange and
  mapping, not a polished report.
- Reference values are exported as stored ids in Phase 3A; label enrichment is
  deferred to later import/export polish.
- Binary attachment and generated-document bytes are not exported.

### Phase 3B: Import Preview And Mapping

Status: completed.

Purpose: add safe import preview before any data mutation.

Planned scope:

- CSV import preview first, XLSX preview later if dependency and UX boundaries
  are accepted.
- Registry field mapping by `block_code.field_code`.
- Validate organization/card visibility and editable scope.
- Validate dynamic values through the same service rules as manual card edits.
- Return row-level validation errors without mutating cards.
- Do not upload binary attachments/documents through import in this phase.

Completed scope:

- Added authenticated API:
  `POST /api/v1/registries/{registry_id}/imports/cards/preview`.
- Preview accepts CSV content with required columns `card_id`,
  `organization_id`, `display_name`, `block_code`, `field_code`, and `value`.
- Rows with `card_id` are previewed as updates; rows without `card_id` are
  previewed as new-card rows requiring `organization_id` and `display_name`.
- Field mapping uses `block_code.field_code` against the active registry
  schema.
- Preview validates editable card scope, create organization scope, and typed
  dynamic field values through `CardService.validate_field_value_for_actor`.
- Preview returns row-level status, action, parsed values, and validation
  errors.
- Preview does not create cards, update field values, upload binaries, attach
  documents, or write audit events.
- Added PostgreSQL-backed API regression tests for valid update/create preview,
  invalid numeric values, inaccessible sibling branch update/create, invalid
  reference-list item, unknown field mapping, required CSV columns, and no
  mutation of `cards`, `field_values`, or `audit_events`.
- Verification on 2026-06-30: RED failed with `405 Method Not Allowed` before
  implementation on disposable `reg_engine_phase3b_test`; GREEN passed with
  `4 passed` after implementation on the same disposable PostgreSQL strategy;
  `scripts/check.ps1 -SkipRemote` passed with backend pytest `61 passed,
  126 skipped`, frontend unit tests `29 passed`, frontend build, and project
  tree check; `pnpm -C frontend e2e` passed with `3 passed`.
- Deployed commit `7a7ffee` to the configured server checkout. No production
  migration was required because Phase 3B adds no schema changes. Backend
  service was restarted, healthcheck passed, live OpenAPI exposed
  `/api/v1/registries/{registry_id}/imports/cards/preview`,
  `scripts/server-check.ps1` passed, and production Alembic remained at
  `0009_document_template_versions` head.

Known limitations:

- No import commit in this slice.
- No XLSX preview in this slice.
- No frontend import UI in this slice.
- No binary attachment/document import in this slice.
- Preview is row-oriented; grouping multiple rows into one future card is
  deferred to Phase 3C matching/commit rules.
- Reference labels are not resolved in preview responses yet; values use stored
  ids.

### Phase 3C: Import Commit And Export Polish

Status: completed.

Completed scope:

- Added authenticated API:
  `POST /api/v1/registries/{registry_id}/imports/cards/commit`.
- Commit accepts the Phase 3B CSV columns plus optional `import_key`.
- Rows with `card_id` update an existing editable card.
- Rows without `card_id` create a new card; multiple create rows with the same
  `import_key` are grouped into one card and must share the same
  `organization_id` and `display_name`.
- Commit reuses preview validation before mutating data. If any row is invalid,
  the API returns the preview payload in `detail` with row-level errors and
  does not create cards, update field values, or write import audit events.
- Valid commits run inside a nested transaction, create/update schema-driven
  card values through `CardService`, and write one registry-level
  `audit_events` row with `action=import_commit`.
- Added PostgreSQL-backed API regression tests for successful create/update
  import commit, import audit, `import_key` grouping, invalid-batch rejection,
  and no partial writes on validation failure.
- Verification on 2026-06-30: RED failed with `405 Method Not Allowed` before
  implementation on disposable `reg_engine_phase3c_test`; GREEN passed with
  `2 passed` for the new commit tests and `6 passed` for the full
  `test_api_phase_3_import_export.py` suite on the same disposable PostgreSQL
  strategy; `scripts/check.ps1 -SkipRemote` passed with backend pytest
  `61 passed, 128 skipped`, frontend unit tests `29 passed`, frontend build,
  and project tree check; `pnpm -C frontend e2e` passed with `3 passed`.
- Deployed commit `eb790b65` to the configured server checkout. No production
  migration was required because Phase 3C adds no schema changes. Backend
  service was restarted, healthcheck passed, live OpenAPI exposed
  `/api/v1/registries/{registry_id}/imports/cards/commit`,
  `scripts/server-check.ps1` passed, and production Alembic remained at
  `0009_document_template_versions` head.

Known limitations:

- No XLSX import/export in this slice.
- No frontend import/export UI in this slice.
- No binary attachment/document import/export.
- Reference values are still accepted/exported as stored ids; label enrichment
  remains deferred.
- No production migration was required because Phase 3C adds no schema changes.

### Phase 3D: Import Export Frontend UI

Status: completed.

Purpose: expose the existing authenticated Phase 3 CSV/JSON import/export API
in the Russian registry workspace without adding backend behavior, migrations,
XLSX workflows, binary attachment/document import/export, or MCP write tools.

Scope:

- Add a Russian-first `Импорт и экспорт` panel to the authenticated registry
  workspace.
- Allow authenticated users to download card exports as `JSON` or `CSV` through
  `GET /api/v1/registries/{registry_id}/exports/cards?format=json|csv`.
- Allow users to paste CSV import content, run preview through
  `POST /api/v1/registries/{registry_id}/imports/cards/preview`, and inspect
  summary plus row-level valid/invalid results.
- Allow commit only after the latest preview has zero invalid rows and the CSV
  content has not changed since preview.
- Send commit through
  `POST /api/v1/registries/{registry_id}/imports/cards/commit`, display the
  commit summary, and refresh card/audit data after successful commit.
- Keep all security and validation in the existing backend API.
- Do not add backend code, database schema changes, migrations, XLSX workflows,
  binary attachment/document import/export, report changes, public-link flows,
  or MCP write tools.

Acceptance criteria:

- Export buttons call the existing API with bearer auth and download the
  returned JSON/CSV payload.
- Preview sends the textarea CSV content to the existing preview endpoint and
  renders Russian summary text.
- Invalid preview rows keep commit disabled and show row errors.
- Valid preview rows enable commit only while the CSV content remains unchanged.
- Commit sends the same CSV content to the existing commit endpoint, displays a
  Russian summary, and invalidates card/audit queries.
- Frontend tests cover export, preview, invalid preview blocking, commit
  payloads, and Russian UI labels.
- README, PLANS, and project tree are updated or checked.

Known limitations:

- CSV is pasted into a text area in this slice; file upload can be later UI
  polish.
- XLSX import/export is handled by Phase 3E.
- Binary attachment/document import/export remains deferred.
- Reference label enrichment remains deferred.
- No backend changes and no MCP write tools.

Verification:

- RED frontend test failed before implementation because the registry workspace
  had no `Импорт и экспорт` panel.
- GREEN targeted frontend test passed:
  `npm test -- --run src/App.test.tsx --testNamePattern "exports and imports cards"`.
- Targeted frontend API/client regression test passed:
  `npm test -- --run src/api/adminMutations.test.ts`.
- Full local project check passed:
  `powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote`.
- Format check passed:
  `powershell -ExecutionPolicy Bypass -File scripts/format.ps1 -Check`.
- Frontend Playwright E2E passed:
  `pnpm -C frontend e2e`.

Production migration checkpoint:

- Not required for Phase 3D.

Deployment checkpoint:

- Commit `fe8163c` (`Add CSV import export UI`) is pushed to `origin/main`.
- Server checkout was synchronized to implementation commit `fe8163c` for the
  frontend deployment.
- `powershell -ExecutionPolicy Bypass -File scripts/deploy-frontend.ps1`
  rebuilt and deployed frontend dist; same-origin smoke returned
  `/assets/index-Bfr1WPpC.js`.
- `powershell -ExecutionPolicy Bypass -File scripts/server-check.ps1` passed:
  server checkout clean, PostgreSQL reachable on localhost/LAN, database access
  works for runtime checks, and attachment storage is configured.
- Server healthcheck passed:
  `curl -fsS http://127.0.0.1:8000/api/v1/health` returned
  `{"status":"ok","service":"reg_engine"}`.
- Production Alembic status was checked and remains
  `0012_report_csv_output (head)`; no Phase 3D migration was required.

### Phase 3E: XLSX Import Export Format Support

Status: completed.

Purpose: add XLSX as an additional authenticated card import/export transport
while preserving the existing schema-driven CSV row contract, backend
permission checks, preview/commit validation, and audit semantics.

Scope:

- Add `xlsx` to authenticated card export:
  `GET /api/v1/registries/{registry_id}/exports/cards?format=xlsx`.
- Export one worksheet using the same row-oriented columns as CSV:
  `card_id`, `display_name`, `organization_id`, `org_unit_id`,
  `lifecycle_status`, `block_code`, `block_instance_ordinal`, `field_code`,
  `field_type`, and `value`.
- Add XLSX import preview and commit request payload support without changing
  the existing CSV payload contract.
- Convert XLSX rows into the existing import row contract, then reuse the same
  preview validation and commit path as CSV.
- Record export and import audit metadata with `format=xlsx`.
- Add Russian-first frontend controls for downloading XLSX, loading XLSX file
  content for preview, and committing a valid XLSX preview.
- Use a maintained XLSX library dependency instead of hand-rolled XLSX parsing.
- Do not add database schema changes, Alembic migrations, binary
  attachment/document import/export, report output changes, public-link
  import/export workflows, or MCP write tools.

Acceptance criteria:

- XLSX export returns a valid workbook with the same technical columns and
  scoped rows as CSV export.
- XLSX preview returns the same response shape as CSV preview and does not
  mutate cards, field values, files, or audit.
- XLSX commit reuses preview validation, rejects invalid batches atomically,
  writes schema-driven card values, and records import audit with
  `format=xlsx`.
- CSV export/preview/commit behavior remains unchanged.
- Frontend tests cover Russian XLSX export/import controls, file-required
  validation, preview, invalid preview blocking, and commit payloads.
- README, PLANS, and project tree are updated or checked.

Known limitations:

- XLSX support is row-oriented technical exchange, not a polished business
  spreadsheet template.
- XLSX import/export still uses stored ids for reference values; label
  enrichment remains deferred.
- Binary attachment/document bytes are not imported or exported.
- No report XLSX output, public-link XLSX workflow, or MCP write tools.

Verification:

- RED backend XLSX tests failed before implementation on disposable
  PostgreSQL database `reg_engine_phase3e_test`: `format=xlsx` was rejected by
  the export query validator and multipart XLSX import was not accepted by the
  existing JSON-only import endpoints.
- GREEN backend XLSX targeted tests passed on disposable PostgreSQL database
  `reg_engine_phase3e_test`:
  `backend\.venv\Scripts\python.exe -m pytest backend\tests\test_api_phase_3_import_export.py -k "xlsx" -q`.
- Full Phase 3 import/export API suite passed on disposable PostgreSQL
  database `reg_engine_phase3e_test`:
  `backend\.venv\Scripts\python.exe -m pytest backend\tests\test_api_phase_3_import_export.py -q`
  with `9 passed`.
- RED frontend test failed before implementation because the authenticated
  registry workspace had no `Скачать XLSX` control.
- GREEN targeted frontend test passed:
  `npm test -- --run src/App.test.tsx --testNamePattern "exports and imports cards"`.
- Targeted backend ruff check, ruff format check, and mypy passed.
- Full local project check passed:
  `powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote`
  with backend pytest `77 passed, 136 skipped`, frontend unit tests
  `31 passed`, frontend build, and project tree check.
- Format check passed:
  `powershell -ExecutionPolicy Bypass -File scripts/format.ps1 -Check`.
- Frontend Playwright E2E passed:
  `pnpm -C frontend e2e` with `3 passed`.

Production migration checkpoint:

- Not required for Phase 3E.

Deployment checkpoint:

- Commit `6c7880a` (`Add XLSX card import export`) is pushed to `origin/main`.
- Server checkout is synchronized to `origin/main` at `HEAD=6c7880a`.
- `powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1` installed the
  backend package and dependency `openpyxl==3.1.5` on the configured server.
- `powershell -ExecutionPolicy Bypass -File scripts/deploy-frontend.ps1`
  rebuilt and deployed frontend dist, restarted the backend service, and
  same-origin smoke returned `/assets/index-CZ_kAByZ.js`.
- Server OpenAPI smoke confirmed card export query format pattern
  `^(json|csv|xlsx)$`.
- Server healthcheck passed:
  `curl -fsS http://127.0.0.1:8000/api/v1/health` returned
  `{"status":"ok","service":"reg_engine"}`.
- Production Alembic status was checked and remains
  `0012_report_csv_output (head)`; no Phase 3E migration was required.
- `powershell -ExecutionPolicy Bypass -File scripts/server-check.ps1` passed
  after deployment and service restart.

### Phase 4: Reports

Purpose: add report definitions and report runs.

Status: completed for the approved backend report foundation, frontend UI,
report template settings edit, CSV report output, report run list polish,
report archive visibility, XLSX report output, PDF report output, and report
template type/format edit slices, and report run parameters/summary visibility.
report template parameter schema UI, and report run visual parameter form.
Additional report polish remains deferred.

Planned overall scope:

- Report templates.
- Registry/card reports.
- Period reports.
- Report output storage and audit.

### Phase 4A: Report Foundation API

Status: completed.

Purpose: add the first backend/API report slice without frontend report UI,
XLSX/PDF report outputs, scheduled jobs, public report workflows, binary
attachment/document export, or MCP.

Completed local scope:

- Added migration `0010_reports`.
- Added `report_templates` and `report_runs` SQLAlchemy models.
- Added constraints/indexes for report type, output format, run status,
  template code uniqueness per registry, stored output linkage, and report
  lookup.
- Added authenticated REST API:
  `POST /api/v1/registries/{registry_id}/report-templates`,
  `GET /api/v1/registries/{registry_id}/report-templates`,
  `DELETE /api/v1/report-templates/{template_id}`,
  `POST /api/v1/report-templates/{template_id}/runs`,
  `GET /api/v1/registries/{registry_id}/report-runs`,
  `GET /api/v1/report-runs/{report_run_id}`,
  `GET /api/v1/report-runs/{report_run_id}/content`, and
  `DELETE /api/v1/report-runs/{report_run_id}`.
- Added report types `registry_cards`, `card_detail`, and `period_summary`.
- Stored generated JSON report output through the existing storage abstraction
  under the `reports` prefix.
- Kept API response metadata safe by omitting storage keys, filesystem paths,
  checksums, and stored-file ids from report run responses.
- Enforced backend scope through existing registry schema permissions, card
  management permissions, and card visibility reads.
- Added audit events for report template create/archive and report run
  generate/download/archive.

Verification:

- Targeted model/schema/migration tests passed locally.
- `ruff check` passed for the Phase 4A files.
- `mypy app` passed.
- Offline Alembic SQL render passed locally.
- Disposable PostgreSQL database `reg_engine_phase4a_test` passed clean
  `alembic upgrade head` through `0010_reports`.
- PostgreSQL-backed `tests/test_api_phase_4_reports.py` passed on the same
  disposable database.
- Full `scripts/check.ps1 -SkipRemote` passed with backend pytest
  `62 passed, 130 skipped`, frontend unit tests `29 passed`, frontend build,
  and project tree check.
- `pnpm -C frontend e2e` passed with `3 passed`.
- Deployed commit `abaa76b` to the configured server checkout.
- Production PostgreSQL was migrated from `0009_document_template_versions` to
  `0010_reports` after a fresh server-side backup outside Git, preflight table
  checks, disposable PostgreSQL verification, Alembic upgrade, and post-checks.
- Post-checks verified Alembic current `0010_reports (head)`,
  `report_templates`, `report_runs`, report constraints, and report indexes.
- Backend service was restarted; healthcheck returned `ok`,
  `scripts/server-check.ps1` passed, and live OpenAPI exposed all report
  endpoints.

Production migration checkpoint:

- Completed for `0010_reports`.

Known limitations:

- JSON is the only report output format in Phase 4A.
- No frontend report UI yet.
- No XLSX/PDF report outputs.
- No scheduled/background report jobs.
- No charts or visual report builder.
- No public-link report workflows.
- No binary attachment/generated-document report export.
- No MCP.

### Phase 4B: Report Frontend UI

Status: completed.

Purpose: expose the existing Phase 4A report API in the authenticated
Russian-first registry workspace without adding backend schema, migrations,
non-JSON report formats, scheduling, charts, public report workflows, or MCP
write tools.

Scope:

- Add frontend API client functions for report template and report run list,
  create/generate/download/archive operations.
- Add a Russian-first `Отчеты` panel to the authenticated registry workspace.
- Allow authorized users to create and archive report templates for
  `registry_cards`, `card_detail`, and `period_summary`.
- Allow authorized users to generate JSON report runs, download generated
  report content, and archive report runs.
- Keep all operations behind the existing REST API boundary and bearer-auth
  session.
- Localize report type and report run status labels in the browser UI.

Acceptance criteria:

- No backend models, migrations, services, endpoints, or MCP tools are added.
- No XLSX/PDF report output, report scheduling, charts, public-link report
  workflows, or binary attachment/document report export is added.
- Frontend unit coverage verifies report template create/archive, report run
  generate/download/archive, request payloads, authorization headers, and
  Russian UI labels.
- Frontend typecheck, lint, format, unit tests, build, and e2e pass.
- Project tree, README, and PLANS are updated.

Known limitations:

- At Phase 4B, report output remained JSON only; Phase 4D adds CSV output.
- Report template settings edit is handled by Phase 4C; richer report builder
  UX remains future polish.
- Report downloads still use the existing browser blob download path.
- No public-link report workflows.
- No MCP report write tools.

Verification so far:

- RED frontend tests failed before implementation for missing report API client
  functions and missing `Отчеты` UI.
- Additional RED checks failed before fixes for raw `completed` report-run
  status and the missing `Сформированные отчеты` heading.
- Targeted frontend tests passed:
  `pnpm -C frontend exec vitest run src/api/adminMutations.test.ts src/App.test.tsx`
  with `2 passed`, `24 passed`.
- `scripts/check.ps1 -SkipRemote` passed with backend pytest `77 passed,
  130 skipped`, frontend unit tests `30 passed`, frontend build, and project
  tree check.
- `scripts/format.ps1 -Check` passed.
- `pnpm -C frontend e2e` passed with `3 passed`.
- Deployed commit `c5eb448` to the configured server checkout with
  `scripts/deploy.ps1`.
- Deployed frontend dist with `scripts/deploy-frontend.ps1`; same-origin
  frontend/API smoke passed.
- `scripts/server-check.ps1` passed after frontend deployment.
- No production migration is required because Phase 4B adds no backend schema
  changes.

Production migration checkpoint:

- Not required for Phase 4B.

### Phase 4C: Report Template Settings Edit

Status: completed.

Purpose: close the first report polish gap by allowing authenticated registry
schema admins to edit existing report template settings without introducing
new report output formats, scheduling, charts, public report workflows, or MCP
write tools.

Scope:

- Add authenticated REST API support for updating an active report template.
- Allow updates to report template `name`, `description`,
  `parameters_schema_json`, and `default_parameters_json`.
- Keep `code`, `registry_id`, `report_type`, and `output_format` immutable in
  this slice.
- Enforce existing `registry.schema.manage` permission for updates.
- Reject archived/inactive report template updates through the active template
  lookup.
- Write `audit_events` with `action=report_template_update`.
- Add Russian-first UI controls for editing an existing report template from
  the report panel.
- Add frontend API client support for `PATCH /api/v1/report-templates/{id}`.

Acceptance criteria:

- No database schema change or Alembic migration is added.
- No XLSX/PDF/non-JSON report output is added in Phase 4C.
- No scheduled/background reports, charts, public-link report workflows,
  binary attachment/document export, or MCP write tools are added.
- Backend coverage verifies update success, permission denial, archived
  template denial, and audit.
- Frontend coverage verifies Russian edit controls, PATCH payload, and
  continued generate/download/archive behavior after a template update.
- README, PLANS, and project tree checks are updated or verified.

Known limitations:

- At Phase 4C, report output remained JSON only; Phase 4D adds CSV output.
- Report template settings are still a simple form, not a visual report
  builder.
- Report template `code`, `report_type`, and `output_format` remain immutable.
- Report downloads still use the existing browser blob download path.
- No public-link report workflows.
- No MCP report write tools.

Verification:

- Targeted frontend tests passed:
  `npm test -- --run src/api/adminMutations.test.ts src/App.test.tsx`
  with `2 passed`, `24 passed`.
- Backend PostgreSQL-backed report tests were invoked with
  `backend\.venv\Scripts\python.exe -m pytest backend/tests/test_api_phase_4_reports.py -q`
  and skipped locally because `TEST_DATABASE_URL` is not set.
- `ruff check backend/app backend/tests/test_api_phase_4_reports.py` passed.
- `ruff format --check backend/app backend/tests/test_api_phase_4_reports.py`
  passed.
- `mypy backend/app` passed.
- `npm run typecheck` passed in `frontend`.
- Full `scripts/check.ps1 -SkipRemote` passed with backend pytest
  `77 passed, 131 skipped`, frontend unit tests `30 passed`, frontend build,
  and project tree check.
- `pnpm -C frontend e2e` passed with `3 passed`.
- Deployed commit `95001a6` to the configured server checkout with
  `scripts/deploy.ps1`.
- Deployed frontend dist with `scripts/deploy-frontend.ps1`; same-origin
  frontend/API smoke passed after backend service restart.
- Server OpenAPI smoke verified
  `/api/v1/report-templates/{template_id}` exposes `PATCH`.
- `scripts/server-check.ps1` passed after deployment.

Production migration checkpoint:

- Not required for Phase 4C.

### Phase 4D: CSV Report Output

Status: completed.

Purpose: add the first non-JSON report output while keeping the existing report
service/API boundary, storage abstraction, scope checks, and audit behavior.

Scope:

- Add output format `csv` for report templates.
- Add migration `0012_report_csv_output` to allow `csv` in
  `report_templates.output_format`.
- Keep existing report types: `registry_cards`, `card_detail`, and
  `period_summary`.
- Store generated CSV report bytes through the existing report storage prefix.
- Return `text/csv; charset=utf-8` and `.csv` filenames for CSV report runs.
- Keep report run responses safe: no storage keys, filesystem paths, checksums,
  or stored-file ids.
- Preserve existing backend scope checks for template creation, report
  generation, report reads/downloads, and archive reads.
- Preserve report run generate/download/archive audit events.
- Add Russian-first UI support for choosing `JSON` or `CSV` when creating a
  report template.

Acceptance criteria:

- CSV report templates can be created only by actors with
  `registry.schema.manage`.
- CSV report runs use the same visibility scope as JSON report runs.
- CSV download does not expose sibling-branch cards outside the actor scope.
- CSV output is stored through the storage abstraction, not returned from
  memory-only ad hoc state.
- JSON report behavior remains intact.
- No XLSX/PDF output, scheduling, charts, public-link report workflows,
  binary attachment/document report export, or MCP write tools are added.
- README, PLANS, and project tree are updated.

Known limitations:

- CSV schemas are simple technical exports per existing report type, not a
  visual report builder.
- XLSX/PDF report outputs were outside Phase 4D and were completed later in
  Phase 4G/4H.
- Scheduled/background reports, charts, and public-link report workflows remain
  deferred.
- No MCP report write tools.

Verification so far:

- RED backend test failed before implementation with
  `Unsupported report output format: csv`.
- RED frontend test failed before implementation because `Формат отчета` did
  not offer a `csv` option.
- GREEN backend targeted test passed on disposable PostgreSQL database
  `reg_engine_phase4d_test`:
  `backend\.venv\Scripts\python.exe -m pytest backend/tests/test_api_phase_4_reports.py::test_csv_registry_report_runs_are_scoped_stored_and_downloadable -q`.
- GREEN frontend targeted test passed:
  `npm test -- --run src/App.test.tsx --testNamePattern "report templates"`.
- Full PostgreSQL-backed report API suite passed on disposable database
  `reg_engine_phase4d_test`:
  `backend\.venv\Scripts\python.exe -m pytest backend/tests/test_api_phase_4_reports.py -q`.
- Alembic offline SQL render passed from `backend` and included migration
  `0012_report_csv_output` with `csv` in
  `ck_report_templates_output_format`.
- Full local project check passed:
  `powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote`.
- Format check passed:
  `powershell -ExecutionPolicy Bypass -File scripts/format.ps1 -Check`.
- Frontend Playwright E2E passed:
  `pnpm -C frontend e2e`.

Production migration checkpoint:

- Production PostgreSQL was migrated from `0011_mcp_audit_source` to
  `0012_report_csv_output` on 2026-06-30.
- Server checkout was synchronized to commit `b9f25d0` before migration.
- Preflight confirmed target database `reg_engine` and no existing
  `report_templates` rows requiring output-format cleanup.
- Backup was created before migration:
  `/var/backups/reg_engine/reg_engine_before_0012_report_csv_output_20260630T015931Z.dump`
  (`126832` bytes).
- Post-check confirmed Alembic `0012_report_csv_output (head)` and
  `ck_report_templates_output_format` allows `json` and `csv`.
- Frontend dist was deployed with `scripts/deploy-frontend.ps1`; same-origin
  frontend/API smoke passed after backend service restart.
- `scripts/server-check.ps1` passed after migration and deployment.
- Server OpenAPI smoke verified report routes and healthcheck:
  `GET /api/v1/health` returned `{"status":"ok","service":"reg_engine"}`.

### Phase 4E: Report Run List Polish

Status: completed.

Purpose: close a small report polish gap before larger XLSX/PDF report outputs,
XLSX workflows, or MCP write tools.

Scope:

- List report runs newest-first for registry report run reads.
- Show generated report output format and output filename in the Russian report
  run list.
- Keep the existing report template/run REST API boundary.
- Do not add database schema changes or migrations.
- Do not add XLSX/PDF output, scheduling, charts, public-link report workflows,
  binary attachment/document report export, or MCP write tools.

Acceptance criteria:

- Newer report runs appear before older runs in
  `GET /api/v1/registries/{registry_id}/report-runs`.
- The authenticated Russian report UI shows a generated run's format and
  filename, for example `CSV / report.csv`.
- Existing report generate/download/archive behavior remains intact.
- README, PLANS, and project tree are updated or checked.

Known limitations:

- This is list polish only; it does not add a visual report builder.
- XLSX/PDF report outputs were outside Phase 4E and were completed later in
  Phase 4G/4H.
- Scheduled/background reports, charts, and public-link report workflows remain
  deferred.
- No MCP report write tools.

Verification so far:

- RED backend test failed before implementation because report runs were listed
  oldest-first.
- RED frontend test failed before implementation because the report run row did
  not show `CSV / report.csv`.
- GREEN backend targeted test passed on disposable PostgreSQL database
  `reg_engine_phase4e_test`:
  `backend\.venv\Scripts\python.exe -m pytest backend/tests/test_api_phase_4_reports.py::test_report_runs_list_newest_runs_first -q`.
- GREEN frontend targeted test passed:
  `npm test -- --run src/App.test.tsx --testNamePattern "manages report templates"`.
- Full PostgreSQL-backed report API suite passed on disposable database
  `reg_engine_phase4e_test`:
  `backend\.venv\Scripts\python.exe -m pytest backend/tests/test_api_phase_4_reports.py -q`.
- Full local project check passed:
  `powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote`.
- Format check passed:
  `powershell -ExecutionPolicy Bypass -File scripts/format.ps1 -Check`.
- Frontend Playwright E2E passed:
  `pnpm -C frontend e2e`.

Production migration checkpoint:

- Not required for Phase 4E.

Deployment checkpoint:

- Commit `98bdeef` was pushed to `origin/main`.
- Server checkout was synchronized to commit `98bdeef` with
  `scripts/deploy.ps1`.
- Frontend dist was deployed with `scripts/deploy-frontend.ps1`; same-origin
  frontend/API smoke passed after backend service restart.
- `scripts/server-check.ps1` passed after deployment.
- Server smoke confirmed `server_head=98bdeef`, Alembic remained
  `0012_report_csv_output (head)`, `GET /api/v1/health` returned
  `{"status":"ok","service":"reg_engine"}`, and the SPA shell served the
  updated asset `/assets/index-jkxU57z9.js`.

### Phase 4F: Report Archive Visibility

Status: completed.

Purpose: close the next report polish gap by making archived report templates
and report runs inspectable from the authenticated Russian report UI before
larger XLSX/PDF report outputs, XLSX workflows, or MCP write tools.

Scope:

- Add Russian UI toggles for showing archived report templates and archived
  report runs.
- Use existing backend `include_archive=true` support for report template/run
  list and archived report-run content download.
- Keep active report generation limited to active, non-archived templates.
- Allow archived report runs to be downloaded while preserving backend
  visibility checks.
- Disable edit/archive actions for archived templates and disable repeated
  archive action for archived report runs.
- Do not add database schema changes or migrations.
- Do not add XLSX/PDF output, scheduling, charts, public-link report workflows,
  binary attachment/document report export, or MCP write tools.

Acceptance criteria:

- Authenticated users can toggle archived report templates in the report UI.
- Authenticated users can toggle archived report runs in the report UI.
- Archived report rows show a Russian archived status.
- Archived report runs download through
  `GET /api/v1/report-runs/{report_run_id}/content?include_archive=true`.
- List/download archive visibility does not re-enable edit/archive actions for
  archived rows.
- Existing report create/update/generate/download/archive behavior remains
  intact.
- README, PLANS, and project tree are updated or checked.

Known limitations:

- This is archive visibility polish only; it does not add a visual report
  builder.
- XLSX/PDF report outputs were outside Phase 4F and were completed later in
  Phase 4G/4H.
- Scheduled/background reports, charts, and public-link report workflows remain
  deferred.
- No MCP report write tools.

Verification:

- RED frontend test failed before implementation because the report UI had no
  `Показывать архивные отчеты` control.
- GREEN targeted frontend test passed:
  `npm test -- --run src/App.test.tsx --testNamePattern "manages report templates" --testTimeout 12000`.
- Targeted frontend test also passed without a custom timeout:
  `npm test -- --run src/App.test.tsx --testNamePattern "manages report templates"`.
- Full local project check passed:
  `powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote`.
- Format check passed:
  `powershell -ExecutionPolicy Bypass -File scripts/format.ps1 -Check`.
- Frontend Playwright E2E passed:
  `pnpm -C frontend e2e`.

Production migration checkpoint:

- Not required for Phase 4F.

Deployment checkpoint:

- Commit `7a33e25` was pushed to `origin/main`.
- Server checkout was synchronized to commit `7a33e25` with
  `scripts/deploy.ps1`.
- Frontend dist was deployed with `scripts/deploy-frontend.ps1`; same-origin
  frontend/API smoke passed after backend service restart.
- `scripts/server-check.ps1` passed after deployment.
- Server smoke confirmed `server_head=7a33e25`, Alembic remained
  `0012_report_csv_output (head)`, `GET /api/v1/health` returned
  `{"status":"ok","service":"reg_engine"}`, and the SPA shell served the
  updated asset `/assets/index-DVjJpnYY.js`.

### Phase 4G: XLSX Report Output

Status: completed.

Purpose: add the next non-JSON report output format while preserving the
existing report service/API boundary, storage abstraction, visibility scope, and
audit behavior.

Scope:

- Add output format `xlsx` for report templates.
- Add Alembic migration `0013_report_xlsx_output` to allow `xlsx` in
  `report_templates.output_format`.
- Render XLSX files for the existing report types: `registry_cards`,
  `card_detail`, and `period_summary`.
- Store generated XLSX report bytes through the existing `reports` storage
  prefix.
- Return the standard XLSX content type and `.xlsx` filenames for XLSX report
  runs.
- Keep report run responses safe: no storage keys, filesystem paths,
  checksums, or stored-file ids.
- Preserve existing backend scope checks for template creation, report
  generation, report reads/downloads, archive reads, and audit events.
- Add Russian-first UI support for choosing `XLSX` when creating a report
  template.

Acceptance criteria:

- XLSX report templates can be created only by actors with
  `registry.schema.manage`.
- XLSX report runs use the same visibility scope as JSON/CSV report runs.
- XLSX download does not expose sibling-branch cards outside the actor scope.
- XLSX output is stored through the storage abstraction, not returned from
  memory-only ad hoc state.
- JSON and CSV report behavior remains intact.
- No PDF output, scheduling, charts, public-link report workflows, binary
  attachment/document report export, or MCP write tools are added.
- README, PLANS, and project tree are updated.

Known limitations:

- XLSX sheets are simple technical report outputs per existing report type, not
  a visual report builder.
- PDF report output was outside Phase 4G and was completed later in Phase 4H.
- Scheduled/background reports, charts, and public-link report workflows remain
  deferred.
- No MCP report write tools.

Verification so far:

- RED backend unit test failed before implementation with
  `Unsupported report output format: xlsx`.
- RED frontend test failed before implementation because the report format
  select did not contain value `xlsx`.
- GREEN backend targeted renderer test passed:
  `backend\.venv\Scripts\python.exe -m pytest backend\tests\test_api_phase_4_reports.py::test_xlsx_report_output_renderer_creates_workbook_bytes -q`.
- GREEN frontend targeted report UI test passed:
  `pnpm -C frontend exec vitest run src/App.test.tsx --testNamePattern "manages report templates"`.
- Alembic offline SQL render passed and included
  `0013_report_xlsx_output` with `json`, `csv`, and `xlsx` in
  `ck_report_templates_output_format`.
- Full local project check passed:
  `powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote`
  with backend pytest `78 passed, 137 skipped`, frontend unit tests
  `31 passed`, frontend build, and project tree check.
- Format check passed:
  `powershell -ExecutionPolicy Bypass -File scripts/format.ps1 -Check`.
- Frontend Playwright E2E passed:
  `pnpm -C frontend e2e` with `3 passed`.
- Disposable PostgreSQL verification passed on server database
  `reg_engine_phase4g_test`: clean `alembic upgrade head` reached
  `0013_report_xlsx_output`, the targeted XLSX report API test passed, and
  the disposable constraint check showed `json`, `csv`, and `xlsx`.
- Deployed commit `8aed67b` to the configured server checkout with
  `scripts/deploy.ps1`.
- Deployed frontend dist with `scripts/deploy-frontend.ps1`; same-origin
  frontend/API smoke passed after backend service restart.
- `powershell -ExecutionPolicy Bypass -File scripts/server-check.ps1` passed
  after migration and frontend deployment.
- Server smoke confirmed `server_head=8aed67b`, Alembic
  `0013_report_xlsx_output (head)`, `GET /api/v1/health` returned
  `{"status":"ok","service":"reg_engine"}`, and the SPA shell served
  `/assets/index-ClVCSqB4.js`.

Production migration checkpoint:

- Production PostgreSQL was migrated from `0012_report_csv_output` to
  `0013_report_xlsx_output` on 2026-06-30.
- Server checkout was synchronized to commit `8aed67b` before migration.
- Preflight confirmed target database `reg_engine`, Alembic current
  `0012_report_csv_output`, and zero `report_templates` rows with output
  formats outside `json`, `csv`, or `xlsx`.
- Backup was created before migration:
  `/var/backups/reg_engine/reg_engine_before_0013_report_xlsx_output_20260630T032538Z.dump`
  (`126895` bytes).
- Post-check confirmed Alembic `0013_report_xlsx_output (head)` and
  `ck_report_templates_output_format` allows `json`, `csv`, and `xlsx`.
- Backend service was restarted; a first immediate health curl raced the
  restart, then repeated healthcheck returned `ok`.

### Phase 4H: PDF Report Output

Status: completed.

Purpose: add PDF as the next report output format while preserving the existing
report service/API boundary, storage abstraction, visibility scope, and audit
behavior.

Scope:

- Add output format `pdf` for report templates.
- Add Alembic migration `0014_report_pdf_output` to allow `pdf` in
  `report_templates.output_format`.
- Render simple technical PDF files for the existing report types:
  `registry_cards`, `card_detail`, and `period_summary`.
- Store generated PDF report bytes through the existing `reports` storage
  prefix.
- Return `application/pdf` and `.pdf` filenames for PDF report runs.
- Keep report run responses safe: no storage keys, filesystem paths,
  checksums, or stored-file ids.
- Preserve existing backend scope checks for template creation, report
  generation, report reads/downloads, archive reads, and audit events.
- Add Russian-first UI support for choosing `PDF` when creating a report
  template.

Acceptance criteria:

- PDF report templates can be created only by actors with
  `registry.schema.manage`.
- PDF report runs use the same visibility scope as JSON/CSV/XLSX report runs.
- PDF download does not expose sibling-branch cards outside the actor scope.
- PDF output is stored through the storage abstraction, not returned from
  memory-only ad hoc state.
- JSON, CSV, and XLSX report behavior remains intact.
- No scheduling, charts, public-link report workflows, binary
  attachment/document report export, visual report builder, or MCP write tools
  are added.
- README, PLANS, and project tree are updated.

Known limitations:

- PDF output is a simple technical text/table rendering, not a polished visual
  report designer.
- Scheduled/background reports, charts, and public-link report workflows remain
  deferred.
- No MCP report write tools.

Verification so far:

- RED backend unit test failed before implementation with
  `Unsupported report output format: pdf`.
- RED frontend test failed before implementation because the report format
  select did not contain value `pdf`.
- GREEN backend targeted renderer test passed:
  `backend\.venv\Scripts\python.exe -m pytest backend\tests\test_api_phase_4_reports.py::test_pdf_report_output_renderer_creates_pdf_bytes -q`.
- GREEN frontend targeted report UI test passed:
  `pnpm -C frontend exec vitest run src/App.test.tsx --testNamePattern "manages report templates"`.
- Backend report suite without `TEST_DATABASE_URL` passed locally with
  `2 passed, 7 skipped`:
  `backend\.venv\Scripts\python.exe -m pytest backend\tests\test_api_phase_4_reports.py -q`.
- Targeted `ruff check`, `mypy app`, and Alembic offline SQL render passed;
  offline SQL included `0014_report_pdf_output` and
  `ck_report_templates_output_format` with `json`, `csv`, `xlsx`, and `pdf`.
- Full local project check passed:
  `powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote`
  with backend pytest `79 passed, 138 skipped`, frontend unit tests
  `31 passed`, frontend build, and project tree check.
- Format check passed:
  `powershell -ExecutionPolicy Bypass -File scripts/format.ps1 -Check`.
- Frontend Playwright E2E passed:
  `pnpm -C frontend e2e` with `3 passed`.
- Disposable PostgreSQL verification passed on server database
  `reg_engine_phase4h_test`: clean `alembic upgrade head` reached
  `0014_report_pdf_output`, the targeted PDF report API test passed, and
  the disposable constraint check showed `json`, `csv`, `xlsx`, and `pdf`.
- Deployed commit `54d0150` to the configured server checkout with
  `scripts/deploy.ps1`.
- Deployed frontend dist with `scripts/deploy-frontend.ps1`; same-origin
  frontend/API smoke passed after backend service restart.
- `powershell -ExecutionPolicy Bypass -File scripts/server-check.ps1` passed
  after migration and frontend deployment.
- Server smoke confirmed `server_head=54d0150`, Alembic
  `0014_report_pdf_output (head)`, `GET /api/v1/health` returned
  `{"status":"ok","service":"reg_engine"}`, and the SPA shell served
  `/assets/index-Bto_Mwm8.js`.

Production migration checkpoint:

- Production PostgreSQL was migrated from `0013_report_xlsx_output` to
  `0014_report_pdf_output` on 2026-06-30.
- Server checkout was synchronized to commit `54d0150` before migration.
- Preflight confirmed target database `reg_engine`, Alembic current
  `0013_report_xlsx_output`, and zero `report_templates` rows with output
  formats outside `json`, `csv`, `xlsx`, or `pdf`.
- Backup was created before migration:
  `/var/backups/reg_engine/reg_engine_before_0014_report_pdf_output_20260630T034318Z.dump`
  (`126923` bytes).
- Post-check confirmed Alembic `0014_report_pdf_output (head)` and
  `ck_report_templates_output_format` allows `json`, `csv`, `xlsx`, and
  `pdf`.
- Backend service was restarted through frontend deployment; a first immediate
  health curl raced the restart, then repeated healthcheck returned `ok`.

### Phase 4I: Report Template Type And Format Edit

Status: completed.

Purpose: close a report settings polish gap by allowing authenticated registry
schema admins to change an existing report template's `report_type` and
`output_format` after creation, without adding new report workflows.

Scope:

- Extend the existing report template PATCH flow to accept `report_type` and
  `output_format`.
- Reuse existing validation for supported report types and output formats.
- Preserve existing `registry.schema.manage` permission checks and archived
  template protection.
- Add Russian-first UI controls in the existing report-template edit form for
  report type and output format.
- Keep existing report runs unchanged; new runs use the updated template
  settings.
- Do not add migrations, new tables, new endpoints, scheduled reports, charts,
  public-link report workflows, binary attachment/document report export,
  visual report builder, or MCP write tools.

Acceptance criteria:

- PATCHing an active report template can update `report_type` and
  `output_format`.
- Unsupported `report_type` or `output_format` values are rejected by the
  backend service.
- Archived report templates still cannot be updated.
- The Russian report UI can edit type and format for active templates.
- Existing report create/generate/download/archive behavior remains intact.
- README, PLANS, and project tree are updated or checked.

Known limitations:

- This is settings polish only; it does not add a visual report builder.
- Existing report runs are immutable and keep their original type/format
  metadata.
- Scheduled/background reports, charts, public-link report workflows, binary
  attachment/document report export, and MCP write tools remain deferred.

Verification so far:

- RED backend service test failed before implementation with
  `Unsupported report template update fields: output_format, report_type`.
- RED frontend test failed before implementation because the report edit form
  did not contain `Новый тип отчета`.
- GREEN backend targeted service test passed:
  `backend\.venv\Scripts\python.exe -m pytest backend\tests\test_api_phase_4_reports.py::test_report_template_update_service_accepts_type_and_format -q`.
- GREEN frontend targeted report UI test passed:
  `pnpm -C frontend exec vitest run src/App.test.tsx --testNamePattern "manages report templates"`.
- Backend report suite without `TEST_DATABASE_URL` passed locally with
  `3 passed, 7 skipped`:
  `backend\.venv\Scripts\python.exe -m pytest backend\tests\test_api_phase_4_reports.py -q`.
- Targeted `ruff check` and `mypy app` passed.
- Full local project check passed:
  `powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote`
  with backend pytest `80 passed, 138 skipped`, frontend unit tests
  `31 passed`, frontend build, and project tree check.
- Format check passed:
  `powershell -ExecutionPolicy Bypass -File scripts/format.ps1 -Check`.
- Frontend Playwright E2E passed:
  `pnpm -C frontend e2e` with `3 passed`.
- Disposable PostgreSQL-backed API verification passed on server database
  `reg_engine_phase4i_test`: clean `alembic upgrade head` reached
  `0014_report_pdf_output`, and
  `tests/test_api_phase_4_reports.py::test_report_template_settings_can_be_updated_and_audited`
  passed.
- Deployed commit `87c6481` to the configured server checkout with
  `scripts/deploy.ps1`.
- Deployed frontend dist with `scripts/deploy-frontend.ps1`; same-origin
  frontend/API smoke passed after backend service restart.
- `powershell -ExecutionPolicy Bypass -File scripts/server-check.ps1` passed
  after deployment.
- Server smoke confirmed `server_head=87c6481`, Alembic remained
  `0014_report_pdf_output (head)`, `GET /api/v1/health` returned
  `{"status":"ok","service":"reg_engine"}`, and the SPA shell served
  `/assets/index-DVU7TUsK.js`.

Production migration checkpoint:

- Not required for Phase 4I; production Alembic remained
  `0014_report_pdf_output (head)`.

### Phase 4J: Report Run Parameters And Summary Visibility

Status: completed.

Purpose: close a small report UI polish gap by making generated report run
inputs and summary metadata visible in the existing Russian report run list.

Scope:

- Show existing `parameters_json` for generated report runs as Russian
  "Параметры запуска" metadata.
- Show existing `summary_json` for generated report runs as Russian
  "Сводка отчета" metadata.
- Keep archived report runs readable and downloadable with the same metadata.
- Use compact JSON display and `Нет данных` for empty metadata.
- Do not add backend code, migrations, models, endpoints, report formats,
  scheduled reports, charts, public-link report workflows, binary
  attachment/document report export, visual report builder, or MCP write tools.

Acceptance criteria:

- Generated report rows show run parameters in the Russian UI.
- Generated report rows show report summary metadata in the Russian UI.
- Archived report rows keep the same metadata visible.
- Existing report create/edit/generate/download/archive behavior remains intact.
- README, PLANS, and project tree are updated or checked.

Known limitations:

- This is list visibility polish only; it does not add a detailed report run
  page or visual report builder.
- JSON metadata is displayed compactly and remains technical metadata.
- Scheduled/background reports, charts, public-link report workflows, binary
  attachment/document report export, and MCP write tools remain deferred.

Verification so far:

- RED frontend report UI test failed before implementation because the run list
  did not contain `Параметры запуска: {"limit":20}`.
- GREEN targeted frontend report UI test passed:
  `pnpm -C frontend exec vitest run src/App.test.tsx --testNamePattern "manages report templates"`.
- Full local project check passed:
  `powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote`
  with backend pytest `80 passed, 138 skipped`, frontend unit tests
  `31 passed`, frontend build, and project tree check.
- Format check passed:
  `powershell -ExecutionPolicy Bypass -File scripts/format.ps1 -Check`.
- Frontend Playwright E2E passed:
  `pnpm -C frontend e2e` with `3 passed`.
- Deployed commit `f66516d` to the configured server checkout with
  `scripts/deploy.ps1`.
- Deployed frontend dist with `scripts/deploy-frontend.ps1`; same-origin
  frontend/API smoke passed after backend service restart.
- `powershell -ExecutionPolicy Bypass -File scripts/server-check.ps1` passed
  after deployment.
- Server smoke confirmed `server_head=f66516d`, Alembic remained
  `0014_report_pdf_output (head)`, `GET /api/v1/health` returned
  `{"status":"ok","service":"reg_engine"}`, and the SPA shell served
  `/assets/index-luvTP2JJ.js`.

Production migration checkpoint:

- Not required for Phase 4J; no backend schema changes are included.

### Phase 4K: Report Template Parameter Schema UI

Status: completed.

Purpose: close a report template settings polish gap by exposing the existing
`parameters_schema_json` API field in the authenticated Russian report UI.

Scope:

- Add a Russian-first "Схема параметров JSON" control to report template
  creation.
- Add a Russian-first "Новая схема параметров JSON" control to report template
  editing.
- Send `parameters_schema_json` through the existing create and PATCH report
  template API payloads.
- Preserve existing default parameter JSON, report type, output format,
  archive protection, and permission behavior.
- Do not add backend code, migrations, models, endpoints, report formats,
  scheduled reports, charts, public-link report workflows, binary
  attachment/document report export, visual report builder, or MCP write tools.

Acceptance criteria:

- Creating a report template can save `parameters_schema_json` from the Russian
  UI.
- Editing a report template can update `parameters_schema_json` from the
  Russian UI.
- Existing report create/edit/generate/download/archive behavior remains intact.
- README, PLANS, and project tree are updated or checked.

Known limitations:

- This phase only stores and edits the schema JSON; it does not generate a
  visual parameter form from that schema.
- JSON object validation remains the existing client-side object parsing plus
  backend schema type validation.
- Scheduled/background reports, charts, public-link report workflows, binary
  attachment/document report export, and MCP write tools remain deferred.

Verification so far:

- RED frontend report UI test failed before implementation because the create
  form did not contain `Схема параметров JSON`.
- GREEN targeted frontend report UI test passed:
  `pnpm -C frontend exec vitest run src/App.test.tsx --testNamePattern "manages report templates"`.
- Full local project check passed:
  `powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote`
  with backend pytest `80 passed, 138 skipped`, frontend unit tests
  `31 passed`, frontend build, and project tree check.
- Format check passed:
  `powershell -ExecutionPolicy Bypass -File scripts/format.ps1 -Check`.
- Frontend Playwright E2E passed:
  `pnpm -C frontend e2e` with `3 passed`.
- Deployed commit `ed718d1` to the configured server checkout with
  `scripts/deploy.ps1`.
- Deployed frontend dist with `scripts/deploy-frontend.ps1`; same-origin
  frontend/API smoke passed after backend service restart.
- `powershell -ExecutionPolicy Bypass -File scripts/server-check.ps1` passed
  after deployment.
- Server smoke confirmed `server_head=ed718d1`, Alembic remained
  `0014_report_pdf_output (head)`, `GET /api/v1/health` returned
  `{"status":"ok","service":"reg_engine"}`, and the SPA shell served
  `/assets/index-1TXp2QWI.js`.

Production migration checkpoint:

- Not required for Phase 4K; no backend schema changes are included.

### Phase 4L: Report Run Visual Parameter Form

Status: completed.

Purpose: close a report run usability polish gap by using existing
`parameters_schema_json` object properties to render basic Russian UI controls
for report generation parameters.

Scope:

- Render basic run-parameter controls from `parameters_schema_json.properties`
  for `string`, `number`, `integer`, and `boolean` property types.
- Use property `title` as the visible label when present, otherwise use the
  property code.
- Seed displayed values from existing `default_parameters_json` when manual run
  JSON is empty.
- Sync visual control changes into the existing `parameters` JSON payload used
  by report generation.
- Keep the manual `Параметры запуска JSON` field available for unsupported or
  advanced schemas.
- Do not add backend code, migrations, models, endpoints, report formats,
  scheduled reports, charts, public-link report workflows, binary
  attachment/document report export, full visual report builder, or MCP write
  tools.

Acceptance criteria:

- A report template with a basic schema property renders a visual run parameter
  control in the Russian UI.
- The visual control is prefilled from `default_parameters_json` when available.
- Changing the visual control updates the report generation payload.
- Existing manual JSON run-parameter input remains available.
- Existing report create/edit/generate/download/archive behavior remains intact.
- README, PLANS, and project tree are updated or checked.

Known limitations:

- Only flat object properties with basic scalar types are rendered visually.
- Nested objects, arrays, enums, conditional schemas, validations, and a full
  visual report builder remain deferred.
- Backend remains the API/security boundary; frontend schema rendering is only
  a usability layer.
- Scheduled/background reports, charts, public-link report workflows, binary
  attachment/document report export, and MCP write tools remain deferred.

Verification so far:

- RED frontend report UI test failed before implementation because the run form
  did not render schema property label `Лимит`.
- GREEN targeted frontend report UI test passed:
  `pnpm -C frontend exec vitest run src/App.test.tsx --testNamePattern "manages report templates"`.
- Full local project check passed:
  `powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote`
  with backend pytest `80 passed, 138 skipped`, frontend unit tests
  `31 passed`, frontend build, and project tree check.
- Format check passed:
  `powershell -ExecutionPolicy Bypass -File scripts/format.ps1 -Check`.
- Frontend Playwright E2E passed:
  `pnpm -C frontend e2e` with `3 passed`.
- Deployed commit `74089ea` to the configured server checkout with
  `scripts/deploy.ps1`.
- Deployed frontend dist with `scripts/deploy-frontend.ps1`; same-origin
  frontend/API smoke passed after backend service restart.
- `powershell -ExecutionPolicy Bypass -File scripts/server-check.ps1` passed
  after deployment.
- Server smoke confirmed `server_head=74089ea`, Alembic remained
  `0014_report_pdf_output (head)`, `GET /api/v1/health` returned
  `{"status":"ok","service":"reg_engine"}`, and the SPA shell served
  `/assets/index-Cw6onbGr.js` with `/assets/index-bNU_0_Xh.css`.

Production migration checkpoint:

- Not required for Phase 4L; no backend schema changes are included.

### Phase 4M: Report Run Enum Parameter Controls

Status: completed.

Purpose: continue the report-polish sequence by rendering simple enum
parameters from existing report template JSON schema as visual select controls.

Scope:

- Render `parameters_schema_json.properties.<code>.enum` as a select control
  when the property type is a supported scalar type.
- Keep the existing Russian label behavior: property `title` is the visible
  label when present, otherwise the property code is shown.
- Sync selected enum values into the existing report run `parameters` JSON
  payload.
- Keep the manual `Параметры запуска JSON` field available for unsupported or
  advanced schemas.
- Do not add backend code, migrations, models, endpoints, report formats,
  scheduled reports, charts, public-link report workflows, binary
  attachment/document report export, full visual report builder, or MCP write
  tools.

Acceptance criteria:

- A report template with a scalar enum schema property renders a visual select
  control in the Russian UI.
- The select control is prefilled from `default_parameters_json` when
  available.
- Changing the select control updates the report generation payload.
- Existing manual JSON run-parameter input remains available.
- Existing report create/edit/generate/download/archive behavior remains
  intact.
- README, PLANS, and project tree are updated or checked.

Known limitations:

- Only flat object properties with scalar `enum` values are rendered visually.
- Enum display labels use the raw enum values in this slice.
- Nested objects, arrays, enum label maps, conditional schemas, validations,
  and a full visual report builder remain deferred.
- Backend remains the API/security boundary; frontend schema rendering is only
  a usability layer.
- Scheduled/background reports, charts, public-link report workflows, binary
  attachment/document report export, and MCP write tools remain deferred.

Verification so far:

- RED frontend report UI test failed before implementation because schema
  enum parameter `Раздел` rendered as a text input without select options.
- GREEN targeted frontend report UI test passed:
  `pnpm -C frontend exec vitest run src/App.test.tsx --testNamePattern "manages report templates"`.
- Format check passed:
  `powershell -ExecutionPolicy Bypass -File scripts/format.ps1 -Check`.
- Full local project check passed:
  `powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote`
  with backend pytest `80 passed, 138 skipped`, frontend unit tests
  `31 passed`, frontend build, and project tree check.
- Frontend Playwright E2E passed:
  `pnpm -C frontend e2e` with `3 passed`.
- Deployed commit `9112f30` to the configured server checkout with
  `scripts/deploy.ps1`.
- Deployed frontend dist with `scripts/deploy-frontend.ps1`; same-origin
  frontend/API smoke passed after backend service restart.
- `powershell -ExecutionPolicy Bypass -File scripts/server-check.ps1` passed
  after deployment.
- Server smoke confirmed `server_head=9112f30`, Alembic remained
  `0014_report_pdf_output (head)`, `GET /api/v1/health` returned
  `{"status":"ok","service":"reg_engine"}`, and the SPA shell served
  `/assets/index-Dw3EdfQE.js` with `/assets/index-bNU_0_Xh.css`.

Production migration checkpoint:

- Not required for Phase 4M; no backend schema changes are included.

### Phase 4N: Report Run Enum Option Labels

Status: completed.

Purpose: continue the report-polish sequence by allowing report run enum
parameter selects to show user-facing option labels from existing template JSON
schema metadata.

Scope:

- Render report parameter options from
  `parameters_schema_json.properties.<code>.oneOf[]` entries with scalar
  `const` values.
- Use `oneOf[].title` as the select option label when present, otherwise show
  the raw `const` value.
- Preserve scalar `const` values in the existing report run `parameters` JSON
  payload.
- Keep existing raw `enum` support as a fallback for schemas without `oneOf`.
- Keep the manual `Параметры запуска JSON` field available for unsupported or
  advanced schemas.
- Do not add backend code, migrations, models, endpoints, report formats,
  scheduled reports, charts, public-link report workflows, binary
  attachment/document report export, full visual report builder, or MCP write
  tools.

Acceptance criteria:

- A report template with a scalar `oneOf[].const` schema property renders a
  visual select control in the Russian UI.
- Select options show `oneOf[].title` labels while keeping the option values as
  the scalar `const` values.
- Changing the select control updates the report generation payload with the
  scalar value, not the display label.
- Existing raw `enum` report parameter behavior remains available.
- Existing report create/edit/generate/download/archive behavior remains
  intact.
- README, PLANS, and project tree are updated or checked.

Known limitations:

- Only flat object properties with scalar `oneOf[].const` values are rendered
  as labelled selects.
- Nested objects, arrays, conditional schemas, validation constraints, grouped
  options, and a full visual report builder remain deferred.
- Backend remains the API/security boundary; frontend schema rendering is only
  a usability layer.
- Scheduled/background reports, charts, public-link report workflows, binary
  attachment/document report export, and MCP write tools remain deferred.

Verification so far:

- RED frontend report UI test failed before implementation because schema
  `oneOf` parameter `Раздел` rendered as a text input without select options.
- GREEN targeted frontend report UI test passed:
  `pnpm -C frontend exec vitest run src/App.test.tsx --testNamePattern "manages report templates"`.
- Format check passed:
  `powershell -ExecutionPolicy Bypass -File scripts/format.ps1 -Check`.
- Full local project check passed:
  `powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote`
  with backend pytest `80 passed, 138 skipped`, frontend unit tests
  `31 passed`, frontend build, and project tree check.
- Frontend Playwright E2E passed:
  `pnpm -C frontend e2e` with `3 passed`.
- Deployed commit `01defa7` to the configured server checkout with
  `scripts/deploy.ps1`.
- Deployed frontend dist with `scripts/deploy-frontend.ps1`; same-origin
  frontend/API smoke passed after backend service restart.
- `powershell -ExecutionPolicy Bypass -File scripts/server-check.ps1` passed
  after deployment.
- Server smoke confirmed `server_head=01defa7`, Alembic remained
  `0014_report_pdf_output (head)`, `GET /api/v1/health` returned
  `{"status":"ok","service":"reg_engine"}`, and the SPA shell served
  `/assets/index-DjQ3ZAQi.js` with `/assets/index-bNU_0_Xh.css`.

Production migration checkpoint:

- Not required for Phase 4N; no backend schema changes are included.

### Phase 4O: Report Run Default Parameter Payload

Status: completed.

Purpose: close a report-polish bug where the Russian run form displayed
template default parameters but generated a report with `parameters=null` when
the manual run parameter JSON field was left empty.

Scope:

- Use the selected report template `default_parameters_json` as the report run
  payload when `Параметры запуска JSON` is empty.
- Preserve manual run JSON override behavior when that field is non-empty.
- Preserve existing visual parameter controls, enum/`oneOf` labels, output
  format selection, archive controls, downloads, and report metadata display.
- Do not add backend code, migrations, models, endpoints, report formats,
  scheduled reports, charts, public-link report workflows, binary
  attachment/document report export, full visual report builder, or MCP write
  tools.

Acceptance criteria:

- A selected report template with `default_parameters_json` generates a report
  run with those default parameters when manual run JSON is empty.
- Non-empty manual run JSON still overrides template defaults.
- Invalid non-empty manual run JSON still uses the existing validation error
  path.
- Existing report create/edit/generate/download/archive behavior remains
  intact.
- README, PLANS, and project tree are updated or checked.

Known limitations:

- This phase only fixes the payload fallback semantics. It does not add nested
  schema controls, schema validation UI, report scheduling, charts,
  public-link report workflows, binary attachment/document report export, a
  full visual report builder, or MCP write tools.
- Backend remains the API/security boundary; frontend default fallback is a
  usability consistency layer over existing report template fields.

Verification so far:

- RED frontend report UI test failed before implementation because the
  generated report run POST body did not include template default parameters
  when the manual JSON field was empty.
- GREEN targeted default-parameter frontend test passed:
  `pnpm -C frontend exec vitest run src/App.test.tsx --testNamePattern "uses report template default parameters"`.
- Existing report management targeted frontend test passed:
  `pnpm -C frontend exec vitest run src/App.test.tsx --testNamePattern "manages report templates"`.
- Format check passed:
  `powershell -ExecutionPolicy Bypass -File scripts/format.ps1 -Check`.
- Full local project check passed:
  `powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote`
  with backend pytest `80 passed, 138 skipped`, frontend unit tests
  `32 passed`, frontend build, and project tree check.
- Frontend Playwright E2E passed:
  `pnpm -C frontend e2e` with `3 passed`.
- Deployed commit `c771562` to the configured server checkout with
  `scripts/deploy.ps1`.
- Deployed frontend dist with `scripts/deploy-frontend.ps1`; same-origin
  frontend/API smoke passed after backend service restart.
- `powershell -ExecutionPolicy Bypass -File scripts/server-check.ps1` passed
  after deployment.
- Server smoke confirmed `server_head=c771562`, Alembic remained
  `0014_report_pdf_output (head)`, `GET /api/v1/health` returned
  `{"status":"ok","service":"reg_engine"}`, and the SPA shell served
  `/assets/index-Dlmu-q_H.js` with `/assets/index-bNU_0_Xh.css`.

Production migration checkpoint:

- Not required for Phase 4O; no backend schema changes are included.

### Phase 4P: Report Run Date Parameter Controls

Status: completed.

Purpose: continue the report-polish sequence by rendering JSON Schema
`format: "date"` string parameters as native date inputs in the Russian report
run form.

Scope:

- Detect flat `parameters_schema_json.properties.<code>` entries with
  `type: "string"` and `format: "date"`.
- Render those parameters as `input type="date"` while keeping ordinary
  strings as text inputs.
- Preserve string date values in the existing report run `parameters` JSON
  payload.
- Preserve existing number, integer, boolean, enum, `oneOf` label, default
  payload, output format, archive, download, and metadata display behavior.
- Do not add backend code, migrations, models, endpoints, report formats,
  scheduled reports, charts, public-link report workflows, binary
  attachment/document report export, full visual report builder, or MCP write
  tools.

Acceptance criteria:

- A report template parameter with `type: "string"` and `format: "date"`
  renders as a native date input in the Russian UI.
- The date input is prefilled from `default_parameters_json` when available.
- Changing the date input updates the report generation payload with the date
  string.
- Existing report create/edit/generate/download/archive behavior remains
  intact.
- README, PLANS, and project tree are updated or checked.

Known limitations:

- Only flat string properties with `format: "date"` are rendered as date
  inputs. `date-time`, ranges, validation constraints, nested schemas,
  arrays, grouped controls, and a full visual report builder remain deferred.
- Backend remains the API/security boundary; frontend date rendering is only a
  usability layer over existing report template fields.

Verification so far:

- RED frontend report UI test failed before implementation because a
  `format: "date"` report parameter rendered as `type="text"`.
- GREEN targeted date-parameter frontend test passed:
  `pnpm -C frontend exec vitest run src/App.test.tsx --testNamePattern "renders date report parameters"`.
- Existing report management targeted frontend test passed:
  `pnpm -C frontend exec vitest run src/App.test.tsx --testNamePattern "manages report templates"`.
- Existing default-parameter targeted frontend test passed:
  `pnpm -C frontend exec vitest run src/App.test.tsx --testNamePattern "uses report template default parameters"`.
- Format check passed:
  `powershell -ExecutionPolicy Bypass -File scripts/format.ps1 -Check`.
- Full local project check passed:
  `powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote`
  with backend pytest `80 passed, 138 skipped`, frontend unit tests
  `33 passed`, frontend build, and project tree check.
- Frontend Playwright E2E passed:
  `pnpm -C frontend e2e` with `3 passed`.
- Deployed commit `a145e11` to the configured server checkout with
  `scripts/deploy.ps1`.
- Deployed frontend dist with `scripts/deploy-frontend.ps1`; same-origin
  frontend/API smoke passed after backend service restart.
- `powershell -ExecutionPolicy Bypass -File scripts/server-check.ps1` passed
  after deployment.
- Server smoke confirmed `server_head=a145e11`, Alembic remained
  `0014_report_pdf_output (head)`, `GET /api/v1/health` returned
  `{"status":"ok","service":"reg_engine"}`, and the SPA shell served
  `/assets/index-D1h_Y_y-.js` with `/assets/index-bNU_0_Xh.css`.

Production migration checkpoint:

- Not required for Phase 4P; no backend schema changes are included.

### Phase 4Q: Report Run Parameter Description Hints

Status: completed.

Purpose: continue report-polish by showing JSON Schema property descriptions as
Russian-first hints under visual report run parameter controls.

Scope:

- Detect flat `parameters_schema_json.properties.<code>.description` values.
- Render non-empty string descriptions as small hints under the matching
  parameter control.
- Preserve accessible field labels with explicit `aria-label`.
- Preserve existing number, integer, boolean, enum, `oneOf`, date, default
  payload, output format, archive, download, and metadata display behavior.
- Do not add backend code, migrations, models, endpoints, report formats,
  scheduled reports, charts, public-link report workflows, binary
  attachment/document report export, full visual report builder, or MCP write
  tools.

Acceptance criteria:

- A report template parameter with a JSON Schema `description` shows that text
  under the visual control.
- The field remains findable and usable by its visible title/label.
- Existing report create/edit/generate/download/archive behavior remains
  intact.
- README, PLANS, and project tree are updated or checked.

Known limitations:

- Only flat property descriptions are rendered.
- No markdown rendering, i18n transformation, validation text, nested schema
  help, grouped controls, or full visual report builder is included.
- Backend remains the API/security boundary; description hints are a usability
  layer over existing report template fields.

Verification so far:

- RED frontend report UI test failed before implementation because the schema
  description text was not rendered in the DOM.
- GREEN targeted description frontend test passed:
  `pnpm -C frontend exec vitest run src/App.test.tsx --testNamePattern "renders report parameter descriptions"`.
- Existing date-parameter targeted frontend test passed:
  `pnpm -C frontend exec vitest run src/App.test.tsx --testNamePattern "renders date report parameters"`.
- Existing report management targeted frontend test passed:
  `pnpm -C frontend exec vitest run src/App.test.tsx --testNamePattern "manages report templates"`.
- Format check passed:
  `powershell -ExecutionPolicy Bypass -File scripts/format.ps1 -Check`.
- Full local project check passed:
  `powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote`
  with backend pytest `80 passed, 138 skipped`, frontend unit tests
  `34 passed`, frontend build, and project tree check.
- Frontend Playwright E2E passed:
  `pnpm -C frontend e2e` with `3 passed`.
- Deployed commit `c9d94fa` to the configured server checkout with
  `scripts/deploy.ps1`.
- Deployed frontend dist with `scripts/deploy-frontend.ps1`; same-origin
  frontend/API smoke passed after backend service restart.
- `powershell -ExecutionPolicy Bypass -File scripts/server-check.ps1` passed
  after deployment.
- Server smoke confirmed `server_head=c9d94fa`, Alembic remained
  `0014_report_pdf_output (head)`, `GET /api/v1/health` returned
  `{"status":"ok","service":"reg_engine"}`, and the SPA shell served
  `/assets/index-B_gnEMz2.js` with `/assets/index-Be0bM7I8.css`.

Production migration checkpoint:

- Not required for Phase 4Q; no backend schema changes are included.

### Phase 4R: Report Run Schema Default Parameters

Status: completed.

Purpose: continue report-polish by using JSON Schema property defaults as the
initial run parameter payload when a template does not provide explicit default
parameter JSON.

Scope:

- Detect flat `parameters_schema_json.properties.<code>.default` values for
  supported scalar parameter types.
- Use schema defaults to prefill visual report run controls.
- Merge schema defaults with `default_parameters_json`, with explicit template
  defaults taking precedence for the same parameter code.
- Send the merged defaults in the existing report run `parameters` payload when
  the manual run parameter JSON field is empty.
- Ignore unsupported default values and defaults outside the declared scalar
  enum/`oneOf` options.
- Preserve existing manual JSON override, number, integer, boolean, enum,
  `oneOf`, date, description, output format, archive, download, and metadata
  display behavior.
- Do not add backend code, migrations, models, endpoints, report formats,
  scheduled reports, charts, public-link report workflows, binary
  attachment/document report export, full visual report builder, or MCP write
  tools.

Acceptance criteria:

- A report template parameter with a scalar JSON Schema `default` is prefilled
  in the visual control when template `default_parameters_json` is empty.
- Empty manual run JSON submits schema defaults in the report run payload.
- Template `default_parameters_json` remains the higher-priority default source
  when it provides the same parameter code.
- Existing report create/edit/generate/download/archive behavior remains
  intact.
- README, PLANS, and project tree are updated or checked.

Known limitations:

- Only flat scalar defaults for `string`, `number`, `integer`, and `boolean`
  properties are used.
- Object, array, nested schema, conditional schema, validation error display,
  grouped controls, and full visual report builder behavior remain deferred.
- Backend remains the API/security boundary; schema defaults are a frontend
  usability layer over existing report template fields.

Verification so far:

- RED frontend report UI test failed before implementation because schema
  defaults were not used to prefill report run controls.
- GREEN targeted schema-default frontend test passed:
  `pnpm -C frontend exec vitest run src/App.test.tsx --testNamePattern "uses report parameter schema defaults"`.
- Existing template-default targeted frontend test passed:
  `pnpm -C frontend exec vitest run src/App.test.tsx --testNamePattern "uses report template default parameters"`.
- Existing date-parameter targeted frontend test passed:
  `pnpm -C frontend exec vitest run src/App.test.tsx --testNamePattern "renders date report parameters"`.
- Existing description targeted frontend test passed:
  `pnpm -C frontend exec vitest run src/App.test.tsx --testNamePattern "renders report parameter descriptions"`.
- Existing report management targeted frontend test passed:
  `pnpm -C frontend exec vitest run src/App.test.tsx --testNamePattern "manages report templates"`.
- Format check passed:
  `powershell -ExecutionPolicy Bypass -File scripts/format.ps1 -Check`.
- Full local project check passed:
  `powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote`
  with backend pytest `80 passed, 138 skipped`, frontend unit tests
  `35 passed`, frontend build, and project tree check.
- Frontend Playwright E2E passed:
  `pnpm -C frontend e2e` with `3 passed`.
- Deployed commit `1b23ffc` to the configured server checkout with
  `scripts/deploy.ps1`.
- Deployed frontend dist with `scripts/deploy-frontend.ps1`; same-origin
  frontend/API smoke passed after backend service restart.
- `powershell -ExecutionPolicy Bypass -File scripts/server-check.ps1` passed
  after deployment.
- Server smoke confirmed `server_head=1b23ffc`, Alembic remained
  `0014_report_pdf_output (head)`, `GET /api/v1/health` returned
  `{"status":"ok","service":"reg_engine"}`, and the SPA shell served
  `/assets/index-CPhHZgdq.js` with `/assets/index-Be0bM7I8.css`.

Production migration checkpoint:

- Not required for Phase 4R; no backend schema changes are included.

### Phase 4S: Report Run Required Parameter Validation

Status: completed and deployed.

Purpose: continue report-polish by honoring flat JSON Schema `required`
metadata in the Russian report run form before calling the existing report run
API.

Scope:

- Detect `parameters_schema_json.required` string entries for supported flat
  visual report parameters.
- Mark required visual controls with `aria-required`.
- Before report generation, validate the resolved run parameter payload from
  manual JSON or merged defaults.
- Treat `null`, `undefined`, and empty strings as missing; keep numeric `0` and
  boolean `false` valid.
- Show a Russian validation message listing missing parameter labels.
- Do not send the report run POST request when required parameters are missing.
- Preserve existing manual JSON override, schema defaults, template defaults,
  number, integer, boolean, enum, `oneOf`, date, description, output format,
  archive, download, and metadata display behavior.
- Do not add backend code, migrations, models, endpoints, report formats,
  scheduled reports, charts, public-link report workflows, binary
  attachment/document report export, full visual report builder, or MCP write
  tools.

Acceptance criteria:

- A required supported schema parameter with no value blocks report generation
  in the Russian UI.
- The validation message includes the visible parameter label.
- No report run POST is sent while required parameters are missing.
- Existing report create/edit/generate/download/archive behavior remains
  intact.
- README, PLANS, and project tree are updated or checked.

Known limitations:

- This is frontend validation only; backend remains the API/security boundary.
- Only flat visual parameters supported by the current report form are checked.
- No nested schema validation, `minLength`, `minimum`, `pattern`, conditional
  validation, arrays, objects, grouped controls, or full visual report builder
  behavior is included.

Verification so far:

- RED frontend report UI test failed before implementation because generation
  was not blocked for an empty required schema parameter.
- GREEN targeted required-parameter frontend test passed:
  `pnpm -C frontend exec vitest run src/App.test.tsx --testNamePattern "blocks report generation when required"`.
- Existing schema-default targeted frontend test passed:
  `pnpm -C frontend exec vitest run src/App.test.tsx --testNamePattern "uses report parameter schema defaults"`.
- Existing template-default targeted frontend test passed:
  `pnpm -C frontend exec vitest run src/App.test.tsx --testNamePattern "uses report template default parameters"`.
- Existing date-parameter targeted frontend test passed:
  `pnpm -C frontend exec vitest run src/App.test.tsx --testNamePattern "renders date report parameters"`.
- Existing report management targeted frontend test passed:
  `pnpm -C frontend exec vitest run src/App.test.tsx --testNamePattern "manages report templates"`.
- Local format check passed:
  `powershell -ExecutionPolicy Bypass -File scripts/format.ps1 -Check`.
- Local full check passed:
  `powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote`
  with backend `80 passed, 138 skipped`, frontend unit `36 passed`, frontend
  production build, and current project tree.
- Frontend e2e passed:
  `pnpm -C frontend e2e` with `3 passed`.
- Commit/push passed through the standard workflow:
  `powershell -ExecutionPolicy Bypass -File scripts/push-git.ps1 -Message "Add report required parameter validation"`
  created commit `a2a0ea0f900ac8d37df5b65515abf4acc2095c27` and pushed
  `main` to `origin/main`.
- Server deploy passed:
  `powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1`.
- Frontend deploy passed:
  `powershell -ExecutionPolicy Bypass -File scripts/deploy-frontend.ps1`;
  the server SPA now references `/assets/index-DQlO092U.js` and
  `/assets/index-Be0bM7I8.css`.
- Final server check passed:
  `powershell -ExecutionPolicy Bypass -File scripts/server-check.ps1`.
- Direct server smoke passed: server checkout `a2a0ea0`, Alembic
  `0014_report_pdf_output (head)`, and
  `curl http://127.0.0.1:8000/api/v1/health` returned
  `{"status":"ok","service":"reg_engine"}`.

Production migration checkpoint:

- Not required for Phase 4S; no backend schema changes are included.

### Phase 4T: Report Run Scalar Constraint Validation

Status: completed and deployed.

Purpose: continue report-polish by honoring basic flat JSON Schema scalar
constraints in the Russian report run form before calling the existing report
run API.

Scope:

- Detect `minLength` and `maxLength` for supported flat string report
  parameters.
- Detect `minimum` and `maximum` for supported flat number/integer report
  parameters.
- Validate the resolved run parameter payload from manual JSON or merged
  defaults before report generation.
- Treat omitted optional values as allowed; required handling remains owned by
  Phase 4S.
- Show a Russian validation message listing the failing parameter labels and
  limits.
- Do not send the report run POST request when supported scalar constraints
  fail.
- Preserve existing manual JSON override, schema defaults, template defaults,
  required validation, number, integer, boolean, enum, `oneOf`, date,
  description, output format, archive, download, and metadata display
  behavior.
- Do not add backend code, migrations, models, endpoints, report formats,
  scheduled reports, charts, public-link report workflows, binary
  attachment/document report export, full visual report builder, or MCP write
  tools.

Acceptance criteria:

- A flat string report parameter shorter than `minLength` blocks generation in
  the Russian UI.
- A flat number/integer report parameter outside `minimum`/`maximum` blocks
  generation in the Russian UI.
- The validation message includes visible parameter labels and limit values.
- No report run POST is sent while supported scalar constraints fail.
- Existing report create/edit/generate/download/archive behavior remains
  intact.
- README, PLANS, and project tree are updated or checked.

Known limitations:

- This is frontend validation only; backend remains the API/security boundary.
- Only flat visual parameters supported by the current report form are checked.
- No nested schema validation, `pattern`, `exclusiveMinimum`,
  `exclusiveMaximum`, `multipleOf`, arrays, objects, grouped controls, or full
  visual report builder behavior is included.

Verification so far:

- RED frontend report UI test failed before implementation because generation
  was not blocked when an integer was below `minimum` and a string was shorter
  than `minLength`.
- GREEN targeted scalar-constraint frontend test passed:
  `pnpm -C frontend exec vitest run src/App.test.tsx --testNamePattern "blocks report generation when scalar schema constraints fail"`.
- Existing required-parameter targeted frontend test passed:
  `pnpm -C frontend exec vitest run src/App.test.tsx --testNamePattern "blocks report generation when required"`.
- Existing schema-default targeted frontend test passed:
  `pnpm -C frontend exec vitest run src/App.test.tsx --testNamePattern "uses report parameter schema defaults"`.
- Existing template-default targeted frontend test passed:
  `pnpm -C frontend exec vitest run src/App.test.tsx --testNamePattern "uses report template default parameters"`.
- Existing date-parameter targeted frontend test passed:
  `pnpm -C frontend exec vitest run src/App.test.tsx --testNamePattern "renders date report parameters"`.
- Existing report management targeted frontend test passed:
  `pnpm -C frontend exec vitest run src/App.test.tsx --testNamePattern "manages report templates"`.
- Local format check passed:
  `powershell -ExecutionPolicy Bypass -File scripts/format.ps1 -Check`.
- Local full check passed:
  `powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote`
  with backend `80 passed, 138 skipped`, frontend unit `37 passed`, frontend
  production build, and current project tree.
- Frontend e2e passed:
  `pnpm -C frontend e2e` with `3 passed`.
- Commit/push passed through the standard workflow:
  `powershell -ExecutionPolicy Bypass -File scripts/push-git.ps1 -Message "Add report scalar constraint validation"`
  created commit `9dc6e7b5dffc1987cd65dc10dbaba065c033d20b` and pushed
  `main` to `origin/main`.
- Server deploy passed:
  `powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1`.
- Frontend deploy passed:
  `powershell -ExecutionPolicy Bypass -File scripts/deploy-frontend.ps1`;
  the server SPA now references `/assets/index-Dutb14Jc.js` and
  `/assets/index-Be0bM7I8.css`.
- Final server check passed:
  `powershell -ExecutionPolicy Bypass -File scripts/server-check.ps1`.
- Direct server smoke passed: server checkout `9dc6e7b`, Alembic
  `0014_report_pdf_output (head)`, and
  `curl http://127.0.0.1:8000/api/v1/health` returned
  `{"status":"ok","service":"reg_engine"}`.

Production migration checkpoint:

- Not required for Phase 4T; no backend schema changes are included.

### Phase 4U: Report Run Pattern And Multiple Validation

Status: completed and deployed.

Purpose: continue report-polish by honoring additional flat JSON Schema scalar
constraints in the Russian report run form before calling the existing report
run API.

Scope:

- Detect `pattern` for supported flat string report parameters.
- Detect `multipleOf` for supported flat number/integer report parameters.
- Validate the resolved run parameter payload from manual JSON or merged
  defaults before report generation.
- Ignore invalid regex patterns instead of crashing the UI.
- Show a Russian validation message listing the failing parameter labels.
- Do not send the report run POST request when supported `pattern` or
  `multipleOf` constraints fail.
- Preserve existing manual JSON override, schema defaults, template defaults,
  required validation, scalar min/max validation, number, integer, boolean,
  enum, `oneOf`, date, description, output format, archive, download, and
  metadata display behavior.
- Do not add backend code, migrations, models, endpoints, report formats,
  scheduled reports, charts, public-link report workflows, binary
  attachment/document report export, full visual report builder, or MCP write
  tools.

Acceptance criteria:

- A flat string report parameter that does not match `pattern` blocks
  generation in the Russian UI.
- A flat number/integer report parameter that is not divisible by `multipleOf`
  blocks generation in the Russian UI.
- The validation message includes visible parameter labels.
- No report run POST is sent while supported `pattern` or `multipleOf`
  constraints fail.
- Existing report create/edit/generate/download/archive behavior remains
  intact.
- README, PLANS, and project tree are updated or checked.

Known limitations:

- This is frontend validation only; backend remains the API/security boundary.
- Only flat visual parameters supported by the current report form are checked.
- Invalid regex patterns are ignored by the UI and remain an operator/template
  configuration issue.
- No nested schema validation, `exclusiveMinimum`, `exclusiveMaximum`,
  conditional schema, arrays, objects, grouped controls, or full visual report
  builder behavior is included.

Verification so far:

- RED frontend report UI test failed before implementation because generation
  was not blocked when a string failed `pattern` and an integer failed
  `multipleOf`.
- GREEN targeted pattern/multiple frontend test passed:
  `pnpm -C frontend exec vitest run src/App.test.tsx --testNamePattern "blocks report generation when pattern or multipleOf constraints fail"`.
- Existing scalar-constraint targeted frontend test passed:
  `pnpm -C frontend exec vitest run src/App.test.tsx --testNamePattern "blocks report generation when scalar schema constraints fail"`.
- Existing required-parameter targeted frontend test passed:
  `pnpm -C frontend exec vitest run src/App.test.tsx --testNamePattern "blocks report generation when required"`.
- Existing schema-default targeted frontend test passed:
  `pnpm -C frontend exec vitest run src/App.test.tsx --testNamePattern "uses report parameter schema defaults"`.
- Existing date-parameter targeted frontend test passed:
  `pnpm -C frontend exec vitest run src/App.test.tsx --testNamePattern "renders date report parameters"`.
- Existing report management targeted frontend test passed:
  `pnpm -C frontend exec vitest run src/App.test.tsx --testNamePattern "manages report templates"`.
- Local format check passed:
  `powershell -ExecutionPolicy Bypass -File scripts/format.ps1 -Check`.
- Local full check passed:
  `powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote`
  with backend `80 passed, 138 skipped`, frontend unit `38 passed`, frontend
  production build, and current project tree.
- Frontend e2e passed:
  `pnpm -C frontend e2e` with `3 passed` after clearing a stale local Vite
  process from an earlier failed e2e webServer start on port `5173`.
- Commit/push passed through the standard workflow:
  `powershell -ExecutionPolicy Bypass -File scripts/push-git.ps1 -Message "Add report pattern multiple validation"`
  created commit `7f4d676e559c0aad08057bcb8f48b8ea3114ea5c` and pushed
  `main` to `origin/main`.
- Server deploy passed:
  `powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1`.
- Frontend deploy passed:
  `powershell -ExecutionPolicy Bypass -File scripts/deploy-frontend.ps1`;
  the server SPA now references `/assets/index-VYoHv-du.js` and
  `/assets/index-Be0bM7I8.css`.
- Final server check passed:
  `powershell -ExecutionPolicy Bypass -File scripts/server-check.ps1`.
- Direct server smoke passed: server checkout `7f4d676`, Alembic
  `0014_report_pdf_output (head)`, and
  `curl http://127.0.0.1:8000/api/v1/health` returned
  `{"status":"ok","service":"reg_engine"}`.

Production migration checkpoint:

- Not required for Phase 4U; no backend schema changes are included.

### Phase 4V: Report Run Exclusive Bound Validation

Status: completed and deployed.

Purpose: continue report-polish by honoring flat JSON Schema exclusive numeric
bounds in the Russian report run form before calling the existing report run
API.

Scope:

- Detect numeric `exclusiveMinimum` for supported flat number/integer report
  parameters.
- Detect numeric `exclusiveMaximum` for supported flat number/integer report
  parameters.
- Validate the resolved run parameter payload from manual JSON or merged
  defaults before report generation.
- Show a Russian validation message listing the failing parameter labels and
  exclusive bound values.
- Do not send the report run POST request when supported exclusive bounds fail.
- Preserve existing manual JSON override, schema defaults, template defaults,
  required validation, scalar min/max validation, `pattern`, `multipleOf`,
  number, integer, boolean, enum, `oneOf`, date, description, output format,
  archive, download, and metadata display behavior.
- Do not add backend code, migrations, models, endpoints, report formats,
  scheduled reports, charts, public-link report workflows, binary
  attachment/document report export, full visual report builder, or MCP write
  tools.

Acceptance criteria:

- A flat number/integer report parameter equal to `exclusiveMinimum` blocks
  generation in the Russian UI.
- A flat number/integer report parameter equal to `exclusiveMaximum` blocks
  generation in the Russian UI.
- The validation message includes visible parameter labels and exclusive bound
  values.
- No report run POST is sent while supported exclusive bounds fail.
- Existing report create/edit/generate/download/archive behavior remains
  intact.
- README, PLANS, and project tree are updated or checked.

Known limitations:

- This is frontend validation only; backend remains the API/security boundary.
- Only flat visual parameters supported by the current report form are checked.
- Boolean JSON Schema draft-06 style `exclusiveMinimum=true` /
  `exclusiveMaximum=true` with separate inclusive bounds is not supported.
- No nested schema validation, conditional schema, arrays, objects, grouped
  controls, or full visual report builder behavior is included.

Verification so far:

- RED frontend report UI test failed before implementation because generation
  was not blocked when a number equaled `exclusiveMinimum` and another number
  equaled `exclusiveMaximum`.
- GREEN targeted exclusive-bound frontend test passed:
  `pnpm -C frontend exec vitest run src/App.test.tsx --testNamePattern "blocks report generation when exclusive numeric bounds fail"`.
- Neighboring report validation targeted frontend tests passed:
  `pnpm -C frontend exec vitest run src/App.test.tsx --testNamePattern "blocks report generation when (scalar schema constraints fail|pattern or multipleOf constraints fail|exclusive numeric bounds fail|required)|uses report parameter schema defaults|renders date report parameters|manages report templates"`
  with `7 passed`.
- Local format check passed:
  `powershell -ExecutionPolicy Bypass -File scripts/format.ps1 -Check`.
- Local full check passed:
  `powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote`
  with backend `80 passed, 138 skipped`, frontend unit `39 passed`, frontend
  production build, and current project tree.
- Frontend e2e passed:
  `pnpm -C frontend e2e` with `3 passed`.
- Commit/push passed through the standard workflow:
  `powershell -ExecutionPolicy Bypass -File scripts/push-git.ps1 -Message "Add report exclusive bound validation"`
  created commit `c333ad30609cd9bf28fc4567a56642a4e1f55dca` and pushed
  `main` to `origin/main`.
- Server deploy passed:
  `powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1`.
- Frontend deploy passed:
  `powershell -ExecutionPolicy Bypass -File scripts/deploy-frontend.ps1`;
  the server SPA now references `/assets/index-D6dl-Wmv.js` and
  `/assets/index-Be0bM7I8.css`.
- Final server check passed:
  `powershell -ExecutionPolicy Bypass -File scripts/server-check.ps1`.
- Direct server smoke passed: server checkout `c333ad3`, Alembic
  `0014_report_pdf_output (head)`, and
  `curl http://127.0.0.1:8000/api/v1/health` returned
  `{"status":"ok","service":"reg_engine"}`.

Production migration checkpoint:

- Not required for Phase 4V; no backend schema changes are included.

### Phase 4W: Cross-Cutting Bugfix And Stabilization

Status: completed and deployed.

Purpose: harden cross-cutting report correctness issues after Phase 4V before
starting MCP write tools, additional report polish, binary export, or other new
product capabilities.

Scope:

- Add backend/service validation for the flat report parameter schema subset
  already exposed by the Russian report UI: `required`, scalar `string`,
  `number`, `integer`, `boolean`, string `minLength` / `maxLength` /
  `pattern`, numeric `minimum` / `maximum` / `exclusiveMinimum` /
  `exclusiveMaximum` / `multipleOf`, `enum`, and `oneOf[].const`.
- Validate `parameters_schema_json` and `default_parameters_json` on report
  template create/update so unsupported or broken supported-schema structures
  fail at the API boundary instead of becoming broken UI state.
- Register generated report output storage writes for pending cleanup so a
  later SQLAlchemy transaction rollback removes the uncommitted report file.
- Keep report downloads on the existing bounded `read_bytes` behavior and
  document that real streaming is deferred until the storage abstraction exposes
  an open-file/streaming boundary.
- Keep binary attachment/document export, import/export expansion, report
  formats, public report workflows, full visual report builder polish, and MCP
  write tools out of this phase.

Acceptance criteria:

- Missing required report parameters are rejected through the REST/API path.
- Supported string constraints are rejected through the REST/API path.
- Supported numeric constraints are rejected through the REST/API path.
- `enum` and `oneOf[].const` values outside the allowed set are rejected.
- Report template create/update rejects invalid supported-schema structures and
  invalid default parameters.
- Report output storage is cleaned when report generation metadata is rolled
  back after the bytes are written.
- Existing JSON/CSV/XLSX/PDF report output tests continue to pass.
- README, PLANS, and project tree are updated or checked.

Known limitations:

- This is not a full JSON Schema engine; nested objects, arrays, conditional
  schema, grouped controls, and full visual report builder behavior remain
  deferred.
- Invalid regular expressions in stored report schemas are ignored for runtime
  parameter matching, matching the existing frontend tolerance.
- Report downloads still read the full authorized report object into memory
  through the storage abstraction; real streaming is deferred.
- No database schema change or Alembic migration is included.

Verification so far:

- RED PostgreSQL-backed report run test failed before implementation because
  the API accepted a missing required parameter and generated a report.
- RED PostgreSQL-backed rollback cleanup test failed before implementation
  because report output bytes remained after transaction rollback.
- RED PostgreSQL-backed template schema test failed before implementation
  because an invalid `parameters_schema_json` object was accepted.
- GREEN targeted PostgreSQL-backed Phase 4W tests passed with `3 passed`.
- Full PostgreSQL-backed report API suite passed with `13 passed`.
- Targeted report service/test lint and type checks passed:
  `ruff check backend/app/services/reports.py backend/tests/test_api_phase_4_reports.py`
  and `mypy backend/app/services/reports.py`.
- Local format check passed:
  `powershell -ExecutionPolicy Bypass -File scripts/format.ps1 -Check`.
- Local full check passed:
  `powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote`
  with backend `80 passed, 141 skipped`, frontend unit `39 passed`, frontend
  production build, and current project tree.
- Frontend e2e passed: `pnpm -C frontend e2e` with `3 passed`.
- Commit/push passed through the standard workflow:
  `powershell -ExecutionPolicy Bypass -File scripts/push-git.ps1 -Message "Harden report validation and storage cleanup"`
  created commit `fbe5232b` and pushed `main` to `origin/main`.
- Server deploy passed:
  `powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1`.
- Backend service restart passed:
  `powershell -ExecutionPolicy Bypass -File scripts/service.ps1 -Command restart`;
  post-restart healthcheck returned `{"status":"ok","service":"reg_engine"}`.
- Final server check passed:
  `powershell -ExecutionPolicy Bypass -File scripts/server-check.ps1`.
- Server PostgreSQL-backed report API suite passed against disposable
  `reg_engine_test` with `13 passed`.
- Direct server smoke passed: server checkout `fbe5232b`, Alembic
  `0014_report_pdf_output (head)`, and
  `curl http://127.0.0.1:8000/api/v1/health` returned
  `{"status":"ok","service":"reg_engine"}`.

Production migration checkpoint:

- Not required for Phase 4W; no backend schema changes are included and
  production Alembic remains at `0014_report_pdf_output (head)`.

### Phase 5: MCP Over API Only

Purpose: add MCP after API, auth, RBAC, audit, import/export, and document boundaries are stable.

Status: in progress.

Planned overall scope:

- Read-only MCP tools first.
- MCP calls API only.
- No direct DB access.
- Audit source `mcp`.
- Write tools only after explicit approval.

### Phase 5A: MCP Read-Only Gateway

Status: completed.

Purpose: add a first read-only MCP gateway that uses the existing REST API as
the only business-logic boundary.

Completed local scope:

- Added `app.mcp` package with a JSON-RPC stdio handler.
- Added REST API client that uses HTTP `GET` only for MCP tools.
- Added `X-Reg-Engine-Source: mcp` to MCP API requests.
- Added request metadata and audit service support for user audit events with
  `source=mcp`.
- Added migration `0011_mcp_audit_source` to allow `audit_events.source='mcp'`.
- Added `reg-engine-mcp` console script and `scripts/dev-mcp.ps1`.
- Added read-only tools:
  `reg_engine_health`, `reg_engine_list_organizations`,
  `reg_engine_list_registries`, `reg_engine_read_registry_schema`,
  `reg_engine_list_cards`, `reg_engine_read_card`,
  `reg_engine_list_audit_events`, `reg_engine_list_report_templates`,
  `reg_engine_list_report_runs`, and `reg_engine_read_report_run`.
- Added guardrail tests proving MCP code does not import SQLAlchemy, Alembic,
  database sessions, backend models, or backend service classes.

Verification so far:

- RED tests failed before implementation for missing MCP package, missing
  `mcp` audit source, and missing migration.
- Phase 5A targeted tests passed locally.
- Backend pytest passed locally with `69 passed, 130 skipped`.
- `ruff check` passed locally.
- `mypy app` passed locally.
- Disposable PostgreSQL database `reg_engine_phase5a_test` passed clean
  `alembic upgrade head` through `0011_mcp_audit_source`.
- PostgreSQL-backed Phase 5A targeted tests passed on the same disposable
  database.
- Full `scripts/check.ps1 -SkipRemote` passed with backend pytest
  `69 passed, 130 skipped`, frontend unit tests `29 passed`, frontend build,
  and project tree check.
- `pnpm -C frontend e2e` passed with `3 passed`.
- Local MCP stdio sanity passed with `python -m app.mcp.server` for
  `initialize` and `tools/list`.
- Deployed commit `424c81c` to the configured server checkout.
- Production PostgreSQL was migrated from `0010_reports` to
  `0011_mcp_audit_source` after a fresh server-side backup outside Git,
  preflight checks, disposable PostgreSQL verification, Alembic upgrade, and
  post-checks.
- Post-checks verified Alembic current `0011_mcp_audit_source (head)` and
  `ck_audit_events_source` containing `mcp`.
- Backend service was restarted; healthcheck returned `ok`,
  `scripts/server-check.ps1` passed, live MCP stdio sanity returned
  `initialize`, `tools/list`, and `reg_engine_health`, and installed console
  script `reg-engine-mcp` responded to `initialize`.

Production migration checkpoint:

- Completed for `0011_mcp_audit_source`.

Known limitations:

- No MCP write tools.
- No direct MCP database access.
- No MCP-side RBAC shortcuts; all permissions remain API-enforced.
- No public-link MCP workflows.
- No binary attachment/generated-document download tools.
- No standalone MCP auth model; Phase 5A uses an existing API bearer token.
- The stdio gateway is a minimal JSON-RPC handler; packaged MCP SDK adoption
  can be considered later if needed.

### Phase 5B: MCP Hardening And Config

Status: completed.

Purpose: harden the Phase 5A read-only MCP gateway before considering any
write tools, report UI, non-JSON reports, or XLSX workflows.

Scope:

- Keep MCP read-only and API-only.
- Keep all MCP API calls as HTTP `GET`.
- Validate `REG_ENGINE_API_BASE_URL` as an absolute `http://` or `https://`
  URL before sending requests.
- Return JSON-RPC parse error `-32700` for malformed stdio input and continue
  serving the next message.
- Return JSON-RPC invalid params error `-32602` for malformed `tools/call`
  request params.
- Return missing/invalid tool arguments as MCP tool results with
  `isError=true` instead of crashing the JSON-RPC handler.
- Keep guardrail coverage proving MCP code does not import SQLAlchemy,
  Alembic, database sessions, backend models, or backend services.

Acceptance criteria:

- Malformed stdio JSON does not terminate `python -m app.mcp.server`.
- Invalid `tools/call` params return `-32602`, not internal error `-32603`.
- Tool argument errors return `isError=true` tool results.
- Non-http(s) API base URLs are rejected early.
- No migrations, models, services, REST endpoints, frontend, direct DB access,
  public-link workflows, binary downloads, standalone MCP auth, or write tools
  are added.

Verification so far:

- RED tests failed locally before implementation for non-http(s) API base URLs,
  uncaught tool argument errors, invalid params returning `-32603`, and
  malformed stdio JSON terminating the server loop.
- GREEN targeted tests passed locally with
  `backend/.venv/Scripts/python.exe -m pytest tests/test_mcp_phase_5.py -q`.
- Targeted `ruff check`, `ruff format --check`, and `mypy app/mcp` passed.
- Full backend pytest passed locally with `77 passed, 130 skipped`.
- `ruff check .`, `ruff format --check .`, and `mypy app` passed locally.
- `scripts/check.ps1 -SkipRemote` passed with backend pytest, frontend lint,
  frontend typecheck, frontend unit tests, frontend build, and project-map
  check.
- `pnpm -C frontend e2e` passed with `3 passed`.
- Local MCP stdio smoke passed for malformed JSON followed by `initialize`.
- Deployed commit `4e17290` to the configured server checkout.
- Server checks passed after deploy.
- Server MCP stdio sanity passed for malformed JSON, `initialize`, and
  `reg_engine_health`.
- Production Alembic remained at `0011_mcp_audit_source (head)`; no production
  migration was required.

Production migration checkpoint:

- Not required for Phase 5B.

Known limitations:

- Still no MCP write tools.
- Still no standalone MCP auth model; MCP uses an existing API bearer token.
- Still no MCP-side permission shortcuts; API remains the authorization
  boundary.
- Still no public-link MCP workflows.
- Still no binary attachment/generated-document download tools.

### Phase 5C: MCP Mutation Client Foundation

Status: completed and deployed.

Purpose: prepare the MCP gateway for future explicitly approved write tools by
adding mutation-capable REST client primitives while keeping the published MCP
tool surface read-only.

Scope:

- Add JSON `POST`, `PATCH`, and `DELETE` methods to the MCP REST API client.
- Preserve bearer-token auth, `Accept: application/json`, `User-Agent`, and
  `X-Reg-Engine-Source: mcp` headers on mutation requests.
- Send `Content-Type: application/json` only for requests with JSON bodies.
- Reuse the existing API error handling path for unsafe HTTP methods.
- Keep `MCP_TOOL_DEFINITIONS` read-only and do not expose any write tools yet.
- Keep MCP API-only: no SQLAlchemy, Alembic, DB sessions, backend models,
  backend services, storage backends, public-link workflows, binary downloads,
  standalone MCP auth, frontend UI, or database migrations.

Acceptance criteria:

- The MCP API client can issue JSON `POST`, `PATCH`, and `DELETE` requests
  through its transport.
- Mutation requests include the same bearer auth and MCP source headers as
  read-only requests.
- JSON body requests include `Content-Type: application/json`; bodyless DELETE
  requests do not.
- Existing read-only MCP tools remain listed with `readOnlyHint=true`.
- Existing MCP JSON-RPC hardening behavior remains intact.

Known limitations:

- This phase does not add MCP write tools.
- Future MCP write tool phases must explicitly name the tool set, argument
  schemas, confirmation requirements for destructive actions, API endpoints,
  audit expectations, and PostgreSQL-backed validation strategy.

Verification so far:

- RED targeted test failed before implementation because `RegEngineApiClient`
  had no `post_json` method.
- GREEN targeted mutation client test passed.
- Full MCP Phase 5 test file passed locally with `15 passed`.
- Targeted `ruff check` and `mypy app/mcp` passed locally.
- Local full check passed:
  `powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote`
  with backend `81 passed, 141 skipped`, frontend unit `39 passed`, frontend
  production build, and current project tree.
- Frontend e2e passed: `pnpm -C frontend e2e` with `3 passed`.
- Commit/push passed through the standard workflow:
  `powershell -ExecutionPolicy Bypass -File scripts/push-git.ps1 -Message "Add MCP mutation client foundation"`
  created commit `c01e0880` and pushed `main` to `origin/main`.
- Server deploy passed:
  `powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1`.
- Server MCP Phase 5 tests passed with `15 passed`.
- Server MCP stdio sanity passed for `initialize` and `reg_engine_health`.
- Direct server smoke passed: server checkout `c01e0880`, Alembic
  `0014_report_pdf_output (head)`, and
  `curl http://127.0.0.1:8000/api/v1/health` returned
  `{"status":"ok","service":"reg_engine"}`.

Production migration checkpoint:

- Not required for Phase 5C; no backend schema changes are included and
  production Alembic remains at `0014_report_pdf_output (head)`.

### Phase 5D: MCP Registry Create Write Tool

Status: completed and deployed.

Purpose: add the first narrow MCP write tool using the existing API-only MCP
boundary, starting with non-destructive registry creation.

Tool set:

- `reg_engine_create_registry`

Argument schema:

- `code`: required string.
- `name`: required string.
- `description`: optional string.
- `additionalProperties=false`.

API endpoint:

- `POST /api/v1/registries`

Security and audit decisions:

- The MCP tool calls only the REST API through `RegEngineApiClient.post_json`.
- System-admin permission checks remain in
  `RegistrySchemaService.create_registry_for_actor`.
- Registry create audit remains API-side with `audit_events.source=mcp` through
  the existing `X-Reg-Engine-Source: mcp` request header.
- This create action is non-destructive, so no separate destructive-action
  confirmation argument is required in this phase.

Scope:

- Expose `reg_engine_create_registry` in `MCP_TOOL_DEFINITIONS` with
  `readOnlyHint=false`.
- Preserve all existing read-only tools with `readOnlyHint=true`.
- Reuse existing argument validation helpers and MCP tool-error behavior.
- Do not add registry update/archive, schema mutation, card mutation, import,
  document, report, public-link, binary download, or destructive MCP tools.
- Do not add direct database access, SQLAlchemy/Alembic imports, backend model
  imports, backend service imports, standalone MCP auth, frontend UI, database
  schema changes, or Alembic migrations.

Acceptance criteria:

- `tools/list` includes `reg_engine_create_registry` as a write tool.
- Calling `reg_engine_create_registry` sends `POST /api/v1/registries` with
  `code`, `name`, and optional `description`.
- The request includes bearer auth and `X-Reg-Engine-Source: mcp` through the
  existing MCP API client.
- Existing read-only tools remain read-only.
- Existing MCP JSON-RPC hardening behavior remains intact.
- MCP package guardrails continue proving no direct DB/model/service imports.

Known limitations:

- Only registry creation is exposed as an MCP write tool.
- Registry update/archive and other mutations remain future explicit phases.
- Production live smoke must avoid creating throwaway production registries
  unless a disposable production-safe target is explicitly approved.

Verification so far:

- RED targeted test failed before implementation because
  `reg_engine_create_registry` was absent from `MCP_TOOL_DEFINITIONS`.
- GREEN targeted create-registry MCP tool test passed.
- Full MCP Phase 5 test file passed locally with `16 passed`.
- Targeted `ruff check` and `mypy app/mcp` passed locally.
- Local full check passed:
  `powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote`
  with backend `82 passed, 141 skipped`, frontend unit `39 passed`, frontend
  production build, and current project tree.
- Frontend e2e passed: `pnpm -C frontend e2e` with `3 passed`.
- Commit/push passed through the standard workflow:
  `powershell -ExecutionPolicy Bypass -File scripts/push-git.ps1 -Message "Add MCP registry create tool"`
  created commit `115947c0` and pushed `main` to `origin/main`.
- Server deploy passed:
  `powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1`.
- Server MCP Phase 5 tests passed with `16 passed`.
- Server MCP stdio sanity passed for `initialize`, `tools/list`, and
  `reg_engine_health`; `tools/list` includes `reg_engine_create_registry` with
  `readOnlyHint=false`.
- Direct server smoke passed: server checkout `115947c0`, Alembic
  `0014_report_pdf_output (head)`, and
  `curl http://127.0.0.1:8000/api/v1/health` returned
  `{"status":"ok","service":"reg_engine"}`.

Production migration checkpoint:

- Not required for Phase 5D; no backend schema changes are included and
  production Alembic remains at `0014_report_pdf_output (head)`.

### Phase 5E: MCP Registry Update And Archive Write Tools

Status: completed and deployed.

Purpose: extend the narrow API-only MCP registry write surface with registry
settings update and guarded archive.

Tool set:

- `reg_engine_update_registry`
- `reg_engine_archive_registry`

Argument schemas:

- `reg_engine_update_registry`:
  - `registry_id`: required string.
  - `name`: optional string.
  - `description`: optional string.
  - `lifecycle_status`: optional string, passed to the existing API.
  - `additionalProperties=false`.
- `reg_engine_archive_registry`:
  - `registry_id`: required string.
  - `confirm_archive`: required boolean and must be `true`.
  - `additionalProperties=false`.

API endpoints:

- `PATCH /api/v1/registries/{registry_id}`
- `DELETE /api/v1/registries/{registry_id}`

Security and audit decisions:

- MCP tools call only the REST API through `RegEngineApiClient`.
- Registry update/archive permission checks remain in the existing backend
  registry schema service.
- Registry update/archive audit remains API-side with `audit_events.source=mcp`
  through the existing `X-Reg-Engine-Source: mcp` request header.
- Registry archive is destructive in user workflow terms, even though the
  backend uses archive semantics instead of physical delete; therefore
  `confirm_archive=true` is required before the MCP tool sends `DELETE`.

Scope:

- Expose the two tools with `readOnlyHint=false`.
- Preserve existing read-only tools and `reg_engine_create_registry` behavior.
- Reject archive calls unless `confirm_archive=true`.
- Reject update calls with no update fields before sending a request.
- Do not add schema mutation, card mutation, import, document, report,
  public-link, binary download, or other MCP tools in this phase.
- Do not add direct database access, SQLAlchemy/Alembic imports, backend model
  imports, backend service imports, standalone MCP auth, frontend UI, database
  schema changes, or Alembic migrations.

Acceptance criteria:

- `tools/list` includes both new tools as write tools.
- `reg_engine_update_registry` sends `PATCH /api/v1/registries/{registry_id}`
  with only provided update fields.
- `reg_engine_archive_registry` sends `DELETE /api/v1/registries/{registry_id}`
  only when `confirm_archive=true`.
- Archive without confirmation returns an MCP tool error and sends no HTTP
  request.
- Existing MCP JSON-RPC hardening behavior remains intact.
- MCP package guardrails continue proving no direct DB/model/service imports.

Known limitations:

- Production live smoke must not archive or mutate real production registries
  without a disposable production-safe target.
- Schema/card/report/document/public-link MCP write tools remain future phases.

Verification so far:

- RED targeted tests failed before implementation because
  `reg_engine_update_registry` and `reg_engine_archive_registry` were absent
  from `MCP_TOOL_DEFINITIONS`.
- GREEN targeted update/archive MCP tool tests passed.
- Full MCP Phase 5 test file passed locally with `18 passed`.
- Targeted `ruff check` and `mypy app/mcp` passed locally.
- Local full check passed:
  `powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote`
  with backend `84 passed, 141 skipped`, frontend unit `39 passed`, frontend
  production build, and current project tree.
- Frontend e2e passed: `pnpm -C frontend e2e` with `3 passed`.
- Commit/push passed through the standard workflow:
  `powershell -ExecutionPolicy Bypass -File scripts/push-git.ps1 -Message "Add MCP registry update archive tools"`
  created commit `727e1688` and pushed `main` to `origin/main`.
- Server deploy passed:
  `powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1`.
- Server MCP Phase 5 tests passed with `18 passed`.
- Server MCP stdio sanity passed for `initialize`, `tools/list`, and
  `reg_engine_health`; `tools/list` includes
  `reg_engine_update_registry` and `reg_engine_archive_registry` with
  `readOnlyHint=false`.
- Direct server smoke passed: server checkout `727e1688`, Alembic
  `0014_report_pdf_output (head)`, and
  `curl http://127.0.0.1:8000/api/v1/health` returned
  `{"status":"ok","service":"reg_engine"}`.

Production migration checkpoint:

- Not required for Phase 5E; no backend schema changes are included and
  production Alembic remains at `0014_report_pdf_output (head)`.

### Phase 5F: MCP Schema Builder Write Tools

Status: completed and deployed.

Purpose: extend the API-only MCP write surface with schema-builder operations
for form blocks and form fields while keeping all schema permissions,
validation, and audit in the existing REST API/service layer.

Tool set:

- `reg_engine_create_form_block`
- `reg_engine_update_form_block`
- `reg_engine_archive_form_block`
- `reg_engine_create_form_field`
- `reg_engine_update_form_field`
- `reg_engine_archive_form_field`

Argument schemas:

- `reg_engine_create_form_block`:
  - `registry_id`: required string.
  - `code`: required string.
  - `title`: required string.
  - `description`: optional string.
  - `position`: optional integer.
  - `is_repeatable`: optional boolean.
  - `public_visible`: optional boolean.
  - `public_editable`: optional boolean.
  - `additionalProperties=false`.
- `reg_engine_update_form_block`:
  - `block_id`: required string.
  - `title`: optional string.
  - `description`: optional string.
  - `position`: optional integer.
  - `additionalProperties=false`.
- `reg_engine_archive_form_block`:
  - `block_id`: required string.
  - `confirm_archive`: required boolean and must be `true`.
  - `additionalProperties=false`.
- `reg_engine_create_form_field`:
  - `block_id`: required string.
  - `code`: required string.
  - `label`: required string.
  - `field_type`: required string.
  - `description`: optional string.
  - `position`: optional integer.
  - `options_source_type`: optional string.
  - `options_source_id`: optional string.
  - `public_visible`: optional boolean.
  - `public_editable`: optional boolean.
  - `additionalProperties=false`.
- `reg_engine_update_form_field`:
  - `field_id`: required string.
  - `label`: optional string.
  - `description`: optional string.
  - `position`: optional integer.
  - `is_active`: optional boolean.
  - `additionalProperties=false`.
- `reg_engine_archive_form_field`:
  - `field_id`: required string.
  - `confirm_archive`: required boolean and must be `true`.
  - `additionalProperties=false`.

API endpoints:

- `POST /api/v1/registries/{registry_id}/blocks`
- `PATCH /api/v1/blocks/{block_id}`
- `DELETE /api/v1/blocks/{block_id}`
- `POST /api/v1/blocks/{block_id}/fields`
- `PATCH /api/v1/fields/{field_id}`
- `DELETE /api/v1/fields/{field_id}`

Security and audit decisions:

- MCP tools call only the REST API through `RegEngineApiClient`.
- Schema permissions remain API-side through existing
  `registry.schema.manage` checks.
- Schema validation, locked/system block and field protection, archive
  semantics, and audit remain in the existing backend service layer.
- Archive tools require explicit `confirm_archive=true` before sending DELETE.

Scope:

- Expose the six tools with `readOnlyHint=false`.
- Preserve existing read-only tools and Phase 5D/5E registry write behavior.
- Reject archive calls unless `confirm_archive=true`.
- Reject update calls with no update fields before sending a request.
- Do not add card mutation, import, document, report, public-link, binary
  download, or other MCP tools in this phase.
- Do not add direct database access, SQLAlchemy/Alembic imports, backend model
  imports, backend service imports, standalone MCP auth, frontend UI, database
  schema changes, or Alembic migrations.

Acceptance criteria:

- `tools/list` includes all six new tools as write tools.
- Create block and create field tools send POST requests with only provided
  optional fields added to required payloads.
- Update block and update field tools send PATCH requests with only provided
  update fields and reject empty update payloads.
- Archive block and archive field tools send DELETE requests only when
  `confirm_archive=true`.
- Archive without confirmation returns an MCP tool error and sends no HTTP
  request.
- Existing MCP JSON-RPC hardening behavior remains intact.
- MCP package guardrails continue proving no direct DB/model/service imports.

Known limitations:

- Production live smoke must not archive or mutate real production schema
  without a disposable production-safe target.
- Card/report/document/public-link MCP write tools remain future phases.

Verification so far:

- RED targeted tests failed before implementation because
  `reg_engine_create_form_block`, `reg_engine_update_form_block`,
  `reg_engine_archive_form_block`, `reg_engine_create_form_field`,
  `reg_engine_update_form_field`, and `reg_engine_archive_form_field` were
  absent from `MCP_TOOL_DEFINITIONS`.
- GREEN targeted schema-builder MCP tool tests passed.
- Full MCP Phase 5 test file passed locally with `22 passed`.
- Targeted `ruff check`, `ruff format --check`, and `mypy app/mcp` passed
  locally.
- Local full check passed:
  `powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote`
  with backend `88 passed, 141 skipped`, frontend unit `39 passed`, frontend
  production build, and current project tree.
- Frontend e2e passed: `pnpm -C frontend e2e` with `3 passed`.
- Commit/push passed through the standard workflow:
  `powershell -ExecutionPolicy Bypass -File scripts/push-git.ps1 -Message "Add MCP schema builder write tools"`
  created commit `e620b379` and pushed `main` to `origin/main`.
- Server deploy passed:
  `powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1`.
- Server MCP Phase 5 tests passed with `22 passed`.
- Server MCP stdio sanity passed for `initialize`, `tools/list`, and
  `reg_engine_health`; `tools/list` includes all six schema-builder write
  tools with `readOnlyHint=false`.
- Direct server smoke passed: server checkout `e620b379`, Alembic
  `0014_report_pdf_output (head)`, and
  `curl http://127.0.0.1:8000/api/v1/health` returned
  `{"status":"ok","service":"reg_engine"}`.

Production migration checkpoint:

- Not required for Phase 5F; no backend schema changes are included and
  production Alembic remains at `0014_report_pdf_output (head)`.

### Phase 5G: MCP Card Lifecycle Write Tools

Status: completed and deployed.

Purpose: extend the API-only MCP write surface with card lifecycle operations
while keeping card visibility, edit permissions, validation, archive semantics,
and audit in the existing REST API/service layer.

Tool set:

- `reg_engine_create_card`
- `reg_engine_update_card`
- `reg_engine_archive_card`

Argument schemas:

- `reg_engine_create_card`:
  - `registry_id`: required string.
  - `organization_id`: required string.
  - `display_name`: required string.
  - `org_unit_id`: optional string.
  - `public_view_enabled`: optional boolean.
  - `public_edit_enabled`: optional boolean.
  - `additionalProperties=false`.
- `reg_engine_update_card`:
  - `card_id`: required string.
  - `display_name`: optional string.
  - `public_view_enabled`: optional boolean.
  - `public_edit_enabled`: optional boolean.
  - `additionalProperties=false`.
- `reg_engine_archive_card`:
  - `card_id`: required string.
  - `confirm_archive`: required boolean and must be `true`.
  - `additionalProperties=false`.

API endpoints:

- `POST /api/v1/registries/{registry_id}/cards`
- `PATCH /api/v1/cards/{card_id}`
- `DELETE /api/v1/cards/{card_id}`

Security and audit decisions:

- MCP tools call only the REST API through `RegEngineApiClient`.
- Card create/update/archive permissions remain API-side through existing card
  service checks.
- Organization scope, descendant visibility, archived/superseded edit
  protection, and audit remain in the existing backend service layer.
- Archive requires explicit `confirm_archive=true` before sending DELETE.

Scope:

- Expose the three tools with `readOnlyHint=false`.
- Preserve existing read-only tools and Phase 5D/5E/5F write behavior.
- Reject archive calls unless `confirm_archive=true`.
- Reject update calls with no update fields before sending a request.
- Do not add field-value mutation, block-instance mutation, card transfer,
  import, document, report, public-link, binary download, or other MCP tools in
  this phase.
- Do not add direct database access, SQLAlchemy/Alembic imports, backend model
  imports, backend service imports, standalone MCP auth, frontend UI, database
  schema changes, or Alembic migrations.

Acceptance criteria:

- `tools/list` includes all three new tools as write tools.
- Create card sends `POST /api/v1/registries/{registry_id}/cards` with required
  values and only provided optional fields.
- Update card sends `PATCH /api/v1/cards/{card_id}` with only provided update
  fields and rejects empty update payloads.
- Archive card sends `DELETE /api/v1/cards/{card_id}` only when
  `confirm_archive=true`.
- Archive without confirmation returns an MCP tool error and sends no HTTP
  request.
- Existing MCP JSON-RPC hardening behavior remains intact.
- MCP package guardrails continue proving no direct DB/model/service imports.

Known limitations:

- Production live smoke must not archive or mutate real production cards
  without a disposable production-safe target.
- Field-value, block-instance, transfer, report, document, and public-link MCP
  write tools remain future phases.

Verification so far:

- RED targeted MCP Phase 5 tests failed before implementation because
  `reg_engine_create_card`, `reg_engine_update_card`, and
  `reg_engine_archive_card` were absent from `MCP_TOOL_DEFINITIONS`.
- GREEN targeted MCP Phase 5 tests passed locally with `25 passed`.
- Targeted `ruff check`, `ruff format --check`, and `mypy backend\app\mcp`
  passed locally.
- Local full check passed:
  `powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote`
  with backend `91 passed, 141 skipped`, frontend unit `39 passed`, frontend
  production build, and current project tree.
- Frontend e2e passed: `pnpm -C frontend e2e` with `3 passed`.
- Commit/push passed through the standard workflow:
  `powershell -ExecutionPolicy Bypass -File scripts/push-git.ps1 -Message "Add MCP card lifecycle write tools"`
  created commit `21b16009` and pushed `main` to `origin/main`.
- Server deploy passed:
  `powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1`.
- Server MCP Phase 5 tests passed.
- Server MCP stdio sanity passed for `initialize`, `tools/list`, and
  `reg_engine_health`; `tools/list` includes `reg_engine_create_card`,
  `reg_engine_update_card`, and `reg_engine_archive_card` with
  `readOnlyHint=false`.
- Direct server smoke passed: server checkout `21b16009`, Alembic
  `0014_report_pdf_output (head)`, and
  `curl http://127.0.0.1:8000/api/v1/health` returned
  `{"status":"ok","service":"reg_engine"}`.

Production migration checkpoint:

- Not required for Phase 5G; no backend schema changes are included and
  production Alembic remains at `0014_report_pdf_output (head)`.

### Phase 5H: MCP Card Field Value Write Tools

Status: completed and deployed.

Purpose: extend the API-only MCP write surface with card field-value updates
while keeping field validation, card edit permissions, archived/superseded edit
protection, repeatable-block instance rules, `file_ref` metadata rules, and
audit in the existing REST API/service layer.

Tool set:

- `reg_engine_set_card_field_value`
- `reg_engine_set_card_values`

Argument schemas:

- `reg_engine_set_card_field_value`:
  - `card_id`: required string.
  - `field_id`: required string.
  - `value`: required JSON value; may be `null`.
  - `block_instance_id`: optional string.
  - `additionalProperties=false`.
- `reg_engine_set_card_values`:
  - `card_id`: required string.
  - `values`: required non-empty array of objects.
  - each item has required `field_id`, required JSON `value`, optional
    `block_instance_id`, and `additionalProperties=false`.
  - `additionalProperties=false`.

API endpoints:

- `PATCH /api/v1/cards/{card_id}/fields/{field_id}`
- `PATCH /api/v1/cards/{card_id}/values`

Security and audit decisions:

- MCP tools call only the REST API through `RegEngineApiClient`.
- Field-value permissions, supported field-type validation, organization scope,
  repeatable-block instance checks, `file_ref` same-card attachment checks,
  public-link edit blocking, archived/superseded edit protection, and audit
  remain API-side in the existing card service.
- Bulk updates must use the existing atomic REST endpoint so partial validation
  failures do not persist any value.

Scope:

- Expose the two tools with `readOnlyHint=false`.
- Preserve existing read-only tools and Phase 5D/5E/5F/5G write behavior.
- Reject bulk calls with an empty `values` array before sending a request.
- Forward `value` as a JSON value without MCP-side schema-specific coercion.
- Do not upload files, download files, create attachments, create block
  instances, archive block instances, transfer cards, create/archive cards,
  mutate public links, generate documents, run reports, import/export data,
  expose binary downloads, or add other MCP tools in this phase.
- Do not add direct database access, SQLAlchemy/Alembic imports, backend model
  imports, backend service imports, standalone MCP auth, frontend UI, database
  schema changes, or Alembic migrations.

Acceptance criteria:

- `tools/list` includes both new tools as write tools.
- Single-value tool sends
  `PATCH /api/v1/cards/{card_id}/fields/{field_id}` with `value` and optional
  `block_instance_id`.
- Bulk-value tool sends `PATCH /api/v1/cards/{card_id}/values` with the
  existing `values: [{ field_id, value, block_instance_id }]` REST payload.
- Bulk calls with an empty `values` array return an MCP tool error and send no
  HTTP request.
- Existing MCP JSON-RPC hardening behavior remains intact.
- MCP package guardrails continue proving no direct DB/model/service imports.

Known limitations:

- Production live smoke must not mutate real production card values without a
  disposable production-safe target.
- Block-instance create/archive, card transfer, report/document/public-link,
  attachment upload/download, and import/export MCP write tools remain future
  phases.

Verification so far:

- RED targeted MCP Phase 5 tests failed before implementation because
  `reg_engine_set_card_field_value` and `reg_engine_set_card_values` were
  absent from `MCP_TOOL_DEFINITIONS`.
- GREEN targeted MCP Phase 5 tests passed locally with `27 passed`.
- Targeted `ruff check`, `ruff format --check`, and `mypy backend\app\mcp`
  passed locally.
- Local full check passed:
  `powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote`
  with backend `93 passed, 141 skipped`, frontend unit `39 passed`, frontend
  production build, and current project tree.
- Frontend e2e passed: `pnpm -C frontend e2e` with `3 passed`.
- Commit/push passed through the standard workflow:
  `powershell -ExecutionPolicy Bypass -File scripts/push-git.ps1 -Message "Add MCP card field value tools"`
  created commit `57a52bc0` and pushed `main` to `origin/main`.
- Server deploy passed:
  `powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1`.
- Server MCP Phase 5 tests passed with `27 passed`.
- Server MCP stdio sanity passed for `initialize`, `tools/list`, and
  `reg_engine_health`; `tools/list` includes
  `reg_engine_set_card_field_value` and `reg_engine_set_card_values` with
  `readOnlyHint=false`.
- Direct server smoke passed: server checkout `57a52bc0`, Alembic
  `0014_report_pdf_output (head)`, and
  `curl http://127.0.0.1:8000/api/v1/health` returned
  `{"status":"ok","service":"reg_engine"}`.

Production migration checkpoint:

- Not required for Phase 5H; no backend schema changes are included and
  production Alembic remains at `0014_report_pdf_output (head)`.

### Phase 5I: MCP Card Block Instance Write Tools

Status: completed and deployed.

Purpose: extend the API-only MCP write surface with card block-instance
operations while keeping repeatable/non-repeatable rules, locked/system block
protection, minimum-instance protection, card edit permissions, archived and
superseded edit protection, and audit in the existing REST API/service layer.

Tool set:

- `reg_engine_create_card_block_instance`
- `reg_engine_archive_card_block_instance`

Argument schemas:

- `reg_engine_create_card_block_instance`:
  - `card_id`: required string.
  - `block_id`: required string.
  - `additionalProperties=false`.
- `reg_engine_archive_card_block_instance`:
  - `block_instance_id`: required string.
  - `confirm_archive`: required boolean and must be `true`.
  - `additionalProperties=false`.

API endpoints:

- `POST /api/v1/cards/{card_id}/blocks/{block_id}/instances`
- `DELETE /api/v1/card-block-instances/{block_instance_id}`

Security and audit decisions:

- MCP tools call only the REST API through `RegEngineApiClient`.
- Repeatable block creation, non-repeatable block protection, locked/system
  block protection, required-minimum instance protection, card edit
  permissions, archived/superseded edit protection, and audit remain API-side
  in the existing card service.
- Archive requires explicit `confirm_archive=true` before sending `DELETE`.

Scope:

- Expose the two tools with `readOnlyHint=false`.
- Preserve existing read-only tools and Phase 5D/5E/5F/5G/5H write behavior.
- Reject archive calls unless `confirm_archive=true`.
- Do not mutate field values, transfer cards, mutate public links, upload or
  download attachments, generate documents, run reports, import/export data,
  expose binary downloads, or add other MCP tools in this phase.
- Do not add direct database access, SQLAlchemy/Alembic imports, backend model
  imports, backend service imports, standalone MCP auth, frontend UI, database
  schema changes, or Alembic migrations.

Acceptance criteria:

- `tools/list` includes both new tools as write tools.
- Create block instance sends
  `POST /api/v1/cards/{card_id}/blocks/{block_id}/instances`.
- Archive block instance sends
  `DELETE /api/v1/card-block-instances/{block_instance_id}` only when
  `confirm_archive=true`.
- Archive without confirmation returns an MCP tool error and sends no HTTP
  request.
- Existing MCP JSON-RPC hardening behavior remains intact.
- MCP package guardrails continue proving no direct DB/model/service imports.

Known limitations:

- Production live smoke must not create or archive production card block
  instances without a disposable production-safe target.
- Card transfer, report/document/public-link, attachment upload/download, and
  import/export MCP write tools remain future phases.

Verification so far:

- RED targeted MCP Phase 5 tests failed before implementation because
  `reg_engine_create_card_block_instance` and
  `reg_engine_archive_card_block_instance` were absent from
  `MCP_TOOL_DEFINITIONS`.
- GREEN targeted MCP Phase 5 tests passed locally with `29 passed`.
- Targeted `ruff check`, `ruff format --check`, and `mypy backend\app\mcp`
  passed locally.
- Local full check passed:
  `powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote`
  with backend `95 passed, 141 skipped`, frontend unit `39 passed`, frontend
  production build, and current project tree.
- Frontend e2e passed: `pnpm -C frontend e2e` with `3 passed`.
- Commit/push passed through the standard workflow:
  `powershell -ExecutionPolicy Bypass -File scripts/push-git.ps1 -Message "Add MCP card block instance tools"`
  created commit `f14a39b4` and pushed `main` to `origin/main`.
- Server deploy passed:
  `powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1`.
- Server MCP Phase 5 tests passed.
- Server MCP stdio sanity passed for `initialize`, `tools/list`, and
  `reg_engine_health`; `tools/list` includes
  `reg_engine_create_card_block_instance` and
  `reg_engine_archive_card_block_instance` with `readOnlyHint=false`.
- Direct server smoke passed: server checkout `f14a39b4`, Alembic
  `0014_report_pdf_output (head)`, and
  `curl http://127.0.0.1:8000/api/v1/health` returned
  `{"status":"ok","service":"reg_engine"}`.

Production migration checkpoint:

- Not required for Phase 5I; no backend schema changes are included and
  production Alembic remains at `0014_report_pdf_output (head)`.

### Phase 5J: MCP Card Transfer Write Tool

Status: completed and deployed.

Purpose: extend the API-only MCP write surface with the existing card transfer
workflow while keeping transfer permissions, source-card superseding,
target-card creation, copied dynamic values, `file_ref` transfer rules,
card relation creation, archive visibility, and audit in the existing REST
API/service layer.

Tool set:

- `reg_engine_transfer_card`

Argument schema:

- `card_id`: required string.
- `target_organization_id`: required string.
- `confirm_transfer`: required boolean and must be `true`.
- `additionalProperties=false`.

API endpoint:

- `POST /api/v1/cards/{card_id}/transfer`

Security and audit decisions:

- MCP tool calls only the REST API through `RegEngineApiClient`.
- Transfer permission checks, target organization visibility, superseded edit
  protection, dynamic value copy, `file_ref` copy/clear behavior, card
  relation creation, and audit remain API-side in the existing card service.
- Transfer creates a new card and changes the old card lifecycle to
  `superseded`, so MCP requires explicit `confirm_transfer=true` before
  sending the request.

Scope:

- Expose the tool with `readOnlyHint=false`.
- Preserve existing read-only tools and Phase 5D/5E/5F/5G/5H/5I write
  behavior.
- Reject calls unless `confirm_transfer=true`.
- Do not mutate field values directly, create/archive cards outside the
  transfer endpoint, mutate public links, upload or download attachments,
  generate documents, run reports, import/export data, expose binary downloads,
  or add other MCP tools in this phase.
- Do not add direct database access, SQLAlchemy/Alembic imports, backend model
  imports, backend service imports, standalone MCP auth, frontend UI, database
  schema changes, or Alembic migrations.

Acceptance criteria:

- `tools/list` includes `reg_engine_transfer_card` as a write tool.
- Transfer sends `POST /api/v1/cards/{card_id}/transfer` with
  `target_organization_id`.
- Transfer without confirmation returns an MCP tool error and sends no HTTP
  request.
- Existing MCP JSON-RPC hardening behavior remains intact.
- MCP package guardrails continue proving no direct DB/model/service imports.

Known limitations:

- Production live smoke must not transfer production cards without a
  disposable production-safe target.
- Report/document/public-link, attachment upload/download, and import/export
  MCP write tools remain future phases.

Verification so far:

- RED targeted MCP Phase 5 test failed before implementation because
  `reg_engine_transfer_card` was absent from `MCP_TOOL_DEFINITIONS`.
- GREEN targeted MCP Phase 5 tests passed locally with `30 passed`.
- Targeted `ruff check`, `ruff format --check`, and `mypy backend\app\mcp`
  passed locally.
- Local full check passed:
  `powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote`
  with backend `96 passed, 141 skipped`, frontend unit `39 passed`, frontend
  production build, and current project tree.
- Frontend e2e passed: `pnpm -C frontend e2e` with `3 passed`.
- Commit/push passed through the standard workflow:
  `powershell -ExecutionPolicy Bypass -File scripts/push-git.ps1 -Message "Add MCP card transfer tool"`
  created commit `cefdd6da` and pushed `main` to `origin/main`.
- Server deploy passed:
  `powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1`.
- Server MCP Phase 5 tests passed with `30 passed`.
- Server MCP stdio sanity passed for `initialize`, `tools/list`, and
  `reg_engine_health`; `tools/list` includes `reg_engine_transfer_card` with
  `readOnlyHint=false`.
- Direct server smoke passed: server checkout `cefdd6da`, Alembic
  `0014_report_pdf_output (head)`, and
  `curl http://127.0.0.1:8000/api/v1/health` returned
  `{"status":"ok","service":"reg_engine"}`.

Production migration checkpoint:

- Not required for Phase 5J; no backend schema changes are included and
  production Alembic remains at `0014_report_pdf_output (head)`.

### Phase 5K: MCP Report Template Write Tools

Status: completed and deployed.

Purpose: extend the API-only MCP write surface with report template
create/update/archive operations while keeping registry visibility, report
template permissions, template validation, archive semantics, and audit in the
existing REST API/service layer.

Tool set:

- `reg_engine_create_report_template`
- `reg_engine_update_report_template`
- `reg_engine_archive_report_template`

Argument schemas:

- `reg_engine_create_report_template`:
  - `registry_id`: required string.
  - `code`: required string.
  - `name`: required string.
  - `report_type`: required string.
  - `description`: optional string.
  - `parameters_schema_json`: optional object.
  - `default_parameters_json`: optional object.
  - `output_format`: optional string.
  - `additionalProperties=false`.
- `reg_engine_update_report_template`:
  - `template_id`: required string.
  - `name`: optional string.
  - `description`: optional string.
  - `report_type`: optional string.
  - `parameters_schema_json`: optional object.
  - `default_parameters_json`: optional object.
  - `output_format`: optional string.
  - `additionalProperties=false`.
- `reg_engine_archive_report_template`:
  - `template_id`: required string.
  - `confirm_archive`: required boolean and must be `true`.
  - `additionalProperties=false`.

API endpoints:

- `POST /api/v1/registries/{registry_id}/report-templates`
- `PATCH /api/v1/report-templates/{template_id}`
- `DELETE /api/v1/report-templates/{template_id}`

Security and audit decisions:

- MCP tools call only the REST API through `RegEngineApiClient`.
- Report template permissions, registry visibility, supported report type and
  output format validation, schema/default parameter validation, archive
  semantics, and audit remain API-side in the existing report service.
- Archive requires explicit `confirm_archive=true` before sending `DELETE`.

Scope:

- Expose the three tools with `readOnlyHint=false`.
- Preserve existing read-only tools and Phase 5D/5E/5F/5G/5H/5I/5J write
  behavior.
- Reject update calls with no update fields before sending a request.
- Reject archive calls unless `confirm_archive=true`.
- Do not generate report runs, download report output, archive report runs,
  mutate documents, mutate public links, upload or download attachments,
  import/export data, expose binary downloads, or add other MCP tools in this
  phase.
- Do not add direct database access, SQLAlchemy/Alembic imports, backend model
  imports, backend service imports, standalone MCP auth, frontend UI, database
  schema changes, or Alembic migrations.

Acceptance criteria:

- `tools/list` includes all three new tools as write tools.
- Create report template sends
  `POST /api/v1/registries/{registry_id}/report-templates` with required
  values and only provided optional fields.
- Update report template sends `PATCH /api/v1/report-templates/{template_id}`
  with only provided update fields and rejects empty update payloads.
- Archive report template sends
  `DELETE /api/v1/report-templates/{template_id}` only when
  `confirm_archive=true`.
- Archive without confirmation returns an MCP tool error and sends no HTTP
  request.
- Existing MCP JSON-RPC hardening behavior remains intact.
- MCP package guardrails continue proving no direct DB/model/service imports.

Known limitations:

- Production live smoke must not create, update, or archive production report
  templates without a disposable production-safe target.
- Report run generation/archive/download, document/public-link, attachment
  upload/download, and import/export MCP write tools remain future phases.

Verification so far:

- RED targeted MCP Phase 5 tests failed before implementation because
  `reg_engine_create_report_template`,
  `reg_engine_update_report_template`, and
  `reg_engine_archive_report_template` were absent from
  `MCP_TOOL_DEFINITIONS`.
- GREEN targeted MCP Phase 5 tests passed locally with `33 passed`.
- Targeted `ruff check`, `ruff format --check`, and `mypy backend\app\mcp`
  passed locally.
- Local full check passed:
  `powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote`
  with backend `99 passed, 141 skipped`, frontend unit `39 passed`, frontend
  production build, and current project tree.
- Frontend e2e passed: `pnpm -C frontend e2e` with `3 passed`.
- Commit/push passed through the standard workflow:
  `powershell -ExecutionPolicy Bypass -File scripts/push-git.ps1 -Message "Add MCP report template tools"`
  created commit `f632adb5` and pushed `main` to `origin/main`.
- Server deploy passed:
  `powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1`.
- Server MCP Phase 5 tests passed with `33 passed`.
- Server MCP stdio sanity passed for `initialize`, `tools/list`, and
  `reg_engine_health`; `tools/list` includes
  `reg_engine_create_report_template`,
  `reg_engine_update_report_template`, and
  `reg_engine_archive_report_template` with `readOnlyHint=false`.
- Direct server smoke passed: server checkout `f632adb5`, Alembic
  `0014_report_pdf_output (head)`, and
  `curl http://127.0.0.1:8000/api/v1/health` returned
  `{"status":"ok","service":"reg_engine"}`.

Production migration checkpoint:

- Not required for Phase 5K; no backend schema changes are included and
  production Alembic remains at `0014_report_pdf_output (head)`.

### Phase 5L: MCP Report Run Write Tools

Status: completed and deployed.

Purpose: extend the API-only MCP write surface with report run generation and
archive operations while keeping registry/report permissions, report template
validation, parameter/default validation, output storage, archive semantics,
and audit in the existing REST API/service layer.

Tool set:

- `reg_engine_generate_report_run`
- `reg_engine_archive_report_run`

Argument schemas:

- `reg_engine_generate_report_run`:
  - `template_id`: required string.
  - `parameters`: optional object.
  - `additionalProperties=false`.
- `reg_engine_archive_report_run`:
  - `report_run_id`: required string.
  - `confirm_archive`: required boolean and must be `true`.
  - `additionalProperties=false`.

API endpoints:

- `POST /api/v1/report-templates/{template_id}/runs`
- `DELETE /api/v1/report-runs/{report_run_id}`

Security and audit decisions:

- MCP tools call only the REST API through `RegEngineApiClient`.
- Report generation permissions, template visibility, supported report type and
  output format validation, parameter/default validation, output storage,
  archive visibility, and audit remain API-side in the existing report service.
- Archive requires explicit `confirm_archive=true` before sending `DELETE`.

Scope:

- Expose the two tools with `readOnlyHint=false`.
- Preserve existing read-only tools and Phase 5D/5E/5F/5G/5H/5I/5J/5K write
  behavior.
- Generate sends the existing REST payload with `parameters` only when the MCP
  caller provides it.
- Do not download report output, expose binary content, mutate report templates,
  mutate documents, mutate public links, upload or download attachments,
  import/export data, or add other MCP tools in this phase.
- Do not add direct database access, SQLAlchemy/Alembic imports, backend model
  imports, backend service imports, standalone MCP auth, frontend UI, database
  schema changes, or Alembic migrations.

Acceptance criteria:

- `tools/list` includes both new tools as write tools.
- Generate report run sends `POST /api/v1/report-templates/{template_id}/runs`
  with only provided optional `parameters`.
- Archive report run sends `DELETE /api/v1/report-runs/{report_run_id}` only
  when `confirm_archive=true`.
- Archive without confirmation returns an MCP tool error and sends no HTTP
  request.
- Existing MCP JSON-RPC hardening behavior remains intact.
- MCP package guardrails continue proving no direct DB/model/service imports.

Known limitations:

- Production live smoke must not generate or archive production report runs
  without a disposable production-safe target.
- MCP report output download/content, document/public-link, attachment
  upload/download, and import/export write tools remain future phases.

Verification so far:

- RED targeted MCP Phase 5 tests failed before implementation because
  `reg_engine_generate_report_run` and `reg_engine_archive_report_run` were
  absent from `MCP_TOOL_DEFINITIONS`.
- GREEN targeted MCP Phase 5 tests passed locally with `35 passed`.
- Targeted `ruff check`, `ruff format --check`, and `mypy backend\app\mcp`
  passed locally.
- Local full check passed:
  `powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote`
  with backend `101 passed, 141 skipped`, frontend unit `39 passed`, frontend
  production build, and current project tree.
- Frontend e2e passed: `pnpm -C frontend e2e` with `3 passed`.
- Commit/push passed through the standard workflow:
  `powershell -ExecutionPolicy Bypass -File scripts/push-git.ps1 -Message "Add MCP report run tools"`
  created commit `610defc7` and pushed `main` to `origin/main`.
- Server deploy passed:
  `powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1`.
- Server MCP Phase 5 tests passed with `35 passed`.
- Server MCP stdio sanity passed for `initialize`, `tools/list`, and
  `reg_engine_health`; `tools/list` includes
  `reg_engine_generate_report_run` and `reg_engine_archive_report_run` with
  `readOnlyHint=false`.
- Direct server smoke passed: server checkout `610defc7`, Alembic
  `0014_report_pdf_output (head)`, and
  `curl http://127.0.0.1:8000/api/v1/health` returned
  `{"status":"ok","service":"reg_engine"}`.

Production migration checkpoint:

- Not required for Phase 5L; no backend schema changes are included and
  production Alembic remains at `0014_report_pdf_output (head)`.

### Phase 5M: MCP Document Template Write Tools

Status: completed locally; pending full local check, push, and deploy.

Purpose: extend the API-only MCP write surface with text document template
create/archive operations while keeping registry/template permissions,
template validation, version metadata, archive semantics, and audit in the
existing REST API/service layer.

Tool set:

- `reg_engine_create_document_template`
- `reg_engine_archive_document_template`

Argument schemas:

- `reg_engine_create_document_template`:
  - `registry_id`: required string.
  - `code`: required string.
  - `name`: required string.
  - `template_body`: required string.
  - `description`: optional string.
  - `output_filename_template`: optional string.
  - `additionalProperties=false`.
- `reg_engine_archive_document_template`:
  - `template_id`: required string.
  - `confirm_archive`: required boolean and must be `true`.
  - `additionalProperties=false`.

API endpoints:

- `POST /api/v1/registries/{registry_id}/document-templates`
- `DELETE /api/v1/document-templates/{template_id}`

Security and audit decisions:

- MCP tools call only the REST API through `RegEngineApiClient`.
- Registry visibility, document template permissions, text template validation,
  version metadata, archive semantics, and audit remain API-side in the
  existing document service.
- Archive requires explicit `confirm_archive=true` before sending `DELETE`.

Scope:

- Expose the two tools with `readOnlyHint=false`.
- Preserve existing read-only tools and Phase 5D/5E/5F/5G/5H/5I/5J/5K/5L
  write behavior.
- Create only supports the existing JSON text-template endpoint.
- Do not upload binary `.docx` templates, upload template versions, generate
  documents, archive generated documents, download document content, mutate
  public links, upload or download attachments, import/export data, or add
  other MCP tools in this phase.
- Do not add direct database access, SQLAlchemy/Alembic imports, backend model
  imports, backend service imports, standalone MCP auth, frontend UI, database
  schema changes, or Alembic migrations.

Acceptance criteria:

- `tools/list` includes both new tools as write tools.
- Create document template sends
  `POST /api/v1/registries/{registry_id}/document-templates` with required
  values and only provided optional fields.
- Archive document template sends
  `DELETE /api/v1/document-templates/{template_id}` only when
  `confirm_archive=true`.
- Archive without confirmation returns an MCP tool error and sends no HTTP
  request.
- Existing MCP JSON-RPC hardening behavior remains intact.
- MCP package guardrails continue proving no direct DB/model/service imports.

Known limitations:

- Production live smoke must not create or archive production document
  templates without a disposable production-safe target.
- MCP binary `.docx` template upload/version upload, generated document
  generate/archive, document content download, public-link, attachment
  upload/download, and import/export write tools remain future phases.

Verification so far:

- RED targeted MCP Phase 5 tests failed before implementation because
  `reg_engine_create_document_template` and
  `reg_engine_archive_document_template` were absent from
  `MCP_TOOL_DEFINITIONS`.
- GREEN targeted MCP Phase 5 tests passed locally with `37 passed`.
- Targeted `ruff check`, `ruff format --check`, and `mypy backend\app\mcp`
  passed locally.
- Local full check passed:
  `powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote`
  with backend `103 passed, 141 skipped`, frontend unit `39 passed`, frontend
  production build, and current project tree.
- Frontend e2e passed: `pnpm -C frontend e2e` with `3 passed`.

Production migration checkpoint:

- Not required for Phase 5M; no backend schema changes are included and
  production Alembic remains at `0014_report_pdf_output (head)`.

## Verification

Required checks for each implementation checkpoint:

- local backend checks;
- PostgreSQL-backed tests against a disposable test database where applicable;
- frontend lint, typecheck, unit tests, e2e tests, and format checks where applicable;
- project map update/check;
- README and PLANS update.
