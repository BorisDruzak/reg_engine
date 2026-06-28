from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class UserCreate(BaseModel):
    email: str
    display_name: str
    password: str
    status: str = "active"
    is_superuser: bool = False


class UserUpdate(BaseModel):
    email: str | None = None
    display_name: str | None = None
    password: str | None = None
    status: str | None = None
    is_superuser: bool | None = None


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: str
    display_name: str
    status: str
    is_superuser: bool
    archived_at: datetime | None


class UserListRead(BaseModel):
    items: list[UserRead]


class RoleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    code: str
    name: str
    description: str | None
    is_system: bool
    archived_at: datetime | None


class RoleListRead(BaseModel):
    items: list[RoleRead]


class PermissionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    code: str
    description: str | None


class PermissionListRead(BaseModel):
    items: list[PermissionRead]


class AccessGrantCreate(BaseModel):
    user_id: UUID
    role_id: UUID
    registry_id: UUID | None = None
    organization_id: UUID | None = None
    include_descendants: bool = True
    valid_from: datetime | None = None
    valid_to: datetime | None = None


class AccessGrantRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    role_id: UUID
    registry_id: UUID | None
    organization_id: UUID | None
    include_descendants: bool
    valid_from: datetime | None
    valid_to: datetime | None
    created_by: UUID | None
    archived_at: datetime | None


class AccessGrantListRead(BaseModel):
    items: list[AccessGrantRead]
