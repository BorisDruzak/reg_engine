import os
from functools import lru_cache
from typing import Any

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

DEVELOPMENT_AUTH_TOKEN_SECRET = "change-me-development-auth-secret"
PRODUCTION_LIKE_ENVS = {"prod", "production", "stage", "staging"}


class Settings(BaseSettings):
    app_env: str = "development"
    app_name: str = "Registry Engine"
    api_v1_prefix: str = "/api/v1"
    database_url: str | None = None
    allow_dev_actor_header: bool = False
    auth_token_secret: str = DEVELOPMENT_AUTH_TOKEN_SECRET
    auth_access_token_minutes: int = 480
    cors_allowed_origins: str = ""
    storage_backend: str = Field(
        default="local_filesystem",
        validation_alias="REG_ENGINE_STORAGE_BACKEND",
    )
    storage_root: str | None = Field(
        default=None,
        validation_alias="REG_ENGINE_STORAGE_ROOT",
    )
    max_attachment_bytes: int = Field(
        default=10 * 1024 * 1024,
        validation_alias="REG_ENGINE_MAX_ATTACHMENT_BYTES",
    )
    attachment_allowed_types: str = Field(
        default="",
        validation_alias="REG_ENGINE_ATTACHMENT_ALLOWED_TYPES",
    )
    malware_scanner: str = Field(
        default="deferred",
        validation_alias="REG_ENGINE_MALWARE_SCANNER",
    )
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


def validate_runtime_configuration(settings: Settings) -> None:
    app_env = settings.app_env.strip().lower()
    if app_env not in PRODUCTION_LIKE_ENVS:
        return

    if settings.auth_token_secret == DEVELOPMENT_AUTH_TOKEN_SECRET:
        raise RuntimeError(
            "AUTH_TOKEN_SECRET must be set to a non-development value when APP_ENV is "
            f"production-like ({settings.app_env})."
        )


def get_cors_allowed_origins(settings: Settings) -> list[str]:
    return [origin.strip() for origin in settings.cors_allowed_origins.split(",") if origin.strip()]
