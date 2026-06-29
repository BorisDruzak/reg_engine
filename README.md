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
- Current backend scope has healthcheck, database infrastructure, Core Schema v1 models/migrations, service-layer behavior, hardened REST API workflows for organizations, org units, registries, dynamic cards, public links, transfer, references, audit reads, bootstrap seed tooling, bearer-token authentication, user/access management API, card-level attachment backend/API foundation, authenticated generated `.docx` document APIs, public-link attachment list/upload/download APIs, and authenticated card export API foundation.
- Current frontend scope has a bearer-authenticated admin shell with organization create/edit/archive management, user create/edit/password-reset/archive management, access-grant issue/revoke management, roles/permissions reads, registry create/update/archive, schema block/field create/update/archive, reference-list/item create/update/archive, select/multi_select reference-list wiring, card list/read/create/metadata-edit/archive, repeatable block-instance add/archive, per-field and bulk dynamic value editing workflows, authenticated public-link list/create/disable controls with attachment-upload limits, shared admin mutation API/client UI foundations, card-level attachment upload/download/archive, generated-document generation/download/archive, document-template create/archive, audit reads, public-link card editing, public-link attachment list/upload/download, and full Russian UI browser validation for the core admin setup path.
- Phase 2 documents/attachments scope started with card-level attachments. Phase 2B adds attachment metadata models, local-filesystem storage abstraction, authenticated attachment endpoints, and tests. Phase 2C adds generated `.docx` document metadata and service rendering from schema-driven card data. Phase 2D adds authenticated Russian-first card workspace UI for attachments and generated documents. Phase 2G adds authenticated Russian-first document-template management UI. Phase 2H adds public-link attachment list/upload/download for active public edit links. Phase 2I separates public field-edit usage from attachment-upload usage and hardens rollback cleanup. Public-link attachment quota API hardening makes upload limits configurable at public-link creation time and protects quota consumption with row-level locking. Phase 2J.0 accepts the `file_ref` dynamic field type ADR. Phase 2J.1 adds the database/model foundation and schema type registration for `file_ref`; Phase 2J.2 adds authenticated backend service set/read/clear support and keeps public-link `file_ref` editing blocked. Phase 2J.3 adds transfer behavior for active and archived `file_ref` values. Phase 2J.4 exposes authenticated REST card value set/clear/read metadata for `file_ref`. Phase 2J.5 adds the Russian-first authenticated `file_ref` card editor using existing card attachments. Phase 2J.6 renders `file_ref` in `docx_text_v1` as safe attachment title/original filename text. Phase 2J.7 validates the full file-ref flow on disposable PostgreSQL and temporary storage. Phase 2M adds binary `.docx` template upload and template versioning through authenticated API. Phase 2N adds authenticated PDF generation for `docx_text_v1` templates.
- Import/export, reports, and MCP are later phases.

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

Public-link attachment list/upload/download require an active public edit link, `public_link.can_edit=true`, `card.public_edit_enabled=true`, and a non-archived, non-superseded card. `card_public_links.max_uses` / `used_count` apply to public field edits only. Public attachment uploads use separate `max_attachment_uploads` / `attachment_upload_count` semantics. Administrators can set `max_attachment_uploads` when creating a public link; omitted/null means unlimited uploads for that active link. Existing public-link settings are create-only in the current API slice, so changing the limit requires disabling the old link and creating a new one. Upload quota consumption locks and refreshes the public-link row before checking/incrementing the counter so parallel or stale-session uploads cannot exceed the limit. List/download do not increment usage counters, and exhausted field-edit usage does not block attachment list/download. Public-link upload uses the same bounded read, MIME allow-list, scanner hook, storage cleanup, filename normalization, and safe download-header behavior as authenticated attachment workflows. Public-link responses intentionally omit `stored_file_id`, `checksum_sha256`, storage keys, and filesystem details. Public-link archive/delete is not exposed.

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

## Phase 3A Card Export API

Authenticated card export API:

```powershell
GET /api/v1/registries/{registry_id}/exports/cards?format=json
GET /api/v1/registries/{registry_id}/exports/cards?format=csv
```

The export endpoint uses the same backend card visibility rules as card list/read. JSON export preserves schema-driven `blocks -> instances -> fields` structure. CSV export is field-row based with explicit `block_code`, `block_instance_ordinal`, and `field_code` columns so duplicate field codes in different blocks remain unambiguous.

Attachment and generated-document exports include metadata only. Storage keys, checksums, stored file ids, filesystem paths, and binary bytes are not exported. Each export writes an `audit_events` row with `action=export` and `object_type=registry`.

CSV/XLSX import, XLSX export, binary attachment/document export, import preview UI, and import commit workflows remain deferred to later Phase 3 slices.

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
- No CSV/XLSX import or XLSX export UI yet.
- No public-link attachment archive/delete.
- No public generated-document workflows.
- No binary `.docx` layout conversion to PDF.
- No MCP.
- No MDB migration.

Phase 1B through Phase 1J completed the Core Schema v1 database, backend service layer, REST API foundation, current API hardening checkpoint, bootstrap seed tooling, bearer-token authentication, and user/access management API. Phase 1K.1 added the authenticated admin shell. Phase 1K.2 added registry/schema and card list/read frontend workflows. Phase 1K.3 added dynamic card field editing. Phase 1K.4 added public-link frontend editing. Phase 1K.5 completed browser validation for the frontend foundation. Phase 2 completed the current attachment and generated-document slices through public-link attachment quota API and concurrency hardening. Phase 2K.0 recorded the admin API gap audit, Phase 2K.1 added organization unit management API, Phase 2K.2 added registry update/archive API, Phase 2K.3 added card block instance archive API, Phase 2K.4 added atomic bulk card values API, and Phase 2K.5 completed API coverage/live validation. Phase 2L.0 added the shared admin mutation frontend foundation, Phase 2L.1 added organization create/edit/archive UI, Phase 2L.2 added user create/edit/password-reset/archive UI, Phase 2L.3 added access-grant issue/revoke UI, Phase 2L.4 added registry create/update/archive UI, Phase 2L.5 added schema builder UI for form blocks and fields, Phase 2L.6 added reference-list/item management UI plus select/multi_select reference-list wiring, Phase 2L.7 added card create/metadata/archive, repeatable block-instance, and bulk field-value UI, Phase 2L.8 added authenticated public-link list/create/disable controls with separate attachment-upload limit UI, Phase 2L.9 added browser validation for the full Russian admin setup path, Phase 2J.0 accepted the `file_ref` dynamic field type ADR, Phase 2J.1 added the `file_ref` database/model foundation, Phase 2J.2 added backend service set/read/clear behavior, Phase 2J.3 added transfer behavior, Phase 2J.4 added REST card value API support, Phase 2J.5 added authenticated frontend editing, Phase 2J.6 added generated-document text rendering for `file_ref`, Phase 2J.7 completed live validation, Phase 2M added binary `.docx` template upload/versioning through authenticated API, Phase 2N added authenticated PDF generation for `docx_text_v1` templates, and Phase 3A added authenticated JSON/CSV card export foundation. Import preview/commit, XLSX workflows, reports, and MCP remain later phases.
