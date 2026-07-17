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
  can_manage_access: boolean;
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

export type ReferenceEditLinkRead = {
  id: string;
  registry_id: string;
  owner_organization_id: string | null;
  status: "active" | "closed" | "expired";
  expires_at: string | null;
  closed_at: string | null;
  created_at: string;
};

export type ReferenceEditLinkTokenRead = ReferenceEditLinkRead & { raw_token: string };
export type ReferenceEditLinkListRead = { items: ReferenceEditLinkRead[] };
export type ReferenceEditLinkCreatePayload = {
  owner_organization_id?: string | null;
  expires_in_days?: number | null;
};

export type PublicReferenceListRead = {
  id: string;
  name: string;
  description: string | null;
  archived_at: string | null;
};

export type PublicReferenceItemRead = {
  id: string;
  list_id: string;
  parent_id: string | null;
  label: string;
  description: string | null;
  position: number;
  archived_at: string | null;
};

export type PublicReferenceWorkspaceRead = {
  status: "active" | "closed" | "expired";
  can_edit: boolean;
  registry_id: string;
  owner_organization_id: string | null;
  lists: PublicReferenceListRead[];
  items: PublicReferenceItemRead[];
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

export type OrgUnitType = "management" | "department";

export type OrgUnitRead = {
  id: string;
  organization_id: string;
  parent_id: string | null;
  code: string;
  name: string;
  type: OrgUnitType;
  is_active: boolean;
};

export type OrgUnitListRead = {
  items: OrgUnitRead[];
};

export type OrgUnitCreatePayload = {
  code: string;
  name: string;
  parent_id?: string | null;
  unit_type: OrgUnitType;
};

export type OrgUnitUpdatePayload = {
  name?: string | null;
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
  is_repeatable?: boolean | null;
  public_visible?: boolean | null;
  public_editable?: boolean | null;
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
  validation_json?: TextValidationValue | null;
  options_source_type: string | null;
  options_source_id: string | null;
  options_config_json: Record<string, unknown> | null;
  display_config_json?: Record<string, unknown> | null;
  is_active: boolean;
  is_list_display: boolean;
  public_visible: boolean;
  public_editable: boolean;
};

export type TextValidationInputMode = "show_error" | "block_input";

export type TextValidationCondition =
  | {
      kind: "russian_text";
      message: string;
      input_mode?: TextValidationInputMode;
    }
  | {
      kind: "regex";
      pattern: string;
      message: string;
      input_mode?: TextValidationInputMode;
    };

export type TextValidationRule = TextValidationCondition[];
export type TextValidationValue = TextValidationCondition | TextValidationRule;

export type WorkExperienceValue = {
  days: number;
  months: number;
  years: number;
  display?: string;
};

export type FormFieldCreatePayload = {
  code: string;
  label: string;
  field_type: string;
  description?: string | null;
  position?: number;
  required_mode?: string;
  validation_json?: TextValidationValue | null;
  options_source_type?: string | null;
  options_source_id?: string | null;
  options_config_json?: Record<string, unknown> | null;
  display_config_json?: Record<string, unknown> | null;
  is_list_display?: boolean;
  public_visible?: boolean;
  public_editable?: boolean;
};

export type FormFieldUpdatePayload = {
  code?: string | null;
  label?: string | null;
  description?: string | null;
  field_type?: string | null;
  position?: number | null;
  required_mode?: string | null;
  validation_json?: TextValidationValue | null;
  options_source_type?: string | null;
  options_source_id?: string | null;
  options_config_json?: Record<string, unknown> | null;
  display_config_json?: Record<string, unknown> | null;
  is_active?: boolean | null;
  is_list_display?: boolean | null;
  public_visible?: boolean | null;
  public_editable?: boolean | null;
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

export type CardFieldOptionRead = {
  id: string;
  label: string;
  archived: boolean;
};

export type CardFieldOptionListRead = {
  items: CardFieldOptionRead[];
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
  display_value?: unknown;
};

export type CardSummaryRead = {
  id: string;
  registry_id: string;
  card_template_id: string;
  card_template_name?: string | null;
  organization_id: string;
  org_unit_id: string | null;
  display_name: string;
  creator_display_name?: string | null;
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

export type CardCreationPreviewOptionRead = {
  id: string;
  label: string;
  archived: boolean;
};

export type CardCreationPreviewFieldRead = {
  field_id: string;
  code: string;
  label: string;
  description: string | null;
  field_type: string;
  required_mode: string;
  options: CardCreationPreviewOptionRead[];
};

export type CardCreationPreviewBlockRead = {
  block_id: string;
  code: string;
  title: string;
  description: string | null;
  is_repeatable: boolean;
  fields: CardCreationPreviewFieldRead[];
};

export type CardCreationPreviewRead = {
  organization_id: string;
  card_template_id: string;
  display_name: string;
  blocks: CardCreationPreviewBlockRead[];
};

export type CardFirstSavePayload = {
  display_name?: string | null;
  card_template_id: string;
  public_view_enabled?: boolean;
  public_edit_enabled?: boolean;
  public_access?: CardPublicAccessPayload;
  field_id: string;
  value: unknown;
  block_instance_id?: string | null;
};

export type CardDraftCreatePayload = {
  display_name?: string | null;
  card_template_id: string;
  public_access: CardPublicAccessPayload;
};

export type CardDraftPublicLinkRead = {
  card: CardSummaryRead;
  raw_token: string;
  public_link_id: string;
};

export type CardUpdatePayload = {
  display_name?: string | null;
  org_unit_id?: string | null;
  lifecycle_status?: string | null;
  public_view_enabled?: boolean | null;
  public_edit_enabled?: boolean | null;
};

export type CardPublicFieldSettingPayload = {
  field_id: string;
  public_visible: boolean;
  public_editable: boolean;
};

export type CardPublicAccessPayload = {
  public_view_enabled?: boolean | null;
  public_edit_enabled?: boolean | null;
  fields?: CardPublicFieldSettingPayload[];
};

export type CardPublicFieldSettingRead = CardPublicFieldSettingPayload;

export type CardPublicAccessRead = {
  card_id: string;
  public_view_enabled: boolean;
  public_edit_enabled: boolean;
  fields: CardPublicFieldSettingRead[];
};

export type CardTransferPayload = {
  target_organization_id: string;
};

export type TabularCardWorkbookPayload = {
  card_template_id: string;
  field_ids: string[];
  organization_ids: string[];
  include_organization_column: boolean;
  fixed_organization_id?: string;
};

export type TabularCardExchangeFieldRead = {
  id: string;
  label: string;
  block_title: string;
  field_type: string;
  supported: boolean;
  unsupported_reason: string | null;
};

export type TabularCardExchangeTemplateRead = {
  id: string;
  name: string;
  fields: TabularCardExchangeFieldRead[];
};

export type TabularCardExchangeOrganizationRead = {
  id: string;
  name: string;
  label: string;
};

export type TabularCardExchangeOptionsRead = {
  registry_id: string;
  organizations: TabularCardExchangeOrganizationRead[];
  templates: TabularCardExchangeTemplateRead[];
};

export type TabularCardImportPreviewSummaryRead = {
  total_rows: number;
  valid_rows: number;
  invalid_rows: number;
  would_create_cards: number;
};

export type TabularCardImportPreviewRowRead = {
  row_number: number;
  status: "valid" | "invalid";
  organization_label: string | null;
  errors: string[];
};

export type TabularCardImportPreviewRead = {
  format_version: string;
  registry_id: string;
  summary: TabularCardImportPreviewSummaryRead;
  rows: TabularCardImportPreviewRowRead[];
};

export type TabularCardImportCommitRead = {
  format_version: string;
  registry_id: string;
  summary: {
    created_cards: number;
    field_values_written: number;
  };
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
  creator_display_name?: string | null;
  can_manage: boolean;
  blocks: Record<string, CardBlockRead>;
  fields: Record<string, CardFieldRead>;
};

export type CardChangeNotificationSubscriptionRead = {
  enabled: boolean;
};

export type CardChangeNotificationChangeRead = {
  label: string;
  before: unknown | null;
  after: unknown | null;
  description: string | null;
};

export type CardChangeNotificationRead = {
  id: string;
  card_id: string;
  card_display_name: string;
  actor_display_name: string;
  changes: CardChangeNotificationChangeRead[];
  read_at: string | null;
  created_at: string;
};

export type CardChangeNotificationListRead = {
  unread_count: number;
  items: CardChangeNotificationRead[];
};

export type CardChangeNotificationMarkAllRead = {
  marked_count: number;
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
  review_enabled?: boolean;
  allowed_block_ids?: string[] | null;
  allowed_field_ids?: string[] | null;
};

export type PublicLinkReviewStatus =
  | "active"
  | "submitted"
  | "changes_requested"
  | "approved"
  | "disabled"
  | "expired";

export type PublicLinkTokenRead = {
  id: string;
  card_id: string;
  raw_token: string;
  status: PublicLinkReviewStatus;
  can_edit: boolean;
  expires_at: string | null;
  review_enabled: boolean;
};

export type PublicLinkRead = {
  id: string;
  card_id: string;
  status: PublicLinkReviewStatus;
  can_view: boolean;
  can_edit: boolean;
  expires_at: string | null;
  max_uses: number | null;
  used_count: number;
  max_attachment_uploads: number | null;
  attachment_upload_count: number;
  disabled_at: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  review_comment: string | null;
  review_enabled: boolean;
  can_manage_change_notifications: boolean;
  change_notifications_enabled: boolean;
  completed_public_fields: number | null;
  total_public_fields: number | null;
};

export type PublicLinkListRead = {
  items: PublicLinkRead[];
};

export type PublicLinkSafeStatusRead = {
  status: PublicLinkReviewStatus;
  can_edit: boolean;
  submitted_at: string | null;
  reviewed_at: string | null;
  review_comment: string | null;
  completed_public_fields: number | null;
  total_public_fields: number | null;
};

export type PublicLinkReviewFieldDiffRead = {
  block_id: string;
  field_id: string;
  block_instance_id: string | null;
  label: string;
  field_type: string;
  before: unknown;
  after: unknown;
  changed_at: string | null;
};

export type PublicLinkReviewAttachmentDiffRead = {
  attachment_id: string;
  title: string;
  original_filename: string;
  content_length_bytes: number;
  change: "added" | "archived";
};

export type PublicLinkReviewRead = {
  public_link: PublicLinkRead;
  changed_field_count: number;
  changed_attachment_count: number;
  fields: PublicLinkReviewFieldDiffRead[];
  attachments: PublicLinkReviewAttachmentDiffRead[];
};

export type PublicLinkPreviewOptionRead = {
  id: string;
  code: string;
  label: string;
  archived?: boolean;
};

export type PublicLinkPreviewFieldRead = {
  field_id: string;
  code: string;
  label: string;
  description: string | null;
  field_type: string;
  required_mode: string;
  validation_json?: TextValidationValue | null;
  value: unknown;
  options_source_type: string | null;
  options_source_id: string | null;
  options_config_json?: Record<string, unknown> | null;
  display_config_json?: Record<string, unknown> | null;
  public_editable: boolean;
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
  is_repeatable: boolean;
  layout_columns?: number;
  display_config_json?: Record<string, unknown> | null;
  instances: PublicLinkPreviewBlockInstanceRead[];
};

export type PublicLinkPreviewRead = {
  card_id: string;
  display_name: string;
  organization_name: string;
  card_template_name: string;
  lifecycle_status: string;
  expires_at: string | null;
  can_edit: boolean;
  form_layout: CardTemplateFormLayoutRead;
  blocks: PublicLinkPreviewBlockRead[];
};

export type CardCreationLinkOrganizationRead = {
  id: string;
  name: string;
};

export type CardCreationLinkCreatedCardRead = {
  card_id: string;
  display_name: string;
  organization_id: string;
  organization_name: string;
  child_public_link_id: string;
  child_raw_token: string;
};

export type CardCreationLinkRead = {
  id: string;
  registry_id: string;
  card_template_id: string;
  card_template_name: string;
  raw_token: string;
  created_at: string;
  closed_at: string | null;
  organizations: CardCreationLinkOrganizationRead[];
  created_cards: CardCreationLinkCreatedCardRead[];
};

export type CardCreationLinkListRead = {
  items: CardCreationLinkRead[];
};

export type CardCreationLinkCreatePayload = {
  card_template_id: string;
  organization_ids: string[];
};

export type CardCreationLinkCardListRead = {
  items: CardCreationLinkCreatedCardRead[];
};

export type CardCreationLinkPublicPreviewRead = {
  card_template_id: string;
  card_template_name: string;
  selected_organization_id: string | null;
  organizations: CardCreationLinkOrganizationRead[];
  form_layout: CardTemplateFormLayoutRead;
  blocks: PublicLinkPreviewBlockRead[];
};

export type CardCreationLinkFirstSaveRead = {
  card_id: string;
  display_name: string;
  child_raw_token: string;
};

export type PublicActorName = string;

export type CardCreationLinkFirstSavePayload = {
  organization_id: string;
  field_id: string;
  value: unknown;
  block_instance_id?: string | null;
};

export type PublicLinkAttachmentUploadPayload = {
  file: File;
  title?: string;
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

export type BusinessRoleCode =
  | "administrator"
  | "organization_administrator"
  | "subordinate_organization_administrator";

export type UserRead = {
  id: string;
  email: string;
  display_name: string;
  status: string;
  is_superuser: boolean;
  role_code: BusinessRoleCode;
  organization_ids: string[];
  can_manage_access: boolean;
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
  role_code?: BusinessRoleCode;
  organization_ids?: string[];
  can_manage_access?: boolean;
};

export type UserUpdatePayload = {
  email?: string | null;
  display_name?: string | null;
  password?: string | null;
  status?: string | null;
  is_superuser?: boolean | null;
  role_code?: BusinessRoleCode | null;
  organization_ids?: string[] | null;
  can_manage_access?: boolean | null;
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
  attributed_user_id?: string | null;
  actor_display_name?: string | null;
  attributed_user_display_name?: string | null;
  card_id?: string | null;
  card_display_name?: string | null;
  card_lifecycle_status?: string | null;
  action: string;
  object_type: string;
  object_id: string | null;
  old_data_json?: unknown | null;
  new_data_json?: unknown | null;
  history_display?: "field_diff" | "standalone" | null;
  history_description?: string | null;
  source: string;
  ip_address: string | null;
  user_agent: string | null;
  request_id: string | null;
  created_at: string;
};

export type AuditEventListRead = {
  items: AuditEventRead[];
};

export type CardHistoryFilters = {
  cardId?: string;
  cardStatus: "active" | "archived" | "all";
  actorUserId?: string;
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

export type CardPrintLayoutItemStyle = {
  font_family?: string;
  font_size?: number;
  bold?: boolean;
  italic?: boolean;
  align?: "left" | "center" | "right";
  vertical_align?: "top" | "middle" | "bottom";
  border?: "none" | "thin" | "medium";
  border_color?: string;
  background_color?: string;
  text_color?: string;
  padding_mm?: number;
  label_position?: "top" | "left" | "right" | "bottom";
  overflow?: "wrap" | "truncate" | "expand_down";
  max_lines?: number;
};

export type CardPrintStyle = CardPrintLayoutItemStyle;

export type A4RendererMode = "design" | "preview" | "fill" | "readonly";

export type CardPrintLayoutItem = {
  id: string;
  kind:
    | "field"
    | "block"
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
    | "image"
    | "card_layout";
  page: number;
  row: number;
  column: number;
  row_span: number;
  column_span: number;
  x_mm?: number;
  y_mm?: number;
  width_mm?: number;
  height_mm?: number;
  source_item_id?: string | null;
  card_template_id?: string;
  field_id?: string;
  block_id?: string;
  text?: string;
  label?: string;
  show_label?: boolean;
  metadata_key?: string;
  style?: CardPrintLayoutItemStyle;
  repeat?: {
    mode?: "first_instance_only" | "repeat_section" | "table_rows";
  };
  visible_in?: "both" | "pdf" | "docx";
  required_marker?: boolean;
  override?: boolean;
  sync_status?: string;
};

export type CardPrintFlowItem = {
  id: string;
  kind: "field" | "static_text" | "heading" | "metadata" | "page_number" | "print_date";
  field_id?: string;
  metadata_key?: "card.display_name" | "card.id" | "card.registry_id" | "card.organization_id";
  text?: string;
  label?: string;
  show_label?: boolean;
  row: number;
  column: number;
  row_span: number;
  column_span: number;
  style?: CardPrintStyle;
};

export type CardPrintSection = {
  id: string;
  kind: "section";
  block_id?: string;
  title?: string;
  page: number;
  x_mm: number;
  y_mm: number;
  width_mm: number;
  height_mm: number;
  grid_columns: 12;
  repeat?: {
    mode: "first_instance_only" | "repeat_section" | "table_rows";
  };
  style?: CardPrintStyle;
  items: CardPrintFlowItem[];
};

export type CardPrintOverlayItem = {
  id: string;
  kind:
    | "line"
    | "divider"
    | "rectangle"
    | "panel"
    | "container"
    | "image"
    | "qr_code"
    | "static_text"
    | "heading";
  page: number;
  x_mm: number;
  y_mm: number;
  width_mm: number;
  height_mm: number;
  text?: string;
  alt?: string;
  style?: CardPrintStyle;
};

export type CardPrintLayout = {
  version: "card_print_layout_v1";
  composition_mode?: "linked_card";
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
    baseline_mm?: number;
    row_height_mm: number;
    snap_mm?: number;
    gutter_mm?: number;
  };
  sections?: CardPrintSection[];
  overlays?: CardPrintOverlayItem[];
  items: CardPrintLayoutItem[];
};

export type CardPrintPreviewPayload = {
  registry_id: string;
  card_template_id?: string | null;
  layout_json: CardPrintLayout;
  card_id?: string | null;
  sample?: boolean;
};

export type CardPrintPreviewRead = {
  layout_json: CardPrintLayout;
  warnings: string[];
  view: Record<string, unknown>;
};

export type CardTemplateFormLayoutItemRead = {
  id: string;
  kind: string;
  field_id?: string | null;
  row: number;
  column: number;
  row_span: number;
  column_span: number;
  text?: string | null;
};

export type CardTemplateFormLayoutSectionRead = {
  id: string;
  block_id?: string | null;
  row: number;
  column: number;
  row_span: number;
  column_span: number;
  items: CardTemplateFormLayoutItemRead[];
};

export type CardTemplateFormLayoutRead = {
  columns: number;
  sections: CardTemplateFormLayoutSectionRead[];
};

export type CardTemplatePrintPageRead = CardPrintLayout["page"];

export type CardTemplatePrintViewItemRead = {
  id: string;
  source_item_id?: string | null;
  kind: string;
  card_template_id?: string | null;
  block_id?: string | null;
  field_id?: string | null;
  page: number;
  x_mm: number;
  y_mm: number;
  width_mm: number;
  height_mm: number;
  override: boolean;
  sync_status: string;
  text?: string | null;
};

export type CardTemplatePrintViewRead = {
  id: string;
  name: string;
  is_default: boolean;
  document_template_id?: string | null;
  current_version_id?: string | null;
  source: "form_layout";
  page: CardTemplatePrintPageRead;
  items: CardTemplatePrintViewItemRead[];
  layout_json: CardPrintLayout;
  output_filename_template: string;
};

export type CardTemplateLayoutSyncStatusRead = {
  has_errors: boolean;
  errors: string[];
  warnings: string[];
  mapping: Record<string, string[]>;
};

export type CardTemplateExportSettingsRead = {
  default_print_view_id?: string | null;
  output_filename_template: string;
  formats: Array<"docx" | "pdf">;
};

export type CardTemplateStructureRead = {
  blocks: FormBlockRead[];
  fields: FormFieldRead[];
};

export type CardTemplateLayoutRead = {
  version: "card_template_layout_v1";
  revision: string;
  card_template_id: string;
  registry_id: string;
  structure: CardTemplateStructureRead;
  form_layout: CardTemplateFormLayoutRead;
  print_views: CardTemplatePrintViewRead[];
  export_settings: CardTemplateExportSettingsRead;
  sync_status: CardTemplateLayoutSyncStatusRead;
};

export type CardPresentationRead = {
  card_id: string;
  registry_id: string;
  registry_name: string;
  card_template_id: string;
  card_template_name: string;
  layout: CardTemplateLayoutRead;
};

export type CardTemplateLayoutUpdatePayload = {
  expected_revision: string;
  form_layout: CardTemplateFormLayoutRead;
};

export type CardTemplatePrintViewUpdatePayload = {
  name?: string | null;
  is_default?: boolean;
  layout_json: CardPrintLayout;
  output_filename_template?: string;
};

export type CardTemplateLayoutGeneratePayload = {
  print_view_id?: string | null;
  title?: string | null;
};

export type CardTemplateLayoutGeneratedDocumentRead = {
  document: GeneratedDocumentRead;
  print_view: CardTemplatePrintViewRead;
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

export type CardPrintTemplateBlankDownloadPayload = {
  name: string;
  card_template_id?: string | null;
  layout_json: CardPrintLayout;
  output_filename_template: string;
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
