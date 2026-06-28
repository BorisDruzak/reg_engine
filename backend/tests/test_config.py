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
