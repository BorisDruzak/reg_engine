from app.core.config import Settings, get_settings


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
