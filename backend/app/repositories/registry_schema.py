from collections.abc import Callable
from datetime import UTC, datetime
from typing import Protocol, cast
from uuid import UUID, uuid4

from app.models.registry_schema import FormBlock, FormField, Registry


class RegistrySchemaSessionLike(Protocol):
    def add(self, instance: object) -> None:
        """Stage an ORM instance for persistence."""

    def flush(self) -> None:
        """Flush pending ORM changes."""

    def get(self, model: type[object], identity: object) -> object | None:
        """Load an ORM instance by primary key."""


class SQLAlchemyRegistrySchemaRepository:
    def __init__(
        self,
        session: RegistrySchemaSessionLike,
        *,
        now_provider: Callable[[], datetime] | None = None,
    ) -> None:
        self.session = session
        self.now_provider = now_provider or (lambda: datetime.now(UTC))

    def create_registry(self, *, code: str, name: str, created_by: UUID | None) -> UUID:
        registry_id = uuid4()
        registry = Registry(
            id=registry_id,
            code=code,
            name=name,
            lifecycle_status="active",
            schema_version=1,
            created_by=created_by,
        )
        self.session.add(registry)
        self.session.flush()
        return registry_id

    def create_block(
        self,
        *,
        registry_id: UUID,
        code: str,
        title: str,
        created_by: UUID | None,
    ) -> UUID:
        block_id = uuid4()
        block = FormBlock(
            id=block_id,
            registry_id=registry_id,
            code=code,
            title=title,
            position=0,
            is_repeatable=False,
            is_system=False,
            is_locked=False,
            is_active=True,
            is_admin_only=False,
            public_visible=True,
            public_editable=False,
            display_mode="section",
            created_by=created_by,
        )
        self.session.add(block)
        self.session.flush()
        return block_id

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
        field_id = uuid4()
        field = FormField(
            id=field_id,
            block_id=block_id,
            code=code,
            label=label,
            field_type=field_type,
            position=0,
            required_mode=required_mode,
            is_system=False,
            is_locked=False,
            is_active=True,
            is_searchable=False,
            is_filterable=False,
            is_sortable=False,
            is_list_display=False,
            is_exportable=True,
            sensitivity_level="normal",
            public_visible=True,
            public_editable=False,
            created_by=created_by,
        )
        self.session.add(field)
        self.session.flush()
        return field_id

    def archive_field(self, field_id: UUID) -> None:
        field = self.session.get(FormField, field_id)
        if field is None:
            raise LookupError(f"Form field not found: {field_id}")
        typed_field = cast(FormField, field)
        typed_field.is_active = False
        typed_field.archived_at = self.now_provider()
        self.session.flush()

    def archive_block(self, block_id: UUID) -> None:
        block = self.session.get(FormBlock, block_id)
        if block is None:
            raise LookupError(f"Form block not found: {block_id}")
        typed_block = cast(FormBlock, block)
        typed_block.is_active = False
        typed_block.archived_at = self.now_provider()
        self.session.flush()
