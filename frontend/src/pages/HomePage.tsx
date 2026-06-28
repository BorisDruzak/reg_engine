import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";

import {
  ApiError,
  getCurrentUser,
  getRegistrySchema,
  listCards,
  listAccessGrants,
  listAuditEvents,
  listOrganizations,
  listPermissions,
  listReferenceItems,
  listRegistries,
  listRoles,
  listUsers,
  login,
  readCard,
  updateCardFieldValue,
} from "@/api/client";
import type {
  AccessGrantRead,
  AuditEventRead,
  CardRead,
  CardSummaryRead,
  CurrentUser,
  FormBlockRead,
  FormFieldRead,
  OrganizationRead,
  PermissionRead,
  RegistryRead,
  RegistrySchemaRead,
  RoleRead,
  UserRead,
} from "@/api/types";
import {
  activityLabel,
  auditActionLabel,
  auditObjectTypeLabel,
  auditSourceLabel,
  booleanLabel,
  fieldTypeLabel,
  formatUiDateTime,
  grantScopeLabel,
  instanceLabel,
  lifecycleStatusLabel,
  optionsSourceLabel,
  organizationTypeLabel,
  saveLabel,
  savedLabel,
  sectionLabel,
  uiText,
  visibleSections,
  type VisibleSection,
} from "@/app/uiText";
import { FieldEditorControl } from "@/features/cards/FieldEditorControl";
import {
  type FieldEditorState,
  coerceEditorValue,
  formatValue,
  initialEditorValue,
} from "@/features/cards/fieldEditorUtils";

const SESSION_STORAGE_KEY = "reg_engine.session.v1";

type SessionState = {
  token: string;
  user: CurrentUser;
};

export function HomePage() {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<SessionState | null>(() => loadSession());
  const [activeSection, setActiveSection] = useState<VisibleSection>("overview");
  const [selectedRegistryId, setSelectedRegistryId] = useState<string | null>(null);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);

  const token = session?.token ?? "";
  const currentUserQuery = useQuery({
    queryKey: ["current-user", token],
    queryFn: () => getCurrentUser(token),
    enabled: Boolean(token),
  });
  const organizationsQuery = useQuery({
    queryKey: ["organizations", token],
    queryFn: () => listOrganizations(token),
    enabled: Boolean(token),
  });
  const registriesQuery = useQuery({
    queryKey: ["registries", token],
    queryFn: () => listRegistries(token),
    enabled: Boolean(token),
  });
  const activeRegistryId = selectedRegistryId ?? registriesQuery.data?.items[0]?.id ?? "";
  const registrySchemaQuery = useQuery({
    queryKey: ["registry-schema", token, activeRegistryId],
    queryFn: () => getRegistrySchema(token, activeRegistryId),
    enabled: Boolean(token && activeRegistryId),
  });
  const cardsQuery = useQuery({
    queryKey: ["cards", token, activeRegistryId],
    queryFn: () => listCards(token, activeRegistryId),
    enabled: Boolean(token && activeRegistryId),
  });
  const activeCardId = selectedCardId ?? cardsQuery.data?.items[0]?.id ?? "";
  const cardReadQuery = useQuery({
    queryKey: ["card", token, activeCardId],
    queryFn: () => readCard(token, activeCardId),
    enabled: Boolean(token && activeCardId),
  });
  const usersQuery = useQuery({
    queryKey: ["users", token],
    queryFn: () => listUsers(token),
    enabled: Boolean(token),
  });
  const rolesQuery = useQuery({
    queryKey: ["roles", token],
    queryFn: () => listRoles(token),
    enabled: Boolean(token),
  });
  const permissionsQuery = useQuery({
    queryKey: ["permissions", token],
    queryFn: () => listPermissions(token),
    enabled: Boolean(token),
  });
  const grantsQuery = useQuery({
    queryKey: ["access-grants", token],
    queryFn: () => listAccessGrants(token),
    enabled: Boolean(token),
  });
  const auditQuery = useQuery({
    queryKey: ["audit-events", token],
    queryFn: () => listAuditEvents(token),
    enabled: Boolean(token),
  });

  const currentUser = currentUserQuery.data ?? session?.user ?? null;
  const metrics = useMemo(
    () => [
      { label: uiText.organizations, value: organizationsQuery.data?.items.length ?? 0 },
      { label: uiText.registries, value: registriesQuery.data?.items.length ?? 0 },
      { label: uiText.cards, value: cardsQuery.data?.items.length ?? 0 },
      { label: uiText.users, value: usersQuery.data?.items.length ?? 0 },
    ],
    [
      cardsQuery.data?.items.length,
      organizationsQuery.data?.items.length,
      registriesQuery.data?.items.length,
      usersQuery.data?.items.length,
    ],
  );

  function handleLogin(nextSession: SessionState) {
    saveSession(nextSession);
    setSession(nextSession);
  }

  function handleLogout() {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    queryClient.clear();
    setSession(null);
    setActiveSection("overview");
    setSelectedRegistryId(null);
    setSelectedCardId(null);
  }

  if (!session) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return (
    <main className="workspace-shell">
      <aside className="workspace-sidebar" aria-label={uiText.primaryNavigation}>
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true" />
          <div>
            <h1>Registry Engine</h1>
            <span>{uiText.brandSubtitle}</span>
          </div>
        </div>
        <nav className="workspace-nav">
          {visibleSections.map((section) => (
            <button
              type="button"
              key={section.id}
              className={section.id === activeSection ? "nav-item is-active" : "nav-item"}
              onClick={() => setActiveSection(section.id)}
            >
              {section.label}
            </button>
          ))}
        </nav>
      </aside>

      <section className="workspace-main">
        <header className="workspace-topbar">
          <div>
            <p className="section-kicker">{uiText.adminWorkspace}</p>
            <h2>{sectionLabel(activeSection)}</h2>
          </div>
          <div className="account-strip">
            <div>
              <strong>{currentUser?.display_name ?? uiText.signedIn}</strong>
              <span>{currentUser?.email}</span>
            </div>
            <button type="button" className="ghost-button" onClick={handleLogout}>
              {uiText.signOut}
            </button>
          </div>
        </header>

        <DataAlert
          error={[
            currentUserQuery.error,
            organizationsQuery.error,
            registriesQuery.error,
            registrySchemaQuery.error,
            cardsQuery.error,
            cardReadQuery.error,
            usersQuery.error,
            rolesQuery.error,
            permissionsQuery.error,
            grantsQuery.error,
            auditQuery.error,
          ].find(Boolean)}
        />

        {activeSection === "overview" && (
          <Overview
            metrics={metrics}
            organizations={organizationsQuery.data?.items ?? []}
            users={usersQuery.data?.items ?? []}
            auditEvents={auditQuery.data?.items ?? []}
          />
        )}
        {activeSection === "organizations" && (
          <OrganizationsTable organizations={organizationsQuery.data?.items ?? []} />
        )}
        {activeSection === "registries" && (
          <RegistriesAndSchema
            registries={registriesQuery.data?.items ?? []}
            schema={registrySchemaQuery.data ?? null}
            selectedRegistryId={activeRegistryId}
            onSelectRegistry={(registryId) => {
              setSelectedRegistryId(registryId);
              setSelectedCardId(null);
            }}
          />
        )}
        {activeSection === "cards" && (
          <CardsWorkspace
            cards={cardsQuery.data?.items ?? []}
            card={cardReadQuery.data ?? null}
            schema={registrySchemaQuery.data ?? null}
            token={token}
            organizations={organizationsQuery.data?.items ?? []}
            selectedCardId={activeCardId}
            onSelectCard={setSelectedCardId}
          />
        )}
        {activeSection === "users" && (
          <UsersAndRoles
            users={usersQuery.data?.items ?? []}
            roles={rolesQuery.data?.items ?? []}
            permissions={permissionsQuery.data?.items ?? []}
          />
        )}
        {activeSection === "access" && (
          <AccessGrantsTable
            grants={grantsQuery.data?.items ?? []}
            users={usersQuery.data?.items ?? []}
            roles={rolesQuery.data?.items ?? []}
            organizations={organizationsQuery.data?.items ?? []}
          />
        )}
        {activeSection === "audit" && <AuditTable auditEvents={auditQuery.data?.items ?? []} />}
      </section>
    </main>
  );
}

function LoginScreen({ onLogin }: { onLogin: (session: SessionState) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const loginMutation = useMutation({
    mutationFn: () => login(email, password),
    onSuccess: (response) => {
      onLogin({ token: response.access_token, user: response.user });
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    loginMutation.mutate();
  }

  return (
    <main className="login-shell">
      <section className="login-panel">
        <div className="brand-lockup login-brand">
          <span className="brand-mark" aria-hidden="true" />
          <div>
            <h1>Registry Engine</h1>
            <span>{uiText.adminWorkspace}</span>
          </div>
        </div>
        <form className="login-form" onSubmit={handleSubmit}>
          <label>
            {uiText.email}
            <input
              autoComplete="email"
              name="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label>
            {uiText.password}
            <input
              autoComplete="current-password"
              name="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          {loginMutation.error && <p className="form-error">{errorText(loginMutation.error)}</p>}
          <button type="submit" className="primary-button" disabled={loginMutation.isPending}>
            {loginMutation.isPending ? uiText.signingIn : uiText.signIn}
          </button>
        </form>
      </section>
    </main>
  );
}

function Overview({
  metrics,
  organizations,
  users,
  auditEvents,
}: {
  metrics: { label: string; value: number }[];
  organizations: OrganizationRead[];
  users: UserRead[];
  auditEvents: AuditEventRead[];
}) {
  return (
    <div className="stack">
      <section className="summary-grid" aria-label={uiText.summary}>
        {metrics.map((metric) => (
          <div className="metric-card" key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
          </div>
        ))}
      </section>
      <div className="split-grid">
        <Panel title={uiText.organizations}>
          <CompactList
            items={organizations.slice(0, 5).map((item) => ({
              id: item.id,
              title: item.name,
              detail: item.code,
            }))}
          />
        </Panel>
        <Panel title={uiText.users}>
          <CompactList
            items={users.slice(0, 5).map((item) => ({
              id: item.id,
              title: item.display_name,
              detail: item.email,
            }))}
          />
        </Panel>
      </div>
      <AuditTable auditEvents={auditEvents.slice(0, 6)} />
    </div>
  );
}

function OrganizationsTable({ organizations }: { organizations: OrganizationRead[] }) {
  return (
    <Panel title={uiText.organizations}>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{uiText.organizationName}</th>
              <th>{uiText.code}</th>
              <th>{uiText.type}</th>
              <th>{uiText.status}</th>
            </tr>
          </thead>
          <tbody>
            {organizations.map((organization) => (
              <tr key={organization.id}>
                <td>{organization.name}</td>
                <td>{organization.code}</td>
                <td>{organizationTypeLabel(organization.type)}</td>
                <td>{activityLabel(organization.is_active)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function RegistriesAndSchema({
  registries,
  schema,
  selectedRegistryId,
  onSelectRegistry,
}: {
  registries: RegistryRead[];
  schema: RegistrySchemaRead | null;
  selectedRegistryId: string;
  onSelectRegistry: (registryId: string) => void;
}) {
  const blocksById = useMemo(
    () => new Map((schema?.blocks ?? []).map((block) => [block.id, block])),
    [schema?.blocks],
  );

  return (
    <div className="stack">
      <div className="split-grid">
        <Panel title={uiText.registries}>
          <SelectableList
            items={registries.map((registry) => ({
              id: registry.id,
              title: registry.name,
              detail: `${registry.code} / v${registry.schema_version} / ${lifecycleStatusLabel(
                registry.lifecycle_status,
              )}`,
            }))}
            selectedId={selectedRegistryId}
            onSelect={onSelectRegistry}
          />
        </Panel>
        <Panel title={uiText.schemaBlocks}>
          <BlocksTable blocks={schema?.blocks ?? []} />
        </Panel>
      </div>
      <Panel title={uiText.schemaFields}>
        <FieldsTable fields={schema?.fields ?? []} blocksById={blocksById} />
      </Panel>
    </div>
  );
}

function BlocksTable({ blocks }: { blocks: FormBlockRead[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>{uiText.title}</th>
            <th>{uiText.code}</th>
            <th>{uiText.repeatable}</th>
            <th>{uiText.status}</th>
          </tr>
        </thead>
        <tbody>
          {blocks.map((block) => (
            <tr key={block.id}>
              <td>{block.title}</td>
              <td>{block.code}</td>
              <td>{booleanLabel(block.is_repeatable)}</td>
              <td>{activityLabel(block.is_active)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FieldsTable({
  fields,
  blocksById,
}: {
  fields: FormFieldRead[];
  blocksById: Map<string, FormBlockRead>;
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>{uiText.field}</th>
            <th>{uiText.code}</th>
            <th>{uiText.block}</th>
            <th>{uiText.type}</th>
            <th>{uiText.options}</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((field) => (
            <tr key={field.id}>
              <td>{field.label}</td>
              <td>{field.code}</td>
              <td>{blocksById.get(field.block_id)?.title ?? shortId(field.block_id)}</td>
              <td>{fieldTypeLabel(field.field_type)}</td>
              <td>{optionsSourceLabel(field.options_source_type)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CardsWorkspace({
  cards,
  card,
  schema,
  token,
  organizations,
  selectedCardId,
  onSelectCard,
}: {
  cards: CardSummaryRead[];
  card: CardRead | null;
  schema: RegistrySchemaRead | null;
  token: string;
  organizations: OrganizationRead[];
  selectedCardId: string;
  onSelectCard: (cardId: string) => void;
}) {
  const organizationsById = useMemo(
    () => new Map(organizations.map((organization) => [organization.id, organization])),
    [organizations],
  );
  const fieldRows = useMemo(() => buildEditableCardFields(card, schema), [card, schema]);

  return (
    <div className="stack">
      <div className="split-grid">
        <Panel title={uiText.cards}>
          <SelectableList
            items={cards.map((item) => ({
              id: item.id,
              title: item.display_name,
              detail: `${organizationsById.get(item.organization_id)?.name ?? shortId(item.organization_id)} / ${lifecycleStatusLabel(
                item.lifecycle_status,
              )}`,
            }))}
            selectedId={selectedCardId}
            onSelect={onSelectCard}
          />
        </Panel>
        <Panel title={uiText.cardFields}>
          <div className="field-editor-list">
            {card &&
              fieldRows.map((field) => (
                <CardFieldEditor key={field.key} cardId={card.id} field={field} token={token} />
              ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

type EditableCardField = {
  key: string;
  blockLabel: string;
  instanceLabel: string;
  label: string;
  field: CardRead["fields"][string];
  schema: FormFieldRead | null;
  blockInstanceId: string | null;
};

function CardFieldEditor({
  cardId,
  field,
  token,
}: {
  cardId: string;
  field: EditableCardField;
  token: string;
}) {
  const queryClient = useQueryClient();
  const [rawValue, setRawValue] = useState<FieldEditorState>(() => initialEditorValue(field.field));
  const [localError, setLocalError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const referenceListId =
    field.schema?.options_source_type === "reference_list" ? field.schema.options_source_id : null;
  const referenceItemsQuery = useQuery({
    queryKey: ["reference-items", token, referenceListId],
    queryFn: () => listReferenceItems(token, referenceListId ?? ""),
    enabled:
      Boolean(token && referenceListId) &&
      ["select", "multi_select"].includes(field.field.field_type),
  });
  const mutation = useMutation({
    mutationFn: (value: unknown) =>
      updateCardFieldValue(token, cardId, field.field.field_id, value, field.blockInstanceId),
    onSuccess: async () => {
      setSaved(true);
      await queryClient.invalidateQueries({ queryKey: ["card", token, cardId] });
      await queryClient.invalidateQueries({ queryKey: ["audit-events", token] });
    },
  });

  function updateRawValue(nextValue: FieldEditorState) {
    setRawValue(nextValue);
    setSaved(false);
    setLocalError(null);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      mutation.mutate(coerceEditorValue(field.field.field_type, rawValue));
    } catch (error) {
      setLocalError(errorText(error));
    }
  }

  return (
    <form className="field-editor-row" onSubmit={handleSubmit}>
      <div className="field-editor-meta">
        <strong>{field.label}</strong>
        <span>
          {field.blockLabel} / {field.instanceLabel} / {fieldTypeLabel(field.field.field_type)}
        </span>
        <span>
          {uiText.currentValue}: {formatValue(field.field.value)}
        </span>
      </div>
      <label className="field-editor-control">
        <span>{field.label}</span>
        <FieldEditorControl
          fieldType={field.field.field_type}
          label={field.label}
          options={referenceItemsQuery.data?.items ?? []}
          value={rawValue}
          onChange={updateRawValue}
        />
      </label>
      <button type="submit" className="primary-button" disabled={mutation.isPending}>
        {saveLabel(field.label)}
      </button>
      {(localError || mutation.error) && (
        <p className="inline-alert">{localError ?? errorText(mutation.error)}</p>
      )}
      {saved && <p className="inline-success">{savedLabel(field.label)}</p>}
    </form>
  );
}

function UsersAndRoles({
  users,
  roles,
  permissions,
}: {
  users: UserRead[];
  roles: RoleRead[];
  permissions: PermissionRead[];
}) {
  return (
    <div className="stack">
      <Panel title={uiText.users}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{uiText.displayName}</th>
                <th>{uiText.email}</th>
                <th>{uiText.status}</th>
                <th>{uiText.superuser}</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>{user.display_name}</td>
                  <td>{user.email}</td>
                  <td>{lifecycleStatusLabel(user.status)}</td>
                  <td>{booleanLabel(user.is_superuser)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <div className="split-grid">
        <Panel title={uiText.roles}>
          <CompactList
            items={roles.map((role) => ({
              id: role.id,
              title: role.code,
              detail: role.name,
            }))}
          />
        </Panel>
        <Panel title={uiText.permissions}>
          <CompactList
            items={permissions.map((permission) => ({
              id: permission.id,
              title: permission.code,
              detail: permission.description ?? "",
            }))}
          />
        </Panel>
      </div>
    </div>
  );
}

function AccessGrantsTable({
  grants,
  users,
  roles,
  organizations,
}: {
  grants: AccessGrantRead[];
  users: UserRead[];
  roles: RoleRead[];
  organizations: OrganizationRead[];
}) {
  const usersById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);
  const rolesById = useMemo(() => new Map(roles.map((role) => [role.id, role])), [roles]);
  const organizationsById = useMemo(
    () => new Map(organizations.map((organization) => [organization.id, organization])),
    [organizations],
  );

  return (
    <Panel title={uiText.accessGrants}>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{uiText.user}</th>
              <th>{uiText.role}</th>
              <th>{uiText.organization}</th>
              <th>{uiText.scope}</th>
            </tr>
          </thead>
          <tbody>
            {grants.map((grant) => (
              <tr key={grant.id}>
                <td>{usersById.get(grant.user_id)?.email ?? shortId(grant.user_id)}</td>
                <td>{rolesById.get(grant.role_id)?.code ?? shortId(grant.role_id)}</td>
                <td>
                  {grant.organization_id
                    ? (organizationsById.get(grant.organization_id)?.name ??
                      shortId(grant.organization_id))
                    : uiText.global}
                </td>
                <td>{grantScopeLabel(grant.include_descendants)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function AuditTable({ auditEvents }: { auditEvents: AuditEventRead[] }) {
  return (
    <Panel title={uiText.audit}>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{uiText.action}</th>
              <th>{uiText.object}</th>
              <th>{uiText.source}</th>
              <th>{uiText.time}</th>
            </tr>
          </thead>
          <tbody>
            {auditEvents.map((event) => (
              <tr key={event.id}>
                <td>{auditActionLabel(event.action)}</td>
                <td>{auditObjectTypeLabel(event.object_type)}</td>
                <td>{auditSourceLabel(event.source)}</td>
                <td>{formatDate(event.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="data-panel">
      <header>
        <h3>{title}</h3>
      </header>
      {children}
    </section>
  );
}

function SelectableList({
  items,
  selectedId,
  onSelect,
}: {
  items: { id: string; title: string; detail: string }[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="selectable-list">
      {items.map((item) => (
        <button
          type="button"
          key={item.id}
          className={item.id === selectedId ? "selectable-row is-selected" : "selectable-row"}
          onClick={() => onSelect(item.id)}
        >
          <strong>{item.title}</strong>
          <span>{item.detail}</span>
        </button>
      ))}
    </div>
  );
}

function CompactList({ items }: { items: { id: string; title: string; detail: string }[] }) {
  return (
    <ul className="compact-list">
      {items.map((item) => (
        <li key={item.id}>
          <strong>{item.title}</strong>
          <span>{item.detail}</span>
        </li>
      ))}
    </ul>
  );
}

function DataAlert({ error }: { error: Error | null | undefined }) {
  if (!error) {
    return null;
  }

  return <p className="data-alert">{errorText(error)}</p>;
}

function loadSession(): SessionState | null {
  const rawValue = localStorage.getItem(SESSION_STORAGE_KEY);
  if (!rawValue) {
    return null;
  }
  try {
    const parsed = JSON.parse(rawValue) as SessionState;
    if (!parsed.token || !parsed.user?.id) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function saveSession(session: SessionState) {
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

function errorText(error: unknown) {
  if (error instanceof ApiError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return uiText.requestFailed;
}

function buildEditableCardFields(
  card: CardRead | null,
  schema: RegistrySchemaRead | null,
): EditableCardField[] {
  if (!card) {
    return [];
  }

  const fieldsById = new Map((schema?.fields ?? []).map((field) => [field.id, field]));
  const blocksById = new Map((schema?.blocks ?? []).map((block) => [block.id, block]));

  return Object.values(card.blocks).flatMap((block) =>
    block.instances.flatMap((instance) =>
      Object.values(instance.fields).map((field) => {
        const fieldSchema = fieldsById.get(field.field_id) ?? null;
        const blockSchema = blocksById.get(block.block_id);
        return {
          key: `${card.id}:${block.block_id}:${instance.block_instance_id ?? instance.ordinal}:${field.field_id}`,
          blockLabel: blockSchema?.title ?? block.code,
          instanceLabel: instanceLabel(instance.ordinal),
          label: fieldSchema?.label ?? field.code,
          field,
          schema: fieldSchema,
          blockInstanceId: instance.block_instance_id,
        };
      }),
    ),
  );
}

function shortId(value: string) {
  return value.slice(0, 8);
}

function formatDate(value: string) {
  return formatUiDateTime(value);
}
