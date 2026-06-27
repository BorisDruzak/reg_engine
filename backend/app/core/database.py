from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings


def get_database_url() -> str | None:
    return get_settings().database_url


def create_database_engine(database_url: str | None = None) -> Engine:
    resolved_url = database_url or get_database_url()
    if not resolved_url:
        raise RuntimeError("DATABASE_URL is not configured.")
    return create_engine(resolved_url, pool_pre_ping=True)


def create_session_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_session() -> Generator[Session, None, None]:
    engine = create_database_engine()
    session_factory = create_session_factory(engine)
    with session_factory() as session:
        yield session
