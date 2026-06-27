from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import Card, CardBlockInstance, FieldValue, FieldValueItem, FormBlock, FormField
from app.services.permissions import PermissionDeniedError, PermissionService
from app.services.references import ReferenceListError, ReferenceListService


class CardServiceError(ValueError):
    """Raised when card operations reference invalid card or schema state."""


class InvalidFieldValueError(ValueError):
    """Raised when a dynamic field value does not match its field configuration."""


@dataclass(frozen=True)
class CardFieldRead:
    field_id: UUID
    code: str
    field_type: str
    value: object | None


@dataclass(frozen=True)
class CardRead:
    card_id: UUID
    registry_id: UUID
    organization_id: UUID
    display_name: str
    fields: dict[str, CardFieldRead] = field(default_factory=dict)


@dataclass(frozen=True)
class _FieldAssignment:
    value_text: str | None = None
    value_number: Decimal | None = None
    value_date: date | None = None
    value_datetime: datetime | None = None
    value_bool: bool | None = None
    value_json: dict[str, Any] | None = None
    value_reference_item_id: UUID | None = None
    item_ids: list[UUID] = field(default_factory=list)


class CardService:
    def __init__(self, session: Session) -> None:
        self.session = session

    def create_card_for_actor(
        self,
        *,
        actor_user_id: UUID,
        registry_id: UUID,
        organization_id: UUID,
        display_name: str,
        org_unit_id: UUID | None = None,
    ) -> Card:
        self._require_card_permission(actor_user_id, organization_id, registry_id=registry_id)
        return self.create_card(
            registry_id=registry_id,
            organization_id=organization_id,
            display_name=display_name,
            org_unit_id=org_unit_id,
            created_by=actor_user_id,
        )

    def create_card(
        self,
        *,
        registry_id: UUID,
        organization_id: UUID,
        display_name: str,
        org_unit_id: UUID | None = None,
        created_by: UUID | None = None,
    ) -> Card:
        card = Card(
            registry_id=registry_id,
            organization_id=organization_id,
            org_unit_id=org_unit_id,
            display_name=display_name,
            lifecycle_status="draft",
            created_by=created_by,
            updated_by=created_by,
        )
        self.session.add(card)
        self.session.flush()
        return card

    def list_visible_cards(self, *, actor_user_id: UUID, registry_id: UUID) -> list[Card]:
        scope_ids = PermissionService(self.session).get_organization_scope_ids(
            actor_user_id,
            registry_id=registry_id,
        )
        if not scope_ids:
            return []

        return list(
            self.session.scalars(
                select(Card)
                .where(
                    Card.registry_id == registry_id,
                    Card.organization_id.in_(scope_ids),
                    Card.archived_at.is_(None),
                    Card.lifecycle_status != "archived",
                )
                .order_by(Card.display_name, Card.id)
            ).all()
        )

    def set_field_value_for_actor(
        self,
        *,
        actor_user_id: UUID,
        card_id: UUID,
        field_id: UUID,
        value: object,
    ) -> FieldValue:
        card = self._get_active_card(card_id)
        field_model = self._get_active_field(field_id)
        block = self._get_active_block(field_model.block_id)
        if block.registry_id != card.registry_id:
            raise CardServiceError("Field does not belong to the card registry.")

        self._require_card_permission(
            actor_user_id,
            card.organization_id,
            registry_id=card.registry_id,
        )
        assignment = self._coerce_field_assignment(field_model, value)
        block_instance = self._get_or_create_block_instance(
            card_id=card.id,
            block_id=block.id,
            created_by=actor_user_id,
        )
        field_value = self._get_or_create_field_value(
            card_id=card.id,
            block_instance_id=block_instance.id,
            field_id=field_model.id,
            actor_user_id=actor_user_id,
        )
        self._apply_assignment(field_value, assignment, actor_user_id=actor_user_id)
        self.session.flush()
        return field_value

    def read_card_for_actor(self, *, actor_user_id: UUID, card_id: UUID) -> CardRead:
        card = self._get_active_card(card_id)
        if not PermissionService(self.session).can_see_organization(
            actor_user_id,
            card.organization_id,
            registry_id=card.registry_id,
        ):
            raise PermissionDeniedError("Actor cannot read this card.")

        fields = self._active_fields_for_registry(card.registry_id)
        values_by_field_id = {
            value.field_id: value
            for value in self.session.scalars(
                select(FieldValue).where(
                    FieldValue.card_id == card.id,
                    FieldValue.field_id.in_([schema_field.id for schema_field in fields]),
                )
            ).all()
        }
        item_ids_by_value_id = self._multi_select_item_ids(list(values_by_field_id.values()))

        read_fields: dict[str, CardFieldRead] = {}
        for schema_field in fields:
            field_value = values_by_field_id.get(schema_field.id)
            read_fields[schema_field.code] = CardFieldRead(
                field_id=schema_field.id,
                code=schema_field.code,
                field_type=schema_field.field_type,
                value=self._read_field_value(
                    schema_field,
                    field_value,
                    item_ids_by_value_id,
                ),
            )

        return CardRead(
            card_id=card.id,
            registry_id=card.registry_id,
            organization_id=card.organization_id,
            display_name=card.display_name,
            fields=read_fields,
        )

    def archive_card_for_actor(self, *, actor_user_id: UUID, card_id: UUID) -> Card:
        card = self._get_active_card(card_id)
        self._require_card_permission(
            actor_user_id,
            card.organization_id,
            registry_id=card.registry_id,
        )
        card.archived_at = datetime.now(UTC)
        card.archived_by = actor_user_id
        card.lifecycle_status = "archived"
        self.session.flush()
        return card

    def _require_card_permission(
        self,
        actor_user_id: UUID,
        organization_id: UUID,
        *,
        registry_id: UUID,
    ) -> None:
        if not PermissionService(self.session).has_permission(
            actor_user_id,
            "cards.manage",
            organization_id=organization_id,
            registry_id=registry_id,
        ):
            raise PermissionDeniedError("Actor cannot manage cards in this organization scope.")

    def _get_active_card(self, card_id: UUID) -> Card:
        card = self.session.get(Card, card_id)
        if card is None or card.archived_at is not None or card.lifecycle_status == "archived":
            raise CardServiceError("Card was not found.")
        return card

    def _get_active_block(self, block_id: UUID) -> FormBlock:
        block = self.session.get(FormBlock, block_id)
        if block is None or block.archived_at is not None or not block.is_active:
            raise CardServiceError("Form block was not found.")
        return block

    def _get_active_field(self, field_id: UUID) -> FormField:
        field_model = self.session.get(FormField, field_id)
        if field_model is None or field_model.archived_at is not None or not field_model.is_active:
            raise CardServiceError("Form field was not found.")
        return field_model

    def _get_or_create_block_instance(
        self,
        *,
        card_id: UUID,
        block_id: UUID,
        created_by: UUID,
    ) -> CardBlockInstance:
        block_instance = self.session.scalars(
            select(CardBlockInstance).where(
                CardBlockInstance.card_id == card_id,
                CardBlockInstance.block_id == block_id,
                CardBlockInstance.archived_at.is_(None),
            )
        ).one_or_none()
        if block_instance is not None:
            return block_instance

        block_instance = CardBlockInstance(
            card_id=card_id,
            block_id=block_id,
            created_by=created_by,
        )
        self.session.add(block_instance)
        self.session.flush()
        return block_instance

    def _get_or_create_field_value(
        self,
        *,
        card_id: UUID,
        block_instance_id: UUID,
        field_id: UUID,
        actor_user_id: UUID,
    ) -> FieldValue:
        field_value = self.session.scalars(
            select(FieldValue).where(
                FieldValue.card_id == card_id,
                FieldValue.block_instance_id == block_instance_id,
                FieldValue.field_id == field_id,
            )
        ).one_or_none()
        if field_value is not None:
            return field_value

        field_value = FieldValue(
            card_id=card_id,
            block_instance_id=block_instance_id,
            field_id=field_id,
            created_by=actor_user_id,
            updated_by=actor_user_id,
        )
        self.session.add(field_value)
        self.session.flush()
        return field_value

    def _coerce_field_assignment(self, field_model: FormField, value: object) -> _FieldAssignment:
        if field_model.field_type == "text":
            if not isinstance(value, str):
                raise InvalidFieldValueError("Text fields require a string value.")
            return _FieldAssignment(value_text=value)

        if field_model.field_type == "number":
            try:
                return _FieldAssignment(value_number=Decimal(str(value)))
            except Exception as exc:
                raise InvalidFieldValueError("Number fields require a decimal value.") from exc

        if field_model.field_type == "date":
            if not isinstance(value, date) or isinstance(value, datetime):
                raise InvalidFieldValueError("Date fields require a date value.")
            return _FieldAssignment(value_date=value)

        if field_model.field_type == "datetime":
            if not isinstance(value, datetime):
                raise InvalidFieldValueError("Datetime fields require a datetime value.")
            return _FieldAssignment(value_datetime=value)

        if field_model.field_type == "bool":
            if not isinstance(value, bool):
                raise InvalidFieldValueError("Bool fields require a bool value.")
            return _FieldAssignment(value_bool=value)

        if field_model.field_type == "json":
            if not isinstance(value, dict):
                raise InvalidFieldValueError("JSON fields require an object value.")
            return _FieldAssignment(value_json=value)

        if field_model.field_type == "select":
            item_id = self._ensure_uuid(value, "Select fields require a reference item id.")
            self._ensure_reference_item_for_field(field_model, item_id)
            return _FieldAssignment(value_reference_item_id=item_id)

        if field_model.field_type == "multi_select":
            item_ids = self._ensure_uuid_sequence(
                value,
                "Multi-select fields require a list of reference item ids.",
            )
            for item_id in item_ids:
                self._ensure_reference_item_for_field(field_model, item_id)
            return _FieldAssignment(item_ids=item_ids)

        raise InvalidFieldValueError(f"Unsupported field type: {field_model.field_type}")

    def _ensure_uuid(self, value: object, message: str) -> UUID:
        if not isinstance(value, UUID):
            raise InvalidFieldValueError(message)
        return value

    def _ensure_uuid_sequence(self, value: object, message: str) -> list[UUID]:
        if not isinstance(value, Sequence) or isinstance(value, str | bytes):
            raise InvalidFieldValueError(message)

        item_ids: list[UUID] = []
        for item_id in value:
            if not isinstance(item_id, UUID):
                raise InvalidFieldValueError(message)
            item_ids.append(item_id)
        return item_ids

    def _ensure_reference_item_for_field(self, field_model: FormField, item_id: UUID) -> None:
        if (
            field_model.options_source_type != "reference_list"
            or field_model.options_source_id is None
        ):
            raise InvalidFieldValueError("Reference field is not configured with a reference list.")

        try:
            ReferenceListService(self.session).ensure_item_belongs_to_list(
                item_id,
                field_model.options_source_id,
            )
        except ReferenceListError as exc:
            raise InvalidFieldValueError(str(exc)) from exc

    def _apply_assignment(
        self,
        field_value: FieldValue,
        assignment: _FieldAssignment,
        *,
        actor_user_id: UUID,
    ) -> None:
        field_value.value_text = assignment.value_text
        field_value.value_number = assignment.value_number
        field_value.value_date = assignment.value_date
        field_value.value_datetime = assignment.value_datetime
        field_value.value_bool = assignment.value_bool
        field_value.value_json = assignment.value_json
        field_value.value_reference_item_id = assignment.value_reference_item_id
        field_value.value_card_id = None
        field_value.value_user_id = None
        field_value.value_organization_id = None
        field_value.value_org_unit_id = None
        field_value.value_registry_id = None
        field_value.updated_by = actor_user_id

        self.session.execute(
            delete(FieldValueItem).where(FieldValueItem.field_value_id == field_value.id)
        )
        for position, item_id in enumerate(assignment.item_ids):
            self.session.add(
                FieldValueItem(
                    field_value_id=field_value.id,
                    reference_item_id=item_id,
                    position=position,
                )
            )

    def _active_fields_for_registry(self, registry_id: UUID) -> list[FormField]:
        return list(
            self.session.scalars(
                select(FormField)
                .join(FormBlock, FormBlock.id == FormField.block_id)
                .where(
                    FormBlock.registry_id == registry_id,
                    FormBlock.archived_at.is_(None),
                    FormBlock.is_active.is_(True),
                    FormField.archived_at.is_(None),
                    FormField.is_active.is_(True),
                )
                .order_by(FormBlock.position, FormBlock.code, FormField.position, FormField.code)
            ).all()
        )

    def _multi_select_item_ids(
        self,
        field_values: Sequence[FieldValue],
    ) -> dict[UUID, list[UUID]]:
        value_ids = [field_value.id for field_value in field_values]
        if not value_ids:
            return {}

        result: dict[UUID, list[UUID]] = {}
        rows = self.session.execute(
            select(FieldValueItem.field_value_id, FieldValueItem.reference_item_id)
            .where(FieldValueItem.field_value_id.in_(value_ids))
            .order_by(FieldValueItem.position, FieldValueItem.id)
        ).all()
        for value_id, item_id in rows:
            result.setdefault(value_id, []).append(item_id)
        return result

    def _read_field_value(
        self,
        field_model: FormField,
        field_value: FieldValue | None,
        item_ids_by_value_id: dict[UUID, list[UUID]],
    ) -> object | None:
        if field_value is None:
            return None

        if field_model.field_type == "text":
            return field_value.value_text
        if field_model.field_type == "number":
            return field_value.value_number
        if field_model.field_type == "date":
            return field_value.value_date
        if field_model.field_type == "datetime":
            return field_value.value_datetime
        if field_model.field_type == "bool":
            return field_value.value_bool
        if field_model.field_type == "json":
            return field_value.value_json
        if field_model.field_type == "select":
            return field_value.value_reference_item_id
        if field_model.field_type == "multi_select":
            return item_ids_by_value_id.get(field_value.id, [])
        return None
