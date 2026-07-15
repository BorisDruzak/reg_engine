import os
from functools import lru_cache
from typing import Any

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

DEVELOPMENT_AUTH_TOKEN_SECRET = "change-me-development-auth-secret"
PRODUCTION_LIKE_ENVS = {"prod", "production", "stage", "staging"}
SUPPORTED_MALWARE_SCANNERS = {"deferred"}


class Settings(BaseSettings):
    app_env: str = "development"
    app_name: str = "Registry Engine"
    api_v1_prefix: str = "/api/v1"
    database_url: str | None = None
    allow_dev_actor_header: bool = False
    auth_token_secret: str = DEVELOPMENT_AUTH_TOKEN_SECRET
    auth_access_token_minutes: int = 24 * 60
    public_link_token_encryption_key: str | None = Field(
        default=None,
        validation_alias="REG_ENGINE_PUBLIC_LINK_TOKEN_ENCRYPTION_KEY",
    )
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
    max_import_bytes: int = Field(
        default=5 * 1024 * 1024,
        validation_alias="REG_ENGINE_MAX_IMPORT_BYTES",
        gt=0,
    )
    max_import_rows: int = Field(
        default=10_000,
        validation_alias="REG_ENGINE_MAX_IMPORT_ROWS",
        gt=0,
    )
    attachment_allowed_types: str = Field(
        default="",
        validation_alias="REG_ENGINE_ATTACHMENT_ALLOWED_TYPES",
    )
    malware_scanner: str = Field(
        default="deferred",
        validation_alias="REG_ENGINE_MALWARE_SCANNER",
    )
    frontend_dist_dir: str | None = Field(
        default=None,
        validation_alias="REG_ENGINE_FRONTEND_DIST_DIR",
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
    malware_scanner = settings.malware_scanner.strip().lower()
    if malware_scanner not in SUPPORTED_MALWARE_SCANNERS:
        raise RuntimeError(
            "REG_ENGINE_MALWARE_SCANNER must be one of "
            f"{sorted(SUPPORTED_MALWARE_SCANNERS)}; got {settings.malware_scanner!r}."
        )

    app_env = settings.app_env.strip().lower()
    if app_env not in PRODUCTION_LIKE_ENVS:
        return

    if settings.auth_token_secret == DEVELOPMENT_AUTH_TOKEN_SECRET:
        raise RuntimeError(
            "AUTH_TOKEN_SECRET must be set to a non-development value when APP_ENV is "
            f"production-like ({settings.app_env})."
        )

    if not settings.public_link_token_encryption_key:
        raise RuntimeError(
            "REG_ENGINE_PUBLIC_LINK_TOKEN_ENCRYPTION_KEY must be set when APP_ENV is "
            f"production-like ({settings.app_env})."
        )

    if not settings.attachment_allowed_types.strip():
        raise RuntimeError(
            "REG_ENGINE_ATTACHMENT_ALLOWED_TYPES must be set to an explicit MIME allow-list "
            f"when APP_ENV is production-like ({settings.app_env})."
        )


def get_cors_allowed_origins(settings: Settings) -> list[str]:
    return [origin.strip() for origin in settings.cors_allowed_origins.split(",") if origin.strip()]
