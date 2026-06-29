from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles


def default_frontend_dist_dir() -> Path:
    return Path(__file__).resolve().parents[2] / "frontend" / "dist"


def configure_frontend_routes(
    application: FastAPI,
    *,
    dist_dir: str | None,
    api_prefix: str,
) -> bool:
    frontend_dist = Path(dist_dir).resolve() if dist_dir else default_frontend_dist_dir().resolve()
    index_path = frontend_dist / "index.html"
    if not index_path.is_file():
        return False

    assets_dir = frontend_dist / "assets"
    if assets_dir.is_dir():
        application.mount("/assets", StaticFiles(directory=assets_dir), name="frontend-assets")

    @application.get("/", include_in_schema=False)
    def frontend_index() -> FileResponse:
        return FileResponse(index_path)

    @application.get("/{frontend_path:path}", include_in_schema=False)
    def frontend_app(frontend_path: str) -> FileResponse:
        if _is_reserved_backend_path(frontend_path, api_prefix):
            raise HTTPException(status_code=404)

        requested_file = _safe_frontend_file(frontend_dist, frontend_path)
        if requested_file is not None:
            return FileResponse(requested_file)
        return FileResponse(index_path)

    return True


def _is_reserved_backend_path(frontend_path: str, api_prefix: str) -> bool:
    first_segment = frontend_path.split("/", 1)[0]
    api_segment = api_prefix.strip("/").split("/", 1)[0]
    return first_segment in {api_segment, "docs", "redoc", "openapi.json", "health"}


def _safe_frontend_file(frontend_dist: Path, frontend_path: str) -> Path | None:
    if not frontend_path or frontend_path.endswith("/"):
        return None

    candidate = (frontend_dist / frontend_path).resolve()
    try:
        candidate.relative_to(frontend_dist)
    except ValueError:
        return None

    if candidate.is_file():
        return candidate
    return None
