from datetime import date
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field, StrictBool
from sqlalchemy.orm import Session

from app.api.dependencies import get_actor_user_id, get_db_session, raise_service_http_error
from app.services.card_events import CardChangeContext
from app.services.municipal_service_experience import (
    ExperienceRevisionConflict,
    MunicipalServiceExperienceService,
)

router = APIRouter(tags=["cards"])
_PATH = "/cards/{card_id}/fields/{field_id}/municipal-service-experience"
Db = Annotated[Session, Depends(get_db_session)]
Actor = Annotated[UUID, Depends(get_actor_user_id)]


class CalculationPreview(BaseModel):
    model_config = ConfigDict(extra="forbid")
    calculation: dict[str, Any]
    as_of_date: date
    block_instance_id: UUID | None = None


class CalculationSave(CalculationPreview):
    expected_revision: str = Field(min_length=1, max_length=100)
    basis_text: str | None = Field(default=None, max_length=4000)
    occurred_on: date | None = None


class ManualPreview(BaseModel):
    model_config = ConfigDict(extra="forbid")
    days: Any
    months: Any
    years: Any
    as_of_date: date | None = None
    block_instance_id: UUID | None = None


class ManualSave(ManualPreview):
    expected_revision: str = Field(min_length=1, max_length=100)
    confirm_manual: StrictBool = False
    basis_text: str | None = Field(default=None, max_length=4000)
    occurred_on: date | None = None


def _context(payload: CalculationSave | ManualSave) -> CardChangeContext | None:
    return (
        CardChangeContext(payload.basis_text or "", payload.occurred_on)
        if payload.basis_text
        else None
    )


def _raise(exc: Exception) -> None:
    if isinstance(exc, ExperienceRevisionConflict):
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    raise_service_http_error(exc)


@router.get(_PATH)
def read_calculation(
    card_id: UUID,
    field_id: UUID,
    session: Db,
    actor_user_id: Actor,
    block_instance_id: Annotated[UUID | None, Query()] = None,
) -> dict[str, Any]:
    try:
        return MunicipalServiceExperienceService(session).read(
            actor_user_id=actor_user_id,
            card_id=card_id,
            field_id=field_id,
            block_instance_id=block_instance_id,
        )
    except Exception as exc:
        _raise(exc)
        raise


@router.post(_PATH + "/preview")
def preview_calculation(
    card_id: UUID, field_id: UUID, payload: CalculationPreview, session: Db, actor_user_id: Actor
) -> dict[str, Any]:
    try:
        return MunicipalServiceExperienceService(session).preview(
            actor_user_id=actor_user_id,
            card_id=card_id,
            field_id=field_id,
            block_instance_id=payload.block_instance_id,
            calculation=payload.calculation,
            as_of_date=payload.as_of_date,
        )
    except Exception as exc:
        _raise(exc)
        raise


@router.put(_PATH)
def save_calculation(
    card_id: UUID, field_id: UUID, payload: CalculationSave, session: Db, actor_user_id: Actor
) -> dict[str, Any]:
    try:
        return MunicipalServiceExperienceService(session).save(
            actor_user_id=actor_user_id,
            card_id=card_id,
            field_id=field_id,
            block_instance_id=payload.block_instance_id,
            calculation=payload.calculation,
            expected_revision=payload.expected_revision,
            change_context=_context(payload),
        )
    except Exception as exc:
        _raise(exc)
        raise


@router.post(_PATH + "/manual-preview")
def preview_manual(
    card_id: UUID, field_id: UUID, payload: ManualPreview, session: Db, actor_user_id: Actor
) -> dict[str, Any]:
    try:
        return MunicipalServiceExperienceService(session).manual_preview(
            actor_user_id=actor_user_id,
            card_id=card_id,
            field_id=field_id,
            block_instance_id=payload.block_instance_id,
            value={"days": payload.days, "months": payload.months, "years": payload.years},
            as_of_date=payload.as_of_date or date.today(),
        )
    except Exception as exc:
        _raise(exc)
        raise


@router.post(_PATH + "/manual")
def save_manual(
    card_id: UUID, field_id: UUID, payload: ManualSave, session: Db, actor_user_id: Actor
) -> dict[str, Any]:
    try:
        return MunicipalServiceExperienceService(session).manual(
            actor_user_id=actor_user_id,
            card_id=card_id,
            field_id=field_id,
            block_instance_id=payload.block_instance_id,
            value={"days": payload.days, "months": payload.months, "years": payload.years},
            as_of_date=payload.as_of_date,
            expected_revision=payload.expected_revision,
            confirm_manual=payload.confirm_manual,
            change_context=_context(payload),
        )
    except Exception as exc:
        _raise(exc)
        raise
