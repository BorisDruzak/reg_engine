import os
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, select, text
from sqlalchemy.engine import Engine, make_url
from sqlalchemy.orm import Session

from app.models import AuditEvent
from app.services.audit import AuditRetentionService


def _require_test_database_url() -> str:
    database_url = os.environ.get("TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("TEST_DATABASE_URL is required for disposable PostgreSQL retention tests.")

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
    finally:
        if previous_url is None:
            os.environ.pop("TEST_DATABASE_URL", None)
        else:
            os.environ["TEST_DATABASE_URL"] = previous_url

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


def _event(*, created_at: datetime, retention_class: str) -> AuditEvent:
    return AuditEvent(
        actor_type="system",
        action="maintenance",
        object_type="system",
        source="system",
        retention_class=retention_class,
        created_at=created_at,
    )


def test_delete_expired_events_uses_independent_history_and_technical_cutoffs(
    db_session: Session,
) -> None:
    now = datetime(2026, 7, 16, 9, 0, tzinfo=UTC)
    expired_history = _event(
        created_at=now - timedelta(days=14, microseconds=1),
        retention_class="card_history",
    )
    exact_history_cutoff = _event(
        created_at=now - timedelta(days=14),
        retention_class="card_history",
    )
    expired_technical = _event(
        created_at=now - timedelta(days=3, microseconds=1),
        retention_class="technical",
    )
    exact_technical_cutoff = _event(
        created_at=now - timedelta(days=3),
        retention_class="technical",
    )
    db_session.add_all(
        [expired_history, exact_history_cutoff, expired_technical, exact_technical_cutoff]
    )
    db_session.flush()

    deleted = AuditRetentionService(db_session).delete_expired_events(now=now)

    assert deleted == 2
    remaining_ids = set(db_session.scalars(select(AuditEvent.id)).all())
    assert expired_history.id not in remaining_ids
    assert expired_technical.id not in remaining_ids
    assert exact_history_cutoff.id in remaining_ids
    assert exact_technical_cutoff.id in remaining_ids
