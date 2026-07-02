from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import delete, func, or_, select
from sqlalchemy.orm import Session
from sqlalchemy.sql.elements import ColumnElement

from app.models import (
    Card,
    CardAttachment,
    CardBlockInstance,
    CardRelation,
    CardTemplate,
    FieldValue,
    FieldValueItem,
    FormBlock,
    FormField,
    Organization,
    OrgUnit,
    ReferenceItem,
    Registry,
    StoredFile,
    User,
)
from app.services.audit import AuditService
from app.services.organizations import OrganizationService
from app.services.permissions import PermissionDeniedError, PermissionService
from app.services.references import ReferenceListError, ReferenceListService
from app.services.registry_schema import RegistrySchemaService


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
class CardListFieldRead:
    field_id: UUID
    code: str
    label: str
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
    card_template_id: UUID | None = None
    card_template_name: str | None = None
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


@dataclass(frozen=True)
class CardFieldFilterInput:
    field_id: UUID
    field_type: str
    operator: str
    value: object


class CardService:
    def __init__(self, session: Session) -> None:
        self.session = session

    def create_card_for_actor(
        self,
        *,
        actor_user_id: UUID,
        registry_id: UUID,
        organization_id: UUID,
        display_name: str | None = None,
        card_template_id: UUID | None = None,
        org_unit_id: UUID | None = None,
        public_view_enabled: bool = False,
        public_edit_enabled: bool = False,
    ) -> Card:
        self._require_card_permission(actor_user_id, organization_id, registry_id=registry_id)
        card = self.create_card(
            registry_id=registry_id,
            organization_id=organization_id,
            display_name=display_name,
            card_template_id=card_template_id,
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
                "card_template_id": str(card.card_template_id)
                if card.card_template_id is not None
                else None,
            },
        )
        return card

    def create_card_for_organization_for_actor(
        self,
        *,
        actor_user_id: UUID,
        organization_id: UUID,
        display_name: str | None = None,
        card_template_id: UUID | None = None,
        public_view_enabled: bool = False,
        public_edit_enabled: bool = False,
    ) -> Card:
        registry = RegistrySchemaService(self.session).resolve_default_registry_for_organization(
            organization_id
        )
        return self.create_card_for_actor(
            actor_user_id=actor_user_id,
            registry_id=registry.id,
            organization_id=organization_id,
            display_name=display_name,
            card_template_id=card_template_id,
            public_view_enabled=public_view_enabled,
            public_edit_enabled=public_edit_enabled,
        )

    def create_card(
        self,
        *,
        registry_id: UUID,
        organization_id: UUID,
        display_name: str | None = None,
        card_template_id: UUID | None = None,
        org_unit_id: UUID | None = None,
        public_view_enabled: bool = False,
        public_edit_enabled: bool = False,
        created_by: UUID | None = None,
        apply_template_defaults: bool = True,
    ) -> Card:
        self._validate_org_unit_for_organization(org_unit_id, organization_id)
        template = self._get_active_card_template_for_registry(
            card_template_id,
            registry_id=registry_id,
        )
        resolved_display_name = self._card_display_name_from_input(
            display_name=display_name,
            template=template,
        )
        card = Card(
            registry_id=registry_id,
            card_template_id=template.id if template is not None else None,
            organization_id=organization_id,
            org_unit_id=org_unit_id,
            display_name=resolved_display_name,
            lifecycle_status="draft",
            public_view_enabled=public_view_enabled,
            public_edit_enabled=public_edit_enabled,
            created_by=created_by,
            updated_by=created_by,
        )
        self.session.add(card)
        self.session.flush()
        if template is not None and apply_template_defaults:
            self._apply_card_template_defaults(card, template, actor_user_id=created_by)
        return card

    def list_visible_cards(
        self,
        *,
        actor_user_id: UUID,
        registry_id: UUID,
        organization_id: UUID | None = None,
        organization_ids: Sequence[UUID] | None = None,
        include_descendant_organizations: bool = True,
        include_archive: bool = False,
        query: str | None = None,
        field_filters: Sequence[CardFieldFilterInput] | None = None,
        card_template_ids: Sequence[UUID] | None = None,
    ) -> list[Card]:
        scope_ids = PermissionService(self.session).get_organization_scope_ids(
            actor_user_id,
            registry_id=registry_id,
        )
        if not scope_ids:
            return []
        scope_ids = self._filtered_organization_scope(
            scope_ids=scope_ids,
            organization_id=organization_id,
            organization_ids=organization_ids,
            include_descendant_organizations=include_descendant_organizations,
        )
        if not scope_ids:
            return []

        criteria = [
            Card.registry_id == registry_id,
            Card.organization_id.in_(scope_ids),
        ]
        if not include_archive:
            criteria.append(Card.lifecycle_status != "superseded")
            criteria.append(Card.lifecycle_status != "archived")
            criteria.append(Card.archived_at.is_(None))
        if query:
            criteria.append(self._card_text_search_criterion(query))
        if card_template_ids:
            criteria.append(Card.card_template_id.in_(set(card_template_ids)))
        for field_filter in field_filters or ():
            criteria.append(self._field_filter_criterion(field_filter, registry_id=registry_id))

        return list(
            self.session.scalars(
                select(Card).where(*criteria).order_by(Card.display_name, Card.id)
            ).all()
        )

    def list_visible_cards_for_organization_for_actor(
        self,
        *,
        actor_user_id: UUID,
        resolver_organization_id: UUID,
        organization_id: UUID | None = None,
        organization_ids: Sequence[UUID] | None = None,
        include_descendant_organizations: bool = True,
        include_archive: bool = False,
        query: str | None = None,
        field_filters: Sequence[CardFieldFilterInput] | None = None,
        card_template_ids: Sequence[UUID] | None = None,
    ) -> list[Card]:
        registry = RegistrySchemaService(self.session).resolve_default_registry_for_organization(
            resolver_organization_id
        )
        permissions = PermissionService(self.session)
        if not permissions.can_see_organization(
            actor_user_id,
            resolver_organization_id,
            registry_id=registry.id,
        ):
            return []
        return self.list_visible_cards(
            actor_user_id=actor_user_id,
            registry_id=registry.id,
            organization_id=organization_id,
            organization_ids=organization_ids,
            include_descendant_organizations=include_descendant_organizations,
            include_archive=include_archive,
            query=query,
            field_filters=field_filters,
            card_template_ids=card_template_ids,
        )

    def list_display_fields_for_card(self, card: Card) -> list[CardListFieldRead]:
        schema_rows = list(
            self.session.execute(
                select(FormBlock, FormField)
                .join(FormField, FormField.block_id == FormBlock.id)
                .where(
                    FormBlock.registry_id == card.registry_id,
                    FormBlock.archived_at.is_(None),
                    FormBlock.is_active.is_(True),
                    FormField.archived_at.is_(None),
                    FormField.is_active.is_(True),
                    FormField.is_list_display.is_(True),
                )
                .order_by(FormBlock.position, FormBlock.code, FormField.position, FormField.code)
            ).all()
        )
        field_models = [field_model for _, field_model in schema_rows]
        if not field_models:
            return []

        field_ids = [field_model.id for field_model in field_models]
        field_values = list(
            self.session.scalars(
                select(FieldValue)
                .join(CardBlockInstance, CardBlockInstance.id == FieldValue.block_instance_id)
                .where(
                    FieldValue.card_id == card.id,
                    FieldValue.field_id.in_(field_ids),
                    CardBlockInstance.archived_at.is_(None),
                )
                .order_by(FieldValue.field_id, CardBlockInstance.ordinal, FieldValue.id)
            ).all()
        )
        item_ids_by_value_id = self._multi_select_item_ids(field_values)
        values_by_field_id: dict[UUID, FieldValue] = {}
        for field_value in field_values:
            values_by_field_id.setdefault(field_value.field_id, field_value)

        return [
            CardListFieldRead(
                field_id=field_model.id,
                code=field_model.code,
                label=field_model.label,
                field_type=field_model.field_type,
                value=self._read_field_value(
                    field_model,
                    values_by_field_id.get(field_model.id),
                    item_ids_by_value_id,
                ),
            )
            for field_model in field_models
        ]

    def _filtered_organization_scope(
        self,
        *,
        scope_ids: set[UUID],
        organization_id: UUID | None,
        organization_ids: Sequence[UUID] | None,
        include_descendant_organizations: bool,
    ) -> set[UUID]:
        requested_ids = set(organization_ids or ())
        if organization_id is not None:
            requested_ids.add(organization_id)
        if not requested_ids:
            return scope_ids

        visible_requested_ids = requested_ids & scope_ids
        if not visible_requested_ids:
            return set()
        if not include_descendant_organizations:
            return visible_requested_ids

        organization_service = OrganizationService(self.session)
        expanded_ids: set[UUID] = set()
        for selected_organization_id in visible_requested_ids:
            expanded_ids.update(
                organization_service.get_descendant_ids(
                    selected_organization_id,
                    include_self=True,
                )
            )
        return expanded_ids & scope_ids

    def _card_text_search_criterion(self, query: str) -> ColumnElement[bool]:
        pattern = f"%{query}%"
        text_value_exists = (
            select(FieldValue.id)
            .where(
                FieldValue.card_id == Card.id,
                FieldValue.value_text.ilike(pattern),
            )
            .exists()
        )
        return or_(Card.display_name.ilike(pattern), text_value_exists)

    def _field_filter_criterion(
        self,
        field_filter: CardFieldFilterInput,
        *,
        registry_id: UUID,
    ) -> ColumnElement[bool]:
        field_model = self._get_active_field(field_filter.field_id)
        if field_model.field_type != field_filter.field_type:
            raise CardServiceError("Card field filter type does not match the schema field.")
        block = self._get_active_block(field_model.block_id)
        if block.registry_id != registry_id:
            raise CardServiceError("Card field filter does not belong to the card registry.")

        base_criteria = [
            FieldValue.card_id == Card.id,
            FieldValue.field_id == field_model.id,
        ]
        operator = field_filter.operator
        value = field_filter.value

        if field_model.field_type == "text":
            if operator != "contains" or not isinstance(value, str):
                raise CardServiceError("Text field filters require contains and a string value.")
            return (
                select(FieldValue.id)
                .where(*base_criteria, FieldValue.value_text.ilike(f"%{value}%"))
                .exists()
            )

        if field_model.field_type == "number":
            if operator != "is":
                raise CardServiceError("Number field filters require the is operator.")
            try:
                number_value = Decimal(str(value))
            except Exception as exc:
                raise CardServiceError("Number field filters require a decimal value.") from exc
            return (
                select(FieldValue.id)
                .where(*base_criteria, FieldValue.value_number == number_value)
                .exists()
            )

        if field_model.field_type == "date":
            if operator != "is":
                raise CardServiceError("Date field filters require the is operator.")
            date_value = self._coerce_filter_date(value)
            return (
                select(FieldValue.id)
                .where(*base_criteria, FieldValue.value_date == date_value)
                .exists()
            )

        if field_model.field_type == "datetime":
            if operator != "is":
                raise CardServiceError("Datetime field filters require the is operator.")
            datetime_value = self._coerce_filter_datetime(value)
            return (
                select(FieldValue.id)
                .where(*base_criteria, FieldValue.value_datetime == datetime_value)
                .exists()
            )

        if field_model.field_type == "bool":
            if operator != "is" or not isinstance(value, bool):
                raise CardServiceError("Bool field filters require is and a boolean value.")
            return (
                select(FieldValue.id).where(*base_criteria, FieldValue.value_bool == value).exists()
            )

        if field_model.field_type == "select":
            if operator != "is":
                raise CardServiceError("Select field filters require the is operator.")
            item_id = self._coerce_filter_uuid(
                value,
                "Select field filters require a reference item id.",
            )
            return (
                select(FieldValue.id)
                .where(*base_criteria, FieldValue.value_reference_item_id == item_id)
                .exists()
            )

        if field_model.field_type == "multi_select":
            if operator != "contains":
                raise CardServiceError("Multi-select field filters require the contains operator.")
            item_id = self._coerce_filter_uuid(
                value,
                "Multi-select field filters require a reference item id.",
            )
            return (
                select(FieldValueItem.id)
                .join(FieldValue, FieldValueItem.field_value_id == FieldValue.id)
                .where(
                    *base_criteria,
                    FieldValueItem.reference_item_id == item_id,
                )
                .exists()
            )

        reference_columns = {
            "organization_ref": FieldValue.value_organization_id,
            "org_unit_ref": FieldValue.value_org_unit_id,
            "user_ref": FieldValue.value_user_id,
            "card_ref": FieldValue.value_card_id,
            "registry_ref": FieldValue.value_registry_id,
            "file_ref": FieldValue.value_attachment_id,
        }
        if field_model.field_type in reference_columns:
            if operator != "is":
                raise CardServiceError("Reference field filters require the is operator.")
            object_id = self._coerce_filter_uuid(
                value,
                "Reference field filters require an object id.",
            )
            return (
                select(FieldValue.id)
                .where(*base_criteria, reference_columns[field_model.field_type] == object_id)
                .exists()
            )

        raise CardServiceError(f"Unsupported card field filter type: {field_model.field_type}.")

    def _coerce_filter_uuid(self, value: object, message: str) -> UUID:
        try:
            return value if isinstance(value, UUID) else UUID(str(value))
        except (TypeError, ValueError) as exc:
            raise CardServiceError(message) from exc

    def _coerce_filter_date(self, value: object) -> date:
        if isinstance(value, date) and not isinstance(value, datetime):
            return value
        if isinstance(value, str):
            try:
                return date.fromisoformat(value)
            except ValueError as exc:
                raise CardServiceError("Date field filters require ISO date values.") from exc
        raise CardServiceError("Date field filters require ISO date values.")

    def _coerce_filter_datetime(self, value: object) -> datetime:
        if isinstance(value, datetime):
            return value
        if isinstance(value, str):
            try:
                return datetime.fromisoformat(value.replace("Z", "+00:00"))
            except ValueError as exc:
                raise CardServiceError(
                    "Datetime field filters require ISO datetime values."
                ) from exc
        raise CardServiceError("Datetime field filters require ISO datetime values.")

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
            registry_id=card.registry_id,
            organization_id=card.organization_id,
            actor_user_id=actor_user_id,
        )
        self._ensure_required_assignment_is_not_empty(field_model, assignment)
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
            card = self._get_editable_card(card_id)
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
            self._validate_required_fields_for_card(card, include_publish_required=False)
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
            registry_id=registry_id,
            organization_id=organization_id,
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
            registry_id=card.registry_id,
            organization_id=card.organization_id,
            public_context=True,
        )
        self._ensure_required_assignment_is_not_empty(field_model, assignment)
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
        org_unit_id: UUID | None = None,
        update_org_unit: bool = False,
        lifecycle_status: str | None = None,
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
            "org_unit_id": str(card.org_unit_id) if card.org_unit_id is not None else None,
            "lifecycle_status": card.lifecycle_status,
            "public_view_enabled": card.public_view_enabled,
            "public_edit_enabled": card.public_edit_enabled,
        }
        if lifecycle_status is not None and lifecycle_status not in {"draft", "active"}:
            raise CardServiceError(f"Unsupported card lifecycle status: {lifecycle_status}")
        if display_name is not None:
            card.display_name = display_name
        if update_org_unit:
            self._validate_org_unit_for_organization(org_unit_id, card.organization_id)
            card.org_unit_id = org_unit_id
        if lifecycle_status is not None:
            if lifecycle_status == "active":
                self._validate_required_fields_for_card(card, include_publish_required=True)
            card.lifecycle_status = lifecycle_status
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
                "org_unit_id": str(card.org_unit_id) if card.org_unit_id is not None else None,
                "lifecycle_status": card.lifecycle_status,
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
            card_template_id=card.card_template_id,
            card_template_name=self._card_template_name(card),
            organization_id=card.organization_id,
            display_name=card.display_name,
            blocks=read_blocks,
            fields=read_fields,
        )

    def list_reference_items_for_card_field_for_actor(
        self,
        *,
        actor_user_id: UUID,
        card_id: UUID,
        field_id: UUID,
    ) -> list[ReferenceItem]:
        card = self._get_readable_card(card_id, include_archive=False)
        if not PermissionService(self.session).can_see_organization(
            actor_user_id,
            card.organization_id,
            registry_id=card.registry_id,
        ):
            raise PermissionDeniedError("Actor cannot read this card.")

        field_model = self._get_active_field(field_id)
        block = self._get_active_block(field_model.block_id)
        if block.registry_id != card.registry_id:
            raise CardServiceError("Field does not belong to the card registry.")
        if field_model.field_type not in {"select", "multi_select"}:
            return []

        try:
            return ReferenceListService(self.session).list_effective_items_for_field(
                field_model=field_model,
                registry_id=card.registry_id,
                organization_id=card.organization_id,
            )
        except ReferenceListError as exc:
            raise InvalidFieldValueError(str(exc)) from exc

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
            card_template_id=old_card.card_template_id,
            org_unit_id=None,
            public_view_enabled=old_card.public_view_enabled,
            public_edit_enabled=old_card.public_edit_enabled,
            created_by=actor_user_id,
            apply_template_defaults=False,
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

    def _get_active_card_template_for_registry(
        self,
        template_id: UUID | None,
        *,
        registry_id: UUID,
    ) -> CardTemplate | None:
        if template_id is None:
            return None
        template = self.session.get(CardTemplate, template_id)
        if (
            template is None
            or template.registry_id != registry_id
            or template.archived_at is not None
            or not template.is_active
        ):
            raise CardServiceError("Card template was not found.")
        return template

    def _card_display_name_from_input(
        self,
        *,
        display_name: str | None,
        template: CardTemplate | None,
    ) -> str:
        cleaned_display_name = display_name.strip() if display_name is not None else ""
        if cleaned_display_name:
            return cleaned_display_name
        if template is not None and template.name.strip():
            return template.name.strip()
        raise CardServiceError("Card display name or card template is required.")

    def _card_template_name(self, card: Card) -> str | None:
        if card.card_template_id is None:
            return None
        template = self.session.get(CardTemplate, card.card_template_id)
        return template.name if template is not None else None

    def _apply_card_template_defaults(
        self,
        card: Card,
        template: CardTemplate,
        *,
        actor_user_id: UUID | None,
    ) -> None:
        if not template.default_values_json:
            return
        field_ids = self._template_field_ids(template)
        field_models = {
            field_model.id: field_model
            for field_model in self.session.scalars(
                select(FormField)
                .join(FormBlock, FormBlock.id == FormField.block_id)
                .where(
                    FormBlock.registry_id == card.registry_id,
                    FormBlock.archived_at.is_(None),
                    FormBlock.is_active.is_(True),
                    FormField.id.in_(field_ids),
                    FormField.archived_at.is_(None),
                    FormField.is_active.is_(True),
                )
            ).all()
        }
        blocks_by_id = {
            block.id: block
            for block in self.session.scalars(
                select(FormBlock).where(
                    FormBlock.registry_id == card.registry_id,
                    FormBlock.archived_at.is_(None),
                    FormBlock.is_active.is_(True),
                )
            ).all()
        }

        for default_value in template.default_values_json:
            try:
                field_id = UUID(str(default_value["field_id"]))
            except (KeyError, TypeError, ValueError) as exc:
                raise CardServiceError("Card template default field id is invalid.") from exc
            if field_id not in field_ids:
                raise CardServiceError("Card template default does not belong to the template.")
            value = default_value.get("value")
            if value is None:
                continue
            field_model = field_models.get(field_id)
            if field_model is None:
                raise CardServiceError("Card template default field was not found.")
            block = blocks_by_id.get(field_model.block_id)
            if block is None:
                raise CardServiceError("Card template default block was not found.")
            assignment = self._coerce_field_assignment(
                field_model,
                self._coerce_card_template_default_value(field_model, value),
                card_id=card.id,
                registry_id=card.registry_id,
                organization_id=card.organization_id,
                actor_user_id=actor_user_id,
            )
            if self._field_assignment_is_empty(assignment):
                continue
            block_instance = self._resolve_block_instance_for_value(
                card=card,
                block=block,
                block_instance_id=None,
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

    def _template_field_ids(self, template: CardTemplate) -> set[UUID]:
        raw_field_ids = (template.field_schema_json or {}).get("field_ids", [])
        if not isinstance(raw_field_ids, Sequence) or isinstance(raw_field_ids, str | bytes):
            raise CardServiceError("Card template field schema is invalid.")
        try:
            return {UUID(str(field_id)) for field_id in raw_field_ids}
        except (TypeError, ValueError) as exc:
            raise CardServiceError(
                "Card template field schema contains invalid field ids."
            ) from exc

    def _coerce_card_template_default_value(
        self,
        field_model: FormField,
        value: object,
    ) -> object:
        if field_model.field_type == "date" and isinstance(value, str):
            try:
                return date.fromisoformat(value)
            except ValueError as exc:
                raise InvalidFieldValueError("Date fields require a date value.") from exc
        if field_model.field_type == "datetime" and isinstance(value, str):
            try:
                return datetime.fromisoformat(value.replace("Z", "+00:00"))
            except ValueError as exc:
                raise InvalidFieldValueError("Datetime fields require a datetime value.") from exc
        if field_model.field_type in {
            "select",
            "organization_ref",
            "org_unit_ref",
            "user_ref",
            "card_ref",
            "registry_ref",
            "file_ref",
        }:
            try:
                return UUID(str(value))
            except (TypeError, ValueError) as exc:
                raise InvalidFieldValueError("Reference fields require an object id.") from exc
        if field_model.field_type == "multi_select":
            if not isinstance(value, Sequence) or isinstance(value, str | bytes):
                raise InvalidFieldValueError("Multi-select fields require a list of ids.")
            try:
                return [UUID(str(item_id)) for item_id in value]
            except (TypeError, ValueError) as exc:
                raise InvalidFieldValueError("Multi-select fields require a list of ids.") from exc
        return value

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

    def _ensure_required_assignment_is_not_empty(
        self,
        field_model: FormField,
        assignment: _FieldAssignment,
    ) -> None:
        if field_model.required_mode != "required":
            return
        if self._field_assignment_is_empty(assignment):
            raise InvalidFieldValueError(f"Required field is empty: {field_model.label}")

    def _validate_required_fields_for_card(
        self,
        card: Card,
        *,
        include_publish_required: bool,
    ) -> None:
        required_modes = {"required"}
        if include_publish_required:
            required_modes.add("required_on_publish")

        schema_rows = [
            (block, field_model)
            for block, field_model in self._active_schema_rows_for_registry(card.registry_id)
            if field_model.required_mode in required_modes
        ]
        if not schema_rows:
            return

        field_ids = [field_model.id for _, field_model in schema_rows]
        field_values = list(
            self.session.scalars(
                select(FieldValue).where(
                    FieldValue.card_id == card.id,
                    FieldValue.field_id.in_(field_ids),
                )
            ).all()
        )
        item_ids_by_value_id = self._multi_select_item_ids(field_values)
        values_by_instance_field = {
            (field_value.block_instance_id, field_value.field_id): field_value
            for field_value in field_values
        }
        values_by_field: dict[UUID, list[FieldValue]] = {}
        for field_value in field_values:
            values_by_field.setdefault(field_value.field_id, []).append(field_value)

        instances_by_block = self._block_instances_for_card(card.id)
        missing_labels: list[str] = []
        for block, field_model in schema_rows:
            if block.is_repeatable:
                for instance in instances_by_block.get(block.id, []):
                    instance_field_value = values_by_instance_field.get(
                        (instance.id, field_model.id)
                    )
                    if self._field_value_is_empty(
                        field_model,
                        instance_field_value,
                        item_ids_by_value_id,
                    ):
                        missing_labels.append(f"{field_model.label} ({block.title})")
                continue

            values = values_by_field.get(field_model.id, [])
            if not any(
                not self._field_value_is_empty(field_model, value, item_ids_by_value_id)
                for value in values
            ):
                missing_labels.append(field_model.label)

        if missing_labels:
            raise InvalidFieldValueError(
                "Required fields are empty: " + ", ".join(sorted(set(missing_labels)))
            )

    def _field_assignment_is_empty(self, assignment: _FieldAssignment) -> bool:
        if assignment.item_ids:
            return False
        if assignment.value_text is not None:
            return not assignment.value_text.strip()
        return all(
            value is None
            for value in [
                assignment.value_number,
                assignment.value_date,
                assignment.value_datetime,
                assignment.value_bool,
                assignment.value_json,
                assignment.value_reference_item_id,
                assignment.value_card_id,
                assignment.value_user_id,
                assignment.value_organization_id,
                assignment.value_org_unit_id,
                assignment.value_registry_id,
                assignment.value_attachment_id,
            ]
        )

    def _field_value_is_empty(
        self,
        field_model: FormField,
        field_value: FieldValue | None,
        item_ids_by_value_id: dict[UUID, list[UUID]],
    ) -> bool:
        value = self._read_field_value(field_model, field_value, item_ids_by_value_id)
        if value is None:
            return True
        if isinstance(value, str):
            return not value.strip()
        if isinstance(value, Sequence) and not isinstance(value, str | bytes):
            return len(value) == 0
        return False

    def _coerce_field_assignment(
        self,
        field_model: FormField,
        value: object,
        *,
        card_id: UUID | None = None,
        registry_id: UUID | None = None,
        organization_id: UUID | None = None,
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
            self._ensure_reference_item_for_field(
                field_model,
                item_id,
                registry_id=registry_id,
                organization_id=organization_id,
            )
            return _FieldAssignment(value_reference_item_id=item_id)

        if field_model.field_type == "multi_select":
            item_ids = self._ensure_uuid_sequence(
                value,
                "Multi-select fields require a list of reference item ids.",
            )
            for item_id in item_ids:
                self._ensure_reference_item_for_field(
                    field_model,
                    item_id,
                    registry_id=registry_id,
                    organization_id=organization_id,
                )
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

    def _ensure_reference_item_for_field(
        self,
        field_model: FormField,
        item_id: UUID,
        *,
        registry_id: UUID | None,
        organization_id: UUID | None,
    ) -> None:
        if (
            field_model.options_source_type != "reference_list"
            or field_model.options_source_id is None
        ):
            raise InvalidFieldValueError("Reference field is not configured with a reference list.")

        reference_service = ReferenceListService(self.session)
        try:
            if self._uses_organization_reference_resolution(field_model):
                if registry_id is None or organization_id is None:
                    raise InvalidFieldValueError(
                        "Organization-aware reference fields require card organization context."
                    )
                reference_service.ensure_item_belongs_to_effective_list(
                    item_id=item_id,
                    field_model=field_model,
                    registry_id=registry_id,
                    organization_id=organization_id,
                )
                return

            reference_service.ensure_item_belongs_to_list(item_id, field_model.options_source_id)
        except ReferenceListError as exc:
            raise InvalidFieldValueError(str(exc)) from exc

    def _uses_organization_reference_resolution(self, field_model: FormField) -> bool:
        config = field_model.options_config_json or {}
        return (
            config.get("reference_resolution") == "by_card_organization"
            or config.get("allow_owner_override") is True
        )

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

    def _validate_org_unit_for_organization(
        self,
        org_unit_id: UUID | None,
        organization_id: UUID,
    ) -> None:
        if org_unit_id is None:
            return
        org_unit = self.session.get(OrgUnit, org_unit_id)
        if (
            org_unit is None
            or org_unit.archived_at is not None
            or not org_unit.is_active
            or org_unit.organization_id != organization_id
        ):
            raise CardServiceError("Org unit was not found in card organization.")

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
