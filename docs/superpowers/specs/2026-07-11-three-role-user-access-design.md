# Three-Role User Access Design

## Goal

Replace the technical roles-and-access-grants administration surfaces with one
Russian-first user workspace. The workspace exposes exactly three business
roles and organization-tree scope assignment while preserving backend-enforced
access to cards and organization data.

## Confirmed Product Decisions

1. The UI exposes exactly these roles:
   - `Администратор`;
   - `Администратор организации`;
   - `Администратор подведомственной организации`.
2. `Администратор` has all system permissions and full access to every active
   organization.
3. `Администратор организации` has all operational permissions over every
   active organization, except the ability to assign access by default.
4. `Администратор подведомственной организации` receives one or more selected
   organization roots. Each selected root includes its active descendants.
   It can manage organizations and cards only inside those resulting trees.
5. A subordinate administrator can read and use card templates and reference
   lists, but cannot change their schema, layout, or reference data.
6. Permission codes and technical role codes remain backend implementation
   details. They are never rendered in the user interface.
7. A system administrator may separately grant the ability to assign access to
   an individual user. This is not a fourth displayed role.
8. The standalone `Доступ` navigation item and its workspace are removed.

## Architecture

The existing `access_grants` relation remains the source of organization scope.
This avoids a duplicate user-organization table and retains the already tested
`include_descendants` behavior in `PermissionService`.

The database has exactly three active system roles:

| UI role | Stored role code | Effective scope | Permission model |
| --- | --- | --- | --- |
| Администратор | `administrator` | Every active organization | `User.is_superuser=True`; all technical permissions are seeded internally. |
| Администратор организации | `organization_administrator` | Global | A global access grant (`organization_id=NULL`) provides all operational permissions except `access_grants.manage`. |
| Администратор подведомственной организации | `subordinate_organization_administrator` | Selected organization roots and descendants | One active grant per selected root, each with `include_descendants=True`; can manage organizations and cards only in that derived scope. |

`User.can_manage_access` is a new false-by-default system flag. It is checked
only as the implementation of the otherwise omitted `access_grants.manage`
capability. It is not a role, a public permission, or visible technical data.
Only a current system administrator can enable or disable it.

Each active non-superuser has one business role. The role may have several
active grants only to represent multiple selected organization roots. A global
organization administrator has one global grant. Technical `permissions` rows
remain internal implementation data and are not deleted or rendered.

An access manager can administer subordinate-administrator scopes only within
the organization scope the manager already controls. A user without the flag
can edit ordinary user profile data only when their role permits `users.manage`;
they cannot alter roles, organization trees, or the special flag. No user may
grant, remove, or elevate their own administrator status.

## Backend Rules

1. `PermissionService.is_superuser` remains the authoritative full-access path.
2. `PermissionService.has_permission` recognizes the `access_grants.manage`
   the separate flag only for active, non-archived users; every other permission
   continues to resolve through active role grants.
3. User-access service methods perform all role/scope authorization on the
   backend. Frontend conditions only hide unavailable controls.
4. A subordinate administrator cannot read cards outside the union of their
   selected organization trees. Card listing, read, create, value update,
   public-link actions, attachments, and archive actions retain the existing
   organization-aware `cards.manage` enforcement.
5. Template and reference read paths for a subordinate administrator are
   read-only. Mutation routes still require `registry.schema.manage`, which the
   subordinate role does not receive.
6. Every create, role/scope change, special-flag change, password reset, and
   archive operation remains audited.

## User Workspace

The `Пользователи` page becomes the only access-administration surface.

- A user row is a keyboard-accessible selection control. Selecting it expands
  one inline detail editor beneath that row; no separate edit button or modal
  is rendered.
- The editor contains name, login/email, active state, selected business role,
  password reset, and archive action. Archive stays behind its existing
  confirmation because it is destructive.
- For `Администратор подведомственной организации`, the editor displays a
  hierarchical multi-select of organizations. Selected roots have descendants
  included automatically and the UI explains that coverage.
- The global administrator alone sees the `Может назначать доступ` switch.
  It is intentionally phrased as a business capability, not as a technical
  permission code.
- The user table shows a compact human-readable role and scope summary.
  It does not show the full role catalog, permission catalog, access-grant
  identifiers, or technical codes.
- The `Доступ` route and sidebar item are removed. The underlying API remains
  the sole business boundary and is used by the inline user editor.

## Data Migration and Safety

The migration must be proven first against a disposable PostgreSQL database,
then deployed only after production backup and a preflight report of users,
roles, grants, and role-permission links.

1. Create or reactivate the three canonical roles and make their permission
   links exact, including removal of obsolete links from those roles.
2. Add `users.can_manage_access` with `false` default.
3. Preserve `is_superuser` users as `Администратор`; do not weaken their access.
4. Convert active legacy `org_admin` grants to
   `subordinate_organization_administrator` grants with the same organization,
   registry scope, validity interval, and descendant coverage where the grant
   can be represented safely.
5. Archive every noncanonical role and its remaining active grants, including
   legacy `system_admin`, `registry_admin`, and `auditor` roles. Do not
   automatically upgrade a registry-only or audit-only user to a broader role.
6. Record every converted, archived, or rejected legacy assignment in audit
   events and emit an operational migration report.

The migration does not delete users, organizations, cards, templates, reference
lists, or audit history.

## Separate Follow-up UX Slice

The public-card field rendering defect and card-search tag layout are separate
from this access-model migration. The follow-up slice will:

1. remove public-editor UUIDs, current-value diagnostics, and repeated
   instance/type metadata from public fields while restoring readable field
   width;
2. combine card search text and tag selection into one input surface.

Those UI fixes must not change the access model or public-link data contract.

## Acceptance Criteria

1. Only the three approved role names appear in the user workspace; no
   technical codes or permission lists are visible.
2. A system administrator has full access without an organization grant.
3. An organization administrator can manage all organizations but cannot assign
   roles/scopes unless a system administrator enabled the separate flag.
4. A subordinate administrator granted a root organization can manage its cards
   and descendants, but receives `403` for a sibling branch.
5. A subordinate administrator can read templates and reference options but
   cannot mutate them.
6. The same scope restrictions hold for direct API calls, not only hidden UI.
7. User creation and inline user editing can assign the selected role and
   organization trees without opening the retired access workspace.
8. Existing roles/grants are migrated conservatively and audibly, with no
   unintended privilege increase.
