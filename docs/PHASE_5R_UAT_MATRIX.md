# Phase 5R UAT Matrix And Recovery Drill

## Purpose

Phase 5R is a user-scenario readiness slice. It verifies the current product
surface before adding more MCP tools, report polish, public document workflows,
binary exports, service desk integration, MDB migration, or hardcoded
business-specific registries.

Run manual UAT only against disposable or staging data. Do not use production
personal data for exploratory checks.

## Scenario Matrix

### System Admin

Allowed workflows:

- Log in and log out.
- Create, update, and archive organizations.
- Create, update, reset password for, and archive users.
- Issue and revoke access grants.
- Create and update registries, form blocks, form fields, reference lists, and
  reference items.
- Read audit events.
- Use card, attachment, document, report, import/export, and MCP workflows
  within backend permission checks.

Denied or constrained workflows:

- No hardcoded employee table or HR-specific fixed columns.
- No direct database use through MCP.
- No binary attachment/document export bundles.

### Registry Admin

Allowed workflows:

- Manage registry schema blocks and fields where `registry.schema.manage`
  applies.
- Manage reference lists and items where permitted.
- Manage document templates and report templates where permitted.
- Generate reports through existing card visibility rules.

Denied or constrained workflows:

- Cannot manage unrelated organizations or users unless granted separately.
- Cannot bypass organization scope through frontend filters or export/import.

### Org Admin Or Scoped Card Manager

Allowed workflows:

- See assigned organization branch and descendants only.
- Create, edit, archive, and read cards in scope.
- Correct an existing card `org_unit_id` inside the card organization.
- Use visible search, organization filter, and archive/superseded visibility
  controls in the card list.
- Use attachments, `file_ref`, generated documents, import/export, and reports
  only inside readable/editable scope.
- Work with cards without unrelated global users/roles/audit permission-noise.

Denied or constrained workflows:

- Cannot see parent or sibling branches.
- Cannot set a card `org_unit_id` to a unit from another organization.
- Cannot use organization transfer as an implicit same-organization unit edit.

### Public-Link User

Allowed workflows:

- Open a public-editable card without login while the link is active.
- Edit only public-editable fields.
- List and download existing attachments while public-link and card states
  allow public editing.
- Upload attachments until the separate attachment-upload limit is exhausted.

Denied or constrained workflows:

- Cannot upload when disabled, expired, archived, superseded, or non-editable
  card/link states apply.
- Cannot upload when `max_attachment_uploads` is exhausted.
- Cannot archive or delete attachments.
- Cannot edit `file_ref` through public links.
- Attachment upload exhaustion does not block list/download.

### MCP Operator Token

Allowed workflows:

- Use MCP tools through the REST API only.
- Use read tools with `readOnlyHint=true`.
- Use approved write tools with `readOnlyHint=false`.
- Read report/generated-document content only with `confirm_content_read=true`
  and only under `REG_ENGINE_MCP_MAX_CONTENT_BYTES`.

Denied or constrained workflows:

- Cannot call SQLAlchemy, Alembic, models, services, or database sessions from
  MCP package code.
- Cannot use new MCP tool categories outside the approved phases.
- Oversized content returns a controlled tool error without `content_base64`.
- API and unexpected errors are normalized to avoid exposing storage paths,
  SQL traces, tracebacks, private filenames, checksums, stored-file ids, or raw
  backend internals.

## Backup And Restore Drill

Use a disposable copy. Names below are placeholders and must be replaced by the
operator's local/server configuration.

1. Create a backup from the source database.

```bash
pg_dump -Fc -d <source_database> -f /tmp/reg_engine_uat.dump
```

2. Restore into a disposable database whose name ends with `_test`.

```bash
createdb <restore_database_test>
pg_restore --clean --if-exists -d <restore_database_test> /tmp/reg_engine_uat.dump
```

3. Verify Alembic state.

```bash
DATABASE_URL='postgresql+psycopg:///<restore_database_test>' .venv/bin/python -m alembic current
```

4. Start the app against the restored disposable database and verify:

- healthcheck returns ok;
- login succeeds;
- card read succeeds;
- attachment download succeeds;
- generated document download succeeds;
- report download succeeds.

5. Record blockers in `PLANS.md` or a follow-up bug phase. Do not silently
accept failed restore checks.

## Report Parameter Schema Subset

The visual report run form supports a flat JSON Schema object subset:

- root `type: "object"`;
- flat `properties`;
- scalar property types: `string`, `number`, `integer`, `boolean`;
- `string` constraints: `minLength`, `maxLength`, `pattern`, `format: "date"`;
- numeric constraints: `minimum`, `maximum`, `exclusiveMinimum`,
  `exclusiveMaximum`, `multipleOf`;
- `required`;
- scalar `enum`;
- `oneOf[].const` with optional titles;
- `description`;
- `default`.

Nested objects, arrays, conditional schemas, enum label maps, and a full visual
report builder remain deferred.

## Export Expectations

Card JSON/CSV/XLSX exports are schema-driven data exports. Attachment and
generated-document exports are metadata-only:

- no binary file bytes;
- no storage keys;
- no filesystem paths;
- no checksums;
- no stored file ids.

Binary attachment/document export bundles remain deferred to a later explicit
phase.
