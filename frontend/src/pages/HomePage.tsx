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
  ReferenceItemRead,
  RegistryRead,
  RegistrySchemaRead,
  RoleRead,
  UserRead,
} from "@/api/types";

const SESSION_STORAGE_KEY = "reg_engine.session.v1";
const visibleSections = [
  "Overview",
  "Organizations",
  "Registries",
  "Cards",
  "Users",
  "Access",
  "Audit",
] as const;

type VisibleSection = (typeof visibleSections)[number];

type SessionState = {
  token: string;
  user: CurrentUser;
};

export function HomePage() {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<SessionState | null>(() => loadSession());
  const [activeSection, setActiveSection] = useState<VisibleSection>("Overview");
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
      { label: "Organizations", value: organizationsQuery.data?.items.length ?? 0 },
      { label: "Registries", value: registriesQuery.data?.items.length ?? 0 },
      { label: "Cards", value: cardsQuery.data?.items.length ?? 0 },
      { label: "Users", value: usersQuery.data?.items.length ?? 0 },
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
    setActiveSection("Overview");
    setSelectedRegistryId(null);
    setSelectedCardId(null);
  }

  if (!session) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return (
    <main className="workspace-shell">
      <aside className="workspace-sidebar" aria-label="Primary">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true" />
          <div>
            <h1>Registry Engine</h1>
            <span>Core Schema v1</span>
          </div>
        </div>
        <nav className="workspace-nav">
          {visibleSections.map((section) => (
            <button
              type="button"
              key={section}
              className={section === activeSection ? "nav-item is-active" : "nav-item"}
              onClick={() => setActiveSection(section)}
            >
              {section}
            </button>
          ))}
        </nav>
      </aside>

      <section className="workspace-main">
        <header className="workspace-topbar">
          <div>
            <p className="section-kicker">Admin workspace</p>
            <h2>{activeSection}</h2>
          </div>
          <div className="account-strip">
            <div>
              <strong>{currentUser?.display_name ?? "Signed in"}</strong>
              <span>{currentUser?.email}</span>
            </div>
            <button type="button" className="ghost-button" onClick={handleLogout}>
              Sign out
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

        {activeSection === "Overview" && (
          <Overview
            metrics={metrics}
            organizations={organizationsQuery.data?.items ?? []}
            users={usersQuery.data?.items ?? []}
            auditEvents={auditQuery.data?.items ?? []}
          />
        )}
        {activeSection === "Organizations" && (
          <OrganizationsTable organizations={organizationsQuery.data?.items ?? []} />
        )}
        {activeSection === "Registries" && (
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
        {activeSection === "Cards" && (
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
        {activeSection === "Users" && (
          <UsersAndRoles
            users={usersQuery.data?.items ?? []}
            roles={rolesQuery.data?.items ?? []}
            permissions={permissionsQuery.data?.items ?? []}
          />
        )}
        {activeSection === "Access" && (
          <AccessGrantsTable
            grants={grantsQuery.data?.items ?? []}
            users={usersQuery.data?.items ?? []}
            roles={rolesQuery.data?.items ?? []}
            organizations={organizationsQuery.data?.items ?? []}
          />
        )}
        {activeSection === "Audit" && <AuditTable auditEvents={auditQuery.data?.items ?? []} />}
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
            <span>Admin workspace</span>
          </div>
        </div>
        <form className="login-form" onSubmit={handleSubmit}>
          <label>
            Email
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
            Password
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
            {loginMutation.isPending ? "Signing in" : "Sign in"}
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
      <section className="summary-grid" aria-label="Summary">
        {metrics.map((metric) => (
          <div className="metric-card" key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
          </div>
        ))}
      </section>
      <div className="split-grid">
        <Panel title="Organizations">
          <CompactList
            items={organizations.slice(0, 5).map((item) => ({
              id: item.id,
              title: item.name,
              detail: item.code,
            }))}
          />
        </Panel>
        <Panel title="Users">
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
    <Panel title="Organizations">
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Code</th>
              <th>Type</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {organizations.map((organization) => (
              <tr key={organization.id}>
                <td>{organization.name}</td>
                <td>{organization.code}</td>
                <td>{organization.type}</td>
                <td>{organization.is_active ? "active" : "inactive"}</td>
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
        <Panel title="Registries">
          <SelectableList
            items={registries.map((registry) => ({
              id: registry.id,
              title: registry.name,
              detail: `${registry.code} / v${registry.schema_version} / ${registry.lifecycle_status}`,
            }))}
            selectedId={selectedRegistryId}
            onSelect={onSelectRegistry}
          />
        </Panel>
        <Panel title="Schema blocks">
          <BlocksTable blocks={schema?.blocks ?? []} />
        </Panel>
      </div>
      <Panel title="Schema fields">
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
            <th>Title</th>
            <th>Code</th>
            <th>Repeatable</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {blocks.map((block) => (
            <tr key={block.id}>
              <td>{block.title}</td>
              <td>{block.code}</td>
              <td>{block.is_repeatable ? "yes" : "no"}</td>
              <td>{block.is_active ? "active" : "inactive"}</td>
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
            <th>Field</th>
            <th>Code</th>
            <th>Block</th>
            <th>Type</th>
            <th>Options</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((field) => (
            <tr key={field.id}>
              <td>{field.label}</td>
              <td>{field.code}</td>
              <td>{blocksById.get(field.block_id)?.title ?? shortId(field.block_id)}</td>
              <td>{field.field_type}</td>
              <td>{field.options_source_type ?? "none"}</td>
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
        <Panel title="Cards">
          <SelectableList
            items={cards.map((item) => ({
              id: item.id,
              title: item.display_name,
              detail: `${organizationsById.get(item.organization_id)?.name ?? shortId(item.organization_id)} / ${
                item.lifecycle_status
              }`,
            }))}
            selectedId={selectedCardId}
            onSelect={onSelectCard}
          />
        </Panel>
        <Panel title="Card fields">
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

type FieldEditorState = string | boolean | string[];

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
          {field.blockLabel} / {field.instanceLabel} / {field.field.field_type}
        </span>
        <span>Current: {formatValue(field.field.value)}</span>
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
        Save {field.label}
      </button>
      {(localError || mutation.error) && (
        <p className="inline-alert">{localError ?? errorText(mutation.error)}</p>
      )}
      {saved && <p className="inline-success">Saved {field.label}</p>}
    </form>
  );
}

function FieldEditorControl({
  fieldType,
  label,
  options,
  value,
  onChange,
}: {
  fieldType: string;
  label: string;
  options: ReferenceItemRead[];
  value: FieldEditorState;
  onChange: (value: FieldEditorState) => void;
}) {
  if (fieldType === "bool") {
    return (
      <input
        aria-label={label}
        checked={Boolean(value)}
        onChange={(event) => onChange(event.currentTarget.checked)}
        type="checkbox"
      />
    );
  }

  if (fieldType === "json") {
    return (
      <textarea
        aria-label={label}
        onChange={(event) => onChange(event.currentTarget.value)}
        value={typeof value === "string" ? value : "{}"}
      />
    );
  }

  if (fieldType === "multi_select") {
    return (
      <select
        aria-label={label}
        multiple
        onChange={(event) =>
          onChange(Array.from(event.currentTarget.selectedOptions).map((option) => option.value))
        }
        value={Array.isArray(value) ? value : []}
      >
        {options.map((item) => (
          <option key={item.id} value={item.id}>
            {item.label}
          </option>
        ))}
      </select>
    );
  }

  if (fieldType === "select") {
    return (
      <select
        aria-label={label}
        onChange={(event) => onChange(event.currentTarget.value)}
        value={typeof value === "string" ? value : ""}
      >
        <option value="">empty</option>
        {options.map((item) => (
          <option key={item.id} value={item.id}>
            {item.label}
          </option>
        ))}
      </select>
    );
  }

  return (
    <input
      aria-label={label}
      onChange={(event) => onChange(event.currentTarget.value)}
      type={inputTypeForField(fieldType)}
      value={typeof value === "string" ? value : ""}
    />
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
      <Panel title="Users">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Status</th>
                <th>Superuser</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>{user.display_name}</td>
                  <td>{user.email}</td>
                  <td>{user.status}</td>
                  <td>{user.is_superuser ? "yes" : "no"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <div className="split-grid">
        <Panel title="Roles">
          <CompactList
            items={roles.map((role) => ({
              id: role.id,
              title: role.code,
              detail: role.name,
            }))}
          />
        </Panel>
        <Panel title="Permissions">
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
    <Panel title="Access grants">
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>User</th>
              <th>Role</th>
              <th>Organization</th>
              <th>Scope</th>
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
                    : "global"}
                </td>
                <td>{grant.include_descendants ? "descendants" : "exact"}</td>
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
    <Panel title="Audit">
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Action</th>
              <th>Object</th>
              <th>Source</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {auditEvents.map((event) => (
              <tr key={event.id}>
                <td>{event.action}</td>
                <td>{event.object_type}</td>
                <td>{event.source}</td>
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
  return "Request failed";
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
          instanceLabel: `instance ${instance.ordinal + 1}`,
          label: fieldSchema?.label ?? field.code,
          field,
          schema: fieldSchema,
          blockInstanceId: instance.block_instance_id,
        };
      }),
    ),
  );
}

function initialEditorValue(field: CardRead["fields"][string]): FieldEditorState {
  if (field.field_type === "bool") {
    return Boolean(field.value);
  }
  if (field.field_type === "multi_select") {
    return Array.isArray(field.value) ? field.value.map(String) : [];
  }
  if (field.field_type === "json") {
    return field.value ? JSON.stringify(field.value, null, 2) : "{}";
  }
  if (field.value === null || field.value === undefined) {
    return "";
  }
  if (field.field_type === "datetime") {
    return String(field.value).slice(0, 16);
  }
  return String(field.value);
}

function coerceEditorValue(fieldType: string, value: FieldEditorState): unknown {
  if (fieldType === "bool") {
    return Boolean(value);
  }
  if (fieldType === "multi_select") {
    return Array.isArray(value) ? value : [];
  }
  if (fieldType === "json") {
    if (typeof value !== "string") {
      throw new Error("JSON fields require an object value.");
    }
    const parsed = JSON.parse(value) as unknown;
    if (parsed === null || Array.isArray(parsed) || typeof parsed !== "object") {
      throw new Error("JSON fields require an object value.");
    }
    return parsed;
  }
  if (fieldType === "number") {
    if (typeof value !== "string" || value.trim() === "") {
      throw new Error("Number fields require a numeric value.");
    }
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) {
      throw new Error("Number fields require a numeric value.");
    }
    return numberValue;
  }
  return typeof value === "string" ? value : "";
}

function inputTypeForField(fieldType: string) {
  if (fieldType === "number") {
    return "number";
  }
  if (fieldType === "date") {
    return "date";
  }
  if (fieldType === "datetime") {
    return "datetime-local";
  }
  return "text";
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "empty";
  }
  if (Array.isArray(value)) {
    return value.map(formatValue).join(", ");
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

function shortId(value: string) {
  return value.slice(0, 8);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
