from collections.abc import Sequence
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session
from sqlalchemy.sql.elements import ColumnElement

from app.models import (
    AuditEvent,
    Card,
    CardChangeNotification,
    CardChangeNotificationSubscription,
    CardPublicLink,
    Organization,
    PublicLinkChangeNotificationSubscription,
    User,
)
from app.services.audit import AuditService
from app.services.cards import CardServiceError
from app.services.permissions import PermissionDeniedError, PermissionService
from app.services.public_links import PublicLinkError


class CardChangeNotificationService:
    def __init__(self, session: Session) -> None:
        self.session = session

    def get_card_subscription_for_actor(self, *, actor_user_id: UUID, card_id: UUID) -> bool:
        self._require_card_visibility(actor_user_id=actor_user_id, card_id=card_id)
        return (
            self.session.scalar(
                select(CardChangeNotificationSubscription.id).where(
                    CardChangeNotificationSubscription.user_id == actor_user_id,
                    CardChangeNotificationSubscription.card_id == card_id,
                )
            )
            is not None
        )

    def set_card_subscription_for_actor(
        self,
        *,
        actor_user_id: UUID,
        card_id: UUID,
        enabled: bool,
    ) -> bool:
        self._require_card_visibility(actor_user_id=actor_user_id, card_id=card_id)
        subscription = self.session.scalar(
            select(CardChangeNotificationSubscription).where(
                CardChangeNotificationSubscription.user_id == actor_user_id,
                CardChangeNotificationSubscription.card_id == card_id,
            )
        )
        if enabled and subscription is None:
            self.session.add(
                CardChangeNotificationSubscription(user_id=actor_user_id, card_id=card_id)
            )
            self.session.flush()
            self._record_subscription_audit(
                actor_user_id=actor_user_id,
                action="subscribe",
                object_type="card_change_notification_subscription",
                object_id=card_id,
                enabled=True,
            )
        elif not enabled and subscription is not None:
            self.session.delete(subscription)
            self.session.flush()
            self._record_subscription_audit(
                actor_user_id=actor_user_id,
                action="unsubscribe",
                object_type="card_change_notification_subscription",
                object_id=card_id,
                enabled=False,
            )
        return enabled

    def get_public_link_subscription_for_creator(
        self,
        *,
        actor_user_id: UUID,
        public_link_id: UUID,
    ) -> bool:
        self._require_public_link_creator(
            actor_user_id=actor_user_id,
            public_link_id=public_link_id,
        )
        return (
            self.session.scalar(
                select(PublicLinkChangeNotificationSubscription.id).where(
                    PublicLinkChangeNotificationSubscription.user_id == actor_user_id,
                    PublicLinkChangeNotificationSubscription.public_link_id == public_link_id,
                )
            )
            is not None
        )

    def set_public_link_subscription_for_creator(
        self,
        *,
        actor_user_id: UUID,
        public_link_id: UUID,
        enabled: bool,
    ) -> bool:
        self._require_public_link_creator(
            actor_user_id=actor_user_id,
            public_link_id=public_link_id,
        )
        subscription = self.session.scalar(
            select(PublicLinkChangeNotificationSubscription).where(
                PublicLinkChangeNotificationSubscription.user_id == actor_user_id,
                PublicLinkChangeNotificationSubscription.public_link_id == public_link_id,
            )
        )
        if enabled and subscription is None:
            self.session.add(
                PublicLinkChangeNotificationSubscription(
                    user_id=actor_user_id,
                    public_link_id=public_link_id,
                )
            )
            self.session.flush()
            self._record_subscription_audit(
                actor_user_id=actor_user_id,
                action="subscribe",
                object_type="public_link_change_notification_subscription",
                object_id=public_link_id,
                enabled=True,
            )
        elif not enabled and subscription is not None:
            self.session.delete(subscription)
            self.session.flush()
            self._record_subscription_audit(
                actor_user_id=actor_user_id,
                action="unsubscribe",
                object_type="public_link_change_notification_subscription",
                object_id=public_link_id,
                enabled=False,
            )
        return enabled

    def list_for_actor(
        self,
        *,
        actor_user_id: UUID,
        limit: int,
    ) -> tuple[int, list[CardChangeNotification]]:
        visible_criteria = self._visible_notification_card_criteria(actor_user_id=actor_user_id)
        if visible_criteria is None:
            return 0, []
        criteria = [CardChangeNotification.user_id == actor_user_id, visible_criteria]
        unread_count = int(
            self.session.scalar(
                select(func.count())
                .select_from(CardChangeNotification)
                .join(Card, Card.id == CardChangeNotification.card_id)
                .join(Organization, Organization.id == Card.organization_id)
                .where(*criteria, CardChangeNotification.read_at.is_(None))
                .where(
                    Organization.archived_at.is_(None),
                    Organization.is_active.is_(True),
                )
            )
            or 0
        )
        notifications = list(
            self.session.scalars(
                select(CardChangeNotification)
                .join(Card, Card.id == CardChangeNotification.card_id)
                .join(Organization, Organization.id == Card.organization_id)
                .where(CardChangeNotification.user_id == actor_user_id)
                .where(visible_criteria)
                .where(
                    Organization.archived_at.is_(None),
                    Organization.is_active.is_(True),
                )
                .order_by(
                    CardChangeNotification.created_at.desc(),
                    CardChangeNotification.id.desc(),
                )
                .limit(limit)
            ).all()
        )
        return unread_count, notifications

    def record_card_history_events(
        self,
        events: Sequence[AuditEvent],
    ) -> list[CardChangeNotification]:
        history_events = [
            event
            for event in events
            if event.card_id is not None
            and event.retention_class == "card_history"
            and event.action != "lifecycle_sync"
        ]
        if not history_events:
            return []

        presentations = AuditService(self.session).present_card_history_events(history_events)
        grouped_changes: dict[tuple[UUID, UUID, str], list[dict[str, object]]] = {}
        for event in history_events:
            assert event.card_id is not None
            recipients = set(
                self.session.scalars(
                    select(CardChangeNotificationSubscription.user_id).where(
                        CardChangeNotificationSubscription.card_id == event.card_id
                    )
                ).all()
            )
            if event.actor_public_link_id is not None:
                recipients.update(
                    self.session.scalars(
                        select(PublicLinkChangeNotificationSubscription.user_id).where(
                            PublicLinkChangeNotificationSubscription.public_link_id
                            == event.actor_public_link_id
                        )
                    ).all()
                )
            effective_actor_user_id = event.attributed_user_id or event.actor_user_id
            if effective_actor_user_id is not None:
                recipients.discard(effective_actor_user_id)
            actor_display_name = self._notification_actor_display_name(
                effective_actor_user_id=effective_actor_user_id
            )
            change = self._notification_change(presentation=presentations[event.id])
            for recipient_id in recipients:
                grouped_changes.setdefault(
                    (recipient_id, event.card_id, actor_display_name), []
                ).append(change)

        notifications = [
            CardChangeNotification(
                user_id=user_id,
                card_id=card_id,
                actor_display_name=actor_display_name,
                changes_json=changes,
            )
            for (user_id, card_id, actor_display_name), changes in grouped_changes.items()
        ]
        self.session.add_all(notifications)
        if notifications:
            self.session.flush()
        return notifications

    def _notification_actor_display_name(
        self,
        *,
        effective_actor_user_id: UUID | None,
    ) -> str:
        if effective_actor_user_id is None:
            return "Система"
        user = self.session.get(User, effective_actor_user_id)
        return user.display_name if user is not None else "Система"

    @staticmethod
    def _notification_change(*, presentation: object) -> dict[str, object]:
        if getattr(presentation, "display", None) == "field_diff":
            old_snapshot = getattr(presentation, "old_data_json", None)
            new_snapshot = getattr(presentation, "new_data_json", None)
            snapshot = new_snapshot if isinstance(new_snapshot, dict) else old_snapshot
            field = snapshot.get("field") if isinstance(snapshot, dict) else None
            label = field.get("label") if isinstance(field, dict) else None
            return {
                "label": label if isinstance(label, str) and label else "Поле",
                "before": old_snapshot.get("value") if isinstance(old_snapshot, dict) else None,
                "after": new_snapshot.get("value") if isinstance(new_snapshot, dict) else None,
            }
        description = getattr(presentation, "description", None)
        return {"label": "Событие карточки", "description": description or "Событие карточки"}

    def get_visible_cards_for_actor(
        self,
        *,
        actor_user_id: UUID,
        card_ids: set[UUID],
    ) -> dict[UUID, Card]:
        if not card_ids:
            return {}
        registry_ids = self.session.scalars(
            select(Card.registry_id).where(Card.id.in_(card_ids)).distinct()
        ).all()
        visible_criteria = self._visible_card_criteria(
            actor_user_id=actor_user_id,
            registry_ids=registry_ids,
        )
        if visible_criteria is None:
            return {}
        cards = self.session.scalars(
            select(Card)
            .join(Organization, Organization.id == Card.organization_id)
            .where(Card.id.in_(card_ids))
            .where(visible_criteria)
            .where(
                Organization.archived_at.is_(None),
                Organization.is_active.is_(True),
            )
        ).all()
        return {card.id: card for card in cards}

    def mark_read_for_actor(
        self,
        *,
        actor_user_id: UUID,
        notification_id: UUID,
    ) -> CardChangeNotification:
        notification = self.session.scalar(
            select(CardChangeNotification).where(
                CardChangeNotification.id == notification_id,
                CardChangeNotification.user_id == actor_user_id,
            )
        )
        if notification is None:
            raise PermissionDeniedError("Notification is not available to this actor.")
        if not self._can_see_notification_card(
            actor_user_id=actor_user_id,
            notification=notification,
        ):
            raise PermissionDeniedError("Actor cannot see the notification card.")
        if notification.read_at is None:
            notification.read_at = datetime.now(UTC)
            self.session.flush()
        return notification

    def mark_all_read_for_actor(self, *, actor_user_id: UUID) -> int:
        _unread_count, notifications = self.list_for_actor(
            actor_user_id=actor_user_id,
            limit=2**31 - 1,
        )
        unread_notifications = [
            notification for notification in notifications if notification.read_at is None
        ]
        if not unread_notifications:
            return 0
        read_at = datetime.now(UTC)
        for notification in unread_notifications:
            notification.read_at = read_at
        self.session.flush()
        return len(unread_notifications)

    def _require_card_visibility(self, *, actor_user_id: UUID, card_id: UUID) -> Card:
        card = self.session.get(Card, card_id)
        if card is None:
            raise CardServiceError("Card was not found.")
        if not PermissionService(self.session).can_see_organization(
            actor_user_id,
            card.organization_id,
            registry_id=card.registry_id,
        ):
            raise PermissionDeniedError("Actor cannot see this card.")
        return card

    def _require_public_link_creator(
        self,
        *,
        actor_user_id: UUID,
        public_link_id: UUID,
    ) -> CardPublicLink:
        public_link = self.session.get(CardPublicLink, public_link_id)
        if public_link is None:
            raise PublicLinkError("Public link was not found.")
        if public_link.created_by != actor_user_id:
            raise PermissionDeniedError(
                "Only the public link creator may manage this subscription."
            )
        return public_link

    def _can_see_notification_card(
        self,
        *,
        actor_user_id: UUID,
        notification: CardChangeNotification,
    ) -> bool:
        card = self.session.get(Card, notification.card_id)
        return card is not None and PermissionService(self.session).can_see_organization(
            actor_user_id,
            card.organization_id,
            registry_id=card.registry_id,
        )

    def _visible_notification_card_criteria(
        self,
        *,
        actor_user_id: UUID,
    ) -> ColumnElement[bool] | None:
        registry_ids = self.session.scalars(
            select(Card.registry_id)
            .join(CardChangeNotification, CardChangeNotification.card_id == Card.id)
            .where(CardChangeNotification.user_id == actor_user_id)
            .distinct()
        ).all()
        return self._visible_card_criteria(
            actor_user_id=actor_user_id,
            registry_ids=registry_ids,
        )

    def _visible_card_criteria(
        self,
        *,
        actor_user_id: UUID,
        registry_ids: Sequence[UUID],
    ) -> ColumnElement[bool] | None:
        permissions = PermissionService(self.session)
        criteria = []
        for registry_id in registry_ids:
            scope_ids = permissions.get_organization_scope_ids(
                actor_user_id,
                registry_id=registry_id,
            )
            if scope_ids:
                criteria.append(
                    and_(
                        Card.registry_id == registry_id,
                        Card.organization_id.in_(scope_ids),
                    )
                )
        return or_(*criteria) if criteria else None

    def _record_subscription_audit(
        self,
        *,
        actor_user_id: UUID,
        action: str,
        object_type: str,
        object_id: UUID,
        enabled: bool,
    ) -> None:
        AuditService(self.session).record_user_event(
            actor_user_id=actor_user_id,
            action=action,
            object_type=object_type,
            object_id=object_id,
            new_data_json={"enabled": enabled},
            retention_class="technical",
        )
