from app.core.config import get_settings


def test_settings_can_load_env_file_from_reg_engine_env_file(
    monkeypatch,
    tmp_path,
) -> None:
    env_file = tmp_path / "reg_engine.env"
    env_file.write_text(
        "\n".join(
            [
                "APP_NAME=Registry Engine From File",
                "DATABASE_URL=postgresql+psycopg://user:pass@localhost:5432/reg_engine",
            ]
        ),
        encoding="utf-8",
    )

    monkeypatch.setenv("REG_ENGINE_ENV_FILE", str(env_file))
    get_settings.cache_clear()

    try:
        settings = get_settings()
    finally:
        get_settings.cache_clear()

    assert settings.app_name == "Registry Engine From File"
    assert settings.database_url == "postgresql+psycopg://user:pass@localhost:5432/reg_engine"
