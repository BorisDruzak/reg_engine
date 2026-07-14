import type {
  AccessGrantListRead,
  AccessGrantCreatePayload,
  AccessGrantRead,
  AuditEventListRead,
  AttachmentListRead,
  AttachmentRead,
  CardBlockInstanceSummaryRead,
  CardCreationLinkCardListRead,
  CardCreationLinkCreatePayload,
  CardCreationLinkFirstSaveRead,
  CardCreationLinkListRead,
  CardCreationLinkPublicPreviewRead,
  CardCreationLinkRead,
  CardPrintTemplateCreatePayload,
  CardPrintTemplateBlankDownloadPayload,
  CardPrintTemplateVersionCreatePayload,
  CardTemplateCreatePayload,
  CardTemplateLayoutGeneratePayload,
  CardTemplateLayoutGeneratedDocumentRead,
  CardTemplateLayoutRead,
  CardTemplateLayoutUpdatePayload,
  CardTemplateListRead,
  CardTemplatePrintViewRead,
  CardTemplatePrintViewUpdatePayload,
  CardTemplateRead,
  CardTemplateUpdatePayload,
  CardCreatePayload,
  CardFieldFilterPayload,
  CardFieldOptionListRead,
  CardListRead,
  CardPrintPreviewPayload,
  CardPrintPreviewRead,
  CardPresentationRead,
  CardPublicAccessPayload,
  CardPublicAccessRead,
  CardRead,
  CardSummaryRead,
  CardTransferPayload,
  CardUpdatePayload,
  CurrentUser,
  DocumentTemplateCreatePayload,
  DocumentTemplateListRead,
  DocumentTemplateRead,
  DocumentTemplateVersionListRead,
  DocumentTemplateVersionRead,
  FieldValueListRead,
  FieldValuesBulkUpdatePayload,
  FieldValueRead,
  FormBlockCreatePayload,
  FormBlockRead,
  FormBlockUpdatePayload,
  FormFieldCreatePayload,
  FormFieldRead,
  FormFieldUpdatePayload,
  GeneratedDocumentListRead,
  GeneratedDocumentRead,
  LoginResponse,
  OrganizationCreatePayload,
  OrganizationCardCreatePayload,
  OrganizationListRead,
  OrganizationRead,
  OrganizationTreeRead,
  OrganizationUpdatePayload,
  OrgUnitCreatePayload,
  OrgUnitListRead,
  OrgUnitRead,
  OrgUnitUpdatePayload,
  PublicLinkCreatePayload,
  PublicLinkListRead,
  PublicLinkRead,
  PublicLinkReviewRead,
  PublicLinkSafeStatusRead,
  PublicLinkTokenRead,
  PublicLinkAttachmentListRead,
  PublicLinkAttachmentRead,
  PublicReferenceItemRead,
  PublicReferenceListRead,
  PublicReferenceWorkspaceRead,
  ReferenceEditLinkCreatePayload,
  ReferenceEditLinkListRead,
  ReferenceEditLinkRead,
  ReferenceEditLinkTokenRead,
  PermissionListRead,
  PublicLinkPreviewRead,
  ReferenceItemCreatePayload,
  ReferenceItemListRead,
  RegistryListRead,
  ReferenceItemRead,
  ReferenceItemUpdatePayload,
  ReferenceListCreatePayload,
  ReferenceListListRead,
  ReferenceListRead,
  ReferenceListUpdatePayload,
  RegistryCreatePayload,
  RegistryRead,
  RegistrySchemaRead,
  RegistryUpdatePayload,
  ReportRunCreatePayload,
  ReportRunListRead,
  ReportRunRead,
  ReportTemplateCreatePayload,
  ReportTemplateListRead,
  ReportTemplateRead,
  ReportTemplateUpdatePayload,
  RoleListRead,
  UserCreatePayload,
  UserListRead,
  UserRead,
  UserUpdatePayload,
  TabularCardExchangeOptionsRead,
  TabularCardImportCommitRead,
  TabularCardImportPreviewRead,
  TabularCardWorkbookPayload,
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

export async function listOrganizationTree(token: string) {
  return apiRequest<OrganizationTreeRead>("/api/v1/organizations/tree", { token });
}

export async function createOrganization(token: string, payload: OrganizationCreatePayload) {
  return apiRequest<OrganizationRead>("/api/v1/organizations", {
    method: "POST",
    token,
    body: payload,
  });
}

export async function updateOrganization(
  token: string,
  organizationId: string,
  payload: OrganizationUpdatePayload,
) {
  return apiRequest<OrganizationRead>(`/api/v1/organizations/${organizationId}`, {
    method: "PATCH",
    token,
    body: payload,
  });
}

export async function archiveOrganization(token: string, organizationId: string) {
  return apiRequest<OrganizationRead>(`/api/v1/organizations/${organizationId}`, {
    method: "DELETE",
    token,
  });
}

export async function listOrgUnits(
  token: string,
  organizationId: string,
): Promise<OrgUnitListRead> {
  return apiRequest<OrgUnitListRead>(`/api/v1/organizations/${organizationId}/org-units`, {
    token,
  });
}

export async function createOrgUnit(
  token: string,
  organizationId: string,
  payload: OrgUnitCreatePayload,
): Promise<OrgUnitRead> {
  return apiRequest<OrgUnitRead>(`/api/v1/organizations/${organizationId}/org-units`, {
    method: "POST",
    token,
    body: payload,
  });
}

export async function readOrgUnit(token: string, orgUnitId: string): Promise<OrgUnitRead> {
  return apiRequest<OrgUnitRead>(`/api/v1/org-units/${orgUnitId}`, { token });
}

export async function updateOrgUnit(
  token: string,
  orgUnitId: string,
  payload: OrgUnitUpdatePayload,
): Promise<OrgUnitRead> {
  return apiRequest<OrgUnitRead>(`/api/v1/org-units/${orgUnitId}`, {
    method: "PATCH",
    token,
    body: payload,
  });
}

export async function archiveOrgUnit(token: string, orgUnitId: string): Promise<OrgUnitRead> {
  return apiRequest<OrgUnitRead>(`/api/v1/org-units/${orgUnitId}`, {
    method: "DELETE",
    token,
  });
}

export async function listRegistries(token: string, includeArchive = false) {
  const archiveQuery = includeArchive ? "?include_archive=true" : "";
  return apiRequest<RegistryListRead>(`/api/v1/registries${archiveQuery}`, { token });
}

export async function createRegistry(token: string, payload: RegistryCreatePayload) {
  return apiRequest<RegistryRead>("/api/v1/registries", {
    method: "POST",
    token,
    body: payload,
  });
}

export async function updateRegistry(
  token: string,
  registryId: string,
  payload: RegistryUpdatePayload,
) {
  return apiRequest<RegistryRead>(`/api/v1/registries/${registryId}`, {
    method: "PATCH",
    token,
    body: payload,
  });
}

export async function archiveRegistry(token: string, registryId: string) {
  return apiRequest<RegistryRead>(`/api/v1/registries/${registryId}`, {
    method: "DELETE",
    token,
  });
}

export async function getRegistrySchema(token: string, registryId: string) {
  return apiRequest<RegistrySchemaRead>(`/api/v1/registries/${registryId}/schema`, { token });
}

export async function listCardTemplates(token: string, registryId: string, includeArchive = false) {
  const archiveQuery = includeArchive ? "?include_archive=true" : "";
  return apiRequest<CardTemplateListRead>(
    `/api/v1/registries/${registryId}/card-templates${archiveQuery}`,
    { token },
  );
}

export async function createCardTemplate(
  token: string,
  registryId: string,
  payload: CardTemplateCreatePayload,
) {
  return apiRequest<CardTemplateRead>(`/api/v1/registries/${registryId}/card-templates`, {
    method: "POST",
    token,
    body: payload,
  });
}

export async function updateCardTemplate(
  token: string,
  templateId: string,
  payload: CardTemplateUpdatePayload,
) {
  return apiRequest<CardTemplateRead>(`/api/v1/card-templates/${templateId}`, {
    method: "PATCH",
    token,
    body: payload,
  });
}

export async function archiveCardTemplate(token: string, templateId: string) {
  return apiRequest<CardTemplateRead>(`/api/v1/card-templates/${templateId}`, {
    method: "DELETE",
    token,
  });
}

export async function createFormBlock(
  token: string,
  registryId: string,
  payload: FormBlockCreatePayload,
) {
  return apiRequest<FormBlockRead>(`/api/v1/registries/${registryId}/blocks`, {
    method: "POST",
    token,
    body: payload,
  });
}

export async function updateFormBlock(
  token: string,
  blockId: string,
  payload: FormBlockUpdatePayload,
) {
  return apiRequest<FormBlockRead>(`/api/v1/blocks/${blockId}`, {
    method: "PATCH",
    token,
    body: payload,
  });
}

export async function archiveFormBlock(token: string, blockId: string) {
  return apiRequest<FormBlockRead>(`/api/v1/blocks/${blockId}`, {
    method: "DELETE",
    token,
  });
}

export async function createFormField(
  token: string,
  blockId: string,
  payload: FormFieldCreatePayload,
) {
  return apiRequest<FormFieldRead>(`/api/v1/blocks/${blockId}/fields`, {
    method: "POST",
    token,
    body: payload,
  });
}

export async function updateFormField(
  token: string,
  fieldId: string,
  payload: FormFieldUpdatePayload,
) {
  return apiRequest<FormFieldRead>(`/api/v1/fields/${fieldId}`, {
    method: "PATCH",
    token,
    body: payload,
  });
}

export async function archiveFormField(token: string, fieldId: string) {
  return apiRequest<FormFieldRead>(`/api/v1/fields/${fieldId}`, {
    method: "DELETE",
    token,
  });
}

export type CardListOptions = {
  organizationId?: string;
  organizationIds?: string[];
  cardTemplateIds?: string[];
  includeDescendantOrganizations?: boolean;
  includeArchive?: boolean;
  q?: string;
  fieldFilters?: CardFieldFilterPayload[];
};

export async function listCards(token: string, registryId: string, options: CardListOptions = {}) {
  const params = cardListSearchParams(options);
  const query = params.toString();
  return apiRequest<CardListRead>(
    `/api/v1/registries/${registryId}/cards${query ? `?${query}` : ""}`,
    { token },
  );
}

export async function listOrganizationCards(
  token: string,
  organizationId: string,
  options: CardListOptions = {},
) {
  const params = cardListSearchParams(options);
  const query = params.toString();
  return apiRequest<CardListRead>(
    `/api/v1/organizations/${organizationId}/cards${query ? `?${query}` : ""}`,
    { token },
  );
}

function cardListSearchParams(options: CardListOptions) {
  const params = new URLSearchParams();
  if (options.organizationId) {
    params.set("organization_id", options.organizationId);
  }
  for (const organizationId of options.organizationIds ?? []) {
    params.append("organization_ids", organizationId);
  }
  for (const cardTemplateId of options.cardTemplateIds ?? []) {
    params.append("card_template_ids", cardTemplateId);
  }
  if (options.includeDescendantOrganizations !== undefined) {
    params.set(
      "include_descendant_organizations",
      options.includeDescendantOrganizations ? "true" : "false",
    );
  }
  if (options.includeArchive) {
    params.set("include_archive", "true");
  }
  if (options.q?.trim()) {
    params.set("q", options.q.trim());
  }
  if (options.fieldFilters?.length) {
    params.set(
      "filters",
      JSON.stringify(
        options.fieldFilters.map(({ field_id, field_type, operator, value }) => ({
          field_id,
          field_type,
          operator,
          value,
        })),
      ),
    );
  }
  return params;
}

export async function createCard(token: string, registryId: string, payload: CardCreatePayload) {
  return apiRequest<CardSummaryRead>(`/api/v1/registries/${registryId}/cards`, {
    method: "POST",
    token,
    body: payload,
  });
}

export async function createOrganizationCard(
  token: string,
  organizationId: string,
  payload: OrganizationCardCreatePayload,
) {
  return apiRequest<CardSummaryRead>(`/api/v1/organizations/${organizationId}/cards`, {
    method: "POST",
    token,
    body: payload,
  });
}

export async function readCard(token: string, cardId: string) {
  return apiRequest<CardRead>(`/api/v1/cards/${cardId}`, { token });
}

export async function readCardPresentation(token: string, cardId: string) {
  return apiRequest<CardPresentationRead>(`/api/v1/cards/${cardId}/presentation`, { token });
}

export async function updateCard(token: string, cardId: string, payload: CardUpdatePayload) {
  return apiRequest<CardSummaryRead>(`/api/v1/cards/${cardId}`, {
    method: "PATCH",
    token,
    body: payload,
  });
}

export async function readCardPublicAccess(token: string, cardId: string) {
  return apiRequest<CardPublicAccessRead>(`/api/v1/cards/${cardId}/public-access`, { token });
}

export async function updateCardPublicAccess(
  token: string,
  cardId: string,
  payload: CardPublicAccessPayload,
) {
  return apiRequest<CardPublicAccessRead>(`/api/v1/cards/${cardId}/public-access`, {
    method: "PATCH",
    token,
    body: payload,
  });
}

export async function archiveCard(token: string, cardId: string) {
  return apiRequest<CardSummaryRead>(`/api/v1/cards/${cardId}`, {
    method: "DELETE",
    token,
  });
}

export async function createCardBlockInstance(token: string, cardId: string, blockId: string) {
  return apiRequest<CardBlockInstanceSummaryRead>(
    `/api/v1/cards/${cardId}/blocks/${blockId}/instances`,
    { method: "POST", token },
  );
}

export async function archiveCardBlockInstance(token: string, blockInstanceId: string) {
  return apiRequest<CardBlockInstanceSummaryRead>(
    `/api/v1/card-block-instances/${blockInstanceId}`,
    { method: "DELETE", token },
  );
}

export async function transferCard(token: string, cardId: string, payload: CardTransferPayload) {
  return apiRequest<CardSummaryRead>(`/api/v1/cards/${cardId}/transfer`, {
    method: "POST",
    token,
    body: payload,
  });
}

export async function getTabularXlsxCardExchangeOptions(token: string, registryId: string) {
  return apiRequest<TabularCardExchangeOptionsRead>(
    `/api/v1/registries/${registryId}/tabular-xlsx-card-exchange/options`,
    { token },
  );
}

export async function downloadTabularXlsxCards(
  token: string,
  registryId: string,
  payload: TabularCardWorkbookPayload,
) {
  return downloadJsonFile(
    `/api/v1/registries/${registryId}/tabular-xlsx-card-exchange/export`,
    token,
    "X-Document-Filename",
    payload,
  );
}

export async function downloadTabularXlsxImportTemplate(
  token: string,
  registryId: string,
  payload: TabularCardWorkbookPayload,
) {
  return downloadJsonFile(
    `/api/v1/registries/${registryId}/tabular-xlsx-card-exchange/import-template`,
    token,
    "X-Document-Filename",
    payload,
  );
}

export async function previewTabularXlsxImport(token: string, registryId: string, file: File) {
  const formData = new FormData();
  formData.append("file", file);
  return apiRequest<TabularCardImportPreviewRead>(
    `/api/v1/registries/${registryId}/tabular-xlsx-card-exchange/import/preview`,
    {
      method: "POST",
      token,
      body: formData,
    },
  );
}

export async function commitTabularXlsxImport(token: string, registryId: string, file: File) {
  const formData = new FormData();
  formData.append("file", file);
  return apiRequest<TabularCardImportCommitRead>(
    `/api/v1/registries/${registryId}/tabular-xlsx-card-exchange/import/commit`,
    {
      method: "POST",
      token,
      body: formData,
    },
  );
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

export async function updateCardFieldValues(
  token: string,
  cardId: string,
  payload: FieldValuesBulkUpdatePayload,
) {
  return apiRequest<FieldValueListRead>(`/api/v1/cards/${cardId}/values`, {
    method: "PATCH",
    token,
    body: payload,
  });
}

export async function listCardFieldReferenceItems(token: string, cardId: string, fieldId: string) {
  return apiRequest<ReferenceItemListRead>(
    `/api/v1/cards/${cardId}/fields/${fieldId}/reference-items`,
    { token },
  );
}

export async function listCardFieldOrgUnitOptions(token: string, cardId: string, fieldId: string) {
  return apiRequest<CardFieldOptionListRead>(
    `/api/v1/cards/${cardId}/fields/${fieldId}/org-unit-options`,
    { token },
  );
}

export async function listCardFieldOrganizationOptions(
  token: string,
  cardId: string,
  fieldId: string,
) {
  return apiRequest<CardFieldOptionListRead>(
    `/api/v1/cards/${cardId}/fields/${fieldId}/organization-options`,
    { token },
  );
}

export async function createReferenceEditLink(
  token: string,
  registryId: string,
  payload: ReferenceEditLinkCreatePayload,
) {
  return apiRequest<ReferenceEditLinkTokenRead>(
    `/api/v1/registries/${registryId}/reference-edit-links`,
    { method: "POST", token, body: payload },
  );
}

export async function listReferenceEditLinks(token: string, registryId: string) {
  return apiRequest<ReferenceEditLinkListRead>(
    `/api/v1/registries/${registryId}/reference-edit-links`,
    { token },
  );
}

export async function closeReferenceEditLink(token: string, linkId: string) {
  return apiRequest<ReferenceEditLinkRead>(`/api/v1/reference-edit-links/${linkId}/close`, {
    method: "POST",
    token,
  });
}

export async function getPublicReferenceWorkspace(rawToken: string) {
  return apiRequest<PublicReferenceWorkspaceRead>("/api/v1/public/reference-edit-links/workspace", {
    method: "POST",
    body: { raw_token: rawToken },
  });
}

export async function createPublicReferenceList(
  rawToken: string,
  name: string,
  description?: string,
) {
  return apiRequest<PublicReferenceListRead>("/api/v1/public/reference-edit-links/lists", {
    method: "POST",
    body: { raw_token: rawToken, name, description },
  });
}

export async function updatePublicReferenceList(
  rawToken: string,
  listId: string,
  payload: { name?: string; description?: string | null },
) {
  return apiRequest<PublicReferenceListRead>(
    `/api/v1/public/reference-edit-links/lists/${listId}`,
    {
      method: "PATCH",
      body: { raw_token: rawToken, ...payload },
    },
  );
}

export async function archivePublicReferenceList(rawToken: string, listId: string) {
  return apiRequest<PublicReferenceListRead>(
    `/api/v1/public/reference-edit-links/lists/${listId}`,
    {
      method: "DELETE",
      body: { raw_token: rawToken },
    },
  );
}

export async function createPublicReferenceItem(
  rawToken: string,
  listId: string,
  payload: { label: string; parent_id?: string | null; description?: string; position?: number },
) {
  return apiRequest<PublicReferenceItemRead>(
    `/api/v1/public/reference-edit-links/lists/${listId}/items`,
    { method: "POST", body: { raw_token: rawToken, ...payload } },
  );
}

export async function updatePublicReferenceItem(
  rawToken: string,
  itemId: string,
  payload: { label?: string; description?: string | null; position?: number },
) {
  return apiRequest<PublicReferenceItemRead>(
    `/api/v1/public/reference-edit-links/items/${itemId}`,
    {
      method: "PATCH",
      body: { raw_token: rawToken, ...payload },
    },
  );
}

export async function archivePublicReferenceItem(rawToken: string, itemId: string) {
  return apiRequest<PublicReferenceItemRead>(
    `/api/v1/public/reference-edit-links/items/${itemId}`,
    {
      method: "DELETE",
      body: { raw_token: rawToken },
    },
  );
}

export async function listReferenceItems(token: string, listId: string) {
  return apiRequest<ReferenceItemListRead>(`/api/v1/reference-lists/${listId}/items`, { token });
}

export async function listReferenceLists(
  token: string,
  registryId: string,
  organizationId?: string | null,
) {
  const organizationQuery = organizationId ? `?organization_id=${organizationId}` : "";
  return apiRequest<ReferenceListListRead>(
    `/api/v1/registries/${registryId}/reference-lists${organizationQuery}`,
    { token },
  );
}

export async function createReferenceList(
  token: string,
  registryId: string,
  payload: ReferenceListCreatePayload,
) {
  return apiRequest<ReferenceListRead>(`/api/v1/registries/${registryId}/reference-lists`, {
    method: "POST",
    token,
    body: payload,
  });
}

export async function readReferenceList(token: string, listId: string) {
  return apiRequest<ReferenceListRead>(`/api/v1/reference-lists/${listId}`, { token });
}

export async function updateReferenceList(
  token: string,
  listId: string,
  payload: ReferenceListUpdatePayload,
) {
  return apiRequest<ReferenceListRead>(`/api/v1/reference-lists/${listId}`, {
    method: "PATCH",
    token,
    body: payload,
  });
}

export async function archiveReferenceList(token: string, listId: string) {
  return apiRequest<ReferenceListRead>(`/api/v1/reference-lists/${listId}`, {
    method: "DELETE",
    token,
  });
}

export async function createReferenceItem(
  token: string,
  listId: string,
  payload: ReferenceItemCreatePayload,
) {
  return apiRequest<ReferenceItemRead>(`/api/v1/reference-lists/${listId}/items`, {
    method: "POST",
    token,
    body: payload,
  });
}

export async function readReferenceItem(token: string, itemId: string) {
  return apiRequest<ReferenceItemRead>(`/api/v1/reference-items/${itemId}`, { token });
}

export async function updateReferenceItem(
  token: string,
  itemId: string,
  payload: ReferenceItemUpdatePayload,
) {
  return apiRequest<ReferenceItemRead>(`/api/v1/reference-items/${itemId}`, {
    method: "PATCH",
    token,
    body: payload,
  });
}

export async function archiveReferenceItem(token: string, itemId: string) {
  return apiRequest<ReferenceItemRead>(`/api/v1/reference-items/${itemId}`, {
    method: "DELETE",
    token,
  });
}

export async function readPublicLinkPreview(rawToken: string) {
  return apiRequest<PublicLinkPreviewRead>("/api/v1/public-links/preview", {
    method: "POST",
    body: { raw_token: rawToken },
  });
}

export async function readPublicCardCreationLinkPreview(
  rawToken: string,
  organizationId?: string | null,
) {
  return apiRequest<CardCreationLinkPublicPreviewRead>(
    "/api/v1/public/card-creation-links/preview",
    {
      method: "POST",
      body: { raw_token: rawToken, organization_id: organizationId ?? null },
    },
  );
}

export async function firstSaveCardFromCreationLink(
  rawToken: string,
  payload: {
    organization_id: string;
    field_id: string;
    value: unknown;
    block_instance_id?: string | null;
  },
) {
  return apiRequest<CardCreationLinkFirstSaveRead>(
    "/api/v1/public/card-creation-links/first-save",
    {
      method: "POST",
      body: { raw_token: rawToken, ...payload },
    },
  );
}

export async function createCardDraftFromCreationLink(rawToken: string, organizationId: string) {
  return apiRequest<CardCreationLinkFirstSaveRead>(
    "/api/v1/public/card-creation-links/create-draft",
    {
      method: "POST",
      body: { raw_token: rawToken, organization_id: organizationId },
    },
  );
}

export async function submitPublicLink(rawToken: string) {
  return apiRequest<PublicLinkSafeStatusRead>("/api/v1/public-links/submit", {
    method: "POST",
    body: { raw_token: rawToken },
  });
}

export async function getPublicLinkStatus(rawToken: string) {
  return apiRequest<PublicLinkSafeStatusRead>("/api/v1/public-links/status", {
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

export async function createUser(token: string, payload: UserCreatePayload) {
  return apiRequest<UserRead>("/api/v1/users", {
    method: "POST",
    token,
    body: payload,
  });
}

export async function updateUser(token: string, userId: string, payload: UserUpdatePayload) {
  return apiRequest<UserRead>(`/api/v1/users/${userId}`, {
    method: "PATCH",
    token,
    body: payload,
  });
}

export async function archiveUser(token: string, userId: string) {
  return apiRequest<UserRead>(`/api/v1/users/${userId}`, {
    method: "DELETE",
    token,
  });
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

export async function createAccessGrant(token: string, payload: AccessGrantCreatePayload) {
  return apiRequest<AccessGrantRead>("/api/v1/access-grants", {
    method: "POST",
    token,
    body: payload,
  });
}

export async function archiveAccessGrant(token: string, grantId: string) {
  return apiRequest<AccessGrantRead>(`/api/v1/access-grants/${grantId}`, {
    method: "DELETE",
    token,
  });
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

export async function listCardPrintTemplates(
  token: string,
  registryId: string,
  cardTemplateId?: string | null,
) {
  const params = new URLSearchParams();
  if (cardTemplateId) {
    params.set("card_template_id", cardTemplateId);
  }
  const query = params.toString();
  return apiRequest<DocumentTemplateListRead>(
    `/api/v1/registries/${registryId}/card-print-templates${query ? `?${query}` : ""}`,
    { token },
  );
}

export async function getCardTemplateLayout(token: string, templateId: string) {
  return apiRequest<CardTemplateLayoutRead>(`/api/v1/card-templates/${templateId}/layout`, {
    token,
  });
}

export async function updateCardTemplateFormLayout(
  token: string,
  templateId: string,
  payload: CardTemplateLayoutUpdatePayload,
) {
  return apiRequest<CardTemplateLayoutRead>(`/api/v1/card-templates/${templateId}/layout/form`, {
    method: "PATCH",
    token,
    body: {
      expected_revision: payload.expected_revision,
      form_layout: payload.form_layout,
    },
  });
}

export async function createCardTemplatePrintView(
  token: string,
  templateId: string,
  payload: CardTemplatePrintViewUpdatePayload,
) {
  return apiRequest<CardTemplatePrintViewRead>(
    `/api/v1/card-templates/${templateId}/layout/print-views`,
    {
      method: "POST",
      token,
      body: payload,
    },
  );
}

export async function updateCardTemplatePrintView(
  token: string,
  templateId: string,
  printViewId: string,
  payload: CardTemplatePrintViewUpdatePayload,
) {
  return apiRequest<CardTemplatePrintViewRead>(
    `/api/v1/card-templates/${templateId}/layout/print-views/${printViewId}`,
    {
      method: "PATCH",
      token,
      body: payload,
    },
  );
}

export async function syncCardTemplatePrintView(
  token: string,
  templateId: string,
  printViewId: string,
) {
  return apiRequest<CardTemplatePrintViewRead>(
    `/api/v1/card-templates/${templateId}/layout/print-views/${printViewId}/sync`,
    {
      method: "POST",
      token,
    },
  );
}

export async function convertCardTemplatePrintViewToLinkedCard(
  token: string,
  templateId: string,
  printViewId: string,
) {
  return apiRequest<DocumentTemplateVersionRead>(
    `/api/v1/card-templates/${templateId}/layout/print-views/${printViewId}/convert-linked-card`,
    {
      method: "POST",
      token,
    },
  );
}

export async function readCardPrintTemplate(token: string, templateId: string) {
  return apiRequest<DocumentTemplateRead>(`/api/v1/card-print-templates/${templateId}`, { token });
}

export async function createCardPrintTemplate(
  token: string,
  registryId: string,
  payload: CardPrintTemplateCreatePayload,
) {
  return apiRequest<DocumentTemplateRead>(`/api/v1/registries/${registryId}/card-print-templates`, {
    method: "POST",
    token,
    body: payload,
  });
}

export async function createCardPrintTemplateVersion(
  token: string,
  templateId: string,
  payload: CardPrintTemplateVersionCreatePayload,
) {
  return apiRequest<DocumentTemplateVersionRead>(
    `/api/v1/card-print-templates/${templateId}/versions`,
    {
      method: "POST",
      token,
      body: payload,
    },
  );
}

export async function archiveCardPrintTemplate(token: string, templateId: string) {
  return archiveDocumentTemplate(token, templateId);
}

export async function previewCardPrintTemplate(token: string, payload: CardPrintPreviewPayload) {
  return apiRequest<CardPrintPreviewRead>("/api/v1/card-print-templates/preview", {
    method: "POST",
    token,
    body: payload,
  });
}

export async function uploadBinaryDocumentTemplate(
  token: string,
  registryId: string,
  payload: {
    file: File;
    code: string;
    name: string;
    description?: string | null;
    outputFilenameTemplate?: string;
  },
) {
  const formData = new FormData();
  formData.append("file", payload.file);
  formData.append("code", payload.code);
  formData.append("name", payload.name);
  if (payload.description?.trim()) {
    formData.append("description", payload.description.trim());
  }
  if (payload.outputFilenameTemplate?.trim()) {
    formData.append("output_filename_template", payload.outputFilenameTemplate.trim());
  }
  return apiRequest<DocumentTemplateRead>(
    `/api/v1/registries/${registryId}/document-templates/upload`,
    {
      method: "POST",
      token,
      body: formData,
    },
  );
}

export async function archiveDocumentTemplate(token: string, templateId: string) {
  return apiRequest<DocumentTemplateRead>(`/api/v1/document-templates/${templateId}`, {
    method: "DELETE",
    token,
  });
}

export async function listDocumentTemplateVersions(token: string, templateId: string) {
  return apiRequest<DocumentTemplateVersionListRead>(
    `/api/v1/document-templates/${templateId}/versions`,
    { token },
  );
}

export async function uploadBinaryDocumentTemplateVersion(
  token: string,
  templateId: string,
  file: File,
) {
  const formData = new FormData();
  formData.append("file", file);
  return apiRequest<DocumentTemplateVersionRead>(
    `/api/v1/document-templates/${templateId}/versions/upload`,
    {
      method: "POST",
      token,
      body: formData,
    },
  );
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

export async function generatePdfDocument(
  token: string,
  cardId: string,
  templateId: string,
  title?: string,
) {
  return apiRequest<GeneratedDocumentRead>(`/api/v1/cards/${cardId}/generated-documents/pdf`, {
    method: "POST",
    token,
    body: { template_id: templateId, title: title?.trim() ? title.trim() : null },
  });
}

export async function generateCardPrintDocumentDocx(
  token: string,
  cardId: string,
  templateId: string,
  title?: string,
) {
  return generateDocument(token, cardId, templateId, title);
}

export async function generateCardPrintDocumentPdf(
  token: string,
  cardId: string,
  templateId: string,
  title?: string,
) {
  return generatePdfDocument(token, cardId, templateId, title);
}

export async function generateCardTemplateLayoutDocx(
  token: string,
  cardId: string,
  templateId: string,
  payload: CardTemplateLayoutGeneratePayload,
) {
  return apiRequest<CardTemplateLayoutGeneratedDocumentRead>(
    `/api/v1/cards/${cardId}/card-template-layout/${templateId}/generate-docx`,
    {
      method: "POST",
      token,
      body: payload,
    },
  );
}

export async function generateCardTemplateLayoutPdf(
  token: string,
  cardId: string,
  templateId: string,
  payload: CardTemplateLayoutGeneratePayload,
) {
  return apiRequest<CardTemplateLayoutGeneratedDocumentRead>(
    `/api/v1/cards/${cardId}/card-template-layout/${templateId}/generate-pdf`,
    {
      method: "POST",
      token,
      body: payload,
    },
  );
}

export async function downloadGeneratedDocumentContent(token: string, generatedDocumentId: string) {
  return downloadFile(
    `/api/v1/generated-documents/${generatedDocumentId}/content`,
    token,
    "X-Document-Filename",
  );
}

export async function downloadBlankCardPrintTemplateDocx(token: string, templateId: string) {
  return downloadFile(
    `/api/v1/card-print-templates/${templateId}/blank-docx`,
    token,
    "X-Document-Filename",
  );
}

export async function downloadBlankCardPrintTemplatePdf(token: string, templateId: string) {
  return downloadFile(
    `/api/v1/card-print-templates/${templateId}/blank-pdf`,
    token,
    "X-Document-Filename",
  );
}

export async function downloadBlankCardPrintLayoutDocx(
  token: string,
  registryId: string,
  payload: CardPrintTemplateBlankDownloadPayload,
) {
  return downloadJsonFile(
    `/api/v1/registries/${registryId}/card-print-templates/blank-docx`,
    token,
    "X-Document-Filename",
    payload,
  );
}

export async function downloadBlankCardPrintLayoutPdf(
  token: string,
  registryId: string,
  payload: CardPrintTemplateBlankDownloadPayload,
) {
  return downloadJsonFile(
    `/api/v1/registries/${registryId}/card-print-templates/blank-pdf`,
    token,
    "X-Document-Filename",
    payload,
  );
}

export async function archiveGeneratedDocument(token: string, generatedDocumentId: string) {
  return apiRequest<GeneratedDocumentRead>(`/api/v1/generated-documents/${generatedDocumentId}`, {
    method: "DELETE",
    token,
  });
}

export async function listReportTemplates(
  token: string,
  registryId: string,
  includeArchive = false,
) {
  const query = includeArchive ? "?include_archive=true" : "";
  return apiRequest<ReportTemplateListRead>(
    `/api/v1/registries/${registryId}/report-templates${query}`,
    {
      token,
    },
  );
}

export async function createReportTemplate(
  token: string,
  registryId: string,
  payload: ReportTemplateCreatePayload,
) {
  return apiRequest<ReportTemplateRead>(`/api/v1/registries/${registryId}/report-templates`, {
    method: "POST",
    token,
    body: payload,
  });
}

export async function archiveReportTemplate(token: string, templateId: string) {
  return apiRequest<ReportTemplateRead>(`/api/v1/report-templates/${templateId}`, {
    method: "DELETE",
    token,
  });
}

export async function updateReportTemplate(
  token: string,
  templateId: string,
  payload: ReportTemplateUpdatePayload,
) {
  return apiRequest<ReportTemplateRead>(`/api/v1/report-templates/${templateId}`, {
    method: "PATCH",
    token,
    body: payload,
  });
}

export async function listReportRuns(token: string, registryId: string, includeArchive = false) {
  const query = includeArchive ? "?include_archive=true" : "";
  return apiRequest<ReportRunListRead>(`/api/v1/registries/${registryId}/report-runs${query}`, {
    token,
  });
}

export async function generateReportRun(
  token: string,
  templateId: string,
  payload: ReportRunCreatePayload,
) {
  return apiRequest<ReportRunRead>(`/api/v1/report-templates/${templateId}/runs`, {
    method: "POST",
    token,
    body: payload,
  });
}

export async function downloadReportRunContent(
  token: string,
  reportRunId: string,
  includeArchive = false,
) {
  const query = includeArchive ? "?include_archive=true" : "";
  return downloadFile(
    `/api/v1/report-runs/${reportRunId}/content${query}`,
    token,
    "X-Report-Filename",
  );
}

export async function archiveReportRun(token: string, reportRunId: string) {
  return apiRequest<ReportRunRead>(`/api/v1/report-runs/${reportRunId}`, {
    method: "DELETE",
    token,
  });
}

export async function listPublicLinks(token: string, cardId: string) {
  return apiRequest<PublicLinkListRead>(`/api/v1/cards/${cardId}/public-links`, { token });
}

export async function listCardCreationLinks(token: string, registryId: string) {
  return apiRequest<CardCreationLinkListRead>(
    `/api/v1/registries/${registryId}/card-creation-links`,
    { token },
  );
}

export async function createCardCreationLink(
  token: string,
  registryId: string,
  payload: CardCreationLinkCreatePayload,
) {
  return apiRequest<CardCreationLinkRead>(`/api/v1/registries/${registryId}/card-creation-links`, {
    method: "POST",
    token,
    body: payload,
  });
}

export async function closeCardCreationLink(token: string, creationLinkId: string) {
  return apiRequest<CardCreationLinkRead>(`/api/v1/card-creation-links/${creationLinkId}`, {
    method: "DELETE",
    token,
  });
}

export async function listCardCreationLinksForCard(token: string, cardId: string) {
  return apiRequest<CardCreationLinkCardListRead>(`/api/v1/cards/${cardId}/creation-links`, {
    token,
  });
}

export async function createPublicLink(
  token: string,
  cardId: string,
  payload: PublicLinkCreatePayload,
) {
  return apiRequest<PublicLinkTokenRead>(`/api/v1/cards/${cardId}/public-links`, {
    method: "POST",
    token,
    body: payload,
  });
}

export async function archivePublicLink(token: string, publicLinkId: string) {
  return apiRequest<PublicLinkRead>(`/api/v1/public-links/${publicLinkId}`, {
    method: "DELETE",
    token,
  });
}

export async function getPublicLinkReview(token: string, publicLinkId: string) {
  return apiRequest<PublicLinkReviewRead>(`/api/v1/public-links/${publicLinkId}/review`, {
    token,
  });
}

export async function requestPublicLinkChanges(
  token: string,
  publicLinkId: string,
  comment: string,
) {
  return apiRequest<PublicLinkRead>(`/api/v1/public-links/${publicLinkId}/request-changes`, {
    method: "POST",
    token,
    body: { comment },
  });
}

export async function approvePublicLink(token: string, publicLinkId: string) {
  return apiRequest<PublicLinkRead>(`/api/v1/public-links/${publicLinkId}/approve`, {
    method: "POST",
    token,
  });
}

export async function startPublicLinkReviewCycle(token: string, publicLinkId: string) {
  return apiRequest<PublicLinkRead>(`/api/v1/public-links/${publicLinkId}/start-review-cycle`, {
    method: "POST",
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

async function downloadJsonFile(
  path: string,
  token: string,
  filenameHeader: string,
  body: unknown,
) {
  const response = await fetch(`${apiBaseUrl.replace(/\/$/, "")}${path}`, {
    method: "POST",
    headers: {
      Accept: "application/octet-stream",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
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
