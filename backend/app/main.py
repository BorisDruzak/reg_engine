from fastapi import FastAPI

from app.api.v1.router import api_v1_router
from app.core.config import get_settings
from app.core.logging import configure_logging


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging(settings.log_level)

    application = FastAPI(title=settings.app_name)
    application.include_router(api_v1_router, prefix=settings.api_v1_prefix)

    @application.get("/health", tags=["health"])
    def root_healthcheck() -> dict[str, str]:
        return {"status": "ok", "service": "reg_engine"}

    return application


app = create_app()
