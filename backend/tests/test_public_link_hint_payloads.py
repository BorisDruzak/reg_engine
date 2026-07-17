from uuid import uuid4

import pytest

from app.api.v1.endpoints import card_creation_links as creation_link_endpoints
from app.api.v1.endpoints import public_links as public_link_endpoints
from app.schemas.public_links import PublicLinkPreviewFieldRead
from app.services.card_creation_links import CardCreationLinkPublicPreviewValue
from app.services.public_links import (
    PublicLinkPreview,
    PublicPreviewBlock,
    PublicPreviewBlockInstance,
    PublicPreviewField,
)


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


@pytest.mark.parametrize(
    "validation_json",
    [
        None,
        {"kind": "russian_text", "message": "Use Russian letters"},
        [
            {"kind": "russian_text", "message": "Use Russian letters", "input_mode": "show_error"},
            {
                "kind": "regex",
                "pattern": "[A-Z]{1,12}",
                "message": "Use capitals",
                "input_mode": "block_input",
            },
        ],
    ],
)
def test_public_preview_endpoint_projections_include_text_validation(
    validation_json: dict[str, str] | list[dict[str, str]] | None,
) -> None:
    field = PublicPreviewField(
        field_id=uuid4(),
        code="name",
        label="Name",
        description=None,
        field_type="text",
        required_mode="not_required",
        value=None,
        options_source_type=None,
        options_source_id=None,
        validation_json=validation_json,
    )
    block = PublicPreviewBlock(
        block_id=uuid4(),
        code="main",
        title="Main",
        is_repeatable=False,
        layout_columns=1,
        display_config_json=None,
        instances=[
            PublicPreviewBlockInstance(
                block_instance_id=None,
                ordinal=0,
                fields=[field],
            )
        ],
    )
    form_layout = {"columns": 12, "sections": []}

    public_payload = public_link_endpoints._public_link_preview_to_read(
        PublicLinkPreview(
            card_id=uuid4(),
            display_name="Card",
            organization_name="Organization",
            card_template_name="Template",
            lifecycle_status="draft",
            expires_at=None,
            can_edit=True,
            form_layout=form_layout,
            blocks=[block],
        )
    )
    creation_payload = creation_link_endpoints._public_preview_to_read(
        CardCreationLinkPublicPreviewValue(
            card_template_id=uuid4(),
            card_template_name="Template",
            selected_organization_id=None,
            form_layout=form_layout,
            blocks=[block],
        )
    )

    assert public_payload.blocks[0].instances[0].fields[0].validation_json == validation_json
    assert creation_payload.blocks[0].instances[0].fields[0].validation_json == validation_json


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
