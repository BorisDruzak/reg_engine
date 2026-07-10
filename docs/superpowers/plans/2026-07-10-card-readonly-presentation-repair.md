# Card Read-only Presentation Repair Plan

**Goal:** Let an actor who can read one card render that card without registry-wide schema/layout permissions, while keeping attachment and document tabs strictly read-only.

**Architecture:** Add `GET /api/v1/cards/{card_id}/presentation`. The service first enforces card visibility, then returns only the selected card's registry name and current template layout/structure. The registry schema editor keeps using its existing manage-scoped endpoints. The card workspace uses the presentation response for fields, form layout, and A4 preview; manage-only attachment/document controls and queries are gated by `card.can_manage`.

## Task 1: Card-scoped presentation contract

- [ ] Add a failing DB/API permission test: a card-visible read-only actor gets the presentation, an outsider gets 403, and both existing registry schema/template-layout endpoints stay forbidden.
- [ ] Add the presentation response schema and service method without a migration.
- [ ] Add the GET route through the existing API/service boundary.
- [ ] Run the focused backend test green.

## Task 2: Frontend presentation flow

- [ ] Add a failing App regression that rejects registry schema/template-layout reads for a read-only actor but serves card presentation.
- [ ] Disable the global registry schema query in the card section unless the selected card is manageable.
- [ ] Use card presentation structure/layout for filled fields and A4 preview.
- [ ] Keep the registries section on the existing schema editor endpoint.

## Task 3: Read-only files and documents

- [ ] Add opened-tab regressions with existing attachments/documents.
- [ ] Keep list/download requests and actions.
- [ ] Hide upload/archive for attachments.
- [ ] Disable document-template queries and hide create/generate/archive for documents.

## Task 4: Verification

- [ ] Run focused backend/frontend tests.
- [ ] Run backend and frontend full tests, lint, format, typecheck, build, and `git diff --check`.
- [ ] Refresh `docs/PROJECT_TREE.md` and commit the scoped repair.
