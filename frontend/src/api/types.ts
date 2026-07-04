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

export type OrganizationTreeNodeRead = OrganizationRead & {
  children: OrganizationTreeNodeRead[];
};

export type OrganizationTreeRead = {
  items: OrganizationTreeNodeRead[];
};

export type OrganizationCreatePayload = {
  code: string;
  name: string;
  parent_id?: string | null;
  organization_type?: string;
};

export type OrganizationUpdatePayload = {
  name?: string | null;
  organization_type?: string | null;
};

export type OrgUnitRead = {
  id: string;
  organization_id: string;
  parent_id: string | null;
  code: string;
  name: string;
  type: string | null;
  is_active: boolean;
};

export type OrgUnitListRead = {
  items: OrgUnitRead[];
};

export type OrgUnitCreatePayload = {
  code: string;
  name: string;
  parent_id?: string | null;
  unit_type?: string | null;
};

export type OrgUnitUpdatePayload = {
  name?: string | null;
  unit_type?: string | null;
};

export type RegistryRead = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  card_title_label: string;
  lifecycle_status: string;
  schema_version: number;
  owner_organization_id: string | null;
  is_default_for_owner_tree: boolean;
};

export type RegistryListRead = {
  items: RegistryRead[];
};

export type RegistryCreatePayload = {
  code: string;
  name: string;
  description?: string | null;
  card_title_label?: string;
};

export type RegistryUpdatePayload = {
  name?: string | null;
  description?: string | null;
  card_title_label?: string | null;
  lifecycle_status?: string | null;
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
  layout_columns?: number;
  display_config_json?: Record<string, unknown> | null;
};

export type FormBlockCreatePayload = {
  code: string;
  title: string;
  description?: string | null;
  position?: number;
  is_repeatable?: boolean;
  public_visible?: boolean;
  public_editable?: boolean;
  layout_columns?: number;
  display_config_json?: Record<string, unknown> | null;
};

export type FormBlockUpdatePayload = {
  title?: string | null;
  description?: string | null;
  position?: number | null;
  layout_columns?: number | null;
  display_config_json?: Record<string, unknown> | null;
};

export type FormFieldRead = {
  id: string;
  block_id: string;
  code: string;
  label: string;
  description: string | null;
  field_type: string;
  position: number;
  required_mode: string;
  options_source_type: string | null;
  options_source_id: string | null;
  options_config_json: Record<string, unknown> | null;
  display_config_json?: Record<string, unknown> | null;
  is_active: boolean;
  is_list_display: boolean;
  public_visible: boolean;
  public_editable: boolean;
};

export type FormFieldCreatePayload = {
  code: string;
  label: string;
  field_type: string;
  description?: string | null;
  position?: number;
  required_mode?: string;
  options_source_type?: string | null;
  options_source_id?: string | null;
  options_config_json?: Record<string, unknown> | null;
  display_config_json?: Record<string, unknown> | null;
  is_list_display?: boolean;
  public_visible?: boolean;
  public_editable?: boolean;
};

export type FormFieldUpdatePayload = {
  label?: string | null;
  description?: string | null;
  position?: number | null;
  required_mode?: string | null;
  options_config_json?: Record<string, unknown> | null;
  display_config_json?: Record<string, unknown> | null;
  is_active?: boolean | null;
  is_list_display?: boolean | null;
};

export type CardTemplateDefaultValue = {
  field_id: string;
  value: unknown;
};

export type CardTemplateRead = {
  id: string;
  registry_id: string;
  code: string;
  name: string;
  description: string | null;
  position: number;
  field_schema_json: Record<string, unknown>;
  default_values_json: CardTemplateDefaultValue[];
  is_active: boolean;
};

export type CardTemplateListRead = {
  items: CardTemplateRead[];
};

export type CardTemplateCreatePayload = {
  code: string;
  name: string;
  description?: string | null;
  position?: number;
  field_schema_json?: Record<string, unknown>;
  default_values_json?: CardTemplateDefaultValue[];
  is_active?: boolean;
};

export type CardTemplateUpdatePayload = {
  name?: string | null;
  description?: string | null;
  position?: number | null;
  field_schema_json?: Record<string, unknown> | null;
  default_values_json?: CardTemplateDefaultValue[] | null;
  is_active?: boolean | null;
};

export type ReferenceListRead = {
  id: string;
  registry_id: string | null;
  owner_organization_id: string | null;
  code: string;
  name: string;
  description: string | null;
  inherit_to_descendants: boolean;
  locked_for_descendants: boolean;
  managed_by_system_only: boolean;
  is_active: boolean;
};

export type ReferenceListListRead = {
  items: ReferenceListRead[];
};

export type ReferenceListCreatePayload = {
  code: string;
  name: string;
  owner_organization_id?: string | null;
  description?: string | null;
  inherit_to_descendants?: boolean;
  locked_for_descendants?: boolean;
  managed_by_system_only?: boolean;
};

export type ReferenceListUpdatePayload = {
  name?: string | null;
  description?: string | null;
  owner_organization_id?: string | null;
  inherit_to_descendants?: boolean | null;
  locked_for_descendants?: boolean | null;
  managed_by_system_only?: boolean | null;
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

export type ReferenceItemCreatePayload = {
  code: string;
  label: string;
  parent_id?: string | null;
  description?: string | null;
  position?: number;
};

export type ReferenceItemUpdatePayload = {
  label?: string | null;
  description?: string | null;
  position?: number | null;
};

export type RegistrySchemaRead = {
  registry: RegistryRead;
  blocks: FormBlockRead[];
  fields: FormFieldRead[];
  templates: CardTemplateRead[];
};

export type CardListFieldValueRead = {
  field_id: string;
  code: string;
  label: string;
  field_type: string;
  value: unknown;
};

export type CardSummaryRead = {
  id: string;
  registry_id: string;
  card_template_id: string;
  card_template_name?: string | null;
  organization_id: string;
  org_unit_id: string | null;
  display_name: string;
  lifecycle_status: string;
  public_view_enabled: boolean;
  public_edit_enabled: boolean;
  list_fields: CardListFieldValueRead[];
};

export type CardListRead = {
  items: CardSummaryRead[];
};

export type CardFieldFilterPayload = {
  field_id: string;
  field_type: string;
  operator: string;
  value: unknown;
  value_label?: string;
};

export type CardCreatePayload = {
  organization_id: string;
  display_name?: string | null;
  card_template_id?: string | null;
  org_unit_id?: string | null;
  public_view_enabled?: boolean;
  public_edit_enabled?: boolean;
};

export type OrganizationCardCreatePayload = {
  display_name?: string | null;
  card_template_id?: string | null;
  public_view_enabled?: boolean;
  public_edit_enabled?: boolean;
};

export type CardUpdatePayload = {
  display_name?: string | null;
  org_unit_id?: string | null;
  lifecycle_status?: string | null;
  public_view_enabled?: boolean | null;
  public_edit_enabled?: boolean | null;
};

export type CardTransferPayload = {
  target_organization_id: string;
};

export type CardImportPreviewPayload = {
  csv_content: string;
};

export type CardImportPreviewSummaryRead = {
  total_rows: number;
  valid_rows: number;
  invalid_rows: number;
  would_create_rows: number;
  would_update_rows: number;
};

export type CardImportPreviewRowRead = {
  row_number: number;
  status: "valid" | "invalid";
  action: "create" | "update";
  card_id: string | null;
  organization_id: string | null;
  display_name: string | null;
  field_path: string;
  field_type: string | null;
  raw_value: string;
  parsed_value: unknown;
  errors: string[];
};

export type CardImportPreviewRead = {
  format_version: string;
  registry_id: string;
  summary: CardImportPreviewSummaryRead;
  rows: CardImportPreviewRowRead[];
};

export type CardImportCommitPayload = {
  csv_content: string;
};

export type CardImportCommitSummaryRead = {
  total_rows: number;
  committed_rows: number;
  created_cards: number;
  updated_cards: number;
  field_values_written: number;
};

export type CardImportCommitCardRead = {
  card_id: string;
  action: "create" | "update";
  import_key: string | null;
};

export type CardImportCommitRead = {
  format_version: string;
  registry_id: string;
  summary: CardImportCommitSummaryRead;
  cards: CardImportCommitCardRead[];
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
  card_template_id: string;
  card_template_name?: string | null;
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

export type FieldValueBulkItemUpdatePayload = {
  field_id: string;
  value: unknown;
  block_instance_id?: string | null;
};

export type FieldValuesBulkUpdatePayload = {
  values: FieldValueBulkItemUpdatePayload[];
};

export type FieldValueListRead = {
  items: FieldValueRead[];
};

export type CardBlockInstanceSummaryRead = {
  id: string;
  card_id: string;
  block_id: string;
  ordinal: number;
};

export type PublicLinkCreatePayload = {
  expires_in_days?: number;
  max_attachment_uploads?: number | null;
};

export type PublicLinkTokenRead = {
  id: string;
  card_id: string;
  raw_token: string;
  status: string;
  can_edit: boolean;
  expires_at: string;
};

export type PublicLinkRead = {
  id: string;
  card_id: string;
  status: string;
  can_view: boolean;
  can_edit: boolean;
  expires_at: string;
  max_uses: number | null;
  used_count: number;
  max_attachment_uploads: number | null;
  attachment_upload_count: number;
  disabled_at: string | null;
};

export type PublicLinkListRead = {
  items: PublicLinkRead[];
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
  options_config_json?: Record<string, unknown> | null;
  display_config_json?: Record<string, unknown> | null;
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
  layout_columns?: number;
  instances: PublicLinkPreviewBlockInstanceRead[];
};

export type PublicLinkPreviewRead = {
  card_id: string;
  display_name: string;
  expires_at: string;
  can_edit: boolean;
  blocks: PublicLinkPreviewBlockRead[];
};

export type PublicLinkAttachmentRead = {
  id: string;
  card_id: string;
  title: string;
  description: string | null;
  position: number;
  original_filename: string;
  content_type: string;
  content_length_bytes: number;
  scanner_status: string;
  created_at: string;
  archived_at: string | null;
};

export type PublicLinkAttachmentListRead = {
  items: PublicLinkAttachmentRead[];
  max_attachment_uploads: number | null;
  attachment_upload_count: number;
  can_upload_attachments: boolean;
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

export type UserCreatePayload = {
  email: string;
  display_name: string;
  password: string;
  status?: string;
  is_superuser?: boolean;
};

export type UserUpdatePayload = {
  email?: string | null;
  display_name?: string | null;
  password?: string | null;
  status?: string | null;
  is_superuser?: boolean | null;
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

export type AccessGrantCreatePayload = {
  user_id: string;
  role_id: string;
  registry_id?: string | null;
  organization_id?: string | null;
  include_descendants?: boolean;
  valid_from?: string | null;
  valid_to?: string | null;
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

export type CardPrintLayoutItem = {
  id: string;
  kind:
    | "field"
    | "static_text"
    | "heading"
    | "container"
    | "panel"
    | "rectangle"
    | "divider"
    | "line"
    | "metadata"
    | "page_number"
    | "print_date"
    | "qr_code"
    | "image";
  page: number;
  row: number;
  column: number;
  row_span: number;
  column_span: number;
  field_id?: string;
  text?: string;
  label?: string;
  show_label?: boolean;
  metadata_key?: string;
  style?: Record<string, unknown>;
};

export type CardPrintLayout = {
  version: "card_print_layout_v1";
  page: {
    format: "A4";
    width_mm: number;
    height_mm: number;
    margin_mm: {
      top: number;
      right: number;
      bottom: number;
      left: number;
    };
  };
  grid: {
    columns: 12;
    row_height_mm: number;
  };
  items: CardPrintLayoutItem[];
};

export type DocumentTemplateRead = {
  id: string;
  registry_id: string;
  card_template_id?: string | null;
  code: string;
  name: string;
  description: string | null;
  template_format: string;
  output_filename_template: string;
  output_content_type: string;
  is_active: boolean;
  current_version_id?: string | null;
  current_version_number?: number | null;
  current_layout_json?: CardPrintLayout | null;
  created_at: string;
  archived_at: string | null;
};

export type CardPrintTemplateCreatePayload = {
  code: string;
  name: string;
  card_template_id?: string | null;
  description?: string | null;
  layout_json: CardPrintLayout;
  output_filename_template: string;
};

export type CardPrintTemplateVersionCreatePayload = {
  layout_json: CardPrintLayout;
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

export type DocumentTemplateVersionRead = {
  id: string;
  template_id: string;
  version_number: number;
  template_format: string;
  layout_json?: CardPrintLayout | null;
  original_filename: string | null;
  content_type: string | null;
  content_length_bytes: number | null;
  created_at: string;
  archived_at: string | null;
};

export type DocumentTemplateVersionListRead = {
  items: DocumentTemplateVersionRead[];
};

export type GeneratedDocumentRead = {
  id: string;
  card_id: string;
  template_id: string;
  template_version_id?: string | null;
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

export type ReportTemplateRead = {
  id: string;
  registry_id: string;
  code: string;
  name: string;
  description: string | null;
  report_type: string;
  parameters_schema_json: Record<string, unknown> | null;
  default_parameters_json: Record<string, unknown> | null;
  output_format: string;
  is_active: boolean;
  created_at: string;
  archived_at: string | null;
};

export type ReportTemplateCreatePayload = {
  code: string;
  name: string;
  report_type: string;
  description?: string | null;
  parameters_schema_json?: Record<string, unknown> | null;
  default_parameters_json?: Record<string, unknown> | null;
  output_format?: string;
};

export type ReportTemplateUpdatePayload = {
  name?: string;
  description?: string | null;
  report_type?: string;
  parameters_schema_json?: Record<string, unknown> | null;
  default_parameters_json?: Record<string, unknown> | null;
  output_format?: string;
};

export type ReportTemplateListRead = {
  items: ReportTemplateRead[];
};

export type ReportRunRead = {
  id: string;
  report_template_id: string;
  registry_id: string;
  card_id: string | null;
  report_type: string;
  run_status: string;
  parameters_json: Record<string, unknown> | null;
  summary_json: Record<string, unknown> | null;
  row_count: number;
  output_filename: string;
  output_content_type: string;
  generated_by: string;
  started_at: string;
  finished_at: string;
  created_at: string;
  archived_at: string | null;
};

export type ReportRunCreatePayload = {
  parameters?: Record<string, unknown> | null;
};

export type ReportRunListRead = {
  items: ReportRunRead[];
};
