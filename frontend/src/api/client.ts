import type {
  AccessGrantListRead,
  AuditEventListRead,
  AttachmentListRead,
  AttachmentRead,
  CardListRead,
  CardRead,
  CurrentUser,
  DocumentTemplateCreatePayload,
  DocumentTemplateListRead,
  DocumentTemplateRead,
  FieldValueRead,
  GeneratedDocumentListRead,
  GeneratedDocumentRead,
  LoginResponse,
  OrganizationListRead,
  PublicLinkAttachmentListRead,
  PublicLinkAttachmentRead,
  PermissionListRead,
  PublicLinkPreviewRead,
  ReferenceItemListRead,
  RegistryListRead,
  RegistrySchemaRead,
  RoleListRead,
  UserListRead,
} from "./types";
import { uiText } from "../app/uiText";

export const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "";

type RequestOptions = {
  method?: string;
  token?: string;
  body?: BodyInit | Record<string, unknown>;
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

export async function listPublicLinkAttachments(rawToken: string) {
  return apiRequest<PublicLinkAttachmentListRead>("/api/v1/public-links/attachments", {
    method: "POST",
    body: { raw_token: rawToken },
  });
}

export async function uploadPublicLinkAttachment(
  rawToken: string,
  payload: { file: File; title?: string },
) {
  const formData = new FormData();
  formData.append("raw_token", rawToken);
  formData.append("file", payload.file);
  if (payload.title?.trim()) {
    formData.append("title", payload.title.trim());
  }
  return apiRequest<PublicLinkAttachmentRead>("/api/v1/public-links/attachments/upload", {
    method: "POST",
    body: formData,
  });
}

export async function downloadPublicLinkAttachmentContent(rawToken: string, attachmentId: string) {
  return downloadPublicFile(
    `/api/v1/public-links/attachments/${attachmentId}/content`,
    rawToken,
    "X-Attachment-Filename",
  );
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

export async function listAttachments(token: string, cardId: string) {
  return apiRequest<AttachmentListRead>(`/api/v1/cards/${cardId}/attachments`, { token });
}

export async function uploadAttachment(
  token: string,
  cardId: string,
  payload: { file: File; title?: string },
) {
  const formData = new FormData();
  formData.append("file", payload.file);
  if (payload.title?.trim()) {
    formData.append("title", payload.title.trim());
  }
  return apiRequest<AttachmentRead>(`/api/v1/cards/${cardId}/attachments`, {
    method: "POST",
    token,
    body: formData,
  });
}

export async function downloadAttachmentContent(token: string, attachmentId: string) {
  return downloadFile(
    `/api/v1/attachments/${attachmentId}/content`,
    token,
    "X-Attachment-Filename",
  );
}

export async function archiveAttachment(token: string, attachmentId: string) {
  return apiRequest<AttachmentRead>(`/api/v1/attachments/${attachmentId}`, {
    method: "DELETE",
    token,
  });
}

export async function listDocumentTemplates(token: string, registryId: string) {
  return apiRequest<DocumentTemplateListRead>(
    `/api/v1/registries/${registryId}/document-templates`,
    { token },
  );
}

export async function createDocumentTemplate(
  token: string,
  registryId: string,
  payload: DocumentTemplateCreatePayload,
) {
  return apiRequest<DocumentTemplateRead>(`/api/v1/registries/${registryId}/document-templates`, {
    method: "POST",
    token,
    body: payload,
  });
}

export async function archiveDocumentTemplate(token: string, templateId: string) {
  return apiRequest<DocumentTemplateRead>(`/api/v1/document-templates/${templateId}`, {
    method: "DELETE",
    token,
  });
}

export async function listGeneratedDocuments(token: string, cardId: string) {
  return apiRequest<GeneratedDocumentListRead>(`/api/v1/cards/${cardId}/generated-documents`, {
    token,
  });
}

export async function generateDocument(
  token: string,
  cardId: string,
  templateId: string,
  title?: string,
) {
  return apiRequest<GeneratedDocumentRead>(`/api/v1/cards/${cardId}/generated-documents`, {
    method: "POST",
    token,
    body: { template_id: templateId, title: title?.trim() ? title.trim() : null },
  });
}

export async function downloadGeneratedDocumentContent(token: string, generatedDocumentId: string) {
  return downloadFile(
    `/api/v1/generated-documents/${generatedDocumentId}/content`,
    token,
    "X-Document-Filename",
  );
}

export async function archiveGeneratedDocument(token: string, generatedDocumentId: string) {
  return apiRequest<GeneratedDocumentRead>(`/api/v1/generated-documents/${generatedDocumentId}`, {
    method: "DELETE",
    token,
  });
}

async function apiRequest<T>(path: string, options: RequestOptions = {}) {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  const isFormData = options.body instanceof FormData;
  if (options.body !== undefined && !isFormData) {
    headers["Content-Type"] = "application/json";
  }
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }
  let body: BodyInit | undefined;
  if (options.body instanceof FormData) {
    body = options.body;
  } else if (options.body !== undefined) {
    body = JSON.stringify(options.body);
  }

  const response = await fetch(`${apiBaseUrl.replace(/\/$/, "")}${path}`, {
    method: options.method ?? "GET",
    headers,
    body,
  });

  if (!response.ok) {
    const message = await errorMessage(response);
    throw new ApiError(message, response.status);
  }

  return (await response.json()) as T;
}

async function downloadFile(path: string, token: string, filenameHeader: string) {
  const response = await fetch(`${apiBaseUrl.replace(/\/$/, "")}${path}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const message = await errorMessage(response);
    throw new ApiError(message, response.status);
  }

  return {
    blob: await response.blob(),
    filename: response.headers.get(filenameHeader) ?? "download",
  };
}

async function downloadPublicFile(path: string, rawToken: string, filenameHeader: string) {
  const response = await fetch(`${apiBaseUrl.replace(/\/$/, "")}${path}`, {
    method: "POST",
    headers: {
      Accept: "application/octet-stream",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw_token: rawToken }),
  });

  if (!response.ok) {
    const message = await errorMessage(response);
    throw new ApiError(message, response.status);
  }

  return {
    blob: await response.blob(),
    filename: response.headers.get(filenameHeader) ?? "download",
  };
}

async function errorMessage(response: Response) {
  try {
    const body = (await response.json()) as { detail?: string };
    return body.detail ?? `${uiText.requestFailed}: ${response.status}`;
  } catch {
    return `${uiText.requestFailed}: ${response.status}`;
  }
}
