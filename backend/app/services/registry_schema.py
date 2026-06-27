from dataclasses import dataclass
from typing import Protocol, cast
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
class RegistryUpdate:
    code: str | None = None
    name: str | None = None


@dataclass(frozen=True)
class FormBlockUpdate:
    code: str | None = None
    title: str | None = None


@dataclass(frozen=True)
class FieldCreate:
    code: str
    label: str
    field_type: str
    required_mode: str = "not_required"


@dataclass(frozen=True)
class FieldUpdate:
    code: str | None = None
    label: str | None = None
    required_mode: str | None = None


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

    def get_registry(self, registry_id: UUID) -> dict[str, object]:
        """Return registry attributes."""

    def list_blocks(self, registry_id: UUID) -> list[dict[str, object]]:
        """Return blocks for a registry."""

    def list_fields(self, block_id: UUID) -> list[dict[str, object]]:
        """Return fields for a block."""

    def get_block(self, block_id: UUID) -> dict[str, object]:
        """Return block attributes."""

    def get_field(self, field_id: UUID) -> dict[str, object]:
        """Return field attributes."""

    def update_registry(
        self,
        registry_id: UUID,
        *,
        code: str | None,
        name: str | None,
    ) -> None:
        """Update mutable registry fields."""

    def update_block(
        self,
        block_id: UUID,
        *,
        code: str | None,
        title: str | None,
    ) -> None:
        """Update mutable form block fields."""

    def update_field(
        self,
        field_id: UUID,
        *,
        code: str | None,
        label: str | None,
        required_mode: str | None,
    ) -> None:
        """Update mutable form field fields."""


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

    def get_schema(self, actor: ActorContext, registry_id: UUID) -> dict[str, object]:
        self._require_schema_manager(actor)
        return self._registry_schema(registry_id)

    def update_registry(
        self,
        actor: ActorContext,
        registry_id: UUID,
        data: RegistryUpdate,
    ) -> dict[str, object]:
        self._require_schema_manager(actor)
        before = self.repository.get_registry(registry_id)
        self.repository.update_registry(registry_id, code=data.code, name=data.name)
        after = self.repository.get_registry(registry_id)
        self._record_user_event(
            actor,
            "registry.update",
            "registry",
            registry_id,
            {"old": {"code": before["code"], "name": before["name"]}, "new": after},
        )
        return self._registry_schema(registry_id)

    def update_block(
        self,
        actor: ActorContext,
        block_id: UUID,
        data: FormBlockUpdate,
    ) -> dict[str, object]:
        self._require_schema_manager(actor)
        before = self._block_by_id(block_id)
        self.repository.update_block(block_id, code=data.code, title=data.title)
        after = self._block_by_id(block_id)
        self._record_user_event(
            actor,
            "form_block.update",
            "form_block",
            block_id,
            {"old": {"code": before["code"], "title": before["title"]}, "new": after},
        )
        return self._block_with_fields(after)

    def update_field(
        self,
        actor: ActorContext,
        field_id: UUID,
        data: FieldUpdate,
    ) -> dict[str, object]:
        self._require_schema_manager(actor)
        if data.required_mode is not None and data.required_mode not in REQUIRED_MODES:
            raise InvalidSchemaOperationError(f"Unsupported required mode: {data.required_mode}")
        before = self._field_by_id(field_id)
        self.repository.update_field(
            field_id,
            code=data.code,
            label=data.label,
            required_mode=data.required_mode,
        )
        after = self._field_by_id(field_id)
        self._record_user_event(
            actor,
            "form_field.update",
            "form_field",
            field_id,
            {
                "old": {
                    "code": before["code"],
                    "label": before["label"],
                    "required_mode": before["required_mode"],
                },
                "new": after,
            },
        )
        return after

    def _require_schema_manager(self, actor: ActorContext) -> None:
        if not actor.is_superuser:
            raise AccessDeniedError("Only a system administrator can manage registry schema in v1.")

    def _validate_field(self, data: FieldCreate) -> None:
        if data.field_type not in FIELD_TYPES:
            raise InvalidSchemaOperationError(f"Unsupported field type: {data.field_type}")
        if data.required_mode not in REQUIRED_MODES:
            raise InvalidSchemaOperationError(f"Unsupported required mode: {data.required_mode}")

    def _registry_schema(self, registry_id: UUID) -> dict[str, object]:
        registry = dict(self.repository.get_registry(registry_id))
        registry["blocks"] = [
            self._block_with_fields(block) for block in self.repository.list_blocks(registry_id)
        ]
        return registry

    def _block_with_fields(self, block: dict[str, object]) -> dict[str, object]:
        result = dict(block)
        result["fields"] = self.repository.list_fields(cast(UUID, block["id"]))
        return result

    def _block_by_id(self, block_id: UUID) -> dict[str, object]:
        return self.repository.get_block(block_id)

    def _field_by_id(self, field_id: UUID) -> dict[str, object]:
        return self.repository.get_field(field_id)

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
