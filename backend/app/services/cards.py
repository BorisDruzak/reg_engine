from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Protocol, cast
from uuid import UUID

from app.domain.constants import FIELD_TYPES
from app.services.permissions import AccessDeniedError, ActorContext, PermissionService


class InvalidCardOperationError(ValueError):
    """Raised when a card operation violates schema or value rules."""


@dataclass(frozen=True)
class CardCreate:
    registry_id: UUID
    organization_id: UUID
    org_unit_id: UUID | None
    display_name: str


@dataclass(frozen=True)
class FieldValueWrite:
    card_id: UUID
    block_instance_id: UUID
    field_id: UUID
    value: object


class CardRepository(Protocol):
    def create_card(
        self,
        *,
        registry_id: UUID,
        organization_id: UUID,
        org_unit_id: UUID | None,
        display_name: str,
        created_by: UUID | None,
    ) -> UUID:
        """Create a card and return its id."""

    def get_card(self, card_id: UUID) -> dict[str, object]:
        """Return card attributes."""

    def archive_card(self, *, card_id: UUID, archived_by: UUID | None, reason: str | None) -> None:
        """Archive a card without deleting values."""

    def create_block_instance(
        self,
        *,
        card_id: UUID,
        block_id: UUID,
        ordinal: int,
        created_by: UUID | None,
    ) -> UUID:
        """Create a card block instance and return its id."""

    def get_field_schema(self, field_id: UUID) -> dict[str, object]:
        """Return field schema attributes."""

    def upsert_field_value(
        self,
        *,
        card_id: UUID,
        block_instance_id: UUID,
        field_id: UUID,
        values: dict[str, object],
        updated_by: UUID | None,
    ) -> UUID:
        """Create or update a typed field value and return its id."""

    def replace_field_value_items(
        self,
        *,
        field_value_id: UUID,
        reference_item_ids: tuple[UUID, ...],
    ) -> None:
        """Replace multi-select rows for a field value."""


class CardService:
    def __init__(
        self,
        repository: CardRepository,
        permission_service: PermissionService,
    ) -> None:
        self.repository = repository
        self.permission_service = permission_service

    def create_card(self, actor: ActorContext, data: CardCreate) -> UUID:
        self._require_card_access(actor, data.organization_id)
        return self.repository.create_card(
            registry_id=data.registry_id,
            organization_id=data.organization_id,
            org_unit_id=data.org_unit_id,
            display_name=data.display_name,
            created_by=actor.user_id,
        )

    def archive_card(
        self,
        actor: ActorContext,
        *,
        card_id: UUID,
        reason: str | None = None,
    ) -> None:
        card = self.repository.get_card(card_id)
        self._require_card_access(actor, cast(UUID, card["organization_id"]))
        self.repository.archive_card(card_id=card_id, archived_by=actor.user_id, reason=reason)

    def create_block_instance(
        self,
        actor: ActorContext,
        *,
        card_id: UUID,
        block_id: UUID,
        ordinal: int = 0,
    ) -> UUID:
        card = self.repository.get_card(card_id)
        self._require_card_access(actor, cast(UUID, card["organization_id"]))
        return self.repository.create_block_instance(
            card_id=card_id,
            block_id=block_id,
            ordinal=ordinal,
            created_by=actor.user_id,
        )

    def write_field_value(self, actor: ActorContext, data: FieldValueWrite) -> UUID:
        card = self.repository.get_card(data.card_id)
        self._require_card_access(actor, cast(UUID, card["organization_id"]))
        field = self.repository.get_field_schema(data.field_id)
        field_type = str(field["field_type"])
        if field_type not in FIELD_TYPES:
            raise InvalidCardOperationError(f"Unsupported field type: {field_type}")

        typed_values, multi_select_items = self._build_typed_values(field_type, data.value)
        field_value_id = self.repository.upsert_field_value(
            card_id=data.card_id,
            block_instance_id=data.block_instance_id,
            field_id=data.field_id,
            values=typed_values,
            updated_by=actor.user_id,
        )
        if multi_select_items is not None:
            self.repository.replace_field_value_items(
                field_value_id=field_value_id,
                reference_item_ids=multi_select_items,
            )
        return field_value_id

    def _require_card_access(self, actor: ActorContext, organization_id: UUID) -> None:
        if not self.permission_service.can_manage_organization(actor, organization_id):
            raise AccessDeniedError("Actor cannot manage cards outside organization scope.")

    def _build_typed_values(
        self,
        field_type: str,
        value: object,
    ) -> tuple[dict[str, object], tuple[UUID, ...] | None]:
        values = self._empty_typed_values()
        multi_select_items: tuple[UUID, ...] | None = None

        if field_type in {"text", "textarea"}:
            if not isinstance(value, str):
                raise InvalidCardOperationError("Text fields require a string value.")
            values["value_text"] = value
        elif field_type == "integer":
            if not isinstance(value, int) or isinstance(value, bool):
                raise InvalidCardOperationError("Integer fields require an integer value.")
            values["value_number"] = Decimal(value)
        elif field_type == "decimal":
            values["value_number"] = self._to_decimal(value)
        elif field_type == "date":
            if not isinstance(value, date) or isinstance(value, datetime):
                raise InvalidCardOperationError("Date fields require a date value.")
            values["value_date"] = value
        elif field_type == "datetime":
            if not isinstance(value, datetime):
                raise InvalidCardOperationError("Datetime fields require a datetime value.")
            values["value_datetime"] = value
        elif field_type == "boolean":
            if not isinstance(value, bool):
                raise InvalidCardOperationError("Boolean fields require a bool value.")
            values["value_bool"] = value
        elif field_type == "select":
            values["value_reference_item_id"] = self._require_uuid(value, "Select fields")
        elif field_type == "multi_select":
            multi_select_items = self._require_uuid_sequence(value, "Multi-select fields")
        elif field_type == "organization_ref":
            values["value_organization_id"] = self._require_uuid(value, "Organization fields")
        elif field_type == "org_unit_ref":
            values["value_org_unit_id"] = self._require_uuid(value, "Org unit fields")
        elif field_type == "user_ref":
            values["value_user_id"] = self._require_uuid(value, "User fields")
        elif field_type == "card_ref":
            values["value_card_id"] = self._require_uuid(value, "Card reference fields")
        elif field_type == "registry_ref":
            values["value_registry_id"] = self._require_uuid(value, "Registry fields")
        else:
            raise InvalidCardOperationError(f"Unsupported field type: {field_type}")

        return values, multi_select_items

    def _empty_typed_values(self) -> dict[str, object]:
        return {
            "value_text": None,
            "value_number": None,
            "value_date": None,
            "value_datetime": None,
            "value_bool": None,
            "value_json": None,
            "value_reference_item_id": None,
            "value_card_id": None,
            "value_user_id": None,
            "value_organization_id": None,
            "value_org_unit_id": None,
            "value_registry_id": None,
        }

    def _to_decimal(self, value: object) -> Decimal:
        if isinstance(value, bool):
            raise InvalidCardOperationError("Decimal fields require a numeric value.")
        try:
            return Decimal(str(value))
        except (InvalidOperation, ValueError) as exc:
            raise InvalidCardOperationError("Decimal fields require a numeric value.") from exc

    def _require_uuid(self, value: object, field_label: str) -> UUID:
        if not isinstance(value, UUID):
            raise InvalidCardOperationError(f"{field_label} require a UUID value.")
        return value

    def _require_uuid_sequence(self, value: object, field_label: str) -> tuple[UUID, ...]:
        if isinstance(value, (str, bytes)) or not isinstance(value, Sequence):
            raise InvalidCardOperationError(f"{field_label} require UUID values.")
        values = tuple(value)
        if not all(isinstance(item, UUID) for item in values):
            raise InvalidCardOperationError(f"{field_label} require UUID values.")
        return values
