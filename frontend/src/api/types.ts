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
