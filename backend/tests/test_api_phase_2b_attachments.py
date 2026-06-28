import asyncio
import os
from collections.abc import Iterator
from pathlib import Path
from typing import Any
from uuid import UUID

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select, text
from sqlalchemy.engine import Engine, make_url
from sqlalchemy.orm import Session

from app.api.v1.endpoints import attachments as attachment_endpoints
from app.main import create_app
from app.models import AccessGrant, AuditEvent, Permission, Role, User, role_permissions
from app.services.cards import CardService
from app.services.organizations import OrganizationService
from app.services.registry_schema import RegistrySchemaService


def _require_test_database_url() -> str:
    database_url = os.environ.get("TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("TEST_DATABASE_URL is required for disposable PostgreSQL attachment API tests.")

    database_name = make_url(database_url).database or ""
    if database_name == "reg_engine" or not database_name.endswith("_test"):
        pytest.fail("TEST_DATABASE_URL must point to a disposable database ending with '_test'.")

    return database_url


def _alembic_config() -> Config:
    backend_root = Path(__file__).resolve().parents[1]
    config = Config(str(backend_root / "alembic.ini"))
    config.set_main_option("script_location", str(backend_root / "migrations"))
    return config


def _run_alembic_upgrade(database_url: str) -> None:
    previous_url = os.environ.get("TEST_DATABASE_URL")
    os.environ["TEST_DATABASE_URL"] = database_url
    try:
        command.upgrade(_alembic_config(), "head")
    finally:
        if previous_url is None:
            os.environ.pop("TEST_DATABASE_URL", None)
        else:
            os.environ["TEST_DATABASE_URL"] = previous_url


def _reset_public_schema(engine: Engine) -> None:
    with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as connection:
        connection.execute(text("DROP SCHEMA IF EXISTS public CASCADE"))
        connection.execute(text("CREATE SCHEMA public"))


@pytest.fixture(scope="module")
def migrated_test_engine() -> Iterator[Engine]:
    database_url = _require_test_database_url()
    engine = create_engine(database_url)

    _reset_public_schema(engine)
    _run_alembic_upgrade(database_url)

    try:
        yield engine
    finally:
        engine.dispose()


@pytest.fixture()
def db_session(migrated_test_engine: Engine) -> Iterator[Session]:
    connection = migrated_test_engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection, expire_on_commit=False)

    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


@pytest.fixture()
def api_client(db_session: Session, tmp_path: Path) -> Iterator[TestClient]:
    from app.api.dependencies import get_db_session
    from app.core.config import get_settings

    previous_allow_dev_actor = os.environ.get("ALLOW_DEV_ACTOR_HEADER")
    previous_storage_root = os.environ.get("REG_ENGINE_STORAGE_ROOT")
    previous_max_bytes = os.environ.get("REG_ENGINE_MAX_ATTACHMENT_BYTES")
    previous_allowed_types = os.environ.get("REG_ENGINE_ATTACHMENT_ALLOWED_TYPES")
    os.environ["ALLOW_DEV_ACTOR_HEADER"] = "true"
    os.environ["REG_ENGINE_STORAGE_ROOT"] = str(tmp_path)
    os.environ["REG_ENGINE_MAX_ATTACHMENT_BYTES"] = "64"
    os.environ.pop("REG_ENGINE_ATTACHMENT_ALLOWED_TYPES", None)
    get_settings.cache_clear()
    app = create_app()

    def override_session() -> Iterator[Session]:
        yield db_session

    app.dependency_overrides[get_db_session] = override_session
    try:
        with TestClient(app) as client:
            yield client
    finally:
        _restore_env("ALLOW_DEV_ACTOR_HEADER", previous_allow_dev_actor)
        _restore_env("REG_ENGINE_STORAGE_ROOT", previous_storage_root)
        _restore_env("REG_ENGINE_MAX_ATTACHMENT_BYTES", previous_max_bytes)
        _restore_env("REG_ENGINE_ATTACHMENT_ALLOWED_TYPES", previous_allowed_types)
        get_settings.cache_clear()


def _restore_env(name: str, value: str | None) -> None:
    if value is None:
        os.environ.pop(name, None)
    else:
        os.environ[name] = value


def _actor_headers(user_id: UUID) -> dict[str, str]:
    return {"X-Actor-User-Id": str(user_id)}


class _FakeUpload:
    def __init__(self, chunks: list[bytes]) -> None:
        self._chunks = chunks
        self.read_sizes: list[int] = []

    async def read(self, size: int = -1) -> bytes:
        self.read_sizes.append(size)
        if not self._chunks:
            return b""
        chunk = self._chunks.pop(0)
        if size >= 0:
            return chunk[:size]
        return chunk


def _create_user(
    session: Session,
    email: str,
    *,
    is_superuser: bool = False,
) -> User:
    user = User(email=email, display_name=email, is_superuser=is_superuser)
    session.add(user)
    session.flush()
    return user


def _create_role_with_permissions(
    session: Session,
    role_code: str,
    permission_codes: list[str],
) -> Role:
    role = Role(code=role_code, name=role_code)
    session.add(role)
    session.flush()

    for permission_code in permission_codes:
        permission = Permission(code=permission_code, description=permission_code)
        session.add(permission)
        session.flush()
        session.execute(
            role_permissions.insert().values(
                role_id=role.id,
                permission_id=permission.id,
            )
        )

    session.flush()
    return role


def _grant_access(
    session: Session,
    *,
    user_id: UUID,
    role_id: UUID,
    organization_id: UUID | None = None,
    registry_id: UUID | None = None,
    include_descendants: bool = True,
    created_by: UUID | None = None,
) -> AccessGrant:
    grant = AccessGrant(
        user_id=user_id,
        role_id=role_id,
        organization_id=organization_id,
        registry_id=registry_id,
        include_descendants=include_descendants,
        created_by=created_by,
    )
    session.add(grant)
    session.flush()
    return grant


def _attachment_api_context(db_session: Session) -> dict[str, Any]:
    system_admin = _create_user(
        db_session,
        "api-attachments-system@example.test",
        is_superuser=True,
    )
    card_admin = _create_user(db_session, "api-attachments-card-admin@example.test")
    root_limited_admin = _create_user(
        db_session,
        "api-attachments-root-limited-admin@example.test",
    )
    sibling_admin = _create_user(db_session, "api-attachments-sibling-admin@example.test")
    card_role = _create_role_with_permissions(
        db_session,
        "api_attachments_card_admin",
        ["cards.manage"],
    )
    organization_service = OrganizationService(db_session)
    root = organization_service.create_root_for_actor(
        actor_user_id=system_admin.id,
        code="api-attachments-root",
        name="API Attachments Root",
    )
    child = organization_service.create_child(
        parent_id=root.id,
        code="api-attachments-child",
        name="API Attachments Child",
        created_by=system_admin.id,
    )
    sibling = organization_service.create_child(
        parent_id=root.id,
        code="api-attachments-sibling",
        name="API Attachments Sibling",
        created_by=system_admin.id,
    )
    registry = RegistrySchemaService(db_session).create_registry_for_actor(
        actor_user_id=system_admin.id,
        code="api-attachments-registry",
        name="API Attachments Registry",
    )
    _grant_access(
        db_session,
        user_id=card_admin.id,
        role_id=card_role.id,
        organization_id=child.id,
        registry_id=registry.id,
        include_descendants=True,
        created_by=system_admin.id,
    )
    _grant_access(
        db_session,
        user_id=root_limited_admin.id,
        role_id=card_role.id,
        organization_id=root.id,
        registry_id=registry.id,
        include_descendants=False,
        created_by=system_admin.id,
    )
    _grant_access(
        db_session,
        user_id=sibling_admin.id,
        role_id=card_role.id,
        organization_id=sibling.id,
        registry_id=registry.id,
        include_descendants=True,
        created_by=system_admin.id,
    )
    card = CardService(db_session).create_card_for_actor(
        actor_user_id=card_admin.id,
        registry_id=registry.id,
        organization_id=child.id,
        display_name="API Attachment Card",
    )
    return {
        "system_admin": system_admin,
        "card_admin": card_admin,
        "root_limited_admin": root_limited_admin,
        "sibling_admin": sibling_admin,
        "card": card,
    }


def test_api_attachment_upload_list_read_download_and_archive_use_card_scope(
    api_client: TestClient,
    db_session: Session,
) -> None:
    context = _attachment_api_context(db_session)

    upload_response = api_client.post(
        f"/api/v1/cards/{context['card'].id}/attachments",
        headers=_actor_headers(context["card_admin"].id),
        files={"file": ("evidence.txt", b"attachment bytes", "text/plain")},
        data={"title": "Evidence"},
    )
    assert upload_response.status_code == 201, upload_response.text
    upload_payload = upload_response.json()
    assert upload_payload["card_id"] == str(context["card"].id)
    assert upload_payload["title"] == "Evidence"
    assert upload_payload["original_filename"] == "evidence.txt"
    assert upload_payload["content_type"] == "text/plain"
    assert upload_payload["content_length_bytes"] == len(b"attachment bytes")
    assert upload_payload["scanner_status"] == "deferred"
    assert "storage_key" not in upload_payload

    sibling_read = api_client.get(
        f"/api/v1/attachments/{upload_payload['id']}",
        headers=_actor_headers(context["sibling_admin"].id),
    )
    assert sibling_read.status_code == 403, sibling_read.text

    parent_without_descendants_read = api_client.get(
        f"/api/v1/attachments/{upload_payload['id']}",
        headers=_actor_headers(context["root_limited_admin"].id),
    )
    assert parent_without_descendants_read.status_code == 403, parent_without_descendants_read.text

    list_response = api_client.get(
        f"/api/v1/cards/{context['card'].id}/attachments",
        headers=_actor_headers(context["card_admin"].id),
    )
    assert list_response.status_code == 200, list_response.text
    assert [item["id"] for item in list_response.json()["items"]] == [upload_payload["id"]]

    download_response = api_client.get(
        f"/api/v1/attachments/{upload_payload['id']}/content",
        headers=_actor_headers(context["card_admin"].id),
    )
    assert download_response.status_code == 200, download_response.text
    assert download_response.content == b"attachment bytes"
    assert download_response.headers["content-type"] == "text/plain; charset=utf-8"
    assert "attachment;" in download_response.headers["content-disposition"]
    assert "\r" not in download_response.headers["content-disposition"]
    assert "\n" not in download_response.headers["content-disposition"]

    archive_response = api_client.delete(
        f"/api/v1/attachments/{upload_payload['id']}",
        headers=_actor_headers(context["card_admin"].id),
    )
    assert archive_response.status_code == 200, archive_response.text
    assert archive_response.json()["archived_at"] is not None

    active_after_archive = api_client.get(
        f"/api/v1/cards/{context['card'].id}/attachments",
        headers=_actor_headers(context["card_admin"].id),
    )
    assert active_after_archive.status_code == 200, active_after_archive.text
    assert active_after_archive.json()["items"] == []

    archive_read = api_client.get(
        f"/api/v1/attachments/{upload_payload['id']}?include_archive=true",
        headers=_actor_headers(context["card_admin"].id),
    )
    assert archive_read.status_code == 200, archive_read.text
    assert archive_read.json()["id"] == upload_payload["id"]

    audit_actions = set(
        db_session.scalars(
            select(AuditEvent.action).where(AuditEvent.object_type == "card_attachment")
        ).all()
    )
    assert {"attachment_create", "attachment_download", "attachment_archive"} <= audit_actions


def test_api_attachment_upload_rejects_unconfigured_storage(
    db_session: Session,
    tmp_path: Path,
) -> None:
    from app.api.dependencies import get_db_session
    from app.core.config import get_settings

    context = _attachment_api_context(db_session)
    os.environ["ALLOW_DEV_ACTOR_HEADER"] = "true"
    os.environ.pop("REG_ENGINE_STORAGE_ROOT", None)
    get_settings.cache_clear()
    app = create_app()

    def override_session() -> Iterator[Session]:
        yield db_session

    app.dependency_overrides[get_db_session] = override_session
    with TestClient(app) as client:
        response = client.post(
            f"/api/v1/cards/{context['card'].id}/attachments",
            headers=_actor_headers(context["card_admin"].id),
            files={"file": ("blocked.txt", b"blocked", "text/plain")},
        )

    assert response.status_code == 503, response.text

    os.environ.pop("ALLOW_DEV_ACTOR_HEADER", None)
    os.environ["REG_ENGINE_STORAGE_ROOT"] = str(tmp_path)
    get_settings.cache_clear()


def test_api_attachment_upload_rejects_disallowed_content_type(
    db_session: Session,
    tmp_path: Path,
) -> None:
    from app.api.dependencies import get_db_session
    from app.core.config import get_settings

    context = _attachment_api_context(db_session)
    previous_allow_dev_actor = os.environ.get("ALLOW_DEV_ACTOR_HEADER")
    previous_storage_root = os.environ.get("REG_ENGINE_STORAGE_ROOT")
    previous_allowed_types = os.environ.get("REG_ENGINE_ATTACHMENT_ALLOWED_TYPES")
    os.environ["ALLOW_DEV_ACTOR_HEADER"] = "true"
    os.environ["REG_ENGINE_STORAGE_ROOT"] = str(tmp_path)
    os.environ["REG_ENGINE_ATTACHMENT_ALLOWED_TYPES"] = "text/plain"
    get_settings.cache_clear()
    app = create_app()

    def override_session() -> Iterator[Session]:
        yield db_session

    app.dependency_overrides[get_db_session] = override_session
    try:
        with TestClient(app) as client:
            response = client.post(
                f"/api/v1/cards/{context['card'].id}/attachments",
                headers=_actor_headers(context["card_admin"].id),
                files={"file": ("blocked.pdf", b"blocked", "application/pdf")},
            )
    finally:
        _restore_env("ALLOW_DEV_ACTOR_HEADER", previous_allow_dev_actor)
        _restore_env("REG_ENGINE_STORAGE_ROOT", previous_storage_root)
        _restore_env("REG_ENGINE_ATTACHMENT_ALLOWED_TYPES", previous_allowed_types)
        get_settings.cache_clear()

    assert response.status_code == 400, response.text


def test_api_attachment_upload_rejects_oversized_file(
    api_client: TestClient,
    db_session: Session,
) -> None:
    context = _attachment_api_context(db_session)

    response = api_client.post(
        f"/api/v1/cards/{context['card'].id}/attachments",
        headers=_actor_headers(context["card_admin"].id),
        files={"file": ("large.txt", b"x" * 65, "text/plain")},
    )

    assert response.status_code == 413, response.text


def test_upload_reader_rejects_oversized_content_without_unbounded_read() -> None:
    reader = _FakeUpload([b"x" * 65])

    with pytest.raises(attachment_endpoints.AttachmentUploadTooLargeError):
        asyncio.run(attachment_endpoints._read_upload_bytes_with_limit(reader, max_bytes=64))

    assert reader.read_sizes
    assert all(size != -1 for size in reader.read_sizes)
    assert max(reader.read_sizes) <= 65


def test_download_headers_use_safe_content_disposition() -> None:
    headers = attachment_endpoints._download_headers_for_filename('bad\r\n"name";.txt')

    assert headers["X-Attachment-Filename"] == "bad_name_.txt"
    assert headers["Content-Disposition"].startswith("attachment;")
    assert "filename*=UTF-8''bad_name_.txt" in headers["Content-Disposition"]
    assert "\r" not in headers["Content-Disposition"]
    assert "\n" not in headers["Content-Disposition"]

    unicode_headers = attachment_endpoints._download_headers_for_filename("файл.txt")
    assert unicode_headers["X-Attachment-Filename"] == "____.txt"
    assert 'filename="____.txt"' in unicode_headers["Content-Disposition"]
    assert "filename*=UTF-8''%D1%84%D0%B0%D0%B9%D0%BB.txt" in unicode_headers["Content-Disposition"]
