# Project Map

## Purpose And Current State

Registry Engine is a schema-driven registry platform, not an employee registry.
The current implementation includes backend-enforced RBAC, dynamic registry
schemas and typed card values, organizations, cards, public links, attachments,
generated documents, import/export, reports, audit, and API-only MCP tools.

Phase 8J adds the locally verified contextual card-layout studio. Deployment
and live Browser evidence are still pending; Phases 8K and 8L remain planned.

## Runtime Entrypoints

- `backend/app/main.py`: creates FastAPI, validates runtime configuration,
  registers API v1, exposes the database-independent root healthcheck, and
  mounts the built SPA without shadowing backend routes.
- `backend/app/api/v1/router.py`: composes health, auth, access, attachments,
  documents, card-template layouts, import/export, organizations, registries,
  cards, public links, reports, and audit routers.
- `backend/app/frontend.py`: resolves and serves the Vite distribution plus SPA
  fallback routes.
- `frontend/src/main.tsx`: mounts the React application.
- `frontend/src/app/router.tsx`: routes `/` to the authenticated workspace and
  `/public/edit/:rawToken` to public card editing.
- `frontend/src/pages/HomePage.tsx`: owns session-aware Russian admin-shell
  navigation and section-scoped data loading.
- `frontend/src/pages/PublicLinkEditPage.tsx`: public-link card preview/edit and
  attachment workflow.

## Backend Source Roles

### API, schemas, and business boundaries

- `backend/app/api/v1/endpoints/*.py`: HTTP translation only. Routes obtain the
  actor/session, validate Pydantic payloads, call services, and map safe errors.
- `backend/app/schemas/*.py`: request/response contracts. In particular,
  `card_template_layouts.py` defines `card_template_layout_v1`, its revisioned
  form update, print-view, sync, and generated-document payloads.
- `backend/app/services/*.py`: backend-enforced permissions, validation,
  transactions, audit, and storage/document workflows. Business logic does not
  belong in endpoint functions.
- `backend/app/models/*.py`: SQLAlchemy persistence for identities,
  organizations, registry schema, cards, files/documents, public links, reports,
  and audit. Schema-driven business fields remain in `form_fields` and typed
  `field_values`, not fixed card columns.

### Contextual card-layout and A4 pipeline

- `backend/app/api/v1/endpoints/card_template_layouts.py`: unified layout read,
  revisioned form PATCH, print-view create/update/sync, explicit linked-card
  conversion, and card DOCX/PDF generation endpoints.
- `backend/app/services/card_template_layout.py`: SHA-256 layout revisions,
  strict 12-by-4 geometry/collision validation, row-locked optimistic writes,
  layout aggregation, print-view persistence/sync, and generation delegation.
- `backend/app/services/card_template_projection.py`: default form layout,
  web-to-A4 projection, linked-card expansion from the current form layout,
  virtual default print views, and sync mapping without hardcoded fields.
- `backend/app/services/card_print.py`: canonical A4 normalization and
  validation for normalized `sections[]`/`overlays[]`, legacy `items[]`, linked
  rectangle cardinality, A4 bounds, and supported item styles.
- `backend/app/services/documents.py`: audited document-template versions,
  explicit legacy-to-linked conversion, generation-time linked expansion, and
  DOCX/PDF rendering/storage through the existing document boundary.
- `backend/app/services/registry_schema.py`: registry/block/field/card-template
  mutations, permission/audit enforcement, technical-code and type/reference
  validation, base-template membership refresh, and preservation of
  `field_schema_json.form_layout` under row locks.

## Frontend Source Roles

### Application and shared contracts

- `frontend/src/api/client.ts`: bearer-authenticated REST client functions,
  including unified card-template layout and conversion/generation calls.
- `frontend/src/api/types.ts`: shared API types, including revisions,
  `row_span`, linked `card_layout`, print views, and generation results.
- `frontend/src/app/uiText.ts`: Russian-first product text plus the canonical
  field-type list used by schema editors.
- `frontend/src/features/registry/RegistriesAndSchema.tsx`: registry, template,
  schema, reference-list, import/export, report, and studio orchestration.
- `frontend/src/features/cards/CardsWorkspace.tsx`: organization-scoped card
  list/detail, schema-driven card work, attachments, and generated documents.

### Contextual card layout

- `frontend/src/features/registry/print/CardLayoutStudio.tsx`: three-stage
  Russian contextual workflow; schema CRUD/insertion; serialized revision-safe
  layout saves; conflict compare/accept/save-local recovery; undo/redo; A4
  print-view save/conversion/download; shared draft ownership.
- `frontend/src/features/cardLayout/CardLayoutRenderer.tsx`: shared rendering
  contract for design, preview, readonly, filled-block edit, and public edit.
- `frontend/src/features/cardLayout/CardWebLayoutCanvas.tsx`: row-major 12-by-4
  canvas, contextual empty-cell/block/field actions, selection, inline editing,
  geometry sessions, collision checks, and responsive one-column rendering.
- `frontend/src/features/cardLayout/CardBlockLayoutNode.tsx` and
  `CardFieldLayoutNode.tsx`: exact CSS-grid placement, contextual actions,
  pointer/keyboard geometry affordances, and mode-specific value rendering.
- `frontend/src/features/cardLayout/InlineBlockEditor.tsx` and
  `InlineFieldEditor.tsx`: in-place schema drafts with save/cancel and invalid
  click-away focus retention.
- `frontend/src/features/cardLayout/layoutGeometry.ts`: immutable quarter-grid
  snap/move/eight-handle resize/collision math for spans `3/6/9/12` by
  `1/2/3/4`.
- `frontend/src/features/cardLayout/useLayoutGeometrySession.ts`: pointer
  capture lifecycle, keyboard move/resize, preview, validation, cancel, and the
  single before/after command boundary.
- `frontend/src/features/cardLayout/LayoutLivePreview.tsx`: shared web and A4
  preview of the same immutable in-progress form layout.
- `frontend/src/features/cardLayout/A4LinkedCardCanvas.tsx`: one protected linked
  card rectangle plus editable print-only overlays, legacy conversion affordance,
  and readonly preview behavior.
- `frontend/src/features/cardLayout/a4LinkedCardLayout.ts`: detection, marking,
  and creation of `composition_mode=linked_card` layouts.
- `frontend/src/features/registry/print/A4LayoutRenderer.tsx`: canonical A4 mm
  renderer and pointer/keyboard manipulation used by linked and legacy views.
- `frontend/src/features/registry/print/printLayoutGeometry.ts` and
  `printLayoutValidation.ts`: A4 geometry transforms and client-side validation.
- `frontend/src/styles/globals.css`: responsive studio/card/A4 layout and
  geometry-state presentation; the web card collapses to one column at the
  mobile breakpoint while linked A4 keeps exact geometry.

## Test Ownership

- `backend/tests/test_card_template_layout_services.py`: unified contract,
  revision/locking, strict geometry, projection, print views, conversion API,
  and safe error mapping.
- `backend/tests/test_card_print_layout_services.py`: normalized/legacy/linked
  A4 validation, overlay preservation, and blank render contracts.
- `backend/tests/test_document_generation_services.py`: DOCX/PDF generation,
  linked expansion, template identity, overlays, and binary signatures.
- `backend/tests/test_registry_schema_field_update_contract.py`: complete
  block/field mutations, technical-code/type/reference normalization,
  membership locks, and form-layout preservation.
- `frontend/src/features/cardLayout/layoutGeometry.test.ts`: exact quarter-grid
  move, resize, boundary, collision, and immutability cases.
- `frontend/src/features/cardLayout/CardLayoutRenderer.test.tsx`: contextual
  disclosure, inline editors, pointer/keyboard sessions, readonly/public modes,
  responsive order, and live previews.
- `frontend/src/features/registry/CardPrintTemplateEditor.test.tsx`: integrated
  studio stages, save queues/conflicts, schema mutations, linked A4 behavior,
  conversion, undo/redo, and pending-state ownership.

## Operational Scripts

- `scripts/check.ps1`: local/remote-aware aggregate gate; `-SkipRemote` retains
  syntax, backend, frontend, build, and project-tree checks while skipping
  GitHub/server reachability.
- `scripts/test.ps1`: backend pytest and frontend Vitest; `-E2E` adds Playwright.
- `scripts/lint.ps1`, `scripts/format.ps1`, `scripts/typecheck.ps1`: Ruff/ESLint,
  Ruff format/Prettier, and mypy/TypeScript gates.
- `scripts/project-map.ps1`: regenerates or checks `docs/PROJECT_TREE.md` from
  tracked and non-ignored files.
- `scripts/dev-backend.ps1`, `scripts/dev-frontend.ps1`, `scripts/dev-mcp.ps1`:
  local development entrypoints.
- `scripts/push-git.ps1`: verified single-branch commit/push workflow.
- `scripts/deploy.ps1`, `scripts/deploy-frontend.ps1`, `scripts/server-check.ps1`,
  `scripts/service.ps1`: configured server checkout, frontend artifact, service,
  database, storage, and smoke workflows. Operational values stay outside Git.

## Architecture Guardrails

- Backend services/API remain the security and business-logic boundary;
  frontend checks are UX hints.
- MCP uses REST API calls and never imports database/service internals.
- Blocks, fields, cards, organizations, files, and users are archived/disabled
  by default rather than physically deleted.
- Every create/update/archive path writes audit data.
- Parent organization scope includes children only when
  `include_descendants=true`.
- UI chrome and safe browser-visible error mapping are Russian-first.
- Secrets, real personal data, internal hosts, storage roots, dumps, and runtime
  logs are never committed.

## Navigation And Verification

1. Read `AGENTS.md`, `README.md`, `PLANS.md`, and this map.
2. Inspect `git status --short --branch`; preserve unrelated changes.
3. Use `rg`/`rg --files` and the source-role sections above to locate the
   narrowest boundary.
4. Add focused regressions, then run the relevant backend/frontend suites.
5. Run `powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote`
   before a local-only checkpoint.
6. Regenerate `docs/PROJECT_TREE.md` after tracked file additions/removals and
   check it with `scripts/project-map.ps1 -Check`.
7. Update `PLANS.md` when phase status, verification, limitations, or deployment
   evidence changes.
