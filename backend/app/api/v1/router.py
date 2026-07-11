from fastapi import APIRouter

from app.api.v1.endpoints.access_management import router as access_management_router
from app.api.v1.endpoints.attachments import router as attachments_router
from app.api.v1.endpoints.audit import router as audit_router
from app.api.v1.endpoints.auth import router as auth_router
from app.api.v1.endpoints.card_creation_links import router as card_creation_links_router
from app.api.v1.endpoints.card_template_layouts import router as card_template_layouts_router
from app.api.v1.endpoints.cards import router as cards_router
from app.api.v1.endpoints.documents import router as documents_router
from app.api.v1.endpoints.health import router as health_router
from app.api.v1.endpoints.import_export import router as import_export_router
from app.api.v1.endpoints.organizations import router as organizations_router
from app.api.v1.endpoints.public_links import router as public_links_router
from app.api.v1.endpoints.registries import router as registries_router
from app.api.v1.endpoints.reports import router as reports_router

api_v1_router = APIRouter()
api_v1_router.include_router(health_router)
api_v1_router.include_router(auth_router)
api_v1_router.include_router(access_management_router)
api_v1_router.include_router(attachments_router)
api_v1_router.include_router(documents_router)
api_v1_router.include_router(card_template_layouts_router)
api_v1_router.include_router(import_export_router)
api_v1_router.include_router(organizations_router)
api_v1_router.include_router(registries_router)
api_v1_router.include_router(cards_router)
api_v1_router.include_router(card_creation_links_router)
api_v1_router.include_router(public_links_router)
api_v1_router.include_router(reports_router)
api_v1_router.include_router(audit_router)
