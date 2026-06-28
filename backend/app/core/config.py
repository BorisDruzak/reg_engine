import os
from functools import lru_cache
from typing import Any

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_env: str = "development"
    app_name: str = "Registry Engine"
    api_v1_prefix: str = "/api/v1"
    database_url: str | None = None
    allow_dev_actor_header: bool = False
    auth_token_secret: str = "change-me-development-auth-secret"
    auth_access_token_minutes: int = 480
    log_level: str = "INFO"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    settings_kwargs: dict[str, Any] = {}
    if env_file := os.environ.get("REG_ENGINE_ENV_FILE"):
        settings_kwargs["_env_file"] = env_file
    return Settings(**settings_kwargs)
