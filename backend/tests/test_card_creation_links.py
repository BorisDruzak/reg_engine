import os
from collections.abc import Iterator
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from cryptography.fernet import Fernet
from sqlalchemy import create_engine, func, select, text
from sqlalchemy.engine import Engine, make_url
from sqlalchemy.orm import Session

from app.models import AuditEvent, Card, CardCreationLink, CardTemplate, User
from app.services.card_creation_links import CardCreationLinkService, CreationLinkTokenCipher
from app.services.cards import CardService
from app.services.organizations import OrganizationService
from app.services.registry_schema import RegistrySchemaService


def test_creation_link_token_cipher_keeps_raw_token_out_of_stored_value() -> None:
    raw_token = "public-token-that-must-not-be-stored-plain"
    cipher = CreationLinkTokenCipher(Fernet.generate_key().decode("ascii"))

    ciphertext = cipher.encrypt(raw_token)

    assert ciphertext != raw_token
    assert raw_token not in ciphertext
    assert cipher.decrypt(ciphertext) == raw_token


def _require_test_database_url() -> str:
    database_url = os.environ.get("TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("TEST_DATABASE_URL is required for disposable PostgreSQL service tests.")
    database_name = make_url(database_url).database or ""
    if database_name == "reg_engine" or not database_name.endswith("_test"):
        pytest.fail("TEST_DATABASE_URL must point to a disposable database ending with '_test'.")
    return database_url


def _alembic_config() -> Config:
    backend_root = Path(__file__).resolve().parents[1]
    config = Config(str(backend_root / "alembic.ini"))
    config.set_main_option("script_location", str(backend_root / "migrations"))
    return config


def _reset_public_schema(engine: Engine) -> None:
    with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as connection:
        connection.execute(text("DROP SCHEMA IF EXISTS public CASCADE"))
        connection.execute(text("CREATE SCHEMA public"))


@pytest.fixture(scope="module")
def migrated_test_engine() -> Iterator[Engine]:
    engine = create_engine(_require_test_database_url())
    _reset_public_schema(engine)
    command.upgrade(_alembic_config(), "head")
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


def _creation_link_context(db_session: Session) -> tuple[User, object, object, object, object]:
    admin = User(
        email="creation-link-admin@example.test",
        display_name="Администратор создания",
        is_superuser=True,
    )
    db_session.add(admin)
    db_session.flush()
    organizations = OrganizationService(db_session)
    source_organization = organizations.create_root_for_actor(
        actor_user_id=admin.id,
        code="creation-link-source",
        name="Организация ссылки",
    )
    target_organization = organizations.create_child(
        parent_id=source_organization.id,
        code="creation-link-target",
        name="Организация карточки",
        created_by=admin.id,
    )
    registry = RegistrySchemaService(db_session).create_registry_for_actor(
        actor_user_id=admin.id,
        code="creation-link-registry",
        name="Реестр ссылок создания",
    )
    template = db_session.scalar(
        select(CardTemplate).where(CardTemplate.registry_id == registry.id)
    )
    assert template is not None
    return admin, source_organization, target_organization, registry, template


def test_admin_can_create_list_and_close_card_creation_link(db_session: Session) -> None:
    admin, source_organization, _, registry, template = _creation_link_context(db_session)
    service = CardCreationLinkService(
        db_session,
        token_cipher=CreationLinkTokenCipher(Fernet.generate_key().decode("ascii")),
    )

    created = service.create_for_actor(
        actor_user_id=admin.id,
        registry_id=registry.id,
        card_template_id=template.id,
        organization_ids=[source_organization.id],
    )

    stored = db_session.get(CardCreationLink, created.creation_link.id)
    assert stored is not None
    assert stored.token_hash != created.raw_token
    assert created.raw_token not in stored.token_ciphertext
    assert [
        item.raw_token
        for item in service.list_for_actor(
            actor_user_id=admin.id,
            registry_id=registry.id,
        )
    ] == [created.raw_token]

    closed = service.close_for_actor(
        actor_user_id=admin.id,
        creation_link_id=created.creation_link.id,
    )

    assert closed.closed_at is not None
    audit_events = list(
        db_session.scalars(
            select(AuditEvent).where(AuditEvent.object_id == created.creation_link.id)
        ).all()
    )
    assert {event.action for event in audit_events} >= {"create", "close"}
    assert all(created.raw_token not in str(event.new_data_json) for event in audit_events)


def test_admin_moves_active_card_to_allowed_target_organization(db_session: Session) -> None:
    admin, source_organization, target_organization, registry, _ = _creation_link_context(
        db_session
    )
    card_service = CardService(db_session)
    card = card_service.create_card_for_actor(
        actor_user_id=admin.id,
        registry_id=registry.id,
        organization_id=source_organization.id,
    )

    moved = card_service.move_card_organization_for_actor(
        actor_user_id=admin.id,
        card_id=card.id,
        target_organization_id=target_organization.id,
    )

    assert moved.id == card.id
    assert moved.organization_id == target_organization.id
    assert db_session.scalar(select(func.count()).select_from(Card)) == 1
