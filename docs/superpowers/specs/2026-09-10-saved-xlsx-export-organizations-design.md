# Saved XLSX Export Organizations Design

## Goal

Make saved XLSX export templates retain several selected organizations, render ordinary card lists in one worksheet, render personnel changes in one worksheet per organization, and export work experience as one readable Russian column.

## Scope

- Store selected organization identifiers in the existing schema-driven `configuration_json` of a card export template. No fixed business columns or new business table are introduced.
- Add a Russian-first multiple-organization selector with a `Все организации` action to the saved-template editor.
- Require at least one saved organization before a template can be downloaded. Existing templates without the new setting remain editable and prompt the user to save selected organizations before downloading.
- Replace the current one-organization download parameter with the organizations saved in the template. Keep the API migration-safe by accepting the legacy payload field while ignoring it when the saved configuration is present.
- For `card_list`, write all visible cards from selected organizations to one `Карточки` worksheet, preserving field order and omitting the organization column.
- For `personnel_changes`, write one uniquely named worksheet for each selected organization. Each worksheet retains its own organization heading and the three existing sections: newly appointed, dismissed, and other changes. The requested period remains a download-time parameter.
- Render `work_experience` as the existing Russian display value in one column (for example, `3 дня 2 месяца 5 лет`). The renderer must accept the current API representation with `days`, `months`, `years`, and `display`.

## Data Flow

```text
Template editor: selected organization_ids
        | save
        v
CardExportTemplate.configuration_json
        | download + optional reporting period
        v
CardExportTemplateService
   | card_list       -> one worksheet with all selected organizations
   | personnel_changes -> one worksheet per selected organization
        v
XLSX response
```

## Compatibility and Access Control

- Organizations are validated against the template registry and the caller's server-side access scope at save time and again at download time.
- A missing `organization_ids` configuration is treated as an incomplete legacy template, not as all organizations.
- The implementation performs no data rewrite of cards or existing templates.
- Card values remain schema-driven; work experience is only formatted for XLSX output.

## Verification

- Backend API/service tests cover stored multiple organizations, access validation, single-sheet ordinary exports without an organization column, per-organization personnel worksheets, and work-experience formatting.
- Frontend tests cover multiple selection, `Все организации`, persisted template payload, and download readiness.
- The final deployment check downloads each export kind from the production UI and verifies a valid XLSX response.
