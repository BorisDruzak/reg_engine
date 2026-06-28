import type {
  AccessGrantListRead,
  AuditEventListRead,
  CurrentUser,
  LoginResponse,
  OrganizationListRead,
  PermissionListRead,
  RoleListRead,
  UserListRead,
} from "./types";

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
    return body.detail ?? `Request failed with status ${response.status}`;
  } catch {
    return `Request failed with status ${response.status}`;
  }
}
