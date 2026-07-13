from importlib.util import find_spec
from uuid import UUID

import app.models as models
from app.models import Base
from app.schemas.cards import CardCreate, CardPublicFieldSettingUpdate, OrganizationCardCreate
from app.services import card_public_access
from app.services.public_links import PublicPreviewOption


def test_card_public_field_settings_model_is_registered() -> None:
    assert "card_public_field_settings" in Base.metadata.tables
    assert hasattr(models, "CardPublicFieldSetting")


def test_card_public_access_service_module_exists() -> None:
    assert find_spec("app.services.card_public_access") is not None


def test_new_card_field_public_access_defaults_to_visible_and_editable() -> None:
    assert card_public_access.default_public_field_access("text") == (True, True)
    assert card_public_access.default_public_field_access("static_text") == (True, False)
    assert card_public_access.default_public_field_access("file_ref") == (True, False)


def test_card_create_requests_default_to_public_access_enabled() -> None:
    card_create = CardCreate(organization_id=UUID("12345678-1234-4234-8234-123456789abc"))
    organization_card_create = OrganizationCardCreate()

    assert (card_create.public_view_enabled, card_create.public_edit_enabled) == (True, True)
    assert (
        organization_card_create.public_view_enabled,
        organization_card_create.public_edit_enabled,
    ) == (
        True,
        True,
    )


def test_public_edit_promotes_card_and_field_visibility() -> None:
    normalize = getattr(card_public_access, "normalize_public_access_update", None)

    assert normalize is not None
    result = normalize(
        current_public_view_enabled=False,
        current_public_edit_enabled=False,
        requested_public_view_enabled=False,
        requested_public_edit_enabled=True,
        field_updates=[
            CardPublicFieldSettingUpdate(
                field_id="12345678-1234-4234-8234-123456789abc",
                public_visible=False,
                public_editable=True,
            )
        ],
    )

    assert result.public_view_enabled is True
    assert result.public_edit_enabled is True
    assert result.field_updates[0].public_visible is True
    assert result.field_updates[0].public_editable is True


def test_public_preview_option_preserves_archived_state() -> None:
    option = PublicPreviewOption(
        id=UUID("12345678-1234-4234-8234-123456789abc"),
        code="archived-unit",
        label="Historical management",
        archived=True,
    )

    assert option.archived is True
