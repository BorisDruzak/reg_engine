# Phase 2K Admin API Readiness

Status: completed audit for Phase 2K.0. Updated after Phase 2K.4.

Purpose: record the current backend API surface and separate true backend gaps
from frontend-only gaps before the full Russian-first admin CRUD UI work in
Phase 2L.

This note is documentation only. It does not add backend models, migrations,
services, endpoints, frontend code, document features, import/export, reports,
or MCP.

## Method

- Read `README.md`, `AGENTS.md`, and `PLANS.md`.
- Inspected FastAPI OpenAPI output from `app.main:create_app`.
- Inspected endpoint modules under `backend/app/api/v1/endpoints`.
- Inspected the frontend API client and admin workspace components under
  `frontend/src`.

## Readiness Matrix

| Domain | Backend API status | Frontend/UI status | Phase target |
| --- | --- | --- | --- |
| Organizations | Ready for UI CRUD: `GET/POST /api/v1/organizations`, `GET/PATCH/DELETE /api/v1/organizations/{organization_id}`, and `GET /api/v1/organizations/tree` exist in `backend/app/api/v1/endpoints/organizations.py`. Archive is soft behavior through service layer. Reparenting, code updates, and archived/history read scope are not exposed. | List-only table exists in `frontend/src/features/organizations/OrganizationsTable.tsx`; no create/edit/archive controls or API client mutations. | Frontend work in Phase 2L.1. |
| Organization units | Ready for UI CRUD after Phase 2K.1: `GET/POST /api/v1/organizations/{organization_id}/org-units` and `GET/PATCH/DELETE /api/v1/org-units/{org_unit_id}` exist. Org units remain filters/reference data, not RBAC boundaries. Reads use organization visibility scope; create/update/archive require `organizations.manage` or superuser. | No org-unit UI or API client functions. | Frontend wiring in Phase 2L.1/2L.7. |
| Users | Ready for UI CRUD: `GET/POST /api/v1/users`, `GET/PATCH/DELETE /api/v1/users/{user_id}` exist in `backend/app/api/v1/endpoints/access_management.py`. `PATCH` includes password update/reset payload support. | Users are listed in `frontend/src/features/users/UsersAndRoles.tsx`; no create/edit/password/archive controls or client mutations. | Frontend work in Phase 2L.2. |
| Roles and permissions | Read-only API exists: `GET /api/v1/roles`, `GET /api/v1/roles/{role_id}`, `GET /api/v1/permissions`. Role/permission CRUD is not required for v1 admin UI. | Roles and permissions are displayed read-only. | Sufficient for Phase 2L.3 grant selection. |
| Access grants | Ready for UI grant issue/revoke: `GET/POST /api/v1/access-grants` and `DELETE /api/v1/access-grants/{grant_id}` exist. Query filters support user, organization, and archive scope. | Grants are listed only in `frontend/src/features/access/AccessGrantsTable.tsx`; no issue/revoke controls or client mutations. | Frontend work in Phase 2L.3. |
| Registries | Ready for UI CRUD after Phase 2K.2: `GET/POST /api/v1/registries`, `GET/PATCH/DELETE /api/v1/registries/{registry_id}`, and `GET /api/v1/registries/{registry_id}/schema` exist. List/read support `include_archive=true`. Update covers safe metadata: name, description, and draft/active lifecycle status. Archive is soft and sets `lifecycle_status=archived`. | Registry/schema read UI exists in `frontend/src/features/registry/RegistriesAndSchema.tsx`; no create/update/archive controls. | Frontend work in Phase 2L.4. |
| Form blocks | Ready for basic schema builder create/update/archive: `POST /api/v1/registries/{registry_id}/blocks`, `PATCH/DELETE /api/v1/blocks/{block_id}` exist. Update currently covers title, description, and position; changing repeatable/public flags is not exposed. | Blocks are displayed read-only; no schema builder controls. | Frontend work in Phase 2L.5; broaden backend DTOs later only if the UI requires editing non-exposed flags. |
| Form fields | Ready for basic schema builder create/update/archive: `POST /api/v1/blocks/{block_id}/fields`, `PATCH/DELETE /api/v1/fields/{field_id}` exist. Supported field types are validated by backend constants. Update currently omits field type, options source, public flags, required/default/validation fields, and list behavior. | Fields are displayed read-only; no field builder controls. | Frontend work in Phase 2L.5; `required_mode`/advanced field-setting exposure is a follow-up backend decision if required by the UI. |
| Reference lists/items | Ready for basic reference management: reference lists have create/list/read/update/archive endpoints; reference items have create/list/read/update/archive endpoints in `backend/app/api/v1/endpoints/registries.py`. Reference-list update currently covers name and description, not code/owner/inheritance/system flags. | Only reference item reads are used by card select/multi-select controls. No reference-list/item management UI. | Frontend work in Phase 2L.6; broaden update payloads later only if needed. |
| Cards | Ready for create/list/read/metadata update/archive, single field updates, and atomic bulk value updates: `GET/POST /api/v1/registries/{registry_id}/cards`, `GET/PATCH/DELETE /api/v1/cards/{card_id}`, `PATCH /api/v1/cards/{card_id}/fields/{field_id}`, and `PATCH /api/v1/cards/{card_id}/values` exist. Metadata update currently omits org unit and lifecycle status changes. | Card list/read and per-field edit exist in `frontend/src/features/cards/CardsWorkspace.tsx`; no create, metadata edit, archive, repeatable instance controls, or bulk-save UI. | Frontend work in Phase 2L.7. |
| Card block instances | Ready for repeatable instance add/archive after Phase 2K.3: `POST /api/v1/cards/{card_id}/blocks/{block_id}/instances` and `DELETE /api/v1/card-block-instances/{block_instance_id}` exist. Archive is soft; normal card reads hide archived instances and `include_archive=true` includes them with retained values. Non-repeatable/system/locked/required-minimum guardrails are backend-enforced. | No repeatable instance add/archive UI. | Frontend controls in Phase 2L.7. |
| Public links | Authenticated create/list/disable exists: `GET/POST /api/v1/cards/{card_id}/public-links`, `DELETE /api/v1/public-links/{public_link_id}`. Public preview/edit and public attachment operations exist. `max_attachment_uploads` is accepted on create. | Public-link edit page exists for token users. Authenticated admin create/list/disable controls are missing in card workspace. | Frontend work in Phase 2L.8. |
| Attachments | Authenticated card attachment upload/list/read/download/archive API exists. Public-link attachment list/upload/download exists for active public edit links. | Authenticated card attachment panel and public-link attachment UI exist. | No Phase 2K backend gap for current admin UI. |
| Generated documents and templates | `docx_text_v1` template create/list/archive and generated document generate/list/read/download/archive APIs exist. | Authenticated template management and generated-document card panel exist. Public generated-document workflows remain deferred. | No Phase 2K backend gap for current admin UI. |
| Audit | Audit list API exists: `GET /api/v1/audit-events` with `object_type` and `limit` filters. Richer filters for object id, actor, source, time range, pagination, or export are not exposed. | Audit table exists and reads latest events. | Sufficient for Phase 2L.9 validation; richer audit search is optional later work. |
| `file_ref` | Not implemented by design. | Not implemented by design. | Phase 2J remains separate and may stay deferred behind admin usability. |

## Backend Gaps For Phase 2K

Completed after the initial audit:

1. Phase 2K.1: Organization Units API.
2. Phase 2K.2: Registry Update And Archive API.
3. Phase 2K.3: Card Block Instance Archive API.
4. Phase 2K.4: Bulk Card Values Update API.

Remaining backend gaps:

1. Phase 2K.5: add coverage/live validation for the items above.

Additional audit findings that are not current Phase 2K blockers:

- Block, field, reference-list, and card update payloads are intentionally
  narrower than a maximal admin builder. If Phase 2L needs editing repeatable
  flags, public flags, required/default/validation settings, reference-list
  ownership/inheritance, card org unit, or lifecycle status, add explicit
  backend tasks before those UI controls.
- Role and permission mutation APIs are not exposed and are not required for
  v1 built-in role/permission management.
- Audit filters are minimal but enough for current MVP audit display and
  validation.

## Frontend-Only Gaps For Phase 2L

1. Add API client mutations for already-existing organization, user, access
   grant, registry create, block, field, reference, card, and public-link APIs.
2. Add Russian-first CRUD controls, confirmations, validation messages, and
   success/error states.
3. Build admin flows for organizations, users, grants, registry/schema builder,
   reference lists/items, card create/edit/archive, public-link admin controls,
   and full browser validation.

## Decisions

- Phase 2K should not add business-specific tables, HR-specific fields, import/export,
  reports, PDF conversion, binary `.docx` template upload/versioning, or MCP.
- Frontend-only gaps stay in Phase 2L and must not be misclassified as backend
  blockers.
- Backend remains the security boundary; frontend checks are UX hints only.
- Phase 2J `file_ref` remains independent from Phase 2K/2L unless explicitly
  reprioritized.
