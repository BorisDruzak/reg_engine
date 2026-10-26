"""Authenticated calculator boundary over the existing card field transaction."""

import hashlib
import json
from datetime import date
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domain.work_experience import (
    anchor_for_experience,
    experience_for_anchor,
    parse_work_experience,
    serialize_experience,
)
from app.models import Card, CardBlockInstance, CardTemplate, FieldValue, FormBlock, FormField
from app.services.card_events import CardChangeContext
from app.services.cards import CardService, CardServiceError
from app.services.permissions import PermissionDeniedError, PermissionService


class ExperienceRevisionConflict(CardServiceError):
    """An operator is trying to replace a newer field value."""


class MunicipalServiceExperienceService:
    def __init__(self, session: Session) -> None:
        self.session = session
        self.cards = CardService(session)

    def _context(
        self,
        *,
        actor_user_id: UUID,
        card_id: UUID,
        field_id: UUID,
        block_instance_id: UUID | None = None,
    ) -> tuple[Card, FormField, CardBlockInstance | None, FieldValue | None]:
        card = self.cards._get_readable_card(card_id, include_archive=True)
        if not PermissionService(self.session).can_see_organization(
            actor_user_id,
            card.organization_id,
            registry_id=card.registry_id,
        ):
            raise PermissionDeniedError("Недостаточно прав для чтения карточки.")
        field = self.cards._get_active_field(field_id)
        block = self.cards._get_active_block(field.block_id)
        template = self.session.get(CardTemplate, card.card_template_id)
        if (
            field.field_type != "work_experience"
            or block.registry_id != card.registry_id
            or not field.is_active
            or field.archived_at is not None
            or template is None
            or field.id not in self.cards._template_field_ids(template)
        ):
            raise CardServiceError("Поле стажа недоступно в шаблоне этой карточки.")
        criteria = [
            CardBlockInstance.card_id == card.id,
            CardBlockInstance.block_id == block.id,
            CardBlockInstance.archived_at.is_(None),
        ]
        if block_instance_id is not None:
            criteria.append(CardBlockInstance.id == block_instance_id)
        instances = self.session.scalars(
            select(CardBlockInstance).where(*criteria).order_by(CardBlockInstance.ordinal).limit(2)
        ).all()
        if block_instance_id is not None and not instances:
            raise CardServiceError("Экземпляр блока не найден в этой карточке.")
        if len(instances) > 1:
            raise CardServiceError("Выберите экземпляр повторяемого блока.")
        instance = instances[0] if instances else None
        value = (
            self.session.scalar(
                select(FieldValue)
                .where(
                    FieldValue.card_id == card.id,
                    FieldValue.field_id == field.id,
                    FieldValue.block_instance_id == instance.id,
                )
                .execution_options(populate_existing=True)
            )
            if instance
            else None
        )
        return card, field, instance, value

    @staticmethod
    def _revision(value: FieldValue | None) -> str:
        source = {"id": str(value.id), "data": value.value_json} if value else None
        return hashlib.sha256(
            json.dumps(source, sort_keys=True, ensure_ascii=False).encode()
        ).hexdigest()

    def read(self, **kwargs: Any) -> dict[str, Any]:
        card, field, _instance, value = self._context(**kwargs)
        storage = value.value_json if value else None
        calculated = isinstance(storage, dict) and storage.get("mode") == "calculated"
        summary = self.cards._read_field_value(field, value, {})
        source_date = self._source_date(card, field, _instance)
        return {
            "calculation": storage if calculated else None,
            "result": self.cards._calculated_experience_result(storage, card_id=card.id)
            if calculated
            else None,
            "manual_value": None if calculated else summary,
            "manual_input": storage.get("manual_value") if isinstance(storage, dict) else None,
            "manual_as_of_date": storage.get("manual_as_of_date")
            if isinstance(storage, dict)
            else None,
            "server_date": date.today().isoformat(),
            "source_date": source_date,
            "can_manage": card.lifecycle_status not in {"dismissed", "archived", "superseded"}
            and PermissionService(self.session).has_permission(
                kwargs["actor_user_id"],
                "cards.manage",
                organization_id=card.organization_id,
                registry_id=card.registry_id,
            ),
            "revision": self._revision(value),
        }

    def _source_date(
        self, card: Card, field: FormField, instance: CardBlockInstance | None
    ) -> str | None:
        source_id = (field.options_config_json or {}).get("municipal_service_start_date_field_id")
        if not source_id:
            return None
        try:
            source_uuid = UUID(str(source_id))
        except ValueError:
            return None
        template = self.session.get(CardTemplate, card.card_template_id)
        if template is None or source_uuid not in self.cards._template_field_ids(template):
            return None
        source_field = self.session.get(FormField, source_uuid)
        if (
            source_field is None
            or source_field.field_type != "date"
            or not source_field.is_active
            or source_field.archived_at
        ):
            return None
        source_block = self.session.get(FormBlock, source_field.block_id)
        if (
            source_block is None
            or source_block.registry_id != card.registry_id
            or not source_block.is_active
            or source_block.archived_at
        ):
            return None
        criteria = [
            FieldValue.card_id == card.id,
            FieldValue.field_id == source_field.id,
            CardBlockInstance.archived_at.is_(None),
        ]
        if source_field.block_id == field.block_id and instance:
            criteria.append(CardBlockInstance.id == instance.id)
        result = self.session.scalar(
            select(FieldValue.value_date)
            .join(CardBlockInstance, CardBlockInstance.id == FieldValue.block_instance_id)
            .where(*criteria)
            .order_by(CardBlockInstance.ordinal, FieldValue.id)
            .limit(1)
        )
        return result.isoformat() if result else None

    def preview(self, *, calculation: object, as_of_date: date, **kwargs: Any) -> dict[str, Any]:
        card, field, _instance, _value = self._context(**kwargs)
        if (field.options_config_json or {}).get("municipal_service_calculator") is not True:
            raise CardServiceError("Калькулятор для этого поля не включён.")
        try:
            return self.cards._calculated_experience_result(
                calculation, card_id=card.id, as_of_date=as_of_date
            )
        except ValueError as exc:
            raise CardServiceError(str(exc)) from exc

    def manual_preview(self, *, value: object, as_of_date: date, **kwargs: Any) -> dict[str, Any]:
        self._context(**kwargs)
        if as_of_date > date.today():
            raise CardServiceError("Дата исходного ручного стажа не может быть в будущем.")
        try:
            anchor = anchor_for_experience(parse_work_experience(value), as_of_date)
            result = serialize_experience(experience_for_anchor(anchor, date.today()))
            return {
                "value": result,
                "server_date": date.today().isoformat(),
                "as_of_date": as_of_date.isoformat(),
            }
        except ValueError as exc:
            raise CardServiceError(str(exc)) from exc

    def save(
        self,
        *,
        calculation: object,
        expected_revision: str,
        change_context: CardChangeContext | None = None,
        **kwargs: Any,
    ) -> dict[str, Any]:
        with self.session.begin_nested():
            self.cards._lock_editable_card(kwargs["card_id"], actor_user_id=kwargs["actor_user_id"])
            _card, _field, _instance, current = self._context(**kwargs)
            if self._revision(current) != expected_revision:
                raise ExperienceRevisionConflict("Стаж уже изменён. Откройте расчёт заново.")
            self.cards.set_field_value_for_actor(
                **kwargs,
                value=calculation,
                change_context=change_context,
                allow_work_experience_mode_change=True,
            )
            return self.read(**kwargs)

    def manual(
        self,
        *,
        value: object,
        expected_revision: str,
        confirm_manual: bool = False,
        as_of_date: date | None = None,
        change_context: CardChangeContext | None = None,
        **kwargs: Any,
    ) -> dict[str, Any]:
        with self.session.begin_nested():
            self.cards._lock_editable_card(kwargs["card_id"], actor_user_id=kwargs["actor_user_id"])
            _card, _field, _instance, current = self._context(**kwargs)
            if self._revision(current) != expected_revision:
                raise ExperienceRevisionConflict("Стаж уже изменён. Откройте пересчёт заново.")
            if (
                current
                and isinstance(current.value_json, dict)
                and current.value_json.get("mode") == "calculated"
                and not confirm_manual
            ):
                raise CardServiceError("Подтвердите замену сохранённых периодов ручным стажем.")
            if as_of_date is not None and as_of_date > date.today():
                raise CardServiceError("Дата исходного стажа не может быть в будущем.")
            self.cards.set_field_value_for_actor(
                **kwargs,
                value=value,
                work_experience_as_of_date=as_of_date or date.today(),
                change_context=change_context,
                allow_work_experience_mode_change=True,
            )
            return self.read(**kwargs)
