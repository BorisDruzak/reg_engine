from collections.abc import Callable, Sequence
from datetime import UTC, datetime
from typing import Protocol, cast
from uuid import UUID, uuid4

from sqlalchemy import delete, or_, select

from app.models.card import Card, CardBlockInstance, CardRelation, FieldValue, FieldValueItem
from app.models.registry_schema import FormBlock, FormField


class ScalarResultLike(Protocol):
    def all(self) -> list[object]:
        """Return scalar result values."""

    def first(self) -> object | None:
        """Return the first scalar result."""


class ExecuteResultLike(Protocol):
    def all(self) -> list[object]:
        """Return result rows."""

    def scalars(self) -> ScalarResultLike:
        """Return scalar result wrapper."""


class CardSessionLike(Protocol):
    def add(self, instance: object) -> None:
        """Stage an ORM instance for persistence."""

    def add_all(self, instances: Sequence[object]) -> None:
        """Stage ORM instances for persistence."""

    def flush(self) -> None:
        """Flush pending ORM changes."""

    def execute(self, statement: object) -> ExecuteResultLike:
        """Execute a SQLAlchemy statement."""

    def get(self, model: type[object], identity: object) -> object | None:
        """Load an ORM instance by primary key."""


class SQLAlchemyCardRepository:
    def __init__(
        self,
        session: CardSessionLike,
        *,
        now_provider: Callable[[], datetime] | None = None,
    ) -> None:
        self.session = session
        self.now_provider = now_provider or (lambda: datetime.now(UTC))

    def create_card(
        self,
        *,
        registry_id: UUID,
        organization_id: UUID,
        org_unit_id: UUID | None,
        display_name: str,
        created_by: UUID | None,
    ) -> UUID:
        card_id = uuid4()
        card = Card(
            id=card_id,
            registry_id=registry_id,
            organization_id=organization_id,
            org_unit_id=org_unit_id,
            display_name=display_name,
            lifecycle_status="active",
            public_view_enabled=False,
            public_edit_enabled=False,
            created_by=created_by,
        )
        self.session.add(card)
        self.session.flush()
        return card_id

    def get_card(self, card_id: UUID) -> dict[str, object]:
        card = self.session.get(Card, card_id)
        if card is None:
            raise LookupError(f"Card not found: {card_id}")
        return self._card_to_dict(cast(Card, card))

    def archive_card(self, *, card_id: UUID, archived_by: UUID | None, reason: str | None) -> None:
        card = self._get_card_model(card_id)
        card.lifecycle_status = "archived"
        card.archived_at = self._now()
        card.archived_by = archived_by
        card.archive_reason = reason
        self.session.flush()

    def mark_card_superseded(self, *, card_id: UUID, updated_by: UUID | None) -> None:
        card = self._get_card_model(card_id)
        card.lifecycle_status = "superseded"
        card.updated_by = updated_by
        self.session.flush()

    def create_card_relation(
        self,
        *,
        source_card_id: UUID,
        target_card_id: UUID,
        relation_type: str,
        created_by: UUID | None,
    ) -> UUID:
        relation_id = uuid4()
        relation = CardRelation(
            id=relation_id,
            source_card_id=source_card_id,
            target_card_id=target_card_id,
            relation_type=relation_type,
            created_by=created_by,
        )
        self.session.add(relation)
        self.session.flush()
        return relation_id

    def create_block_instance(
        self,
        *,
        card_id: UUID,
        block_id: UUID,
        ordinal: int,
        created_by: UUID | None,
    ) -> UUID:
        block_instance_id = uuid4()
        block_instance = CardBlockInstance(
            id=block_instance_id,
            card_id=card_id,
            block_id=block_id,
            ordinal=ordinal,
            created_by=created_by,
        )
        self.session.add(block_instance)
        self.session.flush()
        return block_instance_id

    def get_field_schema(self, field_id: UUID) -> dict[str, object]:
        field = self.session.get(FormField, field_id)
        if field is None:
            raise LookupError(f"Form field not found: {field_id}")
        return self._field_to_dict(cast(FormField, field))

    def upsert_field_value(
        self,
        *,
        card_id: UUID,
        block_instance_id: UUID,
        field_id: UUID,
        values: dict[str, object],
        updated_by: UUID | None,
    ) -> UUID:
        existing = (
            self.session.execute(
                select(FieldValue).where(
                    FieldValue.card_id == card_id,
                    FieldValue.block_instance_id == block_instance_id,
                    FieldValue.field_id == field_id,
                )
            )
            .scalars()
            .first()
        )
        if existing is not None:
            field_value = cast(FieldValue, existing)
            for key, value in values.items():
                setattr(field_value, key, value)
            field_value.updated_by = updated_by
            self.session.flush()
            return field_value.id

        field_value_id = uuid4()
        field_value = FieldValue(
            id=field_value_id,
            card_id=card_id,
            block_instance_id=block_instance_id,
            field_id=field_id,
            updated_by=updated_by,
            **values,
        )
        self.session.add(field_value)
        self.session.flush()
        return field_value_id

    def replace_field_value_items(
        self,
        *,
        field_value_id: UUID,
        reference_item_ids: tuple[UUID, ...],
    ) -> None:
        self.session.execute(
            delete(FieldValueItem).where(FieldValueItem.field_value_id == field_value_id)
        )
        items = [
            FieldValueItem(
                id=uuid4(),
                field_value_id=field_value_id,
                reference_item_id=reference_item_id,
                position=position,
            )
            for position, reference_item_id in enumerate(reference_item_ids)
        ]
        self.session.add_all(items)
        self.session.flush()

    def update_card_system_fields(
        self,
        *,
        card_id: UUID,
        display_name: str | None,
        org_unit_id: UUID | None,
        org_unit_id_set: bool,
        public_view_enabled: bool | None,
        public_edit_enabled: bool | None,
        updated_by: UUID | None,
    ) -> None:
        card = self._get_card_model(card_id)
        if display_name is not None:
            card.display_name = display_name
        if org_unit_id_set:
            card.org_unit_id = org_unit_id
        if public_view_enabled is not None:
            card.public_view_enabled = public_view_enabled
        if public_edit_enabled is not None:
            card.public_edit_enabled = public_edit_enabled
        card.updated_by = updated_by
        self.session.flush()

    def list_card_relations(self, card_id: UUID) -> list[dict[str, object]]:
        result = self.session.execute(
            select(CardRelation)
            .where(
                or_(
                    CardRelation.source_card_id == card_id,
                    CardRelation.target_card_id == card_id,
                )
            )
            .order_by(CardRelation.created_at)
        )
        return [
            self._relation_to_dict(cast(CardRelation, relation))
            for relation in result.scalars().all()
        ]

    def list_schema_blocks(self, registry_id: UUID) -> list[dict[str, object]]:
        result = self.session.execute(
            select(FormBlock)
            .where(FormBlock.registry_id == registry_id)
            .where(FormBlock.archived_at.is_(None))
            .where(FormBlock.is_active.is_(True))
            .order_by(FormBlock.position, FormBlock.title)
        )
        return [self._block_to_dict(cast(FormBlock, block)) for block in result.scalars().all()]

    def list_schema_fields(self, block_id: UUID) -> list[dict[str, object]]:
        result = self.session.execute(
            select(FormField)
            .where(FormField.block_id == block_id)
            .where(FormField.archived_at.is_(None))
            .where(FormField.is_active.is_(True))
            .order_by(FormField.position, FormField.label)
        )
        return [self._field_to_dict(cast(FormField, field)) for field in result.scalars().all()]

    def list_field_values(self, card_id: UUID) -> list[dict[str, object]]:
        result = self.session.execute(select(FieldValue).where(FieldValue.card_id == card_id))
        return [self._value_to_dict(cast(FieldValue, value)) for value in result.scalars().all()]

    def list_field_value_items(self, field_value_id: UUID) -> list[UUID]:
        result = self.session.execute(
            select(FieldValueItem.reference_item_id)
            .where(FieldValueItem.field_value_id == field_value_id)
            .order_by(FieldValueItem.position)
        )
        return [cast(UUID, value) for value in result.scalars().all()]

    def list_cards(self, filters: object) -> list[dict[str, object]]:
        statement = select(Card)
        registry_id = getattr(filters, "registry_id", None)
        lifecycle_status = getattr(filters, "lifecycle_status", None)
        org_unit_id = getattr(filters, "org_unit_id", None)
        display_name_query = getattr(filters, "display_name_query", None)
        if registry_id is not None:
            statement = statement.where(Card.registry_id == registry_id)
        if lifecycle_status is not None:
            statement = statement.where(Card.lifecycle_status == lifecycle_status)
        if org_unit_id is not None:
            statement = statement.where(Card.org_unit_id == org_unit_id)
        if display_name_query:
            statement = statement.where(Card.display_name.ilike(f"%{display_name_query}%"))
        result = self.session.execute(statement.order_by(Card.display_name))
        return [self._card_to_dict(cast(Card, card)) for card in result.scalars().all()]

    def _get_card_model(self, card_id: UUID) -> Card:
        card = self.session.get(Card, card_id)
        if card is None:
            raise LookupError(f"Card not found: {card_id}")
        return cast(Card, card)

    def _now(self) -> datetime:
        return self.now_provider()

    def _card_to_dict(self, card: Card) -> dict[str, object]:
        return {
            "id": card.id,
            "registry_id": card.registry_id,
            "organization_id": card.organization_id,
            "org_unit_id": card.org_unit_id,
            "display_name": card.display_name,
            "lifecycle_status": card.lifecycle_status,
            "public_edit_enabled": card.public_edit_enabled,
            "public_view_enabled": card.public_view_enabled,
        }

    def _relation_to_dict(self, relation: CardRelation) -> dict[str, object]:
        return {
            "id": relation.id,
            "source_card_id": relation.source_card_id,
            "target_card_id": relation.target_card_id,
            "relation_type": relation.relation_type,
        }

    def _block_to_dict(self, block: FormBlock) -> dict[str, object]:
        return {
            "id": block.id,
            "registry_id": block.registry_id,
            "code": block.code,
            "title": block.title,
        }

    def _field_to_dict(self, field: FormField) -> dict[str, object]:
        return {
            "id": field.id,
            "block_id": field.block_id,
            "code": field.code,
            "label": field.label,
            "field_type": field.field_type,
            "public_editable": field.public_editable,
        }

    def _value_to_dict(self, value: FieldValue) -> dict[str, object]:
        return {
            "id": value.id,
            "card_id": value.card_id,
            "block_instance_id": value.block_instance_id,
            "field_id": value.field_id,
            "value_text": value.value_text,
            "value_number": value.value_number,
            "value_date": value.value_date,
            "value_datetime": value.value_datetime,
            "value_bool": value.value_bool,
            "value_json": value.value_json,
            "value_reference_item_id": value.value_reference_item_id,
            "value_card_id": value.value_card_id,
            "value_user_id": value.value_user_id,
            "value_organization_id": value.value_organization_id,
            "value_org_unit_id": value.value_org_unit_id,
            "value_registry_id": value.value_registry_id,
        }
