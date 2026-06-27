from fastapi import APIRouter

from app.api.v1.endpoints.health import router as health_router
from app.api.v1.endpoints.org_units import router as org_units_router
from app.api.v1.endpoints.organizations import router as organizations_router

api_v1_router = APIRouter()
api_v1_router.include_router(health_router)
api_v1_router.include_router(org_units_router)
api_v1_router.include_router(organizations_router)
