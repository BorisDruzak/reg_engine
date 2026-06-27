from collections.abc import Callable
from datetime import UTC, datetime
from typing import Protocol, cast
from uuid import UUID, uuid4

from sqlalchemy import select

from app.models.registry_schema import FormBlock, FormField, Registry


class ScalarResultLike(Protocol):
    def all(self) -> list[object]:
        """Return scalar result values."""


class ExecuteResultLike(Protocol):
    def scalars(self) -> ScalarResultLike:
        """Return scalar result wrapper."""


class RegistrySchemaSessionLike(Protocol):
    def add(self, instance: object) -> None:
        """Stage an ORM instance for persistence."""

    def flush(self) -> None:
        """Flush pending ORM changes."""

    def get(self, model: type[object], identity: object) -> object | None:
        """Load an ORM instance by primary key."""

    def execute(self, statement: object) -> ExecuteResultLike:
        """Execute a SQLAlchemy statement."""


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

    def get_registry(self, registry_id: UUID) -> dict[str, object]:
        registry = self.session.get(Registry, registry_id)
        if registry is None:
            raise LookupError(f"Registry not found: {registry_id}")
        return self._registry_to_dict(cast(Registry, registry))

    def list_blocks(self, registry_id: UUID) -> list[dict[str, object]]:
        result = self.session.execute(
            select(FormBlock)
            .where(FormBlock.registry_id == registry_id)
            .order_by(FormBlock.position, FormBlock.title)
        )
        return [self._block_to_dict(cast(FormBlock, block)) for block in result.scalars().all()]

    def list_fields(self, block_id: UUID) -> list[dict[str, object]]:
        result = self.session.execute(
            select(FormField)
            .where(FormField.block_id == block_id)
            .order_by(FormField.position, FormField.label)
        )
        return [self._field_to_dict(cast(FormField, field)) for field in result.scalars().all()]

    def get_block(self, block_id: UUID) -> dict[str, object]:
        return self._block_to_dict(self._get_block_model(block_id))

    def get_field(self, field_id: UUID) -> dict[str, object]:
        return self._field_to_dict(self._get_field_model(field_id))

    def update_registry(
        self,
        registry_id: UUID,
        *,
        code: str | None,
        name: str | None,
    ) -> None:
        registry = self._get_registry_model(registry_id)
        if code is not None:
            registry.code = code
        if name is not None:
            registry.name = name
        self.session.flush()

    def update_block(
        self,
        block_id: UUID,
        *,
        code: str | None,
        title: str | None,
    ) -> None:
        block = self._get_block_model(block_id)
        if code is not None:
            block.code = code
        if title is not None:
            block.title = title
        self.session.flush()

    def update_field(
        self,
        field_id: UUID,
        *,
        code: str | None,
        label: str | None,
        required_mode: str | None,
    ) -> None:
        field = self._get_field_model(field_id)
        if code is not None:
            field.code = code
        if label is not None:
            field.label = label
        if required_mode is not None:
            field.required_mode = required_mode
        self.session.flush()

    def _get_registry_model(self, registry_id: UUID) -> Registry:
        registry = self.session.get(Registry, registry_id)
        if registry is None:
            raise LookupError(f"Registry not found: {registry_id}")
        return cast(Registry, registry)

    def _get_block_model(self, block_id: UUID) -> FormBlock:
        block = self.session.get(FormBlock, block_id)
        if block is None:
            raise LookupError(f"Form block not found: {block_id}")
        return cast(FormBlock, block)

    def _get_field_model(self, field_id: UUID) -> FormField:
        field = self.session.get(FormField, field_id)
        if field is None:
            raise LookupError(f"Form field not found: {field_id}")
        return cast(FormField, field)

    def _registry_to_dict(self, registry: Registry) -> dict[str, object]:
        return {
            "id": registry.id,
            "code": registry.code,
            "name": registry.name,
            "archived": registry.archived_at is not None,
        }

    def _block_to_dict(self, block: FormBlock) -> dict[str, object]:
        return {
            "id": block.id,
            "registry_id": block.registry_id,
            "code": block.code,
            "title": block.title,
            "archived": block.archived_at is not None or not block.is_active,
        }

    def _field_to_dict(self, field: FormField) -> dict[str, object]:
        return {
            "id": field.id,
            "block_id": field.block_id,
            "code": field.code,
            "label": field.label,
            "field_type": field.field_type,
            "required_mode": field.required_mode,
            "archived": field.archived_at is not None or not field.is_active,
        }
