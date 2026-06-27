from fastapi import APIRouter

router = APIRouter(tags=["health"])


@router.get("/health")
def api_healthcheck() -> dict[str, str]:
    return {"status": "ok", "service": "reg_engine"}
