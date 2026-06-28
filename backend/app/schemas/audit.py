from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class AuditEventRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    actor_type: str
    actor_user_id: UUID | None
    actor_public_link_id: UUID | None
    action: str
    object_type: str
    object_id: UUID | None
    old_data_json: dict[str, Any] | None
    new_data_json: dict[str, Any] | None
    source: str
    created_at: datetime


class AuditEventListRead(BaseModel):
    items: list[AuditEventRead]
