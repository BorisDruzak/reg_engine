from collections.abc import Mapping, Sequence
from dataclasses import asdict, is_dataclass
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from typing import Any, Protocol, cast
from uuid import UUID

from sqlalchemy import and_, delete, desc, or_, select
from sqlalchemy.engine import CursorResult
from sqlalchemy.orm import Session

from app.domain.constants import AUDIT_RETENTION_CLASSES
from app.models import AuditEvent
from app.services.permissions import PermissionDeniedError, PermissionService

CARD_HISTORY_RETENTION = timedelta(days=14)
TECHNICAL_AUDIT_RETENTION = timedelta(days=3)


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
    ) -> list[AuditEvent]:
        if not PermissionService(self.session).is_superuser(actor_user_id):
            raise PermissionDeniedError("Only a system admin can read audit events.")

        bounded_limit = max(1, min(limit, 100))
        criteria = []
        if object_type is not None:
            criteria.append(AuditEvent.object_type == object_type)

        return list(
            self.session.scalars(
                select(AuditEvent)
                .where(*criteria)
                .order_by(desc(AuditEvent.created_at), desc(AuditEvent.id))
                .limit(bounded_limit)
            ).all()
        )

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
