import csv
import io
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

from app.main import create_app
from app.models import (
    AccessGrant,
    AuditEvent,
    CardAttachment,
    DocumentTemplate,
    GeneratedDocument,
    Permission,
    Role,
    StoredFile,
    User,
    role_permissions,
)
from app.services.cards import CardService
from app.services.organizations import OrganizationService
from app.services.registry_schema import RegistrySchemaService


def _require_test_database_url() -> str:
    database_url = os.environ.get("TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("TEST_DATABASE_URL is required for disposable PostgreSQL API tests.")

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
def api_client(db_session: Session) -> Iterator[TestClient]:
    from app.api.dependencies import get_db_session
    from app.core.config import get_settings

    previous_allow_dev_actor = os.environ.get("ALLOW_DEV_ACTOR_HEADER")
    os.environ["ALLOW_DEV_ACTOR_HEADER"] = "true"
    get_settings.cache_clear()
    app = create_app()

    def override_session() -> Iterator[Session]:
        yield db_session

    app.dependency_overrides[get_db_session] = override_session
    try:
        with TestClient(app) as client:
            yield client
    finally:
        if previous_allow_dev_actor is None:
            os.environ.pop("ALLOW_DEV_ACTOR_HEADER", None)
        else:
            os.environ["ALLOW_DEV_ACTOR_HEADER"] = previous_allow_dev_actor
        get_settings.cache_clear()


def _actor_headers(user_id: UUID) -> dict[str, str]:
    return {"X-Actor-User-Id": str(user_id)}


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


def _phase_3_export_context(db_session: Session) -> dict[str, Any]:
    system_admin = _create_user(db_session, "phase3-export-system@example.test", is_superuser=True)
    org_admin = _create_user(db_session, "phase3-export-org-admin@example.test")
    sibling_admin = _create_user(db_session, "phase3-export-sibling-admin@example.test")
    card_role = _create_role_with_permissions(
        db_session,
        "phase3_export_card_admin",
        ["cards.manage"],
    )

    organization_service = OrganizationService(db_session)
    root = organization_service.create_root_for_actor(
        actor_user_id=system_admin.id,
        code="phase3-export-root",
        name="Phase 3 Export Root",
    )
    child = organization_service.create_child(
        parent_id=root.id,
        code="phase3-export-child",
        name="Phase 3 Export Child",
        created_by=system_admin.id,
    )
    sibling = organization_service.create_child(
        parent_id=root.id,
        code="phase3-export-sibling",
        name="Phase 3 Export Sibling",
        created_by=system_admin.id,
    )

    schema_service = RegistrySchemaService(db_session)
    registry = schema_service.create_registry_for_actor(
        actor_user_id=system_admin.id,
        code="phase3-export-registry",
        name="Phase 3 Export Registry",
    )
    main_block = schema_service.create_block_for_actor(
        actor_user_id=system_admin.id,
        registry_id=registry.id,
        code="main",
        title="Main",
    )
    details_block = schema_service.create_block_for_actor(
        actor_user_id=system_admin.id,
        registry_id=registry.id,
        code="details",
        title="Details",
    )
    main_status = schema_service.create_field_for_actor(
        actor_user_id=system_admin.id,
        block_id=main_block.id,
        code="status",
        label="Status",
        field_type="text",
    )
    details_status = schema_service.create_field_for_actor(
        actor_user_id=system_admin.id,
        block_id=details_block.id,
        code="status",
        label="Status",
        field_type="text",
    )

    _grant_access(
        db_session,
        user_id=org_admin.id,
        role_id=card_role.id,
        organization_id=child.id,
        registry_id=registry.id,
        include_descendants=True,
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

    card_service = CardService(db_session)
    child_card = card_service.create_card_for_actor(
        actor_user_id=org_admin.id,
        registry_id=registry.id,
        organization_id=child.id,
        display_name="Visible export card",
    )
    sibling_card = card_service.create_card_for_actor(
        actor_user_id=sibling_admin.id,
        registry_id=registry.id,
        organization_id=sibling.id,
        display_name="Hidden sibling card",
    )
    card_service.set_field_value_for_actor(
        actor_user_id=org_admin.id,
        card_id=child_card.id,
        field_id=main_status.id,
        value="ready",
    )
    card_service.set_field_value_for_actor(
        actor_user_id=org_admin.id,
        card_id=child_card.id,
        field_id=details_status.id,
        value="secondary",
    )
    card_service.set_field_value_for_actor(
        actor_user_id=sibling_admin.id,
        card_id=sibling_card.id,
        field_id=main_status.id,
        value="hidden",
    )

    stored_attachment = StoredFile(
        storage_key="phase3/export/attachment.txt",
        original_filename="attachment.txt",
        content_type="text/plain",
        content_length_bytes=12,
        checksum_sha256="a" * 64,
        created_by=system_admin.id,
    )
    stored_document = StoredFile(
        storage_key="phase3/export/generated.docx",
        original_filename="generated.docx",
        content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        content_length_bytes=128,
        checksum_sha256="b" * 64,
        created_by=system_admin.id,
    )
    db_session.add_all([stored_attachment, stored_document])
    db_session.flush()
    attachment = CardAttachment(
        card_id=child_card.id,
        stored_file_id=stored_attachment.id,
        title="Attachment metadata",
        created_by=system_admin.id,
    )
    template = DocumentTemplate(
        registry_id=registry.id,
        code="phase3_export_template",
        name="Phase 3 Export Template",
        template_body="{{ card.display_name }}",
        created_by=system_admin.id,
    )
    db_session.add_all([attachment, template])
    db_session.flush()
    generated_document = GeneratedDocument(
        card_id=child_card.id,
        template_id=template.id,
        stored_file_id=stored_document.id,
        title="Generated metadata",
        output_filename="generated.docx",
        content_type=stored_document.content_type,
        generated_by=system_admin.id,
    )
    db_session.add(generated_document)
    db_session.flush()

    return {
        "system_admin": system_admin,
        "org_admin": org_admin,
        "sibling_admin": sibling_admin,
        "registry": registry,
        "child_card": child_card,
        "sibling_card": sibling_card,
    }


def test_card_json_export_is_schema_driven_scoped_and_metadata_only(
    api_client: TestClient,
    db_session: Session,
) -> None:
    context = _phase_3_export_context(db_session)

    response = api_client.get(
        f"/api/v1/registries/{context['registry'].id}/exports/cards?format=json",
        headers=_actor_headers(context["org_admin"].id),
    )

    assert response.status_code == 200, response.text
    assert response.headers["content-type"].startswith("application/json")
    payload = response.json()
    assert payload["format_version"] == "card_export_v1"
    assert payload["registry_id"] == str(context["registry"].id)
    assert [card["id"] for card in payload["cards"]] == [str(context["child_card"].id)]
    exported_card = payload["cards"][0]
    assert exported_card["display_name"] == "Visible export card"
    assert exported_card["blocks"]["main"]["instances"][0]["fields"]["status"]["value"] == "ready"
    assert (
        exported_card["blocks"]["details"]["instances"][0]["fields"]["status"]["value"]
        == "secondary"
    )
    assert exported_card["attachments"] == [
        {
            "id": exported_card["attachments"][0]["id"],
            "title": "Attachment metadata",
            "original_filename": "attachment.txt",
            "content_type": "text/plain",
            "content_length_bytes": 12,
            "archived_at": None,
        }
    ]
    assert exported_card["generated_documents"] == [
        {
            "id": exported_card["generated_documents"][0]["id"],
            "title": "Generated metadata",
            "output_filename": "generated.docx",
            "content_type": (
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            ),
            "render_status": "generated",
            "archived_at": None,
        }
    ]
    serialized_payload = response.text
    assert "Hidden sibling card" not in serialized_payload
    assert "storage_key" not in serialized_payload
    assert "checksum_sha256" not in serialized_payload
    assert "stored_file_id" not in serialized_payload
    audit_event = db_session.scalar(
        select(AuditEvent).where(
            AuditEvent.action == "export",
            AuditEvent.object_type == "registry",
            AuditEvent.object_id == context["registry"].id,
        )
    )
    assert audit_event is not None
    assert audit_event.new_data_json == {
        "export_type": "cards",
        "format": "json",
        "card_count": 1,
    }


def test_card_csv_export_uses_block_field_rows_for_duplicate_field_codes(
    api_client: TestClient,
    db_session: Session,
) -> None:
    context = _phase_3_export_context(db_session)

    response = api_client.get(
        f"/api/v1/registries/{context['registry'].id}/exports/cards?format=csv",
        headers=_actor_headers(context["org_admin"].id),
    )

    assert response.status_code == 200, response.text
    assert response.headers["content-type"].startswith("text/csv")
    rows = list(csv.DictReader(io.StringIO(response.text)))
    assert {
        (
            row["card_id"],
            row["block_code"],
            row["block_instance_ordinal"],
            row["field_code"],
            row["field_type"],
            row["value"],
        )
        for row in rows
    } == {
        (str(context["child_card"].id), "main", "0", "status", "text", "ready"),
        (str(context["child_card"].id), "details", "0", "status", "text", "secondary"),
    }
    assert "Hidden sibling card" not in response.text
    assert "storage_key" not in response.text
    assert "checksum_sha256" not in response.text
    assert "stored_file_id" not in response.text
