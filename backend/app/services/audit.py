from collections.abc import Mapping, Sequence
from dataclasses import asdict, dataclass, is_dataclass
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from typing import Any, Literal, Protocol, cast
from uuid import UUID

from sqlalchemy import and_, delete, desc, or_, select
from sqlalchemy.engine import CursorResult
from sqlalchemy.orm import Session, aliased

from app.domain.constants import AUDIT_RETENTION_CLASSES
from app.models import (
    AuditEvent,
    Card,
    Organization,
    OrgUnit,
    ReferenceItem,
    Registry,
    User,
)
from app.services.permissions import PermissionDeniedError, PermissionService

CARD_HISTORY_RETENTION = timedelta(days=14)
TECHNICAL_AUDIT_RETENTION = timedelta(days=3)


@dataclass(frozen=True)
class AuditEventListItem:
    event: AuditEvent
    object_id: UUID | None
    actor_display_name: str | None
    attributed_user_display_name: str | None
    card_display_name: str | None
    card_lifecycle_status: str | None
    old_data_json: dict[str, Any] | None
    new_data_json: dict[str, Any] | None
    history_display: str | None
    history_description: str | None


@dataclass(frozen=True)
class CardHistoryPresentation:
    display: Literal["field_diff", "standalone"]
    description: str | None
    old_data_json: dict[str, Any] | None
    new_data_json: dict[str, Any] | None


class FieldAuditSnapshotInput(Protocol):
    id: UUID
    code: str
    label: str
    field_type: str
    sensitivity_level: str


def safe_field_value_audit_snapshot(
    *, field: FieldAuditSnapshotInput, value: object | None
) -> dict[str, Any]:
    """Build a display-safe schema-driven field-value snapshot for card history."""
    field_data = {
        "id": str(field.id),
        "code": field.code,
        "label": field.label,
        "type": field.field_type,
    }
    if field.sensitivity_level != "normal":
        return {"field": field_data, "value": {"redacted": True}}
    return {"field": field_data, "value": _json_safe_audit_value(value)}


def _json_safe_audit_value(value: object | None) -> object | None:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    if is_dataclass(value) and not isinstance(value, type):
        return _json_safe_audit_value(asdict(value))
    if isinstance(value, Mapping):
        return {str(key): _json_safe_audit_value(item) for key, item in value.items()}
    if isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
        return [_json_safe_audit_value(item) for item in value]
    return str(value)


_REFERENCE_FIELD_TYPES = {
    "select",
    "multi_select",
    "organization_ref",
    "org_unit_ref",
    "user_ref",
    "card_ref",
    "registry_ref",
}
_UNAVAILABLE_REFERENCE_DISPLAY = "Недоступное значение"
_UNAVAILABLE_AUDIT_VALUE = "Недоступно"


def _reference_snapshot_field_type(snapshot: object) -> str | None:
    if not isinstance(snapshot, Mapping):
        return None
    field = snapshot.get("field")
    if not isinstance(field, Mapping):
        return None
    field_type = field.get("type")
    if not isinstance(field_type, str) or field_type not in _REFERENCE_FIELD_TYPES:
        return None
    return field_type


def _snapshot_uuid_values(value: object) -> list[UUID]:
    raw_values = (
        value if isinstance(value, Sequence) and not isinstance(value, str | bytes) else [value]
    )
    result: list[UUID] = []
    for raw_value in raw_values:
        try:
            result.append(raw_value if isinstance(raw_value, UUID) else UUID(str(raw_value)))
        except (TypeError, ValueError, AttributeError):
            continue
    return result


_CARD_HISTORY_OBJECT_LABELS = {
    "card": "Карточка",
    "field_value": "Значение поля",
    "card_public_access": "Настройки публичного доступа",
    "card_public_link": "Публичная ссылка",
    "card_block_instance": "Экземпляр блока формы",
}
_CARD_HISTORY_ACTION_FORMS = {
    "create": "создана",
    "update": "изменена",
    "archive": "архивирована",
    "restore": "восстановлена",
}


def _safe_card_history_description(*, object_type: str, action: str) -> str:
    """Describe a non-field event without using its stored snapshot or IDs."""
    label = _CARD_HISTORY_OBJECT_LABELS.get(object_type, "Событие карточки")
    action_key = action.rsplit(".", maxsplit=1)[-1]
    action_form = _CARD_HISTORY_ACTION_FORMS.get(action_key)
    return f"{label} {action_form}" if action_form else f"{label}: изменение зарегистрировано"


def _safe_field_history_value(value: object) -> object:
    if value is None or isinstance(value, (bool, int, float)):
        return value
    if isinstance(value, str):
        return _UNAVAILABLE_AUDIT_VALUE if _snapshot_uuid_values(value) else value
    if isinstance(value, Mapping):
        return {"redacted": True} if value.get("redacted") is True else _UNAVAILABLE_AUDIT_VALUE
    if isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
        return [_safe_field_history_value(item) for item in value]
    return _UNAVAILABLE_AUDIT_VALUE


def _safe_field_history_snapshot(
    snapshot: object,
    labels_by_type: Mapping[str, Mapping[UUID, str]],
) -> dict[str, Any] | None:
    if not isinstance(snapshot, Mapping):
        return None
    field = snapshot.get("field")
    if not isinstance(field, Mapping) or "value" not in snapshot:
        return None
    code = field.get("code")
    if not isinstance(code, str) or not code:
        return None
    field_type = field.get("type")
    safe_field = {
        "code": code,
        "label": field.get("label") if isinstance(field.get("label"), str) else None,
        "type": field_type if isinstance(field_type, str) else None,
    }
    value = snapshot.get("value")
    if field_type not in _REFERENCE_FIELD_TYPES:
        return {"field": safe_field, "value": _safe_field_history_value(value)}
    if value is None or (isinstance(value, Mapping) and value.get("redacted") is True):
        return {"field": safe_field, "value": _safe_field_history_value(value)}
    labels = labels_by_type.get(str(field_type), {})
    if isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
        safe_value = [
            labels.get(value_id, _UNAVAILABLE_REFERENCE_DISPLAY)
            for value_id in _snapshot_uuid_values(value)
        ]
    else:
        value_ids = _snapshot_uuid_values(value)
        safe_value = (
            labels.get(value_ids[0], _UNAVAILABLE_REFERENCE_DISPLAY)
            if value_ids
            else _UNAVAILABLE_REFERENCE_DISPLAY
        )
    return {"field": safe_field, "value": safe_value}


class AuditService:
    def __init__(self, session: Session) -> None:
        self.session = session

    def record_user_event(
        self,
        *,
        actor_user_id: UUID,
        action: str,
        object_type: str,
        object_id: UUID | None = None,
        old_data_json: dict[str, Any] | None = None,
        new_data_json: dict[str, Any] | None = None,
        source: str = "api",
        card_id: UUID | None = None,
        attributed_user_id: UUID | None = None,
        retention_class: str = "technical",
    ) -> AuditEvent:
        return self._record(
            actor_type="user",
            actor_user_id=actor_user_id,
            actor_public_link_id=None,
            actor_reference_edit_link_id=None,
            action=action,
            object_type=object_type,
            object_id=object_id,
            old_data_json=old_data_json,
            new_data_json=new_data_json,
            source=source,
            card_id=card_id,
            attributed_user_id=attributed_user_id,
            retention_class=retention_class,
        )

    def record_public_link_event(
        self,
        *,
        actor_public_link_id: UUID,
        action: str,
        object_type: str,
        object_id: UUID | None = None,
        old_data_json: dict[str, Any] | None = None,
        new_data_json: dict[str, Any] | None = None,
        card_id: UUID | None = None,
        attributed_user_id: UUID | None = None,
        retention_class: str = "technical",
    ) -> AuditEvent:
        return self._record(
            actor_type="public_link",
            actor_user_id=None,
            actor_public_link_id=actor_public_link_id,
            actor_reference_edit_link_id=None,
            action=action,
            object_type=object_type,
            object_id=object_id,
            old_data_json=old_data_json,
            new_data_json=new_data_json,
            source="public_link",
            card_id=card_id,
            attributed_user_id=attributed_user_id,
            retention_class=retention_class,
        )

    def record_reference_edit_link_event(
        self,
        *,
        actor_reference_edit_link_id: UUID,
        action: str,
        object_type: str,
        object_id: UUID | None = None,
        old_data_json: dict[str, Any] | None = None,
        new_data_json: dict[str, Any] | None = None,
        card_id: UUID | None = None,
        attributed_user_id: UUID | None = None,
        retention_class: str = "technical",
    ) -> AuditEvent:
        return self._record(
            actor_type="reference_edit_link",
            actor_user_id=None,
            actor_public_link_id=None,
            actor_reference_edit_link_id=actor_reference_edit_link_id,
            action=action,
            object_type=object_type,
            object_id=object_id,
            old_data_json=old_data_json,
            new_data_json=new_data_json,
            source="reference_edit_link",
            card_id=card_id,
            attributed_user_id=attributed_user_id,
            retention_class=retention_class,
        )

    def record_system_event(
        self,
        *,
        action: str,
        object_type: str,
        object_id: UUID | None = None,
        old_data_json: dict[str, Any] | None = None,
        new_data_json: dict[str, Any] | None = None,
        card_id: UUID | None = None,
        attributed_user_id: UUID | None = None,
        retention_class: str = "technical",
    ) -> AuditEvent:
        return self._record(
            actor_type="system",
            actor_user_id=None,
            actor_public_link_id=None,
            actor_reference_edit_link_id=None,
            action=action,
            object_type=object_type,
            object_id=object_id,
            old_data_json=old_data_json,
            new_data_json=new_data_json,
            source="system",
            card_id=card_id,
            attributed_user_id=attributed_user_id,
            retention_class=retention_class,
        )

    def list_events_for_actor(
        self,
        *,
        actor_user_id: UUID,
        object_type: str | None = None,
        limit: int = 50,
        scope: str = "technical",
        card_id: UUID | None = None,
        card_status: Literal["active", "archived", "all"] = "active",
        actor_filter_user_id: UUID | None = None,
    ) -> list[AuditEventListItem]:
        if not PermissionService(self.session).is_superuser(actor_user_id):
            raise PermissionDeniedError("Only a system admin can read audit events.")

        bounded_limit = max(1, min(limit, 100))
        criteria = [AuditEvent.retention_class == scope]
        if scope == "card_history":
            if card_id is not None:
                criteria.append(AuditEvent.card_id == card_id)
            criteria.append(AuditEvent.action != "lifecycle_sync")
            if card_status == "active":
                criteria.extend(
                    [
                        Card.archived_at.is_(None),
                        Card.lifecycle_status.not_in(("archived", "superseded")),
                    ]
                )
            elif card_status == "archived":
                criteria.append(
                    or_(
                        Card.archived_at.is_not(None),
                        Card.lifecycle_status.in_(("archived", "superseded")),
                    )
                )
            if actor_filter_user_id is not None:
                criteria.append(
                    or_(
                        AuditEvent.actor_user_id == actor_filter_user_id,
                        AuditEvent.attributed_user_id == actor_filter_user_id,
                    )
                )
        elif scope != "technical":
            raise ValueError(f"Unsupported audit scope: {scope}")
        if object_type is not None:
            criteria.append(AuditEvent.object_type == object_type)

        actor_user = aliased(User)
        attributed_user = aliased(User)
        statement = (
            select(
                AuditEvent,
                actor_user.display_name,
                attributed_user.display_name,
                Card.display_name,
                Card.lifecycle_status,
            )
            .outerjoin(actor_user, AuditEvent.actor_user_id == actor_user.id)
            .outerjoin(attributed_user, AuditEvent.attributed_user_id == attributed_user.id)
            .where(*criteria)
            .order_by(desc(AuditEvent.created_at), desc(AuditEvent.id))
            .limit(bounded_limit)
        )
        if scope == "card_history":
            statement = statement.join(Card, AuditEvent.card_id == Card.id)
        else:
            statement = statement.outerjoin(Card, AuditEvent.card_id == Card.id)
        rows = self.session.execute(statement).all()
        history_presentations = self._card_history_presentations(
            [event for event, _, _, _, _ in rows] if scope == "card_history" else []
        )
        return [
            AuditEventListItem(
                event=event,
                object_id=None if scope == "card_history" else event.object_id,
                actor_display_name=(
                    "Публичная ссылка" if event.actor_type == "public_link" else actor_display_name
                ),
                attributed_user_display_name=attributed_user_display_name,
                card_display_name=card_display_name,
                card_lifecycle_status=card_lifecycle_status,
                old_data_json=(
                    history_presentations[event.id].old_data_json
                    if event.id in history_presentations
                    else event.old_data_json
                ),
                new_data_json=(
                    history_presentations[event.id].new_data_json
                    if event.id in history_presentations
                    else event.new_data_json
                ),
                history_display=(
                    history_presentations[event.id].display
                    if event.id in history_presentations
                    else None
                ),
                history_description=(
                    history_presentations[event.id].description
                    if event.id in history_presentations
                    else None
                ),
            )
            for (
                event,
                actor_display_name,
                attributed_user_display_name,
                card_display_name,
                card_lifecycle_status,
            ) in rows
        ]

    def _card_history_presentations(
        self,
        events: Sequence[AuditEvent],
    ) -> dict[UUID, CardHistoryPresentation]:
        snapshots: list[dict[str, Any]] = []
        for event in events:
            for snapshot in (event.old_data_json, event.new_data_json):
                if (
                    isinstance(snapshot, dict)
                    and _reference_snapshot_field_type(snapshot) is not None
                ):
                    snapshots.append(snapshot)
        labels_by_type = self._reference_labels_by_field_type(snapshots)
        result: dict[UUID, CardHistoryPresentation] = {}
        for event in events:
            if event.object_type == "field_value":
                old_snapshot = _safe_field_history_snapshot(event.old_data_json, labels_by_type)
                new_snapshot = _safe_field_history_snapshot(event.new_data_json, labels_by_type)
                if old_snapshot is not None or new_snapshot is not None:
                    result[event.id] = CardHistoryPresentation(
                        display="field_diff",
                        description=None,
                        old_data_json=old_snapshot,
                        new_data_json=new_snapshot,
                    )
                    continue
            result[event.id] = CardHistoryPresentation(
                display="standalone",
                description=_safe_card_history_description(
                    object_type=event.object_type,
                    action=event.action,
                ),
                old_data_json=None,
                new_data_json=None,
            )
        return result

    def _reference_labels_by_field_type(
        self,
        snapshots: Sequence[dict[str, Any]],
    ) -> dict[str, dict[UUID, str]]:
        ids_by_type: dict[str, set[UUID]] = {
            "select": set(),
            "multi_select": set(),
            "organization_ref": set(),
            "org_unit_ref": set(),
            "user_ref": set(),
            "card_ref": set(),
            "registry_ref": set(),
        }
        for snapshot in snapshots:
            field_type = _reference_snapshot_field_type(snapshot)
            if field_type is None:
                continue
            ids_by_type[field_type].update(_snapshot_uuid_values(snapshot.get("value")))

        return {
            "select": self._labels_by_id(ReferenceItem, ids_by_type["select"], "label"),
            "multi_select": self._labels_by_id(ReferenceItem, ids_by_type["multi_select"], "label"),
            "organization_ref": self._labels_by_id(
                Organization, ids_by_type["organization_ref"], "name"
            ),
            "org_unit_ref": self._labels_by_id(OrgUnit, ids_by_type["org_unit_ref"], "name"),
            "user_ref": self._labels_by_id(User, ids_by_type["user_ref"], "display_name"),
            "card_ref": self._labels_by_id(Card, ids_by_type["card_ref"], "display_name"),
            "registry_ref": self._labels_by_id(Registry, ids_by_type["registry_ref"], "name"),
        }

    def _labels_by_id(
        self,
        model: Any,
        ids: set[UUID],
        attribute: str,
    ) -> dict[UUID, str]:
        if not ids:
            return {}
        return {
            item.id: str(getattr(item, attribute))
            for item in self.session.scalars(select(model).where(model.id.in_(ids))).all()
        }

    def _record(
        self,
        *,
        actor_type: str,
        actor_user_id: UUID | None,
        actor_public_link_id: UUID | None,
        actor_reference_edit_link_id: UUID | None,
        action: str,
        object_type: str,
        object_id: UUID | None,
        old_data_json: dict[str, Any] | None,
        new_data_json: dict[str, Any] | None,
        source: str,
        card_id: UUID | None,
        attributed_user_id: UUID | None,
        retention_class: str,
    ) -> AuditEvent:
        if retention_class not in AUDIT_RETENTION_CLASSES:
            raise ValueError(f"Unsupported audit retention class: {retention_class}")

        metadata = self._request_metadata()
        resolved_source = (metadata.get("source") or "api") if source == "api" else source
        event = AuditEvent(
            actor_type=actor_type,
            actor_user_id=actor_user_id,
            actor_public_link_id=actor_public_link_id,
            actor_reference_edit_link_id=actor_reference_edit_link_id,
            action=action,
            object_type=object_type,
            object_id=object_id,
            card_id=card_id,
            attributed_user_id=attributed_user_id,
            retention_class=retention_class,
            old_data_json=old_data_json,
            new_data_json=new_data_json,
            source=resolved_source,
            ip_address=metadata.get("ip_address"),
            user_agent=metadata.get("user_agent"),
            request_id=metadata.get("request_id"),
        )
        self.session.add(event)
        self.session.flush()
        return event

    def _request_metadata(self) -> dict[str, str | None]:
        raw_metadata = self.session.info.get("audit_metadata")
        if raw_metadata is None:
            return {"ip_address": None, "user_agent": None, "request_id": None, "source": "api"}
        if isinstance(raw_metadata, dict):
            return {
                "ip_address": raw_metadata.get("ip_address"),
                "user_agent": raw_metadata.get("user_agent"),
                "request_id": raw_metadata.get("request_id"),
                "source": _normalize_audit_source(raw_metadata.get("source")),
            }
        return {
            "ip_address": getattr(raw_metadata, "ip_address", None),
            "user_agent": getattr(raw_metadata, "user_agent", None),
            "request_id": getattr(raw_metadata, "request_id", None),
            "source": _normalize_audit_source(getattr(raw_metadata, "source", None)),
        }


class AuditRetentionService:
    def __init__(self, session: Session) -> None:
        self.session = session

    def delete_expired_events(self, *, now: datetime | None = None) -> int:
        evaluated_at = now or datetime.now(UTC)
        if evaluated_at.tzinfo is None:
            raise ValueError("Audit retention time must include a timezone.")

        result = self.session.execute(
            delete(AuditEvent).where(
                or_(
                    and_(
                        AuditEvent.retention_class == "card_history",
                        AuditEvent.created_at < evaluated_at - CARD_HISTORY_RETENTION,
                    ),
                    and_(
                        AuditEvent.retention_class == "technical",
                        AuditEvent.created_at < evaluated_at - TECHNICAL_AUDIT_RETENTION,
                    ),
                )
            )
        )
        self.session.flush()
        return int(cast(CursorResult[Any], result).rowcount or 0)


def _normalize_audit_source(raw_source: object) -> str:
    return "mcp" if isinstance(raw_source, str) and raw_source.strip().lower() == "mcp" else "api"
