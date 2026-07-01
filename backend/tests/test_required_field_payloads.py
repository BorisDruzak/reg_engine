from app.schemas.cards import CardUpdate
from app.schemas.registries import FormFieldCreate, FormFieldUpdate


def test_form_field_payloads_expose_required_mode() -> None:
    create_payload = FormFieldCreate(
        code="required_text",
        label="Required text",
        field_type="text",
        required_mode="required",
    )
    update_payload = FormFieldUpdate(required_mode="required_on_publish")

    assert create_payload.required_mode == "required"
    assert update_payload.required_mode == "required_on_publish"


def test_card_update_accepts_lifecycle_status() -> None:
    payload = CardUpdate(lifecycle_status="active")

    assert payload.lifecycle_status == "active"
