# Card list sorting implementation plan

**Goal:** Sort the accessible card list by derived FIO or any active schema date/datetime field, in either direction.

**Architecture:** Extend both existing list GET endpoints with optional `sort_by=display_value|field`, `sort_field_id`, and `sort_direction=asc|desc`. Sort the authorized, filtered result on the backend using a batch read of typed values and card-template membership. Keep the existing identifier order when no sorting is selected. No migration or new dependency.

**UI:** Add Russian sorting and direction selectors beside card status. Persist the choice with existing workspace settings. Dates come from active schema fields/blocks; repeated blocks use their first active instance, empty values remain last, and ties retain identifier order.

**Constraints:** Preserve organization/registry RBAC, archive/status/search filters, derived FIO semantics, and user changes in untracked output directories. Use the existing `main` checkout under the project's single-branch instruction. GitNexus query reports `reg_engine` unavailable; verify consumers in source.

## Steps

- [x] Add failing backend tests for both GET contracts, ascending/descending Cyrillic FIO and dates, empty/tied values, repeats, template membership, invalid sort configuration and RBAC.
- [x] Implement sorting in `backend/app/services/cards.py`; forward validated query parameters in `backend/app/api/v1/endpoints/cards.py`.
- [x] Add frontend client/UI tests; wire query/cache/workspace persistence in `frontend/src/api/client.ts`, `frontend/src/pages/HomePage.tsx`, and `frontend/src/features/cards/CardsWorkspace.tsx`.
- [x] Run focused and broader checks; inspect desktop/mobile UI and request parameters using synthetic data without production writes.
- [x] Update `PLANS.md` and API documentation, review full diff, commit scoped files, push main and deploy through existing scripts. Verify service and published assets.

## Decisions and evidence

- Batch sorting in the service follows the current unpaginated list contract. If pagination is added later, ordering must move before its limit/offset.
- Normalize FIO with casefold and treat е/ё equally. Dates compare typed chronological values from the first active instance by `(ordinal, instance id)`. FIO follows existing presentation's first stored active value by `(ordinal, value id)`.
- User authorized the incremental feature directly; routine UI and implementation choices above are defaults selected for this change.

- Final review corrected absent values in first date instance, read-only date choices, and saved unavailable-field recovery. Unrelated list validation errors preserve sorting.
- Implementation commit `ea4d8f947bde89ea097841188635b70009aa91b3` is pushed and deployed. Local full backend: 625 passed/286 skipped. Full frontend: 474 passed/32 skipped; final affected surfaces: 106 passed/32 skipped. Browser scenario passes locally and on published HTTPS frontend using synthetic API fixtures.
- Runtime read-only PostgreSQL verification: 211 cards, 2 date fields, 16 active actors; FIO both directions, date queries both directions and organization scope checks pass. No production writes or migration.
