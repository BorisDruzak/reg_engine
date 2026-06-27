from dataclasses import dataclass
from decimal import Decimal
from typing import Protocol, cast
from uuid import UUID

from app.services.permissions import AccessDeniedError, ActorContext, PermissionService


@dataclass(frozen=True)
class CardListFilters:
    registry_id: UUID | None = None
    lifecycle_status: str | None = None
    org_unit_id: UUID | None = None
    display_name_query: str | None = None


@dataclass(frozen=True)
class CardListItem:
    id: UUID
    registry_id: UUID
    organization_id: UUID
    org_unit_id: UUID | None
    display_name: str
    lifecycle_status: str


@dataclass(frozen=True)
class CardFieldRead:
    id: UUID
    code: str
    field_type: str
    value: object


@dataclass(frozen=True)
class CardBlockRead:
    id: UUID
    code: str
    title: str
    fields: tuple[CardFieldRead, ...]


@dataclass(frozen=True)
class CardReadModel:
    id: UUID
    registry_id: UUID
    organization_id: UUID
    org_unit_id: UUID | None
    display_name: str
    lifecycle_status: str
    blocks: tuple[CardBlockRead, ...]


class CardQueryRepository(Protocol):
    def get_card(self, card_id: UUID) -> dict[str, object]:
        """Return card attributes."""

    def list_schema_blocks(self, registry_id: UUID) -> list[dict[str, object]]:
        """Return active schema blocks for a registry."""

    def list_schema_fields(self, block_id: UUID) -> list[dict[str, object]]:
        """Return active fields for a schema block."""

    def list_field_values(self, card_id: UUID) -> list[dict[str, object]]:
        """Return field values saved for a card."""

    def list_field_value_items(self, field_value_id: UUID) -> list[UUID]:
        """Return multi-select item ids for a field value."""

    def list_cards(self, filters: CardListFilters) -> list[dict[str, object]]:
        """Return cards matching non-scope filters."""


class CardQueryService:
    def __init__(
        self,
        repository: CardQueryRepository,
        permission_service: PermissionService,
    ) -> None:
        self.repository = repository
        self.permission_service = permission_service

    def get_card(self, actor: ActorContext, card_id: UUID) -> CardReadModel:
        card = self.repository.get_card(card_id)
        self._require_card_visibility(actor, cast(UUID, card["organization_id"]))
        registry_id = cast(UUID, card["registry_id"])
        values_by_field_id = {
            cast(UUID, value["field_id"]): value
            for value in self.repository.list_field_values(card_id)
        }
        blocks: list[CardBlockRead] = []
        for block in self.repository.list_schema_blocks(registry_id):
            fields: list[CardFieldRead] = []
            block_id = cast(UUID, block["id"])
            for field in self.repository.list_schema_fields(block_id):
                field_id = cast(UUID, field["id"])
                field_type = str(field["field_type"])
                field_value = values_by_field_id.get(field_id)
                fields.append(
                    CardFieldRead(
                        id=field_id,
                        code=str(field["code"]),
                        field_type=field_type,
                        value=self._extract_value(field_type, field_value),
                    )
                )
            blocks.append(
                CardBlockRead(
                    id=block_id,
                    code=str(block["code"]),
                    title=str(block["title"]),
                    fields=tuple(fields),
                )
            )
        return CardReadModel(
            id=card_id,
            registry_id=registry_id,
            organization_id=cast(UUID, card["organization_id"]),
            org_unit_id=cast(UUID | None, card["org_unit_id"]),
            display_name=str(card["display_name"]),
            lifecycle_status=str(card["lifecycle_status"]),
            blocks=tuple(blocks),
        )

    def list_cards(self, actor: ActorContext, filters: CardListFilters) -> tuple[CardListItem, ...]:
        visible_cards: list[CardListItem] = []
        for card in self.repository.list_cards(filters):
            organization_id = cast(UUID, card["organization_id"])
            if not self.permission_service.can_view_organization(actor, organization_id):
                continue
            visible_cards.append(
                CardListItem(
                    id=cast(UUID, card["id"]),
                    registry_id=cast(UUID, card["registry_id"]),
                    organization_id=organization_id,
                    org_unit_id=cast(UUID | None, card["org_unit_id"]),
                    display_name=str(card["display_name"]),
                    lifecycle_status=str(card["lifecycle_status"]),
                )
            )
        return tuple(visible_cards)

    def _require_card_visibility(self, actor: ActorContext, organization_id: UUID) -> None:
        if not self.permission_service.can_view_organization(actor, organization_id):
            raise AccessDeniedError("Actor cannot view cards outside organization scope.")

    def _extract_value(self, field_type: str, field_value: dict[str, object] | None) -> object:
        if field_value is None:
            return None
        if field_type in {"text", "textarea"}:
            return field_value["value_text"]
        if field_type in {"integer", "decimal"}:
            return cast(Decimal | None, field_value["value_number"])
        if field_type == "date":
            return field_value["value_date"]
        if field_type == "datetime":
            return field_value["value_datetime"]
        if field_type == "boolean":
            return field_value["value_bool"]
        if field_type == "select":
            return field_value["value_reference_item_id"]
        if field_type == "multi_select":
            return tuple(self.repository.list_field_value_items(cast(UUID, field_value["id"])))
        if field_type == "organization_ref":
            return field_value["value_organization_id"]
        if field_type == "org_unit_ref":
            return field_value["value_org_unit_id"]
        if field_type == "user_ref":
            return field_value["value_user_id"]
        if field_type == "card_ref":
            return field_value["value_card_id"]
        if field_type == "registry_ref":
            return field_value["value_registry_id"]
        return field_value["value_json"]
