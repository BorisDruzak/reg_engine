from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class AuditEventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    actor_type: str
    actor_user_id: UUID | None
    actor_public_link_id: UUID | None
    action: str
    object_type: str
    object_id: UUID | None
    old_data: dict[str, object] | None
    new_data: dict[str, object] | None
    source: str
    created_at: datetime
