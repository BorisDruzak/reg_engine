import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useMemo, useState } from "react";

import {
  ApiError,
  getCurrentUser,
  listAccessGrants,
  listAuditEvents,
  listOrganizations,
  listPermissions,
  listRoles,
  listUsers,
  login,
} from "@/api/client";
import type {
  AccessGrantRead,
  AuditEventRead,
  CurrentUser,
  OrganizationRead,
  PermissionRead,
  RoleRead,
  UserRead,
} from "@/api/types";

const SESSION_STORAGE_KEY = "reg_engine.session.v1";
const visibleSections = ["Overview", "Organizations", "Users", "Access", "Audit"] as const;

type VisibleSection = (typeof visibleSections)[number];

type SessionState = {
  token: string;
  user: CurrentUser;
};

export function HomePage() {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<SessionState | null>(() => loadSession());
  const [activeSection, setActiveSection] = useState<VisibleSection>("Overview");

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
      { label: "Users", value: usersQuery.data?.items.length ?? 0 },
      { label: "Roles", value: rolesQuery.data?.items.length ?? 0 },
      { label: "Grants", value: grantsQuery.data?.items.length ?? 0 },
    ],
    [
      grantsQuery.data?.items.length,
      organizationsQuery.data?.items.length,
      rolesQuery.data?.items.length,
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
                    ? organizationsById.get(grant.organization_id)?.name ??
                      shortId(grant.organization_id)
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

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="data-panel">
      <header>
        <h3>{title}</h3>
      </header>
      {children}
    </section>
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
