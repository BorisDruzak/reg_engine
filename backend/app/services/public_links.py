import hashlib
import secrets
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Protocol, cast
from uuid import UUID

from app.domain.constants import FIELD_TYPES
from app.services.cards import build_typed_field_values
from app.services.permissions import AccessDeniedError, ActorContext, PermissionService


class PublicLinkAccessError(Exception):
    """Raised when a public link cannot access or edit a card."""


@dataclass(frozen=True)
class PublicLinkCreate:
    card_id: UUID
    can_view: bool = True
    can_edit: bool = True
    expires_at: datetime | None = None
    max_uses: int | None = None


@dataclass(frozen=True)
class PublicLinkCreated:
    link_id: UUID
    raw_token: str
    expires_at: datetime


@dataclass(frozen=True)
class PublicFieldValueWrite:
    block_instance_id: UUID
    field_id: UUID
    value: object


class PublicLinkRepository(Protocol):
    def get_card(self, card_id: UUID) -> dict[str, object]:
        """Return card attributes."""

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
        """Create a public link and return its id."""

    def get_public_link(self, link_id: UUID) -> dict[str, object]:
        """Return public link attributes by id."""

    def get_public_link_by_token_hash(self, token_hash: str) -> dict[str, object] | None:
        """Return public link attributes by token hash."""

    def disable_public_link(self, *, link_id: UUID, disabled_at: datetime) -> None:
        """Disable a public link."""

    def get_public_field_access(
        self,
        *,
        block_instance_id: UUID,
        field_id: UUID,
    ) -> dict[str, object]:
        """Return public edit flags and field type for a block/field pair."""

    def upsert_field_value(
        self,
        *,
        card_id: UUID,
        block_instance_id: UUID,
        field_id: UUID,
        values: dict[str, object],
        updated_by_public_link_id: UUID,
    ) -> UUID:
        """Create or update a public field value and return its id."""

    def replace_field_value_items(
        self,
        *,
        field_value_id: UUID,
        reference_item_ids: tuple[UUID, ...],
    ) -> None:
        """Replace multi-select item rows for a field value."""

    def increment_public_link_usage(self, link_id: UUID) -> None:
        """Increment public link usage count."""

    def record_public_link_audit(
        self,
        *,
        public_link_id: UUID,
        action: str,
        object_type: str,
        object_id: UUID | None,
        new_data: dict[str, object] | None,
    ) -> None:
        """Record an audit event for a public-link action."""


class PublicLinkService:
    def __init__(
        self,
        repository: PublicLinkRepository,
        permission_service: PermissionService,
        *,
        now_provider: Callable[[], datetime] | None = None,
        token_factory: Callable[[], str] | None = None,
    ) -> None:
        self.repository = repository
        self.permission_service = permission_service
        self.now_provider = now_provider or (lambda: datetime.now(UTC))
        self.token_factory = token_factory or (lambda: secrets.token_urlsafe(32))

    def create_link(self, actor: ActorContext, data: PublicLinkCreate) -> PublicLinkCreated:
        card = self.repository.get_card(data.card_id)
        self._require_card_management(actor, cast(UUID, card["organization_id"]))
        raw_token = self.token_factory()
        expires_at = data.expires_at or self.now_provider() + timedelta(days=7)
        link_id = self.repository.create_public_link(
            card_id=data.card_id,
            token_hash=self.hash_token(raw_token),
            can_view=data.can_view,
            can_edit=data.can_edit,
            expires_at=expires_at,
            max_uses=data.max_uses,
            created_by=actor.user_id,
        )
        self.repository.record_public_link_audit(
            public_link_id=link_id,
            action="public_link.create",
            object_type="card_public_link",
            object_id=link_id,
            new_data={"card_id": data.card_id},
        )
        return PublicLinkCreated(link_id=link_id, raw_token=raw_token, expires_at=expires_at)

    def disable_link(self, actor: ActorContext, link_id: UUID) -> None:
        link = self.repository.get_public_link(link_id)
        card = self.repository.get_card(cast(UUID, link["card_id"]))
        self._require_card_management(actor, cast(UUID, card["organization_id"]))
        self.repository.disable_public_link(link_id=link_id, disabled_at=self.now_provider())
        self.repository.record_public_link_audit(
            public_link_id=link_id,
            action="public_link.disable",
            object_type="card_public_link",
            object_id=link_id,
            new_data=None,
        )

    def update_value(self, raw_token: str, data: PublicFieldValueWrite) -> UUID:
        link = self._active_edit_link(raw_token)
        link_id = cast(UUID, link["id"])
        card_id = cast(UUID, link["card_id"])
        card = self.repository.get_card(card_id)
        if not bool(card["public_edit_enabled"]):
            raise PublicLinkAccessError("Card public editing is disabled.")

        field_access = self.repository.get_public_field_access(
            block_instance_id=data.block_instance_id,
            field_id=data.field_id,
        )
        if not bool(field_access["block_public_editable"]):
            raise PublicLinkAccessError("Block is not public editable.")
        if not bool(field_access["field_public_editable"]):
            raise PublicLinkAccessError("Field is not public editable.")

        field_type = str(field_access["field_type"])
        if field_type not in FIELD_TYPES:
            raise PublicLinkAccessError(f"Unsupported public field type: {field_type}")
        typed_values, multi_select_items = build_typed_field_values(field_type, data.value)
        field_value_id = self.repository.upsert_field_value(
            card_id=card_id,
            block_instance_id=data.block_instance_id,
            field_id=data.field_id,
            values=typed_values,
            updated_by_public_link_id=link_id,
        )
        if multi_select_items is not None:
            self.repository.replace_field_value_items(
                field_value_id=field_value_id,
                reference_item_ids=multi_select_items,
            )
        self.repository.increment_public_link_usage(link_id)
        self.repository.record_public_link_audit(
            public_link_id=link_id,
            action="public_link.value_update",
            object_type="field_value",
            object_id=field_value_id,
            new_data={"field_id": data.field_id},
        )
        return field_value_id

    def hash_token(self, raw_token: str) -> str:
        return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()

    def _active_edit_link(self, raw_token: str) -> dict[str, object]:
        link = self.repository.get_public_link_by_token_hash(self.hash_token(raw_token))
        if link is None:
            raise PublicLinkAccessError("Public link is not found.")
        if link["status"] != "active":
            raise PublicLinkAccessError("Public link is not active.")
        if not bool(link["can_edit"]):
            raise PublicLinkAccessError("Public link does not allow edits.")
        if cast(datetime, link["expires_at"]) <= self.now_provider():
            raise PublicLinkAccessError("Public link is expired.")
        max_uses = cast(int | None, link["max_uses"])
        used_count = cast(int, link["used_count"])
        if max_uses is not None and used_count >= max_uses:
            raise PublicLinkAccessError("Public link use limit is reached.")
        return link

    def _require_card_management(self, actor: ActorContext, organization_id: UUID) -> None:
        if not self.permission_service.can_manage_organization(actor, organization_id):
            raise AccessDeniedError("Actor cannot manage public links outside organization scope.")
