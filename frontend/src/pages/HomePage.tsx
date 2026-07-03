import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import {
  ApiError,
  getCurrentUser,
  getRegistrySchema,
  listAccessGrants,
  listAuditEvents,
  listOrganizationCards,
  listOrganizationTree,
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
import type { CardFieldFilterPayload } from "@/api/types";
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

type WorkspaceUiState = {
  activeSection: VisibleSection;
  isSidebarCollapsed: boolean;
  selectedRegistryId: string | null;
  selectedCardId: string | null;
  cardSearch: string;
  cardOrganizationIds: string[];
  cardIncludeDescendantOrganizations: boolean;
  cardTemplateIds: string[];
  cardFieldFilters: CardFieldFilterPayload[];
  includeArchivedCards: boolean;
};

const workspaceUiStateKey = "reg_engine.admin_workspace_state.v1";

export function HomePage() {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<SessionState | null>(() => loadSession());
  const [workspaceUiState, setWorkspaceUiState] = useState<WorkspaceUiState>(() =>
    loadWorkspaceUiState(),
  );
  const [sidebarPinnedExpanded, setSidebarPinnedExpanded] = useState(false);
  const {
    activeSection,
    isSidebarCollapsed,
    selectedRegistryId,
    selectedCardId,
    cardSearch,
    cardOrganizationIds,
    cardIncludeDescendantOrganizations,
    cardTemplateIds,
    cardFieldFilters,
    includeArchivedCards,
  } = workspaceUiState;

  const token = session?.token ?? "";
  const needsRegistrySchema = activeSection === "registries" || activeSection === "cards";
  const needsCards = activeSection === "overview" || activeSection === "cards";
  const needsUsers = activeSection === "users" || activeSection === "access";
  const needsRoles = activeSection === "users" || activeSection === "access";
  const needsPermissions = activeSection === "users";
  const needsAccessGrants = activeSection === "access";
  const needsAudit = activeSection === "audit";
  const needsOrganizationTree = activeSection === "organizations";
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
  const organizationTreeQuery = useQuery({
    queryKey: ["organizations-tree", token],
    queryFn: () => listOrganizationTree(token),
    enabled: Boolean(token && needsOrganizationTree),
  });
  const registriesQuery = useQuery({
    queryKey: ["registries", token],
    queryFn: () => listRegistries(token),
    enabled: Boolean(token),
  });
  const cardListOrganizationId =
    cardOrganizationIds[0] ||
    organizationsQuery.data?.items.find((organization) => organization.parent_id === null)?.id ||
    organizationsQuery.data?.items[0]?.id ||
    "";
  const activeRegistryId = selectedRegistryId ?? registriesQuery.data?.items[0]?.id ?? "";
  const cardsQuery = useQuery({
    queryKey: [
      "organization-cards",
      token,
      cardListOrganizationId,
      cardOrganizationIds.join("|"),
      cardIncludeDescendantOrganizations,
      includeArchivedCards,
      cardSearch,
      cardTemplateIds.join("|"),
      JSON.stringify(cardFieldFilters),
    ],
    queryFn: () =>
      listOrganizationCards(token, cardListOrganizationId, {
        organizationIds: cardOrganizationIds,
        includeDescendantOrganizations: cardIncludeDescendantOrganizations,
        includeArchive: includeArchivedCards,
        q: cardSearch || undefined,
        cardTemplateIds,
        fieldFilters: cardFieldFilters,
      }),
    enabled: Boolean(token && cardListOrganizationId && needsCards),
  });
  const activeCardId = selectedCardId ?? cardsQuery.data?.items[0]?.id ?? "";
  const cardWorkflowRegistryId =
    cardsQuery.data?.items.find((item) => item.id === activeCardId)?.registry_id ??
    cardsQuery.data?.items[0]?.registry_id ??
    registriesQuery.data?.items.find((registry) => registry.is_default_for_owner_tree)?.id ??
    "";
  const schemaRegistryId = activeSection === "cards" ? cardWorkflowRegistryId : activeRegistryId;
  const registrySchemaQuery = useQuery({
    queryKey: ["registry-schema", token, schemaRegistryId],
    queryFn: () => getRegistrySchema(token, schemaRegistryId),
    enabled: Boolean(token && schemaRegistryId && needsRegistrySchema),
  });
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

  useEffect(() => {
    saveWorkspaceUiState(workspaceUiState);
  }, [workspaceUiState]);

  useEffect(() => {
    if (activeSection === "registries" && !sidebarPinnedExpanded && !isSidebarCollapsed) {
      setSidebarCollapsed(true);
    }
  }, [activeSection, isSidebarCollapsed, sidebarPinnedExpanded]);

  function setActiveSection(value: VisibleSection) {
    setWorkspaceUiState((current) => ({ ...current, activeSection: value }));
  }

  function setSidebarCollapsed(value: boolean) {
    setWorkspaceUiState((current) => ({ ...current, isSidebarCollapsed: value }));
  }

  function handleSidebarToggle() {
    const nextCollapsed = !isSidebarCollapsed;
    setSidebarPinnedExpanded(!nextCollapsed);
    setSidebarCollapsed(nextCollapsed);
  }

  function handleSidebarInteraction() {
    if (!isSidebarCollapsed) {
      return;
    }
    setSidebarPinnedExpanded(true);
    setSidebarCollapsed(false);
  }

  function setSelectedRegistryId(value: string | null) {
    setWorkspaceUiState((current) => ({ ...current, selectedRegistryId: value }));
  }

  function setSelectedCardId(value: string | null) {
    setWorkspaceUiState((current) => ({ ...current, selectedCardId: value }));
  }

  function setCardSearch(value: string) {
    setWorkspaceUiState((current) => ({ ...current, cardSearch: value }));
  }

  function setCardOrganizationIds(value: string[]) {
    setWorkspaceUiState((current) => ({ ...current, cardOrganizationIds: value }));
  }

  function setCardIncludeDescendantOrganizations(value: boolean) {
    setWorkspaceUiState((current) => ({
      ...current,
      cardIncludeDescendantOrganizations: value,
    }));
  }

  function setCardFieldFilters(value: CardFieldFilterPayload[]) {
    setWorkspaceUiState((current) => ({ ...current, cardFieldFilters: value }));
  }

  function setCardTemplateIds(value: string[]) {
    setWorkspaceUiState((current) => ({ ...current, cardTemplateIds: value }));
  }

  function setIncludeArchivedCards(value: boolean) {
    setWorkspaceUiState((current) => ({ ...current, includeArchivedCards: value }));
  }

  function handleLogin(nextSession: SessionState) {
    saveSession(nextSession);
    setSession(nextSession);
  }

  function handleLogout() {
    clearSession();
    queryClient.clear();
    setSession(null);
    const nextState = defaultWorkspaceUiState();
    localStorage.removeItem(workspaceUiStateKey);
    setWorkspaceUiState(nextState);
  }

  function handleCardSearchChange(value: string) {
    setCardSearch(value);
    setSelectedCardId(null);
  }

  function handleCardOrganizationIdsChange(value: string[]) {
    setCardOrganizationIds(value);
    setSelectedCardId(null);
  }

  function handleCardIncludeDescendantOrganizationsChange(value: boolean) {
    setCardIncludeDescendantOrganizations(value);
    setSelectedCardId(null);
  }

  function handleCardFieldFiltersChange(value: CardFieldFilterPayload[]) {
    setCardFieldFilters(value);
    setSelectedCardId(null);
  }

  function handleCardTemplateIdsChange(value: string[]) {
    setCardTemplateIds(value);
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
    <main
      className={isSidebarCollapsed ? "workspace-shell is-sidebar-collapsed" : "workspace-shell"}
    >
      <aside
        className="workspace-sidebar"
        aria-label={uiText.primaryNavigation}
        onClick={handleSidebarInteraction}
      >
        <div className="sidebar-header">
          <div className="brand-lockup">
            <span className="brand-mark" aria-hidden="true" />
            <div className="brand-text">
              <h1>{uiText.productName}</h1>
              <span>{uiText.brandSubtitle}</span>
            </div>
          </div>
          <button
            type="button"
            className="ghost-button icon-button sidebar-toggle"
            aria-label={isSidebarCollapsed ? uiText.expandNavigation : uiText.collapseNavigation}
            title={isSidebarCollapsed ? uiText.expandNavigation : uiText.collapseNavigation}
            onClick={(event) => {
              event.stopPropagation();
              handleSidebarToggle();
            }}
          >
            <span aria-hidden="true">{isSidebarCollapsed ? ">" : "<"}</span>
          </button>
        </div>
        <nav className="workspace-nav">
          {visibleSections.map((section) => (
            <button
              type="button"
              key={section.id}
              className={section.id === activeSection ? "nav-item is-active" : "nav-item"}
              aria-label={section.label}
              onClick={() => setActiveSection(section.id)}
            >
              <SectionIcon section={section.id} />
              <span className="nav-label">{section.label}</span>
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
            activeSection === "organizations" ? organizationTreeQuery.error : null,
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
          <OrganizationsTable
            organizations={organizationsQuery.data?.items ?? []}
            organizationTree={organizationTreeQuery.data?.items ?? []}
            token={token}
          />
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
            currentUserId={currentUser?.id ?? "unknown"}
            organizations={organizationsQuery.data?.items ?? []}
            selectedCardId={activeCardId}
            cardSearch={cardSearch}
            cardOrganizationIds={cardOrganizationIds}
            cardIncludeDescendantOrganizations={cardIncludeDescendantOrganizations}
            cardTemplateIds={cardTemplateIds}
            cardFieldFilters={cardFieldFilters}
            includeArchivedCards={includeArchivedCards}
            onSelectCard={setSelectedCardId}
            onCardSearchChange={handleCardSearchChange}
            onCardOrganizationIdsChange={handleCardOrganizationIdsChange}
            onCardIncludeDescendantOrganizationsChange={
              handleCardIncludeDescendantOrganizationsChange
            }
            onCardTemplateIdsChange={handleCardTemplateIdsChange}
            onCardFieldFiltersChange={handleCardFieldFiltersChange}
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

function defaultWorkspaceUiState(): WorkspaceUiState {
  return {
    activeSection: "overview",
    isSidebarCollapsed: false,
    selectedRegistryId: null,
    selectedCardId: null,
    cardSearch: "",
    cardOrganizationIds: [],
    cardIncludeDescendantOrganizations: true,
    cardTemplateIds: [],
    cardFieldFilters: [],
    includeArchivedCards: false,
  };
}

function loadWorkspaceUiState(): WorkspaceUiState {
  try {
    const raw = localStorage.getItem(workspaceUiStateKey);
    if (!raw) {
      return defaultWorkspaceUiState();
    }
    const parsed = JSON.parse(raw) as Partial<WorkspaceUiState>;
    return {
      activeSection: isVisibleSection(parsed.activeSection) ? parsed.activeSection : "overview",
      isSidebarCollapsed:
        typeof parsed.isSidebarCollapsed === "boolean" ? parsed.isSidebarCollapsed : false,
      selectedRegistryId:
        typeof parsed.selectedRegistryId === "string" ? parsed.selectedRegistryId : null,
      selectedCardId: typeof parsed.selectedCardId === "string" ? parsed.selectedCardId : null,
      cardSearch: typeof parsed.cardSearch === "string" ? parsed.cardSearch : "",
      cardOrganizationIds: normalizeCardOrganizationIds(parsed),
      cardIncludeDescendantOrganizations:
        typeof parsed.cardIncludeDescendantOrganizations === "boolean"
          ? parsed.cardIncludeDescendantOrganizations
          : true,
      cardTemplateIds: normalizeStringList(parsed.cardTemplateIds),
      cardFieldFilters: normalizeCardFieldFilters(parsed.cardFieldFilters),
      includeArchivedCards:
        typeof parsed.includeArchivedCards === "boolean" ? parsed.includeArchivedCards : false,
    };
  } catch {
    return defaultWorkspaceUiState();
  }
}

function saveWorkspaceUiState(state: WorkspaceUiState) {
  localStorage.setItem(workspaceUiStateKey, JSON.stringify(state));
}

function normalizeStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function normalizeCardFieldFilters(value: unknown): CardFieldFilterPayload[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is CardFieldFilterPayload => {
    if (!item || typeof item !== "object") {
      return false;
    }
    const filter = item as Partial<CardFieldFilterPayload>;
    return (
      typeof filter.field_id === "string" &&
      typeof filter.field_type === "string" &&
      typeof filter.operator === "string" &&
      Object.prototype.hasOwnProperty.call(filter, "value")
    );
  });
}

function normalizeCardOrganizationIds(
  parsed: Partial<WorkspaceUiState> & { cardOrganizationId?: unknown },
) {
  if (Array.isArray(parsed.cardOrganizationIds)) {
    return parsed.cardOrganizationIds.filter((value): value is string => typeof value === "string");
  }
  return typeof parsed.cardOrganizationId === "string" && parsed.cardOrganizationId
    ? [parsed.cardOrganizationId]
    : [];
}

function isVisibleSection(value: unknown): value is VisibleSection {
  return (
    value === "overview" ||
    value === "organizations" ||
    value === "registries" ||
    value === "cards" ||
    value === "users" ||
    value === "access" ||
    value === "audit"
  );
}

function SectionIcon({ section }: { section: VisibleSection }) {
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {section === "overview" && (
        <>
          <rect x="4" y="4" width="6" height="6" rx="1.5" />
          <rect x="14" y="4" width="6" height="6" rx="1.5" />
          <rect x="4" y="14" width="6" height="6" rx="1.5" />
          <rect x="14" y="14" width="6" height="6" rx="1.5" />
        </>
      )}
      {section === "organizations" && (
        <>
          <circle cx="12" cy="5" r="2" />
          <circle cx="7" cy="18" r="2" />
          <circle cx="17" cy="18" r="2" />
          <path d="M12 7v4M12 11H7v5M12 11h5v5" />
        </>
      )}
      {section === "registries" && (
        <>
          <rect x="5" y="5" width="14" height="4" rx="1" />
          <rect x="5" y="11" width="14" height="4" rx="1" />
          <rect x="5" y="17" width="14" height="2" rx="1" />
        </>
      )}
      {section === "cards" && (
        <>
          <rect x="5" y="4" width="14" height="16" rx="2" />
          <path d="M8 9h8M8 13h8M8 17h5" />
        </>
      )}
      {section === "users" && (
        <>
          <circle cx="9" cy="8" r="3" />
          <circle cx="17" cy="9" r="2.4" />
          <path d="M4 19c.8-3 2.5-5 5-5s4.2 2 5 5M14.5 15.5c1.8.3 3 1.5 3.5 3.5" />
        </>
      )}
      {section === "access" && (
        <>
          <circle cx="8" cy="12" r="3.2" />
          <path d="M11.2 12H20M16 12v3M19 12v3" />
        </>
      )}
      {section === "audit" && (
        <>
          <path d="M6 5h12M6 10h12M6 15h8M6 20h5" />
          <path d="m16 18 1.6 1.6L21 16" />
        </>
      )}
    </svg>
  );
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
