import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings, get_settings
from app.main import create_app


def test_settings_can_be_created_without_database_url(monkeypatch) -> None:
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("REG_ENGINE_ENV_FILE", raising=False)

    settings = Settings(_env_file=None)

    assert settings.database_url is None


def test_database_url_is_read_when_provided(monkeypatch) -> None:
    database_url = "postgresql+psycopg://user:pass@localhost:5432/reg_engine"
    monkeypatch.setenv("DATABASE_URL", database_url)
    monkeypatch.delenv("REG_ENGINE_ENV_FILE", raising=False)
    get_settings.cache_clear()

    try:
        settings = get_settings()
    finally:
        get_settings.cache_clear()

    assert settings.database_url == database_url


@pytest.mark.parametrize(
    ("variable", "attribute", "value"),
    [
        ("REG_ENGINE_MAX_IMPORT_UNCOMPRESSED_BYTES", "max_import_uncompressed_bytes", 123_456),
        ("REG_ENGINE_MAX_IMPORT_SHEETS", "max_import_sheets", 7),
        ("REG_ENGINE_MAX_IMPORT_COLUMNS", "max_import_columns", 321),
        ("REG_ENGINE_MAX_IMPORT_CELLS", "max_import_cells", 654_321),
    ],
)
def test_xlsx_import_limits_read_positive_environment_values(
    monkeypatch,
    variable: str,
    attribute: str,
    value: int,
) -> None:
    monkeypatch.setenv(variable, str(value))

    settings = Settings(_env_file=None)

    assert getattr(settings, attribute) == value


def test_production_like_app_rejects_default_auth_secret(monkeypatch) -> None:
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.delenv("AUTH_TOKEN_SECRET", raising=False)
    monkeypatch.delenv("REG_ENGINE_ENV_FILE", raising=False)
    get_settings.cache_clear()

    try:
        with pytest.raises(RuntimeError, match="AUTH_TOKEN_SECRET"):
            create_app()
    finally:
        get_settings.cache_clear()


def test_production_like_app_requires_attachment_allowed_types(monkeypatch) -> None:
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("AUTH_TOKEN_SECRET", "not-the-development-secret")
    monkeypatch.setenv("REG_ENGINE_PUBLIC_LINK_TOKEN_ENCRYPTION_KEY", "configured-for-test")
    monkeypatch.delenv("REG_ENGINE_ATTACHMENT_ALLOWED_TYPES", raising=False)
    monkeypatch.delenv("REG_ENGINE_ENV_FILE", raising=False)
    get_settings.cache_clear()

    try:
        with pytest.raises(RuntimeError, match="REG_ENGINE_ATTACHMENT_ALLOWED_TYPES"):
            create_app()
    finally:
        get_settings.cache_clear()


def test_production_like_app_requires_public_link_token_encryption_key(monkeypatch) -> None:
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("AUTH_TOKEN_SECRET", "not-the-development-secret")
    monkeypatch.setenv("REG_ENGINE_ATTACHMENT_ALLOWED_TYPES", "application/pdf")
    monkeypatch.delenv("REG_ENGINE_PUBLIC_LINK_TOKEN_ENCRYPTION_KEY", raising=False)
    monkeypatch.delenv("REG_ENGINE_ENV_FILE", raising=False)
    get_settings.cache_clear()

    try:
        with pytest.raises(RuntimeError, match="REG_ENGINE_PUBLIC_LINK_TOKEN_ENCRYPTION_KEY"):
            create_app()
    finally:
        get_settings.cache_clear()


def test_unsupported_malware_scanner_mode_is_rejected(monkeypatch) -> None:
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.setenv("REG_ENGINE_MALWARE_SCANNER", "clamav")
    monkeypatch.delenv("REG_ENGINE_ENV_FILE", raising=False)
    get_settings.cache_clear()

    try:
        with pytest.raises(RuntimeError, match="REG_ENGINE_MALWARE_SCANNER"):
            create_app()
    finally:
        get_settings.cache_clear()


def test_development_app_allows_default_auth_secret(monkeypatch) -> None:
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.delenv("AUTH_TOKEN_SECRET", raising=False)
    monkeypatch.delenv("REG_ENGINE_ENV_FILE", raising=False)
    get_settings.cache_clear()

    try:
        app = create_app()
    finally:
        get_settings.cache_clear()

    assert app.title == "Registry Engine"


def test_configured_cors_origin_allows_frontend_preflight(monkeypatch) -> None:
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.setenv("CORS_ALLOWED_ORIGINS", "http://127.0.0.1:5173")
    monkeypatch.delenv("REG_ENGINE_ENV_FILE", raising=False)
    get_settings.cache_clear()

    try:
        app = create_app()
    finally:
        get_settings.cache_clear()

    response = TestClient(app).options(
        "/api/v1/auth/login",
        headers={
            "Origin": "http://127.0.0.1:5173",
            "Access-Control-Request-Method": "POST",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://127.0.0.1:5173"
