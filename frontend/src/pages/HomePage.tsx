import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import {
  ApiError,
  getCurrentUser,
  getRegistrySchema,
  listAccessGrants,
  listAuditEvents,
  listCards,
  listOrganizations,
  listPermissions,
  listRegistries,
  listRoles,
  listUsers,
  readCard,
} from "@/api/client";
import {
  sectionLabel,
  uiText,
  userDisplayNameLabel,
  visibleSections,
  type VisibleSection,
} from "@/app/uiText";
import { DataAlert, Panel } from "@/components/common/DataSurfaces";
import { AccessGrantsTable } from "@/features/access/AccessGrantsTable";
import { AuditTable } from "@/features/audit/AuditTable";
import { LoginScreen } from "@/features/auth/LoginScreen";
import { clearSession, loadSession, saveSession, type SessionState } from "@/features/auth/session";
import { CardsWorkspace } from "@/features/cards/CardsWorkspace";
import { OrganizationsTable } from "@/features/organizations/OrganizationsTable";
import { Overview } from "@/features/overview/Overview";
import { RegistriesAndSchema } from "@/features/registry/RegistriesAndSchema";
import { UsersAndRoles } from "@/features/users/UsersAndRoles";

export function HomePage() {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<SessionState | null>(() => loadSession());
  const [activeSection, setActiveSection] = useState<VisibleSection>("overview");
  const [selectedRegistryId, setSelectedRegistryId] = useState<string | null>(null);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [cardSearch, setCardSearch] = useState("");
  const [cardOrganizationId, setCardOrganizationId] = useState("");
  const [includeArchivedCards, setIncludeArchivedCards] = useState(false);

  const token = session?.token ?? "";
  const needsRegistrySchema = activeSection === "registries" || activeSection === "cards";
  const needsCards = activeSection === "overview" || activeSection === "cards";
  const needsUsers = activeSection === "users" || activeSection === "access";
  const needsRoles = activeSection === "users" || activeSection === "access";
  const needsPermissions = activeSection === "users";
  const needsAccessGrants = activeSection === "access";
  const needsAudit = activeSection === "audit";
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
    enabled: Boolean(token && activeRegistryId && needsRegistrySchema),
  });
  const cardsQuery = useQuery({
    queryKey: [
      "cards",
      token,
      activeRegistryId,
      cardOrganizationId,
      includeArchivedCards,
      cardSearch,
    ],
    queryFn: () =>
      listCards(token, activeRegistryId, {
        organizationId: cardOrganizationId || undefined,
        includeArchive: includeArchivedCards,
        q: cardSearch || undefined,
      }),
    enabled: Boolean(token && activeRegistryId && needsCards),
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
    enabled: Boolean(token && needsUsers),
  });
  const rolesQuery = useQuery({
    queryKey: ["roles", token],
    queryFn: () => listRoles(token),
    enabled: Boolean(token && needsRoles),
  });
  const permissionsQuery = useQuery({
    queryKey: ["permissions", token],
    queryFn: () => listPermissions(token),
    enabled: Boolean(token && needsPermissions),
  });
  const grantsQuery = useQuery({
    queryKey: ["access-grants", token],
    queryFn: () => listAccessGrants(token),
    enabled: Boolean(token && needsAccessGrants),
  });
  const auditQuery = useQuery({
    queryKey: ["audit-events", token],
    queryFn: () => listAuditEvents(token),
    enabled: Boolean(token && needsAudit),
  });
  const usersSectionDenied =
    activeSection === "users" &&
    hasAccessDeniedError([usersQuery.error, rolesQuery.error, permissionsQuery.error]);
  const accessSectionDenied =
    activeSection === "access" &&
    hasAccessDeniedError([usersQuery.error, rolesQuery.error, grantsQuery.error]);
  const auditSectionDenied = activeSection === "audit" && hasAccessDeniedError([auditQuery.error]);

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
    clearSession();
    queryClient.clear();
    setSession(null);
    setActiveSection("overview");
    setSelectedRegistryId(null);
    setSelectedCardId(null);
    setCardSearch("");
    setCardOrganizationId("");
    setIncludeArchivedCards(false);
  }

  function handleCardSearchChange(value: string) {
    setCardSearch(value);
    setSelectedCardId(null);
  }

  function handleCardOrganizationChange(value: string) {
    setCardOrganizationId(value);
    setSelectedCardId(null);
  }

  function handleIncludeArchivedCardsChange(value: boolean) {
    setIncludeArchivedCards(value);
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
            <h1>{uiText.productName}</h1>
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
              <strong>
                {currentUser?.display_name
                  ? userDisplayNameLabel(currentUser.display_name)
                  : uiText.signedIn}
              </strong>
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
            activeSection === "registries" || activeSection === "cards"
              ? registrySchemaQuery.error
              : null,
            activeSection === "cards" ? cardsQuery.error : null,
            activeSection === "cards" ? cardReadQuery.error : null,
            activeSection === "users" || activeSection === "access" ? usersQuery.error : null,
            activeSection === "users" || activeSection === "access" ? rolesQuery.error : null,
            activeSection === "users" ? permissionsQuery.error : null,
            activeSection === "access" ? grantsQuery.error : null,
            activeSection === "audit" ? auditQuery.error : null,
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
          <OrganizationsTable organizations={organizationsQuery.data?.items ?? []} token={token} />
        )}
        {activeSection === "registries" && (
          <RegistriesAndSchema
            registries={registriesQuery.data?.items ?? []}
            schema={registrySchemaQuery.data ?? null}
            organizations={organizationsQuery.data?.items ?? []}
            selectedRegistryId={activeRegistryId}
            token={token}
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
            selectedRegistryId={activeRegistryId}
            selectedCardId={activeCardId}
            cardSearch={cardSearch}
            cardOrganizationId={cardOrganizationId}
            includeArchivedCards={includeArchivedCards}
            onSelectCard={setSelectedCardId}
            onCardSearchChange={handleCardSearchChange}
            onCardOrganizationChange={handleCardOrganizationChange}
            onIncludeArchivedCardsChange={handleIncludeArchivedCardsChange}
          />
        )}
        {activeSection === "users" && (
          <>
            {usersSectionDenied ? (
              <SectionAccessDenied />
            ) : (
              <UsersAndRoles
                users={usersQuery.data?.items ?? []}
                roles={rolesQuery.data?.items ?? []}
                permissions={permissionsQuery.data?.items ?? []}
                token={token}
              />
            )}
          </>
        )}
        {activeSection === "access" && (
          <>
            {accessSectionDenied ? (
              <SectionAccessDenied />
            ) : (
              <AccessGrantsTable
                grants={grantsQuery.data?.items ?? []}
                users={usersQuery.data?.items ?? []}
                roles={rolesQuery.data?.items ?? []}
                organizations={organizationsQuery.data?.items ?? []}
                registries={registriesQuery.data?.items ?? []}
                token={token}
              />
            )}
          </>
        )}
        {activeSection === "audit" && (
          <>
            {auditSectionDenied ? (
              <SectionAccessDenied />
            ) : (
              <AuditTable auditEvents={auditQuery.data?.items ?? []} />
            )}
          </>
        )}
      </section>
    </main>
  );
}

function hasAccessDeniedError(errors: unknown[]) {
  return errors.some((error) => error instanceof ApiError && error.status === 403);
}

function SectionAccessDenied() {
  return (
    <Panel title={uiText.accessDenied}>
      <p className="data-empty" role="alert">
        {uiText.sectionAccessDenied}
      </p>
    </Panel>
  );
}
