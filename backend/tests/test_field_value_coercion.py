from uuid import uuid4

from app.api.v1.endpoints._field_values import coerce_api_field_value
from app.models import FormField
from app.services.cards import CardService


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
