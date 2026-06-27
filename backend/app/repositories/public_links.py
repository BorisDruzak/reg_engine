from collections.abc import Callable, Sequence
from datetime import UTC, datetime
from typing import Protocol, cast
from uuid import UUID, uuid4

from sqlalchemy import delete, select

from app.models.card import Card, CardBlockInstance, FieldValue, FieldValueItem
from app.models.public_link import CardPublicLink
from app.models.reference import ReferenceItem
from app.models.registry_schema import FormBlock, FormField


class ScalarResultLike(Protocol):
    def all(self) -> list[object]:
        """Return scalar result values."""

    def first(self) -> object | None:
        """Return the first scalar result."""


class ExecuteResultLike(Protocol):
    def scalars(self) -> ScalarResultLike:
        """Return scalar result wrapper."""


class PublicLinkSessionLike(Protocol):
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


class SQLAlchemyPublicLinkRepository:
    def __init__(
        self,
        session: PublicLinkSessionLike,
        *,
        now_provider: Callable[[], datetime] | None = None,
    ) -> None:
        self.session = session
        self.now_provider = now_provider or (lambda: datetime.now(UTC))

    def get_card(self, card_id: UUID) -> dict[str, object]:
        card = self.session.get(Card, card_id)
        if card is None:
            raise LookupError(f"Card not found: {card_id}")
        typed_card = cast(Card, card)
        return {
            "id": typed_card.id,
            "organization_id": typed_card.organization_id,
            "public_view_enabled": typed_card.public_view_enabled,
            "public_edit_enabled": typed_card.public_edit_enabled,
        }

    def create_public_link(
        self,
        *,
        card_id: UUID,
        token_hash: str,
        can_view: bool,
        can_edit: bool,
        expires_at: datetime,
        max_uses: int | None,
        created_by: UUID | None,
    ) -> UUID:
        link_id = uuid4()
        link = CardPublicLink(
            id=link_id,
            card_id=card_id,
            token_hash=token_hash,
            status="active",
            can_view=can_view,
            can_edit=can_edit,
            expires_at=expires_at,
            max_uses=max_uses,
            used_count=0,
            created_by=created_by,
        )
        self.session.add(link)
        self.session.flush()
        return link_id

    def get_public_link(self, link_id: UUID) -> dict[str, object]:
        link = self.session.get(CardPublicLink, link_id)
        if link is None:
            raise LookupError(f"Public link not found: {link_id}")
        return self._link_to_dict(cast(CardPublicLink, link))

    def list_public_links(self, card_id: UUID) -> list[dict[str, object]]:
        result = self.session.execute(
            select(CardPublicLink)
            .where(CardPublicLink.card_id == card_id)
            .order_by(CardPublicLink.created_at.desc())
        )
        return [self._link_to_dict(cast(CardPublicLink, link)) for link in result.scalars().all()]

    def get_public_link_by_token_hash(self, token_hash: str) -> dict[str, object] | None:
        link = (
            self.session.execute(
                select(CardPublicLink).where(CardPublicLink.token_hash == token_hash)
            )
            .scalars()
            .first()
        )
        if link is None:
            return None
        return self._link_to_dict(cast(CardPublicLink, link))

    def disable_public_link(self, *, link_id: UUID, disabled_at: datetime) -> None:
        link = self._get_public_link_model(link_id)
        link.status = "disabled"
        link.disabled_at = disabled_at
        self.session.flush()

    def get_public_field_access(
        self,
        *,
        block_instance_id: UUID,
        field_id: UUID,
    ) -> dict[str, object]:
        block_instance = self.session.get(CardBlockInstance, block_instance_id)
        if block_instance is None:
            raise LookupError(f"Card block instance not found: {block_instance_id}")
        field = self.session.get(FormField, field_id)
        if field is None:
            raise LookupError(f"Form field not found: {field_id}")
        block = self.session.get(FormBlock, cast(CardBlockInstance, block_instance).block_id)
        if block is None:
            raise LookupError(f"Form block not found for instance: {block_instance_id}")
        typed_field = cast(FormField, field)
        typed_block = cast(FormBlock, block)
        return {
            "field_type": typed_field.field_type,
            "options_source_type": typed_field.options_source_type,
            "options_source_id": typed_field.options_source_id,
            "block_public_editable": typed_block.public_editable,
            "field_public_editable": typed_field.public_editable,
        }

    def upsert_field_value(
        self,
        *,
        card_id: UUID,
        block_instance_id: UUID,
        field_id: UUID,
        values: dict[str, object],
        updated_by_public_link_id: UUID,
    ) -> UUID:
        _ = updated_by_public_link_id
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
            self.session.flush()
            return field_value.id

        field_value_id = uuid4()
        field_value = FieldValue(
            id=field_value_id,
            card_id=card_id,
            block_instance_id=block_instance_id,
            field_id=field_id,
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
        self.session.add_all(
            [
                FieldValueItem(
                    id=uuid4(),
                    field_value_id=field_value_id,
                    reference_item_id=reference_item_id,
                    position=position,
                )
                for position, reference_item_id in enumerate(reference_item_ids)
            ]
        )
        self.session.flush()

    def reference_item_belongs_to_list(
        self,
        *,
        reference_item_id: UUID,
        reference_list_id: UUID,
    ) -> bool:
        item = self.session.get(ReferenceItem, reference_item_id)
        if item is None:
            return False
        typed_item = cast(ReferenceItem, item)
        return (
            typed_item.list_id == reference_list_id
            and typed_item.archived_at is None
            and typed_item.is_active
        )

    def increment_public_link_usage(self, link_id: UUID) -> None:
        link = self._get_public_link_model(link_id)
        link.used_count += 1
        self.session.flush()

    def _get_public_link_model(self, link_id: UUID) -> CardPublicLink:
        link = self.session.get(CardPublicLink, link_id)
        if link is None:
            raise LookupError(f"Public link not found: {link_id}")
        return cast(CardPublicLink, link)

    def _link_to_dict(self, link: CardPublicLink) -> dict[str, object]:
        return {
            "id": link.id,
            "card_id": link.card_id,
            "token_hash": link.token_hash,
            "status": link.status,
            "can_view": link.can_view,
            "can_edit": link.can_edit,
            "expires_at": link.expires_at,
            "max_uses": link.max_uses,
            "used_count": link.used_count,
        }
