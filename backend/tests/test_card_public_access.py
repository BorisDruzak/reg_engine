import app.models as models
from app.models import Base


def test_card_public_field_settings_model_is_registered() -> None:
    assert "card_public_field_settings" in Base.metadata.tables
    assert hasattr(models, "CardPublicFieldSetting")
