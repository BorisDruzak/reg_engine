from pathlib import Path

from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.main import create_app


def _create_frontend_dist(tmp_path: Path) -> Path:
    dist_dir = tmp_path / "dist"
    assets_dir = dist_dir / "assets"
    assets_dir.mkdir(parents=True)
    (dist_dir / "index.html").write_text(
        '<!doctype html><html lang="ru"><body><div id="root"></div></body></html>',
        encoding="utf-8",
    )
    (assets_dir / "app.js").write_text("console.log('reg-engine');", encoding="utf-8")
    return dist_dir


def test_frontend_dist_is_served_when_configured(tmp_path: Path, monkeypatch) -> None:
    dist_dir = _create_frontend_dist(tmp_path)
    monkeypatch.setenv("REG_ENGINE_FRONTEND_DIST_DIR", str(dist_dir))
    monkeypatch.delenv("REG_ENGINE_ENV_FILE", raising=False)
    get_settings.cache_clear()

    try:
        app = create_app()
    finally:
        get_settings.cache_clear()

    client = TestClient(app)

    index = client.get("/")
    asset = client.get("/assets/app.js")
    deep_link = client.get("/public/edit/token-value")

    assert index.status_code == 200
    assert '<div id="root"></div>' in index.text
    assert asset.status_code == 200
    assert "reg-engine" in asset.text
    assert deep_link.status_code == 200
    assert '<div id="root"></div>' in deep_link.text


def test_frontend_routes_do_not_shadow_api_or_docs(tmp_path: Path, monkeypatch) -> None:
    dist_dir = _create_frontend_dist(tmp_path)
    monkeypatch.setenv("REG_ENGINE_FRONTEND_DIST_DIR", str(dist_dir))
    monkeypatch.delenv("REG_ENGINE_ENV_FILE", raising=False)
    get_settings.cache_clear()

    try:
        app = create_app()
    finally:
        get_settings.cache_clear()

    client = TestClient(app)

    assert client.get("/api/not-found").status_code == 404
    assert "<!doctype html>" not in client.get("/api/not-found").text.lower()
    assert client.get("/api/v1/health").status_code == 200
    assert client.get("/docs").status_code == 200
