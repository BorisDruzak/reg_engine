export type HealthcheckResponse = {
  status: "ok";
  service: "reg_engine";
};

export type CurrentUser = {
  id: string;
  email: string;
  display_name: string;
  status: string;
  is_superuser: boolean;
};

export type LoginResponse = {
  access_token: string;
  token_type: "bearer";
  expires_at: string;
  user: CurrentUser;
};

export type OrganizationRead = {
  id: string;
  parent_id: string | null;
  code: string;
  name: string;
  type: string;
  is_active: boolean;
};

export type OrganizationListRead = {
  items: OrganizationRead[];
};

export type RegistryRead = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  lifecycle_status: string;
  schema_version: number;
};

export type RegistryListRead = {
  items: RegistryRead[];
};

export type FormBlockRead = {
  id: string;
  registry_id: string;
  code: string;
  title: string;
  description: string | null;
  position: number;
  is_repeatable: boolean;
  is_active: boolean;
  public_visible: boolean;
  public_editable: boolean;
};

export type FormFieldRead = {
  id: string;
  block_id: string;
  code: string;
  label: string;
  description: string | null;
  field_type: string;
  position: number;
  options_source_type: string | null;
  options_source_id: string | null;
  is_active: boolean;
  public_visible: boolean;
  public_editable: boolean;
};

export type ReferenceItemRead = {
  id: string;
  list_id: string;
  parent_id: string | null;
  code: string;
  label: string;
  description: string | null;
  position: number;
  is_active: boolean;
};

export type ReferenceItemListRead = {
  items: ReferenceItemRead[];
};

export type RegistrySchemaRead = {
  registry: RegistryRead;
  blocks: FormBlockRead[];
  fields: FormFieldRead[];
};

export type CardSummaryRead = {
  id: string;
  registry_id: string;
  organization_id: string;
  org_unit_id: string | null;
  display_name: string;
  lifecycle_status: string;
  public_view_enabled: boolean;
  public_edit_enabled: boolean;
};

export type CardListRead = {
  items: CardSummaryRead[];
};

export type CardFieldRead = {
  field_id: string;
  code: string;
  field_type: string;
  value: unknown;
};

export type CardBlockInstanceRead = {
  block_instance_id: string | null;
  ordinal: number;
  fields: Record<string, CardFieldRead>;
};

export type CardBlockRead = {
  block_id: string;
  code: string;
  instances: CardBlockInstanceRead[];
};

export type CardRead = {
  id: string;
  registry_id: string;
  organization_id: string;
  display_name: string;
  blocks: Record<string, CardBlockRead>;
  fields: Record<string, CardFieldRead>;
};

export type FieldValueRead = {
  id: string;
  card_id: string;
  block_instance_id: string | null;
  field_id: string;
  value: unknown;
};

export type PublicLinkPreviewOptionRead = {
  id: string;
  code: string;
  label: string;
};

export type PublicLinkPreviewFieldRead = {
  field_id: string;
  code: string;
  label: string;
  field_type: string;
  value: unknown;
  options_source_type: string | null;
  options_source_id: string | null;
  options: PublicLinkPreviewOptionRead[];
};

export type PublicLinkPreviewBlockInstanceRead = {
  block_instance_id: string | null;
  ordinal: number;
  fields: PublicLinkPreviewFieldRead[];
};

export type PublicLinkPreviewBlockRead = {
  block_id: string;
  code: string;
  title: string;
  instances: PublicLinkPreviewBlockInstanceRead[];
};

export type PublicLinkPreviewRead = {
  card_id: string;
  display_name: string;
  expires_at: string;
  can_edit: boolean;
  blocks: PublicLinkPreviewBlockRead[];
};

export type UserRead = {
  id: string;
  email: string;
  display_name: string;
  status: string;
  is_superuser: boolean;
  archived_at: string | null;
};

export type UserListRead = {
  items: UserRead[];
};

export type RoleRead = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  is_system: boolean;
  archived_at: string | null;
};

export type RoleListRead = {
  items: RoleRead[];
};

export type PermissionRead = {
  id: string;
  code: string;
  description: string | null;
};

export type PermissionListRead = {
  items: PermissionRead[];
};

export type AccessGrantRead = {
  id: string;
  user_id: string;
  role_id: string;
  registry_id: string | null;
  organization_id: string | null;
  include_descendants: boolean;
  valid_from: string | null;
  valid_to: string | null;
  created_by: string | null;
  archived_at: string | null;
};

export type AccessGrantListRead = {
  items: AccessGrantRead[];
};

export type AuditEventRead = {
  id: string;
  actor_type: string;
  actor_user_id: string | null;
  actor_public_link_id: string | null;
  action: string;
  object_type: string;
  object_id: string | null;
  source: string;
  ip_address: string | null;
  user_agent: string | null;
  request_id: string | null;
  created_at: string;
};

export type AuditEventListRead = {
  items: AuditEventRead[];
};

export type AttachmentRead = {
  id: string;
  card_id: string;
  stored_file_id: string;
  title: string | null;
  description: string | null;
  position: number;
  original_filename: string;
  content_type: string;
  content_length_bytes: number;
  checksum_sha256: string;
  scanner_status: string;
  created_at: string;
  archived_at: string | null;
};

export type AttachmentListRead = {
  items: AttachmentRead[];
};

export type DocumentTemplateRead = {
  id: string;
  registry_id: string;
  code: string;
  name: string;
  description: string | null;
  template_format: string;
  output_filename_template: string;
  output_content_type: string;
  is_active: boolean;
  created_at: string;
  archived_at: string | null;
};

export type DocumentTemplateCreatePayload = {
  code: string;
  name: string;
  description?: string | null;
  template_body: string;
  output_filename_template: string;
};

export type DocumentTemplateListRead = {
  items: DocumentTemplateRead[];
};

export type GeneratedDocumentRead = {
  id: string;
  card_id: string;
  template_id: string;
  stored_file_id: string | null;
  title: string;
  output_filename: string;
  content_type: string;
  render_status: string;
  created_at: string;
  archived_at: string | null;
};

export type GeneratedDocumentListRead = {
  items: GeneratedDocumentRead[];
};
