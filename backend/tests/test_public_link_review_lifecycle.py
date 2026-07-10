import json
import os
from collections.abc import Generator, Iterator
from dataclasses import asdict, dataclass
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from pathlib import Path
from typing import Annotated
from uuid import UUID, uuid4

import pytest
from alembic import command
from alembic.config import Config
from fastapi import Depends
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select, text
from sqlalchemy.engine import Engine, make_url
from sqlalchemy.orm import Session

import app.api.dependencies as api_dependencies
from app.api.dependencies import get_db_session, raise_service_http_error
from app.main import create_app
from app.models import AuditEvent, Card, CardPublicLink, FieldValue, User
from app.services.attachments import AttachmentService, LocalFilesystemAttachmentStorage
from app.services.cards import CardService
from app.services.organizations import OrganizationService
from app.services.permissions import PermissionDeniedError, PersistStatePermissionDeniedError
from app.services.public_links import (
    PublicLinkError,
    PublicLinkService,
    PublicLinkTransitionError,
)
from app.services.registry_schema import RegistrySchemaService


def _require_test_database_url() -> str:
    database_url = os.environ.get("TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("TEST_DATABASE_URL is required for disposable PostgreSQL lifecycle tests.")
    database_name = make_url(database_url).database or ""
    if database_name == "reg_engine" or not database_name.endswith("_test"):
        pytest.fail("TEST_DATABASE_URL must point to a disposable database ending with '_test'.")
    return database_url


def _alembic_config() -> Config:
    backend_root = Path(__file__).resolve().parents[1]
    config = Config(str(backend_root / "alembic.ini"))
    config.set_main_option("script_location", str(backend_root / "migrations"))
    return config


@pytest.fixture(scope="module")
def migrated_test_engine() -> Iterator[Engine]:
    database_url = _require_test_database_url()
    engine = create_engine(database_url)
    with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as connection:
        connection.execute(text("DROP SCHEMA IF EXISTS public CASCADE"))
        connection.execute(text("CREATE SCHEMA public"))
    previous_url = os.environ.get("TEST_DATABASE_URL")
    os.environ["TEST_DATABASE_URL"] = database_url
    try:
        command.upgrade(_alembic_config(), "head")
        yield engine
    finally:
        if previous_url is None:
            os.environ.pop("TEST_DATABASE_URL", None)
        else:
            os.environ["TEST_DATABASE_URL"] = previous_url
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
        if transaction.is_active:
            transaction.rollback()
        connection.close()


@dataclass(frozen=True)
class ReviewFixture:
    admin_id: UUID
    outsider_id: UUID
    card_id: UUID
    text_field_id: UUID
    number_field_id: UUID
    hidden_value: str
    attachment_service: AttachmentService
    initial_attachment_id: UUID


@pytest.fixture()
def review_fixture(db_session: Session, tmp_path: Path) -> ReviewFixture:
    admin = User(
        email="review-admin@example.test",
        display_name="Администратор проверки",
        is_superuser=True,
    )
    outsider = User(
        email="review-outsider@example.test",
        display_name="Посторонний пользователь",
    )
    db_session.add_all([admin, outsider])
    db_session.flush()

    organization = OrganizationService(db_session).create_root_for_actor(
        actor_user_id=admin.id,
        code="review-root",
        name="Организация проверки",
    )
    schema_service = RegistrySchemaService(db_session)
    registry = schema_service.create_registry_for_actor(
        actor_user_id=admin.id,
        code="review-registry",
        name="Реестр проверки",
    )
    public_block = schema_service.create_block_for_actor(
        actor_user_id=admin.id,
        registry_id=registry.id,
        code="public-data",
        title="Публичные данные",
        public_visible=True,
        public_editable=True,
    )
    text_field = schema_service.create_field_for_actor(
        actor_user_id=admin.id,
        block_id=public_block.id,
        code="title",
        label="Наименование",
        field_type="text",
        public_visible=True,
        public_editable=True,
    )
    number_field = schema_service.create_field_for_actor(
        actor_user_id=admin.id,
        block_id=public_block.id,
        code="amount",
        label="Количество",
        field_type="number",
        public_visible=True,
        public_editable=True,
    )
    hidden_block = schema_service.create_block_for_actor(
        actor_user_id=admin.id,
        registry_id=registry.id,
        code="hidden-data",
        title="Скрытые данные",
        public_visible=False,
        public_editable=False,
    )
    hidden_field = schema_service.create_field_for_actor(
        actor_user_id=admin.id,
        block_id=hidden_block.id,
        code="secret",
        label="Секрет",
        field_type="text",
        public_visible=False,
        public_editable=False,
    )
    card = CardService(db_session).create_card_for_actor(
        actor_user_id=admin.id,
        registry_id=registry.id,
        organization_id=organization.id,
        display_name="Карточка проверки",
        public_edit_enabled=True,
    )
    card_service = CardService(db_session)
    card_service.set_field_value_for_actor(
        actor_user_id=admin.id,
        card_id=card.id,
        field_id=text_field.id,
        value="Исходное значение",
    )
    card_service.set_field_value_for_actor(
        actor_user_id=admin.id,
        card_id=card.id,
        field_id=number_field.id,
        value=Decimal("1.25"),
    )
    hidden_value = "Внутренний секрет"
    card_service.set_field_value_for_actor(
        actor_user_id=admin.id,
        card_id=card.id,
        field_id=hidden_field.id,
        value=hidden_value,
    )
    attachment_service = AttachmentService(
        db_session,
        storage=LocalFilesystemAttachmentStorage(tmp_path / "review-attachments"),
    )
    initial_attachment = attachment_service.create_attachment_for_actor(
        actor_user_id=admin.id,
        card_id=card.id,
        original_filename="initial.txt",
        content_type="text/plain",
        content=b"initial private bytes",
        title="Исходное вложение",
    )
    return ReviewFixture(
        admin_id=admin.id,
        outsider_id=outsider.id,
        card_id=card.id,
        text_field_id=text_field.id,
        number_field_id=number_field.id,
        hidden_value=hidden_value,
        attachment_service=attachment_service,
        initial_attachment_id=initial_attachment.id,
    )


def _read_text_value(session: Session, fixture: ReviewFixture) -> str | None:
    value = session.scalar(
        select(FieldValue).where(
            FieldValue.card_id == fixture.card_id,
            FieldValue.field_id == fixture.text_field_id,
        )
    )
    return value.value_text if value is not None else None


def _json_keys(value: object) -> set[str]:
    if isinstance(value, dict):
        return set(value) | {key for item in value.values() for key in _json_keys(item)}
    if isinstance(value, list):
        return {key for item in value for key in _json_keys(item)}
    return set()


def test_public_link_review_service_declares_lifecycle_interface() -> None:
    required_methods = {
        "capture_review_baseline",
        "submit_for_review",
        "request_changes_for_actor",
        "approve_for_actor",
        "review_diff_for_actor",
        "safe_status",
    }

    assert required_methods <= set(dir(PublicLinkService))


def test_review_link_creation_captures_safe_baseline(
    db_session: Session,
    review_fixture: ReviewFixture,
) -> None:
    token = PublicLinkService(db_session).create_public_link_for_actor(
        actor_user_id=review_fixture.admin_id,
        card_id=review_fixture.card_id,
        review_enabled=True,
    )

    baseline = token.public_link.baseline_snapshot_json
    assert token.public_link.review_enabled is True
    assert baseline is not None
    assert len(baseline["fields"]) == 2
    assert len(baseline["attachments"]) == 1
    assert baseline["attachments"][0]["attachment_id"] == str(review_fixture.initial_attachment_id)
    assert baseline["attachments"][0]["original_filename"] == "initial.txt"
    assert review_fixture.hidden_value not in json.dumps(baseline, ensure_ascii=False)
    assert token.raw_token not in json.dumps(baseline, ensure_ascii=False)
    assert _json_keys(baseline).isdisjoint(
        {
            "raw_token",
            "token_hash",
            "storage_key",
            "stored_file_id",
            "checksum_sha256",
            "scanner_status",
            "scanner_details_json",
            "content",
        }
    )

    legacy_token = PublicLinkService(db_session).create_public_link_for_actor(
        actor_user_id=review_fixture.admin_id,
        card_id=review_fixture.card_id,
    )
    assert legacy_token.public_link.review_enabled is False
    assert legacy_token.public_link.baseline_snapshot_json is None
    opted_in = PublicLinkService(db_session).capture_review_baseline(
        actor_user_id=review_fixture.admin_id,
        public_link_id=legacy_token.public_link.id,
    )
    assert opted_in.review_enabled is True
    assert opted_in.baseline_snapshot_json is not None


def test_direct_edit_submit_approve_closes_access_and_preserves_card_value(
    db_session: Session,
    review_fixture: ReviewFixture,
) -> None:
    service = PublicLinkService(db_session)
    token = service.create_public_link_for_actor(
        actor_user_id=review_fixture.admin_id,
        card_id=review_fixture.card_id,
        review_enabled=True,
    )
    active_status = service.safe_status(raw_token=token.raw_token)
    assert active_status.status == "active"
    assert active_status.can_edit is True
    service.edit_card_field_with_token(
        raw_token=token.raw_token,
        field_id=review_fixture.text_field_id,
        value="Новое значение",
    )
    assert _read_text_value(db_session, review_fixture) == "Новое значение"

    submitted = service.submit_for_review(raw_token=token.raw_token)
    assert submitted.status == "submitted"
    assert submitted.can_edit is False
    assert submitted.submitted_at is not None
    assert submitted.submission_summary_json == {
        "completed_public_fields": 2,
        "total_public_fields": 2,
    }
    submitted_status = service.safe_status(raw_token=token.raw_token)
    assert submitted_status.status == "submitted"
    assert submitted_status.completed_public_fields == 2
    assert submitted_status.total_public_fields == 2
    with pytest.raises(PermissionDeniedError):
        service.edit_card_field_with_token(
            raw_token=token.raw_token,
            field_id=review_fixture.text_field_id,
            value="После отправки",
        )
    with pytest.raises(PermissionDeniedError):
        review_fixture.attachment_service.create_attachment_from_public_link(
            actor_public_link_id=token.public_link.id,
            card_id=review_fixture.card_id,
            original_filename="submitted.txt",
            content_type="text/plain",
            content=b"submitted",
        )

    approved = service.approve_for_actor(
        actor_user_id=review_fixture.admin_id,
        public_link_id=token.public_link.id,
    )
    assert approved.status == "approved"
    assert approved.can_edit is False
    assert approved.can_view is False
    assert approved.disabled_at is not None
    assert approved.reviewed_at is not None
    assert approved.reviewed_by == review_fixture.admin_id
    assert _read_text_value(db_session, review_fixture) == "Новое значение"

    safe_status = asdict(service.safe_status(raw_token=token.raw_token))
    assert safe_status == {
        "status": "approved",
        "can_edit": False,
        "submitted_at": approved.submitted_at,
        "reviewed_at": approved.reviewed_at,
        "review_comment": None,
        "completed_public_fields": None,
        "total_public_fields": None,
    }
    events_by_action = {
        event.action: event
        for event in db_session.scalars(
            select(AuditEvent).where(AuditEvent.object_id == token.public_link.id)
        )
    }
    assert events_by_action.keys() >= {"create", "public_link.submit", "public_link.approve"}
    assert events_by_action["public_link.submit"].actor_type == "public_link"
    assert events_by_action["public_link.submit"].source == "public_link"
    assert events_by_action["public_link.approve"].actor_type == "user"
    assert events_by_action["public_link.approve"].actor_user_id == review_fixture.admin_id


def test_request_changes_requires_comment_reopens_same_token_and_resubmits(
    db_session: Session,
    review_fixture: ReviewFixture,
) -> None:
    service = PublicLinkService(db_session)
    token = service.create_public_link_for_actor(
        actor_user_id=review_fixture.admin_id,
        card_id=review_fixture.card_id,
        review_enabled=True,
        max_attachment_uploads=1,
    )
    service.submit_for_review(raw_token=token.raw_token)

    with pytest.raises(PublicLinkError):
        service.request_changes_for_actor(
            actor_user_id=review_fixture.admin_id,
            public_link_id=token.public_link.id,
            comment="   ",
        )
    assert token.public_link.status == "submitted"

    returned = service.request_changes_for_actor(
        actor_user_id=review_fixture.admin_id,
        public_link_id=token.public_link.id,
        comment="Уточните наименование",
    )
    assert returned.status == "changes_requested"
    assert returned.can_edit is True
    assert returned.review_comment == "Уточните наименование"
    assert service.safe_status(raw_token=token.raw_token).review_comment == (
        "Уточните наименование"
    )

    service.edit_card_field_with_token(
        raw_token=token.raw_token,
        field_id=review_fixture.text_field_id,
        value="Исправленное значение",
    )
    uploaded = review_fixture.attachment_service.create_attachment_from_public_link(
        actor_public_link_id=token.public_link.id,
        card_id=review_fixture.card_id,
        original_filename="correction.txt",
        content_type="text/plain",
        content=b"correction",
    )
    assert uploaded.title == "correction.txt"

    resubmitted = service.submit_for_review(raw_token=token.raw_token)
    assert resubmitted.id == token.public_link.id
    assert resubmitted.status == "submitted"
    assert resubmitted.review_comment is None
    assert resubmitted.reviewed_at is None
    assert resubmitted.reviewed_by is None


def test_invalid_transitions_expiry_precedence_and_forbidden_reviewer(
    db_session: Session,
    review_fixture: ReviewFixture,
) -> None:
    service = PublicLinkService(db_session)
    token = service.create_public_link_for_actor(
        actor_user_id=review_fixture.admin_id,
        card_id=review_fixture.card_id,
        review_enabled=True,
    )
    with pytest.raises(PublicLinkTransitionError):
        service.approve_for_actor(
            actor_user_id=review_fixture.admin_id,
            public_link_id=token.public_link.id,
        )
    service.submit_for_review(raw_token=token.raw_token)
    with pytest.raises(PublicLinkTransitionError):
        service.submit_for_review(raw_token=token.raw_token)
    with pytest.raises(PermissionDeniedError):
        service.review_diff_for_actor(
            actor_user_id=review_fixture.outsider_id,
            public_link_id=token.public_link.id,
        )

    token.public_link.expires_at = datetime.now(UTC) - timedelta(seconds=1)
    db_session.flush()
    with pytest.raises(PermissionDeniedError):
        service.request_changes_for_actor(
            actor_user_id=review_fixture.admin_id,
            public_link_id=token.public_link.id,
            comment="Поздний комментарий",
        )
    status = service.safe_status(raw_token=token.raw_token)
    assert status.status == "expired"
    assert status.can_edit is False

    disabled_token = service.create_public_link_for_actor(
        actor_user_id=review_fixture.admin_id,
        card_id=review_fixture.card_id,
        review_enabled=True,
    )
    service.disable_public_link_for_actor(
        actor_user_id=review_fixture.admin_id,
        public_link_id=disabled_token.public_link.id,
    )
    disabled_status = service.safe_status(raw_token=disabled_token.raw_token)
    assert disabled_status.status == "disabled"
    assert disabled_status.can_edit is False
    assert disabled_status.completed_public_fields is None


def test_review_diff_uses_typed_values_safe_attachment_metadata_and_audit_timestamps(
    db_session: Session,
    review_fixture: ReviewFixture,
) -> None:
    service = PublicLinkService(db_session)
    token = service.create_public_link_for_actor(
        actor_user_id=review_fixture.admin_id,
        card_id=review_fixture.card_id,
        review_enabled=True,
    )
    service.edit_card_field_with_token(
        raw_token=token.raw_token,
        field_id=review_fixture.text_field_id,
        value="Изменённое значение",
    )
    service.edit_card_field_with_token(
        raw_token=token.raw_token,
        field_id=review_fixture.number_field_id,
        value=Decimal("2.50"),
    )
    new_attachment = review_fixture.attachment_service.create_attachment_from_public_link(
        actor_public_link_id=token.public_link.id,
        card_id=review_fixture.card_id,
        original_filename="added.txt",
        content_type="text/plain",
        content=b"added bytes",
        title="Добавленное вложение",
    )
    review_fixture.attachment_service.archive_attachment_for_actor(
        actor_user_id=review_fixture.admin_id,
        attachment_id=review_fixture.initial_attachment_id,
    )

    review = service.review_diff_for_actor(
        actor_user_id=review_fixture.admin_id,
        public_link_id=token.public_link.id,
    )
    assert review.changed_field_count == 2
    assert review.changed_attachment_count == 2
    fields_by_id = {item.field_id: item for item in review.fields}
    assert fields_by_id[review_fixture.text_field_id].before == "Исходное значение"
    assert fields_by_id[review_fixture.text_field_id].after == "Изменённое значение"
    assert fields_by_id[review_fixture.text_field_id].changed_at is not None
    assert fields_by_id[review_fixture.number_field_id].before == "1.25"
    assert fields_by_id[review_fixture.number_field_id].after == "2.50"
    attachments_by_id = {item.attachment_id: item for item in review.attachments}
    assert attachments_by_id[review_fixture.initial_attachment_id].change == "archived"
    assert attachments_by_id[new_attachment.id].change == "added"
    serialized = json.dumps(asdict(review), ensure_ascii=False, default=str)
    assert review_fixture.hidden_value not in serialized
    assert token.raw_token not in serialized
    assert _json_keys(asdict(review)).isdisjoint(
        {
            "token_hash",
            "storage_key",
            "stored_file_id",
            "checksum_sha256",
            "scanner_status",
            "scanner_details_json",
            "content",
        }
    )


def test_review_diff_matches_synthetic_non_repeatable_instance_to_first_saved_instance(
    db_session: Session,
    review_fixture: ReviewFixture,
) -> None:
    card = db_session.get(Card, review_fixture.card_id)
    assert card is not None
    schema_service = RegistrySchemaService(db_session)
    empty_block = schema_service.create_block_for_actor(
        actor_user_id=review_fixture.admin_id,
        registry_id=card.registry_id,
        code="empty-non-repeatable",
        title="Пустой неповторяемый блок",
        public_visible=True,
        public_editable=True,
    )
    empty_field = schema_service.create_field_for_actor(
        actor_user_id=review_fixture.admin_id,
        block_id=empty_block.id,
        code="first-value",
        label="Первое значение",
        field_type="text",
        public_visible=True,
        public_editable=True,
    )
    service = PublicLinkService(db_session)
    token = service.create_public_link_for_actor(
        actor_user_id=review_fixture.admin_id,
        card_id=review_fixture.card_id,
        review_enabled=True,
    )
    baseline_fields = token.public_link.baseline_snapshot_json["fields"]
    baseline_field = next(
        item for item in baseline_fields if item["field_id"] == str(empty_field.id)
    )
    assert baseline_field["block_instance_id"] is None

    service.edit_card_field_with_token(
        raw_token=token.raw_token,
        field_id=empty_field.id,
        value="Первое заполнение",
        block_instance_id=None,
    )
    review = service.review_diff_for_actor(
        actor_user_id=review_fixture.admin_id,
        public_link_id=token.public_link.id,
    )
    target_fields = [item for item in review.fields if item.field_id == empty_field.id]

    assert review.changed_field_count == 1
    assert len(target_fields) == 1
    assert target_fields[0].before is None
    assert target_fields[0].after == "Первое заполнение"
    assert target_fields[0].block_instance_id is not None


def test_safe_status_requires_effectively_editable_card(
    db_session: Session,
    review_fixture: ReviewFixture,
) -> None:
    service = PublicLinkService(db_session)
    token = service.create_public_link_for_actor(
        actor_user_id=review_fixture.admin_id,
        card_id=review_fixture.card_id,
        review_enabled=True,
    )
    card = db_session.get(Card, review_fixture.card_id)
    assert card is not None

    card.public_edit_enabled = False
    db_session.flush()
    assert service.safe_status(raw_token=token.raw_token).can_edit is False

    card.public_edit_enabled = True
    card.archived_at = datetime.now(UTC)
    db_session.flush()
    assert service.safe_status(raw_token=token.raw_token).can_edit is False

    card.archived_at = None
    card.lifecycle_status = "superseded"
    db_session.flush()
    assert service.safe_status(raw_token=token.raw_token).can_edit is False


def test_review_attachment_diffs_have_stable_change_and_uuid_order(
    db_session: Session,
    review_fixture: ReviewFixture,
) -> None:
    second_baseline = review_fixture.attachment_service.create_attachment_for_actor(
        actor_user_id=review_fixture.admin_id,
        card_id=review_fixture.card_id,
        original_filename="second-baseline.txt",
        content_type="text/plain",
        content=b"second baseline",
    )
    service = PublicLinkService(db_session)
    token = service.create_public_link_for_actor(
        actor_user_id=review_fixture.admin_id,
        card_id=review_fixture.card_id,
        review_enabled=True,
    )
    added_attachments = [
        review_fixture.attachment_service.create_attachment_from_public_link(
            actor_public_link_id=token.public_link.id,
            card_id=review_fixture.card_id,
            original_filename=f"added-{index}.txt",
            content_type="text/plain",
            content=f"added-{index}".encode(),
        )
        for index in range(2)
    ]
    for attachment_id in [review_fixture.initial_attachment_id, second_baseline.id]:
        review_fixture.attachment_service.archive_attachment_for_actor(
            actor_user_id=review_fixture.admin_id,
            attachment_id=attachment_id,
        )

    review = service.review_diff_for_actor(
        actor_user_id=review_fixture.admin_id,
        public_link_id=token.public_link.id,
    )
    actual_order = [(item.change, str(item.attachment_id)) for item in review.attachments]

    assert {item.attachment_id for item in review.attachments} == {
        review_fixture.initial_attachment_id,
        second_baseline.id,
        *(attachment.id for attachment in added_attachments),
    }
    assert actual_order == sorted(actual_order)


@pytest.fixture()
def transactional_api_client(
    migrated_test_engine: Engine,
    monkeypatch: pytest.MonkeyPatch,
) -> Iterator[TestClient]:
    def test_sessions() -> Generator[Session, None, None]:
        with Session(migrated_test_engine, expire_on_commit=False) as session:
            yield session

    monkeypatch.setattr(api_dependencies, "get_session", test_sessions)
    app = create_app()

    @app.post("/_test/public-links/submit")
    def submit_for_review(
        payload: dict[str, str],
        session: Annotated[Session, Depends(get_db_session)],
    ) -> None:
        try:
            PublicLinkService(session).submit_for_review(raw_token=payload["raw_token"])
        except Exception as exc:
            raise_service_http_error(exc)

    @app.post("/_test/ordinary-denied")
    def ordinary_denied(
        session: Annotated[Session, Depends(get_db_session)],
    ) -> None:
        session.add(
            User(
                email="must-rollback@example.test",
                display_name="Must rollback",
            )
        )
        session.flush()
        raise_service_http_error(PermissionDeniedError("Ordinary denied operation."))

    try:
        with TestClient(app) as client:
            yield client
    finally:
        with migrated_test_engine.begin() as connection:
            connection.execute(
                text(
                    "TRUNCATE TABLE users, roles, permissions, organizations, "
                    "registries, stored_files RESTART IDENTITY CASCADE"
                )
            )


def test_expiry_denials_commit_only_expiry_state_and_one_audit(
    migrated_test_engine: Engine,
    transactional_api_client: TestClient,
) -> None:
    suffix = uuid4().hex[:8]
    with Session(migrated_test_engine, expire_on_commit=False) as setup_session:
        admin = User(
            email=f"expiry-admin-{suffix}@example.test",
            display_name="Expiry admin",
            is_superuser=True,
        )
        setup_session.add(admin)
        setup_session.flush()
        organization = OrganizationService(setup_session).create_root_for_actor(
            actor_user_id=admin.id,
            code=f"expiry-root-{suffix}",
            name="Expiry root",
        )
        schema_service = RegistrySchemaService(setup_session)
        registry = schema_service.create_registry_for_actor(
            actor_user_id=admin.id,
            code=f"expiry-registry-{suffix}",
            name="Expiry registry",
        )
        block = schema_service.create_block_for_actor(
            actor_user_id=admin.id,
            registry_id=registry.id,
            code="expiry-public",
            title="Expiry public",
            public_editable=True,
        )
        field = schema_service.create_field_for_actor(
            actor_user_id=admin.id,
            block_id=block.id,
            code="expiry-value",
            label="Expiry value",
            field_type="text",
            public_editable=True,
        )
        card = CardService(setup_session).create_card_for_actor(
            actor_user_id=admin.id,
            registry_id=registry.id,
            organization_id=organization.id,
            display_name="Expiry card",
            public_edit_enabled=True,
        )
        tokens = [
            PublicLinkService(setup_session).create_public_link_for_actor(
                actor_user_id=admin.id,
                card_id=card.id,
                review_enabled=True,
            )
            for _ in range(3)
        ]
        for token in tokens:
            token.public_link.expires_at = datetime.now(UTC) - timedelta(seconds=1)
        link_ids = [token.public_link.id for token in tokens]
        raw_tokens = [token.raw_token for token in tokens]
        field_id = field.id
        card_id = card.id
        setup_session.commit()

    edit_response = transactional_api_client.post(
        "/api/v1/public-links/edit",
        json={"raw_token": raw_tokens[0], "field_id": str(field_id), "value": "blocked"},
    )
    submit_response = transactional_api_client.post(
        "/_test/public-links/submit",
        json={"raw_token": raw_tokens[1]},
    )
    attachment_response = transactional_api_client.post(
        "/api/v1/public-links/attachments/upload",
        data={"raw_token": raw_tokens[2]},
        files={"file": ("blocked.txt", b"blocked", "text/plain")},
    )
    ordinary_response = transactional_api_client.post("/_test/ordinary-denied")

    assert [
        edit_response.status_code,
        submit_response.status_code,
        attachment_response.status_code,
    ] == [
        403,
        403,
        403,
    ]
    assert ordinary_response.status_code == 403
    with Session(migrated_test_engine) as verify_session:
        for link_id in link_ids:
            public_link = verify_session.get(CardPublicLink, link_id)
            assert public_link is not None
            assert public_link.status == "expired"
            assert public_link.can_view is False
            assert public_link.can_edit is False
            expiry_events = list(
                verify_session.scalars(
                    select(AuditEvent).where(
                        AuditEvent.object_type == "card_public_link",
                        AuditEvent.object_id == link_id,
                        AuditEvent.action == "public_link.expire",
                    )
                )
            )
            assert len(expiry_events) == 1
            assert expiry_events[0].actor_type == "system"
            assert expiry_events[0].source == "system"
        assert (
            verify_session.scalar(select(User).where(User.email == "must-rollback@example.test"))
            is None
        )
        assert (
            verify_session.scalar(
                select(FieldValue).where(
                    FieldValue.card_id == card_id,
                    FieldValue.field_id == field_id,
                )
            )
            is None
        )


def test_direct_attachment_expiry_uses_persist_marker_and_one_system_audit(
    db_session: Session,
    review_fixture: ReviewFixture,
) -> None:
    token = PublicLinkService(db_session).create_public_link_for_actor(
        actor_user_id=review_fixture.admin_id,
        card_id=review_fixture.card_id,
        review_enabled=True,
    )
    token.public_link.expires_at = datetime.now(UTC) - timedelta(seconds=1)
    db_session.flush()

    with pytest.raises(PersistStatePermissionDeniedError):
        review_fixture.attachment_service.create_attachment_from_public_link(
            actor_public_link_id=token.public_link.id,
            card_id=review_fixture.card_id,
            original_filename="expired-direct.txt",
            content_type="text/plain",
            content=b"must not persist",
        )

    assert token.public_link.status == "expired"
    assert token.public_link.can_view is False
    assert token.public_link.can_edit is False
    expiry_events = list(
        db_session.scalars(
            select(AuditEvent).where(
                AuditEvent.object_type == "card_public_link",
                AuditEvent.object_id == token.public_link.id,
                AuditEvent.action == "public_link.expire",
            )
        )
    )
    assert len(expiry_events) == 1
    assert expiry_events[0].actor_type == "system"
    assert expiry_events[0].source == "system"
