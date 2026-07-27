import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  ApiError,
  authenticationRequiredEvent,
  getCurrentUser,
  getRegistrySchema,
  listAuditEvents,
  listOrganizationCards,
  listOrganizationTree,
  listOrganizations,
  listRegistries,
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
import { BrandMark } from "@/components/common/BrandMark";
import { DataAlert, Panel } from "@/components/common/DataSurfaces";
import { AuditPanel } from "@/features/audit/AuditPanel";
import { LoginScreen } from "@/features/auth/LoginScreen";
import {
  clearSession,
  loadSession,
  saveSession,
  sessionExpiryTimestamp,
  type SessionState,
} from "@/features/auth/session";
import { CardsWorkspace } from "@/features/cards/CardsWorkspace";
import { CardChangeNotificationBell } from "@/features/notifications/CardChangeNotificationBell";
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
  const [sidebarHoverPreview, setSidebarHoverPreview] = useState(false);
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
  const needsRegistrySchema = activeSection === "registries";
  const needsCards = activeSection === "overview" || activeSection === "cards";
  const needsUsers = activeSection === "users";
  const needsAudit = activeSection === "audit";
  const needsOrganizationTree = activeSection === "organizations" || activeSection === "users";
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
  const auditCardListOrganizationId =
    organizationsQuery.data?.items.find((organization) => organization.parent_id === null)?.id ??
    organizationsQuery.data?.items[0]?.id ??
    "";
  const auditCardsQuery = useQuery({
    queryKey: ["audit-card-selector", token, auditCardListOrganizationId],
    queryFn: () =>
      listOrganizationCards(token, auditCardListOrganizationId, {
        organizationIds: [],
        includeDescendantOrganizations: true,
        includeArchive: true,
        cardTemplateIds: [],
        fieldFilters: [],
      }),
    enabled: Boolean(token && auditCardListOrganizationId && activeSection === "audit"),
  });
  const visibleCards = cardsQuery.data?.items ?? [];
  const activeCardId =
    selectedCardId && visibleCards.some((card) => card.id === selectedCardId)
      ? selectedCardId
      : (visibleCards[0]?.id ?? "");
  const cardWorkflowRegistryId =
    cardsQuery.data?.items.find((item) => item.id === activeCardId)?.registry_id ??
    cardsQuery.data?.items[0]?.registry_id ??
    registriesQuery.data?.items.find((registry) => registry.is_default_for_owner_tree)?.id ??
    "";
  const schemaRegistryId = activeSection === "cards" ? cardWorkflowRegistryId : activeRegistryId;
  const cardReadQuery = useQuery({
    queryKey: ["card", token, activeCardId],
    queryFn: () => readCard(token, activeCardId),
    enabled: Boolean(token && activeCardId && activeSection === "cards"),
  });
  const canLoadCardWorkflowSchema =
    activeSection === "cards" &&
    (Boolean(cardReadQuery.data?.can_manage) ||
      (cardsQuery.isSuccess && visibleCards.length === 0));
  const registrySchemaQuery = useQuery({
    queryKey: ["registry-schema", token, schemaRegistryId],
    queryFn: () => getRegistrySchema(token, schemaRegistryId),
    enabled: Boolean(
      token && schemaRegistryId && (needsRegistrySchema || canLoadCardWorkflowSchema),
    ),
  });
  const usersQuery = useQuery({
    queryKey: ["users", token],
    queryFn: () => listUsers(token),
    enabled: Boolean(token && (needsUsers || needsAudit)),
  });
  const auditQuery = useQuery({
    queryKey: ["audit-events", token],
    queryFn: () => listAuditEvents(token),
    enabled: Boolean(token && needsAudit),
  });
  const usersSectionDenied =
    activeSection === "users" &&
    hasAccessDeniedError([usersQuery.error, organizationTreeQuery.error]);
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

  const clearAuthenticatedSession = useCallback(() => {
    clearSession();
    queryClient.clear();
    setSession(null);
    const nextState = defaultWorkspaceUiState();
    localStorage.removeItem(workspaceUiStateKey);
    setWorkspaceUiState(nextState);
  }, [queryClient]);

  const sessionExpiry = session ? sessionExpiryTimestamp(session) : null;

  useEffect(() => {
    if (sessionExpiry === null) {
      return;
    }
    let timeoutId: number | undefined;
    const scheduleExpiryCheck = () => {
      const remainingMilliseconds = sessionExpiry - Date.now();
      if (remainingMilliseconds <= 0) {
        clearAuthenticatedSession();
        return;
      }
      timeoutId = window.setTimeout(
        scheduleExpiryCheck,
        Math.min(remainingMilliseconds, 2_147_483_647),
      );
    };
    scheduleExpiryCheck();
    return () => {
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [clearAuthenticatedSession, sessionExpiry]);

  useEffect(() => {
    const handleAuthenticationRequired = () => clearAuthenticatedSession();
    window.addEventListener(authenticationRequiredEvent, handleAuthenticationRequired);
    return () =>
      window.removeEventListener(authenticationRequiredEvent, handleAuthenticationRequired);
  }, [clearAuthenticatedSession]);

  function setActiveSection(value: VisibleSection) {
    setWorkspaceUiState((current) => ({
      ...current,
      activeSection: value,
      isSidebarCollapsed: value === "registries" || current.isSidebarCollapsed,
    }));
  }

  function handleSidebarPointerEnter() {
    if (isSidebarCollapsed) {
      setSidebarHoverPreview(true);
    }
  }

  function handleSidebarPointerLeave() {
    setSidebarHoverPreview(false);
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
    clearAuthenticatedSession();
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

  async function handleOpenCreatedCard(cardId: string) {
    const broadOrganizationId =
      organizationsQuery.data?.items.find((organization) => organization.parent_id === null)?.id ??
      organizationsQuery.data?.items[0]?.id ??
      "";
    const includeDescendantOrganizations = true;

    setWorkspaceUiState((current) => ({
      ...current,
      selectedCardId: cardId,
      cardSearch: "",
      cardOrganizationIds: [],
      cardIncludeDescendantOrganizations: includeDescendantOrganizations,
      cardTemplateIds: [],
      cardFieldFilters: [],
      includeArchivedCards: false,
    }));

    if (!token || !broadOrganizationId) {
      return;
    }

    const broadCardQueryKey = [
      "organization-cards",
      token,
      broadOrganizationId,
      "",
      includeDescendantOrganizations,
      false,
      "",
      "",
      "[]",
    ];
    await queryClient.invalidateQueries({
      queryKey: broadCardQueryKey,
      exact: true,
      refetchType: "none",
    });
    await queryClient.fetchQuery({
      queryKey: broadCardQueryKey,
      queryFn: () =>
        listOrganizationCards(token, broadOrganizationId, {
          organizationIds: [],
          includeDescendantOrganizations,
          includeArchive: false,
          cardTemplateIds: [],
          fieldFilters: [],
        }),
    });
  }

  async function handleOpenNotificationCard(cardId: string) {
    const broadOrganizationId =
      organizationsQuery.data?.items.find((organization) => organization.parent_id === null)?.id ??
      organizationsQuery.data?.items[0]?.id ??
      "";
    const includeDescendantOrganizations = true;

    setWorkspaceUiState((current) => ({
      ...current,
      activeSection: "cards",
      selectedCardId: cardId,
      cardSearch: "",
      cardOrganizationIds: [],
      cardIncludeDescendantOrganizations: includeDescendantOrganizations,
      cardTemplateIds: [],
      cardFieldFilters: [],
      includeArchivedCards: true,
    }));

    if (!token || !broadOrganizationId) {
      return;
    }

    const broadCardQueryKey = [
      "organization-cards",
      token,
      broadOrganizationId,
      "",
      includeDescendantOrganizations,
      true,
      "",
      "",
      "[]",
    ];
    await queryClient.invalidateQueries({
      queryKey: broadCardQueryKey,
      exact: true,
      refetchType: "none",
    });
    await queryClient.fetchQuery({
      queryKey: broadCardQueryKey,
      queryFn: () =>
        listOrganizationCards(token, broadOrganizationId, {
          organizationIds: [],
          includeDescendantOrganizations,
          includeArchive: true,
          cardTemplateIds: [],
          fieldFilters: [],
        }),
    });
  }

  if (!session) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return (
    <main
      className={
        isSidebarCollapsed
          ? `workspace-shell is-sidebar-collapsed${sidebarHoverPreview ? " is-sidebar-hover-preview" : ""}`
          : "workspace-shell"
      }
    >
      <aside
        className="workspace-sidebar"
        aria-label={uiText.primaryNavigation}
        onPointerEnter={handleSidebarPointerEnter}
        onPointerMove={handleSidebarPointerEnter}
        onPointerLeave={handleSidebarPointerLeave}
      >
        <div className="sidebar-header">
          <div className="brand-lockup">
            <BrandMark />
            <div className="brand-text">
              <h1>{uiText.productName}</h1>
              <span>{uiText.brandSubtitle}</span>
            </div>
          </div>
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
            <CardChangeNotificationBell token={token} onOpenCard={handleOpenNotificationCard} />
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
            needsRegistrySchema || canLoadCardWorkflowSchema ? registrySchemaQuery.error : null,
            activeSection === "cards" ? cardsQuery.error : null,
            activeSection === "cards" ? cardReadQuery.error : null,
            activeSection === "users" ? usersQuery.error : null,
            activeSection === "users" ? organizationTreeQuery.error : null,
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
            onOpenCreatedCard={handleOpenCreatedCard}
          />
        )}
        {activeSection === "users" && (
          <>
            {usersSectionDenied ? (
              <SectionAccessDenied />
            ) : (
              <UsersAndRoles
                users={usersQuery.data?.items ?? []}
                organizationTree={organizationTreeQuery.data?.items ?? []}
                canConfigureAccess={Boolean(
                  currentUser?.is_superuser || currentUser?.can_manage_access,
                )}
                canToggleAccessDelegation={Boolean(currentUser?.is_superuser)}
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
              <AuditPanel
                auditEvents={auditQuery.data?.items ?? []}
                cards={auditCardsQuery.data?.items ?? []}
                token={token}
                users={usersQuery.data?.items ?? []}
              />
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
    const activeSection = isVisibleSection(parsed.activeSection)
      ? parsed.activeSection
      : "overview";
    return {
      activeSection,
      isSidebarCollapsed:
        activeSection === "registries" ||
        (typeof parsed.isSidebarCollapsed === "boolean" ? parsed.isSidebarCollapsed : false),
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
