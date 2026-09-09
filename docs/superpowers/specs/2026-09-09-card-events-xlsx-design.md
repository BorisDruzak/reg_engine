# Card Events and XLSX Exports Design

## Goal

Replace the stored card title with a derived `ФИО` value, record durable
post-activation card changes and dismissals with a mandatory free-text basis,
and produce configurable Russian-first XLSX exports, including the three-part
personnel-change report approved from the reference layout.

## Confirmed Product Decisions

- A card has no stored title. `cards.display_name` and the registry-level
  `card_title_label` are removed.
- The active text form field with code `fio` is the only card display value.
  Administrators cannot choose another display field. A usable card template
  must contain exactly one active text `fio` field.
- New-card UI asks only for an organization. The backend selects the first
  active card template in deterministic `(position, id)` order.
- A draft can be filled without a change basis. Every later business-data
  modification of an active card requires a non-empty free-text basis.
- Dismissal is not archive. It moves a card to the `dismissed` lifecycle
  status, preserves it for reading, colors its list item red, and exposes a
  dedicated `Уволенные` filter.
- The dismissal dialog contains exactly `Дата увольнения` and
  `Основание увольнения` (free text).
- Only a system administrator can archive a card; that check is enforced by
  the backend.
- The personnel-change export is XLSX only. It is organized as the supplied
  reference layout: `Вновь приняты`, `Уволены`, and `Иные изменения`.
- Existing product presentation patterns remain: Russian-first text,
  existing panels and dialogs, compact form controls, list filters, and
  backend-enforced access.

## Non-goals

- No approval or moderation workflow is added.
- No card is physically deleted.
- No DOCX/PDF version of the personnel-change export is added.
- No configurable alternate card-display field is added.
- No existing untracked workspace files are changed.

## Data Model

### Derived card display value

`Card.display_name` is removed. All card readers resolve the display value from
the active `form_fields.code = 'fio'` text field in the selected template and
the card's primary active block instance. An absent value renders as
`Не заполнено`; it never falls back to a persisted title or template name.

Creation and schema validation reject a template that has zero or multiple
active text `fio` fields. Migration preflight must list every active template
that does not meet this rule. Such a template cannot create cards until the
schema is corrected.

The first active template for a registry is selected by `position`, then UUID.
It remains a backend rule even when a client sends a template identifier, so a
client cannot create a draft using a different template.

### Card events

Add an append-only domain event aggregate and its item rows:

- `card_events`: id, card_id, event_type (`change` or `dismissal`),
  occurred_on, basis_text, actor identity/source metadata, created_at.
- `card_event_changes`: id, card_event_id, field_id where applicable,
  field-label snapshot, old-value snapshot, new-value snapshot, and stable
  ordinal.

For a normal post-activation update, one user save creates one `change` event
and one or more change rows. It records only actual value differences. The
event is the durable reporting source; generic `audit_events` still records
the technical mutation for compatibility but is not the source of the new
report.

A dismissal creates one `dismissal` event with the submitted date and basis.
The current position and other card fields are resolved for reporting at export
time from the card schema. A dismissed card is read-only. Reactivation is
expressly outside this change.

The required-basis rule applies to active-card field values, bulk block saves,
card metadata relevant to the record, repeatable block-instance changes,
transfers, public-link writes, and approved MCP write tools. It does not apply
to notification preferences, public-link administration, or read operations.

## API and UI Flow

### Draft creation

The creation surface removes the card-name and template controls. It begins
with no selected organization and a preview using the server-resolved first
template. Saving remains disabled until an accessible organization is chosen.
The API resolves the template itself and returns its selected-template details
in the preview/read response.

### Active-card changes

For an active card, `Изменить блок` becomes an explicit save session. The
existing visual block editor retains its fields, adds a compact mandatory
`Основание изменения` textarea, and sends all changed values with that basis
in one transaction. The backend rejects blank or whitespace-only bases before
mutating any value. The same requirement is represented in API and MCP write
payloads; public-link editing presents the same basis input before saving.

### Dismissal and archive

The current card archive panel is replaced for ordinary managers by
`Уволить`. Its existing dialog presentation becomes a compact dismissal form.
On success the workspace refreshes, shows lifecycle label `Уволенный`, and the
card appears red in the list. The list has an independent status filter for
dismissed records. The separate `Архивировать` action appears only for a
system administrator and the backend checks superuser status.

## XLSX Export Templates

Add soft-archivable export-template records scoped to a registry. They contain
a code, Russian display name, export kind, selected card-template id, and JSON
configuration. The configuration has two variants:

1. `card_list`: an ordered array of selected schema field ids. At run time the
   user chooses one accessible organization. The XLSX contains `№ п/п`,
   `Организация`, and exactly those fields in the stored order; it has no card
   title column.
2. `personnel_changes`: schema-field mappings for position, structural unit,
   appointment date, and appointment basis. `fio` is implicit and cannot be
   remapped. At run time the user chooses one accessible organization and a
   required inclusive reporting period.

The personnel XLSX uses one worksheet and three clearly separated Russian
sections with merged headings and bordered tables:

- `Вновь приняты`: cards whose configured appointment-date field lies in the
  period; columns are ФИО, должность/структурное подразделение, дата и
  основание назначения.
- `Уволены`: dismissal events whose `occurred_on` lies in the period; columns
  are ФИО, должность, дата увольнения, основание.
- `Иные изменения`: `change` events in the period; columns are ФИО,
  содержимое изменений, дата и основание изменений.

The `Содержание изменений` cell combines the immutable field-label and
before/after snapshots held by event rows. A missing configured field, absent
`fio`, or inaccessible organization causes a Russian validation error before
file generation. Field visibility and card visibility are always checked on
the backend.

## Migration and History Treatment

The release includes an Alembic migration that:

1. creates the event and export-template tables with indexes, foreign keys,
   lifecycle/event-type constraints, and no physical-delete path;
2. extends card lifecycle validation with `dismissed`;
3. drops `cards.display_name`, its index, and `registries.card_title_label`;
4. removes `display_name` keys from existing `audit_events.old_data_json` and
   `new_data_json` snapshots.

The JSON cleanup is an explicit user-authorized exception to otherwise
append-only audit history. It must run only after a fresh external production
backup and a disposable `_test` upgrade/downgrade/upgrade proof. All display
lookups in audit, public links, reports, documents, notifications, MCP, API,
and frontend types move to the derived `fio` value, so old titles neither
reappear nor are accepted in future input.

## Authorization

- Event creation requires the same scoped card-management permission as the
  underlying write; public and MCP callers are validated through their existing
  backend boundaries.
- Archive requires `is_superuser` server-side.
- Export-template configuration requires schema-administration permission.
- Running an export requires visibility to the selected organization and its
  cards; a parent organization does not grant child access unless the existing
  descendants rule is explicitly requested.

## Verification

Backend tests must prove:

- a template without exactly one text `fio` field is rejected for draft
  creation;
- a draft selects the first active template and needs only organization input;
- API responses, search, audit reads, import/export, report/document contexts,
  public links, notifications, and MCP schemas contain no persisted card title;
- the migration removes title columns and historical JSON title keys;
- draft changes save without a basis, while every active-card write path
  rejects a blank basis atomically;
- a valid active-card multi-field save creates one change event with correct
  snapshots;
- dismissal creates one event, sets `dismissed`, and blocks later edits;
- non-superusers cannot archive and superusers can archive;
- XLSX template validation preserves configured column order and the
  personnel report has accurate period filtering, sections, values, and safe
  organization visibility.

Frontend tests must prove:

- the creation form contains no name/template selector, starts with no
  organization, and enables saving only after organization selection;
- active block edit requires and submits its basis in the existing visual
  style;
- the dismissal dialog, red dismissed list row, and dismissed filter work;
- archive is absent for non-superusers;
- export-template configuration persists field order and a personnel report
  requests organization plus dates with Russian validation text.

The implementation uses test-first red/green cycles, focused backend/frontend
checks, a disposable PostgreSQL database ending in `_test`, generated XLSX
inspection, TypeScript/lint/format checks, and the standard project-map check.
