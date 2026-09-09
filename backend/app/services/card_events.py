from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date
from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session

from app.models import CardEvent, CardEventChange
from app.services.audit import AuditService


@dataclass(frozen=True)
class CardChangeContext:
    basis_text: str
    occurred_on: date | None = None


@dataclass(frozen=True)
class CardEventFieldChange:
    field_id: UUID
    old_value_json: dict[str, Any]
    new_value_json: dict[str, Any]


class CardEventService:
    """Append durable business events inside the caller's mutation transaction."""

    def __init__(self, session: Session) -> None:
        self.session = session

    def record_change(
        self,
        *,
        card_id: UUID,
        context: CardChangeContext,
        actor_user_id: UUID | None,
        changes: Sequence[CardEventFieldChange] = (),
        event_type: str = "change",
        actor_public_link_id: UUID | None = None,
    ) -> CardEvent:
        basis = context.basis_text.strip()
        if not basis:
            raise ValueError("Основание изменения обязательно.")
        event = CardEvent(
            card_id=card_id,
            event_type=event_type,
            occurred_on=context.occurred_on or date.today(),
            basis_text=basis,
            created_by=actor_user_id,
        )
        self.session.add(event)
        self.session.flush()
        self.session.add_all(
            [
                CardEventChange(
                    card_event_id=event.id,
                    field_id=change.field_id,
                    old_value_json=change.old_value_json,
                    new_value_json=change.new_value_json,
                )
                for change in changes
            ]
        )
        self.session.flush()
        audit = AuditService(self.session)
        data = {
            "event_type": event.event_type,
            "occurred_on": event.occurred_on,
            "basis_text": event.basis_text,
        }
        if actor_public_link_id is not None:
            audit.record_public_link_event(
                actor_public_link_id=actor_public_link_id,
                action="create",
                object_type="card_event",
                object_id=event.id,
                card_id=card_id,
                new_data_json=data,
            )
        elif actor_user_id is not None:
            audit.record_user_event(
                actor_user_id=actor_user_id,
                action="create",
                object_type="card_event",
                object_id=event.id,
                card_id=card_id,
                new_data_json=data,
            )
        return event
