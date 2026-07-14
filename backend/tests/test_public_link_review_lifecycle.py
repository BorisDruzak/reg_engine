import json
import os
from collections.abc import Generator, Iterator
from dataclasses import asdict, dataclass
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace
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
from app.core.config import get_settings
from app.main import create_app
from app.models import AuditEvent, Card, CardPublicLink, CardTemplate, FieldValue, FormBlock, User
from app.schemas.cards import CardPublicAccessUpdate, CardPublicFieldSettingUpdate
from app.services.attachments import AttachmentService, LocalFilesystemAttachmentStorage
from app.services.card_public_access import CardPublicAccessService
from app.services.cards import CardService
from app.services.organizations import OrganizationService
from app.services.permissions import (
    PermissionDeniedError,
    PersistStatePermissionDeniedError,
    PublicLinkSubmittedReadOnlyError,
)
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
    CardPublicAccessService(db_session).update_for_actor(
        actor_user_id=admin.id,
        card_id=card.id,
        payload=CardPublicAccessUpdate(
            public_view_enabled=True,
            public_edit_enabled=True,
            fields=[
                CardPublicFieldSettingUpdate(
                    field_id=text_field.id,
                    public_visible=True,
                    public_editable=True,
                ),
                CardPublicFieldSettingUpdate(
                    field_id=number_field.id,
                    public_visible=True,
                    public_editable=True,
                ),
            ],
        ),
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


def test_active_public_link_uses_current_card_access_settings(
    db_session: Session,
    review_fixture: ReviewFixture,
) -> None:
    public_links = PublicLinkService(db_session)
    token = public_links.create_public_link_for_actor(
        actor_user_id=review_fixture.admin_id,
        card_id=review_fixture.card_id,
    )

    CardPublicAccessService(db_session).update_for_actor(
        actor_user_id=review_fixture.admin_id,
        card_id=review_fixture.card_id,
        payload=CardPublicAccessUpdate(
            public_view_enabled=True,
            public_edit_enabled=False,
            fields=[
                CardPublicFieldSettingUpdate(
                    field_id=review_fixture.text_field_id,
                    public_visible=False,
                    public_editable=False,
                ),
                CardPublicFieldSettingUpdate(
                    field_id=review_fixture.number_field_id,
                    public_visible=True,
                    public_editable=False,
                ),
            ],
        ),
    )

    preview = public_links.preview_public_link(raw_token=token.raw_token)

    assert preview.can_edit is False
    assert [
        field.field_id
        for block in preview.blocks
        for instance in block.instances
        for field in instance.fields
    ] == [review_fixture.number_field_id]
    with pytest.raises(PermissionDeniedError):
        public_links.edit_card_field_with_token(
            raw_token=token.raw_token,
            field_id=review_fixture.number_field_id,
            value=Decimal("2.50"),
        )


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


def test_static_text_schema_selection_requires_a_selected_block_for_explicit_links() -> None:
    service = object.__new__(PublicLinkService)
    selected_block_id = uuid4()
    other_block_id = uuid4()
    editable_field_id = uuid4()
    selected_static_id = uuid4()
    other_static_id = uuid4()
    selected_block = SimpleNamespace(id=selected_block_id, public_editable=True)
    other_block = SimpleNamespace(id=other_block_id, public_editable=True)
    editable_field = SimpleNamespace(
        id=editable_field_id,
        field_type="text",
        public_editable=True,
    )
    selected_static = SimpleNamespace(
        id=selected_static_id,
        field_type="static_text",
        public_editable=False,
    )
    other_static = SimpleNamespace(
        id=other_static_id,
        field_type="static_text",
        public_editable=False,
    )
    template_field_ids = {editable_field_id, selected_static_id, other_static_id}
    explicit_link = SimpleNamespace(
        allowed_blocks_json={"ids": [str(selected_block_id)]},
        allowed_fields_json={"ids": [str(editable_field_id)]},
    )
    field_only_link = SimpleNamespace(
        allowed_blocks_json=None,
        allowed_fields_json={"ids": [str(editable_field_id)]},
    )
    legacy_link = SimpleNamespace(allowed_blocks_json=None, allowed_fields_json=None)

    assert service._public_schema_row_is_allowed(
        public_link=explicit_link,
        block=selected_block,
        field_model=editable_field,
        template_field_ids=template_field_ids,
    )
    assert service._public_schema_row_is_allowed(
        public_link=explicit_link,
        block=selected_block,
        field_model=selected_static,
        template_field_ids=template_field_ids,
    )
    assert not service._public_schema_row_is_allowed(
        public_link=explicit_link,
        block=other_block,
        field_model=other_static,
        template_field_ids=template_field_ids,
    )
    assert not service._public_schema_row_is_allowed(
        public_link=field_only_link,
        block=selected_block,
        field_model=selected_static,
        template_field_ids=template_field_ids,
    )
    assert service._public_schema_row_is_allowed(
        public_link=legacy_link,
        block=other_block,
        field_model=other_static,
        template_field_ids=None,
    )


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
    previous_allow_dev_actor = os.environ.get("ALLOW_DEV_ACTOR_HEADER")
    os.environ["ALLOW_DEV_ACTOR_HEADER"] = "true"
    get_settings.cache_clear()
    app = create_app()

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
        if previous_allow_dev_actor is None:
            os.environ.pop("ALLOW_DEV_ACTOR_HEADER", None)
        else:
            os.environ["ALLOW_DEV_ACTOR_HEADER"] = previous_allow_dev_actor
        get_settings.cache_clear()
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
            for _ in range(5)
        ]
        public_link_service = PublicLinkService(setup_session)
        for token in tokens[3:]:
            public_link_service.submit_for_review(raw_token=token.raw_token)
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
        "/api/v1/public-links/submit",
        json={"raw_token": raw_tokens[1]},
    )
    attachment_response = transactional_api_client.post(
        "/api/v1/public-links/attachments/upload",
        data={"raw_token": raw_tokens[2]},
        files={"file": ("blocked.txt", b"blocked", "text/plain")},
    )
    submitted_attachment_list_response = transactional_api_client.post(
        "/api/v1/public-links/attachments",
        json={"raw_token": raw_tokens[3]},
    )
    submitted_attachment_upload_response = transactional_api_client.post(
        "/api/v1/public-links/attachments/upload",
        data={"raw_token": raw_tokens[4]},
        files={"file": ("submitted-expired.txt", b"blocked", "text/plain")},
    )
    ordinary_response = transactional_api_client.post("/_test/ordinary-denied")

    expired_responses = [
        edit_response,
        submit_response,
        attachment_response,
        submitted_attachment_list_response,
        submitted_attachment_upload_response,
    ]
    assert [response.status_code for response in expired_responses] == [403] * 5
    assert {response.json()["detail"] for response in expired_responses} == {
        "Срок действия публичной ссылки истёк."
    }
    assert ordinary_response.status_code == 403
    assert ordinary_response.json()["detail"] == "Недостаточно прав для выполнения операции."
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


def test_direct_submitted_attachment_expiry_precedes_readonly_for_list_and_upload(
    db_session: Session,
    review_fixture: ReviewFixture,
) -> None:
    service = PublicLinkService(db_session)
    tokens = [
        service.create_public_link_for_actor(
            actor_user_id=review_fixture.admin_id,
            card_id=review_fixture.card_id,
            review_enabled=True,
        )
        for _ in range(2)
    ]
    for token in tokens:
        service.submit_for_review(raw_token=token.raw_token)
    db_session.flush()

    with pytest.raises(PublicLinkSubmittedReadOnlyError):
        review_fixture.attachment_service.list_attachments_from_public_link(
            actor_public_link_id=tokens[0].public_link.id,
            card_id=review_fixture.card_id,
        )
    with pytest.raises(PublicLinkSubmittedReadOnlyError):
        review_fixture.attachment_service.create_attachment_from_public_link(
            actor_public_link_id=tokens[1].public_link.id,
            card_id=review_fixture.card_id,
            original_filename="submitted-direct.txt",
            content_type="text/plain",
            content=b"must not persist",
        )

    for token in tokens:
        token.public_link.expires_at = datetime.now(UTC) - timedelta(seconds=1)
    db_session.flush()

    with pytest.raises(PersistStatePermissionDeniedError):
        review_fixture.attachment_service.list_attachments_from_public_link(
            actor_public_link_id=tokens[0].public_link.id,
            card_id=review_fixture.card_id,
        )
    with pytest.raises(PersistStatePermissionDeniedError):
        review_fixture.attachment_service.create_attachment_from_public_link(
            actor_public_link_id=tokens[1].public_link.id,
            card_id=review_fixture.card_id,
            original_filename="submitted-expired-direct.txt",
            content_type="text/plain",
            content=b"must not persist",
        )

    for token in tokens:
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


@dataclass(frozen=True)
class ReviewApiFixture:
    admin_id: UUID
    outsider_id: UUID
    card_id: UUID
    block_id: UUID
    field_id: UUID
    other_field_id: UUID
    non_editable_field_id: UUID
    off_template_field_id: UUID
    off_template_block_id: UUID
    off_template_block_field_id: UUID
    foreign_block_id: UUID
    foreign_field_id: UUID


@pytest.fixture()
def review_api_fixture(
    migrated_test_engine: Engine,
    transactional_api_client: TestClient,
) -> ReviewApiFixture:
    suffix = uuid4().hex[:8]
    with Session(migrated_test_engine, expire_on_commit=False) as session:
        admin = User(
            email=f"api-review-admin-{suffix}@example.test",
            display_name="Администратор API проверки",
            is_superuser=True,
        )
        outsider = User(
            email=f"api-review-outsider-{suffix}@example.test",
            display_name="Посторонний API пользователь",
        )
        session.add_all([admin, outsider])
        session.flush()
        organization = OrganizationService(session).create_root_for_actor(
            actor_user_id=admin.id,
            code=f"api-review-root-{suffix}",
            name="Организация API проверки",
        )
        schema_service = RegistrySchemaService(session)
        registry = schema_service.create_registry_for_actor(
            actor_user_id=admin.id,
            code=f"api-review-registry-{suffix}",
            name="Реестр API проверки",
        )
        block = schema_service.create_block_for_actor(
            actor_user_id=admin.id,
            registry_id=registry.id,
            code="api-review-public",
            title="Публичный блок API",
            public_visible=True,
            public_editable=True,
        )
        field = schema_service.create_field_for_actor(
            actor_user_id=admin.id,
            block_id=block.id,
            code="api-review-value",
            label="Значение API проверки",
            field_type="text",
            public_visible=True,
            public_editable=True,
        )
        other_field = schema_service.create_field_for_actor(
            actor_user_id=admin.id,
            block_id=block.id,
            code="api-review-other-value",
            label="Другое значение API проверки",
            field_type="text",
            public_visible=True,
            public_editable=True,
        )
        non_editable_field = schema_service.create_field_for_actor(
            actor_user_id=admin.id,
            block_id=block.id,
            code="api-review-private-value",
            label="Непубличное значение API проверки",
            field_type="text",
            public_visible=True,
            public_editable=False,
        )
        card_template = schema_service.create_card_template_for_actor(
            actor_user_id=admin.id,
            registry_id=registry.id,
            code="api-review-template",
            name="Шаблон карточки API проверки",
            field_schema_json={
                "field_ids": [
                    str(field.id),
                    str(other_field.id),
                    str(non_editable_field.id),
                ]
            },
        )
        foreign_registry = schema_service.create_registry_for_actor(
            actor_user_id=admin.id,
            code=f"api-review-foreign-registry-{suffix}",
            name="Другой реестр API проверки",
        )
        foreign_block = schema_service.create_block_for_actor(
            actor_user_id=admin.id,
            registry_id=foreign_registry.id,
            code="api-review-foreign-block",
            title="Другой блок API проверки",
            public_visible=True,
            public_editable=True,
        )
        foreign_field = schema_service.create_field_for_actor(
            actor_user_id=admin.id,
            block_id=foreign_block.id,
            code="api-review-foreign-value",
            label="Другое поле API проверки",
            field_type="text",
            public_visible=True,
            public_editable=True,
        )
        card = CardService(session).create_card_for_actor(
            actor_user_id=admin.id,
            registry_id=registry.id,
            organization_id=organization.id,
            display_name="Карточка API проверки",
            card_template_id=card_template.id,
            public_edit_enabled=True,
        )
        CardPublicAccessService(session).update_for_actor(
            actor_user_id=admin.id,
            card_id=card.id,
            payload=CardPublicAccessUpdate(
                public_view_enabled=True,
                public_edit_enabled=True,
                fields=[
                    CardPublicFieldSettingUpdate(
                        field_id=field.id,
                        public_visible=True,
                        public_editable=True,
                    ),
                    CardPublicFieldSettingUpdate(
                        field_id=other_field.id,
                        public_visible=True,
                        public_editable=True,
                    ),
                    CardPublicFieldSettingUpdate(
                        field_id=non_editable_field.id,
                        public_visible=True,
                        public_editable=False,
                    ),
                ],
            ),
        )
        off_template_field = schema_service.create_field_for_actor(
            actor_user_id=admin.id,
            block_id=block.id,
            code="api-review-off-template-value",
            label="Поле вне шаблона API проверки",
            field_type="text",
            public_visible=True,
            public_editable=True,
        )
        off_template_block = schema_service.create_block_for_actor(
            actor_user_id=admin.id,
            registry_id=registry.id,
            code="api-review-off-template-block",
            title="Блок вне шаблона API проверки",
            public_visible=True,
            public_editable=True,
        )
        off_template_block_field = schema_service.create_field_for_actor(
            actor_user_id=admin.id,
            block_id=off_template_block.id,
            code="api-review-off-template-block-value",
            label="Поле блока вне шаблона API проверки",
            field_type="text",
            public_visible=True,
            public_editable=True,
        )
        fixture = ReviewApiFixture(
            admin_id=admin.id,
            outsider_id=outsider.id,
            card_id=card.id,
            block_id=block.id,
            field_id=field.id,
            other_field_id=other_field.id,
            non_editable_field_id=non_editable_field.id,
            off_template_field_id=off_template_field.id,
            off_template_block_id=off_template_block.id,
            off_template_block_field_id=off_template_block_field.id,
            foreign_block_id=foreign_block.id,
            foreign_field_id=foreign_field.id,
        )
        session.commit()
    return fixture


def _actor_headers(actor_id: UUID) -> dict[str, str]:
    return {"X-Actor-User-Id": str(actor_id)}


def test_public_link_lifecycle_openapi_contract_is_registered() -> None:
    openapi = create_app().openapi()
    paths = set(openapi["paths"])
    schemas = set(openapi["components"]["schemas"])

    assert {
        "/api/v1/public-links/submit",
        "/api/v1/public-links/status",
        "/api/v1/public-links/{public_link_id}/review",
        "/api/v1/public-links/{public_link_id}/request-changes",
        "/api/v1/public-links/{public_link_id}/approve",
        "/api/v1/public-links/{public_link_id}/start-review-cycle",
    } <= paths
    assert {
        "PublicLinkSubmitRequest",
        "PublicLinkSafeStatusRead",
        "PublicLinkReviewRead",
        "PublicLinkRequestChanges",
    } <= schemas
    public_edit_schema = openapi["components"]["schemas"]["PublicLinkEditRequest"]
    assert set(public_edit_schema["properties"]) == {
        "raw_token",
        "field_id",
        "value",
        "block_instance_id",
    }
    assert public_edit_schema["additionalProperties"] is False


def test_public_field_value_api_preserves_card_metadata_and_rejects_metadata_inputs(
    migrated_test_engine: Engine,
    transactional_api_client: TestClient,
    review_api_fixture: ReviewApiFixture,
) -> None:
    admin_headers = _actor_headers(review_api_fixture.admin_id)
    created = transactional_api_client.post(
        f"/api/v1/cards/{review_api_fixture.card_id}/public-links",
        json={},
        headers=admin_headers,
    )
    assert created.status_code == 201, created.text
    raw_token = created.json()["raw_token"]

    with Session(migrated_test_engine) as verify_session:
        card_before = verify_session.get(Card, review_api_fixture.card_id)
        assert card_before is not None
        organization_id = card_before.organization_id
        card_template_id = card_before.card_template_id

    field_update = transactional_api_client.post(
        "/api/v1/public-links/edit",
        json={
            "raw_token": raw_token,
            "field_id": str(review_api_fixture.field_id),
            "value": "Публичное значение поля",
        },
    )
    assert field_update.status_code == 200, field_update.text

    with Session(migrated_test_engine) as verify_session:
        card_after_field_update = verify_session.get(Card, review_api_fixture.card_id)
        assert card_after_field_update is not None
        assert card_after_field_update.organization_id == organization_id
        assert card_after_field_update.card_template_id == card_template_id

    metadata_update = transactional_api_client.post(
        "/api/v1/public-links/edit",
        json={
            "raw_token": raw_token,
            "field_id": str(review_api_fixture.field_id),
            "value": "Недопустимое изменение метаданных",
            "organization_id": str(organization_id),
            "card_template_id": str(card_template_id),
        },
    )
    assert metadata_update.status_code == 422, metadata_update.text

    with Session(migrated_test_engine) as verify_session:
        card_after_rejection = verify_session.get(Card, review_api_fixture.card_id)
        assert card_after_rejection is not None
        assert card_after_rejection.organization_id == organization_id
        assert card_after_rejection.card_template_id == card_template_id


def test_public_link_create_api_uses_card_settings_not_allowlists(
    migrated_test_engine: Engine,
    transactional_api_client: TestClient,
    review_api_fixture: ReviewApiFixture,
) -> None:
    admin_headers = _actor_headers(review_api_fixture.admin_id)
    created_response = transactional_api_client.post(
        f"/api/v1/cards/{review_api_fixture.card_id}/public-links",
        json={
            "allowed_block_ids": [str(review_api_fixture.block_id)],
            "allowed_field_ids": [str(review_api_fixture.field_id)],
        },
        headers=admin_headers,
    )
    assert created_response.status_code == 201, created_response.text
    created = created_response.json()

    with Session(migrated_test_engine) as verify_session:
        public_link = verify_session.get(CardPublicLink, UUID(created["id"]))
        assert public_link is not None
        assert public_link.allowed_blocks_json is None
        assert public_link.allowed_fields_json is None

    preview_response = transactional_api_client.post(
        "/api/v1/public-links/preview",
        json={"raw_token": created["raw_token"]},
    )
    assert preview_response.status_code == 200, preview_response.text
    preview = preview_response.json()
    assert {block["block_id"] for block in preview["blocks"]} == {str(review_api_fixture.block_id)}
    assert {
        field["field_id"]
        for block in preview["blocks"]
        for instance in block["instances"]
        for field in instance["fields"]
    } == {
        str(review_api_fixture.field_id),
        str(review_api_fixture.other_field_id),
        str(review_api_fixture.non_editable_field_id),
    }


def test_active_links_ignore_stored_allowlists_and_follow_card_settings(
    migrated_test_engine: Engine,
    transactional_api_client: TestClient,
    review_api_fixture: ReviewApiFixture,
) -> None:
    admin_headers = _actor_headers(review_api_fixture.admin_id)
    legacy_response = transactional_api_client.post(
        f"/api/v1/cards/{review_api_fixture.card_id}/public-links",
        json={},
        headers=admin_headers,
    )
    assert legacy_response.status_code == 201, legacy_response.text
    legacy = legacy_response.json()
    legacy_preview_response = transactional_api_client.post(
        "/api/v1/public-links/preview",
        json={"raw_token": legacy["raw_token"]},
    )
    assert legacy_preview_response.status_code == 200, legacy_preview_response.text
    legacy_field_ids = {
        field["field_id"]
        for block in legacy_preview_response.json()["blocks"]
        for instance in block["instances"]
        for field in instance["fields"]
    }
    assert legacy_field_ids == {
        str(review_api_fixture.field_id),
        str(review_api_fixture.other_field_id),
        str(review_api_fixture.non_editable_field_id),
    }

    partial_response = transactional_api_client.post(
        f"/api/v1/cards/{review_api_fixture.card_id}/public-links",
        json={"allowed_block_ids": [str(review_api_fixture.block_id)]},
        headers=admin_headers,
    )
    assert partial_response.status_code == 201, partial_response.text
    partial = partial_response.json()
    partial_preview_response = transactional_api_client.post(
        "/api/v1/public-links/preview",
        json={"raw_token": partial["raw_token"]},
    )
    assert partial_preview_response.status_code == 200, partial_preview_response.text
    partial_field_ids = {
        field["field_id"]
        for block in partial_preview_response.json()["blocks"]
        for instance in block["instances"]
        for field in instance["fields"]
    }
    assert partial_field_ids == {
        str(review_api_fixture.field_id),
        str(review_api_fixture.other_field_id),
        str(review_api_fixture.non_editable_field_id),
    }
    denied_partial_edit = transactional_api_client.post(
        "/api/v1/public-links/edit",
        json={
            "raw_token": partial["raw_token"],
            "field_id": str(review_api_fixture.off_template_field_id),
            "value": "Недопустимое значение вне шаблона",
        },
    )
    assert denied_partial_edit.status_code == 403, denied_partial_edit.text
    assert denied_partial_edit.json()["detail"] == "Недостаточно прав для выполнения операции."
    assert partial["raw_token"] not in denied_partial_edit.text

    with Session(migrated_test_engine) as mutate_session:
        manual_link = mutate_session.get(CardPublicLink, UUID(legacy["id"]))
        assert manual_link is not None
        manual_link.allowed_blocks_json = {"ids": [str(review_api_fixture.off_template_block_id)]}
        mutate_session.commit()

    manual_preview_response = transactional_api_client.post(
        "/api/v1/public-links/preview",
        json={"raw_token": legacy["raw_token"]},
    )
    assert manual_preview_response.status_code == 200, manual_preview_response.text
    manual_field_ids = {
        field["field_id"]
        for block in manual_preview_response.json()["blocks"]
        for instance in block["instances"]
        for field in instance["fields"]
    }
    assert manual_field_ids == {
        str(review_api_fixture.field_id),
        str(review_api_fixture.other_field_id),
        str(review_api_fixture.non_editable_field_id),
    }
    denied_manual_edit = transactional_api_client.post(
        "/api/v1/public-links/edit",
        json={
            "raw_token": legacy["raw_token"],
            "field_id": str(review_api_fixture.off_template_block_field_id),
            "value": "Недопустимое ручное значение",
        },
    )
    assert denied_manual_edit.status_code == 403, denied_manual_edit.text
    assert denied_manual_edit.json()["detail"] == "Недостаточно прав для выполнения операции."
    assert legacy["raw_token"] not in denied_manual_edit.text


def test_public_preview_exposes_only_allowed_sanitized_form_layout(
    migrated_test_engine: Engine,
    transactional_api_client: TestClient,
    review_api_fixture: ReviewApiFixture,
) -> None:
    with Session(migrated_test_engine) as layout_session:
        card = layout_session.get(Card, review_api_fixture.card_id)
        assert card is not None
        template = layout_session.get(CardTemplate, card.card_template_id)
        assert template is not None
        template.field_schema_json = {
            **template.field_schema_json,
            "form_layout": {
                "columns": 12,
                "sections": [
                    {
                        "id": "public-main",
                        "block_id": str(review_api_fixture.block_id),
                        "row": 2,
                        "column": 4,
                        "row_span": 2,
                        "column_span": 6,
                        "items": [
                            {
                                "id": "public-name",
                                "kind": "field",
                                "field_id": str(review_api_fixture.field_id),
                                "row": 3,
                                "column": 7,
                                "row_span": 2,
                                "column_span": 6,
                            },
                            {
                                "id": "public-other",
                                "kind": "field",
                                "field_id": str(review_api_fixture.other_field_id),
                                "row": 1,
                                "column": 1,
                                "row_span": 1,
                                "column_span": 6,
                            },
                            {
                                "id": "private-field",
                                "kind": "field",
                                "field_id": str(review_api_fixture.non_editable_field_id),
                                "row": 1,
                                "column": 7,
                                "row_span": 1,
                                "column_span": 6,
                            },
                            {
                                "id": "off-template-field",
                                "kind": "field",
                                "field_id": str(review_api_fixture.off_template_field_id),
                                "row": 2,
                                "column": 1,
                                "row_span": 1,
                                "column_span": 6,
                            },
                        ],
                    },
                    {
                        "id": "off-template-block",
                        "block_id": str(review_api_fixture.off_template_block_id),
                        "row": 1,
                        "column": 1,
                        "row_span": 1,
                        "column_span": 3,
                        "items": [
                            {
                                "id": "off-template-block-field",
                                "kind": "field",
                                "field_id": str(review_api_fixture.off_template_block_field_id),
                                "row": 1,
                                "column": 1,
                                "row_span": 1,
                                "column_span": 12,
                            }
                        ],
                    },
                ],
            },
        }
        layout_session.commit()

    access_response = transactional_api_client.patch(
        f"/api/v1/cards/{review_api_fixture.card_id}/public-access",
        json={
            "fields": [
                {
                    "field_id": str(review_api_fixture.field_id),
                    "public_visible": True,
                    "public_editable": True,
                },
                {
                    "field_id": str(review_api_fixture.other_field_id),
                    "public_visible": False,
                    "public_editable": False,
                },
                {
                    "field_id": str(review_api_fixture.non_editable_field_id),
                    "public_visible": False,
                    "public_editable": False,
                },
            ]
        },
        headers=_actor_headers(review_api_fixture.admin_id),
    )
    assert access_response.status_code == 200, access_response.text

    created_response = transactional_api_client.post(
        f"/api/v1/cards/{review_api_fixture.card_id}/public-links",
        json={
            "allowed_block_ids": [str(review_api_fixture.block_id)],
            "allowed_field_ids": [str(review_api_fixture.field_id)],
        },
        headers=_actor_headers(review_api_fixture.admin_id),
    )
    assert created_response.status_code == 201, created_response.text
    preview_response = transactional_api_client.post(
        "/api/v1/public-links/preview",
        json={"raw_token": created_response.json()["raw_token"]},
    )
    assert preview_response.status_code == 200, preview_response.text
    preview = preview_response.json()
    assert preview["form_layout"] == {
        "columns": 12,
        "sections": [
            {
                "id": "public-main",
                "block_id": str(review_api_fixture.block_id),
                "row": 2,
                "column": 4,
                "row_span": 2,
                "column_span": 6,
                "items": [
                    {
                        "id": "public-name",
                        "kind": "field",
                        "field_id": str(review_api_fixture.field_id),
                        "row": 3,
                        "column": 7,
                        "row_span": 2,
                        "column_span": 6,
                        "text": None,
                    }
                ],
            }
        ],
    }
    serialized_preview = json.dumps(preview, ensure_ascii=False)
    for forbidden_id in {
        review_api_fixture.other_field_id,
        review_api_fixture.non_editable_field_id,
        review_api_fixture.off_template_field_id,
        review_api_fixture.off_template_block_id,
        review_api_fixture.off_template_block_field_id,
    }:
        assert str(forbidden_id) not in serialized_preview


def test_public_preview_keeps_static_text_only_for_selected_blocks_and_legacy_links(
    migrated_test_engine: Engine,
    transactional_api_client: TestClient,
    review_api_fixture: ReviewApiFixture,
) -> None:
    with Session(migrated_test_engine, expire_on_commit=False) as setup_session:
        card = setup_session.get(Card, review_api_fixture.card_id)
        assert card is not None
        selected_block = setup_session.get(FormBlock, review_api_fixture.block_id)
        assert selected_block is not None
        schema_service = RegistrySchemaService(setup_session)
        selected_static = schema_service.create_field_for_actor(
            actor_user_id=review_api_fixture.admin_id,
            block_id=selected_block.id,
            code="selected-instruction",
            label="Инструкция выбранного блока",
            field_type="static_text",
            options_config_json={"static_text": "Заполните выбранный блок"},
            public_visible=True,
            public_editable=False,
        )
        other_block = schema_service.create_block_for_actor(
            actor_user_id=review_api_fixture.admin_id,
            registry_id=card.registry_id,
            code="other-public-instructions",
            title="Другой публичный блок",
            public_visible=True,
            public_editable=True,
        )
        other_static = schema_service.create_field_for_actor(
            actor_user_id=review_api_fixture.admin_id,
            block_id=other_block.id,
            code="other-instruction",
            label="Инструкция другого блока",
            field_type="static_text",
            options_config_json={"static_text": "Не раскрывать для выбранного блока"},
            public_visible=True,
            public_editable=False,
        )
        template = setup_session.get(CardTemplate, card.card_template_id)
        assert template is not None
        template.field_schema_json = {
            **template.field_schema_json,
            "field_ids": [
                *template.field_schema_json["field_ids"],
                str(selected_static.id),
                str(other_static.id),
            ],
            "form_layout": {
                "columns": 12,
                "sections": [
                    {
                        "id": "selected-public-block",
                        "block_id": str(selected_block.id),
                        "row": 1,
                        "column": 1,
                        "row_span": 2,
                        "column_span": 12,
                        "items": [
                            {
                                "id": "selected-value",
                                "kind": "field",
                                "field_id": str(review_api_fixture.field_id),
                                "row": 1,
                                "column": 1,
                                "row_span": 1,
                                "column_span": 6,
                            },
                            {
                                "id": "selected-instruction",
                                "kind": "field",
                                "field_id": str(selected_static.id),
                                "row": 2,
                                "column": 1,
                                "row_span": 1,
                                "column_span": 12,
                            },
                        ],
                    },
                    {
                        "id": "other-public-block",
                        "block_id": str(other_block.id),
                        "row": 3,
                        "column": 1,
                        "row_span": 1,
                        "column_span": 12,
                        "items": [
                            {
                                "id": "other-instruction",
                                "kind": "field",
                                "field_id": str(other_static.id),
                                "row": 1,
                                "column": 1,
                                "row_span": 1,
                                "column_span": 12,
                            }
                        ],
                    },
                ],
            },
        }
        CardPublicAccessService(setup_session).update_for_actor(
            actor_user_id=review_api_fixture.admin_id,
            card_id=card.id,
            payload=CardPublicAccessUpdate(
                fields=[
                    CardPublicFieldSettingUpdate(
                        field_id=review_api_fixture.field_id,
                        public_visible=True,
                        public_editable=True,
                    ),
                    CardPublicFieldSettingUpdate(
                        field_id=review_api_fixture.other_field_id,
                        public_visible=False,
                        public_editable=False,
                    ),
                    CardPublicFieldSettingUpdate(
                        field_id=review_api_fixture.non_editable_field_id,
                        public_visible=False,
                        public_editable=False,
                    ),
                    CardPublicFieldSettingUpdate(
                        field_id=selected_static.id,
                        public_visible=True,
                        public_editable=False,
                    ),
                    CardPublicFieldSettingUpdate(
                        field_id=other_static.id,
                        public_visible=False,
                        public_editable=False,
                    ),
                ],
            ),
        )
        setup_session.commit()
        selected_static_id = selected_static.id
        other_static_id = other_static.id

    def create_and_preview(payload: dict[str, list[str]]) -> tuple[dict[str, object], str]:
        created_response = transactional_api_client.post(
            f"/api/v1/cards/{review_api_fixture.card_id}/public-links",
            json=payload,
            headers=_actor_headers(review_api_fixture.admin_id),
        )
        assert created_response.status_code == 201, created_response.text
        raw_token = created_response.json()["raw_token"]
        preview_response = transactional_api_client.post(
            "/api/v1/public-links/preview",
            json={"raw_token": raw_token},
        )
        assert preview_response.status_code == 200, preview_response.text
        return preview_response.json(), raw_token

    explicit_preview, explicit_token = create_and_preview(
        {
            "allowed_block_ids": [str(review_api_fixture.block_id)],
            "allowed_field_ids": [str(review_api_fixture.field_id)],
        }
    )
    explicit_serialized = json.dumps(explicit_preview, ensure_ascii=False)
    assert str(selected_static_id) in explicit_serialized
    assert "Заполните выбранный блок" in explicit_serialized
    assert str(other_static_id) not in explicit_serialized
    denied_static_edit = transactional_api_client.post(
        "/api/v1/public-links/edit",
        json={
            "raw_token": explicit_token,
            "field_id": str(selected_static_id),
            "value": "Нельзя изменить",
        },
    )
    assert denied_static_edit.status_code == 403, denied_static_edit.text

    field_only_preview, _ = create_and_preview(
        {"allowed_field_ids": [str(review_api_fixture.field_id)]}
    )
    field_only_serialized = json.dumps(field_only_preview, ensure_ascii=False)
    assert str(selected_static_id) in field_only_serialized
    assert str(other_static_id) not in field_only_serialized

    legacy_preview, _ = create_and_preview({})
    legacy_serialized = json.dumps(legacy_preview, ensure_ascii=False)
    assert str(selected_static_id) in legacy_serialized
    assert str(other_static_id) not in legacy_serialized


def test_public_link_lifecycle_api_flow_and_closed_status_privacy(
    transactional_api_client: TestClient,
    review_api_fixture: ReviewApiFixture,
) -> None:
    admin_headers = _actor_headers(review_api_fixture.admin_id)
    created_response = transactional_api_client.post(
        f"/api/v1/cards/{review_api_fixture.card_id}/public-links",
        json={},
        headers=admin_headers,
    )
    assert created_response.status_code == 201, created_response.text
    created = created_response.json()
    assert created["review_enabled"] is True
    assert "token_hash" not in created
    assert "baseline_snapshot_json" not in created
    raw_token = created["raw_token"]
    public_link_id = UUID(created["id"])

    edit_response = transactional_api_client.post(
        "/api/v1/public-links/edit",
        json={
            "raw_token": raw_token,
            "field_id": str(review_api_fixture.field_id),
            "value": "Первое значение API",
        },
    )
    assert edit_response.status_code == 200, edit_response.text

    submitted_response = transactional_api_client.post(
        "/api/v1/public-links/submit",
        json={"raw_token": raw_token},
    )
    assert submitted_response.status_code == 200, submitted_response.text
    assert submitted_response.json()["status"] == "submitted"
    duplicate_submit = transactional_api_client.post(
        "/api/v1/public-links/submit",
        json={"raw_token": raw_token},
    )
    assert duplicate_submit.status_code == 409, duplicate_submit.text
    assert duplicate_submit.json()["detail"] == ("Недопустимый переход состояния публичной ссылки.")
    assert raw_token not in duplicate_submit.text

    submitted_readonly_detail = (
        "Карточка уже отправлена на проверку. Редактирование временно недоступно."
    )
    submitted_edit = transactional_api_client.post(
        "/api/v1/public-links/edit",
        json={
            "raw_token": raw_token,
            "field_id": str(review_api_fixture.field_id),
            "value": "Не должно сохраниться",
        },
    )
    submitted_attachments = transactional_api_client.post(
        "/api/v1/public-links/attachments",
        json={"raw_token": raw_token},
    )
    for response in [submitted_edit, submitted_attachments]:
        assert response.status_code == 403, response.text
        assert response.json()["detail"] == submitted_readonly_detail
        assert raw_token not in response.text

    review_forbidden_detail = "Недостаточно прав для проверки этой публичной ссылки."
    forbidden_cases = [
        ("GET", f"/api/v1/public-links/{public_link_id}/review", None),
        (
            "POST",
            f"/api/v1/public-links/{public_link_id}/request-changes",
            {"comment": "Недоступное замечание"},
        ),
        ("POST", f"/api/v1/public-links/{public_link_id}/approve", None),
        ("POST", f"/api/v1/public-links/{public_link_id}/start-review-cycle", None),
    ]
    for method, path, payload in forbidden_cases:
        forbidden_response = transactional_api_client.request(
            method,
            path,
            headers=_actor_headers(review_api_fixture.outsider_id),
            json=payload,
        )
        assert forbidden_response.status_code == 403, forbidden_response.text
        assert forbidden_response.json()["detail"] == review_forbidden_detail
        assert raw_token not in forbidden_response.text
    review_response = transactional_api_client.get(
        f"/api/v1/public-links/{public_link_id}/review",
        headers=admin_headers,
    )
    assert review_response.status_code == 200, review_response.text
    review = review_response.json()
    assert review["changed_field_count"] == 1
    reviewed_field = next(
        field for field in review["fields"] if field["field_id"] == str(review_api_fixture.field_id)
    )
    assert reviewed_field["before"] is None
    assert reviewed_field["after"] == "Первое значение API"
    serialized_review = json.dumps(review, ensure_ascii=False)
    for forbidden_key in {
        "raw_token",
        "token_hash",
        "baseline_snapshot_json",
        "storage_key",
        "checksum_sha256",
        "stored_file_id",
    }:
        assert forbidden_key not in serialized_review

    changes_response = transactional_api_client.post(
        f"/api/v1/public-links/{public_link_id}/request-changes",
        json={"comment": "Уточните значение"},
        headers=admin_headers,
    )
    assert changes_response.status_code == 200, changes_response.text
    assert changes_response.json()["status"] == "changes_requested"
    status_after_changes = transactional_api_client.post(
        "/api/v1/public-links/status",
        json={"raw_token": raw_token},
    )
    assert status_after_changes.status_code == 200, status_after_changes.text
    assert status_after_changes.json()["review_comment"] == "Уточните значение"

    second_edit = transactional_api_client.post(
        "/api/v1/public-links/edit",
        json={
            "raw_token": raw_token,
            "field_id": str(review_api_fixture.field_id),
            "value": "Исправленное значение API",
        },
    )
    assert second_edit.status_code == 200, second_edit.text
    assert (
        transactional_api_client.post(
            "/api/v1/public-links/submit",
            json={"raw_token": raw_token},
        ).status_code
        == 200
    )

    approved_response = transactional_api_client.post(
        f"/api/v1/public-links/{public_link_id}/approve",
        headers=admin_headers,
    )
    assert approved_response.status_code == 200, approved_response.text
    assert approved_response.json()["status"] == "approved"
    closed_status_response = transactional_api_client.post(
        "/api/v1/public-links/status",
        json={"raw_token": raw_token},
    )
    assert closed_status_response.status_code == 200, closed_status_response.text
    closed_status = closed_status_response.json()
    assert set(closed_status) == {
        "status",
        "can_edit",
        "submitted_at",
        "reviewed_at",
        "review_comment",
        "completed_public_fields",
        "total_public_fields",
    }
    assert closed_status["status"] == "approved"
    assert closed_status["can_edit"] is False
    assert closed_status["review_comment"] is None
    assert closed_status["completed_public_fields"] is None
    assert closed_status["total_public_fields"] is None
    assert raw_token not in closed_status_response.text
    assert (
        transactional_api_client.post(
            "/api/v1/public-links/preview",
            json={"raw_token": raw_token},
        ).status_code
        == 403
    )

    legacy_response = transactional_api_client.post(
        f"/api/v1/cards/{review_api_fixture.card_id}/public-links",
        json={"review_enabled": False},
        headers=admin_headers,
    )
    assert legacy_response.status_code == 201, legacy_response.text
    legacy = legacy_response.json()
    assert legacy["review_enabled"] is False
    started_response = transactional_api_client.post(
        f"/api/v1/public-links/{legacy['id']}/start-review-cycle",
        headers=admin_headers,
    )
    assert started_response.status_code == 200, started_response.text
    assert started_response.json()["review_enabled"] is True
    started_again = transactional_api_client.post(
        f"/api/v1/public-links/{legacy['id']}/start-review-cycle",
        headers=admin_headers,
    )
    assert started_again.status_code == 409, started_again.text

    listed_response = transactional_api_client.get(
        f"/api/v1/cards/{review_api_fixture.card_id}/public-links",
        headers=admin_headers,
    )
    assert listed_response.status_code == 200, listed_response.text
    listed_payload = json.dumps(listed_response.json(), ensure_ascii=False)
    assert raw_token not in listed_payload
    assert "baseline_snapshot_json" not in listed_payload
