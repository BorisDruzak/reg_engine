from dataclasses import dataclass
from typing import Protocol
from uuid import UUID

from app.domain.constants import FIELD_TYPES, REQUIRED_MODES
from app.services.audit import AuditEventCreate, AuditRecorder
from app.services.permissions import AccessDeniedError, ActorContext


class InvalidSchemaOperationError(ValueError):
    """Raised when a registry schema operation violates schema rules."""


@dataclass(frozen=True)
class RegistryCreate:
    code: str
    name: str


@dataclass(frozen=True)
class FieldCreate:
    code: str
    label: str
    field_type: str
    required_mode: str = "not_required"


class RegistrySchemaRepository(Protocol):
    def create_registry(self, *, code: str, name: str, created_by: UUID | None) -> UUID:
        """Create a registry and return its id."""

    def create_block(
        self,
        *,
        registry_id: UUID,
        code: str,
        title: str,
        created_by: UUID | None,
    ) -> UUID:
        """Create a form block and return its id."""

    def create_field(
        self,
        *,
        block_id: UUID,
        code: str,
        label: str,
        field_type: str,
        required_mode: str,
        created_by: UUID | None,
    ) -> UUID:
        """Create a form field and return its id."""

    def archive_field(self, field_id: UUID) -> None:
        """Archive a field without deleting it."""

    def archive_block(self, block_id: UUID) -> None:
        """Archive a form block without deleting it."""


class RegistrySchemaService:
    def __init__(
        self,
        repository: RegistrySchemaRepository,
        audit_service: AuditRecorder | None = None,
    ) -> None:
        self.repository = repository
        self.audit_service = audit_service

    def create_registry(self, actor: ActorContext, data: RegistryCreate) -> UUID:
        self._require_schema_manager(actor)
        registry_id = self.repository.create_registry(
            code=data.code,
            name=data.name,
            created_by=actor.user_id,
        )
        self._record_user_event(
            actor,
            "registry.create",
            "registry",
            registry_id,
            {"code": data.code, "name": data.name},
        )
        return registry_id

    def create_block(
        self,
        actor: ActorContext,
        *,
        registry_id: UUID,
        code: str,
        title: str,
    ) -> UUID:
        self._require_schema_manager(actor)
        block_id = self.repository.create_block(
            registry_id=registry_id,
            code=code,
            title=title,
            created_by=actor.user_id,
        )
        self._record_user_event(
            actor,
            "form_block.create",
            "form_block",
            block_id,
            {"registry_id": registry_id, "code": code, "title": title},
        )
        return block_id

    def create_field(self, actor: ActorContext, *, block_id: UUID, data: FieldCreate) -> UUID:
        self._require_schema_manager(actor)
        self._validate_field(data)
        field_id = self.repository.create_field(
            block_id=block_id,
            code=data.code,
            label=data.label,
            field_type=data.field_type,
            required_mode=data.required_mode,
            created_by=actor.user_id,
        )
        self._record_user_event(
            actor,
            "form_field.create",
            "form_field",
            field_id,
            {
                "block_id": block_id,
                "code": data.code,
                "field_type": data.field_type,
                "required_mode": data.required_mode,
            },
        )
        return field_id

    def archive_field(self, actor: ActorContext, field_id: UUID) -> None:
        self._require_schema_manager(actor)
        self.repository.archive_field(field_id)
        self._record_user_event(actor, "form_field.archive", "form_field", field_id, None)

    def archive_block(self, actor: ActorContext, block_id: UUID) -> None:
        self._require_schema_manager(actor)
        self.repository.archive_block(block_id)
        self._record_user_event(actor, "form_block.archive", "form_block", block_id, None)

    def _require_schema_manager(self, actor: ActorContext) -> None:
        if not actor.is_superuser:
            raise AccessDeniedError("Only a system administrator can manage registry schema in v1.")

    def _validate_field(self, data: FieldCreate) -> None:
        if data.field_type not in FIELD_TYPES:
            raise InvalidSchemaOperationError(f"Unsupported field type: {data.field_type}")
        if data.required_mode not in REQUIRED_MODES:
            raise InvalidSchemaOperationError(f"Unsupported required mode: {data.required_mode}")

    def _record_user_event(
        self,
        actor: ActorContext,
        action: str,
        object_type: str,
        object_id: UUID,
        new_data: dict[str, object] | None,
    ) -> None:
        if self.audit_service is None:
            return
        self.audit_service.record_user_event(
            actor,
            AuditEventCreate(
                action=action,
                object_type=object_type,
                object_id=object_id,
                new_data=new_data,
            ),
        )
