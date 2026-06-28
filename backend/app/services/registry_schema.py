from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domain.constants import FIELD_TYPES
from app.models import FormBlock, FormField, Registry
from app.services.audit import AuditService
from app.services.permissions import PermissionDeniedError, PermissionService


class RegistrySchemaError(ValueError):
    """Raised when registry schema operations reference invalid schema state."""


class RegistrySchemaService:
    def __init__(self, session: Session) -> None:
        self.session = session

    def create_registry_for_actor(
        self,
        *,
        actor_user_id: UUID,
        code: str,
        name: str,
        description: str | None = None,
    ) -> Registry:
        if not PermissionService(self.session).is_superuser(actor_user_id):
            raise PermissionDeniedError("Only a system admin can create registries.")

        registry = Registry(
            code=code,
            name=name,
            description=description,
            created_by=actor_user_id,
        )
        self.session.add(registry)
        self.session.flush()
        AuditService(self.session).record_user_event(
            actor_user_id=actor_user_id,
            action="create",
            object_type="registry",
            object_id=registry.id,
            new_data_json={"code": code, "name": name},
        )
        return registry

    def read_registry_for_actor(self, *, actor_user_id: UUID, registry_id: UUID) -> Registry:
        registry = self._get_active_registry(registry_id)
        self._require_schema_permission(actor_user_id, registry.id)
        return registry

    def read_schema_for_actor(
        self,
        *,
        actor_user_id: UUID,
        registry_id: UUID,
    ) -> tuple[Registry, list[FormBlock], list[FormField]]:
        registry = self.read_registry_for_actor(
            actor_user_id=actor_user_id,
            registry_id=registry_id,
        )
        blocks = list(
            self.session.scalars(
                select(FormBlock)
                .where(
                    FormBlock.registry_id == registry.id,
                    FormBlock.archived_at.is_(None),
                    FormBlock.is_active.is_(True),
                )
                .order_by(FormBlock.position, FormBlock.code, FormBlock.id)
            ).all()
        )
        block_ids = [block.id for block in blocks]
        fields = []
        if block_ids:
            fields = list(
                self.session.scalars(
                    select(FormField)
                    .where(
                        FormField.block_id.in_(block_ids),
                        FormField.archived_at.is_(None),
                        FormField.is_active.is_(True),
                    )
                    .order_by(FormField.position, FormField.code, FormField.id)
                ).all()
            )
        return registry, blocks, fields

    def create_block_for_actor(
        self,
        *,
        actor_user_id: UUID,
        registry_id: UUID,
        code: str,
        title: str,
        description: str | None = None,
        position: int = 0,
        is_repeatable: bool = False,
        is_system: bool = False,
        is_locked: bool = False,
        public_visible: bool = True,
        public_editable: bool = False,
    ) -> FormBlock:
        self._require_schema_permission(actor_user_id, registry_id)
        self._get_active_registry(registry_id)

        block = FormBlock(
            registry_id=registry_id,
            code=code,
            title=title,
            description=description,
            position=position,
            is_repeatable=is_repeatable,
            is_system=is_system,
            is_locked=is_locked,
            public_visible=public_visible,
            public_editable=public_editable,
            created_by=actor_user_id,
        )
        self.session.add(block)
        self.session.flush()
        AuditService(self.session).record_user_event(
            actor_user_id=actor_user_id,
            action="create",
            object_type="form_block",
            object_id=block.id,
            new_data_json={"registry_id": str(registry_id), "code": code},
        )
        return block

    def read_block_for_actor(self, *, actor_user_id: UUID, block_id: UUID) -> FormBlock:
        block = self._get_active_block(block_id)
        self._require_schema_permission(actor_user_id, block.registry_id)
        return block

    def update_block_for_actor(
        self,
        *,
        actor_user_id: UUID,
        block_id: UUID,
        title: str | None = None,
        description: str | None = None,
        position: int | None = None,
    ) -> FormBlock:
        block = self._get_active_block(block_id)
        self._ensure_mutable_block(block)
        self._require_schema_permission(actor_user_id, block.registry_id)
        old_data = {
            "title": block.title,
            "description": block.description,
            "position": block.position,
        }

        if title is not None:
            block.title = title
        if description is not None:
            block.description = description
        if position is not None:
            block.position = position
        self.session.flush()
        AuditService(self.session).record_user_event(
            actor_user_id=actor_user_id,
            action="update",
            object_type="form_block",
            object_id=block.id,
            old_data_json=old_data,
            new_data_json={
                "title": block.title,
                "description": block.description,
                "position": block.position,
            },
        )
        return block

    def archive_block_for_actor(
        self,
        *,
        actor_user_id: UUID,
        block_id: UUID,
    ) -> FormBlock:
        block = self._get_active_block(block_id)
        self._ensure_mutable_block(block)
        self._require_schema_permission(actor_user_id, block.registry_id)

        block.archived_at = datetime.now(UTC)
        block.is_active = False
        self.session.flush()
        AuditService(self.session).record_user_event(
            actor_user_id=actor_user_id,
            action="archive",
            object_type="form_block",
            object_id=block.id,
        )
        return block

    def create_field_for_actor(
        self,
        *,
        actor_user_id: UUID,
        block_id: UUID,
        code: str,
        label: str,
        field_type: str,
        description: str | None = None,
        position: int = 0,
        options_source_type: str | None = None,
        options_source_id: UUID | None = None,
        is_system: bool = False,
        is_locked: bool = False,
        public_visible: bool = True,
        public_editable: bool = False,
    ) -> FormField:
        block = self._get_active_block(block_id)
        self._require_schema_permission(actor_user_id, block.registry_id)
        self._validate_field_type(field_type)

        field = FormField(
            block_id=block_id,
            code=code,
            label=label,
            description=description,
            field_type=field_type,
            position=position,
            options_source_type=options_source_type,
            options_source_id=options_source_id,
            is_system=is_system,
            is_locked=is_locked,
            public_visible=public_visible,
            public_editable=public_editable,
            created_by=actor_user_id,
        )
        self.session.add(field)
        self.session.flush()
        AuditService(self.session).record_user_event(
            actor_user_id=actor_user_id,
            action="create",
            object_type="form_field",
            object_id=field.id,
            new_data_json={"block_id": str(block_id), "code": code, "field_type": field_type},
        )
        return field

    def read_field_for_actor(self, *, actor_user_id: UUID, field_id: UUID) -> FormField:
        field = self._get_active_field(field_id)
        block = self._get_active_block(field.block_id)
        self._require_schema_permission(actor_user_id, block.registry_id)
        return field

    def update_field_for_actor(
        self,
        *,
        actor_user_id: UUID,
        field_id: UUID,
        label: str | None = None,
        description: str | None = None,
        position: int | None = None,
        is_active: bool | None = None,
    ) -> FormField:
        field = self._get_active_field(field_id)
        block = self._get_active_block(field.block_id)
        self._ensure_mutable_field(field)
        self._require_schema_permission(actor_user_id, block.registry_id)
        old_data = {
            "label": field.label,
            "description": field.description,
            "position": field.position,
            "is_active": field.is_active,
        }

        if label is not None:
            field.label = label
        if description is not None:
            field.description = description
        if position is not None:
            field.position = position
        if is_active is not None:
            field.is_active = is_active
        self.session.flush()
        AuditService(self.session).record_user_event(
            actor_user_id=actor_user_id,
            action="update",
            object_type="form_field",
            object_id=field.id,
            old_data_json=old_data,
            new_data_json={
                "label": field.label,
                "description": field.description,
                "position": field.position,
                "is_active": field.is_active,
            },
        )
        return field

    def archive_field_for_actor(
        self,
        *,
        actor_user_id: UUID,
        field_id: UUID,
    ) -> FormField:
        field = self._get_active_field(field_id)
        block = self._get_active_block(field.block_id)
        self._ensure_mutable_field(field)
        self._require_schema_permission(actor_user_id, block.registry_id)

        field.archived_at = datetime.now(UTC)
        field.is_active = False
        self.session.flush()
        AuditService(self.session).record_user_event(
            actor_user_id=actor_user_id,
            action="archive",
            object_type="form_field",
            object_id=field.id,
        )
        return field

    def _require_schema_permission(self, actor_user_id: UUID, registry_id: UUID) -> None:
        permissions = PermissionService(self.session)
        if not permissions.has_permission(
            actor_user_id,
            "registry.schema.manage",
            registry_id=registry_id,
        ):
            raise PermissionDeniedError("Actor cannot manage registry schema.")

    def _get_active_registry(self, registry_id: UUID) -> Registry:
        registry = self.session.get(Registry, registry_id)
        if (
            registry is None
            or registry.archived_at is not None
            or registry.lifecycle_status == "archived"
        ):
            raise RegistrySchemaError("Registry was not found.")
        return registry

    def _get_active_block(self, block_id: UUID) -> FormBlock:
        block = self.session.get(FormBlock, block_id)
        if block is None or block.archived_at is not None or not block.is_active:
            raise RegistrySchemaError("Form block was not found.")
        return block

    def _get_active_field(self, field_id: UUID) -> FormField:
        field = self.session.get(FormField, field_id)
        if field is None or field.archived_at is not None or not field.is_active:
            raise RegistrySchemaError("Form field was not found.")
        return field

    def _ensure_mutable_block(self, block: FormBlock) -> None:
        if block.is_locked or block.is_system:
            raise RegistrySchemaError("Locked or system form blocks cannot be changed here.")

    def _ensure_mutable_field(self, field: FormField) -> None:
        if field.is_locked or field.is_system:
            raise RegistrySchemaError("Locked or system form fields cannot be changed here.")

    def _validate_field_type(self, field_type: str) -> None:
        if field_type not in FIELD_TYPES:
            raise RegistrySchemaError(f"Unsupported field type: {field_type}")
