from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class CardChangeNotificationSubscriptionUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    enabled: bool


class CardChangeNotificationSubscriptionRead(BaseModel):
    enabled: bool


class CardChangeNotificationChangeRead(BaseModel):
    label: str
    before: object | None = None
    after: object | None = None
    description: str | None = None


class CardChangeNotificationRead(BaseModel):
    id: UUID
    card_id: UUID
    card_display_name: str
    actor_display_name: str
    changes: list[CardChangeNotificationChangeRead]
    read_at: datetime | None
    created_at: datetime


class CardChangeNotificationListRead(BaseModel):
    unread_count: int
    items: list[CardChangeNotificationRead]


class CardChangeNotificationMarkAllRead(BaseModel):
    marked_count: int = Field(ge=0)
