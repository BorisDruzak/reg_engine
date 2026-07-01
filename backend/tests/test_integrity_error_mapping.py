from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError

from app.api.dependencies import raise_service_http_error


def _integrity_error(message: str) -> IntegrityError:
    return IntegrityError("statement", {}, Exception(message))


def test_duplicate_organization_code_returns_safe_specific_error() -> None:
    try:
        raise_service_http_error(
            _integrity_error(
                'duplicate key value violates unique constraint "uq_organizations_code"'
            )
        )
    except HTTPException as exc:
        assert exc.status_code == 409
        assert exc.detail == "Organization code already exists."
    else:  # pragma: no cover
        raise AssertionError("Expected HTTPException")


def test_duplicate_registry_code_returns_safe_specific_error() -> None:
    try:
        raise_service_http_error(
            _integrity_error('duplicate key value violates unique constraint "uq_registries_code"')
        )
    except HTTPException as exc:
        assert exc.status_code == 409
        assert exc.detail == "Registry code already exists."
    else:  # pragma: no cover
        raise AssertionError("Expected HTTPException")
