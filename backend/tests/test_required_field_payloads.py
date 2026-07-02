from app.schemas.cards import CardUpdate
from app.schemas.registries import FormFieldCreate, FormFieldUpdate, RegistryCreate, RegistryUpdate


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


def test_form_field_payloads_expose_list_display_flag() -> None:
    create_payload = FormFieldCreate(
        code="list_text",
        label="List text",
        field_type="text",
        is_list_display=True,
    )
    update_payload = FormFieldUpdate(is_list_display=False)

    assert create_payload.is_list_display is True
    assert update_payload.is_list_display is False


def test_registry_payloads_expose_card_title_label() -> None:
    create_payload = RegistryCreate(
        code="assets",
        name="Assets",
        card_title_label="Asset name",
    )
    update_payload = RegistryUpdate(card_title_label="Case title")

    assert create_payload.card_title_label == "Asset name"
    assert update_payload.card_title_label == "Case title"


def test_card_update_accepts_lifecycle_status() -> None:
    payload = CardUpdate(lifecycle_status="active")

    assert payload.lifecycle_status == "active"
