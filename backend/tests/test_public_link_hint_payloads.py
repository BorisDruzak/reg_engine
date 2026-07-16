from uuid import uuid4

from app.schemas.public_links import PublicLinkPreviewFieldRead
from app.services.public_links import PublicPreviewField


def test_public_link_preview_field_exposes_text_validation_rule() -> None:
    validation = {"kind": "russian_text", "message": "Use Russian letters"}
    service_field = PublicPreviewField(
        field_id=uuid4(),
        code="name",
        label="Name",
        description=None,
        field_type="text",
        required_mode="not_required",
        value=None,
        options_source_type=None,
        options_source_id=None,
        validation_json=validation,
    )

    payload = PublicLinkPreviewFieldRead.model_validate(service_field, from_attributes=True)

    assert payload.validation_json == validation


def test_public_link_preview_field_exposes_hint_description() -> None:
    field_id = uuid4()
    service_field = PublicPreviewField(
        field_id=field_id,
        code="name",
        label="Имя",
        description="Введите имя полностью",
        field_type="text",
        required_mode="required_on_publish",
        value=None,
        options_source_type=None,
        options_source_id=None,
    )
    payload = PublicLinkPreviewFieldRead.model_validate(service_field, from_attributes=True)

    assert payload.description == "Введите имя полностью"
