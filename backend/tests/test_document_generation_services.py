import os
from collections.abc import Iterator
from io import BytesIO
from pathlib import Path
from typing import Any
from uuid import UUID
from zipfile import ZipFile

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, select, text
from sqlalchemy.engine import Engine, make_url
from sqlalchemy.orm import Session

from app.models import AccessGrant, AuditEvent, Permission, Role, StoredFile, User, role_permissions
from app.services.attachments import LocalFilesystemAttachmentStorage
from app.services.cards import CardService
from app.services.documents import DocumentService, DocumentServiceError
from app.services.organizations import OrganizationService
from app.services.permissions import PermissionDeniedError
from app.services.registry_schema import RegistrySchemaService


def _require_test_database_url() -> str:
    database_url = os.environ.get("TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("TEST_DATABASE_URL is required for disposable PostgreSQL document tests.")

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


def _create_user(
    session: Session,
    email: str,
    display_name: str = "Test user",
    *,
    is_superuser: bool = False,
) -> User:
    user = User(email=email, display_name=display_name, is_superuser=is_superuser)
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


def _document_context(db_session: Session) -> dict[str, Any]:
    system_admin = _create_user(db_session, "documents-system@example.test", is_superuser=True)
    schema_admin = _create_user(db_session, "documents-schema-admin@example.test")
    card_admin = _create_user(db_session, "documents-card-admin@example.test")
    sibling_admin = _create_user(db_session, "documents-sibling-admin@example.test")
    no_access_user = _create_user(db_session, "documents-no-access@example.test")
    schema_role = _create_role_with_permissions(
        db_session,
        "documents_schema_admin",
        ["registry.schema.manage"],
    )
    card_role = _create_role_with_permissions(
        db_session,
        "documents_card_admin",
        ["cards.manage"],
    )

    organization_service = OrganizationService(db_session)
    root = organization_service.create_root_for_actor(
        actor_user_id=system_admin.id,
        code="documents-root",
        name="Documents Root",
    )
    child = organization_service.create_child(
        parent_id=root.id,
        code="documents-child",
        name="Documents Child",
        created_by=system_admin.id,
    )
    sibling = organization_service.create_child(
        parent_id=root.id,
        code="documents-sibling",
        name="Documents Sibling",
        created_by=system_admin.id,
    )
    schema_service = RegistrySchemaService(db_session)
    registry = schema_service.create_registry_for_actor(
        actor_user_id=system_admin.id,
        code="documents-registry",
        name="Documents Registry",
    )

    _grant_access(
        db_session,
        user_id=schema_admin.id,
        role_id=schema_role.id,
        registry_id=registry.id,
        created_by=system_admin.id,
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
        user_id=sibling_admin.id,
        role_id=card_role.id,
        organization_id=sibling.id,
        registry_id=registry.id,
        include_descendants=True,
        created_by=system_admin.id,
    )

    block = schema_service.create_block_for_actor(
        actor_user_id=schema_admin.id,
        registry_id=registry.id,
        code="main",
        title="Основной блок",
    )
    field = schema_service.create_field_for_actor(
        actor_user_id=schema_admin.id,
        block_id=block.id,
        code="full_name",
        label="Название",
        field_type="text",
    )
    card_service = CardService(db_session)
    card = card_service.create_card_for_actor(
        actor_user_id=card_admin.id,
        registry_id=registry.id,
        organization_id=child.id,
        display_name="Тестовая карточка",
    )
    card_service.set_field_value_for_actor(
        actor_user_id=card_admin.id,
        card_id=card.id,
        field_id=field.id,
        value="Значение из карточки",
    )

    return {
        "system_admin": system_admin,
        "schema_admin": schema_admin,
        "card_admin": card_admin,
        "sibling_admin": sibling_admin,
        "no_access_user": no_access_user,
        "root": root,
        "child": child,
        "sibling": sibling,
        "registry": registry,
        "block": block,
        "field": field,
        "card": card,
    }


@pytest.fixture()
def document_service(db_session: Session, tmp_path: Path) -> DocumentService:
    return DocumentService(
        db_session,
        storage=LocalFilesystemAttachmentStorage(tmp_path, key_prefix="generated_documents"),
    )


def test_document_template_creation_requires_schema_permission_and_writes_audit(
    db_session: Session,
    document_service: DocumentService,
) -> None:
    context = _document_context(db_session)

    with pytest.raises(PermissionDeniedError):
        document_service.create_template_for_actor(
            actor_user_id=context["no_access_user"].id,
            registry_id=context["registry"].id,
            code="summary",
            name="Сводка",
            template_body="Карточка: {{ card.display_name }}",
        )

    template = document_service.create_template_for_actor(
        actor_user_id=context["schema_admin"].id,
        registry_id=context["registry"].id,
        code="summary",
        name="Сводка",
        template_body="Карточка: {{ card.display_name }}",
    )

    audit_event = db_session.scalar(
        select(AuditEvent).where(
            AuditEvent.object_type == "document_template",
            AuditEvent.object_id == template.id,
            AuditEvent.action == "document_template_create",
        )
    )
    assert template.template_format == "docx_text_v1"
    assert audit_event is not None


def test_generated_document_renders_schema_driven_card_data_to_storage(
    db_session: Session,
    document_service: DocumentService,
) -> None:
    context = _document_context(db_session)
    template = document_service.create_template_for_actor(
        actor_user_id=context["schema_admin"].id,
        registry_id=context["registry"].id,
        code="card-summary",
        name="Сводка карточки",
        template_body=(
            "Карточка: {{ card.display_name }}\n"
            "Поле: {{ fields.main.full_name }}\n"
            "ID: {{ card.id }}"
        ),
        output_filename_template="{{ card.display_name }}.docx",
    )

    generated = document_service.generate_document_for_actor(
        actor_user_id=context["card_admin"].id,
        template_id=template.id,
        card_id=context["card"].id,
    )

    stored_file = db_session.get(StoredFile, generated.stored_file_id)
    assert stored_file is not None
    assert generated.card_id == context["card"].id
    assert generated.template_id == template.id
    assert generated.output_filename == "Тестовая карточка.docx"
    assert stored_file.original_filename == "Тестовая карточка.docx"
    assert (
        stored_file.content_type
        == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )

    content = document_service.read_generated_document_content_for_actor(
        actor_user_id=context["card_admin"].id,
        generated_document_id=generated.id,
    )
    with ZipFile(BytesIO(content)) as docx:
        rendered_xml = docx.read("word/document.xml").decode("utf-8")
    assert "Карточка: Тестовая карточка" in rendered_xml
    assert "Поле: Значение из карточки" in rendered_xml
    assert str(context["card"].id) in rendered_xml

    audit_event = db_session.scalar(
        select(AuditEvent).where(
            AuditEvent.object_type == "generated_document",
            AuditEvent.object_id == generated.id,
            AuditEvent.action == "generated_document_generate",
        )
    )
    assert audit_event is not None


def test_generated_document_rejects_unknown_placeholder(
    db_session: Session,
    document_service: DocumentService,
) -> None:
    context = _document_context(db_session)
    template = document_service.create_template_for_actor(
        actor_user_id=context["schema_admin"].id,
        registry_id=context["registry"].id,
        code="broken",
        name="Broken",
        template_body="Missing: {{ fields.main.missing }}",
    )

    with pytest.raises(DocumentServiceError):
        document_service.generate_document_for_actor(
            actor_user_id=context["card_admin"].id,
            template_id=template.id,
            card_id=context["card"].id,
        )


def test_generated_document_render_requires_cards_manage_in_scope(
    db_session: Session,
    document_service: DocumentService,
) -> None:
    context = _document_context(db_session)
    template = document_service.create_template_for_actor(
        actor_user_id=context["schema_admin"].id,
        registry_id=context["registry"].id,
        code="scope",
        name="Scope",
        template_body="Карточка: {{ card.display_name }}",
    )

    with pytest.raises(PermissionDeniedError):
        document_service.generate_document_for_actor(
            actor_user_id=context["sibling_admin"].id,
            template_id=template.id,
            card_id=context["card"].id,
        )


def test_generated_document_does_not_render_superseded_card(
    db_session: Session,
    document_service: DocumentService,
) -> None:
    context = _document_context(db_session)
    template = document_service.create_template_for_actor(
        actor_user_id=context["schema_admin"].id,
        registry_id=context["registry"].id,
        code="superseded",
        name="Superseded",
        template_body="Карточка: {{ card.display_name }}",
    )
    CardService(db_session).transfer_card_for_actor(
        actor_user_id=context["system_admin"].id,
        card_id=context["card"].id,
        target_organization_id=context["sibling"].id,
    )

    with pytest.raises(DocumentServiceError):
        document_service.generate_document_for_actor(
            actor_user_id=context["card_admin"].id,
            template_id=template.id,
            card_id=context["card"].id,
        )


def test_archived_template_cannot_render_and_writes_audit(
    db_session: Session,
    document_service: DocumentService,
) -> None:
    context = _document_context(db_session)
    template = document_service.create_template_for_actor(
        actor_user_id=context["schema_admin"].id,
        registry_id=context["registry"].id,
        code="archive-template",
        name="Archive template",
        template_body="Карточка: {{ card.display_name }}",
    )

    archived = document_service.archive_template_for_actor(
        actor_user_id=context["schema_admin"].id,
        template_id=template.id,
        archive_reason="Replaced",
    )

    with pytest.raises(DocumentServiceError):
        document_service.generate_document_for_actor(
            actor_user_id=context["card_admin"].id,
            template_id=template.id,
            card_id=context["card"].id,
        )

    audit_event = db_session.scalar(
        select(AuditEvent).where(
            AuditEvent.object_type == "document_template",
            AuditEvent.object_id == archived.id,
            AuditEvent.action == "document_template_archive",
        )
    )
    assert archived.archived_at is not None
    assert archived.is_active is False
    assert audit_event is not None


def test_generated_document_archive_preserves_stored_file_and_writes_audit(
    db_session: Session,
    document_service: DocumentService,
) -> None:
    context = _document_context(db_session)
    template = document_service.create_template_for_actor(
        actor_user_id=context["schema_admin"].id,
        registry_id=context["registry"].id,
        code="archive-generated",
        name="Archive generated",
        template_body="Карточка: {{ card.display_name }}",
    )
    generated = document_service.generate_document_for_actor(
        actor_user_id=context["card_admin"].id,
        template_id=template.id,
        card_id=context["card"].id,
    )
    stored_file_id = generated.stored_file_id

    archived = document_service.archive_generated_document_for_actor(
        actor_user_id=context["card_admin"].id,
        generated_document_id=generated.id,
        archive_reason="Replaced",
    )

    stored_file = db_session.get(StoredFile, stored_file_id)
    audit_event = db_session.scalar(
        select(AuditEvent).where(
            AuditEvent.object_type == "generated_document",
            AuditEvent.object_id == archived.id,
            AuditEvent.action == "generated_document_archive",
        )
    )
    assert archived.archived_at is not None
    assert archived.archive_reason == "Replaced"
    assert stored_file is not None
    assert stored_file.archived_at is None
    assert document_service.read_generated_document_content_for_actor(
        actor_user_id=context["card_admin"].id,
        generated_document_id=generated.id,
        include_archive=True,
    )
    assert audit_event is not None
