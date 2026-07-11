from collections.abc import Sequence
from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Card, CardPublicFieldSetting, CardTemplate, FormBlock, FormField
from app.schemas.cards import (
    CardPublicAccessRead,
    CardPublicAccessUpdate,
    CardPublicFieldSettingRead,
    CardPublicFieldSettingUpdate,
)
from app.services.audit import AuditService
from app.services.cards import CardServiceError
from app.services.permissions import PermissionDeniedError, PermissionService


class CardPublicAccessError(CardServiceError):
    """Raised when card-specific public-access settings are invalid."""


@dataclass(frozen=True)
class NormalizedCardPublicAccessUpdate:
    public_view_enabled: bool
    public_edit_enabled: bool
    field_updates: tuple[CardPublicFieldSettingUpdate, ...]


def normalize_public_access_update(
    *,
    current_public_view_enabled: bool,
    current_public_edit_enabled: bool,
    requested_public_view_enabled: bool | None,
    requested_public_edit_enabled: bool | None,
    field_updates: Sequence[CardPublicFieldSettingUpdate],
) -> NormalizedCardPublicAccessUpdate:
    public_edit_enabled = (
        current_public_edit_enabled
        if requested_public_edit_enabled is None
        else requested_public_edit_enabled
    )
    public_view_enabled = (
        current_public_view_enabled
        if requested_public_view_enabled is None
        else requested_public_view_enabled
    )
    if public_edit_enabled:
        public_view_enabled = True
    return NormalizedCardPublicAccessUpdate(
        public_view_enabled=public_view_enabled,
        public_edit_enabled=public_edit_enabled,
        field_updates=tuple(
            item.model_copy(
                update={"public_visible": item.public_visible or item.public_editable},
            )
            for item in field_updates
        ),
    )


class CardPublicAccessService:
    """Owns card-scoped public visibility and editability settings."""

    def __init__(self, session: Session) -> None:
        self.session = session

    def read_for_actor(
        self,
        *,
        actor_user_id: UUID,
        card_id: UUID,
    ) -> CardPublicAccessRead:
        card = self._get_active_card(card_id)
        if not PermissionService(self.session).can_see_organization(
            actor_user_id,
            card.organization_id,
            registry_id=card.registry_id,
        ):
            raise PermissionDeniedError("Actor cannot read this card.")
        return self._read_for_card(card)

    def update_for_actor(
        self,
        *,
        actor_user_id: UUID,
        card_id: UUID,
        payload: CardPublicAccessUpdate,
    ) -> CardPublicAccessRead:
        card = self._get_active_card(card_id)
        self._require_manage_permission(actor_user_id, card)
        active_fields = self._active_template_fields(card)
        fields_by_id = {field_model.id: field_model for _, field_model in active_fields}
        self._validate_field_updates(payload.fields, fields_by_id)
        normalized = normalize_public_access_update(
            current_public_view_enabled=card.public_view_enabled,
            current_public_edit_enabled=card.public_edit_enabled,
            requested_public_view_enabled=payload.public_view_enabled,
            requested_public_edit_enabled=payload.public_edit_enabled,
            field_updates=payload.fields,
        )
        old_data = self._read_for_card(card, active_fields=active_fields).model_dump(mode="json")

        settings_by_field_id = self._settings_by_field_id(card.id)
        for field_update in normalized.field_updates:
            setting = settings_by_field_id.get(field_update.field_id)
            if setting is None:
                setting = CardPublicFieldSetting(
                    card_id=card.id,
                    field_id=field_update.field_id,
                )
                self.session.add(setting)
                settings_by_field_id[field_update.field_id] = setting
            setting.public_visible = field_update.public_visible
            setting.public_editable = field_update.public_editable
            setting.updated_by = actor_user_id

        card.public_view_enabled = normalized.public_view_enabled
        card.public_edit_enabled = normalized.public_edit_enabled
        card.updated_by = actor_user_id
        self.session.flush()

        result = self._read_for_card(card, active_fields=active_fields)
        AuditService(self.session).record_user_event(
            actor_user_id=actor_user_id,
            action="update",
            object_type="card_public_access",
            object_id=card.id,
            old_data_json=old_data,
            new_data_json=result.model_dump(mode="json"),
        )
        return result

    def public_schema_rows_for_card(self, card: Card) -> list[tuple[FormBlock, FormField]]:
        """Returns current card-template fields explicitly exposed to public visitors."""
        active_fields = self._active_template_fields(card)
        visible_field_ids = {
            setting.field_id
            for setting in self._settings_by_field_id(card.id).values()
            if setting.public_visible
        }
        return [
            (block, field_model)
            for block, field_model in active_fields
            if field_model.id in visible_field_ids
        ]

    def public_editable_schema_rows_for_card(
        self,
        card: Card,
    ) -> list[tuple[FormBlock, FormField]]:
        """Returns current card-template fields that a public visitor may change."""
        if not card.public_edit_enabled:
            return []
        settings_by_field_id = self._settings_by_field_id(card.id)
        return [
            (block, field_model)
            for block, field_model in self._active_template_fields(card)
            if (
                (setting := settings_by_field_id.get(field_model.id)) is not None
                and setting.public_visible
                and setting.public_editable
                and field_model.field_type not in {"file_ref", "static_text"}
            )
        ]

    def is_field_publicly_editable(self, *, card: Card, field_id: UUID) -> bool:
        if not card.public_edit_enabled:
            return False
        setting = self._settings_by_field_id(card.id).get(field_id)
        if setting is None or not setting.public_visible or not setting.public_editable:
            return False
        field_model = next(
            (
                field_model
                for _, field_model in self._active_template_fields(card)
                if field_model.id == field_id
            ),
            None,
        )
        return field_model is not None and field_model.field_type not in {"file_ref", "static_text"}

    def _read_for_card(
        self,
        card: Card,
        *,
        active_fields: list[tuple[FormBlock, FormField]] | None = None,
    ) -> CardPublicAccessRead:
        settings_by_field_id = self._settings_by_field_id(card.id)
        fields = active_fields if active_fields is not None else self._active_template_fields(card)
        return CardPublicAccessRead(
            card_id=card.id,
            public_view_enabled=card.public_view_enabled,
            public_edit_enabled=card.public_edit_enabled,
            fields=[
                CardPublicFieldSettingRead(
                    field_id=field_model.id,
                    public_visible=(
                        settings_by_field_id[field_model.id].public_visible
                        if field_model.id in settings_by_field_id
                        else False
                    ),
                    public_editable=(
                        settings_by_field_id[field_model.id].public_editable
                        if field_model.id in settings_by_field_id
                        else False
                    ),
                )
                for _, field_model in fields
            ],
        )

    def _get_active_card(self, card_id: UUID) -> Card:
        card = self.session.get(Card, card_id)
        if (
            card is None
            or card.archived_at is not None
            or card.lifecycle_status in {"archived", "superseded"}
        ):
            raise CardPublicAccessError("Card was not found.")
        return card

    def _require_manage_permission(self, actor_user_id: UUID, card: Card) -> None:
        if not PermissionService(self.session).has_permission(
            actor_user_id,
            "cards.manage",
            organization_id=card.organization_id,
            registry_id=card.registry_id,
        ):
            raise PermissionDeniedError("Actor cannot manage cards in this organization scope.")

    def _active_template_fields(self, card: Card) -> list[tuple[FormBlock, FormField]]:
        template = self.session.get(CardTemplate, card.card_template_id)
        if (
            template is None
            or template.registry_id != card.registry_id
            or template.archived_at is not None
            or not template.is_active
        ):
            raise CardPublicAccessError("Card template was not found.")
        field_ids = self._template_field_ids(template)
        if not field_ids:
            return []
        return list(
            self.session.execute(
                select(FormBlock, FormField)
                .join(FormField, FormField.block_id == FormBlock.id)
                .where(
                    FormBlock.registry_id == card.registry_id,
                    FormBlock.archived_at.is_(None),
                    FormBlock.is_active.is_(True),
                    FormField.id.in_(field_ids),
                    FormField.archived_at.is_(None),
                    FormField.is_active.is_(True),
                )
                .order_by(FormBlock.position, FormBlock.code, FormField.position, FormField.code)
            )
            .tuples()
            .all()
        )

    def _settings_by_field_id(self, card_id: UUID) -> dict[UUID, CardPublicFieldSetting]:
        return {
            setting.field_id: setting
            for setting in self.session.scalars(
                select(CardPublicFieldSetting).where(CardPublicFieldSetting.card_id == card_id)
            ).all()
        }

    def _validate_field_updates(
        self,
        field_updates: Sequence[CardPublicFieldSettingUpdate],
        fields_by_id: dict[UUID, FormField],
    ) -> None:
        seen_field_ids: set[UUID] = set()
        for field_update in field_updates:
            if field_update.field_id in seen_field_ids:
                raise CardPublicAccessError(
                    "Public field settings cannot contain duplicate fields."
                )
            seen_field_ids.add(field_update.field_id)
            field_model = fields_by_id.get(field_update.field_id)
            if field_model is None:
                raise CardPublicAccessError("Field does not belong to this card template.")
            if field_update.public_editable and field_model.field_type in {
                "file_ref",
                "static_text",
            }:
                raise CardPublicAccessError("This field type cannot be publicly editable.")

    def _template_field_ids(self, template: CardTemplate) -> set[UUID]:
        raw_field_ids = (template.field_schema_json or {}).get("field_ids", [])
        if not isinstance(raw_field_ids, Sequence) or isinstance(raw_field_ids, str | bytes):
            raise CardPublicAccessError("Card template field schema is invalid.")
        try:
            return {UUID(str(field_id)) for field_id in raw_field_ids}
        except (TypeError, ValueError) as exc:
            raise CardPublicAccessError(
                "Card template field schema contains invalid field ids."
            ) from exc
