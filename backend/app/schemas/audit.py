from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, field_validator


class AuditEventRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    actor_type: str
    actor_user_id: UUID | None
    actor_public_link_id: UUID | None
    attributed_user_id: UUID | None = None
    actor_display_name: str | None = None
    attributed_user_display_name: str | None = None
    action: str
    object_type: str
    object_id: UUID | None
    card_id: UUID | None = None
    card_display_name: str | None = None
    card_lifecycle_status: str | None = None
    old_data_json: dict[str, Any] | None
    new_data_json: dict[str, Any] | None
    history_display: str | None = None
    history_description: str | None = None
    source: str
    ip_address: str | None
    user_agent: str | None
    request_id: str | None
    created_at: datetime

    @field_validator("ip_address", mode="before")
    @classmethod
    def serialize_ip_address(cls, value: object) -> str | None:
        if value is None or isinstance(value, str):
            return value
        return str(value)

    @classmethod
    def from_event(
        cls,
        event: object,
        *,
        actor_display_name: str | None,
        attributed_user_display_name: str | None,
        card_display_name: str | None,
        card_lifecycle_status: str | None,
        object_id: UUID | None,
        old_data_json: dict[str, Any] | None,
        new_data_json: dict[str, Any] | None,
        history_display: str | None,
        history_description: str | None,
    ) -> "AuditEventRead":
        updates: dict[str, Any] = {
            "actor_display_name": actor_display_name,
            "attributed_user_display_name": attributed_user_display_name,
            "card_display_name": card_display_name,
            "card_lifecycle_status": card_lifecycle_status,
            "object_id": object_id,
            "old_data_json": old_data_json,
            "new_data_json": new_data_json,
            "history_display": history_display,
            "history_description": history_description,
        }
        return cls.model_validate(event).model_copy(update=updates)


class AuditEventListRead(BaseModel):
    items: list[AuditEventRead]
