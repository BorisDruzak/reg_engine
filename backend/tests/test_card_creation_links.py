import os
from collections.abc import Iterator
from pathlib import Path
from uuid import UUID, uuid4

import pytest
from alembic import command
from alembic.config import Config
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select, text
from sqlalchemy.engine import Engine, make_url
from sqlalchemy.orm import Session

from app.main import create_app
from app.models import (
    AuditEvent,
    Card,
    CardCreationLink,
    CardCreationLinkCard,
    CardPublicLink,
    CardTemplate,
    FieldValue,
    User,
)
from app.services.card_creation_links import (
    CardCreationLinkError,
    CardCreationLinkService,
    CreationLinkTokenCipher,
)
from app.services.cards import CardService
from app.services.organizations import OrganizationService
from app.services.public_links import PublicLinkService
from app.services.registry_schema import RegistrySchemaService


def test_creation_link_token_cipher_keeps_raw_token_out_of_stored_value() -> None:
    raw_token = "public-token-that-must-not-be-stored-plain"
    cipher = CreationLinkTokenCipher(Fernet.generate_key().decode("ascii"))

    ciphertext = cipher.encrypt(raw_token)

    assert ciphertext != raw_token
    assert raw_token not in ciphertext
    assert cipher.decrypt(ciphertext) == raw_token


def test_creation_link_history_allows_a_nonarchived_inactive_template(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cipher = CreationLinkTokenCipher(Fernet.generate_key().decode("ascii"))
    registry_id = uuid4()
    template = type(
        "Template",
        (),
        {
            "id": uuid4(),
            "registry_id": registry_id,
            "name": "Inactive template",
            "archived_at": None,
            "is_active": False,
        },
    )()
    creation_link = type(
        "CreationLink",
        (),
        {
            "id": uuid4(),
            "registry_id": registry_id,
            "card_template_id": template.id,
            "token_ciphertext": cipher.encrypt("history-token"),
        },
    )()

    class ScalarResult:
        def all(self) -> list[object]:
            return []

    class HistorySession:
        def get(self, model: object, _model_id: object) -> object:
            assert model is CardTemplate
            return template

        def scalars(self, _statement: object) -> ScalarResult:
            return ScalarResult()

    service = CardCreationLinkService(HistorySession(), token_cipher=cipher)  # type: ignore[arg-type]
    monkeypatch.setattr(
        "app.services.card_creation_links.CardCreationLinkValue",
        lambda **payload: payload,
    )

    result = service._link_value(
        creation_link,
        actor_user_id=uuid4(),
        organizations=[],
    )

    assert result["card_template_name"] == "Inactive template"
    assert result["raw_token"] == "history-token"


def test_creation_link_creation_rejects_an_inactive_template() -> None:
    registry_id = uuid4()
    template = type(
        "Template",
        (),
        {
            "id": uuid4(),
            "registry_id": registry_id,
            "archived_at": None,
            "is_active": False,
        },
    )()

    class TemplateSession:
        def get(self, model: object, _model_id: object) -> object:
            assert model is CardTemplate
            return template

    service = CardCreationLinkService(TemplateSession())  # type: ignore[arg-type]

    with pytest.raises(CardCreationLinkError, match="Card template was not found"):
        service._active_template(template.id, registry_id=registry_id)  # noqa: SLF001


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


@pytest.fixture()
def api_client(db_session: Session, monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    from app.api.dependencies import get_db_session
    from app.core.config import get_settings

    monkeypatch.setenv("ALLOW_DEV_ACTOR_HEADER", "true")
    monkeypatch.setenv(
        "REG_ENGINE_PUBLIC_LINK_TOKEN_ENCRYPTION_KEY",
        Fernet.generate_key().decode("ascii"),
    )
    get_settings.cache_clear()
    app = create_app()

    def override_session() -> Iterator[Session]:
        yield db_session

    app.dependency_overrides[get_db_session] = override_session
    try:
        with TestClient(app) as client:
            yield client
    finally:
        get_settings.cache_clear()


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


def test_first_public_save_creates_card_and_indefinite_child_link(
    db_session: Session,
) -> None:
    admin, source_organization, target_organization, registry, _ = _creation_link_context(
        db_session
    )
    schema = RegistrySchemaService(db_session)
    block = schema.create_block_for_actor(
        actor_user_id=admin.id,
        registry_id=registry.id,
        code="creation-link-block",
        title="Данные по ссылке",
    )
    field = schema.create_field_for_actor(
        actor_user_id=admin.id,
        block_id=block.id,
        code="creation-link-name",
        label="Наименование",
        field_type="text",
        public_editable=True,
    )
    template = db_session.scalar(
        select(CardTemplate).where(CardTemplate.registry_id == registry.id)
    )
    assert template is not None
    service = CardCreationLinkService(
        db_session,
        token_cipher=CreationLinkTokenCipher(Fernet.generate_key().decode("ascii")),
    )
    creation_link = service.create_for_actor(
        actor_user_id=admin.id,
        registry_id=registry.id,
        card_template_id=template.id,
        organization_ids=[source_organization.id],
    )

    preview = service.preview_for_public(raw_token=creation_link.raw_token)

    assert preview.selected_organization_id == source_organization.id
    assert [item.id for item in preview.organizations] == [source_organization.id]
    assert [
        preview_field.field_id
        for preview_block in preview.blocks
        for preview_instance in preview_block.instances
        for preview_field in preview_instance.fields
    ] == [field.id]

    with pytest.raises(CardCreationLinkError):
        service.create_card_from_public_link(
            raw_token=creation_link.raw_token,
            organization_id=source_organization.id,
            field_id=field.id,
            value="   ",
        )

    assert db_session.scalar(select(func.count()).select_from(Card)) == 0

    created = service.create_card_from_public_link(
        raw_token=creation_link.raw_token,
        organization_id=source_organization.id,
        field_id=field.id,
        value="Первая карточка",
    )

    assert created.card.organization_id == source_organization.id
    assert created.child_raw_token
    child_link = db_session.get(CardPublicLink, created.child_public_link.id)
    assert child_link is not None
    assert child_link.expires_at is None
    assert child_link.review_enabled is False
    assert db_session.scalar(select(func.count()).select_from(Card)) == 1
    relation = db_session.scalar(
        select(CardCreationLinkCard).where(CardCreationLinkCard.card_id == created.card.id)
    )
    assert relation is not None
    assert created.child_raw_token not in relation.child_token_ciphertext

    service.close_for_actor(
        actor_user_id=admin.id,
        creation_link_id=creation_link.creation_link.id,
    )
    child_preview = PublicLinkService(db_session).preview_public_link(
        raw_token=created.child_raw_token
    )
    assert child_preview.card_id == created.card.id

    with pytest.raises(CardCreationLinkError):
        service.create_card_from_public_link(
            raw_token=creation_link.raw_token,
            organization_id=source_organization.id,
            field_id=field.id,
            value="New card after parent close",
        )
    field_value = db_session.scalar(
        select(FieldValue).where(
            FieldValue.card_id == created.card.id,
            FieldValue.field_id == field.id,
        )
    )
    assert field_value is not None
    assert field_value.value_text == "Первая карточка"

    with pytest.raises(CardCreationLinkError):
        service.create_card_from_public_link(
            raw_token=creation_link.raw_token,
            organization_id=target_organization.id,
            field_id=field.id,
            value="Недоступная организация",
        )

    assert db_session.scalar(select(func.count()).select_from(Card)) == 1


def test_public_creation_link_api_creates_draft_after_organization_choice(
    api_client: TestClient,
    db_session: Session,
) -> None:
    admin, source_organization, _, registry, template = _creation_link_context(db_session)
    creation_link = CardCreationLinkService(db_session).create_for_actor(
        actor_user_id=admin.id,
        registry_id=registry.id,
        card_template_id=template.id,
        organization_ids=[source_organization.id],
    )

    created = api_client.post(
        "/api/v1/public/card-creation-links/create-draft",
        json={
            "raw_token": creation_link.raw_token,
            "organization_id": str(source_organization.id),
        },
    )

    assert created.status_code == 201, created.text
    assert created.json()["child_raw_token"]
    assert db_session.scalar(select(func.count()).select_from(Card)) == 1
    assert db_session.scalar(select(func.count()).select_from(FieldValue)) == 0
    relation = db_session.scalar(
        select(CardCreationLinkCard).where(
            CardCreationLinkCard.card_id == UUID(created.json()["card_id"])
        )
    )
    assert relation is not None
    child_link = db_session.get(CardPublicLink, relation.child_public_link_id)
    assert child_link is not None
    assert child_link.expires_at is None


def test_public_creation_link_api_creates_only_after_first_value(
    api_client: TestClient,
    db_session: Session,
) -> None:
    admin, source_organization, _, registry, _ = _creation_link_context(db_session)
    schema = RegistrySchemaService(db_session)
    block = schema.create_block_for_actor(
        actor_user_id=admin.id,
        registry_id=registry.id,
        code="creation-api-block",
        title="Публичные данные",
    )
    field = schema.create_field_for_actor(
        actor_user_id=admin.id,
        block_id=block.id,
        code="creation-api-name",
        label="Название",
        field_type="text",
        public_editable=True,
    )
    template = db_session.scalar(
        select(CardTemplate).where(CardTemplate.registry_id == registry.id)
    )
    assert template is not None
    creation_link = CardCreationLinkService(db_session).create_for_actor(
        actor_user_id=admin.id,
        registry_id=registry.id,
        card_template_id=template.id,
        organization_ids=[source_organization.id],
    )

    preview = api_client.post(
        "/api/v1/public/card-creation-links/preview",
        json={"raw_token": creation_link.raw_token},
    )

    assert preview.status_code == 200, preview.text
    assert preview.json()["selected_organization_id"] == str(source_organization.id)
    assert db_session.scalar(select(func.count()).select_from(Card)) == 0

    empty_save = api_client.post(
        "/api/v1/public/card-creation-links/first-save",
        json={
            "raw_token": creation_link.raw_token,
            "organization_id": str(source_organization.id),
            "field_id": str(field.id),
            "value": " ",
        },
    )

    assert empty_save.status_code == 400, empty_save.text
    assert db_session.scalar(select(func.count()).select_from(Card)) == 0

    first_save = api_client.post(
        "/api/v1/public/card-creation-links/first-save",
        json={
            "raw_token": creation_link.raw_token,
            "organization_id": str(source_organization.id),
            "field_id": str(field.id),
            "value": "Создано через API",
        },
    )

    assert first_save.status_code == 201, first_save.text
    assert first_save.json()["child_raw_token"]
    assert first_save.json()["child_raw_token"] != creation_link.raw_token
    assert db_session.scalar(select(func.count()).select_from(Card)) == 1
