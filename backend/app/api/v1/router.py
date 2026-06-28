from fastapi import APIRouter

from app.api.v1.endpoints.audit import router as audit_router
from app.api.v1.endpoints.auth import router as auth_router
from app.api.v1.endpoints.cards import router as cards_router
from app.api.v1.endpoints.health import router as health_router
from app.api.v1.endpoints.organizations import router as organizations_router
from app.api.v1.endpoints.public_links import router as public_links_router
from app.api.v1.endpoints.registries import router as registries_router

api_v1_router = APIRouter()
api_v1_router.include_router(health_router)
api_v1_router.include_router(auth_router)
api_v1_router.include_router(organizations_router)
api_v1_router.include_router(registries_router)
api_v1_router.include_router(cards_router)
api_v1_router.include_router(public_links_router)
api_v1_router.include_router(audit_router)
