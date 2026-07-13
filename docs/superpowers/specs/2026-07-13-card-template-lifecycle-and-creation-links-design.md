# Card Template Lifecycle and Creation Links Design

## Goal

Correct card-template removal and empty-template behavior, and make cards produced by a creation link open inside the administrator workspace.

## Decisions

1. Removing a non-base card template deactivates it. The record keeps its schema and audit history, but does not receive `archived_at` or appear in archive-oriented lists.
2. An inactive template is excluded from every new-use flow: card creation, creation links, and tabular XLSX import/export. Cards already bound to it remain readable and editable.
3. An explicitly empty `field_ids` list means an empty template. It produces no form blocks, fields, or default layout sections.
4. The creation-link screen shows all produced cards in one separate list below the creation-link list. A double click on one card opens that card in the authenticated workspace; the list does not expose its public child-link URL.

## Boundaries

- The base template remains active and cannot be removed.
- No database migration is required.
- The existing REST DELETE route remains the compatibility boundary, but its service behavior becomes deactivation rather than archival.
- Existing public links remain unchanged; the UI change only removes public URLs from the administrator's created-card list.

## Error Handling and Verification

- Backend tests prove that deactivation preserves `archived_at`, hides the template from active lists, rejects new use, and preserves existing-card presentation.
- A layout-service test proves an empty template has an empty structure and no sections.
- Frontend tests prove the created-card list is below links, shows no public edit URL, and opens a card by double click.
