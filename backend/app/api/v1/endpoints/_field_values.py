from datetime import date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domain.work_experience import (
    experience_for_anchor,
    parse_work_experience,
    serialize_experience,
)
from app.models import CardAttachment, FieldValue, FieldValueItem, FormField, StoredFile
from app.schemas.cards import FieldValueRead


def coerce_api_field_value(session: Session, field_id: UUID, value: Any) -> object:
    field = session.get(FormField, field_id)
    if field is None or field.archived_at is not None or not field.is_active:
        raise HTTPException(status_code=404, detail="Form field was not found.")

    if field.field_type == "text":
        if not isinstance(value, str):
            raise HTTPException(status_code=422, detail="Text fields require a string value.")
        return value
    if field.field_type == "number":
        try:
            return Decimal(str(value))
        except Exception as exc:
            raise HTTPException(
                status_code=422,
                detail="Number fields require a numeric value.",
            ) from exc
    if field.field_type == "date":
        if not isinstance(value, str):
            raise HTTPException(status_code=422, detail="Date fields require an ISO date string.")
        try:
            return date.fromisoformat(value)
        except ValueError as exc:
            raise HTTPException(
                status_code=422,
                detail="Date fields require an ISO date string.",
            ) from exc
    if field.field_type == "datetime":
        if not isinstance(value, str):
            raise HTTPException(
                status_code=422,
                detail="Datetime fields require an ISO datetime string.",
            )
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError as exc:
            raise HTTPException(
                status_code=422,
                detail="Datetime fields require an ISO datetime string.",
            ) from exc
    if field.field_type == "bool":
        if not isinstance(value, bool):
            raise HTTPException(status_code=422, detail="Bool fields require a boolean value.")
        return value
    if field.field_type == "json":
        if not isinstance(value, dict):
            raise HTTPException(status_code=422, detail="JSON fields require an object value.")
        return value
    if field.field_type == "work_experience":
        try:
            experience = parse_work_experience(value)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        return {
            "days": experience.days,
            "months": experience.months,
            "years": experience.years,
        }
    if field.field_type in {
        "select",
        "card_ref",
        "user_ref",
        "organization_ref",
        "org_unit_ref",
        "registry_ref",
    }:
        if value is None:
            return None
        return _coerce_uuid(value, f"{field.field_type} fields require a UUID string.")
    if field.field_type == "file_ref":
        if value is None:
            return None
        return _coerce_uuid(value, "file_ref fields require a UUID string.")
    if field.field_type == "static_text":
        raise HTTPException(status_code=422, detail="Static text fields cannot be edited.")
    if field.field_type == "multi_select":
        if not isinstance(value, list):
            raise HTTPException(
                status_code=422,
                detail="Multi-select fields require a list of UUID strings.",
            )
        return [
            _coerce_uuid(item, "Multi-select fields require a list of UUID strings.")
            for item in value
        ]

    raise HTTPException(status_code=422, detail=f"Unsupported field type: {field.field_type}")


def field_value_to_read(session: Session, field_value: FieldValue) -> FieldValueRead:
    field = session.get(FormField, field_value.field_id)
    if field is None:
        raise HTTPException(status_code=500, detail="Field value references a missing field.")

    return FieldValueRead(
        id=field_value.id,
        card_id=field_value.card_id,
        block_instance_id=field_value.block_instance_id,
        field_id=field_value.field_id,
        value=_read_field_value(session, field, field_value),
    )


def _coerce_uuid(value: Any, message: str) -> UUID:
    if isinstance(value, UUID):
        return value
    if not isinstance(value, str):
        raise HTTPException(status_code=422, detail=message)
    try:
        return UUID(value)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=message) from exc


def _read_field_value(session: Session, field: FormField, field_value: FieldValue) -> object | None:
    if field.field_type == "text":
        return field_value.value_text
    if field.field_type == "number":
        return field_value.value_number
    if field.field_type == "date":
        return field_value.value_date
    if field.field_type == "datetime":
        return field_value.value_datetime
    if field.field_type == "bool":
        return field_value.value_bool
    if field.field_type == "json":
        return field_value.value_json
    if field.field_type == "work_experience":
        try:
            value_json = field_value.value_json
            if (
                not isinstance(value_json, dict)
                or set(value_json) != {"anchor_date"}
                or not isinstance(value_json["anchor_date"], str)
            ):
                raise ValueError("Work experience anchor is invalid.")
            raw_anchor_date = value_json["anchor_date"]
            anchor_date = date.fromisoformat(raw_anchor_date)
            if anchor_date.isoformat() != raw_anchor_date:
                raise ValueError("Work experience anchor is invalid.")
            return serialize_experience(experience_for_anchor(anchor_date, date.today()))
        except (TypeError, ValueError) as exc:
            raise HTTPException(
                status_code=422,
                detail="Work experience value is invalid.",
            ) from exc
    if field.field_type == "select":
        return field_value.value_reference_item_id
    if field.field_type == "multi_select":
        return list(
            session.scalars(
                select(FieldValueItem.reference_item_id)
                .where(FieldValueItem.field_value_id == field_value.id)
                .order_by(FieldValueItem.position, FieldValueItem.id)
            ).all()
        )
    if field.field_type == "card_ref":
        return field_value.value_card_id
    if field.field_type == "user_ref":
        return field_value.value_user_id
    if field.field_type == "organization_ref":
        return field_value.value_organization_id
    if field.field_type == "org_unit_ref":
        return field_value.value_org_unit_id
    if field.field_type == "registry_ref":
        return field_value.value_registry_id
    if field.field_type == "file_ref":
        return _read_file_ref_value(session, field_value.value_attachment_id)
    return None


def _read_file_ref_value(session: Session, attachment_id: UUID | None) -> dict[str, object] | None:
    if attachment_id is None:
        return None
    attachment = session.get(CardAttachment, attachment_id)
    if attachment is None:
        return None
    stored_file = session.get(StoredFile, attachment.stored_file_id)
    if stored_file is None:
        return None
    return {
        "attachment_id": attachment.id,
        "title": attachment.title,
        "original_filename": stored_file.original_filename,
        "content_type": stored_file.content_type,
        "content_length_bytes": stored_file.content_length_bytes,
        "scanner_status": stored_file.scanner_status,
        "archived_at": attachment.archived_at,
    }
