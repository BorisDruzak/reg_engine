import hashlib
import os
from collections.abc import Iterator
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, select, text
from sqlalchemy.engine import Engine, make_url
from sqlalchemy.orm import Session

from app.models import AccessGrant, AuditEvent, Permission, Role, StoredFile, User, role_permissions
from app.services.attachments import (
    AttachmentService,
    AttachmentServiceError,
    AttachmentStorageError,
    LocalFilesystemAttachmentStorage,
)
from app.services.cards import CardService
from app.services.organizations import OrganizationService
from app.services.permissions import PermissionDeniedError
from app.services.registry_schema import RegistrySchemaService


def _require_test_database_url() -> str:
    database_url = os.environ.get("TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("TEST_DATABASE_URL is required for disposable PostgreSQL attachment tests.")

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


def _attachment_context(db_session: Session) -> dict[str, Any]:
    system_admin = _create_user(db_session, "attachments-system@example.test", is_superuser=True)
    child_admin = _create_user(db_session, "attachments-child-admin@example.test")
    root_admin = _create_user(db_session, "attachments-root-admin@example.test")
    sibling_admin = _create_user(db_session, "attachments-sibling-admin@example.test")
    no_access_user = _create_user(db_session, "attachments-no-access@example.test")
    card_role = _create_role_with_permissions(
        db_session,
        "attachments_card_admin",
        ["cards.manage"],
    )

    organization_service = OrganizationService(db_session)
    root = organization_service.create_root_for_actor(
        actor_user_id=system_admin.id,
        code="attachments-root",
        name="Attachments Root",
    )
    child = organization_service.create_child(
        parent_id=root.id,
        code="attachments-child",
        name="Attachments Child",
        created_by=system_admin.id,
    )
    sibling = organization_service.create_child(
        parent_id=root.id,
        code="attachments-sibling",
        name="Attachments Sibling",
        created_by=system_admin.id,
    )
    registry = RegistrySchemaService(db_session).create_registry_for_actor(
        actor_user_id=system_admin.id,
        code="attachments-registry",
        name="Attachments Registry",
    )

    _grant_access(
        db_session,
        user_id=child_admin.id,
        role_id=card_role.id,
        organization_id=child.id,
        registry_id=registry.id,
        include_descendants=True,
        created_by=system_admin.id,
    )
    _grant_access(
        db_session,
        user_id=root_admin.id,
        role_id=card_role.id,
        organization_id=root.id,
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

    card = CardService(db_session).create_card_for_actor(
        actor_user_id=child_admin.id,
        registry_id=registry.id,
        organization_id=child.id,
        display_name="Attachment card",
    )

    return {
        "system_admin": system_admin,
        "child_admin": child_admin,
        "root_admin": root_admin,
        "sibling_admin": sibling_admin,
        "no_access_user": no_access_user,
        "root": root,
        "child": child,
        "sibling": sibling,
        "registry": registry,
        "card": card,
    }


@pytest.fixture()
def attachment_service(db_session: Session, tmp_path: Path) -> AttachmentService:
    return AttachmentService(
        db_session,
        storage=LocalFilesystemAttachmentStorage(tmp_path),
        max_attachment_bytes=32,
    )


def test_storage_key_rejects_path_traversal(tmp_path: Path) -> None:
    storage = LocalFilesystemAttachmentStorage(tmp_path)

    for unsafe_key in ["../escape", "attachments/../../escape", "/absolute/path", r"..\escape"]:
        with pytest.raises(AttachmentStorageError):
            storage.read_bytes(unsafe_key)


def test_attachment_metadata_rejects_empty_file(
    db_session: Session,
    attachment_service: AttachmentService,
) -> None:
    context = _attachment_context(db_session)

    with pytest.raises(AttachmentServiceError):
        attachment_service.create_attachment_for_actor(
            actor_user_id=context["child_admin"].id,
            card_id=context["card"].id,
            original_filename="empty.txt",
            content_type="text/plain",
            content=b"",
        )


def test_attachment_metadata_rejects_oversized_file(
    db_session: Session,
    attachment_service: AttachmentService,
) -> None:
    context = _attachment_context(db_session)

    with pytest.raises(AttachmentServiceError):
        attachment_service.create_attachment_for_actor(
            actor_user_id=context["child_admin"].id,
            card_id=context["card"].id,
            original_filename="large.txt",
            content_type="text/plain",
            content=b"x" * 33,
        )


def test_attachment_metadata_records_checksum_sha256(
    db_session: Session,
    attachment_service: AttachmentService,
) -> None:
    context = _attachment_context(db_session)
    content = b"hello attachment"

    attachment = attachment_service.create_attachment_for_actor(
        actor_user_id=context["child_admin"].id,
        card_id=context["card"].id,
        original_filename="hello.txt",
        content_type="text/plain",
        content=content,
    )

    stored_file = db_session.get(StoredFile, attachment.stored_file_id)
    assert stored_file is not None
    assert stored_file.checksum_sha256 == hashlib.sha256(content).hexdigest()
    assert stored_file.content_length_bytes == len(content)


def test_malware_scanner_hook_records_deferred_status(
    db_session: Session,
    attachment_service: AttachmentService,
) -> None:
    context = _attachment_context(db_session)

    attachment = attachment_service.create_attachment_for_actor(
        actor_user_id=context["child_admin"].id,
        card_id=context["card"].id,
        original_filename="scan.txt",
        content_type="text/plain",
        content=b"scan me",
    )

    stored_file = db_session.get(StoredFile, attachment.stored_file_id)
    assert stored_file is not None
    assert stored_file.scanner_status == "deferred"


def test_create_attachment_metadata_requires_editable_card(
    db_session: Session,
    attachment_service: AttachmentService,
) -> None:
    context = _attachment_context(db_session)

    with pytest.raises(PermissionDeniedError):
        attachment_service.create_attachment_for_actor(
            actor_user_id=context["sibling_admin"].id,
            card_id=context["card"].id,
            original_filename="forbidden.txt",
            content_type="text/plain",
            content=b"forbidden",
        )


def test_read_attachment_metadata_requires_readable_card(
    db_session: Session,
    attachment_service: AttachmentService,
) -> None:
    context = _attachment_context(db_session)
    attachment = attachment_service.create_attachment_for_actor(
        actor_user_id=context["child_admin"].id,
        card_id=context["card"].id,
        original_filename="read.txt",
        content_type="text/plain",
        content=b"readable",
    )

    with pytest.raises(PermissionDeniedError):
        attachment_service.read_attachment_for_actor(
            actor_user_id=context["no_access_user"].id,
            attachment_id=attachment.id,
        )


def test_descendant_admin_can_read_child_card_attachment(
    db_session: Session,
    attachment_service: AttachmentService,
) -> None:
    context = _attachment_context(db_session)
    attachment = attachment_service.create_attachment_for_actor(
        actor_user_id=context["child_admin"].id,
        card_id=context["card"].id,
        original_filename="descendant.txt",
        content_type="text/plain",
        content=b"descendant",
    )

    read_attachment = attachment_service.read_attachment_for_actor(
        actor_user_id=context["root_admin"].id,
        attachment_id=attachment.id,
    )

    assert read_attachment.id == attachment.id


def test_sibling_admin_cannot_read_card_attachment(
    db_session: Session,
    attachment_service: AttachmentService,
) -> None:
    context = _attachment_context(db_session)
    attachment = attachment_service.create_attachment_for_actor(
        actor_user_id=context["child_admin"].id,
        card_id=context["card"].id,
        original_filename="sibling.txt",
        content_type="text/plain",
        content=b"sibling",
    )

    with pytest.raises(PermissionDeniedError):
        attachment_service.read_attachment_for_actor(
            actor_user_id=context["sibling_admin"].id,
            attachment_id=attachment.id,
        )


def test_archive_attachment_preserves_file_metadata_and_writes_audit(
    db_session: Session,
    attachment_service: AttachmentService,
) -> None:
    context = _attachment_context(db_session)
    attachment = attachment_service.create_attachment_for_actor(
        actor_user_id=context["child_admin"].id,
        card_id=context["card"].id,
        original_filename="archive.txt",
        content_type="text/plain",
        content=b"archive",
    )
    stored_file_id = attachment.stored_file_id

    archived = attachment_service.archive_attachment_for_actor(
        actor_user_id=context["child_admin"].id,
        attachment_id=attachment.id,
        archive_reason="No longer needed",
    )

    stored_file = db_session.get(StoredFile, stored_file_id)
    audit_event = db_session.scalar(
        select(AuditEvent).where(
            AuditEvent.object_type == "card_attachment",
            AuditEvent.object_id == archived.id,
            AuditEvent.action == "attachment_archive",
        )
    )
    assert archived.archived_at is not None
    assert archived.archive_reason == "No longer needed"
    assert stored_file is not None
    assert stored_file.original_filename == "archive.txt"
    assert stored_file.checksum_sha256 == hashlib.sha256(b"archive").hexdigest()
    assert audit_event is not None


def test_archived_attachment_is_hidden_from_default_active_list(
    db_session: Session,
    attachment_service: AttachmentService,
) -> None:
    context = _attachment_context(db_session)
    attachment = attachment_service.create_attachment_for_actor(
        actor_user_id=context["child_admin"].id,
        card_id=context["card"].id,
        original_filename="hidden.txt",
        content_type="text/plain",
        content=b"hidden",
    )
    attachment_service.archive_attachment_for_actor(
        actor_user_id=context["child_admin"].id,
        attachment_id=attachment.id,
    )

    assert (
        attachment_service.list_attachments_for_actor(
            actor_user_id=context["child_admin"].id,
            card_id=context["card"].id,
        )
        == []
    )


def test_archived_attachment_is_readable_in_archive_scope_for_card_reader(
    db_session: Session,
    attachment_service: AttachmentService,
) -> None:
    context = _attachment_context(db_session)
    attachment = attachment_service.create_attachment_for_actor(
        actor_user_id=context["child_admin"].id,
        card_id=context["card"].id,
        original_filename="archived-read.txt",
        content_type="text/plain",
        content=b"archived-read",
    )
    attachment_service.archive_attachment_for_actor(
        actor_user_id=context["child_admin"].id,
        attachment_id=attachment.id,
    )

    archived = attachment_service.read_attachment_for_actor(
        actor_user_id=context["root_admin"].id,
        attachment_id=attachment.id,
        include_archive=True,
    )

    assert archived.id == attachment.id


def test_public_link_cannot_upload_or_download_attachment(
    db_session: Session,
    attachment_service: AttachmentService,
) -> None:
    context = _attachment_context(db_session)
    attachment = attachment_service.create_attachment_for_actor(
        actor_user_id=context["child_admin"].id,
        card_id=context["card"].id,
        original_filename="public.txt",
        content_type="text/plain",
        content=b"public",
    )

    with pytest.raises(PermissionDeniedError):
        attachment_service.create_attachment_from_public_link(
            actor_public_link_id=uuid4(),
            card_id=context["card"].id,
            original_filename="blocked.txt",
            content_type="text/plain",
            content=b"blocked",
        )
    with pytest.raises(PermissionDeniedError):
        attachment_service.read_attachment_content_from_public_link(
            actor_public_link_id=uuid4(),
            attachment_id=attachment.id,
        )


def test_superseded_card_attachment_is_read_only(
    db_session: Session,
    attachment_service: AttachmentService,
) -> None:
    context = _attachment_context(db_session)
    attachment = attachment_service.create_attachment_for_actor(
        actor_user_id=context["child_admin"].id,
        card_id=context["card"].id,
        original_filename="superseded.txt",
        content_type="text/plain",
        content=b"superseded",
    )

    CardService(db_session).transfer_card_for_actor(
        actor_user_id=context["system_admin"].id,
        card_id=context["card"].id,
        target_organization_id=context["sibling"].id,
    )

    read_attachment = attachment_service.read_attachment_for_actor(
        actor_user_id=context["child_admin"].id,
        attachment_id=attachment.id,
        include_archive=True,
    )
    assert read_attachment.id == attachment.id

    with pytest.raises(AttachmentServiceError):
        attachment_service.archive_attachment_for_actor(
            actor_user_id=context["child_admin"].id,
            attachment_id=attachment.id,
        )
    with pytest.raises(AttachmentServiceError):
        attachment_service.create_attachment_for_actor(
            actor_user_id=context["child_admin"].id,
            card_id=context["card"].id,
            original_filename="blocked.txt",
            content_type="text/plain",
            content=b"blocked",
        )
