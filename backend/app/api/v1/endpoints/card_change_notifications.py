from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.dependencies import get_actor_user_id, get_db_session, raise_service_http_error
from app.models import Card, CardChangeNotification
from app.schemas.card_change_notifications import (
    CardChangeNotificationChangeRead,
    CardChangeNotificationListRead,
    CardChangeNotificationMarkAllRead,
    CardChangeNotificationRead,
)
from app.services.card_change_notifications import CardChangeNotificationService
from app.services.permissions import PermissionDeniedError

router = APIRouter(tags=["card-change-notifications"])


@router.get("/card-change-notifications", response_model=CardChangeNotificationListRead)
def list_card_change_notifications(
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> CardChangeNotificationListRead:
    try:
        unread_count, notifications = CardChangeNotificationService(session).list_for_actor(
            actor_user_id=actor_user_id,
            limit=limit,
        )
        cards_by_id = _cards_by_id(session, notifications)
        return CardChangeNotificationListRead(
            unread_count=unread_count,
            items=[
                _notification_to_read(item, card=cards_by_id[item.card_id])
                for item in notifications
            ],
        )
    except Exception as exc:
        raise_service_http_error(exc)


@router.post(
    "/card-change-notifications/{notification_id}/read",
    response_model=CardChangeNotificationRead,
)
def mark_card_change_notification_read(
    notification_id: UUID,
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> CardChangeNotificationRead:
    try:
        notification = CardChangeNotificationService(session).mark_read_for_actor(
            actor_user_id=actor_user_id,
            notification_id=notification_id,
        )
        card = session.get(Card, notification.card_id)
        if card is None:
            raise PermissionDeniedError("Notification is not available to this actor.")
        return _notification_to_read(notification, card=card)
    except Exception as exc:
        raise_service_http_error(exc)


@router.post(
    "/card-change-notifications/read-all",
    response_model=CardChangeNotificationMarkAllRead,
)
def mark_all_card_change_notifications_read(
    session: Annotated[Session, Depends(get_db_session)],
    actor_user_id: Annotated[UUID, Depends(get_actor_user_id)],
) -> CardChangeNotificationMarkAllRead:
    try:
        marked_count = CardChangeNotificationService(session).mark_all_read_for_actor(
            actor_user_id=actor_user_id,
        )
    except Exception as exc:
        raise_service_http_error(exc)
    return CardChangeNotificationMarkAllRead(marked_count=marked_count)


def _notification_to_read(
    notification: CardChangeNotification,
    *,
    card: Card,
) -> CardChangeNotificationRead:
    return CardChangeNotificationRead(
        id=notification.id,
        card_id=notification.card_id,
        card_display_name=card.display_name,
        actor_display_name=notification.actor_display_name,
        changes=[
            CardChangeNotificationChangeRead.model_validate(change)
            for change in notification.changes_json
        ],
        read_at=notification.read_at,
        created_at=notification.created_at,
    )


def _cards_by_id(
    session: Session,
    notifications: list[CardChangeNotification],
) -> dict[UUID, Card]:
    if not notifications:
        return {}
    cards = session.scalars(
        select(Card).where(Card.id.in_({notification.card_id for notification in notifications}))
    ).all()
    return {card.id: card for card in cards}
