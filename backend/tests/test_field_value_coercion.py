from datetime import date
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException

import app.api.v1.endpoints._field_values as field_values_module
import app.services.cards as cards_module
import app.services.public_links as public_links_module
from app.api.v1.endpoints._field_values import coerce_api_field_value
from app.models import FieldValue, FormField
from app.services.cards import CardFieldOptionRead, CardService, InvalidFieldValueError
from app.services.public_links import PublicLinkError, PublicLinkService


class _FieldSession:
    def __init__(self, field: FormField) -> None:
        self.field = field

    def get(self, model: object, object_id: object) -> FormField | None:
        return self.field if model is FormField and object_id == self.field.id else None


def _field(field_type: str) -> FormField:
    return FormField(
        id=uuid4(),
        block_id=uuid4(),
        code=f"{field_type}_field",
        label=f"{field_type} field",
        field_type=field_type,
        position=0,
        is_active=True,
    )


def test_api_coercion_allows_empty_optional_single_reference_values() -> None:
    for field_type in [
        "select",
        "card_ref",
        "user_ref",
        "organization_ref",
        "org_unit_ref",
        "registry_ref",
    ]:
        field = _field(field_type)

        assert coerce_api_field_value(_FieldSession(field), field.id, None) is None  # type: ignore[arg-type]


def test_service_coercion_allows_empty_optional_single_reference_values() -> None:
    service = CardService(session=None)  # type: ignore[arg-type]

    for field_type in [
        "select",
        "card_ref",
        "user_ref",
        "organization_ref",
        "org_unit_ref",
        "registry_ref",
    ]:
        assignment = service._coerce_field_assignment(_field(field_type), None)

        assert assignment.value_reference_item_id is None
        assert assignment.value_card_id is None
        assert assignment.value_user_id is None
        assert assignment.value_organization_id is None
        assert assignment.value_org_unit_id is None
        assert assignment.value_registry_id is None


def test_work_experience_service_coercion_persists_only_a_private_anchor(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class ServerDate(date):
        @classmethod
        def today(cls) -> date:
            return cls(2026, 6, 28)

    monkeypatch.setattr(cards_module, "date", ServerDate)
    service = CardService(session=None)  # type: ignore[arg-type]

    assignment = service._coerce_field_assignment(
        _field("work_experience"),
        {"days": 16, "months": 3, "years": 9},
    )

    assert assignment.value_json == {"anchor_date": "2017-03-12"}
    assert assignment.value_text is None
    assert assignment.value_number is None
    assert assignment.value_date is None
    assert assignment.value_datetime is None
    assert assignment.value_bool is None
    assert assignment.value_reference_item_id is None
    assert assignment.value_card_id is None
    assert assignment.value_user_id is None
    assert assignment.value_organization_id is None
    assert assignment.value_org_unit_id is None
    assert assignment.value_registry_id is None
    assert assignment.value_attachment_id is None


def test_work_experience_service_projects_anchor_and_rejects_malformed_storage(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class ServerDate(date):
        @classmethod
        def today(cls) -> date:
            return cls(2026, 6, 28)

    monkeypatch.setattr(cards_module, "date", ServerDate)
    service = CardService(session=None)  # type: ignore[arg-type]
    field = _field("work_experience")
    field_value = FieldValue(
        card_id=uuid4(),
        block_instance_id=uuid4(),
        field_id=field.id,
        value_json={"anchor_date": "2017-03-12"},
    )

    assert service._read_field_value(field, field_value, {}) == {
        "days": 16,
        "months": 3,
        "years": 9,
        "display": "16 дней 3 месяца 9 лет",
    }

    field_value.value_json = {"anchor_date": "not-a-date"}
    with pytest.raises(InvalidFieldValueError, match="Work experience value is invalid"):
        service._read_field_value(field, field_value, {})


def test_work_experience_service_rejects_noncanonical_private_anchor(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class ServerDate(date):
        @classmethod
        def today(cls) -> date:
            return cls(2026, 6, 28)

    monkeypatch.setattr(cards_module, "date", ServerDate)
    service = CardService(session=None)  # type: ignore[arg-type]
    field = _field("work_experience")
    field_value = FieldValue(
        card_id=uuid4(),
        block_instance_id=uuid4(),
        field_id=field.id,
        value_json={"anchor_date": "20170312"},
    )

    with pytest.raises(InvalidFieldValueError, match="Work experience value is invalid"):
        service._read_field_value(field, field_value, {})


def test_public_link_reader_projects_private_work_experience_anchor(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class ServerDate(date):
        @classmethod
        def today(cls) -> date:
            return cls(2026, 6, 28)

    monkeypatch.setattr(public_links_module, "date", ServerDate)
    field = _field("work_experience")
    field_value = FieldValue(
        card_id=uuid4(),
        block_instance_id=uuid4(),
        field_id=field.id,
        value_json={"anchor_date": "2017-03-12"},
    )

    assert PublicLinkService(session=None)._read_field_value(field, field_value, {}) == {
        "days": 16,
        "months": 3,
        "years": 9,
        "display": "16 дней 3 месяца 9 лет",
    }


def test_public_link_reader_rejects_malformed_work_experience_anchor(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class ServerDate(date):
        @classmethod
        def today(cls) -> date:
            return cls(2026, 6, 28)

    monkeypatch.setattr(public_links_module, "date", ServerDate)
    field = _field("work_experience")
    field_value = FieldValue(
        card_id=uuid4(),
        block_instance_id=uuid4(),
        field_id=field.id,
        value_json={"anchor_date": "20170312"},
    )

    with pytest.raises(PublicLinkError, match="Work experience value is invalid"):
        PublicLinkService(session=None)._read_field_value(field, field_value, {})


def test_legacy_field_value_helpers_use_work_experience_domain_rules(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class ServerDate(date):
        @classmethod
        def today(cls) -> date:
            return cls(2026, 6, 28)

    monkeypatch.setattr(field_values_module, "date", ServerDate)
    field = _field("work_experience")
    session = _FieldSession(field)

    assert coerce_api_field_value(
        session,  # type: ignore[arg-type]
        field.id,
        {"days": 16, "months": 3, "years": 9},
    ) == {"days": 16, "months": 3, "years": 9}

    field_value = FieldValue(
        card_id=uuid4(),
        block_instance_id=uuid4(),
        field_id=field.id,
        value_json={"anchor_date": "2017-03-12"},
    )
    assert field_values_module._read_field_value(session, field, field_value) == {
        "days": 16,
        "months": 3,
        "years": 9,
        "display": "16 дней 3 месяца 9 лет",
    }

    field_value.value_json = {"anchor_date": "invalid"}
    with pytest.raises(HTTPException) as exc_info:
        field_values_module._read_field_value(session, field, field_value)
    assert exc_info.value.status_code == 422
    assert exc_info.value.detail == "Work experience value is invalid."


@pytest.mark.parametrize(
    "payload",
    [
        {"days": 1_000_000_000, "months": 0, "years": 0},
        {"days": 0, "months": 1_000_000_000, "years": 0},
        {"days": 0, "months": 0, "years": 1_000_000_000},
    ],
)
def test_work_experience_service_maps_oversized_calendar_components_to_invalid_values(
    monkeypatch: pytest.MonkeyPatch,
    payload: dict[str, int],
) -> None:
    class ServerDate(date):
        @classmethod
        def today(cls) -> date:
            return cls(2026, 6, 28)

    monkeypatch.setattr(cards_module, "date", ServerDate)
    service = CardService(session=None)  # type: ignore[arg-type]

    with pytest.raises(InvalidFieldValueError, match="supported calendar range"):
        service._coerce_field_assignment(_field("work_experience"), payload)


@pytest.mark.parametrize(
    "payload",
    [
        {"days": 1_000_000_000, "months": 0, "years": 0},
        {"days": 0, "months": 1_000_000_000, "years": 0},
        {"days": 0, "months": 0, "years": 1_000_000_000},
    ],
)
def test_legacy_api_coercion_maps_oversized_calendar_components_to_http_422(
    payload: dict[str, int],
) -> None:
    field = _field("work_experience")

    with pytest.raises(HTTPException, match="supported calendar range") as exc_info:
        coerce_api_field_value(_FieldSession(field), field.id, payload)  # type: ignore[arg-type]

    assert exc_info.value.status_code == 422


def test_org_unit_reference_coercion_receives_card_organization(
    monkeypatch: object,
) -> None:
    service = CardService(session=None)  # type: ignore[arg-type]
    card_organization_id = uuid4()
    org_unit_id = uuid4()
    observed: dict[str, object] = {}

    def ensure_active_org_unit(
        target_org_unit_id: object,
        *,
        expected_organization_id: object,
    ) -> None:
        observed["target_org_unit_id"] = target_org_unit_id
        observed["expected_organization_id"] = expected_organization_id

    monkeypatch.setattr(service, "_ensure_active_org_unit_reference", ensure_active_org_unit)  # type: ignore[attr-defined]

    assignment = service._coerce_field_assignment(
        _field("org_unit_ref"),
        org_unit_id,
        organization_id=card_organization_id,
    )

    assert assignment.value_org_unit_id == org_unit_id
    assert observed == {
        "target_org_unit_id": org_unit_id,
        "expected_organization_id": card_organization_id,
    }


def test_org_unit_option_labels_add_type_markers_only_when_labels_collide() -> None:
    service = CardService(session=None)  # type: ignore[arg-type]
    management_id = uuid4()
    department_id = uuid4()
    standalone_id = uuid4()
    options = [
        CardFieldOptionRead(id=management_id, label="Management → Department"),
        CardFieldOptionRead(id=department_id, label="Management → Department"),
        CardFieldOptionRead(id=standalone_id, label="Standalone management"),
    ]

    result = service._disambiguate_org_unit_option_labels(
        options=options,
        org_units_by_id={
            management_id: SimpleNamespace(type="management"),
            department_id: SimpleNamespace(type="department"),
            standalone_id: SimpleNamespace(type="management"),
        },
    )

    assert [option.label for option in result] == [
        "Management → Department (Управление)",
        "Management → Department (Отдел)",
        "Standalone management",
    ]
