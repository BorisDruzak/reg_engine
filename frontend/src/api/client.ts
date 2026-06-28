import type {
  AccessGrantListRead,
  AuditEventListRead,
  CardListRead,
  CardRead,
  CurrentUser,
  FieldValueRead,
  LoginResponse,
  OrganizationListRead,
  PermissionListRead,
  PublicLinkPreviewRead,
  ReferenceItemListRead,
  RegistryListRead,
  RegistrySchemaRead,
  RoleListRead,
  UserListRead,
} from "./types";
import { uiText } from "../app/uiText";

export const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";

type RequestOptions = {
  method?: string;
  token?: string;
  body?: unknown;
};

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function login(email: string, password: string) {
  return apiRequest<LoginResponse>("/api/v1/auth/login", {
    method: "POST",
    body: { email, password },
  });
}

export async function getCurrentUser(token: string) {
  return apiRequest<CurrentUser>("/api/v1/auth/me", { token });
}

export async function listOrganizations(token: string) {
  return apiRequest<OrganizationListRead>("/api/v1/organizations", { token });
}

export async function listRegistries(token: string) {
  return apiRequest<RegistryListRead>("/api/v1/registries", { token });
}

export async function getRegistrySchema(token: string, registryId: string) {
  return apiRequest<RegistrySchemaRead>(`/api/v1/registries/${registryId}/schema`, { token });
}

export async function listCards(token: string, registryId: string) {
  return apiRequest<CardListRead>(`/api/v1/registries/${registryId}/cards`, { token });
}

export async function readCard(token: string, cardId: string) {
  return apiRequest<CardRead>(`/api/v1/cards/${cardId}`, { token });
}

export async function updateCardFieldValue(
  token: string,
  cardId: string,
  fieldId: string,
  value: unknown,
  blockInstanceId: string | null,
) {
  return apiRequest<FieldValueRead>(`/api/v1/cards/${cardId}/fields/${fieldId}`, {
    method: "PATCH",
    token,
    body: { value, block_instance_id: blockInstanceId },
  });
}

export async function listReferenceItems(token: string, listId: string) {
  return apiRequest<ReferenceItemListRead>(`/api/v1/reference-lists/${listId}/items`, { token });
}

export async function readPublicLinkPreview(rawToken: string) {
  return apiRequest<PublicLinkPreviewRead>("/api/v1/public-links/preview", {
    method: "POST",
    body: { raw_token: rawToken },
  });
}

export async function updatePublicLinkFieldValue(
  rawToken: string,
  fieldId: string,
  value: unknown,
  blockInstanceId: string | null,
) {
  return apiRequest<FieldValueRead>("/api/v1/public-links/edit", {
    method: "POST",
    body: {
      raw_token: rawToken,
      field_id: fieldId,
      value,
      block_instance_id: blockInstanceId,
    },
  });
}

export async function listUsers(token: string) {
  return apiRequest<UserListRead>("/api/v1/users", { token });
}

export async function listRoles(token: string) {
  return apiRequest<RoleListRead>("/api/v1/roles", { token });
}

export async function listPermissions(token: string) {
  return apiRequest<PermissionListRead>("/api/v1/permissions", { token });
}

export async function listAccessGrants(token: string) {
  return apiRequest<AccessGrantListRead>("/api/v1/access-grants", { token });
}

export async function listAuditEvents(token: string) {
  return apiRequest<AuditEventListRead>("/api/v1/audit-events?limit=20", { token });
}

async function apiRequest<T>(path: string, options: RequestOptions = {}) {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  const response = await fetch(`${apiBaseUrl.replace(/\/$/, "")}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  if (!response.ok) {
    const message = await errorMessage(response);
    throw new ApiError(message, response.status);
  }

  return (await response.json()) as T;
}

async function errorMessage(response: Response) {
  try {
    const body = (await response.json()) as { detail?: string };
    return body.detail ?? `${uiText.requestFailed}: ${response.status}`;
  } catch {
    return `${uiText.requestFailed}: ${response.status}`;
  }
}
