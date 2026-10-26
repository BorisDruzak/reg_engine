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
- [ ] Update `PLANS.md` and API documentation, review full diff, commit scoped files, push main and deploy through existing scripts. Verify service and published assets.

## Decisions and evidence

- Batch sorting in the service follows the current unpaginated list contract. If pagination is added later, ordering must move before its limit/offset.
- Normalize FIO with casefold and treat е/ё equally. Dates compare typed chronological values. First active instance follows `(ordinal, value id)`, matching current FIO presentation.
- User authorized the incremental feature directly; routine UI and implementation choices above are defaults selected for this change.

- Final review corrected absent values in first date instance, read-only date choices, and saved unavailable-field recovery. Unrelated list validation errors preserve sorting.
