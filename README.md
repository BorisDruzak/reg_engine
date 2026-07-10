# Registry Engine

Registry Engine is an extensible web engine for schema-driven registries.

This is not a hardcoded employee registry. The core rule is that an administrator creates registries and configures card structure through blocks and fields. Future users work with cards only through backend-enforced access rules.

## Product Direction

Target system:

- web panel;
- PostgreSQL server database;
- REST API;
- future MCP layer;
- users and roles;
- organization-based access;
- dynamic cards;
- configurable blocks and fields;
- audit log;
- import/export in later phases;
- attachments and generated-document workflows.

## Critical Architecture Rules

1. Do not create a hardcoded `employees` table with fixed HR fields.
2. Card structure is defined through `registries`, `form_blocks`, and `form_fields`.
3. Future field values should be typed, for example `value_text`, `value_number`, `value_date`, `value_bool`, and `value_json`.
4. Adding a field must not require a database migration.
5. Old cards must not break after schema changes.
6. Access is checked on the backend.
7. Frontend may hide controls, but it is not the security boundary.
8. Future create/update/archive actions must write audit events.
9. Parent organization access does not imply child organization access without `include_descendants=true`.
10. Future MCP must call the API, not the database directly.

## Current Foundation

- Backend: FastAPI in `backend/`.
- Frontend: React + TypeScript + Vite in `frontend/`.
- Automation: PowerShell-first scripts in `scripts/` for the Codex Windows app.
- CI: GitHub Actions backend and frontend quality gates.
- Server: runtime checkout configured outside Git through environment variables or `scripts/local.reg_engine.psd1`.
- Database foundation: SQLAlchemy Base, database engine/session helpers, and Alembic setup.
- Core Schema v1: SQLAlchemy models and Alembic migration for the final table set.
- Current backend scope has healthcheck, database infrastructure, Core Schema v1 models/migrations, service-layer behavior, hardened REST API workflows for organizations, org units, registries, dynamic cards, card templates, public links, transfer, references, audit reads, bootstrap seed tooling, bearer-token authentication, user/access management API, card-level attachment backend/API foundation, authenticated generated `.docx` document APIs, public-link attachment list/upload/download APIs with safe upload-limit metadata, authenticated card export API foundation, bounded CSV/XLSX import preview/commit API foundation, authenticated JSON/CSV/XLSX/PDF report template/run API foundation with backend report parameter/schema validation and rollback-safe report output cleanup, read-only MCP-over-API gateway foundation, MCP stdio/config hardening, MCP mutation client foundation for future explicitly approved write tools, MCP registry, schema-builder, card lifecycle, card field-value, card block-instance, card transfer, report-template, report-run, document-template, and generated-document write tools, MCP document metadata read tools, plus MCP report/generated-document content read tools with confirmation, size limits, and normalized errors.
- Current frontend scope has a bearer-authenticated admin shell with section-scoped data loading, organization create/edit/archive management, user create/edit/password-reset/archive management, access-grant issue/revoke management, roles/permissions reads, registry create/update/archive, schema block/field create/update/archive with visual drag/drop field ordering, card-template create/edit/archive for template-driven card creation, reference-list/item create/update/archive, select/multi_select reference-list wiring, card list/read/create/metadata-edit/archive with unified tag search for free-text, organization, template, archive, and typed schema-field filters, same-organization card org-unit correction, repeatable block-instance add/archive, read-first exact-geometry card rendering with one inline block editor at a time and attachment-aware separate `file_ref` editing, authenticated public-link list/create/disable controls with attachment-upload limits and browser-openable public URL display, shared admin mutation API/client UI foundations, card-level attachment upload/download/archive, generated-document generation/download/archive, document-template create/archive, authenticated JSON/CSV/XLSX card export and CSV/XLSX import preview/commit controls, authenticated report template create/update/archive and JSON/CSV/XLSX/PDF report generate/download/archive controls with template parameter schema/default JSON editing, basic visual run-parameter controls generated from flat schema properties including scalar enum select controls, `oneOf` option titles, date-format string inputs, schema description hints, schema default values, required-parameter validation, scalar `minLength`/`maxLength`/`minimum`/`maximum` validation, `pattern`/`multipleOf` validation, and `exclusiveMinimum`/`exclusiveMaximum` validation, default run-parameter payload fallback when manual JSON is empty, visible run format, filename, parameters, and summary metadata plus archived report template/run visibility, audit reads, public-link card editing, public-link attachment list/upload/download with exhausted-upload state, and full Russian UI browser validation for the core admin setup path.
- Current card-template layout scope uses one Russian-first contextual
  `CardLayoutStudio` with the stages `Макет карточки`, `Печатная форма A4`, and
  `Предпросмотр`. Web/card geometry is stored in the unified
  `card_template_layout_v1` contract, while A4 views remain internal
  `card_print_layout_v1` document-template versions. Ordinary card filling
  remains the primary data-entry workflow.
- The card-scoped `GET /api/v1/cards/{card_id}/presentation` contract checks
  card visibility first and returns only that card's current template
  structure/layout. It does not broaden registry schema or template-layout
  permissions.
- Phase 2 documents/attachments scope started with card-level attachments. Phase 2B adds attachment metadata models, local-filesystem storage abstraction, authenticated attachment endpoints, and tests. Phase 2C adds generated `.docx` document metadata and service rendering from schema-driven card data. Phase 2D adds authenticated Russian-first card workspace UI for attachments and generated documents. Phase 2G adds authenticated Russian-first document-template management UI. Phase 2H adds public-link attachment list/upload/download for active public edit links. Phase 2I separates public field-edit usage from attachment-upload usage and hardens rollback cleanup. Public-link attachment quota API hardening makes upload limits configurable at public-link creation time and protects quota consumption with row-level locking. Phase 2J.0 accepts the `file_ref` dynamic field type ADR. Phase 2J.1 adds the database/model foundation and schema type registration for `file_ref`; Phase 2J.2 adds authenticated backend service set/read/clear support and keeps public-link `file_ref` editing blocked. Phase 2J.3 adds transfer behavior for active and archived `file_ref` values. Phase 2J.4 exposes authenticated REST card value set/clear/read metadata for `file_ref`. Phase 2J.5 adds the Russian-first authenticated `file_ref` card editor using existing card attachments. Phase 2J.6 renders `file_ref` in `docx_text_v1` as safe attachment title/original filename text. Phase 2J.7 validates the full file-ref flow on disposable PostgreSQL and temporary storage. Phase 2M adds binary `.docx` template upload and template versioning through authenticated API. Phase 2N adds authenticated PDF generation for `docx_text_v1` templates.
- XLSX card import/export is available as a row-oriented technical exchange
  format. XLSX and PDF report outputs are available for existing report types.
  Additional report polish and broader MCP write tools are later phases.

## Contextual Card Layout Contract

- Every newly saved form layout uses exactly 12 columns and four logical rows.
  Block and field widths snap to `3`, `6`, `9`, or `12` columns; heights snap
  to `1`, `2`, `3`, or `4` rows. Backend validation rejects overflow and
  overlapping blocks or fields. Legacy rows above four remain readable with a
  warning, but must be brought into the current grid before the layout can be
  saved again.
- Mouse pointer capture supports moving and eight-direction resizing. Fields
  open their inline editor on click or Enter/Space, move after a six-pixel
  hold-and-drag threshold, and resize from unobtrusive edge/corner zones; no
  separate field edit or move buttons are rendered. Arrow keys move the active
  item and `Shift + стрелки` resizes it. `Готово` commits one geometry command,
  while `Escape` or `Отмена` restores the starting rectangle. Undo and redo
  operate on the same revision-safe save path.
- Block and field creation, insertion, and editing are disclosed in context
  inside the canvas. `Создать поле` is placed in the block footer below its
  existing fields. Web blocks project only their occupied internal field rows
  and align to content without changing saved 12 x 4 geometry; linked A4
  rendering explicitly keeps all four print rows. Inline editors use the real
  schema APIs and preserve the schema-driven block/field contracts; the preview
  stage is fully read-only.
- Form saves send `expected_revision`. Layout PATCH requests use a latest-value
  queue serialized with schema writes. A `409` keeps the local draft and offers
  `Сравнить с версией сервера`, `Принять версию сервера`, and
  `Сохранить локальную версию`; transient failures offer `Повторить`.
- A linked A4 composition contains exactly one enclosing `card_layout`
  rectangle plus independently editable print-only overlays. The rectangle is
  protected from delete/copy/duplicate actions. Stage tabs are the only
  navigation between A4 and `Макет карточки`; the former
  `Редактировать внутренний макет` overlay is not rendered. Print-only elements
  are added through one compact vertical disclosure list. DOCX/PDF generation
  expands the linked rectangle from the current form layout without persisting
  expanded field geometry into the saved A4 JSON.
- Legacy A4 `items[]` payloads remain readable. Explicit conversion creates a
  new audited document-template version and leaves the previous version
  unchanged and readable. User-facing labels, validation, recovery choices,
  and accessible controls are Russian-first.

## Filled Card Workspace Contract

- A non-terminal card lifecycle is derived automatically from completeness:
  an empty `required` or `required_on_publish` field makes the card a `draft`,
  and a card with every mandatory field filled is `active`. A template without
  mandatory fields creates an active card immediately. Archived and superseded
  cards remain terminal. Creating or sending a public filling link is
  lifecycle-neutral and remains available for both draft and active cards; no
  manual activation button is rendered.
- The normal card view is read-first: it renders stored values in the exact
  saved block/field geometry and does not open a global mass-edit form by
  default.
- `Изменить блок` opens one editor in place inside the selected block. The
  existing field controls and validation are reused, while `file_ref` remains
  in its attachment-aware single-field editor.
- Every block read/write resolves the exact backend `block_instance_id` for
  that block. This applies to both non-repeatable blocks and each repeatable
  instance; repeatable values are never merged into a shared primary surface.
- Desktop follows the configured grid. The web card collapses to one readable
  column at the mobile breakpoint in visual row/column order, while A4 keeps
  exact print geometry.
- Backend `can_manage` controls editing, lifecycle, public-link, print-download,
  repeatable-instance, attachment, and document management actions. A readable
  card without manage permission uses the card-scoped presentation endpoint;
  attachments and generated documents remain list/download-only, with no
  upload, archive, template-management, or generation requests.
- The local Phase 8K gate passed with backend `220 passed / 175 skipped` and
  frontend `195 passed / 25 skipped`. The known single Starlette/httpx
  deprecation warning and Vite main-chunk advisory (`540.87 kB`, `153.73 kB`
  gzip) remain. PostgreSQL permission tests require a disposable
  `TEST_DATABASE_URL` ending in `_test` and are skipped when it is absent.
- Phase 8K is verified locally only. This checkpoint does not claim a push,
  deployment, server smoke, or live Browser result.

## Public Link Review Lifecycle Checkpoint

Phase 8L is implemented and verified locally through the documentation
pre-release checkpoint. It is not yet claimed as pushed, deployed, migrated in
production, or live Browser-verified.

- Review-enabled public links move through `active`, `submitted`,
  `changes_requested`, `approved`, `disabled`, and `expired`. Public editing is
  allowed only in `active` and `changes_requested`; approval records the
  reviewer and closes public view/edit access.
- Public saves are direct-to-card. Field values and allowed attachments update
  the real card before approval. The safe baseline supports administrator diff
  review, while submit stores only completed/total public-field counts.
- Six lifecycle routes cover recipient submit/status and administrator review,
  request-changes, approve, and legacy start-review-cycle. Backend card
  management permission remains authoritative for administrator actions.
- The public page renders the exact sanitized card-template layout through the
  shared renderer. It exposes only allowed template blocks/fields, preserves
  non-editable static instructions inside explicitly selected blocks, and
  keeps `file_ref` public editing blocked.
- Field autosaves are sequential and server-confirmed. Canonical server values
  replace the visible value only for the latest edit version. Card submission
  remains blocked while a field or attachment upload is pending or has an
  unresolved failure.
- Public status is fetched authoritatively on every page mount. Closed links,
  status refresh failures, and lifecycle `403/409` responses purge/hide preview
  and attachment caches. Submitted/approved/disabled/expired screens use only
  the safe status receipt and never render cached card data.
- Migration `0023_public_link_review` adds lifecycle timestamps, reviewer,
  comment, safe baseline/summary JSON, `review_enabled`, the expanded status
  constraint, reviewer foreign key, and review-list index. Existing links stay
  compatible with `review_enabled=false` until an administrator explicitly
  captures a review baseline.

Implemented lifecycle endpoints:

```text
POST /api/v1/public-links/submit
POST /api/v1/public-links/status
GET  /api/v1/public-links/{public_link_id}/review
POST /api/v1/public-links/{public_link_id}/request-changes
POST /api/v1/public-links/{public_link_id}/approve
POST /api/v1/public-links/{public_link_id}/start-review-cycle
```

The latest full local gate reported backend `226 passed / 191 skipped` and
frontend `225 passed / 25 skipped`; lint, format, typecheck, and the production
frontend build passed. The existing Starlette/httpx deprecation and Vite
main-chunk advisory remain. PostgreSQL cases skipped without
`TEST_DATABASE_URL`; disposable `_test` migration/lifecycle verification is
still required before release. Production backup/preflight, migration, push,
deploy, and live Browser proof remain pending.

Known functional limits: review does not stage or roll back public edits,
legacy links have no trustworthy historical baseline until opt-in, public
`file_ref` editing and generated documents remain unavailable, and the product
does not send links through email or messenger channels.

## Local Setup

```powershell
cd C:\Users\admin-2\Documents\reg_engine
```

Backend:

```powershell
cd backend
python -m pip install -e ".[dev]"
```

Frontend:

```powershell
pnpm install
```

Playwright browser install for e2e:

```powershell
pnpm -C frontend exec playwright install chromium
```

## Main Scripts

| Purpose | Command |
| --- | --- |
| Full check | `powershell -ExecutionPolicy Bypass -File scripts/check.ps1` |
| Local-only check | `powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote` |
| Tests | `powershell -ExecutionPolicy Bypass -File scripts/test.ps1` |
| Tests with e2e | `powershell -ExecutionPolicy Bypass -File scripts/test.ps1 -E2E` |
| Lint | `powershell -ExecutionPolicy Bypass -File scripts/lint.ps1` |
| Format check | `powershell -ExecutionPolicy Bypass -File scripts/format.ps1 -Check` |
| Typecheck | `powershell -ExecutionPolicy Bypass -File scripts/typecheck.ps1` |
| Backend dev server | `powershell -ExecutionPolicy Bypass -File scripts/dev-backend.ps1` |
| Frontend dev server | `powershell -ExecutionPolicy Bypass -File scripts/dev-frontend.ps1` |
| MCP dev server | `powershell -ExecutionPolicy Bypass -File scripts/dev-mcp.ps1` |
| Project map | `powershell -ExecutionPolicy Bypass -File scripts/project-map.ps1` |
| Server check | `powershell -ExecutionPolicy Bypass -File scripts/server-check.ps1` |
| Server service status | `powershell -ExecutionPolicy Bypass -File scripts/service.ps1 -Command status` |
| Server service start | `powershell -ExecutionPolicy Bypass -File scripts/service.ps1 -Command start` |
| Server service stop | `powershell -ExecutionPolicy Bypass -File scripts/service.ps1 -Command stop` |
| Deploy frontend | `powershell -ExecutionPolicy Bypass -File scripts/deploy-frontend.ps1` |
| Bootstrap | `powershell -ExecutionPolicy Bypass -File scripts/bootstrap.ps1 -Command seed` |
| Push main | `powershell -ExecutionPolicy Bypass -File scripts/push-git.ps1 -Message "<message>"` |
| Deploy main | `powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1` |

This project uses one long-lived branch: `main`. After a verified implementation checkpoint, commit the scoped local changes, push `main` to GitHub, update the configured server checkout from `origin/main`, and run server checks. Planned production PostgreSQL migrations may be applied by Codex after disposable PostgreSQL verification, fresh backup, data preflight, and post-migration checks.

## Direct Backend Commands

```powershell
cd backend
python -m pytest
ruff check .
ruff format --check .
mypy app
```

## Database Migration Commands

Core Schema v1 uses Alembic under `backend/migrations`.

Render migration SQL without changing a database:

```powershell
cd backend
python -m alembic upgrade head --sql
```

Apply migrations to the configured PostgreSQL database:

```powershell
cd backend
$env:DATABASE_URL = "postgresql+psycopg://<user>:<password>@<host>:5432/<database>"
python -m alembic upgrade head
```

Create a new autogenerate revision after model changes:

```powershell
cd backend
$env:DATABASE_URL = "postgresql+psycopg://<user>:<password>@<host>:5432/<database>"
python -m alembic revision --autogenerate -m "<message>"
```

Local migration tests render PostgreSQL SQL offline and do not connect to the production server. For a real upgrade test, point `TEST_DATABASE_URL` to a disposable PostgreSQL database, not `reg_engine` production:

```powershell
cd backend
$env:TEST_DATABASE_URL = "postgresql+psycopg://<user>:<password>@<host>:5432/<test_database>"
python -m alembic upgrade head
```

Core schema DB smoke tests use the same `TEST_DATABASE_URL` and reset the `public` schema in that database. The database name must end with `_test`, for example `reg_engine_test`:

```powershell
cd backend
$env:TEST_DATABASE_URL = "postgresql+psycopg://<user>:<password>@<host>:5432/reg_engine_test"
python -m pytest tests/test_database_smoke.py -q
```

Do not commit real database passwords. Planned server schema migrations are covered by the standing project approval when the active plan requires them, disposable PostgreSQL tests have passed, and backup/preflight/post-checks are completed.

## Env Loading Strategy

Backend settings load direct environment variables first. For local development, `backend/.env` may provide defaults and must not contain committed secrets.

For server/runtime use, keep secrets outside the repository and point the backend to that file:

```powershell
$env:REG_ENGINE_ENV_FILE = "C:\path\to\reg_engine.env"
```

On the runtime server, the intended runtime file is outside the repository, for example:

```text
/etc/reg_engine/reg_engine.env
```

Alembic resolves database configuration in this order:

1. `TEST_DATABASE_URL`
2. `DATABASE_URL`
3. `REG_ENGINE_ENV_FILE` through backend settings
4. `backend/alembic.ini` fallback URL

Temporary API actor injection is controlled by:

```powershell
$env:ALLOW_DEV_ACTOR_HEADER = "true"
```

Protected API endpoints prefer `Authorization: Bearer <token>`. When `ALLOW_DEV_ACTOR_HEADER` is absent or false, protected API endpoints reject `X-Actor-User-Id`. This header is only for controlled tests and local development.

Auth token signing is controlled by:

```powershell
$env:APP_ENV = "development"
$env:AUTH_TOKEN_SECRET = "<strong-secret>"
$env:AUTH_ACCESS_TOKEN_MINUTES = "480"
```

`APP_ENV=production`, `APP_ENV=prod`, `APP_ENV=staging`, and `APP_ENV=stage` are treated as production-like runtimes. Production-like app startup rejects the built-in development `AUTH_TOKEN_SECRET`; set a deployment-specific secret outside Git through the environment or `REG_ENGINE_ENV_FILE`.

Browser frontend deployments that call the API from another origin must explicitly configure allowed origins:

```powershell
$env:CORS_ALLOWED_ORIGINS = "http://127.0.0.1:5173,https://registry.example.test"
```

Leave `CORS_ALLOWED_ORIGINS` empty when the frontend and API are served from the same origin. Do not use wildcard origins for authenticated deployments.

By default the Vite frontend calls the API on the same origin using relative
`/api/...` paths. Local Vite development proxies `/api` and `/health` to
`http://127.0.0.1:8000`; set `VITE_API_BASE_URL` only for split-origin
deployments.

When `frontend/dist/index.html` exists next to the backend checkout, FastAPI
serves it as the SPA shell and preserves `/api`, `/health`, `/docs`, `/redoc`,
and `/openapi.json` as backend routes. Override the frontend directory only
when needed through `REG_ENGINE_FRONTEND_DIST_DIR`.

Auth API:

```powershell
POST /api/v1/auth/login
GET  /api/v1/auth/me
POST /api/v1/auth/logout
```

`POST /api/v1/auth/logout` validates the bearer token and returns `{"status":"ok"}`. Server-side token revocation storage is intentionally deferred until the session persistence phase.

## Browser Session Storage Decision

The MVP frontend currently stores the bearer token and current-user snapshot in browser `localStorage` under `reg_engine.session.v1`. This is accepted only for local development, disposable tests, and internal MVP/staging use.

Do not treat browser `localStorage` bearer-token persistence as production-ready. Before production frontend hosting, replace it with server-side session or refresh-token persistence, hashed stored tokens, explicit logout revocation, httpOnly `Secure` `SameSite` cookies, short-lived access tokens, CSRF protection for cookie-authenticated unsafe methods, and session audit events.

The current logout flow clears browser storage in the frontend and validates the bearer token on the backend, but it does not revoke already issued tokens server-side. See `docs/ADR/0002-browser-session-storage.md`.

## Phase 2 Attachment Storage Decision

Phase 2 starts with card-level attachments. Generated `.docx` documents now have backend APIs and authenticated card-workspace UI. Public-link attachment list/upload/download is available for active public edit links. Authenticated REST card value endpoints and Russian-first authenticated card editor support `file_ref` set/clear/read metadata through existing card attachments. `docx_text_v1` renders `file_ref` values as safe attachment title/original filename text, including an archive marker for archived referenced attachments. Binary `.docx` template upload and template versioning are available through authenticated API. Authenticated PDF generation is available for `docx_text_v1` templates. Binary `.docx` layout conversion to PDF and public generated-document workflows remain deferred.

The approved storage direction is a backend storage abstraction with a local filesystem backend configured outside Git. Runtime storage roots and limits must be set through environment variables or external runtime env files, never committed defaults.

Attachment runtime settings:

```powershell
$env:REG_ENGINE_STORAGE_BACKEND = "local_filesystem"
$env:REG_ENGINE_STORAGE_ROOT = "C:\path\outside\repo\attachments"
$env:REG_ENGINE_MAX_ATTACHMENT_BYTES = "10485760"
$env:REG_ENGINE_MALWARE_SCANNER = "deferred"
```

When `REG_ENGINE_ATTACHMENT_ALLOWED_TYPES` is non-empty, the attachment service
rejects uploads whose MIME type is outside the comma-separated allow-list before
writing bytes to storage.

For production-like `APP_ENV` values, `REG_ENGINE_ATTACHMENT_ALLOWED_TYPES` is
required. The current MVP allow-list checks the upload MIME type supplied by the
client and records this trust boundary; deeper server-side content sniffing is
deferred to a later scanner/content-inspection phase.

`REG_ENGINE_MALWARE_SCANNER=deferred` is the only supported scanner mode in the
current attachment slice. Unsupported scanner mode values fail startup clearly
instead of silently falling back.

Authenticated attachment API:

```powershell
POST   /api/v1/cards/{card_id}/attachments
GET    /api/v1/cards/{card_id}/attachments
GET    /api/v1/attachments/{attachment_id}
GET    /api/v1/attachments/{attachment_id}/content
DELETE /api/v1/attachments/{attachment_id}
```

Upload uses multipart form data with `file` and optional `title` / `description`. Backend access checks follow card scope: create/archive require editable card access, and metadata/download require readable card access.

Authenticated public-link management API:

```powershell
POST   /api/v1/cards/{card_id}/public-links
GET    /api/v1/cards/{card_id}/public-links
DELETE /api/v1/public-links/{public_link_id}
```

Public-link creation accepts optional `expires_in_days` and
`max_attachment_uploads`. `max_attachment_uploads=null` or an omitted value
means unlimited public attachment uploads for that link.

Public-link attachment API:

```powershell
POST /api/v1/public-links/attachments
POST /api/v1/public-links/attachments/upload
POST /api/v1/public-links/attachments/{attachment_id}/content
```

Public-link attachment list/upload/download require an active public edit link, `public_link.can_edit=true`, `card.public_edit_enabled=true`, and a non-archived, non-superseded card. `card_public_links.max_uses` / `used_count` apply to public field edits only. Public attachment uploads use separate `max_attachment_uploads` / `attachment_upload_count` semantics. Administrators can set `max_attachment_uploads` when creating a public link; omitted/null means unlimited uploads for that active link. Existing public-link settings are create-only in the current API slice, so changing the limit requires disabling the old link and creating a new one. Upload quota consumption locks and refreshes the public-link row before checking/incrementing the counter so parallel or stale-session uploads cannot exceed the limit. List/download do not increment usage counters, and exhausted field-edit usage does not block attachment list/download. The public attachment list response exposes safe upload-limit metadata: `max_attachment_uploads`, `attachment_upload_count`, and `can_upload_attachments`; it still omits storage internals. The public UI disables upload with the Russian state `Лимит загрузок исчерпан` when the upload limit is exhausted, while preserving list/download access. Public-link upload uses the same bounded read, MIME allow-list, scanner hook, storage cleanup, filename normalization, and safe download-header behavior as authenticated attachment workflows. Public-link responses intentionally omit `stored_file_id`, `checksum_sha256`, storage keys, and filesystem details. Public-link archive/delete is not exposed.

Upload reads are bounded by `REG_ENGINE_MAX_ATTACHMENT_BYTES`; oversized uploads
are rejected before unbounded request-body growth is possible. If metadata
persistence fails after bytes have been written, the storage object is deleted
before the error is re-raised. If bytes are written and the SQLAlchemy
transaction later rolls back, the pending storage object is also deleted by the
session rollback cleanup hook.

Download responses include a safe `Content-Disposition: attachment` header with
an ASCII fallback filename and a UTF-8 `filename*` value. Stored original
filenames are normalized to remove control characters and header-unsafe
characters.

Download streaming through `StreamingResponse` is deferred until the storage
abstraction exposes a streaming/open-file boundary. The current API reads
authorized attachment bytes through `AttachmentStorage.read_bytes`; wrapping
already-loaded bytes in `StreamingResponse` would not reduce memory pressure.

Archiving a card attachment archives the card-scoped attachment link and keeps
the stored file metadata and bytes. `stored_files.archived_at` is not used by the
MVP attachment-link archive flow; physical byte cleanup and stored-file garbage
collection are deferred to a future retention phase. Authenticated attachment
responses currently include `stored_file_id` and `checksum_sha256` as technical
metadata for authorized API consumers; frontend UI should treat them as
diagnostic metadata, not primary user-facing labels.

`scripts/server-check.ps1` verifies the configured attachment storage backend and confirms that `REG_ENGINE_STORAGE_ROOT` exists outside the Git checkout.

Architecture references:

- `docs/ADR/0004-phase-2-documents-scope.md`
- `docs/ADR/0005-attachment-storage-architecture.md`
- `docs/ADR/0006-generated-document-templates.md`
- `docs/ADR/0007-file-ref-dynamic-field.md`
- `docs/ADR/0008-binary-docx-template-versioning.md`
- `docs/ADR/0009-pdf-conversion.md`
- `docs/PHASE_2A_ATTACHMENT_ARCHITECTURE.md`
- `docs/PHASE_2C_GENERATED_DOCUMENT_TEMPLATES.md`

## Phase 2C Generated Document Foundation

Phase 2C introduced the generated document backend foundation. The first
template format is `docx_text_v1`: a constrained text-template renderer that
resolves placeholders from schema-driven card reads and stores a generated
`.docx` file through the same storage abstraction used by attachments. Phase 2D
adds authenticated card-workspace UI for generating and managing those outputs,
and Phase 2G adds authenticated UI for creating and archiving text templates.

Supported placeholders:

```text
{{ card.id }}
{{ card.display_name }}
{{ card.registry_id }}
{{ card.organization_id }}
{{ fields.<block_code>.<field_code> }}
```

Template create/archive requires `registry.schema.manage`. Document generation
and generated document archive require `cards.manage` in the card organization
and registry scope. Generated document reads use card visibility.

Do not commit template files, generated documents, or real personal data.
Generated outputs use storage prefix `generated_documents`. Public-link document
generate/upload/download remains deferred. Phase 2J.0 records
the accepted `file_ref` design in
`docs/ADR/0007-file-ref-dynamic-field.md`; Phase 2J.1 adds the database,
SQLAlchemy metadata, migration, and schema type registration foundation.
Phase 2J.2 adds backend service support for authenticated `file_ref`
set/read/clear behavior only. Phase 2J.3 adds transfer behavior by creating
target-card attachment links for active references and clearing archived
references with audit metadata. Phase 2J.4 adds authenticated REST card value
set/clear/read metadata support. Phase 2J.5 adds the authenticated
Russian-first card editor for selecting and clearing existing card attachments.
Phase 2J.6 adds generated-document rendering for `file_ref` as text only:
attachment title plus original filename, empty text for empty values, and an
`(архив)` marker for archived referenced attachments. Public-link editing
remains deferred.

Authenticated generated document API:

```powershell
POST   /api/v1/registries/{registry_id}/document-templates
POST   /api/v1/registries/{registry_id}/document-templates/upload
GET    /api/v1/registries/{registry_id}/document-templates
DELETE /api/v1/document-templates/{template_id}
GET    /api/v1/document-templates/{template_id}/versions
POST   /api/v1/document-templates/{template_id}/versions/upload
POST   /api/v1/cards/{card_id}/generated-documents
POST   /api/v1/cards/{card_id}/generated-documents/pdf
GET    /api/v1/cards/{card_id}/generated-documents
GET    /api/v1/generated-documents/{generated_document_id}
GET    /api/v1/generated-documents/{generated_document_id}/content
DELETE /api/v1/generated-documents/{generated_document_id}
```

Authenticated A4 card print-template API:

```powershell
POST   /api/v1/registries/{registry_id}/card-print-templates
GET    /api/v1/registries/{registry_id}/card-print-templates
GET    /api/v1/card-print-templates/{template_id}
POST   /api/v1/card-print-templates/{template_id}/versions
POST   /api/v1/card-print-templates/preview
GET    /api/v1/card-print-templates/{template_id}/blank-docx
GET    /api/v1/card-print-templates/{template_id}/blank-pdf
POST   /api/v1/registries/{registry_id}/card-print-templates/blank-docx
POST   /api/v1/registries/{registry_id}/card-print-templates/blank-pdf
```

Unified card-template layout API used by the contextual studio:

```powershell
GET    /api/v1/card-templates/{template_id}/layout
PATCH  /api/v1/card-templates/{template_id}/layout/form
POST   /api/v1/card-templates/{template_id}/layout/print-views
PATCH  /api/v1/card-templates/{template_id}/layout/print-views/{print_view_id}
POST   /api/v1/card-templates/{template_id}/layout/print-views/{print_view_id}/sync
POST   /api/v1/card-templates/{template_id}/layout/print-views/{print_view_id}/convert-linked-card
POST   /api/v1/cards/{card_id}/card-template-layout/{template_id}/generate-docx
POST   /api/v1/cards/{card_id}/card-template-layout/{template_id}/generate-pdf
```

`PATCH .../layout/form` requires the current `expected_revision`; stale writes
return HTTP `409` before layout mutation or audit creation. The service locks
the card-template row through validation and the audited write. Schema
membership refreshes preserve `field_schema_json.form_layout` and use the same
row-locking boundary so block/field changes cannot restore stale layout JSON.

`card_print_layout_v1` stores A4 millimeter geometry in layout JSON. New
layouts prefer `sections[]` plus `overlays[]`; old flat `items[]` payloads are
still accepted and normalized before validation/rendering. DOCX generation uses
editable Word tables for normalized sections, and PDF generation uses the same
normalized layout model.

## Phase 3A Card Export API

Authenticated card export API:

```powershell
GET /api/v1/registries/{registry_id}/exports/cards?format=json
GET /api/v1/registries/{registry_id}/exports/cards?format=csv
GET /api/v1/registries/{registry_id}/exports/cards?format=xlsx
```

The export endpoint uses the same backend card visibility rules as card list/read. JSON export preserves schema-driven `blocks -> instances -> fields` structure. CSV and XLSX export are field-row based with explicit `block_code`, `block_instance_ordinal`, and `field_code` columns so duplicate field codes in different blocks remain unambiguous. XLSX export uses the same technical row contract as CSV in one worksheet.

Attachment and generated-document exports include metadata only. Storage keys, checksums, stored file ids, filesystem paths, and binary bytes are not exported. Each export writes an `audit_events` row with `action=export` and `object_type=registry`.

The authenticated registry workspace includes Russian-first controls for
downloading JSON/CSV/XLSX card exports through the existing export API. Binary
attachment/document export remains deferred to later explicit phases.

## Phase 3B CSV Import Preview API

Authenticated card import preview API:

```powershell
POST /api/v1/registries/{registry_id}/imports/cards/preview
```

Request body:

```json
{
  "csv_content": "card_id,organization_id,display_name,block_code,field_code,value\n..."
}
```

XLSX preview uses multipart form data with a `file` field. The workbook must
use the same row-oriented columns as CSV; the first worksheet is read.

Import runtime limits:

```powershell
$env:REG_ENGINE_MAX_IMPORT_BYTES = "5242880"
$env:REG_ENGINE_MAX_IMPORT_ROWS = "10000"
```

`REG_ENGINE_MAX_IMPORT_BYTES` bounds CSV payload text and uploaded XLSX bytes
before preview/commit processing. `REG_ENGINE_MAX_IMPORT_ROWS` bounds parsed
CSV/XLSX data rows for preview and commit. Oversized imports return stable 4xx
errors and do not mutate cards or field values.

Required CSV columns:

- `card_id`
- `organization_id`
- `display_name`
- `block_code`
- `field_code`
- `value`

Rows with `card_id` are previewed as updates. Rows without `card_id` are previewed as new-card rows and require `organization_id` and `display_name`. Field mapping uses `block_code.field_code`, matching the schema-driven export format. Preview validates card/organization scope and dynamic field values through backend card service rules, then returns per-row `valid` or `invalid` status and errors.

Preview does not create cards, update field values, upload files, attach documents, or write audit events. CSV/XLSX import commit is exposed separately. The authenticated registry workspace can paste CSV content or choose an XLSX file, run preview, inspect valid/invalid row summaries, and keep commit disabled while preview has errors or stale input content. Binary attachment/document import/export remains deferred.

## Phase 3C CSV Import Commit API

Authenticated card import commit API:

```powershell
POST /api/v1/registries/{registry_id}/imports/cards/commit
```

Request body:

```json
{
  "csv_content": "import_key,card_id,organization_id,display_name,block_code,field_code,value\n..."
}
```

XLSX commit uses multipart form data with a `file` field and reuses the same
row-oriented contract as XLSX preview.

The commit endpoint reuses the same CSV/XLSX shape and validation rules as preview.
`import_key` is optional. Rows with `card_id` update an existing editable card.
Rows without `card_id` create a new card; multiple create rows with the same
`import_key` are committed into one new card and must use the same
`organization_id` and `display_name`.

The whole batch must preview as valid before any mutation starts. Invalid
batches return the preview payload in `detail` with row-level errors and do not
create cards, update field values, or write import audit events. Valid batches
commit atomically, write schema-driven field values through `CardService`, and
record an `audit_events` row with `action=import_commit`.

The authenticated registry workspace can apply a CSV import commit after a
valid preview, or an XLSX import commit after a valid XLSX preview, and then
refresh card/audit data. Binary attachment/document import/export and reference
label enrichment remain deferred.

## Phase 4A Report Foundation API

Authenticated report API:

```powershell
POST   /api/v1/registries/{registry_id}/report-templates
GET    /api/v1/registries/{registry_id}/report-templates
PATCH  /api/v1/report-templates/{template_id}
DELETE /api/v1/report-templates/{template_id}
POST   /api/v1/report-templates/{template_id}/runs
GET    /api/v1/registries/{registry_id}/report-runs
GET    /api/v1/report-runs/{report_run_id}
GET    /api/v1/report-runs/{report_run_id}/content
DELETE /api/v1/report-runs/{report_run_id}
```

Phase 4A stores report output through the storage abstraction under the
`reports` prefix and keeps response metadata safe: report run reads do not
expose storage keys, filesystem paths, checksums, or stored-file ids. Supported
report types are `registry_cards`, `card_detail`, and `period_summary`;
supported output formats are `json`, `csv`, `xlsx`, and `pdf`.

Report templates require `registry.schema.manage`. Report generation and run
archive require card management scope, while report run reads/downloads use the
same backend card visibility scope as card reads. Generated report content is
audited with report template/run create, generate, download, and archive
events. Report template updates support safe settings changes for `name`,
`description`, `parameters_schema_json`, `default_parameters_json`,
`report_type`, and `output_format`; existing report runs keep their original
type and output metadata.

The backend validates the supported flat report parameter schema subset at the
service/API boundary before generation: `required`, scalar `string`, `number`,
`integer`, `boolean`, string `minLength` / `maxLength` / `pattern`, numeric
`minimum` / `maximum` / `exclusiveMinimum` / `exclusiveMaximum` / `multipleOf`,
`enum`, and `oneOf[].const`. Report template create/update rejects invalid
supported-schema structures and invalid default parameters instead of storing
broken run-form state. Generated report output bytes are registered for
rollback cleanup after storage write, so a later database rollback removes the
uncommitted report object.

The authenticated registry workspace includes Russian-first report controls for
creating, updating, and archiving report templates, editing template parameter
schema/default JSON, generating basic visual run-parameter controls from flat
schema properties including scalar `enum` values, `oneOf` option titles,
`format: "date"` string inputs, JSON Schema `description` hints, and JSON
Schema `default` values, using template default parameter JSON or schema
defaults for report runs when manual run JSON is empty, validating supported
flat required parameters and scalar `minLength`/`maxLength`/`minimum`/`maximum`
constraints plus `pattern`/`multipleOf` and `exclusiveMinimum` /
`exclusiveMaximum` constraints before generation, choosing or editing JSON,
CSV, XLSX, or PDF output,
generating report runs, downloading generated report content, and archiving
report runs through the existing report API. Report run lists show the newest
runs first and display output format plus output filename. Archived
report templates and report runs can be shown with Russian archive toggles;
archived rows display `Архивировано`, archived templates cannot be edited or
archived again, and archived report runs remain downloadable through
`include_archive=true` while repeated archive actions stay disabled.

Report run content downloads currently read the authorized report object into
memory through the storage abstraction and return a normal response. Real
streaming is deferred until the storage boundary exposes open-file or streaming
reads; wrapping already-loaded bytes in `StreamingResponse` is intentionally
not used.

Report scheduling, charts, public-link report workflows, binary
attachment/document report export, full visual report builder polish, and MCP
write tools remain deferred.

## Phase 5A MCP Read-Only Gateway

Phase 5A adds a read-only MCP JSON-RPC gateway over the existing REST API. The
MCP layer is an API client only: it must not import SQLAlchemy, Alembic,
database sessions, backend models, or backend service classes.

Run locally:

```powershell
cd C:\Users\admin-2\Documents\reg_engine
$env:REG_ENGINE_API_BASE_URL = "http://127.0.0.1:8000"
$env:REG_ENGINE_API_TOKEN = "<bearer-token>"
powershell -ExecutionPolicy Bypass -File scripts/dev-mcp.ps1
```

The installed backend package also exposes:

```powershell
cd backend
python -m app.mcp.server
reg-engine-mcp
```

Runtime settings:

- `REG_ENGINE_API_BASE_URL`: API base URL, default `http://127.0.0.1:8000`.
  It must be an absolute `http://` or `https://` URL.
- `REG_ENGINE_API_TOKEN`: bearer token used for protected API calls.
- `REG_ENGINE_MCP_TIMEOUT_SECONDS`: HTTP timeout, default `30`.
- `REG_ENGINE_MCP_MAX_CONTENT_BYTES`: maximum report/generated-document content
  bytes that MCP content-read tools may return before base64 encoding, default
  `1048576`.

Read-only MCP tools:

- `reg_engine_health`
- `reg_engine_list_organizations`
- `reg_engine_list_registries`
- `reg_engine_read_registry_schema`
- `reg_engine_list_cards`
- `reg_engine_read_card`
- `reg_engine_list_audit_events`
- `reg_engine_list_report_templates`
- `reg_engine_list_report_runs`
- `reg_engine_read_report_run`
- `reg_engine_list_document_templates`
- `reg_engine_list_document_template_versions`
- `reg_engine_list_generated_documents`
- `reg_engine_read_generated_document`
- `reg_engine_read_report_run_content`
- `reg_engine_read_generated_document_content`

All read-only tools are marked with `readOnlyHint=true` and use HTTP `GET` only.
MCP API requests send `X-Reg-Engine-Source: mcp`; user audit events created
through the API can therefore use `source=mcp`. Direct database access, MCP-side
RBAC bypasses, public-link MCP workflows, binary downloads, and standalone MCP
auth are not part of the MCP scope so far.

MCP write tools:

- `reg_engine_create_registry`
- `reg_engine_update_registry`
- `reg_engine_archive_registry`
- `reg_engine_create_form_block`
- `reg_engine_update_form_block`
- `reg_engine_archive_form_block`
- `reg_engine_create_form_field`
- `reg_engine_update_form_field`
- `reg_engine_archive_form_field`
- `reg_engine_create_card`
- `reg_engine_update_card`
- `reg_engine_archive_card`
- `reg_engine_set_card_field_value`
- `reg_engine_set_card_values`
- `reg_engine_create_card_block_instance`
- `reg_engine_archive_card_block_instance`
- `reg_engine_transfer_card`
- `reg_engine_create_report_template`
- `reg_engine_update_report_template`
- `reg_engine_archive_report_template`
- `reg_engine_generate_report_run`
- `reg_engine_archive_report_run`
- `reg_engine_create_document_template`
- `reg_engine_archive_document_template`
- `reg_engine_generate_document`
- `reg_engine_generate_pdf_document`
- `reg_engine_archive_generated_document`

The first write tool calls `POST /api/v1/registries` through the REST API. It
requires `code` and `name`, accepts optional `description`, is annotated with
`readOnlyHint=false`, and relies on backend system-admin permission checks plus
API-side audit with `source=mcp`.

Registry update calls `PATCH /api/v1/registries/{registry_id}` with provided
`name`, `description`, and/or `lifecycle_status`. Registry archive calls
`DELETE /api/v1/registries/{registry_id}` and requires `confirm_archive=true`.
Both tools use `readOnlyHint=false`, rely on existing backend permission checks
and audit, and do not access the database directly.

Schema-builder tools call existing form block and form field REST endpoints:
`POST /api/v1/registries/{registry_id}/blocks`,
`PATCH /api/v1/blocks/{block_id}`, `DELETE /api/v1/blocks/{block_id}`,
`POST /api/v1/blocks/{block_id}/fields`,
`PATCH /api/v1/fields/{field_id}`, and
`DELETE /api/v1/fields/{field_id}`. Block/field archive tools require
`confirm_archive=true`. All schema-builder MCP writes rely on existing
`registry.schema.manage` permission checks, locked/system schema protections,
archive semantics, and API-side audit with `source=mcp`.

Card lifecycle tools call existing card REST endpoints:
`POST /api/v1/registries/{registry_id}/cards`,
`PATCH /api/v1/cards/{card_id}`, and `DELETE /api/v1/cards/{card_id}`.
Card archive requires `confirm_archive=true`. These tools do not edit dynamic
field values; card visibility, edit permissions, archived/superseded
protection, organization scope, and audit stay in the existing REST API/service
layer.

Card field-value tools call existing card value REST endpoints:
`PATCH /api/v1/cards/{card_id}/fields/{field_id}` and
`PATCH /api/v1/cards/{card_id}/values`. The single-value tool forwards `value`
and optional `block_instance_id`; the bulk tool forwards the existing
`values: [{ field_id, value, block_instance_id }]` payload and rejects an empty
array before sending a request. Field validation, field edit permissions,
repeatable-block instance rules, `file_ref` existing-attachment rules,
archived/superseded edit protection, atomic bulk behavior, and audit stay in
the existing REST API/service layer.

## Phase 5B MCP Hardening And Config

Phase 5B keeps the Phase 5A read-only/API-only boundary and hardens the stdio
gateway:

- `REG_ENGINE_API_BASE_URL` is validated as an absolute `http://` or
  `https://` URL before requests are sent;
- malformed JSON-RPC input returns parse error `-32700` and does not terminate
  the stdio server loop;
- invalid `tools/call` JSON-RPC params return `-32602`;
- tool argument errors are returned as MCP tool results with `isError=true`
  instead of crashing the JSON-RPC handler.

This phase still does not add MCP write tools, direct database access, MCP-side
permission shortcuts, standalone MCP auth, public-link workflows, or binary
download tools.

## Phase 5C MCP Mutation Client Foundation

Phase 5C keeps the published MCP tool surface read-only, but prepares the API
client boundary for future explicitly approved write tools:

- `RegEngineApiClient.post_json(...)` sends JSON `POST` requests;
- `RegEngineApiClient.patch_json(...)` sends JSON `PATCH` requests;
- `RegEngineApiClient.delete_json(...)` sends `DELETE` requests;
- mutation requests preserve bearer auth, `Accept: application/json`,
  `User-Agent: reg-engine-mcp/0.1`, and `X-Reg-Engine-Source: mcp`;
- JSON body requests include `Content-Type: application/json`;
- API errors continue to return MCP tool errors through the existing error path
  when a future tool calls these methods.

No MCP write tools are exposed in Phase 5C. Future write-tool phases must name
the exact tool set, argument schemas, confirmation requirements for destructive
actions, REST endpoints, audit expectations, and PostgreSQL-backed validation
strategy before adding user-visible MCP write capabilities.

## Phase 5D MCP Registry Create Write Tool

Phase 5D exposes the first narrow MCP write tool:

- `reg_engine_create_registry`

The tool sends JSON to `POST /api/v1/registries` through `RegEngineApiClient`.
It accepts required `code` and `name` strings plus optional `description`.
Backend system-admin permission checks and registry-create audit remain in the
existing REST API/service layer. This create operation is non-destructive, so it
does not require a separate destructive-action confirmation argument.

This phase does not expose registry update/archive, schema mutation, card
mutation, import/export mutation, document/report mutation, public-link
workflows, binary download tools, direct database access, standalone MCP auth,
frontend UI, or a database migration.

## Phase 5E MCP Registry Update And Archive Write Tools

Phase 5E adds two registry write tools:

- `reg_engine_update_registry`
- `reg_engine_archive_registry`

`reg_engine_update_registry` sends `PATCH /api/v1/registries/{registry_id}` with
only provided update fields. `reg_engine_archive_registry` sends
`DELETE /api/v1/registries/{registry_id}` only when `confirm_archive=true`.
Archive remains a backend archive workflow, not physical deletion, but MCP still
requires explicit confirmation because it is destructive from the user's
workflow perspective.

This phase does not expose schema mutation, card mutation, import/export
mutation, document/report mutation, public-link workflows, binary download
tools, direct database access, standalone MCP auth, frontend UI, or a database
migration.

## Phase 5F MCP Schema Builder Write Tools

Phase 5F adds six schema-builder write tools:

- `reg_engine_create_form_block`
- `reg_engine_update_form_block`
- `reg_engine_archive_form_block`
- `reg_engine_create_form_field`
- `reg_engine_update_form_field`
- `reg_engine_archive_form_field`

These tools call only the existing REST API endpoints for form blocks and form
fields. Create tools send required values plus provided optional fields. Update
tools send only provided update fields and reject empty update payloads. Archive
tools require `confirm_archive=true` before sending `DELETE`.

This phase does not expose card mutation, import/export mutation,
document/report mutation, public-link workflows, binary download tools, direct
database access, standalone MCP auth, frontend UI, or a database migration.

## Phase 5G MCP Card Lifecycle Write Tools

Phase 5G adds three card lifecycle write tools:

- `reg_engine_create_card`
- `reg_engine_update_card`
- `reg_engine_archive_card`

These tools call only the existing REST API endpoints for card create, metadata
update, and archive. Create sends required `organization_id` and `display_name`
plus provided optional fields. Update sends only provided metadata fields and
rejects empty update payloads. Archive requires `confirm_archive=true` before
sending `DELETE`.

This phase does not expose field-value mutation, block-instance mutation, card
transfer, import/export mutation, document/report mutation, public-link
workflows, binary download tools, direct database access, standalone MCP auth,
frontend UI, or a database migration.

## Phase 5H MCP Card Field Value Write Tools

Phase 5H adds two card field-value write tools:

- `reg_engine_set_card_field_value`
- `reg_engine_set_card_values`

These tools call only the existing REST API endpoints for single and bulk
authenticated card value updates. They forward JSON `value` payloads without
MCP-side schema coercion, so backend field validation remains authoritative.
Bulk updates use the existing atomic REST endpoint and reject empty `values`
arrays before sending a request.

This phase does not expose block-instance mutation, card transfer,
import/export mutation, document/report mutation, public-link workflows,
attachment upload/download, binary download tools, direct database access,
standalone MCP auth, frontend UI, or a database migration.

## Phase 5I MCP Card Block Instance Write Tools

Phase 5I adds two card block-instance write tools:

- `reg_engine_create_card_block_instance`
- `reg_engine_archive_card_block_instance`

These tools call only the existing REST API endpoints for authenticated card
block-instance create/archive operations. Create sends
`POST /api/v1/cards/{card_id}/blocks/{block_id}/instances`. Archive sends
`DELETE /api/v1/card-block-instances/{block_instance_id}` only when
`confirm_archive=true`.

Repeatable block creation, non-repeatable block protection, locked/system block
protection, required-minimum instance protection, card edit permissions,
archived/superseded edit protection, and audit remain backend-enforced through
the existing REST API and service layer.

This phase does not expose field-value mutation beyond Phase 5H, card
transfer, import/export mutation, document/report mutation, public-link
workflows, attachment upload/download, binary download tools, direct database
access, standalone MCP auth, frontend UI, or a database migration.

## Phase 5J MCP Card Transfer Write Tool

Phase 5J adds one card transfer write tool:

- `reg_engine_transfer_card`

This tool calls only the existing REST API endpoint for authenticated card
transfer. It sends `POST /api/v1/cards/{card_id}/transfer` with
`target_organization_id` only when `confirm_transfer=true`.

Transfer permissions, target organization visibility, source-card superseding,
target-card creation, copied dynamic values, `file_ref` copy/clear behavior,
card relation creation, archive visibility, and audit remain backend-enforced
through the existing REST API and service layer.

This phase does not expose field-value mutation beyond Phase 5H,
block-instance mutation beyond Phase 5I, public-link workflows, report or
document mutation, attachment upload/download, import/export mutation, binary
download tools, direct database access, standalone MCP auth, frontend UI, or a
database migration.

## Phase 5K MCP Report Template Write Tools

Phase 5K adds three report template write tools:

- `reg_engine_create_report_template`
- `reg_engine_update_report_template`
- `reg_engine_archive_report_template`

These tools call only the existing REST API endpoints for authenticated report
template create/update/archive operations. Create sends
`POST /api/v1/registries/{registry_id}/report-templates`, update sends
`PATCH /api/v1/report-templates/{template_id}` with only provided update
fields, and archive sends `DELETE /api/v1/report-templates/{template_id}` only
when `confirm_archive=true`.

Registry visibility, report template permissions, supported report type and
output format validation, parameter schema/default validation, archive
semantics, and audit remain backend-enforced through the existing REST API and
service layer.

This phase does not generate report runs, download report output, archive
report runs, mutate documents, mutate public links, upload or download
attachments, import/export data, expose binary download tools, add direct
database access, add standalone MCP auth, add frontend UI, or require a
database migration.

## Phase 5L MCP Report Run Write Tools

Phase 5L adds two report run write tools:

- `reg_engine_generate_report_run`
- `reg_engine_archive_report_run`

These tools call only the existing REST API endpoints for authenticated report
run generation/archive operations. Generate sends
`POST /api/v1/report-templates/{template_id}/runs` with optional
`parameters`. Archive sends `DELETE /api/v1/report-runs/{report_run_id}` only
when `confirm_archive=true`.

Report permissions, report template visibility, supported report type and
output format validation, parameter/default validation, output storage, archive
semantics, and audit remain backend-enforced through the existing REST API and
service layer.

This phase does not download report output, expose binary content, mutate
report templates beyond Phase 5K, mutate documents, mutate public links, upload
or download attachments, import/export data, add direct database access, add
standalone MCP auth, add frontend UI, or require a database migration.

## Phase 5M MCP Document Template Write Tools

Phase 5M adds two text document-template write tools:

- `reg_engine_create_document_template`
- `reg_engine_archive_document_template`

These tools call only the existing REST API endpoints for authenticated text
document-template create/archive operations. Create sends
`POST /api/v1/registries/{registry_id}/document-templates` with required
`code`, `name`, and `template_body` plus provided optional metadata. Archive
sends `DELETE /api/v1/document-templates/{template_id}` only when
`confirm_archive=true`.

Registry visibility, document-template permissions, text template validation,
version metadata, archive semantics, and audit remain backend-enforced through
the existing REST API and service layer.

This phase does not upload binary `.docx` templates, upload template versions,
generate or archive generated documents, download document content, mutate
public links, upload or download attachments, import/export data, add direct
database access, add standalone MCP auth, add frontend UI, or require a
database migration.

## Phase 5N MCP Generated Document Write Tools

Phase 5N adds three generated-document write tools:

- `reg_engine_generate_document`
- `reg_engine_generate_pdf_document`
- `reg_engine_archive_generated_document`

These tools call only the existing REST API endpoints for authenticated
generated-document create/PDF-create/archive operations. Generate sends
`POST /api/v1/cards/{card_id}/generated-documents`, PDF generate sends
`POST /api/v1/cards/{card_id}/generated-documents/pdf`, and archive sends
`DELETE /api/v1/generated-documents/{generated_document_id}` only when
`confirm_archive=true`.

Card/template permissions, document rendering, output storage, archive
semantics, and audit remain backend-enforced through the existing REST API and
service layer.

This phase does not download generated document content, expose binary content,
upload binary `.docx` templates, upload template versions, mutate document
templates beyond Phase 5M, mutate public links, upload or download attachments,
import/export data, add direct database access, add standalone MCP auth, add
frontend UI, or require a database migration.

## Phase 5O MCP Document Metadata Read Tools

Phase 5O adds four read-only document metadata tools:

- `reg_engine_list_document_templates`
- `reg_engine_list_document_template_versions`
- `reg_engine_list_generated_documents`
- `reg_engine_read_generated_document`

These tools call only existing REST API `GET` endpoints:
`/api/v1/registries/{registry_id}/document-templates`,
`/api/v1/document-templates/{template_id}/versions`,
`/api/v1/cards/{card_id}/generated-documents`, and
`/api/v1/generated-documents/{generated_document_id}`. Each accepts
`include_archive` where the matching REST endpoint supports archive scope.

Registry/card/template/generated-document visibility and archive rules remain
enforced by the existing REST API and service layer.

This phase does not download generated document content, expose binary content,
download binary template content, upload binary `.docx` templates, upload
template versions, mutate document templates, generate/archive documents, mutate
public links, upload or download attachments, import/export data, add direct
database access, add standalone MCP auth, add frontend UI, or require a database
migration.

## Phase 5P MCP Report And Generated Document Content Read Tools

Phase 5P adds two read-only content tools:

- `reg_engine_read_report_run_content`
- `reg_engine_read_generated_document_content`

These tools call only existing authenticated REST API `GET` content endpoints:
`/api/v1/report-runs/{report_run_id}/content` and
`/api/v1/generated-documents/{generated_document_id}/content`. The MCP response
returns `content_base64`, `content_type`, `content_length_bytes`, safe filename
metadata, and the REST `Content-Disposition` header only when the caller passes
`confirm_content_read=true`. This explicit flag records that the MCP caller is
intentionally moving report/document bytes into the MCP client context.
Permissions, archive scope, download audit, storage reads, and safe download
filenames remain enforced by the REST API and service layer.

Phase 5Q hardens these content reads with
`REG_ENGINE_MCP_MAX_CONTENT_BYTES`, default `1048576`. If the REST content body
is larger than the configured limit, the MCP tool returns a controlled tool
error and does not include `content_base64`. MCP API errors are normalized so
operator-useful validation messages remain available while storage paths, SQL
details, tracebacks, and raw internals are not surfaced through MCP tool
errors.

This phase does not expose attachment content, document-template binary content,
public-link document workflows, public-link attachment workflows, import/export
MCP tools, new write tools, direct database access, standalone MCP auth,
frontend UI, database schema changes, or streaming downloads. Content is still
read through the existing bounded MVP REST/storage path and base64 encoded for
MCP structured output.

## Phase 5Q MCP Content And Cross-Cutting Stabilization

Phase 5Q completes the MCP content-read hardening checkpoint:

- `reg_engine_read_report_run_content` and
  `reg_engine_read_generated_document_content` require
  `confirm_content_read=true`;
- `REG_ENGINE_MCP_MAX_CONTENT_BYTES` limits returned content before base64
  encoding;
- oversized content returns a deterministic MCP tool error without
  `content_base64`;
- MCP write-tool safety annotations and destructive confirmation requirements
  are covered by aggregate regression tests;
- MCP API and unexpected tool errors are normalized to avoid exposing storage
  paths, SQL traces, tracebacks, or raw internals.

No new MCP tools, backend schema changes, frontend UI, import/export MCP flows,
attachment content tools, document-template content tools, public-link document
workflows, report formats, or streaming downloads are included.

## Phase 5R User Scenario UAT Bugfix And Product Readiness

Phase 5R completes the current user-scenario hardening slice:

- scoped card/org users no longer see unrelated global users/roles/access/audit
  permission errors while working in allowed card workflows;
- Phase 8K supersedes the earlier default bulk form in the ordinary card view:
  cards now open read-first in exact geometry and edit one block in place. The
  atomic bulk values API still backs block saves, while `file_ref` remains in
  the attachment-aware single-field editor;
- existing cards may correct `org_unit_id` inside the same organization through
  PATCH `/api/v1/cards/{card_id}` and the Russian card metadata form;
- the card list UI exposes search, organization filter, archive/superseded
  visibility, and lifecycle status display through the existing list API and
  backend RBAC;
- CSV/XLSX import preview and commit enforce `REG_ENGINE_MAX_IMPORT_BYTES` and
  `REG_ENGINE_MAX_IMPORT_ROWS`;
- public-link attachment list responses expose safe upload-limit metadata, and
  the public UI shows `Лимит загрузок исчерпан` before submit without blocking
  attachment list/download;
- the UAT matrix, backup/restore drill, report parameter schema subset, and
  metadata-only binary export expectations are recorded in
  `docs/PHASE_5R_UAT_MATRIX.md`.

Phase 5R does not add new report formats, new MCP tool categories,
public-link document workflows, binary attachment/document export, a new
storage backend, service desk integration, MDB migration, or hardcoded
HR-specific fields.

## Phase 2D Frontend Document Workflows

The authenticated card workspace now includes Russian-first `Вложения` and
`Документы` panels. Attachments support upload, download, and archive. Generated
documents support selecting an existing template, generating a document from the
current card, downloading generated content, and archiving generated document
records.

The public-link edit page exposes Russian-first attachment list/upload/download
controls for active public edit links. It does not expose attachment archive,
document generation, generated document download, or document-template controls.

## Phase 2G Document Template Management UI

The authenticated card workspace now includes Russian-first document-template
management inside the `Документы` panel. Authorized users can create active
`docx_text_v1` text templates with `code`, `name`, optional `description`,
`template_body`, and `output_filename_template`, then archive templates through
the existing authenticated API.

Public-link screens expose attachment list/upload/download in Phase 2H, but do
not expose template management, document generation, generated-document download,
or attachment archive/delete controls. Binary `.docx` layout conversion to PDF
and public generated-document workflows remain deferred.

## Phase 2H Public-Link Attachment Workflows

Public-link card editing now includes Russian-first `Вложения` controls for
active public edit links. A public link can list, upload, and download active
card attachments only when the link is active, not expired, `can_edit=true`,
and the target card has `public_edit_enabled=true`.

Public uploads use multipart form data with `raw_token`, `file`, and optional
`title`. Uploads increment `card_public_links.attachment_upload_count` only
after successful metadata/storage creation. List and download do not increment
usage. Public upload/download actions write `audit_events` with
`actor_type=public_link`.

Public-link attachment responses are intentionally narrower than authenticated
attachment responses: they do not expose `stored_file_id`, `checksum_sha256`,
storage keys, or filesystem paths. Public archive/delete, public generated
documents, template management, PDF conversion, `file_ref`, import/export, and
MCP remain outside this phase.

## Phase 2I Public-Link Attachment Limit Semantics

Phase 2I uses option C for public-link usage limits. Public field edits and
public attachment uploads have separate counters:

- `max_uses` / `used_count` limit public field edits;
- `max_attachment_uploads` / `attachment_upload_count` limit public attachment
  uploads;
- list/download do not consume either counter;
- if attachment upload limit is exhausted, upload is denied but list/download
  remain available while the link is active and the card is public-editable;
- disabled, expired, archived, superseded, and non-editable card/link states
  still deny public attachment operations.

The public-link upload form validates missing files with the Russian message
`Выберите файл`.

## Phase 2J Public-Link Attachment Quota API

Phase 2J adds `max_attachment_uploads` to the authenticated public-link create
API. Public-link read/list responses continue to expose
`max_attachment_uploads` and `attachment_upload_count`. No PATCH endpoint for
existing public-link settings is exposed in this slice; operators should disable
and recreate a link when its upload limit must change. Public attachment upload
quota checks use a row-level lock and refresh the `card_public_links` row before
checking/incrementing `attachment_upload_count`.

## Remote Infrastructure Configuration

This repository is public. Do not commit concrete runtime hostnames, LAN IP addresses, SSH users, private key paths, database endpoints, passwords, deploy-key values, or operator-only runbooks.

Remote scripts read operational values from environment variables or from an ignored local file:

```powershell
Copy-Item scripts/local.reg_engine.example.psd1 scripts/local.reg_engine.psd1
```

Supported local config keys and matching environment variables:

| Local config key | Environment variable |
| --- | --- |
| `ServerHost` | `REG_ENGINE_SERVER_HOST` |
| `ServerUser` | `REG_ENGINE_SERVER_USER` |
| `ServerTarget` | `REG_ENGINE_SERVER_TARGET` |
| `ServerRepo` | `REG_ENGINE_SERVER_REPO` |
| `ServiceName` | `REG_ENGINE_SERVICE_NAME` |
| `ServiceHost` | `REG_ENGINE_SERVICE_HOST` |
| `ServicePort` | `REG_ENGINE_SERVICE_PORT` |
| `ServiceEnvFile` | `REG_ENGINE_SERVICE_ENV_FILE` |
| `PgHost` | `REG_ENGINE_PGHOST` |
| `PgPort` | `REG_ENGINE_PGPORT` |
| `PgDatabase` | `REG_ENGINE_PGDATABASE` |
| `PgUser` | `REG_ENGINE_PGUSER` |

The local config file is ignored by Git and must remain machine-local.

## Server Service Commands

`scripts/service.ps1` installs and controls the backend API systemd service on the configured server. By default it manages `reg-engine.service`, runs `backend/.venv/bin/python -m uvicorn app.main:app`, reads `/etc/reg_engine/reg_engine.env`, and listens on port `8000`.

```powershell
cd C:\Users\admin-2\Documents\reg_engine
powershell -ExecutionPolicy Bypass -File scripts/service.ps1 -Command start
powershell -ExecutionPolicy Bypass -File scripts/service.ps1 -Command status
powershell -ExecutionPolicy Bypass -File scripts/service.ps1 -Command logs
powershell -ExecutionPolicy Bypass -File scripts/service.ps1 -Command stop
```

Use `-Command restart` after deploying new backend code. Use `-NoInstall` with `start` or `restart` only when the existing unit file should not be refreshed.

`scripts/deploy-frontend.ps1` builds `frontend/dist` locally, uploads that generated artifact to the configured server checkout, restarts the backend service, and verifies that the frontend and `/api/v1/health` respond from the same origin.

```powershell
cd C:\Users\admin-2\Documents\reg_engine
powershell -ExecutionPolicy Bypass -File scripts/deploy-frontend.ps1
```

Binary template upload uses multipart form data with `file`, `code`, `name`,
optional `description`, and optional `output_filename_template`. Version upload
uses multipart form data with `file`. Uploaded template files are stored through
the storage abstraction under the `document_templates` prefix. Version read
responses expose safe metadata and omit storage keys, checksums, and stored file
ids. Generated documents record the `template_version_id` used for rendering.
The first binary renderer replaces supported placeholders in `.docx` XML parts
when placeholders are contiguous text. Authenticated PDF generation renders
`docx_text_v1` templates directly to `application/pdf` and stores them as
generated documents. Binary `.docx` layout conversion to PDF, public document
flows, template download, and advanced Word run/content-control templating
remain deferred.

After deployment, open the server service root URL in a browser. The API docs
remain available at `/docs`.

Access management API:

```powershell
GET    /api/v1/users
POST   /api/v1/users
GET    /api/v1/users/{user_id}
PATCH  /api/v1/users/{user_id}
DELETE /api/v1/users/{user_id}
GET    /api/v1/roles
GET    /api/v1/roles/{role_id}
GET    /api/v1/permissions
GET    /api/v1/access-grants
POST   /api/v1/access-grants
DELETE /api/v1/access-grants/{grant_id}
```

User/access endpoints require bearer auth. `system_admin` is represented by `users.is_superuser=true`; scoped admins use `users.manage`, `roles.read`, `permissions.read`, and `access_grants.manage` grants inside organization scope.

Organization unit API:

```powershell
GET    /api/v1/organizations/{organization_id}/org-units
POST   /api/v1/organizations/{organization_id}/org-units
GET    /api/v1/org-units/{org_unit_id}
PATCH  /api/v1/org-units/{org_unit_id}
DELETE /api/v1/org-units/{org_unit_id}
```

Org units are filters/reference data and are not RBAC boundaries in v1. Reads use organization visibility scope. Create, update, and archive require `organizations.manage` in organization scope or superuser access.

Registry API:

```powershell
GET    /api/v1/registries
POST   /api/v1/registries
GET    /api/v1/registries/{registry_id}
PATCH  /api/v1/registries/{registry_id}
DELETE /api/v1/registries/{registry_id}
GET    /api/v1/registries/{registry_id}/schema
```

`PATCH /api/v1/registries/{registry_id}` supports safe metadata updates: `name`, `description`, and draft/active `lifecycle_status`. Use `DELETE /api/v1/registries/{registry_id}` for soft archive; archived registries can be read through list/read archive scope with `include_archive=true`.

Card block instance API:

```powershell
POST   /api/v1/cards/{card_id}/blocks/{block_id}/instances
DELETE /api/v1/card-block-instances/{block_instance_id}
```

Repeatable block instances can be soft-archived. Non-repeatable, system, locked, and required-minimum block instances are protected by the backend. Normal card reads hide archived instances; `GET /api/v1/cards/{card_id}?include_archive=true` includes archived block instances and retained field values.

Card value API:

```powershell
PATCH /api/v1/cards/{card_id}/fields/{field_id}
PATCH /api/v1/cards/{card_id}/values
```

`PATCH /api/v1/cards/{card_id}/values` performs an atomic bulk update with a payload containing `values: [{ field_id, value, block_instance_id }]`. It reuses the same validation, permission checks, and audit behavior as single-field updates; if one value is invalid, no value from that bulk request is saved.

## Bootstrap Commands

Seed core permissions and roles:

```powershell
cd C:\Users\admin-2\Documents\reg_engine
powershell -ExecutionPolicy Bypass -File scripts/bootstrap.ps1 -Command seed
```

Create or update the first superadmin user:

```powershell
cd C:\Users\admin-2\Documents\reg_engine
$env:REG_ENGINE_SUPERADMIN_PASSWORD_HASH = Read-Host "Superadmin password hash"
powershell -ExecutionPolicy Bypass -File scripts/bootstrap.ps1 `
  -Command create-superadmin `
  -Email "<admin@example.com>" `
  -DisplayName "<Admin Name>" `
  -PasswordHashEnvVar REG_ENGINE_SUPERADMIN_PASSWORD_HASH
Remove-Item Env:\REG_ENGINE_SUPERADMIN_PASSWORD_HASH
```

The bootstrap commands use `DATABASE_URL` unless `-DatabaseUrl` is supplied. They are idempotent and must not be pointed at production unless the intended database target is explicit. Prefer `-PasswordHashEnvVar` over `-PasswordHash` so private operator input is not written into shell history, process arguments, or command logs.

## Direct Frontend Commands

```powershell
pnpm -C frontend lint
pnpm -C frontend typecheck
pnpm -C frontend test:run
pnpm -C frontend build
pnpm -C frontend e2e
```

## Database Check Password

The scripts do not store database passwords in Git. For full PostgreSQL TCP login checks, set the password in the current PowerShell session:

```powershell
$env:REG_ENGINE_PGPASSWORD = "<password>"
powershell -ExecutionPolicy Bypass -File scripts/server-check.ps1
```

The server can also keep the same value outside the repo in its runtime environment file.

Use `scripts/check.ps1 -SkipRemote` when you need local lint/typecheck/test/build checks without GitHub SSH or server SSH reachability.

## Server

- SSH target: configured by `REG_ENGINE_SERVER_TARGET` or `ServerHost`/`ServerUser`.
- Server checkout: configured by `REG_ENGINE_SERVER_REPO`.
- GitHub remote: `git@github.com:BorisDruzak/reg_engine.git`
- PostgreSQL endpoint: configured by `REG_ENGINE_PGHOST`, `REG_ENGINE_PGPORT`, `REG_ENGINE_PGDATABASE`, and `REG_ENGINE_PGUSER`.

## Known Remaining Non-Goals After Core Schema v1 API Foundation

- No server-side token revocation table yet.
- No binary attachment/document import/export workflows yet.
- No report scheduling, report charts, or visual report builder yet.
- No public-link attachment archive/delete.
- No public generated-document workflows.
- No binary `.docx` layout conversion to PDF.
- No MCP attachment-content/document-template-content/public-link tools beyond the explicitly
  approved registry, schema-builder, card lifecycle, card field-value, card
  block-instance, card transfer, report-template, report-run, and
  document-template and generated-document MCP write slices plus the
  document-metadata and report/generated-document content read slices.
- No MDB migration.

Phase 1B through Phase 1J completed the Core Schema v1 database, backend service layer, REST API foundation, current API hardening checkpoint, bootstrap seed tooling, bearer-token authentication, and user/access management API. Phase 1K.1 added the authenticated admin shell. Phase 1K.2 added registry/schema and card list/read frontend workflows. Phase 1K.3 added dynamic card editing. Phase 1K.4 added public-link frontend editing. Phase 1K.5 completed browser validation for the frontend foundation. Phase 2 completed the current attachment and generated-document slices through public-link attachment quota API and concurrency hardening. Phase 2K.0 recorded the admin API gap audit, Phase 2K.1 added organization unit management API, Phase 2K.2 added registry update/archive API, Phase 2K.3 added card block instance archive API, Phase 2K.4 added atomic bulk card values API, and Phase 2K.5 completed API coverage/live validation. Phase 2L.0 added the shared admin mutation frontend foundation, Phase 2L.1 added organization create/edit/archive UI, Phase 2L.2 added user create/edit/password-reset/archive UI, Phase 2L.3 added access-grant issue/revoke UI, Phase 2L.4 added registry create/update/archive UI, Phase 2L.5 added schema builder UI for form blocks and fields, Phase 2L.6 added reference-list/item management UI plus select/multi_select reference-list wiring, Phase 2L.7 added card create/metadata/archive, repeatable block-instance, and bulk field-value UI, Phase 2L.8 added authenticated public-link list/create/disable controls with separate attachment-upload limit UI, Phase 2L.9 added browser validation for the full Russian admin setup path, Phase 2J.0 accepted the `file_ref` dynamic field type ADR, Phase 2J.1 added the `file_ref` database/model foundation, Phase 2J.2 added backend service set/read/clear behavior, Phase 2J.3 added transfer behavior, Phase 2J.4 added REST card value API support, Phase 2J.5 added authenticated frontend editing, Phase 2J.6 added generated-document text rendering for `file_ref`, Phase 2J.7 completed live validation, Phase 2M added binary `.docx` template upload/versioning through authenticated API, Phase 2N added authenticated PDF generation for `docx_text_v1` templates, Phase 3A added authenticated JSON/CSV card export foundation, Phase 3B added CSV import preview and mapping foundation, Phase 3C added CSV import commit with atomic create/update and audit, Phase 3D adds authenticated Russian-first import/export frontend controls, Phase 3E adds XLSX card import/export as the same row-oriented technical exchange contract, Phase 4A adds authenticated JSON report template/run API foundation, Phase 4B adds authenticated Russian-first report UI controls, Phase 4C adds report template settings update API/UI, Phase 4D adds CSV report output, Phase 4E polishes report run ordering and output metadata display, Phase 4F adds archived report template/run visibility in the authenticated UI, Phase 4G adds XLSX report output, Phase 4H adds PDF report output, Phase 4O uses report template default parameters for run payloads when manual run JSON is empty, Phase 4P adds date inputs for report parameter schema strings with `format: "date"`, Phase 4Q shows JSON Schema descriptions as report parameter hints, Phase 4R uses JSON Schema defaults for report run parameters, Phase 4S validates required report run parameters in the Russian UI, Phase 4T validates basic scalar report run constraints in the Russian UI, Phase 4U validates report run `pattern` and `multipleOf` constraints in the Russian UI, Phase 4V validates report run `exclusiveMinimum` and `exclusiveMaximum` constraints in the Russian UI, Phase 5A adds a read-only MCP-over-API gateway foundation, Phase 5B hardens MCP stdio/config behavior, Phase 5C adds mutation-capable MCP API client primitives, Phase 5D exposes the first API-only MCP registry-create write tool, Phase 5E adds API-only MCP registry update/archive tools with explicit archive confirmation, Phase 5F adds API-only MCP schema-builder block/field write tools, Phase 5G adds API-only MCP card lifecycle write tools, Phase 5H adds API-only MCP card field-value write tools, Phase 5I adds API-only MCP card block-instance create/archive tools, Phase 5J adds API-only MCP card transfer tool, Phase 5K adds API-only MCP report-template create/update/archive tools, Phase 5L adds API-only MCP report-run generate/archive tools, Phase 5M adds API-only MCP text document-template create/archive tools, Phase 5N adds API-only MCP generated-document create/PDF-create/archive tools, Phase 5O adds API-only MCP document metadata read tools, and Phase 5P adds API-only MCP report/generated-document content read tools. Additional report polish and broader MCP write tools remain later phases.
