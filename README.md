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
- Current backend scope has healthcheck, database infrastructure, Core Schema v1 models/migrations, service-layer behavior, hardened REST API workflows for organizations, registries, dynamic cards, public links, transfer, references, audit reads, bootstrap seed tooling, bearer-token authentication, user/access management API, card-level attachment backend/API foundation, authenticated generated `.docx` document APIs, and public-link attachment list/upload/download APIs.
- Current frontend scope has a bearer-authenticated admin shell for organizations, users, roles, permissions, access grants, registry list/schema reads, card list/read/edit workflows, card-level attachment upload/download/archive, generated-document generation/download/archive, document-template create/archive, audit reads, public-link card editing, and public-link attachment list/upload/download.
- Phase 2 documents/attachments scope started with card-level attachments. Phase 2B adds attachment metadata models, local-filesystem storage abstraction, authenticated attachment endpoints, and tests. Phase 2C adds generated `.docx` document metadata and service rendering from schema-driven card data. Phase 2D adds authenticated Russian-first card workspace UI for attachments and generated documents. Phase 2G adds authenticated Russian-first document-template management UI. Phase 2H adds public-link attachment list/upload/download for active public edit links. `file_ref`, PDF conversion, binary `.docx` template upload, and template versioning remain deferred.
- Import/export, reports, PDF conversion, and MCP are later phases.

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

Phase 2 starts with card-level attachments. Generated `.docx` documents now have backend APIs and authenticated card-workspace UI. Public-link attachment list/upload/download is available for active public edit links. PDF conversion, `file_ref`, public generated-document workflows, binary `.docx` template upload, and template versioning remain deferred.

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

Public-link attachment API:

```powershell
POST /api/v1/public-links/attachments
POST /api/v1/public-links/attachments/upload
POST /api/v1/public-links/attachments/{attachment_id}/content
```

Public-link attachment list/upload/download require an active public edit link, `public_link.can_edit=true`, `card.public_edit_enabled=true`, and a non-archived, non-superseded card. Public-link upload uses the same bounded read, MIME allow-list, scanner hook, storage cleanup, filename normalization, and safe download-header behavior as authenticated attachment workflows. Public-link responses intentionally omit `stored_file_id`, `checksum_sha256`, storage keys, and filesystem details. Public-link archive/delete is not exposed.

Upload reads are bounded by `REG_ENGINE_MAX_ATTACHMENT_BYTES`; oversized uploads
are rejected before unbounded request-body growth is possible. If metadata
persistence fails after bytes have been written, the storage object is deleted
before the error is re-raised.

Download responses include a safe `Content-Disposition: attachment` header with
an ASCII fallback filename and a UTF-8 `filename*` value. Stored original
filenames are normalized to remove control characters and header-unsafe
characters.

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
generate/upload/download, PDF conversion, binary `.docx` template upload, and
`file_ref` remain deferred.

Authenticated generated document API:

```powershell
POST   /api/v1/registries/{registry_id}/document-templates
GET    /api/v1/registries/{registry_id}/document-templates
DELETE /api/v1/document-templates/{template_id}
POST   /api/v1/cards/{card_id}/generated-documents
GET    /api/v1/cards/{card_id}/generated-documents
GET    /api/v1/generated-documents/{generated_document_id}
GET    /api/v1/generated-documents/{generated_document_id}/content
DELETE /api/v1/generated-documents/{generated_document_id}
```

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
or attachment archive/delete controls. Binary `.docx` template upload, template
versioning, PDF conversion, and `file_ref` remain deferred.

## Phase 2H Public-Link Attachment Workflows

Public-link card editing now includes Russian-first `Вложения` controls for
active public edit links. A public link can list, upload, and download active
card attachments only when the link is active, not expired, not usage-exhausted,
`can_edit=true`, and the target card has `public_edit_enabled=true`.

Public uploads use multipart form data with `raw_token`, `file`, and optional
`title`. Uploads increment `card_public_links.used_count` only after successful
metadata/storage creation. List and download do not increment usage. Public
upload/download actions write `audit_events` with `actor_type=public_link`.

Public-link attachment responses are intentionally narrower than authenticated
attachment responses: they do not expose `stored_file_id`, `checksum_sha256`,
storage keys, or filesystem paths. Public archive/delete, public generated
documents, template management, PDF conversion, `file_ref`, import/export, and
MCP remain outside this phase.

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
| `PgHost` | `REG_ENGINE_PGHOST` |
| `PgPort` | `REG_ENGINE_PGPORT` |
| `PgDatabase` | `REG_ENGINE_PGDATABASE` |
| `PgUser` | `REG_ENGINE_PGUSER` |

The local config file is ignored by Git and must remain machine-local.

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
- No import/export.
- No public-link attachment archive/delete.
- No public generated-document workflows.
- No binary `.docx` template upload or template versioning.
- No PDF conversion.
- No MCP.
- No MDB migration.

Phase 1B through Phase 1J completed the Core Schema v1 database, backend service layer, REST API foundation, current API hardening checkpoint, bootstrap seed tooling, bearer-token authentication, and user/access management API. Phase 1K.1 added the authenticated admin shell. Phase 1K.2 added registry/schema and card list/read frontend workflows. Phase 1K.3 added dynamic card field editing. Phase 1K.4 added public-link frontend editing. Phase 1K.5 completed browser validation for the frontend foundation. Phase 2 completed the current attachment and generated-document slices through public-link attachment workflows. Import/export, PDF conversion, `file_ref`, binary `.docx` template upload/versioning, and MCP remain later phases and require explicit approval before implementation.
