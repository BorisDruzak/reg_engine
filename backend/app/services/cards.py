from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.models import (
    Card,
    CardAttachment,
    CardBlockInstance,
    CardRelation,
    FieldValue,
    FieldValueItem,
    FormBlock,
    FormField,
    Organization,
    OrgUnit,
    Registry,
    StoredFile,
    User,
)
from app.services.audit import AuditService
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
class FileRefValueRead:
    attachment_id: UUID
    title: str
    original_filename: str
    content_type: str
    content_length_bytes: int
    scanner_status: str
    archived_at: datetime | None


@dataclass(frozen=True)
class CardBlockInstanceRead:
    block_instance_id: UUID | None
    ordinal: int
    fields: dict[str, CardFieldRead] = field(default_factory=dict)


@dataclass(frozen=True)
class CardBlockRead:
    block_id: UUID
    code: str
    instances: list[CardBlockInstanceRead] = field(default_factory=list)


@dataclass(frozen=True)
class CardRead:
    card_id: UUID
    registry_id: UUID
    organization_id: UUID
    display_name: str
    blocks: dict[str, CardBlockRead] = field(default_factory=dict)
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
    value_card_id: UUID | None = None
    value_user_id: UUID | None = None
    value_organization_id: UUID | None = None
    value_org_unit_id: UUID | None = None
    value_registry_id: UUID | None = None
    value_attachment_id: UUID | None = None
    item_ids: list[UUID] = field(default_factory=list)


@dataclass(frozen=True)
class _CopiedFileRefAttachment:
    source_attachment_id: UUID
    target_attachment_id: UUID


@dataclass
class _CopyCardValuesResult:
    copied_file_ref_attachments: list[_CopiedFileRefAttachment] = field(default_factory=list)
    cleared_file_ref_attachment_ids: list[UUID] = field(default_factory=list)


@dataclass(frozen=True)
class BulkFieldValueInput:
    field_id: UUID
    value: object
    block_instance_id: UUID | None = None


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
        public_view_enabled: bool = False,
        public_edit_enabled: bool = False,
    ) -> Card:
        self._require_card_permission(actor_user_id, organization_id, registry_id=registry_id)
        card = self.create_card(
            registry_id=registry_id,
            organization_id=organization_id,
            display_name=display_name,
            org_unit_id=org_unit_id,
            public_view_enabled=public_view_enabled,
            public_edit_enabled=public_edit_enabled,
            created_by=actor_user_id,
        )
        AuditService(self.session).record_user_event(
            actor_user_id=actor_user_id,
            action="create",
            object_type="card",
            object_id=card.id,
            new_data_json={
                "registry_id": str(registry_id),
                "organization_id": str(organization_id),
            },
        )
        return card

    def create_card(
        self,
        *,
        registry_id: UUID,
        organization_id: UUID,
        display_name: str,
        org_unit_id: UUID | None = None,
        public_view_enabled: bool = False,
        public_edit_enabled: bool = False,
        created_by: UUID | None = None,
    ) -> Card:
        card = Card(
            registry_id=registry_id,
            organization_id=organization_id,
            org_unit_id=org_unit_id,
            display_name=display_name,
            lifecycle_status="draft",
            public_view_enabled=public_view_enabled,
            public_edit_enabled=public_edit_enabled,
            created_by=created_by,
            updated_by=created_by,
        )
        self.session.add(card)
        self.session.flush()
        return card

    def list_visible_cards(
        self,
        *,
        actor_user_id: UUID,
        registry_id: UUID,
        organization_id: UUID | None = None,
        include_archive: bool = False,
        query: str | None = None,
    ) -> list[Card]:
        scope_ids = PermissionService(self.session).get_organization_scope_ids(
            actor_user_id,
            registry_id=registry_id,
        )
        if not scope_ids:
            return []
        if organization_id is not None:
            if organization_id not in scope_ids:
                return []
            scope_ids = {organization_id}

        criteria = [
            Card.registry_id == registry_id,
            Card.organization_id.in_(scope_ids),
        ]
        if not include_archive:
            criteria.append(Card.lifecycle_status != "superseded")
            criteria.append(Card.lifecycle_status != "archived")
            criteria.append(Card.archived_at.is_(None))
        if query:
            criteria.append(Card.display_name.ilike(f"%{query}%"))

        return list(
            self.session.scalars(
                select(Card).where(*criteria).order_by(Card.display_name, Card.id)
            ).all()
        )

    def set_field_value_for_actor(
        self,
        *,
        actor_user_id: UUID,
        card_id: UUID,
        field_id: UUID,
        value: object,
        block_instance_id: UUID | None = None,
    ) -> FieldValue:
        card = self._get_editable_card(card_id)
        field_model = self._get_active_field(field_id)
        block = self._get_active_block(field_model.block_id)
        if block.registry_id != card.registry_id:
            raise CardServiceError("Field does not belong to the card registry.")

        self._require_card_permission(
            actor_user_id,
            card.organization_id,
            registry_id=card.registry_id,
        )
        assignment = self._coerce_field_assignment(
            field_model,
            value,
            card_id=card.id,
            actor_user_id=actor_user_id,
        )
        block_instance = self._resolve_block_instance_for_value(
            card=card,
            block=block,
            block_instance_id=block_instance_id,
            actor_user_id=actor_user_id,
        )
        field_value = self._get_or_create_field_value(
            card_id=card.id,
            block_instance_id=block_instance.id,
            field_id=field_model.id,
            actor_user_id=actor_user_id,
        )
        self._apply_assignment(field_value, assignment, actor_user_id=actor_user_id)
        self.session.flush()
        AuditService(self.session).record_user_event(
            actor_user_id=actor_user_id,
            action="update",
            object_type="field_value",
            object_id=field_value.id,
            new_data_json={"card_id": str(card.id), "field_id": str(field_model.id)},
        )
        return field_value

    def set_field_values_for_actor(
        self,
        *,
        actor_user_id: UUID,
        card_id: UUID,
        values: Sequence[BulkFieldValueInput],
    ) -> list[FieldValue]:
        with self.session.begin_nested():
            field_values = [
                self.set_field_value_for_actor(
                    actor_user_id=actor_user_id,
                    card_id=card_id,
                    field_id=item.field_id,
                    value=item.value,
                    block_instance_id=item.block_instance_id,
                )
                for item in values
            ]
        return field_values

    def validate_field_value_for_actor(
        self,
        *,
        actor_user_id: UUID,
        registry_id: UUID,
        organization_id: UUID,
        field_id: UUID,
        value: object,
        card_id: UUID | None = None,
    ) -> None:
        field_model = self._get_active_field(field_id)
        block = self._get_active_block(field_model.block_id)
        if block.registry_id != registry_id:
            raise CardServiceError("Field does not belong to the card registry.")

        card_context_id = card_id
        if card_id is not None:
            card = self._get_editable_card(card_id)
            if card.registry_id != registry_id:
                raise CardServiceError("Card does not belong to the import registry.")
            if card.organization_id != organization_id:
                raise CardServiceError("Card organization does not match the import row.")
            self._require_card_permission(
                actor_user_id,
                card.organization_id,
                registry_id=card.registry_id,
            )
            card_context_id = card.id
        else:
            self._require_card_permission(
                actor_user_id,
                organization_id,
                registry_id=registry_id,
            )
            if field_model.field_type == "file_ref" and value is not None:
                raise InvalidFieldValueError(
                    "File reference import preview requires an existing card attachment."
                )

        self._coerce_field_assignment(
            field_model,
            value,
            card_id=card_context_id,
            actor_user_id=actor_user_id,
        )

    def set_field_value_from_public_link(
        self,
        *,
        actor_public_link_id: UUID,
        card_id: UUID,
        field_id: UUID,
        value: object,
        block_instance_id: UUID | None = None,
    ) -> FieldValue:
        card = self._get_editable_card(card_id)
        field_model = self._get_active_field(field_id)
        block = self._get_active_block(field_model.block_id)
        if block.registry_id != card.registry_id:
            raise CardServiceError("Field does not belong to the card registry.")

        assignment = self._coerce_field_assignment(
            field_model,
            value,
            card_id=card.id,
            public_context=True,
        )
        block_instance = self._resolve_block_instance_for_value(
            card=card,
            block=block,
            block_instance_id=block_instance_id,
            actor_user_id=None,
        )
        field_value = self._get_or_create_field_value(
            card_id=card.id,
            block_instance_id=block_instance.id,
            field_id=field_model.id,
            actor_user_id=None,
        )
        self._apply_assignment(field_value, assignment, actor_user_id=None)
        self.session.flush()
        return field_value

    def update_card_for_actor(
        self,
        *,
        actor_user_id: UUID,
        card_id: UUID,
        display_name: str | None = None,
        public_view_enabled: bool | None = None,
        public_edit_enabled: bool | None = None,
    ) -> Card:
        card = self._get_editable_card(card_id)
        self._require_card_permission(
            actor_user_id,
            card.organization_id,
            registry_id=card.registry_id,
        )
        old_data = {
            "display_name": card.display_name,
            "public_view_enabled": card.public_view_enabled,
            "public_edit_enabled": card.public_edit_enabled,
        }
        if display_name is not None:
            card.display_name = display_name
        if public_view_enabled is not None:
            card.public_view_enabled = public_view_enabled
        if public_edit_enabled is not None:
            card.public_edit_enabled = public_edit_enabled
        card.updated_by = actor_user_id
        self.session.flush()
        AuditService(self.session).record_user_event(
            actor_user_id=actor_user_id,
            action="update",
            object_type="card",
            object_id=card.id,
            old_data_json=old_data,
            new_data_json={
                "display_name": card.display_name,
                "public_view_enabled": card.public_view_enabled,
                "public_edit_enabled": card.public_edit_enabled,
            },
        )
        return card

    def read_card_for_actor(
        self,
        *,
        actor_user_id: UUID,
        card_id: UUID,
        include_archive: bool = False,
    ) -> CardRead:
        card = self._get_readable_card(card_id, include_archive=include_archive)
        if not PermissionService(self.session).can_see_organization(
            actor_user_id,
            card.organization_id,
            registry_id=card.registry_id,
        ):
            raise PermissionDeniedError("Actor cannot read this card.")

        schema_rows = self._active_schema_rows_for_registry(card.registry_id)
        field_ids = [field_model.id for _, field_model in schema_rows]
        values_by_instance_field = {
            (value.block_instance_id, value.field_id): value
            for value in self.session.scalars(
                select(FieldValue).where(
                    FieldValue.card_id == card.id,
                    FieldValue.field_id.in_(field_ids),
                )
            ).all()
        }
        item_ids_by_value_id = self._multi_select_item_ids(list(values_by_instance_field.values()))
        block_instances = self._block_instances_for_card(
            card.id,
            include_archive=include_archive,
        )
        field_code_counts: dict[str, int] = {}
        for _, schema_field in schema_rows:
            field_code_counts[schema_field.code] = field_code_counts.get(schema_field.code, 0) + 1

        read_blocks: dict[str, CardBlockRead] = {}
        read_fields: dict[str, CardFieldRead] = {}
        for block, _ in schema_rows:
            if block.code not in read_blocks:
                instances = block_instances.get(block.id, [])
                if not instances:
                    instances = [
                        CardBlockInstance(
                            card_id=card.id,
                            block_id=block.id,
                            ordinal=0,
                        )
                    ]
                read_blocks[block.code] = CardBlockRead(
                    block_id=block.id,
                    code=block.code,
                    instances=[
                        CardBlockInstanceRead(
                            block_instance_id=instance.id,
                            ordinal=instance.ordinal,
                            fields={},
                        )
                        for instance in instances
                    ],
                )

        for block, schema_field in schema_rows:
            block_read = read_blocks[block.code]
            for instance_read in block_read.instances:
                field_value = None
                if instance_read.block_instance_id is not None:
                    field_value = values_by_instance_field.get(
                        (instance_read.block_instance_id, schema_field.id)
                    )
                field_read = CardFieldRead(
                    field_id=schema_field.id,
                    code=schema_field.code,
                    field_type=schema_field.field_type,
                    value=self._read_field_value(
                        schema_field,
                        field_value,
                        item_ids_by_value_id,
                    ),
                )
                instance_read.fields[schema_field.code] = field_read
                path = f"{block.code}.{schema_field.code}"
                read_fields[path] = field_read
                if field_code_counts[schema_field.code] == 1:
                    read_fields[schema_field.code] = field_read

        return CardRead(
            card_id=card.id,
            registry_id=card.registry_id,
            organization_id=card.organization_id,
            display_name=card.display_name,
            blocks=read_blocks,
            fields=read_fields,
        )

    def archive_card_for_actor(self, *, actor_user_id: UUID, card_id: UUID) -> Card:
        card = self._get_editable_card(card_id)
        self._require_card_permission(
            actor_user_id,
            card.organization_id,
            registry_id=card.registry_id,
        )
        card.archived_at = datetime.now(UTC)
        card.archived_by = actor_user_id
        card.lifecycle_status = "archived"
        self.session.flush()
        AuditService(self.session).record_user_event(
            actor_user_id=actor_user_id,
            action="archive",
            object_type="card",
            object_id=card.id,
        )
        return card

    def transfer_card_for_actor(
        self,
        *,
        actor_user_id: UUID,
        card_id: UUID,
        target_organization_id: UUID,
    ) -> Card:
        old_card = self._get_editable_card(card_id)
        if not PermissionService(self.session).is_superuser(actor_user_id):
            self._require_card_permission(
                actor_user_id,
                old_card.organization_id,
                registry_id=old_card.registry_id,
            )
            self._require_card_permission(
                actor_user_id,
                target_organization_id,
                registry_id=old_card.registry_id,
            )

        new_card = self.create_card(
            registry_id=old_card.registry_id,
            organization_id=target_organization_id,
            display_name=old_card.display_name,
            org_unit_id=None,
            public_view_enabled=old_card.public_view_enabled,
            public_edit_enabled=old_card.public_edit_enabled,
            created_by=actor_user_id,
        )
        old_card.lifecycle_status = "superseded"
        old_card.updated_by = actor_user_id
        relation = CardRelation(
            source_card_id=old_card.id,
            target_card_id=new_card.id,
            relation_type="transferred_to",
            created_by=actor_user_id,
        )
        self.session.add(relation)
        copy_result = self._copy_card_values(
            source_card_id=old_card.id,
            target_card_id=new_card.id,
            actor_user_id=actor_user_id,
        )
        self.session.flush()
        new_data_json: dict[str, object] = {
            "new_card_id": str(new_card.id),
            "target_organization_id": str(target_organization_id),
        }
        if copy_result.copied_file_ref_attachments:
            new_data_json["copied_file_ref_attachments"] = [
                {
                    "source_attachment_id": str(item.source_attachment_id),
                    "target_attachment_id": str(item.target_attachment_id),
                }
                for item in copy_result.copied_file_ref_attachments
            ]
        if copy_result.cleared_file_ref_attachment_ids:
            new_data_json["cleared_file_ref_attachment_ids"] = [
                str(attachment_id) for attachment_id in copy_result.cleared_file_ref_attachment_ids
            ]
        AuditService(self.session).record_user_event(
            actor_user_id=actor_user_id,
            action="transfer",
            object_type="card",
            object_id=old_card.id,
            new_data_json=new_data_json,
        )
        return new_card

    def create_block_instance_for_actor(
        self,
        *,
        actor_user_id: UUID,
        card_id: UUID,
        block_id: UUID,
    ) -> CardBlockInstance:
        card = self._get_editable_card(card_id)
        block = self._get_active_block(block_id)
        if block.registry_id != card.registry_id:
            raise CardServiceError("Block does not belong to the card registry.")
        self._require_card_permission(
            actor_user_id,
            card.organization_id,
            registry_id=card.registry_id,
        )
        existing = self._existing_block_instances(card.id, block.id)
        if existing and not block.is_repeatable:
            raise CardServiceError("Non-repeatable block already has an instance.")
        next_ordinal = self._next_block_instance_ordinal(card.id, block.id)
        block_instance = CardBlockInstance(
            card_id=card.id,
            block_id=block.id,
            ordinal=next_ordinal,
            created_by=actor_user_id,
        )
        self.session.add(block_instance)
        self.session.flush()
        AuditService(self.session).record_user_event(
            actor_user_id=actor_user_id,
            action="create",
            object_type="card_block_instance",
            object_id=block_instance.id,
            new_data_json={"card_id": str(card.id), "block_id": str(block.id)},
        )
        return block_instance

    def archive_block_instance_for_actor(
        self,
        *,
        actor_user_id: UUID,
        block_instance_id: UUID,
    ) -> CardBlockInstance:
        block_instance = self._get_active_block_instance(block_instance_id)
        card = self._get_editable_card(block_instance.card_id)
        block = self._get_active_block(block_instance.block_id)
        if block.registry_id != card.registry_id:
            raise CardServiceError("Block instance does not belong to the card registry.")
        if not block.is_repeatable:
            raise CardServiceError("Non-repeatable block instances cannot be archived.")
        if block.is_system or block.is_locked:
            raise CardServiceError("System or locked block instances cannot be archived here.")
        active_instances = self._existing_block_instances(card.id, block.id)
        min_instances = block.min_instances or 0
        if len(active_instances) <= min_instances:
            raise CardServiceError("Required block instance minimum would be violated.")
        self._require_card_permission(
            actor_user_id,
            card.organization_id,
            registry_id=card.registry_id,
        )

        block_instance.archived_at = datetime.now(UTC)
        self.session.flush()
        AuditService(self.session).record_user_event(
            actor_user_id=actor_user_id,
            action="archive",
            object_type="card_block_instance",
            object_id=block_instance.id,
            new_data_json={"card_id": str(card.id), "block_id": str(block.id)},
        )
        return block_instance

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

    def _get_editable_card(self, card_id: UUID) -> Card:
        card = self.session.get(Card, card_id)
        if (
            card is None
            or card.archived_at is not None
            or card.lifecycle_status in {"archived", "superseded"}
        ):
            raise CardServiceError("Card was not found.")
        return card

    def _get_readable_card(self, card_id: UUID, *, include_archive: bool) -> Card:
        card = self.session.get(Card, card_id)
        if card is None:
            raise CardServiceError("Card was not found.")
        if card.lifecycle_status in {"archived", "superseded"} and not include_archive:
            raise CardServiceError("Card is only readable in archive scope.")
        if card.archived_at is not None and not include_archive:
            raise CardServiceError("Card is only readable in archive scope.")
        return card

    def _get_active_block(self, block_id: UUID) -> FormBlock:
        block = self.session.get(FormBlock, block_id)
        if block is None or block.archived_at is not None or not block.is_active:
            raise CardServiceError("Form block was not found.")
        return block

    def _get_active_block_instance(self, block_instance_id: UUID) -> CardBlockInstance:
        block_instance = self.session.get(CardBlockInstance, block_instance_id)
        if block_instance is None or block_instance.archived_at is not None:
            raise CardServiceError("Card block instance was not found.")
        return block_instance

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
        created_by: UUID | None,
    ) -> CardBlockInstance:
        block_instance = self.session.scalars(
            select(CardBlockInstance)
            .where(
                CardBlockInstance.card_id == card_id,
                CardBlockInstance.block_id == block_id,
                CardBlockInstance.archived_at.is_(None),
            )
            .order_by(CardBlockInstance.ordinal)
        ).first()
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

    def _resolve_block_instance_for_value(
        self,
        *,
        card: Card,
        block: FormBlock,
        block_instance_id: UUID | None,
        actor_user_id: UUID | None,
    ) -> CardBlockInstance:
        if block_instance_id is not None:
            block_instance = self.session.get(CardBlockInstance, block_instance_id)
            if (
                block_instance is None
                or block_instance.card_id != card.id
                or block_instance.block_id != block.id
                or block_instance.archived_at is not None
            ):
                raise CardServiceError("Block instance was not found.")
            return block_instance

        return self._get_or_create_block_instance(
            card_id=card.id,
            block_id=block.id,
            created_by=actor_user_id,
        )

    def _get_or_create_field_value(
        self,
        *,
        card_id: UUID,
        block_instance_id: UUID,
        field_id: UUID,
        actor_user_id: UUID | None,
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

    def _coerce_field_assignment(
        self,
        field_model: FormField,
        value: object,
        *,
        card_id: UUID | None = None,
        actor_user_id: UUID | None = None,
        public_context: bool = False,
    ) -> _FieldAssignment:
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

        if field_model.field_type == "organization_ref":
            organization_id = self._ensure_uuid(
                value,
                "Organization reference fields require an organization id.",
            )
            self._ensure_active_organization_reference(organization_id)
            return _FieldAssignment(value_organization_id=organization_id)

        if field_model.field_type == "org_unit_ref":
            org_unit_id = self._ensure_uuid(
                value,
                "Org unit reference fields require an org unit id.",
            )
            self._ensure_active_org_unit_reference(org_unit_id)
            return _FieldAssignment(value_org_unit_id=org_unit_id)

        if field_model.field_type == "user_ref":
            user_id = self._ensure_uuid(value, "User reference fields require a user id.")
            self._ensure_active_user_reference(user_id)
            return _FieldAssignment(value_user_id=user_id)

        if field_model.field_type == "card_ref":
            card_id = self._ensure_uuid(value, "Card reference fields require a card id.")
            self._ensure_active_card_reference(
                card_id,
                actor_user_id=actor_user_id,
                public_context=public_context,
            )
            return _FieldAssignment(value_card_id=card_id)

        if field_model.field_type == "registry_ref":
            registry_id = self._ensure_uuid(
                value,
                "Registry reference fields require a registry id.",
            )
            self._ensure_active_registry_reference(registry_id)
            return _FieldAssignment(value_registry_id=registry_id)

        if field_model.field_type == "file_ref":
            if public_context:
                raise InvalidFieldValueError("Public links cannot edit file reference fields.")
            if value is None:
                return _FieldAssignment(value_attachment_id=None)
            if card_id is None:
                raise InvalidFieldValueError("File reference fields require a card context.")
            attachment_id = self._ensure_uuid(
                value,
                "File reference fields require an attachment id.",
            )
            self._ensure_active_attachment_reference(attachment_id, card_id=card_id)
            return _FieldAssignment(value_attachment_id=attachment_id)

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

    def _ensure_active_organization_reference(self, organization_id: UUID) -> None:
        organization = self.session.get(Organization, organization_id)
        if (
            organization is None
            or organization.archived_at is not None
            or not organization.is_active
        ):
            raise InvalidFieldValueError("Organization reference target was not found.")

    def _ensure_active_org_unit_reference(self, org_unit_id: UUID) -> None:
        org_unit = self.session.get(OrgUnit, org_unit_id)
        if org_unit is None or org_unit.archived_at is not None or not org_unit.is_active:
            raise InvalidFieldValueError("Org unit reference target was not found.")

    def _ensure_active_user_reference(self, user_id: UUID) -> None:
        user = self.session.get(User, user_id)
        if user is None or user.archived_at is not None or user.status == "archived":
            raise InvalidFieldValueError("User reference target was not found.")

    def _ensure_active_card_reference(
        self,
        card_id: UUID,
        *,
        actor_user_id: UUID | None,
        public_context: bool,
    ) -> None:
        card = self.session.get(Card, card_id)
        if (
            card is None
            or card.archived_at is not None
            or card.lifecycle_status in {"archived", "superseded"}
        ):
            raise InvalidFieldValueError("Card reference target was not found.")
        if actor_user_id is not None and not PermissionService(self.session).can_see_organization(
            actor_user_id,
            card.organization_id,
            registry_id=card.registry_id,
        ):
            raise InvalidFieldValueError("Card reference target is not readable.")
        if public_context and not card.public_view_enabled:
            raise InvalidFieldValueError("Card reference target is not public readable.")

    def _ensure_active_registry_reference(self, registry_id: UUID) -> None:
        registry = self.session.get(Registry, registry_id)
        if (
            registry is None
            or registry.archived_at is not None
            or registry.lifecycle_status == "archived"
        ):
            raise InvalidFieldValueError("Registry reference target was not found.")

    def _ensure_active_attachment_reference(self, attachment_id: UUID, *, card_id: UUID) -> None:
        attachment = self.session.get(CardAttachment, attachment_id)
        if (
            attachment is None
            or attachment.card_id != card_id
            or attachment.archived_at is not None
        ):
            raise InvalidFieldValueError("File reference attachment target was not found.")
        stored_file = self.session.get(StoredFile, attachment.stored_file_id)
        if stored_file is None or stored_file.archived_at is not None:
            raise InvalidFieldValueError("File reference attachment content was not found.")

    def _apply_assignment(
        self,
        field_value: FieldValue,
        assignment: _FieldAssignment,
        *,
        actor_user_id: UUID | None,
    ) -> None:
        field_value.value_text = assignment.value_text
        field_value.value_number = assignment.value_number
        field_value.value_date = assignment.value_date
        field_value.value_datetime = assignment.value_datetime
        field_value.value_bool = assignment.value_bool
        field_value.value_json = assignment.value_json
        field_value.value_reference_item_id = assignment.value_reference_item_id
        field_value.value_card_id = assignment.value_card_id
        field_value.value_user_id = assignment.value_user_id
        field_value.value_organization_id = assignment.value_organization_id
        field_value.value_org_unit_id = assignment.value_org_unit_id
        field_value.value_registry_id = assignment.value_registry_id
        field_value.value_attachment_id = assignment.value_attachment_id
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

    def _active_schema_rows_for_registry(
        self, registry_id: UUID
    ) -> list[tuple[FormBlock, FormField]]:
        rows = self.session.execute(
            select(FormBlock, FormField)
            .join(FormBlock, FormBlock.id == FormField.block_id)
            .where(
                FormBlock.registry_id == registry_id,
                FormBlock.archived_at.is_(None),
                FormBlock.is_active.is_(True),
                FormField.archived_at.is_(None),
                FormField.is_active.is_(True),
            )
            .order_by(FormBlock.position, FormBlock.code, FormField.position, FormField.code)
        )
        return [(block, field_model) for block, field_model in rows]

    def _existing_block_instances(self, card_id: UUID, block_id: UUID) -> list[CardBlockInstance]:
        return list(
            self.session.scalars(
                select(CardBlockInstance)
                .where(
                    CardBlockInstance.card_id == card_id,
                    CardBlockInstance.block_id == block_id,
                    CardBlockInstance.archived_at.is_(None),
                )
                .order_by(CardBlockInstance.ordinal)
            ).all()
        )

    def _next_block_instance_ordinal(self, card_id: UUID, block_id: UUID) -> int:
        current_max = self.session.scalar(
            select(func.max(CardBlockInstance.ordinal)).where(
                CardBlockInstance.card_id == card_id,
                CardBlockInstance.block_id == block_id,
            )
        )
        return (current_max if current_max is not None else -1) + 1

    def _block_instances_for_card(
        self,
        card_id: UUID,
        *,
        include_archive: bool = False,
    ) -> dict[UUID, list[CardBlockInstance]]:
        instances: dict[UUID, list[CardBlockInstance]] = {}
        criteria = [CardBlockInstance.card_id == card_id]
        if not include_archive:
            criteria.append(CardBlockInstance.archived_at.is_(None))
        for instance in self.session.scalars(
            select(CardBlockInstance)
            .where(*criteria)
            .order_by(CardBlockInstance.block_id, CardBlockInstance.ordinal)
        ):
            instances.setdefault(instance.block_id, []).append(instance)
        return instances

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
        if field_model.field_type == "file_ref":
            return self._read_file_ref_value(field_value.value_attachment_id)
        return None

    def _read_file_ref_value(self, attachment_id: UUID | None) -> FileRefValueRead | None:
        if attachment_id is None:
            return None
        attachment = self.session.get(CardAttachment, attachment_id)
        if attachment is None:
            return None
        stored_file = self.session.get(StoredFile, attachment.stored_file_id)
        if stored_file is None:
            return None
        return FileRefValueRead(
            attachment_id=attachment.id,
            title=attachment.title,
            original_filename=stored_file.original_filename,
            content_type=stored_file.content_type,
            content_length_bytes=stored_file.content_length_bytes,
            scanner_status=stored_file.scanner_status,
            archived_at=attachment.archived_at,
        )

    def _copy_card_values(
        self,
        *,
        source_card_id: UUID,
        target_card_id: UUID,
        actor_user_id: UUID,
    ) -> _CopyCardValuesResult:
        copy_result = _CopyCardValuesResult()
        source_instances = self._block_instances_for_card(source_card_id)
        instance_map: dict[UUID, UUID] = {}
        attachment_map: dict[UUID, UUID] = {}
        for instances in source_instances.values():
            for source_instance in instances:
                target_instance = CardBlockInstance(
                    card_id=target_card_id,
                    block_id=source_instance.block_id,
                    ordinal=source_instance.ordinal,
                    created_by=actor_user_id,
                )
                self.session.add(target_instance)
                self.session.flush()
                instance_map[source_instance.id] = target_instance.id

        for source_value in self.session.scalars(
            select(FieldValue).where(FieldValue.card_id == source_card_id)
        ):
            value_attachment_id = self._copy_file_ref_attachment(
                source_value.value_attachment_id,
                source_card_id=source_card_id,
                target_card_id=target_card_id,
                actor_user_id=actor_user_id,
                attachment_map=attachment_map,
                copy_result=copy_result,
            )
            copied_value = FieldValue(
                card_id=target_card_id,
                block_instance_id=instance_map[source_value.block_instance_id],
                field_id=source_value.field_id,
                value_text=source_value.value_text,
                value_number=source_value.value_number,
                value_date=source_value.value_date,
                value_datetime=source_value.value_datetime,
                value_bool=source_value.value_bool,
                value_json=source_value.value_json,
                value_reference_item_id=source_value.value_reference_item_id,
                value_card_id=source_value.value_card_id,
                value_user_id=source_value.value_user_id,
                value_organization_id=source_value.value_organization_id,
                value_org_unit_id=source_value.value_org_unit_id,
                value_registry_id=source_value.value_registry_id,
                value_attachment_id=value_attachment_id,
                created_by=actor_user_id,
                updated_by=actor_user_id,
            )
            self.session.add(copied_value)
            self.session.flush()
            for item in self.session.scalars(
                select(FieldValueItem)
                .where(FieldValueItem.field_value_id == source_value.id)
                .order_by(FieldValueItem.position)
            ):
                self.session.add(
                    FieldValueItem(
                        field_value_id=copied_value.id,
                        reference_item_id=item.reference_item_id,
                        position=item.position,
                    )
                )
        return copy_result

    def _copy_file_ref_attachment(
        self,
        source_attachment_id: UUID | None,
        *,
        source_card_id: UUID,
        target_card_id: UUID,
        actor_user_id: UUID,
        attachment_map: dict[UUID, UUID],
        copy_result: _CopyCardValuesResult,
    ) -> UUID | None:
        if source_attachment_id is None:
            return None
        if source_attachment_id in attachment_map:
            return attachment_map[source_attachment_id]

        source_attachment = self.session.get(CardAttachment, source_attachment_id)
        stored_file = (
            self.session.get(StoredFile, source_attachment.stored_file_id)
            if source_attachment is not None
            else None
        )
        if (
            source_attachment is None
            or source_attachment.card_id != source_card_id
            or source_attachment.archived_at is not None
            or stored_file is None
            or stored_file.archived_at is not None
        ):
            if source_attachment_id not in copy_result.cleared_file_ref_attachment_ids:
                copy_result.cleared_file_ref_attachment_ids.append(source_attachment_id)
            return None

        target_attachment = CardAttachment(
            card_id=target_card_id,
            stored_file_id=source_attachment.stored_file_id,
            title=source_attachment.title,
            description=source_attachment.description,
            position=source_attachment.position,
            created_by=actor_user_id,
        )
        self.session.add(target_attachment)
        self.session.flush()
        attachment_map[source_attachment_id] = target_attachment.id
        copy_result.copied_file_ref_attachments.append(
            _CopiedFileRefAttachment(
                source_attachment_id=source_attachment_id,
                target_attachment_id=target_attachment.id,
            )
        )
        return target_attachment.id
