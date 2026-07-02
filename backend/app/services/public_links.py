import hashlib
import secrets
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    Card,
    CardBlockInstance,
    CardPublicLink,
    FieldValue,
    FieldValueItem,
    FormBlock,
    FormField,
)
from app.services.audit import AuditService
from app.services.cards import CardService, CardServiceError
from app.services.permissions import PermissionDeniedError, PermissionService
from app.services.references import ReferenceListError, ReferenceListService

DEFAULT_PUBLIC_LINK_TTL_DAYS = 7


class PublicLinkError(ValueError):
    """Raised when a public link cannot be used."""


@dataclass(frozen=True)
class PublicLinkToken:
    raw_token: str
    public_link: CardPublicLink


@dataclass(frozen=True)
class PublicPreviewOption:
    id: UUID
    code: str
    label: str


@dataclass(frozen=True)
class PublicPreviewField:
    field_id: UUID
    code: str
    label: str
    field_type: str
    value: object | None
    options_source_type: str | None
    options_source_id: UUID | None
    options_config_json: dict[str, Any] | None = None
    display_config_json: dict[str, Any] | None = None
    options: list[PublicPreviewOption] = field(default_factory=list)


@dataclass(frozen=True)
class PublicPreviewBlockInstance:
    block_instance_id: UUID | None
    ordinal: int
    fields: list[PublicPreviewField] = field(default_factory=list)


@dataclass(frozen=True)
class PublicPreviewBlock:
    block_id: UUID
    code: str
    title: str
    layout_columns: int
    instances: list[PublicPreviewBlockInstance] = field(default_factory=list)


@dataclass(frozen=True)
class PublicLinkPreview:
    card_id: UUID
    display_name: str
    expires_at: datetime
    can_edit: bool
    blocks: list[PublicPreviewBlock] = field(default_factory=list)


def hash_public_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


class PublicLinkService:
    def __init__(self, session: Session) -> None:
        self.session = session

    def create_public_link_for_actor(
        self,
        *,
        actor_user_id: UUID,
        card_id: UUID,
        expires_in_days: int = DEFAULT_PUBLIC_LINK_TTL_DAYS,
        max_attachment_uploads: int | None = None,
    ) -> PublicLinkToken:
        if expires_in_days < 1 or expires_in_days > 30:
            raise PublicLinkError("Public link expiration must be between 1 and 30 days.")
        if max_attachment_uploads is not None and max_attachment_uploads < 0:
            raise PublicLinkError("Public attachment upload limit must not be negative.")
        card = self._get_active_card(card_id)
        self._require_card_permission(actor_user_id, card)

        raw_token = secrets.token_urlsafe(32)
        public_link = CardPublicLink(
            card_id=card.id,
            token_hash=hash_public_token(raw_token),
            expires_at=datetime.now(UTC) + timedelta(days=expires_in_days),
            max_attachment_uploads=max_attachment_uploads,
            created_by=actor_user_id,
        )
        self.session.add(public_link)
        self.session.flush()
        AuditService(self.session).record_user_event(
            actor_user_id=actor_user_id,
            action="create",
            object_type="card_public_link",
            object_id=public_link.id,
            new_data_json={
                "card_id": str(card.id),
                "expires_at": public_link.expires_at.isoformat(),
                "max_attachment_uploads": max_attachment_uploads,
            },
        )
        return PublicLinkToken(raw_token=raw_token, public_link=public_link)

    def list_public_links_for_actor(
        self,
        *,
        actor_user_id: UUID,
        card_id: UUID,
    ) -> list[CardPublicLink]:
        card = self._get_active_card(card_id)
        self._require_card_permission(actor_user_id, card)
        return list(
            self.session.scalars(
                select(CardPublicLink)
                .where(CardPublicLink.card_id == card.id)
                .order_by(CardPublicLink.created_at.desc(), CardPublicLink.id)
            ).all()
        )

    def disable_public_link_for_actor(
        self,
        *,
        actor_user_id: UUID,
        public_link_id: UUID,
    ) -> CardPublicLink:
        public_link = self.session.get(CardPublicLink, public_link_id)
        if public_link is None:
            raise PublicLinkError("Public link was not found.")

        card = self._get_active_card(public_link.card_id)
        self._require_card_permission(actor_user_id, card)
        public_link.status = "disabled"
        public_link.disabled_at = datetime.now(UTC)
        self.session.flush()
        AuditService(self.session).record_user_event(
            actor_user_id=actor_user_id,
            action="disable",
            object_type="card_public_link",
            object_id=public_link.id,
            new_data_json={"card_id": str(card.id)},
        )
        return public_link

    def validate_public_edit_token(self, *, raw_token: str) -> CardPublicLink:
        public_link = self._get_active_public_link(raw_token)
        self._require_field_edit_usage_available(public_link)
        return public_link

    def validate_public_attachment_token(self, *, raw_token: str) -> CardPublicLink:
        return self._get_active_public_link(raw_token)

    def preview_public_link(self, *, raw_token: str) -> PublicLinkPreview:
        public_link = self._get_active_public_link(raw_token)
        card = self._get_active_card(public_link.card_id)
        if not public_link.can_edit or not card.public_edit_enabled:
            raise PermissionDeniedError("Public editing is disabled for this card.")

        schema_rows = self._public_schema_rows(
            registry_id=card.registry_id,
            public_link=public_link,
        )
        field_ids = [field_model.id for _, field_model in schema_rows]
        values_by_instance_field = self._field_values_by_instance(
            card_id=card.id,
            field_ids=field_ids,
        )
        item_ids_by_value_id = self._multi_select_item_ids(list(values_by_instance_field.values()))
        instances_by_block = self._block_instances_for_card(card.id)
        blocks: list[PublicPreviewBlock] = []

        for block in self._ordered_public_blocks(schema_rows):
            instances = instances_by_block.get(block.id) or [
                CardBlockInstance(card_id=card.id, block_id=block.id, ordinal=0)
            ]
            block_fields = [
                field_model for row_block, field_model in schema_rows if row_block.id == block.id
            ]
            preview_instances: list[PublicPreviewBlockInstance] = []
            for instance in instances:
                preview_fields = [
                    self._field_preview(
                        field_model=field_model,
                        field_value=(
                            values_by_instance_field.get((instance.id, field_model.id))
                            if instance.id is not None
                            else None
                        ),
                        item_ids_by_value_id=item_ids_by_value_id,
                        registry_id=card.registry_id,
                        organization_id=card.organization_id,
                    )
                    for field_model in block_fields
                ]
                preview_instances.append(
                    PublicPreviewBlockInstance(
                        block_instance_id=instance.id,
                        ordinal=instance.ordinal,
                        fields=preview_fields,
                    )
                )
            blocks.append(
                PublicPreviewBlock(
                    block_id=block.id,
                    code=block.code,
                    title=block.title,
                    layout_columns=block.layout_columns,
                    instances=preview_instances,
                )
            )

        return PublicLinkPreview(
            card_id=card.id,
            display_name=card.display_name,
            expires_at=public_link.expires_at,
            can_edit=public_link.can_edit and card.public_edit_enabled,
            blocks=blocks,
        )

    def edit_card_field_with_token(
        self,
        *,
        raw_token: str,
        field_id: UUID,
        value: object,
        block_instance_id: UUID | None = None,
    ) -> FieldValue:
        public_link = self._get_active_public_link(raw_token)
        self._require_field_edit_usage_available(public_link)
        card = self._get_active_card(public_link.card_id)
        field = self._get_active_public_field(field_id)
        block = self._get_public_block(field.block_id)

        if block.registry_id != card.registry_id:
            raise PermissionDeniedError("Public link cannot edit fields from another registry.")
        if not public_link.can_edit or not card.public_edit_enabled:
            raise PermissionDeniedError("Public editing is disabled for this card.")
        if not block.public_editable or not field.public_editable:
            raise PermissionDeniedError("Field is not public editable.")
        if not self._public_link_allows(public_link.allowed_blocks_json, block.id):
            raise PermissionDeniedError("Public link cannot edit this block.")
        if not self._public_link_allows(public_link.allowed_fields_json, field.id):
            raise PermissionDeniedError("Public link cannot edit this field.")
        if field.field_type == "file_ref":
            raise PermissionDeniedError("Public links cannot edit file reference fields.")
        if field.field_type == "static_text":
            raise PermissionDeniedError("Public links cannot edit static text fields.")

        field_value = CardService(self.session).set_field_value_from_public_link(
            actor_public_link_id=public_link.id,
            card_id=card.id,
            field_id=field.id,
            value=value,
            block_instance_id=block_instance_id,
        )
        public_link.used_count += 1
        self.session.flush()
        AuditService(self.session).record_public_link_event(
            actor_public_link_id=public_link.id,
            action="public_link.update",
            object_type="field_value",
            object_id=field_value.id,
            new_data_json={"card_id": str(card.id), "field_id": str(field.id)},
        )
        return field_value

    def _get_active_public_link(self, raw_token: str) -> CardPublicLink:
        token_hash = hash_public_token(raw_token)
        public_link = self.session.scalars(
            select(CardPublicLink).where(CardPublicLink.token_hash == token_hash)
        ).one_or_none()
        if public_link is None:
            raise PublicLinkError("Public link was not found.")

        now = datetime.now(UTC)
        if public_link.status != "active" or public_link.expires_at <= now:
            if public_link.expires_at <= now and public_link.status == "active":
                public_link.status = "expired"
                self.session.flush()
            raise PermissionDeniedError("Public link is not active.")
        return public_link

    def _require_field_edit_usage_available(self, public_link: CardPublicLink) -> None:
        if public_link.max_uses is not None and public_link.used_count >= public_link.max_uses:
            raise PermissionDeniedError("Public link usage limit is exhausted.")

    def _get_active_card(self, card_id: UUID) -> Card:
        card = self.session.get(Card, card_id)
        if (
            card is None
            or card.archived_at is not None
            or card.lifecycle_status in {"archived", "superseded"}
        ):
            raise CardServiceError("Card was not found.")
        return card

    def _require_card_permission(self, actor_user_id: UUID, card: Card) -> None:
        if not PermissionService(self.session).has_permission(
            actor_user_id,
            "cards.manage",
            organization_id=card.organization_id,
            registry_id=card.registry_id,
        ):
            raise PermissionDeniedError("Actor cannot manage public links for this card.")

    def _get_active_public_field(self, field_id: UUID) -> FormField:
        field = self.session.get(FormField, field_id)
        if field is None or field.archived_at is not None or not field.is_active:
            raise PublicLinkError("Field was not found.")
        return field

    def _get_public_block(self, block_id: UUID) -> FormBlock:
        block = self.session.get(FormBlock, block_id)
        if block is None or block.archived_at is not None or not block.is_active:
            raise PublicLinkError("Block was not found.")
        return block

    def _public_link_allows(self, allowed_json: dict[str, Any] | None, object_id: UUID) -> bool:
        if not allowed_json:
            return True
        allowed_ids = allowed_json.get("ids")
        if not isinstance(allowed_ids, list):
            return True
        return str(object_id) in allowed_ids

    def _public_schema_rows(
        self,
        *,
        registry_id: UUID,
        public_link: CardPublicLink,
    ) -> list[tuple[FormBlock, FormField]]:
        rows = self.session.execute(
            select(FormBlock, FormField)
            .join(FormField, FormField.block_id == FormBlock.id)
            .where(
                FormBlock.registry_id == registry_id,
                FormBlock.archived_at.is_(None),
                FormBlock.is_active.is_(True),
                FormBlock.public_visible.is_(True),
                FormField.archived_at.is_(None),
                FormField.is_active.is_(True),
                FormField.public_visible.is_(True),
            )
            .order_by(FormBlock.position, FormBlock.code, FormField.position, FormField.code)
        )
        return [
            (block, field_model)
            for block, field_model in rows
            if self._public_link_allows(public_link.allowed_blocks_json, block.id)
            and self._public_link_allows(public_link.allowed_fields_json, field_model.id)
            and (
                (block.public_editable and field_model.public_editable)
                or field_model.field_type == "static_text"
            )
        ]

    def _ordered_public_blocks(
        self,
        schema_rows: list[tuple[FormBlock, FormField]],
    ) -> list[FormBlock]:
        blocks_by_id: dict[UUID, FormBlock] = {}
        for block, _ in schema_rows:
            blocks_by_id.setdefault(block.id, block)
        return list(blocks_by_id.values())

    def _field_values_by_instance(
        self,
        *,
        card_id: UUID,
        field_ids: list[UUID],
    ) -> dict[tuple[UUID, UUID], FieldValue]:
        if not field_ids:
            return {}
        return {
            (value.block_instance_id, value.field_id): value
            for value in self.session.scalars(
                select(FieldValue).where(
                    FieldValue.card_id == card_id,
                    FieldValue.field_id.in_(field_ids),
                )
            ).all()
        }

    def _block_instances_for_card(self, card_id: UUID) -> dict[UUID, list[CardBlockInstance]]:
        instances: dict[UUID, list[CardBlockInstance]] = {}
        for instance in self.session.scalars(
            select(CardBlockInstance)
            .where(
                CardBlockInstance.card_id == card_id,
                CardBlockInstance.archived_at.is_(None),
            )
            .order_by(CardBlockInstance.block_id, CardBlockInstance.ordinal)
        ):
            instances.setdefault(instance.block_id, []).append(instance)
        return instances

    def _multi_select_item_ids(
        self,
        field_values: list[FieldValue],
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

    def _field_preview(
        self,
        *,
        field_model: FormField,
        field_value: FieldValue | None,
        item_ids_by_value_id: dict[UUID, list[UUID]],
        registry_id: UUID,
        organization_id: UUID,
    ) -> PublicPreviewField:
        return PublicPreviewField(
            field_id=field_model.id,
            code=field_model.code,
            label=field_model.label,
            field_type=field_model.field_type,
            value=self._read_field_value(field_model, field_value, item_ids_by_value_id),
            options_source_type=field_model.options_source_type,
            options_source_id=field_model.options_source_id,
            options_config_json=field_model.options_config_json,
            display_config_json=field_model.display_config_json,
            options=self._reference_options(
                field_model,
                registry_id=registry_id,
                organization_id=organization_id,
            ),
        )

    def _reference_options(
        self,
        field_model: FormField,
        *,
        registry_id: UUID,
        organization_id: UUID,
    ) -> list[PublicPreviewOption]:
        if (
            field_model.field_type not in {"select", "multi_select"}
            or field_model.options_source_type != "reference_list"
            or field_model.options_source_id is None
        ):
            return []

        try:
            items = ReferenceListService(self.session).list_effective_items_for_field(
                field_model=field_model,
                registry_id=registry_id,
                organization_id=organization_id,
            )
        except ReferenceListError as exc:
            raise PublicLinkError(str(exc)) from exc

        return [PublicPreviewOption(id=item.id, code=item.code, label=item.label) for item in items]

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
        if field_model.field_type == "organization_ref":
            return field_value.value_organization_id
        if field_model.field_type == "org_unit_ref":
            return field_value.value_org_unit_id
        if field_model.field_type == "user_ref":
            return field_value.value_user_id
        if field_model.field_type == "card_ref":
            return field_value.value_card_id
        if field_model.field_type == "registry_ref":
            return field_value.value_registry_id
        return None
